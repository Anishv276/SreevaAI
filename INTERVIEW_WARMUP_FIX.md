# Interview Flow Fix - Warmup → Pivot to Structured Interview

## The Requirement

You wanted:
1. **First 2 turns**: Light conversational warmup (building rapport, not interview)
2. **Turn 3+**: Pivot to "Okay, let's dive into the interview" with resume-grounded questions

## The Solution

Added two new directives injected before agent speaks:

### 1. `build_fast_opening_context()`
**What it does**: Tells agent to be conversational for first 2 turns
```
Turn 1: "How's your day? Tech working okay?"
Turn 2: "Where are you calling from? How long in this field?"
```

### 2. `build_interview_pivot_directive()`
**What it does**: After turn 2, shift to structured interview
```
"Okay, let's dive into the interview. I want to learn more about your background 
and experience for this role."
→ Then ask first REAL resume-grounded question
```

## Interview Timeline

```
WARMUP PHASE
═══════════════════════════════════════════════════════════════════

Turn 1 (Greeting + Initial Comfort)
├─ Agent: "Hi! How's your day going? Tech working okay?"
└─ Candidate: "Good, excited to chat"

Turn 2 (Icebreaker)
├─ Agent: "Nice! Where are you located? How long have you been in tech?"
└─ Candidate: "California, in tech for 5 years"


INTERVIEW PHASE
═══════════════════════════════════════════════════════════════════

Turn 3 (Pivot)
├─ Agent: "Okay, let's dive into the interview. I want to learn more about 
│          your background and experience for this Backend role."
├─ Agent: "You're at Acme as a Senior Engineer—tell me about a recent 
│          project you worked on."
└─ Candidate: [Actual interview answer]

Turn 4-10 (Structured Questions)
├─ Resume-grounded questions
├─ Real-time scoring & contradiction detection
├─ Follow-ups based on gaps vs JD
└─ Full brief context (async) now available for deeper probing

Turn 11-N (Deep Dives)
├─ Probing red flags from resume
├─ Ownership validation ("what did YOU do vs team?")
├─ JD requirement coverage
└─ Behavioral signals
```

## Implementation

**agent_profile_context.py** (new functions):

```python
def build_fast_opening_context() -> str:
    """
    Return instruction for first 2 conversational turns (warmup, no interview yet).
    """
    return (
        "[FIRST TWO TURNS — CONVERSATIONAL WARMUP]\n"
        "Turn 1 & 2: Be warm and human. Ask casual setup questions:\n"
        "  Turn 1: Light greeting + how their day is, comfort level, tech working\n"
        "  Turn 2: One soft icebreaker (location, field tenure, what drew them)\n\n"
        "Keep short and friendly. Let them relax before real interview starts.\n"
        "Do NOT ask structured interview questions yet.\n\n"
        "After turn 2, you'll shift to: 'Okay, let's dive into the interview...'"
    )


def build_interview_pivot_directive() -> str:
    """
    Return instruction to pivot from warmup to structured interview after turn 2.
    """
    return (
        "[INTERVIEW PIVOT]\n"
        "You've had your warmup (turns 1-2). Now shift the tone:\n"
        "Say: 'Okay, let's dive into the interview. I want to learn more about "
        "your background and experience for this role.'\n"
        "Then ask your first REAL interview question (from brief or coverage list).\n"
        "From here on: structured, resume-grounded questions one at a time."
    )
```

**agent_runtime.py** (injection point, ~line 808):

```python
chat_ctx = llm.ChatContext()
chat_ctx.add_message(role="system", content=system_prompt)

# Inject warmup directive: first 2 turns conversational, then pivot to interview
warmup_context = build_fast_opening_context()
chat_ctx.add_message(role="system", content=warmup_context)

pivot_directive = build_interview_pivot_directive()
chat_ctx.add_message(role="system", content=pivot_directive)

logger.info("[OPENING] Conversational warmup + interview pivot directives injected")
```

## Agent Behavior

**Turn 1-2 (Warmup)**
- No interview questions
- No resume probing
- Just rapport building
- Natural, conversational tone

**Turn 3 (Pivot)**
- Agent explicitly signals shift: "Okay, let's dive into the interview..."
- First **real** interview question (resume-grounded)
- Tone becomes more professional, structured

**Turn 4+ (Interview)**
- Structured Q&A based on resume + JD
- Real-time scoring and evaluation
- Coverage tracking
- Follow-ups on gaps

## Files Changed

1. **agent_profile_context.py**
   - Added `build_fast_opening_context()`
   - Added `build_interview_pivot_directive()`

2. **agent_runtime.py**
   - Import both new functions
   - Inject both directives into chat context after system prompt

---

## Key Design Decisions

✅ **Warmup is first**, not buried in system prompt
- Agent clearly knows turns 1-2 are conversational
- Reduces cognitive load on LLM

✅ **Explicit pivot statement**
- "Let's dive into the interview" signals tone shift
- Candidate knows structured part is starting

✅ **Resume-grounded questions start at turn 3**
- Full brief (async) may not be ready yet
- But agent has resume + JD in memory
- Pivot statement gives time for brief to arrive by turn 4

✅ **No complex logic needed**
- Just system directives
- Agent naturally follows them per prompt
- No turn counters or state machines

---

**Result**: Interview now follows natural conversational flow → structured assessment pattern. Candidate feels heard before diving into technical questions.
