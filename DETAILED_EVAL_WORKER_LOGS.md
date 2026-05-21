# DETAILED EVAL WORKER LOGS - WITH ALL CALCULATIONS

This document shows the **exact logs** you'll see from the eval worker with all the new detailed logging implemented.

---

## TURN 2: First Evaluation (Bootstrap + Strong Answer)

```
[WORKER] Processing app_id=interview_001 turn=2
[TOPIC_BOOT] active_topic empty — next_uncovered=Cloud Infrastructure (resume_topics=2 skill_topics=2 covered=0)

[QA] turn=2  Q: Tell me about a project you're really proud of?
              A: I built a microservices platform for e-commerce that scaled to 100K RPS...

[EVAL_PIPELINE] Step2/Topics: uncovered_next=Cloud Infrastructure | discussed_log=0 entries

[QUALITY] turn=2 | clarity=7.0 depth=6.5 specificity=7.5 grounding=7.0 | avg=7.00

[TOPIC_STATE] CREATED NEW | topic=Cloud Infrastructure source=resume importance=HIGH | threshold=6.5 base_credit=0.8

[SIGNAL] name=ownership_clarified          layer=positive_signal    confidence=0.85 delta=+0.50 turn=2

[EVAL] turn=2 action=PROBE mode=normal quality_avg=7.00 signals=[ownership_clarified]

[SAT_CALC] topic=Cloud Infrastructure | response_score=6.50 contribution=6.50 signal_penalty=+0.50 final_contribution=7.00
[SAT_CALC] base_credit=0.8 | score: 0.0 → 7.80 (delta=+7.80) | follow_ups: 0 → 1

[SAT_RESULT] ✅ SATURATED | score=7.8 >= threshold=6.5 (120%) | importance=HIGH

[SATURATION] turn=2 | topic=Cloud Infrastructure | saturated_at_7.8 | signals=[ownership_clarified]

[DECISION] turn=2 | depth_decay=False weak_exit=False saturated=True action=PROBE
[DECISION] ✅ SATURATED → score=7.8 >= threshold=6.5 → forcing MOVE_ON turn=2

[SATURATION] MOVE_ON reason=saturated(saturated_at_7.8) → next=Team Leadership (importance=HIGH) turn=2

[RESULT] turn=2  action=MOVE_ON  quality=7.00/DEEP  signals=[ownership_clarified]
         next=Team Leadership  covered=[Cloud Infrastructure]

[WORKER] ✓ turn=2 action=MOVE_ON quality=7.00 | saturation=7.8/6.5 (120%) importance=HIGH | signals=[ownership_clarified] | next=Team Leadership
```

---

## TURN 3: Saturation Accumulation (Strong Answer)

```
[WORKER] Processing app_id=interview_001 turn=3

[QA] turn=3  Q: What specific challenges did you face with distributed architecture?
              A: The main challenge was managing distributed transactions. We had orphaned orders...

[EVAL_PIPELINE] Step2/Topics: uncovered_next=Database Design | discussed_log=1 entries

[QUALITY] turn=3 | clarity=7.0 depth=6.5 specificity=6.5 grounding=6.0 | avg=6.50

[TOPIC_STATE] RESTORED | topic=Team Leadership importance=HIGH | saturation_score=0.0/6.5 follow_ups=0 base_credit=0.8
  ↓ (This is a NEW topic from turn 2's MOVE_ON, so fresh state)

[SIGNAL] name=ownership_clarified          layer=positive_signal    confidence=0.82 delta=+0.50 turn=3

[EVAL] turn=3 action=PROBE mode=normal quality_avg=6.50 signals=[ownership_clarified]

[SAT_CALC] topic=Team Leadership | response_score=6.20 contribution=6.20 signal_penalty=+0.50 final_contribution=6.70
[SAT_CALC] base_credit=0.8 | score: 0.0 → 7.50 (delta=+7.50) | follow_ups: 0 → 1

[SAT_RESULT] ✅ SATURATED | score=7.5 >= threshold=6.5 (115%) | importance=HIGH

[SATURATION] turn=3 | topic=Team Leadership | saturated_at_7.5 | signals=[ownership_clarified]

[DECISION] turn=3 | depth_decay=False weak_exit=False saturated=True action=PROBE
[DECISION] ✅ SATURATED → score=7.5 >= threshold=6.5 → forcing MOVE_ON turn=3

[SATURATION] MOVE_ON reason=saturated(saturated_at_7.5) → next=Database Design (importance=MEDIUM) turn=3

[RESULT] turn=3  action=MOVE_ON  quality=6.50/DEEP  signals=[ownership_clarified]
         next=Database Design  covered=[Cloud Infrastructure, Team Leadership]

[WORKER] ✓ turn=3 action=MOVE_ON quality=6.50 | saturation=7.5/6.5 (115%) importance=HIGH | signals=[ownership_clarified] | next=Database Design
```

