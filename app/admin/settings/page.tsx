"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    User, Building2, Lock, Globe, Mail, ShieldAlert,
    AlertCircle, Zap, Loader2, X, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminOrg } from "@/context/admin-org-context";
import { useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { reportClientError } from "@/lib/client-error-reporter";
import { PasswordInput } from "@/components/ui/password-input";
import { SettingsCard, Field } from "@/components/admin/settings/settings-shared";
const sections = [
    { id: "account", icon: User, label: "Account" },
    { id: "password", icon: Lock, label: "Password" },
];
export default function SettingsPage() {
    const adminOrg = useAdminOrg();
    const searchParams = useSearchParams();
    const [activeSection, setActiveSection] = useState("account");
    useEffect(() => {
        const section = searchParams.get("section");
        // map legacy "profile" / "company" deep-links to "account"
        const mapped = section === "profile" || section === "company" ? "account" : section;
        if (mapped && sections.some(s => s.id === mapped)) setActiveSection(mapped);
    }, [searchParams]);
    const [isLoading, setIsLoading] = useState(true);
    const [profile, setProfile] = useState({ name: "", email: "" });
    const [company, setCompany] = useState({
        name: adminOrg?.name || "",
    });
    const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
    const [isNewPasswordValid, setIsNewPasswordValid] = useState(false);
    const [pwError, setPwError] = useState("");
    const [pwSaved, setPwSaved] = useState(false);
    const [otp, setOtp] = useState("");
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpError, setOtpError] = useState("");
    const [otpAttempts, setOtpAttempts] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    useEffect(() => {
        const fetchAll = async () => {
            try {
                const profileRes = await fetch("/api/auth/profile");
                if (profileRes.ok) {
                    const d = await profileRes.json();
                    setProfile({ name: d.name || "", email: d.email || "" });
                }
            } catch (err) {
                console.error("Profile fetch failed:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAll();
    }, []);
    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                fetch("/api/auth/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: profile.name }),
                }),
                fetch("/api/admin/organization", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(company),
                }),
            ]);
            setSaved(true);
            toast.success("Settings saved!");
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save settings.");
            reportClientError(err, { action: "save_settings" });
        } finally {
            setIsSaving(false);
        }
    };
    const handlePasswordSave = async () => {
        if (!passwords.current) { setPwError("Current password is required."); return; }
        if (passwords.next.length < 8) { setPwError("New password must be at least 8 characters."); return; }
        if (passwords.next !== passwords.confirm) { setPwError("Passwords do not match."); return; }
        setSendingOtp(true);
        setPwError("");
        try {
            const res = await fetch("/api/auth/otp/send", { method: "POST" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setPwError(data.error || "Failed to send verification code");
                toast.error(data.error || "Failed to send verification code");
                return;
            }
            setShowOtpModal(true);
            setOtpAttempts(0);
            setOtpError("");
            setOtp("");
        } catch {
            setPwError("Network error while sending verification code.");
            toast.error("Network error while sending verification code.");
        } finally {
            setSendingOtp(false);
        }
    };
    const handleVerifyAndSavePassword = async () => {
        if (!otp || otp.length < 6) { setOtpError("6-digit code required."); return; }
        setIsSaving(true);
        setOtpError("");
        try {
            const res = await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next, otp }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const nextAttempts = otpAttempts + 1;
                setOtpAttempts(nextAttempts);
                setOtpError(nextAttempts >= 3 ? "Access denied: 3 attempts failed." : (data.error || `Incorrect. ${3 - nextAttempts} left.`));
                if (nextAttempts >= 3) setTimeout(() => { setShowOtpModal(false); setOtp(""); }, 2000);
                return;
            }
            setPwSaved(true);
            setPasswords({ current: "", next: "", confirm: "" });
            setOtp("");
            setShowOtpModal(false);
            toast.success("Password updated successfully!");
            setTimeout(() => setPwSaved(false), 2500);
        } catch {
            setOtpError("Verification failed.");
        } finally {
            setIsSaving(false);
        }
    };
    if (isLoading) {
        return (
            <div className="flex h-[450px] items-center justify-center">
                <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
            </div>
        );
    }
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            <div className="space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Settings</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Manage your account and preferences</p>
                </div>
                <div className="flex gap-8 items-start">
                    {/* Left Nav */}
                    <aside className="w-56 flex-shrink-0 sticky top-8">
                        <div className="bg-white rounded-xl p-2 space-y-0.5" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                            {sections.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSection(s.id)}
                                    className={cn(
                                        "flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all duration-200",
                                        activeSection === s.id
                                            ? "text-violet-600 bg-violet-50"
                                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                    )}
                                >
                                    <s.icon className={cn("h-4 w-4 transition-colors", activeSection === s.id ? "text-violet-600" : "text-gray-400")} />
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </aside>
                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-6">
                        {/* ACCOUNT — profile + company merged */}
                        {activeSection === "account" && (
                            <div className="space-y-6">
                                {/* Personal */}
                                <SettingsCard title="Personal Information" description="Your name and login email.">
                                    <div className="grid grid-cols-1 gap-5">
                                        <Field label="Full Name">
                                            <div className="relative">
                                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    className="pl-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition-all"
                                                    value={profile.name}
                                                    onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                                                />
                                            </div>
                                        </Field>
                                        <Field label="Email Address">
                                            <div className="relative">
                                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    disabled
                                                    type="email"
                                                    className="pl-10 h-10 rounded-lg border-gray-200 bg-gray-50 font-medium opacity-60"
                                                    value={profile.email}
                                                />
                                            </div>
                                        </Field>
                                    </div>
                                </SettingsCard>
                                {/* Company */}
                                <SettingsCard title="Company Details" description="Your organization name.">
                                    <div className="grid grid-cols-1 gap-5">
                                        <Field label="Company Name">
                                            <div className="relative">
                                                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    className="pl-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition-all"
                                                    value={company.name}
                                                    onChange={e => setCompany(c => ({ ...c, name: e.target.value }))}
                                                />
                                            </div>
                                        </Field>
                                    </div>
                                </SettingsCard>
                                {/* Save */}
                                <div className="flex justify-end pt-2">
                                    <Button onClick={handleSave} disabled={isSaving} className={cn("h-10 px-8 rounded-xl font-medium text-sm transition-all", saved ? "bg-emerald-500 text-white" : "text-white")} style={!saved ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" } : undefined}>
                                        {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                        {saved ? "Changes Saved" : "Save Changes"}
                                    </Button>
                                </div>
                            </div>
                        )}
                        {/* PASSWORD */}
                        {activeSection === "password" && (
                            <div className="space-y-6">
                                <SettingsCard title="Change Password" description="Update your password to keep your account secure.">
                                    <div className="space-y-6">
                                        <PasswordInput
                                            label="Current Password"
                                            placeholder="Enter current password"
                                            value={passwords.current}
                                            onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                                        />
                                        <PasswordInput
                                            label="New Password"
                                            placeholder="Enter new password"
                                            value={passwords.next}
                                            onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))}
                                            showChecklist
                                            onValidationChange={setIsNewPasswordValid}
                                        />
                                        <PasswordInput
                                            label="Confirm New Password"
                                            placeholder="Re-enter new password"
                                            value={passwords.confirm}
                                            onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                                        />
                                        {pwSaved && (
                                            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 animate-in fade-in slide-in-from-top-1">
                                                <CheckCircle2 className="h-4 w-4" />
                                                <span className="text-[12px] font-bold">Password updated successfully!</span>
                                            </div>
                                        )}
                                        {pwError && (
                                            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-600 animate-in fade-in slide-in-from-top-1">
                                                <AlertCircle className="h-4 w-4" />
                                                <span className="text-[12px] font-bold">{pwError}</span>
                                            </div>
                                        )}
                                        <div className="pt-2">
                                            <button
                                                onClick={() => { window.location.href = "/login/forgot-password?from=settings"; }}
                                                className="text-xs font-bold text-violet-600 hover:underline flex items-center gap-1.5"
                                            >
                                                <Zap className="h-3 w-3" />
                                                Forgot current password? Recover account
                                            </button>
                                        </div>
                                    </div>
                                </SettingsCard>
                                <div className="flex justify-end pt-4">
                                    <Button onClick={handlePasswordSave} disabled={sendingOtp} className={cn("h-10 px-8 rounded-xl font-medium text-sm transition-all", pwSaved ? "bg-emerald-500 text-white" : "text-white")} style={!pwSaved ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" } : undefined}>
                                        {sendingOtp && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                        {pwSaved ? "Password Updated" : "Update Password"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* Modals */}
                {showOtpModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-white/30">
                        <div className="w-full max-w-lg bg-white border border-gray-100 rounded-[2rem] shadow-[0_50px_150px_rgba(0,0,0,0.15)] overflow-hidden">
                            <div className="p-10 space-y-8 text-center">
                                <div className="flex justify-center relative">
                                    <button onClick={() => setShowOtpModal(false)} className="absolute -top-4 -right-4 p-2 rounded-full hover:bg-gray-50 text-gray-300 hover:text-gray-950">
                                        <X className="h-6 w-6" />
                                    </button>
                                    <div className="h-20 w-20 rounded-[2rem] bg-violet-50 flex items-center justify-center text-violet-600">
                                        <ShieldAlert className="h-8 w-8" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-3xl font-black text-gray-950 tracking-tight">Authorization</h2>
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">Enter the 6-digit code sent to your email</p>
                                </div>
                                <div className="space-y-6">
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={otp}
                                        onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                                        placeholder="000000"
                                        className="w-full h-20 text-center text-4xl font-black tracking-[0.5em] bg-gray-50 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
                                    />
                                    {otpError && (
                                        <div className="flex items-center justify-center gap-2 text-red-600 text-[10px] font-black uppercase tracking-widest">
                                            <AlertCircle className="h-4 w-4" />
                                            {otpError}
                                        </div>
                                    )}
                                    <Button onClick={handleVerifyAndSavePassword} disabled={isSaving || otp.length < 6} className="w-full h-14 bg-gray-950 text-white hover:bg-violet-600 rounded-2xl font-bold text-lg">
                                        {isSaving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                                        Verify and Save
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
