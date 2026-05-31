"""
Live-N evaluation pipeline.

Single-shot: run_eval_and_build_directive() scores + routes in one LLM call.
Worker writes ONE result key: routing_result:{app_id}:{turn} for the current turn.
Agent waits for THIS turn's result — live-N, not N-1.
"""
from __future__ import annotations

import asyncio
import re
import logging
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field
from openai import AsyncOpenAI

_NO_NEW_QUESTION_CUTOFF_SECONDS: int = 45

from interview.turn_evaluator import run_turn_evaluation
from interview.turn_decision import classify_short_utterance
from interview.trust_engine import apply_turn_decision
from interview.agent_scoring import (
    evaluate_answer,
)
from interview.agent_runtime_support import EVAL_LLM_MODEL

logger = logging.getLogger("eval_worker")


# ---------------------------------------------------------------------------
# Topic Saturation System (PART 2)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Band-aware saturation config — controls turns-per-topic per experience level.
#
# Research basis (20-min interview, ~23 eval turns available after warmup):
#   fresher:    breadth > depth → 5-6 topics → 2-3 turns/topic → low threshold
#   mid:        balanced       → 4-5 topics → 3-4 turns/topic → mid threshold
#   experienced: depth > breadth → 3-4 topics → 4-5 turns/topic → high threshold
#   senior:     depth-only     → 2-3 topics → 5-6 turns/topic → very high threshold
#
# Threshold math: base_credit * turns_until_exit = threshold * progress_check_pct
# (guarantees weak candidates exit before eating the entire budget)
# ---------------------------------------------------------------------------

_BAND_SATURATION: dict[str, dict[str, dict]] = {
    # importance → {threshold, base_turn_credit} per band
    "fresher": {
        "CRITICAL": {"threshold": 5.0, "base_credit": 1.1},
        "HIGH":     {"threshold": 4.0, "base_credit": 1.0},
        "MEDIUM":   {"threshold": 3.0, "base_credit": 1.2},
        "LOW":      {"threshold": 2.5, "base_credit": 1.4},
    },
    "mid": {
        "CRITICAL": {"threshold": 7.0, "base_credit": 0.6},
        "HIGH":     {"threshold": 5.5, "base_credit": 0.8},
        "MEDIUM":   {"threshold": 4.0, "base_credit": 1.0},
        "LOW":      {"threshold": 3.0, "base_credit": 1.2},
    },
    "experienced": {
        "CRITICAL": {"threshold": 9.0, "base_credit": 0.55},
        "HIGH":     {"threshold": 7.0, "base_credit": 0.65},
        "MEDIUM":   {"threshold": 5.0, "base_credit": 0.85},
        "LOW":      {"threshold": 3.5, "base_credit": 1.0},
    },
    "senior": {
        "CRITICAL": {"threshold": 11.0, "base_credit": 0.50},
        "HIGH":     {"threshold": 8.5,  "base_credit": 0.55},
        "MEDIUM":   {"threshold": 6.0,  "base_credit": 0.70},
        "LOW":      {"threshold": 4.0,  "base_credit": 0.90},
    },
}


class TopicState:
    """Single source of truth for per-topic state."""

    def __init__(self, topic_name: str, importance: str, updated_turn: int = 0, band: str = "mid"):
        self.topic_name = topic_name
        self.importance = importance  # CRITICAL | HIGH | MEDIUM | LOW
        self.band = band
        self.updated_turn = updated_turn

        # Band-aware saturation thresholds and base credits.
        # Fresher: low threshold → moves faster → covers more topics (breadth).
        # Senior: high threshold → stays longer → goes much deeper per topic (depth).
        _band_cfg = _BAND_SATURATION.get(band, _BAND_SATURATION["mid"])
        _importance_cfg = _band_cfg.get(importance, _band_cfg.get("HIGH", {"threshold": 5.5, "base_credit": 0.8}))
        self.saturation_threshold: float = _importance_cfg["threshold"]
        self.base_turn_credit: float = _importance_cfg["base_credit"]

        self.saturation_score = 0.0  # Accumulates per response
        self.follow_up_turns = 0     # Counts each turn on this topic
        self.probe_rotation_index = 0  # kept for Redis state compat; rotation removed — LLM picks family
        self.signals_fired: list[str] = []
        self.is_saturated = False
        self.opened_at_turn = 0

        # Weak candidate early exit: after progress_check_turns, if score < pct of threshold → move on.
        # Math check (must satisfy: base_credit * turns < threshold * pct):
        #   fresher  HIGH: 1.0*3=3.0 < 4.0*0.80=3.20 ✅
        #   mid      HIGH: 0.8*3=2.4 < 5.5*0.45=2.475 ✅
        #   experienced HIGH: 0.65*3=1.95 < 7.0*0.30=2.10 ✅
        #   senior   HIGH: 0.55*3=1.65 < 8.5*0.22=1.87 ✅
        self.progress_check_turns = 3
        self.progress_check_pct = {
            "fresher":    {"CRITICAL": 0.75, "HIGH": 0.80, "MEDIUM": 0.90, "LOW": 0.90},
            "mid":        {"CRITICAL": 0.45, "HIGH": 0.45, "MEDIUM": 0.80, "LOW": 0.65},
            "experienced":{"CRITICAL": 0.28, "HIGH": 0.30, "MEDIUM": 0.45, "LOW": 0.60},
            "senior":     {"CRITICAL": 0.20, "HIGH": 0.22, "MEDIUM": 0.35, "LOW": 0.50},
        }.get(band, {"CRITICAL": 0.45, "HIGH": 0.45, "MEDIUM": 0.80, "LOW": 0.65}).get(importance, 0.45)

    def is_weak_candidate_exit(self) -> bool:
        """After N turns, check if score is below the minimum expected progress.

        Uses RAW accumulated base_credit as the floor — signal penalties (evasion, -1.5)
        must NOT penalize the threshold check because they already slow saturation by
        zeroing quality contribution. Double-penalizing pushes genuinely-weak candidates
        off topics too early (confirmed from log: score=2.7 after example_evasion -1.5
        wiped contribution, but base alone = 2.4 which is ≥ corrected min=2.275).

        Rule: after 3 turns, score must have reached 45% of threshold (CRITICAL/HIGH).
        Uses effective_score = max(actual, raw_base) so signal penalties don't double-penalise.
        """
        if self.follow_up_turns < self.progress_check_turns:
            return False
        # Floor: base_credit * turns = what a zero-quality candidate accumulates
        raw_base_accumulated = self.base_turn_credit * self.follow_up_turns
        # Use the higher of actual score or raw base — so penalty signals don't
        # push a candidate below a floor they physically crossed via base credits
        effective_score = max(self.saturation_score, raw_base_accumulated)
        min_expected = self.saturation_threshold * self.progress_check_pct
        return effective_score < min_expected

    def add_response_contribution(
        self,
        response_score: float,
        signal_penalties: float = 0.0,
        turn: Optional[int] = None,
    ) -> None:
        """Add contribution from this response to saturation score.

        Every turn earns a base credit regardless of quality (ensures weak candidates
        eventually move on). Quality contribution on top accelerates saturation for
        strong candidates. No fixed cap needed — fully adaptive.
        """
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
        """Restore a TopicState from a serialised dict (Redis → agent → worker round-trip).

        Using a classmethod factory instead of scattered manual field assignment
        means every field goes through __init__ type coercion.  If to_dict() ever
        adds a new field, from_dict picks it up automatically — no silent drops.
        """
        obj = cls(
            topic_name=str(state_dict.get("topic_name", "")),
            importance=str(state_dict.get("importance", "HIGH")),
            updated_turn=int(state_dict.get("updated_turn", 0) or 0),
            band=str(state_dict.get("band", "mid")),
        )
        # Restore mutable accumulator fields — these override __init__ defaults
        obj.saturation_score   = float(state_dict.get("saturation_score", 0.0) or 0.0)
        obj.follow_up_turns    = int(state_dict.get("follow_up_turns", 0) or 0)
        obj.probe_rotation_index = int(state_dict.get("probe_rotation_index", 0) or 0)
        obj.is_saturated       = bool(state_dict.get("is_saturated", False))
        obj.signals_fired      = list(state_dict.get("signals_fired", []) or [])
        obj.opened_at_turn     = int(state_dict.get("opened_at_turn", 0) or 0)
        # Restore threshold/credit from dict so they survive importance changes mid-session
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
    """Classify topic importance based on which source list the topic came from."""

    @staticmethod
    def classify(
        topic_source: str,
        is_anchor: bool,
    ) -> str:
        """
        Return CRITICAL | HIGH | MEDIUM | LOW.

        Classification is based on source, not topic text content:
          - anchor_item → CRITICAL (the opening project/role that defines the interview)
          - resume_topics → HIGH (real work experience, most important to probe)
          - skill_topics → MEDIUM (JD skills mentioned but not in resume context)
          - unknown / other → LOW
        """
        if is_anchor:
            return "CRITICAL"
        if topic_source == "resume":
            return "HIGH"
        if topic_source == "skill":
            return "MEDIUM"
        return "LOW"


