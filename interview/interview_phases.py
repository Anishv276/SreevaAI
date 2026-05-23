"""
Interview phase helpers — single unified 20-minute interview.

Flow: greeting → warmup → unified interview stage (full 20min)
The single stage covers resume projects/work, JD skills, situational, and
behavioral questions — all interwoven naturally by the AI. No hard stage cut.
"""

from __future__ import annotations
from typing import Any

_BriefType = Any


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
        "The candidate just responded to your greeting. This is a quick readiness check — NOT the interview yet.\n"
        "In ONE short, friendly turn do exactly this:\n"
        "  1. Give a warm 1-sentence reaction to what they said.\n"
        "  2. Ask a simple readiness check — confirm they're all set. Use only positive framing. Examples:\n"
        "     - 'Before we dive in, are you all set on your end — audio clear, everything good?'\n"
        "     - 'Just making sure you're comfortable and ready — all good on your end?'\n"
        "     - 'Are you all set and ready to go?'\n"
        "     Pick the one that fits naturally. Never offer a negative option like 'need a moment' or 'need more time'.\n"
        "Keep it under 3 sentences. Do NOT ask about skills, experience, or the role.\n"
        "Once they confirm they're ready, say something like 'Perfect, let's dive in!' and the system will begin the interview."
    )


def _build_custom_questions_block(custom_questions: list[str] | None) -> str:
    cqs = [q.strip() for q in (custom_questions or []) if q.strip()]
    if not cqs:
        return ""
    items = "\n".join(f"  {i+1}. {q}" for i, q in enumerate(cqs))
    return (
        f"\nCUSTOM QUESTIONS (recruiter-mandated — weave naturally into the conversation, "
        f"but ALL must be asked before the interview ends):\n{items}\n"
    )


# ---------------------------------------------------------------------------
# Unified Interview Stage — full 20 minutes
# Covers: resume projects/work/internships, JD skills, situational, behavioral
# ---------------------------------------------------------------------------

def build_interview_directive(
    *,
    band: str,
    resume_brief: _BriefType,
    context_brief: str = "",
    custom_questions: list[str] | None = None,
) -> str:
    """
    Build the single system prompt for the full 20-minute interview.

    Priority order:
      1. Resume anchor project — open here, probe personal ownership
      2. Other resume projects, work history, internships
      3. JD must-have skills not already surfaced from resume discussions
      4. Situational question (at least 1, woven naturally)
      5. Behavioral question (at least 1, woven naturally)
      6. Custom recruiter questions (mandatory, woven in anytime)
    """
    # ── Opening move ─────────────────────────────────────────────────────────
    if hasattr(resume_brief, "anchor_item"):
        anchor = resume_brief.anchor_item or "their most recent work"
        anchor_type = resume_brief.anchor_type or "project"
    else:
        anchor = resume_brief.get("anchor_item", "their most recent work")
        anchor_type = resume_brief.get("anchor_type", "project")

    if anchor_type == "project":
        opening = (
            f"Open by asking what they personally built or owned in: "
            f"{anchor.split(' - ')[0].strip()}"
        )
    elif anchor_type in ("role", "internship"):
        opening = (
            f"Open by asking what they personally handled day-to-day at: "
            f"{anchor.split(' - ')[0].strip()}"
        )
    else:
        opening = (
            "Open by asking what they've been working on most recently "
            "and what was specifically theirs."
        )

    # ── Band-aware instinct ───────────────────────────────────────────────────
    band_instinct = {
        "fresher": (
            "They're early-career. You want to understand HOW they think, not just what they've done.\n"
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

    cq_block = _build_custom_questions_block(custom_questions)

    return (
        f"[DO NOT SAY ALOUD]\n\n"
        f"GOAL: In the next ~19 minutes, understand who this candidate really is —\n"
        f"what they built, what they own, how they think, and how deep their skills go.\n\n"
        f"PRIORITY ORDER (strict — follow this sequence, don't skip ahead):\n"
        f"  1) Start with the anchor project below. Ask what they personally built and owned.\n"
        f"  2) Move through other resume projects, work history, and internships.\n"
        f"  3) Probe JD skills that haven't surfaced naturally from resume discussion.\n"
        f"  4) Weave in at least 1 SITUATIONAL question naturally during the conversation.\n"
        f"  5) Weave in at least 1 BEHAVIORAL question naturally during the conversation.\n\n"
        f"MANDATORY QUOTA (complete all before wrap-up — track quietly, never announce):\n"
        f"  ☐ Resume anchor + at least 2 other resume items (projects / work / internship).\n"
        f"  ☐ At least 2 JD skills probed — where/how used in a real project.\n"
        f"  ☐ At least 1 SITUATIONAL — 'What would you do if...' anchored to real work.\n"
        f"  ☐ At least 1 BEHAVIORAL — 'Tell me about a time when...' a real lived moment.\n\n"
        f"OPENING MOVE: {opening}\n\n"
        f"YOUR INSTINCT FOR THIS CANDIDATE ({band}):\n{band_instinct}\n"
        f"{cq_block}\n"
        f"HOW TO MOVE:\n"
        f"  → Start with the anchor. Follow what they say — a tool, a decision, something that broke.\n"
        f"  → Follow the natural conversation — go deeper when needed, move on when you have enough context.\n"
        f"  → Breadth first: move through distinct topics; come back to deepen only if time allows.\n"
        f"  → When a skill comes up naturally in a project story, drill into it right there — no need to wait.\n"
        f"  → Drop in situational or behavioral when it fits — never announce the type.\n"
        f"  → Don't revisit the same area twice. Accept a weak answer and move on.\n"
        f"  → ONE question per turn ONLY — never bundle two questions together with 'and' or commas.\n"
        f"  → Short, warm, direct.\n"
        f"  → Do NOT wrap up or say goodbye until the system signals you to."
    )
