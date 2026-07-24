"""
interview/conversational/brief.py
==================================
Sales-module InterviewBrief generation. Same pipeline shape as
interview.tech.brief (deterministic extraction -> role understanding ->
main LLM call -> dedup -> topup), but the main system prompt is rewritten so
topic selection, anchor choice, and ROLE_TOPIC generation are calibrated to
sales substance (deals, quota, pipeline, objections, methodology depth like
MEDDIC/SPIN/BANT) instead of engineering substance.

Flow:
  1. brief_extraction.run_extraction() — reused unchanged from interview.tech
       (pure Python, zero LLM, domain-independent resume/JD parsing)
  2. _understand_role() — small LLM call, JD + job_title only (no resume),
       sales-flavored: what does this SALES role actually need
  3. _call_llm_for_brief() — main LLM call: tagging, relevance filtering,
       anchor selection, probe guidance, role topics, strategy — sales rubric
  4. InterviewBrief.model_validate() — Pydantic validates output before use
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from openai import AsyncOpenAI

from interview.agent_runtime_utils import token_limit_kwarg
from interview.conversational.brief_extraction import run_extraction
from interview.tech.brief import InterviewBrief, TopicItem, RoleContext, _dedup_any_overlap  # noqa: F401 -- RoleContext re-exported for interview.conversational.__init__

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# LLM system prompt -- sales rubric: JD-driven selection + anchor
# selection + probe guidance + role topics + strategy.
# ---------------------------------------------------------------------------

_BRIEF_SYSTEM = """\
You are an expert VP of Sales and sales hiring manager running a JD-driven sales interview.
You receive a pre-extracted, structured job description and (optionally) custom questions.
No resume. No candidate history. Your jobs:
  1. Select the TOPIC POOL for this interview from the JD (see TOPIC SELECTION below)
  2. Turn every selected JD item into a TopicItem with focused sales probe guidance
  3. Select the anchor topic (the most strategically valuable JD requirement to open on)
  4. Generate ROLE_TOPIC TopicItems from YOUR expert sales domain knowledge of the role — not from JD
  5. Write interview_strategy, red_flags — calibrated to role and level
  6. The interview_strategy must be SPECIFIC to this exact role and level — not generic filler
  7. Custom questions (if provided) are added on top — asked EXACTLY as written

━━━ TOPIC SELECTION ━━━
Build the topic pool from these sources in priority order:

  1. JD MUST-HAVES (all of them, no skipping): Every must-have skill/requirement/motion becomes a
     topic (e.g. "objection handling", "cold calling", "outbound sequencing"). topic_type="skill", is_jd_must_have=true.
  2. JD NICE-TO-HAVES (strongest 2-4): Pick the most role-critical nice-to-haves to fill
     the topic budget. topic_type="skill", is_jd_must_have=false.
  3. ROLE_TOPICS (exactly 2): From YOUR expert domain knowledge of this role — see ROLE_TOPIC
     GENERATION below. topic_type="role_topic".
  4. CUSTOM QUESTIONS (all of them): Every client-provided custom question becomes its own
     TopicItem added ON TOP of the 10-12 base. topic_type="role_topic",
     is_custom_question=true. Asked EXACTLY as written — probe_focus must be EMPTY ("").

━━━ TOPIC COUNT ━━━
Base cap: topic_pool must contain BETWEEN 10 AND 12 TopicItems (all JD must-haves +
selected JD nice-to-haves + 2 expert role topics), BEFORE counting custom questions.
  - If JD must-haves alone exceed 12, include all must-haves (hard floor — never drop a must-have)
    and skip all nice-to-haves.
  - Fewer than 10 (excluding custom questions) is INVALID — pull in more JD nice-to-haves
    or additional ROLE_TOPIC until you reach 10.
  - More than 12 (excluding custom questions, excluding extra must-haves overflow): cut
    lowest-relevance nice-to-haves first.

