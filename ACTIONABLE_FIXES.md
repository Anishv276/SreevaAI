# Actionable Fixes for Question Repetition & Overall Improvement

## Priority 1: Fix Question Repetition (6-8 hours) 🔴 CRITICAL

### Problem
Ishita asks the same question multiple times because:
- No atomic question tracking (questions don't have IDs)
- State injection says "topic is covered" but doesn't say which questions were asked
- LLM relies on mental state from system prompt, which degrades with transcript length
- Topic (microservices) ≠ Question ("What's your experience with microservices?")

### Solution: Implement Question State Tracking

#### Step 1: Atomize Coverage Checklist (2 hours)

**Current** (line 796-821):
```python
def build_coverage_checklist(candidate_band: str) -> list[str]:
    common = [
        "Validate 2-3 core skills from the resume with one concrete example each.",
        "Ask for measurable outcomes, not just tool names.",
        "Cover one communication or collaboration moment from real work.",
    ]
    if candidate_band == "fresher":
        return [
            "Deep-dive one academic/internship project...",
            ...
        ] + common
```

**Changed to**:
```python
def build_coverage_checklist(candidate_band: str) -> list[tuple]:
    """Returns list of (question_id, description, topic_tag)"""
    common = [
        ("q_core_001", "Validate 2-3 core skills from resume", "core_skills"),
        ("q_outcome_002", "Ask for measurable outcomes not tool names", "metrics"),
        ("q_collab_003", "Cover communication/collaboration moment", "soft_skills"),
    ]
    if candidate_band == "fresher":
        fresher = [
            ("q_fresh_001", "Deep-dive academic/internship project end-to-end", "project_depth"),
            ("q_fresh_002", "Check fundamentals behind tools mentioned", "fundamentals"),
            ("q_fresh_003", "Ask college/teamwork story (ownership, deadlines, conflicts)", "teamwork"),
            ("q_fresh_004", "Assess learning speed: what learned recently + how", "learning_speed"),
        ]
        return fresher + common
    # ... etc for mid and experienced
```

#### Step 2: Track Asked Questions (2 hours)

**Add to state variables** (around line 3474):
```python
# Track which questions have been asked
asked_questions: dict = {}  # {"q_core_001": 3, "q_fresh_002": 7}
# key = question_id, value = turn number when asked

# Track topic coverage
topic_coverage: dict = {}  # {"core_skills": "COVERED", "metrics": "THIN"}
```

**Update during conversation item processing** (around line 3624):
```python
# When Ishita asks a new question, detect which question_id it is
# This is the tricky part - need to match the asked question to question_id

async def identify_question_asked(ishita_response: str, coverage_checklist: list) -> Optional[str]:
    """
    Given Ishita's response, identify which question_id she's asking.
    Uses semantic matching (could use simple string search or LLM).
    """
    # For MVP: simple keyword matching
    question_keywords = {
        "q_core_001": ["core skills", "skills from resume", "validate"],
        "q_outcome_002": ["measurable outcomes", "numbers", "impact", "metrics"],
        "q_collab_003": ["communication", "collaboration", "teamwork"],
        "q_fresh_001": ["academic", "internship", "project", "end-to-end"],
        # ... etc
    }
    
    response_lower = ishita_response.lower()
    for q_id, keywords in question_keywords.items():
        if any(kw in response_lower for kw in keywords):
            return q_id
    return None

# Then in conversation_item_added when role == "assistant":
if role == "assistant":
    turn_count += 1
    identified_q_id = await identify_question_asked(content, coverage_checklist)
    if identified_q_id and identified_q_id not in asked_questions:
        asked_questions[identified_q_id] = turn_count
        logger.info(f"[QUESTION] {identified_q_id} asked at turn {turn_count}")
```

#### Step 3: Inject Into State Message (2 hours)

**Modify generate_interview_state_summary()** (around line 1916):

```python
async def generate_interview_state_summary(
    transcript_lines: list,
    questions_list: str,  # now is list of (q_id, description, topic)
    candidate_name: str,
    job_title: str,
    client,
    asked_questions: dict,  # NEW PARAMETER
    topic_coverage: dict,   # NEW PARAMETER
    org_id: Optional[str] = None,
    turn_count: int = 0,
    total_turns_expected: int = 20,
    llm_model: str = "gpt-4o-mini",
) -> str:
    """
    Generate state summary WITH question tracking.
    """
    # ... existing logic ...
    
    # Build DO_NOT_RE_ASK list
    asked_q_ids = list(asked_questions.keys())
    do_not_ask_text = (
        f"DO_NOT_RE_ASK (already covered): {asked_q_ids}\n"
        if asked_q_ids else ""
    )
    
    # Build AVAILABLE questions list
    available_q_ids = [
        q_id for q_id, _, _ in coverage_checklist 
        if q_id not in asked_questions
    ]
    available_q_text = (
        f"AVAILABLE_QUESTIONS (not yet asked): {available_q_ids}\n"
        if available_q_ids else ""
    )
    
    # Inject into the state prompt (inside the API call)
    state_prompt = f"""
{existing_prompt_content}

QUESTION TRACKING (NEW):
{do_not_ask_text}
{available_q_text}

When selecting your next question, ONLY ask from AVAILABLE_QUESTIONS.
Never re-ask any question in DO_NOT_RE_ASK.
This prevents repetition and ensures coverage breadth.
"""
    
    # ... rest of function ...
```

#### Step 4: Test & Validate (1-2 hours)

```python
# Add unit tests
def test_question_tracking():
    checklist = build_coverage_checklist("fresher")
    assert all(len(item) == 3 for item in checklist), "Each question should have (id, desc, topic)"
    
    asked = {"q_core_001": 3, "q_fresh_002": 7}
    available = [q[0] for q in checklist if q[0] not in asked]
    assert "q_core_001" not in available, "Asked questions should not be available"
    assert len(available) > 0, "Should have remaining questions"

# Run a test interview and verify:
# - No question is asked twice
# - State injection correctly identifies asked questions
# - Log shows [QUESTION] entries
```

---

## Priority 2: Enhance State Injection Format (2-3 hours) 🟡 IMPORTANT

### Current Output
```
TOPIC STATUS: [COVERED] microservices
NEXT ACTION: Ask about specific decision...
ANSWER_DEPTH: [SPECIFIC]
```

### Enhanced Output
```
ASKED_QUESTIONS_ON_THIS_TOPIC:
+- q_distributed_001 (turn 4): "What's your experience with microservices?"
+- q_distributed_002 (turn 8): "Walk me through a microservices migration"

TOPIC_STATUS: [COVERED] distributed_systems
COVERAGE_SCORE: 75% (2/3 questions asked, strong answers)

NEXT_SUGGESTED_QUESTION: q_ownership_005 (from different topic)
DONT_ASK_NEXT: [q_distributed_001, q_distributed_002, q_distributed_003]

PACE: On track (6 areas in 9 turns, ~1.5 min per area) ✓
TIME_REMAINING: 26 minutes of 45 total (58% remaining)
```

### Implementation
Modify the system prompt template (around line 1992-1996) to request this format, and let the LLM respond in this richer format. No code change needed - just system prompt update.

---

## Priority 3: Add Role-Based Question Weighting (3-4 hours) 🟡 IMPORTANT

### Step 1: Define Role Weights

**New function** (in agent.py):
```python
def build_role_weights(role_category: str, role_subtype: str) -> dict[str, float]:
    """
    Returns question weights for a specific role.
    Questions with higher weight should be asked first.
    """
    
    base_weights = {
        "core_skills": 8,
        "metrics": 8,
        "soft_skills": 6,
        "learning_speed": 5,
        "failure_story": 8,
        "ownership_clarity": 8,
        "tradeoff_thinking": 7,
        "tools_depth": 6,
        "team_dynamics": 5,
        "growth_trajectory": 5,
    }
    
    # Engineering tweaks
    if role_category == "engineering":
        base_weights.update({
            "database_design": 9,
            "api_design": 9,
            "distributed_systems": 8,
            "testing_strategy": 6,
            "frontend_basics": 2,  # Low for backend
            "failure_story": 9,  # High for eng
        })
        
        # Backend specific
        if role_subtype == "backend":
            base_weights.update({
                "database_design": 10,
                "concurrency": 9,
                "production_incident": 9,
            })
        
        # Frontend specific
        elif role_subtype == "frontend":
            base_weights.update({
                "performance": 9,
                "state_management": 9,
                "accessibility": 8,
                "browser_compatibility": 7,
                "database_design": 2,
            })
        
        # Data specific
        elif role_subtype == "data":
            base_weights.update({
                "pipeline_reliability": 9,
                "data_quality": 9,
                "business_impact": 8,
                "sql_optimization": 8,
            })
    
    # Sales tweaks
    elif role_category == "sales":
        base_weights.update({
            "quota_numbers": 10,
            "pipeline_discipline": 9,
            "loss_stories": 8,  # More important than wins
            "objection_handling": 8,
            "deal_size": 8,
            "coachability": 7,
        })
    
    # ... etc for other roles ...
    
    return base_weights
```

### Step 2: Sort Questions by Weight

**Modify coverage checklist building**:
```python
def build_weighted_question_list(
    candidate_band: str, 
    role_category: str, 
    role_subtype: str
) -> list[tuple]:
    """Build coverage checklist, then sort by role weight"""
    
    # Get base checklist
    checklist = build_coverage_checklist(candidate_band)
    
    # Get role weights
    weights = build_role_weights(role_category, role_subtype)
    
    # Sort by weight (highest first)
    def get_weight(item):
        q_id, desc, topic = item
        return weights.get(topic, 5)  # Default weight = 5
    
    sorted_checklist = sorted(checklist, key=get_weight, reverse=True)
    
    return sorted_checklist
```

### Step 3: Use in Question Selection

When state injection suggests next question, pick from highest-weight available questions:
```python
# In state injection message:
# Order available questions by weight
available_by_weight = sorted(
    [q for q in available_q_ids],
    key=lambda q_id: role_weights.get(q_id_to_topic[q_id], 5),
    reverse=True
)

state_message += f"AVAILABLE (by priority): {available_by_weight}\n"
```

---

## Priority 4: Add Interview Phase Markers (2-3 hours) 🟢 NICE-TO-HAVE

### Define Phases

```python
def get_interview_phase(turn_count: int, total_turns_expected: int) -> str:
    """Determine current interview phase"""
    progress = turn_count / max(total_turns_expected, 1)
    
    if progress < 0.15:
        return "opening"      # Turns 1-3: rapport building
    elif progress < 0.80:
        return "main"         # Bulk of interview: content depth
    else:
        return "closing"      # Final 20%: wrap-up
```

### Phase-Specific Rules

**Opening Phase** (first 3-4 turns):
- ✅ Personality bridges (hobbies -> work traits)
- ✅ Warm, confidence-building
- ❌ No logic traps
- ❌ No hard probing yet
- ✅ Use brief's smart opening question

**Main Phase** (middle 70%):
- ✅ All follow-up modes enabled
- ✅ Logic traps available
- ✅ Deep spiraling encouraged
- ✅ Question sequencing by weight
- ✅ Coverage tracking active

**Closing Phase** (final 20%):
- ✅ Wrap up uncovered high-priority areas
- ✅ Candidate questions section
- ❌ No new deep topics starting
- ✅ Reflect on conversation
- ✅ Genuine closing (not checklist)

### Implementation

Inject phase into state:
```python
state_message += f"PHASE: {current_phase} ({phase_turns}/{total_turns})\n"
```

Then in system prompt, add phase-specific guidance:
```
If PHASE: opening
+- Focus: rapport and comfort
+- Tools: personality bridges, warm acknowledgments
+- Avoid: logic traps, hard challenges

If PHASE: main
+- Focus: content depth and coverage
+- Tools: all five follow-up modes
+- Use: role-specific probes, mutation scenarios

If PHASE: closing
+- Focus: wrap-up and candidate questions
+- Check: did we cover high-priority areas?
+- Close: specific to this conversation
```

---

## Priority 5: Split System Prompt Into Modules (4-6 hours) 🟢 NICE-TO-HAVE

### Current Issue
- 2,500+ line system prompt as single string
- Hard to update role logic without regenerating full prompt
- State injection appends extra context (fragile)
- Brief appends another section (more fragile)

### Proposed Structure

**Core System Prompt** (~800 lines):
```
WHO YOU ARE (Ishita's persona)
SESSION CONTEXT (candidate name, role, time)
HARD CONSTRAINTS (one question per turn, max follow-ups)
MANDATORY COVERAGE (brief's questions and gaps)
CHAIN-OF-THOUGHT (5-step reasoning)
THREE-LAYER PROCESSING (Surface/Signal/Gap)
FOLLOW-UP SELECTOR (5 modes)
HOW YOU BEHAVE (tone standards, accuracy discipline)
```

**Role Layer** (~500-1500 lines):
```
Injected separately at startup:
+- Role-specific evaluation signals
+- Fake answer patterns for this role
+- Probe triggers
+- Mutation scenarios
+- Seniority adjustments
```

**State Injection Template** (~200 lines):
```
Injected every 3 turns:
+- Topic coverage status
+- Question tracking
+- Stuck alerts
+- Pace warnings
+- Mode directive
+- Next action guidance
```

**Candidate Brief** (~400 lines):
```
Injected at startup or deferred:
+- Personalized interview plan
+- Resume-JD gaps
+- Personality bridges
+- Tool validation
+- Watch-outs
```

### Implementation

```python
# Load templates at startup
CORE_PROMPT = read_file("prompts/core_system_prompt.txt")
ROLE_TEMPLATE = read_file("prompts/role_layer_template.txt")
STATE_INJECTION_TEMPLATE = read_file("prompts/state_injection_template.txt")

# Assemble at runtime
system_prompt = CORE_PROMPT.format(
    candidate_name=candidate_name,
    job_title=job_title,
    time_limit_mins=time_limit_mins,
    questions_list=questions_list
)

# Inject role layer
role_content = build_role_layer(role_category, role_subtype, candidate_band)
system_prompt += f"\n{role_content}\n"

# Inject brief (async)
if candidate_brief_block:
    system_prompt += f"\n{candidate_brief_block}\n"

chat_ctx.add_message(role="system", content=system_prompt)
```

**Benefits**:
- Each piece is independently versioned
- Easy to A/B test prompts
- State injection changes don't require re-parsing
- Role logic updates don't affect core behavior
- Easier to debug (can test each module)

---

## Priority 6: Add Contradiction Memory (3-4 hours) 🟢 NICE-TO-HAVE

### Current
State injection detects contradictions and flags them, but doesn't track a history.

### Proposed

```python
# Track potential contradictions
contradictions_detected: list = []
# [
#   {
#     "turn_a": 4,
#     "claim_a": "Led a team of 5 engineers",
#     "turn_b": 8,
#     "claim_b": "I was just helping the team, not leading",
#     "status": "resolved" | "flagged" | "unresolved"
#   }
# ]

# In state injection, when contradiction detected:
contradictions_detected.append({
    "turn_a": T1,
    "claim_a": earlier_quote,
    "turn_b": T2,
    "claim_b": current_quote,
    "status": "flagged"  # Ishita should surface this
})

# In final proctorReport:
"contradictions": [
    {
        "turn_1": 4,
        "claim_1": "Led a team of 5 engineers on the migration",
        "turn_2": 8,
        "claim_2": "I was just helping the team implement what the PM designed",
        "surface_method": "Ishita asked for clarification in turn 9",
        "resolution": "Downgraded ownership claim from rung 5 to rung 3"
    }
]
```

---

## Testing Strategy

### Unit Tests (2 hours)

```python
# test_question_tracking.py
def test_question_atomization():
    checklist = build_coverage_checklist("experienced")
    assert all(len(item) == 3 for item in checklist)
    assert len(set(item[0] for item in checklist)) == len(checklist), "Question IDs unique"

def test_role_weights():
    weights = build_role_weights("engineering", "backend")
    assert weights["database_design"] >= 9
    assert weights["frontend_basics"] <= 2

def test_phase_detection():
    assert get_interview_phase(1, 10) == "opening"
    assert get_interview_phase(5, 10) == "main"
    assert get_interview_phase(9, 10) == "closing"

def test_no_question_repeats():
    asked = {"q001": 3, "q002": 5}
    available = get_available_questions(checklist, asked)
    assert "q001" not in available
    assert "q002" not in available
```

### Integration Tests (3-4 hours)

```python
# test_interview_flow.py
async def test_full_interview_no_repeats():
    """Simulate full interview, verify no question repeats"""
    context = await setup_interview(
        candidate_name="Test",
        job_title="Backend Engineer",
        resume_text="5 years Python, microservices expert",
    )
    
    transcript = []
    for turn in range(1, 20):
        # Simulate Ishita asking
        ishita_response = agent.ask(question_num=turn)
        transcript.append(("ishita", ishita_response))
        
        # Track which question was asked
        q_id = identify_question_asked(ishita_response)
        if q_id:
            assert q_id not in transcript_question_ids, f"Question {q_id} asked twice"
            transcript_question_ids.add(q_id)
        
        # Simulate candidate responding
        candidate_response = generate_response(ishita_response)
        transcript.append(("candidate", candidate_response))
        
        # Every 3 turns, verify state injection works
        if turn % 3 == 0:
            state = generate_state_summary(transcript, asked_questions)
            assert q_id not in state.get("do_not_re_ask", [])
    
    assert len(transcript_question_ids) > 3, "Should ask multiple questions"
    assert len(transcript_question_ids) < 30, "Should not ask too many"
```

### Manual Test Cases (2 hours)

1. **Interview a Fresher**
   - ✅ Rapport-building questions appear first
   - ✅ Academic projects asked about specifically
   - ✅ No repetition of questions
   - ✅ Warm, encouraging tone throughout

2. **Interview an Experienced Backend Engineer**
   - ✅ Skip basics, go straight to scale/ownership
   - ✅ Database design questions appear (high priority)
   - ✅ Production incident stories probed deeply
   - ✅ Frontend questions skipped or minimal

3. **Detect Cheating**
   - ✅ Rehearsed answer triggers logic trap
   - ✅ Mode shifts to pressure
   - ✅ Suspicious signals accumulate in score
   - ✅ Contradiction flagged when detected

---

## Rollout Plan

### Week 1: Foundation
- [ ] Implement question atomization (Priority 1, Step 1)
- [ ] Add question tracking variables (Priority 1, Step 2)
- [ ] Test on 5 mock interviews

### Week 2: Integration
- [ ] Integrate tracking into state injection (Priority 1, Step 3)
- [ ] Enhance state format (Priority 2)
- [ ] Test on 10 real interviews
- [ ] Monitor: zero question repeats

### Week 3: Enhancement
- [ ] Add role-based weights (Priority 3)
- [ ] Add interview phases (Priority 4)
- [ ] Test on 20 real interviews by role

### Week 4: Polish
- [ ] Split prompt into modules (Priority 5)
- [ ] Add contradiction memory (Priority 6)
- [ ] Full regression testing
- [ ] Deploy to production

---

## Expected Impact

| Fix | Repetition Reduction | UX Improvement | Dev Effort |
|-----|---------------------|----------------|-----------|
| Question Tracking | 95% | Candidate feels heard | 6-8h |
| State Format | 98% | Better guidance | 2-3h |
| Role Weights | 100% | More relevant questions | 3-4h |
| Phase Markers | 100% | Smoother flow | 2-3h |
| Prompt Modules | 100% | Easier to maintain | 4-6h |

**Total Effort**: 17-24 hours

**Total Impact**: From 7/10 to 9/10 system

---

## One More Thing: Consider LLM Upgrade

Your system is currently using ChatGPT models. Consider:

1. **Claude 3.5 Sonnet**: Better understanding of context, fewer hallucinations, better instruction-following
2. **Prompt Caching**: Since the system prompt is 2500+ lines, prompt caching could reduce costs/latency by 60%

```python
# With prompt caching:
chat_ctx.add_message(
    role="system",
    content=system_prompt,
    cache_control={"type": "ephemeral"}  # 5-min cache
)

# On next API call, same prompt uses cached tokens (90% cheaper)
# And completes 25% faster
```

For a system making 1000 interviews/month, this could save $50-200/month and improve latency.

---

That's your comprehensive roadmap. The question repetition fix is achievable in a single sprint, and everything else makes the system objectively better.
