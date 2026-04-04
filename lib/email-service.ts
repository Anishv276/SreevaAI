
export async function sendEmail(to: string, subject: string, body: string) {
    // In production, use SendGrid, AWS SES, or Resend
    console.log(`
    ==================================================
    📧 MOCK EMAIL SENT
    To: ${to}
    Subject: ${subject}
    --------------------------------------------------
    ${body}
    ==================================================
    `);

    return { success: true };
}

export async function sendApplicationReceivedEmail(candidateName: string, candidateEmail: string, jobTitle: string) {
    return sendEmail(
        candidateEmail,
        `Application Received: ${jobTitle}`,
        `Hi ${candidateName},\n\nWe have received your application for ${jobTitle}. Our AI team is currently reviewing your profile.\n\nBest,\nHirer.ai Team`
    );
}

export async function sendShortlistEmail(candidateName: string, candidateEmail: string, nextStep: "Assessment" | "Interview") {
    return sendEmail(
        candidateEmail,
        `Congratulations! You've been shortlisted`,
        `Hi ${candidateName},\n\nGreat news! You have been shortlisted for the next round: ${nextStep}.\n\nPlease log in to your dashboard to proceed.\n\nBest,\nHirer.ai Recruitment`
    );
}
