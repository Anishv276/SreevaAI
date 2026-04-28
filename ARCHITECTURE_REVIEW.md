# Deep Architecture Review: Agent.py Refactoring

**Date:** 2026-04-28  
**Total Code:** 10,963 lines across 18 Python files  
**Status:** Critical issues found - refactoring incomplete and duplicated

---

## Executive Summary

The refactoring **partially succeeded** but has **major architectural issues** that break the intended modular design:

1. **Massive code duplication** (7,230 lines duplicated)
2. **Unused dead code** (agent_runtime_core.py not imported anywhere)
3. **Conflicting implementations** (same functions in multiple files)
4. **Import confusion** (agent_runtime imports from helpers that were split from it)
5. **No clear separation of concerns**

This needs **immediate remediation** before production use.

---

## Issues Found

### 🔴 CRITICAL ISSUE #1: agent_runtime_core.py is DEAD CODE

**Location:** `agent_runtime_core.py` (166 KB, 3,466 lines)

**Problem:**
- This file is **NEVER IMPORTED** anywhere in the codebase
- It's a **complete duplicate** of ~90% of `agent_runtime.py`
- Both files contain identical implementations of:
  - All database functions (`normalize_postgres_dsn`, `get_db_pool`, etc.)
  - All billing functions (`_estimate_openai_cost`, `persist_org_manual_billing_usage`, etc.)
  - Core interview logic

**Diff:**
```
agent_runtime.py:       3,764 lines (used)
agent_runtime_core.py:  3,466 lines (duplicate, unused)
```

**Evidence:**
```bash
$ grep -r "agent_runtime_core" . --include="*.py"
# Returns nothing - file is orphaned
```

**Impact:** 
- 166 KB of wasted code
- Double maintenance burden
- Potential for version skew between copies
- Risk: future changes made to runtime won't be applied to core

**FIX REQUIRED:** Delete `agent_runtime_core.py` immediately

---

### 🔴 CRITICAL ISSUE #2: Function Duplication Between agent_runtime.py and agent_runtime_helpers.py

**Problem:**
Identical function implementations exist in **TWO PLACES**:

| Function | agent_runtime.py | agent_runtime_helpers.py | Status |
|----------|--------|--------|--------|
| `_single_question_transform()` | ✓ Line ~60 | ✓ Line ~23 | **DUPLICATE** |
| `_sanitize_claim_value()` | ✓ Line ~80 | ✓ Line ~55 | **DUPLICATE** |
| `_build_recent_context_block()` | ✓ Line ~100 | ✓ Line ~64 | **DUPLICATE** |
| `remove_system_messages()` | ✓ Line ~140 | ✓ Line ~101 | **DUPLICATE** |
| `prewarm()` | ✓ Line ~800 | ✓ Line ~100 | **DUPLICATE** |

**Which one is used?**
```python
# agent.py imports from helpers:
from agent_runtime_helpers import (
    _build_recent_context_block,
    _sanitize_claim_value,
    _single_question_transform,
    remove_system_messages,
)
```

So `agent_runtime_helpers.py` versions are **authoritative**, but `agent_runtime.py` has stale copies.

**Impact:**
- 100+ lines of needless duplication
- If these functions need bug fixes, you have to fix both places (or forget one)
- Code maintenance nightmare
- Violates DRY principle

**FIX REQUIRED:** 
1. Keep functions ONLY in `agent_runtime_helpers.py`
2. Remove from `agent_runtime.py`
3. Import from helpers in runtime (or vice versa)

---

### 🟠 MAJOR ISSUE #3: agent_persistence.py also has duplicated database functions

**Location:** `agent_persistence.py` lines 26-70

**Problem:**
```python
# agent_persistence.py has:
def normalize_postgres_dsn(conn_str: str) -> str: ...
async def _create_db_pool() -> asyncpg.Pool: ...
async def get_db_pool() -> asyncpg.Pool: ...
```

**Also appears in:**
- `agent_runtime.py` (identical)
- `agent_runtime_core.py` (identical)

**Impact:**
- 3 different versions of the same critical database code
- If DB connection logic needs a fix, you must fix all 3 copies or face inconsistency
- Cache invalidation nightmare

**FIX REQUIRED:** 
- Keep database functions ONLY in `agent_persistence.py` (logical home)
- Remove from `agent_runtime.py` and `agent_runtime_core.py`
- Both should `import get_db_pool, normalize_postgres_dsn from agent_persistence`

---

### 🟠 MAJOR ISSUE #4: Billing/Usage functions duplicated across multiple files

**Problem:**
Billing calculation functions exist in **BOTH** files:
- `agent_runtime.py` (lines ~400-800)
- `agent_persistence.py` (lines ~72-150+)
- `agent_runtime_core.py` (identical to agent_runtime.py)

**Duplicated functions:**
- `_empty_usage_bucket()`
- `summarize_session_usage()`
- `_empty_billing_feature()`
- `_coerce_billing_metrics()`
- `_estimate_openai_cost()`
- `_estimate_tts_cost_usd()`
- `_estimate_stt_cost_usd()`
- `merge_interview_billing()`
- `merge_manual_billing_usage()`
- `persist_org_manual_billing_usage()`

