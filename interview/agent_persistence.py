"""
agent_persistence.py -- Production-level interview data persistence layer.
Architecture (4 layers):
  1. DatabasePool         -- singleton asyncpg pool with health-check
  2. Domain Models        -- Pydantic typed models for DB + LLM responses
  3. InterviewRepository  -- thin async DB wrappers, no business logic

Report pipeline (LangGraph + LLM calls) lives in interview/report_pipeline.py.
External contracts (agent_runtime.py imports) are preserved exactly.
"""
from __future__ import annotations
import asyncio
import json
import os
import time
from typing import ClassVar, Optional
import asyncpg
from typing_extensions import TypedDict
from urllib.parse import parse_qsl, urlencode, urlunparse, urlparse
from interview.agent_utils import _coerce_jsonish
from interview.agent_runtime_support import (
    DATABASE_URL,
    FIXED_INTERVIEW_DURATION_MINUTES,
    LLM_MODEL,
    _DB_POOL,
    _DB_POOL_INIT_TASK,
    logger,
    set_db_pool,
)

# ═══════════════════════════════════════════════════════════════════════════════
# LAYER 1 -- DatabasePool singleton
# ═══════════════════════════════════════════════════════════════════════════════
class DatabasePool:
    """Async singleton wrapper around asyncpg.Pool with lazy init and health-check."""
    _pool: ClassVar[asyncpg.Pool | None] = None
    _init_task: ClassVar[asyncio.Task | None] = None
    _lock: ClassVar[asyncio.Lock | None] = None
    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._lock is None:
            cls._lock = asyncio.Lock()
        return cls._lock
    @classmethod
    def normalize_dsn(cls, conn_str: str) -> str:
        if conn_str.startswith("postgres://"):
            conn_str = conn_str.replace("postgres://", "postgresql://", 1)
        parsed = urlparse(conn_str)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        for key in ("pgbouncer", "connection_limit", "pool_timeout", "schema"):
            query.pop(key, None)
        return urlunparse(parsed._replace(query=urlencode(query)))
    @classmethod
    async def _create(cls) -> asyncpg.Pool:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not set")
        async def _init_conn(conn: asyncpg.Connection) -> None:
            await conn.execute("SET statement_timeout = '30s'")
        return await asyncpg.create_pool(
            cls.normalize_dsn(DATABASE_URL),
            ssl=False,
            statement_cache_size=0,
            min_size=1,
            max_size=5,
            max_inactive_connection_lifetime=60.0,
            init=_init_conn,
        )
    @classmethod
    async def _is_healthy(cls, pool: asyncpg.Pool) -> bool:
        if pool._closed:
            return False
        try:
            async with pool.acquire(timeout=2.0) as conn:
                await conn.fetchval("SELECT 1")
            return True
        except Exception:
            return False
    @classmethod
    async def get(cls) -> asyncpg.Pool:
        global _DB_POOL, _DB_POOL_INIT_TASK
        if cls._pool is not None and not cls._pool._closed:
            return cls._pool
        async with cls._get_lock():
            if cls._pool is not None and not cls._pool._closed:
                if await cls._is_healthy(cls._pool):
                    return cls._pool
                try:
                    await cls._pool.close()
                except Exception:
                    pass
                cls._pool = None
                cls._init_task = None
                cls._lock = None  # reset for current event loop
            if cls._init_task is not None and not cls._init_task.done():
                cls._pool = await cls._init_task
                return cls._pool
            cls._pool = None
            cls._init_task = asyncio.create_task(cls._create())
            try:
                cls._pool = await cls._init_task
                set_db_pool(cls._pool)  # keep module-level ref in sync
                return cls._pool
            except Exception:
                cls._init_task = None
                raise
# Public aliases (preserve agent_runtime.py imports)
async def get_db_pool() -> asyncpg.Pool:
    return await DatabasePool.get()
async def _create_db_pool() -> asyncpg.Pool:
    return await DatabasePool._create()
def normalize_postgres_dsn(conn_str: str) -> str:
    return DatabasePool.normalize_dsn(conn_str)
def _build_jd_from_extracted(extracted_json: str | None) -> str:
    if not extracted_json:
        return ""
    try:
        data  = json.loads(extracted_json) if isinstance(extracted_json, str) else extracted_json
        parts = []
        if data.get("role_summary"):
            parts.append(f"Description: {data['role_summary']}")
        if data.get("responsibilities"):
            r = data["responsibilities"]
            parts.append("Responsibilities:\n" + ("\n".join(f"- {x}" for x in r) if isinstance(r, list) else str(r)))
        if data.get("requirements"):
            req = data["requirements"]
            parts.append("Requirements:\n" + ("\n".join(f"- {x}" for x in req) if isinstance(req, list) else str(req)))
        if data.get("skills"):
            s = data["skills"]
            parts.append("Skills: " + (", ".join(s) if isinstance(s, list) else str(s)))
        if data.get("experience"):
            parts.append(f"Experience: {data['experience']}")
        return "\n\n".join(parts)
    except Exception:
        return ""
