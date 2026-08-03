"""
interview/conversational/probe.py
=======================
Turns eval POINTS (+ thin routes) into the WHAT TO PROBE block for the speaking LLM.

No content-signal taxonomy. Scoring/points live in scoring.py.
"""
from __future__ import annotations

from typing import Any

_LEVEL_GUIDE: dict[int, str] = {
    1: "LEVEL 1 — one step past their answer. Forgive nervousness. Accept practice/internship numbers.",
    2: "LEVEL 2 — push for a real number, real constraint, or real objection they handled.",
    3: "LEVEL 3 — expect precision (win rate, ACV, tradeoff rationale). Push where reasoning is weak.",
    4: "LEVEL 4 — strategic judgment. Push on territory/team-level metrics and complex deal friction.",
}

_QUESTION_GEN = """\
You are Ishitha, a sharp warm AI interviewer on a live sales/conversational call.

{level_guide}

YOUR JOB: Read WHAT TO PROBE (points + avoid). Ask ONE real interviewer question.
Hit the top point. Fold a second point in only if it fits naturally as one question.
Do not sound like a rubric or checklist.

HOW TO BUILD:
1. REACTION — brief, grounded in a word they used. Never 'Great!' / 'Awesome!'.
2. QUESTION — one focused move, 40–80 words.
ABSOLUTELY NO COMPOUND QUESTIONS. You must ask EXACTLY ONE thing. Do not use 'and' to chain two questions together.
Stay on the ACTIVE TOPIC LOCK below. If points say redirect (off-topic), steer back.

NEVER RE-ASK: if they already failed or dodged an angle, asking it again in different words is
not a follow-up — it is the same question wearing a hat, and it reads as not listening. Each turn
must open a genuinely NEW angle. When an answer came back empty, go SMALLER and more concrete
(one deal, one number, one call) rather than rephrasing the same abstract ask.
Do not open with "Imagine"/"Picture this"/"Let's say" — vary the shape of your question every
turn, and never start two questions in a row with the same word.
"""

def render_question_generation_system(
    level: int = 2,
    signal: str | None = None,
    last_question_type: str = "",
) -> str:
    return _QUESTION_GEN.format(
        level_guide=_LEVEL_GUIDE.get(level or 2, _LEVEL_GUIDE[2]),
    )


QUESTION_GENERATION_SYSTEM = render_question_generation_system(2)
REACTION_POLICY = "React to substance (Hmm/Got it/Right). Never Great!/Awesome!."


def _render_score_trend(topic_score_history: list[float] | None) -> str | None:
    hist = [s for s in (topic_score_history or []) if s is not None]
    if len(hist) < 2:
        return None
    path = " → ".join(f"{s:.1f}" for s in hist)
    delta = hist[-1] - hist[-2]
    if delta <= -2.5:
        read = "sharp drop — stumble on this angle"
    elif delta >= 2.5:
        read = "recovering"
    elif hist[-1] >= 7.0 and min(hist) >= 6.0:
        read = "consistently strong — push precision"
    elif hist[-1] <= 4.0 and max(hist) <= 4.5:
        read = "consistently weak — real gap"
    else:
        read = "mixed"
    return f"{path} ({read})"


