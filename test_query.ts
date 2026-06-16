import { config } from "dotenv";
config();

async function main() {
  const { prisma } = await import("./lib/prisma");
  const now = new Date();
  const mergedEvents = [{ eventType: "tab_switch", timestamp: Date.now() }];
  
  try {
    const res = await prisma.$executeRawUnsafe(
        `
        UPDATE "Interview"
        SET "integritySignals" = $1::jsonb,
            "updatedAt" = $2
        WHERE "applicationId" = $3
        `,
        JSON.stringify(mergedEvents),
        now,
        "dummy_application_id"
    );
    console.log("Success:", res);
  } catch (e) {
    console.error("Error:", e);
  }
}

main().catch(console.error);
