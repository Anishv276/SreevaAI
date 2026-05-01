# Fix Plan: Agent Refactoring Consolidation

## Quick Status
- **Total issues:** 7 (1 critical, 4 major, 2 medium)
- **Main problems:** Dead code, function duplication, unclear ownership
- **Time estimate:** 4-6 hours
- **Complexity:** Medium (straightforward refactoring, no logic changes)

---

## Phase 1: Dead Code Removal (5 minutes)

### 1.1 Delete agent_runtime_core.py
This file is completely unused and duplicates agent_runtime.py.

```bash
rm agent_runtime_core.py
```

**Verify:**
```bash
grep -r "agent_runtime_core" . --include="*.py"  # Should return nothing
```

---

## Phase 2: Consolidate Database Functions (30 minutes)

**Current state:** `normalize_postgres_dsn()`, `_create_db_pool()`, `get_db_pool()` exist in BOTH:
- agent_persistence.py (lines 26-70)
- agent_runtime.py (lines ~1000-1050)

**Goal:** Keep only in agent_persistence.py, import in agent_runtime.py

### 2.1 Remove from agent_runtime.py

In `agent_runtime.py`, delete lines approximately:
```python
def normalize_postgres_dsn(conn_str: str) -> str:
    ...

async def _create_db_pool() -> asyncpg.Pool:
    ...

async def get_db_pool() -> asyncpg.Pool:
    ...
```

### 2.2 Add import to agent_runtime.py

At the top of agent_runtime.py, in the agent_persistence imports section, add:
```python
from agent_persistence import (
    get_db_pool,
    normalize_postgres_dsn,
)
```

### 2.3 Verify no other duplicates
```bash
grep -n "def normalize_postgres_dsn\|def _create_db_pool\|def get_db_pool" agent_runtime.py
# Should return nothing if removed correctly
```

---

## Phase 3: Consolidate Utility/Helper Functions (30 minutes)

**Current state:** These functions exist in BOTH agent_runtime.py AND agent_runtime_helpers.py:
- `_single_question_transform()`
- `_sanitize_claim_value()`
- `_build_recent_context_block()`
- `remove_system_messages()`
- `prewarm()`

**Goal:** Keep ONLY in agent_runtime_helpers.py, remove from agent_runtime.py

### 3.1 Identify exact lines in agent_runtime.py to delete

```bash
grep -n "^async def _single_question_transform\|^def _sanitize_claim_value\|^def _build_recent_context_block\|^def remove_system_messages\|^def prewarm" agent_runtime.py
```

**Expected output looks like:**
```
Line ~1200: def _single_question_transform
Line ~1250: def _sanitize_claim_value
Line ~1300: def _build_recent_context_block
Line ~1450: def remove_system_messages
Line ~1900: def prewarm
```

### 3.2 Delete those functions from agent_runtime.py

Use Edit tool to remove each function and its body.

### 3.3 Verify agent_runtime.py now imports these from helpers

Check if agent_runtime.py already imports these:
```bash
grep "from agent_runtime_helpers import" agent_runtime.py
```

If NOT present, add this import to agent_runtime.py:
```python
from agent_runtime_helpers import (
    _single_question_transform,
    _sanitize_claim_value,
    _build_recent_context_block,
    remove_system_messages,
    prewarm,
)
```

---

## Phase 4: Consolidate Billing Functions (1-2 hours)

**Current state:** Billing functions exist in BOTH:
- agent_persistence.py (lines 72-150+)
- agent_runtime.py (lines ~2000-2500)

**Note:** agent_runtime_core.py also has these, but it will be deleted in Phase 1.

**Goal:** Keep ONLY in agent_persistence.py

### 4.1 List all billing functions that need consolidation

In agent_runtime.py, these should be deleted:
- `_empty_usage_bucket()`
- `summarize_session_usage()`
- `_empty_billing_feature()`
- `_coerce_billing_metrics()`
- `_estimate_openai_cost()`
- `_normalize_tts_model_name()`
- `_estimate_tts_cost_usd()`
- `_normalize_stt_model_name()`
- `_estimate_stt_cost_usd()`
- `merge_interview_billing()`
- `_extract_openai_completion_usage()`
- `merge_manual_billing_usage()`
- `persist_org_manual_billing_usage()`
- `flush_pending_manual_billing()`
- `persist_org_usage_metrics()`

### 4.2 Delete from agent_runtime.py

Find and delete each function:
```bash
grep -n "^def _empty_usage_bucket\|^def summarize_session_usage\|^def _empty_billing_feature" agent_runtime.py
```

Use the Edit tool to remove each one.

### 4.3 Add imports to agent_runtime.py

Update the agent_persistence imports in agent_runtime.py to include all of these:
```python
from agent_persistence import (
    get_db_pool,
    normalize_postgres_dsn,
    _empty_usage_bucket,
    summarize_session_usage,
    _empty_billing_feature,
    _coerce_billing_metrics,
    _estimate_openai_cost,
    _normalize_tts_model_name,
    _estimate_tts_cost_usd,
    _normalize_stt_model_name,
    _estimate_stt_cost_usd,
    merge_interview_billing,
    _extract_openai_completion_usage,
    merge_manual_billing_usage,
    persist_org_manual_billing_usage,
    flush_pending_manual_billing,
    persist_org_usage_metrics,
)
```

