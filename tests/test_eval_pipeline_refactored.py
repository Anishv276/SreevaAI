"""
Unit tests for the refactored eval_pipeline.py with TopicState and Saturation System
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from interview.eval_pipeline import (
    EvaluationPayload,
    TopicTracker,
    TopicState,
    TopicImportanceClassifier,
    ResponseScoreCalculator,
    SignalPenaltyCalculator,
    DirectiveCompiler,
    _normalize_topic_key,
    run_eval_and_build_directive,
    evaluate_topic_saturation,
)


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────

def _base_payload(**overrides) -> dict:
    """Minimal valid payload covering all required fields."""
    base = {
        "app_id": "test-app-001",
        "turn": 3,
        "answer": "I built the lead qualification system using n8n and Python.",
        "question": "Tell me about your role in the project.",
        "transcript_lines": ["Q: Tell me... A: I built..."],
        "score_history": [5.0, 5.5],
        "turns_since_decay": 5,
        "response_latency_sec": 8.0,
        "signal_toggles": {"contradiction": False, "ownership_ambiguity": True},
        "org_id": "org-test",
        "llm_model": "gpt-4o",
        "active_topic": "Lead Qualification System",
        "active_topic_state": None,
        "covered_topic_keys": [],
        "discussed_log": ["- Lead Qualification System: I built the n8n workflow"],
        "resume_topics": ["Lead Qualification System", "Sensex Analysis Project"],
        "skill_topics": ["python", "n8n", "powerbi"],
        "job_title": "GTM Engineer",
        "remaining_seconds": 480.0,
        "claim_index": {},
        "contradiction_state": {},
        "trust_state": {},
        "current_interview_mode": "normal",
        "no_new_question_cutoff_seconds": 45,
    }
    base.update(overrides)
    return base


# ─────────────────────────────────────────────────────────────
# EvaluationPayload tests
# ─────────────────────────────────────────────────────────────

class TestEvaluationPayload:
    def test_parses_minimal_payload(self):
        p = EvaluationPayload(**_base_payload())
        assert p.app_id == "test-app-001"
        assert p.turn == 3

    def test_defaults_applied(self):
        p = EvaluationPayload(**_base_payload())
        assert p.candidate_name == "?"
        assert p.band == "?"
        assert p.time_limit_mins == 20
        assert p.current_interview_mode == "normal"

    def test_covered_keys_as_list(self):
        p = EvaluationPayload(**_base_payload(
            covered_topic_keys=["lead qualification system", "sensex analysis project"]
        ))
        assert "lead qualification system" in p.covered_topic_keys
        assert len(p.covered_topic_keys) == 2

    def test_extra_fields_ignored(self):
        # Extra fields should not raise
        p = EvaluationPayload(**_base_payload(some_unknown_field="xyz"))
        assert p.app_id == "test-app-001"


# ─────────────────────────────────────────────────────────────
# TopicTracker tests
# ─────────────────────────────────────────────────────────────

class TestTopicTracker:
    def _make_tracker(self, **kwargs):
        defaults = dict(
            resume_topics=["Lead Qualification System", "Sensex Analysis Project"],
            skill_topics=["python", "n8n", "powerbi"],
            covered_keys=set(),
            discussed_log=[],
            active_topic="Lead Qualification System",
            job_title="GTM Engineer",
        )
        defaults.update(kwargs)
        return TopicTracker(**defaults)

    def test_next_uncovered_skips_active(self):
        t = self._make_tracker()
        nxt = t.next_uncovered(exclude=t.active_topic)
        assert nxt == "Sensex Analysis Project"

    def test_next_uncovered_skips_covered(self):
        t = self._make_tracker(
            covered_keys={"sensex analysis project", "python", "n8n", "powerbi"}
        )
        nxt = t.next_uncovered(exclude=t.active_topic)
        assert nxt is None

    def test_mark_covered_uses_set(self):
        t = self._make_tracker()
        t.mark_covered("Lead Qualification System")
        assert "lead qualification system" in t.covered_keys

    def test_fallback_next_returns_uncovered(self):
        t = self._make_tracker()
        result = t.fallback_next(exclude="Lead Qualification System")
        assert result == "Sensex Analysis Project"


# ─────────────────────────────────────────────────────────────
# TopicState and Saturation System tests
# ─────────────────────────────────────────────────────────────

class TestTopicStateAndSaturation:
    def test_topic_state_initialization(self):
        ts = TopicState("Lead Qualification System", "CRITICAL")
        assert ts.topic_name == "Lead Qualification System"
        assert ts.importance == "CRITICAL"
        assert ts.saturation_threshold == 8.0
        assert ts.saturation_score == 0.0
        assert ts.follow_up_turns == 0
        assert ts.is_saturated is False
        assert ts.updated_turn == 0

    def test_add_response_contribution(self):
        ts = TopicState("Test Topic", "MEDIUM")
        assert ts.saturation_threshold == 5.0
        # Add contribution
        ts.add_response_contribution(2.5, 0.0, turn=4)
        assert ts.saturation_score == 3.5
        assert ts.follow_up_turns == 1
        assert ts.is_saturated is False
        assert ts.updated_turn == 4

        # Add more to trigger saturation
        ts.add_response_contribution(2.5, 0.0, turn=5)
        assert ts.saturation_score == 7.0
        assert ts.follow_up_turns == 2
        assert ts.is_saturated is True
        assert ts.updated_turn == 5

    def test_advance_probe_rotation(self):
        ts = TopicState("Test Topic", "MEDIUM")
        assert ts.probe_rotation_index == 0
        ts.advance_probe_rotation(signal_fired=False)
        assert ts.probe_rotation_index == 1
        # Signal fired should override and NOT advance
        ts.advance_probe_rotation(signal_fired=True)
        assert ts.probe_rotation_index == 1

    def test_topic_importance_classifier(self):
        assert TopicImportanceClassifier.classify("resume", is_anchor=False) == "HIGH"
        assert TopicImportanceClassifier.classify("skill", is_anchor=False) == "MEDIUM"
        assert TopicImportanceClassifier.classify("other", is_anchor=True) == "CRITICAL"
        assert TopicImportanceClassifier.classify("other", is_anchor=False) == "LOW"

    def test_response_score_calculator(self):
        quality = {"clarity": 8.0, "depth": 8.0, "specificity": 8.0, "grounding": 8.0}
        score = ResponseScoreCalculator.calculate_response_score(quality)
        assert score == 8.0
        contrib = ResponseScoreCalculator.calculate_contribution(score)
        assert contrib == 2.5  # Strong band (7.0 - 8.4)

    def test_signal_penalty_calculator(self):
        events = [
            {"signal_name": "example_evasion"},
            {"signal_name": "contradiction"},
            {"signal_name": "unknown_signal"},
        ]
        penalty = SignalPenaltyCalculator.calculate_penalties(events)
        assert penalty == -4.5  # -2.0 + -2.5


# ─────────────────────────────────────────────────────────────
# DirectiveCompiler tests
# ─────────────────────────────────────────────────────────────

class TestDirectiveCompiler:
    def test_move_on(self):
        d = DirectiveCompiler.move_on("Ask about Sensex project")
        assert "DECISION: MOVE_ON" in d
        assert "Ask about Sensex project" in d

    def test_verify_contradiction(self):
        d = DirectiveCompiler.verify_contradiction(["contradiction"])
        assert "DECISION: VERIFY (CLARIFICATION)" in d
        assert "contradiction" in d

    def test_verify_ownership(self):
        d = DirectiveCompiler.verify_ownership(["ownership_ambiguity"])
        assert "DECISION: VERIFY (CLARIFICATION)" in d
        assert "ownership_ambiguity" in d


# ─────────────────────────────────────────────────────────────
# End-to-end pipeline tests (LLM calls fully mocked)
# ─────────────────────────────────────────────────────────────

def _mock_td(action: str = "PROBE", quality: float = 5.5, mode: str = "evidence") -> tuple:
    td = {
        "decision": {
            "action": action,
            "mode": mode,
            "next_goal": f"Ask a focused follow-up about their ownership in the project.",
        },
        "quality": {
            "clarity": quality, "depth": quality,
            "specificity": quality, "grounding": quality,
            "fluency": 0.0, "confidence": 0.0,
        },
        "signal_events": [],
    }
    directive = (
        "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
        f"DECISION: {action}\n"
        f"NEXT MOVE: {td['decision']['next_goal']}"
    )
    return td, directive


@pytest.fixture
def mock_client():
    return MagicMock()


async def _run_pipeline(payload: dict, mock_td_tuple):
    client = MagicMock()
    with patch("interview.eval_pipeline.run_turn_evaluation", new_callable=AsyncMock) as mock_eval, \
         patch("interview.eval_pipeline.extract_claims", new_callable=AsyncMock) as mock_claims, \
         patch("interview.eval_pipeline.apply_turn_decision", side_effect=lambda ts, *a, **kw: ts), \
         patch("interview.eval_pipeline.advance_contradiction_state",
               return_value=({}, None)), \
         patch("interview.eval_pipeline.summarize_contradiction_state",
               return_value={"active": False, "evidence": {}, "status": "", "contradictionType": ""}):
        mock_eval.return_value = mock_td_tuple
        mock_claims.return_value = []
        result = await run_eval_and_build_directive(payload, client)
    return result


class TestPipelineEndToEnd:
    def test_probe_action_returns_correct_keys(self):
        payload = _base_payload()
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))

        required_keys = [
            "app_id", "turn", "directive", "action", "td", "quality_record",
            "signal_events", "contradiction_state_event", "depth_signal",
            "freeze_followup_increment", "new_active_topic",
            "new_covered_topic_keys", "new_active_topic_state",
            "new_trust_state", "new_contradiction_state", "new_claim_index",
            "new_current_interview_mode", "risk_integrity_delta",
            "risk_depth_delta", "discussed_log_entry",
        ]
        for key in required_keys:
            assert key in result, f"Missing key: {key}"
        assert result["input_active_topic"] == "Lead Qualification System"

    def test_probe_updates_topic_state(self):
        payload = _base_payload()
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 7.5)))
        new_state = result["new_active_topic_state"]
        assert new_state is not None
        assert new_state["follow_up_turns"] == 1
        assert new_state["saturation_score"] > 0.0
        assert new_state["updated_turn"] == 3

    def test_saturation_reaches_threshold_forces_move_on(self):
        # We pass an active topic state that is already close to saturation (e.g. score=7.0, threshold=8.0)
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
        # Quality=7.5 -> contribution=2.5. This pushes it to 9.5 (>= 8.0 threshold), triggering saturation.
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 7.5)))
        assert result["action"] == "MOVE_ON"
        assert result["new_active_topic"] != "Lead Qualification System"

    def test_move_on_marks_topic_covered(self):
        payload = _base_payload(active_topic="Lead Qualification System")
        result = asyncio.run(_run_pipeline(payload, _mock_td("MOVE_ON", 5.5)))
        assert "lead qualification system" in result["new_covered_topic_keys"]

    def test_depth_signal_deep_on_high_quality(self):
        payload = _base_payload()
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 7.5)))
        assert result["depth_signal"] == "DEEP"

    def test_depth_signal_specific_on_mid_quality(self):
        payload = _base_payload()
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.0)))
        assert result["depth_signal"] == "SPECIFIC"

    def test_depth_signal_surface_on_low_quality(self):
        payload = _base_payload()
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 3.0)))
        assert result["depth_signal"] == "SURFACE"

    def test_app_id_and_turn_propagated(self):
        payload = _base_payload(app_id="my-app-123", turn=7)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert result["app_id"] == "my-app-123"
        assert result["turn"] == 7

    def test_quality_record_structure(self):
        payload = _base_payload()
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        qr = result["quality_record"]
        assert "overall" in qr
        assert "clarity" in qr
        assert "depth" in qr
        assert "signals" in qr
        assert "concerns" in qr

    def test_no_early_closing_guard_near_end(self):
        payload = _base_payload(remaining_seconds=60.0, no_new_question_cutoff_seconds=45)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert "NO_EARLY_CLOSING_GUARD" in result["directive"]

    def test_no_early_closing_guard_not_added_when_time_remains(self):
        payload = _base_payload(remaining_seconds=480.0, no_new_question_cutoff_seconds=45)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert "NO_EARLY_CLOSING_GUARD" not in result["directive"]
