"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    LayoutDashboard, PlusCircle, Users, Settings,
    FileText, PieChart, Sparkles, ChevronDown,
    LogOut, User, SlidersHorizontal,
    X, ShieldAlert, Loader2, ArrowLeft, Building2,
    Briefcase, Globe, Database, HelpCircle, CreditCard, Mail, Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { motion } from "framer-motion";
import { isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";

interface NavItem {
    icon: any;
    label: string;
    href: string;
}

const NAV_GROUPS: { items: NavItem[] }[] = [
    {
        items: [
            { icon: LayoutDashboard, label: "Overview", href: "/admin" },
            { icon: Briefcase, label: "Active Jobs", href: "/admin/jobs" },
            { icon: Users, label: "Candidates", href: "/admin/candidates" },
            { icon: Calendar, label: "Calendar", href: "/admin/schedule" },
        ]
    },
    {
        items: [
            { icon: CreditCard, label: "Subscription & Billing", href: "/admin/billing" },
            { icon: Settings, label: "Settings", href: "/admin/settings" },
        ]
    }
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const { logout, user } = useAuth();
    const isSuperAdmin = user?.role === "SUPER_ADMIN";

    const adminOrg = useAdminOrg();
    const orgInfo = adminOrg?.name
        ? { name: adminOrg.name || "Sreeva AI" }
        : null;
    const orgStatus = adminOrg?.status || "ACTIVE";
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const modalRef = useRef<HTMLDivElement>(null);
    const isSuspended = isOrgRestrictedStatus(orgStatus);

    useEffect(() => {
        if (!showLogoutConfirm) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            const focusableElements = modalRef.current?.querySelectorAll("button:not([disabled])");
            if (!focusableElements || focusableElements.length === 0) return;
            const firstElement = focusableElements[0] as HTMLElement;
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
            if (e.shiftKey) {
                if (document.activeElement === firstElement) { lastElement.focus(); e.preventDefault(); }
            } else {
                if (document.activeElement === lastElement) { firstElement.focus(); e.preventDefault(); }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        setTimeout(() => { modalRef.current?.querySelector("button")?.focus(); }, 50);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showLogoutConfirm]);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try { await logout(); }
        catch { setIsLoggingOut(false); setShowLogoutConfirm(false); }
    };

    return (
        <>
            {/* LOGOUT CONFIRMATION MODAL */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
                    <div
                        className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm"
                        onClick={() => !isLoggingOut && setShowLogoutConfirm(false)}
                    />
                    <div
                        ref={modalRef}
                        className="relative w-full max-w-sm bg-white rounded-2xl overflow-hidden"
                        style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}
                    >
                        <div className="p-8 text-center space-y-5">
                            <div className="flex justify-center">
                                <div className="h-14 w-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                                    <ShieldAlert className="h-7 w-7" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Sign Out?</h2>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    You are about to end your session. Any unsaved changes might be lost.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    disabled={isLoggingOut}
                                    className="h-11 bg-gray-50 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-all border border-gray-100"
                                >
                                    Stay Active
                                </button>
                                <button
                                    onClick={handleLogout}
                                    disabled={isLoggingOut}
                                    className="h-11 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                                    style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                                >
                                    {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign Out"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <aside
                id="global-admin-sidebar"
                className="hidden md:flex h-screen w-[240px] flex-col fixed left-0 top-0 z-50"
                style={{
                    background: "#FFFFFF",
                    borderRight: "1px solid #E9E7FF",
                    boxShadow: "2px 0 12px rgba(124, 58, 237, 0.04)",
                }}
            >
                {/* Logo */}
                <div className="px-5 h-16 flex items-center" style={{ borderBottom: "1px solid #F0EEF8" }}>
                    <div className="flex items-center gap-3 w-full cursor-pointer group" onClick={() => router.push("/admin")}>
                        <img src="/sreevaai-logo.png" alt="Sreeva AI" className="h-8 w-8 object-contain rounded-md flex-shrink-0 transition-transform group-hover:scale-105 duration-200 shadow-sm" />
                        <span className="text-[17px] font-bold text-gray-900 tracking-tight leading-none">
                            Sreeva <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}>AI</span>
                        </span>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto px-3 pt-6 pb-4 space-y-6 select-none custom-scrollbar">
                    {/* Super-admin inspection banner */}
                    {isSuperAdmin && orgId && (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="mx-1 p-4 rounded-2xl relative overflow-hidden"
                            style={{ background: "linear-gradient(135deg, #7C3AED, #3B82F6)", boxShadow: "0 4px 16px rgba(124,58,237,0.25)" }}
                        >
                            <div className="relative z-10 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Building2 className="h-3.5 w-3.5 text-white/80" />
                                    <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Inspecting</span>
                                </div>
                                <button
                                    onClick={() => router.push("/super-admin/orgs")}
                                    className="w-full h-8 bg-white/15 hover:bg-white/25 text-white rounded-xl text-[11px] font-semibold transition-all flex items-center justify-center gap-2 border border-white/20"
                                >
                                    <ArrowLeft className="h-3 w-3" /> Exit Inspection
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {NAV_GROUPS.map((group, gIdx) => (
                        <div key={gIdx} className="space-y-0.5">
                            {group.items.map((item) => {
                                const isActive = pathname === item.href;
                                const hrefWithOrg = orgId ? `${item.href}?orgId=${orgId}` : item.href;
                                return (
                                    <div
                                        key={item.label}
                                        onClick={() => router.push(hrefWithOrg)}
                                        className={cn(
                                            "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                                            isActive
                                                ? "text-violet-700"
                                                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                                        )}
                                        style={isActive ? {
                                            background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))",
                                            border: "1px solid rgba(139,92,246,0.15)",
                                        } : undefined}
                                    >
                                        <item.icon
                                            strokeWidth={isActive ? 2 : 1.75}
                                            className={cn(
                                                "h-4 w-4 flex-shrink-0 transition-colors duration-150",
                                                isActive ? "text-violet-600" : "text-gray-400 group-hover:text-gray-600"
                                            )}
                                        />
                                        <span className="font-medium">{item.label}</span>
                                        {isActive && (
                                            <div
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-1.5 h-5 rounded-full"
                                                style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                            {gIdx < NAV_GROUPS.length - 1 && (
                                <div className="h-px mx-2 my-3" style={{ background: "#F0EEF8" }} />
                            )}
                        </div>
                    ))}
                </nav>

                {/* Footer */}
                <div className="px-3 pb-5 pt-3" style={{ borderTop: "1px solid #F0EEF8" }}>
                    <button
                        onClick={() => setShowLogoutConfirm(true)}
                        className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-gray-500 hover:text-red-600 hover:bg-red-50"
                    >
                        <LogOut strokeWidth={1.75} className="h-4 w-4 text-gray-400 group-hover:text-red-500 transition-colors duration-150" />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
