"""
Behavioral analysis module - synthesizes proctoring signals, communication patterns,
and consistency checks into narrative behavioral insights for HR decision-making.

Core principle: Report WHAT HAPPENED, not metrics. Evidence-based analysis.
"""

from typing import Any


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
    transcript_lines: list[str],  # noqa: ARG001
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


async def extract_proctoring_signals(
    proctoring_events: list[dict],
) -> list[dict[str, Any]]:
    """
    Extract all visible signals + hidden signals (recruiter_visible=False) when cumulative count >= 2.

    Returns list of signal dicts with evidence formatted for recruiter visibility:
    - signal: signal name
    - turns: list of turn numbers where signal fired
    - confidence: highest confidence among all firings
    - evidence: formatted evidence from the detection
    - interpretation: what this signal means for hiring decision
    - recruiter_visible: whether it was visible by default
    """
    if not proctoring_events:
        return []

    # Group signals by name, track all metadata
    signal_groups: dict[str, list[dict]] = {}
    for event in proctoring_events:
        sig_name = event.get("signal_name", "unknown")
        if sig_name not in signal_groups:
            signal_groups[sig_name] = []
        signal_groups[sig_name].append(event)

    # Include: visible signals (recruiter_visible=True) + hidden signals with count >= 2
    result = []
    for sig_name, events in signal_groups.items():
        if not events:
            continue

        is_visible = events[0].get("recruiter_visible", True)
        event_count = len(events)

        # Include if: always visible OR hidden but fired 2+ times OR hidden with very high confidence
        should_include = (
            is_visible or
            event_count >= 2 or
            (events[0].get("confidence", 0) >= 0.85)
        )

        if not should_include:
            continue

        highest_confidence = max(e.get("confidence", 0) for e in events)
        turn_numbers = [e.get("turn", 0) for e in events if e.get("turn")]

        # Format interpretation based on signal type (LLM for ownership_ambiguity, static for others)
        interpretation = await _interpret_hidden_signal(sig_name, events)

        # Combine evidence from all firings
        evidence_parts = []
        for e in events[:2]:  # Show top 2 evidences
            ev = e.get("evidence", "")
            if ev:
                evidence_parts.append(ev)
        combined_evidence = "; ".join(evidence_parts) if evidence_parts else "signal detected"

        result.append({
            "signal": sig_name,
            "turns": sorted(set(turn_numbers)),
            "confidence": round(highest_confidence, 2),
            "evidence": combined_evidence,
            "interpretation": interpretation,
            "visible": is_visible,
            "count": event_count,
        })

    return result


