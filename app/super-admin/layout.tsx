"use client";

import { useAuth } from "@/context/auth-context";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { 
    LayoutDashboard, 
    Users, 
    Settings, 
    LogOut, 
    Sparkles, 
    X,
    ShieldAlert,
    Loader2,
    LifeBuoy,
    CreditCard
} from "lucide-react";
import { Toaster } from "@/components/ui/toast-custom";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuth();
    const pathname = usePathname();
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
                    className="fixed inset-0 z-[200] backdrop-blur-md bg-white/50 flex items-center justify-center p-6 animate-in fade-in duration-200"
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

            {/* Sidebar */}
            <aside className="fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 flex flex-col z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                {/* Logo */}
                <div className="p-8 border-b border-gray-50">
                    <div className="flex items-center gap-4 group cursor-pointer">
                        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-[0_4px_15px_rgba(249,115,22,0.1)] transition-transform group-hover:scale-105">
                            <img src="/Logo.png" alt="Sreeva AI" className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <p className="text-gray-900 font-black text-lg tracking-tight leading-none">Sreeva AI</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#F97316] mt-1.5 leading-none">Super Admin</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-4 space-y-1 mt-4">
                    {[ 
                        { href: "/super-admin", label: "Dashboard", icon: LayoutDashboard },
                        { href: "/super-admin/orgs", label: "Organizations", icon: Users },
                        { href: "/super-admin/billing", label: "Billing", icon: CreditCard },
                        { href: "/super-admin/support", label: "Support Tickets", icon: LifeBuoy },
                        { href: "/super-admin/settings", label: "Settings", icon: Settings },
                    ].map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-[13px] font-bold group ${
                                    isActive 
                                        ? "bg-orange-50 text-[#F97316]" 
                                        : "text-gray-500 hover:text-black hover:bg-gray-50"
                                }`}
                            >
                                <item.icon className={`h-4 w-4 transition-colors ${isActive ? "text-[#F97316]" : "text-gray-400 group-hover:text-[#F97316]"}`} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User */}
                <div className="p-4 border-t border-gray-50 bg-white">
                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 mb-3 overflow-hidden shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-lg uppercase">
                            S
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-gray-950 text-[11px] font-black truncate uppercase tracking-tight">Super Administrator</p>
                            <p className="text-gray-500 text-[10px] font-bold truncate lowercase mt-1 tracking-wider leading-none">support@sreevaai.co</p>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => setShowLogoutConfirm(true)}
                        className="w-full h-12 flex items-center gap-3 px-6 rounded-xl text-[11px] text-gray-900 hover:text-rose-600 hover:bg-rose-50 font-black uppercase tracking-[0.2em] transition-all group"
                    >
                        <LogOut className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="ml-64 min-h-screen">
                <div className="max-w-[1600px] mx-auto p-8 md:p-12 lg:p-16">
                    {children}
                </div>
            </main>
            <Toaster />
        </div>
    );
}

