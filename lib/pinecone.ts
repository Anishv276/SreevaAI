import { Pinecone } from "@pinecone-database/pinecone";
import { getEmbedding } from "./openai";

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
    type: "resume" | "resume_report" | "interview_transcript" | "interview_report";
    createdAt: string;
    chunkIndex?: number;
    chunkCount?: number;
    chunkSizeChars?: number;
}

export type CandidatePineconeContentType = CandidateMetadata["type"];

export type CandidatePineconeDocument = {
    type: CandidatePineconeContentType;
    text: unknown;
    createdAt: string;
};

export type CandidatePineconeSyncInput = {
    applicationId: string;
    orgId: string;
    fullName: string;
    email: string;
    jobTitle: string;
    driveId: string;
    status: string;
    resumeStatus: string;
    aiScore: number;
    createdAt: string;
    maxCharsPerChunk?: number;
    documents: CandidatePineconeDocument[];
};

export type CandidatePineconeSyncResult = {
    indexedCount: number;
    skippedCount: number;
    failedCount: number;
    errors: Array<{ type: CandidatePineconeContentType; error: string }>;
};

const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX_NAME || "transcripts";
const DEFAULT_PINECONE_CHUNK_SIZE_CHARS = (() => {
    const parsed = Number(process.env.PINECONE_SYNC_CHUNK_SIZE_CHARS || 10000);
    if (!Number.isFinite(parsed) || parsed <= 0) return 10000;
    return Math.max(1000, Math.floor(parsed));
})();

let pc: any = null;
let index: any = null;

if (!apiKey) {
    console.warn("WARNING: PINECONE_API_KEY is not defined. Semantic features will safely degrade.");
    // Export a mock index to prevent crashes when methods are called
    index = {
        upsert: async () => {},
        query: async () => ({ matches: [] }),
        deleteMany: async () => {},
    };
} else {
    pc = new Pinecone({ apiKey });
    index = pc.index(indexName);
}

export const pineconeIndex = index;

/**
 * Helpers for managing embeddings in Pinecone
 */

// ---------------------------------------------------------------------------
// Interview report → structured human-readable text for embedding
// This ensures that contentChunk stored in Pinecone metadata is meaningful
// when the LLM reads it — not raw JSON.
// ---------------------------------------------------------------------------
function serializeInterviewReport(r: Record<string, unknown>): string {
    const lines: string[] = [];

    const n = (v: unknown) => (v != null ? String(v) : "");

    // Scores
    if (r.combined_score != null) {
        lines.push(`SCORES: combined=${r.combined_score}/100, technical=${r.technical_score ?? "?"}/100, communication=${r.communication_score ?? "?"}/100, behavioral=${r.behavioral_score ?? "?"}/100`);
    }

    // Integrity
    const integrity = r.integrity as Record<string, unknown> | undefined;
    if (integrity?.score != null) {
        lines.push(`INTEGRITY SCORE: ${integrity.score}/100. ${n(integrity.summary)}`);
    }

    // Verdict
    const verdict = r.verdict as Record<string, unknown> | undefined;
    if (verdict) {
        lines.push(`VERDICT: ${n(verdict.recommendation)}. ${n(verdict.recommendation_reason)}`);
        if (verdict.summary) lines.push(`VERDICT SUMMARY: ${n(verdict.summary)}`);
        if (verdict.ai_summary_concise) lines.push(`CONCISE SUMMARY: ${n(verdict.ai_summary_concise)}`);
    }

    // Strategic verdict
    const sv = r.strategic_verdict as Record<string, unknown> | undefined;
    if (sv) {
        lines.push(`STRATEGIC DECISION: ${n(sv.decision)}. ${n(sv.summary)}`);
        if (Array.isArray(sv.rationale)) lines.push(`RATIONALE: ${sv.rationale.join("; ")}`);
        if (Array.isArray(sv.next_actions)) lines.push(`NEXT ACTIONS: ${sv.next_actions.join("; ")}`);
    }

    // Communication
    const comm = r.communication_analysis as Record<string, unknown> | undefined;
    if (comm) {
        lines.push(`COMMUNICATION: pronunciation=${n(comm.pronunciation)}/100, grammar=${n(comm.grammar)}/100, fluency=${n(comm.fluency)}/100, confidence=${n(comm.confidence)}/100. ${n(comm.summary)}`);
    }

    // Cognitive insights
    const cog = r.cognitive_insights as Record<string, unknown> | undefined;
    if (cog) {
        if (cog.clarity != null) lines.push(`COGNITIVE clarity=${n(cog.clarity)}/100, depth_of_knowledge=${n((cog.depth_of_knowledge as any)?.score ?? "?")}/100, problem_solving=${n((cog.problem_solving as any)?.score ?? "?")}/100`);
        if (cog.summary) lines.push(`COGNITIVE SUMMARY: ${n(cog.summary)}`);
    }

    // Behavioral analysis
    const beh = r.behavioral_analysis as Record<string, unknown> | undefined;
    if (beh) {
        if (beh.overview) lines.push(`BEHAVIORAL OVERVIEW: ${n(beh.overview)}`);
        if (Array.isArray(beh.strengths_observed)) lines.push(`STRENGTHS: ${beh.strengths_observed.join("; ")}`);
        if (Array.isArray(beh.concerns_noted)) lines.push(`CONCERNS: ${beh.concerns_noted.join("; ")}`);
        if (Array.isArray(beh.integrity_flags)) lines.push(`INTEGRITY FLAGS: ${beh.integrity_flags.join("; ")}`);
        if (beh.summary) lines.push(`BEHAVIORAL SUMMARY: ${n(beh.summary)}`);
    }

    // Skills proof
    if (Array.isArray(r.skills_proof)) {
        const skills = (r.skills_proof as any[]).map((s) => `${s.skill}: ${s.status} (${s.score})`).join(", ");
        lines.push(`SKILLS PROOF: ${skills}`);
    }

    // Q&A blocks (abbreviated)
    if (Array.isArray(r.qa_blocks)) {
        (r.qa_blocks as any[]).slice(0, 8).forEach((q, i) => {
            lines.push(`Q${i + 1}: "${q.question}" — Score: ${q.score}, Verdict: ${q.verdict}`);
        });
    }

    return lines.join("\n");
}

