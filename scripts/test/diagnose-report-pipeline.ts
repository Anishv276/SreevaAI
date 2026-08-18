/**
 * scripts/test/diagnose-report-pipeline.ts
 * =========================================
 * Walks the ENTIRE interview-report -> Modal chain and prints exactly which link
 * is broken. Written for the Aug 2 2026 outage (Modal showed zero incoming calls
 * AND zero app logs, meaning requests never left our infrastructure) but is a
 * general-purpose health check for this pipeline.
 *
 * The chain being verified, in order:
 *   LiveKit agent -> POST /api/internal/interview-report -> BullMQ "interview-report"
 *   queue (Redis) -> worker.ts -> lib/modal-dispatch.ts -> Modal HTTP endpoint
 *
 * READ-ONLY: enqueues nothing, deletes nothing, and does not call Modal's real
 * report function. The one outbound request it makes is a deliberately malformed
 * auth probe (see checkModalEndpoint) that Modal rejects at the edge.
 *
 * Secrets are printed as redacted fingerprints only (first4…last4 + length), so
 * output can be pasted into a chat/ticket to compare values across processes.
 *
 * Run INSIDE the worker container so it sees the worker's own env:
 *   docker exec -it Normal-worker npx tsx scripts/test/diagnose-report-pipeline.ts
 *
 * Run on the host against prod env vars:
 *   npx tsx scripts/test/diagnose-report-pipeline.ts
 */
import "dotenv/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const REPORT_QUEUE = "interview-report";
const REDIS_TIMEOUT_MS = 8000;

/**
 * These three mirror lib/redis.ts exactly, but are inlined deliberately:
 * importing lib/redis.ts creates the app's shared retry-forever connection as a
 * module-level side effect, which keeps the event loop alive and prevents this
 * script from ever exiting. Keep in sync with lib/redis.ts if that file changes.
 */
function getRedisUrl(): string {
  const configured = process.env.REDIS_URL?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "redis://redis:6379" : "redis://localhost:6379";
}
function getRedisDb(): number {
  const raw = process.env.REDIS_DB?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}
function getBullPrefix(): string {
  return process.env.BULLMQ_PREFIX?.trim() || "bull";
}

/**
 * A dedicated connection that FAILS FAST. The app's shared connection
 * (lib/redis.ts) retries forever by design -- correct for a long-lived worker,
 * fatal for a diagnostic: if Redis is down (a prime suspect here) the script
 * would hang instead of reporting it. maxRetriesPerRequest:1 + retryStrategy
 * returning null makes an unreachable Redis surface as an error, not a hang.
 */
const redis = new IORedis(getRedisUrl(), {
  db: getRedisDb(),
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  connectTimeout: REDIS_TIMEOUT_MS,
  retryStrategy: () => null,
  lazyConnect: true,
});
// ioredis emits 'error' on every failed reconnect; without a listener Node
// prints a wall of unhandled-error noise that buries the actual findings.
redis.on("error", () => {});

