# PART 2: ADAPTIVE TOPIC SATURATION SYSTEM — BEFORE/AFTER EXAMPLES

## The Problem With Fixed Followups

**OLD SYSTEM:** "Always ask 2 follow-ups per topic, then move on"

This is inefficient because:
- Strong candidates waste 2-3 minutes on a topic they've already saturated
- Weak candidates escape after 2 vague answers, hiding their lack of knowledge
- Medium candidates get cut off before reaching clarity
- No intelligent use of the 20-minute window

---

## The Solution: Topic Saturation Scoring

**NEW SYSTEM:** "Keep asking until you have enough context based on answer quality"

Each topic accumulates a saturation score. When the score reaches the threshold for that topic's importance level, move on.

**Formula:**
```
response_score = (clarity × 0.20) + (depth × 0.35) + (specificity × 0.30) + (grounding × 0.15)

Contribution bands:
  8.5-10:   +3.5 points  (STAR-complete answer)
  7.0-8.4:  +2.5 points  (Strong answer)
  5.5-6.9:  +1.5 points  (Average)
  4.0-5.4:  +0.5 points  (Weak)
  <4.0:     +0.0 points  (Surface)

Signal penalties (reduce contribution):
  example_evasion:        -2.0  (can't give concrete example)
  contradiction:          -2.5  (factual conflict)
  ownership_ambiguity:    -1.5  (too much "we" language)
  resume_claim_mismatch:  -1.5  (doesn't match their resume)
  follow_up_collapse:     -1.0  (strong answer but follow-up weak)
  latency_mismatch:       -0.5  (suspicious timing)
```

**Topic Importance Thresholds:**
```
CRITICAL topics (threshold=8.0):
  - Anchor project (what they start with)
  - Current/most recent role
  - Primary JD must-have skills

HIGH topics (threshold=6.5):
  - Other resume projects
  - Previous significant roles
  - JD must-have skills

MEDIUM topics (threshold=5.0):
  - Nice-to-have JD skills
  - Internships
  - Older projects

LOW topics (threshold=3.5):
  - Side skills
  - Brief mentions
  - Quick coverage items
```

---

## EXAMPLE 1: STRONG CANDIDATE (Early Close)

### Scenario: Senior engineer talking about anchor project

**BEFORE (OLD SYSTEM):**
```
Turn 1 - Q: "Tell me what you personally built on Project: Real-time Payment System"

A: "I architected the payment reconciliation service from scratch. Built in Go 
    with async message queue processing. Handled the core domain logic for 
    detecting duplicate transactions, chargebacks, and payment failures. 
    Integrated with Stripe and our legacy banking system. Shipped to production 
    with 99.95% uptime over 18 months handling 50k transactions/day."

Quality scores: clarity=9, depth=9, specificity=9, grounding=9
Average quality ≈ 9

System thinks: "Okay, good answer. But rules say 2 follow-ups. Must ask follow-up 1."

Turn 2 - Q: "Walk me through the concurrency challenges"

A: "The biggest issue was idempotency across retries. I implemented a distributed 
    idempotency key store using Redis with transaction IDs as composite keys. 
    Handled clock skew between payment processors using NTP sync..."

Quality scores: clarity=8.5, depth=8.5, specificity=8.5, grounding=8.5

System thinks: "Still great. But rules say I MUST ask follow-up 2."

Turn 3 - Q: "What would you do differently?"

A: "Looking back, I'd start with event sourcing from day one instead of 
    event streaming. Would've saved weeks of audit trail debugging..."

Quality scores: clarity=8, depth=7.5, specificity=7, grounding=7.5

System: "Hit cap. MOVE_ON."

RESULT: Spent 3-4 minutes on ONE project. Only covered 6-7 topics in 20 minutes.
        This strong candidate is rated well, but interview is inefficient.
```

