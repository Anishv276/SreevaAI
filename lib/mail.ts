import { sendEmail } from "./resend";
export type MailResult =
    | { success: true }
    | { success: false; error: string };
const FONT = `'Geist Sans', 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const VIOLET = "#7C3AED";
const VIOLET_LIGHT = "#F5F3FF";   // violet-50
const VIOLET_BORDER = "#DDD6FE";  // violet-200

function wrapper(content: string) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Sreeva AI</title>
</head>
<body style="margin:0;padding:0;background-color:#FAFAFC;font-family:${FONT};-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFC;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#ffffff;border:1px solid #E9E7FF;border-top:4px solid #8B5CF6;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(124,58,237,0.08);">
        ${content}
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#9CA3AF;text-align:center;letter-spacing:0.02em;">© ${new Date().getFullYear()} Sreeva AI</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function header(eyebrow: string, title: string) {
    return `
<tr>
  <td style="padding:48px 48px 32px;">
    <div style="margin-bottom:28px;">
        <span style="font-size:16px;font-weight:900;color:#111827;letter-spacing:0.1em;text-transform:uppercase;">SREEVA AI</span>
    </div>
    <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:${VIOLET};letter-spacing:0.12em;text-transform:uppercase;">${eyebrow}</p>
    <h1 style="margin:0;font-size:26px;font-weight:700;color:#111827;letter-spacing:-0.03em;line-height:1.25;">${title}</h1>
  </td>
</tr>`;
}

function infoCard(items: { label: string; value: string }[]) {
    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F3FF;border:1px solid #E9E7FF;border-radius:16px;margin:24px 0;">
  <tr><td style="padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${items.map(({ label, value }, i) => `
      <tr>
        <td style="padding:${i === 0 ? "0" : "18px"} 0 0;vertical-align:top;width:120px;">
          <span style="font-size:11px;font-weight:700;color:#8B5CF6;text-transform:uppercase;letter-spacing:0.08em;">${label}</span>
        </td>
        <td style="padding:${i === 0 ? "0" : "18px"} 0 0;vertical-align:top;">
          <span style="font-size:14px;font-weight:600;color:#111827;">${value}</span>
        </td>
      </tr>`).join("")}
    </table>
  </td></tr>
</table>`;
}

function ctaButton(href: string, label: string) {
    return `<a href="${href}" style="display:inline-block;background-color:#8B5CF6;background-image:linear-gradient(135deg, #8B5CF6, #3B82F6);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:16px 36px;border-radius:9999px;box-shadow:0 6px 20px 0 rgba(124,58,237,0.3);">${label}</a>`;
}

function tipBox(html: string) {
    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFC;border:1px solid #E9E7FF;border-radius:16px;margin:24px 0;">
  <tr><td style="padding:24px;font-size:14px;color:#6B7280;line-height:1.6;">${html}</td></tr>
</table>`;
}

function noteBox(html: string) {
    return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFBEB;border:1px solid #FDE68A;border-radius:16px;margin:24px 0;">
  <tr><td style="padding:24px;font-size:14px;color:#B45309;line-height:1.6;">${html}</td></tr>
</table>`;
}

function footerRow(text: string) {
    return `
<tr>
  <td style="padding:0 48px;"><div style="height:1px;background-color:#F0EEF8;"></div></td>
</tr>
<tr>
  <td style="padding:32px 48px 48px;">
    <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.6;">${text}</p>
  </td>
</tr>`;
}

