import { prisma } from "@/lib/prisma";

/**
 * Authorizes access to the /api/test/* sandbox routes. Passes only if the
 * caller supplied the current DB-stored test access key -- no session bypass.
 * There is no hardcoded fallback key — if none is configured, all key auth
 * fails until one is set via /super-admin/settings.
 */
export async function isTestAccessAuthorized(providedKey: string | null | undefined): Promise<boolean> {
    if (!providedKey) return false;
    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" }, select: { testAccessKey: true } });
    return !!settings?.testAccessKey && providedKey === settings.testAccessKey;
}
