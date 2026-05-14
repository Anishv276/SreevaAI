from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Optional
from resume_context_parser import (
    ResumeContext,
    build_interview_turns,
    ensure_resume_context as _ensure_resume_context,
    parse_resume_context,
)
from agent_utils import (
    _as_list,
    _coerce_jsonish,
    _deep_get,
    _extract_text_items,
    _first_text,
    _format_compact_section,
    _join_items,
)


# -- Band detection -------------------------------------------------------------
def infer_candidate_band(structured_resume_raw: Any, resume_text_block: str) -> str:
    """
    fresher:     < 1.5 years
    mid:         1.5 - 5 years
    experienced: > 5 to 10 years
    senior:      > 10 years
    """
    context = _ensure_resume_context(structured_resume_raw, resume_text_block)
    if context.years_of_experience is not None:
        if context.years_of_experience < 1.5:
            return "fresher"
        if context.years_of_experience > 10:
            return "senior"
        if context.years_of_experience > 5:
            return "experienced"
        return "mid"
    text = context.resume_text.lower()
    has_fresher_terms = context.fresher_signals or any(
        sig in text
        for sig in ("fresher", "entry level", "student", "final year", "internship", "intern", "graduate")
    )
    has_experienced_terms = context.experienced_signals or any(
        sig in text
        for sig in ("senior", "lead", "manager", "head of", "director", "staff engineer", "principal")
    )
    has_real_work_history = bool(context.work_history)
    has_real_projects = bool(context.projects)

    if has_fresher_terms and not has_experienced_terms and not has_real_work_history:
        return "fresher"
    if has_experienced_terms:
        if any(sig in text for sig in ("senior", "staff engineer", "principal", "director", "head of")):
            return "senior"
        return "experienced"
    if has_real_work_history or has_real_projects:
        return "mid"
    return "mid"


# -- Resume brief by band -------------------------------------------------------
def build_resume_brief(band: str, resume_context: "ResumeContext") -> dict:
    """
    Extract only the resume data relevant to the candidate's band.
    Used by stage directives to create band-specific opening questions.
    """
    if band == "fresher":
        if resume_context.projects:
            anchor = resume_context.projects[0]
            anchor_type = "project"
        elif resume_context.education:
            anchor = resume_context.education[0]
            anchor_type = "education"
        elif resume_context.work_history:
            anchor = resume_context.work_history[0]
            anchor_type = "internship"
        else:
            anchor = "your background"
            anchor_type = "background"
        return {
            "band": "fresher",
            "education": resume_context.education[:2],
            "projects": resume_context.projects[:3],
            "internships": resume_context.work_history[:2],
            "skills": resume_context.skills[:5],
            "anchor_item": anchor,
            "anchor_type": anchor_type,
        }
    elif band == "mid":
        anchor = resume_context.work_history[0] if resume_context.work_history else (
            resume_context.projects[0] if resume_context.projects else resume_context.current_role
        )
        return {
            "band": "mid",
            "current_role": resume_context.current_role,
            "years": resume_context.years_label,
            "work_history": resume_context.work_history[:3],
            "projects": resume_context.projects[:2],
            "skills": resume_context.skills[:7],
            "anchor_item": anchor,
            "anchor_type": "role",
        }
    elif band == "experienced":
        anchor = resume_context.projects[0] if resume_context.projects else (
            resume_context.work_history[0] if resume_context.work_history else resume_context.current_role
        )
        return {
            "band": "experienced",
            "current_role": resume_context.current_role,
            "years": resume_context.years_label,
            "work_history": resume_context.work_history[:3],
            "major_projects": resume_context.projects[:2],
            "skills": resume_context.skills[:5],
            "anchor_item": anchor,
            "anchor_type": "project" if resume_context.projects else "role",
        }
    else:  # senior
        anchor = resume_context.projects[0] if resume_context.projects else (
            resume_context.work_history[0] if resume_context.work_history else resume_context.current_role
        )
        return {
            "band": "senior",
            "current_role": resume_context.current_role,
            "years": resume_context.years_label,
            "career_trajectory": resume_context.work_history[:3],
            "flagship_initiatives": resume_context.projects[:2],
            "skills": resume_context.skills[:4],
            "anchor_item": anchor,
            "anchor_type": "initiative" if resume_context.projects else "role",
        }