**Which is authoritative?** Unclear. Both are imported, likely causing conflicts.

**FIX REQUIRED:**
- Choose ONE home for billing logic (recommend: `agent_persistence.py`)
- Remove duplicates from `agent_runtime.py`
- Ensure only one implementation exists

---

### 🟡 MAJOR ISSUE #5: Unclear import flow & potential circular risks

**Current structure:**
```
agent.py (main entry)
├── imports: agent_runtime, agent_runtime_helpers, agent_runtime_support, agent_scoring, agent_providers, agent_profile_context, agent_utils

agent_runtime.py (3,764 lines - the giant)
├── imports: agent_utils, agent_profile_context, agent_providers, agent_runtime_support, agent_scoring, agent_persistence

agent_runtime_helpers.py (12 KB)
├── imports: agent_persistence, agent_providers, agent_runtime_support

agent_runtime_core.py (DEAD - not imported)
├── imports: (everything, but unused)
```

**Problem:**
- `agent_runtime.py` is a **3,700+ line monolith**. It was supposed to be split but splitting was incomplete
- `agent_runtime_core.py` is orphaned dead code
- The "helpers" module contains functions that should arguably be in runtime
- No clear layering: runtime imports support, runtime imports helpers, helpers imports persistence
- Circular dependency risk is managed (no actual cycles detected) but fragile

**Inspection results:**
```
No circular imports detected! ✓ (This is good)
```

But the structure is still confusing.

**FIX REQUIRED:**
- Decide: is `agent_runtime.py` supposed to be split or not?
  - **Option A (Recommended):** Keep it as the main orchestrator, remove dead code
  - **Option B:** Properly split it into logical domains (runtime/lifecycle, scoring, persistence)

---

### 🟡 ISSUE #6: Missing organization in agent_runtime.py

**Size:** 3,764 lines in a single file

**Contains:**
1. Database/persistence helpers (should be in `agent_persistence.py`)
2. Billing calculations (should be in `agent_persistence.py`)
3. Interview context building (should be in `agent_profile_context.py`)
4. LLM orchestration (core logic, OK here)
5. Proctoring handlers (could be extracted)
6. Session management (could be extracted)

**Problem:**
- File is too large to understand in one go
- No internal structure or class boundaries
- 15+ concern areas mixed in one file
- Makes testing harder

**Not necessarily a blocker** if this is the intended design, but it's monolithic.

---

### 🟡 ISSUE #7: agent_scoring.py imports are inconsistent

**Location:** `agent_scoring.py` line 8-9

```python
from agent_persistence import _extract_openai_completion_usage, persist_org_manual_billing_usage
from agent_runtime_support import APP_BASE_URL, LLM_MODEL, logger
```

**Problem:**
- `agent_scoring.py` reaches directly into `agent_persistence.py` for billing functions
- But those same functions exist in `agent_runtime.py`
- Which version is canonical?

**FIX REQUIRED:**
- Clarify ownership: do billing functions belong in `persistence` or `runtime`?
- Move them to one place
- Have all callers import from one canonical location

---

### 🟡 ISSUE #8: agent_runtime_helpers.py might have mixed responsibilities

**Functions in helpers:**
1. Text transforms: `_single_question_transform()`, `_sanitize_claim_value()` ✓ (valid)
2. Context building: `_build_recent_context_block()` ✓ (valid)
3. Message handling: `remove_system_messages()` ✓ (valid)
4. Lifecycle: `prewarm()` ❓ (belongs in runtime?)
5. Logging: `append_transcript_line()`, `report_proctoring_realtime()` ✓ (valid)
6. Signals: `signal_client_interview_terminated()`, `signal_client_proctoring_violation()` ✓ (valid)
7. Risk computation: `refresh_composite_risk()` ❓ (utility? belongs in scoring?)
8. Configuration: `build_language_codes()`, `select_org_runtime_models()` ❓ (belongs in config?)

**Assessment:** Mostly coherent (runtime helper functions), but some functions could be better placed.

**Minor FIX:** Consider extracting risk/config utilities if they grow, but current state is acceptable.

---

## Architectural Issues Summary

| Issue | Severity | Type | Lines | Fix Effort |
|-------|----------|------|-------|-----------|
| agent_runtime_core.py is dead code | 🔴 Critical | Blocker | 3,466 | 5 min (delete) |
| Duplication: _single_question_transform, etc. | 🔴 Critical | Logic | 100+ | 30 min |
| Duplication: database functions | 🟠 Major | Logic | 70+ | 1 hour |
| Duplication: billing functions | 🟠 Major | Logic | 400+ | 2 hours |
| Unclear import ownership | 🟠 Major | Structural | 20+ | 1-2 hours |
| agent_runtime.py is monolithic | 🟡 Major | Structural | 3,764 | 4-6 hours (optional refactor) |
| agent_runtime_helpers might have mixed concerns | 🟡 Minor | Organizational | 12 KB | 1 hour (optional) |

---

## What's Working Well ✓

