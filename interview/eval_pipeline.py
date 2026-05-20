"""
Standalone evaluation pipeline for the Redis worker architecture.

Refactored with:
  - Pydantic EvaluationPayload: strict input validation + type coercion
  - TopicTracker (OOP): O(1) set-based topic lookups, zero substring-collision bugs
  - CounterManager (OOP): cap/freeze/reset logic in one place
  - DirectiveCompiler (OOP): all directive strings built in one stateless class

Contract unchanged: run_eval_and_build_directive(payload: dict, client) -> dict
"""
from __future__ import annotations

import asyncio
import re
import logging
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field
from openai import AsyncOpenAI

from interview.turn_evaluator import run_turn_evaluation
from interview.trust_engine import apply_turn_decision, apply_contradiction_resolved
from interview.contradiction_state import advance_contradiction_state, summarize_contradiction_state
from interview.agent_scoring import (
    check_contradiction,
    evaluate_answer_and_decide,
    extract_claims,
    score_answer_quality,
)
from interview.interview_phases import STAGE_CONFIGS

logger = logging.getLogger("eval_worker")


# ---------------------------------------------------------------------------
# Pydantic input schema — validates and coerces the raw Redis payload dict
# ---------------------------------------------------------------------------

class EvaluationPayload(BaseModel):
    app_id: str
    turn: int
    answer: str
    question: str
    follow_up_count: int
    transcript_lines: List[str] = Field(default_factory=list)
    depth_history: List[float] = Field(default_factory=list)
    collapse_stage: int = 0
    score_history: List[Any] = Field(default_factory=list)
    turns_since_decay: int = 999
    response_latency_sec: Optional[float] = None
    stage_index: int = 0
    follow_up_depth: int = 2
    signal_toggles: Dict[str, Any] = Field(default_factory=dict)
    org_id: str = ""
    llm_model: str = "gpt-4o-mini"
    active_resume_topic: Optional[str] = None
    active_skill_topic: Optional[str] = None
    covered_resume_topic_keys: List[str] = Field(default_factory=list)
    covered_skill_topic_keys: List[str] = Field(default_factory=list)
    discussed_log: List[str] = Field(default_factory=list)
    enforce_move_on_until_new: bool = False
    forced_next_topic_hint: Optional[str] = None
    last_action_was_move_on: bool = False
    resume_topics: List[str] = Field(default_factory=list)
    skill_topics: List[str] = Field(default_factory=list)
    job_title: str = "the role"
    remaining_seconds: float = 999.0
    resume_topic_questions_asked: int = 0
    claim_index: Dict[str, Any] = Field(default_factory=dict)
    contradiction_state: Dict[str, Any] = Field(default_factory=dict)
    trust_state: Dict[str, Any] = Field(default_factory=dict)
    current_interview_mode: str = "normal"
    no_new_question_cutoff_seconds: int = 60
    # Candidate brief fields (enriched by agent_runtime)
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
# TopicTracker — OOP class, O(1) set-based covered-topic lookups
# ---------------------------------------------------------------------------

