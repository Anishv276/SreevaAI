# Data Flow: Complete System Map

## Pre-Interview Setup (Session Initialization)

```
INPUT DATA
├─ Structured Resume (JSON)
│  └─ Resume Text Block
├─ Job Details (JSON)
│  └─ Job Text Block
├─ Screening Report (JSON)
│  └─ Report Text Block
└─ Custom Questions (List)

         ↓

PARSING
├─ parse_resume_context(structured_resume, resume_text)
│  └─ resume_context.skills = ["Python", "Go", "PostgreSQL", ...]
│  └─ resume_context.years_of_experience = 4
│
├─ build_jd_summary(job_details, job_text)
│  └─ jd_summary_block = formatted JD
│
└─ build_screening_summary(report_details, report_text)
   └─ screening_summary_block = formatted report

         ↓

INFERENCE
├─ infer_candidate_band(resume_context, resume_text)
│  │ Checks: years_of_experience → [<1.5: fresher, 1.5-5: mid, 5-10: experienced, 10+: senior]
│  │ Or: keyword signals → [fresher, mid, experienced, senior]
│  └─ RESULT: candidate_band = "mid" (for Priya with 4 years)
│
├─ detect_role_category(job_title)
│  └─ RESULT: role_category = "engineering"
│
└─ detect_role_subtype(job_title, role_category)
   └─ RESULT: role_subtype = "backend"

         ↓

SESSION CONTEXT CREATION
session_context = CandidateBandContext(
    candidate_band = "mid"              ← From inference
    role_category = "engineering"       ← From title
    role_subtype = "backend"           ← From title
    coverage_items = [...]             ← From build_coverage_checklist("mid")
    critical_skills = []               ← Will be filled next
    question_bank = None               ← Will be filled next
    smart_opening_question = ""        ← Will be filled next
)

         ↓

CRITICAL SKILLS EXTRACTION
jd_must_haves = _extract_jd_must_haves(job_details, job_text)
│ └─ ["Python backend", "Distributed systems", "Database optimization", ...]
│
resume_skills = resume_context.skills
│ └─ ["Python", "Go", "PostgreSQL", "Redis", "Docker", ...]
│
critical_skills = extract_critical_skills(jd_must_haves, resume_skills)
│ Tokenize both sides, find word overlap, take top 3
│ └─ ["Python backend development", "Distributed systems", "Database optimization"]
│
session_context.critical_skills = critical_skills

         ↓

QUESTION BANK GENERATION (LLM Call - Async Background Task)
LLM Input:
  ├─ BAND = "mid"
  ├─ CRITICAL_SKILLS = ["Python...", "Distributed...", "Database..."]
  ├─ JD_BLOCK = build_jd_summary output
  ├─ RESUME_BLOCK = safe_parse(structured_resume)
  ├─ REPORT_BLOCK = safe_parse(screening_report)
  ├─ QUESTIONS_LIST = coverage_items + custom_questions
  └─ PHASE_1_BLOCK = MID-level phase 1 instruction
  └─ PHASE_3_BLOCK = MID-level phase 3 instruction

LLM Output:
  BRIEF:
  Band: mid
  Tone: Direct...
  Depth: Specifics...
  
  QUESTION BANK:
  Q1. [OPENING] ...
  Q2. [OWNERSHIP] ...
  Q3. [JD-RESPONSIBILITY] ...
  Q4. [GAP:...] ...
  Q5. [IMPACT] ...
  
  PHASE 2 — (reserved)
  
  Q6. [SKILL:python] ...
  Q7. [SKILL:microservices] ...
  Q8. [SKILL:database] ...
  Q9. [STRENGTH] ...
  Q10. [WEAKNESS] ...
  Q11. [WATCHOUT] ...
  Q12. [CUSTOM] ...

         ↓

QUESTION BANK PARSING
parse_question_bank(llm_output)
  ├─ Regex match PHASE markers
  ├─ Regex match Q{N}. [{TAG}] {TEXT}
  ├─ Parse Strong/Weak/Probes lines
  └─ RESULT: QuestionBank object
       ├─ phase1 = [Q1, Q2, Q3, Q4, Q5]
       └─ phase3 = [Q6, Q7, Q8, Q9, Q10, Q11, Q12]

session_context.question_bank = QuestionBank(...)

         ↓

PHASE 3 FILTERING (Critical Skills Only)
filter_phase3_by_critical_skills(phase3_questions, critical_skills)
  ├─ Tokenize critical_skills → {python, backend, distributed, systems, database, optimization}
  ├─ For each question in phase3:
  │  ├─ If [SKILL:...] tag: check if tag_tokens ∩ critical_tokens ≠ ∅
  │  │  ├─ Q6 [SKILL:python] → {python} ∩ {python...} = {python} ✓ KEEP
  │  │  ├─ Q7 [SKILL:microservices] → {microservices} ∩ {microservices...} ✓ KEEP
  │  │  ├─ Q8 [SKILL:database] → {database} ∩ {database...} ✓ KEEP
  │  │  └─ (Q6, Q7, Q8 matched, skill_count = 3, stop)
  │  └─ If [STRENGTH/WEAKNESS/WATCHOUT/CUSTOM]: ALWAYS KEEP
  │      ├─ Q9 [STRENGTH] → KEEP
  │      ├─ Q10 [WEAKNESS] → KEEP
  │      ├─ Q11 [WATCHOUT] → KEEP
  │      └─ Q12 [CUSTOM] → KEEP
  │
  └─ RESULT: filtered_phase3 = [Q6, Q7, Q8, Q9, Q10, Q11, Q12]

         ↓

BUILD INJECTION MESSAGE
build_question_bank_injection(llm_output, question_bank, critical_skills)
  ├─ Extract BRIEF section (first 5 lines)
  ├─ Format phase1 questions using _format_question()
  ├─ Format filtered_phase3 questions
  └─ Combine into clean system message:
       [INTERVIEW BRIEF + QUESTION BANK]
       
       BRIEF:
       Band: mid
       Tone: Direct...
       Depth: Specifics...
       Probe pressure: Push back...
       Opener style: Start with...
       
       QUESTION BANK — PHASE 1 (BACKGROUND):
       Q1. [OPENING] ...
       Q2. [OWNERSHIP] ...
       Q3. [JD-RESPONSIBILITY] ...
       Q4. [GAP:...] ...
       Q5. [IMPACT] ...
       
       QUESTION BANK — PHASE 2: (reserved)
       
       QUESTION BANK — PHASE 3 (CRITICAL SKILLS):
       Q6. [SKILL:python] ...
       Q7. [SKILL:microservices] ...
       Q8. [SKILL:database] ...
       Q9. [STRENGTH] ...
       Q10. [WEAKNESS] ...
       Q11. [WATCHOUT] ...
       Q12. [CUSTOM] ...

         ↓

SESSION READY FOR INTERVIEW
session_context = {
    candidate_band: "mid",
    critical_skills: ["Python...", "Distributed...", "Database..."],
    question_bank: QuestionBank(phase1=[...], phase3=[...]),
    smart_opening_question: "You led a monolith-to-microservices migration...",
    candidate_brief_block: <raw LLM output>,
    full_brief_injected: False (will be True after injection)
}

interview_system_prompt = [
    Build Phase 1 Warmup Directive,
    (will add Injection message after warmup completes)
]
```

