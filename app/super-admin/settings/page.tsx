"use client";

import { useState } from "react";
import { 
    Lock,
    ShieldCheck,
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    KeyRound, 
    ChevronRight,
    X,
    ShieldAlert,
    Mail,
    Eye,
    EyeOff
} from "lucide-react";

export default function SuperAdminSettingsPage() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [otp, setOtp] = useState("");
    
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [loading, setLoading] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    
    const [error, setError] = useState("");
    const [otpError, setOtpError] = useState("");
    const [success, setSuccess] = useState("");

    const handleInitialSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        
        if (newPassword !== confirmPassword) {
            setError("New passwords do not match"); return;
        }

        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters"); return;
        }

        setSendingOtp(true);
        try {
            const res = await fetch("/api/auth/otp/send", { method: "POST" });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Session relay failure");
            } else {
                setShowOtpModal(true);
                setAttempts(0);
                setOtpError("");
            }
        } catch {
            setError("Network infrastructure error.");
        } finally {
            setSendingOtp(false);
        }
    };

    const handleVerifyAndSave = async () => {
        if (!otp || otp.length < 6) {
            setOtpError("6-digit code required."); return;
        }
        setLoading(true);
        setOtpError("");
        try {
            const res = await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword, otp }),
            });

            if (!res.ok) {
                const newAttempts = attempts + 1;
                setAttempts(newAttempts);
                if (newAttempts >= 3) {
                    setOtpError("Access Denied: 3 attempts failed.");
                    setTimeout(() => { setShowOtpModal(false); setOtp(""); }, 2000);
                } else {
                    setOtpError(`Incorrect. ${3 - newAttempts} left.`);
                }
                return;
            }

            setSuccess("Master Access Keys Synchronized.");
            setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setOtp("");
            setShowOtpModal(false);
            setTimeout(() => setSuccess(""), 4000);
        } catch {
            setOtpError("Database sync error.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FDFDFD] p-8 lg:p-12 animate-fade-slide text-gray-900 font-medium pb-24">
            
            {/* Header Area */}
            <div className="max-w-6xl mx-auto space-y-2 mb-8">
                <div className="flex items-center gap-3 group">
                    <div className="h-10 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full" />
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
                </div>
                <p className="text-gray-500 font-medium ml-5">Manage your account & root preferences</p>
            </div>

            <div className="max-w-6xl mx-auto grid md:grid-cols-[280px_1fr] gap-12 items-start">
                {/* Sidebar Navigation */}
                <aside className="bg-white border border-gray-100 rounded-xl p-2 space-y-1">
                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-orange-50 text-[#F97316] font-medium text-sm">
                        <Lock className="h-4 w-4" />
                        <span className="text-[13px] font-semibold">Password</span>
                    </button>
                    <div className="px-4 py-4 text-gray-300 text-[10px] font-medium text-center">Version 1.0.4</div>
                </aside>

                <div className="space-y-12">
                    {/* Security Update Section */}
                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm relative pb-32">
                        <div className="space-y-2 mb-14">
                            <h2 className="text-2xl font-black text-gray-950 tracking-tight uppercase italic leading-none">Update Password</h2>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px] italic opacity-60">Security verification required for password changes</p>
                        </div>

                        <form onSubmit={handleInitialSubmit} className="space-y-10 max-w-4xl">
                            {/* Current Password Field */}
                            <div className="space-y-4">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Current Password</label>
                                <div className="relative group max-w-lg">
                                    <KeyRound className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-200 group-focus-within:text-gray-950 transition-colors" />
                                    <input
                                        type={showCurrent ? "text" : "password"}
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                        placeholder="Enter Current Password"
                                        className="w-full h-10 pl-12 pr-12 rounded-xl border border-gray-200 bg-white text-[14px] font-medium shadow-sm hover:border-orange-300 focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] transition-all"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-200 hover:text-[#F97316] transition-colors"
                                    >
                                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* New Password Grid */}
                            <div className="grid md:grid-cols-2 gap-10 pt-10 border-t border-dashed border-gray-100">
                                <div className="space-y-4">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">New Password</label>
                                    <div className="relative group">
                                        <input
                                            type={showNew ? "text" : "password"}
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            placeholder="Min. 6 Characters"
                                            className="w-full h-10 pl-12 pr-12 rounded-xl border border-gray-200 bg-white text-[14px] font-medium shadow-sm hover:border-orange-300 focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] transition-all"
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => setShowNew(!showNew)}
                                            className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-200 hover:text-[#F97316] transition-colors"
                                        >
                                            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Confirm New Password</label>
                                    <div className="relative group">
                                        <input
                                            type={showConfirm ? "text" : "password"}
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            placeholder="Repeat New Password"
                                            className="w-full h-10 pl-12 pr-12 rounded-xl border border-gray-200 bg-white text-[14px] font-medium shadow-sm hover:border-orange-300 focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] transition-all"
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-200 hover:text-[#F97316] transition-colors"
                                        >
                                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="p-6 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-4 animate-shake">
                                    <AlertCircle className="h-5 w-5 opacity-70" /> {error}
                                </div>
                            )}

                            {success && (
                                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-4 animate-in-up">
                                    <CheckCircle2 className="h-5 w-5 opacity-70" /> {success}
                                </div>
                            )}

                            {/* CTA Button matching Pic 3's high-shadow orange Style */}
                            <div className="absolute bottom-12 right-12">
                                <button
                                    type="submit"
                                    disabled={sendingOtp || !currentPassword || !newPassword}
                                    className="h-10 px-6 rounded-xl font-bold text-[13px] shadow-md hover:shadow-lg transition-all bg-[#F97316] text-white disabled:opacity-50 flex items-center justify-center italic"
                                >
                                    {sendingOtp ? <Loader2 className="h-5 w-5 animate-spin" /> : "Change Password"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {/* OTP MODAL - Refined for premium look */}
            {showOtpModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-white/30 transition-all">
                    <div className="w-full max-w-lg bg-white border border-gray-100 rounded-[3rem] shadow-[0_50px_150px_rgba(0,0,0,0.15)] overflow-hidden animate-in-up">
                        <div className="p-12 lg:p-16 space-y-12 text-center">
                            <div className="flex justify-center relative">
                                <button onClick={() => setShowOtpModal(false)} className="absolute -top-6 -right-6 p-4 rounded-full hover:bg-gray-50 text-gray-300 hover:text-gray-950 transition-all"><X className="h-5 w-5" /></button>
                                <div className="h-24 w-24 rounded-[2.5rem] bg-orange-50 flex items-center justify-center text-[#F97316] shadow-inner"><Mail className="h-10 w-10" /></div>
                            </div>
                            <div className="space-y-3">
                                <h2 className="text-3xl font-black text-gray-950 tracking-tighter uppercase italic leading-none">Authorization</h2>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px] italic leading-none">MFA code dispatched to verified identity</p>
                            </div>
                            <div className="space-y-10">
                                <input type="text" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="w-full h-24 text-center text-5xl font-black tracking-[0.6em] bg-gray-50 border-none rounded-[2rem] text-gray-950 outline-none focus:bg-white focus:ring-4 focus:ring-orange-100/50 transition-all placeholder:text-gray-100" />
                                {otpError && <div className="flex items-center justify-center gap-2 text-red-600 text-[10px] font-black uppercase tracking-widest animate-shake italic"><ShieldAlert className="h-4 w-4" /> {otpError}</div>}
                                <button onClick={handleVerifyAndSave} disabled={loading || otp.length < 6} className="w-full h-20 rounded-full bg-gray-950 text-white font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:bg-[#F97316] transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 flex items-center justify-center italic">{loading ? <Loader2 className="h-6 w-6 animate-spin text-orange-400" /> : "Verify Root Protocol"}</button>
                            </div>
                            <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em]">Authorized Access Only</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
