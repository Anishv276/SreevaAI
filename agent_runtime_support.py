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
            ]:
                log_record[key] = value
        return json.dumps(log_record)
for handler in logger.handlers[:]:
    logger.removeHandler(handler)
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.addHandler(handler)
logger.propagate = False
_LOG_CONTEXT_FIELDS: ContextVar[dict[str, Any]] = ContextVar("log_context_fields", default={})
class _SessionLogContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key, value in _LOG_CONTEXT_FIELDS.get({}).items():
            if not hasattr(record, key):
                setattr(record, key, value)
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
CARTESIA_MODEL = "cartesia/sonic-3"
CARTESIA_VOICE_ID = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
LLM_MODEL = "gpt-4.1-mini"
GOOGLE_REALTIME_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
GOOGLE_ANALYSIS_MODEL = "gemini-2.5-flash"
DEFAULT_GOOGLE_TTS_MODEL = GOOGLE_REALTIME_MODEL
DEFAULT_GOOGLE_VOICE_NAME = "Puck"
FIXED_INTERVIEW_DURATION_MINUTES = 10
DATABASE_URL = os.environ.get("DATABASE_URL")
AGENT_NAME = os.environ.get("LIVEKIT_AGENT_NAME", "ai_interviewer")
APP_BASE_URL = (
    os.environ.get("APP_URL")
    or os.environ.get("NEXT_PUBLIC_APP_URL")
    or "https://sreevaai.com"
).rstrip("/")
_DB_POOL: Any = None
_DB_POOL_INIT_TASK: Any = None
_PENDING_MANUAL_BILLING: dict[str, list[tuple[str, dict]]] = {}
_TOOL_ALIAS_CATALOG: dict[str, list[str]] = {
    "n8n": ["n8n", "nh10", "n h 10", "en 8 en", "nan"],
    "Apollo.io": ["apollo", "apolo", "apollo io"],
    "LeadMagic": ["leadmagic", "lead magic", "lead magik"],
    "Zoho Bigin": ["bigin", "begin", "big in", "zoho begin", "zoho bigin"],
    "Zoho CRM": ["zoho crm", "joho crm", "zohho crm"],
    "HubSpot": ["hubspot", "hub spot"],
    "Salesforce": ["salesforce", "sales farce", "sales force"],
    "Instantly": ["instantly", "instant ly"],
    "Clay": ["clay", "kley"],
}
PROCTORING_WEIGHTS: dict[str, int] = {
    "tab_switch": 5,
    "face_absent": 3,
    "multiple_faces": 30,
}
_COMPOSITE_RISK_WEIGHTS = {
    "integrity": 0.60,
    "depth": 0.40,
}
_MODE_SWITCH_WEIGHTS = {
    "integrity": 0.70,
    "depth": 0.30,
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
def compose_mode_risk_score(
    integrity_risk: int,
    depth_risk: int,
) -> int:
    weighted = (
        integrity_risk * _MODE_SWITCH_WEIGHTS["integrity"]
        + depth_risk * _MODE_SWITCH_WEIGHTS["depth"]
    )
    if integrity_risk >= 15:
        weighted += 8
    elif integrity_risk >= 8:
        weighted += 4
    return max(0, min(100, int(round(weighted))))
