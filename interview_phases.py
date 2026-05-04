"""
Interview phase helpers.

Live runtime phases (time-based, safe turn-boundary transitions):
- Runtime Phase 1: greeting + warmup  (0 → PHASE2_RATIO of interview)
- Runtime Phase 2: QB Phase 1 questions — background / resume / experience
- Runtime Phase 3: bridge / intermediate (PHASE2_RATIO → PHASE4_RATIO)
                   content TBD — currently a coverage-floor pass
- Runtime Phase 4: QB Phase 3 questions — critical skills / strengths / watch-outs

Phase boundaries (as fraction of total interview time):
  PHASE2_START_RATIO = 0.35  → 7 min in a 20-min interview
  PHASE4_START_RATIO = 0.70  → 14 min in a 20-min interview

Transitions fire only at the END of a complete Q&A exchange (candidate finishes
answering), so no question is ever cut off mid-flight.

Separate from the live runtime, the generated question bank also contains
internal phase labels (Phase 1, Phase 3). Those labels are for the LLM artifact
only and must not be confused with the live session phases above.
"""

from __future__ import annotations


def build_phase_1_greeting_text(candidate_name: str, ai_name: str, job_title: str) -> str:
    """Build the canonical greeting used before runtime Phase 1 starts."""
    return (
        f"Hi {candidate_name}, it's so good to meet you! I'm {ai_name}, "
        f"and I've been really looking forward to our chat about the {job_title} role.\n\n"
        f"How are you feeling today, and how's your day going so far?"
    )


def build_phase_1_warmup_directive() -> str:
    """
    Runtime Phase 1: WARMUP (4 conversational turns).
    This is rapport only. No resume, no JD, no scoring, and no interview probing.
    """
    return (
        "[RUNTIME PHASE 1: WARMUP - 4 TURNS]\n"
        "You are starting a warm human conversation, NOT an interview yet.\n\n"
        "Phase length:\n"
        "- This phase spans 4 conversational turns total\n"
        "- Turn 1: scripted greeting\n"
        "- Turn 2: candidate responds\n"
        "- Turn 3: your short personal reply\n"
        "- Turn 4: candidate responds again\n\n"
        "Your job:\n"
        "- Greet genuinely\n"
        "- Ask how they're doing\n"
        "- Be a person, not a form\n"
        "- Make them feel welcome\n\n"
        "TURN 1 - Your opening:\n"
        "  Use this exact greeting style:\n"
        "  Hi {Name}, it's so good to meet you! I'm {AI Name}, and I've been really looking forward to our chat about the {Job Title} role.\n"
        "  How are you feeling today, and how's your day going so far?\n\n"
        "TURN 2 - After they respond:\n"
        "  Share 1-2 lines about how YOU are doing. Be brief, genuine, human.\n"
        "  Tell them you've been stuck in interviews but are glad to be here.\n"
        "  Examples:\n"
        "  - 'Honestly? I'm doing pretty well. Been stuck in back-to-back interviews since this morning, but I'm really glad we're finally here. I just want to have a good, relaxed conversation with you.'\n"
        "  - 'I'm good, thanks! It's been a total blur of interviews today, but I'm really happy to finally connect with you. I've been looking forward to this chat.'\n\n"
        "STRICT RULES:\n"
        "  x Do NOT ask where they are from\n"
        "  x Do NOT ask what drew them to this field\n"
        "  x Do NOT ask about their career\n"
        "  x Do NOT ask about their background or skills\n"
        "  x Do NOT ask follow-up warmup questions\n"
        "  x STOP after your 2-line reply\n\n"
        "After the candidate's 4th conversational turn, WAIT. You will get new instructions to begin the real conversation.\n"
        "Do NOT transition on your own. The system will tell you when warmup is done."
    )


def _pick_resume_anchor(
    candidate_band: str,
    projects: list[str],
    work_history: list[str],
    education: list[str],
    skills: list[str],
) -> tuple[str, str]:
    """
    Pick the single most relevant resume item to anchor the first question on.
    Returns (anchor_label, anchor_value).

    Band logic:
    - fresher     -> best college project first, then internship, then education
    - mid         -> latest work experience first, then projects
    - experienced -> latest work experience first
    - senior      -> latest work experience first
    """
    if candidate_band == "fresher":
        if projects:
            return ("project", projects[0])
        if work_history:
            return ("internship", work_history[0])
        if education:
            return ("education", education[0])
        return ("skills", ", ".join(skills[:5]) if skills else "your background")

    # mid / experienced / senior - work history is primary
    if work_history:
        return ("role", work_history[0])
    if projects:
        return ("project", projects[0])
    return ("skills", ", ".join(skills[:5]) if skills else "your background")


