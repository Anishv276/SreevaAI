import pytest
from typing import Any
from turn_decision import (
    _detect_ownership_ambiguity_event,
    _detect_example_evasion_event,
    _detect_resume_claim_mismatch_event,
    _detect_follow_up_collapse_event,
    _detect_latency_mismatch_event,
    _detect_depth_decay_event,
    _score_question_complexity,
    _detect_complexity_latency_mismatch_event,
    detect_signal_events,
    build_signal_flags,
    detect_ownership_ambiguity,
    detect_example_evasion,
    _detect_ownership_clarified_event,
    _detect_example_given_event,
    detect_follow_up_collapse,
    compute_trust_delta,
    build_turn_decision,
)

def test_detect_ownership_ambiguity():
    # Ambiguous: we/our count >= 2, i/me count <= 1
    assert detect_ownership_ambiguity("We did this and our team achieved it.") is True
    # Ambiguous: we/our count = 2, i/me count = 1 (we_count < 2 or i_count > 1 is False)
    assert detect_ownership_ambiguity("We did this and our team achieved it, but I led it.") is True
    # Not ambiguous: high first-person count
    assert detect_ownership_ambiguity("We did this and our team achieved it, but I led it and me too.") is False
    # Not ambiguous: too few we-tokens
    assert detect_ownership_ambiguity("The system was built.") is False

def test_detect_example_evasion():
    # Evasion: question asked for example, answer stayed theoretical / lacked specifics
    assert detect_example_evasion("Generally, you should use indexes.", "Can you give me an example?") is True
    # Not evasion: no question match
    assert detect_example_evasion("Generally, you should use indexes.", "How does it work?") is False
    # Not evasion: answer is concrete/has specifics
    assert detect_example_evasion("At my last job in 2024, I optimized the PostgreSQL query.", "Can you share a specific example?") is False

def test_detect_resume_claim_mismatch():
    # Mismatch: detail question, resume phrases, no specifics or low depth
    ev = _detect_resume_claim_mismatch_event(
        answer="I have experience with React and Node.",
        last_question="Walk me through a sequence of steps.",
        current_depth=4.0,
        prior_depth_scores=[],
        topic_follow_up_count=0,
    )
    assert ev is not None
    assert ev["signal_name"] == "resume_claim_mismatch"
    assert ev["score_delta"] == -0.12

    # No mismatch: has specifics and depth
    assert _detect_resume_claim_mismatch_event(
        answer="At Acme in 2023, I optimized the backend system.",
        last_question="Walk me through a specific example.",
        current_depth=6.0,
        prior_depth_scores=[],
        topic_follow_up_count=0,
    ) is None

def test_detect_follow_up_collapse():
    # Drop from first >= 6.0 to follow-up <= 3.0 (complete collapse)
    ev = _detect_follow_up_collapse_event(
        answer="",
        last_question="",
        current_depth=2.5,
        prior_depth_scores=[6.5],
        topic_follow_up_count=1,
    )
    assert ev is not None
    assert ev["signal_name"] == "follow_up_collapse"
    assert "complete collapse" in ev["evidence"]
    assert ev["score_delta"] == -0.20

    # Partial collapse: drop >= 2.0, depth 3.1-5.0
    ev_partial = _detect_follow_up_collapse_event(
        answer="",
        last_question="",
        current_depth=4.0,
        prior_depth_scores=[6.5],
        topic_follow_up_count=1,
    )
    assert ev_partial is not None
    assert "partial collapse" in ev_partial["evidence"]
    assert ev_partial["score_delta"] == -0.12

def test_detect_latency_mismatch():
    # detail Q, word count <= 42, depth drop
    ev = _detect_latency_mismatch_event(
        answer="Short answer here.",
        last_question="Walk me through what happened first.",
        current_depth=4.0,
        prior_depth_scores=[6.0],
        topic_follow_up_count=1,
    )
    assert ev is not None
    assert ev["signal_name"] == "latency_mismatch"
    assert ev["score_delta"] == -0.10

def test_detect_depth_decay():
    ev = _detect_depth_decay_event(
        answer="",
        last_question="",
        current_depth=5.0,
        prior_depth_scores=[],
        topic_follow_up_count=0,
        session_score_history=[7.0, 7.5, 3.0, 2.5],
        turns_since_last_decay=5
    )
    assert ev is not None
    assert ev["signal_name"] == "depth_decay"
    assert ev["score_delta"] in (-0.06, -0.12)

def test_score_question_complexity():
    assert _score_question_complexity("Can you give me an example of a time?") == "complex"
    assert _score_question_complexity("What is your current company?") == "simple"
    assert _score_question_complexity("This is a moderately long question that has no special phrases at all.") == "moderate"

def test_detect_complexity_latency_mismatch():
    # Case 1: Fast-complex (complex Q answered suspciously fast)
    ev_fast = _detect_complexity_latency_mismatch_event(
        answer="This is a substantive answer with at least twenty words to verify complexity latency mismatch detection parameters, adding more words to exceed twenty.",
        last_question="Walk me through a project strategy tradeoff details.",
        current_depth=5.0,
        prior_depth_scores=[],
        topic_follow_up_count=0,
        response_latency_sec=4.0
    )
    assert ev_fast is not None
    assert ev_fast["signal_name"] == "complexity_latency_mismatch"
    assert ev_fast["score_delta"] == -0.14

    # Case 2: Slow-simple (simple Q answered suspiciously slow)
    ev_slow = _detect_complexity_latency_mismatch_event(
        answer="This is a substantive answer with at least twenty words to verify complexity latency mismatch detection parameters, adding more words to exceed twenty.",
        last_question="What is your current role and years of experience?",
        current_depth=5.0,
        prior_depth_scores=[],
        topic_follow_up_count=0,
        response_latency_sec=25.0
    )
    assert ev_slow is not None
    assert ev_slow["signal_name"] == "complexity_latency_mismatch"
    assert ev_slow["score_delta"] == -0.08

def test_ownership_clarified():
    ev = _detect_ownership_clarified_event(
        answer="I personally owned the design and specifically managed the rollout.",
        last_question=""
    )
    assert ev is not None
    assert ev["signal_name"] == "ownership_clarified"
    assert ev["score_delta"] == 0.05

def test_example_given():
    ev = _detect_example_given_event(
        answer="At my last system in 2023, I resolved the database deadlock issue by rewriting the transactional queries completely, which improved performance significantly across all platforms.",
        last_question=""
    )
    assert ev is not None
    assert ev["signal_name"] == "example_given"
    assert ev["score_delta"] == 0.04

def test_compute_trust_delta():
    quality = {
        "clarity": 8.0,
        "depth": 8.0,
        "specificity": 8.0,
        "grounding": 8.0,
        "fluency": 8.0,
        "confidence": 8.0,
    }
    td = compute_trust_delta([], quality)
    assert td["delta"] == 0.20
    assert "high-quality" in td["reason"]

def test_build_turn_decision():
    quality = {"clarity": 6.0, "depth": 6.0}
    signals = build_signal_flags([])
    trust = {"delta": 0.0, "reason": "none"}
    td = build_turn_decision(quality, signals, [], trust, "MOVE_ON", "normal", "next")
    assert td["quality"]["clarity"] == 6.0
    assert td["decision"]["action"] == "MOVE_ON"
