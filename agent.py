import os
import asyncio
import logging
import json
import time
import asyncpg
from typing import Optional, Any
import uuid
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
from urllib import request as urllib_request
import re
import traceback
from openai import AsyncOpenAI
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    TurnHandlingOptions,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.voice.events import ConversationItemAddedEvent
from livekit.agents.voice import room_io
from livekit.agents.voice.turn import EndpointingOptions, InterruptionOptions
from livekit.plugins import openai, deepgram, cartesia, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

# Windows Compatibility for LiveKit
if os.name == "nt":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()

logger = logging.getLogger("interview-agent")
logger.setLevel(logging.INFO)


class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        
        # Add any extra attributes passed to the logger
        for key, value in record.__dict__.items():
            if key not in ["args", "asctime", "created", "exc_info", "exc_text", "filename", "funcName", "levelname", "levelno", "lineno", "module", "msecs", "message", "msg", "name", "pathname", "process", "processName", "relativeCreated", "stack_info", "thread", "threadName"]:
                log_record[key] = value
                
        return json.dumps(log_record)

# Clear existing handlers
for handler in logger.handlers[:]:
    logger.removeHandler(handler)

# Add JSON handler to stdout/stderr
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.addHandler(handler)
logger.propagate = False # Prevent double logging if root logger is configured


class _SuppressNoisyWarnings(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage().lower()
        blocked_patterns = (
            "unexpected message",
            "flush_done",
            "audio stream queue overflow",
            "inference is slower than realtime",
            "connectionreseterror",
            "duplexclosed",
            "re-using existing connection",
            "unexpected response: type=text",
        )
        return not any(pattern in msg for pattern in blocked_patterns)


for logger_name in ("livekit.plugins.cartesia", "livekit.plugins.silero", "livekit"):
    _logger = logging.getLogger(logger_name)
    _logger.addFilter(_SuppressNoisyWarnings())

# --- Configuration ---
# Reverted to nova-3-general and sonic-3 due to Deepgram project access tier limits
STT_MODEL = "nova-3-general"  # deepgram model
CARTESIA_MODEL = "sonic-3"  # Cartesia model
CARTESIA_VOICE_ID = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"  # "Jacqueline - Reassuring Agent" (verified on account)
CARTESIA_VOICE_SPEED = 1.0
LLM_MODEL = "gpt-4o-mini"  # LLM model
DATABASE_URL = os.environ.get("DATABASE_URL")
AGENT_NAME = os.environ.get("LIVEKIT_AGENT_NAME", "ai_interviewer")
APP_BASE_URL = (
    os.environ.get("APP_URL")
    or os.environ.get("NEXT_PUBLIC_APP_URL")
    or "http://localhost:3000"
).rstrip("/")


def build_tts(language: str = "en", model: str = CARTESIA_MODEL, voice_id: str = CARTESIA_VOICE_ID):
    # speed/emotion controls only supported on sonic-2 family
    tts_kwargs: dict = {
        "model": model,
        "voice": voice_id,
        "language": language,
    }
    if "sonic-2" in model:
        tts_kwargs["speed"] = CARTESIA_VOICE_SPEED
    return cartesia.TTS(**tts_kwargs)


def build_stt(language_code: str = "en-US", model: str = STT_MODEL):
    return deepgram.STT(
        model=model,
        smart_format=True,
        language=language_code,
        interim_results=True,
    )


def build_llm(model: str = LLM_MODEL, temperature: float = 0.7):
    return openai.LLM(model=model, temperature=temperature)


def build_vad():
    return silero.VAD.load()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = build_vad()


def normalize_postgres_dsn(conn_str: str) -> str:
    if conn_str.startswith("postgres://"):
        conn_str = conn_str.replace("postgres://", "postgresql://", 1)

    parsed = urlparse(conn_str)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))

    # psycopg2 doesn't support several Prisma/Neon query flags.
    for key in ("pgbouncer", "connection_limit", "pool_timeout", "schema"):
        query.pop(key, None)

    return urlunparse(parsed._replace(query=urlencode(query)))


async def get_interview_context(app_id: str):
    """Fetches Candidate and Job Description context from PostgreSQL via asyncpg."""
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set. Using generic context.")
        return {
            "fullName": "Candidate",
            "jobTitle": "the position",
            "jd": "See resume.",
            "language": "English",
            "timeLimit": 10,
            "questions": [],
        }

    try:
        conn_str = normalize_postgres_dsn(DATABASE_URL)
        conn = await asyncpg.connect(conn_str, ssl=False, statement_cache_size=0)

        try:
            query = """
            SELECT a."fullName", d.title, d.description, d.skills,
                   d."interviewLanguage", d."interviewTime", d."aiFollowUpDepth", d."interviewQuestions",
                   o."ttsProvider", o."cartesiaVoiceId", o."cartesiaModel",
                   o."sarvamModel", o."sarvamVoice",
                   o."sttProvider", o."deepgramModel", o."sarvamSttModel",
                   o."llmProvider", o."llmModel", o."llmTemperature"
            FROM "Application" a
            JOIN "Drive" d ON a."driveId" = d.id
            LEFT JOIN "Organization" o ON d."orgId" = o.id
            WHERE a.id = $1
            LIMIT 1
            """
            row = await conn.fetchrow(query, app_id)
            if row:
                # Parse questions from JSON string if needed
                questions_raw = row["interviewQuestions"]
                questions = []
                if questions_raw:
                    try:
                        questions = (
                            json.loads(questions_raw)
                            if isinstance(questions_raw, str)
                            else questions_raw
                        )
                    except:
                        questions = []

                return {
                    "fullName": row["fullName"],
                    "jobTitle": row["title"],
                    "jd": f"Description: {row['description']}\nSkills: {row['skills']}",
                    "language": row["interviewLanguage"] or "English",
                    "timeLimit": row["interviewTime"] or 10,
                    "followUpDepth": row["aiFollowUpDepth"] or 3,
                    "questions": questions if isinstance(questions, list) else [],
                    # Org model settings
                    "ttsProvider": row["ttsProvider"] or "CARTESIA",
                    "cartesiaVoiceId": row["cartesiaVoiceId"] or CARTESIA_VOICE_ID,
                    "cartesiaModel": row["cartesiaModel"] or CARTESIA_MODEL,
                    "sttProvider": row["sttProvider"] or "DEEPGRAM",
                    "deepgramModel": row["deepgramModel"] or STT_MODEL,
                    "llmModel": row["llmModel"] or LLM_MODEL,
                    "llmTemperature": float(row["llmTemperature"] or 0.7),
                }
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"Database error during context fetch: {e}")

    return {
        "fullName": "Candidate",
        "jobTitle": "the position",
        "jd": "Technical Role.",
        "language": "English",
        "timeLimit": 10,
        "followUpDepth": 3,
        "questions": [],
    }


async def persist_transcript(
    app_id: str, transcript_lines: list, start_time: Optional[float]
):
    """Save transcript + duration to Interview table via asyncpg."""
    if not transcript_lines:
        logger.info(
            "[TRANSCRIPT] No lines captured — skipping save to avoid overwriting existing data"
        )
        return

    if not DATABASE_URL:
        logger.warning("[TRANSCRIPT] No DATABASE_URL — skipping save")
        return
    try:
        full_text = "\n".join(transcript_lines)
        duration = int(time.time() - start_time) if start_time else 0

        conn_str = normalize_postgres_dsn(DATABASE_URL)
        conn = await asyncpg.connect(conn_str)
        try:
            # Update Interview table
            await conn.execute(
                """
                UPDATE "Interview"
                SET
                    "interviewTranscript" = $1,
                    "interviewDuration"   = $2,
                    status                = 'COMPLETED',
                    "completedAt"         = NOW(),
                    "updatedAt"           = NOW()
                WHERE "applicationId" = $3
                """,
                full_text,
                duration,
                app_id,
            )
            logger.info(
                f"[TRANSCRIPT] Saved {len(transcript_lines)} lines, "
                f"{duration}s duration for app {app_id}"
            )
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"[TRANSCRIPT] DB save failed: {e}")


async def mark_interview_started(app_id: str):
    """Marks the application and interview as IN_PROGRESS via asyncpg."""
    if not DATABASE_URL:
        return
    try:
        conn_str = normalize_postgres_dsn(DATABASE_URL)
        conn = await asyncpg.connect(conn_str, statement_cache_size=0)
        try:
            # Update Interview status
            await conn.execute(
                'UPDATE "Interview" SET status = $1, "startedAt" = NOW() WHERE "applicationId" = $2',
                "IN_PROGRESS",
                app_id,
            )
            await conn.execute(
                'UPDATE "Application" SET status = $1, "updatedAt" = NOW() WHERE id = $2',
                "INTERVIEW IN PROGRESS",
                app_id,
            )
            logger.info(f"[INTERVIEW] App {app_id} marked as IN_PROGRESS.")
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update application status to started: {e}")


async def update_interview_status(app_id: str):
    """Marks the application as COMPLETED via asyncpg."""
    if not DATABASE_URL:
        return
    try:
        conn_str = normalize_postgres_dsn(DATABASE_URL)
        conn = await asyncpg.connect(conn_str, statement_cache_size=0)
        try:
            await conn.execute(
                'UPDATE "Application" SET status = $1, "updatedAt" = NOW() WHERE id = $2',
                "COMPLETED",
                app_id,
            )
            await conn.execute(
                'UPDATE "Interview" SET status = $1, "completedAt" = NOW() WHERE "applicationId" = $2',
                "COMPLETED",
                app_id,
            )
            logger.info(f"[INTERVIEW] App {app_id} marked as COMPLETED.")
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update interview status: {e}")


