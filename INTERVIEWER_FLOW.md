# HR Interview Agent ("Ishita") - Complete Flow & Architecture

## 🎯 Quick Summary

**Ishita** is an AI interviewer that conducts live voice interviews using candidate context (resume, JD, prior reports). It asks contextual questions based on the candidate's profile rather than generic questions.

---

## 📊 Data Flow: Pre-Interview → Interview → Post-Interview

### **PHASE 1: PRE-INTERVIEW WARM-UP** (Before candidate joins)

#### 1.1 Data Collection Trigger
- **Trigger**: Candidate clicks interview link (from email)
- **Route**: `POST /api/interview/[id]/token` 
- **What happens**:
  - Validates application ID + interview token (if required)
  - Checks if interview is expired or already completed
  - Fetches application data from PostgreSQL:
    - **Application**: candidateName, fullName, drive association
    - **Drive** (job): title, role, description, skills, interviewTime (duration)
  - Returns LiveKit token + interview duration + role label to candidate UI

#### 1.2 Parallel Data Fetching (Database)
- **Location**: `agent_runtime.py` → `entrypoint()` function (line 535)
- **What's fetched** via `get_interview_context()` from PostgreSQL:

```
┌─ Application (Resume, Skills)
│  ├─ fullName
│  ├─ structuredResume (JSON blob)
│  └─ (fetched from Next.js metadata during interview)
│
├─ Drive (Job Description)
│  ├─ title, role
│  ├─ description (full JD text)
│  ├─ skills (required skills list)
│  ├─ interviewTime (duration in mins)
│  ├─ interviewLanguage
│  ├─ interviewQuestions (pre-defined questions if any)
│  └─ location
│
├─ Organization Config
│  ├─ ttsProvider (Cartesia, Sarvam, Google, etc.)
│  ├─ sttProvider (Deepgram, Sarvam, etc.)
│  ├─ llmProvider & llmModel (OpenAI gpt-4.1-mini, etc.)
│  ├─ proctoringSignals (which proctoring checks enabled)
│  └─ aiName (default "Ishitha")
│
└─ Prior Reports
   ├─ AI screening report (if exists)
   ├─ Resume extraction data
   └─ JD extraction data
```

#### 1.3 Agent Context Building
- **Location**: `agent_profile_context.py` → `build_live_prompt_context()`

The agent builds a **detailed briefing** with:

1. **Resume Block** (parsed from structuredResume JSON or raw text)
   - Years of experience → infers **candidate band** (fresher/mid/experienced/senior)
   - Skills extracted
   - Prior companies, titles, projects
   - Education

2. **JD Block** (from Drive description + skills)
   - Role requirements
   - Must-have skills
   - Nice-to-have skills
   - Team structure

3. **Candidate Band Context** (inferred seniority level)
   - **Fresher** (<1.5 yrs): More foundational, coding test focus
   - **Mid** (1.5-5 yrs): Balance of depth + breadth
   - **Experienced** (5-10 yrs): Leadership, design, scope
   - **Senior** (>10 yrs): Strategy, ownership, mentoring

4. **Risk/Red Flag Analysis** (from resume + prior report)
   - Employment gaps
   - Skill mismatches vs JD
   - Resume language red flags (ownership inflation, vague descriptions)
   - Prior interview signals (if any)

5. **Coverage Checklist**
   - Topics to probe based on JD → Resume alignment
   - Skip-able areas (over-proven in resume)
   - Deep-dive areas (gaps or JD requirements)

---

## 🎤 PHASE 2: LIVE INTERVIEW EXECUTION

### 2.1 Agent Initialization
- **Model Stack**:
  - **LLM**: OpenAI `gpt-4.1-mini` (temperature 0.6) for conversational turns
  - **STT**: Deepgram Nova-3 or Sarvam (real-time speech-to-text)
  - **TTS**: Cartesia Sonic-3 (voice: "Jacqueline - Reassuring") or fallback Sarvam
  - **VAD**: Silero VAD (voice activity detection, prewarmed at startup)

### 2.2 Opening Greeting
- **System Role**: "You are Ishita, a Senior Talent Partner. Friendly, precise, one question at a time."
- **Opening Message**: 
  - Greets candidate by first name
  - Brief intro ("I'll ask about your background, experience, and fit for this role")
  - No long preamble ("Let's get started")

