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
import interview.tech.scoring as scoring_mod


def _canned(overall: float, signal: str | None, action: str = "PROBE", forced: bool = False, cross_cutting: str | None = None):
    async def _fake_evaluate_answer(**kwargs):
        return {
            "clarity": overall, "depth": overall, "specificity": overall, "grounding": overall,
            "overall": overall,
            "action": action,
            "forced_action": forced,
            "signal": signal,
            "cross_cutting_signal": cross_cutting,
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
    """Turn 1: strong answer (definition -> mechanism).
    Turn 2: denial-tier signal -- must PROBE (step down), never MOVE_ON on denial #1."""
    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(8.0, "definition_correct"))
    payload = dict(BASE_PAYLOAD, turn=1, active_topic="NLP Embeddings", active_topic_state=None)
    result1 = await eval_mod.run_eval_and_build_directive(payload, client=None)
    assert result1["action"] == "PROBE"
    topic_state_1 = result1["saturation"]["topic_state_dict"]
    assert topic_state_1["ladder_rung"] == 1  # advanced to mechanism

    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(0.0, "mechanism_absent", action="PROBE", forced=False))
    payload2 = dict(BASE_PAYLOAD, turn=2, active_topic="NLP Embeddings", active_topic_state=topic_state_1)
    result2 = await eval_mod.run_eval_and_build_directive(payload2, client=None)
    # Part C.1 fix: a single denial must NOT force a topic exit.
    assert result2["action"] == "PROBE"
    topic_state_2 = result2["saturation"]["topic_state_dict"]
    assert topic_state_2["ladder_rung"] == 0  # stepped DOWN to definition
    assert topic_state_2["consecutive_denials"] == 1
    assert topic_state_2["closed_on_denials"] is False


@pytest.mark.asyncio
async def test_two_consecutive_denials_force_move_on_to_next_skill(monkeypatch):
    """Reproduces the ticket's repeated-denial pattern (4:18, 5:57, ... 10:17):
    two denials IN A ROW on the same skill must close it out (MOVE_ON,
    topic_floor_reached), instead of continuing to probe with escalating
    difficulty."""
    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(0.0, "definition_absent", action="PROBE", forced=False))
    payload1 = dict(BASE_PAYLOAD, turn=1, active_topic="Transformer Attention", active_topic_state=None)
    result1 = await eval_mod.run_eval_and_build_directive(payload1, client=None)
    assert result1["action"] == "PROBE"
    ts1 = result1["saturation"]["topic_state_dict"]

    # Turn 2's *_absent stage signal is what the REAL evaluate_answer() would have
    # resolved a bare cross-cutting pure_denial (no stage signal) to -- that
    # translation lives inside evaluate_answer itself, which this test bypasses
    # by monkeypatching it directly, so the canned payload supplies the
    # already-resolved stage signal instead.
    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(0.0, "mechanism_absent", action="PROBE", forced=False, cross_cutting="pure_denial"))
    payload2 = dict(BASE_PAYLOAD, turn=2, active_topic="Transformer Attention", active_topic_state=ts1)
    result2 = await eval_mod.run_eval_and_build_directive(payload2, client=None)
    assert result2["action"] == "MOVE_ON"
    ts2 = result2["saturation"]["topic_state_dict"]
    assert ts2["closed_on_denials"] is True


@pytest.mark.asyncio
async def test_ladder_floor_blocks_move_on_even_when_saturated(monkeypatch):
    """Part C.3/C.4 fix, end-to-end: saturation alone must not be enough to
    leave a skill for a different one -- the ladder floor (all 4 rungs asked,
    or a 2-denial close) is now a hard gate ahead of the saturated/weak_exit/
    dry_topic checks in the decision block."""
    monkeypatch.setattr(eval_mod, "evaluate_answer", _canned(10.0, "definition_correct"))
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


class _FakeClient:
    """Placeholder client -- never actually used since _call_scoring/
    _call_signal_classification are monkeypatched below, not evaluate_answer
    itself. This exercises the REAL evaluate_answer() call signature, which
    is the exact boundary the eval-recovery regression lived at."""
    pass


@pytest.mark.asyncio
async def test_real_evaluate_answer_signature_is_called_without_stale_kwargs(monkeypatch):
    """Regression test for the eval-recovery-fires-on-every-turn bug: eval.py
    used to call evaluate_answer(..., signals_already_fired=[...]) -- a kwarg
    removed from evaluate_answer's signature when it was rewritten to take
    active_stage instead (Part B staged taxonomy). That mismatch raised a
    TypeError on every single call, before evaluate_answer's own try/except
    ever ran, so its internal recovery never engaged -- eval.py's OUTER
    except caught the TypeError instead and returned the static
    "eval recovery" fallback (overall=1.3, generic reason) unconditionally,
    regardless of how good the real answer was.

    This test does NOT monkeypatch evaluate_answer itself -- only the two
    real OpenAI-facing calls inside it -- so a reintroduced stale/mismatched
    kwarg at the eval.py call site will make this test fail with the real
    TypeError instead of silently passing via a canned evaluate_answer."""
    async def _fake_call_scoring(**kwargs):
        return (
            {"answers_question": True, "clarity": 8.0, "depth": 8.0, "specificity": 7.0,
             "grounding": 7.0, "reason": "clear, correct explanation of the concept"},
            {"model": "x", "inputTokens": 1, "outputTokens": 1, "cachedInputTokens": 0},
        )

    async def _fake_call_signal_classification(**kwargs):
        return (
            "definition_correct", None, "correctly defined the core term",
            {"model": "x", "inputTokens": 1, "outputTokens": 1, "cachedInputTokens": 0},
        )

    monkeypatch.setattr(scoring_mod, "_call_scoring", _fake_call_scoring)
    monkeypatch.setattr(scoring_mod, "_call_signal_classification", _fake_call_signal_classification)

    payload = dict(
        BASE_PAYLOAD, turn=1,
        answer="A checked exception must be declared or caught at compile time, an unchecked one doesn't.",
        active_topic="Java Exceptions", active_topic_state=None,
    )
    result = await eval_mod.run_eval_and_build_directive(payload, client=_FakeClient())

    # If the stale-kwarg TypeError were still present, this would silently
    # come back as the flat eval-recovery fallback (overall=1.3, signal=
    # definition_partial, static reason) instead of the real scored result.
    assert result["signal"] == "definition_correct"
    assert "eval recovery" not in (result.get("signal_reason") or "")
    assert result["quality_record"]["overall"] > 5.0, result["quality_record"]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
