# Complete End-to-End Example: Prefetch → Final Word

**Scenario:** Mid-level candidate (5 years experience), 20-minute interview
- **Resume:** Project A (anchor), Project B, 2 JD skills
- **Expected:** 8-10 topics covered, medium saturation across projects

---

## PHASE 0: PREFETCH & INITIALIZATION (T = -120s)

### Frontend Requests Session Start
```
POST /api/interview/start
Body: {
  "interview_id": "interview_20250521_alice_123",
  "candidate_name": "Alice Chen",
  "job_title": "Senior Backend Engineer",
  "band": "mid",
  "resume": {
    "projects": ["Real-time Data Pipeline (2021-2023)", "Mobile API (2020-2021)"],
    "work_history": ["SWE at DataCorp (2021-2023)", "SWE at StartupX (2020-2021)"],
    "skills": ["Python", "Go", "Kubernetes", "PostgreSQL", "AWS"]
  },
  "jd_skills": {
    "must_have": ["Python", "Data Processing", "Distributed Systems"],
    "nice_to_have": ["Kubernetes", "AWS", "Go"]
  },
  "resume_brief": "...",
  "time_limit_mins": 20
}
```

### agent_runtime.py: Session Initialization
```python
# [T=-120s] Session starts
app_id = "interview_20250521_alice_123"
session_start_time = time.time()  # Reference point for all timings

logger.info("[SESSION_START] app_id=%s candidate=%s band=%s duration=%d min",
            app_id, "Alice Chen", "mid", 20)

# Initialize session state
_active_topic = None  # Will be set after greeting/warmup
_topic_states: dict[str, dict] = {}  # Empty — will populate on first topic
_covered_topic_keys: set[str] = set()
_discussed_log: list[str] = []
_trust_state = init_trust_state()  # "excellent" baseline
_contradiction_state = init_contradiction_state()
_claim_index: dict[str, list] = {}
warmup_complete = False
turn_count = 0

# Parse resume + context
session_context.resume_brief = {
    "anchor_item": "Real-time Data Pipeline (2021-2023)",
    "anchor_type": "project",
    "projects": ["Real-time Data Pipeline", "Mobile API"],
    "work_history": ["SWE at DataCorp (2021-2023)", "SWE at StartupX"],
    "skills": ["Python", "Go", "Kubernetes", "PostgreSQL", "AWS"],
}

logger.info("[CONTEXT] anchor=%s | projects=%s | skills=%s",
            "Real-time Data Pipeline", ["Real-time Data Pipeline", "Mobile API"],
            ["Python", "Go", "Kubernetes"])

# Pre-build interview directive
interview_directive = build_interview_directive(
    band="mid",
    resume_brief=session_context.resume_brief,
    context_brief="5 years experience, strong backend skills",
    custom_questions=["Tell me about your leadership experience"]
)

logger.info("[INTERVIEW_DIRECTIVE] Built system prompt (%d chars)",
            len(interview_directive))

# Connect Redis eval worker
_eval_redis_client = redis.from_url(REDIS_URL)
logger.info("[REDIS] Connected to eval worker queue")

# TTS warm-up
await warm_up_tts()
logger.info("[TTS] Warmup complete")

logger.info("[READY] Prefetch complete, waiting for participant to join")
```

### Logs So Far
```
[SESSION_START] app_id=interview_20250521_alice_123 candidate=Alice Chen band=mid duration=20 min
[CONTEXT] anchor=Real-time Data Pipeline (2021-2023) | projects=2 | skills=5
[INTERVIEW_DIRECTIVE] Built system prompt (2847 chars)
[REDIS] Connected to eval worker queue
[TTS] Warmup complete
[READY] Prefetch complete, waiting for participant to join
```

---

## PHASE 1: PARTICIPANT JOINS & GREETING (T = 0s)

### Frontend: Participant Joins LiveKit Room
```
[Frontend] Participant alice_participant_123 joined room
[Frontend] → Trigger interview_started event
```

### agent_runtime.py: Greeting Phase
```python
# [T=0s] Participant joined
logger.info("[PARTICIPANT_JOIN] participant_id=%s | interview starts now", 
            "alice_participant_123")

# Build greeting
greeting_text = build_greeting_text(
    candidate_name="Alice Chen",
    ai_name="Ishita",
    job_title="Senior Backend Engineer"
)
# → "Hi Alice Chen, really glad we could connect today. I'm Ishita, and I've been 
#    looking forward to our conversation about the Senior Backend Engineer role. 
#    How are you doing? Hope the day's been good to you."

logger.info("[GREETING] Speaking greeting (~5 sec)")

# Agent speaks greeting via TTS (Cartesia)
await session.say(greeting_text, voice_id=DEFAULT_VOICE_ID)  # ~5 seconds

# Set timer for warmup responses
WARMUP_FIXED_SECONDS = 120  # 2-minute warmup window
warmup_start_time = time.time()

logger.info("[WARMUP_START] Window = 120 seconds | waiting for candidate response...")
```

