"""
models.py v2 — Strict Pydantic contracts for every pipeline stage.

Design choices vs v1:
- Split resume into ResumeStructural (Call 1) + ResumeEvidence (Call 2)
  so each extraction pass has its own schema and validation.
- CriterionResult carries a full match_source trace for explainability.
- EvidenceItem has has_metric + metric validated; evidence_level 5 requires both.
- All Optional fields are explicit; no silent None coercions.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, model_validator


# -- Enums ---------------------------------------------------------------------

class OwnershipLevel(str, Enum):
    owner = "owner"
    contributor = "contributor"
    unclear = "unclear"

class ImpactStrength(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"

class SeniorityLevel(str, Enum):
    intern = "intern"
    junior = "junior"
    mid = "mid"
    senior = "senior"
    lead = "lead"
    manager = "manager"

class EvidenceSource(str, Enum):
    work_history_outcome = "work_history_outcome"
    work_history = "work_history"
    project = "project"
    listed = "listed"
    inferred = "inferred"

class CriterionPriority(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"

class MatchResult(str, Enum):
    meets = "meets"
    partially_meets = "partially_meets"
    unclear = "unclear"
    does_not_meet = "does_not_meet"

class MatchType(str, Enum):
    exact = "exact"
    semantic = "semantic"
    transferable = "transferable"
    text = "text"
    none = "none"


# -- Resume: Pass 1 (structural) -----------------------------------------------

class WorkRoleStructural(BaseModel):
    id: str
    company: str
    role: str
    start_date: Optional[str] = None          # YYYY-MM
    end_date: Optional[str] = None            # YYYY-MM or "Present"
    duration_months: Optional[int] = None
    is_current: bool = False
    technologies_used: list[str] = Field(default_factory=list)
    bullet_points: list[str] = Field(default_factory=list)  # exact text, no paraphrase

class ProjectStructural(BaseModel):
    id: str
    name: Optional[str] = None
    type: str = "personal"
    technologies: list[str] = Field(default_factory=list)
    description: str = ""

class EducationEntry(BaseModel):
    degree: Optional[str] = None
    field: Optional[str] = None
    institution: Optional[str] = None
    year: Optional[int] = None

class ResumeStructural(BaseModel):
    """Output of extraction Call 1 — facts only, no semantic judgment."""
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: dict = Field(default_factory=dict)
    links: dict = Field(default_factory=dict)
    work_history: list[WorkRoleStructural] = Field(default_factory=list)
    projects: list[ProjectStructural] = Field(default_factory=list)
    education: list[EducationEntry] = Field(default_factory=list)
    certifications: list[dict] = Field(default_factory=list)
    skills_section: list[str] = Field(default_factory=list)  # raw listed skills
    parse_confidence: str = "medium"


# -- Resume: Pass 2 (semantic assessment) -------------------------------------

class EvidenceItem(BaseModel):
    id: str
    type: str = "work_history"
    source_ref_id: Optional[str] = None
    source_company: Optional[str] = None
    source_role: Optional[str] = None
    text: str
    proves: list[str] = Field(default_factory=list)  # canonical skill keys
    evidence_level: int = Field(ge=1, le=5)
    ownership: OwnershipLevel = OwnershipLevel.unclear
    has_metric: bool = False
    metric: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.7)

    @model_validator(mode="after")
    def level_5_requires_metric_and_ownership(self) -> "EvidenceItem":
        # Enforce: level 5 requires owner + metric. Downgrade silently if not.
        if self.evidence_level == 5:
            if not self.has_metric or self.ownership != OwnershipLevel.owner:
                object.__setattr__(self, "evidence_level", 4 if self.ownership == OwnershipLevel.owner else 3)
        return self

class WorkRoleAssessment(BaseModel):
    role_id: str
    ownership_level: OwnershipLevel = OwnershipLevel.unclear
    impact_strength: ImpactStrength = ImpactStrength.low
    impact_signals: list[str] = Field(default_factory=list)  # quantified bullets only
    business_domain: Optional[str] = None

class SkillEntry(BaseModel):
    skill: str
    evidence: str = ""
    evidence_level: int = Field(ge=1, le=5, default=1)
    years_of_use: Optional[float] = None
    source_strength: EvidenceSource = EvidenceSource.listed

class ToolEntry(BaseModel):
    tool: str
    category: Optional[str] = None
    evidence: str = ""
    evidence_level: int = Field(ge=1, le=5, default=1)
    source_strength: EvidenceSource = EvidenceSource.listed
    confidence: str = "medium"

class CareerTimeline(BaseModel):
    overlaps: list[dict] = Field(default_factory=list)
    gaps: list[dict] = Field(default_factory=list)
    job_hopping_risk: str = "none"
    progression_pattern: str = "unknown"

class ResumeEvidence(BaseModel):
    """
    Output of extraction Call 2 — semantic assessment layered on Call 1's structure.
    Merged with ResumeStructural to produce the full resume used downstream.
    """
    total_years: Optional[float] = None
    total_months: Optional[int] = None
    seniority_level: Optional[SeniorityLevel] = None
    seniority_reason: str = ""
    role_assessments: list[WorkRoleAssessment] = Field(default_factory=list)
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
    skills: dict = Field(default_factory=dict)          # {technical, tools, domain_skills}
    career_timeline: CareerTimeline = Field(default_factory=CareerTimeline)
    core_claims: list[dict] = Field(default_factory=list)
    uncertain_areas: list[dict] = Field(default_factory=list)
    red_flags: list[dict] = Field(default_factory=list)
    candidate_summary: str = ""


# -- Merged Resume (what the scorer receives) ----------------------------------

class MergedResume(BaseModel):
    """
    Combines structural + evidence passes into the flat dict the scorer expects.
    Also contains cross-validation corrections.
    """
    # Identity
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: dict = Field(default_factory=dict)
    links: dict = Field(default_factory=dict)
    # Experience
    experience: dict = Field(default_factory=dict)       # {total_years, seniority_level, ...}
    # Work history: structural fields + semantic assessments merged per role
    work_history: list[dict] = Field(default_factory=list)
    projects: list[dict] = Field(default_factory=list)
    education: list[dict] = Field(default_factory=list)
    certifications: list[dict] = Field(default_factory=list)
    # Evidence
    evidence_items: list[dict] = Field(default_factory=list)
    skills: dict = Field(default_factory=dict)
    career_timeline: dict = Field(default_factory=dict)
    core_claims: list[dict] = Field(default_factory=list)
    uncertain_areas: list[dict] = Field(default_factory=list)
    red_flags: list[dict] = Field(default_factory=list)
    candidate_summary: str = ""
    keywords: list[str] = Field(default_factory=list)
    # Correction metadata
    _years_corrected: bool = False


# -- JD ------------------------------------------------------------------------

class JDCriterion(BaseModel):
    id: str = ""
    category: str = "skill"
    name: str
    priority: CriterionPriority = CriterionPriority.high
    weight: int = Field(ge=1, le=30, default=10)
    evidence_required: str = "any"
    source_text: str = ""
    is_table_stakes: bool = False   # v2: fundamental for this role title
    inferred: bool = False          # v2: added by enrichment pass, not in original JD

class JDData(BaseModel):
    job_title: str = "Unknown Role"
    role_level: str = "mid"
    experience: dict = Field(default_factory=dict)
    criteria: list[JDCriterion] = Field(default_factory=list)
    scoring_hints: dict = Field(default_factory=dict)
    has_technical_requirements: bool = True
    keywords: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _ensure_hints(cls, v):
        if isinstance(v, dict):
            h = v.get("scoring_hints") or {}
            h.setdefault("green_flags_to_reward", [])
            h.setdefault("red_flags_to_watch", [])
            v["scoring_hints"] = h
        return v

    @property
    def min_years(self) -> Optional[float]:
        return self.experience.get("min_years")

    @property
    def max_years(self) -> Optional[float]:
        return self.experience.get("max_years")


# -- Scoring -------------------------------------------------------------------

class MatchSource(BaseModel):
    """Full trace of how a criterion was matched — powers explainability."""
    match_type: MatchType = MatchType.none
    matched_skill: Optional[str] = None       # resume skill that triggered match
    semantic_similarity: Optional[float] = None
    evidence_item_id: Optional[str] = None    # links to EvidenceItem.id
    evidence_text: Optional[str] = None       # exact resume text
    source_company: Optional[str] = None
    ev_source: EvidenceSource = EvidenceSource.inferred

class CriterionResult(BaseModel):
    criterion: str
    category: str
    priority: CriterionPriority
    weight: int
    result: MatchResult = MatchResult.does_not_meet
    confidence: float = 0.0
    match_source: MatchSource = Field(default_factory=MatchSource)
    # Computed contribution to score (for auditability)
    score_contribution: float = 0.0

class ScoreBreakdown(BaseModel):
    skills_score: int = 0
    skills_max: int = 50
    exp_score: int = 0
    exp_max: int = 15
    good_score: int = 0
    good_max: int = 10
    career_score: int = 0
    career_max: int = 15
    domain_score: int = 0
    domain_max: int = 10

class HumanLayer(BaseModel):
    base_score: int
    human_adjustment: int
    human_score: int
    confidence: int
    judgment: str
    reasons: list[dict] = Field(default_factory=list)
    risk_flags: list[str] = Field(default_factory=list)
    summary: str = ""

class SkillMatching(BaseModel):
    matched_must: list[str] = Field(default_factory=list)
    missing_must: list[str] = Field(default_factory=list)
    partial_must: list[str] = Field(default_factory=list)
    matched_good: list[str] = Field(default_factory=list)
    total_must: int = 0
    match_ratio: int = 0
    must_have_details: list[dict] = Field(default_factory=list)

class ScoreResult(BaseModel):
    score: int
    base_score: int
    human_layer: dict = Field(default_factory=dict)
    status: str
    breakdown: dict = Field(default_factory=dict)
    criteria_results: list[dict] = Field(default_factory=list)
    skill_matching: dict = Field(default_factory=dict)
    top_evidence: list[str] = Field(default_factory=list)
    gaps_to_probe: list[str] = Field(default_factory=list)
    exp_status: str = ""
    hard_rejected: bool = False
    rejection_reasons: list[str] = Field(default_factory=list)
    candidate_years: Optional[float] = None
    jd_min_years: Optional[float] = None
    # v2 additions
    grounding_warnings: list[str] = Field(default_factory=list)
    semantic_matches: list[dict] = Field(default_factory=list)  # which criteria used embedding path
