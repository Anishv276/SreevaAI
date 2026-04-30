# Phase 4: Resume-Grounded Question Sourcing

## Problem

Agent has coverage checklist but no specific resume items to probe. When asking follow-ups, AI generates generic questions.

**Before Phase 4:**
```
Interviewer: "Tell me about a complex system you built"
Candidate: "We built a distributed payment system"

Interviewer (follow-up): "Tell me more about the architecture"
             (generic follow-up - could apply to ANY system)

ISSUE: AI doesn't leverage specific resume details.
       Should ask: "You mentioned Node.js and Redis — how did you 
                    use Redis for caching in that payment system?"
       But instead asks: "Can you elaborate on that?"
```

---

## Root Cause

**Current brief structure:**
```
PERSONALIZED INTERVIEW PLAN:
CANDIDATE: Raj Kumar, 6 years Backend Engineer
COVERAGE CHECKLIST:
  1. API Architecture
  2. Database Scaling
  3. Microservices
  4. Leadership
  5. Testing Strategy
  
SMART OPENING QUESTION:
"Tell me about the most complex system you've designed..."

(No specific resume items listed)
```

When evaluator asks for follow-up, it has:
- Topic: "API Architecture"
- Probe family: "evidence" (ask for concrete example)
- Depth signal: "SURFACE" (answer was vague)

But NO reference to what specific technologies/projects to probe.

Result: AI generates generic probe:
```
"Can you give me more specifics on that?"
(Could apply to any answer)

Instead of:
"You mentioned you designed a REST API at Acme — walk me through 
 how you handled versioning when you had multiple client types."
(Specific to Raj's resume)
```

---

## Solution (Phase 4)

Add a **"QUICK PROBES"** section to the candidate brief. Pre-built, resume-specific follow-up questions that AI can reference when probing.

### Phase 4 Changes

**File**: `agent_runtime.py`, in `generate_candidate_brief()` function

**Current brief output:**
```
[PERSONALIZED INTERVIEW PLAN]
CANDIDATE: Raj Kumar
EXPERIENCE: 6 years backend at Acme, 2 years at StartupXYZ
SKILLS: Node.js, PostgreSQL, AWS, Redis, Docker, Kubernetes
GAPS: No mention of testing, limited leadership examples
SMART OPENING: "Tell me about the most complex system..."
COVERAGE: 5 required areas
(That's it)
```

**New brief output (Phase 4):**
```
[PERSONALIZED INTERVIEW PLAN]
CANDIDATE: Raj Kumar
EXPERIENCE: 6 years backend at Acme, 2 years at StartupXYZ
SKILLS: Node.js, PostgreSQL, AWS, Redis, Docker, Kubernetes
GAPS: No mention of testing, limited leadership examples
SMART OPENING: "Tell me about the most complex system..."
COVERAGE: 5 required areas

[QUICK PROBES — Resume-Grounded Follow-Ups]
Use these when you need specifics on resume items:

API Design:
  "You mentioned building a REST API at Acme — how did you handle 
   versioning when you had multiple client types (web, mobile, 3rd-party)?"
  "Walk me through a time you had to add a breaking change to an API. 
   How did you manage backward compatibility?"

Database:
  "You have PostgreSQL on your resume — tell me about the largest 
   database you've worked with. What was the scaling challenge?"
  "Did you ever have to optimize slow queries? Walk me through a specific 
   case where you debugged performance issues."

Kubernetes/Docker:
  "I see Docker and Kubernetes on your resume — tell me about a time you 
   had to debug a container issue in production. What went wrong?"

Node.js/Performance:
  "You built microservices in Node.js — how did you handle performance 
   when you had heavy I/O operations? Did you use caching, queues, async patterns?"

Leadership/Mentoring (if mentioned):
  "You mentioned working with junior engineers — walk me through a specific 
   time you had to explain a complex architectural decision to someone less experienced."

Testing (since not mentioned):
  "How do you approach testing? What's your strategy for testing the APIs 
   or microservices you build?"
```

---

## Real Example: How Phase 4 Changes the Interview

### Scenario: Raj Kumar's Interview

**Resume:**
- 6 years backend engineer
- Node.js, PostgreSQL, AWS, Redis, Docker, Kubernetes
- "Built microservices for payment processing at Acme"
- "Optimized API performance from 500ms to 50ms"
- "Led small team of 2"

**Without Phase 4 (Generic follow-ups):**

```
Ishita: "Tell me about the most complex system you've built"

Raj: "We built a payment microservice at Acme. 
      It handles millions of transactions daily."

Ishita (generic follow-up):
      "That's interesting. Can you tell me more about that?"
      (No specific angle - could apply to any system)

Raj: "Yeah, it was really complex. We used multiple technologies."

Ishita: "What technologies?"
        (Fishing for details instead of probing specifics)

Raj: "Node.js, databases, caching..."

Ishita: "Okay, and what was challenging about it?"
        (Still generic - no resume leverage)
```

**Result**: Vague answers because AI isn't anchoring on specific resume items.

---

### With Phase 4 (Resume-Grounded follow-ups):**

```
Ishita: "Tell me about the most complex system you've built"

Raj: "We built a payment microservice at Acme. 
      It handles millions of transactions daily."

Ishita (AI checks QUICK PROBES → Database section):
      "You mentioned you're strong with PostgreSQL — tell me about 
       the largest database you worked with in that payment system. 
       What was the scaling challenge?"
      (SPECIFIC: uses Raj's resume technology)

Raj: "Oh, yeah. We had a transactions table that grew to 50M rows. 
      Queries were getting slow..."
      (More substantive response because question is targeted)

Ishita (AI continues with specifics from resume):
      "When you hit that limit, how did you solve it? 
       Did you use partitioning, sharding, or something else?"
      (LEVERAGING: Raj's previous mention of optimization expertise)

Raj: "We partitioned by date. That helped queries avoid scanning 
      the entire table. Then we added appropriate indexes..."
      (Deeper answer - AI is asking what Raj specializes in)

Ishita (probes another resume item):
      "You also have Docker and Kubernetes on your resume — 
       was that payment system containerized? 
       What was the biggest operational challenge?"
      (GROUNDED: moving through Raj's actual skillset)

Raj: "Yeah, we containerized everything. The tricky part was 
      managing data volumes for the database container..."
```

**Result**: Specificity, depth, evidence all improve because AI is referencing Raj's actual resume items.

---

## Implementation Details

### Code Location: `agent_runtime.py`

Find the `generate_candidate_brief()` function:

```python
async def generate_candidate_brief(
    candidate_name: str,
    job_title: str,
    jd_block: str,
    resume_block: str,
    ai_report_block: str,
    questions_list: str,
    time_limit_mins: int,
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
) -> str:
```

**Current system prompt ends with:**
```python
"""
...
[Coverage checklist for 6 areas]
[Smart opening question]
...
Ask targeted questions that ground in their actual experience.
"""
```

**Phase 4 addition:**
```python
"""
...
[Coverage checklist for 6 areas]
[Smart opening question]

[QUICK PROBES — Resume-Grounded Follow-Ups]
When you need specifics, use these pre-built questions that reference 
the candidate's actual resume items:

For each major technology/project on their resume:
  - If they mention [technology], ask: [specific question about that tech]
  - If they mention [project], ask: [follow-up about that project]
  - If skill is missing, probe it: [question about missing area]

Examples from this candidate's resume:
{quick_probes_section}

Reference these probes when the evaluator tells you to get more 
specificity or when a candidate's answer is vague.
"""
```

### What the LLM generates:

The brief-generation LLM would:

1. **Extract technologies from resume:**
   ```
   Found: Node.js, PostgreSQL, AWS, Redis, Docker, Kubernetes
   Found projects: payment microservice, API optimization, team leadership
   Missing: Testing strategy, incident response
   ```

2. **Generate probes for each:**
   ```
   For PostgreSQL:
     "You have PostgreSQL on your resume — tell me about the largest 
      database table you've worked with. What was your scaling approach?"
   
   For Redis:
     "I see Redis in your background — how did you use Redis in the 
      payment system? Was it for caching, sessions, or something else?
      Walk me through a specific use case."
   
   For Kubernetes:
     "You list Kubernetes on your resume — describe a time you had to 
      debug or fix a Kubernetes issue in production. What went wrong?"
   
   For missing Testing:
     "I notice testing isn't mentioned on your resume — tell me about 
      your approach to testing. How do you test microservices?"
   ```

3. **Format as QUICK PROBES section:**
   ```
   [QUICK PROBES — Resume-Grounded Follow-Ups]
   
   Database & Scaling:
     "PostgreSQL — tell me about the largest table you've scaled. 
      What approach did you use?"
   
   Caching & Performance:
     "You have Redis experience — walk me through a time you used 
      Redis to solve a performance problem."
   
   Containerization & Orchestration:
     "Kubernetes — describe a production issue you debugged with 
      Kubernetes. What was the root cause?"
   
   API Design:
     "You mention building microservices — when you exposed an API, 
      how did you handle versioning or backward compatibility?"
   
   Testing (missing from resume):
     "Testing isn't mentioned — tell me your approach. 
      What testing strategy do you use for APIs?"
   ```

---

## How Ishita Uses the QUICK PROBES

**During interview evaluation:**

