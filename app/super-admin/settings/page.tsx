"use client";

import { useState, useEffect } from "react";
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
    EyeOff,
    Globe,
    RefreshCw,
    Trash,
    Copy,
    Check,
    Zap,
    Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { cn } from "@/lib/utils";

/*  Section nav  */
const sections = [
    { id: "password", icon: Lock, label: "Password" },
    { id: "domains", icon: Globe, label: "Platform Domain" },
];

/*  Reusable card wrapper  */
function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-visible">
            <div className="px-8 py-6 border-b border-gray-50">
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                {description && <p className="text-[13px] text-gray-500 font-medium mt-1">{description}</p>}
            </div>
            <div className="px-8 py-8">{children}</div>
        </div>
    );
}

export default function SuperAdminSettingsPage() {
    const [activeSection, setActiveSection] = useState("password");
    
    // Password state
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [otp, setOtp] = useState("");
    
    // Domain state
    const [domainInfo, setDomainInfo] = useState<any>(null);
    const [isLoadingDomain, setIsLoadingDomain] = useState(false);
    const [newDomain, setNewDomain] = useState("");
    const [domainLinkError, setDomainLinkError] = useState("");
    const [emailSubStep, setEmailSubStep] = useState(0);
    const [copiedIndex, setCopiedIndex] = useState<{ i: number, type: 'host' | 'value' } | null>(null);
    const [domainCheckResult, setDomainCheckResult] = useState<"checking" | "verified" | "pending" | "error" | null>(null);
    const [isEditingSender, setIsEditingSender] = useState(false);
    const [senderDraft, setSenderDraft] = useState({ localPart: "", name: "" });
    const [showDomainDeleteConfirm, setShowDomainDeleteConfirm] = useState(false);

    const [showOtpModal, setShowOtpModal] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [loading, setLoading] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    
    const [error, setError] = useState("");
    const [otpError, setOtpError] = useState("");
    const [success, setSuccess] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleCopy = (text: string, i: number, type: 'host' | 'value') => {
        navigator.clipboard.writeText(text);
        setCopiedIndex({ i, type });
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const fetchDomainInfo = async (showResult = false) => {
        setIsLoadingDomain(true);
        if (showResult) setDomainCheckResult("checking");
        try {
            const res = await fetch("/api/super-admin/domain");
            const data = await res.json();
            if (!res.ok) {
                if (showResult) setDomainCheckResult("error");
                return;
            }
            if (!data.customDomain) {
                setDomainInfo(null);
                setEmailSubStep(0);
                if (showResult) setDomainCheckResult(null);
            } else {
                setDomainInfo(data);
                const isVerified = data.isDomainVerified || data.resendStatus === "verified";
                if (isVerified) {
                    setEmailSubStep(2);
                    if (showResult) setDomainCheckResult("verified");
                } else {
                    setEmailSubStep(1);
                    if (showResult) setDomainCheckResult("pending");
                }
            }
        } catch (err) {
            console.error("Domain fetch failed:", err);
            if (showResult) setDomainCheckResult("error");
        } finally {
            setIsLoadingDomain(false);
        }
    };

    const verifyDns = async () => {
        setIsLoadingDomain(true);
        setDomainCheckResult("checking");
        try {
            const res = await fetch("/api/super-admin/domain", { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
                setDomainCheckResult("error");
                return;
            }
            setDomainInfo(data);
            const isVerified = data.isDomainVerified || data.resendStatus === "verified";
            if (isVerified) {
                setEmailSubStep(2);
                setDomainCheckResult("verified");
            } else {
                setEmailSubStep(1);
                setDomainCheckResult("pending");
            }
        } catch (err) {
            console.error("DNS verification failed:", err);
            setDomainCheckResult("error");
        } finally {
            setIsLoadingDomain(false);
        }
    };

    useEffect(() => {
        fetchDomainInfo();
    }, []);

    const handleInitialSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        
        if (newPassword !== confirmPassword) {
            setError("New passwords do not match"); return;
        }

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters"); return;
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
                    {sections.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setActiveSection(s.id)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all",
                                activeSection === s.id
                                    ? "bg-orange-50 text-[#F97316] font-semibold shadow-sm"
                                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                            )}
                        >
                            <s.icon className={cn("h-4 w-4", activeSection === s.id ? "text-[#F97316]" : "text-gray-400")} />
                            <span className="text-[13px]">{s.label}</span>
                        </button>
                    ))}
                    <div className="h-px bg-gray-50 my-1 mx-2" />
                    <div className="px-4 py-4 text-gray-300 text-[10px] font-medium text-center uppercase tracking-widest">Version 1.0.6</div>
                </aside>

                <div className="space-y-12 min-h-[600px]">
                    {/* Password Section */}
                    {activeSection === "password" && (
                        <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm relative pb-32 animate-in slide-in-from-bottom-2 duration-300">
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
                                                placeholder="8+ Mix. Characters"
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

                                {/* CTA Button */}
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
                    )}

                    {/* Domains Section */}
                    {activeSection === "domains" && (
                        <div className="animate-in slide-in-from-bottom-2 duration-300 space-y-8">
                            <SettingsCard
                                title="Platform Email Domain"
                                description="Connect a global domain for all platform emails (OTP, invitations, system alerts)."
                            >
                                {!domainInfo ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 mb-2">
                                            <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                                            <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">Register System Domain</h3>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="relative flex-1">
                                                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    className="pl-10 h-12 rounded-2xl border-gray-100 bg-white shadow-sm font-bold text-[13px] focus:ring-4 focus:ring-orange-50 focus:border-[#F97316] placeholder:font-medium placeholder:text-gray-300 transition-all"
                                                    placeholder="DOMAIN.COM"
                                                    value={newDomain}
                                                    onChange={e => { setNewDomain(e.target.value.toLowerCase()); setDomainLinkError(""); }}
                                                />
                                            </div>
                                            <Button
                                                disabled={isLoadingDomain || !newDomain}
                                                onClick={async () => {
                                                    setIsLoadingDomain(true);
                                                    setDomainLinkError("");
                                                    try {
                                                        const res = await fetch("/api/super-admin/setup/domain", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ domain: newDomain })
                                                        });
                                                        const json = await res.json();
                                                        if (res.ok) {
                                                            fetchDomainInfo();
                                                        } else {
                                                            setDomainLinkError(json.error || "Failed to link domain.");
                                                        }
                                                    } finally { setIsLoadingDomain(false); }
                                                }}
                                                className="h-12 px-8 rounded-2xl bg-gray-950 text-white hover:bg-black shadow-xl transition-all font-bold text-[11px] uppercase tracking-widest disabled:opacity-30"
                                            >
                                                {isLoadingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link Domain"}
                                            </Button>
                                        </div>
                                        {domainLinkError && (
                                            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                                                <p className="text-[11px] font-bold text-red-600 tracking-wide">{domainLinkError}</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between p-6 rounded-[2rem] bg-gradient-to-r from-gray-900 via-gray-800 to-gray-950 text-white shadow-2xl relative overflow-hidden">
                                            <div className="flex items-center gap-6 relative z-10">
                                                <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/[0.08]">
                                                    <Globe className="h-7 w-7 text-white" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <p className="text-xl font-black uppercase italic leading-none">{domainInfo.customDomain}</p>
                                                        <Badge className={cn("text-[8px] font-black uppercase px-2 py-0.5 border-0 rounded-md tracking-widest",
                                                            emailSubStep === 2 ? "bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]" : "bg-orange-500 text-white"
                                                        )}>
                                                            {emailSubStep === 2 ? "Verified" : "Handshake Required"}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-[10px] uppercase font-bold text-gray-400 mt-2 tracking-widest leading-none">Global Platform Entity</p>
                                                </div>
                                            </div>
                                            <div className="relative z-10 flex items-center gap-2">
                                                {emailSubStep === 2 && (
                                                    <button
                                                        onClick={() => {
                                                            setSenderDraft({
                                                                localPart: domainInfo.customSenderEmail ? domainInfo.customSenderEmail.split("@")[0] : "",
                                                                name: domainInfo.customSenderName || ""
                                                            });
                                                            setIsEditingSender(v => !v);
                                                        }}
                                                        className="h-10 px-4 flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-white text-[10px] font-bold uppercase tracking-widest"
                                                    >
                                                        <Mail className="h-3.5 w-3.5" />
                                                        {isEditingSender ? "Cancel" : "Edit Sender"}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setShowDomainDeleteConfirm(true)}
                                                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-red-500 transition-all text-white/50 hover:text-white"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {emailSubStep === 1 && domainInfo.records && (
                                            <div className="space-y-6 pt-2">
                                                <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden shadow-sm bg-white">
                                                    <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex text-[10px] font-bold uppercase text-gray-500 tracking-widest leading-none">
                                                        <div className="w-[10%]">Type</div>
                                                        <div className="w-[20%]">Host Name</div>
                                                        <div className="flex-1">Value</div>
                                                        <div className="w-[14%] text-center">Status</div>
                                                    </div>
                                                    {domainInfo.records.map((rec: any, i: number) => (
                                                        <div key={i} className="flex items-start px-4 py-3 bg-white hover:bg-orange-50/10 transition-all">
                                                            <div className="w-[10%] pt-1.5"><Badge className="bg-gray-900 text-white border-0 text-[9px] font-black italic px-2 py-0.5 rounded tracking-widest">{rec.type}</Badge></div>
                                                            <div className="w-[20%] pr-3">
                                                                <div onClick={() => handleCopy(rec.name || "@", i, 'host')} className="relative flex min-h-[32px] w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-900 cursor-pointer hover:border-[#F97316]/50 transition-all group/host">
                                                                    <span className="font-sans font-bold break-all uppercase leading-tight truncate">{rec.name || "@"}</span>
                                                                    {copiedIndex?.i === i && copiedIndex?.type === 'host' ? <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <Copy className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover/host:opacity-100 transition-opacity shrink-0" />}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 pr-3 min-w-0">
                                                                <div onClick={() => handleCopy(rec.value, i, 'value')} className="relative flex min-h-[32px] w-full items-start justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-900 cursor-pointer hover:border-[#F97316]/50 transition-all group/val">
                                                                    <span className="font-sans font-medium break-all leading-relaxed line-clamp-2">{rec.value}</span>
                                                                    {copiedIndex?.i === i && copiedIndex?.type === 'value' ? <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" /> : <Copy className="h-3.5 w-3.5 mt-0.5 text-gray-400 opacity-0 group-hover/val:opacity-100 transition-opacity shrink-0" />}
                                                                </div>
                                                            </div>
                                                            <div className="w-[14%] pt-1.5 flex justify-center">
                                                                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border", 
                                                                    rec.status === "verified" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"
                                                                )}>
                                                                    {rec.status === "verified" ? <Check className="h-2.5 w-2.5" /> : null} {rec.status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <Button onClick={verifyDns} disabled={isLoadingDomain} className="h-10 px-8 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 text-gray-900 font-bold text-[10px] uppercase tracking-widest shadow-sm flex items-center gap-2 w-fit">
                                                        {isLoadingDomain ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 text-[#F97316]" />}
                                                        {isLoadingDomain ? "Verifying..." : "Verify DNS"}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {emailSubStep === 2 && (() => {
                                            const showForm = !domainInfo.customSenderEmail || isEditingSender;
                                            return (
                                                <div className="pt-2 space-y-4">
                                                    {showForm && (
                                                        <div className="space-y-5 p-6 rounded-2xl bg-gray-50/50 border border-gray-100">
                                                            <div className="space-y-4">
                                                                <div className="space-y-1.5">
                                                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Global Sender Name</label>
                                                                    <input className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-medium shadow-sm focus:border-[#F97316] outline-none transition-all"
                                                                        placeholder="Lumoscale Security" value={senderDraft.name} onChange={e => setSenderDraft(prev => ({ ...prev, name: e.target.value }))} />
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Global Sender Email</label>
                                                                    <div className="flex gap-2">
                                                                        <input className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-[14px] font-medium focus:border-[#F97316] outline-none"
                                                                            placeholder="security" value={senderDraft.localPart} onChange={e => setSenderDraft(prev => ({ ...prev, localPart: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") }))} />
                                                                        <div className="flex items-center px-4 bg-gray-100 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold">@{domainInfo.customDomain}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <Button disabled={isSaving || !senderDraft.localPart} onClick={async () => {
                                                                    const finalEmail = `${senderDraft.localPart}@${domainInfo.customDomain}`;
                                                                    setIsSaving(true);
                                                                    try {
                                                                        await fetch("/api/super-admin/domain", {
                                                                            method: "PATCH",
                                                                            headers: { "Content-Type": "application/json" },
                                                                            body: JSON.stringify({ customSenderEmail: finalEmail, customSenderName: senderDraft.name })
                                                                        });
                                                                        fetchDomainInfo();
                                                                        setIsEditingSender(false);
                                                                    } finally { setIsSaving(false); }
                                                                }} className="h-10 px-6 bg-gray-950 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest shadow-xl">
                                                                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Platform Identity"}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {domainInfo.customSenderEmail && !isEditingSender && (
                                                        <div className="flex items-center gap-6 px-6 py-4 rounded-2xl bg-gray-50 border border-gray-100">
                                                            <div className="flex-1"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Global Sender</p><p className="text-[14px] font-bold text-gray-900">{domainInfo.customSenderName} &lt;{domainInfo.customSenderEmail}&gt;</p></div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </SettingsCard>
                        </div>
                    )}
                </div>

                <ActionConfirmModal
                    isOpen={showDomainDeleteConfirm}
                    onClose={() => setShowDomainDeleteConfirm(false)}
                    title="Disconnect Platform Domain"
                    description="This will immediately cease all platform emails from this domain. Are you sure?"
                    confirmText="Disconnect Domain"
                    onConfirm={async () => {
                        try {
                            const res = await fetch("/api/super-admin/domain", { method: "DELETE" });
                            if (res.ok) fetchDomainInfo();
                        } finally { setShowDomainDeleteConfirm(false); }
                    }}
                />
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

