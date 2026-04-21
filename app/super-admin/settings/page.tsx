"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Loader2, Mail, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-custom";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";

function SettingsCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="px-8 py-6 border-b border-gray-50">
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                {description && <p className="text-[13px] text-gray-500 font-medium mt-1 leading-relaxed">{description}</p>}
            </div>
            <div className="px-8 py-8">{children}</div>
        </div>
    );
}

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
    const [isLoadingGoogle, setIsLoadingGoogle] = useState(true);
    const [googleStatus, setGoogleStatus] = useState({ isConnected: false, email: "" });
    const [error, setError] = useState("");
    const [otpError, setOtpError] = useState("");
    const [success, setSuccess] = useState("");

    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);

    useEffect(() => {
        const url = new URL(window.location.href);
        const googleSuccess = url.searchParams.get("google_success");
        const googleError = url.searchParams.get("google_error");

        if (googleSuccess || googleError) {
            if (googleSuccess) {
                toast.success("Super Admin Google integration connected!");
            }
            if (googleError) {
                toast.error(`Google Connection Failed: ${googleError}`);
            }
            
            url.searchParams.delete("google_success");
            url.searchParams.delete("google_error");
            const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "");
            window.history.replaceState({}, "", next);
        }

        (async () => {
            try {
                const res = await fetch("/api/super-admin/integrations/google");
                if (res.ok) {
                    const data = await res.json();
                    setGoogleStatus({ isConnected: data.isConnected, email: data.email || "" });
                }
            } catch (err) {
                console.error("Failed to fetch Google status", err);
            } finally {
                setIsLoadingGoogle(false);
            }
        })();
    }, []);

    const handleInitialSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match");
            return;
        }
        if (newPassword.length < 8) {
            setError("New password must be at least 8 characters");
            return;
        }

        setSendingOtp(true);
        try {
            const res = await fetch("/api/auth/otp/send", { method: "POST" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "Failed to send verification code");
                return;
            }
            setShowOtpModal(true);
            setAttempts(0);
            setOtpError("");
        } catch {
            setError("Network error while sending verification code.");
        } finally {
            setSendingOtp(false);
        }
    };

    const handleVerifyAndSave = async () => {
        if (!otp || otp.length < 6) {
            setOtpError("6-digit code required.");
            return;
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
                const nextAttempts = attempts + 1;
                setAttempts(nextAttempts);
                setOtpError(nextAttempts >= 3 ? "Access denied: 3 attempts failed." : `Incorrect. ${3 - nextAttempts} left.`);
                if (nextAttempts >= 3) {
                    setTimeout(() => {
                        setShowOtpModal(false);
                        setOtp("");
                    }, 2000);
                }
                return;
            }

            setSuccess("Password updated successfully.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setOtp("");
            setShowOtpModal(false);
            setTimeout(() => setSuccess(""), 4000);
            toast.success("Password updated successfully!");
        } catch {
            setOtpError("Verification failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FDFDFD] p-8 lg:p-12 text-gray-900 font-medium pb-24">
            <div className="max-w-6xl mx-auto space-y-2 mb-8">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full" />
                    <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
                </div>
                <p className="text-gray-500 font-medium ml-5">Manage your super-admin account and Google connection</p>
            </div>

            <div className="max-w-6xl mx-auto space-y-8">
                <SettingsCard title="Google Integration" description="Use Google OAuth to send platform emails.">
                    {isLoadingGoogle ? (
                        <div className="flex h-28 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                                    <Mail className="h-5 w-5 text-[#F97316]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Super Admin Gmail</h3>
                                    <p className="text-sm text-gray-500">
                                        {googleStatus.isConnected ? `Connected - ${googleStatus.email}` : "Connect Gmail to enable outbound mail"}
                                    </p>
                                </div>
                            </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={() => setIsDisconnectModalOpen(true)}
                                        disabled={isDisconnecting}
                                        className="bg-gray-900 text-white hover:bg-black disabled:opacity-50"
                                    >
                                        {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Disconnect"}
                                    </Button>

                                    <ActionConfirmModal
                                        isOpen={isDisconnectModalOpen}
                                        onClose={() => setIsDisconnectModalOpen(false)}
                                        onConfirm={async () => {
                                            setIsDisconnectModalOpen(false);
                                            setIsDisconnecting(true);
                                            try {
                                                const res = await fetch("/api/super-admin/integrations/google", { method: "DELETE" });
                                                if (res.ok) {
                                                    toast.success("Disconnected successfully");
                                                    setGoogleStatus({ isConnected: false, email: "" });
                                                } else {
                                                    toast.error("Failed to disconnect");
                                                }
                                            } catch (err) {
                                                toast.error("An error occurred during disconnection");
                                            } finally {
                                                setIsDisconnecting(false);
                                            }
                                        }}
                                        title="Disconnect Google Integration?"
                                        description="You will need to reconnect to send platform emails as Super Admin."
                                        confirmText="Disconnect"
                                        variant="danger"
                                    />
                                </div>
                            ) : (
                                <Button 
                                    onClick={() => { 
                                        window.location.href = "/api/super-admin/integrations/google/authorize?next=/super-admin/settings"; 
                                    }} 
                                    className="bg-gray-900 text-white hover:bg-black"
                                >
                                    Connect Gmail
                                </Button>
                            )}
                        </div>
                    )}
                </SettingsCard>

                <SettingsCard title="Update Password" description="Change your super-admin password with OTP verification.">
                    <form onSubmit={handleInitialSubmit} className="space-y-8">
                        <div className="grid gap-5 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Current Password</span>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                    <Input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="pl-10 pr-10 h-11" />
                                    <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300">
                                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </label>
                            <label className="space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">New Password</span>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                    <Input type={showNew ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pl-10 pr-10 h-11" />
                                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300">
                                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </label>
                        </div>

                        <label className="space-y-2 block">
                            <span className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Confirm New Password</span>
                            <div className="relative max-w-2xl">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                <Input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="pl-10 pr-10 h-11" />
                                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300">
                                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </label>

                        {error && (
                            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center gap-3">
                                <AlertCircle className="h-5 w-5" />
                                <span className="text-sm font-medium">{error}</span>
                            </div>
                        )}

                        {success && (
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center gap-3">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="text-sm font-medium">{success}</span>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button type="submit" disabled={sendingOtp || !currentPassword || !newPassword} className="bg-[#F97316] text-white hover:bg-orange-600">
                                {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Change Password
                            </Button>
                        </div>
                    </form>
                </SettingsCard>
            </div>

            {showOtpModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-white/30">
                    <div className="w-full max-w-lg bg-white border border-gray-100 rounded-[2rem] shadow-[0_50px_150px_rgba(0,0,0,0.15)] overflow-hidden">
                        <div className="p-10 space-y-8 text-center">
                            <div className="flex justify-center relative">
                                <button onClick={() => setShowOtpModal(false)} className="absolute -top-4 -right-4 p-2 rounded-full hover:bg-gray-50 text-gray-300 hover:text-gray-950">
                                    <span className="sr-only">Close</span>
                                    ×
                                </button>
                                <div className="h-20 w-20 rounded-[2rem] bg-orange-50 flex items-center justify-center text-[#F97316]">
                                    <ShieldAlert className="h-8 w-8" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black text-gray-950 tracking-tight">Authorization</h2>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">Enter the 6-digit code sent to your Gmail</p>
                            </div>
                            <div className="space-y-6">
                                <Input
                                    type="text"
                                    maxLength={6}
                                    value={otp}
                                    onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                                    placeholder="000000"
                                    className="w-full h-20 text-center text-4xl font-black tracking-[0.5em] bg-gray-50"
                                />
                                {otpError && (
                                    <div className="flex items-center justify-center gap-2 text-red-600 text-[10px] font-black uppercase tracking-widest">
                                        <ShieldAlert className="h-4 w-4" />
                                        {otpError}
                                    </div>
                                )}
                                <Button onClick={handleVerifyAndSave} disabled={loading || otp.length < 6} className="w-full h-14 bg-gray-950 text-white hover:bg-[#F97316]">
                                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                                    Verify and Save
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
