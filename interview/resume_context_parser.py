from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

from interview.agent_utils import (
    _as_list,
    _coerce_jsonish,
    _deep_get,
    _extract_text_items,
    _first_text,
    _join_items,
    _safe_float,
    build_interview_turns,  # re-exported for backward compat
)

# Re-export so existing call sites (agent_profile_context, recruiter_summary, etc.) don't break
__all__ = [
    "ResumeContext",
    "parse_resume_context",
    "ensure_resume_context",
    "build_interview_turns",
]


@dataclass(slots=True)
class ResumeContext:
    """Normalized resume view used by downstream interview logic."""

    resume_data: dict[str, Any]
    resume_text: str
    years_of_experience: Optional[float]
    years_label: str
    current_role: str
    skills: list[str]
    projects: list[str]
    work_history: list[str]
    internships: list[str]       # actual internship entries (separate from work_history)
    experiences: list[str]
    education: list[str]
    hobbies: list[str]
    ownership_risks: list[str]


@dataclass(slots=True)
class _ResumeContextParser:
    """Break resume parsing into small, named steps for readability."""

    parsed_resume: dict[str, Any]
    resume_text: str

    def build(self) -> ResumeContext:
        years_of_experience = self._extract_years_of_experience()
        years_label = self._format_years_label(years_of_experience)
        current_role = self._extract_current_role_label()
        skills = self._extract_skills()
        projects = self._extract_projects()
        education = self._extract_education()
        hobbies = self._extract_hobbies()
        work_history_raw = self._extract_work_history()
        internships_raw = self._extract_internships()
        # Internships are merged into work_history -- no separate bucket.
        # Dedup by short title so a role that appears in both lists isn't doubled.
        _seen_wh: set[str] = set()
        work_history: list[str] = []
        for entry in work_history_raw + internships_raw:
            _key = entry.split(" - ")[0].strip().lower()
            if _key and _key not in _seen_wh:
                _seen_wh.add(_key)
                work_history.append(entry)
        internships: list[str] = []   # kept for schema compat -- always empty now
        experiences = _extract_text_items(projects + work_history)
        ownership_risks = self._build_ownership_risks()

        return ResumeContext(
            resume_data=self.parsed_resume,
            resume_text=self.resume_text,
            years_of_experience=years_of_experience,
            years_label=years_label,
            current_role=current_role,
            skills=skills,
            projects=projects,
            work_history=work_history,
            internships=internships,
            experiences=experiences,
            education=education,
            hobbies=hobbies,
            ownership_risks=ownership_risks,
        )

    def _extract_years_of_experience(self) -> Optional[float]:
        years = _safe_float(_deep_get(self.parsed_resume, "experience.total_years"))
        if years is None:
            years = _safe_float(_deep_get(self.parsed_resume, "experienceYears"))
        if years is None:
            years = _safe_float(_deep_get(self.parsed_resume, "experience_years"))
        if years is not None:
            return years
        lower = self.resume_text.lower()
        match = re.search(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|year|yrs|yr)\b", lower)
        return _safe_float(match.group(1)) if match else None

    @staticmethod
    def _format_years_label(years: Optional[float]) -> str:
        if years is None:
            return "Not stated"
        if float(years).is_integer():
            return f"{int(years)} years"
        return f"{years:.1f} years"

    def _extract_current_role_label(self) -> str:
        current_role = _first_text(
            _deep_get(self.parsed_resume, "experience.currentRole"),
            _deep_get(self.parsed_resume, "experience.current_role"),
            self.parsed_resume.get("current_role"),
            self.parsed_resume.get("currentRole"),
        )
        current_company = _first_text(
            _deep_get(self.parsed_resume, "experience.currentCompany"),
            _deep_get(self.parsed_resume, "experience.current_company"),
            self.parsed_resume.get("current_company"),
            self.parsed_resume.get("currentCompany"),
        )
        if current_role and current_company:
            return f"{current_role} at {current_company}"
        if current_role:
            return current_role
        if current_company:
            return current_company
        return "Not stated"

    def _extract_skills(self) -> list[str]:
        skills = _extract_text_items(_deep_get(self.parsed_resume, "skills.technical"), ("skill", "name", "value"))
        skills += _extract_text_items(_deep_get(self.parsed_resume, "skills.tools"), ("tool", "name", "value", "skill"))
        skills += _extract_text_items(_deep_get(self.parsed_resume, "skills.domain_skills"), ("skill", "name", "value"))
        skills += _extract_text_items(_deep_get(self.parsed_resume, "keywords"))
        return _extract_text_items(skills)

    def _extract_projects(self) -> list[str]:
        projects: list[str] = []
        for project in _as_list(_deep_get(self.parsed_resume, "projects")):
            if not isinstance(project, dict):
                text = _first_text(project)
                if text:
                    projects.append(text)
                continue
            name = _first_text(project.get("name"), project.get("title"))
            description = _first_text(project.get("description"), project.get("summary"))
            technologies = _extract_text_items(project.get("technologies"), ("skill", "tool", "name", "value"))
            company = _first_text(project.get("company"), project.get("associated_company"), project.get("employer"))
            parts = [name, description]
            compact = " - ".join(part for part in parts if part)
            if technologies:
                compact = f"{compact} [{_join_items(technologies, 3)}]" if compact else _join_items(technologies, 3)
            if compact:
                if company:
                    compact = f"{compact} (at {company})"
                projects.append(compact)
        return projects

    def _extract_education(self) -> list[str]:
        education: list[str] = []
        source_items = (
            _deep_get(self.parsed_resume, "education")
            or _deep_get(self.parsed_resume, "academics")
            or _deep_get(self.parsed_resume, "qualifications")
        )
        for item in _as_list(source_items):
            if isinstance(item, dict):
                school = _first_text(item.get("school"), item.get("institution"), item.get("college"), item.get("university"))
                degree = _first_text(item.get("degree"), item.get("qualification"), item.get("course"), item.get("program"))
                field_name = _first_text(item.get("field"), item.get("branch"), item.get("major"), item.get("specialization"))
                year = _first_text(item.get("year"), item.get("graduation_year"), item.get("passing_year"))
                parts = [degree, field_name, school]
                compact = " - ".join(part for part in parts if part)
                if year:
                    compact = f"{compact} ({year})" if compact else year
                if compact:
                    education.append(compact)
            else:
                text = _first_text(item)
                if text:
                    education.append(text)
        return _extract_text_items(education)

    def _extract_hobbies(self) -> list[str]:
        hobbies: list[str] = []
        source_items = (
            _deep_get(self.parsed_resume, "hobbies")
            or _deep_get(self.parsed_resume, "interests")
            or _deep_get(self.parsed_resume, "extra_activities")
            or _deep_get(self.parsed_resume, "extracurriculars")
            or _deep_get(self.parsed_resume, "activities")
        )
        for item in _as_list(source_items):
            if isinstance(item, dict):
                text = _first_text(item.get("name"), item.get("title"), item.get("activity"), item.get("description"))
            else:
                text = _first_text(item)
            if text:
                hobbies.append(text)
        return _extract_text_items(hobbies)

    def _extract_work_history(self) -> list[str]:
        work_history: list[str] = []
        for role in _as_list(_deep_get(self.parsed_resume, "work_history")):
            if not isinstance(role, dict):
                text = _first_text(role)
                if text:
                    work_history.append(text)
                continue
            company = _first_text(role.get("company"), role.get("organization"))
            role_name = _first_text(role.get("role"), role.get("title"))
            duration = _first_text(role.get("duration"), role.get("period"))
            text = " - ".join(part for part in [role_name, company] if part)
            if duration:
                text = f"{text} ({duration})" if text else duration
            if text:
                work_history.append(text)
        return _extract_text_items(work_history)

    def _extract_internships(self) -> list[str]:
        internships: list[str] = []
        source = (
            _deep_get(self.parsed_resume, "internships")
            or _deep_get(self.parsed_resume, "internship")
        )
        for item in _as_list(source):
            if isinstance(item, dict):
                company  = _first_text(item.get("company"), item.get("organization")) or ""
                role_n   = _first_text(item.get("role"), item.get("title")) or ""
                duration = _first_text(item.get("duration"), item.get("period")) or ""
                desc     = _first_text(item.get("description"), item.get("summary")) or ""
                label = " - ".join(p for p in [role_n, company] if p)
                if duration:
                    label = f"{label} ({duration})" if label else duration
                if desc and label:
                    label = f"{label}: {desc}"
                elif desc:
                    label = desc
                if label:
                    internships.append(label)
            else:
                text = _first_text(item)
                if text:
                    internships.append(text)
        return _extract_text_items(internships)

    def _build_ownership_risks(self) -> list[str]:
        # Only return explicit red flags from the parser -- never auto-generate generic ones.
        # Ownership is probed for every item anyway via the probe strategy.
        return _extract_text_items(
            _deep_get(self.parsed_resume, "red_flags")
            or _deep_get(self.parsed_resume, "ownership_risks")
            or _deep_get(self.parsed_resume, "scoring_hints.red_flags_to_watch")
        )[:3]



def parse_resume_context(resume_data: Any, resume_text: str) -> ResumeContext:
    """Convert raw resume input into a normalized ResumeContext."""
    if isinstance(resume_data, ResumeContext):
        return resume_data
    parsed_resume = _coerce_jsonish(resume_data)
    parser = _ResumeContextParser(parsed_resume=parsed_resume, resume_text=resume_text or "")
    return parser.build()


def ensure_resume_context(resume_data: Any, resume_text: str = "") -> ResumeContext:
    """Safe wrapper used by call sites that accept raw or parsed resume data."""
    if isinstance(resume_data, ResumeContext):
        return resume_data
    return parse_resume_context(resume_data, resume_text)


