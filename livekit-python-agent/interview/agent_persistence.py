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
import datetime
import decimal
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
    _DB_POOL,
    _DB_POOL_INIT_TASK,
    logger,
    set_db_pool,
)

# ===============================================================================
# LAYER 1 -- DatabasePool singleton
# ===============================================================================
class DatabasePool:
    """Async singleton wrapper around asyncpg.Pool with lazy init and health-check."""
    _pool: ClassVar[asyncpg.Pool | None] = None
    _init_task: ClassVar[asyncio.Task | None] = None
    _lock: ClassVar[asyncio.Lock | None] = None
    _loop: ClassVar[asyncio.AbstractEventLoop | None] = None
    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._lock is None:
            cls._lock = asyncio.Lock()
        return cls._lock
    @classmethod
    def _reset(cls) -> None:
        """Forcefully discard the current pool state. Safe to call without awaiting."""
        if cls._pool is not None:
            try:
                cls._pool.terminate()
            except Exception:
                pass
        cls._pool = None
        cls._init_task = None
        cls._lock = None
        cls._loop = None
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
        # asyncpg pools are bound to the event loop they were created on. LiveKit runs
        # each job in a fresh event loop within the same process, so when a second job
        # arrives the old pool is stale. Detect this early and reset before any acquire()
        # attempt, which would otherwise raise "Future attached to a different loop".
        try:
            current_loop = asyncio.get_running_loop()
            if cls._loop is not None and cls._loop is not current_loop:
                logger.info("[DB_POOL] Event loop changed — resetting pool for new job")
                cls._reset()
        except RuntimeError:
            pass
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
                cls._lock = None
            if cls._init_task is not None and not cls._init_task.done():
                cls._pool = await cls._init_task
                return cls._pool
            cls._pool = None
            cls._init_task = asyncio.create_task(cls._create())
            try:
                cls._pool = await cls._init_task
                cls._loop = asyncio.get_running_loop()
                set_db_pool(cls._pool)
                return cls._pool
            except Exception:
                cls._init_task = None
                raise
class _SafeJSONEncoder(json.JSONEncoder):
    """Handles Decimal and datetime types that asyncpg may return from DB reads.
    Without this, json.dumps raises TypeError and the entire DB write is silently dropped (EC-10).
    """
    def default(self, obj: object) -> object:
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        return super().default(obj)
def _safe_json_dumps(obj: object) -> str:
    """Serialize to JSON with safe type handling. Validates round-trip before returning
    so any remaining non-serializable type surfaces immediately, not silently in the DB write."""
    payload = json.dumps(obj, cls=_SafeJSONEncoder)
    json.loads(payload)  # round-trip check: raises ValueError if encoder produced invalid JSON
    return payload
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
           d."interviewQuestions",
           COALESCE(d."voiceId", o."voiceId") AS "voiceId",
           COALESCE(d."aiName", 'Ishitha') AS "aiName", o.name AS "orgName",
           o."proctoringSignals",
           o."sttModel", o."ttsProvider", o."ttsModel",
           o."llmInterviewLive", o."llmInterviewEval", o."llmInterviewBrief", o."llmInterviewReport",
           i.status AS "interviewStatus",
           i."interviewBrief"
    FROM "Application" a
    JOIN "Drive" d ON a."driveId" = d.id
    LEFT JOIN "Organization" o ON d."orgId" = o.id
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
                "language":           "English",
                "timeLimit":          FIXED_INTERVIEW_DURATION_MINUTES,
                "voiceId":              row["voiceId"],
                "aiName":               row["aiName"],
                "proctoringSignals":    row["proctoringSignals"],
                "interviewQuestions":   row["interviewQuestions"],
                "interviewStatus":      row["interviewStatus"],
                "interviewBrief":       row["interviewBrief"],  # None if not yet generated
                # AI model config -- all from org DB, no hardcoded defaults
                "sttModel":             row["sttModel"],
                "ttsProvider":          row["ttsProvider"],
                "ttsModel":             row["ttsModel"],
                "llmInterviewLive":     row["llmInterviewLive"],
                "llmInterviewEval":     row["llmInterviewEval"],
                "llmInterviewBrief":    row["llmInterviewBrief"],
                "llmInterviewReport":   row["llmInterviewReport"],
            }
        except Exception as e:
            last_error = e
            logger.error(f"Database error during context fetch (attempt {attempt}/5): {e}")
            if "no interview context found in db" in str(e).lower():
                break
            _err_s = str(e).lower()
            if "executor shutdown" in _err_s or "different loop" in _err_s or "closed in the middle" in _err_s:
                DatabasePool._reset()
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
                # Read existing browser-side proctoring events so the final save
                # does NOT overwrite them with an empty array (the old code only
                # wrote proctor_report["events"] which was always [] since the
                # eval pipeline never produces signal_events).
                browser_events: list = []
                try:
                    row = await conn.fetchrow(
                        'SELECT "integritySignals" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                        app_id,
                    )
                    if row and row["integritySignals"]:
                        raw = row["integritySignals"]
                        browser_events = raw if isinstance(raw, list) else (
                            json.loads(raw) if isinstance(raw, str) else []
                        )
                except Exception:
                    browser_events = []
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
                    json.dumps(browser_events),
                    app_id,
                )
                logger.info(f"[TRANSCRIPT] Final save {len(transcript_lines)} lines, {duration}s, {len(browser_events)} integrity events, status={final_status} for {app_id}")
    except Exception as e:
        logger.error(f"[TRANSCRIPT] DB save failed: {e}")
