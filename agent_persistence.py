import asyncio
import asyncpg
import json
import os
import time
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlunparse, urlparse
from agent_profile_context import build_interview_turns
from agent_providers import build_google_analysis_client
from behavioral_analysis import synthesize_behavioral_report
from agent_runtime_support import (

    DATABASE_URL,
    LLM_MODEL,
    FIXED_INTERVIEW_DURATION_MINUTES,
    _DB_POOL,
    _DB_POOL_INIT_TASK,
    _PENDING_MANUAL_BILLING,
    logger,
)
from agent_utils import _coerce_jsonish, truncate_to_tokens
from livekit.agents.metrics import AgentSessionUsage
from openai import AsyncOpenAI
def normalize_postgres_dsn(conn_str: str) -> str:
    if conn_str.startswith("postgres://"):
        conn_str = conn_str.replace("postgres://", "postgresql://", 1)
    parsed = urlparse(conn_str)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    # psycopg2 doesn't support several Prisma/Neon query flags.
    for key in ("pgbouncer", "connection_limit", "pool_timeout", "schema"):
        query.pop(key, None)
    return urlunparse(parsed._replace(query=urlencode(query)))
async def _create_db_pool() -> asyncpg.Pool:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    conn_str = normalize_postgres_dsn(DATABASE_URL)
    return await asyncpg.create_pool(
        conn_str,
        ssl=False,
        statement_cache_size=0,
        min_size=2,
        max_size=5,
    )
async def get_db_pool() -> asyncpg.Pool:
    global _DB_POOL, _DB_POOL_INIT_TASK
    if _DB_POOL is not None and not _DB_POOL._closed:
        return _DB_POOL
    # Pool absent or closed (for example stale from a prewarm subprocess) - create fresh.
    _DB_POOL = None
    _DB_POOL_INIT_TASK = asyncio.create_task(_create_db_pool())
    try:
        _DB_POOL = await _DB_POOL_INIT_TASK
        return _DB_POOL
    except Exception:
        _DB_POOL_INIT_TASK = None
        raise
_USAGE_BUCKET_FIELDS: dict[str, tuple[tuple[str, str], ...]] = {
    "llm": (
        ("input_tokens", "inputTokens"),
        ("input_cached_tokens", "inputCachedTokens"),
        ("input_audio_tokens", "inputAudioTokens"),
        ("input_cached_audio_tokens", "inputCachedAudioTokens"),
        ("input_text_tokens", "inputTextTokens"),
        ("input_cached_text_tokens", "inputCachedTextTokens"),
        ("input_image_tokens", "inputImageTokens"),
        ("input_cached_image_tokens", "inputCachedImageTokens"),
        ("output_tokens", "outputTokens"),
        ("output_audio_tokens", "outputAudioTokens"),
        ("output_text_tokens", "outputTextTokens"),
        ("session_duration", "sessionDuration"),
    ),
    "tts": (
        ("input_tokens", "inputTokens"),
        ("output_tokens", "outputTokens"),
        ("characters_count", "charactersCount"),
        ("audio_duration", "audioDuration"),
    ),
    "stt": (
        ("input_tokens", "inputTokens"),
        ("output_tokens", "outputTokens"),
        ("audio_duration", "audioDuration"),
    ),
    "interruption": (("total_requests", "totalRequests"),),
}
_USAGE_TYPE_TO_BUCKET = {
    "llm_usage": "llm",
    "tts_usage": "tts",
    "stt_usage": "stt",
    "interruption_usage": "interruption",
}
def _empty_usage_bucket(kind: str) -> dict[str, Any]:
    return {
        "sessions": 0,
        "totals": {public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]},
        "byModel": {},
    }
def summarize_session_usage(session_usage: AgentSessionUsage | None) -> dict[str, Any]:
    summary: dict[str, Any] = {kind: _empty_usage_bucket(kind) for kind in _USAGE_BUCKET_FIELDS}
    if not session_usage:
        return summary
    seen_kinds: set[str] = set()
    for item in getattr(session_usage, "model_usage", []) or []:
        kind = _USAGE_TYPE_TO_BUCKET.get(getattr(item, "type", ""))
        if not kind:
            continue
        seen_kinds.add(kind)
        provider = str(getattr(item, "provider", "") or "unknown")
        model = str(getattr(item, "model", "") or "unknown")
        model_key = f"{provider}:{model}"
        bucket = summary[kind]
        bucket["sessions"] = 1
        model_bucket = bucket["byModel"].setdefault(
            model_key,
            {
                "provider": provider,
                "model": model,
                "sessions": 0,
                **{public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]},
            },
        )
        model_bucket["sessions"] = 1
        for source_name, public_name in _USAGE_BUCKET_FIELDS[kind]:
            value = getattr(item, source_name, 0) or 0
            bucket["totals"][public_name] += value
            model_bucket[public_name] += value
    for kind in seen_kinds:
        summary[kind]["sessions"] = 1
    return summary
_OPENAI_MODEL_RATES: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15, "cached_input": 0.075, "output": 0.6},
    "gpt-4.1-mini": {"input": 0.4, "cached_input": 0.1, "output": 1.6},
    "gpt-4o": {"input": 2.5, "cached_input": 1.25, "output": 10.0},
    "gpt-4.1": {"input": 2.0, "cached_input": 0.5, "output": 8.0},
}
# TTS pricing controls:
# - Sarvam: INR rates from provider docs, converted to USD using BILLING_INR_PER_USD.
# - Cartesia: default estimate in USD per 1M characters.
_BILLING_INR_PER_USD = float(os.environ.get("BILLING_INR_PER_USD", "83.0"))
_SARVAM_TTS_INR_PER_10K_CHARS: dict[str, float] = {
    "bulbul:v3": 30.0,
    "bulbul:v2": 15.0,
}
_CARTESIA_TTS_DEFAULT_USD_PER_MILLION_CHARS = float(
    os.environ.get("CARTESIA_TTS_USD_PER_MILLION_CHARS", "30.0")
)
_SARVAM_STT_INR_PER_HOUR: dict[str, float] = {
    "saaras:v3": 30.0,
}
_DEEPGRAM_STT_USD_PER_MIN: dict[str, float] = {
    "nova-3": 0.0077,
    "nova-3-general": 0.0077,
}
def _empty_billing_feature() -> dict[str, Any]:
    return {
        "runs": 0,
        "inputTokens": 0,
        "cachedInputTokens": 0,
        "outputTokens": 0,
        "sessionDuration": 0,
        "costUsd": 0.0,
        "ttsRuns": 0,
        "ttsCharacters": 0,
        "ttsCostUsd": 0.0,
        "sttRuns": 0,
        "sttAudioSeconds": 0.0,
        "sttCostUsd": 0.0,
        "byModel": {},
        "ttsByModel": {},
        "sttByModel": {},
    }
