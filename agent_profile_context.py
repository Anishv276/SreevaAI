from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Any, Optional
from agent_runtime_support import _TOOL_ALIAS_CATALOG
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

# ── 5-Stage Interview Configuration ───────────────────────────────────────────
@dataclass
class InterviewStageConfig:
    index: int
    name: str
    label: str
    budget_secs: int    # soft time budget per stage
    grace_secs: int     # allowed overtime before forced advance
    goal: str           # what Ishitha is testing in this stage
    bridge_to_next: str # natural transition phrase to the NEXT stage

STAGE_CONFIGS: list["InterviewStageConfig"] = [
    InterviewStageConfig(
        index=0, name="resume", label="RESUME",
        budget_secs=240, grace_secs=60,
        goal="Confirm background using the candidate's ACTUAL projects, companies, and roles from their resume.",
        bridge_to_next=(
            "That project background is really helpful. I want to go one level deeper on the technical side — "
            "tell me about a specific technology from your work where you really had to push beyond just using it."
        ),
    ),
    InterviewStageConfig(
        index=1, name="skill", label="SKILL",
        budget_secs=240, grace_secs=60,
        goal="Verify real depth behind claimed technologies. Move from 'used it' to 'owned it under real pressure'.",
        bridge_to_next=(
            "You clearly know your tools well. Let me put those skills into a real-world context — "
            "imagine you are a few weeks into a new role and you run into a critical production problem. What is your first move?"
        ),
    ),
    InterviewStageConfig(
        index=2, name="situational", label="SITUATIONAL",
        budget_secs=240, grace_secs=60,
        goal="Test judgment and decision-making using a role-relevant hypothetical scenario.",
        bridge_to_next=(
            "Good thinking there. Real projects though always involve people too — "
            "tell me about a time a technical or process decision caused friction with a teammate or stakeholder. How did you handle it?"
        ),
    ),
    InterviewStageConfig(
        index=3, name="behavioral", label="BEHAVIORAL",
        budget_secs=240, grace_secs=60,
        goal="Explore soft skills, conflict resolution, and collaboration through specific STAR-style past examples.",
        bridge_to_next=(
            "That gives me a strong sense of how you work with people. Let me shift to something more hands-on — "
            "I want to walk you through a quick scenario and hear your thinking out loud as you work through it."
        ),
    ),
    InterviewStageConfig(
        index=4, name="practical", label="PRACTICAL",
        budget_secs=240, grace_secs=90,
        goal="Test live problem-solving through a verbal scenario. Evaluate reasoning process, not just the answer.",
        bridge_to_next="",  # Last stage — no bridge needed
    ),
]
def build_term_alias_hints(*text_blocks: str, max_lines: int = 10) -> str:
    combined = " ".join(block for block in text_blocks if isinstance(block, str)).lower()
    lines: list[str] = []
    for canonical, aliases in _TOOL_ALIAS_CATALOG.items():
        matched = [
            a for a in aliases
            if re.search(r"\b" + re.escape(a) + r"\b", combined)
        ]
        if not matched:
            continue
        unique_aliases = sorted(set(matched))
        lines.append(f"- {', '.join(unique_aliases[:3])} -> {canonical}")
        if len(lines) >= max_lines:
            break
    if not lines:
        return "- No strong alias hints from context. If unclear, confirm once, then move on."
    return "\n".join(lines)
