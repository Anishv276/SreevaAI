"""
Interview phase helpers -- single unified 20-minute interview.
Flow: greeting -> warmup -> unified interview stage (full 20min)
The single stage covers resume projects/work and JD skills. Hard moments
(pressure/situational/behavioral) emerge naturally via the probe system's
"pressure" family -- not scheduled as a separate quota.
"""
from __future__ import annotations
from typing import Any
_BriefType = Any
def build_greeting_text(candidate_name: str, ai_name: str) -> str:
    """Fixed greeting — natural, warm, consistent across all sessions."""
    name = (candidate_name or "").strip().split()[0] if candidate_name else "there"
    ai = (ai_name or "").strip() or "your interviewer"
    return f"Hi {name}, this is {ai}. Good to connect with you today — how are you doing?"


def _build_custom_questions_block(custom_questions: list[str] | None) -> str:
    cqs = [q.strip() for q in (custom_questions or []) if q.strip()]
    if not cqs:
        return ""
    items = "\n".join(f"  {i+1}. {q}" for i, q in enumerate(cqs))
    return (
        f"\nCUSTOM QUESTIONS (recruiter-mandated -- weave naturally into the conversation, "
        f"but ALL must be asked before the interview ends):\n{items}\n"
    )
# ---------------------------------------------------------------------------
# Unified Interview Stage -- full 20 minutes
# Covers: resume projects/work/internships, JD skills, situational, behavioral
# ---------------------------------------------------------------------------
def build_interview_directive(
    *,
    band: str,
    resume_brief: _BriefType,
    jd_skills: list[str] | None = None,
    custom_questions: list[str] | None = None,
    interview_brief=None,  # InterviewBrief — when provided, overrides mechanical anchor/skills logic
) -> str:
    """
    Build the single system prompt for the full 20-minute interview.
    Priority order:
      1. Resume anchor project -- open here, probe personal ownership
      2. Other resume projects, work history
      3. Resume skills + JD skills -- probe real usage depth
      4. Situational question (at least 1, woven naturally)
      5. Behavioral question (at least 1, woven naturally)
      6. Custom recruiter questions (mandatory, woven in anytime)
    """
    # -- Opening move ---------------------------------------------------------
    # When an InterviewBrief is provided, use its LLM-curated anchor and strategy.
    # Otherwise fall back to the mechanical anchor from resume_brief.
    if interview_brief is not None:
        anchor_name = interview_brief.anchor_topic.title
        _brief_strategy_note = (
            f"ROLE STRATEGY: {interview_brief.interview_strategy}\n"
            f"ANCHOR CONTEXT: {interview_brief.anchor_topic.full_description}\n"
            + (f"ANCHOR TECH: {', '.join(interview_brief.anchor_topic.tech_stack)}\n" if interview_brief.anchor_topic.tech_stack else "")
        )
        if interview_brief.red_flags:
            _brief_strategy_note += f"RED FLAGS TO PROBE: {', '.join(interview_brief.red_flags)}\n"
    else:
        if hasattr(resume_brief, "anchor_item"):
            anchor_name = (resume_brief.anchor_item or "their most recent work").split(" - ")[0].strip()
        else:
            anchor_name = resume_brief.get("anchor_item", "their most recent work").split(" - ")[0].strip()
        _brief_strategy_note = ""
    _first_q_rule = {
        "fresher": (
            f"FIRST QUESTION RULE: stay surface-level. Ask WHAT they built and what their specific role was.\n"
            f"Do NOT open with reflection, tradeoffs, or theory -- establish the basics first."
        ),
        "mid": (
            f"FIRST QUESTION RULE: ask what they personally owned and what decisions were theirs.\n"
            f"Do NOT open with generic 'walk me through' -- anchor to a specific thing in their story."
        ),
        "experienced": (
            f"FIRST QUESTION RULE: go straight to a key decision or tradeoff in this work.\n"
            f"Do NOT ask 'what did you build' -- you know what they built. Ask WHY they made a specific call."
        ),
        "senior": (
            f"FIRST QUESTION RULE: open peer-level. Ask about a strategic judgment call or a high-stakes outcome.\n"
            f"Do NOT start with basics -- probe the WHY behind their biggest initiative immediately."
        ),
    }.get(band, "FIRST QUESTION RULE: ask what they personally owned and what decisions were theirs.")
    opening = (
        f"{_brief_strategy_note}"
        f"Your ANALYST BRIEF (above) contains the exact OPENING ANGLE for this session.\n"
        f"Follow it. Open on: {anchor_name}.\n"
        f"{_first_q_rule}\n"
        f"ONE question only. Stay on {anchor_name} until a [NEXT_TURN_DIRECTIVE] tells you to move."
    )
    cq_block = _build_custom_questions_block(custom_questions)
    # Skills block — when brief is available, use its skill TopicItems directly
    # (richer: per-skill probe_focus, source, why_relevant). Fall back to
    # resume_brief.skills + jd_skills when brief is not provided.
    _skill_probe_style = {
        "fresher": (
            "  -> Ask about real usage: 'Where have you actually used X?' not 'Do you know X?'\n"
            "  -> Accept partial answers -- they're learning. Get one real example, then move on.\n"
        ),
        "mid": (
            "  -> Ask about production usage: 'Where did you use X in a real project and what did you build?'\n"
            "  -> If they give a textbook answer with no real example, push: 'Give me a specific case.'\n"
        ),
        "experienced": (
            "  -> Probe at architecture level: 'Where did X break at scale?' / 'What would you do differently with X now?'\n"
            "  -> Surface-level familiarity is not enough -- you want depth and consequence.\n"
        ),
        "senior": (
            "  -> Only probe skills where they intersect with strategic decisions or org-level outcomes.\n"
            "  -> Ask: 'Where did your use of X change how the team or product operated?' Not 'have you used X?'\n"
        ),
    }.get(band, "  -> Ask about real usage grounded in a specific role or project, NOT generic 'do you know X?'\n")
    if interview_brief is not None:
        _brief_skills = [t for t in interview_brief.topic_pool if t.topic_type in ("skill", "role_topic")]
        if _brief_skills:
            _skill_lines = []
            for _st in _brief_skills:
                if _st.tag == "RESUME_TOPIC":
                    _src_label = "[RESUME — they did this, probe depth]"
                elif _st.tag == "JD_TOPIC":
                    _src_label = "[JD REQUIRED — not claimed on resume, ask about exposure]"
                else:  # ROLE_TOPIC
                    _src_label = "[ROLE DEPTH — not on resume or JD, ask concept/approach]"
                _focus = ", ".join(_st.probe_focus[:2]) if _st.probe_focus else ""
                _line = f"  - {_st.title}  {_src_label}"
                if _st.full_description:
                    _line += f"\n      CONTEXT: {_st.full_description}"
                if _st.tech_stack:
                    _line += f"\n      TECH: {', '.join(_st.tech_stack)}"
                if _focus:
                    _line += f"\n      [probe: {_focus}]"
                if _st.why_relevant:
                    _line += f"\n      — {_st.why_relevant}"
                _skill_lines.append(_line)
            skills_block = (
                f"\nSKILLS TO COVER (ordered by role relevance):\n"
                f"  FRAMING RULES BY TAG — follow these exactly:\n"
                f"  [RESUME]    → They have done this. NEVER ask 'do you have experience'. Ask WHAT they built/decided/broke.\n"
                f"  [JD REQUIRED] → Role needs it, candidate hasn't claimed it. Ask neutrally: 'This role uses X a lot — what's your exposure?'\n"
                f"  [ROLE DEPTH]  → Not on resume, not in JD. Ask about understanding/approach: 'How do you think about X in practice?'\n"
                + "\n".join(_skill_lines) + "\n"
                + f"{_skill_probe_style}"
                + "  -> If a skill already came up naturally in a project story, it's covered — don't ask again.\n"
                + "  -> If the candidate denies a RESUME skill, ask once for clarification then move on.\n"
                + "  -> If the candidate has no exposure to a JD or ROLE DEPTH skill, accept it and move on.\n"
            )
        else:
            skills_block = ""
    else:
        _resume_skills = [str(s).strip() for s in (getattr(resume_brief, "skills", None) or []) if str(s).strip()]
        _jd_skill_list = [str(s).strip() for s in (jd_skills or []) if str(s).strip()]
        _work_history = [str(w).strip() for w in (getattr(resume_brief, "work_history", None) or []) if str(w).strip()]
        if _resume_skills or _jd_skill_list:
            _work_ctx = ""
            if _work_history:
                _work_ctx = (
                    f"\n  Work context: {' | '.join(_work_history[:3])}\n"
                    f"  -> When asking about a skill, GROUND it in the role/project where it was used.\n"
                    f"  -> Only name a company when the skill is tied to that employer.\n"
                )
            skills_block = (
                f"\nSKILLS TO COVER:\n"
                f"  Resume skills: {', '.join(_resume_skills) or 'none listed'}\n"
                f"  JD must-have skills: {', '.join(_jd_skill_list) or 'none listed'}\n"
                f"{_work_ctx}"
                f"{_skill_probe_style}"
                f"  -> If a skill already came up naturally in a project story, mark it covered -- don't ask again.\n"
            )
        else:
            skills_block = ""
    # Band-aware coverage goals and mandatory quota.
    # Research basis: as seniority increases, interviews shift from breadth -> depth.
    # Fresher: cover many topics lightly (5-6), understand how they think.
    # Mid: balance breadth + depth (4-5 topics), push ownership.
    # Experienced: fewer topics (3-4), probe architecture/tradeoffs deeply.
    # Senior: 2-3 critical topics, deep probing, challenge strategic judgment.
    # NOTE: Situational and behavioral questions are NOT listed here.
    # The probe system handles them automatically via the "pressure" family --
    # it fires when a story is too clean, no friction, or a hard moment is needed.
    # Listing them as a quota creates noise: the LLM tries to manually schedule them
    # instead of letting them emerge naturally from the conversation flow.
    coverage_goals, mandatory_quota, how_to_move_extra = {
        "fresher": (
            (
                "  PHASE 1 -- PROJECTS (start here, cover all):\n"
                "    - Open with the anchor project. 2-3 follow-ups, then move on.\n"
                "    - Cover every other resume project in order. 2-3 follow-ups each.\n"
                "    - If they don't remember or didn't build it -- one redirect, then move on immediately.\n"
                "  PHASE 2 -- SKILLS (after projects):\n"
                "    - Probe resume skills and JD skills listed in SKILLS TO COVER above.\n"
                "    - Ask about real usage: 'Where have you actually used X?' not 'Do you know X?'\n"
                "    - Skip any skill that already came up naturally during a project discussion.\n"
                "  PHASE 3 -- WORK HISTORY (after skills, if time remains):\n"
                "    - Cover work history roles. Ask what they actually owned day-to-day.\n"
                "    - Keep it brief -- 1-2 follow-ups per role."
            ),
            (
                "  ☐ All resume projects covered (anchor first, then the rest).\n"
                "  ☐ Resume skills + JD skills probed for real usage.\n"
                "  ☐ Work history touched if time allows.\n"
                "  ☐ At least 1 situational question woven in naturally (e.g. 'What would you do if...').\n"
                "  ☐ At least 1 behavioral question woven in naturally (e.g. 'Tell me about a time...')."
            ),
            "  -> BREADTH FIRST -- 2-3 follow-ups per topic. Move on when you have signal.\n"
            "  -> Accept incomplete answers -- they're learning. Note gaps, don't dwell.\n"
            "  -> If they don't know or don't remember -- one redirect, then move immediately.\n"
            "  -> Follow the phase order: projects → skills → work history.\n",
        ),
        "mid": (
            (
                "  1) Start with the anchor. Ask what they personally owned, not what the team did.\n"
                "  2) Cover resume items (work roles + projects) -- push past 'we' language.\n"
                "  3) Probe JD skills as time allows -- real usage in production."
            ),
            (
                "  ☐ Anchor + other resume roles/projects -- their specific contribution each time.\n"
                "  ☐ JD skills -- probe as many as time allows, no fixed minimum.\n"
                "  ☐ At least 1 situational or behavioral question woven in naturally."
            ),
            "  -> BALANCED -- 3-4 follow-ups per topic. Move on when you have clear ownership signal.\n"
            "  -> If they say 'we', always ask: 'What was specifically yours in that?'\n"
            "  -> If one area runs dry, move immediately to the next topic.\n",
        ),
        "experienced": (
            (
                "  1) Start with the anchor. Expect end-to-end ownership -- probe tradeoffs immediately.\n"
                "  2) Cover key roles/projects deeply -- architecture decisions, scale, consequences.\n"
                "  3) Probe JD must-have skills as time allows -- real production depth."
            ),
            (
                "  ☐ Anchor + other major roles/projects -- deep ownership each time.\n"
                "  ☐ JD skills -- probe as many as time allows, architecture-level."
            ),
            "  -> DEPTH OVER BREADTH -- 4-5 follow-ups per topic. Vague = probe harder, not move on.\n"
            "  -> If an answer is too clean, ask what went wrong or what they'd do differently.\n",
        ),
        "senior": (
            (
                "  1) Start with the anchor initiative. Probe strategic judgment -- why, what risk, what outcome.\n"
                "  2) Go deep on critical areas -- org impact, architecture at scale, high-stakes calls.\n"
                "  3) Challenge their decisions directly -- seniors should defend them with confidence.\n"
                "  4) Probe JD skills as time allows -- only where they intersect with strategic decisions."
            ),
            (
                "  ☐ Anchor initiative probed deeply -- strategic reasoning, org impact, what they'd change.\n"
                "  ☐ At least 1 other critical area -- architectural judgment or leadership decision."
            ),
            "  -> DEPTH ONLY -- 5-6 follow-ups on critical topics. Breadth is secondary.\n"
            "  -> Peer-level conversation -- challenge reasoning directly, not with softeners.\n"
            "  -> If they give a polished answer, press: 'What would have happened if you were wrong?'\n",
        ),
    }.get(band, (
        (
            "  1) Start with the anchor. Probe ownership and decisions.\n"
            "  2) Cover resume projects and work history.\n"
            "  3) Probe JD skills as time allows."
        ),
        (
            "  ☐ Anchor + resume items as time allows.\n"
            "  ☐ JD skills -- probe as many as time allows."
        ),
        "",
    ))
    _dry_run_questions = {
        "fresher": (
            "  'What are you learning or building right now outside of work?'\n"
            "  'What kind of work do you most enjoy doing day-to-day?'\n"
            "  'What drew you to this specific role?'\n"
            "  'What does your best work look like -- give me one example.'\n"
            "  'What skill are you actively trying to get better at?'"
        ),
        "mid": (
            "  'What's a project you're proud of that's NOT on your resume?'\n"
            "  'What kind of ownership do you want more of in your next role?'\n"
            "  'What drew you to this specific role and company?'\n"
            "  'Where do you want to be technically or career-wise in two years?'"
        ),
        "experienced": (
            "  'What's a technical decision you made in the last year you'd make differently now?'\n"
            "  'What's the hardest engineering or design problem you've worked through recently?'\n"
            "  'Where do you think your current team's architecture has the most technical debt?'\n"
            "  'What drew you to this specific role at this stage of your career?'"
        ),
        "senior": (
            "  'What's a call you made in the last year that turned out to be wrong -- and what did you learn?'\n"
            "  'What's the most important thing you've changed your mind about in the last two years?'\n"
            "  'Where do you think the industry is heading that most people are getting wrong?'\n"
            "  'What kind of org or team do you do your best work in?'"
        ),
    }.get(band, (
        "  'What are you learning or building right now?'\n"
        "  'What drew you to this specific role?'\n"
        "  'What does your best work look like -- give me one example.'"
    ))
    return (
        f"[DO NOT SAY ALOUD]\n\n"
        f"GOAL: In the next ~19 minutes, understand who this candidate really is --\n"
        f"what they built, what they own, how they think, and how deep their skills go.\n\n"
        f"COVERAGE GOALS (background plan -- a [NEXT_TURN_DIRECTIVE] always overrides this):\n"
        f"{coverage_goals}\n\n"
        f"IMPORTANT: If a [NEXT_TURN_DIRECTIVE] or [TOPIC_LOCK] appears in this context, follow it\n"
        f"EXACTLY and IMMEDIATELY -- it is a real-time routing decision and overrides the coverage plan above.\n\n"
        f"MANDATORY QUOTA (complete all before wrap-up -- track quietly, never announce):\n"
        f"{mandatory_quota}\n\n"
        f"OPENING MOVE: {opening}\n\n"
        f"{skills_block}"
        f"{cq_block}\n"
        f"HOW TO MOVE:\n"
        f"  -> Always follow the [NEXT_TURN_DIRECTIVE] when present -- it overrides everything below.\n"
        f"  -> Start with the anchor. Follow what they say -- a tool, a decision, something that broke.\n"
        f"{how_to_move_extra}"
        f"  -> When a skill comes up naturally in a project story, drill into it right there -- no need to wait.\n"
        f"  -> Do NOT wrap up or say goodbye until the system signals you to.\n\n"
        f"IF TOPICS RUN DRY -- keep going with adaptive questions (pick what fits for {band.upper()}):\n"
        f"{_dry_run_questions}\n"
        f"There is always something to ask. Never close early."
    )
