# Interview Walkthrough: A Real Example

## The Candidate

**Name:** Priya Sharma  
**Experience:** 4 years as Backend Engineer  
**Applying for:** Senior Backend Engineer at TechCorp  
**Time limit:** 20 minutes

---

## Resume & JD Data

### Candidate Resume (Priya's Skills)
```
Technical Skills: Python, Go, PostgreSQL, Redis, Docker, Kubernetes, AWS, gRPC, Kafka
Experience:
- 2 years: Backend Engineer at StartupA (REST APIs, database optimization)
- 2 years: Senior Backend Engineer at ScaleupB (microservices, incident response)

Projects:
- Built real-time payment processing system (Go, PostgreSQL, Redis caching)
- Led migration of monolith to microservices
- Optimized database queries, improved P95 latency by 40%
```

### Job Description (TechCorp Requirements)
```
Senior Backend Engineer

Must-Have Skills:
- Python backend development
- Distributed systems & microservices
- Database design & optimization
- System reliability & incident management
- Team leadership

Experience Required: 5-10 years
```

---

## Session Initialization (Pre-Interview)

### Step 1: Parse Resume
```python
resume_context.skills = [
    "Python", "Go", "PostgreSQL", "Redis", "Docker", 
    "Kubernetes", "AWS", "gRPC", "Kafka"
]
resume_context.years_of_experience = 4
```

### Step 2: Infer Band
```python
infer_candidate_band(resume_context)
  → 4 years falls in range (1.5–5)
  → returns "mid"

session_context.candidate_band = "mid"
```

✓ **Decision:** This is a **mid-level candidate**, not senior (only 4 years, not 5+)

---

### Step 3: Extract JD Must-Haves
```python
jd_must_haves = _extract_jd_must_haves(job_details)
  → ["Python backend development", "Distributed systems & microservices", 
     "Database design & optimization", "System reliability & incident management", 
     "Team leadership"]
```

### Step 4: Extract Critical Skills (Resume ∩ JD)
```python
resume_skills = ["Python", "Go", "PostgreSQL", "Redis", "Docker", "Kubernetes", ...]
jd_must_haves = ["Python...", "Distributed systems...", "Database...", "System reliability...", "Team..."]

extract_critical_skills(jd_must_haves, resume_skills):
  Tokenize resume: {python, go, postgresql, redis, docker, kubernetes, aws, grpc, kafka}
  Tokenize each JD skill:
    - "Python backend" → {python, backend} → matches "python" ✓
    - "Distributed systems" → {distributed, systems} → no match ✗
    - "Database design" → {database, design} → no match ✗
    - "System reliability" → {system, reliability} → matches none ✗
    - "Team leadership" → {team, leadership} → no match ✗
  
  Fallback: No word overlap on most JD skills, so use top 3 from JD directly:
  critical_skills = ["Python backend development", 
                     "Distributed systems & microservices", 
                     "Database design & optimization"]
```

✓ **Result:** Focus Phase 3 on these 3 critical skills only

### Step 5: Generate Question Bank (LLM Call)

**LLM Receives:**
```
CANDIDATE: Priya
ROLE: Senior Backend Engineer
BAND: mid

CRITICAL SKILLS TO PROBE IN PHASE 3:
- Python backend development
- Distributed systems & microservices
- Database design & optimization

JOB DESCRIPTION:
Senior Backend Engineer. Must-Have: Python, microservices, database optimization, 
incident management, team leadership...

CANDIDATE RESUME:
4 years backend. Python, Go, PostgreSQL, Redis, Docker, Kubernetes...
- Built payment processing system (Go, PostgreSQL, Redis)
- Led monolith to microservices migration
- Optimized queries, improved latency 40%
```

**LLM Generates (Band = "mid"):**

Using the **MID-LEVEL Phase 1 block:**
```
PHASE 1 — BACKGROUND (exactly 5 questions, MID-LEVEL band):
Q1 [OPENING]: Most specific question about a feature or system they owned end-to-end...
Q2 [OWNERSHIP]: A decision they made alone...
Q3 [JD-RESPONSIBILITY]: A core JD responsibility...
Q4 [GAP]: A JD requirement missing or thin in resume...
Q5 [IMPACT]: What changed because of their work...
```

Using the **MID-LEVEL Phase 3 block:**
```
PHASE 3 — SKILLS (7-8 questions, MID-LEVEL band):
Focus: implementation depth, measurable outcomes, collaboration under pressure.
Q6 [SKILL:python] Hands-on question about primary JD skill...
Q7 [SKILL:microservices] Question about distributed systems...
Q8 [SKILL:database] Question about database work...
...
```

**Final LLM Output (Full Question Bank):**
```
BRIEF:
Band: mid
Tone: Direct. Expect personal ownership, not team-level answers.
Depth: Ask for specifics on decisions they made solo, implementation detail, impact.
Probe pressure: Push back if they say "we" — ask what they personally did.
Opener style: Start with their most significant technical contribution.

QUESTION BANK:

PHASE 1 — BACKGROUND:
Q1. [OPENING] You led a monolith-to-microservices migration at ScaleupB. 
     Walk me through what YOU personally designed and owned in that migration.
Strong: Specific architectural decisions, why they chose certain patterns, trade-offs considered, metrics.
Weak: "We migrated to microservices" or "the team decided..."
Probes: "What service broke first?", "What would you do differently now?"

Q2. [OWNERSHIP] Tell me about a major technical decision you made solo that went 
     against what others initially wanted.
Strong: Clear context, why they disagreed, what they proposed, outcome, what changed.
Weak: "I suggested something and we went with it."
Probes: "How did you convince them?", "What was the risk if you were wrong?"

Q3. [JD-RESPONSIBILITY] The role requires database design expertise. Tell me about 
     a schema design or optimization you led.
Strong: Constraints, trade-offs (normalization vs. denormalization), scaling strategy.
Weak: "I used PostgreSQL" or "we optimized queries."
Probes: "What was the before/after latency?", "How would you handle 10x growth?"

Q4. [GAP:leadership] The role mentions team leadership. Your resume shows 4 years 
     of experience but no explicit mentoring or team lead role. What leadership 
     experience do you have?
Strong: Specific example (onboarded team members, code reviews that changed their approach, design doc review).
Weak: "I helped junior developers" or "I did code reviews."
Probes: "Give me one specific person you mentored.", "How did they grow?"

Q5. [IMPACT] You optimized queries and improved P95 latency by 40%. Walk me through 
     that project from start to finish.
Strong: Baseline metric, investigation process, what they changed, final metric, business impact.
Weak: "We used indexes" or "it was faster."
Probes: "Which query was the bottleneck?", "Would you still make the same change?"

PHASE 2 — (reserved)

PHASE 3 — SKILLS:
Q6. [SKILL:python] You've used both Python and Go. Tell me about the hardest 
     Python backend problem you've solved.
Strong: Complex concurrency issue, performance tuning, system design decision.
Weak: Generic "Python is good" or framework name-drop.
Probes: "What Go would you have used here instead?", "How did you test it?"

Q7. [SKILL:microservices] At scale, microservices coordination is hard. Tell me 
     about a specific inter-service failure or synchronization issue you debugged.
Strong: Specific failure mode (cascading failure, distributed transaction issue, race condition), how they diagnosed it.
Weak: "Microservices are complex" or "we use event streaming."
Probes: "How did you trace it?", "Would you redesign the communication pattern?"

Q8. [SKILL:database] You used both PostgreSQL and Redis. Tell me about a time 
     you had to choose between consistency and availability.
Strong: Real scenario, trade-off analysis, what they chose and why, what trade-offs they accepted.
Weak: "PostgreSQL is consistent" or "Redis is fast."
Probes: "What if requirements changed?", "How would you test this?"

Q9. [STRENGTH] What's your strongest technical domain?
Strong: Honest answer (e.g. "designing resilient systems" or "database optimization").
Weak: "Everything" or overly broad.
Probes: [Follow-up based on their answer]

Q10. [WEAKNESS] Where do you feel least confident technically?
Strong: Honest, specific area they're actively learning (e.g. "Kubernetes networking is new to me").
Weak: "Nothing" or humble-brag.
Probes: [Follow-up to understand if it matters for the role]

Q11. [WATCHOUT] Your resume mentions "Led monolith to microservices" but doesn't detail 
      your specific ownership. Was this your decision, or did you execute someone else's plan?
Strong: Clear about their scope (decision-maker vs. implementer), specific decisions they made.
Weak: Vague or deflects to team.
Probes: [Follow-up based on answer]

Q12. [CUSTOM] The role emphasizes incident response and reliability culture. Tell me about 
      your experience handling production incidents.
Strong: Specific incident, severity, root cause, their role, what changed after.
Weak: "We had incidents" or "I'm on-call."
Probes: [Follow-up on their decision-making during crisis]
```

### Step 6: Parse Question Bank
```python
parse_question_bank(full_output)
  → Returns QuestionBank object:
     phase1 = [Q1, Q2, Q3, Q4, Q5]  (5 questions)
     phase3 = [Q6, Q7, Q8, Q9, Q10, Q11, Q12]  (7 questions, full list)

session_context.question_bank = QuestionBank(...)
```

### Step 7: Filter Phase 3 to Critical Skills
```python
critical_skills = ["Python backend development", 
                   "Distributed systems & microservices", 
                   "Database design & optimization"]

filter_phase3_by_critical_skills(phase3, critical_skills):
  Tokenize critical: {python, backend, development, distributed, systems, microservices, database, design, optimization}
  
  For each Q in phase3:
    Q6 [SKILL:python] → tag_tokens = {python} → matches "python" ✓ → KEEP (skill_count=1)
    Q7 [SKILL:microservices] → tag_tokens = {microservices} → matches "microservices" ✓ → KEEP (skill_count=2)
    Q8 [SKILL:database] → tag_tokens = {database} → matches "database" ✓ → KEEP (skill_count=3)
    Q9 [STRENGTH] → not a SKILL tag → KEEP (strength/weakness/watchout/custom always kept)
    Q10 [WEAKNESS] → KEEP
    Q11 [WATCHOUT] → KEEP
    Q12 [CUSTOM] → KEEP
  
  Filtered = [Q6, Q7, Q8, Q9, Q10, Q11, Q12]  (7 questions, critical skills matched)
```

✓ **Result:** All 7 Phase 3 questions kept because they matched critical skills or are always-included tags

---

## Interview Starts (Real Time)

### 0–3 seconds: GREETING (Outside Question Bank)
```
Ishita (scripted, cannot be interrupted):
"Hi Priya! I'm Ishita, an AI interviewer. Thanks for joining this 20-minute 
interview for the Senior Backend Engineer role at TechCorp. Let's explore 
your background and technical depth. You ready?"

Priya: "Yes, let's do it!"

greeting_delivered_at = recorded
```

### 3–20 seconds: WARMUP (Runtime Phase 1, Outside Question Bank)
```
Ishita (from warmup directive, not from question bank):
"Great! So tell me a bit about yourself and what brought you to apply for this role."

Priya: "I've been a backend engineer for 4 years, worked at two companies, 
built distributed systems, and I'm really interested in reliability and scale..."

warmup_responses_received = 1

Ishita: "That's great. What excites you most about this specific role?"

Priya: "TechCorp's scale is incredible. I want to work on high-reliability systems..."

warmup_responses_received = 2
warmup_complete = True  ← TRIGGER
```

### 20–45 seconds: PHASE 1 QUESTIONS (From Question Bank, Runtime Phase 2)
```
Remove [PHASE 1 WARMUP DIRECTIVE] from system prompt
Inject: [INTERVIEW BRIEF + QUESTION BANK]
  - BRIEF card (tone, depth, probe pressure, opener style)
  - PHASE 1 questions (Q1-Q5)
  - PHASE 3 questions (Q6-Q12, filtered to critical skills)

Ishita (now reading from question bank):
"You led a monolith-to-microservices migration at ScaleupB. Walk me through 
what YOU personally designed and owned in that migration."

Priya: "Sure. So the system was getting too slow. I proposed breaking it into 
services around payment, inventory, and orders. I personally led the payment 
service design..."

[Ishita probes based on Strong/Weak patterns from Q1]
Ishita: "What broke first when you started splitting things?"
Priya: "The async job queue. We had to rethink how services communicated..."

[Q1 covered, move to Q2]
Ishita: "Tell me about a major technical decision you made solo that went 
against what others initially wanted."
Priya: "Yes, I pushed for event-driven architecture instead of direct API calls. 
The team thought it was overengineering..."

[Continue Q3, Q4, Q5...]
```

### 45–60 seconds: PHASE 3 SKILLS (From Question Bank, Runtime Phase 3)
```
Ishita (still reading from same question bank injection):
"You've used both Python and Go. Tell me about the hardest Python backend 
problem you've solved."

Priya: "The payment processing system had race conditions in concurrent transactions. 
I used distributed locks with Redis..."

Ishita: "What Go would you have used here instead?"
Priya: "Go's goroutine model is more efficient for this, actually..."

[Q6 covered, Q7...]
Ishita: "At scale, microservices coordination is hard. Tell me about a specific 
inter-service failure you debugged."
Priya: "During Black Friday, our order service downstream was slow. We discovered 
the payment service was timing out..."

[Continue Q8-Q12...]

[At 60s mark, interview ends]
```

---

## Session Context After Interview

```python
session_context.candidate_band = "mid"
session_context.critical_skills = [
    "Python backend development",
    "Distributed systems & microservices",
    "Database design & optimization"
]
session_context.question_bank = QuestionBank(
    phase1=[Q1, Q2, Q3, Q4, Q5],
    phase3=[Q6, Q7, Q8, Q9, Q10, Q11, Q12]
)
session_context.smart_opening_question = 
  "You led a monolith-to-microservices migration at ScaleupB..."

interview_transcript = full recording of all speech
interview_evaluation = Ishita's assessment of answers
```

---

## What Makes This Interview Effective

1. **Band-Driven Questions**
   - Priya is mid-level (4 years), not senior (5+ years)
   - Phase 1 asks about **personal ownership** (not team-level leadership)
   - Tone is direct, probes are sharp, no broad open-ended questions

2. **Critical Skills Matching**
   - Only asked about Python, microservices, and database design (the 3 JD must-haves)
   - Didn't waste time on unrelated skills (Docker, Kubernetes, AWS) even though on resume
   - Depth over breadth

3. **Resume-Grounded**
   - Every question ties to specific resume items (payment system, migration, optimization)
   - Gaps are probed directly (Q4: "Your resume shows 4 years but no team lead role...")
   - Specificity forces real answers, not rehearsed STAR responses

4. **Adaptive Pacing**
   - Ishita reads Strong/Weak patterns for each question
   - If Priya stays vague → push back immediately ("What broke first?")
   - If Priya goes deep → move to next question
   - Feels like a peer conversation, not a checklist

5. **Efficient**
   - 5 Phase 1 questions + 7 Phase 3 questions = 12 total
   - Focused on role fit, not breadth
   - 20 minutes = enough to go deep on 3-4 major topics

---

## What Would Happen If Band Was Different

### If Priya Were Fresher (1.5 years experience)
```
Phase 1 would ask:
- Q1: Tell me about your strongest academic project or internship
- Q2: Walk me through your code, what's the hardest part you built?
- Q3: A JD requirement — do you have anything similar? How would you approach it?
- Q4: What's a concept you had to learn yourself?
- Q5: What would you do differently in your first project now?

Tone: Supportive, test fundamentals, focus on learning speed
```

### If Priya Were Experienced (7 years)
```
Phase 1 would ask:
- Q1: A system you owned at scale, what were the real constraints?
- Q2: Tell me about an incident you owned end-to-end
- Q3: Toughest architectural decision, what were the alternatives?
- Q4: Production judgment call that had tradeoffs
- Q5: Cross-functional work, who pushed back and how did you handle it?

Tone: Peer-level, expect tradeoffs and failures, push for judgment
```

### If Priya Were Senior (10+ years)
```
Phase 1 would ask:
- Q1: A technical direction YOU set for a team or company
- Q2: Architecture-level decision you led, what constraints shaped it?
- Q3: How you raised the bar for a team technically
- Q4: Ambiguity you navigated without direct authority
- Q5: Someone you influenced who got promoted or leveled up

Tone: Strategic, expect org influence and mentoring impact
```

---

## Summary

The interview is **band-aware**, **resume-grounded**, **critical-skill-focused**, and **adaptive**. Instead of asking the same 12 questions to everyone, it generates questions specific to:
- This candidate's experience level (band)
- This role's top 3 skill requirements
- This candidate's actual resume (projects, gaps, claims)
- This JD's must-haves

Result: A 20-minute conversation that reveals whether Priya can actually do the job, not whether she can give prepared answers.