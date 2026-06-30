import json
import logging
import os
import time
from contextvars import ContextVar
from typing import Any
from dotenv import load_dotenv

from interview.agent_runtime_utils import AgentConfig, MutableStateManager

# ═══════════════════════════════════════════════════════════════════════════════
# INITIALIZATION
# ═══════════════════════════════════════════════════════════════════════════════

load_dotenv(override=False)

logger = logging.getLogger("interview-agent")
logger.setLevel(logging.DEBUG)

# Global mutable state manager — single source of truth for DB pool, billing, etc.
_state_manager = MutableStateManager()


# ═══════════════════════════════════════════════════════════════════════════════
# LOGGING SETUP (JSON formatter + context filter + warning sampler)
# ═══════════════════════════════════════════════════════════════════════════════

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
    "candidate",
    "candidate_first_name",
    "job_title",
    "time_limit_mins",
)


def _sanitize_context_value(value: Any) -> Any:
    """Safely coerce context values to JSON-serializable types."""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


class JsonFormatter(logging.Formatter):
    """Structured JSON logging formatter for CloudWatch/observability."""

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

        # Add custom fields (set via addFilter or set_log_context)
        _EXCLUDED_RECORD_ATTRS = frozenset([
            "args", "asctime", "created", "exc_info", "exc_text", "filename",
            "funcName", "levelname", "levelno", "lineno", "module", "msecs",
            "message", "msg", "name", "pathname", "process", "processName",
            "relativeCreated", "stack_info", "thread", "threadName", "emit_full_context",
        ])
        for key, value in record.__dict__.items():
            if key not in _EXCLUDED_RECORD_ATTRS:
                log_record[key] = value

        # Filter session context based on emit_full_context flag
        if not getattr(record, "emit_full_context", False):
            for key in _SESSION_CONTEXT_KEYS:
                if key in log_record and key != "session_id":
                    log_record.pop(key, None)
        else:
            for key in _SESSION_CONTEXT_KEYS:
                if key in log_record:
                    log_record[key] = _sanitize_context_value(log_record[key])

        return json.dumps(log_record, ensure_ascii=False)


# Remove any default handlers and install our JSON formatter
for handler in logger.handlers[:]:
    logger.removeHandler(handler)

handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.addHandler(handler)
logger.propagate = False


# ─────────────────────────────────────────────────────────────────────────────
# Log Context Management (ContextVar-based, async-safe)
# ─────────────────────────────────────────────────────────────────────────────

_LOG_CONTEXT_FIELDS: ContextVar[dict[str, Any]] = ContextVar("log_context_fields", default={})


def set_log_context(fields: dict[str, Any]):
    """Set session context fields for all subsequent logs in this context."""
    sanitized = {key: _sanitize_context_value(value) for key, value in fields.items()}
    return _LOG_CONTEXT_FIELDS.set(sanitized)


def reset_log_context(token) -> None:
    """Reset log context to prior state (counterpart to set_log_context)."""
    try:
        _LOG_CONTEXT_FIELDS.reset(token)
    except ValueError:
        logger.debug("[SESSION] reset_log_context skipped due to cross-context token")


_LOG_SESSION_FILTER = os.environ.get("LOG_SESSION_FILTER", "").strip().lower()


class _SessionLogContextFilter(logging.Filter):
    """Attach ContextVar fields to every log record, with optional session filtering."""

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


# ─────────────────────────────────────────────────────────────────────────────
# Warning Sampler (rate-limit noisy logs)
# ─────────────────────────────────────────────────────────────────────────────

class _RuntimeWarningSampler(logging.Filter):
    """Rate-limit noisy warnings without hiding them entirely.

    Keeps logs readable while preserving signals needed for debugging.
    Always-drop patterns are suppressed. Sampled patterns are limited to
    one emission per 30 seconds.
    """

    def __init__(self) -> None:
        super().__init__()
        self._last_seen: dict[str, float] = {}
        self._interval_seconds = 30.0
        self._drop_always = frozenset([
            "flush_done",
            "re-using existing connection",
            "unexpected response: type=text",
        ])
        self._sampled = frozenset([
            "unexpected message",
            "audio stream queue overflow",
            "inference is slower than realtime",
            "connectionreseterror",
            "duplexclosed",
            "final transcript not received after timeout",
            "speech scheduling is paused",
        ])

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


# Apply sampler to noisy dependencies
for logger_name in ("livekit.plugins.cartesia", "livekit"):
    _logger = logging.getLogger(logger_name)
    _logger.addFilter(_RuntimeWarningSampler())


# ═══════════════════════════════════════════════════════════════════════════════
# LEGACY CONSTANTS (re-exported from AgentConfig for backward compatibility)
# ═══════════════════════════════════════════════════════════════════════════════

_config = AgentConfig.get()

FLUX_EOT_THRESHOLD = _config.flux_eot_threshold
FLUX_EAGER_EOT_THRESHOLD = _config.flux_eager_eot_threshold
FLUX_EOT_TIMEOUT_MS = _config.flux_eot_timeout_ms

INTERVIEW_TEMPERATURE = _config.interview_temperature
EVAL_TEMPERATURE = _config.eval_temperature

FIXED_INTERVIEW_DURATION_MINUTES = _config.fixed_interview_duration_minutes

DATABASE_URL = _config.database_url
AGENT_NAME = _config.agent_name
APP_BASE_URL = _config.app_base_url

# STT_MODEL / LLM_MODEL / EVAL_LLM_MODEL / DEFAULT_VOICE_ID / VOICE_REGISTRY — all deleted.
# All AI model values come from the org DB row (set via Super Admin → AI Models).


# ═══════════════════════════════════════════════════════════════════════════════
# MUTABLE STATE ACCESSORS (replaced direct module-level vars)
# ═══════════════════════════════════════════════════════════════════════════════

# Backward-compatible getters/setters for _DB_POOL, _DB_POOL_INIT_TASK, _PENDING_MANUAL_BILLING
# These are now stored in _state_manager instead of module-level variables.

def get_db_pool():
    """Get the database connection pool."""
    return _state_manager.get_db_pool()


def set_db_pool(pool: Any) -> None:
    """Set the database connection pool."""
    _state_manager.set_db_pool(pool)


def get_db_pool_init_task():
    """Get the DB pool init task."""
    return _state_manager.get_db_pool_init_task()


def set_db_pool_init_task(task: Any) -> None:
    """Set the DB pool init task."""
    _state_manager.set_db_pool_init_task(task)


def get_pending_manual_billing(org_id: str) -> list:
    """Get pending billing events for an org."""
    return _state_manager.get_pending_billing(org_id)


def append_pending_manual_billing(org_id: str, event: tuple) -> None:
    """Append a billing event to pending accumulator."""
    _state_manager.append_billing(org_id, event)


def flush_pending_manual_billing_for_org(org_id: str) -> list:
    """Flush (get and clear) billing events for an org."""
    return _state_manager.flush_billing(org_id)


# Old module-level variable names for compatibility
# These are mutable and must be updated by agent_persistence.py and other modules
# Initially None, but can be set via set_db_pool() / set_db_pool_init_task()
_DB_POOL = None
_DB_POOL_INIT_TASK = None
_PENDING_MANUAL_BILLING = _state_manager._pending_manual_billing
