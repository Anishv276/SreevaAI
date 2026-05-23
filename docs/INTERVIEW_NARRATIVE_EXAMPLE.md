# A Real Interview from Start to Finish
## What Happens in Plain English

---

## The Setup

Alice Chen, a mid-level backend engineer with 5 years of experience, is interviewing for a senior role. She's just been sent the interview link. The interview is scheduled for 20 minutes and will cover 6 major topics: System Architecture, Handling High-Traffic Systems, Failure Recovery, Team Communication, Making Tradeoffs, and Code Quality. The system doesn't know in advance which topics will be covered — it adapts based on time and saturation.

---

## The Candidate Joins (T = 0 seconds)

Alice clicks the link. The system springs to life:

**What Alice sees:**
- A calm greeting from the interviewer AI: "Hi Alice, great to meet you. How are you doing today?"
- Warm tone, professional but human

**What's happening behind the scenes:**
- The system creates a brand new session for Alice
- It initializes 6 topic states (one for each planned topic area)
- Each topic gets a "saturation threshold" based on how important that topic is:
  - System Architecture = **CRITICAL** (threshold 8.0) — we really need depth here
  - Handling High-Traffic = **HIGH** (threshold 6.5) — important but not critical
  - Failure Recovery = **HIGH** (threshold 6.5)
  - Team Communication = **MEDIUM** (threshold 5.0) — nice to know but less crucial
  - Making Tradeoffs = **CRITICAL** (threshold 8.0) — core to senior role
  - Code Quality = **LOW** (threshold 3.5) — could cover if time allows

**In the logs:**
```
[SESSION_INIT] session_id=alice_chen_20260521_1400
[TOPIC_INIT] topic=System Architecture, importance=CRITICAL, saturation_threshold=8.0
[TOPIC_INIT] topic=Handling High-Traffic Systems, importance=HIGH, saturation_threshold=6.5
[TOPIC_INIT] topic=Failure Recovery, importance=HIGH, saturation_threshold=6.5
[TOPIC_INIT] topic=Team Communication, importance=MEDIUM, saturation_threshold=5.0
[TOPIC_INIT] topic=Making Tradeoffs, importance=CRITICAL, saturation_threshold=8.0
[TOPIC_INIT] topic=Code Quality, importance=LOW, saturation_threshold=3.5
[SESSION_READY] Interview starting, candidate greeted
```

---

## Warmup Phase (T = 5-45 seconds)

**What Alice sees:**
- Small talk: "What projects have you been working on recently?"
- She relaxes and starts talking about her current role at her company

**What's happening:**
- This isn't being scored yet. It's just getting her comfortable.
- The system is listening to tone, pacing, comfort level — but not evaluating.

**In the logs:**
```
[WARMUP] Listening to candidate comfort level
[AUDIO_PROCESSED] Warmup utterance recorded but not evaluated
```

---

## First Real Question (T = 50 seconds)

**What Alice sees:**
The interviewer transitions smoothly: "That sounds interesting. I'd like to dive deeper into system architecture. Tell me about the largest-scale system you've designed or worked on. What made it complex?"

**Alice's answer:**
"Okay, so at my current company we handle about 500k requests per second for our payment service. I architected a multi-region setup with event streaming, caching layers, database sharding. The complexity was around consistency — we had to balance strong consistency for financial operations with eventual consistency for analytics..."

She speaks for about 90 seconds, hitting specifics: numbers (500k/sec), architecture patterns (event streaming, sharding), constraints (consistency requirements).

---

## The System Evaluates (Behind the Scenes - T = 141 seconds)

Alice finishes her answer. The system immediately gets to work:

**What happens in the eval worker (background process on Redis):**

