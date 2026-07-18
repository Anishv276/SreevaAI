"""
interview/interview_brief.py
============================
Generates a structured InterviewBrief from resume + JD data.

Flow:
  1. brief_extraction.run_extraction() — LangGraph pipeline (pure Python, zero LLM)
       Parallel: extract_resume + extract_jd → merge+dedup → build_llm_input block
  2. _understand_role() — small LLM call, JD + job_title only (no resume).
       Answers "what does this role actually need" BEFORE any resume filtering
       happens, so topic selection is judged against a real bar instead of
       being decided ad hoc inside the same pass that also writes the topics.
  3. _call_llm_for_brief() — main LLM call on the extraction block + role
       understanding. LLM does: tagging, relevance filtering, anchor selection,
       probe guidance, role topics, strategy.
  4. InterviewBrief.model_validate() — Pydantic validates output before use

No raw JSON is ever sent to the LLM. Latency target: <20s (was 2+ min).
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, field_validator

from interview.agent_runtime_utils import token_limit_kwarg
from interview.tech.brief_extraction import run_extraction

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# Output schema -- InterviewBrief returned to agent_runtime
# ---------------------------------------------------------------------------

class TopicItem(BaseModel):
    id: str
    topic_type: str  # "project" | "work" | "skill" | "role_topic"
    tag: str = "RESUME_TOPIC"  # "RESUME_TOPIC" | "JD_TOPIC" | "ROLE_TOPIC"
    title: str
    full_description: str
    tech_stack: list[str] = Field(default_factory=list)
    impact: str = ""
    is_jd_must_have: bool = False
    is_custom_question: bool = False
    why_relevant: str = ""
    probe_focus: list[str] = Field(default_factory=list)
    probe_avoid: list[str] = Field(default_factory=list)

    @field_validator("topic_type", mode="before")
    @classmethod
    def _coerce_type(cls, v: Any) -> str:
        allowed = {"project", "work", "skill", "role_topic"}
        s = str(v or "").strip().lower()
        return s if s in allowed else "project"

    @field_validator("tag", mode="before")
    @classmethod
    def _coerce_tag(cls, v: Any) -> str:
        allowed = {"RESUME_TOPIC", "JD_TOPIC", "ROLE_TOPIC"}
        s = str(v or "").strip().upper()
        return s if s in allowed else "RESUME_TOPIC"


class RoleContext(BaseModel):
    must_have_skills: list[str] = Field(default_factory=list)


class InterviewBrief(BaseModel):
    role_context: RoleContext
    candidate_band: str = "mid"
    candidate_summary: str = ""
    anchor_topic: TopicItem
    topic_pool: list[TopicItem] = Field(default_factory=list)
    skill_coverage_map: dict[str, list[str]] = Field(default_factory=dict)
    interview_strategy: str = ""
    red_flags: list[str] = Field(default_factory=list)

    @field_validator("candidate_band", mode="before")
    @classmethod
    def _coerce_band(cls, v: Any) -> str:
        allowed = {"fresher", "mid", "experienced", "senior"}
        s = str(v or "").strip().lower()
        return s if s in allowed else "mid"


# ---------------------------------------------------------------------------
# LLM system prompt -- lean: no parsing, only strategy + scoring + role topics
# ---------------------------------------------------------------------------

_BRIEF_SYSTEM = """\
You are an expert hiring manager and technical interviewer.
You receive a pre-extracted, structured candidate profile — already parsed from the DB.
No raw JSON. No parsing needed. Your jobs:
  1. Turn every extracted item into a TopicItem with the correct tag and probe guidance
  2. Select the anchor topic (most strategically valuable for this role + band)
  3. Generate role_topic TopicItems from YOUR expert domain knowledge of the role — not from resume or JD
  4. Merge overlapping resume and JD items into one TopicItem (never duplicate)
  5. Write interview_strategy, red_flags, candidate_summary — calibrated to role and band
  6. The interview_strategy must be SPECIFIC to this exact role, band, and candidate — not generic filler

━━━ ROLE RELEVANCE FILTER (apply BEFORE selecting any resume item) ━━━
The user message opens with "WHAT THIS ROLE ACTUALLY NEEDS" — a short brief on what this
specific role does and what actually matters for it. Treat it as the relevance bar:
  - A resume project/work-entry/skill only becomes a TopicItem if it demonstrates something
    that brief says matters for this role. Being ON THE RESUME is not sufficient by itself.
  - If the role brief names the kind of content this role does NOT care about, DROP resume
    items that match that description even if they are the candidate's most impressive work —
    impressive-but-irrelevant is still irrelevant here.
  - This filter applies on top of, not instead of, the BAND-DRIVEN SOURCE MIX below. The
    source mix says how many resume items to take; the relevance filter says WHICH ones qualify
    at all before that count is applied.
  - JD_TOPIC and ROLE_TOPIC items are exempt from this filter (they are already role-derived).

