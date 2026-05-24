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
async def score_answer_quality(
    candidate_answer: str,
    last_question: str,
    transcript_lines: list,
    client,
    org_id: Optional[str] = None,
    llm_model: str = EVAL_LLM_MODEL,
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
    # Hard-cap scores for answers that are too short to evaluate meaningfully.
    # Word count < 5 cannot demonstrate depth, specificity, or grounding regardless of content.
    word_count = len(candidate_answer.strip().split())
    if word_count < 5:
        clarity = 1 if word_count > 0 else 0
        return {
            "clarity": clarity, "depth": 0, "specificity": 0, "grounding": 0,
            "fluency": 1, "grammar": 1, "confidence": 1,
            "overall": clarity / 4.0, "signals": [], "concerns": ["incomplete"],
        }
    recent_context = "\n".join(transcript_lines[-8:]) if transcript_lines else ""
    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=EVAL_TEMPERATURE,
                max_tokens=160,  # JSON with 7 ints + 2 short arrays < 130 tokens
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
        logger.warning("[SCORE] Answer scorer timed out — holding neutral, saturation contribution will be skipped")
        # Timeout = system failure, not a weak answer. Return neutral 5s with is_timeout=True
        # so eval_pipeline knows to skip quality contribution entirely for this turn.
        # This prevents a good answer on a slow network from being punished with fake 2/10 scores.
        return {
            "clarity": 5, "depth": 5, "specificity": 5, "grounding": 5,
            "fluency": 5, "grammar": 5, "confidence": 5,
            "overall": 5.0, "signals": [], "concerns": ["timeout"],
            "is_timeout": True,
        }
    except Exception as e:
        logger.warning(f"[SCORE] Answer scorer failed: {e}", exc_info=True)
        return {
            "clarity": 5, "depth": 5, "specificity": 5, "grounding": 5,
            "fluency": 5, "grammar": 5, "confidence": 5,
            "overall": 5.0, "signals": [], "concerns": ["error"],
            "is_timeout": True,
        }
async def evaluate_answer_and_decide(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    transcript_lines: list,
    client,
    org_id: Optional[str] = None,
    llm_model: str = EVAL_LLM_MODEL,
) -> dict:
    """Per-turn answer evaluator. Returns probe-vs-move-on guidance."""
    if not candidate_answer or not candidate_answer.strip():
        return {"action": "MOVE_ON", "probe_mode": None, "reason": "empty answer", "depth_signal": "SURFACE"}
    recent_context = "\n".join(transcript_lines[-10:]) if transcript_lines else ""
    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=EVAL_TEMPERATURE,
                max_tokens=160,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a sharp senior interviewer deciding what to ask next.\n\n"
                            "Your job: read the question asked AND what the candidate actually said. "
                            "Find the single most valuable gap their answer creates. Pick exactly one probe mode.\n\n"
                            "Output ONLY valid JSON:\n"
                            '{"action": "PROBE" or "MOVE_ON", '
                            '"probe_mode": one of the modes below or null, '
                            '"reason": "one sentence — quote the specific thing they said that creates this gap", '
                            '"depth_signal": "SURFACE" | "SPECIFIC" | "DEEP"}\n\n'

                            "HOW TO PICK — go through these in order, stop at the first that fits:\n\n"

                            "  1. INTEGRITY FIRST — always check this before anything else:\n"
                            "     → Does this answer conflict with something they said earlier in the conversation?\n"
                            "       YES → clarification (surface the conflict, don't accuse)\n"
                            "     → Did their follow-up answer lose the specifics they had in their first answer?\n"
                            "       YES → compression (slow them down, walk back to the start)\n"
                            "     → Does the answer sound rehearsed with zero real memory or texture?\n"
                            "       YES → verification (probe the exact moment, not the summary)\n\n"

                            "  2. OWNERSHIP — most common gap:\n"
                            "     → Did they say 'we built', 'the team did', 'we decided'?\n"
                            "       AND you still don't know what was specifically theirs?\n"
                            "       YES → ownership\n\n"

                            "  3. PROOF — second most common gap:\n"
                            "     → Did they claim a result (shipped, improved, scaled, saved time)?\n"
                            "       AND gave no real number, metric, or before/after?\n"
                            "       YES → outcome\n"
                            "     → Did they name a tool, framework, or technology?\n"
                            "       AND gave no reason why they picked it over alternatives?\n"
                            "       YES → alternatives (ask why this choice, what else they considered)\n\n"

                            "  4. DEPTH — only if ownership and proof are already clear:\n"
                            "     → Did they describe a smooth success with no friction, no mistake, nothing that broke?\n"
                            "       YES → failure (real projects always have something)\n"
                            "     → Did they describe what they built but not how decisions got made day-to-day?\n"
                            "       YES → process\n\n"

                            "  5. HUMAN MOMENT — only pick one of these, only if depth is already DEEP:\n"
                            "     → Did they describe pressure, a deadline, an incident, an outage, a conflict, or a crisis?\n"
                            "       AND depth_signal is DEEP AND you haven't asked a situational question yet?\n"
                            "       YES → situational ('what would you do if this happened again / at 10x scale?')\n"
                            "     → Did they describe a hard call, a disagreement, a mistake, working solo under pressure,\n"
                            "       convincing someone, or something they're proud of or regret?\n"
                            "       AND depth_signal is DEEP AND you haven't asked a behavioral question yet?\n"
                            "       YES → behavioral ('tell me about a time when...' anchored to what they just said)\n\n"

                            "  6. MOVE_ON — pick this when:\n"
                            "     → They gave real specifics AND reasoning — nothing meaningful left to pull\n"
                            "     → They clearly can't go deeper (said 'I don't know', admitted they weren't involved)\n"
                            "     → depth_signal is DEEP and all gaps above are already filled\n\n"

                            "STRICT RULES:\n"
                            "  - Pick exactly ONE probe mode. Never combine.\n"
                            "  - situational and behavioral only when depth_signal = DEEP. Never on shallow answers.\n"
                            "  - The reason field must quote something specific from their answer. Never say 'answer lacks depth'.\n"
                            "  - If nothing is missing and the answer is genuinely complete → MOVE_ON, probe_mode null.\n\n"

                            "probe_mode options:\n"
                            "  ownership     = team language, personal contribution unclear\n"
                            "  outcome       = claimed result with no number, metric, or proof\n"
                            "  alternatives  = named a tool or made a choice but never said why or what else they considered\n"
                            "  failure       = story too clean, no friction, mistake, or learning mentioned\n"
                            "  process       = described what was built but not how decisions or work actually happened\n"
                            "  clarification = conflicts with something said earlier in this conversation\n"
                            "  verification  = sounds rehearsed, no real memory or texture\n"
                            "  compression   = follow-up answer is shorter and vaguer than the first (anti-cheat)\n"
                            "  situational   = deep answer with a pressure/incident/crisis hook — test judgment in a scenario\n"
                            "  behavioral    = deep answer with a hard call/mistake/team moment hook — surface a real lived story\n\n"

                            "depth_signal:\n"
                            "  SURFACE = generic, vague, or answered a different question entirely\n"
                            "  SPECIFIC = named a real tool, project, person, number, or decision\n"
                            "  DEEP = real specifics AND showed reasoning, tradeoffs, or consequences"
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
        _valid_probe_modes = {
            "ownership", "outcome", "alternatives",
            "failure", "process", "clarification",
            "verification", "compression",
            "situational", "behavioral",
        }
        if parsed.get("probe_mode") not in _valid_probe_modes:
            parsed["probe_mode"] = None
        return parsed
    except asyncio.TimeoutError:
        logger.warning("[EVAL] Per-turn evaluator timed out - defaulting to PROBE (not MOVE_ON)")
        return {"action": "PROBE", "probe_mode": "ownership", "reason": "timeout", "depth_signal": "SURFACE"}
    except Exception as e:
        logger.warning(f"[EVAL] Per-turn evaluator failed: {e}", exc_info=True)
        return {"action": "PROBE", "probe_mode": "ownership", "reason": str(e), "depth_signal": "SURFACE"}
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