def get_probe_context(
    *,
    signal: str | None,
    signal_reason: str | None,
    level: int,
    topic_follow_ups: int,
    topic_denied: bool,
    prev_answer: str,
    points: list[str] | None = None,
    avoid: list[str] | None = None,
    signals: list[str] | None = None,  # unused compat
    signals_history: list[str] | None = None,  # unused compat
    active_topic: str = "",
    prev_question: str = "",
    cross_cutting_signal: str | None = None,
    topic_score_history: list[float] | None = None,
    last_question_type: str = "",
    topic_item: Any | None = None,
    resume_json: dict | None = None,
    provenance_out: dict | None = None,
    used_project_skills: set[tuple[str, str]] | None = None,
    matched_resume_project: str | None = None,
) -> str:
    """
    Build WHAT TO PROBE from points (+ route-specific framing).

    Follow-ups may be grounded in the candidate's real work when the points call
    returns matched_resume_project; used_project_skills keeps each topic's grounded
    question distinct from the ones already asked about that same account/employer.
    """
    # resume_json / topic_item are accepted for signature parity with
    # interview.tech.probe -- the sales module takes its background from
    # matched_resume_project (decided in scoring.py) rather than raw resume JSON.
    _ = (signals, signals_history, cross_cutting_signal, level,
         resume_json, topic_item)  # compat / reserved
    lines: list[str] = []

    pts = [p for p in (points or []) if p]
    av = [a for a in (avoid or []) if a]

    # Denial
    if topic_denied or signal == "pure_denial":
        lines += [
            "ROUTE: pure_denial",
            "GOAL: Accept cleanly; ask an EASIER question on the SAME skill/topic.",
            "VOICE: Warm, low-pressure. Never re-ask the same thing.",
        ]
        if pts:
            lines.append("POINTS:")
            lines += [f"  {i}. {p}" for i, p in enumerate(pts, 1)]
        return "\n".join(lines)

    # Clarification / rephrase / off-topic
    if signal == "clarification_request":
        return "\n".join([
            "ROUTE: clarification_request",
            f"ORIGINAL QUESTION: {prev_question or '(unavailable)'}",
            f"THEIR ASK: {prev_answer}",
            "Rephrase sharper (drop jargon / compound halves). Do not narrate why it failed.",
        ])
    if signal == "rephrase_request":
        return "\n".join([
            "ROUTE: rephrase_request",
            "Grant the floor briefly if no new answer yet. If they already corrected, treat that as the answer.",
        ])
    if signal == "off_topic":
        lines = [
            "ROUTE: off_topic — THEY LEFT THE TOPIC. STEER BACK.",
            f"ACTIVE TOPIC: {active_topic or '(unknown)'}",
            f"YOU ASKED: {prev_question or '(unavailable)'}",
            f"THEY SAID (aside): {prev_answer}",
            "Acknowledge the aside in ONE short clause, then get back on the active topic.",
            "HARD RULE: Do not chase their tangent — the question must be about the active topic.",
            "HARD RULE: Ask a DIFFERENT question, not a reworded version of what you just asked. "
            "They already failed that angle; asking it again in new words teaches you nothing and "
            "makes you sound like you weren't listening. Change the angle: make it smaller and "
            "more concrete, or come at the same topic from another direction entirely.",
        ]
        if pts:
            lines.append("REDIRECT POINTS:")
            lines += [f"  {i}. {p}" for i, p in enumerate(pts, 1)]
        if av:
            lines.append("AVOID (already asked / already failed — do not re-ask):")
            lines += [f"  - {a}" for a in av]
        return "\n".join(lines)

    # Default: points-driven probe
    lines.append(f"ROUTE: {signal or 'probe'}")
    if signal_reason:
        lines.append(f"TRIGGER: \"{signal_reason}\"")
        
    # Resume grounding applies to FOLLOW-UPS only -- the opening question on a topic is
    # asked cold (that path is MOVE_ON, which never reaches get_probe_context).
    if matched_resume_project and topic_follow_ups >= 1:
        # Provenance keys must match what agent_runtime reads back so the
        # (account, topic) pair lands in used_project_skills -- that is what keeps the
        # NEXT topic's grounded question different from this one.
        if provenance_out is not None:
            provenance_out.update({
                "follow_up_source": "resume_project",
                "referenced_project": matched_resume_project,
                "skill_matched": active_topic or "",
                "matched_project": matched_resume_project,
            })

        _spent = sorted({
            skill for proj, skill in (used_project_skills or set())
            if proj == matched_resume_project.strip().lower()
            and skill and skill != (active_topic or "").strip().lower()
        })

        lines += [
            f"REAL WORK: {matched_resume_project} — they did this. You already know that.",
            f"ACTIVE TOPIC: {active_topic or '(unknown)'} — this is what the question must test.",
            "Ask a substantive question about the ACTIVE TOPIC, set inside that work.",
        ]
        if _spent:
            lines += [
                "ALREADY USED THIS FOR: " + ", ".join(_spent),
                "This topic is different, so the question must go after a different part of"
                " that work — not the same story with a new label.",
            ]
        lines += [
            "PICK ONE ANGLE not already used on this topic:",
            "  METRICS   — the real number there: quota, ACV, cycle length, win rate",
            "  OWNERSHIP — what THEY personally did, when the answer is all \"we\"",
            "  TOOLS     — what they ran the pipeline on, and why that one",
            "  EXAMPLE   — one specific deal or call from it",
            "  CUSTOMER  — that buyer's real pain, and why they bought",
            "  FRICTION  — the blocker, the objection, the deal that stalled",
            "  PROCESS   — how they qualified or forecast in that org",
            "  STANDARDS — does their approach match the norm? why diverge?",
            "HARD RULES:",
            "  - Never ask IF they worked there, or to describe the role.",
            "  - Never say \"your resume\" / \"I saw\" — name the account or employer directly.",
            "  - Stay on the ACTIVE TOPIC. Their work is the setting, not a new subject.",
        ]

    if pts:
        lines.append("POINTS FOR NEXT QUESTION (hit #1; weave #2 only if natural):")
        lines += [f"  {i}. {p}" for i, p in enumerate(pts, 1)]
        lines.append(
            "A point may carry a COVERAGE DIMENSION tag (METRICS / OWNERSHIP / TOOLS / EXAMPLE / "
            "CUSTOMER / FRICTION / PROCESS / OUTCOME). That tag is the ANGLE to take — ask the "
            "topic from that side. Never say the tag out loud."
        )
    else:
        lines.append("POINTS: (none) — ask one concrete follow-up on what they just said, stay on topic.")
    if av:
        lines.append("AVOID (already covered / do not re-ask):")
        lines += [f"  - {a}" for a in av]

    lqt = (last_question_type or "").strip().lower()

    if topic_follow_ups <= 1:
        lines.append("NOTE: First probe — pull the most specific thread from their answer.")

    trend = _render_score_trend(topic_score_history)
    if trend:
        lines.append(f"SCORE TREND: {trend}")

    return "\n".join(lines)
