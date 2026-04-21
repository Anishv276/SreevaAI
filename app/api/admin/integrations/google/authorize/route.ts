import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google-auth";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();

        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const requestUrl = new URL(request.url);
        const next = requestUrl.searchParams.get("next") || "/admin/settings?section=company";

        // Generate the URL and include the orgId + return path in the state
        const url = getGoogleAuthUrl(session.orgId, next);

        return NextResponse.redirect(url);
    } catch (error) {
        console.error("[GOOGLE_AUTH_AUTHORIZE_ERROR]", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
