"""
interview/brief_extraction.py
==============================
Deterministic extraction pipeline. Pure Python, zero LLM.

Architecture:
  - Pydantic models  : typed contracts for raw resume + JD JSON from DB
  - OOP extractors   : ResumeExtractor, JDExtractor — single responsibility
  - LangGraph        : parallel fan-out (extract_resume + extract_jd simultaneously)
                       → build_llm_input (formats everything as a clean text block)

No merge node. No dedup. No sorting. We pass everything we extracted — raw and
labelled — to the LLM and let it reason about duplicates, coverage, and ordering.

Flow:
  resume_json + jd_data
        │
        ├─ [Node] extract_resume  ──┐  parallel
        ├─ [Node] extract_jd      ──┤  parallel
        │                           ▼
        └──────── [Node] build_llm_input
                       │
                  llm_input_block  (~800 token text, sent to GPT)
"""
from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field, model_validator
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# Pydantic input models -- validate raw DB JSON at the boundary
# ---------------------------------------------------------------------------

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


class RawJDCriterion(BaseModel):
    """One criterion from jd_data.criteria[]."""
    id: str = ""
    name: str = ""
    priority: str = "high"   # critical|high|medium
    description: str = ""
    category: str = "skill"

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, v: Any) -> Any:
        if isinstance(v, str):
            return {"name": v, "priority": "high"}
        if isinstance(v, dict):
            # DB schema uses source_text instead of description
            if not v.get("description") and v.get("source_text"):
                v = {**v, "description": v["source_text"]}
            # DB schema uses weight field -- map to priority if priority missing
            if not v.get("priority") and v.get("weight") is not None:
                weight = float(v["weight"])
                v = {**v, "priority": "high" if weight >= 15 else "medium"}
        return v

    @property
    def is_must_have(self) -> bool:
        return self.priority in ("critical", "high", "must", "must_have", "required")


class RawJDJSON(BaseModel):
    """Top-level JD JSON from DB (extractedDetails column)."""
    title: str = ""
    criteria: list[Any] = Field(default_factory=list)
    skills: dict[str, Any] = Field(default_factory=dict)
    requirements: list[Any] = Field(default_factory=list)
    responsibilities: list[Any] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalise_keys(cls, v: Any) -> Any:
        if not isinstance(v, dict):
            return v
        for src in ("mustHaveSkills", "must_have_skills"):
            if src in v and "skills" not in v:
                v["skills"] = {"must_have": v.pop(src)}
        return v

    def get_criteria(self) -> list[RawJDCriterion]:
        out: list[RawJDCriterion] = []
        if self.criteria:
            for item in self.criteria:
                try:
                    out.append(RawJDCriterion.model_validate(item))
                except Exception:
                    pass
            return out
        for key, priority in [
            ("must_have", "high"), ("mustHave", "high"),
            ("nice_to_have", "medium"), ("good_to_have", "medium"),
            ("niceToHaveSkills", "medium"),
        ]:
            for item in self.skills.get(key, []):
                try:
                    c = RawJDCriterion.model_validate(item)
                    c.priority = priority
                    out.append(c)
                except Exception:
                    pass
        return out

    def get_requirements(self) -> list[str]:
        out: list[str] = []
        for item in (self.requirements + self.responsibilities):
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
            elif isinstance(item, dict):
                for key in ("text", "description", "requirement"):
                    if isinstance(item.get(key), str) and item[key].strip():
                        out.append(item[key].strip())
                        break
        return out


# ---------------------------------------------------------------------------
# Clean extracted models -- outputs of extractors
# ---------------------------------------------------------------------------

class ExtractedProject(BaseModel):
    title: str
    description: str
    tech: list[str] = Field(default_factory=list)
    duration: str = ""
    impact: str = ""


class ExtractedWork(BaseModel):
    title: str
    description: str
    duration: str = ""
    tech: list[str] = Field(default_factory=list)


class ExtractedSkill(BaseModel):
    name: str
    source_strength: str = "listed"
    context: str = ""


class ExtractedJDItem(BaseModel):
    name: str
    description: str = ""
    is_must_have: bool = True


# ---------------------------------------------------------------------------
# OOP Extractors -- single responsibility
# ---------------------------------------------------------------------------

