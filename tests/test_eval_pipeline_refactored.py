"""
Focused tests for the current eval_pipeline contract.

The runtime owns topic selection and directive injection. The eval pipeline only
scores the active topic, updates saturation state, and returns a routing action.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from interview.eval_pipeline import (
    EvaluationPayload,
    TopicState,
    TopicImportanceClassifier,
    ResponseScoreCalculator,
    SignalPenaltyCalculator,
    _normalize_topic_key,
    evaluate_topic_saturation,
    run_eval_and_build_directive,
)
from interview.agent_runtime import (
    _build_move_on_question,
    _is_ack_only_assistant_fragment,
    _is_tiny_fragment,
    _order_interview_topics,
)


def _base_payload(**overrides) -> dict:
    base = {
        "app_id": "test-app-001",
        "turn": 3,
        "answer": "I built the lead qualification system using n8n and Python.",
        "question": "Tell me about your role in the project.",
        "transcript_lines": ["Interviewer: Tell me about your role.", "Candidate: I built it."],
        "score_history": [5.0, 5.5],
        "turns_since_decay": 5,
        "response_latency_sec": 8.0,
        "signal_toggles": {"ownership_ambiguity": True},
        "org_id": "org-test",
        "llm_model": "gpt-4o",
        "active_topic": "Lead Qualification System",
        "active_topic_state": None,
        "discussed_log": ["- Lead Qualification System: I built the n8n workflow"],
        "resume_topics": ["Lead Qualification System", "Sensex Analysis Project"],
        "skill_topics": ["python", "n8n", "powerbi"],
        "job_title": "GTM Engineer",
        "remaining_seconds": 480.0,
        "trust_state": {},
        "current_interview_mode": "normal",
        "band": "mid",
    }
    base.update(overrides)
    return base


def _mock_td(action: str = "PROBE", quality: float = 5.5, mode: str = "ownership") -> tuple:
    td = {
        "decision": {
            "action": action,
            "mode": mode,
            "next_goal": "Ask a focused follow-up about their ownership in the project.",
        },
        "quality": {
            "clarity": quality,
            "depth": quality,
            "specificity": quality,
            "grounding": quality,
            "fluency": 0.0,
            "confidence": 0.0,
        },
        "signal_events": [],
    }
    return td, ""


async def _run_pipeline(payload: dict, mock_td_tuple):
    client = MagicMock()
    with patch("interview.eval_pipeline.run_turn_evaluation", new_callable=AsyncMock) as mock_eval, \
         patch("interview.eval_pipeline.apply_turn_decision", side_effect=lambda ts, *a, **kw: ts):
        mock_eval.return_value = mock_td_tuple
        return await run_eval_and_build_directive(payload, client)


class TestEvaluationPayload:
    def test_parses_minimal_payload(self):
        p = EvaluationPayload(**_base_payload())
        assert p.app_id == "test-app-001"
        assert p.turn == 3

    def test_defaults_applied(self):
        p = EvaluationPayload(**_base_payload())
        assert p.candidate_name == "?"
        assert p.time_limit_mins == 20
        assert p.current_interview_mode == "normal"

    def test_extra_fields_allowed(self):
        p = EvaluationPayload(**_base_payload(some_unknown_field="xyz"))
        assert p.model_extra["some_unknown_field"] == "xyz"


class TestTopicStateAndSaturation:
    def test_topic_state_initialization(self):
        ts = TopicState("Lead Qualification System", "CRITICAL")
        assert ts.topic_name == "Lead Qualification System"
        assert ts.importance == "CRITICAL"
        assert ts.saturation_threshold == 7.0
        assert ts.saturation_score == 0.0
        assert ts.follow_up_turns == 0
        assert ts.is_saturated is False

    def test_add_response_contribution(self):
        ts = TopicState("Test Topic", "MEDIUM")
        ts.add_response_contribution(2.5, 0.0, turn=4)
        assert ts.saturation_score == 3.5
        assert ts.follow_up_turns == 1
        assert ts.updated_turn == 4

    def test_saturation_uses_topic_state(self):
        ts = TopicState("Test Topic", "MEDIUM")
        saturated, reason = evaluate_topic_saturation(
            ts,
            {"clarity": 9.5, "depth": 9.5, "specificity": 9.5, "grounding": 9.5},
            [],
            turn=3,
        )
        assert saturated is True
        assert reason.startswith("saturated_at_")

    def test_topic_importance_classifier(self):
        assert TopicImportanceClassifier.classify("resume", is_anchor=False) == "HIGH"
        assert TopicImportanceClassifier.classify("skill", is_anchor=False) == "MEDIUM"
        assert TopicImportanceClassifier.classify("other", is_anchor=True) == "CRITICAL"
        assert TopicImportanceClassifier.classify("other", is_anchor=False) == "LOW"

    def test_response_score_calculator(self):
        quality = {"clarity": 8.0, "depth": 8.0, "specificity": 8.0, "grounding": 8.0}
        assert ResponseScoreCalculator.calculate_response_score(quality) == 8.0
        assert ResponseScoreCalculator.calculate_contribution(8.0) == 2.625

    def test_signal_penalty_calculator(self):
        events = [
            {"signal_name": "example_evasion"},
            {"signal_name": "ownership_ambiguity"},
            {"signal_name": "unknown_signal"},
        ]
        assert SignalPenaltyCalculator.calculate_penalties(events) == -0.6


class TestPipelineContract:
    def test_probe_action_returns_current_contract(self):
        result = asyncio.run(_run_pipeline(_base_payload(), _mock_td("PROBE", 5.5)))
        for key in [
            "app_id",
            "turn",
            "action",
            "probe_family",
            "quality_record",
            "signal_events",
            "depth_signal",
            "saturation",
            "new_trust_state",
            "risk_integrity_delta",
            "risk_depth_delta",
            "discussed_log_entry",
            "eval_llm_usages",
        ]:
            assert key in result
        assert result["action"] == "PROBE"
        assert result["quality_record"]["topic"] == "Lead Qualification System"

    def test_probe_updates_topic_state(self):
        result = asyncio.run(_run_pipeline(_base_payload(), _mock_td("PROBE", 5.0)))
        state = result["saturation"]["topic_state_dict"]
        assert state is not None
        assert state["follow_up_turns"] == 1
        assert state["saturation_score"] > 0.0
        assert state["updated_turn"] == 3

    def test_saturation_forces_move_on(self):
        state_close_to_sat = {
            "topic_name": "Lead Qualification System",
            "importance": "CRITICAL",
            "saturation_threshold": 8.0,
            "saturation_score": 7.0,
            "follow_up_turns": 2,
            "probe_rotation_index": 1,
            "signals_fired": [],
            "is_saturated": False,
        }
        payload = _base_payload(active_topic_state=state_close_to_sat)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 7.5)))
        assert result["action"] == "MOVE_ON"
        assert result["saturation"]["is_saturated"] is True

    def test_llm_move_on_is_preserved_for_runtime_topic_switch(self):
        result = asyncio.run(_run_pipeline(_base_payload(), _mock_td("MOVE_ON", 5.5)))
        assert result["action"] == "MOVE_ON"
        assert result["discussed_log_entry"] is not None

    def test_depth_signal_bands(self):
        assert asyncio.run(_run_pipeline(_base_payload(), _mock_td("PROBE", 7.5)))["depth_signal"] == "DEEP"
        assert asyncio.run(_run_pipeline(_base_payload(), _mock_td("PROBE", 5.0)))["depth_signal"] == "SPECIFIC"
        assert asyncio.run(_run_pipeline(_base_payload(), _mock_td("PROBE", 3.0)))["depth_signal"] == "SURFACE"

    def test_normalize_topic_key(self):
        assert _normalize_topic_key("Lead Qualification System!") == "lead qualification system"


class TestRuntimeFlowGuards:
    def test_ack_only_assistant_fragments_are_not_questions(self):
        assert _is_ack_only_assistant_fragment("Okay,") is True
        assert _is_ack_only_assistant_fragment("That makes sense.") is True
        assert _is_ack_only_assistant_fragment("What did you build next?") is False
        assert _is_ack_only_assistant_fragment("Okay, what did you build next?") is False

    def test_tiny_fragment_detection_keeps_meaningful_short_answers(self):
        assert _is_tiny_fragment("to Slack.") is True
        assert _is_tiny_fragment("Yeah.") is False
        assert _is_tiny_fragment("I used n8n to push the data.") is False

    def test_topic_order_keeps_resume_before_skills(self):
        ordered = _order_interview_topics(
            [
                "Multi Channel Lead Qualification System - Built lead capture",
                "Sensex Analysis Project - Built data pipeline",
                "Campaign Metrics and Slack Reporting System - Built reporting",
                "Personal Brand & Marketing Automation Strategist",
                "Python Developer",
            ],
            ["python", "powerbi", "n8n"],
            "Sensex Analysis Project - Built data pipeline",
        )
        assert ordered[:5] == [
            "Sensex Analysis Project - Built data pipeline",
            "Multi Channel Lead Qualification System - Built lead capture",
            "Campaign Metrics and Slack Reporting System - Built reporting",
            "Personal Brand & Marketing Automation Strategist",
            "Python Developer",
        ]
        assert ordered[5:] == ["python", "powerbi", "n8n"]

    def test_move_on_question_is_topic_locked(self):
        """The MOVE_ON opener must:
          - name the new topic so the candidate knows we have switched,
          - stay short (no resume-description read-aloud),
          - NOT mention any other (previous) topic.
        The exact phrasing is one of several randomized templates, so we
        test contract properties rather than an exact string match. Run
        multiple iterations so any single random pick failing would be
        caught.
        """
        topic = "Multi Channel Lead Qualification System - Created automated lead capture across Instagram and Facebook. [Instagram]"
        for _ in range(20):  # exercise all template variants
            question = _build_move_on_question(topic)
            # New topic name must appear.
            assert "Multi Channel Lead Qualification System" in question
            # The verbose resume description tail must NOT be read aloud.
            assert "Created automated lead capture" not in question
            assert "Instagram and Facebook" not in question
            # Must end with terminal punctuation (some templates use ? others .).
            assert question.strip()[-1] in {"?", "."}
            # Reasonably short (spoken delivery, not corporate boilerplate).
            assert len(question.split()) <= 25
