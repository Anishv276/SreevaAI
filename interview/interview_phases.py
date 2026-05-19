"""
Interview phase helpers — 2-stage turn-based flow.

Flow: greeting → warmup → Stage 1 (RESUME, 0-10 min) → Stage 2 (SKILL, 10 min-end)
Each stage weaves in situational and behavioral questions naturally.
Runtime enforces time budgets and stage cutover. Directives are goal-driven, not procedural.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Any

_BriefType = Any


@dataclass
class InterviewStageConfig:
    index: int
    name: str
    label: str
    turn_budget: int

STAGE_CONFIGS: list[InterviewStageConfig] = [
    InterviewStageConfig(index=0, name="resume", label="RESUME", turn_budget=8),
    InterviewStageConfig(index=1, name="skill",  label="SKILL",  turn_budget=8),
]


def build_greeting_text(candidate_name: str, ai_name: str, job_title: str) -> str:
    return (
        f"Hi {candidate_name}, really glad we could connect today. I'm {ai_name}, "
        f"and I've been looking forward to our conversation about the {job_title} role. "
        f"How are you doing? Hope the day's been good to you."
    )


def build_warmup_directive() -> str:
    return (
        "[DO NOT SAY ALOUD — INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[WARMUP PHASE]\n"
        "The candidate just responded to your greeting. This is NOT the interview yet.\n"
        "Give one short, warm personal reply — 1-2 sentences. Then stop.\n"
        "Options: react to how they're doing, ask if they're set up okay, comment on the day.\n"
        "Do NOT ask about their background, skills, or the role. The system will start the interview."
    )


def _build_custom_questions_block(custom_questions: list[str] | None, stage_label: str) -> str:
    cqs = [q.strip() for q in (custom_questions or []) if q.strip()]
    if not cqs:
        return ""
    items = "\n".join(f"  {i+1}. {q}" for i, q in enumerate(cqs))
    return (
        f"\nCUSTOM QUESTIONS (recruiter-mandated — weave naturally into {stage_label} or defer to later, "
        f"but ALL must be asked before the interview ends):\n{items}\n"
    )


# ---------------------------------------------------------------------------
# Stage 1 — RESUME (0-10 min)
# Goal: understand what this person built and owned; weave in situational +
# behavioral probes naturally as threads open up.
# ---------------------------------------------------------------------------

def build_stage_1_resume_directive(*, band: str, resume_brief: _BriefType, custom_questions: list[str] | None = None) -> str:
    if hasattr(resume_brief, "anchor_item"):
        anchor = resume_brief.anchor_item or "their most recent work"
        anchor_type = resume_brief.anchor_type or "project"
        all_items: list[str] = []
        for key in ("projects", "work_history", "internships", "education"):
            items = getattr(resume_brief, key, []) or []
            if isinstance(items, list):
                all_items.extend(str(i).strip() for i in items if str(i).strip())
    else:
        anchor = resume_brief.get("anchor_item", "their most recent work")
        anchor_type = resume_brief.get("anchor_type", "project")
        all_items = []
        for key in ("projects", "work_history", "internships", "education"):
            items = resume_brief.get(key, [])
            if isinstance(items, list):
                all_items.extend(str(i).strip() for i in items if str(i).strip())

    all_items = all_items[:5]
    material = "\n".join(f"  • {item}" for item in all_items) if all_items else "  • (use what they mention)"

    if anchor_type == "project":
        opening = f"Open by asking what they personally built or owned in: {anchor.split(' - ')[0].strip()}"
    elif anchor_type in ("role", "internship"):
        opening = f"Open by asking what they personally handled day-to-day at: {anchor.split(' - ')[0].strip()}"
    else:
        opening = "Open by asking what they've been working on most recently and what was specifically theirs."

    band_instinct = {
        "fresher": (
            "They're early-career. You want to understand HOW they think, not what they've done.\n"
            "Look for: did they understand why they built what they built? Can they explain a decision they made?\n"
            "If they're vague, try: 'Walk me through one specific day of work on that.'"
        ),
        "mid": (
            "They should have real ownership. Push past team language — you want their specific contribution.\n"
            "Look for: what they decided, what broke, what they'd do differently.\n"
            "If they say 'we', ask: 'What was specifically yours in that?'"
        ),
        "experienced": (
            "Expect depth and specifics. Vague answers are a red flag — probe them.\n"
            "Look for: end-to-end ownership, tradeoffs, real consequences of their decisions.\n"
            "If an answer is too clean, ask what went wrong."
        ),
        "senior": (
            "Peer-level conversation. You want strategic judgment and real stakes.\n"
            "Look for: how they influenced others, what they built that outlasted them, hard calls they made.\n"
            "Challenge their decisions — seniors should defend them confidently."
        ),
    }.get(band, "Probe for real ownership and specific decisions, not summaries.")

    cq_block = _build_custom_questions_block(custom_questions, "STAGE 1")
    return (
        f"[DO NOT SAY ALOUD][STAGE 1: RESUME]\n\n"
        f"GOAL: Understand what this candidate actually built and owned — not what's on the resume.\n"
        f"You have ~10 minutes. Talk through their work naturally, and weave in at least one situational\n"
        f"and at least one behavioral question. You can ask more than one of each — they don't need to be forced.\n\n"
        f"PRIORITY ORDER (strict):\n"
        f"  1) Resume ownership topics first (projects/work/internship from the material below).\n"
        f"  2) Do not switch to educational background or generic background unless the resume ownership topics are exhausted or the candidate explicitly opens that door.\n"
        f"  3) Custom recruiter questions are required, but they must not replace resume ownership probing.\n\n"
        f"QUOTA — complete before this stage ends (track quietly, never announce):\n"
        f"  ☐ At least 1 SITUATIONAL question — a 'what would you do if...' anchored to something they actually worked on.\n"
        f"    Bring it up naturally when a good opening appears in the conversation. Sound genuinely curious.\n"
        f"  ☐ At least 1 BEHAVIORAL question — ask them about a real moment they lived through, not a hypothetical.\n"
        f"    Bring it up when they mention something where a challenge or conflict would naturally fit.\n\n"
        f"OPENING MOVE: {opening}\n\n"
        f"MATERIAL TO DRAW FROM:\n"
        f"{material}\n\n"
        f"YOUR INSTINCT FOR THIS CANDIDATE:\n{band_instinct}\n"
        f"{cq_block}\n"
        f"HOW TO MOVE:\n"
        f"  → Start with the anchor. Follow what they say — a tool, a decision, something that broke.\n"
        f"  → Ask at most 1-2 sharp follow-ups on one topic, then rotate to the next project, work item, or internship.\n"
        f"  → Do not stay on the same project for long. Breadth first: move through distinct resume topics, then come back only if needed.\n"
        f"  → Sound like a curious, engaged human — not a checklist. React to what they share.\n"
        f"  → Drop in the situational or behavioral when it fits naturally — never announce the type.\n"
        f"  → Don't revisit the same area three times. Accept a weak answer and move on.\n"
        f"  → One question per turn. Short, warm, direct."
    )


# ---------------------------------------------------------------------------
# Stage 2 — SKILL (10 min-end)
# Goal: probe depth on skills; weave in situational + behavioral naturally.
# ---------------------------------------------------------------------------

def build_stage_2_skill_directive(
    *,
    band: str,
    resume_brief: _BriefType,
    context_brief: str = "",
    covered_in_stage1: list[str] | None = None,
    custom_questions: list[str] | None = None,
) -> str:
    if hasattr(resume_brief, "skills"):
        skills: list[str] = list(resume_brief.skills or [])
    else:
        skills = list(resume_brief.get("skills", []) or [])

    jd_must_haves: list[str] = []
    for line in (context_brief or "").splitlines():
        if line.strip().lower().startswith("jd must-haves"):
            rhs = line.split(":", 1)[-1].strip()
            if rhs and rhs.lower() not in ("not available", "no", "none"):
                jd_must_haves = [p.strip() for p in rhs.split(",") if p.strip()]
            break

    _GENERIC = {"ai", "rest", "api", "ml", "it", "erp", "crm", "iot", "bi", "ui", "ux",
                "0-1 years of experience", "build and manage outreach systems",
                "set up and optimize lead generation workflows"}
    combined = list(dict.fromkeys(
        s for s in (jd_must_haves + [str(s).strip() for s in skills])
        if s.strip() and s.strip().lower() not in _GENERIC
    ))[:6]

    covered = [c.lower() for c in (covered_in_stage1 or [])]
    fresh_skills = [s for s in combined if not any(c in s.lower() or s.lower() in c for c in covered)]
    already_touched = [s for s in combined if any(c in s.lower() or s.lower() in c for c in covered)]

    skills_block = ""
    if fresh_skills:
        skills_block += "Probe these (not yet covered):\n" + "\n".join(f"  • {s}" for s in fresh_skills)
    if already_touched:
        skills_block += "\n\nAlready discussed in Stage 1 — go DEEPER, don't re-ask setup:\n" + "\n".join(f"  • {s}" for s in already_touched)
    if not skills_block:
        skills_block = "  • (use skills mentioned in Stage 1)"

    band_instinct = {
        "fresher": "Ask WHERE and HOW they used each skill in a real project. What broke? What did they have to figure out?",
        "mid": "Ask what they personally built with each skill. What tradeoff did they make? What would they do differently?",
        "experienced": "Probe scale, failure modes, architectural decisions. A vague answer means they didn't own it.",
        "senior": "Probe strategic choices behind each skill. How did they influence others to adopt or change approaches?",
    }.get(band, "Probe real usage and ownership of each skill.")

    cq_block = _build_custom_questions_block(custom_questions, "STAGE 2")
    return (
        f"[DO NOT SAY ALOUD][STAGE 2: SKILL]\n\n"
        f"RESUME STAGE IS COMPLETE. Do NOT go back to resume walkthrough questions.\n\n"
        f"GOAL: Understand how deep this candidate actually goes on the skills that matter for this role.\n"
        f"You have ~7 minutes. Explore their skills naturally, and weave in at least one situational\n"
        f"and at least one behavioral question. You can ask more than one of each if the conversation opens up.\n\n"
        f"QUOTA — complete before this stage ends (track quietly, never announce):\n"
        f"  ☐ At least 1 SITUATIONAL question — a 'what would you do if...' tied to a real skill they used.\n"
        f"    Bring it up naturally when there's an opening. Sound genuinely interested, not scripted.\n"
        f"  ☐ At least 1 BEHAVIORAL question — a real moment they experienced with that skill, not a hypothetical.\n"
        f"    Bring it up when the skill conversation naturally invites it.\n\n"
        f"YOUR INSTINCT: {band_instinct}\n\n"
        f"SKILL MATERIAL:\n{skills_block}\n"
        f"{cq_block}\n"
        f"HOW TO MOVE:\n"
        f"  → Pick the most important skill first. Ask where and how they used it in something real.\n"
        f"  → For skills already touched in Stage 1 — don't re-ask the basics. Go deeper: what broke, what was hard.\n"
        f"  → After at most 2 follow-ups on a skill, switch to a different uncovered skill or a different real example.\n"
        f"  → Drop in the situational or behavioral when it fits — never announce the type.\n"
        f"  → When a skill is covered, move to the next naturally. Never ask 'Do you know X?'\n"
        f"  → One question per turn. Warm, direct, curious."
    )
