"""
Recruiter-facing summary builder.

Converts the finalized TrustState + answer_scores into a clean,
human-readable summary object for the dashboard/DB.

No LLM calls. Pure aggregation from existing session data.
"""
from interview.session_state import TrustState, INTEGRITY_BAND, QUALITY_BAND


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except (TypeError, ValueError):
        return default


# -- Recommendation thresholds -------------------------------------------------
def build_recruiter_summary(
    trust_state: TrustState,
    answer_scores: list[dict],
    total_turns: int,
    candidate_name: str = "",
    job_title: str = "",
    proctoring_profile: dict | None = None,
) -> dict:
    """
    Build recruiter-facing summary from finalized trust state.

    Returns a dict suitable for JSON serialization and DB storage.
    """
    ts = trust_state
    score = ts["trust_score"]
    integrity = ts["integrity_band"]
    quality = ts["quality_band"]
    trend = ts["trend"]
    risk_factors = ts["risk_factors"]
    recovery_factors = ts["recovery_factors"]
    buckets = ts["buckets"]
    proctoring_profile = proctoring_profile or {}
    environment_risk = _safe_int(proctoring_profile.get("environment_risk"))
    integrity_risk = _safe_int(proctoring_profile.get("integrity_risk"))
    depth_risk = _safe_int(proctoring_profile.get("depth_risk"))
    composite_risk = _safe_int(
        proctoring_profile.get(
            "composite_risk",
            max(environment_risk, integrity_risk, depth_risk),
        )
    )
    suspicion_score = composite_risk

    # -- Strengths ----------------------------------------------------------
    strengths = []
    if buckets["intelligence_quality"] >= 0.70:
        strengths.append("Demonstrated strong reasoning depth and specificity across answers.")
    if buckets["behavioral_confidence"] >= 0.70:
        strengths.append("Showed clear personal ownership and gave concrete examples.")
    if buckets["hard_integrity"] >= 0.75:
        strengths.append("No significant integrity signals detected - answers were consistent.")
    if trend == "improving":
        strengths.append("Performance improved noticeably under deeper probing.")
        strengths.append("Clarified an apparent inconsistency convincingly when asked.")
    if "strong_under_pressure" in recovery_factors:
        strengths.append("Maintained answer quality under follow-up pressure.")
    if "concrete_example_after_evasion" in recovery_factors:
        strengths.append("Recovered from initial vagueness with a real, specific example.")

    # -- Concerns ----------------------------------------------------------
    concerns = []
    if "ownership_ambiguity" in risk_factors:
        concerns.append("Frequent 'we' language - personal contribution often unclear.")
    if "example_evasion" in risk_factors:
        concerns.append("Stayed theoretical when asked for specific examples.")
    if "follow_up_collapse" in risk_factors:
        concerns.append("Answer depth dropped significantly on follow-up questions.")
    if integrity == INTEGRITY_BAND.CRITICAL:
        concerns.append("Multiple hard integrity signals - answers may not reflect genuine experience.")
    elif integrity == INTEGRITY_BAND.LOW:
        concerns.append("Some integrity signals warrant verification before advancing.")
    if trend == "collapsing":
        concerns.append("Answer quality declined sharply across the session.")
    if suspicion_score >= 50:
        concerns.append(f"Proctoring risk score elevated ({suspicion_score}/100).")

    # -- Authenticity confidence ---------------------------------------------
    authenticity_confidence = _authenticity_label(score, integrity, suspicion_score)

    # -- Final recommendation ------------------------------------------------
    recommendation, recommendation_reason = _recommendation(
        score=score,
        integrity=integrity,
        quality=quality,
        trend=trend,
        suspicion=suspicion_score,
    )

    # -- Quality averages from answer_scores --------------------------------
    scored_answers = [s for s in answer_scores if not s.get("is_warmup")]
    n = max(len(scored_answers), 1)
    avg_depth = sum(_safe_float(s.get("depth"), 5.0) for s in scored_answers) / n
    avg_specificity = sum(_safe_float(s.get("specificity"), 5.0) for s in scored_answers) / n
    avg_overall = sum(_safe_float(s.get("overall"), 5.0) for s in scored_answers) / n

    return {
        "candidate": candidate_name,
        "role": job_title,
        "totalTurns": total_turns,
        "trustScore": round(score, 3),
        "integrityBand": integrity,
        "qualityBand": quality,
        "trend": trend,
        "buckets": {
            "intelligenceQuality": round(buckets["intelligence_quality"], 3),
            "behavioralConfidence": round(buckets["behavioral_confidence"], 3),
            "hardIntegrity": round(buckets["hard_integrity"], 3),
        },
        "qualityAverages": {
            "depth": round(avg_depth, 2),
            "specificity": round(avg_specificity, 2),
            "overall": round(avg_overall, 2),
        },
        "strengths": strengths,
        "concerns": concerns,
        "riskFactors": risk_factors,
        "recoveryFactors": recovery_factors,
        "authenticityConfidence": authenticity_confidence,
        "recommendation": recommendation,
        "recommendationReason": recommendation_reason,
        "suspicionScore": suspicion_score,
        "proctoringRisk": {
            "environment": environment_risk,
            "integrity": integrity_risk,
            "depth": depth_risk,
            "composite": composite_risk,
        },
    }


# -- Internal label helpers ----------------------------------------------------

def _authenticity_label(score: float, integrity: str, suspicion: int) -> str:
    if integrity == INTEGRITY_BAND.CRITICAL or suspicion >= 60:
        return "low"
    if integrity == INTEGRITY_BAND.LOW or suspicion >= 35:
        return "moderate"
    if score >= 0.70 and integrity in (INTEGRITY_BAND.HIGH, INTEGRITY_BAND.MEDIUM):
        return "high"
    return "moderate"


def _recommendation(
    score: float,
    integrity: str,
    quality: str,
    trend: str,
    suspicion: int,
) -> tuple[str, str]:
    """Returns (recommendation_label, reason_string)."""

    # Hard disqualifiers
    if integrity == INTEGRITY_BAND.CRITICAL or suspicion >= 70:
        return ("DO_NOT_ADVANCE", "Integrity signals too severe to proceed without manual review.")
    if quality == QUALITY_BAND.POOR and trend in ("declining", "collapsing"):
        return ("DO_NOT_ADVANCE", "Answer quality stayed poor and declined during the interview.")

    # Strong pass
    if score >= 0.72 and integrity in (INTEGRITY_BAND.HIGH, INTEGRITY_BAND.MEDIUM) and trend in ("stable", "improving"):
        return ("ADVANCE", "Strong answer quality, consistent integrity signals, positive or stable trend.")

    # Marginal pass with caveats
    if score >= 0.58 and integrity != INTEGRITY_BAND.CRITICAL:
        if trend == "improving":
            return ("ADVANCE_WITH_NOTE", "Adequate quality with improving trajectory - worth advancing with awareness of early vagueness.")
        return ("ADVANCE_WITH_NOTE", "Adequate performance but some concerns noted - advance with follow-up verification recommended.")

    # Weak
    if score >= 0.42:
        return ("REVIEW_MANUALLY", "Mixed signals - requires manual review of transcript before decision.")

    # Poor
    return ("DO_NOT_ADVANCE", "Insufficient answer quality and/or integrity concerns across the session.")
