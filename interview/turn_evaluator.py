"""
Turn evaluation orchestrator.
Consumed by eval_pipeline.py to produce a TurnDecision from one candidate answer.
Refactor additions (all non-breaking):
  - EvalGraphState TypedDict: typed state for the LangGraph state machine
  - Five LangGraph nodes: llm_evaluate, detect_signals, filter_signals,
    build_decision, handle_error -- each does exactly one thing
  - Conditional edge: llm_evaluate -> handle_error on exception (reported to runtime)
  - eval_graph: compiled LangGraph StateGraph (compiled once at module level)
  - run_turn_evaluation: thin wrapper that invokes eval_graph.ainvoke() when
    LangGraph is available, falls back to the original sequential await chain
    when langgraph is not installed
  - _is_signal_enabled: removed duplication -- now delegates to the same
    Pydantic-coerced bool the signal_toggles dict already provides
  Public API signature (run_turn_evaluation) unchanged.
"""
from __future__ import annotations
import logging
from typing import Any, Optional, TypedDict
from interview.session_state import is_always_on_signal
from interview.turn_decision import (
    TurnDecision,
    detect_signal_events_async,
    build_signal_flags,
    build_turn_decision,
)
logger = logging.getLogger("interview-agent")
# LangGraph -- optional; graceful fallback to sequential await if not installed
try:
    from langgraph.graph import StateGraph, END
    _LANGGRAPH_AVAILABLE = True
except ImportError:  # pragma: no cover
    _LANGGRAPH_AVAILABLE = False
    StateGraph = None  # type: ignore[assignment,misc]
    END = "__end__"    # type: ignore[assignment]
# ===========================================================================
# Signal toggle helper -- single source of truth (no more duplicate function)
# ===========================================================================
def _is_signal_enabled(signal_toggles: Optional[dict[str, Any]], signal_name: str) -> bool:
    """Return True iff the named signal is enabled (default: True when absent).
    Always-on signals (see ALWAYS_ON_PROCTORING_SIGNALS in session_state.py)
    bypass the toggle check entirely -- they MUST fire regardless of whether
    the org's stored JSON has them set to false. This mirrors the TS-layer
    isProctoringSignalEnabled override.
    For togglable signals, default to True when the key is absent and honor
    any explicit truthy/falsy value otherwise.
    """
    # Hard override: always-on signals fire regardless of toggle state.
    if is_always_on_signal(signal_name):
        return True
    if not signal_toggles:
        return True
    raw = signal_toggles.get(signal_name)
    if raw is None:
        return True
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        return raw.strip().lower() in ("true", "1", "yes", "on")
    if isinstance(raw, (int, float)):
        return bool(raw)
    return True
# ===========================================================================
# LangGraph: EvalGraphState -- typed state for all graph nodes
# ===========================================================================
class EvalGraphState(TypedDict):
    """Typed state dict threaded through the LangGraph evaluation graph.
    Each node reads from and writes to this shared state.
    LangGraph merges node outputs back into state automatically.
    """
    # Inputs (set before graph.ainvoke)
    candidate_answer: str
    last_question: str
    transcript_lines: list
    client: Any
    org_id: Optional[str]
    llm_model: str
    evaluate_answer_fn: Any          # async callable
    signal_toggles: Optional[dict]
    session_score_history: Optional[list]
    turns_since_last_decay: int
    response_latency_sec: Optional[float]
    topic_follow_up_count: int
    prior_depth_scores: Optional[list]
    collapse_stage: int
    candidate_band: str
    active_topic: str
    topic_importance: str
    topic_tag: str
    topic_probe_focus: list
    job_title: str
    # Intermediate results (filled by nodes)
    raw_quality: dict                # output of evaluate_answer_fn
    signal_events: list              # detected + filtered signal events
    turn_decision: dict              # final TurnDecision dict
    # Error channel
    error: Optional[str]             # set by any node on exception
