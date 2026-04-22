import { NextResponse } from "next/server";
import { getGoogleTokens, getGoogleUserEmail } from "@/lib/google-auth";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); 
    const error = searchParams.get('error');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin;

    if (error) {
        console.error('[SUPER_ADMIN_GOOGLE_OAUTH_ERROR]', error);
        return NextResponse.redirect(new URL('/super-admin/settings?section=integrations&google_error=access_denied', baseUrl));
    }

    if (!code || state !== 'superadmin_auth') {
        return NextResponse.redirect(new URL('/super-admin/settings?section=integrations&google_error=missing_params', baseUrl));
    }

    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.redirect(new URL('/super-admin/settings?section=integrations&google_error=unauthorized', baseUrl));
        }

        // Exchange code for tokens
        const superAdminCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/super-admin/integrations/google/callback`;
        const tokens = await getGoogleTokens(code, superAdminCallbackUrl);
        
        // Get the authorized email
        const googleEmail = await getGoogleUserEmail(tokens.accessToken);

        const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

        // Save tokens to the SuperAdmin record
        await prisma.superAdmin.update({
            where: { id: session.userId },
            data: {
                googleAccessToken: tokens.accessToken,
                googleRefreshToken: tokens.refreshToken, // Only received on first authorization
                googleTokenExpiresAt: expiresAt,
                googleEmail: googleEmail,
            },
        });

        // Redirect back to settings with success
        return NextResponse.redirect(new URL('/super-admin/settings?section=integrations&google_success=true', baseUrl));
    } catch (error: any) {
        console.error('[SUPER_ADMIN_GOOGLE_OAUTH_EXCEPTION]', error);
        return NextResponse.redirect(new URL(`/super-admin/settings?section=integrations&google_error=${encodeURIComponent(error.message)}`, baseUrl));
    }
}
