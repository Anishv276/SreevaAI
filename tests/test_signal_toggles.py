"""
Python-side verification of the proctoring-signal always-on contract.

Mirrors scripts/verify-proctoring-signals.ts. Ensures:

  1. ALWAYS_ON_PROCTORING_SIGNALS contains the expected 8 behavioral signals.
  2. is_always_on_signal() classifies correctly.
  3. _is_signal_enabled() in turn_evaluator forces always-on signals to True
     regardless of input toggles, and honors togglable signals.
  4. _is_toggle_enabled() in trust_engine does the same.
  5. _extract_evaluation_signal_toggles() in agent_runtime returns ONLY the
     9 plan-gated signal keys. Always-on signals are intentionally absent from
     the dict -- they are never toggled and the gating functions hard-override
     them to True via is_always_on_signal() before the dict is consulted.

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

# Plan-gated signals whose DB value the Python layer honors.
# behavioral: latency_mismatch, complexity_latency_mismatch
# environmental: tab_switch, camera_disabled, microphone_disabled,
#                connection_lost, face_absence, multiple_faces, identity_mismatch
PYTHON_TOGGLABLE = {
    "latency_mismatch",
    "complexity_latency_mismatch",
    "tab_switch",
    "camera_disabled",
    "microphone_disabled",
    "connection_lost",
    "face_absence",
    "multiple_faces",
    "identity_mismatch",
}


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
    _extract_evaluation_signal_toggles returns ONLY the 9 plan-gated signal
    keys. Always-on signals are intentionally absent -- they have no toggle
    and always run. The gating functions (_is_signal_enabled, _is_toggle_enabled)
    hard-override them to True via is_always_on_signal() before consulting
    the dict, so their absence here is safe and by design.
    """

    def _extract(self, raw):
        try:
            from interview.agent_runtime import _extract_evaluation_signal_toggles
        except ImportError as e:
            pytest.skip(f"agent_runtime not importable in this env: {e}")
        return _extract_evaluation_signal_toggles(raw)

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_absent_from_dict(self, signal):
        """Always-on signals must NOT be in the returned dict -- they are never toggled."""
        result = self._extract({s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE})
        assert signal not in result, (
            f"'{signal}' should be absent from the toggle dict; "
            "it is always-on and must never be suppressed via a toggle flag"
        )

    @pytest.mark.parametrize("signal", sorted(EXPECTED_ALWAYS_ON))
    def test_always_on_still_enabled_via_gating_function(self, signal):
        """Even though the key is absent, _is_signal_enabled must return True for always-on signals."""
        result = self._extract({s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE})
        assert _is_signal_enabled(result, signal) is True, (
            f"_is_signal_enabled returned False for always-on signal '{signal}'"
        )

    def test_dict_contains_exactly_plan_gated_keys(self):
        """Returned dict has exactly the 9 plan-gated keys -- no more, no less."""
        result = self._extract(None)
        assert set(result.keys()) == PYTHON_TOGGLABLE

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_plan_gated_defaults_false_when_absent(self, signal):
        """Plan-gated signals default to False when not in the DB row (new org default)."""
        result = self._extract(None)
        assert result[signal] is False

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_plan_gated_honors_false_from_db(self, signal):
        hostile_input = {s: False for s in PYTHON_TOGGLABLE}
        result = self._extract(hostile_input)
        assert result[signal] is False

    @pytest.mark.parametrize("signal", sorted(PYTHON_TOGGLABLE))
    def test_plan_gated_honors_true_from_db(self, signal):
        input_dict = {s: True for s in PYTHON_TOGGLABLE}
        result = self._extract(input_dict)
        assert result[signal] is True

    def test_plan_gated_honors_json_string_input(self):
        """DB rows come back as JSON strings in some query paths."""
        input_json = json.dumps({s: True for s in PYTHON_TOGGLABLE})
        result = self._extract(input_json)
        for s in PYTHON_TOGGLABLE:
            assert result[s] is True

    def test_garbage_input_defaults_all_plan_gated_to_false(self):
        result = self._extract("not a json object")
        for s in PYTHON_TOGGLABLE:
            assert result[s] is False


# ---------------------------------------------------------------------------
# End-to-end: hostile DB row survives the full Python pipeline
# ---------------------------------------------------------------------------

class TestEndToEnd:
    def test_hostile_db_row_cannot_disable_always_on(self):
        """
        Simulate the worst case: a DB row where every signal has been manually
        set to false via raw SQL. The Python read+gate pipeline must still
        treat all 8 always-on signals as enabled.

        Contract:
          - Always-on keys are ABSENT from the toggle dict (they have no toggle).
          - Gating functions return True for always-on signals regardless.
          - Plan-gated signals set to False in DB remain False in the dict.
        """
        try:
            from interview.agent_runtime import _extract_evaluation_signal_toggles
        except ImportError as e:
            pytest.skip(f"agent_runtime not importable in this env: {e}")

        hostile_db_value = {s: False for s in EXPECTED_ALWAYS_ON | PYTHON_TOGGLABLE}

        # Step 1: read+normalize — always-on keys are absent, plan-gated are False.
        toggles = _extract_evaluation_signal_toggles(hostile_db_value)

        assert set(toggles.keys()) == PYTHON_TOGGLABLE, (
            f"Toggle dict should contain only plan-gated keys. Got: {set(toggles.keys())}"
        )

        # Step 2: gating functions must return True for always-on signals
        # even though the keys are absent from the dict.
        for signal in EXPECTED_ALWAYS_ON:
            assert _is_signal_enabled(toggles, signal) is True, (
                f"turn_evaluator suppressed always-on signal '{signal}'"
            )
            assert _is_toggle_enabled(toggles, signal) is True, (
                f"trust_engine suppressed always-on signal '{signal}'"
            )

        # Step 3: plan-gated signals stay suppressed when admin disables them.
        for signal in PYTHON_TOGGLABLE:
            assert _is_signal_enabled(toggles, signal) is False, (
                f"turn_evaluator should suppress disabled plan-gated signal '{signal}'"
            )
            assert _is_toggle_enabled(toggles, signal) is False, (
                f"trust_engine should suppress disabled plan-gated signal '{signal}'"
            )
