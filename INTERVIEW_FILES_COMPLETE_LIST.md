# Interview Module - Complete File List & Renaming

**Date**: 2026-06-22  
**Analysis**: Deep code review of all files  
**Status**: Accurate mapping of 17 actual files

---

## 📊 COMPLETE FILE LIST (17 FILES)

### ✅ VERIFIED EXISTING FILES

#### 1. interview_executor.py
**Current**: `agent_runtime.py` (215 KB)  
**What it does**: Main interview session orchestrator
- Entry point: `entrypoint(ctx: JobContext)`  
- Per-turn eval loop: `_process_user_conversation_item()`
- Topic management: `CoveredTopics` class
- Integration with LLM/TTS/STT
- Core business logic of entire system

---

#### 2. runtime_config.py
**Current**: `agent_runtime_support.py` (12 KB)  
**What it does**: Configuration, logging, state management
- `JsonFormatter` — structured JSON logging
- `AgentConfig` — singleton config from env vars
- `MutableStateManager` — DB pool, billing state
- Logging context filters and warning samplers
- Constants re-export

---

#### 3. text_processor.py
**Current**: `agent_runtime_helpers.py` (12 KB)  
**What it does**: Text cleaning and transcript handling
- `sanitize_candidate_facing_text()` — remove directives
- `polish_candidate_facing_text()` — full cleanup
- `append_transcript_line()` — transcript assembly
- `_single_question_transform()` — TTS text transforms
- `_build_recent_context_block()` — prior exchanges

---

#### 4. runtime_utilities.py
**Current**: `agent_runtime_utils.py` (20 KB) **[NEW - created in recent optimization]**  
**What it does**: Runtime utility classes
- `AgentConfig` — singleton config management
- `MutableStateManager` — centralized state
- `TextSanitizer` — unified text patterns
- `TranscriptManager` — O(n) transcript handling

---

#### 5. provider_factory.py
**Current**: `agent_providers.py` (12 KB)  
**What it does**: TTS, STT, and LLM provider factories
- `build_cartesia_tts()` — Cartesia voice init
- `build_sarvam_tts()` — Sarvam (Indian voices)
- `build_elevenlabs_tts()` — ElevenLabs TTS
- `build_stt()` — Deepgram Flux (speech recognition)
- `build_llm()` — OpenAI GPT initialization
- Language mapping: `_map_language()`

---

#### 6. database_layer.py
**Current**: `agent_persistence.py` (18 KB)  
**What it does**: Database operations and persistence
- `DatabasePool` — asyncpg connection pool (singleton)
- `InterviewRepository` — thin DB wrappers
- Transcript persistence: `persist_transcript()`
- Score persistence: `persist_answer_scores()`
- Interview reports: `generate_interview_report()`
- Billing: `persist_interview_billing_snapshot()`

---

#### 7. answer_evaluator.py
**Current**: `agent_scoring.py` (19 KB)  
**What it does**: Answer evaluation and signal detection
- `evaluate_answer()` — scores answer on clarity/depth/specificity/grounding
- `notify_sync_engine()` — sends scores to sync engine
- Signal detection: `_extract_signal_from_answer()`
- Ownership detection: `_analyze_ownership_language()`
- Depth tracking: `_track_depth_trend()`
- **One LLM call per turn: scores + detects 1 signal**

---

#### 8. evaluation_orchestrator.py
**Current**: `eval_pipeline.py` (19 KB)  
**What it does**: Evaluation orchestration and topic saturation
- `TopicState` — per-topic saturation tracking
- `run_eval_and_build_directive()` — orchestrate eval + generate action
- Band-aware saturation thresholds
- PROBE vs MOVE_ON decision logic
- `_score_to_contribution()` — weighted scoring

---

#### 9. phase_prompt_builder.py
**Current**: `interview_phases.py` (18 KB)  
**What it does**: Phase-specific prompts and directives
- `build_greeting_text()` — initial greeting
- `build_warmup_directive()` — warmup phase rules
- `build_interview_directive()` — main 20-min interview plan
- Coverage goals, skills block, custom questions
- **Builds system prompts for each phase**

---

#### 10. candidate_context_builder.py
**Current**: `interview_brief.py` (15 KB)  
**What it does**: Resume & JD parsing into structured context
- `TopicItem` — one topic (project, skill, work)
- `RoleContext` — job title, skills required
- `InterviewBrief` — full context (resume + JD)
- `generate_interview_brief()` — orchestrate parsing
- Band inference: `infer_candidate_band()`
- **Creates interview context from raw data**

---

#### 11. system_prompt_builder.py
**Current**: `prompt_layers.py` (16 KB)  
**What it does**: System prompt assembly
- `build_voice_layer_prompt()` — who is interviewer, tone
- `build_evaluation_layer_prompt()` — analyst brief, live coverage
- `build_system_prompt()` — combine all layers
- **Layers stack: voice + eval + phase + directives + context**

---

#### 12. follow_up_strategy.py
**Current**: `probe_strategy.py` (9.2 KB)  
**What it does**: Follow-up question strategy per signal
- One probe per signal (10+ probes total)
- `get_probe_context()` — builds context block for directive LLM
- Families: ownership, depth, clarification, specificity, etc.
- **When signal fires → probe tells LLM what to ask next**