/** Bound any promise so one unreachable dependency cannot stall the whole run. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

type Status = "ok" | "warn" | "fail";
const results: { label: string; status: Status; detail: string }[] = [];

function record(label: string, status: Status, detail: string) {
  results.push({ label, status, detail });
  const icon = status === "ok" ? "[ OK ]" : status === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${icon} ${label}`);
  if (detail) console.log(`       ${detail}`);
}

/** Redact a secret so we can compare values across processes without printing them. */
function fingerprint(value: string | undefined): string {
  if (!value) return "<unset>";
  if (value.length < 8) return `<set, ${value.length} chars — suspiciously short>`;
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

/**
 * STEP 1 -- the env vars modal-dispatch.ts reads. An empty MODAL_GENERATE_REPORT_URL
 * is the highest-value finding here: lib/modal-dispatch.ts:59 defaults it to "",
 * and fetch("") throws locally without ever touching the network -- producing
 * exactly "zero calls, zero logs" on the Modal side.
 */
function checkEnv(): string {
  console.log("\n=== 1. Environment (as this process sees it) ===\n");

  const reportUrl = (process.env.MODAL_GENERATE_REPORT_URL || "").trim();
  if (!reportUrl) {
    record(
      "MODAL_GENERATE_REPORT_URL",
      "fail",
      "UNSET/EMPTY. lib/modal-dispatch.ts falls back to \"\" and fetch(\"\") fails locally — " +
        "the request never reaches Modal. This alone fully explains zero Modal calls + zero Modal logs.",
    );
  } else if (!/^https?:\/\//i.test(reportUrl)) {
    record("MODAL_GENERATE_REPORT_URL", "fail", `Not a valid URL: "${reportUrl}"`);
  } else {
    record("MODAL_GENERATE_REPORT_URL", "ok", reportUrl);
  }

  const apiKey = process.env.EXTRACT_SERVICE_API_KEY || "";
  record(
    "EXTRACT_SERVICE_API_KEY",
    apiKey ? "ok" : "fail",
    apiKey
      ? `${fingerprint(apiKey)} — must match Modal secret "sreevaai-extract-api-key"`
      : "UNSET. modal-dispatch.ts sends no x-api-key header; generate_report.py's _check_api_key returns 401. " +
          "NOTE: a 401 WOULD still appear in Modal's logs, so this alone does not explain total silence.",
  );

  const internalSecret = process.env.INTERNAL_API_SECRET || "";
  record(
    "INTERNAL_API_SECRET",
    internalSecret ? "ok" : "fail",
    internalSecret
      ? `${fingerprint(internalSecret)} — this fingerprint MUST match the LiveKit agent's copy`
      : "UNSET. /api/internal/interview-report rejects every enqueue with 401, so nothing ever queues.",
  );

  return reportUrl;
}

/**
 * STEP 2 -- Redis keyspace. lib/redis.ts:32 warns that a REDIS_DB / BULLMQ_PREFIX
 * mismatch between the enqueuing app and the consuming worker makes each side use
 * a different keyspace: the app enqueues, the worker blocks on an empty queue, and
 * NOTHING logs an error anywhere. Both values silently default when unset, so a
 * one-sided change is easy to ship by accident.
 */
async function checkRedis(): Promise<boolean> {
  console.log("\n=== 2. Redis / BullMQ keyspace ===\n");

  console.log(`       REDIS_URL       : ${getRedisUrl()}`);
  console.log(`       REDIS_DB        : ${getRedisDb()}${process.env.REDIS_DB ? "" : "  (defaulted — env var unset)"}`);
  console.log(`       BULLMQ_PREFIX   : ${getBullPrefix()}${process.env.BULLMQ_PREFIX ? "" : "  (defaulted — env var unset)"}`);
  console.log(
    "       ^ These three MUST be identical in the Next.js app and this worker.\n" +
      "         If they differ, the app enqueues into one keyspace and the worker\n" +
      "         watches another. Silent failure — no errors on either side.\n",
  );

  try {
    await withTimeout(redis.connect(), REDIS_TIMEOUT_MS, "Redis connect");
    const pong = await withTimeout(redis.ping(), REDIS_TIMEOUT_MS, "Redis PING");
    record("Redis connectivity", pong === "PONG" ? "ok" : "fail", `PING -> ${pong}`);
    return pong === "PONG";
  } catch (e: any) {
    record(
      "Redis connectivity",
      "fail",
      `Cannot reach Redis at ${getRedisUrl()} (db=${getRedisDb()}): ${e?.message}. ` +
        "Nothing can enqueue or dequeue — this alone stops all report generation.",
    );
    return false;
  }
}

/**
 * STEP 3 -- queue state. This is the branch point that separates the two halves
 * of the chain, and the single most diagnostic signal in this script.
 */
async function checkQueue(): Promise<void> {
  console.log("\n=== 3. interview-report queue state ===\n");

  const q = new Queue(REPORT_QUEUE, { connection: redis, prefix: getBullPrefix() });
  try {
    const counts = await withTimeout(
      q.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused"),
      REDIS_TIMEOUT_MS,
      "getJobCounts",
    );
    console.log(
      `       waiting=${counts.waiting} active=${counts.active} delayed=${counts.delayed} ` +
        `failed=${counts.failed} completed=${counts.completed} paused=${counts.paused}\n`,
    );

    const isPaused = await q.isPaused();
    if (isPaused) {
      record("Queue paused?", "fail", "Queue is PAUSED. Jobs enqueue but are never processed. Resume it to restore reports.");
    } else {
      record("Queue paused?", "ok", "Not paused.");
    }

    const backlog = (counts.waiting || 0) + (counts.delayed || 0);
    if (backlog > 0) {
      record(
        "Backlog",
        "fail",
        `${backlog} job(s) stuck waiting/delayed. Jobs ARE being enqueued but NOT consumed — ` +
          "the worker is down, crash-looping, or watching a different keyspace (see step 2). " +
          "=> Focus on the WORKER half of the chain.",
      );
    } else if ((counts.completed || 0) === 0 && (counts.failed || 0) === 0) {
      record(
        "Backlog",
        "warn",
        "Queue is completely empty with no recent history. Either nothing is being enqueued " +
          "(agent -> /api/internal/interview-report is failing, or no interviews finished), " +
          "or this is the wrong keyspace. NOTE: removeOnComplete/removeOnFail age is 5 min " +
          "(lib/queue.ts:113), so a healthy idle queue also looks like this. " +
          "=> Focus on the ENQUEUE half of the chain.",
      );
    } else {
      record("Backlog", "ok", "No stuck jobs.");
    }

    // Failed jobs carry the real exception from modal-dispatch.ts -- the most
    // direct evidence available of why a Modal call did not happen.
    const failed = await q.getFailed(0, 4);
    if (failed.length) {
      console.log("\n       Recent failures (most recent first):");
      for (const job of failed) {
        const when = job.finishedOn ? new Date(job.finishedOn).toISOString() : "unknown";
        console.log(`         - ${when} appId=${job.id}`);
        console.log(`           ${String(job.failedReason || "").slice(0, 300)}`);
      }
      console.log();
    }
  } catch (e: any) {
    record("Queue inspection", "fail", `Could not read queue: ${e?.message}`);
  } finally {
    await q.close();
  }
}

/**
 * STEP 4 -- are any workers actually attached? BullMQ tracks consumers via Redis
 * client names, so this answers "is Normal-worker alive and listening?" without
 * needing docker access.
 */
async function checkWorkers(): Promise<void> {
  console.log("\n=== 4. Attached workers ===\n");

  const q = new Queue(REPORT_QUEUE, { connection: redis, prefix: getBullPrefix() });
  try {
    const workers = await withTimeout(q.getWorkers(), REDIS_TIMEOUT_MS, "getWorkers");
    if (!workers.length) {
      record(
        "Workers listening on interview-report",
        "fail",
        "ZERO workers attached. The worker process is not running, or it is running with " +
          `"${REPORT_QUEUE}" missing from WORKER_QUEUES, or it is on a different REDIS_DB/BULLMQ_PREFIX. ` +
          "This is the direct cause of reports never being generated.",
      );
    } else {
      record(
        "Workers listening on interview-report",
        "ok",
        `${workers.length} worker(s) attached: ${workers.map((w: any) => w.name || w.addr).join(", ")}`,
      );
    }
  } catch (e: any) {
    record("Worker inspection", "warn", `Could not enumerate workers: ${e?.message}`);
  } finally {
    await q.close();
  }
}

/**
 * STEP 5 -- can we actually reach Modal from here? Deliberately sends an INVALID
 * api key so generate_report.py's _check_api_key rejects it with 401 before any
 * report work begins. We are testing reachability, not triggering a report.
 *
 * Interpreting the result:
 *   401  -> endpoint is live and reachable; network path is fine.
 *   404  -> URL is wrong/stale (app or function renamed, or redeployed elsewhere).
 *   DNS/timeout -> egress blocked from this host, or the URL host does not exist.
 */
async function checkModalEndpoint(url: string): Promise<void> {
  console.log("\n=== 5. Modal endpoint reachability ===\n");

  if (!url) {
    record("Modal reachability", "fail", "Skipped — MODAL_GENERATE_REPORT_URL is unset (see step 1).");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "diagnostic-probe-intentionally-invalid" },
      body: JSON.stringify({ diagnostic: true }),
      signal: controller.signal,
    });

    if (res.status === 401) {
      record(
        "Modal reachability",
        "ok",
        "HTTP 401 as expected — the endpoint is LIVE and reachable from this host. " +
          "The network path is healthy, so the break is upstream (worker not running, or not calling).",
      );
    } else if (res.status === 404) {
      record(
        "Modal reachability",
        "fail",
        `HTTP 404 — the URL is stale or wrong. The deployed endpoint moved (app/function renamed, ` +
          `or deployed to a different workspace). Fix MODAL_GENERATE_REPORT_URL. URL tried: ${url}`,
      );
    } else {
      record("Modal reachability", "warn", `HTTP ${res.status} (expected 401). Endpoint reachable but responding unusually.`);
    }
  } catch (e: any) {
    const reason = e?.name === "AbortError" ? "timed out after 15s" : e?.message;
    record(
      "Modal reachability",
      "fail",
      `Cannot reach Modal: ${reason}. Egress from this host is blocked, or the hostname does not resolve. ` +
        "This would produce exactly zero calls and zero logs on the Modal side.",
    );
  } finally {
    clearTimeout(timer);
  }
}

