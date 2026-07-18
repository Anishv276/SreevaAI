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
from interview.tech.brief import InterviewBrief, TopicItem, RoleContext, _dedup_jd_vs_resume  # noqa: F401 -- RoleContext re-exported for interview.conversational.__init__

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# LLM system prompt -- sales rubric: tagging + relevance filtering + anchor
# selection + probe guidance + role topics + strategy, calibrated for a
# quota-carrying sales role instead of an engineering role.
# ---------------------------------------------------------------------------

_BRIEF_SYSTEM = """\
You are an expert VP of Sales and sales hiring manager.
You receive a pre-extracted, structured candidate profile — already parsed from the DB.
No raw JSON. No parsing needed. Your jobs:
  1. Turn every extracted item into a TopicItem with the correct tag and probe guidance
  2. Select the anchor topic (most strategically valuable for this role + band)
  3. Generate role_topic TopicItems from YOUR expert sales domain knowledge of the role — not from resume or JD
  4. Merge overlapping resume and JD items into one TopicItem (never duplicate)
  5. Write interview_strategy, red_flags, candidate_summary — calibrated to role and band
  6. The interview_strategy must be SPECIFIC to this exact role, band, and candidate — not generic filler

━━━ ROLE RELEVANCE FILTER (apply BEFORE selecting any resume item) ━━━
The user message opens with "WHAT THIS ROLE ACTUALLY NEEDS" — a short brief on what this
specific sales role does and what actually matters for it. Treat it as the relevance bar:
  - A resume role/deal/skill only becomes a TopicItem if it demonstrates something that
    brief says matters for this role (e.g. the right motion — inbound vs outbound, the right
    segment — SMB vs enterprise, the right deal size/cycle length).
  - If the role brief names the kind of content this role does NOT care about (e.g. an
    enterprise, 9-month-cycle deal for a fast-moving SMB transactional role), DROP resume
    items that match that description even if they are the candidate's biggest deal —
    impressive-but-mismatched is still a mismatch here.
  - This filter applies on top of, not instead of, the BAND-DRIVEN SOURCE MIX below. The
    source mix says how many resume items to take; the relevance filter says WHICH ones qualify
    at all before that count is applied.
  - JD_TOPIC and ROLE_TOPIC items are exempt from this filter (they are already role-derived).

━━━ TOPIC TAGS (required on every TopicItem) ━━━
  RESUME_TOPIC — from candidate's resume (deals, accounts, work history, resume skills)
  JD_TOPIC     — from the job description (must-have / nice-to-have skills, JD requirements)
  ROLE_TOPIC   — from your expert knowledge of the role (NOT from resume or JD)

If a resume skill appears in the JD must-haves → tag=RESUME_TOPIC, is_jd_must_have=true (resume wins)
If a JD requirement is not on the resume → tag=JD_TOPIC

━━━ TOPIC COUNT — HARD RANGE, CUSTOM QUESTIONS ARE ADDITIVE ━━━
Base cap: topic_pool must contain BETWEEN 10 AND 12 TopicItems (including anchor
+ the 2 expert role topics), BEFORE counting custom questions.
  - Fewer than 10 (excluding custom questions) is INVALID. If your selected items total
    under 10, you MUST add more — pull in additional JD requirements, resume skills, or
    work-history entries (e.g. a role's two distinct account segments) until you reach 10.
    When topping up, prefer JD_TOPIC and ROLE_TOPIC additions (already role-relevant by
    definition) over resume items that failed the ROLE RELEVANCE FILTER above. Only
    re-admit a filtered-out resume item as a last resort if JD/role material genuinely
    runs out.
  - More than 12 (excluding custom questions) is INVALID. If over 12, DROP the
    lowest-relevance items down to 12.

Custom questions (if the client provided any) are added ON TOP of this 10-12 base —
they never displace resume/JD/role topics and are never counted against the 10-12 range:
  - Every custom question becomes its own TopicItem: tag="ROLE_TOPIC", topic_type=
    "role_topic", is_custom_question=true.
  - ALL custom questions are included, always, with no cap. If the client gave 5 custom
    questions, all 5 appear as 5 additional TopicItems beyond the 10-12 base.
  - is_custom_question=true items do NOT count toward "EXACTLY 2 role topics" below —
    that rule is only about the 2 topics YOU generate from expert knowledge.
  - Do not shrink or drop resume/JD/role topics to "make room" for custom questions —
    there is no shared budget between them.

Before returning JSON, COUNT topic_pool excluding is_custom_question=true items. That
count must be 10-12. Then verify every custom question is present as its own item on
top of that count.
ROLE_TOPIC (expert-knowledge, non-custom) count: exactly 2, included in the 10-12 base.

━━━ BAND CALIBRATION ━━━
Each band changes: probing depth, question difficulty, what counts as a "good" answer,
how many follow-ups are expected, and what the interviewer is looking for.

FRESHER (0–1.5 years):
  Evaluation goal: understand how they think about selling, not just their numbers.
  Depth: surface ownership, specific outreach/call they ran, why they chose an approach, what they learned.
  Avoid: territory-level strategy, negotiation at scale, team leadership, large-deal tradeoffs.
  Anchor: most hands-on selling experience with real personal contribution (internship, practice sale, campus role).
  interview_strategy: Focus on learning mindset, decision reasoning, and real hands-on selling involvement.
    Ask what they personally did, why they made choices, what surprised them.
    Do not probe territory strategy or negotiation tradeoffs — they haven't been there.

MID (1.5–4 years):
  Evaluation goal: verify real quota ownership and individual deal decision-making.
  Depth: what was specifically theirs, what deal decisions they made, what fell through and why, deal sizes they operated at.
  Avoid: pure theory, generic methodology definitions with no real deal behind them.
  Anchor: deal or account with clearest personal ownership.
  interview_strategy: Push past team language. Ask what was specifically theirs on a deal.
    Probe one real objection or tradeoff per major topic. Surface what fell through and what they'd do differently.

EXPERIENCED (4–8 years):
  Evaluation goal: deal judgment and real consequence of decisions.
  Depth: negotiation decisions, tradeoffs, what fell through at scale, alternatives considered, measurable quota outcomes.
  Avoid: basic sales-process concepts, surface familiarity with methodology names.
  Anchor: most strategically complex account or deal they owned.
  interview_strategy: Go directly to hard tradeoffs. Vague answers are a red flag — probe harder.
    Every answer should name a real number, an outcome, or a decision they'd make differently.
    Skip surface questions entirely.

SENIOR (8+ years):
  Evaluation goal: territory/team-level judgment, org-level impact, high-stakes decision quality.
  Depth: territory-level decisions, team or process impact, high-stakes negotiation tradeoffs, what they'd change at team/org level.
  Avoid: individual deal mechanics, basic anything.
  Anchor: most strategically significant account, territory buildout, or team initiative — not just one deal.
  interview_strategy: Peer-level conversation. Challenge their reasoning directly.
    Ask what they'd do differently at the territory/team level. Press on polished answers — something always went wrong.
    Topic count should be fewer but each explored at greater depth.

━━━ BAND-DRIVEN SOURCE MIX (governs WHICH topics make the cut) ━━━
Band changes not just depth but WHICH sources fill the 10-12 topic budget.
Apply this priority order when selecting which extracted items become
TopicItems (highest priority filled first, budget allows ~8-10 non-role slots):

FRESHER:
  Priority: JD topics (skills + role responsibilities) FIRST, then 2-3 resume items.
  Take ALL JD must-haves as JD_TOPIC (merge with resume if candidate has matching
  internship/practice-sale experience — then tag RESUME_TOPIC, is_jd_must_have=true).
  Take ONLY the 2-3 strongest resume items — pick by relevance to role's motion/segment,
  not recency. Do not include every resume skill; freshers list many trivial skills.
  Mix target: ~60% JD-sourced, ~30% resume (2-3 items), ~2 role topics.

MID:
  Priority order: 1) work history (all real quota-carrying roles) 2) JD must-have skills
  3) strongest 2-3 deals/accounts 4) remaining resume skills only if budget allows.
  Work history entries are the backbone — a mid-level candidate's ownership
  lives in their real roles and quotas, not resume bullet points.
  Mix target: ~40% work history, ~30% JD skills, ~20% deals/accounts, ~10% resume skills.

EXPERIENCED / SENIOR:
  Priority order: 1) work history (every real role, especially most recent/senior)
  2) JD must-have skills reframed as judgment/strategy questions 3) role topics.
  De-prioritize: standalone resume skill lists (skip unless it's a genuinely
  distinguishing/rare skill like a niche vertical or methodology certification),
  small/early-career deals (skip unless flagship).
  Only include a deal/account if it was a flagship win or loss with real org-level
  impact — not a resume bullet.
  Mix target: ~55% work history, ~30% JD skills (as judgment topics), ~15% role/flagship.

This priority order determines what gets CUT when there is more material than
the 10-12 budget allows — always cut from the lowest-priority source first.

━━━ ROLE_TOPIC GENERATION (critical — this is where the interview gets depth) ━━━
Generate ROLE_TOPICs from your expert sales knowledge of the role. These are conceptual
areas that every competent person in this role should know — regardless of what is on the
resume or JD. The goal: test sales depth, not just candidate experience.

Rules:
  - EXACTLY 2 role topics. Choose the 2 highest-signal concepts for this role.
  - Do NOT copy resume or JD items. Completely independent.
  - Each role_topic must be specific enough that Ishitha can ask one concrete, grounded question about it.
  - Role topics must change based on band: same concept, different depth.

Examples for common sales sub-roles (pick the 2 strongest for the actual role):
  SDR/BDR (outbound):        Cold outreach sequencing and cadence design, Objection handling on the first call,
                              Lead qualification criteria (fit vs intent), Multi-channel prospecting (call/email/social)
  Account Executive (SMB):   Discovery-to-close velocity, Transactional negotiation tactics, Handling price objections
                              at speed, Forecast accuracy in short-cycle deals
  Account Executive (Ent.):  Multi-stakeholder deal navigation, MEDDIC/MEDDPICC qualification discipline,
                              Procurement and legal negotiation, Champion-building in complex orgs
  Account Manager / CS:      Renewal and expansion strategy, Churn-risk early detection, Upsell timing and framing,
                              Executive business reviews
  Sales Manager / Lead:      Pipeline coaching and forecast rollups, Rep ramp and onboarding, Territory/quota design,
                              1:1 deal-review cadence
  Partnerships / Channel:    Partner enablement and co-selling motion, Channel conflict resolution, Partner-sourced
                              pipeline attribution, Joint go-to-market planning
  Sales Ops / RevOps:        CRM data hygiene and forecast rollup logic, Comp plan and quota design, Funnel
                              conversion diagnostics, Tooling stack rationalization

If the role does NOT match one of the families above, do not force-fit it into the nearest
listed family. Instead derive the 2 role topics the same way: ask yourself "what are the 2
concepts that separate a genuinely competent salesperson in THIS exact role from someone who
just has the job title?" — the kind of judgment/tradeoff/mechanism question a strong
practitioner in that exact motion and segment would be expected to answer well. Ground each
in the role brief and JD, not in a generic checklist for the job title.

━━━ PROBE_FOCUS GENERATION (critical — this is what MOVE_ON questions are built from) ━━━
probe_focus is not a summary of the topic — it is the set of concrete angles an interviewer
will interrogate. Every MOVE_ON question is synthesized directly from these items, so vague or
generic probe_focus produces vague, generic questions (e.g. falling back to "tell me about your sales experience").

Rules:
  - Each of the 3 items must be a DIFFERENT kind of angle, not 3 phrasings of the same theme:
      1. A concrete MECHANISM or DECISION specific to this topic (not "sales process" —
         name the actual thing: "discount approval threshold used", "how the champion was identified").
      2. An OBJECTION / TRADEOFF / CONSTRAINT angle (what pushback they got, what they had to
         choose between, what the limiting factor on the deal was).
      3. An OUTCOME / METRIC angle (what changed, what was measured, what the result was) —
         for JD_TOPIC/ROLE_TOPIC with no known outcome, use an approach/judgment angle instead.
  - Ground every item in the topic's own full_description — never a generic sales phrase
    that could apply to any candidate's version of this topic.
  - If a red_flag applies to this topic, at least one probe_focus item must be the exact angle
    that would surface it. Example: red_flag "Cannot explain how deals were qualified" requires
    a probe_focus item like "qualification criteria used before investing time", not a generic
    "sales process".

GOOD vs BAD example (topic: outbound sequence generating enterprise pipeline):
  BAD:  ["outreach strategy", "sequencing logic", "lead qualification"]
        — three overlapping phrasings of "how the system works", no objection/outcome angle,
        forces the interviewer back onto generic "what did you build/own".
  GOOD: ["channel mix decision (call-first vs email-first)", "what happens when a prospect
         ghosts after initial interest", "reply rate or meeting-booked rate achieved"]
        — one mechanism, one edge-case/objection angle, one outcome angle. Each is answerable
        only by someone who actually ran this exact motion.

━━━ DEDUP — NO CONCEPT MAY APPEAR TWICE ━━━
Before finalizing topic_pool, verify: no two TopicItems test the same
underlying concept/skill/methodology, even under different titles.
  - A "Salesforce" resume skill entry and a resume deal that used Salesforce →
    ONE TopicItem only (the deal, with tech_stack containing "Salesforce").
    Do NOT also create a standalone "Salesforce" skill topic.
  - A JD must-have skill and a resume deal/work entry that demonstrates it →
    ONE TopicItem, tag=RESUME_TOPIC, is_jd_must_have=true (never two).
  - Two work entries that both used the same primary methodology → keep both only if
    they represent genuinely different ownership/scope; otherwise merge.
  - Record every skill folded into a deal/work topic in skill_coverage_map
    (skill_key -> [topic_id]) so downstream code knows it's covered, but do
    NOT emit a separate TopicItem for it.
This rule overrides "every deal/skill -> topic" instincts. Concept coverage,
not item count, is what matters.

━━━ MANDATORY ━━━
  - Apply BAND-DRIVEN SOURCE MIX to choose which extracted items become topics.
  - Apply DEDUP so no concept repeats across two TopicItems.
  - Correctly tag every topic: RESUME_TOPIC (from resume), JD_TOPIC (from JD,
    no resume match), ROLE_TOPIC (from your expert knowledge only — never
    resume/JD content mislabeled as ROLE_TOPIC).
  - EXACTLY 2 ROLE_TOPICs from expert knowledge (is_custom_question=false), included
    within the 10-12 base cap.
  - Custom questions (if provided) are ALWAYS included in full, added on top of the
    10-12 base — see TOPIC COUNT section above. Never dropped, never counted against
    the base cap, never displace resume/JD/role topics.
  - anchor_topic must also be the FIRST item in topic_pool.
  - topic_pool base size (excluding custom questions): 10-12 TopicItems, BOTH bounds
    mandatory. Count before output; if under 10, add more items; if over 12, cut the
    weakest — then append all custom questions on top.
  - Return ONLY valid JSON. No markdown. No explanation.

Schema:
{
  "role_context": { "must_have_skills": [str] },
  "candidate_band": "fresher"|"mid"|"experienced"|"senior",
  "candidate_summary": str,
  "anchor_topic": TopicItem,
  "topic_pool": [TopicItem],
  "skill_coverage_map": { "skill_key": ["topic_id"] },
  "interview_strategy": str,
  "red_flags": [str]
}

TopicItem schema:
{
  "id": str,
  "topic_type": "project"|"work"|"skill"|"role_topic",
  "tag": "RESUME_TOPIC"|"JD_TOPIC"|"ROLE_TOPIC",
  "title": str,
  "full_description": str,
  "tech_stack": [str],
  "impact": str,
  "is_jd_must_have": bool,
  "is_custom_question": bool,
  "why_relevant": str,
  "probe_focus": [str],
  "probe_avoid": [str]
}

OUTPUT SIZE RULES:
  - full_description: 1–2 sentences. Specific enough to ground a question.
  - why_relevant: 1 short phrase.
  - probe_focus: max 3 items, 3–5 words each. Follow PROBE_FOCUS GENERATION rules above —
    one mechanism/decision, one objection/tradeoff, one outcome/metric angle. Never 3 overlapping
    restatements of the same theme.
  - probe_avoid: max 2 items, 3–5 words each.
  - interview_strategy: 3–5 sentences. Must be specific to this role, band, and candidate — not generic.
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
ADDITIONAL role-knowledge TopicItems from your own expert sales domain knowledge of
the role — the same kind of item as an ROLE_TOPIC, testing conceptual/practical depth
that any competent salesperson in this role should have, independent of this specific
candidate's resume or the JD wording.

Rules:
  - Do NOT duplicate any concept already covered by an existing topic (titles and
    descriptions are listed below) — check methodology/skill overlap, not just title text.
  - Each new topic must be answerable with a concrete, grounded question — not
    generic ("tell me about objection handling") but specific ("how do you decide when
    to bring in a discount versus hold the line on price").
  - Tag every new topic "ROLE_TOPIC", topic_type "role_topic", is_custom_question=false.
  - probe_focus: exactly 3 items, 3-5 words each, CONCRETE to this topic's own
    full_description (never the literal words "mechanism", "tradeoff", "outcome",
    or "judgment" themselves — those are categories to fill, not values to output):
      1. A specific mechanism or decision point for this topic.
      2. A specific objection/tradeoff/constraint angle for this topic.
      3. A specific outcome/metric or judgment angle for this topic.
    Example for a topic on discount strategy: ["discount approval threshold used",
    "holding price against a competitor bid", "close-rate impact of discounting"].
  - Return ONLY valid JSON: {"topics": [TopicItem, ...]}. No markdown, no explanation.

TopicItem schema:
{
  "id": str, "topic_type": "role_topic", "tag": "ROLE_TOPIC", "title": str,
  "full_description": str, "tech_stack": [str], "impact": str,
  "is_jd_must_have": false, "is_custom_question": false, "why_relevant": str,
  "probe_focus": [str], "probe_avoid": [str]
}
"""


async def _topup_role_topics(
    *,
    job_title: str,
    candidate_band: str,
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
        f"ROLE: {job_title}  |  BAND: {candidate_band.upper()}\n\n"
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
    candidate_band: str,
    resume_json: dict,
    jd_data: dict,
    custom_questions: list[str],
    openai_client: AsyncOpenAI,
    llm_model: str,
    usage_sink: Any = None,
) -> InterviewBrief:
    llm_input_block, role_understanding = await asyncio.gather(
        run_extraction(
            resume_json=resume_json,
            jd_data=jd_data,
            candidate_name=candidate_name,
            job_title=job_title,
            band=candidate_band,
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
        f"BAND: {candidate_band.upper()}\n"
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
    brief.topic_pool = _dedup_jd_vs_resume(brief.topic_pool)

    non_custom_count = sum(1 for t in brief.topic_pool if not t.is_custom_question)
    if non_custom_count < 12:
        topup = await _topup_role_topics(
            job_title=job_title,
            candidate_band=candidate_band,
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
        "[BRIEF:sales] LLM brief generated: %d topics | anchor=%r | band=%s",
        len(brief.topic_pool), brief.anchor_topic.title, brief.candidate_band,
    )
    return brief
