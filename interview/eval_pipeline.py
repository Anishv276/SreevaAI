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
        # Dry-topic exit: count consecutive low-yield answers on this topic.
        # A real interviewer abandons a dead topic fast instead of re-asking. When
        # this hits the band cap, eval forces MOVE_ON regardless of the LLM judge.
        self.consecutive_low_yield = 0
        # Fresher: bail after 2 weak turns (breadth-first). Others: 3.
        self.dry_topic_cap = 2 if band == "fresher" else 3
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
    def add_response_contribution(
        self,
        response_score: float,
        signal_penalties: float = 0.0,
        turn: Optional[int] = None,
        weighted_quality: Optional[float] = None,
    ) -> None:
        quality_contribution = max(0.0, response_score + signal_penalties)
        # Base credit is only awarded when the candidate provided substantive content.
        # A denial, repeat request, or zero-score answer contributes 0 base credit
        # so that saturation cannot inflate purely from turn count on null answers.
        effective_base = self.base_turn_credit if quality_contribution > 0.0 else 0.0
        total = effective_base + quality_contribution
        self.saturation_score += total
        self.follow_up_turns += 1
        self.is_saturated = self.saturation_score >= self.saturation_threshold
        # Track consecutive low-yield turns for the dry-topic exit. Use the
        # visible weighted answer quality, not the saturation contribution, because
        # contribution can be zero for shallow-but-real fresher answers. Fresh logs
        # showed this incorrectly moved off the anchor topic after a usable answer.
        low_yield_basis = weighted_quality if weighted_quality is not None else quality_contribution
        if low_yield_basis <= 1.0:
            self.consecutive_low_yield += 1
        else:
            self.consecutive_low_yield = 0
        if turn is not None:
            self.updated_turn = turn
    def is_dry_topic(self) -> bool:
        """True when the topic has gone dry -- consecutive low-yield answers hit the
        band cap. Forces MOVE_ON so the agent stops re-asking a dead topic."""
        if self.follow_up_turns < self.dry_topic_cap:
            return False
        return self.consecutive_low_yield >= self.dry_topic_cap
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
            "consecutive_low_yield": self.consecutive_low_yield,
            "dry_topic_cap": self.dry_topic_cap,
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
        obj.consecutive_low_yield = int(state_dict.get("consecutive_low_yield", 0) or 0)
        if "dry_topic_cap" in state_dict:
            obj.dry_topic_cap  = int(state_dict["dry_topic_cap"])
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
def _weighted_score(quality: dict) -> float:
    """Single weighted aggregate of the 4 LLM scores. Used for both saturation
    contribution and depth_signal classification."""
    return (
        quality.get("clarity", 0.0) * 0.20
        + quality.get("depth", 0.0) * 0.35
        + quality.get("specificity", 0.0) * 0.30
        + quality.get("grounding", 0.0) * 0.15
    )
def _score_to_contribution(weighted: float) -> float:
    """Map a weighted score (0-10) to a saturation contribution (0-3.5)."""
    return min(3.5, max(0.0, (weighted - 2.0) / 8.0 * 3.5))
