"""
interview/agent_runtime_helpers.py
===================================
Helper functions for the interview agent runtime.

This module provides backward-compatible APIs that delegate to the optimized
utilities in agent_runtime_utils.py. Maintains existing call signatures for
code using these helpers.

Improvements over original:
  - Text sanitization logic centralized in TextSanitizer class
  - Transcript merging encapsulated in TranscriptManager (O(n) instead of O(n²))
  - Removed duplicate remove_system_messages() calls (use _multi version)
  - Better separation of concerns
"""
import re
from interview.agent_runtime_support import logger
from interview.agent_runtime_utils import TextSanitizer, TranscriptManager


# ═══════════════════════════════════════════════════════════════════════════════
# TEXT SANITIZATION API (delegated to TextSanitizer)
# ═══════════════════════════════════════════════════════════════════════════════

def sanitize_candidate_facing_text(text: str) -> str:
    """Remove internal control directives from candidate-facing text.

    Args:
        text: Raw text that may contain internal directives

    Returns:
        Cleaned text safe to speak or display to candidate

    Delegates to TextSanitizer.sanitize_candidate_facing_text()
    """
    return TextSanitizer.sanitize_candidate_facing_text(text)


def polish_candidate_facing_text(text: str) -> str:
    """Final deterministic cleanup before text is spoken.

    Args:
        text: Text to polish (may contain banned acks, fillers)

    Returns:
        Polished text ready for TTS

    Delegates to TextSanitizer.polish_candidate_facing_text()
    """
    return TextSanitizer.polish_candidate_facing_text(text)


def _apply_tts_phonetic_fixes(text: str) -> str:
    """Apply phonetic fixes for TTS speech synthesis.

    Args:
        text: Text to apply fixes to

    Returns:
        Text with TTS-friendly phonetic transformations

    Delegates to TextSanitizer.apply_tts_phonetic_fixes()
    """
    return TextSanitizer.apply_tts_phonetic_fixes(text)


def _enforce_single_question(text: str) -> str:
    """Legacy hook retained for call-site compatibility.

    We no longer trim valid compound interview openers before TTS.
    The fresh logs showed this created a worse bug: Sarvam spoke only
    the first sentence while transcript/eval tracked the unspoken tail.

    Args:
        text: Text to process

    Returns:
        Unchanged text (this is a no-op)
    """
    return text


# ═══════════════════════════════════════════════════════════════════════════════
# TTS TRANSFORMS (async generators for streaming)
# ═══════════════════════════════════════════════════════════════════════════════

# Initialize TTS processor for acronym/phonetic handling
try:
    from interview.tts_phonetic_processor import TTSPhoneticProcessor
    tts_phonetic_processor = TTSPhoneticProcessor().initialize_defaults()
except Exception as e:
    logger.warning(f"Failed to initialize TTSPhoneticProcessor: {e}")
    tts_phonetic_processor = None


async def _tts_acronym_transform(text_stream):
    """Transform text stream through TTS acronym processor.

    Args:
        text_stream: async iterable of text chunks

    Yields:
        Transformed text chunks
    """
    if tts_phonetic_processor is None:
        async for chunk in text_stream:
            yield chunk
        return

    async for chunk in text_stream:
        yield tts_phonetic_processor.transform(chunk)


async def _single_question_transform(text_stream):
    """TTS text transform: sanitization + phonetic fixes per chunk.

    Applies transformations as chunks stream in, rather than buffering
    the full LLM response first. This gives TTS engines full phoneme
    context per sentence via sentence-boundary splitting in _push_sentences.

    Suppresses output entirely if all chunks sanitize to empty (LLM echoed
    a directive).

    Args:
        text_stream: async iterable of text chunks from LLM

    Yields:
        Cleaned and transformed chunks ready for TTS
    """
    emitted_any = False
    async for chunk in text_stream:
        cleaned = polish_candidate_facing_text(chunk)
        cleaned = _enforce_single_question(cleaned)
        cleaned = _apply_tts_phonetic_fixes(cleaned)
        if cleaned:
            if not emitted_any:
                logger.debug(f"[TTS_FIRST_CHUNK] First chunk to TTS: {cleaned[:120]!r}")
            emitted_any = True
            yield cleaned

    if not emitted_any:
        logger.debug(
            "[SINGLE_Q] Transform yielded empty after directive sanitization; "
            "suppressing output (expected during STT fragment assembly)."
        )


