"""
Formal contradiction state machine for interview integrity handling.

This module keeps contradiction handling explicit and auditable:
  none -> surfaced -> candidate_clarified / unresolved -> repeated

It does not own trust math. It owns the contradiction lifecycle and the
structured event metadata that downstream systems can consume.
"""
from __future__ import annotations

import time
from typing import Any, TypedDict, Literal, Optional


ContradictionStatus = Literal[
    "none",
    "surfaced",
    "candidate_clarified",
    "unresolved",
    "repeated",
]


class ContradictionState(TypedDict, total=False):
    status: ContradictionStatus
    active: bool
    surfaced_turn: int
    last_turn: int
    repeat_count: int
    contradiction_type: str
    context: str
    old_turn: int
    new_turn: int
    old_value: str
    new_value: str
    old_quote: str
    new_quote: str
    trust_delta: float
    probe_type: str
    recovery_path: str
    recruiter_note: str
    event_history: list[dict[str, Any]]
    updated_at: float


def init_contradiction_state() -> ContradictionState:
    return ContradictionState(
        status="none",
        active=False,
        surfaced_turn=0,
        last_turn=0,
        repeat_count=0,
        contradiction_type="",
        context="",
        old_turn=0,
        new_turn=0,
        old_value="",
        new_value="",
        old_quote="",
        new_quote="",
        trust_delta=0.0,
        probe_type="none",
        recovery_path="",
        recruiter_note="No contradiction surfaced.",
        event_history=[],
        updated_at=time.time(),
    )


def _event_from_state(state: ContradictionState, source: str, turn: int) -> dict[str, Any]:
    return {
        "event": "contradiction_state",
        "source": source,
        "status": state["status"],
        "turn": turn,
        "surfaced_turn": state.get("surfaced_turn", 0),
        "repeat_count": state.get("repeat_count", 0),
        "trust_delta": state.get("trust_delta", 0.0),
        "probe_type": state.get("probe_type", "contradiction"),
        "recovery_path": state.get("recovery_path", ""),
        "recruiter_note": state.get("recruiter_note", ""),
        "contradiction_type": state.get("contradiction_type", ""),
        "context": state.get("context", ""),
        "old_turn": state.get("old_turn", 0),
        "new_turn": state.get("new_turn", 0),
        "old_value": state.get("old_value", ""),
        "new_value": state.get("new_value", ""),
        "old_quote": state.get("old_quote", ""),
        "new_quote": state.get("new_quote", ""),
    }


def _evidence_text(contradiction: dict[str, Any]) -> str:
    old_value = str(contradiction.get("old_value", "") or "")
    new_value = str(contradiction.get("new_value", "") or "")
    old_quote = str(contradiction.get("old_quote", "") or "")
    new_quote = str(contradiction.get("new_quote", "") or "")
    parts = []
    if old_value or old_quote:
        parts.append(f"earlier={old_value or old_quote}")
    if new_value or new_quote:
        parts.append(f"now={new_value or new_quote}")
    return " | ".join(parts)


def surface_contradiction(
    state: ContradictionState,
    contradiction: dict[str, Any],
    turn: int,
) -> tuple[ContradictionState, dict[str, Any]]:
    next_state = ContradictionState(**state)
    repeated = next_state.get("status") in {"surfaced", "unresolved", "repeated"}

    next_state["status"] = "repeated" if repeated else "surfaced"
    next_state["active"] = True
    next_state["surfaced_turn"] = int(next_state.get("surfaced_turn", 0) or turn)
    next_state["last_turn"] = turn
    next_state["repeat_count"] = int(next_state.get("repeat_count", 0) or 0) + 1
    next_state["contradiction_type"] = str(contradiction.get("type", "") or "")
    next_state["context"] = str(contradiction.get("context", "") or "")
    next_state["old_turn"] = int(contradiction.get("old_turn", 0) or 0)
    next_state["new_turn"] = int(contradiction.get("new_turn", turn) or turn)
    next_state["old_value"] = str(contradiction.get("old_value", "") or "")
    next_state["new_value"] = str(contradiction.get("new_value", "") or "")
    next_state["old_quote"] = str(contradiction.get("old_quote", "") or "")
    next_state["new_quote"] = str(contradiction.get("new_quote", "") or "")
    next_state["trust_delta"] = -0.10 if not repeated else -0.14
    next_state["probe_type"] = "contradiction"
    next_state["recovery_path"] = (
        "Surface it with gentle confusion, then ask the candidate to connect the two claims."
    )
    next_state["recruiter_note"] = (
        "Contradiction surfaced and needs clarification."
        if not repeated
        else "Repeated contradiction pattern; clarification has not held."
    )
    next_state["updated_at"] = time.time()

    event = _event_from_state(next_state, "surface", turn)
    event["evidence"] = _evidence_text(contradiction)
    event["trust_delta"] = next_state["trust_delta"]

    history = list(next_state.get("event_history", []))
    history.append(event)
    next_state["event_history"] = history
    return next_state, event


