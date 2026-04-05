"use client";

import { useAuth } from "@/context/auth-context";
import Link from "next/link";
import { useState } from "react";
import { 
    LayoutDashboard, 
    Users, 
    Settings, 
    LogOut, 
    Sparkles, 
    X,
    ShieldAlert,
    Loader2
} from "lucide-react";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuth();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

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
        <div className="min-h-screen bg-white selection:bg-orange-50 selection:text-orange-950 font-medium text-gray-900 overflow-visible">
            
            {/* LOGOUT CONFIRMATION OVERLAY */}
            {showLogoutConfirm && (
                <div 
                    className="fixed inset-0 z-[200] backdrop-blur-xl bg-white/40 flex items-center justify-center p-6 animate-in fade-in duration-300"
                    onClick={() => !isLoggingOut && setShowLogoutConfirm(false)}
                >
                    <div 
                        className="w-full max-w-md bg-white border border-gray-100 rounded-[3rem] shadow-[0_50px_150px_rgba(0,0,0,0.15)] overflow-hidden animate-in-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-12 text-center space-y-10 relative">
                             {!isLoggingOut && (
                                <button 
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="absolute -top-4 -right-4 p-4 rounded-full hover:bg-gray-50 text-gray-300 hover:text-gray-950 transition-all shadow-sm"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                             )}
                             
                             <div className="flex justify-center">
                                <div className="h-24 w-24 rounded-[2.5rem] bg-red-50 text-red-500 flex items-center justify-center shadow-inner group transition-all">
                                    <ShieldAlert className="h-10 w-10 group-hover:scale-110 transition-transform" />
                                </div>
                             </div>

                             <div className="space-y-3">
                                <h2 className="text-3xl font-black text-gray-950 tracking-tighter uppercase italic leading-none">Terminate Session?</h2>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px] italic leading-none">Are you sure you want to end this access portal?</p>
                             </div>

                             <div className="space-y-4 pt-4">
                                <button
                                    onClick={handleLogout}
                                    disabled={isLoggingOut}
                                    className="w-full h-18 bg-gray-950 text-white rounded-full font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl hover:bg-red-600 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 italic"
                                >
                                    {isLoggingOut ? <Loader2 className="h-5 w-5 animate-spin text-red-400" /> : "Authorize Sign Out"}
                                </button>
                                
                                {!isLoggingOut && (
                                    <button
                                        onClick={() => setShowLogoutConfirm(false)}
                                        className="w-full h-16 bg-gray-50 text-gray-400 rounded-full font-black text-[10px] uppercase tracking-[0.2em] hover:bg-gray-100 hover:text-gray-950 transition-all italic border border-gray-100 shadow-sm"
                                    >
                                        Cancel Sync
                                    </button>
                                )}
                             </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <aside className="fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                {/* Logo */}
                <div className="p-8 border-b border-gray-50">
                    <div className="flex items-center gap-4 group cursor-pointer">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center shadow-[0_4px_15px_rgba(249,115,22,0.2)] group-hover:rotate-6 transition-transform">
                            <Sparkles className="text-white h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-gray-900 font-black text-lg tracking-tight leading-none">Lumoscale</p>
                            <p className="text-[10px] text-[#F97316] font-black uppercase tracking-[0.2em] mt-1.5 leading-none">Super Admin</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-4 space-y-2 mt-4">
                    {[
                        { href: "/super-admin", label: "Dashboard", icon: LayoutDashboard },
                        { href: "/super-admin/orgs", label: "Organizations", icon: Users },
                        { href: "/super-admin/settings", label: "Settings", icon: Settings },
                    ].map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-4 px-4 py-4 rounded-2xl text-gray-900 hover:text-black hover:bg-gray-50 transition-all text-[13px] font-black uppercase tracking-widest group border border-transparent hover:border-gray-100"
                        >
                            <item.icon className="h-4.5 w-4.5 text-gray-400 group-hover:text-[#F97316] transition-colors" />
                            {item.label}
                        </Link>
                    ))}
                </nav>

                {/* User */}
                <div className="p-4 border-t border-gray-50 bg-white">
                    <div className="flex items-center gap-4 p-4 rounded-[1.5rem] bg-gray-50 border border-gray-100 mb-3 overflow-hidden shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-gray-950 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-lg uppercase">
                            {user?.name?.[0] || user?.email?.[0] || "V"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-gray-950 text-[12px] font-black truncate uppercase tracking-tight">{user?.name || "Vamsi"}</p>
                            <p className="text-gray-500 text-[10px] font-black truncate lowercase mt-1 tracking-widest leading-none">{user?.email}</p>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => setShowLogoutConfirm(true)}
                        className="w-full h-14 flex items-center gap-3 px-6 rounded-2xl text-[11px] text-gray-900 hover:text-red-600 hover:bg-red-50 font-black uppercase tracking-[0.2em] transition-all group"
                    >
                        <LogOut className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="ml-64 min-h-screen">
                {children}
            </main>
        </div>
    );
}
