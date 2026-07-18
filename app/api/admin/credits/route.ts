import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { isSuperAdminRole } from "@/lib/auth";
import { getOrgBillingStatus } from "@/lib/credits";
import { apiErrorResponse } from "@/lib/slack-error-logger";
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Only an explicit query param -- the Referer header is client-controlled
        // and easily spoofed/stripped, so it's not a trustworthy source for
        // deciding which org's data a super-admin gets to view.
        const { searchParams } = new URL(request.url);
        const requestedOrgId = searchParams.get("orgId")?.trim() || null;
        const orgId = isSuperAdminRole(session.role) ? (requestedOrgId || session.orgId) : session.orgId;
        if (!orgId) {
            return NextResponse.json({ error: "Organization required" }, { status: 400 });
        }
        const status = await getOrgBillingStatus(orgId);
        return NextResponse.json(status, {
            headers: { 'Cache-Control': 'private, max-age=60' }
        });
    } catch (error) {
        return apiErrorResponse({
            route: "/api/admin/credits",
            method: "GET",
            error,
            body: { error: "Failed to fetch credits" },
            status: 500,
            logLabel: "[CREDITS] GET error:",
        });
    }
}
