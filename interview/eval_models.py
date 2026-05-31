"""
eval_models.py — Pydantic contracts and Redis key factory for Live-N pipeline.

Live-N: worker evaluates THIS turn (score + route in one shot),
writes ONE result to routing_result:{app_id}:{turn},
agent waits for that key and applies everything before LLM fires.
"""
from __future__ import annotations

class EvalKeys:
    """Central Redis key factory — agent and worker always agree on key names."""

    @staticmethod
    def routing_result(app_id: str, turn: int) -> str:
        """Key where worker writes the full eval result for THIS turn."""
        return f"interview:{app_id}:routing:{turn}"

    @staticmethod
    def routing_ready(app_id: str, turn: int) -> str:
        """Pubsub channel worker publishes to when routing result is ready."""
        return f"interview:{app_id}:routing_ready:{turn}"

    @staticmethod
    def eval_payload(app_id: str, turn: int) -> str:
        """Key where agent stores payload for worker to fetch."""
        return f"interview:{app_id}:eval_payload:{turn}"

    @staticmethod
    def eval_queue() -> str:
        return "interview:eval_queue"

    TTL_ROUTING = 1800  # 30 min TTL on result — long enough for any slow turn
    TTL_ROUTING_SHORT = 120  # fallback TTL when pipeline failed (PROBE fallback)