def infer_candidate_band(structured_resume_raw: Any, resume_text_block: str) -> str:
    """
    Infer interview mode from structured resume + free text:
    Fixed ranges:
    - fresher: < 1.5 years
    - mid: 1.5 to 5 years, inclusive
    - experienced: > 5 to 10 years, inclusive of 10
    - senior: > 10 years
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
    if context.fresher_signals or any(sig in text for sig in ("fresher", "entry level", "student", "final year", "internship", "intern", "graduate")):
        return "fresher"
    if context.experienced_signals or any(sig in text for sig in ("senior", "lead", "manager", "head of", "director", "staff engineer", "principal")):
        if any(sig in text for sig in ("senior", "staff engineer", "principal", "director", "head of")):
            return "senior"
        return "experienced"
    return "mid"
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
def detect_role_category(job_title: str) -> str:
    if not job_title:
        return "operations"
    title = job_title.lower().strip()
    ENGINEERING = [
        "engineer", "developer", "dev", "software", "backend", "frontend",
        "full stack", "fullstack", "sre", "devops", "platform", "infrastructure",
        "data engineer", "ml engineer", "machine learning", "ai engineer",
        "cloud", "architect", "embedded", "firmware", "android", "ios",
        "mobile", "web developer", "python", "java", "golang", "rust",
        "security engineer", "qa engineer", "test engineer", "sdet",
        "data scientist", "tech lead", "engineering manager", "staff engineer",
        "principal engineer", "solutions engineer",
    ]
    SALES = [
        "sales", "account executive", " ae ", "business development", "bdr",
        "sdr", "account manager", "revenue", "closing", "quota", "pipeline",
        "enterprise sales", "inside sales", "field sales", "commercial",
        "partnerships", "channel", "pre-sales",
    ]
    CUSTOMER_SUCCESS = [
        "customer success", "csm", "client success", "account success",
        "customer experience", " cx ", "onboarding", "implementation",
        "customer support", "support engineer", "technical support",
        "client services", "renewal", "retention", "churn", "post-sales",
    ]
    MARKETING = [
        "marketing", "growth", "demand generation", "demand gen",
        "content", " seo", " sem", "paid media", "brand", "product marketing",
        "pmm", "performance marketing", "digital marketing", "social media",
        "communications", " pr ", "campaign", "copywriter", "email marketing",
    ]
    for kw in ENGINEERING:
        if kw in title:
            return "engineering"
    for kw in SALES:
        if kw in title:
            return "sales"
    for kw in CUSTOMER_SUCCESS:
        if kw in title:
            return "customer_success"
    for kw in MARKETING:
        if kw in title:
            return "marketing"
    return "operations"
def detect_role_subtype(job_title: str, role_category: str) -> str:
    if not job_title:
        return "general"
    title = job_title.lower().strip()
    if role_category == "engineering":
        if any(k in title for k in ["data scientist", "data engineer", "ml ", "machine learning", "ai ", "analytics engineer"]):
            return "data"
        if any(k in title for k in ["devops", "sre", "platform", "infrastructure", "cloud", "devsecops"]):
            return "devops"
        if any(k in title for k in ["frontend", "front end", "react", "vue", "angular", "ui engineer"]):
            return "frontend"
        if any(k in title for k in ["android", "ios", "mobile", "flutter", "react native"]):
            return "mobile"
        if any(k in title for k in ["qa", "test engineer", "sdet", "quality"]):
            return "qa"
        if any(k in title for k in ["full stack", "fullstack"]):
            return "fullstack"
        if any(k in title for k in ["solutions", "gtm", "presales", "pre-sales", "field engineer"]):
            return "solutions"
        return "backend"
    if role_category == "sales":
        if any(k in title for k in ["sdr", "bdr", "outbound", "prospecting"]):
            return "sdr"
        if any(k in title for k in ["account executive", " ae ", "closing", "enterprise sales"]):
            return "ae"
        if any(k in title for k in ["account manager", "account management", "renewal"]):
            return "account_management"
        return "general"
    if role_category == "marketing":
        if any(k in title for k in ["performance", "paid", "sem", "seo", "growth"]):
            return "performance"
        if any(k in title for k in ["content", "copywriter", "editorial"]):
            return "content"
        if any(k in title for k in ["product marketing", "pmm"]):
            return "product_marketing"
        if any(k in title for k in ["brand", "communications", "pr"]):
            return "brand"
        return "general"
    return "general"
def first_name_from_full_name(full_name: str) -> str:
    if not full_name:
        return ""
    cleaned = " ".join(str(full_name).strip().split())
    if not cleaned:
        return ""
    return cleaned.split(" ", 1)[0]
def build_role_layer(role_category: str, role_subtype: str, candidate_band: str) -> str:
    engineering_base = """