function serializeEmbeddingValue(value: unknown, depth = 0): string {
    if (value == null) return "";
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (depth < 2 && ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === "object") {
                    return serializeEmbeddingValue(parsed, depth + 1);
                }
            } catch {
                // Fall back to the raw string.
            }
        }
        return trimmed;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value
            .map((item) => serializeEmbeddingValue(item, depth + 1))
            .filter(Boolean)
            .join("\n");
    }
    if (typeof value === "object") {
        if (depth >= 4) return "";
        const obj = value as Record<string, unknown>;
        const priorityKeys = [
            "summary",
            "verdict",
            "decision",
            "recommendation",
            "recommendation_reason",
            "result",
            "title",
            "label",
            "text",
            "message",
            "reason",
            "reasoning",
            "evidence",
            "question",
            "answer",
            "description",
            "body",
            "details",
            "note",
        ];
        const parts: string[] = [];
        const seen = new Set<string>();

        for (const key of priorityKeys) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
            const text = serializeEmbeddingValue(obj[key], depth + 1);
            if (text) {
                parts.push(`${key}: ${text}`);
                seen.add(key);
            }
        }

        for (const [key, val] of Object.entries(obj)) {
            if (seen.has(key)) continue;
            const text = serializeEmbeddingValue(val, depth + 1);
            if (text) {
                parts.push(`${key}: ${text}`);
            }
        }

        return parts.join("\n");
    }
    return "";
}

function normalizeEmbeddingText(value: unknown, type?: string): string {
    // For interview reports, use the structured serializer for meaningful content
    if (type === "interview_report") {
        let parsed: unknown = value;
        if (typeof value === "string") {
            try { parsed = JSON.parse(value); } catch { /* fall through */ }
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const structured = serializeInterviewReport(parsed as Record<string, unknown>);
            if (structured.trim()) return structured.trim();
        }
    }
    const serialized = serializeEmbeddingValue(value);
    return serialized.replace(/\n{3,}/g, "\n\n").trim();
}

