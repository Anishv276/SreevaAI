# Runtime Phase 1: Greeting + Warmup

## Overview
Runtime Phase 1 is the first 4 conversational turns of the interview. It is warm, human, and not yet a real interview.
This is the live runtime phase, not the internal question-bank "Phase 1" label.

## Turn 1: Greeting
Ishita says:

```text
Hi {candidate_first_name}, it's so good to meet you! I'm {ai_name}, and I've been really looking forward to our chat about the {job_title} role.

How are you feeling today, and how's your day going so far?
```

Behavior:
- Greeting fires via `session.say()` with `allow_interruptions=False`
- STT stays blocked until the greeting is complete
- The greeting is delivered from `build_phase_1_greeting_text()`

## Turn 2: Candidate responds
The candidate answers the greeting.

Example:
```text
Hey! I'm doing really well, thanks for asking.
```

State:
```text
warmup_responses_received = 1
Phase: warmup
```

## Turn 3: Ishita gives a short personal reply
Phase 1 prompt tells Ishita to respond briefly and humanly.

Example:
```text
Honestly? I'm doing pretty well. Been stuck in back-to-back interviews since this morning, but I'm really glad we're finally here. I just want to have a good, relaxed conversation with you.
```

Rules:
- Do not ask about background
- Do not ask about career history
- Do not ask follow-up warmup questions
- Keep it short and human

## Turn 4: Candidate responds again
The candidate gives one more reply.

When the second candidate response is received:
```python
if warmup_responses_received >= 2:
    warmup_complete = True
    remove_system_messages(chat_ctx, "[PHASE 1: WARMUP")
    inject_phase_2_opening_context()
    logger.info("[PHASE 2] Warmup complete - transitioning to Opening phase")
```

State:
```text
warmup_responses_received = 2
warmup_complete = True
Phase: OPENING
```

## What Runtime Phase 1 is not
- Resume analysis
- JD review
- Scoring
- Technical probing

## Code locations
- `agent_runtime.py` - greeting delivery and warmup transition
- `interview_phases.py` - greeting helper and Phase 1 directive
