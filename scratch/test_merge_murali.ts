import dotenv from "dotenv";
import { getObjectBuffer, putObject, listObjects } from "../lib/s3";
import { spawn } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, unlink } from "fs/promises";
import fs from "fs";

dotenv.config();

async function run() {
  const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
  const sessionId = "33eb2f30-4421-4896-b88d-7b3751a71e48";
  const prefix = `candidates/kotha_murali_krishna_-_generative_ai_agentic_ai_engineer_intern_recruitment_drive/recordings/.chunks/${sessionId}/`;
  
  console.log("Listing chunks...");
  const objects = await listObjects(bucket, prefix);
  console.log(`Found ${objects.length} chunks`);
  
  const sorted = objects
    .map((o) => o.key)
    .sort((a, b) => {
      const aNum = Number(a.match(/part-(\d+)\.webm$/i)?.[1] ?? 99999);
      const bNum = Number(b.match(/part-(\d+)\.webm$/i)?.[1] ?? 99999);
      return aNum - bNum;
    });

  const tmpDir = tmpdir();
  const chunkPaths: string[] = [];
  
  console.log("Downloading first 30 chunks to test...");
  // Let's download all or a subset to test. Let's do 50 chunks first.
  const limit = Math.min(sorted.length, 50);
  for (let i = 0; i < limit; i++) {
    const key = sorted[i];
    console.log(`Downloading chunk ${i}: ${key}`);
    const buf = await getObjectBuffer(bucket, key);
    const p = join(tmpDir, `murali-chunk-${i}.webm`);
    await writeFile(p, buf);
    chunkPaths.push(p);
  }
  
  const concatListPath = join(tmpDir, "murali-concat.txt");
  const concatContent = chunkPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  await writeFile(concatListPath, concatContent);
  
  const outputPath = join(tmpDir, "murali-test-merged.mp4");
  
  console.log("Running ffmpeg direct transcode...");
  await new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputPath,
    ]);
    ff.stderr.on("data", (d) => {
      console.log(`[FFMPEG] ${d.toString().trim()}`);
    });
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Exit code ${code}`));
    });
  });
  
  const stat = fs.statSync(outputPath);
  console.log(`Merged file size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  
  // Clean up
  for (const p of chunkPaths) {
    await unlink(p).catch(() => {});
  }
  await unlink(concatListPath).catch(() => {});
  await unlink(outputPath).catch(() => {});
}

run().catch(console.error);
