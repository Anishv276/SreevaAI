"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import "../editorial.css";
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
        <div suppressHydrationWarning={true} className="min-h-screen bg-[#fbf8f4] flex items-center justify-center p-6 font-medium relative editorial-theme">
            {/* Back to Site Button */}
            <Link 
                href="/"
                className="absolute top-8 left-8 flex items-center gap-2 text-[#6f6862] hover:text-[#1c1b1b] transition-colors group"
            >
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                <span className="text-[10px] font-black uppercase tracking-widest">Return to Home</span>
            </Link>
            <div className="w-full max-w-md space-y-10 animate-fade-slide">
                {/* Logo Section - Matching Admin Sidebar */}
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="h-14 w-14 rounded-xl bg-white flex items-center justify-center shadow-[0_4px_15px_rgba(255,106,0,0.1)] overflow-hidden">
                        <img src="/sreevalogo.png" alt="Logo" className="h-full w-full object-contain p-2" />
                    </div>
                    <div>
                        <h1 className="text-[26px] text-[#1c1b1b]" style={{ fontFamily: '"Instrument Serif", serif', letterSpacing: '-0.015em', fontWeight: 400, display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
                          <span>Sreeva</span>
                          <span style={{ fontStyle: 'italic' }}>AI</span>
                        </h1>
                    </div>
                </div>
                {/* Premium Card - Matching Admin Dashboard DNA */}
                <div className="group relative bg-white border border-[#ececea] rounded-2xl p-8 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(255,106,0,0.1)] transition-all duration-500 overflow-hidden">
                    {/* Interactive Border Glow */}
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#ff6a00] opacity-0 group-hover:opacity-100 transition-all duration-500" />
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-[#6f6862] uppercase tracking-widest">Business Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="name@sreevaai.com"
                                required
                                autoComplete="off"
                                className="w-full h-12 px-4 bg-[#f4f0ea] border border-transparent rounded-xl text-[#1c1b1b] placeholder-[#9a938d] text-sm font-bold outline-none group-hover:bg-white focus:bg-white focus:border-[#1c1b1b] transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-[#6f6862] uppercase tracking-widest">Password</label>
                                <Link
                                    href="/login/forgot-password"
                                    className="text-[10px] font-black text-[#ff6a00] hover:text-[#e75c00] uppercase tracking-widest transition-colors"
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
                                    autoComplete="new-password"
                                    className="w-full h-12 px-4 pr-12 bg-[#f4f0ea] border border-transparent rounded-xl text-[#1c1b1b] placeholder-[#9a938d] text-sm font-bold outline-none group-hover:bg-white focus:bg-white focus:border-[#1c1b1b] transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6f6862] hover:text-[#1c1b1b] text-[10px] font-black uppercase tracking-widest transition-colors"
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
                                className="btn-shimmer w-full h-12 rounded-xl bg-[#ff6a00] text-white font-black text-[11px] tracking-widest uppercase shadow-[0_5px_15px_rgba(255,106,0,0.2)] hover:shadow-[0_10px_25px_rgba(255,106,0,0.4)] transition-all active:scale-95 disabled:opacity-50"
                            >
                                {loading ? "AUTHENTICATING..." : "LOGIN"}
                            </button>
                        </div>
                    </form>
                </div>
                <div className="text-center mt-4 px-4 max-w-sm mx-auto">
                    <p className="text-[11px] text-[#9a938d] font-medium leading-relaxed">
                        By clicking continue, you agree to our{" "}
                        <a href="/terms" className="text-[#1c1b1b] underline decoration-[#ececea] underline-offset-4 hover:decoration-[#ff6a00] transition-colors">Terms of Service</a>
                        {" "}and{" "}
                        <a href="/privacy" className="text-[#1c1b1b] underline decoration-[#ececea] underline-offset-4 hover:decoration-[#ff6a00] transition-colors">Privacy Policy</a>.
                    </p>
                </div>
            </div>
        </div>
    );
}
