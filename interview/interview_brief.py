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
No raw JSON. No parsing needed. Your jobs are:
  1. Turn every extracted item into a TopicItem with relevance score, probe guidance
  2. Select the anchor topic (most strategically valuable for this role + band)
  3. Generate 4–6 role_topic TopicItems from YOUR domain knowledge — not from the resume/JD
  4. Turn each JD requirement into a TopicItem if not already covered by a project/skill
  5. Write interview_strategy, focus_areas, red_flags, candidate_summary
  6. Deduplicate: if a resume skill and a JD skill are the same thing, ONE TopicItem only
     (source="resume", is_jd_must_have=true). Never two entries for the same concept.

TOPIC COUNT — this is a 20-minute interview. You need enough topics to fill it.
  Target: 18–32 topics total across all types.
  Every project → TopicItem. Every work history entry → TopicItem.
  Every resume skill → TopicItem (unless already fully covered inside a project tech stack AND
    that project is in the pool — in that case add to skill_coverage_map only).
  Every JD must-have → TopicItem (merge with resume skill if same).
  Every JD requirement → TopicItem with topic_type="role_topic" if not covered elsewhere.
  Role topics from your knowledge → 4–6 TopicItems.
  NEVER cap at 8–10. If you have 25 real topics, return 25.

BAND RULES:

FRESHER (0–2 years):
  probe_focus: ["what they built", "their specific role", "why they chose X", "what they learned"]
  probe_avoid: ["architecture at scale", "strategic tradeoffs", "team leadership"]
  anchor: most substantial hands-on project
  strategy: surface-level ownership, how they think, learning mindset

MID (2–5 years):
  probe_focus: ["personal ownership", "decisions made", "what broke and why", "specific scale"]
  probe_avoid: ["basic definitions", "pure theory"]
  anchor: project/role with most real ownership

EXPERIENCED (5–8 years):
  probe_focus: ["architectural decisions", "tradeoffs", "what broke at scale", "what they'd do differently"]
  probe_avoid: ["basic concepts", "surface-level familiarity"]
  anchor: most architecturally complex role

SENIOR (8+ years):
  probe_focus: ["strategic decisions", "org-level impact", "hard tradeoffs under pressure"]
  probe_avoid: ["implementation details", "basic anything"]
  topic count: major roles + key projects + strategic skills + ALL JD must-haves + 3–4 role_topics
  anchor: most strategically significant initiative

ROLE_TOPIC rules:
  - Generate 3–6 topics from YOUR knowledge. These are conceptual areas every competent person in this role knows.
  - Do NOT copy resume or JD items. These are additional depth checks.
  - Examples (use equivalent logic for the actual role):
    GTM/Growth: Lead qualification logic, Multi-channel outreach sequencing, Automation tool tradeoffs (n8n vs Zapier),
                Campaign performance metrics (open rate vs reply rate vs conversion), Data enrichment approaches
    Backend: Database indexing (B-tree vs hash, N+1), API design tradeoffs, Caching strategy, Concurrency/race conditions
    Frontend: Event loop & async JS, React reconciliation & keys, Web performance (LCP/CLS/FID), CSS specificity
    Data Scientist: Feature engineering vs model choice, Overfitting in practice, Precision/recall tradeoff, Class imbalance
  - Each role_topic needs a full_description Ishita can use to ask a specific grounded question.
  - Band calibration: Fresher = concept + basic why; Mid = real usage + what broke; Senior = tradeoffs + org impact.

DEDUP rules (YOU handle this — not Python):
  - Resume skills and JD must-haves may overlap. If they name the same thing → ONE TopicItem.
    source="resume" if candidate has it, is_jd_must_have=true if JD requires it.
  - A skill already fully described inside a project entry → add to skill_coverage_map,
    still create a TopicItem for it (so the agent can probe it independently if needed).
  - Never two TopicItems for the same concept. One entry, merged.

MANDATORY:
  - Every project → TopicItem (topic_type="project")
  - Every work history entry → TopicItem (topic_type="work")
  - Every resume skill → TopicItem (topic_type="skill") unless identical to a JD skill (merge)
  - Every JD must-have → TopicItem (topic_type="skill") unless identical to a resume skill (merge)
  - Every JD requirement not covered by the above → TopicItem (topic_type="role_topic")
  - 4–6 role topics from YOUR domain knowledge → TopicItems (topic_type="role_topic")
  - Custom questions → TopicItems (topic_type="role_topic")
  - anchor_topic must also be the FIRST item in topic_pool
  - Total topic_pool size: 18–32. Never fewer than 15.
  - Return ONLY valid JSON. No markdown. No explanation.

Schema — return exactly this, nothing else:
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

TopicItem — keep values SHORT (1 sentence max per field):
{
  "id": str,
  "topic_type": "project"|"work"|"skill"|"role_topic",
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

SPEED RULES — output must be compact:
  - full_description: 1–2 sentences max. No essays.
  - why_relevant: 1 short phrase, not a paragraph.
  - probe_focus: max 3 items, each 3–5 words.
  - probe_avoid: max 2 items, each 3–5 words.
  - interview_strategy: 2 sentences max.
  - candidate_summary: 1 sentence.
  - candidate_fit_gaps / focus_areas / red_flags: 3 items max each, short phrases.
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
        usage_sink({
            "model": llm_model,
            "inputTokens": int(getattr(usage_data, "prompt_tokens", 0) or 0),
            "outputTokens": int(getattr(usage_data, "completion_tokens", 0) or 0),
            "cachedInputTokens": int(
                getattr(getattr(usage_data, "prompt_tokens_details", None), "cached_tokens", 0) or 0
            ),
        })

    raw = "".join(chunks).strip()
    if not raw:
        raise ValueError("[BRIEF] empty response from LLM")

    brief = InterviewBrief.model_validate(json.loads(raw))

    logger.info(
        "[BRIEF] LLM brief generated: %d topics | anchor=%r | band=%s",
        len(brief.topic_pool), brief.anchor_topic.title, brief.candidate_band,
    )
    return brief
