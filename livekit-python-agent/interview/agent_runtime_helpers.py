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

# -- ElevenLabs text normalization ---------------------------------------------
# flash_v2_5 has weaker normalization than multilingual_v2. Pre-normalize before
# sending to ElevenLabs so numbers, symbols, and double-punctuation are clean.
_EL_NORMALIZE: tuple[tuple[re.Pattern, str], ...] = (
    # Double-comma fillers the LLM writes ("Ah,, okay" / "Right,, so") → single comma
    (re.compile(r",{2,}"), ","),
    # Trailing comma before space then word → keep as-is (valid breath pause)
    # Percent → words
    (re.compile(r"(\d+)\s*%"), lambda m: f"{m.group(1)} percent"),
    # Currency: $50k / $1,000 / $50
    (re.compile(r"\$(\d[\d,]*)[kK]\b"), lambda m: f"{m.group(1).replace(',','')} thousand dollars"),
    (re.compile(r"\$(\d[\d,]*)\b"), lambda m: f"{m.group(1).replace(',','')} dollars"),
    # Plain large numbers with commas (50,000 → 50000 so TTS reads it as a number not "fifty comma zero zero zero")
    (re.compile(r"\b(\d{1,3}(?:,\d{3})+)\b"), lambda m: m.group(1).replace(",", "")),
    # Ordinals: 1st 2nd 3rd 4th
    (re.compile(r"\b1st\b"), "first"),
    (re.compile(r"\b2nd\b"), "second"),
    (re.compile(r"\b3rd\b"), "third"),
    (re.compile(r"\b(\d+)th\b"), lambda m: f"{m.group(1)}th"),
    # Strip markdown bold/italic that leaked through
    (re.compile(r"\*{1,2}([^*]+)\*{1,2}"), r"\1"),
)


def _normalize_for_elevenlabs(text: str) -> str:
    for pattern, replacement in _EL_NORMALIZE:
        if callable(replacement):
            text = pattern.sub(replacement, text)
        else:
            text = pattern.sub(replacement, text)
    return text


_TTS_SENT_END_RE = re.compile(r'(?<=[.?!…])\s+|(?<=—)\s+')


async def _elevenlabs_normalize_transform(text_stream):
    """Pre-normalize text for ElevenLabs flash_v2_5 before synthesis."""
    buf = ""
    async for chunk in text_stream:
        buf += chunk
        while True:
            m = _TTS_SENT_END_RE.search(buf)
            if m:
                sentence = buf[:m.end()].strip()
                buf = buf[m.end():]
                yield _normalize_for_elevenlabs(sentence)
            else:
                break
    if buf.strip():
        yield _normalize_for_elevenlabs(buf.strip())

# -- LLM TTS rewrite prompt ----------------------------------------------------
# Used by make_sarvam_llm_rewrite_transform(). Kept here so it's easy to tune.
_TTS_REWRITE_SYSTEM_PROMPT = """\
You rewrite text so it sounds natural when spoken aloud by a text-to-speech engine.
Rules:
- Expand ALL-CAPS acronyms by spacing their letters: RAG → R A G, LLMs → L L Ms, CICD → C I C D
- Split concatenated tech terms into spoken words: pgvector → p g vector, LangChain → Lang Chain
- Leave normal English words, numbers, and punctuation exactly as-is
- Do NOT change meaning, add words, or explain anything
- Return ONLY the rewritten sentence, nothing else\
"""


# ===============================================================================
# TEXT SANITIZATION API (delegated to TextSanitizer)
# ===============================================================================

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


def _apply_tts_phonetic_fixes(text: str, provider: str = "") -> str:
    return TextSanitizer.apply_tts_phonetic_fixes(text, provider=provider)


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


# ===============================================================================
# TTS TRANSFORMS (async generators for streaming)
# ===============================================================================

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


async def _sarvam_normalize_transform(text_stream):
    """Regex-based fallback: letter-space ALL-CAPS acronyms and split CamelCase.

    Runs before the LLM rewrite transform. Handles the deterministic cases
    (pure ALL-CAPS words) so the LLM only needs to deal with ambiguous ones.
    Also runs as the sole transform when no OpenAI client is available.
    """
    from interview.agent_runtime_utils import TextSanitizer
    async for chunk in text_stream:
        yield TextSanitizer.normalize_for_sarvam(chunk)