---

## Interview Execution (Real Time)

```
START INTERVIEW
├─ greeting_delivered_at = None
├─ warmup_responses_received = 0
├─ warmup_complete = False
└─ full_brief_injected = False

     ↓ (0s)

GREETING PHASE
Ishita says: build_phase_1_greeting_text(candidate_name, ai_name, job_title)
greeting_delivered_at = time.time()

     ↓ (3s)

WARMUP PHASE 1 (Runtime Phase 1)
Inject: [PHASE 1 WARMUP DIRECTIVE]
Ishita: "Tell me about yourself..."
Candidate responds
warmup_responses_received = 1

     ↓ (10s)

WARMUP PHASE 2 (Still Runtime Phase 1)
Ishita: "What excites you about this role?"
Candidate responds
warmup_responses_received = 2
warmup_complete = True  ← TRANSITION

     ↓ (20s)

WARMUP COMPLETE EVENT
├─ Remove: [PHASE 1 WARMUP DIRECTIVE]
├─ Inject: build_question_bank_injection(...)
│           Returns formatted system message with:
│           - BRIEF card
│           - Phase 1 questions (Q1-Q5)
│           - Phase 3 questions (Q6-Q12, filtered)
│
├─ session_context.full_brief_injected = True
└─ spawn: attach_brief_when_ready()  (background)

     ↓ (20-45s)

PHASE 1 SUBSTANTIVE QUESTIONS (Runtime Phase 2)
Ishita (reading from injected question bank):
  Q1. [OPENING] "You led a monolith-to-microservices migration..."
      Candidate answers
      Ishita probes: "What broke first?"
  
  Q2. [OWNERSHIP] "Tell me about a major technical decision you made solo..."
      Candidate answers
  
  Q3. [JD-RESPONSIBILITY] "Tell me about database design work..."
      Candidate answers
  
  Q4. [GAP:leadership] "Your resume shows 4 years but no explicit team lead..."
      Candidate answers
  
  Q5. [IMPACT] "You improved P95 latency by 40%. Walk me through that..."
      Candidate answers

     ↓ (45-60s)

PHASE 3 SKILLS (Runtime Phase 3)
Ishita (still reading from same injected question bank):
  Q6. [SKILL:python] "Hardest Python backend problem you solved?"
      Candidate answers
      Ishita probes: "What Go would you have used?"
  
  Q7. [SKILL:microservices] "Tell me about an inter-service failure..."
      Candidate answers
  
  Q8. [SKILL:database] "Choice between consistency and availability?"
      Candidate answers
  
  Q9. [STRENGTH] "What's your strongest technical domain?"
      Candidate answers
  
  Q10. [WEAKNESS] "Where least confident?"
       Candidate answers
  
  Q11. [WATCHOUT] "Your resume says you led migration..."
       Candidate answers
  
  Q12. [CUSTOM] "Experience with production incidents?"
       Candidate answers

     ↓ (60s)

END INTERVIEW
interview_transcript = full recording
interview_evaluation = Ishita's assessment of answers

session_context final state:
  ├─ candidate_band = "mid"
  ├─ critical_skills = ["Python...", "Distributed...", "Database..."]
  ├─ question_bank = QuestionBank(phase1=[5q], phase3=[7q filtered])
  ├─ smart_opening_question = "You led a monolith..."
  ├─ full_brief_injected = True
  └─ interview_transcript = [...full content...]
```

