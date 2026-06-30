"""
eval_pipeline.py
Scores the candidate's answer on the current topic.
Returns: scores, one signal + reason, saturation state, action (PROBE/MOVE_ON).

Architecture:
  evaluate_answer()   — single LLM call: scores + detects ONE signal with reason
  TopicState          — per-topic saturation tracking
  run_eval_and_build_directive() — orchestrates everything, returns result dict to agent
"""
from __future__ import annotations
import asyncio
import re
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

from interview.agent_scoring import evaluate_answer
from interview.slack_error_logger import log_llm_error
_EVAL_DEFAULT = "gpt-4.1-mini"  # ponytail: fallback — callers pass org's llmInterviewEval. mini beat nano on signal-detection accuracy — see tests/test_signal_ab.py

logger = logging.getLogger("interview-agent")

_NO_NEW_QUESTION_CUTOFF_SECONDS: int = 45

# ---------------------------------------------------------------------------
# Band-aware saturation thresholds
# ---------------------------------------------------------------------------
_BAND_SATURATION: dict[str, dict[str, dict]] = {
    "fresher": {
        "CRITICAL": {"threshold": 5.5, "base_credit": 1.0},
        "HIGH":     {"threshold": 5.0, "base_credit": 1.0},
        "MEDIUM":   {"threshold": 5.0, "base_credit": 1.2},
        "LOW":      {"threshold": 2.5, "base_credit": 1.4},
    },
    "mid": {
        "CRITICAL": {"threshold": 7.0, "base_credit": 0.8},
        "HIGH":     {"threshold": 5.5, "base_credit": 0.9},
        "MEDIUM":   {"threshold": 4.0, "base_credit": 1.0},
        "LOW":      {"threshold": 3.0, "base_credit": 1.2},
    },
    "experienced": {
        "CRITICAL": {"threshold": 9.0,  "base_credit": 0.7},
        "HIGH":     {"threshold": 7.0,  "base_credit": 0.8},
        "MEDIUM":   {"threshold": 5.0,  "base_credit": 0.9},
        "LOW":      {"threshold": 3.5,  "base_credit": 1.0},
    },
    "senior": {
        "CRITICAL": {"threshold": 11.0, "base_credit": 0.6},
        "HIGH":     {"threshold": 8.5,  "base_credit": 0.7},
        "MEDIUM":   {"threshold": 6.0,  "base_credit": 0.8},
        "LOW":      {"threshold": 4.0,  "base_credit": 0.9},
    },
}