async def get_interview_context(app_id: str) -> dict:
    """Fetch candidate and JD context from PostgreSQL via asyncpg (5-attempt retry)."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    _QUERY = """
    SELECT a."fullName", a."resumeText", a."resumeData", d.title, d.role AS "role",
           d."extractedDetails", d."screeningCriteria", d."orgId" AS "orgId",
           d."interviewLanguage", d."interviewQuestions",
           COALESCE(d."voiceId", o."voiceId") AS "voiceId",
           COALESCE(d."aiName", 'Ishitha') AS "aiName", o.name AS "orgName",
           o."deepgramModel", o."proctoringSignals",
           ev.provider AS "voiceProvider", ev.model AS "voiceModel",
           i.status AS "interviewStatus"
    FROM "Application" a
    JOIN "Drive" d ON a."driveId" = d.id
    LEFT JOIN "Organization" o ON d."orgId" = o.id
    LEFT JOIN "EngineVoice" ev ON ev.id = COALESCE(d."voiceId", o."voiceId")
    LEFT JOIN "Interview" i ON i."applicationId" = a.id
    WHERE a.id = $1
    LIMIT 1
    """
    last_error: Exception | None = None
    for attempt in range(1, 6):
        try:
            pool = await DatabasePool.get()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(_QUERY, app_id)
            if not row:
                raise RuntimeError(f"No interview context found in DB for application {app_id}")
            return {
                "fullName":           row["fullName"],
                "resumeText":         row["resumeText"],
                "resumeData":         row["resumeData"],
                "extractedDetails":   row["extractedDetails"],
                "screeningCriteria":  row["screeningCriteria"],
                "jobTitle":           row["role"] or row["title"],
                "driveTitle":         row["title"],
                "jd":                 _build_jd_from_extracted(row["extractedDetails"]),
                "orgId":              row["orgId"],
                "orgName":            row["orgName"],
                "language":           row["interviewLanguage"],
                "timeLimit":          FIXED_INTERVIEW_DURATION_MINUTES,
                "voiceId":            row["voiceId"],
                "voiceProvider":      row["voiceProvider"],
                "voiceModel":         row["voiceModel"],
                "aiName":             row["aiName"],
                "deepgramModel":      row["deepgramModel"],
                "proctoringSignals":  row["proctoringSignals"],
                "interviewQuestions": row["interviewQuestions"],
                "interviewStatus":    row["interviewStatus"],
            }
        except Exception as e:
            last_error = e
            logger.error(f"Database error during context fetch (attempt {attempt}/5): {e}")
            if "no interview context found in db" in str(e).lower():
                break
            if "executor shutdown" in str(e).lower():
                DatabasePool._pool = None
                DatabasePool._init_task = None
            if attempt < 5:
                await asyncio.sleep(0.4 * attempt)
    raise RuntimeError(f"Failed to fetch interview context from DB: {last_error}")
async def persist_transcript(
    app_id: str,
    transcript_lines: list,
    start_time: Optional[float],
    proctoring_data: Optional[dict] = None,
    final_status: str = "COMPLETED",
    partial: bool = False,
) -> None:
    """Save transcript, duration, and proctoring report to Interview table.
    partial=True -> only update transcript/duration/turns (no status change).
    partial=False -> full update including status and completedAt.
    """
    if not transcript_lines and final_status != "NO_SHOW":
        logger.info("[TRANSCRIPT] No lines captured - skipping save to avoid overwriting existing data")
        return
    if not DATABASE_URL:
        logger.warning("[TRANSCRIPT] No DATABASE_URL - skipping save")
        return
    full_text      = "\n".join(transcript_lines) if transcript_lines else ""
    duration       = int(time.time() - start_time) if start_time else 0
    proctor_report = None
    if proctoring_data:
        proctor_report = {
            "events":         proctoring_data.get("events", []),
            "inconsistencies":proctoring_data.get("inconsistencies", []),
        }
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            if partial:
                await conn.execute(
                    """UPDATE "Interview" SET
                         "interviewTranscript" = $1,
                         "interviewDuration"   = $2,
                         "updatedAt"           = NOW()
                       WHERE "applicationId" = $3""",
                    full_text, duration, app_id,
                )
                logger.info(f"[TRANSCRIPT] Partial save {len(transcript_lines)} lines, {duration}s for {app_id}")
            else:
                await conn.execute(
                    """UPDATE "Interview" SET
                         "interviewTranscript" = $1,
                         "interviewDuration"   = $2,
                         status                = $3,
                         "integritySignals"    = $4,
                         "completedAt"         = NOW(),
                         "updatedAt"           = NOW()
                       WHERE "applicationId" = $5""",
                    full_text, duration, final_status,
                    json.dumps([
                        ev for ev in (proctor_report.get("events", []) if proctor_report else [])
                        if ev.get("eventType") or ev.get("type")
                    ]),
                    app_id,
                )
                logger.info(f"[TRANSCRIPT] Final save {len(transcript_lines)} lines, {duration}s, status={final_status} for {app_id}")
    except Exception as e:
        logger.error(f"[TRANSCRIPT] DB save failed: {e}")
async def mark_interview_started(app_id: str) -> None:
    if not DATABASE_URL:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "Interview" SET status = $1, "startedAt" = NOW() WHERE "applicationId" = $2',
                "IN_PROGRESS", app_id,
            )
            await conn.execute(
                'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
                "IN_PROGRESS", app_id,
            )
        logger.info(f"[INTERVIEW] App {app_id} marked as IN_PROGRESS.")
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update application status to started: {e}")
async def persist_question_by_question_analysis(app_id: str, answer_scores: list[dict]) -> None:
    """Save full turn-by-turn interview analysis to Interview.questionByQuestionAnalysis JSONB."""
    if not app_id or not DATABASE_URL or not answer_scores:
        return
    normalized = [
        {
            "turn":                        int(s.get("turn", i) or i),
            "ai_question":                 str(s.get("question", "") or "").strip(),
            "candidate_answer":            str(s.get("answer",   "") or "").strip(),
            "score_breakdown": {
                "clarity":    int(s.get("clarity",    0) or 0),
                "depth":      int(s.get("depth",      0) or 0),
                # eval_pipeline returns specificity/grounding; fluency/confidence are aliases
                "fluency":    int(s.get("fluency",    0) or s.get("specificity", 0) or 0),
                "confidence": int(s.get("confidence", 0) or s.get("grounding",   0) or 0),
            },
            "overall":                     float(s.get("overall", 0) or 0),
            "signals":                     list(s.get("signals",  []) or []),
            "concerns":                    list(s.get("concerns", []) or []),
            "topic":                       str(s.get("topic",     "") or ""),
            "topic_saturation_score":      float(s.get("topic_saturation_score",     0) or 0),
            "topic_saturation_threshold":  float(s.get("topic_saturation_threshold", 0) or 0),
            "is_warmup":                   bool(s.get("is_warmup", False)),
        }
        for i, s in enumerate(answer_scores, 1)
    ]
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "questionByQuestionAnalysis" = $1::jsonb, "updatedAt" = NOW()
                   WHERE "applicationId" = $2""",
                json.dumps(normalized), app_id,
            )
        logger.info(f"[SCORE] Saved {len(normalized)} question-by-question rows for {app_id}")
    except Exception as e:
        logger.error(f"[SCORE] Failed to persist question-by-question analysis for {app_id}: {e}")
