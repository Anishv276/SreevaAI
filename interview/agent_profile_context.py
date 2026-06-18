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
import logging
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
logger = logging.getLogger("interview-agent")
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
# Fallback-only: used when LLM brief generation fails.
# Produces a compact structured brief — NOT a data dump.
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
    """Compact structured fallback brief. Used only when LLM brief generation fails."""
    jd_data = _coerce_jsonish(jd_details)
    raw_resume = resume_context.resume_data or {}
    if isinstance(resume_brief, ResumeBrief):
        anchor_item = resume_brief.anchor_item
        anchor_type = resume_brief.anchor_type
    else:
        anchor_item = resume_context.projects[0] if resume_context.projects else resume_context.current_role or "background"
        anchor_type = "project" if resume_context.projects else "role"
    jd_must, jd_nice = _parse_jd_criteria(jd_data)
    _, missing_skills, _ = _cross_reference_skills(jd_must, jd_nice, resume_context.skills)
    raw_projects = _as_list(_deep_get(raw_resume, "projects")) or []
    raw_work = _as_list(_deep_get(raw_resume, "work_history")) or []
    out: list[str] = []
    out.append(f"CANDIDATE: {candidate_name} | ROLE: {job_title} | BAND: {candidate_band.upper()}")
    out.append(f"OPEN ON: {anchor_item} (type: {anchor_type})")
    out.append("")
    if raw_projects:
        out.append("PROJECTS:")
        for p in raw_projects[:4]:
            if isinstance(p, dict):
                name = _first_text(p.get("name"), p.get("title")) or "?"
                desc = _first_text(p.get("description"), p.get("summary")) or ""
                techs = ", ".join(_extract_text_items(p.get("technologies"), ("skill", "tool", "name"))[:5])
                ownership = p.get("ownership_level", "")
                out.append(f"  - {name} | ownership={ownership} | tech: {techs or 'not listed'}")
                if desc:
                    out.append(f"    {desc[:150]}")
    if raw_work:
        out.append("WORK HISTORY:")
        for r in raw_work[:3]:
            if isinstance(r, dict):
                role = _first_text(r.get("role"), r.get("title")) or "?"
                company = _first_text(r.get("company"), r.get("organization")) or "?"
                techs = ", ".join((r.get("technologies_used") or [])[:4])
                ownership = r.get("ownership_level", "")
                out.append(f"  - {role} @ {company} | ownership={ownership} | tech: {techs or 'not listed'}")
    if resume_context.skills:
        out.append(f"SKILLS ON RESUME: {' | '.join(resume_context.skills[:8])}")
    if missing_skills:
        out.append(f"JD GAPS (not on resume): {' | '.join(s['name'] for s in missing_skills[:4])}")
    out.append("")
    out.append("GROUNDING RULE: Ground a skill in the role/project where it was actually used.")
    out.append("  WRONG: 'You mentioned Python on your resume.'")
    out.append("  RIGHT: 'You worked as Python Developer at Seneca Global -- what did you build there?'")
    out.append("  ATTRIBUTION: only name a company when the skill/project is truly tied to that employer.")
    out.append("  A standalone/personal project is NOT linked to any company -- never say '...at <Company>' about it.")
    cqs = [str(q).strip() for q in (custom_questions or []) if str(q).strip()]
    if cqs:
        out.append("")
        out.append("CUSTOM QUESTIONS (ask ALL before wrap-up):")
        for i, q in enumerate(cqs, 1):
            out.append(f"  {i}. {q}")
    return "\n".join(out).strip()
