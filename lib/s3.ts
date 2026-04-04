import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * CLOUDFLARE R2 CLIENT
 * Cloudflare R2 uses the S3 protocol. 
 */
const r2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;

/**
 * Generate a Presigned URL for UPLOADING a file directly from the browser to R2.
 * This keeps the Next.js server fast and avoids body-size limits.
 */
export async function getPresignedUploadUrl(key: string, contentType: string) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });

    // URL expires in 15 minutes
    return await getSignedUrl(r2Client, command, { expiresIn: 900 });
}

/**
 * Generate a Presigned URL for DOWNLOADING/VIEWING a file.
 */
export async function getPresignedDownloadUrl(key: string) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });

    // URL expires in 1 hour
    return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

/**
 * Upload a file DIRECTLY from the server to R2.
 * Used for background jobs like database backups.
 */
export async function putObject(bucket: string, key: string, body: Buffer | string, contentType: string) {
    const command = new PutObjectCommand({
        Bucket: bucket === "resumes" ? BUCKET_NAME : bucket, 
        Key: key,
        Body: body,
        ContentType: contentType,
    });

    return await r2Client.send(command);
}

export default r2Client;


