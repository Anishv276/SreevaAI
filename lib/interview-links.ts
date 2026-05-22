export function buildInterviewScheduleLink(
    baseUrl: string,
    applicationId: string,
    orgName?: string | null,
): string {
    const url = new URL(`/interview/${encodeURIComponent(applicationId)}/schedule`, baseUrl);
    const trimmedOrgName = String(orgName || "").trim();
    if (trimmedOrgName) {
        url.searchParams.set("orgName", trimmedOrgName);
    }
    return url.toString();
}

export function buildInterviewLink(
    baseUrl: string,
    applicationId: string,
    opts?: { token?: string | null; orgName?: string | null },
): string {
    const url = new URL(`/interview/${encodeURIComponent(applicationId)}`, baseUrl);
    const token = String(opts?.token || "").trim();
    const orgName = String(opts?.orgName || "").trim();
    if (token) {
        url.searchParams.set("token", token);
    }
    if (orgName) {
        url.searchParams.set("orgName", orgName);
    }
    return url.toString();
}
