"""
agent_scoring.py
AFTER (1 merged LLM call, ~700ms total):
  Call AB -> evaluate_answer()          -> {clarity:7, depth:4, ..., action: PROBE, probe_mode: ownership}
  One round-trip returns BOTH quality scores AND routing decision.
#   Saturation, weak_exit, time_pressure still get quality scores -- nothing removed.
#   turn_evaluator.py no longer needs asyncio.gather() for these two tasks.
#
# EXAMPLE:
#   Candidate says: "We built a REST API using FastAPI"
#   AFTER:  Single call scores clarity=6,depth=3 AND sees "we built" -> PROBE ownership.
#   Result is identical. Latency drops ~800ms.
# -----------------------------------------------------------------------------
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Any, Optional
logger = logging.getLogger("interview-agent")
from interview.agent_runtime_support import EVAL_LLM_MODEL, EVAL_TEMPERATURE
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
    job_title: str = "",
) -> dict:
    """
    Single merged LLM call: scores answer quality AND decides PROBE/MOVE_ON.
    Returns:
      Quality scores: clarity, depth, specificity, grounding, overall
      Routing:        action, probe_mode, reason
    """
    # Warmup turns skip scoring -- return zeroed quality + safe routing default
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
            "overall": 0.0,
            "is_warmup": True,
            "action": "MOVE_ON", "probe_mode": None,
            "reason": "warmup turn",
        }
    # Empty answer -- no LLM call needed
    if not candidate_answer or not candidate_answer.strip():
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
            "overall": 0.0,
            "action": "MOVE_ON", "probe_mode": None,
            "reason": "empty answer",
        }
    # Explicit denial / zero-information utterance -- short-circuit scoring.
    # Feeding these to the LLM causes clarity=10 for grammatically clean denials
    # ("No. I don't remember anything.") which inflates saturation by ~36%.
    # Any utterance that is ONLY a denial with no content scores 0 across all dims.
    _denial_patterns = (
        r"^(no\.?\s*)?(i\s+)?(don'?t|do not|can'?t|cannot)\s+(remember|recall|know)\s*(anything|it|that|this)?\s*[.!?]*$",
        r"^(no\.?\s*)?(i\s+)?(didn'?t|did not)\s+(do|work on|build|make|create)\s*(it|that|this|anything)?\s*[.!?]*$",
        r"^(no\.?\s*)?(i\s+)?(never|haven'?t|have not|hadn'?t|had not)\s+(used|worked|done|tried)\s*(it|that|this)?\s*[.!?]*$",
        r"^(i\s+)?don'?t\s+know\s*[.!?]*$",
        r"^.+\s+is\s+not\s+(?:my\s+)?(?:core\s+)?skill\s*[.!?]*$",
        r"^(?:it|that|this)\s+is\s+not\s+(?:my\s+)?(?:core\s+)?skill\s*[.!?]*$",
        r"^(no\.?\s*){1,3}[.!?]*$",
    )
    import re as _re_scoring
    _answer_stripped = candidate_answer.strip().lower()
    if (
        len(candidate_answer.split()) <= 10
        and any(_re_scoring.match(p, _answer_stripped) for p in _denial_patterns)
    ):
        logger.info(
            "[EVAL] short-circuit: denial/null utterance detected (%r) -- returning zero scores",
            candidate_answer[:60],
        )
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
            "overall": 0.0,
            "action": "MOVE_ON", "probe_mode": None,
            "reason": "explicit denial / no information provided",
        }
    word_count = len(candidate_answer.strip().split())
    # Use last 6 lines (3 Q&A pairs) — sufficient context for scoring, reduces eval LLM prefill.
    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""
    # Log before the LLM call so you can see it started in the terminal.
    # If this log appears but [EVAL] DONE never follows, the LLM call hung.
    logger.info(
        "[EVAL] > merged evaluate_answer | model=%s words=%d follow_ups=%d topic=%s",
        llm_model, word_count, topic_follow_up_count, active_topic or "?",
    )
    # Band-aware follow-up cutoff: how many turns before the LLM judge biases to MOVE_ON.
    # Saturation system is the primary gatekeeper, but the LLM judge needs a matching signal.
    # Fresher: move after 2 (breadth). Mid: 3. Experienced: 5. Senior: 6.
    _followup_cutoff = {"fresher": 2, "mid": 3, "experienced": 5, "senior": 6}.get(candidate_band, 3)
    # Band-aware scoring bar: what counts as "good enough" to MOVE_ON at each level.
    _band_scoring_note = {
        "fresher": (
            "FRESHER candidate -- score generously on grounding (they have limited work history).\n"
            "MOVE_ON if they showed they understand WHY they made a choice, even simply.\n"
            "Do NOT expect tradeoffs, scale, or architecture depth."
        ),
        "mid": (
            "MID-LEVEL candidate -- expect clear ownership and at least one real decision.\n"
            "MOVE_ON if they named what was specifically theirs and gave one concrete detail.\n"
            "Push back on 'we' language once -- if still vague, MOVE_ON."
        ),
        "experienced": (
            "EXPERIENCED candidate -- expect depth, specifics, and real tradeoffs.\n"
            "Do NOT MOVE_ON on vague answers -- probe harder. A clean story with no friction is a red flag.\n"
            "MOVE_ON only when you have a real tradeoff, a consequence, or a specific metric."
        ),
        "senior": (
            "SENIOR candidate -- expect strategic judgment, org impact, high-stakes decisions.\n"
            "Polished generic answers are not enough -- push for what actually went wrong or what they'd change.\n"
            "MOVE_ON only when you have evidence of real judgment under pressure, not just competence."
        ),
    }.get(candidate_band, "Probe for real ownership and specific decisions.")
    try:
        # Stream to get first token in ~50-100ms instead of waiting for full response
        stream = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=EVAL_TEMPERATURE,
                max_tokens=150,
                stream=True,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You score a candidate interview answer and decide the next interviewing move.\n"
                            "Output ONLY valid JSON with exactly these 7 fields:\n"
                            "{\n"
                            '  "clarity": 0-10,\n'
                            '  "depth": 0-10,\n'
                            '  "specificity": 0-10,\n'
                            '  "grounding": 0-10,\n'
                            '  "action": "PROBE" or "MOVE_ON",\n'
                            '  "probe_mode": "ownership"|"depth"|"authenticity"|"pressure"|"clarification"|null,\n'
                            '  "reason": "one short phrase from their answer that drove your call"\n'
                            "}\n\n"
                            f"-- INTERVIEW CONTEXT --\n"
                            f"Role being hired for: {job_title or 'not specified'}\n"
                            f"Topic being evaluated: {active_topic or 'general'}\n"
                            f"Topic importance: {topic_importance} (CRITICAL = must go deep, LOW = breadth is fine)\n\n"
                            "Use this context to judge whether the candidate's answer is appropriate for the role and topic.\n"
                            "A strong answer on a CRITICAL topic must show real domain knowledge -- not just communication skill.\n"
                            "If the answer is technically incorrect or misunderstands the topic, penalise depth and grounding.\n\n"
                            "-- THE 4 SCORES --\n"
                            "All 4 scores feed directly into the saturation system that decides when to change topics.\n"
                            "Score what they actually said -- not what they could have said.\n\n"
                            "clarity (0-10) -- Is the answer easy to follow?\n"
                            "  0-2: disconnected, hard to parse\n"
                            "  3-5: followable but jumps around or trails off\n"
                            "  6-8: clear structure, logical flow\n"
                            "  9-10: precise, concise, logically tight\n\n"
                            "depth (0-10) -- Did they explain WHY or HOW, not just WHAT?\n"
                            "  0-2: stated a fact with zero reasoning\n"
                            "  3-5: some reasoning, no tradeoffs\n"
                            "  6-8: explained a real decision or tradeoff\n"
                            "  9-10: cause-effect chain, edge cases, consequences named\n\n"
                            "specificity (0-10) -- Real names, tools, numbers, dates?\n"
                            "  0-2: completely generic ('we used a tool', 'some time ago')\n"
                            "  3-5: vague references, no real names or numbers\n"
                            "  6-8: named at least one real tool, project, metric, or date\n"
                            "  9-10: specific names + numbers + timeline present\n"
                            "  IMPORTANT: count EVERY real named tool/technology/product even in a messy or\n"
                            "  rambling answer. 'DuckDB vs MySQL and Supabase' = three real tools = specificity >= 6.\n"
                            "  A named comparison ('X over Y because...') is concrete -- score it 6+, not 1-2.\n\n"
                            "grounding (0-10) -- Does this sound like real lived work?\n"
                            "  0-2: pure theory, could be copied from docs\n"
                            "  3-5: plausible but could be anyone\n"
                            "  6-8: clearly from real experience, has texture\n"
                            "  9-10: rich imperfect detail only someone who did it would know\n"
                            "  IMPORTANT: a real opinion formed from usage ('DuckDB used less storage than MySQL')\n"
                            "  is lived experience -- score grounding >= 5 even if phrased clumsily.\n\n"
                            "SCORING FAIRNESS (CRITICAL -- this is voice-transcribed speech):\n"
                            "  - Do NOT penalise specificity or grounding for bad grammar, filler words, or\n"
                            "    transcription noise ('the thing is why I use the activity'). Score the CONTENT.\n"
                            "  - If the candidate clearly names real tools or gives a real reason, the messy\n"
                            "    delivery only lowers CLARITY -- not specificity or grounding.\n"
                            "  - Extract the substance from disfluent speech before scoring.\n\n"
                            "-- ROUTING --\n"
                            "Your action tells the system whether this answer gave enough signal or needs more digging.\n"
                            "The saturation system handles when to change topics -- your job is to say what to do NEXT.\n\n"
                            "PROBE -- when more can be pulled from this answer. Pick probe_mode based on what is weakest:\n"
                            "  ownership     -- grounding or specificity low, heavy 'we' language, HOW is unknown\n"
                            "  depth         -- specificity ok but depth low, no tradeoff, metric, or real reasoning\n"
                            "  authenticity  -- sounds rehearsed, shallower than their first answer, claimed skill not shown\n"
                            "  pressure      -- story is too clean, no friction, mistake, or hard moment mentioned\n"
                            "  clarification -- contradicts something said earlier, or answers are getting shorter each turn\n\n"
                            "MOVE_ON -- only when this answer genuinely covered the topic:\n"
                            "  - depth >= 7 AND specificity >= 7 AND grounding >= 6 (real, specific, reasoned answer)\n"
                            "  - For CRITICAL topics: require depth >= 8 -- a polished answer is not enough, need real domain knowledge\n"
                            "  - OR the candidate clearly cannot answer this (said I don't know / I didn't do that)\n"
                            "  probe_mode must be null when action=MOVE_ON\n\n"
                            f"-- BAND: {candidate_band.upper()} --\n"
                            f"{_band_scoring_note}\n\n"
                            "RULES:\n"
                            "  - Score THIS answer only -- not the candidate overall\n"
                            "  - reason must quote actual words from their answer (max 8 words)\n"
                            "  - probe_mode is required when action=PROBE, null when action=MOVE_ON"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION: {last_question}\n\n"
                            f"ANSWER: {candidate_answer}\n\n"
                            f"FOLLOW-UPS ON THIS TOPIC SO FAR: {topic_follow_up_count}\n\n"
                            f"RECENT TRANSCRIPT (last 3 exchanges -- use to detect collapse or contradiction):\n{recent_context}"
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
            timeout=8.0,  # Inner LLM call. MUST be < eval wrapper (10s) < LLM gate (12s).
        )
        # Collect streamed chunks and capture final usage
        raw = ""
        _usage = None
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                raw += chunk.choices[0].delta.content
            if chunk.usage:
                _usage = chunk.usage
        _eval_llm_usage = {
            "model": llm_model,
            "inputTokens": int(getattr(_usage, "prompt_tokens", 0) or 0) if _usage else 0,
            "outputTokens": int(getattr(_usage, "completion_tokens", 0) or 0) if _usage else 0,
            "cachedInputTokens": int(getattr(getattr(_usage, "prompt_tokens_details", None), "cached_tokens", 0) or 0) if _usage else 0,
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
        # Weighted to match ResponseScoreCalculator in eval_pipeline -- same number
        # drives both the log and the saturation contribution calculation.
        overall = (
            clarity * 0.20
            + depth * 0.35
            + specificity * 0.30
            + grounding * 0.15
        )
        action = str(data.get("action", "PROBE")).upper()
        if action not in ("PROBE", "MOVE_ON"):
            action = "PROBE"
        # Validate probe_mode against our 5 families + legacy aliases
        _VALID_FAMILIES = {"ownership", "depth", "authenticity", "pressure", "clarification"}
        _LEGACY_MAP = {
            "process": "ownership", "evidence": "authenticity",
            "verification": "authenticity", "compression": "clarification",
            "outcome": "depth", "alternatives": "depth",
            "failure": "pressure", "situational": "pressure", "behavioral": "pressure",
        }
        raw_mode = str(data.get("probe_mode") or "").strip().lower()
        if raw_mode in _VALID_FAMILIES:
            probe_mode = raw_mode
        elif raw_mode in _LEGACY_MAP:
            probe_mode = _LEGACY_MAP[raw_mode]  # remap old names gracefully
        elif action == "MOVE_ON":
            probe_mode = None
        else:
            probe_mode = "ownership"  # safe default
        reason = str(data.get("reason", ""))[:120]
        logger.info(
            "[EVAL] [OK] action=%s probe=%s | "
            "clarity=%d depth=%d specificity=%d grounding=%d | reason=%s",
            action, probe_mode,
            int(clarity), int(depth), int(specificity), int(grounding),
            repr(reason),
        )
        return {
            "clarity": clarity, "depth": depth,
            "specificity": specificity, "grounding": grounding,
            "overall": overall,
            "action": action, "probe_mode": probe_mode,
            "reason": reason,
            "_llm_usage": _eval_llm_usage,
        }
    except (asyncio.TimeoutError, Exception) as e:
        # RECOVERY OWNED BY EVAL -- never raise to the agent.
        # The agent depends ONLY on eval's return value; it has no fallback path.
        # On a slow/failed LLM call we return a REAL low-confidence scored result so
        # the topic still advances (and saturates out via the dry-topic exit) instead
        # of zeroing progress and looping forever on the same question.
        _is_timeout = isinstance(e, asyncio.TimeoutError)
        logger.error(
            "[EVAL] evaluate_answer %s (%s) -- returning low-confidence recovery scores",
            "timed out" if _is_timeout else "failed", e,
        )
        return {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
            "overall": 1.3,
            # PROBE once with a clarification angle; if it keeps failing or the
            # answer stays thin, the dry-topic exit forces MOVE_ON.
            "action": "PROBE", "probe_mode": "clarification",
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }
