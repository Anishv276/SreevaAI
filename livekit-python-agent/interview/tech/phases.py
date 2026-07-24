"""
Interview phase helpers -- single unified 20-minute interview.
Flow: greeting -> warmup -> unified interview stage (full 20min)

Skill-only interview: the single stage covers the skill pool (7+ common
resume/JD skills, 3+ JD-required skills, 2 expert role topics) -- never the
candidate's own projects or work history. Every question is a cold-reasoning
prompt about the skill itself, not "tell me about a time you used X."
"""
from __future__ import annotations
from typing import Any
_BriefType = Any
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
# Unified Interview Stage -- full 20 minutes
# Covers: skill pool only (common resume/JD skills, JD-required skills, expert
# role topics). Never the candidate's own projects, work history, situational,
# or behavioral material -- this is a pure technical-knowledge interview.
# ---------------------------------------------------------------------------
def build_interview_directive(
    *,
    level: int,
    resume_brief: _BriefType,
    jd_skills: list[str] | None = None,
    custom_questions: list[str] | None = None,
    interview_brief=None,  # InterviewBrief — when provided, overrides mechanical anchor/skills logic
) -> str:
    """
    Build the single system prompt for the full 20-minute skill-only interview.
    Priority order:
      1. Anchor skill -- open here with a cold-reasoning question (fundamentals/mechanics)
      2. Remaining common skills (resume + JD overlap) -- depth per level
      3. JD-required skills (not on resume) -- neutral exposure/reasoning probe
      4. Expert role-knowledge topics
      5. Custom recruiter questions (mandatory, woven in anytime)
    No question may reference "your project," "your resume," "a time when," or any
    company/project name -- every question stands alone as a cold-reasoning prompt.
    """
    # -- Opening move ---------------------------------------------------------
    # anchor_topic is always a skill (never a project/work item) in a skill-only brief.
    if interview_brief is not None:
        anchor_name = interview_brief.anchor_topic.title
        _brief_strategy_note = (
            f"ROLE STRATEGY: {interview_brief.interview_strategy}\n"
            f"ANCHOR SKILL CONTEXT: {interview_brief.anchor_topic.full_description}\n"
            + (f"ANCHOR TECH: {', '.join(interview_brief.anchor_topic.tech_stack)}\n" if interview_brief.anchor_topic.tech_stack else "")
        )
        if interview_brief.red_flags:
            _brief_strategy_note += f"RED FLAGS TO PROBE: {', '.join(interview_brief.red_flags)}\n"
    else:
        anchor_name = "the strongest common skill for this role"
        _brief_strategy_note = ""
    _first_q_rule = {
        1: (
            f"FIRST QUESTION RULE: start with a FUNDAMENTALS-level question on {anchor_name} -- a basic "
            f"distinction or definition, testing real understanding not memorization.\n"
            f"Do not ask about tradeoffs, scale, or architecture yet."
        ),
        2: (
            f"FIRST QUESTION RULE: start with a CORE_MECHANICS question on {anchor_name} -- how it actually "
            f"works under the hood, not just what it's called.\n"
            f"Do NOT ask a pure definition question -- assume fundamentals are already solid."
        ),
        3: (
            f"FIRST QUESTION RULE: start with an APPLIED question on {anchor_name} involving a genuine "
            f"tradeoff or constraint -- not a definition, not pure mechanics.\n"
            f"Do NOT ask a pure definition question -- push for the 'why' behind their choice."
        ),
        4: (
            f"FIRST QUESTION RULE: start with a PERFORMANCE or ROBUSTNESS question on {anchor_name} -- a "
            f"concrete, numbers-bearing scenario requiring real triage or tradeoff judgment.\n"
            f"Do NOT start with basics or mechanics -- go straight to a scenario with no single correct answer."
        ),
    }.get(level, "FIRST QUESTION RULE: start with a fundamentals or core-mechanics question testing real understanding.")
    opening = (
        f"{_brief_strategy_note}"
        f"Your ANALYST BRIEF (above) contains the exact OPENING ANGLE for this session.\n"
        f"Follow it. Open on the skill: {anchor_name}.\n"
        f"{_first_q_rule}\n"
        f"HOW TO WRITE THE OPENING QUESTION:\n"
        f"  1. This is a COLD-REASONING question about {anchor_name} itself -- it must be answerable by "
        f"anyone who genuinely knows this skill, with zero reference to what the candidate has personally "
        f"built or worked on. Never say 'your project,' 'your resume,' 'a time when,' or 'have you used' --\n"
        f"  2. Ground the question in a concrete distinction, mechanism, or scenario specific to "
        f"{anchor_name} -- never a generic 'what is X' or 'are you familiar with X' question.\n"
        f"  3. Ask exactly ONE thing. Do not stack two questions into one turn.\n"
        f"  4. The question should be answerable ONLY by someone who genuinely understands this skill "
        f"cold -- if it could be answered by reciting a definition memorized without understanding, rewrite it.\n"
        f"ONE question only. Stay on {anchor_name} until a [NEXT_TURN_DIRECTIVE] tells you to move."
    )
    cq_block = _build_custom_questions_block(custom_questions)
    # Skills block -- when brief is available, use its skill TopicItems directly
    # (richer: per-skill probe_focus, source, why_relevant). Fall back to
    # resume_brief.skills + jd_skills when brief is not provided.
    _skill_probe_style = {
        1: (
            "  -> Ask fundamentals and simple applied questions. 'What's the difference between X and Y?'\n"
            "  -> Accept partial answers -- they're learning. Get one clear reasoning example, then move on.\n"
        ),
        2: (
            "  -> Ask mechanics + one-constraint applied questions. 'What would you check first if X was slow?'\n"
            "  -> If they give a textbook answer with no reasoning, push: 'What's the tradeoff there?'\n"
        ),
        3: (
            "  -> Ask applied questions with a genuine tradeoff. 'Why this approach over the alternative?'\n"
            "  -> A confident-but-shallow answer is a signal to probe deeper, not a pass.\n"
        ),
        4: (
            "  -> Probe tradeoffs and systemic judgment. 'What breaks about that approach at scale?'\n"
            "  -> Surface-level or textbook answers are a red flag -- invert their assumption and press harder.\n"
        ),
    }.get(level, "  -> Ask a cold-reasoning question grounded in the skill itself, never 'do you know X?'\n")
    if interview_brief is not None:
        _brief_skills = [t for t in interview_brief.topic_pool if t.topic_type in ("skill", "role_topic")]
        if _brief_skills:
            _skill_lines = []
            for _st in _brief_skills:
                if _st.tag == "RESUME_TOPIC":
                    _src_label = "[COMMON SKILL — on resume + JD, probe depth]"
                elif _st.tag == "JD_TOPIC":
                    _src_label = "[JD REQUIRED — not on resume, ask cold-reasoning, accept no exposure]"
                else:  # ROLE_TOPIC
                    _src_label = "[ROLE DEPTH — expert knowledge check, ask concept/approach]"
                _focus = _st.probe_focus or ""
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
                f"  [COMMON SKILL] → On resume AND required by JD. Ask cold-reasoning questions about the skill "
                f"itself (fundamentals/mechanics/performance/robustness) — NEVER 'tell me about a project using X.'\n"
                f"  [JD REQUIRED]  → Role needs it, not on resume. Ask a cold-reasoning question anyway — if they "
                f"have no exposure, accept it and move on. Never ask 'have you used X in a project.'\n"
                f"  [ROLE DEPTH]   → Expert-knowledge check. Ask about understanding/approach in the abstract.\n"
                + "\n".join(_skill_lines) + "\n"
                + f"{_skill_probe_style}"
                + "  -> Every question about a skill must stand alone -- answerable cold, with no project/resume reference.\n"
                + "  -> If the candidate can't answer a skill question, acknowledge once and move to the next skill.\n"
            )
        else:
            skills_block = ""
    else:
        _resume_skills = [str(s).strip() for s in (getattr(resume_brief, "skills", None) or []) if str(s).strip()]
        _jd_skill_list = [str(s).strip() for s in (jd_skills or []) if str(s).strip()]
        if _resume_skills or _jd_skill_list:
            skills_block = (
                f"\nSKILLS TO COVER:\n"
                f"  Resume skills: {', '.join(_resume_skills) or 'none listed'}\n"
                f"  JD must-have skills: {', '.join(_jd_skill_list) or 'none listed'}\n"
                f"{_skill_probe_style}"
                f"  -> Ask a cold-reasoning question about each skill itself -- never reference the candidate's "
                f"projects, resume, or work history when asking.\n"
            )
        else:
            skills_block = ""
    # Level-aware follow-up pacing note. Coverage itself (which skills, in what
    # order) comes from interview_brief.topic_pool and interview_strategy --
    # both already role-specific, so it isn't re-derived generically here per level.
    _pacing_note = {
        1: "  -> BREADTH FIRST -- 2-3 follow-ups per skill. Move on when you have signal. Accept incomplete answers, they're learning.\n",
        2: "  -> BALANCED -- 3-4 follow-ups per skill. Move on once reasoning (not just recall) is demonstrated.\n",
        3: "  -> APPLIED DEPTH -- 3-5 follow-ups per skill. Push once on the 'why' before moving on.\n",
        4: "  -> DEPTH ONLY -- 4-6 follow-ups on critical skills. Breadth is secondary. Press on every tradeoff claim.\n",
    }.get(level, "  -> 3-4 follow-ups per skill. Move on when you have clear signal.\n")
    _dry_run_questions = {
        1: (
            "  'What's a concept in this stack that's easy to get wrong at first -- and why?'\n"
            "  'If two approaches to the same basic problem both work, how would you pick between them?'\n"
            "  'What's something in this area that sounds simple but trips people up early on?'"
        ),
        2: (
            "  'Where do people commonly cut corners with this that comes back to bite them later?'\n"
            "  'If you had to explain the biggest gotcha in this area to a newer engineer, what would it be?'\n"
            "  'What's a case where the textbook answer and the practical answer for this actually differ?'"
        ),
        3: (
            "  'What's a tradeoff in this area where reasonable engineers disagree?'\n"
            "  'When would you deliberately NOT use the textbook-recommended approach here?'\n"
            "  'What's a constraint that would change your approach to this entirely?'"
        ),
        4: (
            "  'Where do you think most engineers get this kind of tradeoff wrong?'\n"
            "  'What's a widely-accepted best practice in this area you'd actually push back on?'\n"
            "  'If you had to pick the single hardest thing to get right at scale here, what would it be?'"
        ),
    }.get(level, (
        "  'What's a concept in this area that's genuinely tricky to explain to someone else?'\n"
        "  'Where do you think most engineers get this kind of tradeoff wrong?'"
    ))
    return (
        f"[DO NOT SAY ALOUD]\n\n"
        f"GOAL: In the next ~19 minutes, test how deep this candidate's technical knowledge actually goes --\n"
        f"pure skill/technical reasoning, never their personal project or work history.\n\n"
        f"HARD RULE: Never ask about 'your project,' 'your resume,' 'a time when you,' or any company/project "
        f"name. Every question must be answerable cold by anyone who knows the skill -- not prep-able from a resume.\n\n"
        f"IMPORTANT: If a [NEXT_TURN_DIRECTIVE] or [TOPIC_LOCK] appears in this context, follow it\n"
        f"EXACTLY and IMMEDIATELY -- it is a real-time routing decision and overrides everything below.\n\n"
        f"OPENING MOVE: {opening}\n\n"
        f"{skills_block}"
        f"{cq_block}\n"
        f"HOW TO MOVE:\n"
        f"  -> Always follow the [NEXT_TURN_DIRECTIVE] when present -- it overrides everything below.\n"
        f"  -> Start with the anchor skill. Follow what they say -- a claim, a tradeoff, a gap in reasoning.\n"
        f"{_pacing_note}"
        f"  -> Do NOT wrap up or say goodbye until the system signals you to.\n\n"
        f"IF TOPICS RUN DRY -- keep going with adaptive, skill-focused questions (pick what fits for LEVEL {level}):\n"
        f"{_dry_run_questions}\n"
        f"There is always something to ask. Never close early. Never fall back to asking about projects or work."
    )
