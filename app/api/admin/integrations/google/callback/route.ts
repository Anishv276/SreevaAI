import { NextResponse } from "next/server";
import { getGoogleTokens, getGoogleUserEmail } from "@/lib/google-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // JSON state from the authorize route
    const error = searchParams.get('error');

    let orgId: string | null = null;
    let nextPath = "/admin/settings?section=company";
    if (state) {
        try {
            const parsed = JSON.parse(state);
            orgId = parsed.orgId || null;
            nextPath = typeof parsed.nextPath === "string" && parsed.nextPath.startsWith("/") ? parsed.nextPath : nextPath;
        } catch {
            orgId = state;
        }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin;

    if (error) {
        console.error('[GOOGLE_OAUTH_CALLBACK_ERROR]', error);
        return NextResponse.redirect(new URL(`${nextPath}${nextPath.includes("?") ? "&" : "?"}google_error=access_denied`, baseUrl));
    }

    if (!code || !orgId) {
        return NextResponse.redirect(new URL(`${nextPath}${nextPath.includes("?") ? "&" : "?"}google_error=missing_params`, baseUrl));
    }

    try {
        // Exchange code for tokens
        const tokens = await getGoogleTokens(code);
        
        // Get the authorized email
        const googleEmail = await getGoogleUserEmail(tokens.accessToken);

        const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

        // Save tokens to the organization
        await prisma.organization.update({
            where: { id: orgId },
            data: {
                googleAccessToken: tokens.accessToken,
                googleRefreshToken: tokens.refreshToken, // Only received on first authorization
                googleTokenExpiresAt: expiresAt,
                googleEmail: googleEmail,
            },
        });

        // Redirect back to settings with success
        return NextResponse.redirect(new URL(`${nextPath}${nextPath.includes("?") ? "&" : "?"}google_success=true`, baseUrl));
    } catch (error: any) {
        console.error('[GOOGLE_OAUTH_CALLBACK_EXCEPTION]', error);
        return NextResponse.redirect(new URL(`${nextPath}${nextPath.includes("?") ? "&" : "?"}google_error=${encodeURIComponent(error.message)}`, baseUrl));
    }
}
