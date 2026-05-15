import re
from typing import Any, Optional
def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value).strip()
        if not text:
            return None
        return float(text)
    except Exception:
        return None

def parse_dispatch_metadata(metadata: Any) -> dict[str, Any]:
    if not metadata:
        return {}
    try:
        parsed = _coerce_jsonish(metadata)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}
def _compact_optional(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text
def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]
def _compact_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value.strip()
    else:
        text = str(value).strip()
    return re.sub(r"\s+", " ", text).strip()
def _first_text(*values: Any) -> str:
    for value in values:
        text = _compact_text(value)
        if text:
            return text
    return ""
def _deep_get(source: Any, path: str) -> Any:
    current = source
    for key in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
        if current is None:
            return None
    return current
def _extract_text_items(items: Any, fields: tuple[str, ...] = ()) -> list[str]:
    extracted: list[str] = []
    for item in _as_list(items):
        text = ""
        if isinstance(item, dict):
            if fields:
                text = _first_text(*(item.get(field) for field in fields))
            else:
                text = _first_text(
                    item.get("name"),
                    item.get("title"),
                    item.get("skill"),
                    item.get("tool"),
                    item.get("role"),
                    item.get("company"),
                    item.get("description"),
                    item.get("summary"),
                    item.get("condition"),
                    item.get("reason"),
                    item.get("area"),
                    item.get("what_to_probe"),
                    item.get("why_it_matters"),
                    item.get("claim"),
                    item.get("proof"),
                    item.get("note"),
                    item.get("message"),
                    item.get("status"),
                    item.get("value"),
                )
        else:
            text = _first_text(item)
        if text:
            extracted.append(text)
    unique: list[str] = []
    seen: set[str] = set()
    for text in extracted:
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(text)
    return unique
def _join_items(items: list[str], max_items: int) -> str:
    return ", ".join(items[:max_items]) if items else "Not available"
def _format_compact_section(title: str, lines: list[str]) -> str:
    clean_lines = [line for line in lines if _compact_text(line)]
    if not clean_lines:
        clean_lines = ["Not available"]
    body = "\n".join(f"- {line}" for line in clean_lines)
    return f"{title}\n{body}"

def _cartesia_plugin_model(model: str, default_model: str) -> str:
    model = _compact_text(model)
    if not model:
        return default_model.removeprefix("cartesia/")
    return model.removeprefix("cartesia/")
def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """
    Rough token-aware truncation using a 4 chars/token estimate.
    Preserves whole lines by cutting at the last newline before the limit.
    """
    if not text or max_tokens <= 0:
        return ""
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    cutoff = text.rfind("\n", 0, max_chars)
    if cutoff < 0:
        cutoff = max_chars
    return text[:cutoff].rstrip()
def _coerce_jsonish(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        import json
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    return {}