**AFTER (NEW SYSTEM):**
```
Project: Real-time Payment System (CRITICAL topic, threshold=8.0)
Candidate Band: Senior, so treated as CRITICAL (primary signal of who they are)

Turn 1 - Q: "Tell me what you personally built?"

A: "I architected the payment reconciliation service from scratch. Built in Go 
    with async message queue processing..."

Quality: clarity=9, depth=9, specificity=9, grounding=9
response_score = (9×0.20) + (9×0.35) + (9×0.30) + (9×0.15) = 1.8 + 3.15 + 2.7 + 1.35 = 8.99

Signals fired? NO

topic_saturation_score = 0 + 8.99 = 8.99

Check: Is 8.99 >= 8.0? YES ✓

MOVE_ON immediately. This is STAR-complete.

System: "Ownership is crystal clear. Outcome concrete. Business impact visible.
         No questions remaining. Confidence: VERY HIGH."

Next Q: Go straight to next resume item or skill.

RESULT: 1 answer (30-45 seconds). Moved to next topic.
        Covered 10+ topics in 20 minutes with equal depth.
        This is what HIGH-BANDWIDTH interviewing looks like.
```

---

## EXAMPLE 2: WEAK CANDIDATE (Extended Probing)

### Scenario: Mid-level candidate, vague on anchor project

**BEFORE (OLD SYSTEM):**
```
Turn 1 - Q: "Tell me what you built on Project: Mobile App"

A: "We built a mobile app. I worked with the team on it. We used React Native 
    and Firebase. It was for a startup, helped them manage customer data."

Quality: clarity=3, depth=2, specificity=2, grounding=2
Average ≈ 2.25

System: "Low scores. But no signals fired automatically. Continue."

Turn 2 - Q: "What specifically was your role in the team?"

A: "I contributed to the backend. Worked on APIs and stuff. The team was 
    working on features for the iOS app too."

Quality: clarity=2.5, depth=1.5, specificity=1, grounding=1.5
Average ≈ 1.6

Signal fires: ownership_ambiguity (all "we", no "I")

System: "Bad signal. But rules say I must ask follow-up 2, so I got it.
         Hit cap. MOVE_ON anyway."

RESULT: Candidate gave vague answers, avoided specifics, couldn't articulate 
        personal contribution. But interviewer MOVED ON because of the cap.
        
        Recruiter report: "Candidate was on a mobile app project."
        Reality: We never discovered they don't actually know what they built!
```

