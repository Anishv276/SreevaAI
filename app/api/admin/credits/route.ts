import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { isSuperAdminRole } from "@/lib/auth";
import { getOrgBillingStatus } from "@/lib/credits";

function getRequestedOrgId(request: Request) {
    const url = new URL(request.url);
    const explicitOrgId = url.searchParams.get("orgId")?.trim() || "";
    if (explicitOrgId) {
        return explicitOrgId;
    }

    const referer = request.headers.get("referer") || "";
    if (!referer) {
        return "";
    }

    try {
        return new URL(referer).searchParams.get("orgId")?.trim() || "";
    } catch {
        return "";
    }
}

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const requestedOrgId = searchParams.get("orgId")?.trim() || getRequestedOrgId(request) || null;
        const orgId = isSuperAdminRole(session.role) ? (requestedOrgId || session.orgId) : session.orgId;
        if (!orgId) {
            return NextResponse.json({ error: "Organization required" }, { status: 400 });
        }

        const status = await getOrgBillingStatus(orgId);
        return NextResponse.json(status, {
            headers: { 'Cache-Control': 'private, max-age=60' }
        });
    } catch (error) {
        console.error("[CREDITS] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch credits" }, { status: 500 });
    }
}
