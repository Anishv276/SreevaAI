"""
interview/conversational/scoring.py
=========================
Two parallel LLM calls per turn (kept separate on purpose):

  1) _call_scoring  — quality scores only (clarity/depth/specificity/grounding), using sales rubric
  2) _call_probe_points — route + next-question POINTS (no signal taxonomy)

Routes the points call may return (exclusive):
  clarification_request | rephrase_request | off_topic | pure_denial | mastery | probe

For route=probe|mastery the model returns 1–3 concrete points the speaking LLM
uses to ask the next question. Response-shape routes carry empty points and
forced actions (REPHRASE / REDIRECT / ACCEPT_REPHRASE / denial close).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger("interview-agent")

from interview.agent_runtime_support import EVAL_TEMPERATURE
from interview.agent_runtime_utils import token_limit_kwarg, llm_metadata

MAX_POINTS = 3

# Thin routing set — drives TopicState / forced actions. Not a content taxonomy.
RESPONSE_ROUTES: frozenset[str] = frozenset({
    "clarification_request",
    "rephrase_request",
    "off_topic",
})
ROUTE_SET: frozenset[str] = RESPONSE_ROUTES | frozenset({
    "pure_denial",
    "mastery",
    "probe",
})

# Back-compat aliases used by eval TopicState / __init__
RESPONSE_SIGNALS = {
    "clarification_request": {
        "description": "Candidate asks to clarify/rephrase the question.",
        "action": "REPHRASE",
    },
    "rephrase_request": {
        "description": "Candidate asks to restart their own answer.",
        "action": "ACCEPT_REPHRASE",
    },
    "off_topic": {
        "description": "Answered a completely different question/topic.",
        "action": "REDIRECT",
    },
}
DENIAL_SIGNALS: frozenset[str] = frozenset({"pure_denial"})
# Turns that do NOT count as a follow-up attempt. off_topic is deliberately excluded:
# a candidate who answers the wrong thing has still burned a turn, and counting it is what
# lets a redirect loop reach an exit instead of running forever. Must stay in sync with
# TopicState._NON_FOLLOWUP_SIGNALS in conversational/eval.py.
NON_FOLLOWUP_SIGNALS: frozenset[str] = frozenset({
    "clarification_request",
    "rephrase_request",
})
CONTENT_SIGNAL_DEFINITIONS: dict[str, dict] = {}
ALL_SIGNALS: frozenset[str] = ROUTE_SET | frozenset({"mastery_demonstrated", "probe"})


def _route_to_signal(route: str) -> str:
    """TopicState still keys off a primary signal string."""
    if route == "mastery":
        return "mastery_demonstrated"
    if route in ROUTE_SET:
        return route
    return "probe"


# ---------------------------------------------------------------------------
# Call 1 — scoring only (Sales Rubric)
# ---------------------------------------------------------------------------
async def _call_scoring(
    *,
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    recent_context: str,
    client: Any,
    llm_model: str,
    org_id: str,
    active_topic: str,
    level: int,
    topic_probe_focus: str | None,
    job_title: str,
) -> tuple[dict, dict]:
    def _build_scoring_system_prompt() -> str:
        ctx = (
            "You are an experienced sales leader scoring a candidate's answer in a live interview.\n"
            "Think like a VP of Sales who has hired and managed hundreds of reps.\n"
            "You know the difference between someone who actually carried a number and someone who\n"
            "talks about sales in the abstract.\n"
            "Output ONLY valid JSON:\n"
            '{"answers_question":true/false,"clarity":0-10,"depth":0-10,"specificity":0-10,"grounding":0-10,'
            '"reason":"<one phrase from their answer that drove your scoring call>"}\n\n'
            "STEP 1 — answers_question: Did the candidate's answer actually address the question that was asked?\n"
            "  true  = they engaged with the question, even partially or weakly.\n"
            "  false = the answer has NOTHING to do with the question — completely unrelated topic,\n"
            "          pure social filler ('Yeah I am ready'), or zero attempt at what was asked.\n"
            "  A vague or generic sales attempt is still answers_question=TRUE — score it low on\n"
            "  depth/specificity, do NOT set answers_question=false.\n"
            "  If answers_question = false, you MUST set clarity=0, depth=0, specificity=0, grounding=0.\n\n"
            "STEP 2 — Score normally (only if answers_question = true).\n\n"
            f"Role: {job_title or 'not specified'} | Topic: {active_topic or 'general'}\n"
        )
        if topic_probe_focus:
            ctx += f"Probe focus: {topic_probe_focus}\n"
        ctx += (
            "This is voice-transcribed speech — score the meaning, not the grammar.\n\n"
            "BEFORE YOU SCORE: Read the answer as a real sales leader would.\n"
            "Ask yourself: does this person sound like they've actually carried a bag and closed real "
            "deals, or are they describing what selling is supposed to sound like?\n\n"

            "── CLARITY (20%) ──────────────────────────────\n"
            "Did they answer what was actually asked — not a safer, easier version of it?\n"
            "Low (0-4): off-topic, tangent, or answered a related but different question.\n"
            "Mid (5-6): addressed the question but missed part of the intent or drifted.\n"
            "High (7-10): directly answered what was asked. You got what you needed.\n"
            f"{'LEVEL 1: forgive nervousness and rambling — did they try to answer it? ' if level == 1 else ''}"
            f"{'LEVEL 3/4: precision expected. Tangents and pivots lower the score. ' if level in (3, 4) else ''}\n\n"

            "── DEPTH (35%) ────────────────────────────────\n"
            "Did they explain the HOW and WHY of a real sales decision — or just describe the WHAT?\n"
            "Generic best-practices language ('I always build rapport first') is not depth — cap at 5.\n"
            "Low (0-4): described what happened, no reasoning behind it.\n"
            "Mid (5-6): gave a real reason for a choice but it's thin — one layer, no constraint behind it.\n"
            "High (7-10): explained a real decision AND why it made sense given the buyer, the account, "
            "or the deal's specific constraints. Best answers show cause-effect — what they tried, what "
            "happened, what they adjusted.\n"
            f"{'LEVEL 1: a simple genuine reason counts. One honest WHY = 5+.' if level == 1 else ''}"
            f"{'LEVEL 2: expect at least one real constraint or tradeoff behind a sales decision. Generic reasoning = 4 max.' if level == 2 else ''}"
            f"{'LEVEL 3: expect competing options considered and a real tradeoff explained. Single-reason answers = 5 max.' if level == 3 else ''}"
            f"{'LEVEL 4: expect strategic judgment — territory/team/process level thinking. No tradeoff = 6 max.' if level == 4 else ''}\n\n"

            "── SPECIFICITY (20%) ──────────────────────────\n"
            "Did they give operational detail that could only exist if they actually did this work?\n"
            "Real specificity: a real number (quota, ACV, win rate, cycle time, deal size), a named "
            "objection a real client raised, a specific account type or buyer persona, a real constraint "
            "they hit, an outcome that actually happened.\n"
            "Tool names without usage context = no specificity. 'It went well' = no specificity.\n"
            "Low (0-4): generic — anyone who read a sales blog could say this.\n"
            "Mid (5-6): one real operational detail that required being there.\n"
            "High (7-10): multiple real details that make the deal/story traceable to a real event.\n"
            f"{'LEVEL 1: any real detail counts, even small-scale internship/practice numbers.' if level == 1 else ''}"
            f"{'LEVEL 2: expect at least one real number or constraint. Vague operational language = 4 max.' if level == 2 else ''}"
            f"{'LEVEL 3/4: expect real scale and multiple concrete details. Generic descriptions = 3 max.' if level in (3, 4) else ''}\n\n"

            "── GROUNDING (25%) ────────────────────────────\n"
            "Does this answer sound like someone who was actually on the call/in the room — or someone "
            "describing what being there is supposed to sound like?\n"
            "Signs of real grounding: something didn't go as planned, they remember it imperfectly, "
            "the detail is specific to their deal (not generic to the domain), the outcome wasn't "
            "guaranteed, there's a real stakeholder or real deadline or real budget constraint.\n"
            "Signs of a hollow answer: perfect linear story (prospect → pitch → close), everything "
            "worked, nothing was hard, the outcome is vague.\n"
            "An answer with no stated result or outcome cannot score above 5.\n"
            "Low (0-4): plausible but hollow. Reads like a description of selling, not a memory of a deal.\n"
            "Mid (5-6): at least one grounding signal — a real result, a real friction point, a real constraint.\n"
            "High (7-10): the story has texture. Something was hard or imperfect or specific to that deal.\n"
            f"{'LEVEL 1: a real outcome from an internship or practice sale counts. A failure they learned from = 6+.' if level == 1 else ''}"
            f"{'LEVEL 2: expect at least one friction point or specific outcome. Clean perfect narrative = 4 max.' if level == 2 else ''}"
            f"{'LEVEL 3: expect real account/territory texture and real constraints. Smooth polished story with no friction = 4 max.' if level == 3 else ''}"
            f"{'LEVEL 4: expect reflection or judgment under uncertainty. A perfect linear story with no tradeoff = 3 max.' if level == 4 else ''}\n\n"
        )
        return ctx

    stream = await asyncio.wait_for(
        client.chat.completions.create(
            model=llm_model,
            temperature=EVAL_TEMPERATURE,
            **token_limit_kwarg(llm_model, 120),
            stream=True,
            messages=[
                {"role": "system", "content": _build_scoring_system_prompt()},
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
            metadata=llm_metadata(call_type="eval_scoring_sales", level=level, org_id=org_id or ""),
        ),
        timeout=45.0,
    )

    raw = ""
    _usage = None
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            raw += chunk.choices[0].delta.content
        if chunk.usage:
            _usage = chunk.usage

    from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
    _llm_usage = _extract_usage(_usage, llm_model) if _usage else {
        "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
    }
    return json.loads(raw), _llm_usage


# ---------------------------------------------------------------------------
# Call 2 — route + probe points (sales)
# ---------------------------------------------------------------------------
_POINTS_SYSTEM = """\
You are the routing brain for a live sales/conversational interview. You do TWO jobs:
  (A) Detect response-shape routes that must short-circuit probing.
  (B) Otherwise invent the best 1–3 POINTS a real sales leader would use to ask the next question.

