"""
interview/probe_strategy.py  [SHIM]
=====================================
Backward-compatibility shim. All logic has moved to interview.tech.probe.
Import from interview.tech.probe directly for new code.
"""
from interview.tech.probe import *  # noqa: F401, F403
from interview.tech.probe import (
    SIGNAL_PROBES,
    get_probe_context,
    get_reaction_hint,
)
__all__ = [
    "SIGNAL_PROBES",
    "get_probe_context",
    "get_reaction_hint",
]