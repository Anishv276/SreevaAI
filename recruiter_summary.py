"""
Recruiter-facing summary builder.

Converts the finalized TrustState + answer_scores into a clean,
human-readable summary object for the dashboard/DB.

No LLM calls. Pure aggregation from existing session data.
"""
from session_state import TrustState, INTEGRITY_BAND, QUALITY_BAND
from contradiction_state import summarize_contradiction_state


# -- Recommendation thresholds -------------------------------------------------
def build_recruiter_summary(
    trust_state: TrustState,
    answer_scores: list[dict],
    contradictions_found: list[dict],
    total_turns: int,
    candidate_name: str = "",
    job_title: str = "",
    contradiction_state: dict | None = None,
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
    suspicion_score = _derive_legacy_suspicion_score(ts, contradictions_found)
    contradiction_summary = summarize_contradiction_state(contradiction_state or {})
    proctoring_profile = proctoring_profile or {}
    environment_risk = int(proctoring_profile.get("environment_risk", 0) or 0)
    integrity_risk = int(proctoring_profile.get("integrity_risk", 0) or 0)
    depth_risk = int(proctoring_profile.get("depth_risk", 0) or 0)
    composite_risk = int(proctoring_profile.get("composite_risk", suspicion_score) or suspicion_score)

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
    if "contradiction_resolved" in recovery_factors:
        strengths.append("Clarified an apparent inconsistency convincingly when asked.")
    if "strong_under_pressure" in recovery_factors:
        strengths.append("Maintained answer quality under follow-up pressure.")
    if "concrete_example_after_evasion" in recovery_factors:
        strengths.append("Recovered from initial vagueness with a real, specific example.")
    if contradiction_summary["status"] == "candidate_clarified":
        strengths.append("Resolved a contradiction cleanly after follow-up.")

    # -- Concerns ----------------------------------------------------------
    concerns = []
    if "ownership_ambiguity" in risk_factors:
        concerns.append("Frequent 'we' language - personal contribution often unclear.")
    if "example_evasion" in risk_factors:
        concerns.append("Stayed theoretical when asked for specific examples.")
    if "follow_up_collapse" in risk_factors:
        concerns.append("Answer depth dropped significantly on follow-up questions.")
    if contradictions_found:
        concerns.append(f"{len(contradictions_found)} factual inconsistency(ies) detected across the session.")
    if contradiction_summary["status"] == "surfaced":
        concerns.append("A contradiction surfaced and is still open.")
    elif contradiction_summary["status"] == "unresolved":
        concerns.append("A contradiction remained unresolved after clarification.")
    elif contradiction_summary["status"] == "repeated":
        concerns.append("The same contradiction pattern surfaced more than once.")
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
        score, integrity, quality, trend, suspicion_score, len(contradictions_found)
    )

    # -- Quality averages from answer_scores --------------------------------
    n = max(len(answer_scores), 1)
    avg_depth = sum(s.get("depth", 5) for s in answer_scores) / n
    avg_specificity = sum(s.get("specificity", 5) for s in answer_scores) / n
    avg_overall = sum(s.get("overall", 5) for s in answer_scores) / n

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
        "contradictionCount": len(contradictions_found),
        "contradictionState": contradiction_summary,
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


def _derive_legacy_suspicion_score(ts: TrustState, contradictions_found: list[dict]) -> int:
    """
    Derive a legacy display score from the finalized TrustState.

    This keeps the dashboard's old numeric field available without treating it as
    an independent decision source.
    """
    hard_integrity = float(ts["buckets"]["hard_integrity"])
    risk_count = len(ts["risk_factors"])
    recovery_count = len(ts["recovery_factors"])
    contradiction_penalty = min(30, len(contradictions_found) * 8)

    score = (1.0 - hard_integrity) * 100.0
    score += min(20, risk_count * 4)
    score -= min(15, recovery_count * 3)
    score += contradiction_penalty
    return max(0, min(100, int(round(score))))


def _recommendation(
    score: float,
    integrity: str,
    quality: str,
    trend: str,
    suspicion: int,
    contradiction_count: int,
) -> tuple[str, str]:
    """Returns (recommendation_label, reason_string)."""

    # Hard disqualifiers
    if integrity == INTEGRITY_BAND.CRITICAL or suspicion >= 70:
        return ("DO_NOT_ADVANCE", "Integrity signals too severe to proceed without manual review.")
    if contradiction_count >= 3:
        return ("DO_NOT_ADVANCE", "Multiple unresolved factual contradictions detected.")

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