ROLE INTELLIGENCE - ENGINEERING
Focus: real decisions, not tool lists.
Evaluate:
- constraint awareness
- failure/debugging literacy
- tradeoffs and system thinking
- ownership ("I" vs "we")
- measurable impact
Strong signals:
- names a real constraint, failure, or metric
- explains why a choice was made
- compares alternatives honestly
- says what they would change now
Weak signals:
- tool dumping with no story
- vague wins with no numbers
- no failure or rollback story
- polished STAR answers with no real detail
Probe harder when they mention:
- a tool
- a success
- an ownership claim
- a vague result
Ask for:
- the constraint
- the tradeoff
- the before/after
- what broke
- what they personally owned
"""
    engineering_subtypes = {
        "backend": """
BACKEND: API design, data modeling, concurrency, production failures.
Probe: ask for the hardest tradeoff, the real incident, and what they would redesign now.
""",
        "frontend": """
FRONTEND: performance, state, accessibility, real user impact.
Probe: ask for a slow UI, a design pushback, and a choice they would not repeat.
""",
        "data": """
DATA: pipeline reliability, data quality, business impact.
Probe: ask what broke, who noticed first, and how the decision changed.
""",
        "devops": """
DEVOPS: incident ownership, on-call, deploys, reliability tradeoffs.
Probe: ask for the worst incident, the rollback, and alerting choices.
""",
        "mobile": """
MOBILE: device fragmentation, app-store constraints, offline behavior.
Probe: ask for a device-specific bug and the battery/network tradeoff.
""",
        "qa": """
QA: test strategy, risk prioritization, release judgment.
Probe: ask what they would not test, what they blocked, and why.
""",
        "fullstack": """
FULLSTACK: end-to-end ownership, seam handling, honest strengths.
Probe: ask for one feature from DB to UI and where it was hardest.
""",
        "solutions": """
SOLUTIONS: technical-to-business translation, customer escalation, PoC thinking.
Probe: ask when they pushed back, saved the deal, or explained ROI to a non-technical leader.
""",
    }
    sales_base = """
ROLE INTELLIGENCE - SALES
Focus: numbers, deal judgment, rejection, and process.
Evaluate:
- quota and attainment
- losses and self-awareness
- multi-stakeholder deal handling
- repeatable process
- coachability
Strong signals:
- gives numbers naturally
- explains why they won or lost
- names a real objection or decision point
- shows what they personally did
Weak signals:
- only win stories
- no numbers
- generic process language
- no friction or failure
Probe harder when they mention:
- quota
- a win
- a loss
- an objection
- a relationship change
"""
    sales_subtypes = {
        "sdr": """
SDR: prospecting quality, sequence changes, ICP judgment.
Probe: ask what they changed, what response improved, and why.
""",
        "ae": """
AE: qualification, deal judgment, competitive losses.
Probe: ask when they walked away and why they knew it would not close.
""",
        "account_management": """
ACCOUNT MANAGEMENT: renewals, expansion, churn risk, account growth.
Probe: ask for a save, an expansion, and the turning point.
""",
    }
    customer_success_layer = """
ROLE INTELLIGENCE - CUSTOMER SUCCESS
Focus: churn risk, account health, stakeholder movement, and business value.
Evaluate:
- at-risk account judgment
- stakeholder navigation
- value articulation
- escalation timing
- metrics and retention thinking
Strong signals:
- names specific accounts and turning points
- gives metrics
- explains cross-functional influence
- shows what changed the outcome
Weak signals:
- only happy stories
- no numbers
- no conflict
- generic relationship language
"""
    marketing_base = """
ROLE INTELLIGENCE - MARKETING
Focus: metrics, audience insight, ownership, and what failed.
Evaluate:
- metrics and attribution
- audience understanding
- ownership vs agency/team
- experiments that failed
- sales alignment
Strong signals:
- gives numbers
- names a real audience
- explains what changed the result
- admits what did not work
Weak signals:
- strategy without execution
- no numbers
- only win stories
- agency credit with no personal ownership
"""
    marketing_subtypes = {
        "performance": """
PERFORMANCE: bidding, attribution, channel mix, diagnosis.
Probe: ask what broke, what they tested, and why the model was weak.
""",
        "content": """
CONTENT: distribution, performance, insight-to-brief thinking.
Probe: ask why a piece worked, what did not, and how they chose the topic.
""",
        "product_marketing": """
