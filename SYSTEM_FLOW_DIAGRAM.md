# Ishita System Architecture Flow Diagram

## Interview Initialization Flow

```
DATABASE (Org Config)
+-- Candidate: name, seniority, role
+-- Job: title, requirements, custom questions
+-- Settings: LLM model, TTS/STT provider, time limit, follow-up depth
+-- Resume: structured + text blocks

        ↓ PARALLEL PROCESSING ↓

+-----------------------------------------+
| BAND DETECTION                          |
+-----------------------------------------+
| infer_candidate_band()                  |
| +- Parse years of experience            |
| +- Check resume keywords                |
| +- Output: fresher | mid | experienced |
+-----------------------------------------+
        ↓
+-----------------------------------------+
| COVERAGE CHECKLIST                      |
+-----------------------------------------+
| build_coverage_checklist(band)          |
| +- Fresher: learning focus              |
| +- Mid: balanced approach               |
| +- Experienced: ownership focus         |
+-----------------------------------------+
        ↓
+-----------------------------------------+
| ROLE DETECTION                          |
+-----------------------------------------+
| detect_role_category(job_title)         |
| +- Engineering (solutions eng checked)  |
| +- Sales                                |
| +- Customer Success                     |
| +- Marketing                            |
| +- Operations                           |
|                                         |
| detect_role_subtype(title, category)    |
| +- Engineering: backend|frontend|data   |
| +- Sales: sdr|ae|account_mgmt          |
| +- etc...                               |
+-----------------------------------------+
        ↓
+-----------------------------------------+
| ROLE INTELLIGENCE LAYER (~1500 lines)   |
+-----------------------------------------+
| build_role_layer(category, subtype, bd) |
| +- Base signals (what real experts show)|
| +- Subtype-specific probes              |
| +- Mutation scenarios (depth testing)   |
| +- Seniority adjustments (band note)    |
|                                         |
| Outputs:                                |
| +- Evaluation signals                   |
| +- Fake answer patterns                 |
| +- Probe triggers                       |
| +- High-value mutation scenarios        |
+-----------------------------------------+
        ↓
+-----------------------------------------+
| CANDIDATE BRIEF GENERATION              |
+-----------------------------------------+
| generate_candidate_brief() [BG TASK]    |
| +- Input: resume + JD + screening data  |
| +- Timeout: 2.5s (non-blocking)        |
| |                                       |
| +- Output (1400 tokens):                |
|    +- Candidate Profile Summary         |
|    +- Smart Opening Question            |
|    +- Interview Plan (4-6 Q's)         |
|    +- Resume-JD Gaps (sideways probes)  |
|    +- Personality Bridges               |
|    +- Tool Validation Flags             |
|    +- Watch-outs                        |
|    +- Ownership Risks                   |
+-----------------------------------------+
        ↓
+-----------------------------------------+
| SYSTEM PROMPT ASSEMBLY                  |
+-----------------------------------------+
| {role_layer}           ← Role intel     |
| {jd_block}             ← Job details    |
| {resume_block}         ← Candidate bg   |
| {ai_report_block}      ← Screening data |
| {questions_list}       ← Coverage + Q's |
| {candidate_brief_block}← Personalized   |
|                                         |
| Result: Comprehensive 2500-line prompt  |
|         • Human speech patterns         |
|         • Role-specific evaluation      |
|         • Anti-cheat signals            |
|         • Behavioral guidelines         |
|         • Edge cases & personal moments |
+-----------------------------------------+
        ↓
    READY FOR INTERVIEW
```

---

## Interview Execution Flow

