import asyncio
import json
import re
import time
import urllib.request
from typing import Optional
from interview.agent_persistence import _extract_openai_completion_usage, persist_org_manual_billing_usage
from interview.agent_runtime_support import (
    EVAL_TEMPERATURE,
    APP_BASE_URL,
    EVAL_LLM_MODEL,
    WORKER_SYNC_TOKEN,
    logger,
)

# ─────────────────────────────────────────────────────────────────────────────
# FIX 1: MERGED EVAL FUNCTION
#
# BEFORE (2 separate LLM calls, ~1500ms total):
#   Call A → score_answer_quality()      → {clarity:7, depth:4, ...}
#   Call B → evaluate_answer_and_decide() → {action: PROBE, probe_mode: ownership}
#   Both fired in parallel via asyncio.gather(), but each still costs one full
#   OpenAI round-trip (~700-900ms each). Parallel means you wait for the SLOWER one.
#
# AFTER (1 merged LLM call, ~700ms total):
#   Call AB → evaluate_answer()          → {clarity:7, depth:4, ..., action: PROBE, probe_mode: ownership}
#   One round-trip returns BOTH quality scores AND routing decision.
#   Saturation, weak_exit, time_pressure still get quality scores — nothing removed.
#   turn_evaluator.py no longer needs asyncio.gather() for these two tasks.
#
# EXAMPLE:
#   Candidate says: "We built a REST API using FastAPI"
#   BEFORE: Call A scores clarity=6,depth=3. Call B sees "we built" → PROBE ownership.
#   AFTER:  Single call scores clarity=6,depth=3 AND sees "we built" → PROBE ownership.
#   Result is identical. Latency drops ~800ms.
# ─────────────────────────────────────────────────────────────────────────────

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

    recent_context = "\n".join(transcript_lines[-8:]) if transcript_lines else ""

    # Log before the LLM call so you can see it started in the terminal.
    # If this log appears but [EVAL] DONE never follows, the LLM call hung.
    logger.info(
        "[EVAL] ▶ merged evaluate_answer | model=%s words=%d follow_ups=%d",
        llm_model, word_count, topic_follow_up_count,
    )

    try:
        # One call, one round-trip, both tasks done.
        # max_tokens=320: quality JSON (130 tokens) + routing JSON (130 tokens) + safety margin
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=EVAL_TEMPERATURE,
                max_tokens=320,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are evaluating a candidate's interview answer. Do TWO things in ONE response.\n\n"
                            "Output ONLY valid JSON with ALL of these exact fields:\n"
                            "{\n"
                            '  "clarity": 0-10,\n'
                            '  "depth": 0-10,\n'
                            '  "specificity": 0-10,\n'
                            '  "grounding": 0-10,\n'
                            '  "fluency": 0-10,\n'
                            '  "grammar": 0-10,\n'
                            '  "confidence": 0-10,\n'
                            '  "signals": ["has_numbers"|"has_names"|"has_reasoning"|"has_failure"|"has_tradeoff"|"has_ownership"|"has_emotion"|"has_learning"],\n'
                            '  "concerns": ["vague"|"rehearsed"|"ownership_unclear"|"contradiction"|"incomplete"|"generic"|"bragging"|"overly_cautious"|"refused_to_answer"],\n'
                            '  "action": "PROBE" or "MOVE_ON",\n'
                            '  "probe_mode": one of the probe modes below or null,\n'
                            '  "reason": "one sentence quoting what the candidate said that drives this decision",\n'
                            '  "depth_signal": "SURFACE" | "SPECIFIC" | "DEEP"\n'
                            "}\n\n"

                            "── PART 1: QUALITY SCORES ──\n"
                            "clarity: How easy to follow structurally? 0-2 incoherent, 3-5 disjointed, 6-8 clear, 9-10 perfect.\n"
                            "depth: Reasoning shown? 0-2 none, 3-5 shallow, 6-8 good tradeoffs, 9-10 deep systems thinking.\n"
                            "specificity: Real names/numbers/dates? 0-2 none, 3-5 vague, 6-8 named real things, 9-10 heavily grounded.\n"
                            "grounding: Real lived experience vs theory? 0-2 no experience, 3-5 mix, 6-8 clearly from real work, 9-10 rich texture.\n"
                            "fluency: Natural speech flow? 0-2 halting, 3-5 some hesitation, 6-8 mostly fluent, 9-10 natural.\n"
                            "grammar: Correctness? 0-2 major errors, 3-5 several issues, 6-8 mostly correct, 9-10 correct.\n"
                            "confidence: Assured and decisive? 0-2 very uncertain, 3-5 tentative, 6-8 confident, 9-10 strongly direct.\n\n"

                            "── PART 2: ROUTING DECISION ──\n"
                            "Go through these in order, stop at first that fits:\n\n"
                            "1. INTEGRITY: conflict with earlier answer → clarification | "
                            "follow-up vaguer than first answer → compression | "
                            "sounds rehearsed with no real memory → verification\n"
                            "2. OWNERSHIP: said 'we built/team did' but personal contribution unclear → ownership\n"
                            "3. PROOF: claimed result with no number/metric → outcome | "
                            "named tool but no reason why chosen → alternatives\n"
                            "4. DEPTH (only if ownership+proof clear): no friction/mistake → failure | "
                            "described what not how → process\n"
                            "5. HUMAN (only if depth_signal=DEEP): pressure/crisis hook → situational | "
                            "hard call/mistake hook → behavioral\n"
                            "6. MOVE_ON: real specifics AND reasoning given, nothing left to pull, "
                            "or candidate admitted they don't know\n\n"

                            "depth_signal: SURFACE=generic/vague, SPECIFIC=named real thing, DEEP=specifics+reasoning+tradeoffs\n\n"

                            "RULES: Pick exactly ONE probe_mode. reason must quote the candidate's actual words."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION: {last_question}\n\n"
                            f"CANDIDATE ANSWER: {candidate_answer}\n\n"
                            f"FOLLOW-UPS ALREADY ASKED ON THIS TOPIC: {topic_follow_up_count}\n\n"
                            f"RECENT CONTEXT:\n{recent_context}"
                        ),
                    },
                ],
            ),
            timeout=4.0,
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )
        raw = completion.choices[0].message.content or ""
        parsed = json.loads(raw.strip())

        # Clamp quality scores 0-10
        for key in ("clarity", "depth", "specificity", "grounding", "fluency", "grammar", "confidence"):
            parsed[key] = max(0, min(10, int(parsed.get(key, 5))))
        parsed["overall"] = (
            parsed["clarity"] + parsed["depth"] + parsed["specificity"] + parsed["grounding"]
        ) / 4.0
        parsed["signals"] = parsed.get("signals", [])
        parsed["concerns"] = parsed.get("concerns", [])

        # Validate routing fields
        if parsed.get("action") not in ("PROBE", "MOVE_ON"):
            parsed["action"] = "MOVE_ON"
        if parsed.get("depth_signal") not in ("SURFACE", "SPECIFIC", "DEEP"):
            parsed["depth_signal"] = "SURFACE"
        _valid_probe_modes = {
            "ownership", "outcome", "alternatives", "failure", "process",
            "clarification", "verification", "compression", "situational", "behavioral",
        }
        if parsed.get("probe_mode") not in _valid_probe_modes:
            parsed["probe_mode"] = None

        # Terminal log — one line shows scores + routing so you can see both at a glance.
        # Example: [EVAL] ✅ action=PROBE probe=ownership depth=SPECIFIC | c=6 d=3 s=4 g=5
        logger.info(
            "[EVAL] ✅ action=%s probe=%s depth_signal=%s | clarity=%d depth=%d specificity=%d grounding=%d | reason=%s",
            parsed["action"],
            parsed.get("probe_mode") or "null",
            parsed["depth_signal"],
            parsed["clarity"], parsed["depth"], parsed["specificity"], parsed["grounding"],
            (parsed.get("reason") or "")[:80],
        )
        return parsed

    except asyncio.TimeoutError:
        # Timeout = network/API failure, not a weak answer.
        # is_timeout=True tells eval_pipeline to skip quality contribution to saturation.
        # Routing defaults to PROBE so the interview continues rather than skipping topics.
        logger.warning("[EVAL] Merged evaluator timed out turn — returning neutral scores + PROBE fallback")
        return {
            "clarity": 5, "depth": 5, "specificity": 5, "grounding": 5,
            "fluency": 5, "grammar": 5, "confidence": 5,
            "overall": 5.0, "signals": [], "concerns": ["timeout"],
            "is_timeout": True,
            "action": "PROBE", "probe_mode": "ownership",
            "reason": "timeout", "depth_signal": "SURFACE",
        }
    except Exception as e:
        logger.warning("[EVAL] Merged evaluator failed: %s", e, exc_info=True)
        return {
            "clarity": 5, "depth": 5, "specificity": 5, "grounding": 5,
            "fluency": 5, "grammar": 5, "confidence": 5,
            "overall": 5.0, "signals": [], "concerns": ["error"],
            "is_timeout": True,
            "action": "PROBE", "probe_mode": "ownership",
            "reason": str(e), "depth_signal": "SURFACE",
        }
