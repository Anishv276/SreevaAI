"""
interview/generate_brief.py
============================
Background worker entry point for pre-generating the InterviewBrief at slot confirmation.

Architecture:
  - Pydantic models  : typed I/O contracts at every stage boundary
  - OOP              : BriefRepository (DB), BriefPipeline (orchestrator)
  - LangGraph        : 4-node pipeline
        fetch_data → classify_band → generate_llm_brief → persist_brief
  - DSA              : deduplication via ordered set (dict-as-ordered-set pattern)

This script is ONLY called for real candidates who booked a slot.
Test interviews always generate the brief live inside agent_runtime.py.

Usage (called by worker.ts):
    python interview/generate_brief.py <applicationId>

Exit codes:
    0  — success, brief written to DB
    1  — fatal error (logged to stderr, job will be retried by BullMQ)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import asyncpg
from langgraph.graph import END, START, StateGraph
from openai import AsyncOpenAI
from pydantic import BaseModel, Field, model_validator
from typing_extensions import TypedDict

# Ensure the repository root is importable when called from worker.ts
_repo_root = Path(__file__).resolve().parents[1]
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from interview.band_classifier import classify_band
from interview.interview_brief import InterviewBrief, generate_interview_brief

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [BRIEF-WORKER] %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger("brief-worker")

# ---------------------------------------------------------------------------
# Pydantic I/O models — typed contracts at every boundary
# ---------------------------------------------------------------------------

class ApplicationRow(BaseModel):
    """Validated DB row fetched for the application."""
    applicationId: str
    fullName: str
    resumeData: Any = None
    role: Optional[str] = None
    title: Optional[str] = None
    extractedDetails: Any = None
    interviewQuestions: Any = None
    llmInterviewBrief: Optional[str] = None

    @model_validator(mode="after")
    def _resolve_job_title(self) -> "ApplicationRow":
        """Ensure at least one of role/title is populated."""
        if not self.role and not self.title:
            logger.warning(
                "[ROW] Both role and title are empty for application %s",
                self.applicationId,
            )
        return self

    @property
    def job_title(self) -> str:
        return (self.role or self.title or "").strip()

    @property
    def llm_model(self) -> str:
        return (self.llmInterviewBrief or "gpt-4.1").strip()

    @property
    def resume_json(self) -> dict:
        return _coerce_dict(self.resumeData)

    @property
    def jd_data(self) -> dict:
        return _coerce_dict(self.extractedDetails)

    @property
    def custom_questions(self) -> list[str]:
        raw = self.interviewQuestions
        if raw is None:
            return []
        if isinstance(raw, list):
            return [str(q).strip() for q in raw if str(q).strip()]
        try:
            parsed = json.loads(str(raw))
            if isinstance(parsed, list):
                return [str(q).strip() for q in parsed if str(q).strip()]
        except Exception:
            pass
        return []


class BriefWorkerResult(BaseModel):
    """Output contract for the pipeline — what gets printed to stdout."""
    success: bool
    applicationId: str
    elapsed_sec: float = 0.0
    band: Optional[str] = None
    anchor: Optional[str] = None
    topics: int = 0
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# LangGraph state — typed dict passed through each node
# ---------------------------------------------------------------------------

class BriefWorkerState(TypedDict):
    application_id: str
    # fetch_data output
    row: Optional[ApplicationRow]
    # classify_band output
    band_seed: str
    total_years: float
    # generate_llm_brief output
    brief: Optional[InterviewBrief]
    # timing
    t_start: float
    t_fetch_done: float
    t_llm_done: float
    # error propagation (DSA: sentinel value pattern)
    error: Optional[str]


# ---------------------------------------------------------------------------
# OOP: BriefRepository — all DB operations in one class
# ---------------------------------------------------------------------------

class BriefRepository:
    """Handles all Postgres operations for brief generation.

    Uses asyncpg directly (same as agent_persistence.py) — no ORM overhead
    for a single-shot background script.
    """

    _FETCH_QUERY = """
    SELECT
        a.id                                        AS "applicationId",
        a."candidateFullName"                       AS "fullName",
        a."resumeParsedData"                        AS "resumeData",
        d."jobRole"                                 AS "role",
        d."title",
        d."jdExtractedDetails"                      AS "extractedDetails",
        d."aiGeneratedInterviewQuestions"           AS "interviewQuestions",
        o."llmInterviewBrief"
    FROM "Application" a
    JOIN "Job" d ON a."jobId" = d.id
    LEFT JOIN "OrganizationDetails" o ON d."organizationId" = o.id
    WHERE a.id = $1
    LIMIT 1
    """

    _PERSIST_QUERY = """
    UPDATE "Interview"
    SET "aiInterviewBrief"   = $1::jsonb,
        "interviewUpdatedAt" = NOW()
    WHERE "applicationId" = $2
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def fetch_application(self, application_id: str) -> ApplicationRow:
        """Fetch and validate application + job + org config from DB."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(self._FETCH_QUERY, application_id)
        if not row:
            raise RuntimeError(
                f"[REPO] No application found in DB for id={application_id}"
            )
        return ApplicationRow.model_validate(dict(row))

    async def save_brief(self, application_id: str, brief: InterviewBrief) -> None:
        """Serialize and persist the InterviewBrief JSON to DB."""
        brief_json = brief.model_dump_json()
        async with self._pool.acquire() as conn:
            result = await conn.execute(self._PERSIST_QUERY, brief_json, application_id)
        updated = int(result.split()[-1]) if result else 0
        if updated == 0:
            raise RuntimeError(
                f"[REPO] UPDATE affected 0 rows — Interview row missing for "
                f"applicationId={application_id}"
            )
        logger.info("[REPO] interviewBrief persisted for applicationId=%s", application_id)


# ---------------------------------------------------------------------------
# OOP: BriefPipeline — orchestrates the LangGraph execution
# ---------------------------------------------------------------------------

class BriefPipeline:
    """Builds and runs the 4-node LangGraph brief-generation pipeline.

    Graph topology:
        fetch_data → classify_band → generate_llm_brief → persist_brief → END

    Each node is a pure function that receives the full state dict and returns
    a partial update. LangGraph merges the partial updates into the state
    after each node completes.

    Error propagation uses a sentinel pattern: any node that fails sets
    state["error"] to a non-None string, and all subsequent nodes short-circuit
    immediately by checking this sentinel first.
    """

    def __init__(self, repo: BriefRepository, openai_client: AsyncOpenAI) -> None:
        self._repo = repo
        self._openai = openai_client
        self._graph = self._build_graph()

    # ── LangGraph nodes ────────────────────────────────────────────────────

    async def _node_fetch_data(self, state: BriefWorkerState) -> dict:
        """Node 1: Fetch application data from DB."""
        if state.get("error"):
            return {}
        app_id = state["application_id"]
        logger.info("[NODE:fetch_data] started | applicationId=%s", app_id)
        row = await self._repo.fetch_application(app_id)
        logger.info(
            "[NODE:fetch_data] done | candidate=%s | role=%s | llm=%s | "
            "resume=%s | jd=%s | custom_q=%d",
            row.fullName, row.job_title, row.llm_model,
            "YES" if row.resume_json else "NO",
            "YES" if row.jd_data else "NO",
            len(row.custom_questions),
        )
        return {"row": row, "t_fetch_done": time.perf_counter()}

    def _node_classify_band(self, state: BriefWorkerState) -> dict:
        """Node 2: Deterministic band classification from resume (zero LLM)."""
        if state.get("error"):
            return {}
        row: ApplicationRow = state["row"]
        band_seed, total_years, seniority = classify_band(row.resume_json)
        logger.info(
            "[NODE:classify_band] band=%s | total_years=%.1f | seniority=%s",
            band_seed, total_years, seniority or "unknown",
        )
        return {"band_seed": band_seed, "total_years": total_years}

    async def _node_generate_llm_brief(self, state: BriefWorkerState) -> dict:
        """Node 3: The LLM call — generate_interview_brief (~40s)."""
        if state.get("error"):
            return {}
        row: ApplicationRow = state["row"]
        band_seed: str = state["band_seed"]
        llm_model = row.llm_model
        logger.info(
            "[NODE:generate_llm_brief] started | model=%s | candidate=%s | role=%s",
            llm_model, row.fullName, row.job_title,
        )
        t0 = time.perf_counter()
        brief = await generate_interview_brief(
            candidate_name=row.fullName,
            job_title=row.job_title,
            candidate_band=band_seed,
            resume_json=row.resume_json,
            jd_data=row.jd_data,
            custom_questions=row.custom_questions,
            openai_client=self._openai,
            llm_model=llm_model,
        )
        elapsed = round(time.perf_counter() - t0, 1)
        logger.info(
            "[NODE:generate_llm_brief] done | elapsed=%.1fs | band=%s | anchor=%r | topics=%d",
            elapsed,
            brief.candidate_band,
            brief.anchor_topic.title,
            len(brief.topic_pool),
        )
        # DSA: log topic pool as ordered set (dedup by title, preserve insertion order)
        seen: dict[str, None] = {}
        for t in brief.topic_pool:
            seen[t.title] = None
        logger.info(
            "[NODE:generate_llm_brief] topic_pool (unique): %s",
            list(seen.keys()),
        )
        return {"brief": brief, "t_llm_done": time.perf_counter()}

    async def _node_persist_brief(self, state: BriefWorkerState) -> dict:
        """Node 4: Write the validated brief JSON to DB."""
        if state.get("error"):
            return {}
        app_id = state["application_id"]
        brief: InterviewBrief = state["brief"]
        logger.info("[NODE:persist_brief] started | applicationId=%s", app_id)
        await self._repo.save_brief(app_id, brief)
        total = round(time.perf_counter() - state["t_start"], 1)
        logger.info(
            "[NODE:persist_brief] done | applicationId=%s | total_elapsed=%.1fs",
            app_id, total,
        )
        return {}

    # ── Graph builder ───────────────────────────────────────────────────────

    def _build_graph(self) -> Any:
        """Build the sequential 4-node LangGraph.

        fetch_data → classify_band → generate_llm_brief → persist_brief → END

        Sequential (not parallel) because each node depends on the output
        of the previous one.
        """
        g: StateGraph = StateGraph(BriefWorkerState)

        g.add_node("fetch_data",          self._node_fetch_data)
        g.add_node("classify_band",       self._node_classify_band)
        g.add_node("generate_llm_brief",  self._node_generate_llm_brief)
        g.add_node("persist_brief",       self._node_persist_brief)

        g.add_edge(START,                "fetch_data")
        g.add_edge("fetch_data",         "classify_band")
        g.add_edge("classify_band",      "generate_llm_brief")
        g.add_edge("generate_llm_brief", "persist_brief")
        g.add_edge("persist_brief",      END)

        return g.compile()

    async def run(self, application_id: str) -> BriefWorkerResult:
        """Execute the full pipeline and return a typed result."""
        t_start = time.perf_counter()
        initial: BriefWorkerState = {
            "application_id": application_id,
            "row": None,
            "band_seed": "mid",
            "total_years": 0.0,
            "brief": None,
            "t_start": t_start,
            "t_fetch_done": 0.0,
            "t_llm_done": 0.0,
            "error": None,
        }
        try:
            final = await self._graph.ainvoke(initial)
        except Exception as e:
            elapsed = round(time.perf_counter() - t_start, 1)
            return BriefWorkerResult(
                success=False,
                applicationId=application_id,
                elapsed_sec=elapsed,
                error=str(e),
            )

        elapsed = round(time.perf_counter() - t_start, 1)
        brief: Optional[InterviewBrief] = final.get("brief")
        error: Optional[str] = final.get("error")

        if error or not brief:
            return BriefWorkerResult(
                success=False,
                applicationId=application_id,
                elapsed_sec=elapsed,
                error=error or "brief was not generated",
            )

        return BriefWorkerResult(
            success=True,
            applicationId=application_id,
            elapsed_sec=elapsed,
            band=brief.candidate_band,
            anchor=brief.anchor_topic.title,
            topics=len(brief.topic_pool),
        )


# ---------------------------------------------------------------------------
# DB pool factory
# ---------------------------------------------------------------------------

def _normalize_dsn(conn_str: str) -> str:
    if conn_str.startswith("postgres://"):
        conn_str = conn_str.replace("postgres://", "postgresql://", 1)
    parsed = urlparse(conn_str)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for key in ("pgbouncer", "connection_limit", "pool_timeout", "schema"):
        query.pop(key, None)
    return urlunparse(parsed._replace(query=urlencode(query)))


async def _create_pool(database_url: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        _normalize_dsn(database_url),
        ssl=False,
        statement_cache_size=0,
        min_size=1,
        max_size=2,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _coerce_dict(raw: object) -> dict:
    """Safely coerce a DB value (string/dict/None) to a plain dict."""
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(str(raw))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def _main(application_id: str) -> BriefWorkerResult:
    database_url = os.environ.get("DATABASE_URL", "")
    openai_api_key = os.environ.get("OPENAI_API_KEY", "")

    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    if not openai_api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable is not set")

    pool = await _create_pool(database_url)
    try:
        repo = BriefRepository(pool)
        openai_client = AsyncOpenAI(api_key=openai_api_key)
        pipeline = BriefPipeline(repo=repo, openai_client=openai_client)
        return await pipeline.run(application_id)
    finally:
        await pool.close()


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python interview/generate_brief.py <applicationId>",
            file=sys.stderr,
        )
        sys.exit(1)

    application_id = sys.argv[1].strip()
    if not application_id:
        print("ERROR: applicationId is empty", file=sys.stderr)
        sys.exit(1)

    logger.info("[START] applicationId=%s", application_id)

    try:
        result = asyncio.run(_main(application_id))
    except Exception as e:
        logger.error("[FATAL] %s", e, exc_info=True)
        sys.exit(1)

    if not result.success:
        logger.error("[FAILED] %s", result.error)
        sys.exit(1)

    # Output minimal JSON so the Node.js worker can log confirmation
    print(result.model_dump_json())
    logger.info(
        "[DONE] applicationId=%s | elapsed=%.1fs | band=%s | anchor=%r | topics=%d",
        result.applicationId, result.elapsed_sec, result.band, result.anchor, result.topics,
    )


if __name__ == "__main__":
    main()
