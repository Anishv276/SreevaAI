"""
Standalone evaluation pipeline for the Redis worker architecture.

Unified 20-minute interview — single topic pool (resume projects + JD skills),
no stage index, no dual topic trackers.
Topic priority: resume projects/work/internships → JD skills → next uncovered.

Contract: run_eval_and_build_directive(payload: dict, client) -> dict
"""
from __future__ import annotations

import asyncio
import re
import logging
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field
from openai import AsyncOpenAI

from interview.turn_evaluator import run_turn_evaluation
from interview.turn_decision import classify_short_utterance
from interview.trust_engine import apply_turn_decision, apply_contradiction_resolved
from interview.contradiction_state import advance_contradiction_state, summarize_contradiction_state
from interview.agent_scoring import (
    check_contradiction,
    evaluate_answer_and_decide,
    extract_claims,
    score_answer_quality,
)

logger = logging.getLogger("eval_worker")


# ---------------------------------------------------------------------------
# Topic Saturation System (PART 2)
# ---------------------------------------------------------------------------

class TopicState:
    """Single source of truth for per-topic state."""

    def __init__(self, topic_name: str, importance: str):
        self.topic_name = topic_name
        self.importance = importance  # CRITICAL | HIGH | MEDIUM | LOW

        # Saturation thresholds by importance
        self.saturation_threshold = {
            "CRITICAL": 8.0,
            "HIGH": 6.5,
            "MEDIUM": 5.0,
            "LOW": 3.5,
        }.get(importance, 6.5)

        self.saturation_score = 0.0  # Accumulates per response
        self.follow_up_turns = 0     # Counts each turn on this topic
        self.probe_rotation_index = 0  # 0=ownership, 1=outcome, 2=tradeoff, 3=failure
        self.signals_fired: list[str] = []
        self.is_saturated = False
        self.opened_at_turn = 0

        # Base credit per turn: added regardless of answer quality.
        # Ensures even weak candidates eventually move on (no infinite loop).
        # Lower importance = bigger base credit = fewer turns needed.
        # Strong candidates still saturate fast via quality contribution on top.
        self.base_turn_credit = {
            "CRITICAL": 0.6,
            "HIGH":     0.8,
            "MEDIUM":   1.0,
            "LOW":      1.2,
        }.get(importance, 0.8)

        # Weak candidate early exit: after this many turns, if score < X% of threshold
        # the candidate is clearly struggling — no point spending more time on this topic.
        # Strong/avg candidates will have already saturated naturally by this point.
        self.progress_check_turns = 3   # check after turn 3
        self.progress_check_pct  = 0.45 # must have reached 45% of threshold by then

    def is_weak_candidate_exit(self) -> bool:
        """After N turns, check if score is below the minimum expected progress.
        A candidate meeting avg quality would already be saturated by turn 3.
        If they're still below 45% of threshold, they're clearly struggling — move on.
        """
        if self.follow_up_turns < self.progress_check_turns:
            return False
        min_expected = self.saturation_threshold * self.progress_check_pct
        return self.saturation_score < min_expected

    def add_response_contribution(self, response_score: float, signal_penalties: float = 0.0) -> None:
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

    def advance_probe_rotation(self, signal_fired: bool = False) -> None:
        """Advance probe type unless signal fired (signals override rotation)."""
        if not signal_fired:
            self.probe_rotation_index = min(3, self.probe_rotation_index + 1)

    def to_dict(self) -> dict:
        return {
            "topic_name": self.topic_name,
            "importance": self.importance,
            "saturation_threshold": self.saturation_threshold,
            "saturation_score": round(self.saturation_score, 2),
            "follow_up_turns": self.follow_up_turns,
            "base_turn_credit": self.base_turn_credit,
            "progress_check_turns": self.progress_check_turns,
            "progress_check_pct": self.progress_check_pct,
            "probe_rotation_index": self.probe_rotation_index,
            "signals_fired": self.signals_fired,
            "is_saturated": self.is_saturated,
        }


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
    """Calculate penalties for trust signals."""

    PENALTIES = {
        "example_evasion": -2.0,
        "contradiction": -2.5,
        "ownership_ambiguity": -1.5,
        "resume_claim_mismatch": -1.5,
        "follow_up_collapse": -1.0,
        "latency_mismatch": -0.5,
    }

    @staticmethod
    def calculate_penalties(signal_events: list[dict]) -> float:
        """Sum penalties from all signals that fired."""
        total = 0.0
        for event in signal_events:
            signal_name = event.get("signal_name", "")
            penalty = SignalPenaltyCalculator.PENALTIES.get(signal_name, 0.0)
            if penalty < 0:
                total += penalty
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
    llm_model: str = "gpt-4o-mini"
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
    claim_index: Dict[str, Any] = Field(default_factory=dict)
    contradiction_state: Dict[str, Any] = Field(default_factory=dict)
    trust_state: Dict[str, Any] = Field(default_factory=dict)
    current_interview_mode: str = "normal"
    no_new_question_cutoff_seconds: int = 45
    # Candidate brief fields (for context logging)
    anchor_full: Optional[str] = None
    projects_full: List[str] = Field(default_factory=list)
    work_history_full: List[str] = Field(default_factory=list)
    internships_full: List[str] = Field(default_factory=list)
    education_full: List[str] = Field(default_factory=list)
    candidate_name: str = "?"
    band: str = "?"
    time_limit_mins: int = 20

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
        """Return the highest-priority uncovered topic (resume first, then skills)."""
        covered_text = " ".join(self.discussed_log).lower()
        excluded_key = _normalize_topic_key(exclude or "")
        for t in (self.resume_topics + self.skill_topics):
            key = _normalize_topic_key(t)
            if not key:
                continue
            if excluded_key and key == excluded_key:
                continue
            if key in self.covered_keys:
                continue
            if key not in covered_text:
                return t
        return None

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
            "Do NOT reference it. Acknowledge in one sentence max, then pivot immediately."
        )

    @staticmethod
    def verify_contradiction(disturbance_hits: List[Any]) -> str:
        return (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: VERIFY (CLARIFICATION)\n"
            f"SIGNALS TRIGGERED: {', '.join(str(x) for x in disturbance_hits if x)}\n"
            "NEXT MOVE: Ask one concise contradiction-clarification question. "
            "Keep follow-up count unchanged this turn. After answer, continue from current follow-up position.\n"
            "QUESTION STYLE: Human, calm, curious, specific."
        )

    @staticmethod
    def verify_ownership(disturbance_hits: List[Any]) -> str:
        return (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: VERIFY (CLARIFICATION)\n"
            f"SIGNALS TRIGGERED: {', '.join(str(x) for x in disturbance_hits if x)}\n"
            "NEXT MOVE: Ask one concise clarification question focused on one concrete example "
            "and what they personally owned. Continue follow-up progression (do not freeze). "
            "If this is already follow-up 2+, this turn is the final clarifier before move-on.\n"
            "QUESTION STYLE: Human, calm, curious, specific."
        )

    @staticmethod
    def contradiction_active(summary: dict, turn: int) -> str:
        evidence = summary["evidence"]
        old_t = evidence.get("oldTurn", 0)
        old_v = str(evidence.get("oldValue", ""))[:100]
        new_v = str(evidence.get("newValue", ""))[:100]
        claim_t = (
            re.sub(r"[^\w\s]", "", summary["contradictionType"].replace("_", " ")).strip()
            or "contradiction"
        )
        return (
            f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            f"DECISION: CONTRADICTION {summary['status'].upper()}\n"
            f"INCONSISTENCY DETECTED: {claim_t}\n"
            f"  Earlier (turn {old_t}): '{old_v}'\n"
            f"  Just now (turn {turn}): '{new_v}'\n"
            f"ACTION: Surface this with genuine confusion - not accusation."
            f"Say something like: 'wait, I want to make sure I understood this right - "
            f"earlier it sounded like {old_v}, but just now it sounds more like {new_v}. "
            f"Help me connect those two.' "
            f"If they clarify convincingly, accept it and move on. "
            f"If they stall or contradict again, note it internally and continue."
        )

    @staticmethod
    def append_memory_block(directive: str, discussed_log: List[str]) -> str:
        if not discussed_log:
            return directive
        covered_block = (
            "\n[INTERVIEW MEMORY — DO NOT RE-ASK THESE, reference naturally if relevant]\n"
            + "\n".join(discussed_log[-8:])
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
) -> tuple[bool, str]:
    """
    Evaluate if a topic has reached saturation based on answer quality and signals.

    Returns: (is_saturated, saturation_status_str)
    """
    if not topic_state:
        return False, "no_topic"

    # Calculate response score using weighted formula
    response_score = ResponseScoreCalculator.calculate_response_score(quality_scores)
    contribution = ResponseScoreCalculator.calculate_contribution(response_score)

    # Apply signal penalties
    signal_penalty = SignalPenaltyCalculator.calculate_penalties(signal_events)
    final_contribution = max(0.0, contribution + signal_penalty)

    # Add to saturation score
    topic_state.add_response_contribution(final_contribution, signal_penalty)

    # Check saturation
    if topic_state.is_saturated:
        return True, f"saturated_at_{round(topic_state.saturation_score, 1)}"
    else:
        remaining = topic_state.saturation_threshold - topic_state.saturation_score
        return False, f"score_{round(topic_state.saturation_score, 1)}_need_{round(remaining, 1)}"


