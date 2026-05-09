"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AccountStatusHandler } from "@/components/admin/AccountStatusHandler";
import { isOrgRestrictedStatus } from "@/lib/interview-quota";

type AdminStatusGateProps = {
    initialStatus?: string;
    children: React.ReactNode;
};

export function AdminStatusGate({ initialStatus, children }: AdminStatusGateProps) {
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const [liveStatus, setLiveStatus] = useState<string>(String(initialStatus || "").trim().toUpperCase());
    const [statusLoaded, setStatusLoaded] = useState(!orgId);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const url = orgId ? `/api/admin/organization?orgId=${encodeURIComponent(orgId)}` : "/api/admin/organization";
                const res = await fetch(url, { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                if (data?.status) {
                    setLiveStatus(String(data.status).trim().toUpperCase());
                }
            } catch {
                // Keep the server-rendered status if the fetch fails.
            } finally {
                if (!cancelled) {
                    setStatusLoaded(true);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [orgId]);

    if (orgId && !statusLoaded) {
        return (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4 px-6 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
                    <div className="space-y-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-400">
                            Loading organization state
                        </p>
                        <p className="text-sm text-gray-500">
                            Please wait while we load the selected account.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {children}
            <AccountStatusHandler status={liveStatus} />
            {orgId && isOrgRestrictedStatus(liveStatus) && (
                <div className="fixed inset-0 z-[99998] bg-black/10 backdrop-blur-[2px]" />
            )}
        </>
    );
}
