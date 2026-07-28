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
    question_type = str(q.get("question_type") or "conceptual").strip()

    title = f"{skill} -- {subtopic}" if subtopic else skill
    
    if question_type in _SNIPPET_FENCE_TAG:
        fence_tag = _SNIPPET_FENCE_TAG[question_type]
        full_description = (
            f"[INSTRUCTION FOR AGENT]: This is a {fence_tag} question.\n"
            f"Intent to test: '{question_text}'.\n"
            f"Generate a fresh, level-calibrated snippet on the fly that tests this intent. "
            f"Output the snippet inside a ```{fence_tag}``` fenced block on the candidate's screen, "
            f"and keep the expected output/ground truth in your internal state for scoring."
        )
    else:
        full_description = (
            f"[INSTRUCTION FOR AGENT]: This bank question is already a well-written scenario -- "
            f"keep its concrete setup and constraint, do not discard it for a generic definition "
            f"question. Only adjust wording so it sounds spoken, not read off a card.\n"
            f"BANK QUESTION (preserve this scenario): '{question_text}'"
        )

    probe_focus = f"Subtopic: {subtopic} | Bank question (preserve the scenario): {question_text}"

    return TopicItem(
        id=str(q.get("id") or title),
        topic_type="skill",
        title=title,
        full_description=full_description,
        tech_stack=[skill],
        is_jd_must_have=skill in must_have_skills,
        is_custom_question=(q.get("source") == "custom"),
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
