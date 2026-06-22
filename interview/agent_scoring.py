"""
agent_scoring.py
Single LLM call per turn: scores the answer AND detects ONE signal with a reason.
The signal is LLM-detected — it reads the full conversation and understands context,
not pattern-matching on "we" tokens or word counts.

Returns:
  quality scores  : clarity, depth, specificity, grounding, overall
  routing         : action (PROBE/MOVE_ON)
  signal          : one signal name + the exact reason it fired (or null if none)
"""
from __future__ import annotations
import asyncio
import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger("interview-agent")
from interview.agent_runtime_support import EVAL_LLM_MODEL, EVAL_TEMPERATURE


# ---------------------------------------------------------------------------
# Signal definitions — what each signal means and what it maps to.
# Used here to train the scoring LLM. Also imported by probe_strategy.py.
# ---------------------------------------------------------------------------
SIGNAL_DEFINITIONS = {
    "ownership_ambiguous": {
        "description": "Candidate described work using 'we/team/they' throughout without ever saying what THEY specifically did. Their personal contribution is unclear.",
        "example": "We built the pipeline, the team decided on the architecture, they handled deployment.",
        "not_this": "Candidate said 'I designed X' or 'my role was Y' — that's clear ownership, do NOT fire.",
    },
    "example_evaded": {
        "description": "Interviewer asked for a specific example, story, or instance. Candidate responded with general theory, 'usually I...', 'typically we...', or described a type of thing rather than one real moment.",
        "example": "Q: Tell me about a time you built an automation. A: Usually I start by mapping the requirements and then...",
        "not_this": "Candidate gave a vague but real answer — even if short. Only fire if they clearly dodged the specific-instance request.",
    },
    "depth_insufficient": {
        "description": "Candidate said WHAT they did or built, but never explained HOW or WHY. The mechanics, decisions, and reasoning are completely absent.",
        "example": "I built a lead qualification system using n8n. It worked well.",
        "not_this": "Do NOT fire if candidate explained even one real decision or step. Only fire if it's purely WHAT with zero HOW.",
    },
    "surface_answer": {
        "description": "Answer is correct but entirely hollow — no specific names, no numbers, no real texture. Could have been said by anyone who read a Wikipedia article about the topic.",
        "example": "I used automation tools to qualify leads based on certain criteria and it helped the client.",
        "not_this": "Do NOT fire if ANY specific tool, metric, date, or real detail was named. Only fire when it's all generic.",
    },
    "tech_claim_unverified": {
        "description": "Candidate named a specific technology or tool (e.g. n8n, Zapier, DuckDB) but their description of it was vague, incorrect, or showed no real hands-on knowledge.",
        "example": "I used n8n for the automation. n8n is basically a workflow tool that connects things.",
        "not_this": "Do NOT fire if they described what they actually DID with the tool, even briefly. Only fire when the tool is named but usage is hollow.",
    },
    "new_tech_thread": {
        "description": "Candidate mentioned a tool, technology, or approach that was NOT on their resume and NOT in the job description. This is an unprompted reveal — worth following.",
        "example": "I also tried using Instantly for the outreach part which wasn't in the original plan.",
        "not_this": "Only fire if the tool is genuinely new/unexpected. Do NOT fire for tools already listed in the resume or JD.",
    },
    "claim_not_demonstrated": {
        "description": "Candidate made a strong claim about themselves ('I'm good at automation', 'I handled the whole pipeline', 'I always think about the user') but nothing they said before or after supports it with real evidence.",
        "example": "I'm really strong with data analysis and I always make data-driven decisions. [No numbers, no examples anywhere in the answer.]",
        "not_this": "Do NOT fire if the claim is backed by even one concrete example or number in the same answer.",
    },
}

