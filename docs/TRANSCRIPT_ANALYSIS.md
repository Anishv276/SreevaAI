# TRANSCRIPT ANALYSIS vs PROMPT LAYERS

## KEY PROMPT RULES

### VOICE LAYER (prompt_layers.py)
- **Line 46:** Fresher → "you're interested in HOW they think, not what they've done"
- **Line 53-59:** Validation reactions (must be grounded, specific)
- **Line 58:** "Something vague: Hmm, that's a bit broad — can you get more specific on your part?"
- **Line 104:** ONE question per turn. ABSOLUTE RULE
- **Line 108-116:** Do NOT bundle questions with "and" or commas

### EVALUATION LAYER (prompt_layers.py)
- **Line 159-163:** After answer, detect if it's off:
  - "Did that actually answer it, or did they talk around it?"
  - "Was there a real 'I' in that story — or was it all 'we'?"
  - "Is something missing — a number, a decision, a failure?"
- **Line 172-178:** How to respond:
  - "Vague ownership → you want to know what was specifically theirs"
  - "Evasion → you noticed and you're coming back to it"
  - "Vague again after one probe → move on, don't probe a third time"

### INTERVIEW PHASES (interview_phases.py)
- **Line 101-103:** For FRESHER: "Look for: did they understand WHY they built it? Can they explain a decision?"
- **Line 103:** "If they're vague, try: 'Walk me through one specific day of work on that.'"

---

## CRITICAL MOMENTS ANALYZED

### ✅ TIMESTAMP 37-42: OPENING (Correct)
```
AI: "tell me what you personally built or owned in the Multi Channel Lead Qualification System project?"
Candidate: "Yeah. I have built everything on own."
```
✅ Follows opening move  
✅ One question only  
❌ Response is vague ("everything on own"), needs follow-up

---

### ✅ TIMESTAMP 57-66: FOLLOW-UP (Good intent, needs detection)
```
AI: "Walk me through one specific part you built in that system—what did you actually create or set up?"
Candidate: "I set up qualification and booking part. So we have..."
```
✅ Follows fresher instinct: "Walk me through one specific day"  
✅ One question  
✅ Pushes for specificity  
❌ **EVALUATION LAYER FAILED:** Candidate says "we" instead of "I" — should have been detected

---

### 🔴 TIMESTAMP 77: MULTI-QUESTION ERROR #1
```
AI: "Okay, you set up the qualification and booking part — what did that look like in practice? 
    How did you decide which leads qualified and what triggered the booking reminders?"
```
❌ **THREE QUESTIONS bundled:**
1. "what did that look like in practice?"
2. "How did you decide which leads qualified?"
3. "what triggered the booking reminders?"

**Result:** Candidate answered vaguely about "we did trained our AI" without addressing specifics.

---

### 🔴 TIMESTAMP 148: MULTI-QUESTION ERROR #2
```
AI: "Can you walk me through how you actually set up that AI training? 
    Like, what data did you use, and how did you teach it to recognize hot versus warm leads?"
```
❌ **TWO QUESTIONS bundled with "and":**
1. "what data did you use?"
2. "how did you teach it?"

---

### 🔴 TIMESTAMP 176 & 188: MULTI-QUESTION ERROR #3 (REPHRASE)
```
Timestamp 176:
AI: "What kind of previous data was that exactly, and how did you measure if the AI was 
    correctly identifying hot and warm leads during those tests?"

Timestamp 188 (REPHRASE):
AI: "I lost you a little there—what kind of data were you using for those tests, 
    and how did you check if the AI was performing well in lead qualification?"
```
❌ **STILL TWO QUESTIONS** in the rephrase attempt  
❌ **Per evaluation layer (line 178):** "Vague again after one probe → move on, don't probe a third time"  
✅ Good: Used "I lost you a little" (grounded validation) but structure still wrong

---

### ❌ TIMESTAMP 215-267: CANDIDATE EVADES, AI ACCEPTS
```
Candidate: "we will get all the data of Instagram charts... we will train yay to behave like him"
AI: "Okay, so you used Instagram chat data to understand user intent and trained the AI to mimic 
    that behavior—nice approach. How did you actually collect and process that chat data to feed 
    into your AI model?"
```
✅ **ONE question now** (shorter, focused)  
✅ Grounded validation  
❌ **EVALUATION LAYER FAILED:** Candidate said "we" not "I", but AI didn't catch the shift  
❌ **FRESHER INSIGHT MISSING:** Should have asked "HOW did YOU train it? Did you write the prompt? Did you handle the data?"

---