---

#### 13. data_extractor.py
**Current**: `brief_extraction.py` (20 KB)  
**What it does**: Deterministic resume/JD extraction (NO LLM)
- `RawSkillEntry`, `RawWorkEntry`, `RawProjectEntry` — parsed items
- `extract_skills()`, `extract_work_history()`, `extract_projects()`
- `extract_from_jd()` — JD parsing
- **Pure Python, zero LLM, deterministic**

---

#### 14. interview_report_generator.py
**Current**: `report_pipeline.py` (59 KB - LARGEST)  
**What it does**: Post-interview report generation
- `IntegrityEngine` — proctoring signal scoring
- `LLMEvalResponse`, `LLMSkillsResponse` — domain models
- `ReportLLMClient` — singleton LLM client for report gen
- `generate_interview_report()` — final scorecard (3-node LangGraph)
- `generate_interview_summary()` — brief summary text
- **LangGraph workflow: signals → LLM calls → assemble**

---

#### 15. speech_processor.py
**Current**: `tts_phonetic_processor.py` (12 KB)  
**What it does**: TTS pronunciation fixing
- `PhoneticRule` — rules for word pronunciation
- `TTSPhoneticProcessor` — applies rules to text
- Fixes acronyms (spell out vs don't), dashes, contractions
- **Before TTS: fixes text so voice sounds natural**

---

#### 16. agent_utils.py
**Current**: `agent_utils.py` (3.2 KB) **[KEEP NAME - generic utilities]**  
**What it does**: General-purpose utilities
- `_coerce_jsonish()` — safe JSON parsing
- `truncate_to_tokens()` — token-aware text truncation
- `first_name_from_full_name()` — parse Indian names
- `_cartesia_plugin_model()` — Cartesia model parsing
- **Generic helpers used by multiple modules**

---

#### 17. __init__.py
**Current**: `__init__.py` (94 bytes) **[NO CHANGE]**  
**What it does**: Package initialization

---

## ❌ NON-EXISTENT FILES (Cleanup Required)

### Files that DO NOT EXIST (only in pycache from old code)

1. ❌ **turn_evaluator.py** — Does not exist
   - Function `_is_signal_enabled()` — undefined
   - Only `__pycache__` artifact remains

2. ❌ **trust_engine.py** — Does not exist
   - Function `_is_toggle_enabled()` — undefined
   - Referenced only in test file

3. ❌ **session_state.py** — Does not exist
   - Constant `ALWAYS_ON_PROCTORING_SIGNALS` — undefined
   - Function `is_always_on_signal()` — undefined
   - Referenced only in test file

---

## 🗑️ FILES TO DELETE

### Test File: `tests/test_signal_toggles.py`

**Status**: **BROKEN** — Imports from non-existent modules

**Lines that fail**:
```python
from interview.session_state import (
    ALWAYS_ON_PROCTORING_SIGNALS,
    is_always_on_signal,
)
from interview.turn_evaluator import _is_signal_enabled
from interview.trust_engine import _is_toggle_enabled
```

**Action**: Delete this file — tests functionality that doesn't exist

---

## 📋 RENAMING SUMMARY TABLE

| # | CURRENT | NEW | Group |
|---|---------|-----|-------|
| 1 | agent_runtime.py | interview_executor.py | Execution |
| 2 | agent_runtime_support.py | runtime_config.py | Execution |
| 3 | agent_runtime_helpers.py | text_processor.py | Execution |
| 4 | agent_runtime_utils.py | runtime_utilities.py | Execution |
| 5 | agent_providers.py | provider_factory.py | Infrastructure |
| 6 | agent_persistence.py | database_layer.py | Infrastructure |
| 7 | agent_scoring.py | answer_evaluator.py | Evaluation |
| 8 | eval_pipeline.py | evaluation_orchestrator.py | Evaluation |
| 9 | interview_phases.py | phase_prompt_builder.py | Content |
| 10 | interview_brief.py | candidate_context_builder.py | Content |
| 11 | prompt_layers.py | system_prompt_builder.py | Content |
| 12 | probe_strategy.py | follow_up_strategy.py | Content |
| 13 | brief_extraction.py | data_extractor.py | Content |
| 14 | report_pipeline.py | interview_report_generator.py | Reporting |
| 15 | tts_phonetic_processor.py | speech_processor.py | Utilities |
| 16 | agent_utils.py | agent_utils.py | Utilities |
| 17 | __init__.py | __init__.py | Package |

---

## ✨ Benefits of This Naming

✅ **Self-documenting** — Name = purpose  
✅ **Grouped logically** — Related files physically near each other  
✅ **Beginner-friendly** — Clear what each file does  
✅ **Verb-based** — `*_builder`, `*_generator`, `*_executor`, `*_processor`, `*_orchestrator`  
✅ **No redundant prefix** — Only `agent_` for generic utilities  
✅ **Accurate** — Based on actual deep code analysis  

---

## 🚀 Ready for Implementation

All files identified and mapped. Ready to:

1. Rename files (16 files)
2. Update imports across codebase
3. Delete broken test file
4. Clean pycache

**Estimated time**: 3-4 hours for complete execution with verification