# ---------------------------------------------------------------------------
# TopicState — per-topic saturation tracking
# ---------------------------------------------------------------------------
class TopicState:
    def __init__(self, topic_name: str, importance: str, updated_turn: int = 0, band: str = "mid"):
        self.topic_name = topic_name
        self.importance = importance
        self.band = band
        self.updated_turn = updated_turn

        _band_cfg = _BAND_SATURATION.get(band, _BAND_SATURATION["mid"])
        _cfg = _band_cfg.get(importance, _band_cfg.get("HIGH", {"threshold": 5.5, "base_credit": 0.8}))
        self.saturation_threshold: float = _cfg["threshold"]
        self.base_turn_credit: float = _cfg["base_credit"]

        self.saturation_score = 0.0
        self.follow_up_turns = 0
        self.is_saturated = False
        self.opened_at_turn = 0
        self.signals_fired: list[str] = []

        # Dry-topic exit tracking.
        # consecutive_low_yield: resets on any good answer — catches "I don't know" streaks.
        # total_low_yield: never resets — catches game-players who slip one decent answer in
        #   between repeated weak answers to avoid the consecutive streak firing.
        # cap = 2 for all bands (fresher included: research says freshers need MORE leeway, not less).
        self.consecutive_low_yield = 0
        self.total_low_yield = 0
        self.dry_topic_cap = 2

    # Weak-exit checkpoints per importance: (turn3_floor, turn5_floor).
    # CRITICAL topics need stronger evidence before early exit (more behavioral data points required
    # for role-defining competencies). LOW topics can exit sooner — less decision weight.
    # Source: structured-interview research (Google re:Work, competency-based interview scoring).
    _WEAK_EXIT_BY_IMPORTANCE: dict[str, tuple[float, float]] = {
        "CRITICAL": (0.60, 0.85),
        "HIGH":     (0.55, 0.80),
        "MEDIUM":   (0.50, 0.75),
        "LOW":      (0.40, 0.65),
    }

    def is_weak_candidate_exit(self) -> bool:
        if self.saturation_threshold <= 0:
            return False
        sat_pct = self.saturation_score / self.saturation_threshold
        turn3_floor, turn5_floor = self._WEAK_EXIT_BY_IMPORTANCE.get(
            self.importance, self._WEAK_EXIT_BY_IMPORTANCE["HIGH"]
        )
        return (
            (self.follow_up_turns >= 3 and sat_pct < turn3_floor) or
            (self.follow_up_turns >= 5 and sat_pct < turn5_floor)
        )

    def is_dry_topic(self) -> bool:
        if self.follow_up_turns < self.dry_topic_cap:
            return False
        # Two ways to fire:
        # 1. Consecutive streak: 2 bad answers back-to-back → clearly stuck, exit now.
        # 2. Total burden: 3+ total weak answers regardless of order → game-play (bad/decent/bad/decent/bad)
        #    is caught here even when the streak keeps resetting.
        return (
            self.consecutive_low_yield >= self.dry_topic_cap or
            self.total_low_yield >= 3
        )

    def add_contribution(self, weighted: float, signal: str | None, turn: int | None = None) -> None:
        contribution = max(0.0, _score_to_contribution(weighted))
        effective_base = self.base_turn_credit if contribution > 0.0 else 0.0
        self.saturation_score += effective_base + contribution
        self.follow_up_turns += 1
        self.is_saturated = self.saturation_score >= self.saturation_threshold
        if signal:
            self.signals_fired.append(signal)
        if weighted <= 1.0:
            self.consecutive_low_yield += 1
            self.total_low_yield += 1
        else:
            self.consecutive_low_yield = 0
        if turn is not None:
            self.updated_turn = turn

    def to_dict(self) -> dict:
        return {
            "topic_name":          self.topic_name,
            "importance":          self.importance,
            "band":                self.band,
            "saturation_threshold":self.saturation_threshold,
            "saturation_score":    round(self.saturation_score, 2),
            "follow_up_turns":     self.follow_up_turns,
            "base_turn_credit":    self.base_turn_credit,
            "signals_fired":       self.signals_fired,
            "is_saturated":        self.is_saturated,
            "updated_turn":        self.updated_turn,
            "consecutive_low_yield":self.consecutive_low_yield,
            "total_low_yield":     self.total_low_yield,
            "dry_topic_cap":       self.dry_topic_cap,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "TopicState":
        obj = cls(
            topic_name=str(d.get("topic_name", "")),
            importance=str(d.get("importance", "HIGH")),
            updated_turn=int(d.get("updated_turn", 0) or 0),
            band=str(d.get("band", "mid")),
        )
        obj.saturation_score    = float(d.get("saturation_score", 0.0) or 0.0)
        obj.follow_up_turns     = int(d.get("follow_up_turns", 0) or 0)
        obj.is_saturated        = bool(d.get("is_saturated", False))
        obj.signals_fired       = list(d.get("signals_fired", []) or [])
        obj.opened_at_turn      = int(d.get("opened_at_turn", 0) or 0)
        obj.consecutive_low_yield = int(d.get("consecutive_low_yield", 0) or 0)
        obj.total_low_yield       = int(d.get("total_low_yield", 0) or 0)
        if "dry_topic_cap" in d:
            obj.dry_topic_cap = int(d["dry_topic_cap"])
        if "saturation_threshold" in d:
            obj.saturation_threshold = float(d["saturation_threshold"])
        if "base_turn_credit" in d:
            obj.base_turn_credit = float(d["base_turn_credit"])
        return obj


class TopicImportanceClassifier:
    @staticmethod
    def classify(topic_source: str, is_anchor: bool) -> str:
        if is_anchor:
            return "CRITICAL"
        if topic_source == "resume":
            return "HIGH"
        if topic_source == "skill":
            return "MEDIUM"
        return "LOW"


def _weighted_score(quality: dict) -> float:
    return (
        quality.get("clarity", 0.0) * 0.20
        + quality.get("depth", 0.0) * 0.35
        + quality.get("specificity", 0.0) * 0.30
        + quality.get("grounding", 0.0) * 0.15
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
    signal_toggles: Dict[str, Any] = Field(default_factory=dict)
    org_id: str = ""
    llm_model: str = _EVAL_DEFAULT
    active_topic: Optional[str] = None
    active_topic_state: Optional[Dict[str, Any]] = None
    anchor_item: Optional[str] = None
    job_title: str = "the role"
    remaining_seconds: float = 999.0
    candidate_name: str = "?"
    band: str = "mid"
    time_limit_mins: int = 20
    topic_score_history: List[float] = Field(default_factory=list)
    topic_depth_history: List[float] = Field(default_factory=list)
    ai_question_this_turn: str = ""
    topic_tag: str = "RESUME_TOPIC"
    topic_probe_focus: List[str] = Field(default_factory=list)
    topic_why_relevant: str = ""
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
            "[TOPIC_STATE] RESTORED | topic=%s importance=%s | score=%.1f/%.1f follow_ups=%d",
            current_topic_state.topic_name, current_topic_state.importance,
            current_topic_state.saturation_score, current_topic_state.saturation_threshold,
            current_topic_state.follow_up_turns,
        )
    elif p.active_topic:
        _tag_to_source = {"RESUME_TOPIC": "resume", "JD_TOPIC": "skill", "ROLE_TOPIC": "skill"}
        importance = TopicImportanceClassifier.classify(
            topic_source=_tag_to_source.get(p.topic_tag, "resume"),
            is_anchor=p.active_topic == p.anchor_item,
        )
        current_topic_state = TopicState(p.active_topic, importance, updated_turn=p.turn, band=p.band)
        logger.info(
            "[TOPIC_STATE] CREATED | topic=%s tag=%s importance=%s band=%s | threshold=%.1f",
            p.active_topic, p.topic_tag, importance, p.band,
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

    # -- Run scoring (single LLM call: scores + signal) -----------------------
    _captured_usage: list[dict] = []

    async def _score_and_capture(**kwargs):
        result = await evaluate_answer(**kwargs)
        usage = result.pop("_llm_usage", None)
        if usage and (usage.get("inputTokens") or usage.get("outputTokens")):
            _captured_usage.append(usage)
        return result

    _follow_up_count = (current_topic_state.follow_up_turns + 1) if current_topic_state else 0
    _topic_importance = current_topic_state.importance if current_topic_state else "HIGH"

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
                candidate_band=p.band,
                active_topic=p.active_topic or "",
                topic_importance=_topic_importance,
                topic_tag=p.topic_tag,
                topic_probe_focus=p.topic_probe_focus,
                job_title=p.job_title,
                signals_already_fired=current_topic_state.signals_fired if current_topic_state else [],
            ),
            timeout=10.0,
        )
    except (asyncio.TimeoutError, Exception) as ex:
        logger.error("[EVAL] turn=%d | scoring %s — recovery decision",
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
            "action": "PROBE", "signal": "depth_insufficient",
            "signal_reason": "eval recovery — answer was too thin to score",
            "reason": "eval recovery",
        }

    # -- Extract results -------------------------------------------------------
    quality = {k: raw.get(k, 0.0) for k in ("clarity", "depth", "specificity", "grounding")}
    _weighted = _weighted_score(quality)
    action: str = str(raw.get("action", "PROBE")).upper()
    if action not in ("PROBE", "MOVE_ON"):
        action = "PROBE"
    # forced_action = deterministic short-circuit (warmup/empty/explicit-denial), not
    # the LLM's free-choice judgment -- only this can move on outside dry/weak/saturated.
    _forced_move_on = bool(raw.get("forced_action")) and action == "MOVE_ON"

    signal: str | None = raw.get("signal")
    signal_reason: str | None = raw.get("signal_reason")

    depth_signal = "DEEP" if _weighted >= 7.0 else "SPECIFIC" if _weighted >= 5.0 else "SURFACE"

    logger.info(
        "[QUALITY] turn=%d | clarity=%.1f depth=%.1f specificity=%.1f grounding=%.1f | weighted=%.2f %s",
        p.turn, quality["clarity"], quality["depth"],
        quality["specificity"], quality["grounding"], _weighted, depth_signal,
    )
    logger.info("[EVAL] turn=%d action=%s signal=%s weighted=%.2f",
                p.turn, action, signal or "none", _weighted)
    if signal:
        logger.info("[SIGNAL] %s | reason=%r", signal, signal_reason)

    # -- Update saturation state ----------------------------------------------
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
        logger.info("[SAT] SATURATED | score=%.1f >= threshold=%.1f (%.0f%%)", sat_score, sat_threshold, pct_done)
    else:
        logger.info("[SAT] %.0f%% done | score=%.1f need %.1f more | importance=%s",
                    pct_done, sat_score, remaining,
                    current_topic_state.importance if current_topic_state else "?")

    # -- Decision (priority order; LLM's free-choice judgment no longer used) ----
    if _forced_move_on:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=%s turn=%d", raw.get("reason", "forced"), p.turn)
    elif _dry_topic:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=dry_topic (consecutive=%d total=%d cap=%d) turn=%d",
                    current_topic_state.consecutive_low_yield, current_topic_state.total_low_yield,
                    current_topic_state.dry_topic_cap, p.turn)
    elif _weak_exit:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=weak_exit turn=%d", p.turn)
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
        "response_latency_sec":    p.response_latency_sec,  # time from AI question to candidate reply
        # ponytail: debug-report fields — cheap to stash here, avoids reconstructing later
        "action":                  action,
        "band":                    p.band,
        "is_saturated":            is_saturated,
        "weak_exit":               _weak_exit,
        "dry_topic":               _dry_topic,
        "topic_follow_ups":        _follow_up_count,
    }

    logger.info("[RESULT] turn=%d action=%s quality=%.2f/%s signal=%s sat=%.1f/%.1f",
                p.turn, action, _weighted, depth_signal,
                signal or "none", sat_score, sat_threshold)

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
