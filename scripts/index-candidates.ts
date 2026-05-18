import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { syncCandidateCorpusToPinecone } from "../lib/pinecone";

dotenv.config();

const prisma = new PrismaClient();

async function indexAllCandidates() {
  console.log("🚀 Starting candidate indexing process...");

  try {
    const applications = await prisma.application.findMany({
      include: {
        interview: true,
        drive: true,
      },
    });

    console.log(`Found ${applications.length} applications to process.`);

    for (const app of applications) {
      console.log(`\nProcessing: ${app.fullName} [${app.id}]`);

      const syncResult = await syncCandidateCorpusToPinecone({
        applicationId: app.id,
        orgId: app.drive?.orgId || "",
        fullName: app.fullName || "",
        email: app.email || "",
        jobTitle: app.drive?.title || "",
        driveId: app.driveId,
        status: app.hiringStatus || app.resumeStatus || "pending",
        resumeStatus: app.resumeStatus || "pending",
        aiScore: app.aiScore ?? 0,
        createdAt: app.createdAt.toISOString(),
        documents: [
          {
            type: "resume",
            text: app.resumeText,
            createdAt: app.createdAt.toISOString(),
          },
          {
            type: "resume_report",
            text: app.aiReport,
            createdAt: app.updatedAt.toISOString(),
          },
          {
            type: "interview_transcript",
            text: app.interview?.interviewTranscript,
            createdAt: app.interview?.createdAt?.toISOString() || app.updatedAt.toISOString(),
          },
          {
            type: "interview_report",
            text: app.interview?.interviewReport,
            createdAt: app.interview?.updatedAt?.toISOString() || app.updatedAt.toISOString(),
          },
        ],
      });

      console.log(
        `  [SYNC] indexed=${syncResult.indexedCount}, skipped=${syncResult.skippedCount}, failed=${syncResult.failedCount}`
      );
      for (const error of syncResult.errors) {
        console.error(`  [${error.type.toUpperCase()}_INDEX_ERR]: ${error.error}`);
      }
    }

    console.log("\n✅ Indexing complete!");
  } catch (error: any) {
    console.error("❌ Fatal indexing error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

indexAllCandidates();
