import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdminRole, type SessionUser } from "@/lib/auth";
export type JobAccessResult =
    | { ok: true; session: SessionUser; orgId: string }
    | { ok: false; status: number; error: string };
/**
 * Authorize an admin/super-admin caller against a specific job and enforce
 * tenant isolation: a regular admin may only act on jobs in their own org;
 * a SUPER_ADMIN may act on any job. Returns the resolved job orgId on success.
 *
 * Use this for every resume-screening / job sub-route that takes a jobId from
 * the URL so cross-tenant access can't slip through a missing check.
 */
export async function authorizeJobAccess(jobId: string): Promise<JobAccessResult> {
    const session = await getSession();
    if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
        return { ok: false, status: 401, error: "Not authorized" };
    }
    const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true, orgId: true },
    });
    if (!job || !job.orgId) {
        return { ok: false, status: 404, error: "Job not found" };
    }
    if (!isSuperAdminRole(session.role) && job.orgId !== session.orgId) {
        return { ok: false, status: 403, error: "Job belongs to a different organization" };
    }
    return { ok: true, session, orgId: job.orgId };
}
