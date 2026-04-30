"""
Behavioral analysis module - synthesizes proctoring signals, communication patterns,
and consistency checks into narrative behavioral insights for HR decision-making.

Core principle: Report WHAT HAPPENED, not metrics. Evidence-based analysis.
"""

import json
import re
from typing import Any, Optional


def extract_engagement_signals(
    transcript_lines: list[str],
    total_duration_sec: int,
    answer_scores: list[dict],
) -> list[str]:
    """Extract engagement signals: what candidate did during interview."""
    signals = []

    # Count candidate turns
    candidate_turns = sum(1 for line in transcript_lines if line.startswith("Candidate:"))
    total_turns = len([line for line in transcript_lines if ":" in line])

    if candidate_turns < total_turns * 0.3:
        signals.append("Candidate spoke very little relative to interviewer (possible disengagement or language barrier)")
    elif candidate_turns > total_turns * 0.6:
        signals.append("Candidate spoke frequently and engaged throughout interview")

    # Check for fatigue (short answers late in interview)
    if len(answer_scores) >= 5:
        early_avg = sum(s.get("overall", 5) for s in answer_scores[:max(1, len(answer_scores)//2)]) / max(1, len(answer_scores)//2)
        late_avg = sum(s.get("overall", 5) for s in answer_scores[len(answer_scores)//2:]) / max(1, len(answer_scores) - len(answer_scores)//2)
        if late_avg < early_avg - 2:
            signals.append(f"Answer quality declined in final half of interview (early avg: {early_avg:.1f}, late avg: {late_avg:.1f}) — suggests fatigue or disengagement")

    # Check duration
    if total_duration_sec < 300:
        signals.append(f"Short interview duration ({total_duration_sec // 60} min) — limited evaluation window")
    elif total_duration_sec > 1800:
        signals.append(f"Extended interview ({total_duration_sec // 60} min) — thorough evaluation conducted")

    # Questions asked to interviewee
    asked_questions = sum(1 for line in transcript_lines if "?" in line and line.startswith("Interviewer:"))
    if asked_questions < 5:
        signals.append(f"Few questions asked ({asked_questions}) — limited skill coverage")
    else:
        signals.append(f"Systematic questioning: {asked_questions} questions across multiple topic areas")

    return signals


def extract_consistency_signals(
    transcript_lines: list[str],
    contradictions_found: list[dict],
) -> list[str]:
    """Check resume claims vs interview answers."""
    signals = []

    if contradictions_found:
        for contradiction in contradictions_found[:3]:  # Top 3 contradictions
            old_val = contradiction.get("old_value", "N/A")
            new_val = contradiction.get("new_value", "N/A")
            claim_type = contradiction.get("type", "unknown")
            signals.append(
                f"Inconsistency in {claim_type}: earlier said '{old_val}', later said '{new_val}' — "
                f"suggests either unclear recollection or inflated initial claims"
            )
    else:
        signals.append("No major contradictions detected between resume claims and interview statements")

    return signals


def extract_communication_patterns(answer_scores: list[dict]) -> list[str]:
    """Analyze how candidate communicated."""
    signals = []

    if not answer_scores:
        return signals

    # Check clarity trajectory
    clarity_scores = [s.get("clarity", 5) for s in answer_scores]
    if clarity_scores:
        avg_clarity = sum(clarity_scores) / len(clarity_scores)
        min_clarity = min(clarity_scores)
        max_clarity = max(clarity_scores)

        if avg_clarity < 4:
            signals.append(
                f"Communication clarity is consistently poor (avg: {avg_clarity:.1f}/10) — "
                f"fragmented speech, run-on sentences, or grammatical issues throughout"
            )
        elif max_clarity - min_clarity > 4:
            signals.append(
                f"Communication quality varies significantly (range: {min_clarity}-{max_clarity}) — "
                f"strong on some topics, unclear on others. Pattern suggests anxiety or knowledge gaps."
            )
        else:
            signals.append(f"Consistent communication style maintained (avg clarity: {avg_clarity:.1f}/10)")

    # Check for vague/generic language
    vague_count = sum(1 for s in answer_scores if "vague" in s.get("concerns", []))
    if vague_count > len(answer_scores) * 0.5:
        signals.append(
            f"Frequently uses vague language ({vague_count} of {len(answer_scores)} answers) — "
            f"avoids specific examples, numbers, or concrete details"
        )

    # Check for hedging/uncertainty
    rehearsed_count = sum(1 for s in answer_scores if "rehearsed" in s.get("concerns", []))
    if rehearsed_count > 2:
        signals.append(
            f"Answers sound rehearsed or polished — may indicate either good preparation or unwillingness to think on feet"
        )

    return signals


def extract_confidence_indicators(answer_scores: list[dict]) -> list[str]:
    """Assess genuine vs. false confidence."""
    signals = []

    if not answer_scores:
        return signals

    # High scores + ownership signals = genuine confidence
    high_quality = sum(1 for s in answer_scores if s.get("overall", 0) >= 7)
    has_ownership = sum(1 for s in answer_scores if "has_ownership" in s.get("signals", []))

    if high_quality >= len(answer_scores) * 0.6 and has_ownership >= 3:
        signals.append(
            f"Genuine confidence: {high_quality} of {len(answer_scores)} answers were high quality, "
            f"with clear ownership language ({has_ownership} instances)"
        )
    elif high_quality >= len(answer_scores) * 0.6:
        signals.append(f"Appeared confident in {high_quality} of {len(answer_scores)} answers")

    # Low quality + false confidence = concerning
    low_quality = sum(1 for s in answer_scores if s.get("overall", 0) <= 3)
    if low_quality >= 2:
        signals.append(
            f"Areas of false/unwarranted confidence: {low_quality} answers were low quality despite "
            f"confident delivery — suggests overconfidence or lack of self-awareness"
        )

    return signals


def extract_integrity_flags(
    proctoring_events: list[dict],
    answer_scores: list[dict],
    contradictions: list[dict],
) -> list[str]:
    """Flag proctoring signals correlated with performance."""
    signals = []

    if not proctoring_events and not contradictions:
        signals.append("No integrity concerns detected in proctoring data")
        return signals

    # High tab switching on weak answers
    tab_switch_events = [e for e in proctoring_events if "tab" in str(e.get("event", "")).lower()]
    if tab_switch_events and answer_scores:
        weak_answer_count = sum(1 for s in answer_scores if s.get("overall", 0) < 4)
        if weak_answer_count >= 2 and len(tab_switch_events) >= 3:
            signals.append(
                f"Correlation between weak answers and tab switching: {len(tab_switch_events)} tab switches "
                f"recorded during {weak_answer_count} low-quality answers — pattern suggests looking up answers"
            )

    # Contradictions
    if contradictions:
        signals.append(
            f"Contradictions detected in {len(contradictions)} claim(s) — "
            f"suggests either poor memory, inconsistent preparation, or intentional misrepresentation"
        )

    # Check for evasion patterns
    incomplete_count = sum(1 for s in answer_scores if "incomplete" in s.get("concerns", []))
    if incomplete_count >= 2:
        signals.append(
            f"Evasion pattern: {incomplete_count} answers left incomplete or trailed off — "
            f"may indicate avoidance of specific topics or discomfort"
        )

    return signals


def synthesize_behavioral_report(
    transcript_lines: list[str],
    answer_scores: list[dict],
    total_duration_sec: int,
    proctoring_events: list[dict],
    contradictions_found: list[dict],
) -> dict[str, Any]:
    """Synthesize all behavioral signals into comprehensive report."""

    return {
        "engagement_signals": extract_engagement_signals(transcript_lines, total_duration_sec, answer_scores),
        "consistency_signals": extract_consistency_signals(transcript_lines, contradictions_found),
        "communication_patterns": extract_communication_patterns(answer_scores),
        "confidence_indicators": extract_confidence_indicators(answer_scores),
        "integrity_flags": extract_integrity_flags(proctoring_events, answer_scores, contradictions_found),
        "summary": _generate_behavioral_summary(
            extract_engagement_signals(transcript_lines, total_duration_sec, answer_scores),
            extract_consistency_signals(transcript_lines, contradictions_found),
            extract_communication_patterns(answer_scores),
            extract_integrity_flags(proctoring_events, answer_scores, contradictions_found),
        ),
    }


def _generate_behavioral_summary(
    engagement: list[str],
    consistency: list[str],
    communication: list[str],
    integrity: list[str],
) -> str:
    """Generate 2-3 sentence behavioral summary for hiring context."""

    key_points = []

    # Engagement
    if any("disengaged" in s.lower() or "little" in s.lower() for s in engagement):
        key_points.append("showed limited engagement")
    elif any("frequent" in s.lower() or "systematic" in s.lower() for s in engagement):
        key_points.append("engaged actively throughout")

    # Communication
    if any("poor" in s.lower() or "fragmented" in s.lower() for s in communication):
        key_points.append("communication clarity needs improvement")
    elif any("consistent" in s.lower() for s in communication):
        key_points.append("maintained consistent communication")

    # Consistency
    if any("inconsistency" in s.lower() or "contradiction" in s.lower() for s in consistency):
        key_points.append("some inconsistencies between claims and answers")

    # Integrity
    if any("concern" in s.lower() or "evasion" in s.lower() for s in integrity):
        key_points.append("integrity concerns detected")

    if not key_points:
        key_points = ["appeared straightforward and engaged"]

    summary = "Behavioral assessment: Candidate " + ", ".join(key_points[:2]) + "."
    if len(key_points) > 2:
        summary += f" Note: {key_points[2]}."

    return summary