# ---------------------------------------------------------------------------
# LLM Brief Generator -- replaces the rule-based brief with an analyst read.
# Called once during session startup (parallel with other init).
# Returns a ~300-word narrative the agent uses as its formed opinion of the
# candidate -- drives all question quality downstream.
# ---------------------------------------------------------------------------
_LLM_BRIEF_SYSTEM = """You are a senior talent analyst preparing a pre-interview briefing for an AI interviewer named Ishita.
Ishita interviews candidates across 4 experience bands. Each band changes WHAT she probes and HOW deep she goes:
FRESHER (< 1.5 years):
  - Goal: understand HOW they think, not just what they've done.
  - Probe: did they understand WHY they built what they built? Can they explain one decision?
  - Accept: incomplete answers, limited scope, tutorial-based projects. Note gaps, don't dwell.
  - Red flag: can't explain ANY decision in their own projects at all.
  - Question style: warm, surface-level ownership first. "What did you build? What was your role?"
MID (1.5–5 years):
  - Goal: real individual ownership and real decisions.
  - Probe: push past "we" language. What was specifically theirs? What broke? What would they redo?
  - Red flag: everything is "we", no personal ownership anywhere.
  - Question style: direct. "What was specifically yours?" Push if vague.
EXPERIENCED (5–10 years):
  - Goal: end-to-end ownership, architecture decisions, real tradeoffs with consequences.
  - Probe: if an answer is too clean, ask what went wrong. Expect numbers and scale.
  - Red flag: vague answers, no tradeoffs, no consequences — probe harder, don't move on.
  - Question style: rigorous. Challenge decisions directly.
SENIOR (10+ years):
  - Goal: strategic judgment, org impact, high-stakes calls.
  - Probe: how they influenced others, what they built that outlasted them, hard calls alone.
  - Red flag: polished but shallow — press on what actually went wrong.
  - Question style: peer-level. No hand-holding. Challenge reasoning directly.
YOUR JOB: Read the resume JSON and JD criteria, then write a CONCISE ANALYST BRIEF using EXACTLY these five sections in this order:
ANALYST READ: (2-3 sentences. Overall impression, biggest question about this candidate.)
WORK HISTORY SIGNALS: (bullet per role. Flag ownership level, duration concern, relevance.)
SKILL REALITY: (bullet per skill. Proven/listed-only/needs-probing. Name the source project/role.)
JD FIT: (2-3 sentences. What matches, what is missing, what is uncertain.)
UNCERTAIN AREAS (MUST PROBE): (3 bullets max. The exact things Ishita must validate.)
OPENING ANGLE: (MANDATORY — this is the most important section.)
  - State which project or role to open on. Not "the strongest project" — name it.
  - State the EXACT first question. BAND RULES:
      FRESHER: surface-level first. Ask what they built and what their specific role was. Do NOT open with depth, decisions, or tradeoffs.
        Good example: "Open on Multi Channel Lead Qualification System. First question: what exactly did you build in this project and what was your role in it?"
        Bad example: "First question: how exactly did you build the qualification logic — what was your specific role — and what key decision did you make?" (compound, too deep)
      MID: ask what they personally owned and what specific decisions were theirs.
        Good example: "Open on [Project]. First question: what did you personally own end-to-end in this, and what was the hardest decision you made?"
        Wait — that is still compound. ONE question only: "Open on [Project]. First question: what specifically did you own in this project?"
      EXPERIENCED/SENIOR: go straight to a key decision or tradeoff.
        Good example: "Open on [Project]. First question: what was the hardest architectural call you made and why?"
  - CRITICAL: ONE question mark only. No "and", no "—" chaining multiple questions, no compound structure. ONE sentence, ONE question mark, done.
  - WRONG: "how exactly did you build X — what was your specific role, and can you explain one key decision?"
  - RIGHT: "what exactly did you build in this project and what was your specific role?"  (single focus, one question mark)
RULES:
- Use the section headers exactly as shown above.
- Be specific: name the project, the tool, the concrete detail. Never say "a project" or "certain tools."
- ATTRIBUTION: only name a COMPANY for a project when the project is explicitly linked to that
  employer (tagged "[built at: <company>]"). Projects tagged "[STANDALONE ...]" are personal --
  NEVER attach a company/employer to them and NEVER say "...at <Company>" about them.
- Never hallucinate facts not in the resume JSON.
- OPENING ANGLE must have a concrete first question — not "probe why tools were chosen."
- OPENING ANGLE first question must be ONE sentence with ONE question mark. No compound questions.
- Tone: experienced recruiter briefing a colleague before a call. Direct, analytical, opinionated.
- The band shapes your read — a thin answer from a fresher is expected; same answer from a senior is a red flag.
- Max 500 words total. Every word must earn its place."""
def _build_llm_brief_prompt(
    *,
    candidate_name: str,
    job_title: str,
    band: str,
    resume_json: dict,
    jd_json: dict,
    anchor_item: str,
    anchor_type: str,
) -> str:
    """Build the user-turn prompt for the LLM brief call."""
    # Pull the richest fields from resume_json directly -- these have evidence levels,
    # ownership signals, uncertain_areas, red_flags, core_claims that the rule-based
    # brief ignores entirely.
    work_history = resume_json.get("work_history", [])
    projects = resume_json.get("projects", [])
    skills_technical = (resume_json.get("skills") or {}).get("technical", [])
    skills_tools = (resume_json.get("skills") or {}).get("tools", [])
    skills_domain = (resume_json.get("skills") or {}).get("domain_skills", [])
    core_claims = resume_json.get("core_claims", [])
    uncertain_areas = resume_json.get("uncertain_areas", [])
    red_flags = resume_json.get("red_flags", [])
    career_progression = resume_json.get("career_progression", {})
    candidate_summary = resume_json.get("candidate_summary", "")
    # JD: pull criteria with priorities and weights
    jd_criteria = jd_json.get("criteria", [])
    jd_critical = [c for c in jd_criteria if c.get("priority") == "critical"]
    jd_high = [c for c in jd_criteria if c.get("priority") == "high"]
    jd_medium = [c for c in jd_criteria if c.get("priority") == "medium"]
    jd_green_flags = (jd_json.get("scoring_hints") or {}).get("green_flags_to_reward", [])
    jd_red_flags = (jd_json.get("scoring_hints") or {}).get("red_flags_to_watch", [])
    def _fmt_list(items: list, key: str = "name", limit: int = 8) -> str:
        return ", ".join(str(i.get(key, i) if isinstance(i, dict) else i) for i in items[:limit])
    def _fmt_work(roles: list) -> str:
        lines = []
        for r in roles[:4]:
            if not isinstance(r, dict):
                continue
            company = r.get("company", "")
            role = r.get("role", "")
            duration = r.get("duration_months", "")
            ownership = r.get("ownership_level", "")
            impact = r.get("impact_strength", "")
            techs = ", ".join(r.get("technologies_used", [])[:5])
            resps = "; ".join(r.get("responsibilities", [])[:3])
            lines.append(
                f"  - {role} @ {company} ({duration}mo) | ownership={ownership} impact={impact}\n"
                f"    tech: {techs or 'not listed'}\n"
                f"    responsibilities: {resps or 'not listed'}"
            )
        return "\n".join(lines)
    def _fmt_projects(projs: list) -> str:
        lines = []
        for p in projs[:4]:
            if not isinstance(p, dict):
                continue
            name = p.get("name", "")
            desc = p.get("description", "")
            techs = ", ".join(p.get("technologies", [])[:6])
            ownership = p.get("ownership_level", "")
            impact = p.get("impact_strength", "")
            company = p.get("company", "") or p.get("associated_company", "")
            company_tag = f"[built at: {company}]" if company else "[STANDALONE -- NOT linked to any employer above; do NOT attribute to a company unless candidate confirms in conversation]"
            lines.append(
                f"  - {name} | ownership={ownership} impact={impact} {company_tag}\n"
                f"    tech: {techs or 'not listed'}\n"
                f"    desc: {desc[:200] if desc else 'not listed'}"
            )
        return "\n".join(lines)
    def _fmt_skills(technical: list, tools: list, domain: list) -> str:
        tech_lines = []
        for s in technical[:6]:
            if isinstance(s, dict):
                tech_lines.append(
                    f"  {s.get('skill','?')}: evidence_level={s.get('evidence_level','?')} "
                    f"source={s.get('source_strength','?')} -- {s.get('evidence','')[:120]}"
                )
        tool_lines = []
        for t in tools[:8]:
            if isinstance(t, dict):
                tool_lines.append(
                    f"  {t.get('tool','?')} ({t.get('category','?')}): "
                    f"evidence_level={t.get('evidence_level','?')} "
                    f"confidence={t.get('confidence','?')} -- {t.get('evidence','')[:100]}"
                )
        domain_str = ", ".join(str(d) for d in domain[:6])
        return (
            "Technical:\n" + "\n".join(tech_lines) + "\n"
            "Tools:\n" + "\n".join(tool_lines) + "\n"
            f"Domain: {domain_str}"
        )
    def _fmt_claims(claims: list) -> str:
        return "\n".join(
            f"  - \"{c.get('claim','')}\" [confidence={c.get('confidence','')}]"
            for c in claims[:5] if isinstance(c, dict)
        )
    def _fmt_uncertain(areas: list) -> str:
        return "\n".join(
            f"  - {a.get('area','')}: {a.get('reason','')} | probe: {a.get('probe_question','')}"
            for a in areas[:4] if isinstance(a, dict)
        )
    def _fmt_red_flags(flags: list) -> str:
        return "\n".join(
            f"  - [{f.get('severity','').upper()}] {f.get('flag','')}: {f.get('detail','')}"
            for f in flags[:4] if isinstance(f, dict)
        )
    def _fmt_jd_criteria(criteria: list) -> str:
        return "\n".join(
            f"  - {c.get('name','')} [priority={c.get('priority','')} weight={c.get('weight','')}]"
            for c in criteria[:6] if isinstance(c, dict)
        )
    prompt = f"""CANDIDATE: {candidate_name}
ROLE: {job_title}
BAND: {band.upper()} (fresher=<1.5yr, mid=1.5-5yr, experienced=5-10yr, senior=10yr+)
OPENING ANCHOR: {anchor_item} (type: {anchor_type})
  ^ This is the first topic Ishita will open on. Your brief must tell her exactly what angle to take.
=== RESUME DATA ===
WORK HISTORY:
{_fmt_work(work_history) or "  (none)"}
PROJECTS:
{_fmt_projects(projects) or "  (none)"}
SKILLS (with evidence levels -- 1=listed only, 2=project, 3=work_history, 4=wh+outcome, 5=wh+outcome+specific):
{_fmt_skills(skills_technical, skills_tools, skills_domain)}
CORE CLAIMS (what the parser says the candidate is asserting):
{_fmt_claims(core_claims) or "  (none)"}
UNCERTAIN AREAS (what the parser flagged as needing validation):
{_fmt_uncertain(uncertain_areas) or "  (none)"}
RED FLAGS:
{_fmt_red_flags(red_flags) or "  (none)"}
CAREER PROGRESSION:
{career_progression.get('analysis','') if isinstance(career_progression, dict) else str(career_progression)[:300]}
PARSER SUMMARY: {candidate_summary[:300]}
=== JD CRITERIA ===
CRITICAL (must have):
{_fmt_jd_criteria(jd_critical) or "  (none)"}
HIGH PRIORITY:
{_fmt_jd_criteria(jd_high) or "  (none)"}
MEDIUM (nice to have):
{_fmt_jd_criteria(jd_medium) or "  (none)"}
JD GREEN FLAGS TO REWARD: {_fmt_list(jd_green_flags, limit=5)}
JD RED FLAGS TO WATCH: {_fmt_list(jd_red_flags, limit=5)}
=== YOUR TASK ===
Write the ANALYST BRIEF now. Structure it as:
ANALYST READ:
[2-3 sentences: who is this candidate, what is your overall read, what is the biggest question mark]
WORK HISTORY SIGNALS:
[bullet per role: what is real, what needs validation, ownership level, any red flags]
PROJECT SIGNALS:
[bullet per project: what is genuinely theirs, what seems overclaimed, specific tech that's unusual or notable]
SKILL REALITY:
[bullet per key skill: evidence level in plain English, proven/likely/claimed-only/missing]
JD FIT:
[what they clearly have, what is a gap, what is unknown -- reference JD criteria by name]
UNCERTAIN AREAS (MUST PROBE):
[bullet per uncertain area from the parser: exact probe angle for Ishita]
OPENING ANGLE:
[Exactly 2 sentences. Sentence 1: which project/role to open on and why. Sentence 2: the EXACT first question — ONE question mark only, no compound questions, no "and", no dash-chaining. For FRESHER band: surface-level only — ask what they built and what their role was. For MID+: ask what they specifically owned. For EXPERIENCED/SENIOR: ask about a key decision or tradeoff. Example for FRESHER: "Open on Multi Channel Lead Qualification System. First question: what exactly did you build in this project and what was your role?"]"""
    return prompt
