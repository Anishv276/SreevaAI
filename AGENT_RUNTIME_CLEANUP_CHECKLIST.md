# Agent Runtime Cleanup Checklist

**Status**: READY FOR IMPLEMENTATION  
**Total Items**: 6 deletions + 2 consolidations  
**Total Lines to Remove**: ~65 lines  
**Estimated Effort**: 30 minutes  
**Risk Level**: MINIMAL (all dead code)

---

## Pre-Cleanup Verification

- [ ] Back up original file: `git status` shows no uncommitted changes on agent_runtime.py
- [ ] Run current tests: Ensure baseline passes
- [ ] Document baseline metrics:
  - Total lines: 3,975
  - Import count: ~40
  - Function count: ~25 top-level + 15 nested

---

## Priority 1: Immediate Removals (Zero Risk)

### Task 1.1: Remove Duplicate Import (Line 47)

**File**: `interview/agent_runtime.py`  
**Action**: Delete line 47  
**Before**:
```python
45  from pydantic import BaseModel, field_validator
46
47  import re as _re
48  from dataclasses import dataclass
```

**After**:
```python
45  from pydantic import BaseModel, field_validator
46
47  from dataclasses import dataclass
```

**Verification**:
```bash
# Ensure no _re. references remain
grep "_re\." interview/agent_runtime.py
# Should return ONLY: line 80 (will be fixed next)
```

**Checkpoint**: [ ] Line 47 deleted

---

### Task 1.2: Update CoveredTopics._norm() to use `re.` (Line 80)

**File**: `interview/agent_runtime.py`  
**Action**: Replace `_re.sub()` with `re.sub()`  
**Before** (line 80):
```python
    @staticmethod
    def _norm(key: str) -> str:
        short = str(key or "").split(" - ")[0].strip()
        return _re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()
```

**After**:
```python
    @staticmethod
    def _norm(key: str) -> str:
        short = str(key or "").split(" - ")[0].strip()
        return re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()
```

**Verification**:
```bash
# Verify no _re references remain
grep "_re\." interview/agent_runtime.py
# Should return NOTHING
```

**Checkpoint**: [ ] Line 80 updated to use `re.sub()`

---

### Task 1.3: Remove Unused AgentSessionUsage Import (Line 197)

**File**: `interview/agent_runtime.py`  
**Action**: Delete line 197  
**Before**:
```python
196  from livekit.agents.metrics import AgentSessionUsage
197  from livekit.agents.voice import room_io
```

**After**:
```python
196  from livekit.agents.voice import room_io
```

**Verification**:
```bash
# Search for AgentSessionUsage references
grep "AgentSessionUsage" interview/agent_runtime.py
# Should return NOTHING (the type hint at line 1627 is just a string hint, not a real reference)
```

**Checkpoint**: [ ] AgentSessionUsage import removed

---

### Task 1.4: Remove Unused Constant (Lines 239-249)

**File**: `interview/agent_runtime.py`  
**Action**: Delete lines 239-249  
**Before** (lines 238-250):
```python
238  _ACK_ONLY_ASSISTANT_RE = re.compile(
239      r"^\s*(?:okay|ok|got it|sure|right|yeah|yes|thanks|thank you|makes sense|that makes sense)[,.\s]*$",
240      re.IGNORECASE,
241  )
242  _MEANINGFUL_SHORT_ANSWERS = {
243      "no",
244      "yes",
245      "yeah",
246      "yep",
247      "ok",
248      "okay",
249      "sure",
250      "right",
251      "nothing", "none", "pass", "skip", "na", "n/a",
252  }
```

**After**:
```python
238  _ACK_ONLY_ASSISTANT_RE = re.compile(
239      r"^\s*(?:okay|ok|got it|sure|right|yeah|yes|thanks|thank you|makes sense|that makes sense)[,.\s]*$",
240      re.IGNORECASE,
241  )
```

**Note**: Line numbers will shift after this deletion.

**Verification**:
```bash
grep "_MEANINGFUL_SHORT_ANSWERS" interview/agent_runtime.py
# Should return NOTHING
```

**Checkpoint**: [ ] _MEANINGFUL_SHORT_ANSWERS constant removed

---

### Task 1.5: Remove Dead Function _normalized_short_answer() (Lines 297-298)

