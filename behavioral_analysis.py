"""
Behavioral analysis module - synthesizes proctoring signals, communication patterns,
and consistency checks into narrative behavioral insights for HR decision-making.
Core principle: Report WHAT HAPPENED with specific evidence, not raw metrics.
"""
from typing import Any


def extract_engagement_signals(
    transcript_lines: list[str],
    total_duration_sec: int,
    answer_scores: list[dict],
) -> list[str]:
    signals = []
    candidate_turns = sum(1 for line in transcript_lines if line.startswith("Candidate:"))
    total_turns = len([line for line in transcript_lines if ":" in line])

    if candidate_turns < total_turns * 0.3:
        signals.append(
            "Candidate spoke significantly less than the interviewer — possible disengagement, "
            "language barrier, or reluctance to elaborate on responses"
        )
    elif candidate_turns > total_turns * 0.6:
        signals.append("Candidate spoke consistently throughout, responding to every question with substantive answers")

    if len(answer_scores) >= 5:
        mid = max(1, len(answer_scores) // 2)
        early_scores = answer_scores[:mid]
        late_scores = answer_scores[mid:]
        early_avg = sum(s.get("overall", 5) for s in early_scores) / len(early_scores)
        late_avg = sum(s.get("overall", 5) for s in late_scores) / len(late_scores)
        if late_avg < early_avg - 2:
            signals.append(
                f"Answer quality dropped noticeably in the second half of the interview — "
                f"earlier answers were stronger and more specific, later answers became shorter and vaguer. "
                f"Possible fatigue, depleted preparation, or discomfort with harder topics"
            )
        elif late_avg > early_avg + 1.5:
            signals.append(
                "Candidate warmed up as the interview progressed — later answers were more "
                "detailed and confident than the opening responses"
            )

    if total_duration_sec < 300:
        signals.append(
            f"Interview lasted only {total_duration_sec // 60} minutes — insufficient time to fully "
            f"evaluate depth, so all signals below should be read as preliminary"
        )
    elif total_duration_sec > 1800:
        signals.append(
            f"Full {total_duration_sec // 60}-minute interview completed — comprehensive evaluation window"
        )

    asked_questions = sum(1 for line in transcript_lines if "?" in line and line.startswith("Interviewer:"))
    if asked_questions < 5:
        signals.append(
            f"Only {asked_questions} questions were asked — limited topic coverage means some skill "
            f"areas remain unverified"
        )
    else:
        signals.append(
            f"{asked_questions} questions asked across multiple topic areas — broad skill coverage achieved"
        )

    return signals


def extract_consistency_signals(
    transcript_lines: list[str],  # noqa: ARG001
    contradictions_found: list[dict],
) -> list[str]:
    signals = []
    if contradictions_found:
        for contradiction in contradictions_found[:3]:
            old_val = contradiction.get("old_value", "N/A")
            new_val = contradiction.get("new_value", "N/A")
            claim_type = str(contradiction.get("type", "unknown")).replace("_", " ")
            signals.append(
                f"Inconsistency in {claim_type}: earlier said '{old_val}', later said '{new_val}' — "
                f"recruiter should probe this directly before making a hiring decision"
            )
    else:
        signals.append(
            "No factual contradictions detected — statements about experience, tenure, and "
            "technical claims remained consistent throughout the interview"
        )
    return signals


def extract_communication_patterns(answer_scores: list[dict]) -> list[str]:
    signals = []
    if not answer_scores:
        return signals

    clarity_scores = [s.get("clarity", 5) for s in answer_scores]
    avg_clarity = sum(clarity_scores) / len(clarity_scores)
    min_clarity = min(clarity_scores)
    max_clarity = max(clarity_scores)

    if avg_clarity < 4:
        signals.append(
            "Communication was consistently hard to follow — answers were frequently fragmented, "
            "grammatically unclear, or structured in a way that made it difficult to extract the key point"
        )
    elif max_clarity - min_clarity > 4:
        signals.append(
            f"Communication quality was uneven — answers on familiar topics were clear and structured, "
            f"but responses on weaker topics became vague and difficult to follow. "
            f"Strongest clarity on questions the candidate was comfortable with"
        )
    else:
        signals.append(
            "Communication style was consistent throughout — structured responses, clear sentence construction, "
            "and answers that stayed on topic"
        )

    vague_count = sum(1 for s in answer_scores if "vague" in s.get("concerns", []))
    if vague_count > len(answer_scores) * 0.5:
        signals.append(
            f"More than half of all answers used vague or generic language — candidate avoided specific "
            f"numbers, project names, or concrete outcomes. This pattern across {vague_count} answers "
            f"suggests surface-level familiarity rather than hands-on depth"
        )

    rehearsed_count = sum(1 for s in answer_scores if "rehearsed" in s.get("concerns", []))
    if rehearsed_count > 2:
        signals.append(
            f"Multiple answers sounded pre-prepared — polished delivery but thin follow-up depth. "
            f"When probed beyond the initial answer, responses became noticeably less confident"
        )

    return signals


def extract_confidence_indicators(answer_scores: list[dict]) -> list[str]:
    signals = []
    if not answer_scores:
        return signals

    high_quality = sum(1 for s in answer_scores if s.get("overall", 0) >= 7)
    low_quality = sum(1 for s in answer_scores if s.get("overall", 0) <= 3)
    has_ownership = sum(1 for s in answer_scores if "has_ownership" in s.get("signals", []))

    if high_quality >= len(answer_scores) * 0.6 and has_ownership >= 3:
        signals.append(
            f"Strong genuine confidence — candidate gave high-quality answers on {high_quality} of "
            f"{len(answer_scores)} questions and consistently used first-person ownership language "
            f"('I built', 'I decided', 'I was responsible for') across {has_ownership} responses"
        )
    elif high_quality >= len(answer_scores) * 0.6:
        signals.append(
            f"Confident delivery on {high_quality} of {len(answer_scores)} questions — "
            f"answers were detailed and direct, though personal ownership was not always explicit"
        )

    if low_quality >= 2:
        signals.append(
            f"Overconfidence detected in {low_quality} answers — candidate delivered these with certainty "
            f"but the content was thin, vague, or technically inaccurate. "
            f"This gap between confident tone and weak substance is a red flag for senior roles"
        )

    return signals


def extract_integrity_flags(
    proctoring_events: list[dict],
    answer_scores: list[dict],
    contradictions: list[dict],
) -> list[str]:
    signals = []

    if not proctoring_events and not contradictions:
        signals.append(
            "No integrity concerns detected — proctoring data shows no anomalies and interview "
            "statements were consistent with resume claims"
        )
        return signals

    tab_switch_events = [e for e in proctoring_events if "tab" in str(e.get("event", "")).lower()]
    if tab_switch_events and answer_scores:
        weak_answer_count = sum(1 for s in answer_scores if s.get("overall", 0) < 4)
        if weak_answer_count >= 2 and len(tab_switch_events) >= 3:
            signals.append(
                f"Pattern of concern: {len(tab_switch_events)} tab switches occurred, and "
                f"{weak_answer_count} answers immediately following were unusually thin — "
                f"the timing suggests possible external reference lookup, not genuine recall"
            )

    if contradictions:
        signals.append(
            f"{len(contradictions)} factual inconsistency detected in the interview — "
            f"see Consistency section for specifics. Requires direct recruiter follow-up before advancing"
        )

    incomplete_count = sum(1 for s in answer_scores if "incomplete" in s.get("concerns", []))
    if incomplete_count >= 2:
        signals.append(
            f"{incomplete_count} answers trailed off or were left incomplete — "
            f"candidate appeared to avoid or abandon specific topics. Review the transcript "
            f"for which topics triggered this pattern"
        )

    return signals


def extract_strengths_observed(answer_scores: list[dict], consistency_clean: bool) -> list[str]:
    strengths = []

    strong_answers = [s for s in answer_scores if s.get("overall", 0) >= 7]
    if strong_answers:
        topics = [s.get("topic", "") for s in strong_answers if s.get("topic")]
        if topics:
            strengths.append(
                f"Demonstrated strong, specific knowledge on: {', '.join(topics[:3])} — "
                f"answers on these topics included concrete details and clear ownership"
            )
        else:
            strengths.append(
                f"Delivered {len(strong_answers)} high-quality answers with concrete specifics and clear reasoning"
            )

    high_ownership = [s for s in answer_scores if "has_ownership" in s.get("signals", [])]
    if high_ownership:
        strengths.append(
            f"Used clear first-person ownership language consistently — "
            f"'I built', 'I led', 'I decided' appeared across {len(high_ownership)} responses, "
            f"indicating genuine hands-on involvement rather than observer-level familiarity"
        )

    if consistency_clean:
        strengths.append(
            "All factual claims remained consistent — no contradictions between resume, early answers, "
            "and later responses. Suggests honest, well-grounded self-presentation"
        )

    recovery_answers = [s for s in answer_scores if "recovery" in s.get("signals", [])]
    if recovery_answers:
        strengths.append(
            f"Recovered well under follow-up pressure — when probed on {len(recovery_answers)} answers, "
            f"candidate provided additional depth rather than deflecting"
        )

    if not strengths:
        strengths.append("No notable standout strengths detected in this session — evaluation was limited or answers were consistently generic")

    return strengths


def extract_concerns_noted(
    answer_scores: list[dict],
    contradictions_found: list[dict],
    communication_signals: list[str],
) -> list[str]:
    concerns = []

    low_answers = [s for s in answer_scores if s.get("overall", 0) <= 3]
    if low_answers:
        topics = [s.get("topic", "") for s in low_answers if s.get("topic")]
        if topics:
            concerns.append(
                f"Significant knowledge gaps on: {', '.join(topics[:3])} — "
                f"answers were vague, incorrect, or too thin to demonstrate real experience in these areas"
            )
        else:
            concerns.append(
                f"{len(low_answers)} answers scored very low — content was either factually weak, "
                f"too generic, or failed to address what was actually asked"
            )

    if contradictions_found:
        types = [str(c.get("type", "")).replace("_", " ") for c in contradictions_found]
        concerns.append(
            f"Unresolved inconsistency in {', '.join(set(types[:2]))} — "
            f"candidate gave conflicting information that was not satisfactorily clarified when probed"
        )

    vague_pattern = any("vague" in s.lower() or "half" in s.lower() for s in communication_signals)
    if vague_pattern:
        concerns.append(
            "Persistent avoidance of specifics — across multiple questions, candidate gave general answers "
            "without concrete numbers, project names, timelines, or outcomes. "
            "Unable to verify depth of claimed experience from interview alone"
        )

    evasion_count = sum(1 for s in answer_scores if "evasion" in s.get("concerns", []))
    if evasion_count >= 2:
        concerns.append(
            f"Evasion pattern on {evasion_count} questions — when asked for specifics, "
            f"candidate pivoted to general statements or changed the subject"
        )

    if not concerns:
        concerns.append("No major concerns identified — candidate stayed on topic, answered directly, and avoided evasion")

    return concerns


async def extract_proctoring_signals(
    proctoring_events: list[dict],
) -> list[dict[str, Any]]:
    """
    Extract all visible signals + hidden signals when cumulative count >= 2 or confidence >= 0.85.
    Returns structured signal dicts with full context for recruiter UI.
    """
    if not proctoring_events:
        return []

    signal_groups: dict[str, list[dict]] = {}
    for event in proctoring_events:
        sig_name = event.get("signal_name", "unknown")
        if sig_name not in signal_groups:
            signal_groups[sig_name] = []
        signal_groups[sig_name].append(event)

    result = []
    for sig_name, events in signal_groups.items():
        if not events:
            continue
        is_visible = events[0].get("recruiter_visible", True)
        event_count = len(events)
        should_include = (
            is_visible or
            event_count >= 2 or
            (events[0].get("confidence", 0) >= 0.85)
        )
        if not should_include:
            continue

        highest_confidence = max(e.get("confidence", 0) for e in events)
        turn_numbers = sorted(set(e.get("turn", 0) for e in events if e.get("turn")))

        interpretation = await _interpret_hidden_signal(sig_name, events)

        evidence_parts = [e.get("evidence", "") for e in events[:3] if e.get("evidence")]
        combined_evidence = "; ".join(evidence_parts) if evidence_parts else ""

        result.append({
            "signal": sig_name,
            "turns": turn_numbers,
            "confidence": round(highest_confidence, 2),
            "evidence": combined_evidence,
            "interpretation": interpretation,
            "visible": is_visible,
            "count": event_count,
        })

    return result


async def _interpret_hidden_signal(signal_name: str, events: list[dict]) -> str:
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

            signal_descriptions = {
                "ownership_ambiguity": "Candidate used 'we/our/team' without personal ownership claims",
                "example_evasion": "Candidate was asked for a concrete example but gave a theoretical answer instead",
                "resume_claim_mismatch": "Candidate listed resume-like claims without concrete project details or hands-on evidence",
                "follow_up_collapse": "Candidate gave a detailed first answer but lost depth sharply when probed further",
                "latency_mismatch": "Follow-up answer was unnaturally compressed after a detail-seeking question",
                "ownership_clarified": "Candidate clarified personal ownership using explicit 'I' language after initial ambiguity",
                "example_given": "Candidate provided a concrete specific example after initially giving a theoretical answer",
            }

            if signal_name == "contradiction":
                latest = events[-1]
                old_v = latest.get("old_value") or latest.get("evidence", "earlier claim")
                new_v = latest.get("new_value") or "a conflicting statement"
                c_type = str(latest.get("contradiction_type", "") or "").replace("_", " ")
                repeat = sum(1 for e in events if e.get("status") == "repeated")
                signal_desc = (
                    f"Candidate contradicted a prior claim about {c_type or 'a key fact'}: "
                    f"earlier said '{old_v}', then said '{new_v}'"
                    + (f". This contradiction repeated {repeat} time(s)" if repeat else "")
                )
            elif signal_name == "contradiction_resolved":
                latest = events[-1]
                c_type = str(latest.get("contradiction_type", "") or "").replace("_", " ")
                signal_desc = (
                    f"Candidate clarified and resolved a contradiction about {c_type or 'a prior claim'} "
                    "convincingly when probed"
                )
            elif signal_name == "complexity_latency_mismatch":
                latest = events[-1]
                signal_desc = (
                    f"Suspicious answer timing: {latest.get('evidence', 'timing anomaly detected')}. "
                    "Complex question answered instantly (pre-written answer) OR simple question took too long (looking things up)."
                )
            else:
                signal_desc = signal_descriptions.get(signal_name, f"Signal: {signal_name}")

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an HR analyst writing recruiter-facing signal interpretations. "
                            "Write 1-2 sentences explaining what this behavioral signal means for the hiring decision. "
                            "Be specific. Reference the evidence. Do not use vague words like 'may indicate' without backing it up. "
                            "Format: '[What happened] — [What this means for hiring]'"
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Signal: {signal_desc}\nEvidence from interview: {evidence_text}",
                    },
                ],
                temperature=0.4,
                max_tokens=80,
            )
            return response.choices[0].message.content.strip()
        except Exception:
            pass

    interpretations = {
        "example_evasion": (
            "When asked for concrete examples, candidate redirected to theoretical statements. "
            "Real experience produces specific examples — this pattern suggests surface-level familiarity."
        ),
        "latency_mismatch": (
            "Answer timing was inconsistent with question complexity. "
            "Unusually fast answers on hard questions suggest pre-written responses, not genuine recall."
        ),
        "ownership_ambiguity": (
            "Candidate consistently used 'we' and 'our' without clarifying personal contribution. "
            "Unclear whether candidate led the work or observed it from the team."
        ),
        "complexity_latency_mismatch": (
            "Complex question answered instantly (suggests pre-written answer) or simple question took too long (suggests looking things up). "
            "Either pattern is a flag for AI-assisted or externally referenced responses."
        ),
        "resume_claim_mismatch": (
            "Candidate cited resume items without being able to back them up with concrete details. "
            "Listed technologies or projects could not be verified through interview answers."
        ),
        "contradiction": (
            "Candidate made conflicting statements about a verifiable fact. "
            "Recruiter must probe this directly — may indicate inflated claims or poor recall."
        ),
        "contradiction_resolved": (
            "Candidate clarified a prior contradiction convincingly when probed. "
            "Inconsistency is considered resolved — no further follow-up needed on this specific point."
        ),
        "depth_decay": (
            "Answer quality declined as the interview progressed — early answers were stronger and more specific. "
            "Later answers became thinner, suggesting rehearsed preparation that ran out."
        ),
        "follow_up_collapse": (
            "Strong first answer but candidate could not sustain depth when probed further. "
            "Suggests the initial answer was rehearsed rather than drawn from genuine experience."
        ),
        "strong_under_pressure": (
            "Candidate maintained or improved answer quality when probed harder. "
            "This is a positive signal — genuine knowledge holds up under pressure."
        ),
    }
    return interpretations.get(
        signal_name,
        f"Signal '{signal_name}' detected — pattern suggests a potential gap between claimed and demonstrated knowledge."
    )


