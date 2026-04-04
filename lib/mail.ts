import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'Lumoscale <careers@lumoscale.com>';

export async function sendApplicationStatusEmail({
    email,
    fullName,
    jobTitle,
    status,
    score,
    assessmentLink
}: {
    email: string;
    fullName: string;
    jobTitle: string;
    status: 'ACCEPTED' | 'REJECTED';
    score: number;
    assessmentLink?: string;
}) {
    const isAccepted = status === 'ACCEPTED';
    
    const subject = isAccepted 
        ? `Congratulations! You've been shortlisted for the ${jobTitle} AI Interview`
        : `Update regarding your application for ${jobTitle}`;

    const html = isAccepted ? `
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
                    <a href="${assessmentLink}" style="background-color: #F97316; color: white; padding: 14px 35px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(249,115,22,0.25);">Start AI Interview</a>
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
            <p style="color: #4B5563;">We appreciate the time you took to apply and wish you the best of luck in your job search.</p>
            <br />
            <p style="color: #9CA3AF; font-size: 12px; margin-bottom: 5px;">Best Regards,</p>
            <p style="color: #374151; font-weight: 700; margin-top: 0;">Lumoscale Recruitment Team</p>
        </div>
    `;

    try {
        const payload = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: subject,
            html: html,
        });

        if (payload.error) {
            console.error(`[MAIL ERROR] Resend rejected email to ${email}:`, payload.error);
            return { success: false, error: payload.error };
        }

        console.log(`[MAIL] Status email sent to ${email} (${status})`);
        return { success: true };
    } catch (error) {
        console.error(`[MAIL EXCEPTION] Failed to send email to ${email}:`, error);
        return { success: false, error };
    }
}
