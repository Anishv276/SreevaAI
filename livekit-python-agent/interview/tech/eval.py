"""
eval_pipeline.py
Scores the candidate's answer on the current topic.
Returns: scores, one signal + reason, saturation state, action (PROBE/MOVE_ON).

Architecture:
  evaluate_answer()   — two parallel LLM calls: scores answer, detects ONE signal with reason
  TopicState          — per-topic saturation tracking (NO ladder, level-based thresholds)
  run_eval_and_build_directive() — orchestrates everything, returns result dict to agent

Signal taxonomy (universal, 8 content + 3 response shape — see scoring.py):
  Response-shape: clarification_request, rephrase_request, off_topic
  Content (positive): depth_mastered, depth_clear, depth_applied, recovery_attempted
  Content (gap): depth_shallow, depth_generic
  Content (negative): depth_misconception, pure_denial

Flow rules:
  pure_denial streak → 2 consecutive = MOVE_ON (topic_floor_reached)
  off_topic → REDIRECT (re-ask), does not advance saturation
  clarification_request → REPHRASE (re-ask clearer), does not advance saturation
  rephrase_request → ACCEPT_REPHRASE (listen to redo), does not advance saturation
  weak_exit (turn 3/4) → MOVE_ON if sat is too low at those checkpoints
  dry_topic → 2 consecutive zero scores → MOVE_ON
  saturated → MOVE_ON
"""
from __future__ import annotations
import re
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

from interview.tech.scoring import evaluate_answer, NON_FOLLOWUP_SIGNALS, DENIAL_SIGNALS
from interview.slack_error_logger import log_llm_error

logger = logging.getLogger("interview-agent")

_NO_NEW_QUESTION_CUTOFF_SECONDS: int = 45

# ---------------------------------------------------------------------------
# Level-aware saturation thresholds -- one threshold per level, every topic
# held to the same bar (no CRITICAL/HIGH/MEDIUM/LOW importance tiering).
# ---------------------------------------------------------------------------
_LEVEL_SATURATION: dict[int, dict]= {
    1: {"threshold": 5.0, "base_credit": 1.1},
    2: {"threshold": 5.5, "base_credit": 0.9},
    3: {"threshold": 7.0, "base_credit": 0.8},
    4: {"threshold": 8.5, "base_credit": 0.7},
}


