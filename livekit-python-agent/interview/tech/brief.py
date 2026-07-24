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
    topic_type: str  # "skill" | "role_topic"
    tag: str = "RESUME_TOPIC"  # "RESUME_TOPIC" | "JD_TOPIC" | "ROLE_TOPIC"
    title: str
    full_description: str
    tech_stack: list[str] = Field(default_factory=list)
    impact: str = ""
    is_jd_must_have: bool = False
    is_custom_question: bool = False
    why_relevant: str = ""
    probe_focus: str = ""
    probe_avoid: list[str] = Field(default_factory=list)

    @field_validator("topic_type", mode="before")
    @classmethod
    def _coerce_type(cls, v: Any) -> str:
        allowed = {"skill", "role_topic"}
        s = str(v or "").strip().lower()
        return s if s in allowed else "skill"

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
    level: int = 2
    candidate_summary: str = ""
    anchor_topic: TopicItem
    topic_pool: list[TopicItem] = Field(default_factory=list)
    skill_coverage_map: dict[str, list[str]] = Field(default_factory=dict)
    interview_strategy: str = ""
    red_flags: list[str] = Field(default_factory=list)

    @field_validator("level", mode="before")
    @classmethod
    def _coerce_level(cls, v: Any) -> int:
        try:
            n = int(v)
        except (TypeError, ValueError):
            return 2
        return n if n in (1, 2, 3, 4) else 2


# ---------------------------------------------------------------------------
# LLM system prompt -- lean: no parsing, only strategy + scoring + role topics
# ---------------------------------------------------------------------------

