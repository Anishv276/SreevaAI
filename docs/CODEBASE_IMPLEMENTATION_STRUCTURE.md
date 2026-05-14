# Codebase Implementation Structure

## Goals
- Keep logic simple and deterministic.
- Separate parsing, business rules, and runtime orchestration.
- Prefer clear OOP modules for stateful pipelines.
- Keep DSA choices explicit: lists for ordered context, sets for fast dedupe/matching, dicts for structured payloads.

## Current High-Level Architecture

### 1) Runtime Orchestration
- `agent_runtime.py` drives the interview session lifecycle.
- It loads resume/JD/screening data, creates candidate band context, builds prompt layers, and runs interview stages.

### 2) Context and Business Rules
- `agent_profile_context.py` now focuses on:
- Candidate band inference (`infer_candidate_band`)
- Band-specific resume brief construction (`build_resume_brief`)
- JD summary and JD-resume alignment logic
- Interview brief assembly (`build_merged_interview_brief`)

### 3) Dedicated Resume Parsing Module
- `resume_context_parser.py` now owns:
- `ResumeContext` data model
- Resume parsing pipeline (`parse_resume_context`)
- Safe normalization wrapper (`ensure_resume_context`)
- Transcript-to-turn builder (`build_interview_turns`)

This removes deep parsing complexity from `agent_profile_context.py` and keeps parsing responsibilities in one place.

## End-to-End Flow Example

1. Runtime receives `resumeData`, `resumeText`, `jdDetails`, and interview metadata.
2. `agent_runtime.py` calls `parse_resume_context(resumeData, resumeText)`.
3. `resume_context_parser.py` normalizes and extracts:
- years and years label
- current role/company label
- skills/projects/work history
- education/hobbies
- ownership risk hints
- fresher/experienced signals
4. `agent_runtime.py` calls `infer_candidate_band(resume_context, "")`.
5. `agent_profile_context.py` builds a band-specific brief via `build_resume_brief`.
6. JD must-haves are extracted and aligned with resume skills.
7. `build_merged_interview_brief` creates the compact context block used by prompt layers.
8. During/after interview, transcript lines are normalized into Q/A turns by `build_interview_turns`.
9. Persistence and scoring modules consume normalized turns and context, not raw text blobs.

## What Changed (This Refactor)

1. **Module extraction**
- Moved resume parsing and transcript turn construction from `agent_profile_context.py` into `resume_context_parser.py`.

2. **Clear ownership boundaries**
- `agent_profile_context.py` now holds business rules and summary composition.
- `resume_context_parser.py` owns data normalization and parsing details.

3. **Stable external API**
- Existing imports continue to work because `agent_profile_context.py` now imports and reuses `parse_resume_context`, `ResumeContext`, and `build_interview_turns`.

## Before vs After

### Architecture
- **Before:** parsing + orchestration + summarization mixed in one large file.
- **After:** parsing moved to a dedicated module; business rules remain in a separate module.

### Readability
- **Before:** one long block handled many concerns in-place.
- **After:** single-responsibility functions/classes with tighter naming and boundaries.

### Maintainability
- **Before:** high coupling; risky edits in one area could affect unrelated behavior.
- **After:** isolated parser module allows safer changes and targeted testing.

### Logic Handling
- **Before:** implicit flow spread across a large mixed-context file.
- **After:** explicit pipeline sequence: parse -> infer band -> summarize -> build interview context.

## Why This Is Better for Humans and AI
- Humans can quickly identify where to modify behavior:
- parsing bugs -> `resume_context_parser.py`
- band logic or interview brief strategy -> `agent_profile_context.py`
- AI agents can reason in smaller contexts and avoid accidental cross-concern edits.
- Deterministic structure improves reliability for automated code tools and code review agents.

