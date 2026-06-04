"""
Evaluation pipeline -- pure scorer, called inline by the agent on every turn.

Responsibility: score the candidate's answer, detect behavioral signals,
calculate topic saturation, decide PROBE/MOVE_ON.

NOT responsible for: topic selection, directive building, next-topic picking,
or any agent state mutations. The agent owns all of that.

run_eval_and_build_directive(payload, client) -> EvalResult dict
"""
from __future__ import annotations

import asyncio
import re
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from openai import AsyncOpenAI

_NO_NEW_QUESTION_CUTOFF_SECONDS: int = 45

from interview.turn_evaluator import run_turn_evaluation
from interview.trust_engine import apply_turn_decision
from interview.agent_scoring import evaluate_answer
from interview.agent_runtime_support import EVAL_LLM_MODEL

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# Band-aware saturation config
# ---------------------------------------------------------------------------
_BAND_SATURATION: dict[str, dict[str, dict]] = {
    "fresher": {
        # Resume projects are the strongest signal we have for a fresher.
        # Skills also get more turns so the agent can probe past one-line claims
        # ("I used Python") to real usage. LOW stays quick.
        "CRITICAL": {"threshold": 5.5, "base_credit": 1.0},   # anchor project (was 6.0 -- too many turns drifted into hard validation/metrics probing)
        "HIGH":     {"threshold": 5.0, "base_credit": 1.0},   # other resume projects/work (was 4.0)
        "MEDIUM":   {"threshold": 5.0, "base_credit": 1.2},   # skills (was 3.0)
        "LOW":      {"threshold": 2.5, "base_credit": 1.4},   # unchanged
    },
    "mid": {
        "CRITICAL": {"threshold": 7.0, "base_credit": 0.8},
        "HIGH":     {"threshold": 5.5, "base_credit": 0.9},
        "MEDIUM":   {"threshold": 4.0, "base_credit": 1.0},
        "LOW":      {"threshold": 3.0, "base_credit": 1.2},
    },
    "experienced": {
        "CRITICAL": {"threshold": 9.0, "base_credit": 0.7},
        "HIGH":     {"threshold": 7.0, "base_credit": 0.8},
        "MEDIUM":   {"threshold": 5.0, "base_credit": 0.9},
        "LOW":      {"threshold": 3.5, "base_credit": 1.0},
    },
    "senior": {
        "CRITICAL": {"threshold": 11.0, "base_credit": 0.6},
        "HIGH":     {"threshold": 8.5,  "base_credit": 0.7},
        "MEDIUM":   {"threshold": 6.0,  "base_credit": 0.8},
        "LOW":      {"threshold": 4.0,  "base_credit": 0.9},
    },
}


