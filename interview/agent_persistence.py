"""
agent_persistence.py -- Production-level interview data persistence layer.

Architecture (5 layers):
  1. DatabasePool    -- singleton asyncpg pool with health-check
  2. Domain Models   -- Pydantic typed models for DB + LLM responses
  3. BillingEngine   -- Strategy pattern for multi-provider cost estimation
  4. InterviewRepository -- thin async DB wrappers, no business logic
  5. ReportPipeline  -- LangGraph StateGraph: 3 parallel LLM calls + deterministic scoring

External contracts (agent_runtime.py imports) are preserved exactly.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from collections import Counter
from dataclasses import dataclass
from typing import Any, ClassVar, Literal, Optional, Protocol

import asyncpg
from pydantic import BaseModel, Field, field_validator
from typing_extensions import TypedDict
from urllib.parse import parse_qsl, urlencode, urlunparse, urlparse

# LangChain / LangGraph
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

from livekit.agents.metrics import AgentSessionUsage

from behavioral_analysis import generate_signal_analysis
from interview.agent_utils import _coerce_jsonish, truncate_to_tokens
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
    transcript_text:  str
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
    if not org_id or not DATABASE_URL or (session_usage is None and not has_plugin_usage):
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
    if not has_session_usage and not has_manual_usage and not duration_seconds:
        return

    snapshot_billing  = merge_interview_billing(
        {}, session_summary,
        tts_config={"provider": tts_provider or "", "model": tts_model or ""},
        stt_config={"provider": stt_provider or "", "model": stt_model or ""},
    )
    interview_bucket = _coerce_jsonish(_coerce_jsonish(snapshot_billing.get("billing")).get("interview"))

    if org_id:
        for feature, usage in _PENDING_MANUAL_BILLING.get(org_id, []):
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
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                'SELECT i.id, COALESCE(i."billingSnapshot", \'{}\'::jsonb) AS "billingSnapshot" FROM "Interview" i JOIN "Application" a ON a.id = i."applicationId" WHERE a.id = $1 LIMIT 1',
                app_id,
            )
            if not row:
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
        logger.info(f"[USAGE] Saved interview billing snapshot for {app_id}")
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
# LAYER 5A -- Deterministic Scorers (pure functions, O(n) DSA)
# ═══════════════════════════════════════════════════════════════════════════════

# Integrity signal weights (negative = risk, positive = mitigating)
_INTEGRITY_NEG: dict[str, float] = {
    "ownership_ambiguity":         -5.0,
    "latency_mismatch":            -8.0,
    "complexity_latency_mismatch": -12.0,
    "inconsistency":               -15.0,
    "tab_switch":                  -10.0,
    "face_absence":                -15.0,
    "multiple_faces":              -25.0,
    "camera_disabled":             -15.0,
    "microphone_disabled":         -8.0,
    "identity_mismatch":           -20.0,
}
_INTEGRITY_POS: dict[str, float] = {
    "ownership_clarified":    +5.0,
    "example_given":          +3.0,
    "strong_under_pressure":  +3.0,
    "inconsistency_resolved": +8.0,
}

# Skills noise filter -- single-word tools and libraries are never valid topics
_TOOL_KEYWORDS: frozenset[str] = frozenset({
    "google sheets", "google calendar", "instagram", "facebook", "n8n", "zapier",
    "python", "javascript", "typescript", "excel", "notion", "slack", "whatsapp",
    "airtable", "hubspot", "salesforce", "stripe", "twilio", "sendgrid",
    "openai", "chatgpt", "langchain", "react", "nextjs", "postgresql",
    "mysql", "mongodb", "redis", "aws", "gcp", "azure",
})


def _compute_integrity_score(
    signal_events: list[dict],
    proctoring_events: list[dict],
    inconsistencies: list[dict],
) -> dict:
    """Deterministic integrity score 0-100 using signal-weighted formula.

    Uses Counter (O(n)) for signal aggregation -- no nested loops.
    """
    score: float = 100.0
    sig_counts: Counter[str] = Counter()

    for evt in (signal_events or []):
        name = str(evt.get("signal_name") or evt.get("signal") or "").strip()
        if name:
            sig_counts[name] += 1
    for evt in (proctoring_events or []):
        name = str(evt.get("signal_name") or evt.get("event") or "").strip()
        if name:
            sig_counts[name] += 1
    for _ in (inconsistencies or []):
        sig_counts["inconsistency"] += 1

    fired: list[str] = []
    for sig_name, count in sig_counts.items():
        if sig_name in _INTEGRITY_NEG:
            score += _INTEGRITY_NEG[sig_name] * min(count, 3)
            fired.append(sig_name)
        elif sig_name in _INTEGRITY_POS:
            score += _INTEGRITY_POS[sig_name]

    final = max(0, min(100, int(round(score))))
    band  = "HIGH" if final >= 80 else "MODERATE" if final >= 55 else "LOW"
    return {"score": final, "band": band, "signals_used": fired, "methodology": "signal_weighted_deterministic"}



def _filter_skills_evaluated(raw_skills: list[str]) -> list[str]:
    """Remove tool/library keywords. Keep only topic-level domain names (O(n) set lookup)."""
    seen: set[str] = set()
    result: list[str] = []
    for topic in (str(s).strip() for s in raw_skills if str(s).strip()):
        if topic.lower() in _TOOL_KEYWORDS:
            continue
        if len(topic.split()) == 1 and len(topic) < 10:
            continue
        key = topic.lower()
        if key not in seen:
            seen.add(key)
            result.append(topic)
    return result[:8]


def _build_qa_block(idx: int, score: dict) -> dict:
    q_text      = str(score.get("question") or "").strip()
    overall_val = round(float(score.get("overall") or 0), 1)
    return {
        "q":        idx,
        "question": q_text or f"Question {idx}",
        "title":    q_text or f"Question {idx}",
        "answer":   str(score.get("answer") or ""),
        "score":    f"{overall_val}/10",
        "score_breakdown": {
            "clarity":     float(score.get("clarity")     or 0),
            "depth":       float(score.get("depth")       or 0),
            "specificity": float(score.get("specificity") or 0),
            "grounding":   float(score.get("grounding")   or 0),
        },
        "reasoning": str(score.get("reason") or score.get("reasoning") or ""),
        "signals":   list(score.get("signals") or []),
        "tags":      [score["topic"]] if score.get("topic") else [],
        "is_warmup": bool(score.get("is_warmup", False)),
    }


def _extract_openai_completion_usage(completion: Any) -> dict[str, Any]:
    usage           = getattr(completion, "usage", None)
    usage_metadata_raw = getattr(completion, "usage_metadata", None) or {}
    usage_metadata  = usage_metadata_raw if isinstance(usage_metadata_raw, dict) else {}
    response_metadata = getattr(completion, "response_metadata", None) or {}
    token_usage = response_metadata.get("token_usage") if isinstance(response_metadata, dict) else None
    prompt_tokens   = int(
        getattr(usage, "prompt_tokens", 0)
        or (token_usage or {}).get("prompt_tokens", 0)
        or usage_metadata.get("input_tokens", 0)
        or 0
    )
    completion_tokens = int(
        getattr(usage, "completion_tokens", 0)
        or (token_usage or {}).get("completion_tokens", 0)
        or usage_metadata.get("output_tokens", 0)
        or 0
    )
    prompt_details  = getattr(usage, "prompt_tokens_details", None)
    cached_tokens   = int(
        getattr(prompt_details, "cached_tokens", 0)
        or ((token_usage or {}).get("prompt_tokens_details") or {}).get("cached_tokens", 0)
        or ((usage_metadata.get("input_token_details") or {}).get("cache_read", 0))
        or 0
    )
    model_name      = str(
        getattr(completion, "model", "")
        or (response_metadata.get("model_name") if isinstance(response_metadata, dict) else "")
    )
    return {
        "model":           model_name,
        "inputTokens":     prompt_tokens,
        "cachedInputTokens": cached_tokens,
        "outputTokens":    completion_tokens,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 5B -- LangChain Prompt Templates + Chains
# ═══════════════════════════════════════════════════════════════════════════════

# -- Unified 5-Dimension Evaluation Prompt ------------------------------------

_EVAL_SYSTEM = """You are a senior recruiter and talent evaluator. You have just reviewed a complete AI-conducted interview for the '{job_title}' role.
{jd_context}

BACKGROUND SIGNALS (do NOT echo these numbers — use them as context only):
  Integrity Score: {integrity_score}/100 ({integrity_band})
  Behavioral flags observed: {signal_context}

---

STEP 1 — BEFORE YOU SCORE ANYTHING, read the entire transcript and form these opinions:

"strengths": Every genuine strength you observed — written like you're telling a colleague what stood out.
  - Name the specific moment, tool, question, or answer. Not "good communicator" — but "walked through the Zapier workflow trigger-to-action without being prompted."
  - If nothing genuine stands out, return an empty array. Do NOT invent. Do NOT pad.
  - No floor. Zero is honest. Four is the max.
  - Each item is ONE sentence. Sharp. Specific. Could not apply to any other candidate.

"concerns": Every genuine concern — written with the same directness you'd use in a debrief call.
  - If they contradicted their resume, name what they claimed and what they couldn't explain.
  - If they went blank on a follow-up, say which topic.
  - If every answer was surface-level with no depth, say that.
  - No floor. Zero means no concerns. Four is the max.
  - Do NOT soften. Do NOT hedge. A concern written weakly is useless to the hiring manager.

---

STEP 2 — SCORE exactly 5 dimensions. For each produce:
- "score": integer 0–100
- "evidence": ONE sentence — written like a recruiter's verbal note, not a bot summary. Must name something SPECIFIC from this interview. If they were weak, the sentence must sound like it.

SCORING PHILOSOPHY:
- Do NOT inflate. Weak candidate = weak scores. Use the full 0–100 range.
- Refused to answer / went blank / pure filler → 0–20.
- Textbook answer, no personal evidence → 21–45.
- 76–100 only when there is real, verifiable, specific depth in the transcript.

DIMENSION 1 — communication (weight: 15%)
Score: How clearly and confidently did they express themselves across the ENTIRE interview?
Look at: sentence structure, directness, filler words, hesitation, confidence under challenge.
  0–20 : Incomprehensible — constant restarts, impossible to follow
  21–45: Frequently unclear — hedged, lost the point mid-answer
  46–65: Passable — mostly followable, inconsistent
  66–80: Good — clear and direct, minor slips
  81–100: Excellent — precise, structured, confident under every challenge
Evidence: name a specific moment or pattern where communication succeeded or failed.

DIMENSION 2 — technical_knowledge (weight: 30%)
Score: Did they show REAL hands-on knowledge — or just vocabulary?
Look at: named tools + explained HOW, real numbers, real steps, real decisions, held up under probing.
  0–20 : Nothing — repeated the question or went silent
  21–45: Surface — knows terms, can't explain mechanics
  46–65: Partial — real in 1–2 areas, weak elsewhere
  66–80: Solid — concrete examples, named tools, process explained
  81–100: Deep — specific details, real numbers, step-by-step, held every probe
Evidence: name the specific tool/concept/project and whether they showed real depth.

DIMENSION 3 — resume_credibility (weight: 20%)
Score: Did their live answers hold up against their resume claims?
NOT about JD fit — about whether what they WROTE matches what they SAID.
Look at: could they explain their listed projects? Did probing reveal gaps or contradictions?
  0–20 : Claims completely unsupported — couldn't explain their own experience
  21–45: Significant gaps — most items vague or contradicted under probing
  46–65: Mixed — some held, some fell apart
  66–80: Credible — most backed with real detail, minor gaps
  81–100: Fully credible — every claim explained with evidence, nothing contradicted
Evidence: name a specific resume claim that was tested and whether it held or collapsed.

DIMENSION 4 — problem_solving (weight: 25%)
Score: Can they think through a problem — or do they recite answers?
Look at: did they frame before answering? Name tradeoffs? Engage reasoning when probed? Or restate the same answer twice?
  0–20 : No reasoning — restated facts, silent on follow-ups
  21–45: Facts only — no structure, no tradeoff thinking
  46–65: Some structure — basic answers, fell apart under pressure
  66–80: Logical — named tradeoffs, handled probes clearly
  81–100: Sophisticated — framed independently, named tradeoffs unprompted, engaged every probe
Evidence: name a specific probe and how they handled or failed it.

DIMENSION 5 — clarity_of_thought (weight: 10%)
Score: Was their thinking organized — or did they dump everything and hope?
DIFFERENT from communication — a fluent candidate can still be completely unstructured.
Look at: did they lead with a point? Stay on topic? Answer what was asked, or drift?
  0–20 : Stream of consciousness — no clear point in any answer
  21–45: Frequently drifted — missed what was actually asked
  46–65: Inconsistent — structured sometimes, scattered in others
  66–80: Clear — most answers structured, minor drift
  81–100: Sharp — framed every answer, landed a clear point, nothing wasted
Evidence: name a specific pattern — how they opened answers, whether they drifted.

---

OUTPUT ONLY valid JSON. No markdown. No explanation. No extra keys:
{{"strengths":[],"concerns":[],"communication":{{"score":0,"evidence":""}},"technical_knowledge":{{"score":0,"evidence":""}},"resume_credibility":{{"score":0,"evidence":""}},"problem_solving":{{"score":0,"evidence":""}},"clarity_of_thought":{{"score":0,"evidence":""}}}}"""

_EVAL_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _EVAL_SYSTEM),
    ("human", "Full Interview Transcript for '{job_title}':\n\n{transcript}"),
])


# -- Per-question skill extraction (fallback — used only when no topic_records available) -------

_SKILLS_SYSTEM = """You are a senior technical interviewer writing a skill-by-skill breakdown for the hiring team after an interview for the '{job_title}' role.

You will receive every question-answer pair from the interview with pre-scored dimensions (clarity, depth, specificity, grounding — each 0-10).

YOUR TASK: Identify every distinct skill, tool, or domain the candidate actually spoke about during the interview — then rate how well they demonstrated it.

SKILL NAMING — name what the candidate actually discussed, specifically:
- If they talked about n8n workflows → "n8n Workflow Automation"
- If they talked about lead qualification logic → "Lead Qualification"
- If they talked about Power BI dashboards → "Power BI / Data Visualization"
- Name the actual thing they discussed — do NOT use vague labels like "Project Execution" or "Data Analysis"
- Tools ARE valid skill names: "DuckDB", "n8n", "Zapier", "Meta API", "Apollo.io"
- Soft skills only if candidate gave clear evidence

SCORING (1-10):
- Base: avg(clarity, depth, specificity, grounding)
- Adjust UP: specific project names, real numbers, step-by-step process, personal decisions
- Adjust DOWN: vague, refused, "I don't know", or denied skill exists
- evidence: ONE sharp sentence quoting or closely paraphrasing what the candidate said — not a generic summary

DEDUPLICATION: merge entries for the same skill, use the best answer's score and evidence.

OUTPUT ONLY valid JSON. No markdown:
{{"skills":[{{"skill":"","score":5,"evidence":""}}]}}"""

_SKILLS_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _SKILLS_SYSTEM),
    ("human", "{qa_block}"),
])

# -- Anchored skills extraction from topic_records (primary path) --------------

_SKILLS_FROM_RECORDS_SYSTEM = """You are writing a skill-by-skill breakdown for the hiring team after an interview for the '{job_title}' role.

You will receive structured topic records captured by the interviewer at the moment each topic was closed. Each record contains:
- topic: what was discussed (project name, skill area, or tool)
- topic_type: "project" or "skill"
- exit_reason: why the topic ended (saturated=candidate fully answered, weak_exit=shallow/brief, depth_decay=kept giving vague answers, explicit_denial=said they don't know, dry_topic=no real content)
- probe_count: how many follow-up questions were asked (higher = interviewer had to dig harder)
- avg_overall: mean score across all turns on this topic (0–10)
- avg_depth: mean depth score (0–10)
- last_specificity / last_grounding: final turn scores on specificity and grounding (0–10)
- tech_skills: list of tools/technologies associated with this topic (from the candidate's resume)
- candidate_answers: actual things the candidate said during this topic (last 6 responses)
- denied: true if candidate explicitly said they don't know / don't remember

YOUR TASK:
Produce one skill entry per meaningful skill or tool discussed. For project-type topics, extract the specific skills the project demonstrates (use tech_skills + the candidate's actual answers). For skill-type topics, the topic IS the skill.

SCORING RULES (1–10, anchored to avg_overall):
- Start from avg_overall as base.
- exit_reason penalties:
    explicit_denial → cap at 2
    dry_topic       → cap at 3
    weak_exit       → deduct 1.5, cap at 5
    depth_decay     → deduct 1.0, cap at 6
    saturated / eval_moveon → no penalty
- probe_count bonus: probe_count <= 1 and avg_overall >= 7 → add 0.5
- Round to nearest integer, clamp 1–10.

EVIDENCE — ONE sharp sentence using the candidate's actual words from candidate_answers. Not a generic summary. Quote specifics.

OUTPUT ONLY valid JSON. No markdown:
{{"skills":[{{"skill":"","score":5,"evidence":""}}]}}"""

_SKILLS_FROM_RECORDS_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _SKILLS_FROM_RECORDS_SYSTEM),
    ("human", "{records_block}"),
])




# -- Summary Prompt ------------------------------------------------------------

_SUMMARY_SYSTEM = """You are a senior talent partner writing a confidential post-interview brief for the hiring team.

Role: {job_title}
Integrity: {integrity_band}
Behavioral signals: {signal_summary}

DIMENSION SCORES + EVIDENCE (what the evaluator observed):
{dimension_block}

SKILL BREAKDOWN (what was tested and how they performed):
{skill_block}

STRENGTHS OBSERVED:
{strengths_block}

CONCERNS FLAGGED:
{concerns_block}

---

Write 3–5 bullet points. Each bullet is ONE clear sentence.

Rules for what to cover:
- Cover only what actually mattered in THIS interview. If communication was unremarkable, skip it.
- If they were strong in one specific area, name it with the exact thing they said or did.
- If they were weak across the board, all bullets can be negative — do not force balance.
- If a skill or dimension was clearly the deciding factor, lead with it.
- If integrity was flagged, name it explicitly in one bullet.
- Do NOT write a bullet for every dimension — write bullets for what STOOD OUT.

Rules for how to write:
- Sound like a recruiter giving a verbal debrief, not a bot writing a report.
- Never write a sentence that could apply to any other candidate.
- No scores, no numbers, no percentages in the bullets.
- No softening negative findings. If they struggled, say they struggled and why it matters.
- Never invent positives not visible in the evidence above.
- Never use gender-biased language.
- Each bullet starts with a dash (-)."""

_SUMMARY_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _SUMMARY_SYSTEM),
    ("human", "Full Interview Transcript:\n{transcript}"),
])


# -- Verdict Prompt ------------------------------------------------------------

_VERDICT_SYSTEM = """You are a senior hiring manager writing a final verdict for a '{job_title}' interview. You have the full evaluation in front of you.

DIMENSION SCORES + EVIDENCE:
{dimension_block}

SKILL BREAKDOWN:
{skill_block}

STRENGTHS:
{strengths_block}

CONCERNS:
{concerns_block}

INTEGRITY: {integrity_band} ({integrity_score}/100)

---

Write ONE paragraph. 80–120 words. No more.

Rules:
- Start with exactly one of: STRONG HIRE / HIRE / MAYBE / REJECT — then a colon, then your reasoning.
- Name the single strongest signal and the single biggest concern — from the evidence above, not generic.
- End with exactly one action sentence: what should happen next (hire, pass, bring back for technical round, etc.).
- No scores, no numbers, no hedging. You have a strong opinion and you are accountable for it.
- Write like you are telling this to the hiring manager face to face — not filing a report."""

_VERDICT_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _VERDICT_SYSTEM),
    ("human", "Job Title: {job_title}"),
])


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 5C -- LangGraph Report Pipeline (4 nodes + parallel LLM calls)
# ═══════════════════════════════════════════════════════════════════════════════

async def _node_deterministic_signals(state: ReportState) -> dict:
    """Node 1 (sync): Compute integrity score + signal context deterministically.

    Merges agent-side behavioral signals (proctoring_data["events"]) with
    browser-side integrity signals stored in DB integritySignals (tab_switch,
    face_absence, camera_disabled, etc.)  so the integrity score reflects both.
    """
    proctoring_data  = state.get("proctoring_data") or {}
    transcript_lines = state.get("transcript_lines", [])
    app_id           = state.get("app_id", "")

    # Agent-side behavioral signals (ownership_ambiguity, follow_up_collapse, etc.)
    agent_proctoring_events = list(proctoring_data.get("events", []) or [])
    inconsistencies         = list(proctoring_data.get("inconsistencies", []) or [])

    # Browser-side integrity signals (tab_switch, face_absence, camera_disabled, etc.)
    # These are stored in DB "integritySignals" by /api/interview/proctoring.
    # They were never fetched here before, so they never affected the integrity score.
    db_integrity_events: list[dict] = []
    if app_id and DATABASE_URL:
        try:
            pool = await DatabasePool.get()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    'SELECT "integritySignals" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                    app_id,
                )
            if row and row["integritySignals"]:
                raw = row["integritySignals"]
                parsed = raw if isinstance(raw, list) else (json.loads(raw) if isinstance(raw, str) else [])
                db_integrity_events = [e for e in (parsed or []) if isinstance(e, dict)]
                # Normalize field name: DB stores eventType, _compute_integrity_score expects signal_name
                for ev in db_integrity_events:
                    if "eventType" in ev and "signal_name" not in ev:
                        ev["signal_name"] = ev["eventType"]
                logger.info(
                    "[REPORT] Fetched %d browser-side integrity signals from DB for %s",
                    len(db_integrity_events), app_id,
                )
        except Exception as _e:
            logger.warning("[REPORT] Failed to fetch integritySignals from DB for %s: %s", app_id, _e)

    # Merge: agent signals + browser signals; update proctoring_data events so the
    # rest of the pipeline (signal_analysis, signalAnalysis DB column) also sees them.
    all_proctoring_events = agent_proctoring_events + db_integrity_events
    proctoring_data = {**proctoring_data, "events": all_proctoring_events}

    # _compute_integrity_score(signal_events, proctoring_events, inconsistencies)
    # signal_events = behavioral signals from eval pipeline (passed as first arg)
    # proctoring_events = browser-side events (passed as second arg)
    # Both are now merged in all_proctoring_events; pass agent signals as first arg
    # and browser signals as second so the weight table applies correctly.
    integrity_result = _compute_integrity_score(agent_proctoring_events, db_integrity_events, inconsistencies)

    sig_counts = Counter(
        str(evt.get("signal_name") or evt.get("signal") or evt.get("event") or "").strip()
        for evt in all_proctoring_events
        if evt.get("signal_name") or evt.get("signal") or evt.get("event")
    )
    signal_context = ", ".join(f"{k}x{v}" for k, v in sig_counts.items()) if sig_counts else "none"

    jd_json = state.get("jd_json") or {}
    if jd_json:
        jd_context = "JOB DESCRIPTION:\n" + json.dumps(jd_json, ensure_ascii=False)[:2000]
    else:
        jd_context = "No JD provided — assess based on role title only."

    lines_to_use    = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
    transcript_text = truncate_to_tokens("\n".join(lines_to_use), 3500)

    logger.info(f"[REPORT] Signals computed: app={state['app_id']} integrity={integrity_result['score']}")

    return {
        "integrity_result": integrity_result,
        "signal_context":   signal_context,
        "jd_context":       jd_context,
        "transcript_text":  transcript_text,
        # Return the merged proctoring_data so downstream nodes (assemble) use
        # the full event list (agent signals + browser signals).
        "proctoring_data":  proctoring_data,
    }


def _qa_question(s: dict) -> str:
    """Question text from a score entry, tolerant of both shapes:
    raw answer_scores use 'question'/'answer'; DB-persisted rows use
    'ai_question'/'candidate_answer'. The report graph is fed RAW answer_scores,
    so 'question' is the real key -- but accept either so neither path breaks."""
    return str(s.get("question") or s.get("ai_question") or "").strip()


def _qa_answer(s: dict) -> str:
    return str(s.get("answer") or s.get("candidate_answer") or "").strip()


def _build_qa_block_for_skills(idx: int, s: dict) -> dict:
    """Return a minimal Q&A dict suitable for the skills prompt."""
    sb = s.get("score_breakdown") or {}
    return {
        "n":           idx,
        "question":    _qa_question(s),
        "answer":      _qa_answer(s),
        # Use the correct dimension keys -- score_breakdown uses clarity/depth/specificity/grounding.
        # Fallback to top-level keys for raw answer_scores that don't carry score_breakdown.
        "clarity":     sb.get("clarity",     s.get("clarity",     0)),
        "depth":       sb.get("depth",       s.get("depth",       0)),
        "specificity": sb.get("specificity", s.get("specificity", 0)),
        "grounding":   sb.get("grounding",   s.get("grounding",   0)),
        "is_warmup":   s.get("is_warmup", False),
    }


async def _node_eval_llm_call(state: ReportState) -> dict:
    """Node 2 (async): Run eval + skills LLM calls in parallel."""
    llm_model        = state.get("llm_model", LLM_MODEL)
    job_title        = state.get("job_title", "")
    org_id           = state.get("org_id")
    integrity_result = state["integrity_result"]
    all_scores       = state.get("all_scores", [])

    llm = ChatOpenAI(model=llm_model, temperature=0.0)

    # ── Eval call ──────────────────────────────────────────────────────────────
    eval_chain = _EVAL_PROMPT | llm
    eval_input = {
        "job_title":       job_title,
        "jd_context":      state["jd_context"],
        "integrity_score": integrity_result["score"],
        "integrity_band":  integrity_result["band"],
        "signal_context":  state["signal_context"],
        "transcript":      state["transcript_text"],
    }

    # ── Skills call ────────────────────────────────────────────────────────────
    topic_records = state.get("topic_records") or []
    if topic_records:
        # Primary path: anchored to per-topic ground-truth captured at MOVE_ON time
        skills_chain = _SKILLS_FROM_RECORDS_PROMPT | llm
        records_lines = []
        for i, rec in enumerate(topic_records, 1):
            scores = rec.get("scores", {})
            answers_text = " | ".join(rec.get("candidate_answers", [])[:4]) or "No answers recorded."
            tech = ", ".join(rec.get("tech_skills", [])) or "—"
            records_lines.append(
                f"[TOPIC {i}]\n"
                f"topic: {rec.get('topic', '')}\n"
                f"topic_type: {rec.get('topic_type', 'project')}\n"
                f"exit_reason: {rec.get('exit_reason', 'unknown')}\n"
                f"probe_count: {rec.get('probe_count', 0)}\n"
                f"avg_overall: {scores.get('avg_overall', 0):.1f}\n"
                f"avg_depth: {scores.get('avg_depth', 0):.1f}\n"
                f"last_specificity: {scores.get('last_specificity', 0):.1f}\n"
                f"last_grounding: {scores.get('last_grounding', 0):.1f}\n"
                f"tech_skills: {tech}\n"
                f"denied: {rec.get('denied', False)}\n"
                f"candidate_answers: {answers_text}\n"
            )
        skills_input = {"job_title": job_title, "records_block": "\n".join(records_lines)}
        logger.info(f"[REPORT] Using anchored topic_records path: {len(topic_records)} topics")
    else:
        # Fallback path: reconstruct from QA pairs
        skills_chain = _SKILLS_PROMPT | llm
        qa_items = [
            _build_qa_block_for_skills(i + 1, s)
            for i, s in enumerate(all_scores)
            if not s.get("is_warmup", False) and _qa_question(s)
        ]
        qa_block_text = "\n".join(
            f"Q{q['n']}: {q['question']}\n"
            f"A: {q['answer']}\n"
            f"[clarity={q['clarity']} depth={q['depth']} specificity={q['specificity']} grounding={q['grounding']}]"
            for q in qa_items
        ) or "No interview questions found."
        skills_input = {"job_title": job_title, "qa_block": qa_block_text}
        logger.info("[REPORT] topic_records empty — falling back to QA-block skills path")

    # ── Run both in parallel ───────────────────────────────────────────────────
    eval_msg, skills_msg = await asyncio.gather(
        asyncio.wait_for(eval_chain.ainvoke(eval_input),   timeout=45.0),
        asyncio.wait_for(skills_chain.ainvoke(skills_input), timeout=45.0),
    )

    if org_id:
        await persist_org_manual_billing_usage(org_id, "interviewReport", _extract_openai_completion_usage(eval_msg))
        await persist_org_manual_billing_usage(org_id, "interviewReport", _extract_openai_completion_usage(skills_msg))

    def _parse_llm_json(content: str) -> dict:
        """Strip markdown fences then parse JSON."""
        text = (content or "").strip()
        # strip ```json ... ``` or ``` ... ```
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        return json.loads(text.strip() or "{}")

    try:
        eval_result = LLMEvalResponse.model_validate(_parse_llm_json(eval_msg.content))
    except Exception as e:
        logger.warning(f"[REPORT] eval parse failed: {e} | raw={str(eval_msg.content)[:200]}")
        eval_result = LLMEvalResponse()

    try:
        skills_result = LLMSkillsResponse.model_validate(_parse_llm_json(skills_msg.content))
    except Exception as e:
        logger.warning(f"[REPORT] skills parse failed: {e} | raw={str(skills_msg.content)[:200]}")
        skills_result = LLMSkillsResponse()

    logger.info(
        f"[REPORT] Eval complete: app={state['app_id']} "
        f"comm={eval_result.communication.score} tech={eval_result.technical_knowledge.score} "
        f"cred={eval_result.resume_credibility.score} ps={eval_result.problem_solving.score} "
        f"cot={eval_result.clarity_of_thought.score} skills={len(skills_result.skills)}"
    )

    return {"eval_result": eval_result, "skills_result": skills_result}


async def _node_assemble_and_persist(state: ReportState) -> dict:
    """Node 3 (async): Assemble final blob and write to DB."""
    app_id           = state["app_id"]
    org_id           = state.get("org_id")
    proctoring_data  = state.get("proctoring_data") or {}
    interview_scores = state.get("interview_scores", [])
    engagement_score = state.get("engagement_score", 0)

    eval_result      = state["eval_result"]
    skills_result    = state.get("skills_result") or LLMSkillsResponse()
    integrity_result = state["integrity_result"]

    # Signal analysis — LLM narrative points
    signal_analysis_raw, signal_llm_usages = await generate_signal_analysis(
        transcript_lines=state.get("transcript_lines", []),
        answer_scores=interview_scores,
        total_duration_sec=int(proctoring_data.get("session_duration", 0)),
        proctoring_events=proctoring_data.get("events", []),
        inconsistencies_found=proctoring_data.get("inconsistencies", []),
    )
    for _bu in signal_llm_usages:
        await persist_org_manual_billing_usage(org_id, "interviewReport", _bu)

    # Merge LLM narrative + raw behavioral signals into one blob
    behavioral_signals = proctoring_data.get("events", [])
    signal_analysis = {
        "points":  signal_analysis_raw.get("points", []) if isinstance(signal_analysis_raw, dict) else [],
        "signals": behavioral_signals,
    }

    # Extract dimension scores
    comm  = eval_result.communication.score
    tech  = eval_result.technical_knowledge.score
    cred  = eval_result.resume_credibility.score
    ps    = eval_result.problem_solving.score
    cot   = eval_result.clarity_of_thought.score

    # Overall score: weighted average — technical_knowledge + problem_solving are the heavy hitters
    overall_score = max(0, min(100, int(round(
        comm * 0.15 + tech * 0.30 + cred * 0.20 + ps * 0.25 + cot * 0.10
    ))))

    # Skill ratings: name + score + one evidence line
    skill_ratings_list = [
        {
            "skill":    r.skill,
            "score":    r.score,
            "evidence": r.evidence,
        }
        for r in skills_result.skills
        if r.skill
    ]
    skills_evaluated = [r["skill"] for r in skill_ratings_list]

    # Final scoreBreakdown blob — dimension scores, overall, engagement, integrity
    # NOTE: skill_ratings are now stored separately in the "skillRatings" column
    score_breakdown_report = {
        "dimensions": [
            {"name": "Communication",              "score": comm, "evidence": eval_result.communication.evidence},
            {"name": "Technical & Subject Knowledge","score": tech, "evidence": eval_result.technical_knowledge.evidence},
            {"name": "Resume Credibility",         "score": cred, "evidence": eval_result.resume_credibility.evidence},
            {"name": "Problem Solving",            "score": ps,   "evidence": eval_result.problem_solving.evidence},
            {"name": "Clarity of Thought",         "score": cot,  "evidence": eval_result.clarity_of_thought.evidence},
        ],
        "overall":          overall_score,
        "engagement":       engagement_score,
        "integrity": {
            "score":        integrity_result["score"],
            "band":         integrity_result["band"],
            "signals_used": integrity_result.get("signals_used", []),
            "methodology":  "signal_weighted_deterministic",
        },
        "skills_evaluated": skills_evaluated,
        # verdict / decision_note comes from interviewSummary, not stored here
    }

    interview_summary_report = {
        "strengths": eval_result.strengths,
        "concerns":  eval_result.concerns,
    }

    # Write to DB — scoreBreakdown and skillRatings are now separate columns
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "scoreBreakdown"   = $1,
                       "skillRatings"    = $2,
                       "signalAnalysis"  = $3,
                       "interviewSummary" = $4
                   WHERE "applicationId" = $5""",
                json.dumps(score_breakdown_report),
                json.dumps(skill_ratings_list),
                json.dumps(signal_analysis),
                json.dumps(interview_summary_report),
                app_id,
            )
        logger.info(
            f"[REPORT] Generated report for {app_id}: "
            f"overall={overall_score} comm={comm} tech={tech} cred={cred} "
            f"ps={ps} cot={cot} integrity={integrity_result['score']} "
            f"topics={len(skills_evaluated)}"
        )
    except Exception as e:
        logger.error(f"[REPORT] DB write failed for {app_id}: {e}", exc_info=True)

    scores_context = {
        "overall":               overall_score,
        "communication":         comm,
        "technical_knowledge":   tech,
        "resume_credibility":    cred,
        "problem_solving":       ps,
        "clarity_of_thought":    cot,
        "integrity_score":       integrity_result["score"],
        "integrity_band":        integrity_result["band"],
        "skills_evaluated":      skills_evaluated,
        "signal_summary":        state.get("signal_context", "none"),
        # Rich context for summary + verdict LLM calls
        "dimensions":            score_breakdown_report["dimensions"],
        "skill_ratings":         skill_ratings_list,
        "strengths":             eval_result.strengths,
        "concerns":              eval_result.concerns,
    }
    return {"scores_context": scores_context}


# -- Build the LangGraph pipeline (compiled once at module load) ----------------

def _build_report_graph() -> Any:
    builder = StateGraph(ReportState)
    builder.add_node("signals",   _node_deterministic_signals)
    builder.add_node("llm_calls", _node_eval_llm_call)
    builder.add_node("assemble",  _node_assemble_and_persist)
    builder.set_entry_point("signals")
    builder.add_edge("signals",   "llm_calls")
    builder.add_edge("llm_calls", "assemble")
    builder.add_edge("assemble",  END)
    return builder.compile()


_REPORT_GRAPH = _build_report_graph()


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC API -- generate_interview_report + generate_interview_summary
# ═══════════════════════════════════════════════════════════════════════════════

async def generate_interview_report(
    app_id: str,
    transcript_lines: list,
    answer_scores: list,
    job_title: str,
    proctoring_data: Optional[dict] = None,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
    jd_json: Optional[dict] = None,
    topic_records: Optional[list] = None,
) -> Optional[dict]:
    """Generate the complete structured interview report via LangGraph pipeline.

    Returns a scores_context dict for generate_interview_summary(), or None on failure.

    topic_records: per-topic ground-truth records built by the agent at MOVE_ON time.
    When provided, skill extraction uses these instead of re-reading the transcript cold.
    """
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[REPORT] Skipping: missing transcript or DATABASE_URL")
        return None
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[REPORT] Skipping: missing OPENAI_API_KEY")
        return None

    interview_scores = [s for s in answer_scores if not s.get("is_warmup", False)]

    initial_state: ReportState = {
        "app_id":            app_id,
        "transcript_lines":  transcript_lines,
        "interview_scores":  interview_scores,
        "all_scores":        answer_scores,
        "job_title":         job_title,
        "proctoring_data":   proctoring_data or {},
        "org_id":            org_id,
        "llm_model":         llm_model,
        "jd_json":           jd_json,
        "topic_records":     topic_records or [],
    }

    try:
        final_state = await _REPORT_GRAPH.ainvoke(initial_state)
        return final_state.get("scores_context")
    except asyncio.TimeoutError as e:
        logger.error(f"[REPORT] LLM call timed out for {app_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"[REPORT] Pipeline failed for {app_id}: {e}", exc_info=True)
        return None


async def generate_interview_summary(
    app_id: str,
    transcript_lines: list,
    job_title: str,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
    scores_context: Optional[dict] = None,
) -> None:
    """Generate summary bullets + standalone verdict using full scores/skills/strengths as input."""
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[SUMMARY] Skipping: missing transcript or DATABASE_URL")
        return
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[SUMMARY] Skipping: missing OPENAI_API_KEY")
        return

    try:
        lines_to_use       = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
        summary_transcript = truncate_to_tokens("\n".join(lines_to_use), 3000)

        ctx             = scores_context or {}
        integrity_band  = ctx.get("integrity_band", "HIGH")
        integrity_score = ctx.get("integrity_score", 100)
        signal_summary  = ctx.get("signal_summary", "No signals flagged")

        # Build rich dimension block: name + score + evidence per dimension
        dimensions = ctx.get("dimensions", [])
        if dimensions:
            dimension_block = "\n".join(
                f"  {d['name']}: {d['score']}/100 — {d.get('evidence', '').strip()}"
                for d in dimensions
            )
        else:
            dimension_block = "  Not available"

        # Build skill block: skill name + score + evidence
        skills = ctx.get("skill_ratings", [])
        if skills:
            skill_block = "\n".join(
                f"  {s['skill']} ({s['score']}/10, {s['status']}): {s.get('evidence', '').strip()}"
                for s in skills[:12]
            )
        else:
            skill_block = "  Not available"

        # Strengths and concerns from eval
        strengths = ctx.get("strengths", [])
        concerns  = ctx.get("concerns", [])
        strengths_block = "\n".join(f"  - {s}" for s in strengths) if strengths else "  None identified"
        concerns_block  = "\n".join(f"  - {c}" for c in concerns)  if concerns  else "  None flagged"

        shared_vars = {
            "job_title":       job_title,
            "integrity_band":  integrity_band,
            "integrity_score": integrity_score,
            "signal_summary":  signal_summary,
            "dimension_block": dimension_block,
            "skill_block":     skill_block,
            "strengths_block": strengths_block,
            "concerns_block":  concerns_block,
        }

        llm = ChatOpenAI(model=llm_model, temperature=0.1, max_tokens=500)

        # Run summary bullets and verdict in parallel
        summary_chain = _SUMMARY_PROMPT | llm
        verdict_chain = _VERDICT_PROMPT | llm

        summary_msg, verdict_msg = await asyncio.gather(
            asyncio.wait_for(
                summary_chain.ainvoke({**shared_vars, "transcript": summary_transcript}),
                timeout=60.0,
            ),
            asyncio.wait_for(
                verdict_chain.ainvoke(shared_vars),
                timeout=60.0,
            ),
        )

        await asyncio.gather(
            persist_org_manual_billing_usage(org_id, "interviewReport", _extract_openai_completion_usage(summary_msg)),
            persist_org_manual_billing_usage(org_id, "interviewReport", _extract_openai_completion_usage(verdict_msg)),
        )

        summary_text = (getattr(summary_msg, "content", "") or "").strip()
        verdict_text = (getattr(verdict_msg, "content", "") or "").strip()

        if not summary_text and not verdict_text:
            logger.warning(f"[SUMMARY] Both outputs empty for {app_id}; skipping save")
            return

        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "interviewSummary" = COALESCE("interviewSummary", '{}') || $1::jsonb
                   WHERE "applicationId" = $2""",
                json.dumps({"summary": summary_text, "decision_note": verdict_text}),
                app_id,
            )
        logger.info(f"[SUMMARY] Generated summary + verdict for {app_id}")

    except asyncio.TimeoutError:
        logger.warning(f"[SUMMARY] Timed out for {app_id}")
    except Exception as e:
        logger.error(f"[SUMMARY] Generation failed for {app_id}: {e}")


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
