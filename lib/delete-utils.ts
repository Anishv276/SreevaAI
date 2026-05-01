import { deleteObject, getKeyFromUrl } from "@/lib/s3";

export type UrlDeletionTarget = {
    url?: string | null;
    bucket?: string;
};

export function inferBucketFromUrl(url: string, fallbackBucket: string) {
    const normalized = url.toLowerCase();
    if (normalized.includes("logo")) return process.env.R2_LOGOS_BUCKET || "logos";
    if (normalized.includes("jd")) return process.env.R2_JDS_BUCKET || "jds";
    if (normalized.includes("interview")) return process.env.R2_INTERVIEW_BUCKET || "interviews";
    return fallbackBucket;
}

export async function deleteUrlTargets(
    targets: Array<UrlDeletionTarget | string>,
    fallbackBucket = "resumes"
) {
    await Promise.allSettled(
        targets.map(async (target) => {
            const url = typeof target === "string" ? target : target.url;
            if (!url) return;

            const key = getKeyFromUrl(url);
            if (!key) return;

            const bucket =
                typeof target === "string"
                    ? inferBucketFromUrl(target, fallbackBucket)
                    : target.bucket || inferBucketFromUrl(url, fallbackBucket);

            await deleteObject(bucket, key);
        })
    );
}
