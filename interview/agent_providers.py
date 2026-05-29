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

import asyncio
import base64
import json
import inspect
import os
from dataclasses import replace
from typing import Any

import aiohttp
from livekit.agents import APIConnectionError, APIStatusError, APITimeoutError, tts, utils
from livekit.agents.types import APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS
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
    # bulbul:v3 — per Sarvam docs (https://docs.sarvam.ai/api-reference-docs/text-to-speech/stream)
    # 22050 Hz is recommended for streaming (24000 is higher quality but slower to generate)
    "sarvam_v3_sample_rate":   22050,
    "sarvam_v2_sample_rate":   22050,
    # 64k is optimal for low-latency streaming per Sarvam docs — 128k adds generation overhead
    "sarvam_output_bitrate":   "64k",
    "sarvam_output_codec":     "mp3",
    # min_buffer_size = chars before Sarvam starts processing (not frames/bytes).
    # 30 is the Sarvam-recommended minimum — below this Sarvam may cut off incomplete words.
    "sarvam_min_buffer":       30,
    # max_chunk_length = chars per chunk. 100-150 per docs — keeps latency low for conversational
    # responses. 150 is the sweet spot: short enough for fast first-chunk, long enough for fluency.
    "sarvam_max_chunk":        150,
    "sarvam_v2_pitch":         0.0,
    "sarvam_v2_loudness":      1.0,
    "sarvam_temperature":      0.4,
    "deepgram_endpointing_ms": 500,
    # WS connect/send timeout. Sarvam closes idle connections after 60s — keepalive pings every
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


