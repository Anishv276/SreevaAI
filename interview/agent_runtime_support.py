import json
import logging
import os
import time
from contextvars import ContextVar
from typing import Any, Optional
from dotenv import load_dotenv
load_dotenv()
logger = logging.getLogger("interview-agent")
logger.setLevel(logging.DEBUG)

_SESSION_CONTEXT_KEYS = (
    "session_id",
    "app_id",
    "room_name",
    "dispatch_application_id",
    "dispatch_candidate_name",
    "dispatch_role_label",
    "dispatch_time_limit_mins",
    "dispatch_room_name",
    "org_id",
    "org_name",
    "org_location",
    "drive_location",
    "candidate",
    "candidate_first_name",
    "job_title",
    "time_limit_mins",
)


def _sanitize_context_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key not in [
                "args",
                "asctime",
                "created",
                "exc_info",
                "exc_text",
                "filename",
                "funcName",
                "levelname",
                "levelno",
                "lineno",
                "module",
                "msecs",
                "message",
                "msg",
                "name",
                "pathname",
                "process",
                "processName",
                "relativeCreated",
                "stack_info",
                "thread",
                "threadName",
                "emit_full_context",
            ]:
                log_record[key] = value
        if not getattr(record, "emit_full_context", False):
            for key in _SESSION_CONTEXT_KEYS:
                if key in log_record and key != "session_id":
                    log_record.pop(key, None)
        else:
            for key in _SESSION_CONTEXT_KEYS:
                if key in log_record:
                    log_record[key] = _sanitize_context_value(log_record[key])
        return json.dumps(log_record, ensure_ascii=False)
for handler in logger.handlers[:]:
    logger.removeHandler(handler)
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.addHandler(handler)
logger.propagate = False
_LOG_CONTEXT_FIELDS: ContextVar[dict[str, Any]] = ContextVar("log_context_fields", default={})


def set_log_context(fields: dict[str, Any]):
    sanitized = {key: _sanitize_context_value(value) for key, value in fields.items()}
    return _LOG_CONTEXT_FIELDS.set(sanitized)


def reset_log_context(token) -> None:
    try:
        _LOG_CONTEXT_FIELDS.reset(token)
    except ValueError:
        # Can happen during shutdown when callback executes in a different async context.
        logger.debug("[SESSION] reset_log_context skipped due to cross-context token")


_LOG_SESSION_FILTER = os.environ.get("LOG_SESSION_FILTER", "").strip().lower()


class _SessionLogContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        ctx = _LOG_CONTEXT_FIELDS.get({})
        for key, value in ctx.items():
            if not hasattr(record, key):
                setattr(record, key, value)
        if _LOG_SESSION_FILTER:
            session_id = ctx.get("session_id", "")
            candidate = ctx.get("dispatch_candidate_name", "")
            haystack = f"{session_id} {candidate}".lower()
            if haystack and _LOG_SESSION_FILTER not in haystack:
                return False
        return True
handler.addFilter(_SessionLogContextFilter())
class _RuntimeWarningSampler(logging.Filter):
    """
    Rate-limit noisy warnings instead of hiding them.
    Keeps logs readable while preserving the exact signals needed for debugging.
    """
    def __init__(self) -> None:
        super().__init__()
        self._last_seen: dict[str, float] = {}
        self._interval_seconds = 30.0
        self._drop_always = (
            "flush_done",
            "re-using existing connection",
            "unexpected response: type=text",
        )
        self._sampled = (
            "unexpected message",
            "audio stream queue overflow",
            "inference is slower than realtime",
            "connectionreseterror",
            "duplexclosed",
            "final transcript not received after timeout",
            "speech scheduling is paused",
        )
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage().lower()
        if any(pattern in msg for pattern in self._drop_always):
            return False
        for pattern in self._sampled:
            if pattern in msg:
                now = time.time()
                last = self._last_seen.get(pattern, 0.0)
                if now - last < self._interval_seconds:
                    return False
                self._last_seen[pattern] = now
                record.runtime_warning = pattern
                record.runtime_warning_sampled = True
                return True
        return True