class TopicState:
    """Single source of truth for per-topic saturation state."""

    def __init__(self, topic_name: str, importance: str, updated_turn: int = 0, band: str = "mid"):
        self.topic_name = topic_name
        self.importance = importance
        self.band = band
        self.updated_turn = updated_turn

        _band_cfg = _BAND_SATURATION.get(band, _BAND_SATURATION["mid"])
        _importance_cfg = _band_cfg.get(importance, _band_cfg.get("HIGH", {"threshold": 5.5, "base_credit": 0.8}))
        self.saturation_threshold: float = _importance_cfg["threshold"]
        self.base_turn_credit: float = _importance_cfg["base_credit"]

        self.saturation_score = 0.0
        self.follow_up_turns = 0
        self.probe_rotation_index = 0  # kept for serialization compat
        self.signals_fired: list[str] = []
        self.is_saturated = False
        self.opened_at_turn = 0

        self.progress_check_turns = 3
        self.progress_check_pct = {
            "fresher":    {"CRITICAL": 0.75, "HIGH": 0.80, "MEDIUM": 0.90, "LOW": 0.90},
            "mid":        {"CRITICAL": 0.45, "HIGH": 0.45, "MEDIUM": 0.80, "LOW": 0.65},
            "experienced":{"CRITICAL": 0.28, "HIGH": 0.30, "MEDIUM": 0.45, "LOW": 0.60},
            "senior":     {"CRITICAL": 0.20, "HIGH": 0.22, "MEDIUM": 0.35, "LOW": 0.50},
        }.get(band, {"CRITICAL": 0.45, "HIGH": 0.45, "MEDIUM": 0.80, "LOW": 0.65}).get(importance, 0.45)

    def is_weak_candidate_exit(self) -> bool:
        if self.follow_up_turns < self.progress_check_turns:
            return False
        raw_base_accumulated = self.base_turn_credit * self.follow_up_turns
        effective_score = max(self.saturation_score, raw_base_accumulated)
        min_expected = self.saturation_threshold * self.progress_check_pct
        return effective_score < min_expected

    def add_response_contribution(self, response_score: float, signal_penalties: float = 0.0, turn: Optional[int] = None) -> None:
        quality_contribution = max(0.0, response_score + signal_penalties)
        total = self.base_turn_credit + quality_contribution
        self.saturation_score += total
        self.follow_up_turns += 1
        self.is_saturated = self.saturation_score >= self.saturation_threshold
        if turn is not None:
            self.updated_turn = turn

    def to_dict(self) -> dict:
        return {
            "topic_name": self.topic_name,
            "importance": self.importance,
            "band": self.band,
            "saturation_threshold": self.saturation_threshold,
            "saturation_score": round(self.saturation_score, 2),
            "follow_up_turns": self.follow_up_turns,
            "base_turn_credit": self.base_turn_credit,
            "progress_check_turns": self.progress_check_turns,
            "progress_check_pct": self.progress_check_pct,
            "probe_rotation_index": self.probe_rotation_index,
            "signals_fired": self.signals_fired,
            "is_saturated": self.is_saturated,
            "updated_turn": self.updated_turn,
        }

    @classmethod
    def from_dict(cls, state_dict: dict) -> "TopicState":
        """Restore a TopicState from a serialised dict."""
        obj = cls(
            topic_name=str(state_dict.get("topic_name", "")),
            importance=str(state_dict.get("importance", "HIGH")),
            updated_turn=int(state_dict.get("updated_turn", 0) or 0),
            band=str(state_dict.get("band", "mid")),
        )
        obj.saturation_score   = float(state_dict.get("saturation_score", 0.0) or 0.0)
        obj.follow_up_turns    = int(state_dict.get("follow_up_turns", 0) or 0)
        obj.probe_rotation_index = int(state_dict.get("probe_rotation_index", 0) or 0)
        obj.is_saturated       = bool(state_dict.get("is_saturated", False))
        obj.signals_fired      = list(state_dict.get("signals_fired", []) or [])
        obj.opened_at_turn     = int(state_dict.get("opened_at_turn", 0) or 0)
        if "saturation_threshold" in state_dict:
            obj.saturation_threshold = float(state_dict["saturation_threshold"])
        if "base_turn_credit" in state_dict:
            obj.base_turn_credit = float(state_dict["base_turn_credit"])
        if "progress_check_turns" in state_dict:
            obj.progress_check_turns = int(state_dict["progress_check_turns"])
        if "progress_check_pct" in state_dict:
            obj.progress_check_pct = float(state_dict["progress_check_pct"])
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


class ResponseScoreCalculator:
    WEIGHTS = {
        "clarity": 0.20,
        "depth": 0.35,
        "specificity": 0.30,
        "grounding": 0.15,
    }

    CONTRIBUTION_BANDS = [
        (8.5, 3.5),
        (7.0, 2.5),
        (5.5, 1.5),
        (4.0, 0.5),
        (0.0, 0.0),
    ]

    @staticmethod
    def calculate_response_score(quality: dict) -> float:
        return (
            quality.get("clarity", 0.0) * ResponseScoreCalculator.WEIGHTS["clarity"]
            + quality.get("depth", 0.0) * ResponseScoreCalculator.WEIGHTS["depth"]
            + quality.get("specificity", 0.0) * ResponseScoreCalculator.WEIGHTS["specificity"]
            + quality.get("grounding", 0.0) * ResponseScoreCalculator.WEIGHTS["grounding"]
        )

    @staticmethod
    def calculate_contribution(response_score: float) -> float:
        return min(3.5, max(0.0, (response_score - 2.0) / 8.0 * 3.5))


