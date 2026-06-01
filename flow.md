---

### SESSION START (happens once before any candidate joins)

`Resume + JD fetched from DB
  ↓
Band detected: fresher / mid / experienced / senior
  ↓
_active_topic set to anchor (short title only):
  "Multi Channel Lead Qualification System"

_resume_topics_pool built (FULL strings, deduplicated):
  [
    "Multi Channel Lead Qualification System - Created automated lead capture across
     Instagram, Facebook, website, and email; built logic to qualify leads and trigger
     booking reminders for hot prospects; unified all inbound sources into a single
     workflow. [Instagram, Facebook, website]",

    "Sensex Analysis Project - Built a system to collect, clean, and analyze Sensex
     market data using Python and DuckDB; processed and stored data efficiently and
     visualized insights using Power BI; provided actionable insights for
     decision-making and market understanding. [Python, DuckDB, Power BI]",

    "Campaign Metrics and Slack Reporting System",
    "Personal Brand & Marketing Automation Strategist",
    "Python Developer"
  ]

_skill_topics_pool built (short names only):
  ["python", "ai", "datascience", "powerbi", "n8n", "zapier"]

_covered_topic_keys = {}     ← nothing covered yet
_topic_states = {}           ← no saturation state yet
_discussed_log = []          ← nothing discussed yet
_directive_ready = SET       ← LLM can fire freely until first interview turn`

---

### TURNS 1–2: GREETING + WARMUP

`Turn 1: Ishita greets Vamsi
  → LLM fires immediately (no eval gate, directive_ready is SET)
  → chat_ctx has [WARMUP PHASE] directive
  → Ishita says: "Hi Vamsi... How are you doing?"

Turn 1: Vamsi replies: "Yeah. It's good. How about you?"
  → llm_node checks chat_ctx: no [NEXT_TURN_DIRECTIVE] → fires immediately
  → LLM sees [WARMUP PHASE] → gives warmup response
  → Ishita says: "Nice, same here — it's been one of those days. Ready when you are."

Turn 2: Vamsi says: "Yeah. Yeah."
  → [WARMUP COMPLETE] — chat_ctx updated with PHASE_STATUS: INTERVIEW
  → llm_node: no [NEXT_TURN_DIRECTIVE] in chat_ctx → fires immediately
  → LLM reads interview directive with opening angle (randomly picked):
      "Ask what problem they were trying to solve with Multi Channel Lead
       Qualification System and what made that problem worth solving."
  → Ishita asks: "Let's talk about the Multi Channel Lead Qualification System.
                  What problem were you trying to solve with it?"

  → [PHASE_STATUS] opening question sealed
  → _directive_ready.CLEARED ← Turn 3 guard — LLM must now wait for eval
  → _first_interview_question_asked = True
  → _last_question_topic = "Multi Channel Lead Qualification System" (short title)
  → _last_interviewer_question = "Let's talk about... What problem..."`

---

### TURN 3: FIRST EVAL TURN