Output ONLY valid JSON on the last line (you may reason briefly above it):
{{
  "thought_process": "<2-3 sentences of deep reasoning analyzing the transcript to figure out what to ask next>",
  "route": "<one of: clarification_request|rephrase_request|off_topic|pure_denial|mastery|probe>",
  "reason": "<3-12 word quote from their answer, or why>",
  "matched_resume_project": "<Name of the specific deal, quota, or CRM from {resume_context} that matches this topic, else null>",
  "points": ["<concrete ask-angle>", "..."],
  "avoid": ["<already covered / do not re-ask>", "..."],
  "self_corrected": true|false
}}

════════════════════════════════════════
PHASE A — RESPONSE-SHAPE GATES (check FIRST, exclusive, empty points)
════════════════════════════════════════

1) clarification_request — they are asking YOU to clarify/repeat/rephrase the QUESTION,
   or checking the connection ("can you hear me?", garbled/noise transcript with no real answer).
   NOT a weak sales answer. → route=clarification_request, points=[]

2) rephrase_request — they want to RESTART or correct THEIR OWN answer
   ("let me say that again", "I misspoke"). → route=rephrase_request, points=[]

3) pure_denial — CRITICAL: If the candidate says "I don't know", "not sure", "forgot", "no idea" and makes ZERO attempt to guess.
   Mechanical test: strip denial phrases; if NOTHING substantive remains → pure_denial.
   → route=pure_denial, points=["Step down warmly on the SAME topic — easier adjacent question"]