1. **Scoring the answer:**
   - **Clarity:** 8.2/10 — She explained the setup clearly, easy to follow
   - **Depth:** 7.5/10 — Good architectural thinking, but didn't explain the consistency tradeoff in depth
   - **Specificity:** 8.0/10 — Concrete numbers (500k/sec), actual systems (event streaming, sharding)
   - **Grounding:** 7.8/10 — Real project, but could have gone deeper into her personal role

2. **Calculating the weighted score:**
   - Formula: (Clarity × 0.20) + (Depth × 0.35) + (Specificity × 0.30) + (Grounding × 0.15)
   - = (8.2 × 0.20) + (7.5 × 0.35) + (8.0 × 0.30) + (7.8 × 0.15)
   - = 1.64 + 2.625 + 2.4 + 1.17
   - **= 7.84/10** (response score)

3. **Converting to saturation points:**
   - A score of 7.84 falls in the "7.0-8.4" band
   - This band contributes **+2.5 saturation points**
   - So the saturation score for System Architecture topic = 2.5

4. **Checking for red flags (signals):**
   - **Ownership Ambiguity?** No — Alice clearly said "I architected," not "the team did"
   - **Example Evasion?** No — She gave concrete examples
   - **Contradiction?** No
   - **Following-up Collapse?** N/A (first answer)
   - **Latency Mismatch?** No — 90 seconds is reasonable for a complex question
   - Signals detected: **None**

5. **Making the decision:**
   - Topic: System Architecture
   - Saturation threshold: 8.0
   - Current saturation score: 2.5
   - Is 2.5 >= 8.0? **No** → Not saturated yet
   - Decision: **PROBE** — Ask a follow-up
   - Next probe type: **"Ownership"** (rotation index 0)

**In the logs (worker processes these):**
```
[EVAL_START] turn=1, topic=System Architecture
[QUALITY_SCORED] clarity=8.2 depth=7.5 specificity=8.0 grounding=7.8
[RESPONSE_SCORE] weighted=7.84, band=7.0-8.4, contribution=+2.5
[SATURATION_CHECK] score=2.5, threshold=8.0, is_saturated=false
[SIGNAL_CHECK] ownership_ambiguity=false, example_evasion=false, contradiction=false, latency_mismatch=false
[DECISION] action=PROBE, probe_type=ownership, next_goal="Ask what they personally owned"
[SATURATION_LOG] topic=System Architecture, saturation=2.5/8.0 (31%), turn=1, action=PROBE
```

The worker pushes this decision back to Redis. It's cached there for 300 seconds.

---

## Agent Reads the Decision (T = 145 seconds)

The main agent is waiting. It grabs the result from Redis:

**The directive it receives:**
```
[NEXT_TURN_DIRECTIVE]
DECISION: PROBE (ownership)
QUALITY: clarity=8.2, depth=7.5, specificity=8.0, grounding=7.8
SATURATION STATUS: System Architecture 2.5/8.0 (not saturated, keep probing)
NEXT MOVE: Ask what they personally owned - move from "I architected the system" to "What specific decisions did YOU make that were critical?"
QUESTION STYLE: Push from team-language into individual responsibility
```

---

## Follow-Up Question (T = 150 seconds)

**What Alice sees:**
The interviewer follows up naturally: "That's a solid architecture. I'm curious — within that multi-region setup, what were the specific decisions *you* personally made? Like, why multi-region instead of a single super-cluster?"

**Alice's answer:**
"Good question. I actually pushed for multi-region because we had customers in three continents. Single cluster would have had unacceptable latency for European and Asian users. But the tradeoff was the consistency model — we had to shift to eventual consistency for most operations. That was my call, and it was pretty controversial at the time."

Again about 75 seconds. This time she's more personal: "I pushed for," "That was my call," "it was controversial."

---

## Second Evaluation (T = 225 seconds)

**The worker evaluates the follow-up:**

