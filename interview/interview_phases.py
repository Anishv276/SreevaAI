"""
Interview phase helpers — 5-stage turn-based flow.

Flow: greeting → warmup → Stage 1 (RESUME) → Stage 2 (SKILL) → Stage 3 (SITUATIONAL) → Stage 4 (BEHAVIORAL)
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
    InterviewStageConfig(index=0, name="resume",      label="RESUME",      turn_budget=5),
    InterviewStageConfig(index=1, name="skill",       label="SKILL",       turn_budget=5),
    InterviewStageConfig(index=2, name="situational", label="SITUATIONAL", turn_budget=5),
    InterviewStageConfig(index=3, name="behavioral",  label="BEHAVIORAL",  turn_budget=5),
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


# ---------------------------------------------------------------------------
# Stage 1 — RESUME
# Goal: understand what this person actually built and owned, not what's on paper
# ---------------------------------------------------------------------------

def build_stage_1_resume_directive(*, band: str, resume_brief: _BriefType) -> str:
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

    # Opening move based on anchor type
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
            "If they're vague, try: 'Walk me through one specific day of work on that — what were you actually doing?'"
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

    return (
        f"[DO NOT SAY ALOUD][STAGE 1: RESUME]\n\n"
        f"GOAL: Understand what {'' if band != 'fresher' else 'this fresher '}candidate actually built and owned — "
        f"not what's written on the resume.\n\n"
        f"OPENING MOVE: {opening}\n\n"
        f"AVAILABLE MATERIAL (work through this — don't rotate mechanically, follow what's interesting):\n"
        f"{material}\n\n"
        f"YOUR INSTINCT FOR THIS CANDIDATE:\n{band_instinct}\n\n"
        f"HOW TO MOVE:\n"
        f"  → Start with the anchor. Pull on whatever they say — a tool they mention, a decision they made, something that broke.\n"
        f"  → When a thread is exhausted or they've said 'I don't know'/'I forgot' twice on the same topic, move to the next item.\n"
        f"  → Don't ask about the same thing three times. If they can't answer, accept it and move on.\n"
        f"  → Stay in resume territory — no skill probing, no hypotheticals yet.\n"
        f"  → One question per turn. React to what they actually said before asking the next thing."
    )


# ---------------------------------------------------------------------------
# Stage 2 — SKILL
# Goal: probe depth on specific skills — built dynamically at injection time
# so it knows what Stage 1 already covered
# ---------------------------------------------------------------------------

def build_stage_2_skill_directive(
    *,
    band: str,
    resume_brief: _BriefType,
    context_brief: str = "",
    covered_in_stage1: list[str] | None = None,
) -> str:
    if hasattr(resume_brief, "skills"):
        skills: list[str] = list(resume_brief.skills or [])
    else:
        skills = list(resume_brief.get("skills", []) or [])

    # Pull JD must-haves
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

    # Mark which skills were already discussed in Stage 1
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

    return (
        f"[DO NOT SAY ALOUD][STAGE 2: SKILL]\n\n"
        f"GOAL: Understand HOW DEEP this candidate actually goes on the skills that matter for this role.\n"
        f"Not 'do you know X' — you already know they claimed it. You want the real story behind it.\n\n"
        f"YOUR INSTINCT: {band_instinct}\n\n"
        f"SKILL MATERIAL:\n{skills_block}\n\n"
        f"HOW TO MOVE:\n"
        f"  → Pick the most relevant skill first. Ask where/how they used it in something real.\n"
        f"  → Follow what's interesting — a failure, a tradeoff, something they had to figure out.\n"
        f"  → For skills already touched in Stage 1: don't re-ask how they used it — ask what was hard, what broke, what they'd change.\n"
        f"  → When a skill is exhausted (you got something concrete or confirmed there's nothing there), move to the next.\n"
        f"  → Never ask 'Do you know X?' — ground every question in what they already mentioned.\n"
        f"  → One question per turn."
    )


# ---------------------------------------------------------------------------
# Stage 3 — SITUATIONAL
# Goal: test judgment — how they think under pressure or ambiguity
# ---------------------------------------------------------------------------

def build_stage_3_situational_directive(
    *,
    band: str,
    context_brief: str = "",
    covered_topics: list[str] | None = None,
) -> str:
    seeds = context_brief.strip() or "Use the projects and skills already discussed."
    covered_note = (
        f"Already covered: {', '.join(covered_topics[:4])}. Build your scenario from something different.\n"
        if covered_topics else ""
    )

    band_instinct = {
        "fresher": (
            "Build the scenario from something they actually built. Make it concrete and real.\n"
            "Example: 'You mentioned the lead qualification workflow — what would you do if the Instagram source suddenly stopped sending leads?'\n"
            "You want: do they have a mental model for how the system works, or did they just follow instructions?"
        ),
        "mid": (
            "Give them competing priorities or an unclear requirement on something they owned.\n"
            "Example: 'Your client wants you to change the qualification criteria mid-campaign — how do you handle that?'\n"
            "You want: do they think about impact before acting, or do they just execute?"
        ),
        "experienced": (
            "Give them a real constraint — scale, reliability, a stakeholder conflict.\n"
            "You want: how they reason through tradeoffs, what they'd sacrifice and why."
        ),
        "senior": (
            "Give them an ambiguous strategy call or a situation where they have to influence without authority.\n"
            "You want: how they decide when there's no clear right answer."
        ),
    }.get(band, "Build a realistic scenario from their background. Test decision quality, not knowledge.")

    return (
        f"[DO NOT SAY ALOUD][STAGE 3: SITUATIONAL]\n\n"
        f"GOAL: Test how this candidate thinks when something goes wrong or gets ambiguous — not what they know.\n\n"
        f"YOUR INSTINCT:\n{band_instinct}\n\n"
        f"{covered_note}"
        f"SCENARIO MATERIAL (anchor your scenario to one of these — make it feel real, not hypothetical):\n{seeds}\n\n"
        f"HOW TO MOVE:\n"
        f"  → Set the scene briefly. Make it specific to something they've actually done.\n"
        f"  → Ask what they'd do FIRST and WHY — you want their decision logic, not the full plan.\n"
        f"  → Follow up on the risk or tradeoff: 'What could go wrong there?' or 'What are you giving up with that choice?'\n"
        f"  → If they say 'I don't know' or go blank: simplify the scenario once, then move on.\n"
        f"  → One question per turn."
    )


# ---------------------------------------------------------------------------
# Stage 4 — BEHAVIORAL
# Goal: find a real human moment — how they actually behaved under pressure
# ---------------------------------------------------------------------------

def build_stage_4_behavioral_directive(
    *,
    band: str,
    context_brief: str = "",
    covered_topics: list[str] | None = None,
) -> str:
    context = context_brief.strip() or "Use what was discussed in earlier stages."
    covered_note = (
        f"Already covered: {', '.join(covered_topics[:4])}. Pick a different moment.\n"
        if covered_topics else ""
    )

    band_instinct = {
        "fresher": (
            "Ask about a real moment — not a career story, a human one.\n"
            "Something went wrong. They got feedback that stung. They disagreed with someone.\n"
            "Example: 'Tell me about a time something broke and it was your fault — what happened?'\n"
            "You want: do they own it, or do they deflect? Do they learn, or do they explain?"
        ),
        "mid": (
            "Ask about conflict, a missed deadline, or pushback they had to navigate.\n"
            "You want: what THEY did — not what the team did. Push for 'I' not 'we'.\n"
            "If the story is too clean, ask what they'd do differently."
        ),
        "experienced": (
            "Ask about owning a failure, mentoring someone through difficulty, or influencing without authority.\n"
            "You want: real stakes, real consequences, real reflection."
        ),
        "senior": (
            "Ask about a hard people decision, reversing a public call, or navigating values vs delivery pressure.\n"
            "You want: how they hold up when the answer isn't clean."
        ),
    }.get(band, "Ask for a concrete moment: conflict, failure, or collaboration under real pressure.")

    return (
        f"[DO NOT SAY ALOUD][STAGE 4: BEHAVIORAL]\n\n"
        f"GOAL: Find one real human moment that reveals how this candidate actually behaves — not how they describe themselves.\n\n"
        f"YOUR INSTINCT:\n{band_instinct}\n\n"
        f"{covered_note}"
        f"CONTEXT FROM EARLIER STAGES (use this to make the opener feel personal, not generic):\n{context}\n\n"
        f"HOW TO MOVE:\n"
        f"  → Open by referencing something real from their background — a project, a tool, a situation they mentioned.\n"
        f"  → Ask what actually happened — not 'tell me about a time', but something more specific to what you heard.\n"
        f"  → Follow up: what did THEY personally do? Then: what would they do differently?\n"
        f"  → Push for 'I' not 'we'. If they keep saying 'we', ask: 'What was specifically your call in that?'\n"
        f"  → If they say 'I forgot' or go blank: try one simpler angle, then close the stage naturally.\n"
        f"  → One question per turn. Wind down naturally — don't announce you're ending."
    )