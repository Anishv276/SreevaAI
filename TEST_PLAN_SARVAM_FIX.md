# Test Plan: Sarvam TTS WebSocket Fix

## Pre-Test Checklist

Before running an interview, verify:

```bash
# 1. Check Sarvam API key is set
echo "SARVAM_API_KEY length: ${#SARVAM_API_KEY} chars"
# Should print: "SARVAM_API_KEY length: 32 chars" (or similar non-zero length)

# 2. Verify the fixes are in place
grep -n "TTS_THROTTLE\|TTS_SARVAM_ERROR" interview/agent_runtime.py
# Should show the new error handling code

# 3. Make sure you have the latest code
git log --oneline -n 3
# Should show commit cbc399d "Fix Sarvam TTS WebSocket connection failures"
```

## Running the Test Interview

### Step 1: Start Interview Agent
```bash
python -m interview.agent_runtime \
  --app-id=test-sarvam-fix \
  --room-id=test-room \
  --candidate-name="Test Candidate"
```

### Step 2: Run Interview (Same as Before)
- Go through the greeting and warmup phase
- Answer the first 3-4 questions normally

### Step 3: Monitor Logs

Watch for these indicators:

✅ **Good Signs** (TTS Working):
```
[SARVAM_TTS] Initializing TTS: model=bulbul:v3 language=en-IN api_key_len=32
[TTS] Streamed 3 sentence(s) via WebSocket
[TTS_THROTTLE] Waiting 150ms before TTS (previous gap=50ms)
```

❌ **Bad Signs** (TTS Failing):
```
ERROR Error in send task: Cannot write to closing transport
failed to synthesize speech: TTS stream failed
ERROR TTS connection failure without retry exhaustion
```

## What to Verify

### Turn-by-Turn Verification

| Turn | What Happens | Expected | Status |
|------|--------------|----------|--------|
| 1 | Greeting | Hear "Hi, I'm Ishita..." | ✓ |
| 2 | Warmup question | Hear question | ✓ |
| 3 | Candidate answers | Evaluation happens | ✓ |
| 3 | Agent response | **Hear follow-up question immediately** (was: might work) | ✓ |
| 4 | Candidate answers | Answer captured, eval happens | ✓ |
| 4 | Agent response | **Hear next question immediately** (was: SILENT 6+ sec) | ✓ |
| 5+ | Continues normally | All questions heard | ✓ |

### Key Test: Did You Have to Say "Can you hear me?"

**Before Fix:**
- Turn 4 → 6+ second silence
- You say "Can you hear me?" as a workaround
- Then system continues

**After Fix:**
- Turn 4 → Immediate response
- You never need to say "Can you hear me?"
- Interview flows naturally

## Detailed Log Analysis

### Turn 3 Logs (Should See)
```
00:09:38 [STT_CONSOLIDATED] turn=3 - 1 fragments → complete utterance (sentence_complete)
00:09:38 [REDIS_EVAL] ✓ EVAL WORKER ACTIVATED — first payload pushed turn=3
00:09:42 [EVAL] turn=3 action=PROBE quality=1.2
00:09:39 [TTS] Streamed 2 sentence(s) via WebSocket          ← Agent speaking
00:09:44 Generation complete event received                  ← TTS finishes
```

### Turn 4 Logs (Critical)

**Before Fix:**
```
00:10:20 [STT_CONSOLIDATED] turn=4 - 1 fragments → complete utterance (timeout)
00:10:20 [REDIS_EVAL] ✓ EVAL WORKER ACTIVATED — first payload pushed turn=4
00:10:22 [TTS] Streamed 3 sentence(s) via WebSocket
00:10:22 ERROR livekit.sarvam Error in send task: Cannot write to closing transport ✗
00:10:22 WARNING failed to synthesize speech: TTS stream failed, retrying in 0.1s
00:10:22 WARNING failed to synthesize speech: TTS stream failed, retrying in 2.0s
00:10:24 WARNING failed to synthesize speech: TTS stream failed, retrying in 2.0s
00:10:26 [TTS] Stream interrupted/closed during generation                ✗
```

**After Fix:**
```
00:10:20 [STT_CONSOLIDATED] turn=4 - 1 fragments → complete utterance (timeout)
00:10:20 [REDIS_EVAL] ✓ EVAL WORKER ACTIVATED — first payload pushed turn=4
00:10:20 [TTS_THROTTLE] Waiting 150ms before TTS (previous gap=50ms)    ← NEW
00:10:20 [TTS] Streamed 3 sentence(s) via WebSocket
00:10:22 Generation complete event received                              ← TTS SUCCESS ✓
00:10:26 [TRANSCRIPT] Interviewer: [next question appears here]
```

## If Test Fails (Still Seeing Silence)

### Diagnosis Steps

**1. Check if SARVAM_API_KEY is valid**
```bash
# Verify API key exists
if [ -z "$SARVAM_API_KEY" ]; then
  echo "ERROR: SARVAM_API_KEY not set"
  exit 1
fi

# Verify length (should be 30+ chars)
if [ ${#SARVAM_API_KEY} -lt 10 ]; then
  echo "ERROR: SARVAM_API_KEY too short"
  exit 1
fi

echo "SARVAM_API_KEY appears valid (${#SARVAM_API_KEY} chars)"
```

**2. Check if agent code has fixes**
```bash
# Look for connection throttling code
grep -A 5 "_tts_last_connection_time" interview/agent_runtime.py

# Should output something like:
# if not hasattr(self, '_tts_last_connection_time'):
#     self._tts_last_connection_time = current_time
```

**3. Check Sarvam service status**
- Visit: https://status.sarvam.ai
- Verify TTS service is "Operational" (green)

**4. Check if you're hitting rate limits**
```bash
# Look for rate limit messages in logs
grep -i "rate\|limit\|quota" agent.log

# If you see rate limit messages:
# - Wait 5-10 minutes
# - Try again
# - Contact Sarvam support if persistent
```

**5. Test Sarvam connection directly**
```bash
curl -X POST https://api.sarvam.ai/websocket \
  -H "Api-Subscription-Key: $SARVAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"config", "data":{"target_language_code":"en-IN", "speaker":"shubh"}}'

# Should NOT return connection error
```

## Success Criteria

✅ **Interview completes successfully when:**

1. **Hear all agent questions** - No silent turns after turn 3
2. **No workarounds needed** - Don't have to say "Can you hear me?"
3. **Natural flow** - Agent responds within 2-3 seconds of your answer
4. **Clean logs** - No "Cannot write to closing transport" errors
5. **Throttle logs present** - See `[TTS_THROTTLE]` messages

## Performance Expectations

| Metric | Value | Notes |
|--------|-------|-------|
| First response | 5-6 sec | Normal (LLM + TTS time) |
| Subsequent responses | 2-3 sec | Normal (evaluation + LLM + TTS) |
| Max silence | 1-2 sec | TTS timeout/retry (if it fails) |
| No silence | ✓ | Should be the normal case |

## If You Find Bugs

Document and report:
```
1. What turn did it fail on?
2. What did you say?
3. What error appears in logs?
4. Copy relevant 10 lines before/after error
5. Your SARVAM_API_KEY length (don't share the key itself)
```

## Rollback (If Needed)

If the fix breaks something:
```bash
# Revert to previous commit
git revert cbc399d

# Or go back to before the fix
git reset --hard HEAD~1
```

---

**Ready to test?** Run a live interview and report back!