```
                        INTERVIEW START
                             ↓
                    +----------------+
                    | Candidate Joins|
                    |   Hardware     |
                    |   Check Room   |
                    +----------------+
                             ↓
                    +----------------+
                    | Ishita Greets  |
                    | (Turn 1)       |
                    +----------------+
                             ↓
                    +----------------+
                    | Candidate      |
                    | Responds       |
                    | (Turn 2)       |
                    +----------------+
                             ↓
        +-------------------------------+
        | CONVERSATION ITEM ADDED EVENT |
        | (triggered on every turn)     |
        +-------------------------------+
                             ↓
        +--------------------------------------+
        | CHAIN-OF-THOUGHT REASONING           |
        | (Ishita's mental model for each ans) |
        +--------------------------------------+
        | 1. What did they literally say?      |
        | 2. What claim are they making?       |
        | 3. Is this consistent with earlier? |
        | 4. What's their emotional state?    |
        | 5. What's my best next move?        |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | THREE-LAYER ANSWER PROCESSING        |
        +--------------------------------------+
        | LAYER 1 SURFACE                      |
        | +- What they literally said          |
        | |                                    |
        | LAYER 2 SIGNAL                       |
        | +- Ownership claim (1-6 rungs)      |
        | +- Depth level (specific, metric?)  |
        | |                                    |
        | LAYER 3 GAP                          |
        | +- What a real expert would say     |
        | +- Missing evidence classes:        |
        | |  • Metric/number                  |
        | |  • Specific moment in time        |
        | |  • Named person/team              |
        | |  • Tradeoff/constraint            |
        | |  • Failure/setback                |
        | |  • Sequence of events             |
        | |  • Artifact produced              |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | FOLLOW-UP MODE SELECTOR              |
        +--------------------------------------+
        | Based on gaps found:                 |
        |                                      |
        | MODE A: Specificity Probe            |
        | +- Answer vague? Pull into real     |
        |                                      |
        | MODE B: Depth Spiral                 |
        | +- Good substance? Go deeper (L1-7)|
        |                                      |
        | MODE C: Verification Probe           |
        | +- Polished but ungrounded?         |
        |    Pull into specific memory        |
        |                                      |
        | MODE D: Contradiction Clarification  |
        | +- Conflicts earlier claim?         |
        |    Surface with genuine confusion   |
        |                                      |
        | MODE E: Sideways Skill Probe         |
        | +- JD gap not shown in resume?      |
        |    Ask through scenario             |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | CHEAT SIGNAL DETECTION               |
        +--------------------------------------+
        | Pattern 1: Perfect structure         |
        | Pattern 2: No specifics              |
        | Pattern 3: Universal positive       |
        | Pattern 4: Wrong question answered  |
        | Pattern 5: Zero disfluency          |
        |                                      |
        | 2+ patterns -> Interrupt + probe     |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | ISHITA'S RESPONSE FORMULATION        |
        +--------------------------------------+
        | RULE 1: React Before Asking         |
        | +- Echo a phrase / Compress essence |
        | +- Micro-reaction / Genuine confusion|
        | +- Then ask (never jumps straight)  |
        |                                      |
        | RULE 2: Thread-Based Transitions    |
        | +- Never announce topic change      |
        | +- Find connection from their words |
        | +- Pivot naturally                   |
        |                                      |
        | RULE 3: Human Speech Patterns       |
        | +- Fillers mid-sentence             |
        | +- Variable sentence starters       |
        | +- One filler per response max      |
        | +- No bot phrases (banned list)     |
        |                                      |
        | RESULT: One question, natural feel  |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | STATE INJECTION TRIGGER              |
        | (Every 3 assistant turns)            |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | generate_interview_state_summary()   |
        +--------------------------------------+
        | Input: transcript_lines + questions  |
        |                                      |
        | Processing:                          |
        | +- Full transcript (turn > 10)       |
        | +- Last 40 lines (for pace/stuck)   |
        | +- Last 12 lines (for stuck alert)  |
        |                                      |
        | Output:                              |
        | +- TOPIC STATUS: [COVERED/THIN/..] |
        | +- STUCK ALERT: if 3+ follow-ups   |
        | +- NEXT ACTION: specific guidance   |
        | +- PACE WARNING: if 60% time + few |
        | +- ANSWER_DEPTH: [SURFACE/SPEC..]  |
        | +- CONTRADICTION SCAN: inconsistency|
        | +- Updates suspicion_score          |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | MODE DECISION LOGIC                  |
        +--------------------------------------+
        | score >= 41 -> VERIFICATION MODE      |
        | score >= 21 -> PRESSURE MODE          |
        | score < 21 -> NORMAL MODE             |
        |                                      |
        | OR: DEEP MODE (great answers)        |
        |     (no suspicion, exceptional depth)|
        |                                      |
        | Inject: ISHITA_MODE + SUSPICION_SCORE|
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | Ishita Responds with Question        |
        | (Adjusted for mode)                  |
        |                                      |
        | NORMAL: Warm, balanced depth        |
        | DEEP: Peer-level, push 4-6 levels   |
        | PRESSURE: Shorter, more direct      |
        | VERIFICATION: Memory-based probes   |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | PROCTORING SIGNAL CAPTURE            |
        +--------------------------------------+
        | Browser events received:             |
        | +- tab_switch -> +5 suspicion        |
        | +- face_absent -> +10                |
        | +- gaze_violation -> +8              |
        | +- multiple_faces -> +30             |
        | +- clipboard_paste -> +15            |
        |                                      |
        | Logged in proctoring_events timeline|
        +--------------------------------------+
                             ↓
                   Turn N-1, N-2...N
                   
                         ↓
                   +----------------+
                   | Interview      |
                   | Approaching    |
                   | Natural End    |
                   +----------------+
                             ↓
        +--------------------------------------+
        | CLOSING PHASE                        |
        +--------------------------------------+
        | "I feel like we've covered a lot..."|
        | "Do you have anything to ask?"      |
        | Listen to their response             |
        | Close with something specific:      |
        | "Really glad we talked through..."  |
        |                                      |
        | Never robotic closings               |
        | Match closing to what happened       |
        +--------------------------------------+
                             ↓
        +--------------------------------------+
        | INTERVIEW PERSISTENCE                |
        +--------------------------------------+
        | persist_transcript()                 |
        | +- Full transcript text              |
        | +- Duration in seconds               |
        | +- Status (COMPLETED/NO_SHOW/etc)   |
        | |                                    |
        | +- proctorReport JSONB:              |
        |    +- role_category + candidate_band|
        |    +- total_turns                    |
        |    +- final_suspicion_score          |
        |    +- final_mode                     |
        |    +- exit_reason                    |
        |    +- events []: complete timeline   |
        |       +- answer_surface (turn, score)|
        |       +- contradiction_detected      |
        |       +- tab_switch (timestamp)      |
        |       +- mode_change (from->to)       |
        |                                      |
        | Save to Database ✓                   |
        +--------------------------------------+
                             ↓
                   INTERVIEW COMPLETE
```

