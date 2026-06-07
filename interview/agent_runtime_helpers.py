import re
from interview.agent_runtime_support import logger
_CONTROL_PHRASES = (
    "DO NOT SAY ALOUD",
    "INTERNAL INTERVIEWER INSTRUCTION",
    "NEXT_TURN_DIRECTIVE",
    "SHORT_RESPONSE_DIRECTIVE",
    "INTERVIEW STATE UPDATE",
    "SYSTEM ALERT",
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
    # Remove line-prefixed control directive markers
    cleaned_lines = []
    for line in result.splitlines():
        stripped = line.strip()
        if (
            stripped.startswith("[DO NOT SAY ALOUD")
            or stripped.startswith("[WARMUP")
            or stripped.startswith("[NEXT_TURN_DIRECTIVE")
            or stripped.startswith("[SHORT_RESPONSE_DIRECTIVE")
            or stripped.startswith("[INTERVIEW STATE UPDATE")
            or re.search(r"TOPIC\s*:\s*(NEW|FOLLOWUP)", stripped, re.IGNORECASE)
        ):
            continue
        cleaned_lines.append(line)
    result = "\n".join(cleaned_lines).strip()

    # Remove bracketed control blocks anywhere in the sentence.
    result = re.sub(r"\[(?:[^\[\]]|\[[^\]]*\]){0,2000}\]", " ", result)
    # Remove known control phrases if they leak unbracketed.
    for phrase in _CONTROL_PHRASES:
        result = re.sub(re.escape(phrase), " ", result, flags=re.IGNORECASE)
    result = re.sub(r"\s{2,}", " ", result).strip()
    return result


from interview.tts_phonetic_processor import TTSPhoneticProcessor
tts_phonetic_processor = TTSPhoneticProcessor().initialize_defaults()


async def _tts_acronym_transform(text_stream):
    async for chunk in text_stream:
        yield tts_phonetic_processor.transform(chunk)


_TTS_PHONETIC_FIXES = [
    # Remove em/en dashes that cause TTS to pause-split surrounding words
    (re.compile(r"\s*-{2,}\s*"), ", "),
    # Remove soft-hyphen / mid-word hyphen the LLM inserts (e.g. "respon-sibilities")
    # Only strip hyphens that are surrounded by letters -- keep valid compounds like "well-known"
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


def _enforce_single_question(text: str) -> str:
    """Keep at most ONE question in the spoken output.

    Generic, last-line-of-defense enforcement of the one-question-per-turn rule
    (works for any role/resume/JD). The agent occasionally emits a compound turn
    like a short reaction + TWO questions ("What did you build? And what was your
    role?"). We keep everything up to and including the FIRST '?', and drop any
    further question sentences that follow it.

    A single question that merely contains the word "and" (one '?') is left
    untouched -- we split on question marks, not on "and".
    """
    if not text:
        return text
    # Count question marks. 0 or 1 -> nothing to trim.
    first_q = text.find("?")
    if first_q == -1:
        return text
    head = text[: first_q + 1]
    tail = text[first_q + 1:].strip()
    if not tail:
        return text
    # If the tail contains another question, drop the tail entirely (it is a
    # second question). If the tail is only a trailing statement with no '?',
    # keep it -- it's a closing remark, not a second question.
    if "?" in tail:
        logger.debug(
            "[SINGLE_Q] Trimmed compound output to first question. Dropped tail: %r",
            tail[:120],
        )
        return head.strip()
    return text


async def _single_question_transform(text_stream):
    """
    TTS text transform: buffers the full LLM output, strips internal directives
    and markdown artifacts, then yields sentence by sentence for clean TTS synthesis.
    """
    buffer = ""
    async for chunk in text_stream:
        buffer += chunk
    result = sanitize_candidate_facing_text(buffer)
    result = _enforce_single_question(result)
    result = _apply_tts_phonetic_fixes(result)
    if result:
        logger.debug(f"[TTS_FINAL] Text sent to TTS: {result[:300]!r}")
        # Yield the full response as one string so Sarvam/Cartesia have full phoneme
        # context. Splitting into chunks causes garbled consonant-cluster words
        # (e.g. "bu..ild", "thr-ough") when those words land at the start of a chunk.
        yield result
    else:
        # LLM output was entirely internal directives -- the eval directive arrived and
        # the LLM echoed it instead of generating a question. This is a recoverable
        # state: the directive IS already injected into chat_ctx (that's what the LLM
        # read), so the next pipeline_reply turn will pick it up correctly.
        # We suppress output here (don't speak garbage) and let the routing timeout
        # path trigger a clean second LLM call with the directive already in context.
        logger.debug(
            "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output (expected during STT fragment assembly)."
        )
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
    lines = ["PRIOR EXCHANGES (for callbacks and consistency checks -- do not read aloud):"]
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
    """Remove system messages whose content contains marker. Single linear scan."""
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


def remove_system_messages_multi(chat_ctx, markers: tuple) -> None:
    """Remove system messages matching ANY of the given markers in a single scan.

    Replaces calling remove_system_messages() N times, which did N separate
    linear scans over chat_ctx.items. One scan, same result.

    Example:
        remove_system_messages_multi(chat_ctx,
            ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
    """
    items = getattr(chat_ctx, "items", None)
    if items is None:
        return

    def _matches_any(msg: object) -> bool:
        if getattr(msg, "role", "") != "system":
            return False
        content = getattr(msg, "content", "") or ""
        if isinstance(content, list):
            content = " ".join(str(part) for part in content)
        content_str = str(content)
        return any(m in content_str for m in markers)

    items[:] = [msg for msg in list(items) if not _matches_any(msg)]


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