### 2.3 Question Generation Strategy

#### Strategy 1: **Resume-Anchored Questions**
Each question is grounded in candidate's actual resume:
```
Q: "You mentioned you built a real-time analytics pipeline at Acme Corp 
   using Kafka and Spark. Walk me through the architecture."
→ Specific to resume, not generic
```

#### Strategy 2: **JD-Resume Gap Probing**
If resume is light on something JD requires:
```
JD requires: "Kubernetes production experience"
Resume shows: "Docker familiarity"
Q: "I see Docker experience, but not Kubernetes. 
   Have you managed K8s deployments? If not, 
   how quickly do you ramp on DevOps tools?"
```

#### Strategy 3: **Red Flag Deep-Dives**
If resume shows risk (gap, ownership inflation, vague language):
```
Resume: "Responsible for redesigning the payment system"
Q: "You say you redesigned the payment system. 
   What was your specific role? Who else was involved?"
→ Validates claim vs. inflated wording
```

#### Strategy 4: **Candidate Band Adjustments**
Depth of questions scales by seniority:
- **Fresher**: "Explain this coding concept" → code-forward
- **Mid**: "How did you debug this?" → problem-solving
- **Experienced**: "Why that design choice? Trade-offs?" → ownership
- **Senior**: "How did you influence org strategy?" → impact

### 2.4 Real-Time State Management

#### Turn Flow:
```
1. Agent asks question (1 question per turn)
2. Candidate answers (STT captures speech)
3. Agent evaluates answer:
   - Quality score (1-10)
   - Confidence in response
   - Red flags detected
4. Agent decides:
   - Follow-up on same topic (if unclear)?
   - Move to next topic?
   - Probe contradiction?
5. Every 3 turns: background **state injection** 
   (re-check coverage gaps, adjust if stuck)
6. Every 5 turns: auto-save transcript to DB
```

