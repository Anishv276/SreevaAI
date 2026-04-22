import { prisma } from "@/lib/prisma";
import { sendGmailEmail, sendSuperAdminGmailEmail } from './google-auth';

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
            <p style="color: #374151; font-weight: 700; margin-top: 0;">Sreeva AI Recruitment Team</p>
        </div>
    ` : `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
            <h1 style="color: #111827; font-size: 20px; font-weight: 700;">Application Update</h1>
            <p style="color: #4B5563;">Hi ${fullName},</p>
            <p style="color: #4B5563;">Thank you for your interest in the <strong>${jobTitle}</strong> position at Sreeva AI.</p>
            <p style="color: #4B5563;">After carefully reviewing your profile, we regret to inform you that we will not be moving forward with your application for this specific role at this time.</p>
            <p style="color: #4B5563; font-size: 15px; margin-bottom: 25px;">We appreciate the time you took to apply and wish you the best of luck in your job search.</p>
            
            <div style="background-color: #F9FAFB; border-radius: 16px; padding: 25px; border: 1px solid #F3F4F6; text-align: center; margin: 30px 0;">
                <p style="color: #6B7280; font-size: 14px; font-weight: 600; margin-bottom: 20px; line-height: 1.5;">If you are interested in exploring other opportunities at Sreeva AI, we invite you to view our live job board.</p>
                <div style="text-align: center;">
                    <a href="https://sreeva.ai/careers" style="background-color: #F97316; color: white; padding: 14px 30px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(249,115,22,0.20);">Explore All Openings</a>
                </div>
            </div>

            <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 5px;">Best Regards,</p>
            <p style="color: #374151; font-weight: 700; margin-top: 0;">Sreeva AI Recruitment Team</p>
        </div>
    `;

    if (!orgId) {
        console.warn(`[MAIL BLOCKED] No orgId provided - cannot determine sender`);
        return { success: false, error: "No organization context for email sending." };
    }

    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, googleAccessToken: true, name: true }
    });

    if (!org?.id) {
        console.warn(`[MAIL BLOCKED] Org not found: ${orgId}`);
        return { success: false, error: "Organization not found." };
    }

    if (!org.googleAccessToken) {
        return {
            success: false,
            error: `Connect Gmail in onboarding to send emails for this workspace. orgId=${orgId}`
        };
    }

    try {
        await sendGmailEmail({
            orgId: org.id,
            to: email,
            subject,
            html
        });
        console.log(`[MAIL] Status email sent to ${email} via GMAIL API`);
        return { success: true };
    } catch (error) {
        console.error(`[MAIL GMAIL FAILED]`, error);
        return {
            success: false,
            error: `Failed to send email from the connected Gmail account for orgId=${orgId}`
        };
    }
}

export async function sendOrgWelcomeEmail({
    email,
    orgName,
    adminName,
}: {
    email: string;
    orgName: string;
    adminName: string;
}) {
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/login`;
    const subject = "Welcome to Sreeva AI: Your Workspace is Ready";
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
            <h2 style="margin-bottom: 20px; font-size: 20px;">Welcome to Sreeva AI</h2>
            <p style="color: #4b5563; font-size: 15px; margin-bottom: 20px;">
                Hello <strong>${adminName}</strong>, your workspace for <strong>${orgName}</strong> is ready.
            </p>
            <p style="color: #4b5563; font-size: 15px; margin-bottom: 30px;">
                You can log in to your dashboard here:<br/><br/>
                <a href="${loginUrl}" style="color: #f97316; font-weight: bold; text-decoration: none;">${loginUrl}</a>
            </p>
            <p style="margin-top: 30px; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 20px;">
                If you have any questions, our support team is here to help.
            </p>
        </div>
    `;

    const superAdmin = await prisma.superAdmin.findFirst({
        where: { googleAccessToken: { not: null } },
        select: { id: true }
    });

    if (!superAdmin) {
        return { success: false, error: "Connect Gmail for the super-admin account before sending onboarding emails." };
    }

    try {
        await sendSuperAdminGmailEmail({
            adminId: superAdmin.id,
            to: email,
            subject,
            html
        });
        console.log(`[WELCOME EMAIL] Sent to ${email} for org ${orgName} via Super Admin GMAIL`);
        return { success: true };
    } catch (error) {
        console.error(`[WELCOME EMAIL GMAIL FAILED]`, error);
        return { success: false, error: "Failed to send onboarding email from the connected super-admin Gmail account." };
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
    const roleLabel = role === "TEAM" ? "Team Member" : role;
    const isSreevaOrg = organizationName.toLowerCase().includes("sreeva");
    const subject = isSreevaOrg 
        ? `Join the ${organizationName} Workspace` 
        : `Invitation to join ${organizationName} on Sreeva AI`;

    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
            <h2 style="margin-bottom: 20px; font-size: 20px;">Workspace Invitation</h2>
            <p style="color: #4b5563; font-size: 15px; margin-bottom: 20px;">
                Hi there, <strong>${inviterName}</strong> has invited you to join the <strong>${organizationName}</strong> workspace as a <strong>${roleLabel}</strong>.
            </p>
            <p style="color: #4b5563; font-size: 15px; margin-bottom: 30px;">
                <a href="${inviteUrl}" style="background-color: #f97316; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Accept Invitation</a>
            </p>
            <p style="margin-top: 40px; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 20px;">
                This invitation was sent to ${email}. If you weren't expecting this, you can safely ignore this email.
            </p>
        </div>
    `;

    if (orgId) {
        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { googleAccessToken: true }
        });

        if (!org?.googleAccessToken) {
            return { success: false, error: "Connect Gmail in onboarding before inviting team members." };
        }
        try {
            await sendGmailEmail({
                orgId,
                to: email,
                subject,
                html
            });
            console.log(`[INVITE EMAIL] Sent to ${email} via GMAIL API`);
            return { success: true };
        } catch (error) {
            console.error(`[INVITE EMAIL GMAIL FAILED]`, error);
            return { success: false, error: "Failed to send invite from the connected Gmail account." };
        }
    }

    return { success: false, error: "No organization context available for invite emails." };
}