class ResponseScoreCalculator:
    """Calculate weighted response score from quality dimensions."""

    WEIGHTS = {
        "clarity": 0.20,
        "depth": 0.35,
        "specificity": 0.30,
        "grounding": 0.15,
    }

    # Contribution bands based on response_score
    CONTRIBUTION_BANDS = [
        (8.5, 3.5),   # 8.5-10: STAR-complete
        (7.0, 2.5),   # 7.0-8.4: Strong
        (5.5, 1.5),   # 5.5-6.9: Average
        (4.0, 0.5),   # 4.0-5.4: Weak
        (0.0, 0.0),   # <4.0: Surface
    ]

    @staticmethod
    def calculate_response_score(quality: dict) -> float:
        """Weighted average of quality dimensions."""
        return (
            quality.get("clarity", 5.0) * ResponseScoreCalculator.WEIGHTS["clarity"]
            + quality.get("depth", 5.0) * ResponseScoreCalculator.WEIGHTS["depth"]
            + quality.get("specificity", 5.0) * ResponseScoreCalculator.WEIGHTS["specificity"]
            + quality.get("grounding", 5.0) * ResponseScoreCalculator.WEIGHTS["grounding"]
        )

    @staticmethod
    def calculate_contribution(response_score: float) -> float:
        """Map response score to saturation contribution."""
        for threshold, contribution in ResponseScoreCalculator.CONTRIBUTION_BANDS:
            if response_score >= threshold:
                return contribution
        return 0.0


class SignalPenaltyCalculator:
    """Calculate saturation score modifiers from behavioral signals.

    Negative modifiers slow saturation (evasion/integrity signals): candidate
    must prove more before moving on.
    Positive modifiers accelerate saturation (genuine strength signals): strong
    candidates move to next topic faster — this is the core adaptive behavior.
    """

    MODIFIERS = {
        "follow_up_collapse": -1.5,
        # Behavioral — hiding or evading: hold the topic, extract real evidence
        "example_evasion": -1.5,
        "ownership_ambiguity": -1.5,
        "resume_claim_mismatch": -1.2,
        # Anti-cheat timing
        "latency_mismatch": -1.0,
        "complexity_latency_mismatch": -1.2,
        # Strength signals — candidate is genuinely strong: accelerate topic transition
        "strong_under_pressure": +0.5,   # Maintained depth on follow-up → move on sooner
        "ownership_clarified": +0.3,     # Named personal ownership clearly → credit given
        "example_given": +0.3,           # Gave a concrete example unprompted → credit given
    }

    @staticmethod
    def calculate_penalties(signal_events: list[dict]) -> float:
        """Sum all signal modifiers — both negative (evasion) and positive (strength)."""
        total = 0.0
        for event in signal_events:
            signal_name = event.get("signal_name", "")
            modifier = SignalPenaltyCalculator.MODIFIERS.get(signal_name, 0.0)
            total += modifier
        return total




# ---------------------------------------------------------------------------
# Pydantic input schema — validates and coerces the raw Redis payload dict
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
    # Current topic + covered topics
    active_topic: Optional[str] = None
    active_topic_state: Optional[Dict[str, Any]] = None  # Serialized TopicState
    covered_topic_keys: List[str] = Field(default_factory=list)
    discussed_log: List[str] = Field(default_factory=list)
    # Combined topic pool (resume projects + JD skills, priority-ordered)
    resume_topics: List[str] = Field(default_factory=list)
    skill_topics: List[str] = Field(default_factory=list)
    anchor_item: Optional[str] = None
    job_title: str = "the role"
    remaining_seconds: float = 999.0
    trust_state: Dict[str, Any] = Field(default_factory=dict)
    current_interview_mode: str = "normal"
    # Candidate brief fields (for context logging)
    anchor_full: Optional[str] = None
    projects_full: List[str] = Field(default_factory=list)
    work_history_full: List[str] = Field(default_factory=list)
    internships_full: List[str] = Field(default_factory=list)
    education_full: List[str] = Field(default_factory=list)
    candidate_name: str = "?"
    band: str = "mid"
    time_limit_mins: int = 20
    topic_score_history: List[float] = Field(default_factory=list)
    # The actual question Ishita asked this turn — used to detect topic drift.
    # If Ishita's question mentions a topic not in active_topic, the worker auto-corrects.
    ai_question_this_turn: str = ""
    # routing_topic = _active_topic in agent (may already be the new topic after MOVE_ON).
    # active_topic = the topic the candidate's answer is actually ABOUT (question topic).
    # Worker uses active_topic for scoring/saturation and routing_topic for next-topic selection.
    routing_topic: str = ""

    model_config = {"extra": "allow"}  # Ignore unknown fields silently


# ---------------------------------------------------------------------------
# Topic normalization (shared utility)
# ---------------------------------------------------------------------------

def _normalize_topic_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


# ---------------------------------------------------------------------------
# TopicTracker — unified single topic pool, O(1) set-based lookups
# ---------------------------------------------------------------------------

