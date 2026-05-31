"""
Redis eval worker — runs as a separate process.

Usage:
    python -m interview.eval_worker

Listens on `interview:eval_queue` (BLPOP).
Runs `run_eval_and_build_directive` from eval_pipeline.
Stores result at `interview:{app_id}:eval_result` (SETEX 1800s).

The voice agent reads the result at the START of the next user turn,
applies all mutations atomically, then injects the directive.
This shifts eval latency off the critical path: latency drops from 3-5s to ~10ms.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys

from dotenv import load_dotenv
load_dotenv()  # Must be before any os.environ.get() — loads .env so REDIS_URL/OPENAI_API_KEY are available

from openai import AsyncOpenAI

from interview.eval_pipeline import run_eval_and_build_directive
from interview.eval_models import EvalKeys

logger = logging.getLogger("eval_worker")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
EVAL_QUEUE_KEY = "interview:eval_queue"

_shutdown = asyncio.Event()


def _handle_signal(sig, frame):
    logger.info("[WORKER] Received signal %s — shutting down", sig)
    _shutdown.set()


async def _process_one(payload_bytes: bytes, client: AsyncOpenAI, r) -> None:
    try:
        queued = json.loads(payload_bytes)
    except Exception as e:
        logger.error("[WORKER] Failed to decode payload: %s", e)
        return

    import time as _time
    payload = queued
    if isinstance(queued, dict) and "answer" not in queued:
        queued_app_id = str(queued.get("app_id") or "unknown")
        queued_turn = int(queued.get("turn", 0) or 0)
        enqueued_at = float(queued.get("enqueued_at") or 0)
        # Drop pointers older than the payload TTL — payload is certainly gone.
        if enqueued_at and (_time.time() - enqueued_at) > 600:
            logger.debug(
                "[WORKER] Dropping stale queue entry app_id=%s turn=%d (enqueued %.0fs ago)",
                queued_app_id, queued_turn, _time.time() - enqueued_at,
            )
            return
        payload_key = f"interview:{queued_app_id}:eval_payload:{queued_turn}"
        try:
            raw_payload = await r.getdel(payload_key)
        except Exception as e:
            logger.warning(
                "[WORKER] Failed to read pending payload app_id=%s turn=%d: %s",
                queued_app_id, queued_turn, e,
            )
            return
        if raw_payload is None:
            logger.debug(
                "[WORKER] Payload already consumed or expired app_id=%s turn=%d (skipping)",
                queued_app_id, queued_turn,
            )
            return
        try:
            payload = json.loads(raw_payload)
        except Exception as e:
            logger.error(
                "[WORKER] Failed to decode pending payload app_id=%s turn=%d: %s",
                queued_app_id,
                queued_turn,
                e,
            )
            return

    app_id = payload.get("app_id", "unknown")
    turn   = payload.get("turn", 0)
    logger.info("─" * 60)
    logger.info("✅ TURN %d STARTED | app_id=%s", turn, app_id)
    logger.info("─" * 60)

    # ── Live-N: full eval (score + route) in one shot ────────────────────────
    # Scoring and routing are inseparable — quality scores drive saturation
    # which drives MOVE_ON/PROBE. We run the full pipeline and write ONE result.
    # Agent waits for THIS turn's result key (not N-1). That's the only change.
    #
    # Timeline:
    #   T+0ms    payload received
    #   T+700ms  evaluate_answer() + signals + saturation → result ready
    #   T+700ms  write routing_result:{turn} + publish → agent unblocks
    #   T+700ms  agent injects directive → LLM fires → Ishita speaks
    #   (total silence: ~700ms — imperceptible in voice interview)

    t0 = _time.monotonic()

    try:
        result = await run_eval_and_build_directive(payload, client)
    except Exception as e:
        logger.error("[WORKER] eval pipeline error turn=%d: %s", turn, e, exc_info=True)
        result = None

    routing_key   = EvalKeys.routing_result(app_id, turn)
    routing_ready = EvalKeys.routing_ready(app_id, turn)

    if result is not None:
        try:
            encoded = json.dumps(result).encode()
            # Live-N key — agent waits on THIS key for current turn
            await r.setex(routing_key, EvalKeys.TTL_ROUTING, encoded)
            await r.publish(routing_ready, b"1")
            t1 = _time.monotonic()
            _action    = result.get("action", "?")
            _qr        = result.get("quality_record") or {}
            _overall   = round(float(_qr.get("overall", 0) or 0), 2)
            _sat_state = result.get("new_active_topic_state") or {}
            _sat_score = _sat_state.get("saturation_score", 0)
            _sat_thres = _sat_state.get("saturation_threshold", 0)
            logger.info(
                "[WORKER] ✅ turn=%d action=%s overall=%.2f sat=%.1f/%.1f topic=%r→%r (%.0fms)",
                turn, _action, _overall, _sat_score, _sat_thres,
                payload.get("active_topic", "?"), result.get("new_active_topic", "?"),
                (t1 - t0) * 1000,
            )
        except Exception as e:
            logger.error("[WORKER] Failed to write result turn=%d: %s", turn, e)
    else:
        # Pipeline failed — write a safe PROBE fallback so agent never hangs
        try:
            _fallback = json.dumps({
                "app_id": app_id, "turn": turn,
                "action": "PROBE",
                "directive": (
                    "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                    "DECISION: PROBE (OWNERSHIP)\n"
                    "BAND: " + str(payload.get("band", "mid")).upper() + "\n"
                    "ANGLE: Ask one specific question about what they personally built.\n"
                    "ONE question only. Sound natural."
                ),
                "signal_events": [],
                "new_active_topic": payload.get("active_topic"),
                "new_covered_topic_keys": list(payload.get("covered_topic_keys") or []),
                "new_active_topic_state": payload.get("active_topic_state"),
                "new_current_interview_mode": payload.get("current_interview_mode", "normal"),
                "new_trust_state": dict(payload.get("trust_state") or {}),
                "risk_integrity_delta": 0, "risk_depth_delta": 3,
                "discussed_log_entry": None, "quality_record": None,
                "freeze_followup_increment": False,
            }).encode()
            await r.setex(routing_key, EvalKeys.TTL_ROUTING, _fallback)
            await r.publish(routing_ready, b"1")
            logger.warning("[WORKER] Wrote PROBE fallback for turn=%d", turn)
        except Exception as _fe:
            logger.error("[WORKER] Fallback write failed turn=%d: %s", turn, _fe)

    logger.info("─" * 60)
    logger.info("✅ TURN %d DONE", turn)
    logger.info("─" * 60)

    try:
        await r.delete(f"interview:{app_id}:eval_enqueued:{turn}")
    except Exception:
        pass


async def _run_worker() -> None:
    try:
        import redis.asyncio as aioredis  # type: ignore[import-untyped]
    except ImportError:
        logger.error("[WORKER] redis package not installed. Run: pip install redis")
        sys.exit(1)

    openai_api_key = os.environ.get("OPENAI_API_KEY", "")
    if not openai_api_key:
        logger.error("[WORKER] OPENAI_API_KEY not set")
        sys.exit(1)

    client = AsyncOpenAI(api_key=openai_api_key)

    from redis.asyncio.retry import Retry  # type: ignore[import-untyped]
    from redis.backoff import ExponentialBackoff  # type: ignore[import-untyped]
    from redis.exceptions import ConnectionError as RedisConnectionError, TimeoutError as RedisTimeoutError  # type: ignore[import-untyped]
    import socket as _socket

    def _make_redis():
        return aioredis.from_url(
            REDIS_URL,
            decode_responses=False,
            # Retry on both connection drops and timeouts with exponential backoff
            retry=Retry(ExponentialBackoff(cap=10, base=1), retries=6),
            retry_on_error=[RedisConnectionError, RedisTimeoutError],
            retry_on_timeout=True,
            # TCP keepalive — OS sends probes if connection is idle, detects dead connections
            # without waiting for a command to fail. Works on both Windows and Linux.
            socket_keepalive=True,
            socket_keepalive_options={
                _socket.TCP_KEEPIDLE: 30,   # start probes after 30s idle
                _socket.TCP_KEEPINTVL: 5,   # probe every 5s
                _socket.TCP_KEEPCNT: 3,     # give up after 3 failed probes (45s total)
            } if hasattr(_socket, "TCP_KEEPIDLE") else {},  # TCP_KEEPIDLE not on Windows — skip safely
            socket_connect_timeout=5,
            socket_timeout=10,
            # Ping Redis every 30s when idle — detects dropped connections before BLPOP hangs
            health_check_interval=30,
        )

    r = _make_redis()
    logger.info("[WORKER] Started — redis=%s queue=%s", REDIS_URL, EVAL_QUEUE_KEY)

    _consecutive_errors = 0
    while not _shutdown.is_set():
        try:
            result = await r.blpop([EVAL_QUEUE_KEY], timeout=1)  # type: ignore[misc]
            if result is None:
                _consecutive_errors = 0  # successful poll — connection alive
                continue
            _consecutive_errors = 0
            _key, payload_bytes = result
            await _process_one(payload_bytes, client, r)
        except asyncio.CancelledError:
            break
        except (RedisConnectionError, RedisTimeoutError) as e:
            # Connection-level errors — Retry class handles retries automatically,
            # but if we get here it means retries were exhausted. Rebuild connection.
            _consecutive_errors += 1
            logger.error("[WORKER] Redis connection error (attempt %d): %s", _consecutive_errors, e)
            try:
                await r.aclose()
            except Exception:
                pass
            backoff = min(2 ** _consecutive_errors, 30)  # cap at 30s
            logger.warning("[WORKER] Reconnecting in %ds...", backoff)
            await asyncio.sleep(backoff)
            r = _make_redis()
            logger.info("[WORKER] Reconnected to Redis")
        except Exception as e:
            _consecutive_errors += 1
            logger.error("[WORKER] Unexpected error (attempt %d): %s", _consecutive_errors, e, exc_info=True)
            await asyncio.sleep(0.5)

    await r.aclose()
    await client.close()
    logger.info("[WORKER] Stopped")


def main() -> None:
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)
    asyncio.run(_run_worker())


if __name__ == "__main__":
    main()