### Background: Greeting Audio
```
[Cartesia TTS] Processing: "Hi Alice Chen, really glad we could connect today..."
[Cartesia TTS] Generated audio: ~7 sec
[LiveKit] Streaming audio to candidate through speaker
[Candidate Hears] Greeting (~5-7 seconds)
```

### Logs So Far
```
[PARTICIPANT_JOIN] participant_id=alice_participant_123 | interview starts now
[GREETING] Speaking greeting (~5 sec)
[WARMUP_START] Window = 120 seconds | waiting for candidate response...
```

---

## PHASE 2: WARMUP (T = 5-60s)

### Candidate Responds: "Hi Ishita, I'm doing great! Thanks for taking the time."

### agent_runtime.py: Warmup Response
```python
# [T=10s] Candidate response received
_answer_received_at = time.time()
candidate_warmup_response = "Hi Ishita, I'm doing great! Thanks for taking the time."
turn_count += 1  # Turn 1 (warmup)

logger.info("[CANDIDATE] Turn %d (warmup) | '%s' (%d words)",
            turn_count, candidate_warmup_response[:50], 
            len(candidate_warmup_response.split()))

append_transcript_line("Candidate", candidate_warmup_response)

# Warmup response: short, polite → no follow-up needed
word_count = len(candidate_warmup_response.split())  # 12 words

if word_count < 8:
    logger.debug("[WARMUP] Too short, treating as echo")
else:
    logger.info("[WARMUP] Substantive response (%d words) → warmup_complete=True",
                word_count)
    warmup_complete = True

# Agent response (per interview_phases.py warmup directive)
# "Thanks! Really happy to hear it. Let's dive in."
warmup_reply = "Thanks! Really happy to hear it. Let's dive in."

logger.info("[WARMUP_REPLY] Speaking brief response (~3 sec)")
await session.say(warmup_reply, voice_id=DEFAULT_VOICE_ID)

logger.info("[INTERVIEW_START] Moving to main interview phase | warmup_complete=True")
```

### Logs So Far
```
[CANDIDATE] Turn 1 (warmup) | 'Hi Ishita, I'm doing great! Thanks for taking the time.' (12 words)
[WARMUP] Substantive response (12 words) → warmup_complete=True
[WARMUP_REPLY] Speaking brief response (~3 sec)
[INTERVIEW_START] Moving to main interview phase | warmup_complete=True
```

---

## PHASE 3: MAIN INTERVIEW - TURN 1 (T = 60s)

### Remaining Time: 19 min

### Agent Questions (Opening on Anchor)
```python
# [T=60s] Main interview starts
turn_count += 1  # Turn 2 (first real question)
_question_asked_at = time.time()

opening_question = (
    "Let's start with your anchor project: the Real-time Data Pipeline. "
    "Tell me what you personally built and owned on that project."
)

logger.info("[QUESTION] Turn %d (anchor) | '%s'",
            turn_count, opening_question[:80])

append_transcript_line("Interviewer", opening_question)

await session.say(opening_question, voice_id=DEFAULT_VOICE_ID)  # ~8 sec
```

