"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    LayoutDashboard, PlusCircle, Users, Settings,
    FileText, PieChart, Sparkles, ChevronDown,
    LogOut, User, SlidersHorizontal,
    X, ShieldAlert, Loader2, ArrowLeft, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useEffect } from "react";

const sidebarItems = [
    { icon: LayoutDashboard, label: "Dashboard",    href: "/admin" },
    { icon: FileText,         label: "All Drives",   href: "/admin/drives" },
    { icon: PlusCircle,       label: "Create Drive", href: "/admin/create-drive" },
    { icon: Users,            label: "Candidates",   href: "/admin/candidates" },
    { icon: PieChart,         label: "Analytics",    href: "/admin/analytics" },
    { icon: Settings,         label: "Settings",     href: "/admin/settings" },
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
                // If super admin is inspecting a specific org, fetch that org's details
                if (isSuperAdmin && orgId) {
                    const res = await fetch(`/api/super-admin/orgs/${orgId}`);
                    if (res.ok) {
                        const data = await res.json();
                        setOrgInfo({ name: data.name, logoUrl: data.logoUrl });
                        return;
                    }
                }
                
                // For regular admins or super admins in their own dashboard, fetch default org
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
            {showLogoutConfirm && (
                <div 
                    className="fixed inset-0 z-[1000] backdrop-blur-md bg-white/50 flex items-center justify-center p-6 animate-in fade-in duration-200"
                    onClick={() => !isLoggingOut && setShowLogoutConfirm(false)}
                >
                    <div 
                        className="w-full max-w-md bg-white border border-gray-100 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.1)] overflow-hidden animate-in-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-8 text-center space-y-6 relative">
                            {!isLoggingOut && (
                                <button 
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-50 text-gray-400 hover:text-gray-900 transition-all border border-transparent hover:border-gray-100"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            
                            <div className="flex justify-center">
                                <div className="h-16 w-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                                    <ShieldAlert className="h-8 w-8" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Terminate Session?</h2>
                                <p className="text-sm font-medium text-gray-500">Are you sure you want to sign out?</p>
                            </div>
                            <div className="space-y-3 pt-2">
                                <button
                                    onClick={handleLogout}
                                    disabled={isLoggingOut}
                                    className="w-full h-11 bg-gray-900 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Sign Out"}
                                </button>
                                
                                {!isLoggingOut && (
                                    <button
                                        onClick={() => setShowLogoutConfirm(false)}
                                        className="w-full h-11 bg-gray-50 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-100 hover:text-gray-900 transition-all border border-gray-100"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <aside
                id="global-admin-sidebar"
                className="hidden md:flex h-screen w-[220px] flex-col fixed left-0 top-0 z-50 bg-white border-r border-gray-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]"
            >
                {/* Logo Section */}
                <div className="flex items-center gap-3 px-6 h-20 border-b border-gray-50 overflow-hidden">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center flex-shrink-0 shadow-[0_2px_10px_rgba(249,115,22,0.2)] group cursor-pointer hover:scale-105 transition-transform overflow-hidden">
                        {orgInfo?.logoUrl ? (
                            <img 
                                src={orgInfo.logoUrl} 
                                alt={orgInfo.name} 
                                className="h-full w-full object-contain p-1.5 bg-white" 
                            />
                        ) : (
                            <Sparkles className="h-5 w-5 text-white" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-black text-gray-900 leading-none tracking-tight truncate uppercase">
                            {orgInfo?.name || "Hirer.AI"}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1 truncate">
                            {orgInfo ? "Workspace" : "Premium Admin"}
                        </span>
                    </div>
                </div>

                {/* Nav Menu */}
                <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-2 select-none">
                    {/* Super Admin Inspection Mode Banner */}
                    {isSuperAdmin && orgId && (
                        <div className="mb-6 px-4 py-4 rounded-2xl bg-orange-600 shadow-[0_8px_20px_rgba(249,115,22,0.3)] border border-orange-500 animate-in-zoom relative overflow-hidden group/inspect">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover/inspect:scale-150 transition-transform duration-700" />
                            <div className="relative z-10 flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center">
                                        <Building2 className="h-3 w-3 text-white" />
                                    </div>
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Inspecting Mode</span>
                                </div>
                                <button 
                                    onClick={() => router.push("/super-admin/orgs")}
                                    className="w-full h-8 bg-white text-orange-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-orange-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <ArrowLeft className="h-3 w-3" /> Exit Inspection
                                </button>
                            </div>
                        </div>
                    )}

                    {sidebarItems.map((item) => {
                        const hrefWithOrg = orgId ? `${item.href}?orgId=${orgId}` : item.href;
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={hrefWithOrg}
                                className={cn(
                                    "flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13px] font-bold transition-all duration-300 relative group",
                                    isActive
                                        ? "text-[#F97316] bg-orange-50 shadow-[0_4px_12px_rgba(249,115,22,0.15)] active:scale-[0.98]"
                                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                )}
                            >
                                <item.icon
                                    className={cn(
                                        "h-4 w-4 flex-shrink-0 transition-all duration-300",
                                        isActive ? "text-[#F97316] scale-110" : "text-gray-400 group-hover:text-gray-600 group-hover:scale-110"
                                    )}
                                />
                                <span className="tracking-tight">{item.label}</span>
                                
                                {isActive && (
                                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-[#F97316] shadow-[0_0_8px_#F97316]" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* AI Active Indicator */}
                <div className="px-6 py-4 mx-4 mb-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-40 animate-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_#22C55E]" />
                        </div>
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">Engine Live</span>
                    </div>
                </div>

                {/* User Master Section - Corrected Live Data */}
                <div className="px-4 pb-6 pt-4 border-t border-gray-50 relative bg-white">
                    <button
                        onClick={() => setMenuOpen(o => !o)}
                        className="flex items-center gap-3 w-full p-2.5 rounded-2xl hover:bg-gray-50 transition-all duration-300 group border border-transparent hover:border-gray-100 hover:shadow-sm"
                    >
                        <div className="relative">
                            <div className="h-10 w-10 rounded-xl bg-gray-900 flex items-center justify-center text-white text-xs font-black shadow-md uppercase">
                                {user?.name?.[0] || user?.email?.[0] || "A"}
                            </div>
                            <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500 shadow-sm" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-black text-gray-900 leading-tight truncate uppercase tracking-tight">{user?.name || "Admin Hub"}</p>
                            <p className="text-[10px] text-gray-400 font-bold tracking-tight truncate lowercase mt-1 opacity-70">{user?.email}</p>
                        </div>
                        <div className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                            menuOpen ? "bg-orange-50 text-[#F97316]" : "bg-gray-50 text-gray-400 group-hover:bg-white"
                        )}>
                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", menuOpen && "rotate-180")} />
                        </div>
                    </button>

                    {menuOpen && (
                        <div
                            className="absolute bottom-[calc(100%+8px)] left-4 right-4 bg-white border border-gray-100 rounded-2xl overflow-hidden z-50 shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in-up duration-200 p-1.5"
                        >
                            <button 
                                onClick={() => {
                                    router.push("/admin/settings");
                                    setMenuOpen(false);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-3.5 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-950 hover:bg-gray-50 rounded-xl transition-all"
                            >
                                <User className="h-4 w-4 text-gray-300" /> My Profile
                            </button>
                            
                            <div className="h-px bg-gray-50 my-1 mx-2" />
                            
                            <button 
                                onClick={() => setShowLogoutConfirm(true)}
                                className="flex items-center gap-3 w-full px-4 py-3.5 text-[11px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                            >
                                <LogOut className="h-4 w-4" /> Sign Out
                            </button>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
