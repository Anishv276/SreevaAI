# OLD vs NEW: Complete Scheduling System Comparison

---

## **COMPARISON TABLE**

| Feature | OLD METHOD | NEW METHOD |
|---------|-----------|-----------|
| **Scheduling Model** | Join anytime in 7 days | Fixed slot (candidate picks) |
| **Concurrency Control** | ❌ None (unlimited) | ✅ Max 5 per 30-min slot |
| **Booking Deadline** | ❌ None | ✅ Enforced (dates grayed out) |
| **LLM Cost** | 3× per candidate (retry waste) | 1× per booking (pre-compute) |
| **Launch Timeout** | 90 seconds (risky) | 300 seconds = 5 min (safe) |
| **Button Unlock Timing** | ❌ N/A (immediate join) | ✅ 2 min before slot |
| **Countdown Display** | ❌ None | ✅ "Timing Remaining: 12:00" |
| **Slot Time Gate** | ❌ None | ✅ Server validates ±5 min |
| **Grace Period** | Unclear (5 min join window) | ✅ Strict: 5 min after slot = expires |
| **User Fairness** | ❌ First-come chaos | ✅ Calendar UX (equal access) |
| **Admin Visibility** | ❌ No slot tracking | ✅ View all bookings |
| **Email Clarity** | 1 email (generic) | ✅ 2 emails (book + confirm) |
| **Calendar Export** | ❌ None | ✅ Google, Outlook, iCal |
| **User Experience** | Chaotic, unpredictable | Controlled, predictable |
| **Reliability** | Variable (depends on load) | Predictable (fixed slots) |
| **Cost Efficiency** | ~66% LLM waste | ✅ Optimized |

---

## **DETAILED EXAMPLE FLOW COMPARISON**

### **SCENARIO: Admin invites John on Monday 9:00 AM for Software Engineer role**

---

## **OLD METHOD - Flow**

```
MONDAY 9:00 AM
├─ Admin clicks "Send Interview"
├─ Email sent to John: "You've been shortlisted!"
│  Subject: "Start AI Interview for Software Engineer at Acme Corp"
│  Body: Direct interview link
│  Link: sreeva.ai/interview/app-123?token=abc-xyz
│  Status: ✅ LIVE IMMEDIATELY (valid for 7 days)
│
├─ John receives email
│
├─ MONDAY 2:00 PM (8 hours later)
│  John clicks link at random time
│  ├─ Browser: /interview/app-123
│  ├─ Hardware check loads immediately
│  ├─ Click "Begin Interview"
│  ├─ Launching phase starts
│  ├─ Agent connects (might take 2-10 seconds, or timeout)
│  ├─ Interview starts whenever agent ready
│  ├─ Timer: 20 min
│  └─ Done
│
├─ WEDNESDAY 3:00 PM (another join attempt)
│  John forgot to do it Monday, tries again
│  ├─ Browser: /interview/app-123 (same link)
│  ├─ Hardware check loads
│  ├─ Click "Begin Interview" 
│  ├─ Server: "Why is John starting again? I'll create NEW greeting"
│  ├─ LLM CALL #2 (wasteful) - re-compute greeting
│  ├─ Agent connects
│  ├─ Interview starts (different from Monday)
│  ├─ Timer: 20 min
│  └─ Done
│
├─ SATURDAY 11:00 PM (Last minute)
│  John tries one more time
│  ├─ Browser: /interview/app-123
│  ├─ Hardware check loads
│  ├─ Click "Begin Interview"
│  ├─ LLM CALL #3 (wasteful) - re-compute greeting AGAIN
│  ├─ Agent connects
│  ├─ Interview starts
│  ├─ Timer: 20 min
│  └─ Done

ISSUES:
❌ 3 LLM calls for 1 candidate (66% waste)
❌ No scheduling control
❌ 10 candidates could start at 2:00 PM (no limit)
❌ Unpredictable load on servers
❌ No fairness (whoever clicks first gets picked time)
❌ Admin doesn't know who took interview when
```

---

## **NEW METHOD - Flow**

```
MONDAY 9:00 AM
├─ Admin clicks "Send Interview"
├─ Email #1 sent to John: "Schedule your AI interview"
│  Subject: "Schedule your AI interview — Software Engineer at Acme Corp"
│  Body: "Pick a time that works for you"
│  Button: "Pick Your Time Slot"
│  Link: sreeva.ai/schedule/abc-xyz
│  Deadline badge: "Book by July 10, 2026"
│
├─ John receives email
│
├─ MONDAY 10:00 AM
│  John clicks "Pick Your Time Slot"
│  ├─ Calendar UI loads (Cal.com style)
│  ├─ LEFT PANEL:
│  │  ├─ Role: Software Engineer
│  │  ├─ Company: Acme Corp
│  │  ├─ Duration: 20 min (in 30-min slots)
│  │  ├─ Timezone: Asia/Kolkata
│  │  └─ Deadline: July 10, 2026
│  │
│  ├─ RIGHT PANEL:
│  │  ├─ Month calendar (June 2026)
│  │  ├─ Today highlighted
│  │  ├─ Past dates grayed out
│  │  └─ Future dates (after July 10) grayed out
│  │
│  ├─ John clicks "Thursday, July 3"
│  ├─ API: GET /api/schedule/abc-xyz?date=2026-07-03
│  │  Returns 30-min slots (9 AM–6 PM IST)
│  │  Filters out slots with 5+ bookings
│  │
│  ├─ Slots appear:
│  │  ├─ 1:30 PM [Select]
│  │  ├─ 2:00 PM [Select] ← Only 3 candidates already
│  │  ├─ 2:30 PM [Select] ← Only 2 candidates already
│  │  ├─ 3:00 PM [Select] ← 5 candidates already (HIDDEN ❌)
│  │  ├─ 3:30 PM [Select]
│  │  └─ ...
│  │
│  ├─ John clicks "2:30 PM"
│  ├─ Slot expands with confirmation button
│  ├─ John clicks "Confirm 2:30 PM"
│  │
│  ├─ POST /api/schedule/abc-xyz
│  │  Body: { slotISO: "2026-07-03T14:30:00Z" }
│  │  Server (atomic):
│  │  ├─ 1. Count bookings at 2:30 PM → 2 candidates
│  │  ├─ 2. Check: 2 < 5 (limit)? YES ✓
│  │  ├─ 3. UPDATE Interview: scheduledAt = 2026-07-03 14:30 IST
│  │  └─ Returns: { success: true, scheduledAt: ... }
│  │
│  ├─ SUCCESS SCREEN:
│  │  ├─ ✓ Booking Confirmed
│  │  ├─ Software Engineer – Round 1
│  │  ├─ Thursday, July 3, 2:30 PM
│  │  └─ [Google Cal] [Outlook] [iCal]
│  │
│  ├─ Email #2 sent to John: "Your interview is confirmed"
│  │  Subject: "Your interview confirmed — Thursday, July 3, 2:30 PM IST"
│  │  Body:
│  │  ├─ Role: Software Engineer
│  │  ├─ Company: Acme Corp
│  │  ├─ Scheduled: Thursday, July 3, 2:30 PM IST
│  │  ├─ Duration: 20 minutes
│  │  ├─ Timeline:
│  │  │  ├─ 2:25 PM: Waiting room opens (hardware check)
│  │  │  ├─ 2:28 PM: "Begin Interview" button unlocks (2 min before)
│  │  │  ├─ 2:30 PM: Interview starts exactly
│  │  │  └─ 2:35 PM: Link expires (5 min grace ends)
│  │  ├─ Button: "Join Interview"
│  │  └─ Export: [Google] [Outlook] [iCal]
│  │
│  └─ LLM CALL #1 (optimal)
│     Backend queues: generate-interview-brief job
│     Pre-computes greeting, context, questions
│     Ready before interview time
│
├─ THURSDAY 2:20 PM (10 min early)
│  John clicks "Join Interview" from email
│  ├─ Browser: /interview/app-123?token=abc-xyz
│  ├─ Initial validation: GET /api/interview/app-123/token
│  │  Server checks:
│  │  ├─ scheduledAt: 2026-07-03 14:30 IST
│  │  ├─ now: 2026-07-03 14:20 IST
│  │  ├─ diff: 10 min before slot (within ±5 min pre-open window)
│  │  └─ Response: 403 TOO_EARLY + scheduledAt
│  │
│  ├─ Frontend catches TOO_EARLY:
│  │  ├─ Sets scheduledAt = 2026-07-03 14:30 IST
│  │  ├─ Sets slotCountdownSecs = 600 (10 min)
│  │  └─ Allows phase "check" to mount
│  │
│  ├─ Hardware Check UI loads:
│  │  ├─ Camera check
│  │  ├─ Mic test
│  │  ├─ Face verification
│  │  └─ (All checks complete)
│  │
│  ├─ BEGIN INTERVIEW BUTTON:
│  │  ├─ Status: LOCKED (gray)
│  │  ├─ Text above: "Timing Remaining: 10:00" ⏱️
│  │  └─ Ticks down every 1 second:
│  │     ├─ 10:00 → 09:59 → 09:58 → ...
│  │     ├─ 03:00 → 02:59 → ...
│  │     └─ 00:01 → 00:00
│  │
│  ├─ At 2:28:00 PM (exactly 2 min before slot):
│  │  ├─ slotCountdownSecs = 0
│  │  ├─ Text disappears (no longer shows "Timing Remaining")
│  │  ├─ Button changes: GRAY → ORANGE (unlocked)
│  │  ├─ John can click "Begin Interview"
│  │  └─ Status: READY
│  │
│  ├─ At 2:29:30 PM (John clicks early):
│  │  ├─ POST /api/interview/app-123/token
│  │  │  Body: { token: abc-xyz }
│  │  │  Server validates:
│  │  │  ├─ scheduledAt: 2026-07-03 14:30 IST
│  │  │  ├─ now: 2026-07-03 14:29:30 IST
│  │  │  ├─ diff: 30 sec before slot (within ±5 min = 300s window ✓)
│  │  │  ├─ Creates LiveKit room
│  │  │  ├─ Dispatches AI agent
│  │  │  ├─ Updates Interview: status = IN_PROGRESS, startedAt = now
│  │  │  └─ Response: { token: jwt, url: livekit, duration: 1200s, ... }
│  │  │
│  │  └─ Phase: "launching"
│  │     ├─ Dark screen with animated circles
│  │     ├─ 3 progress pills:
│  │     │  ├─ ✓ Mic & Camera (done in hardware check)
│  │     │  ├─ ✓ Room Link (LiveKit room created)
│  │     │  └─ ⏳ AI Agent (connecting...)
│  │     │
│  │     └─ Header: "Setting Up Interview Room"
│  │        Subtext: "Please wait — connecting your AI interviewer"
│  │
│  ├─ At 2:29:45 PM (Agent connects, 100ms after token request):
│  │  ├─ AI Agent pill turns green: ✓
│  │  ├─ Header: "Your Interviewer is Ready"
│  │  ├─ Subtext: "Agent ready in 100ms. Starting interview..."
│  │  └─ isAgentReady = true
│  │
│  ├─ Both conditions met:
│  │  ├─ 1. isAgentReady = true ✓
│  │  ├─ 2. (Server already validated slot time ±5 min) ✓
│  │  └─ → setPhase("interview")
│  │
│  └─ At 2:29:50 PM (Just before slot):
│     ├─ Phase: "interview" (auto-transition)
│     ├─ LiveKit room connects
│     ├─ 20-min timer starts (exactly at slot time approach)
│     ├─ Header: "Software Engineer – Round 1"
│     ├─ Timer: 19:59 → 19:58 → ...
│     ├─ AI greeting plays: "Hi John, let's begin your Software Engineer interview..."
│     └─ Interview starts
│
├─ THURSDAY 2:50 PM (20 min elapsed):
│  ├─ Timer: 00:00
│  ├─ Phase: "finalizing" (3s buffer)
│  ├─ Phase: "completed"
│  ├─ Rating form appears
│  ├─ POST /api/interview/finalize
│  │  ├─ Updates: status = COMPLETED, completedAt = now
│  │  └─ Sends admin notification email
│  │
│  └─ NO RETRY POSSIBLE
│     If John tries to rejoin:
│     ├─ GET /api/interview/app-123/token
│     ├─ Server checks: status = COMPLETED
│     ├─ Response: 409 INTERVIEW_COMPLETED
│     └─ Error: "Interview has been completed. Contact support."

BENEFITS:
✅ 1 LLM call only (pre-computed, ready before interview)
✅ Atomic booking (no race conditions)
✅ Scheduling control (John picked the time)
✅ Concurrency limit (max 5 per slot)
✅ Countdown display ("Timing Remaining: 10:00")
✅ Clear timeline (2-email system)
✅ Fairness (calendar UX, equal access)
✅ Admin visibility (all slots tracked)
✅ 5 min safety buffer (±5 min grace period)
✅ Deadline enforcement (dates after deadline grayed)
✅ Calendar export (Google, Outlook, iCal)
```

