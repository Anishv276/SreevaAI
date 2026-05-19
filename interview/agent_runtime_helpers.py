import json
import re
import time
from typing import Any
from interview.agent_persistence import get_db_pool
from interview.agent_runtime_support import logger
_CONTROL_PHRASES = (
    "DO NOT SAY ALOUD",
    "INTERNAL INTERVIEWER INSTRUCTION",
    "NEXT_TURN_DIRECTIVE",
    "SHORT_RESPONSE_DIRECTIVE",
    "INTERVIEW STATE UPDATE",
    "SYSTEM ALERT",
    "BEGIN STAGE",
    "TOPIC:NEW",
    "TOPIC:FOLLOWUP",
)


def sanitize_candidate_facing_text(text: str) -> str:
    """
    Remove internal control directives from any model-generated text that can be
    spoken or shown to the candidate.
    """
    result = (text or "").replace("<wait for response>", "").strip()
    if not result:
        return ""
    # Remove bracketed control blocks anywhere in the sentence.
    result = re.sub(r"\[(?:[^\[\]]|\[[^\]]*\]){0,2000}\]", " ", result)
    # Remove known control phrases if they leak unbracketed.
    for phrase in _CONTROL_PHRASES:
        result = re.sub(re.escape(phrase), " ", result, flags=re.IGNORECASE)
    # Remove legacy line-prefixed directive markers.
    cleaned_lines = []
    for line in result.splitlines():
        stripped = line.strip()
        if (
            stripped.startswith("[DO NOT SAY ALOUD")
            or stripped.startswith("[STAGE")
            or stripped.startswith("[WARMUP")
            or stripped.startswith("[NEXT_TURN_DIRECTIVE")
            or stripped.startswith("[SHORT_RESPONSE_DIRECTIVE")
            or stripped.startswith("[INTERVIEW STATE UPDATE")
            or stripped.startswith("[TOPIC:NEW")
            or stripped.startswith("[TOPIC:FOLLOWUP")
        ):
            continue
        cleaned_lines.append(line)
    result = "\n".join(cleaned_lines).strip()
    result = re.sub(r"\s{2,}", " ", result).strip()
    return result


# Acronym replacements that must only fire on whole words (word-boundary aware).
# text_transforms.replace does case-insensitive substring matching which corrupts
# normal words: "build" -> "bU Ild", "through" -> "tH Rough", "quite" -> "qU Ite".
_ACRONYM_REPLACEMENTS = [
    (re.compile(r"\bHR\b"), "H R"),
    (re.compile(r"\bAPI\b"), "A P I"),
    (re.compile(r"\bSQL\b"), "sequel"),
    (re.compile(r"\bURL\b"), "U R L"),
    (re.compile(r"\bUI\b"), "U I"),
    (re.compile(r"\bUX\b"), "U X"),
    (re.compile(r"\bSaaS\b"), "sass"),
    (re.compile(r"\bDevOps\b"), "dev ops"),
    (re.compile(r"\bLiveKit\b"), "Live Kit"),
]


async def _tts_acronym_transform(text_stream):
    async for chunk in text_stream:
        result = chunk
        for pattern, replacement in _ACRONYM_REPLACEMENTS:
            result = pattern.sub(replacement, result)
        yield result


_TTS_PHONETIC_FIXES = [
    # Remove em/en dashes that cause TTS to pause-split surrounding words
    (re.compile(r"\s*[—–]\s*"), ", "),
    # Remove soft-hyphen / mid-word hyphen the LLM inserts (e.g. "respon-sibilities")
    # Only strip hyphens that are surrounded by letters — keep valid compounds like "well-known"
    # by replacing letter-hyphen-letter with the letters joined directly.
    (re.compile(r"(?<=[a-zA-Z])-(?=[a-zA-Z])"), ""),
    # Normalize ellipsis to a pause comma so TTS doesn't spell dots
    (re.compile(r"\.{2,}"), ", "),
    # Strip residual markdown symbols (backticks, asterisks, underscores, tildes)
    (re.compile(r"[`*_~]"), ""),
    # Collapse any resulting double spaces
    (re.compile(r" {2,}"), " "),
]


