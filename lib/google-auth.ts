import { prisma } from "./prisma";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

/**
 * Generates the Google OAuth authorization URL.
 * We request 'offline' access to get a refresh token.
 */
export function getGoogleAuthUrl(orgId: string, nextPath = "/admin/settings?section=company") {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        redirect_uri: GOOGLE_REDIRECT_URI!,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
        access_type: 'offline',
        prompt: 'consent',
        state: JSON.stringify({ orgId, nextPath }),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges the authorization code for access and refresh tokens.
 */
export async function getGoogleTokens(code: string, redirectUri?: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID!,
            client_secret: GOOGLE_CLIENT_SECRET!,
            redirect_uri: redirectUri || GOOGLE_REDIRECT_URI!,
            grant_type: 'authorization_code',
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error_description || 'Failed to exchange code for tokens');
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
    };
}

/**
 * Gets the email address of the authorized Google account.
 */
export async function getGoogleUserEmail(accessToken: string) {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await response.json();
    return data.email as string;
}

/**
 * Helper to execute a function with a distributed lock in Redis.
 */
async function withDistributedLock<T>(
    lockKey: string,
    ttlMs: number,
    fn: () => Promise<T>
): Promise<T> {
    const { default: redis } = await import("./redis");
    const lockValue = Date.now().toString();
    
    // Acquire lock
    // PX: expire in milliseconds, NX: only set if it doesn't exist
    const acquired = await redis.set(lockKey, lockValue, "PX", ttlMs, "NX");
    
    if (!acquired) {
        // Wait and retry once after a delay if lock is held
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const retryAcquired = await redis.set(lockKey, lockValue, "PX", ttlMs, "NX");
        if (!retryAcquired) {
            throw new Error(`Could not acquire lock: ${lockKey}`);
        }
    }

    try {
        return await fn();
    } finally {
        // Safe release: only delete if value matches (prevents deleting someone else's lock)
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        await redis.eval(script, 1, lockKey, lockValue);
    }
}

/**
 * Refreshes the Google access token using the refresh token.
 * Uses a distributed lock to prevent concurrent refresh race conditions.
 */
export async function refreshGoogleToken(orgId: string) {
    const lockKey = `lock:google:refresh:org:${orgId}`;
    
    return withDistributedLock(lockKey, 30000, async () => {
        // 1. Re-check if the token was already refreshed by another process while we waited for the lock
        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { 
                googleRefreshToken: true, 
                googleTokenExpiresAt: true,
                googleAccessToken: true 
            },
        });

        if (!org?.googleRefreshToken) {
            throw new Error('No refresh token available for this organization');
        }

        // If expiresAt is more than 5 minutes in the future, someone else refreshed it
        const isStillExpired = !org.googleTokenExpiresAt || org.googleTokenExpiresAt.getTime() < Date.now() + 300000;
        if (!isStillExpired && org.googleAccessToken) {
            console.log(`[AUTH] Token for org ${orgId} already refreshed by another process.`);
            return org.googleAccessToken;
        }

        console.log(`[AUTH] Refreshing Google token for org ${orgId}...`);

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID!,
                client_secret: GOOGLE_CLIENT_SECRET!,
                refresh_token: org.googleRefreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const reason = String(data?.error_description || data?.error || "Failed to refresh token");
            const isRevoked = /invalid_grant|unauthorized|revoked|expired/i.test(reason);

            if (isRevoked) {
                await prisma.organization.update({
                    where: { id: orgId },
                    data: {
                        googleAccessToken: null,
                        googleRefreshToken: null,
                        googleTokenExpiresAt: null,
                    },
                });
                throw new Error("Google Gmail connection expired or was revoked. Please reconnect Gmail in onboarding.");
            }

            throw new Error(reason);
        }

        const expiresAt = new Date(Date.now() + data.expires_in * 1000);

        // Update the database with the new token
        await prisma.organization.update({
            where: { id: orgId },
            data: {
                googleAccessToken: data.access_token,
                googleTokenExpiresAt: expiresAt,
            },
        });

        return data.access_token as string;
    });
}

/**
 * Sends an email via the Gmail API.
 */
