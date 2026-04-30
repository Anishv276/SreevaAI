import { existsSync, lstatSync, readdirSync, rmSync, rmdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const nextDir = resolve(process.cwd(), ".next");

function removePath(target) {
  if (!existsSync(target)) return;

  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || stat.isFile()) {
    unlinkSync(target);
    return;
  }

  if (stat.isDirectory()) {
    for (const entry of readdirSync(target)) {
      removePath(resolve(target, entry));
    }
    rmdirSync(target);
  }
}

try {
  if (existsSync(nextDir)) {
    try {
      rmSync(nextDir, { recursive: true, force: true });
    } catch {
      removePath(nextDir);
    }
    console.log(`[clean-next] Removed ${nextDir}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[clean-next] Could not remove ${nextDir}: ${message}`);
}