#### Follow-up Logic:
- **Max 2 follow-ups per topic** (don't drill too deep)
- **Two "I don't know" answers** → skip that topic immediately
- **If answer vague**: 1 clarification retry, then move on
- Never append reassurance after questions ("You're doing great")

#### Transcript Handling:
- **Real-time deduplication**: Skip exact duplicates, replace evolving fragments
- **STT spam filter**: Discard lines with 10+ words but ≤3 unique (hallucination guard)

### 2.5 Timing Controls

| Trigger | Action |
|---------|--------|
| Every 120s inactivity | Single nudge: "Still there?" (max 1 per session) |
| 150s before time expires | Offer candidate Q&A time |
| 5s before end | Final thanks + specific moment recall |
| Interview duration exceeded | Graceful close |

---

## 📝 PHASE 3: ANSWER EVALUATION & SCORING

### 3.1 Real-Time Scoring (During Interview)
After each answer, the agent runs:

```python
evaluate_answer_and_decide():
    - Score answer quality (1-10)
    - Check for contradictions (claim vs. prior answers)
    - Extract claims for fact-checking
    - Determine confidence (High/Medium/Low)
    - Decide: follow-up? move on? probe?
```

### 3.2 Contradiction Detection
- **Tracks claims** across turns
- If candidate says "I owned project X" but later "We built project X"
  → Flag as contradiction
- If contradiction, allow 1 clarification, then note in report

### 3.3 Claim Extraction (if enabled)
- Extracts factual claims (company, duration, tech used)
- Stores for post-interview validation
- Example: "Worked 3 years at Acme, led 5-person team, used React+Node"

---

## 📊 PHASE 4: POST-INTERVIEW ANALYSIS

### 4.1 Transcript Formatting
Converts raw turns into structured interview_turns JSON:
```json
{
  "turn": 1,
  "question": "Tell me about your last project",
  "answer": "At TechCorp, I led...",
  "questionSpeaker": "Interviewer",
  "answerSpeaker": "Candidate"
}
```

### 4.2 AI Report Generation
**Location**: `lib/interview-analysis.ts` → `generateInterviewReport()`

Input to GPT-4o (analysis model):
- Full transcript
- Resume text
- JD text
- Role + candidate name
- Duration + proctoring events

Output: Structured JSON report with:

```json
{
  "qa_blocks": [
    {
      "q": 1,
      "title": "Project Architecture",
      "tags": ["backend", "design"],
      "score": "8/10",
      "verdict": "Clear explanation of system design...",
      "confidence": "High"
    }
  ],
  "recording": {
    "summary": "Clear speaker, professional tone, minor filler words"
  },
  "verdict": {
    "summary": "Strong technical depth in backend...",
    "recommendation": "Strong Yes" | "Yes" | "Maybe" | "No",
    "recommendation_reason": "..."
  },
  "strategic_verdict": {
    "decision": "Hire" | "Maybe" | "Do Not Hire",
    "summary": "...",
    "rationale": [...],
    "next_actions": [...]
  },
  "integrity": {
    "score": 85,
    "summary": "No major proctoring violations..."
  },
  "skills_proof": [
    {
      "skill": "React",
      "status": "PROVED" | "PARTIAL" | "NOT_PROVED",
      "score": "8/10",
      "evidence": "Built 3 production React apps, detailed knowledge of hooks..."
    }
  ]
}
```

### 4.3 Proctoring Summary
- Tab switches: count + impact on score
- Face detection issues: flagged
- Audio issues: flagged
- Final integrity score (0-100)

---

## 🔄 Complete Question Flow Example

### Scenario: Mid-level Backend Engineer

#### Pre-Interview Data
```
Resume: "3 years Python/Django at StartupX, led API redesign"
JD: "Microservices, Docker, Kubernetes, AWS, communication skills"
Band: "Mid" (3 years)
Red flag: "Led API redesign" - verify actual scope
```

#### Interview Turns

| Turn | Speaker | Content | System Note |
|------|---------|---------|-------------|
| 1 | Ishita | "Hi! Tell me about your role at StartupX and the API redesign you led." | Anchored in resume, specific |
| 2 | Candidate | "I was the lead backend dev, redesigned our monolith..." | ✓ Claims leadership |
| 3 | Ishita | "How many engineers were on the team? What was your exact scope?" | Challenge: validate ownership |
| 4 | Candidate | "5 people total, I designed the new architecture..." | ✓ Clarifies team size & scope |
| 5 | Ishita | "Perfect. The JD requires Kubernetes experience. How have you used K8s?" | Gap probing: resume weak on K8s |
| 6 | Candidate | "We used Docker, but not K8s. However, I'm familiar with Helm..." | Partial skill |
| 7 | Ishita | "Helm is great. Briefly, how would you deploy a microservice on K8s?" | Depth probe for mid-level |
| 8 | Candidate | [Good answer] | ✓ Score 7/10 - solid understanding, some gaps |
| ... | ... | Continue to other topics | Every 3 turns: state injection |

---

## ⚙️ Key Features

### Question Intelligence
- **Resume-grounded**: Every question references actual resume content
- **Role-specific**: Questions vary by job category (eng vs. product vs. sales)
- **Band-appropriate**: Depth scales with candidate seniority
- **Gap-focused**: Probes JD requirements not in resume

### Evaluation Intelligence
- **Real-time scoring**: Each answer scored 1-10 during interview
- **Contradiction detection**: Tracks claims across turns
- **Red flag capture**: Notes inconsistencies, inflated language
- **Confidence levels**: High/Medium/Low on each answer

### Reliability
- **3x retries**: Room creation, agent dispatch, DB queries
- **Fallback models**: If Deepgram fails → Sarvam STT
- **Grace period**: 1s after interview ends for final STT results
- **Connection resilience**: 600s max wait for participant with 20s timeouts

### Multi-Language Support
- Org can configure: English, Hindi, Spanish, French, German, Mandarin, Japanese, Korean, Arabic, Portuguese, Russian
- STT/TTS/LLM providers vary per language

---

## 💾 Database Schema Summary

```sql
-- What's fetched during interview
Application
  ├─ id, fullName, resumeText (or structuredResume JSON)
  ├─ driveId → Drive
  └─ Interview record (created on token generation)

Drive
  ├─ id, title, role, description, skills
  ├─ interviewTime (mins), interviewLanguage
  ├─ interviewQuestions (JSON list)
  └─ ttsProvider, sttProvider, etc.

Interview (main interview record)
  ├─ applicationId, status (IN_PROGRESS, COMPLETED, FAILED)
  ├─ interviewTranscript (full text)
  ├─ interviewTurns (JSON: [{turn, question, answer}, ...])
  ├─ proctoringReport (JSON: {events, contradictions, trust})
  ├─ createdAt, completedAt
  └─ accessToken, expiresAt (validation)

ProctoringReport (inside Interview)
  ├─ events: [{eventType, reason, timestamp, severity}, ...]
  ├─ contradictions: [list of detected contradictions]
  ├─ final_suspicion_score (0-100)
  ├─ claim_index: {claim text → {answer turn, status}}
  └─ trust: recruiter summary (final verdict data)
```

---

## 🎯 Summary: What Questions It Asks & Why

### It WON'T ask:
- Generic "Tell me about yourself" (already has resume)
- "What's your greatest weakness?" (behavioral stock questions)
- Anything not tied to JD or resume

### It WILL ask:
1. **Validation**: "You say you led X. What was your exact role?"
2. **Depth**: "How would you architect this given constraints?"
3. **Gap-filling**: "JD needs skill X, resume shows Y. How aligned?"
4. **Red-flag probing**: "You mention 'we' repeatedly. What's yours specifically?"
5. **Signal detection**: "Walk me through how you handled a conflict"

### Scoring Dimensions
- **Technical depth**: Does answer show real experience?
- **Clarity**: Can they explain clearly to audience?
- **Ownership**: Personal contribution clear?
- **Fit**: Skills match JD?
- **Integrity**: Consistent claims? No inflated language?

---

## 📋 Complete Pre-Interview Data Checklist

Before agent joins:
- ✅ Application data loaded (name, resume)
- ✅ Drive data loaded (JD, skills, duration)
- ✅ Org config loaded (LLM, STT, TTS, proctoring)
- ✅ Prior reports loaded (screening summary if exists)
- ✅ Interview metadata built (candidate band, coverage checklist, red flags)
- ✅ System prompt injected with all context
- ✅ LiveKit room created + agent dispatch queued
- ✅ Candidate token issued + connected

**Result**: Agent starts with full context, asks informed questions.

---

## 🚀 End-to-End Timeline

```
00:00  Candidate clicks interview link
       ↓
00:01  Token endpoint fetches context from DB
       ↓
00:02  Candidate joins LiveKit room
       ↓
00:03  Agent joins, greets candidate by name
       ↓
00:15  Agent asks resume-specific opening question
       ↓
--:--  (20-45 min interview)
       Agent asks 8-15 questions, real-time scoring
       ↓
45:00  "You have 2 minutes left - any questions for me?"
       ↓
47:00  "Thanks for your time, great chatting with you"
       ↓
47:30  Candidate exits, transcript saved
       ↓
48:00  GPT-4o generates analysis report
       ↓
48:30  Recruiter opens dashboard, sees full verdict + skills proof
```

---

## 📌 Key Files

| File | Purpose |
|------|---------|
| `agent_runtime.py` | Main entrypoint, context loading, turn-by-turn coordination |
| `agent_profile_context.py` | Resume parsing, JD analysis, candidate band inference |
| `agent_persistence.py` | Database fetch/save (get_interview_context, persist_transcript) |
| `agent_scoring.py` | Answer evaluation, contradiction detection, claim extraction |
| `prompt_layers.py` | System prompt composition (voice layer + evaluation layer) |
| `turn_evaluator.py` | Real-time turn decision logic (follow-up vs. move on?) |
| `lib/interview-analysis.ts` | Post-interview GPT-4o report generation |
| `trust_engine.py` | Proctoring violation scoring + integrity calculation |

---

## 🎓 TL;DR

**Before Interview Starts:**
- Fetches resume, JD, candidate history from DB
- Infers seniority level (fresher/mid/experienced/senior)
- Identifies resume red flags, JD gaps, topics to probe
- Builds comprehensive context for LLM

**During Interview:**
- Asks 1 contextual question per turn (not generic)
- Each Q anchored in resume + grounded in JD
- Real-time scoring, contradiction detection
- Auto-adjusts depth based on candidate band
- Every 3 turns: re-check coverage, adjust if stuck

**After Interview:**
- Saves full transcript + proctoring report
- GPT-4o generates structured verdict (skills proof, recommendation)
- Recruiter sees who's hire/maybe/no with evidence

**Instead of asking "Tell me about yourself":**
Asks "You mention leading the API redesign. What was your role vs. team?"

