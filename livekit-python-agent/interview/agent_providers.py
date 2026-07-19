"""
agent_providers.py
==================
Provider factory layer for TTS, STT, and LLM plugins.
Supported providers:
  TTS: Sarvam, ElevenLabs (routed via ttsProvider in agent_runtime)
  STT: Deepgram Flux (native EOT turn detection)
  LLM: OpenAI only
"""
from __future__ import annotations
import os
from typing import Any, Sequence
from livekit.plugins import deepgram, openai, sarvam
try:
    from livekit.plugins import elevenlabs
except Exception:  # pragma: no cover
    elevenlabs = None
from interview.agent_runtime_support import (
    FLUX_EOT_THRESHOLD,
    FLUX_EAGER_EOT_THRESHOLD,
    FLUX_EOT_TIMEOUT_MS,
    logger,
)
_ELEVENLABS_DEFAULT_MODEL = "eleven_turbo_v2_5"
_ELEVENLABS_DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"  # ElevenLabs Rachel
_SARVAM_DEFAULT_SPEAKER = "priya"
_SARVAM_VALID_SPEAKERS = frozenset({
    "shubh", "ritu", "rahul", "pooja", "simran", "kavya", "amit", "ratan",
    "rohan", "dev", "ishita", "shreya", "manan", "sumit", "priya", "aditya",
    "kabir", "neha", "varun", "roopa", "aayan", "ashutosh", "advait",
    "amelia", "sophia",
})
_PROVIDER_DEFAULTS: dict[str, Any] = {
    "sarvam_pace":             1.2,
    # bulbul:v3 -- per Sarvam docs (https://docs.sarvam.ai/api-reference-docs/text-to-speech/stream)
    # 22050 Hz is recommended for streaming (24000 is higher quality but slower to generate)
    "sarvam_v3_sample_rate":   22050,
    "sarvam_v2_sample_rate":   22050,
    # 128k (LiveKit doc default) over 64k -- an interview call runs 15-20+ minutes
    # continuously, so sustained audio quality for the whole call matters more here
    # than shaving latency off the very first chunk. Candidates listen closely to
    # understand nuanced questions; a lower bitrate persists as a quality cost for
    # the entire session, not just the opening moment.
    "sarvam_output_bitrate":   "128k",
    "sarvam_output_codec":     "mp3",
    # min_buffer_size = chars before Sarvam starts processing (not frames/bytes).
    # Raised from the doc-minimum of 30 -- at 30, Sarvam frequently started generating
    # audio for a ~4-6 word fragment on its own, giving each fragment its own prosody/
    # tone and producing disjointed word-by-word delivery ("hello" in one tone, then
    # the rest of the sentence). 80 keeps chunks closer to a full clause so prosody
    # carries across the sentence, at a small cost to time-to-first-audio.
    "sarvam_min_buffer":       80,
    # max_chunk_length = chars per chunk. Raised alongside min_buffer_size so Sarvam
    # isn't forced to cut a clause short right after crossing the new buffer floor.
    "sarvam_max_chunk":        220,
    "sarvam_v2_pitch":         0.0,
    "sarvam_v2_loudness":      1.0,
    # Changed from 0.80. bulbul:v3 only, range 0.01-2.0, plugin default 0.6.
    # 0.80 was in the "too expressive for structured interviews, responses vary
    # noticeably" zone -- likely the cause of halting, inconsistent delivery.
    # 0.3-0.4 is robotic/monotonous (fine for announcements, not interviews).
    # 0.5 is the professional-yet-natural sweet spot for an interviewer voice.
    "sarvam_temperature":      0.5,
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
def build_sarvam_tts(
    language: str = "en-IN",
    model: str = "bulbul:v3",
    voice_id: str = "priya",
    speed: float | None = None,
    dict_id: str | None = None,
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
    # Reject UUID-format IDs (Cartesia/ElevenLabs voices) or unknown speaker names
    # that leaked from the org's voiceId DB field when switching TTS providers.
    if not voice_id or "-" in voice_id or voice_id.lower() not in _SARVAM_VALID_SPEAKERS:
        logger.warning(
            "[SARVAM_TTS] Speaker %r is not a valid Sarvam speaker — falling back to %r",
            voice_id, _SARVAM_DEFAULT_SPEAKER,
        )
        voice_id = _SARVAM_DEFAULT_SPEAKER
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
        "pace":                 speed if speed is not None else d["sarvam_pace"],
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
        # enable_preprocessing is v2-only in the plugin's send_task -- the plugin
        # silently drops it for v3. v3 always preprocesses server-side. No-op here.
        # dict_id: server-side pronunciation dictionary (v3 only). Passes custom
        # pronunciations (kubernetes, vite, etc.) so the TTS engine gets them right
        # without any client-side text mangling.
        if dict_id:
            tts_kwargs["dict_id"] = dict_id
    # Return sarvam.TTS directly -- fresh WS per turn, no persistent connection.
    # The persistent-WS manager caused "no audio frames" failures because Sarvam
    # closes the socket after each "final" event and reusing it produced a silent
    # ACK on the next turn. Fresh-per-turn is reliable and simple.
    return sarvam.TTS(**tts_kwargs)
def build_elevenlabs_tts(
    language: str = "en",
    model: str = _ELEVENLABS_DEFAULT_MODEL,
    voice_id: str = "",
    speed: float | None = None,
    pronunciation_dict_locators: list | None = None,
):
    if elevenlabs is None:
        raise RuntimeError("livekit-plugins-elevenlabs is not installed")
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set")
    # Reject Cartesia UUIDs or empty IDs that leaked from the DB
    if not voice_id or "-" in voice_id:
        voice_id = _ELEVENLABS_DEFAULT_VOICE
    resolved_model = model or _ELEVENLABS_DEFAULT_MODEL
    voice_settings = elevenlabs.VoiceSettings(
        # 0.35 -- low stability = more emotional variation per sentence.
        # High stability sounds robotic/monotone; 0.35 lets the voice
        # respond to the emotional weight of what it's saying.
        stability=0.35,
        # 0.85 -- high fidelity to the original voice recording.
        # Keeps the voice sounding like itself even with low stability.
        similarity_boost=0.85,
        # 0.25 -- small non-zero style amplifies the voice's natural
        # expressiveness. Zero is flat; anything above 0.4 adds latency.
        style=0.25,
        # True -- speaker boost enhances clarity and presence on turbo_v2_5.
        # Worth the small latency cost for interview quality on this model.
        use_speaker_boost=True,
        # 0.95 -- very slightly below 1.0 gives a calmer, more considered
        # interviewer pace. Turbo is already fast; 0.95 keeps it natural.
        speed=speed if speed is not None else 0.95,
    )
    logger.info(
        "[ELEVENLABS_TTS] model=%s voice=%s language=%s api_key_len=%d",
        resolved_model, voice_id, language, len(api_key),
    )
    tts_kwargs: dict[str, Any] = {
        "api_key":               api_key,
        "model":                 resolved_model,
        "voice_id":              voice_id,
        "voice_settings":        voice_settings,
        # 'auto' lets ElevenLabs decide -- 'on' was spelling out tech terms letter-by-letter.
        "apply_text_normalization": "auto",
        # SSML off -- we don't send SSML tags.
        "enable_ssml_parsing":   False,
        # No chunk_length_schedule → auto_mode=True → ElevenLabs uses its own SentenceTokenizer.
        # This is better than our manual chunking: it waits for full phrases before synthesizing
        # so names like "Multi Channel Lead Qualification System" are spoken as a whole, not letter-by-letter.
        # sync_alignment=True: word-level timing (default True, explicit for visibility).
        "sync_alignment":        True,
    }
    if pronunciation_dict_locators:
        tts_kwargs["pronunciation_dictionary_locators"] = pronunciation_dict_locators
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
def build_stt(language_code: str = "en", keyterms: Sequence[str] | None = None, model_override: str | None = None):
    """Build a Deepgram STTv2 instance. model_override comes from org DB (set in Super Admin → AI Models).
    When not overridden, flux-general-en is used for English and flux-general-multi for other languages.
    """
    is_multilingual = language_code not in ("en", "en-US", "en-IN", "en-GB")
    if model_override and model_override.strip():
        resolved_model = model_override.strip()
    else:
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
    # Only enable if FLUX_EAGER_EOT_THRESHOLD is set (non-None) -- requires that
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
def build_llm(model: str, temperature: float = 0.6):
    return openai.LLM(model=model, temperature=temperature)
