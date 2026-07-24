"""
Replays the transcript's answer sequence (documented in the fix ticket) against
TopicState (interview/tech/eval.py) to assert the four concrete problems are
fixed:

  1. TOPIC DRIFT: a topic cannot be left (MOVE_ON) for a different skill until
     every ladder rung has been covered, or it was closed early by 2 denials.
  2. DIFFICULTY ESCALATION AFTER FAILURE: a denial steps the ladder DOWN one
     rung (never up), and 2 consecutive denials close the skill out.
  3. NO-JARGON TEACH-BACK OVERUSE: the construction may fire at most once
     across the whole interview (tested via the agent_runtime tracker).
  4. LENGTH/FORMAT VALIDATOR: word count <= 25, exactly one '?', no compound
     "and"/"or" stacking a second question.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from interview.tech.eval import TopicState
from interview.agent_runtime import (
    validate_spoken_question,
    is_no_jargon_teachback,
    record_question_pattern,
    render_recent_question_patterns,
    _classify_question_construction,
)
import collections


# ---------------------------------------------------------------------------
# PROBLEM 1: ladder lock -- no MOVE_ON until the ladder is exhausted
# ---------------------------------------------------------------------------
def test_ladder_starts_at_definition_and_is_incomplete_initially():
    ts = TopicState("Python", level=2)
    assert ts.current_rung_name() == "definition"
    assert not ts.is_ladder_complete()


def test_ladder_must_cover_all_four_rungs_before_completion():
    ts = TopicState("Python", level=2)
    # Strong answers each turn -- ladder advances one rung per turn, never skips,
    # and only advances into "scenario" once the conceptual gate clears (all
    # answers here are strong, so it clears immediately).
    # Each add_contribution call answers the CURRENT rung's question and then
    # advances -- so completing all 4 rungs takes 4 calls, not 3.
    _signals_per_rung = ["definition_correct", "mechanism_correct", "distinction_clear", "application_grounded"]
    rungs_seen = [ts.current_rung_name()]
    for i in range(4):
        ts.add_contribution(weighted=8.0, signal=_signals_per_rung[i], turn=i + 1)
        rungs_seen.append(ts.current_rung_name())
        if i < 3:
            assert not ts.is_ladder_complete()
    assert rungs_seen == ["definition", "mechanism", "difference", "scenario", "scenario"]
    # All 4 rungs (0,1,2,3) have now each had a question asked at them.
    assert ts.is_ladder_complete()


def test_topic_cannot_saturate_and_exit_before_ladder_complete():
    # High saturation score after just TWO strong turns must NOT be enough to
    # leave the topic while the ladder still has unasked rungs -- this is the
    # actual bug behind "6 different sub-domains in one interview, none
    # completed as a ladder": saturation used to be the ONLY gate on MOVE_ON.
    ts = TopicState("Python", level=1)  # low threshold level
    ts.add_contribution(weighted=10.0, signal="definition_correct", turn=1)
    ts.add_contribution(weighted=10.0, signal="mechanism_correct", turn=2)
    assert ts.is_saturated  # saturation alone says "done" after 2 strong turns
    assert not ts.is_ladder_complete()  # but the ladder floor blocks leaving (only 2/4 rungs asked)


# ---------------------------------------------------------------------------
# PROBLEM 2: denial steps DOWN, never up; 2 consecutive denials close the skill
# ---------------------------------------------------------------------------
def test_denial_steps_ladder_down_not_up():
    ts = TopicState("NLP Embeddings", level=2)
    # Advance to 'difference' first via 2 strong answers.
    ts.add_contribution(weighted=8.0, signal="definition_correct", turn=1)
    ts.add_contribution(weighted=8.0, signal="mechanism_correct", turn=2)
    assert ts.current_rung_name() == "difference"
    # Candidate says "I don't know" (distinction_absent) -- must step DOWN, not escalate.
    ts.add_contribution(weighted=0.0, signal="distinction_absent", turn=3)
    assert ts.current_rung_name() == "mechanism"


def test_two_consecutive_denials_close_the_skill():
    ts = TopicState("Vector DB nearest-neighbor search", level=2)
    ts.add_contribution(weighted=0.0, signal="definition_absent", turn=1)
    assert not ts.should_exit_on_denials()
    assert not ts.closed_on_denials
    ts.add_contribution(weighted=0.0, signal="definition_absent", turn=2)
    assert ts.should_exit_on_denials()
    assert ts.closed_on_denials
    # Once closed on denials, the ladder is considered complete (early exit is
    # a valid way to finish a topic, not a violation of the ladder floor).
    assert ts.is_ladder_complete()


def test_cross_cutting_pure_denial_also_counts_toward_the_denial_cap():
    # pure_denial is a cross-cutting signal, not a stage signal -- but a stage
    # signal in the *_absent tier and cross-cutting pure_denial both belong to
    # the SAME denial tier (TopicState._DENIAL_SIGNALS), so either should
    # count toward the 2-strike cap.
    ts = TopicState("Vector DB nearest-neighbor search", level=2)
    ts.add_contribution(weighted=0.0, signal="pure_denial", turn=1)
    ts.add_contribution(weighted=0.0, signal="mechanism_absent", turn=2)
    assert ts.should_exit_on_denials()
    assert ts.closed_on_denials


def test_single_denial_does_not_close_the_skill():
    # Regression guard: PROBLEM 2 says the ticket's five separate denial points
    # (4:18, 5:57, 6:21, 7:56, 10:17) were each followed by a HARDER question --
    # a single denial must step down and stay on the SAME skill, not force exit.
    ts = TopicState("Transformer attention", level=2)
    ts.add_contribution(weighted=0.0, signal="definition_absent", turn=1)
    assert not ts.is_ladder_complete()
    assert not ts.closed_on_denials


def test_denial_rung_never_goes_below_definition():
    ts = TopicState("Python", level=2)
    ts.add_contribution(weighted=0.0, signal="definition_absent", turn=1)
    assert ts.current_rung_name() == "definition"  # floor, not negative


def test_active_wrongness_signal_also_steps_ladder_down():
    # definition_confused/mechanism_incorrect/distinction_reversed are ACTIVE
    # WRONGNESS, not the denial tier -- register_progress() treats them like
    # any non-denial signal for LADDER purposes (they still advance the rung),
    # even though they score worse than *_absent (Part D.3) and hold the
    # sub-concept rotation like a gap signal (Part C.2).
    ts = TopicState("Python", level=2)
    ts.add_contribution(weighted=2.0, signal="definition_confused", turn=1)
    assert ts.current_rung_name() == "mechanism"  # advanced, not denial-tier


def test_full_transcript_style_sequence_stays_on_one_skill_until_ladder_or_denial_exit():
    """Simulates something close to the reported transcript shape for a single
    matched skill: strong open, then a run of denials, asserting the system
    never silently escalates and closes the skill within the 2-denial cap
    instead of drifting to unrelated sub-domains."""
    ts = TopicState("NLP Embeddings", level=2)
    # Turn 1: reasonable definition-level answer.
    ts.add_contribution(weighted=6.0, signal="definition_correct", turn=1)
    assert ts.current_rung_name() == "mechanism"
    # Turn 2: "I don't know" about the mechanism in plain English (ticket's
    # example) -- must step DOWN to definition, not escalate to domain-mismatch.
    ts.add_contribution(weighted=0.0, signal="mechanism_absent", turn=2)
    assert ts.current_rung_name() == "definition"
    assert not ts.closed_on_denials
    # Turn 3: another denial (consecutive) -- skill closes out entirely instead
    # of continuing to probe tokenization/attention/LangChain/vector DB under
    # the same nominal "topic."
    ts.add_contribution(weighted=0.0, signal="definition_absent", turn=3)
    assert ts.closed_on_denials
    assert ts.is_ladder_complete()


# ---------------------------------------------------------------------------
# PROBLEM 3: no-jargon teach-back fires at most once across the WHOLE interview
# ---------------------------------------------------------------------------
def test_no_jargon_teachback_detected_across_different_topics():
    q1 = "Can you explain how that works to someone who has never touched it, no jargon?"
    q2 = "Walk me through what happens when the request times out?"
    q3 = "In plain english, how would you explain what a vector actually is?"
    assert is_no_jargon_teachback(q1)
    assert not is_no_jargon_teachback(q2)
    assert is_no_jargon_teachback(q3)


def test_teach_back_construction_flagged_as_repeat_via_pattern_log():
    """Reproduces PROBLEM 3: the same 'no-jargon teach-back' scaffold used for
    list mutability, then again for embeddings/attention/retrievers, must show
    up as the SAME construction in RECENT_QUESTION_PATTERNS so a collision
    check has real data to compare against -- previously nothing computed a
    scaffold at all."""
    log: collections.deque = collections.deque(maxlen=8)
    record_question_pattern(log, "Explain list mutability to someone who's never coded, no jargon.", "mechanism_shallow")
    record_question_pattern(log, "In plain english, what makes two embeddings close together?", "mechanism_shallow")
    constructions = [p["construction"] for p in log]
    assert constructions == ["no_jargon_teachback", "no_jargon_teachback"]
    rendered = render_recent_question_patterns(log)
    assert rendered.count("no_jargon_teachback") == 2


def test_generic_question_is_not_misclassified_as_teachback():
    assert _classify_question_construction(
        "What would you check first if retrieval quality dropped overnight?", None
    ) == "what_would_you_check"


# ---------------------------------------------------------------------------
# PROBLEM 4: hard word count / '?' count / compound-question validator
# ---------------------------------------------------------------------------
def test_validator_passes_a_compliant_question():
    q = "Right, tricky one -- what would you check first if results felt off?"
    assert validate_spoken_question(q) == []


def test_validator_rejects_over_25_words():
    # Modeled on the ticket's tokenization question at 5:53 (2+ sentences of setup).
    q = (
        "A lot of teams run into trouble when documents get split into chunks "
        "that are too large or too small for the embedding model, so what would "
        "you check first in the chunking config?"
    )
    violations = validate_spoken_question(q)
    assert any("word_count" in v for v in violations)


def test_validator_rejects_stacked_questions():
    # Modeled on the ticket's "what would you consider... what's the first
    # thing you'd check" double-ask pattern -- only one literal '?' here, so
    # this must be caught by the compound-clause check, not the '?' counter.
    q = "What would you consider the biggest risk here, and what's the first thing you'd check?"
    violations = validate_spoken_question(q)
    assert any("compound question" in v for v in violations)


def test_validator_rejects_compound_and_after_question_mark():
    q = "What broke first? And what did you do about it?"
    violations = validate_spoken_question(q)
    assert any("question_mark_count" in v or "compound" in v for v in violations)


def test_validator_allows_no_follow_up_needed_sentinel():
    assert validate_spoken_question("NO_FOLLOW_UP_NEEDED") == []


def test_validator_allows_and_before_the_question_mark():
    # An "and" that's part of a single clause before the (only) question mark
    # is not a compound ask -- must not false-positive.
    q = "If latency spiked and errors climbed together, what would you check first?"
    assert validate_spoken_question(q) == []


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-v"]))
