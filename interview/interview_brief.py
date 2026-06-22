"""
interview/interview_brief.py
============================
Generates a structured InterviewBrief from resume + JD data.

Flow:
  1. brief_extraction.run_extraction() — LangGraph pipeline (pure Python, zero LLM)
       Parallel: extract_resume + extract_jd → merge+dedup → build_llm_input block
  2. _call_llm_for_brief() — single LLM call on the clean ~800-token text block
       LLM does: relevance scoring, anchor, probe guidance, role topics, strategy
  3. InterviewBrief.model_validate() — Pydantic validates output before use

No raw JSON is ever sent to the LLM. Latency target: <20s (was 2+ min).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, field_validator

from interview.brief_extraction import run_extraction

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# Output schema — InterviewBrief returned to agent_runtime
# ---------------------------------------------------------------------------

class TopicItem(BaseModel):
    id: str
    topic_type: str  # "project" | "work" | "skill" | "role_topic"
    tag: str = "RESUME_TOPIC"  # "RESUME_TOPIC" | "JD_TOPIC" | "ROLE_TOPIC"
    title: str
    full_description: str
    tech_stack: list[str] = Field(default_factory=list)
    impact: str = ""
    source: str = ""           # "resume" | "jd" | "inferred"
    is_jd_must_have: bool = False
    relevance_score: float = 0.5
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

    @field_validator("relevance_score", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> float:
        try:
            return max(0.0, min(1.0, float(v)))
        except (TypeError, ValueError):
            return 0.5


class RoleContext(BaseModel):
    role_title: str
    role_summary: str = ""
    must_have_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)


class InterviewBrief(BaseModel):
    role_context: RoleContext
    candidate_band: str = "mid"
    candidate_summary: str = ""
    anchor_topic: TopicItem
    topic_pool: list[TopicItem] = Field(default_factory=list)
    skill_coverage_map: dict[str, list[str]] = Field(default_factory=dict)
    interview_strategy: str = ""
    candidate_fit_gaps: list[str] = Field(default_factory=list)
    focus_areas: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)

    @field_validator("candidate_band", mode="before")
    @classmethod
    def _coerce_band(cls, v: Any) -> str:
        allowed = {"fresher", "mid", "experienced", "senior"}
        s = str(v or "").strip().lower()
        return s if s in allowed else "mid"


# ---------------------------------------------------------------------------
# LLM system prompt — lean: no parsing, only strategy + scoring + role topics
# ---------------------------------------------------------------------------

_BRIEF_SYSTEM = """\
You are an expert hiring manager and technical interviewer.
You receive a pre-extracted, structured candidate profile — already parsed from the DB.
No raw JSON. No parsing needed. Your jobs:
  1. Turn every extracted item into a TopicItem with the correct tag, relevance score, and probe guidance
  2. Select the anchor topic (most strategically valuable for this role + band)
  3. Generate role_topic TopicItems from YOUR expert domain knowledge of the role — not from resume or JD
  4. Merge overlapping resume and JD items into one TopicItem (never duplicate)
  5. Write interview_strategy, focus_areas, red_flags, candidate_summary — calibrated to role and band
  6. The interview_strategy must be SPECIFIC to this exact role, band, and candidate — not generic filler

━━━ TOPIC TAGS (required on every TopicItem) ━━━
  RESUME_TOPIC — from candidate's resume (projects, work history, resume skills)
  JD_TOPIC     — from the job description (must-have / nice-to-have skills, JD requirements)
  ROLE_TOPIC   — from your expert knowledge of the role (NOT from resume or JD)

If a resume skill appears in the JD must-haves → tag=RESUME_TOPIC, is_jd_must_have=true (resume wins)
If a JD requirement is not on the resume → tag=JD_TOPIC

━━━ TOPIC COUNT ━━━
Target: 18–32 topics. Every project → TopicItem. Every work entry → TopicItem.
Every resume skill → TopicItem (unless already in skill_coverage_map for a listed project).
Every JD must-have → TopicItem (merge with resume item if same concept).
ROLE_TOPIC count: enough to fill the interview with role-depth checks — minimum 5, no fixed cap.
NEVER cap at 8–10. Return all real topics.

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

━━━ ROLE_TOPIC GENERATION (critical — this is where the interview gets depth) ━━━
Generate ROLE_TOPICs from your expert knowledge of the role. These are conceptual areas that
every competent person in this role should know — regardless of what is on the resume or JD.
The goal: test role depth, not just candidate experience.