**AFTER (NEW SYSTEM):**
```
Project: Mobile App (HIGH topic, threshold=6.5)

Turn 1 - Q: "Tell me what you built?"

A: "We built a mobile app. I worked with the team on it. We used React Native 
    and Firebase. It was for a startup, helped them manage customer data."

Quality: clarity=3, depth=2, specificity=2, grounding=2
response_score = (3×0.20) + (2×0.35) + (2×0.30) + (2×0.15) = 0.6 + 0.7 + 0.6 + 0.3 = 2.2

Signals: NONE yet (low scores alone don't trigger signals)

topic_saturation_score = 2.2

Check: Is 2.2 >= 6.5? NO

PROBE (don't move on). 
probe_rotation_index = 0 → ownership probe (always first)

Turn 2 - Q (OWNERSHIP PROBE): "You mentioned 'we' — what did YOU specifically 
         own or build? What feature or piece was yours?"

A: "Um... I was on the API side. Built some endpoints? We had like... 
    authentication endpoints and data endpoints..."

Quality: clarity=2, depth=1.5, specificity=0.5, grounding=1
response_score = (2×0.20) + (1.5×0.35) + (0.5×0.30) + (1×0.15) = 0.4 + 0.525 + 0.15 + 0.15 = 1.225

Signal fires: ownership_ambiguity (-1.5 penalty)

contribution = 1.225 - 1.5 = -0.275 → clamped to 0.0

topic_saturation_score = 2.2 + 0.0 = 2.2

Check: Is 2.2 >= 6.5? NO

PROBE AGAIN.
probe_rotation_index = 1 → outcome/impact probe

Turn 3 - Q (OUTCOME PROBE): "Let's focus on those API endpoints. Which one 
         did you own completely? What was the actual outcome — did it ship? 
         Is it still used?"

A: "Yeah the auth endpoint shipped. Uh, it's probably still being used... 
    the startup is still around I think..."

Quality: clarity=2.5, depth=2, specificity=1, grounding=1.5
response_score = (2.5×0.20) + (2×0.35) + (1×0.30) + (1.5×0.15) = 0.5 + 0.7 + 0.3 + 0.225 = 1.725

Signal fires: example_evasion + latency_mismatch (-2.0 - 0.5 = -2.5 penalty)

contribution = 1.725 - 2.5 = -0.775 → clamped to 0.0

topic_saturation_score = 2.2 + 0.0 = 2.2

Check: Is 2.2 >= 6.5? NO

PROBE AGAIN (final effort).
probe_rotation_index = 2 → tradeoff/decision probe

Turn 4 - Q (TRADEOFF PROBE): "If you built that auth endpoint, what were 
         the options you considered? Why did you choose the approach you took?"

A: "I... I'm not really sure. The team decided on the approach. I just 
    implemented it based on what they wanted..."

Quality: clarity=1.5, depth=1, specificity=0.5, grounding=1
response_score = (1.5×0.20) + (1×0.35) + (0.5×0.30) + (1×0.15) = 0.3 + 0.35 + 0.15 + 0.15 = 0.95

Signal fires: ownership_ambiguity + follow_up_collapse(-1.5 - 1.0 = -2.5 penalty)
             (Collapse because first answer seemed ~2.2 level, now ~1.0)

contribution = 0.95 - 2.5 = -1.55 → clamped to 0.0

topic_saturation_score = 2.2 + 0.0 = 2.2

After 4 turns, STILL at 2.2. Not approaching 6.5.

System decision: "This topic is showing a consistent pattern:
  - Can't articulate personal contribution (ownership_ambiguity ✗ 3x)
  - Can't explain decisions (follow_up_collapse ✗)
  - Uncertain about outcomes (example_evasion ✗)
  
  This is not going to reach saturation. The candidate genuinely doesn't 
  understand their own work. Move on with LOW CONFIDENCE FLAG."

MOVE_ON (with note: "topic_incomplete=true, confidence=0.2, pattern=evasion")

RESULT: Candidate's lack of understanding is EXPOSED through systematic probing.
        Recruiter sees the full picture: multiple ownership signals,
        evasion patterns, follow-up collapse.
        
        This is a LEAN NO HIRE signal — we caught it!
```

---

## EXAMPLE 3: MEDIUM CANDIDATE (2 Probes to Saturation)

### Scenario: Mid-level engineer, solid but not exceptional

**BEFORE (OLD SYSTEM):**
```
Turn 1 - Q: "Tell me about your backend work on Project: E-commerce Platform"

A: "I built the order processing service. Used Node.js with Express, 
    MongoDB for storage. Handled order validation, payment integration, 
    inventory updates. About 15k orders per day."

Quality: clarity=6.5, depth=6, specificity=6, grounding=6
Average ≈ 6.1

Turn 2 - Q: "What was the hardest part?"

A: "The trickiest part was handling inventory consistency when concurrent 
    orders came in. I implemented a reservation system with timeout logic..."

Quality: clarity=6.5, depth=6.5, specificity=6, grounding=6.5
Average ≈ 6.4

System: "Hit cap at 2 follow-ups. MOVE_ON"

RESULT: Left with questions:
- Did they actually make the architectural decisions, or just implement?
- Do they understand concurrency deeply, or just parroting?
- What's their actual ownership level?
```