class SignalPenaltyCalculator:
    MODIFIERS = {
        "follow_up_collapse": -0.3,
        "example_evasion": -0.3,
        "ownership_ambiguity": -0.3,
        "weak_technical_hedge": -0.3,
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
    current_interview_mode: str = "normal"
    candidate_name: str = "?"
    band: str = "mid"
    time_limit_mins: int = 20
    topic_score_history: List[float] = Field(default_factory=list)
    # H2 fix: per-topic depth scores (separate from overall) for follow_up_collapse
    topic_depth_history: List[float] = Field(default_factory=list)
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
    weighted = _weighted_score(quality_scores)
    contribution = 0.0 if skip_quality_contribution else _score_to_contribution(weighted)
    signal_modifier = SignalPenaltyCalculator.calculate_penalties(signal_events)
    if signal_modifier < 0:
        final_contribution = max(contribution * 0.3, contribution + signal_modifier)
    else:
        final_contribution = contribution + min(signal_modifier, 0.5)
    score_before = topic_state.saturation_score
    follow_ups_before = topic_state.follow_up_turns
    topic_state.add_response_contribution(final_contribution, 0.0, turn=turn, weighted_quality=weighted)
    logger.info(
        "[SAT_CALC] topic=%s | weighted=%.2f contribution=%.2f signal_modifier=%+.2f final_contribution=%.2f",
        topic_state.topic_name, weighted, contribution, signal_modifier, final_contribution,
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
    # H1 fix: follow_up_turns is the count BEFORE this answer's contribution is
    # added (add_response_contribution runs after run_turn_evaluation returns).
    # Detectors that require topic_follow_up_count >= 1 (follow_up_collapse,
    # strong_under_pressure) would miss the first real follow-up turn.
    # Pass count + 1 so detectors see the post-contribution value.
    _follow_up_count = (current_topic_state.follow_up_turns + 1) if current_topic_state else 0
    # H2 fix: prior_depth_scores must be depth sub-scores, not overall scores.
    # topic_depth_history carries per-topic depth values written by _apply_eval_result.
    _topic_depth_scores = [float(r) for r in p.topic_depth_history if isinstance(r, (int, float))]
    # L4 fix: derive collapse_stage from how many times follow_up_collapse has
    # already fired on this topic (stored in TopicState.signals_fired).
    # Stage 0 = first collapse; stage >= 1 = escalated (increases confidence,
    # sets recoverable=False in FollowUpCollapseDetector).
    _collapse_stage = 0
    if current_topic_state:
        _collapse_stage = sum(
            1 for s in (current_topic_state.signals_fired or [])
            if s == "follow_up_collapse"
        )
    _captured_eval_usage: list[dict] = []
    async def _evaluate_answer_capturing(**kwargs):
        result = await evaluate_answer(**kwargs)
        usage = result.pop("_llm_usage", None)
        if usage and (
            int(usage.get("inputTokens", 0) or 0)
            or int(usage.get("outputTokens", 0) or 0)
            or int(usage.get("cachedInputTokens", 0) or 0)
        ):
            _captured_eval_usage.append(usage)
        return result
    _topic_importance = current_topic_state.importance if current_topic_state else "HIGH"
    # C2 fix: session_score_history must be the session-wide quality history from
    # _trust_state.score_history (populated after C1 fix), NOT the per-topic list.
    # depth_decay needs >= 4 turns of cross-topic data to detect session-level decay;
    # per-topic history resets each topic and never accumulates enough entries.
    _session_score_history = [float(r) for r in p.score_history if isinstance(r, (int, float))]
    _eval_coro = run_turn_evaluation(
        candidate_answer=p.answer,
        last_question=p.question,
        transcript_lines=p.transcript_lines,
        client=client,
        org_id=p.org_id,
        llm_model=p.llm_model,
        evaluate_answer_fn=_evaluate_answer_capturing,
        signal_toggles=p.signal_toggles,
        session_score_history=_session_score_history,
        turns_since_last_decay=p.turns_since_decay,
        response_latency_sec=p.response_latency_sec,
        topic_follow_up_count=_follow_up_count,
        prior_depth_scores=_topic_depth_scores,
        collapse_stage=_collapse_stage,
        candidate_band=p.band,
        active_topic=p.active_topic or "",
        topic_importance=_topic_importance,
        job_title=p.job_title,
    )
    # Outer wrapper timeout (10s) sits between the inner LLM call (8s) and the
    # agent's LLM gate (12s) -- strictly increasing so the inner call always gets
    # to finish or self-recover before any outer guard fires.
    # RECOVERY OWNED BY EVAL: evaluate_answer never raises (it returns low-confidence
    # recovery scores on timeout/failure), so run_turn_evaluation completes normally.
    # This wrapper exists only as a last-resort guard; on the rare path where it
    # fires we still build a REAL result (low scores, PROBE) so the agent -- which
    # has no fallback -- always receives a usable, topic-advancing decision.
    try:
        _eval_result = await asyncio.wait_for(_eval_coro, timeout=10.0)
    except (asyncio.TimeoutError, Exception) as _ex:
        logger.error(
            "[EVAL] turn=%d | turn evaluation %s (%s) -- eval-owned recovery decision",
            p.turn, "timed out (>10s)" if isinstance(_ex, asyncio.TimeoutError) else "failed", _ex,
        )
        _recovery_quality = {"clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0}
        from interview.turn_decision import build_turn_decision, build_signal_flags
        _recovery_td = build_turn_decision(
            _recovery_quality,
            build_signal_flags([]),
            [],
            "PROBE",
            "clarification",
            "",
        )
        _eval_result = (_recovery_td, "")
    td, _ = _eval_result  # directive string from run_turn_evaluation is discarded -- agent builds its own
    action: str = td["decision"]["action"]
    signal_events = td.get("signal_events", [])
    _weighted_quality = _weighted_score(td["quality"])
    depth_signal = "SURFACE"
    if _weighted_quality >= 7.0:
        depth_signal = "DEEP"
    elif _weighted_quality >= 5.0:
        depth_signal = "SPECIFIC"
    _all_signal_names = [ev.get("signal_name", "?") for ev in signal_events if ev.get("signal_name")]
    logger.info(
        "[QUALITY] turn=%d | clarity=%.1f depth=%.1f specificity=%.1f grounding=%.1f | weighted=%.2f depth_signal=%s",
        p.turn,
        td["quality"]["clarity"], td["quality"]["depth"],
        td["quality"]["specificity"], td["quality"]["grounding"],
        _weighted_quality, depth_signal,
    )
    logger.info(
        "[EVAL] turn=%d action=%s probe_mode=%s weighted=%.2f signals=[%s]",
        p.turn, action, td["decision"].get("mode", "?"),
        _weighted_quality, ", ".join(_all_signal_names) if _all_signal_names else "none",
    )
    for _ev in signal_events:
        if _ev.get("signal_name"):
            logger.info(
                "[SIGNAL] name=%-28s layer=%-20s confidence=%.2f turn=%d",
                _ev.get("signal_name", "?"), _ev.get("signal_layer", "?"),
                float(_ev.get("confidence", 0.5) or 0.5), p.turn,
            )
    # -- Saturation calculation ------------------------------------------------
    signal_fired_names = [ev.get("signal_name", "") for ev in signal_events]
    depth_decay_fired = any(ev.get("signal_name") == "depth_decay" for ev in signal_events)
    # L4 fix: record follow_up_collapse fires in TopicState.signals_fired so
    # the next turn can derive collapse_stage from the count.
    if current_topic_state and any(n == "follow_up_collapse" for n in signal_fired_names):
        current_topic_state.signals_fired.append("follow_up_collapse")
    is_saturated, saturation_status = evaluate_topic_saturation(
        current_topic_state,
        td.get("quality", {}),
        signal_events,
        turn=p.turn,
        skip_quality_contribution=False,
    )
    _weak_exit = current_topic_state is not None and current_topic_state.is_weak_candidate_exit()
    # Dry-topic exit: candidate has given consecutive low-yield answers up to the
    # band cap (fresher 2 / others 3). A real interviewer moves on instead of
    # re-asking a dead topic. This is deterministic -- independent of the LLM judge.
    _dry_topic = current_topic_state is not None and current_topic_state.is_dry_topic()
    logger.info(
        "[SATURATION] turn=%d | topic=%s | %s | signals=[%s]%s",
        p.turn,
        (current_topic_state.topic_name if current_topic_state else "?"),
        saturation_status,
        ", ".join(signal_fired_names) if signal_fired_names else "none",
        " | depth_decay->MOVE_ON(severe)" if (depth_decay_fired and "severe" in str(
            next((ev.get("evidence","") for ev in signal_events if ev.get("signal_name")=="depth_decay"), ""))) else
        " | depth_decay->PROBE(mild)" if depth_decay_fired else "",
    )
    # -- Decision -------------------------------------------------------------
    # Priority: depth_decay(severe) > weak_exit > saturated > llm_judge >
    #           depth_decay(mild=pressure probe) > PROBE
    depth_decay_severity = None
    if depth_decay_fired:
        _dd_ev = next((ev for ev in signal_events if ev.get("signal_name") == "depth_decay"), {})
        depth_decay_severity = "severe" if "severe" in str(_dd_ev.get("evidence", "")) else "mild"
    if depth_decay_fired and depth_decay_severity == "severe":
        action = "MOVE_ON"
        logger.info("[DECISION] [OK] MOVE_ON reason=depth_decay(severe) turn=%d", p.turn)
    elif _dry_topic:
        action = "MOVE_ON"
        logger.info("[DECISION] [OK] MOVE_ON reason=dry_topic (consecutive_low_yield=%d>=cap=%d) turn=%d",
                    current_topic_state.consecutive_low_yield, current_topic_state.dry_topic_cap, p.turn)
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
    elif depth_decay_fired and depth_decay_severity == "mild":
        # Mild decay: quality is dipping but not collapsed. Try one pressure
        # probe before giving up -- the candidate may recover. If they don't,
        # depth_decay will fire again next turn (after cooldown) as severe.
        action = "PROBE"
        signal_fired_names = list(signal_fired_names) + ["depth_decay_mild_pressure"]
        logger.info("[DECISION] PROBE reason=depth_decay(mild)->pressure turn=%d", p.turn)
    else:
        action = "PROBE"
    # -- Probe family resolution (only matters for PROBE) ---------------------
    probe_family = None
    # FIX #2: Agent computes goal/style, not eval
    if action == "PROBE":
        from interview.probe_strategy import _PROBE_FAMILIES, _SIGNAL_TO_FAMILY, _MODE_ALIASES, get_probe_goal, get_probe_style
        def _resolve_probe_family() -> str:
            # First match in _SIGNAL_TO_FAMILY wins -- the table is ordered by
            # priority so the most serious signal drives the probe when multiple
            # fire on the same turn.
            for sig_name, sig_family in _SIGNAL_TO_FAMILY:
                if sig_name in signal_fired_names:
                    return sig_family
            # No signal fired -- fall back to LLM's own probe_mode suggestion.
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
        "concerns": [ev["signal_name"] for ev in signal_events if not ev.get("recoverable", True)],
        "topic": p.active_topic or "general",
        "topic_saturation_score": current_topic_state.saturation_score if current_topic_state else 0.0,
        "topic_saturation_threshold": current_topic_state.saturation_threshold if current_topic_state else 0.0,
    }
    logger.info(
        "[RESULT] turn=%d action=%s quality=%.2f/%s signals=[%s] sat=%.1f/%.1f",
        p.turn, action, _weighted_quality, depth_signal,
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
            "dry_topic": _dry_topic,
            "depth_decay": depth_decay_fired,
            "topic_state_dict": current_topic_state.to_dict() if current_topic_state else None,
        },
        "discussed_log_entry": discussed_log_entry,
        # LLM usage for billing
        "eval_llm_usages": list(_captured_eval_usage),
        # Pass through for agent logging
        "turn": p.turn,
        "app_id": p.app_id,
    }
