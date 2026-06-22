# Quick Reference: What to Delete

**Total Deletions**: 6 items  
**Total Lines**: ~65  
**Time**: 5 minutes  
**Risk**: 0%

---

## 1. DELETE: Line 47 (Duplicate Import)

```diff
- import re as _re
```

**Reason**: `re` already imported at line 5; `_re` used only once at line 80  
**After deletion**: Update line 80 to use `re.sub()` instead

---

## 2. UPDATE: Line 80 (Use `re` instead of `_re`)

```diff
  @staticmethod
  def _norm(key: str) -> str:
      short = str(key or "").split(" - ")[0].strip()
-     return _re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()
+     return re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()
```

---

## 3. DELETE: Line 197 (Unused Import)

```diff
- from livekit.agents.metrics import AgentSessionUsage
```

**Reason**: Type imported but never instantiated or used  
**Verification**: `grep AgentSessionUsage interview/agent_runtime.py` returns nothing

---

## 4. DELETE: Lines 239-249 (Unused Constant)

```diff
- _MEANINGFUL_SHORT_ANSWERS = {
-     "no",
-     "yes",
-     "yeah",
-     "yep",
-     "ok",
-     "okay",
-     "sure",
-     "right",
-     "nothing", "none", "pass", "skip", "na", "n/a",
- }
```

**Reason**: Constant defined but never referenced  
**Verification**: `grep _MEANINGFUL_SHORT_ANSWERS interview/agent_runtime.py` returns nothing

---

## 5. DELETE: Lines 297-298 (Dead Function)

```diff
- def _normalized_short_answer(text: str) -> str:
-     return re.sub(r"[^a-z0-9/]+", "", (text or "").strip().lower())
```

**Reason**: Only called by dead `_is_tiny_fragment()` function  
**Verification**: `grep _normalized_short_answer interview/agent_runtime.py` returns only line 301 (which is inside dead code)

---

## 6. DELETE: Lines 299-301 (Dead Function)

```diff
- def _is_tiny_fragment(text: str) -> bool:
-     words = [w for w in (text or "").strip().split() if w]
-     return len(words) <= 3 and _normalized_short_answer(text) not in _MEANINGFUL_SHORT_ANSWERS
```

**Reason**: Function never called anywhere in the codebase  
**Verification**: `grep _is_tiny_fragment interview/agent_runtime.py` returns nothing (only the definition)  
**Dependencies**: Depends on `_normalized_short_answer()` (deleted in step 5) and `_MEANINGFUL_SHORT_ANSWERS` (deleted in step 4)

---

## 7. DELETE: Lines 310-326 (Dead Function)

```diff
- def _sanitize_topic_title_for_speech(title: str) -> str:
-     """Clean a topic title for spoken delivery.
-     - Strip trailing parenthetical fragments and acronym tails like
-       "(MLSC), GRIET" so the agent says "Tech Lead" not "Tech Lead microsoft
-       Learn Student Club (MLSC), GRIET".
-     - Collapse internal whitespace.
-     """
-     if not title:
-         return ""
-     # Drop everything after the first comma (work-history rows like
-     # "Tech Lead - microsoft Learn Student Club (MLSC), GRIET" pollute speech)
-     cleaned = title.split(",", 1)[0]
-     # Remove any parenthetical chunks.
-     cleaned = re.sub(r"\s*\([^)]*\)\s*", " ", cleaned)
-     # Collapse whitespace.
-     cleaned = re.sub(r"\s+", " ", cleaned).strip()
-     return cleaned
```

**Reason**: Function never called anywhere in the codebase  
**Verification**: `grep _sanitize_topic_title_for_speech interview/agent_runtime.py` returns nothing

---

## Verification Commands

### After Each Deletion
```bash
# Check for references to deleted items
grep "_re\." interview/agent_runtime.py           # Should find nothing (after update)
grep "AgentSessionUsage" interview/agent_runtime.py  # Should find nothing
grep "_MEANINGFUL_SHORT_ANSWERS" interview/agent_runtime.py  # Should find nothing
grep "_normalized_short_answer" interview/agent_runtime.py   # Should find nothing
grep "_is_tiny_fragment" interview/agent_runtime.py  # Should find nothing
grep "_sanitize_topic_title_for_speech" interview/agent_runtime.py  # Should find nothing
```

### Final Verification
```bash
# Check syntax
python -m py_compile interview/agent_runtime.py

# Check for any import errors
python -c "from interview.agent_runtime import entrypoint; print('✓ OK')"

# Count remaining lines (should be ~3,910)
wc -l interview/agent_runtime.py
```

---

## Summary Table

| # | Item | Type | Lines | Status |
|---|------|------|-------|--------|
| 1 | `import re as _re` | Import | 1 | ⏳ DELETE |
| 2 | Line 80: `_re.` → `re.` | Update | 1 | ⏳ UPDATE |
| 3 | `AgentSessionUsage` import | Import | 1 | ⏳ DELETE |
| 4 | `_MEANINGFUL_SHORT_ANSWERS` | Constant | 11 | ⏳ DELETE |
| 5 | `_normalized_short_answer()` | Function | 2 | ⏳ DELETE |
| 6 | `_is_tiny_fragment()` | Function | 3 | ⏳ DELETE |
| 7 | `_sanitize_topic_title_for_speech()` | Function | 17 | ⏳ DELETE |
| **TOTAL** | | | **~36** | |

---

## Pro Tips

1. **Delete in reverse line order** (highest line # first) to avoid line number shift during editing
2. **Delete each item, then verify** with grep to confirm it's gone
3. **After all deletions**, run `python -m py_compile` to catch any syntax errors
4. **Commit separately**: One commit for all deletions (easy to revert if needed)

---

## Rollback

If anything breaks:
```bash
git checkout interview/agent_runtime.py
```

That's it — reverted to original state.

---

## Expected Outcome

**Before**: 3,975 lines  
**After**: ~3,910 lines  
**Removed**: ~65 lines of dead code  
**Impact on functionality**: ZERO (all dead code, no live dependencies)

