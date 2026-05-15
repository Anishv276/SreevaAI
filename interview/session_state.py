"""
Session state schema for the Trust Engine.

TrustState is the single mutable object that accumulates trust signals
across the full interview. Initialized once, updated per-turn and per-event,
finalized at end of session.
"""
from typing import TypedDict


class _IntegrityBand:
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    CRITICAL = "critical"


class _QualityBand:
    STRONG = "strong"
    ADEQUATE = "adequate"
    WEAK = "weak"
    POOR = "poor"


INTEGRITY_BAND = _IntegrityBand()
QUALITY_BAND = _QualityBand()


class BucketScores(TypedDict):
    intelligence_quality: float    # 0.0–1.0, weighted 45%
    behavioral_confidence: float   # 0.0–1.0, weighted 30%
    hard_integrity: float          # 0.0–1.0, weighted 25%


class TrustState(TypedDict):
    # Core score and bands
    trust_score: float             # 0.0–1.0 composite
    integrity_band: str            # high / medium / low / critical
    quality_band: str              # strong / adequate / weak / poor
    trend: str                     # stable / improving / declining / collapsing

    # Weighted sub-scores
    buckets: BucketScores

    # Evidence lists
    risk_factors: list             # flags accumulated across session
    recovery_factors: list         # positive rebounds accumulated

    # History for trend computation
    score_history: list            # per-turn overall quality scores (floats)

    # Turn counter
    turn_count: int

    # Internal carry-over for recovery detection (not exposed in recruiter summary)
    _last_signals: dict
    _last_action: str
    contradiction_state: dict

    # Finalization
    finalized: bool
    finalized_at: float


def init_trust_state() -> TrustState:
    """Return a fresh TrustState at session start. Buckets start at 0.65 (slight trust-default)."""
    return TrustState(
        trust_score=0.65,
        integrity_band=INTEGRITY_BAND.MEDIUM,
        quality_band=QUALITY_BAND.ADEQUATE,
        trend="stable",
        buckets=BucketScores(
            intelligence_quality=0.65,
            behavioral_confidence=0.65,
            hard_integrity=0.75,  # start with higher integrity - innocent until proven otherwise
        ),
        risk_factors=[],
        recovery_factors=[],
        score_history=[],
        turn_count=0,
        _last_signals={},
        _last_action="",
        contradiction_state={},
        finalized=False,
        finalized_at=0.0,
    )
