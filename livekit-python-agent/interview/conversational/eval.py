"""
interview/conversational/eval.py
Scores the candidate's answer on the current topic (sales module).
Returns: scores, one signal + reason, saturation state, action (PROBE/MOVE_ON).

Identical orchestration to interview.tech.eval -- TopicState, saturation math,
and run_eval_and_build_directive are domain-independent (they operate on the
generic clarity/depth/specificity/grounding scores, not on what produced
them). The only difference is which evaluate_answer() is called.
"""
from __future__ import annotations
import asyncio
import re
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

from interview.conversational.scoring import evaluate_answer
from interview.slack_error_logger import log_llm_error

logger = logging.getLogger("interview-agent")

_NO_NEW_QUESTION_CUTOFF_SECONDS: int = 45

# ---------------------------------------------------------------------------
# Level-aware saturation thresholds -- identical to tech mode: one threshold
# per level, every topic held to the same bar (no importance tiering).
# ---------------------------------------------------------------------------
_LEVEL_SATURATION: dict[int, dict] = {
    1: {"threshold": 5.0, "base_credit": 1.1},
    2: {"threshold": 5.5, "base_credit": 0.9},
    3: {"threshold": 7.0, "base_credit": 0.8},
    4: {"threshold": 8.5, "base_credit": 0.7},
}


class TopicState:
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

        self.last_score = None
        self.consecutive_zero_scores = 0

        self.clarification_request_count = 0
        self.probe_rotation_index = 0

    def is_weak_candidate_exit(self) -> bool:
        if self.saturation_threshold <= 0:
            return False
        sat_pct = self.saturation_score / self.saturation_threshold
        return (
            (self.follow_up_turns >= 3 and sat_pct < 0.50) or
            (self.follow_up_turns >= 5 and sat_pct < 1.00)
        )

    def is_dry_topic(self) -> bool:
        return self.consecutive_zero_scores >= 2

    _NON_FOLLOWUP_SIGNALS = frozenset({
        "clarification_request",
        "rephrase_request",
        "off_topic",
    })

    def add_contribution(self, weighted: float, signal: str | None, turn: int | None = None) -> None:
        if signal in self._NON_FOLLOWUP_SIGNALS:
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
        obj.probe_rotation_index = int(d.get("probe_rotation_index", 0) or 0)
        if "saturation_threshold" in d:
            obj.saturation_threshold = float(d["saturation_threshold"])
        if "base_turn_credit" in d:
            obj.base_turn_credit = float(d["base_turn_credit"])
        return obj



def _weighted_score(quality: dict) -> float:
    # Weights must match the "overall" formula in conversational/scoring.py.
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


class EvaluationPayload(BaseModel):
    app_id: str
    turn: int
    answer: str
    question: str
    transcript_lines: List[str] = Field(default_factory=list)
    score_history: List[Any] = Field(default_factory=list)
    turns_since_decay: int = 999
    response_latency_sec: Optional[float] = None
    question_asked_at_wall_ms: int = 0
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
    model_config = {"extra": "allow"}


