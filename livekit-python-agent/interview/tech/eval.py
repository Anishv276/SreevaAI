"""
eval_pipeline.py
Scores the candidate's answer on the current topic.
Returns: scores, one signal + reason, saturation state, action (PROBE/MOVE_ON).

Architecture:
  evaluate_answer()   — two parallel LLM calls: scores answer, detects ONE signal with reason
  TopicState          — per-topic saturation tracking
  run_eval_and_build_directive() — orchestrates everything, returns result dict to agent
"""
from __future__ import annotations
import re
import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

from interview.tech.scoring import evaluate_answer
from interview.slack_error_logger import log_llm_error

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
# TopicState -- per-topic saturation tracking
# ---------------------------------------------------------------------------
class TopicState:
    # Fixed question-type ladder enforced per skill/topic (Part A's fixed
    # sequence: Definition -> Mechanism -> Difference -> Scenario). A topic may
    # not be left (MOVE_ON to a different skill) until either every rung has
    # been asked once or the topic is closed early via two consecutive
    # denial-tier signals (see register_denial()/should_exit_on_denials()
    # below), or the scenario gate blocks entry (Part C.3/C.4).
    # "scenario" is the gated rung: entering it requires the candidate's average
    # score across the CONCEPTUAL rungs (definition/mechanism/difference) to
    # clear CONCEPTUAL_GATE_THRESHOLD_PCT -- see conceptual_avg_pct()/
    # can_enter_scenario() below. This keeps the scenario question from ever
    # being the 1st or 2nd question asked on a topic, and prevents escalating to
    # a harder scenario question for a candidate who has already shown they
    # lack the fundamentals.
    LADDER: tuple[str, ...] = ("definition", "mechanism", "difference", "scenario")
    # Index of the last CONCEPTUAL rung (everything before "scenario"). The
    # conceptual average gate is computed only over rungs up to and including
    # this index -- "scenario" itself is excluded since it's the thing being
    # gated, not part of the gate's own input.
    _LAST_CONCEPTUAL_RUNG_IDX: int = 2  # "difference"
    # Candidate must average >= 60% of max score (10.0) across the conceptual
    # rungs actually asked before the scenario rung may be entered.
    CONCEPTUAL_GATE_THRESHOLD_PCT: float = 0.60

    # -- Staged signal taxonomy (Part B) ------------------------------------
    # Each conceptual/scenario stage has its own 4-outcome signal set. Only the
    # signal matching the CURRENTLY ACTIVE rung is ever valid on a given turn --
    # the classifier is told which stage it's scoring (see scoring.py) so it
    # never has to disambiguate across all 16 at once.
    STAGE_SIGNALS: dict[str, tuple[str, ...]] = {
        "definition": ("definition_correct", "definition_partial", "definition_confused", "definition_absent"),
        "mechanism":  ("mechanism_correct", "mechanism_shallow", "mechanism_incorrect", "mechanism_absent"),
        "difference": ("distinction_clear", "distinction_one_sided", "distinction_reversed", "distinction_absent"),
        "scenario":   ("application_grounded", "application_generic", "reasoning_unjustified", "application_absent"),
    }
    # Cross-cutting signals may fire alongside (never instead of) a stage signal,
    # at most one per turn -- they describe HOW the answer was delivered or a
    # denial shape, not WHICH concept-outcome it was.
    CROSS_CUTTING_SIGNALS: tuple[str, ...] = (
        "verbal_disfluency", "buzzword_without_substance",
        "self_correction_recovery", "internal_contradiction", "pure_denial",
    )
    # Flow-control signals are system-computed (never returned by the LLM) --
    # concept_cleared/concept_gap_repeated drive the sub-concept rotation gate,
    # topic_floor_reached/scenario_gate_failed drive the topic-exit decision.
    FLOW_CONTROL_SIGNALS: tuple[str, ...] = (
        "concept_cleared", "concept_gap_repeated", "topic_floor_reached", "scenario_gate_failed",
    )

    # Denial tier per stage (Part C.1 pure-denial cap): the "*_absent" outcome
    # for whichever stage is active, plus the cross-cutting "pure_denial". Any
    # of these means the candidate gave essentially nothing on the CURRENT
    # rung -- the next question steps DOWN one rung, and 2 consecutive
    # occurrences force topic_floor_reached (MOVE_ON), regardless of sat score.
    _ABSENT_SIGNALS = frozenset({
        "definition_absent", "mechanism_absent", "distinction_absent", "application_absent",
    })
    _DENIAL_SIGNALS = _ABSENT_SIGNALS | frozenset({"pure_denial"})

    # Gap tier per stage (Part C.2 probe-on-same-gap): the "attempted but
    # incomplete" outcome -- NOT absent (candidate engaged) and NOT reversed/
    # incorrect (candidate is not actively wrong, just short of clearing the
    # concept). While one of these keeps firing, the sub-concept rotation holds
    # so the next probe stays on the SAME concept (a concrete example, or a
    # contrast with a related idea) instead of pivoting to an unrelated one.
    _GAP_SIGNALS = frozenset({
        "definition_partial", "mechanism_shallow", "distinction_one_sided",
        "application_generic", "reasoning_unjustified",
    })
    # "Confused"/"incorrect"/"reversed" outcomes are ACTIVE WRONGNESS, not just a
    # gap -- distinction_reversed in particular is scored WORSE than
    # distinction_absent (Part D.3: active wrongness > no attempt), but for
    # ladder/rotation FLOW purposes it is treated like the gap tier (stay on
    # the same concept, don't escalate) rather than the denial tier (which is
    # reserved for near-zero-content *_absent/pure_denial answers).
    _ACTIVE_WRONGNESS_SIGNALS = frozenset({
        "definition_confused", "mechanism_incorrect", "distinction_reversed",
    })

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

        # Dry-topic: if two consecutive answers score 0, candidate is stuck on this topic.
        self.last_score = None
        self.consecutive_zero_scores = 0

        # Response signal tracking: if clarification_request fires twice, escalate to MOVE_ON
        self.clarification_request_count = 0

        # Sub-concept rotation: advances so consecutive follow-ups on this topic
        # hit DIFFERENT items from the topic's probe_focus list. Persisted so the
        # agent can pick probe_focus[index % len(probe_focus)] each turn.
        #
        # Gated (Part C.2 probe-on-same-gap): rotation must NOT advance just
        # because a turn happened -- it advances only once the CURRENT
        # sub-concept clears (concept_cleared) or 2 consecutive gap-signal
        # probes have already been spent on it (concept_gap_repeated -- see
        # register_subconcept_probe() below, using the class-level
        # _GAP_SIGNALS/_ACTIVE_WRONGNESS_SIGNALS tiers). Before this, a gap
        # signal on sub-concept A would still unconditionally rotate to
        # sub-concept B next turn, pivoting away from an unresolved gap.
        self.probe_rotation_index = 0
        # consecutive_subconcept_probes: how many probes IN A ROW have targeted
        # the current sub-concept without it clearing. Reset to 0 whenever the
        # rotation actually advances (new sub-concept) or a cleared/reversed/
        # incorrect signal fires (active wrongness also counts as "not a plain
        # gap" for rotation purposes -- see register_subconcept_probe()).
        self.consecutive_subconcept_probes: int = 0

        # -- Ladder state -----------------------------------------------------
        # ladder_rung: index into LADDER of the rung the NEXT question should be
        # asked at. Starts at 0 (definition). Advances by 1 after a non-denial
        # answer at the current rung; steps back by 1 (never below 0) after a
        # denial, so the next question on this skill is easier, not harder.
        self.ladder_rung: int = 0
        # rungs_covered: which rung INDEXES have had at least one question asked,
        # regardless of later step-downs -- ladder is "complete" once every rung
        # in LADDER has been covered at least once (or closed early -- see below).
        self.rungs_covered: set[int] = set()
        # consecutive_denials: resets to 0 on any non-denial answer. Two in a row
        # closes the topic out entirely (see should_exit_on_denials()) instead of
        # continuing to probe a skill the candidate has twice failed to answer.
        self.consecutive_denials: int = 0
        self.closed_on_denials: bool = False
        # rung_scores: weighted score recorded each time a question was asked AT
        # a given rung index (keyed by rung index, list since a rung can in
        # principle be revisited after a step-down/step-up cycle). Used by
        # conceptual_avg_pct()/can_enter_scenario() to gate the scenario rung on
        # the candidate's average performance across the CONCEPTUAL rungs only.
        self.rung_scores: dict[int, list[float]] = {}
        # scenario_gate_blocked: True once the conceptual gate has been checked
        # and failed -- the topic is closed out (MOVE_ON) without ever reaching
        # the scenario rung, rather than continuing to escalate difficulty on a
        # candidate who has already shown they lack the fundamentals.
        self.scenario_gate_blocked: bool = False

    # Weak-exit checkpoints, replicating the pre-ladder architecture's
    # 3-tier saturation-percentage rule (uniform across importance, per the
    # user's explicit spec -- the old per-importance progress_check_pct
    # matrix is NOT being restored, only the checkpoint SHAPE):
    #   turn 3: sat < 50% of threshold  -> MOVE_ON now.
    #           sat >= 50%              -> one more probe (turn 4).
    #   turn 4: sat < 80% of threshold  -> one more probe (turn 5, final).
    #           sat >= 80%              -> candidate has clearly shown
    #           competence, exit now rather than mechanically forcing a 5th
    #           question just to fill the slot.
    #   turn 5: always MOVE_ON regardless of sat -- hard cap, one final
    #           question was already spent getting here.
    # IMPORTANT: each check must fire ONLY at its own exact turn, not "any
    # turn >= N" -- otherwise a later turn would keep re-evaluating an
    # earlier (wrong) bar instead of deferring to its own rule.
    _WEAK_EXIT_TURN3_PCT: float = 0.50
    _WEAK_EXIT_TURN4_PCT: float = 0.80

    def is_weak_candidate_exit(self) -> bool:
        if self.saturation_threshold <= 0:
            return False
        if self.follow_up_turns < 3:
            return False
        sat_pct = self.saturation_score / self.saturation_threshold
        if self.follow_up_turns == 3:
            return sat_pct < self._WEAK_EXIT_TURN3_PCT
        if self.follow_up_turns == 4:
            return sat_pct >= self._WEAK_EXIT_TURN4_PCT
        return True  # follow_up_turns >= 5: hard cap, always exit

    def is_dry_topic(self) -> bool:
        # Two CONSECUTIVE answers with score 0 -> candidate is stuck, move on.
        # consecutive_zero_scores tracks a real streak (reset to 0 the moment any
        # answer scores above 0) -- checking last_score alone only knows the single
        # most recent score, so a single zero at turn >= 2 (after prior non-zero
        # answers) incorrectly looked like two-in-a-row and forced a premature MOVE_ON.
        return self.consecutive_zero_scores >= 2

    # -- Ladder progression ------------------------------------------------
    def current_rung_name(self) -> str:
        """The ladder rung the NEXT question on this topic must target."""
        idx = max(0, min(self.ladder_rung, len(self.LADDER) - 1))
        return self.LADDER[idx]

    def is_ladder_complete(self) -> bool:
        """True once every rung has been covered at least once, the topic was
        closed early by two consecutive denial-tier signals (topic_floor_reached,
        Part C.1), or the scenario gate blocked entry into the final rung
        (scenario_gate_failed, Part C.3/C.4: candidate below the conceptual
        threshold never reaches the scenario question). This is a hard floor
        on MOVE_ON: a topic cannot be left to switch to a different skill
        while this is False, regardless of saturation score."""
        return (
            self.closed_on_denials
            or self.scenario_gate_blocked
            or len(self.rungs_covered) >= len(self.LADDER)
        )

    def register_denial(self) -> None:
        """Call when the just-scored answer's signal is in the denial tier
        (a "*_absent" stage signal or cross-cutting pure_denial). Steps the
        ladder DOWN one rung (never below "definition") so the next question
        is easier, not harder, and tracks the consecutive-denial streak used
        by should_exit_on_denials() -- Part C.1's pure-denial cap: on the 2nd
        consecutive occurrence, topic_floor_reached fires and forces MOVE_ON
        immediately, regardless of accumulated sat score."""
        self.rungs_covered.add(self.ladder_rung)
        self.consecutive_denials += 1
        self.ladder_rung = max(0, self.ladder_rung - 1)
        if self.consecutive_denials >= 2:
            self.closed_on_denials = True  # topic_floor_reached

    def register_progress(self) -> None:
        """Call when the just-scored answer's signal is NOT in the denial tier.
        Resets the denial streak and advances the ladder rung by one (capped at
        the last rung) so the next question moves one step up the ladder.

        Gated advance into "scenario" (Part C.3/C.4): stepping from the last
        conceptual rung ("difference") into "scenario" additionally requires
        can_enter_scenario() -- if the candidate hasn't cleared the conceptual
        average threshold yet, the rung holds at "difference" instead of
        advancing, and the decision block's should_exit_on_failed_conceptual_gate()
        takes over (scenario_gate_failed -> MOVE_ON without ever asking the
        scenario question) once enough conceptual questions have been asked to
        judge that fairly."""
        self.rungs_covered.add(self.ladder_rung)
        self.consecutive_denials = 0
        _next_rung = min(len(self.LADDER) - 1, self.ladder_rung + 1)
        if (
            _next_rung == len(self.LADDER) - 1  # stepping INTO "scenario"
            and self.ladder_rung != _next_rung  # actually advancing, not already there
            and not self.can_enter_scenario()
        ):
            return  # hold at the current (conceptual) rung -- gate not cleared yet
        self.ladder_rung = _next_rung

    def should_exit_on_denials(self) -> bool:
        """Part C.1 hard cap: two consecutive denial-tier signals on this
        skill fire topic_floor_reached and close it out entirely, rather than
        continuing to probe it further -- regardless of accumulated sat."""
        return self.consecutive_denials >= 2

    # -- Conceptual-average scenario gate -----------------------------------
    def conceptual_avg_pct(self) -> float:
        """Average score (as a fraction of max=10.0) across only the CONCEPTUAL
        rungs (definition/mechanism/difference) that have actually been
        asked so far. Returns 0.0 if no conceptual rung has been scored yet --
        callers must check that at least one conceptual answer exists before
        treating a 0.0 as "candidate scored zero" vs. "nothing asked yet"."""
        _scores: list[float] = []
        for idx in range(self._LAST_CONCEPTUAL_RUNG_IDX + 1):
            _scores.extend(self.rung_scores.get(idx, []))
        if not _scores:
            return 0.0
        return (sum(_scores) / len(_scores)) / 10.0

    def conceptual_questions_asked(self) -> int:
        """Count of conceptual-rung (non-scenario) answers scored so far."""
        return sum(
            len(self.rung_scores.get(idx, []))
            for idx in range(self._LAST_CONCEPTUAL_RUNG_IDX + 1)
        )

    def can_enter_scenario(self) -> bool:
        """Gate for the scenario rung (item 2/5): only allow the ladder to
        advance INTO "scenario" once at least one conceptual question has been
        asked AND the conceptual average clears CONCEPTUAL_GATE_THRESHOLD_PCT.
        A candidate below threshold after their conceptual questions should
        never reach the scenario/debugging-style question at all."""
        if self.conceptual_questions_asked() == 0:
            return False
        return self.conceptual_avg_pct() >= self.CONCEPTUAL_GATE_THRESHOLD_PCT

    def should_exit_on_failed_conceptual_gate(self) -> bool:
        """True once at least 2 conceptual questions have been asked, the
        candidate is below the scenario-entry threshold, and every conceptual
        rung has therefore been exhausted (register_progress advanced past
        "difference" without ever getting to gate-check on scenario entry, or
        register_denial has looped back without a way forward). This fires
        scenario_gate_failed (Part C.3/C.4's hard stop): don't keep escalating
        difficulty on a candidate who has already shown they lack the
        fundamentals -- MOVE_ON instead of ever asking the scenario question.

        Priority vs. the denial cap (Part C.1): a SINGLE denial-tier signal
        must step down and stay on the same topic, never force an exit by
        itself -- only two CONSECUTIVE denial-tier signals do
        (should_exit_on_denials() -> topic_floor_reached). A denial-tier
        answer scores 0.0 and would otherwise drag the conceptual average
        below threshold on its own, which would make this gate exit on the
        very first denial and contradict that rule. So: while there is an
        active (not yet 2-strike) denial streak, this gate defers entirely --
        should_exit_on_denials() owns the exit decision for denial-driven
        answers; this gate only ever judges a candidate who is giving real
        (if weak or actively wrong) attempts."""
        if self.scenario_gate_blocked:
            return True
        if self.consecutive_denials > 0:
            return False
        if self.conceptual_questions_asked() < 2:
            return False
        if self.can_enter_scenario():
            return False
        # Below threshold with >= 2 conceptual questions in: block the scenario
        # rung permanently for this topic and signal exit (scenario_gate_failed).
        self.scenario_gate_blocked = True
        return True

    # -- Sub-concept rotation gate (Part C.2 probe-on-same-gap) -------------
    def register_subconcept_probe(self, signal: str | None) -> bool:
        """Call once per PROBE turn with the signal from the answer that was
        just scored. Returns True if the NEXT question's sub-concept rotation
        should ADVANCE to a new item (concept_cleared, or concept_gap_repeated
        after 2 failed probes), False if it must HOLD on the current
        sub-concept (concept still open).

        Rule: a gap-tier signal (definition_partial/mechanism_shallow/
        distinction_one_sided/application_generic/reasoning_unjustified) or an
        active-wrongness signal (definition_confused/mechanism_incorrect/
        distinction_reversed) both mean the candidate has NOT cleared the
        current sub-concept -- the rotation holds so the next probe targets
        the SAME concept (a concrete example, or a contrast with a related
        idea), not a pivot to an unrelated one. Only after 2 consecutive
        not-cleared probes on this sub-concept does it give up
        (concept_gap_repeated) and allow the rotation to move on. Any other
        signal (a "_correct"/"_clear"/"_grounded" outcome -- concept_cleared)
        resets the streak and advances immediately.
        """
        if signal in self._GAP_SIGNALS or signal in self._ACTIVE_WRONGNESS_SIGNALS:
            self.consecutive_subconcept_probes += 1
            if self.consecutive_subconcept_probes >= 2:
                self.consecutive_subconcept_probes = 0
                return True  # concept_gap_repeated -- give up, rotate
            return False  # hold: stay on the same sub-concept for the next probe
        self.consecutive_subconcept_probes = 0
        return True  # concept_cleared (or an unrelated signal) -- free to rotate

    # Signals where Ishitha is re-asking / rephrasing / redirecting the SAME question
    # instead of asking a new follow-up. The candidate has not yet had a real attempt,
    # so this turn must not count toward follow_up_turns, saturation, dry_topic, or
    # the fired-signals variety ban. Score contribution is zero regardless.
    _NON_FOLLOWUP_SIGNALS = frozenset({
        "clarification_request",
        "rephrase_request",
        "off_topic",
    })

    def add_contribution(self, weighted: float, signal: str | None, turn: int | None = None) -> None:
        # Re-ask turns (candidate asked to rephrase, restarted their own answer, or
        # answered a different question) don't count as a real follow-up. Skip all
        # scoring/counter updates so the candidate isn't penalised for asking us to
        # repeat the question. The turn still fires an [SIGNAL] event upstream -- we
        # just don't debit their 3-question budget for it.
        if signal in self._NON_FOLLOWUP_SIGNALS:
            # Track the last turn for logging continuity, but nothing else changes.
            if turn is not None:
                self.updated_turn = turn
            return

        contribution = max(0.0, _score_to_contribution(weighted))
        # Base credit ramps smoothly with answer quality so mid-quality answers still advance
        # saturation. weighted < 1.0 = no credit (essentially a non-answer). weighted 1.0-3.0
        # scales linearly from 0 to full base. weighted >= 3.0 = full base credit.
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
        # Track last score for dry_topic detection (two consecutive 0s)
        self.last_score = weighted
        if turn is not None:
            self.updated_turn = turn

        # Record this score against the rung the JUST-ANSWERED question targeted
        # (self.ladder_rung, before register_denial/register_progress mutate it
        # below) -- feeds conceptual_avg_pct()'s scenario-entry gate.
        self.rung_scores.setdefault(self.ladder_rung, []).append(weighted)

        # Ladder step: a denial signal steps the rung DOWN (easier next question)
        # and counts toward the 2-strike topic close; anything else steps UP.
        # Skipped for non-followup signals (clarification/rephrase/off_topic) --
        # those returned above before reaching this point.
        if signal in self._DENIAL_SIGNALS:
            self.register_denial()
        else:
            self.register_progress()

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
            "last_score":          self.last_score,
            "clarification_request_count": self.clarification_request_count,
            "consecutive_zero_scores": self.consecutive_zero_scores,
            "probe_rotation_index": self.probe_rotation_index,
            "ladder_rung":         self.ladder_rung,
            "rungs_covered":       sorted(self.rungs_covered),
            "consecutive_denials": self.consecutive_denials,
            "closed_on_denials":   self.closed_on_denials,
            "rung_scores":         {str(k): v for k, v in self.rung_scores.items()},
            "scenario_gate_blocked": self.scenario_gate_blocked,
            "consecutive_subconcept_probes": self.consecutive_subconcept_probes,
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
        obj.last_score          = float(d.get("last_score")) if d.get("last_score") is not None else None
        obj.clarification_request_count = int(d.get("clarification_request_count", 0) or 0)
        obj.consecutive_zero_scores = int(d.get("consecutive_zero_scores", 0) or 0)
        obj.probe_rotation_index = int(d.get("probe_rotation_index", 0) or 0)
        obj.ladder_rung = int(d.get("ladder_rung", 0) or 0)
        obj.rungs_covered = set(int(x) for x in (d.get("rungs_covered") or []))
        obj.consecutive_denials = int(d.get("consecutive_denials", 0) or 0)
        obj.closed_on_denials = bool(d.get("closed_on_denials", False))
        obj.rung_scores = {int(k): list(v) for k, v in (d.get("rung_scores") or {}).items()}
        obj.scenario_gate_blocked = bool(d.get("scenario_gate_blocked", False))
        obj.consecutive_subconcept_probes = int(d.get("consecutive_subconcept_probes", 0) or 0)
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
    _topic_importance = current_topic_state.importance if current_topic_state else "HIGH"
    # Part B: the staged signal taxonomy is scoped to whichever rung
    # (definition/mechanism/difference/scenario) the LAST question targeted --
    # current_rung_name() reflects that rung (it's mutated to the NEXT rung
    # only inside add_contribution(), which hasn't run yet at this point), so
    # the signal classifier can be told exactly which 4-signal stage set to
    # pick from instead of disambiguating across all of them at once.
    _active_stage = current_topic_state.current_rung_name() if current_topic_state else "definition"

    try:
        raw = await _score_and_capture(
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
            active_stage=_active_stage,
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
        # Recovery signal: pick the "gap" tier outcome for whatever stage was
        # active -- "attempted but not fully clear" is the closest honest read
        # when the LLM call itself failed, without asserting zero attempt
        # (*_absent) or active wrongness (*_confused/*_incorrect/*_reversed).
        _recovery_signal = {
            "definition": "definition_partial",
            "mechanism": "mechanism_shallow",
            "difference": "distinction_one_sided",
            "scenario": "application_generic",
        }.get(_active_stage, "definition_partial")
        raw = {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0, "overall": 1.3,
            "action": "PROBE", "signal": _recovery_signal,
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
    cross_cutting_signal: str | None = raw.get("cross_cutting_signal")
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
    _should_rotate_subconcept = (
        current_topic_state.register_subconcept_probe(signal) if current_topic_state else True
    )

    is_saturated = current_topic_state.is_saturated if current_topic_state else False
    _weak_exit = current_topic_state is not None and current_topic_state.is_weak_candidate_exit()
    _dry_topic = current_topic_state is not None and current_topic_state.is_dry_topic()
    # Part C.1: pure-denial cap -- 2 consecutive denial-tier signals fire
    # topic_floor_reached and force MOVE_ON immediately.
    _denial_exit = current_topic_state is not None and current_topic_state.should_exit_on_denials()
    # Part C.3/C.4: candidate's conceptual average is below the scenario-entry
    # threshold after >= 2 conceptual questions -- fire scenario_gate_failed and
    # close the topic out now, never reaching the scenario question. Calling
    # this also LATCHES scenario_gate_blocked=True on current_topic_state so
    # is_ladder_complete() agrees this topic is done, not just incomplete-and-waiting.
    _conceptual_gate_exit = (
        current_topic_state is not None
        and current_topic_state.should_exit_on_failed_conceptual_gate()
    )
    _ladder_complete = current_topic_state is None or current_topic_state.is_ladder_complete()

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

    # -- Decision (priority order; response signals override saturation) ----
    # Response-shape signals (clarification_request/rephrase_request/off_topic)
    # fire immediately with forced_action=True. They override saturation logic
    # entirely -- no need to check dry_topic/weak_exit/saturated.
    # ESCALATION: if clarification_request fires 3+ times in a row, upgrade to MOVE_ON
    # TOPIC_FLOOR_REACHED (Part C.1): two consecutive denial-tier signals
    # (a "*_absent" stage signal or cross-cutting pure_denial) on this skill
    # close it out immediately, same priority as the clarification escalation --
    # both are hard 2-strike rules that override saturation/ladder state entirely.
    _escalate_to_move_on = False
    if _denial_exit:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=topic_floor_reached (2 consecutive denial-tier signals) turn=%d", p.turn)
    elif _conceptual_gate_exit:
        action = "MOVE_ON"
        logger.info(
            "[DECISION] MOVE_ON reason=scenario_gate_failed (avg=%.0f%% < %.0f%% after %d conceptual questions) turn=%d",
            (current_topic_state.conceptual_avg_pct() * 100) if current_topic_state else 0.0,
            TopicState.CONCEPTUAL_GATE_THRESHOLD_PCT * 100,
            current_topic_state.conceptual_questions_asked() if current_topic_state else 0,
            p.turn,
        )
    elif _forced_response_signal and current_topic_state:
        if action == "REPHRASE" and current_topic_state.clarification_request_count >= 3:
            action = "MOVE_ON"
            _escalate_to_move_on = True
            logger.info("[DECISION] MOVE_ON reason=clarification_escalation (asked 3x) turn=%d", p.turn)
        else:
            logger.info("[DECISION] %s (forced response signal) reason=%s turn=%d", action, raw.get("reason", "forced"), p.turn)
    elif _forced_response_signal:
        logger.info("[DECISION] %s (forced response signal) reason=%s turn=%d", action, raw.get("reason", "forced"), p.turn)
    elif not _ladder_complete:
        # Ladder floor: a topic/skill cannot be left for a different skill until
        # every rung (definition/mechanism/difference/scenario) has been
        # asked at least once, or it was closed early via _denial_exit or
        # _conceptual_gate_exit above. Saturation/weak_exit/dry_topic are
        # secondary signals within a skill and must not override this floor.
        action = "PROBE"
        logger.info(
            "[DECISION] PROBE (ladder incomplete: rung=%s covered=%d/%d) turn=%d",
            current_topic_state.current_rung_name() if current_topic_state else "?",
            len(current_topic_state.rungs_covered) if current_topic_state else 0,
            len(TopicState.LADDER), p.turn,
        )
    elif not _escalate_to_move_on and _dry_topic:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=dry_topic (two consecutive zero scores) turn=%d", p.turn)
    elif _weak_exit:
        action = "MOVE_ON"
        _sat_pct_now = (sat_score / sat_threshold) if sat_threshold > 0 else 0.0
        _weak_exit_reason = (
            "saturation_checkpoint_high" if _sat_pct_now >= 0.80
            else "saturation_checkpoint_low"
        )
        logger.info(
            "[DECISION] MOVE_ON reason=%s (turn=%d sat=%.0f%%)",
            _weak_exit_reason, current_topic_state.follow_up_turns if current_topic_state else p.turn,
            _sat_pct_now * 100,
        )
    elif is_saturated:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=saturated turn=%d", p.turn)
    else:
        action = "PROBE"

    if action == "PROBE":
        pct_sat = 100 * min(1.0, sat_score / sat_threshold) if sat_threshold > 0 else 0
        logger.info("[DECISION] PROBE signal=%s sat=%.0f%% rung=%s turn=%d",
                    signal or "none",
                    pct_sat,
                    current_topic_state.current_rung_name() if current_topic_state else "?",
                    p.turn)

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
        "cross_cutting_signal":    cross_cutting_signal,
        "signal_reason":           signal_reason,
        "topic":                   p.active_topic or "general",
        "topic_saturation_score":  sat_score,
        "topic_saturation_threshold": sat_threshold,
        "response_latency_sec":    p.response_latency_sec,
        "question_asked_at_wall_ms": p.question_asked_at_wall_ms,
        "action":                  action,
        "band":                    p.band,
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
        "cross_cutting_signal": cross_cutting_signal,
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
            # Item 3: whether agent_runtime's probe_rotation_index may advance to a
            # new sub-concept for the NEXT PROBE directive, or must hold on the
            # current one (gap signal fired, < 2 consecutive failed probes on it).
            "should_rotate_subconcept": _should_rotate_subconcept,
        },
        "eval_llm_usages": list(_captured_usage),
        "turn":    p.turn,
        "app_id":  p.app_id,
    }
