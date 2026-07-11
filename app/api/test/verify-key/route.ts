import { NextResponse } from "next/server";
import { isTestAccessAuthorized } from "@/lib/test-key";

// Verifies a candidate test-sandbox key against the DB-stored value without
// ever exposing the real key to the client.
export async function POST(request: Request) {
    const { key } = await request.json().catch(() => ({ key: null }));
    const authorized = await isTestAccessAuthorized(key);
    if (!authorized) {
        return NextResponse.json({ error: "Invalid key" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
}