```python
# From turn_evaluator.py, when deciding what to probe:

evaluator says: {
    "action": "PROBE",
    "probe_mode": "specificity",  # Candidate was vague
    "reason": "Missing concrete example"
}

# Before Phase 4:
Ishita generates: "Can you give me more specifics?"

# With Phase 4:
Ishita checks QUICK PROBES in the brief:
  "Oh, the candidate mentioned PostgreSQL but was vague.
   Let me use the probe: 'PostgreSQL — tell me about the largest 
   table you've scaled. What approach did you use?'"

Result: Much more targeted, evidence-rich follow-up.
```

---

## Benefits of Phase 4

| Aspect | Without Phase 4 | With Phase 4 |
|--------|---|---|
| **Follow-up specificity** | Generic ("Tell me more") | Targeted ("Tell me about PostgreSQL scaling") |
| **Resume leverage** | Ignored candidate's actual skills | References specific resume items |
| **Answer quality** | Vague, surface-level | Specific, detailed, evidence-rich |
| **Time efficiency** | Candidate guesses what you want | Candidate knows exactly what to explain |
| **LLM prompt burden** | AI generates follow-ups on the fly | AI follows pre-built resume-grounded probes |

---

## Phase 4 Implementation (Quick Checklist)

### Step 1: Extract resume skills
```python
# In generate_candidate_brief(), after parsing resume:
skills = extract_technologies_from_resume(resume_block)
# Result: ["Node.js", "PostgreSQL", "Redis", "Docker", "Kubernetes"]

projects = extract_projects_from_resume(resume_block)
# Result: ["payment microservice", "API optimization", "team of 2"]

gaps = find_missing_skills_for_jd(jd_block, skills)
# Result: ["testing", "incident response", "monitoring"]
```

### Step 2: Generate probes for each
```python
quick_probes = []

for skill in skills:
    probe = generate_probe(
        skill=skill,
        context=f"mentioned in resume for {candidate_name}",
        role=job_title
    )
    quick_probes.append(probe)
    # Probe format: "Skill — question about specific use case"

for gap in gaps:
    probe = generate_probe(
        skill=gap,
        context=f"missing from resume but required by JD",
        role=job_title
    )
    quick_probes.append(probe)
```

### Step 3: Add to brief
```python
brief_template = f"""
[PERSONALIZED INTERVIEW PLAN]
...
[Coverage checklist]
[Smart opening]

[QUICK PROBES — Resume-Grounded Follow-Ups]
{format_quick_probes(quick_probes)}

When you need specifics, reference these probes 
that ground in the candidate's actual resume.
"""
```

### Step 4: Ishita uses during interview
```python
# When evaluator says "need more specificity":
if probe_mode == "specificity":
    # Check QUICK PROBES in brief
    relevant_probe = find_matching_probe(
        current_answer,  # What candidate just said
        quick_probes     # Pre-built probes
    )
    
    if relevant_probe:
        ask(relevant_probe)  # "PostgreSQL — tell me about..."
    else:
        ask(generate_generic_probe())  # Fallback
```

---

## Example: Full Phase 4 Brief for Raj Kumar

```
[PERSONALIZED INTERVIEW PLAN]
CANDIDATE: Raj Kumar (6 years backend experience)
JD MATCH: Senior Backend Engineer — Distributed Systems Focus
ROLE SENIORITY: Mid-to-Senior (experienced, some leadership)

MUST COVER:
  1. Distributed Systems / Microservices
  2. Database Design & Scaling
  3. API Architecture
  4. Performance Optimization
  5. Team Leadership / Mentoring
  6. Testing & Quality Assurance

SMART OPENING QUESTION:
"Tell me about the most complex system you've designed and built. 
What problem were you solving, and how did you architect it?"

RESUME STRENGTHS TO PROBE:
  ✓ Deep backend engineering (6 years, 2 companies)
  ✓ Specific tech stack (Node.js, PostgreSQL, Redis, Docker, Kubernetes)
  ✓ Performance optimization experience (500ms → 50ms claim)
  ✓ Microservices at scale (payment system, millions of transactions)

RESUME GAPS TO ADDRESS:
  ✗ Testing not mentioned — ask about test strategy
  ✗ Incident response not mentioned — ask about production debugging
  ✗ Monitoring/observability unclear — ask about metrics/logging

---

[QUICK PROBES — Resume-Grounded Follow-Ups]

Use these when you need specifics. Each probe targets Raj's actual 
resume items and experience.

DISTRIBUTED SYSTEMS / MICROSERVICES:
  1. "You mention building microservices for payment processing at Acme — 
      walk me through the architecture. How many services? How did they 
      communicate (REST, message queues, RPC)?"
  
  2. "Payment systems require consistency and reliability — how did you 
      handle failures? Did you have retry logic, circuit breakers, 
      fallbacks?"

DATABASE & SCALING:
  1. "You have PostgreSQL listed — tell me about the largest database 
      you've worked with. How did you scale writes and reads?"
  
  2. "You claim you optimized API response time from 500ms to 50ms — 
      walk me through the bottleneck and how you fixed it."
  
  3. "Did you partition tables, add indexes, or cache aggressively? 
      Give me a specific example."

CACHING & PERFORMANCE:
  1. "Redis is on your resume — tell me about a time you used Redis 
      to solve a performance problem. Was it caching, sessions, or 
      rate limiting?"
  
  2. "When you use Redis, how do you handle cache invalidation? 
      Give me a specific scenario."

CONTAINERIZATION & ORCHESTRATION:
  1. "You list Docker and Kubernetes — describe a production incident 
      you debugged with Kubernetes. What went wrong and how did you fix it?"
  
  2. "Kubernetes can be complex — tell me about a time you had to 
      troubleshoot a deployment or scaling issue."

API DESIGN:
  1. "Tell me about an API you designed. Did you worry about versioning? 
      How did you handle breaking changes?"
  
  2. "With multiple clients (web, mobile, 3rd-party), how did you 
      manage API compatibility?"

LEADERSHIP / MENTORING:
  1. "You mention 'led small team of 2' — describe a time you had to 
      explain a complex technical decision to less experienced engineers."
  
  2. "Tell me about the biggest technical mistake you made and how you 
      taught the team to avoid it."

TESTING (GAP TO FILL):
  1. "I don't see testing mentioned on your resume — tell me about 
      your approach. How do you test microservices?"
  
  2. "For the payment system, how did you test critical flows? 
      Unit tests, integration tests, end-to-end?"

INCIDENT RESPONSE (GAP TO FILL):
  1. "Tell me about a production incident you had to debug. 
      What went wrong and how did you find the root cause?"
  
  2. "Walk me through your debugging process — what tools and 
      monitoring do you use?"

---

INTERVIEW STRATEGY:
1. Open with smart question (system design)
2. If answer is vague, reference QUICK PROBES for specificity
3. If answer is strong, ask a probe from a different category 
   (e.g., if distributed systems strong, move to database)
4. For gaps (testing, incidents), ask the gap-filling probes
5. For leadership, use probes only if time allows — medium priority

COVERAGE TRACKER:
  [ ] Distributed Systems
  [ ] Database & Scaling
  [ ] Caching & Performance
  [ ] Containerization
  [ ] API Design
  [ ] Leadership
  [ ] Testing
  [ ] Incident Response
```

---

## Why Phase 4 is "Medium Priority"

**Phase 3 (max_follow_ups=2) already forces breadth:**
- Agent can't get stuck on one topic
- All 5-6 major areas are touched
- Interview coverage is guaranteed

**Phase 4 adds quality within breadth:**
- When probing, uses specific resume items
- Reduces generic follow-ups
- Improves answer specificity and depth

**Without Phase 4:** "Can you go deeper on that?" (generic, still works)
**With Phase 4:** "You mentioned PostgreSQL — tell me about the largest database you scaled" (targeted, much better)

Both approaches cover all topics. Phase 4 just makes follow-ups smarter.

---

## Phase 4 vs Phase 3

**Phase 3 = Ensures Breadth**
```
max_follow_ups=2 → forces agent to cover all 5 topics
Result: ✅ 1 topic weak, 4 topics strong (breadth achieved)
```

**Phase 4 = Improves Depth**
```
QUICK PROBES → follow-ups are resume-specific
Result: ✅ 1 topic weak but probed smartly, 4 topics strong & grounded
```

**Phase 3 is critical. Phase 4 is enhancement.**

---

## Implementation Effort

**Code changes:**
- Add 2-3 new LLM calls to `generate_candidate_brief()`
- Parse resume for skills/gaps
- Generate probes for each skill
- Append QUICK PROBES section to brief
- ~50-100 lines of code in agent_runtime.py

**Risk:** Low (additive, doesn't break existing logic)
**Benefit:** High (follow-ups become much more targeted)

---

## Summary

**Phase 4: Resume-Grounded Question Sourcing**

| Aspect | Detail |
|--------|--------|
| **Goal** | Make follow-ups specific to candidate's resume instead of generic |
| **Method** | Pre-build targeted probes for each resume skill + JD gaps |
| **Trigger** | When evaluator says "need specificity", Ishita uses a QUICK PROBE |
| **Impact** | Better answer quality, less fishing for details, more evidence |
| **Effort** | ~50-100 lines in generate_candidate_brief() |
| **Priority** | Medium (Phase 3 handles breadth; Phase 4 improves quality) |
| **When to do** | After Phase 3 is working and interview breadth is verified |
