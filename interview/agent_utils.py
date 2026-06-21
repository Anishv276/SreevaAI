"""
interview/agent_utils.py
========================
Text and parsing helpers used by the interview runtime.
"""
import json
from typing import Any


# ---------------------------------------------------------------------------
# JSON coercion
# ---------------------------------------------------------------------------

def _coerce_jsonish(value: Any) -> dict[str, Any]:
    """Safely coerce strings, dicts, or None to a dict."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    return {}


def parse_dispatch_metadata(metadata: Any) -> dict[str, Any]:
    if not metadata:
        return {}
    try:
        parsed = _coerce_jsonish(metadata)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


# ---------------------------------------------------------------------------
# String helpers
# ---------------------------------------------------------------------------

def _compact_optional(value: Any) -> str:
    return str(value).strip() if value is not None else ""


# ---------------------------------------------------------------------------
# Token-aware text truncation
# ---------------------------------------------------------------------------

def truncate_to_tokens(text: str, max_tokens: int, chars_per_token: int = 4) -> str:
    """Rough token-aware truncation. Preserves whole lines."""
    if not text or max_tokens <= 0:
        return ""
    max_chars = max_tokens * chars_per_token
    if len(text) <= max_chars:
        return text
    cutoff = text.rfind("\n", 0, max_chars)
    if cutoff < 0:
        cutoff = max_chars
    return text[:cutoff].rstrip()


# ---------------------------------------------------------------------------
# Cartesia model name helper
# ---------------------------------------------------------------------------

def _cartesia_plugin_model(model: str, default_model: str) -> str:
    compacted = model.strip() if model else ""
    model_name = compacted if compacted else default_model
    return model_name.removeprefix("cartesia/")


# ---------------------------------------------------------------------------
# Name parsing
# ---------------------------------------------------------------------------

def first_name_from_full_name(full_name: str) -> str:
    """
    Extract a usable first name from an Indian full name.
    Skips single-letter initials at the start. For 3+ token names with no leading
    initial, uses the second token (given name in South/North Indian conventions).
    Examples: "S Meenakshi" -> "Meenakshi", "Vadla Vamsi Krishna" -> "Vamsi",
              "Ravi Kumar" -> "Ravi", "John" -> "John".
    """
    if not full_name:
        return ""
    tokens = " ".join(str(full_name).strip().split()).split()
    if not tokens:
        return ""
    if len(tokens) == 1:
        return tokens[0]
    if len(tokens[0]) == 1:
        return tokens[1]
    if len(tokens) >= 3:
        return tokens[1]
    return tokens[0]