async def run_eval_and_build_directive(payload: dict, client: AsyncOpenAI) -> dict:
    """
    Scores the candidate's answer and detects one signal with reason (sales
    module). Returns action (PROBE/MOVE_ON), signal+reason, saturation state.
    Agent owns topic selection, directive building, and next-topic picking.
    """
    p = EvaluationPayload(**payload)

    current_topic_state: Optional[TopicState] = None
    if p.active_topic and p.active_topic_state:
        current_topic_state = TopicState.from_dict(p.active_topic_state)
        logger.info(
            "[TOPIC_STATE:sales] RESTORED | topic=%s | score=%.1f/%.1f follow_ups=%d",
            current_topic_state.topic_name,
            current_topic_state.saturation_score, current_topic_state.saturation_threshold,
            current_topic_state.follow_up_turns,
        )
    elif p.active_topic:
        current_topic_state = TopicState(p.active_topic, updated_turn=p.turn, level=p.level)
        logger.info(
            "[TOPIC_STATE:sales] CREATED | topic=%s tag=%s level=%s | threshold=%.1f",
            p.active_topic, p.topic_tag, p.level,
            current_topic_state.saturation_threshold,
        )

    _sat_pct = 0
    if current_topic_state:
        _sat_pct = 100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold)
    logger.info(
        "[TURN:sales] turn=%d | topic=%s | sat=%.0f%% (%.1f/%.1f) | remaining=%.0fs",
        p.turn, p.active_topic or "?", _sat_pct,
        current_topic_state.saturation_score if current_topic_state else 0,
        current_topic_state.saturation_threshold if current_topic_state else 0,
        p.remaining_seconds,
    )
    logger.info("[QA:sales] turn=%d  Q: %s\n              A: %s",
                p.turn, (p.question or "")[:200], (p.answer or "")[:200])

    _captured_usage: list[dict] = []

    async def _score_and_capture(**kwargs):
        result = await evaluate_answer(**kwargs)
        usage = result.pop("_llm_usage", None)
        usages = usage if isinstance(usage, list) else ([usage] if usage else [])
        for u in usages:
            if u.get("inputTokens") or u.get("outputTokens"):
                _captured_usage.append(u)
        return result

    _follow_up_count = (current_topic_state.follow_up_turns + 1) if current_topic_state else 0

    try:
        raw = await asyncio.wait_for(
            _score_and_capture(
                candidate_answer=p.answer,
                last_question=p.question,
                topic_follow_up_count=_follow_up_count,
                transcript_lines=p.transcript_lines,
                client=client,
                org_id=p.org_id,
                llm_model=p.llm_model,
                level=p.level,
                active_topic=p.active_topic or "",
                topic_tag=p.topic_tag,
                topic_probe_focus=p.topic_probe_focus,
                job_title=p.job_title,
                signals_already_fired=current_topic_state.signals_fired if current_topic_state else [],
            ),
            timeout=10.0,
        )
    except (asyncio.TimeoutError, Exception) as ex:
        logger.error("[EVAL:sales] turn=%d | scoring %s — recovery decision",
                     p.turn, "timed out" if isinstance(ex, asyncio.TimeoutError) else f"failed: {ex}")
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
            "action": "PROBE", "signal": "deal_metrics_missing",
            "signal_reason": "eval recovery — answer was too thin to score",
            "reason": "eval recovery",
        }

    quality = {k: raw.get(k, 0.0) for k in ("clarity", "depth", "specificity", "grounding")}
    _weighted = _weighted_score(quality)
    action: str = str(raw.get("action", "PROBE")).upper()
    valid_actions = ("PROBE", "MOVE_ON", "REPHRASE", "REDIRECT", "ACCEPT_REPHRASE", "CAP_SCORES")
    if action not in valid_actions:
        action = "PROBE"
    forced_action = bool(raw.get("forced_action"))
    _forced_response_signal = forced_action and action in ("MOVE_ON", "REPHRASE", "REDIRECT", "ACCEPT_REPHRASE")

    signal: str | None = raw.get("signal")
    signal_reason: str | None = raw.get("signal_reason")

    depth_signal = "DEEP" if _weighted >= 7.0 else "SPECIFIC" if _weighted >= 5.0 else "SURFACE"

    logger.info(
        "[QUALITY:sales] turn=%d | clarity=%.1f depth=%.1f specificity=%.1f grounding=%.1f | weighted=%.2f %s",
        p.turn, quality["clarity"], quality["depth"],
        quality["specificity"], quality["grounding"], _weighted, depth_signal,
    )
    logger.info("[EVAL:sales] turn=%d action=%s signal=%s weighted=%.2f",
                p.turn, action, signal, _weighted)
    if signal:
        logger.info("[SIGNAL:sales] %s | reason=%r", signal, signal_reason)

    if current_topic_state and signal == "clarification_request":
        current_topic_state.clarification_request_count += 1
    elif current_topic_state and signal != "clarification_request":
        current_topic_state.clarification_request_count = 0

    if current_topic_state:
        current_topic_state.add_contribution(_weighted, signal, turn=p.turn)

    is_saturated = current_topic_state.is_saturated if current_topic_state else False
    _weak_exit = current_topic_state is not None and current_topic_state.is_weak_candidate_exit()
    _dry_topic = current_topic_state is not None and current_topic_state.is_dry_topic()

    sat_score = current_topic_state.saturation_score if current_topic_state else 0.0
    sat_threshold = current_topic_state.saturation_threshold if current_topic_state else 0.0
    remaining = sat_threshold - sat_score
    pct_done = 100 * min(1.0, sat_score / sat_threshold) if sat_threshold > 0 else 0

    if is_saturated:
        logger.info("[SAT:sales] SATURATED | score=%.1f >= threshold=%.1f (%.0f%%)", sat_score, sat_threshold, pct_done)
    else:
        logger.info("[SAT:sales] %.0f%% done | score=%.1f need %.1f more", pct_done, sat_score, remaining)

    _escalate_to_move_on = False
    if _forced_response_signal and current_topic_state:
        if action == "REPHRASE" and current_topic_state.clarification_request_count >= 2:
            action = "MOVE_ON"
            _escalate_to_move_on = True
            logger.info("[DECISION:sales] MOVE_ON reason=clarification_escalation (asked 2x) turn=%d", p.turn)
        else:
            logger.info("[DECISION:sales] %s (forced response signal) reason=%s turn=%d", action, raw.get("reason", "forced"), p.turn)
    elif _forced_response_signal:
        logger.info("[DECISION:sales] %s (forced response signal) reason=%s turn=%d", action, raw.get("reason", "forced"), p.turn)
    elif not _escalate_to_move_on and _dry_topic:
        action = "MOVE_ON"
        logger.info("[DECISION:sales] MOVE_ON reason=dry_topic (two consecutive zero scores) turn=%d", p.turn)
    elif _weak_exit:
        action = "MOVE_ON"
        logger.info("[DECISION:sales] MOVE_ON reason=weak_exit turn=%d", p.turn)
    elif is_saturated:
        action = "MOVE_ON"
        logger.info("[DECISION:sales] MOVE_ON reason=saturated turn=%d", p.turn)
    else:
        action = "PROBE"

    if action == "PROBE":
        pct_sat = 100 * min(1.0, sat_score / sat_threshold) if sat_threshold > 0 else 0
        logger.info("[DECISION:sales] PROBE signal=%s sat=%.0f%% turn=%d",
                    signal or "none", pct_sat, p.turn)

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

    logger.info("[RESULT:sales] turn=%d action=%s quality=%.2f/%s signal=%s sat=%.1f/%.1f",
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