for logger_name in ("livekit.plugins.cartesia", "livekit.plugins.silero", "livekit"):
    _logger = logging.getLogger(logger_name)
    _logger.addFilter(_RuntimeWarningSampler())
STT_MODEL = "nova-3"
LLM_MODEL = "gpt-4.1-mini"
INTERVIEW_LLM_MODEL = LLM_MODEL
INTERVIEW_TEMPERATURE = 0.75
EVAL_LLM_MODEL = "gpt-4.1-mini"
EVAL_TEMPERATURE = 0.0
DEFAULT_VOICE_ID = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"

# Voice registry -- single source of truth for voice->provider+model mapping.
# Provider is "CARTESIA" or "SARVAM". Model is the TTS model string for that provider.
VOICE_REGISTRY: dict[str, dict[str, str]] = {
    # Cartesia voices
    "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
    "95d51f79-c397-46f9-b49a-23763d3eaa2d": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
    "f786b574-daa5-4673-aa0c-cbe3e8534c02": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
    "e07c00bc-4134-4eae-9ea4-1a55fb45746b": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
    "5ee9feff-1265-424a-9d7f-8e4d431a12c7": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
    "694f9389-aac1-45b6-b726-9d9369183238": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
    "638385f3-3333-4f5d-85a2-3f820c64b732": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
    "248be1fc-3d27-4452-9457-3705bf68bf8f": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
    # Sarvam voices
    "shubh":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "manan":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "ishita":  {"provider": "SARVAM", "model": "bulbul:v3"},
    "shreya":  {"provider": "SARVAM", "model": "bulbul:v3"},
    "priya":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "aditya":  {"provider": "SARVAM", "model": "bulbul:v3"},
    "ritu":    {"provider": "SARVAM", "model": "bulbul:v3"},
    "rahul":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "neha":    {"provider": "SARVAM", "model": "bulbul:v3"},
    "pooja":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "rohan":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "simran":  {"provider": "SARVAM", "model": "bulbul:v3"},
    "kavya":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "amit":    {"provider": "SARVAM", "model": "bulbul:v3"},
    "dev":     {"provider": "SARVAM", "model": "bulbul:v3"},
    "varun":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "kabir":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "tanya":   {"provider": "SARVAM", "model": "bulbul:v3"},
    "sunny":   {"provider": "SARVAM", "model": "bulbul:v3"},
}
FIXED_INTERVIEW_DURATION_MINUTES = 20
DATABASE_URL = os.environ.get("DATABASE_URL")
AGENT_NAME = os.environ.get("LIVEKIT_AGENT_NAME", "ai_interviewer")
APP_BASE_URL = (
    os.environ.get("APP_URL")
    or os.environ.get("NEXT_PUBLIC_APP_URL")
    or "https://sreevaai.com"
).rstrip("/")
WORKER_SYNC_TOKEN = os.environ.get("WORKER_SYNC_TOKEN") or os.environ.get("JWT_SECRET")
_DB_POOL: Any = None
_DB_POOL_INIT_TASK: Any = None
_PENDING_MANUAL_BILLING: dict[str, list[tuple[str, dict]]] = {}
_TOOL_ALIAS_CATALOG: dict[str, str] = {}

PROCTORING_WEIGHTS: dict[str, int] = {
    "tab_switch": 5,
    "face_absent": 3,
    "multiple_faces": 30,
}
_COMPOSITE_RISK_WEIGHTS = {
    "integrity": 0.60,
    "depth": 0.40,
}

def compose_risk_score(
    integrity_risk: int,
    depth_risk: int,
) -> int:
    weighted = (
        integrity_risk * _COMPOSITE_RISK_WEIGHTS["integrity"]
        + depth_risk * _COMPOSITE_RISK_WEIGHTS["depth"]
    )
    return max(0, min(100, int(round(weighted))))



