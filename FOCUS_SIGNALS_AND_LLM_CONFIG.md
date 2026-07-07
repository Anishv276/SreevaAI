# Focus Signals & LLM Configuration Guide

## Part 1: LLM Model Configuration

### Four Separate LLM Models per Organization

Each org has **4 different LLM configurations** in the `Organization` table:

| Config Field | Used For | LLM Call Type | When |
|---|---|---|---|
| `llmInterviewLive` | Live interview question generation | `interview_llm_generation` | During interview, when asking questions |
| `llmInterviewEval` | Per-turn evaluation & analysis | `interview_eval` | During interview, after each answer; also for summary/verdict generation |
| `llmInterviewBrief` | Interview brief generation | `interview_brief` | Before interview starts, to generate talking points |
| `llmInterviewReport` | Report generation (eval + skills + behavioral + answer_integrity) | `report_eval`, `report_skills`, `report_behavioral`, `report_answer_integrity` | After interview completes, during finalization |

### How Models Flow Through the Code

```
Database (Organization table)
    ↓
agent_runtime.py: get_interview_context()
    ↓
InterviewContext class (typed struct)
    ├─ llmInterviewLive → interview_llm_model (used during live interview)
    ├─ llmInterviewEval → analysis_model (used for per-turn eval + summary/verdict)
    ├─ llmInterviewBrief → passed to generate_interview_brief()
    └─ llmInterviewReport → passed to generate_interview_report()
```

### Critical: NO Hardcoded Fallbacks

**Both `generate_interview_report()` and `generate_interview_summary()` now require the LLM model as a mandatory parameter — no fallback to hardcoded defaults.**

- If org config is missing `llmInterviewReport`, report generation **fails with error log** (not silent degradation)
- If org config is missing `llmInterviewEval`, summary/verdict generation **fails with error log**

This ensures:
- ✅ Orgs must configure LLM models in Super Admin → AI Models
- ✅ No silent use of old/wrong models
- ✅ Clear error messages for debugging

---

## Part 2: Focus Signals (Tab Switch, Fullscreen Exit, Window Blur)

### Overview

The interview has **3 independent focus signals** that detect when a candidate leaves the interview context:

1. **TAB_SWITCH** — candidate switched to a different browser tab
2. **FULLSCREEN_EXIT** — candidate pressed Escape or clicked fullscreen exit button
3. **WINDOW_FOCUS_LOSS** — browser window lost focus (candidate clicked outside the window)

All three are **optional per-org configuration** via the `proctoringSignals` object.

---

### Signal 1: TAB_SWITCH

**Event:** `visibilitychange` listener fires when `document.hidden` transitions

**Fires When:**
- User clicks another tab/window
- Browser minimizes
- Another window comes to focus

**Grace Window:** 1500ms
- OS notifications (Slack, email) briefly steal focus and self-resolve
- Only log if focus stays lost for >1.5 seconds

**Does NOT Fire If:**
- Fullscreen change already claimed the transition (via `focusEventInFlightRef`)
- Window blur happened first (tab_switch has lower priority than fullscreen_exit)

**State Tracking:**
```
document.hidden: false → true  [Grace window 1500ms] → TAB_SWITCH logged
document.hidden: true → false  [Grace window cleared] → Back to interview
```

---

### Signal 2: FULLSCREEN_EXIT

**Event:** `fullscreenchange` listener fires when `document.fullscreenElement` changes

**Fires When:**
- User presses Escape key
- User clicks fullscreen exit button
- Browser forces fullscreen exit (rare)

**Grace Window:** NONE (immediate log)
- Exiting fullscreen is a deliberate action, not accidental
- No tolerance needed

**Does NOT Fire If:**
- We were never in fullscreen (`wasFullscreenRef.current === false`)
- Only logs when transitioning from fullscreen to non-fullscreen

**State Tracking:**
```
document.fullscreenElement: <html> → null  [IMMEDIATE] → FULLSCREEN_EXIT logged
wasFullscreenRef: true → false             [State updated after log]
```

