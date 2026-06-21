"""
agent_persistence.py -- Production-level interview data persistence layer.
Architecture (4 layers):
  1. DatabasePool         -- singleton asyncpg pool with health-check
  2. Domain Models        -- Pydantic typed models for DB + LLM responses
  3. BillingEngine        -- Strategy pattern for multi-provider cost estimation
  4. InterviewRepository  -- thin async DB wrappers, no business logic

Report pipeline (LangGraph + LLM calls) lives in interview/report_pipeline.py.
External contracts (agent_runtime.py imports) are preserved exactly.
"""
from __future__ import annotations
import asyncio
import json
import os
import time
from dataclasses import dataclass
from typing import Any, ClassVar, Literal, Optional, Protocol
import asyncpg
from pydantic import BaseModel, Field, field_validator
from typing_extensions import TypedDict
from urllib.parse import parse_qsl, urlencode, urlunparse, urlparse
from livekit.agents.metrics import AgentSessionUsage
from interview.agent_utils import _coerce_jsonish
from interview.agent_runtime_support import (
    DATABASE_URL,
    FIXED_INTERVIEW_DURATION_MINUTES,
    LLM_MODEL,
    _DB_POOL,
    _DB_POOL_INIT_TASK,
    _PENDING_MANUAL_BILLING,
    logger,
)

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 1 -- DatabasePool singleton
# ═══════════════════════════════════════════════════════════════════════════════
class DatabasePool:
    """Async singleton wrapper around asyncpg.Pool with lazy init and health-check."""
    _pool: ClassVar[asyncpg.Pool | None] = None
    _init_task: ClassVar[asyncio.Task | None] = None
    _lock: ClassVar[asyncio.Lock | None] = None
    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._lock is None:
            cls._lock = asyncio.Lock()
        return cls._lock
    @classmethod
    def normalize_dsn(cls, conn_str: str) -> str:
        if conn_str.startswith("postgres://"):
            conn_str = conn_str.replace("postgres://", "postgresql://", 1)
        parsed = urlparse(conn_str)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        for key in ("pgbouncer", "connection_limit", "pool_timeout", "schema"):
            query.pop(key, None)
        return urlunparse(parsed._replace(query=urlencode(query)))
    @classmethod
    async def _create(cls) -> asyncpg.Pool:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not set")
        async def _init_conn(conn: asyncpg.Connection) -> None:
            await conn.execute("SET statement_timeout = '30s'")
        return await asyncpg.create_pool(
            cls.normalize_dsn(DATABASE_URL),
            ssl=False,
            statement_cache_size=0,
            min_size=1,
            max_size=5,
            max_inactive_connection_lifetime=60.0,
            init=_init_conn,
        )
    @classmethod
    async def _is_healthy(cls, pool: asyncpg.Pool) -> bool:
        if pool._closed:
            return False
        try:
            async with pool.acquire(timeout=2.0) as conn:
                await conn.fetchval("SELECT 1")
            return True
        except Exception:
            return False
    @classmethod
    async def get(cls) -> asyncpg.Pool:
        global _DB_POOL, _DB_POOL_INIT_TASK
        if cls._pool is not None and not cls._pool._closed:
            return cls._pool
        async with cls._get_lock():
            if cls._pool is not None and not cls._pool._closed:
                if await cls._is_healthy(cls._pool):
                    return cls._pool
                try:
                    await cls._pool.close()
                except Exception:
                    pass
                cls._pool = None
                cls._init_task = None
                cls._lock = None  # reset for current event loop
            if cls._init_task is not None and not cls._init_task.done():
                cls._pool = await cls._init_task
                return cls._pool
            cls._pool = None
            cls._init_task = asyncio.create_task(cls._create())
            try:
                cls._pool = await cls._init_task
                _DB_POOL = cls._pool  # keep module-level ref in sync
                return cls._pool
            except Exception:
                cls._init_task = None
                raise
# Public aliases (preserve agent_runtime.py imports)
async def get_db_pool() -> asyncpg.Pool:
    return await DatabasePool.get()
async def _create_db_pool() -> asyncpg.Pool:
    return await DatabasePool._create()
def normalize_postgres_dsn(conn_str: str) -> str:
    return DatabasePool.normalize_dsn(conn_str)
# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 2 -- Domain / Pydantic Models
# ═══════════════════════════════════════════════════════════════════════════════
# -- LLM Response Models ------------------------------------------------------
class SkillRating(BaseModel):
    topic:    str
    score:    int = Field(default=5, ge=1, le=10)
    status:   Literal["PROVED", "PARTIAL", "NOT_PROVED"] = "PARTIAL"
    evidence: str = ""
    gaps:     str = ""
    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, v: Any) -> str:
        s = str(v or "").upper()
        return s if s in {"PROVED", "PARTIAL", "NOT_PROVED"} else "PARTIAL"
    @field_validator("score", mode="before")
    @classmethod
    def _clamp_score(cls, v: Any) -> int:
        try:
            return max(1, min(10, int(round(float(v)))))
        except (TypeError, ValueError):
            return 5
