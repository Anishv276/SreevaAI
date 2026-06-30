# Login Error Alerts Setup — Complete Guide

## What's Configured

Your login route (`app/api/auth/login/route.ts`) now sends **structured alerts to Slack** for every login event:

### Login Success (Console only — no spam)
- ✅ Super admin login successful
- ✅ Admin login successful

### Login Failures (Alert to Slack immediately)
- ❌ Rate limit exceeded (5 attempts in 60 seconds)
- ❌ Super admin password mismatch
- ❌ Admin password mismatch
- ❌ User not found or account not initialized
- ❌ Server error during authentication

---

## Slack Alert Format

Each login failure appears in your `#debug-alerts` channel (ID: `C0B5PS0ESHJ`) with this structure:

```
🔐 LOGIN ERROR
_2025-06-30 14:45:22 IST_

👨‍💼 **User ID:** user_123
**Error Message:**
```
Invalid credentials
```

**Reason/Context:**
Admin password mismatch — incorrect password provided

**Additional Context:**
• **email:** john@example.com
```

---

## Alert Types

### 1. Rate Limit Exceeded
**When:** User tries to login 5+ times in 60 seconds  
**Alert:** Full context with email  
**Action:** Human review for brute-force attempts  

```
🔐 LOGIN ERROR — Rate Limit Exceeded
Reason: Too many login attempts — rate limit exceeded (5 attempts in 60 seconds)
```

### 2. Wrong Password
**When:** Correct email, incorrect password  
**Alert:** User ID + email + clear reason  
**Action:** Monitor for targeted account attacks  

```
🔐 LOGIN ERROR — Password Mismatch
Reason: Admin password mismatch — incorrect password provided
Email: user@org.com
User ID: user_abc123
```

### 3. User Not Found
**When:** Email doesn't exist in system or account not initialized  
**Alert:** Email + clear reason  
**Action:** New account registration failures or typos  

```
🔐 LOGIN ERROR — User Not Found
Reason: User not found or password not set — email does not exist in system or account not initialized
Email: unknown@example.com
```

### 4. Server Error
**When:** Unexpected exception in login handler  
**Alert:** Full exception message + context  
**Action:** Critical — requires immediate investigation  

```
🔐 LOGIN ERROR — Server Error
Reason: Unexpected server error during login — exception thrown in auth handler
Error Message:
```
Database connection timeout
```
```

---

## Slack Configuration (Already Set)

In `.env`:

```env
# Slack error alerting webhook
SLACK_ERROR_WEBHOOK_URL=https://hooks.slack.com/services/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

# Channel to receive alerts
SLACK_ERROR_CHANNEL=C0B5PS0ESHJ

# Bot token for file uploads
SLACK_BOT_TOKEN=xoxb-11101596499317-11476936267733-spYXNpaxgbwNi9EVrqPK4DzE
```

---

## How It Works

### Code Flow

```typescript
// In login route handler:

1. User submits email + password
   ↓
2. Check rate limit
   → If exceeded → logLoginAttempt(success=false) → Slack alert
   ↓
3. Find super admin
   → If password wrong → logLoginAttempt(success=false) → Slack alert
   → If login successful → logLoginAttempt(success=true) → Console only
   ↓
4. Find regular admin
   → If user not found → logLoginAttempt(success=false) → Slack alert
   → If password wrong → logLoginAttempt(success=false) → Slack alert
   → If login successful → logLoginAttempt(success=true) → Console only
   ↓
5. Exception handler
   → logLoginAttempt(success=false) → Slack alert
```

### Slack Logger Function

```typescript
import { logLoginAttempt } from "@/lib/slack-error-logger";

// Failure example:
await logLoginAttempt({
    userId: userProfile.id,
    email: normalizedEmail,
    success: false,
    reason: "Admin password mismatch — incorrect password provided",
});

// Success example (console only, no Slack):
await logLoginAttempt({
    userId: userProfile.id,
    email: normalizedEmail,
    success: true,
});
```

---

## Monitoring Tips

### What to watch for:

1. **Brute Force Attacks**  
   Multiple "Rate Limit Exceeded" alerts for same email in short time  
   → Block IP or check for credential leaks

2. **Account Takeover Attempts**  
   "Password Mismatch" + different locations/times  
   → Force password reset for affected user

3. **System Issues**  
   "Server Error" during login  
   → Check database connection, Redis, external services

4. **New Account Problems**  
   "User Not Found" for legitimate users  
   → Check onboarding process, account initialization

---

## Extending to Other Routes

To add login alerts to other routes (password reset, OTP, etc.), use the same pattern:

```typescript
// In app/api/auth/forgot-password/route.ts
import { logLoginAttempt } from "@/lib/slack-error-logger";

try {
    // ... password reset logic ...
    
    if (userNotFound) {
        await logLoginAttempt({
            userId: "unknown",
            email: requestedEmail,
            success: false,
            reason: "Password reset requested for non-existent account",
        });
    }
} catch (error) {
    await logLoginAttempt({
        userId: "unknown",
        email: "unknown",
        success: false,
        error: String(error),
        reason: "Password reset handler exception",
    });
}
```

---

## Disabling Alerts (Development)

If alerts get noisy during local testing, comment out in `.env`:

```env
# SLACK_ERROR_WEBHOOK_URL=...
```

Errors still log to console, just not sent to Slack.

---

## Summary

✅ **Login success** → Console only (no spam)  
✅ **Login failure** → Slack alert immediately with:
   - Error type (rate limit / password / not found / server error)
   - User ID + email
   - Clear reason
   - Timestamp (IST)

✅ **Channel:** `#debug-alerts` (C0B5PS0ESHJ)  
✅ **Webhook:** Configured in `.env`  
✅ **Status:** Ready to test