async def mark_interview_started(app_id: str) -> None:
    """Mark interview as IN_PROGRESS.
    Only updates rows whose current status is not already IN_PROGRESS or COMPLETED.
    Returns normally on success; RAISES on DB failure so the caller can abort startup.
    Raising here prevents a second agent from launching when the first one's write failed.
    """
    if not DATABASE_URL:
        return
    pool = await DatabasePool.get()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE "Interview"
               SET status = $1, "startedAt" = NOW(), "updatedAt" = NOW()
               WHERE "applicationId" = $2
                 AND status NOT IN ('IN_PROGRESS', 'COMPLETED')""",
            "IN_PROGRESS", app_id,
        )
        # result is a status string like "UPDATE 1" or "UPDATE 0"
        updated_rows = int(result.split()[-1]) if result else 0
        if updated_rows == 0:
            raise RuntimeError(
                f"[INTERVIEW] Cannot start app {app_id}: already IN_PROGRESS or COMPLETED "
                f"(another agent instance may be running). Aborting to prevent duplicate agents."
            )
        await conn.execute(
            'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
            "IN_PROGRESS", app_id,
        )
    logger.info(f"[INTERVIEW] App {app_id} marked as IN_PROGRESS.")
async def mark_interview_failed(app_id: str, reason: str = "technical_error") -> None:
    """Mark interview and application as FAILED in DB.
    Called whenever the agent crashes before a normal completion so the Drive
    candidates page shows FAILED instead of hanging in IN_PROGRESS forever.
    Silently no-ops if DATABASE_URL is missing (offline/test environment).
    """
    if not DATABASE_URL:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET status = 'FAILED', "updatedAt" = NOW()
                   WHERE "applicationId" = $1""",
                app_id,
            )
            await conn.execute(
                """UPDATE "Application"
                   SET "interviewStatus" = 'FAILED', "updatedAt" = NOW()
                   WHERE id = $1""",
                app_id,
            )
        logger.info(f"[INTERVIEW] App {app_id} marked as FAILED (reason={reason})")
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to mark app {app_id} as FAILED: {e}")
async def persist_latency_signals(app_id: str, answer_scores: list[dict]) -> None:
    """Compute a single latency_mismatch event with per-turn latencies (each
    tagged with the question it belongs to) and inter-turn gaps, then append
    to integritySignals.

    The event has the shape:
      {"eventType": "latency_mismatch", "severity": "medium",
       "timestamp": <now_ms>,
       "latency_sec": {"turn_1": 2.5, "turn_2": 4.2, ...},
       "turns": [{"turn": 1, "question": "...", "latency_sec": 2.5, "gap_before_sec": null}, ...]}
    """
    if not app_id or not DATABASE_URL or not answer_scores:
        return
    scored = [
        s for s in answer_scores
        if not s.get("is_warmup") and s.get("turn") and s.get("response_latency_sec") is not None
        and s["response_latency_sec"] > 0
    ]
    scored.sort(key=lambda s: s["turn"])
    per_turn: dict[str, float] = {}
    turns: list[dict] = []
    _prev_wall_ms: Optional[int] = None
    for s in scored:
        turn = int(s["turn"])
        lat = round(float(s["response_latency_sec"]), 1)
        per_turn[f"turn_{turn}"] = lat
        wall_ms = s.get("question_asked_at_wall_ms") or 0
        gap_before_sec = (
            round((wall_ms - _prev_wall_ms) / 1000, 1)
            if wall_ms and _prev_wall_ms and wall_ms > _prev_wall_ms
            else None
        )
        if wall_ms:
            _prev_wall_ms = wall_ms
        turns.append({
            "turn": turn,
            "question": str(s.get("question", "")).strip()[:200],
            "latency_sec": lat,
            "gap_before_sec": gap_before_sec,
        })
    if not per_turn:
        return
    latency_event = {
        "eventType":   "latency_mismatch",
        "severity":    "medium",
        "timestamp":   int(time.time() * 1000),
        "latency_sec": per_turn,
        "turns":       turns,
    }
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                'SELECT "integritySignals" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                app_id,
            )
            existing: list = []
            if row and row["integritySignals"]:
                raw = row["integritySignals"]
                existing = raw if isinstance(raw, list) else (
                    json.loads(raw) if isinstance(raw, str) else []
                )
            merged = existing + [latency_event]
            await conn.execute(
                """UPDATE "Interview" SET "integritySignals" = $1, "updatedAt" = NOW()
                   WHERE "applicationId" = $2""",
                json.dumps(merged),
                app_id,
            )
        logger.info(
            "[LATENCY] Appended latency_mismatch event (%d turns) for %s (total integrity=%d)",
            len(per_turn), app_id, len(merged),
        )
    except Exception as e:
        logger.error("[LATENCY] Failed to persist latency_mismatch event for %s: %s", app_id, e)

