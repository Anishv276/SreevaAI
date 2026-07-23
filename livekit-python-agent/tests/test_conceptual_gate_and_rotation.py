"""
Tests for the Part A-D staged-taxonomy fix ticket layered on top of the
existing ladder/denial machinery (interview/tech/eval.py TopicState):

  Part C.1 FASTER EXIT ON CLEAR NON-ANSWERS -- should_exit_on_denials() (2
     consecutive denial-tier signals -- a "*_absent" stage signal or
     cross-cutting pure_denial -- -> forced MOVE_ON/topic_floor_reached,
     overriding sat score). Verified here alongside the scenario-gate/
     rotation-lock logic to confirm they don't interfere.

  Part C.3/C.4 QUESTION ORDERING: CONCEPTUAL BEFORE SCENARIO -- TopicState.LADDER
     is (definition, mechanism, difference, scenario); register_progress()
     will not advance INTO "scenario" unless can_enter_scenario() clears
     (scenario_gate_failed forces exit otherwise).

  Part C.2 PROBES STAY ON THE SAME CONCEPTUAL GAP -- register_subconcept_probe()
     holds the sub-concept rotation on a gap-tier OR active-wrongness-tier
     signal until it clears (concept_cleared) or 2 consecutive failed probes
     give up (concept_gap_repeated).

  Part D.3 distinction_reversed / definition_confused / mechanism_incorrect are
     ACTIVE WRONGNESS -- distinct from the denial tier for ladder/exit purposes
     (they still advance the rung, unlike *_absent), but hold the rotation like
     a gap signal.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from interview.tech.eval import TopicState


# ---------------------------------------------------------------------------
# Part C.3/C.4: scenario rung is gated on the conceptual average
# ---------------------------------------------------------------------------
def test_scenario_rung_never_reached_as_1st_or_2nd_question():
    """A candidate answering weakly on their very first 2 conceptual questions
    must never be handed the scenario rung as question #1 or #2 on the topic."""
    ts = TopicState("Python", "HIGH", band="mid")
    assert ts.current_rung_name() == "definition"  # never scenario as Q1
    ts.add_contribution(weighted=3.0, signal="definition_partial", turn=1)
    assert ts.current_rung_name() != "scenario"  # never scenario as Q2
    assert ts.current_rung_name() == "mechanism"


def test_weak_candidate_never_reaches_scenario_question():
    ts = TopicState("Python", "HIGH", band="mid")
    ts.add_contribution(weighted=3.0, signal="definition_partial", turn=1)   # definition: weak
    ts.add_contribution(weighted=2.5, signal="mechanism_shallow", turn=2)     # mechanism: weak
    # avg = (3.0+2.5)/2 = 2.75/10 = 27.5% < 60% threshold, after exactly 2
    # conceptual questions -- Part C.4: MOVE_ON now, scenario never asked
    # (scenario_gate_failed).
    assert ts.conceptual_avg_pct() < TopicState.CONCEPTUAL_GATE_THRESHOLD_PCT
    assert ts.should_exit_on_failed_conceptual_gate()
    assert ts.scenario_gate_blocked
    assert ts.current_rung_name() != "scenario"
    assert ts.is_ladder_complete()  # early-exit is a valid completion, not a violation


def test_strong_candidate_reaches_and_completes_scenario_rung():
    ts = TopicState("Python", "HIGH", band="mid")
    ts.add_contribution(weighted=8.0, signal="definition_correct", turn=1)  # definition: strong
    ts.add_contribution(weighted=8.0, signal="mechanism_correct", turn=2)   # mechanism: strong
    assert not ts.should_exit_on_failed_conceptual_gate()
    ts.add_contribution(weighted=8.0, signal="distinction_clear", turn=3)   # difference: strong
    assert ts.can_enter_scenario()
    assert ts.current_rung_name() == "scenario"
    assert not ts.is_ladder_complete()  # scenario rung not yet ASKED
    ts.add_contribution(weighted=8.0, signal="application_grounded", turn=4)  # scenario: strong
    assert ts.is_ladder_complete()


def test_borderline_candidate_at_exactly_threshold_may_enter_scenario():
    ts = TopicState("Python", "HIGH", band="mid")
    # avg exactly 60% (6.0/10) across 2 conceptual questions -- >= threshold, so
    # the candidate should be ALLOWED into the scenario rung, not blocked.
    ts.add_contribution(weighted=6.0, signal="definition_correct", turn=1)
    ts.add_contribution(weighted=6.0, signal="mechanism_correct", turn=2)
    assert ts.conceptual_avg_pct() == TopicState.CONCEPTUAL_GATE_THRESHOLD_PCT
    assert ts.can_enter_scenario()
    assert not ts.should_exit_on_failed_conceptual_gate()


def test_conceptual_gate_only_checked_after_at_least_2_conceptual_questions():
    ts = TopicState("Python", "HIGH", band="mid")
    ts.add_contribution(weighted=1.0, signal="definition_partial", turn=1)  # 1 weak answer only
    # Only 1 conceptual question in -- Part C.4 says "after 2-3 conceptual
    # questions", so must not exit yet off a single data point.
    assert not ts.should_exit_on_failed_conceptual_gate()


