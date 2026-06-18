// Shared JWT secret helpers for both the Node auth layer and Edge middleware.
// Do not rotate this in process memory: Edge and Node runtimes do not share
// state, so in-memory rotation causes valid API sessions to fail page gating.
let cachedSecret: Uint8Array | null = null;
function makeSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("JWT_SECRET is required in production");
        }
        console.warn("JWT_SECRET is not set. Using a per-process development secret.");
        const arr = new Uint8Array(32);
        globalThis.crypto.getRandomValues(arr);
        return arr;
    }
    return new TextEncoder().encode(secret);
}
function getStableSecret(): Uint8Array {
    if (!cachedSecret) cachedSecret = makeSecret();
    return cachedSecret;
}
/** Current signing secret used when issuing or refreshing a token. */
export function getSecretKey(): Uint8Array {
    return getStableSecret();
}
/** Verification key set. Kept as an array to preserve the existing auth API. */
export function allSecretKeys(): Uint8Array[] {
    return [getStableSecret()];
}
/** Stable verification key for the Edge middleware. */
export function stableSeedKey(): Uint8Array {
    return getStableSecret();
}