def _coerce_billing_metrics(value: Any) -> dict[str, Any]:
    features = [
        "interview",
        "resumeExtraction",
        "jdExtraction",
        "chatbot",
        "resumeReport",
        "interviewReport",
        "general",
    ]
    out = {feature: _empty_billing_feature() for feature in features}
    incoming = _coerce_jsonish(value)
    for feature in features:
        src = _coerce_jsonish(incoming.get(feature))
        if not src:
            continue
        dst = out[feature]
        dst["runs"] = int(src.get("runs", 0))
        dst["inputTokens"] = int(src.get("inputTokens", 0))
        dst["cachedInputTokens"] = int(src.get("cachedInputTokens", 0))
        dst["outputTokens"] = int(src.get("outputTokens", 0))
        dst["sessionDuration"] = float(src.get("sessionDuration", 0))
        dst["costUsd"] = float(src.get("costUsd", 0))
        dst["ttsRuns"] = int(src.get("ttsRuns", 0))
        dst["ttsCharacters"] = int(src.get("ttsCharacters", 0))
        dst["ttsCostUsd"] = float(src.get("ttsCostUsd", 0))
        dst["sttRuns"] = int(src.get("sttRuns", 0))
        dst["sttAudioSeconds"] = float(src.get("sttAudioSeconds", 0))
        dst["sttCostUsd"] = float(src.get("sttCostUsd", 0))
        dst["byModel"] = _coerce_jsonish(src.get("byModel"))
        dst["ttsByModel"] = _coerce_jsonish(src.get("ttsByModel"))
        dst["sttByModel"] = _coerce_jsonish(src.get("sttByModel"))
    return out
def _estimate_openai_cost(model_name: str, input_tokens: int, cached_tokens: int, output_tokens: int) -> float:
    rates = _OPENAI_MODEL_RATES.get(model_name.strip().lower())
    if not rates:
        return 0.0
    input_tokens = max(0, int(input_tokens or 0))
    output_tokens = max(0, int(output_tokens or 0))
    cached_tokens = max(0, min(int(cached_tokens or 0), input_tokens))
    uncached_tokens = max(0, input_tokens - cached_tokens)
    return (
        (uncached_tokens / 1_000_000.0) * rates["input"]
        + (cached_tokens / 1_000_000.0) * rates["cached_input"]
        + (output_tokens / 1_000_000.0) * rates["output"]
    )
def _normalize_tts_model_name(model_name: str) -> str:
    return str(model_name or "").strip().lower()
def _estimate_tts_cost_usd(provider_name: str, model_name: str, characters: int) -> float:
    chars = max(0, int(characters or 0))
    if chars <= 0:
        return 0.0
    provider = str(provider_name or "").strip().upper()
    normalized_model = _normalize_tts_model_name(model_name)
    if provider == "SARVAM":
        inr_per_10k = _SARVAM_TTS_INR_PER_10K_CHARS.get(normalized_model)
        if inr_per_10k is None:
            inr_per_10k = _SARVAM_TTS_INR_PER_10K_CHARS["bulbul:v3"]
        inr_cost = (chars / 10_000.0) * inr_per_10k
        return inr_cost / max(_BILLING_INR_PER_USD, 1e-6)
    if provider == "CARTESIA":
        return (chars / 1_000_000.0) * _CARTESIA_TTS_DEFAULT_USD_PER_MILLION_CHARS
    return 0.0
def _normalize_stt_model_name(model_name: str) -> str:
    return str(model_name or "").strip().lower()
def _estimate_stt_cost_usd(provider_name: str, model_name: str, audio_seconds: float) -> float:
    seconds = max(0.0, float(audio_seconds or 0.0))
    if seconds <= 0:
        return 0.0
    provider = str(provider_name or "").strip().upper()
    normalized_model = _normalize_stt_model_name(model_name)
    if provider == "SARVAM":
        inr_per_hour = _SARVAM_STT_INR_PER_HOUR.get(normalized_model)
        if inr_per_hour is None:
            inr_per_hour = _SARVAM_STT_INR_PER_HOUR["saaras:v3"]
        inr_cost = (seconds / 3600.0) * inr_per_hour
        return inr_cost / max(_BILLING_INR_PER_USD, 1e-6)
    if provider == "DEEPGRAM":
        usd_per_min = _DEEPGRAM_STT_USD_PER_MIN.get(normalized_model)
        if usd_per_min is None:
            usd_per_min = _DEEPGRAM_STT_USD_PER_MIN["nova-3"]
        return (seconds / 60.0) * usd_per_min
    return 0.0
