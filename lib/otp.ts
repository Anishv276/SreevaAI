import { createHash, timingSafeEqual } from "crypto";

// OTPs are short-lived (10 min), rate-limited, and single-use -- SHA-256 is
// sufficient (unlike passwords, which need slow hashing against offline
// brute force of a permanent secret). Never store the raw code.
export function hashOtp(otp: string): string {
    return createHash("sha256").update(otp).digest("hex");
}

export function verifyOtp(otp: string, storedHash: string | null | undefined): boolean {
    if (!storedHash) return false;
    const a = Buffer.from(hashOtp(otp));
    const b = Buffer.from(storedHash);
    return a.length === b.length && timingSafeEqual(a, b);
}
