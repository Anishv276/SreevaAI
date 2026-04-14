"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Globe, Loader2, Zap } from "lucide-react";
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
        isDomainVerified: true,
        isLoading: true
    });

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch("/api/admin/organization");
                if (res.ok) {
                    const data = await res.json();
                    setDomainStatus({
                        isDomainVerified: data.isDomainVerified ?? true,
                        customDomain: data.customDomain,
                        isLoading: false
                    });
                }
            } catch (err) {
                console.error("Banner status check failed:", err);
                setDomainStatus(prev => ({ ...prev, isLoading: false }));
            }
        };

        checkStatus();
    }, [pathname]); // Refresh on navigation to catch updates from settings

    if (domainStatus.isLoading || domainStatus.isDomainVerified) return null;

    // Don't show on settings page itself to avoid redundancy
    if (pathname === "/admin/settings") return null;

    return (
        <div className="relative z-50">
            <div className="bg-orange-50 border-b border-orange-100 px-4 py-2.5 shadow-sm overflow-hidden relative group">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-orange-100/50 to-transparent pointer-events-none" />
                <div className="absolute -top-12 -right-12 w-24 h-24 bg-white/40 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000" />
                
                <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-white border border-orange-200 flex items-center justify-center text-[#F97316] shadow-sm shrink-0">
                            <Globe className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col">
                            <p className="text-[11px] font-black uppercase tracking-widest text-[#9A3412]">
                                {domainStatus.customDomain ? `Domain Verification Pending` : "Custom Domain Required"}
                            </p>
                            <p className="text-[10px] font-medium text-orange-700/80">
                                {domainStatus.customDomain 
                                    ? `Candidate emails are currently blocked for ${domainStatus.customDomain}.` 
                                    : "Set up your custom domain to enable automated candidate invitations."}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Link 
                            href="/admin/settings"
                            className="flex-1 md:flex-none h-8 px-5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-200 active:scale-95"
                        >
                            <Zap className="h-3 w-3" />
                            Complete Setup
                            <ChevronRight className="h-3 w-3" />
                        </Link>
                    </div>
                </div>
            </div>
            
            {/* Animated Warning Stripe for high visibility */}
            <div className="h-0.5 w-full bg-gradient-to-r from-orange-400 via-white to-orange-400 opacity-30" />
        </div>
    );
}