Custom questions are ADDITIVE — never counted against the 10-12 base. Never drop them.
Before returning JSON: COUNT topic_pool excluding is_custom_question=true items → must be 10-12.
Then verify every custom question appears as its own item on top of that count.

━━━ QUESTION LEVEL (1-4) ━━━
Each level changes: probing depth, question difficulty, what counts as a "good" answer,
how many follow-ups are expected, and what the interviewer is looking for. This is a
FIXED, admin-selected level for this job — it does not vary by candidate.

LEVEL 1 (basic, 0-1.5yr-equivalent):
  Evaluation goal: understand how they think about selling, not just their numbers.
  Depth: surface ownership, specific outreach/call they ran, why they chose an approach.
  Avoid: territory-level strategy, negotiation at scale, team leadership, large-deal tradeoffs.
  Anchor: most hands-on selling experience/skill from the JD.
  interview_strategy: Focus on learning mindset, decision reasoning, and real hands-on selling involvement.

LEVEL 2 (moderate, 1.5-4yr-equivalent):
  Evaluation goal: verify real quota ownership and individual deal decision-making.
  Depth: what was specifically theirs, what deal decisions they made, what fell through and why.
  Avoid: pure theory, generic methodology definitions with no real deal/motion behind them.
  Anchor: the most critical JD must-have skill.
  interview_strategy: Push past generic language. Probe one real objection or tradeoff per major topic.

LEVEL 3 (experienced, 4-8yr-equivalent):
  Evaluation goal: deal judgment and real consequence of decisions.
  Depth: negotiation decisions, tradeoffs, what fell through at scale, alternatives considered.
  Avoid: basic sales-process concepts, surface familiarity with methodology names.
  Anchor: the most strategically complex JD requirement.
  interview_strategy: Go directly to hard tradeoffs. Vague answers are a red flag — probe harder.

LEVEL 4 (advanced/senior, 8yr+-equivalent):
  Evaluation goal: territory/team-level judgment, org-level impact, high-stakes decision quality.
  Depth: territory-level decisions, team or process impact, high-stakes negotiation tradeoffs.
  Avoid: individual deal mechanics, basic anything.
  Anchor: the skill most central to the role's strategic initiatives.
  interview_strategy: Peer-level conversation. Challenge their reasoning directly.

━━━ ROLE_TOPIC GENERATION (critical — this is where the interview gets depth) ━━━
Generate ROLE_TOPICs from your expert sales knowledge of the role. These are conceptual
areas that every competent person in this role should know — regardless of what is on the JD.
The goal: test sales depth beyond what the JD explicitly asked for.

Rules:
  - EXACTLY 2 role topics. Choose the 2 highest-signal concepts for this role.
  - Do NOT copy JD items — completely independent.
  - Each role_topic must be specific enough that Ishitha can ask one concrete, grounded question about it.
  - Role topics must change based on level: same concept, different depth.

Examples for common sales sub-roles (pick the 2 strongest for the actual role):
  SDR/BDR (outbound):        Cold outreach sequencing and cadence design, Objection handling on the first call
  Account Executive (SMB):   Discovery-to-close velocity, Handling price objections at speed
  Account Executive (Ent.):  Multi-stakeholder deal navigation, Champion-building in complex orgs
  Account Manager / CS:      Renewal and expansion strategy, Churn-risk early detection
  Sales Manager / Lead:      Pipeline coaching and forecast rollups, Rep ramp and onboarding

━━━ PROBE_FOCUS GENERATION ━━━
probe_focus is ONE short paragraph (2-3 sentences) written in plain English that tells the
interviewer exactly what to probe for on this topic, at THIS topic's level. Not a list of
keywords.

Rules:
  - Write it to cover, in prose: (1) a concrete mechanism or decision point, (2) an objection/tradeoff/constraint
    angle, (3) an outcome/metric or judgment angle.
  - Calibrate depth to level.
  - CUSTOM QUESTIONS: probe_focus must be EMPTY string (""). The question IS the directive.