// --- 1. Interview Invitation -------------------------------------------------
export async function sendInterviewInviteEmail({
    email, fullName, jobTitle, orgName, interviewLink, schedulingDeadline,
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
    const subject = `You've been shortlisted for ${jobTitle} at ${orgName}: Complete your AI interview`;
    const html = wrapper(`
        ${header("Interview Invitation", `Congratulations, ${fullName}!`)}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            Your profile stood out for the <strong style="color:#111;">${jobTitle}</strong> role at <strong style="color:#111;">${orgName}</strong>. You've been shortlisted for a <strong style="color:#111;">20-minute AI video interview</strong> you can take from anywhere, at your convenience.
          </p>
          ${infoCard([
              { label: "Role", value: jobTitle },
              { label: "Company", value: orgName },
              { label: "Format", value: "AI Video Interview · ~20 minutes" },
              ...(deadlineStr ? [{ label: "Deadline", value: deadlineStr }] : []),
          ])}
          ${tipBox(`
            <strong style="display:block;margin-bottom:6px;">Before you begin</strong>
            <ul style="margin:0;padding-left:18px;">
              <li>Use a <strong>laptop or desktop</strong>, not a phone</li>
              <li>Ensure your <strong>camera &amp; microphone</strong> are working</li>
              <li>Find a <strong>quiet space</strong> with stable internet</li>
              <li>The interview <strong>cannot be paused</strong> once started</li>
            </ul>
          `)}
        </td></tr>
        <tr><td style="padding:24px 48px 16px;text-align:center;">
          ${ctaButton(interviewLink, "Start AI Interview")}
        </td></tr>
        ${footerRow(`Sent by ${orgName} via Sreeva AI · ${email} · Results reviewed within 24–48 hours.`)}
    `);
    try {
        await sendEmail({ to: email, subject, html, type: "interview" });
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}
// --- 2. Rejection ------------------------------------------------------------
export async function sendRejectionEmail({
    email, fullName, jobTitle, orgName,
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    orgName: string;
}): Promise<MailResult> {
    const subject = `Your application update for ${jobTitle} at ${orgName}`;
    const html = wrapper(`
        ${header("Application Update", `Hi ${fullName},`)}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 20px;font-size:15px;color:#404040;line-height:1.75;">
            Thank you for your interest in the <strong style="color:#111;">${jobTitle}</strong> role at <strong style="color:#111;">${orgName}</strong>. After careful consideration, we've decided not to move forward with your application at this time.
          </p>
          ${noteBox(`This decision doesn't reflect your capabilities or potential; it simply means there wasn't a match for this particular opening. We encourage you to apply for future roles that align with your background.`)}
          <p style="margin:20px 0 0;font-size:14px;color:#737373;line-height:1.75;">We wish you the very best in your search.</p>
        </td></tr>
        ${footerRow(`Sent by ${orgName} via Sreeva AI · ${email}`)}
    `);
    try {
        await sendEmail({ to: email, subject, html, type: "interview" });
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}
// --- 3. Interview Completed (admin notification) -----------------------------
export async function sendInterviewCompletedEmail({
    adminEmail, candidateName, jobTitle, orgName, completedAt, reportLink,
}: {
    adminEmail: string;
    candidateName: string;
    jobTitle: string;
    orgName: string;
    completedAt?: Date;
    reportLink?: string;
}): Promise<MailResult> {
    const subject = `Interview Completed: ${candidateName} for ${jobTitle}`;
    const completedStr = (completedAt || new Date()).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const html = wrapper(`
        ${header("Interview Completed", "New report ready to review")}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            A candidate has just completed their AI interview. The AI-generated scorecard, transcript, and proctoring summary are ready for your review.
          </p>
          ${infoCard([
              { label: "Candidate", value: candidateName },
              { label: "Role", value: jobTitle },
              { label: "Job", value: jobTitle || orgName },
              { label: "Completed", value: completedStr },
          ])}
          ${tipBox(`<strong>What's in the report</strong><br/>AI scores across depth, clarity, specificity &amp; grounding · Full transcript · Proctoring signals · Recruiter recommendation`)}
        </td></tr>
        <tr><td style="padding:24px 48px 16px;text-align:center;">
          ${reportLink
              ? ctaButton(reportLink, "View Full Report")
              : `<p style="margin:0;font-size:14px;color:#737373;">Log in to your Sreeva AI dashboard to view the report.</p>`
          }
        </td></tr>
        ${footerRow(`You are receiving this as an admin of ${orgName} on Sreeva AI.`)}
    `);
    try {
        await sendEmail({ to: adminEmail, subject, html, type: "interview" });
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}
// --- 3b. Interview Completed (candidate notification) ------------------------
export async function sendCandidateInterviewCompletedEmail({
    email, fullName, jobTitle, orgName,
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    orgName: string;
}): Promise<MailResult> {
    const subject = `Thanks for interviewing for ${jobTitle} at ${orgName}`;
    const html = wrapper(`
        ${header("Interview Completed", `Hi ${fullName},`)}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            Thank you for completing your AI interview for the <strong style="color:#111;">${jobTitle}</strong> role at <strong style="color:#111;">${orgName}</strong>.
          </p>
          ${noteBox(`Our hiring team will review your interview and reach out to you shortly with next steps.`)}
        </td></tr>
        ${footerRow(`Sent by ${orgName} via Sreeva AI · ${email}`)}
    `);
    try {
        await sendEmail({ to: email, subject, html, type: "interview" });
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}
// --- 4. Org Welcome ----------------------------------------------------------
export async function sendOrgWelcomeEmail({
    email, orgName, tempPassword,
}: {
    email: string;
    orgName: string;
    tempPassword?: string;
}): Promise<MailResult> {
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/login`;
    const subject = `Your ${orgName} workspace on Sreeva AI is ready`;
    const html = wrapper(`
        ${header("Workspace Ready", "Welcome to Sreeva AI!")}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            Your workspace for <strong style="color:#111;">${orgName}</strong> is live. You can now build recruitment jobs, shortlist candidates, and run AI-powered interviews at scale.
          </p>
          ${infoCard([
              { label: "Organization", value: orgName },
              { label: "Login Email", value: email },
              ...(tempPassword ? [{ label: "Password", value: `<code style="background:#F3F4F6;padding:4px 8px;border-radius:6px;font-size:13px;border:1px solid #E5E7EB;">${tempPassword}</code>` }] : []),
          ])}
          ${tipBox(`
            <strong style="display:block;margin-bottom:12px;">Get started in 4 steps</strong>
            <table cellpadding="0" cellspacing="0" border="0">
              ${[
                  ["1", "Log in with your credentials above"],
                  ["2", "Complete your organization profile &amp; settings"],
                  ["3", "Create your first recruitment job"],
                  ["4", "Shortlist candidates and send interview invitations"],
              ].map(([n, text]) => `
              <tr>
                <td style="vertical-align:top;padding:4px 12px 4px 0;">
                  <span style="display:inline-block;width:22px;height:22px;background:linear-gradient(135deg, #8B5CF6, #3B82F6);border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#fff;">${n}</span>
                </td>
                <td style="font-size:14px;color:#4B5563;line-height:1.7;padding:4px 0;">${text}</td>
              </tr>`).join("")}
            </table>
          `)}
        </td></tr>
        <tr><td style="padding:24px 48px 16px;text-align:center;">
          ${ctaButton(loginUrl, "Access Your Workspace")}
        </td></tr>
        ${footerRow(`Questions? Reply to this email or contact your platform administrator.`)}
    `);
    try {
        await sendEmail({ to: email, subject, html, type: "welcome" });
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send welcome email" };
    }
}
// --- 5. OTP: Password Reset -------------------------------------------------
export async function sendOtpEmail({ to, name, otp }: { to: string; name: string; otp: string }): Promise<void> {
    const subject = `${otp} is your Sreeva AI recovery code`;
    const digitBoxes = otp.split("").map(d =>
        `<td style="padding:0 4px;"><div style="width:48px;height:60px;background:#ffffff;border:2px solid ${VIOLET_BORDER};border-radius:12px;text-align:center;line-height:60px;font-size:28px;font-weight:800;color:#111827;font-variant-numeric:tabular-nums;box-shadow:0 2px 8px rgba(124,58,237,0.05);">${d}</div></td>`
    ).join("");
    const html = wrapper(`
        ${header("Security Code", "Account recovery")}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 20px;font-size:15px;color:#404040;line-height:1.75;">
            Hi ${name}, here is your one-time recovery code. Enter it on the reset page to continue. This code expires in <strong>10 minutes</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${VIOLET_LIGHT};border:1px solid ${VIOLET_BORDER};border-radius:16px;">
            <tr><td style="padding:32px;text-align:center;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:${VIOLET};letter-spacing:0.12em;text-transform:uppercase;">Your one-time code</p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>${digitBoxes}</tr></table>
              <p style="margin:16px 0 0;font-size:13px;color:${VIOLET};">Expires in <strong>10 minutes</strong></p>
            </td></tr>
          </table>
          ${noteBox(`⚠️ <strong>Never share this code.</strong> Sreeva AI will never ask for your OTP via phone, chat, or email. If you didn't request this, please ignore it, your account is safe.`)}
        </td></tr>
        ${footerRow(`Security email sent to ${to} · This code expires in 10 minutes.`)}
    `);
    await sendEmail({ to, subject, html, type: "password-reset" });
}
// --- 6. Schedule Invite (candidate picks a slot) -----------------------------
export async function sendScheduleInviteEmail({
    email, fullName, jobTitle, orgName, scheduleLink,
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    orgName: string;
    scheduleLink: string;
}): Promise<MailResult> {
    const subject = `Schedule your AI interview for ${jobTitle} at ${orgName}`;
    const html = wrapper(`
        ${header("Interview Invitation", `Hi ${fullName}, you've been shortlisted!`)}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            Congratulations! Your profile stood out for the <strong style="color:#111;">${jobTitle}</strong> role at <strong style="color:#111;">${orgName}</strong>.
            You've been invited to a <strong style="color:#111;">20-minute AI video interview</strong>. Please pick a time slot that works best for you.
          </p>
          ${infoCard([
              { label: "Role", value: jobTitle },
              { label: "Company", value: orgName },
              { label: "Format", value: "AI Video Interview · 20 minutes" },
              { label: "Duration", value: "Slots are 30 min · Interview is 20 min" },
          ])}
          ${tipBox(`
            <strong style="display:block;margin-bottom:6px;">Before you begin</strong>
            <ul style="margin:0;padding-left:18px;">
              <li>Use a <strong>laptop or desktop</strong>, not a phone</li>
              <li>Ensure your <strong>camera &amp; microphone</strong> are working</li>
              <li>Find a <strong>quiet space</strong> with stable internet</li>
              <li>Be ready <strong>5 minutes before</strong> your scheduled time</li>
              <li>The interview starts <strong>exactly at your slot time</strong> and cannot be paused</li>
            </ul>
          `)}
        </td></tr>
        <tr><td style="padding:24px 48px 32px;text-align:center;">
          ${ctaButton(scheduleLink, "Pick Your Time Slot")}
        </td></tr>
        ${footerRow(`Sent by ${orgName} via Sreeva AI · ${email}`)}
    `);
    try {
        await sendEmail({ to: email, subject, html, type: "interview" });
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}
// --- 7. Interview Link (after slot is booked) --------------------------------
export async function sendInterviewScheduledEmail({
    email, fullName, jobTitle, orgName, interviewLink, scheduledAt, timezone,
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    orgName: string;
    interviewLink: string;
    scheduledAt: Date;
    timezone: string;
}): Promise<MailResult> {
    const timeStr = scheduledAt.toLocaleString("en-IN", {
        timeZone: timezone,
        weekday: "long", month: "long", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
    });
    const subject = `Your interview is confirmed for ${jobTitle} at ${orgName}: ${timeStr}`;
    const html = wrapper(`
        ${header("Interview Confirmed", `You're all set, ${fullName}!`)}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0;font-size:15px;color:#404040;line-height:1.75;">
            Your AI interview for <strong style="color:#111;">${jobTitle}</strong> at <strong style="color:#111;">${orgName}</strong> is confirmed.
            Use the link below to join: it will unlock <strong>2 minutes before</strong> your scheduled time.
          </p>
          ${infoCard([
              { label: "Role", value: jobTitle },
              { label: "Company", value: orgName },
              { label: "Scheduled", value: timeStr },
              { label: "Duration", value: "20 minutes" },
              { label: "Timezone", value: timezone },
          ])}
          ${tipBox(`
            <strong style="display:block;margin-bottom:6px;">Timeline</strong>
            <ul style="margin:0;padding-left:18px;">
              <li><strong>5 min before:</strong> Open the link and complete hardware check</li>
              <li><strong>2 min before:</strong> "Begin Interview" button unlocks with a live countdown</li>
              <li><strong>At slot time:</strong> Interview starts automatically</li>
              <li><strong>5 min after slot:</strong> Link expires, do not be late</li>
            </ul>
          `)}
        </td></tr>
        <tr><td style="padding:24px 48px 16px;text-align:center;">
          ${ctaButton(interviewLink, "Join Interview")}
        </td></tr>
        ${footerRow(`Sent by ${orgName} via Sreeva AI · ${email} · Results reviewed within 24–48 hours.`)}
    `);
    try {
        await sendEmail({ to: email, subject, html, type: "interview" });
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error)?.message || "Failed to send email" };
    }
}
// --- 8. OTP: Password Change -------------------------------------------------
export async function sendPasswordChangeOtpEmail({ to, otp }: { to: string; otp: string }): Promise<void> {
    const subject = `${otp}: Confirm your Sreeva AI password change`;
    const digitBoxes = otp.split("").map(d =>
        `<td style="padding:0 4px;"><div style="width:48px;height:60px;background:#ffffff;border:2px solid ${VIOLET_BORDER};border-radius:12px;text-align:center;line-height:60px;font-size:28px;font-weight:800;color:#111827;font-variant-numeric:tabular-nums;box-shadow:0 2px 8px rgba(124,58,237,0.05);">${d}</div></td>`
    ).join("");
    const html = wrapper(`
        ${header("Security Verification", "Confirm password change")}
        <tr><td style="padding:32px 48px 0;">
          <p style="margin:0 0 20px;font-size:15px;color:#404040;line-height:1.75;">
            A password change was requested for <strong style="color:#111;">${to}</strong>. Enter this code to authorize the change. It expires in <strong>10 minutes</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${VIOLET_LIGHT};border:1px solid ${VIOLET_BORDER};border-radius:16px;">
            <tr><td style="padding:32px;text-align:center;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:${VIOLET};letter-spacing:0.12em;text-transform:uppercase;">Authorization code</p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>${digitBoxes}</tr></table>
              <p style="margin:16px 0 0;font-size:13px;color:${VIOLET};">Expires in <strong>10 minutes</strong></p>
            </td></tr>
          </table>
          ${noteBox(`⚠️ <strong>Didn't request this?</strong> Someone may be trying to access your account. Secure it immediately by resetting your password.`)}
        </td></tr>
        ${footerRow(`Security email sent to ${to} · This code expires in 10 minutes.`)}
    `);
    await sendEmail({ to, subject, html, type: "password-reset" });
}