### ❌ TIMESTAMP 352-372: RED FLAG — "I DIDN'T FACE ANY CHALLENGES"
```
Candidate: "I didn't face any challenges"
AI: "Hmm, that's interesting—most projects throw at least one curveball. Was there anything 
    that didn't go exactly as planned or maybe something you learned to do differently as 
    you built the system?"
Candidate: "No. Nothing went that like that. Everything we built everything was good."
```
❌ **DOUBLE RED FLAG:**
1. **First answer** too clean: "I didn't face any challenges"
2. **After probe**, candidate says "we" again: "Everything WE built"

✅ AI probed (good)  
❌ **EVALUATION LAYER MISSED:** This is a pattern — candidate keeps saying "I built everything" then "we did"

---

### ❌ TIMESTAMP 416-442: SENSEX PROJECT — WEAK OWNERSHIP
```
AI: "What part of that pipeline did you build or own yourself?"
Candidate: "So I built everything on own"
```
❌ **SAME VAGUE PATTERN REPEATS**  
❌ AI doesn't dig: "Did you write the SQL? Did you design the Power BI schema?"

---

### ✅ TIMESTAMP 521-540: APOLLO — BETTER STRUCTURE
```
AI: "What was your specific responsibility—were you setting up campaigns, managing lists, or something else?"
Candidate: "Yeah. Everything. Setting up to managing. Checking the data daily."
```
✅ ONE question with conversational options  
✅ Grounded  
❌ "Everything" again — vague

---

### ❌ TIMESTAMP 569-623: MESSAGING OPTIMIZATION EVASION
```
AI: "When you noticed a campaign underperforming, what steps did you take to improve its 
    conversion or response rates?"
Candidate: "I mostly focus on, like let me tell you an example. If candidates if campaign 
    is not performing well, then I'd change the or else I'll stop the campaign."
```
❌ **Broken sentence:** "I'd change the or else I'll stop" — change THE WHAT?  
❌ AI should have: "Change the WHAT? The subject line? The audience?"

```
AI: "When you decided to change a campaign, what specific elements did you usually adjust? 
    The messaging, targeting, or something else?"
Candidate: "So mostly targeting the messaging"
```
❌ **Vague answer:** Doesn't say WHICH of these two, or HOW  
✅ AI did ask with options (conversational)

```
AI: "Perfect, messaging is exactly where you can move the needle. How did you figure out 
    what messaging changes to make—did you rely on data, feedback, or something else?"
Candidate: "Depends. I can't give you an exact answer."
```
✅ Candidate showed honesty  
❌ **RED FLAG FOR GTM ROLE:** A GTM engineer who "can't give an exact answer" on how they optimize messaging = weak

---

## SUMMARY: RULE VIOLATIONS

| Rule | Broken? | Timestamp | Impact |
|------|---------|-----------|--------|
| ONE question per turn | ✅ YES | 77, 148, 176, 188 | Candidate could escape by answering one part only |
| Fresher: HOW they think, not WHAT | ✅ YES | 42, 112, 135, 442 | AI accepted "I built everything" without understanding HOW |
| Detect "we" → "I" flip-flop | ✅ YES | 66→112, 372, 416 | Pattern shows uncertainty in candidate's claims |
| Vague after first probe → move on | ⚠️ PARTIAL | 176-188 | AI probed twice on same point, should have moved on |
| Grounded validation | ✅ OK | Multiple | AI did use specific details (Instagram, Power BI, Apollo) |
| Ownership ambiguity detection | ❌ MISSED | Throughout | Candidate keeps saying "I built everything" then "we"—major signal |

---

## KEY INSIGHT: THE REAL PROBLEM

The transcript shows **ownership ambiguity** that the **evaluation layer** should have flagged as a signal after the FIRST instance:

**Timestamp 66:** Candidate says "we have" (not "I set up")  
**Timestamp 112:** "we did trained our AI"  
**Timestamp 372:** "Everything WE built"  
**Timestamp 416:** "I built everything" (contradicts "we")

This pattern = **"ownership_ambiguity"** signal per [eval_pipeline.py:199](../interview/eval_pipeline.py#L199)

The AI should have been told: **"You noticed this contradiction. This candidate keeps flipping between 'I' and 'we'. Ask one direct ownership question next: 'Were these team projects or solo work?'"**

But the evaluation layer didn't fire the signal, so the AI never got that directive.

---

## WHAT THE FIX DOES

Your fix at **[prompt_layers.py:108-116](../interview/prompt_layers.py#L108-L116)** prevents the multi-question bundling that let candidates escape specificity.

But the **real** issue is that the **evaluation pipeline** (eval_pipeline.py) should have been firing **ownership_ambiguity** signals to redirect the AI when these contradictions surfaced.

The prompt is now cleaner, but the evaluation logic needs to be checked to see why it didn't detect these patterns.