export async function sendGmailEmail({
    orgId,
    to,
    subject,
    html,
}: {
    orgId: string;
    to: string;
    subject: string;
    html: string;
}) {
    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { 
            googleAccessToken: true, 
            googleTokenExpiresAt: true,
            googleEmail: true
        },
    });

    if (!org?.googleAccessToken) {
        throw new Error('Google Integration not configured for this organization');
    }

    let accessToken = org.googleAccessToken;

    // Check if token is expired (or about to expire in 5 mins)
    const isExpired = org.googleTokenExpiresAt && org.googleTokenExpiresAt.getTime() < Date.now() + 300000;
    if (isExpired) {
        accessToken = await refreshGoogleToken(orgId);
    }

    // Create RFC 2822 message
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
        `From: ${org.googleEmail}`,
        `To: ${to}`,
        `Content-Type: text/html; charset=utf-8`,
        `MIME-Version: 1.0`,
        `Subject: ${utf8Subject}`,
        '',
        html,
    ];
    const message = messageParts.join('\n');

    // Gmail requires base64url encoding
    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const sendOnce = async (token: string) => {
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                raw: encodedMessage,
            }),
        });

        const data = await response.json().catch(() => ({}));
        return { response, data };
    };

    let result = await sendOnce(accessToken);

    if (!result.response.ok && [401, 403].includes(result.response.status)) {
        const refreshedToken = await refreshGoogleToken(orgId);
        result = await sendOnce(refreshedToken);
    }

    if (!result.response.ok) {
        console.error('[GMAIL API ERROR]', result.data);
        throw new Error(result.data?.error?.message || 'Failed to send email via Gmail');
    }

    return result.data;
}

/**
 * Super Admin Specific Google Auth Methods
 * 
 * These methods reuse the Google OAuth app credentials but tie specifically 
 * to the `SuperAdmin` schema to avoid any intersection with `Organization` flows.
 */

export function getSuperAdminGoogleAuthUrl() {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/super-admin/integrations/google/callback`,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
        access_type: 'offline',
        prompt: 'consent',
        state: 'superadmin_auth',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function refreshSuperAdminGoogleToken(adminId: string) {
    const lockKey = `lock:google:refresh:superadmin:${adminId}`;
    
    return withDistributedLock(lockKey, 30000, async () => {
        // 1. Re-check if the token was already refreshed by another process while we waited for the lock
        const admin = await prisma.superAdmin.findUnique({
            where: { id: adminId },
            select: { 
                googleRefreshToken: true,
                googleTokenExpiresAt: true,
                googleAccessToken: true
            },
        });

        if (!admin?.googleRefreshToken) {
            throw new Error('No refresh token available for Super Admin');
        }

        // If expiresAt is more than 5 minutes in the future, someone else refreshed it
        const isStillExpired = !admin.googleTokenExpiresAt || admin.googleTokenExpiresAt.getTime() < Date.now() + 300000;
        if (!isStillExpired && admin.googleAccessToken) {
            console.log(`[AUTH] Super Admin token already refreshed by another process.`);
            return admin.googleAccessToken;
        }

        console.log(`[AUTH] Refreshing Super Admin Google token...`);

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID!,
                client_secret: GOOGLE_CLIENT_SECRET!,
                refresh_token: admin.googleRefreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error_description || 'Failed to refresh super admin token');
        }

        const expiresAt = new Date(Date.now() + data.expires_in * 1000);

        // Update the database with the new token
        await prisma.superAdmin.update({
            where: { id: adminId },
            data: {
                googleAccessToken: data.access_token,
                googleTokenExpiresAt: expiresAt,
            },
        });

        return data.access_token as string;
    });
}

export async function sendSuperAdminGmailEmail({
    adminId,
    to,
    subject,
    html,
}: {
    adminId: string;
    to: string;
    subject: string;
    html: string;
}) {
    const admin = await prisma.superAdmin.findUnique({
        where: { id: adminId },
        select: { 
            googleAccessToken: true, 
            googleTokenExpiresAt: true,
            googleEmail: true
        },
    });

    if (!admin?.googleAccessToken) {
        throw new Error('Google Integration not configured for Super Admin');
    }

    let accessToken = admin.googleAccessToken;

    // Check if token is expired (or about to expire in 5 mins)
    const isExpired = admin.googleTokenExpiresAt && admin.googleTokenExpiresAt.getTime() < Date.now() + 300000;
    if (isExpired) {
        accessToken = await refreshSuperAdminGoogleToken(adminId);
    }

    // Create RFC 2822 message
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
        `From: ${admin.googleEmail}`,
        `To: ${to}`,
        `Content-Type: text/html; charset=utf-8`,
        `MIME-Version: 1.0`,
        `Subject: ${utf8Subject}`,
        '',
        html,
    ];
    const message = messageParts.join('\n');

    // Gmail requires base64url encoding
    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            raw: encodedMessage,
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('[SUPER_ADMIN GMAIL API ERROR]', data);
        throw new Error(data.error?.message || 'Failed to send email via Super Admin Gmail');
    }

    return data;
}