━━━ CUSTOM QUESTIONS — TOP PRIORITY ━━━
The user message may include a list of CLIENT CUSTOM QUESTIONS. Rules:
  - Every custom question becomes its own TopicItem. ALL of them, no exceptions.
  - topic_type="role_topic", is_custom_question=true.
  - title = the custom question itself (verbatim).
  - full_description = the custom question itself (verbatim).
  - probe_focus = "" (empty — the question is asked exactly as written, no reformulation).
  - probe_avoid = [] (empty).
  - is_jd_must_have = false.
  - These are added ON TOP of the 10-12 base — never displace JD or role topics.
  - Custom question TopicItems are asked FIRST in the interview, in the order they were provided.

━━━ MANDATORY ━━━
  - topic_pool base size (excluding custom questions): 10-12 TopicItems, both bounds mandatory.
  - All JD must-haves are ALWAYS included — never dropped.
  - Exactly 2 ROLE_TOPIC items from expert knowledge (is_custom_question=false).
  - Custom questions: ALL included, probe_focus="", added on top of the base count.
  - anchor_topic must also be the FIRST item in topic_pool.
  - Return ONLY valid JSON. No markdown. No explanation.

This level is fixed and admin-selected — always echo back the exact LEVEL given to you,
never infer or change it.

Schema:
{
  "role_context": { "must_have_skills": [str] },
  "level": 1|2|3|4,
  "candidate_summary": str,
  "anchor_topic": TopicItem,
  "topic_pool": [TopicItem],
  "interview_strategy": str,
  "red_flags": [str]
}

TopicItem schema:
{
  "id": str,
  "topic_type": "skill"|"role_topic",
  "title": str,
  "full_description": str,
  "tech_stack": [str],
  "impact": str,
  "is_jd_must_have": bool,
  "is_custom_question": bool,
  "why_relevant": str,
  "probe_focus": str,
  "probe_avoid": [str]
}

OUTPUT SIZE RULES:
  - full_description: 1–2 sentences. Specific enough to ground a question.
  - why_relevant: 1 short phrase.
  - probe_focus: 2-3 sentences of plain English. Follow PROBE_FOCUS GENERATION rules above.
  - probe_avoid: max 2 items, 3–5 words each.
  - interview_strategy: 3–5 sentences. Must be specific to this role, level, and candidate — not generic.
  - candidate_summary: 1–2 sentences.
  - red_flags: up to 5 items, short phrases.
"""


# ---------------------------------------------------------------------------
# Role understanding -- small LLM call, JD only, BEFORE resume is filtered
# ---------------------------------------------------------------------------

_ROLE_UNDERSTANDING_SYSTEM = """\
You are an expert VP of Sales. You are given a job title and a job description —
no resume yet. Your only job: explain what this specific sales role actually needs to
succeed, so a later step can judge a candidate's resume against a real bar instead
of just listing everything they've sold.

