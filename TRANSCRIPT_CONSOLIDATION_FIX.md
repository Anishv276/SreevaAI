# Transcript Consolidation Fix - Multiple Utterances per Turn

## The Problem You Had

Your transcript showed **two separate "Candidate 1:37" lines** for the same turn:

```
Candidate 1:37
Used I'm using We'll be having webhook triggers. I did, I used webhook trigger, 
and I pasted those webhook triggers web hook URLs in applications. Whatever the 
email or we'll give you permissions there in meta application. The or whatever 
the message that is being in Facebook or Instagram then will be triggered using 
this playbook. And, yeah, use LLM

Candidate 1:37
generating reply to specific people.
```

**What you want:**
```
Candidate 1:37
Used I'm using We'll be having webhook triggers. I did, I used webhook trigger, 
and I pasted those webhook triggers web hook URLs in applications. Whatever the 
email or we'll give you permissions there in meta application. The or whatever 
the message that is being in Facebook or Instagram then will be triggered using 
this playbook. And, yeah, use LLM generating reply to specific people.
```

## Root Cause

**Pause Detection in Speech:**
```
00:10:18.885 - Last fragment: "And, yeah, use LLM"
00:10:19.833 - PAUSE DETECTED (no speech for ~1 second) ⏸️
00:10:20.163 - New fragment arrives: "generating reply..."
```

LiveKit's voice detection treats pauses as **separate utterances within the same turn**:
1. Utterance 1 (with pause) → Processed → Saved to transcript
2. Utterance 2 (after pause) → Processed → Saved as NEW line (same turn!)

**Result**: Two separate transcript lines for one turn.

## The Fix (Commit: ad76d29)

### How It Works

Instead of immediately appending utterances to transcript:
```python
# OLD (WRONG):
append_transcript_line("Candidate", utterance1)  # Line 1
append_transcript_line("Candidate", utterance2)  # Line 2 (DUPLICATE!)
```

We now **accumulate and combine**:
```python
# NEW (CORRECT):
_turn_utterances[turn] = [utterance1, utterance2, ...]
# When turn changes or ends:
combined = " ".join(_turn_utterances[turn])
append_transcript_line("Candidate", combined)  # Single line
```

### Implementation Details

**1. Per-Turn Utterance Accumulator** (Line 1297-1298):
```python
_turn_utterances: dict[int, list[str]] = {}  # turn → [utterance1, utterance2, ...]
_last_transcript_turn: int = 0  # Track which turn was last appended
```

**2. Accumulation Logic** (Lines 1800-1829):
```python
# Add utterance to current turn's list
if turn_snapshot not in _turn_utterances:
    _turn_utterances[turn_snapshot] = []
_turn_utterances[turn_snapshot].append(utterance)

# When turn changes, flush previous turn:
if _last_transcript_turn != turn_snapshot:
    prev_utterances = _turn_utterances.pop(_last_transcript_turn)
    combined = " ".join(prev_utterances)
    append_transcript_line("Candidate", combined)  # Single line!

_last_transcript_turn = turn_snapshot
```

**3. Final Flush** (Lines 2445-2460):
```python
# At interview end, flush any remaining accumulated utterances
if _last_transcript_turn > 0 and _last_transcript_turn in _turn_utterances:
    final_utterances = _turn_utterances.pop(_last_transcript_turn)
    combined = " ".join(final_utterances)
    append_transcript_line("Candidate", combined)
```

## Timeline Example

### Before Fix:
```
Turn 4 arrives (utterance 1):
  [TRANSCRIPT] append "Used I'm using... use LLM" → Line saved

Pause detected, Turn 4 continues (utterance 2):
  [TRANSCRIPT] append "generating reply..." → NEW line saved (WRONG!)

Transcript has 2 lines:
  Candidate: "Used I'm using... use LLM"
  Candidate: "generating reply..."
```

### After Fix:
```
Turn 4 arrives (utterance 1):
  [TRANSCRIPT_BUFFER] turn=4 accumulated 1 utterance (buffered, not saved)

Pause detected, Turn 4 continues (utterance 2):
  [TRANSCRIPT_BUFFER] turn=4 accumulated 2 utterances (buffered, not saved)

Turn 5 arrives (different turn):
  [TRANSCRIPT_BUFFER] Flush turn 4: combine 2 utterances → save 1 line

Transcript has 1 line:
  Candidate: "Used I'm using... use LLM generating reply..."
```

## Expected Logs

### Good Signs (What You'll See):
```
[TRANSCRIPT_BUFFER] turn=4 accumulated 1 utterance(s)
[TRANSCRIPT_BUFFER] turn=4 accumulated 2 utterance(s)
[TRANSCRIPT] Candidate (turn=4, 2 utterances): Used I'm using...
[TRANSCRIPT] ✓ Single line for turn 4 (combined from 2 utterances)
```

### Bad Signs (Should NOT See):
```
[TRANSCRIPT] Candidate: Used I'm using...
[TRANSCRIPT] Candidate: generating reply...
↑ Two separate lines for same turn
```

## Impact on Your Interview

| Aspect | Before | After |
|--------|--------|-------|
| Transcript lines per turn | 2+ (fragmented) | 1 (consolidated) |
| Evaluator input | Complete utterance ✅ | Complete utterance ✅ |
| Transcript appearance | Chunky, fragmented | Clean, single lines |
| Data consistency | ❌ Multiple lines | ✅ One line per turn |
| Storage efficiency | ❌ Redundant data | ✅ Efficient |

## Evaluation Consistency

**Important**: The evaluator already receives **consolidated utterances** (from the timeout/completion fix). This ensures:
- ✅ Eval gets: "Used I'm using... use LLM generating reply..."
- ✅ Transcript gets: "Used I'm using... use LLM generating reply..."
- ✅ Consistent between eval and transcript ✅

Now the transcript lines match what evaluation processes.

## Testing

Run your next interview and verify:

✅ **Single lines per turn:**
```
Candidate (turn=4): "Used I'm using... generating reply..." [SINGLE LINE]
Candidate (turn=6): "I gave you answer..." [SINGLE LINE]
```

❌ **NOT multiple lines:**
```
Candidate (turn=4): "Used I'm using..."
Candidate (turn=4): "generating reply..."  ← Should NOT see this
```

✅ **Logs show accumulation:**
```
[TRANSCRIPT_BUFFER] turn=4 accumulated 1 utterance(s)
[TRANSCRIPT_BUFFER] turn=4 accumulated 2 utterance(s)
[TRANSCRIPT] Candidate (turn=4, 2 utterances): ...
```

## Summary of All Fixes (3 Commits)

| Fix | Commit | Problem | Solution |
|-----|--------|---------|----------|
| Sarvam TTS WebSocket | cbc399d | No audio on Turn 4+ | Add connection throttling + faster retries |
| Duplicate Evaluations | 78fcea3 | Turn eval'd 2x with conflicting signals | Increase STT timeout from 150ms → 300ms |
| Transcript Chunks | ad76d29 | Multiple lines for same turn | Accumulate & combine utterances per turn |

## Files Modified

- `interview/agent_runtime.py`
  - Lines 1297-1298: Added utterance accumulator
  - Lines 1800-1829: Modified transcript appending logic
  - Lines 2445-2460: Added final flush logic

## Ready to Test?

Run a live interview and verify:
1. ✅ All agent responses heard clearly (Sarvam fix)
2. ✅ Each turn evaluated once (timeout fix)
3. ✅ Single consolidated lines in transcript (this fix)

You should now have a clean, single-line transcript without chunks! 🎉
