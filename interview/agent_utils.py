"""
interview/agent_utils.py
========================
General Parsing and Text Helpers -- Production-Grade Modernization
Tech Stack Applied:
  - OOP Strategy & Registry Pattern -> For safe type coercion and JSON/Float parsing.
  - OOP GoF Builder Pattern        -> MarkdownSectionBuilder for structured prompt building.
  - DSA O(1) Sets & Search         -> frozenset indexing and backward-scan token truncation.
  - Safe Defaults & Compatibility  -> 100% functional parity with legacy facade wrappers.
"""
import re
import json
from abc import ABC, abstractmethod
from typing import Any, Optional, Union
# ===========================================================================
# 1. Type Coercion Engine (OOP Strategy & Registry Pattern)
# ===========================================================================
class CoercionStrategy(ABC):
    """Abstract base strategy for safe, production-grade type conversions."""
    @abstractmethod
    def coerce(self, value: Any) -> Any:
        pass
class FloatCoercion(CoercionStrategy):
    """Safely converts arbitrary values to floats. Prevents crashes from malformed inputs."""
    def coerce(self, value: Any) -> Optional[float]:
        try:
            if value is None:
                return None
            if isinstance(value, (int, float)):
                return float(value)
            text = str(value).strip()
            return float(text) if text else None
        except Exception:
            return None
class ListCoercion(CoercionStrategy):
    """Coerces any scalar, tuple, or list into a standard Python list representation."""
    def coerce(self, value: Any) -> list[Any]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, tuple):
            return list(value)
        return [value]
class JsonCoercion(CoercionStrategy):
    """Coerces strings, raw dicts, or other values safely into dictionaries."""
    def coerce(self, value: Any) -> dict[str, Any]:
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return {}
            # Explicitly parse; raises JSONDecodeError on failure (matches legacy behavior)
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else {}
        return {}
class SafeCoercer:
    """Unified Facade with O(1) Strategy registry lookup."""
    _STRATEGIES: dict[type, CoercionStrategy] = {
        float: FloatCoercion(),
        list: ListCoercion(),
        dict: JsonCoercion(),
    }
    @classmethod
    def to_float(cls, value: Any) -> Optional[float]:
        return cls._STRATEGIES[float].coerce(value)
    @classmethod
    def to_list(cls, value: Any) -> list[Any]:
        return cls._STRATEGIES[list].coerce(value)
    @classmethod
    def to_dict(cls, value: Any) -> dict[str, Any]:
        return cls._STRATEGIES[dict].coerce(value)
# ===========================================================================
# 2. Text Processing & Formatting Engine (GoF Builder Pattern)
# ===========================================================================
class TextProcessor:
    """OOP utility engine for whitespace compression and text cleanup."""
    _WS_PATTERN = re.compile(r"\s+")
    @classmethod
    def compact(cls, value: Any) -> str:
        """Compresses multiple spaces, tabs, and newlines into a single space."""
        if value is None:
            return ""
        text = str(value).strip() if not isinstance(value, str) else value.strip()
        return cls._WS_PATTERN.sub(" ", text).strip()
    @classmethod
    def first_non_empty(cls, *values: Any) -> str:
        """Walks values and returns the first compacted string that is not empty."""
        for value in values:
            compacted = cls.compact(value)
            if compacted:
                return compacted
        return ""
class MarkdownSectionBuilder:
    """Fluent Builder Pattern for constructing beautifully structured prompt sections."""
    def __init__(self, title: str):
        self._title = title.strip()
        self._lines: list[str] = []
    def add_line(self, line: str) -> "MarkdownSectionBuilder":
        """Adds a bullet point to the markdown list section."""
        self._lines.append(f"- {line}")
        return self
    def build(self) -> str:
        """Assembles the final markdown string."""
        body = "\n".join(self._lines) if self._lines else "- Not available"
        return f"{self._title}\n{body}"
# ===========================================================================
# 3. Schema Extraction & Traversal Engine (DSA Optimized)
# ===========================================================================
class SchemaExtractor:
    """DSA Engine for efficient nested dictionary traversal and field searching."""
    # Priority checklist for extracting labels from candidate data
    DEFAULT_FIELD_PRIORITY = (
        "name", "title", "skill", "tool", "role", "company", "description",
        "summary", "condition", "reason", "area", "what_to_probe",
        "why_it_matters", "claim", "proof", "note", "message", "status", "value"
    )
    DEFAULT_FIELDS_SET = frozenset(DEFAULT_FIELD_PRIORITY)
    @classmethod
    def deep_get(cls, source: Any, path: str) -> Any:
        """Traverses nested dicts using an O(N) path-splitting algorithm."""
        current = source
        for key in path.split("."):
            if not isinstance(current, dict):
                return None
            current = current.get(key)
            if current is None:
                return None
        return current
    @classmethod
    def extract_text_items(cls, items: Any, fields: tuple[str, ...] = ()) -> list[str]:
        """
        Extracts non-empty values from raw lists or dictionary structures.
        Uses an O(1) set-membership check for de-duplication while preserving insertion order.
        """
        extracted: list[str] = []
        for item in SafeCoercer.to_list(items):
            text = ""
            if isinstance(item, dict):
                if fields:
                    text = TextProcessor.first_non_empty(*(item.get(f) for f in fields))
                else:
                    text = TextProcessor.first_non_empty(*(item.get(f) for f in cls.DEFAULT_FIELD_PRIORITY))
            else:
                text = TextProcessor.first_non_empty(item)
            if text:
                extracted.append(text)
        unique: list[str] = []
        seen: set[str] = set()
        for t in extracted:
            k = t.lower()
            if k not in seen:
                seen.add(k)
                unique.append(t)
        return unique
