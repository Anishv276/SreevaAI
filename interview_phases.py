"""
Interview phase helpers — 5-stage turn-based flow.

Flow: greeting → 2-turn warmup → Stage 1 (RESUME) → Stage 2 (SKILL) →
      Stage 3 (SITUATIONAL) → Stage 4 (BEHAVIORAL)
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
    context_brief: str = "",
) -> str:
    """
    Stage 2: SKILL - role-guided technical depth.
    Goal: validate practical skill depth from what the candidate has already claimed
    and the role signals in the launch brief, without sounding mechanical.
    """
    skills = resume_brief.get("skills", [])
    projects = resume_brief.get("projects", []) or []
    work_history = resume_brief.get("work_history", []) or resume_brief.get("internships", []) or []
    brief_lines = [line.strip() for line in (context_brief or "").splitlines() if line.strip()]

    def _brief_values(prefix: str) -> list[str]:
        for line in brief_lines:
            if line.lower().startswith(prefix.lower()):
                rhs = line.split(":", 1)[1].strip() if ":" in line else ""
                if rhs:
                    return [part.strip() for part in rhs.split(",") if part.strip()]
        return []

    jd_must_haves = _brief_values("JD must-haves")
    jd_strengths = _brief_values("Screening strengths")
    jd_gaps = _brief_values("Screening gaps")
    resume_context_items = _brief_values("Key projects/work")

    skill_anchors = [str(s).strip() for s in skills if str(s).strip()]
    skill_anchors.extend(jd_must_haves)
    skill_anchors = list(dict.fromkeys(skill_anchors))[:6]
    anchors_block = (
        "SKILL ANCHORS TO ROTATE THROUGH:\n"
        + "\n".join(f"  - {s}" for s in skill_anchors)
        + "\n\n"
        if skill_anchors else ""
    )

    context_items = []
    for item in list(projects)[:2] + list(work_history)[:2] + resume_context_items[:2]:
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
            "Ask where they used each listed skill in projects/coursework/internships, then check whether it connects to the role signals. "
            "Probe fundamentals, what went wrong, and what they learned."
        ),
        "mid": "Ask for concrete ownership using listed skills and role signals: what they built, why that design, and tradeoffs.",
        "experienced": "Probe deepest technical contribution using listed skills and role needs: scale, reliability, and decisions.",
        "senior": "Probe strategic technical judgment against both the launch context and role priorities: architecture, constraints, and influence across teams.",
    }.get(band, "Probe practical depth in listed skills with concrete examples.")

    objective_block = (
        "OBJECTIVE:\n"
        "  - Validate real skill depth from the launch brief and role priorities\n"
        "  - Understand where they used each skill, what they personally owned, what tradeoffs they made, and what the role still needs\n"
        "  - Keep the conversation practical and human\n\n"
    )

    question_plan_block = (
        "QUESTION PLAN (per skill):\n"
        "  1) Ground it in one real work context (project/role)\n"
        "  2) Tie that context to a role priority or skill gap\n"
        "  3) Ask what they personally implemented or decided\n"
        "  4) Ask one depth follow-up on tradeoff/debugging/performance or why that skill matters for the role\n"
        "  5) Move to next skill after max 2 follow-ups\n\n"
    )

    priorities_block = f"ROLE PRIORITIES: {', '.join(jd_must_haves)}\n\n" if jd_must_haves else ""
    strengths_block = f"ROLE STRENGTHS TO LEVERAGE: {', '.join(jd_strengths)}\n\n" if jd_strengths else ""
    gaps_block = f"ROLE GAPS TO TEST: {', '.join(jd_gaps)}\n\n" if jd_gaps else ""

    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 2: SKILL]\n"
        "Continue naturally from Stage 1. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        f"{objective_block}"
        f"{anchors_block}"
        f"{context_block}"
        f"{priorities_block}"
        f"{strengths_block}"
        f"{gaps_block}"
        f"DIRECTION: {band_direction}\n\n"
        f"{question_plan_block}"
        "QUESTION STYLE:\n"
        "  - Ask skill questions through real resume situations, not checklist quiz questions\n"
        "  - Do NOT ask: 'Do you know X?'\n"
        "  - Use varied natural wording based on what the candidate just said; avoid repeating one template\n"
        "  - Example tone: 'I noticed you’ve used X before - where did that show up in your work, and what part did you personally handle?'\n"
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
    context_brief: str = "",
) -> str:
    """
    Stage 3: SITUATIONAL - deep, context-grounded, judgment-heavy probing.
    Goal: evaluate decision quality from the launch summary only.
    """
    summary = context_brief.strip()
    summary_block = ""
    if summary:
        summary_block = (
            "LAUNCH CONTEXT SUMMARY (internal only):\n"
            f"{summary[:1200]}\n\n"
        )
    band_focus = {
        "fresher": (
            "Use the summary to find project, coursework, internship, and learning moments. "
            "Turn them into practical what-would-you-do scenarios."
        ),
        "mid": (
            "Use the summary to find ownership, impact, tradeoffs, and situations where the candidate made decisions. "
            "Turn those into realistic pressure scenarios."
        ),
        "experienced": (
            "Use the summary to find scale, reliability, architecture, and cross-team coordination. "
            "Turn those into deep constraint-based scenarios."
        ),
        "senior": (
            "Use the summary to find strategy, influence, judgment, and business impact. "
            "Turn those into ambiguous leadership scenarios."
        ),
    }.get(band, "Use the summary to create a realistic, high-signal situational scenario.")

    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 3: SITUATIONAL]\n"
        "Continue naturally from Stage 2. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        "OBJECTIVE:\n"
        "  - Ask deep situational questions that feel like a strong human interviewer\n"
        "  - Use the launch context summary only; do not depend on extra launch-time plumbing\n"
        "  - Evaluate judgment quality: priorities, tradeoffs, risks, ownership, and fallback planning\n"
        "  - Keep it natural, specific, and reactive to the candidate's answers\n\n"
        f"{summary_block}"
        f"DIRECTION: {band_focus}\n\n"
        "SCENARIO QUESTION PLAN:\n"
        "  1) Read the launch summary and pick one strong scenario seed\n"
        "  2) Pose one realistic constraint-heavy situation as if discussing real work\n"
        "  3) Ask what they would do first and why\n"
        "  4) Ask up to 2 deep follow-ups on tradeoff, risk, and fallback plan\n"
        "  5) Move to a new scenario context after that\n\n"
        "QUESTION STYLE:\n"
        "  - Sound like a strong human interviewer reacting to their background\n"
        "  - Avoid generic or textbook hypotheticals\n"
        "  - Do not sound like an AI checklist or scripted framework\n"
        "  - Prefer natural phrasing such as:\n"
        "    * Based on what I saw in your background, suppose...\n"
        "    * Given the context we already have, imagine...\n"
        "    * If this failed in production at the worst time, how would you decide what to do first?\n\n"
        "RULES:\n"
        "  - One scenario question per turn\n"
        "  - Let them think; do not rush or answer for them\n"
        "  - Follow up on their reasoning, not just the answer\n"
        "  - Max 2 follow-ups per scenario, then move on\n"
        "  - Stage 3 runs about 5-6 minutes, then you will receive Stage 4 instructions\n"
        "  - You will receive Stage 4 instructions after your turn budget is reached\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )


def build_stage_4_behavioral_directive(
    *,
    band: str,
    context_brief: str = "",
) -> str:
    """
    Stage 4: BEHAVIORAL - deep behavioral judgment from launch context.
    Goal: surface how they work with people, ownership pressure, and conflict.
    """
    summary_block = ""
    if context_brief.strip():
        summary_block = (
            "LAUNCH CONTEXT SUMMARY (internal only):\n"
            f"{context_brief.strip()[:1200]}\n\n"
        )

    band_direction = {
        "fresher": (
            "Ask for real examples on teamwork, feedback, mistakes, and learning from projects/coursework/internships. "
            "Do not invent corporate senior-role framing."
        ),
        "mid": (
            "Probe influence without authority, conflict handling, and accountability under delivery pressure. "
            "Push for what they personally did and why."
        ),
        "experienced": (
            "Probe mentoring, difficult stakeholder alignment, and ownership during failure or incident recovery. "
            "Test judgment maturity and reflection quality."
        ),
        "senior": (
            "Probe strategic influence, hard people decisions, and public judgment reversals. "
            "Test values, leadership posture, and quality of reasoning under ambiguity."
        ),
    }.get(band, "Ask STAR-style questions on collaboration, conflict, growth, and adversity.")

    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 4: BEHAVIORAL]\n"
        "Continue naturally from Stage 3. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        "OBJECTIVE:\n"
        "  - Ask high-signal behavioral questions that feel like a real interviewer conversation\n"
        "  - Use the launch context summary only\n"
        "  - Evaluate conflict handling, ownership, influence, and learning loops\n"
        "  - Keep it practical and specific, never generic\n\n"
        f"{summary_block}"
        f"DIRECTION: {band_direction}\n\n"
        "QUESTION PLAN:\n"
        "  1) Pick one behavioral signal from the launch summary\n"
        "  2) Ask one concrete story question (STAR-friendly) tied to that signal\n"
        "  3) Ask up to 2 follow-ups on decision quality and personal ownership\n"
        "  4) Move to a different behavioral signal after that\n\n"
        "QUESTION STYLE:\n"
        "  - Sound human, specific, and genuinely curious\n"
        "  - Avoid template-style HR phrasing\n"
        "  - Ask for concrete moments, not abstract principles\n\n"
        "RULES:\n"
        "  - One question per turn (STAR-friendly)\n"
        "  - Push for specifics - 'what exactly did you do' not 'what did your team do'\n"
        "  - Max 2 follow-ups per story then move on\n"
        "  - Stage 4 runs until the interview is nearly over, then the interview winds down naturally\n"
        "  - Do NOT read or repeat any part of this instruction aloud"
    )