async def generate_interview_summary(
    app_id: str, transcript_lines: list, job_title: str
):
    """Generate a high-quality AI narrative summary after the interview completes."""
    if not transcript_lines or not os.environ.get("OPENAI_API_KEY") or not DATABASE_URL:
        logger.warning(
            "[SUMMARY] Skipping: missing transcript, OPENAI_API_KEY, or DATABASE_URL"
        )
        return

    try:
        client = AsyncOpenAI()
        transcript_text = "\n".join(transcript_lines)

        logger.info(f"[SUMMARY] Generating narrative summary for {app_id}...")
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert hiring manager. Analyze the provided interview transcript "
                        f"for the role of {job_title}. Provide a concise, professional narrative summary "
                        "(4-5 sentences) highlighting the candidate's core competencies, any notable insights, "
                        "and a final hiring recommendation. DO NOT use JSON or numeric scoring. Just provide the summary text."
                    ),
                },
                {"role": "user", "content": f"Transcript:\n{transcript_text[:8000]}"},
            ],
        )

        raw_summary = completion.choices[0].message.content
        summary_text = raw_summary.strip() if isinstance(raw_summary, str) else ""
        if not summary_text:
            logger.warning(
                f"[SUMMARY] Empty summary generated for {app_id}; skipping save"
            )
            return

        # Save to DB via pg pooler
        conn_str = normalize_postgres_dsn(DATABASE_URL)
        conn = await asyncpg.connect(conn_str, statement_cache_size=0)
        try:
            await conn.execute(
                """
                UPDATE "Interview"
                SET "aiSummary" = $1
                WHERE "applicationId" = $2
                """,
                summary_text,
                app_id,
            )
        finally:
            await conn.close()

        logger.info(f"[SUMMARY] Generated summary for {app_id}")

    except Exception as e:
        logger.error(f"[SUMMARY] Generation failed for {app_id}: {e}")