PRODUCT MARKETING: positioning, research, launches, messaging validation.
Probe: ask how they validated messaging and what surprised them.
""",
        "brand": """
BRAND: business impact, consistency, tension with commercial pressure.
Probe: ask how they defended a brand decision and measured effect.
""",
    }
    operations_layer = """
ROLE INTELLIGENCE - OPERATIONS / GENERALIST
Focus: systems, ambiguity, stakeholder influence, and prioritization.
Evaluate:
- root cause thinking
- influence without authority
- prioritization
- documentation
- ambiguity handling
Strong signals:
- names a broken process
- shows the conflict or tradeoff
- explains what changed
- shows what lasted after they left
Weak signals:
- frameworks with no conflict
- no tradeoff
- no resistance
- vague efficiency claims
"""
    if role_category == "engineering":
        subtype_note = engineering_subtypes.get(role_subtype, engineering_subtypes["backend"])
        role_text = engineering_base + subtype_note
    elif role_category == "sales":
        subtype_note = sales_subtypes.get(role_subtype, sales_subtypes.get("general", ""))
        role_text = sales_base + subtype_note
    elif role_category == "customer_success":
        role_text = customer_success_layer
    elif role_category == "marketing":
        subtype_note = marketing_subtypes.get(role_subtype, marketing_subtypes.get("general", ""))
        role_text = marketing_base + subtype_note
    else:
        role_text = operations_layer
    if candidate_band == "fresher":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (FRESHER / EARLY CAREER):
  Prioritise potential and reasoning over domain track record.
  Ask "how would you approach" and "what have you learned" more than "walk me through what you delivered."
  Be patient with vocabulary - they may not know industry jargon yet.
  Probe learning speed and genuine curiosity rather than scale or ownership.
  Do not penalise them for not knowing things an experienced hire would know.
"""
    elif candidate_band == "senior":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (SENIOR):
  Expect deep ownership, clear strategic judgment, and evidence of impact across scope and time.
  Do not stay at project summaries - go after tradeoffs, influence, scale, and decisions made under constraint.
  Ask what they would change architecturally or operationally if they owned the system/team today.
  Probe mentorship, cross-functional leadership, and how they set direction for others.
"""
    elif candidate_band == "experienced":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (EXPERIENCED / SENIOR):
  Expect ownership language, scale experience, and strategic thinking.
  If answers feel junior - no metrics, no ownership, no tradeoffs - probe harder. That is a signal.
  Do not accept vague answers at this level. An experienced person should have a story for everything.
  Push to depth spiral level 4, 5, 6 on the strongest topics.
  Ask about failures, hard decisions, and things they would do differently.
"""
    else:
        band_note = """
SENIORITY NOTE FOR THIS ROLE (MID-LEVEL):
  Expect some real domain experience but not necessarily strategic depth yet.
  Probe for learning velocity - do they know what they do not know?
  Balance breadth of skills with depth on the things they claim to know best.
  Look for growth trajectory - are they getting better, or plateauing?
"""
    return role_text + band_note