---

## TURN 4: Skill Topic (Medium Priority)

```
[WORKER] Processing app_id=interview_001 turn=4

[QA] turn=4  Q: What's the most complex data modeling challenge you've tackled?
              A: We had a polyglot persistence problem. We used PostgreSQL for relational...

[EVAL_PIPELINE] Step2/Topics: uncovered_next=API Development | discussed_log=2 entries

[QUALITY] turn=4 | clarity=7.5 depth=7.0 specificity=6.5 grounding=7.5 | avg=7.13

[TOPIC_STATE] CREATED NEW | topic=Database Design source=skill importance=MEDIUM | threshold=5.0 base_credit=1.0

[SIGNAL] name=none

[EVAL] turn=4 action=PROBE mode=normal quality_avg=7.13 signals=none

[SAT_CALC] topic=Database Design | response_score=7.00 contribution=7.00 signal_penalty=0.00 final_contribution=7.00
[SAT_CALC] base_credit=1.0 | score: 0.0 → 8.00 (delta=+8.00) | follow_ups: 0 → 1

[SAT_RESULT] ✅ SATURATED | score=8.0 >= threshold=5.0 (160%) | importance=MEDIUM

[SATURATION] turn=4 | topic=Database Design | saturated_at_8.0 | signals=none

[DECISION] turn=4 | depth_decay=False weak_exit=False saturated=True action=PROBE
[DECISION] ✅ SATURATED → score=8.0 >= threshold=5.0 → forcing MOVE_ON turn=4

[SATURATION] MOVE_ON reason=saturated(saturated_at_8.0) → next=API Development (importance=MEDIUM) turn=4

[RESULT] turn=4  action=MOVE_ON  quality=7.13/DEEP  signals=none
         next=API Development  covered=[Cloud Infrastructure, Team Leadership, Database Design]

[WORKER] ✓ turn=4 action=MOVE_ON quality=7.13 | saturation=8.0/5.0 (160%) importance=MEDIUM | next=API Development
```

---

## TURN 5: Weak Answer (PROBE, not MOVE_ON)

```
[WORKER] Processing app_id=interview_001 turn=5

[QA] turn=5  Q: What's your approach to API versioning and backward compatibility?
              A: Uh, we just... use different versions I guess? Like /v1/ and /v2/ in the URL.

[EVAL_PIPELINE] Step2/Topics: uncovered_next=none | discussed_log=3 entries

[QUALITY] turn=5 | clarity=3.5 depth=2.0 specificity=2.5 grounding=2.0 | avg=2.50

[TOPIC_STATE] CREATED NEW | topic=API Development source=skill importance=MEDIUM | threshold=5.0 base_credit=1.0

[SIGNAL] name=ownership_ambiguity         layer=disturbance_signal  confidence=0.78 delta=-0.80 turn=5

[EVAL] turn=5 action=PROBE mode=normal quality_avg=2.50 signals=[ownership_ambiguity]

[SAT_CALC] topic=API Development | response_score=2.00 contribution=2.00 signal_penalty=-0.80 final_contribution=1.20
[SAT_CALC] base_credit=1.0 | score: 0.0 → 2.20 (delta=+2.20) | follow_ups: 0 → 1

[SAT_RESULT] 🔄 NOT SATURATED | score=2.2 < threshold=5.0 (44% done) | need 2.8 more | importance=MEDIUM

[SATURATION] turn=5 | topic=API Development | score_2.2_need_2.8 | signals=[ownership_ambiguity]

[DECISION] turn=5 | depth_decay=False weak_exit=False saturated=False action=PROBE
[DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=2.2/5.0 (44%) turn=5

[PROBE] family=ownership rotation_index=0 signals=[ownership_ambiguity] | goal: Ask a concise clarifying question...

[PROBE] Rotation held at index=0 (signal fired) turn=5

[RESULT] turn=5  action=PROBE  quality=2.50/SURFACE  signals=[ownership_ambiguity]
         next=API Development  covered=[Cloud Infrastructure, Team Leadership, Database Design]

[WORKER] ✓ turn=5 action=PROBE quality=2.50 | saturation=2.2/5.0 (44%) importance=MEDIUM | signals=[ownership_ambiguity] | next=API Development
```