### Candidate Responds
```python
# [T=75s] Candidate response
_answer_received_at = time.time()
turn_count += 1  # Turn 3 (answer to Q1)

candidate_answer_1 = (
    "So the Real-time Data Pipeline was one of my main projects at DataCorp. "
    "I owned the design and implementation of the streaming processor that handled "
    "real-time data ingestion from Kafka. We were processing about 100k events per second. "
    "I used Go for performance, built on top of Kubernetes for scaling. "
    "The project shipped and is still running in production with 99.9% uptime."
)

logger.info("[CANDIDATE] Turn %d | answer_len=%d words | latency=%.1f sec",
            turn_count, len(candidate_answer_1.split()),
            _answer_received_at - _question_asked_at)

append_transcript_line("Candidate", candidate_answer_1)

# [ASYNC: Push to Redis for eval]
_active_topic = "Real-time Data Pipeline"

# Initialize TopicState for anchor project
# Importance: CRITICAL (it's the anchor)
_topic_states["Real-time Data Pipeline"] = {
    "topic_name": "Real-time Data Pipeline",
    "importance": "CRITICAL",
    "saturation_threshold": 8.0,
    "saturation_score": 0.0,
    "follow_up_turns": 0,
    "probe_rotation_index": 0,
    "signals_fired": [],
    "is_saturated": False,
}

logger.info("[TOPIC_INIT] topic=%s | importance=CRITICAL | threshold=8.0 | rotation_index=0",
            _active_topic)

# Build eval payload
eval_payload = {
    "app_id": app_id,
    "turn": turn_count,
    "answer": candidate_answer_1,
    "question": opening_question,
    "transcript_lines": transcript_lines[-12:],  # Last 12 lines
    "score_history": _trust_state.get("score_history", []),
    "turns_since_decay": 999,
    "response_latency_sec": 2.1,  # How long they took to answer
    "signal_toggles": evaluation_signal_toggles,
    "org_id": org_id,
    "llm_model": "gpt-4o-mini",
    "active_topic": "Real-time Data Pipeline",
    "active_topic_state": _topic_states["Real-time Data Pipeline"],  # ← TopicState!
    "covered_topic_keys": [],
    "discussed_log": [],
    "resume_topics": ["Real-time Data Pipeline", "Mobile API"],
    "skill_topics": ["Python", "Go", "Kubernetes", "PostgreSQL", "AWS"],
    "job_title": "Senior Backend Engineer",
    "remaining_seconds": 19*60 - 15,  # ~1125 seconds left
    "claim_index": {},
    "contradiction_state": dict(_contradiction_state),
    "trust_state": dict(_trust_state),
    "current_interview_mode": "normal",
    "no_new_question_cutoff_seconds": 45,
    "candidate_name": "Alice Chen",
    "band": "mid",
    "anchor_full": "Real-time Data Pipeline (2021-2023)",
    "projects_full": ["Real-time Data Pipeline (2021-2023)", "Mobile API (2020-2021)"],
    "work_history_full": ["SWE at DataCorp (2021-2023)", "SWE at StartupX (2020-2021)"],
    "time_limit_mins": 20,
}

logger.info("[REDIS_PUSH] Pushing turn %d to eval queue | payload_size=%d bytes",
            turn_count, len(json.dumps(eval_payload)))

# [ASYNC] Push to Redis without blocking
await _eval_redis_client.lpush("interview:eval_queue", json.dumps(eval_payload).encode())

logger.info("[ASYNC] Pushed to Redis, continuing interview...")
```

### Logs So Far
```
[QUESTION] Turn 2 (anchor) | 'Let's start with your anchor project...'
[CANDIDATE] Turn 3 | answer_len=87 words | latency=2.1 sec
[TOPIC_INIT] topic=Real-time Data Pipeline | importance=CRITICAL | threshold=8.0 | rotation_index=0
[REDIS_PUSH] Pushing turn 3 to eval queue | payload_size=4231 bytes
[ASYNC] Pushed to Redis, continuing interview...
```

---

## PARALLEL: REDIS EVAL WORKER (Runs in Background)

### eval_worker.py Processes Payload
```python
# [T=78s, in background process]
# BLPOP blocks waiting for next item on queue

logger.info("[WORKER] Processing turn 3 from eval_queue")

payload = json.loads(payload_bytes)

logger.info("[WORKER] Deserializing payload turn=%d topic=%s",
            payload.get("turn"), payload.get("active_topic"))

# Deserialize TopicState from payload
topic_state_dict = payload.get("active_topic_state")
if topic_state_dict:
    topic_state = TopicState(
        topic_state_dict["topic_name"],
        topic_state_dict["importance"]
    )
    topic_state.saturation_score = topic_state_dict.get("saturation_score", 0.0)
    topic_state.probe_rotation_index = topic_state_dict.get("probe_rotation_index", 0)
    logger.info("[WORKER] Restored TopicState | importance=%s | threshold=%.1f",
                topic_state.importance, topic_state.saturation_threshold)
else:
    topic_state = None

# Call turn_evaluator (now simplified)
logger.info("[WORKER] Calling run_turn_evaluation...")

td, directive = await run_turn_evaluation(
    candidate_answer=payload["answer"],
    last_question=payload["question"],
    transcript_lines=payload["transcript_lines"],
    contradiction_detected=False,
    client=openai_client,
    org_id=payload["org_id"],
    llm_model=payload["llm_model"],
    score_answer_quality_fn=score_answer_quality,
    evaluate_answer_and_decide_fn=evaluate_answer_and_decide,
    signal_toggles=payload["signal_toggles"],
    uncovered_topics=[],
    session_score_history=payload["score_history"],
    turns_since_last_decay=payload["turns_since_decay"],
    response_latency_sec=payload["response_latency_sec"],
)

logger.info("[WORKER] Eval complete | action=%s | quality=%.2f",
            td["decision"]["action"],
            td["quality"]["clarity"]/4)
```

