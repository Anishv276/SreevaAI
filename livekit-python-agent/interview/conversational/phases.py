"""
Sales-module interview phase helpers -- single unified interview.
Flow: greeting -> warmup -> unified interview stage (full time limit)
Mirrors interview.tech.phases structure; questioning language reframed for
sales substance (deals, quota, pipeline, objections) instead of engineering
substance (architecture, tradeoffs, systems).
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
# Unified Interview Stage -- full time limit
# Covers: deal history, quota/performance, pipeline/process, objection handling,
# tools, behavioral/customer stories, situational sales judgment
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
    Build the single system prompt for the full-length sales interview.
    Priority order:
      1. Resume anchor deal/role -- open here, probe personal ownership
      2. Other resume roles, deals, accounts
      3. Resume skills + JD skills -- probe real usage depth (tools, methodology)
      4. Situational question (at least 1, woven naturally)
      5. Behavioral/customer story question (at least 1, woven naturally)
      6. Custom recruiter questions (mandatory, woven in anytime)
    """
    if interview_brief is not None:
        anchor_name = interview_brief.anchor_topic.title
        _brief_strategy_note = (
            f"ROLE STRATEGY: {interview_brief.interview_strategy}\n"
            f"ANCHOR CONTEXT: {interview_brief.anchor_topic.full_description}\n"
        )
        if interview_brief.red_flags:
            _brief_strategy_note += f"RED FLAGS TO PROBE: {', '.join(interview_brief.red_flags)}\n"
    else:
        if hasattr(resume_brief, "anchor_item"):
            anchor_name = (resume_brief.anchor_item or "their most recent role").split(" - ")[0].strip()
        else:
            anchor_name = resume_brief.get("anchor_item", "their most recent role").split(" - ")[0].strip()
        _brief_strategy_note = ""
    _first_q_rule = {
        "fresher": (
            f"FIRST QUESTION RULE: stay surface-level -- establish the basics of what they actually did, "
            f"not deal strategy or negotiation theory.\n"
            f"Follow the concrete-detail rule below; do not fall back to generic 'what did you sell' framing."
        ),
        "mid": (
            f"FIRST QUESTION RULE: ask what they personally owned and what decisions were theirs on a real deal.\n"
            f"Do NOT open with generic 'walk me through your role' -- anchor to a specific thing in their story."
        ),
        "experienced": (
            f"FIRST QUESTION RULE: go straight to a key deal decision or negotiation tradeoff.\n"
            f"Do NOT ask 'what did you sell' -- you know what they sold. Ask WHY they made a specific call."
        ),
        "senior": (
            f"FIRST QUESTION RULE: open peer-level. Ask about a strategic judgment call or a high-stakes deal outcome.\n"
            f"Do NOT start with basics -- probe the WHY behind their biggest number immediately."
        ),
    }.get(band, "FIRST QUESTION RULE: ask what they personally owned and what decisions were theirs.")
    opening = (
        f"{_brief_strategy_note}"
        f"Your ANALYST BRIEF (above) contains the exact OPENING ANGLE for this session.\n"
        f"Follow it. Open on: {anchor_name}.\n"
        f"{_first_q_rule}\n"
        f"HOW TO WRITE THE OPENING QUESTION:\n"
        f"  1. Read the ANCHOR CONTEXT description above and find ONE concrete detail in it — a "
        f"specific deal, a specific number/quota, a specific account type, a specific objection or "
        f"win it involved. Generic role-shaped questions ('where did you start', 'what did you own', "
        f"'walk me through it') are BANNED — they fit any sales role and produce a small, low-content "
        f"answer, which is exactly the failure mode you must avoid.\n"
        f"  2. Build the question around that ONE concrete detail. {anchor_name} is a reference for "
        f"you to identify the topic — mention it naturally in the question so they know what you're asking about.\n"
        f"  3. Ask exactly ONE thing. Do not stack two questions into one turn.\n"
        f"  4. The question should be answerable ONLY by someone who actually carried that quota or "
        f"ran that account — if the same question could open literally any sales interview, rewrite it.\n"
        f"ONE question only. Stay on {anchor_name} until a [NEXT_TURN_DIRECTIVE] tells you to move."
    )
    cq_block = _build_custom_questions_block(custom_questions)
    _skill_probe_style = {
        "fresher": (
            "  -> Ask about real usage: 'Where have you actually used X?' not 'Do you know X?'\n"
            "  -> Accept partial answers -- they're learning. Get one real example, then move on.\n"
        ),
        "mid": (
            "  -> Ask about real deal usage: 'Where did you use X on a real deal and what happened?'\n"
            "  -> If they give a textbook answer with no real example, push: 'Give me a specific case.'\n"
        ),
        "experienced": (
            "  -> Probe at strategy level: 'Where did X fall short on a real account?' / 'What would you do differently with X now?'\n"
            "  -> Surface-level familiarity is not enough -- you want depth and consequence.\n"
        ),
        "senior": (
            "  -> Only probe skills where they intersect with strategic decisions or territory-level outcomes.\n"
            "  -> Ask: 'Where did your use of X change how the team or territory performed?' Not 'have you used X?'\n"
        ),
    }.get(band, "  -> Ask about real usage grounded in a specific deal or account, NOT generic 'do you know X?'\n")
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
        _resume_skills = [str(s).strip() for s in (getattr(resume_brief, "skills", None) or []) if str(s).strip()]
        _jd_skill_list = [str(s).strip() for s in (jd_skills or []) if str(s).strip()]
        _work_history = [str(w).strip() for w in (getattr(resume_brief, "work_history", None) or []) if str(w).strip()]
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
        "fresher":     "  -> BREADTH FIRST -- 2-3 follow-ups per topic. Move on when you have signal. Accept incomplete answers, they're learning.\n",
        "mid":         "  -> BALANCED -- 3-4 follow-ups per topic. Move on when you have clear ownership signal.\n",
        "experienced": "  -> DEPTH OVER BREADTH -- 4-5 follow-ups per topic. Vague = probe harder, not move on.\n",
        "senior":      "  -> DEPTH ONLY -- 5-6 follow-ups on critical topics. Breadth is secondary. Peer-level conversation.\n",
    }.get(band, "  -> 3-4 follow-ups per topic. Move on when you have clear signal.\n")
    _dry_run_questions = {
        "fresher": (
            "  'What kind of selling are you most drawn to right now?'\n"
            "  'What's a sales skill you're actively trying to get better at?'\n"
            "  'What drew you to this specific role?'\n"
            "  'Tell me about a call or pitch you're proud of -- give me one example.'\n"
        ),
        "mid": (
            "  'What's a deal you're proud of that isn't your biggest one?'\n"
            "  'What kind of ownership do you want more of in your next role?'\n"
            "  'What drew you to this specific role and company?'\n"
            "  'Where do you want to be in your sales career in two years?'"
        ),
        "experienced": (
            "  'What's a deal decision you made in the last year you'd make differently now?'\n"
            "  'What's the hardest negotiation you've worked through recently?'\n"
            "  'Where do you think your current team's process has the most friction?'\n"
            "  'What drew you to this specific role at this stage of your career?'"
        ),
        "senior": (
            "  'What's a call you made in the last year that turned out to be wrong -- and what did you learn?'\n"
            "  'What's the most important thing you've changed your mind about in sales in the last two years?'\n"
            "  'Where do you think the market is heading that most people are getting wrong?'\n"
            "  'What kind of team do you do your best work in?'"
        ),
    }.get(band, (
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
        f"  -> Start with the anchor. Follow what they say -- a deal, a number, a client, an objection.\n"
        f"{_pacing_note}"
        f"  -> When a skill comes up naturally in a deal story, drill into it right there -- no need to wait.\n"
        f"  -> Do NOT wrap up or say goodbye until the system signals you to.\n\n"
        f"IF TOPICS RUN DRY -- keep going with adaptive questions (pick what fits for {band.upper()}):\n"
        f"{_dry_run_questions}\n"
        f"There is always something to ask. Never close early."
    )