`Vamsi says: "So we built this system to capture leads from Instagram and Facebook..."

[llm_node fires simultaneously]
  → chat_ctx has [NEXT_TURN_DIRECTIVE]? NO (not yet)
  → Wait — [INTERVIEW IN PROGRESS]? YES (from PHASE_STATUS)
  → Actually: check is "[NEXT_TURN_DIRECTIVE" in chat_ctx → NO
  → _is_interview_turn = False... wait

Actually the gate check is:
  _is_interview_turn = "[NEXT_TURN_DIRECTIVE" in _ctx_sys_content
  → After the opening question: [PHASE_STATUS] INTERVIEW IN PROGRESS is there
    but NO [NEXT_TURN_DIRECTIVE] yet
  → _is_interview_turn = False → LLM would fire early!

  WRONG. Let's re-check. The pre-clear at line 1867 already set directive_ready=CLEARED.
  So llm_node: _is_interview_turn=False → no clear → await wait() → already CLEARED
  → LLM blocks correctly ✅

[STT consolidates Vamsi's answer]
  → Transcript logged
  → [EVAL_GATE] turn=3 → PASS

[INLINE EVAL STARTS]
  → payload built:
      active_topic: "Multi Channel Lead Qualification System"  ← short title (for eval)
      active_topic_state: None (first time)
      answer: "So we built this system to capture leads from Instagram and Facebook..."
      question: "What problem were you trying to solve with it?"
      resume_topics: [full strings list]
      skill_topics: [python, ai, ...]

[EVAL runs: GPT-4.1-mini scores the answer]
  clarity=5, depth=3, specificity=4, grounding=5, overall=4.15
  signals=[ownership_ambiguity]  ← "we built" detected
  saturation: 0.0 → 1.0 / 4.0  (base_credit=1.0, quality contribution=0)
  action=PROBE, probe_family=ownership

[AGENT reads eval result]
  → _topic_states["Multi Channel Lead Qualification System"] = {score:1.0, turns:1, ...}
  → quality_record saved to answer_scores (background task → DB)
  → trust_state updated

[AGENT DECISION: PROBE]
  → probe_family=ownership
  → probe_goal (randomly picked from 3 variants):
      "Surface the real personal role — what they decided, not what the team did.
       → If 'we' language: ask what the split of work looked like and which part was theirs"
  → _directive built:
      [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
      DECISION: PROBE (OWNERSHIP)
      BAND: FRESHER
      ANGLE: Surface the real personal role — what they decided...
      HOW TO ASK: Never ask a generic 'what did you do'...
      LAST QUESTION YOU ASKED: "What problem were you trying to solve?"
      CANDIDATE SAID: "So we built this system to capture leads from Instagram..."
      DO NOT ask the same question again.

  → directive injected into chat_ctx
  → _directive_ready.SET ← LLM gate opens

[LLM fires]
  → reads [NEXT_TURN_DIRECTIVE] PROBE(OWNERSHIP) + answer context
  → generates: "Got it — and when you say 'we built', what was specifically your
                 part in building it?"

[TTS plays]
  → Ishita speaks
  → _last_question_topic = "Multi Channel Lead Qualification System"
  → _last_interviewer_question = "what was specifically your part..."
  → TURN 4 starts`

---

### TURN 4: FOLLOW-UP (PROBE continues)

`Vamsi says: "I built the Instagram API integration and the lead scoring logic"

[llm_node]: [NEXT_TURN_DIRECTIVE] now in chat_ctx → _is_interview_turn=True
  → clear() → wait()

[EVAL]
  active_topic: "Multi Channel Lead Qualification System"
  active_topic_state: {score:1.0, turns:1} ← restored from _topic_states
  answer: "I built the Instagram API integration and the lead scoring logic"

  clarity=7, depth=5, specificity=7, grounding=7, overall=6.5
  signals=[none]
  saturation: 1.0 → 3.0 / 4.0  ← good answer earns real contribution
  action=PROBE, probe_family=depth

[AGENT DECISION: PROBE(depth)]
  → "Push past the claim — get the real number or tradeoff.
     → If they described a system: ask about scale — volume, load, users..."
  → directive:
      PROBE (DEPTH)
      LAST QUESTION: "what was specifically your part?"
      CANDIDATE SAID: "I built the Instagram API integration and the lead scoring logic"

Ishita asks: "How did you handle the scoring logic — what did you decide
              should count as a hot lead?"

TURN 5 starts...`

---

### TURN 5: SATURATION HIT → MOVE_ON