### LLM Quality Scoring (in parallel)
```python
# Run concurrently with LLM decision
quality_scores = await score_answer_quality(
    candidate_answer=candidate_answer_1,
    last_question=opening_question,
    transcript_lines=transcript_lines,
    client=openai_client,
    org_id=org_id,
    llm_model="gpt-4o-mini",
)

# Alice's answer to anchor project question:
# - Clarity: 8 (very clear, specific terminology)
# - Depth: 8 (owned design + implementation, explained architecture)
# - Specificity: 8 (Kafka, Go, Kubernetes, 100k events/sec, 99.9% uptime)
# - Grounding: 9 (metrics, production status, specific tech stack)

logger.info("[QUALITY] clarity=8 depth=8 specificity=8 grounding=9 | avg=8.25")
```

### Saturation Evaluation
```python
# [T=82s, in worker]
logger.info("[SATURATION] Evaluating topic saturation...")

# Response score calculation
response_score = (8 × 0.20) + (8 × 0.35) + (8 × 0.30) + (9 × 0.15)
               = 1.6 + 2.8 + 2.4 + 1.35
               = 8.15

logger.info("[RESPONSE_SCORE] %.2f (clarity=8, depth=8, specificity=8, grounding=9)",
            8.15)

# Contribution band
contribution = 3.5  # 8.15 is in [8.5-10] → 3.5 points

logger.info("[CONTRIBUTION] 8.15 → band [8.5-10] → +3.5 points")

# Signal check (no signals fired on strong answer)
signal_penalty = 0.0
final_contribution = max(0.0, 3.5 + 0.0) = 3.5

logger.info("[SIGNALS] None detected | penalty=0.0 | final_contribution=3.5")

# Update topic state
topic_state.saturation_score = 0.0 + 3.5 = 3.5
topic_state.follow_up_turns = 1

# Check: Is 3.5 >= 8.0? NO
# But response_score (8.15) itself is STAR-complete
# Special case: if response_score >= threshold, instant saturation

is_saturated = (8.15 >= 8.0) = True  # ← INSTANT SATURATION

logger.info("[SATURATION] score=3.5/8.0 BUT response_score=8.15 >= threshold → INSTANT_SATURATED")

# Decision
action = "MOVE_ON"  # Because saturated

logger.info("[DECISION] is_saturated=True → action=MOVE_ON")

# Next topic from tracker
next_topic = "Mobile API (2020-2021)"  # From resume_topics, not yet covered

next_goal = (
    "This topic is well-covered. Acknowledge briefly and move to: Mobile API. "
    "Ask one focused question about what they personally built or owned there."
)

directive = DirectiveCompiler.move_on(next_goal)
# → "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
#    DECISION: MOVE_ON
#    NEXT MOVE: This topic is well-covered. Acknowledge briefly and move to: 
#    Mobile API (2020-2021). Ask one focused question about what they personally 
#    built or owned there. Do NOT ask a follow-up on the previous topic."

logger.info("[DIRECTIVE] MOVE_ON to next topic | length=%d chars", len(directive))
```

### Store Result in Redis
```python
# [T=83s, worker]
result = {
    "app_id": "interview_20250521_alice_123",
    "turn": 3,
    "directive": directive,
    "action": "MOVE_ON",
    "td": {
        "decision": {"action": "MOVE_ON", "mode": "normal", "next_goal": next_goal},
        "quality": {"clarity": 8, "depth": 8, "specificity": 8, "grounding": 9},
        "signals": {},
        "signal_events": [],
    },
    "quality_record": {
        "question": opening_question,
        "answer": candidate_answer_1[:200],
        "clarity": 8,
        "depth": 8,
        "specificity": 8,
        "grounding": 9,
        "overall": 8.25,
        "signals": [],
        "concerns": [],
    },
    "signal_events": [],
    "contradiction_state_event": None,
    "depth_signal": "DEEP",
    "freeze_followup_increment": False,
    "new_active_topic": "Mobile API (2020-2021)",
    "new_covered_topic_keys": ["real-time data pipeline"],
    "new_active_topic_state": {  # ← Updated TopicState
        "topic_name": "Real-time Data Pipeline",
        "importance": "CRITICAL",
        "saturation_threshold": 8.0,
        "saturation_score": 3.5,
        "follow_up_turns": 1,
        "probe_rotation_index": 0,
        "is_saturated": True,  # ← Saturated after 1 answer!
    },
    "new_trust_state": dict(_trust_state),
    "new_contradiction_state": dict(_contradiction_state),
    "new_claim_index": {},
    "new_current_interview_mode": "deep",  # quality >= 7.0
    "risk_integrity_delta": 0,
    "risk_depth_delta": 0,
    "discussed_log_entry": "- Real-time Data Pipeline: I owned the design and implementation...",
}

# Store in Redis with 5-minute TTL
redis_key = f"interview:interview_20250521_alice_123:eval_result"
await redis_client.setex(redis_key, 300, json.dumps(result).encode())

logger.info("[WORKER] ✓ Result stored in Redis key=%s | ttl=300s", redis_key)
logger.info("[WORKER] turn=%d action=%s quality=8.25 topic='%s' saturated=True",
            3, "MOVE_ON", "Real-time Data Pipeline")
```

