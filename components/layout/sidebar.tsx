"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard, PlusCircle, Users, Settings,
    FileText, PieChart, Sparkles, ChevronDown,
    LogOut, User, SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/context/auth-context";

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
    const [menuOpen, setMenuOpen] = useState(false);
    const { logout } = useAuth();

    return (
        <aside
            className="hidden md:flex h-screen w-[220px] flex-col fixed left-0 top-0 z-50 bg-white border-r border-gray-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]"
        >
            {/* ── Logo ──────────────────────────────── */}
            <div className="flex items-center gap-3 px-6 h-20 border-b border-gray-50">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center flex-shrink-0 shadow-[0_4px_15px_rgba(249,115,22,0.3)] group cursor-pointer hover:scale-110 transition-transform">
                    <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col">
                    <span className="text-lg font-black text-gray-900 leading-none tracking-tight">Hirer.AI</span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Premium Admin</span>
                </div>
            </div>

            {/* ── Nav ───────────────────────────────── */}
            <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-2 select-none">
                {sidebarItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
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

            {/* ── AI Active Indicator ───────────────── */}
            <div className="px-6 py-4 mx-4 mb-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-40 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_#22C55E]" />
                    </div>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">AI Engine Live</span>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
            </div>

            {/* ── User Section ──────────────────────── */}
            <div className="px-4 pb-6 pt-4 border-t border-gray-50 relative bg-white">
                <button
                    onClick={() => setMenuOpen(o => !o)}
                    className="flex items-center gap-3 w-full p-2.5 rounded-2xl hover:bg-gray-50 transition-all duration-300 group border border-transparent hover:border-gray-100 hover:shadow-sm"
                >
                    <div className="relative">
                        <div className="h-10 w-10 rounded-xl bg-gray-900 flex items-center justify-center text-white text-xs font-black shadow-md">
                            SA
                        </div>
                        <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-black text-gray-900 leading-tight truncate">Sarah Admin</p>
                        <p className="text-[10px] text-gray-400 font-bold tracking-tight truncate lowercase mt-0.5">Global Recruiter</p>
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
                        className="absolute bottom-[calc(100%+8px)] left-4 right-4 bg-white border border-gray-100 rounded-2xl overflow-hidden z-50 shadow-[0_8px_30px_rgba(0,0,0,0.12)] animate-fade-slide-up p-1.5"
                    >
                        <button className="flex items-center gap-3 w-full px-4 py-3 text-[13px] font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all">
                            <User className="h-4 w-4 text-gray-400 group-hover:text-gray-600" /> My Profile
                        </button>
                        <button className="flex items-center gap-3 w-full px-4 py-3 text-[13px] font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all">
                            <SlidersHorizontal className="h-4 w-4 text-gray-400 group-hover:text-gray-600" /> Preferences
                        </button>
                        <div className="h-px bg-gray-50 my-1 mx-2" />
                        <button 
                            onClick={logout}
                            className="flex items-center gap-3 w-full px-4 py-3 text-[13px] font-black text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                            <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                    </div>
                )}
            </div>
        </aside>
    );
}
