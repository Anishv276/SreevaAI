import json
import os
from typing import Optional, Any
from livekit.agents.metrics import AgentSessionUsage

# --- Billing Constants (Moved from agent.py) ---
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

_OPENAI_MODEL_RATES: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15, "cached_input": 0.075, "output": 0.6},
    "gpt-4.1-mini": {"input": 0.4, "cached_input": 0.1, "output": 1.6},
    "gpt-4o": {"input": 2.5, "cached_input": 1.25, "output": 10.0},
    "gpt-4.1": {"input": 2.0, "cached_input": 0.5, "output": 8.0},
}

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

# --- Helper Functions ---
def _coerce_jsonish(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}

def _empty_usage_bucket(kind: str) -> dict[str, Any]:
    return {
        "sessions": 0,
        "totals": {public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]},
        "byModel": {},
    }

def summarize_session_usage(session_usage: AgentSessionUsage | None) -> dict[str, Any]:
    summary: dict[str, Any] = {
        kind: _empty_usage_bucket(kind) for kind in _USAGE_BUCKET_FIELDS
    }
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
        by_model = _coerce_jsonish(src.get("byModel"))
        dst["byModel"] = by_model
        tts_by_model = _coerce_jsonish(src.get("ttsByModel"))
        dst["ttsByModel"] = tts_by_model
        stt_by_model = _coerce_jsonish(src.get("sttByModel"))
        dst["sttByModel"] = stt_by_model
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
    tts_total_chars = int(
        tts_totals.get("charactersCount", 0) or tts_totals.get("inputTokens", 0) or 0
    )
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
        interview_bucket["cachedInputTokens"] = int(
            interview_bucket.get("cachedInputTokens", 0)
        ) + int(llm_totals.get("inputCachedTokens", 0) or 0)
        interview_bucket["outputTokens"] = int(interview_bucket.get("outputTokens", 0)) + int(
            llm_totals.get("outputTokens", 0) or 0
        )
        interview_bucket["sessionDuration"] = float(
            interview_bucket.get("sessionDuration", 0)
        ) + float(llm_totals.get("sessionDuration", 0) or 0)

        by_model = _coerce_jsonish(interview_bucket.get("byModel"))
        session_cost = 0.0
        for model_key, raw in llm_by_model.items():
            model_row = _coerce_jsonish(raw)
            model_name = str(model_row.get("model", "") or "unknown").strip()
            input_tokens = int(model_row.get("inputTokens", 0) or 0)
            cached_tokens = int(model_row.get("inputCachedTokens", 0) or 0)
            output_tokens = int(model_row.get("outputTokens", 0) or 0)
            session_duration = float(model_row.get("sessionDuration", 0) or 0)
            model_cost = _estimate_openai_cost(
                model_name, input_tokens, cached_tokens, output_tokens
            )
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
        fallback_chars = int(
            tts_totals.get("charactersCount", 0) or tts_totals.get("inputTokens", 0) or 0
        )
        if fallback_chars > 0:
            session_tts_chars = fallback_chars
            provider = default_tts_provider or "UNKNOWN"
            model_name = default_tts_model or "unknown"
            model_cost = _estimate_tts_cost_usd(provider, model_name, fallback_chars)
            session_tts_cost += model_cost

            model_key = (
                f"{provider.lower() or 'unknown'}:{_normalize_tts_model_name(model_name) or 'unknown'}"
            )
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

    merged["billing"] = billing
    return merged
