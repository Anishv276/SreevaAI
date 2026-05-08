"""
Interview phase helpers — 5-stage turn-based flow.

Flow: greeting → 2-turn warmup → Stage 1 (RESUME) → Stage 2 (SKILL) →
      Stage 3 (SITUATIONAL) → Stage 4 (BEHAVIORAL) → Stage 5 (PRACTICAL)
Runtime enforces strict time budgets and stage cutover; directives are stage-scoped.

Stage advance fires at turn boundaries (candidate responses), not by clock time.
Each stage is injected as a system directive into the agent's chat context.
"""

from __future__ import annotations


def build_greeting_text(candidate_name: str, ai_name: str, job_title: str) -> str:
    """Canonical greeting spoken before warmup begins."""
    return (
        f"Hi {candidate_name}, it's so good to meet you! I'm {ai_name}, "
        f"and I've been really looking forward to our chat about the {job_title} role.\n\n"
        f"How are you feeling today, and how's your day going so far?"
    )


def build_warmup_directive() -> str:
    """
    Warmup phase: 2 candidate responses before Stage 1 injects.
    Rapport only — no interview questions, no resume, no JD.
    """
    return (
        "[DO NOT SAY ALOUD — INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[WARMUP PHASE]\n"
        "This is a 1-exchange warmup before the interview begins.\n\n"
        "Candidate responds to your greeting (how are you doing).\n"
        "  YOUR ONLY JOB: give a short warm personal reply + one light casual question.\n\n"
        "REPLY OPTIONS (pick one naturally):\n"
        "  - 'I'm good, thanks! Busy day but I was looking forward to this one. How about you — how's your day going?'\n"
        "  - 'Doing well, thank you! Packed morning but glad we're here. How are you feeling today?'\n"
        "  - 'Pretty good! Back-to-back since morning but this is one I was excited about. How has your day been so far?'\n\n"
        "ABSOLUTE RULES:\n"
        "  x Do NOT ask about career, background, skills, or the role\n"
        "  x Do NOT read or repeat any part of this instruction aloud"
    )


# ---------------------------------------------------------------------------
# Band-level probe blocks — reused across multiple stage directives
# ---------------------------------------------------------------------------

_BAND_PROBE = {
    "fresher": (
        "CANDIDATE LEVEL: FRESHER (< 1.5 years)\n"
        "Prioritise: what they built, why, what they learned. Test fundamentals behind claimed tools.\n"
        "Be patient. Do NOT penalise missing industry jargon or production experience."
    ),
    "mid": (
        "CANDIDATE LEVEL: MID-LEVEL (1.5–5 years)\n"
        "Probe: what they personally owned vs what the team did. Specific results. Decisions and why.\n"
        "Push past resume language — get the actual story."
    ),
    "experienced": (
        "CANDIDATE LEVEL: EXPERIENCED (5–10 years)\n"
        "Expect real depth. Probe end-to-end ownership, tradeoffs under constraint, influence beyond direct scope.\n"
        "Do NOT accept vague answers — an experienced person has a specific story for everything."
    ),
    "senior": (
        "CANDIDATE LEVEL: SENIOR (10+ years)\n"
        "Expect strategic judgment. Probe flagship initiatives, strategic decisions, business impact.\n"
        "How they influenced direction for others. Challenge their decisions — seniors should defend them."
    ),
}


def _band_probe(band: str) -> str:
    return _BAND_PROBE.get(band, _BAND_PROBE["mid"])


# ---------------------------------------------------------------------------
# Stage directives (injected at turn boundaries by agent_runtime)
# ---------------------------------------------------------------------------