### 4.4 Also verify agent_scoring.py imports are correct

```bash
grep "from agent_persistence import" agent_scoring.py
```

Should already have:
```python
from agent_persistence import _extract_openai_completion_usage, persist_org_manual_billing_usage
```

If these are being moved from agent_runtime to agent_persistence, agent_scoring.py import is already correct. ✓

---

## Phase 5: Verify Constants are in Right Place (20 minutes)

These constants are shared and should be in agent_runtime_support.py ONLY:

```python
_USAGE_BUCKET_FIELDS
_USAGE_TYPE_TO_BUCKET
PROCTORING_WEIGHTS
```

### 5.1 Check agent_persistence.py doesn't duplicate them

```bash
grep -n "_USAGE_BUCKET_FIELDS\|_USAGE_TYPE_TO_BUCKET" agent_persistence.py
```

If found, they might be duplicated. Check agent_runtime_support.py:
```bash
grep -n "_USAGE_BUCKET_FIELDS\|_USAGE_TYPE_TO_BUCKET" agent_runtime_support.py
```

**Action:** If duplicated, keep ONLY in agent_runtime_support.py and import in agent_persistence.py.

---

## Phase 6: Verify Imports & No Breakage (1 hour)

### 6.1 Check all imports work

```bash
python -c "from agent import *" 2>&1 | head -20
```

Should have no ImportError, ModuleNotFoundError, or AttributeError.

### 6.2 Look for any undefined references

In agent_runtime.py, make sure every function used is either:
- Defined in the file, OR
- Imported from another module

```bash
python -m py_compile agent_runtime.py
python -m py_compile agent_persistence.py
python -m py_compile agent_runtime_helpers.py
```

All should succeed.

### 6.3 Grep for stray references to deleted functions

```bash
grep "_single_question_transform\|_sanitize_claim_value" agent_runtime.py
```

Should only find import statements, not definitions.

### 6.4 Verify no references to agent_runtime_core

```bash
grep -r "agent_runtime_core" . --include="*.py"
```

Should return nothing.

---

## Phase 7: Testing (1-2 hours)

### 7.1 Unit tests (if any exist)

```bash
pytest -xvs
```

All tests should pass.

### 7.2 Import test

```python
# Try importing everything
from agent import *
from agent_runtime import entrypoint, prewarm
from agent_persistence import get_db_pool, persist_transcript
from agent_runtime_helpers import _sanitize_claim_value
from agent_scoring import score_answer_quality
```

All should work.

### 7.3 Integration test

```bash
npm run dev
```

LiveKit agent should start without errors.

### 7.4 Manual smoke test

Run a test interview if possible:
- [ ] Agent starts
- [ ] Accepts connection
- [ ] Generates questions
- [ ] Evaluates answers
- [ ] Saves to database
- [ ] Produces summary

---

## Phase 8: Commit & Document (30 minutes)

### 8.1 Create commit

```bash
git add -A
git commit -m "refactor: consolidate duplicated code, remove agent_runtime_core

- Delete unused agent_runtime_core.py (complete duplicate)
- Move database functions to agent_persistence (source of truth)
- Move billing functions to agent_persistence (source of truth)
- Move helper functions to agent_runtime_helpers (source of truth)
- Update imports across runtime, persistence, and scoring
- Fix circular dependency risks from duplication
- No logic changes, pure refactoring

All tests pass. Production ready."
```

### 8.2 Review changes

```bash
git diff --stat HEAD~1
git diff HEAD~1 | head -100  # First 100 lines
```

### 8.3 Update ARCHITECTURE_REVIEW.md

Mark all issues as FIXED and date it.

---

## Rollback Plan

If anything breaks:

```bash
git reset --hard HEAD  # Go back to before changes
```

Then debug specific phase and retry.

---

## Success Criteria

- [ ] agent_runtime_core.py deleted
- [ ] No function defined in multiple files
- [ ] No import errors when running `python -c "from agent import *"`
- [ ] All tests pass
- [ ] npm run dev starts without errors
- [ ] ARCHITECTURE_REVIEW.md updated with "FIXED" status
- [ ] Team agrees on structure before next feature

---

## Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Delete dead code | 5 min |
| 2 | Consolidate DB functions | 30 min |
| 3 | Consolidate helper functions | 30 min |
| 4 | Consolidate billing functions | 1-2 hours |
| 5 | Verify constants | 20 min |
| 6 | Verify imports | 1 hour |
| 7 | Testing | 1-2 hours |
| 8 | Commit & docs | 30 min |
| **Total** | | **4-6 hours** |

---

## Questions to Resolve

1. **Are agent_persistence.py and agent_runtime.py the right homes for billing?**
   - Recommendation: Yes, billing is persistence concern
   
2. **Should prewarm() be in helpers or runtime?**
   - Currently in helpers. OK to keep there since it's a runtime helper.

3. **Should there be a separate billing module (agent_billing.py)?**
   - Recommendation: Keep in persistence for now. If it grows, extract later.

4. **Do we need agent_runtime_core.py for anything?**
   - No. Delete it. Nothing references it.

---

**Status:** Ready to execute. No blockers identified.