class SignalPenaltyCalculator:
    MODIFIERS = {
        "follow_up_collapse": -0.3,
        "example_evasion": -0.3,
        "ownership_ambiguity": -0.3,
        "resume_claim_mismatch": -0.3,
        "latency_mismatch": -0.3,
        "complexity_latency_mismatch": -0.3,
        "strong_under_pressure": +0.5,
        "ownership_clarified": +0.3,
        "example_given": +0.3,
    }

    @staticmethod
    def calculate_penalties(signal_events: list[dict]) -> float:
        total = 0.0
        for event in signal_events:
            signal_name = event.get("signal_name", "")
            modifier = SignalPenaltyCalculator.MODIFIERS.get(signal_name, 0.0)
            total += modifier
        return total


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
    llm_model: str = EVAL_LLM_MODEL
    # Current topic (agent-determined -- eval scores ONLY this topic)
    active_topic: Optional[str] = None
    active_topic_state: Optional[Dict[str, Any]] = None
    anchor_item: Optional[str] = None
    resume_topics: List[str] = Field(default_factory=list)
    skill_topics: List[str] = Field(default_factory=list)
    discussed_log: List[str] = Field(default_factory=list)
    job_title: str = "the role"
    remaining_seconds: float = 999.0
    trust_state: Dict[str, Any] = Field(default_factory=dict)
    current_interview_mode: str = "normal"
    candidate_name: str = "?"
    band: str = "mid"
    time_limit_mins: int = 20
    topic_score_history: List[float] = Field(default_factory=list)
    # The actual question Ishita asked -- used for context in scoring
    ai_question_this_turn: str = ""

    model_config = {"extra": "allow"}


# ---------------------------------------------------------------------------
# Saturation evaluation
# ---------------------------------------------------------------------------
def evaluate_topic_saturation(
    topic_state: Optional[TopicState],
    quality_scores: Dict[str, float],
    signal_events: list[dict],
    turn: int = 0,
    skip_quality_contribution: bool = False,
) -> tuple[bool, str]:
    if not topic_state:
        return False, "no_topic"

    response_score = ResponseScoreCalculator.calculate_response_score(quality_scores)
    contribution = 0.0 if skip_quality_contribution else ResponseScoreCalculator.calculate_contribution(response_score)

    signal_modifier = SignalPenaltyCalculator.calculate_penalties(signal_events)
    if signal_modifier < 0:
        final_contribution = max(contribution * 0.3, contribution + signal_modifier)
    else:
        final_contribution = contribution + min(signal_modifier, 0.5)

    score_before = topic_state.saturation_score
    follow_ups_before = topic_state.follow_up_turns

    topic_state.add_response_contribution(final_contribution, 0.0, turn=turn)

    logger.info(
        "[SAT_CALC] topic=%s | response_score=%.2f contribution=%.2f signal_modifier=%+.2f final_contribution=%.2f",
        topic_state.topic_name, response_score, contribution, signal_modifier, final_contribution,
    )
    logger.info(
        "[SAT_CALC] base_credit=%.1f | score: %.1f -> %.1f (delta=+%.1f) | follow_ups: %d -> %d",
        topic_state.base_turn_credit,
        score_before, topic_state.saturation_score, topic_state.saturation_score - score_before,
        follow_ups_before, topic_state.follow_up_turns,
    )

    if topic_state.is_saturated:
        logger.info(
            "[SAT_RESULT] [OK] SATURATED | score=%.1f >= threshold=%.1f (%.0f%%) | importance=%s",
            topic_state.saturation_score, topic_state.saturation_threshold,
            100 * min(1.0, topic_state.saturation_score / topic_state.saturation_threshold),
            topic_state.importance,
        )
        return True, f"saturated_at_{round(topic_state.saturation_score, 1)}"
    else:
        remaining = topic_state.saturation_threshold - topic_state.saturation_score
        pct_done = 100 * min(1.0, topic_state.saturation_score / topic_state.saturation_threshold)
        logger.info(
            "[SAT_RESULT] 🔄 NOT SATURATED | score=%.1f < threshold=%.1f (%.0f%% done) | need %.1f more | importance=%s",
            topic_state.saturation_score, topic_state.saturation_threshold, pct_done, remaining,
            topic_state.importance,
        )
        return False, f"score_{round(topic_state.saturation_score, 1)}_need_{round(remaining, 1)}"


