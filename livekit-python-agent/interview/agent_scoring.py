"""
interview/agent_scoring.py  [SHIM]
===================================
Backward-compatibility shim. All logic has moved to interview.tech.scoring.
Import from interview.tech.scoring directly for new code.
"""
# Re-export everything so existing callers keep working without change.
from interview.tech.scoring import *  # noqa: F401, F403
from interview.tech.scoring import (
    evaluate_answer,
    RESPONSE_SIGNALS,
    SIGNAL_DEFINITIONS,
)
__all__ = [
    "evaluate_answer",
    "RESPONSE_SIGNALS",
    "SIGNAL_DEFINITIONS",
]