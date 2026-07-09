require("dotenv/config");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const prisma = new PrismaClient();

const r2Endpoint = process.env.R2_ENDPOINT;
const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";

const r2Client = new S3Client({
  region: "auto",
  endpoint: r2Endpoint || "",
  forcePathStyle: true,
  credentials: {
    accessKeyId: r2AccessKey || "",
    secretAccessKey: r2SecretKey || "",
  },
});

function buildCandidateRoleFolder(fullName, roleTitle, fallbackId) {
  const raw = [fullName, roleTitle].filter(Boolean).join(" - ") || fallbackId || "candidate";
  return raw
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function sortChunkKeys(keys) {
  return [...keys].sort((a, b) => {
    const aMatch = a.match(/part-(\d+)\.webm$/i);
    const bMatch = b.match(/part-(\d+)\.webm$/i);
    const aNum = aMatch ? Number.parseInt(aMatch[1], 10) : Number.MAX_SAFE_INTEGER;
    const bNum = bMatch ? Number.parseInt(bMatch[1], 10) : Number.MAX_SAFE_INTEGER;
    return aNum - bNum;
  });
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function listObjects(prefix) {
  const response = await r2Client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  }));
  return (response.Contents || [])
    .map((item) => ({
      key: String(item.Key || ""),
      lastModified: item.LastModified || null,
    }))
    .filter((item) => item.key);
}

async function getObjectBuffer(key) {
  const response = await r2Client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key.startsWith("/") ? key.slice(1) : key,
  }));
  if (!response.Body) {
    throw new Error(`R2 object has no body: ${key}`);
  }
  return streamToBuffer(response.Body);
}

async function putObject(key, body, contentType) {
  await r2Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  const publicBase = process.env.NEXT_PUBLIC_R2_INTERVIEW_URL || "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev";
  return `${publicBase.replace(/\/$/, "")}/${key}`;
}

async function deleteObject(key) {
  await r2Client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key.startsWith("/") ? key.slice(1) : key,
  }));
}

async function main() {
  const applicationId = process.argv[2];
  if (!applicationId) {
    throw new Error("Usage: node scripts/recover-interview-recording.cjs <applicationId>");
  }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      fullName: true,
      job: { select: { title: true } },
      interview: {
        select: {
          interviewDuration: true,
        },
      },
    },
  });

  if (!app) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  const safeCandidate = buildCandidateRoleFolder(app.fullName, app.job?.title, applicationId);
  const prefix = `candidates/${safeCandidate}/recordings/.chunks/`;
  const objects = await listObjects(prefix);

  if (!objects.length) {
    throw new Error(`No recording chunks found under ${prefix}`);
  }

  const sessions = new Map();
  for (const object of objects) {
    const match = object.key.match(/\/recordings\/\.chunks\/([^/]+)\//);
    if (!match) continue;
    const sessionId = match[1];
    const current = sessions.get(sessionId) || { keys: [], lastModified: 0 };
    current.keys.push(object.key);
    current.lastModified = Math.max(current.lastModified, object.lastModified ? object.lastModified.getTime() : 0);
    sessions.set(sessionId, current);
  }

  if (!sessions.size) {
    throw new Error(`No session folders found under ${prefix}`);
  }

  const [sessionId, sessionData] = Array.from(sessions.entries()).sort((a, b) => {
    const countDiff = b[1].keys.length - a[1].keys.length;
    if (countDiff !== 0) return countDiff;
    return b[1].lastModified - a[1].lastModified;
  })[0];

  const sortedKeys = sortChunkKeys(sessionData.keys);
  console.log(`[RECOVERY] Using session ${sessionId} with ${sortedKeys.length} chunks`);

  const buffers = [];
  for (const key of sortedKeys) {
    buffers.push(await getObjectBuffer(key));
  }

  const finalBuffer = Buffer.concat(buffers);
  const finalKey = `candidates/${safeCandidate}/recordings/${Date.now()}-interview-${sessionId}.webm`;
  const recordingUrl = await putObject(finalKey, finalBuffer, "video/webm");
  const completedAt = new Date();
  const durationSec = app.interview?.interviewDuration ?? Math.max(1, Math.round((sortedKeys.length * 5_000) / 1000));

  await prisma.interview.upsert({
    where: { applicationId },
    update: {
      interviewRecordingUrl: recordingUrl,
      interviewRecordedAt: completedAt,
      interviewDuration: durationSec,
      status: "COMPLETED",
      recordingStatus: "COMPLETED",
      recordingMimeType: "video/webm",
      recordingCompletedAt: completedAt,
      recordingDurationSec: durationSec,
      updatedAt: completedAt,
    },
    create: {
      id: crypto.randomUUID(),
      applicationId,
      accessToken: crypto.randomUUID(),
      interviewRecordingUrl: recordingUrl,
      interviewRecordedAt: completedAt,
      interviewDuration: durationSec,
      status: "COMPLETED",
      recordingStatus: "COMPLETED",
      recordingMimeType: "video/webm",
      recordingCompletedAt: completedAt,
      recordingDurationSec: durationSec,
      createdAt: completedAt,
      updatedAt: completedAt,
    },
  });

  await Promise.all(sortedKeys.map((key) => deleteObject(key).catch(() => false)));

  console.log(`[RECOVERY] Final recording URL saved: ${recordingUrl}`);
  console.log(`[RECOVERY] DB updated for application ${applicationId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