# ---------------------------------------------------------------------------
# Main eval function -- pure scorer, no topic selection, no directive building
# ---------------------------------------------------------------------------
async def run_eval_and_build_directive(payload: dict, client: AsyncOpenAI) -> dict:
    """
    Scores the candidate's answer on the CURRENT topic (agent-determined).
    Returns scores, signals, saturation state, and action (PROBE/MOVE_ON).
    The agent owns topic selection, next-topic picking, and directive building.
    """
    p = EvaluationPayload(**payload)

    # Every non-empty candidate answer follows the same LLM-driven path.
    # No local short-utterance, clarification, redirect, or cannot-answer router.

    # -- Initialize/restore TopicState for current topic ----------------------
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
        _topic_key = _normalize_topic_key(p.active_topic)
        _resume_keys = {_normalize_topic_key(t) for t in p.resume_topics}
        _topic_source = "resume" if _topic_key in _resume_keys else "skill"
        importance = TopicImportanceClassifier.classify(
            topic_source=_topic_source,
            is_anchor=p.active_topic == p.anchor_item,
        )
        current_topic_state = TopicState(p.active_topic, importance, updated_turn=p.turn, band=p.band)
        logger.info(
            "[TOPIC_STATE] CREATED | topic=%s source=%s importance=%s band=%s | threshold=%.1f base_credit=%.1f",
            p.active_topic, _topic_source, importance, p.band,
            current_topic_state.saturation_threshold, current_topic_state.base_turn_credit,
        )

    # -- Log turn context -----------------------------------------------------
    _sat_pct = 0
    if current_topic_state:
        _sat_pct = 100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold)
    logger.info(
        "[TURN] turn=%d | scoring_topic=%s | sat=%.0f%% (%.1f/%.1f) | remaining=%.0fs",
        p.turn, p.active_topic or "?", _sat_pct,
        current_topic_state.saturation_score if current_topic_state else 0,
        current_topic_state.saturation_threshold if current_topic_state else 0,
        p.remaining_seconds,
    )
    logger.info(
        "[QA] turn=%d  Q: %s\n              A: %s",
        p.turn, (p.question or "")[:200], (p.answer or "")[:200],
    )

    # -- Run scoring ----------------------------------------------------------
    _follow_up_count = current_topic_state.follow_up_turns if current_topic_state else 0
    _topic_depth_scores = [float(r) for r in p.topic_score_history if isinstance(r, (int, float))]

    _captured_eval_usage: list[dict] = []

    async def _evaluate_answer_capturing(**kwargs):
        result = await evaluate_answer(**kwargs)
        usage = result.pop("_llm_usage", None)
        if usage:
            _captured_eval_usage.append(usage)
        return result

    _topic_importance = current_topic_state.importance if current_topic_state else "HIGH"

    _eval_coro = run_turn_evaluation(
        candidate_answer=p.answer,
        last_question=p.question,
        transcript_lines=p.transcript_lines,
        client=client,
        org_id=p.org_id,
        llm_model=p.llm_model,
        evaluate_answer_fn=_evaluate_answer_capturing,
        signal_toggles=p.signal_toggles,
        session_score_history=p.topic_score_history,
        turns_since_last_decay=p.turns_since_decay,
        response_latency_sec=p.response_latency_sec,
        topic_follow_up_count=_follow_up_count,
        prior_depth_scores=_topic_depth_scores,
        candidate_band=p.band,
        active_topic=p.active_topic or "",
        topic_importance=_topic_importance,
        job_title=p.job_title,
    )

    try:
        _eval_result = await asyncio.wait_for(_eval_coro, timeout=12.0)
    except asyncio.TimeoutError:
        logger.error("[EVAL] turn=%d | scoring call timed out (>12s) -- returning None for explicit recovery", p.turn)
        return None
    except Exception as _ex:
        logger.error("[EVAL] turn=%d | scoring call failed: %s -- returning None", p.turn, _ex, exc_info=True)
        return None

    td, _ = _eval_result  # directive string from run_turn_evaluation is discarded -- agent builds its own

    action: str = td["decision"]["action"]
    signal_events = td.get("signal_events", [])

    _weighted_quality = ResponseScoreCalculator.calculate_response_score(td["quality"])
    quality_avg = (
        td["quality"]["clarity"] + td["quality"]["depth"]
        + td["quality"]["specificity"] + td["quality"]["grounding"]
    ) / 4.0

    depth_signal = "SURFACE"
    if _weighted_quality >= 7.0:
        depth_signal = "DEEP"
    elif _weighted_quality >= 5.0:
        depth_signal = "SPECIFIC"

    _all_signal_names = [ev.get("signal_name", "?") for ev in signal_events if ev.get("signal_name")]
    logger.info(
        "[QUALITY] turn=%d | clarity=%.1f depth=%.1f specificity=%.1f grounding=%.1f | avg=%.2f weighted=%.2f depth_signal=%s",
        p.turn,
        td["quality"]["clarity"], td["quality"]["depth"],
        td["quality"]["specificity"], td["quality"]["grounding"],
        quality_avg, _weighted_quality, depth_signal,
    )
    logger.info(
        "[EVAL] turn=%d action=%s probe_mode=%s quality_avg=%.2f signals=[%s]",
        p.turn, action, td["decision"].get("mode", "?"),
        quality_avg, ", ".join(_all_signal_names) if _all_signal_names else "none",
    )
    for _ev in signal_events:
        if _ev.get("signal_name"):
            logger.info(
                "[SIGNAL] name=%-28s layer=%-20s confidence=%.2f delta=%+.2f turn=%d",
                _ev.get("signal_name", "?"), _ev.get("signal_layer", "?"),
                float(_ev.get("confidence", 0.5) or 0.5),
                float(_ev.get("score_delta", 0) or 0), p.turn,
            )

    # -- Saturation calculation ------------------------------------------------
    signal_fired_names = [ev.get("signal_name", "") for ev in signal_events]
    depth_decay_fired = any(ev.get("signal_name") == "depth_decay" for ev in signal_events)

    is_saturated, saturation_status = evaluate_topic_saturation(
        current_topic_state,
        td.get("quality", {}),
        signal_events,
        turn=p.turn,
        skip_quality_contribution=False,
    )

    _weak_exit = current_topic_state is not None and current_topic_state.is_weak_candidate_exit()

    logger.info(
        "[SATURATION] turn=%d | topic=%s | %s | signals=[%s]%s",
        p.turn,
        (current_topic_state.topic_name if current_topic_state else "?"),
        saturation_status,
        ", ".join(signal_fired_names) if signal_fired_names else "none",
        " | depth_decay->MOVE_ON" if depth_decay_fired else "",
    )

    # -- Decision -------------------------------------------------------------
    # Priority: depth_decay > weak_exit > saturated > llm_judge > PROBE
    if depth_decay_fired:
        action = "MOVE_ON"
        logger.info("[DECISION] [OK] MOVE_ON reason=depth_decay turn=%d", p.turn)
    elif _weak_exit:
        action = "MOVE_ON"
        logger.info("[DECISION] [OK] MOVE_ON reason=weak_exit (turns=%d score=%.1f<min=%.1f) turn=%d",
                    current_topic_state.follow_up_turns, current_topic_state.saturation_score,
                    current_topic_state.saturation_threshold * current_topic_state.progress_check_pct, p.turn)
    elif is_saturated:
        action = "MOVE_ON"
        logger.info("[DECISION] [OK] MOVE_ON reason=saturated (score=%.1f>=%.1f) turn=%d",
                    current_topic_state.saturation_score, current_topic_state.saturation_threshold, p.turn)
    elif action == "MOVE_ON":
        logger.info("[DECISION] [OK] MOVE_ON reason=llm_judge turn=%d", p.turn)
    else:
        action = "PROBE"

    # -- Probe family resolution (only matters for PROBE) ---------------------
    probe_family = None
    # FIX #2: Agent computes goal/style, not eval

    if action == "PROBE":
        from interview.probe_strategy import _PROBE_FAMILIES, _SIGNAL_TO_FAMILY, _MODE_ALIASES, get_probe_goal, get_probe_style

        def _resolve_probe_family() -> str:
            for sig_name, sig_family in _SIGNAL_TO_FAMILY:
                if sig_name in signal_fired_names and sig_family != "normal":
                    return sig_family
            llm_mode = str(td["decision"].get("mode") or "").strip().lower()
            if llm_mode in _PROBE_FAMILIES:
                return llm_mode
            if llm_mode in _MODE_ALIASES:
                return _MODE_ALIASES[llm_mode]
            return "ownership"

        probe_family = _resolve_probe_family()
        # FIX #2: Agent computes probe_goal and probe_style from family
        # Removed: probe_goal = get_probe_goal(probe_family)
        # Removed: probe_style = get_probe_style(probe_family)

        pct_sat = 100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold) \
                  if current_topic_state else 0
        logger.info(
            "[DECISION] 🔄 PROBE family=%s signals=[%s] sat=%.0f%% turn=%d",
            probe_family, ", ".join(signal_fired_names) or "none", pct_sat, p.turn,
        )

    # -- Trust state update ----------------------------------------------------
    new_trust_state = apply_turn_decision(
        dict(p.trust_state), td, behavioral_toggles=p.signal_toggles,
    )

    risk_integrity_delta = 0
    risk_depth_delta = 0
    for event in signal_events:
        event_delta = float(event.get("score_delta", 0.0) or 0.0)
        legacy_delta = int(round(max(0.0, -event_delta) * 100))
        if legacy_delta:
            if event.get("signal_layer") == "hard_integrity":
                risk_integrity_delta += legacy_delta
            else:
                risk_depth_delta += legacy_delta
    if depth_signal == "SURFACE":
        risk_depth_delta += 3

    # -- Discussed log entry (on MOVE_ON) -------------------------------------
    discussed_log_entry: Optional[str] = None
    if action == "MOVE_ON" and p.question and p.answer:
        topic_line = p.question.split("?")[0].strip()[:80]
        answer_gist = " ".join(p.answer.split()[:20])
        discussed_log_entry = f"- {topic_line}: {answer_gist}"

    # -- Quality record for DB ------------------------------------------------
    quality_record = {
        "turn": p.turn,
        "question": p.question,
        "answer": p.answer,
        "clarity": td["quality"]["clarity"],
        "depth": td["quality"]["depth"],
        "specificity": td["quality"]["specificity"],
        "grounding": td["quality"]["grounding"],
        "overall": _weighted_quality,
        "signals": [ev["signal_name"] for ev in signal_events if ev.get("signal_name")],
        "concerns": [ev["signal_name"] for ev in signal_events if ev.get("score_delta", 0.0) < 0],
        "topic": p.active_topic or "general",
        "topic_saturation_score": current_topic_state.saturation_score if current_topic_state else 0.0,
        "topic_saturation_threshold": current_topic_state.saturation_threshold if current_topic_state else 0.0,
    }

    logger.info(
        "[RESULT] turn=%d action=%s quality=%.2f/%s signals=[%s] sat=%.1f/%.1f",
        p.turn, action, quality_avg, depth_signal,
        ", ".join(_all_signal_names) or "none",
        current_topic_state.saturation_score if current_topic_state else 0,
        current_topic_state.saturation_threshold if current_topic_state else 0,
    )

    return {
        # Decision
        "action": action,                  # PROBE | MOVE_ON
        # Probe family only (agent computes goal/style from family)
        "probe_family": probe_family,
        # FIX #2: Removed probe_goal and probe_style
        # Rationale: Eval's job is to classify the probe family (depth, ownership, etc.)
        # Agent's job is to compute goal/style from family (separation of concerns)
        # This lets each component evolve independently
        # Scores
        "quality_record": quality_record,
        "signal_events": signal_events,
        "depth_signal": depth_signal,
        # Saturation state (agent stores this per topic)
        "saturation": {
            "score": current_topic_state.saturation_score if current_topic_state else 0.0,
            "threshold": current_topic_state.saturation_threshold if current_topic_state else 0.0,
            "follow_up_turns": current_topic_state.follow_up_turns if current_topic_state else 0,
            "is_saturated": is_saturated,
            "weak_exit": _weak_exit,
            "depth_decay": depth_decay_fired,
            "topic_state_dict": current_topic_state.to_dict() if current_topic_state else None,
        },
        # Trust / risk
        "new_trust_state": new_trust_state,
        "risk_integrity_delta": risk_integrity_delta,
        "risk_depth_delta": risk_depth_delta,
        "discussed_log_entry": discussed_log_entry,
        # LLM usage for billing
        "eval_llm_usages": list(_captured_eval_usage),
        # Pass through for agent logging
        "turn": p.turn,
        "app_id": p.app_id,
    }
