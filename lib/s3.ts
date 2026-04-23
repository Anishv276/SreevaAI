import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const r2Endpoint = process.env.R2_ENDPOINT;
const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;

if (!r2Endpoint || !r2AccessKey || !r2SecretKey) {
  console.warn("WARNING: S3/R2 configuration is incomplete. Uploads and deletions will fail until R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are set in .env.");
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: r2Endpoint || "",
  forcePathStyle: true,
  credentials: {
    accessKeyId: r2AccessKey || "",
    secretAccessKey: r2SecretKey || "",
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
    if (!process.env.R2_ENDPOINT) {
      throw new Error("S3_UPLOAD_FAILED: Cloudflare R2 is not configured. Please set R2_ENDPOINT in your environment.");
    }
    await r2Client.send(command);

    // Construct the public URL based on the BUCKET TYPE
    let publicUrlBase = "";
    const bucketName = bucket.toLowerCase();

    if (bucketName.includes("logo")) {
        publicUrlBase = process.env.NEXT_PUBLIC_R2_LOGOS_URL || "";
    } else if (bucketName.includes("jd")) {
        publicUrlBase = process.env.NEXT_PUBLIC_R2_JDS_URL || "";
    } else if (bucketName.includes("certification")) {
        publicUrlBase = process.env.NEXT_PUBLIC_R2_CERTIFICATIONS_URL || "";
    } else if (bucketName.includes("passport")) {
        publicUrlBase = process.env.NEXT_PUBLIC_R2_PASSPORTS_URL || "https://pub-d82df8c40dbf4492b6a22bc1bf1ab505.r2.dev";
    } else if (bucketName.includes("interview")) {
        publicUrlBase = process.env.NEXT_PUBLIC_R2_INTERVIEW_URL || "https://pub-e4a8b24775c741f6a650def856cfec9f.r2.dev";
    } else {
        // Default to Resumes
        publicUrlBase = process.env.NEXT_PUBLIC_R2_RESUMES_URL || "";
    }

    return `${publicUrlBase.replace(/\/$/, '')}/${key}`;
  } catch (error) {
    console.error(`R2 Upload Error [${bucket}]:`, error);
    throw new Error(`Failed to upload ${key} to Cloudflare R2`);
  }
};

/**
 * Deletes an object from Cloudflare R2. 
 * Use this to cleanup old resumes, logos, or JDs when records are deleted in the app.
 */
export const deleteObject = async (bucket: string, key: string) => {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    
    // Normalize key: remove any leading slash R2/S3 doesn't like them in the Key field
    const normalizedKey = key.startsWith('/') ? key.substring(1) : key;

    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
    });

    try {
        if (!process.env.R2_ENDPOINT) {
      throw new Error("S3_UPLOAD_FAILED: Cloudflare R2 is not configured. Please set R2_ENDPOINT in your environment.");
    }
    await r2Client.send(command);
        console.log(`Successfully deleted ${normalizedKey} from bucket ${bucket}`);
        return true;
    } catch (error) {
        console.error(`R2 Deletion Error [${bucket}/${key}]:`, error);
        return false;
    }
};

/**
 * Extracts the Key (file path) from a public R2 URL.
 * Handles the different public domain structures provided.
 */
export const getKeyFromUrl = (url: string) => {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        // The pathname usually starts with /, we strip it to get the S3 Key
        const key = urlObj.pathname.substring(1);
        
        // Handle cases where the public URL includes the bucket name as the first segment
        // e.g. https://pub-abc.r2.dev/resumes/my-key.pdf -> resumes/my-key.pdf
        // If we know the buckets specifically, we could strip them.
        // For now, most R2 setups use custom domains where the path IS the key.
        return key;
    } catch {
        return null; // Not a valid URL
    }
};

/**
 * Generates a presigned URL for direct client-side uploads.
 * Essential for large PDF resumes and JD documents to avoid server timeouts.
 */
export const getPresignedUploadUrl = async (bucket: string, key: string, contentType: string) => {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
    });

    // Valid for 10 minutes
    return await getSignedUrl(r2Client, command, { expiresIn: 600 });
};

export const uploadToR2 = putObject;

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const getObjectBuffer = async (bucket: string, key: string): Promise<Buffer> => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key.startsWith("/") ? key.slice(1) : key,
  });
  const response = await r2Client.send(command);
  if (!response.Body) {
    throw new Error(`R2 object has no body: ${bucket}/${key}`);
  }
  return streamToBuffer(response.Body as NodeJS.ReadableStream);
};

export type ListedObject = {
  key: string;
  lastModified: Date | null;
  size: number | null;
};

export const listObjects = async (bucket: string, prefix: string): Promise<ListedObject[]> => {
  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });
  const response = await r2Client.send(command);
  return (response.Contents || [])
    .map((item) => ({
      key: String(item.Key || ""),
      lastModified: item.LastModified || null,
      size: typeof item.Size === "number" ? item.Size : null,
    }))
    .filter((item) => !!item.key);
};
