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

_SIGNAL_ANALYSIS_SYSTEM = """You are a senior technical recruiter writing a post-interview brief that a hiring manager will read in 30 seconds to decide whether to move this candidate forward.

You have full access to: every Q&A with per-dimension scores, behavioral signals that fired, proctoring events, inconsistencies, and the transcript.

Write exactly 4 points. Each point covers ONE specific thing — a strength, a gap, a pattern, or an integrity flag. Two sentences max per point. The hiring manager should not need to scroll.

RULES — read these carefully:
1. Every point must name the specific topic or question it is about. Not "when discussing their experience" — say "when asked about the n8n workflow they built" or "on the React state management question".
2. Include what the candidate actually said or did. Quote a phrase or describe the exact behavior. No paraphrasing into abstractions.
3. If the candidate struggled: say what broke down (gave only surface-level steps, couldn't explain why they made a decision, needed 4 follow-ups before answering, said "I don't remember" to a project on their own resume).
4. If they were strong: say what made it strong (gave numbers, named specific tools, walked through their own decision without being prompted, corrected themselves mid-answer).
5. If proctoring flags exist: name the event type, how many times, and whether it correlates with a suspiciously better or worse answer.
6. If no real weakness exists, don't invent one. If no real strength exists, don't fabricate one.
7. NEVER write: "demonstrated strong communication", "showed good problem-solving skills", "the candidate exhibited", "overall performance was", or any sentence that could apply to any candidate in any interview.
8. Do NOT mention score numbers or dimension names.

Output ONLY a JSON array of exactly 4 strings. No object wrapper, no markdown.
["Point one.", "Point two.", "Point three.", "Point four."]"""


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

    # Q&A with behavioral signals inline — main evidence block
    qa_lines = []
    for s in answer_scores:
        if s.get("is_warmup"):
            continue
        topic = s.get('topic') or "unknown topic"
        question = str(s.get('question', '')).strip()[:220]
        answer = str(s.get('answer', '')).strip()[:400]
        depth = s.get('depth', '?')
        specificity = s.get('specificity', '?')
        grounding = s.get('grounding', '?')
        signals = s.get("signals", [])
        concerns = s.get("concerns", [])

        block = (
            f"  TOPIC: {topic}\n"
            f"    Q: {question}\n"
            f"    A: {answer}\n"
            f"    [depth={depth} specificity={specificity} grounding={grounding}]"
        )
        if signals:
            block += f"\n    SIGNALS: {', '.join(signals)}"
        if concerns:
            block += f"\n    CONCERNS: {', '.join(concerns)}"
        qa_lines.append(block)
    if qa_lines:
        parts.append("QUESTION & ANSWER LOG\n" + "\n\n".join(qa_lines))

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
            temperature=0.2,
            max_tokens=1000,
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
