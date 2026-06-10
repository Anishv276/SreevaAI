import { sendEmail } from "./resend";

export type MailResult =
    | { success: true }
    | { success: false; error: string };

// ─── Shared primitives ──────────────────────────────────────────────────────

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;

function wrapper(content: string) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Sreeva AI</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:${FONT};-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">
        ${content}
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:#a3a3a3;text-align:center;">© ${new Date().getFullYear()} Sreeva AI · AI-Powered Recruitment</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function header(accentColor: string, eyebrow: string, title: string) {
    return `
<tr>
  <td style="background:${accentColor};padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:32px 40px 28px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.65);letter-spacing:0.12em;text-transform:uppercase;">${eyebrow}</p>
          <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:1.25;">${title}</p>
        </td>
        <td style="padding:32px 40px 28px 0;text-align:right;vertical-align:top;">
          <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:0.1em;text-transform:uppercase;">SREEVA AI</span>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

function infoCard(items: { label: string; value: string }[], accentColor: string) {
    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #e5e5e5;border-left:4px solid ${accentColor};border-radius:10px;margin:20px 0;">
  <tr><td style="padding:18px 22px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${items.map(({ label, value }, i) => `
      <tr>
        <td style="padding:${i === 0 ? "0" : "8px"} 0 0;vertical-align:top;width:130px;">
          <span style="font-size:11px;font-weight:700;color:#a3a3a3;text-transform:uppercase;letter-spacing:0.07em;">${label}</span>
        </td>
        <td style="padding:${i === 0 ? "0" : "8px"} 0 0;vertical-align:top;">
          <span style="font-size:14px;font-weight:600;color:#1a1a1a;">${value}</span>
        </td>
      </tr>`).join("")}
    </table>
  </td></tr>
</table>`;
}

function ctaButton(href: string, label: string, bg: string) {
    return `<a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;letter-spacing:0.01em;box-shadow:0 2px 12px rgba(0,0,0,0.18);">${label} &rarr;</a>`;
}

function alertBox(color: string, bg: string, border: string, html: string) {
    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};border:1px solid ${border};border-radius:10px;margin:16px 0;">
  <tr><td style="padding:16px 20px;font-size:13px;color:${color};line-height:1.75;">${html}</td></tr>
</table>`;
}

function footerRow(text: string) {
    return `
<tr>
  <td style="padding:0 40px;"><div style="height:1px;background:#f0f0f0;"></div></td>
</tr>
<tr>
  <td style="padding:20px 40px 28px;">
    <p style="margin:0;font-size:12px;color:#b0b0b0;line-height:1.7;">${text}</p>
  </td>
