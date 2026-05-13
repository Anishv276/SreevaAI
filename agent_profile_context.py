from __future__ import annotations
import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Optional
from agent_utils import (
    _as_list,
    _coerce_jsonish,
    _compact_text,
    _deep_get,
    _extract_text_items,
    _first_text,
    _format_compact_section,
    _join_items,
    _safe_float,
)

# -- 5-Stage Interview Configuration -------------------------------------------
@dataclass
class InterviewStageConfig:
    index: int
    name: str
    label: str
    turn_budget: int     # max assistant turns before auto-advance

STAGE_CONFIGS: list["InterviewStageConfig"] = [
    InterviewStageConfig(index=0, name="resume", label="RESUME", turn_budget=5),
    InterviewStageConfig(index=1, name="skill", label="SKILL", turn_budget=5),
    InterviewStageConfig(index=2, name="situational", label="SITUATIONAL", turn_budget=5),
    InterviewStageConfig(index=3, name="behavioral", label="BEHAVIORAL", turn_budget=5),
]

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
    # Heuristic fallback when explicit years are missing:
    # avoid over-classifying as fresher just because "intern" appears once.
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
        # Prefer projects and academics over "years of experience" framing.
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

# -- JD ? resume alignment (for grounded questioning) -----------------------------
def _skill_tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9][a-z0-9.+#]*", (text or "").lower()))


def _jd_line_matches_resume_skill(jd_line: str, resume_skills: list[str]) -> bool:
    """True if this JD line plausibly matches something on the resume skill list."""
    if not jd_line or not resume_skills:
        return False
    jtokens = _skill_tokens(jd_line)
    jd_low = jd_line.lower().strip()
    for rs in resume_skills:
        if not rs:
            continue
        rs_low = (rs or "").lower().strip()
        rt = _skill_tokens(rs)
        if jtokens and rt and (jtokens & rt):
            return True
        if len(jd_low) >= 4 and (jd_low in rs_low or rs_low in jd_low):
            return True
        if len(rs_low) >= 3 and rs_low in jd_low:
            return True
    return False


def build_jd_resume_alignment_block(jd_must_haves: list[str], resume_skills: list[str]) -> str:
    """
    Compact block for stage directives: overlap vs gaps between JD must-haves and resume skills.
    """
    jd_list = _extract_text_items(list(jd_must_haves))[:12]
    rs_list = _extract_text_items(list(resume_skills))[:15]
    if not jd_list and not rs_list:
        return ""
    overlap = [j for j in jd_list if _jd_line_matches_resume_skill(j, rs_list)]
    jd_gap = [j for j in jd_list if j not in overlap]
    lines = [
        "JD ? RESUME ALIGNMENT (internal — never read aloud):",
        f"- Deepen with concrete examples (JD asks + resume shows signal): {_join_items(overlap, 5) or '—'}",
        f"- JD asks for this but resume does not show it — ask learning appetite / how they'd close the gap: {_join_items(jd_gap, 5) or '—'}",
        f"- Resume-listed skills to cross-check against the role: {_join_items(rs_list[:7], 7)}",
    ]
    return "\n".join(lines) + "\n\n"


def interview_variation_slot(session_key: str, modulo: int = 8) -> int:
    """Stable per-session slot so question templates rotate across interviews."""
    if not session_key:
        return 0
    digest = hashlib.md5(session_key.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % max(modulo, 1)


# -- JD brief extraction --------------------------------------------------------
def _extract_jd_must_haves(jd_data: dict[str, Any], jd_text: str) -> list[str]:
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
    if not capabilities and jd_text:
        skills_line = re.search(
            r"(?im)^\s*skills?\s*:\s*(.+?)(?:\n\s*[A-Za-z][A-Za-z\s]*\s*:|$)",
            jd_text,
        )
        if skills_line:
            raw = skills_line.group(1).replace("\n", " ")
            for part in re.split(r"[,;|•]|(?:\s{2,})", raw):
                text = _compact_text(part)
                if text:
                    capabilities.append(text)
        if not capabilities:
            for line in re.split(r"[\n•\-]+", jd_text):
                text = _compact_text(line)
                if text:
                    capabilities.append(text)
                if len(capabilities) >= 5:
                    break
    return _extract_text_items(capabilities)[:8]

def build_jd_summary(jd_details: Any, jd_text: str = "") -> str:
    jd_data = _coerce_jsonish(jd_details)
    target_seniority = _first_text(
        _deep_get(jd_data, "role_context.seniority"),
        _deep_get(jd_data, "experience.preferred_background"),
    )
    if not target_seniority:
        min_years = _safe_float(_deep_get(jd_data, "experience.min_years"))
        max_years = _safe_float(_deep_get(jd_data, "experience.max_years"))
        if min_years is not None and max_years is not None:
            target_seniority = f"{min_years:g}-{max_years:g} years"
        elif min_years is not None:
            target_seniority = f"{min_years:g}+ years"
    must_prove = _extract_jd_must_haves(jd_data, jd_text)
    lines = [
        f"Target seniority: {target_seniority or 'Not stated'}",
        f"Must-prove capabilities: {_join_items(must_prove, 5)}",
    ]
    return _format_compact_section("JD SUMMARY", lines)

# -- Screening summary block ----------------------------------------------------
def build_screening_summary(ai_report: Any, ai_report_text: str = "") -> str:
    screening_data = _coerce_jsonish(ai_report)
    strengths = _extract_text_items(
        _deep_get(screening_data, "strengths")
        or _deep_get(screening_data, "green_flags")
        or _deep_get(screening_data, "highlights")
        or _deep_get(screening_data, "summary")
    )
    gaps = _extract_text_items(
        _deep_get(screening_data, "gaps")
        or _deep_get(screening_data, "concerns")
        or _deep_get(screening_data, "red_flags")
        or _deep_get(screening_data, "watch_outs")
        or _deep_get(screening_data, "watch-outs")
    )
    confidence = _first_text(
        _deep_get(screening_data, "confidence"),
        _deep_get(screening_data, "notes"),
    )
    if not confidence and ai_report_text:
        confidence = _compact_text(ai_report_text[:200])
    lines = [
        f"Strengths: {_join_items(strengths, 3)}",
        f"Gaps to probe: {_join_items(gaps, 3)}",
        f"Confidence: {confidence or 'Treat as directional.'}",
    ]
    return _format_compact_section("SCREENING SUMMARY", lines)

# -- Context variables block ----------------------------------------------------
def _build_context_vars_block(
    *,
    org_name: str = "",
    org_location: str = "",
    drive_location: str = "",
    ai_name: str = "",
    candidate_first_name: str = "",
    candidate_name: str = "",
    job_title: str = "",
    interview_lang: str = "",
) -> str:
    lines = []
    if candidate_first_name:
        lines.append(f"- Candidate first name: {candidate_first_name}")
    elif candidate_name:
        lines.append(f"- Candidate name: {candidate_name}")
    if job_title:
        lines.append(f"- Role: {job_title}")
    if ai_name:
        lines.append(f"- AI interviewer name: {ai_name}")
    if org_name:
        lines.append(f"- Organization: {org_name}")
    if org_location:
        lines.append(f"- Organization location: {org_location}")
    if drive_location:
        lines.append(f"- Drive location: {drive_location}")
    if interview_lang:
        lines.append(f"- Interview language: {interview_lang}")
    return "\n".join(lines)

def first_name_from_full_name(full_name: str) -> str:
    if not full_name:
        return ""
    cleaned = " ".join(str(full_name).strip().split())
    if not cleaned:
        return ""
    return cleaned.split(" ", 1)[0]

# -- Dataclasses ----------------------------------------------------------------
@dataclass(slots=True)
class ResumeContext:
    resume_data: dict[str, Any]
    resume_text: str
    years_of_experience: Optional[float]
    years_label: str
    current_role: str
    skills: list[str]
    projects: list[str]
    work_history: list[str]
    experiences: list[str]
    education: list[str]
    hobbies: list[str]
    ownership_risks: list[str]
    fresher_signals: bool
    experienced_signals: bool

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

# -- Resume parsing -------------------------------------------------------------
def parse_resume_context(resume_data: Any, resume_text: str) -> ResumeContext:
    if isinstance(resume_data, ResumeContext):
        return resume_data
    parsed_resume = _coerce_jsonish(resume_data)
    resume_text = resume_text or ""
    years: Optional[float] = None
    years = _safe_float(_deep_get(parsed_resume, "experience.total_years"))
    if years is None:
        years = _safe_float(_deep_get(parsed_resume, "experienceYears"))
    if years is None:
        years = _safe_float(_deep_get(parsed_resume, "experience_years"))
    if years is None:
        lower = resume_text.lower()
        match = re.search(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|year|yrs|yr)\b", lower)
        if match:
            years = _safe_float(match.group(1))
    if years is None:
        years_label = "Not stated"
    elif float(years).is_integer():
        years_label = f"{int(years)} years"
    else:
        years_label = f"{years:.1f} years"
    current_role = _first_text(
        _deep_get(parsed_resume, "experience.currentRole"),
        _deep_get(parsed_resume, "experience.current_role"),
        parsed_resume.get("current_role"),
        parsed_resume.get("currentRole"),
    )
    current_company = _first_text(
        _deep_get(parsed_resume, "experience.currentCompany"),
        _deep_get(parsed_resume, "experience.current_company"),
        parsed_resume.get("current_company"),
        parsed_resume.get("currentCompany"),
    )
    if current_role and current_company:
        current_role_label = f"{current_role} at {current_company}"
    elif current_role:
        current_role_label = current_role
    elif current_company:
        current_role_label = current_company
    else:
        current_role_label = "Not stated"
    skills = _extract_text_items(_deep_get(parsed_resume, "skills.technical"), ("skill", "name", "value"))
    skills += _extract_text_items(_deep_get(parsed_resume, "skills.tools"), ("tool", "name", "value", "skill"))
    skills += _extract_text_items(_deep_get(parsed_resume, "skills.domain_skills"), ("skill", "name", "value"))
    skills += _extract_text_items(_deep_get(parsed_resume, "keywords"))
    skills = _extract_text_items(skills)
    projects: list[str] = []
    for project in _as_list(_deep_get(parsed_resume, "projects")):
        if not isinstance(project, dict):
            text = _first_text(project)
            if text:
                projects.append(text)
            continue
        name = _first_text(project.get("name"), project.get("title"))
        description = _first_text(project.get("description"), project.get("summary"))
        technologies = _extract_text_items(project.get("technologies"), ("skill", "tool", "name", "value"))
        parts = [name, description]
        compact = " - ".join(part for part in parts if part)
        if technologies:
            compact = f"{compact} [{_join_items(technologies, 3)}]" if compact else _join_items(technologies, 3)
        if compact:
            projects.append(compact)
    education: list[str] = []
    for item in _as_list(
        _deep_get(parsed_resume, "education")
        or _deep_get(parsed_resume, "academics")
        or _deep_get(parsed_resume, "qualifications")
    ):
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
    hobbies: list[str] = []
    for item in _as_list(
        _deep_get(parsed_resume, "hobbies")
        or _deep_get(parsed_resume, "interests")
        or _deep_get(parsed_resume, "extra_activities")
        or _deep_get(parsed_resume, "extracurriculars")
        or _deep_get(parsed_resume, "activities")
    ):
        if isinstance(item, dict):
            text = _first_text(item.get("name"), item.get("title"), item.get("activity"), item.get("description"))
        else:
            text = _first_text(item)
        if text:
            hobbies.append(text)
    work_history: list[str] = []
    for role in _as_list(_deep_get(parsed_resume, "work_history")):
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
    experiences = _extract_text_items(projects + work_history)
    ownership_risks = _extract_text_items(
        _deep_get(parsed_resume, "red_flags")
        or _deep_get(parsed_resume, "ownership_risks")
        or _deep_get(parsed_resume, "scoring_hints.red_flags_to_watch")
    )
    if len(ownership_risks) < 2:
        for item in experiences:
            ownership_risks.append(f"Verify personal ownership in {item}")
            if len(ownership_risks) >= 2:
                break
    ownership_risks = _extract_text_items(ownership_risks)[:2]
    lower_text = resume_text.lower()
    fresher_signals = any(
        sig in lower_text
        for sig in ("fresher", "entry level", "student", "final year", "internship", "intern", "graduate")
    )
    experienced_signals = any(
        sig in lower_text
        for sig in ("senior", "lead", "manager", "head of", "director", "staff engineer", "principal")
    )
    return ResumeContext(
        resume_data=parsed_resume,
        resume_text=resume_text,
        years_of_experience=years,
        years_label=years_label,
        current_role=current_role_label,
        skills=skills,
        projects=projects,
        work_history=work_history,
        experiences=experiences,
        education=_extract_text_items(education),
        hobbies=_extract_text_items(hobbies),
        ownership_risks=ownership_risks,
        fresher_signals=fresher_signals,
        experienced_signals=experienced_signals,
    )

def _ensure_resume_context(resume_data: Any, resume_text: str = "") -> ResumeContext:
    if isinstance(resume_data, ResumeContext):
        return resume_data
    return parse_resume_context(resume_data, resume_text)

def build_interview_turns(transcript_lines: list[Any]) -> list[dict[str, Any]]:
    """Group raw transcript lines into question/answer turns."""
    blocks: list[dict[str, Any]] = []
    def _append_block(speaker: str, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        if blocks and blocks[-1]["speaker"] == speaker:
            blocks[-1]["text"] = f'{blocks[-1]["text"]} {text}'.strip()
        else:
            blocks.append({"speaker": speaker, "text": text})
    for raw_line in transcript_lines or []:
        if not isinstance(raw_line, str):
            continue
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("Interviewer:"):
            _append_block("Interviewer", line[len("Interviewer:"):].strip())
        elif line.startswith("Candidate:"):
            _append_block("Candidate", line[len("Candidate:"):].strip())
        else:
            _append_block("Interviewer", line)
    turns: list[dict[str, Any]] = []
    current_question: Optional[str] = None
    current_answer_parts: list[str] = []
    turn_index = 0
    def _flush_turn() -> None:
        nonlocal current_question, current_answer_parts, turn_index
        question = (current_question or "").strip()
        answer = " ".join(part.strip() for part in current_answer_parts if part.strip()).strip()
        if question or answer:
            turn_index += 1
            turns.append({
                "turn": turn_index,
                "question": question,
                "answer": answer,
                "questionSpeaker": "Interviewer",
                "answerSpeaker": "Candidate" if answer else None,
            })
        current_question = None
        current_answer_parts = []
    for block in blocks:
        speaker = block["speaker"]
        text = block["text"]
        if speaker == "Interviewer":
            if current_question is not None or current_answer_parts:
                _flush_turn()
            current_question = text
        else:
            if current_question is None:
                current_question = ""
            current_answer_parts.append(text)
    if current_question is not None or current_answer_parts:
        _flush_turn()
    return turns

def refresh_candidate_band_context(context: CandidateBandContext) -> CandidateBandContext:
    context.live_prompt_context = context.merged_brief_block.strip() or "Not available"
    return context

# -- Warmup directive -----------------------------------------------------------
# -- Candidate context ready (fallback when no brief) --------------------------
def build_candidate_context_ready_message(
    *,
    context: CandidateBandContext,
) -> str:
    summary_block = context.merged_brief_block.strip() or "Not available"
    return (
        "[CANDIDATE CONTEXT READY]\n"
        "CANDIDATE PROFILE SUMMARY:\n"
        f"{summary_block}\n\n"
        "Use this to shape the first real interview question naturally. "
        "Do not mention this note aloud."
    )


def build_merged_interview_brief(
    *,
    candidate_name: str,
    job_title: str,
    candidate_band: str,
    resume_context: ResumeContext,
    jd_details: Any,
    jd_text: str,
    ai_report: Any,
    ai_report_text: str = "",
    resume_brief: Optional[dict] = None,
) -> str:
    jd_summary = build_jd_summary(jd_details, jd_text)
    screening_summary = build_screening_summary(ai_report, ai_report_text)
    jd_data = _coerce_jsonish(jd_details)
    jd_must_haves = _extract_jd_must_haves(jd_data, jd_text)

    strengths = _extract_text_items(
        _deep_get(_coerce_jsonish(ai_report), "strengths")
        or _deep_get(_coerce_jsonish(ai_report), "green_flags")
        or _deep_get(_coerce_jsonish(ai_report), "highlights")
    )
    gaps = _extract_text_items(
        _deep_get(_coerce_jsonish(ai_report), "gaps")
        or _deep_get(_coerce_jsonish(ai_report), "concerns")
        or _deep_get(_coerce_jsonish(ai_report), "red_flags")
    )

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
        f"Screening strengths: {_join_items(strengths, 3)}",
        f"Screening gaps: {_join_items(gaps, 3)}",
        f"First anchor: {anchor_type or 'topic'} - {anchor_item or 'candidate background'}",
        f"Interview strategy: {band_strategy}",
    ]
    header = _format_compact_section("INTERVIEW BRIEF", lines)
    return f"{header}\n\n{jd_summary}\n\n{screening_summary}".strip()