---

## TURN 6: Follow-up on Same Topic (Accumulation with Signal)

```
[WORKER] Processing app_id=interview_001 turn=6

[QA] turn=6  Q: Can you walk me through a specific API you actually designed end-to-end?
              A: Sure! We had a user authentication API. I designed the refresh token rotation logic...

[EVAL_PIPELINE] Step2/Topics: uncovered_next=none | discussed_log=3 entries

[QUALITY] turn=6 | clarity=6.5 depth=6.0 specificity=7.0 grounding=6.5 | avg=6.50

[TOPIC_STATE] RESTORED | topic=API Development importance=MEDIUM | saturation_score=2.2/5.0 follow_ups=1 base_credit=1.0
  ↓ (This is ACCUMULATION from turn 5!)

[SIGNAL] name=none

[EVAL] turn=6 action=PROBE mode=normal quality_avg=6.50 signals=none

[SAT_CALC] topic=API Development | response_score=6.20 contribution=6.20 signal_penalty=0.00 final_contribution=6.20
[SAT_CALC] base_credit=1.0 | score: 2.2 → 9.40 (delta=+7.20) | follow_ups: 1 → 2

[SAT_RESULT] ✅ SATURATED | score=9.4 >= threshold=5.0 (188%) | importance=MEDIUM

[SATURATION] turn=6 | topic=API Development | saturated_at_9.4 | signals=none

[DECISION] turn=6 | depth_decay=False weak_exit=False saturated=True action=PROBE
[DECISION] ✅ SATURATED → score=9.4 >= threshold=5.0 → forcing MOVE_ON turn=6

[SATURATION] MOVE_ON reason=saturated(saturated_at_9.4) → next=none (importance=?) turn=6
  ↓ (No more topics, interview ending)

[RESULT] turn=6  action=MOVE_ON  quality=6.50/DEEP  signals=none
         next=none  covered=[Cloud Infrastructure, Team Leadership, Database Design, API Development]

[WORKER] ✓ turn=6 action=MOVE_ON quality=6.50 | saturation=9.4/5.0 (188%) importance=MEDIUM | next=none
```

---

## TURN 7: Wrap-up (No More Topics)

```
[WORKER] Processing app_id=interview_001 turn=7

[QA] turn=7  Q: What's the biggest technical lesson you've learned in your career?
              A: Prioritizing simplicity and clarity over clever solutions...

[EVAL_PIPELINE] Step2/Topics: uncovered_next=none | discussed_log=4 entries

[QUALITY] turn=7 | clarity=7.5 depth=7.0 specificity=7.5 grounding=7.0 | avg=7.25

[TOPIC_STATE] No active_topic (interview wrapping up)

[SIGNAL] name=none

[EVAL] turn=7 action=CLOSING mode=normal quality_avg=7.25 signals=none

[RESULT] turn=7  action=CLOSING  quality=7.25/DEEP  signals=none
         next=none  covered=[Cloud Infrastructure, Team Leadership, Database Design, API Development]

[WORKER] ✓ turn=7 action=CLOSING quality=7.25 | next=none
```

---

## SATURATION ACCUMULATION VISUALIZATION

