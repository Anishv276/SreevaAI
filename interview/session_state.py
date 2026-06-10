"""
Session state schema for the Trust Engine.

TrustState is the single mutable object that accumulates trust signals
across the full interview. Initialized once at session start, updated
per-turn by trust_engine.apply_turn_decision(), and finalized once at
session end by trust_engine.finalize_trust_state().

Bucket weights (must sum to 1.0):
  intelligence_quality  45%  -- answer depth, specificity, clarity, grounding
  behavioral_confidence 30%  -- ownership clarity, example quality, follow-up consistency
  hard_integrity        25%  -- inconsistencies, proctoring events

Trust score = weighted sum of the three buckets, clamped 0.0-1.0.
Bands (integrity_band, quality_band) are only meaningful after finalization.

Refactor additions (non-breaking):
  - IntegrityBand / QualityBand / TrendLabel: str Enum -- replaces sentinel classes
  - SlidingWindow: O(1) amortized fixed-size deque -- replaces raw list slicing
  - OrderedSet: O(1) membership + insertion-order dedup -- replaces list + "not in" scan
  - BucketScoresModel: Pydantic BaseModel with field-level clamping
  - TrustStateModel: Pydantic BaseModel wrapper for LangGraph nodes and API surfaces
  All legacy TypedDicts and init_trust_state() remain unchanged.
"""
from __future__ import annotations

from collections import deque
from enum import Enum
from typing import Any, Optional, TypedDict

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Always-on proctoring signals (Python mirror of lib/proctoring-signals.ts).
#
# These behavioral signals MUST fire regardless of an org's stored toggle
# value. They are the signals an interview cannot be scored fairly without:
# ownership, example/evidence, pressure/reasoning.
#
# Mirrors `ALWAYS_ON_PROCTORING_SIGNALS` in lib/proctoring-signals.ts. Keep
# the two lists in sync -- if you add a signal here, add it there too. The
# TS-side `verify-proctoring-signals.ts` covers the TS layer; the Python
# test in tests/test_signal_toggles.py covers this layer.
# ---------------------------------------------------------------------------

ALWAYS_ON_PROCTORING_SIGNALS: frozenset[str] = frozenset({
    # Ownership and Claim Checks
    "ownership_ambiguity",
    "ownership_clarified",
    # Legacy name kept for backward compatibility with existing tests and
    # callers that still use the older signal label.
    "resume_claim_mismatch",
    # Example and Evidence
    "example_evasion",
    "example_given",
    # Pressure and Reasoning
    "strong_under_pressure",
    "follow_up_collapse",
    "depth_decay",
})


def is_always_on_signal(signal_name: str) -> bool:
    """Return True iff the named signal is in the always-on set.

    Always-on signals fire regardless of org toggles. Used by gating helpers
    in turn_evaluator and trust_engine to short-circuit suppression checks.
    """
    return signal_name in ALWAYS_ON_PROCTORING_SIGNALS or signal_name == "weak_technical_hedge"


# ---------------------------------------------------------------------------
# Band Enums -- str-Enum so existing `== "high"` comparisons still work
# ---------------------------------------------------------------------------

class IntegrityBand(str, Enum):
    """Integrity quality tier -- reflects hard_integrity bucket score."""
    HIGH     = "high"      # >= 0.75 -- no integrity concerns
    MEDIUM   = "medium"    # >= 0.50 -- minor flags
    LOW      = "low"       # >= 0.30 -- significant concerns
    CRITICAL = "critical"  # <  0.30 -- severe integrity issues


class QualityBand(str, Enum):
    """Answer quality tier -- reflects intelligence_quality bucket score."""
    STRONG   = "strong"    # >= 0.75 -- consistently deep answers
    ADEQUATE = "adequate"  # >= 0.50 -- acceptable depth
    WEAK     = "weak"      # >= 0.30 -- mostly surface answers
    POOR     = "poor"      # <  0.30 -- consistently shallow


class TrendLabel(str, Enum):
    """Score trend over the last N turns."""
    STABLE     = "stable"
    IMPROVING  = "improving"
    DECLINING  = "declining"
    COLLAPSING = "collapsing"


# ---------------------------------------------------------------------------
# Legacy string constants -- kept so all existing imports never break
# ---------------------------------------------------------------------------

INTEGRITY_BAND_HIGH     = IntegrityBand.HIGH
INTEGRITY_BAND_MEDIUM   = IntegrityBand.MEDIUM
INTEGRITY_BAND_LOW      = IntegrityBand.LOW
INTEGRITY_BAND_CRITICAL = IntegrityBand.CRITICAL

