import "dotenv/config";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateId } from "../../lib/ids";
import { putObject, deleteObjectStrict, getKeyFromUrl } from "../../lib/s3";

const ca = readFileSync("./certs/supabase-root-ca.pem", "utf8");
const dbUrl = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || "");
dbUrl.searchParams.set("uselibpqcompat", "true");
dbUrl.searchParams.delete("sslmode");
const adapter = new PrismaPg({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: true, ca } });
const prisma = new PrismaClient({ adapter });

const ORG_ID = "org-lumoscale-8836";
const JOB_ID = "drv-gtm-engineer-fresher-3291";

// mirrors worker.ts's processSnapshotRetentionSweepJob body exactly, for isolated testing
async function processSnapshotRetentionSweepJob() {
  const rows = await prisma.$queryRaw<Array<{ applicationId: string; proctoringSnapshotUrls: string[] }>>(
    Prisma.sql`
      SELECT i."applicationId", i."proctoringSnapshotUrls"
      FROM "Interview" i
      JOIN "Application" a ON a.id = i."applicationId"
      JOIN "Job" d ON d.id = a."jobId"
      JOIN "OrganizationDetails" o ON o.id = d."organizationId"
      WHERE array_length(i."proctoringSnapshotUrls", 1) > 0
        AND o."recordingKeepForDays" IS NOT NULL
        AND i."interviewCompletedAt" IS NOT NULL
        AND i."interviewCompletedAt" + (GREATEST(o."recordingKeepForDays", 1) * INTERVAL '1 day') <= NOW()
      ORDER BY i."interviewCompletedAt" ASC
      LIMIT 100
    `
  );
  let deleted = 0, failed = 0;
  const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
  for (const row of rows) {
    const urls = row.proctoringSnapshotUrls || [];
    let allDeleted = true;
    for (const url of urls) {
      const key = getKeyFromUrl(url);
      if (!key) continue;
      try {
        await deleteObjectStrict(bucket, key);
      } catch (error: any) {
        const code = String(error?.name || error?.Code || "").toLowerCase();
        if (!code.includes("nosuchkey") && !code.includes("notfound")) {
          allDeleted = false;
          console.error(`[SNAPSHOT-RETENTION] Failed to delete ${key} for ${row.applicationId}: ${error?.message}`);
        }
      }
    }
    if (!allDeleted) { failed += 1; continue; }
    await prisma.interview.update({ where: { applicationId: row.applicationId }, data: { proctoringSnapshotUrls: [] } }).catch(() => {});
    deleted += 1;
  }
  return { success: true, deleted, failed };
}

async function main() {
  const org = await prisma.organizationDetails.findUniqueOrThrow({ where: { id: ORG_ID }, select: { recordingKeepForDays: true } });
  await prisma.organizationDetails.update({ where: { id: ORG_ID }, data: { recordingKeepForDays: 1 } });

  // upload 2 REAL small images to R2 so we can prove they actually get deleted
  const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
  const fakeImg = Buffer.from("test-image-content");
  const key1 = `interview/test-org/test-job/test-candidate/snapshots/sweep-test-1-${Date.now()}.jpg`;
  const key2 = `interview/test-org/test-job/test-candidate/snapshots/sweep-test-2-${Date.now()}.jpg`;
  const url1 = await putObject(bucket, key1, fakeImg, "image/jpeg");
  const url2 = await putObject(bucket, key2, fakeImg, "image/jpeg");
  console.log("Uploaded 2 real test snapshots to R2:", { url1, url2 });

  const appId = `${generateId("app", "sweep-full-test")}-${randomUUID().slice(0, 8)}`;
  await prisma.application.create({
    data: {
      id: appId, candidateFullName: "Full Sweep Test", candidateEmail: "", candidatePhone: "",
      jobId: JOB_ID, resumeFileUrl: "https://example.invalid/x.pdf",
      resumeScreeningStatus: "shortlisted", interviewPhaseStatus: "completed",
    },
  });
  const completedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  await prisma.interview.create({
    data: {
      id: generateId("int", appId), applicationId: appId, candidateInviteToken: randomUUID(),
      interviewStatus: "COMPLETED", interviewCompletedAt: completedAt,
      proctoringSnapshotUrls: [url1, url2],
    },
  });
  console.log(`Created test interview ${appId} with 2 REAL R2 snapshots, completed 3 days ago (retention=1 day)\n`);

  console.log("Running processSnapshotRetentionSweepJob()...");
  const result = await processSnapshotRetentionSweepJob();
  console.log("Sweep result:", result);

  const afterRow = await prisma.interview.findUnique({ where: { applicationId: appId }, select: { proctoringSnapshotUrls: true } });
  console.log("Interview.proctoringSnapshotUrls after sweep:", afterRow?.proctoringSnapshotUrls);
  console.log(afterRow?.proctoringSnapshotUrls.length === 0 ? "PASS: array cleared in DB." : "FAIL: array NOT cleared.");

  // confirm objects are actually gone from R2 (HEAD should fail)
  const { headObjectStrict } = await import("../../lib/s3");
  let stillExists1 = true, stillExists2 = true;
  try { await headObjectStrict(bucket, key1); } catch { stillExists1 = false; }
  try { await headObjectStrict(bucket, key2); } catch { stillExists2 = false; }
  console.log(!stillExists1 && !stillExists2 ? "PASS: both objects actually deleted from R2." : `FAIL: object still exists (key1 exists=${stillExists1}, key2 exists=${stillExists2})`);

  await prisma.organizationDetails.update({ where: { id: ORG_ID }, data: { recordingKeepForDays: org.recordingKeepForDays } });
  await prisma.interview.delete({ where: { applicationId: appId } }).catch(() => {});
  await prisma.application.delete({ where: { id: appId } }).catch(() => {});
  console.log("\nCleaned up test data and restored org setting.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