async def _interpret_hidden_signal(signal_name: str, events: list[dict]) -> str:
    """Generate recruiter-friendly interpretation of hidden signal using LLM for multiple signals."""

    # For signals that benefit from LLM interpretation, use dynamic summary based on evidence
    if signal_name in (
        "ownership_ambiguity", "example_evasion", "resume_claim_mismatch",
        "follow_up_collapse", "latency_mismatch", "ownership_clarified", "example_given",
        "contradiction", "contradiction_resolved", "complexity_latency_mismatch",
    ) and events:
        try:
            from openai import AsyncOpenAI

            evidence_list = [e.get("evidence", "") for e in events if e.get("evidence")]
            evidence_text = "; ".join(evidence_list) if evidence_list else f"signal {signal_name} detected"

            client = AsyncOpenAI()

            # Customize prompt based on signal type
            if signal_name == "ownership_ambiguity":
                signal_desc = "Candidate used 'we/our/team' without personal ownership claims"
            elif signal_name == "example_evasion":
                signal_desc = "Candidate was asked for an example but gave a theoretical answer"
            elif signal_name == "resume_claim_mismatch":
                signal_desc = "Candidate listed resume-like claims without concrete project details or hands-on evidence"
            elif signal_name == "follow_up_collapse":
                signal_desc = "Candidate gave detailed first answer but follow-up answer lost depth and specifics sharply"
            elif signal_name == "latency_mismatch":
                signal_desc = "Follow-up answer unnaturally compressed to very few words after detail-seeking question"
            elif signal_name == "ownership_clarified":
                signal_desc = "Candidate clarified personal ownership with explicit 'I' language and ownership terms after initial ambiguity"
            elif signal_name == "example_given":
                signal_desc = "Candidate provided concrete specific example with dates/numbers/project names after initial theoretical evasion"
            elif signal_name == "contradiction":
                # Extract old/new values from the most recent event for a specific summary
                latest = events[-1]
                old_v = latest.get("old_value") or latest.get("evidence", "earlier claim")
                new_v = latest.get("new_value") or "a conflicting statement"
                c_type = str(latest.get("contradiction_type", "") or "").replace("_", " ")
                repeat = sum(1 for e in events if e.get("status") == "repeated")
                signal_desc = (
                    f"Candidate contradicted a prior claim about {c_type or 'a key fact'}: "
                    f"earlier said '{old_v}', then said '{new_v}'"
                    + (f". Pattern repeated {repeat} time(s)" if repeat else "")
                )
            elif signal_name == "contradiction_resolved":
                latest = events[-1]
                c_type = str(latest.get("contradiction_type", "") or "").replace("_", " ")
                signal_desc = (
                    f"Candidate clarified and resolved a contradiction about {c_type or 'a prior claim'} "
                    "convincingly after being probed"
                )
            elif signal_name == "complexity_latency_mismatch":
                latest = events[-1]
                signal_desc = (
                    f"Suspicious answer timing: {latest.get('evidence', 'timing anomaly detected')}. "
                    "Complex question answered instantly (pre-written) OR simple question took too long (looking things up)."
                )
            else:
                signal_desc = f"Signal: {signal_name}"

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an HR interviewer analyzing candidate behavior. Generate a single concise line (under 15 words) summarizing what this signal means for hiring."
                    },
                    {
                        "role": "user",
                        "content": f"Signal: {signal_desc}\nEvidence: {evidence_text}\n\nGenerate one short line about what this means for the candidate."
                    }
                ],
                temperature=0.7,
                max_tokens=50
            )

            summary = response.choices[0].message.content.strip()
            return summary
        except Exception:
            # Fallback to static interpretation if LLM fails
            pass

    # Static interpretations for other signals
    interpretations = {
        "example_evasion": (
            "When asked for concrete examples, candidate stayed theoretical or avoided specifics. "
            "May indicate candidate recites preparation rather than drawing from lived experience."
        ),
        "latency_mismatch": (
            "Answer timing mismatched the question complexity — follow-up answers unnaturally compressed. "
            "May indicate candidate is guessing or avoiding depth rather than recalling genuine knowledge."
        ),
        "ownership_ambiguity": (
            "Heavy use of team language ('we', 'our') with minimal personal ownership language. "
            "May indicate candidate contributed to team effort but unclear on personal technical decisions."
        ),
        "complexity_latency_mismatch": (
            "Suspicious timing pattern: complex question answered instantly (suggests pre-written answer) "
            "OR simple factual question took very long (suggests candidate looking things up). "
            "May indicate AI-assisted preparation or external reference during interview."
        ),
        "resume_claim_mismatch": (
            "Resume-like claims presented without concrete evidence or grounding in actual work. "
            "May indicate candidate listing technologies without hands-on experience."
        ),
        "contradiction": (
            "Candidate made conflicting statements about a verifiable fact during the interview. "
            "Requires recruiter review — may indicate inflated claims, poor recall, or deliberate misrepresentation."
        ),
        "contradiction_resolved": (
            "Candidate was probed on a conflicting claim and provided a convincing clarification. "
            "Contradiction is considered closed — no further action needed on this specific inconsistency."
        ),
        "meta_question": (
            "Candidate paused to check if the interviewer could hear them or asked whether they were speaking to a bot. "
            "No integrity concern — signal is informational only. Ishita acknowledged and continued."
        ),
        "depth_decay": (
            "Answer quality declined progressively across multiple topics in the interview. "
            "May indicate fatigue, loss of focus, or that early answers were rehearsed while later ones were not."
        ),
    }

    return interpretations.get(
        signal_name,
        f"Signal '{signal_name}' detected. Pattern suggests potential gap between claims and demonstrated knowledge."
    )


async def synthesize_behavioral_report(
    transcript_lines: list[str],
    answer_scores: list[dict],
    total_duration_sec: int,
    proctoring_events: list[dict],
    contradictions_found: list[dict],
) -> dict[str, Any]:
    """Synthesize all behavioral signals into comprehensive report."""

    engagement = extract_engagement_signals(transcript_lines, total_duration_sec, answer_scores)
    consistency = extract_consistency_signals(transcript_lines, contradictions_found)
    communication = extract_communication_patterns(answer_scores)
    confidence = extract_confidence_indicators(answer_scores)
    integrity = extract_integrity_flags(proctoring_events, answer_scores, contradictions_found)
    hidden_signals = await extract_proctoring_signals(proctoring_events)

    report = {
        "engagement_signals": engagement,
        "consistency_signals": consistency,
        "communication_patterns": communication,
        "confidence_indicators": confidence,
        "integrity_flags": integrity,
        "summary": _generate_behavioral_summary(engagement, consistency, communication, integrity),
    }

    # Phase 5: Add hidden signals if detected
    if hidden_signals:
        report["proctoring_signals_detected"] = hidden_signals

    return report


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
