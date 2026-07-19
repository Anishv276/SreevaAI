"""
interview/demo/brief.py
========================
Generates a DemoBrief (8 JD-only topics) from a raw JD text.

Two modes — topic PRIORITY differs, everything else is the same:

  TECH (mode="TECH"):
    1. DSA / Algorithms  ← always at least 1 topic
    2. OOPs Concepts     ← always at least 1 topic
    3. System Design     ← always at least 1 topic if JD mentions scale/architecture
    4. JD Hard Skills    ← 3-5 topics from explicit technical requirements
    5. Problem-Solving   ← 1 topic: debugging, breaking down ambiguity

  CONVERSATION (mode="CONVERSATION"):
    1. Communication     ← always at least 1 topic
    2. Judgment Calls    ← always at least 1 topic
    3. Ownership         ← always at least 1 topic
    4. Collaboration     ← always at least 1 topic
    5. Role Behaviors    ← 3-4 topics from JD's behavioral requirements

The output DemoBrief is a Pydantic model that:
  - Can be JSON-serialised and stored as DemoTemplate.briefJson
  - Can be loaded by the agent and passed directly to the shared
    tech/conversational prompt layers via adapt_to_interview_brief()
  - Mirrors the field names of interview.tech.brief.InterviewBrief so
    the existing build_evaluation_layer_prompt() / build_interview_directive()
    work without any modification.

The only difference from InterviewBrief:
  - Every topic has tag="JD_TOPIC" (no RESUME_TOPIC or ROLE_TOPIC)
  - candidate_summary = a fixed demo blurb (no LLM needed)
  - skill_coverage_map = {} (no resume to check against)
  - red_flags = [] (no resume signals)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field, field_validator  # pyright: ignore[reportMissingImports]

try:
    from openai import AsyncOpenAI  # pyright: ignore[reportMissingImports]
    from interview.agent_runtime_utils import token_limit_kwarg
except ImportError:
    # Allow import outside the agent environment (e.g. from Node worker via subprocess)
    AsyncOpenAI = Any  # type: ignore[misc,assignment]
    def token_limit_kwarg(*a, **kw): return {}  # type: ignore[misc]

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# Schema — mirrors interview.tech.brief.TopicItem + InterviewBrief field names
# so existing prompt layers accept DemoBrief transparently.
# ---------------------------------------------------------------------------

class DemoTopicItem(BaseModel):
    """
    Maps 1-to-1 with interview.tech.brief.TopicItem.
    Fields that don't apply to demo are fixed to sensible defaults.
    """
    id: str
    title: str
    full_description: str
    # Always "JD_TOPIC" — we have no resume so every topic is a role requirement
    tag: str = "JD_TOPIC"
    topic_type: str = "skill"
    tech_stack: list[str] = Field(default_factory=list)
    probe_focus: list[str] = Field(default_factory=list)   # exactly 3 items
    probe_avoid: list[str] = Field(default_factory=list)
    importance: str = "HIGH"
    # "dsa" | "oops" | "system_design" | "jd_skill" | "behavioral" | "judgment"
    topic_category: str = "jd_skill"
    # Fields required by existing prompt layers — fixed for demo
    is_jd_must_have: bool = True
    is_custom_question: bool = False
    impact: str = ""
    why_relevant: str = ""

    @field_validator("importance", mode="before")
    @classmethod
    def _coerce_importance(cls, v: Any) -> str:
        s = str(v or "").strip().upper()
        return s if s in {"CRITICAL", "HIGH", "MEDIUM", "LOW"} else "HIGH"

    @field_validator("tag", mode="before")
    @classmethod
    def _force_jd_tag(cls, v: Any) -> str:
        # Always JD_TOPIC — guard against LLM hallucinating RESUME_TOPIC
        return "JD_TOPIC"


class DemoBrief(BaseModel):
    """
    Output of generate_demo_brief(). Stored in DemoTemplate.briefJson.
    Field names match interview.tech.brief.InterviewBrief so the agent can
    call the same prompt builders with this object.
    """
    mode: str                         # "TECH" | "CONVERSATION"
    role_title: str
    interview_strategy: str = ""
    anchor_topic: DemoTopicItem
    topic_pool: list[DemoTopicItem] = Field(default_factory=list)
    # Fixed for demo (no resume)
    candidate_summary: str = "Demo interview — role-based assessment, no resume."
    candidate_band: str = "mid"
    skill_coverage_map: dict = Field(default_factory=dict)
    red_flags: list[str] = Field(default_factory=list)
    role_context: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# LLM prompt — TECH mode
# ---------------------------------------------------------------------------

_TECH_SYSTEM = """\
You are an expert technical interviewer preparing a 5-minute demo interview brief (NO candidate resume).
All 8 topics come from the Job Description only. Every topic is JD_TOPIC (role requires it, candidate may or may not know it).