**AFTER (NEW SYSTEM):**
```
Project: E-commerce Platform (HIGH topic, threshold=6.5)

Turn 1 - Q: "Tell me about your backend work?"

A: "I built the order processing service. Used Node.js with Express, 
    MongoDB for storage. Handled order validation, payment integration, 
    inventory updates. About 15k orders per day."

Quality: clarity=6.5, depth=6, specificity=6, grounding=6
response_score = (6.5×0.20) + (6×0.35) + (6×0.30) + (6×0.15) = 1.3 + 2.1 + 1.8 + 0.9 = 6.1

Signals: NONE

topic_saturation_score = 6.1

Check: Is 6.1 >= 6.5? NO (just barely!)

PROBE (need one more signal to reach certainty).
probe_rotation_index = 0 → ownership probe

Turn 2 - Q (OWNERSHIP): "In that service, which parts did YOU decide on versus 
         inherit from other services? What was your specific architectural choice?"

A: "Good question. I inherited the message queue infrastructure from another 
    team, but I designed the reservation and timeout system myself. Chose 
    MongoDB because we needed flexible schemas for order variants. Specific 
    choice: I implemented optimistic locking with version numbers instead 
    of distributed locks — would have been too slow."

Quality: clarity=7.5, depth=7, specificity=7.5, grounding=7.5
response_score = (7.5×0.20) + (7×0.35) + (7.5×0.30) + (7.5×0.15) = 1.5 + 2.45 + 2.25 + 1.125 = 7.325

Signals: NONE (clear ownership, concrete decision, reasoned tradeoff)

topic_saturation_score = 6.1 + 7.325 = 13.425

Check: Is 13.425 >= 6.5? YES ✓ (EXCEEDED)

MOVE_ON.

RESULT: This medium candidate clarified their ownership and made a thoughtful 
        architectural decision visible through the ownership probe. 
        2 answers (instead of forced 2) to reach saturation.
        
        Now we KNOW they can architect and make decisions.
        Signal strength: HIGH confidence hire for this skill.
```

---

## EXAMPLE 4: TIME PRESSURE (Smart Closing)

### Scenario: 5 minutes left, 2 uncovered topics

**BEFORE (OLD SYSTEM):**
```
Turn 1 (1 min): Start new topic (Project A)
Turn 2 (1 min): Follow-up 1
Turn 3 (1 min): Follow-up 2 (forced)
Turn 4 (1 min): MOVE_ON
Turn 5 (1 min): Goodbye

Result: Only covered 1 of 2 remaining topics. Project B = UNCOVERED.
```

**AFTER (NEW SYSTEM):**
```
Turn 1 (45 sec): Q on Project A

A: "I built the mobile app interface. Used React Native and Redux. 
    Shipped to iOS and Android."

response_score = 7.5 (good answer, no signals)
topic_saturation_score = 7.5

Is 7.5 >= threshold? YES (threshold was 5.0 for this topic)
→ MOVE_ON immediately (time pressure)

Turn 2 (45 sec): Q on Project B (different topic)

A: "The data pipeline project. Built ETL in Python. Processed 1M records daily."

response_score = 6.8
Check: Is 6.8 >= 5.0? YES
→ MOVE_ON

Remaining time: 2:30
Turn 3 (1 min): Wrap-up on JD must-have skill
Turn 4 (1 min): Final custom question
Turn 5 (30 sec): Goodbye

Result: Covered both projects A and B, got to 3 uncovered topics instead of 1.
        System adapted to time pressure intelligently.
```

---

## SUMMARY: Why This Works

| Metric | Before | After |
|--------|--------|-------|
| **Strong Candidate** | 3-4 min per topic (wastes time) | 1-2 min per topic (efficient) |
| **Weak Candidate** | Escapes after 2 vague answers | Exposed through 3-4 probes (signals) |
| **Medium Candidate** | Cut off before clarity | Reaches saturation with contextual probes |
| **Topics Covered** | 5-7 in 20 min | 8-12 in 20 min |
| **False Positives** | High (weak hires pass) | Low (weak hires exposed) |
| **False Negatives** | Low (good hires clear) | Low (good hires even clearer) |
| **Interview Quality** | Fixed, rigid | Adaptive, intelligent |

This is **High-Bandwidth Interviewing**: Same duration (20 min), more topics, higher quality signals.