"""
agent_scoring.py

AFTER (1 merged LLM call, ~700ms total):
  Call AB → evaluate_answer()          → {clarity:7, depth:4, ..., action: PROBE, probe_mode: ownership}
  One round-trip returns BOTH quality scores AND routing decision.
#   Saturation, weak_exit, time_pressure still get quality scores — nothing removed.
#   turn_evaluator.py no longer needs asyncio.gather() for these two tasks.
#
# EXAMPLE:
#   Candidate says: "We built a REST API using FastAPI"
#   AFTER:  Single call scores clarity=6,depth=3 AND sees "we built" → PROBE ownership.
#   Result is identical. Latency drops ~800ms.
# ─────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger("interview-agent")

EVAL_LLM_MODEL   = "gpt-4.1-mini"
EVAL_TEMPERATURE = 0.0


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
) -> dict:
    """
    Single merged LLM call: scores answer quality AND decides PROBE/MOVE_ON.

    Returns a dict with ALL fields from the old separate functions:
      Quality scores: clarity, depth, specificity, grounding, fluency, grammar, confidence
      Routing:        action, probe_mode, reason, depth_signal
    """
    # Warmup turns skip scoring — return zeroed quality + safe routing default
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
            "fluency": 0, "grammar": 0, "confidence": 0,
            "overall": 0.0, "signals": [], "concerns": [],
            "is_warmup": True,
            "action": "MOVE_ON", "probe_mode": None,
            "reason": "warmup turn", "depth_signal": "SURFACE",
        }

    # Empty answer — no LLM call needed
    if not candidate_answer or not candidate_answer.strip():
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
            "fluency": 0, "grammar": 0, "confidence": 0,
            "overall": 0.0, "signals": [], "concerns": ["empty_answer"],
            "action": "MOVE_ON", "probe_mode": None,
            "reason": "empty answer", "depth_signal": "SURFACE",
        }

    # Very short answers can't demonstrate depth — hard-cap scores, still ask for routing
    word_count = len(candidate_answer.strip().split())
    if word_count < 5:
        clarity = 1 if word_count > 0 else 0
        return {
            "clarity": clarity, "depth": 0, "specificity": 0, "grounding": 0,
            "fluency": 1, "grammar": 1, "confidence": 1,
            "overall": clarity / 4.0, "signals": [], "concerns": ["incomplete"],
            "action": "PROBE", "probe_mode": "ownership",
            "reason": "answer too short to evaluate", "depth_signal": "SURFACE",
        }

    # Use last 6 lines (3 Q&A pairs) — enough for LLM to see follow-up context
    # without pulling in old-topic lines that cause the LLM to conflate answers.
    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""

    # Log before the LLM call so you can see it started in the terminal.
    # If this log appears but [EVAL] DONE never follows, the LLM call hung.
    logger.info(
        "[EVAL] ▶ merged evaluate_answer | model=%s words=%d follow_ups=%d",
        llm_model, word_count, topic_follow_up_count,
    )

    # Band-aware follow-up cutoff: how many turns before the LLM judge biases to MOVE_ON.
    # Saturation system is the primary gatekeeper, but the LLM judge needs a matching signal.
    # Fresher: move after 2 (breadth). Mid: 3. Experienced: 5. Senior: 6.
    _followup_cutoff = {"fresher": 2, "mid": 3, "experienced": 5, "senior": 6}.get(candidate_band, 3)

    # Band-aware scoring bar: what counts as "good enough" to MOVE_ON at each level.
    _band_scoring_note = {
        "fresher": (
            "FRESHER candidate — score generously on grounding (they have limited work history).\n"
            "MOVE_ON if they showed they understand WHY they made a choice, even simply.\n"
            "Do NOT expect tradeoffs, scale, or architecture depth."
        ),
        "mid": (
            "MID-LEVEL candidate — expect clear ownership and at least one real decision.\n"
            "MOVE_ON if they named what was specifically theirs and gave one concrete detail.\n"
            "Push back on 'we' language once — if still vague, MOVE_ON."
        ),
        "experienced": (
            "EXPERIENCED candidate — expect depth, specifics, and real tradeoffs.\n"
            "Do NOT MOVE_ON on vague answers — probe harder. A clean story with no friction is a red flag.\n"
            "MOVE_ON only when you have a real tradeoff, a consequence, or a specific metric."
        ),
        "senior": (
            "SENIOR candidate — expect strategic judgment, org impact, high-stakes decisions.\n"
            "Polished generic answers are not enough — push for what actually went wrong or what they'd change.\n"
            "MOVE_ON only when you have evidence of real judgment under pressure, not just competence."
        ),
    }.get(candidate_band, "Probe for real ownership and specific decisions.")

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=EVAL_TEMPERATURE,
                max_tokens=320,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are scoring a candidate's interview answer and deciding the next move.\n"
                            "Output ONLY valid JSON with these exact fields:\n"
                            "{\n"
                            '  "clarity": 0-10,\n'
                            '  "depth": 0-10,\n'
                            '  "specificity": 0-10,\n'
                            '  "grounding": 0-10,\n'
                            '  "fluency": 0-10,\n'
                            '  "grammar": 0-10,\n'
                            '  "confidence": 0-10,\n'
                            '  "action": "PROBE" or "MOVE_ON",\n'
                            '  "probe_mode": "ownership"|"depth"|"authenticity"|"pressure"|"clarification"|null,\n'
                            '  "reason": "max 8 words from the answer that drove your decision",\n'
                            '  "depth_signal": "SURFACE"|"SPECIFIC"|"DEEP"\n'
                            "}\n\n"

                            "── SCORES (clarity, depth, specificity, grounding drive saturation) ──\n"
                            "clarity: Is it easy to follow? "
                            "1=disconnected fragments | 4=understandable but scattered | 7=clear structure | 10=precise and logical\n"
                            "depth: Did they show WHY, not just WHAT? "
                            "1=no reasoning at all | 4=stated the thing, no reason | 7=explained tradeoffs | 10=cause-effect + edge cases\n"
                            "specificity: Real names, tools, numbers, dates? "
                            "1=completely generic | 4=vague ('some tool', 'a while') | 7=named specific things | 10=numbers+names+dates\n"
                            "grounding: Does this sound like real lived work? "
                            "1=pure theory/reading | 4=could be anyone | 7=clearly from real experience | 10=rich texture, imperfect detail\n"
                            "fluency: Natural spoken delivery? 1=halting | 5=hesitant but followable | 10=natural\n"
                            "grammar: Speech grammar? 1=major errors | 5=understandable | 10=correct\n"
                            "confidence: Decisive and assured? 1=very uncertain | 5=tentative | 10=direct\n\n"

                            "── depth_signal ──\n"
                            "SURFACE: answer is generic, no real names/tools/numbers\n"
                            "SPECIFIC: named at least one real thing (tool, project, number)\n"
                            "DEEP: has specifics AND reasoning AND at least one tradeoff or consequence\n\n"

                            "── ROUTING: action + probe_mode ──\n"
                            "Use the scores to drive the decision, not separately from them:\n\n"
                            "MOVE_ON when:\n"
                            "  - specificity ≥ 7 AND depth ≥ 6 AND grounding ≥ 6 (they gave a real answer)\n"
                            f"  - OR follow-ups ≥ {_followup_cutoff} (band-appropriate time spent, move on regardless)\n"
                            "  - OR candidate said 'I don't know' / 'I didn't do that' / 'I can't answer'\n"
                            "  - OR candidate explicitly said 'don't ask about X' / 'I didn't build anything' / 'ask me about skills instead'\n"
                            "    → Respect the redirect. Do NOT probe further. MOVE_ON immediately.\n\n"
                            "PROBE when: more can be pulled. Pick probe_mode based on what's weakest:\n"
                            "  ownership     — grounding low, 'we' language, role unclear, HOW unknown\n"
                            "  depth         — specificity ok but depth low, no tradeoff/metric/reasoning\n"
                            "  authenticity  — sounds rehearsed, shallower than first answer, skill claimed not shown\n"
                            "  pressure      — story too clean, no mistake/friction — needs a hard moment\n"
                            "  clarification — contradicts earlier, or answer keeps getting shorter\n\n"
                            f"── BAND: {candidate_band.upper()} ──\n"
                            f"{_band_scoring_note}\n\n"
                            "RULES: probe_mode must be null when action=MOVE_ON. "
                            "reason must quote the candidate's actual words."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION ASKED: {last_question}\n\n"
                            f"CANDIDATE ANSWER: {candidate_answer}\n\n"
                            f"FOLLOW-UPS ALREADY ASKED ON THIS TOPIC: {topic_follow_up_count}\n"
                            f"(band cutoff = {_followup_cutoff} follow-ups — bias to MOVE_ON if at or past this)\n\n"
                            f"RECENT CONTEXT (for detecting collapse or consistency issues):\n{recent_context}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
            ),
            timeout=6.0,  # raised from 4s — richer prompt + json_object mode needs more room
        )

        raw = completion.choices[0].message.content or "{}"
        _usage = getattr(completion, "usage", None)
        _eval_llm_usage = {
            "model": llm_model,
            "inputTokens": int(getattr(_usage, "prompt_tokens", 0) or 0),
            "outputTokens": int(getattr(_usage, "completion_tokens", 0) or 0),
            "cachedInputTokens": int(getattr(getattr(_usage, "prompt_tokens_details", None), "cached_tokens", 0) or 0),
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
        fluency     = _clamp(data.get("fluency", 0))
        grammar     = _clamp(data.get("grammar", 0))
        confidence  = _clamp(data.get("confidence", 0))

        overall = (clarity + depth + specificity + grounding) / 4.0

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
        depth_signal = str(data.get("depth_signal", "SURFACE")).upper()
        if depth_signal not in ("SURFACE", "SPECIFIC", "DEEP"):
            depth_signal = "SURFACE"

        logger.info(
            "[EVAL] ✅ action=%s probe=%s depth_signal=%s | "
            "clarity=%d depth=%d specificity=%d grounding=%d | reason=%s",
            action, probe_mode, depth_signal,
            int(clarity), int(depth), int(specificity), int(grounding),
            repr(reason),
        )

        return {
            "clarity": clarity, "depth": depth,
            "specificity": specificity, "grounding": grounding,
            "fluency": fluency, "grammar": grammar, "confidence": confidence,
            "overall": overall,
            "action": action, "probe_mode": probe_mode,
            "reason": reason, "depth_signal": depth_signal,
            "_llm_usage": _eval_llm_usage,
        }

    except asyncio.TimeoutError:
        logger.warning("[EVAL] ⏰ evaluate_answer timed out (6s) — returning surface fallback")
        return {
            "clarity": 1, "depth": 1, "specificity": 1, "grounding": 1,
            "fluency": 1, "grammar": 1, "confidence": 1,
            "overall": 1.0,
            "action": "PROBE", "probe_mode": "ownership",
            "reason": "eval timeout", "depth_signal": "SURFACE",
            "is_timeout": True,
        }
    except Exception as e:
        logger.error("[EVAL] ❌ evaluate_answer failed: %s", e, exc_info=True)
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
            "fluency": 0, "grammar": 0, "confidence": 0,
            "overall": 0.0,
            "action": "PROBE", "probe_mode": "ownership",
            "reason": "eval error", "depth_signal": "SURFACE",
        }


def notify_sync_engine(app_id: str, turn: int, action: str) -> None:
    """Fire-and-forget HTTP ping to the sync engine after eval completes."""
    import threading, urllib.request, urllib.error, os
    sync_url = os.environ.get("SYNC_ENGINE_URL", "")
    if not sync_url:
        return

    def _ping():
        try:
            payload = json.dumps({"app_id": app_id, "turn": turn, "action": action}).encode()
            req = urllib.request.Request(
                f"{sync_url}/eval-complete",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
        except Exception as e:
            logger.warning("[SYNC_ERROR] Failed to notify sync engine: %s", e)

    threading.Thread(target=_ping, daemon=True).start()


# ---------------------------------------------------------------------------
# Live-N Phase 1: Fast Routing Call (~200ms)
# ---------------------------------------------------------------------------
# This is the ONLY call that blocks the LLM gate in Live-N.
# It decides MOVE_ON/PROBE and which probe family — nothing else.
# Quality scoring (evaluate_answer) runs async AFTER Ishita has already spoken.
#
# Prompt is intentionally lean: max_tokens=80, no quality dimensions, just routing.
# Typical latency: 150-300ms vs 700-1500ms for full evaluate_answer.
# ---------------------------------------------------------------------------

_ROUTING_SYSTEM_PROMPT = """You decide the next interview move based on the candidate's answer.
Output ONLY valid JSON with exactly these fields:
{
  "action": "PROBE" or "MOVE_ON",
  "probe_mode": "ownership"|"depth"|"authenticity"|"pressure"|"clarification"|null,
  "reason": "max 6 words from the answer"
}

