# Slack Error Alerting Setup

Structured error logging to Slack for all error categories: login, resume upload, LiveKit, interviews, etc.

## Environment Setup

Add these to your `.env.local`:

```env
# Slack Incoming Webhook URL (create at https://api.slack.com/apps)
SLACK_ERROR_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Slack channel for error alerts (optional, defaults to #debug-alerts)
SLACK_ERROR_CHANNEL=#debug-alerts
```

### Getting the Slack Webhook URL

1. Go to https://api.slack.com/apps
2. Create a new app or select existing one
3. Go to **Incoming Webhooks** → Enable
4. Click **Add New Webhook to Workspace**
5. Select channel and authorize
6. Copy the webhook URL into `.env.local`

---

## TypeScript (Next.js Routes)

### Login Error Example

File: `app/api/auth/login/route.ts`

```typescript
import { logLoginAttempt } from '@/lib/slack-error-logger';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    
    // Authenticate...
    const user = await authenticateUser(email, password);
    
    if (!user) {
      await logLoginAttempt({
        userId: 'unknown',
        email,
        success: false,
        reason: 'Invalid credentials or account not found',
      });
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    
    // Log successful login (console only, no Slack spam)
    await logLoginAttempt({
      userId: user.id,
      email,
      success: true,
    });
    
    return Response.json({ user });
  } catch (error) {
    await logLoginAttempt({
      userId: 'unknown',
      email: request.headers.get('x-email') || 'unknown',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      reason: 'Unexpected server error during authentication',
    });
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
```

### Resume Upload Error Example

File: `app/api/admin/upload-resume/route.ts`

```typescript
import { logResumeUploadError } from '@/lib/slack-error-logger';

export async function POST(request: Request) {
  const orgName = request.headers.get('x-org-name') || 'unknown';
  const driveName = request.headers.get('x-drive-name') || 'unknown';
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Process resume...
    const result = await processResume(file, orgName, driveName);
    
    return Response.json(result);
  } catch (error) {
    await logResumeUploadError({
      orgName,
      driveName,
      error: error instanceof Error ? error.message : String(error),
      reason: 'Resume processing failed — PDF extraction or parsing error',
      fileSize: request.headers.get('content-length') ? 
        parseInt(request.headers.get('content-length')!) : undefined,
    });
    
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
```

---

## Python (Interview Backend)

### LiveKit Error Example

File: `interview/agent_runtime.py`

```python
from interview.slack_error_logger import log_livekit_error

async def run_interview(...):
    try:
        await session.start(
            agent=agent,
            room=ctx.room,
            room_options=room_io.RoomOptions(close_on_disconnect=False),
        )
    except Exception as session_start_err:
        logger.error(f"[INTERVIEW_FAIL] session.start() failed for {app_id}: {session_start_err}")
        
        # Alert to Slack with full context
        await log_livekit_error(
            app_id=app_id,
            candidate_name=candidate_name,
            org_name=org_id,
            error=str(session_start_err),
            phase='session_start',
            reason='LiveKit session failed to start — check room credentials and network',
        )
        
        await _fail_interview("session_start_failed")
        raise
```

### Interview Processing Error Example

```python
from interview.slack_error_logger import log_interview_error

async def _process_user_conversation_item(...):
    try:
        # Process candidate answer
        await some_eval_pipeline(payload)
    except Exception as e:
        logger.error("[EVAL] Failed: %s", e, exc_info=True)
        
        await log_interview_error(
            app_id=app_id,
            candidate_name=candidate_name,
            org_name=org_id,
            error=str(e),
            phase='answer_evaluation',
            reason='Answer evaluation LLM call timed out or failed',
        )
        raise
```

### Resume Upload Error Example (Python)

```python
from interview.slack_error_logger import log_resume_upload_error

async def extract_resume(file_path: str, org_id: str, drive_id: str):
    try:
        result = await pdf_to_text(file_path)
        return result
    except Exception as e:
        await log_resume_upload_error(
            org_name=org_id,
            drive_name=drive_id,
            error=str(e),
            reason='PDF extraction failed — file may be corrupted or unsupported format',
            file_size=os.path.getsize(file_path),
        )
        raise
```

---

## Error Message Format (Slack)

Each error alert includes:

1. **Emoji + Type** — 🔐 LOGIN ERROR, 📄 RESUME_UPLOAD ERROR, 🎙️ LIVEKIT ERROR, etc.
2. **Timestamp** — IST format
3. **Context** — Org, Drive, Candidate, User ID (as applicable)
4. **Error Message** — The actual exception message (code block)
5. **Reason** — Human-readable explanation of what happened
6. **Additional Context** — Structured key-value data (file size, operation, phase, etc.)

Example:

```
🔐 **LOGIN ERROR**
_2025-06-30 14:23:45 IST_

👨‍💼 **User ID:** user_123
**Error Message:**
```
Invalid credentials
```

**Reason/Context:**
Authentication failed — email not found in system

**Additional Context:**
• **email:** john@example.com
```

---

## What to Monitor

**Login Errors:**
- Invalid credentials
- User account locked
- Email not found
- MFA failures

**Resume Upload Errors:**
- PDF extraction failures
- File too large
- Unsupported format
- Parsing timeout

**LiveKit Errors:**
- Room connection failed
- Token invalid/expired
- Recording failed
- Transcription timeout

**Interview Errors:**
- Answer evaluation timeout
- Report generation failed
- Summary generation failed
- Billing snapshot failure

**Drive Errors:**
- Drive creation failed
- JD PDF upload failed
- Drive access denied

---

## Disabling for Local Development

If alerts are spammy during local testing, simply omit `SLACK_ERROR_WEBHOOK_URL` from `.env.local`. Errors will log to console only.

```bash
# In .env.local, comment out:
# SLACK_ERROR_WEBHOOK_URL=...
```

Errors will still be logged locally, just not sent to Slack.
