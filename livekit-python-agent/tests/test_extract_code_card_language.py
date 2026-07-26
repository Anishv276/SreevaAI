"""
extract_code_card() gained a 4th return value (language) so the frontend can
syntax-highlight snippet questions -- previously only spoken_text/code/
question_type were extracted, with no way to recover the real programming
language (the fence tag is always a question-type tag like ```code_trace,
never a language tag, per phases.py's _code_card_format_rule). Stored anchor
questions from question_bank_adapter.py embed the real language on a "LANG:
<language>" line right after the fence tag; this exercises that parsing.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from interview.agent_runtime import extract_code_card


def test_extracts_lang_annotation_and_strips_it_from_code():
    text = (
        "Take a look at the snippet on your screen -- what would this print? "
        "```code_trace\n"
        "LANG: python\n"
        "x = [1, 2, 3]\n"
        "print(x[1:])\n"
        "```"
    )
    result = extract_code_card(text)
    assert result is not None
    spoken, code, question_type, language = result
    assert language == "python"
    assert question_type == "code_trace"
    assert "LANG:" not in code
    assert "x = [1, 2, 3]" in code
    assert "LANG" not in spoken


def test_falls_back_to_question_type_tag_when_no_lang_annotation():
    """Live-generated PROBE snippets (no known language ahead of time) don't
    carry a LANG line -- language comes back empty, and callers fall back to
    the question-type tag itself (see agent_runtime.py's publish_data call:
    `_card_language or _card_question_type`)."""
    text = "What would this output? ```code_trace\nprint(1 + 1)\n```"
    result = extract_code_card(text)
    assert result is not None
    _, code, question_type, language = result
    assert language == ""
    assert question_type == "code_trace"
    assert "print(1 + 1)" in code


def test_plain_language_fence_tag_still_recognized():
    text = "What would this output? ```python\nprint('hi')\n```"
    result = extract_code_card(text)
    assert result is not None
    _, code, question_type, language = result
    assert language == "python"
    assert question_type == "code_trace"  # falls back to code_trace calibration
    assert "print('hi')" in code


def test_query_trace_with_lang_annotation():
    text = (
        "What would this return? "
        "```query_trace\n"
        "LANG: sql\n"
        "SELECT * FROM orders;\n"
        "```"
    )
    result = extract_code_card(text)
    assert result is not None
    _, code, question_type, language = result
    assert language == "sql"
    assert question_type == "query_trace"
    assert "SELECT * FROM orders;" in code


def test_no_fence_returns_none():
    assert extract_code_card("just a plain spoken question, no code here?") is None
