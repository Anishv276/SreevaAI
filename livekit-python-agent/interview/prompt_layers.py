"""
interview/prompt_layers.py  [SHIM]
====================================
Backward-compatibility shim. All logic has moved to interview.tech.prompts.
Import from interview.tech.prompts directly for new code.
"""
from interview.tech.prompts import *  # noqa: F401, F403
from interview.tech.prompts import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)
__all__ = [
    "build_voice_layer_prompt",
    "build_evaluation_layer_prompt",
    "build_system_prompt",
]