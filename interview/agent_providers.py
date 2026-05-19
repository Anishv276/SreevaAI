"""
agent_providers.py
==================
Provider factory layer for TTS, STT, LLM, and VAD plugins.

Supported providers:
  TTS: Cartesia, Sarvam, ElevenLabs (routed via VOICE_REGISTRY in agent_runtime_support)
  STT: Deepgram only
  LLM: OpenAI only
"""

from __future__ import annotations

import inspect
import os
from typing import Any
from livekit.plugins import cartesia, deepgram, openai, sarvam, silero
try:
    from livekit.plugins import elevenlabs  # type: ignore[attr-defined]
except Exception:  # pragma: no cover - plugin may not be installed in all environments
    elevenlabs = None

from interview.agent_runtime_support import (
    LLM_MODEL,
    STT_MODEL,
    logger,
)
from interview.agent_utils import _cartesia_plugin_model

_CARTESIA_DEFAULT_MODEL = "cartesia/sonic-3"
_CARTESIA_DEFAULT_VOICE = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
_ELEVENLABS_DEFAULT_MODEL = "eleven_turbo_v2_5"

_PROVIDER_DEFAULTS: dict[str, Any] = {
    "cartesia_speed":          0.92,
    "sarvam_pace":             1.2,
    "sarvam_v3_sample_rate":   24000,
    "sarvam_v2_sample_rate":   22050,
    "sarvam_output_bitrate":   "64k",
    "sarvam_output_codec":     "opus",
    "sarvam_min_buffer":       30,
    "sarvam_max_chunk":        150,
    "sarvam_v2_pitch":         0.0,
    "sarvam_v2_loudness":      1.0,
    "sarvam_temperature":      0.4,
    "deepgram_endpointing_ms": 500,
}

_LANG_MAP: dict[str, str] = {
    "hi":    "hi-IN",
    "en":    "en-IN",
    "en-US": "en-IN",
    "hi-IN": "hi-IN",
}


def _map_language(language: str, fallback: str | None = None) -> str:
    return _LANG_MAP.get(language, fallback or language)


def build_cartesia_tts(
    language: str = "en",
    model: str = _CARTESIA_DEFAULT_MODEL,
    voice_id: str = _CARTESIA_DEFAULT_VOICE,
    extra_kwargs: dict[str, Any] | None = None,
):
    api_key = os.getenv("CARTESIA_API_KEY")
    if not api_key:
        raise RuntimeError("CARTESIA_API_KEY is not set")
    tts_kwargs: dict[str, Any] = {
        "model":    _cartesia_plugin_model(model, _CARTESIA_DEFAULT_MODEL),
        "voice":    voice_id,
        "language": language,
        "api_key":  api_key,
        "speed":    _PROVIDER_DEFAULTS["cartesia_speed"],
    }
    if extra_kwargs:
        tts_kwargs.update(extra_kwargs)
    return cartesia.TTS(**tts_kwargs)


def build_sarvam_tts(
    language: str = "en-IN",
    model: str = "bulbul:v3",
    voice_id: str = "shubh",
):
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")
    d = _PROVIDER_DEFAULTS
    is_v2 = "v2" in model
    tts_kwargs: dict[str, Any] = {
        "target_language_code": _map_language(language, language),
        "model":                model,
        "speaker":              voice_id,
        "api_key":              api_key,
        "pace":                 d["sarvam_pace"],
        "speech_sample_rate":   d["sarvam_v2_sample_rate"] if is_v2 else d["sarvam_v3_sample_rate"],
        "output_audio_bitrate": d["sarvam_output_bitrate"],
        "output_audio_codec":   d["sarvam_output_codec"],
        "min_buffer_size":      d["sarvam_min_buffer"],
        "max_chunk_length":     d["sarvam_max_chunk"],
        # Explicitly request stream-completion events so the client can
        # terminate WS playback cleanly at end-of-speech.
        "send_completion_event": True,
    }
    if is_v2:
        tts_kwargs.update({
            "pitch":                d["sarvam_v2_pitch"],
            "loudness":             d["sarvam_v2_loudness"],
            "enable_preprocessing": True,
            # v2-only option
            "enable_cached_responses": True,
        })
    else:
        tts_kwargs["temperature"] = d["sarvam_temperature"]

    tts = sarvam.TTS(**tts_kwargs)
    return tts


def _elevenlabs_supported_params() -> set[str]:
    if elevenlabs is None:
        return set()
    try:
        sig = inspect.signature(elevenlabs.TTS.__init__)
        return set(sig.parameters.keys()) - {"self"}
    except Exception:
        return set()


def build_elevenlabs_tts(
    language: str = "en",
    model: str = _ELEVENLABS_DEFAULT_MODEL,
    voice_id: str = "",
):
    if elevenlabs is None:
        raise RuntimeError("livekit elevenlabs plugin is not installed")
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set")

    supported = _elevenlabs_supported_params()
    tts_kwargs: dict[str, Any] = {}
    if "api_key" in supported:
        tts_kwargs["api_key"] = api_key
    if "model" in supported:
        tts_kwargs["model"] = model or _ELEVENLABS_DEFAULT_MODEL
    elif "model_id" in supported:
        tts_kwargs["model_id"] = model or _ELEVENLABS_DEFAULT_MODEL
    if "voice" in supported:
        tts_kwargs["voice"] = voice_id
    elif "voice_id" in supported:
        tts_kwargs["voice_id"] = voice_id
    if "language" in supported:
        tts_kwargs["language"] = language

    return elevenlabs.TTS(**tts_kwargs)


def _deepgram_supported_params() -> set[str]:
    try:
        sig = inspect.signature(deepgram.STT.__init__)
        return set(sig.parameters.keys()) - {"self"}
    except Exception:
        return set()


def build_stt(language_code: str = "en", model: str = STT_MODEL):
    supported = _deepgram_supported_params()

    base_kwargs: dict[str, Any] = {
        "model":           model,
        "smart_format":    True,
        "language":        language_code,
        "interim_results": True,
        "punctuate":       True,
    }
    if "nova" in model.lower() and "enable_diarization" in supported:
        base_kwargs["enable_diarization"] = True

    ep_ms = _PROVIDER_DEFAULTS["deepgram_endpointing_ms"]
    if "endpointing_ms" in supported:
        base_kwargs["endpointing_ms"] = ep_ms
    elif "endpointing" in supported:
        base_kwargs["endpointing"] = ep_ms

    safe_kwargs = {k: v for k, v in base_kwargs.items() if k in supported} if supported else base_kwargs

    logger.info(
        "[STT] Deepgram config: model=%s language=%s diarization=%s ep_ms=%s",
        safe_kwargs.get("model"),
        safe_kwargs.get("language"),
        bool(safe_kwargs.get("enable_diarization", False)),
        safe_kwargs.get("endpointing_ms", safe_kwargs.get("endpointing", "n/a")),
    )
    return deepgram.STT(**safe_kwargs)


def build_llm(model: str = LLM_MODEL, temperature: float = 0.6):
    return openai.LLM(model=model, temperature=temperature)


def build_vad():
    return silero.VAD.load()
