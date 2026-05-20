/**
 * retry_recording.ts
 * Directly queues a merge job for any candidate whose chunks exist in R2
 * but whose recording URL is missing.
 *
 * Run with: npx tsx scratch/retry_recording.ts [partialName]
 * Example:   npx tsx scratch/retry_recording.ts murali
 */

import { prisma } from "../lib/prisma";
import { interviewRecordingQueue } from "../lib/queue";

async function main() {
  const searchName = process.argv[2] || "murali";

  const application = await prisma.application.findFirst({
    where: { fullName: { contains: searchName, mode: "insensitive" } },
    select: {
      id: true,
      fullName: true,
      interview: {
        select: {
          recordingStatus: true,
          interviewRecordingUrl: true,
          recordingManifest: true,
          recordingMimeType: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!application) {
    console.error(`❌ No application found matching: "${searchName}"`);
    process.exit(1);
  }

  console.log(`✅ Found: ${application.fullName} (${application.id})`);
  console.log(`   Recording status: ${application.interview?.recordingStatus}`);
  console.log(`   Recording URL:    ${application.interview?.interviewRecordingUrl || "NONE"}`);

  if (application.interview?.interviewRecordingUrl) {
    console.log(`\n✅ Recording already complete — no retry needed.`);
    console.log(`   URL: ${application.interview.interviewRecordingUrl}`);
    await prisma.$disconnect();
    return;
  }

  const manifest = application.interview?.recordingManifest as any;
  if (!manifest) {
    console.error(`❌ No manifest — chunks were never uploaded`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const sessionId = manifest.sessionId || "";
  const chunkUrls: string[] = (manifest.chunkEvents || [])
    .map((e: any) => String(e.chunkUrl || "").trim())
    .filter(Boolean);
  const mimeType = manifest.mimeType || application.interview?.recordingMimeType || "video/webm";

  console.log(`   Session ID:   ${sessionId || "NONE"}`);
  console.log(`   Chunk URLs:   ${chunkUrls.length}`);

  if (!sessionId && !chunkUrls.length) {
    console.error(`❌ No chunks in manifest — cannot retry`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Directly enqueue the merge job — no HTTP, no auth needed
  const job = await interviewRecordingQueue.add(
    "merge-recording",
    {
      applicationId: application.id,
      sessionId,
      chunkUrls,
      chunkKeys: [],
      chunkCount: manifest.chunksReceived || chunkUrls.length || null,
      durationSec: null,
      mimeType,
      startedAt: manifest.startedAt || null,
      completedAt: new Date().toISOString(),
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: { count: 20 },
    }
  );

  console.log(`\n🚀 Merge job queued: job ID = ${job.id}`);
  console.log(`   The worker will now download ${chunkUrls.length} chunks from R2 and merge them.`);
  console.log(`   Watch worker logs for [RECORDING_WORKER] entries.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