async def synthesize_behavioral_report(
    transcript_lines: list[str],
    answer_scores: list[dict],
    total_duration_sec: int,
    proctoring_events: list[dict],
    contradictions_found: list[dict],
) -> dict[str, Any]:
    engagement = extract_engagement_signals(transcript_lines, total_duration_sec, answer_scores)
    consistency = extract_consistency_signals(transcript_lines, contradictions_found)
    communication = extract_communication_patterns(answer_scores)
    confidence = extract_confidence_indicators(answer_scores)
    integrity = extract_integrity_flags(proctoring_events, answer_scores, contradictions_found)
    consistency_clean = not bool(contradictions_found)
    strengths = extract_strengths_observed(answer_scores, consistency_clean)
    concerns = extract_concerns_noted(answer_scores, contradictions_found, communication)
    hidden_signals = await extract_proctoring_signals(proctoring_events)

    report: dict[str, Any] = {
        "summary": _generate_behavioral_summary(engagement, consistency, communication, integrity, answer_scores),
        "engagement_signals": engagement,
        "consistency_signals": consistency,
        "communication_patterns": communication,
        "confidence_indicators": confidence,
        "integrity_flags": integrity,
        "strengths_observed": strengths,
        "concerns_noted": concerns,
    }

    if hidden_signals:
        report["proctoring_signals_detected"] = hidden_signals

    return report