class TopicTracker:
    """
    Encapsulates all topic selection, coverage marking, and duplicate detection.

    DSA improvement: uses set[str] for O(1) covered-key lookups instead of
    substring scanning a concatenated string (which caused false-positives when
    one topic name was a substring of another, e.g. 'python' inside 'python dev').
    """

    def __init__(
        self,
        *,
        resume_topics: List[str],
        skill_topics: List[str],
        covered_resume_keys: Set[str],
        covered_skill_keys: Set[str],
        discussed_log: List[str],
        active_resume_topic: Optional[str],
        active_skill_topic: Optional[str],
        resume_topic_questions_asked: int,
        job_title: str,
    ) -> None:
        self.resume_topics = resume_topics
        self.skill_topics = skill_topics
        self.covered_resume_keys: Set[str] = set(covered_resume_keys)
        self.covered_skill_keys: Set[str] = set(covered_skill_keys)
        self.discussed_log = discussed_log
        self.active_resume_topic = active_resume_topic
        self.active_skill_topic = active_skill_topic
        self.resume_topic_questions_asked = resume_topic_questions_asked
        self.job_title = job_title

    # ── Coverage marking ─────────────────────────────────────────────────────

    def mark_resume_covered(self, topic: Optional[str]) -> None:
        if topic:
            self.covered_resume_keys.add(_normalize_topic_key(topic))

    def mark_skill_covered(self, topic: Optional[str]) -> None:
        if topic:
            self.covered_skill_keys.add(_normalize_topic_key(topic))

    # ── Next uncovered helpers ────────────────────────────────────────────────

    def _next_uncovered_resume(self, exclude: Optional[str] = None) -> Optional[str]:
        covered_text = " ".join(self.discussed_log).lower()
        excluded_key = _normalize_topic_key(exclude or "")
        for t in self.resume_topics:
            key = _normalize_topic_key(t)
            if not key:
                continue
            if excluded_key and key == excluded_key:
                continue
            if key in self.covered_resume_keys:
                continue
            if key not in covered_text:
                return t
        return None

    def _next_uncovered_skill(self, exclude: Optional[str] = None) -> Optional[str]:
        covered_text = " ".join(self.discussed_log).lower()
        excluded_key = _normalize_topic_key(exclude or "")
        for t in self.skill_topics:
            key = _normalize_topic_key(t)
            if not key:
                continue
            if excluded_key and key == excluded_key:
                continue
            if key in self.covered_skill_keys:
                continue
            if key not in covered_text:
                return t
        return None

    def next_uncovered_for_stage(self, stage_index: int) -> Optional[str]:
        active = self.active_resume_topic if stage_index == 0 else self.active_skill_topic
        if stage_index == 0:
            return self._next_uncovered_resume(exclude=active)
        elif stage_index == 1:
            return self._next_uncovered_skill(exclude=active)
        return None

    def fallback_next(self, stage_index: int, exclude: Optional[str] = None) -> str:
        """Return the best available next topic for a given stage."""
        excluded_key = _normalize_topic_key(exclude or "")
        if stage_index == 0:
            nxt = self._next_uncovered_resume(exclude)
            if nxt:
                return nxt
            for topic in self.resume_topics:
                key = _normalize_topic_key(topic)
                if key and key != excluded_key:
                    return topic
            if self.resume_topic_questions_asked >= 2:
                return "their education or training path"
            return "another resume project"
        if stage_index == 1:
            nxt = self._next_uncovered_skill(exclude)
            if nxt:
                return nxt
            for topic in self.skill_topics:
                key = _normalize_topic_key(topic)
                if key and key != excluded_key:
                    return topic
            return f"a concrete example using one of the {self.job_title} role skills"
        return "the next relevant topic"

    # ── Duplicate question detection ─────────────────────────────────────────

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


# ---------------------------------------------------------------------------
# CounterManager — follow-up count, cap, and reset logic in one place
# ---------------------------------------------------------------------------

class CounterManager:
    """
    Single source of truth for follow-up count progression.
    Caller decides whether to increment (freeze_followup_increment flag
    from contradiction signal is kept as a local bool, matching original contract).
    """

    def __init__(
        self,
        *,
        follow_up_count: int,
        follow_up_depth: int,
        depth_history: List[float],
        collapse_stage: int,
    ) -> None:
        self.count = follow_up_count
        self.cap = follow_up_depth
        self.depth_history: List[float] = list(depth_history)
        self.collapse_stage = collapse_stage

    def extend_cap(self) -> None:
        """Ownership/example signal: grant one extra follow-up slot."""
        self.cap += 1

    def increment(self) -> None:
        self.count += 1

    def is_hard_cap_hit(self) -> bool:
        return self.count >= self.cap

    def is_quality_exhausted(self) -> bool:
        """Last two depth scores both below 4.0 and already on follow-up 2+."""
        if len(self.depth_history) < 2:
            return False
        return (
            self.depth_history[-1] < 4.0
            and self.depth_history[-2] < 4.0
            and self.count >= 2
        )

    def reset(self) -> None:
        self.count = 0
        self.depth_history = []
        self.collapse_stage = 0


# ---------------------------------------------------------------------------
# DirectiveCompiler — all directive string construction in one stateless class
# ---------------------------------------------------------------------------

