# Interview Folder - Deep Analysis & Recommended Naming

**Analysis Date**: 2026-06-22  
**Total Files**: 17 Python files  
**Total Size**: ~570 KB

---

## ACTUAL Files & Their Purpose

### **CORE RUNTIME (Interview Execution Engine)**

#### 1. `agent_runtime.py` (215 KB - MAIN)
**Current Purpose**: Main interview session orchestrator
- Entry point: `entrypoint(ctx: JobContext)` — called by LiveKit
- Per-turn eval loop: `_process_user_conversation_item()`
- Topic management: `CoveredTopics` class
- Interview loop with LLM/TTS/STT integration
- **Core business logic of the entire system**

**Recommended Name**: `interview_executor.py` or `interview_session_manager.py`
- ✓ Clearer that this is THE main interview runner
- ✓ "executor" = runs the interview from start to end
- ✓ "session_manager" = manages state through interview

---

#### 2. `agent_runtime_support.py` (12 KB)
**Current Purpose**: Configuration, logging, and state management
- `JsonFormatter` — structured JSON logging
- `AgentConfig` — singleton config from env vars
- `MutableStateManager` — manages DB pool, billing
- Logging context filters and warning samplers
- Constants re-export: `STT_MODEL`, `VOICE_REGISTRY`, etc.

**Recommended Name**: `runtime_config.py`
- ✓ Describes exactly what it does: runtime configuration
- ✓ Single place for all config/logging/state setup

---

#### 3. `agent_runtime_helpers.py` (12 KB)
**Current Purpose**: Text processing and manipulation
- `sanitize_candidate_facing_text()` — remove directives
- `polish_candidate_facing_text()` — full cleanup
- `append_transcript_line()` — transcript assembly
- `_single_question_transform()` — TTS text transforms
- `_build_recent_context_block()` — prior exchanges for LLM

**Recommended Name**: `text_processor.py`
- ✓ All functions process/clean text
- ✓ Clear domain: "text processing"

---

#### 4. `agent_runtime_utils.py` (20 KB - NEW)
**Current Purpose**: Runtime utility classes
- `AgentConfig` — singleton config management
- `MutableStateManager` — centralized state
- `TextSanitizer` — unified text patterns
- `TranscriptManager` — O(n) transcript handling

**Recommended Name**: Keep as `runtime_utilities.py` or `agent_utilities.py`
- ✓ Differentiates from generic `agent_utils.py`
- ✓ Stays with runtime modules

---

### **INFRASTRUCTURE & PROVIDERS**

#### 5. `agent_providers.py` (12 KB)
**Current Purpose**: TTS, STT, and LLM provider factories
- `build_cartesia_tts()` — Cartesia voice init
- `build_sarvam_tts()` — Sarvam (Indian voices)
- `build_elevenlabs_tts()` — ElevenLabs TTS
- `build_stt()` — Deepgram Flux (speech recognition)
- `build_llm()` — OpenAI GPT initialization
- Language mapping: `_map_language()`

**Recommended Name**: `provider_factory.py` or `voice_and_llm_providers.py`
- ✓ "factory" = builds/initializes providers
- ✓ Clear: TTS/STT/LLM initialization

---

#### 6. `agent_persistence.py` (18 KB)
**Current Purpose**: Database operations and persistence
- `DatabasePool` — asyncpg connection pool (singleton)
- `InterviewRepository` — thin DB wrappers
- Transcript persistence: `persist_transcript()`
- Score persistence: `persist_answer_scores()`
- Interview reports: `generate_interview_report()`
- Billing: `persist_interview_billing_snapshot()`

**Recommended Name**: `database_layer.py` or `data_persistence.py`
- ✓ Single responsibility: database operations
- ✓ Clear: where data gets persisted

---

### **EVALUATION & SCORING**

#### 7. `agent_scoring.py` (19 KB)
**Current Purpose**: Answer evaluation and signal detection
- `evaluate_answer()` — scores answer on clarity/depth/specificity/grounding
- `notify_sync_engine()` — sends scores to sync engine
- Signal detection: `_extract_signal_from_answer()`
- Ownership detection: `_analyze_ownership_language()`
- Depth tracking: `_track_depth_trend()`
- **One LLM call per turn: scores + detects 1 signal**

**Recommended Name**: `answer_evaluator.py` or `answer_scoring.py`
- ✓ "evaluator" = evaluates answers
- ✓ Clear domain: answer quality assessment

---