Rules:
  - Minimum 5 role topics. No upper cap — generate as many as the role demands.
  - Do NOT copy resume or JD items. Completely independent.
  - Each role_topic must be specific enough that Ishita can ask one concrete, grounded question about it.
  - Role topics must change based on band: same concept, different depth.

Examples by role (generate equivalent for the actual role):
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

━━━ DEDUP ━━━
Resume and JD may overlap. If they name the same concept → ONE TopicItem, tag=RESUME_TOPIC, is_jd_must_have=true.
A skill already covered by a project → add to skill_coverage_map, still create a TopicItem.
Never two TopicItems for the same concept.

━━━ MANDATORY ━━━
  - Every project → TopicItem (topic_type="project", tag="RESUME_TOPIC")
  - Every work entry → TopicItem (topic_type="work", tag="RESUME_TOPIC")
  - Every resume skill → TopicItem (topic_type="skill", tag="RESUME_TOPIC") unless merged with JD
  - Every JD must-have not on resume → TopicItem (topic_type="skill", tag="JD_TOPIC")
  - Every JD requirement not covered above → TopicItem (topic_type="role_topic", tag="JD_TOPIC")
  - Role-based topics from expert knowledge → TopicItems (topic_type="role_topic", tag="ROLE_TOPIC")
  - Custom questions → TopicItems (topic_type="role_topic", tag="ROLE_TOPIC")
  - anchor_topic must also be the FIRST item in topic_pool
  - Total topic_pool: 18–32 minimum. Never fewer than 15.
  - Return ONLY valid JSON. No markdown. No explanation.

Schema:
{
  "role_context": { "role_title": str, "role_summary": str, "must_have_skills": [str], "nice_to_have_skills": [str] },
  "candidate_band": "fresher"|"mid"|"experienced"|"senior",
  "candidate_summary": str,
  "anchor_topic": TopicItem,
  "topic_pool": [TopicItem],
  "skill_coverage_map": { "skill_key": ["topic_id"] },
  "interview_strategy": str,
  "candidate_fit_gaps": [str],
  "focus_areas": [str],
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
  "source": "resume"|"jd"|"inferred",
  "is_jd_must_have": bool,
  "relevance_score": float,
  "why_relevant": str,
  "probe_focus": [str],
  "probe_avoid": [str]
}

OUTPUT SIZE RULES:
  - full_description: 1–2 sentences. Specific enough to ground a question.
  - why_relevant: 1 short phrase.
  - probe_focus: max 3 items, 3–5 words each.
  - probe_avoid: max 2 items, 3–5 words each.
  - interview_strategy: 3–5 sentences. Must be specific to this role, band, and candidate — not generic.
  - candidate_summary: 1–2 sentences.
  - candidate_fit_gaps / focus_areas / red_flags: up to 5 items each, short phrases.
"""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_BRIEF_MODEL = "gpt-4.1"   # faster throughput on large structured outputs than mini


async def generate_interview_brief(
    *,
    candidate_name: str,
    job_title: str,
    candidate_band: str,
    resume_json: dict,
    jd_data: dict,
    custom_questions: list[str],
    openai_client: AsyncOpenAI,
    llm_model: str = _BRIEF_MODEL,
    usage_sink: Any = None,
) -> InterviewBrief:
    # Step 1: deterministic extraction via LangGraph (zero LLM)
    llm_input_block = await run_extraction(
        resume_json=resume_json,
        jd_data=jd_data,
        candidate_name=candidate_name,
        job_title=job_title,
        band=candidate_band,
        custom_questions=custom_questions or [],
    )

    # Step 2: single LLM call on clean compact block
    user_prompt = (
        f"{llm_input_block}\n"
        f"BAND: {candidate_band.upper()}\n"
        f"Generate the InterviewBrief JSON now. Keep all text fields SHORT (see SPEED RULES)."
    )

    # stream=True: keeps HTTP connection alive during generation, prevents idle-connection
    # timeouts. temperature=0: deterministic + marginally faster (no sampling).
    stream = await openai_client.chat.completions.create(
        model=llm_model,
        temperature=0,
        response_format={"type": "json_object"},
        max_tokens=5000,
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

    brief = InterviewBrief.model_validate(json.loads(raw))

    logger.info(
        "[BRIEF] LLM brief generated: %d topics | anchor=%r | band=%s",
        len(brief.topic_pool), brief.anchor_topic.title, brief.candidate_band,
    )
    return brief