def make_sarvam_llm_rewrite_transform(openai_client, model: str):
    """Return an async generator transform that rewrites TTS text via LLM.

    The transform buffers incoming chunks until a sentence boundary (. ! ?)
    then sends the complete sentence to gpt-4.1-nano for pronunciation rewriting.
    This is necessary because the LLM streams word-by-word; rewriting fragments
    produces garbled output.

    Rewriting is sentence-level so latency impact is minimal — the first sentence
    goes to Sarvam as soon as the LLM finishes it, not after the whole response.

    Falls back to yielding original text on any API error — the interview never
    breaks because of a rewrite failure.

    Args:
        openai_client: Shared AsyncOpenAI instance (reuses existing connection pool)
        model: LLM model to use (default gpt-4.1-nano — fast and cheap)
    """
    import re as _re

    # Sentence-ending punctuation -- captures the punctuation + any trailing space
    # so the space is included in the flushed chunk, not dropped between sentences.
    _SENT_END = _re.compile(r'[.!?][ \t]*')

    async def _rewrite_sentence(sentence: str) -> str:
        """Call LLM to rewrite one sentence for TTS. Returns original on error."""
        sentence = sentence.strip()
        if not sentence:
            return sentence

        # Skip rewrite if the sentence has no ALL-CAPS words or camelCase -- no-op
        if not _re.search(r'[A-Z]{2,}|[a-z][A-Z]', sentence):
            return sentence

        try:
            resp = await openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _TTS_REWRITE_SYSTEM_PROMPT},
                    {"role": "user", "content": sentence},
                ],
                temperature=0.0,
                max_tokens=len(sentence) * 3,  # rewrite can't be much longer
                timeout=3.0,  # hard cap — never block TTS for more than 3s
            )
            rewritten = resp.choices[0].message.content or sentence
            # Safety: if LLM returned something wildly longer, fall back
            if len(rewritten) > len(sentence) * 4:
                logger.warning("[TTS_REWRITE] LLM response too long, using original")
                return sentence
            logger.debug("[TTS_REWRITE] %r → %r", sentence[:60], rewritten[:60])
            return rewritten.strip()
        except Exception as exc:
            logger.warning("[TTS_REWRITE] LLM rewrite failed (%s), using original", exc)
            return sentence

    async def _transform(text_stream):
        buffer = ""
        async for chunk in text_stream:
            buffer += chunk
            # Flush complete sentences as they arrive
            while True:
                m = _SENT_END.search(buffer)
                if not m:
                    break
                # Split: content up to and including punctuation, trailing whitespace separate
                sentence_with_punct = buffer[: m.end()].rstrip()
                trailing_space = " " if buffer[m.end() - 1 :].startswith((" ", "\t")) or m.group(0)[-1] in (" ", "\t") else " "
                buffer = buffer[m.end():]
                rewritten = await _rewrite_sentence(sentence_with_punct)
                yield rewritten + trailing_space

        # Flush any remaining text (last sentence with no trailing punctuation)
        if buffer.strip():
            rewritten = await _rewrite_sentence(buffer)
            yield rewritten

    return _transform


def make_tts_sanitize_transform(provider: str = ""):
    """Return a tts_sanitize transform bound to the given TTS provider.

    ElevenLabs preserves em-dashes and ellipses for natural pacing.
    Sarvam/Cartesia collapse them to commas.
    """
    async def _transform(text_stream):
        emitted_any = False
        async for chunk in text_stream:
            cleaned = polish_candidate_facing_text(chunk)
            cleaned = _enforce_single_question(cleaned)
            cleaned = _apply_tts_phonetic_fixes(cleaned, provider=provider)
            if cleaned:
                if not emitted_any:
                    logger.debug("[TTS_FIRST_CHUNK] First chunk to TTS: %r", cleaned[:120])
                emitted_any = True
                yield cleaned
        if not emitted_any:
            logger.debug(
                "[TTS_SANITIZE] Transform yielded empty — LLM turn was directive-only, "
                "suppressing TTS output (expected during STT fragment assembly)."
            )
    return _transform


async def _tts_sanitize_transform(text_stream):
    """Default sanitize transform (Sarvam/Cartesia). Use make_tts_sanitize_transform() for provider-aware version."""
    async for chunk in make_tts_sanitize_transform()(text_stream):
        yield chunk


# ===============================================================================
# TRANSCRIPT CONTEXT BUILDING
# ===============================================================================

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


# ===============================================================================
# SYSTEM MESSAGE REMOVAL (chat_ctx manipulation)
# ===============================================================================

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


# ===============================================================================
# TRANSCRIPT APPENDING (delegated to TranscriptManager for O(n) efficiency)
# ===============================================================================

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
