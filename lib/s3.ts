import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

/**
 * Standard upload function compatible with both JD and RESUME flows
 */
export const putObject = async (bucket: string, key: string, body: Buffer, contentType: string) => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  try {
    await r2Client.send(command);
    
    // Construct the public URL based on the user's provided public URL
    const publicUrlBase = process.env.NEXT_PUBLIC_R2_URL || "";

    return `${publicUrlBase.replace(/\/$/, '')}/${key}`;
  } catch (error) {
    console.error(`R2 Upload Error [${bucket}]:`, error);
    throw new Error(`Failed to upload ${key} to Cloudflare R2`);
  }
};

/**
 * Alias for backward compatibility if needed
 */
export const uploadToR2 = putObject;
