import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Authorizes access to the /api/test/* sandbox routes. Passes if either:
 *  - the caller has a SUPER_ADMIN session, or
 *  - the caller supplied the current DB-stored test access key.
 * There is no hardcoded fallback key — if none is configured, key auth is disabled
 * and only a SUPER_ADMIN session can pass.
 */
export async function isTestAccessAuthorized(providedKey: string | null | undefined): Promise<boolean> {
    const session = await getSession();
    if (session?.role === "SUPER_ADMIN") return true;

    if (!providedKey) return false;
    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" }, select: { testAccessKey: true } });
    return !!settings?.testAccessKey && providedKey === settings.testAccessKey;
}