4) off_topic — SUBJECT MISMATCH ONLY. They talked about a COMPLETELY DIFFERENT subject
   than the active topic (their weekend, an unrelated domain, a different job).
   Mechanical test: name the subject of their answer. Is it a DIFFERENT subject from the
   question's subject? Only then → off_topic.

   NEVER off_topic (these are route=probe — they are ON the subject, just badly):
     - vague, hand-wavy, or unclear answers about the asked topic
     - circular answers that restate the question back at you
     - confidently wrong answers about the asked topic
     - generic best-practice language with no substance behind it
   VAGUENESS IS NOT OFF-TOPIC. If your `reason` would be "this is vague" or "no specifics",
   the route is probe, not off_topic. off_topic is about WHAT they talked about, never about
   HOW WELL they talked about it.
   When off_topic genuinely fires, points MUST tell the interviewer how to STEER BACK.
   → route=off_topic

5) mastery — answer already has clear metrics, personal ownership, customer focus, and reasoning.
   Nothing important left to ask on this thread.
   → route=mastery, points=[] (or one optional edge-of-judgment point only if truly useful)

════════════════════════════════════════
PHASE B — route=probe — GENERATE POINTS (not signal labels)
════════════════════════════════════════
You are training the next interviewer turn. Read: last question, answer, recent conversation,
active topic, what was already asked. Invent 1–3 POINTS that are:
  - Specific to THEIR words and THIS topic (not generic "ask about their process")
  - The highest-value missing angles a sharp sales leader would chase next
  - Aware of prior turns on this topic (do not repeat covered ground — put those in avoid)