def build_stage_coverage_plan(
    resume_context: "ResumeContext",
    jd_block: str = "",
    context: Optional["CandidateBandContext"] = None,
) -> list[str]:
    """
    Build a 5-stage coverage plan grounded in the candidate's actual resume.
    Returns a flat list of coverage items (one per stage) for backwards compatibility.
    Also populates context.stage_plan if context is provided.
    """
    # Stage 1: Resume — use actual projects/roles
    s1_focus = resume_context.projects[0] if resume_context.projects else (
        resume_context.work_history[0] if resume_context.work_history else "most recent role"
    )
    stage1 = [f"RESUME: Confirm scope and ownership in '{s1_focus}'."]

    # Stage 2: Skill — use actual claimed skills
    top_skills = resume_context.skills[:3]
    skill_str = ", ".join(top_skills) if top_skills else "core claimed technologies"
    stage2 = [f"SKILL: Verify production-depth in {skill_str}."]

    # Stage 3: Situational — derived from JD
    stage3 = ["SITUATIONAL: Ask a role-relevant 'what would you do if...' scenario from the JD."]

    # Stage 4: Behavioral — use ownership risks / gaps
    gap = resume_context.ownership_risks[0] if resume_context.ownership_risks else "collaboration or conflict moment"
    stage4 = [f"BEHAVIORAL: Probe — {gap}."]

    # Stage 5: Practical — live voice scenario
    stage5 = ["PRACTICAL: Walk through a live verbal problem-solving scenario out loud."]

    if context is not None:
        context.stage_plan = [
            {"stage": 0, "name": "RESUME",      "items": stage1},
            {"stage": 1, "name": "SKILL",        "items": stage2},
            {"stage": 2, "name": "SITUATIONAL",  "items": stage3},
            {"stage": 3, "name": "BEHAVIORAL",   "items": stage4},
            {"stage": 4, "name": "PRACTICAL",    "items": stage5},
        ]

    return stage1 + stage2 + stage3 + stage4 + stage5
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
    role_category: str
    role_subtype: str
    coverage_items: list[str]
    candidate_summary_block: str = ""
    jd_summary_block: str = ""
    screening_summary_block: str = ""
    role_layer: str = ""
    term_alias_hints: str = ""
    role_intelligence_block: str = ""
    candidate_brief_block: str = ""
    smart_opening_question: str = ""
    short_coverage_block: str = ""
    live_prompt_context: str = ""
    questions_list: str = ""
    depth_instruction: str = ""
    initial_context_injected: bool = False
    full_brief_injected: bool = False
    stage_plan: list = field(default_factory=list)  # 5-stage structured plan
    stage_history: list = field(default_factory=list)  # completed stage records
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
            field = _first_text(item.get("field"), item.get("branch"), item.get("major"), item.get("specialization"))
            year = _first_text(item.get("year"), item.get("graduation_year"), item.get("passing_year"))
            parts = [degree, field, school]
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
    return parse_resume_context(resume_data, resume_text)
def _extract_years_of_experience(resume_data: dict[str, Any], resume_text: str) -> str:
    return _ensure_resume_context(resume_data, resume_text).years_label
def build_candidate_summary(structured_resume: Any, resume_text: str = "") -> str:
    context = _ensure_resume_context(structured_resume, resume_text)
    lines = [
        f"Current role: {context.current_role}",
        f"Years of experience: {context.years_label}",
        f"Core skills: {_join_items(context.skills, 5)}",
        f"Projects: {_join_items(context.projects, 3)}",
        f"Work history: {_join_items(context.work_history, 3)}",
        f"Education: {_join_items(context.education, 3)}" if context.education else "Education: Not stated",
        f"Hobbies / extra activities: {_join_items(context.hobbies, 3)}" if context.hobbies else "Hobbies / extra activities: Not stated",
        f"Key projects/experiences: {_join_items(context.experiences, 3)}",
        f"Ownership risks to verify: {_join_items(context.ownership_risks, 2)}",
    ]
    return _format_compact_section("CANDIDATE SUMMARY", lines)
def _build_context_vars_block(*, org_name: str = "", org_location: str = "", drive_location: str = "", ai_name: str = "", candidate_first_name: str = "", candidate_name: str = "", job_title: str = "", interview_lang: str = "") -> str:
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
        for line in re.split(r"[\nâ€¢\-]+", jd_text):
            text = _compact_text(line)
            if text:
                capabilities.append(text)
            if len(capabilities) >= 5:
                break
    return _extract_text_items(capabilities)[:5]
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
    risks = _extract_text_items(
        _deep_get(jd_data, "scoring_hints.red_flags_to_watch")
        or _deep_get(jd_data, "deal_breakers")
        or _deep_get(jd_data, "interview_signals")
    )
    if len(risks) < 3:
        for item in must_prove:
            risks.append(f"Risk if missing: no clear evidence of {item}")
            if len(risks) >= 3:
                break
    risks = _extract_text_items(risks)[:3]
    lines = [
        f"Target seniority: {target_seniority or 'Not stated'}",
        f"Must-prove capabilities: {_join_items(must_prove, 5)}",
        f"Major gaps or risks if missing: {_join_items(risks, 3)}",
    ]
    return _format_compact_section("JD SUMMARY", lines)
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
    contradictions = _extract_text_items(
        _deep_get(screening_data, "contradictions")
        or _deep_get(screening_data, "inconsistencies")
        or _deep_get(screening_data, "watch_outs")
    )
    confidence = _first_text(
        _deep_get(screening_data, "confidence"),
        _deep_get(screening_data, "confidence_note"),
        _deep_get(screening_data, "overall_confidence"),
        _deep_get(screening_data, "notes"),
    )
    if not confidence and ai_report_text:
        confidence = _compact_text(ai_report_text[:200])
    lines = [
        f"Top strengths: {_join_items(strengths, 3)}",
        f"Top gaps: {_join_items(gaps, 3)}",
        f"Top contradictions or watch-outs: {_join_items(contradictions, 3)}",
        f"Confidence notes: {confidence or 'Treat screening as directional, not final.'}",
    ]
    return _format_compact_section("SCREENING SUMMARY", lines)