async def generate_llm_brief(
    *,
    candidate_name: str,
    job_title: str,
    band: str,
    resume_json: dict,
    jd_json: dict,
    anchor_item: str,
    anchor_type: str,
    openai_client: Any,
    llm_model: str = "gpt-4.1-mini",
    usage_sink: Optional[Any] = None,
) -> str:
    """
    Call GPT-4.1-mini to generate a narrative analyst brief.
    Returns the brief as a plain string ready for injection into the evaluation layer prompt.
    Falls back to empty string on any failure -- caller uses rule-based brief as fallback.
    """
    try:
        user_prompt = _build_llm_brief_prompt(
            candidate_name=candidate_name,
            job_title=job_title,
            band=band,
            resume_json=resume_json,
            jd_json=jd_json,
            anchor_item=anchor_item,
            anchor_type=anchor_type,
        )
        response = await openai_client.chat.completions.create(
            model=llm_model,
            messages=[
                {"role": "system", "content": _LLM_BRIEF_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=900,
        )
        if usage_sink:
            usage = getattr(response, "usage", None)
            billing_usage = {
                "model": llm_model,
                "inputTokens": int(getattr(usage, "prompt_tokens", 0) or 0),
                "outputTokens": int(getattr(usage, "completion_tokens", 0) or 0),
                "cachedInputTokens": int(getattr(getattr(usage, "prompt_tokens_details", None), "cached_tokens", 0) or 0),
            }
            if billing_usage["inputTokens"] or billing_usage["outputTokens"] or billing_usage["cachedInputTokens"]:
                usage_sink(billing_usage)
        brief_text = response.choices[0].message.content or ""
        brief_text = brief_text.strip()
        logger.info(
            "[LLM_BRIEF] Generated analyst brief: %d chars | candidate=%s band=%s",
            len(brief_text), candidate_name, band,
        )
        return brief_text
    except Exception as exc:
        logger.error("[LLM_BRIEF] Failed to generate brief: %s -- will use rule-based fallback", exc)
        return ""
