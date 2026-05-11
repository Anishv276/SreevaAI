"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrgData = {
    status: string;
    orgId?: string | null;
    name?: string;
    logoUrl?: string | null;
    plan?: string;
    interviewQuotaTotal?: number;
    interviewQuotaUsed?: number;
    interviewQuotaRemaining?: number;
    creditsUsed?: number;
};

type AdminOrgContextValue = OrgData & {
    refresh: () => void;
};

// ─── Context ─────────────────────────────────────────────────────────────────

const AdminOrgContext = createContext<AdminOrgContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────
// Single source of truth for org + credits data across all admin pages.
// Accepts server-fetched `initialData` so the browser makes ZERO fetch calls
// on the initial page load. Only fetches on demand (refresh) or when orgId
// is a super-admin override that needs fresh data.

export function AdminOrgProvider({
    status: initialStatus,
    orgId,
    initialData,
    children,
}: {
    status: string;
    orgId?: string | null;
    initialData?: Partial<OrgData>;
    children: React.ReactNode;
}) {
    const [orgData, setOrgData] = useState<OrgData>({
        status: String(initialStatus || "ACTIVE").toUpperCase(),
        orgId: orgId || null,
        // ⚡ Seed with server-fetched data — no client fetch needed on first paint
        ...initialData,
    });

    // Only fetch when this flag is set (e.g. super-admin orgId override or explicit refresh)
    const needsFetchRef = useRef(!!orgId && !initialData);

    const fetchOrgAndCredits = async (signal?: AbortSignal) => {
        try {
            const orgUrl = orgId
                ? `/api/admin/organization?orgId=${encodeURIComponent(orgId)}`
                : "/api/admin/organization";
            const creditsUrl = orgId
                ? `/api/admin/credits?orgId=${encodeURIComponent(orgId)}`
                : "/api/admin/credits";

            // ⚡ Fetch org AND credits in PARALLEL — single round-trip
            const [orgRes, creditsRes] = await Promise.all([
                fetch(orgUrl, { signal }),
                fetch(creditsUrl, { signal }),
            ]);

            if (signal?.aborted) return;

            const [orgJson, creditsJson] = await Promise.all([
                orgRes.ok ? orgRes.json() : null,
                creditsRes.ok ? creditsRes.json() : null,
            ]);

            if (signal?.aborted) return;

            setOrgData((prev) => ({
                ...prev,
                ...(orgJson && {
                    status: String(orgJson.status || prev.status || "ACTIVE").toUpperCase(),
                    name: orgJson.name,
                    logoUrl: orgJson.logoUrl,
                    plan: orgJson.plan,
                }),
                ...(creditsJson && {
                    interviewQuotaTotal: Number(creditsJson.interviewQuotaTotal ?? 0),
                    interviewQuotaUsed: Number(creditsJson.interviewQuotaUsed ?? 0),
                    interviewQuotaRemaining: Number(creditsJson.interviewQuotaRemaining ?? 0),
                    creditsUsed: Number(creditsJson.creditsUsed ?? 0),
                }),
            }));
        } catch {
            // Ignore AbortError and network errors — server values are the fallback
        }
    };

    useEffect(() => {
        // Skip the fetch if we already have server-seeded data and no orgId override
        if (!needsFetchRef.current) return;
        needsFetchRef.current = false;

        const controller = new AbortController();
        void fetchOrgAndCredits(controller.signal);

        return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refresh = () => {
        const controller = new AbortController();
        void fetchOrgAndCredits(controller.signal);
    };

    return (
        <AdminOrgContext.Provider value={{ ...orgData, orgId: orgId || null, refresh }}>
            {children}
        </AdminOrgContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdminOrg() {
    return useContext(AdminOrgContext);
}
