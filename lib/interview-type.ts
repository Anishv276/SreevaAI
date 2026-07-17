export type InterviewType = "tech" | "conversational";

const CONVERSATIONAL_ROLE_KEYWORDS = [
  "sales", "account executive", "business development", "bd", "marketing",
  "growth", "customer success", "account manager", "partnerships",
  "revenue", "client", "sdr", "bdr", "inside sales",
];

export function classifyInterviewType(jobTitleOrRole: string | null | undefined): InterviewType {
  const text = (jobTitleOrRole || "").toLowerCase();
  if (!text) return "tech";
  return CONVERSATIONAL_ROLE_KEYWORDS.some((keyword) => text.includes(keyword))
    ? "conversational"
    : "tech";
}