#### 8. `eval_pipeline.py` (19 KB)
**Current Purpose**: Evaluation orchestration and topic saturation
- `TopicState` — per-topic saturation tracking
- `run_eval_and_build_directive()` — orchestrate eval + generate next action
- Band-aware saturation thresholds
- PROBE vs MOVE_ON decision logic
- `_score_to_contribution()` — weighted scoring

**Recommended Name**: `evaluation_orchestrator.py` or `topic_saturation_engine.py`
- ✓ Orchestrates the full evaluation workflow
- ✓ Handles topic saturation logic

---

### **INTERVIEW CONTENT & STRATEGY**

#### 9. `interview_phases.py` (18 KB)
**Current Purpose**: Phase-specific prompts and directives
- `build_greeting_text()` — initial greeting
- `build_warmup_directive()` — warmup phase rules
- `build_interview_directive()` — main 20-min interview plan
- Coverage goals, skills block, custom questions
- **Builds system prompts for each phase**

**Recommended Name**: `phase_prompt_builder.py` or `interview_prompts.py`
- ✓ Builds prompts for interview phases
- ✓ Clear: what gets built here

---

#### 10. `interview_brief.py` (15 KB)
**Current Purpose**: Resume & JD parsing into structured context
- `TopicItem` — one topic (project, skill, work)
- `RoleContext` — job title, skills required
- `InterviewBrief` — full context (resume + JD)
- `generate_interview_brief()` — orchestrate parsing
- Band inference: `infer_candidate_band()`
- **Creates the interview context from raw data**

**Recommended Name**: `candidate_context_builder.py` or `interview_context.py`
- ✓ Builds the context for the interview
- ✓ From resume + JD data

---

#### 11. `prompt_layers.py` (16 KB)
**Current Purpose**: System prompt assembly
- `build_voice_layer_prompt()` — who is the interviewer, tone
- `build_evaluation_layer_prompt()` — analyst brief, live coverage
- `build_system_prompt()` — combine all layers
- **Layers stack: voice + eval + phase + directives + context**

**Recommended Name**: `system_prompt_builder.py` or `prompt_assembly.py`
- ✓ Assembles/builds system prompts
- ✓ Clear: prompt construction

---

#### 12. `probe_strategy.py` (9.2 KB)
**Current Purpose**: Follow-up question strategy per signal
- One probe per signal (10+ probes total)
- `get_probe_context()` — builds context block for directive LLM
- Families: ownership, depth, clarification, specificity, etc.
- **When a signal fires → probe tells LLM what to do next**

**Recommended Name**: `follow_up_strategy.py` or `probe_questions.py`
- ✓ Defines follow-up/probe strategy
- ✓ Clear: when signals fire, what to ask next

---

#### 13. `brief_extraction.py` (20 KB)
**Current Purpose**: Deterministic resume/JD extraction (NO LLM)
- `RawSkillEntry`, `RawWorkEntry`, `RawProjectEntry` — parsed items
- `extract_skills()`, `extract_work_history()`, `extract_projects()`
- `extract_from_jd()` — JD parsing
- **Pure Python, zero LLM, deterministic**

**Recommended Name**: `data_extractor.py` or `resume_jd_extractor.py`
- ✓ Extracts resume/JD data
- ✓ Clear: deterministic parsing

---

### **REPORTING & POST-INTERVIEW**

#### 14. `report_pipeline.py` (59 KB - LARGEST)
**Current Purpose**: Post-interview report generation
- `IntegrityEngine` — proctoring signal scoring
- `LLMEvalResponse`, `LLMSkillsResponse` — domain models
- `ReportLLMClient` — singleton LLM client for report gen
- `generate_interview_report()` — final scorecard (3-node LangGraph)
- `generate_interview_summary()` — brief summary text
- **LangGraph workflow: signals → LLM calls → assemble**

**Recommended Name**: `interview_report_generator.py`
- ✓ Generates the final interview report
- ✓ Clear: end-to-end report building

---

### **TEXT PROCESSING & UTILITIES**

