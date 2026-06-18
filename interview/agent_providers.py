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
from typing import Any, Sequence
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
class SarvamTTSConnectionManager:
    """Manages a single persistent Sarvam WebSocket connection for the session lifetime.

    Previous approach opened a new WS per turn to avoid "Cannot write to closing
    transport" crashes (Sarvam closes idle connections after 60s). The fix was correct
    for the crash but added 200-500ms TLS+WS setup latency on every turn.

    This implementation keeps one warm WS alive with 20s keepalive pings. If Sarvam
    closes it anyway (restart, network blip), _ensure_ws() reconnects once transparently
    before the next turn. The candidate never waits for a cold connection mid-interview.
    """
    _KEEPALIVE_INTERVAL_SEC = 20.0
    _USER_AGENT = "livekit-agents-sarvam-direct/1.0"

    def __init__(self, tts_instance):
        self._tts = tts_instance
        self._api_key = tts_instance._api_key
        self._opts = replace(tts_instance._opts)
        self._ws_timeout = _PROVIDER_DEFAULTS["sarvam_ws_timeout_sec"]
        self._session: aiohttp.ClientSession | None = None
        # Persistent warm WebSocket — reused across all turns in this session.
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._ws_lock = asyncio.Lock()
        self._keepalive_task: asyncio.Task | None = None

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

    async def _ensure_http_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    def _ws_healthy(self) -> bool:
        return (
            self._ws is not None
            and not self._ws.closed
            and self._ws.close_code is None
        )

    async def ensure_ws(self) -> aiohttp.ClientWebSocketResponse:
        """Return the warm WS, reconnecting once if it has been closed by Sarvam."""
        async with self._ws_lock:
            if self._ws_healthy():
                return self._ws
            # WS is gone — reconnect. This only happens on first call or after
            # Sarvam closes a connection that our keepalive missed.
            logger.info("[SARVAM_WS] (Re)connecting persistent WebSocket")
            session = await self._ensure_http_session()
            ws_url = (
                f"{self._opts.ws_url}"
                f"?model={self._opts.model}&send_completion_event=true"
            )
            try:
                self._ws = await asyncio.wait_for(
                    session.ws_connect(
                        ws_url,
                        headers={
                            "api-subscription-key": self._api_key,
                            "User-Agent": self._USER_AGENT,
                        },
                        timeout=aiohttp.ClientWSTimeout(
                            self._ws_timeout, self._ws_timeout
                        ),
                    ),
                    timeout=self._ws_timeout,
                )
            except Exception as e:
                self._ws = None
                raise APIConnectionError(
                    f"Sarvam TTS persistent WS connect failed: {e}"
                ) from e
            # Send config once after each (re)connect.
            config_msg = json.dumps({"type": "config", "data": self._build_config_data()})
            await self._ws.send_str(config_msg)
            logger.info("[SARVAM_WS] Persistent WS connected and configured")
            # Start background keepalive if not already running.
            if self._keepalive_task is None or self._keepalive_task.done():
                self._keepalive_task = asyncio.create_task(
                    self._keepalive_loop(),
                    name="SarvamTTSConnectionManager.keepalive",
                )
            return self._ws

    def _build_config_data(self) -> dict[str, Any]:
        """Build Sarvam config payload (identical to SarvamDirectSynthesizeStream)."""
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

    async def _keepalive_loop(self) -> None:
        """Ping Sarvam every 20s to prevent 60s idle close."""
        try:
            while True:
                await asyncio.sleep(self._KEEPALIVE_INTERVAL_SEC)
                if not self._ws_healthy():
                    logger.debug("[SARVAM_WS] Keepalive: WS gone, loop exiting")
                    break
                try:
                    await self._ws.send_str(json.dumps({"type": "ping"}))
                    logger.debug("[SARVAM_WS] Keepalive ping sent")
                except Exception as e:
                    logger.warning("[SARVAM_WS] Keepalive ping failed: %s", e)
                    break
        except asyncio.CancelledError:
            pass

    async def aclose(self) -> None:
        if self._keepalive_task is not None and not self._keepalive_task.done():
            self._keepalive_task.cancel()
            try:
                await self._keepalive_task
            except asyncio.CancelledError:
                pass
        if self._ws_healthy():
            try:
                await self._ws.close(code=1000)
                logger.info("[SARVAM_WS] Persistent WS closed cleanly")
            except Exception as e:
                logger.warning("[SARVAM_WS] WS close error: %s", e)
        if self._session is not None and not self._session.closed:
            await self._session.close()
        if hasattr(self._tts, "aclose"):
            await self._tts.aclose()