def merge_interview_billing(
    existing: dict[str, Any],
    session_summary: dict[str, Any],
    tts_config: Optional[dict[str, Any]] = None,
    stt_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    merged = dict(existing)
    billing = _coerce_billing_metrics(merged.get("billing"))
    llm_summary = _coerce_jsonish(session_summary.get("llm"))
    llm_totals = _coerce_jsonish(llm_summary.get("totals"))
    llm_by_model = _coerce_jsonish(llm_summary.get("byModel"))
    tts_summary = _coerce_jsonish(session_summary.get("tts"))
    tts_totals = _coerce_jsonish(tts_summary.get("totals"))
    tts_by_model = _coerce_jsonish(tts_summary.get("byModel"))
    stt_summary = _coerce_jsonish(session_summary.get("stt"))
    stt_totals = _coerce_jsonish(stt_summary.get("totals"))
    stt_by_model = _coerce_jsonish(stt_summary.get("byModel"))
    llm_has_usage = bool(llm_by_model) or bool(llm_totals)
    tts_total_chars = int(tts_totals.get("charactersCount", 0) or tts_totals.get("inputTokens", 0) or 0)
    tts_has_usage = bool(tts_by_model) or tts_total_chars > 0
    stt_total_audio_seconds = float(stt_totals.get("audioDuration", 0) or 0.0)
    stt_has_usage = bool(stt_by_model) or stt_total_audio_seconds > 0
    if not llm_has_usage and not tts_has_usage and not stt_has_usage:
        merged["billing"] = billing
        return merged
    interview_bucket = billing["interview"]
    if llm_has_usage:
        interview_bucket["runs"] = int(interview_bucket.get("runs", 0)) + 1
        interview_bucket["inputTokens"] = int(interview_bucket.get("inputTokens", 0)) + int(
            llm_totals.get("inputTokens", 0) or 0
        )
        interview_bucket["cachedInputTokens"] = int(interview_bucket.get("cachedInputTokens", 0)) + int(
            llm_totals.get("inputCachedTokens", 0) or 0
        )
        interview_bucket["outputTokens"] = int(interview_bucket.get("outputTokens", 0)) + int(
            llm_totals.get("outputTokens", 0) or 0
        )
        interview_bucket["sessionDuration"] = float(interview_bucket.get("sessionDuration", 0)) + float(
            llm_totals.get("sessionDuration", 0) or 0
        )
        by_model = _coerce_jsonish(interview_bucket.get("byModel"))
        session_cost = 0.0
        for model_key, raw in llm_by_model.items():
            model_row = _coerce_jsonish(raw)
            model_name = str(model_row.get("model", "") or "unknown").strip()
            input_tokens = int(model_row.get("inputTokens", 0) or 0)
            cached_tokens = int(model_row.get("inputCachedTokens", 0) or 0)
            output_tokens = int(model_row.get("outputTokens", 0) or 0)
            session_duration = float(model_row.get("sessionDuration", 0) or 0)
            model_cost = _estimate_openai_cost(model_name, input_tokens, cached_tokens, output_tokens)
            session_cost += model_cost
            current = _coerce_jsonish(by_model.get(model_key))
            current["runs"] = int(current.get("runs", 0)) + 1
            current["inputTokens"] = int(current.get("inputTokens", 0)) + input_tokens
            current["cachedInputTokens"] = int(current.get("cachedInputTokens", 0)) + cached_tokens
            current["outputTokens"] = int(current.get("outputTokens", 0)) + output_tokens
            current["sessionDuration"] = float(current.get("sessionDuration", 0)) + session_duration
            current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
            by_model[model_key] = current
        interview_bucket["byModel"] = by_model
        interview_bucket["costUsd"] = float(interview_bucket.get("costUsd", 0.0)) + session_cost
    session_tts_chars = 0
    session_tts_cost = 0.0
    tts_by_model_bucket = _coerce_jsonish(interview_bucket.get("ttsByModel"))
    default_tts_provider = str((tts_config or {}).get("provider", "") or "").strip().upper()
    default_tts_model = str((tts_config or {}).get("model", "") or "").strip()
    for _, raw in tts_by_model.items():
        model_row = _coerce_jsonish(raw)
        provider = str(model_row.get("provider", "") or default_tts_provider).strip().upper()
        model_name = str(model_row.get("model", "") or default_tts_model).strip()
        if provider not in {"SARVAM", "CARTESIA"} and default_tts_provider in {"SARVAM", "CARTESIA"}:
            provider = default_tts_provider
        if (not model_name or model_name == "unknown") and default_tts_model:
            model_name = default_tts_model
        chars = int(model_row.get("charactersCount", 0) or model_row.get("inputTokens", 0) or 0)
        if chars <= 0:
            continue
        session_tts_chars += chars
        model_cost = _estimate_tts_cost_usd(provider, model_name, chars)
        session_tts_cost += model_cost
        model_key = f"{provider.lower() or 'unknown'}:{_normalize_tts_model_name(model_name) or 'unknown'}"
        current = _coerce_jsonish(tts_by_model_bucket.get(model_key))
        current["provider"] = provider or "UNKNOWN"
        current["model"] = model_name or "unknown"
        current["runs"] = int(current.get("runs", 0)) + 1
        current["characters"] = int(current.get("characters", 0)) + chars
        current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
        tts_by_model_bucket[model_key] = current
    if session_tts_chars == 0:
        fallback_chars = int(tts_totals.get("charactersCount", 0) or tts_totals.get("inputTokens", 0) or 0)
        if fallback_chars > 0:
            session_tts_chars = fallback_chars
            provider = default_tts_provider or "UNKNOWN"
            model_name = default_tts_model or "unknown"
            model_cost = _estimate_tts_cost_usd(provider, model_name, fallback_chars)
            session_tts_cost += model_cost
            model_key = f"{provider.lower() or 'unknown'}:{_normalize_tts_model_name(model_name) or 'unknown'}"
            current = _coerce_jsonish(tts_by_model_bucket.get(model_key))
            current["provider"] = provider
            current["model"] = model_name
            current["runs"] = int(current.get("runs", 0)) + 1
            current["characters"] = int(current.get("characters", 0)) + fallback_chars
            current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
            tts_by_model_bucket[model_key] = current
    if session_tts_chars > 0:
        interview_bucket["ttsRuns"] = int(interview_bucket.get("ttsRuns", 0)) + 1
        interview_bucket["ttsCharacters"] = int(interview_bucket.get("ttsCharacters", 0)) + session_tts_chars
        interview_bucket["ttsCostUsd"] = float(interview_bucket.get("ttsCostUsd", 0.0)) + session_tts_cost
        interview_bucket["ttsByModel"] = tts_by_model_bucket
    session_stt_seconds = 0.0
    session_stt_cost = 0.0
    stt_by_model_bucket = _coerce_jsonish(interview_bucket.get("sttByModel"))
    default_stt_provider = str((stt_config or {}).get("provider", "") or "").strip().upper()
    default_stt_model = str((stt_config or {}).get("model", "") or "").strip()
    for _, raw in stt_by_model.items():
        model_row = _coerce_jsonish(raw)
        provider = str(model_row.get("provider", "") or default_stt_provider).strip().upper()
        model_name = str(model_row.get("model", "") or default_stt_model).strip()
        if provider not in {"SARVAM", "DEEPGRAM"} and default_stt_provider in {"SARVAM", "DEEPGRAM"}:
            provider = default_stt_provider
        if (not model_name or model_name == "unknown") and default_stt_model:
            model_name = default_stt_model
        seconds = float(model_row.get("audioDuration", 0) or 0.0)
        if seconds <= 0:
            continue
        session_stt_seconds += seconds
        model_cost = _estimate_stt_cost_usd(provider, model_name, seconds)
        session_stt_cost += model_cost
        model_key = f"{provider.lower() or 'unknown'}:{_normalize_stt_model_name(model_name) or 'unknown'}"
        current = _coerce_jsonish(stt_by_model_bucket.get(model_key))
        current["provider"] = provider or "UNKNOWN"
        current["model"] = model_name or "unknown"
        current["runs"] = int(current.get("runs", 0)) + 1
        current["audioSeconds"] = float(current.get("audioSeconds", 0.0)) + seconds
        current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
        stt_by_model_bucket[model_key] = current
    if session_stt_seconds == 0 and stt_total_audio_seconds > 0:
        session_stt_seconds = stt_total_audio_seconds
        provider = default_stt_provider or "UNKNOWN"
        model_name = default_stt_model or "unknown"
        model_cost = _estimate_stt_cost_usd(provider, model_name, stt_total_audio_seconds)
        session_stt_cost += model_cost
        model_key = f"{provider.lower() or 'unknown'}:{_normalize_stt_model_name(model_name) or 'unknown'}"
        current = _coerce_jsonish(stt_by_model_bucket.get(model_key))
        current["provider"] = provider
        current["model"] = model_name
        current["runs"] = int(current.get("runs", 0)) + 1
        current["audioSeconds"] = float(current.get("audioSeconds", 0.0)) + stt_total_audio_seconds
        current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
        stt_by_model_bucket[model_key] = current
    if session_stt_seconds > 0:
        interview_bucket["sttRuns"] = int(interview_bucket.get("sttRuns", 0)) + 1
        interview_bucket["sttAudioSeconds"] = float(interview_bucket.get("sttAudioSeconds", 0.0)) + session_stt_seconds
        interview_bucket["sttCostUsd"] = float(interview_bucket.get("sttCostUsd", 0.0)) + session_stt_cost
        interview_bucket["sttByModel"] = stt_by_model_bucket
    billing["interview"] = interview_bucket
    merged["billing"] = billing
    return merged
async def persist_org_manual_billing_usage(
    org_id: Optional[str], feature: str, usage: dict[str, Any]
) -> None:
    """Accumulate manual billing usage in memory. Flushed to DB once at session end."""
    if not org_id or not DATABASE_URL or not usage:
        return
    _PENDING_MANUAL_BILLING.setdefault(org_id, []).append((feature, usage))
async def flush_pending_manual_billing(org_id: Optional[str]) -> None:
    """Write all accumulated manual billing usage to DB in a single transaction."""
    if not org_id or not DATABASE_URL:
        return
    pending = _PENDING_MANUAL_BILLING.pop(org_id, None)
    if not pending:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    SELECT COALESCE("usageMetrics", '{}'::jsonb) AS "usageMetrics"
                    FROM "Organization"
                    WHERE id = $1
                    FOR UPDATE
                    """,
                    org_id,
                )
                if not row:
                    return
                merged = _coerce_jsonish(row["usageMetrics"])
                for feature, usage in pending:
                    merged = merge_manual_billing_usage(merged, feature, usage)
                await conn.execute(
                    """
                    UPDATE "Organization"
                    SET "usageMetrics" = $1::jsonb,
                        "updatedAt" = NOW()
                    WHERE id = $2
                    """,
                    json.dumps(merged),
                    org_id,
                )
        logger.info(f"[USAGE] Flushed {len(pending)} manual billing entries for {org_id}")
    except Exception as e:
        logger.error(f"[USAGE] Failed to flush manual billing for {org_id}: {e}")
async def persist_org_usage_metrics(
    org_id: Optional[str],
    session_usage: AgentSessionUsage | None,
    tts_provider: Optional[str] = None,
    tts_model: Optional[str] = None,
    stt_provider: Optional[str] = None,
    stt_model: Optional[str] = None,
):
    if not org_id or not DATABASE_URL or session_usage is None:
        return
    session_summary = summarize_session_usage(session_usage)
    if not any(bucket.get("sessions") for bucket in session_summary.values()):
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    SELECT COALESCE("usageMetrics", '{}'::jsonb) AS "usageMetrics"
                    FROM "Organization"
                    WHERE id = $1
                    FOR UPDATE
                    """,
                    org_id,
                )
                if not row:
                    logger.warning(f"[USAGE] No organization found for usage metrics save: {org_id}")
                    return
                existing_metrics = _coerce_jsonish(row["usageMetrics"])
                merged_metrics = dict(existing_metrics)
                merged_livekit = _coerce_jsonish(merged_metrics.get("livekit"))
                for kind, kind_summary in session_summary.items():
                    if not isinstance(kind_summary, dict):
                        continue
                    existing_bucket = _coerce_jsonish(merged_livekit.get(kind))
                    if not existing_bucket:
                        existing_bucket = _empty_usage_bucket(kind)
                    existing_bucket["sessions"] = int(existing_bucket.get("sessions", 0)) + int(
                        kind_summary.get("sessions", 0)
                    )
                    existing_totals = existing_bucket.setdefault(
                        "totals", {public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]}
                    )
                    source_totals = kind_summary.get("totals", {})
                    for _, public_name in _USAGE_BUCKET_FIELDS[kind]:
                        existing_totals[public_name] = existing_totals.get(public_name, 0) + source_totals.get(
                            public_name, 0
                        )
                    existing_by_model = existing_bucket.setdefault("byModel", {})
                    for model_key, model_summary in kind_summary.get("byModel", {}).items():
                        current_model = _coerce_jsonish(existing_by_model.get(model_key))
                        if not current_model:
                            current_model = {
                                "provider": model_summary.get("provider", "unknown"),
                                "model": model_summary.get("model", "unknown"),
                                "sessions": 0,
                                **{public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]},
                            }
                        current_model["sessions"] = int(current_model.get("sessions", 0)) + int(
                            model_summary.get("sessions", 0)
                        )
                        for _, public_name in _USAGE_BUCKET_FIELDS[kind]:
                            current_model[public_name] = current_model.get(public_name, 0) + model_summary.get(
                                public_name, 0
                            )
                        existing_by_model[model_key] = current_model
                    existing_bucket["updatedAt"] = time.time()
                    merged_livekit[kind] = existing_bucket
                merged_metrics["livekit"] = merged_livekit
                merged_metrics["updatedAt"] = time.time()
                merged_metrics = merge_interview_billing(
                    merged_metrics,
                    session_summary,
                    tts_config={"provider": tts_provider or "", "model": tts_model or ""},
                    stt_config={"provider": stt_provider or "", "model": stt_model or ""},
                )
                await conn.execute(
                    """
                    UPDATE "Organization"
                    SET "usageMetrics" = $1::jsonb,
                        "updatedAt" = NOW()
                    WHERE id = $2
                    """,
                    json.dumps(merged_metrics),
                    org_id,
                )
            logger.info(
                f"[USAGE] Saved LiveKit usage for org {org_id} "
                f"(llm={session_summary['llm']['totals'].get('inputTokens', 0) + session_summary['llm']['totals'].get('outputTokens', 0)} tokens, "
                f"stt={session_summary['stt']['totals'].get('audioDuration', 0)}s audio, "
                f"tts={session_summary['tts']['totals'].get('audioDuration', 0)}s audio; "
                f"billingInterviewCost~${merge_interview_billing({}, session_summary, {'provider': tts_provider or '', 'model': tts_model or ''}, {'provider': stt_provider or '', 'model': stt_model or ''}).get('billing', {}).get('interview', {}).get('costUsd', 0):.4f})"
            )
    except Exception as e:
        logger.error(f"[USAGE] Failed to save org usage metrics for {org_id}: {e}")