#### 15. `tts_phonetic_processor.py` (12 KB)
**Current Purpose**: TTS pronunciation fixing
- `PhoneticRule` — rules for word pronunciation
- `TTSPhoneticProcessor` — applies rules to text
- Fixes acronyms (spell out vs don't), dashes, contractions
- **Before TTS: fixes text so voice sounds natural**

**Recommended Name**: `speech_processor.py` or `tts_text_fixer.py`
- ✓ Fixes text for speech synthesis
- ✓ Clear: TTS-specific text processing

---

#### 16. `agent_utils.py` (3.2 KB)
**Current Purpose**: General-purpose utilities
- `_coerce_jsonish()` — safe JSON parsing
- `truncate_to_tokens()` — token-aware text truncation
- `first_name_from_full_name()` — parse Indian names
- `_cartesia_plugin_model()` — Cartesia model parsing
- **Generic helpers used by multiple modules**

**Recommended Name**: Keep as `agent_utils.py`
- ✓ Generic name for generic utilities
- ✓ Already well-known in codebase

---

#### 17. `__init__.py` (94 bytes)
**Purpose**: Package initialization

---

## Files NOT in Codebase (My Mistake!)

These do NOT exist and I apologize for showing them:
- ❌ `turn_evaluator.py` — behavioral signal detector
- ❌ `trust_engine.py` — proctoring trust scorer
- ❌ `session_state.py` — interview session state
- ❌ `recruiter_summary.py` — recommendation builder
- ❌ `behavioral_analysis.py` — signal narrative generator

(These might be in other modules or not yet created)

---

## PROPOSED RENAMING (ACCURATE)

| CURRENT | PROPOSED | REASON |
|---------|----------|--------|
| `agent_runtime.py` | `interview_executor.py` | Runs interview sessions |
| `agent_runtime_support.py` | `runtime_config.py` | Config, logging, state setup |
| `agent_runtime_helpers.py` | `text_processor.py` | Text cleaning & transcript handling |
| `agent_runtime_utils.py` | `runtime_utilities.py` | Runtime utility classes |
| `agent_providers.py` | `provider_factory.py` | TTS/STT/LLM initialization |
| `agent_persistence.py` | `database_layer.py` | Database operations |
| `agent_scoring.py` | `answer_evaluator.py` | Score answers, detect signals |
| `eval_pipeline.py` | `evaluation_orchestrator.py` | Orchestrate eval + topic saturation |
| `interview_phases.py` | `phase_prompt_builder.py` | Build phase-specific prompts |
| `interview_brief.py` | `candidate_context_builder.py` | Parse resume + JD into context |
| `prompt_layers.py` | `system_prompt_builder.py` | Assemble system prompts |
| `probe_strategy.py` | `follow_up_strategy.py` | Define probe questions per signal |
| `brief_extraction.py` | `data_extractor.py` | Deterministic resume/JD parsing |
| `report_pipeline.py` | `interview_report_generator.py` | Generate final scorecard |
| `tts_phonetic_processor.py` | `speech_processor.py` | Fix pronunciation for TTS |
| `agent_utils.py` | `agent_utils.py` | Keep (generic utilities) |

---

## Folder Structure After Rename (Grouped by Purpose)

```
interview/
├── __init__.py

# EXECUTION ENGINE
├── interview_executor.py              (main orchestrator)
├── runtime_config.py                 (config, logging, state)
├── text_processor.py                 (text cleaning)
├── runtime_utilities.py              (utility classes)
├── provider_factory.py               (TTS/STT/LLM)
├── database_layer.py                 (DB operations)

# EVALUATION
├── answer_evaluator.py               (score answers)
├── evaluation_orchestrator.py         (eval + saturation)
├── follow_up_strategy.py              (probe questions)

# INTERVIEW CONTENT
├── candidate_context_builder.py      (resume + JD parsing)
├── phase_prompt_builder.py            (phase directives)
├── system_prompt_builder.py           (assemble prompts)
├── data_extractor.py                  (extract resume/JD)

# REPORTING
├── interview_report_generator.py      (final scorecard)

# SPEECH & UTILITIES
├── speech_processor.py                (TTS fixes)
├── agent_utils.py                     (generic helpers)
```

---

## Benefits of This Rename

✅ **Self-documenting** — Name = use case  
✅ **Grouped logically** — Similar files together (by comment)  
✅ **Beginner-friendly** — Clear what each file does  
✅ **Verb-based** — `*_builder`, `*_generator`, `*_executor`, `*_processor`  
✅ **No "agent_" prefix clutter** — Only where needed (agent_utils)  
✅ **Accurate** — Based on actual code analysis  

---

## Next Steps

Would you like me to:
1. ✅ Proceed with renaming (file-by-file with import updates)
2. ⚠️ Do more analysis on any specific file
3. ❌ Keep current names (they work fine too)

