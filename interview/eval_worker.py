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
RESULT_TTL_SECONDS = 300

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

    payload = queued
    if isinstance(queued, dict) and "answer" not in queued:
        queued_app_id = str(queued.get("app_id") or "unknown")
        queued_turn = int(queued.get("turn", 0) or 0)
        payload_key = f"interview:{queued_app_id}:eval_payload:{queued_turn}"
        try:
            raw_payload = await r.getdel(payload_key)
        except Exception as e:
            logger.warning(
                "[WORKER] Failed to read pending payload app_id=%s turn=%d: %s",
                queued_app_id,
                queued_turn,
                e,
            )
            return
        if raw_payload is None:
            logger.warning(
                "[WORKER] Pending payload missing app_id=%s turn=%d (skipping)",
                queued_app_id,
                queued_turn,
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
    logger.info("[WORKER] Processing app_id=%s turn=%d", app_id, turn)

    try:
        result = await run_eval_and_build_directive(payload, client)
    except Exception as e:
        logger.error("[WORKER] Eval pipeline error app_id=%s turn=%d: %s", app_id, turn, e, exc_info=True)
        return

    result_key = f"interview:{app_id}:eval_result"
    try:
        await r.setex(result_key, RESULT_TTL_SECONDS, json.dumps(result).encode())
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
    r = aioredis.from_url(REDIS_URL, decode_responses=False)

    logger.info("[WORKER] Started — redis=%s queue=%s", REDIS_URL, EVAL_QUEUE_KEY)

    while not _shutdown.is_set():
        try:
            # BLPOP blocks for up to 1s then returns None — no outer timeout needed
            result = await r.blpop([EVAL_QUEUE_KEY], timeout=1)
            if result is None:
                continue
            _key, payload_bytes = result
            await _process_one(payload_bytes, client, r)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("[WORKER] Unexpected error in loop: %s", e, exc_info=True)
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
