import OpenAI from "openai";

const globalForOpenAI = global as unknown as {
    openaiClient?: OpenAI;
};

export function getOpenAIClient(): OpenAI {
    if (!globalForOpenAI.openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is not set");
        }
        globalForOpenAI.openaiClient = new OpenAI({ apiKey });
    }
    return globalForOpenAI.openaiClient;
}

export class LLMCallError extends Error {
    /** Tokens already spent on failed attempts before this error was thrown
     * (e.g. a retry loop where earlier attempts billed real tokens but never
     * produced a usable result) -- callers that give up should still bill this. */
    public partialUsage?: ChatJSONResult["usage"];

    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = "LLMCallError";
    }
}

export type ChatJSONResult = {
    data: unknown;
    model: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens: number;
    };
};

/**
 * One JSON-mode chat completion, parsed. Throws LLMCallError on empty
 * response or invalid JSON -- callers decide whether/how to retry.
 */
export async function chatJSON(opts: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
}): Promise<ChatJSONResult> {
    const client = getOpenAIClient();
    let completion;
    try {
        completion = await client.chat.completions.create({
            model: opts.model,
            temperature: opts.temperature ?? 0,
            max_completion_tokens: opts.maxTokens ?? 4000,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: opts.systemPrompt },
                { role: "user", content: opts.userPrompt },
            ],
        });
    } catch (err) {
        console.error("OpenAI request failed:", err);
        throw new LLMCallError("OpenAI request failed: " + (err instanceof Error ? err.message : String(err)), err);
    }
    const content = completion.choices[0]?.message?.content;
    if (!content) {
        throw new LLMCallError("OpenAI returned an empty response");
    }
    let data: unknown;
    try {
        data = JSON.parse(content);
    } catch (err) {
        throw new LLMCallError("OpenAI response was not valid JSON", err);
    }
    return {
        data,
        model: completion.model,
        usage: {
            inputTokens: completion.usage?.prompt_tokens ?? 0,
            outputTokens: completion.usage?.completion_tokens ?? 0,
            cachedInputTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        },
    };
}
