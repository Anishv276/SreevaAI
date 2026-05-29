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
                            "  - OR follow-ups ≥ 4 (enough time spent, move on regardless)\n"
                            "  - OR candidate said 'I don't know' / 'I didn't do that'\n\n"
                            "PROBE when: more can be pulled. Pick probe_mode based on what's weakest:\n"
                            "  ownership     — grounding low, 'we' language, role unclear, HOW unknown\n"
                            "  depth         — specificity ok but depth low, no tradeoff/metric/reasoning\n"
                            "  authenticity  — sounds rehearsed, shallower than first answer, skill claimed not shown\n"
                            "  pressure      — story too clean, no mistake/friction — needs a hard moment\n"
                            "  clarification — contradicts earlier, or answer keeps getting shorter\n\n"
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
                            f"(if ≥ 4, bias toward MOVE_ON even on weak answers)\n\n"
                            f"RECENT CONTEXT (for detecting collapse or contradiction):\n{recent_context}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
            ),
            timeout=6.0,  # raised from 4s — richer prompt + json_object mode needs more room
        )

        raw = completion.choices[0].message.content or "{}"
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


async def extract_claims(
    candidate_answer: str,
    turn: int,
    client,
    org_id: Optional[str] = None,
    llm_model: str = EVAL_LLM_MODEL,
) -> list[dict]:
    """Extract verifiable factual claims from candidate answer for contradiction detection."""
    if not candidate_answer or not candidate_answer.strip():
        return []

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=EVAL_TEMPERATURE,
                max_tokens=300,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Extract verifiable factual claims from the candidate's answer. "
                            "Output a JSON array (max 5 items). Each item:\n"
                            '{"type": one of [team_size,years_experience,tenure_at_company,role_title,'
                            'project_ownership,reporting_structure,outcome_metric,tech_stack,company_name,timeline], '
                            '"value": "the claimed value", '
                            '"quote": "max 15 words from answer", '
                            '"context": "company/project name or general", '
                            f'"turn": {turn}}}\n'
                            "Only extract concrete, checkable claims. Skip opinions and vague statements."
                        ),
                    },
                    {"role": "user", "content": f"CANDIDATE ANSWER (turn {turn}):\n{candidate_answer}"},
                ],
                response_format={"type": "json_object"},
            ),
            timeout=3.0,
        )
        raw = completion.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        # Sometimes model wraps in {"claims": [...]}
        for v in parsed.values():
            if isinstance(v, list):
                return v
        return []
    except Exception:
        return []


def check_contradiction(
    new_claim: dict,
    existing_claims_by_type: dict[str, list[dict]],
) -> Optional[dict]:
    """Compare new_claim against existing claims of same type. Returns contradiction dict or None."""
    claim_type = new_claim.get("type", "")
    existing = existing_claims_by_type.get(claim_type, [])
    if not existing:
        return None

    def _extract_num(s: str) -> Optional[float]:
        m = re.search(r"\d+(?:\.\d+)?", str(s))
        return float(m.group()) if m else None

    for old in existing:
        old_val = str(old.get("value", ""))
        new_val = str(new_claim.get("value", ""))
        contradiction = False

        if claim_type == "team_size":
            on, nn = _extract_num(old_val), _extract_num(new_val)
            if on is not None and nn is not None and abs(on - nn) >= 3:
                contradiction = True
        elif claim_type == "years_experience":
            on, nn = _extract_num(old_val), _extract_num(new_val)
            if on is not None and nn is not None and abs(on - nn) > 2:
                contradiction = True
        elif claim_type == "project_ownership":
            solo_words = {"solo", "alone", "myself", "i built", "i made"}
            team_words = {"team", "we", "together", "collaborated"}
            old_solo = any(w in old_val.lower() for w in solo_words)
            new_solo = any(w in new_val.lower() for w in solo_words)
            old_team = any(w in old_val.lower() for w in team_words)
            new_team = any(w in new_val.lower() for w in team_words)
            if (old_solo and new_team) or (old_team and new_solo):
                contradiction = True
        elif claim_type == "tenure_at_company":
            on, nn = _extract_num(old_val), _extract_num(new_val)
            if on is not None and nn is not None and on > 0:
                if abs(on - nn) / on > 0.40:
                    contradiction = True

        if contradiction:
            return {
                "type": claim_type,
                "context": new_claim.get("context", ""),
                "old_turn": old.get("turn", 0),
                "old_value": old_val,
                "new_turn": new_claim.get("turn", 0),
                "new_value": new_val,
                "old_quote": old.get("quote", ""),
                "new_quote": new_claim.get("quote", ""),
            }

    return None


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
