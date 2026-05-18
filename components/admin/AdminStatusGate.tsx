"use client";

import React, { useEffect, useRef } from "react";
import { AccountStatusHandler } from "@/components/admin/AccountStatusHandler";
import { useAdminOrg } from "@/context/admin-org-context";

type AdminStatusGateProps = {
    initialStatus?: string;
    children: React.ReactNode;
};

export function AdminStatusGate({ initialStatus, children }: AdminStatusGateProps) {
    // ⚡ Read from shared context — no fetch needed (was 1 API call per page load)
    const adminOrg = useAdminOrg();
    const liveStatus = adminOrg?.status || String(initialStatus || "").trim().toUpperCase();
    const didRefreshRef = useRef(false);

    useEffect(() => {
        if (didRefreshRef.current) return;
        didRefreshRef.current = true;
        adminOrg?.refresh?.();
    }, [adminOrg?.refresh]);

    return (
        <>
            {children}
            <AccountStatusHandler status={liveStatus} />
        </>
    );
}
