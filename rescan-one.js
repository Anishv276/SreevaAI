const { PrismaClient } = require("@prisma/client");
const { spawn } = require("child_process");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");

const prisma = new PrismaClient();

async function rescan(id) {
  try {
    const application = await prisma.application.findUnique({
      where: { id },
      include: { drive: true }
    });

    if (!application) throw new Error("Application not found");

    const resumeText = application.resumeText || "";
    if (!resumeText) throw new Error("No resume text found");

    const jdText = application.drive.description;
    const scoringInput = { 
        resume: JSON.parse(application.structuredResume || "{}"), 
        jd: JSON.parse(application.drive.extractedDetails || "{}"),
        resume_raw_text: resumeText,
        jd_raw_text: jdText
    };

    const tempInputPath = join(tmpdir(), `rescan_script_${Date.now()}.json`);
    await writeFile(tempInputPath, JSON.stringify(scoringInput));

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    console.log(`[RE-SCAN] Running AI analysis for ${application.email}...`);

    let outputData = "";
    let errorData = "";

    await new Promise((resolve, reject) => {
      const py = spawn(pythonCmd, ["scripts/extract_pdf.py", tempInputPath, "SCORE"]);
      py.stdout.on("data", (data) => outputData += data.toString());
      py.stderr.on("data", (data) => console.error(data.toString())); // Real-time stderr
      py.on("close", (code) => {
        if (code !== 0) reject(new Error("Python failed"));
        else resolve(null);
      });
    });

    const parsed = JSON.parse(outputData);
    const aiResult = parsed.data || parsed;
    await unlink(tempInputPath).catch(() => {});

    // Update DB
    const score = aiResult.score || 0;
    const threshold = application.drive.screeningThreshold || 60;
    const resumeStatus = score >= threshold ? 'ACCEPTED' : 'REJECTED';

    await prisma.application.update({
      where: { id },
      data: {
        status: resumeStatus,
        aiScore: score,
        aiReport: JSON.stringify(aiResult)
      }
    });

    console.log(`[SUCCESS] Candidate updated. Score: ${score}, Status: ${resumeStatus}`);
    console.log(`[INFO] Report data: ${JSON.stringify(aiResult, null, 2).substring(0, 500)}...`);

  } catch (err) {
    console.error("FAIL:", err);
  }
}

const id = "cmnma3rbx0001vsk4mbv5rbg7"; // Vadla Vamsi Krishna
rescan(id).finally(() => prisma.$disconnect());
