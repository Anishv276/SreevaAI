"""
Replicates the pre-ladder architecture's saturation-percentage MOVE_ON rule
per the user's explicit spec (session follow-up after a live test interview):

  turn 3: sat < 50% of threshold -> MOVE_ON now.
  turn 3: sat >= 50%             -> one more probe (turn 4).
  turn 4: sat < 80% of threshold -> one more probe (turn 5, final).
  turn 5: MOVE_ON regardless of sat -- hard cap, no more probes after this.

TopicState.is_weak_candidate_exit() (interview/tech/eval.py) implements this.
Note this is a SEPARATE gate from the ladder-completeness floor
(is_ladder_complete()) -- in the real decision block (run_eval_and_build_directive),
"not ladder complete" is checked BEFORE weak_exit, so a candidate who is still
mid-ladder keeps probing even past turn 3/4 as long as the ladder itself isn't
done; these unit tests exercise is_weak_candidate_exit() directly/in isolation,
matching how test_ladder_and_denial.py and test_conceptual_gate_and_rotation.py
already test TopicState pieces standalone.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from interview.tech.eval import TopicState


def _ts(level: int = 2) -> TopicState:
    return TopicState("Some Topic", level=level)


def test_below_3_turns_never_forces_exit_regardless_of_score():
    ts = _ts()
    ts.add_contribution(weighted=0.0, signal="definition_absent", turn=1)
    ts.add_contribution(weighted=0.0, signal="mechanism_absent", turn=2)
    assert ts.follow_up_turns == 2
    assert not ts.is_weak_candidate_exit()


def test_turn_3_below_50_pct_forces_exit():
    ts = _ts()
    # Threshold for HIGH/level 2 is 5.5 (see _LEVEL_SATURATION) -- 3 weak answers
    # keep saturation well under 50% (2.75).
    ts.add_contribution(weighted=0.0, signal="definition_absent", turn=1)
    ts.add_contribution(weighted=1.0, signal="mechanism_shallow", turn=2)
    ts.add_contribution(weighted=1.0, signal="distinction_one_sided", turn=3)
    assert ts.follow_up_turns == 3
    sat_pct = ts.saturation_score / ts.saturation_threshold
    assert sat_pct < 0.50, sat_pct
    assert ts.is_weak_candidate_exit()


def test_turn_3_at_or_above_50_pct_gets_one_more_probe():
    ts = _ts()
    ts.add_contribution(weighted=8.0, signal="definition_correct", turn=1)
    ts.add_contribution(weighted=8.0, signal="mechanism_correct", turn=2)
    ts.add_contribution(weighted=6.0, signal="distinction_one_sided", turn=3)
    assert ts.follow_up_turns == 3
    sat_pct = ts.saturation_score / ts.saturation_threshold
    assert sat_pct >= 0.50, sat_pct
    assert not ts.is_weak_candidate_exit()


def test_turn_4_below_80_pct_gets_exactly_one_more_probe():
    ts = _ts()
    ts.add_contribution(weighted=4.0, signal="definition_correct", turn=1)
    ts.add_contribution(weighted=3.0, signal="mechanism_shallow", turn=2)
    ts.add_contribution(weighted=2.5, signal="distinction_one_sided", turn=3)
    sat_pct_t3 = ts.saturation_score / ts.saturation_threshold
    assert sat_pct_t3 >= 0.50  # cleared turn 3's floor
    ts.add_contribution(weighted=0.0, signal="application_absent", turn=4)
    assert ts.follow_up_turns == 4
    sat_pct_t4 = ts.saturation_score / ts.saturation_threshold
    assert sat_pct_t4 < 0.80, sat_pct_t4
    # Below 80% at turn 4 -- must get exactly one more probe (turn 5), not exit yet.
    assert not ts.is_weak_candidate_exit()


def test_turn_4_at_or_above_80_pct_exits_now_instead_of_forcing_a_5th_question():
    """A candidate who has already cleared 80% by turn 4 has clearly shown
    competence -- exit now rather than mechanically burning a 5th question
    just to fill the slot. The user's rule ('below 80% at turn 4 -> one
    more probe') is a one-way gate: it grants an extra turn when needed, it
    does not also force one when the candidate has already done well."""
    ts = _ts()
    ts.add_contribution(weighted=9.0, signal="definition_correct", turn=1)
    ts.add_contribution(weighted=9.0, signal="mechanism_correct", turn=2)
    ts.add_contribution(weighted=9.0, signal="distinction_clear", turn=3)
    ts.add_contribution(weighted=8.0, signal="application_grounded", turn=4)
    sat_pct = ts.saturation_score / ts.saturation_threshold
    assert sat_pct >= 0.80, sat_pct
    assert ts.is_weak_candidate_exit()


def test_turn_5_always_forces_exit_regardless_of_score():
    """Hard cap: one final question was already spent getting to turn 5 --
    MOVE_ON fires here even if the candidate is doing reasonably well,
    matching the user's 'one final question' framing."""
    ts = _ts()
    ts.add_contribution(weighted=8.0, signal="definition_correct", turn=1)
    ts.add_contribution(weighted=8.0, signal="mechanism_correct", turn=2)
    ts.add_contribution(weighted=8.0, signal="distinction_clear", turn=3)
    ts.add_contribution(weighted=8.0, signal="application_grounded", turn=4)
    ts.add_contribution(weighted=8.0, signal="definition_correct", turn=5)
    assert ts.follow_up_turns == 5
    assert ts.is_weak_candidate_exit()


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-v"]))
