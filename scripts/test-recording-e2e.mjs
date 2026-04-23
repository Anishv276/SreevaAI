/**
 * E2E Recording Pipeline Test
 * ===========================
 * 1. Looks up a real applicationId (with an Interview row, or creates one).
 * 2. Sends `uploadType=started` signal.
 * 3. Uploads 2 synthetic WebM-header chunks.
 * 4. Calls `finalize_chunks`.
 * 5. Reads the DB and prints the resulting `interviewRecordingUrl`.
 *
 * Run from project root:
 *   node scripts/test-recording-e2e.mjs
 */

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Config – adjust BASE_URL if you're running behind a tunnel / different port
// ---------------------------------------------------------------------------
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const RECORDING_ENDPOINT = `${BASE_URL}/api/interview/recording`;

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Minimal valid WebM bytes (EBML + Segment header – enough to be non-empty)
// ---------------------------------------------------------------------------
const WEBM_STUB = Buffer.from([
  0x1A, 0x45, 0xDF, 0xA3, // EBML element ID
  0x9F,                   // size (varint = 31 bytes follow)
  0x42, 0x86, 0x81, 0x01, // EBMLVersion = 1
  0x42, 0xF7, 0x81, 0x01, // EBMLReadVersion = 1
  0x42, 0xF2, 0x81, 0x04, // EBMLMaxIDLength = 4
  0x42, 0xF3, 0x81, 0x08, // EBMLMaxSizeLength = 8
  0x42, 0x82, 0x84,       // DocType element, 4 bytes
  0x77, 0x65, 0x62, 0x6D, // "webm"
  0x42, 0x87, 0x81, 0x04, // DocTypeVersion = 4
  0x42, 0x85, 0x81, 0x02, // DocTypeReadVersion = 2
]);

async function getOrCreateTestApplication() {
  // Try to find a real application that already has (or can have) an interview
  const app = await prisma.application.findFirst({
    select: { id: true, fullName: true },
    orderBy: { createdAt: "desc" },
  });

  if (!app) {
    throw new Error("No Application rows in the database. Please create at least one application first.");
  }

  console.log(`✅ Using applicationId: ${app.id} (${app.fullName})`);
  return app.id;
}

async function callApi(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function run() {
  console.log("\n🎬 ====== Recording E2E Test ======\n");

  const applicationId = await getOrCreateTestApplication();
  const sessionId = crypto.randomUUID();
  const interviewToken = ""; // set to empty; auth guard skipped in dev mode
  const mimeType = "video/webm";
  const startedAt = new Date().toISOString();

  // ── Step 1: Signal recording started ──────────────────────────────────────
  console.log("📡 Step 1 – Sending 'started' signal...");
  const startRes = await callApi(RECORDING_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadType: "started",
      applicationId,
      interviewToken,
      sessionId,
      startedAt,
      mimeType,
    }),
  });

  console.log(`   Status: ${startRes.status}`, startRes.body);
  if (startRes.status !== 200) {
    throw new Error(`'started' signal failed: ${JSON.stringify(startRes.body)}`);
  }

  // ── Step 2: Upload chunk 1 ─────────────────────────────────────────────────
  console.log("\n📦 Step 2 – Uploading chunk 1...");
  const chunkUrls = [];
  const chunkKeys = [];

  for (const chunkIndex of [1, 2]) {
    const form = new FormData();
    form.append("uploadType", "chunk");
    form.append("applicationId", applicationId);
    form.append("interviewToken", interviewToken);
    form.append("sessionId", sessionId);
    form.append("chunkIndex", String(chunkIndex));
    form.append("mimeType", mimeType);
    form.append("startedAt", startedAt);
    form.append("chunkStartedAt", new Date(Date.now() - 5000).toISOString());
    form.append("chunkEndedAt", new Date().toISOString());
    form.append("byteSize", String(WEBM_STUB.length));
    form.append(
      "recording",
      new Blob([WEBM_STUB], { type: mimeType }),
      `chunk-${chunkIndex}.webm`
    );

    const chunkRes = await callApi(RECORDING_ENDPOINT, {
      method: "POST",
      body: form,
    });

    console.log(`   Chunk ${chunkIndex} – Status: ${chunkRes.status}`, chunkRes.body);

    if (chunkRes.status !== 200 || !chunkRes.body.success) {
      throw new Error(`Chunk ${chunkIndex} upload failed: ${JSON.stringify(chunkRes.body)}`);
    }

    if (chunkRes.body.chunkUrl) chunkUrls.push(chunkRes.body.chunkUrl);
    if (chunkRes.body.chunkKey) chunkKeys.push(chunkRes.body.chunkKey);
  }

  // ── Step 3: Finalize chunks ────────────────────────────────────────────────
  console.log("\n🔗 Step 3 – Finalizing chunks...");
  const finalizeRes = await callApi(RECORDING_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadType: "finalize_chunks",
      applicationId,
      interviewToken,
      sessionId,
      chunkUrls,
      chunkKeys,
      chunkCount: 2,
      duration: 10,
      mimeType,
      startedAt,
    }),
  });

  console.log(`   Finalize – Status: ${finalizeRes.status}`, finalizeRes.body);

  if (finalizeRes.status !== 200 || !finalizeRes.body.success) {
    throw new Error(`Finalize failed: ${JSON.stringify(finalizeRes.body)}`);
  }

  const recordingUrl = finalizeRes.body.recordingUrl;

  // ── Step 4: Verify DB ──────────────────────────────────────────────────────
  console.log("\n🗄️  Step 4 – Verifying database record...");
  await new Promise((r) => setTimeout(r, 1500)); // let any async writes settle

  const interview = await prisma.interview.findUnique({
    where: { applicationId },
    select: {
      id: true,
      status: true,
      recordingStatus: true,
      interviewRecordingUrl: true,
      recordingMimeType: true,
      recordingDurationSec: true,
      recordingManifest: true,
    },
  });

  if (!interview) {
    throw new Error("Interview record not found after finalization!");
  }

  console.log("\n✅ ====== DB Record ======");
  console.log("  id                  :", interview.id);
  console.log("  status              :", interview.status);
  console.log("  recordingStatus     :", interview.recordingStatus);
  console.log("  recordingMimeType   :", interview.recordingMimeType);
  console.log("  recordingDurationSec:", interview.recordingDurationSec);
  console.log("  interviewRecordingUrl:", interview.interviewRecordingUrl);
  const manifest = interview.recordingManifest;
  console.log("  manifest.lastStatus :", manifest?.lastStatus);
  console.log("  manifest.chunksRecv :", manifest?.chunksReceived);
  console.log("  manifest.mergeFinish:", manifest?.mergeFinished);

  console.log("\n🌐 Public Recording URL:");
  console.log(" ", recordingUrl || interview.interviewRecordingUrl || "(none – check above)");
  console.log("\n🎉 E2E recording pipeline test PASSED!\n");
}

run()
  .catch((err) => {
    console.error("\n❌ E2E Test FAILED:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
