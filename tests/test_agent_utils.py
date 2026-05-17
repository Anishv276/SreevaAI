import pytest
import json
from typing import Any
from agent_utils import (
    _safe_float,
    parse_dispatch_metadata,
    _compact_optional,
    _as_list,
    _compact_text,
    _first_text,
    _deep_get,
    _extract_text_items,
    _join_items,
    _format_compact_section,
    _cartesia_plugin_model,
    truncate_to_tokens,
    _coerce_jsonish,
)

def test_safe_float():
    assert _safe_float(None) is None
    assert _safe_float("") is None
    assert _safe_float("   ") is None
    assert _safe_float(10) == 10.0
    assert _safe_float(12.34) == 12.34
    assert _safe_float("45.6") == 45.6
    assert _safe_float("invalid") is None

def test_coerce_jsonish():
    assert _coerce_jsonish(None) == {}
    assert _coerce_jsonish({}) == {}
    assert _coerce_jsonish('{"key": "value"}') == {"key": "value"}
    assert _coerce_jsonish('{"key": 123}') == {"key": 123}
    with pytest.raises(json.JSONDecodeError):
        _coerce_jsonish('invalid json')
    assert _coerce_jsonish([]) == {}

def test_parse_dispatch_metadata():
    assert parse_dispatch_metadata(None) == {}
    assert parse_dispatch_metadata('{"applicationId": "123"}') == {"applicationId": "123"}
    assert parse_dispatch_metadata('invalid') == {}

def test_compact_optional():
    assert _compact_optional(None) == ""
    assert _compact_optional("  hello  ") == "hello"
    assert _compact_optional(123) == "123"

def test_as_list():
    assert _as_list(None) == []
    assert _as_list([1, 2]) == [1, 2]
    assert _as_list((3, 4)) == [3, 4]
    assert _as_list("single") == ["single"]

def test_compact_text():
    assert _compact_text(None) == ""
    assert _compact_text("  hello    world  \n  new   line ") == "hello world new line"
    assert _compact_text(123) == "123"

def test_first_text():
    assert _first_text(None, "", "  ", "hello", "world") == "hello"
    assert _first_text(None, "") == ""

def test_deep_get():
    source = {"a": {"b": {"c": 42}}}
    assert _deep_get(source, "a.b.c") == 42
    assert _deep_get(source, "a.b") == {"c": 42}
    assert _deep_get(source, "a.x") is None
    assert _deep_get(source, "x.y") is None

def test_extract_text_items_priority_and_deduplication():
    # Priority check: name should come first
    item1 = {"description": "desc", "name": "myName", "title": "myTitle"}
    items = [item1, "simple text", {"skill": "Python"}, "simple text"]
    
    result = _extract_text_items(items)
    
    # "myName" is selected for item1 because "name" has priority over "title" and "description"
    # Deduplication checks: "simple text" is only included once (case-insensitive deduplication)
    assert result == ["myName", "simple text", "Python"]

def test_join_items():
    assert _join_items(["a", "b", "c"], 2) == "a, b"
    assert _join_items([], 5) == "Not available"

def test_format_compact_section():
    lines = ["line 1", "", "  line 2  "]
    result = _format_compact_section("MY TITLE", lines)
    # The original implementation keeps raw whitespaces for matched lines
    assert result == "MY TITLE\n- line 1\n-   line 2  "
    
    empty_result = _format_compact_section("EMPTY", [])
    assert empty_result == "EMPTY\n- Not available"

def test_cartesia_plugin_model():
    assert _cartesia_plugin_model("cartesia/sonic-3", "sonic-3") == "sonic-3"
    assert _cartesia_plugin_model("", "cartesia/sonic-3") == "sonic-3"
    assert _cartesia_plugin_model("custom", "fallback") == "custom"

def test_truncate_to_tokens():
    text = "line1\nline2\nline3\nline4"
    # max_tokens = 3 -> max_chars = 12
    # "line1\nline2\n" is 12 chars
    # cutoff finds '\n' at index 11
    assert truncate_to_tokens(text, 3) == "line1\nline2"
    assert truncate_to_tokens("", 5) == ""
    assert truncate_to_tokens(text, 0) == ""
    assert truncate_to_tokens("short text", 10) == "short text"