━━━ PRIORITY ORDER (technical) ━━━
Generate exactly 8 topics in this category priority:
  1. DSA / Algorithms     — at LEAST 1: time complexity, graphs/DP/sorting patterns, problem decomposition
  2. OOPs Concepts        — at LEAST 1: SOLID, design patterns, inheritance vs composition, real OOP decisions
  3. System Design        — at LEAST 1 (if JD mentions scale/architecture/microservices/DB): CAP theorem,
                            caching, DB design, API design, data modelling, failure modes
  4. JD Hard Skills       — 3-5 topics from the JD's explicit technical requirements (frameworks, languages, tools)
  5. Problem-Solving      — 1 topic: debugging approach, breaking down an ambiguous system/feature problem

Rules:
  - Exactly 8 topics total. anchor_topic = single most differentiating technical skill for this role.
  - topic_pool includes anchor first, then the other 7.
  - tag = "JD_TOPIC" on every topic (never RESUME_TOPIC).
  - probe_focus: exactly 3 strings — (1) mechanism/decision, (2) failure/tradeoff, (3) outcome/approach.
  - importance: "CRITICAL" for the 2 most essential, "HIGH" for next 4, "MEDIUM" for remaining 2.
  - topic_category: "dsa" | "oops" | "system_design" | "jd_skill" | "behavioral" | "judgment"

Return ONLY valid JSON. No markdown, no explanation.

Output schema:
{
  "mode": "TECH",
  "role_title": "<exact title from JD>",
  "interview_strategy": "<2-3 sentence strategy specific to this JD>",
  "anchor_topic": {TopicItem},
  "topic_pool": [{TopicItem}, ...]
}

TopicItem schema:
{
  "id": "t1",
  "title": "<short topic name>",
  "full_description": "<1-2 sentences, grounded in this JD>",
  "tag": "JD_TOPIC",
  "topic_type": "skill",
  "tech_stack": ["<tech if applicable>"],
  "probe_focus": ["<mechanism/decision>", "<failure/tradeoff>", "<outcome/approach>"],
  "probe_avoid": ["<what not to ask>"],
  "importance": "CRITICAL|HIGH|MEDIUM|LOW",
  "topic_category": "dsa|oops|system_design|jd_skill",
  "is_jd_must_have": true,
  "is_custom_question": false,
  "impact": "",
  "why_relevant": "<one line: why this matters for this specific role>"
}
"""

# ---------------------------------------------------------------------------
# LLM prompt — CONVERSATION mode
# ---------------------------------------------------------------------------

_CONV_SYSTEM = """\
You are an expert behavioral interviewer preparing a 5-minute demo interview brief (NO candidate resume).
All 8 topics come from the Job Description only. Every topic is JD_TOPIC (role requires it, candidate may or may not have done it).

━━━ PRIORITY ORDER (conversational) ━━━
Generate exactly 8 topics in this category priority:
  1. Communication        — at LEAST 1: stakeholder updates, written/verbal clarity, cross-team alignment
  2. Judgment Calls       — at LEAST 1: ambiguity handling, decisions with incomplete info, escalation logic
  3. Ownership            — at LEAST 1: driving initiatives to completion, accountability under setbacks
  4. Collaboration        — at LEAST 1: cross-functional work, managing up, conflict resolution
  5. Role Behaviors       — 3-4 topics from JD's explicit behavioral requirements
                            (client management, negotiation, process improvement, metrics mindset, etc.)

Rules:
  - Exactly 8 topics total. anchor_topic = single most important behavioral competency for this role.
  - topic_pool includes anchor first, then the other 7.
  - tag = "JD_TOPIC" on every topic.
  - tech_stack = [] for all conversational topics.
  - probe_focus: exactly 3 strings — (1) mechanism/decision, (2) conflict/tradeoff, (3) outcome/approach.
  - importance: "CRITICAL" for the 2 most essential, "HIGH" for next 4, "MEDIUM" for remaining 2.
  - topic_category: "behavioral" | "judgment" | "jd_skill"

Return ONLY valid JSON. No markdown, no explanation.

Output schema:
{
  "mode": "CONVERSATION",
  "role_title": "<exact title from JD>",
  "interview_strategy": "<2-3 sentence strategy specific to this JD>",
  "anchor_topic": {TopicItem},
  "topic_pool": [{TopicItem}, ...]
}

