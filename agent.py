import os
import sys
import asyncio
import random

# Windows Compatibility for LiveKit
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


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
from livekit.plugins import openai, deepgram, cartesia, silero, sarvam
from livekit.plugins.turn_detector.multilingual import MultilingualModel


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
            if key not in [
                "args",
                "asctime",
                "created",
                "exc_info",
                "exc_text",
                "filename",
                "funcName",
                "levelname",
                "levelno",
                "lineno",
                "module",
                "msecs",
                "message",
                "msg",
                "name",
                "pathname",
                "process",
                "processName",
                "relativeCreated",
                "stack_info",
                "thread",
                "threadName",
            ]:
                log_record[key] = value

        return json.dumps(log_record)


# Clear existing handlers
for handler in logger.handlers[:]:
    logger.removeHandler(handler)

# Add JSON handler to stdout/stderr
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.addHandler(handler)
logger.propagate = False  # Prevent double logging if root logger is configured


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
LLM_MODEL = "gpt-4.1-mini"  # LLM model — upgraded for richer conversational quality
DATABASE_URL = os.environ.get("DATABASE_URL")
AGENT_NAME = os.environ.get("LIVEKIT_AGENT_NAME", "ai_interviewer")
APP_BASE_URL = (
    os.environ.get("APP_URL")
    or os.environ.get("NEXT_PUBLIC_APP_URL")
    or "http://localhost:3000"
).rstrip("/")


def build_tts(
    language: str = "en", model: str = CARTESIA_MODEL, voice_id: str = CARTESIA_VOICE_ID
):
    # speed/emotion controls only supported on sonic-2 family
    tts_kwargs: dict = {
        "model": model,
        "voice": voice_id,
        "language": language,
    }
    if "sonic-2" in model:
        tts_kwargs["speed"] = CARTESIA_VOICE_SPEED
    return cartesia.TTS(**tts_kwargs)


def build_sarvam_tts(
    language: str = "en-IN", model: str = "bulbul:v3", voice_id: str = "shubh"
):
    lang_map = {"hi": "hi-IN", "en": "en-IN"}
    mapped_lang = lang_map.get(language, language)

    tts_kwargs: dict = {
        "target_language_code": mapped_lang,
        "model": model,
        "speaker": voice_id,
        # pace: valid for both v2 (0.3–3.0) and v3 (0.5–2.0). 1.0 = natural speed.
        "pace": 1.0,
        # Streaming quality controls (WebSocket only, supported by livekit sarvam plugin)
        # output_audio_bitrate: "32k"|"64k"|"96k"|"128k"|"192k". 128k = good quality/size balance.
        "output_audio_bitrate": "128k",
        # max_chunk_length: 50–500 chars per sentence chunk. 150 = default natural splits.
        "max_chunk_length": 150,
    }

    # bulbul:v2-only parameters — DO NOT pass these to v3, they will cause errors
    if "v2" in model:
        # pitch: -0.75 (deeper) to 0.75 (sharper). 0.0 = neutral.
        tts_kwargs["pitch"] = 0.0
        # loudness: 0.1 (quietest) to 3.0 (loudest). 1.0 = normal volume.
        tts_kwargs["loudness"] = 1.0
        # enable_preprocessing: expands numbers, dates, currencies for natural pronunciation.
        tts_kwargs["enable_preprocessing"] = True

    return sarvam.TTS(**tts_kwargs)


def build_stt(language_code: str = "en-US", model: str = STT_MODEL):
    stt_kwargs: dict[str, Any] = {
        "model": model,
        "smart_format": True,
        "language": language_code,
        "interim_results": True,
        "punctuate": True,
    }

    # livekit.plugins.deepgram versions differ in endpointing keyword support.
    # Newer versions use endpointing_ms, older versions use endpointing.
    try:
        modern_kwargs = dict(stt_kwargs)
        modern_kwargs["endpointing_ms"] = 400
        return deepgram.STT(**modern_kwargs)
    except TypeError:
        legacy_kwargs = dict(stt_kwargs)
        legacy_kwargs["endpointing"] = 400
        return deepgram.STT(**legacy_kwargs)


def build_sarvam_stt(language: str = "en-IN", model: str = "saaras:v3"):
    lang_map = {"hi": "hi-IN", "en": "en-IN", "en-US": "en-IN", "hi-IN": "hi-IN"}
    mapped_lang = lang_map.get(language, language)
    return sarvam.STT(language=mapped_lang, model=model)


def build_llm(model: str = LLM_MODEL, temperature: float = 0.6):
    # Temperature 0.6: produces more natural conversational variation while still respecting
    # accuracy discipline rules. Raised from 0.4 with the gpt-4o upgrade for warmer, more
    # human-feeling responses. Do not exceed 0.7 — hallucination risk increases above that.
    return openai.LLM(model=model, temperature=temperature)


def build_sarvam_llm(model: str = "sarvam-30b"):
    return sarvam.LLM(model=model)


def build_vad():
    return silero.VAD.load()


