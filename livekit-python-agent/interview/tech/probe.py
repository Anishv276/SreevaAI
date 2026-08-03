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

    Branch A (resume grounding) applies to FOLLOW-UPS on any topic, and uses
    used_project_skills to keep each topic's project question distinct from the ones
    already asked about that project on earlier topics.
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

    # Branch A — resume-grounded follow-up.
    #
    # Eligible on ANY follow-up, not just the first: once the candidate has answered the
    # cold opening question, tying the topic to something they actually built is the
    # strongest follow-up available, and a topic that supports three good project-grounded
    # questions should get three. The dimension rotation (below, and in scoring.py's
    # points call) is what keeps them from repeating.
    #
    # Never fires on the opening question of a topic -- topic_follow_ups is 0 there, and
    # the cold-open rule in prompts.py owns that turn.
    if (
        topic_follow_ups >= 1
        and signal not in _RESUME_INELIGIBLE
        and matched_resume_project
    ):
        # Provenance keys must match what agent_runtime reads back (follow_up_source /
        # referenced_project / skill_matched) -- it uses them to record the
        # (project, skill) pair in used_project_skills so the SAME project is never
        # asked about from the SAME angle twice. Writing only "matched_project" here
        # left that set permanently empty and the de-duplication dead.
        if provenance_out is not None:
            provenance_out.update({
                "follow_up_source": "resume_project",
                "referenced_project": matched_resume_project,
                "skill_matched": active_topic or "",
                "matched_project": matched_resume_project,  # back-compat for existing consumers
            })

        # Angles already spent on THIS project in earlier topics. The pair is
        # (project, skill), so the same project stays fully eligible for a new topic --
        # it just has to be approached from a different side than last time.
        _spent_skills = sorted({
            skill for proj, skill in (used_project_skills or set())
            if proj == matched_resume_project.strip().lower()
            and skill and skill != (active_topic or "").strip().lower()
        })

        lines += [
            f"ROUTE: resume_grounded_probe",
            f"PROJECT: {matched_resume_project} — they built this. You already know that.",
            f"ACTIVE TOPIC: {active_topic or '(unknown)'} — this is what the question must test.",
            "",
            "Ask a TECHNICAL question about the active topic, set inside this project.",
            "Shape: \"on <project>, how did you <topic-specific technical thing>?\"",
            "",
        ]

        if _spent_skills:
            lines += [
                "ALREADY USED THIS PROJECT FOR: " + ", ".join(_spent_skills),
                "This topic is different, so the project question must be different too — a new",
                "part of that system, a different decision inside it. Reusing the same detail",
                "you already discussed makes the whole interview feel like one recycled question.",
                "",
            ]

        lines += [
            "PICK ONE ANGLE — whichever their last answer left most open, and one you have",
            "not already used on this topic (check AVOID / already-asked below):",
            "  METRICS     — scale, latency, throughput, volume, error rate they actually hit",
            "  TOOLS       — what they reached for there, and why that over the alternative",
            "  OWNERSHIP   — what THEY decided or built, when their answer is all \"we\"",
            "  EXAMPLE     — one specific thing that happened while building it",
            "  USE CASE    — where this applied in that project, and where it did not",
            "  APPLICATION — how the concept they just described lands inside that system",
            "  ANALOGY     — make them map the concept onto their own system to prove it",
            "  STANDARDS   — does their approach match how it's normally done? why diverge?",
            "",
            "HARD RULES:",
            "  - Never ask IF they built it, or to describe it. Straight to the technical ask.",
            "  - Never say \"your resume\" / \"I saw\" / \"it says here\". Name the project directly.",
            "  - Stay on the ACTIVE TOPIC. The project is the setting, not a new subject.",
        ]

        if pts:
            lines.append("")
            lines.append("POINTS from this turn's analysis (fold the top one into the project question):")
            lines += [f"  {i}. {p}" for i, p in enumerate(pts, 1)]
        if av:
            lines.append("")
            lines.append("AVOID (already covered / do not re-ask):")
            lines += [f"  - {a}" for a in av]

        trend = _render_score_trend(topic_score_history)
        if trend:
            lines.append(f"SCORE TREND: {trend}")
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
