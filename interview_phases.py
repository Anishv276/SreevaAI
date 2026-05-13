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
        "This is a 2-exchange warmup. This is NOT the interview. Do not treat it as one.\n\n"
        "Exchange 1: Candidate responds to the greeting (how are you doing).\n"
        "  YOUR ONLY JOB: give a short, genuine personal reply. 1-2 sentences. Then ask them one light casual question to keep conversation going (e.g. 'How's your day been so far?').\n"
        "Exchange 2: Candidate responds to your reply.\n"
        "  YOUR ONLY JOB: give a warm 1-sentence acknowledgment. Then STOP — the system will inject Stage 1 instructions and you will begin the interview.\n\n"
        "PERSONAL REPLY OPTIONS (pick one naturally, then add a light casual follow-up):\n"
        "  - 'I'm good, thanks. A bit of a busy day, but it's been a good one so far. Did you have time to grab some water or coffee before we started?'\n"
        "  - 'Doing well, thank you. The day has been moving fast, but I'm glad we're here. Did everything go smoothly on your side getting set up?'\n"
        "  - 'Pretty good. It's been one of those back-to-back days, but I'm excited to talk with you. How's the weather looking where you are today?'\n\n"
        "ABSOLUTE RULES:\n"
        "  x Do NOT ask about career, background, skills, or the role\n"
        "  x Do NOT transition to the interview on your own\n"
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
) -> str:
    """
    Stage 1: RESUME - simple, human, and resume-led.
    Goal: uncover grounded signal from the candidate's own background.
    """
    anchor_item = resume_brief.get("anchor_item", "your background")
    anchor_type = resume_brief.get("anchor_type", "background")
    stage_items = []
    for key in ("projects", "work_history", "internships", "education"):
        items = resume_brief.get(key, [])
        if isinstance(items, list):
            stage_items.extend(str(item).strip() for item in items if str(item).strip())
    stage_items = stage_items[:6]
    items_block = ""
    if stage_items:
        items_block = (
            "RESUME ITEMS TO ROTATE THROUGH (best-first):\n"
            + "\n".join(f"  - {item}" for item in stage_items)
            + "\n\n"
        )

    if anchor_type == "project":
        project_name = anchor_item.split(" - ")[0] if " - " in anchor_item else anchor_item
        anchor_hint = f"Start from {project_name} and ask a grounded, personal question about their role in it."
    elif anchor_type in ("role", "internship"):
        role_ref = anchor_item.split(" - ")[0].strip() if " - " in anchor_item else anchor_item
        anchor_hint = f"Start from {role_ref} and ask what they personally handled, owned, or decided."
    elif anchor_type == "initiative":
        anchor_hint = f"Start from {anchor_item} and ask about scope, tradeoffs, and why they chose that path."
    elif anchor_type == "education":
        anchor_hint = f"Start from {anchor_item} and ask about a concrete learning or project moment."
    else:
        anchor_hint = f"Start from {anchor_item} with a concrete, personal question. Do NOT ask 'tell me about yourself'."

    fresher_rule = ""
    if band == "fresher":
        fresher_rule = (
            "FRESHER RULE:\n"
            "  - Lead with projects, coursework, internships, or academics - NOT \"years of professional experience\"\n"
            "  - If they have no jobs listed, do NOT ask behavioral-style \"tell me about your role at company X\"\n\n"
        )

    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 1: RESUME]\n"
        "Warmup is done. Begin naturally with no announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        "FLOW (strict):\n"
        "  1) Pick the best resume anchor item\n"
        "  2) Ask one personal, grounded question about that item\n"
        "  3) Use at most 2 follow-ups on the same topic\n"
        "  4) Then move to the next best resume item\n"
        "  5) Keep this stage human and resume-led only\n\n"
        f"{items_block}"
        f"{fresher_rule}"
        f"ANCHOR (your first substantive question MUST name or clearly imply this):\n"
        f"  {anchor_type.upper()}: {anchor_item}\n\n"
        f"{anchor_hint}\n\n"
        "QUESTION STYLE (must feel personal, not scripted):\n"
        "  - React to their actual resume content and prior answer\n"
        "  - Vary phrasing by situation; do not reuse a fixed opener template\n"
        "  - Prefer natural phrasing such as:\n"
        "    * I noticed this project on your resume...\n"
        "    * I saw this part of your background...\n"
        "    * That role stood out to me because...\n"
        "  - Do NOT use blunt generic asks like \"what did you build?\"\n\n"
        "SCOPE BOUNDARY:\n"
        "  - Do NOT use JD must-haves in Stage 1\n"
        "  - Do NOT use alignment logic in Stage 1\n"
        "  - Do NOT use variation slots/templates in Stage 1\n\n"
        "RULES:\n"
        "  - One question per turn\n"
        "  - React to what they said before asking the next question\n"
        "  - Max 2 follow-ups per topic, then move to the next resume point\n"
        "  - Stage 1 runs about 5-6 minutes, then you will receive Stage 2 instructions\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )

def build_stage_2_skill_directive(
    *,
    band: str,
    resume_brief: dict,
) -> str:
    """
    Stage 2: SKILL - human, resume-skill led technical depth.
    Goal: validate practical skill depth from what the candidate has already claimed.
    """
    skills = resume_brief.get("skills", [])
    projects = resume_brief.get("projects", []) or []
    work_history = resume_brief.get("work_history", []) or resume_brief.get("internships", []) or []

    skill_anchors = [str(s).strip() for s in skills if str(s).strip()][:6]
    anchors_block = (
        "SKILL ANCHORS TO ROTATE THROUGH:\n"
        + "\n".join(f"  - {s}" for s in skill_anchors)
        + "\n\n"
        if skill_anchors else ""
    )

    context_items = []
    for item in list(projects)[:2] + list(work_history)[:2]:
        text = str(item).strip()
        if text:
            context_items.append(text)
    context_block = (
        "RESUME CONTEXT TO GROUND SKILL QUESTIONS:\n"
        + "\n".join(f"  - {c}" for c in context_items[:4])
        + "\n\n"
        if context_items else ""
    )

    band_direction = {
        "fresher": (
            "Ask where they used each listed skill in projects/coursework/internships. "
            "Probe fundamentals, what went wrong, and what they learned."
        ),
        "mid": "Ask for concrete ownership using listed skills: what they built, why that design, and tradeoffs.",
        "experienced": "Probe deepest technical contribution from listed skills: scale, reliability, and decisions.",
        "senior": "Probe strategic technical judgment: architecture, constraints, and influence across teams.",
    }.get(band, "Probe practical depth in listed skills with concrete examples.")

    objective_block = (
        "OBJECTIVE:\n"
        "  - Validate real skill depth from resume claims\n"
        "  - Understand where they used each skill, what they personally owned, and what tradeoffs they made\n"
        "  - Keep the conversation practical and human\n\n"
    )

    question_plan_block = (
        "QUESTION PLAN (per skill):\n"
        "  1) Ground it in one real resume context (project/role)\n"
        "  2) Ask what they personally implemented or decided\n"
        "  3) Ask one depth follow-up on tradeoff/debugging/performance\n"
        "  4) Move to next skill after max 2 follow-ups\n\n"
    )

    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 2: SKILL]\n"
        "Continue naturally from Stage 1. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        f"{objective_block}"
        f"{anchors_block}"
        f"{context_block}"
        f"DIRECTION: {band_direction}\n\n"
        f"{question_plan_block}"
        "QUESTION STYLE:\n"
        "  - Ask skill questions through real resume situations, not checklist quiz questions\n"
        "  - Do NOT ask: 'Do you know X?'\n"
        "  - Use varied natural wording based on what the candidate just said; avoid repeating one template\n"
        "  - Example tone: 'I saw X in your resume - where did you use it, and what part did you own?'\n"
        "  - Keep wording natural, personal, and reactive to their previous answer\n\n"
        "RULES:\n"
        "  - Pick one skill anchor at a time\n"
        "  - One question per turn\n"
        "  - Probe depth; do not stop at surface claims\n"
        "  - Max 2 follow-ups per skill then move on\n"
        "  - You will receive Stage 3 instructions after your turn budget is reached\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )

def build_stage_3_situational_directive(
    *,
    band: str,
    resume_brief: dict,
    jd_must_haves: list[str] | None = None,
    alignment_block: str = "",
    variation_slot: int = 0,
) -> str:
    """
    Stage 3: SITUATIONAL — present a realistic scenario anchored to their background.
    Goal: test decision-making, problem-solving, and trade-off reasoning.
    """
    anchor_item = resume_brief.get("anchor_item", "your recent work")

    jd_theme = ""
    if jd_must_haves:
        idx = variation_slot % len(jd_must_haves)
        jd_theme = (
            f"Wrap the scenario around a JD theme such as: {jd_must_haves[idx]}. "
            "Keep it realistic for their level.\n\n"
        )

    align = alignment_block.strip()
    if align:
        align = align + "\n"

    band_scenario = {
        "fresher": (
            f"Anchor the scenario to their project, coursework, or internship ({anchor_item}) — not hypothetical senior job titles. "
            "Example shape: tight deadline + unfamiliar tool from the JD — how do they prioritize and learn? "
            "Test judgment, not trivia."
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
        f"{align}"
        f"{jd_theme}"
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
    resume_brief: dict | None = None,
    alignment_block: str = "",
    variation_slot: int = 0,
) -> str:
    """
    Stage 4: BEHAVIORAL — STAR-style questions on collaboration, growth, and impact.
    Goal: surface how they actually work with others and handle adversity.
    """
    collab_themes = (
        "collaboration on a shared deliverable",
        "disagreement with a teammate or stakeholder",
        "a setback or mistake",
        "leading without authority",
    )
    theme = collab_themes[variation_slot % len(collab_themes)]

    proj_hint = ""
    if resume_brief and band == "fresher":
        pr = resume_brief.get("projects") or []
        if pr:
            proj_hint = (
                f"When asking about teamwork, prefer their real project context (e.g. {pr[0][:120]}) "
                "over hypothetical corporate roles.\n\n"
            )

    align = alignment_block.strip()
    if align:
        align = align + "\n"

    band_direction = {
        "fresher": (
            f"Ask for a real example tied to learning or teamwork — theme: {theme}. "
            "Use projects, coursework, or internships — not fictional job titles."
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
        f"{align}"
        f"{proj_hint}"
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