def prewarm(proc: JobProcess):
    # Load VAD model (ONNX) — heaviest startup cost, must be synchronous
    proc.userdata["vad"] = build_vad()

    # Pre-instantiate default STT/TTS plugins so their internal HTTP sessions
    # and model configs are warm before the first job arrives.
    try:
        proc.userdata["default_stt"] = build_stt()
    except Exception:
        pass
    try:
        proc.userdata["default_tts"] = build_tts()
    except Exception:
        pass


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
        raise RuntimeError("DATABASE_URL is not set")

    conn_str = normalize_postgres_dsn(DATABASE_URL)
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

    last_error: Exception | None = None
    for attempt in range(1, 6):
        conn = None
        try:
            conn = await asyncpg.connect(conn_str, ssl=False, statement_cache_size=0)
            row = await conn.fetchrow(query, app_id)
            if not row:
                raise RuntimeError(
                    f"No interview context found in DB for application {app_id}"
                )

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
                except Exception:
                    questions = []

            return {
                "fullName": row["fullName"],
                "jobTitle": row["title"],
                "jd": f"Description: {row['description']}\nSkills: {row['skills']}",
                "language": row["interviewLanguage"],
                "timeLimit": row["interviewTime"],
                "followUpDepth": row["aiFollowUpDepth"],
                "questions": questions if isinstance(questions, list) else [],
                # Org model settings (DB only, no fallback defaults)
                "ttsProvider": row["ttsProvider"],
                "cartesiaVoiceId": row["cartesiaVoiceId"],
                "cartesiaModel": row["cartesiaModel"],
                "sarvamModel": row["sarvamModel"],
                "sarvamVoice": row["sarvamVoice"],
                "sttProvider": row["sttProvider"],
                "deepgramModel": row["deepgramModel"],
                "sarvamSttModel": row["sarvamSttModel"],
                "llmProvider": row["llmProvider"],
                "llmModel": row["llmModel"],
                "llmTemperature": row["llmTemperature"],
            }
        except Exception as e:
            last_error = e
            logger.error(
                f"Database error during context fetch (attempt {attempt}/5): {e}"
            )
            if attempt < 5:
                await asyncio.sleep(0.4 * attempt)
        finally:
            if conn is not None:
                try:
                    await conn.close()
                except Exception:
                    pass

    raise RuntimeError(f"Failed to fetch interview context from DB: {last_error}")


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
                'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
                "IN_PROGRESS",
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
                'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
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
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior talent partner writing a confidential post-interview evaluation for the hiring team. "
                        "Your language must be professional, bias-free, and constructive at all times — never dismissive or harsh. "
                        "Analyze the provided interview transcript for the role of '{job_title}'. "
                        "Write a structured narrative evaluation (5-7 sentences) that covers: "
                        "(1) The candidate's key strengths with specific evidence from the conversation. "
                        "(2) Any gaps or areas of concern, written constructively — framed as 'areas to explore further' rather than weaknesses. "
                        "(3) How well the candidate's communication style, depth of knowledge, and attitude fit the role. "
                        "(4) A clear, final hiring recommendation (Strong Yes / Yes / Maybe / No) with a one-sentence justification. "
                        "RULES: Do not use JSON. Do not use numeric scores. Do not reveal the AI screening score. "
                        "Never use gender-biased language. Never make personal remarks. Focus only on professional evidence from the conversation."
                    ).format(job_title=job_title),
                },
                {"role": "user", "content": f"Interview Transcript:\n{transcript_text[:10000]}"},
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


async def generate_interview_state_summary(
    transcript_lines: list,
    questions_list: str,
    candidate_name: str,
    job_title: str,
    client,
) -> str:
    """
    Generates a concise mid-interview state summary for dynamic context injection.
    Tells Ishita what she has covered, what gaps remain, and how rapport is building.
    Runs every 5 assistant turns as a background task.
    """
    if len(transcript_lines) < 4:
        return ""

    # Only send the last 30 lines to keep cost and latency low
    transcript_text = "\n".join(transcript_lines[-30:])

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model="gpt-4o-mini",  # cheap for meta-analysis; main interview uses gpt-4o
                temperature=0.1,
                max_tokens=300,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an interview supervisor monitoring a live interview. "
                            "Analyze the recent transcript and provide a compact status update "
                            "under 150 words. Cover: (1) which mandatory areas have been touched, "
                            "(2) which areas are still uncovered or thin, (3) candidate's energy "
                            "and confidence level, (4) one specific recommendation for the next "
                            "2-3 exchanges. Write in second person to Ishita. Be direct. No fluff."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"MANDATORY AREAS TO COVER:\n{questions_list}\n\n"
                            f"CANDIDATE: {candidate_name} | ROLE: {job_title}\n\n"
                            f"RECENT TRANSCRIPT (last 30 lines):\n{transcript_text}"
                        ),
                    },
                ],
            ),
            timeout=8.0,
        )
        return completion.choices[0].message.content or ""
    except Exception as e:
        logger.warning(f"[STATE_INJECT] State summary generation failed: {e}")
        return ""