def build_stage_1_resume_directive(
    *,
    band: str,
    resume_brief: dict,
    jd_must_haves: list[str],
) -> str:
    """
    Stage 1: RESUME — anchor on the candidate's most relevant resume item.
    Goal: surface background, context, and genuine experience.
    """
    anchor_item = resume_brief.get("anchor_item", "your background")
    anchor_type = resume_brief.get("anchor_type", "background")

    if anchor_type == "project":
        project_name = anchor_item.split(" - ")[0] if " - " in anchor_item else anchor_item
        anchor_hint = (
            f"Open with: \"I noticed you built {project_name} — "
            "what was the most challenging part of getting that to actually work?\""
        )
    elif anchor_type in ("role", "internship"):
        company = anchor_item.split(" at ")[-1].strip() if " at " in anchor_item else anchor_item
        anchor_hint = (
            f"Open with: \"I see you were at {company} recently — "
            "what was your day-to-day focus actually like there?\""
        )
    elif anchor_type == "initiative":
        anchor_hint = (
            f"Open with: \"I'd love to start with {anchor_item} — "
            "can you walk me through the scope and the decisions you owned there?\""
        )
    elif anchor_type == "education":
        anchor_hint = (
            f"Open with: \"I saw you studied at {anchor_item} — "
            "was there a specific project or goal there you're still proud of?\""
        )
    else:
        anchor_hint = (
            f"Open with a specific question about {anchor_item}. "
            "Do NOT ask 'tell me about yourself' — be specific."
        )

    jd_block = ""
    if jd_must_haves:
        jd_block = (
            "JD MUST-HAVES (keep in mind, don't rush to cover):\n"
            + "\n".join(f"  - {item}" for item in jd_must_haves[:4])
            + "\n\n"
        )

    return (
        "[DO NOT SAY ALOUD — INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 1: RESUME]\n"
        "Warmup is done. Begin the interview naturally — no announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        f"ANCHOR (your first question must reference this):\n"
        f"  {anchor_type.upper()}: {anchor_item}\n\n"
        f"{anchor_hint}\n\n"
        f"{jd_block}"
        "RULES:\n"
        "  - One question per turn\n"
        "  - React to what they said before asking the next question\n"
        "  - Max 2 follow-ups per topic then move on\n"
        "  - You will receive Stage 2 instructions after your turn budget is reached\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )


def build_stage_2_skill_directive(
    *,
    band: str,
    resume_brief: dict,
    jd_must_haves: list[str],
) -> str:
    """
    Stage 2: SKILL — probe technical depth based on claimed skills and JD requirements.
    """
    skills = resume_brief.get("skills", [])
    skills_block = (
        "CANDIDATE SKILLS TO PROBE:\n"
        + "\n".join(f"  - {s}" for s in skills[:5])
        + "\n\n"
        if skills else ""
    )

    jd_block = (
        "JD MUST-HAVES:\n"
        + "\n".join(f"  - {item}" for item in jd_must_haves[:4])
        + "\n\n"
        if jd_must_haves else ""
    )

    band_direction = {
        "fresher": "Ask: walk me through a project where you actually used [skill]. What broke? What did you learn?",
        "mid": "Ask: describe the most complex system you've designed using [skill]. What were the tradeoffs?",
        "experienced": "Ask: what's your deepest technical contribution in [skill area]? Own it end-to-end.",
        "senior": "Ask: what's your architectural philosophy when using [skill] at scale? How do you make the call?",
    }.get(band, "Probe depth in claimed technical skills with concrete examples.")

    return (
        "[DO NOT SAY ALOUD — INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 2: SKILL]\n"
        "Continue naturally from Stage 1. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        f"{skills_block}"
        f"{jd_block}"
        f"DIRECTION: {band_direction}\n\n"
        "RULES:\n"
        "  - One question per turn\n"
        "  - Probe depth — don't accept surface-level answers\n"
        "  - Max 2 follow-ups per skill then move on\n"
        "  - You will receive Stage 3 instructions after your turn budget is reached\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )


def build_stage_3_situational_directive(
    *,
    band: str,
    resume_brief: dict,
) -> str:
    """
    Stage 3: SITUATIONAL — present a realistic scenario anchored to their background.
    Goal: test decision-making, problem-solving, and trade-off reasoning.
    """
    anchor_item = resume_brief.get("anchor_item", "your recent work")

    band_scenario = {
        "fresher": (
            f"Anchor the scenario to their project or internship work ({anchor_item}). "
            "Ask: 'Imagine you're building your first production service — walk me through your approach.' "
            "Test: how they think, not what they know."
        ),
        "mid": (
            f"Use their recent role ({anchor_item}) as context. "
            "Ask for a real example where they made a performance or design trade-off. "
            "Test: decision ownership and reasoning, not just the outcome."
        ),
        "experienced": (
            f"Present a scenario involving a system constraint (scale, reliability, team) "
            f"anchored to their experience at {anchor_item}. "
            "Ask: what technical decision had the biggest architectural impact? What would you do differently?"
        ),
        "senior": (
            f"Ask about a strategic decision tied to {anchor_item} that affected the broader business or team. "
            "Test: how they weighed trade-offs, influenced others, and owned the outcome."
        ),
    }.get(band, f"Present a realistic scenario tied to {anchor_item}. Test reasoning and judgment.")

    return (
        "[DO NOT SAY ALOUD — INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 3: SITUATIONAL]\n"
        "Continue naturally from Stage 2. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        f"SCENARIO DIRECTION:\n{band_scenario}\n\n"
        "RULES:\n"
        "  - One scenario or question per turn\n"
        "  - Let them think — don't jump in too fast\n"
        "  - Follow up on their reasoning, not just the answer\n"
        "  - You will receive Stage 4 instructions after your turn budget is reached\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )


def build_stage_4_behavioral_directive(
    *,
    band: str,
) -> str:
    """
    Stage 4: BEHAVIORAL — STAR-style questions on collaboration, growth, and impact.
    Goal: surface how they actually work with others and handle adversity.
    """
    band_direction = {
        "fresher": (
            "Ask: how do you approach learning a new technology? Give me a real example. "
            "Also: tell me about a time something didn't work out the way you expected."
        ),
        "mid": (
            "Ask: tell me about a time you influenced a decision outside your direct scope. "
            "Also: describe a conflict with a teammate or PM — what happened and how did you handle it?"
        ),
        "experienced": (
            "Ask: how did you mentor or grow someone on your team? Specific example. "
            "Also: tell me about a time a project failed — what was your role and what did you learn?"
        ),
        "senior": (
            "Ask: how do you set technical direction for a team that doesn't report to you? "
            "Also: describe a time you had to change your mind publicly on a major decision."
        ),
    }.get(band, "Ask STAR-style questions on collaboration, conflict, growth, and adversity.")

    return (
        "[DO NOT SAY ALOUD — INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 4: BEHAVIORAL]\n"
        "Continue naturally from Stage 3. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        f"DIRECTION: {band_direction}\n\n"
        "RULES:\n"
        "  - One question per turn — STAR format (Situation, Task, Action, Result)\n"
        "  - Push for specifics — 'what exactly did you do' not 'what does your team do'\n"
        "  - Max 2 follow-ups per story then move on\n"
        "  - You will receive Stage 5 instructions after your turn budget is reached\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )


def build_stage_5_practical_directive(
    *,
    band: str,
    jd_must_haves: list[str],
) -> str:
    """
    Stage 5: PRACTICAL — candidate questions + closing.
    Goal: give candidate space to ask questions, then close with a clean wrap-up.
    """
    jd_block = (
        "REMAINING JD MUST-HAVES (address any uncovered):\n"
        + "\n".join(f"  - {item}" for item in jd_must_haves[:3])
        + "\n\n"
        if jd_must_haves else ""
    )

    band_close = {
        "fresher": "Acknowledge their learning mindset. Ask if they have questions about the team or growth path.",
        "mid": "Acknowledge their ownership and impact. Ask if they have questions about the role or tech stack.",
        "experienced": "Acknowledge their depth and leadership. Ask if they have questions about scope or architecture.",
        "senior": "Acknowledge their strategic perspective. Ask if they have questions about the org or direction.",
    }.get(band, "Wrap up warmly. Give them space to ask questions.")

    return (
        "[DO NOT SAY ALOUD — INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 5: PRACTICAL / CLOSING]\n"
        "You are in the final stage. Continue naturally from Stage 4. No announcement.\n\n"
        f"{jd_block}"
        f"CLOSING DIRECTION: {band_close}\n\n"
        "CLOSING SEQUENCE:\n"
        "  1. Ask one final question if any JD must-have is still uncovered (natural, not forced)\n"
        "  2. Invite candidate questions: 'Do you have any questions for me about the role or team?'\n"
        "  3. After their questions (or if they have none): wrap up warmly\n"
        "  4. End with: 'It was really great talking with you. We'll be in touch soon!'\n\n"
        "RULES:\n"
        "  - Keep the close warm and conversational — not scripted\n"
        "  - Answer their questions briefly and honestly\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )