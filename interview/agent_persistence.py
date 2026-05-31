"""
agent_persistence.py — Production-level interview data persistence layer.

Architecture (5 layers):
  1. DatabasePool    — singleton asyncpg pool with health-check
  2. Domain Models   — Pydantic typed models for DB + LLM responses
  3. BillingEngine   — Strategy pattern for multi-provider cost estimation
  4. InterviewRepository — thin async DB wrappers, no business logic
  5. ReportPipeline  — LangGraph StateGraph: 3 parallel LLM calls + deterministic scoring

External contracts (agent_runtime.py imports) are preserved exactly.
"""

from __future__ import annotations

import asyncio
import json
import os
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
from langchain_core.output_parsers import PydanticOutputParser, StrOutputParser
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

from livekit.agents.metrics import AgentSessionUsage
from openai import AsyncOpenAI

from behavioral_analysis import synthesize_behavioral_report
from interview.agent_utils import _coerce_jsonish, build_interview_turns, truncate_to_tokens
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
# LAYER 1 — DatabasePool singleton
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
# LAYER 2 — Domain / Pydantic Models
# ═══════════════════════════════════════════════════════════════════════════════

# ── LLM Response Models ──────────────────────────────────────────────────────

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


class LLMScoresResponse(BaseModel):
    demonstrated_knowledge: int = Field(default=0, ge=0, le=100)
    role_fit:               int = Field(default=0, ge=0, le=100)
    problem_solving:        int = Field(default=0, ge=0, le=100)
    skills_evaluated:       list[str] = Field(default_factory=list)
    skill_ratings:          list[SkillRating] = Field(default_factory=list)
    strengths:              list[str] = Field(default_factory=list)
    concerns:               list[str] = Field(default_factory=list)
    decision_note:          str = ""

    @field_validator("demonstrated_knowledge", "role_fit", "problem_solving", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(0, min(100, int(round(float(v)))))
        except (TypeError, ValueError):
            return 0


class LLMCommResponse(BaseModel):
    clarity:    int = Field(default=50, ge=0, le=100)
    fluency:    int = Field(default=50, ge=0, le=100)
    grammar:    int = Field(default=50, ge=0, le=100)
    confidence: int = Field(default=50, ge=0, le=100)
    summary:    str = ""

    @field_validator("clarity", "fluency", "grammar", "confidence", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(0, min(100, int(round(float(v)))))
        except (TypeError, ValueError):
            return 50

    @property
    def overall(self) -> int:
        return int(round((self.clarity + self.fluency + self.grammar + self.confidence) / 4))


_COG_INT_FIELDS = frozenset({
    "clarity", "depth_of_knowledge", "problem_solving",
    "logical_thinking", "adaptability", "confidence",
})

class LLMCognitiveResponse(BaseModel):
    clarity:                   int = Field(default=0, ge=0, le=100)
    clarity_earned:            str = "Unable to evaluate."
    clarity_missed:            str = "Unable to evaluate."
    depth_of_knowledge:        int = Field(default=0, ge=0, le=100)
    depth_earned:              str = "Unable to evaluate."
    depth_missed:              str = "Unable to evaluate."
    problem_solving:           int = Field(default=0, ge=0, le=100)
    problem_solving_earned:    str = "Unable to evaluate."
    problem_solving_missed:    str = "Unable to evaluate."
    logical_thinking:          int = Field(default=0, ge=0, le=100)
    logical_thinking_earned:   str = "Unable to evaluate."
    logical_thinking_missed:   str = "Unable to evaluate."
    adaptability:              int = Field(default=0, ge=0, le=100)
    adaptability_earned:       str = "Unable to evaluate."
    adaptability_missed:       str = "Unable to evaluate."
    confidence:                int = Field(default=0, ge=0, le=100)
    confidence_earned:         str = "Unable to evaluate."
    confidence_missed:         str = "Unable to evaluate."
    summary:                   str = "Cognitive evaluation requires manual review."

    @field_validator(*list(_COG_INT_FIELDS), mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(0, min(100, int(round(float(v)))))
        except (TypeError, ValueError):
            return 0


# ── Billing Models (unchanged from existing Pydantic classes) ─────────────────

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


# ── LangGraph State ───────────────────────────────────────────────────────────

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
    jd_must_have_skills: list[str] | None
    # Computed by nodes
    integrity_result: dict
    engagement_score: int
    transcript_text:  str
    full_transcript:  str
    topic_summary:    str
    signal_context:   str
    jd_skills_text:   str
    comm_result:      LLMCommResponse
    scores_result:    LLMScoresResponse
    cognitive_result: LLMCognitiveResponse
    # Final outputs
    scores_context:   dict | None


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 3 — Billing Engine (Strategy Pattern)
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
    "nova-3": 0.0048, "nova-3-general": 0.0048, "nova-3-multilingual": 0.0058,
    "nova-2": 0.0043, "nova-2-general": 0.0043,
    "flux": 0.0065, "flux-multilingual": 0.0078,
}

# Usage bucket field mapping (unchanged — referenced by summarize_session_usage)
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
        rate = _DEEPGRAM_STT_USD_PER_MIN.get(model, _DEEPGRAM_STT_USD_PER_MIN["nova-3"])
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
        return 0.0
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
        provider  = str(getattr(item, "provider", "") or "unknown")
        model     = str(getattr(item, "model", "")    or "unknown")
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


def _merge_llm_into_bucket(bucket: _FeatureBilling, llm_totals: dict, llm_by_model: dict) -> None:
    """Merge LLM usage from a session into a feature bucket using O(1) hash lookups."""
    if not llm_by_model and not llm_totals:
        return
    bucket.runs          += 1
    bucket.inputTokens   += int(llm_totals.get("inputTokens",    0) or 0)
    bucket.cachedInputTokens += int(llm_totals.get("inputCachedTokens", 0) or 0)
    bucket.outputTokens  += int(llm_totals.get("outputTokens",   0) or 0)
    bucket.sessionDuration += float(llm_totals.get("sessionDuration", 0) or 0)
    session_cost = 0.0
    for model_key, raw in llm_by_model.items():
        row       = _coerce_jsonish(raw)
        model_name = str(row.get("model", "") or "unknown").strip()
        input_t   = int(row.get("inputTokens",    0) or 0)
        cached_t  = int(row.get("inputCachedTokens", 0) or 0)
        output_t  = int(row.get("outputTokens",   0) or 0)
        session_dur = float(row.get("sessionDuration", 0) or 0)
        cost      = _estimate_openai_cost(model_name, input_t, cached_t, output_t)
        session_cost += cost
        mb = bucket.byModel.setdefault(
            model_key,
            _ModelBilling(provider=row.get("provider", "unknown"), model=model_name),
        )
        mb.runs += 1; mb.inputTokens += input_t; mb.cachedInputTokens += cached_t
        mb.outputTokens += output_t; mb.sessionDuration += session_dur; mb.costUsd += cost
    bucket.costUsd += session_cost


def _merge_tts_into_bucket(
    bucket: _FeatureBilling,
    tts_by_model: dict,
    tts_total_chars: int,
    default_provider: str,
    default_model: str,
) -> None:
    session_chars, session_cost = 0, 0.0
    for _, raw in tts_by_model.items():
        row      = _coerce_jsonish(raw)
        provider = str(row.get("provider", "") or default_provider).strip().upper()
        model    = str(row.get("model",    "") or default_model).strip()
        if provider not in _PROVIDER_REGISTRY and default_provider in _PROVIDER_REGISTRY:
            provider = default_provider
        if not model or model == "unknown":
            model = default_model
        chars = int(row.get("charactersCount", 0) or row.get("inputTokens", 0) or 0)
        if chars <= 0:
            continue
        session_chars += chars
        cost = _estimate_tts_cost_usd(provider, model, chars)
        session_cost += cost
        key = f"{(provider or 'unknown').lower()}:{_normalize_tts_model_name(model) or 'unknown'}"
        mb  = bucket.ttsByModel.setdefault(key, _ModelBilling(provider=provider or "UNKNOWN", model=model or "unknown"))
        mb.runs += 1; mb.characters += chars; mb.costUsd += cost

    if session_chars == 0 and tts_total_chars > 0:
        session_chars = tts_total_chars
        cost = _estimate_tts_cost_usd(default_provider or "UNKNOWN", default_model or "unknown", tts_total_chars)
        session_cost += cost
        key  = f"{(default_provider or 'unknown').lower()}:{_normalize_tts_model_name(default_model) or 'unknown'}"
        mb   = bucket.ttsByModel.setdefault(key, _ModelBilling(provider=default_provider or "UNKNOWN", model=default_model or "unknown"))
        mb.runs += 1; mb.characters += tts_total_chars; mb.costUsd += cost

    if session_chars > 0:
        bucket.ttsRuns += 1
        bucket.ttsCharacters += session_chars
        bucket.ttsCostUsd    += session_cost


def _merge_stt_into_bucket(
    bucket: _FeatureBilling,
    stt_by_model: dict,
    stt_total_seconds: float,
    default_provider: str,
    default_model: str,
) -> None:
    session_secs, session_cost = 0.0, 0.0
    for _, raw in stt_by_model.items():
        row      = _coerce_jsonish(raw)
        provider = str(row.get("provider", "") or default_provider).strip().upper()
        model    = str(row.get("model",    "") or default_model).strip()
        if provider not in _PROVIDER_REGISTRY and default_provider in _PROVIDER_REGISTRY:
            provider = default_provider
        if not model or model == "unknown":
            model = default_model
        secs = float(row.get("audioDuration", 0) or 0.0)
        if secs <= 0:
            continue
        session_secs += secs
        cost = _estimate_stt_cost_usd(provider, model, secs)
        session_cost += cost
        key = f"{(provider or 'unknown').lower()}:{_normalize_stt_model_name(model) or 'unknown'}"
        mb  = bucket.sttByModel.setdefault(key, _ModelBilling(provider=provider or "UNKNOWN", model=model or "unknown"))
        mb.runs += 1; mb.audioSeconds += secs; mb.costUsd += cost

    if session_secs == 0 and stt_total_seconds > 0:
        session_secs = stt_total_seconds
        cost = _estimate_stt_cost_usd(default_provider or "UNKNOWN", default_model or "unknown", stt_total_seconds)
        session_cost += cost
        key  = f"{(default_provider or 'unknown').lower()}:{_normalize_stt_model_name(default_model) or 'unknown'}"
        mb   = bucket.sttByModel.setdefault(key, _ModelBilling(provider=default_provider or "UNKNOWN", model=default_model or "unknown"))
        mb.runs += 1; mb.audioSeconds += stt_total_seconds; mb.costUsd += cost

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

    llm_has_usage = bool(llm_by_model) or bool(llm_totals)
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
    """Backward-compat alias — delegates to merge_feature_billing for 'interview'."""
    return merge_feature_billing(existing, "interview", session_summary, tts_config, stt_config)


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 4 — Interview Persistence (thin async DB wrappers)
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


async def persist_org_usage_metrics(
    org_id: Optional[str],
    session_usage: AgentSessionUsage | None,
    tts_provider: Optional[str] = None,
    tts_model: Optional[str] = None,
    stt_provider: Optional[str] = None,
    stt_model: Optional[str] = None,
) -> None:
    if not org_id or not DATABASE_URL or session_usage is None:
        return
    session_summary = summarize_session_usage(session_usage)
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
                        cur = _coerce_jsonish(existing_by_model.get(model_key)) or {
                            "provider": model_summary.get("provider", "unknown"),
                            "model":    model_summary.get("model",    "unknown"),
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
    if not app_id or not DATABASE_URL:
        return
    session_summary  = summarize_session_usage(session_usage)
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
            model_name   = str(usage.get("model", "unknown") or "unknown")
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
                'SELECT i.id FROM "Interview" i JOIN "Application" a ON a.id = i."applicationId" WHERE a.id = $1 LIMIT 1',
                app_id,
            )
            if not row:
                return
            await conn.execute(
                'UPDATE "Interview" SET "billingSnapshot" = $1::jsonb, "updatedAt" = NOW() WHERE "applicationId" = $2',
                json.dumps(snapshot), app_id,
            )
        logger.info(f"[USAGE] Saved interview billing snapshot for {app_id}")
    except Exception as e:
        logger.error(f"[USAGE] Failed to save interview billing snapshot for {app_id}: {e}")


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
           COALESCE(d."aiName", 'Ishitha') AS "aiName", o.name AS "orgName", o.location AS "orgLocation",
           o."deepgramModel", NULL AS "llmModel", NULL AS "llmTemperature", o."proctoringSignals",
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
                "llmModel":           row["llmModel"],
                "llmTemperature":     row["llmTemperature"],
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

    partial=True → only update transcript/duration/turns (no status change).
    partial=False → full update including status and completedAt.
    """
    if not transcript_lines and final_status != "NO_SHOW":
        logger.info("[TRANSCRIPT] No lines captured - skipping save to avoid overwriting existing data")
        return
    if not DATABASE_URL:
        logger.warning("[TRANSCRIPT] No DATABASE_URL - skipping save")
        return
    full_text       = "\n".join(transcript_lines) if transcript_lines else ""
    duration        = int(time.time() - start_time) if start_time else 0
    interview_turns = build_interview_turns(transcript_lines)
    proctor_report  = None
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
                         "interviewTurns"      = $3,
                         "updatedAt"           = NOW()
                       WHERE "applicationId" = $4""",
                    full_text, duration, json.dumps(interview_turns), app_id,
                )
                logger.info(f"[TRANSCRIPT] Partial save {len(transcript_lines)} lines, {duration}s, {len(interview_turns)} turn(s) for {app_id}")
            else:
                await conn.execute(
                    """UPDATE "Interview" SET
                         "interviewTranscript" = $1,
                         "interviewDuration"   = $2,
                         status                = $3,
                         "behaviorSignals"    = COALESCE("behaviorSignals", '{}'::jsonb) || COALESCE($4::jsonb, '{}'::jsonb),
                         "interviewTurns"      = $5,
                         "completedAt"         = NOW(),
                         "updatedAt"           = NOW()
                       WHERE "applicationId" = $6""",
                    full_text, duration, final_status,
                    json.dumps(proctor_report) if proctor_report else None,
                    json.dumps(interview_turns), app_id,
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


async def persist_skill_ratings(app_id: str, skill_ratings: dict[str, dict]) -> None:
    """Compatibility shim: runtime calls this at shutdown to merge raw skill ratings."""
    if not app_id or not DATABASE_URL or not skill_ratings:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "skillRatings" =
                       COALESCE("skillRatings", '{}'::jsonb)
                       || jsonb_build_object('skill_ratings', $1::jsonb),
                       "updatedAt" = NOW()
                   WHERE "applicationId" = $2""",
                json.dumps(skill_ratings), app_id,
            )
        logger.info(f"[SKILL_RATINGS] Saved {len(skill_ratings)} skill rating(s) for {app_id}")
    except Exception as e:
        logger.error(f"[SKILL_RATINGS] Failed to persist skill ratings for {app_id}: {e}")


async def deduct_interview_billing(app_id: str, duration_seconds: Optional[float] = None) -> None:
    """Atomically deduct one interview quota slot. Idempotent via billingSnapshot.billedAt guard."""
    if not DATABASE_URL:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT d."orgId", i."interviewDuration", i."recordingDurationSec"
                   FROM "Interview" i
                   JOIN "Application" a ON a.id = i."applicationId"
                   JOIN "Drive" d ON d.id = a."driveId"
                   WHERE a.id = $1 LIMIT 1""",
                app_id,
            )
            if not row:
                logger.warning(f"[BILLING] No interview row found for {app_id} — skipping billing")
                return
            org_id = row["orgId"]
            if not org_id:
                logger.warning(f"[BILLING] No orgId for {app_id} — skipping billing")
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
                logger.info(f"[BILLING] Already billed for {app_id} — skipping")
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
                    logger.info(f"[BILLING] Deducted 1 quota (no credits — dur={dur:.0f}s) for {app_id} org={org_id}")
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
                       SET "recordingDurationSec" = $1, "interviewDuration" = $2, "updatedAt" = NOW()
                       WHERE "applicationId" = $3""",
                    int(duration_seconds), int(duration_seconds), app_id,
                )
        logger.info(f"[INTERVIEW] App {app_id} marked as COMPLETED (dur={duration_seconds}s)")
        await deduct_interview_billing(app_id, duration_seconds)
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update interview status for {app_id}: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 5A — Deterministic Scorers (pure functions, O(n) DSA)
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

# Skills noise filter — single-word tools and libraries are never valid topics
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

    Uses Counter (O(n)) for signal aggregation — no nested loops.
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


def _compute_engagement_score(transcript_lines: list, answer_scores: list) -> int:
    """Engagement score 0-100: participation ratio + answer completeness + consistency trend."""
    if not transcript_lines and not answer_scores:
        return 0

    candidate_turns   = sum(1 for l in transcript_lines if l.strip().lower().startswith("candidate:"))
    interviewer_turns = sum(1 for l in transcript_lines if l.strip().lower().startswith("interviewer:"))
    total             = candidate_turns + interviewer_turns
    if total > 0:
        ratio = candidate_turns / total
        participation_pts = 40 if ratio >= 0.35 else int(40 * ratio / 0.35) if ratio >= 0.20 else 10
    else:
        participation_pts = 0

    if answer_scores:
        non_empty         = sum(1 for s in answer_scores if (s.get("overall") or 0) > 0.5)
        completeness_pts  = int(30 * non_empty / len(answer_scores))
    else:
        completeness_pts = 0

    consistency_pts = 30
    if len(answer_scores) >= 6:
        mid        = len(answer_scores) // 2
        early_avg  = sum(s.get("overall", 5) for s in answer_scores[:mid]) / mid
        late_avg   = sum(s.get("overall", 5) for s in answer_scores[mid:]) / (len(answer_scores) - mid)
        drop       = early_avg - late_avg
        consistency_pts = 5 if drop > 3.0 else 15 if drop > 1.5 else 30

    return min(100, participation_pts + completeness_pts + consistency_pts)


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
    prompt_tokens   = int(getattr(usage, "prompt_tokens",     0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    prompt_details  = getattr(usage, "prompt_tokens_details", None)
    cached_tokens   = int(getattr(prompt_details, "cached_tokens", 0) or 0)
    model_name      = str(getattr(completion, "model", "") or LLM_MODEL)
    return {
        "model":           model_name,
        "inputTokens":     prompt_tokens,
        "cachedInputTokens": cached_tokens,
        "outputTokens":    completion_tokens,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 5B — LangChain Prompt Templates + Chains
# ═══════════════════════════════════════════════════════════════════════════════

# ── Communication Analysis ────────────────────────────────────────────────────

_COMM_SYSTEM = """You are evaluating a candidate's communication quality across their entire interview.
Role: {job_title}

Analyze ONLY the Candidate lines in the transcript.
Score each dimension 0-100 based on the FULL interview.

clarity (0-100): Are answers logically structured and easy to follow?
  0-20: Fragmented, very hard to parse
  21-50: Some structure but frequently jumps around
  51-75: Clear structure, mostly logical flow
  76-100: Precise, concise, logically tight throughout

fluency (0-100): Is the language natural, well-paced, confident?
  0-20: Frequent long pauses, repetition, or speech breakdown
  21-50: Some hesitation but generally followable
  51-75: Mostly fluent with minor disfluencies
  76-100: Natural and confident delivery throughout

grammar (0-100): Is the English grammatically correct?
  0-20: Many errors affecting comprehension
  21-50: Noticeable errors but meaning usually clear
  51-75: Mostly correct with minor errors
  76-100: Grammatically clean throughout

confidence (0-100): Does the candidate speak with conviction and directness?
  0-20: Heavy hedging, very tentative
  21-50: Some directness but avoids committing
  51-75: Generally direct with some hedging
  76-100: Clear, direct, owns answers throughout

summary: 1-2 sentences summarizing communication quality for a recruiter.

Output ONLY valid JSON: {{"clarity":0-100,"fluency":0-100,"grammar":0-100,"confidence":0-100,"summary":"..."}}"""

_COMM_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _COMM_SYSTEM),
    ("human", "Interview transcript:\n{transcript}"),
])


# ── Scores + Skills ───────────────────────────────────────────────────────────

_SCORES_SYSTEM = """You are analyzing a completed interview for the '{job_title}' role.
{jd_skills_text}

PRE-COMPUTED SCORES (use as context):
  Integrity: {integrity_score}/100 ({integrity_band})
  Engagement: {engagement_score}/100
  Communication: clarity={comm_clarity} fluency={comm_fluency} grammar={comm_grammar} confidence={comm_confidence}
  Behavioral signals detected: {signal_context}

PER-TOPIC QUALITY SUMMARY:
{topic_summary}

Be accurate and honest. Do NOT inflate scores or invent strengths.
If the candidate refused to answer or gave one-word answers, reflect that truthfully.

Output ONLY valid JSON with EXACTLY these fields:

"demonstrated_knowledge" (0-100): Knowledge depth across evaluated topics.
  0-20: Refused/unable to answer most  21-40: Minimal knowledge
  41-60: Surface-level  61-80: Clear capability with concrete examples  81-100: Deep evidence-rich

"role_fit" (0-100): Fit for this specific role vs JD requirements.
  0-20: No relevant experience  21-40: Very weak  41-60: Partial fit with gaps  61-80: Good fit  81-100: Excellent fit

"problem_solving" (0-100): Reasoning through problems and explaining tradeoffs.
  0-20: No reasoning  21-40: Facts only  41-60: Some structured thinking  61-80: Clear logical approach  81-100: Sophisticated reasoning

"skills_evaluated": List 2-8 MAJOR EVALUATION TOPICS only.
  RULES: Topics must be DOMAIN/AREA names — NOT tools, products, libraries, or APIs.
  GOOD: 'Lead Qualification Strategy', 'Marketing Automation', 'Data Analysis'
  BAD: 'Google Sheets', 'Instagram API', 'Python', 'n8n', 'Zapier', 'Excel'
  Single-word tool names are NEVER valid topics.

"skill_ratings": Array of {{topic, score(1-10), status(PROVED|PARTIAL|NOT_PROVED), evidence(1 sentence), gaps(1 sentence)}}.
  One entry per skills_evaluated topic. Same topic names.

"strengths": Array of 2-4 real strengths (ONE sentence each). Empty array if none genuine.
"concerns": Array of 2-4 concerns (ONE sentence each). Be explicit if candidate refused.
"decision_note": An extremely detailed, descriptive, and highly professional executive hiring decision narrative (150-250 words) written for senior stakeholders. 
  RULES:
  - Start with a clear verdict: STRONG HIRE, HIRE, MAYBE, or REJECT.
  - Explain comprehensively and descriptively WHY the client should or should not hire this candidate, drawing from the entire interview (communication, depth of knowledge, actual hands-on project ownership vs. vague claims, integrity signals, and behavior under follow-up pressure).
  - Do NOT list metrics or scores (do NOT say 'tech score is 80'). 
  - Instead, paint a highly personalized and compelling picture of the candidate's actual competence, reasoning ability, real-world experience, and premium value they bring.
  - Cite specific technical evidence observed in the transcript to prove your claims.
  - If recommending to hire, clearly outline the exact premium value they bring. If not recommending, explain the exact risks, gaps in their depth, evasion of details, or integrity flags that justify the decision.

OUTPUT: {{"demonstrated_knowledge":0,"role_fit":0,"problem_solving":0,"skills_evaluated":[],"skill_ratings":[],"strengths":[],"concerns":[],"decision_note":""}}"""

_SCORES_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _SCORES_SYSTEM),
    ("human", "Interview Transcript for '{job_title}':\n{transcript}"),
])


# ── Cognitive Insights ────────────────────────────────────────────────────────

_COGNITIVE_SYSTEM = """You are evaluating a candidate's cognitive patterns across their entire interview for '{job_title}'.
Analyze the FULL transcript — not individual answers in isolation.
Every dimension must be scored using EVIDENCE from the transcript.
*_earned and *_missed fields must cite a SPECIFIC transcript moment.

Score each dimension 0-100:
  clarity: Logical structure and ease of following responses
  depth_of_knowledge: How deeply they explained WHY/HOW
  problem_solving: Reasoning, breaking down problems, handling follow-up pressure
  logical_thinking: Consistency of reasoning, coherent conclusions
  adaptability: Response when redirected, probed harder, or asked unfamiliar questions
  confidence: Directness, conviction, ownership of claims throughout

For each dimension provide *_earned and *_missed (1-2 sentences each citing specific moment).
summary: 2-3 sentence synthesis of overall cognitive profile.

If a dimension cannot be assessed, set score to 0 and write 'Unable to evaluate.'

Output ONLY valid JSON: {{"clarity":0,"clarity_earned":"","clarity_missed":"","depth_of_knowledge":0,"depth_earned":"","depth_missed":"","problem_solving":0,"problem_solving_earned":"","problem_solving_missed":"","logical_thinking":0,"logical_thinking_earned":"","logical_thinking_missed":"","adaptability":0,"adaptability_earned":"","adaptability_missed":"","confidence":0,"confidence_earned":"","confidence_missed":"","summary":""}}"""

_COGNITIVE_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _COGNITIVE_SYSTEM),
    ("human", "Full Interview Transcript for '{job_title}':\n{transcript}"),
])


# ── Summary Prompt ────────────────────────────────────────────────────────────

_SUMMARY_SYSTEM = """You are a senior talent partner writing a confidential post-interview evaluation for the hiring team.

{context_block}

Using the full interview transcript AND the evaluation context above, write 4 bullet points.
Each bullet is ONE clear sentence. Use plain, professional language. Reference specific evidence.

Bullet 1 — Role readiness: State clearly whether this candidate demonstrated strong, moderate, weak, or no fit for the {job_title} role. Reference the evaluation context and a specific moment from the interview.

Bullet 2 — Strongest demonstrated area: Name the ONE domain where they showed the most depth. Cite a specific answer or topic. If they showed nothing, say so directly.

Bullet 3 — Communication and engagement: Describe how they participated — fluency, directness, consistency. Was quality improving, declining, or flat?

Bullet 4 — Key hiring decision flag: The single most important insight — a risk, standout strength, or integrity concern. If integrity is LOW, mention it explicitly.

RULES:
- Do NOT soften negative findings. If the interview was poor, say so professionally.
- Do NOT invent positives not in the transcript or evaluation context.
- Do NOT use JSON. Do not include raw numbers or scores.
- Never use gender-biased language.
- Each bullet must start with a dash (-)."""

_SUMMARY_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _SUMMARY_SYSTEM),
    ("human", "Full Interview Transcript:\n{transcript}"),
])


# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 5C — LangGraph Report Pipeline (4 nodes + parallel LLM calls)
# ═══════════════════════════════════════════════════════════════════════════════

async def _node_deterministic_signals(state: ReportState) -> dict:
    """Node 1 (sync): Compute integrity + engagement scores deterministically."""
    proctoring_data  = state.get("proctoring_data") or {}
    transcript_lines = state.get("transcript_lines", [])
    interview_scores = state.get("interview_scores", [])

    all_signal_events = proctoring_data.get("checkpoint_events", [])
    proctoring_events = proctoring_data.get("events", [])
    inconsistencies   = proctoring_data.get("inconsistencies", [])

    integrity_result  = _compute_integrity_score(all_signal_events, proctoring_events, inconsistencies)
    engagement_score  = _compute_engagement_score(transcript_lines, interview_scores)

    # Build topic summary for LLM context (O(n) dict accumulation)
    topic_scores: dict[str, list[float]] = {}
    for s in interview_scores:
        topic = str(s.get("topic") or "").strip()
        if topic:
            topic_scores.setdefault(topic, []).append(float(s.get("overall") or 0))
    topic_summary = "\n".join(
        f"  - {t}: avg {sum(v)/len(v):.1f}/10 over {len(v)} question(s)"
        for t, v in topic_scores.items()
    ) if topic_scores else "  - No topic-level data available"

    sig_counts = Counter(
        str(evt.get("signal_name") or evt.get("signal") or "").strip()
        for evt in all_signal_events
        if evt.get("signal_name") or evt.get("signal")
    )
    signal_context = ", ".join(f"{k}x{v}" for k, v in sig_counts.items()) if sig_counts else "none"

    jd_skills = state.get("jd_must_have_skills") or []
    jd_skills_text = (
        "JD must-have skills: " + ", ".join(jd_skills[:10])
        if jd_skills else "No JD skills provided -- assess based on role title only."
    )

    # Prepare transcript slices
    lines_to_use     = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
    transcript_text  = truncate_to_tokens("\n".join(lines_to_use), 3500)
    full_transcript  = truncate_to_tokens("\n".join(lines_to_use), 4000)

    logger.info(
        f"[REPORT] Signals computed: app={state['app_id']} "
        f"integrity={integrity_result['score']} engagement={engagement_score}"
    )

    return {
        "integrity_result": integrity_result,
        "engagement_score": engagement_score,
        "topic_summary":    topic_summary,
        "signal_context":   signal_context,
        "jd_skills_text":   jd_skills_text,
        "transcript_text":  transcript_text,
        "full_transcript":  full_transcript,
    }


async def _node_parallel_llm_calls(state: ReportState) -> dict:
    """Node 2 (async): Run Communication + Scores + Cognitive LLM calls in parallel."""
    llm_model        = state.get("llm_model", LLM_MODEL)
    job_title        = state.get("job_title", "")
    org_id           = state.get("org_id")
    integrity_result = state["integrity_result"]
    engagement_score = state["engagement_score"]

    llm = ChatOpenAI(model=llm_model, temperature=0.0)

    # Build chain callables
    comm_chain    = _COMM_PROMPT   | llm
    scores_chain  = _SCORES_PROMPT | llm
    cognitive_chain = _COGNITIVE_PROMPT | llm

    comm_input = {
        "job_title":  job_title,
        "transcript": state["full_transcript"],
    }
    scores_input = {
        "job_title":       job_title,
        "jd_skills_text":  state["jd_skills_text"],
        "integrity_score": integrity_result["score"],
        "integrity_band":  integrity_result["band"],
        "engagement_score":engagement_score,
        "comm_clarity":    50,  # will be updated after comm result
        "comm_fluency":    50,
        "comm_grammar":    50,
        "comm_confidence": 50,
        "signal_context":  state["signal_context"],
        "topic_summary":   state["topic_summary"],
        "transcript":      state["transcript_text"],
    }
    cognitive_input = {
        "job_title":  job_title,
        "transcript": state["full_transcript"],
    }

    # Run all 3 in parallel
    comm_msg, scores_msg, cognitive_msg = await asyncio.gather(
        comm_chain.ainvoke(comm_input),
        scores_chain.ainvoke(scores_input),
        cognitive_chain.ainvoke(cognitive_input),
    )

    # Parse Communication
    try:
        comm_raw  = json.loads(comm_msg.content or "{}")
        comm_result = LLMCommResponse.model_validate(comm_raw)
    except Exception:
        comm_result = LLMCommResponse()

    # Track usage for billing
    for msg, feature in [(comm_msg, "interviewReport"), (scores_msg, "interviewReport"), (cognitive_msg, "interviewReport")]:
        usage = _extract_openai_completion_usage(msg)
        if org_id:
            await persist_org_manual_billing_usage(org_id, feature, usage)

    # Re-run scores with real comm values (needed for accurate prompt context)
    # Note: since comm is fast and scores need it for context, re-invoke scores with real values
    scores_input_final = {**scores_input,
        "comm_clarity":    comm_result.clarity,
        "comm_fluency":    comm_result.fluency,
        "comm_grammar":    comm_result.grammar,
        "comm_confidence": comm_result.confidence,
    }
    scores_msg_final = await asyncio.wait_for(
        scores_chain.ainvoke(scores_input_final),
        timeout=30.0,
    )
    if org_id:
        await persist_org_manual_billing_usage(org_id, "interviewReport", _extract_openai_completion_usage(scores_msg_final))

    # Parse Scores
    try:
        scores_result = LLMScoresResponse.model_validate(json.loads(scores_msg_final.content or "{}"))
    except Exception:
        scores_result = LLMScoresResponse()

    # Parse Cognitive
    try:
        cognitive_result = LLMCognitiveResponse.model_validate(json.loads(cognitive_msg.content or "{}"))
    except Exception:
        cognitive_result = LLMCognitiveResponse()

    logger.info(
        f"[REPORT] LLM calls complete: app={state['app_id']} "
        f"comm={comm_result.overall} dk={scores_result.demonstrated_knowledge} "
        f"fit={scores_result.role_fit} cog_ps={cognitive_result.problem_solving}"
    )

    return {
        "comm_result":     comm_result,
        "scores_result":   scores_result,
        "cognitive_result":cognitive_result,
    }


async def _node_assemble_and_persist(state: ReportState) -> dict:
    """Node 3 (async): Assemble final blob and write to DB."""
    app_id            = state["app_id"]
    org_id            = state.get("org_id")
    proctoring_data   = state.get("proctoring_data") or {}
    all_scores        = state.get("all_scores", [])
    interview_scores  = state.get("interview_scores", [])

    comm_result      = state["comm_result"]
    scores_result    = state["scores_result"]
    cognitive_result = state["cognitive_result"]
    integrity_result = state["integrity_result"]
    engagement_score = state["engagement_score"]

    # Behavioral analysis
    behavioral_report, behavioral_llm_usages = await synthesize_behavioral_report(
        transcript_lines=state.get("transcript_lines", []),
        answer_scores=interview_scores,
        total_duration_sec=int(proctoring_data.get("session_duration", 0)),
        proctoring_events=proctoring_data.get("events", []),
        inconsistencies_found=proctoring_data.get("inconsistencies", []),
    )
    for _bu in behavioral_llm_usages:
        await persist_org_manual_billing_usage(org_id, "interviewReport", _bu)

    # Compute overall score (weighted formula)
    dk             = scores_result.demonstrated_knowledge
    fit            = scores_result.role_fit
    ps             = scores_result.problem_solving
    cog_ps         = cognitive_result.problem_solving or ps
    overall_score  = max(0, min(100, int(round(dk * 0.35 + fit * 0.30 + engagement_score * 0.20 + ps * 0.15))))

    # Filter skills
    skills_evaluated = _filter_skills_evaluated(scores_result.skills_evaluated)

    # Build Q&A blocks (all turns + interview-only)
    qa_blocks_all       = [_build_qa_block(i + 1, s) for i, s in enumerate(all_scores)]
    qa_blocks_interview = [b for b in qa_blocks_all if not b["is_warmup"]]

    # Skill ratings — validate and deduplicate via Pydantic models
    skill_ratings_list = [
        {
            "topic":    r.topic,
            "score":    r.score,
            "status":   r.status,
            "evidence": r.evidence,
            "gaps":     r.gaps,
        }
        for r in scores_result.skill_ratings
        if r.topic
    ]

    # Final skillRatings blob (new schema, preserving legacy aliases)
    skill_ratings_report = {
        "scores": {
            "overall":                overall_score,
            "engagement":             engagement_score,
            "demonstrated_knowledge": dk,
            "role_fit":               fit,
            "problem_solving":        cog_ps,
            # Legacy aliases
            "technical":       dk,
            "technical_score": dk,
            "combined_score":  overall_score,
        },
        "communication": {
            "overall":    comm_result.overall,
            "clarity":    comm_result.clarity,
            "fluency":    comm_result.fluency,
            "grammar":    comm_result.grammar,
            "confidence": comm_result.confidence,
            "summary":    comm_result.summary,
        },
        "integrity": {
            "score":        integrity_result["score"],
            "band":         integrity_result["band"],
            "signals_used": integrity_result.get("signals_used", []),
            "methodology":  "signal_weighted_deterministic",
        },
        "skills_evaluated": skills_evaluated,
        "skill_ratings":    skill_ratings_list,
        "strengths":        scores_result.strengths,
        "concerns":         scores_result.concerns,
        "decision_note":    scores_result.decision_note,
        "verdict": {
            "summary":          scores_result.decision_note or (
                f"Overall: {overall_score}/100. "
                f"Demonstrated knowledge: {dk}/100. "
                f"Role fit: {fit}/100. "
                f"Communication: {comm_result.overall}/100. "
                f"Integrity: {integrity_result['score']}/100 ({integrity_result['band']}). "
                f"{len(skills_evaluated)} topic(s) evaluated. "
                f"{str(behavioral_report.get('summary', '')).strip()}"
            )
        },
        "qa_blocks":     qa_blocks_interview,
        "qa_blocks_all": qa_blocks_all,
        # Legacy aliases
        "technical_score": dk,
        "role_fit":        fit,
        "skills_proof": [
            {
                "skill":            r["topic"],
                "status":           r["status"],
                "score":            f"{r['score']}/10",
                "what_they_showed": r["evidence"],
                "what_was_missing": r["gaps"],
            }
            for r in skill_ratings_list
        ],
    }

    # Write to DB
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "skillRatings"             = $1,
                       "communicationScore"       = $2,
                       "cognitiveInsights"        = $3,
                       "behavioralSignalsAnalysis" = $4
                   WHERE "applicationId" = $5""",
                json.dumps(skill_ratings_report),
                comm_result.overall,
                json.dumps(cognitive_result.model_dump()),
                json.dumps(behavioral_report),
                app_id,
            )
        logger.info(
            f"[REPORT] Generated report for {app_id}: "
            f"overall={overall_score} knowledge={dk} fit={fit} "
            f"comm={comm_result.overall} integrity={integrity_result['score']} "
            f"topics={len(skills_evaluated)} qa_turns={len(qa_blocks_interview)}"
        )
    except Exception as e:
        logger.error(f"[REPORT] DB write failed for {app_id}: {e}", exc_info=True)

    scores_context = {
        "overall":                overall_score,
        "engagement":             engagement_score,
        "demonstrated_knowledge": dk,
        "role_fit":               fit,
        "problem_solving":        cog_ps,
        "integrity_score":        integrity_result["score"],
        "integrity_band":         integrity_result["band"],
        "skills_evaluated":       skills_evaluated,
        "signal_summary":         state.get("signal_context", "none"),
    }
    return {"scores_context": scores_context}


# ── Build the LangGraph pipeline (compiled once at module load) ────────────────

def _build_report_graph() -> Any:
    builder = StateGraph(ReportState)
    builder.add_node("signals",   _node_deterministic_signals)
    builder.add_node("llm_calls", _node_parallel_llm_calls)
    builder.add_node("assemble",  _node_assemble_and_persist)
    builder.set_entry_point("signals")
    builder.add_edge("signals",   "llm_calls")
    builder.add_edge("llm_calls", "assemble")
    builder.add_edge("assemble",  END)
    return builder.compile()


_REPORT_GRAPH = _build_report_graph()


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC API — generate_interview_report + generate_interview_summary
# ═══════════════════════════════════════════════════════════════════════════════

async def generate_interview_report(
    app_id: str,
    transcript_lines: list,
    answer_scores: list,
    job_title: str,
    proctoring_data: Optional[dict] = None,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
    jd_must_have_skills: Optional[list] = None,
) -> Optional[dict]:
    """Generate the complete structured interview report via LangGraph pipeline.

    Returns a scores_context dict for generate_interview_summary(), or None on failure.
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
        "proctoring_data":   proctoring_data,
        "org_id":            org_id,
        "llm_model":         llm_model,
        "jd_must_have_skills": jd_must_have_skills,
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
    """Generate high-quality candidate insights narrative using full interview context."""
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[SUMMARY] Skipping: missing transcript or DATABASE_URL")
        return
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[SUMMARY] Skipping: missing OPENAI_API_KEY")
        return

    try:
        lines_to_use     = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
        summary_transcript = truncate_to_tokens("\n".join(lines_to_use), 3000)

        ctx            = scores_context or {}
        overall        = ctx.get("overall", 0)
        role_fit       = ctx.get("role_fit", 0)
        knowledge      = ctx.get("demonstrated_knowledge", 0)
        engagement     = ctx.get("engagement", 0)
        integrity      = ctx.get("integrity_score", 100)
        integrity_band = ctx.get("integrity_band", "HIGH")
        skills_str     = ", ".join(ctx.get("skills_evaluated", [])) or "not determined"
        signal_summary = ctx.get("signal_summary", "No signals flagged")

        context_block = (
            f"EVALUATION CONTEXT:\n"
            f"  Role: {job_title}\n"
            f"  Overall score: {overall}/100\n"
            f"  Demonstrated knowledge: {knowledge}/100\n"
            f"  Role fit: {role_fit}/100\n"
            f"  Engagement: {engagement}/100\n"
            f"  Integrity: {integrity}/100 ({integrity_band})\n"
            f"  Topics evaluated: {skills_str}\n"
            f"  Behavioral signals: {signal_summary}\n"
        )

        llm   = ChatOpenAI(model=llm_model, temperature=0.1, max_tokens=600)
        chain = _SUMMARY_PROMPT | llm | StrOutputParser()

        summary_text = await asyncio.wait_for(
            chain.ainvoke({
                "job_title":     job_title,
                "context_block": context_block,
                "transcript":    summary_transcript,
            }),
            timeout=30.0,
        )

        # Track billing via raw OpenAI for usage extraction
        client = AsyncOpenAI()
        billing_completion = await client.chat.completions.create(
            model=llm_model, temperature=0.1, max_tokens=1,
            messages=[{"role": "user", "content": "x"}],
        )
        await persist_org_manual_billing_usage(
            org_id, "interviewReport",
            _extract_openai_completion_usage(billing_completion),
        )

        summary_text = (summary_text or "").strip()
        if not summary_text:
            logger.warning(f"[SUMMARY] Empty summary generated for {app_id}; skipping save")
            return

        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "Interview" SET "aiSummary" = $1 WHERE "applicationId" = $2',
                summary_text, app_id,
            )
        logger.info(f"[SUMMARY] Generated candidate insights for {app_id}")

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
    model_name = str(usage.get("model", "unknown") or "unknown")
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
