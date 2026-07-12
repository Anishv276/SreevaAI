import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateId } from "../../lib/ids";
import { randomUUID } from "crypto";

const ca = readFileSync("./certs/supabase-root-ca.pem", "utf8");
const dbUrl = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || "");
dbUrl.searchParams.set("uselibpqcompat", "true");
dbUrl.searchParams.delete("sslmode");
const adapter = new PrismaPg({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: true, ca } });
const prisma = new PrismaClient({ adapter });

const ORG_ID = "org-lumoscale-8836";
const JOB_ID = "drv-gtm-engineer-fresher-3291";

async function main() {
  // set org's recording retention to 1 day so an old-enough test row qualifies
  const org = await prisma.organizationDetails.findUniqueOrThrow({ where: { id: ORG_ID }, select: { recordingKeepForDays: true, isRecordingEnabled: true } });
  console.log("Current org retention setting:", org);
  await prisma.organizationDetails.update({ where: { id: ORG_ID }, data: { recordingKeepForDays: 1 } });

  const appId = `${generateId("app", "snap-retention-test")}-${randomUUID().slice(0, 8)}`;
  await prisma.application.create({
    data: {
      id: appId,
      candidateFullName: "Snapshot Retention Test",
      candidateEmail: "",
      candidatePhone: "",
      jobId: JOB_ID,
      resumeFileUrl: "https://example.invalid/test-resume.pdf",
      resumeScreeningStatus: "shortlisted",
      interviewPhaseStatus: "completed",
    },
  });
  const completedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago, past 1-day retention
  await prisma.interview.create({
    data: {
      id: generateId("int", appId),
      applicationId: appId,
      candidateInviteToken: randomUUID(),
      interviewStatus: "COMPLETED",
      interviewCompletedAt: completedAt,
      proctoringSnapshotUrls: [
        "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev/interview/test-org/test-job/test-candidate/snapshots/does-not-exist-1.jpg",
        "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev/interview/test-org/test-job/test-candidate/snapshots/does-not-exist-2.jpg",
      ],
    },
  });
  console.log(`Created test interview ${appId} with 2 snapshot URLs, completed ${completedAt.toISOString()} (3 days ago, retention=1 day)`);

  // run the sweep query directly (same SQL as worker.ts) to confirm it's picked up
  const { Prisma } = await import("@prisma/client");
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
  console.log(`Sweep query found ${rows.length} interview(s) due for snapshot cleanup.`);
  const found = rows.find((r) => r.applicationId === appId);
  console.log(found ? "PASS: test row correctly picked up by the sweep query." : "FAIL: test row NOT picked up.");

  // cleanup: restore org setting, delete test rows
  await prisma.organizationDetails.update({ where: { id: ORG_ID }, data: { recordingKeepForDays: org.recordingKeepForDays } });
  await prisma.interview.delete({ where: { applicationId: appId } }).catch(() => {});
  await prisma.application.delete({ where: { id: appId } }).catch(() => {});
  console.log("Cleaned up test data and restored org setting.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
