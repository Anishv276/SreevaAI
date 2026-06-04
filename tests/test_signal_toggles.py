"""
Python-side verification of the proctoring-signal always-on contract.

Mirrors scripts/verify-proctoring-signals.ts. Ensures:

  1. ALWAYS_ON_PROCTORING_SIGNALS contains the expected 8 behavioral signals.
  2. is_always_on_signal() classifies correctly.
  3. _is_signal_enabled() in turn_evaluator forces always-on signals to True
     regardless of input toggles, and honors togglable signals.
  4. _is_toggle_enabled() in trust_engine does the same.
  5. _extract_evaluation_signal_toggles() in agent_runtime force-sets all
     always-on signals to True even when the input JSON tries to disable them.

Run:  python3 -m pytest tests/test_signal_toggles.py -v
"""
from __future__ import annotations

import json

import pytest

from interview.session_state import (
    ALWAYS_ON_PROCTORING_SIGNALS,
    is_always_on_signal,
)
from interview.turn_evaluator import _is_signal_enabled
from interview.trust_engine import _is_toggle_enabled

# The 8 signals that must fire regardless of org toggle state.
EXPECTED_ALWAYS_ON = {
    "ownership_ambiguity",
    "ownership_clarified",
    "resume_claim_mismatch",
    "example_evasion",
    "example_given",
    "strong_under_pressure",
    "follow_up_collapse",
    "depth_decay",
}

# Togglable signals that the Python layer can suppress when the org's JSON
# explicitly sets them to false. (Browser/device/face signals are handled
# entirely on the TS side and don't appear in the Python toggle map.)
PYTHON_TOGGLABLE = {"latency_mismatch", "complexity_latency_mismatch"}


# ---------------------------------------------------------------------------
# Structural sanity
# ---------------------------------------------------------------------------

class TestStructuralSanity:
    def test_always_on_set_has_exactly_8_signals(self):
        assert len(ALWAYS_ON_PROCTORING_SIGNALS) == 8

    def test_always_on_set_matches_expected(self):
        assert set(ALWAYS_ON_PROCTORING_SIGNALS) == EXPECTED_ALWAYS_ON

    def test_always_on_is_frozenset(self):
        """frozenset prevents accidental mutation at runtime."""
        assert isinstance(ALWAYS_ON_PROCTORING_SIGNALS, frozenset)


# ---------------------------------------------------------------------------
# is_always_on_signal classifier
# ---------------------------------------------------------------------------

class TestIsAlwaysOnSignal:
    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_returns_true_for_always_on(self, signal):
        assert is_always_on_signal(signal) is True

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_returns_false_for_togglable(self, signal):
        assert is_always_on_signal(signal) is False

    def test_returns_false_for_unknown_signal(self):
        assert is_always_on_signal("nonexistent_signal") is False

    def test_returns_false_for_empty_string(self):
        assert is_always_on_signal("") is False


# ---------------------------------------------------------------------------
# turn_evaluator._is_signal_enabled
# ---------------------------------------------------------------------------

class TestIsSignalEnabled:
    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_ignores_false_toggle(self, signal):
        """Even when the org JSON explicitly says false, always-on signals fire."""
        hostile_toggles = {s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}
        assert _is_signal_enabled(hostile_toggles, signal) is True

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_ignores_empty_toggles(self, signal):
        assert _is_signal_enabled({}, signal) is True
        assert _is_signal_enabled(None, signal) is True

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_ignores_string_false(self, signal):
        """Coercion-aware: even string "false" or 0 in the JSON cannot suppress."""
        hostile_toggles = {s: "false" for s in EXPECTED_ALWAYS_ON}
        assert _is_signal_enabled(hostile_toggles, signal) is True

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_togglable_honors_false(self, signal):
        toggles = {s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}
        assert _is_signal_enabled(toggles, signal) is False

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_togglable_honors_true(self, signal):
        toggles = {s: True for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}
        assert _is_signal_enabled(toggles, signal) is True

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_togglable_defaults_true_when_missing(self, signal):
        """When a togglable signal isn't in the toggle dict, default to enabled."""
        assert _is_signal_enabled({}, signal) is True
        assert _is_signal_enabled(None, signal) is True

    def test_unknown_signal_defaults_true(self):
        """Unmanaged signals are NOT silently dropped -- they default to enabled."""
        assert _is_signal_enabled({"latency_mismatch": False}, "some_legacy_signal") is True


# ---------------------------------------------------------------------------
# trust_engine._is_toggle_enabled
# ---------------------------------------------------------------------------

