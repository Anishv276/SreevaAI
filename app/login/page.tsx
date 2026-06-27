"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
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
            await refreshUser();
            router.push(data.redirectTo);
        } catch {
            setError("Connection error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            suppressHydrationWarning={true}
            className="min-h-screen flex items-center justify-center p-6 relative"
            style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)" }}
        >
            {/* Subtle background blobs */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full blur-[120px]"
                    style={{ background: "rgba(139,92,246,0.12)" }} />
                <div className="absolute bottom-[-10%] left-[-5%] w-[35%] h-[35%] rounded-full blur-[100px]"
                    style={{ background: "rgba(59,130,246,0.08)" }} />
            </div>

            {/* Back to Site */}
            <Link
                href="/"
                className="absolute top-8 left-8 flex items-center gap-2 transition-colors group z-10"
                style={{ color: "#6B7280", textDecoration: "none" }}
            >
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>Return to Home</span>
            </Link>

            {/* Card */}
            <div className="relative z-10 w-full max-w-md animate-fade-slide" style={{ display: "flex", flexDirection: "column", gap: 32 }}>

                {/* Logo + brand */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
                    <img src="/sreevaailogo2.png" alt="Sreeva AI" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }} />
                    <div>
                        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", margin: 0 }}>
                            Sreeva{" "}
                            <span style={{ backgroundImage: "linear-gradient(135deg,#8B5CF6,#3B82F6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AI</span>
                        </h1>
                        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>AI Interviewer for Smarter Hiring</p>
                    </div>
                </div>

                {/* Login card */}
                <div
                    className="group relative bg-white rounded-2xl overflow-hidden"
                    style={{
                        border: "1px solid #E9E7FF",
                        boxShadow: "0 4px 6px rgba(124,58,237,0.04), 0 20px 40px rgba(124,58,237,0.06)",
                        padding: "32px",
                    }}
                >
                    {/* Hover accent bar */}
                    <div className="absolute top-0 left-0 w-1 h-full opacity-0 group-hover:opacity-100 transition-all duration-500"
                        style={{ background: "linear-gradient(180deg, #8B5CF6, #3B82F6)" }} />

                    <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        {/* Email */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                Business Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                required
                                autoComplete="off"
                                style={{
                                    width: "100%", height: 46, padding: "0 16px",
                                    background: "#F9FAFB", border: "1px solid #E9E7FF",
                                    borderRadius: 12, color: "#111827", fontSize: 14,
                                    fontWeight: 500, outline: "none", boxSizing: "border-box",
                                    transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
                                }}
                                onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                                onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                            />
                        </div>

                        {/* Password */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                    Password
                                </label>
                                <Link href="/login/forgot-password"
                                    style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.1em", textDecoration: "none" }}>
                                    Forgot?
                                </Link>
                            </div>
                            <div style={{ position: "relative" }}>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="new-password"
                                    style={{
                                        width: "100%", height: 46, padding: "0 48px 0 16px",
                                        background: "#F9FAFB", border: "1px solid #E9E7FF",
                                        borderRadius: 12, color: "#111827", fontSize: 14,
                                        fontWeight: 500, outline: "none", boxSizing: "border-box",
                                        transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
                                    }}
                                    onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                                    onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 0, color: "#9CA3AF", cursor: "pointer", display: "flex", alignItems: "center" }}
                                >
                                    {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div style={{ padding: "12px 16px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 13, fontWeight: 500 }}>
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            id="login-btn"
                            type="submit"
                            disabled={loading}
                            className="btn-shimmer"
                            style={{
                                width: "100%", height: 46, borderRadius: 12,
                                background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
                                color: "white", fontSize: 13, fontWeight: 700,
                                letterSpacing: "0.08em", textTransform: "uppercase",
                                border: "none", cursor: loading ? "not-allowed" : "pointer",
                                opacity: loading ? 0.55 : 1,
                                boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
                                transition: "opacity 0.15s, transform 0.15s, box-shadow 0.15s",
                                marginTop: 4,
                            }}
                        >
                            {loading ? "Signing in..." : "LOGIN"}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p style={{ textAlign: "center", fontSize: 11, color: "#9CA3AF", lineHeight: 1.7 }}>
                    By clicking continue, you agree to our{" "}
                    <a href="/terms" style={{ color: "#374151", textDecoration: "underline", textDecorationColor: "#E9E7FF" }}>Terms of Service</a>
                    {" "}and{" "}
                    <a href="/privacy" style={{ color: "#374151", textDecoration: "underline", textDecorationColor: "#E9E7FF" }}>Privacy Policy</a>.
                </p>
            </div>
        </div>
    );
}