Write 4-6 sentences covering:
  - What this role actually does day to day (not the generic "sales" stereotype —
    read the JD's actual motion: outbound/inbound, deal size, cycle length, segment).
  - The 3-5 skills/competencies that matter MOST for this specific JD (not a generic
    list for the job title — pull from what this JD emphasizes: e.g. cold outreach vs
    enterprise negotiation vs renewal management).
  - What "irrelevant" looks like for this role — the kind of resume content a
    candidate might have that this role does NOT care about, so it can be excluded
    later (e.g. enterprise 9-month-cycle deal experience for a fast SMB transactional
    role, or pure customer-success experience for a pure hunting/outbound role).

Be concrete and specific to THIS JD. Do not write generic role descriptions that
could apply to any sales job with this title. Return plain text, no markdown, no JSON.
"""


async def _understand_role(
    *,
    job_title: str,
    jd_data: dict,
    openai_client: AsyncOpenAI,
    llm_model: str,
    usage_sink: Any = None,
) -> str:
    """Reads JD + title only (no resume) and states what the role actually needs.
    Runs before resume filtering so topic selection has a real bar to judge against."""
    jd_text = json.dumps(jd_data, indent=None)
    if len(jd_text) > 4000:
        jd_text = jd_text[:4000] + " …(truncated)"
    user_prompt = f"JOB TITLE: {job_title}\n\nJOB DESCRIPTION DATA:\n{jd_text}"

    response = await openai_client.chat.completions.create(
        model=llm_model,
        temperature=0,
        **token_limit_kwarg(llm_model, 400),
        messages=[
            {"role": "system", "content": _ROLE_UNDERSTANDING_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        timeout=15,
    )

    if usage_sink is not None and response.usage is not None:
        from billing.billing import extract_usage  # noqa: PLC0415
        usage_sink(extract_usage(response.usage, llm_model))

    understanding = (response.choices[0].message.content or "").strip()
    logger.info("[BRIEF:sales] role understanding: %s", understanding[:200])
    return understanding


_TOPUP_SYSTEM = """\
You are an expert VP of Sales. A topic_pool for this interview lost some items
to deduplication and now needs topping up to reach the 12-topic target. Generate
ADDITIONAL role-knowledge TopicItems from your own expert sales domain knowledge of the
role — testing conceptual/practical depth that any competent salesperson in this role should
have, independent of the JD wording.

Rules:
  - Do NOT duplicate any concept already covered by an existing topic (titles and
    descriptions are listed below) — check methodology/skill overlap, not just title text.
  - Each new topic must be answerable with a concrete, grounded question — not
    generic ("tell me about objection handling") but specific ("how do you decide when
    to bring in a discount versus hold the line on price").
  - topic_type is "role_topic", is_custom_question=false.
  - probe_focus: 2-3 sentences of plain English, CONCRETE to this topic's own
    full_description, covering:
      1. A specific mechanism or decision point for this topic.
      2. A specific objection/tradeoff/constraint angle for this topic.
      3. A specific outcome/metric or judgment angle for this topic.
    Calibrate depth to the given level (1=basic through 4=advanced).
    Example for a topic on discount strategy: "Ask what discount approval threshold they used
    and why. Push on how they held price against a competitor bid. Then ask what close-rate
    impact the discounting actually had."
  - Return ONLY valid JSON: {"topics": [TopicItem, ...]}. No markdown, no explanation.

TopicItem schema:
{
  "id": str, "topic_type": "role_topic", "title": str,
  "full_description": str, "tech_stack": [str], "impact": str,
  "is_jd_must_have": false, "is_custom_question": false, "why_relevant": str,
  "probe_focus": str, "probe_avoid": [str]
}
"""


async def _topup_role_topics(
    *,
    job_title: str,
    level: int,
    role_understanding: str,
    existing_topics: list[TopicItem],
    needed: int,
    openai_client: AsyncOpenAI,
    llm_model: str,
    usage_sink: Any = None,
) -> list[TopicItem]:
    """Generates extra ROLE_TOPIC items when dedup drops the pool below the
    12-topic target, instead of re-admitting the duplicates dedup just removed."""
    existing_summary = "\n".join(
        f"- {t.title}: {t.full_description}" for t in existing_topics
    )
    user_prompt = (
        f"ROLE: {job_title}  |  LEVEL: {level}\n\n"
        f"WHAT THIS ROLE ACTUALLY NEEDS:\n{role_understanding}\n\n"
        f"EXISTING TOPICS (do not duplicate any of these):\n{existing_summary}\n\n"
        f"Generate exactly {needed} additional role-knowledge topic(s) now."
    )

    base_tokens = max(600, needed * 300)
    for max_tokens in (base_tokens, base_tokens * 2):
        try:
            response = await openai_client.chat.completions.create(
                model=llm_model,
                temperature=0,
                **token_limit_kwarg(llm_model, max_tokens),
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": _TOPUP_SYSTEM},
                    {"role": "user", "content": user_prompt},
                ],
                timeout=20,
            )
        except Exception:
            logger.warning("[BRIEF:sales] topup call failed, shipping brief with fewer topics", exc_info=True)
            return []

        if usage_sink is not None and response.usage is not None:
            from billing.billing import extract_usage  # noqa: PLC0415
            usage_sink(extract_usage(response.usage, llm_model))

        try:
            parsed = json.loads(response.choices[0].message.content or "{}")
            return [TopicItem.model_validate(t) for t in parsed.get("topics", [])][:needed]
        except Exception:
            logger.warning(
                "[BRIEF:sales] topup response truncated/invalid at max_tokens=%d, retrying", max_tokens,
            )
            continue

    logger.warning("[BRIEF:sales] topup still failed after retry, shipping brief with fewer topics")
    return []


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def generate_interview_brief(
    *,
    candidate_name: str,
    job_title: str,
    jd_data: dict,
    custom_questions: list[str],
    openai_client: AsyncOpenAI,
    llm_model: str,
    level: int = 2,
    usage_sink: Any = None,
) -> InterviewBrief:
    llm_input_block, role_understanding = await asyncio.gather(
        run_extraction(
            jd_data=jd_data,
            candidate_name=candidate_name,
            job_title=job_title,
            level=level,
            custom_questions=custom_questions or [],
        ),
        _understand_role(
            job_title=job_title,
            jd_data=jd_data,
            openai_client=openai_client,
            llm_model=llm_model,
            usage_sink=usage_sink,
        ),
    )

    user_prompt = (
        f"WHAT THIS ROLE ACTUALLY NEEDS (read this first — it is the relevance bar "
        f"for every topic you select below):\n{role_understanding}\n\n"
        f"{llm_input_block}\n"
        f"LEVEL: {level}\n"
        f"Generate the InterviewBrief JSON now. Keep all text fields SHORT (see SPEED RULES)."
    )

    raw = ""
    for max_tokens in (5000, 8000):
        stream = await openai_client.chat.completions.create(
            model=llm_model,
            temperature=0,
            response_format={"type": "json_object"},
            **token_limit_kwarg(llm_model, max_tokens),
            stream=True,
            stream_options={"include_usage": True},
            messages=[
                {"role": "system", "content": _BRIEF_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            timeout=30,
        )

        chunks: list[str] = []
        usage_data = None
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                chunks.append(chunk.choices[0].delta.content)
            if hasattr(chunk, "usage") and chunk.usage:
                usage_data = chunk.usage

        if usage_sink is not None and usage_data is not None:
            from billing.billing import extract_usage  # noqa: PLC0415
            usage_sink(extract_usage(usage_data, llm_model))

        raw = "".join(chunks).strip()
        if not raw:
            raise ValueError("[BRIEF:sales] empty response from LLM")

        try:
            parsed = json.loads(raw)
            break
        except json.JSONDecodeError:
            logger.warning("[BRIEF:sales] truncated JSON at max_tokens=%d, retrying", max_tokens)
            continue
    else:
        raise ValueError(f"[BRIEF:sales] LLM response still truncated after retry: {raw[-200:]!r}")

    brief = InterviewBrief.model_validate(parsed)
    brief.topic_pool = _dedup_any_overlap(brief.topic_pool)

    non_custom_count = sum(1 for t in brief.topic_pool if not t.is_custom_question)
    if non_custom_count < 12:
        topup = await _topup_role_topics(
            job_title=job_title,
            level=level,
            role_understanding=role_understanding,
            existing_topics=brief.topic_pool,
            needed=12 - non_custom_count,
            openai_client=openai_client,
            llm_model=llm_model,
            usage_sink=usage_sink,
        )
        if topup:
            logger.info(
                "[BRIEF:sales] topped up %d role topic(s) after dedup: %s",
                len(topup), [t.title for t in topup],
            )
            brief.topic_pool.extend(topup)

    logger.info(
        "[BRIEF:sales] LLM brief generated: %d topics | anchor=%r | level=%s",
        len(brief.topic_pool), brief.anchor_topic.title, brief.level,
    )
    return brief
