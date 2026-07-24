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
from pydantic import BaseModel, Field, field_validator, model_validator

from interview.agent_runtime_utils import token_limit_kwarg
from interview.tech.brief_extraction import run_extraction

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# Output schema -- InterviewBrief returned to agent_runtime
# ---------------------------------------------------------------------------

class TopicItem(BaseModel):
    id: str
    topic_type: str  # "skill" | "role_topic"
    tag: str = "JD_TOPIC"
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

    @model_validator(mode="after")
    def _set_role_tag(self) -> TopicItem:
        if self.topic_type == "role_topic" or self.is_custom_question:
            self.tag = "ROLE_TOPIC"
        else:
            self.tag = "JD_TOPIC"
        return self


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
You are an expert hiring manager and technical interviewer running a JD-driven interview.
You receive a pre-extracted, structured job description and (optionally) custom questions.
No resume. No candidate history. Your jobs:
  1. Select the TOPIC POOL for this interview from the JD (see TOPIC SELECTION below)
  2. Turn every selected JD item into a TopicItem with focused probe guidance
  3. Select the anchor topic (the single most critical JD requirement to open on)
  4. Generate ROLE_TOPIC TopicItems from YOUR expert domain knowledge of the role — not from JD
  5. Write interview_strategy, red_flags — calibrated to role and level
  6. The interview_strategy must be SPECIFIC to this exact role and level — not generic filler
  7. Custom questions (if provided) are added on top — asked EXACTLY as written

\u2501\u2501\u2501 TOPIC SELECTION \u2501\u2501\u2501
Build the topic pool from these sources in priority order:

  1. JD MUST-HAVES (all of them, no skipping): Every must-have skill/requirement becomes a
     topic. topic_type="skill", is_jd_must_have=true.
  2. JD NICE-TO-HAVES (strongest 2-4): Pick the most role-critical nice-to-haves to fill
     the topic budget. topic_type="skill", is_jd_must_have=false.
  3. ROLE_TOPICS (exactly 2): From YOUR expert domain knowledge of this role — see ROLE_TOPIC
     GENERATION below. topic_type="role_topic".
  4. CUSTOM QUESTIONS (all of them): Every client-provided custom question becomes its own
     TopicItem added ON TOP of the 10-14 base. topic_type="role_topic",
     is_custom_question=true. Asked EXACTLY as written — probe_focus must be EMPTY ("").

\u2501\u2501\u2501 TOPIC COUNT \u2501\u2501\u2501
Base cap: topic_pool must contain BETWEEN 10 AND 14 TopicItems (all JD must-haves +
selected JD nice-to-haves + 2 expert role topics), BEFORE counting custom questions.
  - If JD must-haves alone exceed 14, include all must-haves (hard floor — never drop a must-have)
    and skip all nice-to-haves.
  - Fewer than 10 (excluding custom questions) is INVALID — pull in more JD nice-to-haves
    or additional ROLE_TOPIC until you reach 10.
  - More than 14 (excluding custom questions, excluding extra must-haves overflow): cut
    lowest-relevance nice-to-haves first.

Custom questions are ADDITIVE — never counted against the 10-14 base. Never drop them.
Before returning JSON: COUNT topic_pool excluding is_custom_question=true items → must be 10-14.
Then verify every custom question appears as its own item on top of that count.

\u2501\u2501\u2501 QUESTION LEVEL (1-4) \u2501\u2501\u2501
Each level changes: probing depth, question difficulty, what counts as a "good" answer,
how many follow-ups are expected, and what the interviewer is looking for. This is a
FIXED, admin-selected level for this job — it does not vary by candidate.

LEVEL 1 (basic):
  Evaluation goal: understand how they reason about a skill, not just whether they've heard of it.
  Depth: fundamentals, basic mechanics, simple applied tasks. No systems context assumed.
  Avoid: architecture at scale, strategic tradeoffs, production incident scenarios.
  Anchor: the most critical JD must-have skill.
  interview_strategy: Focus on whether fundamentals are genuinely understood, not memorized.
    Accept partial answers on tradeoffs/performance. Get one clear reasoning example per skill.

LEVEL 2 (moderate):
  Evaluation goal: verify real working knowledge under realistic constraints.
  Depth: mechanics, performance triage, one real constraint per applied question.
  Avoid: pure textbook recitation with no reasoning.
  Anchor: the most critical JD must-have skill.
  interview_strategy: Push past textbook answers. Ask what they'd check first, not a full
    checklist. Probe one real tradeoff per skill. Surface genuine applied understanding.

LEVEL 3 (experienced):
  Evaluation goal: verify applied depth and judgment under real tradeoffs, not just correctness.
  Depth: applied scenarios with a genuine tradeoff or constraint, multi-step reasoning.
  Avoid: pure definitions, single-fact recall.
  Anchor: the most architecturally critical JD must-have.
  interview_strategy: Open with an applied scenario, not a definition. Push on the "why" behind
    their choice at least once per skill.