**Critical Fix:** `wasFullscreenRef` is initialized to **current fullscreen state** when listeners attach. This prevents false positives:
- If fullscreen entered before listeners attached, `wasFullscreenRef` is true on entry
- If fullscreen never entered, ref stays false and spurious blur/focus events don't trigger exit log

---

### Signal 3: WINDOW_FOCUS_LOSS

**Event:** `blur` listener fires when window loses focus

**Fires When:**
- User clicks outside the browser window (desktop, another app, taskbar)
- Alt+Tab to another window
- Click on system tray or start menu

**Grace Window:** 1500ms
- Same as tab_switch (OS notifications can briefly blur)

**Does NOT Fire If:**
- Tab visibility or fullscreen change already claimed the transition
- Lower priority than tab_switch and fullscreen_exit

**State Tracking:**
```
window focused: true → false   [Grace window 1500ms] → WINDOW_FOCUS_LOSS logged
window focused: false → true   [Grace window cleared] → Back to interview
```

---

### Deduplication: focusEventInFlightRef

**Problem:** A single physical action can trigger multiple listeners. Example: Pressing Escape to exit fullscreen also blurs the window on some browsers.

**Solution:** `focusEventInFlightRef.current` = boolean flag

- When **any** listener detects a focus loss, it sets `focusEventInFlightRef = true`
- Other listeners check this flag and skip if already claimed
- Reset to false when focus is restored (`onWindowFocus`) or grace window expires

**Priority Order** (first wins):
1. Fullscreen exit (no grace window, claimed immediately)
2. Tab switch (1.5s grace window)
3. Window blur (1.5s grace window, catches anything else)

---

## Part 3: Integration Example

### Scenario: Candidate presses Escape during interview

```
User presses Escape key
  ↓
Browser fires fullscreenchange event
  ↓
onFullscreenChange() checks:
  ├─ isFS = false (fullscreen was exited)
  ├─ wasFullscreenRef.current = true (we were in fullscreen)
  ├─ isFullscreenExitEnabled = true (org config allows this signal)
  └─ → Sets focusEventInFlightRef = true, logs FULLSCREEN_EXIT immediately
  ↓
Browser fires blur event (same action)
  ↓
onWindowBlur() checks:
  ├─ focusEventInFlightRef.current = true (fullscreen exit already claimed it)
  └─ → SKIPS (returns early, no duplicate log)
  ↓
Result: Exactly 1 event logged (fullscreen_exit), not 2
```

### Scenario: Candidate clicks browser tab

```
User clicks another tab
  ↓
Browser fires visibilitychange event
  ↓
onVisibilityChange() checks:
  ├─ document.hidden = true (tab is hidden)
  ├─ isTabSwitchEnabled = true (org config allows this signal)
  └─ → Sets focusEventInFlightRef = true, waits 1500ms
  ↓
1500ms passes (focus not restored)
  ↓
Grace window timer fires
  ↓
Logs TAB_SWITCH event
  ↓
User clicks back to interview tab
  ↓
Browser fires visibilitychange + focus event
  ↓
onVisibilityChange() checks:
  ├─ document.hidden = false (tab is visible)
  └─ → Sets focusEventInFlightRef = false, clears grace timer
  ↓
onWindowFocus() checks:
  ├─ focusEventInFlightRef.current = false (already cleared)
  └─ → NOOP
  ↓
Result: Exactly 1 event logged (tab_switch), focus reset
```

---

## Part 4: Configuration & Debugging

### Enabling Signals

Org admin sets via Super Admin → Proctoring Signals:
```json
{
  "tab_switch": true,        // Enabled
  "fullscreen_exit": true,   // Enabled
  "window_focus_loss": true  // Enabled
}
```

### Frontend Flags

In [id]/page.tsx, near top of InterviewContent:
```typescript
const SHOW_TAB_FULLSCREEN_ALERTS = true;  // Show toast when violation detected
```

If disabled, violations are still logged to backend but candidate sees no alert.

### Logs to Check

