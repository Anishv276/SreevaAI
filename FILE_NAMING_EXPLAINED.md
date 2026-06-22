# Interview Module - File Naming Explained

**Purpose**: Understand WHY each file has its new name  
**Goal**: Self-documenting names that immediately tell you what the file does

---

## 🎯 Naming Philosophy

Each file name should answer this question:
> **What does this code DO?**

The name = the action/responsibility, not the abstract role.

---

## 1️⃣ CORE EXECUTION ENGINE

### interview_executor.py
**Current**: `agent_runtime.py`

**Why this name?**
- **`executor`** = "something that executes" = runs the interview
- The file **executes** the entire interview session from start to end
- Main entry point: `entrypoint()` → this EXECUTES the interview
- The interview RUNS through this file

**What it does**:
- Runs the interview loop (20 minutes)
- Manages each turn (candidate speaks → eval → LLM responds → TTS speaks)
- Handles topic transitions
- Controls coverage tracking

**Bad name**: "agent_runtime" - What's "agent"? What's "runtime"? Unclear.  
**Good name**: "interview_executor" - Oh, it EXECUTES interviews!

---

### runtime_config.py
**Current**: `agent_runtime_support.py`

**Why this name?**
- **`runtime`** = during interview execution (as opposed to setup/analysis)
- **`config`** = configuration/setup
- This file **configures the runtime** (interview execution)
- Contains: config values, logging setup, state management

**What it does**:
- Loads environment variables (STT model, LLM model, voice registry)
- Sets up JSON logging
- Manages state (DB pool, billing)
- Provides constants that the executor needs

**Bad name**: "agent_runtime_support" - Support what? Too vague.  
**Good name**: "runtime_config" - Sets up config FOR the runtime!

---

### text_processor.py
**Current**: `agent_runtime_helpers.py`

**Why this name?**
- **`text`** = what it processes
- **`processor`** = processes/transforms text
- All functions process text: clean it, polish it, transform it for TTS
- Handles transcript assembly too (transcript = text)

**What it does**:
- `sanitize_candidate_facing_text()` - removes internal directives
- `polish_candidate_facing_text()` - cleans/normalizes text
- `append_transcript_line()` - assembles transcript text
- `_single_question_transform()` - transforms text for TTS

**Bad name**: "agent_runtime_helpers" - Helper for what? Too generic.  
**Good name**: "text_processor" - Processes TEXT!

---

### runtime_utilities.py
**Current**: `agent_runtime_utils.py`

**Why this name?**
- **`runtime`** = for use during interview execution
- **`utilities`** = utility classes/helpers
- Different from generic `agent_utils.py` (which is used everywhere)
- This is **runtime-specific** utilities

**What it does**:
- `AgentConfig` - configuration management
- `MutableStateManager` - state management
- `TextSanitizer` - text pattern library
- `TranscriptManager` - transcript handling

**Bad name**: `agent_utils.py` (confuses with generic utilities)  
**Good name**: `runtime_utilities.py` - Utilities FOR runtime, not generic!

---

## 2️⃣ INFRASTRUCTURE

### provider_factory.py
**Current**: `agent_providers.py`

**Why this name?**
- **`provider`** = TTS provider, STT provider, LLM provider
- **`factory`** = design pattern for creating/initializing objects
- Functions like `build_cartesia_tts()` **build** (factory pattern)
- Creates/initializes providers when needed

**What it does**:
- `build_cartesia_tts()` - creates Cartesia TTS instance
- `build_sarvam_tts()` - creates Sarvam TTS instance
- `build_stt()` - creates Deepgram STT instance
- `build_llm()` - creates OpenAI LLM instance

**Bad name**: "agent_providers" - Provides what? Vague.  
**Good name**: "provider_factory" - BUILDS/CREATES providers (factory pattern)!

---

### database_layer.py
**Current**: `agent_persistence.py`