QUALITY_BAND_STRONG   = QualityBand.STRONG
QUALITY_BAND_ADEQUATE = QualityBand.ADEQUATE
QUALITY_BAND_WEAK     = QualityBand.WEAK
QUALITY_BAND_POOR     = QualityBand.POOR

TREND_STABLE     = TrendLabel.STABLE
TREND_IMPROVING  = TrendLabel.IMPROVING
TREND_DECLINING  = TrendLabel.DECLINING
TREND_COLLAPSING = TrendLabel.COLLAPSING

# Legacy class-style accessors -- kept so trust_engine.py import doesn't break
class _IntegrityBand:
    HIGH     = INTEGRITY_BAND_HIGH
    MEDIUM   = INTEGRITY_BAND_MEDIUM
    LOW      = INTEGRITY_BAND_LOW
    CRITICAL = INTEGRITY_BAND_CRITICAL

class _QualityBand:
    STRONG   = QUALITY_BAND_STRONG
    ADEQUATE = QUALITY_BAND_ADEQUATE
    WEAK     = QUALITY_BAND_WEAK
    POOR     = QUALITY_BAND_POOR

INTEGRITY_BAND = _IntegrityBand()
QUALITY_BAND   = _QualityBand()


# ---------------------------------------------------------------------------
# DSA: SlidingWindow -- O(1) amortized fixed-size window
# ---------------------------------------------------------------------------

class SlidingWindow:
    """Fixed-capacity sliding window backed by collections.deque.

    Replaces manual list slicing (`score_history[-8:]`, `score_history[-4:]`)
    with O(1) append that automatically evicts the oldest entry when full.

    Used by trust_engine._recompute_trend() and DepthDecayDetector.

    Usage::

        w = SlidingWindow(maxlen=8)
        w.append(7.5)
        w.window(4)     # -> list of last 4 entries
        w.average(4)    # -> mean of last 4 entries (0.0 if empty)
        len(w)          # -> current size
        w.to_list()     # -> full window as list
    """

    __slots__ = ("_dq",)

    def __init__(self, maxlen: int) -> None:
        if maxlen < 1:
            raise ValueError(f"SlidingWindow maxlen must be >= 1, got {maxlen}")
        self._dq: deque[float] = deque(maxlen=maxlen)

    # -- mutations -----------------------------------------------------------

    def append(self, v: float) -> None:
        """Append a value; oldest entry is auto-evicted when at capacity."""
        self._dq.append(v)

    def clear(self) -> None:
        self._dq.clear()

    # -- reads ---------------------------------------------------------------

    def window(self, n: int) -> list[float]:
        """Return the last *n* entries as a plain list (fewer if not full)."""
        n = max(0, min(n, len(self._dq)))
        return list(self._dq)[-n:] if n else []

    def average(self, n: int) -> float:
        """Mean of the last *n* entries.  Returns 0.0 if window is empty."""
        w = self.window(n)
        return sum(w) / len(w) if w else 0.0

    def half_split_averages(self, n: int) -> tuple[float, float]:
        """Split last *n* into two halves and return (first_avg, second_avg).

        Used by _recompute_trend to detect improving/declining runs without
        manual midpoint arithmetic at every call site.
        """
        w = self.window(n)
        if len(w) < 2:
            return (0.0, 0.0)
        mid = len(w) // 2
        first = sum(w[:mid]) / mid
        second = sum(w[mid:]) / max(len(w) - mid, 1)
        return (first, second)

    def to_list(self) -> list[float]:
        """Full window contents as a plain list (oldest -> newest)."""
        return list(self._dq)

    # -- dunder --------------------------------------------------------------

    def __len__(self) -> int:
        return len(self._dq)

    def __repr__(self) -> str:
        return f"SlidingWindow(maxlen={self._dq.maxlen}, len={len(self._dq)})"


# ---------------------------------------------------------------------------
# DSA: OrderedSet -- O(1) membership + insertion-order dedup
# ---------------------------------------------------------------------------

class OrderedSet:
    """Insertion-order-preserving set backed by a dict.

    Replaces ``if factor not in list: list.append(factor)`` (O(n) scan + O(1)
    append) with O(1) membership check and O(1) insert.

    Used by trust_engine._add_risk() and trust_engine._add_recovery().

    Usage::

        s = OrderedSet(["ownership_ambiguity"])
        s.add("follow_up_collapse")
        "ownership_ambiguity" in s    # True  -- O(1)
        s.to_list()                   # ["ownership_ambiguity", "follow_up_collapse"]
    """

    __slots__ = ("_d",)

    def __init__(self, items: Optional[list[str]] = None) -> None:
        self._d: dict[str, None] = {}
        if items:
            for item in items:
                self._d[item] = None

    # -- mutations -----------------------------------------------------------

    def add(self, item: str) -> None:
        """Add *item* if not already present (no-op if duplicate)."""
        self._d[item] = None

    def discard(self, item: str) -> None:
        """Remove *item* if present; no-op otherwise."""
        self._d.pop(item, None)

    def clear(self) -> None:
        self._d.clear()

    # -- reads ---------------------------------------------------------------

    def to_list(self) -> list[str]:
        """Return items in insertion order."""
        return list(self._d)

    # -- dunder --------------------------------------------------------------

    def __contains__(self, item: object) -> bool:
        return item in self._d

    def __len__(self) -> int:
        return len(self._d)

    def __iter__(self):
        return iter(self._d)

    def __repr__(self) -> str:
        return f"OrderedSet({self.to_list()!r})"


