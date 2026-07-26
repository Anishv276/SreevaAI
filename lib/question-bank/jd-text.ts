// Reconstructs usable JD text for Calls A/B/C from Job.jdExtractedDetails.
//
// jdExtractedDetails is the STRUCTURED extraction result from the existing
// /api/extract pipeline (extraction_resume_JD_score_report/parser.py's
// JD_SYSTEM prompt): { job_title, role_level, experience, criteria: [{name,
// category, priority, source_text, ...}], scoring_hints, keywords }. The
// pipeline extracts this raw JD text server-side (Pipeline.run_jd's
// raw_text) but /api/extract/status/[jobId]'s hydrateJdExtraction() only
// ever forwards `result.data` (the structured JSON) to the browser -- the
// raw document text itself never reaches Job.jdExtractedDetails. There is no
// "jd_raw_text" field anywhere in this pipeline.
//
// Rather than change the existing /api/extract flow (a separate, pre-existing
// concern) to also persist raw text, this reconstructs a text block from the
// structured fields already stored -- mirroring the same reconstruction
// pattern livekit-python-agent/interview/agent_persistence.py's
// _build_jd_from_extracted() already uses for the live-interview brief path,
// adapted to this pipeline's actual job_title/criteria schema.
export function buildJdTextFromExtractedDetails(extractedDetails: unknown): string {
    if (!extractedDetails) return "";
    let data: Record<string, any>;
    try {
        data = typeof extractedDetails === "string" ? JSON.parse(extractedDetails) : (extractedDetails as Record<string, any>);
    } catch {
        return "";
    }
    if (!data || typeof data !== "object") return "";

    const parts: string[] = [];
    if (typeof data.job_title === "string" && data.job_title.trim()) {
        parts.push(`Job Title: ${data.job_title.trim()}`);
    }
    if (typeof data.role_level === "string" && data.role_level.trim()) {
        parts.push(`Role Level: ${data.role_level.trim()}`);
    }
    const experience = data.experience;
    if (experience && typeof experience === "object") {
        const { min_years, max_years, preferred_background } = experience;
        const yearsParts: string[] = [];
        if (typeof min_years === "number") yearsParts.push(`${min_years}+ years`);
        if (typeof max_years === "number") yearsParts.push(`up to ${max_years} years`);
        if (yearsParts.length || preferred_background) {
            parts.push(
                `Experience: ${yearsParts.join(", ")}${preferred_background ? ` (${preferred_background})` : ""}`.trim()
            );
        }
    }
    const criteria = Array.isArray(data.criteria) ? data.criteria : [];
    if (criteria.length) {
        const lines = criteria
            .filter((c: any) => c && typeof c.name === "string" && c.name.trim())
            .map((c: any) => {
                const priority = typeof c.priority === "string" ? c.priority : "medium";
                const category = typeof c.category === "string" ? c.category : "skill";
                const sourceText = typeof c.source_text === "string" && c.source_text.trim() ? ` -- "${c.source_text.trim()}"` : "";
                return `- [${priority}] (${category}) ${c.name.trim()}${sourceText}`;
            });
        if (lines.length) {
            parts.push(`Requirements:\n${lines.join("\n")}`);
        }
    }
    if (Array.isArray(data.keywords) && data.keywords.length) {
        const kw = data.keywords.filter((k: unknown) => typeof k === "string" && k.trim());
        if (kw.length) parts.push(`Keywords: ${kw.join(", ")}`);
    }
    const hints = data.scoring_hints;
    if (hints && typeof hints === "object") {
        if (Array.isArray(hints.green_flags_to_reward) && hints.green_flags_to_reward.length) {
            parts.push(`Differentiators: ${hints.green_flags_to_reward.join(", ")}`);
        }
    }

    return parts.join("\n\n").trim();
}
