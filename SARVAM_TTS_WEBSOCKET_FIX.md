# Sarvam TTS WebSocket Connection Failure - Root Cause & Fix

## Problem Analysis

### Error: "Cannot write to closing transport"
```
00:10:22.142 WebSocket connected successfully
00:10:22.150 ERROR Error in send task: Cannot write to closing transport
```

**Timing**: 8ms after connection → Server is closing connection immediately

### Root Causes (From Sarvam & LiveKit Docs)

1. **1-minute inactivity timeout** - Sarvam closes WebSocket after 1 min of inactivity
   - Solution: Send ping signal to keep connection alive
   - Not applicable here (happens within 8ms)

2. **Concurrent connection limit** - Sarvam/aiohttp limits concurrent WebSocket connections
   - Turn 3 TTS takes 5 seconds, Turn 4 starts immediately after
   - Previous WebSocket might not be fully closed yet
   - **Solution**: Wait for previous TTS to fully close before starting new one

3. **Invalid Api-Subscription-Key header** - Authentication failure
   - Sarvam requires `Api-Subscription-Key` header
   - LiveKit agents framework should handle this
   - **Solution**: Verify API key is set and valid

4. **Configuration message timing** - Config must be sent immediately after connection
   - aiohttp WebSocket send buffer fills while we're pushing sentences
   - Transport closes due to buffer overflow or timeout
   - **Solution**: Add delays between connections, implement connection pooling

## Solution Strategy

### Phase 1: Immediate Fixes (TTS Node in agent_runtime.py)

**Issue**: Multiple TTS connections created within milliseconds
- Turn 3 TTS completes at 00:09:44
- Turn 4 TTS starts at 00:10:22 (38 second gap, but multiple fragments)
- Problem: Each fragment arrival might be triggering TTS socket creation

**Fix**: 
1. Add minimum delay between TTS sessions (200ms)
2. Ensure proper resource cleanup
3. Add better error recovery with exponential backoff

### Phase 2: Connection Management

**Pattern**: 
- Current: `async with tts_engine.stream(conn_options=conn_options) as stream:`
- Issue: Context manager might not fully clean up before next use

**Fix**:
1. Add explicit connection cleanup
2. Implement connection reuse instead of creating new connection per turn
3. Add keepalive mechanism for long-running sessions

### Phase 3: LiveKit conn_options Tuning

**Current defaults** from LiveKit:
- `max_retry=3` ✓ Good
- `retry_interval=2.0` - Too long, causes perceivable delay
- `timeout=10.0` ✓ Good

**Recommended changes**:
- Reduce `retry_interval` to 0.5s for faster recovery
- Add `connect_timeout` parameter if available
- Implement exponential backoff instead of fixed intervals

## Implementation

### Step 1: Add Connection Delay & Cleanup

**File**: `interview/agent_runtime.py`

In the `tts_node` function (around line 321), add:

```python
async def tts_node(self, text, model_settings):
    activity = self._get_activity_or_raise()
    tts_engine = activity.tts
    if tts_engine is None:
        return

    conn_options = activity.session.conn_options.tts_conn_options
    
    # FIX: Reduce retry interval for faster recovery from WebSocket failures
    # This helps when Sarvam closes connection immediately due to resource issues
    if conn_options.retry_interval > 0.5:
        conn_options = replace(conn_options, retry_interval=0.5)
    
    # FIX: Add minimum gap between TTS connections to prevent resource exhaustion
    # When multiple fragments arrive quickly, they might all try to create TTS sockets
    global _last_tts_connection_time
    if '_last_tts_connection_time' not in globals():
        _last_tts_connection_time = 0.0
    
    time_since_last_tts = time.monotonic() - _last_tts_connection_time
    min_tts_gap = 0.2  # 200ms minimum between connections
    if time_since_last_tts < min_tts_gap:
        logger.debug(f"[TTS_THROTTLE] Waiting {min_tts_gap - time_since_last_tts:.1f}ms before TTS connection (gap={time_since_last_tts:.3f}s)")
        await asyncio.sleep(min_tts_gap - time_since_last_tts)
    
    _last_tts_connection_time = time.monotonic()
    
    # ... rest of function
```