━━━ TOPIC TAGS (required on every TopicItem) ━━━
  RESUME_TOPIC — from candidate's resume (projects, work history, resume skills)
  JD_TOPIC     — from the job description (must-have / nice-to-have skills, JD requirements)
  ROLE_TOPIC   — from your expert knowledge of the role (NOT from resume or JD)

If a resume skill appears in the JD must-haves → tag=RESUME_TOPIC, is_jd_must_have=true (resume wins)
If a JD requirement is not on the resume → tag=JD_TOPIC

━━━ TOPIC COUNT — HARD RANGE, CUSTOM QUESTIONS ARE ADDITIVE ━━━
Base cap: topic_pool must contain BETWEEN 10 AND 12 TopicItems (including anchor
+ the 2 expert role topics), BEFORE counting custom questions.
  - Fewer than 10 (excluding custom questions) is INVALID. If your selected items total
    under 10, you MUST add more — pull in additional JD requirements, resume skills, or
    work/project detail splits (e.g. a work entry's two distinct ownership areas) until
    you reach 10. When topping up, prefer JD_TOPIC and ROLE_TOPIC additions (already
    role-relevant by definition) over resume items that failed the ROLE RELEVANCE FILTER
    above. Only re-admit a filtered-out resume item as a last resort if JD/role material
    genuinely runs out.
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

FRESHER (0–2 years):
  Evaluation goal: understand how they think, not just what they built.
  Depth: surface ownership, specific role, why they chose X, what they learned.
  Avoid: architecture at scale, strategic tradeoffs, team leadership, production metrics.
  Anchor: most hands-on project with real personal contribution.
  interview_strategy: Focus on learning mindset, decision reasoning, and real hands-on involvement.
    Ask what they personally did, why they made choices, what surprised them.
    Do not probe tradeoffs or scale — they haven't been there.

MID (2–5 years):
  Evaluation goal: verify real ownership and individual decision-making.
  Depth: what was specifically theirs, what decisions they made, what broke and why, scale they operated at.
  Avoid: pure theory, basic definitions.
  Anchor: project or role with clearest personal ownership.
  interview_strategy: Push past team language. Ask what was specifically theirs.
    Probe one real tradeoff per major topic. Surface what broke and what they'd do differently.

EXPERIENCED (5–8 years):
  Evaluation goal: architectural judgment and real consequence of decisions.
  Depth: architectural decisions, tradeoffs, what broke at scale, alternatives considered, measurable outcomes.
  Avoid: basic concepts, surface familiarity.
  Anchor: most architecturally complex role or system they owned.
  interview_strategy: Go directly to hard tradeoffs. Vague answers are a red flag — probe harder.
    Every answer should name a constraint, an outcome, or a decision they'd make differently.
    Skip surface questions entirely.

SENIOR (8+ years):
  Evaluation goal: strategic judgment, org-level impact, high-stakes decision quality.
  Depth: org-level decisions, team or system impact, high-stakes tradeoffs, what they'd change at org level.
  Avoid: implementation details, basic anything.
  Anchor: most strategically significant initiative, not just a technical project.
  interview_strategy: Peer-level conversation. Challenge their reasoning directly.
    Ask what they'd do differently at the org level. Press on polished answers — something always went wrong.
    Topic count should be fewer but each explored at greater depth.

━━━ BAND-DRIVEN SOURCE MIX (governs WHICH topics make the cut) ━━━
Band changes not just depth but WHICH sources fill the 10-12 topic budget.
Apply this priority order when selecting which extracted items become
TopicItems (highest priority filled first, budget allows ~8-10 non-role slots):

FRESHER:
  Priority: JD topics (skills + role responsibilities) FIRST, then 2-3 resume items.
  Take ALL JD must-haves as JD_TOPIC (merge with resume if candidate has matching
  project/skill — then tag RESUME_TOPIC, is_jd_must_have=true).
  Take ONLY the 2-3 strongest resume projects/skills — pick by relevance to role,
  not recency. Do not include every resume skill; freshers list many trivial skills.
  Mix target: ~60% JD-sourced, ~30% resume (2-3 items), ~2 role topics.

MID:
  Priority order: 1) work history (all real roles) 2) JD must-have skills
  3) strongest 2-3 projects 4) remaining resume skills only if budget allows.
  Work history entries are the backbone — a mid-level candidate's ownership
  lives in their job roles, not side projects.
  Mix target: ~40% work history, ~30% JD skills, ~20% projects, ~10% resume skills.