class LLMEvalDimension(BaseModel):
    score:    int = Field(default=0, ge=0, le=100)
    evidence: str = ""
    @field_validator("score", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(0, min(100, int(round(float(v)))))
        except (TypeError, ValueError):
            return 0
class LLMEvalResponse(BaseModel):
    communication:            LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    technical_knowledge:      LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    resume_credibility:       LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    problem_solving:          LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    clarity_of_thought:       LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    strengths:                list[str] = Field(default_factory=list)
    concerns:                 list[str] = Field(default_factory=list)
class LLMSkillEntry(BaseModel):
    skill:    str = ""
    score:    int = Field(default=5, ge=1, le=10)
    evidence: str = ""
    @field_validator("score", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(1, min(10, int(round(float(v)))))
        except (TypeError, ValueError):
            return 5
class LLMSkillsResponse(BaseModel):
    skills: list[LLMSkillEntry] = Field(default_factory=list)
# -- Billing Models (unchanged from existing Pydantic classes) -----------------
class _ModelBilling(BaseModel):
    provider:        str   = "unknown"
    model:           str   = "unknown"
    runs:            int   = 0
    inputTokens:     int   = 0
    cachedInputTokens: int = 0
    outputTokens:    int   = 0
    sessionDuration: float = 0.0
    costUsd:         float = 0.0
    characters:      int   = 0
    audioSeconds:    float = 0.0
class _FeatureBilling(BaseModel):
    runs:             int   = 0
    inputTokens:      int   = 0
    cachedInputTokens:int   = 0
    outputTokens:     int   = 0
    sessionDuration:  float = 0.0
    costUsd:          float = 0.0
    ttsRuns:          int   = 0
    ttsCharacters:    int   = 0
    ttsCostUsd:       float = 0.0
    sttRuns:          int   = 0
    sttAudioSeconds:  float = 0.0
    sttCostUsd:       float = 0.0
    byModel:          dict[str, _ModelBilling] = Field(default_factory=dict)
    ttsByModel:       dict[str, _ModelBilling] = Field(default_factory=dict)
    sttByModel:       dict[str, _ModelBilling] = Field(default_factory=dict)
class _OrgBilling(BaseModel):
    interview:       _FeatureBilling = Field(default_factory=_FeatureBilling)
    resumeExtraction:_FeatureBilling = Field(default_factory=_FeatureBilling)
    jdExtraction:    _FeatureBilling = Field(default_factory=_FeatureBilling)
    chatbot:         _FeatureBilling = Field(default_factory=_FeatureBilling)
    interviewReport: _FeatureBilling = Field(default_factory=_FeatureBilling)
    resumeReport:    _FeatureBilling = Field(default_factory=_FeatureBilling)
# -- LangGraph State -----------------------------------------------------------
class ReportState(TypedDict, total=False):
    # Inputs
    app_id:           str
    transcript_lines: list[str]
    interview_scores: list[dict]
    all_scores:       list[dict]
    job_title:        str
    proctoring_data:  dict | None
    org_id:           str | None
    llm_model:        str
    jd_json:          dict | None
    topic_records:    list[dict]   # per-topic ground-truth from agent MOVE_ON
    # Computed by nodes
    integrity_result: dict
    signal_context:   str
    jd_context:       str
    eval_result:      LLMEvalResponse
    skills_result:    LLMSkillsResponse
    # Final outputs
    scores_context:   dict | None
# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 3 -- Billing Engine (Strategy Pattern)
# ═══════════════════════════════════════════════════════════════════════════════
_BILLING_INR_PER_USD = float(os.environ.get("BILLING_INR_PER_USD", "83.0"))
_OPENAI_MODEL_RATES: dict[str, dict[str, float]] = {
    "gpt-5.4-mini": {"input": 0.75,  "cached_input": 0.075, "output": 4.5},
    "gpt-4o-mini":  {"input": 0.15,  "cached_input": 0.075, "output": 0.6},
    "gpt-4.1-mini": {"input": 0.4,   "cached_input": 0.1,   "output": 1.6},
    "gpt-4o":       {"input": 2.5,   "cached_input": 1.25,  "output": 10.0},
    "gpt-4.1":      {"input": 2.0,   "cached_input": 0.5,   "output": 8.0},
}
_SARVAM_TTS_INR_PER_10K: dict[str, float] = {"bulbul:v3": 30.0, "bulbul:v2": 15.0}
_CARTESIA_TTS_USD_PER_M: dict[str, float] = {
    "sonic-3": 15.0, "sonic-2": 15.0, "sonic": 15.0,
    "sonic-3-hd": 30.0, "sonic-2-hd": 30.0, "sonic-hd": 30.0,
}
_CARTESIA_TTS_DEFAULT = float(os.environ.get("CARTESIA_TTS_USD_PER_MILLION_CHARS", "15.0"))
_ELEVENLABS_TTS_USD_PER_M: dict[str, float] = {
    "eleven_flash_v2": 50.0, "eleven_flash_v2_5": 50.0,
    "eleven_turbo_v2": 50.0, "eleven_turbo_v2_5": 50.0,
    "eleven_multilingual_v2": 100.0, "eleven_multilingual_v3": 100.0,
}
_ELEVENLABS_TTS_DEFAULT = float(os.environ.get("ELEVENLABS_TTS_USD_PER_MILLION_CHARS", "100.0"))
_SARVAM_STT_INR_PER_HOUR: dict[str, float] = {"saaras:v3": 30.0}
_DEEPGRAM_STT_USD_PER_MIN: dict[str, float] = {
    "nova-3":             0.0048,
    "nova-2":             0.0043,
    "flux-general-en":    0.0065,
    "flux-general-multi": 0.0078,
}
# Usage bucket field mapping (unchanged -- referenced by summarize_session_usage)
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
    "llm_usage": "llm", "tts_usage": "tts",
    "stt_usage": "stt", "interruption_usage": "interruption",
}
class _CostStrategy(Protocol):
    def tts_cost(self, model: str, chars: int) -> float: ...
    def stt_cost(self, model: str, seconds: float) -> float: ...
@dataclass(frozen=True)
class _SarvamStrategy:
    def tts_cost(self, model: str, chars: int) -> float:
        rate = _SARVAM_TTS_INR_PER_10K.get(model, _SARVAM_TTS_INR_PER_10K["bulbul:v3"])
        return (chars / 10_000.0) * rate / max(_BILLING_INR_PER_USD, 1e-6)
    def stt_cost(self, model: str, seconds: float) -> float:
        rate = _SARVAM_STT_INR_PER_HOUR.get(model, _SARVAM_STT_INR_PER_HOUR["saaras:v3"])
        return (seconds / 3600.0) * rate / max(_BILLING_INR_PER_USD, 1e-6)
@dataclass(frozen=True)
class _CartesiaStrategy:
    def tts_cost(self, model: str, chars: int) -> float:
        rate = _CARTESIA_TTS_USD_PER_M.get(model, _CARTESIA_TTS_DEFAULT)
        return (chars / 1_000_000.0) * rate
    def stt_cost(self, model: str, seconds: float) -> float:
        return 0.0
@dataclass(frozen=True)
class _ElevenLabsStrategy:
    def tts_cost(self, model: str, chars: int) -> float:
        rate = _ELEVENLABS_TTS_USD_PER_M.get(model, _ELEVENLABS_TTS_DEFAULT)
        return (chars / 1_000_000.0) * rate
    def stt_cost(self, model: str, seconds: float) -> float:
        return 0.0
@dataclass(frozen=True)
class _DeepgramStrategy:
    def tts_cost(self, model: str, chars: int) -> float:
        return 0.0
    def stt_cost(self, model: str, seconds: float) -> float:
        rate = _DEEPGRAM_STT_USD_PER_MIN.get(model, _DEEPGRAM_STT_USD_PER_MIN["flux-general-en"])
        return (seconds / 60.0) * rate
_PROVIDER_REGISTRY: dict[str, _CostStrategy] = {
    "SARVAM":     _SarvamStrategy(),
    "CARTESIA":   _CartesiaStrategy(),
    "ELEVENLABS": _ElevenLabsStrategy(),
    "DEEPGRAM":   _DeepgramStrategy(),
}
def _normalize_openai_model(model_name: str) -> str:
    """Strip date/version suffixes so 'gpt-4.1-mini-2025-04-14' matches 'gpt-4.1-mini'."""
    import re as _re
    m = model_name.strip().lower()
    m = _re.sub(r"-\d{4}-\d{2}-\d{2}$", "", m)
    m = _re.sub(r":\d{4}-\d{2}-\d{2}$", "", m)
    return m
def _normalize_tts_model_name(model_name: str) -> str:
    return str(model_name or "").strip().lower()
def _normalize_stt_model_name(model_name: str) -> str:
    return str(model_name or "").strip().lower()
def _estimate_openai_cost(model_name: str, input_tokens: int, cached_tokens: int, output_tokens: int) -> float:
    rates = _OPENAI_MODEL_RATES.get(_normalize_openai_model(model_name))
    if not rates:
        raise ValueError(f"Missing OpenAI pricing for model {model_name!r}")
    input_tokens  = max(0, int(input_tokens  or 0))
    output_tokens = max(0, int(output_tokens or 0))
    cached_tokens = max(0, min(int(cached_tokens or 0), input_tokens))
    uncached      = max(0, input_tokens - cached_tokens)
    return (
        (uncached       / 1_000_000.0) * rates["input"]
        + (cached_tokens / 1_000_000.0) * rates["cached_input"]
        + (output_tokens / 1_000_000.0) * rates["output"]
    )
def _estimate_tts_cost_usd(provider_name: str, model_name: str, characters: int) -> float:
    chars = max(0, int(characters or 0))
    if chars <= 0:
        return 0.0
    provider = str(provider_name or "").strip().upper()
    model    = _normalize_tts_model_name(model_name)
    for pfx in ("cartesia/", "elevenlabs/"):
        if model.startswith(pfx):
            model = model[len(pfx):]
    strategy = _PROVIDER_REGISTRY.get(provider)
    return strategy.tts_cost(model, chars) if strategy else 0.0
def _estimate_stt_cost_usd(provider_name: str, model_name: str, audio_seconds: float) -> float:
    seconds = max(0.0, float(audio_seconds or 0.0))
    if seconds <= 0:
        return 0.0
    provider = str(provider_name or "").strip().upper()
    model    = _normalize_stt_model_name(model_name)
    strategy = _PROVIDER_REGISTRY.get(provider)
    return strategy.stt_cost(model, seconds) if strategy else 0.0
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
        provider  = str(getattr(item, "provider", "") or "").strip().upper()
        model     = str(getattr(item, "model", "")    or "").strip()
        if not provider or not model:
            raise ValueError(f"Cannot summarize {kind} usage without provider and model")
        model_key = f"{provider}:{model}"
        bucket    = summary[kind]
        bucket["sessions"] = 1
        model_bucket = bucket["byModel"].setdefault(
            model_key,
            {"provider": provider, "model": model, "sessions": 0,
             **{pub: 0 for _, pub in _USAGE_BUCKET_FIELDS[kind]}},
        )
        model_bucket["sessions"] = 1
        for src, pub in _USAGE_BUCKET_FIELDS[kind]:
            v = getattr(item, src, 0) or 0
            bucket["totals"][pub]  += v
            model_bucket[pub]      += v
    for kind in seen_kinds:
        summary[kind]["sessions"] = 1
    return summary
def _replace_component_usage_from_plugin_metrics(
    session_summary: dict[str, Any],
    *,
    tts_provider: Optional[str] = None,
    tts_model: Optional[str] = None,
    tts_characters: int = 0,
    tts_audio_seconds: float = 0.0,
    stt_provider: Optional[str] = None,
    stt_model: Optional[str] = None,
    stt_audio_seconds: float = 0.0,
) -> dict[str, Any]:
    """Use LiveKit per-plugin metrics as the source of truth for STT/TTS usage."""
    summary = session_summary
    if int(tts_characters or 0) > 0:
        provider = str(tts_provider or "").strip().upper()
        model = str(tts_model or "").strip()
        if not provider or not model:
            raise ValueError("Cannot record TTS usage without provider and model")
        key = f"{provider}:{model}"
        summary["tts"] = {
            "sessions": 1,
            "totals": {
                "inputTokens": 0,
                "outputTokens": 0,
                "charactersCount": int(tts_characters),
                "audioDuration": float(tts_audio_seconds or 0.0),
            },
            "byModel": {
                key: {
                    "provider": provider,
                    "model": model,
                    "sessions": 1,
                    "inputTokens": 0,
                    "outputTokens": 0,
                    "charactersCount": int(tts_characters),
                    "audioDuration": float(tts_audio_seconds or 0.0),
                }
            },
        }
    if float(stt_audio_seconds or 0.0) > 0:
        provider = str(stt_provider or "").strip().upper()
        model = str(stt_model or "").strip()
        if not provider or not model:
            raise ValueError("Cannot record STT usage without provider and model")
        key = f"{provider}:{model}"
        summary["stt"] = {
            "sessions": 1,
            "totals": {
                "inputTokens": 0,
                "outputTokens": 0,
                "audioDuration": float(stt_audio_seconds),
            },
            "byModel": {
                key: {
                    "provider": provider,
                    "model": model,
                    "sessions": 1,
                    "inputTokens": 0,
                    "outputTokens": 0,
                    "audioDuration": float(stt_audio_seconds),
                }
            },
        }
    return summary
def _merge_llm_into_bucket(bucket: _FeatureBilling, llm_totals: dict, llm_by_model: dict) -> None:
    """Merge LLM usage from a session into a feature bucket using O(1) hash lookups."""
    has_llm_totals = any(int(llm_totals.get(key, 0) or 0) > 0 for key in ("inputTokens", "inputCachedTokens", "outputTokens", "sessionDuration"))
    if not llm_by_model and not has_llm_totals:
        return
    bucket.runs          += 1
    bucket.inputTokens   += int(llm_totals.get("inputTokens",    0) or 0)
    bucket.cachedInputTokens += int(llm_totals.get("inputCachedTokens", 0) or 0)
    bucket.outputTokens  += int(llm_totals.get("outputTokens",   0) or 0)
    bucket.sessionDuration += float(llm_totals.get("sessionDuration", 0) or 0)
    session_cost = 0.0
    for model_key, raw in llm_by_model.items():
        row       = _coerce_jsonish(raw)
        provider  = str(row.get("provider", "") or "").strip().upper()
        model_name = str(row.get("model", "") or "").strip()
        if not provider or not model_name:
            raise ValueError("Cannot merge OpenAI billing without provider and model")
        input_t   = int(row.get("inputTokens",    0) or 0)
        cached_t  = int(row.get("inputCachedTokens", 0) or 0)
        output_t  = int(row.get("outputTokens",   0) or 0)
        session_dur = float(row.get("sessionDuration", 0) or 0)
        cost      = _estimate_openai_cost(model_name, input_t, cached_t, output_t)
        session_cost += cost
        mb = bucket.byModel.setdefault(
            model_key,
            _ModelBilling(provider=provider, model=model_name),
        )
        mb.runs += 1; mb.inputTokens += input_t; mb.cachedInputTokens += cached_t
        mb.outputTokens += output_t; mb.sessionDuration += session_dur; mb.costUsd += cost
    bucket.costUsd += session_cost
def _merge_tts_into_bucket(
    bucket: _FeatureBilling,
    tts_by_model: dict,
    tts_total_chars: int,
    _provider_hint: str,
    _model_hint: str,
) -> None:
    session_chars, session_cost = 0, 0.0
    if tts_total_chars > 0 and not tts_by_model:
        raise ValueError("Cannot merge TTS usage without per-model source data")
    for _, raw in tts_by_model.items():
        row      = _coerce_jsonish(raw)
        provider = str(row.get("provider", "") or "").strip().upper()
        model    = str(row.get("model",    "") or "").strip()
        if not provider or not model:
            raise ValueError("Cannot merge TTS usage without provider and model")
        chars = int(row.get("charactersCount", 0) or row.get("inputTokens", 0) or 0)
        if chars <= 0:
            continue
        session_chars += chars
        cost = _estimate_tts_cost_usd(provider, model, chars)
        session_cost += cost
        key = f"{provider.lower()}:{_normalize_tts_model_name(model)}"
        mb  = bucket.ttsByModel.setdefault(key, _ModelBilling(provider=provider, model=model))
        mb.runs += 1; mb.characters += chars; mb.costUsd += cost
    if session_chars > 0:
        bucket.ttsRuns += 1
        bucket.ttsCharacters += session_chars
        bucket.ttsCostUsd    += session_cost
def _merge_stt_into_bucket(
    bucket: _FeatureBilling,
    stt_by_model: dict,
    stt_total_seconds: float,
    _provider_hint: str,
    _model_hint: str,
) -> None:
    session_secs, session_cost = 0.0, 0.0
    if stt_total_seconds > 0 and not stt_by_model:
        raise ValueError("Cannot merge STT usage without per-model source data")
    for _, raw in stt_by_model.items():
        row      = _coerce_jsonish(raw)
        provider = str(row.get("provider", "") or "").strip().upper()
        model    = str(row.get("model",    "") or "").strip()
        if not provider or not model:
            raise ValueError("Cannot merge STT usage without provider and model")
        secs = float(row.get("audioDuration", 0) or 0.0)
        if secs <= 0:
            continue
        session_secs += secs
        cost = _estimate_stt_cost_usd(provider, model, secs)
        session_cost += cost
        key = f"{provider.lower()}:{_normalize_stt_model_name(model)}"
        mb  = bucket.sttByModel.setdefault(key, _ModelBilling(provider=provider, model=model))
        mb.runs += 1; mb.audioSeconds += secs; mb.costUsd += cost
    if session_secs > 0:
        bucket.sttRuns        += 1
        bucket.sttAudioSeconds += session_secs
        bucket.sttCostUsd     += session_cost
def merge_feature_billing(
    existing: dict[str, Any],
    feature:  str,
    session_summary: dict[str, Any],
    tts_config: Optional[dict[str, Any]] = None,
    stt_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Pydantic-based billing merger for any of the 6 supported features."""
    merged = dict(existing)
    org    = _OrgBilling.model_validate(_coerce_jsonish(merged.get("billing")))
    bucket: _FeatureBilling = getattr(org, feature)
    llm_summary = _coerce_jsonish(session_summary.get("llm"))
    llm_totals  = _coerce_jsonish(llm_summary.get("totals"))
    llm_by_model = _coerce_jsonish(llm_summary.get("byModel"))
    tts_summary = _coerce_jsonish(session_summary.get("tts"))
    tts_totals  = _coerce_jsonish(tts_summary.get("totals"))
    tts_by_model = _coerce_jsonish(tts_summary.get("byModel"))
    stt_summary = _coerce_jsonish(session_summary.get("stt"))
    stt_totals  = _coerce_jsonish(stt_summary.get("totals"))
    stt_by_model = _coerce_jsonish(stt_summary.get("byModel"))
    tts_total_chars   = int(tts_totals.get("charactersCount", 0) or tts_totals.get("inputTokens", 0) or 0)
    stt_total_seconds = float(stt_totals.get("audioDuration", 0) or 0.0)
    llm_has_usage = bool(llm_by_model) or any(
        int(llm_totals.get(key, 0) or 0) > 0
        for key in ("inputTokens", "inputCachedTokens", "outputTokens", "sessionDuration")
    )
    tts_has_usage = bool(tts_by_model) or tts_total_chars > 0
    stt_has_usage = bool(stt_by_model) or stt_total_seconds > 0
    if not llm_has_usage and not tts_has_usage and not stt_has_usage:
        merged["billing"] = org.model_dump()
        return merged
    if llm_has_usage:
        _merge_llm_into_bucket(bucket, llm_totals, llm_by_model)
    tts_cfg = tts_config or {}
    _merge_tts_into_bucket(
        bucket, tts_by_model, tts_total_chars,
        str(tts_cfg.get("provider", "") or "").strip().upper(),
        str(tts_cfg.get("model",    "") or "").strip(),
    )
    stt_cfg = stt_config or {}
    _merge_stt_into_bucket(
        bucket, stt_by_model, stt_total_seconds,
        str(stt_cfg.get("provider", "") or "").strip().upper(),
        str(stt_cfg.get("model",    "") or "").strip(),
    )
    merged["billing"] = org.model_dump()
    return merged
def merge_interview_billing(
    existing: dict[str, Any],
    session_summary: dict[str, Any],
    tts_config: Optional[dict[str, Any]] = None,
    stt_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Backward-compat alias -- delegates to merge_feature_billing for 'interview'."""
    return merge_feature_billing(existing, "interview", session_summary, tts_config, stt_config)
# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 4 -- Interview Persistence (thin async DB wrappers)
# ═══════════════════════════════════════════════════════════════════════════════
async def persist_org_manual_billing_usage(org_id: Optional[str], feature: str, usage: dict[str, Any]) -> None:
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
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    'SELECT COALESCE("usageMetrics", \'{}\'::jsonb) AS "usageMetrics" FROM "Organization" WHERE id = $1 FOR UPDATE',
                    org_id,
                )
                if not row:
                    return
                merged = _coerce_jsonish(row["usageMetrics"])
                for feature, usage in pending:
                    merged = merge_manual_billing_usage(merged, feature, usage)
                await conn.execute(
                    'UPDATE "Organization" SET "usageMetrics" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
                    json.dumps(merged), org_id,
                )
        logger.info(f"[USAGE] Flushed {len(pending)} manual billing entries for {org_id}")
    except Exception as e:
        logger.error(f"[USAGE] Failed to flush manual billing for {org_id}: {e}")
        raise
async def persist_org_usage_metrics(
    org_id: Optional[str],
    session_usage: AgentSessionUsage | None,
    tts_provider: Optional[str] = None,
    tts_model: Optional[str] = None,
    stt_provider: Optional[str] = None,
    stt_model: Optional[str] = None,
    plugin_tts_characters: int = 0,
    plugin_tts_audio_seconds: float = 0.0,
    plugin_stt_audio_seconds: float = 0.0,
) -> None:
    has_plugin_usage = bool(plugin_tts_characters or plugin_tts_audio_seconds or plugin_stt_audio_seconds)
    if not org_id or not DATABASE_URL:
        return
    if session_usage is None and not has_plugin_usage:
        logger.info("[BILLING] persist_org_usage_metrics: no session_usage and no plugin metrics for org=%s — skipping", org_id)
        return
    session_summary = summarize_session_usage(session_usage)
    session_summary = _replace_component_usage_from_plugin_metrics(
        session_summary,
        tts_provider=tts_provider,
        tts_model=tts_model,
        tts_characters=plugin_tts_characters,
        tts_audio_seconds=plugin_tts_audio_seconds,
        stt_provider=stt_provider,
        stt_model=stt_model,
        stt_audio_seconds=plugin_stt_audio_seconds,
    )
    if not any(bucket.get("sessions") for bucket in session_summary.values()):
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    'SELECT COALESCE("usageMetrics", \'{}\'::jsonb) AS "usageMetrics" FROM "Organization" WHERE id = $1 FOR UPDATE',
                    org_id,
                )
                if not row:
                    logger.warning(f"[USAGE] No organization found for usage metrics save: {org_id}")
                    return
                existing_metrics = _coerce_jsonish(row["usageMetrics"])
                merged_metrics   = dict(existing_metrics)
                merged_livekit   = _coerce_jsonish(merged_metrics.get("livekit"))
                for kind, kind_summary in session_summary.items():
                    if not isinstance(kind_summary, dict):
                        continue
                    existing_bucket = _coerce_jsonish(merged_livekit.get(kind)) or _empty_usage_bucket(kind)
                    existing_bucket["sessions"] = int(existing_bucket.get("sessions", 0)) + int(kind_summary.get("sessions", 0))
                    existing_totals = existing_bucket.setdefault(
                        "totals", {pub: 0 for _, pub in _USAGE_BUCKET_FIELDS[kind]}
                    )
                    for _, pub in _USAGE_BUCKET_FIELDS[kind]:
                        existing_totals[pub] = existing_totals.get(pub, 0) + kind_summary.get("totals", {}).get(pub, 0)
                    existing_by_model = existing_bucket.setdefault("byModel", {})
                    for model_key, model_summary in kind_summary.get("byModel", {}).items():
                        provider = str(model_summary.get("provider", "") or "").strip().upper()
                        model = str(model_summary.get("model", "") or "").strip()
                        if not provider or not model:
                            raise ValueError(f"Cannot merge livekit usage for {kind} without provider and model")
                        cur = _coerce_jsonish(existing_by_model.get(model_key)) or {
                            "provider": provider,
                            "model":    model,
                            "sessions": 0,
                            **{pub: 0 for _, pub in _USAGE_BUCKET_FIELDS[kind]},
                        }
                        cur["sessions"] = int(cur.get("sessions", 0)) + int(model_summary.get("sessions", 0))
                        for _, pub in _USAGE_BUCKET_FIELDS[kind]:
                            cur[pub] = cur.get(pub, 0) + model_summary.get(pub, 0)
                        existing_by_model[model_key] = cur
                    existing_bucket["updatedAt"] = time.time()
                    merged_livekit[kind] = existing_bucket
                merged_metrics["livekit"]   = merged_livekit
                merged_metrics["updatedAt"] = time.time()
                merged_metrics = merge_interview_billing(
                    merged_metrics, session_summary,
                    tts_config={"provider": tts_provider or "", "model": tts_model or ""},
                    stt_config={"provider": stt_provider or "", "model": stt_model or ""},
                )
                await conn.execute(
                    'UPDATE "Organization" SET "usageMetrics" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
                    json.dumps(merged_metrics), org_id,
                )
        llm_t = session_summary["llm"]["totals"]
        logger.info(
            f"[USAGE] Saved LiveKit usage for org {org_id} "
            f"(llm={llm_t.get('inputTokens',0) + llm_t.get('outputTokens',0)} tokens, "
            f"stt={session_summary['stt']['totals'].get('audioDuration',0)}s, "
            f"tts={session_summary['tts']['totals'].get('audioDuration',0)}s)"
        )
    except Exception as e:
        logger.error(f"[USAGE] Failed to save org usage metrics for {org_id}: {e}")
        raise
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
    plugin_tts_characters: int = 0,
    plugin_tts_audio_seconds: float = 0.0,
    plugin_stt_audio_seconds: float = 0.0,
) -> None:
    if not app_id or not DATABASE_URL:
        return
    session_summary  = summarize_session_usage(session_usage)
    session_summary = _replace_component_usage_from_plugin_metrics(
        session_summary,
        tts_provider=tts_provider,
        tts_model=tts_model,
        tts_characters=plugin_tts_characters,
        tts_audio_seconds=plugin_tts_audio_seconds,
        stt_provider=stt_provider,
        stt_model=stt_model,
        stt_audio_seconds=plugin_stt_audio_seconds,
    )
    has_session_usage = any(bucket.get("sessions") for bucket in session_summary.values())
    has_manual_usage  = bool(org_id and _PENDING_MANUAL_BILLING.get(org_id))
    logger.info(
        "[BILLING] persist_interview_billing_snapshot: app=%s has_session=%s has_manual=%s "
        "duration=%.1f tts_chars=%d stt_secs=%.1f pending_manual=%d",
        app_id, has_session_usage, has_manual_usage,
        float(duration_seconds or 0),
        int(plugin_tts_characters or 0),
        float(plugin_stt_audio_seconds or 0),
        len(_PENDING_MANUAL_BILLING.get(org_id, [])) if org_id else 0,
    )
    # Always write if we have any signal at all: duration, TTS chars, STT, or tokens.
    # Never skip based on session_usage alone — our LLM calls bypass LiveKit's plugin
    # client so model_usage is always empty and has_session_usage is always False.
    has_any_signal = (
        has_session_usage
        or has_manual_usage
        or bool(duration_seconds)
        or int(plugin_tts_characters or 0) > 0
        or float(plugin_stt_audio_seconds or 0) > 0
    )
    if not has_any_signal:
        logger.warning("[BILLING] No billing signal at all for %s — skipping snapshot", app_id)
        return
    snapshot_billing  = merge_interview_billing(
        {}, session_summary,
        tts_config={"provider": tts_provider or "", "model": tts_model or ""},
        stt_config={"provider": stt_provider or "", "model": stt_model or ""},
    )
    interview_bucket = _coerce_jsonish(_coerce_jsonish(snapshot_billing.get("billing")).get("interview"))
    if org_id:
        manual_entries = _PENDING_MANUAL_BILLING.get(org_id, [])
        logger.info("[BILLING] Merging %d manual billing entries for org=%s", len(manual_entries), org_id)
        for feature, usage in manual_entries:
            if feature != "interview":
                continue
            model_name   = str(usage.get("model", "") or "").strip()
            if not model_name:
                raise ValueError("Cannot merge interview billing without model")
            input_tokens  = int(usage.get("inputTokens",    0) or 0)
            cached_tokens = int(usage.get("cachedInputTokens", 0) or 0)
            output_tokens = int(usage.get("outputTokens",   0) or 0)
            model_cost    = _estimate_openai_cost(model_name, input_tokens, cached_tokens, output_tokens)
            model_key     = f"openai:{model_name}"
            interview_bucket["runs"]             = int(interview_bucket.get("runs",             0)) + 1
            interview_bucket["inputTokens"]      = int(interview_bucket.get("inputTokens",      0)) + input_tokens
            interview_bucket["cachedInputTokens"]= int(interview_bucket.get("cachedInputTokens",0)) + cached_tokens
            interview_bucket["outputTokens"]     = int(interview_bucket.get("outputTokens",     0)) + output_tokens
            interview_bucket["costUsd"]          = float(interview_bucket.get("costUsd",        0.0)) + model_cost
            by_model = _coerce_jsonish(interview_bucket.get("byModel"))
            cur = _coerce_jsonish(by_model.get(model_key))
            cur["runs"]             = int(cur.get("runs",    0)) + 1
            cur["inputTokens"]      = int(cur.get("inputTokens",       0)) + input_tokens
            cur["cachedInputTokens"]= int(cur.get("cachedInputTokens", 0)) + cached_tokens
            cur["outputTokens"]     = int(cur.get("outputTokens",      0)) + output_tokens
            cur["costUsd"]          = float(cur.get("costUsd", 0.0)) + model_cost
            by_model[model_key]     = cur
            interview_bucket["byModel"] = by_model
    total_cost = (
        float(interview_bucket.get("costUsd",    0.0))
        + float(interview_bucket.get("ttsCostUsd", 0.0))
        + float(interview_bucket.get("sttCostUsd", 0.0))
    )
    snapshot = {
        "candidateName":   candidate_name or "",
        "jobTitle":        job_title or "",
        "interviewName":   f"{candidate_name or 'Candidate'} - {job_title or 'Interview'}",
        "durationSec":     int(duration_seconds or 0),
        "llmCostUsd":      float(interview_bucket.get("costUsd",        0.0)),
        "ttsCostUsd":      float(interview_bucket.get("ttsCostUsd",     0.0)),
        "sttCostUsd":      float(interview_bucket.get("sttCostUsd",     0.0)),
        "totalCostUsd":    total_cost,
        "inputTokens":     int(interview_bucket.get("inputTokens",      0)),
        "outputTokens":    int(interview_bucket.get("outputTokens",     0)),
        "cachedInputTokens":int(interview_bucket.get("cachedInputTokens",0)),
        "sessionDuration": float(interview_bucket.get("sessionDuration", 0)),
        "ttsCharacters":   int(interview_bucket.get("ttsCharacters",    0)),
        "sttAudioSeconds": float(interview_bucket.get("sttAudioSeconds", 0)),
        "llmByModel":      interview_bucket.get("byModel",   {}),
        "ttsByModel":      interview_bucket.get("ttsByModel", {}),
        "sttByModel":      interview_bucket.get("sttByModel", {}),
        "updatedAt":       time.time(),
    }
    logger.info(
        "[BILLING] Snapshot built: durationSec=%d llmCostUsd=%.6f ttsCostUsd=%.6f "
        "sttCostUsd=%.6f inputTokens=%d outputTokens=%d ttsChars=%d",
        int(duration_seconds or 0),
        float(interview_bucket.get("costUsd", 0.0)),
        float(interview_bucket.get("ttsCostUsd", 0.0)),
        float(interview_bucket.get("sttCostUsd", 0.0)),
        int(interview_bucket.get("inputTokens", 0)),
        int(interview_bucket.get("outputTokens", 0)),
        int(interview_bucket.get("ttsCharacters", 0)),
    )
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                'SELECT i.id, COALESCE(i."billingSnapshot", \'{}\'::jsonb) AS "billingSnapshot" FROM "Interview" i JOIN "Application" a ON a.id = i."applicationId" WHERE a.id = $1 LIMIT 1',
                app_id,
            )
            if not row:
                logger.error("[BILLING] No Interview row found for app_id=%s — billing snapshot lost", app_id)
                return
            existing_snapshot = _coerce_jsonish(row["billingSnapshot"])
            persisted_snapshot = {**existing_snapshot, **snapshot}
            if existing_snapshot.get("billedAt") is not None:
                persisted_snapshot["billedAt"] = existing_snapshot.get("billedAt")
            persisted_snapshot["costSource"] = "exact"
            await conn.execute(
                'UPDATE "Interview" SET "billingSnapshot" = $1::jsonb, "updatedAt" = NOW() WHERE "applicationId" = $2',
                json.dumps(persisted_snapshot), app_id,
            )
        logger.info(
            "[BILLING] Saved interview billing snapshot for %s | totalCostUsd=%.6f inputTokens=%d outputTokens=%d",
            app_id, float(persisted_snapshot.get("totalCostUsd", 0.0)),
            int(persisted_snapshot.get("inputTokens", 0)),
            int(persisted_snapshot.get("outputTokens", 0)),
        )
    except Exception as e:
        logger.error(f"[USAGE] Failed to save interview billing snapshot for {app_id}: {e}")
        raise
