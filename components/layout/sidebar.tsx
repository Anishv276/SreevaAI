"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    LayoutDashboard, PlusCircle, Users, Settings,
    FileText, PieChart, Sparkles, ChevronDown,
    LogOut, User, SlidersHorizontal,
    X, ShieldAlert, Loader2, ArrowLeft, Building2,
    Briefcase, Globe, Database, HelpCircle, CreditCard, Mail
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/auth-context";
import { motion, AnimatePresence } from "framer-motion";
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
            { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
            { icon: Briefcase, label: "Active Jobs", href: "/admin/drives" },
            { icon: PlusCircle, label: "Create Job", href: "/admin/create-drive" },
            { icon: Users, label: "Candidates", href: "/admin/candidates" },
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
    const [menuOpen, setMenuOpen] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const { logout, user } = useAuth();
    const isSuperAdmin = user?.role === "SUPER_ADMIN";

    // ⚡ Read from shared context — no fetch needed (was 2 API calls per page load)
    const adminOrg = useAdminOrg();
    const orgInfo = (adminOrg?.name || adminOrg?.logoUrl)
        ? { name: adminOrg.name || "Sreeva AI", logoUrl: adminOrg.logoUrl || null }
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
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        // Focus the first button on mount
        setTimeout(() => {
            const firstButton = modalRef.current?.querySelector("button");
            firstButton?.focus();
        }, 50);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showLogoutConfirm]);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            await logout();
        } catch {
            setIsLoggingOut(false);
            setShowLogoutConfirm(false);
        }
    };

    return (
        <>
            {/* LOGOUT CONFIRMATION MODAL */}
            <AnimatePresence>
                {showLogoutConfirm && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 pb-20 md:pb-6 font-inter">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
                            onClick={() => !isLoggingOut && setShowLogoutConfirm(false)}
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            ref={modalRef}
                            className="relative w-full max-w-md bg-white border border-gray-100 rounded-[2rem] shadow-[0_32px_80px_rgba(0,0,0,0.15)] overflow-hidden"
                        >
                            <div className="p-8 text-center space-y-6">
                                <div className="flex justify-center">
                                    <div className="h-20 w-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center animate-pulse">
                                        <ShieldAlert className="h-10 w-10" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Sign Out?</h2>
                                    <p className="text-sm font-medium text-gray-500 leading-relaxed">
                                        You are about to end your session. Any unsaved changes in current job configurations might be lost.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        onClick={() => setShowLogoutConfirm(false)}
                                        disabled={isLoggingOut}
                                        className="h-12 bg-gray-50 text-gray-600 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all active:scale-[0.98] border border-gray-100"
                                    >
                                        Stay Active
                                    </button>
                                    <button
                                        onClick={handleLogout}
                                        disabled={isLoggingOut}
                                        className="h-12 bg-gray-900 text-white rounded-2xl font-bold text-sm shadow-xl shadow-gray-200 hover:bg-red-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign Out"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <aside
                id="global-admin-sidebar"
                className="hidden md:flex h-screen w-[240px] flex-col fixed left-0 top-0 z-50 bg-[#F9FAFB]/80 backdrop-blur-xl border-r border-gray-200/50 font-inter"
            >
                {/* Logo Section */}
                <div className="px-6 h-24 flex items-center">
                    <div className="flex items-center gap-3 group cursor-pointer" onClick={() => router.push("/admin")}>
                        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center flex-shrink-0 shadow-[0_8px_20px_rgba(249,115,22,0.3)] ring-4 ring-orange-50 transition-transform group-hover:scale-110 duration-300 overflow-hidden">
                            {orgInfo?.logoUrl ? (
                                <img 
                                    src={orgInfo.logoUrl} 
                                    alt={orgInfo.name} 
                                    className="h-full w-full object-contain p-2 bg-white" 
                                />
                            ) : (
                                <img src="/Logo.png" alt="Sreeva AI" className="h-full w-full object-contain p-2 bg-white" />
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[20px] font-black text-gray-900 leading-none tracking-tight truncate">
                                {orgInfo?.name || "Sreeva AI"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Nav Menu */}
                <nav className="flex-1 overflow-y-auto px-4 pt-10 pb-4 space-y-6 select-none custom-scrollbar">
                    {/* Inspection Banner */}
                    {isSuperAdmin && orgId && (
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="mx-2 p-4 rounded-3xl bg-gray-900 shadow-xl border border-gray-800 relative overflow-hidden group/inspect"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl -mr-12 -mt-12 group-hover/inspect:scale-150 transition-transform duration-700" />
                            <div className="relative z-10 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-5 rounded-lg bg-orange-500 flex items-center justify-center">
                                        <Building2 className="h-3 w-3 text-white" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Inspecting</span>
                                </div>
                                <button 
                                    onClick={() => router.push("/super-admin/orgs")}
                                    className="w-full h-8 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/10"
                                >
                                    <ArrowLeft className="h-3 w-3" /> Exit
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {NAV_GROUPS.map((group, gIdx) => (
                        <div key={gIdx} className="space-y-1">
                            {group.items.map((item) => {
                                const isActive = pathname === item.href;
                                const hrefWithOrg = orgId ? `${item.href}?orgId=${orgId}` : item.href;
                                
                                return (
                                    <div key={item.label} className="space-y-1">
                                        <div
                                            onClick={() => router.push(hrefWithOrg)}
                                            className={cn(
                                                "group relative flex items-center justify-between px-4 py-3 rounded-xl text-[16px] font-bold transition-all duration-200 cursor-pointer",
                                                isActive
                                                    ? "text-[#F97316] bg-white shadow-sm ring-1 ring-gray-100"
                                                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <item.icon
                                                    className={cn(
                                                        "h-4 w-4 transition-all duration-200",
                                                        isActive ? "text-[#F97316]" : "text-gray-400 group-hover:text-gray-600"
                                                    )}
                                                />
                                                <span className="tracking-tight">{item.label}</span>
                                            </div>
                                            
                                            {isActive && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {gIdx < NAV_GROUPS.length - 1 && <div className="h-px bg-gray-100/60 mx-4 my-2" />}
                        </div>
                    ))}

                </nav>

                {/* Footer Section */}
                <div className="px-4 pb-6 pt-4 border-t border-gray-100/50">
                    {/* User Profile */}
                    <div className="relative">
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className={cn(
                                "w-full flex items-center gap-3 p-2 rounded-2xl transition-all duration-300 group border",
                                menuOpen 
                                    ? "bg-gray-50 border-gray-200 shadow-md" 
                                    : "bg-white border-transparent hover:border-gray-200 hover:shadow-lg"
                            )}
                        >
                            <div className="relative">
                                <div 
                                    suppressHydrationWarning
                                    className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs uppercase transition-all duration-500",
                                        menuOpen ? "bg-[#F97316] text-white" : "bg-gray-100 text-gray-500 group-hover:bg-[#F97316] group-hover:text-white"
                                    )}
                                >
                                    {user?.name?.[0] || user?.email?.[0] || "A"}
                                </div>
                                <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <p className={cn("text-[17px] font-bold truncate tracking-tight text-gray-900")}>
                                    {user?.name || "Recruiter"}
                                </p>
                                <p className={cn("text-[10px] font-medium truncate text-gray-400")}>
                                    {user?.email}
                                </p>
                            </div>
                            <ChevronDown className={cn(
                                "h-4 w-4 transition-transform duration-500 text-gray-400",
                                menuOpen ? "rotate-180" : "group-hover:scale-110"
                            )} />
                        </button>

                        <AnimatePresence>
                            {menuOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute bottom-[calc(100%+12px)] left-0 right-0 bg-white border border-gray-200 rounded-2xl overflow-hidden z-50 shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-1.5 font-inter"
                                >
                                    <button 
                                        onClick={() => { router.push("/admin/settings"); setMenuOpen(false); }}
                                        className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] font-semibold text-gray-600 hover:text-gray-950 hover:bg-gray-50 rounded-xl transition-all group/item"
                                    >
                                        <User className="h-4 w-4 text-gray-400 group-hover/item:text-[#F97316] transition-colors" />
                                        Profile Settings
                                    </button>
                                    <div className="h-px bg-gray-100 my-1 mx-3" />
                                    <button 
                                        onClick={() => { setShowLogoutConfirm(true); setMenuOpen(false); }}
                                        className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                    >
                                        <LogOut className="h-4 w-4" /> Sign Out
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </aside>
        </>
    );
}
