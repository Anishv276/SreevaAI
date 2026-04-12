import { Pinecone } from "@pinecone-database/pinecone";

/**
 * Interface for the metadata stored in Pinecone
 */
export interface CandidateMetadata {
    applicationId: string;
    orgId: string;
    fullName: string;
    email: string;
    jobTitle: string;
    driveId: string;
    status: string;         // hiringStatus: pending, shortlisted, rejected, hired
    resumeStatus: string;   // shortlisted, rejected, pending
    aiScore: number;        // 0-100 screening score
    contentChunk: string;
    type: "resume" | "transcript" | "summary" | "report";
    createdAt: string;
}

const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX_NAME || "transcripts";

if (!apiKey) {
    console.warn("PINECONE_API_KEY is not set in environment variables.");
}

const pc = new Pinecone({
    apiKey: apiKey!,
});

export const pineconeIndex = pc.index(indexName);

/**
 * Helpers for managing embeddings in Pinecone
 */

/**
 * Upsert a candidate's data to Pinecone
 */
export async function upsertCandidateEmbedding(
    id: string, 
    vector: number[], 
    metadata: CandidateMetadata
) {
    try {
        await pineconeIndex.upsert([
            {
                id,
                values: vector,
                metadata: metadata as any,
            },
        ] as any);
        console.log(`[PINECONE_UPSERT_SUCCESS]: ${metadata.fullName} (${metadata.type})`);
    } catch (error: any) {
        console.error("[PINECONE_UPSERT_ERROR]:", error.message);
        throw error;
    }
}

/**
 * Query Pinecone for relevant candidates
 */
export async function queryCandidates(
    vector: number[], 
    topK: number = 5,
    filter?: object
) {
    try {
        const queryResponse = await pineconeIndex.query({
            vector,
            topK,
            includeMetadata: true,
            filter,
        });
        
        return queryResponse.matches;
    } catch (error: any) {
        console.error("[PINECONE_QUERY_ERROR]:", error.message);
        throw error;
    }
}

/**
 * Delete a candidate's embeddings
 */
export async function deleteCandidateEmbeddings(applicationId: string) {
    try {
        // Delete all chunks (resume, transcript, etc.) for this application
        // Use deleteMany with a filter — cast to any to handle SDK version differences
        await (pineconeIndex as any).deleteMany({ filter: { applicationId: { "$eq": applicationId } } })
            .catch(() => pineconeIndex.deleteMany({ applicationId: { "$eq": applicationId } } as any));
        console.log(`[PINECONE_DELETE_SUCCESS]: ${applicationId}`);
    } catch (error: any) {
        console.error("[PINECONE_DELETE_ERROR]:", error.message);
        throw error;
    }
}

/**
 * Delete all embeddings associated with a specific Drive
 */
export async function deleteDriveEmbeddings(driveId: string) {
    try {
        await (pineconeIndex as any).deleteMany({ filter: { driveId: { "$eq": driveId } } })
            .catch(() => pineconeIndex.deleteMany({ driveId: { "$eq": driveId } } as any));
        console.log(`[PINECONE_DRIVE_DELETE_SUCCESS]: ${driveId}`);
    } catch (error: any) {
        console.error("[PINECONE_DRIVE_DELETE_ERROR]:", error.message);
        throw error;
    }
}
