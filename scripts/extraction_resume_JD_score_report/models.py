"""
models.py — Pydantic data contracts for the HR agent pipeline.

WHY THIS FILE EXISTS:
    extract_pdf.py passed raw dicts everywhere.  If the LLM returned
    "experience_years" instead of "total_years", the scoring engine silently
    got None and gave wrong scores.

    Pydantic models enforce the schema at the boundary so the scorer always
    receives clean, typed data.

NOTE: Models use model_validate() so they accept the SAME dict format that
      the old extract_pdf.py produced — zero breaking changes.
"""

from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Skill evidence entry (inside resume.skills.technical[])
# ---------------------------------------------------------------------------
class SkillEntry(BaseModel):
    skill: str
    confidence: str = "high"          # "high" | "medium" | "low"
    evidence: str = ""
    source_strength: str = "listed"   # "work_history_outcome" | "work_history" | "project" | "listed" | "inferred"
    years_of_use: Optional[float] = None


# ---------------------------------------------------------------------------
# Work history entry
# ---------------------------------------------------------------------------
class WorkHistoryEntry(BaseModel):
    company: str = ""
    role: str = ""
    duration: str = ""
    technologies_used: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    impact_signals: list[str] = Field(default_factory=list)
    impact_strength: str = ""         # "high" | "medium" | "low"
    ownership_level: str = ""         # "owner" | "contributor" | "unclear"
    business_domain: str = ""


# ---------------------------------------------------------------------------
# Project entry
# ---------------------------------------------------------------------------
class ProjectEntry(BaseModel):
    name: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Evidence item (structured proof extracted by LLM)
# ---------------------------------------------------------------------------
class EvidenceItem(BaseModel):
    text: str = ""
    proves: list[str] = Field(default_factory=list)
    evidence_level: int = 1           # 1-5 (5 = work_history_outcome with metrics)
    confidence: float = 0.7
    ownership: str = "unclear"        # "owner" | "contributor" | "unclear"


# ---------------------------------------------------------------------------
# Resume top-level model
# ---------------------------------------------------------------------------
class ResumeData(BaseModel):
    """
    Validated resume data. Accepts the dict that extract_pdf.py's LLM parser
    produces without modification.
    """
    name: str = ""
    experience: dict[str, Any] = Field(default_factory=dict)
    skills: dict[str, Any] = Field(default_factory=dict)
    projects: list[Any] = Field(default_factory=list)
    work_history: list[Any] = Field(default_factory=list)
    education: list[Any] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    evidence_items: list[Any] = Field(default_factory=list)
    career_timeline: dict[str, Any] = Field(default_factory=dict)
    career_progression: dict[str, Any] = Field(default_factory=dict)
    candidate_summary: str = ""
    core_claims: list[Any] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _coerce_experience(cls, values: Any) -> Any:
        """Accept both 'total_years' and 'experienceYears' as the same field."""
        if isinstance(values, dict):
            exp = values.get("experience", {})
            if isinstance(exp, dict):
                # Normalise alternate key names to total_years
                if "experienceYears" in exp and "total_years" not in exp:
                    exp["total_years"] = exp["experienceYears"]
                if "experience_years" in exp and "total_years" not in exp:
                    exp["total_years"] = exp["experience_years"]
                values["experience"] = exp
        return values

    # Convenience properties used by the scorer
    @property
    def total_years(self) -> Optional[float]:
        return self.experience.get("total_years")

    @property
    def seniority_level(self) -> str:
        return self.experience.get("seniority_level", "")


# ---------------------------------------------------------------------------
# JD criterion entry
# ---------------------------------------------------------------------------
class JDCriterion(BaseModel):
    id: str = ""
    category: str = "skill"           # "skill" | "experience" | "responsibility" | "ownership" | "domain"
    name: str
    priority: str = "high"            # "critical" | "high" | "medium"
    weight: int = 10
    evidence_required: str = "any"    # "any" | "work_history"
    source_text: str = ""


# ---------------------------------------------------------------------------
# JD top-level model
# ---------------------------------------------------------------------------
class JDData(BaseModel):
    """
    Validated job description data. Accepts the dict that extract_pdf.py
    produces for a JD without modification.
    """
    title: str = ""
    role_level: str = ""
    has_technical_requirements: bool = True
    experience: dict[str, Any] = Field(default_factory=dict)
    skills: dict[str, Any] = Field(default_factory=dict)
    criteria: list[Any] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    domain: str = ""
    scoring_hints: dict[str, Any] = Field(default_factory=dict)
    role_context: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _ensure_scoring_hints(cls, values: Any) -> Any:
        if isinstance(values, dict):
            hints = values.get("scoring_hints", {})
            if not isinstance(hints, dict):
                hints = {}
            hints.setdefault("green_flags_to_reward", [])
            hints.setdefault("red_flags_to_watch", [])
            values["scoring_hints"] = hints
        return values

    @property
    def min_years(self) -> Optional[float]:
        return self.experience.get("min_years")

    @property
    def max_years(self) -> Optional[float]:
        return self.experience.get("max_years")


# ---------------------------------------------------------------------------
# Score result (output of ScoringEngine.calculate())
# ---------------------------------------------------------------------------
class ScoreResult(BaseModel):
    """
    The scoring engine's output. Must match the JSON keys that the old
    compute_score() returned so the backend doesn't break.
    """
    score: int
    base_score: int
    human_layer: dict[str, Any] = Field(default_factory=dict)
    status: str                         # "Shortlisted" | "Borderline" | "Rejected"
    breakdown: dict[str, Any] = Field(default_factory=dict)
    criteria_results: list[dict[str, Any]] = Field(default_factory=list)
    skill_matching: dict[str, Any] = Field(default_factory=dict)
    top_evidence: list[Any] = Field(default_factory=list)
    gaps_to_probe: list[str] = Field(default_factory=list)
    exp_status: str = ""
    hard_rejected: bool = False
    rejection_reasons: list[str] = Field(default_factory=list)
    candidate_years: Optional[float] = None
    jd_min_years: Optional[float] = None