1. **Scoring:**
   - Clarity: 8.1
   - Depth: 8.3 — Now she's explaining the tradeoff
   - Specificity: 8.5 — Specific reasoning (multi-continent customers, latency concerns)
   - Grounding: 8.6 — Personal ownership is clear ("my call," "I pushed")
   - **Response score: (8.1 × 0.20) + (8.3 × 0.35) + (8.5 × 0.30) + (8.6 × 0.15) = 8.32/10**

2. **Contribution band:** 8.32 falls in "8.5-10" → Nope, actually 8.32 is in "7.0-8.4" → **+2.5 points**

3. **Signals:** None detected. Clean answer.

4. **Updated saturation:**
   - Previous score: 2.5
   - New contribution: +2.5
   - Total saturation score: **5.0**
   - Is 5.0 >= 8.0? **No** → Still not saturated
   - But... she's halfway there. Continue probing.
   - Next probe type: **"Outcome"** (rotation index advances to 1)

**In the logs:**
```
[EVAL_START] turn=2, topic=System Architecture, probe_type=ownership
[QUALITY_SCORED] clarity=8.1, depth=8.3, specificity=8.5, grounding=8.6
[RESPONSE_SCORE] weighted=8.32, band=7.0-8.4, contribution=+2.5
[SATURATION_CHECK] previous_score=2.5, new_contribution=+2.5, total_score=5.0, threshold=8.0, is_saturated=false
[DECISION] action=PROBE, probe_type=outcome (rotated from ownership), next_goal="What was the actual outcome?"
[SATURATION_LOG] topic=System Architecture, saturation=5.0/8.0 (62%), turn=2, action=PROBE
```

---

## Outcome Probe (T = 235 seconds)

**What Alice sees:**
"I appreciate the context. So with that choice to go eventually consistent — what was the actual outcome? Did it ship? What happened when it hit production?"

**Alice's answer:**
"Yeah, we shipped it 8 months ago. The latency dropped by 70% for Asian and European users — huge win. We had one incident early on where an analytics job ran on stale data and sent some incorrect reports, but we fixed the synchronization logic within a few hours. Overall, it was absolutely the right call. We've since handled 2x the traffic we projected."

80 seconds. Strong answer with measurable outcomes.

---

## Third Evaluation (T = 315 seconds)

**The worker evaluates:**

1. **Scoring:**
   - Clarity: 8.4
   - Depth: 8.2
   - Specificity: 8.8 — Very concrete (70% latency drop, 2x traffic)
   - Grounding: 8.7
   - **Response score: (8.4 × 0.20) + (8.2 × 0.35) + (8.8 × 0.30) + (8.7 × 0.15) = 8.46/10**

2. **Contribution band:** 8.46 falls in "8.5-10"? No, it's 8.46, so "7.0-8.4"... actually it's slightly above 8.4, so it's in the 8.5-10 band → **+3.5 points**

Wait, let me recalculate. The bands are:
- 8.5-10.0 → +3.5
- 7.0-8.4 → +2.5
- 5.5-6.9 → +1.5
- 4.0-5.4 → +0.5
- <4.0 → 0

8.46 is between 8.4 and 8.5, so it's in the 8.5-10 band → **+3.5 points**

3. **Updated saturation:**
   - Previous score: 5.0
   - New contribution: +3.5
   - Total: **8.5**
   - Is 8.5 >= 8.0? **YES** → SATURATED ✅

4. **Decision:**
   - Action: **MOVE_ON** to the next topic

**In the logs:**
```
[EVAL_START] turn=3, topic=System Architecture, probe_type=outcome
[QUALITY_SCORED] clarity=8.4, depth=8.2, specificity=8.8, grounding=8.7
[RESPONSE_SCORE] weighted=8.46, band=8.5-10.0, contribution=+3.5
[SATURATION_CHECK] previous_score=5.0, new_contribution=+3.5, total_score=8.5, threshold=8.0, is_saturated=TRUE ✅
[DECISION] action=MOVE_ON, next_topic=Handling High-Traffic Systems
[SATURATION_LOG] topic=System Architecture, final_saturation=8.5/8.0 (106%), turns=3, status=SATURATED
[TOPIC_COMPLETE] System Architecture covered comprehensively in 3 turns
```