async def extract_claims(
    candidate_answer: str,
    turn: int,
    client,
    org_id: Optional[str] = None,
    llm_model: str = EVAL_LLM_MODEL,
) -> list[dict]:
    """Extract verifiable factual claims from a single candidate answer."""
    if not candidate_answer or len(candidate_answer.strip()) < 20:
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
                            "Extract verifiable factual claims from an interview answer. "
                            "Only extract claims that are specific and checkable - skip vague statements.\n\n"
                            "Output a JSON array. Each item has:\n"
                            '  "type": one of [team_size, years_experience, tenure_at_company, role_title, '
                            "project_ownership, reporting_structure, outcome_metric, tech_stack, company_name, timeline]\n"
                            '  "value": the specific claim value as a short string (e.g. "2 people", "5 years", "solo")\n'
                            '  "quote": the exact phrase from the answer that contains this claim (max 15 words)\n'
                            '  "context": which company/project this refers to (or "general" if unclear)\n\n'
                            "RULES:\n"
                            "- Only extract claims with specific values. Skip: 'a small team', 'a few years'.\n"
                            "- Include: 'team of 2', '5 years', 'I was the only engineer'.\n"
                            "- If no specific claims, return [].\n"
                            "- Maximum 5 claims per answer."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"CANDIDATE ANSWER (turn {turn}):\n{candidate_answer}",
                    },
                ],
            ),
            timeout=3.0,
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )
        raw = completion.choices[0].message.content or "[]"
        claims = json.loads(raw.strip())
        if not isinstance(claims, list):
            return []
        for claim in claims:
            claim["turn"] = turn
        return claims[:5]
    except Exception as e:
        logger.debug(f"[CLAIMS] Claim extraction failed at turn {turn}: {e}")
        return []
