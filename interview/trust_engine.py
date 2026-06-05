"""
Session-level Trust Engine.

Consumes TurnDecision objects, proctoring events, and inconsistency outcomes
to maintain one clean interview-level trust model across the full session.

Design:
  - Three weighted buckets: intelligence_quality, behavioral_confidence, hard_integrity
  - Per-turn updates (apply_turn_decision)
  - Per-event updates (apply_proctoring_event)
  - Recovery logic when candidate rebounds
  - Trend tracking across session
  - No LLM calls - pure math on existing signals

Refactor additions (all non-breaking):
  - IQRule dataclass: replaces 4-branch if/elif for intelligence_quality delta
  - RecoveryRule dataclass: replaces 3 stacked if-blocks for recovery detection
  - TrendRule dataclass: replaces if/elif chain in _recompute_trend
  - TrustEngine class: OOP encapsulation of all module-level logic
  - Module-level functions delegate to TrustEngine singleton (zero call-site changes)
  - OrderedSet for risk_factors/recovery_factors: O(1) dedup vs O(n) list scan
  - SlidingWindow for score_history: used by _recompute_trend via half_split_averages
  - LangChain chain: optional composable trust-update pipeline
  Public APIs (apply_turn_decision, apply_proctoring_event, finalize_trust_state,
  _is_toggle_enabled) all preserved with identical signatures.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

from interview.session_state import (
    TrustState,
    SlidingWindow,
    OrderedSet,
    TrendLabel,
    is_always_on_signal,
    INTEGRITY_BAND,
    QUALITY_BAND,
)

# LangChain -- optional; graceful fallback if not installed
try:
    from langchain_core.runnables import RunnableLambda
    _LANGCHAIN_AVAILABLE = True
except ImportError:  # pragma: no cover
    _LANGCHAIN_AVAILABLE = False


# ---------------------------------------------------------------------------
# Bucket weights (must sum to 1.0) -- unchanged
# ---------------------------------------------------------------------------
_BUCKET_WEIGHTS = {
    "intelligence_quality": 0.45,   # answer depth, specificity, clarity, grounding
    "behavioral_confidence": 0.30,  # ownership, example quality, follow-up consistency
    "hard_integrity": 0.25,         # inconsistencies and proctoring events
}

# ---------------------------------------------------------------------------
# Per-turn delta table -- unchanged values
# ---------------------------------------------------------------------------
_TURN_DELTAS = {
    # quality-driven (-> intelligence_quality bucket)
    "deep_answer":          +0.04,
    "specific_answer":      +0.02,
    "surface_answer":       -0.02,
    "very_surface_answer":  -0.04,
    # signal-driven (-> behavioral_confidence bucket)
    "ownership_ambiguity":  -0.05,
    "example_evasion":      -0.04,
    "follow_up_collapse":   -0.06,
    # recovery (-> behavioral_confidence bucket)
    "ownership_clarified":  +0.05,
    "example_given":        +0.04,
    "strong_under_pressure":+0.05,
    # depth decay (-> intelligence_quality bucket) -- documentation only
    "depth_decay_mild":     -0.06,
    "depth_decay_severe":   -0.12,
    # complexity-latency mismatch (-> behavioral_confidence) -- documentation only
    "complexity_latency_mismatch_fast_complex": -0.14,
    "complexity_latency_mismatch_slow_simple":  -0.08,
}

# ---------------------------------------------------------------------------
# Proctoring event delta table (-> hard_integrity bucket) -- unchanged
# ---------------------------------------------------------------------------
_PROCTOR_DELTAS = {
    "tab_switch":          -0.03,
    "face_absence":        -0.03,
    "multiple_faces":      -0.15,
    "answer_depth_surface":-0.02,
}

# Trend window
_TREND_WINDOW = 4


# ===========================================================================
# DSA: IQRule -- replaces 4-branch if/elif for intelligence_quality delta
# ===========================================================================

@dataclass(frozen=True)
class IQRule:
    """One intelligence-quality scoring rule. First match wins.

    condition(overall, depth, specificity) -> bool
    key: key into _TURN_DELTAS for the delta to apply
    """
    key: str
    condition: Callable[[float, float, float], bool]

    def matches(self, overall: float, depth: float, specificity: float) -> bool:
        return self.condition(overall, depth, specificity)

    def delta(self) -> float:
        return _TURN_DELTAS[self.key]


# Ordered list -- first rule that matches is applied (mirrors original if/elif order)
_IQ_RULES: tuple[IQRule, ...] = (
    IQRule(key="deep_answer",        condition=lambda o, d, s: o >= 7.5 or d >= 7.5),
    IQRule(key="specific_answer",    condition=lambda o, d, s: o >= 6.0 and s >= 7.0),
    IQRule(key="very_surface_answer",condition=lambda o, d, s: o < 2.5),
    IQRule(key="surface_answer",     condition=lambda o, d, s: o < 4.0),
)


# ===========================================================================
# DSA: RecoveryRule -- replaces 3 stacked if-blocks for bc_delta
# ===========================================================================

@dataclass(frozen=True)
class RecoveryRule:
    """One recovery detection rule.

    Each rule encodes: which toggle must be on, what previous signal must have
    been set, what condition must hold now, and what delta + label to apply.
    Replaces the 3 stacked `if (_is_toggle_enabled(...) and ...)` blocks.
    """
    toggle_key: str
    delta_key: str
    recovery_label: str
    # Conditions checked at apply time
    prev_signal: str = ""           # prev_signals must have this key = True
    curr_signal_absent: str = ""    # signals must NOT have this key
    action_eq: str = ""             # action must equal this string (empty = any)
    last_action_eq: str = ""        # state["_last_action"] must equal this
    min_overall: float = 0.0        # overall quality score must be >= this

    def applies(
        self,
        *,
        toggles: Optional[dict],
        prev_signals: dict,
        signals: dict,
        action: str,
        last_action: str,
        overall: float,
    ) -> bool:
        """Return True iff this recovery rule fires for the current turn."""
        if not _is_toggle_enabled(toggles, self.toggle_key):
            return False
        if self.prev_signal and not prev_signals.get(self.prev_signal):
            return False
        if self.curr_signal_absent and signals.get(self.curr_signal_absent):
            return False
        if self.action_eq and action != self.action_eq:
            return False
        if self.last_action_eq and last_action != self.last_action_eq:
            return False
        if overall < self.min_overall:
            return False
        return True


# Ordered list -- all matching rules are applied (recovery can stack)
_RECOVERY_RULES: tuple[RecoveryRule, ...] = (
    RecoveryRule(
        toggle_key="ownership_clarified",
        delta_key="ownership_clarified",
        recovery_label="ownership_clarified",
        prev_signal="ownership_ambiguity",
        curr_signal_absent="ownership_ambiguity",
        action_eq="MOVE_ON",
    ),
    RecoveryRule(
        toggle_key="example_given",
        delta_key="example_given",
        recovery_label="concrete_example_after_evasion",
        prev_signal="example_evasion",
        curr_signal_absent="example_evasion",
        min_overall=6.0,
    ),
    RecoveryRule(
        toggle_key="strong_under_pressure",
        delta_key="strong_under_pressure",
        recovery_label="strong_under_pressure",
        prev_signal="follow_up_collapse",   # only fires after a prior collapse/pressure signal
        last_action_eq="PROBE",
        min_overall=6.5,
    ),
)


# ===========================================================================
# DSA: TrendRule -- replaces if/elif chain in _recompute_trend
# ===========================================================================

@dataclass(frozen=True)
class TrendRule:
    """One trend classification rule -- first match wins."""
    label: str
    min_delta: float  # delta >= min_delta (use -inf for no lower bound)
    max_delta: float  # delta < max_delta (exclusive upper, use +inf for no cap)

    def matches(self, delta: float) -> bool:
        return self.min_delta <= delta < self.max_delta


# Ordered -- first match wins; covers all float ranges
_TREND_RULES: tuple[TrendRule, ...] = (
    TrendRule(label=TrendLabel.IMPROVING,  min_delta=0.8,   max_delta=float("inf")),
    TrendRule(label=TrendLabel.STABLE,     min_delta=-0.5,  max_delta=0.8),
    TrendRule(label=TrendLabel.DECLINING,  min_delta=-1.5,  max_delta=-0.5),
    TrendRule(label=TrendLabel.COLLAPSING, min_delta=float("-inf"), max_delta=-1.5),
)


# ===========================================================================
# Internal helpers -- preserved with same signatures
# ===========================================================================

def _is_toggle_enabled(toggles: Optional[dict[str, Any]], key: str) -> bool:
    """Return True iff the named toggle is enabled (default: True when absent).

    Always-on signals (see ALWAYS_ON_PROCTORING_SIGNALS in session_state.py)
    bypass the toggle check entirely -- they MUST fire regardless of whether
    the org's stored JSON has them set to false. Mirrors the TS-layer
    isProctoringSignalEnabled override.
    """
    # Hard override: always-on signals fire regardless of toggle state.
    if is_always_on_signal(key):
        return True
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


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _add_risk(state: TrustState, factor: str) -> None:
    """Append risk factor -- O(1) via OrderedSet when state uses OrderedSet,
    falls back to original O(n) list check for plain list state."""
    rf = state["risk_factors"]
    if isinstance(rf, OrderedSet):
        rf.add(factor)
    else:
        if factor not in rf:
            rf.append(factor)


def _add_recovery(state: TrustState, factor: str) -> None:
    """Append recovery factor -- O(1) via OrderedSet, O(n) fallback for list."""
    rcf = state["recovery_factors"]
    if isinstance(rcf, OrderedSet):
        rcf.add(factor)
    else:
        if factor not in rcf:
            rcf.append(factor)


def _recompute_score(state: TrustState) -> None:
    buckets = state["buckets"]
    score = sum(buckets[k] * w for k, w in _BUCKET_WEIGHTS.items())
    state["trust_score"] = round(_clamp(score), 3)


def _recompute_trend(state: TrustState) -> None:
    """Recompute trend label using TrendRule dispatch table.

    Uses SlidingWindow.half_split_averages() when score_history is a
    SlidingWindow; falls back to manual half-split for plain lists.
    """
    history = state["score_history"]
    if len(history) < 2:
        state["trend"] = TrendLabel.STABLE
        return
    # Support both SlidingWindow and plain list
    if isinstance(history, SlidingWindow):
        first_half, second_half = history.half_split_averages(_TREND_WINDOW)
    else:
        window = history[-_TREND_WINDOW:]
        if len(window) < 2:
            state["trend"] = TrendLabel.STABLE
            return
        mid = len(window) // 2
        first_half = sum(window[:mid]) / max(mid, 1)
        second_half = sum(window[mid:]) / max(len(window) - mid, 1)

    delta = second_half - first_half
    # Dispatch table replaces: if delta >= 0.8 / elif delta <= -1.5 / ...
    matched = next((r.label for r in _TREND_RULES if r.matches(delta)), TrendLabel.STABLE)
    state["trend"] = matched


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


# ===========================================================================
# OOP: TrustEngine -- encapsulates all trust update logic
# ===========================================================================

class TrustEngine:
    """Session-level trust aggregator.

    Encapsulates apply_turn_decision, apply_proctoring_event, and
    finalize_trust_state as methods. Module-level functions delegate here
    so all existing callers (agent_runtime.py, eval_pipeline.py) require
    zero changes.

    The engine is stateless -- all mutable state lives in TrustState (TypedDict)
    that is passed in and returned, never stored on the engine instance.
    """

    # -- Public turn update --------------------------------------------------

    def apply_turn(
        self,
        state: TrustState,
        td: dict,
        *,
        behavioral_toggles: Optional[dict[str, Any]] = None,
    ) -> TrustState:
        """Apply one TurnDecision to the trust state.

        Steps:
          1. Extract quality scores -> compute overall
          2. Append overall to score_history (capped at 8 entries)
          3. Apply IQ bucket delta via _IQ_RULES dispatch table
          4. Apply signal events from contract
          5. Apply recovery rules via _RECOVERY_RULES dispatch table
          6. Recompute weighted score + trend
        """
        quality = td.get("quality", {})
        signals = td.get("signals", {})
        signal_events = td.get("signal_events", [])
        action = td.get("decision", {}).get("action", "MOVE_ON")

        clarity     = float(quality.get("clarity", 5.0))
        depth       = float(quality.get("depth", 5.0))
        specificity = float(quality.get("specificity", 5.0))
        grounding   = float(quality.get("grounding", 5.0))
        overall     = (clarity + depth + specificity + grounding) / 4.0

        # Score history -- keep last 8 entries (O(1) if SlidingWindow, O(n) if list)
        history = state["score_history"]
        if isinstance(history, SlidingWindow):
            history.append(round(overall, 2))
        else:
            history.append(round(overall, 2))
            if len(history) > 8:
                state["score_history"] = history[-8:]

        # -- Intelligence quality bucket: IQRule dispatch ---------------------
        # Replaces: if overall >= 7.5 or depth >= 7.5 / elif overall >= 6.0 ...
        iq_delta = next(
            (rule.delta() for rule in _IQ_RULES if rule.matches(overall, depth, specificity)),
            0.0,
        )
        state["buckets"]["intelligence_quality"] = _clamp(
            state["buckets"]["intelligence_quality"] + iq_delta
        )

        # -- Signal events from contract (only path that mutates trust from signals)
        for event in signal_events:
            bucket_name  = str(event.get("trust_bucket_affected", "") or "")
            event_delta  = float(event.get("score_delta", 0.0) or 0.0)
            signal_name  = str(event.get("signal_name", "") or "")
            recoverable  = bool(event.get("recoverable", False))
            if bucket_name in state["buckets"]:
                state["buckets"][bucket_name] = _clamp(
                    state["buckets"][bucket_name] + event_delta
                )
            if event_delta < 0:
                _add_risk(state, signal_name)
            elif recoverable:
                _add_recovery(state, f"{signal_name}_resolved")

        # -- Recovery: RecoveryRule dispatch table ----------------------------
        # Replaces 3 stacked if (_is_toggle_enabled(...) and ...) blocks
        prev_signals = state.get("_last_signals", {})
        last_action  = state.get("_last_action", "")
        bc_delta = 0.0
        for rule in _RECOVERY_RULES:
            if rule.applies(
                toggles=behavioral_toggles,
                prev_signals=prev_signals,
                signals=signals,
                action=action,
                last_action=last_action,
                overall=overall,
            ):
                bc_delta += _TURN_DELTAS[rule.delta_key]
                _add_recovery(state, rule.recovery_label)

        state["_last_signals"] = dict(signals)
        state["_last_action"] = action
        state["buckets"]["behavioral_confidence"] = _clamp(
            state["buckets"]["behavioral_confidence"] + bc_delta
        )

        state["turn_count"] += 1
        _recompute_score(state)
        _recompute_trend(state)
        return state

    # -- Public proctoring update -------------------------------------------

    def apply_proctoring(self, state: TrustState, event: dict) -> TrustState:
        """Apply one proctoring event to the hard_integrity bucket."""
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

    # -- Finalization --------------------------------------------------------

    def finalize(self, state: TrustState) -> TrustState:
        """Final pass: set bands, freeze trend. Call once at end of interview."""
        _recompute_score(state)
        _recompute_trend(state)
        state["integrity_band"] = _integrity_band(state["buckets"]["hard_integrity"])
        state["quality_band"]   = _quality_band(state["buckets"]["intelligence_quality"])
        state["finalized"]    = True
        state["finalized_at"] = time.time()
        return state

    # -- LangChain composable chain (optional) --------------------------------

    def build_langchain_chain(self):
        """Build a LangChain RunnableSequence for the full trust update pipeline.

        Returns None if langchain-core is not installed.

        Each step in the chain is a pure function that takes (state, td, toggles)
        via a shared context dict and returns the updated context.

        Usage::
            chain = engine.build_langchain_chain()
            if chain:
                ctx = chain.invoke({"state": state, "td": td, "toggles": toggles})
                updated_state = ctx["state"]
        """
        if not _LANGCHAIN_AVAILABLE:
            return None

        def _step_quality(ctx: dict) -> dict:
            quality = ctx["td"].get("quality", {})
            clarity     = float(quality.get("clarity", 5.0))
            depth       = float(quality.get("depth", 5.0))
            specificity = float(quality.get("specificity", 5.0))
            grounding   = float(quality.get("grounding", 5.0))
            ctx["overall"]     = (clarity + depth + specificity + grounding) / 4.0
            ctx["clarity"]     = clarity
            ctx["depth"]       = depth
            ctx["specificity"] = specificity
            return ctx

        def _step_iq_rules(ctx: dict) -> dict:
            o, d, s = ctx["overall"], ctx["depth"], ctx["specificity"]
            iq_delta = next(
                (rule.delta() for rule in _IQ_RULES if rule.matches(o, d, s)), 0.0
            )
            state = ctx["state"]
            history = state["score_history"]
            if isinstance(history, SlidingWindow):
                history.append(round(o, 2))
            else:
                history.append(round(o, 2))
                if len(history) > 8:
                    state["score_history"] = history[-8:]
            state["buckets"]["intelligence_quality"] = _clamp(
                state["buckets"]["intelligence_quality"] + iq_delta
            )
            return ctx

        def _step_signal_events(ctx: dict) -> dict:
            state = ctx["state"]
            for event in ctx["td"].get("signal_events", []):
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
            return ctx

        def _step_recovery(ctx: dict) -> dict:
            state        = ctx["state"]
            signals      = ctx["td"].get("signals", {})
            action       = ctx["td"].get("decision", {}).get("action", "MOVE_ON")
            prev_signals = state.get("_last_signals", {})
            last_action  = state.get("_last_action", "")
            overall      = ctx["overall"]
            toggles      = ctx.get("toggles")
            bc_delta = 0.0
            for rule in _RECOVERY_RULES:
                if rule.applies(
                    toggles=toggles,
                    prev_signals=prev_signals,
                    signals=signals,
                    action=action,
                    last_action=last_action,
                    overall=overall,
                ):
                    bc_delta += _TURN_DELTAS[rule.delta_key]
                    _add_recovery(state, rule.recovery_label)
            state["_last_signals"] = dict(signals)
            state["_last_action"]  = action
            state["buckets"]["behavioral_confidence"] = _clamp(
                state["buckets"]["behavioral_confidence"] + bc_delta
            )
            return ctx

        def _step_finalize_turn(ctx: dict) -> dict:
            state = ctx["state"]
            state["turn_count"] += 1
            _recompute_score(state)
            _recompute_trend(state)
            return ctx

        return (
            RunnableLambda(_step_quality)
            | RunnableLambda(_step_iq_rules)
            | RunnableLambda(_step_signal_events)
            | RunnableLambda(_step_recovery)
            | RunnableLambda(_step_finalize_turn)
        )


# ===========================================================================
# Module-level singleton -- all public APIs delegate here
# ===========================================================================

_engine = TrustEngine()


# ===========================================================================
# Public API -- signatures identical to original; zero call-site changes needed
# ===========================================================================

def apply_turn_decision(
    state: TrustState,
    td: dict,
    *,
    behavioral_toggles: Optional[dict[str, Any]] = None,
) -> TrustState:
    """Update trust state from one TurnDecision object.

    td is the TurnDecision TypedDict from turn_decision.py.
    Delegates to TrustEngine.apply_turn() -- all logic lives there.
    """
    return _engine.apply_turn(state, td, behavioral_toggles=behavioral_toggles)


def apply_proctoring_event(state: TrustState, event: dict) -> TrustState:
    """Update trust state from one proctoring event dict.

    event shape: {"event": str, "score_delta": int, ...}
    Delegates to TrustEngine.apply_proctoring().
    """
    return _engine.apply_proctoring(state, event)


def finalize_trust_state(state: TrustState) -> TrustState:
    """Final pass: set bands, clamp all values, freeze trend.

    Call once at end of interview before building recruiter summary.
    Delegates to TrustEngine.finalize().
    """
    return _engine.finalize(state)