EXPERIENCED / SENIOR:
  Priority order: 1) work history (every real role, especially most recent/senior)
  2) JD must-have skills reframed as judgment/architecture questions 3) role topics.
  De-prioritize: standalone resume skill lists (skip unless it's a genuinely
  distinguishing/rare skill), toy/personal projects (skip unless flagship).
  Only include a project if it was a flagship initiative with org-level impact —
  not a resume bullet.
  Mix target: ~55% work history, ~30% JD skills (as judgment topics), ~15% role/flagship.

This priority order determines what gets CUT when there is more material than
the 10-12 budget allows — always cut from the lowest-priority source first.

━━━ ROLE_TOPIC GENERATION (critical — this is where the interview gets depth) ━━━
Generate ROLE_TOPICs from your expert knowledge of the role. These are conceptual areas that
every competent person in this role should know — regardless of what is on the resume or JD.
The goal: test role depth, not just candidate experience.

Rules:
  - EXACTLY 2 role topics. Choose the 2 highest-signal concepts for this role.
  - Do NOT copy resume or JD items. Completely independent.
  - Each role_topic must be specific enough that Ishitha can ask one concrete, grounded question about it.
  - Role topics must change based on band: same concept, different depth.

Examples for common roles (pick the 2 strongest for the actual role):
  DevOps/SRE:       Observability strategy, Incident management runbooks, Reliability engineering (SLO/SLI/error budgets),
                    Cost optimization approach, Deployment pipeline design, On-call culture, Chaos engineering
  Backend Engineer: Database indexing tradeoffs (B-tree vs hash, N+1), API design principles, Caching strategy and invalidation,
                    Concurrency and race conditions, Distributed systems tradeoffs (CAP theorem), Service mesh
  Frontend:         Event loop and async JS, React reconciliation and key prop, Web performance (LCP/CLS/FID),
                    CSS specificity and cascade, Accessibility (WCAG), Bundle optimization
  Data Scientist:   Feature engineering vs model selection, Overfitting in practice, Precision/recall tradeoff,
                    Class imbalance handling, Experiment design, Model serving at scale
  GTM/Growth:       Lead qualification logic, Multi-channel outreach sequencing, Automation tool tradeoffs,
                    Campaign performance metrics (open rate vs reply rate vs conversion), Data enrichment approaches
  Product Manager:  Discovery process and user research, Prioritization frameworks (RICE, MoSCoW), Stakeholder alignment,
                    Metrics and success definitions, Trade-off decisions under constraints

If the role does NOT match one of the families above (e.g. Sales, Legal, Design, Finance,
Support, Marketing, Ops, HR, Recruiting, Hardware, or anything else), do not force-fit it into
the nearest listed family. Instead derive the 2 role topics the same way: ask yourself "what
are the 2 concepts that separate a genuinely competent person in THIS role from someone who
just has the job title?" — the kind of judgment/tradeoff/mechanism question a strong practitioner
in that exact field would be expected to answer well. Ground each in the role brief and JD, not
in a generic checklist for the job title.

━━━ PROBE_FOCUS GENERATION (critical — this is what MOVE_ON questions are built from) ━━━
probe_focus is not a summary of the topic — it is the set of concrete angles an interviewer
will interrogate. Every MOVE_ON question is synthesized directly from these items, so vague or
generic probe_focus produces vague, generic questions (e.g. falling back to "what did you build").

Rules:
  - Each of the 3 items must be a DIFFERENT kind of angle, not 3 phrasings of the same theme:
      1. A concrete MECHANISM or DECISION specific to this topic (not "workflow design" —
         name the actual thing: "channel-to-CRM routing logic", "lead scoring criteria").
      2. A FAILURE / TRADEOFF / CONSTRAINT angle (what could break, what they had to choose between,
         what the limiting factor was).
      3. An OUTCOME / METRIC angle (what changed, what was measured, what the result was) —
         for JD_TOPIC/ROLE_TOPIC with no known outcome, use an approach/judgment angle instead.
  - Ground every item in the topic's own full_description — never a generic GTM/eng/PM phrase
    that could apply to any candidate's version of this topic.
  - If a red_flag applies to this topic, at least one probe_focus item must be the exact angle
    that would surface it. Example: red_flag "Cannot explain lead qualification logic" requires
    a probe_focus item like "lead scoring criteria used", not a generic "workflow design".

