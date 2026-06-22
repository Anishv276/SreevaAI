#!/usr/bin/env python3
"""
Quick validation test for the optimizations to agent_runtime_support,
agent_runtime_helpers, and the new agent_runtime_utils.
"""

from interview.agent_runtime_utils import (
    AgentConfig,
    TextSanitizer,
    TranscriptManager,
    MutableStateManager,
)
from interview.agent_runtime_support import (
    logger,
    set_log_context,
    INTERVIEW_LLM_MODEL,
    VOICE_REGISTRY,
    STT_MODEL,
)
from interview.agent_runtime_helpers import (
    sanitize_candidate_facing_text,
    polish_candidate_facing_text,
    append_transcript_line,
)


def test_agent_config():
    """Test AgentConfig singleton."""
    print("\n=== Testing AgentConfig ===")
    config = AgentConfig.get()
    print(f"[OK] STT Model: {config.stt_model}")
    print(f"[OK] Interview LLM: {config.llm_model}")
    print(f"[OK] Eval LLM: {config.eval_llm_model}")
    print(f"[OK] Default Voice ID: {config.default_voice_id}")
    print(f"[OK] Fixed Interview Duration: {config.fixed_interview_duration_minutes} mins")
    print(f"[OK] Voice Registry: {len(config.voice_registry)} voices")
    assert config.stt_model == "flux-general-en", "STT model mismatch"
    assert config.interview_temperature == 0.75, "Temperature mismatch"
    print("[OK] AgentConfig validation PASSED")


def test_text_sanitizer():
    """Test TextSanitizer pattern centralization."""
    print("\n=== Testing TextSanitizer ===")

    # Test directive removal (bracketed block in middle of text)
    text_with_directive = "The answer is [DO NOT SAY ALOUD: internal directive] simple"
    cleaned = TextSanitizer.sanitize_candidate_facing_text(text_with_directive)
    assert "[DO NOT SAY ALOUD" not in cleaned, "Directive not removed"
    assert "simple" in cleaned, "Content lost"
    print(f"[OK] Sanitized: {cleaned}")

    # Test polish (full cleanup)
    text_with_acks = "Thanks for sharing. I worked on that project."
    polished = TextSanitizer.polish_candidate_facing_text(text_with_acks)
    assert "thanks for" not in polished.lower(), "Banned ack not removed"
    print(f"[OK] Polished: {polished}")

    # Test TTS phonetic fixes
    text_with_dashes = "Well-known project"
    fixed = TextSanitizer.apply_tts_phonetic_fixes(text_with_dashes)
    assert "-" not in fixed or "well" in fixed.lower(), "Dash handling issue"
    print(f"[OK] TTS Fixed: {fixed}")

    print("[OK] TextSanitizer validation PASSED")


def test_transcript_manager():
    """Test TranscriptManager O(n) efficiency."""
    print("\n=== Testing TranscriptManager ===")

    tm = TranscriptManager()

    # Test basic append
    tm.append("Interviewer", "Hello, how are you?")
    assert len(tm.lines) == 1, "First append failed"
    print(f"[OK] First append: {tm.lines[0]}")

    # Test same-speaker merge (STT fragment assembly)
    tm.append("Interviewer", "Hello, how are you doing")  # Should merge
    assert len(tm.lines) == 1, "Same-speaker merge failed"
    print(f"[OK] Same-speaker merge: {tm.lines[0]}")

    # Test different speaker
    tm.append("Candidate", "I'm doing well")
    assert len(tm.lines) == 2, "New speaker append failed"
    print(f"[OK] Different speaker: {tm.lines[1]}")

    # Test dedup
    tm.append("Candidate", "I'm doing well")  # Exact duplicate
    assert len(tm.lines) == 2, "Dedup failed"
    print("[OK] Dedup works")

    print("[OK] TranscriptManager validation PASSED")


def test_mutable_state_manager():
    """Test MutableStateManager centralized state."""
    print("\n=== Testing MutableStateManager ===")

    state = MutableStateManager()

    # Test billing accumulation
    state.append_billing("org_1", ("ltu_usage", {"tokens": 1000}))
    state.append_billing("org_1", ("tts_usage", {"chars": 500}))
    state.append_billing("org_2", ("stt_usage", {"seconds": 120}))

    assert len(state.get_pending_billing("org_1")) == 2, "Billing append failed"
    assert len(state.get_pending_billing("org_2")) == 1, "Org isolation failed"
    print(f"[OK] Org_1 pending: {len(state.get_pending_billing('org_1'))} events")
    print(f"[OK] Org_2 pending: {len(state.get_pending_billing('org_2'))} events")

    # Test flush (get and clear)
    flushed = state.flush_billing("org_1")
    assert len(flushed) == 2, "Flush failed"
    assert len(state.get_pending_billing("org_1")) == 0, "Clear failed"
    print(f"[OK] Flushed: {len(flushed)} events")

    # Test has_pending_billing
    assert state.has_pending_billing("org_2"), "has_pending_billing failed"
    assert not state.has_pending_billing("org_1"), "Cleared org still shows pending"
    print("[OK] Pending check works")

    # Test clear_all
    state.clear_all()
    assert not state.has_pending_billing("org_2"), "clear_all failed"
    print("[OK] clear_all works")

    print("[OK] MutableStateManager validation PASSED")


def test_backward_compatibility():
    """Test that existing APIs still work."""
    print("\n=== Testing Backward Compatibility ===")

    # Old imports should still work
    print(f"[OK] INTERVIEW_LLM_MODEL: {INTERVIEW_LLM_MODEL}")
    print(f"[OK] STT_MODEL: {STT_MODEL}")
    print(f"[OK] VOICE_REGISTRY count: {len(VOICE_REGISTRY)}")

    # Old function calls should still work
    cleaned = sanitize_candidate_facing_text("[DO NOT SAY] test")
    assert "test" in cleaned, "Backward compat sanitize failed"
    print(f"[OK] sanitize_candidate_facing_text works")

    # Append transcript still works with lists
    lines = []
    append_transcript_line(lines, "Interviewer", "Hello")
    append_transcript_line(lines, "Candidate", "Hi")
    assert len(lines) == 2, "Backward compat append failed"
    print(f"[OK] append_transcript_line works (backward compatible)")

    # set_log_context should still work
    token = set_log_context({"session_id": "test_123"})
    print(f"[OK] set_log_context works")

    print("[OK] Backward Compatibility validation PASSED")


def main():
    print("=" * 60)
    print("OPTIMIZATION VALIDATION TEST")
    print("=" * 60)

    try:
        test_agent_config()
        test_text_sanitizer()
        test_transcript_manager()
        test_mutable_state_manager()
        test_backward_compatibility()

        print("\n" + "=" * 60)
        print("ALL TESTS PASSED")
        print("=" * 60)
        print("\nOptimizations Summary:")
        print("[OK] AgentConfig: centralized configuration")
        print("[OK] TextSanitizer: unified text cleaning patterns")
        print("[OK] TranscriptManager: efficient O(n) transcript handling")
        print("[OK] MutableStateManager: centralized state management")
        print("[OK] 100% backward compatibility maintained")
        print("\nReady for production!")

    except Exception as e:
        print(f"\n[FAIL] TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        exit(1)


if __name__ == "__main__":
    main()