def build_live_prompt_context(context: CandidateBandContext) -> str:
    coverage_block = (
        context.short_coverage_block.strip()
        if context.short_coverage_block and context.short_coverage_block.strip()
        else "- Not available"
    )
    brief_block = context.candidate_brief_block.strip() if context.candidate_brief_block and context.candidate_brief_block.strip() else "No brief available - use the summaries below as the primary context and keep probing grounded in them."
    return (
        "PRIMARY GUIDANCE ORDER:\n"
        "- Use the candidate brief first.\n"
        "- Use the summaries below to confirm, compress, and prioritize.\n"
        "- Use the coverage list to avoid blind spots.\n\n"
        "SOURCE EXTRACTION RULES:\n"
        "- Read the candidate summary, JD summary, and screening summary as source documents.\n"
        "- Extract concrete facts before deciding what to probe next.\n"
        "- Prefer the most specific source when the same fact appears in more than one place.\n"
        "- Never invent skills, projects, titles, or risks that are not supported by the summaries.\n\n"
        f"ROLE INTELLIGENCE\n{context.role_intelligence_block.strip()}\n\n"
        f"{context.candidate_summary_block.strip()}\n\n"
        f"{context.jd_summary_block.strip()}\n\n"
        f"{context.screening_summary_block.strip()}\n\n"
        f"PERSONALIZED INTERVIEW BRIEF\n{brief_block}\n\n"
        f"SHORT MANDATORY COVERAGE LIST\n{coverage_block}"
    )
def refresh_candidate_band_context(context: CandidateBandContext) -> CandidateBandContext:
    context.term_alias_hints = build_term_alias_hints(
        context.candidate_summary_block,
        context.jd_summary_block,
        context.screening_summary_block,
        context.candidate_brief_block,
    )
    context.role_intelligence_block = context.role_layer
    if context.term_alias_hints:
        context.role_intelligence_block = (
            f"{context.role_layer}\n\nTERM RECOGNITION HINTS:\n{context.term_alias_hints}"
        )
    context.live_prompt_context = build_live_prompt_context(context)
    return context
def extract_brief_section(brief_text: str, section_title: str) -> str:
    lines = brief_text.splitlines()
    target = section_title.strip().upper().rstrip(":")
    capture = False
    collected: list[str] = []
    for line in lines:
        stripped = line.strip()
        normalized = stripped.rstrip(":").upper()
        if not capture:
            if normalized == target:
                capture = True
                if ":" in stripped:
                    inline_value = stripped.split(":", 1)[1].strip()
                    if inline_value:
                        collected.append(inline_value)
            continue
        if stripped and stripped.endswith(":") and stripped.upper() == stripped and normalized != target:
            break
        if capture:
            collected.append(line.rstrip())
    return "\n".join(collected).strip()
def extract_smart_opening_question(brief_text: str) -> str:
    opening = extract_brief_section(brief_text, "SMART OPENING QUESTION")
    if opening:
        return opening
    return ""
