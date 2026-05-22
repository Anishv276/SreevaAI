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
    const orgName = orgNameProp || "Sreeva AI";
    const teamLabel = `${orgName} Team`;
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
            ? `Interview Booked: Your AI Video Interview for ${jobTitle}`
            : isAccepted
            ? `Action Required: Schedule your AI Video Interview for ${jobTitle}`
            : `Update regarding your application for ${jobTitle}`;

    const base = `
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        background: #ffffff;
        max-width: 560px;
        margin: 0 auto;
        border: 1px solid #e4e4e7;
        border-radius: 12px;
        overflow: hidden;
    `;

    const pill = (text: string, color: string, bg: string) =>
        `<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.04em;color:${color};background:${bg};">${text}</span>`;

    const primaryBtn = (href: string, label: string) =>
        `<a href="${href}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 24px;border-radius:8px;letter-spacing:0.01em;">${label}</a>`;

    const footer = `
        <div style="padding:24px 32px;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:13px;color:#a1a1aa;">${teamLabel}</p>
        </div>
    `;

    const html = isHired ? `
        <div style="${base}">
            <div style="background:#18181b;padding:32px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:500;color:#a1a1aa;letter-spacing:0.06em;text-transform:uppercase;">${orgName}</p>
            </div>
            <div style="padding:40px 32px 32px;">
                ${pill("Offer", "#15803d", "#f0fdf4")}
                <h1 style="margin:16px 0 10px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">You're in, ${fullName}.</h1>
                <p style="margin:0 0 32px;font-size:15px;color:#52525b;line-height:1.6;">Congratulations — you've been selected for <strong style="color:#18181b;">${jobTitle}</strong>. We're excited to have you on board.</p>
                <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:20px 24px;margin-bottom:32px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.06em;">What's next</p>
                    <p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.6;">${teamLabel} will reach out shortly with your offer letter and onboarding details.</p>
                </div>
            </div>
            ${footer}
        </div>
    ` : isConfirmed ? `
        <div style="${base}">
            <div style="background:#18181b;padding:32px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:500;color:#a1a1aa;letter-spacing:0.06em;text-transform:uppercase;">${orgName}</p>
            </div>
            <div style="padding:40px 32px 32px;">
                ${pill("Interview Confirmed", "#1d4ed8", "#eff6ff")}
                <h1 style="margin:16px 0 10px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">Your slot is booked.</h1>
                <p style="margin:0 0 32px;font-size:15px;color:#52525b;line-height:1.6;">Hi ${fullName}, your AI video interview for <strong style="color:#18181b;">${jobTitle}</strong> is confirmed. Details below.</p>
                <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:20px 24px;margin-bottom:28px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.06em;">Scheduled Time</p>
                    <p style="margin:0;font-size:16px;font-weight:600;color:#18181b;">
                        ${scheduledAt ? scheduledAt.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(scheduledTimeZone ? { timeZone: scheduledTimeZone } : {}) }) : 'Your selected time'}
                    </p>
                </div>
                <div style="margin-bottom:32px;">
                    ${primaryBtn(interviewLink || '#', 'Open Interview Room')}
                </div>
                <div style="border-left:3px solid #e4e4e7;padding:12px 16px;">
                    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">Complete the hardware check before your session. Please use a reliable laptop or desktop with a working camera, microphone, and stable internet for the smoothest experience.</p>
                </div>
            </div>
            ${footer}
        </div>
    ` : isAccepted ? `
        <div style="${base}">
            <div style="background:#18181b;padding:32px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:500;color:#a1a1aa;letter-spacing:0.06em;text-transform:uppercase;">${orgName}</p>
            </div>
            <div style="padding:40px 32px 32px;">
                ${pill("Action Required", "#b45309", "#fffbeb")}
                <h1 style="margin:16px 0 10px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">You've been shortlisted.</h1>
                <p style="margin:0 0 32px;font-size:15px;color:#52525b;line-height:1.6;">Hi ${fullName}, your profile stood out for <strong style="color:#18181b;">${jobTitle}</strong>. The next step is a 20-minute AI video interview - please use a reliable laptop or desktop with a working camera, microphone, and stable internet.</p>
                <div style="margin-bottom:28px;">
                    ${primaryBtn(interviewLink || '#', 'Schedule AI Video Interview')}
                </div>
                ${schedulingDeadlineLabel ? `
                <div style="border-left:3px solid #e4e4e7;padding:12px 16px;margin-bottom:28px;">
                    <p style="margin:0;font-size:13px;color:#71717a;">Schedule on or before <strong style="color:#3f3f46;">${schedulingDeadlineLabel}</strong>. Make sure you're in a quiet space with a working camera, microphone, and a dependable computer.</p>
                </div>
                ` : `
                <div style="border-left:3px solid #e4e4e7;padding:12px 16px;margin-bottom:28px;">
                    <p style="margin:0;font-size:13px;color:#71717a;">Make sure you're in a quiet space with a working camera, microphone, and a dependable computer.</p>
                </div>
                `}
                <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">${teamLabel} will review your interview and follow up within 24-48 hours.</p>
            </div>
            ${footer}
        </div>
    ` : `
        <div style="${base}">
            <div style="background:#18181b;padding:32px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:500;color:#a1a1aa;letter-spacing:0.06em;text-transform:uppercase;">${orgName}</p>
            </div>
            <div style="padding:40px 32px 32px;">
                ${pill("Application Update", "#71717a", "#fafafa")}
                <h1 style="margin:16px 0 10px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">Thanks for applying, ${fullName}.</h1>
                <p style="margin:0 0 32px;font-size:15px;color:#52525b;line-height:1.6;">After reviewing your application for <strong style="color:#18181b;">${jobTitle}</strong>, we've decided not to move forward at this time. We appreciate the effort you put in.</p>
                <p style="margin:0;font-size:14px;color:#71717a;line-height:1.6;">We encourage you to apply for future roles that match your experience. Wishing you the best in your search.</p>
            </div>
            ${footer}
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
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff;max-width:560px;margin:0 auto;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
            <div style="background:#18181b;padding:32px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:500;color:#a1a1aa;letter-spacing:0.06em;text-transform:uppercase;">Sreeva AI</p>
            </div>
            <div style="padding:40px 32px 32px;">
                <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.04em;color:#15803d;background:#f0fdf4;">Workspace Ready</span>
                <h1 style="margin:16px 0 10px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">Welcome, ${adminName}.</h1>
                <p style="margin:0 0 32px;font-size:15px;color:#52525b;line-height:1.6;">Your workspace for <strong style="color:#18181b;">${orgName}</strong> is live. Log in to finish onboarding and launch your first recruitment drive.</p>
                <a href="${loginUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 24px;border-radius:8px;letter-spacing:0.01em;">Access Workspace</a>
            </div>
            <div style="padding:24px 32px;border-top:1px solid #f4f4f5;">
                <p style="margin:0;font-size:13px;color:#a1a1aa;">Questions? Reach out to your platform administrator.</p>
            </div>
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
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff;max-width:480px;margin:0 auto;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
            <div style="background:#18181b;padding:28px 32px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:500;color:#a1a1aa;letter-spacing:0.06em;text-transform:uppercase;">Sreeva AI</p>
            </div>
            <div style="padding:40px 32px 32px;">
                <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">Recovery code</h1>
                <p style="margin:0 0 32px;font-size:14px;color:#52525b;line-height:1.6;">Hi ${name}, use the code below to reset your password. It expires in 10 minutes.</p>
                <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:24px;text-align:center;margin-bottom:32px;">
                    <span style="font-size:36px;font-weight:700;color:#18181b;letter-spacing:0.18em;font-variant-numeric:tabular-nums;">${otp}</span>
                </div>
                <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">If you didn't request this, you can safely ignore this email or contact support.</p>
            </div>
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
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff;max-width:480px;margin:0 auto;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
            <div style="background:#18181b;padding:28px 32px;text-align:center;">
                <p style="margin:0;font-size:13px;font-weight:500;color:#a1a1aa;letter-spacing:0.06em;text-transform:uppercase;">Sreeva AI</p>
            </div>
            <div style="padding:40px 32px 32px;">
                <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">Confirm password change</h1>
                <p style="margin:0 0 32px;font-size:14px;color:#52525b;line-height:1.6;">Enter this code to authorize the password change for <strong style="color:#18181b;">${to}</strong>. It expires in 10 minutes.</p>
                <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:24px;text-align:center;margin-bottom:32px;">
                    <span style="font-size:36px;font-weight:700;color:#18181b;letter-spacing:0.18em;font-variant-numeric:tabular-nums;">${otp}</span>
                </div>
                <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">If you didn't request this, secure your account immediately.</p>
            </div>
        </div>
    `;
    await sendEmail({ to, subject, html, type: "password-reset" });
}

