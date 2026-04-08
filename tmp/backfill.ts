
import { PrismaClient } from "@prisma/client";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const prisma = new PrismaClient();

const endpoint = process.env.R2_ENDPOINT || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const resumesBucket = process.env.R2_RESUMES_BUCKET || "resumes";
const interviewBucket = process.env.R2_INTERVIEW_BUCKET || "interview";
const interviewPublicBase = (process.env.NEXT_PUBLIC_R2_INTERVIEW_URL || "").replace(/\/$/, "");

const s3 = new S3Client({
  region: "auto",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

function candidateRoleKey(fullName?: string | null, roleTitle?: string | null, fallback?: string) {
  const raw = [fullName, roleTitle].filter(Boolean).join(" - ") || fallback || "candidate";
  return raw
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function isRecordingKey(key: string) {
  const lower = key.toLowerCase();
  return lower.endsWith(".webm") || lower.endsWith(".mp4") || lower.endsWith(".mkv");
}

function isSnapshotKey(key: string) {
  const lower = key.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
}

async function listKeys(bucket: string, prefix: string) {
  const resp = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 200,
    })
  );
  return (resp.Contents || []).map((o) => o.Key).filter((k): k is string => Boolean(k));
}

async function main() {
  if (!endpoint || !accessKeyId || !secretAccessKey || !interviewPublicBase) {
    throw new Error("Missing R2 credentials or NEXT_PUBLIC_R2_INTERVIEW_URL");
  }

  const onlyAppId = process.argv[2] || null;
  console.log("Backfill started", { onlyAppId, resumesBucket, interviewBucket });

  const interviews = await prisma.interview.findMany({
    where: onlyAppId
      ? { applicationId: onlyAppId }
      : {
          OR: [{ interviewRecordingUrl: null }, { interviewRecordingUrl: { contains: "/interviews/recordings/" } }],
        },
    include: {
      application: {
        select: {
          fullName: true,
          drive: { select: { title: true } },
        },
      },
    },
  });

  let updated = 0;
  let migrated = 0;
  let missing = 0;
  let snapshotsMigrated = 0;

  for (const interview of interviews) {
    const appId = interview.applicationId;
    const safe = candidateRoleKey(
      interview.application?.fullName,
      interview.application?.drive?.title,
      appId
    );
    const legacySafeByName = candidateRoleKey(interview.application?.fullName, null, appId);
    const targetPrefix = `candidates/${safe}/recordings/`;

    // Normalize legacy snapshot location: candidates/<name>/file.jpg -> candidates/<name>/snapshots/file.jpg
    const candidateRoot = `candidates/${safe}/`;
    const existingCandidateKeys = await listKeys(interviewBucket, candidateRoot);
    for (const key of existingCandidateKeys) {
      const suffix = key.slice(candidateRoot.length);
      if (!suffix || suffix.includes("/")) continue;
      if (!isSnapshotKey(key)) continue;

      const snapshotTargetKey = `${candidateRoot}snapshots/${suffix}`;
      await s3.send(
        new CopyObjectCommand({
          Bucket: interviewBucket,
          CopySource: `/${interviewBucket}/${key}`,
          Key: snapshotTargetKey,
        })
      );
      await s3.send(
        new DeleteObjectCommand({
          Bucket: interviewBucket,
          Key: key,
        })
      );
      snapshotsMigrated += 1;
      console.log(`[SNAPSHOT-MIGRATED] ${key} -> ${snapshotTargetKey}`);
    }

    const existingTarget = (await listKeys(interviewBucket, targetPrefix)).filter(isRecordingKey);
    if (existingTarget.length > 0) {
      const targetKey = existingTarget.sort().at(-1) as string;
      const url = `${interviewPublicBase}/${targetKey}`;
      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          interviewRecordingUrl: url,
          interviewRecordedAt: interview.interviewRecordedAt || new Date(),
        },
      });
      updated += 1;
      console.log(`[FOUND] ${appId} -> ${targetKey}`);
      continue;
    }

    const legacyCandidates = [
      { bucket: resumesBucket, keys: await listKeys(resumesBucket, `interviews/recordings/${appId}/`) },
      { bucket: interviewBucket, keys: await listKeys(interviewBucket, `interviews/recordings/${appId}/`) },
      { bucket: interviewBucket, keys: await listKeys(interviewBucket, `candidates/${safe}/`) },
      { bucket: interviewBucket, keys: await listKeys(interviewBucket, `candidates/${legacySafeByName}/`) },
      { bucket: interviewBucket, keys: await listKeys(interviewBucket, `candidates/${appId}/`) },
    ];

    let sourceBucket = "";
    let sourceKey = "";
    for (const item of legacyCandidates) {
      const key = item.keys.filter(isRecordingKey).sort().at(-1);
      if (key) {
        sourceBucket = item.bucket;
        sourceKey = key;
        break;
      }
    }

    if (!sourceKey) {
      missing += 1;
      console.log(`[MISSING] ${appId} no recording object found in legacy locations`);
      continue;
    }

    const fileName = sourceKey.split("/").pop() || `${appId}.webm`;
    const targetKey = `${targetPrefix}${Date.now()}-${fileName}`;

    await s3.send(
      new CopyObjectCommand({
        Bucket: interviewBucket,
        CopySource: `/${sourceBucket}/${sourceKey}`,
        Key: targetKey,
      })
    );

    if (sourceBucket !== interviewBucket) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: sourceBucket,
          Key: sourceKey,
        })
      );
    }

    const url = `${interviewPublicBase}/${targetKey}`;
    await prisma.interview.update({
      where: { id: interview.id },
      data: {
        interviewRecordingUrl: url,
        interviewRecordedAt: interview.interviewRecordedAt || new Date(),
      },
    });

    migrated += 1;
    updated += 1;
    console.log(`[MIGRATED] ${appId} ${sourceBucket}/${sourceKey} -> ${interviewBucket}/${targetKey}`);
  }

  console.log("Backfill complete", {
    scanned: interviews.length,
    updated,
    migrated,
    missing,
    snapshotsMigrated,
  });
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