**Why this name?**
- **`database`** = what it talks to
- **`layer`** = architectural layer (separation of concerns)
- All database reads/writes go through this file
- It's the DATABASE ACCESS LAYER

**What it does**:
- `DatabasePool` - manages connection pool
- `persist_transcript()` - saves transcript to DB
- `persist_answer_scores()` - saves scores to DB
- `generate_interview_report()` - reads data, generates report

**Bad name**: "agent_persistence" - Persist what? To where? Unclear.  
**Good name**: "database_layer" - The DATABASE layer for persistence!

---

## 3️⃣ EVALUATION & SCORING

### answer_evaluator.py
**Current**: `agent_scoring.py`

**Why this name?**
- **`answer`** = what it evaluates
- **`evaluator`** = evaluates/scores the answer
- Main function: `evaluate_answer()` - EVALUATES an answer
- Detects signals from the answer

**What it does**:
- `evaluate_answer()` - scores on clarity, depth, specificity, grounding
- `_extract_signal_from_answer()` - detects behavioral signal
- `notify_sync_engine()` - sends score to backend
- **One LLM call per turn: scores + detects 1 signal**

**Bad name**: "agent_scoring" - Scores what? Unclear.  
**Good name**: "answer_evaluator" - EVALUATES ANSWERS!

---

### evaluation_orchestrator.py
**Current**: `eval_pipeline.py`

**Why this name?**
- **`evaluation`** = the evaluation process
- **`orchestrator`** = orchestrates/coordinates the workflow
- Coordinates: eval → saturation check → PROBE vs MOVE_ON decision
- Orchestrates the full evaluation workflow

**What it does**:
- `TopicState` - tracks saturation for each topic
- `run_eval_and_build_directive()` - orchestrates eval flow
- Band-aware saturation thresholds
- Decides: should we PROBE (ask follow-up) or MOVE_ON (new topic)?

**Bad name**: "eval_pipeline" - Pipeline does what? Too abstract.  
**Good name**: "evaluation_orchestrator" - ORCHESTRATES the eval workflow!

---

## 4️⃣ INTERVIEW CONTENT & STRATEGY

### phase_prompt_builder.py
**Current**: `interview_phases.py`

**Why this name?**
- **`phase`** = interview phase (greeting, warmup, interview)
- **`prompt`** = system prompt/directive
- **`builder`** = builds/constructs the prompt
- Function: `build_interview_directive()` - BUILDS the directive

**What it does**:
- `build_greeting_text()` - builds initial greeting
- `build_warmup_directive()` - builds warmup phase rules
- `build_interview_directive()` - builds main interview plan
- All outputs are system prompts for specific phases

**Bad name**: "interview_phases" - Has what phases? Unclear.  
**Good name**: "phase_prompt_builder" - BUILDS PROMPTS FOR PHASES!

---

### candidate_context_builder.py
**Current**: `interview_brief.py`

**Why this name?**
- **`candidate`** = for the candidate
- **`context`** = context about the candidate (resume, skills, projects)
- **`builder`** = builds/constructs this context
- Function: `generate_interview_brief()` - BUILDS the brief/context

**What it does**:
- Parse resume into `InterviewBrief`
- Extract projects, work history, skills
- Extract JD requirements
- Infer candidate band (fresher, mid, experienced, senior)
- **Creates the context from which interview questions will be asked**

**Bad name**: "interview_brief" - A brief OF WHAT? Unclear.  
**Good name**: "candidate_context_builder" - BUILDS CONTEXT ABOUT THE CANDIDATE!

---

### system_prompt_builder.py
**Current**: `prompt_layers.py`

**Why this name?**
- **`system`** = system prompt (not user/assistant messages)
- **`prompt`** = the prompt being built
- **`builder`** = assembles/builds the prompt
- Stacks layers: voice + eval + phase + directives + context

**What it does**:
- `build_voice_layer_prompt()` - "You are Ishita..."
- `build_evaluation_layer_prompt()` - analyst brief, coverage state
- `build_system_prompt()` - combines all layers into final system message
- Orchestrates how layers stack

**Bad name**: "prompt_layers" - Layers for what? Just "layers"?  
**Good name**: "system_prompt_builder" - BUILDS the SYSTEM PROMPT!

---

### follow_up_strategy.py
**Current**: `probe_strategy.py`

**Why this name?**
- **`follow_up`** = what it handles (follow-up questions)
- **`strategy`** = defines the strategy/tactics
- When a signal fires (e.g., "ownership_ambiguity"), what follow-up question should be asked?
- Each signal has a probe strategy

**What it does**:
- `get_probe_context()` - builds probe context block
- Defines probe families: ownership, depth, clarification, specificity, etc.
- For each signal: "When signal X fires, ask question from family Y"
- Tells LLM what follow-up to ask based on detected signal

**Bad name**: "probe_strategy" - Probe what? Strategy for what?  
**Good name**: "follow_up_strategy" - STRATEGY FOR FOLLOW-UP QUESTIONS!

---

### data_extractor.py
**Current**: `brief_extraction.py`

**Why this name?**
- **`data`** = what it extracts
- **`extractor`** = extracts/parses the data
- Extracts from resume: projects, work history, skills
- Extracts from JD: required skills, seniority level

**What it does**:
- `extract_skills()` - extracts skills from resume
- `extract_projects()` - extracts projects with tech tags
- `extract_work_history()` - extracts work experience
- `extract_from_jd()` - extracts required skills from JD
- **Pure Python, NO LLM, deterministic parsing**

**Bad name**: "brief_extraction" - Extract WHAT into a brief?  
**Good name**: "data_extractor" - EXTRACTS DATA from resume/JD!

---

## 5️⃣ REPORTING

### interview_report_generator.py
**Current**: `report_pipeline.py`

**Why this name?**
- **`interview`** = scope (interview reports, not general reports)
- **`report`** = generates a report
- **`generator`** = generates/creates the report
- Main function: `generate_interview_report()` - GENERATES the report

**What it does**:
- `IntegrityEngine` - scores proctoring signals
- `LLMEvalResponse` - LLM-based evaluation dimensions
- `ReportLLMClient` - calls LLM for report generation
- LangGraph DAG: signals → LLM calls → final scorecard
- Creates the final interview scorecard for HR

**Bad name**: "report_pipeline" - Pipeline does what? Too generic.  
**Good name**: "interview_report_generator" - GENERATES INTERVIEW REPORTS!

---

## 6️⃣ UTILITIES

### speech_processor.py
**Current**: `tts_phonetic_processor.py`

**Why this name?**
- **`speech`** = preparing text for speech (TTS)
- **`processor`** = processes/transforms the text
- Before TTS speaks: fix pronunciation, handle acronyms, dashes
- Processes text to make speech sound natural

**What it does**:
- `PhoneticRule` - rules for pronouncing words
- `TTSPhoneticProcessor` - applies pronunciation rules
- Fixes acronyms (spell out "NASA" vs read "radar")
- Normalizes dashes and punctuation for TTS
- Makes text sound natural when spoken

**Bad name**: "tts_phonetic_processor" - Too technical, not action-based.  
**Good name**: "speech_processor" - PROCESSES text FOR SPEECH!

---

### agent_utils.py
**Current**: `agent_utils.py` (NO CHANGE)

**Why keep this name?**
- **`agent`** = generic (not runtime-specific)
- **`utils`** = utilities used throughout codebase
- Generic helpers: JSON parsing, token counting, name parsing
- Used by many modules, not just runtime

**What it does**:
- `_coerce_jsonish()` - safe JSON parsing
- `truncate_to_tokens()` - token-aware text truncation
- `first_name_from_full_name()` - parse Indian names
- `_cartesia_plugin_model()` - Cartesia model name parsing

