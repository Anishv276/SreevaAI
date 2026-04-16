"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    LayoutDashboard, PlusCircle, Users, Settings,
    FileText, PieChart, Sparkles, ChevronDown,
    LogOut, User, SlidersHorizontal,
    X, ShieldAlert, Loader2, ArrowLeft, Building2,
    Briefcase, Globe, Database, HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { motion, AnimatePresence } from "framer-motion";

const NAV_GROUPS = [
    {
        title: "Overview",
        items: [
            { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
            { icon: PieChart, label: "Analytics", href: "/admin/analytics" },
        ]
    },
    {
        title: "Recruitment",
        items: [
            { icon: Briefcase, label: "All Drives", href: "/admin/drives" },
            { icon: PlusCircle, label: "Create Drive", href: "/admin/create-drive" },
            { icon: Users, label: "Candidates", href: "/admin/candidates" },
        ]
    },
    {
        title: "Management",
        items: [
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
    const [orgInfo, setOrgInfo] = useState<{ name: string; logoUrl: string | null } | null>(null);
    const isSuperAdmin = user?.role === "SUPER_ADMIN";

    useEffect(() => {
        const fetchOrg = async () => {
            try {
                if (isSuperAdmin && orgId) {
                    const res = await fetch(`/api/super-admin/orgs/${orgId}`);
                    if (res.ok) {
                        const data = await res.json();
                        setOrgInfo({ name: data.name, logoUrl: data.logoUrl });
                        return;
                    }
                }
                const res = await fetch("/api/admin/organization");
                if (res.ok) {
                    const data = await res.json();
                    setOrgInfo({ name: data.name, logoUrl: data.logoUrl });
                }
            } catch (err) {
                console.error("Failed to sync branding:", err);
            }
        };
        if (user) fetchOrg();
    }, [user, orgId, isSuperAdmin]);

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
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 pb-20 md:pb-6">
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
                            className="relative w-full max-w-md bg-white border border-gray-100 rounded-[2rem] shadow-[0_32px_80px_rgba(0,0,0,0.15)] overflow-hidden"
                        >
                            <div className="p-8 text-center space-y-6">
                                <div className="flex justify-center">
                                    <div className="h-20 w-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center animate-pulse">
                                        <ShieldAlert className="h-10 w-10" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Sign Out?</h2>
                                    <p className="text-sm font-medium text-gray-500 leading-relaxed">
                                        You are about to end your session. Any unsaved changes in current drive configurations might be lost.
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
                className="hidden md:flex h-screen w-[240px] flex-col fixed left-0 top-0 z-50 bg-[#F9FAFB]/80 backdrop-blur-xl border-r border-gray-200/50"
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
                                <Sparkles className="h-5 w-5 text-white" />
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[15px] font-black text-gray-900 leading-none tracking-tight truncate uppercase italic">
                                {orgInfo?.name || "Hirer.AI"}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em]">
                                    {isSuperAdmin ? "Control Center" : "Recruiter Hub"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Nav Menu */}
                <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-8 select-none custom-scrollbar">
                    {/* Inspection Banner */}
                    {isSuperAdmin && orgId && (
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="mx-2 p-4 rounded-3xl bg-gray-900 shadow-2xl border border-gray-800 relative overflow-hidden group/inspect"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl -mr-12 -mt-12 group-hover/inspect:scale-150 transition-transform duration-700" />
                            <div className="relative z-10 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-5 rounded-lg bg-orange-500 flex items-center justify-center">
                                        <Building2 className="h-3 w-3 text-white" />
                                    </div>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Inspecting</span>
                                </div>
                                <button 
                                    onClick={() => router.push("/super-admin/orgs")}
                                    className="w-full h-9 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/10"
                                >
                                    <ArrowLeft className="h-3 w-3" /> Exit
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {NAV_GROUPS.map((group) => (
                        <div key={group.title} className="space-y-2">
                            <h3 className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.25em] mb-4">
                                {group.title}
                            </h3>
                            <div className="space-y-1.5">
                                {group.items.map((item) => {
                                    const isActive = pathname === item.href;
                                    const hrefWithOrg = orgId ? `${item.href}?orgId=${orgId}` : item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={hrefWithOrg}
                                            className={cn(
                                                "group relative flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13.5px] font-bold transition-all duration-300",
                                                isActive
                                                    ? "text-gray-900 bg-white shadow-[0_8px_20px_rgba(0,0,0,0.06)] scale-[1.02]"
                                                    : "text-gray-400 hover:text-gray-600 hover:bg-white/50"
                                            )}
                                        >
                                            {isActive && (
                                                <motion.div 
                                                    layoutId="active-pill"
                                                    className="absolute inset-0 bg-white rounded-2xl shadow-[0_8px_20px_rgba(0,0,0,0.06)] z-[-1]"
                                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                />
                                            )}
                                            
                                            <item.icon
                                                className={cn(
                                                    "h-4 w-4 transition-all duration-300",
                                                    isActive ? "text-[#F97316] scale-110" : "text-gray-300 group-hover:text-gray-500 scale-100 group-hover:scale-110"
                                                )}
                                            />
                                            <span className="tracking-tight">{item.label}</span>
                                            
                                            {isActive && (
                                                <div className="absolute right-4 w-1.5 h-1.5 rounded-full bg-[#F97316] shadow-[0_0_12px_#F97316]" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* AI & Footer Section */}
                <div className="px-4 pb-6 pt-4 space-y-4">
                    {/* Engine Status */}
                    <div className="mx-2 p-3.5 rounded-[1.5rem] bg-white/40 border border-white/60 shadow-sm flex items-center justify-between group cursor-default">
                        <div className="flex items-center gap-2.5">
                            <div className="relative h-2 w-2">
                                <span className="absolute inset-0 rounded-full bg-orange-500 animate-ping opacity-25" />
                                <span className="relative block h-2 w-2 rounded-full bg-[#F97316]" />
                            </div>
                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none group-hover:text-gray-900 transition-colors">AI Sync Live</span>
                        </div>
                        <Sparkles className="h-3 w-3 text-orange-300 group-hover:rotate-12 transition-transform" />
                    </div>

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
                                <div className={cn(
                                    "h-10 w-10 rounded-2xl flex items-center justify-center font-black text-xs uppercase transition-all duration-500",
                                    menuOpen ? "bg-orange-600 text-white rotate-6" : "bg-gray-100 text-gray-900 group-hover:bg-[#F97316] group-hover:text-white"
                                )}>
                                    {user?.name?.[0] || user?.email?.[0] || "A"}
                                </div>
                                <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <p className={cn(
                                    "text-[13px] font-bold truncate tracking-tight",
                                    "text-gray-900"
                                )}>
                                    {user?.name || "Recruiter"}
                                </p>
                                <p className={cn(
                                    "text-[9px] font-bold truncate opacity-50",
                                    menuOpen ? "text-orange-200" : "text-gray-400"
                                )}>
                                    {user?.email}
                                </p>
                            </div>
                            <ChevronDown className={cn(
                                "h-4 w-4 transition-transform duration-500",
                                menuOpen ? "rotate-180 text-white" : "text-gray-400",
                                "group-hover:scale-110"
                            )} />
                        </button>

                        <AnimatePresence>
                            {menuOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute bottom-[calc(100%+12px)] left-0 right-0 bg-white border border-gray-200 rounded-2xl overflow-hidden z-50 shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-1.5"
                                >
                                    <button 
                                        onClick={() => { router.push("/admin/settings"); setMenuOpen(false); }}
                                        className="flex items-center gap-3 w-full px-4 py-3 text-[11px] font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all group/item"
                                    >
                                        <User className="h-4 w-4 text-gray-400 group-hover/item:text-[#F97316] transition-colors" />
                                        Profile Settings
                                    </button>
                                    <div className="h-px bg-gray-100 my-1 mx-3" />
                                    <button 
                                        onClick={() => { setShowLogoutConfirm(true); setMenuOpen(false); }}
                                        className="flex items-center gap-3 w-full px-4 py-3 text-[11px] font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all"
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