async def persist_interview_billing_snapshot(
    app_id: str,
    session_usage: AgentSessionUsage | None,
    *,
    org_id: Optional[str] = None,
    candidate_name: Optional[str] = None,
    job_title: Optional[str] = None,
    duration_seconds: Optional[float] = None,
    tts_provider: Optional[str] = None,
    tts_model: Optional[str] = None,
    stt_provider: Optional[str] = None,
    stt_model: Optional[str] = None,
) -> None:
    """Persist a per-interview billing snapshot on Interview for the usage table."""
    if not app_id or not DATABASE_URL:
        return

    session_summary = summarize_session_usage(session_usage)
    has_session_usage = any(bucket.get("sessions") for bucket in session_summary.values())
    has_manual_usage = bool(org_id and _PENDING_MANUAL_BILLING.get(org_id))
    if not has_session_usage and not has_manual_usage and not duration_seconds:
        return

    snapshot_billing = merge_interview_billing(
        {},
        session_summary,
        tts_config={"provider": tts_provider or "", "model": tts_model or ""},
        stt_config={"provider": stt_provider or "", "model": stt_model or ""},
    )
    interview_bucket = _coerce_jsonish(_coerce_jsonish(snapshot_billing.get("billing")).get("interview"))

    # Include any in-process manual billing that was attributed to this interview
    # before the org-wide flush happens.
    if org_id:
        pending_manual = _PENDING_MANUAL_BILLING.get(org_id, [])
        for feature, usage in pending_manual:
            if feature != "interview":
                continue
            model_name = str(usage.get("model", "unknown") or "unknown")
            input_tokens = int(usage.get("inputTokens", 0) or 0)
            cached_tokens = int(usage.get("cachedInputTokens", 0) or 0)
            output_tokens = int(usage.get("outputTokens", 0) or 0)
            model_cost = _estimate_openai_cost(model_name, input_tokens, cached_tokens, output_tokens)
            model_key = f"openai:{model_name}"
            interview_bucket["runs"] = int(interview_bucket.get("runs", 0)) + 1
            interview_bucket["inputTokens"] = int(interview_bucket.get("inputTokens", 0)) + input_tokens
            interview_bucket["cachedInputTokens"] = int(interview_bucket.get("cachedInputTokens", 0)) + cached_tokens
            interview_bucket["outputTokens"] = int(interview_bucket.get("outputTokens", 0)) + output_tokens
            interview_bucket["costUsd"] = float(interview_bucket.get("costUsd", 0.0)) + model_cost
            by_model = _coerce_jsonish(interview_bucket.get("byModel"))
            current = _coerce_jsonish(by_model.get(model_key))
            current["runs"] = int(current.get("runs", 0)) + 1
            current["inputTokens"] = int(current.get("inputTokens", 0)) + input_tokens
            current["cachedInputTokens"] = int(current.get("cachedInputTokens", 0)) + cached_tokens
            current["outputTokens"] = int(current.get("outputTokens", 0)) + output_tokens
            current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
            by_model[model_key] = current
            interview_bucket["byModel"] = by_model

    total_cost = float(interview_bucket.get("costUsd", 0.0)) + float(interview_bucket.get("ttsCostUsd", 0.0)) + float(interview_bucket.get("sttCostUsd", 0.0))
    snapshot = {
        "candidateName": candidate_name or "",
        "jobTitle": job_title or "",
        "interviewName": f"{candidate_name or 'Candidate'} - {job_title or 'Interview'}",
        "durationSec": int(duration_seconds or 0),
        "llmCostUsd": float(interview_bucket.get("costUsd", 0.0)),
        "ttsCostUsd": float(interview_bucket.get("ttsCostUsd", 0.0)),
        "sttCostUsd": float(interview_bucket.get("sttCostUsd", 0.0)),
        "totalCostUsd": total_cost,
        "inputTokens": int(interview_bucket.get("inputTokens", 0)),
        "outputTokens": int(interview_bucket.get("outputTokens", 0)),
        "cachedInputTokens": int(interview_bucket.get("cachedInputTokens", 0)),
        "sessionDuration": float(interview_bucket.get("sessionDuration", 0)),
        "ttsCharacters": int(interview_bucket.get("ttsCharacters", 0)),
        "sttAudioSeconds": float(interview_bucket.get("sttAudioSeconds", 0)),
        "llmByModel": interview_bucket.get("byModel", {}),
        "ttsByModel": interview_bucket.get("ttsByModel", {}),
        "sttByModel": interview_bucket.get("sttByModel", {}),
        "updatedAt": time.time(),
    }

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT i.id
                FROM "Interview" i
                JOIN "Application" a ON a.id = i."applicationId"
                WHERE a.id = $1
                LIMIT 1
                """,
                app_id,
            )
            if not row:
                return
            await conn.execute(
                """
                UPDATE "Interview"
                SET "billingSnapshot" = $1::jsonb,
                    "updatedAt" = NOW()
                WHERE "applicationId" = $2
                """,
                json.dumps(snapshot),
                app_id,
            )
        logger.info(f"[USAGE] Saved interview billing snapshot for {app_id}")
    except Exception as e:
        logger.error(f"[USAGE] Failed to save interview billing snapshot for {app_id}: {e}")
async def get_interview_context(app_id: str):
    """Fetch Candidate and Job Description context from PostgreSQL via asyncpg."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    query = """
    SELECT a."fullName", d.title, d.role AS "role", d.description, d.skills, d."orgId" AS "orgId",
           d.location AS "driveLocation", d."interviewLanguage", d."interviewQuestions",
           COALESCE(d."ttsProvider", o."ttsProvider") AS "ttsProvider",
           COALESCE(d."cartesiaVoiceId", o."cartesiaVoiceId") AS "cartesiaVoiceId", o."cartesiaModel",
           o."sarvamModel", COALESCE(d."sarvamVoice", o."sarvamVoice") AS "sarvamVoice",
           o."googleModel", o."googleVoiceName",
           COALESCE(d."aiName", 'Ishitha') AS "aiName", o.name AS "orgName", o.location AS "orgLocation",
           o."sttProvider", o."deepgramModel", o."sarvamSttModel",
           o."llmProvider", o."llmModel", o."llmTemperature", o."proctoringSignals"
    FROM "Application" a
    JOIN "Drive" d ON a."driveId" = d.id
    LEFT JOIN "Organization" o ON d."orgId" = o.id
    WHERE a.id = $1
    LIMIT 1
    """
    last_error: Exception | None = None
    for attempt in range(1, 6):
        try:
            pool = await get_db_pool()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(query, app_id)
            if not row:
                raise RuntimeError(f"No interview context found in DB for application {app_id}")
            questions_raw = row["interviewQuestions"]
            questions = []
            if questions_raw:
                try:
                    questions = json.loads(questions_raw) if isinstance(questions_raw, str) else questions_raw
                except Exception:
                    questions = []
            return {
                "fullName": row["fullName"],
                "jobTitle": row["role"] or row["title"],
                "driveTitle": row["title"],
                "jd": f"Description: {row['description']}\nSkills: {row['skills']}",
                "orgId": row["orgId"],
                "orgName": row["orgName"],
                "orgLocation": row["orgLocation"],
                "driveLocation": row["driveLocation"],
                "language": row["interviewLanguage"],
                "timeLimit": FIXED_INTERVIEW_DURATION_MINUTES,
                "questions": questions if isinstance(questions, list) else [],
                "ttsProvider": row["ttsProvider"],
                "cartesiaVoiceId": row["cartesiaVoiceId"],
                "cartesiaModel": row["cartesiaModel"],
                "sarvamModel": row["sarvamModel"],
                "sarvamVoice": row["sarvamVoice"],
                "googleModel": row["googleModel"],
                "googleVoiceName": row["googleVoiceName"],
                "aiName": row["aiName"],
                "sttProvider": row["sttProvider"],
                "deepgramModel": row["deepgramModel"],
                "sarvamSttModel": row["sarvamSttModel"],
                "llmProvider": row["llmProvider"],
                "llmModel": row["llmModel"],
                "llmTemperature": row["llmTemperature"],
                "proctoringSignals": row["proctoringSignals"],
            }
        except Exception as e:
            last_error = e
            logger.error(f"Database error during context fetch (attempt {attempt}/5): {e}")
            if "executor shutdown" in str(e).lower():
                global _DB_POOL, _DB_POOL_INIT_TASK
                _DB_POOL = None
                _DB_POOL_INIT_TASK = None
            if attempt < 5:
                await asyncio.sleep(0.4 * attempt)
    raise RuntimeError(f"Failed to fetch interview context from DB: {last_error}")
async def persist_transcript(
    app_id: str,
    transcript_lines: list,
    start_time: Optional[float],
    proctoring_data: Optional[dict] = None,
    final_status: str = "COMPLETED",
    recruiter_summary: Optional[dict] = None,
):
    """Save transcript, duration, and proctoring report to Interview table via asyncpg."""
    if not transcript_lines and final_status != "NO_SHOW":
        logger.info("[TRANSCRIPT] No lines captured - skipping save to avoid overwriting existing data")
        return
    if not DATABASE_URL:
        logger.warning("[TRANSCRIPT] No DATABASE_URL - skipping save")
        return
    try:
        full_text = "\n".join(transcript_lines) if transcript_lines else ""
        duration = int(time.time() - start_time) if start_time else 0
        interview_turns = build_interview_turns(transcript_lines)
        proctor_report = None
        if proctoring_data:
            proctor_report = {
                "role_category": proctoring_data.get("role_category"),
                "candidate_band": proctoring_data.get("candidate_band"),
                "total_turns": proctoring_data.get("total_turns", 0),
                "final_suspicion_score": proctoring_data.get("suspicion_score", 0),
                "final_mode": proctoring_data.get("current_mode", "normal"),
                "exit_reason": proctoring_data.get("exit_reason", "normal_completion"),
                "events": proctoring_data.get("events", []),
                "contradictions": proctoring_data.get("contradictions", []),
                "claim_index": proctoring_data.get("claim_index", {}),
                "contradiction_state": proctoring_data.get("contradiction_state", {}),
                "stage_history": proctoring_data.get("stage_history", []),
                "stage_transition_events": proctoring_data.get("stage_transition_events", []),
                "total_stages_covered": proctoring_data.get("total_stages_covered", 0),
                "trust": recruiter_summary if recruiter_summary else {},
            }
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE "Interview"
                SET
                    "interviewTranscript" = $1,
                    "interviewDuration"   = $2,
                    status                = $3,
                    "proctoringReport"    = $4,
                    "interviewTurns"      = $5,
                    "completedAt"         = NOW(),
                    "updatedAt"           = NOW()
                WHERE "applicationId" = $6
                """,
                full_text,
                duration,
                final_status,
                json.dumps(proctor_report) if proctor_report else None,
                json.dumps(interview_turns),
                app_id,
            )
            logger.info(
                f"[TRANSCRIPT] Saved {len(transcript_lines)} lines, {duration}s duration, "
                f"{len(interview_turns)} turn(s), status={final_status} for app {app_id}"
            )
    except Exception as e:
        logger.error(f"[TRANSCRIPT] DB save failed: {e}")
