"""
interview/agent_profile_context.py
===================================
Candidate Knowledge Base -- builds the CANDIDATE BRIEF injected into Ishita's system prompt.

Design principles:
  - Every line of the brief must enable a SPECIFIC question, not just describe the candidate.
  - Skills are cross-referenced against JD so AI knows what's claimed vs what's needed.
  - Projects show the verification gap: what's claimed vs what's actually proven.
  - Work history shows scope signals: team size, decisions owned, scale.
  - Band strategy shapes depth/instinct, not question lists.

Tech stack: Pydantic V2, OOP Strategy Pattern, O(1) dict lookups.
"""

from __future__ import annotations

import random
from abc import ABC, abstractmethod
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from interview.resume_context_parser import (
    ResumeContext,
    ensure_resume_context as _ensure_resume_context,
)
from interview.agent_utils import (
    _as_list,
    _coerce_jsonish,
    _deep_get,
    _extract_text_items,
    _first_text,
)


# ---------------------------------------------------------------------------
# Pydantic Model: ResumeBrief
# Minimal -- only what the band strategy needs to pick an anchor and seed coverage.
# The full rendered brief is built by build_merged_interview_brief().
# ---------------------------------------------------------------------------

class ResumeBrief(BaseModel):
    band: str = Field(default="mid")
    anchor_item: str = Field(default="your background")
    anchor_type: str = Field(default="background")
    skills: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    work_history: list[str] = Field(default_factory=list)
    internships: list[str] = Field(default_factory=list)
    current_role: str = Field(default="")
    years_label: str = Field(default="")
    # Experienced/Senior-specific names -- kept for band strategy compat
    major_projects: list[str] = Field(default_factory=list)
    career_trajectory: list[str] = Field(default_factory=list)
    flagship_initiatives: list[str] = Field(default_factory=list)

    @field_validator("anchor_item", "anchor_type", "current_role", "years_label", mode="before")
    @classmethod
    def coerce_str(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator(
        "skills", "education", "projects", "work_history",
        "internships", "major_projects", "career_trajectory",
        "flagship_initiatives",
        mode="before",
    )
    @classmethod
    def coerce_list(cls, v: Any) -> list[str]:
        if not v:
            return []
        if isinstance(v, str):
            return [v.strip()] if v.strip() else []
        if isinstance(v, (list, tuple)):
            return [str(item).strip() for item in v if item and str(item).strip()]
        return []


# ---------------------------------------------------------------------------
# Pydantic Model: CandidateBandContext -- live session state
# ---------------------------------------------------------------------------

class CandidateBandContext(BaseModel):
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
        if not self.live_prompt_context and self.merged_brief_block:
            self.live_prompt_context = self.merged_brief_block.strip()
        return self


# ---------------------------------------------------------------------------
# Band Strategies -- determine anchor and coverage seed per band
# ---------------------------------------------------------------------------

class BandStrategy(ABC):
    @abstractmethod
    def build(self, resume_context: ResumeContext) -> ResumeBrief: ...

    def _resolve_anchor(
        self,
        priority: list[tuple[list, str]],
        fallback: str = "your background",
        fallback_type: str = "background",
    ) -> tuple[str, str]:
        for source_list, anchor_type in priority:
            if source_list:
                # Weighted random from top 3 items so the opening topic varies
                # across sessions with the same resume. Index 0 is most likely (50%)
                # but sessions can open on item 1 (35%) or item 2 (15%).
                candidates = source_list[:min(3, len(source_list))]
                weights = [0.50, 0.35, 0.15][: len(candidates)]
                item = random.choices(candidates, weights=weights, k=1)[0]
                return (str(item).strip() if item else fallback), anchor_type
        return fallback, fallback_type


class FresherBandStrategy(BandStrategy):
    def build(self, resume_context: ResumeContext) -> ResumeBrief:
        anchor_item, anchor_type = self._resolve_anchor(
            priority=[
                (resume_context.projects, "project"),
                (resume_context.internships, "internship"),
                (resume_context.education, "education"),
            ],
        )
        return ResumeBrief(
            band="fresher",
            anchor_item=anchor_item,
            anchor_type=anchor_type,
            education=resume_context.education[:2],
            projects=resume_context.projects[:3],
            internships=resume_context.internships[:2],
            work_history=resume_context.work_history[:2],
            skills=resume_context.skills[:5],
        )


class MidBandStrategy(BandStrategy):
    def build(self, resume_context: ResumeContext) -> ResumeBrief:
        anchor_item, anchor_type = self._resolve_anchor(
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
            work_history=resume_context.work_history[:4],
            major_projects=resume_context.projects[:3],
            skills=resume_context.skills[:6],
        )


class SeniorBandStrategy(BandStrategy):
    def build(self, resume_context: ResumeContext) -> ResumeBrief:
        anchor_item, anchor_type = self._resolve_anchor(
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
            career_trajectory=resume_context.work_history[:4],
            flagship_initiatives=resume_context.projects[:3],
            skills=resume_context.skills[:5],
        )


_BAND_STRATEGY_MAP: dict[str, BandStrategy] = {
    "fresher": FresherBandStrategy(),
    "mid": MidBandStrategy(),
    "experienced": ExperiencedBandStrategy(),
    "senior": SeniorBandStrategy(),
}

# Depth instruction injected into the voice layer -- what Ishita should feel during the session.
_BAND_DEPTH_INSTRUCTIONS: dict[str, str] = {
    "fresher": "Focus on how they think, not just what they've done. Warm, curious, patient.",
    "mid": "Push for individual ownership and real decisions. Probe past 'we'. Warm but rigorous.",
    "experienced": "Expect depth. Vague answers are a red flag. Push for architecture, tradeoffs, real scale.",
    "senior": "Peer-level. Probe strategic judgment, org impact, and high-stakes calls under uncertainty.",
}


# ---------------------------------------------------------------------------
# Public API: infer_candidate_band
# ---------------------------------------------------------------------------

def infer_candidate_band(structured_resume_raw: Any, resume_text_block: str) -> str:
    """
    Band thresholds:
      fresher:     < 1.5 years
      mid:         1.5 - 5 years
      experienced: 5 - 10 years
      senior:      > 10 years
    """
    context = _ensure_resume_context(structured_resume_raw, resume_text_block)

    if context.years_of_experience is not None:
        yoe = context.years_of_experience
        if yoe < 1.5:
            return "fresher"
        if yoe > 10:
            return "senior"
        if yoe > 5:
            return "experienced"
        return "mid"

    text = (context.resume_text or "").lower()

    _FRESHER_SIGNALS = frozenset(
        {"fresher", "entry level", "student", "final year", "internship", "intern", "graduate"}
    )
    _SENIOR_SIGNALS = frozenset(
        {"senior", "staff engineer", "principal", "director", "head of"}
    )
    _EXPERIENCED_SIGNALS = frozenset({"lead", "manager"})

    has_fresher = any(sig in text for sig in _FRESHER_SIGNALS)
    has_senior = any(sig in text for sig in _SENIOR_SIGNALS)
    has_experienced = any(sig in text for sig in _EXPERIENCED_SIGNALS)

    if has_fresher and not has_experienced and not has_senior and not context.work_history:
        return "fresher"
    if has_senior:
        return "senior"
    if has_experienced:
        return "experienced"
    return "mid"


# ---------------------------------------------------------------------------
# Public API: build_resume_brief
# ---------------------------------------------------------------------------

def build_resume_brief(band: str, resume_context: ResumeContext) -> ResumeBrief:
    strategy = _BAND_STRATEGY_MAP.get(band) or _BAND_STRATEGY_MAP["mid"]
    return strategy.build(resume_context)


# ---------------------------------------------------------------------------
# Public API: refresh_candidate_band_context
# ---------------------------------------------------------------------------

def refresh_candidate_band_context(context: CandidateBandContext) -> CandidateBandContext:
    context.live_prompt_context = context.merged_brief_block.strip() or "Not available"
    return context


# ---------------------------------------------------------------------------
# Internal: JD extraction helpers
# ---------------------------------------------------------------------------

def _parse_jd_criteria(jd_data: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    """
    Returns (must_haves, nice_to_haves) as lists of dicts with keys:
      name, category, why (if available).
    Must-haves = critical + high priority. Nice-to-haves = medium priority.
    """
    def _normalise(item: Any) -> Optional[dict]:
        if isinstance(item, dict):
            name = _first_text(item.get("name"), item.get("skill"), item.get("title"))
            if not name:
                return None
            return {
                "name": name,
                "category": item.get("category", "skill"),
                "priority": item.get("priority", "high"),
                "why": _first_text(
                    item.get("why_needed"), item.get("reason"),
                    item.get("description"), item.get("source_text"),
                ),
            }
        text = _first_text(item)
        return {"name": text, "category": "skill", "priority": "high", "why": ""} if text else None

    # Primary: top-level criteria[] (real JD extraction schema)
    raw_criteria = _as_list(_deep_get(jd_data, "criteria"))
    if raw_criteria:
        parsed = [n for n in (_normalise(c) for c in raw_criteria) if n]
        must = [c for c in parsed if c["priority"] in ("critical", "high")]
        nice = [c for c in parsed if c["priority"] == "medium"]
        if must or nice:
            return must[:8], nice[:5]

    # Fallback: skills.* / legacy flat arrays / screeningCriteria-compatible names.
    must_raw = (
        _as_list(_deep_get(jd_data, "skills.must_have"))
        or _as_list(_deep_get(jd_data, "skills.mustHave"))
        or _as_list(jd_data.get("mustHaveSkills"))
    )
    nice_raw = (
        _as_list(_deep_get(jd_data, "skills.nice_to_have"))
        or _as_list(_deep_get(jd_data, "skills.good_to_have"))
        or _as_list(jd_data.get("niceToHaveSkills"))
    )
    must = [n for n in (_normalise(c) for c in must_raw) if n]
    nice = [n for n in (_normalise(c) for c in nice_raw) if n]

    # Last resort: requirements / keywords
    if not must:
        for key in ("requirements", "keywords"):
            items = _extract_text_items(_deep_get(jd_data, key))
            must = [{"name": s, "category": "skill", "priority": "high", "why": ""} for s in items]
            if must:
                break

    return must[:8], nice[:5]


def _cross_reference_skills(
    jd_must: list[dict],
    jd_nice: list[dict],
    resume_skills: list[str],
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Split JD must-haves into:
      claimed  -- candidate listed this skill on resume (verify depth)
      missing  -- candidate does NOT have this skill (probe gap or check relevance)
    Also returns nice_to_haves unchanged.
    """
    skill_text = " ".join(resume_skills).lower()
    claimed, missing = [], []
    for item in jd_must:
        name_lower = item["name"].lower()
        if any(name_lower in s.lower() or s.lower() in name_lower for s in resume_skills) or name_lower in skill_text:
            claimed.append(item)
        else:
            missing.append(item)
    return claimed, missing, jd_nice


# ---------------------------------------------------------------------------
# Internal: project/work rich extraction
# ---------------------------------------------------------------------------

def _render_project(i: int, proj: Any) -> list[str]:
    lines: list[str] = []
    if not isinstance(proj, dict):
        text = _first_text(proj)
        if text:
            lines.append(f"  [{i}] {text}")
        return lines

    name      = _first_text(proj.get("name"), proj.get("title")) or f"Project {i}"
    duration  = _first_text(proj.get("duration"), proj.get("period")) or ""
    desc      = _first_text(proj.get("description"), proj.get("summary")) or ""
    techs     = _extract_text_items(proj.get("technologies"), ("skill", "tool", "name", "value"))
    outcome   = _first_text(proj.get("outcome"), proj.get("impact"), proj.get("result")) or ""
    role_claim = _first_text(proj.get("role"), proj.get("your_role"), proj.get("contribution")) or ""
    team_size = _first_text(proj.get("team_size"), proj.get("team")) or ""

    lines.append(f"  [{i}] {name}" + (f"  ({duration})" if duration else ""))
    if desc:
        lines.append(f"       What   : {desc}")
    if techs:
        lines.append(f"       Tech   : {' | '.join(techs)}")
    if role_claim:
        lines.append(f"       Role   : {role_claim}")
    if team_size:
        lines.append(f"       Team   : {team_size}")
    if outcome:
        lines.append(f"       Impact : {outcome}")
    return lines


def _render_work_role(i: int, role: Any) -> list[str]:
    lines: list[str] = []
    if not isinstance(role, dict):
        text = _first_text(role)
        if text:
            lines.append(f"  [{i}] {text}")
        return lines

    company   = _first_text(role.get("company"), role.get("organization")) or ""
    title     = _first_text(role.get("role"), role.get("title")) or ""
    duration  = _first_text(role.get("duration"), role.get("period")) or ""
    team_size = _first_text(role.get("team_size"), role.get("team")) or ""
    resps     = _extract_text_items(
        role.get("responsibilities") or role.get("key_responsibilities")
        or role.get("achievements") or role.get("highlights")
    )

    label = " | ".join(p for p in [title, company] if p) or f"Role {i}"
    if duration:
        label = f"{label}  ({duration})"
    lines.append(f"  [{i}] {label}")
    if team_size:
        lines.append(f"       Team : {team_size}")
    for r in resps[:4]:
        lines.append(f"       - {r}")
    return lines


def _render_internship(i: int, intern: Any) -> list[str]:
    lines: list[str] = []
    if not isinstance(intern, dict):
        text = _first_text(intern)
        if text:
            lines.append(f"  [{i}] {text}")
        return lines

    company  = _first_text(intern.get("company"), intern.get("organization")) or ""
    role_n   = _first_text(intern.get("role"), intern.get("title")) or ""
    duration = _first_text(intern.get("duration"), intern.get("period")) or ""
    desc     = _first_text(intern.get("description"), intern.get("summary")) or ""

    label = " | ".join(p for p in [role_n, company] if p) or f"Internship {i}"
    if duration:
        label = f"{label}  ({duration})"
    lines.append(f"  [{i}] {label}")
    if desc:
        lines.append(f"       {desc}")
    return lines


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
    Build the CANDIDATE BRIEF injected into Ishita's evaluation layer.

    Every section is designed to enable specific questions, not just describe.
    - Projects: show claimed role + missing impact -> AI knows what to verify.
    - Skills: cross-referenced with JD -> AI knows claimed vs gap.
    - Work history: scope signals (team size, duration, responsibilities).
    - JD cross-reference: claimed skills to verify depth, missing skills to probe gap.
    - Opening anchor: single clearest starting point with a ready-to-ask framing.
    """
    jd_data = _coerce_jsonish(jd_details)
    raw_resume = resume_context.resume_data or {}

    # Resolve anchor
    if isinstance(resume_brief, ResumeBrief):
        anchor_item = resume_brief.anchor_item
        anchor_type = resume_brief.anchor_type
    elif isinstance(resume_brief, dict):
        anchor_item = _first_text(resume_brief.get("anchor_item"))
        anchor_type = _first_text(resume_brief.get("anchor_type"))
    else:
        anchor_item = _first_text(
            resume_context.projects[0] if resume_context.projects else "",
            resume_context.work_history[0] if resume_context.work_history else "",
            resume_context.current_role,
        )
        anchor_type = "project" if resume_context.projects else "role"

    if not anchor_item:
        anchor_item = "candidate background"
    if not anchor_type:
        anchor_type = "topic"

    safe_name  = (candidate_name or "Candidate").strip()
    safe_role  = (job_title or "Interview Role").strip()

    # JD cross-reference
    jd_must, jd_nice = _parse_jd_criteria(jd_data)
    claimed_skills, missing_skills, _ = _cross_reference_skills(
        jd_must, jd_nice, resume_context.skills
    )

    out: list[str] = []

    # -- Header ----------------------------------------------------------------
    out.append("╔══ CANDIDATE BRIEF ═════════════════════════════════════════╗")
    out.append(f"  Candidate : {safe_name}")
    out.append(f"  Role      : {safe_role}")
    out.append(f"  Band      : {candidate_band.upper()}")
    out.append(f"  Experience: {resume_context.years_label or 'Not stated'}")
    out.append(f"  Current   : {resume_context.current_role or 'Not stated'}")
    out.append("╚════════════════════════════════════════════════════════════╝")

    # -- Opening Anchor --------------------------------------------------------
    out.append("\n-- OPENING ANCHOR -------------------------------------------")
    out.append(f"  [{anchor_type.upper()}] {anchor_item}")

    # -- Projects -------------------------------------------------------------
    raw_projects = _as_list(_deep_get(raw_resume, "projects")) or []
    if raw_projects:
        out.append("\n-- PROJECTS -------------------------------------------------")
        for i, proj in enumerate(raw_projects, 1):
            out.extend(_render_project(i, proj))

    # -- Work History ----------------------------------------------------------
    raw_work = _as_list(_deep_get(raw_resume, "work_history")) or []
    if raw_work:
        out.append("\n-- WORK HISTORY ---------------------------------------------")
        for i, role in enumerate(raw_work, 1):
            out.extend(_render_work_role(i, role))

    # -- Internships -----------------------------------------------------------
    raw_intern = _as_list(
        _deep_get(raw_resume, "internships") or _deep_get(raw_resume, "internship")
    ) or []
    if raw_intern:
        out.append("\n-- INTERNSHIPS ----------------------------------------------")
        for i, intern in enumerate(raw_intern, 1):
            out.extend(_render_internship(i, intern))

    # -- Education -------------------------------------------------------------
    if resume_context.education:
        out.append("\n-- EDUCATION ------------------------------------------------")
        for edu in resume_context.education:
            out.append(f"  - {edu}")

    # -- Skills ----------------------------------------------------------------
    out.append("\n-- SKILLS ---------------------------------------------------")
    if claimed_skills:
        out.append("  Claimed  : " + " | ".join(item["name"] for item in claimed_skills))
    if missing_skills:
        out.append("  Missing  : " + " | ".join(item["name"] for item in missing_skills))
    if not claimed_skills and not missing_skills and resume_context.skills:
        out.append("  Skills   : " + " | ".join(resume_context.skills))
    if jd_nice:
        out.append("  Nice-to-have: " + " | ".join(item["name"] for item in jd_nice))

    # -- Custom Questions -------------------------------------------------------
    cqs = [str(q).strip() for q in (custom_questions or []) if str(q).strip()]
    if cqs:
        out.append("\n-- CUSTOM QUESTIONS (ask ALL before wrap-up) ----------------")
        for i, q in enumerate(cqs, 1):
            out.append(f"  {i}. {q}")

    return "\n".join(out).strip()