async def persist_session_fingerprint(app_id: str) -> None:
    """Compare all ip_registered events in integritySignals and emit a
    session_fingerprint violation if the browser fingerprint changed mid-session
    (device swap, VM detection, VPN geolocation jump, etc.).

    If fewer than 2 ip_registered events exist, this is a no-op.
    """
    if not app_id or not DATABASE_URL:
        return
    try:
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                'SELECT "integritySignals" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                app_id,
            )
            if not row or not row["integritySignals"]:
                return
            raw = row["integritySignals"]
            events: list = raw if isinstance(raw, list) else (
                json.loads(raw) if isinstance(raw, str) else []
            )
            ip_events = [e for e in events if e.get("eventType") == "ip_registered"]
            if len(ip_events) < 2:
                return
            if any(e.get("eventType") == "session_fingerprint" for e in events):
                return
            first_fp = ip_events[0].get("metadata", {}).get("fingerprint", {})
            for later in ip_events[1:]:
                later_fp = later.get("metadata", {}).get("fingerprint", {})
                if not first_fp or not later_fp:
                    continue
                deltas: dict[str, str] = {}
                if first_fp.get("platform") and later_fp.get("platform") and first_fp["platform"] != later_fp["platform"]:
                    deltas["platform"] = f"{first_fp['platform']} \u2192 {later_fp['platform']}"
                if first_fp.get("userAgent") and later_fp.get("userAgent") and first_fp["userAgent"] != later_fp["userAgent"]:
                    deltas["userAgent"] = "changed"
                if first_fp.get("screen") and later_fp.get("screen") and first_fp["screen"] != later_fp["screen"]:
                    deltas["screen"] = f"{first_fp['screen']} \u2192 {later_fp['screen']}"
                if first_fp.get("canvasHash") and later_fp.get("canvasHash") and first_fp["canvasHash"] != later_fp["canvasHash"]:
                    deltas["canvasFingerprint"] = "changed"
                if first_fp.get("timezone") and later_fp.get("timezone") and first_fp["timezone"] != later_fp["timezone"]:
                    deltas["timezone"] = f"{first_fp['timezone']} \u2192 {later_fp['timezone']}"
                screen_s = (later_fp.get("screen") or "").startswith("1024x768")
                if screen_s:
                    deltas["vm_screen"] = later_fp["screen"]
                hw = later_fp.get("hardwareConcurrency")
                if hw is not None:
                    try:
                        if int(hw) <= 1:
                            deltas["vm_cpu"] = str(hw)
                    except (ValueError, TypeError):
                        pass
                if not deltas:
                    continue
                if "platform" in deltas or "userAgent" in deltas or "screen" in deltas:
                    severity = "high"
                elif "timezone" in deltas or "canvasFingerprint" in deltas:
                    severity = "medium"
                else:
                    severity = "medium"
                reasons = "; ".join(f"{k}={v}" for k, v in deltas.items())
                fingerprint_event = {
                    "eventType": "session_fingerprint",
                    "severity": severity,
                    "timestamp": int(time.time() * 1000),
                    "reason": f"Session fingerprint changed: {reasons}",
                    "metadata": {
                        "fingerprint_initial": first_fp,
                        "fingerprint_later": later_fp,
                        "deltas": deltas,
                    },
                }
                events.append(fingerprint_event)
                await conn.execute(
                    """UPDATE "Interview" SET "integritySignals" = $1, "updatedAt" = NOW()
                       WHERE "applicationId" = $2""",
                    json.dumps(events),
                    app_id,
                )
                logger.info(
                    "[FINGERPRINT] Appended session_fingerprint event (%s) for %s (total integrity=%d, reasons=%s)",
                    severity, app_id, len(events), reasons,
                )
                break
    except Exception as e:
        logger.error("[FINGERPRINT] Failed to check session fingerprint for %s: %s", app_id, e)

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
            "response_latency_sec":        float(s.get("response_latency_sec") or 0.0),
        }
        for i, s in enumerate(answer_scores, 1)
    ]
    # Serialize once outside the retry loop -- if this raises (EC-10), fail immediately
    # before any DB attempt. A serialization bug is not transient; retrying won't help.
    try:
        payload = _safe_json_dumps(normalized)
    except (TypeError, ValueError) as enc_err:
        logger.error(
            f"[SCORE] JSON serialization failed for {app_id} — scores NOT saved. "
            f"Non-serializable value in answer_scores: {enc_err}"
        )
        return
    last_error: Exception | None = None
    for attempt in range(1, 4):   # 3 attempts: immediate, +0.5s, +1.0s
        try:
            pool = await DatabasePool.get()
            async with pool.acquire() as conn:
                await conn.execute(
                    """UPDATE "Interview"
                       SET "questionByQuestionAnalysis" = $1::jsonb, "updatedAt" = NOW()
                       WHERE "applicationId" = $2""",
                    payload, app_id,
                )
            logger.info(f"[SCORE] Saved {len(normalized)} question-by-question rows for {app_id}")
            return  # success
        except Exception as e:
            last_error = e
            logger.warning(
                f"[SCORE] DB write attempt {attempt}/3 failed for {app_id}: {e}"
            )
            _err_s = str(e).lower()
            if "executor shutdown" in _err_s or "different loop" in _err_s or "closed in the middle" in _err_s:
                DatabasePool._reset()
            if attempt < 3:
                await asyncio.sleep(0.5 * attempt)   # 0.5s then 1.0s
    # All 3 attempts exhausted -- raise so spawn_background_task logs the exception
    # with full traceback and ops can see it. Score data is NOT silently lost.
    raise RuntimeError(
        f"[SCORE] All 3 DB write attempts failed for {app_id}: {last_error}"
    )
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
# ===============================================================================
# Re-exports -- report pipeline
# ===============================================================================
from interview.report_pipeline import (  # noqa: E402
    generate_interview_report,
    generate_interview_summary,
    LLMEvalResponse,
    LLMSkillsResponse,
    ReportState,
)
