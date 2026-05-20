export function isInterviewTokenRequired() {
    // Temporary dev-friendly bypass:
    // - In production, token checks stay on by default.
    // - In non-production, we allow interviews to proceed without a security token.
    return process.env.NODE_ENV === "production" && process.env.INTERVIEW_TOKEN_REQUIRED !== "false";
}

export function isInterviewReopenAllowed() {
    // Temporary QA bypass:
    // - In non-production, allow reopening previously finalized interviews by default.
    // - In production, keep finalized sessions locked unless explicitly overridden.
    if (process.env.INTERVIEW_ALLOW_REOPEN === "true") return true;
    if (process.env.INTERVIEW_ALLOW_REOPEN === "false") return false;
    return process.env.NODE_ENV !== "production";
}

export function isInterviewTestMode() {
    return process.env.INTERVIEW_TEST_MODE === "true";
}
