"""
Session state schema for the Trust Engine.

TrustState is the single mutable object that accumulates trust signals
across the full interview. Initialized once at session start, updated
per-turn by trust_engine.apply_turn_decision(), and finalized once at
session end by trust_engine.finalize_trust_state().

Bucket weights (must sum to 1.0):
  intelligence_quality  45%  — answer depth, specificity, clarity, grounding
  behavioral_confidence 30%  — ownership clarity, example quality, follow-up consistency
  hard_integrity        25%  — contradictions, proctoring events

Trust score = weighted sum of the three buckets, clamped 0.0–1.0.
Bands (integrity_band, quality_band) are only meaningful after finalization.
"""
from typing import TypedDict


# ---------------------------------------------------------------------------
# Band constants — string labels used in integrity_band and quality_band
# ---------------------------------------------------------------------------

# integrity_band: reflects hard_integrity bucket score
INTEGRITY_BAND_HIGH     = "high"       # >= 0.75 — no integrity concerns
INTEGRITY_BAND_MEDIUM   = "medium"     # >= 0.50 — minor flags
INTEGRITY_BAND_LOW      = "low"        # >= 0.30 — significant concerns
INTEGRITY_BAND_CRITICAL = "critical"   # <  0.30 — severe integrity issues

# quality_band: reflects intelligence_quality bucket score
QUALITY_BAND_STRONG   = "strong"       # >= 0.75 — consistently deep answers
QUALITY_BAND_ADEQUATE = "adequate"     # >= 0.50 — acceptable depth
QUALITY_BAND_WEAK     = "weak"         # >= 0.30 — mostly surface answers
QUALITY_BAND_POOR     = "poor"         # <  0.30 — consistently shallow

# trend: direction of score_history over the last N turns
TREND_STABLE    = "stable"
TREND_IMPROVING = "improving"
TREND_DECLINING = "declining"
TREND_COLLAPSING = "collapsing"

# Legacy class-style accessors — kept so trust_engine.py import doesn't break
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
# Schema
# ---------------------------------------------------------------------------

class BucketScores(TypedDict):
    intelligence_quality: float    # 0.0–1.0 — answer depth, specificity, clarity, grounding
    behavioral_confidence: float   # 0.0–1.0 — ownership, examples, follow-up consistency
    hard_integrity: float          # 0.0–1.0 — contradictions and proctoring events


class TrustState(TypedDict):
    # ── Composite score ───────────────────────────────────────────────────────
    trust_score: float             # 0.0–1.0 weighted sum of buckets

    # ── Bands — only meaningful after finalize_trust_state() ─────────────────
    integrity_band: str            # high / medium / low / critical
    quality_band: str              # strong / adequate / weak / poor

    # ── Trend — direction of quality over last N turns ────────────────────────
    trend: str                     # stable / improving / declining / collapsing

    # ── Weighted sub-scores ───────────────────────────────────────────────────
    buckets: BucketScores

    # ── Evidence lists (append-only, deduplicated) ────────────────────────────
    risk_factors: list[str]        # negative signal names accumulated across session
    recovery_factors: list[str]    # positive rebound events accumulated across session

    # ── Per-turn quality history — used for trend + depth_decay detection ─────
    score_history: list[float]     # overall quality score per interview turn (floats 0–10)

    # ── Turn counter ──────────────────────────────────────────────────────────
    turn_count: int

    # ── Internal carry-over for recovery detection (not in recruiter summary) ──
    _last_signals: dict[str, bool] # signal flags from previous turn
    _last_action: str              # action from previous turn (PROBE / MOVE_ON / VERIFY)

    # ── Finalization ──────────────────────────────────────────────────────────
    finalized: bool                # True after finalize_trust_state() is called
    finalized_at: float            # Unix timestamp of finalization


# ---------------------------------------------------------------------------
# Initializer
# ---------------------------------------------------------------------------

def init_trust_state() -> TrustState:
    """
    Return a fresh TrustState at session start.

    Starting values:
      intelligence_quality  = 0.65  (neutral — no answers yet)
      behavioral_confidence = 0.65  (neutral — no behavioral signals yet)
      hard_integrity        = 0.75  (benefit of the doubt — innocent until proven otherwise)

    Composite trust_score is computed from the three buckets so it stays
    consistent with _recompute_score() throughout the session:
      0.65*0.45 + 0.65*0.30 + 0.75*0.25 = 0.675
    """
    buckets = BucketScores(
        intelligence_quality=0.65,
        behavioral_confidence=0.65,
        hard_integrity=0.75,
    )
    # Compute initial trust_score from buckets (same formula as _recompute_score)
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