async def mark_interview_started(app_id: str):
    """Mark the application and interview as IN_PROGRESS via asyncpg."""
    if not DATABASE_URL:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "Interview" SET status = $1, "startedAt" = NOW() WHERE "applicationId" = $2',
                "IN_PROGRESS",
                app_id,
            )
            await conn.execute(
                'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
                "IN_PROGRESS",
                app_id,
            )
            logger.info(f"[INTERVIEW] App {app_id} marked as IN_PROGRESS.")
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update application status to started: {e}")
async def persist_answer_scores(app_id: str, answer_scores: list[dict]) -> None:
    """Save structured answer quality scores to Interview.answerScores JSONB."""
    if not app_id or not DATABASE_URL or not answer_scores:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            total_answers = len(answer_scores)
            avg_clarity = sum(s.get("clarity", 5) for s in answer_scores) / max(total_answers, 1)
            avg_depth = sum(s.get("depth", 5) for s in answer_scores) / max(total_answers, 1)
            avg_specificity = sum(s.get("specificity", 5) for s in answer_scores) / max(total_answers, 1)
            avg_grounding = sum(s.get("grounding", 5) for s in answer_scores) / max(total_answers, 1)
            avg_overall = sum(s.get("overall", 5) for s in answer_scores) / max(total_answers, 1)
            all_signals = {}
            all_concerns = {}
            for score in answer_scores:
                for sig in score.get("signals", []):
                    all_signals[sig] = all_signals.get(sig, 0) + 1
                for concern in score.get("concerns", []):
                    all_concerns[concern] = all_concerns.get(concern, 0) + 1
            answer_scores_payload = {
                "totalAnswers": total_answers,
                "averages": {
                    "clarity": round(avg_clarity, 2),
                    "depth": round(avg_depth, 2),
                    "specificity": round(avg_specificity, 2),
                    "grounding": round(avg_grounding, 2),
                    "overall": round(avg_overall, 2),
                },
                "signalCounts": all_signals,
                "concernCounts": all_concerns,
                "allAnswers": answer_scores,
            }
            await conn.execute(
                """
                UPDATE "Interview"
                SET "answerScores" = $1::jsonb,
                    "updatedAt" = NOW()
                WHERE "applicationId" = $2
                """,
                json.dumps(answer_scores_payload),
                app_id,
            )
            logger.info(
                f"[SCORE] Saved {total_answers} answer scores for {app_id}: "
                f"clarity={avg_clarity:.1f}, depth={avg_depth:.1f}, specificity={avg_specificity:.1f}, "
                f"grounding={avg_grounding:.1f}"
            )
    except Exception as e:
        logger.error(f"[SCORE] Failed to persist answer scores for {app_id}: {e}")
