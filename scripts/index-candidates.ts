import { PrismaClient } from "@prisma/client";
import { getEmbedding } from "../lib/openai";
import { upsertCandidateEmbedding } from "../lib/pinecone";
import * as dotenv from "dotenv";

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

            const sharedMeta = {
                applicationId: app.id,
                orgId: app.drive.orgId || "",
                fullName: app.fullName,
                email: app.email,
                jobTitle: app.drive.title,
                driveId: app.driveId,
                status: app.hiringStatus,
                resumeStatus: app.resumeStatus,
                aiScore: app.aiScore ?? 0,
            };

            // --- A. Resume ---
            if (app.resumeText) {
                try {
                    const vector = await getEmbedding(app.resumeText);
                    await upsertCandidateEmbedding(`${app.id}-resume`, vector, {
                        ...sharedMeta,
                        contentChunk: app.resumeText.substring(0, 3000),
                        type: "resume",
                        createdAt: app.createdAt.toISOString(),
                    });
                } catch (err: any) {
                    console.error(`  [RESUME_INDEX_ERR]: ${err.message}`);
                }
            }

            // --- B. Interview Transcript ---
            if (app.interview?.interviewTranscript) {
                try {
                    const vector = await getEmbedding(app.interview.interviewTranscript);
                    await upsertCandidateEmbedding(`${app.id}-transcript`, vector, {
                        ...sharedMeta,
                        contentChunk: app.interview.interviewTranscript.substring(0, 3000),
                        type: "transcript",
                        createdAt: app.interview.createdAt.toISOString(),
                    });
                } catch (err: any) {
                    console.error(`  [TRANSCRIPT_INDEX_ERR]: ${err.message}`);
                }
            }

            // --- C. AI Summary ---
            if (app.interview?.aiSummary) {
                try {
                    const vector = await getEmbedding(app.interview.aiSummary);
                    await upsertCandidateEmbedding(`${app.id}-summary`, vector, {
                        ...sharedMeta,
                        contentChunk: app.interview.aiSummary.substring(0, 3000),
                        type: "summary",
                        createdAt: app.interview.createdAt.toISOString(),
                    });
                } catch (err: any) {
                    console.error(`  [SUMMARY_INDEX_ERR]: ${err.message}`);
                }
            }

            // --- D. AI Report ---
            if (app.aiReport) {
                try {
                    const vector = await getEmbedding(app.aiReport);
                    await upsertCandidateEmbedding(`${app.id}-report`, vector, {
                        ...sharedMeta,
                        contentChunk: app.aiReport.substring(0, 3000),
                        type: "report",
                        createdAt: app.createdAt.toISOString(),
                    });
                } catch (err: any) {
                    console.error(`  [REPORT_INDEX_ERR]: ${err.message}`);
                }
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