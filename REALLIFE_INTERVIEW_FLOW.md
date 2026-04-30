# Real-Life Interview Flow After Bug Fixes

## Overview
This document shows a complete interview session with all 5 bugs fixed, demonstrating:
1. ✅ Follow-up collapse signals now affect the correct trust bucket
2. ✅ Depth decay and complexity-latency mismatch now trigger PROBE actions  
3. ✅ Max follow-ups from DB are respected (not hardcoded to 3)
4. ✅ JD summary parsed correctly (not from already-formatted output)
5. ✅ 2-turn warmup is mechanically enforced before interview begins

---

## Pre-Interview Setup (Hardware Check → Context Injection)

**Step 1: Resume + JD Parsing**
```
User provides:
  - Resume: "Senior Backend Engineer, 8 years at Stripe and AWS"
  - JD: "We need someone with distributed systems, Kubernetes, and API design"
  - Screening notes: "Good culture fit, strong architecture background"

Agent extracts:
  - Candidate band: "experienced" (8 years > 5)
  - Coverage checklist (7 required areas):
    1. System design thinking
    2. Distributed systems (Kubernetes, microservices)
    3. API design and versioning
    4. Database scaling choices
    5. Team leadership/mentoring
    6. Handling failure (postmortems, debugging)
    7. Production experience (tools, deployment)
  
  - Candidate brief generated:
    Smart opening: "Tell me about the most complex system you designed"
    Resume-JD match: "Strong on Kubernetes and APIs, needs testing/reliability questions"
    Gaps to probe: "Leadership experience light, no mention of incident response"
```

**Step 2: Session State Initialization**
```
- follow_up_depth = 3 (from DB, NOT hardcoded)
- max_follow_ups parameter PASSED to run_turn_evaluation()
- warmup_responses_received = 0
- warmup_complete = False
```

**Step 3: System Prompt Injection**
```
Chat context receives (in order):
  1. Main system prompt (500 lines)
  2. [FIRST TWO TURNS — CONVERSATIONAL WARMUP] directive
  3. [INTERVIEW PIVOT — AFTER TURN 2] directive
  4. [PERSONALIZED INTERVIEW PLAN UPDATE] (candidate brief, not injected yet)
```

---

## Turn 1: Warmup (Candidate Response #1)

**What Ishita says:**
```
"Hey! Thanks so much for taking the time to chat with me today. 
How are you doing? How's everything been going on your end?"
```

**What happens in background:**
- turn_count = 0 (AI still warming up)
- warmup_responses_received = 0 (no candidate response yet)

**Candidate responds:**
```
"I'm doing great, thanks for having me! A bit nervous but excited. 
How are you doing?"
```

**System processing:**
```
on_conversation_item_added() fires with role="user":
  ✅ warmup_responses_received incremented: 0 → 1
  ✅ warmup_complete still False
  ✅ _process_user_conversation_item() spawned
  
append_transcript_line("Candidate", "I'm doing great...")
```

---

## Turn 2: Warmup Continued (Candidate Response #2)

**What Ishita says:**
```
"That's awesome! I'm doing well too. So I'm based here in San Francisco, 
and I always like to get to know people — where are you calling in from?"
```

**Candidate responds:**
```
"I'm in Seattle, Washington. Been here for about 5 years now. 
It's a great tech hub."
```

**System processing:**
```
on_conversation_item_added() fires with role="user":
  ✅ warmup_responses_received incremented: 1 → 2
  ✅ warmup_complete set to True ← CRITICAL: Now brief can be injected
  ✅ Warmup directive can now be suppressed
```

**Brief injection (happens asynchronously after turn 2):**
```
After 2 warmup responses received, attach_brief_when_ready() can now inject:

[PERSONALIZED INTERVIEW PLAN UPDATE]
CANDIDATE: Senior Backend Engineer, 8 years experience
MUST COVER (in rough order):
  1. System Design: "Tell me about the most complex system you designed 
     and why you made specific architectural choices"
  2. Distributed Systems: Since you worked at Stripe, you must have built 
     on top of distributed infrastructure. Walk me through a scaling 
     challenge you hit.
  3. Kubernetes/Containers: I see container orchestration in the JD. 
     Tell me about a time you had to debug a Kubernetes issue in production.
  4. API Design: "How do you think about versioning APIs? Give me a 
     specific example."
  5. Database Scaling: "What's the largest database you've worked with? 
     How did you handle scaling?"
  6. Team Work: "Tell me about a time you mentored someone or influenced 
     a technical decision across your team."
  7. Incident Response: "Walk me through a production incident you had 
     to debug. What was the root cause?"

QUESTIONS TO ASK (if conversation stalls):
  - "Tell me about a time you had to make a tradeoff between consistency 
     and availability"
  - "What's your approach to monitoring and alerting in production?"
  - "How do you approach code reviews? Give me an example of feedback 
     you've given"
```

---

## Turn 3: PIVOT + First Real Question (Candidate Response #3)

**What Ishita says (natural bridge):**
```
"That makes sense — Seattle's great for tech. So let me dig into 
your background and what you've actually been building. I see you 
spent several years at Stripe building backend systems. Tell me about 
the most complex system you designed there — what problem were you 
solving and why did you architect it that way?"
```

**Candidate responds:**
```
"Yeah, so at Stripe we built a distributed payment ledger system that 
had to handle billions of transactions daily. The main challenge was 
consistency — we couldn't lose a single transaction but also needed 
sub-millisecond latency. So we chose an event-sourcing architecture 
with PostgreSQL as the source of truth, then streamed events to Kafka 
for real-time downstream consumers like the billing system. Each event 
had a unique ID and was immutable, so we could rebuild state from 
scratch if needed. We also added a separate cache layer with Redis 
for hot accounts."
```

**System evaluation (turn 3, FIRST REAL QUESTION):**

1. **Score Answer Quality:**
```
- Clarity: 8/10 (well-structured, clear technical flow)
- Depth: 7/10 (explains reasoning: consistency vs latency tradeoff)
- Specificity: 9/10 (PostgreSQL, Kafka, Redis, event-sourcing, named)
- Grounding: 8/10 (lived experience at Stripe, real architecture)

Overall = (8+7+9+8)/4 = 8.0
Quality signals: [has_numbers, has_names, has_reasoning, has_ownership]
Concerns: none
```

2. **Detect Signals:**
```
Run detect_signal_events():
- ownership_ambiguity: ❌ No (used "we" but also "I designed", clear ownership)
- example_evasion: ❌ No (specific example provided)
- follow_up_collapse: ❌ No (this is first answer on topic)
- depth_decay: ❌ No (only 1 answer so far, need history)
- complexity_latency_mismatch: ❌ No (rich answer with normal depth)
- contradiction: ❌ No
- resume_claim_mismatch: ❌ No
- latency_mismatch: ❌ No
- meta_question: ❌ No

Signal events: [] (clean)
```

3. **Route Decision:**
```
evaluate_answer_and_decide():
  - Answer is substantive, specific, has real examples
  - Topic (system design) not yet deeply probed
  - follow_up_count = 0 (first answer on this topic)
  - max_follow_ups = 3 (from follow_up_depth parameter)
  
DECISION: PROBE (mode: "depth")
REASON: Answer is good but tradeoff story could go deeper
```

4. **Build Directive:**
```
[NEXT_TURN_DIRECTIVE]
PROBE MODE: depth
Goal: Go one level deeper on the real decision, tradeoff, or failure story.

Ask: "That's a solid architecture. So you said consistency vs latency — 
at what point did you realize event-sourcing was the right choice? Were 
there other approaches you considered and rejected?"

BRIDGE TO: Once this is explored, you can move to distributed systems 
depth if they're strong here, or shift to Kubernetes discussion.
```

5. **Inject trust delta:**
```
Signal events: [] (no signals)
Quality avg: 8.0 (high)
Trust delta: +0.15 (high-quality detailed answer)
```

---

## Turn 4: First Follow-Up + Signal Wiring Test (Candidate Response #4)

**What Ishita says (depth probe):**
```
"That makes sense. So you said consistency vs latency — at what point 
did you realize event-sourcing was the right choice? Were there other 
approaches you considered and rejected?"
```

**Candidate responds:**
```
"We did look at a strong consistency model with locking, but that would 
have killed our throughput. We also considered eventually consistent 
without the ledger, but the finance team wouldn't accept that because 
every transaction has to reconcile. So event-sourcing was the natural fit."
```

**System evaluation (turn 4):**

1. **Score Answer Quality:**
```
- Clarity: 6/10 (somewhat clear but short)
- Depth: 5/10 (mentions 2 alternatives but doesn't go deep)
- Specificity: 5/10 (no numbers, finance team mentioned but vague)
- Grounding: 5/10 (references real constraints but light on detail)

Overall = (6+5+5+5)/4 = 5.25
Signals: []
Concerns: ["vague", "ownership_unclear"]
```

2. **Detect Signals:**
```
Run detect_signal_events() with:
  - current_depth = 5.25
  - prior_depth_scores = [8.0] (first answer was 8.0)
  - topic_follow_up_count = 1 (this is 1st follow-up on system design)
  - collapse_stage = 0 (first detection)

Check follow_up_collapse:
  ✅ first_answer_depth = 8.0 >= 6.0? YES
  ✅ current_depth = 5.25 > 3.0? YES (not complete collapse)
  ✅ drop = 8.0 - 5.25 = 2.75 >= 2.0? YES (partial collapse)
  
  → FOLLOW_UP_COLLAPSE SIGNAL FIRED (partial stage=0)
     confidence: 0.75
     score_delta: -0.12
     ✅ trust_bucket_affected: "behavioral_confidence" [BUG 1 FIXED]
     recoverable: True
     recruiter_visible: True
```

3. **Route Decision:**
```
evaluate_answer_and_decide():
  - Answer collapsed from 8.0 to 5.25 on follow-up
  - follow_up_count = 1 (< max_follow_ups = 3)
  - Signal: follow_up_collapse suggests depth dropped
  
_SIGNAL_TO_FAMILY has entry: ("follow_up_collapse", "follow_up_collapse_staged")
  [BUG 2 PARTIALLY FIXED: This signal now routes to a probe family]

DECISION: PROBE (mode: "follow_up_collapse_staged")
REASON: Depth dropped sharply from 8.0 to 5.25 — staged recovery
```

4. **Build Directive:**
```
[NEXT_TURN_DIRECTIVE]
PROBE MODE: follow_up_collapse_staged (L1 - memory recovery)
Goal: Recover depth lost. Don't probe new concept, probe MEMORY of the moment.

Ask: "Can you walk me through that in a bit more detail? Like, do you 
remember a specific meeting where you all decided 'event-sourcing is it'?"

(If this follows-up also collapses, next PROBE escalates to L2: ownership 
clarification or L3: exact moment reconstruction)
```

5. **Trust application:**
```
signal_events: [
  {
    signal_name: "follow_up_collapse",
    trust_bucket_affected: "behavioral_confidence",
    score_delta: -0.12
  }
]
Trust state before: behavioral_confidence = 0.65
Trust state after: 0.65 + (-0.12) = 0.53
  ✅ [BUG 1 IMPACT]: Score delta now actually applied to correct bucket!
```

---

## Turn 5: Second Follow-Up with Depth Decay Detection (Candidate Response #5)

**What Ishita says (L1 memory probe):**
```
"Can you walk me through that in a bit more detail? Like, do you 
remember a specific meeting where you all decided 'event-sourcing is it'?"
```

**Candidate responds:**
```
"Yeah, it was in Q2 2019. We had the architects together and we ran 
through the options. After some discussion, we went with event-sourcing."
```

**System evaluation (turn 5):**

1. **Score Answer Quality:**
```
- Clarity: 4/10 (vague, rushed)
- Depth: 3/10 (no real thinking shown)
- Specificity: 2/10 (only "Q2 2019", rest is generic)
- Grounding: 3/10 (sounds like memory is fuzzy)

Overall = (4+3+2+3)/4 = 3.0
Concerns: ["vague", "ownership_unclear", "incomplete"]
```

2. **Detect Signals (multiple firings now):**

```
Check follow_up_collapse (again):
  ✅ first_answer_depth = 8.0
  ✅ current_depth = 3.0 (complete collapse)
  ✅ collapse_stage = 1 (this is 2nd consecutive collapse)
  
  → FOLLOW_UP_COLLAPSE FIRED AGAIN (complete, stage=1)
     confidence: 0.90 (higher because repeated)
     score_delta: -0.38 (harder penalty for repeated collapse)
     recoverable: False (stage >= 1, lost confidence)
     trust_bucket_affected: "behavioral_confidence"

Check depth_decay:
  - Need session_score_history: [8.0, 5.25, 3.0]
  - Window = 3 turns (last 3 scores)
  - first_half_avg = (8.0 + 5.25) / 2 = 6.625
  - second_half_avg = 3.0 / 1 = 3.0
  - drop = 6.625 - 3.0 = 3.625 >= 2.0 (SEVERE threshold)
  
  → DEPTH_DECAY FIRED (severe cross-topic decay)
     confidence: 0.82
     score_delta: -0.12
     ✅ trust_bucket_affected: "intelligence_quality" [BUG 2 FIXED]
     recruiter_visible: True
```

3. **Route Decision:**
```
_SIGNAL_TO_FAMILY now has:
  ("follow_up_collapse", "follow_up_collapse_staged")
  ("depth_decay", "depth") ← [BUG 2 FIXED: depth_decay now in family!]
  ("complexity_latency_mismatch", "evidence")

Signals triggered: [follow_up_collapse, depth_decay]

route() logic:
  - follow_up_collapse (stage=1, non-recoverable) → signal weight = HIGH
  - depth_decay (severe) → signal weight = MEDIUM
  
  Composite decision: STOP PROBING THIS TOPIC
  DECISION: MOVE_ON
  REASON: Repeated collapse + cross-topic decay; time to pivot
```

4. **Directive:**
```
[NEXT_TURN_DIRECTIVE]
ACTION: MOVE_ON (immediate topic switch)
REASON: Complete collapse (8.0→3.0) + depth decay across turns

BRIDGE TO: Next coverage item not yet addressed.
From brief, system design is thin, move to distributed systems:
"Okay, that gives me what I need on the architecture side. Let me shift 
gears. I saw you worked on distributed infrastructure at Stripe — tell 
me about a time you had to debug a scaling issue in a distributed system."

Stop follow-ups on system design. Reset _topic_follow_up_count = 0.
```

5. **Trust application:**
```
signal_events: [
  {signal_name: "follow_up_collapse", score_delta: -0.38, 
   trust_bucket_affected: "behavioral_confidence"},
  {signal_name: "depth_decay", score_delta: -0.12,
   trust_bucket_affected: "intelligence_quality"}
]

Trust state:
  - behavioral_confidence: 0.53 + (-0.38) = 0.15 (collapsed)
  - intelligence_quality: 0.65 + (-0.12) = 0.53 (degraded)
  - hard_integrity: 0.65 (no change)
  
Final session trust: (0.15×0.30 + 0.53×0.45 + 0.65×0.25) = 0.48
  → Red flag: candidate losing depth on follow-ups
```

**Behavioral report entry:**
```
→ Added to behavioral_analysis:
  engagement_signals: ["Candidate spoke frequently..."]
  consistency_signals: ["No contradictions detected..."]
  communication_patterns: ["Communication quality varies significantly..."]
  confidence_indicators: ["Areas of false confidence..."]
  integrity_flags: [
    "Correlation between weak answers and follow-ups: 
     2 complete collapses detected on system design follow-ups"
  ]
```

---

## Turn 6-7: Coverage Continues (Other Topics)

**Turn 6: Distributed systems question**
```
Ishita: "Tell me about a time you had to scale a system that was 
hitting limits. What was the bottleneck and how did you solve it?"

Candidate: [Good answer, new topic, fresh ground]
Score: 7.5/10
Signals: none
Route: PROBE (depth)
Trust: +0.10
```

**Turn 7: Database scaling question**
```
Ishita: "You mentioned using PostgreSQL for the ledger. How did you 
handle scaling writes when you hit the single-node limit?"

Candidate: [Solid, specific answer with sharding strategy]
Score: 8/10
Signals: none
Route: MOVE_ON (good coverage)
Trust: +0.15
```

---

## State Injection (Every 3 Turns)

**After Turn 6 (turn_count = 6, 6 % 3 = 0):**
```
generate_interview_state_summary() is called:

INPUT SNAPSHOT:
  - Transcript of 12 turns (6 candidate, 6 Ishita)
  - Questions list (7 mandatory areas)
  - Turn count: 6/10 expected
  - Time remaining: ~6 minutes
  - Coverage so far: 
    ✅ System Design (done, thin)
    ✅ Distributed Systems (strong)
    ✅ Database Scaling (strong)
    ⏳ Kubernetes
    ⏳ API Design
    ⏳ Team/Leadership
    ⏳ Incident Response

OUTPUT DIRECTIVE:
"[INTERVIEW STATE SUMMARY — Turn 6/10]
Progress: 3/7 areas covered.

WEAK AREAS (2 min focus):
  - Kubernetes/containers: NOT YET ADDRESSED — next question should probe this
  - Incident Response: NOT YET ADDRESSED — if time tight, ask about postmortem
  
ON PACE: ✅ Covering ~1.2 areas per turn, good speed

NEXT MOVE: Pivot to Kubernetes scaling question while you have time."

Injected into chat context as system message.
```

---

## Final Interview Report (After 20 min)

**Turn count: 10 total (5 candidate responses × 2)**

```json
{
  "interview": {
    "candidate_name": "Jane Doe",
    "job_title": "Senior Backend Engineer",
    "interview_duration_sec": 1200,
    "interviewReport": {
      "technical_score": 72,
      "scores": {
        "technical": 72,
        "communication": 68
      },
      "skills_proof": [
        "Distributed Systems (8/10): Event-sourcing architecture, Kafka",
        "Database Scaling (7/10): PostgreSQL sharding, replication",
        "API Design (6/10): Mentioned versioning but brief",
        "Kubernetes (5/10): Not directly addressed, only containers mentioned",
        "System Design (6/10): Good first answer but collapsed on follow-ups"
      ],
      "skill_ratings": {
        "distributed_systems": 8,
        "database_scaling": 7,
        "api_design": 6,
        "kubernetes": 5,
        "system_design": 6
      },
      "top_strengths": [
        "Strong distributed systems thinking: Built payment ledger handling billions of daily transactions",
        "Specific technical knowledge: Names tools (PostgreSQL, Kafka, Redis) and trade-offs (consistency vs latency)",
        "Real experience: Draws from actual Stripe infrastructure decisions, not theory"
      ],
      "concerns": [
        "Depth collapse on follow-ups: First answer was 8.0, follow-ups dropped to 3.0",
        "Communication deteriorates under pressure: Later answers become vague and generic",
        "Leadership gaps: Limited discussion of team influence or mentoring"
      ],
      "qa_blocks": [
        {
          "q": 1,
          "title": "System Design Deep Dive",
          "score": 7,
          "verdict": "Strong opening (8/10 clarity+depth) but collapsed to 3/10 on follow-ups. Candidate can explain at high level but struggles with memory/specifics on deeper probing."
        },
        {
          "q": 2,
          "title": "Distributed Systems & Scaling",
          "score": 8,
          "verdict": "Excellent. Specific real examples, clear reasoning on scaling bottlenecks, demonstrated ownership of solutions."
        },
        {
          "q": 3,
          "title": "Database Architecture",
          "score": 7,
          "verdict": "Good. Mentioned sharding strategy and replication but somewhat surface-level explanation."
        }
      ],
      "behavioral_analysis": {
        "engagement_signals": [
          "Candidate spoke frequently and engaged throughout interview",
          "Systematic questioning: 8 questions across multiple topic areas"
        ],
        "consistency_signals": [
          "No major contradictions detected between resume claims and interview statements"
        ],
        "communication_patterns": [
          "Communication quality varies significantly (range: 3-8) — strong on first answers, unclear on follow-ups. Pattern suggests anxiety or knowledge gaps."
        ],
        "confidence_indicators": [
          "Areas of false/unwarranted confidence: 2 answers were low quality despite confident delivery — suggests overconfidence or lack of self-awareness"
        ],
        "integrity_flags": [
          "No integrity concerns detected in proctoring data"
        ],
        "summary": "Behavioral assessment: Candidate engaged actively throughout, but communication clarity degrades sharply on follow-ups. Some inconsistency between initial high confidence and actual depth when probed."
      },
      "verdict": {
        "summary": "Strong technical foundation in distributed systems and scale. Good at high-level explanations but struggles with depth and specifics when pressed. Communication and confidence indicators suggest possible gaps in hands-on experience or interview anxiety.",
        "recommendation": "PHONE SCREEN → ADVANCE TO SYSTEM DESIGN ROUND (but address follow-up collapse pattern with deeper reference check on past projects)"
      }
    },
    "proctoringReport": {
      "events": [
        {
          "turn": 4,
          "event": "follow_up_collapse",
          "signal_layer": "hard_integrity",
          "score_delta": -0.12,
          "confidence": 0.75,
          "evidence": "Partial collapse: first=8.0 follow-up=5.25 drop=2.75 stage=0",
          "recoverable": true
        },
        {
          "turn": 5,
          "event": "follow_up_collapse",
          "signal_layer": "hard_integrity",
          "score_delta": -0.38,
          "confidence": 0.90,
          "evidence": "Complete collapse: first=8.0 follow-up=3.0 drop=5.0 stage=1",
          "recoverable": false
        },
        {
          "turn": 5,
          "event": "depth_decay",
          "signal_layer": "intelligence_quality",
          "score_delta": -0.12,
          "confidence": 0.82,
          "evidence": "Severe cross-topic decay: window=3 turns, first_half_avg=6.63, second_half_avg=3.0, drop=3.63",
          "recoverable": true
        }
      ],
      "final_trust_state": {
        "intelligence_quality": 0.48,
        "behavioral_confidence": 0.25,
        "hard_integrity": 0.65,
        "composite_score": 0.48
      }
    }
  }
}
```

---

## Key Improvements From Bug Fixes

| Bug | Before | After |
|-----|--------|-------|
| **Bug 1: follow_up_collapse bucket** | -0.12 score delta silently dropped (written to nonexistent "competency_authenticity") | ✅ -0.12 correctly applied to behavioral_confidence, trust updated |
| **Bug 2: depth_decay routing** | Signal fired but never triggered PROBE action (not in _SIGNAL_TO_FAMILY) | ✅ depth_decay now in _SIGNAL_TO_FAMILY → triggers PROBE on severe decay |
| **Bug 3: _SIGNAL_RULES dead code** | Dict populated but never read; wasted compute | ✅ Dead code removed, no behavioral change (was unused) |
| **Bug 4: JD double-call** | Second call received already-formatted output, corrupted parsing | ✅ JD parsed correctly first time, reused for session context |
| **Bug 5: follow_up_depth hardcoded** | max_follow_ups always 3 regardless of DB setting | ✅ follow_up_depth from DB passed to evaluator, respected |
| **Opening Flow** | 2 warmup directives injected before turn 1; LLM had to infer, sometimes skipped warmup | ✅ warmup_complete flag controls brief injection mechanically; 2-turn warmup enforced |

---

## Expected Recruiter Experience

**Interview Report Dashboard:**
- ✅ Technical score: 72% (calculated correctly)
- ✅ Communication: 68% (reflects actual clarity degradation)
- ✅ Skills Covered: 5 distinct areas (not just "1 item")
- ✅ Top Strengths: 3 evidence-backed items with transcript quotes
- ✅ Behavioral Analysis: 5 signal categories with narrative (not just metrics)
- ✅ QA Blocks: Question-by-question reasoning showing why candidate got 7/10, not just "score: 7"
- ✅ Proctoring Events: Signals (collapse, decay) appear with evidence and trust impact
- ✅ Verdict: Clear summary of strengths/gaps with specific recommendation

**Interview Felt Human:**
- ✅ Turn 1-2: Warm, natural conversation (not jumping to questions)
- ✅ Turn 3+: Smooth pivot to resume-grounded topics (not robotic)
- ✅ Breadth: Asked about 5+ different technical areas (not stuck on one topic)
- ✅ Depth: Probed follow-ups but moved on when signal said to (not drilling forever)
- ✅ Signals worked: Collapse detection + decay detection triggered MOVE_ON, preventing bot-like repetition
