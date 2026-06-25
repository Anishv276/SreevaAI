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
        "description": "Question asked for a specific real example, story, or instance — from any type of question (behavioral or open). Candidate responded with a general habit, theory, or pattern ('usually I...', 'typically we...', 'I always...') instead of describing one real moment that actually happened.",
        "example": "Q: Tell me about a time you handled a difficult client. A: I usually stay calm and try to understand their perspective and then work through it.",
        "not_this": "Do NOT fire if the candidate gave a real specific instance, even if briefly told or imperfectly worded. Only fire when the answer is clearly a general pattern, not a real event.",
    },
    "answer_hollow": {
        "description": "The answer described WHAT the candidate did but gave no HOW, no WHY, and no real operational detail. There is nothing in the answer that could not have been said by someone who only read about this type of work. This covers both: (a) missing reasoning — no decisions, no mechanics explained; and (b) missing texture — no numbers, no constraints, no real outcome. Fire this when both are absent together.",
        "example": "I built a lead qualification system using n8n and it worked well for the client. / I handled the onboarding process and it went smoothly.",
        "not_this": "Do NOT fire if the candidate explained even one real decision, one real constraint they hit, one real number, or one specific outcome. Only fire when the answer is hollow on ALL fronts — no HOW, no WHY, no operational detail.",
    },
    "functional_claim_unverified": {
        "description": "Candidate named a specific tool, technology, method, framework, or capability — from ANY domain (technical, sales, HR, ops) — but gave no evidence of real hands-on usage. The name was dropped but nothing they said shows they actually worked with it. This applies equally to: tech tools (n8n, Salesforce), sales methods (MEDDIC, SPIN), HR practices (structured hiring, competency frameworks), or any claimed skill ('I'm strong at data analysis', 'I run structured processes').",
        "example": "Tech: 'I used n8n for the automation — n8n is basically a workflow tool that connects things.' / Sales: 'I use SPIN selling in my discovery calls.' / HR: 'I always run structured interviews using competency frameworks.'",
        "not_this": "Do NOT fire if they described what they actually DID with it — even one real operational detail, one thing they built, one problem they solved using it. Only fire when the name or claim is present but all description of actual usage is absent or hollow.",
    },
    "claim_not_demonstrated": {
        "description": "Candidate made a strong self-characterization ('I'm great at X', 'I always do Y', 'I owned the whole Z', 'I'm known for...') but nothing in the answer supports it. No example, no number, no outcome — just the assertion.",
        "example": "I'm really strong with data analysis and I always make data-driven decisions. [Nothing in the answer demonstrates this — no dataset mentioned, no metric, no decision described.]",
        "not_this": "Do NOT fire if the candidate backed the claim with at least one real, relevant example OR one concrete operational detail that is specific to that claim. A vague example ('I once built a dashboard') does NOT satisfy this — the example must be relevant to the specific claim and contain at least one real operational detail.",
    },
}

