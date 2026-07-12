/**
 * scripts/test/test-modal-concurrency.ts
 * =========================================
 * Verifies withModalOrgSlot actually enforces a per-org cap: fires N concurrent
 * "calls" (fake, no real Modal HTTP request -- just a sleep to simulate work) for
 * one orgId with a low cap, and confirms at most `cap` run at once while the rest
 * wait for a slot to free up. Run with: npx tsx scripts/test/test-modal-concurrency.ts
 */
import "dotenv/config";
import { withModalOrgSlot } from "../../lib/modal-concurrency";
import redisConnection from "../../lib/redis";

async function main() {
  const ORG_ID = "test-org-concurrency-check";
  const CAP = 2;
  const TOTAL_CALLS = 6;
  const CALL_DURATION_MS = 1500;

  let currentlyRunning = 0;
  let maxObservedConcurrent = 0;
  let queuedCount = 0;

  const results = await Promise.all(
    Array.from({ length: TOTAL_CALLS }, (_, i) =>
      (async () => {
        const outcome = await withModalOrgSlot("testJob", ORG_ID, CAP, async () => {
          currentlyRunning++;
          maxObservedConcurrent = Math.max(maxObservedConcurrent, currentlyRunning);
          console.log(`[call ${i}] running, currentlyRunning=${currentlyRunning}`);
          await new Promise((r) => setTimeout(r, CALL_DURATION_MS));
          currentlyRunning--;
          return i;
        });
        if (outcome.queued) {
          queuedCount++;
          console.log(`[call ${i}] queued (org at cap)`);
        }
        return outcome;
      })(),
    ),
  );

  console.log("\n=== RESULTS ===");
  console.log(`Cap: ${CAP}, total calls: ${TOTAL_CALLS}`);
  console.log(`Max observed concurrent: ${maxObservedConcurrent} (must be <= ${CAP})`);
  console.log(`Queued (rejected-then-would-retry) count: ${queuedCount}`);
  console.log(`Completed immediately: ${results.filter((r) => !r.queued).length}`);

  if (maxObservedConcurrent > CAP) {
    console.error(`FAIL: concurrency cap violated (${maxObservedConcurrent} > ${CAP})`);
    process.exit(1);
  }
  console.log("PASS: concurrency cap respected");
  await redisConnection.quit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