async def run_eval_and_build_directive(payload: dict, client: AsyncOpenAI) -> dict:
    """
    Pure function: takes serialized session state, returns directive + state mutations.
    Called by eval_worker in a separate process. Never touches agent state directly.
    """

    # ── Parse + validate payload via Pydantic ────────────────────────────────
    p = EvaluationPayload(**payload)

    # ── Early guard: Clarification or connection check ────────────────────────
    # If the candidate said "can you repeat that", "sorry?", "hello?", etc.,
    # short-circuit: no LLM call, no counter increment, no state mutations.
    _utterance_cls = classify_short_utterance(p.answer)
    _is_clarification_turn = (
        _utterance_cls is not None
        and _utterance_cls["response_class"] in ("clarification_question", "connection_check")
    )
    if _is_clarification_turn:
        _cls_name = _utterance_cls["response_class"]
        logger.info(
            "[EVAL_PIPELINE] Clarification/connection detected (class=%s, text=%r) — "
            "injecting REPHRASE directive turn=%d",
            _cls_name, (p.answer or "")[:60], p.turn,
        )
        _rephrase_directive = (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: REPHRASE\n"
            "NEXT MOVE: The candidate asked for clarification or had a connection issue. "
            "Briefly acknowledge ('Sure!', 'Of course!'), then rephrase your last question "
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
            "contradiction_state_event": None,
            "depth_signal": "SURFACE",
            "freeze_followup_increment": True,
            # All state mutations: unchanged (clarification doesn't change topic state)
            "new_active_topic": p.active_topic,
            "new_covered_topic_keys": list(p.covered_topic_keys),
            "new_active_topic_state": None,  # Clarification turn — topic state unchanged
            "new_trust_state": dict(p.trust_state),
            "new_contradiction_state": dict(p.contradiction_state),
            "new_claim_index": {k: list(v) for k, v in p.claim_index.items()},
            "new_current_interview_mode": p.current_interview_mode,
            "risk_integrity_delta": 0,
            "risk_depth_delta": 0,
            "discussed_log_entry": None,
        }

    # ── Initialize mutable working copies ────────────────────────────────────
    new_active_topic = p.active_topic
    new_current_interview_mode = p.current_interview_mode
    new_trust_state: dict = dict(p.trust_state)
    new_contradiction_state: dict = dict(p.contradiction_state)
    new_claim_index: dict = {k: list(v) for k, v in p.claim_index.items()}

    signal_events: list = []
    contradiction_state_event: Optional[dict] = None
    contradiction_alert: Optional[dict] = None
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
        state_dict = p.active_topic_state
        current_topic_state = TopicState(state_dict["topic_name"], state_dict["importance"])
        current_topic_state.saturation_score = state_dict.get("saturation_score", 0.0)
        current_topic_state.follow_up_turns = state_dict.get("follow_up_turns", 0)
        current_topic_state.probe_rotation_index = state_dict.get("probe_rotation_index", 0)
        current_topic_state.is_saturated = state_dict.get("is_saturated", False)
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
        current_topic_state = TopicState(p.active_topic, importance)

    # ── Context log box ──────────────────────────────────────────────────────
    _saturation_status = ""
    if current_topic_state:
        _sat_pct = 100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold)
        _saturation_status = f" | saturation={_sat_pct:.0f}% ({current_topic_state.saturation_score:.1f}/{current_topic_state.saturation_threshold})"
    logger.info(
        "[TURN] INTERVIEW | turn=%d | active=%s | covered=%s | remaining=%.0fs | mode=%s%s",
        p.turn,
        (p.active_topic or "?"),
        list(tracker.covered_keys) if tracker.covered_keys else "none",
        p.remaining_seconds, p.current_interview_mode,
        _saturation_status,
    )
    logger.info(
        "[QA] turn=%d  Q: %s\n              A: %s",
        p.turn,
        (p.question or "")[:200],
        (p.answer or "")[:200],
    )

    # ── Step 1: Extract claims and check consistency ─────────────────────────
    contradiction_enabled = bool(p.signal_toggles.get("contradiction", False))
    if contradiction_enabled:
        try:
            new_claims = await extract_claims(
                candidate_answer=p.answer,
                turn=p.turn,
                client=client,
                org_id=p.org_id,
                llm_model=p.llm_model,
            )
        except Exception as e:
            logger.warning("[EVAL_PIPELINE] extract_claims failed turn=%d: %s", p.turn, e)
            new_claims = []
    else:
        new_claims = []

    for claim in new_claims:
        claim_type = str(claim.get("type", "") or "").strip()
        if not claim_type:
            continue
        contradiction = check_contradiction(claim, new_claim_index)
        if contradiction and not contradiction_alert:
            contradiction_alert = contradiction
        new_claim_index.setdefault(claim_type, []).append(claim)

    # ── Step 2: Build uncovered topics hint ──────────────────────────────────
    uncovered_topics: list = []
    _nxt = tracker.next_uncovered(exclude=p.active_topic)
    if _nxt:
        uncovered_topics = [_nxt]
    logger.info(
        "[EVAL_PIPELINE] Step2/Topics: uncovered_next=%s | discussed_log=%d entries",
        uncovered_topics[0] if uncovered_topics else "none",
        len(p.discussed_log),
    )

    # ── Step 3: Run turn evaluation (quality + signals + routing) ────────────
    try:
        td, directive = await asyncio.wait_for(
            run_turn_evaluation(
                candidate_answer=p.answer,
                last_question=p.question,
                transcript_lines=p.transcript_lines,
                contradiction_detected=contradiction_alert is not None,
                client=client,
                org_id=p.org_id,
                llm_model=p.llm_model,
                score_answer_quality_fn=score_answer_quality,
                evaluate_answer_and_decide_fn=evaluate_answer_and_decide,
                signal_toggles=p.signal_toggles,
                uncovered_topics=uncovered_topics,
                session_score_history=p.score_history,
                turns_since_last_decay=p.turns_since_decay,
                response_latency_sec=p.response_latency_sec,
            ),
            timeout=3.5,
        )
    except asyncio.TimeoutError:
        logger.warning("[EVAL_PIPELINE] run_turn_evaluation timed out (>3.5s) turn=%d", p.turn)
        # Fallback: use PROBE by default (let saturation decide on next turn)
        _fallback_action = "PROBE"
        _fallback_next = (
            "Ask one specific follow-up question about what they personally built or decided. "
            "Make it concrete and direct."
        )
        td = {
            "decision": {"action": _fallback_action, "mode": "normal", "next_goal": _fallback_next},
            "quality": {"clarity": 5.0, "depth": 5.0, "specificity": 5.0, "grounding": 5.0},
            "signal_events": [],
        }
        directive = (
            f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            f"DECISION: {_fallback_action}\n"
            f"NEXT MOVE: {_fallback_next}"
        )

    action: str = td["decision"]["action"]
    signal_events = td.get("signal_events", [])
    disturbance_signal_names = {"ownership_ambiguity", "example_evasion", "contradiction"}
    disturbance_hits = [
        ev.get("signal_name")
        for ev in signal_events
        if ev.get("signal_name") in disturbance_signal_names
    ]
    contradiction_hit = "contradiction" in disturbance_hits
    ownership_or_example_hit = any(
        s in disturbance_hits for s in ("ownership_ambiguity", "example_evasion")
    )
    freeze_followup_increment = False
    depth_signal = "SURFACE"
    quality_avg = (
        td["quality"]["clarity"] + td["quality"]["depth"]
        + td["quality"]["specificity"] + td["quality"]["grounding"]
    ) / 4.0

    # ── Log evaluator decision ────────────────────────────────────────────────
    _all_signal_names = [ev.get("signal_name", "?") for ev in signal_events if ev.get("signal_name")]
    logger.info(
        "[EVAL] turn=%d action=%s mode=%s quality=%.2f (c=%.1f d=%.1f s=%.1f g=%.1f) signals=[%s]",
        p.turn, action, td["decision"].get("mode", "?"),
        quality_avg,
        td["quality"]["clarity"], td["quality"]["depth"],
        td["quality"]["specificity"], td["quality"]["grounding"],
        ", ".join(_all_signal_names) if _all_signal_names else "none",
    )
    for _ev in signal_events:
        if _ev.get("signal_name"):
            logger.info(
                "[SIGNAL] %-28s | layer=%-22s | delta=%+.2f | turn=%d",
                _ev.get("signal_name", "?"),
                _ev.get("signal_layer", "?"),
                float(_ev.get("score_delta", 0) or 0),
                p.turn,
            )

    # ── Step 4: Disturbance signal overrides ─────────────────────────────────
    if disturbance_hits:
        action = "VERIFY"
        td["decision"]["action"] = "VERIFY"
        td["decision"]["mode"] = "clarification"
        if contradiction_hit:
            td["decision"]["next_goal"] = (
                "One clarification question only. Resolve the contradiction anchored to their "
                "previous statement. Do not advance topic and do not consume a new follow-up slot."
            )
            directive = DirectiveCompiler.verify_contradiction(disturbance_hits)
            freeze_followup_increment = True
            logger.info(
                "[EVAL_PIPELINE] ⚠ CONTRADICTION signal → clarification needed turn=%d",
                p.turn,
            )
        elif ownership_or_example_hit:
            # With saturation scoring, probe deeper until saturation or clear signal pattern
            logger.info(
                "[EVAL_PIPELINE] ⚠ OWNERSHIP/EXAMPLE signal → probe for clarity turn=%d",
                p.turn,
            )
            td["decision"]["next_goal"] = (
                "Ask one concise clarification question to make the answer concrete and personal. "
                "If still vague after this clarification flow, move on to the next topic."
            )
            directive = DirectiveCompiler.verify_ownership(disturbance_hits)

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

    if quality_avg >= 7.0:
        depth_signal = "DEEP"
    elif quality_avg >= 4.5:
        depth_signal = "SPECIFIC"

    # ── Step 6: Saturation-based decision (PART 3) ──────────────────────────
    # NEW SYSTEM: Evaluate if topic has reached saturation based on quality + signals
    # REPLACED: Old fixed "max 2 follow-ups" logic with adaptive saturation scoring

    next_topic_hint: Optional[str] = None
    signal_fired_names = [ev.get("signal_name", "") for ev in signal_events]
    any_signal_fired = len(disturbance_hits) > 0

    # depth_decay: candidate is fatiguing — force MOVE_ON regardless of saturation
    depth_decay_fired = any(ev.get("signal_name") == "depth_decay" for ev in signal_events)

    # Evaluate saturation for current topic
    is_saturated, saturation_status = evaluate_topic_saturation(
        current_topic_state,
        td.get("quality", {}),
        signal_events,
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
            next_topic_state = TopicState(_next, _next_importance)
        logger.info(
            "[SATURATION] MOVE_ON reason=%s → next=%s (importance=%s) turn=%d",
            reason, _next or "?", next_topic_state.importance if next_topic_state else "?", p.turn,
        )

    # Decision logic: saturation-based routing
    _weak_exit = (
        current_topic_state is not None
        and current_topic_state.is_weak_candidate_exit()
        and action != "VERIFY"
    )
    if depth_decay_fired and action != "VERIFY":
        _do_move_on("depth_decay")
    elif _weak_exit:
        _do_move_on(
            f"weak_candidate_exit(turns={current_topic_state.follow_up_turns}"
            f" score={current_topic_state.saturation_score:.1f}"
            f" min={current_topic_state.saturation_threshold * current_topic_state.progress_check_pct:.1f})"
        )
    elif is_saturated and action != "VERIFY":
        _do_move_on(f"saturated({saturation_status})")
    elif action not in ("MOVE_ON", "VERIFY"):
        # PROBE — continue on current topic, select probe family from rotation
        if current_topic_state:
            from interview.probe_strategy import select_probe_family_from_rotation, _PROBE_FAMILIES
            probe_family = select_probe_family_from_rotation(
                probe_rotation_index=current_topic_state.probe_rotation_index,
                signal_names=signal_fired_names,
                topic_importance=current_topic_state.importance,
            )
            probe_goal = _PROBE_FAMILIES.get(probe_family, _PROBE_FAMILIES["ownership"])["goal"]
            probe_style = _PROBE_FAMILIES.get(probe_family, _PROBE_FAMILIES["ownership"])["style"]
            td["decision"]["mode"] = probe_family
            td["decision"]["next_goal"] = probe_goal
            directive = (
                "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                f"DECISION: PROBE ({probe_family.upper()})\n"
                f"QUALITY: clarity={td['quality']['clarity']:.0f} depth={td['quality']['depth']:.0f} "
                f"specificity={td['quality']['specificity']:.0f} grounding={td['quality']['grounding']:.0f}\n"
                f"SATURATION: {current_topic_state.saturation_score:.1f}/{current_topic_state.saturation_threshold} "
                f"({100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold):.0f}%)\n"
            )
            if signal_fired_names:
                directive += f"SIGNALS: {', '.join(signal_fired_names)}\n"
            directive += (
                f"NEXT MOVE: {probe_goal}\n"
                f"QUESTION STYLE: {probe_style}\n"
                "PROBE INTENT: Anchor your question to something specific they actually said — "
                "a project name, a number, a claim. Don't use a generic opener."
            )
            if not any_signal_fired:
                current_topic_state.advance_probe_rotation(signal_fired=False)
                logger.info(
                    "[SATURATION] PROBE(%s) | rotation advanced to index=%d turn=%d",
                    probe_family, current_topic_state.probe_rotation_index, p.turn,
                )
            else:
                logger.info(
                    "[SATURATION] PROBE(%s) | signal fired — rotation held at index=%d turn=%d",
                    probe_family, current_topic_state.probe_rotation_index, p.turn,
                )
    elif action == "MOVE_ON":
        # MOVE_ON from evaluator (not from saturation)
        _do_move_on("evaluator")

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

    # ── Step 8: Contradiction state machine ──────────────────────────────────
    contradiction_resolved_enabled = bool(p.signal_toggles.get("contradiction_resolved", False))
    if contradiction_enabled:
        new_contradiction_state, contradiction_state_event = advance_contradiction_state(
            new_contradiction_state,
            contradiction_alert,
            turn=p.turn,
            action=action,
            quality_avg=quality_avg,
        )
        if contradiction_state_event:
            if (
                contradiction_state_event["status"] == "candidate_clarified"
                and contradiction_resolved_enabled
            ):
                new_trust_state = apply_contradiction_resolved(new_trust_state)
                logger.info(
                    "[EVAL_PIPELINE] Contradiction resolved - hard_integrity restored turn=%d",
                    p.turn,
                )

    contradiction_summary = summarize_contradiction_state(new_contradiction_state)
    if contradiction_summary["active"] and contradiction_enabled:
        directive = DirectiveCompiler.contradiction_active(contradiction_summary, p.turn)

    # ── Step 9: Append discussed log entry on MOVE_ON ────────────────────────
    if action == "MOVE_ON" and p.question and p.answer:
        topic_line = p.question.split("?")[0].strip()[:80]
        answer_gist = " ".join(p.answer.split()[:20])
        discussed_log_entry = f"- {topic_line}: {answer_gist}"

    # ── Step 10: Append memory block ─────────────────────────────────────────
    full_discussed = list(p.discussed_log)
    if discussed_log_entry:
        full_discussed.append(discussed_log_entry)
    directive = DirectiveCompiler.append_memory_block(directive, full_discussed)

    # ── Step 11: No longer needed with saturation system ─────────────────────
    # Old drift guard and enforce_move_on logic removed
    # Saturation scoring now drives topic transitions adaptively

    # ── Step 13: TOPIC_TAG_RULE + STRICT_MOVE_ON_RULE + guards ───────────────
    if p.remaining_seconds <= p.no_new_question_cutoff_seconds + 30:
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

    # ── Quality record ────────────────────────────────────────────────────────
    quality_record = {
        "question": p.question,
        "answer": p.answer,
        "clarity": td["quality"]["clarity"],
        "depth": td["quality"]["depth"],
        "fluency": td["quality"].get("fluency", 0),
        "confidence": td["quality"].get("confidence", 0),
        "overall": quality_avg,
        "signals": [ev["signal_name"] for ev in signal_events if ev.get("signal_name")],
        "concerns": [ev["signal_name"] for ev in signal_events if ev.get("score_delta", 0.0) < 0],
    }

    return {
        "app_id": p.app_id,
        "turn": p.turn,
        "directive": directive,
        "action": action,
        "td": td,
        "quality_record": quality_record,
        "signal_events": signal_events,
        "contradiction_state_event": contradiction_state_event,
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
        "new_contradiction_state": new_contradiction_state,
        "new_claim_index": new_claim_index,
        "new_current_interview_mode": new_current_interview_mode,
        "risk_integrity_delta": risk_integrity_delta,
        "risk_depth_delta": risk_depth_delta,
        "discussed_log_entry": discussed_log_entry,
    }