def test_conceptual_gate_defers_to_denial_cap_on_a_single_denial():
    """Part C.1 (single denial steps down, stays on topic) must win over Part
    C.4 (conceptual average gate) when the low score came from a denial, not a
    real weak attempt -- a denial must not ALSO trigger the conceptual-average
    exit before the 2-consecutive-denial cap has had a chance to apply."""
    ts = TopicState("Python", "HIGH", band="mid")
    ts.add_contribution(weighted=8.0, signal="definition_correct", turn=1)  # strong definition
    ts.add_contribution(weighted=0.0, signal="mechanism_absent", turn=2)    # single denial
    # avg = (8.0+0.0)/2 = 40% < 60% -- would normally fail the gate, but a
    # single denial must defer to should_exit_on_denials(), not force exit here.
    assert ts.consecutive_denials == 1
    assert not ts.should_exit_on_denials()  # only 1 so far -- Part C.1's own cap
    assert not ts.should_exit_on_failed_conceptual_gate()  # gate defers
    assert not ts.is_ladder_complete()


def test_two_consecutive_denials_still_exit_even_with_conceptual_gate_present():
    """Regression check (Part C.1): the 2-consecutive-denial exit must keep
    working unchanged now that the conceptual gate also exists."""
    ts = TopicState("Python", "HIGH", band="mid")
    ts.add_contribution(weighted=0.0, signal="pure_denial", turn=1)
    ts.add_contribution(weighted=0.0, signal="mechanism_absent", turn=2)
    assert ts.should_exit_on_denials()
    assert ts.closed_on_denials
    assert ts.is_ladder_complete()


def test_active_wrongness_does_not_trigger_the_conceptual_gate_as_a_denial():
    """definition_confused/mechanism_incorrect/distinction_reversed are ACTIVE
    WRONGNESS, not the denial tier -- they should feed into the conceptual
    average gate as a real (low) score, not be treated as a denial-tier
    signal that defers the gate."""
    ts = TopicState("Python", "HIGH", band="mid")
    ts.add_contribution(weighted=1.0, signal="definition_confused", turn=1)  # active wrongness
    ts.add_contribution(weighted=1.0, signal="mechanism_incorrect", turn=2)  # active wrongness
    assert ts.consecutive_denials == 0  # never treated as a denial
    assert ts.should_exit_on_failed_conceptual_gate()  # gate fires on the real low scores
    assert ts.scenario_gate_blocked


# ---------------------------------------------------------------------------
# Part C.2: sub-concept rotation holds on an unresolved gap, up to 2 probes
# ---------------------------------------------------------------------------
def test_rotation_holds_on_first_gap_signal():
    ts = TopicState("NLP", "HIGH", band="mid")
    should_rotate = ts.register_subconcept_probe("mechanism_shallow")
    assert should_rotate is False
    assert ts.consecutive_subconcept_probes == 1


def test_rotation_gives_up_after_two_consecutive_gap_signals():
    ts = TopicState("NLP", "HIGH", band="mid")
    ts.register_subconcept_probe("mechanism_shallow")
    should_rotate = ts.register_subconcept_probe("definition_partial")  # 2nd gap signal in a row
    assert should_rotate is True
    assert ts.consecutive_subconcept_probes == 0  # streak reset after giving up


def test_rotation_advances_immediately_when_concept_clears():
    ts = TopicState("NLP", "HIGH", band="mid")
    ts.register_subconcept_probe("mechanism_shallow")  # 1st gap -- hold
    should_rotate = ts.register_subconcept_probe("definition_correct")  # cleared
    assert should_rotate is True
    assert ts.consecutive_subconcept_probes == 0


def test_rotation_streak_resets_between_different_sub_concepts():
    ts = TopicState("NLP", "HIGH", band="mid")
    ts.register_subconcept_probe("mechanism_shallow")   # sub-concept A, hold
    ts.register_subconcept_probe("definition_correct")  # cleared, rotate
    # New sub-concept B starts its own fresh streak.
    should_rotate = ts.register_subconcept_probe("distinction_one_sided")
    assert should_rotate is False
    assert ts.consecutive_subconcept_probes == 1


def test_active_wrongness_also_holds_the_rotation_like_a_gap():
    """distinction_reversed (active wrongness) must hold the sub-concept
    rotation just like a gap signal -- the candidate has NOT cleared the
    concept, confidently wrong or not."""
    ts = TopicState("NLP", "HIGH", band="mid")
    should_rotate = ts.register_subconcept_probe("distinction_reversed")
    assert should_rotate is False
    assert ts.consecutive_subconcept_probes == 1


def test_two_consecutive_active_wrongness_signals_gives_up_rotation():
    ts = TopicState("NLP", "HIGH", band="mid")
    ts.register_subconcept_probe("mechanism_incorrect")
    should_rotate = ts.register_subconcept_probe("definition_confused")
    assert should_rotate is True
    assert ts.consecutive_subconcept_probes == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-v"]))