# Priority order — if the LLM sees multiple signals, it picks the highest priority one.
SIGNAL_PRIORITY = [
    "tech_claim_unverified",    # 1 — catches dishonesty early
    "claim_not_demonstrated",   # 2 — unsupported assertion
    "ownership_ambiguous",      # 3 — credit clarity
    "example_evaded",           # 4 — most common dodge
    "depth_insufficient",       # 5 — answered WHAT not HOW
    "surface_answer",           # 6 — correct but hollow
    "new_tech_thread",          # 7 — positive, follow the thread
]


def _build_signal_prompt_block() -> str:
    """Builds the signal definitions block for the LLM scoring prompt."""
    lines = [
        "-- SIGNALS --",
        "Detect at most ONE signal. Pick the highest-priority one that clearly fired.",
        "If none clearly fired, return signal: null and signal_reason: null.",
        "",
        "Priority order (if multiple seem to apply, pick the first one in this list):",
    ]
    for i, name in enumerate(SIGNAL_PRIORITY, 1):
        defn = SIGNAL_DEFINITIONS[name]
        lines.append(f"\n{i}. {name}")
        lines.append(f"   WHAT IT MEANS: {defn['description']}")
        lines.append(f"   EXAMPLE: {defn['example']}")
        lines.append(f"   DO NOT FIRE IF: {defn['not_this']}")
    lines += [
        "",
        "signal_reason: quote the EXACT words from their answer that caused the signal to fire.",
        "  Good: \"we built the pipeline, the team decided\" (3-10 words from their actual answer)",
        "  Bad:  \"candidate used team language\" (your description, not their words)",
        "If signal is null, signal_reason must also be null.",
    ]
    return "\n".join(lines)