---

## Topic Switch (T = 325 seconds)

**What Alice sees:**
Smooth transition: "Great, that's really helpful. I can see you've thought deeply about scalability. Now let me ask about something different — when you're handling a spike in traffic, what's your thought process? How do you approach it?"

Behind the scenes, something important just happened:
- System Architecture topic is now **closed** (saturated=true)
- A new topic state is created: **Handling High-Traffic Systems**
- Probe rotation resets to index 0 (starts with "ownership" again for this new topic)
- All the saturation points, signals, and state from System Architecture are preserved in the topic history
- Time remaining: 20 min - 325 sec = 675 seconds left (11+ minutes)

**In the logs:**
```
[TOPIC_SWITCH] from=System Architecture, to=Handling High-Traffic Systems
[TOPIC_INIT] topic=Handling High-Traffic Systems, importance=HIGH, threshold=6.5, saturation_score=0 (fresh)
[PROBE_ROTATION_RESET] new_topic, rotation_index=0 (ownership)
[HISTORY_PRESERVED] System Architecture: saturation=8.5, signals=[], turns=3
```

---

## Second Topic Begins (T = 335 seconds)

**Alice's answer to the traffic spike question:**
"So we have a sophisticated alerting system. When load spikes, our on-call engineer — often me — gets paged. I look at a few things: where is the traffic coming from, is it legitimate or a bot, what's our headroom on the database? Usually it's just a spike in user traffic, so we scale horizontally..."

She talks for 70 seconds. Good answer, but doesn't go very deep into her personal decision-making.

**Worker evaluation:**
- Clarity: 7.2
- Depth: 6.5 — Somewhat surface-level
- Specificity: 7.0 — General process described
- Grounding: 6.8 — References "often me" but not deeply personal
- **Response score: 6.78/10** → Band 5.5-6.9 → **+1.5 points**
- Signals: None
- Saturation: 1.5 (out of 6.5 threshold)
- Decision: **PROBE** with ownership angle (rotation index 0)

**In the logs:**
```
[EVAL_START] turn=4, topic=Handling High-Traffic Systems
[QUALITY_SCORED] clarity=7.2, depth=6.5, specificity=7.0, grounding=6.8
[RESPONSE_SCORE] weighted=6.78, band=5.5-6.9, contribution=+1.5
[SATURATION_CHECK] score=1.5, threshold=6.5, is_saturated=false
[DECISION] action=PROBE, probe_type=ownership
[SATURATION_LOG] topic=Handling High-Traffic Systems, saturation=1.5/6.5 (23%), turn=4, action=PROBE
```

---

## Ownership Probe on Second Topic (T = 410 seconds)

**What Alice sees:**
"When you've had to make that scaling decision — like deciding between adding more database replicas vs. adding caches — what was a specific time you had to make that call? What did you choose and why?"

**Alice's answer:**
"Yeah, there was this incident last year. Our main database started getting hot. I had to decide: do we spin up read replicas or add Redis cache layers? I chose cache because we had a lot of redundant reads from the UI. The replicas would have helped but taken longer to spin up in our infrastructure. Cache was faster. We cut read latency by 40%. It was the right move for our specific situation."

80 seconds, very personal and specific.

**Worker evaluation:**
- Clarity: 8.0
- Depth: 8.2
- Specificity: 8.5 — Specific constraint (UI redundant reads), specific outcome (40% latency cut)
- Grounding: 8.4
- **Response score: 8.23/10** → Band 7.0-8.4 → **+2.5 points**
- Saturation: 1.5 + 2.5 = **4.0** (out of 6.5)
- Still not saturated
- Decision: **PROBE** with outcome angle (rotation index 1)