async def persist_answer_scores(app_id: str, answer_scores: list[dict]) -> None:
    """Backward-compatible wrapper."""
    await persist_question_by_question_analysis(app_id, answer_scores)
async def update_interview_status(app_id: str, duration_seconds: Optional[float] = None) -> None:
    """Mark the application as COMPLETED and trigger quota deduction via billing.py."""
    if not DATABASE_URL:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET status = 'COMPLETED', "completedAt" = NOW(), "updatedAt" = NOW()
                   WHERE "applicationId" = $1""",
                app_id,
            )
            await conn.execute(
                """UPDATE "Application"
                   SET "interviewStatus" = 'COMPLETED', "updatedAt" = NOW()
                   WHERE id = $1""",
                app_id,
            )
            if duration_seconds:
                await conn.execute(
                    """UPDATE "Interview"
                       SET "recording" = jsonb_set(
                             COALESCE("recording", '{}'::jsonb),
                             '{durationSec}',
                             to_jsonb($1::integer),
                             true
                           ),
                           "interviewDuration" = $2,
                           "updatedAt" = NOW()
                       WHERE "applicationId" = $3""",
                    int(duration_seconds), int(duration_seconds), app_id,
                )
        logger.info(f"[INTERVIEW] App {app_id} marked as COMPLETED (dur={duration_seconds}s)")
        from billing.billing import deduct_interview_quota  # noqa: PLC0415
        await deduct_interview_quota(app_id, duration_seconds)
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update interview status for {app_id}: {e}")
# ═══════════════════════════════════════════════════════════════════════════════
# Re-exports — report pipeline
# ═══════════════════════════════════════════════════════════════════════════════
from interview.report_pipeline import (  # noqa: E402
    generate_interview_report,
    generate_interview_summary,
    LLMEvalResponse,
    LLMSkillsResponse,
    ReportState,
)
