from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field, model_validator

logger = logging.getLogger("interview-agent")

class RawSkillEntry(BaseModel):
    """One entry from resume.skills.technical[] or tools[]."""
    skill: str = ""
    tool: str = ""
    category: str = ""
    evidence: str = ""
    source_strength: str = "listed"  # work_history_outcome|work_history|project|listed|inferred
    years_of_use: float | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, v: Any) -> Any:
        if isinstance(v, str):
            return {"skill": v}
        return v

    @property
    def name(self) -> str:
        return (self.skill or self.tool or "").strip()


class RawWorkEntry(BaseModel):
    """One entry from resume.work_history[]."""
    company: str = ""
    role: str = ""
    duration: str = ""
    duration_months: int | None = None   # DB schema sends this instead of duration string
    start_date: str = ""
    end_date: str = ""
    technologies_used: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    impact_signals: list[str] = Field(default_factory=list)
    description: str = ""

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, v: Any) -> Any:
        if isinstance(v, str):
            return {"description": v, "role": v.split(" - ")[0][:60]}
        return v

    @model_validator(mode="after")
    def _resolve_duration(self) -> "RawWorkEntry":
        if not self.duration:
            if self.duration_months is not None:
                self.duration = f"{self.duration_months} months"
            elif self.start_date and self.end_date:
                self.duration = f"{self.start_date} – {self.end_date}"
        return self

    @property
    def title(self) -> str:
        if self.role and self.company:
            return f"{self.role} at {self.company}"
        return self.role or self.company or self.description[:60]

    @property
    def full_description(self) -> str:
        parts: list[str] = []
        if self.description:
            parts.append(self.description)
        parts.extend(self.responsibilities[:4])
        parts.extend(self.impact_signals[:2])
        return " ".join(parts) or self.title


class RawProjectEntry(BaseModel):
    """One entry from resume.projects[]."""
    name: str = ""
    title: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)
    tech_stack: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    impact_signals: list[str] = Field(default_factory=list)  # DB schema field
    duration: str = ""
    impact: str = ""

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, v: Any) -> Any:
        if isinstance(v, str):
            tech = re.findall(r"\[([^\]]+)\]", v)
            tech_list = [t.strip() for chunk in tech for t in chunk.split(",") if t.strip()]
            parts = v.split(" - ", 1)
            return {
                "name": parts[0].strip(),
                "description": parts[1].strip() if len(parts) > 1 else v,
                "technologies": tech_list,
            }
        return v

    @property
    def resolved_title(self) -> str:
        return (self.name or self.title or "Unnamed project").strip()

    @property
    def resolved_tech(self) -> list[str]:
        tech = list(self.technologies or self.tech_stack or [])
        for chunk in re.findall(r"\[([^\]]+)\]", self.description):
            for t in chunk.split(","):
                t = t.strip()
                if t and t not in tech:
                    tech.append(t)
        return tech

    @property
    def full_description(self) -> str:
        parts: list[str] = []
        if self.description:
            parts.append(self.description)
        parts.extend(self.highlights[:3])
        parts.extend(self.impact_signals[:2])
        if self.impact:
            parts.append(self.impact)
        return " ".join(parts) or self.resolved_title


class RawResumeJSON(BaseModel):
    """Top-level resume JSON from DB (resumeData column)."""
    name: str = ""
    experience: dict[str, Any] = Field(default_factory=dict)
    skills: dict[str, Any] | list[Any] = Field(default_factory=dict)
    projects: list[Any] = Field(default_factory=list)
    work_history: list[Any] = Field(default_factory=list)
    education: list[Any] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalise_keys(cls, v: Any) -> Any:
        if not isinstance(v, dict):
            return v
        # Unwrap single-key wrapper like {"resumeData": {...}}
        if len(v) == 1 and "resumeData" in v and isinstance(v["resumeData"], dict):
            v = v["resumeData"]
        # Unwrap {"source": ..., "parsed": {...}} -- DB stores resume as {source, parsed}
        _RESUME_FIELDS = {"work_history", "workHistory", "projects", "skills", "experience", "full_name"}
        if "parsed" in v and isinstance(v["parsed"], dict) and not _RESUME_FIELDS.intersection(v.keys()):
            v = v["parsed"]
        for src, dst in [
            ("full_name", "name"),
            ("fullName", "name"),
            ("workHistory", "work_history"),
            ("work_experience", "work_history"),
            ("workExperience", "work_history"),
            ("jobHistory", "work_history"),
            ("employment", "work_history"),
            ("experience_history", "work_history"),
            ("Projects", "projects"),
            ("project_list", "projects"),
            ("Skills", "skills"),
            ("skill_set", "skills"),
            ("skillSet", "skills"),
        ]:
            if src in v and dst not in v:
                v[dst] = v[src]
        # If work_history is still missing, check inside experience dict
        if "work_history" not in v and isinstance(v.get("experience"), dict):
            exp = v["experience"]
            for src in ("work_history", "workHistory", "roles", "positions", "history"):
                if src in exp and isinstance(exp[src], list):
                    v["work_history"] = exp[src]
                    break
        return v

    def get_technical_skills(self) -> list[RawSkillEntry]:
        s = self.skills
        entries: list[RawSkillEntry] = []
        if isinstance(s, list):
            for item in s:
                try:
                    e = RawSkillEntry.model_validate(item)
                    if e.name:
                        entries.append(e)
                except Exception:
                    pass
            return entries
        if isinstance(s, dict):
            for key in ("technical", "tools", "languages", "frameworks", "domain_skills", "soft", "all"):
                raw_list = s.get(key, [])
                if not isinstance(raw_list, list):
                    continue
                for item in raw_list:
                    try:
                        # domain_skills are plain strings -- RawSkillEntry._normalise handles them
                        e = RawSkillEntry.model_validate(item)
                        if e.name:
                            entries.append(e)
                    except Exception:
                        pass
        return entries

    def get_projects(self) -> list[RawProjectEntry]:
        out: list[RawProjectEntry] = []
        for item in self.projects:
            try:
                out.append(RawProjectEntry.model_validate(item))
            except Exception:
                pass
        return out

    def get_work_history(self) -> list[RawWorkEntry]:
        out: list[RawWorkEntry] = []
        for item in self.work_history:
            try:
                out.append(RawWorkEntry.model_validate(item))
            except Exception:
                pass
        return out

    @model_validator(mode="after")
    def _warn_if_empty(self) -> "RawResumeJSON":
        if not self.work_history and not self.projects and not self.skills:
            logger.warning(
                "[EXTRACT] RawResumeJSON validated but ALL sections empty — "
                "check DB field keys. name=%r experience_keys=%s",
                self.name,
                list(self.experience.keys()) if isinstance(self.experience, dict) else self.experience,
            )
        return self
