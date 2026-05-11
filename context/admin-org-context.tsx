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
// This is the SINGLE source of truth for org + credits data across all admin pages.
// All components (Sidebar, LowCreditsBanner, AdminStatusGate, pages) must READ from
// this context instead of making independent fetch() calls to /api/admin/organization
// or /api/admin/credits. This reduces 4-8 API calls per page to exactly 1.

export function AdminOrgProvider({
    status: initialStatus,
    orgId,
    children,
}: {
    status: string;
    orgId?: string | null;
    children: React.ReactNode;
}) {
    const [orgData, setOrgData] = useState<OrgData>({
        status: String(initialStatus || "ACTIVE").toUpperCase(),
        orgId: orgId || null,
    });

    const fetchedRef = useRef(false);
    const orgIdRef = useRef(orgId);

    const fetchOrgAndCredits = async (signal?: AbortSignal) => {
        try {
            const orgUrl = orgIdRef.current
                ? `/api/admin/organization?orgId=${encodeURIComponent(orgIdRef.current)}`
                : "/api/admin/organization";
            const creditsUrl = orgIdRef.current
                ? `/api/admin/credits?orgId=${encodeURIComponent(orgIdRef.current)}`
                : "/api/admin/credits";

            // ⚡ Fetch org AND credits in PARALLEL — one round instead of 4-8 separate fetches
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
            // Ignore AbortError and network errors — server-side values are the fallback
        }
    };

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const controller = new AbortController();
        void fetchOrgAndCredits(controller.signal);

        return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refresh = () => {
        fetchedRef.current = false;
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
