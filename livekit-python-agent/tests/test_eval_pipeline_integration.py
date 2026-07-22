"""
Integration-level replay of the transcript's answer sequence through
run_eval_and_build_directive() (interview/tech/eval.py) -- the actual
orchestration function agent_runtime.py calls every turn.

evaluate_answer() (interview/tech/scoring.py) makes real OpenAI calls, so it is
monkeypatched here to return canned per-turn responses matching the ticket's
described sequence: a strong open, then a run of denials, then a hedge with
continuation -- asserting the real decision path (not just TopicState in
isolation) keeps the topic locked until the ladder completes or 2 denials
close it, and never re-escalates difficulty right after a denial.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import interview.tech.eval as eval_mod


def _canned(overall: float, signal: str | None, action: str = "PROBE", forced: bool = False):
    async def _fake_evaluate_answer(**kwargs):
        return {
            "clarity": overall, "depth": overall, "specificity": overall, "grounding": overall,
            "overall": overall,
            "action": action,
            "forced_action": forced,
            "signal": signal,
            "signal_reason": None,
            "reason": "canned",
            "_llm_usage": [],
        }
    return _fake_evaluate_answer


BASE_PAYLOAD = {
    "app_id": "test-app",
    "turn": 1,
    "answer": "some answer",
    "question": "some question",
    "llm_model": "gpt-4.1-mini",
    "band": "mid",
    "topic_tag": "RESUME_TOPIC",
}


@pytest.mark.asyncio
async def test_topic_stays_locked_through_a_single_denial(monkeypatch):
    """Turn 1: strong answer (fundamentals -> core_mechanics).
    Turn 2: pure_denial -- must PROBE (step down), never MOVE_ON on denial #1."""
    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(8.0, "tech_choice_unjustified"))
    payload = dict(BASE_PAYLOAD, turn=1, active_topic="NLP Embeddings", active_topic_state=None)
    result1 = await eval_mod.run_eval_and_build_directive(payload, client=None)
    assert result1["action"] == "PROBE"
    topic_state_1 = result1["saturation"]["topic_state_dict"]
    assert topic_state_1["ladder_rung"] == 1  # advanced to core_mechanics

    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(0.0, "pure_denial", action="PROBE", forced=False))
    payload2 = dict(BASE_PAYLOAD, turn=2, active_topic="NLP Embeddings", active_topic_state=topic_state_1)
    result2 = await eval_mod.run_eval_and_build_directive(payload2, client=None)
    # PROBLEM 2 fix: a single denial must NOT force a topic exit.
    assert result2["action"] == "PROBE"
    topic_state_2 = result2["saturation"]["topic_state_dict"]
    assert topic_state_2["ladder_rung"] == 0  # stepped DOWN to fundamentals
    assert topic_state_2["consecutive_denials"] == 1
    assert topic_state_2["closed_on_denials"] is False


@pytest.mark.asyncio
async def test_two_consecutive_denials_force_move_on_to_next_skill(monkeypatch):
    """Reproduces the ticket's repeated-denial pattern (4:18, 5:57, ... 10:17):
    two denials IN A ROW on the same skill must close it out (MOVE_ON), instead
    of continuing to probe with escalating difficulty."""
    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(0.0, "pure_denial", action="PROBE", forced=False))
    payload1 = dict(BASE_PAYLOAD, turn=1, active_topic="Transformer Attention", active_topic_state=None)
    result1 = await eval_mod.run_eval_and_build_directive(payload1, client=None)
    assert result1["action"] == "PROBE"
    ts1 = result1["saturation"]["topic_state_dict"]

    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(0.0, "denial_with_continuation", action="PROBE", forced=False))
    payload2 = dict(BASE_PAYLOAD, turn=2, active_topic="Transformer Attention", active_topic_state=ts1)
    result2 = await eval_mod.run_eval_and_build_directive(payload2, client=None)
    assert result2["action"] == "MOVE_ON"
    ts2 = result2["saturation"]["topic_state_dict"]
    assert ts2["closed_on_denials"] is True


@pytest.mark.asyncio
async def test_ladder_floor_blocks_move_on_even_when_saturated(monkeypatch):
    """PROBLEM 1 fix, end-to-end: saturation alone must not be enough to leave
    a skill for a different one -- the ladder floor (all 4 rungs asked, or a
    2-denial close) is now a hard gate ahead of the saturated/weak_exit/
    dry_topic checks in the decision block."""
    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(10.0, "tech_choice_unjustified"))
    ts = None
    actions = []
    for turn in range(1, 3):  # 2 strong turns -- fresher/CRITICAL saturates by turn 2
        payload = dict(BASE_PAYLOAD, turn=turn, band="fresher",
                       active_topic="Python", active_topic_state=ts)
        result = await eval_mod.run_eval_and_build_directive(payload, client=None)
        actions.append(result["action"])
        ts = result["saturation"]["topic_state_dict"]
    # Saturation would normally trigger MOVE_ON well before 4 rungs are asked --
    # the ladder floor must keep it on PROBE until all rungs are covered.
    assert all(a == "PROBE" for a in actions), actions
    assert ts["ladder_rung"] in (1, 2)  # still mid-ladder, not yet complete


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
