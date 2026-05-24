import asyncio
import asyncpg
import json
import os
import time
from typing import Any, Optional
from pydantic import BaseModel, Field
from urllib.parse import parse_qsl, urlencode, urlunparse, urlparse
from interview.agent_utils import build_interview_turns
from behavioral_analysis import synthesize_behavioral_report
from interview.agent_runtime_support import (

    DATABASE_URL,
    LLM_MODEL,
    FIXED_INTERVIEW_DURATION_MINUTES,
    _DB_POOL,
    _DB_POOL_INIT_TASK,
    _PENDING_MANUAL_BILLING,
    logger,
)
from interview.agent_utils import _coerce_jsonish, truncate_to_tokens
from livekit.agents.metrics import AgentSessionUsage
from openai import AsyncOpenAI

_DB_POOL_LOCK: asyncio.Lock | None = None


def _get_pool_lock() -> asyncio.Lock:
    global _DB_POOL_LOCK
    if _DB_POOL_LOCK is None:
        _DB_POOL_LOCK = asyncio.Lock()
    return _DB_POOL_LOCK

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
    async def _init_conn(conn):
        await conn.execute("SET statement_timeout = '30s'")

    return await asyncpg.create_pool(
        conn_str,
        ssl=False,
        statement_cache_size=0,
        min_size=1,
        max_size=5,
        max_inactive_connection_lifetime=60.0,
        init=_init_conn,
    )
async def _pool_is_healthy(pool: asyncpg.Pool) -> bool:
    if pool._closed:
        return False
    try:
        async with pool.acquire(timeout=2.0) as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:
        return False


async def get_db_pool() -> asyncpg.Pool:
    global _DB_POOL, _DB_POOL_INIT_TASK, _DB_POOL_LOCK
    if _DB_POOL is not None and not _DB_POOL._closed:
        return _DB_POOL
    async with _get_pool_lock():
        if _DB_POOL is not None and not _DB_POOL._closed:
            # Fast path passed, but verify connections aren't stale
            if await _pool_is_healthy(_DB_POOL):
                return _DB_POOL
            # Pool object alive but connections dead — close and recreate
            try:
                await _DB_POOL.close()
            except Exception:
                pass
            _DB_POOL = None
            _DB_POOL_INIT_TASK = None
            _DB_POOL_LOCK = None  # reset so next get_db_pool() creates lock on current event loop
        if _DB_POOL_INIT_TASK is not None and not _DB_POOL_INIT_TASK.done():
            _DB_POOL = await _DB_POOL_INIT_TASK
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
_ELEVENLABS_TTS_DEFAULT_USD_PER_MILLION_CHARS = float(
    os.environ.get("ELEVENLABS_TTS_USD_PER_MILLION_CHARS", "30.0")
)
_SARVAM_STT_INR_PER_HOUR: dict[str, float] = {
    "saaras:v3": 30.0,
}
_DEEPGRAM_STT_USD_PER_MIN: dict[str, float] = {
    "nova-3": 0.0077,
    "nova-3-general": 0.0077,
}
# ── Pydantic Billing Models (replaces _empty_billing_feature + _coerce_billing_metrics) ──
class _ModelBilling(BaseModel):
    provider: str = "unknown"
    model: str = "unknown"
    runs: int = 0
    inputTokens: int = 0
    cachedInputTokens: int = 0
    outputTokens: int = 0
    sessionDuration: float = 0.0
    costUsd: float = 0.0
    characters: int = 0
    audioSeconds: float = 0.0

class _FeatureBilling(BaseModel):
    runs: int = 0
    inputTokens: int = 0
    cachedInputTokens: int = 0
    outputTokens: int = 0
    sessionDuration: float = 0.0
    costUsd: float = 0.0
    ttsRuns: int = 0
    ttsCharacters: int = 0
    ttsCostUsd: float = 0.0
    sttRuns: int = 0
    sttAudioSeconds: float = 0.0
    sttCostUsd: float = 0.0
    byModel: dict[str, _ModelBilling] = Field(default_factory=dict)
    ttsByModel: dict[str, _ModelBilling] = Field(default_factory=dict)
    sttByModel: dict[str, _ModelBilling] = Field(default_factory=dict)

class _OrgBilling(BaseModel):
    interview: _FeatureBilling = Field(default_factory=_FeatureBilling)
    resumeExtraction: _FeatureBilling = Field(default_factory=_FeatureBilling)
    jdExtraction: _FeatureBilling = Field(default_factory=_FeatureBilling)
    chatbot: _FeatureBilling = Field(default_factory=_FeatureBilling)
    interviewReport: _FeatureBilling = Field(default_factory=_FeatureBilling)
    resumeReport: _FeatureBilling = Field(default_factory=_FeatureBilling)