class TopicTracker:
    """
    Unified topic selection and coverage tracking for the single interview stage.

    Topic priority order: resume_topics (projects/work/internships) first,
    then skill_topics (JD must-haves not yet surfaced). Uses set[str] for
    O(1) covered-key lookups — no substring scanning.
    """

    def __init__(
        self,
        *,
        resume_topics: List[str],
        skill_topics: List[str],
        covered_keys: Set[str],
        discussed_log: List[str],
        active_topic: Optional[str],
        job_title: str,
    ) -> None:
        self.resume_topics = resume_topics
        self.skill_topics = skill_topics
        self.covered_keys: Set[str] = set(covered_keys)
        self.discussed_log = discussed_log
        self.active_topic = active_topic
        self.job_title = job_title

    def mark_covered(self, topic: Optional[str]) -> None:
        if topic:
            self.covered_keys.add(_normalize_topic_key(topic))

    def next_uncovered(self, exclude: Optional[str] = None) -> Optional[str]:
        """Return the highest-priority uncovered topic (resume first, then skills).

        Uses only the covered_keys set for O(1) dedup — no substring scanning of
        discussed_log. The old covered_text check caused false-positive skips where
        a log entry like '- MediSnap: I integrated OCR...' would match 'OCR' as a
        skill topic and silently skip it before it was ever asked.
        """
        excluded_key = _normalize_topic_key(exclude or "")
        return next(
            (
                t for t in (self.resume_topics + self.skill_topics)
                if (key := _normalize_topic_key(t))
                and key != excluded_key
                and key not in self.covered_keys
            ),
            None,
        )

    def fallback_next(self, exclude: Optional[str] = None) -> str:
        """Return the best available next topic — always returns a non-empty string."""
        excluded_key = _normalize_topic_key(exclude or "")
        nxt = self.next_uncovered(exclude=exclude)
        if nxt:
            return nxt
        # All topics covered — pick any that isn't the current one
        for topic in (self.resume_topics + self.skill_topics):
            key = _normalize_topic_key(topic)
            if key and key != excluded_key:
                return topic
        return f"a concrete example using one of the {self.job_title} role skills"

    def is_question_duplicate(self, question_text: str) -> bool:
        q = (question_text or "").strip().lower()
        if not q or not self.discussed_log:
            return False
        q_words = set(re.sub(r"[^a-z0-9\s]", " ", q).split())
        if not q_words:
            return False
        for line in self.discussed_log[-12:]:
            line_words = set(re.sub(r"[^a-z0-9\s]", " ", line.lower()).split())
            if not line_words:
                continue
            overlap = len(q_words & line_words) / max(1, len(q_words))
            if overlap >= 0.55:
                return True
        return False

    def recent_anchor(self) -> str:
        if not self.discussed_log:
            return "earlier in our discussion"
        latest = str(self.discussed_log[-1]).lstrip("- ").strip()
        if ":" in latest:
            latest = latest.split(":", 1)[0].strip()
        latest = latest[:80].strip()
        if not latest:
            return "earlier in our discussion"
        return f"during our discussion on {latest}"



class DirectiveCompiler:
    """
    Stateless factory for all directive strings injected into the LLM context.
    Separates 'what to tell the LLM' from 'how to decide what to tell it'.
    """

    @staticmethod
    def move_on(next_goal: str, new_topic: str = "") -> str:
        topic_line = f"NEW ACTIVE TOPIC: {new_topic}\n" if new_topic else ""
        return (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: MOVE_ON\n"
            f"{topic_line}"
            f"YOUR ONLY JOB THIS TURN: {next_goal}\n"
            "HARD RULE: Do NOT ask any follow-up about the previous topic. "
            "Do NOT reference it. Acknowledge in one sentence max, then pivot immediately.\n"
            "DO NOT wrap up, say goodbye, or ask 'any questions for me'. "
            "The interview is NOT over — keep going until the system tells you to stop."
        )

    @staticmethod
    def append_memory_block(directive: str, discussed_log: List[str]) -> str:
        if not discussed_log:
            return directive
        # Last 5 entries: covers up to 5 follow-ups on the current topic so the LLM
        # can see the full conversation arc and not repeat an angle asked early on.
        # 3 was too few — on topics with 4+ follow-ups the first question dropped off
        # and the LLM repeated it. 5 adds ~40 tokens, well worth the repeat prevention.
        covered_block = (
            "\n[INTERVIEW MEMORY — DO NOT RE-ASK THESE]\n"
            + "\n".join(discussed_log[-5:])
            + "\n"
        )
        return directive + covered_block

    @staticmethod
    def append_no_early_closing(directive: str) -> str:
        return (
            directive
            + "\n[NO_EARLY_CLOSING_GUARD — DO NOT SAY ALOUD]\n"
            + "Do NOT end the interview, do NOT say goodbye/thanks-for-your-time/next-steps yet. "
            + "Continue with the next interview question naturally."
        )


# ---------------------------------------------------------------------------
# Main pipeline function  (same dict contract as before, unified keys)
# ---------------------------------------------------------------------------

