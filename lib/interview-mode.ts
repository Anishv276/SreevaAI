export const INTERVIEW_MODE_SLOT = "SLOT";
export const INTERVIEW_MODE_DEADLINE = "DEADLINE";

export type InterviewMode = "SLOT" | "DEADLINE";

export function normalizeInterviewMode(value: unknown): InterviewMode {
  const raw = String(value || "").trim().toUpperCase();
  return raw === INTERVIEW_MODE_SLOT ? INTERVIEW_MODE_SLOT : INTERVIEW_MODE_DEADLINE;
}

export function isSlotMode(value: unknown): boolean {
  return normalizeInterviewMode(value) === INTERVIEW_MODE_SLOT;
}

export function resolveInterviewMode(
  driveInterviewMode: unknown,
  orgInterviewMode: unknown
): InterviewMode {
  const driveRaw = String(driveInterviewMode || "").trim();
  if (driveRaw) {
    return normalizeInterviewMode(driveRaw);
  }
  return normalizeInterviewMode(orgInterviewMode);
}
