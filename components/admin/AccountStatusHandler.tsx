"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getSupportComposeUrl, isOrgRestrictedStatus } from "@/lib/interview-quota";

interface AccountStatusHandlerProps {
    status?: string;
}

export function AccountStatusHandler({ status }: AccountStatusHandlerProps) {
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const [liveStatus, setLiveStatus] = useState<string>(String(status || "").trim().toUpperCase());

    useEffect(() => {
        let cancelled = false;

        const loadStatus = async () => {
            try {
                const url = orgId ? `/api/admin/organization?orgId=${encodeURIComponent(orgId)}` : "/api/admin/organization";
                const res = await fetch(url, { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && data?.status) {
                    setLiveStatus(String(data.status).trim().toUpperCase());
                }
            } catch {
                // Keep the server-rendered status if the fetch fails.
            }
        };

        loadStatus();

        return () => {
            cancelled = true;
        };
    }, [status, orgId]);

    const normalizedStatus = String(liveStatus || status || "").trim().toUpperCase();
    const isRestricted = isOrgRestrictedStatus(normalizedStatus);

    if (!isRestricted || normalizedStatus === "SUSPENDED") return null;

    if (isRestricted) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/80 backdrop-blur-md p-4">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#1A1A1A] text-white shadow-[0_40px_100px_rgba(0,0,0,0.5)]"
                >
                    <div className="p-10 text-center">
                        <div className={`mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl ${normalizedStatus === "CLOSED" ? "bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20" : "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20"}`}>
                            {normalizedStatus === "CLOSED" ? <Lock className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}
                        </div>
                        <h2 className="mb-4 text-3xl font-black tracking-tight">
                            {normalizedStatus === "CLOSED" ? "Account Restricted" : "Action Restricted"}
                        </h2>
                        <p className="mb-10 text-gray-400 font-medium leading-relaxed">
                            {normalizedStatus === "CLOSED"
                                ? "Your account has been closed. Please contact the system administrator to resolve this and restore access."
                                : "Your account got suspended because no interviews are left. Please recharge immediately and contact support@sreevaai.com."}
                        </p>
                        
                        <div className="space-y-4">
                            {normalizedStatus === "SUSPENDED" ? (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Link
                                        href="/admin/billing"
                                        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-sm font-black text-black transition-all hover:bg-gray-100 active:scale-95 shadow-lg"
                                    >
                                        <ArrowRight className="h-4 w-4" />
                                        Recharge Now
                                    </Link>
                                    <a
                                        href={getSupportComposeUrl({
                                            subject: "Urgent: interview quota exhausted",
                                            body: "Hi support team,\n\nOur account got suspended because no interviews are left. Please help us recharge immediately.\n",
                                        })}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-sm font-black text-white transition-all hover:bg-white/10 active:scale-95 shadow-lg"
                                    >
                                        <Phone className="h-4 w-4" />
                                        Contact Support
                                    </a>
                                </div>
                            ) : (
                                <a
                                    href={getSupportComposeUrl({
                                        subject: "Account support request",
                                        body: "Hi support team,\n\nMy account is currently closed. Please help me review this.\n",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-sm font-black text-black transition-all hover:bg-gray-100 active:scale-95 shadow-lg"
                                >
                                    <Phone className="h-4 w-4" />
                                    Contact Support
                                </a>
                            )}
                            <Link
                                href={normalizedStatus === "SUSPENDED" ? "/admin/billing" : "/admin"}
                                className="inline-block text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 hover:text-white transition-colors"
                            >
                                {normalizedStatus === "SUSPENDED" ? "Open Billing" : "Back to Dashboard"}
                            </Link>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border-t border-white/5 py-5 text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-600">Enterprise Security</div>
                    </div>
                </motion.div>
            </div>
        );
    }

    return null;
}

