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

logger = logging.getLogger("eval_worker")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
EVAL_QUEUE_KEY = "interview:eval_queue"
RESULT_TTL_SECONDS = 1800

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
    turn = payload.get("turn", 0)
    logger.info("─" * 60)
    logger.info("✅ TURN %d STARTED | app_id=%s", turn, app_id)
    logger.info("─" * 60)

    try:
        result = await run_eval_and_build_directive(payload, client)
    except Exception as e:
        logger.error("[WORKER] Eval pipeline error app_id=%s turn=%d: %s", app_id, turn, e, exc_info=True)
        return

    result_key = f"interview:{app_id}:eval_result"
    result_turn_key = f"interview:{app_id}:eval_result:{turn}"
    try:
        encoded = json.dumps(result).encode()
        # Primary write: turn-specific key — agent reads this via SYNC_GATE pub/sub.
        await r.setex(result_turn_key, RESULT_TTL_SECONDS, encoded)
        # Fallback write: generic key read only when SYNC_GATE times out (Redis slow/down).
        # Short TTL (30s) because the next turn overwrites it anyway — 1800s was wasted memory.
        await r.setex(result_key, 30, encoded)

        # FIX 3: Publish on the ready channel so the agent wakes instantly.
        # BEFORE: agent polled Redis every 150ms — wasted 0-150ms after result was ready.
        # AFTER:  agent subscribes to this channel and is notified in <5ms.
        # Channel name matches what agent_runtime.py subscribes to.
        # We publish AFTER setex so the agent always finds the key when it wakes.
        _ready_channel = f"interview:{app_id}:eval_ready:{turn}"
        await r.publish(_ready_channel, b"1")
        _action = result.get("action", "?")
        _qr = result.get("quality_record") or {}
        _clarity = round(float(_qr.get("clarity", 0) or 0), 1)
        _depth = round(float(_qr.get("depth", 0) or 0), 1)
        _fluency = round(float(_qr.get("fluency", 0) or 0), 1)
        _confidence = round(float(_qr.get("confidence", 0) or 0), 1)
        _overall = round(float(_qr.get("overall", 0) or 0), 2)
        _next_topic = result.get("new_active_topic") or "?"
        _signals = _qr.get("signals") or []
        _signal_str = f" | signals=[{', '.join(_signals)}]" if _signals else ""
        _ts = result.get("new_active_topic_state") or {}
        _sat_score = _ts.get("saturation_score", 0)
        _sat_thresh = _ts.get("saturation_threshold", 0)
        _sat_remaining = max(0, _sat_thresh - _sat_score)
        _sat_pct = round(100 * min(1.0, _sat_score / _sat_thresh), 0) if _sat_thresh else 0
        _is_saturated = _ts.get("is_saturated", False)
        _importance = _ts.get("importance", "?")
        _follow_up_turns = _ts.get("follow_up_turns", 0)
        _opened_turn = _ts.get("opened_at_turn", 0)
        _probe_idx = _ts.get("probe_rotation_index", 0)
        _risk_int_delta = result.get("risk_integrity_delta", 0)
        _risk_depth_delta = result.get("risk_depth_delta", 0)
        logger.info(
            "[WORKER] ✓ turn=%d action=%s | scores: clarity=%.1f depth=%.1f fluency=%.1f confidence=%.1f | overall=%.2f | "
            "risk: integrity%+d depth%+d",
            turn, _action,
            _clarity, _depth, _fluency, _confidence, _overall,
            _risk_int_delta, _risk_depth_delta,
        )
        logger.info(
            "[TOPIC_STATE] turn=%d | topic='%s' | importance=%s | saturated=%s | "
            "progress: %.1f/%.1f (%.0f%% done, %.1f remaining) | "
            "follow_ups=%d (opened_turn=%d) | probe_mode=%d%s",
            turn, str(_next_topic)[:40], _importance, _is_saturated,
            _sat_score, _sat_thresh, _sat_pct, _sat_remaining,
            _follow_up_turns, _opened_turn, _probe_idx, _signal_str,
        )
        logger.info("─" * 60)
        logger.info("✅ TURN %d DONE | action=%s", turn, _action)
        logger.info("─" * 60)

    except Exception as e:
        logger.error("[WORKER] Failed to store result key=%s: %s", result_key, e)
    finally:
        # Allow any late same-turn retry update to enqueue again if needed.
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
