"""
interview/tech/scoring.py
=========================
Two parallel LLM calls per turn (kept separate on purpose):

  1) _call_scoring  — quality scores only (clarity/depth/specificity/grounding)
  2) _call_probe_points — route + next-question POINTS (no 10-D signal taxonomy)

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
# Turns that do NOT count as a follow-up attempt on the topic. Only routes where the
# candidate never actually took a swing belong here: they asked US to repeat, or they
# asked to restart their own answer. off_topic is deliberately NOT in this set — a
# candidate who answers the wrong thing has still burned a turn, and excluding it made
# redirect loops unexitable (follow_up_turns/consecutive_zero_scores never advanced, so
# weak_exit and dry_topic could never fire).
NON_FOLLOWUP_SIGNALS: frozenset[str] = frozenset({
    "clarification_request",
    "rephrase_request",
})
# Deprecated empty stubs — keep import sites from breaking during transition
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
# Call 1 — scoring only
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
    _level_bar = {
        1: "LEVEL 1 (basic): grade for genuine fundamentals, not polish.",
        2: "LEVEL 2 (moderate): expect real working knowledge, not textbook recall.",
        3: "LEVEL 3 (experienced): expect applied depth — tradeoff, constraint, or judgment.",
        4: "LEVEL 4 (advanced): expect strategic judgment and failure-mode awareness.",
    }.get(level, "Grade for genuine understanding, not polish.")

    system = (
        "You are an experienced interviewer scoring a candidate's answer.\n"
        "Output ONLY valid JSON:\n"
        '{"answers_question":true/false,"clarity":0-10,"depth":0-10,"specificity":0-10,'
        '"grounding":0-10,"reason":"<one phrase from their answer>"}\n\n'
        "answers_question=false ONLY when the SUBJECT MATTER is completely unrelated to the "
        "question — they talked about their weekend, or a different technology entirely, or pure "
        "filler like 'I am ready'.\n"
        "answers_question=true for EVERY attempt that is about the asked subject, no matter how "
        "bad: vague, hand-wavy, circular, restating the question back, or flatly wrong. These are "
        "on-topic failures — score them low (0-3), do NOT mark them unrelated.\n"
        "Test: strip the filler. Is what remains ABOUT the asked subject? If yes → true.\n"
        "Example: asked about catching database exceptions, they say 'the specific catches help "
        "a lot in doing this kind of task' → true, about the subject, score ~1.\n"
        "If answers_question=false, set all four scores to 0.\n\n"
        "Voice transcript — score meaning, not grammar. Self-correction is good: score the landing.\n"
        "Active wrong claims score LOWER than 'I don't know'. Fluency is not correctness.\n\n"
        f"Role: {job_title or 'not specified'} | Topic: {active_topic or 'general'}\n"
        f"{_level_bar}\n"
        + (f"Probe focus: {topic_probe_focus}\n" if topic_probe_focus else "")
        + "\n"
        "CLARITY (20%): answered what was asked?\n"
        "DEPTH (35%): HOW/WHY, not just WHAT?\n"
        "SPECIFICITY (20%): operational detail only someone who did the work would know?\n"
        "GROUNDING (25%): sounds lived-in vs rehearsed case study?\n"
    )

    stream = await asyncio.wait_for(
        client.chat.completions.create(
            model=llm_model,
            temperature=EVAL_TEMPERATURE,
            **token_limit_kwarg(llm_model, 120),
            stream=True,
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": (
                        f"QUESTION: {last_question}\n\n"
                        f"ANSWER: {candidate_answer}\n\n"
                        f"FOLLOW-UPS ON THIS TOPIC SO FAR: {topic_follow_up_count}\n\n"
                        f"RECENT CONVERSATION:\n{recent_context}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            stream_options={"include_usage": True},
            store=True,
            metadata=llm_metadata(call_type="eval_scoring", level=level, org_id=org_id or ""),
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
# Call 2 — route + probe points (replaces 10-D signal classification)
# ---------------------------------------------------------------------------
_POINTS_SYSTEM = """\
You are the routing brain for a live technical interview. You do TWO jobs:
  (A) Detect response-shape routes that must short-circuit probing.
  (B) Otherwise invent the best 1–3 POINTS a real interviewer would use to ask the next question.

Output ONLY valid JSON on the last line (you may reason briefly above it):
{{
  "thought_process": "<2-3 sentences of deep reasoning analyzing the transcript to figure out what to ask next>",
  "route": "<one of: clarification_request|rephrase_request|off_topic|pure_denial|mastery|probe>",
  "reason": "<3-12 word quote from their answer, or why>",
  "matched_resume_project": "<Name of the specific project, tool, or repository from {resume_context} that matches this topic, else null>",
  "points": ["<concrete ask-angle>", "..."],
  "avoid": ["<already covered / do not re-ask>", "..."],
  "self_corrected": true|false
}}

════════════════════════════════════════
PHASE A — RESPONSE-SHAPE GATES (check FIRST, exclusive, empty points)
════════════════════════════════════════

