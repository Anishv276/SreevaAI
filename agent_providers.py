from __future__ import annotations
import asyncio
import base64
import importlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
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
from agent_runtime_support import (
    CARTESIA_MODEL,
    CARTESIA_VOICE_ID,
    GOOGLE_REALTIME_MODEL,
    LLM_MODEL,
    STT_MODEL,
    logger,
)
from agent_utils import _cartesia_plugin_model
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
        "model": _cartesia_plugin_model(model, CARTESIA_MODEL),
        "voice": voice_id,
        "language": language,
        "api_key": api_key,
        "speed": 0.92,
    }
    if extra_kwargs:
        tts_kwargs.update(extra_kwargs)
    return cartesia.TTS(**tts_kwargs)
def build_tts(
    language: str = "en", model: str = CARTESIA_MODEL, voice_id: str = CARTESIA_VOICE_ID
):
    primary_tts = build_cartesia_tts(language=language, model=model, voice_id=voice_id)
    fallback_voice = CARTESIA_VOICE_ID if voice_id != CARTESIA_VOICE_ID else None
    if fallback_voice:
        fallback_tts = build_cartesia_tts(language=language, model=model, voice_id=fallback_voice)
        logger.info(f"[TTS] Primary voice={voice_id}, fallback voice={fallback_voice} (Jacqueline)")
        return lk_tts.FallbackAdapter([primary_tts, fallback_tts], max_retry_per_tts=1)
    return primary_tts
def build_sarvam_tts(
    language: str = "en-IN", model: str = "bulbul:v3", voice_id: str = "shubh"
):
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")
    lang_map = {"hi": "hi-IN", "en": "en-IN"}
    mapped_lang = lang_map.get(language, language)
    tts_kwargs: dict[str, Any] = {
        "target_language_code": mapped_lang,
        "model": model,
        "speaker": voice_id,
        "api_key": api_key,
        "pace": 1.1,
        "speech_sample_rate": 22050,
        "output_audio_bitrate": "128k",
        "min_buffer_size": 50,
        "max_chunk_length": 150,
    }
    if "v2" in model:
        tts_kwargs["pitch"] = 0.0
        tts_kwargs["loudness"] = 1.0
        tts_kwargs["enable_preprocessing"] = True
    else:
        tts_kwargs["temperature"] = 0.6
    return sarvam.TTS(**tts_kwargs)
class _GoogleGeminiHttpChunkedStream(lk_tts.ChunkedStream):
    def __init__(self, *, tts: "GoogleGeminiHttpTTS", input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts
    async def _run(self, output_emitter: lk_tts.AudioEmitter) -> None:
        try:
            audio_bytes = await self._tts._generate_audio(self._input_text, timeout=self._conn_options.timeout)
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
    def __init__(self, *, api_key: str, model: str = "gemini-2.5-flash-preview-tts", voice_name: str = "Kore") -> None:
        super().__init__(
            capabilities=lk_tts.TTSCapabilities(streaming=False),
            sample_rate=24000,
            num_channels=1,
        )
        self._api_key = api_key.strip()
        self._model = model.strip() or "gemini-2.5-flash-preview-tts"
        self._voice_name = voice_name.strip() or "Kore"
    @property
    def model(self) -> str:
        return self._model
    @property
    def provider(self) -> str:
        return "Google Gemini"
    async def _generate_audio(self, text: str, *, timeout: float) -> bytes:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(self._model, safe='')}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": self._voice_name,
                        }
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
                raw = resp.read()
            data = json.loads(raw.decode("utf-8"))
            inline_data = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            for part in inline_data:
                encoded = (part.get("inlineData") or {}).get("data")
                mime_type = (part.get("inlineData") or {}).get("mimeType") or ""
                if isinstance(encoded, str) and encoded.strip() and mime_type.startswith("audio/"):
                    return base64.b64decode(encoded)
            raise RuntimeError("Invalid audio response from Google Gemini")
        return await asyncio.to_thread(_do_request)
    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> lk_tts.ChunkedStream:
        return _GoogleGeminiHttpChunkedStream(tts=self, input_text=text, conn_options=conn_options)
def build_google_tts(model: str = "gemini-2.5-flash-preview-tts", voice_name: str = "Kore"):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")
    return GoogleGeminiHttpTTS(api_key=api_key, model=model, voice_name=voice_name)