# ---------------------------------------------------------------------------
# Pydantic: BucketScoresModel -- validated, dot-access sub-model
# ---------------------------------------------------------------------------

class BucketScoresModel(BaseModel):
    """Pydantic model for the three trust buckets (all clamped 0.0-1.0).

    Use alongside the legacy BucketScores TypedDict:
    - New code: use BucketScoresModel for dot-access + validation
    - Existing code: use BucketScores TypedDict via dict['key'] access
    - Convert: BucketScoresModel.from_dict(d) / model.to_dict()
    """

    intelligence_quality: float = Field(
        default=0.65, ge=0.0, le=1.0,
        description="Answer depth, specificity, clarity, grounding -- 45% weight",
    )
    behavioral_confidence: float = Field(
        default=0.65, ge=0.0, le=1.0,
        description="Ownership clarity, examples, follow-up consistency -- 30% weight",
    )
    hard_integrity: float = Field(
        default=0.75, ge=0.0, le=1.0,
        description="Inconsistencies and proctoring events -- 25% weight",
    )

    model_config = {"extra": "forbid"}

    @field_validator(
        "intelligence_quality", "behavioral_confidence", "hard_integrity",
        mode="before",
    )
    @classmethod
    def _clamp(cls, v: Any) -> float:
        """Silently clamp to [0.0, 1.0] rather than raising on boundary violations."""
        return max(0.0, min(1.0, float(v)))

    # -- convenience ---------------------------------------------------------

    def to_dict(self) -> dict[str, float]:
        return self.model_dump()

    @classmethod
    def from_dict(cls, d: dict) -> "BucketScoresModel":
        return cls.model_validate(d)

    def weighted_score(
        self,
        weights: dict[str, float] | None = None,
    ) -> float:
        """Compute the weighted composite score from the three buckets.

        Default weights match _BUCKET_WEIGHTS in trust_engine.py:
          intelligence_quality=0.45, behavioral_confidence=0.30, hard_integrity=0.25
        """
        w = weights or {
            "intelligence_quality": 0.45,
            "behavioral_confidence": 0.30,
            "hard_integrity": 0.25,
        }
        return max(0.0, min(1.0,
            self.intelligence_quality * w["intelligence_quality"]
            + self.behavioral_confidence * w["behavioral_confidence"]
            + self.hard_integrity * w["hard_integrity"]
        ))


# ---------------------------------------------------------------------------
# Pydantic: TrustStateModel -- full validated model for LangGraph + APIs
# ---------------------------------------------------------------------------

class TrustStateModel(BaseModel):
    """Pydantic model wrapping TrustState.  Validates on construction.

    Use alongside the legacy TrustState TypedDict:
    - Existing paths: TrustState TypedDict (dict-access, unchanged)
    - New paths (LangGraph nodes, API responses): TrustStateModel (dot-access)

    Convert::

        model = TrustStateModel.from_trust_state(state)   # TypedDict -> Model
        state = model.to_trust_state()                     # Model -> TypedDict
    """

    trust_score: float = Field(default=0.675, ge=0.0, le=1.0)
    integrity_band: str = Field(default=IntegrityBand.MEDIUM)
    quality_band: str = Field(default=QualityBand.ADEQUATE)
    trend: str = Field(default=TrendLabel.STABLE)
    buckets: BucketScoresModel = Field(default_factory=BucketScoresModel)
    risk_factors: list[str] = Field(default_factory=list)
    recovery_factors: list[str] = Field(default_factory=list)
    score_history: list[float] = Field(default_factory=list)
    turn_count: int = Field(default=0, ge=0)
    last_signals: dict[str, bool] = Field(default_factory=dict, alias="_last_signals")
    last_action: str = Field(default="", alias="_last_action")
    finalized: bool = Field(default=False)
    finalized_at: float = Field(default=0.0)

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @field_validator("trust_score", mode="before")
    @classmethod
    def _clamp_score(cls, v: Any) -> float:
        return max(0.0, min(1.0, float(v or 0.0)))

    @field_validator("score_history", mode="before")
    @classmethod
    def _validate_history(cls, v: Any) -> list[float]:
        if not isinstance(v, list):
            return []
        return [float(x) for x in v if x is not None]

    @field_validator("turn_count", mode="before")
    @classmethod
    def _clamp_turns(cls, v: Any) -> int:
        return max(0, int(v or 0))

    # -- converters ----------------------------------------------------------

    @classmethod
    def from_trust_state(cls, state: "TrustState") -> "TrustStateModel":
        """Convert a TypedDict TrustState into a validated Pydantic model."""
        return cls.model_validate({
            **state,
            "buckets": state.get("buckets", {}),
        })

    def to_trust_state(self) -> "TrustState":
        """Convert back to the TypedDict TrustState for existing code paths."""
        return TrustState(
            trust_score=self.trust_score,
            integrity_band=self.integrity_band,
            quality_band=self.quality_band,
            trend=self.trend,
            buckets=BucketScores(
                intelligence_quality=self.buckets.intelligence_quality,
                behavioral_confidence=self.buckets.behavioral_confidence,
                hard_integrity=self.buckets.hard_integrity,
            ),
            risk_factors=list(self.risk_factors),
            recovery_factors=list(self.recovery_factors),
            score_history=list(self.score_history),
            turn_count=self.turn_count,
            _last_signals=dict(self.last_signals),
            _last_action=self.last_action,
            finalized=self.finalized,
            finalized_at=self.finalized_at,
        )