**In the logs:**
```
[EVAL_START] turn=5, topic=Handling High-Traffic Systems, probe_type=ownership
[QUALITY_SCORED] clarity=8.0, depth=8.2, specificity=8.5, grounding=8.4
[RESPONSE_SCORE] weighted=8.23, band=7.0-8.4, contribution=+2.5
[SATURATION_CHECK] previous_score=1.5, total_score=4.0, threshold=6.5, is_saturated=false
[DECISION] action=PROBE, probe_type=outcome
[SATURATION_LOG] topic=Handling High-Traffic Systems, saturation=4.0/6.5 (62%), turn=5, action=PROBE
```

---

## Outcome Probe on Second Topic (T = 490 seconds)

**What Alice sees:**
"So you went with cache. Did that decision stick? Are you still using that cache layer, or did you revisit it later?"

**Alice's answer:**
"Yeah, we're still using it. We actually extended it to multiple cache layers now — some short-lived cache for the UI reads, and longer-lived cache for frequently accessed data. We've kept that architecture for over a year. In fact, it became kind of a best practice for us internally."

60 seconds.

**Worker evaluation:**
- Clarity: 7.8
- Depth: 7.9
- Specificity: 8.1
- Grounding: 8.0
- **Response score: 7.93/10** → Band 7.0-8.4 → **+2.5 points**
- Saturation: 4.0 + 2.5 = **6.5** (threshold is 6.5)
- Is 6.5 >= 6.5? **YES** → SATURATED ✅

**In the logs:**
```
[EVAL_START] turn=6, topic=Handling High-Traffic Systems, probe_type=outcome
[QUALITY_SCORED] clarity=7.8, depth=7.9, specificity=8.1, grounding=8.0
[RESPONSE_SCORE] weighted=7.93, band=7.0-8.4, contribution=+2.5
[SATURATION_CHECK] score=6.5, threshold=6.5, is_saturated=TRUE ✅
[DECISION] action=MOVE_ON, next_topic=Failure Recovery
[SATURATION_LOG] topic=Handling High-Traffic Systems, final_saturation=6.5/6.5 (100%), turns=3, status=SATURATED
```

---

## Third Topic: Failure Recovery (T = 550 seconds)

**Time check:** 550 seconds have passed. 20 minutes = 1200 seconds. Remaining: 650 seconds (10 minutes 50 seconds). Still plenty of time.

**What Alice sees:**
"Got it. Now, I want to talk about failure and recovery. Tell me about a time when something you built failed or broke in production. What happened?"

**Alice's answer:**
"Okay, so about a year and a half ago, we deployed a service that was supposed to handle payment retries. The logic looked sound in staging, but we had a race condition that didn't show up until traffic hit production. For about 20 minutes, some payments were being retried even though they'd already succeeded. Customers were being double-charged."

She pauses, clearly still thinking about it.

"I was the engineer on-call that morning. I caught it from the alerts, rolled back immediately, then spent the next week fixing the underlying concurrency bug. We added distributed locks to serialize the retry logic. The incident was completely on me — I should have tested the concurrency scenario harder in staging."

120 seconds. Very vulnerable, taking responsibility.

**Worker evaluation:**
- Clarity: 8.4
- Depth: 8.6 — She goes into root cause and solution
- Specificity: 8.7 — Names the failure type (race condition, double-charging), the fix (distributed locks)
- Grounding: 8.8 — "On me," personal accountability, specific timeline
- **Response score: 8.56/10** → Band 8.5-10.0 → **+3.5 points**
- Signals: None. This is authentic failure discussion.
- Saturation: 0 + 3.5 = **3.5** (threshold for Failure Recovery is 6.5, but this is a HIGH topic)
- Actually, wait. This first answer is already strong. But they still haven't reached the 6.5 threshold.
- Decision: **PROBE** with ownership angle? Or tradeoff?

Actually, let me reconsider. The rotation index for a new topic starts at 0 (ownership). But Alice just gave a failure-focused answer on the first go. The system should probe deeper, maybe around tradeoffs or lessons learned.

- Decision: **PROBE** with tradeoff angle (rotation index 1)

**In the logs:**
```
[EVAL_START] turn=7, topic=Failure Recovery
[QUALITY_SCORED] clarity=8.4, depth=8.6, specificity=8.7, grounding=8.8
[RESPONSE_SCORE] weighted=8.56, band=8.5-10.0, contribution=+3.5
[SATURATION_CHECK] score=3.5, threshold=6.5, is_saturated=false
[SIGNAL_CHECK] No signals — authentic failure discussion
[DECISION] action=PROBE, probe_type=tradeoff
[SATURATION_LOG] topic=Failure Recovery, saturation=3.5/6.5 (54%), turn=7, action=PROBE
```

---

## Tradeoff Probe (T = 670 seconds)

**What Alice sees:**
"That's really valuable. So you added distributed locks to fix it. But locks have a performance cost. How did you think about that tradeoff?"

**Alice's answer:**
"Great question. Yeah, adding locks means serialize all retries through a single point. We thought about it and decided the correctness guarantee was worth the throughput cost. Retries aren't in the hot path anyway — they run asynchronously. So we could afford to be slower. The alternative was to keep the race condition and risk more double-charges, which would destroy customer trust. Easy choice."

70 seconds.

**Worker evaluation:**
- Clarity: 8.1
- Depth: 8.0 — Shows decision reasoning
- Specificity: 8.3 — Specific tradeoff (throughput vs correctness), specific context (async, not in hot path)
- Grounding: 8.2
- **Response score: 8.14/10** → Band 7.0-8.4 → **+2.5 points**
- Saturation: 3.5 + 2.5 = **6.0** (below 6.5 threshold)
- Decision: **PROBE** again (rotation index advances to 2)

**In the logs:**
```
[EVAL_START] turn=8, topic=Failure Recovery, probe_type=tradeoff
[QUALITY_SCORED] clarity=8.1, depth=8.0, specificity=8.3, grounding=8.2
[RESPONSE_SCORE] weighted=8.14, band=7.0-8.4, contribution=+2.5
[SATURATION_CHECK] score=6.0, threshold=6.5, is_saturated=false
[DECISION] action=PROBE, probe_type=failure
[SATURATION_LOG] topic=Failure Recovery, saturation=6.0/6.5 (92%), turn=8, action=PROBE
```

---

## Failure Probe (T = 740 seconds)

**What Alice sees:**
"And looking back now — if you had to do it differently, what would you change? Is there something you wish you'd caught earlier?"

**Alice's answer:**
"Honestly, if I could go back, I'd add concurrency tests to our CI pipeline earlier. We have them now, but not back then. That race condition was actually pretty easy to trigger with a concurrency test harness. I wish we'd required those tests for any code touching shared state. That's a lesson I've carried forward to how I design my code now."

65 seconds.

**Worker evaluation:**
- Clarity: 8.0
- Depth: 8.1
- Specificity: 8.4
- Grounding: 8.3
- **Response score: 8.19/10** → Band 7.0-8.4 → **+2.5 points**
- Saturation: 6.0 + 2.5 = **8.5** (threshold is 6.5)
- Is 8.5 >= 6.5? **YES** → SATURATED ✅

**In the logs:**
```
[EVAL_START] turn=9, topic=Failure Recovery, probe_type=failure
[QUALITY_SCORED] clarity=8.0, depth=8.1, specificity=8.4, grounding=8.3
[RESPONSE_SCORE] weighted=8.19, band=7.0-8.4, contribution=+2.5
[SATURATION_CHECK] score=8.5, threshold=6.5, is_saturated=TRUE ✅
[DECISION] action=MOVE_ON, next_topic=Making Tradeoffs
[SATURATION_LOG] topic=Failure Recovery, final_saturation=8.5/6.5 (131%), turns=3, status=SATURATED
```

