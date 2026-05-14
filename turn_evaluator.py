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

from turn_decision import (
    TurnDecision,
    SignalFlags,
    SignalEvent,
    detect_signal_events,
    build_signal_flags,
    compute_trust_delta,
    build_turn_decision,
)
from probe_strategy import route, build_directive

logger = logging.getLogger("interview-agent")


def _is_signal_enabled(signal_toggles: Optional[dict[str, Any]], signal_name: str) -> bool:
    if not signal_toggles:
        return True
    raw_value = signal_toggles.get(signal_name)
    if raw_value is None:
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
    topic_follow_up_count: int,
    transcript_lines: list,
    depth_history: list[float],           # depth scores for current topic, oldest first
    contradiction_detected: bool,
    client,
    org_id: Optional[str],
    llm_model: str,
    score_answer_quality_fn,              # imported from agent.py at call site
    evaluate_answer_and_decide_fn,        # imported from agent.py at call site
    signal_toggles: Optional[dict[str, Any]] = None,
    max_follow_ups: int = 2,
    uncovered_topics: Optional[list[str]] = None,
    collapse_stage: int = 0,
    session_score_history: Optional[list[float]] = None,
    turns_since_last_decay: int = 999,
    response_latency_sec: Optional[float] = None,
    current_stage: str = "",
) -> tuple[TurnDecision, str]:
    """
    Run full per-turn evaluation pipeline.

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
            topic_follow_up_count=topic_follow_up_count,
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
        prior_depth_scores=depth_history,
        topic_follow_up_count=topic_follow_up_count,
        contradiction_detected=contradiction_detected,
        collapse_stage=collapse_stage,
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
    contradiction_enabled = _is_signal_enabled(signal_toggles, "contradiction")
    effective_contradiction_detected = contradiction_detected and contradiction_enabled

    # Route to action/mode/goal
    action, mode, next_goal = route(
        signals=signals,
        depth_signal=llm_decision.get("depth_signal", "SURFACE"),
        topic_follow_up_count=topic_follow_up_count,
        max_follow_ups=max_follow_ups,
        contradiction_detected=effective_contradiction_detected,
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
        topic_follow_up_count=topic_follow_up_count,
        collapse_stage=collapse_stage,
        uncovered_topics=uncovered_topics,
        current_stage=current_stage,
        max_follow_ups=max_follow_ups,
    )

    logger.info(
        f"[TURN_EVAL] action={action} mode={mode} signals={[k for k,v in signals.items() if v]} "
        f"trust_delta={trust['delta']:+.2f} depth={current_depth:.1f}"
    )

    return td, directive
