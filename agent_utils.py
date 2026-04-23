import json
import re
from typing import Optional, Any

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

def safe_parse(val: Any, fallback: str = "Not provided") -> str:
    if val is None or val in ("{}", "[]", "null", "None"):
        return fallback
    try:
        if isinstance(val, str):
            parsed = json.loads(val)
        elif isinstance(val, (dict, list)):
            parsed = val
        else:
            return str(val).strip() or fallback

        if isinstance(parsed, dict):
            return "\n".join(f"  {k}: {v}" for k, v in parsed.items() if v)
        if isinstance(parsed, list):
            return "\n".join(f"  - {item}" for item in parsed if item)
        if isinstance(parsed, str):
            text = parsed.strip()
            return text or fallback
        return fallback
    except Exception:
        return str(val).strip() or fallback

def _compact_optional(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text

def first_name_from_full_name(full_name: str) -> str:
    if not full_name:
        return ""
    cleaned = " ".join(str(full_name).strip().split())
    if not cleaned:
        return ""
    return cleaned.split(" ", 1)[0]

def build_interview_turns(transcript_lines: list[Any]) -> list[dict[str, Any]]:
    """Group raw transcript lines into question/answer turns."""
    blocks: list[dict[str, Any]] = []

    def _append_block(speaker: str, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        if blocks and blocks[-1]["speaker"] == speaker:
            blocks[-1]["text"] = f'{blocks[-1]["text"]} {text}'.strip()
        else:
            blocks.append({"speaker": speaker, "text": text})

    for raw_line in transcript_lines or []:
        if not isinstance(raw_line, str):
            continue
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("Interviewer:"):
            _append_block("Interviewer", line[len("Interviewer:"):].strip())
        elif line.startswith("Candidate:"):
            _append_block("Candidate", line[len("Candidate:"):].strip())
        else:
            _append_block("Interviewer", line)

    turns: list[dict[str, Any]] = []
    current_question: Optional[str] = None
    current_answer_parts: list[str] = []
    turn_index = 0

    def _flush_turn() -> None:
        nonlocal current_question, current_answer_parts, turn_index
        question = (current_question or "").strip()
        answer = " ".join(part.strip() for part in current_answer_parts if part.strip()).strip()
        if question or answer:
            turn_index += 1
            turns.append({
                "turn": turn_index,
                "question": question,
                "answer": answer,
                "questionSpeaker": "Interviewer",
                "answerSpeaker": "Candidate" if answer else None,
            })
        current_question = None
        current_answer_parts = []

    for block in blocks:
        speaker = block["speaker"]
        text = block["text"]
        if speaker == "Interviewer":
            if current_question is not None or current_answer_parts:
                _flush_turn()
            current_question = text
        else:
            if current_question is None:
                current_question = ""
            current_answer_parts.append(text)

    if current_question is not None or current_answer_parts:
        _flush_turn()

    return turns
