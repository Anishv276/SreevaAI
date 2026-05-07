"""
Session-level Trust Engine.

Consumes TurnDecision objects, proctoring events, and contradiction outcomes
to maintain one clean interview-level trust model across the full session.

Design:
  - Three weighted buckets: intelligence_quality, behavioral_confidence, hard_integrity
  - Per-turn updates (apply_turn_decision)
  - Per-event updates (apply_proctoring_event)
  - Recovery logic when candidate rebounds
  - Trend tracking across session
  - No LLM calls - pure math on existing signals
"""
import time
from typing import Any, Optional
from session_state import TrustState, init_trust_state, INTEGRITY_BAND, QUALITY_BAND


# -- Bucket weights (must sum to 1.0) -----------------------------------------
_BUCKET_WEIGHTS = {
    "intelligence_quality": 0.45,   # answer depth, specificity, clarity, grounding
    "behavioral_confidence": 0.30,  # ownership, example quality, follow-up consistency
    "hard_integrity": 0.25,         # contradictions and proctoring events
}

# -- Per-turn delta table ------------------------------------------------------
# Positive = trust gain, negative = trust loss (applied to relevant bucket)
_TURN_DELTAS = {
    # quality-driven (-> intelligence_quality bucket)
    "deep_answer":          +0.04,   # depth score ≥ 7.5
    "specific_answer":      +0.02,   # specificity score ≥ 7.0
    "surface_answer":       -0.02,   # overall < 4.0
    "very_surface_answer":  -0.04,   # overall < 2.5

    # signal-driven (-> behavioral_confidence bucket)
    "ownership_ambiguity":  -0.05,
    "example_evasion":      -0.04,
    "follow_up_collapse":   -0.06,   # strongest behavioral penalty

    # recovery (-> behavioral_confidence bucket)
    "ownership_clarified":  +0.05,   # ownership was ambiguous, now clear on follow-up
    "example_given":        +0.04,   # was evading, gave real example on follow-up
    "strong_under_pressure":+0.05,   # depth stayed high or improved under probing

    # integrity (-> hard_integrity bucket)
    "contradiction_found":  -0.10,
    "contradiction_resolved":+0.06,

    # depth decay (-> intelligence_quality bucket)
    # Applied via SignalEvent.score_delta — these entries are documentation only.
    "depth_decay_mild":     -0.06,   # rolling window drop >= 1.5 quality points
    "depth_decay_severe":   -0.12,   # rolling window drop >= 2.5 quality points

    # complexity-latency mismatch (-> behavioral_confidence bucket)
    # Applied via SignalEvent.score_delta — documentation only.
    "complexity_latency_mismatch_fast_complex": -0.14,  # hard Q answered instantly (AI-read)
    "complexity_latency_mismatch_slow_simple":  -0.08,  # easy Q answered slowly (lookup)
}

# -- Proctoring event delta table (-> hard_integrity bucket) -------------------
_PROCTOR_DELTAS = {
    "tab_switch":          -0.03,
    "face_absent":         -0.03,
    "multiple_faces":      -0.15,
    "contradiction_detected": -0.10,
    "answer_depth_surface":-0.02,
}

# -- Trend window --------------------------------------------------------------
_TREND_WINDOW = 4   # last N turns used for trend calculation


def _is_toggle_enabled(toggles: Optional[dict[str, Any]], key: str) -> bool:
    if not toggles:
        return True
    raw_value = toggles.get(key)
    if raw_value is None:
        return True
    if isinstance(raw_value, bool):
        return raw_value
    if isinstance(raw_value, str):
        normalized = raw_value.strip().lower()
        if normalized in ("true", "1", "yes", "on"):
            return True
        if normalized in ("false", "0", "no", "off"):
            return False
    if isinstance(raw_value, (int, float)):
        return bool(raw_value)
    return True