def evaluate_topic_saturation(
    topic_state: Optional[TopicState],
    quality_scores: Dict[str, float],
    signal_events: list[dict],
    turn: int = 0,
    skip_quality_contribution: bool = False,
) -> tuple[bool, str]:
    """
    Evaluate if a topic has reached saturation based on answer quality and signals.

    skip_quality_contribution=True when the quality scorer timed out — we skip the
    quality band entirely and only add base_turn_credit so the candidate isn't
    punished for a network failure.

    Returns: (is_saturated, saturation_status_str)
    """
    if not topic_state:
        return False, "no_topic"

    # Calculate response score using weighted formula
    response_score = ResponseScoreCalculator.calculate_response_score(quality_scores)
    contribution = 0.0 if skip_quality_contribution else ResponseScoreCalculator.calculate_contribution(response_score)

    # Apply signal modifiers — negative (evasion) slow saturation, positive (strength) accelerate it.
    # Floor only applies to negative net modifiers: a strong answer can never drop below 30% of its
    # earned contribution. Positive modifiers from strength signals are never floored — they add on top.
    signal_modifier = SignalPenaltyCalculator.calculate_penalties(signal_events)
    if signal_modifier < 0:
        # Evasion/integrity signals: floor at 30% so a good answer still contributes something
        final_contribution = max(contribution * 0.3, contribution + signal_modifier)
    else:
        # Strength signals: add directly — no cap, strong candidates should move topics faster
        final_contribution = contribution + signal_modifier

    # Store state BEFORE increment for comparison logging
    score_before = topic_state.saturation_score
    follow_ups_before = topic_state.follow_up_turns

    # Add to saturation score. Pass 0.0 for signal_penalties because final_contribution
    # already incorporates the penalty — passing it again would double-apply it.
    topic_state.add_response_contribution(final_contribution, 0.0, turn=turn)

    # DETAILED LOG: Show the saturation calculation
    logger.info(
        "[SAT_CALC] topic=%s | response_score=%.2f contribution=%.2f signal_modifier=%+.2f final_contribution=%.2f",
        topic_state.topic_name, response_score, contribution, signal_modifier, final_contribution,
    )
    logger.info(
        "[SAT_CALC] base_credit=%.1f | score: %.1f → %.1f (delta=+%.1f) | follow_ups: %d → %d",
        topic_state.base_turn_credit,
        score_before, topic_state.saturation_score, topic_state.saturation_score - score_before,
        follow_ups_before, topic_state.follow_up_turns,
    )

    # Check saturation
    if topic_state.is_saturated:
        logger.info(
            "[SAT_RESULT] ✅ SATURATED | score=%.1f >= threshold=%.1f (%.0f%%) | importance=%s",
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


async def run_eval_and_build_directive(payload: dict, client: AsyncOpenAI) -> dict:
    """
    Pure function: takes serialized session state, returns directive + state mutations.
    Called by eval_worker in a separate process. Never touches agent state directly.
    """

    # ── Parse + validate payload via Pydantic ────────────────────────────────
    p = EvaluationPayload(**payload)

    # ── Early guard: Clarification, connection check, or explicit redirect ───────
    _utterance_cls = classify_short_utterance(p.answer)
    _is_clarification_turn = (
        _utterance_cls is not None
        and _utterance_cls["response_class"] in ("clarification_question", "connection_check")
    )
    _is_explicit_redirect = (
        _utterance_cls is not None
        and _utterance_cls["response_class"] == "explicit_redirect"
    )

    if _is_explicit_redirect:
        # Candidate said "don't ask about X" or "ask about my skills/work instead"
        # MOVE_ON immediately — don't probe, don't rephrase, just go to next topic.
        logger.info(
            "[EVAL_PIPELINE] Explicit redirect detected (text=%r) — forcing MOVE_ON turn=%d",
            (p.answer or "")[:80], p.turn,
        )
        tracker_redirect = TopicTracker(
            resume_topics=p.resume_topics, skill_topics=p.skill_topics,
            covered_keys=set(p.covered_topic_keys), discussed_log=list(p.discussed_log),
            active_topic=p.active_topic, job_title=p.job_title,
        )
        tracker_redirect.mark_covered(p.active_topic)
        _redirect_next = tracker_redirect.fallback_next(exclude=p.active_topic)
        _redirect_directive = (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: MOVE_ON\n"
            f"NEW ACTIVE TOPIC: {_redirect_next}\n"
            "CANDIDATE REDIRECTED — they asked you not to continue on this topic.\n"
            "Respect it. One brief acknowledgement ('Sure, let's go there'), then ask "
            f"one natural question about: {_redirect_next}.\n"
            "Do NOT reference the previous topic again."
        )
        return {
            "app_id": p.app_id, "turn": p.turn,
            "directive": _redirect_directive, "action": "MOVE_ON",
            "td": {"decision": {"action": "MOVE_ON", "mode": "normal", "next_goal": f"Move to {_redirect_next}"},
                   "quality": {"clarity": 0.0, "depth": 0.0, "specificity": 0.0, "grounding": 0.0}},
            "quality_record": None, "signal_events": [],
            "depth_signal": "SURFACE",
            "freeze_followup_increment": True,
            "new_active_topic": _redirect_next,
            "new_covered_topic_keys": list(tracker_redirect.covered_keys),
            "new_active_topic_state": None,
            "new_trust_state": dict(p.trust_state),
            "new_current_interview_mode": p.current_interview_mode,
            "risk_integrity_delta": 0, "risk_depth_delta": 0,
            "discussed_log_entry": None,
        }

    if _is_clarification_turn:
        _cls_name = _utterance_cls["response_class"]
        # Edge case: MOVE_ON already happened (N-1 lag) before the candidate said
        # "can you repeat". p.routing_topic = new topic, p.active_topic = old topic.
        # Rephrasing the OLD question is wrong — the agent already pivoted.
        # Correct behaviour: treat this as the first question on the NEW topic,
        # re-ask that opening question simply and clearly.
        _post_moveon_rephrase = bool(p.routing_topic and p.routing_topic != p.active_topic)
        logger.info(
            "[EVAL_PIPELINE] Clarification/connection detected (class=%s, text=%r) — "
            "injecting REPHRASE directive turn=%d (post_moveon=%s)",
            _cls_name, (p.answer or "")[:60], p.turn, _post_moveon_rephrase,
        )
        if _post_moveon_rephrase:
            # MOVE_ON already fired — rephrase as the NEW topic's opening question
            _new_topic = p.routing_topic
            _rephrase_directive = (
                "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                "DECISION: REPHRASE\n"
                f"NOTE: We already moved to a new topic: {_new_topic}\n"
                "NEXT MOVE: The candidate asked to repeat the question, but we already moved on. "
                f"Say 'Sure! We've actually moved to {_new_topic} — ' then ask ONE simple, clear "
                f"opening question about {_new_topic}. What did they personally build or own there?\n"
                "[FOLLOW_UP_RULE] This turn does NOT count as a follow-up. Counter is unchanged."
            )
        else:
            _rephrase_directive = (
                "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                "DECISION: REPHRASE\n"
                "NEXT MOVE: The candidate asked for clarification or forgot the question. "
                "Briefly acknowledge ('Sure!', 'No worries!'), then rephrase your last question "
                "in simpler, shorter language. Do NOT ask a brand-new question — re-ask the same one more clearly.\n"
                "[FOLLOW_UP_RULE] This turn does NOT count as a follow-up. Counter is unchanged."
            )
        _rephrase_directive = DirectiveCompiler.append_memory_block(_rephrase_directive, list(p.discussed_log))
        return {
            "app_id": p.app_id,
            "turn": p.turn,
            "directive": _rephrase_directive,
            "action": "REPHRASE",
            "td": {
                "decision": {"action": "REPHRASE", "mode": "clarification", "next_goal": "Rephrase last question"},
                "quality": {"clarity": 0.0, "depth": 0.0, "specificity": 0.0, "grounding": 0.0},
            },
            "quality_record": None,
            "signal_events": [],
            "depth_signal": "SURFACE",
            "freeze_followup_increment": True,
            "new_active_topic": p.active_topic,
            "new_covered_topic_keys": list(p.covered_topic_keys),
            "new_active_topic_state": None,
            "new_trust_state": dict(p.trust_state),
            "new_current_interview_mode": p.current_interview_mode,
            "risk_integrity_delta": 0,
            "risk_depth_delta": 0,
            "discussed_log_entry": None,
        }

    # ── Initialize mutable working copies ────────────────────────────────────
    new_active_topic = p.active_topic
    new_current_interview_mode = p.current_interview_mode
    new_trust_state: dict = dict(p.trust_state)

    signal_events: list = []
    risk_integrity_delta = 0
    risk_depth_delta = 0
    discussed_log_entry: Optional[str] = None

    old_active_topic = p.active_topic

    # ── Construct OOP helpers ────────────────────────────────────────────────
    tracker = TopicTracker(
        resume_topics=p.resume_topics,
        skill_topics=p.skill_topics,
        covered_keys=set(p.covered_topic_keys),
        discussed_log=list(p.discussed_log),
        active_topic=p.active_topic,
        job_title=p.job_title,
    )

    # ── Initialize/restore TopicState for current topic ────────────────────────
    current_topic_state: Optional[TopicState] = None
    if p.active_topic and p.active_topic_state:
        # Use from_dict() factory — single validated restore path, no silent field drops
        current_topic_state = TopicState.from_dict(p.active_topic_state)

        logger.info(
            "[TOPIC_STATE] RESTORED | topic=%s importance=%s | saturation_score=%.1f/%s follow_ups=%d base_credit=%.1f",
            current_topic_state.topic_name, current_topic_state.importance,
            current_topic_state.saturation_score, current_topic_state.saturation_threshold,
            current_topic_state.follow_up_turns, current_topic_state.base_turn_credit,
        )
    elif p.active_topic:
        # Create new TopicState for current topic
        # Determine source: anchor → CRITICAL, resume_topics → HIGH, skill_topics → MEDIUM
        _topic_key = _normalize_topic_key(p.active_topic)
        _resume_keys = {_normalize_topic_key(t) for t in p.resume_topics}
        _topic_source = (
            "resume" if _topic_key in _resume_keys else
            "skill"  # skill_topics or unknown — defaults to MEDIUM
        )
        importance = TopicImportanceClassifier.classify(
            topic_source=_topic_source,
            is_anchor=p.active_topic == p.anchor_item,
        )
        current_topic_state = TopicState(p.active_topic, importance, updated_turn=p.turn, band=p.band)

        logger.info(
            "[TOPIC_STATE] CREATED NEW | topic=%s source=%s importance=%s band=%s | threshold=%.1f base_credit=%.1f",
            p.active_topic, _topic_source, importance, p.band,
            current_topic_state.saturation_threshold, current_topic_state.base_turn_credit,
        )

    # ── Bootstrap: no active_topic yet → pick first uncovered topic ──────────
    # Without this, the agent never sends an active_topic on turn 3 (first eval turn)
    # because _active_topic starts None and is only set after reading a result.
    # The eval_pipeline would then always return new_active_topic=None, creating a
    # permanent "no topic" loop where PROBE/VERIFY never initialize saturation state.
    # Use `not p.active_topic` (not `is None`) to also handle empty-string edge case.
    if not p.active_topic:
        _first_topic = tracker.next_uncovered(exclude=None)
        logger.info("[TOPIC_BOOT] active_topic empty — next_uncovered=%s (resume_topics=%d skill_topics=%d covered=%d)",
                   _first_topic or "NONE", len(p.resume_topics), len(p.skill_topics), len(tracker.covered_keys))
        if _first_topic:
            new_active_topic = _first_topic
            _tk = _normalize_topic_key(_first_topic)
            _resume_keys_boot = {_normalize_topic_key(t) for t in p.resume_topics}
            _boot_src = "resume" if _tk in _resume_keys_boot else "skill"
            _boot_importance = TopicImportanceClassifier.classify(
                topic_source=_boot_src,
                is_anchor=_first_topic == p.anchor_item,
            )
            current_topic_state = TopicState(_first_topic, _boot_importance, updated_turn=p.turn, band=p.band)
            logger.info(
                "[TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='%s' source=%s importance=%s band=%s | threshold=%.1f base_credit=%.1f turn=%d",
                _first_topic, _boot_src, _boot_importance, p.band,
                current_topic_state.saturation_threshold, current_topic_state.base_turn_credit,
                p.turn,
            )

    # ── Topic alignment guard ────────────────────────────────────────────────
    # Problem: if a previous SYNC_GATE miss meant the agent never applied a MOVE_ON
    # result, the next payload arrives with stale active_topic. But the AI's actual
    # question (ai_question_this_turn) reveals what topic Ishita really moved to.
    # We check if any resume/skill topic appears in Ishita's question — if it does
    # and differs from the stale active_topic, we auto-correct before scoring.
    if p.ai_question_this_turn and p.active_topic:
        _ai_q_lower = p.ai_question_this_turn.lower()
        _stale_key = _normalize_topic_key(p.active_topic)
        _all_topics = p.resume_topics + p.skill_topics
        _best_match: Optional[str] = None
        _best_score = 0
        for _t in _all_topics:
            _t_key = _normalize_topic_key(_t)
            if not _t_key or _t_key == _stale_key:
                continue
            # Count how many words of the topic appear in the question
            _t_words = [w for w in _t_key.split() if len(w) >= 4]
            if not _t_words:
                continue
            _hits = sum(1 for w in _t_words if w in _ai_q_lower)
            _score = _hits / len(_t_words)
            if _score >= 0.5 and _score > _best_score:
                _best_score = _score
                _best_match = _t
        if _best_match:
            _corrected_key = _normalize_topic_key(_best_match)
            logger.warning(
                "[TOPIC_ALIGN] Stale topic detected | payload_topic=%r AI_asked_about=%r "
                "(match_score=%.0f%%) — auto-correcting turn=%d",
                p.active_topic, _best_match, _best_score * 100, p.turn,
            )
            # Mark the stale topic as covered and open the new one
            tracker.mark_covered(p.active_topic)
            new_active_topic = _best_match
            _tk_new = _corrected_key
            _resume_keys_align = {_normalize_topic_key(t) for t in p.resume_topics}
            _src_new = "resume" if _tk_new in _resume_keys_align else "skill"
            _imp_new = TopicImportanceClassifier.classify(
                topic_source=_src_new,
                is_anchor=_best_match == p.anchor_item,
            )
            current_topic_state = TopicState(_best_match, _imp_new, updated_turn=p.turn, band=p.band)
            logger.info(
                "[TOPIC_ALIGN] ✅ Corrected to topic=%r importance=%s | threshold=%.1f turn=%d",
                _best_match, _imp_new, current_topic_state.saturation_threshold, p.turn,
            )

    # ── Context log box ──────────────────────────────────────────────────────
    _saturation_status = ""
    if current_topic_state:
        _sat_pct = 100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold)
        _saturation_status = f" | saturation={_sat_pct:.0f}% ({current_topic_state.saturation_score:.1f}/{current_topic_state.saturation_threshold})"
    _routing_note = ""
    if p.routing_topic and p.routing_topic != p.active_topic:
        _routing_note = f" | agent_routing_on={p.routing_topic!r} (answer is about={p.active_topic!r})"
    logger.info(
        "[TURN] INTERVIEW | turn=%d | scoring_topic=%s | covered=%s | remaining=%.0fs | mode=%s%s%s",
        p.turn,
        (p.active_topic or "?"),
        list(tracker.covered_keys) if tracker.covered_keys else "none",
        p.remaining_seconds, p.current_interview_mode,
        _saturation_status,
        _routing_note,
    )
    logger.info(
        "[QA] turn=%d  Q: %s\n              A: %s",
        p.turn,
        (p.question or "")[:200],
        (p.answer or "")[:200],
    )

    # ── Step 3: Run turn evaluation ───────────────────────────────────────────
    _follow_up_count = current_topic_state.follow_up_turns if current_topic_state else 0
    _topic_depth_scores = [
        float(r) for r in p.topic_score_history if isinstance(r, (int, float))
    ]

    # uncovered_topics is only used when action becomes MOVE_ON (inside _do_move_on
    # and the MOVE_ON directive builder). On PROBE turns (the majority) this O(n)
    # scan was wasted. We now compute it lazily via a closure — zero cost on PROBE,
    # same result on MOVE_ON.
    _uncovered_topics_cache: list = []
    _uncovered_topics_computed: bool = False

    def _get_uncovered_topics() -> list:
        nonlocal _uncovered_topics_cache, _uncovered_topics_computed
        if not _uncovered_topics_computed:
            _nxt = tracker.next_uncovered(exclude=p.active_topic)
            _uncovered_topics_cache = [_nxt] if _nxt else []
            _uncovered_topics_computed = True
        return _uncovered_topics_cache

    # Keep a stable reference for the eval call — run_turn_evaluation needs it
    # to build the MOVE_ON part of the directive if the LLM decides MOVE_ON.
    # This triggers the scan once and caches it for any subsequent callers.
    uncovered_topics: list = _get_uncovered_topics()
    logger.info(
        "[EVAL_PIPELINE] Step2/Topics: uncovered_next=%s | discussed_log=%d entries",
        uncovered_topics[0] if uncovered_topics else "none",
        len(p.discussed_log),
    )

    # Capture LLM usage from evaluate_answer via a wrapper closure
    _captured_eval_usage: list[dict] = []

    async def _evaluate_answer_capturing(**kwargs):
        result = await evaluate_answer(**kwargs)
        usage = result.pop("_llm_usage", None)
        if usage:
            _captured_eval_usage.append(usage)
        return result

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
    )

    _eval_llm_usages: list[dict] = list(_captured_eval_usage)  # from evaluate_answer wrapper

    try:
        _eval_result = await asyncio.wait_for(_eval_coro, timeout=5.5)
    except asyncio.TimeoutError:
        _eval_result = asyncio.TimeoutError()

    # Settle eval — handle timeout or exception
    if isinstance(_eval_result, (asyncio.TimeoutError, Exception)):
        logger.warning("[EVAL_PIPELINE] run_turn_evaluation timed out (>5.5s) turn=%d — using low-score fallback", p.turn)
        _fallback_action = "PROBE"
        _fallback_next = (
            "Ask one specific follow-up question about what they personally built or decided. "
            "Make it concrete and direct."
        )
        td = {
            "decision": {"action": _fallback_action, "mode": "normal", "next_goal": _fallback_next},
            "quality": {"clarity": 1.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0, "is_timeout": True},
            "signal_events": [],
        }
        directive = (
            f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            f"DECISION: {_fallback_action}\n"
            f"NEXT MOVE: {_fallback_next}"
        )
    else:
        td, directive = _eval_result

    action: str = td["decision"]["action"]
    signal_events = td.get("signal_events", [])
    freeze_followup_increment = False

    # Detect scorer timeout — quality scores are low 1s (not 5s), not real measurements.
    # Skip quality contribution to saturation so the candidate isn't punished.
    # Scores are 1 (not 5) as a double safety net: if is_timeout flag ever fails,
    # 1s produce near-zero saturation contribution vs old 5s which inflated scores.
    _quality_is_timeout = bool(td.get("quality", {}).get("is_timeout", False))

    # Use the same weighted score that saturation uses so depth_signal thresholds
    # are on the same scale. Previously this was a simple average, which diverged
    # from the weighted saturation score and caused DEEP/SPECIFIC to fire at wrong times.
    _weighted_quality = ResponseScoreCalculator.calculate_response_score(td["quality"])
    # quality_avg kept as simple avg only for log readability and risk delta math
    quality_avg = (
        td["quality"]["clarity"] + td["quality"]["depth"]
        + td["quality"]["specificity"] + td["quality"]["grounding"]
    ) / 4.0

    # Classify depth using the weighted score — thresholds align with contribution bands:
    # 7.0 = Strong band boundary, 5.5 = Average band boundary
    depth_signal = "SURFACE"
    if _weighted_quality >= 7.0:
        depth_signal = "DEEP"
    elif _weighted_quality >= 5.5:
        depth_signal = "SPECIFIC"

    # ── Log evaluator decision ────────────────────────────────────────────────
    _all_signal_names = [ev.get("signal_name", "?") for ev in signal_events if ev.get("signal_name")]

    logger.info(
        "[QUALITY] turn=%d | clarity=%.1f depth=%.1f specificity=%.1f grounding=%.1f | avg=%.2f weighted=%.2f depth_signal=%s%s",
        p.turn,
        td["quality"]["clarity"], td["quality"]["depth"],
        td["quality"]["specificity"], td["quality"]["grounding"],
        quality_avg, _weighted_quality, depth_signal,
        " [TIMEOUT-no-sat-credit]" if _quality_is_timeout else "",
    )
    logger.info(
        "[EVAL] turn=%d action=%s mode=%s quality_avg=%.2f signals=[%s]",
        p.turn, action, td["decision"].get("mode", "?"),
        quality_avg,
        ", ".join(_all_signal_names) if _all_signal_names else "none",
    )
    for _ev in signal_events:
        if _ev.get("signal_name"):
            logger.info(
                "[SIGNAL] name=%-28s layer=%-20s confidence=%.2f delta=%+.2f turn=%d",
                _ev.get("signal_name", "?"), _ev.get("signal_layer", "?"),
                float(_ev.get("confidence", 0.5) or 0.5),
                float(_ev.get("score_delta", 0) or 0), p.turn,
            )

    # ── Step 5: Already-covered question dedupe ──────────────────────────────
    if action in ("PROBE", "VERIFY") and tracker.is_question_duplicate(p.question):
        next_topic_hint = tracker.fallback_next(exclude=p.active_topic)
        new_active_topic = next_topic_hint
        anchor = tracker.recent_anchor()
        action = "MOVE_ON"
        td["decision"]["action"] = "MOVE_ON"
        td["decision"]["next_goal"] = (
            f"This topic is already covered {anchor}. Acknowledge professionally, close that thread, then pivot to "
            f"{next_topic_hint}. Ask a new question on that next topic, not a follow-up on the old one."
        )
        directive = (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: MOVE_ON\n"
            f"NEXT MOVE: This was already covered {anchor}. Say a short acknowledgement like "
            f"'Thanks, I think we already covered this {anchor}' and ask one fresh question on {next_topic_hint}."
        )
        logger.info("[EVAL_PIPELINE] Dedupe detected — forcing MOVE_ON turn=%d", p.turn)

    # NOTE: depth_signal is already computed from weighted score above (line ~810).
    # The old second pass using simple quality_avg with a different threshold (4.5) was
    # overwriting the weighted result and creating a log/behavior mismatch.
    # Removed — weighted score path is the authoritative computation.

    # ── Step 6: Saturation-based decision (PART 3) ──────────────────────────
    # NEW SYSTEM: Evaluate if topic has reached saturation based on quality + signals
    # REPLACED: Old fixed "max 2 follow-ups" logic with adaptive saturation scoring

    next_topic_hint: Optional[str] = None
    signal_fired_names = [ev.get("signal_name", "") for ev in signal_events]

    # depth_decay: candidate is fatiguing — force MOVE_ON regardless of saturation
    depth_decay_fired = any(ev.get("signal_name") == "depth_decay" for ev in signal_events)

    # Evaluate saturation for current topic
    is_saturated, saturation_status = evaluate_topic_saturation(
        current_topic_state,
        td.get("quality", {}),
        signal_events,
        turn=p.turn,
        skip_quality_contribution=_quality_is_timeout,
    )

    logger.info(
        "[SATURATION] turn=%d | topic=%s | %s | signals=[%s]%s",
        p.turn,
        (current_topic_state.topic_name if current_topic_state else "?"),
        saturation_status,
        ", ".join(signal_fired_names) if signal_fired_names else "none",
        " | depth_decay→MOVE_ON" if depth_decay_fired else "",
    )

    # Holds the freshly-initialized TopicState for the incoming topic after a MOVE_ON.
    # Kept separate so the return dict doesn't accidentally send the old topic's saturated state.
    next_topic_state: Optional[TopicState] = None

    # Time-aware saturation tightening: in the final 5 minutes, if a topic is more
    # than 50% saturated, force MOVE_ON to ensure remaining topics get coverage.
    # Without this, a strong candidate on a CRITICAL topic can hold the interviewer
    # pinned to one topic for the entire final stretch.
    _time_pressure_exit = (
        p.remaining_seconds <= 300
        and current_topic_state is not None
        and not is_saturated  # only override if not already saturating naturally
        and current_topic_state.saturation_threshold > 0
        and (current_topic_state.saturation_score / current_topic_state.saturation_threshold) >= 0.50
        and action not in ("MOVE_ON",)
    )

    def _do_move_on(reason: str) -> None:
        nonlocal action, new_active_topic, directive, next_topic_state
        action = "MOVE_ON"
        td["decision"]["action"] = "MOVE_ON"
        tracker.mark_covered(old_active_topic)
        _next = tracker.fallback_next(exclude=old_active_topic)
        new_active_topic = _next
        _goal = (
            f"Acknowledge briefly and move to: {_next}. "
            "Ask one focused question about what they personally built or owned there. "
            "Do NOT ask a follow-up on the previous topic."
        )
        td["decision"]["next_goal"] = _goal
        directive = DirectiveCompiler.move_on(_goal, new_topic=_next or "")
        # Build a fresh TopicState for the incoming topic so the agent starts clean
        if _next:
            _next_key = _normalize_topic_key(_next)
            _resume_keys_next = {_normalize_topic_key(t) for t in p.resume_topics}
            _next_source = "resume" if _next_key in _resume_keys_next else "skill"
            _next_importance = TopicImportanceClassifier.classify(
                topic_source=_next_source,
                is_anchor=_next == p.anchor_item,
            )
            next_topic_state = TopicState(_next, _next_importance, updated_turn=p.turn, band=p.band)
        logger.info(
            "[SATURATION] MOVE_ON reason=%s → next=%s (importance=%s) turn=%d",
            reason, _next or "?", next_topic_state.importance if next_topic_state else "?", p.turn,
        )

    # Decision logic: saturation-based routing
    _weak_exit = (
        current_topic_state is not None
        and current_topic_state.is_weak_candidate_exit()
    )

    # DETAILED DECISION LOGGING
    if current_topic_state:
        logger.info(
            "[DECISION] turn=%d | depth_decay=%s weak_exit=%s saturated=%s action=%s",
            p.turn, depth_decay_fired, _weak_exit, is_saturated, action,
        )

    # ── Single decision point ────────────────────────────────────────────────
    # Priority (highest to lowest):
    #   1. depth_decay / time_pressure / weak_exit / saturated → MOVE_ON (no LLM override possible)
    #   2. LLM said MOVE_ON (explicit "enough was said") → MOVE_ON
    #   3. Everything else → PROBE (signal chooses family, then LLM mode, then ownership fallback)
    #
    # The LLM is consulted for two things only:
    #   a) action (PROBE/MOVE_ON) — "did the candidate say enough?"
    #   b) probe_mode (which family) — "what angle to probe next?"
    # Saturation is the final gate — even if LLM says PROBE, saturation can override to MOVE_ON.

    from interview.probe_strategy import _PROBE_FAMILIES, _SIGNAL_TO_FAMILY, _MODE_ALIASES

    def _resolve_probe_family() -> str:
        # 1. Signal fired → signal drives family (behavioral evidence beats LLM opinion)
        for sig_name, sig_family in _SIGNAL_TO_FAMILY:
            if sig_name in signal_fired_names and sig_family != "normal":
                return sig_family
        # 2. LLM returned a valid probe_mode
        llm_mode = str(td["decision"].get("mode") or "").strip().lower()
        if llm_mode in _PROBE_FAMILIES:
            return llm_mode
        if llm_mode in _MODE_ALIASES:
            return _MODE_ALIASES[llm_mode]
        # 3. Fallback
        return "ownership"

    if depth_decay_fired:
        logger.info("[DECISION] ✅ MOVE_ON reason=depth_decay turn=%d", p.turn)
        _do_move_on("depth_decay")

    elif _time_pressure_exit:
        _pct = round(100 * current_topic_state.saturation_score / current_topic_state.saturation_threshold, 0)
        logger.info("[DECISION] ✅ MOVE_ON reason=time_pressure (%.0f%% sat, %.0fs left) turn=%d",
                    _pct, p.remaining_seconds, p.turn)
        _do_move_on(f"time_pressure(sat={_pct:.0f}%)")

    elif _weak_exit:
        logger.info("[DECISION] ✅ MOVE_ON reason=weak_exit (turns=%d score=%.1f<min=%.1f) turn=%d",
                    current_topic_state.follow_up_turns, current_topic_state.saturation_score,
                    current_topic_state.saturation_threshold * current_topic_state.progress_check_pct, p.turn)
        _do_move_on(f"weak_exit(score={current_topic_state.saturation_score:.1f})")

    elif is_saturated:
        logger.info("[DECISION] ✅ MOVE_ON reason=saturated (score=%.1f>=%.1f) turn=%d",
                    current_topic_state.saturation_score, current_topic_state.saturation_threshold, p.turn)
        _do_move_on(f"saturated({saturation_status})")

    elif action == "MOVE_ON":
        # LLM explicitly said enough was said — trust it
        logger.info("[DECISION] ✅ MOVE_ON reason=llm_judge turn=%d", p.turn)
        _do_move_on("llm_judge")

    else:
        # PROBE — build directive from single resolved family
        probe_family = _resolve_probe_family()
        if probe_family not in _PROBE_FAMILIES:
            probe_family = "ownership"

        probe_goal  = _PROBE_FAMILIES[probe_family]["goal"]
        probe_style = _PROBE_FAMILIES[probe_family]["style"]
        td["decision"]["mode"] = probe_family
        td["decision"]["next_goal"] = probe_goal

        _prev_q = (p.question or "").strip()
        _prev_a = (p.answer or "").strip()
        _prev_a_gist = " ".join(_prev_a.split()[:20])
        _is_short = (
            float(td.get("quality", {}).get("overall", 5.0)) <= 0.5
            and float(td.get("quality", {}).get("depth", 5.0)) == 0.0
            and len(_prev_a.split()) < 8
        )
        _short_nudge = (
            "\nCANDIDATE GAVE A VERY SHORT ANSWER — push back warmly but directly.\n"
            "Don't just re-ask. React like a real interviewer who expected more:\n"
            "  - 'That's a start — can you give me a bit more to work with?'\n"
            "  - 'I'd love to hear more than that — what specifically did you do?'\n"
            "Sound like you genuinely want to hear the story, not like you're filling a form."
        ) if _is_short else ""

        pct_sat = 100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold) \
                  if current_topic_state else 0
        logger.info(
            "[DECISION] 🔄 PROBE family=%s signals=[%s] sat=%.0f%% turn=%d",
            probe_family, ", ".join(signal_fired_names) or "none", pct_sat, p.turn,
        )

        directive = (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            f"DECISION: PROBE ({probe_family.upper()})\n"
            f"BAND: {p.band.upper()}\n"
            f"ANGLE: {probe_goal}\n"
            f"HOW TO ASK: {probe_style}\n"
            f"LAST QUESTION YOU ASKED: \"{_prev_q}\"\n"
            f"CANDIDATE SAID: \"{_prev_a_gist}{'...' if len(_prev_a.split()) > 20 else ''}\"\n"
            "DO NOT ask the same question again. DO NOT rephrase it.\n"
            "Pick the most natural angle from ANGLE/HOW TO ASK based on what they actually said.\n"
            "ONE question only. Sound natural.\n"
            "DO NOT wrap up or say goodbye — the interview is still in progress."
            f"{_short_nudge}"
        )
        directive = DirectiveCompiler.append_memory_block(directive, list(p.discussed_log))

    # ── Step 7: Trust state update ─────────────────────────────────────────────
    new_trust_state = apply_turn_decision(
        new_trust_state,
        td,
        behavioral_toggles=p.signal_toggles,
    )

    for event in signal_events:
        event_delta = float(event.get("score_delta", 0.0) or 0.0)
        legacy_delta = int(round(max(0.0, -event_delta) * 100))
        signal_layer = str(event.get("signal_layer", "") or "")
        if legacy_delta:
            if signal_layer == "hard_integrity":
                risk_integrity_delta += legacy_delta
            else:
                risk_depth_delta += legacy_delta

    if depth_signal == "SURFACE":
        risk_depth_delta += 3

    if depth_signal == "DEEP" and p.current_interview_mode == "normal":
        new_current_interview_mode = "deep"


    # ── Step 9: Append discussed log entry on MOVE_ON ────────────────────────
    if action == "MOVE_ON" and p.question and p.answer:
        topic_line = p.question.split("?")[0].strip()[:80]
        answer_gist = " ".join(p.answer.split()[:20])
        discussed_log_entry = f"- {topic_line}: {answer_gist}"

    # ── Step 10: Append memory block — PROBE only ────────────────────────────
    # On MOVE_ON we do NOT inject old-topic memory into the directive. The LLM
    # is about to open a brand-new topic; giving it the previous topic's Q&A
    # anchors it to that topic and causes drift back. Only PROBE directives get
    # the discussed log so Ishita remembers what she already probed this topic.
    if action != "MOVE_ON":
        full_discussed = list(p.discussed_log)
        if discussed_log_entry:
            full_discussed.append(discussed_log_entry)
        directive = DirectiveCompiler.append_memory_block(directive, full_discussed)

    # ── Step 11: No longer needed with saturation system ─────────────────────
    # Old drift guard and enforce_move_on logic removed
    # Saturation scoring now drives topic transitions adaptively

    # ── Step 13: TOPIC_TAG_RULE + STRICT_MOVE_ON_RULE + guards ───────────────
    if p.remaining_seconds <= _NO_NEW_QUESTION_CUTOFF_SECONDS + 30:
        directive = DirectiveCompiler.append_no_early_closing(directive)

    # ── Final summary log box ─────────────────────────────────────────────────
    _signal_names_final = [ev.get("signal_name", "?") for ev in signal_events if ev.get("signal_name")]
    _sat_detail = ""
    if current_topic_state:
        _sat_detail = f"  saturation={current_topic_state.saturation_score:.1f}/{current_topic_state.saturation_threshold}  probe_index={current_topic_state.probe_rotation_index}"
    logger.info(
        "[RESULT] turn=%d  action=%-8s  quality=%.2f/%s  signals=[%s]%s\n"
        "         next=%-50s  covered=%s",
        p.turn,
        action, quality_avg, depth_signal,
        ", ".join(_signal_names_final) if _signal_names_final else "none",
        _sat_detail,
        str(new_active_topic or "?")[:50],
        list(tracker.covered_keys) if tracker.covered_keys else "none",
    )
    # ── E2E PIPELINE VERIFICATION LOG ─────────────────────────────────────────
    logger.info(
        "[E2E_VERIFY] turn=%d | PIPELINE_OUTPUT:\n"
        "  signals_fired    : %s\n"
        "  action_decided   : %s\n"
        "  EXPECTED_BEHAVIOR: %s\n"
        "  directive_injected: %s\n"
        "  topic_after      : %s (was: %s)\n"
        "  covered_topics   : %d total",
        p.turn,
        _signal_names_final or ["none"],
        action,
        (
            f"probe signal ({td['decision'].get('mode','?')})" if action == "VERIFY" else
            f"probe deeper on '{new_active_topic}' ({td['decision'].get('mode','?')})" if action == "PROBE" else
            f"move to next topic '{new_active_topic}'" if action == "MOVE_ON" else
            "rephrase last question" if action == "REPHRASE" else action
        ),
        directive[:150].replace("\n", " ↵ "),
        str(new_active_topic or "?")[:40],
        str(old_active_topic or "?")[:40],
        len(tracker.covered_keys),
    )

    # ── Quality record (includes topic for skill ratings aggregation) ────────────
    quality_record = {
        "turn": p.turn,
        "question": p.question,
        "answer": p.answer,
        "clarity": td["quality"]["clarity"],
        "depth": td["quality"]["depth"],
        "fluency": td["quality"].get("fluency", 0),
        "confidence": td["quality"].get("confidence", 0),
        "overall": quality_avg,
        "signals": [ev["signal_name"] for ev in signal_events if ev.get("signal_name")],
        "concerns": [ev["signal_name"] for ev in signal_events if ev.get("score_delta", 0.0) < 0],
        # Include topic info for skill ratings aggregation
        "topic": new_active_topic or p.active_topic or "general",
        "topic_saturation_score": current_topic_state.saturation_score if current_topic_state else 0.0,
        "topic_saturation_threshold": current_topic_state.saturation_threshold if current_topic_state else 0.0,
    }

    return {
        "app_id": p.app_id,
        "turn": p.turn,
        "input_active_topic": p.active_topic,
        "directive": directive,
        "action": action,
        "td": td,
        "quality_record": quality_record,
        "signal_events": signal_events,
        "depth_signal": depth_signal,
        "freeze_followup_increment": freeze_followup_increment,
        # Mutations — unified single topic with saturation state
        "new_active_topic": new_active_topic,
        "new_covered_topic_keys": list(tracker.covered_keys),
        # After MOVE_ON: return fresh state for the incoming topic (not the old saturated one).
        # On PROBE: return updated current state with new saturation score + probe index.
        "new_active_topic_state": (
            next_topic_state.to_dict() if next_topic_state else
            current_topic_state.to_dict() if current_topic_state else None
        ),
        "new_trust_state": new_trust_state,
        "new_current_interview_mode": new_current_interview_mode,
        "risk_integrity_delta": risk_integrity_delta,
        "risk_depth_delta": risk_depth_delta,
        "discussed_log_entry": discussed_log_entry,
        # Consumed by agent_runtime to persist billing for the 'interview' feature
        "eval_llm_usages": _eval_llm_usages,
    }

