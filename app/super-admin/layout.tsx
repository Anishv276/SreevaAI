"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Users, Settings, LogOut, Sparkles } from "lucide-react";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simple client-side check. Server-side check is already in middleware.
        if (user && user.role !== "SUPER_ADMIN" && (user as any).role !== "SUPER_ADMIN") {
            router.push("/login?from=super-admin");
        } else {
            setLoading(false);
        }
    }, [user, router]);

    const handleLogout = async () => {
        await logout();
    };

    if (loading) return null;

    return (
        <div className="min-h-screen bg-white selection:bg-orange-50 selection:text-orange-950 font-medium text-gray-900">
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
                            <p className="text-[10px] text-[#F97316] font-black uppercase tracking-[0.2em] mt-1.5">Super Admin</p>
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
                            className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-800 hover:text-gray-900 hover:bg-gray-50 transition-all text-sm font-bold group"
                        >
                            <item.icon className="h-4.5 w-4.5 text-gray-500 group-hover:text-[#F97316] transition-colors" />
                            {item.label}
                        </Link>
                    ))}
                </nav>

                {/* User */}
                <div className="p-4 border-t border-gray-50 bg-white">
                    <div className="flex items-center gap-4 p-3 rounded-2xl bg-gray-50 border border-gray-100 mb-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm uppercase">
                            {user?.name?.[0] || user?.email?.[0] || "V"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-gray-900 text-[13px] font-black truncate">{user?.name || "Vamsi"}</p>
                            <p className="text-gray-800 text-[11px] font-bold truncate lowercase mt-1">{user?.email}</p>
                        </div>
                    </div>
                    
                    <button
                        onClick={handleLogout}
                        className="w-full h-12 flex items-center gap-3 px-6 rounded-2xl text-[12px] text-gray-800 hover:text-red-500 hover:bg-red-50 font-black uppercase tracking-widest transition-all group"
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
