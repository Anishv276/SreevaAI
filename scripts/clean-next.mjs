import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const nextDir = resolve(process.cwd(), ".next");

try {
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
    console.log(`[clean-next] Removed ${nextDir}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[clean-next] Could not remove ${nextDir}: ${message}`);
}
