"""
interview/conversational/question_bank_adapter.py
==================================================
Adapts a stored Job.questionBank snapshot into an InterviewBrief-shaped object
for sales/conversational interviews.
"""
from __future__ import annotations

import logging
from typing import Any

from interview.conversational.brief import InterviewBrief, RoleContext, TopicItem, _dedup_any_overlap

logger = logging.getLogger("interview-agent")


def _topic_item_for_question(q: dict[str, Any], must_have_skills: set[str]) -> TopicItem:
    skill = str(q.get("skill") or "").strip() or "General"
    subtopic = str(q.get("subtopic") or "").strip()
    question_text = str(q.get("question") or "").strip()

    title = f"{skill} -- {subtopic}" if subtopic else skill
    
    # In sales, we don't have code snippets, so we just pass the question
    # naturally -- but mirror the tech adapter's "preserve the scenario"
    # instruction so a rich bank scenario isn't flattened into a generic
    # definition question.
    full_description = (
        f"BANK QUESTION (preserve this scenario -- keep its concrete setup and "
        f"constraint; only adjust wording so it sounds spoken, not read off a card): "
        f"'{question_text}'"
    )

    is_must_have = bool(skill and must_have_skills and skill.lower() in {s.lower() for s in must_have_skills})
    is_custom = bool(q.get("is_custom", False))

    _focus = str(q.get("focus") or "").strip()
    probe_focus = _focus or f"Subtopic: {subtopic} | Bank question (preserve the scenario): {question_text}"
    
    # In conversational/sales, the tech_stack field represents tools, methodologies, or CRM
    tech_stack = []
    if q.get("tools"):
        if isinstance(q["tools"], list):
            tech_stack = [str(x) for x in q["tools"]]
        else:
            tech_stack = [str(q["tools"])]

    return TopicItem(
        id=str(q.get("id") or ""),
        topic_type="skill",
        title=title,
        full_description=full_description.strip(),
        tech_stack=tech_stack,
        is_jd_must_have=is_must_have,
        is_custom_question=is_custom,
        why_relevant="Sourced from the active question bank.",
        probe_focus=probe_focus,
        probe_avoid=[],
    )


def build_brief_from_question_bank(
    bank_json: dict[str, Any],
    level: int = 2,
    must_have_skills: list[str] | None = None,
) -> InterviewBrief:
    """
    Given a Job.questionBank dict matching the DB JSON structure:
      {"questions": [ { "id": "...", "skill": "Objection Handling", "question": "..." }, ... ]}
    return a fully populated sales InterviewBrief.
    """
    must_haves = set(must_have_skills or [])
    
    q_list = bank_json.get("questions")
    if not isinstance(q_list, list) or not q_list:
        # Mirror tech's failure semantics: a bank without questions cannot
        # produce a meaningful brief -- fail loud instead of a silent empty
        # interview.
        raise ValueError("question_bank has no questions -- cannot build a sales interview brief")

    topics: list[TopicItem] = []
    for q in q_list:
        if not isinstance(q, dict):
            continue
        # Skip questions that lack a core question string
        if not str(q.get("question") or "").strip():
            continue
        topics.append(_topic_item_for_question(q, must_haves))

    topics = _dedup_any_overlap(topics)

    logger.info("[QUESTION_BANK:sales] Adapted %d unique questions into conversational brief topics", len(topics))

    return InterviewBrief(
        role_context=RoleContext(must_have_skills=list(must_haves)),
        level=level,
        candidate_summary="",
        topic_pool=topics,
        skill_coverage_map={},
        interview_strategy="Follow the conversational flow dynamically.",
        red_flags=[],
    )
