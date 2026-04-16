import { Resend } from 'resend';
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);


export async function getPlatformSender() {
    try {
        const settings = await prisma.superAdmin.findFirst({
            where: { isDomainVerified: true }
        });
        if (settings?.isDomainVerified && settings.customSenderEmail) {
            const name = settings.customSenderName || "Lumoscale Platform";
            return `${name} <${settings.customSenderEmail}>`;
        }
    } catch (e) {
        console.error("Failed to fetch platform sender:", e);
    }
    return "Lumoscale Security <security@lumoscale.com>"; // Absolute Fallback
}

export async function sendApplicationStatusEmail({
    email,
    fullName,
    jobTitle,
    orgId,
    status,
    score,
    interviewLink
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    orgId?: string;
    status: 'SHORTLISTED' | 'REJECTED' | 'ACCEPTED' | 'INTERVIEW' | 'Hired';
    score: number;
    interviewLink?: string;
}) {
    const isHired = status === 'Hired';
    const isAccepted = status === 'SHORTLISTED' || status === 'ACCEPTED' || status === 'INTERVIEW' || isHired;

    const subject = isHired
        ? `Offer Letter: You've been selected for ${jobTitle}!`
        : isAccepted
        ? `Congratulations! You've been shortlisted for the ${jobTitle} AI Interview`
        : `Update regarding your application for ${jobTitle}`;

    const html = isHired ? `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 25px;">
                <div style="display: inline-block; background-color: #ECFDF5; padding: 12px; border-radius: 16px;">
                    <span style="font-size: 32px;">🎉</span>
                </div>
            </div>
            <h1 style="color: #111827; text-align: center; font-size: 24px; font-weight: 800; margin-bottom: 10px;">You're Hired, ${fullName}!</h1>
            <p style="color: #4B5563; text-align: center; font-size: 16px; line-height: 1.5;">We are delighted to inform you that you have been <strong>selected</strong> for the <strong>${jobTitle}</strong> position. Welcome to the team!</p>
            <div style="background-color: #F0FDF4; border-radius: 16px; padding: 20px; margin: 30px 0; border: 1px solid #D1FAE5; text-align: center;">
                <p style="color: #065F46; font-size: 14px; font-weight: 600; margin: 0;">Our team will reach out to you shortly with the next steps including your offer letter and onboarding details.</p>
            </div>
            <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 5px;">Best Regards,</p>
            <p style="color: #374151; font-weight: 700; margin-top: 0;">Recruitment Team</p>
        </div>
    ` : isAccepted ? `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 25px;">
                <div style="display: inline-block; background-color: #FFF7ED; padding: 12px; border-radius: 16px;">
                    <span style="font-size: 24px;">✨</span>
                </div>
            </div>
            <h1 style="color: #111827; text-align: center; font-size: 24px; font-weight: 800; margin-bottom: 10px;">Congratulations, ${fullName}!</h1>
            <p style="color: #4B5563; text-align: center; font-size: 16px; line-height: 1.5;">We are thrilled to inform you that you have been <strong>Shortlisted</strong> for the <strong>${jobTitle}</strong> position based on your profile and skills.</p>
            
            <div style="background-color: #F9FAFB; border-radius: 16px; padding: 20px; margin: 30px 0; border: 1px solid #F3F4F6;">
                <h3 style="color: #111827; font-size: 14px; font-weight: 700; margin-top: 0; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 15px; text-align: center;">Next Step: AI Voice Interview</h3>
                <p style="color: #6B7280; font-size: 14px; margin-bottom: 20px; text-align: center;">You have been invited to a real-time <strong>Voice AI Interview</strong>. This session will take approximately 15 minutes and will focus on your experience and technical expertise.</p>
                <div style="text-align: center;">
                    <a href="${interviewLink}" style="background-color: #F97316; color: white; padding: 14px 35px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(249,115,22,0.25);">Start AI Interview</a>
                </div>
                <p style="color: #9CA3AF; font-size: 11px; margin-top: 20px; text-align: center;">
                    Note: Please ensure you are in a quiet environment with a working camera and microphone.
                </p>
            </div>

            <p style="color: #4B5563; font-size: 14px;">Our recruitment team will review the interview recording and reach out to you within 24-48 hours.</p>
            <hr style="border: none; border-top: 1px solid #F3F4F6; margin: 25px 0;" />
            <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 5px;">Best Regards,</p>
            <p style="color: #374151; font-weight: 700; margin-top: 0;">Lumoscale Recruitment Team</p>
        </div>
    ` : `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
            <h1 style="color: #111827; font-size: 20px; font-weight: 700;">Application Update</h1>
            <p style="color: #4B5563;">Hi ${fullName},</p>
            <p style="color: #4B5563;">Thank you for your interest in the <strong>${jobTitle}</strong> position at Lumoscale.</p>
            <p style="color: #4B5563;">After carefully reviewing your profile, we regret to inform you that we will not be moving forward with your application for this specific role at this time.</p>
            <p style="color: #4B5563; font-size: 15px; margin-bottom: 25px;">We appreciate the time you took to apply and wish you the best of luck in your job search.</p>
            
            <div style="background-color: #F9FAFB; border-radius: 16px; padding: 25px; border: 1px solid #F3F4F6; text-align: center; margin: 30px 0;">
                <p style="color: #6B7280; font-size: 14px; font-weight: 600; margin-bottom: 20px; line-height: 1.5;">If you are interested in exploring other opportunities at Lumoscale, we invite you to view our live job board.</p>
                <div style="text-align: center;">
                    <a href="https://lumoscale.co/careers" style="background-color: #F97316; color: white; padding: 14px 30px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(249,115,22,0.20);">Explore All Openings</a>
                </div>
            </div>

            <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 5px;">Best Regards,</p>
            <p style="color: #374151; font-weight: 700; margin-top: 0;">Lumoscale Recruitment Team</p>
        </div>
    `;

    if (!orgId) {
        console.warn(`[MAIL BLOCKED] No orgId provided — cannot determine sender`);
        return { success: false, error: "No organization context for email sending." };
    }

    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { customSenderEmail: true, customSenderName: true, customDomain: true, isDomainVerified: true, name: true }
    });

    if (!org) {
        console.warn(`[MAIL BLOCKED] Org not found: ${orgId}`);
        return { success: false, error: "Organization not found." };
    }

    let from = await getPlatformSender(); // Default to platform sender
    if (org.isDomainVerified && org.customSenderEmail) {
        const displayName = org.customSenderName || org.name;
        from = `${displayName} <${org.customSenderEmail}>`;
    } else {
        console.warn(`[MAIL FALLBACK] Org ${org.name} has no verified domain — using platform sender`);
    }

    try {
        const payload = await resend.emails.send({
            from: from,
            to: email,
            subject: subject,
            html: html,
        });

        if (payload.error) {
            console.error(`[MAIL ERROR] Resend rejected email to ${email}:`, payload.error);
            return { success: false, error: payload.error };
        }

        console.log(`[MAIL] Status email sent to ${email} (${status}) using sender ${from}`);
        return { success: true };
    } catch (error) {
        console.error(`[MAIL EXCEPTION] Failed to send email to ${email}:`, error);
        return { success: false, error };
    }
}

