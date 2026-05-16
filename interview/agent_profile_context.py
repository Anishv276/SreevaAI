"""
interview/agent_profile_context.py
===================================
Candidate Knowledge Base — Production-Grade Rewrite

Tech Stack Applied:
  - Pydantic V2 BaseModel   → Type-safe, self-validating data containers.
  - OOP Strategy Pattern    → One class per candidate band (Fresher/Mid/Experienced/Senior).
  - DSA O(1) Lookup Table   → Band and anchor strategies via dict, not if/else chains.
  - Safe Defaults Everywhere → No None-related crashes in production.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from interview.resume_context_parser import (
    ResumeContext,
    build_interview_turns,
    ensure_resume_context as _ensure_resume_context,
    parse_resume_context,
)
from interview.agent_utils import (
    _as_list,
    _coerce_jsonish,
    _deep_get,
    _extract_text_items,
    _first_text,
    _format_compact_section,
    _join_items,
)


# ---------------------------------------------------------------------------
# Pydantic Model: ResumeBrief
# Replaces raw dict returns. Now fully typed and crash-proof.
# ---------------------------------------------------------------------------

class ResumeBrief(BaseModel):
    """
    A structured, validated brief about a candidate's resume.
    Replaces the raw dict returned by build_resume_brief().

    Before (Brittle):
        brief = {"band": "mid", "skills": None}  # None crashes f-strings later

    After (Safe):
        brief = ResumeBrief(band="mid", skills=[])  # Always a list, never None
    """

    band: str = Field(default="mid", description="Candidate experience band.")
    anchor_item: str = Field(default="your background", description="The first topic the AI will anchor on.")
    anchor_type: str = Field(default="background", description="Type of anchor: project, role, internship, etc.")
    skills: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    work_history: list[str] = Field(default_factory=list)
    internships: list[str] = Field(default_factory=list)
    current_role: str = Field(default="")
    years_label: str = Field(default="")
    major_projects: list[str] = Field(default_factory=list)
    career_trajectory: list[str] = Field(default_factory=list)
    flagship_initiatives: list[str] = Field(default_factory=list)

    @field_validator("anchor_item", "anchor_type", "current_role", "years_label", mode="before")
    @classmethod
    def coerce_str(cls, v: Any) -> str:
        """Safely convert any value to a string, preventing None → 'None' artifacts."""
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("skills", "education", "projects", "work_history",
                     "internships", "major_projects", "career_trajectory",
                     "flagship_initiatives", mode="before")
    @classmethod
    def coerce_list(cls, v: Any) -> list[str]:
        """Safely convert any value to a list of non-empty strings."""
        if not v:
            return []
        if isinstance(v, str):
            return [v.strip()] if v.strip() else []
        if isinstance(v, (list, tuple)):
            return [str(item).strip() for item in v if item and str(item).strip()]
        return []

    def anchor_label(self) -> str:
        """Safe, formatted anchor for use in prompts. Never returns 'None'."""
        item = self.anchor_item or "your background"
        atype = self.anchor_type or "topic"
        return f"{atype} — {item}"


# ---------------------------------------------------------------------------
# Pydantic Model: CandidateBandContext
# Replaces @dataclass(slots=True). Now validated & safe at construction time.
# ---------------------------------------------------------------------------

class CandidateBandContext(BaseModel):
    """
    The live session context for the interview. Passed between all modules.

    Before (Brittle — dataclass):
        @dataclass(slots=True)
        class CandidateBandContext:
            resume_brief: dict   # Can be None or partial → crashes later

    After (Safe — Pydantic):
        class CandidateBandContext(BaseModel):
            resume_brief: ResumeBrief  # Always fully formed. Never crashes.
    """

    model_config = {"arbitrary_types_allowed": True}

    candidate_band: str = Field(default="mid")
    resume_brief: ResumeBrief = Field(default_factory=ResumeBrief)
    coverage_items: list[str] = Field(default_factory=list)
    merged_brief_block: str = Field(default="")
    live_prompt_context: str = Field(default="")
    depth_instruction: str = Field(default="")
    initial_context_injected: bool = Field(default=False)
    resume_context: Optional[ResumeContext] = Field(default=None)
    stage_history: list[str] = Field(default_factory=list)

    @field_validator("candidate_band", mode="before")
    @classmethod
    def validate_band(cls, v: Any) -> str:
        allowed = {"fresher", "mid", "experienced", "senior"}
        band = str(v).strip().lower() if v else "mid"
        return band if band in allowed else "mid"

    @field_validator("coverage_items", "stage_history", mode="before")
    @classmethod
    def coerce_list(cls, v: Any) -> list[str]:
        if not v:
            return []
        if isinstance(v, (list, tuple)):
            return [str(i).strip() for i in v if i and str(i).strip()]
        return []

    @model_validator(mode="after")
    def ensure_live_context(self) -> "CandidateBandContext":
        """Auto-populate live_prompt_context from merged_brief_block if not set."""
        if not self.live_prompt_context and self.merged_brief_block:
            self.live_prompt_context = self.merged_brief_block.strip()
        return self


# ---------------------------------------------------------------------------
# OOP Strategy Pattern: Band Strategies
# Replaces the giant if/else in build_resume_brief().
#
# Before (Brittle — 60+ line if/else):
#     if band == "fresher":
#         ...
#     elif band == "mid":
#         ...
#
# After (Clean — one class per band, open/closed principle):
#     FresherBandStrategy().build(resume_context) → ResumeBrief
# ---------------------------------------------------------------------------

class BandStrategy(ABC):
    """Abstract base strategy. Each band implements build()."""

    @abstractmethod
    def build(self, resume_context: ResumeContext) -> ResumeBrief:
        """Build a fully validated ResumeBrief for this band."""
        ...

    def _resolve_anchor(
        self,
        resume_context: ResumeContext,
        priority: list[tuple[list, str]],
        fallback: str = "your background",
        fallback_type: str = "background",
    ) -> tuple[str, str]:
        """
        DSA: O(1) anchor resolution via priority list.
        Walks the priority list and returns the first non-empty item.
        """
        for source_list, anchor_type in priority:
            if source_list:
                item = source_list[0]
                return (str(item).strip() if item else fallback), anchor_type
        return fallback, fallback_type


class FresherBandStrategy(BandStrategy):
    def build(self, resume_context: ResumeContext) -> ResumeBrief:
        anchor_item, anchor_type = self._resolve_anchor(
            resume_context,
            priority=[
                (resume_context.projects, "project"),
                (resume_context.education, "education"),
                (resume_context.work_history, "internship"),
            ],
        )
        return ResumeBrief(
            band="fresher",
            anchor_item=anchor_item,
            anchor_type=anchor_type,
            education=resume_context.education[:2],
            projects=resume_context.projects[:3],
            internships=resume_context.work_history[:2],
            skills=resume_context.skills[:5],
        )


class MidBandStrategy(BandStrategy):
    def build(self, resume_context: ResumeContext) -> ResumeBrief:
        anchor_item, anchor_type = self._resolve_anchor(
            resume_context,
            priority=[
                (resume_context.work_history, "role"),
                (resume_context.projects, "project"),
            ],
            fallback=resume_context.current_role or "your role",
            fallback_type="role",
        )
        return ResumeBrief(
            band="mid",
            anchor_item=anchor_item,
            anchor_type=anchor_type,
            current_role=resume_context.current_role,
            years_label=resume_context.years_label,
            work_history=resume_context.work_history[:3],
            projects=resume_context.projects[:2],
            skills=resume_context.skills[:7],
        )


class ExperiencedBandStrategy(BandStrategy):
    def build(self, resume_context: ResumeContext) -> ResumeBrief:
        anchor_item, anchor_type = self._resolve_anchor(
            resume_context,
            priority=[
                (resume_context.projects, "project"),
                (resume_context.work_history, "role"),
            ],
            fallback=resume_context.current_role or "your role",
            fallback_type="role",
        )
        return ResumeBrief(
            band="experienced",
            anchor_item=anchor_item,
            anchor_type=anchor_type,
            current_role=resume_context.current_role,
            years_label=resume_context.years_label,
            work_history=resume_context.work_history[:3],
            major_projects=resume_context.projects[:2],
            skills=resume_context.skills[:5],
        )


class SeniorBandStrategy(BandStrategy):
    def build(self, resume_context: ResumeContext) -> ResumeBrief:
        anchor_item, anchor_type = self._resolve_anchor(
            resume_context,
            priority=[
                (resume_context.projects, "initiative"),
                (resume_context.work_history, "role"),
            ],
            fallback=resume_context.current_role or "your role",
            fallback_type="role",
        )
        return ResumeBrief(
            band="senior",
            anchor_item=anchor_item,
            anchor_type=anchor_type,
            current_role=resume_context.current_role,
            years_label=resume_context.years_label,
            career_trajectory=resume_context.work_history[:3],
            flagship_initiatives=resume_context.projects[:2],
            skills=resume_context.skills[:4],
        )


# DSA: O(1) Strategy Lookup Table — replaces if/else chain entirely.
_BAND_STRATEGY_MAP: dict[str, BandStrategy] = {
    "fresher": FresherBandStrategy(),
    "mid": MidBandStrategy(),
    "experienced": ExperiencedBandStrategy(),
    "senior": SeniorBandStrategy(),
}

# DSA: O(1) Depth instruction lookup per band.
_BAND_DEPTH_INSTRUCTIONS: dict[str, str] = {
    "fresher": "Focus on learning signals, project ownership, and problem-solving mindset. Keep it warm.",
    "mid": "Balance breadth and depth. Two follow-ups per key topic. Probe for reasoning but stay warm.",
    "experienced": "Push for architecture depth, scale trade-offs, and cross-team decisions.",
    "senior": "Probe strategic judgment, org-wide influence, and high-stakes decisions under uncertainty.",
}

# DSA: O(1) Band strategy description lookup for brief assembly.
_BAND_INTERVIEW_STRATEGY: dict[str, str] = {
    "fresher": "Prioritize projects, learning approach, and fundamentals; avoid assuming full-time ownership.",
    "mid": "Prioritize individual ownership, measurable impact, and decision trade-offs.",
    "experienced": "Prioritize end-to-end ownership, architecture depth, and scale constraints.",
    "senior": "Prioritize strategic judgment, cross-team influence, and high-stakes trade-offs.",
}


# ---------------------------------------------------------------------------
# Public API: infer_candidate_band
# ---------------------------------------------------------------------------

def infer_candidate_band(structured_resume_raw: Any, resume_text_block: str) -> str:
    """
    Determine the candidate's band from structured resume data.

    Band thresholds:
      fresher:     < 1.5 years
      mid:         1.5 – 5 years
      experienced: > 5 – 10 years
      senior:      > 10 years
    """
    context = _ensure_resume_context(structured_resume_raw, resume_text_block)

    # Fast path: explicit years_of_experience from structured data (O(1)).
    if context.years_of_experience is not None:
        yoe = context.years_of_experience
        if yoe < 1.5:
            return "fresher"
        if yoe > 10:
            return "senior"
        if yoe > 5:
            return "experienced"
        return "mid"

    # Fallback: text-signal analysis when years are not available.
    text = (context.resume_text or "").lower()

    _FRESHER_SIGNALS = frozenset(
        {"fresher", "entry level", "student", "final year", "internship", "intern", "graduate"}
    )
    _SENIOR_SIGNALS = frozenset(
        {"senior", "staff engineer", "principal", "director", "head of"}
    )
    _EXPERIENCED_SIGNALS = frozenset(
        {"lead", "manager"}
    )

    has_fresher = context.fresher_signals or any(sig in text for sig in _FRESHER_SIGNALS)
    has_senior = any(sig in text for sig in _SENIOR_SIGNALS)
    has_experienced = context.experienced_signals or any(sig in text for sig in _EXPERIENCED_SIGNALS)
    has_work = bool(context.work_history)
    has_projects = bool(context.projects)

    if has_fresher and not has_experienced and not has_senior and not has_work:
        return "fresher"
    if has_senior:
        return "senior"
    if has_experienced:
        return "experienced"
    if has_work or has_projects:
        return "mid"
    return "mid"


# ---------------------------------------------------------------------------
# Public API: build_resume_brief
# ---------------------------------------------------------------------------

def build_resume_brief(band: str, resume_context: ResumeContext) -> ResumeBrief:
    """
    Build a validated ResumeBrief for the candidate's band using the Strategy Pattern.

    Before (Brittle):
        Returns a raw dict. If you forget a key, you get a KeyError crash in prod.

    After (Safe):
        Returns a Pydantic ResumeBrief. Missing fields have safe defaults.
        Callers use brief.skills, not brief.get("skills", []).
    """
    strategy = _BAND_STRATEGY_MAP.get(band) or _BAND_STRATEGY_MAP["mid"]
    return strategy.build(resume_context)


# ---------------------------------------------------------------------------
# Public API: first_name_from_full_name
# ---------------------------------------------------------------------------

def first_name_from_full_name(full_name: str) -> str:
    """Safely extract first name. Returns empty string for blank input."""
    if not full_name:
        return ""
    cleaned = " ".join(str(full_name).strip().split())
    return cleaned.split(" ", 1)[0] if cleaned else ""


# ---------------------------------------------------------------------------
# Public API: refresh_candidate_band_context
# ---------------------------------------------------------------------------

def refresh_candidate_band_context(context: CandidateBandContext) -> CandidateBandContext:
    """
    Sync live_prompt_context from merged_brief_block.
    Safe: never sets live_prompt_context to None or empty without fallback.
    """
    context.live_prompt_context = context.merged_brief_block.strip() or "Not available"
    return context


# ---------------------------------------------------------------------------
# Internal: _extract_jd_must_haves
# ---------------------------------------------------------------------------

def _extract_jd_must_haves(jd_data: dict[str, Any]) -> list[str]:
    """
    Extract must-have skills from extractedDetails JSON.
    Tries multiple key paths to handle different JD schema shapes.
    Returns at most 8 items to keep the prompt concise.
    """
    def _parse_entries(entries: list) -> list[str]:
        out: list[str] = []
        for item in entries:
            if isinstance(item, dict):
                skill = _first_text(item.get("skill"), item.get("name"), item.get("title"))
                why = _first_text(item.get("why_needed"), item.get("reason"), item.get("description"))
                if skill and why:
                    out.append(f"{skill} ({why})")
                elif skill:
                    out.append(skill)
                elif why:
                    out.append(why)
            else:
                text = _first_text(item)
                if text:
                    out.append(text)
        return out

    # Path 1: skills.must_have (original schema)
    entries = _as_list(_deep_get(jd_data, "skills.must_have"))
    capabilities = _parse_entries(entries)

    # Path 2: criteria (your actual JD schema from extractedDetails)
    if not capabilities:
        entries = _as_list(_deep_get(jd_data, "criteria"))
        capabilities = _parse_entries(entries)

    # Path 3: criteria.must_have
    if not capabilities:
        entries = _as_list(_deep_get(jd_data, "criteria.must_have"))
        capabilities = _parse_entries(entries)

    # Path 4: top-level requirements
    if not capabilities:
        capabilities = _extract_text_items(_deep_get(jd_data, "requirements"))

    # Path 5: keywords as last resort
    if not capabilities:
        capabilities = _extract_text_items(_deep_get(jd_data, "keywords"))

    return _extract_text_items(capabilities)[:8]


# ---------------------------------------------------------------------------
# Public API: build_merged_interview_brief
# ---------------------------------------------------------------------------

def build_merged_interview_brief(
    *,
    candidate_name: str,
    job_title: str,
    candidate_band: str,
    resume_context: ResumeContext,
    jd_details: Any,
    resume_brief: Optional[ResumeBrief] = None,
    custom_questions: Optional[list] = None,
) -> str:
    """
    Assemble the INTERVIEW BRIEF block that is injected into the AI system prompt.

    Data sources: resumeData + extractedDetails only (no legacy DB fields).

    Safe against:
      - None candidate_name / job_title
      - Missing JD data
      - Partial resume_context
      - Unknown candidate bands
    """
    jd_data = _coerce_jsonish(jd_details)
    jd_must_haves = _extract_jd_must_haves(jd_data)

    # Anchor resolution: prefer brief data, then fall back to resume_context.
    anchor_item = ""
    anchor_type = ""
    if isinstance(resume_brief, ResumeBrief):
        anchor_item = resume_brief.anchor_item
        anchor_type = resume_brief.anchor_type
    elif isinstance(resume_brief, dict):
        # Backward-compat: if a raw dict is still passed, coerce it safely.
        anchor_item = _first_text(resume_brief.get("anchor_item"))
        anchor_type = _first_text(resume_brief.get("anchor_type"))

    if not anchor_item:
        anchor_item = _first_text(
            resume_context.projects[0] if resume_context.projects else "",
            resume_context.work_history[0] if resume_context.work_history else "",
            resume_context.current_role,
        )
    if not anchor_type:
        anchor_type = "project" if resume_context.projects else "role"

    # DSA: O(1) band strategy lookup.
    band_strategy = _BAND_INTERVIEW_STRATEGY.get(
        candidate_band,
        "Prioritize concrete ownership and role-fit evidence.",
    )

    # Safe string defaults — prevents "None" literals appearing in the AI prompt.
    safe_name = (candidate_name or "Candidate").strip()
    safe_role = (job_title or "Interview Role").strip()
    safe_anchor_item = (anchor_item or "candidate background").strip()
    safe_anchor_type = (anchor_type or "topic").strip()

    lines = [
        f"Candidate: {safe_name}",
        f"Role: {safe_role}",
        f"Band: {candidate_band}",
        f"Experience: {resume_context.years_label or 'Not specified'}",
        f"Current role: {resume_context.current_role or 'Not specified'}",
        f"Top skills: {_join_items(resume_context.skills, 6)}",
        f"Key projects/work: {_join_items(resume_context.projects + resume_context.work_history, 4)}",
        f"JD must-haves: {_join_items(jd_must_haves, 5)}",
        f"First anchor: {safe_anchor_type} — {safe_anchor_item}",
        f"Interview strategy: {band_strategy}",
    ]

    _cqs = [str(q).strip() for q in (custom_questions or []) if str(q).strip()]
    if _cqs:
        lines.append(
            f"Custom questions ({len(_cqs)} — MUST cover all before interview ends): "
            + " | ".join(f"{i+1}. {q}" for i, q in enumerate(_cqs))
        )
    else:
        lines.append("Custom questions: none")

    return _format_compact_section("INTERVIEW BRIEF", lines).strip()


# ---------------------------------------------------------------------------
# Public API: build_stage_seeds
# Condensed scenario/behavioral seeds for Stage 3 & 4 — NOT the full brief.
# Replaces injecting the raw merged_brief_block verbatim into later stages.
# ---------------------------------------------------------------------------

def build_stage_seeds(
    *,
    candidate_name: str,
    job_title: str,
    candidate_band: str,
    resume_context: ResumeContext,
    jd_details: Any,
    covered_topics: Optional[list[str]] = None,
) -> str:
    """
    Build a tight scenario-seed block for Stage 3 (situational) and Stage 4 (behavioral).
    Contains only what those stages need: role, band, top projects NOT yet covered, JD must-haves.
    Does NOT repeat the full brief — that's already in the evaluation layer.
    """
    jd_data = _coerce_jsonish(jd_details)
    jd_must_haves = _extract_jd_must_haves(jd_data)
    covered = set(str(t).lower().strip() for t in (covered_topics or []))

    # Pick top projects/roles that haven't been covered in earlier stages
    all_items = resume_context.projects + resume_context.work_history
    fresh_items = [
        item for item in all_items
        if not any(c in str(item).lower() for c in covered if len(c) > 4)
    ][:3]
    # If everything was covered, fall back to all items (still useful as scenario seeds)
    seed_items = fresh_items or all_items[:3]

    safe_name = (candidate_name or "Candidate").strip()
    safe_role = (job_title or "the role").strip()

    lines = [
        f"Candidate: {safe_name}  |  Role: {safe_role}  |  Band: {candidate_band}",
        f"Current role: {resume_context.current_role or 'Not specified'}",
    ]
    if jd_must_haves:
        lines.append(f"JD must-haves to probe: {_join_items(jd_must_haves, 5)}")
    if seed_items:
        lines.append("Scenario seeds (use these — do NOT re-ask what was already covered in Stage 1/2):")
        for item in seed_items:
            lines.append(f"  - {str(item).strip()}")
    if covered_topics:
        lines.append(f"Already covered in earlier stages: {', '.join(list(covered)[:5])}")
    return "\n".join(lines).strip()