# ---------------------------------------------------------------------------
# TopicState -- per-topic saturation tracking (ladder-free)
# ---------------------------------------------------------------------------
class TopicState:
    """Level-based topic saturation tracker. No ladder rungs, no stages.
    Flow is driven by signal quality and saturation score vs threshold.
    """

    def __init__(self, topic_name: str, updated_turn: int = 0, level: int = 2):
        self.topic_name = topic_name
        self.level = level
        self.updated_turn = updated_turn

        _cfg = _LEVEL_SATURATION.get(level, _LEVEL_SATURATION[2])
        self.saturation_threshold: float = _cfg["threshold"]
        self.base_turn_credit: float = _cfg["base_credit"]

        self.saturation_score = 0.0
        self.follow_up_turns = 0
        self.is_saturated = False
        self.opened_at_turn = 0
        self.signals_fired: list[str] = []

        # Dry-topic: if two consecutive answers score 0, candidate is stuck on this topic.
        self.last_score = None
        self.consecutive_zero_scores = 0

        # pure_denial streak: 2 consecutive pure_denial signals close the topic
        self.consecutive_denials: int = 0
        self.closed_on_denials: bool = False

        # Response signal tracking: if clarification_request fires 3 times, escalate to MOVE_ON
        self.clarification_request_count = 0

        # Sub-concept rotation: advances so consecutive follow-ups hit different
        # items from the topic's probe_focus list.
        self.probe_rotation_index = 0

    # Weak-exit checkpoints:
    #   turn 3: sat < 50% of threshold -> MOVE_ON now.
    #   turn 5: always MOVE_ON -- hard cap.
    _WEAK_EXIT_TURN3_PCT: float = 0.50
    _HARD_CAP_TURNS: int = 5

    def is_weak_candidate_exit(self) -> bool:
        if self.saturation_threshold <= 0:
            return False
        if self.follow_up_turns < 3:
            return False
        sat_pct = self.saturation_score / self.saturation_threshold
        if self.follow_up_turns == 3:
            return sat_pct < self._WEAK_EXIT_TURN3_PCT
        return self.follow_up_turns >= self._HARD_CAP_TURNS

    def is_dry_topic(self) -> bool:
        """Two CONSECUTIVE answers with score 0 -> candidate is stuck, move on."""
        return self.consecutive_zero_scores >= 2

    def should_exit_on_denials(self) -> bool:
        """Single pure_denial signal -> close the topic."""
        return self.consecutive_denials >= 1


    def add_contribution(self, weighted: float, signal: str | None, turn: int | None = None) -> None:
        # Re-ask turns (candidate asked to rephrase, restarted their own answer, or
        # answered a different question) don't count as a real follow-up. Skip all
        # scoring/counter updates so the candidate isn't penalised for asking us to
        # repeat the question.
        if signal in NON_FOLLOWUP_SIGNALS:
            if turn is not None:
                self.updated_turn = turn
            return

        contribution = max(0.0, _score_to_contribution(weighted))
        if weighted >= 3.0:
            effective_base = self.base_turn_credit
        elif weighted >= 1.0:
            effective_base = self.base_turn_credit * (weighted - 1.0) / 2.0
        else:
            effective_base = 0.0
        self.saturation_score += effective_base + contribution
        self.follow_up_turns += 1
        self.is_saturated = self.saturation_score >= self.saturation_threshold
        if weighted == 0.0:
            self.consecutive_zero_scores += 1
        else:
            self.consecutive_zero_scores = 0
        if signal:
            self.signals_fired.append(signal)
        self.last_score = weighted
        if turn is not None:
            self.updated_turn = turn

        # pure_denial streak: single occurrence -> close topic
        if signal in DENIAL_SIGNALS:
            self.consecutive_denials += 1
            if self.consecutive_denials >= 1:
                self.closed_on_denials = True
        else:
            self.consecutive_denials = 0

    def to_dict(self) -> dict:
        return {
            "topic_name":          self.topic_name,
            "level":               self.level,
            "saturation_threshold":self.saturation_threshold,
            "saturation_score":    round(self.saturation_score, 2),
            "follow_up_turns":     self.follow_up_turns,
            "base_turn_credit":    self.base_turn_credit,
            "signals_fired":       self.signals_fired,
            "is_saturated":        self.is_saturated,
            "updated_turn":        self.updated_turn,
            "last_score":          self.last_score,
            "clarification_request_count": self.clarification_request_count,
            "consecutive_zero_scores": self.consecutive_zero_scores,
            "consecutive_denials": self.consecutive_denials,
            "closed_on_denials":   self.closed_on_denials,
            "probe_rotation_index": self.probe_rotation_index,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "TopicState":
        obj = cls(
            topic_name=str(d.get("topic_name", "")),
            updated_turn=int(d.get("updated_turn", 0) or 0),
            level=int(d.get("level", 2) or 2),
        )
        obj.saturation_score    = float(d.get("saturation_score", 0.0) or 0.0)
        obj.follow_up_turns     = int(d.get("follow_up_turns", 0) or 0)
        obj.is_saturated        = bool(d.get("is_saturated", False))
        obj.signals_fired       = list(d.get("signals_fired", []) or [])
        obj.opened_at_turn      = int(d.get("opened_at_turn", 0) or 0)
        obj.last_score          = float(d.get("last_score")) if d.get("last_score") is not None else None
        obj.clarification_request_count = int(d.get("clarification_request_count", 0) or 0)
        obj.consecutive_zero_scores = int(d.get("consecutive_zero_scores", 0) or 0)
        obj.consecutive_denials = int(d.get("consecutive_denials", 0) or 0)
        obj.closed_on_denials   = bool(d.get("closed_on_denials", False))
        obj.probe_rotation_index = int(d.get("probe_rotation_index", 0) or 0)
        if "saturation_threshold" in d:
            obj.saturation_threshold = float(d["saturation_threshold"])
        if "base_turn_credit" in d:
            obj.base_turn_credit = float(d["base_turn_credit"])
        return obj


def _weighted_score(quality: dict) -> float:
    # Weights must match the "overall" formula in agent_scoring.py -- kept in sync
    # so the logged/scored value and the saturation-driving value never diverge.
    return (
        quality.get("clarity", 0.0) * 0.20
        + quality.get("depth", 0.0) * 0.35
        + quality.get("specificity", 0.0) * 0.20
        + quality.get("grounding", 0.0) * 0.25
    )


def _score_to_contribution(weighted: float) -> float:
    return min(3.5, max(0.0, (weighted - 2.0) / 8.0 * 3.5))


def _normalize_topic_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


# ---------------------------------------------------------------------------
# Pydantic input schema
# ---------------------------------------------------------------------------
class EvaluationPayload(BaseModel):
    app_id: str
    turn: int
    answer: str
    question: str
    transcript_lines: List[str] = Field(default_factory=list)
    score_history: List[Any] = Field(default_factory=list)
    turns_since_decay: int = 999
    response_latency_sec: Optional[float] = None
    question_asked_at_wall_ms: int = 0  # epoch ms; correlates proctoring events to the active question
    signal_toggles: Dict[str, Any] = Field(default_factory=dict)
    org_id: str = ""
    llm_model: str
    active_topic: Optional[str] = None
    active_topic_state: Optional[Dict[str, Any]] = None
    anchor_item: Optional[str] = None
    job_title: str = "the role"
    remaining_seconds: float = 999.0
    candidate_name: str = "?"
    level: int = 2
    time_limit_mins: int = 20
    topic_score_history: List[float] = Field(default_factory=list)
    topic_depth_history: List[float] = Field(default_factory=list)
    ai_question_this_turn: str = ""
    topic_tag: str = "RESUME_TOPIC"
    topic_probe_focus: str = ""
    topic_why_relevant: str = ""
    question_type: str = "mechanism"  # type of question asked: mechanism | definition | difference |
    # failure_mode | tradeoff_debate | scenario | code_trace | snippet_eval | query_trace | followup
    model_config = {"extra": "allow"}


# ---------------------------------------------------------------------------
# Main eval function
# ---------------------------------------------------------------------------
async def run_eval_and_build_directive(payload: dict, client: AsyncOpenAI) -> dict:
    """
    Scores the candidate's answer and detects one signal with reason.
    Returns action (PROBE/MOVE_ON), signal+reason, saturation state.
    Agent owns topic selection, directive building, and next-topic picking.
    """
    p = EvaluationPayload(**payload)

    # -- Restore or create TopicState -----------------------------------------
    current_topic_state: Optional[TopicState] = None
    if p.active_topic and p.active_topic_state:
        current_topic_state = TopicState.from_dict(p.active_topic_state)
        logger.info(
            "[TOPIC_STATE] RESTORED | topic=%s | score=%.1f/%.1f follow_ups=%d",
            current_topic_state.topic_name,
            current_topic_state.saturation_score, current_topic_state.saturation_threshold,
            current_topic_state.follow_up_turns,
        )
    elif p.active_topic:
        current_topic_state = TopicState(p.active_topic, updated_turn=p.turn, level=p.level)
        logger.info(
            "[TOPIC_STATE] CREATED | topic=%s tag=%s level=%s | threshold=%.1f",
            p.active_topic, p.topic_tag, p.level,
            current_topic_state.saturation_threshold,
        )

    _sat_pct = 0
    if current_topic_state:
        _sat_pct = 100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold)
    logger.info(
        "[TURN] turn=%d | topic=%s | sat=%.0f%% (%.1f/%.1f) | remaining=%.0fs",
        p.turn, p.active_topic or "?", _sat_pct,
        current_topic_state.saturation_score if current_topic_state else 0,
        current_topic_state.saturation_threshold if current_topic_state else 0,
        p.remaining_seconds,
    )
    logger.info("[QA] turn=%d  Q: %s\n              A: %s",
                p.turn, (p.question or "")[:200], (p.answer or "")[:200])

    # -- Run scoring (two parallel LLM calls: score + signal) -----------------
    _captured_usage: list[dict] = []

    async def _score_and_capture(**kwargs):
        result = await evaluate_answer(**kwargs)
        usage = result.pop("_llm_usage", None)
        # evaluate_answer returns a list of up to 2 usage dicts (score call + signal
        # call) on the success path, or a single dict/None on the short-circuit paths.
        usages = usage if isinstance(usage, list) else ([usage] if usage else [])
        for u in usages:
            if u.get("inputTokens") or u.get("outputTokens"):
                _captured_usage.append(u)
        return result

    _follow_up_count = (current_topic_state.follow_up_turns + 1) if current_topic_state else 0

    try:
        raw = await _score_and_capture(
            candidate_answer=p.answer,
            last_question=p.question,
            topic_follow_up_count=_follow_up_count,
            transcript_lines=p.transcript_lines,
            client=client,
            org_id=p.org_id,
            llm_model=p.llm_model,
            active_topic=p.active_topic or "",
            level=p.level,
            topic_probe_focus=p.topic_probe_focus,
            job_title=p.job_title,
            question_type=p.question_type,
        )
    except Exception as ex:
        # Step 0 instrumentation: this except must only ever catch a genuine
        # scoring-call failure (LLM timeout/error, malformed response). A
        # TypeError here almost always means a stale/mismatched call-site
        # signature (e.g. a removed kwarg from evaluate_answer's signature)
        # -- that bug makes EVERY turn fall back regardless of answer
        # quality, which is indistinguishable from a real outage unless the
        # exception type/message and the actual answer text are logged.
        logger.error(
            "[EVAL_FALLBACK] turn=%d | scoring failed: %s: %s | answer=%r | recovery decision applied",
            p.turn, type(ex).__name__, ex, (p.answer or "")[:300],
        )
        try:
            await log_llm_error(
                app_id=p.app_id,
                org_name=p.org_id,
                candidate_name=None,
                provider="openai",
                error=str(ex),
                reason="Turn scoring LLM call failed/timed out — recovery fallback applied",
                context={"turn": p.turn},
            )
        except Exception:
            pass
        raw = {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0, "overall": 1.3,
            "action": "PROBE", "signal": "depth_shallow",
            "signal_reason": f"eval recovery — scoring call raised {type(ex).__name__} ({str(ex)[:120]})",
            "reason": "eval recovery",
        }


    # -- Extract results -------------------------------------------------------
    quality = {k: raw.get(k, 0.0) for k in ("clarity", "depth", "specificity", "grounding")}
    _weighted = _weighted_score(quality)
    action: str = str(raw.get("action", "PROBE")).upper()
    valid_actions = ("PROBE", "MOVE_ON", "REPHRASE", "REDIRECT", "ACCEPT_REPHRASE", "CAP_SCORES")
    if action not in valid_actions:
        action = "PROBE"
    # forced_action = deterministic short-circuit (response signals: pure_denial/clarification_request/etc)
    # Response signals override saturation logic (don't need to check dry_topic/weak_exit if pure_denial fires).
    forced_action = bool(raw.get("forced_action"))
    _forced_response_signal = forced_action and action in ("MOVE_ON", "REPHRASE", "REDIRECT", "ACCEPT_REPHRASE")

    signal: str | None = raw.get("signal")
    signal_reason: str | None = raw.get("signal_reason")

    depth_signal = "DEEP" if _weighted >= 7.0 else "SPECIFIC" if _weighted >= 5.0 else "SURFACE"

    logger.info(
        "[QUALITY] turn=%d | clarity=%.1f depth=%.1f specificity=%.1f grounding=%.1f | weighted=%.2f %s",
        p.turn, quality["clarity"], quality["depth"],
        quality["specificity"], quality["grounding"], _weighted, depth_signal,
    )
    logger.info("[EVAL] turn=%d action=%s signal=%s weighted=%.2f",
                p.turn, action, signal, _weighted)
    if signal:
        logger.info("[SIGNAL] %s | reason=%r", signal, signal_reason)

    # -- Track response signal patterns -----------------------------------------------
    # If clarification_request fires 3 times in a row, escalate to MOVE_ON (question is
    # unclear or candidate confused). Below 3, always rephrase -- 2 genuine "didn't catch
    # that" moments on the same topic is normal and must not skip the topic.
    if current_topic_state and signal == "clarification_request":
        current_topic_state.clarification_request_count += 1
    elif current_topic_state and signal != "clarification_request":
        # Reset counter on any other signal
        current_topic_state.clarification_request_count = 0

    # -- Update saturation state ----------------------------------------------
    if current_topic_state:
        current_topic_state.add_contribution(_weighted, signal, turn=p.turn)

    # Part C.2: decide whether the sub-concept rotation may advance next turn
    # (concept_cleared / concept_gap_repeated). Computed from THIS turn's
    # signal (the answer just scored) so agent_runtime's probe_rotation_index
    # increment can be made conditional on it, instead of unconditionally
    # advancing every PROBE turn regardless of whether the current
    # sub-concept's gap actually resolved. Only meaningful when action ends up
    # PROBE -- MOVE_ON discards rotation state for this topic entirely.
    _should_rotate_subconcept = True  # rotation is now always allowed; probe_rotation_index in agent_runtime handles diversity

    is_saturated = current_topic_state.is_saturated if current_topic_state else False
    _weak_exit = current_topic_state is not None and current_topic_state.is_weak_candidate_exit()
    _dry_topic = current_topic_state is not None and current_topic_state.is_dry_topic()
    _denial_exit = current_topic_state is not None and current_topic_state.should_exit_on_denials()

    sat_score = current_topic_state.saturation_score if current_topic_state else 0.0
    sat_threshold = current_topic_state.saturation_threshold if current_topic_state else 0.0
    remaining = sat_threshold - sat_score
    pct_done = 100 * min(1.0, sat_score / sat_threshold) if sat_threshold > 0 else 0

    if is_saturated:
        logger.info("[SAT] SATURATED | score=%.1f >= threshold=%.1f (%.0f%%)", sat_score, sat_threshold, pct_done)
    else:
        logger.info("[SAT] %.0f%% done | score=%.1f need %.1f more", pct_done, sat_score, remaining)

    # Decision block: signal priority, then saturation checks
    _escalate_to_move_on = False
    if _denial_exit:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=topic_floor_reached (pure_denial) turn=%d", p.turn)
    elif _forced_response_signal and current_topic_state:
        if action == "REPHRASE" and current_topic_state.clarification_request_count >= 3:
            action = "MOVE_ON"
            _escalate_to_move_on = True
            logger.info("[DECISION] MOVE_ON reason=clarification_escalation (asked 3x) turn=%d", p.turn)
        else:
            logger.info("[DECISION] %s (forced response signal) reason=%s turn=%d", action, raw.get("reason", "forced"), p.turn)
    elif _forced_response_signal:
        logger.info("[DECISION] %s (forced response signal) reason=%s turn=%d", action, raw.get("reason", "forced"), p.turn)
    elif not _escalate_to_move_on and _dry_topic:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=dry_topic (two consecutive zero scores) turn=%d", p.turn)
    elif _weak_exit:
        action = "MOVE_ON"
        logger.info(
            "[DECISION] MOVE_ON reason=weak_exit (turn=%d sat=%.0f%%)",
            current_topic_state.follow_up_turns if current_topic_state else p.turn,
            (sat_score / sat_threshold * 100) if sat_threshold > 0 else 0,
        )
    elif is_saturated:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=saturated turn=%d", p.turn)
    else:
        action = "PROBE"

    if action == "PROBE":
        pct_sat = 100 * min(1.0, sat_score / sat_threshold) if sat_threshold > 0 else 0
        logger.info("[DECISION] PROBE signal=%s sat=%.0f%% turn=%d",
                    signal or "none", pct_sat, p.turn)

    # -- Quality record for DB ------------------------------------------------
    quality_record = {
        "turn":                    p.turn,
        "question":                p.question,
        "answer":                  p.answer,
        "clarity":                 quality["clarity"],
        "depth":                   quality["depth"],
        "specificity":             quality["specificity"],
        "grounding":               quality["grounding"],
        "overall":                 _weighted,
        "signal":                  signal,
        "signal_reason":           signal_reason,
        "topic":                   p.active_topic or "general",
        "topic_saturation_score":  sat_score,
        "topic_saturation_threshold": sat_threshold,
        "response_latency_sec":    p.response_latency_sec,
        "question_asked_at_wall_ms": p.question_asked_at_wall_ms,
        "action":                  action,
        "level":                   p.level,
        "is_saturated":            is_saturated,
        "weak_exit":               _weak_exit,
        "dry_topic":               _dry_topic,
        "topic_follow_ups":        _follow_up_count,
    }

    logger.info("[RESULT] turn=%d action=%s quality=%.2f/%s signal=%s sat=%.1f/%.1f",
                p.turn, action, _weighted, depth_signal,
                signal, sat_score, sat_threshold)

    return {
        "action":        action,
        "signal":        signal,
        "signal_reason": signal_reason,
        "quality_record":quality_record,
        "depth_signal":  depth_signal,
        "saturation": {
            "score":        sat_score,
            "threshold":    sat_threshold,
            "follow_up_turns": current_topic_state.follow_up_turns if current_topic_state else 0,
            "is_saturated": is_saturated,
            "weak_exit":    _weak_exit,
            "dry_topic":    _dry_topic,
            "topic_state_dict": current_topic_state.to_dict() if current_topic_state else None,
        },
        "eval_llm_usages": list(_captured_usage),
        "turn":    p.turn,
        "app_id":  p.app_id,
    }
