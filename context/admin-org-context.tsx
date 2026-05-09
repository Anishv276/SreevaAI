"use client";

import React, { createContext, useContext } from "react";

type AdminOrgContextValue = {
    status: string;
    orgId?: string | null;
};

const AdminOrgContext = createContext<AdminOrgContextValue | null>(null);

export function AdminOrgProvider({
    status,
    orgId,
    children,
}: {
    status: string;
    orgId?: string | null;
    children: React.ReactNode;
}) {
    return (
        <AdminOrgContext.Provider
            value={{
                status: String(status || "ACTIVE").toUpperCase(),
                orgId: orgId || null,
            }}
        >
            {children}
        </AdminOrgContext.Provider>
    );
}

export function useAdminOrg() {
    return useContext(AdminOrgContext);
}
