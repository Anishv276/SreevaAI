"""
TurnEvaluator - orchestrates per-turn answer evaluation.

Combines:
  - score_answer_quality()        (quality scores)
  - evaluate_answer_and_decide()  (LLM probe/move-on decision)
  - signal detection              (first-class behavioral and integrity signals)
  - trust delta computation
  - probe routing

Returns one TurnDecision per candidate answer.
Called from agent.py's _evaluate_and_inject() instead of the inline pipeline.
"""
import asyncio
import logging
from typing import Any, Optional

from interview.turn_decision import (
    TurnDecision,
    detect_signal_events,
    build_signal_flags,
    compute_trust_delta,
    build_turn_decision,
)
from interview.probe_strategy import route, build_directive

logger = logging.getLogger("interview-agent")


def _is_signal_enabled(signal_toggles: Optional[dict[str, Any]], signal_name: str) -> bool:
    """Return True if the signal should be allowed through the filter.

    Logic:
      - No toggles dict at all → all signals enabled.
      - Signal name NOT in the dict → default True (allow; unknown = not explicitly disabled).
      - Signal name IS in the dict → honour the value.
    """
    if not signal_toggles:
        return True
    raw_value = signal_toggles.get(signal_name)
    if raw_value is None:
        # Key absent → treat as enabled (do NOT silently suppress)
        return True
    if isinstance(raw_value, bool):
        return raw_value
    if isinstance(raw_value, str):
        normalized = raw_value.strip().lower()
        if normalized in ("true", "1", "yes", "on"):
            return True
        if normalized in ("false", "0", "no", "off"):
            return False
    if isinstance(raw_value, (int, float)):
        return bool(raw_value)
    return True


async def run_turn_evaluation(
    *,
    candidate_answer: str,
    last_question: str,
    transcript_lines: list,
    contradiction_detected: bool,
    client,
    org_id: Optional[str],
    llm_model: str,
    score_answer_quality_fn,              # imported from agent.py at call site
    evaluate_answer_and_decide_fn,        # imported from agent.py at call site
    signal_toggles: Optional[dict[str, Any]] = None,
    uncovered_topics: Optional[list[str]] = None,
    session_score_history: Optional[list[float]] = None,
    turns_since_last_decay: int = 999,
    response_latency_sec: Optional[float] = None,
) -> tuple[TurnDecision, str]:
    """
    Run per-turn evaluation pipeline.

    Returns:
        (TurnDecision, directive_string)
    """
    # Run quality scoring and LLM decision concurrently
    quality_task = asyncio.create_task(
        score_answer_quality_fn(
            candidate_answer=candidate_answer,
            last_question=last_question,
            transcript_lines=transcript_lines,
            client=client,
            org_id=org_id,
            llm_model=llm_model,
        )
    )
    decision_task = asyncio.create_task(
        evaluate_answer_and_decide_fn(
            candidate_answer=candidate_answer,
            last_question=last_question,
            topic_follow_up_count=0,
            transcript_lines=transcript_lines,
            client=client,
            org_id=org_id,
            llm_model=llm_model,
        )
    )

    quality, llm_decision = await asyncio.gather(quality_task, decision_task)

    current_depth: float = float(quality.get("depth", 5.0))

    signal_events = detect_signal_events(
        candidate_answer=candidate_answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=[],  # Not used with saturation system
        topic_follow_up_count=0,  # Not used with saturation system
        contradiction_detected=contradiction_detected,
        collapse_stage=0,  # Not used with saturation system
        session_score_history=session_score_history,
        turns_since_last_decay=turns_since_last_decay,
        response_latency_sec=response_latency_sec,
    )
    signal_events = [
        event
        for event in signal_events
        if _is_signal_enabled(signal_toggles, str(event.get("signal_name", "")))
    ]
    signals = build_signal_flags(signal_events)

    # Route to action/mode/goal
    action, mode, next_goal = route(
        signals=signals,
        depth_signal=llm_decision.get("depth_signal", "SURFACE"),
        llm_action=llm_decision.get("action", "MOVE_ON"),
        llm_probe_mode=llm_decision.get("probe_mode"),
    )

    trust = compute_trust_delta(signal_events=signal_events, quality=quality)

    td = build_turn_decision(
        quality=quality,
        signals=signals,
        signal_events=signal_events,
        trust=trust,
        action=action,
        mode=mode,
        next_goal=next_goal,
    )

    directive = build_directive(
        td=td,
        depth_signal=llm_decision.get("depth_signal", "SURFACE"),
        collapse_stage=0,
        uncovered_topics=uncovered_topics,
    )

    return td, directive
