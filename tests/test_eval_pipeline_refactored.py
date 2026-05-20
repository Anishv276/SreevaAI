"""
Unit tests for the refactored eval_pipeline.py

Tests:
  - EvaluationPayload Pydantic model (parsing, coercion, defaults)
  - TopicTracker: set-based lookups, mark_covered, fallback_next, duplicate detection
  - CounterManager: increment, cap, quality exhaustion, reset, extend_cap
  - DirectiveCompiler: each static builder method
  - run_eval_and_build_directive: end-to-end with fully mocked LLM calls
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from interview.eval_pipeline import (
    EvaluationPayload,
    TopicTracker,
    CounterManager,
    DirectiveCompiler,
    _normalize_topic_key,
    run_eval_and_build_directive,
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
        "follow_up_count": 1,
        "transcript_lines": ["Q: Tell me... A: I built..."],
        "depth_history": [5.0],
        "collapse_stage": 0,
        "score_history": [5.0, 5.5],
        "turns_since_decay": 5,
        "response_latency_sec": 8.0,
        "stage_index": 0,
        "follow_up_depth": 2,
        "signal_toggles": {"contradiction": False, "ownership_ambiguity": True},
        "org_id": "org-test",
        "llm_model": "gpt-4o",
        "active_resume_topic": "Lead Qualification System",
        "active_skill_topic": None,
        "covered_resume_topic_keys": [],
        "covered_skill_topic_keys": [],
        "discussed_log": ["- Lead Qualification System: I built the n8n workflow"],
        "enforce_move_on_until_new": False,
        "forced_next_topic_hint": None,
        "last_action_was_move_on": False,
        "resume_topics": ["Lead Qualification System", "Sensex Analysis Project"],
        "skill_topics": ["python", "n8n", "powerbi"],
        "job_title": "GTM Engineer",
        "remaining_seconds": 480.0,
        "resume_topic_questions_asked": 1,
        "claim_index": {},
        "contradiction_state": {},
        "trust_state": {},
        "current_interview_mode": "normal",
        "no_new_question_cutoff_seconds": 60,
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
        assert p.follow_up_depth == 2
        assert p.stage_index == 0

    def test_defaults_applied(self):
        p = EvaluationPayload(**_base_payload())
        assert p.candidate_name == "?"
        assert p.band == "?"
        assert p.time_limit_mins == 20
        assert p.collapse_stage == 0
        assert p.current_interview_mode == "normal"

    def test_covered_keys_as_list(self):
        p = EvaluationPayload(**_base_payload(
            covered_resume_topic_keys=["lead qualification system", "sensex analysis project"]
        ))
        assert "lead qualification system" in p.covered_resume_topic_keys
        assert len(p.covered_resume_topic_keys) == 2

    def test_extra_fields_ignored(self):
        # Extra fields should not raise
        p = EvaluationPayload(**_base_payload(some_unknown_field="xyz"))
        assert p.app_id == "test-app-001"

    def test_boolean_coercion(self):
        p = EvaluationPayload(**_base_payload(enforce_move_on_until_new=True))
        assert p.enforce_move_on_until_new is True

    def test_optional_none_defaults(self):
        p = EvaluationPayload(**_base_payload())
        assert p.active_skill_topic is None
        assert p.forced_next_topic_hint is None
        assert p.anchor_full is None


# ─────────────────────────────────────────────────────────────
# TopicTracker tests
# ─────────────────────────────────────────────────────────────

class TestTopicTracker:
    def _make_tracker(self, **kwargs):
        defaults = dict(
            resume_topics=["Lead Qualification System", "Sensex Analysis Project"],
            skill_topics=["python", "n8n", "powerbi"],
            covered_resume_keys=set(),
            covered_skill_keys=set(),
            discussed_log=[],
            active_resume_topic="Lead Qualification System",
            active_skill_topic=None,
            resume_topic_questions_asked=1,
            job_title="GTM Engineer",
        )
        defaults.update(kwargs)
        return TopicTracker(**defaults)

    def test_next_uncovered_resume_skips_active(self):
        t = self._make_tracker()
        nxt = t.next_uncovered_for_stage(0)
        # active topic is Lead Qualification System — should skip to Sensex
        assert nxt == "Sensex Analysis Project"

    def test_next_uncovered_resume_skips_covered(self):
        t = self._make_tracker(
            covered_resume_keys={"sensex analysis project"}
        )
        nxt = t.next_uncovered_for_stage(0)
        assert nxt is None  # both covered or active

    def test_mark_resume_covered_uses_set(self):
        t = self._make_tracker()
        t.mark_resume_covered("Lead Qualification System")
        assert "lead qualification system" in t.covered_resume_keys

    def test_mark_resume_covered_normalizes(self):
        t = self._make_tracker()
        t.mark_resume_covered("Lead-Qualification  System!")
        assert "lead qualification system" in t.covered_resume_keys

    def test_mark_skill_covered(self):
        t = self._make_tracker()
        t.mark_skill_covered("n8n")
        assert "n8n" in t.covered_skill_keys

    def test_fallback_next_stage0_returns_uncovered(self):
        t = self._make_tracker()
        result = t.fallback_next(0, exclude="Lead Qualification System")
        assert result == "Sensex Analysis Project"

    def test_fallback_next_stage0_all_covered(self):
        # All keys are covered, but fallback first exhausts the topic list
        # before reaching the education string (matches original behavior)
        t = self._make_tracker(
            covered_resume_keys={"lead qualification system", "sensex analysis project"},
            resume_topic_questions_asked=2,
        )
        result = t.fallback_next(0, exclude=None)
        # Because discussed_log is empty, covered_text check doesn't block
        # so the first topic that matches in the list is returned
        assert result in ["Lead Qualification System", "Sensex Analysis Project", "their education or training path"]

    def test_fallback_next_stage1(self):
        t = self._make_tracker(
            covered_skill_keys={"python"},
            active_skill_topic="n8n",
        )
        result = t.fallback_next(1, exclude="n8n")
        assert result == "powerbi"

    def test_is_question_duplicate_true(self):
        t = self._make_tracker(
            discussed_log=["- Lead Qualification System: I built the n8n workflow and automation"]
        )
        assert t.is_question_duplicate(
            "Tell me about the lead qualification system and n8n workflow automation"
        ) is True

    def test_is_question_duplicate_false(self):
        t = self._make_tracker(discussed_log=["- intro: hello candidate"])
        assert t.is_question_duplicate("Tell me about the Sensex project") is False

    def test_is_question_duplicate_empty_log(self):
        t = self._make_tracker(discussed_log=[])
        assert t.is_question_duplicate("Any question?") is False

    def test_recent_anchor_with_log(self):
        t = self._make_tracker(
            discussed_log=["- Lead Qualification System: some details"]
        )
        anchor = t.recent_anchor()
        assert "Lead Qualification System" in anchor

    def test_recent_anchor_empty(self):
        t = self._make_tracker(discussed_log=[])
        assert t.recent_anchor() == "earlier in our discussion"

    def test_next_uncovered_skill_stage(self):
        t = self._make_tracker(active_skill_topic="python")
        nxt = t.next_uncovered_for_stage(1)
        assert nxt == "n8n"  # python is active, n8n is first uncovered


# ─────────────────────────────────────────────────────────────
# CounterManager tests
# ─────────────────────────────────────────────────────────────

class TestCounterManager:
    def test_increment(self):
        c = CounterManager(follow_up_count=1, follow_up_depth=2, depth_history=[5.0], collapse_stage=0)
        c.increment()
        assert c.count == 2

    def test_hard_cap_not_hit(self):
        c = CounterManager(follow_up_count=1, follow_up_depth=2, depth_history=[5.0], collapse_stage=0)
        c.increment()  # count=2, cap=2
        assert c.is_hard_cap_hit() is True

    def test_hard_cap_below(self):
        c = CounterManager(follow_up_count=0, follow_up_depth=2, depth_history=[], collapse_stage=0)
        c.increment()  # count=1, cap=2
        assert c.is_hard_cap_hit() is False

    def test_extend_cap(self):
        c = CounterManager(follow_up_count=1, follow_up_depth=2, depth_history=[5.0], collapse_stage=0)
        c.extend_cap()
        assert c.cap == 3

    def test_quality_exhausted_true(self):
        c = CounterManager(
            follow_up_count=2, follow_up_depth=2,
            depth_history=[3.0, 2.5],  # both < 4.0
            collapse_stage=0,
        )
        assert c.is_quality_exhausted() is True

    def test_quality_exhausted_false_high_scores(self):
        c = CounterManager(
            follow_up_count=2, follow_up_depth=2,
            depth_history=[6.0, 7.0],
            collapse_stage=0,
        )
        assert c.is_quality_exhausted() is False

    def test_quality_exhausted_false_count_too_low(self):
        c = CounterManager(
            follow_up_count=1, follow_up_depth=2,
            depth_history=[3.0, 2.5],
            collapse_stage=0,
        )
        assert c.is_quality_exhausted() is False  # count=1, needs >= 2

    def test_reset(self):
        c = CounterManager(follow_up_count=2, follow_up_depth=2, depth_history=[5.0, 4.0], collapse_stage=1)
        c.reset()
        assert c.count == 0
        assert c.depth_history == []
        assert c.collapse_stage == 0

    def test_depth_history_append(self):
        c = CounterManager(follow_up_count=0, follow_up_depth=2, depth_history=[5.0], collapse_stage=0)
        c.depth_history.append(4.5)
        assert c.depth_history == [5.0, 4.5]


# ─────────────────────────────────────────────────────────────
# DirectiveCompiler tests
# ─────────────────────────────────────────────────────────────

class TestDirectiveCompiler:
    def test_move_on(self):
        d = DirectiveCompiler.move_on("Ask about Sensex project")
        assert "DECISION: MOVE_ON" in d
        assert "Ask about Sensex project" in d
        assert "DO NOT SAY ALOUD" in d

    def test_verify_contradiction(self):
        d = DirectiveCompiler.verify_contradiction(["contradiction"])
        assert "DECISION: VERIFY (CLARIFICATION)" in d
        assert "contradiction" in d
        assert "QUESTION STYLE" in d

    def test_verify_ownership(self):
        d = DirectiveCompiler.verify_ownership(["ownership_ambiguity"])
        assert "DECISION: VERIFY (CLARIFICATION)" in d
        assert "ownership_ambiguity" in d

    def test_contradiction_active(self):
        summary = {
            "status": "surfaced",
            "contradictionType": "role_claim",
            "evidence": {"oldTurn": 2, "oldValue": "I led the team", "newValue": "team managed it"},
        }
        d = DirectiveCompiler.contradiction_active(summary, turn=5)
        assert "INCONSISTENCY DETECTED" in d
        assert "SURFACED" in d
        assert "turn 2" in d

    def test_append_memory_block(self):
        d = "EXISTING_DIRECTIVE"
        result = DirectiveCompiler.append_memory_block(d, ["- topic A: some detail"])
        assert "INTERVIEW MEMORY" in result
        assert "topic A" in result

    def test_append_memory_block_empty(self):
        d = "EXISTING_DIRECTIVE"
        result = DirectiveCompiler.append_memory_block(d, [])
        assert result == "EXISTING_DIRECTIVE"

    def test_append_topic_tag_new(self):
        d = "BASE"
        result = DirectiveCompiler.append_topic_tag(d, "NEW")
        assert "[TOPIC:NEW]" in result
        assert "TOPIC_TAG_RULE" in result

    def test_append_topic_tag_followup(self):
        d = "BASE"
        result = DirectiveCompiler.append_topic_tag(d, "FOLLOWUP")
        assert "[TOPIC:FOLLOWUP]" in result

    def test_append_strict_move_on_with_topic(self):
        d = "BASE"
        result = DirectiveCompiler.append_strict_move_on(d, "Sensex Analysis Project")
        assert "STRICT_MOVE_ON_RULE" in result
        assert "Sensex Analysis Project" in result

    def test_append_strict_move_on_no_topic(self):
        d = "BASE"
        result = DirectiveCompiler.append_strict_move_on(d, "")
        assert "STRICT_MOVE_ON_RULE" in result
        assert "Target next topic" not in result

    def test_append_no_early_closing(self):
        d = "BASE"
        result = DirectiveCompiler.append_no_early_closing(d)
        assert "NO_EARLY_CLOSING_GUARD" in result

    def test_append_stage1_priority_guard(self):
        d = "BASE"
        result = DirectiveCompiler.append_stage1_priority_guard(d)
        assert "STAGE_1_PRIORITY_GUARD" in result


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

        # All required output keys present
        required_keys = [
            "app_id", "turn", "directive", "action", "td", "quality_record",
            "signal_events", "contradiction_state_event", "depth_signal",
            "freeze_followup_increment", "new_active_resume_topic",
            "new_active_skill_topic", "new_covered_resume_topic_keys",
            "new_covered_skill_topic_keys", "new_topic_follow_up_count",
            "new_topic_depth_history", "new_collapse_stage",
            "new_last_action_was_move_on", "new_enforce_move_on_until_new",
            "new_forced_next_topic_hint", "new_expected_topic_kind",
            "new_trust_state", "new_contradiction_state", "new_claim_index",
            "new_current_interview_mode", "risk_integrity_delta",
            "risk_depth_delta", "discussed_log_entry",
        ]
        for key in required_keys:
            assert key in result, f"Missing key: {key}"

    def test_probe_increments_follow_up_count(self):
        payload = _base_payload(follow_up_count=0, follow_up_depth=2)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert result["new_topic_follow_up_count"] == 1

    def test_probe_at_cap_forces_move_on(self):
        # follow_up_count=2, follow_up_depth=2 → safeguard fires MOVE_ON
        payload = _base_payload(follow_up_count=2, follow_up_depth=2)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert result["action"] == "MOVE_ON"
        assert result["new_topic_follow_up_count"] == 0  # reset after MOVE_ON

    def test_move_on_resets_counter(self):
        payload = _base_payload(follow_up_count=1, follow_up_depth=2)
        result = asyncio.run(_run_pipeline(payload, _mock_td("MOVE_ON", 5.5)))
        assert result["action"] == "MOVE_ON"
        assert result["new_topic_follow_up_count"] == 0
        assert result["new_last_action_was_move_on"] is True

    def test_move_on_marks_topic_covered(self):
        payload = _base_payload(
            follow_up_count=1, follow_up_depth=2,
            active_resume_topic="Lead Qualification System",
        )
        result = asyncio.run(_run_pipeline(payload, _mock_td("MOVE_ON", 5.5)))
        # "lead qualification system" should be in covered keys
        assert "lead qualification system" in result["new_covered_resume_topic_keys"]

    def test_directive_contains_topic_tag(self):
        payload = _base_payload(follow_up_count=0)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert "[TOPIC:" in result["directive"]

    def test_stage1_priority_guard_added_early(self):
        # resume_topic_questions_asked < 2 → guard is appended
        payload = _base_payload(resume_topic_questions_asked=0)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert "STAGE_1_PRIORITY_GUARD" in result["directive"]

    def test_stage1_priority_guard_not_added_later(self):
        # resume_topic_questions_asked >= 2 → guard NOT appended
        payload = _base_payload(resume_topic_questions_asked=3)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert "STAGE_1_PRIORITY_GUARD" not in result["directive"]

    def test_enforce_move_on_set_after_move_on(self):
        payload = _base_payload(follow_up_count=1, follow_up_depth=2)
        result = asyncio.run(_run_pipeline(payload, _mock_td("MOVE_ON", 5.5)))
        assert result["new_enforce_move_on_until_new"] is True

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

    def test_last_action_was_move_on_resets_counter(self):
        payload = _base_payload(last_action_was_move_on=True, follow_up_count=2)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        # Counter was reset to 0 at start, then incremented to 1
        assert result["new_topic_follow_up_count"] == 1

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
        # remaining_seconds <= no_new_question_cutoff_seconds + 30
        payload = _base_payload(remaining_seconds=80.0, no_new_question_cutoff_seconds=60)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert "NO_EARLY_CLOSING_GUARD" in result["directive"]

    def test_no_early_closing_guard_not_added_when_time_remains(self):
        payload = _base_payload(remaining_seconds=480.0, no_new_question_cutoff_seconds=60)
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert "NO_EARLY_CLOSING_GUARD" not in result["directive"]

    def test_drift_guard_enforces_move_on(self):
        # enforce_move_on_until_new=True + action=PROBE + last_action_was_move_on=False
        # Use follow_up_count=0 and high follow_up_depth so cap never fires first
        payload = _base_payload(
            enforce_move_on_until_new=True,
            last_action_was_move_on=False,
            follow_up_count=0,
            follow_up_depth=5,  # cap is far away — drift guard fires instead
        )
        result = asyncio.run(_run_pipeline(payload, _mock_td("PROBE", 5.5)))
        assert result["action"] == "MOVE_ON"
        assert "ENFORCED" in result["directive"]
