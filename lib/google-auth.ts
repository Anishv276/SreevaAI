import { prisma } from "./prisma";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

/**
 * Generates the Google OAuth authorization URL.
 * We request 'offline' access to get a refresh token.
 */
export function getGoogleAuthUrl(orgId: string) {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        redirect_uri: GOOGLE_REDIRECT_URI!,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
        access_type: 'offline',
        prompt: 'consent',
        state: orgId, // We pass the orgId in the state to know who is connecting
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges the authorization code for access and refresh tokens.
 */
export async function getGoogleTokens(code: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID!,
            client_secret: GOOGLE_CLIENT_SECRET!,
            redirect_uri: GOOGLE_REDIRECT_URI!,
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
 * Refreshes the Google access token using the refresh token.
 */
export async function refreshGoogleToken(orgId: string) {
    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { googleRefreshToken: true },
    });

    if (!org?.googleRefreshToken) {
        throw new Error('No refresh token available for this organization');
    }

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
        throw new Error(data.error_description || 'Failed to refresh token');
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
        console.error('[GMAIL API ERROR]', data);
        throw new Error(data.error?.message || 'Failed to send email via Gmail');
    }

    return data;
}
