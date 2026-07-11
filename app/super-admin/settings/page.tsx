"use client";
import type { ReactNode } from "react";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-custom";
import { PasswordInput } from "@/components/ui/password-input";
function SettingsCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <div className="bg-white rounded-2xl overflow-hidden animate-in fade-in duration-500" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
            <div className="px-8 py-6 border-b border-gray-50">
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                {description && <p className="text-[13px] text-gray-500 font-medium mt-1 leading-relaxed">{description}</p>}
            </div>
            <div className="px-8 py-8">{children}</div>
        </div>
    );
}
function TestKeyCard() {
    const [newKey, setNewKey] = useState("");
    const [otp, setOtp] = useState("");
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [loading, setLoading] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [error, setError] = useState("");
    const [otpError, setOtpError] = useState("");
    const [success, setSuccess] = useState("");

    const handleInitialSubmit = async (e: { preventDefault: () => void }) => {
        e.preventDefault();
        setError("");
        if (newKey.trim().length < 4) {
            setError("Key must be at least 4 characters");
            return;
        }
        setSendingOtp(true);
        try {
            const res = await fetch("/api/super-admin/settings/test-key", { method: "POST" });
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
            const res = await fetch("/api/super-admin/settings/test-key", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newKey, otp }),
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
            setSuccess("Test access key updated successfully.");
            setNewKey("");
            setOtp("");
            setShowOtpModal(false);
            setTimeout(() => setSuccess(""), 4000);
            toast.success("Test access key updated!");
        } catch {
            setOtpError("Verification failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SettingsCard title="Test Access Key" description="Controls access to the /test developer sandbox. Requires OTP verification to change.">
            <form onSubmit={handleInitialSubmit} className="space-y-6">
                <PasswordInput
                    label="New Test Key"
                    placeholder="Enter new test key"
                    value={newKey}
                    onChange={e => setNewKey(e.target.value)}
                />
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
                    <Button type="submit" disabled={sendingOtp || newKey.trim().length < 4} className="bg-[#7C3AED] text-white hover:bg-violet-600 font-bold px-8 h-11">
                        {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Update Test Key
                    </Button>
                </div>
            </form>
            {showOtpModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-white/30">
                    <div className="w-full max-w-lg bg-white border border-gray-100 rounded-[2rem] shadow-[0_50px_150px_rgba(0,0,0,0.15)] overflow-hidden">
                        <div className="p-10 space-y-8 text-center">
                            <div className="flex justify-center relative">
                                <button onClick={() => setShowOtpModal(false)} className="absolute -top-4 -right-4 p-2 rounded-full hover:bg-gray-50 text-gray-300 hover:text-gray-950">
                                    <span className="sr-only">Close</span>
                                    ×
                                </button>
                                <div className="h-20 w-20 rounded-[2rem] bg-violet-50 flex items-center justify-center text-[#7C3AED]">
                                    <ShieldAlert className="h-8 w-8" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black text-gray-950 tracking-tight">Authorization</h2>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">Enter the 6-digit code sent to your email</p>
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
                                <Button onClick={handleVerifyAndSave} disabled={loading || otp.length < 6} className="w-full h-14 bg-gray-950 text-white hover:bg-[#7C3AED]">
                                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                                    Verify and Save
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </SettingsCard>
    );
}
export default function SuperAdminSettingsPage() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [loading, setLoading] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [error, setError] = useState("");
    const [otpError, setOtpError] = useState("");
    const [success, setSuccess] = useState("");
    const [isNewPasswordValid, setIsNewPasswordValid] = useState(false);
    const handleInitialSubmit = async (e: { preventDefault: () => void }) => {
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
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Settings</h1>
                <p className="text-sm text-gray-400 mt-0.5">Manage your super-admin account</p>
            </div>
            <div className="max-w-2xl space-y-6">
                <SettingsCard title="Update Password" description="Change your super-admin password with OTP verification.">
                    <form onSubmit={handleInitialSubmit} className="space-y-8">
                        <div className="grid gap-6 md:grid-cols-2">
                            <PasswordInput
                                label="Current Password"
                                placeholder="Enter current password"
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                            />
                            <PasswordInput
                                label="New Password"
                                placeholder="Enter new password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                showChecklist
                                onValidationChange={setIsNewPasswordValid}
                            />
                        </div>
                        <div className="max-w-2xl space-y-4">
                            <PasswordInput
                                label="Confirm New Password"
                                placeholder="Re-enter new password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                            />
                            <div className="pt-1">
                                <button
                                    type="button"
                                    onClick={() => { window.location.href = "/login/forgot-password?from=super-settings"; }}
                                    className="text-xs font-bold text-[#7C3AED] hover:underline flex items-center gap-1.5"
                                >
                                    <Zap className="h-3 w-3" />
                                    Forgot current password? Recover account
                                </button>
                            </div>
                        </div>
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
                            <Button type="submit" disabled={sendingOtp || !currentPassword || !isNewPasswordValid || newPassword !== confirmPassword} className="bg-[#7C3AED] text-white hover:bg-violet-600 font-bold px-8 h-11">
                                {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Change Password
                            </Button>
                        </div>
                    </form>
                </SettingsCard>
                <TestKeyCard />
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
                                <div className="h-20 w-20 rounded-[2rem] bg-violet-50 flex items-center justify-center text-[#7C3AED]">
                                    <ShieldAlert className="h-8 w-8" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black text-gray-950 tracking-tight">Authorization</h2>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">Enter the 6-digit code sent to your email</p>
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
                                <Button onClick={handleVerifyAndSave} disabled={loading || otp.length < 6} className="w-full h-14 bg-gray-950 text-white hover:bg-[#7C3AED]">
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
