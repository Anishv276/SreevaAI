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
    X,
    ShieldAlert,
    Loader2,
    LifeBuoy,
    CreditCard,
    AudioLines,
    MessageSquare
} from "lucide-react";
import { Toaster } from "@/components/ui/toast-custom";

const NAV_ITEMS = [
    { href: "/super-admin", label: "Overview", icon: LayoutDashboard },
    { href: "/super-admin/orgs", label: "Organizations", icon: Users },
    { href: "/super-admin/voices", label: "Voice Engine", icon: AudioLines },
    { href: "/super-admin/billing", label: "Billing", icon: CreditCard },
    { href: "/super-admin/support", label: "Support Tickets", icon: LifeBuoy },
    { href: "/super-admin/feedback", label: "Candidate Feedback", icon: MessageSquare },
    { href: "/super-admin/settings", label: "Settings", icon: Settings },
];

export default function SuperAdminShell({ children }: { children: React.ReactNode }) {
    const { logout } = useAuth();
    const pathname = usePathname();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try { await logout(); }
        catch { setIsLoggingOut(false); setShowLogoutConfirm(false); }
    };

    return (
        <div
            className="min-h-screen text-gray-900"
            style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}
        >
            {/* Subtle aurora blobs */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[38%] h-[38%] rounded-full bg-violet-100/35 blur-[130px]" />
                <div className="absolute bottom-[-8%] left-[-5%] w-[32%] h-[32%] rounded-full bg-blue-100/30 blur-[110px]" />
            </div>

            {/* LOGOUT CONFIRMATION */}
            {showLogoutConfirm && (
                <div
                    className="fixed inset-0 z-[200] backdrop-blur-sm bg-gray-900/25 flex items-center justify-center p-6 animate-in fade-in duration-200"
                    onClick={() => !isLoggingOut && setShowLogoutConfirm(false)}
                >
                    <div
                        className="w-full max-w-sm bg-white rounded-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
                        style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-8 text-center space-y-5 relative">
                            {!isLoggingOut && (
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            <div className="flex justify-center">
                                <div className="h-14 w-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                                    <ShieldAlert className="h-7 w-7" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Terminate Session?</h2>
                                <p className="text-sm text-gray-500">Are you sure you want to sign out?</p>
                            </div>
                            <div className="space-y-2.5 pt-1">
                                <button
                                    onClick={handleLogout}
                                    disabled={isLoggingOut}
                                    className="w-full h-11 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
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
            <aside
                className="fixed top-0 left-0 h-full w-[240px] flex flex-col z-50"
                style={{
                    background: "#FFFFFF",
                    borderRight: "1px solid #E9E7FF",
                    boxShadow: "2px 0 12px rgba(124, 58, 237, 0.04)",
                }}
            >
                {/* Logo */}
                <div className="px-5 h-16 flex items-center" style={{ borderBottom: "1px solid #F0EEF8" }}>
                    <div className="flex items-center gap-3">
                        <img src="/sreevaailogo2.png" alt="Sreeva AI" className="w-8 h-8 object-contain rounded-md flex-shrink-0 shadow-sm" />
                        <div>
                            <p className="text-[17px] font-bold text-gray-900 tracking-tight leading-none">
                                Sreeva <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}>AI</span>
                            </p>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mt-0.5 leading-none">Super Admin</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 pt-5 pb-4 space-y-0.5 overflow-y-auto">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium group ${
                                    isActive
                                        ? "text-violet-700"
                                        : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                                }`}
                                style={isActive ? {
                                    background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))",
                                    border: "1px solid rgba(139,92,246,0.15)",
                                } : undefined}
                            >
                                <item.icon
                                    className={`h-4 w-4 flex-shrink-0 transition-colors ${
                                        isActive ? "text-violet-600" : "text-gray-400 group-hover:text-gray-600"
                                    }`}
                                    strokeWidth={isActive ? 2 : 1.75}
                                />
                                {item.label}
                                {isActive && (
                                    <div
                                        className="ml-auto w-1.5 h-5 rounded-full flex-shrink-0"
                                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}
                                    />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="px-3 pb-4 pt-3" style={{ borderTop: "1px solid #F0EEF8" }}>
                    <div
                        className="flex items-center gap-3 px-3 py-3 rounded-xl mb-2"
                        style={{ background: "#F5F3FF", border: "1px solid #E9E7FF" }}
                    >
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                            style={{ background: "linear-gradient(135deg, #7C3AED, #3B82F6)" }}
                        >
                            S
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-gray-900 text-sm font-semibold truncate leading-tight">Super Administrator</p>
                            <p className="text-gray-400 text-xs truncate mt-0.5 leading-tight">support@sreevaai.co</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowLogoutConfirm(true)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all group"
                    >
                        <LogOut className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform text-gray-400 group-hover:text-red-500" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="ml-[240px] min-h-screen relative z-10">
                <div className="px-6 pt-6 pb-10 md:px-8 md:pt-8 lg:px-10">
                    {children}
                </div>
            </main>
            <Toaster />
        </div>
    );
}