def clarify_contradiction(
    state: ContradictionState,
    turn: int,
) -> tuple[ContradictionState, dict[str, Any]]:
    next_state = ContradictionState(**state)
    next_state["status"] = "candidate_clarified"
    next_state["active"] = False
    next_state["last_turn"] = turn
    next_state["trust_delta"] = 0.06
    next_state["probe_type"] = "contradiction"
    next_state["recovery_path"] = "Clarified after a follow-up question."
    next_state["recruiter_note"] = "Candidate clarified the inconsistency convincingly."
    next_state["updated_at"] = time.time()

    event = _event_from_state(next_state, "clarified", turn)
    event["trust_delta"] = next_state["trust_delta"]
    event["evidence"] = "candidate clarified the conflicting claim"

    history = list(next_state.get("event_history", []))
    history.append(event)
    next_state["event_history"] = history
    return next_state, event


def mark_unresolved(
    state: ContradictionState,
    turn: int,
) -> tuple[ContradictionState, dict[str, Any]]:
    next_state = ContradictionState(**state)
    next_state["status"] = "unresolved"
    next_state["active"] = False
    next_state["last_turn"] = turn
    next_state["trust_delta"] = 0.0
    next_state["probe_type"] = "contradiction"
    next_state["recovery_path"] = (
        "Keep it noted as unresolved and continue the interview without escalating."
    )
    next_state["recruiter_note"] = "Contradiction remained unresolved after follow-up."
    next_state["updated_at"] = time.time()

    event = _event_from_state(next_state, "unresolved", turn)
    event["trust_delta"] = 0.0
    event["evidence"] = "follow-up did not fully resolve the earlier inconsistency"

    history = list(next_state.get("event_history", []))
    history.append(event)
    next_state["event_history"] = history
    return next_state, event


def advance_contradiction_state(
    state: ContradictionState,
    contradiction: Optional[dict[str, Any]],
    *,
    turn: int,
    action: str,
    quality_avg: float,
    clarification_threshold: float = 5.5,
) -> tuple[ContradictionState, Optional[dict[str, Any]]]:
    """
    Advance the contradiction state based on the current turn.

    Returns:
        (updated_state, event_or_none)
    """
    if contradiction:
        return surface_contradiction(state, contradiction, turn)

    if state.get("status") in {"surfaced", "repeated"}:
        if action == "MOVE_ON" and quality_avg >= clarification_threshold:
            return clarify_contradiction(state, turn)
        if action == "PROBE":
            return mark_unresolved(state, turn)
        return mark_unresolved(state, turn)

    next_state = ContradictionState(**state)
    next_state["last_turn"] = turn
    next_state["updated_at"] = time.time()
    return next_state, None


def summarize_contradiction_state(state: ContradictionState) -> dict[str, Any]:
    status = state.get("status", "none")
    interpretation = {
        "none": "No contradiction surfaced.",
        "surfaced": "A contradiction surfaced and should be treated as active until clarified.",
        "candidate_clarified": "The candidate clarified the inconsistency convincingly.",
        "unresolved": "The contradiction remained unresolved after follow-up.",
        "repeated": "The same contradiction pattern surfaced again.",
    }.get(status, "No contradiction surfaced.")

    return {
        "status": status,
        "active": bool(state.get("active", False)),
        "repeatCount": int(state.get("repeat_count", 0) or 0),
        "surfacedTurn": int(state.get("surfaced_turn", 0) or 0),
        "lastTurn": int(state.get("last_turn", 0) or 0),
        "contradictionType": state.get("contradiction_type", ""),
        "trustDelta": float(state.get("trust_delta", 0.0) or 0.0),
        "probeType": state.get("probe_type", "contradiction"),
        "recoveryPath": state.get("recovery_path", ""),
        "recruiterNote": state.get("recruiter_note", interpretation),
        "interpretation": interpretation,
        "evidence": {
            "oldTurn": int(state.get("old_turn", 0) or 0),
            "newTurn": int(state.get("new_turn", 0) or 0),
            "oldValue": state.get("old_value", ""),
            "newValue": state.get("new_value", ""),
            "oldQuote": state.get("old_quote", ""),
            "newQuote": state.get("new_quote", ""),
            "context": state.get("context", ""),
        },
        "history": list(state.get("event_history", [])),
    }
