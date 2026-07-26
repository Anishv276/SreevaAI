"""
interview/tech/question_bank_adapter.py
========================================
Adapts a stored Job.questionBank snapshot (generated once at JD-creation
time via the TypeScript Calls A/B/C pipeline, frozen per-interview into
Interview.jdQuestionBankSnapshot) into an InterviewBrief-shaped object.

This is a pure data transform -- no LLM call. It exists so agent_runtime.py's
tech-interview branch, and every downstream consumer of InterviewBrief
(phases.py::build_interview_directive, the topic-pool iteration in
agent_runtime.py), can keep working completely unchanged: they only ever see
a real InterviewBrief, whether it came from the (now-retired-for-tech)
generate_interview_brief() LLM pipeline or, as of this module, straight from
the stored question bank.

The live PROBE/MOVE_ON/WRAP_UP per-turn evaluation loop (eval.py, probe.py,
scoring.py) is untouched by this change -- it never referenced InterviewBrief
directly, only primitives (TopicState, current topic string, etc.) that
agent_runtime.py derives from whichever InterviewBrief it's holding.
"""
from __future__ import annotations

import logging
from typing import Any

from interview.tech.brief import InterviewBrief, RoleContext, TopicItem

logger = logging.getLogger("interview-agent")


_SNIPPET_FENCE_TAG = {
    "snippet_code": "code_trace",
    "snippet_query": "query_trace",
}


def _topic_item_for_question(q: dict[str, Any], must_have_skills: set[str]) -> TopicItem:
    skill = str(q.get("skill") or "").strip() or "General"
    subtopic = str(q.get("subtopic") or "").strip()
    question_text = str(q.get("question") or "").strip()
    snippet = q.get("snippet")
    question_type = str(q.get("question_type") or "conceptual").strip()
    expected_output = str(q.get("expected_output") or "").strip()

    snippet_language = str(q.get("snippet_language") or "").strip().lower()

    title = f"{skill} -- {subtopic}" if subtopic else skill
    full_description = question_text
    if snippet and question_type in _SNIPPET_FENCE_TAG:
        fence_tag = _SNIPPET_FENCE_TAG[question_type]
        # This anchor question already carries an exact, pre-written snippet --
        # the LLM must reproduce it VERBATIM in the fenced code_card block (see
        # phases.py's _code_card_format_rule for the fence-tag contract that
        # extract_code_card() parses), not invent a new one. The literal code
        # is never spoken -- only the short lead-in outside the fence is. The
        # "LANG: <language>" line right after the fence tag carries the real
        # language for frontend syntax highlighting (extract_code_card()
        # parses it separately from the code itself) -- since it's already
        # known for a stored anchor question, no re-detection is needed.
        lang_line = f"LANG: {snippet_language}\n" if snippet_language else ""
        full_description += (
            f"\nWhen you open this topic, ask it using this EXACT snippet, verbatim, "
            f"inside a ```{fence_tag}``` fenced block (do not modify or shorten it):\n"
            f"```{fence_tag}\n{lang_line}{snippet}\n```"
        )

    # probe_focus is read by agent_runtime.py's eval-payload builder as
    # "topic_probe_focus" and injected directly into the per-turn scoring
    # prompt (scoring.py::_call_scoring) as extra grounding context -- this is
    # the existing, already-wired channel for "additional context to help
    # score this topic's answer," so expected_output rides along on it rather
    # than threading a new parameter through eval.py/scoring.py. It
    # supplements the qualitative rubric already in _call_scoring; it does
    # not replace it.
    probe_focus = question_text
    if expected_output and question_type in _SNIPPET_FENCE_TAG:
        probe_focus += f"\n[GROUND TRUTH -- for scoring only, never reveal to candidate]: {expected_output}"

    return TopicItem(
        id=str(q.get("id") or title),
        topic_type="skill",
        title=title,
        full_description=full_description,
        tech_stack=[skill],
        is_jd_must_have=skill in must_have_skills,
        is_custom_question=(question_type == "custom"),
        probe_focus=probe_focus,
    )


def build_brief_from_question_bank(
    question_bank_snapshot: dict[str, Any],
    level: int,
    must_have_skills: list[str] | None = None,
) -> InterviewBrief:
    """
    Builds an InterviewBrief from a frozen Job.questionBank snapshot. Anchor
    topic is the first question in bank order, per spec: "runtime pulls
    anchor questions in order from the snapshot, grouped by skill/subtopic."
    No LLM call -- pure transform, so this is safe to call synchronously at
    session start.
    """
    questions = question_bank_snapshot.get("questions") or []
    if not questions:
        raise ValueError("question_bank_snapshot has no questions -- cannot build an interview brief")

    must_have_set = set(must_have_skills or [])
    topic_pool = [_topic_item_for_question(q, must_have_set) for q in questions]
    anchor_topic = topic_pool[0]

    skills_seen: list[str] = []
    skill_coverage_map: dict[str, list[str]] = {}
    for q in questions:
        skill = str(q.get("skill") or "").strip() or "General"
        subtopic = str(q.get("subtopic") or "").strip()
        if skill not in skill_coverage_map:
            skill_coverage_map[skill] = []
            skills_seen.append(skill)
        if subtopic and subtopic not in skill_coverage_map[skill]:
            skill_coverage_map[skill].append(subtopic)

    interview_strategy = (
        f"Assess depth across the following skills, in this order: {', '.join(skills_seen)}. "
        f"Each topic below carries its exact anchor question -- open with it, then probe "
        f"deeper based on the candidate's answer."
    )

    return InterviewBrief(
        role_context=RoleContext(must_have_skills=list(must_have_set)),
        level=level,
        anchor_topic=anchor_topic,
        topic_pool=topic_pool,
        skill_coverage_map=skill_coverage_map,
        interview_strategy=interview_strategy,
        red_flags=[],
    )