class ResumeExtractor:
    """Extracts projects, work history, and skills from RawResumeJSON."""

    def extract(self, raw: RawResumeJSON) -> tuple[
        list[ExtractedProject], list[ExtractedWork], list[ExtractedSkill]
    ]:
        return (
            self._projects(raw.get_projects()),
            self._work(raw.get_work_history()),
            self._skills(raw.get_technical_skills()),
        )

    def _projects(self, entries: list[RawProjectEntry]) -> list[ExtractedProject]:
        return [
            ExtractedProject(
                title=e.resolved_title,
                description=e.full_description,
                tech=e.resolved_tech,
                duration=e.duration,
                impact=e.impact,
            )
            for e in entries if e.resolved_title
        ]

    def _work(self, entries: list[RawWorkEntry]) -> list[ExtractedWork]:
        return [
            ExtractedWork(
                title=e.title,
                description=e.full_description,
                duration=e.duration,
                tech=e.technologies_used,
            )
            for e in entries if e.title
        ]

    def _skills(self, entries: list[RawSkillEntry]) -> list[ExtractedSkill]:
        return [
            ExtractedSkill(
                name=e.name,
                source_strength=e.source_strength,
                context=e.evidence or "",
            )
            for e in entries if e.name
        ]


class JDExtractor:
    """Extracts criteria and requirements from RawJDJSON."""

    def extract(self, raw: RawJDJSON) -> tuple[
        list[ExtractedJDItem], list[ExtractedJDItem], list[str]
    ]:
        criteria = raw.get_criteria()
        must = [
            ExtractedJDItem(name=c.name, description=c.description, is_must_have=True)
            for c in criteria if c.is_must_have and c.name
        ]
        nice = [
            ExtractedJDItem(name=c.name, description=c.description, is_must_have=False)
            for c in criteria if not c.is_must_have and c.name
        ]
        return must, nice, raw.get_requirements()


# ---------------------------------------------------------------------------
# LangGraph state
# ---------------------------------------------------------------------------

class BriefExtractionState(TypedDict):
    resume_json: dict
    jd_data: dict
    candidate_name: str
    job_title: str
    band: str
    custom_questions: list[str]
    # per-extractor outputs
    projects: list[ExtractedProject]
    work_history: list[ExtractedWork]
    resume_skills: list[ExtractedSkill]
    jd_must: list[ExtractedJDItem]
    jd_nice: list[ExtractedJDItem]
    jd_requirements: list[str]
    # final output
    llm_input_block: str


# ---------------------------------------------------------------------------
# LangGraph nodes
# ---------------------------------------------------------------------------

def _node_extract_resume(state: BriefExtractionState) -> dict:
    resume_json = state["resume_json"]
    top_keys = list(resume_json.keys()) if isinstance(resume_json, dict) else type(resume_json).__name__
    logger.info("[EXTRACT] resume_json top-level keys: %s", top_keys)
    raw = RawResumeJSON.model_validate(resume_json)
    logger.info(
        "[EXTRACT] resume parsed → work_history_raw=%d projects_raw=%d",
        len(raw.work_history), len(raw.projects),
    )
    projects, work, skills = ResumeExtractor().extract(raw)
    logger.info(
        "[EXTRACT] resume → projects=%d work=%d skills=%d",
        len(projects), len(work), len(skills),
    )
    if not projects and not work and not skills:
        logger.warning(
            "[EXTRACT] resume extracted NOTHING — skills type=%s, work_history=%r, projects=%r",
            type(raw.skills).__name__, raw.work_history[:1], raw.projects[:1],
        )
    return {"projects": projects, "work_history": work, "resume_skills": skills}


def _node_extract_jd(state: BriefExtractionState) -> dict:
    raw = RawJDJSON.model_validate(state["jd_data"])
    must, nice, reqs = JDExtractor().extract(raw)
    logger.info(
        "[EXTRACT] jd → must=%d nice=%d requirements=%d",
        len(must), len(nice), len(reqs),
    )
    return {"jd_must": must, "jd_nice": nice, "jd_requirements": reqs}