class _GoogleCompletionPromptDetails:
    def __init__(self, cached_tokens: int = 0) -> None:
        self.cached_tokens = cached_tokens
class _GoogleCompletionUsage:
    def __init__(self, prompt_tokens: int = 0, completion_tokens: int = 0, cached_tokens: int = 0) -> None:
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.prompt_tokens_details = _GoogleCompletionPromptDetails(cached_tokens=cached_tokens)
class _GoogleCompletionMessage:
    def __init__(self, content: str) -> None:
        self.content = content
class _GoogleCompletionChoice:
    def __init__(self, content: str) -> None:
        self.message = _GoogleCompletionMessage(content)
class _GoogleCompletionResponse:
    def __init__(self, *, model: str, content: str, prompt_tokens: int = 0, completion_tokens: int = 0, cached_tokens: int = 0) -> None:
        self.model = model
        self.choices = [_GoogleCompletionChoice(content)]
        self.usage = _GoogleCompletionUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cached_tokens=cached_tokens,
        )
class _GoogleChatCompletions:
    def __init__(self, client: Any) -> None:
        self._client = client
    @staticmethod
    def _join_message_content(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            pieces: list[str] = []
            for item in content:
                if isinstance(item, str):
                    pieces.append(item)
                elif isinstance(item, dict):
                    text = item.get("text")
                    if text:
                        pieces.append(str(text))
            return "\n".join(piece for piece in pieces if piece)
        return str(content)
    async def create(self, *, model: str, temperature: float | None = None, max_tokens: int | None = None, messages: list[dict[str, Any]] | None = None, **_: Any) -> _GoogleCompletionResponse:
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
                contents.append(
                    {
                        "role": "model" if role == "assistant" else "user",
                        "parts": [{"text": text}],
                    }
                )
        from google.genai import types as google_genai_types
        config = google_genai_types.GenerateContentConfig(
            systemInstruction="\n\n".join(system_sections) if system_sections else None,
            temperature=temperature,
            maxOutputTokens=max_tokens,
            responseModalities=["TEXT"],
        )
        response = await self._client.aio.models.generate_content(
            model=model,
            contents=contents or "",
            config=config,
        )
        response_text = str(getattr(response, "text", "") or "").strip()
        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0)
        completion_tokens = int(getattr(usage, "candidates_token_count", 0) or 0)
        cached_tokens = int(getattr(usage, "cached_content_token_count", 0) or 0)
        return _GoogleCompletionResponse(
            model=model,
            content=response_text,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cached_tokens=cached_tokens,
        )
class _GoogleChatNamespace:
    def __init__(self, client: Any) -> None:
        self.completions = _GoogleChatCompletions(client)
class _FallbackAnalysisCompletions:
    def __init__(self, client: Any, fallback_model: str) -> None:
        self._client = client
        self._fallback_model = fallback_model
    async def create(self, *, model: str, **kwargs: Any) -> Any:
        # Keep the Google-mode call sites working even when the Google SDK is
        # unavailable by routing analysis through OpenAI instead.
        return await self._client.chat.completions.create(
            model=self._fallback_model,
            **kwargs,
        )
class _FallbackAnalysisChatNamespace:
    def __init__(self, client: Any, fallback_model: str) -> None:
        self.completions = _FallbackAnalysisCompletions(client, fallback_model)
class _FallbackAnalysisClient:
    def __init__(self, *, fallback_model: str) -> None:
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI()
        self.chat = _FallbackAnalysisChatNamespace(self._client, fallback_model)
class GoogleAnalysisClient:
    def __init__(self, api_key: str) -> None:
        google_genai = importlib.import_module("google.genai")
        self._client = google_genai.Client(api_key=api_key)
        self.chat = _GoogleChatNamespace(self._client)
