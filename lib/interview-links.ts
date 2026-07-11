export function buildInterviewLink(
    baseUrl: string,
    applicationId: string,
    opts?: { token?: string | null },
): string {
    const url = new URL(`/interview/${encodeURIComponent(applicationId)}`, baseUrl);
    const token = String(opts?.token || "").trim();
    if (token) {
        url.searchParams.set("token", token);
    }
    return url.toString();
}
