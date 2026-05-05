import asyncio
import json
import re
import time
import urllib.request
from typing import Optional
from agent_persistence import _extract_openai_completion_usage, persist_org_manual_billing_usage
from agent_runtime_support import APP_BASE_URL, LLM_MODEL, logger
async def score_answer_quality(
    candidate_answer: str,
    last_question: str,
    transcript_lines: list,
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
    is_warmup: bool = False,
) -> dict:
    """Structured answer quality scorer. Runs after every candidate response.

    is_warmup=True skips scoring and returns a zero record so warmup turns
    never pollute the technical or communication score averages.
    """
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
            "fluency": 0, "grammar": 0, "confidence": 0,
            "overall": 0.0, "signals": [], "concerns": [],
            "is_warmup": True,
        }
    if not candidate_answer or not candidate_answer.strip():
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
            "fluency": 0, "grammar": 0, "confidence": 0,
            "overall": 0.0, "signals": [], "concerns": ["empty_answer"],
        }
    recent_context = "\n".join(transcript_lines[-8:]) if transcript_lines else ""
    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                max_tokens=280,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Score a candidate's interview answer on 7 dimensions (0-10 each).\n"
                            "Output ONLY valid JSON with these exact fields:\n"
                            '{\n'
                            '  "clarity": 0-10,\n'
                            '  "depth": 0-10,\n'
                            '  "specificity": 0-10,\n'
                            '  "grounding": 0-10,\n'
                            '  "fluency": 0-10,\n'
                            '  "grammar": 0-10,\n'
                            '  "confidence": 0-10,\n'
                            '  "signals": ["list", "of", "observed", "strengths"],\n'
                            '  "concerns": ["list", "of", "observed", "weaknesses"]\n'
                            '}\n\n'
                            "SCORING GUIDE:\n"
                            "clarity (0-10): How easy to follow the answer structurally?\n"
                            "  0-2: Incoherent, impossible to follow\n"
                            "  3-5: Somewhat clear but disjointed or meandering\n"
                            "  6-8: Clear, logical structure\n"
                            "  9-10: Crystal clear, perfectly structured\n\n"
                            "depth (0-10): How much reasoning or thinking is shown?\n"
                            "  0-2: No reasoning — 'I don't know' or single-word answers\n"
                            "  3-5: Some reasoning but shallow\n"
                            "  6-8: Good reasoning, explores tradeoffs\n"
                            "  9-10: Deep systems thinking, anticipates implications\n\n"
                            "specificity (0-10): Real names, numbers, dates, concrete examples?\n"
                            "  0-2: No specifics at all\n"
                            "  3-5: Vague or generic\n"
                            "  6-8: Named real projects, companies, or numbers\n"
                            "  9-10: Heavily grounded in specific details\n\n"
                            "grounding (0-10): Does it reflect real lived experience vs theory?\n"
                            "  0-2: No evidence of real experience\n"
                            "  3-5: Mix of theory and experience\n"
                            "  6-8: Clearly from real work\n"
                            "  9-10: Rich, textured description of lived experience\n\n"
                            "fluency (0-10): Smoothness and natural flow of speech?\n"
                            "  0-2: Very halting, many long pauses or incomplete sentences\n"
                            "  3-5: Some hesitation but mostly complete\n"
                            "  6-8: Mostly fluent with minor pauses\n"
                            "  9-10: Naturally flowing, no notable hesitation\n\n"
                            "grammar (0-10): Grammatical correctness?\n"
                            "  0-2: Major grammar errors throughout\n"
                            "  3-5: Several grammar issues\n"
                            "  6-8: Mostly correct grammar\n"
                            "  9-10: Grammatically correct\n\n"
                            "confidence (0-10): Does the candidate sound assured and decisive?\n"
                            "  0-2: Very uncertain, avoids committing to answers\n"
                            "  3-5: Some tentativeness\n"
                            "  6-8: Generally confident\n"
                            "  9-10: Strongly confident, direct, and assertive\n\n"
                            "signals: Strengths observed. Pick from:\n"
                            '  "has_numbers", "has_names", "has_reasoning", "has_failure", '
                            '"has_tradeoff", "has_ownership", "has_emotion", "has_learning"\n\n'
                            "concerns: Weaknesses observed. Pick from:\n"
                            '  "vague", "rehearsed", "ownership_unclear", "contradiction", '
                            '"incomplete", "generic", "bragging", "overly_cautious", "refused_to_answer"'
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION: {last_question}\n\n"
                            f"CANDIDATE ANSWER: {candidate_answer}\n\n"
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
        for key in ("clarity", "depth", "specificity", "grounding", "fluency", "grammar", "confidence"):
            parsed[key] = max(0, min(10, int(parsed.get(key, 5))))
        parsed["overall"] = (
            parsed["clarity"] + parsed["depth"] + parsed["specificity"] + parsed["grounding"]
        ) / 4.0
        parsed["signals"] = parsed.get("signals", [])
        parsed["concerns"] = parsed.get("concerns", [])
        return parsed
    except asyncio.TimeoutError:
        logger.warning("[SCORE] Answer scorer timed out - returning neutral scores")
        return {
            "clarity": 5, "depth": 5, "specificity": 5, "grounding": 5,
            "fluency": 5, "grammar": 5, "confidence": 5,
            "overall": 5.0, "signals": [], "concerns": ["timeout"],
        }
    except Exception as e:
        logger.warning(f"[SCORE] Answer scorer failed: {e}", exc_info=True)
        return {
            "clarity": 5, "depth": 5, "specificity": 5, "grounding": 5,
            "fluency": 5, "grammar": 5, "confidence": 5,
            "overall": 5.0, "signals": [], "concerns": ["error"],
        }
