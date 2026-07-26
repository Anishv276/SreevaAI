/**
 * start-worker.mjs — Single-instance worker launcher for Windows + Unix.
 *
 * Problem: `tsx` on Windows spawns: cmd.exe → node(tsx) → node(worker)
 * Ctrl+C only kills the top shell, leaving the grandchild node process alive.
 * Those ghosts connect to Redis and consume BullMQ jobs silently.
 *
 * Solution:
 * 1. Kill every node.exe that has "worker.ts" in its command line before starting.
 * 2. Spawn tsx directly (not via npx) so the process tree is: node(tsx) → node(worker).
 * 3. On Ctrl+C, use taskkill /T to kill the entire process tree.
 * 4. Store the spawned PID in .worker.pid so the next run can clean up.
 *
 * The Python extract-service (FastAPI on :8100) is no longer spawned here --
 * resume/JD extraction, brief generation, and interview report generation all
 * run on Modal now (see modal_app/*.py, lib/modal-dispatch.ts). This worker
 * only handles the remaining lightweight BullMQ jobs (email, DB state, R2
 * uploads, cron).
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
  || "resume-processing,invitation-delivery-queue,interview-start,interview-launch-timeout,interview-finalization,interview-snapshots,interview-recording,recording-retention-cleanup,jd-upload,jd-extraction,question-generation,interview-report";

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
    // wmic unavailable — fall back to PID file only
  }
}

// ── Step 1: Kill all ghost worker.ts node processes ─────────────────────────
killAllWorkerProcesses();

// ── Step 2: Kill previous PID from file (belt-and-suspenders) ───────────────
if (existsSync(PID_FILE)) {
  const oldPid = readFileSync(PID_FILE, "utf8").trim();
  if (oldPid && /^\d+$/.test(oldPid)) {
    const killed = killTree(Number(oldPid));
    console.log(`[start-worker] PID file: ${killed ? "killed" : "already gone"} PID=${oldPid}`);
  }
  unlinkSync(PID_FILE);
}

// ── Step 3: Spawn tsx directly from node_modules/.bin ────────────────────────
// Direct tsx binary avoids the npx → cmd chain that prevents Ctrl+C from propagating.
// On Windows, .cmd files require shell:true to execute.
// We compensate by using taskkill /T on shutdown so the whole cmd+node tree dies.
const tsxArgs = existsSync(ENV_FILE) ? ["--env-file", ENV_FILE, "worker.ts"] : ["worker.ts"];
const child = spawn(TSX_BIN, tsxArgs, {
  cwd: ROOT,
  env: { ...process.env, WORKER_QUEUES: QUEUES },
  stdio: "inherit",
  shell: process.platform === "win32",
  detached: false,
});

if (!child.pid) {
  console.error("[start-worker] Failed to spawn worker process");
  process.exit(1);
}

writeFileSync(PID_FILE, String(child.pid), "utf8");
console.log(`[start-worker] Worker spawned PID=${child.pid}`);

// ── Step 4: Forward signals → kill entire process tree ───────────────────────
let exiting = false;
function shutdown(signal) {
  if (exiting) return;
  exiting = true;
  console.log(`\n[start-worker] ${signal} received — killing worker tree PID=${child.pid}`);
  killTree(child.pid);
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch { }
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch { }
  if (!exiting) {
    process.exit(code ?? 0);
  }
});
