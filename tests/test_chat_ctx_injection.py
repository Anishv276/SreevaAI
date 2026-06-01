"""Regression tests for the MOVE_ON / directive-injection context-binding bug.

ROOT CAUSE (fixed): The interview entrypoint built a local ``chat_ctx`` and passed
it to ``InterviewAgent(chat_ctx=...)``. LiveKit's ``Agent.__init__`` does
``self._chat_ctx = chat_ctx.copy(...)``, which creates a SEPARATE ChatContext with a
NEW items list. LiveKit generates every reply from ``agent._chat_ctx`` (it does
``self._agent.chat_ctx.copy()`` before calling ``llm_node``). The eval routine kept
injecting NEXT_TURN_DIRECTIVE / TOPIC_LOCK / MOVE_ON into the ORIGINAL local
``chat_ctx`` -- an orphaned object the LLM never reads. MOVE_ON decisions were computed
correctly but never reached the question the LLM asked.

These tests pin the framework invariants the fix relies on, so the regression cannot
silently return.
"""

from livekit.agents import llm
from livekit.agents.voice.agent import Agent


def _make_agent_like_entrypoint():
    """Mirror agent_runtime.entrypoint: build a local chat_ctx, hand it to Agent."""
    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(role="system", content="SYSTEM PROMPT")
    chat_ctx.add_message(role="system", content="[WARMUP PHASE]")
    agent = Agent(instructions="x", chat_ctx=chat_ctx)
    return chat_ctx, agent


def test_agent_init_copies_chat_ctx_into_separate_object():
    """Agent.__init__ must be assumed to COPY -- this is why aliasing is required.

    If LiveKit ever stopped copying, the alias in entrypoint would be redundant but
    still correct. If it keeps copying (current behavior), injecting into the original
    local object is a silent no-op. This test documents the behavior the fix depends on.
    """
    local_ctx, agent = _make_agent_like_entrypoint()
    assert agent._chat_ctx is not local_ctx, (
        "Agent kept the same ChatContext object -- aliasing still correct but harmless"
    )
    # The items list is also distinct (copy() builds a fresh list).
    assert agent._chat_ctx.items is not local_ctx.items


def test_injection_into_original_local_ctx_is_invisible_to_agent():
    """The exact bug: writing to the original local chat_ctx does NOT reach the agent."""
    local_ctx, agent = _make_agent_like_entrypoint()

    local_ctx.add_message(role="system", content="[NEXT_TURN_DIRECTIVE]\nDECISION: MOVE_ON")

    agent_has_directive = any(
        "DECISION: MOVE_ON" in str(getattr(m, "content", ""))
        for m in agent._chat_ctx.items
    )
    assert not agent_has_directive, (
        "Sanity: the original local ctx must be orphaned from agent._chat_ctx. "
        "If this fails, the framework changed and the fix's rationale needs review."
    )


def test_fix_alias_makes_injection_visible_to_agent():
    """After the fix (re-bind chat_ctx = agent._chat_ctx), injection reaches the LLM ctx."""
    local_ctx, agent = _make_agent_like_entrypoint()

    # This is the fix applied in entrypoint right after constructing the agent.
    chat_ctx = agent._chat_ctx

    chat_ctx.add_message(role="system", content="[NEXT_TURN_DIRECTIVE]\nDECISION: MOVE_ON")
    chat_ctx.add_message(role="system", content="[TOPIC_LOCK] NEW ACTIVE TOPIC: Sensex")

    contents = [str(getattr(m, "content", "")) for m in agent._chat_ctx.items]
    assert any("DECISION: MOVE_ON" in c for c in contents), (
        "MOVE_ON directive must be visible in the context LiveKit generates from"
    )
    assert any("TOPIC_LOCK" in c for c in contents)


def test_public_chat_ctx_is_read_only():
    """self.chat_ctx (public property) raises on mutation -- llm_node must use _chat_ctx.

    This is why both the MOVE_ON guard strip and the timeout-recovery injection in
    llm_node were switched from self.chat_ctx to self._chat_ctx.
    """
    _local, agent = _make_agent_like_entrypoint()
    ro = agent.chat_ctx
    import pytest

    with pytest.raises(RuntimeError):
        ro.items.append(object())  # _ImmutableList rejects append

    with pytest.raises(RuntimeError):
        ro.items[:] = []  # and slice assignment (the MOVE_ON guard pattern)


def test_moveon_guard_strip_works_on_mutable_ctx():
    """The llm_node MOVE_ON guard pattern (items[:] = system-only) works on _chat_ctx."""
    _local, agent = _make_agent_like_entrypoint()
    ctx = agent._chat_ctx
    ctx.add_message(role="system", content="[NEXT_TURN_DIRECTIVE]\nDECISION: MOVE_ON")
    ctx.add_message(role="user", content="my answer about the OLD topic")
    ctx.add_message(role="assistant", content="old topic question")

    items = ctx.items
    before = len(items)
    items[:] = [m for m in list(items) if getattr(m, "role", "") == "system"]

    assert all(getattr(m, "role", "") == "system" for m in ctx.items)
    assert len(ctx.items) < before  # user + assistant dropped
    assert any("DECISION: MOVE_ON" in str(getattr(m, "content", "")) for m in ctx.items)