# ===========================================================================
# LangGraph nodes -- each does exactly one thing
# ===========================================================================
async def _node_llm_evaluate(state: EvalGraphState) -> dict:
    """Node 1: call the LLM evaluation function to score the answer."""
    try:
        result = await state["evaluate_answer_fn"](
            candidate_answer=state["candidate_answer"],
            last_question=state["last_question"],
            topic_follow_up_count=state["topic_follow_up_count"],
            transcript_lines=state["transcript_lines"],
            client=state["client"],
            org_id=state["org_id"],
            llm_model=state["llm_model"],
            candidate_band=state["candidate_band"],
            active_topic=state.get("active_topic", ""),
            topic_importance=state.get("topic_importance", "HIGH"),
            topic_tag=state.get("topic_tag", "RESUME_TOPIC"),
            topic_probe_focus=state.get("topic_probe_focus", []),
            job_title=state.get("job_title", ""),
        )
        return {"raw_quality": result, "error": None}
    except Exception as exc:
        logger.error("[EVAL_GRAPH] node_llm_evaluate failed: %s", exc, exc_info=True)
        return {
            "raw_quality": {},
            "error": f"llm_evaluate: {exc}",
        }
async def _node_detect_signals(state: EvalGraphState) -> dict:
    """Node 2: run signal detectors against the raw answer."""
    try:
        events = await detect_signal_events_async(
            candidate_answer=state["candidate_answer"],
            last_question=state["last_question"],
            current_depth=float(state["raw_quality"].get("depth", 5.0)),
            prior_depth_scores=state["prior_depth_scores"] or [],
            topic_follow_up_count=state["topic_follow_up_count"],
            collapse_stage=state.get("collapse_stage", 0),
            session_score_history=state["session_score_history"],
            turns_since_last_decay=state["turns_since_last_decay"],
            response_latency_sec=state["response_latency_sec"],
        )
        return {"signal_events": events}
    except Exception as exc:
        logger.error("[EVAL_GRAPH] node_detect_signals failed: %s", exc, exc_info=True)
        return {"signal_events": [], "error": f"detect_signals: {exc}"}
async def _node_filter_signals(state: EvalGraphState) -> dict:
    """Node 3: apply per-org signal toggles to the detected events."""
    toggles = state.get("signal_toggles") or {}
    filtered = [
        ev for ev in (state.get("signal_events") or [])
        if _is_signal_enabled(toggles, str(ev.get("signal_name", "")))
    ]
    return {"signal_events": filtered}
async def _node_build_decision(state: EvalGraphState) -> dict:
    """Node 4: assemble the final TurnDecision from quality + filtered signals."""
    try:
        raw = state.get("raw_quality") or {}
        events = state.get("signal_events") or []
        td = build_turn_decision(
            raw,
            build_signal_flags(events),
            events,
            raw.get("action", "MOVE_ON"),
            raw.get("probe_mode") or "normal",
            raw.get("next_goal", ""),
        )
        return {"turn_decision": td}
    except Exception as exc:
        logger.error("[EVAL_GRAPH] node_build_decision failed: %s", exc, exc_info=True)
        return {"turn_decision": None, "error": f"build_decision: {exc}"}
async def _node_handle_error(state: EvalGraphState) -> dict:
    """Error reporting node -- preserve the failure for the runtime recovery path."""
    logger.error(
        "[EVAL_GRAPH] Evaluation failed -- error=%s",
        state.get("error"),
    )
    return {
        "turn_decision": None,
        "signal_events": [],
        "error": state.get("error") or "eval_graph_error",
    }
# ===========================================================================
# LangGraph: EvalGraph -- compiled once at module level
# ===========================================================================
def _build_eval_graph():
    """Build and compile the LangGraph StateGraph for turn evaluation.
    Graph topology:
        llm_evaluate --(ok)--> detect_signals --> filter_signals --> build_decision --> END
                     --(err)-> handle_error -------------------------------------------> END
    """
    if not _LANGGRAPH_AVAILABLE:
        return None
    graph: StateGraph = StateGraph(EvalGraphState)
    graph.add_node("llm_evaluate",    _node_llm_evaluate)
    graph.add_node("detect_signals",  _node_detect_signals)
    graph.add_node("filter_signals",  _node_filter_signals)
    graph.add_node("build_decision",  _node_build_decision)
    graph.add_node("handle_error",    _node_handle_error)
    graph.set_entry_point("llm_evaluate")
    # Conditional edge: route to error recovery if LLM call failed
    graph.add_conditional_edges(
        "llm_evaluate",
        lambda s: "handle_error" if s.get("error") else "detect_signals",
        {"handle_error": "handle_error", "detect_signals": "detect_signals"},
    )
    graph.add_edge("detect_signals", "filter_signals")
    graph.add_edge("filter_signals", "build_decision")
    graph.add_edge("build_decision", END)
    graph.add_edge("handle_error",   END)
    return graph.compile()