class TestIsToggleEnabled:
    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_ignores_false_toggle(self, signal):
        hostile_toggles = {s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}
        assert _is_toggle_enabled(hostile_toggles, signal) is True

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_ignores_empty_toggles(self, signal):
        assert _is_toggle_enabled({}, signal) is True
        assert _is_toggle_enabled(None, signal) is True

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_togglable_honors_false(self, signal):
        toggles = {s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}
        assert _is_toggle_enabled(toggles, signal) is False

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_togglable_honors_true(self, signal):
        toggles = {s: True for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}
        assert _is_toggle_enabled(toggles, signal) is True

    def test_togglable_honors_string_false(self):
        """trust_engine has explicit string-false coercion."""
        assert _is_toggle_enabled({"latency_mismatch": "false"}, "latency_mismatch") is False
        assert _is_toggle_enabled({"latency_mismatch": "off"}, "latency_mismatch") is False
        assert _is_toggle_enabled({"latency_mismatch": "no"}, "latency_mismatch") is False

    def test_togglable_honors_numeric_zero(self):
        assert _is_toggle_enabled({"latency_mismatch": 0}, "latency_mismatch") is False
        assert _is_toggle_enabled({"latency_mismatch": 1}, "latency_mismatch") is True


# ---------------------------------------------------------------------------
# agent_runtime._extract_evaluation_signal_toggles  write-path override
# ---------------------------------------------------------------------------

class TestExtractEvaluationSignalToggles:
    """
    _extract_evaluation_signal_toggles is the Python entry point that reads
    the org's stored proctoringSignals JSON. After this function returns, the
    8 always-on signals must be True regardless of input.
    """

    def _extract(self, raw):
        # Import here to avoid loading the heavy agent_runtime module unless
        # this test class actually runs (it pulls in livekit, openai, etc.).
        # If those modules aren't installed in the test env, we skip cleanly.
        try:
            from interview.agent_runtime import _extract_evaluation_signal_toggles
        except ImportError as e:
            pytest.skip(f"agent_runtime not importable in this env: {e}")
        return _extract_evaluation_signal_toggles(raw)

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_forced_true_when_input_says_false_dict(self, signal):
        hostile_input = {s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}
        result = self._extract(hostile_input)
        assert result[signal] is True

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_forced_true_when_input_says_false_json_string(self, signal):
        hostile_json = json.dumps({s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE})
        result = self._extract(hostile_json)
        assert result[signal] is True

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_forced_true_when_input_omits_them(self, signal):
        # Stale row missing every always-on key.
        result = self._extract({"latency_mismatch": True})
        assert result[signal] is True

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_forced_true_when_input_is_none(self, signal):
        result = self._extract(None)
        assert result[signal] is True

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_forced_true_when_input_is_garbage(self, signal):
        # Non-dict, non-JSON input.
        result = self._extract("not a json object")
        assert result[signal] is True

    def test_togglable_preserved_when_input_says_false(self):
        hostile_input = {s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}
        result = self._extract(hostile_input)
        for s in PYTHON_TOGGLABLE:
            assert result[s] is False

    def test_togglable_preserved_when_input_says_true(self):
        input_dict = {s: True for s in PYTHON_TOGGLABLE}
        result = self._extract(input_dict)
        for s in PYTHON_TOGGLABLE:
            assert result[s] is True


# ---------------------------------------------------------------------------
# End-to-end: hostile DB row survives the full Python pipeline
# ---------------------------------------------------------------------------

class TestEndToEnd:
    def test_hostile_db_row_cannot_disable_always_on(self):
        """
        Simulate the worst case: a DB row where every always-on signal has
        been manually set to false via raw SQL. The Python read+gate pipeline
        must still treat all 8 as enabled.
        """
        try:
            from interview.agent_runtime import _extract_evaluation_signal_toggles
        except ImportError as e:
            pytest.skip(f"agent_runtime not importable in this env: {e}")

        hostile_db_value = {s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}

        # Step 1: read+normalize.
        toggles = _extract_evaluation_signal_toggles(hostile_db_value)

        # Step 2: every gating function honors always-on regardless of toggles.
        for signal in EXPECTED_ALWAYS_ON:
            assert _is_signal_enabled(toggles, signal) is True, (
                f"turn_evaluator suppressed always-on signal {signal}"
            )
            assert _is_toggle_enabled(toggles, signal) is True, (
                f"trust_engine suppressed always-on signal {signal}"
            )

        # Togglable signals stay suppressed when admin disables them.
        for signal in PYTHON_TOGGLABLE:
            assert _is_signal_enabled(toggles, signal) is False
            assert _is_toggle_enabled(toggles, signal) is False