class SarvamDirectSynthesizeStream(tts.SynthesizeStream):
    """Per-turn TTS stream that uses the manager's persistent warm WebSocket.

    No connection setup per turn — the manager keeps the WS alive between turns
    with keepalive pings. This stream only sends text + flush and reads audio back.
    If the WS was closed by Sarvam (network blip, restart), the manager reconnects
    once transparently before this stream runs.
    """
    def __init__(
        self,
        *,
        manager: SarvamTTSConnectionManager,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> None:
        super().__init__(tts=manager, conn_options=conn_options)
        self._manager = manager
        self._opts = manager._opts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        request_id = utils.shortuuid()
        timeout_sec = self._conn_options.timeout or self._manager._ws_timeout
        completion_event = asyncio.Event()
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

        # Reuse the manager's persistent warm WS — reconnects once if closed.
        try:
            ws = await self._manager.ensure_ws()
        except Exception as e:
            logger.error("[TTS_SARVAM] request_id=%s failed to get WS: %s", request_id, e)
            raise

        logger.info(
            "[TTS_SARVAM_TURN_START] request_id=%s model=%s speaker=%s language=%s",
            request_id, self._opts.model, self._opts.speaker, self._opts.target_language_code,
        )

        async def _send_json(payload: dict[str, Any], stage: str) -> None:
            try:
                await ws.send_str(json.dumps(payload))
            except Exception as e:
                logger.error(
                    "[TTS_SARVAM_SEND_ERROR] request_id=%s stage=%s error=%s",
                    request_id, stage, e, exc_info=True,
                )
                # Mark WS as dead so manager reconnects on next turn.
                self._manager._ws = None
                raise APIConnectionError(
                    f"Sarvam TTS send failed during {stage}: {e}"
                ) from e

        async def _send_task() -> None:
            try:
                async for item in self._input_ch:
                    if isinstance(item, str):
                        await _send_json({"type": "text", "data": {"text": item}}, "text")
                    elif isinstance(item, self._FlushSentinel):
                        await _send_json({"type": "flush"}, "flush")
                try:
                    await _send_json({"type": "flush"}, "final-flush")
                except APIConnectionError as e:
                    if completion_event.is_set() or ws.closed:
                        return
                    raise
            except asyncio.CancelledError:
                raise
            except (APIConnectionError, APIStatusError, APITimeoutError):
                raise
            except Exception as e:
                logger.error("[TTS_SARVAM_SEND_TASK] request_id=%s error=%s", request_id, e, exc_info=True)
                raise APIConnectionError(f"Sarvam send task failed: {e}") from e

        async def _recv_task() -> None:
            recv_timeout_sec = max(timeout_sec, 90.0)
            try:
                while True:
                    try:
                        msg = await ws.receive(timeout=recv_timeout_sec)
                    except asyncio.TimeoutError as e:
                        logger.error("[TTS_SARVAM_RECV_TIMEOUT] request_id=%s timeout=%ss", request_id, recv_timeout_sec)
                        self._manager._ws = None
                        raise APITimeoutError(f"Sarvam recv timed out after {recv_timeout_sec}s") from e

                    if msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.CLOSING):
                        close_code = ws.close_code if ws.close_code is not None else msg.data
                        # Mark WS dead so manager reconnects next turn.
                        self._manager._ws = None
                        if close_code in (1000, 1001, None):
                            logger.info("[TTS_SARVAM_WS_CLOSED_BY_SERVER] request_id=%s code=%s", request_id, close_code)
                            completion_event.set()
                            break
                        raise APIStatusError(
                            message=f"Sarvam WS closed unexpectedly code={close_code}",
                            status_code=int(close_code) if isinstance(close_code, int) else -1,
                            body={"close_code": close_code, "reason": msg.extra},
                        )

                    if msg.type == aiohttp.WSMsgType.ERROR:
                        self._manager._ws = None
                        raise APIConnectionError(f"Sarvam WS error: {msg.data}")

                    if msg.type != aiohttp.WSMsgType.TEXT:
                        continue

                    try:
                        payload = json.loads(msg.data)
                    except json.JSONDecodeError as e:
                        raise APIStatusError(
                            message=f"Sarvam invalid JSON: {e}",
                            status_code=500,
                            body={"raw": msg.data[:200]},
                        ) from e

                    msg_type = payload.get("type")

                    if msg_type == "audio":
                        audio_data = payload.get("data", {}).get("audio", "")
                        if audio_data:
                            try:
                                output_emitter.push(base64.b64decode(audio_data, validate=True))
                            except Exception as e:
                                raise APIStatusError(
                                    message=f"Sarvam invalid base64 audio: {e}",
                                    status_code=500, body=payload,
                                ) from e
                        continue

                    if msg_type == "event":
                        if payload.get("data", {}).get("event_type") == "final":
                            logger.info("[TTS_SARVAM_TURN_DONE] request_id=%s", request_id)
                            completion_event.set()
                            output_emitter.end_input()
                            return
                        continue

                    if msg_type == "error":
                        error_data = payload.get("data", {})
                        error_msg = str(error_data.get("message", "Unknown error"))
                        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                        logger.error("[TTS_SARVAM_ERROR] request_id=%s msg=%s", request_id, error_msg)
                        if any(k in error_msg.lower() for k in ("rate_limit", "temporary_unavailable", "timeout")):
                            raise APIConnectionError(f"Recoverable Sarvam error: {raw}")
                        raise APIStatusError(message=f"Sarvam TTS error: {raw}", status_code=500, body=payload)

            except asyncio.CancelledError:
                raise
            except (APIConnectionError, APIStatusError, APITimeoutError):
                raise
            except Exception as e:
                logger.error("[TTS_SARVAM_RECV_TASK] request_id=%s error=%s", request_id, e, exc_info=True)
                raise APIConnectionError(f"Sarvam recv task failed: {e}") from e

        tasks = [
            asyncio.create_task(_send_task(), name="SarvamStream.send"),
            asyncio.create_task(_recv_task(), name="SarvamStream.recv"),
        ]
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            logger.warning("[TTS_SARVAM_CANCELLED] request_id=%s", request_id)
            raise
        except (APIConnectionError, APIStatusError, APITimeoutError):
            logger.error("[TTS_SARVAM_STREAM_ERROR] request_id=%s", request_id, exc_info=True)
            raise
        except Exception as e:
            logger.error("[TTS_SARVAM_STREAM_UNEXPECTED] request_id=%s error=%s", request_id, e, exc_info=True)
            raise APIConnectionError(f"Sarvam stream failed: {e}") from e
        finally:
            await utils.aio.gracefully_cancel(*tasks)
            try:
                output_emitter.end_input()
            except Exception:
                pass
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
def build_vad():
    return silero.VAD.load()