def _build_signal_prompt_block() -> str:
    return """\
-- SIGNAL DETECTION --
Your job: find the ONE most important gap in this answer and name it with a signal.

MANDATORY REASONING SEQUENCE — follow this order before picking any signal:

STEP 1 — What did the question actually ask for?
  Was it asking for: a specific real example? personal ownership? how/why something worked?
  proof of hands-on experience with a tool/method? the outcome of the work?

STEP 2 — Check each gap in this exact order. Fire the FIRST one that matches:

  GAP A — Did they answer the actual question or dodge it with a general habit/pattern?
    If the question asked for a real instance and they responded with "usually I..." or
    "I always..." or described a type of behavior instead of a real event → fire: example_evaded
    DO NOT FIRE if they gave a real specific instance, even if vague or short.

  GAP B — Is their personal contribution invisible? Did they use "we/team/they" throughout
    with zero mention of what they personally did, decided, or owned?
    → fire: ownership_ambiguous
    DO NOT FIRE if they said "I did X" or "my role was Y" anywhere.

  GAP C — Did they make a strong self-claim ('I'm great at X', 'I owned the whole Y',
    'I always do Z') with NOTHING in the answer to support it — no example, no number,
    no outcome, no relevant detail?
    → fire: claim_not_demonstrated
    DO NOT FIRE if they backed the claim with even one real, relevant operational detail.

  GAP D — Did they name a specific tool, method, framework, or skill but show ZERO evidence
    of having actually used it? Applies to any domain: tech tools, sales methods, HR practices,
    any named capability. The name was mentioned but nothing they said proves they worked with it.
    → fire: functional_claim_unverified
    DO NOT FIRE if they described even one real thing they did with it — a problem it solved,
    a specific step they ran, a real outcome it produced.

  GAP E — Is the answer hollow overall? No HOW, no WHY, no real operational detail anywhere.
    Nothing a person couldn't say after reading one article. No decision explained, no constraint
    mentioned, no real number, no specific outcome. The answer is correct but completely empty.
    → fire: answer_hollow
    DO NOT FIRE if they gave even one real decision, one real constraint, one real number,
    or one specific outcome. Only fire when hollow on ALL fronts.

STEP 3 — If none of the above gaps exist, the answer is sufficient. Return signal: null.

SIGNAL REASON RULE:
  signal_reason must be a SHORT EXACT QUOTE (3-12 words) from the candidate's actual answer
  that is the clearest evidence the signal is firing.
  GOOD: "we built the pipeline, the team decided"  ← their actual words
  BAD:  "candidate used team language throughout"  ← your description, not their words
  If signal is null → signal_reason must also be null.\
"""


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
      signal       — one of the 5 signal names, or null
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

    def _build_system_prompt() -> str:
        ctx = (
            "You are an experienced interviewer scoring a candidate's answer.\n"
            "Think like a senior hiring manager who has interviewed hundreds of people.\n"
            "You know the difference between someone who did the work and someone who read about it.\n"
            "Output ONLY valid JSON:\n"
            '{"clarity":0-10,"depth":0-10,"specificity":0-10,"grounding":0-10,'
            '"action":"PROBE" or "MOVE_ON",'
            '"signal":"<name>" or null,"signal_reason":"<3-12 word exact quote>" or null,'
            '"reason":"<one phrase from their answer that drove your call>"}\n\n'

            f"Role: {job_title or 'not specified'} | Topic: {active_topic or 'general'}"
            f" | Tag: {topic_tag} | Importance: {topic_importance}\n"
        )
        if topic_probe_focus:
            ctx += f"Probe focus: {', '.join(topic_probe_focus)}\n"
        ctx += (
            "Tag context: RESUME_TOPIC = they claimed this experience, hold them to it. "
            "JD_TOPIC = they may be learning, credit honest partial exposure. "
            "ROLE_TOPIC = conceptual check, one grounded answer is enough.\n\n"

            "This is voice-transcribed speech — score the meaning, not the grammar.\n\n"

            "BEFORE YOU SCORE: Read the answer as a real interviewer would.\n"
            "Ask yourself: does this person sound like they actually did this work?\n"
            "Strip away fluency and polish. Look for the substance underneath.\n\n"

            "── CLARITY (20%) ──────────────────────────────\n"
            "Did they answer what was actually asked — not a safer, easier version of it?\n"
            "A polished answer to the wrong question scores low. A rough answer to the right question scores high.\n"
            "Low (0-4): off-topic, tangent, or answered a related but different question.\n"
            "Mid (5-6): addressed the question but missed part of the intent or drifted.\n"
            "High (7-10): directly answered what was asked. You got what you needed.\n"
            f"{'FRESHER: forgive nervousness and rambling — did they try to answer it? ' if candidate_band == 'fresher' else ''}"
            f"{'SENIOR/EXPERIENCED: precision expected. Tangents and pivots lower the score. ' if candidate_band in ('senior', 'experienced') else ''}\n\n"

            "── DEPTH (35%) ────────────────────────────────\n"
            "Did they explain the HOW and WHY — or just describe the WHAT?\n"
            "Ask yourself: could someone who only read about this topic give the same answer?\n"
            "If yes, depth is low. Real depth is specific to their situation, their constraints, their actual decisions.\n"
            "Generic best-practices language ('I always start by understanding requirements') is not depth — cap at 5.\n"
            "Low (0-4): described what happened, no reasoning behind it.\n"
            "Mid (5-6): gave a real reason for a choice but it's thin — one layer, no constraint or tradeoff behind it.\n"
            "High (7-10): explained a real decision AND why that decision made sense given their specific situation. "
            "The best answers show a cause-effect chain — what they tried, what happened, why they adjusted.\n"
            f"{'FRESHER: a simple genuine reason counts. One honest WHY = 5+. No tradeoffs expected.' if candidate_band == 'fresher' else ''}"
            f"{'MID: expect at least one real constraint or tradeoff behind a decision. Generic reasoning = 4 max.' if candidate_band == 'mid' else ''}"
            f"{'EXPERIENCED: expect competing options considered and a real tradeoff explained. Single-reason answers = 5 max.' if candidate_band == 'experienced' else ''}"
            f"{'SENIOR: expect strategic judgment — why this over alternatives, second-order thinking. No tradeoff = 6 max.' if candidate_band == 'senior' else ''}\n\n"

            "── SPECIFICITY (20%) ──────────────────────────\n"
            "Did they give you operational detail that could only exist if they actually did this work?\n"
            "This is NOT about tool names or software. Anyone can study a job description and name every tool in it.\n"
            "Real specificity: a real number (quota, headcount, deal size, %, volume), a constraint they hit, "
            "a specific failure they fixed, a real decision point, an outcome that actually happened, "
            "a specific client type or team structure or process step that was theirs.\n"
            "Tool names without usage context = no specificity. 'It went well' = no specificity. "
            "'I usually handle X type of client' = pattern, not specificity.\n"
            "Low (0-4): generic — anyone who read one article could say this.\n"
            "Mid (5-6): one real operational detail that required being there.\n"
            "High (7-10): multiple real details that together make the work traceable to a real event, not a type of event.\n"
            f"{'FRESHER: any real operational detail counts, even small-scale internship numbers.' if candidate_band == 'fresher' else ''}"
            f"{'MID: expect at least one real number or constraint. Vague operational language = 4 max.' if candidate_band == 'mid' else ''}"
            f"{'EXPERIENCED/SENIOR: expect real scale and multiple concrete details. Generic descriptions = 3 max.' if candidate_band in ('experienced', 'senior') else ''}\n\n"

            "── GROUNDING (25%) ────────────────────────────\n"
            "Does this answer sound like someone who was there — or someone describing what being there is supposed to sound like?\n"
            "Grounding is the hardest score to fake. Clarity, depth, and specificity can all be rehearsed. "
            "Grounding requires details that only exist when you actually lived through something.\n"
            "Signs of real grounding: something didn't go as planned. They remember it imperfectly "
            "('around 40%, I don't remember exactly'). The detail is specific to their situation, not generic to the domain. "
            "The outcome wasn't guaranteed. They reflect on what they'd do differently. "
            "There's organisational texture — a real stakeholder, a real deadline, a real constraint from outside them.\n"
            "Signs of a hollow answer: perfect linear story (problem → action → success). "
            "Everything worked. Nothing was hard. The outcome is vague. "
            "It sounds like a case study of how this work should go, not how it actually went.\n"
            "An answer with no stated result or outcome cannot score above 5 — something must have happened.\n"
            "Low (0-4): plausible but hollow. Reads like a description of the work, not a memory of doing it.\n"
            "Mid (5-6): at least one grounding signal — a real result, a real friction point, a real constraint.\n"
            "High (7-10): the story has texture. Something was hard or imperfect or specific to their situation. "
            "You believe this person was actually there.\n"
            f"{'FRESHER: a real outcome from a student project or internship counts. A failure they learned from = 6+. No org texture expected.' if candidate_band == 'fresher' else ''}"
            f"{'MID: expect at least one friction point or specific outcome. Clean perfect narrative = 4 max.' if candidate_band == 'mid' else ''}"
            f"{'EXPERIENCED: expect organisational texture and real constraints. Smooth polished story with no friction = 4 max.' if candidate_band == 'experienced' else ''}"
            f"{'SENIOR: expect reflection or judgment under uncertainty. A perfect linear story with no tradeoff = 3 max.' if candidate_band == 'senior' else ''}\n\n"

            "── ROUTING ─────────────────────────────────────\n"
            "PROBE or MOVE_ON — decide as an interviewer, not by checking score thresholds.\n"
            "The question is: do you have enough evidence to form a real judgment about this candidate on this topic?\n"
            "PROBE when something is missing that matters — they described WHAT but not HOW, "
            "they made a claim with nothing behind it, they gave a plausible answer with no real evidence in it, "
            "or on a RESUME_TOPIC the answer felt rehearsed rather than lived.\n"
            "MOVE_ON when you have enough — the question was answered, their role was clear, "
            "at least one real decision or constraint or outcome was credibly described, "
            "and asking again would not surface anything new.\n"
            "MOVE_ON also when: the candidate genuinely has no experience here — probing only confirms the gap.\n\n"
        )
        ctx += _signal_block
        return ctx

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
                        "content": _build_system_prompt(),
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
            + specificity * 0.20
            + grounding * 0.25
        )

        action = str(data.get("action", "PROBE")).upper()
        if action not in ("PROBE", "MOVE_ON"):
            action = "PROBE"

        # Validate signal against our 5 defined signals
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
            "signal": None,
            "signal_reason": None,
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }
