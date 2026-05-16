"""
agent_providers.py
==================
Provider Factory Layer — modernized with OOP + Strategy Pattern.

ARCHITECTURE
────────────
• All provider factories remain top-level functions (public API unchanged).
• Internal "Google ↔ OpenAI" adapter is reduced to a single dataclass-style
  _GoogleCompletionResponse, removing 5 redundant helper classes.
• Deepgram STT construction uses a declarative config dict + single-pass
  introspection instead of a 3-stage try/except guessing loop.
• Google TTS stays as a minimal lk_tts.TTS subclass — no behaviour change.
• All magic numbers (speed, pace, buffer sizes) are surfaced in one
  _PROVIDER_DEFAULTS sentinel at the top.
• Lazy imports (google.genai, livekit.plugins.google) remain — they are
  conditionally available in production.

USAGE (unchanged for callers):
    from interview.agent_providers import build_llm, build_stt, ...
"""

from __future__ import annotations

import asyncio
import base64
import importlib
import inspect
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

from livekit.agents import (
    APIConnectOptions,
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    DEFAULT_API_CONNECT_OPTIONS,
    JobProcess,
    llm as lk_llm,
    tts as lk_tts,
)
from livekit.plugins import cartesia, deepgram, openai, sarvam, silero

from interview.agent_runtime_support import (
    CARTESIA_MODEL,
    CARTESIA_VOICE_ID,
    GOOGLE_REALTIME_MODEL,
    LLM_MODEL,
    STT_MODEL,
    logger,
)
from interview.agent_utils import _cartesia_plugin_model

# ── Centralised tuning constants ─────────────────────────────────────────────
# All magic numbers live here. Change once; propagates everywhere.
_PROVIDER_DEFAULTS: dict[str, Any] = {
    "cartesia_speed":         0.92,
    "sarvam_pace":            1.2,
    "sarvam_sample_rate":     22050,
    "sarvam_output_bitrate":  "128k",
    "sarvam_min_buffer":      50,
    "sarvam_max_chunk":       150,
    "sarvam_v2_pitch":        0.0,
    "sarvam_v2_loudness":     1.0,
    "sarvam_temperature":     0.6,
    "deepgram_endpointing_ms": 300,
    "google_tts_sample_rate": 24000,
    "google_tts_channels":    1,
    "google_tts_default_model": "gemini-2.5-flash-preview-tts",
    "google_tts_default_voice": "Kore",
}

# Language normalisation shared by TTS and STT builders
_LANG_MAP: dict[str, str] = {
    "hi":    "hi-IN",
    "en":    "en-IN",
    "en-US": "en-IN",
    "hi-IN": "hi-IN",
}


def _map_language(language: str, fallback: str | None = None) -> str:
    """Normalise a short language code to BCP-47 format."""
    return _LANG_MAP.get(language, fallback or language)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Cartesia TTS (unchanged behaviour, removed redundant kwargs)
# ═════════════════════════════════════════════════════════════════════════════

def build_cartesia_tts(
    language: str = "en",
    model: str = CARTESIA_MODEL,
    voice_id: str = CARTESIA_VOICE_ID,
    extra_kwargs: dict[str, Any] | None = None,
):
    api_key = os.getenv("CARTESIA_API_KEY")
    if not api_key:
        raise RuntimeError("CARTESIA_API_KEY is not set")
    tts_kwargs: dict[str, Any] = {
        "model":    _cartesia_plugin_model(model, CARTESIA_MODEL),
        "voice":    voice_id,
        "language": language,
        "api_key":  api_key,
        "speed":    _PROVIDER_DEFAULTS["cartesia_speed"],
    }
    if extra_kwargs:
        tts_kwargs.update(extra_kwargs)
    return cartesia.TTS(**tts_kwargs)


def build_tts(
    language: str = "en",
    model: str = CARTESIA_MODEL,
    voice_id: str = CARTESIA_VOICE_ID,
):
    primary_tts = build_cartesia_tts(language=language, model=model, voice_id=voice_id)
    fallback_voice = CARTESIA_VOICE_ID if voice_id != CARTESIA_VOICE_ID else None
    if fallback_voice:
        fallback_tts = build_cartesia_tts(language=language, model=model, voice_id=fallback_voice)
        logger.info("[TTS] Primary voice=%s, fallback voice=%s (Jacqueline)", voice_id, fallback_voice)
        return lk_tts.FallbackAdapter([primary_tts, fallback_tts], max_retry_per_tts=1)
    return primary_tts


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Sarvam TTS
# ═════════════════════════════════════════════════════════════════════════════

