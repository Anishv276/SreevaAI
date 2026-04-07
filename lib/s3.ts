import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true, // Recommended for Cloudflare R2 and S3-compatible storage
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
        let key = urlObj.pathname.substring(1);
        
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