def check_contradiction(
    new_claim: dict,
    existing_claims_by_type: dict[str, list[dict]],
) -> Optional[dict]:
    """Compare a new claim against existing claims of the same type and context."""
    claim_type = new_claim.get("type")
    new_value = str(new_claim.get("value", "")).lower().strip()
    new_context = str(new_claim.get("context", "general")).lower().strip()
    new_turn = new_claim.get("turn", 0)
    if not claim_type or not new_value:
        return None
    for old in existing_claims_by_type.get(claim_type, []):
        old_context = str(old.get("context", "general")).lower().strip()
        if new_context != "general" and old_context != "general" and new_context != old_context:
            continue
        old_value = str(old.get("value", "")).lower().strip()
        old_turn = old.get("turn", 0)
        if old_value == new_value:
            continue
        def _extract_number(s: str) -> Optional[float]:
            m = re.search(r"(\d+(?:\.\d+)?)", s)
            return float(m.group(1)) if m else None
        new_num = _extract_number(new_value)
        old_num = _extract_number(old_value)
        is_contradiction = False
        if claim_type == "team_size":
            if new_num is not None and old_num is not None and abs(new_num - old_num) >= 3:
                is_contradiction = True
        elif claim_type == "years_experience":
            if new_num is not None and old_num is not None and abs(new_num - old_num) > 2:
                is_contradiction = True
        elif claim_type == "project_ownership":
            solo_words = {"solo", "alone", "only", "just me", "myself"}
            team_words = {"team", "we", "group", "together", "collective"}
            new_is_solo = any(w in new_value for w in solo_words)
            new_is_team = any(w in new_value for w in team_words)
            old_is_solo = any(w in old_value for w in solo_words)
            old_is_team = any(w in old_value for w in team_words)
            if (new_is_solo and old_is_team) or (new_is_team and old_is_solo):
                is_contradiction = True
        elif claim_type in ("tenure_at_company", "reporting_structure", "outcome_metric", "timeline"):
            if new_num is not None and old_num is not None and abs(new_num - old_num) / max(old_num, 1) > 0.4:
                is_contradiction = True
        else:
            if new_value != old_value and new_num is None and old_num is None:
                if len(set(new_value.split()) & set(old_value.split())) == 0:
                    is_contradiction = True
        if is_contradiction:
            return {
                "type": claim_type,
                "context": new_context,
                "old_turn": old_turn,
                "old_value": old.get("value"),
                "old_quote": old.get("quote", ""),
                "new_turn": new_turn,
                "new_value": new_claim.get("value"),
                "new_quote": new_claim.get("quote", ""),
                "detected_at": time.time(),
            }
    return None
async def notify_sync_engine(app_id: str):
    """Call the Next.js API to trigger Pinecone indexing for this candidate."""
    try:
        url = f"{APP_BASE_URL}/api/admin/candidates/{app_id}/sync"
        def _post_sync_request() -> tuple[int, str]:
            request = urllib.request.Request(
                url,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "hr-updates-agent/1.0",
                    "x-internal-sync-token": str(WORKER_SYNC_TOKEN or ""),
                },
                data=b"{}",
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                status = int(getattr(response, "status", response.getcode()))
                body = response.read().decode("utf-8", errors="replace")
                return status, body
        status, body = await asyncio.to_thread(_post_sync_request)
        logger.info(f"[SYNC] Notified sync engine for {app_id} status={status}")
        if body.strip():
            logger.debug(f"[SYNC] Response body for {app_id}: {body[:500]}")
    except Exception as e:
        logger.warning(f"[SYNC_ERROR] Failed to notify sync engine: {e}")
