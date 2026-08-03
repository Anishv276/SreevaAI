"""
interview/tech/probe.py
=======================
Turns eval POINTS (+ thin routes) into the WHAT TO PROBE block for the speaking LLM.

No content-signal taxonomy. Scoring/points live in scoring.py.
"""
from __future__ import annotations

from typing import Any


_RESUME_INELIGIBLE: frozenset[str] = frozenset({
    "clarification_request", "rephrase_request", "off_topic", "pure_denial",
})

_LEVEL_GUIDE: dict[int, str] = {
    1: "LEVEL 1 — one step past their answer. Prefer TRACE. Avoid scale/org stakes.",
    2: "LEVEL 2 — mechanism is the floor; push one real tradeoff or failure mode.",
    3: "LEVEL 3 — judgment required. Prefer forced choice / escalate under a constraint.",
    4: "LEVEL 4 — second-order reasoning. Push where their approach is the wrong call.",
}

CODE_CARD_CONTRACT = """\
═══ CODE ON SCREEN — HARD CONTRACT ═══
If the question needs code, emit a fenced block (code_trace|snippet_eval|query_trace).
Never point at "this/here's" without a fence. Spoken setup <12 words, one '?'.
Follow-ups stay grounded to the snippet. Never ask if they built this in a real project."""

_QUESTION_GEN = """\
You are Ishitha, a sharp warm AI interviewer on a live technical call.

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
(one input, one line of code, one yes/no call) rather than rephrasing the same abstract ask.
Do not open with "Imagine"/"Picture this"/"Let's say" — vary the shape of your question every
turn, and never start two questions in a row with the same word.

{code_card_contract}
"""

def render_question_generation_system(
    level: int = 2,
    signal: str | None = None,
    last_question_type: str = "",
) -> str:
    _is_code = last_question_type.strip().lower() in ("code_trace", "snippet_eval", "query_trace")
    if signal == "pure_denial":
        _is_code = False
    return _QUESTION_GEN.format(
        level_guide=_LEVEL_GUIDE.get(level or 2, _LEVEL_GUIDE[2]),
        code_card_contract=CODE_CARD_CONTRACT if _is_code else "",
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
    Branch A resume grounding still applies on the first follow-up when eligible.
    """
    _ = (signals, signals_history, cross_cutting_signal, level)  # compat / reserved
    lines: list[str] = []

    pts = [p for p in (points or []) if p]
    av = [a for a in (avoid or []) if a]

    # Denial
    if topic_denied or signal == "pure_denial":
        lines += [
            "ROUTE: pure_denial",
            "GOAL: Accept cleanly; ask an EASIER question on the SAME skill.",
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
            "more concrete, or come at the same skill from another direction entirely.",
        ]
        if pts:
            lines.append("REDIRECT POINTS:")
            lines += [f"  {i}. {p}" for i, p in enumerate(pts, 1)]
        if av:
            lines.append("AVOID (already asked / already failed — do not re-ask):")
            lines += [f"  - {a}" for a in av]
        return "\n".join(lines)

    # Branch A — resume project (once per topic)
    if (
        topic_follow_ups <= 1
        and signal not in _RESUME_INELIGIBLE
        and matched_resume_project
    ):
        if provenance_out is not None:
            provenance_out.update({"matched_project": matched_resume_project})
        
        lines += [
            f"RESUME MATCH: They mentioned {matched_resume_project} on their resume.",
            "Ask them to relate their answer specifically to this project or tool.",
            "Focus on:",
            "  - ARCHITECTURE (How did they design or integrate this?)",
            "  - TRADEOFFS (What scale or constraints forced this choice?)",
            "  - FAILURES (What broke, or what were the hard edges of this project?)",
        ]
        
        if pts:
            lines.append("")
            lines.append("SECONDARY POINTS (only if they fit the project question naturally):")
            lines += [f"  - {p}" for p in pts[:2]]
        return "\n".join(lines)

    # Default: points-driven probe
    lines.append(f"ROUTE: {signal or 'probe'}")
    if signal_reason:
        lines.append(f"TRIGGER: \"{signal_reason}\"")
    if pts:
        lines.append("POINTS FOR NEXT QUESTION (hit #1; weave #2 only if natural):")
        lines += [f"  {i}. {p}" for i, p in enumerate(pts, 1)]
        lines.append(
            "A point may carry a COVERAGE DIMENSION tag (MECHANISM / TOOLS / APPLICATION / "
            "EXAMPLE / OWNERSHIP / TRADEOFF / FAILURE / OUTCOME). That tag is the ANGLE to take "
            "— ask the topic from that side. Never say the tag out loud."
        )
    else:
        lines.append("POINTS: (none) — ask one concrete follow-up on what they just said, stay on topic.")
    if av:
        lines.append("AVOID (already covered / do not re-ask):")
        lines += [f"  - {a}" for a in av]

    lqt = (last_question_type or "").strip().lower()
    if lqt in ("code_trace", "snippet_eval", "query_trace"):
        lines.append(f"LAST QUESTION TYPE: {lqt.upper()} — ground follow-up in the snippet on screen.")

    if topic_follow_ups <= 1:
        lines.append("NOTE: First probe — pull the most specific thread from their answer.")

    trend = _render_score_trend(topic_score_history)
    if trend:
        lines.append(f"SCORE TREND: {trend}")

    return "\n".join(lines)