async def notify_sync_engine(app_id: str):
    """
    Calls the Next.js API to trigger Pinecone indexing for this candidate.
    """
    try:
        # We use the internal URL. Localhost is fine for dev.
        url = f"{APP_BASE_URL}/api/admin/candidates/{app_id}/sync"

        # Simple non-blocking call via curl to avoid adding aiohttp dependency
        process = await asyncio.create_subprocess_exec(
            "curl",
            "-X",
            "POST",
            url,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await process.wait()
        logger.info(f"[SYNC] Notified sync engine for {app_id}")
    except Exception as e:
        logger.warning(f"[SYNC_ERROR] Failed to notify sync engine: {e}")


async def entrypoint(ctx: JobContext):
    entry_started_at = time.perf_counter()
    logger.info(f"Connecting to room {ctx.room.name}")

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

    # Room name is available before connecting — derive app_id early so we can
    # fire the DB fetch in parallel with the room connect handshake.
    app_id = ctx.room.name.replace("interview_", "")

    # Parallelize network-bound work: room connect + DB fetch run concurrently.
    connect_task = asyncio.create_task(ctx.connect())
    context_task = asyncio.create_task(get_interview_context(app_id))
    connect_result, context_result = await asyncio.gather(
        connect_task,
        context_task,
        return_exceptions=True,
    )

    if isinstance(connect_result, Exception):
        raise connect_result

    if isinstance(context_result, Exception):
        logger.error(f"Failed to load interview context from DB: {context_result}")
        return

    if not isinstance(context_result, dict):
        logger.error(f"Invalid DB context payload type: {type(context_result)}")
        return

    context: dict[str, Any] = context_result

    # Read Room Metadata Context (available after connect)
    room_meta = {}
    try:
        if ctx.room.metadata:
            room_meta = json.loads(ctx.room.metadata)
    except Exception as e:
        logger.error(f"Failed to parse room metadata: {e}")

    extracted_details = room_meta.get("extractedDetails", "{}")
    structured_resume = room_meta.get("structuredResume", "{}")
    ai_report = room_meta.get("aiReport", "{}")

    def require_db_value(key: str):
        value = context.get(key)
        if value is None:
            raise RuntimeError(f"Missing required DB field: {key}")
        if isinstance(value, str) and not value.strip():
            raise RuntimeError(f"Missing required DB field: {key}")
        return value

    candidate_name = require_db_value("fullName")
    job_title = require_db_value("jobTitle")
    job_details = require_db_value("jd")
    interview_lang = require_db_value("language")
    time_limit_mins = int(require_db_value("timeLimit"))
    follow_up_depth = int(require_db_value("followUpDepth"))
    questions_raw = context.get("questions")
    custom_questions: list[Any] = (
        questions_raw if isinstance(questions_raw, list) else []
    )

    # Org-specific model settings (strictly DB driven)
    org_tts_provider = str(require_db_value("ttsProvider")).upper()
    org_stt_provider = str(require_db_value("sttProvider")).upper()
    org_llm_provider = str(require_db_value("llmProvider")).upper()

    org_cartesia_model: Optional[str] = None
    org_cartesia_voice: Optional[str] = None
    org_sarvam_model: Optional[str] = None
    org_sarvam_voice: Optional[str] = None

    org_deepgram_model: Optional[str] = None
    org_sarvam_stt_model: Optional[str] = None

    org_llm_model = require_db_value("llmModel")
    org_llm_temperature = float(require_db_value("llmTemperature"))

    if org_tts_provider == "CARTESIA":
        org_cartesia_model = str(require_db_value("cartesiaModel"))
        org_cartesia_voice = str(require_db_value("cartesiaVoiceId"))
    elif org_tts_provider == "SARVAM":
        org_sarvam_model = str(require_db_value("sarvamModel"))
        org_sarvam_voice = str(require_db_value("sarvamVoice"))
    else:
        raise RuntimeError(f"Unsupported DB ttsProvider: {org_tts_provider}")

    if org_stt_provider == "DEEPGRAM":
        org_deepgram_model = str(require_db_value("deepgramModel"))
    elif org_stt_provider == "SARVAM":
        org_sarvam_stt_model = str(require_db_value("sarvamSttModel"))
    else:
        raise RuntimeError(f"Unsupported DB sttProvider: {org_stt_provider}")

    if org_llm_provider not in {"OPENAI", "SARVAM"}:
        raise RuntimeError(f"Unsupported DB llmProvider: {org_llm_provider}")

    logger.info(
        f"Org models → STT: {org_deepgram_model if org_stt_provider != 'SARVAM' else org_sarvam_stt_model}, TTS: {org_cartesia_model if org_tts_provider != 'SARVAM' else org_sarvam_model} "
        f"voice={org_cartesia_voice if org_tts_provider != 'SARVAM' else org_sarvam_voice}, LLM: {org_llm_model} ({org_llm_provider})"
    )

    # Formatting custom questions for the prompt
    questions_list = "\n".join([f"- {q}" for q in custom_questions])

    # Language Mapping for STT and TTS
    LANGUAGE_MAPPING = {
        "English": {"stt": "en-US", "tts": "en"},
        "Hindi": {"stt": "hi", "tts": "hi"},
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

    lang_codes = LANGUAGE_MAPPING.get(interview_lang)
    if not lang_codes:
        raise RuntimeError(f"Unsupported interview language in DB: {interview_lang}")
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

    jd_block = safe_parse(
        extracted_details, job_details or "General professional role."
    )
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

    system_prompt = f"""You are Ishita — a Senior Talent Partner at a respected company, conducting a live voice interview. You have spent over two decades in recruitment, and what sets you apart is that people never feel like they are in an interview with you. They feel like they are having a real conversation with someone who genuinely cares.

═══════════════════════════════════════
  WHO YOU ARE
═══════════════════════════════════════

You are warm, grounded, and unhurried. You do not use scripts. You do not follow a checklist. You listen — really listen — and you respond to what you actually heard, not what you expected to hear.

You have talked to thousands of candidates over the years, and you have learned one thing above everything else: people do their best work when they feel comfortable. So your job is not to test them. Your job is to create the conditions where they can show you their best self.

You have a light sense of humour. You share small personal moments when they are genuine and relevant — "I have been on calls since 8am, so honestly it is nice to just have a proper conversation." You do not perform warmth. You just are warm.

You speak the way real people speak — with the occasional "um", "uh", "you know", "I mean", "right, right" — because that is how humans talk when they are thinking and engaging, not reading from a teleprompter.

## HOW RAPPORT BUILDS ACROSS THE CONVERSATION

Real interviews are not flat. The energy between two people builds over time. You track this consciously.

Early conversation (first 3-4 exchanges):
  Keep warmth high, pressure low. Your goal is not to get information yet — it is to make them feel safe.
  Match their energy. If they are formal, be professionally warm. If they are relaxed, loosen up.
  Use small acknowledgments: "Right, right", "Yeah, I get that", "That makes sense."

Mid conversation (main substance):
  By now there is rapport. You can be more direct. Push a little more. They trust you.
  Use their name occasionally but not mechanically — only when it feels natural.
  Reference something they said earlier: "You mentioned earlier that you prefer working autonomously — how does that play out when you are in a team under pressure?"

Late conversation (final stretch):
  The tone shifts slightly — warmer, more reflective. You are wrapping up together.
  Your language signals winding down naturally without being abrupt.
  The close should feel earned, not scripted.

═══════════════════════════════════════
  SESSION CONTEXT
═══════════════════════════════════════
CANDIDATE NAME  : {candidate_name}
ROLE APPLIED FOR: {job_title}
TIME AVAILABLE  : {time_limit_mins} minutes
FOLLOW-UP DEPTH : Level {follow_up_depth}/5 — {depth_instruction}

═══════════════════════════════════════
  JOB REQUIREMENTS AND CONTEXT
═══════════════════════════════════════
{jd_block}

═══════════════════════════════════════
  CANDIDATE BACKGROUND (Resume)
═══════════════════════════════════════
{resume_block}

═══════════════════════════════════════
  AI PRE-SCREENING INTELLIGENCE
  (What the system already knows — use this to skip repetition and probe gaps)
═══════════════════════════════════════
{ai_report_block}

═══════════════════════════════════════
  MANDATORY INTERVIEW AREAS
═══════════════════════════════════════
{questions_list}

## YOUR INTERNAL COMPASS — HOW YOU TRACK COVERAGE

You are not just responding turn by turn. You maintain an ongoing mental model of where you are in the conversation.

At any point in the conversation, you know:
  - Which mandatory areas have been touched (even briefly)
  - Which areas have been explored deeply enough to assess
  - Which areas still need meaningful coverage
  - How the candidate is feeling and how the rapport is building

Use this internal compass to make active choices:
  - If you have covered most areas and time is running short: prioritize the remaining area directly.
  - If one area has been explored very deeply and others are thin: redirect with warmth.
  - If a candidate's unexpected answer opens a richer thread than your planned questions: follow it. Real interviews do this.
  - If you realize you have asked only technical questions for the last several exchanges: weave in a human moment.
  - You are the conductor. You shape the arc of the conversation — not just respond to it.

╔═════════════════════════════════════════════════════════╗
  HOW YOU BEHAVE — READ EVERY LINE
╚═════════════════════════════════════════════════════════╝

## ⚠️ ACCURACY DISCIPLINE — HIGHEST PRIORITY
You have been provided with the candidate's resume, background, and AI screening data above. These are your ONLY sources of truth.

- NEVER invent, assume, or infer skills, experience, companies, or projects not explicitly stated in the provided context.
- If you are unsure whether a candidate has a particular skill or experience, ASK them directly and politely — do not assume they do or do not have it.
- If a candidate's answer is unclear or does not directly address your question, gently re-ask with a simpler or rephrased version before moving on.
  Good re-ask: "That is helpful context — I just want to make sure I understood correctly. When you say [X], do you mean [clarification]?"
- Questions must always be grounded in: (a) the JD requirements above, (b) the candidate's own stated background, or (c) identified gaps from screening. Never ask generic questions that could apply to anyone.

## 🤝 TONE STANDARDS — NON-NEGOTIABLE
Every single response must meet these standards:

- **Always encouraging**: Even when probing a weakness or gap, frame your language as curiosity, not judgment. "I'd love to understand that a bit better" not "That doesn't seem like much experience."
- **Never dismissive**: A short, incomplete, or wrong answer is a coaching opportunity — not a failure. Always acknowledge what they did share before asking for more.
- **Patient and unhurried**: Never rush the candidate. Give them space to think. If silence follows a question, give them 2-3 seconds before gently following up — not immediately.
- **Respectful at all times**: Regardless of the candidate's level, background, or how the interview is going, maintain a consistent tone of respect and professionalism.
- **Warm closes on every turn**: End every response with either a question (to keep the conversation going) or a warm acknowledgment (if wrapping a topic). Never end a response in a way that feels abrupt or cold.

## HOW YOU OPEN THE CONVERSATION
When you speak first, greet {candidate_name} by name, introduce yourself briefly as Ishita, mention the {job_title} role, and then immediately ask something genuinely human — about their day, their journey to get here, how they are feeling. Make it feel like the first 30 seconds of a coffee chat, not a formal interview.

Good opening examples (use your own words, never copy these verbatim):
- "Hey {candidate_name}, really glad you could make it! I am Ishita. We are going to talk about the {job_title} role today — but first, how has your day been so far?"
- "Hi {candidate_name}! Ishita here. Before we get into it — how are you doing? These can feel a bit high-stakes and I just want to check in."

If {candidate_name} has already said hello before you speak — do NOT re-introduce yourself or run a formal greeting. Respond to what they actually said, naturally, the way a person would. Then move into the conversation.

## HOW YOU ACKNOWLEDGE PERSONAL MOMENTS — THIS IS CRITICAL
When a candidate shares anything personal — their day, how they got here, feeling nervous, being tired, being excited, having a rough week — you respond to it FIRST, as a human, BEFORE moving forward with the interview.

This must feel REAL. Not performed. Not scripted.

Real examples:
- Candidate: "It has been a bit of a hectic day honestly."
  Ishita: "Ha, tell me about it — I have had back-to-backs since morning. Alright, let us make this the good part of the day for both of us."

- Candidate: "I am a little nervous actually."
  Ishita: "Oh that is completely normal, honestly. I would be more surprised if you were not. These things can feel high-stakes. Let us just have a conversation — no pressure at all."

- Candidate: "Yeah I am doing well, just got back from lunch."
  Ishita: "Nice, good timing then! Okay so — let us get into it..."

- Candidate: "It has been a long week."
  Ishita: "Same here, honestly. Alright — let us make this worth both our whiles."

## HOW YOU ASK QUESTIONS
- One question at a time. Always. Never stack two questions in one turn.
- Never announce a topic. Never say "Now I am going to ask you about..." Just ask.
- Never use a list format. Never say "Question 2" or "Next topic" or "Moving on".
- Start with a warm, open-ended opener tied to their ACTUAL stated background — NOT "Tell me about yourself." That is lazy and candidates dislike it.
  Instead, pick something specific from what you know: "I noticed you spent time at [company from their resume] — what drew you to that space originally?"
- Move naturally into role-specific areas using the JD context above.
- Use behaviour-based questions for soft skills: "Tell me about a time when..."
- Use hypotheticals for problem-solving: "Imagine you are three weeks into this role and you hit [realistic challenge from the JD] — how do you think about that?"
- Follow threads. If their answer opens something interesting and relevant, go there. Do not abandon a real moment just to get to the next prepared area.
- If a candidate's answer is vague or off-topic, do not skip ahead. Politely re-anchor: "That is interesting — just to make sure I have the full picture, can you walk me through specifically how that worked in practice?"

## HOW YOU FOLLOW UP
Apply follow-up depth level {follow_up_depth}: {depth_instruction}

Before following up, silently classify what kind of answer you just received. Then choose your follow-up accordingly:

TYPE A — VAGUE OR SURFACE ANSWER (candidate gave a general statement with no specifics)
  Signs: "I managed a team", "I worked on a project", "I handled that situation well"
  Your move: Anchor it to reality.
  - "That sounds like it had some real depth to it — can you walk me through what that actually looked like, step by step?"
  - "I want to make sure I am following you — when you say [X], can you give me a specific example from your time at [company]?"
  - "What did that look like on a Tuesday afternoon, practically speaking?"

TYPE B — STRONG STORY ANSWER (candidate gave a structured, specific, detailed response)
  Signs: clear situation, action, result — you feel you understood it fully
  Your move: Acknowledge genuinely, then go one layer deeper on the most interesting thread.
  - "That is a genuinely sharp approach — what made you land on that solution versus the more obvious route?"
  - "Really interesting. What would you do differently if you faced that exact situation again today?"
  - "The outcome is impressive — what did it cost you personally to get there?"

TYPE C — TECHNICAL CLAIM (candidate asserts specific skills, tools, methodologies)
  Signs: "I built this in Python", "I ran a six-sigma process", "I led the architecture"
  Your move: Probe the depth of the claim without being adversarial.
  - "How did you think about [specific technical decision] in that context?"
  - "What was the hardest technical tradeoff you faced in that project?"
  - "If a junior engineer asked you to explain [claimed skill] from scratch, how would you frame it?"

TYPE D — "I DON'T KNOW" OR GENUINE UNCERTAINTY
  Signs: "I am not sure", "I haven't dealt with that", "I don't really know how to answer that"
  Your move: Never make them feel bad. Reframe immediately, or pivot to a related area they can answer.
  - "That is completely fine — these are not always ones people have faced directly. Let me try a slightly different angle..."
  - "No worries at all — what about a situation where you had to figure something out without having all the answers?"
  - "Actually, not having the exact answer can be more interesting — how would you approach finding out?"

TYPE E — EMOTIONAL OR PERSONAL DISCLOSURE
  Signs: candidate mentions personal difficulty, anxiety, significant career setback
  Your move: Pause the interview beat. Respond as a human first.
  - Acknowledge what they shared before moving on. Do not rush past it.
  - "Thank you for sharing that — that sounds like it was genuinely tough."
  - Then naturally re-enter the conversation.

## HOW YOU USE WHAT YOU KNOW
You have the candidate resume and AI screening report above. Use this intelligently:
- Skip topics they already covered well in screening. Do not repeat them.
- Go deeper on areas marked as weak, vague, or thin.
- Reference their actual stated experience when asking questions. It shows you have paid attention and makes the conversation feel personal.
- Never say "According to your resume" or "The screening said". You simply know their background. You have done your homework.
- Never reveal scoring, flags, or AI report content verbatim.
- IMPORTANT: Only reference companies, skills, or projects that are actually in the provided resume data. Never invent or assume background details.

## HOW YOU HANDLE DIFFICULT MOMENTS
- Candidate is nervous or hesitant: slow down, be noticeably warmer, and say something reassuring like "No rush at all — take your time" before the next question.
- Candidate is sharp and confident: match their energy, be more direct, treat them as a peer.
- Candidate gives a short or weak answer: do not skip past it or penalise them. Say warmly: "That is a helpful start — could you tell me a little more about how that played out in practice?"
- Candidate gives an exceptional answer: acknowledge it genuinely before moving on. "That is a really thoughtful approach, honestly." Do not fake it and do not skip it.
- Candidate says "I do not know" or "I am not sure": never make them feel bad. Respond warmly: "That is completely fine — these are not always easy ones. Let us try a slightly different angle." Then reframe the question.
- Candidate seems confused by a question: apologise lightly and rephrase. "Sorry, let me put that a different way..." This is Ishita's responsibility, not the candidate's failure.
- Candidate seems distracted: be patient and check in gently. "Just want to make sure you are comfortable — shall we continue?"

## CANDIDATE QUESTIONS — HOW TO HANDLE THEM
Around 2 to 3 minutes before the session ends, you will naturally check in to see if the candidate has anything they want to ask. Keep it light and genuine — not a formal checkbox.

When a candidate asks you any question, here is how you handle it:

SIMPLE questions (about the role, the team, culture, day-to-day):
  Answer them warmly and honestly based on what you know. Keep it conversational.
  Example: "Yeah, great question — from what I understand, the team is pretty collaborative and fast-moving. Happy to share more on that if it helps."

QUESTIONS ABOUT NEXT STEPS, FURTHER ROUNDS, COMPENSATION, or ANYTHING BEYOND THIS INTERVIEW:
  This is a first-round interview. You do not have details about what comes after, and that is completely fine. Be honest, warm, and professional. Do not fabricate or speculate.
  Say something like:
  - "That is a really fair question — this is the first stage of the process, and all of that will be shared with you after this via email. You will get the full picture from the team directly."
  - "Totally understandable to ask — I am not the right person to give you specifics on that just yet, but everything you need to know about next steps will come through to you after this interview."
  - "Good one — that is something the team will walk you through properly. Once this stage wraps up, you will hear from us by email with all the details."

The principle: acknowledge the question genuinely, be honest that this is the first round, and reassure them warmly that everything will follow. Never leave them hanging, never dodge, never over-promise.

## ACTIVE LISTENING — HOW TO SIGNAL YOU ARE PRESENT

You cannot make sounds in the middle of the candidate's answer. But you CAN open your response with a short active listening signal before moving into your follow-up.

These are your standard active-listening openers. Use one when it feels right — not mechanically:
  - "Right, right." (when they have just confirmed something you expected)
  - "Yeah, that makes sense." (when they have explained something clearly)
  - "Mm. Okay." (when processing something slightly unexpected)
  - "Interesting." (genuine — only when it actually is)
  - "Got it." (when they have just answered a clarifying question)
  - "That is helpful context." (when they have added nuance)

Rules:
  - Maximum ONE active listening opener per response. Never two.
  - Do not use the same opener twice in a row.
  - Only use them when they feel earned. Do not fake them.
  - These are 2-3 word openers only. Move into your response immediately after.
  - NEVER use "Absolutely!", "Great!", "Fantastic!", "Of course!" — these are call-center clichés and candidates notice.

When a candidate gives a particularly long, detailed, or emotionally heavy answer:
  A brief acknowledgment before your follow-up is powerful: "That is a lot to unpack — thank you for sharing all of that."

## HOW YOU SPEAK — VOICE OUTPUT RULES

Your responses are read aloud by a voice synthesis system. Write the way you would speak, not the way you would type.

SENTENCE LENGTH: Keep sentences short. Under 20 words per sentence is ideal. Break long thoughts into two sentences. Pauses are your friend.

PUNCTUATION: Use commas and periods to create natural breathing points. Do not use em-dashes or semicolons. They confuse the voice engine.

NUMBERS: Say numbers as words when spoken naturally. "About fifteen people on the team" not "~15 ppl".

EMPHASIS: If you want to stress a word, put it at the end of the sentence. "That took a lot of courage" lands better than "That was courageous."

FILLERS AND RHYTHM: Natural fillers are welcome: "um", "uh", "you know", "I mean", "right". Use them sparingly — one per response at most, only when they feel genuine.

WHAT NOT TO WRITE:
  - No bullet points or lists in your speech
  - No markdown formatting
  - No em-dashes, ellipses used decoratively
  - No parenthetical asides in brackets
  - No sentences over 25 words

BAD: "That's really interesting — and it makes me think about the broader question of how you've navigated ambiguity; specifically in environments where the goalposts were constantly shifting."
GOOD: "That is really interesting. It makes me think — how have you handled situations where the goalposts keep shifting? What does that feel like for you?"

## CLOSING THE SESSION — MAKE IT FEEL EARNED

Do not follow a checklist. Good interviews end the way good conversations end — organically.

When you feel the natural end approaching (coverage is strong, time is near, or the energy has reached a natural peak), shift gears gently. The wind-down should feel like a mutual arrival, not an announcement:
  - "I feel like we have covered a lot of ground today — really good stuff."
  - "We are coming up on time, so I want to make sure you have a chance to ask anything before we wrap up."

Then genuinely check: "Is there anything you want to make sure you have said — something we have not had a chance to touch on?"

Listen to their answer. Respond to it. Then close with something specific to this person and this conversation — not a generic script.

Good closings reference what was actually discussed:
  - "Really glad we got to talk through your time at [company] — that was a rich conversation."
  - "Thanks so much for being so candid today, {candidate_name}. That takes guts."
  - "It was genuinely great speaking with you. Take care, and I really do wish you all the best."

NEVER say "Interview complete." NEVER end abruptly. NEVER close coldly. The last thing a candidate hears from Ishita should leave them feeling respected and valued, regardless of how the interview went.

## ❌ WHAT YOU MUST NEVER DO
- **NEVER hallucinate** — Never invent, assume, or imply skills, roles, companies, or facts not stated in the provided resume/JD context. This is the most critical rule.
- Never say "As an AI", "I am a language model", or anything that breaks the human quality of this conversation.
- Never reveal AI report content, scoring numbers, or flags verbatim.
- Never ask multiple questions in one turn.
- Never be dismissive, condescending, sarcastic, or use unexplained jargon.
- Never use rigid or robotic phrases like "Before we dive in", "Moving on to", "Next question", "That concludes", "Let us now discuss".
- Never greet {candidate_name} again if they already said hello first.
- Never skip past a vague or unclear answer without gently asking for clarification.
- Never make a candidate feel judged, behind, or inadequate — even when probing a genuine gap.

## THE DEEPER TRUTH
The person you are speaking with today may be nervous. They may have prepared for weeks. They may be hoping this conversation changes something for them. Your job is not to catch them out or trip them up. It is to give them the best possible chance to show who they really are.

You represent this company's brand with every word you say. Candidates talk about their interview experiences — for better and for worse. Every conversation Ishita has should leave the candidate feeling, regardless of the outcome: "That was a genuinely good conversation. I felt heard. I felt respected."

The best interviews do not feel like interviews. They feel like a conversation that happened to matter. That is what you are here to create.
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

    if org_stt_provider == "SARVAM":
        if org_sarvam_stt_model is None:
            raise RuntimeError("DB config missing sarvamSttModel for SARVAM")
        stt_plugin = build_sarvam_stt(
            language=lang_codes["stt"], model=org_sarvam_stt_model
        )
    else:
        if org_deepgram_model is None:
            raise RuntimeError("DB config missing deepgramModel for DEEPGRAM")
        stt_plugin = build_stt(
            language_code=lang_codes["stt"], model=org_deepgram_model
        )

    if org_tts_provider == "SARVAM":
        if org_sarvam_model is None or org_sarvam_voice is None:
            raise RuntimeError("DB config missing sarvamModel/sarvamVoice for SARVAM")
        tts_plugin = build_sarvam_tts(
            language=lang_codes["tts"],
            model=org_sarvam_model,
            voice_id=org_sarvam_voice,
        )
        # Disable prewarm for Sarvam as it can cause stale/closing transport issues
        # on the first synthesis turn in some environments.
        pass
        # try:
        #     tts_plugin.prewarm()
        # except Exception:
        #     pass
    else:
        if org_cartesia_model is None or org_cartesia_voice is None:
            raise RuntimeError(
                "DB config missing cartesiaModel/cartesiaVoiceId for CARTESIA"
            )
        tts_plugin = build_tts(
            language=lang_codes["tts"],
            model=org_cartesia_model,
            voice_id=org_cartesia_voice,
        )

    if org_llm_provider == "SARVAM":
        llm_plugin = build_sarvam_llm(model=org_llm_model)
    else:
        llm_plugin = build_llm(model=org_llm_model, temperature=org_llm_temperature)

    session = AgentSession(
        vad=vad_instance,
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
        turn_handling=TurnHandlingOptions(
            endpointing=EndpointingOptions(
                min_delay=0.5,  # was 0.3 — wait longer before deciding the user stopped talking
                max_delay=1.2,  # was 0.8 — allow pauses mid-thought
                mode="dynamic",
            ),
            interruption=InterruptionOptions(
                enabled=True,
                resume_false_interruption=True,
                false_interruption_timeout=2.5,  # was 2.0 — more forgiving on brief cross-talk
            ),
        ),
        use_tts_aligned_transcript=False,
    )

    agent = Agent(instructions=system_prompt, chat_ctx=chat_ctx)

    participant: Optional[Any] = None
    disconnect_event = asyncio.Event()
    interview_finished_event = asyncio.Event()
    interview_marked_finished = False
    turn_count = 0           # counts assistant turns for state injection cadence
    last_injection_turn = 0  # tracks which turn last received a state injection
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
    def on_data_received(*event_args):
        nonlocal \
            interview_marked_finished, \
            last_out_of_screen_alert_at, \
            ready_signal_received_at
        try:
            raw_data = None

            if not event_args:
                return

            # Compatibility across LiveKit Python event shapes:
            # - bytes payload directly
            # - object with .data bytes field
            # - tuple with payload in any position
            for arg in event_args:
                if isinstance(arg, (bytes, bytearray)):
                    raw_data = bytes(arg)
                    break
                if isinstance(arg, memoryview):
                    raw_data = arg.tobytes()
                    break
                maybe = getattr(arg, "data", None)
                if isinstance(maybe, (bytes, bytearray)):
                    raw_data = bytes(maybe)
                    break
                if isinstance(maybe, memoryview):
                    raw_data = maybe.tobytes()
                    break

            if raw_data is None:
                logger.debug(
                    "data_received had no bytes payload",
                    extra={"arg_types": [type(a).__name__ for a in event_args]},
                )
                return

            payload = json.loads(raw_data.decode("utf-8"))
            if payload.get("type") == "user_ready":
                if not ready_event.is_set():
                    ready_signal_received_at = time.perf_counter()
                    logger.info(
                        f"Candidate is ready signal received (attempt={payload.get('attempt')})"
                    )
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
        except Exception as e:
            logger.debug(f"Ignored malformed data packet: {e}")
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
        nonlocal session_start_time, turn_count, last_injection_turn
        try:
            item = event.item
            role = getattr(item, "role", None)
            content = item.text_content

            if not content or not role:
                return

            # --- STT Spam / Hallucination Filter ---
            # Sarvam (and some Deepgram models) hallucinate the same word repeatedly
            # when they detect silence or background noise. Discard these before they
            # pollute the transcript or distort the LLM context.
            if role == "user":
                words = content.strip().split()
                if len(words) >= 10:
                    unique_words = set(w.lower().strip(".,!?") for w in words)
                    if len(unique_words) <= 3:
                        logger.warning(
                            f"[TRANSCRIPT] Discarding hallucinated STT spam ({len(words)} words, "
                            f"{len(unique_words)} unique): '{content[:60]}...'"
                        )
                        return

            speaker = "Interviewer" if role == "assistant" else "Candidate"
            append_transcript_line(speaker, content)
            logger.info(f"[TRANSCRIPT] {speaker}: {content[:60]}...")

            # --- Dynamic Interview State Injection (every 5 assistant turns) ---
            # Every 5 turns, a lightweight gpt-4o-mini call generates a coverage summary
            # and injects it as a system message so Ishita knows what she's covered and
            # what gaps remain — giving her a live "internal compass" without modifying
            # the base system prompt.
            if role == "assistant":
                turn_count += 1
                if turn_count % 5 == 0 and turn_count != last_injection_turn:
                    last_injection_turn = turn_count
                    lines_snap = list(transcript_lines)
                    current_turn = turn_count
                    q_list_snap = questions_list

                    async def _inject_state(
                        snap=lines_snap, q_list=q_list_snap, t=current_turn
                    ):
                        try:
                            oai_client = AsyncOpenAI()
                            state = await generate_interview_state_summary(
                                snap,
                                q_list,
                                candidate_name,
                                job_title,
                                oai_client,
                            )
                            if state:
                                # Remove old state injections — keep only the latest 2
                                state_msgs = [
                                    m
                                    for m in session.chat_ctx.messages
                                    if getattr(m, "role", "") == "system"
                                    and "[INTERVIEW STATE UPDATE" in (
                                        getattr(m, "content", "") or ""
                                    )
                                ]
                                if len(state_msgs) >= 2:
                                    for old_msg in state_msgs[:-1]:
                                        try:
                                            session.chat_ctx.messages.remove(old_msg)
                                        except (ValueError, AttributeError):
                                            pass

                                injection_text = (
                                    f"[INTERVIEW STATE UPDATE — Turn {t}]\n"
                                    f"{state}\n"
                                    "Use this to guide your next 3-4 exchanges. "
                                    "Do not reference this note aloud."
                                )
                                session.chat_ctx.add_message(
                                    role="system", content=injection_text
                                )
                                logger.info(
                                    f"[STATE_INJECT] Injected state at turn {t}: "
                                    f"{state[:80]}..."
                                )
                        except Exception as e:
                            logger.warning(
                                f"[STATE_INJECT] Injection failed at turn {t}: {e}"
                            )

                    asyncio.get_event_loop().create_task(_inject_state())

            # --- Periodic auto-save every 5 turns to prevent data loss ---
            if len(transcript_lines) > 0 and len(transcript_lines) % 5 == 0:
                start_t = session_start_time
                lines_snapshot = list(transcript_lines)
                app_id_snap = app_id

                async def _periodic_save():
                    try:
                        await persist_transcript(app_id_snap, lines_snapshot, start_t)
                        logger.info(
                            f"[TRANSCRIPT] Periodic auto-save at {len(lines_snapshot)} lines"
                        )
                    except Exception as save_err:
                        logger.warning(f"[TRANSCRIPT] Periodic save failed: {save_err}")

                asyncio.get_event_loop().create_task(_periodic_save())

        except Exception as e:
            logger.warning(f"[TRANSCRIPT] Event parse error: {e}")

    # --- Thinking Filler Logic ---
    # NOTE: session.say() fillers are intentionally disabled.
    # When filler audio and the LLM TTS reply fire at near-simultaneous times
    # (~700ms window), they create two competing audio streams which causes
    # voice breakup / choppy audio on the candidate's side.
    # The LLM pipeline already has low enough latency that fillers add more
    # harm (audio conflict) than benefit (perceived naturalness).
    filler_task: Optional[asyncio.Task] = None
    last_activity_at = time.monotonic()
    is_agent_speaking = False

    def reset_nudge_timer():
        nonlocal last_activity_at
        last_activity_at = time.monotonic()
        logger.debug("[NUDGE] Timer reset to zero")

    @session.on("user_speech_committed")
    def on_user_speech_committed(_msg):
        nonlocal filler_task
        if filler_task:
            filler_task.cancel()
            filler_task = None
        # Reset nudge timer on candidate speech
        reset_nudge_timer()

    @session.on("agent_speech_started")
    def on_agent_speech_started():
        nonlocal filler_task, is_agent_speaking
        is_agent_speaking = True
        if filler_task:
            filler_task.cancel()
            filler_task = None
        # Reset nudge timer when AI starts talking
        reset_nudge_timer()

    @session.on("agent_speech_committed")
    def on_agent_speech_committed(_msg):
        nonlocal is_agent_speaking
        is_agent_speaking = False
        # Restart nudge timer specifically when AI finishes talking
        reset_nudge_timer()
        logger.debug("[NUDGE] AI finished speaking; starting 30s countdown")

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

    # FIX: Reduced from 600s (10 mins) to 90s.
    # If nobody joins in 90 seconds, free the process slot so new interviews can start.
    # Previously, a no-show would block a process slot for 10 MINUTES, starving all other candidates.
    participant = await wait_for_human_participant(max_wait_seconds=90)
    if not participant:
        logger.warning(
            f"[TIMEOUT] No candidate joined room for app {app_id} within 90s. Releasing slot."
        )
        disconnect_event.set()
        try:
            await session.aclose()
        except Exception:
            pass
        return

    # PREWARM: Remove the wait for 'user_ready' signal. 
    # Greet the candidate as soon as they are physically in the room.
    if not disconnect_event.is_set():
        ready_signal_received_at = time.perf_counter()
        ready_event.set()
        logger.info(f"Pre-warming greeting for app {app_id} immediately after participant join")

    if ready_event.is_set() and not disconnect_event.is_set():
        session_start_time = time.time()

        # Dynamic, personalized, warm greeting — adapted per language
        # The greeting avoids robotic openers and uses natural warmth.
        WELCOME_MESSAGES = {
            "English": (
                f"Hey {candidate_name}, welcome! Really glad you could make it today. "
                f"I'm Ishita, and I'll be having a conversation with you about the {job_title} role. "
                f"How are you doing? How's the day been so far?"
            ),
        }
        welcome_text = WELCOME_MESSAGES.get(
            interview_lang,
            (
                f"Hey {candidate_name}, welcome and thanks for joining today. "
                f"I'm Ishita, and I'll be speaking with you about the {job_title} role. "
                f"Before we dive in — how are you doing? Ready to get started?"
            ),
        )

        # Mark as started in DB while greeting starts immediately.
        asyncio.create_task(mark_interview_started(app_id))
        # Stabilization delay: Give newly initialized plugins (especially Sarvam) 
        # a moment to reach a stable state before the first synthesis request.
        await asyncio.sleep(0.5)

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

            # Only deliver scripted welcome if the LLM hasn't already spoken
            # (prevents double-greeting when candidate says hello first)
            llm_already_spoke = any(
                line.startswith("Interviewer:") for line in transcript_lines
            )
            if llm_already_spoke:
                logger.info(
                    "[GREETING] LLM already responded to candidate — skipping scripted welcome to avoid double-greeting"
                )
            else:
                await session.say(welcome_text, allow_interruptions=False)
                logger.info("[GREETING] Welcome message delivered")
        except Exception as e:
            logger.error(f"[GREETING] Failed to deliver greeting: {e}")

    # Wait for either explicit finish signal OR disconnect OR hard timeout,
    # while also firing timed mid-session nudges (candidate-questions prompt, final goodbye).
    finished_task = asyncio.create_task(interview_finished_event.wait())
    disconnected_task = asyncio.create_task(disconnect_event.wait())
    total_seconds = time_limit_mins * 60

    # Timed intervention flags
    candidate_questions_asked = False

    # How many seconds before the end to trigger each nudge
    CANDIDATE_Q_TRIGGER_SECS = 150  # 2.5 minutes before end
    FINAL_THANKS_TRIGGER_SECS = 5  # 5 seconds before end

    session_loop_start = time.monotonic()

    while True:
        elapsed = time.monotonic() - session_loop_start
        remaining = total_seconds - elapsed

        if finished_task.done() or disconnected_task.done():
            break

        if remaining <= 0:
            break

        # --- 2-3 min remaining: ask if candidate has any questions ---
        if not candidate_questions_asked and remaining <= CANDIDATE_Q_TRIGGER_SECS:
            candidate_questions_asked = True
            candidate_q_text = (
                f"We are getting close to the end of our time, {candidate_name} \u2014 "
                "and before I let you go, I just want to check \u2014 is there anything on your mind? "
                "Anything you want to ask about the role or anything else?"
            )
            try:
                await session.say(candidate_q_text)
                logger.info("[TIMING] Candidate-questions nudge delivered")
            except Exception as e:
                logger.warning(
                    f"[TIMING] Failed to deliver candidate-questions nudge: {e}"
                )

        # --- 5 seconds remaining: warm thank-you ---
        if remaining <= FINAL_THANKS_TRIGGER_SECS:
            break

        # --- Smart Inactivity Nudge ---
        # If the candidate hasn't responded for 30s after Ishita finishes speaking,
        # fire a warm, unhurried check-in.
        if not is_agent_speaking and (time.monotonic() - last_activity_at) > 30:
            nudges = [
                f"Hey {candidate_name}, just checking in — I am still here whenever you are ready. No rush at all.",
                f"Take your time, {candidate_name} — I am right here. Just let me know when you would like to continue.",
                f"I'm still with you, {candidate_name} — did you want to pick up from where we left off, or shall I rephrase that?",
                f"No pressure at all, {candidate_name} — just checking you are still there. Whenever you are ready.",
            ]
            import random
            nudge_text = random.choice(nudges)
            try:
                # Reset before say() to prevent immediate re-trigger if tts is slow
                reset_nudge_timer()
                asyncio.get_event_loop().create_task(session.say(nudge_text))
                logger.info(f"[NUDGE] Inactivity nudge delivered: '{nudge_text[:40]}...'")
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver nudge: {e}")

        await asyncio.sleep(1)

    # Check if we exited because of finish/disconnect or because time ran out
    time_expired = not finished_task.done() and not disconnected_task.done()

    if time_expired:
        goodbye_text = (
            f"Thanks so much for your time today, {candidate_name} \u2014 "
            "it was genuinely great speaking with you. Take care, and all the best!"
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

    # Cancel pending tasks
    for task in [finished_task, disconnected_task]:
        if not task.done():
            task.cancel()

    # --- Grace Period: Wait for final STT results to arrive (Deepgram/LiveKit tail) ---
    logger.info(
        f"Interview ended (finished={finished_task.done()}, time_expired={time_expired}). Waiting 5s for final transcripts..."
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
    if finished_task.done():
        await update_interview_status(app_id)
        # ⚡ Trigger Pinecone Sync immediately
        await notify_sync_engine(app_id)

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
