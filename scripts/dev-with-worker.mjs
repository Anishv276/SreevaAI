import { spawn } from "child_process";

const children = [];
let shuttingDown = false;

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) {
      try { child.kill("SIGTERM"); } catch {}
    }
  }
  process.exit(exitCode);
}

function startProcess(label, args) {
  const child = spawn("npm.cmd", args, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  children.push({ label, child });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = typeof code === "number" ? code : 1;
    console.error(`[dev:${label}] exited ${signal ? `via ${signal}` : `with code ${exitCode}`}`);
    stopAll(exitCode);
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[dev:${label}] failed to start:`, error);
    stopAll(1);
  });

  return child;
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

console.log("[dev] Starting web server and worker...");
startProcess("web", ["run", "dev:web"]);
startProcess("worker", ["run", "dev:worker"]);