import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { getPythonExecutable } from "../lib/python-exec";

const prisma = new PrismaClient();

function safeJsonParse(value: unknown, fallback: any = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === "string") return JSON.parse(value);
    return value;
  } catch {
    return fallback;
  }
}

function extractStructuredResume(raw: unknown) {
  const parsed = safeJsonParse(raw, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const obj = parsed as Record<string, any>;
  if (obj.structured && typeof obj.structured === "object" && !Array.isArray(obj.structured)) {
    return obj.structured;
  }
  if (obj.resume && typeof obj.resume === "object" && !Array.isArray(obj.resume)) {
    return obj.resume;
  }
  return obj;
}

async function main() {
  const applicationId = process.argv[2];
  if (!applicationId) {
    throw new Error("Usage: tsx scripts/inspect_candidate_rescan.ts <applicationId>");
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      fullName: true,
      resumeText: true,
      resumeData: true,
      aiReport: true,
      drive: {
        select: {
          id: true,
          title: true,
          description: true,
          screeningThreshold: true,
          screeningCriteria: true,
          orgId: true,
        },
      },
    },
  });

  if (!application) throw new Error("Application not found");
  if (!application.drive) throw new Error("Drive not found");

  let resumeText = application.resumeText || "";
  if (!resumeText && application.aiReport) {
    try {
      const report = JSON.parse(application.aiReport);
      resumeText = report.text || "";
    } catch {}
  }
  if (!resumeText) throw new Error("No resume text found");

  const structuredResume = extractStructuredResume(application.resumeData);

  const driveRows = await prisma.$queryRawUnsafe<Array<{ extractedDetails: string | null }>>(
    `SELECT "extractedDetails" FROM "Drive" WHERE id = $1 LIMIT 1`,
    application.drive.id,
  );

  const screeningSettings = safeJsonParse(application.drive.screeningCriteria, {});
  const threshold = Number(screeningSettings.threshold ?? application.drive.screeningThreshold ?? 0);
  const scoringInput = {
    resume: structuredResume,
    jd: safeJsonParse(driveRows?.[0]?.extractedDetails, {}),
    resume_raw_text: resumeText,
    jd_raw_text: application.drive.description || "",
    threshold,
    screening_criteria: screeningSettings.criteria || screeningSettings,
  };

  const tempInputPath = join(tmpdir(), `scan_${applicationId}_${Date.now()}.json`);
  await writeFile(tempInputPath, JSON.stringify(scoringInput));

  const python = getPythonExecutable();
  const proc = spawn(python, ["scripts/extract_pdf.py", tempInputPath, "SCORE", "gpt-4o"]);
  let outputData = "";
  let errorData = "";
  proc.stdout.on("data", (data) => {
    outputData += data.toString();
  });
  proc.stderr.on("data", (data) => {
    errorData += data.toString();
  });

  const exitCode = await new Promise<number>((resolve) => {
    proc.on("close", (code) => resolve(code ?? 1));
  });
  await unlink(tempInputPath).catch(() => {});

  if (exitCode !== 0) {
    throw new Error(errorData || `Python exited with code ${exitCode}`);
  }

  console.log(outputData);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