def build_sarvam_tts(
    language: str = "en-IN",
    model: str = "bulbul:v3",
    voice_id: str = "shubh",
):
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")
    d = _PROVIDER_DEFAULTS
    tts_kwargs: dict[str, Any] = {
        "target_language_code": _map_language(language, language),
        "model":                model,
        "speaker":              voice_id,
        "api_key":              api_key,
        "pace":                 d["sarvam_pace"],
        "speech_sample_rate":   d["sarvam_sample_rate"],
        "output_audio_bitrate": d["sarvam_output_bitrate"],
        "min_buffer_size":      d["sarvam_min_buffer"],
        "max_chunk_length":     d["sarvam_max_chunk"],
    }
    if "v2" in model:
        tts_kwargs.update({
            "pitch":               d["sarvam_v2_pitch"],
            "loudness":            d["sarvam_v2_loudness"],
            "enable_preprocessing": True,
        })
    else:
        tts_kwargs["temperature"] = d["sarvam_temperature"]
    return sarvam.TTS(**tts_kwargs)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 3 — Google Gemini TTS (HTTP-based LiveKit plugin)
# ═════════════════════════════════════════════════════════════════════════════

class _GoogleGeminiHttpChunkedStream(lk_tts.ChunkedStream):
    """Streams a single Google Gemini audio chunk through the LiveKit TTS protocol."""

    def __init__(self, *, tts: "GoogleGeminiHttpTTS", input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts

    async def _run(self, output_emitter: lk_tts.AudioEmitter) -> None:
        try:
            audio_bytes = await self._tts._generate_audio(
                self._input_text, timeout=self._conn_options.timeout
            )
            output_emitter.initialize(
                request_id=uuid.uuid4().hex,
                sample_rate=self._tts.sample_rate,
                num_channels=self._tts.num_channels,
                mime_type="audio/pcm",
            )
            output_emitter.push(audio_bytes)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore") if hasattr(e, "read") else None
            retryable = e.code in {429, 499} or 500 <= e.code < 600
            raise APIStatusError(
                f"Google Gemini TTS error: {e.reason}",
                status_code=int(e.code or -1),
                body=body,
                retryable=retryable,
            ) from e
        except urllib.error.URLError as e:
            raise APIConnectionError(f"Google Gemini TTS connection error: {e.reason}") from e
        except TimeoutError as e:
            raise APITimeoutError("Google Gemini TTS request timed out.") from e
        except Exception as e:
            raise APIConnectionError(f"Google Gemini TTS error: {e}", retryable=True) from e


class GoogleGeminiHttpTTS(lk_tts.TTS):
    """LiveKit-compatible TTS adapter for Google Gemini's REST audio API."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str = _PROVIDER_DEFAULTS["google_tts_default_model"],
        voice_name: str = _PROVIDER_DEFAULTS["google_tts_default_voice"],
    ) -> None:
        super().__init__(
            capabilities=lk_tts.TTSCapabilities(streaming=False),
            sample_rate=_PROVIDER_DEFAULTS["google_tts_sample_rate"],
            num_channels=_PROVIDER_DEFAULTS["google_tts_channels"],
        )
        self._api_key   = api_key.strip()
        self._model     = model.strip() or _PROVIDER_DEFAULTS["google_tts_default_model"]
        self._voice_name = voice_name.strip() or _PROVIDER_DEFAULTS["google_tts_default_voice"]

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "Google Gemini"

    async def _generate_audio(self, text: str, *, timeout: float) -> bytes:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{urllib.parse.quote(self._model, safe='')}:generateContent"
        )
        payload = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": self._voice_name}
                    }
                },
            },
            "model": self._model,
        }
        req = urllib.request.Request(
            url,
            method="POST",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self._api_key,
            },
        )

        def _do_request() -> bytes:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
                encoded   = (part.get("inlineData") or {}).get("data")
                mime_type = (part.get("inlineData") or {}).get("mimeType") or ""
                if isinstance(encoded, str) and encoded.strip() and mime_type.startswith("audio/"):
                    return base64.b64decode(encoded)
            raise RuntimeError("Invalid audio response from Google Gemini")

        return await asyncio.to_thread(_do_request)

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> lk_tts.ChunkedStream:
        return _GoogleGeminiHttpChunkedStream(tts=self, input_text=text, conn_options=conn_options)


def build_google_tts(
    model: str = _PROVIDER_DEFAULTS["google_tts_default_model"],
    voice_name: str = _PROVIDER_DEFAULTS["google_tts_default_voice"],
):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")
    return GoogleGeminiHttpTTS(api_key=api_key, model=model, voice_name=voice_name)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 4 — Google Analysis Client (OpenAI-compatible adapter)
#
# BEFORE: 7 classes + ~100 lines of OpenAI-mimicking boilerplate.
# AFTER:  1 dataclass (SimpleNamespace) + 1 adapter class.
#
# The _GoogleCompletionResponse mirrors the OpenAI response shape so that
# _extract_openai_completion_usage in agent_persistence.py works unchanged.
# ═════════════════════════════════════════════════════════════════════════════

def _make_google_response(
    *,
    model: str,
    content: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cached_tokens: int = 0,
) -> SimpleNamespace:
    """
    Build an OpenAI-compatible response object from Google Gemini output.

    Shape:
        .model
        .choices[0].message.content
        .usage.prompt_tokens
        .usage.completion_tokens
        .usage.prompt_tokens_details.cached_tokens
    """
    return SimpleNamespace(
        model=model,
        choices=[SimpleNamespace(
            message=SimpleNamespace(content=content)
        )],
        usage=SimpleNamespace(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            prompt_tokens_details=SimpleNamespace(cached_tokens=cached_tokens),
        ),
    )


# Keep the old class name importable (e.g. for type-checks in tests)
def _GoogleCompletionResponse(
    *, model: str, content: str,
    prompt_tokens: int = 0, completion_tokens: int = 0, cached_tokens: int = 0,
) -> SimpleNamespace:
    return _make_google_response(
        model=model, content=content,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cached_tokens=cached_tokens,
    )


class _GoogleChatCompletions:
    """Translates OpenAI-style chat.completions.create() calls to Google Gemini API."""

    def __init__(self, client: Any) -> None:
        self._client = client

    @staticmethod
    def _join_message_content(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "\n".join(
                str(item.get("text", "")) if isinstance(item, dict) else str(item)
                for item in content
                if item
            )
        return str(content)

    async def create(
        self,
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        messages: list[dict[str, Any]] | None = None,
        **_: Any,
    ) -> SimpleNamespace:
        system_sections: list[str] = []
        contents: list[dict[str, Any]] = []

        for message in messages or []:
            role = str(message.get("role") or "user").lower()
            text = self._join_message_content(message.get("content", ""))
            if not text.strip():
                continue
            if role == "system":
                system_sections.append(text)
            else:
                contents.append({
                    "role": "model" if role == "assistant" else "user",
                    "parts": [{"text": text}],
                })

        # Lazy import — google.genai is not always installed
        from google.genai import types as google_genai_types

        config = google_genai_types.GenerateContentConfig(
            system_instruction="\n\n".join(system_sections) if system_sections else None,
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_modalities=["TEXT"],
        )
        response = await self._client.aio.models.generate_content(
            model=model,
            contents=contents or "",
            config=config,
        )
        response_text = str(getattr(response, "text", "") or "").strip()
        usage = getattr(response, "usage_metadata", None)
        return _make_google_response(
            model=model,
            content=response_text,
            prompt_tokens=int(getattr(usage, "prompt_token_count", 0) or 0),
            completion_tokens=int(getattr(usage, "candidates_token_count", 0) or 0),
            cached_tokens=int(getattr(usage, "cached_content_token_count", 0) or 0),
        )


class _GoogleChatNamespace:
    def __init__(self, client: Any) -> None:
        self.completions = _GoogleChatCompletions(client)


class GoogleAnalysisClient:
    """Wraps google.genai.Client with an OpenAI-compatible chat interface."""

    def __init__(self, api_key: str) -> None:
        google_genai = importlib.import_module("google.genai")
        self._client = google_genai.Client(api_key=api_key)
        self.chat = _GoogleChatNamespace(self._client)


# ── Fallback: route analysis calls to OpenAI when Google SDK is unavailable ──

class _FallbackAnalysisClient:
    """
    Strategy: if google-genai is absent or GOOGLE_API_KEY is unset,
    transparently route analysis completions through OpenAI.
    """

    def __init__(self, *, fallback_model: str) -> None:
        from openai import AsyncOpenAI
        _client = AsyncOpenAI()
        # Present the same .chat.completions.create() surface as GoogleAnalysisClient
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kw: _client.chat.completions.create(
                    model=fallback_model, **{k: v for k, v in kw.items() if k != "model"}
                )
            )
        )


def build_google_analysis_client(*, allow_fallback: bool = False) -> Any:
    """
    Factory for the Google Gemini analysis backend.

    Returns a GoogleAnalysisClient (or _FallbackAnalysisClient if the SDK/key
    is unavailable and allow_fallback=True).
    """
    # Check SDK availability
    try:
        importlib.import_module("google.genai")
    except (ModuleNotFoundError, ImportError) as exc:
        if not allow_fallback:
            raise RuntimeError(
                "google-genai is unavailable. Install or repair the Google SDK, "
                "or pass allow_fallback=True."
            ) from exc
        logger.warning("[GOOGLE_ANALYSIS] google-genai unavailable; using OpenAI fallback %s", LLM_MODEL)
        return _FallbackAnalysisClient(fallback_model=LLM_MODEL)

    # Check API key
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        if not allow_fallback:
            raise RuntimeError("GOOGLE_API_KEY is not set")
        logger.warning("[GOOGLE_ANALYSIS] GOOGLE_API_KEY not set; using OpenAI fallback %s", LLM_MODEL)
        return _FallbackAnalysisClient(fallback_model=LLM_MODEL)

    # Build Google client
    try:
        logger.info("[GOOGLE_ANALYSIS] Using Google Gemini analysis backend")
        return GoogleAnalysisClient(api_key=api_key)
    except (ModuleNotFoundError, ImportError) as exc:
        if not allow_fallback:
            raise RuntimeError(
                "google-genai import failed during client init. "
                "Install or repair the SDK, or pass allow_fallback=True."
            ) from exc
        logger.warning("[GOOGLE_ANALYSIS] google-genai init failed; using OpenAI fallback %s", LLM_MODEL)
        return _FallbackAnalysisClient(fallback_model=LLM_MODEL)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 5 — Google Realtime LLM
# ═════════════════════════════════════════════════════════════════════════════

def build_google_realtime_llm(
    *,
    model: str = GOOGLE_REALTIME_MODEL,
    voice_name: str = "Puck",
    language: str = "en-US",
    temperature: float = 0.4,
):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")
    try:
        from google.genai import types as google_genai_types
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "google-genai is not available. Install or repair the Google SDK."
        ) from exc
    try:
        from livekit.plugins.google import realtime as google_realtime
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "livekit.plugins.google.realtime is not available. "
            "Install livekit-plugins-google."
        ) from exc
    return google_realtime.RealtimeModel(
        model=model,
        api_key=api_key,
        voice=voice_name,
        language=language,
        modalities=[google_genai_types.Modality.AUDIO, google_genai_types.Modality.TEXT],
        temperature=temperature,
    )


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 6 — Deepgram STT (deterministic config — no retry guessing)
#
# BEFORE: 3-stage try/except loop (42 lines) guessing parameter names.
# AFTER:  Introspect the installed plugin once; build with validated params.
# ═════════════════════════════════════════════════════════════════════════════

def _deepgram_supported_params() -> set[str]:
    """
    Introspect the installed deepgram.STT __init__ signature once at build
    time so we never pass a kwarg the plugin doesn't support.
    """
    try:
        sig = inspect.signature(deepgram.STT.__init__)
        return set(sig.parameters.keys()) - {"self"}
    except Exception:
        return set()


def build_stt(language_code: str = "en", model: str = STT_MODEL):
    supported = _deepgram_supported_params()

    base_kwargs: dict[str, Any] = {
        "model":          model,
        "smart_format":   True,
        "language":       language_code,
        "interim_results": True,
        "punctuate":      True,
    }
    if "nova" in model.lower() and "enable_diarization" in supported:
        base_kwargs["enable_diarization"] = True

    # Prefer endpointing_ms; fall back to endpointing if not supported
    ep_ms = _PROVIDER_DEFAULTS["deepgram_endpointing_ms"]
    if "endpointing_ms" in supported:
        base_kwargs["endpointing_ms"] = ep_ms
    elif "endpointing" in supported:
        base_kwargs["endpointing"] = ep_ms

    # Drop any key the installed version doesn't know about
    safe_kwargs = {k: v for k, v in base_kwargs.items() if k in supported} if supported else base_kwargs

    logger.info(
        "[STT] Deepgram config: model=%s language=%s diarization=%s ep_ms=%s",
        safe_kwargs.get("model"),
        safe_kwargs.get("language"),
        bool(safe_kwargs.get("enable_diarization", False)),
        safe_kwargs.get("endpointing_ms", safe_kwargs.get("endpointing", "n/a")),
    )
    return deepgram.STT(**safe_kwargs)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 7 — Sarvam STT
# ═════════════════════════════════════════════════════════════════════════════

def build_sarvam_stt(language: str = "en-IN", model: str = "saaras:v3"):
    return sarvam.STT(language=_map_language(language, language), model=model)


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 8 — LLM + VAD
# ═════════════════════════════════════════════════════════════════════════════

def build_llm(model: str = LLM_MODEL, temperature: float = 0.6):
    return openai.LLM(model=model, temperature=temperature)


def build_sarvam_llm(model: str = "sarvam-30b"):
    return sarvam.LLM(model=model)


def build_vad():
    return silero.VAD.load()