def apply_turn_decision(
    state: TrustState,
    td: dict,
    *,
    behavioral_toggles: Optional[dict[str, Any]] = None,
) -> TrustState:
    """
    Update trust state from one TurnDecision object.
    td is the TurnDecision TypedDict from turn_decision.py.
    """
    quality = td.get("quality", {})
    signals = td.get("signals", {})
    signal_events = td.get("signal_events", [])
    action = td.get("decision", {}).get("action", "MOVE_ON")

    clarity = float(quality.get("clarity", 5.0))
    depth = float(quality.get("depth", 5.0))
    specificity = float(quality.get("specificity", 5.0))
    grounding = float(quality.get("grounding", 5.0))
    overall = (clarity + depth + specificity + grounding) / 4.0

    # Track scores for trend
    state["score_history"].append(round(overall, 2))

    # Intelligence quality bucket
    iq_delta = 0.0
    if overall >= 7.5 or depth >= 7.5:
        iq_delta += _TURN_DELTAS["deep_answer"]
    elif overall >= 6.0 and specificity >= 7.0:
        iq_delta += _TURN_DELTAS["specific_answer"]
    elif overall < 2.5:
        iq_delta += _TURN_DELTAS["very_surface_answer"]
    elif overall < 4.0:
        iq_delta += _TURN_DELTAS["surface_answer"]

    state["buckets"]["intelligence_quality"] = _clamp(
        state["buckets"]["intelligence_quality"] + iq_delta
    )

    # Apply explicit signal events from the contract.
    # This is the only path that mutates trust from signal detection.
    for event in signal_events:
        bucket_name = str(event.get("trust_bucket_affected", "") or "")
        event_delta = float(event.get("score_delta", 0.0) or 0.0)
        signal_name = str(event.get("signal_name", "") or "")
        recoverable = bool(event.get("recoverable", False))

        if bucket_name in state["buckets"]:
            state["buckets"][bucket_name] = _clamp(
                state["buckets"][bucket_name] + event_delta
            )

        if event_delta < 0:
            _add_risk(state, signal_name)
        elif recoverable:
            _add_recovery(state, f"{signal_name}_resolved")

    # Recovery: check if previous concern is now resolved
    prev_signals = state.get("_last_signals", {})
    bc_delta = 0.0
    if (
        _is_toggle_enabled(behavioral_toggles, "ownership_clarified")
        and prev_signals.get("ownership_ambiguity")
        and not signals.get("ownership_ambiguity")
        and action == "MOVE_ON"
    ):
        bc_delta += _TURN_DELTAS["ownership_clarified"]
        _add_recovery(state, "ownership_clarified")
    if (
        _is_toggle_enabled(behavioral_toggles, "example_given")
        and prev_signals.get("example_evasion")
        and not signals.get("example_evasion")
        and overall >= 6.0
    ):
        bc_delta += _TURN_DELTAS["example_given"]
        _add_recovery(state, "concrete_example_after_evasion")
    if (
        _is_toggle_enabled(behavioral_toggles, "strong_under_pressure")
        and state.get("_last_action") == "PROBE"
        and overall >= 6.5
    ):
        bc_delta += _TURN_DELTAS["strong_under_pressure"]
        _add_recovery(state, "strong_under_pressure")

    state["_last_signals"] = dict(signals)
    state["_last_action"] = action
    state["buckets"]["behavioral_confidence"] = _clamp(
        state["buckets"]["behavioral_confidence"] + bc_delta
    )

    # Contradiction flag from signals
    if _is_toggle_enabled(behavioral_toggles, "contradiction") and signals.get("contradiction"):
        state["buckets"]["hard_integrity"] = _clamp(
            state["buckets"]["hard_integrity"] + _TURN_DELTAS["contradiction_found"]
        )
        _add_risk(state, "contradiction")

    state["turn_count"] += 1
    _recompute_score(state)
    _recompute_trend(state)
    return state


def apply_proctoring_event(state: TrustState, event: dict) -> TrustState:
    """
    Update trust state from one proctoring event dict.
    event shape: {"event": str, "score_delta": int, ...}
    """
    event_name = event.get("event", "")
    delta = _PROCTOR_DELTAS.get(event_name, 0.0)

    if delta != 0.0:
        state["buckets"]["hard_integrity"] = _clamp(
            state["buckets"]["hard_integrity"] + delta
        )
        if delta < 0:
            _add_risk(state, event_name)

    _recompute_score(state)
    _recompute_trend(state)
    return state


def apply_contradiction_resolved(state: TrustState) -> TrustState:
    """
    Called when candidate convincingly resolved a flagged contradiction.
    Partial trust recovery on hard_integrity.
    """
    state["buckets"]["hard_integrity"] = _clamp(
        state["buckets"]["hard_integrity"] + _TURN_DELTAS["contradiction_resolved"]
    )
    _add_recovery(state, "contradiction_resolved")
    _recompute_score(state)
    _recompute_trend(state)
    return state


def finalize_trust_state(state: TrustState) -> TrustState:
    """
    Final pass: set bands, clamp all values, freeze trend.
    Call once at end of interview before building recruiter summary.
    """
    _recompute_score(state)
    _recompute_trend(state)
    state["integrity_band"] = _integrity_band(state["buckets"]["hard_integrity"])
    state["quality_band"] = _quality_band(state["buckets"]["intelligence_quality"])
    state["finalized"] = True
    state["finalized_at"] = time.time()
    return state


# -- Internal helpers ----------------------------------------------------------

def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _recompute_score(state: TrustState) -> None:
    buckets = state["buckets"]
    score = sum(
        buckets[k] * w for k, w in _BUCKET_WEIGHTS.items()
    )
    state["trust_score"] = round(_clamp(score), 3)


def _recompute_trend(state: TrustState) -> None:
    history = state["score_history"]
    if len(history) < 2:
        state["trend"] = "stable"
        return

    window = history[-_TREND_WINDOW:]
    if len(window) < 2:
        state["trend"] = "stable"
        return

    first_half = sum(window[:len(window)//2]) / max(len(window)//2, 1)
    second_half = sum(window[len(window)//2:]) / max(len(window) - len(window)//2, 1)
    delta = second_half - first_half

    if delta >= 0.8:
        state["trend"] = "improving"
    elif delta <= -1.5:
        state["trend"] = "collapsing"
    elif delta <= -0.5:
        state["trend"] = "declining"
    else:
        state["trend"] = "stable"


def _integrity_band(score: float) -> str:
    if score >= 0.75:
        return INTEGRITY_BAND.HIGH
    if score >= 0.5:
        return INTEGRITY_BAND.MEDIUM
    if score >= 0.3:
        return INTEGRITY_BAND.LOW
    return INTEGRITY_BAND.CRITICAL


def _quality_band(score: float) -> str:
    if score >= 0.75:
        return QUALITY_BAND.STRONG
    if score >= 0.5:
        return QUALITY_BAND.ADEQUATE
    if score >= 0.3:
        return QUALITY_BAND.WEAK
    return QUALITY_BAND.POOR


def _add_risk(state: TrustState, factor: str) -> None:
    if factor not in state["risk_factors"]:
        state["risk_factors"].append(factor)


def _add_recovery(state: TrustState, factor: str) -> None:
    if factor not in state["recovery_factors"]:
        state["recovery_factors"].append(factor)
