import re
import time
import logging

logger = logging.getLogger("interview-agent")

def clean_stt_text(raw_text: str) -> str:
    """Clean and normalize STT text, removing fillers and noise."""
    text = re.sub(r"\s+", " ", (raw_text or "").strip())
    if not text:
        return ""

    if text.lower().strip(" .!?") == "candidate response unavailable":
        return ""

    tokens = [t for t in text.split(" ") if t]
    cleaned_tokens: list[str] = []
    for token in tokens:
        alpha = re.sub(r"[^a-zA-Z]", "", token).lower()
        # Drop very short consonant-only fragments (fillers/noise)
        if alpha and len(alpha) <= 2 and not re.search(r"[aeiou]", alpha):
            continue
        if cleaned_tokens and cleaned_tokens[-1].lower() == token.lower():
            # Collapse immediate duplicates
            continue
        cleaned_tokens.append(token)

    return re.sub(r"\s+", " ", " ".join(cleaned_tokens)).strip()

def is_stt_hallucination(content: str) -> bool:
    """Detect if STT is hallucinating repetitive words."""
    words = content.strip().split()
    if len(words) >= 10:
        unique_words = set(w.lower().strip(".,!?") for w in words)
        if len(unique_words) <= 3:
            return True
    if len(words) >= 4:
        unique_words = set(w.lower().strip(".,!?") for w in words)
        if len(unique_words) <= max(1, int(len(words) * 0.35)):
            return True
    return False

def is_greeting_echo(content: str, last_ai_turn_time: float | None, suppression_secs: float = 6.0) -> bool:
    """Detect if early user input is just an echo of the AI's greeting."""
    if last_ai_turn_time is None:
        return False
        
    since_ai_turn = time.monotonic() - last_ai_turn_time
    if since_ai_turn <= suppression_secs:
        echo_like = re.compile(
            r"^\s*(?:hi|hello|hey|okay|ok|yeah|yes|yep|mmhmm|mhm|good morning|good afternoon)\s*$",
            re.IGNORECASE,
        )
        if echo_like.match(content) or len(content.split()) <= 2:
            return True
    return False