GOOD vs BAD example (topic: multi-channel lead capture unifying Instagram/Facebook/email):
  BAD:  ["workflow design", "automation logic", "lead qualification criteria"]
        — three overlapping phrasings of "how the system works", no failure/outcome angle,
        forces the interviewer back onto generic "what did you build/own".
  GOOD: ["channel-to-CRM routing rule", "what happens on a duplicate lead across channels",
         "booking reminder open/response rate"]
        — one mechanism, one edge-case/failure angle, one outcome angle. Each is answerable
        only by someone who actually built this exact system.

━━━ DEDUP — NO CONCEPT MAY APPEAR TWICE ━━━
Before finalizing topic_pool, verify: no two TopicItems test the same
underlying concept/skill/technology, even under different titles.
  - A "Python" resume skill entry and a resume project that used Python →
    ONE TopicItem only (the project, with tech_stack containing "Python").
    Do NOT also create a standalone "Python" skill topic.
  - A JD must-have skill and a resume project/work entry that demonstrates it →
    ONE TopicItem, tag=RESUME_TOPIC, is_jd_must_have=true (never two).
  - Two work entries that both used the same primary tech → keep both only if
    they represent genuinely different ownership/scope; otherwise merge.
  - Record every skill folded into a project/work topic in skill_coverage_map
    (skill_key -> [topic_id]) so downstream code knows it's covered, but do
    NOT emit a separate TopicItem for it.
This rule overrides "every project/skill -> topic" instincts. Concept coverage,
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
    one mechanism/decision, one failure/tradeoff, one outcome/metric angle. Never 3 overlapping
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
You are an expert hiring manager. You are given a job title and a job description —
no resume yet. Your only job: explain what this specific role actually needs to
succeed, so a later step can judge a candidate's resume against a real bar instead
of just listing everything they've done.

