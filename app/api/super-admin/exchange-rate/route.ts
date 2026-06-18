import { NextResponse } from "next/server";
/**
 * GET /api/super-admin/exchange-rate
 * Returns live USD → INR rate from Frankfurter (free, no API key).
 * Falls back to open.er-api.com if Frankfurter fails.
 * Caches for 1 hour via Cache-Control header.
 */
export async function GET() {
    try {
        // Primary: Frankfurter — free, no key, CORS-safe, daily updates
        const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR", {
            next: { revalidate: 3600 }, // Next.js 15 cache for 1 hour
        });
        if (res.ok) {
            const data = await res.json();
            const rate = data?.rates?.INR;
            if (rate && typeof rate === "number") {
                return NextResponse.json(
                    { rate, source: "frankfurter", updatedAt: data.date },
                    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
                );
            }
        }
    } catch (e) {
        console.warn("[EXCHANGE-RATE] Frankfurter failed, trying backup:", e);
    }
    try {
        // Fallback: open.er-api.com — free, no key
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        if (res.ok) {
            const data = await res.json();
            const rate = data?.rates?.INR;
            if (rate && typeof rate === "number") {
                return NextResponse.json(
                    { rate, source: "er-api", updatedAt: new Date().toISOString().slice(0, 10) },
                    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
                );
            }
        }
    } catch (e) {
        console.warn("[EXCHANGE-RATE] Backup also failed:", e);
    }
    // Hard fallback — last known rate
    return NextResponse.json(
        { rate: 84.5, source: "fallback", updatedAt: "cached" },
        { headers: { "Cache-Control": "no-store" } }
    );
}
