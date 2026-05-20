/**
 * retry_murali_recording.ts
 * Run with: npx tsx scratch/retry_murali_recording.ts
 *
 * Finds Murali Krishna's interview, reads manifest chunk URLs,
 * then calls the retry_merge API endpoint to re-queue the merge job.
 */

import { prisma } from "../lib/prisma";

async function main() {
  // 1. Find Murali Krishna's application
  const application = await prisma.application.findFirst({
    where: {
      fullName: { contains: "Murali", mode: "insensitive" },
    },
    select: {
      id: true,
      fullName: true,
      interview: {
        select: {
          recordingStatus: true,
          interviewRecordingUrl: true,
          recordingManifest: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!application) {
    console.error("❌ No application found for Murali");
    process.exit(1);
  }

  console.log(`✅ Found: ${application.fullName} (${application.id})`);
  console.log(`   Recording status: ${application.interview?.recordingStatus}`);
  console.log(`   Recording URL: ${application.interview?.interviewRecordingUrl || "NONE"}`);

  const manifest = application.interview?.recordingManifest as any;
  if (!manifest) {
    console.error("❌ No manifest found — chunks may not have been uploaded at all");
    process.exit(1);
  }

  console.log(`   Session ID: ${manifest.sessionId || "NONE"}`);
  console.log(`   Chunks received: ${manifest.chunksReceived || 0}`);
  console.log(`   Chunk URLs available: ${(manifest.chunkEvents || []).filter((e: any) => e.chunkUrl).length}`);

  if (!manifest.sessionId && !(manifest.chunkEvents?.length)) {
    console.error("❌ No session ID or chunk events in manifest — cannot retry merge");
    process.exit(1);
  }

  // 2. Call the retry_merge API
  console.log("\n🚀 Triggering retry_merge...");
  const res = await fetch(`http://localhost:3000/api/interview/recording`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadType: "retry_merge",
      applicationId: application.id,
      interviewToken: "",  // token validation skipped if REQUIRE_INTERVIEW_TOKEN=false
    }),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error("❌ API error:", result);
    process.exit(1);
  }

  console.log("✅ retry_merge response:", JSON.stringify(result, null, 2));
  console.log("\nDone! The merge worker will now download chunks from R2 and merge them.");
  console.log("Check worker logs for [RECORDING_WORKER] entries.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