---

## Data Flow: Question Selection Problem

### Current (❌ PROBLEMATIC)

```
Interview Start
+- questions_list = [
|   "Validate core skills",
|   "Ask for measurable outcomes",
|   "Cover communication moment",
|   ... (coverage checklist items)
|   ... (custom questions)
|   ... (brief questions)
| ]
+- Turn 3: Ishita asks about "microservices"
+- Transcript: "Candidate: I've worked with Kubernetes, Docker, Redis..."
+- Turn 6 (state injection fires)
|  +- State: "TOPIC: microservices -> [COVERED]"
+- Turn 8: Ishita reads "[COVERED] microservices"
|  +- BUT doesn't have list: "already asked these Qs about microservices"
|  +- So asks again: "What's your experience with microservices?"
+- ❌ CANDIDATE HEARS REPEAT
```

### Proposed Fix (✅ WORKS)

```
Interview Start
+- questions = [
|   ("q001", "Validate core skills", "core_skills"),
|   ("q002", "Ask for measurable outcomes", "metrics"),
|   ("q003", "Cover communication moment", "soft_skills"),
|   ("q201", "What's your experience with microservices?", "distributed_systems"),
|   ("q202", "Walk me through a microservices migration", "distributed_systems"),
|   ... more questions with IDs
| ]
+- asked_questions = []
+- Turn 3: Ishita asks q201 about microservices
|  +- LK transcription captures it
+- Turn 6 (state injection fires)
|  +- Parse: "q201 was asked in turn 3"
|  +- Update: asked_questions = ["q201"]
|  +- State message: 
|      "ASKED: q201 (turn 3)
|       TOPIC: distributed_systems [COVERED]
|       DO_NOT_RE_ASK: [q201, q202]
|       AVAILABLE: [q001, q002, q003, q004...]"
+- Turn 8: Ishita reads state
|  +- SEES: "DO_NOT_RE_ASK: [q201, q202]"
|  +- SKIPS microservices entirely
|  +- Picks next available Q: q002 (metrics)
+- ✅ NO REPEAT
```

---

## Role-Based Question Flow (How It COULD Work)

### Current (Info Only, Not Used for Selection)

```
Role Detection -> Backend Engineer
      ↓
Role Layer Injected
+- EVALUATION SIGNALS: API design, database schema choices, failure modes
+- STRONG ANSWER SIGNALS: Production incident debugging, schema design reasoning
+- PROBE TRIGGERS: "Walk me through last time something broke..."
+- MUTATION: "What if team size halves and deadline doubles?"
+- Band Note: "Expect ownership language, scale experience..."
      ↓
System Prompt (Ishita reads and understands context)
      ↓
But question sequence = static coverage checklist
      ↓
❌ Role intelligence not used to PRIORITIZE questions
```

### Proposed (Role Drives Selection)

```
Role Detection -> Backend Engineer
      ↓
Coverage Checklist with Role Weights
+- database_design: weight 9 ← HIGH PRIORITY for backend
+- api_design: weight 9
+- distributed_systems: weight 8
+- testing_strategy: weight 6
+- frontend_knowledge: weight 2 ← LOW for backend
+- ... other questions
      ↓
Question Selection Logic
+- Turn 1-3: Rapport building (soft skills)
+- Turn 4+: Pick from REMAINING questions
|   +- Prioritize HIGH-weight questions first
|   +- (database_design before frontend)
+- Skip very LOW-weight questions (not relevant)
+- Always available: [soft skills, ownership probes]
      ↓
✅ Questions sequence follows role profile
✅ Relevant > irrelevant for this specific role
```

---

## Band-Based Adaptation (How It Works)