def _apply_tts_phonetic_fixes(text: str) -> str:
    for pattern, replacement in _TTS_PHONETIC_FIXES:
        text = pattern.sub(replacement, text)
    return text


async def _single_question_transform(text_stream):
    """
    TTS text transform: buffers the full LLM output, strips internal directives
    and markdown artifacts, then yields sentence by sentence for clean TTS synthesis.
    """
    buffer = ""
    async for chunk in text_stream:
        buffer += chunk
    logger.debug(f"[TTS_RAW] LLM output before sanitize: {buffer[:300]!r}")
    result = sanitize_candidate_facing_text(buffer)
    result = _apply_tts_phonetic_fixes(result)
    if result:
        logger.debug(f"[TTS_FINAL] Text sent to TTS: {result[:300]!r}")
        # Yield the full response as one string so Sarvam/Cartesia have full phoneme
        # context. Splitting into chunks causes garbled consonant-cluster words
        # (e.g. "bu..ild", "thr-ough") when those words land at the start of a chunk.
        yield result
    else:
        # Never fall back to raw text because it can leak internal directives.
        logger.warning(
            "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output."
        )
def _sanitize_claim_value(value: str, max_len: int = 80) -> str:
    """Strip characters that could break prompt structure when injected into system messages."""
    if not value:
        return ""
    cleaned = re.sub(r"[\n\r\[\]\\]", " ", str(value)).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:max_len]
def _build_recent_context_block(
    transcript_lines: list[str],
    last_question: str,
    n_exchanges: int = 3,
) -> str:
    """
    Build a compact structured summary of the last N Q&A exchanges.
    Pairs each Interviewer line with the following Candidate line.
    Returns empty string if there is nothing useful to inject.
    """
    exchanges: list[dict[str, str]] = []
    i = len(transcript_lines) - 1
    while i >= 0 and len(exchanges) < n_exchanges:
        line = transcript_lines[i]
        if re.match(r"^Candidate(\[\d+\])?:", line):
            candidate_text = re.sub(r"^Candidate(\[\d+\])?:\s*", "", line)
            for j in range(i - 1, max(i - 6, -1), -1):
                if re.match(r"^Interviewer(\[\d+\])?:", transcript_lines[j]):
                    interviewer_text = re.sub(r"^Interviewer(\[\d+\])?:\s*", "", transcript_lines[j])
                    exchanges.insert(0, {"q": interviewer_text, "a": candidate_text})
                    i = j - 1
                    break
            else:
                i -= 1
        else:
            i -= 1
    if not exchanges:
        return ""
    lines = ["PRIOR EXCHANGES (for callbacks and contradiction detection â€” do not read aloud):"]
    for idx, ex in enumerate(exchanges, 1):
        q_text = ex["q"][:150]
        a_text = ex["a"][:250]
        lines.append(f"Exchange {idx}:")
        lines.append(f"  Q: {q_text}")
        lines.append(f"  A: {a_text}")
    lines.append(f"\nLast question asked: {last_question[:150]}")
    lines.append("React naturally to the candidate's last answer. Reference prior context only when it adds meaning.")
    return "\n".join(lines)
def remove_system_messages(chat_ctx, marker: str) -> None:
    """
    Remove matching system instructions from the live chat context.

    LiveKit's ChatContext.messages() returns a new list, so removing from that
    copy has no effect. Mutate the underlying items list in place instead.
    """
    items = getattr(chat_ctx, "items", None)
    if items is None:
        return

    def _contains_marker(msg: object) -> bool:
        if getattr(msg, "role", "") != "system":
            return False
        content = getattr(msg, "content", "") or ""
        if isinstance(content, list):
            content = " ".join(str(part) for part in content)
        return marker in str(content)

    items[:] = [msg for msg in list(items) if not _contains_marker(msg)]