async def update_interview_status(app_id: str):
    """Mark the application as COMPLETED via asyncpg."""
    if not DATABASE_URL:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
                "COMPLETED",
                app_id,
            )
            await conn.execute(
                'UPDATE "Interview" SET status = $1, "completedAt" = NOW() WHERE "applicationId" = $2',
                "COMPLETED",
                app_id,
            )
            logger.info(f"[INTERVIEW] App {app_id} marked as COMPLETED.")
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update interview status: {e}")
async def generate_interview_summary(
    app_id: str,
    transcript_lines: list,
    job_title: str,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
):
    """Generate a high-quality AI narrative summary after the interview completes."""
    is_google_model = str(llm_model).lower().startswith("gemini")
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[SUMMARY] Skipping: missing transcript or DATABASE_URL")
        return
    if not is_google_model and not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[SUMMARY] Skipping: missing OPENAI_API_KEY for non-Google summary")
        return
    try:
        client = build_google_analysis_client() if is_google_model else AsyncOpenAI()
        transcript_text = "\n".join(transcript_lines)
        transcript_text = truncate_to_tokens(transcript_text, 2500)
        logger.info(f"[SUMMARY] Generating narrative summary for {app_id}...")
        # Strip warmup lines before summarising — first 4 lines are rapport only
        interview_lines_for_summary = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
        summary_transcript = truncate_to_tokens("\n".join(interview_lines_for_summary), 2500)
        completion = await client.chat.completions.create(
            model=llm_model,
            temperature=0.1,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior talent partner writing a confidential post-interview evaluation for the hiring team.\n"
                        f"Role being assessed: {job_title}\n\n"
                        "Write 4 bullet points. Each bullet is ONE sentence. Use plain language.\n\n"
                        "Bullet 1 — Overall fit: State clearly whether the candidate demonstrated strong, moderate, weak, or no fit for the role. "
                        "Base this only on what was said in the interview — not assumptions.\n\n"
                        "Bullet 2 — Strongest demonstrated skill: Name the one area where they showed the most depth or clarity. "
                        "If they showed nothing, say so — do not invent strengths.\n\n"
                        "Bullet 3 — Communication quality: Describe how they communicated — fluency, clarity, confidence, grammar. "
                        "Be specific and honest. If they gave one-word answers or refused to engage, say that.\n\n"
                        "Bullet 4 — Key concern or recommendation: State the single most important flag for the hiring team. "
                        "If the candidate was unresponsive or showed no relevant knowledge, say that directly.\n\n"
                        "RULES:\n"
                        "- Do NOT soften negative findings. If the interview was poor, say so professionally.\n"
                        "- Do NOT invent positives that are not in the transcript.\n"
                        "- Do NOT use JSON. Do not include scores.\n"
                        "- Never use gender-biased language. Focus only on professional evidence.\n"
                        "- Each bullet must start with a dash (-)."
                    ),
                },
                {"role": "user", "content": f"Interview Transcript:\n{summary_transcript}"},
            ],
        )
        await persist_org_manual_billing_usage(org_id, "interview", _extract_openai_completion_usage(completion))
        raw_summary = completion.choices[0].message.content
        summary_text = raw_summary.strip() if isinstance(raw_summary, str) else ""
        if not summary_text:
            logger.warning(f"[SUMMARY] Empty summary generated for {app_id}; skipping save")
            return
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE "Interview"
                SET "aiSummary" = $1
                WHERE "applicationId" = $2
                """,
                summary_text,
                app_id,
            )
        logger.info(f"[SUMMARY] Generated summary for {app_id}")
    except Exception as e:
        logger.error(f"[SUMMARY] Generation failed for {app_id}: {e}")
async def generate_interview_report(
    app_id: str,
    transcript_lines: list,
    answer_scores: list[dict],
    job_title: str,
    proctoring_data: Optional[dict] = None,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
):
    """Generate structured interview report with scores, skills, and behavioral analysis."""
    is_google_model = str(llm_model).lower().startswith("gemini")
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[REPORT] Skipping: missing transcript or DATABASE_URL")
        return
    if not is_google_model and not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[REPORT] Skipping: missing OPENAI_API_KEY for non-Google report")
        return
    try:
        # Exclude warmup turns from all scoring — they skew every average
        interview_scores = [s for s in answer_scores if not s.get("is_warmup", False)]

        # Generate behavioral analysis
        behavioral_report = await synthesize_behavioral_report(
            transcript_lines=transcript_lines,
            answer_scores=interview_scores,
            total_duration_sec=int(proctoring_data.get("session_duration", 0)) if proctoring_data else 0,
            proctoring_events=proctoring_data.get("events", []) if proctoring_data else [],
            contradictions_found=proctoring_data.get("contradictions", []) if proctoring_data else [],
        )
        client = build_google_analysis_client() if is_google_model else AsyncOpenAI()
        # Strip warmup lines from transcript before sending to report LLM
        # Warmup is the first 4 lines (2 interviewer + 2 candidate exchanges)
        interview_lines = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
        transcript_text = "\n".join(interview_lines)
        transcript_text = truncate_to_tokens(transcript_text, 3000)

        # ── Technical score: avg of interview-only turns ──────────────────────
        technical_score = 0
        if interview_scores:
            avg_overall = sum(s.get("overall", 0.0) for s in interview_scores) / len(interview_scores)
            technical_score = int(min(100, max(0, avg_overall * 10)))

        # ── Communication score: avg of fluency/grammar/clarity/confidence ────
        comm_scores: dict[str, int] = {"clarity": 0, "fluency": 0, "grammar": 0, "confidence": 0}
        if interview_scores:
            for key in comm_scores:
                comm_scores[key] = int(
                    sum(s.get(key, 0) for s in interview_scores) / len(interview_scores) * 10
                )
        communication_score = int(sum(comm_scores.values()) / 4)

        logger.info(
            f"[REPORT] Generating report for {app_id} "
            f"technical={technical_score} communication={communication_score} "
            f"interview_turns={len(interview_scores)}"
        )

        # ── LLM: skills, role_fit, strengths, concerns ────────────────────────
        completion = await client.chat.completions.create(
            model=llm_model,
            temperature=0.1,
            max_tokens=2000,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are analyzing an interview transcript for the '{job_title}' role.\n"
                        "Be accurate and honest — do NOT inflate scores or invent strengths that are not in the transcript.\n"
                        "If the candidate refused to answer or gave one-word answers, reflect that truthfully.\n\n"
                        "Output ONLY valid JSON with these exact fields:\n\n"
                        "skills_covered: List every skill the candidate actually demonstrated (not just mentioned). "
                        "If the candidate gave no real answers, return only skills they explicitly referenced, rated low.\n\n"
                        "skill_ratings: Rate each skill 1-10:\n"
                        "  1-2: Refused to answer or said 'I don't know'\n"
                        "  3-4: Mentioned but vague or surface-level\n"
                        "  5-6: Basic understanding with weak examples\n"
                        "  7-8: Good understanding with concrete examples\n"
                        "  9-10: Deep expertise with specific projects and outcomes\n\n"
                        "role_fit: A number 0-100. How well did the candidate demonstrate fit for this specific role?\n"
                        "  0-20: Did not engage, refused questions, or showed no relevant knowledge\n"
                        "  21-40: Minimal engagement, very weak signal\n"
                        "  41-60: Some relevant background but significant gaps\n"
                        "  61-80: Good fit with minor gaps\n"
                        "  81-100: Excellent fit, strong evidence across all areas\n\n"
                        "top_strengths: List 2-4 real evidence-based strengths. "
                        "If there are none, return an empty array — do not invent strengths.\n\n"
                        "concerns: List 2-4 honest concerns with evidence. "
                        "If the candidate refused to answer, say so explicitly.\n\n"
                        "OUTPUT FORMAT:\n"
                        "{\n"
                        '  "skills_covered": ["skill1", "skill2"],\n'
                        '  "skill_ratings": {"skill1": 4, "skill2": 2},\n'
                        '  "role_fit": 35,\n'
                        '  "top_strengths": ["strength with evidence"],\n'
                        '  "concerns": ["concern with evidence"]\n'
                        "}"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Interview Transcript for '{job_title}':\n{transcript_text}",
                },
            ],
        )
        await persist_org_manual_billing_usage(org_id, "interview", _extract_openai_completion_usage(completion))
        raw_report = completion.choices[0].message.content or "{}"
        try:
            report_data = json.loads(raw_report.strip())
        except json.JSONDecodeError:
            logger.warning(f"[REPORT] Failed to parse report JSON for {app_id}")
            report_data = {"skills_covered": [], "skill_ratings": {}, "role_fit": 0, "top_strengths": [], "concerns": []}

        # Build qa_blocks from interview-only scores
        # Transcript Q&A is read directly from DB interviewTranscript on the frontend
        qa_blocks = []
        for idx, score in enumerate(interview_scores, 1):
            q_text = score.get("question", "").strip()
            overall_pct = int(score.get("overall", 0) * 10)
            qa_blocks.append({
                "q": idx,
                "question": q_text or f"Question {idx}",
                "title": q_text or f"Question {idx}",
                "score": overall_pct,
                "reasoning": (
                    f"Clarity: {score.get('clarity', 0)}/10 · "
                    f"Depth: {score.get('depth', 0)}/10 · "
                    f"Fluency: {score.get('fluency', 0)}/10 · "
                    f"Confidence: {score.get('confidence', 0)}/10"
                ),
                "verdict": (
                    f"Clarity: {score.get('clarity', 0)}/10  "
                    f"Depth: {score.get('depth', 0)}/10  "
                    f"Fluency: {score.get('fluency', 0)}/10"
                ),
            })

        skills_covered = report_data.get("skills_covered", [])
        top_strengths = report_data.get("top_strengths", [])
        concerns = report_data.get("concerns", [])
        role_fit = int(min(100, max(0, report_data.get("role_fit", 0))))

        final_report = {
            "technical_score": technical_score,
            "role_fit": role_fit,
            "scores": {
                "technical": technical_score,
                "role_fit": role_fit,
                "communication": communication_score,
                "communication_breakdown": comm_scores,
            },
            "skills_proof": skills_covered,
            "skill_ratings": report_data.get("skill_ratings", {}),
            "top_strengths": top_strengths if isinstance(top_strengths, list) else [],
            "concerns": concerns if isinstance(concerns, list) else [],
            "qa_blocks": qa_blocks,
            "behavioral_analysis": behavioral_report,
            "verdict": {
                "summary": (
                    f"Technical score: {technical_score}%. "
                    f"Role fit (JD): {role_fit}%. "
                    f"Communication: {communication_score}/100. "
                    f"{len(skills_covered)} skill(s) assessed. "
                    f"{behavioral_report.get('summary', '')}"
                )
            },
        }
        # Save to database
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE "Interview"
                SET "interviewReport" = $1
                WHERE "applicationId" = $2
                """,
                json.dumps(final_report),
                app_id,
            )
        logger.info(f"[REPORT] Generated report for {app_id}: score={technical_score}, skills={len(report_data.get('skills_covered', []))}")
    except Exception as e:
        logger.error(f"[REPORT] Generation failed for {app_id}: {e}", exc_info=True)