LEVEL 4 (advanced/senior):
  Evaluation goal: architectural judgment and tradeoff reasoning at a systems level.
  Depth: multi-factor tradeoffs, no-single-correct-answer scenarios, systemic failure modes.
  Avoid: basic definitions, surface familiarity questions.
  Anchor: the skill most central to the role's architecture-level decisions.
  interview_strategy: Go directly to hard tradeoffs. Every answer should reveal HOW
    they reason, not just WHAT they know.

\u2501\u2501\u2501 ROLE_TOPIC GENERATION (critical) \u2501\u2501\u2501
Generate ROLE_TOPICs from your expert knowledge of the role. These are conceptual/skill areas
that every competent person in this role should know — regardless of what is on the JD.
The goal: test role depth beyond what the JD explicitly asked for.

Rules:
  - EXACTLY 2 role topics. Choose the 2 highest-signal concepts for this role.
  - Do NOT copy JD items — completely independent.
  - Each role_topic must be a skill/concept name specific enough that Ishitha can ask one
    concrete, grounded question about it.
  - Role topics must change based on level: same concept, different depth.
  - Example: for a Python Backend Engineer role, role topics might be "Async IO and concurrency
    patterns" and "REST API design and versioning" — things every real Python backend engineer
    should know deeply, regardless of whether the JD mentioned them.

\u2501\u2501\u2501 PROBE_FOCUS GENERATION \u2501\u2501\u2501
probe_focus is ONE short paragraph (2-3 sentences) telling the interviewer exactly what to
probe for on this topic, at THIS level. Not a list of keywords — a concrete instruction.

Rules:
  - Write it to cover: (1) a concrete mechanism or decision angle, (2) a tradeoff/constraint
    angle, (3) an outcome/application angle.
  - Calibrate depth to level: level 1 = basic understanding probe; level 4 = architecture probe.
  - CUSTOM QUESTIONS: probe_focus must be EMPTY string (""). The question IS the directive.
  - Do not ask generic "tell me about your experience" angles — be specific to the skill.

\u2501\u2501\u2501 CUSTOM QUESTIONS — TOP PRIORITY \u2501\u2501\u2501
The user message may include a list of CLIENT CUSTOM QUESTIONS. Rules:
  - Every custom question becomes its own TopicItem. ALL of them, no exceptions.
  - topic_type="role_topic", is_custom_question=true.
  - title = the custom question itself (verbatim).
  - full_description = the custom question itself (verbatim).
  - probe_focus = "" (empty — the question is asked exactly as written, no reformulation).
  - probe_avoid = [] (empty).
  - is_jd_must_have = false.
  - These are added ON TOP of the 10-14 base — never displace JD or role topics.
  - Custom question TopicItems are asked FIRST in the interview, in the order they were provided.

\u2501\u2501\u2501 MANDATORY \u2501\u2501\u2501
  - topic_pool base size (excluding custom questions): 10-14 TopicItems, both bounds mandatory.
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
  "skill_coverage_map": { "skill_key": ["topic_id"] },
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
role — testing conceptual/practical depth that any competent person in this role should
have, independent of the JD wording.

Rules:
  - Do NOT duplicate any concept already covered by an existing topic (titles and
    descriptions are listed below) — check tech/skill overlap, not just title text.
  - Each new topic must be answerable with a concrete, grounded question — not
    generic ("tell me about automation") but specific ("how do you decide chunk
    size when documents vary in length").
  - topic_type is "role_topic", is_custom_question=false.
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
    jd_data: dict,
    custom_questions: list[str],
    openai_client: AsyncOpenAI,
    llm_model: str,
    level: int = 2,
    usage_sink: Any = None,
) -> InterviewBrief:
    # Step 1: deterministic JD extraction (zero LLM) + role understanding run concurrently.
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
# Deterministic dedup safety net -- if two topics share tech_stack overlap
# AND probe_focus wording overlap, they are testing the same concept.
# ---------------------------------------------------------------------------

def _tech_tokens(t: TopicItem) -> set[str]:
    """Normalized tokens from tech_stack only."""
    return {tok.strip().lower() for tok in t.tech_stack if tok.strip()}


def _probe_tokens(t: TopicItem) -> set[str]:
    """Normalized word tokens from probe_focus."""
    return {w.strip().lower() for w in t.probe_focus.split() if len(w.strip()) > 3}


def _dedup_any_overlap(topics: list[TopicItem]) -> list[TopicItem]:
    """Pass across ALL pairs: if two topics share tech_stack overlap
    AND probe_focus wording overlap, they're testing the same concept
    under different titles -- drop the lower-priority one."""
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
                "[DEDUP] dropping %r -- overlaps %r on tech+probe concept",
                t.title, dup_of.title,
            )
            continue
        kept.append(t)
    return kept
