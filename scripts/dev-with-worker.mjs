import { spawn } from "child_process";

let shuttingDown = false;
const MAX_RESTARTS = 10;
const RESTART_DELAY_MS = 2000;

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exit(exitCode);
}

function startProcess(label, args, restartCount = 0) {
  if (shuttingDown) return;

  const child = spawn("npm.cmd", args, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(
      `[dev:${label}] exited ${signal ? `via ${signal}` : `with code ${code}`} (restart ${restartCount + 1}/${MAX_RESTARTS})`
    );
    if (restartCount >= MAX_RESTARTS) {
      console.error(`[dev:${label}] max restarts reached — giving up`);
      stopAll(1);
      return;
    }
    setTimeout(() => startProcess(label, args, restartCount + 1), RESTART_DELAY_MS);
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[dev:${label}] failed to start:`, error);
    stopAll(1);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

console.log("[dev] Starting web server and eval worker (auto-restart enabled)...");
startProcess("web", ["run", "dev:web"]);
startProcess("worker", ["run", "dev:worker"]);