# Compiled once at import time -- reused across all evaluation calls
# NOTE: there is intentionally NO local error-recovery default here. Recovery is
# owned by eval (agent_scoring.evaluate_answer returns low-confidence scores on
# failure; eval_pipeline builds a recovery decision as a last resort). The agent
# has no fallback path -- it depends only on eval's return.
eval_graph = _build_eval_graph()
# ===========================================================================
# Public API -- signature identical to original
# ===========================================================================
async def run_turn_evaluation(
    *,
    candidate_answer: str,
    last_question: str,
    transcript_lines: list,
    client,
    org_id: Optional[str],
    llm_model: str,
    evaluate_answer_fn,
    signal_toggles: Optional[dict[str, Any]] = None,
    session_score_history: Optional[list[float]] = None,
    turns_since_last_decay: int = 999,
    response_latency_sec: Optional[float] = None,
    topic_follow_up_count: int = 0,
    prior_depth_scores: Optional[list[float]] = None,
    collapse_stage: int = 0,
    candidate_band: str = "mid",
    active_topic: str = "",
    topic_importance: str = "HIGH",
    topic_tag: str = "RESUME_TOPIC",
    topic_probe_focus: Optional[list] = None,
    job_title: str = "",
) -> tuple[TurnDecision, str]:
    """Evaluate one candidate answer and produce a TurnDecision.
    Routes through the LangGraph EvalGraph when langgraph is installed:
      llm_evaluate -> detect_signals -> filter_signals -> build_decision
    Falls back to the original sequential await chain if LangGraph is absent.
    Returns (TurnDecision, directive) -- directive is always "" here, as it is
    overwritten by eval_pipeline before being injected into the chat context.
    """
    if eval_graph is not None:
        # -- LangGraph path: typed, composable, error-safe --------------------
        initial_state: EvalGraphState = {
            "candidate_answer":      candidate_answer,
            "last_question":         last_question,
            "transcript_lines":      transcript_lines,
            "client":                client,
            "org_id":                org_id,
            "llm_model":             llm_model,
            "evaluate_answer_fn":    evaluate_answer_fn,
            "signal_toggles":        signal_toggles,
            "session_score_history": session_score_history,
            "turns_since_last_decay":turns_since_last_decay,
            "response_latency_sec":  response_latency_sec,
            "topic_follow_up_count": topic_follow_up_count,
            "prior_depth_scores":    prior_depth_scores,
            "collapse_stage":        collapse_stage,
            "candidate_band":        candidate_band,
            "active_topic":          active_topic,
            "topic_importance":      topic_importance,
            "topic_tag":             topic_tag,
            "topic_probe_focus":     topic_probe_focus or [],
            "job_title":             job_title,
            # Intermediate (filled by nodes)
            "raw_quality":    {},
            "signal_events":  [],
            "turn_decision":  {},
            "error":          None,
        }
        final_state = await eval_graph.ainvoke(initial_state)
        if final_state.get("error"):
            raise RuntimeError(str(final_state["error"]))
        td = final_state.get("turn_decision")
        if not td:
            raise RuntimeError("eval graph completed without a turn decision")
        return td, ""
    # -- Fallback: original sequential await chain ---------------------------
    result = await evaluate_answer_fn(
        candidate_answer=candidate_answer,
        last_question=last_question,
        topic_follow_up_count=topic_follow_up_count,
        transcript_lines=transcript_lines,
        client=client,
        org_id=org_id,
        llm_model=llm_model,
        candidate_band=candidate_band,
        active_topic=active_topic,
        topic_importance=topic_importance,
        topic_tag=topic_tag,
        topic_probe_focus=topic_probe_focus or [],
        job_title=job_title,
    )
    signal_events = await detect_signal_events_async(
        candidate_answer=candidate_answer,
        last_question=last_question,
        current_depth=float(result.get("depth", 5.0)),
        prior_depth_scores=prior_depth_scores or [],
        topic_follow_up_count=topic_follow_up_count,
        collapse_stage=collapse_stage,
        session_score_history=session_score_history,
        turns_since_last_decay=turns_since_last_decay,
        response_latency_sec=response_latency_sec,
    )
    signal_events = [
        ev for ev in signal_events
        if _is_signal_enabled(signal_toggles, str(ev.get("signal_name", "")))
    ]
    td = build_turn_decision(
        result,
        build_signal_flags(signal_events),
        signal_events,
        result.get("action", "MOVE_ON"),
        result.get("probe_mode") or "normal",
        result.get("next_goal", ""),
    )
    return td, ""   # directive always overwritten by eval_pipeline