### Worker Logs Summary
```
[WORKER] Processing turn 3 from eval_queue
[WORKER] Restored TopicState | importance=CRITICAL | threshold=8.0
[WORKER] Calling run_turn_evaluation...
[QUALITY] clarity=8 depth=8 specificity=8 grounding=9 | avg=8.25
[RESPONSE_SCORE] 8.15 (clarity=8, depth=8, specificity=8, grounding=9)
[CONTRIBUTION] 8.15 → band [8.5-10] → +3.5 points
[SIGNALS] None detected | penalty=0.0 | final_contribution=3.5
[SATURATION] score=3.5/8.0 BUT response_score=8.15 >= threshold → INSTANT_SATURATED
[DECISION] is_saturated=True → action=MOVE_ON
[DIRECTIVE] MOVE_ON to next topic | length=312 chars
[WORKER] ✓ Result stored in Redis key=interview:interview_20250521_alice_123:eval_result | ttl=300s
[WORKER] turn=3 action=MOVE_ON quality=8.25 topic='Real-time Data Pipeline' saturated=True
```

---

## PHASE 3b: Agent Reads Result & Injects Directive

### agent_runtime.py: Reading Redis Result
```python
# [T=85s] Back in agent_runtime, during next turn processing

# Check if eval result is available
result_key = f"interview:interview_20250521_alice_123:eval_result"

try:
    raw = await asyncio.wait_for(
        _eval_redis_client.getdel(result_key),
        timeout=0.5
    )
except asyncio.TimeoutError:
    logger.warning("[REDIS_EVAL] getdel timed out for turn=3 — using inline eval")
    raw = None

if raw:
    result = json.loads(raw)
    logger.info("[REDIS_EVAL] ✓ Pre-computed result found for turn=%d | action=%s",
                result.get("turn"), result.get("action"))
    
    # Apply all mutations atomically
    async with _session_state_lock:
        _active_topic = result.get("new_active_topic")  # → "Mobile API (2020-2021)"
        _covered_topic_keys = set(result.get("new_covered_topic_keys") or [])
        
        # PART 3: Update TopicState
        new_topic_state = result.get("new_active_topic_state")
        if new_topic_state and "Real-time Data Pipeline" in _topic_states:
            _topic_states["Real-time Data Pipeline"] = new_topic_state
            logger.info("[SATURATION] Updated TopicState for 'Real-time Data Pipeline' | score=%.1f/%.1f | saturated=%s",
                        new_topic_state.get("saturation_score", 0),
                        new_topic_state.get("saturation_threshold", 0),
                        new_topic_state.get("is_saturated", False))
        
        _trust_state = result.get("new_trust_state") or _trust_state
        _contradiction_state = result.get("new_contradiction_state") or _contradiction_state
        current_interview_mode = result.get("new_current_interview_mode", current_interview_mode)
        
        # Update quality record
        quality_record = result.get("quality_record")
        if quality_record:
            answer_scores.append(quality_record)
            logger.info("[QUALITY_LOG] turn=3 | clarity=%.0f depth=%.0f overall=%.2f | signals=%s",
                        quality_record.get("clarity", 0),
                        quality_record.get("depth", 0),
                        quality_record.get("overall", 0),
                        quality_record.get("signals", []))
    
    # Inject directive
    directive = result.get("directive", "")
    
    logger.info("[DIRECTIVE_INJECT] Removing old directives, injecting new one")
    remove_system_messages(chat_ctx, "[NEXT_TURN_DIRECTIVE")
    remove_system_messages(chat_ctx, "[RECENT_CONTEXT")
    
    chat_ctx.add_message(role="system", content=directive)
    
    logger.info("[DIRECTIVE] → %s", directive[:300].replace("\n", " | "))
    logger.info("[ACTION] → action=%s | mode=%s | next_topic=%s",
                "MOVE_ON",
                "normal",
                _active_topic)
```

