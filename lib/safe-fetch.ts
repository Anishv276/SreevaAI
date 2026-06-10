import { lookup } from "dns/promises";
import { isIP } from "net";

// ─── SSRF-safe outbound fetch ───────────────────────────────────────────────
// Used for fetching user-supplied URLs (e.g. job-description scraping). Blocks
// requests to private / loopback / link-local / cloud-metadata addresses so an
// attacker can't pivot the server into internal services (Redis, Postgres, the
// 169.254.169.254 metadata endpoint, etc.).

function isPrivateIPv4(ip: string): boolean {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // treat malformed as unsafe
    const [a, b] = p;
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8 loopback
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // 169.254.0.0/16 link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    return false;
}

function isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;     // loopback / unspecified
    if (lower.startsWith("fe80")) return true;              // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
}

function isDisallowedAddress(ip: string): boolean {
    const kind = isIP(ip);
    if (kind === 4) return isPrivateIPv4(ip);
    if (kind === 6) return isPrivateIPv6(ip);
    return true; // not a parseable IP ⇒ unsafe
}

export class SsrfBlockedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SsrfBlockedError";
    }
}

/**
 * Validate a user-supplied URL: must be http(s), must not resolve to a private/
 * loopback/link-local/metadata address. Throws SsrfBlockedError if unsafe.
 * Returns the parsed URL plus the resolved IP (so the caller can pin it).
 */
export async function assertPublicUrl(rawUrl: string): Promise<{ url: URL; address: string }> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new SsrfBlockedError("Invalid URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new SsrfBlockedError("Only http(s) URLs are allowed");
    }
    const host = url.hostname;

    // If the host is a literal IP, validate it directly.
    if (isIP(host)) {
        if (isDisallowedAddress(host)) throw new SsrfBlockedError("URL resolves to a blocked address");
        return { url, address: host };
    }

    // Block obvious localhost aliases before DNS.
    if (host === "localhost" || host.endsWith(".localhost")) {
        throw new SsrfBlockedError("URL resolves to a blocked address");
    }

    // Resolve DNS and reject if ANY resolved address is private.
    let records: { address: string }[];
    try {
        records = await lookup(host, { all: true });
    } catch {
        throw new SsrfBlockedError("Could not resolve host");
    }
    if (records.length === 0) throw new SsrfBlockedError("Could not resolve host");
    for (const r of records) {
        if (isDisallowedAddress(r.address)) {
            throw new SsrfBlockedError("URL resolves to a blocked address");
        }
    }
    return { url, address: records[0].address };
}

/**
 * SSRF-hardened fetch for user-supplied URLs. Validates the target, disables
 * redirect following (a 302 to an internal host would otherwise bypass the
 * check), and enforces a timeout.
 */
export async function safeFetch(rawUrl: string, timeoutMs = 10_000): Promise<Response> {
    await assertPublicUrl(rawUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(rawUrl, {
            redirect: "manual", // do not auto-follow into a possibly-internal target
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}