async def evaluate_answer_and_decide(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    transcript_lines: list,
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
) -> dict:
    """Per-turn answer evaluator. Returns probe-vs-move-on guidance."""
    if not candidate_answer or not candidate_answer.strip():
        return {"action": "MOVE_ON", "probe_mode": None, "reason": "empty answer", "depth_signal": "SURFACE"}
    recent_context = "\n".join(transcript_lines[-10:]) if transcript_lines else ""
    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                max_tokens=120,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an interview quality evaluator. Analyze a candidate's answer and decide "
                            "whether the interviewer should probe deeper or move to the next topic.\n\n"
                            "Output ONLY valid JSON with these exact fields:\n"
                            '{"action": "PROBE" or "MOVE_ON", '
                            '"probe_mode": "ownership" | "evidence" | "compression" | "depth" | "verification" | '
                            '"clarification" | "specificity" | "contradiction" | null, '
                            '"reason": "one short sentence", '
                            '"depth_signal": "SURFACE" | "SPECIFIC" | "DEEP"}\n\n'
                            "MOVE_ON when: answer has real specifics (names/numbers/dates), clear reasoning, "
                            "OR topic already had 3+ follow-ups, OR candidate said I don't know twice.\n"
                            "PROBE when: answer is vague, generic, no real example, no numbers, "
                            "uses only 'we' with no personal ownership, or sounds rehearsed.\n"
                            "probe_mode:\n"
                            "  ownership = 'we did' but unclear what they personally did\n"
                            "  evidence = missing concrete example, named project, or proof\n"
                            "  compression = answer collapses on a follow-up or loses sequence\n"
                            "  depth = has facts but no reasoning/tradeoff\n"
                            "  clarification = conflicts with something said earlier\n"
                            "  verification = polished answer, probe memory of the exact moment\n"
                            "  specificity = generic answer missing names/numbers/dates\n"
                            "  contradiction = alias for clarification when a mismatch is explicit\n"
                            "depth_signal: SURFACE=generic/vague, SPECIFIC=named real thing, DEEP=specifics+reasoning"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION ASKED: {last_question}\n\n"
                            f"CANDIDATE ANSWER: {candidate_answer}\n\n"
                            f"FOLLOW-UPS ALREADY ASKED ON THIS TOPIC: {topic_follow_up_count}\n\n"
                            f"RECENT CONVERSATION:\n{recent_context}"
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
        if parsed.get("action") not in ("PROBE", "MOVE_ON"):
            parsed["action"] = "MOVE_ON"
        if parsed.get("depth_signal") not in ("SURFACE", "SPECIFIC", "DEEP"):
            parsed["depth_signal"] = "SURFACE"
        return parsed
    except asyncio.TimeoutError:
        logger.warning("[EVAL] Per-turn evaluator timed out - defaulting to MOVE_ON")
        return {"action": "MOVE_ON", "probe_mode": None, "reason": "timeout", "depth_signal": "SURFACE"}
    except Exception as e:
        logger.warning(f"[EVAL] Per-turn evaluator failed: {e}", exc_info=True)
        return {"action": "MOVE_ON", "probe_mode": None, "reason": str(e), "depth_signal": "SURFACE"}
async def extract_claims(
    candidate_answer: str,
    turn: int,
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
) -> list[dict]:
    """Extract verifiable factual claims from a single candidate answer."""
    if not candidate_answer or len(candidate_answer.strip()) < 20:
        return []
    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
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
