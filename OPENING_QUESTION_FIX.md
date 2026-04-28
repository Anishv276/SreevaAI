# Opening Question Fix - Why Ishita Asked Generic Questions

## The Problem

Agent asked you:
> "I'm doing well, thanks for asking. It's a good day to dive into some interesting conversations. To get us started, could you share a bit about a recent project you worked on that you're proud of?"

This is **generic** when it should have been **resume-anchored**, like:
> "You're currently at [Company] as a [Role]. Walk me through a recent project there you're proud of."

## Why It Happened

The codebase **did have** a system to generate smart opening questions:

1. **System prompt** (correct): Says "NOT 'tell me about yourself'. NOT generic. Reference something real from their background."
2. **Brief generation** (correct): GPT-4o generates a "SMART OPENING QUESTION" section based on resume + JD
3. **But timing was wrong**: The brief is generated **asynchronously in the background** (line 751 in agent_runtime.py), taking 2-3 seconds
4. **Agent speaks immediately** after joining room, before brief arrives
5. **By the time brief arrives**, agent has already asked its generic question

## The Fix

Added **synchronous fast opening question generation** that fires **before the agent speaks**:

### New Function: `build_fast_opening_question()` 
**Location**: `agent_profile_context.py` (line ~970)

Generates opening question immediately from:
- Resume text (current company, role, projects)
- JD requirements
- Shared skills between resume and JD

**Examples it generates:**
```
✓ "You're currently at Acme as a Senior Backend Engineer. Walk me through a recent project there."
✓ "I see you have Python experience. Tell me about a project where you used Python in production."
✓ "Let's start with your most recent relevant experience for this Backend role."
```

### Injection Point: `agent_runtime.py` (line ~808)

Right after `chat_ctx` is created (before agent speaks), inject:
```python
fast_opening_q = build_fast_opening_question(
    resume_block=resume_block,
    jd_block=jd_block,
    candidate_name=candidate_name,
    resume_context=resume_context,
)
chat_ctx.add_message(
    role="system",
    content=(
        "[FIRST QUESTION DIRECTIVE]\n"
        f'Your opening greeting is warm and brief. Then ask:\n\n'
        f'"{fast_opening_q}"\n\n'
        f"Deliver it naturally, as if you just thought of it."
    ),
)
```

## How It Works Now

```
Timeline:
00:00  Agent joins room
       ↓
00:01  Fast opening question injected into system prompt
       ↓
00:02  Agent greets + asks fast opening question (GROUNDED IN RESUME)
       ↓
00:03  Candidate starts answering
       ↓
00:04  Async brief arrives (GPT-4o completed)
       ↓
00:05  Full personalized brief injected, replaces fast question with deeper context
```

**Result**: 
- First question is **never generic**
- Uses actual resume content (company, role, projects, skills)
- Tied to JD requirements
- By turn 2-3, full brief context is available for deeper probing

## Testing

The fix ensures:
1. Agent always asks a **resume-specific opening question**
2. It's not "tell me about yourself" or "project you're proud of"
3. It references **real data** from resume/JD
4. When full brief arrives, it upgrades to even more specific probing

## Files Changed

- `agent_profile_context.py`: Added `build_fast_opening_question()` function
- `agent_runtime.py`: 
  - Imported `build_fast_opening_question`
  - Added injection of fast opening question before agent's first turn
  - Logs when fast opening question is used

---

**Summary**: Ishita now asks resume-grounded questions from turn 1, instead of generic openers. The async brief still arrives for deeper context on follow-ups.