async def generate_interview_state_summary(
    transcript_lines: list,
    questions_list: str,
    candidate_name: str,
    job_title: str,
    client,
    org_id: Optional[str] = None,
    turn_count: int = 0,
    total_turns_expected: int = 20,
    seconds_remaining: Optional[float] = None,
    llm_model: str = LLM_MODEL,
) -> str:
    """Generate a concise mid-interview state summary for dynamic context injection."""
    if len(transcript_lines) < 4:
        return ""
    last_lines = transcript_lines[-12:]
    transcript_text = "\n".join(transcript_lines[-40:])
    pct_done = int((turn_count / max(total_turns_expected, 1)) * 100)
    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.1,
                max_tokens=500,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an interview supervisor monitoring a live AI interview. "
                            "Your job is to give Ishita (the AI interviewer) a DIRECT, ACTIONABLE status update. "
                            "Be blunt - this is an internal coaching note, not a polite summary. "
                            "Write in second person to Ishita. No filler. No pleasantries.\n\n"
                            "ALWAYS include ALL of these sections:\n\n"
                            "1. TOPIC STATUS: List each mandatory area as [COVERED], [THIN], or [UNTOUCHED]. "
                            "COVERED = candidate gave a substantive answer (3+ sentences or a specific real example with details). "
                            "THIN = topic was raised but answer was vague or surface-level. "
                            "UNTOUCHED = never raised.\n\n"
                            "2. STUCK ALERT: If Ishita has asked 2 or more follow-ups on the SAME topic without moving on, "
                            "say: 'MOVE ON NOW - stuck on [topic]. Next question: [EXACT QUESTION to ask about next untouched area]'\n\n"
                            "3. NEXT ACTION: One specific instruction - exactly what Ishita should do or ask next. "
                            "If the last answer was DEEP (had real specifics, numbers, or tradeoffs), say 'DEPTH SIGNAL - go one level deeper on [topic] before moving on.' "
                            "If the last answer was SURFACE (vague, no specifics, no numbers), say 'SURFACE ANSWER - push specificity probe on [topic] before moving.' "
                            "Otherwise give standard coverage guidance.\n\n"
                            "4. PACE WARNING: If more than 60% of the interview is done and fewer than half the areas are covered, "
                            "say 'PACE CRITICAL - accelerate now.'\n\n"
                            "5. ANSWER DEPTH: Rate the candidate's most recent answer as one of: "
                            "[SURFACE] = generic, no specifics, no numbers, no proper nouns; "
                            "[SPECIFIC] = named a real project/tool/company OR gave a number; "
                            "[DEEP] = named specifics AND explained reasoning, tradeoff, or failure. "
                            "Output on its own line: 'ANSWER_DEPTH: [SURFACE|SPECIFIC|DEEP]'"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"MANDATORY AREAS:\n{questions_list}\n\n"
                            f"CANDIDATE: {candidate_name} | ROLE: {job_title}\n"
                            f"INTERVIEW PROGRESS: ~{pct_done}% done (turn {turn_count})"
                            + f"\n\nRECENT TRANSCRIPT (last 40 lines, for coverage/pace):\n{transcript_text}\n\n"
                            f"LAST 12 LINES (for stuck detection):\n{chr(10).join(last_lines)}"
                        ),
                    },
                ],
            ),
            timeout=10.0,
        )
        await persist_org_manual_billing_usage(org_id, "interview", _extract_openai_completion_usage(completion))
        return completion.choices[0].message.content or ""
    except Exception as e:
        logger.warning(f"[STATE_INJECT] State summary generation failed: {e}")
        return ""