# ═══════════════════════════════════════════════════════════════════════════════
# TRANSCRIPT CONTEXT BUILDING
# ═══════════════════════════════════════════════════════════════════════════════

def _build_recent_context_block(
    transcript_lines: list[str],
    last_question: str,
    n_exchanges: int = 3,
) -> str:
    """Build a compact structured summary of the last N Q&A exchanges.

    Pairs each Interviewer line with the following Candidate line.
    Returns empty string if there is nothing useful to inject.

    Args:
        transcript_lines: List of transcript lines (e.g., ["Interviewer: Q", "Candidate: A"])
        last_question: The last question asked (for context)
        n_exchanges: Number of exchanges to include (default 3)

    Returns:
        Formatted context block for LLM injection, or empty string
    """
    exchanges: list[dict[str, str]] = []
    i = len(transcript_lines) - 1

    while i >= 0 and len(exchanges) < n_exchanges:
        line = transcript_lines[i]
        if re.match(r"^Candidate(\[\d+\])?:", line):
            candidate_text = re.sub(r"^Candidate(\[\d+\])?:\s*", "", line)
            # Search backward for the paired Interviewer line (within 6 lines)
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


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM MESSAGE REMOVAL (chat_ctx manipulation)
# ═══════════════════════════════════════════════════════════════════════════════

def remove_system_messages(chat_ctx, marker: str) -> None:
    """Remove system messages containing a marker.

    DEPRECATED: Use remove_system_messages_multi() for multiple markers
    to avoid O(n²) cost when removing multiple markers iteratively.

    Args:
        chat_ctx: LiveKit Agent ChatContext object
        marker: String to search for in system message content

    Side effect: Mutates chat_ctx.items in-place
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


def remove_system_messages_multi(chat_ctx, markers: tuple) -> None:
    """Remove system messages matching ANY of the given markers (single scan).

    Replaces calling remove_system_messages() N times, which would do N
    separate linear scans. This version does ONE scan for all markers.

    PREFERRED over remove_system_messages() when removing multiple markers.

    Args:
        chat_ctx: LiveKit Agent ChatContext object
        markers: Tuple of strings to search for

    Side effect: Mutates chat_ctx.items in-place

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


# ═══════════════════════════════════════════════════════════════════════════════
# TRANSCRIPT APPENDING (delegated to TranscriptManager for O(n) efficiency)
# ═══════════════════════════════════════════════════════════════════════════════

def append_transcript_line(transcript_lines: list[str], speaker: str, text: str) -> None:
    """Append a transcript line with dedup and merge logic.

    This function maintains the original list-based API for backward
    compatibility. Internally uses TranscriptManager logic.

    Args:
        transcript_lines: Mutable list to append to
        speaker: Speaker name (e.g., "Candidate", "Interviewer")
        text: Line content

    Side effect: Mutates transcript_lines in-place

    Behavior:
        - Removes HTML tags and extra whitespace
        - Skips empty lines
        - Deduplicates exact repeats
        - Merges same-speaker consecutive lines (STT fragments)
    """
    # Create a temporary manager, use it, then copy back
    # This maintains the list-based API while using optimized logic
    manager = TranscriptManager()
    manager._lines = transcript_lines.copy()
    manager.append(speaker, text)

    # Copy the result back to the original list
    # (This maintains the reference for code that passes the same list)
    transcript_lines.clear()
    transcript_lines.extend(manager.lines)