def build_fast_opening_context() -> str:
    """
    Return instruction for first 2 conversational turns (no structured interview yet).
    Keep it short: greet, ask how they are, share 1-2 lines, then stop and wait for pivot.
    """
    return (
        "[CONVERSATIONAL WARMUP — TURNS 1 AND 2 ONLY]\n"
        "You are starting a conversation, NOT an interview yet.\n\n"
        "Turn 1 — Your opening line:\n"
        "  Greet them warmly and ask how they are doing. Keep it simple and genuine.\n"
        "  Examples:\n"
        "  - 'Hey! How are you doing today?'\n"
        "  - 'Hi! Good to connect. How's your day going so far?'\n"
        "  - 'Hey, thanks for jumping on. How are you doing?'\n\n"
        "Turn 2 — After they respond:\n"
        "  Share 1-2 lines about how YOU are doing. Be brief and human. Then stop talking.\n"
        "  Examples:\n"
        "  - 'I'm doing well, keeping busy but good. Really glad we could connect today.'\n"
        "  - 'Honestly pretty good! Had a lot of calls today but this one I was looking forward to.'\n"
        "  - 'Doing great, thanks for asking! It's been a full day but I'm energized.'\n\n"
        "STRICT RULES FOR WARMUP:\n"
        "  - Do NOT ask where they are from\n"
        "  - Do NOT ask what drew them to this field\n"
        "  - Do NOT ask about their career journey\n"
        "  - Do NOT ask about their background or skills yet\n"
        "  - Do NOT ask any follow-up warmup questions after turn 2\n"
        "  - STOP after your 2-line reply. The next message will tell you what to do next.\n\n"
        "After exactly 2 turns, wait. You will receive new instructions to begin the real conversation."
    )
def build_interview_pivot_directive(context: Optional["CandidateBandContext"] = None) -> str:
    """
    Return instruction to pivot from warmup to Stage 1 (RESUME) naturally.
    Fires after turn 2. Uses actual resume data from context to avoid generic placeholders.
    """
    opening_hint = ""
    if context and context.smart_opening_question:
        opening_hint = (
            f"\n\nYOUR FIRST QUESTION (from the candidate brief — use this or adapt it naturally):\n"
            f"{context.smart_opening_question}"
        )
    elif context and context.stage_plan:
        s1 = next((s for s in context.stage_plan if s["stage"] == 0), None)
        if s1 and s1["items"]:
            opening_hint = f"\n\nFIRST FOCUS: {s1['items'][0]}"
    elif context and context.candidate_summary_block:
        # Fallback: pull first project or role from candidate summary
        lines = [l.strip() for l in context.candidate_summary_block.splitlines() if l.strip()]
        for line in lines:
            if line.lower().startswith(("projects:", "work history:", "current role:")):
                opening_hint = f"\n\nHINT: {line}"
                break

    return (
        "[STAGE 1 — RESUME — STARTING NOW]\n"
        "Warmup complete. Transition into Stage 1 (RESUME) naturally — like the conversation is just deepening.\n\n"
        "Your job in Stage 1 (~4 minutes):\n"
        "  - Reference ACTUAL projects, companies, or roles from the candidate's resume.\n"
        "  - NEVER use generic placeholders like '[Company]' or '[Project]' — use the real names.\n"
        "  - Ask ONE specific, grounded question that shows you've read their background.\n\n"
        "Good opening examples (adapt to their REAL details):\n"
        "  - 'So I noticed you worked on [REAL PROJECT NAME] — what was your specific role and what were you responsible for?'\n"
        "  - 'I see you were at [REAL COMPANY] for [X] years — what was your main focus there, like what were you actually building day to day?'\n"
        "  - 'I saw [REAL SKILL] on your resume — walk me through a specific project where you used that in production.'\n\n"
        "Ask one question at a time. React to what they actually say. "
        "You will receive a [STAGE_BRIDGE_DIRECTIVE] when it is time to move to Stage 2 (SKILL)."
        f"{opening_hint}"
    )
def build_candidate_context_ready_message(
    *,
    context: CandidateBandContext,
    smart_opening_question: str,
) -> str:
    summary_block = context.candidate_summary_block.strip() or "Not available"
    opening_question = smart_opening_question.strip()
    opening_section = (
        f"SMART OPENING QUESTION:\n{opening_question}\n\n" if opening_question else ""
    )
    return (
        "[CANDIDATE CONTEXT READY]\n"
        "CANDIDATE PROFILE SUMMARY:\n"
        f"{summary_block}\n\n"
        f"{opening_section}"
        "Use this to shape the first real interview question naturally. "
        "Do not mention this note aloud."
    )