---

## Data Structure: QuestionBank

```python
@dataclass
class QuestionBankQuestion:
    number: int         # 1, 2, 3, ..., 12
    tag: str           # "OPENING", "OWNERSHIP", "SKILL:python", "CUSTOM", etc.
    text: str          # "Tell me about..."
    strong: str        # "Specific X, demonstrates Y..."
    weak: str          # "Vague answer like..."
    probes: list[str]  # ["Follow-up 1?", "Follow-up 2?"]
    phase: int         # 1 or 3

@dataclass
class QuestionBank:
    phase1: list[QuestionBankQuestion]  # 5 questions
    phase3: list[QuestionBankQuestion]  # 7-8 questions
    
    @property
    def opening_question(self) -> str:
        return self.phase1[0].text if self.phase1 else ""
    
    def get_phase3_filtered(self, critical_skills: list[str]) -> list:
        return filter_phase3_by_critical_skills(self.phase3, critical_skills)
```

---

## Key Functions & Their Inputs/Outputs

| Function | Input | Output |
|----------|-------|--------|
| `infer_candidate_band()` | resume_context, resume_text | "fresher" \| "mid" \| "experienced" \| "senior" |
| `extract_critical_skills()` | jd_must_haves, resume_skills | ["Skill 1", "Skill 2", "Skill 3"] |
| `generate_candidate_brief()` | candidate_name, band, jd_block, resume_block, report_block, questions_list, **critical_skills** | Full LLM text blob (BRIEF + QUESTION BANK) |
| `parse_question_bank()` | llm_output_text | QuestionBank(phase1=[...], phase3=[...]) |
| `filter_phase3_by_critical_skills()` | phase3_questions, critical_skills | Filtered list of 4-7 questions |
| `build_question_bank_injection()` | llm_output, question_bank, critical_skills | Clean formatted system message (text only) |
| `extract_smart_opening_question()` | brief_text | "Q1 question text" |

---

## Critical Path Verification

✓ Resume → candidate_band (inference)  
✓ JD + Resume → critical_skills (extraction)  
✓ critical_skills → LLM prompt (tells LLM which skills to tag)  
✓ LLM output → parse_question_bank (structured object)  
✓ critical_skills → filter_phase3 (filters to top 3 skills + always-kept questions)  
✓ Filtered questions → build_injection (clean message for Ishita)  
✓ Injection message → Ishita's system prompt (injected at warmup boundary)  
✓ Ishita asks questions from injected message (guided by BRIEF card + QUESTION BANK)
