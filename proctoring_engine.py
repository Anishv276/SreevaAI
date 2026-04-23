import re
import time
from typing import Any

# --- Proctoring Risk Weights ---
PROCTORING_WEIGHTS: dict[str, int] = {
    "tab_switch": 5,           # candidate switched to another tab
    "face_absent": 3,          # weak unless repeated/prolonged
    "gaze_violation": 0,       # supporting context only; excluded from core trust math
    "multiple_faces": 30,      # multiple people detected (suspicious)
    "clipboard_paste": 15,     # detected clipboard paste event
    "background_voice": 25,    # second speaker diarized by Deepgram Nova-3
    "audio_leak": 8,           # helper phrase detected in transcript; strongest when corroborated
}

_COMPOSITE_RISK_WEIGHTS = {
    "integrity": 0.60,
    "depth": 0.40,
}

_MODE_SWITCH_WEIGHTS = {
    "integrity": 0.70,
    "depth": 0.30,
}

# --- Audio Proctoring Helper Patterns ---
_HELPER_PHRASE_PATTERNS: list[re.Pattern] = [
    re.compile(r"\bthe answer is\b", re.IGNORECASE),
    re.compile(r"\btell (her|him|them)\b", re.IGNORECASE),
    re.compile(r"\bjust say\b", re.IGNORECASE),
    re.compile(r"\bsay that\b", re.IGNORECASE),
    re.compile(r"\brepeat after me\b", re.IGNORECASE),
    re.compile(r"\byou should say\b", re.IGNORECASE),
]

def compose_risk_score(
    integrity_risk: int,
    depth_risk: int,
) -> int:
    weighted = (
        integrity_risk * _COMPOSITE_RISK_WEIGHTS["integrity"]
        + depth_risk * _COMPOSITE_RISK_WEIGHTS["depth"]
    )
    return max(0, min(100, int(round(weighted))))

def compose_mode_risk_score(
    integrity_risk: int,
    depth_risk: int,
) -> int:
    weighted = (
        integrity_risk * _MODE_SWITCH_WEIGHTS["integrity"]
        + depth_risk * _MODE_SWITCH_WEIGHTS["depth"]
    )
    if integrity_risk >= 15:
        weighted += 8
    elif integrity_risk >= 8:
        weighted += 4
    return max(0, min(100, int(round(weighted))))

def detect_audio_leak(content: str) -> list[dict[str, Any]]:
    """Scans transcript for helper phrases."""
    events = []
    for pattern in _HELPER_PHRASE_PATTERNS:
        if pattern.search(content):
            events.append({
                "event": "audio_leak",
                "pattern": pattern.pattern,
                "weight": PROCTORING_WEIGHTS["audio_leak"]
            })
    return events
