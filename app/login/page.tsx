"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
    const router = useRouter();
    const { refreshUser } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json().catch(() => ({ error: "Invalid server response" }));

            if (!res.ok) {
                setError(data.error || "Login failed");
                return;
            }

            // Sync user state to AuthContext before redirecting
            await refreshUser();
            router.push(data.redirectTo);
        } catch {
            setError("Connection error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div suppressHydrationWarning={true} className="min-h-screen bg-[#F7F6F3] flex items-center justify-center p-6 font-medium relative">
            {/* Back to Site Button */}
            <Link 
                href="/"
                className="absolute top-8 left-8 flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors group"
            >
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                <span className="text-[10px] font-black uppercase tracking-widest">Return to Home</span>
            </Link>

            <div className="w-full max-w-md space-y-10 animate-fade-slide">
                {/* Logo Section - Matching Admin Sidebar */}
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="h-14 w-14 rounded-xl bg-white flex items-center justify-center shadow-[0_4px_15px_rgba(249,115,22,0.1)] overflow-hidden">
                        <img src="/Logo.png" alt="Logo" className="h-full w-full object-contain p-2" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">SREEVA AI</h1>
                        <p className="text-gray-400 font-bold text-[10px] uppercase tracking-[0.4em] mt-2 text-center">Identity Management Gateway</p>
                    </div>
                </div>

                {/* Premium Card - Matching Admin Dashboard DNA */}
                <div className="group relative bg-white border border-gray-100 rounded-2xl p-8 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(249,115,22,0.1)] transition-all duration-500 overflow-hidden">
                    {/* Interactive Border Glow */}
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#F97316] opacity-0 group-hover:opacity-100 transition-all duration-500" />

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Corporate Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="name@sreevaai.com"
                                required
                                className="w-full h-12 px-4 bg-gray-50 border border-transparent rounded-xl text-gray-900 placeholder-gray-400 text-sm font-bold outline-none group-hover:bg-white focus:bg-white focus:border-gray-900 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Security Password</label>
                                <Link
                                    href="/login/forgot-password"
                                    className="text-[10px] font-black text-[#F97316] hover:text-orange-600 uppercase tracking-widest transition-colors"
                                >
                                    Forgot?
                                </Link>
                            </div>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="w-full h-12 px-4 pr-12 bg-gray-50 border border-transparent rounded-xl text-gray-900 placeholder-gray-400 text-sm font-bold outline-none group-hover:bg-white focus:bg-white focus:border-gray-900 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 text-[10px] font-black uppercase tracking-widest transition-colors"
                                >
                                    {showPassword ? "HIDE" : "SHOW"}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12px] font-bold">
                                {error}
                            </div>
                        )}

                        <div className="pt-2">
                            <button
                                id="login-btn"
                                type="submit"
                                disabled={loading}
                                className="btn-shimmer w-full h-12 rounded-xl bg-[#F97316] text-white font-black text-[11px] tracking-widest uppercase shadow-[0_5px_15px_rgba(249,115,22,0.2)] hover:shadow-[0_10px_25px_rgba(249,115,22,0.4)] transition-all active:scale-95 disabled:opacity-50"
                            >
                                {loading ? "AUTHENTICATING..." : "CONTINUE TO WORKSPACE"}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="text-center space-y-2">
                    <p className="text-gray-400 text-[9px] font-black uppercase tracking-[0.4em]">
                        Secured by Sreeva AI Network
                    </p>
                    <div className="h-0.5 w-6 bg-orange-100 mx-auto rounded-full" />
                </div>
            </div>
        </div>
    );
}

