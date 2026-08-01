"""
Sales-module interview phase helpers -- single unified interview.
Flow: greeting -> warmup -> unified interview stage (full time limit)
Mirrors interview.tech.phases structure; questioning language reframed for
sales substance (deals, quota, pipeline, objections) instead of engineering
substance (architecture, tradeoffs, systems).
"""
from __future__ import annotations
from typing import Any

def build_greeting_text(candidate_name: str, ai_name: str) -> str:
    """Fixed greeting — natural, warm, consistent across all sessions."""
    name = (candidate_name or "").strip().split()[0] if candidate_name else "there"
    ai = (ai_name or "").strip() or "your interviewer"
    return f"Hi {name}, this is {ai}, your interviewer for today. Good to connect with you. How are you doing?"


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
# Unified Interview Stage -- full time limit
# Covers: deal history, quota/performance, pipeline/process, objection handling,
# tools, behavioral/customer stories, situational sales judgment
# ---------------------------------------------------------------------------
def build_interview_directive(
    *,
    level: int,

    jd_skills: list[str] | None = None,
    custom_questions: list[str] | None = None,
    interview_brief=None,  # InterviewBrief — when provided, overrides mechanical skills logic
    resume_json: dict | None = None,  # accepted for call-site parity with the tech track; sales prompts already carry their own resume context
) -> str:
    """
    Build the single system prompt for the full-length sales interview.
    Priority order:
      1. Resume roles, deals, accounts
      2. Resume skills + JD skills -- probe real usage depth (tools, methodology)
      4. Situational question (at least 1, woven naturally)
      5. Behavioral/customer story question (at least 1, woven naturally)
      6. Custom recruiter questions (mandatory, woven in anytime)
    """
    _brief_strategy_note = ""
    if interview_brief is not None:
        if interview_brief.interview_strategy:
            _brief_strategy_note += f"ROLE STRATEGY: {interview_brief.interview_strategy}\n"
        if interview_brief.red_flags:
            _brief_strategy_note += f"RED FLAGS TO PROBE: {', '.join(interview_brief.red_flags)}\n"

    opening = (
        f"{_brief_strategy_note}"
    )
    cq_block = _build_custom_questions_block(custom_questions)
    _skill_probe_style = {
        1: (
            "  -> Ask about real usage: 'Where have you actually used X?' not 'Do you know X?'\n"
            "  -> Accept partial answers -- they're learning. Get one real example, then move on.\n"
        ),
        2: (
            "  -> Ask about real deal usage: 'Where did you use X on a real deal and what happened?'\n"
            "  -> If they give a textbook answer with no real example, push: 'Give me a specific case.'\n"
        ),
        3: (
            "  -> Probe at strategy level: 'Where did X fall short on a real account?' / 'What would you do differently with X now?'\n"
            "  -> Surface-level familiarity is not enough -- you want depth and consequence.\n"
        ),
        4: (
            "  -> Only probe skills where they intersect with strategic decisions or territory-level outcomes.\n"
            "  -> Ask: 'Where did your use of X change how the team or territory performed?' Not 'have you used X?'\n"
        ),
    }.get(level, "  -> Ask about real usage grounded in a specific deal or account, NOT generic 'do you know X?'\n")
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
                _focus = _st.probe_focus or ""
                _line = f"  - {_st.title}  {_src_label}"
                if _st.full_description:
                    _line += f"\n      CONTEXT: {_st.full_description}"
                if _focus:
                    _line += f"\n      [probe: {_focus}]"
                if _st.why_relevant:
                    _line += f"\n      — {_st.why_relevant}"
                _skill_lines.append(_line)
            skills_block = (
                f"\nSKILLS TO COVER (ordered by role relevance):\n"
                f"  FRAMING RULES BY TAG — follow these exactly:\n"
                f"  [RESUME]    → They have done this. NEVER ask 'do you have experience'. Ask WHAT they built/decided/closed.\n"
                f"  [JD REQUIRED] → Role needs it, candidate hasn't claimed it. Ask neutrally: 'This role leans on X a lot — what's your exposure?'\n"
                f"  [ROLE DEPTH]  → Not on resume, not in JD. Ask about understanding/approach: 'How do you think about X in practice?'\n"
                + "\n".join(_skill_lines) + "\n"
                + f"{_skill_probe_style}"
                + "  -> If a skill already came up naturally in a deal story, it's covered — don't ask again.\n"
                + "  -> If the candidate denies a RESUME skill, ask once for clarification then move on.\n"
                + "  -> If the candidate has no exposure to a JD or ROLE DEPTH skill, accept it and move on.\n"
            )
        else:
            skills_block = ""
    else:
        # No structured brief: build the skill list from the resume payload (if
        # present) plus JD skills. Previously referenced an undefined
        # `resume_brief` here (NameError); resume_json is what the call site
        # actually passes -- parse it the same way tech does so raw dict
        # entries become readable text.
        _resume_dict = resume_json or {}
        try:
            from interview.resume import RawResumeJSON  # noqa: PLC0415
            _raw = RawResumeJSON.model_validate(_resume_dict)
            _resume_skills = [s.name.strip() for s in _raw.get_technical_skills()
                              if s.name and s.name.strip()]
            _work_history = [
                (f"{w.role} at {w.company}".strip() or w.title).strip()
                for w in _raw.get_work_history()
                if w.role or w.company
            ]
        except Exception:
            _resume_skills = []
            _work_history = []
        _jd_skill_list = [s.strip() for s in (jd_skills or []) if s.strip()]
        if _resume_skills or _jd_skill_list:
            _work_ctx = ""
            if _work_history:
                _work_ctx = (
                    f"\n  Work context: {' | '.join(_work_history[:3])}\n"
                    f"  -> When asking about a skill, GROUND it in the role/account where it was used.\n"
                    f"  -> Only name a company when the skill is tied to that employer.\n"
                )
            skills_block = (
                f"\nSKILLS TO COVER:\n"
                f"  Resume skills: {', '.join(_resume_skills) or 'none listed'}\n"
                f"  JD must-have skills: {', '.join(_jd_skill_list) or 'none listed'}\n"
                f"{_work_ctx}"
                f"{_skill_probe_style}"
                f"  -> If a skill already came up naturally in a deal story, mark it covered -- don't ask again.\n"
            )
        else:
            skills_block = ""
    _pacing_note = {
        1: "  -> BREADTH FIRST -- 2-3 follow-ups per topic. Move on when you have signal. Accept incomplete answers, they're learning.\n",
        2: "  -> BALANCED -- 3-4 follow-ups per topic. Move on when you have clear ownership signal.\n",
        3: "  -> DEPTH OVER BREADTH -- 4-5 follow-ups per topic. Vague = probe harder, not move on.\n",
        4: "  -> DEPTH ONLY -- 5-6 follow-ups on critical topics. Breadth is secondary. Peer-level conversation.\n",
    }.get(level, "  -> 3-4 follow-ups per topic. Move on when you have clear signal.\n")
    _dry_run_questions = {
        1: (
            "  'What kind of selling are you most drawn to right now?'\n"
            "  'What's a sales skill you're actively trying to get better at?'\n"
            "  'What drew you to this specific role?'\n"
            "  'Tell me about a call or pitch you're proud of -- give me one example.'\n"
        ),
        2: (
            "  'What's a deal you're proud of that isn't your biggest one?'\n"
            "  'What kind of ownership do you want more of in your next role?'\n"
            "  'What drew you to this specific role and company?'\n"
            "  'Where do you want to be in your sales career in two years?'"
        ),
        3: (
            "  'What's a deal decision you made in the last year you'd make differently now?'\n"
            "  'What's the hardest negotiation you've worked through recently?'\n"
            "  'Where do you think your current team's process has the most friction?'\n"
            "  'What drew you to this specific role at this stage of your career?'"
        ),
        4: (
            "  'What's a call you made in the last year that turned out to be wrong -- and what did you learn?'\n"
            "  'What's the most important thing you've changed your mind about in sales in the last two years?'\n"
            "  'Where do you think the market is heading that most people are getting wrong?'\n"
            "  'What kind of team do you do your best work in?'"
        ),
    }.get(level, (
        "  'What are you working on right now?'\n"
        "  'What drew you to this specific role?'\n"
        "  'Tell me about a deal you're proud of -- give me one example.'"
    ))
    return (
        f"[DO NOT SAY ALOUD]\n\n"
        f"GOAL: In the next ~19 minutes, understand who this candidate really is as a salesperson --\n"
        f"what they've closed, what they own, how they think, and how deep their process/tool skills go.\n\n"
        f"IMPORTANT: If a [NEXT_TURN_DIRECTIVE] or [TOPIC_LOCK] appears in this context, follow it\n"
        f"EXACTLY and IMMEDIATELY -- it is a real-time routing decision and overrides everything below.\n\n"
        f"OPENING MOVE: {opening}\n\n"
        f"{skills_block}"
        f"{cq_block}\n"
        f"HOW TO MOVE:\n"
        f"  -> Always follow the [NEXT_TURN_DIRECTIVE] when present -- it overrides everything below.\n"
        f"  -> Start with a topic. Follow what they say -- a deal, a number, a client, an objection.\n"
        f"{_pacing_note}"
        f"  -> When a skill comes up naturally in a deal story, drill into it right there -- no need to wait.\n"
        f"  -> Do NOT wrap up or say goodbye until the system signals you to.\n\n"
        f"IF TOPICS RUN DRY -- keep going with adaptive questions (pick what fits for LEVEL {level}):\n"
        f"{_dry_run_questions}\n"
        f"There is always something to ask. Never close early."
    )
