import { existsSync, lstatSync, readdirSync, rmSync, rmdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const nextDir = resolve(process.cwd(), ".next");

function removePath(target) {
  if (!existsSync(target)) return;

  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || stat.isFile()) {
      try {
        unlinkSync(target);
      } catch {
        // Windows file locks can block removal of stale Next.js artifacts.
      }
      return;
    }

    if (stat.isDirectory()) {
      for (const entry of readdirSync(target)) {
        removePath(resolve(target, entry));
      }
      try {
        rmdirSync(target);
      } catch {
        // If the directory is still busy, leave it in place and let the next build overwrite what it can.
      }
    }
  } catch {
    // Ignore entries that disappear or remain locked mid-cleanup.
  }
}

try {
  if (existsSync(nextDir)) {
    try {
      rmSync(nextDir, { recursive: true, force: true });
    } catch {
      removePath(nextDir);
    }
  }
  console.log(`[clean-next] Removed ${nextDir}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[clean-next] Could not remove Next build artifacts: ${message}`);
}
