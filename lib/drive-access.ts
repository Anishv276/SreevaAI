import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole, isSuperAdminRole, type SessionUser } from "@/lib/auth";
export type DriveAccessResult =
    | { ok: true; session: SessionUser; orgId: string }
    | { ok: false; status: number; error: string };
/**
 * Authorize an admin/super-admin caller against a specific drive and enforce
 * tenant isolation: a regular admin may only act on drives in their own org;
 * a SUPER_ADMIN may act on any drive. Returns the resolved drive orgId on success.
 *
 * Use this for every resume-screening / drive sub-route that takes a driveId from
 * the URL so cross-tenant access can't slip through a missing check.
 */
export async function authorizeDriveAccess(driveId: string): Promise<DriveAccessResult> {
    const session = await getSession();
    if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
        return { ok: false, status: 401, error: "Not authorized" };
    }
    const drive = await prisma.drive.findUnique({
        where: { id: driveId },
        select: { id: true, orgId: true },
    });
    if (!drive || !drive.orgId) {
        return { ok: false, status: 404, error: "Drive not found" };
    }
    if (!isSuperAdminRole(session.role) && drive.orgId !== session.orgId) {
        return { ok: false, status: 403, error: "Drive belongs to a different organization" };
    }
    return { ok: true, session, orgId: drive.orgId };
}
