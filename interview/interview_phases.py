"""
Interview phase helpers — single unified 20-minute interview.

Flow: greeting → warmup → unified interview stage (full 20min)
The single stage covers resume projects/work and JD skills. Hard moments
(pressure/situational/behavioral) emerge naturally via the probe system's
"pressure" family — not scheduled as a separate quota.
"""

from __future__ import annotations
import random
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
        "[WARMUP PHASE — DO NOT START THE INTERVIEW YET]\n"
        "CRITICAL: You are still in WARMUP. Do NOT ask any resume or technical question yet.\n"
        "Do NOT mention any project, skill, or role from the candidate's background.\n"
        "Your ONLY job this turn: react to what the candidate said + ask ONE simple readiness check.\n"
        "\n"
        "React naturally to what the candidate just said. Keep it SHORT — two sentences max.\n"
        "  Sentence 1: Respond like a real person who just had a busy day. You can riff off what they said,\n"
        "    mention it's been a busy day, or just sound like someone who's genuinely glad to talk.\n"
        "    Vary your tone — relaxed, a little dry humor, warm, whatever fits the moment.\n"
        "    AVOID: 'packed day of interviews', 'happy to have a good chat', 'happy to chat' — these sound canned.\n"
        "    AVOID: starting with 'Ha,' — it reads as scripted.\n"
        "    Good examples (DO NOT copy verbatim — use as tone references only):\n"
        "      'Nice, same here — it's been one of those days. Good to finally slow down a bit.'\n"
        "      'Glad to hear it. Honestly been a whirlwind today, so this is a good change of pace.'\n"
        "      'Oh yeah, I hear you — today's been nonstop. Let's make this a good one.'\n"
        "  Sentence 2: Ask ONE simple readiness check — nothing more.\n"
        "    Examples: 'Ready to dive in?' / 'Shall we get going?' / 'Ready when you are.'\n"
        "Do NOT say 'Thanks for sharing that', 'Just making sure', 'Absolutely', or any call-center phrase.\n"
        "Sound like a real recruiter, not a bot.\n"
        "WAIT for the candidate to confirm before starting the interview."
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
        # Pre-select one angle so the LLM can't default to the same opener every session.
        # All angles are about the anchor — they vary HOW we enter it, not WHAT we ask about.
        _project_angles = [
            f"Ask what problem {anchor_name} was built to solve and what made that problem worth solving.",
            f"Pick one specific detail from this context and ask about it directly: {anchor_detail}",
            f"Ask what they would do differently if they rebuilt {anchor_name} from scratch today.",
            f"Ask how they knew {anchor_name} was actually working — what did success look like in practice.",
            f"Ask what the first thing they built for {anchor_name} was and how it evolved from there.",
            f"Ask what the trickiest decision they made while building {anchor_name} was.",
        ]
        _chosen_angle = random.choice(_project_angles)
        opening = (
            f"Open on: {anchor_name}.\n"
            f"Context from resume: {anchor_detail}\n"
            f"YOUR OPENING ANGLE THIS SESSION: {_chosen_angle}\n"
            f"ONE question only. Stay on {anchor_name} — do not switch topics."
        )
    elif anchor_type in ("role", "internship"):
        _role_angles = [
            f"Ask what a typical day actually looked like at {anchor_name} — what they spent most of their time on.",
            f"Ask what the first thing they owned independently was when they started at {anchor_name}.",
            f"Ask what the most interesting problem they worked on at {anchor_name} was.",
            f"Ask what changed or improved because of their specific contribution at {anchor_name}.",
        ]
        _chosen_angle = random.choice(_role_angles)
        opening = (
            f"Open on their role at: {anchor_name}.\n"
            f"Context: {anchor_detail}\n"
            f"YOUR OPENING ANGLE THIS SESSION: {_chosen_angle}\n"
            f"ONE question only. Stay on {anchor_name}."
        )
    else:
        opening = (
            "Open by asking what they've been working on most recently. "
            "Pick a specific angle — what they're most proud of, or what was the core problem they solved."
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

    # Band-aware coverage goals and mandatory quota.
    # Research basis: as seniority increases, interviews shift from breadth → depth.
    # Fresher: cover many topics lightly (5-6), understand how they think.
    # Mid: balance breadth + depth (4-5 topics), push ownership.
    # Experienced: fewer topics (3-4), probe architecture/tradeoffs deeply.
    # Senior: 2-3 critical topics, deep probing, challenge strategic judgment.
    # NOTE: Situational and behavioral questions are NOT listed here.
    # The probe system handles them automatically via the "pressure" family —
    # it fires when a story is too clean, no friction, or a hard moment is needed.
    # Listing them as a quota creates noise: the LLM tries to manually schedule them
    # instead of letting them emerge naturally from the conversation flow.
    coverage_goals, mandatory_quota, how_to_move_extra = {
        "fresher": (
            (
                "  1) Start with the anchor project. Ask what they personally built and why.\n"
                "  2) Cover ALL resume projects and internships — breadth matters here.\n"
                "  3) Probe JD skills as time allows — keep going until time is up."
            ),
            (
                "  ☐ Anchor project + as many other resume items as time allows.\n"
                "  ☐ JD skills — probe as many as time allows, no fixed minimum."
            ),
            "  → BREADTH FIRST — cover more topics with 2-3 follow-ups each. Move on when you have signal.\n"
            "  → Accept incomplete answers — they're learning. Note gaps, don't dwell.\n"
            "  → If one area runs dry, immediately move to the next: skills, learning, aspirations, projects.\n"
            "  → If they say they don't know — acknowledge briefly, move on. Never dwell on a gap.\n",
        ),
        "mid": (
            (
                "  1) Start with the anchor. Ask what they personally owned, not what the team did.\n"
                "  2) Cover resume items (work roles + projects) — push past 'we' language.\n"
                "  3) Probe JD skills as time allows — real usage in production."
            ),
            (
                "  ☐ Anchor + other resume roles/projects — their specific contribution each time.\n"
                "  ☐ JD skills — probe as many as time allows, no fixed minimum."
            ),
            "  → BALANCED — 3-4 follow-ups per topic. Move on when you have clear ownership signal.\n"
            "  → If they say 'we', always ask: 'What was specifically yours in that?'\n"
            "  → If one area runs dry, move immediately to the next topic.\n",
        ),
        "experienced": (
            (
                "  1) Start with the anchor. Expect end-to-end ownership — probe tradeoffs immediately.\n"
                "  2) Cover key roles/projects deeply — architecture decisions, scale, consequences.\n"
                "  3) Probe JD must-have skills as time allows — real production depth."
            ),
            (
                "  ☐ Anchor + other major roles/projects — deep ownership each time.\n"
                "  ☐ JD skills — probe as many as time allows, architecture-level."
            ),
            "  → DEPTH OVER BREADTH — 4-5 follow-ups per topic. Vague = probe harder, not move on.\n"
            "  → If an answer is too clean, ask what went wrong or what they'd do differently.\n",
        ),
        "senior": (
            (
                "  1) Start with the anchor initiative. Probe strategic judgment — why, what risk, what outcome.\n"
                "  2) Go deep on critical areas — org impact, architecture at scale, high-stakes calls.\n"
                "  3) Challenge their decisions directly — seniors should defend them with confidence.\n"
                "  4) Probe JD skills as time allows — only where they intersect with strategic decisions."
            ),
            (
                "  ☐ Anchor initiative probed deeply — strategic reasoning, org impact, what they'd change.\n"
                "  ☐ At least 1 other critical area — architectural judgment or leadership decision."
            ),
            "  → DEPTH ONLY — 5-6 follow-ups on critical topics. Breadth is secondary.\n"
            "  → Peer-level conversation — challenge reasoning directly, not with softeners.\n"
            "  → If they give a polished answer, press: 'What would have happened if you were wrong?'\n",
        ),
    }.get(band, (
        (
            "  1) Start with the anchor. Probe ownership and decisions.\n"
            "  2) Cover resume projects and work history.\n"
            "  3) Probe JD skills as time allows."
        ),
        (
            "  ☐ Anchor + resume items as time allows.\n"
            "  ☐ JD skills — probe as many as time allows."
        ),
        "",
    ))

    return (
        f"[DO NOT SAY ALOUD]\n\n"
        f"GOAL: In the next ~19 minutes, understand who this candidate really is —\n"
        f"what they built, what they own, how they think, and how deep their skills go.\n\n"
        f"COVERAGE GOALS (background plan — a [NEXT_TURN_DIRECTIVE] always overrides this):\n"
        f"{coverage_goals}\n\n"
        f"IMPORTANT: If a [NEXT_TURN_DIRECTIVE] or [TOPIC_LOCK] appears in this context, follow it\n"
        f"EXACTLY and IMMEDIATELY — it is a real-time routing decision and overrides the coverage plan above.\n\n"
        f"MANDATORY QUOTA (complete all before wrap-up — track quietly, never announce):\n"
        f"{mandatory_quota}\n\n"
        f"OPENING MOVE: {opening}\n\n"
        f"YOUR INSTINCT FOR THIS CANDIDATE ({band.upper()}):\n{band_instinct}\n"
        f"{cq_block}\n"
        f"HOW TO MOVE:\n"
        f"  → Always follow the [NEXT_TURN_DIRECTIVE] when present — it tells you exactly what to do next.\n"
        f"  → Start with the anchor. Follow what they say — a tool, a decision, something that broke.\n"
        f"{how_to_move_extra}"
        f"  → When a skill comes up naturally in a project story, drill into it right there — no need to wait.\n"
        f"  → ONE question per turn ONLY — never bundle two questions together with 'and' or commas.\n"
        f"  → Short, warm, direct.\n"
        f"  → Do NOT wrap up or say goodbye until the system signals you to.\n\n"
        f"IF TOPICS RUN DRY — keep going with adaptive questions (pick what fits):\n"
        f"  'What are you learning or building right now outside of work?'\n"
        f"  'What kind of work do you most enjoy doing day-to-day?'\n"
        f"  'What drew you to this specific role?'\n"
        f"  'What does your best work look like — give me one example.'\n"
        f"  'What skill are you actively trying to get better at?'\n"
        f"  'If you could pick one area to grow in over the next year, what would it be?'\n"
        f"There is always something to ask. Never close early."
    )