function splitEmbeddingTextIntoChunks(text: string, maxChars: number): string[] {
    const normalized = text.trim();
    if (!normalized) return [];
    if (normalized.length <= maxChars) return [normalized];

    const chunks: string[] = [];
    const words = normalized.split(/\s+/);
    let current = "";

    for (const rawWord of words) {
        const word = rawWord.trim();
        if (!word) continue;

        if (word.length > maxChars) {
            if (current) {
                chunks.push(current);
                current = "";
            }

            for (let i = 0; i < word.length; i += maxChars) {
                chunks.push(word.slice(i, i + maxChars));
            }
            continue;
        }

        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
            continue;
        }

        if (current) chunks.push(current);
        current = word;
    }

    if (current) chunks.push(current);
    return chunks;
}

/**
 * Upsert a candidate's data to Pinecone
 */
export async function upsertCandidateEmbedding(
    id: string, 
    vector: number[], 
    metadata: CandidateMetadata
) {
    try {
        if (!Array.isArray(vector) || vector.length === 0) {
            console.warn(`[PINECONE_UPSERT_SKIP]: Empty vector for ${metadata.fullName} (${metadata.type})`);
            return;
        }

        await pineconeIndex.upsert({
            records: [
                {
                    id,
                    values: vector,
                    metadata: metadata as any,
                },
            ],
        } as any);
        console.log(`[PINECONE_UPSERT_SUCCESS]: ${metadata.fullName} (${metadata.type})`);
    } catch (error: any) {
        console.error("[PINECONE_UPSERT_ERROR]:", error.message);
        throw error;
    }
}

export async function syncCandidateCorpusToPinecone(input: CandidatePineconeSyncInput): Promise<CandidatePineconeSyncResult> {
    const chunkSizeChars = Math.max(
        1000,
        Math.floor(input.maxCharsPerChunk || DEFAULT_PINECONE_CHUNK_SIZE_CHARS)
    );
    const sharedMeta = {
        applicationId: input.applicationId,
        orgId: input.orgId,
        fullName: input.fullName,
        email: input.email,
        jobTitle: input.jobTitle,
        driveId: input.driveId,
        status: input.status,
        resumeStatus: input.resumeStatus,
        aiScore: input.aiScore ?? 0,
    };

    let indexedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: Array<{ type: CandidatePineconeContentType; error: string }> = [];

    for (const document of input.documents) {
        const text = normalizeEmbeddingText(document.text, document.type);
        if (!text) {
            skippedCount += 1;
            continue;
        }

        const chunks = splitEmbeddingTextIntoChunks(text, chunkSizeChars);
        if (!chunks.length) {
            skippedCount += 1;
            continue;
        }

        const chunkCount = chunks.length;
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
            const chunkText = chunks[chunkIndex];
            try {
                const vector = await getEmbedding(chunkText);
                await upsertCandidateEmbedding(`${input.applicationId}-${document.type}-${chunkIndex + 1}`, vector, {
                    ...sharedMeta,
                    contentChunk: chunkText.substring(0, 3000),
                    type: document.type,
                    createdAt: document.createdAt,
                    chunkIndex: chunkIndex + 1,
                    chunkCount,
                    chunkSizeChars,
                });
                indexedCount += 1;
            } catch (error: any) {
                failedCount += 1;
                const message = error?.message || String(error);
                errors.push({ type: document.type, error: message });
                console.error(
                    `[PINECONE_SYNC_ERROR:${document.type}#${chunkIndex + 1}/${chunkCount}]`,
                    message
                );
            }
        }
    }

    return { indexedCount, skippedCount, failedCount, errors };
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
        // Use deleteMany with a filter - cast to any to handle SDK version differences
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

/**
 * Delete all embeddings associated with a specific Organization
 */
export async function deleteOrgEmbeddings(orgId: string) {
    try {
        await (pineconeIndex as any).deleteMany({ filter: { orgId: { "$eq": orgId } } })
            .catch(() => pineconeIndex.deleteMany({ orgId: { "$eq": orgId } } as any));
        console.log(`[PINECONE_ORG_DELETE_SUCCESS]: ${orgId}`);
    } catch (error: any) {
        console.error("[PINECONE_ORG_DELETE_ERROR]:", error.message);
        throw error;
    }
}