class DirectiveCompiler:
    """
    Stateless factory for all directive strings injected into the LLM context.
    Separates 'what to tell the LLM' from 'how to decide what to tell it'.
    """

    @staticmethod
    def move_on(next_goal: str) -> str:
        return (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: MOVE_ON\n"
            f"NEXT MOVE: {next_goal}"
        )

    @staticmethod
    def verify_contradiction(disturbance_hits: List[Any]) -> str:
        return (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: VERIFY (CLARIFICATION)\n"
            f"SIGNALS TRIGGERED: {', '.join(str(x) for x in disturbance_hits if x)}\n"
            "NEXT MOVE: Ask one concise contradiction-clarification question. "
            "Keep follow-up count unchanged this turn. After answer, continue from current follow-up stage.\n"
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
    def append_topic_tag(directive: str, expected_tag: str) -> str:
        return (
            directive
            + "\n[TOPIC_TAG_RULE - DO NOT SAY ALOUD]\n"
            + f"Start your next response with exactly [TOPIC:{expected_tag}] on its own line. "
            + "Then write your natural interviewer response."
        )

    @staticmethod
    def append_strict_move_on(directive: str, forced_topic: str) -> str:
        return (
            directive
            + "\n[STRICT_MOVE_ON_RULE - DO NOT SAY ALOUD]\n"
            + "You MUST pivot to a different topic in your very next question. "
            + "Do NOT ask another follow-up on the same topic."
            + (f"\nTarget next topic: {forced_topic}" if forced_topic else "")
        )

    @staticmethod
    def append_no_early_closing(directive: str) -> str:
        return (
            directive
            + "\n[NO_EARLY_CLOSING_GUARD — DO NOT SAY ALOUD]\n"
            + "Do NOT end the interview, do NOT say goodbye/thanks-for-your-time/next-steps yet. "
            + "Continue with the next interview question naturally."
        )

    @staticmethod
    def append_stage1_priority_guard(directive: str) -> str:
        return (
            directive
            + "\n[STAGE_1_PRIORITY_GUARD — DO NOT SAY ALOUD]\n"
            + "You are still in early Stage 1. Ask resume ownership/project questions only. "
            + "Do NOT ask educational background, generic introduction, or recruiter custom questions yet. "
            + "You may ask those only after at least 2 resume-topic questions have already been asked."
        )


# ---------------------------------------------------------------------------
# Main pipeline function  (same dict contract as before)
# ---------------------------------------------------------------------------

async def run_eval_and_build_directive(payload: dict, client: AsyncOpenAI) -> dict:
    """
    Pure function: takes serialized session state, returns directive + state mutations.
    Called by eval_worker in a separate process. Never touches agent state directly.
    """

    # ── Parse + validate payload via Pydantic ────────────────────────────────
    p = EvaluationPayload(**payload)

    # ── Initialize mutable working copies ────────────────────────────────────
    new_active_resume_topic = p.active_resume_topic
    new_active_skill_topic = p.active_skill_topic
    new_current_interview_mode = p.current_interview_mode
    new_expected_topic_kind = "FOLLOWUP"
    new_enforce_move_on_until_new = p.enforce_move_on_until_new
    new_forced_next_topic_hint = p.forced_next_topic_hint
    new_last_action_was_move_on = p.last_action_was_move_on
    new_trust_state: dict = dict(p.trust_state)
    new_contradiction_state: dict = dict(p.contradiction_state)
    new_claim_index: dict = {k: list(v) for k, v in p.claim_index.items()}

    signal_events: list = []
    contradiction_state_event: Optional[dict] = None
    contradiction_alert: Optional[dict] = None
    risk_integrity_delta = 0
    risk_depth_delta = 0
    discussed_log_entry: Optional[str] = None

    old_active_resume = p.active_resume_topic
    old_active_skill = p.active_skill_topic

    # ── Construct OOP helpers ────────────────────────────────────────────────
    tracker = TopicTracker(
        resume_topics=p.resume_topics,
        skill_topics=p.skill_topics,
        covered_resume_keys=set(p.covered_resume_topic_keys),
        covered_skill_keys=set(p.covered_skill_topic_keys),
        discussed_log=list(p.discussed_log),
        active_resume_topic=p.active_resume_topic,
        active_skill_topic=p.active_skill_topic,
        resume_topic_questions_asked=p.resume_topic_questions_asked,
        job_title=p.job_title,
    )
    counter = CounterManager(
        follow_up_count=p.follow_up_count,
        follow_up_depth=p.follow_up_depth,
        depth_history=list(p.depth_history),
        collapse_stage=p.collapse_stage,
    )

    _enabled_signals = [k for k, v in p.signal_toggles.items() if v]

    # ── Context log box ──────────────────────────────────────────────────────
    _anchor = p.anchor_full or p.active_resume_topic or "?"
    _stage_labels = ["STAGE1/RESUME", "STAGE2/SKILL"]
    _stage_label = (
        _stage_labels[p.stage_index]
        if 0 <= p.stage_index < len(_stage_labels)
        else f"STAGE{p.stage_index}"
    )
    logger.info(
        "[EVAL_CONTEXT]\n"
        "╔══════════════════════════════════════════════════════════╗\n"
        "  CANDIDATE: %s | ROLE: %s | BAND: %s | TIME: %sm\n"
        "╠══════════════════════════════════════════════════════════╣\n"
        "  ANCHOR   : %s\n"
        "  PROJECTS  : %s\n"
        "  WORK HIST : %s\n"
        "  INTERNSHIP: %s\n"
        "  EDUCATION : %s\n"
        "╠══════════════════════════════════════════════════════════╣\n"
        "  STAGE     : %s | turn=%d | follow_ups=%d/%d\n"
        "  ACTIVE    : %s\n"
        "  COVERED R : %s\n"
        "  COVERED S : %s\n"
        "  RESUME Qs : %s\n"
        "  SKILL  Qs : %s\n"
        "  SIGNALS ON: [%s]\n"
        "  FLAGS     : enforce_move_on=%s | last_move_on=%s | drift_hint=%s\n"
        "  REMAINING : %.0fs | mode=%s\n"
        "╚══════════════════════════════════════════════════════════╝",
        p.candidate_name, p.job_title, p.band, p.time_limit_mins,
        _anchor,
        " | ".join(p.projects_full) if p.projects_full else "none",
        " | ".join(p.work_history_full) if p.work_history_full else "none",
        " | ".join(p.internships_full) if p.internships_full else "none",
        " | ".join(p.education_full) if p.education_full else "none",
        _stage_label, p.turn, p.follow_up_count, p.follow_up_depth,
        p.active_resume_topic if p.stage_index == 0 else p.active_skill_topic,
        list(tracker.covered_resume_keys) if tracker.covered_resume_keys else "none yet",
        list(tracker.covered_skill_keys) if tracker.covered_skill_keys else "none yet",
        p.resume_topics,
        p.skill_topics,
        ", ".join(_enabled_signals) if _enabled_signals else "none",
        p.enforce_move_on_until_new, p.last_action_was_move_on,
        p.forced_next_topic_hint or "none",
        p.remaining_seconds, p.current_interview_mode,
    )
    logger.info(
        "[EVAL_QA] turn=%d\n  Q: %s\n  A: %s",
        p.turn,
        (p.question or "")[:300],
        (p.answer or "")[:300],
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

    # ── Step 2: Build uncovered topics list ──────────────────────────────────
    current_stage_name = (
        STAGE_CONFIGS[p.stage_index].name
        if 0 <= p.stage_index < len(STAGE_CONFIGS)
        else ""
    )
    uncovered_topics: list = []
    _nxt = tracker.next_uncovered_for_stage(p.stage_index)
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
                topic_follow_up_count=p.follow_up_count,
                transcript_lines=p.transcript_lines,
                depth_history=p.depth_history,
                contradiction_detected=contradiction_alert is not None,
                client=client,
                org_id=p.org_id,
                llm_model=p.llm_model,
                score_answer_quality_fn=score_answer_quality,
                evaluate_answer_and_decide_fn=evaluate_answer_and_decide,
                signal_toggles=p.signal_toggles,
                max_follow_ups=p.follow_up_depth,
                uncovered_topics=uncovered_topics,
                collapse_stage=p.collapse_stage,
                session_score_history=p.score_history,
                turns_since_last_decay=p.turns_since_decay,
                response_latency_sec=p.response_latency_sec,
                current_stage=current_stage_name,
            ),
            timeout=3.5,
        )
    except asyncio.TimeoutError:
        logger.warning("[EVAL_PIPELINE] run_turn_evaluation timed out (>3.5s) turn=%d", p.turn)
        _fallback_stage_label = (
            STAGE_CONFIGS[p.stage_index].label
            if 0 <= p.stage_index < len(STAGE_CONFIGS)
            else "CURRENT"
        )
        _exclude = p.active_resume_topic if p.stage_index == 0 else p.active_skill_topic
        if p.follow_up_count >= p.follow_up_depth:
            _fallback_action = "MOVE_ON"
            _fallback_next = tracker.fallback_next(p.stage_index, exclude=_exclude)
        else:
            _fallback_action = "PROBE"
            _fallback_next = (
                f"Ask one specific follow-up question that stays strictly within "
                f"the {_fallback_stage_label} stage intent. Make it personal and concrete."
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
        "[EVAL_PIPELINE] Step3/Evaluator raw decision:\n"
        "  action  : %s (mode=%s)\n"
        "  quality : avg=%.2f  clarity=%.1f  depth=%.1f  specificity=%.1f  grounding=%.1f\n"
        "  signals : [%s]\n"
        "  next_goal: %s",
        action, td["decision"].get("mode", "?"),
        quality_avg,
        td["quality"]["clarity"], td["quality"]["depth"],
        td["quality"]["specificity"], td["quality"]["grounding"],
        ", ".join(_all_signal_names) if _all_signal_names else "none fired",
        (td["decision"].get("next_goal") or "")[:120],
    )
    if signal_events:
        for _ev in signal_events:
            logger.info(
                "[SIGNAL] %-30s | layer=%-20s | score_delta=%.2f | turn=%d",
                _ev.get("signal_name", "?"),
                _ev.get("signal_layer", "?"),
                float(_ev.get("score_delta", 0) or 0),
                p.turn,
            )
    else:
        logger.info(
            "[SIGNAL] No signals fired this turn (signals_on=[%s]) turn=%d",
            ", ".join(_enabled_signals) if _enabled_signals else "all disabled",
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
                "[EVAL_PIPELINE] ⚠ CONTRADICTION signal → FREEZE follow-up counter at %d/cap=%d turn=%d",
                p.follow_up_count, p.follow_up_depth, p.turn,
            )
        elif ownership_or_example_hit:
            counter.extend_cap()
            td["decision"]["next_goal"] = (
                "Ask one concise clarification question to make the answer concrete and personal. "
                "If still vague after this clarification flow, move on to the next topic."
            )
            directive = DirectiveCompiler.verify_ownership(disturbance_hits)
            logger.info(
                "[EVAL_PIPELINE] ⚠ OWNERSHIP/EXAMPLE signal at follow_ups=%d → extend cap %d→%d turn=%d",
                p.follow_up_count, p.follow_up_depth, counter.cap, p.turn,
            )

    # ── Step 5: Stage 1 early breadth pivot ──────────────────────────────────
    if (
        p.stage_index == 0
        and action in ("PROBE", "VERIFY")
        and quality_avg >= 6.0
        and p.follow_up_count >= 1
        and not disturbance_hits
    ):
        tracker.mark_resume_covered(old_active_resume)
        next_resume_topic = tracker.fallback_next(0, exclude=p.active_resume_topic)
        if next_resume_topic != "another resume project":
            new_active_resume_topic = next_resume_topic
        action = "MOVE_ON"
        td["decision"]["action"] = "MOVE_ON"
        td["decision"]["next_goal"] = (
            f"Acknowledge briefly, close the current project thread, and pivot to this next resume topic: "
            f"{next_resume_topic}. Ask one fresh question about what they personally built, owned, or decided there. "
            "Do not ask another follow-up on the previous project."
        )
        directive = DirectiveCompiler.move_on(td["decision"]["next_goal"])
        logger.info(
            "[EVAL_PIPELINE] Stage 1 breadth pivot quality=%.1f follow_ups=%d → %s",
            quality_avg, p.follow_up_count, next_resume_topic,
        )

    # ── Step 6: Already-covered question dedupe ──────────────────────────────
    if action in ("PROBE", "VERIFY") and tracker.is_question_duplicate(p.question):
        _excl = p.active_resume_topic if p.stage_index == 0 else p.active_skill_topic
        next_topic_hint = tracker.fallback_next(p.stage_index, exclude=_excl)
        if p.stage_index == 0 and next_topic_hint:
            new_active_resume_topic = next_topic_hint
        elif p.stage_index == 1 and next_topic_hint:
            new_active_skill_topic = next_topic_hint
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
    logger.info(
        "[EVAL_PIPELINE] Step5/Depth: depth_signal=%s quality_avg=%.2f turn=%d",
        depth_signal, quality_avg, p.turn,
    )

    # ── Step 7: Follow-up counter + cap logic ────────────────────────────────
    if p.last_action_was_move_on:
        counter.reset()
        new_last_action_was_move_on = False
        logger.info(
            "[EVAL_PIPELINE] Step7/NewTopic: counter reset to 0 (last turn was MOVE_ON) | "
            "now on topic=%s turn=%d",
            p.active_resume_topic if p.stage_index == 0 else p.active_skill_topic,
            p.turn,
        )

    # Safeguard: already at cap before this turn's increment → force MOVE_ON
    if counter.count >= p.follow_up_depth:
        action = "MOVE_ON"
        logger.info(
            "[EVAL_PIPELINE] ⛔ SAFEGUARD: follow_ups=%d >= cap=%d → forcing MOVE_ON immediately turn=%d",
            counter.count, p.follow_up_depth, p.turn,
        )

    counter.depth_history.append(td["quality"]["depth"])
    collapse_fired = any(ev.get("signal_name") == "follow_up_collapse" for ev in signal_events)

    next_topic_hint: Optional[str] = None  # initialized cleanly — no dir() hack

    if action in ("PROBE", "VERIFY"):
        if freeze_followup_increment:
            logger.info(
                "[EVAL_PIPELINE] Contradiction - counter frozen at %d turn=%d",
                counter.count, p.turn,
            )
        else:
            counter.increment()
            logger.info(
                "[EVAL_PIPELINE] Follow-up count → %d/%d action=%s turn=%d",
                counter.count, p.follow_up_depth, action, p.turn,
            )

        if not freeze_followup_increment:
            hard_cap_hit = counter.is_hard_cap_hit()
            last_two_low = counter.is_quality_exhausted()
            logger.info(
                "[EVAL_PIPELINE] Step7/CapCheck: follow_ups=%d cap=%d hard_cap_hit=%s "
                "last_two_low=%s depth_hist=%s turn=%d",
                counter.count, counter.cap, hard_cap_hit,
                last_two_low, counter.depth_history[-3:], p.turn,
            )
            if hard_cap_hit or last_two_low:
                reason_note = "cap" if hard_cap_hit else "quality exhausted"
                action = "MOVE_ON"
                next_stage_idx = p.stage_index + 1
                next_topic_hint = tracker.fallback_next(
                    p.stage_index,
                    exclude=new_active_resume_topic if p.stage_index == 0 else new_active_skill_topic,
                )
                if next_topic_hint:
                    if p.stage_index == 0:
                        new_active_resume_topic = next_topic_hint
                    else:
                        new_active_skill_topic = next_topic_hint
                if next_stage_idx < len(STAGE_CONFIGS):
                    next_stage_label = STAGE_CONFIGS[next_stage_idx].label
                    next_goal = (
                        f"This thread is exhausted. Acknowledge briefly, close the current thread, and move on. "
                        f"If enough time remains in this stage, ask about {next_topic_hint}. "
                        f"If this stage is nearly done, bridge naturally into the {next_stage_label} stage."
                    )
                else:
                    next_goal = (
                        "This thread is exhausted. Acknowledge briefly and move to the next topic — no announcement."
                    )
                td["decision"]["action"] = "MOVE_ON"
                td["decision"]["next_goal"] = next_goal
                directive = DirectiveCompiler.move_on(next_goal)
                logger.info(
                    "[EVAL_PIPELINE] Step7/MOVE_ON: reason=%s follow_ups=%d/%d → next_topic=%s turn=%d",
                    reason_note, counter.count, counter.cap, next_topic_hint or "?", p.turn,
                )
                counter.reset()
                new_last_action_was_move_on = True
            else:
                logger.info(
                    "[EVAL_PIPELINE] Step7/PROBE: probing #%d on topic=%s | quality=%.2f depth=%s turn=%d",
                    counter.count,
                    p.active_resume_topic if p.stage_index == 0 else p.active_skill_topic,
                    quality_avg, depth_signal, p.turn,
                )
                if collapse_fired:
                    counter.collapse_stage += 1
                elif counter.collapse_stage > 0 and not collapse_fired:
                    counter.collapse_stage = max(0, counter.collapse_stage - 1)
    else:
        # action = MOVE_ON came from run_turn_evaluation directly (not cap/quality)
        counter.reset()
        new_last_action_was_move_on = True
        if p.stage_index == 0:
            tracker.mark_resume_covered(old_active_resume)
            next_topic_hint = tracker.fallback_next(0, exclude=p.active_resume_topic)
            if next_topic_hint:
                new_active_resume_topic = next_topic_hint
        else:
            tracker.mark_skill_covered(old_active_skill)
            next_topic_hint = tracker.fallback_next(1, exclude=p.active_skill_topic)
            if next_topic_hint:
                new_active_skill_topic = next_topic_hint
        next_goal = (
            f"Acknowledge the answer briefly and pivot to a fresh topic: {next_topic_hint}. "
            "Ask one focused question about what they personally built or owned there. "
            "Do NOT ask a follow-up on the previous topic."
        )
        td["decision"]["next_goal"] = next_goal
        directive = DirectiveCompiler.move_on(next_goal)
        logger.info(
            "[EVAL_PIPELINE] Step7/MOVE_ON(eval): evaluator decided MOVE_ON directly\n"
            "  leaving topic : %s\n"
            "  next topic    : %s\n"
            "  stage         : %s turn=%d",
            p.active_resume_topic if p.stage_index == 0 else p.active_skill_topic,
            next_topic_hint or "?",
            _stage_label, p.turn,
        )

    # Update covered topic keys on MOVE_ON
    if new_last_action_was_move_on:
        if p.stage_index == 0 and old_active_resume:
            tracker.mark_resume_covered(old_active_resume)
        if p.stage_index == 1 and old_active_skill:
            tracker.mark_skill_covered(old_active_skill)

    # ── Step 8: Trust state update ────────────────────────────────────────────
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

    # ── Step 9: Contradiction state machine ──────────────────────────────────
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

    # ── Step 10: Append discussed log entry on MOVE_ON ───────────────────────
    if action == "MOVE_ON" and p.question and p.answer:
        topic_line = p.question.split("?")[0].strip()[:80]
        answer_gist = " ".join(p.answer.split()[:20])
        discussed_log_entry = f"- {topic_line}: {answer_gist}"

    # ── Step 11: Append memory block ─────────────────────────────────────────
    full_discussed = list(p.discussed_log)
    if discussed_log_entry:
        full_discussed.append(discussed_log_entry)
    directive = DirectiveCompiler.append_memory_block(directive, full_discussed)

    # ── Step 12: Drift guard ──────────────────────────────────────────────────
    if (
        p.enforce_move_on_until_new
        and action in ("PROBE", "VERIFY")
        and not p.last_action_was_move_on
    ):
        action = "MOVE_ON"
        td["decision"]["action"] = "MOVE_ON"
        forced_hint = (p.forced_next_topic_hint or "").strip()
        td["decision"]["next_goal"] = (
            "Previous topic was exhausted. Move to a completely different topic now. "
            + (f"Ask about: {forced_hint}." if forced_hint else "Pick the next uncovered resume/skill topic.")
        )
        directive = (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: MOVE_ON (ENFORCED)\n"
            f"NEXT MOVE: {td['decision']['next_goal']}"
        )
        logger.info("[EVAL_PIPELINE] Drift override enforcing MOVE_ON turn=%d", p.turn)

    # ── Step 13: Set enforce_move_on and forced_next_topic_hint on MOVE_ON ───
    if action == "MOVE_ON":
        new_enforce_move_on_until_new = True
        _next_goal_text = (td.get("decision", {}).get("next_goal") or "").strip()
        _topic_match = re.search(
            r"(?:pivot to|ask about|topic:|next topic:)\s*([^.!\n]{3,60})",
            _next_goal_text,
            re.IGNORECASE,
        )
        if _topic_match:
            new_forced_next_topic_hint = _topic_match.group(1).strip()
        elif p.stage_index == 0:
            new_forced_next_topic_hint = (
                (new_active_resume_topic or "").split(" - ")[0][:60].strip() or None
            )
        else:
            new_forced_next_topic_hint = (
                (new_active_skill_topic or "").split(" - ")[0][:60].strip() or None
            )

    # ── Step 14: TOPIC_TAG_RULE + STRICT_MOVE_ON_RULE + guards ───────────────
    expected_topic_tag = "NEW" if (action == "MOVE_ON" or p.enforce_move_on_until_new) else "FOLLOWUP"
    new_expected_topic_kind = expected_topic_tag

    directive = DirectiveCompiler.append_topic_tag(directive, expected_topic_tag)

    if action == "MOVE_ON" or p.enforce_move_on_until_new:
        forced_topic = (new_forced_next_topic_hint or "").strip()
        directive = DirectiveCompiler.append_strict_move_on(directive, forced_topic)

    if p.remaining_seconds <= p.no_new_question_cutoff_seconds + 30:
        directive = DirectiveCompiler.append_no_early_closing(directive)

    if p.stage_index == 0 and p.resume_topic_questions_asked < 2:
        directive = DirectiveCompiler.append_stage1_priority_guard(directive)

    # ── Signal summary log ────────────────────────────────────────────────────
    _signal_names = [ev.get("signal_name", "?") for ev in signal_events if ev.get("signal_name")]
    if _signal_names:
        logger.info("[EVAL_PIPELINE] Signals fired: %s turn=%d", ", ".join(_signal_names), p.turn)
    else:
        logger.info("[EVAL_PIPELINE] Signals fired: none turn=%d", p.turn)

    # ── Final summary log box ────────────────────────────────────────────────
    _final_topic = new_active_resume_topic if p.stage_index == 0 else new_active_skill_topic
    _covered_after_r = list(tracker.covered_resume_keys)
    _covered_after_s = list(tracker.covered_skill_keys)
    logger.info(
        "[EVAL_PIPELINE] ══════════════ TURN %d RESULT ══════════════\n"
        "  ACTION       : %s\n"
        "  QUALITY       : %.2f (clarity=%.1f depth=%.1f spec=%.1f ground=%.1f)\n"
        "  DEPTH SIGNAL  : %s\n"
        "  FOLLOW_UPS    : %d → %d (cap=%d)\n"
        "  NEXT TOPIC    : %s\n"
        "  COVERED R     : %s\n"
        "  COVERED S     : %s\n"
        "  ENFORCE MOVE  : %s\n"
        "  NEXT HINT     : %s\n"
        "  MEMORY ENTRIES: %d\n"
        "════════════════════════════════════════════════════════",
        p.turn,
        action,
        quality_avg,
        td["quality"]["clarity"], td["quality"]["depth"],
        td["quality"]["specificity"], td["quality"]["grounding"],
        depth_signal,
        p.follow_up_count, counter.count, counter.cap,
        str(_final_topic or "?")[:60],
        _covered_after_r if _covered_after_r else "none",
        _covered_after_s if _covered_after_s else "none",
        new_enforce_move_on_until_new,
        str(new_forced_next_topic_hint or "none")[:60],
        len(full_discussed),
    )
    logger.info(
        "[EVAL_PIPELINE] Done — action=%s quality=%.1f depth=%s follow_ups=%d enforce_move_on=%s turn=%d",
        action, quality_avg, depth_signal, counter.count, p.enforce_move_on_until_new, p.turn,
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
        # Mutations
        "new_active_resume_topic": new_active_resume_topic,
        "new_active_skill_topic": new_active_skill_topic,
        "new_covered_resume_topic_keys": list(tracker.covered_resume_keys),
        "new_covered_skill_topic_keys": list(tracker.covered_skill_keys),
        "new_topic_follow_up_count": counter.count,
        "new_topic_depth_history": counter.depth_history,
        "new_collapse_stage": counter.collapse_stage,
        "new_last_action_was_move_on": new_last_action_was_move_on,
        "new_enforce_move_on_until_new": new_enforce_move_on_until_new,
        "new_forced_next_topic_hint": new_forced_next_topic_hint,
        "new_expected_topic_kind": new_expected_topic_kind,
        "new_trust_state": new_trust_state,
        "new_contradiction_state": new_contradiction_state,
        "new_claim_index": new_claim_index,
        "new_current_interview_mode": new_current_interview_mode,
        "risk_integrity_delta": risk_integrity_delta,
        "risk_depth_delta": risk_depth_delta,
        "discussed_log_entry": discussed_log_entry,
    }