</tr>`;
}

// ─── 1. Interview Invitation (Shortlist) ────────────────────────────────────

export async function sendInterviewInviteEmail({
    email,
    fullName,
    jobTitle,
    orgName,
    interviewLink,
    schedulingDeadline,
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    orgName: string;
    interviewLink: string;
    schedulingDeadline?: Date | null;
}): Promise<MailResult> {
    const deadlineStr = schedulingDeadline
        ? schedulingDeadline.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
        : null;

    const subject = `You've been shortlisted for ${jobTitle} at ${orgName} — Complete your AI interview`;

    const html = wrapper(`
        ${header("#f97316", "Interview Invitation", `Congratulations, ${fullName}!`)}
        <tr><td style="padding:32px 40px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            Your profile stood out for the <strong style="color:#1a1a1a;">${jobTitle}</strong> role at <strong style="color:#1a1a1a;">${orgName}</strong>. You've been shortlisted and the next step is a <strong style="color:#1a1a1a;">20-minute AI video interview</strong> you can take from anywhere, at your convenience.
          </p>
          ${infoCard([
              { label: "Role", value: jobTitle },
              { label: "Company", value: orgName },
              { label: "Format", value: "AI Video Interview · ~20 minutes" },
              ...(deadlineStr ? [{ label: "Deadline", value: deadlineStr }] : []),
          ], "#f97316")}
          ${alertBox("#92400e", "#fff7ed", "#fed7aa", `
            <strong style="display:block;margin-bottom:6px;">📋 Before you begin</strong>
            <ul style="margin:0;padding-left:18px;">
              <li>Use a <strong>laptop or desktop</strong> — not a phone</li>
              <li>Ensure your <strong>camera &amp; microphone</strong> are working</li>
              <li>Find a <strong>quiet space</strong> with a stable internet connection</li>
              <li>The interview <strong>cannot be paused</strong> once started</li>
            </ul>
          `)}
        </td></tr>
        <tr><td style="padding:24px 40px 8px;text-align:center;">
          ${ctaButton(interviewLink, "Start AI Interview", "#f97316")}
          <p style="margin:14px 0 0;font-size:12px;color:#b0b0b0;">Button not working? Copy this link into your browser:<br/>
            <span style="color:#737373;word-break:break-all;">${interviewLink}</span>
          </p>
        </td></tr>
        ${footerRow(`Sent by ${orgName} via Sreeva AI &middot; ${email} &middot; Results reviewed within 24–48 hours.`)}
    `);

    try {
        await sendEmail({ to: email, subject, html, type: "interview" });
        console.log(`[MAIL] Interview invite sent to ${email}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}

// ─── 2. Rejection ───────────────────────────────────────────────────────────

export async function sendRejectionEmail({
    email,
    fullName,
    jobTitle,
    orgName,
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    orgName: string;
}): Promise<MailResult> {
    const subject = `Your application update for ${jobTitle} at ${orgName}`;

    const html = wrapper(`
        ${header("#737373", "Application Update", `Hi ${fullName},`)}
        <tr><td style="padding:32px 40px 0;">
          <p style="margin:0 0 20px;font-size:15px;color:#404040;line-height:1.75;">
            Thank you for your interest in the <strong style="color:#1a1a1a;">${jobTitle}</strong> role at <strong style="color:#1a1a1a;">${orgName}</strong>. After careful consideration, we have decided not to move forward with your application at this time.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #e5e5e5;border-radius:10px;">
            <tr><td style="padding:18px 22px;">
              <p style="margin:0;font-size:13px;color:#737373;line-height:1.8;">
                This decision does not reflect your capabilities or potential — it simply means there wasn't a match for this particular opening. We encourage you to apply for future roles that align with your background.
              </p>
            </td></tr>
          </table>
          <p style="margin:20px 0 0;font-size:14px;color:#737373;line-height:1.75;">We wish you the very best in your search.</p>
        </td></tr>
        ${footerRow(`Sent by ${orgName} via Sreeva AI &middot; ${email}`)}
    `);

    try {
        await sendEmail({ to: email, subject, html, type: "interview" });
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}

// ─── 4. Interview Completed (admin notification) ───────────────────────────

export async function sendInterviewCompletedEmail({
    adminEmail,
    adminName,
    candidateName,
    jobTitle,
    orgName,
    driveTitle,
    completedAt,
    reportLink,
}: {
    adminEmail: string;
    adminName: string;
    candidateName: string;
    jobTitle: string;
    orgName: string;
    driveTitle?: string;
    completedAt?: Date;
    reportLink?: string;
}): Promise<MailResult> {
    const subject = `Interview Completed: ${candidateName} · ${jobTitle}`;
    const completedStr = completedAt
        ? completedAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const html = wrapper(`
        ${header("#6366f1", "Interview Completed", `New report ready to review`)}
        <tr><td style="padding:32px 40px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            Hi ${adminName}, a candidate has just completed their AI interview. The AI-generated scorecard, full transcript, and proctoring summary are ready for your review.
          </p>
          ${infoCard([
              { label: "Candidate", value: candidateName },
              { label: "Role", value: jobTitle },
              { label: "Drive", value: driveTitle || orgName },
              { label: "Completed", value: completedStr },
          ], "#6366f1")}
          ${alertBox("#312e81", "#eef2ff", "#c7d2fe", `
            <strong>📊 What's in the report</strong><br/>
            AI scores across depth, clarity, specificity, and grounding for each topic covered · Full interview transcript · Proctoring signals summary · Recruiter recommendation
          `)}
        </td></tr>
        <tr><td style="padding:24px 40px 8px;text-align:center;">
          ${reportLink
              ? ctaButton(reportLink, "View Full Report", "#6366f1")
              : `<p style="margin:0;font-size:14px;color:#737373;">Log in to your Sreeva AI dashboard to view the full report.</p>`
          }
        </td></tr>
        ${footerRow(`You are receiving this as an admin of ${orgName} on Sreeva AI.`)}
    `);

    try {
        await sendEmail({ to: adminEmail, subject, html, type: "interview" });
        console.log(`[MAIL] Interview completed email sent to ${adminEmail}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}

// ─── 6. Org Creation / Workspace Welcome ──────────────────────────────────

export async function sendOrgWelcomeEmail({
    email,
    orgName,
    adminName,
    tempPassword,
}: {
    email: string;
    orgName: string;
    adminName: string;
    tempPassword?: string;
}): Promise<MailResult> {
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/login`;
    const subject = `Your ${orgName} workspace on Sreeva AI is ready`;

    const html = wrapper(`
        ${header("#0ea5e9", "Workspace Ready", `Welcome aboard, ${adminName}!`)}
        <tr><td style="padding:32px 40px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            Your organization workspace for <strong style="color:#1a1a1a;">${orgName}</strong> has been created and is ready to use. You can now build recruitment drives, shortlist candidates, and launch AI-powered interviews at scale.
          </p>
          ${infoCard([
              { label: "Organization", value: orgName },
              { label: "Login Email", value: email },
              ...(tempPassword ? [{ label: "Password", value: `<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px;">${tempPassword}</code>` }] : []),
              { label: "Platform", value: "Sreeva AI" },
          ], "#0ea5e9")}
          ${alertBox("#0c4a6e", "#f0f9ff", "#bae6fd", `
            <strong style="display:block;margin-bottom:8px;">🚀 Get started in 4 steps</strong>
            <table cellpadding="0" cellspacing="0" border="0">
              ${[
                  ["1", "Log in with your credentials above"],
                  ["2", "Complete your organization profile &amp; settings"],
                  ["3", "Create your first recruitment drive"],
                  ["4", "Shortlist candidates and send interview invitations"],
              ].map(([n, text]) => `
              <tr>
                <td style="vertical-align:top;padding:3px 10px 3px 0;">
                  <span style="display:inline-block;width:20px;height:20px;background:#0ea5e9;border-radius:50%;text-align:center;line-height:20px;font-size:11px;font-weight:700;color:#fff;">${n}</span>
                </td>
                <td style="font-size:13px;color:#0c4a6e;line-height:1.7;padding:3px 0;">${text}</td>
              </tr>`).join("")}
            </table>
          `)}
        </td></tr>
        <tr><td style="padding:24px 40px 8px;text-align:center;">
          ${ctaButton(loginUrl, "Access Your Workspace", "#0ea5e9")}
        </td></tr>
        ${footerRow(`Questions? Reply to this email or contact your platform administrator. Workspace created on Sreeva AI.`)}
    `);

    try {
        await sendEmail({ to: email, subject, html, type: "welcome" });
        console.log(`[WELCOME EMAIL] Sent to ${email} for org ${orgName}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send welcome email" };
    }
}