def _generate_behavioral_summary(
    engagement: list[str],
    consistency: list[str],  # noqa: ARG001
    communication: list[str],
    integrity: list[str],
    answer_scores: list[dict],
) -> str:
    parts = []

    # Engagement
    if any("dropped" in s or "second half" in s for s in engagement):
        parts.append("started strong but faded in the second half of the interview")
    elif any("warmed up" in s for s in engagement):
        parts.append("grew more confident and detailed as the interview progressed")
    elif any("significantly less" in s for s in engagement):
        parts.append("showed limited engagement and gave brief responses throughout")
    else:
        parts.append("maintained consistent participation throughout the session")

    # Answer quality
    if answer_scores:
        avg_score = sum(s.get("overall", 5) for s in answer_scores) / len(answer_scores)
        strong = sum(1 for s in answer_scores if s.get("overall", 0) >= 7)
        weak = sum(1 for s in answer_scores if s.get("overall", 0) <= 3)
        if avg_score >= 7:
            parts.append(f"answer quality was consistently strong across {len(answer_scores)} questions")
        elif avg_score >= 5:
            if strong > weak:
                parts.append(f"delivered a mix of strong and weaker answers — more hits than misses across {len(answer_scores)} questions")
            else:
                parts.append(f"struggled to demonstrate depth on most topics — {weak} of {len(answer_scores)} answers lacked substance")
        else:
            parts.append(f"answer quality was poor overall — thin responses and avoidance of specifics throughout")

    # Communication
    if any("hard to follow" in s or "fragmented" in s for s in communication):
        parts.append("communication was frequently unclear and hard to follow")
    elif any("uneven" in s for s in communication):
        parts.append("communication was clearer on comfortable topics and broke down on harder ones")

    # Integrity
    if any("contradiction" in s.lower() for s in integrity) and not any("no integrity" in s.lower() for s in integrity):
        parts.append("factual inconsistencies were detected that require recruiter follow-up before a decision")
    elif any("concern" in s.lower() or "evasion" in s.lower() for s in integrity):
        parts.append("some behavioral patterns warrant closer review")

    if not parts:
        return "Candidate completed the interview with consistent participation and no major concerns detected."

    summary = "Candidate " + parts[0]
    if len(parts) > 1:
        summary += f", and {parts[1]}"
    if len(parts) > 2:
        summary += f". Additionally: {parts[2]}"
    if len(parts) > 3:
        summary += f" {parts[3]}"
    summary += "."
    return summary