COVERAGE DIMENSIONS — a real sales leader works a topic from several sides, not one.
Look at ALREADY ASKED to see which of these this topic has already had, then pick a
dimension that has NOT been covered yet:

  METRICS     — the actual number: quota, ACV, deal size, win rate, cycle length.
  OWNERSHIP   — what THEY did, when the answer is all "we" or passive voice.
  TOOLS       — what they actually run their pipeline on, and why that one.
  EXAMPLE     — one specific deal or call. Named, concrete, not a general pattern.
  CUSTOMER    — the buyer's pain, their business goal, why they actually bought.
  FRICTION    — the hardest part, the blocker, the objection a real client raised.
  PROCESS     — stage criteria, forecast reasoning, how they qualify or disqualify.
  OUTCOME     — what happened in the end, including when it went badly.

Rules for points:
  - Max 3. Prefer 1–2 sharp points over a checklist.
  - ROTATE DIMENSIONS. If the last question on this topic was METRICS and they answered
    it at all, the next one should NOT be METRICS again. A topic that got three metrics
    questions in a row was interviewed badly, however sharp each one was on its own.
  - Prefix each point with its dimension in caps, e.g.
    "OWNERSHIP: they said 'we closed it' — find out what they personally did on that deal".
  - Each point = one concrete angle the speaking LLM can turn into ONE question.
  - Never script the exact spoken question — give the angle + why it matters.
  - avoid[] = angles/facts already covered or declined — speaking LLM must not re-ask these.

WHEN THE LAST ANSWER WAS EMPTY OR VAGUE: do not re-ask the same dimension in new words.
Either go much smaller and more concrete within it (one deal, one number, one call), or
switch dimension entirely — EXAMPLE and CUSTOMER often unlock a candidate who is drowning
in an abstract PROCESS question, because they can talk about what actually happened.

self_corrected: true only if they caught and fixed their OWN error mid-answer.

Level {level} calibrates how hard to push in the points (junior = gentler;
senior = judgment/friction/metrics). Topic: {active_topic}. Question type: {question_type}.

