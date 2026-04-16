"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Globe, Zap, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DomainVerificationBanner() {
    const pathname = usePathname();
    const [domainStatus, setDomainStatus] = useState<{ 
        isDomainVerified: boolean; 
        customDomain?: string | null;
        isLoading: boolean;
    }>({
        isDomainVerified: false,
        isLoading: true
    });

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const checkStatus = async () => {
            try {
                const res = await fetch("/api/admin/organization", { signal });
                if (res.ok) {
                    const data = await res.json();
                    if (!signal.aborted) {
                        setDomainStatus({
                            isDomainVerified: data.isDomainVerified === true,
                            customDomain: data.customDomain,
                            isLoading: false
                        });
                    }
                }
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    console.error("Banner status check failed:", err);
                    setDomainStatus(prev => ({ ...prev, isLoading: false }));
                }
            }
        };

        checkStatus();
        return () => controller.abort();
    }, [pathname]); // Refresh on navigation to catch updates from settings

    if (domainStatus.isLoading || domainStatus.isDomainVerified) return null;

    // Don't show on settings page itself to avoid redundancy
    if (pathname === "/admin/settings") return null;

    return (
        <div className="relative z-50">
            <div className="bg-red-50/80 backdrop-blur-md border-b border-red-100 px-4 py-3 shadow-sm overflow-hidden relative group">
                {/* Visual Accent */}
                <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]" />
                
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-red-100/30 to-transparent pointer-events-none" />
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/40 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-1000" />
                
                <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 relative z-10 pl-2">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-white border border-red-100 flex items-center justify-center text-red-600 shadow-sm shrink-0 animate-pulse-subtle">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                            <h4 className="text-[11px] font-black uppercase tracking-widest text-red-900 flex items-center gap-2">
                                {domainStatus.customDomain ? "Action Required: Domain Verification" : "Action Required: Setup Required"}
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                            </h4>
                            <p className="text-[10px] font-semibold text-red-800/70 mt-0.5 leading-relaxed">
                                {domainStatus.customDomain 
                                    ? `Candidate recruitment emails are blocked until ${domainStatus.customDomain} is verified.` 
                                    : "Automated candidate invitations are disabled. Configure your custom domain to enable them."}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Link 
                            href="/admin/settings?section=domains"
                            className="flex-1 md:flex-none h-9 px-6 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-200 active:scale-95 group/btn"
                        >
                            <Zap className="h-3.5 w-3.5 fill-current" />
                            Complete Domain Setup
                            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                    </div>
                </div>
            </div>
            
            {/* Animated Bottom Glow */}
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-red-400/30 to-transparent" />
            
            <style jsx>{`
                @keyframes pulse-subtle {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.9; transform: scale(0.98); }
                }
                .animate-pulse-subtle {
                    animation: pulse-subtle 3s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
}