class SarvamTTSConnectionManager:
    def __init__(self, tts_instance):
        self._tts = tts_instance
        self._api_key = tts_instance._api_key
        self._opts = replace(tts_instance._opts)
        self._session: aiohttp.ClientSession | None = None
        self._ws_timeout = _PROVIDER_DEFAULTS["sarvam_ws_timeout_sec"]

    def __getattr__(self, name):
        if name == "synthesize":
            raise AttributeError(name)
        return getattr(self._tts, name)

    def stream(
        self,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> "SarvamDirectSynthesizeStream":
        return SarvamDirectSynthesizeStream(manager=self, conn_options=conn_options)

    async def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def aclose(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()
        if hasattr(self._tts, "aclose"):
            await self._tts.aclose()


class SarvamDirectSynthesizeStream(tts.SynthesizeStream):
    _KEEPALIVE_INTERVAL_SEC = 20.0
    _USER_AGENT = "livekit-agents-sarvam-direct/1.0"

    def __init__(
        self,
        *,
        manager: SarvamTTSConnectionManager,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> None:
        super().__init__(tts=manager, conn_options=conn_options)
        self._manager = manager
        self._opts = manager._opts

    def _build_config_data(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "target_language_code": self._opts.target_language_code,
            "speaker": self._opts.speaker,
            "pace": self._opts.pace,
            "model": self._opts.model,
            "speech_sample_rate": self._opts.speech_sample_rate,
        }
        if self._opts.model == "bulbul:v2":
            data["pitch"] = self._opts.pitch
            data["loudness"] = self._opts.loudness
            data["enable_preprocessing"] = self._opts.enable_preprocessing
            data["output_audio_codec"] = self._opts.output_audio_codec
            if self._opts.enable_cached_responses is not None:
                data["enable_cached_responses"] = self._opts.enable_cached_responses
        if self._opts.model in ("bulbul:v3", "bulbul:v3-beta"):
            data["temperature"] = self._opts.temperature
            data["output_audio_bitrate"] = self._opts.output_audio_bitrate
            data["min_buffer_size"] = self._opts.min_buffer_size
            data["max_chunk_length"] = self._opts.max_chunk_length
            data["output_audio_codec"] = self._opts.output_audio_codec
        if self._opts.model == "bulbul:v3" and self._opts.dict_id is not None:
            data["dict_id"] = self._opts.dict_id
        return data

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        request_id = utils.shortuuid()
        timeout_sec = self._conn_options.timeout or self._manager._ws_timeout
        ws_url = f"{self._opts.ws_url}?model={self._opts.model}&send_completion_event=true"
        completion_event = asyncio.Event()
        ws: aiohttp.ClientWebSocketResponse | None = None
        tasks: list[asyncio.Task[Any]] = []

        output_emitter.initialize(
            request_id=request_id,
            sample_rate=self._opts.speech_sample_rate,
            num_channels=1,
            mime_type=f"audio/{self._opts.output_audio_codec}",
            stream=True,
            frame_size_ms=50,
        )
        output_emitter.start_segment(segment_id=request_id)

        logger.info(
            "[TTS_SARVAM_WS_START] request_id=%s model=%s speaker=%s language=%s ws_url=%s",
            request_id,
            self._opts.model,
            self._opts.speaker,
            self._opts.target_language_code,
            self._opts.ws_url,
        )

        async def _send_json(payload: dict[str, Any], stage: str) -> None:
            if ws is None:
                raise APIConnectionError("Sarvam websocket is not connected")
            try:
                await ws.send_str(json.dumps(payload))
            except Exception as e:
                logger.error(
                    "[TTS_SARVAM_WS_SEND_ERROR] request_id=%s stage=%s error=%s",
                    request_id,
                    stage,
                    e,
                    exc_info=True,
                )
                raise APIConnectionError(
                    f"Sarvam TTS websocket send failed during {stage}: {e}"
                ) from e

        try:
            session = await self._manager._ensure_session()
            try:
                ws = await asyncio.wait_for(
                    session.ws_connect(
                        ws_url,
                        headers={
                            "api-subscription-key": self._manager._api_key,
                            "User-Agent": self._USER_AGENT,
                        },
                        timeout=aiohttp.ClientWSTimeout(timeout_sec, timeout_sec),
                    ),
                    timeout=timeout_sec,
                )
            except asyncio.TimeoutError as e:
                logger.error(
                    "[TTS_SARVAM_WS_CONNECT_TIMEOUT] request_id=%s timeout=%ss ws_url=%s",
                    request_id,
                    timeout_sec,
                    self._opts.ws_url,
                    exc_info=True,
                )
                raise APIConnectionError(
                    f"Sarvam TTS websocket connect timed out after {timeout_sec}s"
                ) from e
            except Exception as e:
                logger.error(
                    "[TTS_SARVAM_WS_CONNECT_ERROR] request_id=%s model=%s ws_url=%s error=%s",
                    request_id,
                    self._opts.model,
                    self._opts.ws_url,
                    e,
                    exc_info=True,
                )
                raise APIConnectionError(f"Failed to connect to Sarvam TTS websocket: {e}") from e

            config_msg = {"type": "config", "data": self._build_config_data()}
            logger.debug(
                "[TTS_SARVAM_WS_CONFIG] request_id=%s payload=%s",
                request_id,
                config_msg,
            )
            await _send_json(config_msg, "config")

            async def _send_task() -> None:
                try:
                    async for item in self._input_ch:
                        if isinstance(item, str):
                            await _send_json({"type": "text", "data": {"text": item}}, "text")
                        elif isinstance(item, self._FlushSentinel):
                            await _send_json({"type": "flush"}, "flush")
                        else:
                            logger.warning(
                                "[TTS_SARVAM_WS_INPUT] request_id=%s unexpected input type=%s",
                                request_id,
                                type(item),
                            )

                    try:
                        await _send_json({"type": "flush"}, "final-flush")
                    except APIConnectionError as e:
                        if completion_event.is_set() or (ws is not None and ws.closed):
                            logger.debug(
                                "[TTS_SARVAM_WS_FINAL_FLUSH_SKIPPED] request_id=%s error=%s",
                                request_id,
                                e,
                            )
                            return
                        raise
                except asyncio.CancelledError:
                    raise
                except (APIConnectionError, APIStatusError, APITimeoutError):
                    raise
                except Exception as e:
                    logger.error(
                        "[TTS_SARVAM_WS_SEND_TASK_ERROR] request_id=%s error=%s",
                        request_id,
                        e,
                        exc_info=True,
                    )
                    raise APIConnectionError(f"Sarvam TTS send task failed: {e}") from e

            async def _recv_task() -> None:
                # Sarvam docs: WS closes after 60s inactivity. Our keepalive pings every 20s
                # prevent that. But between audio chunks Sarvam can be slow — use 90s receive
                # timeout (docs recommend 90s+ for idle timeout on client side).
                recv_timeout_sec = max(timeout_sec, 90.0)
                try:
                    while True:
                        try:
                            msg = await ws.receive(timeout=recv_timeout_sec)
                        except asyncio.TimeoutError as e:
                            logger.error(
                                "[TTS_SARVAM_WS_RECEIVE_TIMEOUT] request_id=%s timeout=%ss",
                                request_id,
                                recv_timeout_sec,
                                exc_info=True,
                            )
                            raise APITimeoutError(
                                f"Sarvam TTS websocket receive timed out after {recv_timeout_sec}s"
                            ) from e

                        if msg.type in (
                            aiohttp.WSMsgType.CLOSE,
                            aiohttp.WSMsgType.CLOSED,
                            aiohttp.WSMsgType.CLOSING,
                        ):
                            close_code = ws.close_code if ws is not None and ws.close_code is not None else msg.data
                            close_reason = msg.extra
                            if close_code in (1000, 1001, None):
                                logger.info(
                                    "[TTS_SARVAM_WS_CLOSE] request_id=%s code=%s reason=%s",
                                    request_id,
                                    close_code,
                                    close_reason,
                                )
                                completion_event.set()
                                break

                            raw_close = {
                                "msg_type": str(msg.type),
                                "close_code": close_code,
                                "close_reason": close_reason,
                            }
                            logger.error(
                                "[TTS_SARVAM_WS_CLOSE_ERROR] request_id=%s payload=%s",
                                request_id,
                                raw_close,
                            )
                            raise APIStatusError(
                                message=(
                                    "Sarvam TTS websocket closed with non-graceful status: "
                                    f"{json.dumps(raw_close, ensure_ascii=False)}"
                                ),
                                status_code=int(close_code) if isinstance(close_code, int) else -1,
                                body=raw_close,
                            )

                        if msg.type == aiohttp.WSMsgType.TEXT:
                            try:
                                payload = json.loads(msg.data)
                            except json.JSONDecodeError as e:
                                logger.error(
                                    "[TTS_SARVAM_WS_BAD_JSON] request_id=%s raw=%s error=%s",
                                    request_id,
                                    msg.data[:200],
                                    e,
                                    exc_info=True,
                                )
                                raise APIStatusError(
                                    message=f"Sarvam TTS returned invalid JSON: {e}",
                                    status_code=500,
                                    body={"raw_message": msg.data},
                                ) from e

                            msg_type = payload.get("type")
                            if msg_type == "audio":
                                audio_data = payload.get("data", {}).get("audio", "")
                                if not audio_data:
                                    logger.debug(
                                        "[TTS_SARVAM_WS_AUDIO_EMPTY] request_id=%s payload=%s",
                                        request_id,
                                        payload,
                                    )
                                    continue
                                try:
                                    audio_bytes = base64.b64decode(audio_data, validate=True)
                                except Exception as e:
                                    logger.error(
                                        "[TTS_SARVAM_WS_AUDIO_DECODE_ERROR] request_id=%s error=%s",
                                        request_id,
                                        e,
                                        exc_info=True,
                                    )
                                    raise APIStatusError(
                                        message=f"Sarvam TTS returned invalid base64 audio: {e}",
                                        status_code=500,
                                        body=payload,
                                    ) from e
                                output_emitter.push(audio_bytes)
                                continue

                            if msg_type == "event":
                                event_data = payload.get("data", {})
                                event_type = event_data.get("event_type")
                                if event_type == "final":
                                    logger.info(
                                        "[TTS_SARVAM_WS_FINAL] request_id=%s model=%s speaker=%s",
                                        request_id,
                                        self._opts.model,
                                        self._opts.speaker,
                                    )
                                    completion_event.set()
                                    output_emitter.end_input()
                                    return
                                logger.debug(
                                    "[TTS_SARVAM_WS_EVENT] request_id=%s event_type=%s payload=%s",
                                    request_id,
                                    event_type,
                                    payload,
                                )
                                continue

                            if msg_type == "error":
                                error_data = payload.get("data", {})
                                error_msg = str(error_data.get("message", "Unknown error"))
                                error_code = error_data.get("code", "unknown")
                                raw_error_message = json.dumps(
                                    payload, ensure_ascii=False, separators=(",", ":")
                                )
                                logger.error(
                                    "[TTS_SARVAM_WS_ERROR] request_id=%s code=%s message=%s payload=%s",
                                    request_id,
                                    error_code,
                                    error_msg,
                                    payload,
                                )
                                if any(
                                    err in error_msg.lower()
                                    for err in ("rate_limit", "temporary_unavailable", "timeout")
                                ):
                                    raise APIConnectionError(
                                        f"Recoverable TTS API error from Sarvam: {raw_error_message}"
                                    )
                                raise APIStatusError(
                                    message=f"TTS API error from Sarvam: {raw_error_message}",
                                    status_code=500,
                                    body=payload,
                                )

                            logger.debug(
                                "[TTS_SARVAM_WS_UNKNOWN] request_id=%s msg_type=%s payload=%s",
                                request_id,
                                msg_type,
                                payload,
                            )
                            continue

                        if msg.type == aiohttp.WSMsgType.ERROR:
                            logger.error(
                                "[TTS_SARVAM_WS_SOCKET_ERROR] request_id=%s error=%s",
                                request_id,
                                msg.data,
                                exc_info=True,
                            )
                            raise APIConnectionError(f"Sarvam TTS websocket error: {msg.data}")

                        logger.debug(
                            "[TTS_SARVAM_WS_MESSAGE] request_id=%s msg_type=%s data=%s",
                            request_id,
                            msg.type,
                            getattr(msg, "data", None),
                        )
                except asyncio.CancelledError:
                    raise
                except (APIConnectionError, APIStatusError, APITimeoutError):
                    raise
                except Exception as e:
                    logger.error(
                        "[TTS_SARVAM_WS_RECV_TASK_ERROR] request_id=%s error=%s",
                        request_id,
                        e,
                        exc_info=True,
                    )
                    raise APIConnectionError(f"Sarvam TTS receive task failed: {e}") from e

            async def _keepalive_task() -> None:
                try:
                    while not completion_event.is_set():
                        try:
                            await asyncio.wait_for(
                                completion_event.wait(), timeout=self._KEEPALIVE_INTERVAL_SEC
                            )
                            break
                        except asyncio.TimeoutError:
                            if completion_event.is_set() or ws is None or ws.closed:
                                break
                            try:
                                await ws.ping()
                                logger.debug(
                                    "[TTS_SARVAM_WS_KEEPALIVE] request_id=%s ping_sent",
                                    request_id,
                                )
                            except Exception as e:
                                if completion_event.is_set() or ws.closed:
                                    break
                                logger.warning(
                                    "[TTS_SARVAM_WS_KEEPALIVE] request_id=%s ping_failed=%s",
                                    request_id,
                                    e,
                                    exc_info=True,
                                )
                                break
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.warning(
                        "[TTS_SARVAM_WS_KEEPALIVE] request_id=%s exiting_after_error=%s",
                        request_id,
                        e,
                        exc_info=True,
                    )

            tasks = [
                asyncio.create_task(_send_task(), name="SarvamDirectSynthesizeStream.send"),
                asyncio.create_task(_recv_task(), name="SarvamDirectSynthesizeStream.recv"),
                asyncio.create_task(
                    _keepalive_task(), name="SarvamDirectSynthesizeStream.keepalive"
                ),
            ]

            try:
                await asyncio.gather(*tasks)
                logger.info(
                    "[TTS_SARVAM_WS_DONE] request_id=%s model=%s speaker=%s",
                    request_id,
                    self._opts.model,
                    self._opts.speaker,
                )
            except asyncio.CancelledError:
                logger.warning(
                    "[TTS_SARVAM_WS_CANCELLED] request_id=%s model=%s speaker=%s",
                    request_id,
                    self._opts.model,
                    self._opts.speaker,
                )
                raise
            except (APIConnectionError, APIStatusError, APITimeoutError):
                logger.error(
                    "[TTS_SARVAM_WS_STREAM_ERROR] request_id=%s model=%s speaker=%s",
                    request_id,
                    self._opts.model,
                    self._opts.speaker,
                    exc_info=True,
                )
                raise
            except Exception as e:
                logger.error(
                    "[TTS_SARVAM_WS_STREAM_UNEXPECTED] request_id=%s model=%s speaker=%s error=%s",
                    request_id,
                    self._opts.model,
                    self._opts.speaker,
                    e,
                    exc_info=True,
                )
                raise APIConnectionError(f"Sarvam TTS stream failed: {e}") from e
            finally:
                await utils.aio.gracefully_cancel(*tasks)
        finally:
            try:
                output_emitter.end_input()
            except Exception as e:
                logger.debug(
                    "[TTS_SARVAM_WS_END_INPUT_ERROR] request_id=%s error=%s",
                    request_id,
                    e,
                    exc_info=True,
                )
            if ws is not None and not ws.closed:
                try:
                    await ws.close(code=1000)
                    logger.info(
                        "[TTS_SARVAM_WS_CLOSED] request_id=%s close_code=%s",
                        request_id,
                        ws.close_code,
                    )
                except Exception as e:
                    logger.warning(
                        "[TTS_SARVAM_WS_CLOSE_ERROR] request_id=%s error=%s",
                        request_id,
                        e,
                        exc_info=True,
                    )


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

    tts = sarvam.TTS(**tts_kwargs)
    # Wrap with a direct WebSocket manager for per-turn connections.
    return SarvamTTSConnectionManager(tts)


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
    model_lc = str(model or "").lower()
    is_nova3 = "nova-3" in model_lc

    base_kwargs: dict[str, Any] = {
        "model":           model,
        "smart_format":    True,
        "language":        language_code,
        "interim_results": False,  # Disabled to prevent debounce timer cancellation from multiple partial results
        "punctuate":       True,
        "keep_alive":      True,   # Send KeepAlive messages during silence — prevents Deepgram
                                   # closing the WS with 1011 "no audio received within timeout"
    }
    if "nova" in model.lower() and "enable_diarization" in supported:
        base_kwargs["enable_diarization"] = True

    keyword_terms = ["instantly", "heyreach", "n8n"]
    # Deepgram rejects `keywords` for Nova-3. Use keyterm/keyterms there.
    if is_nova3:
        if "keyterm" in supported:
            base_kwargs["keyterm"] = keyword_terms
        elif "keyterms" in supported:
            base_kwargs["keyterms"] = keyword_terms
    elif "keywords" in supported:
        base_kwargs["keywords"] = [(term, 10.0) for term in keyword_terms]

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