### Logs So Far
```
[REDIS_EVAL] ✓ Pre-computed result found for turn=3 | action=MOVE_ON
[SATURATION] Updated TopicState for 'Real-time Data Pipeline' | score=3.5/8.0 | saturated=True
[QUALITY_LOG] turn=3 | clarity=8 depth=8 overall=8.25 | signals=[]
[DIRECTIVE_INJECT] Removing old directives, injecting new one
[DIRECTIVE] → [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] DECISION: MOVE_ON...
[ACTION] → action=MOVE_ON | mode=normal | next_topic=Mobile API (2020-2021)
```

---

## PHASE 4: TURN 2 - MOVE TO SECOND PROJECT (T = 90s)

### Remaining Time: 18m 30s

### Agent Speaks Next Question
```python
# [T=90s] Agent generates next response

# LLM sees directive injected: "MOVE_ON to Mobile API"
# LLM generates:

next_question = (
    "Great work on that data pipeline. Let me pivot to your other major project: "
    "the Mobile API from 2020. What did you personally build on that project?"
)

logger.info("[QUESTION] Turn %d (Topic 2) | Moving from anchor to 2nd project",
            turn_count + 1)

append_transcript_line("Interviewer", next_question)

await session.say(next_question, voice_id=DEFAULT_VOICE_ID)  # ~7 sec
```

### Candidate Responds
```python
# [T=105s] Candidate response (after 15 sec of thinking/speaking)

candidate_answer_2 = (
    "The Mobile API project was interesting. So this was at StartupX in 2020, "
    "and I was part of a team of 4 engineers working on the backend API. "
    "I worked on the authentication module and some of the user endpoints. "
    "We used Node.js and Express, MongoDB for storage. It was a decent project "
    "but honestly we were pretty rushed on timelines so some of the code quality "
    "wasn't what I would have wanted."
)

turn_count += 1  # Turn 4

logger.info("[CANDIDATE] Turn %d | answer_len=%d words | latency=%.1f sec | tone=hesitant",
            turn_count, len(candidate_answer_2.split()),
            _answer_received_at - _question_asked_at)

append_transcript_line("Candidate", candidate_answer_2)

# Quality scores from LLM:
# - Clarity: 6 (somewhat clear but uses "we" language)
# - Depth: 4 (doesn't explain specifics, mentions team rushing)
# - Specificity: 3 (no metrics, no detail on auth module)
# - Grounding: 4 (vague about what was built)
# Average: 4.25 (weak answer)

# Signals detected:
# - ownership_ambiguity: Uses "we" extensively, can't articulate personal contribution

logger.info("[SIGNALS_DETECTED] ownership_ambiguity (high confidence)")

# Push to Redis again (for new project)
_active_topic = "Mobile API"

# Initialize TopicState for new topic
_topic_states["Mobile API"] = {
    "topic_name": "Mobile API",
    "importance": "HIGH",  # Not anchor, but resume project
    "saturation_threshold": 6.5,
    "saturation_score": 0.0,
    "follow_up_turns": 0,
    "probe_rotation_index": 0,  # Reset to 0 for new topic!
    "signals_fired": [],
    "is_saturated": False,
}

logger.info("[TOPIC_SWITCH] New topic=Mobile API | importance=HIGH | threshold=6.5 | rotation_index=0 (reset)",
            _active_topic)

eval_payload = {
    # ... updated with new topic ...
    "active_topic": "Mobile API",
    "active_topic_state": _topic_states["Mobile API"],
    "covered_topic_keys": ["real-time data pipeline"],
    "remaining_seconds": 18*60 + 30,
}

logger.info("[REDIS_PUSH] Pushing turn %d for new topic=Mobile API", turn_count)

await _eval_redis_client.lpush("interview:eval_queue", json.dumps(eval_payload).encode())
```

