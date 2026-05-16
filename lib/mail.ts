import { sendEmail } from "./resend";

export type MailResult =
    | { success: true }
    | { success: false; error: string };

export async function sendApplicationStatusEmail({
    email,
    fullName,
    jobTitle,
    orgName: orgNameProp,
    status,
    interviewLink,
    scheduledAt,
    scheduledTimeZone,
    schedulingDeadline,
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    orgId?: string;
    orgName?: string;
    status: 'SHORTLISTED' | 'REJECTED' | 'ACCEPTED' | 'INTERVIEW' | 'Hired' | 'CONFIRMED';
    score?: number;
    interviewLink?: string;
    scheduledAt?: Date;
    scheduledTimeZone?: string;
    schedulingDeadline?: Date;
}): Promise<MailResult> {
    const orgName = orgNameProp || "Our Team";
    console.log(`[MAIL DEBUG] Incoming status: "${status}"`);
    const s = (status || "").toUpperCase();
    const isHired = s === 'HIRED';
    const isConfirmed = s === 'CONFIRMED';
    const isAccepted = s === 'SHORTLISTED' || s === 'ACCEPTED' || s === 'INTERVIEW' || isHired;
    const schedulingDeadlineLabel = schedulingDeadline
        ? schedulingDeadline.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        : null;

    const subject = isHired
        ? `Offer Letter: You've been selected for ${jobTitle}!`
        : isConfirmed
            ? `Interview Booked: Your AI Interview for ${jobTitle}`
            : isAccepted
                ? `Action Required: Schedule your AI Interview for ${jobTitle}`
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
            <p style="color: #374151; font-weight: 700; margin-top: 0;">${orgName} Recruitment Team</p>
        </div>
    ` : isConfirmed ? `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 18px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 22px;">
                <div style="display: inline-block; background-color: #ECFDF5; padding: 14px; border-radius: 18px;">
                    <span style="font-size: 26px;">📌</span>
                </div>
            </div>
            <h1 style="color: #111827; text-align: center; font-size: 26px; font-weight: 800; margin-bottom: 12px;">Interview Slot Confirmed</h1>
            <p style="color: #4B5563; text-align: center; font-size: 16px; line-height: 1.6; margin-bottom: 18px;">Hi ${fullName}, your AI Voice Interview for the <strong>${jobTitle}</strong> position is booked.</p>
            <div style="background-color: #F9FAFB; border-radius: 18px; padding: 22px; margin: 24px 0; border: 1px solid #F3F4F6;">
                <h3 style="color: #111827; font-size: 13px; font-weight: 800; margin-top: 0; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; text-align: center;">Booked Time</h3>
                <p style="color: #111827; font-size: 18px; font-weight: 800; margin-bottom: 18px; text-align: center;">
                    ${scheduledAt ? scheduledAt.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(scheduledTimeZone ? { timeZone: scheduledTimeZone } : {}) }) : 'Your selected time'}
                </p>
                <div style="text-align: center; margin-bottom: 14px;">
                    <a href="${interviewLink}" style="background-color: #111827; color: white; padding: 14px 34px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 15px; display: inline-block;">Open Interview</a>
                </div>
                <p style="color: #6B7280; font-size: 12px; margin-top: 8px; text-align: center;">Use this link to enter the interview page. Hardware check is available now, and the start button will unlock at the correct time.</p>
            </div>
            <div style="background-color: #FFF7ED; border: 1px solid #FED7AA; border-radius: 16px; padding: 16px 18px; margin: 24px 0;">
                <p style="color: #9A3412; font-size: 13px; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.06em;">What to expect</p>
                <p style="color: #7C2D12; font-size: 14px; line-height: 1.6; margin: 0;">You can complete the hardware check before your slot begins. When your interview window opens, the <strong>Begin Interview</strong> button will activate automatically.</p>
            </div>
            <hr style="border: none; border-top: 1px solid #F3F4F6; margin: 24px 0;" />
            <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 5px;">Best Regards,</p>
            <p style="color: #374151; font-weight: 700; margin-top: 0;">${orgName} Recruitment Team</p>
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
                <h3 style="color: #111827; font-size: 14px; font-weight: 700; margin-top: 0; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 15px; text-align: center;">Next Step: Schedule AI Interview</h3>
                <p style="color: #6B7280; font-size: 14px; margin-bottom: 20px; text-align: center;">You have been invited to a real-time <strong>Voice AI Interview</strong>. Please select a 20-minute slot that works for you.</p>
                <div style="text-align: center;">
                    <a href="${interviewLink}" style="background-color: #F97316; color: white; padding: 14px 35px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(249,115,22,0.25);">Schedule AI Interview</a>
                </div>
                ${schedulingDeadlineLabel ? `<p style="color: #9CA3AF; font-size: 12px; margin-top: 16px; text-align: center;">Please schedule your interview on or before <strong>${schedulingDeadlineLabel}</strong>.</p>` : ""}
                <p style="color: #9CA3AF; font-size: 11px; margin-top: 20px; text-align: center;">Note: Please ensure you choose a time where you will be in a quiet environment with a working camera and microphone.</p>
            </div>
            <p style="color: #4B5563; font-size: 14px;">Our recruitment team will review the interview recording and reach out to you within 24-48 hours.</p>
            <hr style="border: none; border-top: 1px solid #F3F4F6; margin: 25px 0;" />
            <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 5px;">Best Regards,</p>
            <p style="color: #374151; font-weight: 700; margin-top: 0;">${orgName} Recruitment Team</p>
        </div>
    ` : `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
            <h1 style="color: #111827; font-size: 20px; font-weight: 700;">Application Update</h1>
            <p style="color: #4B5563;">Hi ${fullName},</p>
            <p style="color: #4B5563;">Thank you for your interest in the <strong>${jobTitle}</strong> position at ${orgName}.</p>
            <p style="color: #4B5563;">After carefully reviewing your profile, we regret to inform you that we will not be moving forward with your application for this specific role at this time.</p>
            <p style="color: #4B5563; font-size: 15px; margin-bottom: 25px;">We appreciate the time you took to apply and wish you the best of luck in your job search.</p>
            <div style="background-color: #F9FAFB; border-radius: 16px; padding: 25px; border: 1px solid #F3F4F6; text-align: center; margin: 30px 0;">
                <p style="color: #6B7280; font-size: 14px; font-weight: 600; margin-bottom: 20px; line-height: 1.5;">If you are interested in exploring other opportunities at ${orgName}, we invite you to view our live job board.</p>
                <a href="https://sreevaai.com/careers" style="background-color: #F97316; color: white; padding: 14px 30px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(249,115,22,0.20);">Explore All Openings</a>
            </div>
            <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 5px;">Best Regards,</p>
            <p style="color: #374151; font-weight: 700; margin-top: 0;">${orgName} Recruitment Team</p>
        </div>
    `;

    try {
        await sendEmail({ to: email, subject, html, type: "interview" });
        console.log(`[MAIL] Status email sent to ${email} via Resend`);
        return { success: true };
    } catch (error) {
        const message = (error as Error)?.message || "Failed to send email";
        console.error(`[MAIL RESEND FAILED]`, error);
        return { success: false, error: message };
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
}): Promise<MailResult> {
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/login`;
    const subject = "Welcome to Sreeva AI: Your Workspace is Ready";
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; color: #111827; border: 1px solid #f0f0f0; border-radius: 24px; background: #ffffff;">
            <h2 style="margin: 0 0 8px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;">Welcome to Sreeva AI</h2>
            <p style="color: #4b5563; font-size: 15px; margin: 0 0 24px; line-height: 1.6;">
                Hi <strong>${adminName}</strong>, your workspace for <strong>${orgName}</strong> has been successfully provisioned.
            </p>
            <div style="padding: 28px; border: 1px dashed #f97316; border-radius: 20px; background: #fffaf5; margin-bottom: 30px;">
                <p style="margin: 0 0 8px; color: #7c2d12; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;">Next Step</p>
                <p style="margin: 0 0 20px; color: #9a3412; font-size: 14px;">Log in to complete your onboarding and start your first recruitment drive.</p>
                <a href="${loginUrl}" style="display: inline-block; background: #f97316; color: #fff; text-decoration: none; font-weight: 800; font-size: 15px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 8px 20px rgba(249,115,22,0.25);">Access Workspace</a>
            </div>
            <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">If you have any questions, contact your platform administrator.</p>
        </div>
    `;

    try {
        await sendEmail({ to: email, subject, html, type: "welcome" });
        console.log(`[WELCOME EMAIL] Sent to ${email} for org ${orgName} via Resend`);
        return { success: true };
    } catch (error) {
        const message = (error as Error)?.message || "Failed to send welcome email";
        console.error(`[WELCOME EMAIL RESEND FAILED]`, error);
        return { success: false, error: message };
    }
}

export async function sendOtpEmail({
    to,
    name,
    otp,
}: {
    to: string;
    name: string;
    otp: string;
}): Promise<void> {
    const subject = "Security Code: Sreeva AI Account Recovery";
    const html = `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px; background: #ffffff;">
            <h1 style="color: #111827; font-size: 24px; font-weight: 800; margin-bottom: 8px;">Recovery Code</h1>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-bottom: 30px;">
                Hi ${name}, you requested to reset your password. Use the verification code below to proceed:
            </p>
            <div style="background: #fdf2f0; padding: 24px; border-radius: 16px; text-align: center; border: 2px dashed #f97316;">
                <span style="font-size: 32px; font-weight: 900; color: #f97316; letter-spacing: 0.2em;">${otp}</span>
            </div>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 30px; text-align: center;">
                This code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email or contact security.
            </p>
        </div>
    `;
    await sendEmail({ to, subject, html, type: "password-reset" });
}

export async function sendPasswordChangeOtpEmail({
    to,
    otp,
}: {
    to: string;
    otp: string;
}): Promise<void> {
    const subject = "Security Verification: 6-Digit Code";
    const html = `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 24px; background: #ffffff;">
            <h1 style="color: #111827; font-size: 24px; font-weight: 800; margin-bottom: 8px;">Security Code</h1>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-bottom: 30px;">
                Enter the code below to authorize your password change for <strong>${to}</strong>:
            </p>
            <div style="background: #fdf2f0; padding: 24px; border-radius: 16px; text-align: center; border: 2px dashed #f97316;">
                <span style="font-size: 32px; font-weight: 900; color: #f97316; letter-spacing: 0.2em;">${otp}</span>
            </div>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 30px; text-align: center;">
                This code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email.
            </p>
        </div>
    `;
    await sendEmail({ to, subject, html, type: "password-reset" });
}