Write 4-6 sentences covering:
  - What this role actually does day to day (not the generic job-title stereotype —
    read the JD's actual responsibilities).
  - The 3-5 skills/competencies that matter MOST for this specific JD (not a generic
    list for the job title — pull from what this JD emphasizes).
  - What "irrelevant" looks like for this role — the kind of resume content a
    candidate might have that this role does NOT care about, so it can be excluded
    later (e.g. a data-analysis project for a role that's purely about outbound
    campaign automation, or a leadership skill for an IC-only role).

Be concrete and specific to THIS JD. Do not write generic role descriptions that
could apply to any job with this title. Return plain text, no markdown, no JSON.
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
    Runs before resume filtering so topic selection has a real bar to judge against,
    instead of the single generation call inferring relevance ad hoc."""
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
    logger.info("[BRIEF] role understanding: %s", understanding[:200])
    return understanding


_TOPUP_SYSTEM = """\
You are an expert hiring manager. A topic_pool for this interview lost some items
to deduplication and now needs topping up to reach the 12-topic target. Generate
ADDITIONAL role-knowledge TopicItems from your own expert domain knowledge of the
role — the same kind of item as an ROLE_TOPIC, testing conceptual/practical depth
that any competent person in this role should have, independent of this specific
candidate's resume or the JD wording.

Rules:
  - Do NOT duplicate any concept already covered by an existing topic (titles and
    descriptions are listed below) — check tech/skill overlap, not just title text.
  - Each new topic must be answerable with a concrete, grounded question — not
    generic ("tell me about automation") but specific ("how do you decide chunk
    size when documents vary in length").
  - Tag every new topic "ROLE_TOPIC", topic_type "role_topic", is_custom_question=false.
  - probe_focus: exactly 3 items, 3-5 words each, CONCRETE to this topic's own
    full_description (never the literal words "mechanism", "tradeoff", "outcome",
    or "judgment" themselves — those are categories to fill, not values to output):
      1. A specific mechanism or decision point for this topic.
      2. A specific failure/tradeoff/constraint angle for this topic.
      3. A specific outcome/metric or judgment angle for this topic.
    Example for a topic on caching strategy: ["cache invalidation trigger choice",
    "stale-read risk under high write volume", "hit-rate improvement measured"].
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

    # ~300 tokens/topic covers description + probe_focus/avoid comfortably; retry
    # once at 2x if still truncated, same pattern as the main brief call.
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
            logger.warning("[BRIEF] topup call failed, shipping brief with fewer topics", exc_info=True)
            return []

        if usage_sink is not None and response.usage is not None:
            from billing.billing import extract_usage  # noqa: PLC0415
            usage_sink(extract_usage(response.usage, llm_model))

        try:
            parsed = json.loads(response.choices[0].message.content or "{}")
            return [TopicItem.model_validate(t) for t in parsed.get("topics", [])][:needed]
        except Exception:
            logger.warning(
                "[BRIEF] topup response truncated/invalid at max_tokens=%d, retrying", max_tokens,
            )
            continue

    logger.warning("[BRIEF] topup still failed after retry, shipping brief with fewer topics")
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
    # Step 1: deterministic extraction (zero LLM) + role understanding (small LLM
    # call, JD only) run concurrently -- neither depends on the other's output.
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

    # Step 2: main LLM call, grounded in the role understanding from step 1
    user_prompt = (
        f"WHAT THIS ROLE ACTUALLY NEEDS (read this first — it is the relevance bar "
        f"for every topic you select below):\n{role_understanding}\n\n"
        f"{llm_input_block}\n"
        f"BAND: {candidate_band.upper()}\n"
        f"Generate the InterviewBrief JSON now. Keep all text fields SHORT (see SPEED RULES)."
    )

    # stream=True: keeps HTTP connection alive during generation, prevents idle-connection
    # timeouts. temperature=0: deterministic + marginally faster (no sampling).
    # ponytail: one retry at a higher token cap if the response gets truncated mid-JSON;
    # raise if it still fails, no infinite backoff loop.
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
            raise ValueError("[BRIEF] empty response from LLM")

        try:
            parsed = json.loads(raw)
            break
        except json.JSONDecodeError:
            logger.warning("[BRIEF] truncated JSON at max_tokens=%d, retrying", max_tokens)
            continue
    else:
        raise ValueError(f"[BRIEF] LLM response still truncated after retry: {raw[-200:]!r}")

    brief = InterviewBrief.model_validate(parsed)
    brief.topic_pool = _dedup_jd_vs_resume(brief.topic_pool)

    # Dedup can pull the pool below the 12-topic target (dropped duplicates
    # aren't re-admitted). Top back up with fresh, non-duplicate role topics
    # rather than silently shipping a shorter interview.
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
                "[BRIEF] topped up %d role topic(s) after dedup: %s",
                len(topup), [t.title for t in topup],
            )
            brief.topic_pool.extend(topup)

    logger.info(
        "[BRIEF] LLM brief generated: %d topics | anchor=%r | band=%s",
        len(brief.topic_pool), brief.anchor_topic.title, brief.candidate_band,
    )
    return brief


# ---------------------------------------------------------------------------
# Deterministic dedup safety net -- the LLM is told to merge a JD_TOPIC into
# a matching RESUME_TOPIC (never keep both for the same skill) but doesn't
# always follow it under real data. Catch what it misses in code instead of
# relying only on prose.
# ---------------------------------------------------------------------------

def _tech_tokens(t: TopicItem) -> set[str]:
    """Normalized tokens from tech_stack only -- the structured signal, not
    title prose (title overlap is too noisy: generic phrasing like 'Automation
    Tools like X and Y' dilutes the one real shared skill below any sane
    threshold)."""
    return {tok.strip().lower() for tok in t.tech_stack if tok.strip()}


def _dedup_jd_vs_resume(topics: list[TopicItem]) -> list[TopicItem]:
    """Drop a JD_TOPIC whose tech_stack shares any entry with a RESUME_TOPIC's
    tech_stack -- the resume topic already demonstrates that JD requirement,
    so a separate JD_TOPIC just re-asks the same underlying skill."""
    resume_topics = [t for t in topics if t.tag == "RESUME_TOPIC"]
    kept: list[TopicItem] = []
    for t in topics:
        if t.tag != "JD_TOPIC":
            kept.append(t)
            continue
        jd_tech = _tech_tokens(t)
        if not jd_tech:
            kept.append(t)
            continue
        match = next(
            (rt for rt in resume_topics if jd_tech & _tech_tokens(rt)),
            None,
        )
        if match is not None:
            logger.info(
                "[DEDUP] dropping JD_TOPIC %r -- already covered by RESUME_TOPIC %r (shared tech: %s)",
                t.title, match.title, jd_tech & _tech_tokens(match),
            )
            match.is_jd_must_have = match.is_jd_must_have or t.is_jd_must_have
            continue
        kept.append(t)
    return kept
