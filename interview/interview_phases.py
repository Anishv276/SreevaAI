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
        "React to what the candidate just said. TWO sentences only:\n"
        "  Sentence 1: A warm, casual reply — mention you've been doing a lot of interviews today\n"
        "    and you're happy to have a good chat. Be genuine, not scripted.\n"
        "    Example feel (not exact words): 'Ha, good! Been a packed day of interviews — happy to\n"
        "    have a good chat now.'\n"
        "  Sentence 2: Check they're ready. One short question — 'Ready to jump in?' or 'All set?'\n"
        "Do NOT say 'Thanks for sharing that', 'Just making sure', or any checklist phrase.\n"
        "Sound like a real person, not a customer service agent.\n"
        "Once they say yes/ready: say 'Great, let's get into it!' and start the interview."
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

    anchor_name = anchor.split(' - ')[0].strip()
    anchor_detail = anchor.split(' - ')[1].strip() if ' - ' in anchor else ""

    if anchor_type == "project":
        opening = (
            f"Open on: {anchor_name}.\n"
            f"Context from resume: {anchor_detail}\n"
            f"DO NOT use a fixed opener. Pick ONE angle that feels natural given the context above.\n"
            f"Options (pick the most natural one, or make your own variant):\n"
            f"  - Ask about the problem they were solving and what they built to solve it\n"
            f"  - Ask what the hardest part of building it was\n"
            f"  - Ask what they'd do differently if they rebuilt it today\n"
            f"  - Pick a specific detail from the resume context and ask about it directly\n"
            f"ONE question only. Do NOT say 'what did you personally build or own' — that's a script, not a conversation."
        )
    elif anchor_type in ("role", "internship"):
        opening = (
            f"Open on their role at: {anchor_name}.\n"
            f"Context: {anchor_detail}\n"
            f"Ask something specific about their day-to-day work — what they actually did, "
            f"not a generic 'what did you do there?' ONE question, natural."
        )
    else:
        opening = (
            "Open by asking what they've been working on most recently. "
            "Pick a specific angle — what they're most proud of, or what was hardest."
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
        f"COVERAGE GOALS (background plan — a [NEXT_TURN_DIRECTIVE] always overrides this):\n"
        f"  1) Start with the anchor project below. Ask what they personally built and owned.\n"
        f"  2) Move through other resume projects, work history, and internships.\n"
        f"  3) Probe JD skills that haven't surfaced naturally from resume discussion.\n"
        f"  4) Weave in at least 1 SITUATIONAL question naturally during the conversation.\n"
        f"  5) Weave in at least 1 BEHAVIORAL question naturally during the conversation.\n\n"
        f"IMPORTANT: If a [NEXT_TURN_DIRECTIVE] or [TOPIC_LOCK] appears in this context, follow it\n"
        f"EXACTLY and IMMEDIATELY — it is a real-time routing decision and overrides the coverage plan above.\n\n"
        f"MANDATORY QUOTA (complete all before wrap-up — track quietly, never announce):\n"
        f"  ☐ Resume anchor + at least 2 other resume items (projects / work / internship).\n"
        f"  ☐ At least 2 JD skills probed — where/how used in a real project.\n"
        f"  ☐ At least 1 SITUATIONAL — 'What would you do if...' anchored to real work.\n"
        f"  ☐ At least 1 BEHAVIORAL — 'Tell me about a time when...' a real lived moment.\n\n"
        f"OPENING MOVE: {opening}\n\n"
        f"YOUR INSTINCT FOR THIS CANDIDATE ({band}):\n{band_instinct}\n"
        f"{cq_block}\n"
        f"HOW TO MOVE:\n"
        f"  → Always follow the [NEXT_TURN_DIRECTIVE] when present — it tells you exactly what to do next.\n"
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