def _merge_llm_into_bucket(
    bucket: _FeatureBilling,
    llm_totals: dict,
    llm_by_model: dict,
) -> None:
    """Merge LLM usage from a session into a feature bucket using O(1) hash lookups."""
    if not llm_by_model and not llm_totals:
        return
    bucket.runs += 1
    bucket.inputTokens += int(llm_totals.get("inputTokens", 0) or 0)
    bucket.cachedInputTokens += int(llm_totals.get("inputCachedTokens", 0) or 0)
    bucket.outputTokens += int(llm_totals.get("outputTokens", 0) or 0)
    bucket.sessionDuration += float(llm_totals.get("sessionDuration", 0) or 0)
    session_cost = 0.0
    for model_key, raw in llm_by_model.items():
        row = _coerce_jsonish(raw)
        model_name = str(row.get("model", "") or "unknown").strip()
        input_t = int(row.get("inputTokens", 0) or 0)
        cached_t = int(row.get("inputCachedTokens", 0) or 0)
        output_t = int(row.get("outputTokens", 0) or 0)
        session_dur = float(row.get("sessionDuration", 0) or 0)
        cost = _estimate_openai_cost(model_name, input_t, cached_t, output_t)
        session_cost += cost
        if model_key not in bucket.byModel:
            bucket.byModel[model_key] = _ModelBilling(provider=row.get("provider", "unknown"), model=model_name)
        mb = bucket.byModel[model_key]
        mb.runs += 1
        mb.inputTokens += input_t
        mb.cachedInputTokens += cached_t
        mb.outputTokens += output_t
        mb.sessionDuration += session_dur
        mb.costUsd += cost
    bucket.costUsd += session_cost
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
    if provider == "ELEVENLABS":
        return (chars / 1_000_000.0) * _ELEVENLABS_TTS_DEFAULT_USD_PER_MILLION_CHARS
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
def merge_feature_billing(
    existing: dict[str, Any],
    feature: str,
    session_summary: dict[str, Any],
    tts_config: Optional[dict[str, Any]] = None,
    stt_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Pydantic-based billing merger for any of the 6 supported features.
    Replaces merge_interview_billing. Uses O(1) hash-map lookups, no nested loops.
    """
    merged = dict(existing)
    org = _OrgBilling.model_validate(_coerce_jsonish(merged.get("billing")))
    bucket: _FeatureBilling = getattr(org, feature)

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
    stt_total_audio_seconds = float(stt_totals.get("audioDuration", 0) or 0.0)
    tts_has_usage = bool(tts_by_model) or tts_total_chars > 0
    stt_has_usage = bool(stt_by_model) or stt_total_audio_seconds > 0

    if not llm_has_usage and not tts_has_usage and not stt_has_usage:
        merged["billing"] = org.model_dump()
        return merged

    if llm_has_usage:
        _merge_llm_into_bucket(bucket, llm_totals, llm_by_model)

    # ── TTS ──
    default_tts_provider = str((tts_config or {}).get("provider", "") or "").strip().upper()
    default_tts_model = str((tts_config or {}).get("model", "") or "").strip()
    session_tts_chars, session_tts_cost = 0, 0.0
    for _, raw in tts_by_model.items():
        row = _coerce_jsonish(raw)
        provider = str(row.get("provider", "") or default_tts_provider).strip().upper()
        model_name = str(row.get("model", "") or default_tts_model).strip()
        if provider not in {"SARVAM", "CARTESIA", "ELEVENLABS"} and default_tts_provider in {"SARVAM", "CARTESIA", "ELEVENLABS"}:
            provider = default_tts_provider
        if (not model_name or model_name == "unknown") and default_tts_model:
            model_name = default_tts_model
        chars = int(row.get("charactersCount", 0) or row.get("inputTokens", 0) or 0)
        if chars <= 0:
            continue
        session_tts_chars += chars
        cost = _estimate_tts_cost_usd(provider, model_name, chars)
        session_tts_cost += cost
        model_key = f"{provider.lower() or 'unknown'}:{_normalize_tts_model_name(model_name) or 'unknown'}"
        if model_key not in bucket.ttsByModel:
            bucket.ttsByModel[model_key] = _ModelBilling(provider=provider or "UNKNOWN", model=model_name or "unknown")
        mb = bucket.ttsByModel[model_key]
        mb.runs += 1; mb.characters += chars; mb.costUsd += cost
    if session_tts_chars == 0 and tts_total_chars > 0:
        session_tts_chars = tts_total_chars
        provider = default_tts_provider or "UNKNOWN"
        model_name = default_tts_model or "unknown"
        cost = _estimate_tts_cost_usd(provider, model_name, tts_total_chars)
        session_tts_cost += cost
        model_key = f"{provider.lower() or 'unknown'}:{_normalize_tts_model_name(model_name) or 'unknown'}"
        if model_key not in bucket.ttsByModel:
            bucket.ttsByModel[model_key] = _ModelBilling(provider=provider, model=model_name)
        mb = bucket.ttsByModel[model_key]
        mb.runs += 1; mb.characters += tts_total_chars; mb.costUsd += cost
    if session_tts_chars > 0:
        bucket.ttsRuns += 1
        bucket.ttsCharacters += session_tts_chars
        bucket.ttsCostUsd += session_tts_cost

    # ── STT ──
    default_stt_provider = str((stt_config or {}).get("provider", "") or "").strip().upper()
    default_stt_model = str((stt_config or {}).get("model", "") or "").strip()
    session_stt_seconds, session_stt_cost = 0.0, 0.0
    for _, raw in stt_by_model.items():
        row = _coerce_jsonish(raw)
        provider = str(row.get("provider", "") or default_stt_provider).strip().upper()
        model_name = str(row.get("model", "") or default_stt_model).strip()
        if provider not in {"SARVAM", "DEEPGRAM"} and default_stt_provider in {"SARVAM", "DEEPGRAM"}:
            provider = default_stt_provider
        if (not model_name or model_name == "unknown") and default_stt_model:
            model_name = default_stt_model
        seconds = float(row.get("audioDuration", 0) or 0.0)
        if seconds <= 0:
            continue
        session_stt_seconds += seconds
        cost = _estimate_stt_cost_usd(provider, model_name, seconds)
        session_stt_cost += cost
        model_key = f"{provider.lower() or 'unknown'}:{_normalize_stt_model_name(model_name) or 'unknown'}"
        if model_key not in bucket.sttByModel:
            bucket.sttByModel[model_key] = _ModelBilling(provider=provider or "UNKNOWN", model=model_name or "unknown")
        mb = bucket.sttByModel[model_key]
        mb.runs += 1; mb.audioSeconds += seconds; mb.costUsd += cost
    if session_stt_seconds == 0 and stt_total_audio_seconds > 0:
        session_stt_seconds = stt_total_audio_seconds
        provider = default_stt_provider or "UNKNOWN"
        model_name = default_stt_model or "unknown"
        cost = _estimate_stt_cost_usd(provider, model_name, stt_total_audio_seconds)
        session_stt_cost += cost
        model_key = f"{provider.lower() or 'unknown'}:{_normalize_stt_model_name(model_name) or 'unknown'}"
        if model_key not in bucket.sttByModel:
            bucket.sttByModel[model_key] = _ModelBilling(provider=provider, model=model_name)
        mb = bucket.sttByModel[model_key]
        mb.runs += 1; mb.audioSeconds += stt_total_audio_seconds; mb.costUsd += cost
    if session_stt_seconds > 0:
        bucket.sttRuns += 1
        bucket.sttAudioSeconds += session_stt_seconds
        bucket.sttCostUsd += session_stt_cost

    merged["billing"] = org.model_dump()
    return merged

# Keep old name as alias so existing callers (persist_org_usage_metrics) still work
def merge_interview_billing(
    existing: dict[str, Any],
    session_summary: dict[str, Any],
    tts_config: Optional[dict[str, Any]] = None,
    stt_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Backward-compat alias — delegates to merge_feature_billing for the 'interview' feature."""
    return merge_feature_billing(existing, "interview", session_summary, tts_config, stt_config)

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
def _build_jd_from_extracted(extracted_json: str | None) -> str:
    if not extracted_json:
        return ""
    try:
        data = json.loads(extracted_json) if isinstance(extracted_json, str) else extracted_json
        parts = []
        if data.get("role_summary"):
            parts.append(f"Description: {data['role_summary']}")
        if data.get("responsibilities"):
            r = data["responsibilities"]
            parts.append("Responsibilities:\n" + ("\n".join(f"- {x}" for x in r) if isinstance(r, list) else str(r)))
        if data.get("requirements"):
            req = data["requirements"]
            parts.append("Requirements:\n" + ("\n".join(f"- {x}" for x in req) if isinstance(req, list) else str(req)))
        if data.get("skills"):
            s = data["skills"]
            parts.append("Skills: " + (", ".join(s) if isinstance(s, list) else str(s)))
        if data.get("experience"):
            parts.append(f"Experience: {data['experience']}")
        return "\n\n".join(parts)
    except Exception:
        return ""


async def get_interview_context(app_id: str):
    """Fetch Candidate and Job Description context from PostgreSQL via asyncpg."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    query = """
    SELECT a."fullName", a."resumeText", a."resumeData", d.title, d.role AS "role", d."extractedDetails", d."orgId" AS "orgId",
           d.location AS "driveLocation", d."interviewLanguage", d."interviewQuestions",
           COALESCE(d."voiceId", o."voiceId") AS "voiceId",
           COALESCE(d."aiName", 'Ishitha') AS "aiName", o.name AS "orgName", o.location AS "orgLocation",
           o."deepgramModel", NULL AS "llmModel", NULL AS "llmTemperature", o."proctoringSignals",
           ev.provider AS "voiceProvider", ev.model AS "voiceModel"
    FROM "Application" a
    JOIN "Drive" d ON a."driveId" = d.id
    LEFT JOIN "Organization" o ON d."orgId" = o.id
    LEFT JOIN "EngineVoice" ev ON ev.id = COALESCE(d."voiceId", o."voiceId")
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
            return {
                "fullName": row["fullName"],
                "resumeText": row["resumeText"],
                "resumeData": row["resumeData"],
                "extractedDetails": row["extractedDetails"],
                "jobTitle": row["role"] or row["title"],
                "driveTitle": row["title"],
                "jd": _build_jd_from_extracted(row["extractedDetails"]),
                "orgId": row["orgId"],
                "orgName": row["orgName"],
                "orgLocation": row["orgLocation"],
                "driveLocation": row["driveLocation"],
                "language": row["interviewLanguage"],
                "timeLimit": FIXED_INTERVIEW_DURATION_MINUTES,
                "voiceId": row["voiceId"],
                "voiceProvider": row["voiceProvider"],
                "voiceModel": row["voiceModel"],
                "aiName": row["aiName"],
                "deepgramModel": row["deepgramModel"],
                "llmModel": row["llmModel"],
                "llmTemperature": row["llmTemperature"],
                "proctoringSignals": row["proctoringSignals"],
                "interviewQuestions": row["interviewQuestions"],
            }
        except Exception as e:
            last_error = e
            logger.error(f"Database error during context fetch (attempt {attempt}/5): {e}")
            if "no interview context found in db" in str(e).lower():
                break
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
    partial: bool = False,
):
    """Save transcript, duration, and proctoring report to Interview table via asyncpg.

    If partial=True: only update transcript, duration, turns (never touch status/completedAt).
    If partial=False: full update including status and completedAt.
    """
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
                "events": proctoring_data.get("events", []),
                "contradictions": proctoring_data.get("contradictions", []),
            }
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            if partial:
                # Partial save: only update transcript, duration, turns (skip status, completedAt)
                await conn.execute(
                    """
                    UPDATE "Interview"
                    SET
                        "interviewTranscript" = $1,
                        "interviewDuration"   = $2,
                        "interviewTurns"      = $3,
                        "updatedAt"           = NOW()
                    WHERE "applicationId" = $4
                    """,
                    full_text,
                    duration,
                    json.dumps(interview_turns),
                    app_id,
                )
                logger.info(
                    f"[TRANSCRIPT] Partial save {len(transcript_lines)} lines, {duration}s duration, "
                    f"{len(interview_turns)} turn(s) for app {app_id}"
                )
            else:
                # Final save: update everything including status and completedAt
                await conn.execute(
                    """
                    UPDATE "Interview"
                    SET
                        "interviewTranscript" = $1,
                        "interviewDuration"   = $2,
                        status                = $3,
                        "behaviorSignals"    = COALESCE("behaviorSignals", '{}'::jsonb) || COALESCE($4::jsonb, '{}'::jsonb),
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
                    f"[TRANSCRIPT] Final save {len(transcript_lines)} lines, {duration}s duration, "
                    f"{len(interview_turns)} turn(s), status={final_status} for app {app_id}"
                )
    except Exception as e:
        logger.error(f"[TRANSCRIPT] DB save failed: {e}")


async def checkpoint_ai_signals(app_id: str, events: list[dict]) -> None:
    """Merge-append a batch of AI signal events into proctoringReport without
    overwriting the rest of the report. Safe to call multiple times — each call
    appends only the new events passed in; deduplication is handled by the
    caller (agent_runtime) which passes only the newly-appended slice.

    Uses a jsonb merge so concurrent frontend signal writes to integritySignals
    are never touched.
    """
    if not events or not DATABASE_URL:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE "Interview"
                SET
                    "behaviorSignals" = COALESCE("behaviorSignals", '{}'::jsonb)
                        || jsonb_build_object(
                            'checkpoint_events',
                            COALESCE(
                                ("behaviorSignals"->'checkpoint_events'),
                                '[]'::jsonb
                            ) || $1::jsonb
                        ),
                    "updatedAt" = NOW()
                WHERE "applicationId" = $2
                """,
                json.dumps(events),
                app_id,
            )
        logger.info(f"[CHECKPOINT] Flushed {len(events)} AI signal(s) to DB for app {app_id}")
    except Exception as e:
        logger.warning(f"[CHECKPOINT] AI signal flush failed for app {app_id}: {e}")


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
async def persist_question_by_question_analysis(app_id: str, answer_scores: list[dict]) -> None:
    """Save full turn-by-turn interview analysis to Interview.questionByQuestionAnalysis JSONB."""
    if not app_id or not DATABASE_URL or not answer_scores:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            normalized_turns = []
            for idx, score in enumerate(answer_scores, 1):
                normalized_turns.append({
                    "turn": int(score.get("turn", idx) or idx),
                    "ai_question": str(score.get("question", "") or "").strip(),
                    "candidate_answer": str(score.get("answer", "") or "").strip(),
                    "score_breakdown": {
                        "clarity": int(score.get("clarity", 0) or 0),
                        "depth": int(score.get("depth", 0) or 0),
                        "fluency": int(score.get("fluency", 0) or 0),
                        "confidence": int(score.get("confidence", 0) or 0),
                    },
                    "overall": float(score.get("overall", 0) or 0),
                    "signals": list(score.get("signals", []) or []),
                    "concerns": list(score.get("concerns", []) or []),
                    "topic": str(score.get("topic", "") or ""),
                    "topic_saturation_score": float(score.get("topic_saturation_score", 0) or 0),
                    "topic_saturation_threshold": float(score.get("topic_saturation_threshold", 0) or 0),
                    "is_warmup": bool(score.get("is_warmup", False)),
                })
            await conn.execute(
                """
                UPDATE "Interview"
                SET "questionByQuestionAnalysis" = $1::jsonb,
                    "updatedAt" = NOW()
                WHERE "applicationId" = $2
                """,
                json.dumps(normalized_turns),
                app_id,
            )
            logger.info(
                f"[SCORE] Saved {len(normalized_turns)} question-by-question analysis rows for {app_id}"
            )
    except Exception as e:
        logger.error(f"[SCORE] Failed to persist question-by-question analysis for {app_id}: {e}")