def _extract_openai_completion_usage(completion: Any) -> dict[str, Any]:
    usage = getattr(completion, "usage", None)
    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    prompt_details = getattr(usage, "prompt_tokens_details", None)
    cached_tokens = int(getattr(prompt_details, "cached_tokens", 0) or 0)
    model_name = str(getattr(completion, "model", "") or LLM_MODEL)
    return {
        "model": model_name,
        "inputTokens": prompt_tokens,
        "cachedInputTokens": cached_tokens,
        "outputTokens": completion_tokens,
    }
def merge_manual_billing_usage(existing: dict[str, Any], feature: str, usage: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing)
    billing = _coerce_billing_metrics(merged.get("billing"))
    if feature not in billing:
        feature = "general"
    model_name = str(usage.get("model", "unknown") or "unknown")
    model_key = f"openai:{model_name}"
    input_tokens = int(usage.get("inputTokens", 0) or 0)
    cached_tokens = int(usage.get("cachedInputTokens", 0) or 0)
    output_tokens = int(usage.get("outputTokens", 0) or 0)
    session_duration = float(usage.get("sessionDuration", 0) or 0)
    model_cost = _estimate_openai_cost(model_name, input_tokens, cached_tokens, output_tokens)
    bucket = billing[feature]
    bucket["runs"] = int(bucket.get("runs", 0)) + 1
    bucket["inputTokens"] = int(bucket.get("inputTokens", 0)) + input_tokens
    bucket["cachedInputTokens"] = int(bucket.get("cachedInputTokens", 0)) + cached_tokens
    bucket["outputTokens"] = int(bucket.get("outputTokens", 0)) + output_tokens
    bucket["sessionDuration"] = float(bucket.get("sessionDuration", 0)) + session_duration
    bucket["costUsd"] = float(bucket.get("costUsd", 0.0)) + model_cost
    by_model = _coerce_jsonish(bucket.get("byModel"))
    current = _coerce_jsonish(by_model.get(model_key))
    current["runs"] = int(current.get("runs", 0)) + 1
    current["inputTokens"] = int(current.get("inputTokens", 0)) + input_tokens
    current["cachedInputTokens"] = int(current.get("cachedInputTokens", 0)) + cached_tokens
    current["outputTokens"] = int(current.get("outputTokens", 0)) + output_tokens
    current["sessionDuration"] = float(current.get("sessionDuration", 0)) + session_duration
    current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
    by_model[model_key] = current
    bucket["byModel"] = by_model
    billing[feature] = bucket
    merged["billing"] = billing
    return merged
