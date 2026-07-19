"""Entrypoint for the AI interview agent worker."""
import asyncio
import os
import sys
from pathlib import Path

# Add interview package to path for LiveKit deployment
sys.path.insert(0, str(Path(__file__).parent))

from interview.agent_runtime import _entrypoint_guarded, prewarm
from interview.agent_runtime_support import AGENT_NAME
from interview.slack_error_logger import log_worker_error
from livekit.agents import JobExecutorType, WorkerOptions, cli

# Global safety net: catches anything outside a session's own
# _entrypoint_guarded (which already handles per-interview crashes) --
# prewarm failures, worker-process startup errors, unhandled task exceptions.
def _report_uncaught(exc_type, exc_value, exc_tb) -> None:
    sys.__excepthook__(exc_type, exc_value, exc_tb)
    try:
        asyncio.run(log_worker_error(error=str(exc_value), reason=f"Uncaught {exc_type.__name__} in agent process"))
    except Exception:
        pass


sys.excepthook = _report_uncaught

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=_entrypoint_guarded,
            prewarm_fnc=prewarm,
            agent_name=AGENT_NAME,
            num_idle_processes=max(1, int(os.getenv("LIVEKIT_IDLE_PROCESSES", "1"))),
            # LiveKit defaults to JobExecutorType.THREAD on Windows (dodges a
            # BrokenPipeError some Python/Windows combos hit spawning processes),
            # but prewarm() runs on that thread, not the process's real main thread --
            # onnxruntime/Silero's plugin registration requires the actual main thread,
            # so VAD prewarm silently fails there ("must be registered on the main
            # thread"). PROCESS mode gives prewarm its own process (whose main thread
            # is fine), matching the Linux default and how prod actually runs. If this
            # reintroduces the BrokenPipeError on a given Windows/Python combo, the
            # existing lazy VAD retry in agent_runtime.py's entrypoint still covers it.
            job_executor_type=JobExecutorType.PROCESS,
        )
    )