# -- JD must-haves (from extractedDetails JSON only) ----------------------------
def _extract_jd_must_haves(jd_data: dict[str, Any]) -> list[str]:
    """Extract must-have skills strictly from extractedDetails JSON. No text fallback."""
    must_have_entries = _as_list(_deep_get(jd_data, "skills.must_have"))
    capabilities: list[str] = []
    for item in must_have_entries:
        if isinstance(item, dict):
            skill = _first_text(item.get("skill"))
            why = _first_text(item.get("why_needed"))
            if skill and why:
                capabilities.append(f"{skill} ({why})")
            elif skill:
                capabilities.append(skill)
            elif why:
                capabilities.append(why)
        else:
            text = _first_text(item)
            if text:
                capabilities.append(text)
    if not capabilities:
        requirements = _extract_text_items(_deep_get(jd_data, "requirements"))
        capabilities.extend(requirements)
    return _extract_text_items(capabilities)[:8]




def first_name_from_full_name(full_name: str) -> str:
    if not full_name:
        return ""
    cleaned = " ".join(str(full_name).strip().split())
    if not cleaned:
        return ""
    return cleaned.split(" ", 1)[0]


@dataclass(slots=True)
class CandidateBandContext:
    candidate_band: str
    resume_brief: dict
    coverage_items: list[str]
    merged_brief_block: str = ""
    live_prompt_context: str = ""
    depth_instruction: str = ""
    initial_context_injected: bool = False
    resume_context: Optional["ResumeContext"] = None
    stage_history: list = field(default_factory=list)


def refresh_candidate_band_context(context: CandidateBandContext) -> CandidateBandContext:
    context.live_prompt_context = context.merged_brief_block.strip() or "Not available"
    return context





# -- Interview brief: 2 sources only (resumeData + extractedDetails) ------------
def build_merged_interview_brief(
    *,
    candidate_name: str,
    job_title: str,
    candidate_band: str,
    resume_context: ResumeContext,
    jd_details: Any,
    resume_brief: Optional[dict] = None,
) -> str:
    jd_data = _coerce_jsonish(jd_details)
    jd_must_haves = _extract_jd_must_haves(jd_data)

    anchor_item = ""
    anchor_type = ""
    if isinstance(resume_brief, dict):
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

    band_strategy = {
        "fresher": "Prioritize projects, learning approach, and fundamentals; avoid assuming full-time ownership.",
        "mid": "Prioritize individual ownership, measurable impact, and decision trade-offs.",
        "experienced": "Prioritize end-to-end ownership, architecture depth, and scale constraints.",
        "senior": "Prioritize strategic judgment, cross-team influence, and high-stakes trade-offs.",
    }.get(candidate_band, "Prioritize concrete ownership and role-fit evidence.")

    lines = [
        f"Candidate: {candidate_name or 'Candidate'}",
        f"Role: {job_title or 'Interview Role'}",
        f"Band: {candidate_band}",
        f"Experience: {resume_context.years_label}",
        f"Current role: {resume_context.current_role}",
        f"Top skills: {_join_items(resume_context.skills, 6)}",
        f"Key projects/work: {_join_items(resume_context.projects + resume_context.work_history, 4)}",
        f"JD must-haves: {_join_items(jd_must_haves, 5)}",
        f"First anchor: {anchor_type or 'topic'} - {anchor_item or 'candidate background'}",
        f"Interview strategy: {band_strategy}",
    ]
    return _format_compact_section("INTERVIEW BRIEF", lines).strip()
