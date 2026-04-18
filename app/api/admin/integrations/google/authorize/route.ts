import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google-auth";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();

        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Generate the URL and include the orgId as the state
        const url = getGoogleAuthUrl(session.orgId);

        return NextResponse.redirect(url);
    } catch (error) {
        console.error("[GOOGLE_AUTH_AUTHORIZE_ERROR]", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