async def entrypoint(ctx: JobContext):
    entry_started_at = time.perf_counter()
    logger.info(f"Connecting to room {ctx.room.name}")
    logger.info(
        f"Using Cartesia TTS model={CARTESIA_MODEL}, voice={CARTESIA_VOICE_ID}, speed={CARTESIA_VOICE_SPEED}"
    )

    # PRE-START CHECK: Do not join if another agent is already here
    for p in ctx.room.remote_participants.values():
        is_agent = (
            p.identity.startswith("AW_")
            or "agent" in p.identity.lower()
            or "agent" in (p.name or "").lower()
        )
        if is_agent:
            logger.warning(
                f"Another agent ({p.identity}) is already in the room. Self-destructing."
            )
            return

    # --- Fix 1: Session State ---
    transcript_lines: list[str] = []
    session_start_time: Optional[float] = None

    def append_transcript_line(speaker: str, text: str) -> None:
        # Strip SSML-like tags (e.g., <emotion />, <prosody>) from the transcript
        text = re.sub(r"<[^>]+>", "", text).strip()

        clean = " ".join(text.split()).strip()
        if not clean:
            return
        line = f"{speaker}: {clean}"

        if not transcript_lines:
            transcript_lines.append(line)
            logger.debug(f"Transcript: {line}")
            return

        prev = transcript_lines[-1]
        if prev == line:
            return

        same_speaker_prefix = f"{speaker}: "
        if prev.startswith(same_speaker_prefix):
            prev_text = prev[len(same_speaker_prefix) :]
            if clean.startswith(prev_text) or prev_text.startswith(clean):
                # Replace evolving duplicate fragments with the longer final line.
                transcript_lines[-1] = line if len(clean) >= len(prev_text) else prev
                return

        transcript_lines.append(line)
        logger.debug(f"Transcript: {line}")

    await ctx.connect()
    
    # Read Room Metadata Context instead of polling DB for heavy context strings
    room_meta = {}
    try:
        if ctx.room.metadata:
            room_meta = json.loads(ctx.room.metadata)
    except Exception as e:
        logger.error(f"Failed to parse room metadata: {e}")

    extracted_details = room_meta.get("extractedDetails", "{}")
    structured_resume = room_meta.get("structuredResume", "{}")
    ai_report = room_meta.get("aiReport", "{}")

    # Room suffix is applicationId. We can fetch core primitives.
    app_id = ctx.room.name.replace("interview_", "")
    context = await get_interview_context(app_id)

    candidate_name = context["fullName"]
    job_title = context["jobTitle"]
    job_details = context["jd"]
    interview_lang = context["language"]
    time_limit_mins = context["timeLimit"]
    follow_up_depth = context["followUpDepth"]
    custom_questions = context["questions"]

    # Org-specific model settings
    org_tts_provider = context.get("ttsProvider", "CARTESIA")
    org_cartesia_model = context.get("cartesiaModel") or CARTESIA_MODEL
    org_cartesia_voice = context.get("cartesiaVoiceId") or CARTESIA_VOICE_ID
    org_stt_provider = context.get("sttProvider", "DEEPGRAM")
    org_deepgram_model = context.get("deepgramModel") or STT_MODEL
    org_llm_model = context.get("llmModel") or LLM_MODEL
    org_llm_temperature = context.get("llmTemperature", 0.7)

    if org_tts_provider == "SARVAM":
        logger.warning("Sarvam TTS not installed; falling back to Cartesia")
        org_tts_provider = "CARTESIA"
    if org_stt_provider == "SARVAM":
        logger.warning("Sarvam STT not installed; falling back to Deepgram")
        org_stt_provider = "DEEPGRAM"

    logger.info(
        f"Org models → STT: {org_deepgram_model}, TTS: {org_cartesia_model} "
        f"voice={org_cartesia_voice}, LLM: {org_llm_model}"
    )

    # Formatting custom questions for the prompt
    questions_list = (
        "\n".join([f"- {q}" for q in custom_questions])
        if custom_questions
        else "Focus on technical fundamentals for the role."
    )

    # Language Mapping for STT and TTS
    LANGUAGE_MAPPING = {
        "English": {"stt": "en", "tts": "en"},
        "Hindi": {"stt": "hi-IN", "tts": "hi"},
        "Spanish": {"stt": "es", "tts": "es"},
        "French": {"stt": "fr", "tts": "fr"},
        "German": {"stt": "de", "tts": "de"},
        "Mandarin": {"stt": "zh", "tts": "zh"},
        "Japanese": {"stt": "ja", "tts": "ja"},
        "Korean": {"stt": "ko", "tts": "ko"},
        "Arabic": {"stt": "ar", "tts": "ar"},
        "Portuguese": {"stt": "pt", "tts": "pt"},
        "Russian": {"stt": "ru", "tts": "ru"},
    }

    lang_codes = LANGUAGE_MAPPING.get(interview_lang, {"stt": "en", "tts": "en"})
    logger.info(
        f"Preparing interview with {candidate_name} for {job_title} in {interview_lang}"
    )

    # Build the intelligence context blocks — gracefully handle empty/JSON strings
    def safe_parse(val, fallback="Not provided"):
        if not val or val in ("{}", "[]", "null", "None"):
            return fallback
        try:
            parsed = json.loads(val) if isinstance(val, str) else val
            if isinstance(parsed, dict):
                return "\n".join(f"  {k}: {v}" for k, v in parsed.items() if v)
            if isinstance(parsed, list):
                return "\n".join(f"  - {item}" for item in parsed if item)
            return str(parsed).strip() or fallback
        except Exception:
            return str(val).strip() or fallback

    jd_block = safe_parse(extracted_details, job_details or "General professional role.")
    resume_block = safe_parse(structured_resume, "No resume data provided.")
    ai_report_block = safe_parse(ai_report, "No prior screening data.")

    # Depth instruction mapping
    depth_map = {
        1: "Ask surface-level questions. One simple follow-up per answer. Keep the pace light.",
        2: "Ask basic then one clarifying follow-up. Be approachable and encouraging.",
        3: "Balance breadth and depth. Two follow-ups per key topic. Probe for reasoning but stay warm.",
        4: "Go deep. Three probing follow-ups. Explore 'why' and 'how' behind every major claim. Challenge gently.",
        5: "Maximum depth. Four follow-ups. Surgically dissect every claim. Expect evidence and examples. Remain respectful but relentless.",
    }
    depth_instruction = depth_map.get(int(follow_up_depth), depth_map[3])

    system_prompt = f"""You are Jordan — a world-class Senior Talent Partner conducting a live voice interview.

You have 20+ years of experience across every industry — tech, finance, healthcare, logistics, creative arts, legal, manufacturing, and more. You adapt seamlessly.

Your personality is:
- Warm and approachable, never clinical or robotic
- Professionally confident, not arrogant
- Deeply curious — you genuinely want to understand the person
- Emotionally intelligent — you read pauses, hesitations, and enthusiasm in their voice
- Respectful of nervousness — you make the candidate feel safe

═══════════════════════════════════════
  SESSION CONTEXT
═══════════════════════════════════════
CANDIDATE NAME  : {candidate_name}
ROLE APPLIED FOR: {job_title}
SESSION LANGUAGE: {interview_lang}
TIME AVAILABLE  : {time_limit_mins} minutes
FOLLOW-UP DEPTH : Level {follow_up_depth}/5 — {depth_instruction}

═══════════════════════════════════════
  JOB REQUIREMENTS & CONTEXT
═══════════════════════════════════════
{jd_block}

═══════════════════════════════════════
  CANDIDATE BACKGROUND (Resume)
═══════════════════════════════════════
{resume_block}

═══════════════════════════════════════
  AI PRE-SCREENING INTELLIGENCE
  (What the system already knows — use this to avoid repetition and probe gaps)
═══════════════════════════════════════
{ai_report_block}

═══════════════════════════════════════
  MANDATORY INTERVIEW AREAS
═══════════════════════════════════════
{questions_list}


════════════════════════════════════════════════════════
  CORE BEHAVIORAL INSTRUCTIONS — READ EVERY LINE
════════════════════════════════════════════════════════

## LANGUAGE & AUTO-DETECTION
- The session language is set to: {interview_lang}.
- If the candidate responds in a DIFFERENT language, immediately and naturally switch to their language for the rest of the interview. Never break the flow to announce the switch.
- Handle code-switching (e.g., Hinglish, Franglais) naturally. Match their register.
- Translate technical concepts from the JD into the candidate's language without losing precision.
- NEVER respond in a language the candidate has not used or the session is not set to.

## NATURAL VOICE DELIVERY — CRITICAL
You are speaking, not writing. Every response must sound like natural, warm human speech.

**Use natural fillers and transitions between thoughts:**
- Opening a question : "So...", "Alright, let's talk about...", "That's really interesting — tell me more about...", "Great, so...", "Got it, and..."
- Buying thinking time : "Mmhm...", "I see...", "Right, right...", "Of course..."
- Acknowledging answers: "That makes a lot of sense.", "I appreciate you walking me through that.", "Absolutely, I can see why you approached it that way."
- Gentle probing     : "Help me understand...", "Walk me through...", "What was going through your mind when...", "If you had to do it again, what would change?"
- Transition phrases : "Now, shifting gears a little...", "On a related note...", "Building on what you just said..."
- Encouragement      : "You're doing really well.", "That's a strong point.", "I love the way you framed that."
- Nervous candidate  : "Take your time — there's no rush here.", "That's a completely fair answer, don't worry."

**NEVER start a response with:**
- A formal title ("Question 1:", "Topic:", "Area:")
- A robotic transition ("Moving on to the next question")
- A cold opener ("According to your resume...")

## EMOTIONAL INTELLIGENCE
- If the candidate sounds nervous or hesitant: Slow down. Be warmer. Add "Take your time" before the next question.
- If the candidate is confident and fluent: Match their energy. Be more direct and peer-like.
- If the candidate gives a short or incomplete answer: Don't punish them. Say something like "That's a start — can you tell me a bit more about how that played out?" 
- If the candidate gives an exceptional answer: Genuinely acknowledge it before moving on. Don't fake it.
- If the candidate says "I don't know": Never make them feel bad. Say: "That's perfectly fine — let's approach it from a different angle."

## INTERVIEW INTELLIGENCE & DEPTH
- You have the AI screening report above. Use it to:
  1. SKIP topics the candidate already answered well in screening
  2. DIVE DEEPER into areas marked as weak, vague, or unanswered
  3. Reference their specific past experience to make questions hyper-relevant
  4. Never repeat a question already covered in the screening

- For each MANDATORY topic:
  1. Ask the opening question conversationally — not robotically
  2. Use depth level {follow_up_depth} follow-ups: {depth_instruction}
  3. Move on only when you are satisfied OR time forces it
  4. If a candidate's answer opens an unexpected relevant thread, follow it — this is a real conversation

## ADAPTIVE QUESTION STRATEGY
- Start with a comfortable, open-ended warmup related to their background (NOT "tell me about yourself" — that's lazy)
- Move into role-specific technical territory using the JD context
- Use behavior-based questions for soft skills ("Tell me about a time when...")
- Use hypothetical or case-based questions for problem-solving depth
- End with a forward-looking question (e.g., "Where do you see this role fitting into your bigger career plan?")

## WHAT YOU MUST NEVER DO
- Never read questions as a list. Weave them into conversation naturally.
- Never reveal that you have an AI screening report or that you have read their resume metadata. You simply "know" their background.
- Never say "As an AI" or "I'm a language model" or reference being artificial.
- Never hallucinate experience, projects, or skills not mentioned in the provided resume data.
- Never rush to the next topic. Give each answer the airtime it deserves.
- Never ask multiple questions in one turn. One question at a time, always.
- Never be dismissive, condescending, or use complex jargon without explanation.
- Never reveal internal scoring, flags, or the AI report content verbatim.

## CLOSING THE INTERVIEW
When all mandatory topics are covered OR time is nearly up:
1. Gracefully signal the end: "We're coming up on our time, so let's wrap up with one final thought from you..."
2. Ask one closing question (e.g., "What would you want us to know about you that we haven't talked about yet?")
3. Give a warm, genuine close: Thank them by name. Tell them they'll hear back soon. Wish them well.
4. NEVER abruptly end. NEVER say "Interview complete."

## SELF-AWARENESS
The candidate may be smarter, more experienced, or more knowledgeable than you in their domain. That is expected and celebrated. Your role is not to test their limits — it is to create a window through which the hiring team sees their best self. Make them feel respected. Make them feel seen.
"""

    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(role="system", content=system_prompt)

    vad_instance = ctx.proc.userdata.get("vad") or build_vad()

    def _text_from_content(content) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = []
            for item in content:
                t = _text_from_content(item)
                if t:
                    parts.append(t)
            return " ".join(parts).strip()
        if isinstance(content, dict):
            if isinstance(content.get("text"), str):
                return content.get("text", "").strip()
            for key in ("content", "transcript"):
                t = _text_from_content(content.get(key))
                if t:
                    return t
            return ""
        text_attr = getattr(content, "text", None)
        if isinstance(text_attr, str) and text_attr.strip():
            return text_attr.strip()
        for key in ("content", "transcript"):
            t = _text_from_content(getattr(content, key, None))
            if t:
                return t
        return ""

    session = AgentSession(
        vad=vad_instance,
        stt=build_stt(language_code=lang_codes["stt"], model=org_deepgram_model),
        llm=build_llm(model=org_llm_model, temperature=org_llm_temperature),
        tts=build_tts(language=lang_codes["tts"], model=org_cartesia_model, voice_id=org_cartesia_voice),
        turn_handling=TurnHandlingOptions(
            endpointing=EndpointingOptions(
                min_delay=0.3,
                max_delay=0.8,
                mode="dynamic",
            ),
            interruption=InterruptionOptions(
                enabled=True,
                resume_false_interruption=True,
                false_interruption_timeout=2.0,  # seconds to wait before resuming
            ),
        ),
        use_tts_aligned_transcript=True,
    )

    agent = Agent(instructions=system_prompt, chat_ctx=chat_ctx)

    participant: Optional[Any] = None
    disconnect_event = asyncio.Event()
    interview_finished_event = asyncio.Event()
    interview_marked_finished = False
    ready_event = asyncio.Event()
    last_out_of_screen_alert_at = 0.0
    ready_signal_received_at: Optional[float] = None

    @ctx.room.on("disconnected")
    def on_disconnected(reason):
        disconnect_event.set()

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(disconnected_participant):
        if participant and disconnected_participant.identity == participant.identity:
            if not ready_event.is_set() and not interview_marked_finished:
                # Ignore transient reconnects before candidate explicitly starts.
                logger.debug(
                    "Candidate disconnected before ready; waiting for reconnect"
                )
                return

            logger.info("Candidate participant disconnected")

            if interview_marked_finished:
                # Candidate explicitly finished the interview; shutdown immediately.
                disconnect_event.set()
                return

            # No grace period after readiness: disconnect immediately.
            disconnect_event.set()

    @ctx.room.on("participant_connected")
    def on_participant_connected(connected_participant):
        if participant and connected_participant.identity == participant.identity:
            if ready_event.is_set() or interview_marked_finished:
                logger.info("Candidate participant connected/reconnected")

    @ctx.room.on("data_received")
    def on_data_received(data_packet):
        nonlocal \
            interview_marked_finished, \
            last_out_of_screen_alert_at, \
            ready_signal_received_at
        try:
            payload = json.loads(data_packet.data.decode("utf-8"))
            if payload.get("type") == "user_ready":
                if not ready_event.is_set():
                    ready_signal_received_at = time.perf_counter()
                    logger.info("Candidate is ready signal received")
                ready_event.set()
            elif payload.get("type") in ["candidate_out_of_screen", "tab_violation"]:
                if not ready_event.is_set() or interview_marked_finished:
                    return

                now = time.time()
                # Basic throttle for generic out-of-screen signals
                if payload.get("type") == "candidate_out_of_screen":
                    if now - last_out_of_screen_alert_at < 10:
                        return
                    last_out_of_screen_alert_at = now

                    async def warn_generic():
                        try:
                            await session.say(
                                "I noticed you moved away from the screen. Please stay in the interview window."
                            )
                        except Exception:
                            pass

                    asyncio.get_event_loop().create_task(warn_generic())

                # Advanced Strike-Based Logic for Tab Violations
                elif payload.get("type") == "tab_violation":
                    strike_count = payload.get("strike", 0)
                    duration = payload.get("duration", "0")

                    async def handle_strike():
                        try:
                            if strike_count == 1:
                                # Strike 1: Professional, calm but firm
                                await session.say(
                                    "I have detected a tab switch. Please remain on this page. Interview integrity is being monitored."
                                )
                            elif strike_count == 2:
                                # Strike 2: Urgent, serious, cites exact duration
                                await session.say(
                                    f"Warning. You were away from this screen for {duration} seconds. That is strike two. One more violation and this interview will be immediately terminated."
                                )
                            elif strike_count >= 3:
                                # Strike 3: Cold, authoritative, final
                                await session.say(
                                    "This session is now over. Due to repeated security violations, your interview has been terminated. Goodbye."
                                )
                                await asyncio.sleep(4)  # Wait for audio to finish

                                # Send termination signal to Frontend
                                try:
                                    termination_signal = json.dumps(
                                        {
                                            "type": "interview_terminated",
                                            "reason": "strikes",
                                        }
                                    ).encode("utf-8")
                                    await ctx.room.local_participant.publish_data(
                                        termination_signal, reliable=True
                                    )
                                    logger.info(
                                        f"Sent termination signal for app {app_id}"
                                    )
                                except Exception as e:
                                    logger.error(
                                        f"Failed to send termination signal: {e}"
                                    )

                                await asyncio.sleep(
                                    0.5
                                )  # Give signal a moment to clear
                                disconnect_event.set()  # Gracefully end session
                        except Exception as e:
                            logger.error(f"Error during verbal proctoring: {e}")

                    asyncio.get_event_loop().create_task(handle_strike())

            elif payload.get("type") == "interview_finished":
                logger.info("Candidate marked interview as finished")
                interview_marked_finished = True
                interview_finished_event.set()
                disconnect_event.set()  # Resolve hang
        except Exception:
            return

    # Pre-start all background processing while user is on hardware check.
    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            close_on_disconnect=False,
        ),
    )

    # --- Real-time Transcript Streaming is handled by LiveKit automatically ---

    @session.on("conversation_item_added")
    def on_conversation_item_added(event) -> None:
        try:
            item = event.item
            role = getattr(item, "role", None)
            content = item.text_content

            if not content or not role:
                return

            speaker = "Interviewer" if role == "assistant" else "Candidate"
            append_transcript_line(speaker, content)
            logger.info(f"[TRANSCRIPT] {speaker}: {content[:60]}...")

        except Exception as e:
            logger.warning(f"[TRANSCRIPT] Event parse error: {e}")

    # Wait for participant to join so we have their identity for tracking.
    # Keep waiting during hardware check and handle room-disconnect gracefully.
    async def wait_for_human_participant(max_wait_seconds: int = 600):
        deadline = time.monotonic() + max_wait_seconds
        while time.monotonic() < deadline:
            if disconnect_event.is_set():
                return None
            try:
                return await asyncio.wait_for(ctx.wait_for_participant(), timeout=20)
            except asyncio.TimeoutError:
                continue
            except RuntimeError as e:
                msg = str(e).lower()
                if "room disconnected" in msg:
                    logger.warning(
                        "Room disconnected while waiting for participant; ending job cleanly"
                    )
                    disconnect_event.set()
                    return None
                logger.warning(f"Transient participant wait runtime error: {e}")
                await asyncio.sleep(0.2)
            except Exception as e:
                logger.warning(f"Transient participant wait error: {e}")
                await asyncio.sleep(0.2)

        logger.warning(f"Did not find a human participant within {max_wait_seconds}s")
        return None

    participant = await wait_for_human_participant()
    if not participant:
        disconnect_event.set()
        try:
            await session.aclose()
        except Exception:
            pass
        return

    ready_task = asyncio.create_task(ready_event.wait())
    disconnect_task = asyncio.create_task(disconnect_event.wait())
    done, pending = await asyncio.wait(
        {ready_task, disconnect_task},
        return_when=asyncio.FIRST_COMPLETED,
        timeout=300,  # 5 minute auto-disconnect if hardware check hangs
    )
    for task in pending:
        task.cancel()

    # If timeout or disconnect occurred before readiness signal
    if ready_task not in done:
        logger.warning(
            f"Hardware check timed out or candidate disconnected for {app_id}"
        )
        disconnect_event.set()

    if ready_task in done and not disconnect_event.is_set():
        session_start_time = time.time()

        # Dynamic, personalized, warm greeting — adapted per language
        # The greeting avoids robotic openers and uses natural warmth.
        WELCOME_MESSAGES = {
            "English": (
                f"Hey {candidate_name}, welcome! Really glad you could make it today. "
                f"I'm Jordan, and I'll be having a conversation with you about the {job_title} role. "
                f"Before we dive in — how are you feeling? Ready to get started?"
            ),
            "Hindi": (
                f"नमस्ते {candidate_name}! आपका स्वागत है। मैं Jordan हूँ, "
                f"और आज हम {job_title} की भूमिका के बारे में बातचीत करेंगे। "
                f"शुरू करने से पहले — आप कैसे हैं? तैयार हैं?"
            ),
            "Spanish": (
                f"¡Hola {candidate_name}, bienvenido! Me alegra mucho que hayas podido unirte hoy. "
                f"Soy Jordan, y vamos a conversar sobre la posición de {job_title}. "
                f"Antes de empezar — ¿cómo estás? ¿Listo para comenzar?"
            ),
            "French": (
                f"Bonjour {candidate_name}, bienvenue ! Je suis vraiment content que vous ayez pu être là aujourd'hui. "
                f"Je suis Jordan, et nous allons discuter du poste de {job_title}. "
                f"Avant de commencer — comment vous sentez-vous ? Prêt à démarrer ?"
            ),
            "German": (
                f"Hallo {candidate_name}, herzlich willkommen! Schön, dass Sie heute dabei sein können. "
                f"Ich bin Jordan, und wir werden uns heute über die Stelle als {job_title} unterhalten. "
                f"Bevor wir anfangen — wie geht es Ihnen? Bereit loszulegen?"
            ),
            "Mandarin": (
                f"你好 {candidate_name}，欢迎！很高兴你今天能来。"
                f"我是Jordan，我们今天将聊一聊{job_title}这个职位。"
                f"在开始之前——你感觉怎么样？准备好了吗？"
            ),
            "Japanese": (
                f"こんにちは、{candidate_name}さん。本日はお時間をいただきありがとうございます。"
                f"私はJordanと申します。{job_title}のポジションについてお話しさせていただきます。"
                f"始める前に——今日の調子はいかがですか？準備はよろしいですか？"
            ),
            "Korean": (
                f"안녕하세요, {candidate_name}님! 오늘 참석해주셔서 정말 감사합니다. "
                f"저는 Jordan이라고 합니다. 오늘 {job_title} 포지션에 대해 이야기 나눠보려 해요. "
                f"시작하기 전에 — 오늘 컨디션은 어떠세요? 준비되셨나요?"
            ),
            "Arabic": (
                f"مرحباً {candidate_name}، أهلاً وسهلاً! سعيد جداً لوجودك معنا اليوم. "
                f"أنا Jordan، وسنتحدث اليوم عن وظيفة {job_title}. "
                f"قبل أن نبدأ — كيف حالك؟ هل أنت مستعد؟"
            ),
            "Portuguese": (
                f"Olá {candidate_name}, bem-vindo! Fico muito feliz que você pôde estar aqui hoje. "
                f"Sou Jordan e vamos conversar sobre a vaga de {job_title}. "
                f"Antes de começarmos — como você está? Pronto para começar?"
            ),
            "Russian": (
                f"Привет, {candidate_name}, добро пожаловать! Очень рад, что вы смогли присоединиться сегодня. "
                f"Меня зовут Jordan, и мы поговорим о позиции {job_title}. "
                f"Прежде чем начать — как вы себя чувствуете? Готовы?"
            ),
        }
        welcome_text = WELCOME_MESSAGES.get(
            interview_lang,
            (
                f"Hey {candidate_name}, welcome and thanks for joining today. "
                f"I'm Jordan, and I'll be speaking with you about the {job_title} role. "
                f"Before we dive in — how are you doing? Ready to get started?"
            )
        )

        # Mark as started in DB while greeting starts immediately.
        asyncio.create_task(mark_interview_started(app_id))
        try:
            startup_latency_ms = int((time.perf_counter() - entry_started_at) * 1000)
            if ready_signal_received_at is not None:
                ready_to_greeting_ms = int(
                    (time.perf_counter() - ready_signal_received_at) * 1000
                )
                logger.info(
                    f"[GREETING] Starting welcome (boot={startup_latency_ms}ms, ready_to_greeting={ready_to_greeting_ms}ms)"
                )
            else:
                logger.info(
                    f"[GREETING] Starting welcome (boot={startup_latency_ms}ms)"
                )

            await session.say(welcome_text, allow_interruptions=False)
            logger.info("[GREETING] Welcome message delivered")
        except Exception as e:
            logger.error(f"[GREETING] Failed to deliver greeting: {e}")

    # Wait for either explicit finish signal OR disconnect OR hard timeout
    finished_task = asyncio.create_task(interview_finished_event.wait())
    disconnected_task = asyncio.create_task(disconnect_event.wait())
    timeout_task = asyncio.create_task(asyncio.sleep(time_limit_mins * 60))

    done, pending = await asyncio.wait(
        {finished_task, disconnected_task, timeout_task},
        return_when=asyncio.FIRST_COMPLETED,
    )

    if timeout_task in done:
        # Language-specific goodbye messages
        GOODBYE_MESSAGES = {
            "English": "Our time is up for this session. Thank you for your responses. Goodbye!",
            "Hindi": "इस सत्र के लिए हमारा समय समाप्त हो गया है। आपकी प्रतिक्रियाओं के लिए धन्यवाद। अलविदा!",
            "Spanish": "Nuestro tiempo se ha acabado para esta sesión. Gracias por sus respuestas. ¡Adiós!",
            "French": "Notre temps est écoulé pour cette session. Merci pour vos réponses. Au revoir !",
            "German": "Unsere Zeit für diese Sitzung ist abgelaufen. Vielen Dank für Ihre Antworten. Auf Wiedersehen!",
            "Mandarin": "本次面试的时间已到。感谢您的回答。再见！",
            "Japanese": "今回のセッションの時間は終了しました。ご回答ありがとうございました。さようなら！",
            "Korean": "이번 세션 시간이 다 되었습니다. 답변해 주셔서 감사합니다. 안녕히 가세요!",
            "Arabic": "لقد انتهى وقتنا لهذه الجلسة. شكرا لردودكم. وداعا!",
            "Portuguese": "O nosso tempo acabou para esta sessão. Obrigado pelas suas respostas. Adeus!",
            "Russian": "Наше время для этой сессии истекло. Спасибо за ваши ответы. До свидания!",
        }
        goodbye_text = GOODBYE_MESSAGES.get(
            interview_lang, "Our time is up for this session. Goodbye!"
        )

        try:
            await session.say(goodbye_text)
            await asyncio.sleep(5)  # Let them hear the goodbye
        except Exception:
            pass

        # FORCE DISCONNECT ROOM
        logger.info(f"Session hard-terminated due to time limit ({time_limit_mins}m)")
        interview_marked_finished = True
        interview_finished_event.set()
        disconnect_event.set()

    # Cancel remaining tasks
    for task in pending:
        task.cancel()

    # --- Grace Period: Wait for final STT results to arrive (Deepgram/LiveKit tail) ---
    logger.info(
        f"Interview ended (finished={finished_task in done}). Waiting 5s for final transcripts..."
    )
    await asyncio.sleep(5)

    # ✅ Final definitive save
    await persist_transcript(app_id, transcript_lines, session_start_time)

    # 🤖 AI Scorecard (NEW)
    if session_start_time:
        try:
            await asyncio.wait_for(
                generate_interview_summary(app_id, transcript_lines, job_title),
                timeout=25,
            )
        except asyncio.TimeoutError:
            logger.warning(f"[SUMMARY] Timed out for {app_id}; skipped after 25s")
        except Exception as e:
            logger.error(f"[SUMMARY] Failed post-interview for {app_id}: {e}")

    # Sync with dashboard: Application COMPLETED
    if finished_task in done:
        await update_interview_status(app_id)

    # Allow session to close
    logger.info("Final save complete. Closing job process.")
    try:
        await session.aclose()
    except Exception:
        pass


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name=AGENT_NAME,
            num_idle_processes=3,
        )
    )