def _build_jd_from_extracted(extracted_json: str | None) -> str:
    if not extracted_json:
        return ""
    try:
        data  = json.loads(extracted_json) if isinstance(extracted_json, str) else extracted_json
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
async def get_interview_context(app_id: str) -> dict:
    """Fetch candidate and JD context from PostgreSQL via asyncpg (5-attempt retry)."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    _QUERY = """
    SELECT a."fullName", a."resumeText", a."resumeData", d.title, d.role AS "role",
           d."extractedDetails", d."screeningCriteria", d."orgId" AS "orgId",
           d.location AS "driveLocation", d."interviewLanguage", d."interviewQuestions",
           COALESCE(d."voiceId", o."voiceId") AS "voiceId",
           COALESCE(d."aiName", 'Ishitha') AS "aiName", o.name AS "orgName", NULL::text AS "orgLocation",
           o."deepgramModel", o."proctoringSignals",
           ev.provider AS "voiceProvider", ev.model AS "voiceModel",
           i.status AS "interviewStatus"
    FROM "Application" a
    JOIN "Drive" d ON a."driveId" = d.id
    LEFT JOIN "Organization" o ON d."orgId" = o.id
    LEFT JOIN "EngineVoice" ev ON ev.id = COALESCE(d."voiceId", o."voiceId")
    LEFT JOIN "Interview" i ON i."applicationId" = a.id
    WHERE a.id = $1
    LIMIT 1
    """
    last_error: Exception | None = None
    for attempt in range(1, 6):
        try:
            pool = await DatabasePool.get()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(_QUERY, app_id)
            if not row:
                raise RuntimeError(f"No interview context found in DB for application {app_id}")
            return {
                "fullName":           row["fullName"],
                "resumeText":         row["resumeText"],
                "resumeData":         row["resumeData"],
                "extractedDetails":   row["extractedDetails"],
                "screeningCriteria":  row["screeningCriteria"],
                "jobTitle":           row["role"] or row["title"],
                "driveTitle":         row["title"],
                "jd":                 _build_jd_from_extracted(row["extractedDetails"]),
                "orgId":              row["orgId"],
                "orgName":            row["orgName"],
                "orgLocation":        row["orgLocation"],
                "driveLocation":      row["driveLocation"],
                "language":           row["interviewLanguage"],
                "timeLimit":          FIXED_INTERVIEW_DURATION_MINUTES,
                "voiceId":            row["voiceId"],
                "voiceProvider":      row["voiceProvider"],
                "voiceModel":         row["voiceModel"],
                "aiName":             row["aiName"],
                "deepgramModel":      row["deepgramModel"],
                "proctoringSignals":  row["proctoringSignals"],
                "interviewQuestions": row["interviewQuestions"],
                "interviewStatus":    row["interviewStatus"],
            }
        except Exception as e:
            last_error = e
            logger.error(f"Database error during context fetch (attempt {attempt}/5): {e}")
            if "no interview context found in db" in str(e).lower():
                break
            if "executor shutdown" in str(e).lower():
                DatabasePool._pool = None
                DatabasePool._init_task = None
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
) -> None:
    """Save transcript, duration, and proctoring report to Interview table.
    partial=True -> only update transcript/duration/turns (no status change).
    partial=False -> full update including status and completedAt.
    """
    if not transcript_lines and final_status != "NO_SHOW":
        logger.info("[TRANSCRIPT] No lines captured - skipping save to avoid overwriting existing data")
        return
    if not DATABASE_URL:
        logger.warning("[TRANSCRIPT] No DATABASE_URL - skipping save")
        return
    full_text      = "\n".join(transcript_lines) if transcript_lines else ""
    duration       = int(time.time() - start_time) if start_time else 0
    proctor_report = None
    if proctoring_data:
        proctor_report = {
            "events":         proctoring_data.get("events", []),
            "inconsistencies":proctoring_data.get("inconsistencies", []),
        }
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            if partial:
                await conn.execute(
                    """UPDATE "Interview" SET
                         "interviewTranscript" = $1,
                         "interviewDuration"   = $2,
                         "updatedAt"           = NOW()
                       WHERE "applicationId" = $3""",
                    full_text, duration, app_id,
                )
                logger.info(f"[TRANSCRIPT] Partial save {len(transcript_lines)} lines, {duration}s for {app_id}")
            else:
                await conn.execute(
                    """UPDATE "Interview" SET
                         "interviewTranscript" = $1,
                         "interviewDuration"   = $2,
                         status                = $3,
                         "integritySignals"    = $4,
                         "completedAt"         = NOW(),
                         "updatedAt"           = NOW()
                       WHERE "applicationId" = $5""",
                    full_text, duration, final_status,
                    json.dumps([
                        ev for ev in (proctor_report.get("events", []) if proctor_report else [])
                        if ev.get("eventType") or ev.get("type")
                    ]),
                    app_id,
                )
                logger.info(f"[TRANSCRIPT] Final save {len(transcript_lines)} lines, {duration}s, status={final_status} for {app_id}")
    except Exception as e:
        logger.error(f"[TRANSCRIPT] DB save failed: {e}")
async def mark_interview_started(app_id: str) -> None:
    if not DATABASE_URL:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "Interview" SET status = $1, "startedAt" = NOW() WHERE "applicationId" = $2',
                "IN_PROGRESS", app_id,
            )
            await conn.execute(
                'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
                "IN_PROGRESS", app_id,
            )
        logger.info(f"[INTERVIEW] App {app_id} marked as IN_PROGRESS.")
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update application status to started: {e}")
async def persist_question_by_question_analysis(app_id: str, answer_scores: list[dict]) -> None:
    """Save full turn-by-turn interview analysis to Interview.questionByQuestionAnalysis JSONB."""
    if not app_id or not DATABASE_URL or not answer_scores:
        return
    normalized = [
        {
            "turn":                        int(s.get("turn", i) or i),
            "ai_question":                 str(s.get("question", "") or "").strip(),
            "candidate_answer":            str(s.get("answer",   "") or "").strip(),
            "score_breakdown": {
                "clarity":    int(s.get("clarity",    0) or 0),
                "depth":      int(s.get("depth",      0) or 0),
                # eval_pipeline returns specificity/grounding; fluency/confidence are aliases
                "fluency":    int(s.get("fluency",    0) or s.get("specificity", 0) or 0),
                "confidence": int(s.get("confidence", 0) or s.get("grounding",   0) or 0),
            },
            "overall":                     float(s.get("overall", 0) or 0),
            "signals":                     list(s.get("signals",  []) or []),
            "concerns":                    list(s.get("concerns", []) or []),
            "topic":                       str(s.get("topic",     "") or ""),
            "topic_saturation_score":      float(s.get("topic_saturation_score",     0) or 0),
            "topic_saturation_threshold":  float(s.get("topic_saturation_threshold", 0) or 0),
            "is_warmup":                   bool(s.get("is_warmup", False)),
        }
        for i, s in enumerate(answer_scores, 1)
    ]
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "questionByQuestionAnalysis" = $1::jsonb, "updatedAt" = NOW()
                   WHERE "applicationId" = $2""",
                json.dumps(normalized), app_id,
            )
        logger.info(f"[SCORE] Saved {len(normalized)} question-by-question rows for {app_id}")
    except Exception as e:
        logger.error(f"[SCORE] Failed to persist question-by-question analysis for {app_id}: {e}")