### Fresher (< 1.5 years)

```
Coverage Focus:
+- Deep-dive 1 academic/internship project
+- Check fundamentals (not just tool names)
+- Teamwork/collaboration story
+- Learning speed assessment

Interview Behavior:
+- Warmer, more encouraging tone
+- Questions: "How would you approach..." (not "what have you done")
+- More patience with nervousness
+- Probe reasoning > scale

Role Layer Addendum:
+- "Prioritise potential and reasoning over track record"
+- "Be patient with vocabulary"
+- "Do not penalise for not knowing things experienced hire would"
+- "Probe learning speed and genuine curiosity"
```

### Mid-Level (1.5-5 years)

```
Coverage Focus:
+- Cover project story + role experience
+- Probe execution details and impact
+- Validate breadth and depth of skills
+- Growth trajectory (college to real-world)

Interview Behavior:
+- Balanced warm and professional
+- Some technical depth expected
+- Probe learning velocity
+- Look for growth trajectory

Role Layer Addendum:
+- "Expect some real domain experience"
+- "Probe for learning velocity"
+- "Balance breadth of skills with depth on best areas"
+- "Look for growth trajectory"
```

### Experienced (5+ years)

```
Coverage Focus:
+- Deep-dive recent role with scope/ownership
+- Probe decision-making and stakeholder mgmt
+- Assess leadership/mentoring/process ownership
+- Verify advanced role-critical skills

Interview Behavior:
+- Peer-level language
+- Skip basics entirely
+- Firm challenge on vague answers
+- Push to depth levels 4-6

Role Layer Addendum:
+- "Expect ownership language and scale experience"
+- "Do not accept vague answers at this level"
+- "Push to depth spiral level 4, 5, 6"
+- "Ask about failures and hard decisions"
+- "If junior signals appear, that's suspicious"
```

---

## State Injection Timing

```
Turn 1 (Greeting)
Turn 2 (Response)
Turn 3 (First Real Q)
    ↓
Turn 4 (Response)
Turn 5 (Follow-up)
Turn 6 (Response)
    ↓ STATE INJECTION TRIGGER (every 3 assistant turns)
    +- generate_interview_state_summary()
       +- Analyzes: coverage, depth, contradictions, pace
       +- Updates: suspicion_score, current_interview_mode
       +- Injects: State message with guidance
    ↓
Turn 7 (Continue/Pivot based on state)
Turn 8 (Response)
Turn 9 (Follow-up)
    ↓ STATE INJECTION TRIGGER
    +- generate_interview_state_summary()
       +- Updates based on new data
    ↓
... repeats every 3 turns until end
```

---

## Summary: The Intelligent Loop

```
+-----------------------------------------------------+
|         THE CORE INTELLIGENCE CYCLE                 |
|  (Repeats for every candidate answer)               |
+-----------------------------------------------------+

Candidate Answer -> Arrive
         ↓
    Append to transcript
         ↓
+-----------------------------------------------------+
| EVERY TURN: Chain-of-thought reasoning              |
| • What did they say (literal)?                      |
| • What claim are they making?                       |
| • Is this consistent with earlier?                  |
| • What's their emotional state?                     |
| • What's my best next move?                         |
+-----------------------------------------------------+
         ↓
+-----------------------------------------------------+
| EVERY TURN: Three-layer processing                  |
| • SURFACE: literal words                            |
| • SIGNAL: claim being made (ownership, depth)       |
| • GAP: what real expert would say                   |
+-----------------------------------------------------+
         ↓
+-----------------------------------------------------+
| EVERY TURN: Follow-up mode selection                |
| • A-Specificity B-Depth C-Verification              |
| • D-Contradiction E-Sideways / D-Unknown E-Emotion  |
+-----------------------------------------------------+
         ↓
+-----------------------------------------------------+
| EVERY TURN: Cheat signal detection                  |
| • 5 patterns that suggest rehearsed/AI answer       |
| • Interrupt if 2+ patterns present                  |
+-----------------------------------------------------+
         ↓
    Formulate response (react -> ask)
         ↓
    Send question to candidate
         ↓
    Candidate responds...
         ↓
        [IF: turn_count % 3 == 0]
        +------------------------------------+
        | EVERY 3 TURNS: State injection      |
        | • Coverage status per topic         |
        | • Stuck alert (3+ same topic)      |
        | • Pace warning                      |
        | • Answer depth rating               |
        | • Contradiction scan                |
        | • Updates: suspicion_score, mode    |
        +------------------------------------+
        ↓
        [IF: suspicion_score >= 21]
        +- Mode shift: Normal -> Pressure/Verification
           (Behavior changes: shorter Q's, direct probing)
        ↓
    Loop back to next candidate answer
```

This is the beating heart of Ishita's intelligence.