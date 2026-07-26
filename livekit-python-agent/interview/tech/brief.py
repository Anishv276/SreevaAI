"""
interview/tech/brief.py
========================
InterviewBrief schema (TopicItem/RoleContext/InterviewBrief) shared by two
producers:
  - interview.tech.question_bank_adapter.build_brief_from_question_bank() --
    the production path for tech interviews. Pure data transform (no LLM
    call) from a stored, admin-generated Job.questionBank snapshot.
  - interview.conversational.brief.generate_interview_brief() -- the
    conversational/sales interview path, which imports InterviewBrief/
    TopicItem/RoleContext/_dedup_any_overlap from here directly.

Tech interviews used to generate this brief live via an LLM call
(generate_interview_brief() + _understand_role() + _topup_role_topics(),
previously defined in this file) -- that path is retired for tech interviews
in favor of the stored question bank, and was removed from this module.
scripts/verify_interview_pipelines.py's tech branch now exercises the adapter
instead of the old LLM pipeline.
"""
from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

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