---

## **SIDE-BY-SIDE TIMELINE COMPARISON**

### **OLD METHOD TIMELINE**

```
Monday 9:00 AM  → Email sent (Live link, valid 7 days)
                   ❌ No scheduling info

Monday 2:00 PM  → John joins randomly
                → Greeting LLM CALL #1
                → Interview runs

Wednesday 3:00 PM → John tries again
                 → Greeting LLM CALL #2 (wasteful)
                 → Interview runs

Saturday 11:00 PM → John tries third time
                 → Greeting LLM CALL #3 (wasteful)
                 → Interview runs

Result: 3 interviews, 3 LLM calls, no concurrency control
```

### **NEW METHOD TIMELINE**

```
Monday 9:00 AM    → Email #1: "Schedule your interview"
                   ✅ Calendar link, clear deadline

Monday 10:00 AM   → John books: Thursday 2:30 PM
                  → Email #2: "Confirmed + timeline"
                  → LLM CALL #1 (pre-compute greeting)
                  ✅ Ready before interview time

Thursday 2:20 PM  → John opens link
                  → Hardware check loads
                  → Button locked: "Timing Remaining: 10:00"

Thursday 2:28 PM  → Button unlocks (2 min before)
                  → John can click "Begin"

Thursday 2:29:30 PM → John clicks "Begin"
                    → Launching phase (agent connects)

Thursday 2:30 PM  → Interview starts
                  → Pre-computed greeting ready
                  → Timer: 20 min

Thursday 2:50 PM  → Interview ends
                  → Completion email sent

Result: 1 interview, 1 LLM call, atomic booking, concurrency controlled
```

---

## **KEY DIFFERENCES SUMMARY**

| Aspect | OLD | NEW |
|--------|-----|-----|
| **Emails** | 1 (vague) | 2 (clear) |
| **LLM Calls** | 3× (wasteful) | 1× (optimized) |
| **Cost** | 66% waste | 66% savings |
| **Timing Clarity** | None | Clear (email + countdown) |
| **Button Unlock** | Immediate | 2 min before slot |
| **Concurrency** | Unlimited chaos | Max 5 per slot |
| **Scheduling** | Anytime (7 days) | Fixed slot (candidate picks) |
| **Deadline** | None | Enforced (grayed dates) |
| **Countdown Display** | None | "Timing Remaining: MM:SS" |
| **Admin Control** | None | Full visibility |
| **Fairness** | First-come | Equal access |
| **Reliability** | Variable load | Predictable load |

---

## **WINNER: NEW METHOD ✅**

**Why?**
- 66% LLM cost savings
- Zero race conditions (atomic booking)
- Predictable, fair, controlled experience
- Clear communication (2 emails + countdown)
- Admin visibility & concurrency control
- 5 min safety buffer

**Cost to implement?** $0 (no new dependencies)  
**Effort?** Already done ✅

---