class TextTruncator:
    """DSA line-aware text truncator using backward newline search."""
    @staticmethod
    def truncate_to_tokens(text: str, max_tokens: int, chars_per_token: int = 4) -> str:
        """
        Rough token-aware truncation using a 4 chars/token estimate.
        Preserves whole lines by cutting at the last newline before the limit.
        """
        if not text or max_tokens <= 0:
            return ""
        max_chars = max_tokens * chars_per_token
        if len(text) <= max_chars:
            return text
        cutoff = text.rfind("\n", 0, max_chars)
        if cutoff < 0:
            cutoff = max_chars
        return text[:cutoff].rstrip()
# ===========================================================================
# 4. Backward Compatibility Layer (Facade / Adapter)
# ===========================================================================
def _safe_float(value: Any) -> Optional[float]:
    return SafeCoercer.to_float(value)
def parse_dispatch_metadata(metadata: Any) -> dict[str, Any]:
    if not metadata:
        return {}
    try:
        parsed = _coerce_jsonish(metadata)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}
def _compact_optional(value: Any) -> str:
    return str(value).strip() if value is not None else ""
def _as_list(value: Any) -> list[Any]:
    return SafeCoercer.to_list(value)
def _compact_text(value: Any) -> str:
    return TextProcessor.compact(value)
def _first_text(*values: Any) -> str:
    return TextProcessor.first_non_empty(*values)
def _deep_get(source: Any, path: str) -> Any:
    return SchemaExtractor.deep_get(source, path)
def _extract_text_items(items: Any, fields: tuple[str, ...] = ()) -> list[str]:
    return SchemaExtractor.extract_text_items(items, fields)
def _join_items(items: list[str], max_items: int) -> str:
    return ", ".join(items[:max_items]) if items else "Not available"
def _format_compact_section(title: str, lines: list[str]) -> str:
    clean_lines = [line for line in lines if _compact_text(line)]
    if not clean_lines:
        clean_lines = ["Not available"]
    builder = MarkdownSectionBuilder(title)
    for line in clean_lines:
        builder.add_line(line)
    return builder.build()
def _cartesia_plugin_model(model: str, default_model: str) -> str:
    compacted = TextProcessor.compact(model)
    model_name = compacted if compacted else default_model
    return model_name.removeprefix("cartesia/")
def truncate_to_tokens(text: str, max_tokens: int) -> str:
    return TextTruncator.truncate_to_tokens(text, max_tokens)
def _coerce_jsonish(value: Any) -> dict[str, Any]:
    return SafeCoercer.to_dict(value)
# ===========================================================================
# 5. Transcript Turn Builder (moved from resume_context_parser.py)
# ===========================================================================
class _TranscriptTurnBuilder:
    """Collect transcript lines, then fold them into Q/A turns."""
    def __init__(self) -> None:
        self.blocks: list[dict[str, str]] = []
        self.turns: list[dict[str, Any]] = []
        self.current_question: Optional[str] = None
        self.current_answer_parts: list[str] = []
        self._speaker_re = re.compile(r"^(Interviewer|Candidate)(\[\d+\])?:\s*")
    def add_block(self, speaker: str, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        if self.blocks and self.blocks[-1]["speaker"] == speaker:
            self.blocks[-1]["text"] = f'{self.blocks[-1]["text"]} {text}'.strip()
            return
        self.blocks.append({"speaker": speaker, "text": text})
    def add_line(self, raw_line: Any) -> None:
        if not isinstance(raw_line, str):
            return
        line = raw_line.strip()
        if not line:
            return
        m = self._speaker_re.match(line)
        if m:
            self.add_block(m.group(1), line[m.end():].strip())
        else:
            self.add_block("Interviewer", line)
    def flush_turn(self) -> None:
        question = (self.current_question or "").strip()
        answer = " ".join(p.strip() for p in self.current_answer_parts if p.strip()).strip()
        if question or answer:
            self.turns.append({
                "turn": len(self.turns) + 1,
                "question": question,
                "answer": answer,
                "questionSpeaker": "Interviewer",
                "answerSpeaker": "Candidate" if answer else None,
            })
        self.current_question = None
        self.current_answer_parts = []
    def build(self, transcript_lines: list[Any]) -> list[dict[str, Any]]:
        for raw_line in transcript_lines or []:
            self.add_line(raw_line)
        for block in self.blocks:
            speaker = block["speaker"]
            text = block["text"]
            if speaker == "Interviewer":
                if self.current_question is not None or self.current_answer_parts:
                    self.flush_turn()
                self.current_question = text
            else:
                if self.current_question is None:
                    self.current_question = ""
                self.current_answer_parts.append(text)
        if self.current_question is not None or self.current_answer_parts:
            self.flush_turn()
        return self.turns
def build_interview_turns(transcript_lines: list[Any]) -> list[dict[str, Any]]:
    """Group raw transcript lines into deterministic interviewer/candidate turns."""
    return _TranscriptTurnBuilder().build(transcript_lines)
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