function summarize(): void {
  console.log("\n=== SUMMARY ===\n");

  const failures = results.filter((r) => r.status === "fail");
  const warnings = results.filter((r) => r.status === "warn");

  if (!failures.length && !warnings.length) {
    console.log("  All checks passed. The pipeline looks healthy from this host.");
    console.log("  If reports still are not generating, verify interviews are actually completing");
    console.log("  and check the LiveKit agent logs for '[REPORT] Enqueue' lines.\n");
    return;
  }

  if (failures.length) {
    console.log("  BROKEN LINKS:\n");
    for (const f of failures) console.log(`    - ${f.label}: ${f.detail}\n`);
  }
  if (warnings.length) {
    console.log("  WARNINGS:\n");
    for (const w of warnings) console.log(`    - ${w.label}: ${w.detail}\n`);
  }

  console.log("  Remember to run this INSIDE the worker container too:");
  console.log("    docker exec -it Normal-worker npx tsx scripts/test/diagnose-report-pipeline.ts");
  console.log("  Env differences between host and container are themselves a common root cause.\n");
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║   Interview Report Pipeline Diagnostic                     ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nRun at: ${new Date().toISOString()}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || "<unset>"}`);

  const reportUrl = checkEnv();
  const redisOk = await checkRedis();

  if (redisOk) {
    await checkQueue();
    await checkWorkers();
  } else {
    console.log("\n=== 3/4. Queue + worker checks SKIPPED (Redis unreachable) ===");
  }

  await checkModalEndpoint(reportUrl);
  summarize();

  await redis.quit().catch(() => {});
  // Explicit exit: a half-open Redis socket (exactly the scenario this script
  // exists to diagnose) can otherwise keep the event loop alive indefinitely.
  process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\nDiagnostic script itself failed:", e);
  await redis.quit().catch(() => {});
  process.exit(1);
});
