"use client";
import React from "react";
import { AccountStatusHandler } from "@/components/admin/AccountStatusHandler";
import { useAdminOrg } from "@/context/admin-org-context";
type AdminStatusGateProps = {
    initialStatus?: string;
    children: React.ReactNode;
};
export function AdminStatusGate({ initialStatus, children }: AdminStatusGateProps) {
    // ⚡ Read from shared context -- no fetch needed (was 1 API call per page load)
    const adminOrg = useAdminOrg();
    const liveStatus = adminOrg?.status || String(initialStatus || "").trim().toUpperCase();
    return (
        <>
            {children}
            <AccountStatusHandler status={liveStatus} />
        </>
    );
}
