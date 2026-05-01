export const INTERVIEW_SUPPORT_EMAIL = "support@sreevaai.com";
export const INTERVIEW_SUSPENDED_MESSAGE =
  "Your account got suspended because no interviews are left. Please recharge immediately and contact support@sreevaai.com.";

export function getSupportComposeUrl(params?: { subject?: string; body?: string }) {
  const subject = encodeURIComponent(params?.subject ?? "Support request");
  const body = encodeURIComponent(params?.body ?? "");
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(INTERVIEW_SUPPORT_EMAIL)}&su=${subject}&body=${body}`;
}

export function getInterviewQuotaSupportMessage(action = "interviews") {
  return `Interview quota exhausted. Please contact ${INTERVIEW_SUPPORT_EMAIL} for further ${action} or go to Billing to upgrade your plan.`;
}

export function getInterviewActionBlockedMessage(isSuspended?: boolean) {
  return isSuspended ? INTERVIEW_SUSPENDED_MESSAGE : getInterviewQuotaSupportMessage("interviews");
}

export function isInterviewQuotaLocked(status?: {
  interviewQuotaTotal?: number | null;
  hasSufficientInterviews?: boolean | null;
}) {
  const total = Number(status?.interviewQuotaTotal ?? 0);
  const hasSufficient = Boolean(status?.hasSufficientInterviews ?? true);
  return total > 0 && !hasSufficient;
}
