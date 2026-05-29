"""
TurnEvaluator - orchestrates per-turn answer evaluation.

FIX 1: Uses single merged evaluate_answer() call instead of two parallel calls.
  BEFORE: score_answer_quality() + evaluate_answer_and_decide() via asyncio.gather()
          = 2 OpenAI round-trips in parallel, wait for the slower one (~900-1500ms)
  AFTER:  evaluate_answer() = 1 OpenAI round-trip returning quality + routing (~700ms)

FIX 2: Quality scoring is no longer a separate blocking task.
  BEFORE: gate blocked until BOTH quality scores AND routing decision returned
  AFTER:  single call returns both together — gate unblocks as soon as the one call finishes.
          eval_pipeline.py gets quality scores immediately in the same result dict.
"""
import logging
from typing import Any, Optional

from interview.turn_decision import (
    TurnDecision,
    detect_signal_events,
    build_signal_flags,
    compute_trust_delta,
    build_turn_decision,
)

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
    transcript_lines: list,
    contradiction_detected: bool,
    client,
    org_id: Optional[str],
    llm_model: str,
    evaluate_answer_fn,              # merged fn: returns quality scores + routing in one call
    signal_toggles: Optional[dict[str, Any]] = None,
    session_score_history: Optional[list[float]] = None,
    turns_since_last_decay: int = 999,
    response_latency_sec: Optional[float] = None,
    topic_follow_up_count: int = 0,
    prior_depth_scores: Optional[list[float]] = None,
) -> tuple[TurnDecision, str]:
    """
    Run per-turn evaluation pipeline.

    FIX 1+2: One merged LLM call replaces two parallel calls.
    evaluate_answer_fn returns both quality scores AND routing decision.

    EXAMPLE LOG you will see:
      BEFORE: [EVAL] quality_task started | [EVAL] decision_task started | ... gather wait ~1200ms
      AFTER:  [EVAL] merged evaluate_answer call started | ... done in ~700ms

    Returns: (TurnDecision, directive_string)
    """
    # Single call — scores quality AND decides PROBE/MOVE_ON in one round-trip
    result = await evaluate_answer_fn(
        candidate_answer=candidate_answer,
        last_question=last_question,
        topic_follow_up_count=topic_follow_up_count,
        transcript_lines=transcript_lines,
        client=client,
        org_id=org_id,
        llm_model=llm_model,
    )

    # result contains both quality fields (clarity, depth...) and routing fields (action, probe_mode...)
    quality = result        # eval_pipeline reads quality scores directly from this
    llm_decision = result   # routing fields live in the same dict

    current_depth: float = float(quality.get("depth", 5.0))

    signal_events = detect_signal_events(
        candidate_answer=candidate_answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores or [],
        topic_follow_up_count=topic_follow_up_count,
        contradiction_detected=contradiction_detected,
        collapse_stage=0,
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

    # action/mode/next_goal come directly from the LLM decision.
    # eval_pipeline.py overwrites the directive completely on every path
    # (PROBE inline, MOVE_ON via DirectiveCompiler, REPHRASE, contradiction)
    # so route() and build_directive() from probe_strategy are not needed here.
    action = llm_decision.get("action", "MOVE_ON")
    mode = llm_decision.get("probe_mode") or "normal"
    next_goal = llm_decision.get("next_goal", "")

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

    # directive is a placeholder — eval_pipeline.py always overwrites it.
    directive = ""

    return td, directive