1. **No circular imports** - dependency chain is clean and acyclic
2. **Proper separation of concerns** in new modules:
   - `agent_utils.py` - utility functions (clean)
   - `agent_runtime_support.py` - config/constants (clean)
   - `agent_providers.py` - provider initialization (clean)
   - `agent_profile_context.py` - candidate context (clean)
   - `agent_scoring.py` - answer evaluation (mostly clean)
3. **Config centralization** in `agent_runtime_support.py` (good design)
4. **Imports in agent.py are correct** - clean entry point

---

## Preservation of Original Logic ✓

✓ **Original agent.py logic IS preserved** across the refactored files:
- Prompt engineering logic → `agent_profile_context.py`, `prompt_layers.py`
- Provider setup → `agent_providers.py`
- Scoring → `agent_scoring.py`
- Persistence → `agent_persistence.py`
- Main loop → `agent_runtime.py` (and dead `agent_runtime_core.py`)

No logic has been lost, but it's duplicated in places.

---

## Production Readiness Assessment

**Current Status:** ❌ **NOT PRODUCTION READY**

**Issues blocking production:**
1. Dead code (agent_runtime_core.py) creates maintenance debt
2. Duplicated database functions could cause version skew
3. Billing function duplication is a serious audit/correctness risk
4. No single source of truth for critical functions

**Steps needed before shipping:**
1. Delete `agent_runtime_core.py` (5 minutes)
2. Consolidate database functions to `agent_persistence.py` (30 minutes)
3. Consolidate billing functions to one location (1-2 hours)
4. Verify imports are correct (30 minutes)
5. Test full flow end-to-end (1-2 hours)
6. Update this documentation (30 minutes)

**Estimated fix time:** 4-6 hours

---

## Recommendations (Priority Order)

### 1. URGENT - Delete agent_runtime_core.py
```bash
rm agent_runtime_core.py
```
This file is dead code, pure waste. No migrations needed.

### 2. URGENT - Consolidate database functions
Move these from `agent_runtime.py` to `agent_persistence.py` only:
- `normalize_postgres_dsn()`
- `_create_db_pool()`
- `get_db_pool()`

Update agent_runtime.py to import from persistence:
```python
from agent_persistence import get_db_pool, normalize_postgres_dsn
```

### 3. URGENT - Consolidate billing functions
Move ALL billing logic from `agent_runtime.py` to `agent_persistence.py`:
- `_empty_usage_bucket()`
- `summarize_session_usage()`
- `_empty_billing_feature()`
- `_coerce_billing_metrics()`
- `_estimate_openai_cost()`
- `_estimate_tts_cost_usd()`
- `_estimate_stt_cost_usd()`
- `merge_interview_billing()`
- `_extract_openai_completion_usage()`
- `merge_manual_billing_usage()`
- `persist_org_manual_billing_usage()`
- `flush_pending_manual_billing()`
- `persist_org_usage_metrics()`

Update agent_scoring.py to import from there (already does mostly).
Update agent_runtime.py to import from there.

### 4. HIGH - Consolidate utility functions
Move from `agent_runtime.py` to `agent_runtime_helpers.py` ONLY:
- `_single_question_transform()`
- `_sanitize_claim_value()`
- `_build_recent_context_block()`
- `remove_system_messages()`
- `prewarm()`

Then have `agent_runtime.py` import these from helpers.

### 5. MEDIUM - Add comments/docstrings to agent_runtime.py
Since it's 3,700+ lines, add section headers:
```python
# ============ INITIALIZATION & SETUP ============
async def prewarm(proc):
    ...

# ============ SESSION LIFECYCLE ============
async def entrypoint(ctx):
    ...

# ============ DATABASE & PERSISTENCE ============
async def persist_transcript(...):
    ...
```

### 6. MEDIUM - Consider extracting large subsystems (future)
If `agent_runtime.py` becomes too hard to maintain, consider splitting into:
- `agent_runtime_lifecycle.py` - entry/exit, setup
- `agent_runtime_orchestration.py` - main interview loop
- `agent_runtime_decision.py` - turn decisions, scoring
- Keep `agent_persistence.py` for data access

But **NOT NOW** - first consolidate the duplicates.

---

## Testing Checklist

Before declaring this production-ready:

- [ ] Delete `agent_runtime_core.py`
- [ ] Run: `python -c "from agent import *"` (no import errors)
- [ ] Run: `pytest` (all tests pass)
- [ ] Grep for `agent_runtime_core` (should find nothing)
- [ ] Grep for functions in agent_runtime and agent_persistence (no duplication)
- [ ] Test database initialization with `get_db_pool()`
- [ ] Test a full interview flow end-to-end
- [ ] Run with `npm run dev` (LiveKit integration)
- [ ] Review git diff before commit

---

## Conclusion

**The refactoring is ~70% complete.** Good structural decisions (modular support, clear exports), but incomplete execution (dead code, duplicates, no consolidation).

**Time to fix: 4-6 hours.**

Once fixed, the architecture will be:
- ✓ Modular and maintainable
- ✓ No duplication
- ✓ Single source of truth for all functions
- ✓ Clean import hierarchy
- ✓ Production-ready

**Recommendation:** Spend the 6 hours now to fix these issues. The technical debt will compound otherwise.