### Turn 5 (Weak, First Time on Topic)
```
Score: 0.0 → 2.2
        ↓
     1.0 (base_credit) + 1.2 (quality - signal_penalty)
        ↓
   44% of threshold (2.2/5.0)
        ↓
   NOT SATURATED → PROBE on same topic
```

### Turn 6 (Strong, Same Topic)
```
Score: 2.2 → 9.4    ← ACCUMULATION!
        ↓
     1.0 (base_credit) + 6.2 (quality, no penalty)
        ↓
   188% of threshold (9.4/5.0)
        ↓
   ✅ SATURATED → MOVE_ON to next
```

---

## Log Structure Summary

Each eval turn now logs:

**1. Input**
```
[QUALITY] clarity=X depth=X specificity=X grounding=X | avg=X.XX
[TOPIC_STATE] CREATED NEW | topic=X importance=Y | threshold=Z base_credit=A
```

**2. Calculations**
```
[SAT_CALC] response_score=X contribution=Y signal_penalty=Z final_contribution=A
[SAT_CALC] base_credit=B | score: OLD → NEW (delta=+CHANGE) | follow_ups: OLD → NEW
[SAT_RESULT] ✅/🔄 SATURATED/NOT SATURATED | score=X / threshold=Y (PCT%)
```

**3. Signals**
```
[SIGNAL] name=X layer=Y confidence=Z delta=CHANGE turn=T
```

**4. Decision**
```
[DECISION] depth_decay=X weak_exit=Y saturated=Z action=A
[DECISION] ✅/🔄 ACTION → reason turn=T
```

**5. Probe Details (if PROBE)**
```
[PROBE] family=X rotation_index=Y signals=[...] | goal: ...
[PROBE] Rotation advanced/held
```

**6. Result**
```
[RESULT] turn=T action=A quality=X/SIGNAL next=TOPIC covered=[...]
[WORKER] ✓ turn=T action=A quality=X | saturation=SCORE/THRESHOLD (PCT%) | next=TOPIC
```

---

## Key Indicators in Logs

- `[TOPIC_BOOT] ✅` = Bootstrap successful, first topic selected
- `[TOPIC_STATE] RESTORED` = State persisted from previous turn, saturation accumulated
- `[TOPIC_STATE] CREATED NEW` = Fresh topic, score starts at 0
- `[SAT_RESULT] ✅ SATURATED` = Threshold reached, will MOVE_ON
- `[SAT_RESULT] 🔄 NOT SATURATED` = Below threshold, will PROBE
- `[DECISION] ✅ SATURATED` = Moving to next topic
- `[DECISION] 🔄 PROBE NOT SATURATED` = Continuing on same topic
- `[WORKER] ✓` = Worker processed turn successfully

---

## Example: Turn 5-6 Accumulation Details

**Turn 5 (First time on API Development, weak answer):**
```
[SAT_CALC] base_credit=1.0 | score: 0.0 → 2.2 (delta=+2.2)
  • Starting: 0.0
  • Add: 1.0 (base_turn_credit)
  • Add: 1.2 (quality contribution after signal penalty)
  • Total: 2.2

[SAT_RESULT] 🔄 NOT SATURATED | score=2.2 < threshold=5.0 (44% done)
  • Need 2.8 more points to saturate

[PROBE] family=ownership rotation_index=0
  • Will ask follow-up clarifying question
```

**Turn 6 (Second time on API Development, stronger answer):**
```
[TOPIC_STATE] RESTORED | saturation_score=2.2/5.0
  • ✅ Restored from turn 5!

[SAT_CALC] base_credit=1.0 | score: 2.2 → 9.4 (delta=+7.2)
  • Starting: 2.2 (persisted from turn 5!)
  • Add: 1.0 (base_turn_credit)
  • Add: 6.2 (quality contribution, no signal)
  • Total: 9.4 ✅ ACCUMULATED!

[SAT_RESULT] ✅ SATURATED | score=9.4 >= threshold=5.0 (188%)
  • Exceeded threshold!

[DECISION] ✅ SATURATED → MOVE_ON
  • Moving to next topic
```

This shows the **saturation accumulation working correctly**: weak turn (2.2) + stronger follow-up (7.2) = saturated (9.4)