async def evaluate_answer(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    transcript_lines: list,
    client,
    org_id: Optional[str] = None,
    llm_model: str = EVAL_LLM_MODEL,
    is_warmup: bool = False,
    candidate_band: str = "mid",
    active_topic: str = "",
    topic_importance: str = "HIGH",
    topic_tag: str = "RESUME_TOPIC",
    topic_probe_focus: list | None = None,
    job_title: str = "",
) -> dict:
    """
    Single merged LLM call: scores answer quality + detects one signal with reason.

    Returns:
      clarity, depth, specificity, grounding, overall  — quality scores
      action       — PROBE | MOVE_ON
      signal       — one of the 7 signal names, or null
      signal_reason — exact quote from their answer that triggered it, or null
      reason       — short phrase for the routing decision
    """
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "is_warmup": True,
            "action": "MOVE_ON", "signal": None, "signal_reason": None, "reason": "warmup turn",
        }

    if not candidate_answer or not candidate_answer.strip():
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "action": "MOVE_ON", "signal": None, "signal_reason": None, "reason": "empty answer",
        }

    # Short explicit denial — zero scores, no signal, MOVE_ON
    _denial_re = re.compile(
        r"^(no\.?\s*)?(i\s+)?(don'?t|do not|can'?t|cannot|didn'?t|did not|never|haven'?t|have not)\s+"
        r"(remember|recall|know|do|work on|build|make|create|used|worked|done|tried)?"
        r"(\s*(it|that|this|anything))?\s*[.!?]*$",
        re.IGNORECASE,
    )
    _answer_stripped = candidate_answer.strip().lower()
    if len(candidate_answer.split()) <= 10 and _denial_re.match(_answer_stripped):
        logger.info("[EVAL] short-circuit: denial detected (%r)", candidate_answer[:60])
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "action": "MOVE_ON", "signal": None, "signal_reason": None, "reason": "explicit denial",
        }

    word_count = len(candidate_answer.strip().split())
    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""

    _followup_cutoff = {"fresher": 2, "mid": 3, "experienced": 5, "senior": 6}.get(candidate_band, 3)
    _band_note = {
        "fresher": (
            "FRESHER — score generously on grounding (limited work history).\n"
            "MOVE_ON if they showed they understand WHY they made a choice, even simply.\n"
            "Do NOT expect tradeoffs, scale, or architecture depth."
        ),
        "mid": (
            "MID-LEVEL — expect clear ownership and at least one real decision.\n"
            "MOVE_ON if they named what was specifically theirs and gave one concrete detail."
        ),
        "experienced": (
            "EXPERIENCED — expect depth, specifics, and real tradeoffs.\n"
            "Do NOT MOVE_ON on vague answers. MOVE_ON only when you have a real tradeoff or metric."
        ),
        "senior": (
            "SENIOR — expect strategic judgment and high-stakes decisions.\n"
            "MOVE_ON only when you have evidence of real judgment under pressure."
        ),
    }.get(candidate_band, "Probe for real ownership and specific decisions.")

    _signal_block = _build_signal_prompt_block()

    logger.info(
        "[EVAL] > evaluate_answer | model=%s words=%d follow_ups=%d topic=%s",
        llm_model, word_count, topic_follow_up_count, active_topic or "?",
    )

    try:
        stream = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=EVAL_TEMPERATURE,
                max_tokens=200,
                stream=True,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You score a candidate interview answer and detect the ONE most important signal.\n"
                            "Output ONLY valid JSON with exactly these fields:\n"
                            "{\n"
                            '  "clarity": 0-10,\n'
                            '  "depth": 0-10,\n'
                            '  "specificity": 0-10,\n'
                            '  "grounding": 0-10,\n'
                            '  "action": "PROBE" or "MOVE_ON",\n'
                            '  "signal": "<signal_name>" or null,\n'
                            '  "signal_reason": "<exact quote from their answer>" or null,\n'
                            '  "reason": "one short phrase from their answer that drove your call"\n'
                            "}\n\n"
                            f"-- INTERVIEW CONTEXT --\n"
                            f"Role: {job_title or 'not specified'}\n"
                            f"Topic: {active_topic or 'general'}\n"
                            f"Topic importance: {topic_importance}\n"
                            f"Topic tag: {topic_tag}\n"
                            + (f"Probe focus: {', '.join(topic_probe_focus)}\n" if topic_probe_focus else "")
                            + "\nTag-based scoring:\n"
                            "  RESUME_TOPIC: candidate claims direct experience — score depth and grounding hard.\n"
                            "  JD_TOPIC: candidate may not know this — credit partial exposure fairly.\n"
                            "  ROLE_TOPIC: conceptual check — one grounded answer is enough to MOVE_ON.\n\n"
                            "-- THE 4 SCORES --\n"
                            "clarity (0-10): Is the answer easy to follow?\n"
                            "  0-2 disconnected | 3-5 followable but jumpy | 6-8 clear | 9-10 precise\n\n"
                            "depth (0-10): Did they explain WHY or HOW, not just WHAT?\n"
                            "  0-2 stated a fact | 3-5 some reasoning | 6-8 real decision/tradeoff | 9-10 cause-effect chain\n\n"
                            "specificity (0-10): Real names, tools, numbers, dates?\n"
                            "  0-2 completely generic | 3-5 vague | 6-8 named at least one real tool/metric | 9-10 names+numbers+timeline\n"
                            "  Count EVERY real named tool. A named comparison ('X over Y') = specificity >= 6.\n\n"
                            "grounding (0-10): Does this sound like real lived work?\n"
                            "  0-2 pure theory | 3-5 plausible | 6-8 clearly from real experience | 9-10 rich imperfect detail\n"
                            "  A real opinion from usage ('DuckDB used less storage') = grounding >= 5.\n\n"
                            "FAIRNESS: This is voice-transcribed speech. Do NOT penalise bad grammar or filler words.\n"
                            "Score the CONTENT. Extract substance from disfluent speech before scoring.\n\n"
                            "-- ROUTING --\n"
                            "PROBE — more can be pulled. Required when depth < 6 or grounding < 5 on RESUME_TOPIC.\n"
                            "MOVE_ON — only when: depth >= 7 AND specificity >= 7 AND grounding >= 6,\n"
                            "  OR for CRITICAL topics depth >= 8, OR candidate genuinely cannot answer.\n\n"
                            f"-- BAND: {candidate_band.upper()} --\n"
                            f"{_band_note}\n\n"
                            f"{_signal_block}\n\n"
                            "RULES:\n"
                            "  - Score THIS answer only, not the candidate overall\n"
                            "  - reason quotes actual words from their answer (max 8 words)\n"
                            "  - signal and signal_reason are both null when action=MOVE_ON\n"
                            "  - signal_reason must be a direct quote from their answer, not your summary"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION: {last_question}\n\n"
                            f"ANSWER: {candidate_answer}\n\n"
                            f"FOLLOW-UPS ON THIS TOPIC SO FAR: {topic_follow_up_count}\n\n"
                            f"RECENT CONVERSATION (last 3 exchanges):\n{recent_context}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
                stream_options={"include_usage": True},
                store=True,
                metadata={
                    "call_type": "eval_scoring",
                    "band": candidate_band,
                    "topic_importance": topic_importance,
                    "org_id": org_id or "",
                },
            ),
            timeout=8.0,
        )

        raw = ""
        _usage = None
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                raw += chunk.choices[0].delta.content
            if chunk.usage:
                _usage = chunk.usage

        from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
        # _usage is chunk.usage (not the full completion), so pass it as the
        # completion arg — extract_usage reads .prompt_tokens/.completion_tokens
        # directly when .usage is absent (falls back to the object itself).
        _eval_llm_usage = _extract_usage(_usage, llm_model) if _usage else {
            "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
        }

        data: dict[str, Any] = json.loads(raw)

        def _clamp(v: Any, lo: float = 0.0, hi: float = 10.0) -> float:
            try:
                return max(lo, min(hi, float(v)))
            except (TypeError, ValueError):
                return 0.0

        clarity     = _clamp(data.get("clarity", 0))
        depth       = _clamp(data.get("depth", 0))
        specificity = _clamp(data.get("specificity", 0))
        grounding   = _clamp(data.get("grounding", 0))
        overall = (
            clarity * 0.20
            + depth * 0.35
            + specificity * 0.30
            + grounding * 0.15
        )

        action = str(data.get("action", "PROBE")).upper()
        if action not in ("PROBE", "MOVE_ON"):
            action = "PROBE"

        # Validate signal against our 7 defined signals
        raw_signal = data.get("signal")
        signal = str(raw_signal).strip() if raw_signal else None
        if signal and signal not in SIGNAL_DEFINITIONS:
            logger.warning("[EVAL] unknown signal %r — ignoring", signal)
            signal = None

        signal_reason = str(data.get("signal_reason") or "").strip() or None
        if signal is None:
            signal_reason = None
        if action == "MOVE_ON":
            signal = None
            signal_reason = None

        reason = str(data.get("reason", ""))[:120]

        logger.info(
            "[EVAL] [OK] action=%s signal=%s | clarity=%d depth=%d spec=%d ground=%d | reason=%s",
            action, signal or "none",
            int(clarity), int(depth), int(specificity), int(grounding),
            repr(reason),
        )
        if signal:
            logger.info("[EVAL] signal_reason=%r", signal_reason)

        return {
            "clarity": clarity, "depth": depth,
            "specificity": specificity, "grounding": grounding,
            "overall": overall,
            "action": action,
            "signal": signal,
            "signal_reason": signal_reason,
            "reason": reason,
            "_llm_usage": _eval_llm_usage,
        }

    except (asyncio.TimeoutError, Exception) as e:
        _is_timeout = isinstance(e, asyncio.TimeoutError)
        logger.error(
            "[EVAL] evaluate_answer %s (%s) — returning low-confidence recovery",
            "timed out" if _is_timeout else "failed", e,
        )
        return {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
            "overall": 1.3,
            "action": "PROBE",
            "signal": "depth_insufficient",
            "signal_reason": "eval recovery — answer was too thin to score",
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }
