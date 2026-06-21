# Interview Report Generation — Full Flow with Example

**Candidate:** Priya Sharma  
**Role:** Backend Engineer  
**Interview duration:** ~15 min, 10 scored turns, 4 topics covered

---

## What triggers report generation

After the interview ends (candidate clicks End or time expires), `agent_runtime.py` calls two functions as background tasks:

```python
scores_context = await generate_interview_report(
    app_id, transcript_lines, answer_scores, job_title,
    proctoring_data, org_id, llm_model, jd_json, topic_records,
)
await generate_interview_summary(app_id, transcript_lines, job_title, org_id, scores_context=scores_context)
```

`generate_interview_report` runs a 3-node LangGraph pipeline then returns a `scores_context` dict.  
`generate_interview_summary` takes that dict and makes 2 more LLM calls for the summary bullets and verdict.

---

## Inputs going into the pipeline

**`answer_scores`** — one entry per scored candidate turn, built live during the interview:
```json
[
  {
    "turn": 3, "topic": "Node.js API design",
    "question": "What specific decisions did YOU make on the database schema?",
    "answer": "The team decided to use PostgreSQL. We had normalized tables...",
    "clarity": 5.1, "depth": 4.2, "specificity": 3.8, "grounding": 4.0, "overall": 4.3,
    "signal": "ownership_ambiguity",
    "signal_reason": "candidate used 'we' throughout — personal contribution unclear"
  },
  {
    "turn": 6, "topic": "Redis caching",
    "question": "Walk me through how you implemented the caching layer.",
    "answer": "I implemented cache-aside with a 15-minute TTL for session tokens...",
    "clarity": 7.8, "depth": 7.5, "specificity": 8.1, "grounding": 7.2, "overall": 7.7,
    "signal": null, "signal_reason": null
  },
  {
    "turn": 5, "topic": "Node.js API design",
    "question": "Give me a specific example of a bug you personally debugged.",
    "answer": "There was a race condition in the middleware layer, the team handled it...",
    "clarity": 4.5, "depth": 3.9, "specificity": 3.2, "grounding": 3.8, "overall": 3.9,
    "signal": "example_evasion",
    "signal_reason": "asked for specific example, gave process description instead"
  }
  // ... 7 more turns
]
```

**`topic_records`** — one entry per topic, built by the agent at MOVE_ON time:
```json
[
  {
    "topic": "Node.js API design", "topic_type": "project", "exit_reason": "saturated",
    "probe_count": 3, "denied": false,
    "scores": {"avg_overall": 6.1, "avg_depth": 5.8, "last_specificity": 5.2, "last_grounding": 4.9},
    "tech_skills": ["Node.js", "Express", "REST", "JWT"],
    "candidate_answers": ["We built a REST API...", "I handled the middleware...", "The team used JWT..."]
  },
  {
    "topic": "PostgreSQL schema design", "topic_type": "skill", "exit_reason": "weak_exit",
    "probe_count": 4, "denied": false,
    "scores": {"avg_overall": 4.3, "avg_depth": 3.9, "last_specificity": 3.1, "last_grounding": 3.4},
    "tech_skills": ["PostgreSQL", "SQL"],
    "candidate_answers": ["We normalized the tables...", "I'm not sure about the index type we used..."]
  },
  {
    "topic": "Redis caching", "topic_type": "skill", "exit_reason": "saturated",
    "probe_count": 1, "denied": false,
    "scores": {"avg_overall": 7.8, "avg_depth": 7.5, "last_specificity": 8.1, "last_grounding": 7.2},
    "tech_skills": ["Redis", "cache-aside", "TTL"],
    "candidate_answers": ["I implemented cache-aside with a 15-minute TTL for session tokens..."]
  },
  {
    "topic": "System design - payment flow", "topic_type": "project", "exit_reason": "depth_decay",
    "probe_count": 5, "denied": false,
    "scores": {"avg_overall": 4.1, "avg_depth": 3.2, "last_specificity": 2.8, "last_grounding": 3.0},
    "tech_skills": ["microservices", "CAP theorem"],
    "candidate_answers": ["CAP theorem... you pick two... I'd probably go with availability..."]
  }
]
```

**`proctoring_data`** — browser integrity events written during the interview:
```json
{
  "events": [],
  "total_turns": 10
}
```
*(Browser tab_switch events are in `integritySignals` DB column, not here — fetched separately in Node 1)*

---

## Node 1 — Deterministic signals (no LLM)

**What it does:**
- Fetches `integritySignals` from DB — browser wrote 2 `tab_switch` events during the interview
- Runs `_compute_integrity_score` with the signal weight table
- Builds `signal_context` string for Node 2's LLM user message
- Builds `jd_context` from `jd_json`

**`integritySignals` column in DB (written by browser in real time):**
```json
[
  {"eventType": "tab_switch", "elapsedSeconds": 340, "severity": "medium"},
  {"eventType": "tab_switch", "elapsedSeconds": 720, "severity": "medium"}
]
```

**`_compute_integrity_score` math:**
```
Start:       100
tab_switch × 2  →  -10 each (weight from _INTEGRITY_NEG, capped at 3 occurrences) = -20
──────────────────────────────────────────────────────
Final score: 80    Band: HIGH (≥ 80)
signals_used: ["tab_switch"]
```

**Node 1 output (passed to Node 2 via LangGraph state):**
```python
integrity_result = {"score": 80, "band": "HIGH", "signals_used": ["tab_switch"]}
signal_context   = "tab_switchx2"
jd_context       = 'JOB DESCRIPTION:\n{"title":"Backend Engineer","required_skills":["Node.js","PostgreSQL","Redis"]}'
proctoring_data  = {"events": [tab_switch_ev1, tab_switch_ev2], "total_turns": 10}
```

---

## Node 2 — Two parallel LLM calls (gpt-4.1-mini)

Node 2 also builds `transcript_text` here (skips first 4 lines of greeting/warmup, truncated to 3500 tokens).

### LLM Call A — 5-dimension scores + strengths/concerns (`_EVAL_SYSTEM`)

**User message sent to LLM:**
```
Role: Backend Engineer
JD Context: {"title":"Backend Engineer","required_skills":["Node.js","PostgreSQL","Redis"]}
Integrity Score: 80/100 (HIGH)
Behavioral flags: tab_switchx2

Full Interview Transcript:
Interviewer[89]: What specific decisions did YOU make on the database schema?
Candidate[102]: The team decided to use PostgreSQL. We had normalized tables...
Interviewer[134]: Walk me through how you implemented the caching layer.
Candidate[156]: I implemented cache-aside with a 15-minute TTL for session tokens...
[... remaining 8 turns truncated to 3500 tokens ...]
```

**LLM returns (compact JSON, strict schema):**
```json
{
  "str": [
    "Walked through the Redis cache-aside pattern for session tokens without being prompted — named TTL values and eviction policy.",
    "Corrected herself mid-answer on the PostgreSQL indexing question when she realized her first answer was incomplete."
  ],
  "con": [
    "Consistently used 'we' on every Node.js question — couldn't isolate her own contribution when pressed directly.",
    "Went blank on system design tradeoffs — named CAP theorem but couldn't apply it to the scenario given."
  ],
  "cm": {"s": 72, "ev": "Clear and direct in most answers, though drifted into team-narrative on ownership questions."},
  "tk": {"s": 61, "ev": "Real hands-on knowledge on Redis and Node.js middleware, shallow on PostgreSQL query optimization."},
  "rc": {"s": 54, "ev": "Resume claims full ownership of the payments API but live answers reveal shared contribution."},
  "ps": {"s": 58, "ev": "Structured approach on the caching question, couldn't articulate tradeoffs on system design."},
  "ct": {"s": 69, "ev": "Answers mostly focused and landed a clear point, occasional drift on follow-ups."}
}
```

**Parsed into `LLMEvalResponse`:**
```
communication.score         = 72
technical_knowledge.score   = 61
resume_credibility.score    = 54
problem_solving.score       = 58
clarity_of_thought.score    = 69
strengths = ["Walked through Redis cache-aside...", "Corrected herself mid-answer..."]
concerns  = ["Consistently used 'we'...", "Went blank on system design tradeoffs..."]
```

### LLM Call B — Skill ratings by domain category (`_SKILLS_FROM_RECORDS_SYSTEM`)

Runs in parallel with Call A. Uses `topic_records` (preferred) or falls back to raw Q&A.

**User message sent to LLM:**
```
Role: Backend Engineer

[TOPIC 1]
topic: Node.js API design
topic_type: project
exit_reason: saturated
probe_count: 3
avg_overall: 6.1
avg_depth: 5.8
last_specificity: 5.2
last_grounding: 4.9
tech_skills: Node.js, Express, REST, JWT
denied: False
candidate_answers: We built a REST API... | I handled the middleware... | The team used JWT...

[TOPIC 2]
topic: PostgreSQL schema design
exit_reason: weak_exit
probe_count: 4
avg_overall: 4.3
...
candidate_answers: We normalized the tables... | I'm not sure about the index type we used...

[TOPIC 3]
topic: Redis caching
exit_reason: saturated
probe_count: 1
avg_overall: 7.8
...
candidate_answers: I implemented cache-aside with a 15-minute TTL for session tokens...

[TOPIC 4]
topic: System design - payment flow
exit_reason: depth_decay
probe_count: 5
avg_overall: 4.1
...
candidate_answers: CAP theorem... you pick two... I'd probably go with availability...
```

**LLM groups topics into domain categories and returns:**
```json
{
  "skills": [
    {
      "skill": "Backend",
      "score": 6,
      "evidence": "Built Node.js REST API with JWT middleware, explained request lifecycle but couldn't isolate personal contribution from team work."
    },
    {
      "skill": "APIs & Integrations",
      "score": 7,
      "evidence": "Implemented cache-aside pattern for session tokens with 15-minute TTL and named the eviction policy unprompted."
    },
    {
      "skill": "Databases",
      "score": 4,
      "evidence": "Knew PostgreSQL was in the stack but couldn't recall the index type — 'I'm not sure about the index type we used'."
    },
    {
      "skill": "System Design",
      "score": 4,
      "evidence": "Named CAP theorem but applied it vaguely — 'I'd probably go with availability' without explaining why consistency matters more for payments."
    }
  ]
}
```

**Scoring logic the LLM applies:**
- Backend: `avg_overall=6.1` (saturated, probe_count=3) → 6
- APIs & Integrations: `avg_overall=7.8` (saturated, probe_count=1, bonus +0.5) → rounds to 7 after capping
- Databases: `avg_overall=4.3` (weak_exit, -1.5, cap 5) → 4
- System Design: `avg_overall=4.1` (depth_decay, -1.0, cap 6) → 4

---

## Node 3 — Assemble, signal analysis LLM call, persist

### Extracts behavioral signals from `answer_scores`:

```python
behavioral_signals = [
  {
    "signal_name":   "ownership_ambiguity",
    "signal_reason": "candidate used 'we' throughout — personal contribution unclear",
    "turn": 3, "topic": "Node.js API design",
    "question": "What specific decisions did YOU make?",
    "answer": "The team decided to use PostgreSQL..."
  },
  {
    "signal_name":   "example_evasion",
    "signal_reason": "asked for specific example, gave process description instead",
    "turn": 5, "topic": "Node.js API design",
    "question": "Give me a specific example of a bug you personally debugged.",
    "answer": "There was a race condition, the team handled it..."
  },
  {
    "signal_name":   "example_evasion",
    "signal_reason": "stayed theoretical when asked about failure mode",
    "turn": 9, "topic": "System design - payment flow",
    "question": "What would break first under load?",
    "answer": "Probably the database... I think..."
  }
]
```

### LLM Call C — Signal analysis (`behavioral_analysis.py`)

**Prompt sent to LLM:**
```
SESSION
Duration: 15 min | Candidate turns: 10 | Interviewer turns: 11 | Scored answers: 10

BEHAVIORAL SIGNALS
  ownership_ambiguity x1 during "Node.js API design" — candidate used 'we' throughout — personal contribution unclear
  example_evasion x2 during "Node.js API design", "System design - payment flow" — asked for specific example, gave process description instead; stayed theoretical when asked about failure mode

QUESTION & ANSWER LOG

  TOPIC: Node.js API design
    Q: What specific decisions did YOU make on the database schema?
    A: The team decided to use PostgreSQL. We had normalized tables...
    [depth=4.2 specificity=3.8 grounding=4.0]
    SIGNAL: ownership_ambiguity — candidate used 'we' throughout — personal contribution unclear

  TOPIC: Redis caching
    Q: Walk me through how you implemented the caching layer.
    A: I implemented cache-aside with a 15-minute TTL for session tokens...
    [depth=7.5 specificity=8.1 grounding=7.2]

  TOPIC: System design - payment flow
    Q: What would break first under load?
    A: Probably the database... I think...
    [depth=3.2 specificity=2.8 grounding=3.0]
    SIGNAL: example_evasion — stayed theoretical when asked about failure mode

  [... remaining turns ...]
```

**LLM returns:**
```json
[
  "On the Node.js API design question, Priya couldn't separate her contribution from the team's — every answer used 'we' and when directly asked 'what did YOU decide?', she redirected to 'we normalized the tables', never naming a specific choice she personally made.",
  "The Redis caching question was the clearest peak — she named the cache-aside pattern, gave the exact TTL value (15 minutes), and explained the eviction strategy without being prompted, suggesting this was the one area she personally owned.",
  "Two tab switches occurred at turns 6 and 9 — turn 9 was the system design question where her answer quality also dropped sharply. Worth checking the recording at that timestamp before deciding.",
  "System design exposed a gap: she named CAP theorem correctly but couldn't apply it — when asked 'what would break first under load?' she said 'probably the database, I think' with no reasoning about where a payments system would actually fail."
]
```

### Computes overall score:
```
communication         72 × 0.15 = 10.80
technical_knowledge   61 × 0.30 = 18.30
resume_credibility    54 × 0.20 = 10.80
problem_solving       58 × 0.25 = 14.50
clarity_of_thought    69 × 0.10 =  6.90
─────────────────────────────────────────
overall = 61
```

### Writes to 4 DB columns:

**`scoreBreakdown` column:**
```json
{
  "dimensions": [
    {"name": "Communication",                "score": 72, "evidence": "Clear and direct in most answers, drifted into team-narrative on ownership questions."},
    {"name": "Technical & Subject Knowledge", "score": 61, "evidence": "Real hands-on knowledge on Redis and Node.js middleware, shallow on PostgreSQL query optimization."},
    {"name": "Resume Credibility",            "score": 54, "evidence": "Resume claims full ownership of payments API but live answers reveal shared contribution."},
    {"name": "Problem Solving",               "score": 58, "evidence": "Structured on caching, couldn't articulate system design tradeoffs."},
    {"name": "Clarity of Thought",            "score": 69, "evidence": "Answers mostly focused, occasional drift on follow-ups."}
  ],
  "overall": 61,
  "integrity": {
    "score": 80,
    "band": "HIGH",
    "signals_used": ["tab_switch"],
    "methodology": "signal_weighted_deterministic"
  },
  "skills_evaluated": ["Backend", "APIs & Integrations", "Databases", "System Design"]
}
```

