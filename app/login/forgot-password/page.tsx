"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Mail, 
    KeyRound, 
    Lock, 
    ArrowLeft, 
    CheckCircle2, 
    ShieldCheck, 
    Loader2, 
    ShieldAlert, 
    Eye, 
    EyeOff 
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/components/ui/toast-custom";

type Step = "EMAIL" | "OTP" | "RESET" | "SUCCESS";

function ForgotPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const from = searchParams.get("from");
    
    // Dynamic back routing
    const backLink = from === "settings" ? "/admin/settings?section=password" : "/login";
    const backText = from === "settings" ? "Back to Settings" : "Back to Login";
    const [step, setStep] = useState<Step>("EMAIL");
    const [loading, setLoading] = useState(false);
    
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // Step 1: Send OTP
    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Failed to send code");
                return;
            }
            toast.success("Security code sent to your email");
            setStep("OTP");
        } catch {
            toast.error("Connectivity error. Try again.");
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Verify OTP
    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length !== 6) {
            toast.error("Please enter the 6-digit code");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/auth/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Invalid code");
                return;
            }
            setStep("RESET");
        } catch {
            toast.error("Verification failed");
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Reset Password
    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        if (newPassword.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Reset failed");
                return;
            }
            toast.success("Security credentials updated");
            setStep("SUCCESS");
        } catch {
            toast.error("Finalization failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center p-6 font-medium selection:bg-orange-100">
            <div className="w-full max-w-md space-y-8 animate-fade-slide">
                
                {/* Header Section */}
                <div className="flex flex-col items-center gap-6 text-center">
                    <Link href={backLink} className="group flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:text-gray-900 transition-colors">
                        <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> 
                        {backText}
                    </Link>
                    
                    <div className="h-16 w-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center shadow-sm relative group">
                        <div className="absolute inset-0 bg-orange-50 rounded-2xl scale-0 group-hover:scale-100 transition-transform duration-500" />
                        {step === "EMAIL" && <Mail className="w-6 h-6 text-gray-400 group-hover:text-[#F97316] transition-colors relative z-10" />}
                        {step === "OTP" && <KeyRound className="w-6 h-6 text-gray-400 group-hover:text-[#F97316] transition-colors relative z-10" />}
                        {step === "RESET" && <Lock className="w-6 h-6 text-gray-400 group-hover:text-[#F97316] transition-colors relative z-10" />}
                        {step === "SUCCESS" && <ShieldCheck className="w-6 h-6 text-emerald-500 relative z-10" />}
                    </div>
                    
                    <div className="space-y-1">
                        <h1 className="text-xl font-black text-gray-900 tracking-tight uppercase">
                            {step === "EMAIL" && "Account Recovery"}
                            {step === "OTP" && "Security Challenge"}
                            {step === "RESET" && "Credential Update"}
                            {step === "SUCCESS" && "Access Restored"}
                        </h1>
                        <p className="text-gray-500 font-bold text-[10px] uppercase tracking-[0.3em] leading-relaxed max-w-[280px]">
                            {step === "EMAIL" && "Identity Gateway Authentication"}
                            {step === "OTP" && "Verification Token Required"}
                            {step === "RESET" && "Secure Password Finalization"}
                            {step === "SUCCESS" && "You may now return to work"}
                        </p>
                    </div>
                </div>

                {/* Progress Indicator */}
                <div className="flex justify-center gap-1.5 h-1">
                    {["EMAIL", "OTP", "RESET", "SUCCESS"].map((s, idx) => (
                        <div 
                            key={s} 
                            className={`h-1 rounded-full transition-all duration-500 ${
                                step === s ? "w-8 bg-[#F97316]" : 
                                idx < ["EMAIL", "OTP", "RESET", "SUCCESS"].indexOf(step) ? "w-4 bg-gray-900" : "w-4 bg-gray-200"
                            }`} 
                        />
                    ))}
                </div>

                {/* Content Area */}
                <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-[0_40px_100px_rgba(0,0,0,0.03)] overflow-hidden relative group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#F97316]/50 opacity-0 group-hover:opacity-100 transition-all" />
                    
                    <AnimatePresence mode="wait">
                        {step === "EMAIL" && (
                            <motion.form 
                                key="step-email"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onSubmit={handleSendOTP}
                                className="space-y-6"
                            >
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Admin Authorization Email</label>
                                    <div className="relative">
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="admin@lumoscale.com"
                                            required
                                            className="w-full h-12 px-4 bg-gray-50 border border-transparent rounded-xl text-gray-900 placeholder-gray-400 text-sm font-bold outline-none focus:bg-white focus:border-gray-900 transition-all"
                                        />
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 italic mt-2">
                                        Note: This flow is restricted to HR Admin credentials.
                                    </p>
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-12 rounded-xl bg-gray-950 text-white font-black text-[11px] tracking-widest uppercase hover:bg-gray-900 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "PROCEED TO IDENTITY CHALLENGE"}
                                </button>
                            </motion.form>
                        )}

                        {step === "OTP" && (
                            <motion.form 
                                key="step-otp"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onSubmit={handleVerifyOTP}
                                className="space-y-6"
                            >
                                <div className="space-y-4">
                                    <div className="flex flex-col items-center gap-2 text-center">
                                        <p className="text-[11px] font-bold text-gray-900 leading-tight">
                                           A 6-digit security code was sent to <br/>
                                           <span className="text-[#F97316] underline underline-offset-4">{email}</span>
                                        </p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            autoFocus
                                            type="text"
                                            maxLength={6}
                                            value={otp}
                                            onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                                            placeholder="0 0 0 0 0 0"
                                            className="w-full h-16 text-center text-2xl font-black tracking-[0.5em] bg-gray-50 border border-transparent rounded-2xl text-gray-900 placeholder-gray-200 outline-none focus:bg-white focus:border-gray-950 transition-all"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-12 rounded-xl bg-[#F97316] text-white font-black text-[11px] tracking-widest uppercase shadow-[0_5px_15px_rgba(249,115,22,0.2)] hover:shadow-orange-200 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "VERIFY CODE"}
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setStep("EMAIL")}
                                    className="w-full text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors"
                                >
                                    Wrong email? Change
                                </button>
                            </motion.form>
                        )}

                        {step === "RESET" && (
                            <motion.form 
                                key="step-reset"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onSubmit={handleResetPassword}
                                className="space-y-6"
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">New Security Password</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                placeholder="••••••••"
                                                required
                                                className="w-full h-12 px-4 bg-gray-50 border border-transparent rounded-xl text-gray-900 placeholder-gray-400 text-sm font-bold outline-none focus:bg-white focus:border-gray-900 transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 transition-colors"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Confirm New Password</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="w-full h-12 px-4 bg-gray-50 border border-transparent rounded-xl text-gray-900 placeholder-gray-400 text-sm font-bold outline-none focus:bg-white focus:border-gray-900 transition-all"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-12 rounded-xl bg-gray-950 text-white font-black text-[11px] tracking-widest uppercase hover:bg-gray-900 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "FINALIZE CREDENTIALS"}
                                </button>
                            </motion.form>
                        )}

                        {step === "SUCCESS" && (
                            <motion.div 
                                key="step-success"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-center space-y-6 py-4"
                            >
                                <div className="flex justify-center">
                                    <div className="h-16 w-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center animate-bounce">
                                        <CheckCircle2 className="w-8 h-8" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-bold text-gray-900">Credentials Updated Successfully</p>
                                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest leading-relaxed">
                                        Your identity has been re-verified. <br/> You may now continue to your workspace.
                                    </p>
                                </div>
                                <Link
                                    href={backLink}
                                    className="inline-flex h-12 px-8 rounded-xl bg-[#F97316] text-white font-black text-[11px] tracking-widest uppercase shadow-lg shadow-orange-100 items-center justify-center hover:scale-105 transition-all"
                                >
                                    {from === "settings" ? "Return to Settings" : "Login to Workspace"}
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="text-center space-y-3">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-[0.4em] leading-relaxed">
                        Lumoscale Cloud Identity & Access Mgmt <br/>
                        Secure Shell Environment v2.4
                    </p>
                    <div className="flex items-center justify-center gap-4 text-gray-300">
                        <ShieldCheck className="w-3 h-3" />
                        <div className="h-px w-8 bg-gray-100" />
                        <ShieldAlert className="w-3 h-3 opacity-50" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center p-6">
                <Loader2 className="w-8 h-8 animate-spin text-[#F97316]" />
            </div>
        }>
            <ForgotPasswordContent />
        </Suspense>
    );
}