**Backend Proctoring Events:**
```
POST /api/interview/proctoring
Body:
{
  "applicationId": "app-xxx",
  "interviewToken": "token-xxx",
  "events": [{
    "eventType": "tab_switch" | "fullscreen_exit" | "window_focus_loss",
    "severity": "medium" | "high",
    "timestamp": 1234567890,
    "reason": "Tab Switched (2m 15s into interview)",
    "metadata": {
      "elapsedSeconds": 135,
      "elapsedLabel": "2m 15s into interview"
    }
  }]
}
```

**Browser Console:**
```
[REPORT] Signals: app=app-xxx integrity=75 band=MEDIUM behavioral=2
```

---

## Part 5: Fullscreen Lifecycle

### Request Fullscreen (on "Begin Interview")

1. `handleHardwareComplete()` → phase="launching"
2. **Await** `requestFullscreenMode()` ← **CRITICAL: now waits for fullscreen to actually enter**
3. Only then: `setShouldConnect(true)` → phase="interview"
4. Focus listeners attach with `wasFullscreenRef` initialized to current state

### Exit Fullscreen (on interview end or timeout)

1. `completeInterviewFeedback()` → phase="completed"
2. Calls `exitFullscreenMode()` to cleanly exit fullscreen
3. No proctoring log (expected behavior, not a violation)

### Edge Case: Accidental Fullscreen Exit During Interview

1. Candidate presses Escape
2. `onFullscreenChange()` sees `!isFS && wasFullscreenRef.current`
3. Logs FULLSCREEN_EXIT with elapsed time
4. Toast alerts candidate (if SHOW_TAB_FULLSCREEN_ALERTS=true)
5. Candidate can click button to re-enter fullscreen
6. Grace window for window blur is **disabled** for fullscreen (no tolerance)

---

## Part 6: Troubleshooting

### Fullscreen exit fires on entry instead of exit

**Old issue (fixed):** `wasFullscreenRef` was never initialized to current state.
- Listeners would attach with `wasFullscreenRef = false`
- First fullscreen blur event → `!isFS && wasFullscreenRef.current` → false && false → no log ✓
- But if blur happened, ref would flip to false, then a subsequent blur → true && false → logs false positive ✗

**Fix:** Initialize `wasFullscreenRef` to actual fullscreen state when attaching listeners.

### TAB_SWITCH fires immediately instead of after 1.5s

**Check:**
- Is `tabViolationTimerRef.current` being cleared prematurely?
- Did candidate restore focus within 1500ms? (Should cancel the timer)
- Is `onVisibilityChange()` seeing `document.hidden = true`? (Confirm tab is actually hidden)

### Signals fire but aren't reaching backend

**Check:**
- Is `isTabSwitchEnabled` / `isFullscreenExitEnabled` / `isWindowFocusLossEnabled` true?
- Is `SHOW_TAB_FULLSCREEN_ALERTS` true? (Controls both toast AND backend log)
- Does `phase === "interview"`? (Listeners only attach during interview)
- Is the fetch to `/api/interview/proctoring` succeeding? (Check Network tab)

### Multiple events logged for single action

**Should not happen** (that's what `focusEventInFlightRef` prevents).
- If it does, check if grace windows are overlapping
- Check if both blur and visibility listeners are firing (browser-specific)

---

## Summary Table: When Each Signal Fires

| Signal | Listener Event | DOM Change | Grace Window | Priority | Logged To |
|---|---|---|---|---|---|
| TAB_SWITCH | visibilitychange | `document.hidden`: false→true | 1500ms | #2 | Backend proctoring events |
| FULLSCREEN_EXIT | fullscreenchange | `document.fullscreenElement`: element→null | NONE | #1 | Backend proctoring events |
| WINDOW_FOCUS_LOSS | blur | `window.focused`: true→false (implicit) | 1500ms | #3 | Backend proctoring events |

---

## LLM Model Fallback Policy

**NONE.** All LLM configs must come from the database.

- Report generation requires `Organization.llmInterviewReport` (llmInterviewEval in call)
- Summary generation requires org's configured model (analysis_model = llmInterviewEval)
- Brief generation requires `Organization.llmInterviewBrief`
- Live question generation requires `Organization.llmInterviewLive`

If any are missing: **fail with error log, not fallback**.
