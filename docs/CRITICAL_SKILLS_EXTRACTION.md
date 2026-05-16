# Critical Skills Extraction: Resume + JD Intersection

## Overview

Critical skills are now extracted from **both resume and JD**, not just hardcoded roles. This ensures only the most relevant skills for the candidate are asked about in Phase 3.

## Flow

```
Resume Skills (from candidate.skills list)
↓
JD Must-Haves (from extracted_details.skills.must_have)
↓
Intersection: Find JD requirements that candidate has
↓
Top 3 Critical Skills (prioritize JD + resume match)
↓
Filter Phase 3 questions to only these skills
↓
Inject phase-by-phase during interview
```

## Implementation

### 1. Extract from Resume
```python
resume_context = parse_resume_context(structured_resume, resume_block)
resume_skills = resume_context.skills  # e.g. ["Python", "React", "SQL", "Docker", ...]
```

### 2. Extract from JD
```python
jd_must_haves = _extract_jd_must_haves(extracted_details, job_details)
# e.g. ["API Design", "Python", "Database Optimization", ...]
```

### 3. Find Intersection
```python
critical_skills = extract_critical_skills(jd_must_haves, resume_skills)
```

### Logic
- If JD has must-haves: find which ones the candidate has on resume
- Match by word containment (e.g. "REST API" matches "API")
- Take top 3 matching skills
- Fallback: if no match, use top 3 from JD only
- Fallback: if no JD must-haves, use top 3 from resume

### Example

**Resume Skills:**
```
["Python", "JavaScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS"]
```

**JD Must-Haves:**
```
["Backend API Design", "Python", "Database Optimization", "CI/CD"]
```

**Result (Critical Skills):**
```
["Backend API Design", "Python", "Database Optimization"]
```

(All 3 JD requirements have overlap with resume)

### Example 2 (No Overlap)

**Resume Skills:**
```
["Java", "Spring Boot", "Kafka", "Kubernetes"]
```

**JD Must-Haves:**
```
["Python", "React", "Node.js"]
```

**Result (Critical Skills):**
```
["Python", "React", "Node.js"]
```

(No overlap, so use top 3 from JD)

## Phase 3 Question Filtering

Once critical skills are extracted, Phase 3 questions are filtered:

```python
filtered_phase3 = question_bank.get_phase3_filtered(critical_skills)
```

**Keeps:**
- [SKILL:...] questions matching critical skills (max 3)
- [STRENGTH], [WEAKNESS], [WATCHOUT], [CUSTOM] (always included)

**Result:** 4-6 questions instead of 8, focused on what matters

## Files Modified

### `agent_profile_context.py`
- `extract_critical_skills(jd_must_haves, resume_skills)` — new function
- `filter_phase3_by_critical_skills()` — filters questions
- `QuestionBank.get_phase3_filtered()` — method to get filtered questions

### `agent_runtime.py`
- Extract both `jd_must_haves` and `resume_skills` at session start
- Call `extract_critical_skills()` with both sources
- Store in `session_context.critical_skills`
- Pass to `generate_candidate_brief()`

## Benefits

✅ **Data-driven** — uses actual resume and JD, not hardcoded roles
✅ **Relevant** — only asks about skills the candidate claims to have
✅ **Efficient** — reduces Phase 3 from 8 to 4-6 questions
✅ **Cost-effective** — fewer tokens injected during interview
✅ **Clean** — no dead code, simple intersection logic

## Example Interview Impact

**Experienced Backend Candidate**

Resume: Python, Go, Kubernetes, Docker, PostgreSQL, Redis, Kafka
JD: Backend, Python, Microservices, Caching, Message Queues

Critical Skills Extracted:
- Python
- Microservices (matches backend background)
- Caching (candidate has Redis)

Phase 3 Questions Injected:
- Q1: [SKILL:python] Hands-on Python question
- Q2: [SKILL:microservices] Microservices architecture question
- Q3: [SKILL:caching] Redis/caching depth question
- Q4: [STRENGTH] What are you strongest at?
- Q5: [WEAKNESS] Where least confident?
- Q6: [CUSTOM] One mandatory coverage item

Total: 6 focused questions instead of 8 generic ones.
