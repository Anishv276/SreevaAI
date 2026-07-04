export function isInterviewTokenRequired() {
    // Fail-closed: the interview access token is REQUIRED in every environment.
    // It can only be disabled by an explicit, deliberate opt-out
    // (INTERVIEW_TOKEN_REQUIRED="false"), which should never be set outside a
    // throwaway local dev box. Previously this returned false whenever
    // NODE_ENV !== "production", which silently disabled auth on the proctoring,
    // egress, finalize and snapshot-upload endpoints in any non-prod deploy.
    return process.env.INTERVIEW_TOKEN_REQUIRED !== "false";
}
export function isSchedulingGateBypassed() {
    // ponytail: test-mode escape hatch for local QA -- set APP_MODE=test in .env
    // to skip slot booking entirely and jump straight to the interview link.
    return process.env.APP_MODE === "test";
}
export function isInterviewReopenAllowed() {
    // Temporary QA bypass:
    // - In non-production, allow reopening previously finalized interviews by default.
    // - In production, keep finalized sessions locked unless explicitly overridden.
    if (process.env.INTERVIEW_ALLOW_REOPEN === "true") return true;
    if (process.env.INTERVIEW_ALLOW_REOPEN === "false") return false;
    return process.env.NODE_ENV !== "production";
}