### Worker Processes Turn 4
```python
# [T=108s, in background worker]

# Saturation calculation
response_score = (6 × 0.20) + (4 × 0.35) + (3 × 0.30) + (4 × 0.15)
               = 1.2 + 1.4 + 0.9 + 0.6
               = 4.1

contribution = 0.5  # 4.1 is in [4.0-5.4] → 0.5 points

# Signal penalty for ownership_ambiguity
signal_penalty = -1.5

final_contribution = max(0.0, 0.5 + (-1.5)) = 0.0

logger.info("[SATURATION] score=4.1 → band [4.0-5.4] → +0.5 | signals=[ownership_ambiguity] penalty=-1.5 | final=0.0")

# Update topic state
topic_state.saturation_score = 0.0 + 0.0 = 0.0

# Check: 0.0 >= 6.5? NO
is_saturated = False

# Decision: PROBE (not saturated, continue on this topic)
action = "PROBE"

# Which probe? Check rotation_index
# probe_rotation_index = 0 → "ownership"

logger.info("[PROBE_ROTATION] index=0 → family=ownership | signal_override=ownership_ambiguity (use ownership probe)")

# build_directive selects ownership probe family
next_goal = (
    "Ownership ambiguity detected. Ask what THEY personally owned, not the team. "
    "Push from team-language into individual responsibility."
)

logger.info("[DECISION] is_saturated=False action=PROBE | next_probe=ownership")
```

### Logs So Far
```
[CANDIDATE] Turn 4 | answer_len=78 words | latency=15.1 sec | tone=hesitant
[SIGNALS_DETECTED] ownership_ambiguity (high confidence)
[TOPIC_SWITCH] New topic=Mobile API | importance=HIGH | threshold=6.5 | rotation_index=0 (reset)
[REDIS_PUSH] Pushing turn 4 for new topic=Mobile API
[SATURATION] score=4.1 → band [4.0-5.4] → +0.5 | signals=[ownership_ambiguity] penalty=-1.5 | final=0.0
[PROBE_ROTATION] index=0 → family=ownership | signal_override=ownership_ambiguity (use ownership probe)
[DECISION] is_saturated=False action=PROBE | next_probe=ownership
```

---

## CONTINUED TURNS (Summary Table)

| Turn | Time | Topic | Question | Answer Quality | Signals | Action | Saturation |
|------|------|-------|----------|----------------|---------|--------|-----------|
| 5 | 120s | Mobile API | Ownership probe: "What did YOU specifically own?" | 5.2/10 | None | PROBE | 1.5/6.5 |
| 6 | 150s | Mobile API | Outcome probe: "Did it ship? What was impact?" | 4.8/10 | example_evasion | PROBE | 1.5/6.5 |
| 7 | 180s | Mobile API | Tradeoff probe: "Why that tech stack?" | 6.5/10 | None | MOVE_ON | 7.0/6.5 ✓ |
| 8 | 210s | Python Skill | "Let's talk about Python. Tell me a project..." | 7.1/10 | None | MOVE_ON | 6.5/6.5 ✓ |
| 9 | 240s | Situational | "Tell me about a time you dealt with conflict..." | 6.8/10 | None | MOVE_ON | 5.5/5.0 ✓ |
| 10 | 270s | Go Skill | "You mentioned Go in your first project. How deep?" | 7.9/10 | None | MOVE_ON | 8.0/6.5 ✓ |
| 11 | 300s | Behavioral | "Custom Q: Tell me about your leadership..." | 7.2/10 | None | MOVE_ON | 7.0/5.0 ✓ |
| 12 | 1070s | (Final 45s) | N/A | N/A | N/A | **WRAP_UP** | **INTERVIEW END** |

---

## FINAL PHASE: WRAP-UP & COMPLETION (T = 1070s)

### Remaining: 45 seconds

### agent_runtime.py: Final Window Detection
```python
# [T=1070s] Only 45 seconds left

remaining_seconds = 1200 - 1070  # Actually 130s, but let's say 45s trigger

if remaining_seconds < FINAL_WINDOW_SECONDS:  # 45
    logger.info("[FINAL_WINDOW] Remaining=%.0fs < threshold=%.0fs → forcing graceful wrap-up",
                remaining_seconds, FINAL_WINDOW_SECONDS)
    
    # Worker will set action=MOVE_ON with special wrap-up message
```

### Worker Final Turn
```python
# [T=1072s, worker processing final turn]

if remaining_seconds < 45:
    action = "MOVE_ON"
    td["decision"]["next_goal"] = (
        "Wrap-up phase: You have 45 seconds left. Briefly thank the candidate for their time, "
        "acknowledge a highlight from the interview, and let them know next steps. "
        "End gracefully: 'That's all the time we have today. Thanks so much for the conversation!'"
    )
    
    logger.info("[FINAL_WINDOW] Forcing MOVE_ON for wrap-up | remaining=%.0fs", remaining_seconds)
```

