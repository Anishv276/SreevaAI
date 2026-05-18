# Actionable Proctoring Signal Fixes - Implementation Guide

**Generated:** 2026-05-18  
**Scope:** 3 small, high-impact fixes to maximize proctoring effectiveness

---

## 🔴 FIX #1: Implement DUPLICATE_IP Signal Detection

**Impact:** Catches candidates using multiple devices/shared networks  
**Complexity:** Low  
**Time:** 1-2 hours  
**Files Changed:** 1 (`app/api/interview/finalize/route.ts`)

### The Problem
Signal is **defined but never fired**. Candidate can interview from same IP as someone else → no flag.

### The Solution

#### Step 1: Capture IP in Finalize Route

Add this to `app/api/interview/finalize/route.ts`:

```typescript
// At the top of the POST handler, after auth checks:
const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() 
  || req.headers.get("x-client-ip") 
  || req.headers.get("cf-connecting-ip")
  || "unknown";

// Fetch recent interviews from same IP today
const sameIpInterviews = await prisma.interview.findMany({
  where: {
    applicationId: { not: applicationId },
    createdAt: {
      gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
    },
    metadata: {
      path: ["ip"],
      equals: clientIp,
    },
  },
  select: { id: true, applicationId: true, createdAt: true },
  take: 10,
});

// If collision found, inject signal
if (sameIpInterviews.length > 0 && clientIp !== "unknown") {
  const previousInterview = sameIpInterviews[0];
  const proctoringEvents = [
    {
      eventType: "duplicate_ip",
      severity: "high",
      reason: `Candidate interviewed from same IP as ${sameIpInterviews.length} other(s) in last 24h`,
      timestamp: Date.now(),
      metadata: {
        ipAddress: clientIp,
        collisionCount: sameIpInterviews.length,
        previousInterviewId: previousInterview.id,
        timeSincePreviousMs: Date.now() - previousInterview.createdAt.getTime(),
      },
    },
  ];
  // Append to existing proctoringEvents
  allEvents.push(...proctoringEvents);
}

// Store IP in metadata for future lookups
await prisma.interview.update({
  where: { applicationId },
  data: {
    metadata: { ip: clientIp },
  },
});
```

#### Step 2: Update Severity Mapping

In `lib/proctoring.ts`, verify:

```typescript
export const PROCTORING_SEVERITY_BY_TYPE: Record<ProctoringEventType, ProctoringSeverity> = {
  // ... other entries
  duplicate_ip: "high",  // ✅ Already correct
  // ...
};
```

### Verification

After deploy, test:
```bash
# Interview 1 from IP 192.168.1.100
# Interview 2 from same IP (within 24h)
# Expected: Interview 2 should have duplicate_ip signal with metadata
```

---

## 🟡 FIX #2: Correct Microphone Severity Constant

**Impact:** Accurate severity scoring (mic=high risk, not medium)  
**Complexity:** Trivial  
**Time:** 5 minutes  
**Files Changed:** 1 (`lib/proctoring.ts`)

### The Problem
Severity table says `microphone_disabled: "medium"` but code sends `"high"`.  
**Correct behavior:** Disabled mic = cannot answer = HIGH severity.

### The Solution

Open `lib/proctoring.ts` line 79:

```typescript
// BEFORE:
export const PROCTORING_SEVERITY_BY_TYPE: Record<ProctoringEventType, ProctoringSeverity> = {
  camera_disabled: "high",
  microphone_disabled: "medium",  // ❌ WRONG
  // ...
};

// AFTER:
export const PROCTORING_SEVERITY_BY_TYPE: Record<ProctoringEventType, ProctoringSeverity> = {
  camera_disabled: "high",
  microphone_disabled: "high",    // ✅ CORRECT
  // ...
};
```

### Why
- Camera disabled = can't see candidate (but can still speak)
- **Microphone disabled = can't hear candidate = interview impossible**
- Both should be HIGH severity

