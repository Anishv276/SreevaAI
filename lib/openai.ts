import OpenAI from "openai";
// Lazy-initialized OpenAI client to prevent module import errors when API key is missing.
let _openai: OpenAI | null = null;
/**
 * Returns the initialized OpenAI client.
 * Throws a critical error ONLY when called and the key is missing,
 * preventing Next.js from failing at startup/build time.
 */
export function getOpenAIClient(): OpenAI {
    if (_openai) return _openai;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "dummy-key-for-mock-mode") {
        throw new Error("CRITICAL_CONFIGURATION_ERROR: OPENAI_API_KEY is missing from environment variables. Please set a valid key in .env to use AI features.");
    }
    _openai = new OpenAI({
        apiKey: apiKey,
    });
    return _openai;
}
// Transcription and embedding logic removed -- handled by LiveKit/Deepgram and Python workers respectively.
// JD extraction removed -- handled by the Python worker (scripts/extract_pdf.py) for billing consistency.
