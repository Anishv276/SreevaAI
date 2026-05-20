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

    @field_validator("candidate_band", mode="before")
    @classmethod
    def validate_band(cls, v: Any) -> str:
        allowed = {"fresher", "mid", "experienced", "senior"}
        band = str(v).strip().lower() if v else "mid"
        return band if band in allowed else "mid"

    @field_validator("coverage_items", mode="before")
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
    "mid": "Balance breadth and depth. Go as deep as needed per topic — move on when you have enough signal. Probe for reasoning but stay warm.",
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
    """
    Extract a usable first name from an Indian full name.
    Skips single-letter initials at the start. For 3+ token names with no leading
    initial, uses the second token (given name in South/North Indian conventions).
    Examples: "S Meenakshi" → "Meenakshi", "Vadla Vamsi Krishna" → "Vamsi",
              "Ravi Kumar" → "Ravi", "John" → "John".
    """
    if not full_name:
        return ""
    tokens = " ".join(str(full_name).strip().split()).split()
    if not tokens:
        return ""
    # Single token — return as-is
    if len(tokens) == 1:
        return tokens[0]
    # If first token is a single letter (initial), skip it
    if len(tokens[0]) == 1:
        return tokens[1]
    # 3+ token name, no leading initial → second token is given name
    if len(tokens) >= 3:
        return tokens[1]
    # 2-token name, first is a real word → return first token
    return tokens[0]


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

    # Path 2: criteria (actual JD extraction schema) — filter critical/high priority only
    if not capabilities:
        all_criteria = _as_list(_deep_get(jd_data, "criteria"))
        must_criteria = [c for c in all_criteria if isinstance(c, dict) and c.get("priority") in ("critical", "high")]
        capabilities = _parse_entries(must_criteria or all_criteria)  # fall back to all if none have priority set

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
    Assemble the detailed CANDIDATE BRIEF block injected into the AI system prompt.

    Contains full resume depth: project descriptions, tech stacks, work history with
    roles and durations, complete skills list, JD must-haves with context, first
    anchor, and band-specific interview strategy.

    The directive (interview_phases.py) owns the strategy rules (priority order, quotas,
    how to move). This brief owns the candidate data.
    """
    jd_data = _coerce_jsonish(jd_details)
    raw_resume = resume_context.resume_data or {}

    # ── Anchor resolution ─────────────────────────────────────────────────────
    anchor_item = ""
    anchor_type = ""
    if isinstance(resume_brief, ResumeBrief):
        anchor_item = resume_brief.anchor_item
        anchor_type = resume_brief.anchor_type
    elif isinstance(resume_brief, dict):
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

    safe_name = (candidate_name or "Candidate").strip()
    safe_role = (job_title or "Interview Role").strip()
    safe_anchor = (anchor_item or "candidate background").strip()
    safe_anchor_type = (anchor_type or "topic").strip()

    band_strategy = _BAND_INTERVIEW_STRATEGY.get(
        candidate_band,
        "Prioritize concrete ownership and role-fit evidence.",
    )

    out: list[str] = []

    # ── Header ────────────────────────────────────────────────────────────────
    out.append(f"╔══ CANDIDATE BRIEF ══════════════════════════════════════════╗")
    out.append(f"  Candidate : {safe_name}")
    out.append(f"  Role      : {safe_role}")
    out.append(f"  Band      : {candidate_band.upper()}")
    out.append(f"  Experience: {resume_context.years_label or 'Not stated'}")
    out.append(f"  Current   : {resume_context.current_role or 'Not stated'}")
    out.append(f"╚═════════════════════════════════════════════════════════════╝")

    # ── 1. Skills ─────────────────────────────────────────────────────────────
    all_skills = resume_context.skills or []
    if all_skills:
        out.append("\n── SKILLS ──────────────────────────────────────────────────────")
        # Show all skills — no cap
        out.append("  " + " | ".join(all_skills))

    # ── 2. Projects (full detail) ─────────────────────────────────────────────
    raw_projects = _as_list(_deep_get(raw_resume, "projects")) or []
    if raw_projects:
        out.append("\n── PROJECTS ────────────────────────────────────────────────────")
        for i, proj in enumerate(raw_projects, 1):
            if isinstance(proj, dict):
                name = _first_text(proj.get("name"), proj.get("title")) or f"Project {i}"
                desc = _first_text(proj.get("description"), proj.get("summary")) or ""
                techs = _extract_text_items(
                    proj.get("technologies"), ("skill", "tool", "name", "value")
                )
                role_in_proj = _first_text(
                    proj.get("role"), proj.get("your_role"), proj.get("contribution")
                ) or ""
                outcome = _first_text(proj.get("outcome"), proj.get("impact"), proj.get("result")) or ""
                duration = _first_text(proj.get("duration"), proj.get("period")) or ""
                out.append(f"  [{i}] {name}" + (f" ({duration})" if duration else ""))
                if desc:
                    out.append(f"       What: {desc}")
                if role_in_proj:
                    out.append(f"       Role: {role_in_proj}")
                if techs:
                    out.append(f"       Tech: {' | '.join(techs)}")
                if outcome:
                    out.append(f"       Impact: {outcome}")
            else:
                text = _first_text(proj)
                if text:
                    out.append(f"  [{i}] {text}")

    # ── 3. Work History (full detail) ─────────────────────────────────────────
    raw_work = _as_list(_deep_get(raw_resume, "work_history")) or []
    if raw_work:
        out.append("\n── WORK HISTORY ─────────────────────────────────────────────────")
        for i, role in enumerate(raw_work, 1):
            if isinstance(role, dict):
                company  = _first_text(role.get("company"), role.get("organization")) or ""
                title    = _first_text(role.get("role"), role.get("title")) or ""
                duration = _first_text(role.get("duration"), role.get("period")) or ""
                resps    = _extract_text_items(
                    role.get("responsibilities") or role.get("key_responsibilities")
                    or role.get("achievements") or role.get("highlights")
                )
                label = " | ".join(p for p in [title, company] if p) or f"Role {i}"
                if duration:
                    label = f"{label} ({duration})"
                out.append(f"  [{i}] {label}")
                for r in resps[:5]:   # up to 5 responsibilities
                    out.append(f"       • {r}")
            else:
                text = _first_text(role)
                if text:
                    out.append(f"  [{i}] {text}")

    # ── 4. Internships ────────────────────────────────────────────────────────
    raw_intern = _as_list(_deep_get(raw_resume, "internships") or _deep_get(raw_resume, "internship")) or []
    if raw_intern:
        out.append("\n── INTERNSHIPS ──────────────────────────────────────────────────")
        for i, intern in enumerate(raw_intern, 1):
            if isinstance(intern, dict):
                company  = _first_text(intern.get("company"), intern.get("organization")) or ""
                role_n   = _first_text(intern.get("role"), intern.get("title")) or ""
                duration = _first_text(intern.get("duration"), intern.get("period")) or ""
                desc     = _first_text(intern.get("description"), intern.get("summary")) or ""
                label = " | ".join(p for p in [role_n, company] if p) or f"Internship {i}"
                if duration:
                    label = f"{label} ({duration})"
                out.append(f"  [{i}] {label}")
                if desc:
                    out.append(f"       {desc}")
            else:
                text = _first_text(intern)
                if text:
                    out.append(f"  [{i}] {text}")

    # ── 5. Education ──────────────────────────────────────────────────────────
    if resume_context.education:
        out.append("\n── EDUCATION ────────────────────────────────────────────────────")
        for edu in resume_context.education:
            out.append(f"  • {edu}")

    # ── 6. JD — Must-Have Skills with context ────────────────────────────────
    jd_must_haves = _extract_jd_must_haves(jd_data)
    if jd_must_haves:
        out.append("\n── JD MUST-HAVE SKILLS ──────────────────────────────────────────")
        out.append("  (Probe each — where and how did they actually use it?)")
        for skill in jd_must_haves:
            out.append(f"  • {skill}")

    # Nice-to-haves: medium-priority criteria, or legacy keys
    _all_criteria_nice = _as_list(_deep_get(jd_data, "criteria"))
    _medium_criteria = [c for c in _all_criteria_nice if isinstance(c, dict) and c.get("priority") == "medium"]
    jd_nice = (
        _extract_text_items([c.get("name", "") for c in _medium_criteria if c.get("name")])
        or _extract_text_items(
            _deep_get(jd_data, "skills.nice_to_have")
            or _deep_get(jd_data, "nicetohave")
            or _deep_get(jd_data, "nice_to_have")
        )
    )[:5]
    if jd_nice:
        out.append("\n── JD NICE-TO-HAVE ──────────────────────────────────────────────")
        for s in jd_nice:
            out.append(f"  • {s}")

    # ── 7. Opening Anchor ─────────────────────────────────────────────────────
    out.append("\n── OPENING ANCHOR ───────────────────────────────────────────────")
    out.append(f"  Type   : {safe_anchor_type}")
    out.append(f"  Subject: {safe_anchor}")
    out.append(f"  Start  : Ask what they personally built/owned in this {safe_anchor_type}.")

    # ── 8. Interview Strategy (band-specific) ─────────────────────────────────
    out.append("\n── INTERVIEW STRATEGY ───────────────────────────────────────────")
    out.append(f"  Band [{candidate_band.upper()}]: {band_strategy}")

    # ── 9. Custom Questions ───────────────────────────────────────────────────
    _cqs = [str(q).strip() for q in (custom_questions or []) if str(q).strip()]
    if _cqs:
        out.append("\n── CUSTOM QUESTIONS (MANDATORY — cover ALL before wrap-up) ──────")
        for i, q in enumerate(_cqs, 1):
            out.append(f"  {i}. {q}")
    else:
        out.append("\n── CUSTOM QUESTIONS: none configured ────────────────────────────")

    return "\n".join(out).strip()