# ---------------------------------------------------------------------------
# Legacy TypedDicts -- unchanged, preserved for all existing callers
# ---------------------------------------------------------------------------

class BucketScores(TypedDict):
    intelligence_quality: float    # 0.0-1.0 -- answer depth, specificity, clarity, grounding
    behavioral_confidence: float   # 0.0-1.0 -- ownership, examples, follow-up consistency
    hard_integrity: float          # 0.0-1.0 -- inconsistencies and proctoring events


class TrustState(TypedDict):
    # -- Composite score -------------------------------------------------------
    trust_score: float             # 0.0-1.0 weighted sum of buckets

    # -- Bands -- only meaningful after finalize_trust_state() -----------------
    integrity_band: str            # high / medium / low / critical
    quality_band: str              # strong / adequate / weak / poor

    # -- Trend -- direction of quality over last N turns ------------------------
    trend: str                     # stable / improving / declining / collapsing

    # -- Weighted sub-scores ---------------------------------------------------
    buckets: BucketScores

    # -- Evidence lists (append-only, deduplicated) ----------------------------
    risk_factors: list[str]        # negative signal names accumulated across session
    recovery_factors: list[str]    # positive rebound events accumulated across session

    # -- Per-turn quality history -- used for trend + depth_decay detection -----
    score_history: list[float]     # overall quality score per interview turn (floats 0-10)

    # -- Turn counter ----------------------------------------------------------
    turn_count: int

    # -- Internal carry-over for recovery detection (not in recruiter summary) --
    _last_signals: dict[str, bool] # signal flags from previous turn
    _last_action: str              # action from previous turn (PROBE / MOVE_ON / VERIFY)

    # -- Finalization ----------------------------------------------------------
    finalized: bool                # True after finalize_trust_state() is called
    finalized_at: float            # Unix timestamp of finalization


# ---------------------------------------------------------------------------
# Initializer -- public API signature unchanged
# ---------------------------------------------------------------------------

def init_trust_state() -> TrustState:
    """
    Return a fresh TrustState at session start.

    Starting values:
      intelligence_quality  = 0.65  (neutral -- no answers yet)
      behavioral_confidence = 0.65  (neutral -- no behavioral signals yet)
      hard_integrity        = 0.75  (benefit of the doubt -- innocent until proven otherwise)

    Composite trust_score is computed from the three buckets so it stays
    consistent with _recompute_score() throughout the session:
      0.65*0.45 + 0.65*0.30 + 0.75*0.25 = 0.675
    """
    buckets = BucketScores(
        intelligence_quality=0.65,
        behavioral_confidence=0.65,
        hard_integrity=0.75,
    )
    initial_score = round(
        buckets["intelligence_quality"] * 0.45
        + buckets["behavioral_confidence"] * 0.30
        + buckets["hard_integrity"] * 0.25,
        3,
    )
    return TrustState(
        trust_score=initial_score,
        integrity_band=INTEGRITY_BAND_MEDIUM,
        quality_band=QUALITY_BAND_ADEQUATE,
        trend=TREND_STABLE,
        buckets=buckets,
        risk_factors=[],
        recovery_factors=[],
        score_history=[],
        turn_count=0,
        _last_signals={},
        _last_action="",
        finalized=False,
        finalized_at=0.0,
    )