def append_transcript_line(transcript_lines: list[str], speaker: str, text: str) -> None:
    text = re.sub(r"<[^>]+>", "", text).strip()
    clean = " ".join(text.split()).strip()
    if not clean:
        return
    line = f"{speaker}: {clean}"
    if not transcript_lines:
        transcript_lines.append(line)
        logger.debug(f"Transcript: {line}")
        return
    prev = transcript_lines[-1]
    if prev == line:
        return
    same_speaker_prefix = f"{speaker}: "
    if prev.startswith(same_speaker_prefix):
        prev_text = prev[len(same_speaker_prefix):]
        if clean.startswith(prev_text) or prev_text.startswith(clean):
            transcript_lines[-1] = line if len(clean) >= len(prev_text) else prev
            return
    transcript_lines.append(line)
    logger.debug(f"Transcript: {line}")
async def report_proctoring_realtime(app_id: str, evt_type: str, reason: str, score_delta: int, sev: str = "medium"):
    if not app_id:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE "Interview"
                SET "proctoringReport" = jsonb_set(
                    COALESCE("proctoringReport", '{"events": []}'::jsonb),
                    '{events}',
                    COALESCE("proctoringReport"->'events', '[]'::jsonb) || $1::jsonb
                ),
                "updatedAt" = NOW()
                WHERE "applicationId" = $2
                """,
                json.dumps({
                    "eventType": evt_type,
                    "reason": reason,
                    "timestamp": int(time.time() * 1000),
                    "severity": sev,
                    "score_delta": score_delta,
                }),
                app_id,
            )
    except Exception as e:
        logger.warning(f"[PROCTOR] Real-time persistence failed: {e}")
async def signal_client_proctoring_violation(ctx: Any, evt_type: str, reason: str, sev: str = "medium"):
    if not ctx.room.local_participant:
        return
    try:
        payload = json.dumps({
            "type": "proctoring_violation",
            "eventType": evt_type,
            "reason": reason,
            "severity": sev,
            "timestamp": int(time.time() * 1000),
        }).encode("utf-8")
        await ctx.room.local_participant.publish_data(payload, reliable=True)
    except Exception as e:
        logger.warning(f"[PROCTOR] Client signaling failed: {e}")
async def signal_client_interview_terminated(ctx: Any, reason: str) -> None:
    if not ctx.room.local_participant:
        return
    try:
        payload = json.dumps({
            "type": "interview_terminated",
            "reason": reason,
            "timestamp": int(time.time() * 1000),
        }).encode("utf-8")
        await ctx.room.local_participant.publish_data(payload, reliable=True)
        logger.info(f"[INTERVIEW_END] termination signal sent: {reason}")
    except Exception as e:
        logger.warning(f"[INTERVIEW_END] Client termination signal failed: {e}")
def refresh_composite_risk(integrity_risk: int, depth_risk: int) -> int:
    from interview.agent_runtime_support import compose_risk_score
    return compose_risk_score(integrity_risk, depth_risk)
def require_db_value(context: dict[str, Any], key: str, default: Any = None, required: bool = True):
    value = context.get(key)
    if value is None:
        if not required:
            return default
        raise RuntimeError(f"Missing required DB field: {key}")
    if isinstance(value, str) and not value.strip():
        if not required:
            return default
        raise RuntimeError(f"Missing required DB field: {key}")
    return value
def build_language_codes(interview_lang: str) -> dict[str, str]:
    mapping = {
        "English": {"stt": "en-US", "tts": "en"},
        "Hindi": {"stt": "hi", "tts": "hi"},
    }
    lang_codes = mapping.get(interview_lang)
    if not lang_codes:
        raise RuntimeError(f"Unsupported interview language in DB: {interview_lang}")
    return lang_codes