def _node_build_llm_input(state: BriefExtractionState) -> dict:
    """
    Formats all extracted data into a clean labelled text block.
    Everything is passed as-is — no dedup, no filtering, no sorting.
    The LLM receives the raw truth and decides what to do with it.
    """
    lines: list[str] = []
    has_resume = bool(state["projects"] or state["work_history"] or state["resume_skills"])
    lines.append(
        f"CANDIDATE: {state['candidate_name']}  |  "
        f"ROLE: {state['job_title']}  |  "
        f"BAND: {state['band'].upper()}  |  "
        f"RESUME: {'AVAILABLE' if has_resume else 'NOT AVAILABLE'}"
    )
    if not has_resume:
        lines.append(
            "⚠ RESUME DATA MISSING: Do NOT invent or assume any projects, work history, or skills "
            "for this candidate. topic_pool must contain ONLY JD_TOPICs (from JD must-haves) and "
            "ROLE_TOPICs (from your expert domain knowledge). No RESUME_TOPICs allowed. "
            "anchor_topic must be a JD_TOPIC or ROLE_TOPIC."
        )
    lines.append("")

    # --- Resume projects ---
    projects = state["projects"]
    if projects:
        lines.append("=== RESUME PROJECTS ===")
        for p in projects:
            lines.append(f"• {p.title}")
            if p.description and p.description != p.title:
                lines.append(f"  Description: {p.description}")
            if p.tech:
                lines.append(f"  Tech: {', '.join(p.tech)}")
            if p.duration:
                lines.append(f"  Duration: {p.duration}")
            if p.impact:
                lines.append(f"  Impact: {p.impact}")
        lines.append("")

    # --- Work history ---
    work = state["work_history"]
    if work:
        lines.append("=== WORK HISTORY ===")
        for w in work:
            lines.append(f"• {w.title}" + (f"  ({w.duration})" if w.duration else ""))
            if w.description and w.description != w.title:
                lines.append(f"  Description: {w.description}")
            if w.tech:
                lines.append(f"  Tech used: {', '.join(w.tech)}")
        lines.append("")

    # --- Resume skills (raw, as extracted -- LLM handles overlap with JD) ---
    skills = state["resume_skills"]
    if skills:
        lines.append("=== RESUME SKILLS ===")
        for s in skills:
            entry = f"• {s.name}  [{s.source_strength}]"
            if s.context:
                entry += f"  — {s.context}"
            lines.append(entry)
        lines.append("")

    # --- JD must-haves ---
    jd_must = state["jd_must"]
    if jd_must:
        lines.append("=== JD MUST-HAVE SKILLS & CRITERIA ===")
        for j in jd_must:
            entry = f"• {j.name}"
            if j.description:
                entry += f"  — {j.description}"
            lines.append(entry)
        lines.append("")

    # --- JD nice-to-haves ---
    jd_nice = state["jd_nice"]
    if jd_nice:
        lines.append("=== JD NICE-TO-HAVE ===")
        for j in jd_nice:
            entry = f"• {j.name}"
            if j.description:
                entry += f"  — {j.description}"
            lines.append(entry)
        lines.append("")

    # --- JD free-text requirements (each becomes a probe-able topic) ---
    jd_reqs = state["jd_requirements"]
    if jd_reqs:
        lines.append("=== JD REQUIREMENTS / RESPONSIBILITIES ===")
        lines.append("(Each of these must appear as a topic or be covered by an existing topic)")
        for r in jd_reqs:
            lines.append(f"• {r}")
        lines.append("")

    # --- Custom questions ---
    custom = state.get("custom_questions") or []
    if custom:
        lines.append("=== CLIENT CUSTOM QUESTIONS (must appear in topic_pool) ===")
        for i, q in enumerate(custom, 1):
            lines.append(f"{i}. {q}")
        lines.append("")

    block = "\n".join(lines)
    logger.info("[EXTRACT] llm_input_block built | %d chars", len(block))
    return {"llm_input_block": block}


# ---------------------------------------------------------------------------
# Graph -- parallel extract → build_llm_input (no merge node)
# ---------------------------------------------------------------------------

def _build_graph() -> Any:
    g = StateGraph(BriefExtractionState)
    g.add_node("extract_resume", _node_extract_resume)
    g.add_node("extract_jd", _node_extract_jd)
    g.add_node("build_llm_input", _node_build_llm_input)

    g.add_edge(START, "extract_resume")   # parallel fan-out
    g.add_edge(START, "extract_jd")       # parallel fan-out
    g.add_edge("extract_resume", "build_llm_input")  # fan-in: both feed build_llm_input
    g.add_edge("extract_jd", "build_llm_input")
    g.add_edge("build_llm_input", END)

    return g.compile()


_EXTRACTION_GRAPH = _build_graph()


async def run_extraction(
    *,
    resume_json: dict,
    jd_data: dict,
    candidate_name: str,
    job_title: str,
    band: str,
    custom_questions: list[str],
) -> str:
    """
    Runs the extraction graph. Returns llm_input_block — the clean text
    block to pass directly to the LLM for InterviewBrief generation.
    """
    initial: BriefExtractionState = {
        "resume_json": resume_json,
        "jd_data": jd_data,
        "candidate_name": candidate_name,
        "job_title": job_title,
        "band": band,
        "custom_questions": custom_questions or [],
        "projects": [],
        "work_history": [],
        "resume_skills": [],
        "jd_must": [],
        "jd_nice": [],
        "jd_requirements": [],
        "llm_input_block": "",
    }
    result = await _EXTRACTION_GRAPH.ainvoke(initial)
    return result["llm_input_block"]