def build_google_analysis_client(*, allow_fallback: bool = False) -> Any:
    try:
        importlib.import_module("google.genai")
    except (ModuleNotFoundError, ImportError) as exc:
        if not allow_fallback:
            raise RuntimeError(
                "google-genai is unavailable. Install or repair the Google SDK dependencies, "
                "or pass allow_fallback=True to route analysis through OpenAI."
            ) from exc
        logger.warning(
            "[GOOGLE_ANALYSIS] google-genai is unavailable; using OpenAI fallback model %s",
            LLM_MODEL,
        )
        return _FallbackAnalysisClient(fallback_model=LLM_MODEL)

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        if not allow_fallback:
            raise RuntimeError("GOOGLE_API_KEY is not set")
        logger.warning(
            "[GOOGLE_ANALYSIS] GOOGLE_API_KEY is not set; using OpenAI fallback model %s",
            LLM_MODEL,
        )
        return _FallbackAnalysisClient(fallback_model=LLM_MODEL)

    try:
        logger.info("[GOOGLE_ANALYSIS] Using Google Gemini analysis backend")
        return GoogleAnalysisClient(api_key=api_key)
    except (ModuleNotFoundError, ImportError) as exc:
        if not allow_fallback:
            raise RuntimeError(
                "google-genai import failed during client init. Install or repair the Google SDK "
                "dependencies, or pass allow_fallback=True to route analysis through OpenAI."
            ) from exc
        logger.warning(
            "[GOOGLE_ANALYSIS] google-genai import failed during init; using OpenAI fallback model %s",
            LLM_MODEL,
        )
        return _FallbackAnalysisClient(fallback_model=LLM_MODEL)
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
            "google-genai is not available in this environment. "
            "Install or repair the Google SDK dependencies, or set the org "
            "to use a non-Google TTS provider."
        ) from exc
    try:
        from livekit.plugins.google import realtime as google_realtime
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "livekit.plugins.google.realtime is not available in this environment. "
            "Install or repair the livekit-plugins-google package, or set the org "
            "to use a non-Google TTS provider."
        ) from exc
    return google_realtime.RealtimeModel(
        model=model,
        api_key=api_key,
        voice=voice_name,
        language=language,
        modalities=[google_genai_types.Modality.AUDIO, google_genai_types.Modality.TEXT],
        temperature=temperature,
    )
def build_stt(language_code: str = "en", model: str = STT_MODEL):
    stt_kwargs: dict[str, Any] = {
        "model": model,
        "smart_format": True,
        "language": language_code,
        "interim_results": True,
        "punctuate": True,
    }
    if "nova" in model.lower():
        stt_kwargs["enable_diarization"] = True
    for attempt in range(3):
        try:
            attempt_kwargs = dict(stt_kwargs)
            if attempt == 0:
                attempt_kwargs["endpointing_ms"] = 300
                logger.info("[STT] Building Deepgram STT with diarization + endpointing_ms")
            elif attempt == 1:
                attempt_kwargs["endpointing"] = 300
                logger.info("[STT] Falling back to Deepgram STT with diarization + endpointing")
            else:
                attempt_kwargs.pop("enable_diarization", None)
                attempt_kwargs["endpointing_ms"] = 300
                logger.info("[STT] Final fallback: Deepgram STT without diarization + endpointing_ms")
            stt = deepgram.STT(**attempt_kwargs)
            logger.info(
                "[STT] Active Deepgram config: model=%s language=%s diarization=%s endpointing=%s endpointing_ms=%s",
                attempt_kwargs.get("model"),
                attempt_kwargs.get("language"),
                bool(attempt_kwargs.get("enable_diarization", False)),
                attempt_kwargs.get("endpointing"),
                attempt_kwargs.get("endpointing_ms"),
            )
            return stt
        except TypeError as e:
            logger.warning(
                "[STT] Deepgram constructor rejected attempt %s with TypeError: %s",
                attempt + 1,
                e,
            )
            if attempt == 2:
                raise
            continue
        except Exception as e:
            logger.warning(
                "[STT] Deepgram constructor failed attempt %s with %s: %s",
                attempt + 1,
                type(e).__name__,
                e,
            )
            if attempt == 2:
                raise
            continue
    return deepgram.STT(**{"model": model, "language": language_code})
def build_sarvam_stt(language: str = "en-IN", model: str = "saaras:v3"):
    lang_map = {"hi": "hi-IN", "en": "en-IN", "en-US": "en-IN", "hi-IN": "hi-IN"}
    mapped_lang = lang_map.get(language, language)
    return sarvam.STT(language=mapped_lang, model=model)
def build_llm(model: str = LLM_MODEL, temperature: float = 0.6):
    return openai.LLM(model=model, temperature=temperature)
def build_sarvam_llm(model: str = "sarvam-30b"):
    return sarvam.LLM(model=model)
def build_vad():
    return silero.VAD.load()
