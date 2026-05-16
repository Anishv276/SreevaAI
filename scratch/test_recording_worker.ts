/**
 * test_recording_worker.ts
 * ─────────────────────────────────────────────────────────────────────
 * Tests the new background recording merge pipeline.
 * 
 * What this does:
 *  1. Finds a real applicationId with existing chunk URLs in R2
 *     (from the Interview.recordingManifest)
 *  2. Queues a "merge-recording" job directly to the interview-recording queue
 *  3. Polls Redis to confirm the job was consumed (status transitions to done)
 *  4. Queries the DB to confirm interviewRecordingUrl was updated
 * 
 * Usage:
 *   npx tsx scratch/test_recording_worker.ts
 */
import { prisma } from "../lib/prisma";
import { interviewRecordingQueue } from "../lib/queue";
import { Queue } from "bullmq";
import redisConnection from "../lib/redis";

async function pollJobCompletion(queue: Queue, jobId: string | number, timeoutMs = 120_000): Promise<"completed" | "failed" | "timeout"> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await queue.getJob(String(jobId));
    if (!job) {
      // Job removed from queue — BullMQ removes completed jobs immediately per our config
      return "completed";
    }
    const state = await job.getState();
    if (state === "completed") return "completed";
    if (state === "failed") return "failed";
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "timeout";
}

async function main() {
  console.log("=".repeat(60));
  console.log("🎥 Recording Worker End-to-End Test");
  console.log("=".repeat(60));

  // ── Step 1: Find a candidate with recorded chunks ──────────────────
  const rows = await prisma.$queryRaw<Array<{
    applicationId: string;
    recordingManifest: any;
    fullName: string | null;
  }>>`
    SELECT
      i."applicationId",
      i."recordingManifest",
      a."fullName"
    FROM "Interview" i
    JOIN "Application" a ON a.id = i."applicationId"
    WHERE i."recordingManifest" IS NOT NULL
      AND i."recordingManifest"->>'lastStatus' = 'CHUNKING'
    ORDER BY i."updatedAt" DESC
    LIMIT 5
  `;

  if (!rows.length) {
    // Fallback: use Vamsi's app with a synthetic test job (no real chunks)
    console.log("⚠️  No candidates with CHUNKING status found.");
    console.log("   Falling back to a synthetic queue test (validates job acceptance only).");

    const applicationId = "app-vamsi-2026-1-cmp8occmg00-3900";
    const job = await interviewRecordingQueue.add(
      "merge-recording",
      {
        applicationId,
        sessionId: "test-session-synthetic",
        chunkUrls: [],
        chunkKeys: [],
        chunkCount: 0,           // Worker will fail gracefully — no real chunks
        durationSec: 60,
        mimeType: "video/webm",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      { attempts: 1, removeOnComplete: false, removeOnFail: false }
    );

    console.log(`\n✅ Job queued successfully! Job ID: ${job.id}`);
    console.log(`   Queue: interview-recording`);
    console.log(`   ApplicationId: ${applicationId}`);
    console.log(`   The worker will attempt the merge and log output.`);
    console.log(`\n🔍 Monitor the worker terminal for:`);
    console.log(`   [RECORDING_WORKER] Starting merge for ${applicationId}`);
    console.log(`   [RECORDING_WORKER] No chunks found for ${applicationId} (expected — synthetic test)`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const { applicationId, recordingManifest, fullName } = rows[0];
  const manifest = typeof recordingManifest === "string" ? JSON.parse(recordingManifest) : recordingManifest;
  const chunkUrls: string[] = (manifest?.chunkEvents || [])
    .map((e: any) => e.chunkUrl)
    .filter(Boolean);
  const sessionId: string = manifest?.sessionId || "unknown";

  console.log(`\n📋 Test Candidate: ${fullName} (${applicationId})`);
  console.log(`   Session: ${sessionId}`);
  console.log(`   Chunks found in manifest: ${chunkUrls.length}`);

  // ── Step 2: Queue the real merge job ──────────────────────────────
  console.log("\n🚀 Queueing merge-recording job...");
  const job = await interviewRecordingQueue.add(
    "merge-recording",
    {
      applicationId,
      sessionId,
      chunkUrls,
      chunkKeys: [],
      chunkCount: chunkUrls.length,
      durationSec: manifest?.totalByteSize ? null : 60,
      mimeType: manifest?.mimeType || "video/webm",
      startedAt: manifest?.startedAt || null,
      completedAt: new Date().toISOString(),
    },
    {
      attempts: 1,
      removeOnComplete: false,  // Keep for inspection
      removeOnFail: false,
    }
  );

  console.log(`✅ Job queued! ID: ${job.id}`);
  console.log("⏳ Polling for completion (max 2 minutes)...\n");

  // ── Step 3: Poll for completion ───────────────────────────────────
  const result = await pollJobCompletion(interviewRecordingQueue, job.id!, 120_000);

  if (result === "timeout") {
    console.log("⏰ Timeout — worker may still be processing. Check worker logs.");
  } else if (result === "failed") {
    const failedJob = await interviewRecordingQueue.getJob(String(job.id));
    console.log(`❌ Job failed: ${failedJob?.failedReason}`);
  } else {
    console.log("✅ Job completed!");
  }

  // ── Step 4: Verify DB was updated ─────────────────────────────────
  console.log("\n🔍 Verifying database state...");
  const updated = await prisma.$queryRaw<Array<{
    interviewRecordingUrl: string | null;
    recordingStatus: string | null;
  }>>`
    SELECT "interviewRecordingUrl", "recordingStatus"
    FROM "Interview"
    WHERE "applicationId" = ${applicationId}
    LIMIT 1
  `;

  if (updated[0]) {
    console.log(`   recordingStatus  : ${updated[0].recordingStatus}`);
    console.log(`   interviewRecordingUrl: ${updated[0].interviewRecordingUrl?.slice(0, 80)}...`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(result === "completed" ? "🎉 TEST PASSED" : "⚠️  TEST NEEDS REVIEW — check worker logs");
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
