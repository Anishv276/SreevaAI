import { DEFAULT_ORG_AI_CONFIG } from "@/lib/ai-models-config";

// Job-level config only carries aiInterviewerVoiceId (inherits everything else from org).
export function normalizeJobAiConfig(args: { current?: Record<string, unknown> | null; next?: Record<string, unknown> | null } | Record<string, unknown>): Record<string, unknown> {
    const fields = ("next" in args || "current" in args)
        ? ({ ...(args as any).current, ...(args as any).next } as Record<string, unknown>)
        : args as Record<string, unknown>;
    // No baked-in default: voice is chosen per job from the org's allowed list.
    // Empty is valid -- the interview runtime falls back to Sarvam priya.
    const aiInterviewerVoiceId = String(fields.aiInterviewerVoiceId || "").trim();
    return { aiInterviewerVoiceId };
}

export function normalizeOrgAiConfig(fields: Record<string, unknown>): Record<string, unknown> {
    const allowedVoiceIds: string[] = (() => {
        const raw = fields.allowedVoiceIds;
        if (!Array.isArray(raw)) return [];
        return Array.from(new Set(raw.map((id) => String(id || "").trim()).filter(Boolean)));
    })();
    return {
        allowedVoiceIds,
        sttModel:           String(fields.sttModel           || DEFAULT_ORG_AI_CONFIG.sttModel).trim(),
        ttsProvider:        String(fields.ttsProvider        || DEFAULT_ORG_AI_CONFIG.ttsProvider).trim().toUpperCase(),
        ttsModel:           String(fields.ttsModel           || DEFAULT_ORG_AI_CONFIG.ttsModel).trim(),
        llmResumeExtraction:String(fields.llmResumeExtraction|| DEFAULT_ORG_AI_CONFIG.llmResumeExtraction).trim(),
        llmJdExtraction:    String(fields.llmJdExtraction    || DEFAULT_ORG_AI_CONFIG.llmJdExtraction).trim(),
        llmResumeReport:    String(fields.llmResumeReport    || DEFAULT_ORG_AI_CONFIG.llmResumeReport).trim(),
        llmInterviewLive:   String(fields.llmInterviewLive   || DEFAULT_ORG_AI_CONFIG.llmInterviewLive).trim(),
        llmInterviewEval:   String(fields.llmInterviewEval   || DEFAULT_ORG_AI_CONFIG.llmInterviewEval).trim(),
        llmInterviewBrief:  String(fields.llmInterviewBrief  || DEFAULT_ORG_AI_CONFIG.llmInterviewBrief).trim(),
        llmInterviewReport: String(fields.llmInterviewReport || DEFAULT_ORG_AI_CONFIG.llmInterviewReport).trim(),
    };
}