async def persist_answer_scores(app_id: str, answer_scores: list[dict]) -> None:
    """Backward-compatible wrapper."""
    await persist_question_by_question_analysis(app_id, answer_scores)
async def deduct_interview_billing(app_id: str, duration_seconds: Optional[float] = None) -> None:
    """Atomically deduct one interview quota slot. Idempotent via billingSnapshot.billedAt guard."""
    if not DATABASE_URL:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT d."orgId",
                          i."interviewDuration",
                          NULLIF(i."recording"->>'durationSec', '')::float AS "recordingDurationSec"
                   FROM "Interview" i
                   JOIN "Application" a ON a.id = i."applicationId"
                   JOIN "Drive" d ON d.id = a."driveId"
                   WHERE a.id = $1 LIMIT 1""",
                app_id,
            )
            if not row:
                logger.warning(f"[BILLING] No interview row found for {app_id} -- skipping billing")
                return
            org_id = row["orgId"]
            if not org_id:
                logger.warning(f"[BILLING] No orgId for {app_id} -- skipping billing")
                return
            dur = duration_seconds
            if not dur or dur <= 0:
                dur = float(row["interviewDuration"] or 0)
            if not dur or dur <= 0:
                dur = float(row["recordingDurationSec"] or 0)
            marked = await conn.fetch(
                """UPDATE "Interview"
                   SET "billingSnapshot" = jsonb_set(
                       COALESCE("billingSnapshot", '{}'::jsonb),
                       '{billedAt}',
                       to_jsonb(extract(epoch from now())::bigint)
                   ), "updatedAt" = NOW()
                   WHERE "applicationId" = $1
                     AND ("billingSnapshot" IS NULL OR "billingSnapshot"->'billedAt' IS NULL)
                   RETURNING id""",
                app_id,
            )
            if not marked:
                logger.info(f"[BILLING] Already billed for {app_id} -- skipping")
                return
            await conn.execute(
                'UPDATE "Organization" SET "interviewQuotaUsed" = COALESCE("interviewQuotaUsed", 0) + 1, "updatedAt" = NOW() WHERE id = $1',
                org_id,
            )
            if dur > 0:
                credits_delta = round((dur / 60) * 100) / 100
                if credits_delta > 0:
                    await conn.execute(
                        'UPDATE "Organization" SET "creditsUsed" = COALESCE("creditsUsed", 0) + $1, "updatedAt" = NOW() WHERE id = $2',
                        credits_delta, org_id,
                    )
                    logger.info(f"[BILLING] Deducted 1 quota + {credits_delta:.2f} credits for {app_id} org={org_id} dur={dur:.0f}s")
                else:
                    logger.info(f"[BILLING] Deducted 1 quota (no credits -- dur={dur:.0f}s) for {app_id} org={org_id}")
            else:
                logger.warning(f"[BILLING] Deducted 1 quota but duration unknown for {app_id} org={org_id}")
    except Exception as e:
        logger.error(f"[BILLING] Failed to deduct billing for {app_id}: {e}")
async def update_interview_status(app_id: str, duration_seconds: Optional[float] = None) -> None:
    """Mark the application as COMPLETED via asyncpg and deduct billing."""
    if not DATABASE_URL:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET status = 'COMPLETED', "completedAt" = NOW(), "updatedAt" = NOW()
                   WHERE "applicationId" = $1""",
                app_id,
            )
            await conn.execute(
                """UPDATE "Application"
                   SET "interviewStatus" = 'COMPLETED', "updatedAt" = NOW()
                   WHERE id = $1""",
                app_id,
            )
            if duration_seconds:
                await conn.execute(
                    """UPDATE "Interview"
                       SET "recording" = jsonb_set(
                             COALESCE("recording", '{}'::jsonb),
                             '{durationSec}',
                             to_jsonb($1::integer),
                             true
                           ),
                           "interviewDuration" = $2,
                           "updatedAt" = NOW()
                       WHERE "applicationId" = $3""",
                    int(duration_seconds), int(duration_seconds), app_id,
                )
        logger.info(f"[INTERVIEW] App {app_id} marked as COMPLETED (dur={duration_seconds}s)")
        await deduct_interview_billing(app_id, duration_seconds)
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update interview status for {app_id}: {e}")
# ═══════════════════════════════════════════════════════════════════════════════
# Re-exports — report pipeline moved to interview/report_pipeline.py
# ═══════════════════════════════════════════════════════════════════════════════
from interview.report_pipeline import (  # noqa: E402
    generate_interview_report,
    generate_interview_summary,
    LLMEvalResponse,
    LLMSkillsResponse,
    ReportState,
)