**Current Line Numbers** (after prior deletions, they'll shift):

**File**: `interview/agent_runtime.py`  
**Action**: Delete dead function  
**Before**:
```python
297  def _normalized_short_answer(text: str) -> str:
298      return re.sub(r"[^a-z0-9/]+", "", (text or "").strip().lower())
299  
300  def _is_tiny_fragment(text: str) -> bool:
```

**After** (only _is_tiny_fragment remains, will delete next):
```python
300  def _is_tiny_fragment(text: str) -> bool:
```

**Verification**:
```bash
grep "_normalized_short_answer" interview/agent_runtime.py
# Should return NOTHING (only dead _is_tiny_fragment was calling it)
```

**Checkpoint**: [ ] _normalized_short_answer() removed

---

### Task 1.6: Remove Dead Function _is_tiny_fragment() (Lines 299-301)

**File**: `interview/agent_runtime.py`  
**Action**: Delete dead function

**Before**:
```python
299  def _is_tiny_fragment(text: str) -> bool:
300      words = [w for w in (text or "").strip().split() if w]
301      return len(words) <= 3 and _normalized_short_answer(text) not in _MEANINGFUL_SHORT_ANSWERS
302  
```

**After** (function deleted, next line is the regex pattern definition):
```python
# (previous: _ACK_ONLY_ASSISTANT_RE, next: _GREETING_ECHO_RE or similar)
```

**Verification**:
```bash
grep "_is_tiny_fragment" interview/agent_runtime.py
# Should return NOTHING
```

**Also verify no orphaned imports**:
```bash
grep "MEANINGFUL" interview/agent_runtime.py
# Should return NOTHING (we deleted the constant in 1.4)
```

**Checkpoint**: [ ] _is_tiny_fragment() removed

---

### Task 1.7: Remove Dead Function _sanitize_topic_title_for_speech() (Lines 310-326)

**File**: `interview/agent_runtime.py`  
**Action**: Delete dead function

**Before** (approx. lines 310-326, numbers shifted after prior deletions):
```python
310  def _sanitize_topic_title_for_speech(title: str) -> str:
311      """Clean a topic title for spoken delivery.
312      - Strip trailing parenthetical fragments and acronym tails like
313        "(MLSC), GRIET" so the agent says "Tech Lead" not "Tech Lead microsoft
314        Learn Student Club (MLSC), GRIET".
315      - Collapse internal whitespace.
316      """
317      if not title:
318          return ""
319      # Drop everything after the first comma (work-history rows like
320      # "Tech Lead - microsoft Learn Student Club (MLSC), GRIET" pollute speech)
321      cleaned = title.split(",", 1)[0]
322      # Remove any parenthetical chunks.
323      cleaned = re.sub(r"\s*\([^)]*\)\s*", " ", cleaned)
324      # Collapse whitespace.
325      cleaned = re.sub(r"\s+", " ", cleaned).strip()
326      return cleaned
327  
328  def _build_secondary_directive(secondary: dict, *, job_title: str) -> str:
```

**After**:
```python
310  def _build_secondary_directive(secondary: dict, *, job_title: str) -> str:
```

**Verification**:
```bash
grep "_sanitize_topic_title_for_speech" interview/agent_runtime.py
# Should return NOTHING
```

**Checkpoint**: [ ] _sanitize_topic_title_for_speech() removed

---

## Priority 2: Consolidation (Medium Effort, Higher Value)

### Task 2.1: Consolidate Duplicate Normalization Functions

**File**: `interview/agent_runtime.py`

**Current State** (before Priority 1 deletions):
- `_topic_short_key_for_ordering()` at line 305-308
- `_normalize_topic_key()` at line 1976-1977
- Both normalize to same pattern: `re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()`

**Action**: Consolidate into one function

**Step 2.1.1**: Replace `_topic_short_key_for_ordering()` with:

```python
def _normalize_topic_key(text: str, short_form: bool = True) -> str:
    """Normalize text to lowercase alphanumeric + spaces.
    
    Args:
        text: Input text, optionally in format "Title - Description [tech]"
        short_form: If True, extract only the part before ' - ' (default True)
    
    Returns:
        Normalized key suitable for dedup and lookup
    """
    base = _topic_short_title(text) if short_form else (text or "")
    return re.sub(r"[^a-z0-9]+", " ", base.lower()).strip()
```

**Step 2.1.2**: Replace old `_topic_short_key_for_ordering()` with an alias:

```python
# Backward compatibility alias
_topic_short_key_for_ordering = _normalize_topic_key
```

**Step 2.1.3**: Update the 5 call sites that use `_normalize_topic_key(..., short_form=False)`:

Search for patterns like:
```python
_normalize_topic_key(_scoring_topic_key)  # Keep as-is (uses default short_form=True)
_normalize_topic_key(_old_key)  # Keep as-is
```

No changes needed — existing calls continue to work since the parameter defaults to `True`.

**Verification**:
```bash
# Ensure both names resolve correctly
grep "_topic_short_key_for_ordering\|_normalize_topic_key" interview/agent_runtime.py | wc -l
# Should still have same call count (no calls removed/broken)

# Run a quick type check if available
python -m py_compile interview/agent_runtime.py
```

**Checkpoint**: [ ] Normalization functions consolidated

---

### Task 2.2: Extract Repeated Regex Pattern

**File**: `interview/agent_runtime.py`

**Current Repetitions** (8+ inline uses):
```python
re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()
```

**Action**: Create utility function

**Step 2.2.1**: Add new utility function (near other helpers, around line 300):

```python
def _normalize_alphanumeric(text: str) -> str:
    """Convert text to lowercase alphanumeric characters and spaces only.
    
    Useful for: query normalization, key generation, fuzzy matching.
    """
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()
```

**Step 2.2.2**: Replace inline uses at:
- Line 1988 (in `_candidate_meta_intent`)
- Line 2179 (in `_apply_eval_result`)
- Line 2615 (in `_process_user_conversation_item`)
- Line 3179 (in `on_conversation_item_added`)
- Line 3208 (in `on_conversation_item_added`)
- Line 3313 (in `on_conversation_item_added`)

**Example replacement**:
```python
# BEFORE
t = re.sub(r"\s+", " ", (text or "").lower()).strip()

# AFTER
t = _normalize_alphanumeric(text)
```

**Verification**:
```bash
# Count remaining inline uses of the pattern
grep -n 're.sub.*\[^a-z0-9\]' interview/agent_runtime.py | wc -l
# Should be down to just the main definition in _normalize_alphanumeric()
```

**Checkpoint**: [ ] Regex pattern extracted to utility

---

## Post-Cleanup Verification

### Task 3.1: Run Type Check

```bash
cd c:/Users/vamsi/OneDrive/Documents/SreevaAI
python -m py_compile interview/agent_runtime.py
# Should succeed with no syntax errors
```

**Checkpoint**: [ ] Syntax check passes

---

### Task 3.2: Search for Dead References

```bash
# Verify no remaining references to deleted items
grep -E "_normalized_short_answer|_is_tiny_fragment|_sanitize_topic_title_for_speech|_MEANINGFUL_SHORT_ANSWERS|import re as _re|AgentSessionUsage" interview/agent_runtime.py
# Should return NOTHING (or only the alias, which is OK)
```

**Checkpoint**: [ ] No dead references remain

---

### Task 3.3: Verify Imports Still Work

```bash
cd c:/Users/vamsi/OneDrive/Documents/SreevaAI
python -c "from interview.agent_runtime import entrypoint; print('✓ Import successful')"
```

**Checkpoint**: [ ] Imports work correctly

---

### Task 3.4: Count Lines Removed

```bash
# Get final line count
wc -l interview/agent_runtime.py
# Should be approximately 3,975 - 65 = 3,910 lines
```

**Checkpoint**: [ ] ~65 lines removed

---

### Task 3.5: Run Tests (if available)

```bash
# Run the test suite (adjust path as needed)
pytest tests/ -v --tb=short
# Should pass with same results as before
```

**Checkpoint**: [ ] All tests pass

---

## Summary Table

| Priority | Task | Lines | Impact | Done |
|----------|------|-------|--------|------|
| 1 | Remove `import re as _re` | 1 | Zero risk | [ ] |
| 1 | Update line 80: `re.sub()` | 1 | Zero risk | [ ] |
| 1 | Remove `AgentSessionUsage` import | 1 | Zero risk | [ ] |
| 1 | Remove `_MEANINGFUL_SHORT_ANSWERS` | 11 | Zero risk | [ ] |
| 1 | Remove `_normalized_short_answer()` | 2 | Zero risk | [ ] |
| 1 | Remove `_is_tiny_fragment()` | 3 | Zero risk | [ ] |
| 1 | Remove `_sanitize_topic_title_for_speech()` | 17 | Zero risk | [ ] |
| **Priority 1 Total** | **7 deletions** | **~36 lines** | **~0% risk** | |
| 2 | Consolidate normalization functions | ~10 lines | Low risk | [ ] |
| 2 | Extract regex pattern utility | ~15 lines | Low risk | [ ] |
| **Priority 2 Total** | **2 consolidations** | **~25 lines** | **~5% risk** | |
| 3 | Syntax/import verification | - | Validation | [ ] |
| 3 | Test suite verification | - | Validation | [ ] |
| **Priority 3 Total** | **2 verifications** | - | - | |

---

## Implementation Order

1. **Complete Priority 1** (all 7 deletions) — these are mechanical removals
2. **Verify after Priority 1** (quick checks: syntax, grep for dead refs)
3. **Complete Priority 2** (consolidations) — slightly more complex
4. **Verify after Priority 2** (syntax check, run tests)
5. **Final validation** (full test suite, if available)

---

## Rollback Plan

If anything breaks after cleanup:

```bash
# Revert to HEAD (assuming uncommitted changes)
git checkout interview/agent_runtime.py

# OR if committed
git revert <commit-sha>
```

---

## Estimated Timing

- **Priority 1**: 15 minutes (straightforward deletions)
- **Priority 2**: 15 minutes (find/replace + verification)
- **Verification**: 10 minutes (syntax checks + tests)
- **Total**: ~40 minutes

**Risk**: **MINIMAL** — all removed code is provably dead (never called, never referenced).