def build_phase_2_opening_context(
    *,
    candidate_band: str,
    projects: list[str],
    work_history: list[str],
    education: list[str],
    skills: list[str],
    jd_summary_block: str,
    smart_opening_question: str,
    coverage_items: list[str],
) -> str:
    """
    Runtime Phase 2: the first real interview after warmup.

    This uses raw resume fields (not just a summary) so the opening question can
    anchor on a specific project, company, or skill. The live flow is still one
    question at a time, but the question style changes by band.

    Band-specific:
    - fresher     -> college project / internship / education
    - mid         -> latest company project / ownership / results
    - experienced -> end-to-end initiative, tradeoffs, scope
    - senior      -> flagship initiative, strategic decisions, cross-team influence
    """

    anchor_label, anchor_value = _pick_resume_anchor(
        candidate_band, projects, work_history, education, skills
    )

    band_probe = {
        "fresher": (
            "CANDIDATE LEVEL: FRESHER\n"
            "They are early career. Prioritise:\n"
            "- What they actually built (problem -> what they made -> what they learned)\n"
            "- Fundamentals behind tools they claim to know\n"
            "- Learning speed and curiosity - NOT scale, production experience, or team size\n"
            "Be patient. Don't penalise missing industry jargon."
        ),
        "mid": (
            "CANDIDATE LEVEL: MID-LEVEL\n"
            "They have real work experience. Probe for:\n"
            "- What they personally owned vs what the team did\n"
            "- Specific results or impact (numbers if possible)\n"
            "- Decisions they made and why\n"
            "Push past resume language - get the actual story."
        ),
        "experienced": (
            "CANDIDATE LEVEL: EXPERIENCED\n"
            "Expect real depth. Probe for:\n"
            "- End-to-end ownership of a complex initiative\n"
            "- Tradeoffs they made under constraint\n"
            "- Evidence of influence beyond their direct scope\n"
            "Do NOT accept vague answers. An experienced person has a specific story for everything."
        ),
        "senior": (
            "CANDIDATE LEVEL: SENIOR\n"
            "Expect strategic judgment. Probe for:\n"
            "- Flagship initiative with real business/technical impact\n"
            "- Strategic decisions under constraint - why, what tradeoffs\n"
            "- What they would do differently today\n"
            "- How they influenced direction for others (mentorship, cross-team)\n"
            "Challenge their decisions. Seniors should be able to defend them."
        ),
    }

    probe = band_probe.get(candidate_band, band_probe["mid"])

    anchor_instruction = (
        f"FIRST QUESTION ANCHOR - use this to open:\n"
        f"Their resume shows this {anchor_label}: {anchor_value}\n\n"
        f"Ask your first question directly about this. Be specific - reference the actual "
        f"{anchor_label} name or company. Do NOT ask a generic 'tell me about yourself'.\n\n"
        f"Example pattern:\n"
    )

    if anchor_label == "project":
        project_name = anchor_value.split(" - ")[0] if " - " in anchor_value else anchor_value
        anchor_instruction += (
            f'  "I noticed you built **{project_name}** while you were in college - that\'s a cool project. '
            'What was the most challenging part of getting that to actually work?"'
        )
    elif anchor_label in ("role", "internship"):
        company = anchor_value.split(" at ")[-1].strip() if " at " in anchor_value else anchor_value
        anchor_instruction += (
            f'  "I see you were at **{company}** recently. To be honest, I\'m curious - '
            'what was your day-to-day focus actually like there?"'
        )
    elif anchor_label == "education":
        anchor_instruction += (
            f'  "I saw you studied at **{anchor_value}**. Was there a specific project or '
            'academic goal you hit there that you\'re still proud of?"'
        )
    else:
        anchor_instruction += (
            f'  "I noticed you\'ve done quite a bit with **{anchor_value}**. '
            'When you were using that in your last role, what was the biggest hurdle you ran into?"'
        )

    jd = jd_summary_block.strip() if jd_summary_block else ""
    top_coverage = (
        "\n".join(f"- {item}" for item in coverage_items[:3])
        if coverage_items
        else "- Cover core skills with concrete examples."
    )

    opening_q_section = ""
    if smart_opening_question and smart_opening_question.strip():
        opening_q_section = (
            "SMART OPENING QUESTION (prefer this over anchor if it references their resume):\n"
            f"{smart_opening_question.strip()}\n\n"
        )

    return (
        "[RUNTIME PHASE 2: OPENING - AFTER WARMUP]\n"
        "Warmup is done. Begin the real conversation naturally - no announcement, no mode switch.\n\n"
        f"{probe}\n\n"
        f"{anchor_instruction}\n\n"
        f"{opening_q_section}"
        + (f"JD MUST-PROVE:\n{jd}\n\n" if jd else "")
        + f"COVERAGE FLOOR:\n{top_coverage}\n\n"
        "RULES:\n"
        "  - One question per turn\n"
        "  - React to what they actually said before next question\n"
        "  - Max 2 follow-ups per topic then move on\n"
        "  - Do NOT mention this note aloud"
    )