1) clarification_request — they are asking YOU to clarify/repeat/rephrase the QUESTION,
   or checking the connection ("can you hear me?", garbled/noise transcript with no real answer).
   NOT a weak technical answer. → route=clarification_request, points=[]

2) rephrase_request — they want to RESTART or correct THEIR OWN answer
   ("let me say that again", "I misspoke"). → route=rephrase_request, points=[]

3) pure_denial — CRITICAL: If the candidate says "I don't know", "not sure", "forgot", "no idea" and makes ZERO attempt to guess.
   Mechanical test: strip denial phrases; if NOTHING technical remains → pure_denial.
   → route=pure_denial, points=["Step down warmly on the SAME skill — easier adjacent question"]

4) off_topic — SUBJECT MISMATCH ONLY. They talked about a COMPLETELY DIFFERENT subject
   than the active topic (their weekend, an unrelated technology, a different job).
   Mechanical test: name the subject of their answer. Is it a DIFFERENT subject from the
   question's subject? Only then → off_topic.

   NEVER off_topic (these are route=probe — they are ON the subject, just badly):
     - vague, hand-wavy, or unclear answers about the asked topic
     - circular answers that restate the question back at you
     - confidently wrong answers about the asked topic
     - answers that name the right concepts with no substance behind them
   VAGUENESS IS NOT OFF-TOPIC. If your `reason` would be "this is vague" or "no specifics",
   the route is probe, not off_topic. off_topic is about WHAT they talked about, never about
   HOW WELL they talked about it.
   When off_topic genuinely fires, points MUST tell the interviewer how to STEER BACK.
   → route=off_topic

5) mastery — answer already has mechanism + cost/tradeoff + edge/failure awareness (+ ownership if real work).
   Nothing important left to ask on this thread.
   → route=mastery, points=[] (or one optional edge-of-judgment point only if truly useful)

════════════════════════════════════════
PHASE B — route=probe — GENERATE POINTS (not signal labels)
════════════════════════════════════════
You are training the next interviewer turn. Read: last question, answer, recent conversation,
active topic, what was already asked. Invent 1–3 POINTS that are:
  - Specific to THEIR words and THIS topic (not generic "ask about edge cases")
  - The highest-value missing angles a sharp interviewer would chase next
  - Aware of prior turns on this topic (do not repeat covered ground — put those in avoid)

COVERAGE DIMENSIONS — a real interviewer works a topic from several sides, not one.
Look at ALREADY ASKED to see which of these this topic has already had, then pick a
dimension that has NOT been covered yet:

  MECHANISM   — how it actually works. Trace a concrete input through it.
  TOOLS       — what they actually reach for, and why that one over the alternative.
  APPLICATION — where they'd use it, and where they would NOT (the boundary matters).
  EXAMPLE     — a specific time this came up in real work. Concrete, not hypothetical.
  OWNERSHIP   — what THEY decided, when the answer is all "we" or passive voice.
  TRADEOFF    — what it costs, under a named constraint (scale, latency, memory, team).
  FAILURE     — what breaks: null, empty, concurrent, retry storm, queue full.
  OUTCOME     — what it changed for the user or the business, when the answer is a
                textbook checklist with no consequences attached.

Rules for points:
  - Max 3. Prefer 1–2 sharp points over a checklist.
  - ROTATE DIMENSIONS. If the last question on this topic was MECHANISM and they
    answered it at all, the next one should NOT be MECHANISM again. A topic that got
    three mechanism questions in a row was interviewed badly, however sharp each one
    was on its own.
  - Prefix each point with its dimension in caps, e.g.
    "OWNERSHIP: they said 'we chose Postgres' — find out whether that call was theirs".
  - Each point = one concrete angle the speaking LLM can turn into ONE question.
  - Never script the exact spoken question — give the angle + why it matters.
  - Socratic falsify if they stated something actively wrong (do not correct them).
  - avoid[] = angles/facts already covered or declined — speaking LLM must not re-ask these.

WHEN THE LAST ANSWER WAS EMPTY OR VAGUE: do not re-ask the same dimension in new words.
Either go much smaller and more concrete within it (one input, one line, one yes/no call),
or switch dimension entirely — EXAMPLE and TOOLS often unlock a candidate who is drowning
in an abstract MECHANISM question, because they can talk about what they actually did.

self_corrected: true only if they caught and fixed their OWN error mid-answer.

Level {level} calibrates how hard to push in the points (junior = gentler TRACE;
senior = judgment/cost/failure). Topic: {active_topic}. Question type: {question_type}.

CANDIDATE BACKGROUND:
{resume_context}

════════════════════════════════════════
RESUME GROUNDING (follow-ups only — never the opening question on a topic)
════════════════════════════════════════
The opening question on a topic is always asked cold, with no resume context. That is
decided upstream — by the time you are generating POINTS, the candidate has already
answered once, so grounding the FOLLOW-UP in their real work is not only allowed, it is
what a real interviewer does. They just told you how they think about the skill in the
abstract; now find out whether they have actually done it.