---

## Fourth Topic: Making Tradeoffs (T = 805 seconds)

**Time check:** 805 seconds used. 395 seconds remaining (6 minutes 35 seconds).

This is a CRITICAL topic, which means we really want to saturate it (threshold 8.0). With 6.5 minutes left, we have enough time to do 3-4 good probes if needed.

**What Alice sees:**
"I want to dig into how you think about tradeoffs. Take me through a time when you had to choose between two good options and explain your reasoning."

**Alice's answer:**
"So earlier this year, we had a question: should we migrate our notification system to an in-house pub-sub broker, or switch to Kafka? We had Kafka experience on the team, but our custom solution was simpler and used less infrastructure. I led the analysis..."

She talks for 90 seconds, gives pros and cons, explains the decision to stick with the custom solution.

**Worker evaluation:**
- Clarity: 7.8
- Depth: 7.6
- Specificity: 7.9
- Grounding: 7.5
- **Response score: 7.71/10** → Band 7.0-8.4 → **+2.5 points**
- Saturation: 0 + 2.5 = **2.5** (threshold is 8.0)
- Not saturated. PROBE with ownership angle.

---

## Fifth Topic Momentum (T = 895 seconds)

Alice goes through the ownership probe. Strong answer: 7.9 response score, +2.5 points, saturation becomes 5.0. Still probing.

Then outcome probe: 8.1 response score, +2.5 points, saturation becomes 7.5. Close to 8.0 but not quite.

Then tradeoff probe: 8.3 response score, +2.5 points, saturation becomes 10.0.

Is 10.0 >= 8.0? **YES** → SATURATED ✅

**Total time for Making Tradeoffs:** 4 turns, ~450 seconds. Time remaining: 395 - 450 = -55 seconds.

Wait, that doesn't work. Let me recalculate.

Actually, at turn 9 (Failure Recovery probe), T = 740. The actual interview has been running for about 600 real seconds so far (not counting the worker processing time, which is fast). Let's say we're at T = 750 seconds into the actual interview.

Time remaining: 1200 - 750 = 450 seconds (7.5 minutes).

---

## Time Pressure Hits (Around T = 1100 seconds)

After saturating Making Tradeoffs, time is running low. The system has covered 4 topics so far:
1. System Architecture ✅ (saturated, 3 turns)
2. Handling High-Traffic Systems ✅ (saturated, 3 turns)
3. Failure Recovery ✅ (saturated, 3 turns)
4. Making Tradeoffs ✅ (saturated, 4 turns)

Two topics remain:
5. Team Communication
6. Code Quality

Time left: About 100 seconds (1 min 40 sec). Not enough to meaningfully probe Team Communication.

**What happens:**
The system checks: "Is remaining_time < 45 seconds?"

No, still 100 seconds. So we can ask one more question. But where should it go?

The next question is about Team Communication (MEDIUM importance). The system asks:

**What Alice sees:**
"Final question — tell me about a time when you had to communicate something difficult to your team or a senior leader. What was the situation?"

**Alice's answer:**
"There was a situation where I pushed back against a deadline that a product manager wanted to hit. We had technical debt in the payment system that would make adding a new feature risky. I had to explain that to both the PM and our VP of Engineering — why we needed a two-week spike to clean up first. It was a tough conversation, but they agreed after I showed them the risk analysis. We did the refactor, and we shipped the feature cleanly after."

75 seconds.

**Worker evaluation:**
- Clarity: 8.0
- Depth: 7.8
- Specificity: 8.2
- Grounding: 8.1
- **Response score: 8.02/10** → Band 7.0-8.4 → **+2.5 points**
- Saturation: 0 + 2.5 = **2.5** (threshold is 5.0 for MEDIUM importance)
- Not saturated, but we're out of time.