`Vamsi says: "Client gave three criteria: budget, timeline, urgency.
             If all three met, we send a booking reminder automatically."

[EVAL]
  active_topic: "Multi Channel Lead Qualification System"
  active_topic_state: {score:3.0, turns:2}
  answer: "Client gave three criteria..."

  clarity=7, depth=6, specificity=7, grounding=7, overall=6.75
  signals=[none]
  saturation: 3.0 → 5.2 / 4.0  ← SATURATED (threshold=4.0)
  action=MOVE_ON (saturation gate fires before LLM judge)

[AGENT DECISION: MOVE_ON]
  → _mark_topic_covered("Multi Channel Lead Qualification System")
     _covered_topic_keys = {"multi channel lead qualification system"}

  → _next_uncovered_topic(exclude="Multi Channel Lead..."):
     ordered_topics = [
       anchor (already covered — skip),
       "python" (skill, uncovered → PICK THIS),
       "Sensex Analysis Project - Built a system..." (uncovered),
       ...
     ]
     Returns: "python"

  Wait — that would ask about python before Sensex. Depends on shuffle.
  Let's say this run returned: "Sensex Analysis Project - Built a system to
  collect, clean, and analyze Sensex market data using Python and DuckDB;
  processed and stored data efficiently and visualized insights using Power BI;
  provided actionable insights for decision-making and market understanding.
  [Python, DuckDB, Power BI]"

  → _active_topic = "Sensex Analysis Project - Built a system... [Python, DuckDB, Power BI]"

  → Wipe chat_ctx conversation history (all user/assistant messages removed)
  → MOVE_ON directive injected:
      [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
      DECISION: MOVE_ON
      NEW ACTIVE TOPIC: Sensex Analysis Project - Built a system to collect, clean...
      YOUR ONLY JOB: Acknowledge briefly and move to this topic. Ask ONE focused question
                     about what they personally built or owned there.
      HARD RULE: Do NOT reference the previous topic.

  → TOPIC_LOCK injected:
      [TOPIC_LOCK - CRITICAL INSTRUCTION]
      PREVIOUS TOPIC IS CLOSED. DO NOT REFERENCE IT.
      NEW ACTIVE TOPIC: Sensex Analysis Project - Built a system to collect, clean,
                        and analyze Sensex market data using Python and DuckDB;
                        processed and stored data efficiently and visualized insights
                        using Power BI. [Python, DuckDB, Power BI]
      Ask ONE question about this topic.

  → _directive_ready.SET

[LLM fires]
  → Reads full topic context including "Python and DuckDB", "Power BI", "market data"
  → Generates: "Interesting. You also built a Sensex Analysis system — what was
                the actual data pipeline like, from collecting the market data
                to getting it into Power BI?"

  ← LLM asked a specific, grounded question using context from the full topic string ✅
  ← LLM did NOT ask "tell me about the Sensex project" (generic) ✅

TURN 6 | _last_question_topic = "Sensex Analysis Project" (short title for eval)`

---

### HOW EACH PIECE CONNECTS

                    `WHAT IT STORES / USES
┌─────────────┐
│   AGENT     │  _active_topic         = full topic string (for LLM context)
│             │  _last_question_topic  = short title (for eval to score)
│             │  _covered_topic_keys   = set of short keys already done
│             │  _topic_states         = saturation state keyed by short title
│             │  _discussed_log        = memory of past Q&A
│             │  _resume_topics_pool   = full strings ["Title - Description [tech]"]
│             │  _skill_topics_pool    = ["python", "n8n", ...]
└──────┬──────┘
       │
       │  sends to eval: active_topic = SHORT TITLE ("Multi Channel Lead...")
       │  eval scores ONLY this topic, returns: action, probe_family, saturation
       ▼
┌─────────────┐
│    EVAL     │  Scores clarity/depth/specificity/grounding
│  (pure      │  Detects signals (ownership_ambiguity, example_evasion, etc.)
│  scorer)    │  Calculates saturation on the SHORT TITLE topic
│             │  Returns: PROBE or MOVE_ON, probe_family, updated TopicState
└──────┬──────┘
       │
       │  agent reads result
       ▼
┌─────────────┐
│   AGENT     │  if PROBE:
│  (decides)  │    builds directive with probe_goal + prev Q&A + memory
│             │    LLM asks follow-up on SAME topic
│             │
│             │  if MOVE_ON:
│             │    marks current topic covered
│             │    picks next topic (FULL string) from _resume_topics_pool
│             │    wipes chat history
│             │    builds MOVE_ON directive + TOPIC_LOCK with FULL string
│             │    LLM asks about NEW topic with full context
└─────────────┘`