`matched_resume_project`: if the active topic lines up with a specific project, repo,
employer, or tool in the background above, output that name. Otherwise null. Match on
the SKILL, not on keywords — a Flask API project matches "exception handling" because
that is where exceptions get caught, even if the resume never says "exception".

When there IS a match, at least one of your points MUST tie the topic to that project,
and it must stay a TECHNICAL question — "you built X, so how did you handle Y in it",
never "tell me about X". Pick the angle that fits what they just said:

  METRICS     — scale, latency, throughput, data volume, error rate on that project.
  TOOLS       — what they actually used there, and why that over the alternative.
  OWNERSHIP   — what THEY built or decided on it, when the answer is all "we".
  EXAMPLE     — a specific thing that happened while building it.
  USE CASE    — where this technique applied in that project, and where it did not.
  APPLICATION — how they'd apply the concept they just described inside that project.
  ANALOGY     — make them map the concept onto their own system to prove they get it.
  STANDARDS   — whether their approach there matches how it is normally done, and why
                they diverged if they did.

EVERY TOPIC GETS A DIFFERENT PROJECT QUESTION:
The same project will legitimately match several topics — one real system touches
databases, APIs, error handling, and deployment all at once. That is fine. What is NOT
fine is asking about the same PART of it twice. Check "PROJECTS ALREADY USED ON EARLIER
TOPICS" in the user message: if this project appears there, your point must go after a
different piece of that system — the piece the CURRENT topic is actually about.

  Good: InsightRAG used for "vector search" (how they chose the index), then later for
        "error handling" (what happens when the embedding service times out).
  Bad:  InsightRAG used for "vector search", then for "error handling" but the question
        is still about the retrieval pipeline. Same ground, new label.

The active topic decides which part of the project you ask about — never the other way
around. If you cannot find a genuinely different angle on the project for THIS topic,
output null for matched_resume_project and write ordinary points instead.

Rules:
  - Ground follow-ups in the project repeatedly across a topic when it keeps producing
    good questions — not just once. Each one must open a NEW angle from the list above.
  - Never ask whether they built it, or to describe it. You already know they did.
  - If the resume has no real match for this topic, output null and generate ordinary
    points. A forced project reference is worse than none — it tells the candidate you
    are pattern-matching rather than listening.
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
    used_project_skills: set[tuple[str, str]] | None = None,
) -> tuple[str, str | None, list[str], list[str], bool, dict, str | None]:
    """
    Returns (route, reason, points, avoid, self_corrected, usage, matched_resume_project).
    """
    _asked = "\n".join(f"- {q}" for q in (asked_so_far or [])[-8:]) or "(none yet)"
    _focus = topic_probe_focus or "(none)"
    # Projects already used on EARLIER topics. asked_so_far is cleared on every topic
    # change, so without this the points call has no way to know it already grounded a
    # question in this project -- and every topic would reach for the same project detail.
    _used_pairs = sorted({
        f"{proj} (for: {skill})" for proj, skill in (used_project_skills or set())
        if proj and skill and skill != (active_topic or "").strip().lower()
    })
    _used_block = "\n".join(f"- {u}" for u in _used_pairs) or "(none yet)"
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
        f"PROJECTS ALREADY USED ON EARLIER TOPICS (ask a DIFFERENT angle on these):\n"
        f"{_used_block}\n\n"
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
            metadata=llm_metadata(call_type="eval_probe_points", level=level, org_id=org_id or ""),
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
        points = ["Warm step-down on the SAME skill — easiest adjacent question they might know"]
    elif route == "probe" and not points:
        points = [
            "Push one concrete missing angle from their last answer "
            "(mechanism, tradeoff, failure mode, or ownership) — stay on this topic"
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
    used_project_skills: set[tuple[str, str]] | None = None,
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
            "points": ["Warm step-down on the SAME skill — easiest adjacent question"],
            "avoid": [],
            "reason": "empty answer",
            "matched_resume_project": None,
        }

    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""
    logger.info(
        "[EVAL:tech] > evaluate_answer (score+points) | model=%s follow_ups=%d topic=%s level=%d",
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
                used_project_skills=used_project_skills,
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
            logger.info("[EVAL] answers_question=false — forcing off_topic redirect")
            route = "off_topic"
            points = [
                f"Steer back to '{active_topic or last_question}': acknowledge aside, re-ask sharper"
            ]
            reason = reason or "unrelated to the question"

        # Zero only where the candidate never took a swing at the subject: an unrelated
        # answer, or a request aimed at us rather than an attempt. off_topic keeps whatever
        # the scorer gave it (near-zero anyway) so the turn registers as a real attempt and
        # the topic can reach weak_exit/dry_topic instead of looping forever.
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
            # REDIRECT frames the question, but the turn is scored and counted like any
            # other attempt — a wrong-subject answer is still a turn the candidate spent.
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
            "[EVAL] [OK] route=%s signal=%s action=%s points=%d | c=%d d=%d s=%d g=%d",
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
            "[EVAL_FALLBACK] evaluate_answer failed: %s: %s | answer=%r",
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
            "reason": "fallback_eval_error",
            "matched_resume_project": None,
            "is_eval_recovery": True,
        }
