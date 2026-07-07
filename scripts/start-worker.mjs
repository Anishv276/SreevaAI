/**
 * start-worker.mjs â€” Single-instance worker launcher for Windows + Unix.
 *
 * Problem: `tsx` on Windows spawns: cmd.exe â†’ node(tsx) â†’ node(worker)
 * Ctrl+C only kills the top shell, leaving the grandchild node process alive.
 * Those ghosts connect to Redis and consume BullMQ jobs silently.
 *
 * Solution:
 * 1. Kill every node.exe that has "worker.ts" in its command line before starting.
 * 2. Spawn tsx directly (not via npx) so the process tree is: node(tsx) â†’ node(worker).
 * 3. On Ctrl+C, use taskkill /T to kill the entire process tree.
 * 4. Store the spawned PID in .worker.pid so the next run can clean up.
 *
 * Also launches the Python extract-service (FastAPI on :8100) as a sibling child
 * so a single `npm run worker` boots BOTH the BullMQ worker and the extraction
 * backend the JD/resume workers fetch() against. Both are torn down together on
 * exit. Set SKIP_EXTRACT_SERVICE=1 to run only the worker (e.g. when the service
 * is already running elsewhere / in its own container).
 */
import { execSync, spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PID_FILE = join(ROOT, ".worker.pid");
const TSX_BIN = process.platform === "win32"
  ? join(ROOT, "node_modules", ".bin", "tsx.cmd")
  : join(ROOT, "node_modules", ".bin", "tsx");
const ENV_FILE = join(ROOT, ".env");

const QUEUES = process.env.WORKER_QUEUES
  || "resume-processing,invitation-delivery-queue,interview-start,interview-finalization,interview-snapshots,interview-recording,recording-retention-cleanup,jd-upload,jd-extraction,interview-report";

// Python interpreter for the extract-service (mirrors lib/python-exec.ts).
const PYTHON_BIN = process.env.PYTHON_BIN?.trim()
  || (process.platform === "win32" ? "python" : "python3");
const EXTRACT_SERVICE_PORT = process.env.EXTRACT_SERVICE_PORT || "8100";
const SKIP_EXTRACT_SERVICE = /^(1|true|yes)$/i.test(process.env.SKIP_EXTRACT_SERVICE || "");

function killTree(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore", shell: true });
    } else {
      execSync(`kill -9 -- -$(ps -o pgid= -p ${pid} | tr -d ' ') 2>/dev/null || kill -9 ${pid}`, { stdio: "ignore", shell: true });
    }
    return true;
  } catch {
    return false;
  }
}

function killAllWorkerProcesses() {
  if (process.platform !== "win32") return;
  try {
    // Kill every node.exe whose command line contains worker.ts
    const out = execSync(
      `wmic process where "name='node.exe'" get ProcessId,CommandLine /FORMAT:CSV 2>nul`,
      { encoding: "utf8", shell: true, timeout: 5000 }
    );
    for (const line of out.split("\n")) {
      if (!line.includes("worker.ts")) continue;
      const parts = line.trim().split(",");
      const pid = parts[parts.length - 1]?.trim();
      if (pid && /^\d+$/.test(pid) && pid !== String(process.pid)) {
        killTree(Number(pid));
        console.log(`[start-worker] Killed ghost worker.ts process PID=${pid}`);
      }
    }
  } catch {
    // wmic unavailable â€” fall back to PID file only
  }
}

// â”€â”€ Step 1: Kill all ghost worker.ts node processes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
killAllWorkerProcesses();

// â”€â”€ Step 2: Kill previous PID from file (belt-and-suspenders) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (existsSync(PID_FILE)) {
  const oldPid = readFileSync(PID_FILE, "utf8").trim();
  if (oldPid && /^\d+$/.test(oldPid)) {
    const killed = killTree(Number(oldPid));
    console.log(`[start-worker] PID file: ${killed ? "killed" : "already gone"} PID=${oldPid}`);
  }
  unlinkSync(PID_FILE);
}

// â”€â”€ Step 3: Spawn the Python extract-service (FastAPI on :8100) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The JD/resume workers fetch() this service; without it every job fails with
// "fetch failed". Booting it here means one command starts everything.
let extractChild = null;
if (!SKIP_EXTRACT_SERVICE) {
  extractChild = spawn(
    PYTHON_BIN,
    ["-m", "uvicorn", "extraction_resume_JD_score_report.service:app", "--host", "0.0.0.0", "--port", EXTRACT_SERVICE_PORT],
    {
      cwd: ROOT,
      env: { ...process.env },
      stdio: "inherit",
      shell: process.platform === "win32",
      detached: false,
    }
  );
  if (extractChild.pid) {
    console.log(`[start-worker] Extract-service spawned PID=${extractChild.pid} (port ${EXTRACT_SERVICE_PORT})`);
  } else {
    console.error("[start-worker] Failed to spawn extract-service");
  }
} else {
  console.log("[start-worker] SKIP_EXTRACT_SERVICE set â€” not starting extract-service");
}

// â”€â”€ Step 4: Spawn tsx directly from node_modules/.bin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Direct tsx binary avoids the npx â†’ cmd chain that prevents Ctrl+C from propagating.
// On Windows, .cmd files require shell:true to execute.
// We compensate by using taskkill /T on shutdown so the whole cmd+node tree dies.
const child = spawn(TSX_BIN, ["--env-file", ENV_FILE, "worker.ts"], {
  cwd: ROOT,
  env: { ...process.env, WORKER_QUEUES: QUEUES },
  stdio: "inherit",
  shell: process.platform === "win32",
  detached: false,
});

if (!child.pid) {
  console.error("[start-worker] Failed to spawn worker process");
  if (extractChild?.pid) killTree(extractChild.pid);
  process.exit(1);
}

writeFileSync(PID_FILE, String(child.pid), "utf8");
console.log(`[start-worker] Worker spawned PID=${child.pid}`);

// â”€â”€ Step 5: Forward signals â†’ kill entire process tree â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let exiting = false;
function shutdown(signal) {
  if (exiting) return;
  exiting = true;
  console.log(`\n[start-worker] ${signal} received â€” killing worker tree PID=${child.pid}${extractChild?.pid ? ` + extract-service PID=${extractChild.pid}` : ""}`);
  killTree(child.pid);
  if (extractChild?.pid) killTree(extractChild.pid);
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch { }
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// If either child dies, take the whole launcher down so they never run half-up.
child.on("exit", (code, signal) => {
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch { }
  if (!exiting) {
    if (extractChild?.pid) killTree(extractChild.pid);
    process.exit(code ?? 0);
  }
});

if (extractChild) {
  extractChild.on("exit", (code) => {
    if (!exiting) {
      console.error(`[start-worker] Extract-service exited (code=${code}) â€” shutting down worker too.`);
      shutdown("extract-service-exit");
    }
  });
}