_BRIEF_SYSTEM = """\
You are an expert hiring manager and technical interviewer running a SKILL-ONLY interview.
This interview never references the candidate's projects, work history, or resume narrative —
every question tests cold knowledge of a skill/library/tool, not "tell me about a time you used X."
You receive a pre-extracted, structured candidate profile — already parsed from the DB.
No raw JSON. No parsing needed. Your jobs:
  1. Select the SKILL POOL for this interview (see SKILL POOL SELECTION below)
  2. Turn every selected skill into a TopicItem with the correct tag and probe guidance
  3. Select the anchor topic (the single strongest skill to open on)
  4. Generate role_topic TopicItems from YOUR expert domain knowledge of the role — not from resume or JD
  5. Merge overlapping resume and JD mentions of the same skill into one TopicItem (never duplicate)
  6. Write interview_strategy, red_flags, candidate_summary — calibrated to role and level, skill-focused only
  7. The interview_strategy must be SPECIFIC to this exact role, level, and skill pool — not generic filler

━━━ SKILL POOL SELECTION (replaces any project/work selection logic) ━━━
The user message contains a "SKILLS FROM RESUME" list (skills the candidate listed, plus
tech-stack tags pulled from their projects/work — never the project/work titles or
narratives themselves) and a "JD MUST-HAVE SKILLS & CRITERIA" list. Build the skill pool
from these two lists only:

  1. COMMON SKILLS (minimum 7): a skill/library/tool/framework name that appears in BOTH
     the resume skills list AND the JD must-have or nice-to-have list (case-insensitive,
     synonym-aware — e.g. "Postgres" and "PostgreSQL" are the same skill). Tag these
     RESUME_TOPIC, is_jd_must_have=true if the JD lists it as must-have. If fewer than 7
     genuine overlaps exist, do not pad with unrelated resume skills — pull in the closest
     related/adjacent skills (e.g. a related framework in the same ecosystem) and note the
     thin overlap in red_flags instead of fabricating a match that isn't there.
  2. JD-REQUIRED SKILLS (minimum 3 additional): skills from the JD's must-have list that
     are NOT already counted in the common-skills set above (i.e. skills the JD requires
     that the candidate has not listed on their resume). Tag these JD_TOPIC.
  3. ROLE_TOPICS (exactly 2): see ROLE_TOPIC GENERATION below — independent of resume/JD.

Every TopicItem's title MUST be a skill, library, framework, or tool name (e.g. "Python",
"FastAPI", "Spring Boot", "Microservices", "Database indexing", "React hooks") — NEVER a
project name, company name, or work-history entry. If the extracted input has no obvious
skill name for something (e.g. a vague JD requirement like "strong communication"), skip it —
it does not belong in a skill-only technical interview.

━━━ TOPIC TAGS (required on every TopicItem) ━━━
  RESUME_TOPIC — a skill/tool the candidate has listed or demonstrated (resume skills list
                 or project/work tech-stack tags) AND that also appears in the JD
  JD_TOPIC     — a skill the JD requires that the candidate has NOT listed/demonstrated
  ROLE_TOPIC   — from your expert knowledge of the role (NOT from resume or JD)

━━━ TOPIC COUNT — HARD RANGE, CUSTOM QUESTIONS ARE ADDITIVE ━━━
Base cap: topic_pool must contain BETWEEN 12 AND 14 TopicItems (7+ common skills + 3+
JD-required skills + 2 expert role topics), BEFORE counting custom questions.
  - Fewer than 12 (excluding custom questions) is INVALID. If your selected items total
    under 12, you MUST add more — pull in additional JD must-have/nice-to-have skills or
    additional resume-listed skills relevant to the role until you reach 12.
  - More than 14 (excluding custom questions) is INVALID. If over 14, DROP the
    lowest-relevance skills down to 14 (drop weakest common-skill matches first, never
    drop below the 7 common / 3 JD-required / 2 role-topic floors).

Custom questions (if the client provided any) are added ON TOP of this 12-14 base —
they never displace skill topics and are never counted against the 12-14 range:
  - Every custom question becomes its own TopicItem: tag="ROLE_TOPIC", topic_type=
    "role_topic", is_custom_question=true.
  - ALL custom questions are included, always, with no cap. If the client gave 5 custom
    questions, all 5 appear as 5 additional TopicItems beyond the 12-14 base.
  - is_custom_question=true items do NOT count toward "EXACTLY 2 role topics" below —
    that rule is only about the 2 topics YOU generate from expert knowledge.
  - Do not shrink or drop skill topics to "make room" for custom questions —
    there is no shared budget between them.

Before returning JSON, COUNT topic_pool excluding is_custom_question=true items. That
count must be 12-14, with at least 7 tagged RESUME_TOPIC (common skills) and at least 3
tagged JD_TOPIC (JD-required, not on resume). Then verify every custom question is
present as its own item on top of that count.
ROLE_TOPIC (expert-knowledge, non-custom) count: exactly 2, included in the 12-14 base.

━━━ QUESTION LEVEL (1-4) ━━━
Each level changes: probing depth, question difficulty, what counts as a "good" answer,
how many follow-ups are expected, and what the interviewer is looking for. This is a
FIXED, admin-selected level for this job — it does not vary by candidate.

LEVEL 1 (basic):
  Evaluation goal: understand how they reason about a skill, not just whether they've heard of it.
  Depth: fundamentals, basic mechanics, simple applied tasks. No systems context assumed.
  Avoid: architecture at scale, strategic tradeoffs, production incident scenarios.
  Anchor: the strongest common skill (resume + JD overlap).
  interview_strategy: Focus on whether fundamentals are genuinely understood, not memorized.
    Accept partial answers on tradeoffs/performance — they're learning. Get one clear
    reasoning example per skill, then move on.

LEVEL 2 (moderate):
  Evaluation goal: verify real working knowledge under realistic constraints.
  Depth: mechanics, performance triage, one real constraint per applied question.
  Avoid: pure textbook recitation with no reasoning.
  Anchor: the strongest common skill (resume + JD overlap).
  interview_strategy: Push past textbook answers. Ask what they'd check first, not a full
    checklist. Probe one real tradeoff per skill. Surface where their understanding is
    genuinely applied versus surface-level.

LEVEL 3 (experienced):
  Evaluation goal: verify applied depth and judgment under real tradeoffs, not just correctness.
  Depth: applied scenarios with a genuine tradeoff or constraint, multi-step reasoning, "why
    this over that" questions grounded in something they'd actually hit in production.
  Avoid: pure definitions, single-fact recall.
  Anchor: the strongest common skill (resume + JD overlap), pushed harder than level 2.
  interview_strategy: Open with an applied scenario, not a definition. Push on the "why" behind
    their choice at least once per skill. Treat a confident-but-shallow answer as a signal to
    probe deeper, not as a pass.

LEVEL 4 (advanced/senior):
  Evaluation goal: architectural judgment and tradeoff reasoning at a systems level.
  Depth: multi-factor tradeoffs, no-single-correct-answer scenarios, systemic failure modes.
  Avoid: basic definitions, surface familiarity questions.
  Anchor: the skill most central to the role's architecture-level decisions.
  interview_strategy: Go directly to hard tradeoffs. Vague or textbook answers are a red
    flag — probe harder, invert their stated assumption. Every answer should reveal HOW
    they reason, not just WHAT they know.

━━━ ROLE_TOPIC GENERATION (critical — this is where the interview gets depth) ━━━
Generate ROLE_TOPICs from your expert knowledge of the role. These are conceptual/skill areas
that every competent person in this role should know — regardless of what is on the resume or JD.
The goal: test role depth, not just candidate experience.

Rules:
  - EXACTLY 2 role topics. Choose the 2 highest-signal concepts for this role.
  - Do NOT copy resume or JD items. Completely independent.
  - Each role_topic must be a skill/concept name, specific enough that Ishitha can ask one
    concrete, grounded question about it — never a project or company reference.
  - Role topics must change based on level: same concept, different depth.

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
probe_focus is ONE short paragraph (2-3 sentences) written in plain English that tells the
interviewer exactly what to probe for on this topic, at THIS topic's level. Not a list of
keywords — a concrete instruction an interviewer could read once and know what to ask, the
way a human interview lead would brief a colleague before the call.

Write it to cover, in prose:
  1. The concrete mechanism or internal-behavior angle specific to this skill (name the
     actual thing, not "how it works").
  2. A failure / tradeoff / performance angle — what breaks, or what the tradeoff is.
  3. An applied, judgment-call scenario where this skill's use requires a real decision.
Calibrate the depth of what you ask for to the topic's level (see QUESTION LEVEL above):
level 1 sentences should point at a basic-fundamentals probe; level 4 sentences should point
at an advanced tradeoffs/systems-level probe.

If a red_flag applies to this topic, the paragraph must include the exact angle that would
surface it.

GOOD vs BAD example (topic: Database indexing, level 2):
  BAD:  "Ask about how indexes work and best practices."
        — vague, no mechanism/failure/applied distinction, no level calibration.
  GOOD: "Ask them to explain B-tree vs hash index internals and when they'd pick one over
        the other. Push on the write-amplification cost of over-indexing a write-heavy
        table. Then give them a concrete scenario — a 3-table join that's suddenly slow —
        and see how they'd decide which index to add."
        — one mechanism, one tradeoff angle, one applied-decision scenario, in natural
        interviewer language.

  This is a STRUCTURE example, not content to reuse. Never emit a probe_focus paragraph
  that doesn't genuinely apply to THIS topic's own tech_stack/title.

━━━ DEDUP — NO CONCEPT MAY APPEAR TWICE ━━━
Before finalizing topic_pool, verify: no two TopicItems test the same
underlying concept/skill/technology, even under different titles.
  - A "Python" resume skill entry and a "Python" JD requirement → ONE TopicItem only
    (tag=RESUME_TOPIC, is_jd_must_have=true). Never two.
  - Two closely related skills (e.g. "REST API design" and "API design principles") →
    merge into one TopicItem unless they are genuinely distinct enough to probe separately.
  - Record every skill folded into another topic in skill_coverage_map
    (skill_key -> [topic_id]) so downstream code knows it's covered, but do
    NOT emit a separate TopicItem for it.
This rule overrides "every extracted skill -> topic" instincts. Concept coverage,
not item count, is what matters.

━━━ MANDATORY ━━━
  - Apply SKILL POOL SELECTION to choose which skills become topics: 7+ common, 3+ JD-required.
  - Apply DEDUP so no concept repeats across two TopicItems.
  - Correctly tag every topic: RESUME_TOPIC (common skill, resume+JD overlap), JD_TOPIC (JD-required,
    not on resume), ROLE_TOPIC (from your expert knowledge only — never resume/JD content mislabeled
    as ROLE_TOPIC).
  - EXACTLY 2 ROLE_TOPICs from expert knowledge (is_custom_question=false), included
    within the 12-14 base cap.
  - Custom questions (if provided) are ALWAYS included in full, added on top of the
    12-14 base — see TOPIC COUNT section above. Never dropped, never counted against
    the base cap, never displace skill topics.
  - anchor_topic must also be the FIRST item in topic_pool.
  - topic_pool base size (excluding custom questions): 12-14 TopicItems, BOTH bounds
    mandatory, with the 7 common / 3 JD-required / 2 role floors always met. Count
    before output; if under 12, add more items; if over 14, cut the weakest — then
    append all custom questions on top.
  - No TopicItem may reference a project name, company name, or work-history narrative —
    every title and full_description must be about the skill itself, not the candidate's
    application of it in a specific project.
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
  "skill_coverage_map": { "skill_key": ["topic_id"] },
  "interview_strategy": str,
  "red_flags": [str]
}

TopicItem schema:
{
  "id": str,
  "topic_type": "skill"|"role_topic",
  "tag": "RESUME_TOPIC"|"JD_TOPIC"|"ROLE_TOPIC",
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
  - probe_focus: 2-3 sentences of plain English. Follow PROBE_FOCUS GENERATION rules above —
    one mechanism/decision, one failure/tradeoff, one applied-scenario angle, calibrated to
    this topic's level. Never a list of keywords.
  - probe_avoid: max 2 items, 3–5 words each.
  - interview_strategy: 3–5 sentences. Must be specific to this role, level, and candidate — not generic.
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
to deduplication and now needs topping up to reach the 12-topic floor. Generate
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
  - probe_focus: 2-3 sentences of plain English, CONCRETE to this topic's own
    full_description, covering:
      1. A specific mechanism or decision point for this topic.
      2. A specific failure/tradeoff/constraint angle for this topic.
      3. A specific applied scenario or judgment-call angle for this topic.
    Calibrate depth to the given level (1=basic through 4=advanced).
    Example for a topic on caching strategy: "Ask what triggers a cache invalidation in
    their design and why. Push on the stale-read risk under high write volume. Then ask
    how they'd measure whether a cache change actually improved hit rate."
  - Return ONLY valid JSON: {"topics": [TopicItem, ...]}. No markdown, no explanation.

TopicItem schema:
{
  "id": str, "topic_type": "role_topic", "tag": "ROLE_TOPIC", "title": str,
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
    12-topic floor, instead of re-admitting the duplicates dedup just removed."""
    existing_summary = "\n".join(
        f"- {t.title}: {t.full_description}" for t in existing_topics
    )
    user_prompt = (
        f"ROLE: {job_title}  |  LEVEL: {level}\n\n"
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
    resume_json: dict,
    jd_data: dict,
    custom_questions: list[str],
    openai_client: AsyncOpenAI,
    llm_model: str,
    level: int = 2,
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

    # Step 2: main LLM call, grounded in the role understanding from step 1
    user_prompt = (
        f"WHAT THIS ROLE ACTUALLY NEEDS (read this first — it is the relevance bar "
        f"for every topic you select below):\n{role_understanding}\n\n"
        f"{llm_input_block}\n"
        f"LEVEL: {level}\n"
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
    brief.topic_pool = _dedup_any_overlap(brief.topic_pool)

    # Dedup can pull the pool below the 12-topic floor (dropped duplicates
    # aren't re-admitted). Top back up with fresh, non-duplicate role topics
    # rather than silently shipping a shorter interview.
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
                "[BRIEF] topped up %d role topic(s) after dedup: %s",
                len(topup), [t.title for t in topup],
            )
            brief.topic_pool.extend(topup)

    logger.info(
        "[BRIEF] LLM brief generated: %d topics | anchor=%r | level=%s",
        len(brief.topic_pool), brief.anchor_topic.title, brief.level,
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


def _probe_tokens(t: TopicItem) -> set[str]:
    """Normalized word tokens from probe_focus -- catches concept overlap
    (e.g. 'duplicate lead handling' vs 'duplicate handling rule') that
    tech_stack comparison misses because both topics may share no listed tech."""
    return {w.strip().lower() for w in t.probe_focus.split() if len(w.strip()) > 3}


def _dedup_any_overlap(topics: list[TopicItem]) -> list[TopicItem]:
    """Second dedup pass across ALL tag pairs (not just JD-vs-RESUME): if two
    topics share tech_stack overlap AND probe_focus wording overlap, they're
    testing the same concept under different titles -- drop the lower-priority
    one (custom > resume/jd > role_topic; earlier item wins ties, since anchor
    and higher-relevance items are placed first by the LLM)."""
    kept: list[TopicItem] = []
    for t in topics:
        if t.is_custom_question:
            kept.append(t)
            continue
        t_tech = _tech_tokens(t)
        t_probe = _probe_tokens(t)
        dup_of = next(
            (
                k for k in kept
                if not k.is_custom_question
                and t_tech and t_tech & _tech_tokens(k)
                and t_probe and len(t_probe & _probe_tokens(k)) >= 2
            ),
            None,
        )
        if dup_of is not None:
            logger.info(
                "[DEDUP] dropping %r (%s) -- overlaps %r (%s) on tech+probe concept",
                t.title, t.tag, dup_of.title, dup_of.tag,
            )
            continue
        kept.append(t)
    return kept
