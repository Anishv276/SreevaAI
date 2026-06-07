"""
Signal analysis via LLM — feeds every signal, Q&A score, and transcript into a
single prompt and returns 4-5 plain-language analysis points for the HR team.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_SIGNAL_ANALYSIS_SYSTEM = """You are a senior HR analyst writing a post-interview signal analysis for a hiring team.

You will receive the full picture of what happened during the interview:
- Every question asked and the candidate's answer with scores (clarity, depth, specificity, grounding, 0-10)
- Every behavioral signal that fired (ownership language, evasion, follow-up collapse, etc.) with turn numbers
- Proctoring events (tab switches, camera issues, face detection, etc.)
- Factual inconsistencies detected during the interview
- Session duration and participation stats

Write 4 to 5 analysis points. Each point is 2-3 sentences. Together they give the HR team a complete picture of what this candidate was actually like during the evaluation.

Rules:
- Write like a smart colleague briefing the hiring manager — direct, specific, no corporate fluff
- Each point must be grounded in actual evidence from the data (specific topic, specific question content, specific signal)
- NEVER say "turn 3" or "turn 7" — always reference by topic or question content e.g. "when asked about data pipelines" or "during the system design question"
- Cover what matters: how they spoke, how deep their answers were, whether they owned their experience, any integrity flags, how they handled pressure
- If something looked suspicious (tab switch before a suspiciously good answer, identity flag, inconsistency), say it plainly
- If they were genuinely strong, say that too with the evidence
- Do NOT use section headers or labels — just the points as a plain array of strings
- Do NOT mention score numbers or metric names — describe what you observed in plain language