TopicItem schema:
{
  "id": "t1",
  "title": "<short topic name>",
  "full_description": "<1-2 sentences, grounded in this JD>",
  "tag": "JD_TOPIC",
  "topic_type": "skill",
  "tech_stack": [],
  "probe_focus": ["<mechanism/decision>", "<conflict/tradeoff>", "<outcome/approach>"],
  "probe_avoid": ["<what not to ask>"],
  "importance": "CRITICAL|HIGH|MEDIUM|LOW",
  "topic_category": "behavioral|judgment|jd_skill",
  "is_jd_must_have": true,
  "is_custom_question": false,
  "impact": "",
  "why_relevant": "<one line: why this matters for this specific role>"
}
"""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def generate_demo_brief(
    *,
    role_title: str,
    jd_text: str,
    mode: str,                        # "TECH" | "CONVERSATION"
    openai_client: "AsyncOpenAI",
    llm_model: str = "gpt-4.1",
) -> tuple[DemoBrief, dict]:
    """
    Generate an 8-topic DemoBrief from JD text only (no resume).
    Output is stored in DemoTemplate.briefJson and sent to the agent via
    LiveKit dispatch metadata. The agent passes it to the shared tech/conv
    prompt pipeline without modification.

    Returns (brief, usage) where usage is a raw token-count dict
    ({model, inputTokens, outputTokens, cachedInputTokens}) from the LAST
    completion call (retries on truncated JSON count once, using the final
    successful call's tokens) -- callers price it via billing.py's ONE rate
    table (CostCalculator.openai / the price-llm-usage CLI command) instead
    of duplicating pricing logic here.
    """
    mode_upper = (mode or "TECH").upper()
    system_prompt = _TECH_SYSTEM if mode_upper == "TECH" else _CONV_SYSTEM
    user_prompt = (
        f"ROLE: {role_title}\n\n"
        f"JOB DESCRIPTION:\n{jd_text[:5500]}\n\n"
        "Generate the 8-topic DemoBrief JSON now."
    )

    raw = ""
    # Every attempt (including a discarded truncated one) is a real, billed
    # call -- accumulate tokens across retries so the caller prices the full
    # cost incurred, not just the successful attempt's tokens.
    input_t = cached_t = output_t = 0
    for max_tokens in (3000, 5000):
        resp = await openai_client.chat.completions.create(
            model=llm_model,
            temperature=0,
            response_format={"type": "json_object"},
            **token_limit_kwarg(llm_model, max_tokens),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            timeout=30,
        )
        _usage = getattr(resp, "usage", None)
        if _usage:
            input_t += int(getattr(_usage, "prompt_tokens", 0) or 0)
            output_t += int(getattr(_usage, "completion_tokens", 0) or 0)
            _details = getattr(_usage, "prompt_tokens_details", None)
            cached_t += int(getattr(_details, "cached_tokens", 0) or 0) if _details else 0
        raw = (resp.choices[0].message.content or "").strip()
        if not raw:
            raise ValueError("[DEMO/BRIEF] Empty LLM response")
        try:
            parsed = json.loads(raw)
            break
        except json.JSONDecodeError:
            logger.warning("[DEMO/BRIEF] Truncated JSON at max_tokens=%d, retrying", max_tokens)
            continue
    else:
        raise ValueError(f"[DEMO/BRIEF] JSON truncated after retries: {raw[-200:]!r}")
    usage = {
        "model": llm_model, "inputTokens": input_t,
        "outputTokens": output_t, "cachedInputTokens": cached_t,
    }

    # Inject fixed demo fields before validation
    parsed.setdefault("candidate_summary", f"Demo interview: role-based {'technical' if mode_upper == 'TECH' else 'conversational'} assessment for {role_title}.")
    parsed.setdefault("candidate_band", "mid")
    parsed.setdefault("skill_coverage_map", {})
    parsed.setdefault("red_flags", [])
    parsed.setdefault("role_context", {})

    brief = DemoBrief.model_validate(parsed)

    # Ensure anchor is always topic_pool[0]
    if brief.topic_pool and brief.topic_pool[0].id != brief.anchor_topic.id:
        others = [t for t in brief.topic_pool if t.id != brief.anchor_topic.id]
        brief = brief.model_copy(update={"topic_pool": [brief.anchor_topic, *others]})

    logger.info(
        "[DEMO/BRIEF] ✓ %s brief: %d topics, anchor=%r",
        mode_upper, len(brief.topic_pool), brief.anchor_topic.title,
    )
    return brief, usage