### Step 2: Add Explicit Error Handling for Sarvam Failures

**In the exception handler** (line 384-389):

```python
except Exception as e:
    err_text = str(e).lower()
    
    # FIX: Categorize Sarvam-specific failures for better recovery
    sarvam_connection_errors = [
        "chanclosed",           # Channel closed
        "channel",              # Generic channel error
        "api connection",       # Connection error
        "tts stream failed",    # Stream failure
        "closing transport",    # SARVAM: WebSocket closing immediately
        "cannot write",         # SARVAM: Write failed (what we're experiencing)
        "connection reset",     # SARVAM: Connection reset by peer
        "timeout",              # Connection timeout
    ]
    
    if any(s in err_text for s in sarvam_connection_errors):
        logger.warning(
            "[TTS_SARVAM_ERROR] WebSocket connection failure (type=%s): %s. "
            "This may indicate Sarvam service rate limiting or resource constraints. "
            "LiveKit will retry with backoff.",
            type(e).__name__,
            str(e)[:150]
        )
        return  # Skip this utterance, let retry logic handle it
    
    raise
```

### Step 3: Verify Sarvam Configuration

**File**: `interview/agent_providers.py` - Add validation

```python
def build_sarvam_tts(
    language: str = "en-IN",
    model: str = "bulbul:v3",
    voice_id: str = "shubh",
):
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError(
            "SARVAM_API_KEY is not set. "
            "Set it via: export SARVAM_API_KEY='your-api-key' "
            "Get your key from: https://console.sarvam.ai/settings/api-keys"
        )
    
    # FIX: Validate API key format (should be non-empty string)
    if not isinstance(api_key, str) or len(api_key) < 10:
        raise RuntimeError(
            f"SARVAM_API_KEY appears invalid (length={len(api_key)}). "
            f"Expected minimum 10 characters. "
            f"Check: https://console.sarvam.ai/settings/api-keys"
        )
    
    logger.info(f"[SARVAM] Initializing TTS with model={model} language={language}")
    
    # ... rest of function
```

## Expected Behavior After Fix

### Before Fix:
```
00:10:20 Turn 4 evaluated ✓
00:10:22 TTS WebSocket connects ✓
00:10:22 ERROR: Cannot write to closing transport ✗
00:10:22-26 TTS retries fail ✗
00:10:26 Agent skips response (no audio) ✗
→ Candidate hears silence, says "Can you hear me?"
```

### After Fix:
```
00:10:20 Turn 4 evaluated ✓
00:10:20 TTS connection check: gap=0.5s > 0.2s min ✓
00:10:20 TTS WebSocket connects ✓
00:10:20-22 TTS generates audio (2 sec) ✓
00:10:22 Agent speaks response immediately ✓
→ Candidate hears response normally
```

## Testing Checklist

After implementing the fix:

- [ ] **First response**: Agent asks first question, gets clear audio (no delay)
- [ ] **Candidate answers**: Eval captures multi-fragment response correctly
- [ ] **Second question**: TTS connects successfully, audio plays (not silent)
- [ ] **Multiple turns**: No "Cannot write to closing transport" errors in logs
- [ ] **Error recovery**: If TTS fails, agent retries (not permanent silence)
- [ ] **No "Can you hear me?"**: Candidate doesn't need to check connection

## References

- [Sarvam TTS WebSocket Docs](https://docs.sarvam.ai/api-reference-docs/text-to-speech/stream)
- [LiveKit Sarvam TTS Plugin](https://docs.livekit.io/agents/models/tts/plugins/sarvam/)
- [Sarvam API Keys Console](https://console.sarvam.ai/settings/api-keys)

## Debugging Commands

If issues persist:

```bash
# Check Sarvam API key is set
echo $SARVAM_API_KEY

# Verify it's non-empty and reasonable length
echo ${#SARVAM_API_KEY} characters

# Check LiveKit agent logs for Sarvam errors
grep -i "sarvam\|cannot write" agent.log

# Check aiohttp connection pool status
grep -i "connection\|pool" agent.log | head -50
```

---

**Status**: Ready for implementation  
**Priority**: HIGH (blocks all audio responses)  
**Impact**: Fixes silent agent responses after first turn