export async function sendTeamInviteEmail({
    email,
    inviterName,
    organizationName,
    orgId,
    role,
    inviteUrl,
    expiresAt,
}: {
    email: string;
    inviterName: string;
    organizationName: string;
    orgId?: string;
    role: "ADMIN" | "HR" | "TEAM";
    inviteUrl: string;
    expiresAt: Date;
}) {
    const roleLabel = role === "TEAM" ? "Team" : role;
    const subject = `You're invited to join ${organizationName} on Lumoscale`;

    const html = `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #f1f5f9; border-radius: 14px; background: #ffffff;">
            <h2 style="margin: 0 0 8px; color: #111827; font-size: 24px; font-weight: 800;">Workspace Invitation</h2>
            <p style="margin: 0 0 18px; color: #4b5563; font-size: 14px; line-height: 1.6;">
                <strong>${inviterName}</strong> invited you to join <strong>${organizationName}</strong> on Lumoscale as <strong>${roleLabel}</strong>.
            </p>
            <div style="padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; margin-bottom: 18px;">
                <p style="margin: 0 0 6px; color: #334155; font-size: 13px;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 0 0 6px; color: #334155; font-size: 13px;"><strong>Role:</strong> ${roleLabel}</p>
                <p style="margin: 0; color: #334155; font-size: 13px;"><strong>Expires:</strong> ${expiresAt.toUTCString()}</p>
            </div>
            <a href="${inviteUrl}" style="display: inline-block; background: #f97316; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 20px; border-radius: 10px;">
                Review Invitation
            </a>
            <p style="margin-top: 18px; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                If you were not expecting this invite, you can safely ignore this email.
            </p>
        </div>
    `;

    let inviteFrom = await getPlatformSender();
    if (orgId) {
        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { customSenderEmail: true, customSenderName: true, isDomainVerified: true, name: true }
        });
        if (org?.isDomainVerified && org?.customSenderEmail) {
            inviteFrom = `${org.customSenderName || org.name} <${org.customSenderEmail}>`;
        }
    }

    try {
        const payload = await resend.emails.send({
            from: inviteFrom,
            to: email,
            subject,
            html,
        });

        if (payload.error) {
            console.error(`[INVITE EMAIL ERROR] Resend rejected invite to ${email}:`, payload.error);
            return { success: false, error: payload.error };
        }

        console.log(`[INVITE EMAIL] Invite sent to ${email} using sender ${inviteFrom}`);
        return { success: true };
    } catch (error) {
        console.error(`[INVITE EMAIL EXCEPTION] Failed to send invite to ${email}:`, error);
        return { success: false, error };
    }
}



