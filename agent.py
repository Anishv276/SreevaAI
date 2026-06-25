"""Entrypoint for the AI interview agent worker."""
import os
from interview.agent_runtime import _entrypoint_guarded, prewarm
from interview.agent_runtime_support import AGENT_NAME
from livekit.agents import WorkerOptions, cli
if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=_entrypoint_guarded,
            prewarm_fnc=prewarm,
            agent_name=AGENT_NAME,
            num_idle_processes=max(1, int(os.getenv("LIVEKIT_IDLE_PROCESSES", "1"))),
        )
    )