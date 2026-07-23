"""
Tests for the Part A/B/D pieces of the staged-taxonomy fix ticket that aren't
covered by test_ladder_and_denial.py / test_conceptual_gate_and_rotation.py:

  Part A: TOPIC_QUESTION_GENERATION_SYSTEM's validate_topic_question_set() --
    fixed stage order, scenario last and exactly once, never 1st/2nd, phrasing
    rules (word count, '?' count, compound-ask, no filler in question text).

  Part B: probe.py's get_probe_context() correctly short-circuits on the
    "cleared" tier (definition_correct/mechanism_correct/distinction_clear/
    application_grounded) with NO_FOLLOW_UP_NEEDED guidance, and surfaces a
    cross-cutting signal note alongside a stage signal.

  Part D: evaluate_answer()'s score calibration -- distinction_reversed scores
    below distinction_absent (D.3), self_correction_recovery boosts sat
    relative to the fumble alone (D.2). Exercised via evaluate_answer() itself
    with _call_scoring/_call_signal_classification monkeypatched (not
    evaluate_answer directly), so the real calibration code path runs.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from interview.tech.probe import validate_topic_question_set, get_probe_context
import interview.tech.scoring as scoring_mod


# ---------------------------------------------------------------------------
# Part A: validate_topic_question_set -- validates the RUNNING SEQUENCE of
# topic questions asked so far (pool/gap-driven model: no fixed stage order,
# scenario is the only fixed-position rule, follow-ups target the same
# concept as the gap they follow, capped at 2 back-to-back).
# ---------------------------------------------------------------------------
_GOOD_SEQUENCE = [
    {"type": "definition", "targets_concept": "hash_map", "is_followup_on": None,
     "text": "What actually is a hash map, in plain terms?"},
    {"type": "mechanism", "targets_concept": "hash_collision", "is_followup_on": None,
     "text": "How does a hash map resolve two keys landing in the same bucket?"},
    {"type": "difference", "targets_concept": "hash_map_vs_tree_map", "is_followup_on": None,
     "text": "What's the difference between a hash map and a tree map?"},
    {"type": "scenario", "targets_concept": "hash_map_lookup_perf", "is_followup_on": None,
     "text": "Suppose lookups suddenly get slow at scale, what would you check first?"},
]


def test_valid_question_sequence_passes():
    assert validate_topic_question_set(_GOOD_SEQUENCE) == []


def test_empty_question_set_fails():
    violations = validate_topic_question_set([])
    assert any("empty" in v for v in violations)


def test_scenario_as_first_question_fails():
    violations = validate_topic_question_set([_GOOD_SEQUENCE[3]])
    assert any("1st or 2nd" in v for v in violations)


def test_scenario_as_second_question_fails():
    violations = validate_topic_question_set([_GOOD_SEQUENCE[0], _GOOD_SEQUENCE[3]])
    assert any("1st or 2nd" in v for v in violations)


def test_scenario_not_last_in_sequence_so_far_fails():
    # A question asked AFTER a scenario in this topic is never allowed --
    # scenario is the fixed-last rung.
    seq = [_GOOD_SEQUENCE[0], _GOOD_SEQUENCE[1], _GOOD_SEQUENCE[3], _GOOD_SEQUENCE[2]]
    violations = validate_topic_question_set(seq)
    assert any("LAST item" in v for v in violations)


def test_two_scenarios_fails():
    two_scenarios = [_GOOD_SEQUENCE[0], _GOOD_SEQUENCE[1], _GOOD_SEQUENCE[3], dict(_GOOD_SEQUENCE[3])]
    violations = validate_topic_question_set(two_scenarios)
    assert any("scenario count=2" in v for v in violations)


def test_topic_can_end_after_two_conceptual_questions():
    # Part A pool model: a topic legitimately ends after 2 conceptual
    # questions with no scenario at all if the gate never opens -- this must
    # NOT be flagged as "missing" anything.
    short_seq = [_GOOD_SEQUENCE[0], _GOOD_SEQUENCE[1]]
    assert validate_topic_question_set(short_seq) == []


def test_followup_on_same_concept_is_allowed():
    seq = [
        _GOOD_SEQUENCE[0],
        {"type": "followup", "targets_concept": "hash_map", "is_followup_on": "hash_map",
         "text": "Say that a different way -- what problem does a hash map actually solve?"},
    ]
    assert validate_topic_question_set(seq) == []


def test_two_followups_on_same_concept_is_allowed_then_moves_on():
    seq = [
        _GOOD_SEQUENCE[0],
        {"type": "followup", "targets_concept": "hash_map", "is_followup_on": "hash_map",
         "text": "Say that a different way -- what problem does a hash map actually solve?"},
        {"type": "followup", "targets_concept": "hash_map", "is_followup_on": "hash_map",
         "text": "Put it simply -- why would you reach for one over a plain list?"},
        _GOOD_SEQUENCE[1],
    ]
    assert validate_topic_question_set(seq) == []


def test_three_consecutive_followups_on_same_concept_fails():
    seq = [
        _GOOD_SEQUENCE[0],
        {"type": "followup", "targets_concept": "hash_map", "is_followup_on": "hash_map",
         "text": "Say that a different way -- what problem does a hash map actually solve?"},
        {"type": "followup", "targets_concept": "hash_map", "is_followup_on": "hash_map",
         "text": "Put it simply -- why would you reach for one over a plain list?"},
        {"type": "followup", "targets_concept": "hash_map", "is_followup_on": "hash_map",
         "text": "One more angle -- what does it actually store internally?"},
    ]
    violations = validate_topic_question_set(seq)
    assert any("more than 2 back-to-back follow-ups" in v for v in violations)


def test_followup_missing_is_followup_on_fails():
    seq = [
        _GOOD_SEQUENCE[0],
        {"type": "followup", "targets_concept": "hash_map", "is_followup_on": None,
         "text": "Say that a different way -- what problem does a hash map actually solve?"},
    ]
    violations = validate_topic_question_set(seq)
    assert any("is_followup_on is empty" in v for v in violations)


def test_followup_targeting_a_different_concept_than_the_gap_fails():
    seq = [
        _GOOD_SEQUENCE[0],
        {"type": "followup", "targets_concept": "hash_collision", "is_followup_on": "hash_collision",
         "text": "How would you resolve two keys landing in the same bucket?"},
    ]
    violations = validate_topic_question_set(seq)
    assert any("expected same concept" in v for v in violations)


def test_repeating_an_already_tested_concept_fails():
    seq = [
        _GOOD_SEQUENCE[0],
        _GOOD_SEQUENCE[1],
        {"type": "definition", "targets_concept": "hash_map", "is_followup_on": None,
         "text": "What is a hash map used for, broadly speaking?"},
    ]
    violations = validate_topic_question_set(seq)
    assert any("already tested earlier" in v for v in violations)


def test_compound_question_before_question_mark_fails():
    seq = [dict(_GOOD_SEQUENCE[0], text="What is a hash map and how does it resolve collisions?")]
    violations = validate_topic_question_set(seq)
    assert any("compound" in v for v in violations)


def test_over_25_words_is_soft_flagged():
    seq = [dict(_GOOD_SEQUENCE[0], text=(
        "Could you walk me through, in as much careful and thorough detail as "
        "you can manage, exactly what a hash map fundamentally is at its core?"
    ))]
    violations = validate_topic_question_set(seq)
    assert any("word_count" in v for v in violations)


def test_interviewer_filler_in_question_text_fails():
    seq = [dict(_GOOD_SEQUENCE[0], text="Got it, so what actually is a hash map?")]
    violations = validate_topic_question_set(seq)
    assert any("filler" in v for v in violations)


def test_zero_question_marks_fails():
    seq = [dict(_GOOD_SEQUENCE[0], text="Tell me what a hash map is.")]
    violations = validate_topic_question_set(seq)
    assert any("question_mark_count=0" in v for v in violations)


def test_invalid_question_type_fails():
    seq = [dict(_GOOD_SEQUENCE[0], type="fundamentals")]
    violations = validate_topic_question_set(seq)
    assert any("invalid question type" in v for v in violations)


def test_repeated_opener_on_consecutive_questions_fails():
    seq = [
        {"type": "definition", "targets_concept": "hash_map", "is_followup_on": None,
         "text": "How does a hash map store its entries internally?"},
        {"type": "mechanism", "targets_concept": "hash_collision", "is_followup_on": None,
         "text": "How does a hash map resolve two keys landing in the same bucket?"},
    ]
    violations = validate_topic_question_set(seq)
    assert any("repeats the immediately preceding question's opener" in v for v in violations)


# ---------------------------------------------------------------------------
# Part B: get_probe_context's "cleared" tier short-circuit + cross-cutting note
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("cleared_signal", [
    "definition_correct", "mechanism_correct", "distinction_clear", "application_grounded",
])
def test_cleared_signals_short_circuit_to_no_follow_up(cleared_signal):
    out = get_probe_context(
        signal=cleared_signal, signal_reason=None, band="mid",
        topic_follow_ups=1, topic_denied=False, prev_answer="a correct answer",
        ladder_rung="definition",
    )
    assert "NO_FOLLOW_UP_NEEDED" in out
    assert cleared_signal in out


def test_gap_signal_does_not_short_circuit():
    out = get_probe_context(
        signal="mechanism_shallow", signal_reason="it just makes things faster", band="mid",
        topic_follow_ups=1, topic_denied=False, prev_answer="it just makes things faster",
        ladder_rung="mechanism",
    )
    assert "NO_FOLLOW_UP_NEEDED" not in out
    assert "MECHANISM DEEP-DIVE" in out


def test_cross_cutting_signal_note_included_alongside_stage_signal():
    out = get_probe_context(
        signal="definition_partial", signal_reason=None, band="mid",
        topic_follow_ups=1, topic_denied=False, prev_answer="um, it's kind of like...",
        ladder_rung="definition", cross_cutting_signal="verbal_disfluency",
    )
    assert "CROSS-CUTTING SIGNAL: verbal_disfluency" in out
    assert "Delivery was rambly" in out


def test_denial_tier_stage_signal_triggers_step_down_override():
    out = get_probe_context(
        signal="distinction_absent", signal_reason=None, band="mid",
        topic_follow_ups=2, topic_denied=False, prev_answer="I don't know.",
        ladder_rung="difference",
    )
    assert "ACKNOWLEDGEMENT + STEP-DOWN" in out
    assert "distinction_absent" in out


def test_active_wrongness_signal_gets_misconception_surface_directive():
    out = get_probe_context(
        signal="distinction_reversed", signal_reason="a set preserves insertion order", band="mid",
        topic_follow_ups=2, topic_denied=False,
        prev_answer="A set preserves insertion order and allows duplicates, a list doesn't.",
        ladder_rung="difference",
    )
    assert "MISCONCEPTION SURFACE" in out
    assert "Do NOT state the correction" in out or "Do NOT correct them" in out


def test_gap_signal_directive_stays_on_the_same_concept_not_a_new_subtopic():
    """Regression guard for the eval-recovery ticket's Step 4: a thread
    start()/run() answer that showed a gap must produce a directive that
    stays anchored to start()/run(), not one that reads as a generic
    "ask about something else" pivot (e.g. the ticket's reported
    synchronization-question drift). The directive text must reference
    tracing/opening up THIS mechanism, never suggest a different sub-concept."""
    out = get_probe_context(
        signal="mechanism_shallow",
        signal_reason="calling run() directly doesn't start a new thread",
        band="mid",
        topic_follow_ups=1, topic_denied=False,
        prev_answer="You call start() and that runs the thread, run() just runs it I guess.",
        prev_question="What's the difference between calling start() and calling run() on a Thread?",
        ladder_rung="mechanism",
    )
    assert "NO_FOLLOW_UP_NEEDED" not in out
    # Must instruct tracing/opening the SAME mechanism, never introduce a new topic.
    assert "open the box" in out.lower() or "trace" in out.lower() or "step by step" in out.lower()
    assert "synchronization" not in out.lower()


# ---------------------------------------------------------------------------
# Part D: scoring calibration via evaluate_answer(), scoring/signal calls mocked
# ---------------------------------------------------------------------------
class _FakeClient:
    """Placeholder passed to evaluate_answer -- never actually used since
    _call_scoring/_call_signal_classification are monkeypatched below."""
    pass


def _mock_calls(monkeypatch, *, scoring: dict, signal: str, cross_cutting: str | None = None, reason: str | None = None):
    async def _fake_call_scoring(**kwargs):
        return scoring, {"model": "x", "inputTokens": 1, "outputTokens": 1, "cachedInputTokens": 0}

    async def _fake_call_signal_classification(**kwargs):
        return signal, cross_cutting, reason, {"model": "x", "inputTokens": 1, "outputTokens": 1, "cachedInputTokens": 0}

    monkeypatch.setattr(scoring_mod, "_call_scoring", _fake_call_scoring)
    monkeypatch.setattr(scoring_mod, "_call_signal_classification", _fake_call_signal_classification)


@pytest.mark.asyncio
async def test_distinction_reversed_scores_below_a_flat_denial(monkeypatch):
    """Part D.3: a confidently wrong (reversed) answer must score LOWER than a
    flat 'I don't know' on the same question -- active wrongness is worse than
    a non-attempt."""
    _mock_calls(
        monkeypatch,
        scoring={"answers_question": True, "clarity": 7.0, "depth": 6.0, "specificity": 6.0, "grounding": 6.0, "reason": "confident but backwards"},
        signal="distinction_reversed",
    )
    reversed_result = await scoring_mod.evaluate_answer(
        candidate_answer="A set preserves insertion order and allows duplicates, a list doesn't.",
        last_question="What's the difference between a list and a set?",
        topic_follow_up_count=1,
        transcript_lines=[],
        client=_FakeClient(),
        llm_model="gpt-4.1-mini",
        active_stage="difference",
    )
    # A flat denial scores a hard 0 across the board.
    denial_result = await scoring_mod.evaluate_answer(
        candidate_answer="",
        last_question="What's the difference between a list and a set?",
        topic_follow_up_count=1,
        transcript_lines=[],
        client=_FakeClient(),
        llm_model="gpt-4.1-mini",
        active_stage="difference",
    )
    assert reversed_result["signal"] == "distinction_reversed"
    assert denial_result["signal"] == "distinction_absent"
    # Part D.3 requirement: distinction_reversed must be measurably penalized
    # below what the raw scoring call returned (7.0/6.0/6.0/6.0 -> 6.4 unpenalized).
    _raw_overall = 7.0 * 0.20 + 6.0 * 0.35 + 6.0 * 0.20 + 6.0 * 0.25  # == 6.30
    assert reversed_result["overall"] < _raw_overall


@pytest.mark.asyncio
async def test_self_correction_recovery_boosts_score_above_the_raw_scoring_call(monkeypatch):
    """Part D.2: self_correction_recovery should raise sat relative to where it
    would have landed on the fumble alone."""
    _mock_calls(
        monkeypatch,
        scoring={"answers_question": True, "clarity": 5.0, "depth": 5.0, "specificity": 5.0, "grounding": 5.0, "reason": "caught own mistake"},
        signal="definition_correct",
        cross_cutting="self_correction_recovery",
    )
    result = await scoring_mod.evaluate_answer(
        candidate_answer="It's sorted by-- wait, no, it's actually unordered, sorry, it's a hash map so no ordering.",
        last_question="What is a hash map?",
        topic_follow_up_count=1,
        transcript_lines=[],
        client=_FakeClient(),
        llm_model="gpt-4.1-mini",
        active_stage="definition",
    )
    _raw_overall = 5.0 * 0.20 + 5.0 * 0.35 + 5.0 * 0.20 + 5.0 * 0.25  # == 5.0
    assert result["cross_cutting_signal"] == "self_correction_recovery"
    assert result["overall"] > _raw_overall


@pytest.mark.asyncio
async def test_verbal_disfluency_does_not_suppress_a_correct_answer(monkeypatch):
    """Part D.1: verbal_disfluency alongside a correct stage signal must not
    drag the score down -- disfluency is delivery, not substance."""
    _mock_calls(
        monkeypatch,
        scoring={"answers_question": True, "clarity": 8.0, "depth": 8.0, "specificity": 7.0, "grounding": 7.0, "reason": "rambling but correct"},
        signal="mechanism_correct",
        cross_cutting="verbal_disfluency",
    )
    result = await scoring_mod.evaluate_answer(
        candidate_answer="um, so, like, it basically, um, hashes the key and then, uh, mods it into a bucket index",
        last_question="How does a hash map find the right bucket?",
        topic_follow_up_count=1,
        transcript_lines=[],
        client=_FakeClient(),
        llm_model="gpt-4.1-mini",
        active_stage="mechanism",
    )
    assert result["overall"] >= 7.0  # not suppressed toward zero just because cross-cutting fired


@pytest.mark.asyncio
async def test_spoken_denial_is_zeroed_even_if_the_scoring_call_returns_a_nonzero_guess(monkeypatch):
    """Regression guard for the eval-recovery ticket's Step 1: a real (non-empty)
    'I don't know' must be tagged pure_denial/*_absent and forced to a hard 0,
    never left at whatever partial-credit number the scoring call guessed --
    a flat denial and a real (if incomplete) attempt must never land on the
    same signal or the same nonzero score."""
    _mock_calls(
        monkeypatch,
        # _call_scoring has no denial-awareness of its own -- it might still
        # hand back a nonzero guess for a short answer. Denial detection from
        # the SIGNAL call must win regardless.
        scoring={"answers_question": True, "clarity": 3.0, "depth": 2.0, "specificity": 2.0, "grounding": 2.0, "reason": "no real content"},
        signal="definition_absent",
        cross_cutting="pure_denial",
    )
    result = await scoring_mod.evaluate_answer(
        candidate_answer="I don't know, no idea.",
        last_question="What is a checked exception?",
        topic_follow_up_count=0,
        transcript_lines=[],
        client=_FakeClient(),
        llm_model="gpt-4.1-mini",
        active_stage="definition",
    )
    assert result["signal"] == "definition_absent"
    assert result["signal"] != "definition_partial"
    assert result["overall"] == 0.0


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
