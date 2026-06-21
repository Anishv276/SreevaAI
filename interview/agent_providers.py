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
from typing import Any, Sequence
from livekit.plugins import cartesia, deepgram, openai, sarvam
try:
    from livekit.plugins import elevenlabs  # type: ignore[attr-defined]
except Exception:  # pragma: no cover - plugin may not be installed in all environments
    elevenlabs = None
from interview.agent_runtime_support import (
    LLM_MODEL,
    FLUX_EOT_THRESHOLD,
    FLUX_EAGER_EOT_THRESHOLD,
    FLUX_EOT_TIMEOUT_MS,
    logger,
)
from interview.agent_utils import _cartesia_plugin_model
_CARTESIA_DEFAULT_MODEL = "cartesia/sonic-3"
_CARTESIA_DEFAULT_VOICE = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
_ELEVENLABS_DEFAULT_MODEL = "eleven_turbo_v2_5"
_PROVIDER_DEFAULTS: dict[str, Any] = {
    "cartesia_speed":          0.92,
    "sarvam_pace":             1.2,
    # bulbul:v3 -- per Sarvam docs (https://docs.sarvam.ai/api-reference-docs/text-to-speech/stream)
    # 22050 Hz is recommended for streaming (24000 is higher quality but slower to generate)
    "sarvam_v3_sample_rate":   22050,
    "sarvam_v2_sample_rate":   22050,
    # 64k is optimal for low-latency streaming per Sarvam docs -- 128k adds generation overhead
    "sarvam_output_bitrate":   "64k",
    "sarvam_output_codec":     "mp3",
    # min_buffer_size = chars before Sarvam starts processing (not frames/bytes).
    # 30 is the Sarvam-recommended minimum -- below this Sarvam may cut off incomplete words.
    "sarvam_min_buffer":       30,
    # max_chunk_length = chars per chunk. 100-150 per docs -- keeps latency low for conversational
    # responses. 150 is the sweet spot: short enough for fast first-chunk, long enough for fluency.
    "sarvam_max_chunk":        150,
    "sarvam_v2_pitch":         0.0,
    "sarvam_v2_loudness":      1.0,
    "sarvam_temperature":      0.4,
    # WS connect/send timeout. Sarvam closes idle connections after 60s -- keepalive pings every
    # 20s prevent this. recv timeout is set separately to 90s in _recv_task.
    "sarvam_ws_timeout_sec":   25,
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
        raise RuntimeError(
            "SARVAM_API_KEY is not set. "
            "To fix: export SARVAM_API_KEY='your-api-key-here' "
            "Get your API key from: https://console.sarvam.ai/settings/api-keys"
        )
    # FIX: Validate API key format to catch misconfigurations early
    if not isinstance(api_key, str) or len(api_key.strip()) < 10:
        raise RuntimeError(
            f"SARVAM_API_KEY appears invalid (length={len(api_key)}). "
            f"Expected at least 10 characters. "
            f"Verify your key at: https://console.sarvam.ai/settings/api-keys"
        )
    logger.info(
        f"[SARVAM_TTS] Initializing TTS: model={model} language={language} voice={voice_id} "
        f"api_key_len={len(api_key)}"
    )
    d = _PROVIDER_DEFAULTS
    is_v2 = "v2" in model
    # PRODUCTION FIX: Add WebSocket timeout to prevent "Cannot write to closing transport" on idle
    # Sarvam closes connections after 60s inactivity - timeout forces early reconnection before that
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
    # Return sarvam.TTS directly — fresh WS per turn, no persistent connection.
    # The persistent-WS manager caused "no audio frames" failures because Sarvam
    # closes the socket after each "final" event and reusing it produced a silent
    # ACK on the next turn. Fresh-per-turn is reliable and simple.
    return sarvam.TTS(**tts_kwargs)
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
# Base keyterms that are always included regardless of role/JD.
# Extra role/resume/JD terms can be passed at STT construction time. Avoid
# updating LiveKit STTv2 mid-stream: in livekit-plugins-deepgram 1.5.x,
# update_options() reconnects instead of sending Deepgram's raw Configure message.
_FLUX_BASE_KEYTERMS: list[str] = [
    "instantly", "heyreach", "n8n",
]
def _merge_flux_keyterms(extra_keyterms: Sequence[str] | None = None) -> list[str]:
    """Return Flux keyterms deduped in order and capped to Deepgram's limit."""
    merged: list[str] = []
    seen: set[str] = set()
    for term in [*_FLUX_BASE_KEYTERMS, *(extra_keyterms or [])]:
        cleaned = " ".join(str(term or "").strip().split())
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        merged.append(cleaned)
        if len(merged) >= 100:
            break
    return merged
def build_stt(language_code: str = "en", keyterms: Sequence[str] | None = None):
    """Build a Deepgram Flux STTv2 instance for live interview sessions.
    Flux uses /v2/listen (not /v1). Turn detection is native — EOT events replace
    endpointing_ms. VAD (Silero) is still passed to AgentSession for barge-in handling.
    Language: flux-general-en for English-only, flux-general-multi for multilingual.
    For Hindi (Sarvam TTS sessions), pass language_code="hi" to use flux-general-multi.
    """
    # Resolve model: multilingual model when non-English language requested.
    # language_hint is only valid on flux-general-multi — sending it to flux-general-en
    # returns HTTP 400. For English we always use flux-general-en (better accuracy).
    is_multilingual = language_code not in ("en", "en-US", "en-IN", "en-GB")
    resolved_model = "flux-general-multi" if is_multilingual else "flux-general-en"
    flux_keyterms = _merge_flux_keyterms(keyterms)
    stt_kwargs: dict[str, Any] = {
        "model":          resolved_model,
        "sample_rate":    16000,
        "eot_threshold":  FLUX_EOT_THRESHOLD,
        "eot_timeout_ms": FLUX_EOT_TIMEOUT_MS,
        # mip_opt_out: candidate interview audio should not be used for model training.
        "mip_opt_out":    True,
        "keyterm":        flux_keyterms,
    }
    # eager_eot_threshold: fires EagerEndOfTurn ~200ms earlier to pre-warm LLM.
    # Only enable if FLUX_EAGER_EOT_THRESHOLD is set (non-None) — requires that
    # the eval gate handles TurnResumed cancellation to avoid double-firing.
    if FLUX_EAGER_EOT_THRESHOLD is not None:
        stt_kwargs["eager_eot_threshold"] = FLUX_EAGER_EOT_THRESHOLD
    # language_hint: bias language detection for flux-general-multi.
    # For Hindi sessions, hint both hi+en (code-switching is common in Indian interviews).
    if is_multilingual:
        lang_hint_map: dict[str, list[str]] = {
            "hi":    ["hi", "en"],
            "hi-IN": ["hi", "en"],
        }
        hints = lang_hint_map.get(language_code, [language_code])
        stt_kwargs["language_hint"] = hints
    logger.info(
        "[STT] Flux config: model=%s eot_threshold=%s eager_eot=%s eot_timeout_ms=%s"
        " multilingual=%s language_hint=%s mip_opt_out=True keyterm_count=%d keyterms=%s",
        resolved_model,
        FLUX_EOT_THRESHOLD,
        FLUX_EAGER_EOT_THRESHOLD,
        FLUX_EOT_TIMEOUT_MS,
        is_multilingual,
        stt_kwargs.get("language_hint"),
        len(flux_keyterms),
        flux_keyterms,
    )
    stt_v2 = deepgram.STTv2(**stt_kwargs)
    # Mark engine and turn detection mode so agent_runtime can read them without
    # importing deepgram directly or doing isinstance checks.
    setattr(stt_v2, "_hr_stt_engine", "deepgram_flux")
    setattr(stt_v2, "_hr_turn_detection_mode", "stt")
    return stt_v2
def build_llm(model: str = LLM_MODEL, temperature: float = 0.6):
    return openai.LLM(model=model, temperature=temperature)