// ─── 7. OTP — Password Reset ───────────────────────────────────────────────

export async function sendOtpEmail({
    to,
    name,
    otp,
}: {
    to: string;
    name: string;
    otp: string;
}): Promise<void> {
    const subject = `${otp} is your Sreeva AI recovery code`;
    const digitBoxes = otp.split("").map(d =>
        `<td style="padding:0 3px;"><div style="width:46px;height:58px;background:#fafafa;border:2px solid #e5e5e5;border-radius:10px;text-align:center;line-height:58px;font-size:28px;font-weight:800;color:#1a1a1a;font-variant-numeric:tabular-nums;">${d}</div></td>`
    ).join("");

    const html = wrapper(`
        ${header("#7c3aed", "Security Code", "Account recovery")}
        <tr><td style="padding:32px 40px 0;">
          <p style="margin:0 0 20px;font-size:15px;color:#404040;line-height:1.75;">
            Hi ${name}, here is your one-time recovery code. Enter it on the reset page to continue. This code expires in <strong>10 minutes</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;">
            <tr><td style="padding:28px 24px;text-align:center;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#7c3aed;letter-spacing:0.1em;text-transform:uppercase;">Your one-time code</p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>${digitBoxes}</tr></table>
              <p style="margin:14px 0 0;font-size:12px;color:#a78bfa;">Expires in <strong>10 minutes</strong></p>
            </td></tr>
          </table>
          ${alertBox("#7c2d12", "#fff7ed", "#fed7aa", `⚠️ <strong>Never share this code.</strong> Sreeva AI will never ask for your OTP via phone, chat, or email. If you didn't request this, please ignore — your account is safe.`)}
        </td></tr>
        ${footerRow(`Security email sent to ${to} &middot; This code expires in 10 minutes.`)}
    `);

    await sendEmail({ to, subject, html, type: "password-reset" });
}

// ─── 8. OTP — Password Change ──────────────────────────────────────────────

export async function sendPasswordChangeOtpEmail({
    to,
    otp,
}: {
    to: string;
    otp: string;
}): Promise<void> {
    const subject = `${otp} — Confirm your Sreeva AI password change`;
    const digitBoxes = otp.split("").map(d =>
        `<td style="padding:0 3px;"><div style="width:46px;height:58px;background:#fafafa;border:2px solid #e5e5e5;border-radius:10px;text-align:center;line-height:58px;font-size:28px;font-weight:800;color:#1a1a1a;font-variant-numeric:tabular-nums;">${d}</div></td>`
    ).join("");

    const html = wrapper(`
        ${header("#dc2626", "Security Verification", "Confirm password change")}
        <tr><td style="padding:32px 40px 0;">
          <p style="margin:0 0 20px;font-size:15px;color:#404040;line-height:1.75;">
            A password change was requested for <strong style="color:#1a1a1a;">${to}</strong>. Enter this code to authorize the change. It expires in <strong>10 minutes</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;">
            <tr><td style="padding:28px 24px;text-align:center;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#dc2626;letter-spacing:0.1em;text-transform:uppercase;">Authorization code</p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>${digitBoxes}</tr></table>
              <p style="margin:14px 0 0;font-size:12px;color:#f87171;">Expires in <strong>10 minutes</strong></p>
            </td></tr>
          </table>
          ${alertBox("#7c2d12", "#fff7ed", "#fed7aa", `⚠️ <strong>Didn't request this?</strong> Someone may be trying to access your account. Secure it immediately by resetting your password.`)}
        </td></tr>
        ${footerRow(`Security email sent to ${to} &middot; This code expires in 10 minutes.`)}
    `);

    await sendEmail({ to, subject, html, type: "password-reset" });
}