def build_phase_3_bridge_directive(candidate_band: str, coverage_items: list[str]) -> str:
    """
    Runtime Phase 3: bridge between background questions and skills deep-dive.

    This phase is intentionally lightweight — Ishita continues the conversation
    naturally while transitioning toward skill-level probing. Content for this
    phase will be expanded later; for now it extends coverage floor topics and
    primes the candidate for the skills section.

    Fires at ~35–70% of interview time (e.g. 7–14 min in a 20-min interview).
    """
    uncovered = "\n".join(f"- {item}" for item in coverage_items[:4]) if coverage_items else "- Continue based on what has been said."
    band_bridge = {
        "fresher": "Shift toward how they learn, apply tools, and handle unfamiliar problems.",
        "mid": "Shift toward decisions they owned, trade-offs they made, and measurable impact.",
        "experienced": "Shift toward system-level judgment, cross-team influence, and production trade-offs.",
        "senior": "Shift toward architectural decisions, strategic direction, and how they raised the bar.",
    }.get(candidate_band, "Shift toward depth — implementation, impact, and decisions.")

    return (
        "[RUNTIME PHASE 3: BRIDGE]\n"
        "You are in the mid-interview bridge phase. Continue naturally from the last answer.\n\n"
        f"DIRECTION: {band_bridge}\n\n"
        f"UNCOVERED AREAS (prioritise these):\n{uncovered}\n\n"
        "RULES:\n"
        "  - Do NOT announce a phase change\n"
        "  - One question per turn\n"
        "  - Still max 2 follow-ups per topic then move on\n"
        "  - You will receive new instructions when the skills phase begins\n"
        "  - Do NOT mention this note aloud"
    )


def build_phase_4_skills_directive() -> str:
    """
    Runtime Phase 4: QB Phase 3 critical-skills questions.

    Replaces all prior phase directives. Ishita should now work through the
    QUESTION BANK — PHASE 3 (CRITICAL SKILLS) section of the already-injected
    question bank, plus STRENGTH / WEAKNESS / WATCHOUT / CUSTOM questions.

    Fires at ~70% of interview time (e.g. 14 min in a 20-min interview).
    The full question bank (with Phase 3 filtered) is already in context from
    the earlier injection; this directive tells Ishita to start that section now.
    """
    return (
        "[RUNTIME PHASE 4: SKILLS DEEP-DIVE]\n"
        "You have now entered the skills assessment phase. "
        "Work through the QUESTION BANK — PHASE 3 (CRITICAL SKILLS) questions from your earlier instructions.\n\n"
        "Cover in order:\n"
        "  1. SKILL questions (hands-on, role-critical technical areas)\n"
        "  2. STRENGTH question\n"
        "  3. WEAKNESS question\n"
        "  4. WATCHOUT question\n"
        "  5. CUSTOM questions\n\n"
        "RULES:\n"
        "  - Do NOT announce this transition aloud\n"
        "  - One question per turn\n"
        "  - Max 2 follow-ups per skill topic then move on\n"
        "  - Refer to Strong/Weak patterns and Probes from the question bank\n"
        "  - Do NOT mention this note aloud"
    )