async def persist_answer_scores(app_id: str, answer_scores: list[dict]) -> None:
    """Backward-compatible wrapper for existing runtime imports."""
    await persist_question_by_question_analysis(app_id, answer_scores)


async def persist_skill_ratings(app_id: str, skill_ratings: dict[str, dict]) -> None:
    """Compatibility shim for the runtime's final skill ratings write.

    The interview report generator already stores a richer final report, but the
    runtime still calls this function at shutdown. We keep it as a small merge
    update so older and newer code paths both work.
    """
    if not app_id or not DATABASE_URL or not skill_ratings:
        return

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE "Interview"
                SET "skillRatings" =
                    COALESCE("skillRatings", '{}'::jsonb)
                    || jsonb_build_object('skill_ratings', $1::jsonb),
                    "updatedAt" = NOW()
                WHERE "applicationId" = $2
                """,
                json.dumps(skill_ratings),
                app_id,
            )
            logger.info(f"[SKILL_RATINGS] Saved {len(skill_ratings)} skill rating(s) for {app_id}")
    except Exception as e:
        logger.error(f"[SKILL_RATINGS] Failed to persist skill ratings for {app_id}: {e}")


async def deduct_interview_billing(app_id: str, duration_seconds: Optional[float] = None) -> None:
    """
    Atomically deduct one interview quota slot and record minute-based credit usage.
    Uses billingSnapshot->billedAt as an idempotency guard — safe to call multiple times.
    """
    if not DATABASE_URL:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # Resolve org_id
            row = await conn.fetchrow(
                """
                SELECT d."orgId", i."interviewDuration", i."recordingDurationSec"
                FROM "Interview" i
                JOIN "Application" a ON a.id = i."applicationId"
                JOIN "Drive" d ON d.id = a."driveId"
                WHERE a.id = $1
                LIMIT 1
                """,
                app_id,
            )
            if not row:
                logger.warning(f"[BILLING] No interview row found for {app_id} — skipping billing")
                return

            org_id = row["orgId"]
            if not org_id:
                logger.warning(f"[BILLING] No orgId for {app_id} — skipping billing")
                return

            # Resolve duration: prefer explicit arg, then DB columns
            dur = duration_seconds
            if not dur or dur <= 0:
                dur = float(row["interviewDuration"] or 0)
            if not dur or dur <= 0:
                dur = float(row["recordingDurationSec"] or 0)

            # Atomic mark-and-deduct — returns the row only if not already billed
            marked = await conn.fetch(
                """
                UPDATE "Interview"
                SET "billingSnapshot" = jsonb_set(
                    COALESCE("billingSnapshot", '{}'::jsonb),
                    '{billedAt}',
                    to_jsonb(extract(epoch from now())::bigint)
                ),
                "updatedAt" = NOW()
                WHERE "applicationId" = $1
                  AND ("billingSnapshot" IS NULL OR "billingSnapshot"->'billedAt' IS NULL)
                RETURNING id
                """,
                app_id,
            )

            if not marked:
                logger.info(f"[BILLING] Already billed for {app_id} — skipping")
                return

            # Deduct one interview slot from quota
            await conn.execute(
                """
                UPDATE "Organization"
                SET "interviewQuotaUsed" = COALESCE("interviewQuotaUsed", 0) + 1,
                    "updatedAt" = NOW()
                WHERE id = $1
                """,
                org_id,
            )

            # Record minute-based credit usage (1 credit = 1 minute)
            if dur > 0:
                credits_delta = round((dur / 60) * 100) / 100
                if credits_delta > 0:
                    await conn.execute(
                        """
                        UPDATE "Organization"
                        SET "creditsUsed" = COALESCE("creditsUsed", 0) + $1,
                            "updatedAt" = NOW()
                        WHERE id = $2
                        """,
                        credits_delta,
                        org_id,
                    )
                    logger.info(f"[BILLING] Deducted 1 quota + {credits_delta:.2f} credits for {app_id} org={org_id} dur={dur:.0f}s")
                else:
                    logger.info(f"[BILLING] Deducted 1 quota (no credits — dur={dur:.0f}s) for {app_id} org={org_id}")
            else:
                logger.warning(f"[BILLING] Deducted 1 quota but duration unknown for {app_id} org={org_id}")

    except Exception as e:
        logger.error(f"[BILLING] Failed to deduct billing for {app_id}: {e}")


async def update_interview_status(app_id: str, duration_seconds: Optional[float] = None):
    """Mark the application as COMPLETED via asyncpg and deduct billing."""
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

    # Deduct billing after marking completed (idempotent — safe to retry)
    await deduct_interview_billing(app_id, duration_seconds=duration_seconds)
async def generate_interview_summary(
    app_id: str,
    transcript_lines: list,
    job_title: str,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
):
    """Generate a high-quality AI narrative summary after the interview completes."""
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[SUMMARY] Skipping: missing transcript or DATABASE_URL")
        return
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[SUMMARY] Skipping: missing OPENAI_API_KEY")
        return
    try:
        client = AsyncOpenAI()
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
        await persist_org_manual_billing_usage(org_id, "interviewReport", _extract_openai_completion_usage(completion))
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
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[REPORT] Skipping: missing transcript or DATABASE_URL")
        return
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[REPORT] Skipping: missing OPENAI_API_KEY")
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
        client = AsyncOpenAI()
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
                        "decision_note: A 3-5 sentence narrative summary. Start with the recommendation (STRONG HIRE | HIRE | MAYBE | REJECT). "
                        "Then explain who this candidate is, what they can do, and why (or why not) to hire them. "
                        "Use specific evidence from the interview—projects they built, decisions they explained, skills shown. "
                        "Do NOT use metrics or percentages—write flowing sentences. Example: 'STRONG HIRE. They built production systems in React and explained their architectural choices. They showed problem-solving depth and owned their work end-to-end. Gap: missing DevOps but strong fundamentals to learn.' "
                        "Be honest about gaps if they exist, but frame them as teachable vs. disqualifying.\n\n"
                        "cognitive_insights: Score the candidate's thinking using these exact fields: clarity, clarity_earned, clarity_missed, depth_of_knowledge, depth_earned, depth_missed, problem_solving, problem_solving_earned, problem_solving_missed, logical_thinking, logical_thinking_earned, logical_thinking_missed, adaptability, adaptability_earned, adaptability_missed, confidence, confidence_earned, confidence_missed, summary. "
                        "Use 0-100 integers for every score field. The *_earned and *_missed fields must be 1-2 sentences and must cite a specific transcript moment. If a dimension cannot be assessed, set the score to 0 and use 'Unable to evaluate.' for the evidence text.\n\n"
                        "OUTPUT FORMAT:\n"
                        "{\n"
                        '  "skills_covered": ["skill1", "skill2"],\n'
                        '  "skill_ratings": {"skill1": 4, "skill2": 2},\n'
                        '  "role_fit": 35,\n'
                        '  "top_strengths": ["strength with evidence"],\n'
                        '  "concerns": ["concern with evidence"],\n'
                        '  "cognitive_insights": {"clarity": 0, "clarity_earned": "", "clarity_missed": "", "depth_of_knowledge": 0, "depth_earned": "", "depth_missed": "", "problem_solving": 0, "problem_solving_earned": "", "problem_solving_missed": "", "logical_thinking": 0, "logical_thinking_earned": "", "logical_thinking_missed": "", "adaptability": 0, "adaptability_earned": "", "adaptability_missed": "", "confidence": 0, "confidence_earned": "", "confidence_missed": "", "summary": ""},\n'
                        '  "decision_note": "RECOMMENDATION. Who they are and why (or why not) hire them."\n'
                        "}"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Interview Transcript for '{job_title}':\n{transcript_text}",
                },
            ],
        )
        await persist_org_manual_billing_usage(org_id, "interviewReport", _extract_openai_completion_usage(completion))
        raw_report = completion.choices[0].message.content or "{}"
        try:
            report_data = json.loads(raw_report.strip())
        except json.JSONDecodeError:
            logger.warning(f"[REPORT] Failed to parse report JSON for {app_id}")
            report_data = {
                "skills_covered": [],
                "skill_ratings": {},
                "role_fit": 0,
                "top_strengths": [],
                "concerns": [],
                "cognitive_insights": {},
                "decision_note": "Unable to parse report.",
            }

        def _normalize_cognitive_insights(raw: Any) -> dict[str, Any]:
            fallback = {
                "clarity": 0,
                "clarity_earned": "Unable to evaluate.",
                "clarity_missed": "Unable to evaluate.",
                "depth_of_knowledge": 0,
                "depth_earned": "Unable to evaluate.",
                "depth_missed": "Unable to evaluate.",
                "problem_solving": 0,
                "problem_solving_earned": "Unable to evaluate.",
                "problem_solving_missed": "Unable to evaluate.",
                "logical_thinking": 0,
                "logical_thinking_earned": "Unable to evaluate.",
                "logical_thinking_missed": "Unable to evaluate.",
                "adaptability": 0,
                "adaptability_earned": "Unable to evaluate.",
                "adaptability_missed": "Unable to evaluate.",
                "confidence": 0,
                "confidence_earned": "Unable to evaluate.",
                "confidence_missed": "Unable to evaluate.",
                "summary": "Cognitive evaluation requires manual review.",
            }
            if not isinstance(raw, dict):
                return fallback

            normalized = dict(fallback)
            for key in normalized.keys():
                value = raw.get(key)
                if key in {"clarity", "depth_of_knowledge", "problem_solving", "logical_thinking", "adaptability", "confidence"}:
                    try:
                        normalized[key] = int(max(0, min(100, float(value))))
                    except (TypeError, ValueError):
                        normalized[key] = fallback[key]
                else:
                    text = str(value or "").strip()
                    normalized[key] = text if text else fallback[key]
            return normalized

        cognitive_insights = _normalize_cognitive_insights(report_data.get("cognitive_insights"))

        # Build qa_blocks from interview-only scores
        qa_blocks = []
        for idx, score in enumerate(interview_scores, 1):
            q_text = score.get("question", "").strip()
            overall_score = round(score.get("overall", 0), 1)
            qa_blocks.append({
                "q": idx,
                "question": q_text or f"Question {idx}",
                "title": q_text or f"Question {idx}",
                "answer": score.get("answer", ""),
                "score": f"{overall_score}/10",
                "score_breakdown": {
                    "clarity":    score.get("clarity",    0),
                    "depth":      score.get("depth",      0),
                    "fluency":    score.get("fluency",    0),
                    "confidence": score.get("confidence", 0),
                },
                "signals":  score.get("signals", []),
                "concerns": score.get("concerns", []),
            })

        # Keep the full turn-by-turn record, including warmup turns, so the UI
        # can show all interview turns instead of stopping at interview-only rows.
        qa_blocks_all = []
        for idx, score in enumerate(answer_scores, 1):
            q_text = score.get("question", "").strip()
            overall_score = round(float(score.get("overall", 0) or 0), 1)
            qa_blocks_all.append({
                "q": idx,
                "question": q_text or f"Question {idx}",
                "title": q_text or f"Question {idx}",
                "answer": score.get("answer", ""),
                "score": f"{overall_score}/10",
                "score_breakdown": {
                    "clarity":    score.get("clarity",    0),
                    "depth":      score.get("depth",      0),
                    "fluency":    score.get("fluency",    0),
                    "confidence": score.get("confidence", 0),
                },
                "signals":  score.get("signals", []),
                "concerns": score.get("concerns", []),
                "is_warmup": bool(score.get("is_warmup", False)),
            })

        def _normalize_ai_text(value: Any) -> str:
            text = str(value or "")
            return (
                text.replace("Ã¢â‚¬â€", "—")
                .replace("â€”", "—")
                .replace("Ã¢â‚¬â€œ", "–")
                .replace("â€“", "–")
                .replace("Ã¢â‚¬Å“", "“")
                .replace("â€œ", "“")
                .replace("Ã¢â‚¬Â", "”")
                .replace("â€", "”")
                .replace("Ã¢â‚¬â„¢", "’")
                .replace("â€™", "’")
                .replace("Ã¢â‚¬Â¢", "•")
                .replace("â€¢", "•")
                .replace("Ã—", "×")
                .replace("ï¼š", ":")
                .replace("Â·", "·")
                .strip()
            )

        skills_covered = report_data.get("skills_covered", [])
        top_strengths = report_data.get("top_strengths", [])
        concerns = report_data.get("concerns", [])
        decision_note = _normalize_ai_text(report_data.get("decision_note", ""))
        role_fit = int(min(100, max(0, report_data.get("role_fit", 0))))

        # Convert skills_covered and skill_ratings into structured skills_proof objects expected by frontend
        skill_ratings = report_data.get("skill_ratings", {})
        noise_signal_names = {
            "ownership_ambiguity",
            "example_evasion",
            "resume_claim_mismatch",
            "follow_up_collapse",
            "latency_mismatch",
            "complexity_latency_mismatch",
            "ownership_clarified",
            "example_given",
            "contradiction",
            "contradiction_resolved",
            "depth_decay",
            "strong_under_pressure",
        }

        def _is_noise_signal_skill(value: str) -> bool:
            normalized = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
            return normalized in noise_signal_names

        skills_index: list[str] = []
        for skill_name in list(skills_covered or []) + list(skill_ratings.keys()):
            clean = str(skill_name or "").strip()
            if clean and not _is_noise_signal_skill(clean) and clean not in skills_index:
                skills_index.append(clean)
        skills_covered = skills_index
        skills_proof = []
        for s in skills_index:
            rating_val = skill_ratings.get(s)
            rating = None
            if rating_val is not None:
                try:
                    rating = int(rating_val)
                except (ValueError, TypeError):
                    rating = None

            score = "—"
            status = "NOT TESTED"
            if rating is not None:
                score = f"{rating}/10"
                status = "PROVED" if rating >= 7 else "PARTIAL" if rating >= 4 else "NOT PROVED"

            skills_proof.append({
                "skill": s,
                "status": status,
                "score": score,
                "what_they_showed": "",
                "what_was_missing": ""
            })

        skill_ratings_report = {
            "technical_score": technical_score,
            "role_fit": role_fit,
            "decision_note": decision_note,
            "scores": {
                "technical": technical_score,
                "role_fit": role_fit,
                "combined_score": int(round((technical_score + communication_score + role_fit) / 3)),
                "communication_breakdown": comm_scores,
            },
            "skills_proof": skills_proof,
            "skill_ratings": {k: v for k, v in skill_ratings.items() if not _is_noise_signal_skill(k)},
            "top_strengths": [
                _normalize_ai_text(item)
                for item in top_strengths
                if isinstance(item, str) and item.strip()
            ] if isinstance(top_strengths, list) else [],
            "concerns": [
                _normalize_ai_text(item)
                for item in concerns
                if isinstance(item, str) and item.strip()
            ] if isinstance(concerns, list) else [],
            "verdict": {
                "summary": (
                    f"Technical score: {technical_score}%. "
                    f"Role fit (JD): {role_fit}%. "
                    f"Communication: {communication_score}/100. "
                    f"{len(skills_covered)} skill(s) assessed. "
                    f"{_normalize_ai_text(behavioral_report.get('summary', ''))}"
                )
            },
        }
        # Save to database
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE "Interview"
                SET "skillRatings" = $1,
                    "communicationScore" = $2,
                    "cognitiveInsights" = $3,
                    "behavioralSignalsAnalysis" = $4
                WHERE "applicationId" = $5
                """,
                json.dumps(skill_ratings_report),
                communication_score,
                json.dumps(cognitive_insights),
                json.dumps(behavioral_report),
                app_id,
            )
        logger.info(f"[REPORT] Generated skill report for {app_id}: score={technical_score}, skills={len(report_data.get('skills_covered', []))}")
    except Exception as e:
        logger.error(f"[REPORT] Generation failed for {app_id}: {e}", exc_info=True)

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
    """Merge a manual LLM usage record for a given feature into the org billing dict.
    Delegates to merge_feature_billing (Pydantic-based). Removes dead 'general' fallback.
    """
    _VALID_FEATURES = {"interview", "resumeExtraction", "jdExtraction", "chatbot", "interviewReport", "resumeReport"}
    if feature not in _VALID_FEATURES:
        feature = "interview"  # safe fallback — 'general' is removed
    model_name = str(usage.get("model", "unknown") or "unknown")
    session_summary = {
        "llm": {
            "sessions": 1,
            "totals": {
                "inputTokens": int(usage.get("inputTokens", 0) or 0),
                "inputCachedTokens": int(usage.get("cachedInputTokens", 0) or 0),
                "outputTokens": int(usage.get("outputTokens", 0) or 0),
                "sessionDuration": float(usage.get("sessionDuration", 0) or 0),
            },
            "byModel": {
                f"openai:{model_name}": {
                    "provider": "openai",
                    "model": model_name,
                    "inputTokens": int(usage.get("inputTokens", 0) or 0),
                    "inputCachedTokens": int(usage.get("cachedInputTokens", 0) or 0),
                    "outputTokens": int(usage.get("outputTokens", 0) or 0),
                    "sessionDuration": float(usage.get("sessionDuration", 0) or 0),
                }
            },
        },
        "tts": {"sessions": 0, "totals": {}, "byModel": {}},
        "stt": {"sessions": 0, "totals": {}, "byModel": {}},
    }
    return merge_feature_billing(existing, feature, session_summary)
