"""
interview/eval_pipeline.py  [SHIM]
====================================
Backward-compatibility shim. All logic has moved to interview.tech.eval.
Import from interview.tech.eval directly for new code.
"""
from interview.tech.eval import *  # noqa: F401, F403
from interview.tech.eval import TopicState, run_eval_and_build_directive
__all__ = ["TopicState", "run_eval_and_build_directive"]