**Why not rename?**
- It's genuinely generic (used by persistence, providers, report_pipeline)
- "agent_utils" = "utilities for the agent system"
- Renaming would break imports in many places
- Already clear what it does

---

## 7️⃣ NAMING PATTERNS

### Verb-Based Names (Action-Oriented)

| Pattern | Meaning | Example |
|---------|---------|---------|
| `*_executor` | Runs/executes | `interview_executor` |
| `*_builder` | Builds/constructs | `prompt_builder`, `context_builder` |
| `*_generator` | Generates output | `report_generator` |
| `*_orchestrator` | Orchestrates workflow | `evaluation_orchestrator` |
| `*_processor` | Processes data | `text_processor`, `speech_processor` |
| `*_factory` | Creates objects | `provider_factory` |
| `*_evaluator` | Evaluates/scores | `answer_evaluator` |
| `*_extractor` | Extracts data | `data_extractor` |
| `*_strategy` | Defines strategy | `follow_up_strategy` |
| `*_layer` | Architectural layer | `database_layer` |

---

## 🎓 How to NAME FILES Yourself

Ask these 3 questions:

### Question 1: **WHAT does it process?**
- Processes text? → text_processor
- Processes speech? → speech_processor
- Processes answers? → answer_evaluator

### Question 2: **WHAT does it DO?**
- Builds something? → *_builder
- Generates something? → *_generator
- Executes something? → *_executor
- Orchestrates something? → *_orchestrator
- Creates something? → *_factory

### Question 3: **IS IT SPECIFIC or GENERIC?**
- Specific to runtime? → prefix `runtime_` (runtime_config, runtime_utilities)
- Generic across system? → no prefix needed (agent_utils)

---

## 📝 BEFORE & AFTER

| BEFORE (Confusing) | AFTER (Clear) | Reason |
|---|---|---|
| agent_runtime.py | interview_executor.py | Clearly **executes** interviews |
| agent_runtime_support.py | runtime_config.py | **Configures** the runtime |
| agent_runtime_helpers.py | text_processor.py | **Processes** text |
| agent_runtime_utils.py | runtime_utilities.py | Runtime-specific **utilities** |
| agent_providers.py | provider_factory.py | **Factory** for providers |
| agent_persistence.py | database_layer.py | **Database** access layer |
| agent_scoring.py | answer_evaluator.py | **Evaluates** answers |
| eval_pipeline.py | evaluation_orchestrator.py | **Orchestrates** eval |
| interview_phases.py | phase_prompt_builder.py | **Builds** phase prompts |
| interview_brief.py | candidate_context_builder.py | **Builds** candidate context |
| prompt_layers.py | system_prompt_builder.py | **Builds** system prompts |
| probe_strategy.py | follow_up_strategy.py | **Strategy** for follow-ups |
| brief_extraction.py | data_extractor.py | **Extracts** data |
| report_pipeline.py | interview_report_generator.py | **Generates** reports |
| tts_phonetic_processor.py | speech_processor.py | **Processes** speech text |

---

## ✅ BENEFITS

✅ **Self-documenting** — Name tells you what code does  
✅ **Consistent** — Same naming pattern across files  
✅ **Beginner-friendly** — New devs understand immediately  
✅ **Searchable** — Can find files by action (grep for "builder")  
✅ **Scalable** — Easy to add new files with same pattern  

---

## 🤔 Common Confusion Clarified

**Q: Why `text_processor` not `text_helper`?**  
A: "helper" is vague. "processor" is specific — it PROCESSES text.

**Q: Why `runtime_config` not `agent_config`?**  
A: Clarifies THIS is config FOR the runtime. Generic `agent_config` would be ambiguous.

**Q: Why `speech_processor` not `tts_processor`?**  
A: "TTS" is technical jargon. "speech" is what the user sees — text for SPEECH.

**Q: Why keep `agent_utils` unchanged?**  
A: It's genuinely generic. Used by many parts of system, not just runtime.

