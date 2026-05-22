# FIX PLAN - STT FRAGMENTS, MOVE_ON, TRANSCRIPT CHUNKING

## Issues to Fix

### 1. **STT Fragment Concatenation**
- **Problem**: Multiple STT events arrive for single utterance (partial results)
- **Current**: Each fragment processed separately, labeled with same turn_count
- **Fix**: Buffer fragments until final result, concatenate, then process once

### 2. **MOVE_ON Not Applied Immediately**
- **Problem**: Eval decides MOVE_ON but agent doesn't move to next topic until 2+ turns later
- **Current**: new_active_topic is returned but not applied before next question
- **Fix**: Apply new_active_topic immediately to affect next AI question

### 3. **Transcript Chunking**
- **Problem**: Candidate responses saved as multiple fragment lines
- **Current**: Each STT fragment appended separately to transcript
- **Fix**: Build complete candidate response from all fragments, save as single line

### 4. **Greeting/Warmup Not Stored**
- **Problem**: Initial candidate responses (greeting echoes, warmup replies) not captured
- **Current**: Filtered out by various guards
- **Fix**: Capture first real candidate response after greeting

## Implementation Strategy

### Part A: STT Fragment Buffering

Add to agent_runtime.py:
```python
# STT Fragment buffer (per candidate turn)
_stt_fragment_buffer: dict[str, list[str]] = {}  # turn_id → [fragment1, fragment2, ...]
_stt_final_received: dict[str, bool] = {}  # turn_id → is_final

def _get_stt_buffer_key(turn: int) -> str:
    return f"turn_{turn}_{time.monotonic()}"

async def _collect_and_process_stt_fragment(turn: int, content: str, is_final: bool):
    # Buffer this fragment
    # If final, concatenate all fragments and process
    # If not final, just buffer and return (wait for more)
```

### Part B: Apply new_active_topic to Agent

Modify _read_and_apply_eval_result to:
```python
_active_topic = result.get("new_active_topic", _active_topic)
logger.info("[TOPIC_CHANGE] Applied new_active_topic=%s (was=%s)", _active_topic, old_topic)

# Apply to next LLM call context immediately
remove_system_messages(chat_ctx, "[TOPIC_DIRECTIVE]")
if _active_topic:
    chat_ctx.add_message(
        role="system",
        content=f"[TOPIC_DIRECTIVE - DO NOT SAY ALOUD]\nFocus next question on: {_active_topic}"
    )
```

### Part C: Consolidate Transcript Lines

Modify append_transcript_line to:
```python
def append_consolidated_transcript_line(speaker: str, fragments: list[str]):
    consolidated = " ".join(f.strip() for f in fragments if f.strip())
    if consolidated:
        transcript_lines.append({
            "speaker": speaker,
            "timestamp": time.time() - session_start_time,
            "content": consolidated,
            "fragment_count": len(fragments),
        })
```

### Part D: Capture Greeting/Warmup

Remove filters that block early candidate turns:
```python
# Don't block candidate responses during warmup
# Just mark them as warmup_phase=True in transcript
```

## Files to Modify

1. **interview/agent_runtime.py**
   - Add STT fragment buffering
   - Fix _read_and_apply_eval_result to apply new_active_topic
   - Fix transcript line appending
   - Remove greeting/warmup filters

2. **interview/agent_persistence.py**
   - Update persist_transcript to handle fragment_count

## Expected Results After Fix

### Transcript Format
```
AI (00:12)
Hi Vamsi, really glad we could connect today...

Candidate (00:50)
I built everything on my own. (3 fragments concatenated)

AI (01:04)
Got it, you built the whole system yourself...

Candidate (01:13-01:34)
Use Meta API, Gmail API, and the help of... (6 fragments → 1 line)
```

### Log Output
```
[STT_BUFFER] turn=4 fragment_1: "Use Meta API, Gmail API, and"
[STT_BUFFER] turn=4 fragment_2: "the help of I I'm"
[STT_BUFFER] turn=4 fragment_3: "mean, did I build a multi source..."
[STT_BUFFER] turn=4 FINAL - concatenated 3 fragments: "Use Meta API, Gmail API, and the help of..."
[TRANSCRIPT] Candidate (consolidated): "Use Meta API, Gmail API, and the help of..."
[EVAL] Processing turn=4 (final result, not fragment)

Turn 6: action=MOVE_ON → next=Sensex Analysis Project
[TOPIC_CHANGE] Applied new_active_topic=Sensex Analysis Project
[PROMPT_UPDATE] Next question will focus on Sensex Analysis Project

Turn 7: ✅ Q about Sensex Analysis Project (IMMEDIATE topic change)
```

### Benefits
- ✅ Transcript: single consolidated line per candidate turn
- ✅ Eval: processes only final STT result, not fragments
- ✅ Topic change: applied within same turn, affects next question immediately
- ✅ Greeting/Warmup: captured in transcript
- ✅ Clean logs: no duplicate turn processing

## Implementation Order
1. Add STT buffering logic
2. Fix eval result application
3. Fix transcript consolidation
4. Remove early filters
5. Test with live interview
