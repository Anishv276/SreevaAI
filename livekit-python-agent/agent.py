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

# LiveKit's own dev-mode default is 0 idle processes (no pre-warmed spare) -- a
# spare means a second full STT/TTS/VAD model load competing for memory/CPU with
# the live job, which is what pushed init past the timeout on this machine. Only
# force a warm spare when LIVEKIT_IDLE_PROCESSES is set (e.g. in prod, where
# zero-latency job pickup matters); otherwise let the SDK's own dev/prod default apply.
_idle_processes_env = os.getenv("LIVEKIT_IDLE_PROCESSES")
_worker_kwargs: dict = {}
if _idle_processes_env:
    _worker_kwargs["num_idle_processes"] = int(_idle_processes_env)

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=_entrypoint_guarded,
            prewarm_fnc=prewarm,
            agent_name=AGENT_NAME,
            **_worker_kwargs,
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
            # Default init timeout (10s) is too tight for STT/TTS/VAD prewarm on a
            # loaded dev machine -- observed successful inits take ~8-9s alone, and
            # spare-process spawns compete with the live job's memory/CPU, pushing
            # some over the edge (harmless: proc_pool retries automatically, but the
            # WARNING/ERROR log noise makes real failures harder to spot).
            initialize_process_timeout=int(os.getenv("LIVEKIT_INIT_TIMEOUT", "30")),
        )
    )