# ═══════════════════════════════════════════════════════════════════════════════
# Billing helpers (public API, used by agent_runtime.py)
# ═══════════════════════════════════════════════════════════════════════════════
def merge_manual_billing_usage(existing: dict[str, Any], feature: str, usage: dict[str, Any]) -> dict[str, Any]:
    """Merge a manual LLM usage record for a given feature into the org billing dict."""
    _VALID = {"interview", "resumeExtraction", "jdExtraction", "chatbot", "interviewReport", "resumeReport"}
    if feature not in _VALID:
        feature = "interview"
    model_name = str(usage.get("model", "") or "").strip()
    if not model_name:
        raise ValueError(f"Cannot merge manual billing for {feature} without model")
    session_summary = {
        "llm": {
            "sessions": 1,
            "totals": {
                "inputTokens":       int(usage.get("inputTokens",     0) or 0),
                "inputCachedTokens": int(usage.get("cachedInputTokens", 0) or 0),
                "outputTokens":      int(usage.get("outputTokens",    0) or 0),
                "sessionDuration":   float(usage.get("sessionDuration", 0) or 0),
            },
            "byModel": {
                f"openai:{model_name}": {
                    "provider":          "openai",
                    "model":             model_name,
                    "inputTokens":       int(usage.get("inputTokens",     0) or 0),
                    "inputCachedTokens": int(usage.get("cachedInputTokens", 0) or 0),
                    "outputTokens":      int(usage.get("outputTokens",    0) or 0),
                    "sessionDuration":   float(usage.get("sessionDuration", 0) or 0),
                }
            },
        },
        "tts": {"sessions": 0, "totals": {}, "byModel": {}},
        "stt": {"sessions": 0, "totals": {}, "byModel": {}},
    }
    return merge_feature_billing(existing, feature, session_summary)
