const RESEND_API_KEY = process.env.RESEND_API_KEY!;
type EmailType = "interview" | "password-reset" | "welcome";
const FROM_MAP: Record<EmailType, string> = {
    "interview":      process.env.RESEND_FROM_INTERVIEW      || "Sreeva AI <interviews@sreevaai.com>",
    "password-reset": process.env.RESEND_FROM_PASSWORD_RESET || "Sreeva AI <no-reply@sreevaai.com>",
    "welcome":        process.env.RESEND_FROM_WELCOME        || "Sreeva AI <hello@sreevaai.com>",
};
export async function sendEmail({
    to,
    subject,
    html,
    type = "welcome",
}: {
    to: string;
    subject: string;
    html: string;
    type?: EmailType;
}): Promise<void> {
    const from = FROM_MAP[type];
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || `Resend API error: ${res.status}`);
    }
}