MOVE_ON when:
  - Candidate gave a real, specific answer (named something concrete)
  - Candidate said "I don't know" / "I didn't do that" / "don't ask about X"
  - follow_ups >= band_cutoff (time spent is enough)

PROBE when more can be pulled. Pick probe_mode:
  ownership     — vague "we" language, HOW unknown, role unclear
  depth         — specific but no tradeoff/metric/reasoning
  authenticity  — sounds rehearsed, shallower than first answer
  pressure      — story too clean, no friction or failure mentioned
  clarification — contradicts earlier, answer getting shorter

RULES: probe_mode must be null when action=MOVE_ON."""


async def route_answer(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    candidate_band: str = "mid",
    client = None,
    llm_model: str = EVAL_LLM_MODEL,
) -> dict:
    """
    Phase 1 routing: fast LLM call that returns MOVE_ON/PROBE only.
    Target latency: 150-300ms. Blocks LLM gate in Live-N.
    """
    if not candidate_answer or not candidate_answer.strip():
        return {"action": "PROBE", "probe_mode": "ownership", "reason": "empty answer"}

    _band_cutoff = {"fresher": 2, "mid": 3, "experienced": 5, "senior": 6}.get(candidate_band, 3)

    user_content = (
        f"QUESTION: {last_question}\n\n"
        f"ANSWER: {candidate_answer}\n\n"
        f"FOLLOW-UPS ON THIS TOPIC: {topic_follow_up_count} "
        f"(band cutoff={_band_cutoff} — bias MOVE_ON if at or past this)"
    )

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                max_tokens=80,
                messages=[
                    {"role": "system", "content": _ROUTING_SYSTEM_PROMPT},
                    {"role": "user",   "content": user_content},
                ],
                response_format={"type": "json_object"},
            ),
            timeout=3.0,
        )
        data = json.loads(completion.choices[0].message.content or "{}")
        action = str(data.get("action", "PROBE")).upper()
        if action not in ("PROBE", "MOVE_ON"):
            action = "PROBE"
        _VALID = {"ownership", "depth", "authenticity", "pressure", "clarification"}
        raw_mode = str(data.get("probe_mode") or "").strip().lower()
        probe_mode = raw_mode if raw_mode in _VALID else (None if action == "MOVE_ON" else "ownership")
        logger.info(
            "[ROUTE] action=%s probe=%s reason=%r | turn_followups=%d band=%s",
            action, probe_mode, str(data.get("reason", ""))[:40],
            topic_follow_up_count, candidate_band,
        )
        return {"action": action, "probe_mode": probe_mode, "reason": data.get("reason", "")}
    except asyncio.TimeoutError:
        logger.warning("[ROUTE] route_answer timed out (3s) — defaulting PROBE(ownership)")
        return {"action": "PROBE", "probe_mode": "ownership", "reason": "timeout"}
    except Exception as e:
        logger.warning("[ROUTE] route_answer failed: %s — defaulting PROBE(ownership)", e)
        return {"action": "PROBE", "probe_mode": "ownership", "reason": "error"}