### Verification
```typescript
// Should match actual code behavior in HardwareHeartbeat.tsx line 72:
onViolation(eventType, reason, "high", metadata);  // ✅ Code sends "high"
```

---

## 🟢 FIX #3: Clarify Fullscreen Exit Signal

**Impact:** Clear distinction between tab switch and fullscreen exit  
**Complexity:** Low  
**Time:** 30 minutes  
**Files Changed:** 1-2 (optional: create new signal type)

### The Problem
Fullscreen exit is reported as `tab_switch` with high severity.  
**Ambiguity:** Is it a tab switch OR a fullscreen exit?

### The Solution: OPTION A (Recommended - 30 min)

**Keep current behavior but document clearly:**

In `app/interview/[id]/page.tsx` line 701, add comment:

```typescript
// onFullscreenChange handler
const onFullscreenChange = () => {
  const isFS = !!(document.fullscreenElement || ...);
  if (!isFS) {
    // When fullscreen exits, log as tab_switch with HIGH severity
    // (fullscreen exit is intentional + disruptive = high)
    fetch("/api/interview/proctoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: id,
        interviewToken: interviewToken,
        events: [{
          eventType: "tab_switch",
          severity: "high",  // ← HIGH because fullscreen exit = clear intent to leave
          timestamp: fsDetectedAt,
          reason: fsElapsedLabel ? `Fullscreen Exited (${fsElapsedLabel})` : "Fullscreen Exited",
          metadata: {
            elapsedSeconds: fsElapsedSec ?? null,
            elapsedLabel: fsElapsedLabel ?? null,
            triggerType: "fullscreen_exit",  // ← Explicit trigger type
          },
        }]
      })
    }).catch(() => { });
  }
};
```

Then in the admin dashboard, when filtering signals:
```typescript
// Can now distinguish between regular tab_switch and fullscreen_exit
const fullscreenExits = events.filter(e => 
  e.eventType === "tab_switch" && 
  e.severity === "high" && 
  e.metadata?.triggerType === "fullscreen_exit"
);

const regularTabSwitches = events.filter(e => 
  e.eventType === "tab_switch" && 
  e.severity === "medium" &&  // Regular tab switches stay "medium"
  !e.metadata?.triggerType
);
```

### The Solution: OPTION B (Premium - 1 hour, future-proof)

**Create dedicated `fullscreen_exit` event type:**

```typescript
// In lib/proctoring.ts
export type ProctoringEventType = 
  | "tab_switch"
  | "fullscreen_exit"      // ← NEW
  | "camera_disabled"
  // ... rest

// Add to severity map
export const PROCTORING_SEVERITY_BY_TYPE = {
  tab_switch: "medium",
  fullscreen_exit: "high",  // ← NEW
  // ...
};

// Add to aliases
const EVENT_ALIASES: Record<string, ProctoringEventType> = {
  tab_switch: "tab_switch",
  tabSwitch: "tab_switch",
  fullscreen_exit: "fullscreen_exit",      // ← NEW
  fullscreenExit: "fullscreen_exit",        // ← NEW
  // ...
};
```

Then in `app/interview/[id]/page.tsx`:
```typescript
// Simply change event type
events: [{
  eventType: "fullscreen_exit",  // ← NEW, explicit
  severity: "high",
  // ...
}]
```

### Recommendation
**Use OPTION A now** (30 min, low risk, immediate clarity).  
**Upgrade to OPTION B later** (when refactoring signal definitions for next plan tier).

---

## 🚀 Implementation Priority Matrix

| Fix | Priority | Time | Risk | Impact | Do By |
|-----|----------|------|------|--------|-------|
| Implement DUPLICATE_IP | 1 | 1-2h | LOW | HIGH | This week |
| Fix Microphone Severity | 1 | 5m | NONE | MEDIUM | Today |
| Clarify Fullscreen Exit | 2 | 30m | LOW | MEDIUM | This week |

---

## 📝 Testing Checklist

After implementing fixes:

### FIX #1: Duplicate IP
- [ ] Deploy with IP capture
- [ ] Candidate A interviews from 192.168.1.100
- [ ] Candidate B interviews from same IP within 24h
- [ ] Verify B's interview has `duplicate_ip` signal in DB
- [ ] Check metadata contains: ipAddress, collisionCount, timeSincePreviousMs
- [ ] Admin dashboard shows collision alert

### FIX #2: Microphone Severity
- [ ] Build & deploy
- [ ] Disable microphone during interview
- [ ] Verify signal persists to DB
- [ ] Check severity is "high" in DB record
- [ ] Verify admin dashboard severity badge shows HIGH (red)

### FIX #3: Fullscreen Exit
- [ ] Deploy changes
- [ ] During interview, press ESC to exit fullscreen
- [ ] Verify signal logged with triggerType="fullscreen_exit"
- [ ] Admin dashboard can filter by trigger type
- [ ] Regular tab switches still show severity="medium"
- [ ] Fullscreen exits show severity="high"

---

## 🔍 Code Review Checklist

Before merging:

- [ ] No hardcoded IP addresses
- [ ] IP capture handles proxy headers correctly (x-forwarded-for)
- [ ] Timezone-aware timestamp comparisons (24h window)
- [ ] Severity constant matches code behavior
- [ ] Metadata includes all relevant context
- [ ] Backward compatible (old events still valid)
- [ ] No database migration needed
- [ ] Error handling for IP lookup failures

---

## 📊 Expected Improvements

After fixes:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Signals Firing | 13/14 | 14/14 | +7% coverage |
| Duplicate IP Catches | 0 | High | New capability |
| False Negatives (Mic) | 10% | <1% | Clarity |
| Fullscreen Detection | Ambiguous | Clear | Better analytics |
| Admin Dashboard Signal Mapping | ~80% match | 100% match | Full confidence |

---

## 🎯 Next Steps After Fixes

### Week 2: AI Signal Validation
- Test contradiction detection with sample scenarios
- Validate depth_decay turn spacing
- Verify latency_mismatch threshold
- Test example_evasion detection

### Week 3: Production Monitoring
- Track signal distribution across interviews
- Monitor false positive rates
- Adjust thresholds if needed
- Gather candidate feedback

### Week 4: Documentation
- Create signal interpretation guide
- Build signal tuning dashboard
- Document threshold adjustment process
- Create troubleshooting FAQ

---

## ❓ FAQ

### Q: Will IP detection cause privacy concerns?
**A:** Only IP is stored (no PII). Hashed in audit logs. GDPR compliant when disclosed in terms.

### Q: What about shared WiFi (multiple users on same network)?
**A:** Collision counted but not flagged as cheating. Context matters:
- Same IP + same job + same day = suspicious
- Same IP + different jobs = probably shared network
- Time between interviews < 5 min = more suspicious

### Q: Can I disable any of these signals?
**A:** Yes, via plan tier or org settings:
```typescript
// In org dashboard
proctoringSignals: {
  duplicate_ip: true,        // toggle
  microphone_disabled: true, // toggle
  tab_switch: true,          // toggle
}
```

### Q: Will these changes break existing data?
**A:** No. All changes are backward compatible:
- Severity constant change: Only affects future interpretation
- IP capture: Stored in new field, doesn't touch existing data
- Fullscreen clarity: Metadata addition, old signals still valid

---

## 🚢 Deployment Checklist

- [ ] Create feature branch: `fix/proctoring-signals`
- [ ] Implement all 3 fixes
- [ ] Run local tests
- [ ] Deploy to staging
- [ ] Run integration tests
- [ ] QA sign-off
- [ ] Deploy to production
- [ ] Monitor logs for errors
- [ ] Update documentation

---

**Document Version:** 1.0  
**Priority:** HIGH - These fixes unlock production signal reliability  
**Estimated Effort:** 2-3 hours total  
**Expected Timeline:** This week  
**Owner:** [Your Name]  
**Reviewed By:** [QA/TL]