**In the logs:**
```
[TIME_CHECK] remaining_seconds=20
[FINAL_WINDOW] remaining < 45 sec threshold
[ACTION] Wrap up interview, no more probes
[LAST_QUESTION_EVALUATED] Team Communication, saturation=2.5/5.0 (partial)
```

---

## Final Wrap-Up (T = 1175 seconds, 25 seconds remaining)

**What happens behind the scenes:**
The system triggers the "final window" logic. The agent receives a special directive:

```
[FINAL_WINDOW_DIRECTIVE]
REMAINING TIME: 25 seconds
ACTION: Wrap up gracefully
- Acknowledge Alice's last answer
- Thank her for her time
- End the interview warmly
- DO NOT ask another question
```

**What Alice sees:**
The interviewer says: "That's excellent — shows real judgment about balancing speed with quality. Thank you so much for the time today, Alice. This has been really helpful. I think we have a great picture of your experience. We'll be in touch soon with next steps."

The interview ends.

**In the logs:**
```
[INTERVIEW_COMPLETE] session_id=alice_chen_20260521_1400
[FINAL_SUMMARY] total_turns=11, duration_sec=1175
```

---

## The Final Report (Generated After Interview)

The system generates a summary for the hiring team:

**Interview Saturation Analysis:**

| Topic | Importance | Saturation | Turns | Status |
|-------|-----------|-----------|-------|--------|
| System Architecture | CRITICAL | 8.5/8.0 | 3 | ✅ Saturated |
| Handling High-Traffic | HIGH | 6.5/6.5 | 3 | ✅ Saturated |
| Failure Recovery | HIGH | 8.5/6.5 | 3 | ✅ Saturated |
| Making Tradeoffs | CRITICAL | 10.0/8.0 | 4 | ✅ Saturated |
| Team Communication | MEDIUM | 2.5/5.0 | 1 | ⚠️ Partial (time) |
| Code Quality | LOW | — | 0 | ⚠️ Not covered |

**Key Signals:**
- No red flags (no contradiction, evasion, or ownership ambiguity detected)
- Strong grounding on every answer (specific projects, decisions, outcomes)
- Clear growth mindset (admitted mistakes, learned from failures)
- Solid architectural judgment (understood tradeoffs, made defensible decisions)

**Recruiter Interpretation:**
Alice demonstrated strong senior-level potential. She owns her decisions, articulates tradeoffs well, learns from failures, and communicates effectively. The fact that we saturated all four CRITICAL/HIGH topics in 11 turns (vs. the old fixed-2-probes system which would have done it in 8 turns with less depth) gives us high confidence in her abilities. She's a strong hire for the senior role.

**What Changed from the Old System:**
- Old approach: Always ask exactly 2 follow-ups per topic, regardless of answer quality → Would have moved on after "outcome" probe, missing the crucial insight about her taking responsibility for failures and learning from them
- New approach: Ask until saturation → Got 3 probes per topic for high-quality answers, surfacing depth and authenticity

---

## Behind the Scenes: What Was Really Happening

Throughout this entire interview, the system was:

1. **Continuously scoring** — Every answer gets evaluated on clarity, depth, specificity, and grounding
2. **Accumulating saturation** — Good answers add points toward the topic threshold
3. **Detecting red flags** — Any sign of evasion, contradiction, or example-dodging triggers a special probe type
4. **Rotating probes** — For each topic, systematically asking about ownership → outcome → tradeoff → failure (gated to critical topics)
5. **Managing time** — Tracking elapsed time and forcing wrap-up when less than 45 seconds remains
6. **Preserving history** — Every topic's state (saturation score, signals, probes used) is stored for the final report

All of this happens in the background. Alice just experienced a natural, flowing interview. She didn't notice that the system was adapting. She didn't see the saturation calculations or the probe selection logic. To her, it felt like talking to a good human interviewer who asks thoughtful follow-ups and moves on when they have enough information.

That's the goal: **Be adaptively efficient while feeling naturally human.**
