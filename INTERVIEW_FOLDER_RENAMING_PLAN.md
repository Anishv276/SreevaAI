# Interview Folder - Final Renaming Plan

**Status**: Ready to execute  
**Date**: 2026-06-22

---

## 📋 Complete File Listing & Renaming

### ✅ ACTUAL FILES IN CODEBASE (17 total)

#### Group 1: CORE EXECUTION ENGINE

| # | CURRENT NAME | NEW NAME | Purpose | Lines |
|---|---|---|---|---|
| 1 | `agent_runtime.py` | `interview_executor.py` | Main interview session orchestrator | 215K |
| 2 | `agent_runtime_support.py` | `runtime_config.py` | Config, logging, state management | 12K |
| 3 | `agent_runtime_helpers.py` | `text_processor.py` | Text cleaning, transcript handling | 12K |
| 4 | `agent_runtime_utils.py` | `runtime_utilities.py` | Config classes, state managers | 20K |

#### Group 2: INFRASTRUCTURE

| # | CURRENT NAME | NEW NAME | Purpose | Lines |
|---|---|---|---|---|
| 5 | `agent_providers.py` | `provider_factory.py` | TTS/STT/LLM initialization | 12K |
| 6 | `agent_persistence.py` | `database_layer.py` | Database operations, persistence | 18K |

#### Group 3: EVALUATION & SCORING

| # | CURRENT NAME | NEW NAME | Purpose | Lines |
|---|---|---|---|---|
| 7 | `agent_scoring.py` | `answer_evaluator.py` | Score answers, detect signals | 19K |
| 8 | `eval_pipeline.py` | `evaluation_orchestrator.py` | Eval orchestration, topic saturation | 19K |

#### Group 4: INTERVIEW CONTENT & STRATEGY

| # | CURRENT NAME | NEW NAME | Purpose | Lines |
|---|---|---|---|---|
| 9 | `interview_phases.py` | `phase_prompt_builder.py` | Build phase-specific prompts | 18K |
| 10 | `interview_brief.py` | `candidate_context_builder.py` | Parse resume + JD into context | 15K |
| 11 | `prompt_layers.py` | `system_prompt_builder.py` | Assemble system prompts | 16K |
| 12 | `probe_strategy.py` | `follow_up_strategy.py` | Define probe questions per signal | 9.2K |
| 13 | `brief_extraction.py` | `data_extractor.py` | Deterministic resume/JD parsing | 20K |

#### Group 5: REPORTING

| # | CURRENT NAME | NEW NAME | Purpose | Lines |
|---|---|---|---|---|
| 14 | `report_pipeline.py` | `interview_report_generator.py` | Generate final scorecard | 59K |

#### Group 6: UTILITIES

| # | CURRENT NAME | NEW NAME | Purpose | Lines |
|---|---|---|---|---|
| 15 | `tts_phonetic_processor.py` | `speech_processor.py` | Fix pronunciation for TTS | 12K |
| 16 | `agent_utils.py` | `agent_utils.py` | Keep as-is (generic helpers) | 3.2K |
| 17 | `__init__.py` | `__init__.py` | Package init (no change) | 94B |

---

## ❌ FILES TO DELETE (Non-existent, only in pycache)

These modules **do NOT exist as source files** and are imported by test file that needs cleanup:

1. ❌ `turn_evaluator.py` — **Does not exist** (only `__pycache__` artifact)
2. ❌ `trust_engine.py` — **Does not exist** (referenced in test)
3. ❌ `session_state.py` — **Does not exist** (referenced in test)

---

## 🧹 Code Cleanup Required

### File: `tests/test_signal_toggles.py`

**Issue**: Imports from non-existent modules

```python
# ❌ BROKEN IMPORTS (lines 24-29):
from interview.session_state import (
    ALWAYS_ON_PROCTORING_SIGNALS,
    is_always_on_signal,
)
from interview.turn_evaluator import _is_signal_enabled
from interview.trust_engine import _is_toggle_enabled
```

**Action**: Delete this test file (it tests functionality that doesn't exist)

---

## 📂 New Folder Structure

```
interview/
├── __init__.py

# CORE EXECUTION ENGINE
├── interview_executor.py              (main orchestrator, 215K)
├── runtime_config.py                  (config, logging, state, 12K)
├── text_processor.py                  (text cleaning, 12K)
├── runtime_utilities.py               (utility classes, 20K)

# INFRASTRUCTURE
├── provider_factory.py                (TTS/STT/LLM, 12K)
├── database_layer.py                  (DB operations, 18K)

# EVALUATION & SCORING
├── answer_evaluator.py                (score answers, 19K)
├── evaluation_orchestrator.py          (eval orchestration, 19K)

# INTERVIEW CONTENT & STRATEGY
├── phase_prompt_builder.py             (phase prompts, 18K)
├── candidate_context_builder.py        (resume/JD parsing, 15K)
├── system_prompt_builder.py            (assemble prompts, 16K)
├── follow_up_strategy.py               (probe questions, 9.2K)
├── data_extractor.py                   (extract resume/JD, 20K)

# REPORTING
├── interview_report_generator.py       (scorecard generation, 59K)

# UTILITIES
├── speech_processor.py                 (fix pronunciation, 12K)
├── agent_utils.py                      (generic helpers, 3.2K)
```

---

## 🔄 Implementation Steps

### Step 1: Create mapping file (for reference)
```bash
cat > /tmp/rename_mapping.txt << 'EOF'
agent_runtime.py -> interview_executor.py
agent_runtime_support.py -> runtime_config.py
agent_runtime_helpers.py -> text_processor.py
agent_runtime_utils.py -> runtime_utilities.py
agent_providers.py -> provider_factory.py
agent_persistence.py -> database_layer.py
agent_scoring.py -> answer_evaluator.py
eval_pipeline.py -> evaluation_orchestrator.py
interview_phases.py -> phase_prompt_builder.py
interview_brief.py -> candidate_context_builder.py
prompt_layers.py -> system_prompt_builder.py
probe_strategy.py -> follow_up_strategy.py
brief_extraction.py -> data_extractor.py
report_pipeline.py -> interview_report_generator.py
tts_phonetic_processor.py -> speech_processor.py
agent_utils.py -> (no change)
EOF
```

### Step 2: Rename files (will do file-by-file with import updates)

### Step 3: Update all imports across codebase

### Step 4: Delete test file that tests non-existent modules
```bash
rm tests/test_signal_toggles.py
```

### Step 5: Clean pycache
```bash
rm -rf interview/__pycache__/turn_evaluator* interview/__pycache__/trust_engine* interview/__pycache__/session_state*
```

### Step 6: Run tests to verify all imports work

---

## ⚠️ Important Notes

1. **`turn_evaluator.py` doesn't exist** — only artifact in pycache
2. **`trust_engine.py` doesn't exist** — test references it but no source
3. **`session_state.py` doesn't exist** — test references it but no source
4. **Test file is broken** — `test_signal_toggles.py` imports non-existent modules (will be deleted)

---

## Ready to Proceed?

Would you like me to:

1. ✅ **Full Rename + Import Updates** — Rename all 16 files, update all imports across codebase, delete broken test
2. ⚠️ **Rename Only** — Just rename files, you handle imports
3. ❌ **Cancel** — Keep current names

Estimate: ~3-4 hours for full execution (file-by-file with verification)

