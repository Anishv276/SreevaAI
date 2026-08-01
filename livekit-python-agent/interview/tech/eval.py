"""
eval_pipeline.py
Scores + probe-points → saturation → action (PROBE/MOVE_ON).

Flow:
  evaluate_answer()  — parallel score + points/route
  TopicState         — saturation / denial / weak-exit
  run_eval_and_build_directive() — returns action, points, signal (thin route)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from interview.tech.scoring import evaluate_answer, NON_FOLLOWUP_SIGNALS, DENIAL_SIGNALS
from interview.slack_error_logger import log_llm_error

logger = logging.getLogger("interview-agent")

_LEVEL_SATURATION: dict[int, dict] = {
    1: {"threshold": 5.0, "base_credit": 1.1},
    2: {"threshold": 5.5, "base_credit": 0.9},
    3: {"threshold": 7.0, "base_credit": 0.8},
    4: {"threshold": 8.5, "base_credit": 0.7},
}


class TopicState:
    """Level-based topic saturation. No ladder."""

    _WEAK_EXIT_TURN3_PCT: float = 0.50
    _HARD_CAP_TURNS: int = 5
    _DRY_TOPIC_ZEROS: int = 2
    _DEPTH_STRONG_SATURATION_STREAK: int = 2

    def __init__(self, topic_name: str, updated_turn: int = 0, level: int = 2):
        self.topic_name = topic_name
        self.level = level
        self.updated_turn = updated_turn
        cfg = _LEVEL_SATURATION.get(level, _LEVEL_SATURATION[2])
        self.saturation_threshold: float = cfg["threshold"]
        self.base_turn_credit: float = cfg["base_credit"]
        self.saturation_score = 0.0
        self.follow_up_turns = 0
        self.is_saturated = False
        self.opened_at_turn = 0
        self.signals_fired: list[str] = []
        self.last_score = None
        self.consecutive_zero_scores = 0
        self.consecutive_denials: int = 0
        self.closed_on_denials: bool = False
        self.consecutive_depth_strong: int = 0
        self.clarification_request_count = 0
        self.probe_rotation_index = 0

    def is_weak_candidate_exit(self) -> bool:
        if self.saturation_threshold <= 0 or self.follow_up_turns < 3:
            return False
        sat_pct = self.saturation_score / self.saturation_threshold
        if self.follow_up_turns == 3:
            return sat_pct < self._WEAK_EXIT_TURN3_PCT
        return self.follow_up_turns >= self._HARD_CAP_TURNS

    def is_dry_topic(self) -> bool:
        return (
            self.consecutive_zero_scores >= self._DRY_TOPIC_ZEROS
            and self.follow_up_turns >= self._DRY_TOPIC_ZEROS
        )

    def should_exit_on_denials(self) -> bool:
        return self.consecutive_denials >= 1

    def should_exit_on_depth_strong_streak(self) -> bool:
        return self.consecutive_depth_strong >= self._DEPTH_STRONG_SATURATION_STREAK

    def add_contribution(self, weighted: float, signal: str | None, turn: int | None = None) -> None:
        if signal in NON_FOLLOWUP_SIGNALS:
            if turn is not None:
                self.updated_turn = turn
            return

        contribution = max(0.0, _score_to_contribution(weighted))
        if weighted >= 3.0:
            effective_base = self.base_turn_credit
        elif weighted >= 1.0:
            effective_base = self.base_turn_credit * (weighted - 1.0) / 2.0
        else:
            effective_base = 0.0
        self.saturation_score += effective_base + contribution
        self.follow_up_turns += 1
        if signal == "mastery_demonstrated":
            self.consecutive_depth_strong += 1
        else:
            self.consecutive_depth_strong = 0
        self.is_saturated = (
            self.saturation_score >= self.saturation_threshold
            or self.should_exit_on_depth_strong_streak()
        )
        if weighted == 0.0:
            self.consecutive_zero_scores += 1
        else:
            self.consecutive_zero_scores = 0
        if signal:
            self.signals_fired.append(signal)
        self.last_score = weighted
        if turn is not None:
            self.updated_turn = turn

        if signal in DENIAL_SIGNALS:
            self.consecutive_denials += 1
            if self.consecutive_denials >= 1:
                self.closed_on_denials = True
        else:
            self.consecutive_denials = 0

    def to_dict(self) -> dict:
        return {
            "topic_name": self.topic_name,
            "level": self.level,
            "saturation_threshold": self.saturation_threshold,
            "saturation_score": round(self.saturation_score, 2),
            "follow_up_turns": self.follow_up_turns,
            "base_turn_credit": self.base_turn_credit,
            "signals_fired": self.signals_fired,
            "is_saturated": self.is_saturated,
            "updated_turn": self.updated_turn,
            "last_score": self.last_score,
            "clarification_request_count": self.clarification_request_count,
            "consecutive_zero_scores": self.consecutive_zero_scores,
            "consecutive_denials": self.consecutive_denials,
            "closed_on_denials": self.closed_on_denials,
            "consecutive_depth_strong": self.consecutive_depth_strong,
            "probe_rotation_index": self.probe_rotation_index,
            "opened_at_turn": self.opened_at_turn,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "TopicState":
        obj = cls(
            topic_name=str(d.get("topic_name", "")),
            updated_turn=int(d.get("updated_turn", 0) or 0),
            level=int(d.get("level", 2) or 2),
        )
        obj.saturation_score = float(d.get("saturation_score", 0.0) or 0.0)
        obj.follow_up_turns = int(d.get("follow_up_turns", 0) or 0)
        obj.is_saturated = bool(d.get("is_saturated", False))
        obj.signals_fired = list(d.get("signals_fired", []) or [])
        obj.opened_at_turn = int(d.get("opened_at_turn", 0) or 0)
        obj.last_score = float(d["last_score"]) if d.get("last_score") is not None else None
        obj.clarification_request_count = int(d.get("clarification_request_count", 0) or 0)
        obj.consecutive_zero_scores = int(d.get("consecutive_zero_scores", 0) or 0)
        obj.consecutive_denials = int(d.get("consecutive_denials", 0) or 0)
        obj.closed_on_denials = bool(d.get("closed_on_denials", False))
        obj.consecutive_depth_strong = int(d.get("consecutive_depth_strong", 0) or 0)
        obj.probe_rotation_index = int(d.get("probe_rotation_index", 0) or 0)
        if "saturation_threshold" in d:
            obj.saturation_threshold = float(d["saturation_threshold"])
        if "base_turn_credit" in d:
            obj.base_turn_credit = float(d["base_turn_credit"])
        return obj


def _weighted_score(quality: dict) -> float:
    return (
        quality.get("clarity", 0.0) * 0.20
        + quality.get("depth", 0.0) * 0.35
        + quality.get("specificity", 0.0) * 0.20
        + quality.get("grounding", 0.0) * 0.25
    )


def _score_to_contribution(weighted: float) -> float:
    return min(3.5, max(0.0, (weighted - 2.0) / 8.0 * 3.5))


class EvaluationPayload(BaseModel):
    app_id: str
    turn: int
    answer: str
    question: str
    transcript_lines: List[str] = Field(default_factory=list)
    score_history: List[Any] = Field(default_factory=list)
    turns_since_decay: int = 999
    response_latency_sec: Optional[float] = None
    question_asked_at_wall_ms: int = 0
    signal_toggles: Dict[str, Any] = Field(default_factory=dict)
    org_id: str = ""
    llm_model: str
    active_topic: Optional[str] = None
    active_topic_state: Optional[Dict[str, Any]] = None
    job_title: str = "the role"
    remaining_seconds: float = 999.0
    candidate_name: str = "?"
    level: int = 2
    time_limit_mins: int = 20
    topic_score_history: List[float] = Field(default_factory=list)
    topic_depth_history: List[float] = Field(default_factory=list)
    ai_question_this_turn: str = ""
    topic_tag: str = "RESUME_TOPIC"
    topic_probe_focus: str = ""
    topic_why_relevant: str = ""
    question_type: str = "mechanism"
    asked_so_far: List[str] = Field(default_factory=list)
    resume_context: str = ""
    model_config = {"extra": "allow"}


async def run_eval_and_build_directive(payload: dict, client: AsyncOpenAI) -> dict:
    p = EvaluationPayload(**payload)

    current_topic_state: Optional[TopicState] = None
    if p.active_topic and p.active_topic_state:
        current_topic_state = TopicState.from_dict(p.active_topic_state)
    elif p.active_topic:
        current_topic_state = TopicState(p.active_topic, updated_turn=p.turn, level=p.level)

    _captured_usage: list[dict] = []

    async def _score_and_capture(**kwargs):
        result = await evaluate_answer(**kwargs)
        usage = result.pop("_llm_usage", None)
        usages = usage if isinstance(usage, list) else ([usage] if usage else [])
        for u in usages:
            if u.get("inputTokens") or u.get("outputTokens"):
                _captured_usage.append(u)
        return result

    _follow_up_count = (current_topic_state.follow_up_turns + 1) if current_topic_state else 0

    try:
        raw = await _score_and_capture(
            candidate_answer=p.answer,
            last_question=p.question,
            topic_follow_up_count=_follow_up_count,
            transcript_lines=p.transcript_lines,
            client=client,
            org_id=p.org_id,
            llm_model=p.llm_model,
            active_topic=p.active_topic or "",
            level=p.level,
            topic_probe_focus=p.topic_probe_focus,
            job_title=p.job_title,
            question_type=p.question_type,
            signals_already_fired=current_topic_state.signals_fired if current_topic_state else [],
            asked_so_far=p.asked_so_far or [],
            resume_context=p.resume_context,
        )
    except Exception as ex:
        logger.error(
            "[EVAL_FALLBACK] turn=%d | scoring failed: %s: %s | answer=%r",
            p.turn, type(ex).__name__, ex, (p.answer or "")[:300],
        )
        try:
            await log_llm_error(
                app_id=p.app_id,
                org_name=p.org_id,
                candidate_name=None,
                provider="openai",
                error=str(ex),
                reason="Turn scoring LLM call failed/timed out — recovery fallback applied",
                context={"turn": p.turn},
            )
        except Exception:
            pass
        raw: Dict[str, Any] = {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0, "overall": 1.3,
            "action": "PROBE", "signal": "probe", "signals": ["probe"],
            "signal_reason": f"eval recovery — {type(ex).__name__}",
            "points": ["Stay on topic; one concrete follow-up on what they said"],
            "avoid": [],
            "reason": "eval recovery",
            "is_eval_recovery": True,
        }

    quality = {k: raw.get(k, 0.0) for k in ("clarity", "depth", "specificity", "grounding")}
    _weighted = _weighted_score(quality)
    action = str(raw.get("action", "PROBE")).upper()
    if action not in ("PROBE", "MOVE_ON", "REPHRASE", "REDIRECT", "ACCEPT_REPHRASE", "CAP_SCORES"):
        action = "PROBE"
    forced_action = bool(raw.get("forced_action"))
    _forced_response = forced_action and action in ("MOVE_ON", "REPHRASE", "REDIRECT", "ACCEPT_REPHRASE")

    signal: str | None = str(raw["signal"]) if raw.get("signal") is not None else None
    signals = [str(s) for s in (raw.get("signals") or ([signal] if signal else []))]
    signal_reason = str(raw["signal_reason"]) if raw.get("signal_reason") is not None else None
    points = [str(x) for x in (raw.get("points") or []) if str(x).strip()]
    avoid = [str(x) for x in (raw.get("avoid") or []) if str(x).strip()]

    depth_signal = "DEEP" if _weighted >= 7.0 else "SPECIFIC" if _weighted >= 5.0 else "SURFACE"
    logger.info(
        "[EVAL] turn=%d action=%s signal=%s points=%d weighted=%.2f",
        p.turn, action, signal, len(points), _weighted,
    )

    if current_topic_state and signal == "clarification_request":
        current_topic_state.clarification_request_count += 1
    elif current_topic_state:
        current_topic_state.clarification_request_count = 0

    if current_topic_state and signal != "clarification_request":
        current_topic_state.add_contribution(_weighted, signal, turn=p.turn)

    is_saturated = current_topic_state.is_saturated if current_topic_state else False
    _weak_exit = bool(current_topic_state and current_topic_state.is_weak_candidate_exit())
    _dry_topic = bool(current_topic_state and current_topic_state.is_dry_topic())
    _denial_exit = bool(current_topic_state and current_topic_state.should_exit_on_denials())

    sat_score = current_topic_state.saturation_score if current_topic_state else 0.0
    sat_threshold = current_topic_state.saturation_threshold if current_topic_state else 0.0

    if _denial_exit:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=pure_denial turn=%d", p.turn)
    elif _forced_response and current_topic_state:
        if action == "REPHRASE" and current_topic_state.clarification_request_count >= 3:
            action = "MOVE_ON"
            logger.info("[DECISION] MOVE_ON reason=clarification_escalation turn=%d", p.turn)
        else:
            logger.info("[DECISION] %s (forced route) turn=%d", action, p.turn)
    elif _forced_response:
        logger.info("[DECISION] %s (forced route) turn=%d", action, p.turn)
    elif _dry_topic:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=dry_topic turn=%d", p.turn)
    elif _weak_exit:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=weak_exit turn=%d", p.turn)
    elif is_saturated:
        action = "MOVE_ON"
        logger.info("[DECISION] MOVE_ON reason=saturated turn=%d", p.turn)
    else:
        action = "PROBE"

    quality_record = {
        "turn": p.turn,
        "question": p.question,
        "answer": p.answer,
        "clarity": quality["clarity"],
        "depth": quality["depth"],
        "specificity": quality["specificity"],
        "grounding": quality["grounding"],
        "overall": _weighted,
        "signal": signal,
        "signals": signals,
        "signal_reason": signal_reason,
        "points": points,
        "avoid": avoid,
        "topic": p.active_topic or "general",
        "topic_saturation_score": sat_score,
        "topic_saturation_threshold": sat_threshold,
        "response_latency_sec": p.response_latency_sec,
        "question_asked_at_wall_ms": p.question_asked_at_wall_ms,
        "action": action,
        "level": p.level,
        "is_saturated": is_saturated,
        "weak_exit": _weak_exit,
        "dry_topic": _dry_topic,
        "topic_follow_ups": _follow_up_count,
        "is_eval_recovery": bool(raw.get("is_eval_recovery")),
    }

    return {
        "action": action,
        "signal": signal,
        "signals": signals,
        "signal_reason": signal_reason,
        "points": points,
        "avoid": avoid,
        "quality_record": quality_record,
        "depth_signal": depth_signal,
        "saturation": {
            "score": sat_score,
            "threshold": sat_threshold,
            "follow_up_turns": current_topic_state.follow_up_turns if current_topic_state else 0,
            "is_saturated": is_saturated,
            "weak_exit": _weak_exit,
            "dry_topic": _dry_topic,
            "topic_state_dict": current_topic_state.to_dict() if current_topic_state else None,
        },
        "eval_llm_usages": list(_captured_usage),
        "turn": p.turn,
        "app_id": p.app_id,
        "matched_resume_project": raw.get("matched_resume_project"),
    }