Output ONLY a JSON array of 4-5 strings. No keys, no object wrapper, just the array.
Example shape: ["Point one here.", "Point two here.", "Point three here.", "Point four here."]"""


def _build_prompt(
    transcript_lines: list[str],
    answer_scores: list[dict],
    total_duration_sec: int,
    proctoring_events: list[dict],
    inconsistencies_found: list[dict],
) -> str:
    parts: list[str] = []

    # Session metadata
    mins = total_duration_sec // 60
    candidate_turns = sum(1 for l in transcript_lines if l.startswith("Candidate:"))
    ai_turns = sum(1 for l in transcript_lines if l.startswith("Interviewer:") or l.startswith("AI:"))
    parts.append(
        f"SESSION\nDuration: {mins} min | Candidate turns: {candidate_turns} | "
        f"Interviewer turns: {ai_turns} | Scored answers: {len([s for s in answer_scores if not s.get('is_warmup')])}"
    )

    # Proctoring events
    if proctoring_events:
        grouped: dict[str, list[dict]] = {}
        for ev in proctoring_events:
            name = ev.get("signal_name") or ev.get("eventType") or ev.get("event") or "unknown"
            grouped.setdefault(name, []).append(ev)
        lines = []
        # Build a turn->topic lookup from answer_scores
        turn_to_topic = {s.get("turn"): s.get("topic", "") for s in answer_scores if s.get("turn") and s.get("topic")}
        for name, evs in grouped.items():
            turns = sorted({e.get("turn", 0) for e in evs if e.get("turn")})
            topics = [turn_to_topic[t] for t in turns if t in turn_to_topic]
            topic_str = ", ".join(f'"{t}"' for t in topics[:3]) if topics else ""
            evidence = "; ".join(e.get("evidence", "") for e in evs[:2] if e.get("evidence"))
            location = f"during {topic_str}" if topic_str else f"at turns {turns}"
            lines.append(f"  {name} x{len(evs)} {location}" + (f" — {evidence}" if evidence else ""))
        parts.append("PROCTORING EVENTS\n" + "\n".join(lines))
    else:
        parts.append("PROCTORING EVENTS\nNone.")

    # Inconsistencies
    if inconsistencies_found:
        lines = []
        for inc in inconsistencies_found[:4]:
            c_type = str(inc.get("type") or inc.get("inconsistency_type") or "claim").replace("_", " ")
            old_v = inc.get("old_value", "earlier statement")
            new_v = inc.get("new_value", "later statement")
            resolved = inc.get("status") == "resolved" or inc.get("resolved", False)
            lines.append(f"  {c_type}: '{old_v}' → '{new_v}' ({'resolved' if resolved else 'UNRESOLVED'})")
        parts.append("INCONSISTENCIES\n" + "\n".join(lines))
    else:
        parts.append("INCONSISTENCIES\nNone detected.")

    # Behavioral signals summary
    behavioral: list[str] = []
    for s in answer_scores:
        topic = s.get('topic') or f"question about {str(s.get('question',''))[:60]}"
        for sig in s.get("signals", []):
            behavioral.append(f"  [{topic}] — {sig} (score: {s.get('overall','?')}/10)")
        for concern in s.get("concerns", []):
            behavioral.append(f"  [{topic}] — concern: {concern}")
    if behavioral:
        parts.append("BEHAVIORAL SIGNALS\n" + "\n".join(behavioral))

    # Q&A with scores
    qa_lines = []
    for s in answer_scores:
        if s.get("is_warmup"):
            continue
        qa_lines.append(
            f"  Topic: {s.get('topic','?')} | overall {s.get('overall','?')}/10\n"
            f"    Q: {str(s.get('question',''))[:180]}\n"
            f"    A: {str(s.get('answer',''))[:280]}\n"
            f"    clarity={s.get('clarity','?')} depth={s.get('depth','?')} "
            f"specificity={s.get('specificity','?')} grounding={s.get('grounding','?')}"
        )
    if qa_lines:
        parts.append("QUESTION & ANSWER SCORES\n" + "\n".join(qa_lines))

    # Transcript tail
    if transcript_lines:
        full = "\n".join(transcript_lines)
        excerpt = full[-3000:] if len(full) > 3000 else full
        parts.append(f"TRANSCRIPT (recent portion)\n{excerpt}")

    return "\n\n".join(parts)


async def generate_signal_analysis(
    transcript_lines: list[str],
    answer_scores: list[dict],
    total_duration_sec: int,
    proctoring_events: list[dict],
    inconsistencies_found: list[dict],
) -> tuple[dict[str, Any], list[dict]]:
    """
    Returns (signal_analysis_dict, llm_usages).
    signal_analysis_dict: { "points": list[str] }
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.warning("[SIGNAL_ANALYSIS] Skipping: missing OPENAI_API_KEY")
        return {"points": []}, []

    prompt_content = _build_prompt(
        transcript_lines, answer_scores, total_duration_sec,
        proctoring_events, inconsistencies_found,
    )

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)

        response = await client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": _SIGNAL_ANALYSIS_SYSTEM},
                {"role": "user",   "content": prompt_content},
            ],
            temperature=0.3,
            max_tokens=800,
        )

        usage = getattr(response, "usage", None)
        llm_usage = {
            "model": "gpt-4.1-mini",
            "inputTokens":       int(getattr(usage, "prompt_tokens", 0) or 0),
            "outputTokens":      int(getattr(usage, "completion_tokens", 0) or 0),
            "cachedInputTokens": int(getattr(
                getattr(usage, "prompt_tokens_details", None), "cached_tokens", 0
            ) or 0),
        }

        raw_text = (response.choices[0].message.content or "").strip()
        # Parse — the model returns a plain JSON array
        try:
            parsed = json.loads(raw_text)
            if isinstance(parsed, list):
                points = [str(p).strip() for p in parsed if p]
            elif isinstance(parsed, dict) and parsed:
                # Fallback: model returned an object, flatten values
                points = [str(v).strip() for v in parsed.values() if v]
            else:
                points = []
        except Exception:
            # Last resort: split on newlines if JSON parse fails
            points = [l.strip().lstrip("-•").strip() for l in raw_text.splitlines() if len(l.strip()) > 20]

        result = {"points": points[:5]}
        logger.info(f"[SIGNAL_ANALYSIS] {len(result['points'])} points, tokens={llm_usage['inputTokens']}+{llm_usage['outputTokens']}")
        return result, [llm_usage]

    except Exception as e:
        logger.error(f"[SIGNAL_ANALYSIS] LLM call failed: {e}", exc_info=True)
        return {"points": []}, []