**`skillRatings` column** (separate from scoreBreakdown, read directly by UI):
```json
[
  {"skill": "APIs & Integrations", "score": 7, "evidence": "Implemented cache-aside pattern for session tokens with 15-minute TTL, named the eviction policy unprompted."},
  {"skill": "Backend",             "score": 6, "evidence": "Built Node.js REST API with JWT middleware, explained request lifecycle but couldn't isolate personal contribution."},
  {"skill": "Databases",           "score": 4, "evidence": "Knew PostgreSQL was in the stack but couldn't recall the index type — 'I'm not sure about the index type we used'."},
  {"skill": "System Design",       "score": 4, "evidence": "Named CAP theorem but applied it vaguely — 'I'd probably go with availability' without explaining why."}
]
```

**`signalAnalysis` column:**
```json
{
  "points": [
    "On the Node.js API design question, Priya couldn't separate her contribution from the team's...",
    "The Redis caching question was the clearest peak — she named the cache-aside pattern, gave the exact TTL value...",
    "Two tab switches occurred at turns 6 and 9 — turn 9 was the system design question where her answer quality dropped...",
    "System design exposed a gap: she named CAP theorem correctly but couldn't apply it..."
  ],
  "behavioral_signals": [
    {"signal_name": "ownership_ambiguity", "turn": 3, "topic": "Node.js API design", ...},
    {"signal_name": "example_evasion",     "turn": 5, "topic": "Node.js API design", ...},
    {"signal_name": "example_evasion",     "turn": 9, "topic": "System design", ...}
  ],
  "proctoring_events": [
    {"eventType": "tab_switch", "elapsedSeconds": 340},
    {"eventType": "tab_switch", "elapsedSeconds": 720}
  ]
}
```

**`interviewSummary` column (first write — strengths/concerns):**
```json
{
  "strengths": [
    "Walked through the Redis cache-aside pattern for session tokens without being prompted — named TTL values and eviction policy.",
    "Corrected herself mid-answer on the PostgreSQL indexing question when she realized her first answer was incomplete."
  ],
  "concerns": [
    "Consistently used 'we' on every Node.js question — couldn't isolate her own contribution when pressed directly.",
    "Went blank on system design tradeoffs — named CAP theorem but couldn't apply it to the scenario given."
  ]
}
```

---

## `generate_interview_summary` — 2 more parallel LLM calls

Takes the `scores_context` returned by `generate_interview_report`. Does NOT re-read the transcript — uses structured data only.

**User message (same for both calls):**
```
Role: Backend Engineer
Integrity: HIGH (80/100)
Behavioral signals: tab_switchx2

DIMENSION SCORES + EVIDENCE:
  Communication: 72/100 — Clear and direct, drifted on ownership questions.
  Technical & Subject Knowledge: 61/100 — Real on Redis and Node.js, shallow on PostgreSQL.
  Resume Credibility: 54/100 — Resume claims full ownership but live answers reveal shared contribution.
  Problem Solving: 58/100 — Structured on caching, couldn't articulate system design tradeoffs.
  Clarity of Thought: 69/100 — Mostly focused, occasional drift.

SKILL BREAKDOWN:
  APIs & Integrations (7/10): Implemented cache-aside with 15-min TTL unprompted.
  Backend (6/10): Built Node.js REST API but couldn't isolate personal contribution.
  Databases (4/10): Knew PostgreSQL was used but couldn't recall index type.
  System Design (4/10): Named CAP theorem but applied it vaguely.

STRENGTHS OBSERVED:
  - Walked through Redis cache-aside pattern without being prompted...
  - Corrected herself mid-answer on PostgreSQL indexing...

CONCERNS FLAGGED:
  - Consistently used 'we' on every Node.js question...
  - Went blank on system design tradeoffs...
```

**Summary LLM returns** (`_SUMMARY_SYSTEM` — 4 bullets):
```
- Strongest moment was the Redis caching explanation — she named the exact TTL, eviction policy, and cache invalidation strategy without prompting, suggesting she personally built this part.
- Ownership is a real concern: every Node.js answer defaulted to 'we' and direct questions about her specific decisions produced team-level answers, not individual ones.
- Databases and system design were both weak — she knew PostgreSQL was in the stack but couldn't speak to schema decisions, and on the payment system design question couldn't apply CAP theorem beyond naming it.
- Two tab switches during the interview, both during the system design section — answer quality at turn 9 dropped at the same time. Worth reviewing the recording before deciding.
```

**Verdict LLM returns** (`_VERDICT_SYSTEM` — 1 paragraph):
```
MAYBE: Priya owns the caching layer and can talk about it credibly, but the ownership ambiguity on the core API work is a real flag — if this role requires independent backend ownership, she may not be ready. System design is a clear gap. Recommend a 30-minute technical screen focused on database design and a system she built solo before making a hire decision.
```

**Second write to `interviewSummary`** (JSON merge — adds to existing strengths/concerns):
```json
{
  "strengths": ["..."],
  "concerns": ["..."],
  "summary": "- Strongest moment was the Redis caching explanation...\n- Ownership is a real concern...\n- Databases and system design were both weak...\n- Two tab switches during the interview...",
  "decision_note": "MAYBE: Priya owns the caching layer..."
}
```

---

## What lands in the UI

| UI element | DB column read | Value |
|---|---|---|
| 5 dimension score bars | `scoreBreakdown.dimensions` | 72 / 61 / 54 / 58 / 69 |
| Overall fit % | `scoreBreakdown.overall` | 61% |
| Integrity score badge | `scoreBreakdown.integrity` | 80/100, HIGH |
| Proctoring flags (with timestamps) | `integritySignals` | tab_switch ×2 at 5:40 and 12:00 |
| Skill bars (click to expand evidence) | `skillRatings` | APIs 7, Backend 6, Databases 4, System Design 4 |
| AI summary bullets | `interviewSummary.summary` | 4 bullets above |
| Verdict / recommendation | `interviewSummary.decision_note` | "MAYBE: Priya owns the caching layer..." |
| Strengths list | `interviewSummary.strengths` | Redis cache-aside, self-correction |
| Concerns list | `interviewSummary.concerns` | Ownership ambiguity, system design gap |
| Signal analysis tab (4 points) | `signalAnalysis.points` | The 4 narrative analysis points |

---

## Signal separation — why two stores

| Signal type | Source | Stored in | Used for |
|---|---|---|---|
| `tab_switch`, `face_absence`, `multiple_faces`, `camera_disabled` | Browser frontend during interview | `integritySignals` column | Integrity score (deterministic math), proctoring flags UI |
| `ownership_ambiguity`, `example_evasion`, `follow_up_collapse`, `depth_decay` | Eval pipeline per turn | `signalAnalysis.behavioral_signals` | Signal analysis LLM prompt input, signal analysis UI tab |

Browser events go to integrity score. Behavioral signals go to the LLM analysis. They never mix.

---

## LLM call summary

| Call | Model | Input | Output | When |
|---|---|---|---|---|
| A — Eval scores | gpt-4.1-mini | transcript + JD + integrity context | 5 dimension scores + strengths/concerns | Node 2, parallel |
| B — Skill ratings | gpt-4.1-mini | topic_records (or Q&A fallback) | Domain category scores + evidence | Node 2, parallel |
| C — Signal analysis | gpt-4.1-mini | behavioral signals + Q&A log | 4 narrative analysis points | Node 3 |
| D — Summary bullets | gpt-4.1-mini | scores_context (no transcript) | 4 recruiter bullets | After Node 3, parallel |
| E — Verdict | gpt-4.1-mini | scores_context (no transcript) | 1 paragraph hire/no-hire verdict | After Node 3, parallel |

Total: **5 LLM calls** per interview report. Calls A+B run in parallel. Calls D+E run in parallel.