CANDIDATE BACKGROUND:
{resume_context}
If the candidate's past projects, skills, or work experience are highly relevant to the active topic, invent a point that asks them to relate their answer to their specific past work. Otherwise, generate normal points.
"""

async def _call_probe_points(
    *,
    candidate_answer: str,
    last_question: str,
    recent_context: str,
    client: Any,
    llm_model: str,
    org_id: str,
    active_topic: str,
    level: int = 2,
    question_type: str = "",
    topic_probe_focus: str | None = None,
    asked_so_far: list[str] | None = None,
    resume_context: str = "",
) -> tuple[str, str | None, list[str], list[str], bool, dict, str | None]:
    """
    Returns (route, reason, points, avoid, self_corrected, usage, matched_resume_project).
    """
    _asked = "\n".join(f"- {q}" for q in (asked_so_far or [])[-8:]) or "(none yet)"
    _focus = topic_probe_focus or "(none)"
    system = _POINTS_SYSTEM.format(
        level=level,
        active_topic=active_topic,
        question_type=question_type,
        resume_context=resume_context or "No resume provided.",
    )
    user = (
        f"ACTIVE TOPIC: {active_topic or 'general'}\n"
        f"TOPIC PROBE FOCUS: {_focus}\n"
        f"ALREADY ASKED ON THIS TOPIC:\n{_asked}\n\n"
        f"QUESTION: {last_question}\n\n"
        f"ANSWER: {candidate_answer}\n\n"
        f"RECENT CONVERSATION:\n{recent_context}"
    )

    resp = await asyncio.wait_for(
        client.chat.completions.create(
            model=llm_model,
            temperature=0.0,
            **token_limit_kwarg(llm_model, 450),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            store=True,
            metadata=llm_metadata(call_type="eval_probe_points_sales", level=level, org_id=org_id or ""),
        ),
        timeout=30.0,
    )
    raw = resp.choices[0].message.content or ""
    from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
    usage = _extract_usage(resp, llm_model) if resp else {
        "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
    }

    route = "probe"
    reason: str | None = None
    points: list[str] = []
    avoid: list[str] = []
    self_corrected = False
    matched_resume_project: str | None = None

    for candidate in reversed(re.findall(r"\{.*\}", raw, re.DOTALL)):
        try:
            parsed = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
        r = str(parsed.get("route") or "").strip().lower()
        if r not in ROUTE_SET:
            # tolerate legacy "mastery_demonstrated"
            if r == "mastery_demonstrated":
                r = "mastery"
            else:
                continue
        route = r
        reason = str(parsed.get("reason") or "").strip() or None
        points = [
            str(p).strip() for p in (parsed.get("points") or [])
            if str(p).strip()
        ][:MAX_POINTS]
        avoid = [
            str(a).strip() for a in (parsed.get("avoid") or [])
            if str(a).strip()
        ][:6]
        self_corrected = bool(parsed.get("self_corrected"))
        matched_resume_project = str(parsed.get("matched_resume_project") or "").strip() or None
        break

    # Response-shape routes: points only for off_topic redirect / denial step-down
    if route in ("clarification_request", "rephrase_request", "mastery"):
        if route != "mastery":
            points = []
    elif route == "off_topic" and not points:
        points = [
            f"Steer back to the active topic ({active_topic or 'the original question'}): "
            "briefly acknowledge the aside, then re-ask the original question more sharply"
        ]
    elif route == "pure_denial" and not points:
        points = ["Warm step-down on the SAME topic — easiest adjacent question they might know"]
    elif route == "probe" and not points:
        points = [
            "Push one concrete missing angle from their last answer "
            "(metrics, ownership, customer focus, or friction) — stay on this topic"
        ]

    return route, reason, points, avoid, self_corrected, usage, matched_resume_project


# ---------------------------------------------------------------------------
# Public evaluate_answer
# ---------------------------------------------------------------------------
async def evaluate_answer(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    transcript_lines: list,
    client,
    llm_model: str,
    org_id: Optional[str] = None,
    is_warmup: bool = False,
    active_topic: str = "",
    level: int = 2,
    topic_probe_focus: str | None = None,
    job_title: str = "",
    question_type: str = "",
    signals_already_fired: list[str] | None = None,  # kept for call-site compat; unused
    asked_so_far: list[str] | None = None,
    resume_context: str = "",
) -> dict:
    """
    Parallel: score + probe-points. Returns scores, route/signal, points, action.
    """
    _ = signals_already_fired  # noqa: F841 — compat only

    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "is_warmup": True,
            "action": "MOVE_ON", "forced_action": True,
            "signal": None, "signals": [], "signal_reason": None,
            "points": [], "avoid": [],
            "reason": "warmup turn",
            "matched_resume_project": None,
        }

    if not candidate_answer or not candidate_answer.strip():
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "action": "PROBE", "forced_action": False,
            "signal": "pure_denial", "signals": ["pure_denial"],
            "signal_reason": None,
            "points": ["Warm step-down on the SAME topic — easiest adjacent question"],
            "avoid": [],
            "reason": "empty answer",
            "matched_resume_project": None,
        }

    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""
    logger.info(
        "[EVAL:sales] > evaluate_answer (score+points) | model=%s follow_ups=%d topic=%s level=%d",
        llm_model, topic_follow_up_count, active_topic or "?", level,
    )

    _common = dict(
        candidate_answer=candidate_answer,
        last_question=last_question,
        recent_context=recent_context,
        client=client,
        llm_model=llm_model,
        org_id=org_id or "",
        active_topic=active_topic,
    )

    try:
        (scoring_data, scoring_usage), (
            route, reason, points, avoid, self_corrected, points_usage, matched_resume_project,
        ) = await asyncio.gather(
            _call_scoring(
                **_common,
                level=level,
                topic_follow_up_count=topic_follow_up_count,
                topic_probe_focus=topic_probe_focus,
                job_title=job_title,
            ),
            _call_probe_points(
                **_common,
                level=level,
                question_type=question_type,
                topic_probe_focus=topic_probe_focus,
                asked_so_far=asked_so_far,
                resume_context=resume_context,
            ),
        )
        usages = [scoring_usage, points_usage]

        def _clamp(v: Any, lo: float = 0.0, hi: float = 10.0) -> float:
            try:
                return max(lo, min(hi, float(v)))
            except (TypeError, ValueError):
                return 0.0

        answers_question = scoring_data.get("answers_question", True)
        # Hard safety: scoring says unrelated subject → force off_topic redirect
        if answers_question is False and route not in RESPONSE_ROUTES and route != "pure_denial":
            logger.info("[EVAL:sales] answers_question=false — forcing off_topic redirect")
            route = "off_topic"
            points = [
                f"Steer back to '{active_topic or last_question}': acknowledge aside, re-ask sharper"
            ]
            reason = reason or "unrelated to the question"

        # Zero only where the candidate never took a swing at the subject. off_topic keeps its
        # (near-zero) scores so the turn counts as a real attempt and the topic can reach
        # weak_exit/stalled instead of looping on redirects forever.
        if answers_question is False or route in ("clarification_request", "rephrase_request"):
            clarity = depth = specificity = grounding = overall = 0.0
        else:
            clarity = _clamp(scoring_data.get("clarity", 0))
            depth = _clamp(scoring_data.get("depth", 0))
            specificity = _clamp(scoring_data.get("specificity", 0))
            grounding = _clamp(scoring_data.get("grounding", 0))
            overall = clarity * 0.20 + depth * 0.35 + specificity * 0.20 + grounding * 0.25

        signal = _route_to_signal(route)
        action = "PROBE"
        forced = False
        zero_scores = False

        if route == "clarification_request":
            return {
                "clarity": 0.0, "depth": 0.0, "specificity": 0.0, "grounding": 0.0, "overall": 0.0,
                "action": "REPHRASE", "forced_action": True,
                "signal": signal, "signals": [signal],
                "signal_reason": reason, "points": [], "avoid": avoid,
                "reason": "clarification request — zero scores",
                "_llm_usage": usages,
            }
        if route == "rephrase_request":
            action, forced, zero_scores = "ACCEPT_REPHRASE", True, True
        elif route == "off_topic":
            # REDIRECT frames the next question; the turn is still scored and counted.
            action, forced, zero_scores = "REDIRECT", True, False
        elif route == "pure_denial":
            pass  # TopicState closes on denial; keep scored lows if any
        elif route == "mastery":
            action = "PROBE"  # streak / saturation may MOVE_ON

        if self_corrected and not zero_scores:
            clarity = min(10.0, clarity + 1.5)
            depth = min(10.0, depth + 1.5)
            overall = min(10.0, clarity * 0.20 + depth * 0.35 + specificity * 0.20 + grounding * 0.25)

        if zero_scores:
            clarity = depth = specificity = grounding = overall = 0.0

        score_reason = str(scoring_data.get("reason", ""))[:120]
        logger.info(
            "[EVAL:sales] [OK] route=%s signal=%s action=%s points=%d | c=%d d=%d s=%d g=%d",
            route, signal, action, len(points),
            int(clarity), int(depth), int(specificity), int(grounding),
        )

        return {
            "clarity": clarity, "depth": depth,
            "specificity": specificity, "grounding": grounding,
            "overall": overall,
            "action": action,
            "forced_action": forced if action != "PROBE" else False,
            "signal": signal,
            "signals": [signal],
            "signal_reason": reason,
            "points": points,
            "avoid": avoid,
            "reason": score_reason or reason or route,
            "_llm_usage": usages,
            "matched_resume_project": matched_resume_project,
        }

    except Exception as e:
        logger.error(
            "[EVAL_FALLBACK:sales] evaluate_answer failed: %s: %s | answer=%r",
            type(e).__name__, e, (candidate_answer or "")[:300],
        )
        return {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
            "overall": 1.3,
            "action": "PROBE",
            "signal": "probe",
            "signals": ["probe"],
            "signal_reason": f"eval recovery — {type(e).__name__}: {str(e)[:120]}",
            "points": [
                "Stay on the active topic; ask one concrete follow-up on what they just said"
            ],
            "avoid": [],
            "reason": "eval recovery (llm slow/unavailable)",
            "matched_resume_project": None,
            "is_eval_recovery": True,
        }
