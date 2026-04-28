# Agent Module Map

This page explains what each Python agent file does in simple words.

## Quick Map

- `agent.py` - app start file and compatibility wrapper
- `agent_runtime.py` - starts the agent runtime
- `agent_runtime_core.py` - main interview flow and event handling
- `agent_runtime_helpers.py` - small shared helper functions
- `agent_runtime_support.py` - config, logging, constants, and globals
- `agent_utils.py` - general parsing and text helpers
- `agent_profile_context.py` - candidate resume, JD, and prompt context
- `agent_providers.py` - AI model, speech, and voice setup
- `agent_persistence.py` - database, billing, and usage saving
- `agent_scoring.py` - answer scoring, contradiction checks, and sync hooks

## Plain English Summary

- `agent.py` should stay tiny so app startup is easy to follow.
- `agent_runtime.py` is the entry point for running the agent process.
- `agent_runtime_core.py` keeps the actual interview session flow.
- `agent_runtime_helpers.py` keeps small helper functions together.
- `agent_runtime_support.py` keeps environment setup and shared constants.
- `agent_utils.py` keeps reusable text and parsing helpers.
- `agent_profile_context.py` builds context from resume and job data.
- `agent_providers.py` creates the AI, STT, TTS, and VAD clients.
- `agent_persistence.py` saves usage, billing, transcripts, and summaries.
- `agent_scoring.py` handles scoring and trust-related checks.

## Why This Split Helps

- Each file has one clear job.
- The team can find logic faster.
- Safer changes are easier because related code stays together.
- Tests and debugging are easier because responsibilities are smaller.

## Related Docs

- [Documentation Index](./INDEX.md)
- [Phase 6: AI Interview Session Orchestration](./06_interview_session.md)
- [Phase 7: Interview Proctoring & Integrity Suite](./07_proctoring_execution.md)
- [Phase 8: AI Review & Comprehensive Reporting](./08_grading_reporting.md)
