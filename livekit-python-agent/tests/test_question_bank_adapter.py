"""
Tests for interview/tech/question_bank_adapter.py -- the pure data transform
that turns a stored Job.questionBank snapshot into an InterviewBrief, replacing
generate_interview_brief() for tech interviews (see agent_runtime.py's
interview_type == "tech" branch).

Two things matter most here:
1. The output validates as a real InterviewBrief (Pydantic), so
   phases.py::build_interview_directive() -- which needs zero changes for
   this migration -- accepts it without modification.
2. Anchor selection follows bank order (first question in the snapshot),
   per spec: "runtime pulls anchor questions in order from the snapshot,
   grouped by skill/subtopic."
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from interview.tech.brief import InterviewBrief
from interview.tech.phases import build_interview_directive
from interview.tech.question_bank_adapter import build_brief_from_question_bank


def _sample_bank() -> dict:
    return {
        "version": 1,
        "level": 2,
        "questions": [
            {
                "id": "q1",
                "skill": "Python",
                "subtopic": "OOP Concepts",
                "question_type": "conceptual",
                "question": "How would you decide between composition and inheritance?",
            },
            {
                "id": "q2",
                "skill": "Python",
                "subtopic": "Debugging",
                "question_type": "snippet_code",
                "question": "Take a look at the snippet on your screen -- what would this output?",
                "snippet": "x = [1, 2, 3]\nprint(x[1:])",
                "snippet_language": "python",
                "expected_output": "[2, 3]",
            },
            {
                "id": "q3",
                "skill": "SQL",
                "subtopic": "Joins",
                "question_type": "snippet_query",
                "question": "Take a look at the snippet -- what would this return?",
                "snippet": "SELECT a.id FROM orders a LEFT JOIN items b ON a.id = b.order_id WHERE b.id IS NULL;",
                "snippet_language": "sql",
                "expected_output": "Orders with zero items.",
            },
        ],
        "skippedQuerySnippetReason": None,
    }


def test_builds_valid_interview_brief():
    brief = build_brief_from_question_bank(_sample_bank(), level=3, must_have_skills=["Python"])
    assert isinstance(brief, InterviewBrief)
    assert brief.level == 3


def test_anchor_is_first_question_in_bank_order():
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=[])
    assert brief.anchor_topic.id == "q1"
    assert "Python" in brief.anchor_topic.title


def test_topic_pool_preserves_bank_order():
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=[])
    assert [t.id for t in brief.topic_pool] == ["q1", "q2", "q3"]


def test_must_have_skills_flow_into_topic_items_and_role_context():
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=["SQL"])
    assert brief.role_context.must_have_skills == ["SQL"]
    sql_topic = next(t for t in brief.topic_pool if t.id == "q3")
    python_topic = next(t for t in brief.topic_pool if t.id == "q1")
    assert sql_topic.is_jd_must_have is True
    assert python_topic.is_jd_must_have is False


def test_snippet_questions_embed_verbatim_fenced_snippet_in_description():
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=[])
    code_topic = next(t for t in brief.topic_pool if t.id == "q2")
    assert "```code_trace" in code_topic.full_description
    assert "x = [1, 2, 3]" in code_topic.full_description
    query_topic = next(t for t in brief.topic_pool if t.id == "q3")
    assert "```query_trace" in query_topic.full_description
    assert "SELECT a.id" in query_topic.full_description


def test_snippet_questions_embed_lang_annotation_line():
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=[])
    code_topic = next(t for t in brief.topic_pool if t.id == "q2")
    assert "LANG: python" in code_topic.full_description
    query_topic = next(t for t in brief.topic_pool if t.id == "q3")
    assert "LANG: sql" in query_topic.full_description


def test_snippet_questions_carry_expected_output_in_probe_focus_for_scoring():
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=[])
    code_topic = next(t for t in brief.topic_pool if t.id == "q2")
    assert "[2, 3]" in code_topic.probe_focus
    assert "GROUND TRUTH" in code_topic.probe_focus


def test_conceptual_question_has_no_fence():
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=[])
    conceptual_topic = next(t for t in brief.topic_pool if t.id == "q1")
    assert "```" not in conceptual_topic.full_description


def test_skill_coverage_map_groups_by_skill_then_subtopic():
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=[])
    assert brief.skill_coverage_map["Python"] == ["OOP Concepts", "Debugging"]
    assert brief.skill_coverage_map["SQL"] == ["Joins"]


def test_empty_question_bank_raises():
    with pytest.raises(ValueError):
        build_brief_from_question_bank({"questions": []}, level=2, must_have_skills=[])


def test_build_interview_directive_accepts_adapter_output_without_modification():
    """phases.py::build_interview_directive() must require zero code changes
    for this migration -- confirm it accepts an adapter-built InterviewBrief
    exactly like a generate_interview_brief() one."""
    brief = build_brief_from_question_bank(_sample_bank(), level=2, must_have_skills=["Python"])
    directive = build_interview_directive(
        level=2,
        resume_brief=None,
        jd_skills=["Python", "SQL"],
        custom_questions=[],
        interview_brief=brief,
    )
    assert isinstance(directive, str)
    assert len(directive) > 0
