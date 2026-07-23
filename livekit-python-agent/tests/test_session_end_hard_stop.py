"""
Step 5 regression test (eval-recovery ticket): session_ended must actually
halt all further question generation. InterviewAgent.llm_node (agent_runtime.py)
previously had no check at all against session-termination state -- it only
gated on the eval-directive-ready event, which has nothing to do with whether
the interview has already ended. A race between LiveKit's own teardown and an
in-flight user turn could let one more question slip out after the goodbye
had already fired.

llm_node now checks self._session_end_event (wired to the same disconnect_event
that every termination path -- time_expired, finished, natural end-call,
disconnect -- sets) as the very first thing it does, before even the
eval-directive wait, and yields nothing if it's already set.

This test calls llm_node directly on a minimal stand-in object carrying only
the attribute the hard-stop check reads, so it exercises the real guard
clause without needing a full LiveKit Agent/session construction (this
codebase has no existing harness for that -- see other tests/, which all
target the pure eval/scoring/probe logic modules instead).
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import interview.agent_runtime as ar


class _BareAgentStandIn:
    """Carries only the one attribute llm_node's hard-stop check reads.
    Anything past that check (activity.llm, chat_ctx, ...) would raise on
    this stand-in -- which is exactly the point: if the guard clause stops
    firing first, this test fails with an AttributeError, not a silent pass."""
    _session_end_event: asyncio.Event | None = None


@pytest.mark.asyncio
async def test_llm_node_yields_nothing_once_session_end_event_is_set():
    agent = _BareAgentStandIn()
    agent._session_end_event = asyncio.Event()
    agent._session_end_event.set()

    chunks = []
    async for chunk in ar.InterviewAgent.llm_node(agent, chat_ctx=None, tools=None, model_settings=None):
        chunks.append(chunk)

    assert chunks == []


@pytest.mark.asyncio
async def test_llm_node_proceeds_past_the_guard_when_session_end_event_not_set():
    """Regression guard the other direction: the hard stop must only fire
    when the event is actually set -- a normal in-progress turn must still
    reach past this check (and hit the next real line, which needs
    activity.llm on the stand-in and will raise AttributeError -- proving
    the guard clause let it through instead of vacuously returning)."""
    agent = _BareAgentStandIn()
    agent._session_end_event = asyncio.Event()  # created, but never .set()

    with pytest.raises(AttributeError):
        async for _ in ar.InterviewAgent.llm_node(agent, chat_ctx=None, tools=None, model_settings=None):
            pass


@pytest.mark.asyncio
async def test_llm_node_proceeds_past_the_guard_when_no_session_end_event_wired():
    """If _session_end_event was never wired up (None), the guard must not
    block -- it should behave as if no session-end signal exists yet."""
    agent = _BareAgentStandIn()
    agent._session_end_event = None

    with pytest.raises(AttributeError):
        async for _ in ar.InterviewAgent.llm_node(agent, chat_ctx=None, tools=None, model_settings=None):
            pass


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