### Agent Final Message
```python
# [T=1075s] Agent speaks final message

final_message = (
    "That's all the time we have today. Thanks so much for the conversation, Alice! "
    "I was really impressed by your work on the data pipeline and how you've grown "
    "across your projects. We'll be reviewing everything and will be in touch with next steps "
    "within the next few days. Have a great rest of your day!"
)

logger.info("[FINAL_MESSAGE] Speaking wrap-up (~15 sec)")

await session.say(final_message, voice_id=DEFAULT_VOICE_ID)

logger.info("[INTERVIEW_END] Disconnecting from LiveKit session")

# [LAST WORD] ~1090s - Final audio completes
```

---

## FINAL LOGS: Interview Summary

```
═══════════════════════════════════════════════════════════════════
                    INTERVIEW COMPLETE
═══════════════════════════════════════════════════════════════════

[INTERVIEW_END] app_id=interview_20250521_alice_123 | duration=1090s (18.2 min)
[TOPICS_COVERED] 6 topics: Real-time Data Pipeline, Mobile API, Python, Go, Situational, Leadership
[TOPICS_SATURATED] 5/6 saturated (83%)

[SATURATION_SUMMARY]
  Topic                    Importance  Score/Threshold  Probes  Status
  ─────────────────────────────────────────────────────────────────
  Real-time Data Pipeline  CRITICAL    3.5/8.0 ✓        1       SATURATED (instant)
  Mobile API               HIGH        7.0/6.5 ✓        3       SATURATED (after 3 probes)
  Python Skill             HIGH        6.5/6.5 ✓        1       SATURATED
  Go Skill                 HIGH        8.0/6.5 ✓        1       SATURATED
  Situational Question     MEDIUM      5.5/5.0 ✓        1       SATURATED
  Leadership (Custom Q)    MEDIUM      7.0/5.0 ✓        1       SATURATED

[SIGNAL_SUMMARY]
  ownership_ambiguity: 1 occurrence (Turn 4, Mobile API)
  example_evasion: 1 occurrence (Turn 6, Mobile API)
  contradiction: 0
  follow_up_collapse: 0
  latency_mismatch: 0
  depth_decay: 0

[QUALITY_METRICS]
  Average Clarity:    7.1
  Average Depth:      6.8
  Average Specificity: 6.5
  Average Grounding:  6.9
  Overall Average:    6.8/10 (GOOD)

[RISK_ASSESSMENT]
  Integrity Risk:  15 (low)
  Depth Risk:      12 (low)
  Composite Risk:  14/100 (low)
  Interview Mode:  deep (triggered after Turn 3)

[EFFICIENCY]
  Turns Completed:    12
  Average Turn Time:  91 seconds
  Strong Answers:     8/12 (67%)
  Weak Answers:       2/12 (17%)
  Uncertain:          2/12 (17%)

[RECRUITED]
  Candidate: Alice Chen
  Role: Senior Backend Engineer
  Decision: STRONG_HIRE ✓ (saturated 5/6 topics, consistent quality, exposed growth areas)
  Confidence: 85%

[SYSTEM_PERFORMANCE]
  Eval Latency (avg): 18ms (pre-computed from Redis)
  LLM Calls:  12 (quality scoring + routing)
  Signal Detections: 2/12 turns (17%, within normal range)
  Topics/Min: 6.5 (strong coverage)
  
═══════════════════════════════════════════════════════════════════
```

---

## KEY INSIGHTS FROM THIS EXAMPLE

### ✅ What Worked Well
1. **Anchor project**: INSTANT saturation after 1 strong answer (8.15/10)
2. **Weak second project**: System detected ownership_ambiguity, probed 3 times to gather signal
3. **Skills probing**: Single strong answers on Python & Go → instant saturation
4. **Time management**: 6 topics covered in 18 minutes (efficient)
5. **Final window**: System wrapped gracefully at 45-second mark

### 🔍 Signals Exposed
1. **Turn 4**: Ownership ambiguity (uses "we", can't articulate personal contribution)
2. **Turn 6**: Example evasion (couldn't explain specific auth implementation)
- System exposed weakness without being harsh — just kept probing until pattern clear

### 📊 Saturation in Action
- **Real-time Data Pipeline**: Saturated INSTANTLY (response_score 8.15 >= threshold 8.0)
- **Mobile API**: Needed 3 probes before reaching saturation (weakness detected)
- **Skills**: Single answers enough (context-dependent saturation)

### 🎯 Efficiency Gains
- **Before (fixed 2 follow-ups)**: Would have spent 3-4 min on each topic → only 5-6 topics covered
- **After (saturation)**: Strong answers moved on immediately, weak ones exposed → 6 topics + signal clarity

This is **high-bandwidth interviewing in action**.
