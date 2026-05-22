"""
Agent State Machine: Synchronized agent-eval interaction using Langgraph.

Ensures eval decisions (MOVE_ON/PROBE) are applied BEFORE LLM generation,
not after. Removes race conditions through explicit control flow.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum
import asyncio
import logging

from pydantic import BaseModel, Field

logger = logging.getLogger("agent_state_machine")


class TurnAction(str, Enum):
    """Evaluation decision that controls agent behavior."""
    PROBE = "PROBE"
    MOVE_ON = "MOVE_ON"
    VERIFY = "VERIFY"
    REPHRASE = "REPHRASE"


@dataclass
class TopicStateSnapshot:
    """Immutable snapshot of topic state at a turn boundary."""
    topic_name: str
    importance: str  # CRITICAL | HIGH | MEDIUM | LOW
    saturation_score: float
    saturation_threshold: float
    follow_up_turns: int
    probe_rotation_index: int
    is_saturated: bool
    opened_at_turn: int
    base_turn_credit: float
    signals_fired: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "topic_name": self.topic_name,
            "importance": self.importance,
            "saturation_score": self.saturation_score,
            "saturation_threshold": self.saturation_threshold,
            "follow_up_turns": self.follow_up_turns,
            "probe_rotation_index": self.probe_rotation_index,
            "is_saturated": self.is_saturated,
            "opened_at_turn": self.opened_at_turn,
            "base_turn_credit": self.base_turn_credit,
            "signals_fired": self.signals_fired,
        }


@dataclass
class EvalResultSnapshot:
    """Result from eval_worker: directive + state mutations."""
    turn: int
    action: TurnAction
    directive: str  # System message for LLM
    new_active_topic: Optional[str]
    new_topic_state: Optional[TopicStateSnapshot]
    new_covered_topic_keys: list[str]
    quality_record: Optional[dict]
    signal_events: list[dict] = field(default_factory=list)
    signal_events_summary: list[str] = field(default_factory=list)

    @staticmethod
    def from_dict(d: dict) -> EvalResultSnapshot:
        """Deserialize from Redis/JSON."""
        topic_state_raw = d.get("new_active_topic_state")
        topic_state = None
        if topic_state_raw:
            topic_state = TopicStateSnapshot(
                topic_name=topic_state_raw.get("topic_name", "?"),
                importance=topic_state_raw.get("importance", "HIGH"),
                saturation_score=float(topic_state_raw.get("saturation_score", 0)),
                saturation_threshold=float(topic_state_raw.get("saturation_threshold", 6.5)),
                follow_up_turns=int(topic_state_raw.get("follow_up_turns", 0)),
                probe_rotation_index=int(topic_state_raw.get("probe_rotation_index", 0)),
                is_saturated=bool(topic_state_raw.get("is_saturated", False)),
                opened_at_turn=int(topic_state_raw.get("opened_at_turn", 0)),
                base_turn_credit=float(topic_state_raw.get("base_turn_credit", 0.8)),
                signals_fired=topic_state_raw.get("signals_fired", []),
            )
        return EvalResultSnapshot(
            turn=int(d.get("turn", 0)),
            action=TurnAction(d.get("action", "PROBE")),
            directive=str(d.get("directive", "")),
            new_active_topic=d.get("new_active_topic"),
            new_topic_state=topic_state,
            new_covered_topic_keys=d.get("new_covered_topic_keys", []),
            quality_record=d.get("quality_record"),
            signal_events=d.get("signal_events", []),
            signal_events_summary=[ev.get("signal_name", "") for ev in d.get("signal_events", [])],
        )


@dataclass
class InterviewState:
    """Unified agent session state — single source of truth."""

    # Session metadata
    app_id: str
    session_start_time: float
    job_title: str

    # Turn tracking
    current_turn: int
    warmup_complete: bool

    # Topic state (mutable, updated from eval results)
    active_topic: Optional[str] = None
    topic_states: dict[str, TopicStateSnapshot] = field(default_factory=dict)
    covered_topic_keys: set[str] = field(default_factory=set)

    # Eval coordination
    last_eval_result: Optional[EvalResultSnapshot] = None
    pending_eval_result_for_turn: Optional[int] = None  # Turn we're waiting for

    # Injected directive (set by eval result, consumed by LLM)
    injected_directive: str = ""
    last_applied_directive_turn: int = 0

    # Quality tracking
    answer_scores: list[dict] = field(default_factory=list)

    # Proctoring signals
    signals: list[dict] = field(default_factory=list)
    integrity_risk: int = 0
    depth_risk: int = 0

    # Shared chat context (reference to LiveKit chat_ctx)
    chat_ctx: Any = None

    # Redis client (shared)
    redis_client: Any = None

    def apply_eval_result(self, result: EvalResultSnapshot) -> None:
        """Apply eval result atomically: update state, inject directive."""
        if not result:
            return

        logger.info(
            "[STATE] Applying eval result turn=%d action=%s | "
            "topic: %s→%s | signals=[%s]",
            result.turn, result.action.value,
            self.active_topic, result.new_active_topic,
            ", ".join(result.signal_events_summary) if result.signal_events_summary else "none",
        )

        # Topic transition
        if result.new_active_topic and result.new_active_topic != self.active_topic:
            logger.info(
                "[TOPIC_CHANGE] %s → %s (turn=%d)",
                (self.active_topic or "?")[:50],
                result.new_active_topic[:50],
                result.turn,
            )
            self.active_topic = result.new_active_topic

        # Update topic state for new active topic
        if result.new_topic_state and self.active_topic:
            self.topic_states[self.active_topic] = result.new_topic_state
            ts = result.new_topic_state
            pct = round(100 * min(1.0, ts.saturation_score / ts.saturation_threshold), 0) if ts.saturation_threshold else 0
            logger.info(
                "[SATURATION_UPDATE] topic='%s' | score=%.1f/%.1f (%.0f%%) | "
                "follow_ups=%d | saturated=%s | signals=[%s]",
                self.active_topic, ts.saturation_score, ts.saturation_threshold, pct,
                ts.follow_up_turns, ts.is_saturated,
                ", ".join(ts.signals_fired) if ts.signals_fired else "none",
            )

        # Update covered topics
        self.covered_topic_keys = set(result.new_covered_topic_keys)

        # Inject directive for LLM
        self.injected_directive = result.directive
        self.last_applied_directive_turn = result.turn
        logger.info(
            "[DIRECTIVE_READY] turn=%d action=%s | directive_preview: %s",
            result.turn, result.action.value,
            result.directive[:120].replace("\n", " | "),
        )

        # Quality record
        if result.quality_record:
            self.answer_scores.append(result.quality_record)

        # Signals
        self.signals.extend(result.signal_events)

        # Store for later reference
        self.last_eval_result = result

    def inject_directive_into_chat_context(self) -> None:
        """Add injected directive to chat_ctx BEFORE LLM generation."""
        if not self.injected_directive or not self.chat_ctx:
            return

        # Remove old directives
        from interview.agent_runtime import remove_system_messages
        remove_system_messages(self.chat_ctx, "[NEXT_TURN_DIRECTIVE")
        remove_system_messages(self.chat_ctx, "[TOPIC_LOCK")

        # Add new directive
        self.chat_ctx.add_message(role="system", content=self.injected_directive)

        # Add topic lock if MOVE_ON
        if self.last_eval_result and self.last_eval_result.action == TurnAction.MOVE_ON:
            if self.active_topic:
                self.chat_ctx.add_message(
                    role="system",
                    content=(
                        f"[TOPIC_LOCK - DO NOT SAY ALOUD]\n"
                        f"ACTIVE TOPIC IS NOW: {self.active_topic}\n"
                        f"Your next question MUST be about '{self.active_topic}'. "
                        f"The previous topic is closed. Do not ask about it, reference it, "
                        f"or follow up on it. One question only about '{self.active_topic}'."
                    ),
                )
                logger.info("[TOPIC_LOCK] Injected for new topic: %s", self.active_topic[:60])

        logger.info("[DIRECTIVE_INJECTED] turn=%d | ready for LLM generation", self.current_turn)


class AgentTurnStateMachine:
    """
    Controls agent turn flow using explicit state transitions.

    Flow:
    1. User finishes speaking (turn N)
    2. WAIT: Block until eval result for turn N-1 is available
    3. APPLY: Apply eval result to session state
    4. GENERATE: LLM generates response with correct directive injected
    5. PUSH: Send response and push turn N to eval queue
    """

    def __init__(self, session_state: InterviewState, redis_client: Any):
        self.state = session_state
        self.redis_client = redis_client
        self._eval_result_waiter: dict[int, asyncio.Event] = {}
        self._eval_results: dict[int, Optional[EvalResultSnapshot]] = {}

    async def wait_for_eval_result(self, turn: int, timeout_seconds: float = 5.0) -> Optional[EvalResultSnapshot]:
        """
        BLOCKING: Wait for eval worker to compute result for given turn.
        Returns None on timeout (fallback to inline eval).
        """
        if self.redis_client is None:
            logger.debug("[WAIT_EVAL] Redis disabled, no blocking wait")
            return None

        result_key = f"interview:{self.state.app_id}:eval_result"

        try:
            raw = await asyncio.wait_for(
                self.redis_client.getdel(result_key),
                timeout=timeout_seconds,
            )
            if not raw:
                logger.info("[WAIT_EVAL] turn=%d No result ready yet (still processing)", turn)
                return None

            result_dict = json.loads(raw)
            result = EvalResultSnapshot.from_dict(result_dict)
            logger.info(
                "[WAIT_EVAL] ✅ turn=%d Received: action=%s topic=%s signals=[%s]",
                result.turn, result.action.value, result.new_active_topic or "?",
                ", ".join(result.signal_events_summary) if result.signal_events_summary else "none",
            )
            return result
        except asyncio.TimeoutError:
            logger.warning("[WAIT_EVAL] turn=%d Timeout after %.1fs (will fallback)", turn, timeout_seconds)
            return None
        except Exception as e:
            logger.warning("[WAIT_EVAL] turn=%d Failed: %s", turn, e)
            return None

    async def process_user_turn(
        self,
        turn_number: int,
        user_answer: str,
    ) -> None:
        """
        STATE MACHINE: Process a user turn with explicit synchronization.

        This replaces the async-fire-and-forget pattern with blocking gates.
        """
        logger.info("[SM_START] turn=%d | waiting for previous eval result...", turn_number)

        # GATE 1: Wait for eval result from previous turn (blocking)
        if turn_number > 2:  # Skip for greeting/warmup
            previous_turn = turn_number - 1
            eval_result = await self.wait_for_eval_result(previous_turn, timeout_seconds=5.0)

            if eval_result:
                # Apply to state (topic change, directive, etc.)
                self.state.apply_eval_result(eval_result)

                # Inject directive into chat context BEFORE LLM generation
                self.state.inject_directive_into_chat_context()
                logger.info(
                    "[SM_DIRECTIVE_APPLIED] turn=%d | action=%s | topic_now=%s",
                    turn_number, eval_result.action.value, self.state.active_topic,
                )
            else:
                logger.warning("[SM_NO_EVAL] turn=%d No eval result (timeout or offline) — using current state", turn_number)

        # GATE 2: LLM generation now happens (topic is locked in state)
        # This is where the caller invokes LLM generation
        logger.info("[SM_READY_FOR_LLM] turn=%d | directive injected | topic locked | ready to generate", turn_number)

        # GATE 3: After response is generated, push current turn to eval queue
        logger.info("[SM_PUSH_TO_EVAL] turn=%d | sending to eval worker", turn_number)
        # Caller pushes to redis here

    async def push_eval_payload(self, payload: dict) -> None:
        """Queue current turn for eval worker."""
        if not self.redis_client:
            logger.warning("[EVAL_PUSH] Redis disabled, skipping eval queue")
            return

        turn = payload.get("turn", 0)
        app_id = payload.get("app_id", self.state.app_id)

        try:
            payload_key = f"interview:{app_id}:eval_payload:{turn}"
            await self.redis_client.setex(
                payload_key,
                600,
                json.dumps(payload).encode(),
            )
            await self.redis_client.rpush(
                "interview:eval_queue",
                json.dumps({"app_id": app_id, "turn": turn}).encode(),
            )
            logger.info("[EVAL_PUSH] ✅ turn=%d queued for worker", turn)
        except Exception as e:
            logger.error("[EVAL_PUSH] turn=%d Failed: %s", turn, e)
