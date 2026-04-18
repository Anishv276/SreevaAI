"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    User, Building2, Bell, Users, CreditCard, Plug,
    Camera, Check, ChevronRight, Plus, Trash2, Crown,
    MessageSquare, Calendar, Globe, Mail, Phone, Shield, Briefcase, History,
    BarChart3, AlertCircle, Zap, ExternalLink, Upload, Lock, Eye, EyeOff,
    Loader2, Copy, X, MapPin as MapPinIcon
} from "lucide-react";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { PhoneInput } from "@/components/application/phone-input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";

/* ── Section nav ──────────────────────────────────── */
const sections = [
    { id: "profile", icon: User, label: "Profile" },
    { id: "company", icon: Building2, label: "Company" },
    { id: "team", icon: Users, label: "Team Members" },
    { id: "password", icon: Lock, label: "Password" },
];

type TeamMember = {
    id: string;
    name: string | null;
    email: string;
    role: "ADMIN" | "HR" | "TEAM";
};

type PendingInvite = {
    id: string;
    email: string;
    orgRole: "ADMIN" | "HR" | "TEAM";
    expiresAt: string;
    createdAt: string;
};

type TeamResponse = {
    members: TeamMember[];
    pendingInvites: PendingInvite[];
};

/* ── Reusable card wrapper ────────────────────────── */
function SettingsCard({ title, description, children, icon: Icon }: { title: string; description?: string; children: React.ReactNode; icon?: any }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-5 w-5 text-gray-400" />}
                        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    </div>
                    {description && <p className="text-sm text-gray-500 font-medium mt-1">{description}</p>}
                </div>
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    );
}

/* ── Field wrapper ────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">{label}</Label>
            {children}
        </div>
    );
}

/* ── Toggle ───────────────────────────────────────── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
        <button
            type="button"
            onClick={onChange}
            className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none",
                checked ? "bg-[#F97316] shadow-[0_0_12px_rgba(249,115,22,0.3)]" : "bg-gray-200"
            )}
        >
            <span
                className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-300",
                    checked ? "translate-x-6" : "translate-x-1"
                )}
            />
        </button>
    );
}

/* ── Main Page ────────────────────────────────────── */
export default function SettingsPage() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const [activeSection, setActiveSection] = useState("profile");

    useEffect(() => {
        const section = searchParams.get("section");
        if (section && sections.some(s => s.id === section)) {
            setActiveSection(section);
        }
    }, [searchParams]);
    const [isLoading, setIsLoading] = useState(true);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);

    /* Profile */
    const [profile, setProfile] = useState({ name: "", email: "", phone: "", jobTitle: "" });

    /* Company */
    const [company, setCompany] = useState({
        name: "",
        industry: "SAAS / TECHNOLOGY",
        size: "51–250 EMPLOYEES",
        website: "",
        location: "",
        logoUrl: "",
        customSenderEmail: "",
        customSenderName: ""
    });


    /* Team */
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("HR");
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
    const [isInviting, setIsInviting] = useState(false);
    const [inviteMessage, setInviteMessage] = useState("");
    const [inviteError, setInviteError] = useState("");

    // Modal States
    const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
    const [isLogoPreviewOpen, setIsLogoPreviewOpen] = useState(false);
    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [memberToRemoveId, setMemberToRemoveId] = useState<string | null>(null);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteToCancelId, setInviteToCancelId] = useState<string | null>(null);
    const [isProcessingAction, setIsProcessingAction] = useState(false);

    /* Password */
    const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
    const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
    const [pwError, setPwError] = useState("");
    const [pwSaved, setPwSaved] = useState(false);

    /* Global Saving */
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    /* Domains */
    const [domainInfo, setDomainInfo] = useState<any>(null);
    const [isLoadingDomain, setIsLoadingDomain] = useState(false);
    const [newDomain, setNewDomain] = useState("");
    const [copiedIndex, setCopiedIndex] = useState<{ i: number, type: 'host' | 'value' } | null>(null);
    const [emailSubStep, setEmailSubStep] = useState(0);
    const [domainLinkError, setDomainLinkError] = useState("");
    const [isEditingSender, setIsEditingSender] = useState(false);
    const [senderDraft, setSenderDraft] = useState({ localPart: "", name: "" });
    const [showDomainDeleteConfirm, setShowDomainDeleteConfirm] = useState(false);
    const [domainCheckResult, setDomainCheckResult] = useState<"checking" | "verified" | "pending" | "error" | null>(null);

    /* Integrations */
    const [googleStatus, setGoogleStatus] = useState<{ isConnected: boolean, email: string | null }>({ isConnected: false, email: null });
    const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);

    const fetchGoogleStatus = async () => {
        try {
            const res = await fetch("/api/admin/integrations/google");
            if (res.ok) {
                const data = await res.json();
                setGoogleStatus(data);
            }
        } catch (err) {
            console.error("Failed to fetch Google status:", err);
        }
    };

    const handleCopy = (text: string, i: number, type: 'host' | 'value') => {
        navigator.clipboard.writeText(text);
        setCopiedIndex({ i, type });
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const fetchDomainInfo = async (showResult = false) => {
        setIsLoadingDomain(true);
        if (showResult) setDomainCheckResult("checking");
        try {
            const res = await fetch("/api/admin/organization/domain");
            const data = await res.json();
            if (!res.ok) {
                console.error("Domain fetch error:", data?.error);
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
            const res = await fetch("/api/admin/organization/domain", { method: "POST" });
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

    const pwStrength = (pw: string) => {
        if (pw.length === 0) return 0;
        let s = 0;
        if (pw.length >= 8) s++;
        if (/[A-Z]/.test(pw)) s++;
        if (/[0-9]/.test(pw)) s++;
        if (/[^A-Za-z0-9]/.test(pw)) s++;
        return s;
    };
    const strengthLabel = ["Too short", "Weak", "Fair", "Good", "Strong"];
    const strengthColor = ["bg-red-400", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-500"];

    const loadTeamData = async () => {
        const teamRes = await fetch("/api/admin/team");
        if (!teamRes.ok) return;
        const teamData = await teamRes.json();

        if (Array.isArray(teamData)) {
            // Backward-compatible fallback
            setTeam(teamData);
            setPendingInvites([]);
            return;
        }

        const typedData = teamData as TeamResponse;
        setTeam(Array.isArray(typedData.members) ? typedData.members : []);
        setPendingInvites(Array.isArray(typedData.pendingInvites) ? typedData.pendingInvites : []);
    };

    // Fetch initial data
    useEffect(() => {
        const fetchAll = async () => {
            try {
                // Fetch basic org data first
                const orgRes = await fetch("/api/admin/organization");
                if (orgRes.ok) {
                    const data = await orgRes.json();
                    setCompany({
                        name: data.name || "",
                        industry: data.industry || "SAAS / TECHNOLOGY",
                        size: data.size || "1–50 EMPLOYEES",
                        website: data.website || "",
                        location: data.location || "",
                        logoUrl: data.logoUrl || "",
                        customSenderEmail: data.customSenderEmail || "",
                        customSenderName: data.customSenderName || ""
                    });
                }

                // Fetch detailed personal profile
                const profileRes = await fetch("/api/auth/profile");
                if (profileRes.ok) {
                    const profData = await profileRes.json();
                    setProfile({
                        name: profData.name || "",
                        email: profData.email || "",
                        phone: profData.phone || "",
                        jobTitle: profData.jobTitle || ""
                    });
                }
            } catch (err) {
                console.error("Org data fetch failed:", err);
            } finally {
                setIsLoading(false);
            }

            // Fetch secondary data in background
            Promise.allSettled([
                loadTeamData(),
                fetchDomainInfo(),
                fetchGoogleStatus()
            ]).catch(err => console.error("Secondary fetch failed:", err));
        };

        fetchAll();
    }, [user]);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingLogo(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload/logo", { method: "POST", body: formData });
            if (res.ok) {
                const { url } = await res.json();
                setCompany(prev => {
                    const updated = { ...prev, logoUrl: url };
                    // Auto-save the logo change?
                    fetch("/api/admin/organization", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(updated)
                    }).catch(err => console.error("Logo auto-save failed:", err));
                    return updated;
                });
            }
        } catch (err) {
            console.error("Upload Error:", err);
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const handleLogoDelete = () => setIsLogoModalOpen(true);

    const confirmLogoDelete = async () => {
        if (!company.logoUrl) return;
        setIsProcessingAction(true);
        try {
            // 1. Evict from Cloudflare R2
            await fetch("/api/upload/logo", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: company.logoUrl }),
            });

            // 2. Clear from Organization Record
            setCompany(prev => {
                const updated = { ...prev, logoUrl: "" };
                fetch("/api/admin/organization", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updated)
                }).catch(err => console.error("Logo delete auto-save failed:", err));
                return updated;
            });

            setIsLogoModalOpen(false);
        } catch (err) {
            console.error("Delete Error:", err);
        } finally {
            setIsProcessingAction(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (activeSection === "company") {
                await fetch("/api/admin/organization", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(company)
                });
            } else if (activeSection === "profile") {
                await fetch("/api/auth/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: profile.name, phone: profile.phone, jobTitle: profile.jobTitle })
                });
            }
            setSaved(true);
            toast.success(`${activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} updated successfully!`);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            console.error(err);
            toast.error("Failed to update settings.");
        } finally {
            setIsSaving(false);
        }
    };

    const handlePasswordSave = async () => {
        if (!passwords.current) { setPwError("Current password is required."); return; }
        if (passwords.next.length < 8) { setPwError("New password must be at least 8 characters."); return; }
        if (passwords.next !== passwords.confirm) { setPwError("Passwords do not match."); return; }

        setIsSaving(true);
        setPwError("");
        try {
            const res = await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next }),
            });
            if (res.ok) {
                setPwSaved(true);
                setPasswords({ current: "", next: "", confirm: "" });
                toast.success("Password updated successfully!");
                setTimeout(() => setPwSaved(false), 2500);
            } else {
                const data = await res.json();
                setPwError(data.error || "Update failed");
                toast.error(data.error || "Failed to update password");
            }
        } catch {
            setPwError("Network error");
            toast.error("Network error. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleInviteSubmit = async () => {
        if (!inviteEmail) return;
        setInviteMessage("");
        setInviteError("");
        setIsInviting(true);
        try {
            const res = await fetch("/api/admin/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setInviteEmail("");
                await loadTeamData();
                setInviteMessage(data.warning || "Invitation sent successfully.");
            } else {
                setInviteError(data.error || "Failed to send invite.");
            }
        } catch (error) { console.error(error); }
        finally { setIsInviting(false); }
    };

    const cancelInvite = (id: string) => {
        setInviteToCancelId(id);
        setIsInviteModalOpen(true);
    };

    const confirmCancelInvite = async () => {
        if (!inviteToCancelId) return;
        setIsProcessingAction(true);
        try {
            const res = await fetch(`/api/admin/team/invites/${inviteToCancelId}`, { method: "DELETE" });
            if (res.ok) {
                setPendingInvites((current) => current.filter((invite) => invite.id !== inviteToCancelId));
                setIsInviteModalOpen(false);
                setInviteToCancelId(null);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessingAction(false);
        }
    };

    const removeMember = (id: string) => {
        setMemberToRemoveId(id);
        setIsMemberModalOpen(true);
    };

    const confirmRemoveMember = async () => {
        if (!memberToRemoveId) return;
        setIsProcessingAction(true);
        try {
            const res = await fetch(`/api/admin/team/${memberToRemoveId}`, { method: "DELETE" });
            if (res.ok) {
                setTeam(t => t.filter(m => m.id !== memberToRemoveId));
                setMemberToRemoveId(null);
                setIsMemberModalOpen(false);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessingAction(false);
        }
    };

    const roleBadge = (role: string) => ({
        ADMIN: "bg-orange-50 text-[#F97316]",
        HR: "bg-purple-50 text-purple-600",
        TEAM: "bg-gray-50 text-gray-600",
        RECRUITER: "bg-gray-50 text-gray-600",
    }[role] ?? "bg-gray-50 text-gray-500");

    if (isLoading) {
        return (
            <div className="flex h-[450px] items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin" />
            </div>
        );
    }

    return (
        <>
            <div className="space-y-8 pb-16">
                {/* ── Page Header ── */}
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
                        <p className="text-gray-500 font-medium mt-1 text-base">
                            Manage your account & preferences
                        </p>
                    </div>
                </div>

                <div className="flex gap-8 items-start">
                    {/* ── Left Nav ── */}
                    <aside className="w-56 flex-shrink-0 sticky top-8">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 space-y-0.5">
                            {sections.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSection(s.id)}
                                    className={cn(
                                        "flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all duration-200",
                                        activeSection === s.id
                                            ? "text-[#F97316] bg-orange-50"
                                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                    )}
                                >
                                    <s.icon className={cn("h-4 w-4 transition-colors", activeSection === s.id ? "text-[#F97316]" : "text-gray-400")} />
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </aside>

                    {/* ── Content ── */}
                    <div className="flex-1 min-w-0 space-y-6">

                        {/* ═══ PROFILE ═══ */}
                        {activeSection === "profile" && (
                            <div className="space-y-6">
                                <SettingsCard title="Personal Information" description="Update your name and contact details.">
                                    <div className="grid grid-cols-1 gap-5">
                                        <Field label="Full Name">
                                            <div className="relative">
                                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    className="pl-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all"
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
                                        <Field label="Job Title">
                                            <div className="relative">
                                                <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    className="pl-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all"
                                                    value={profile.jobTitle}
                                                    onChange={e => setProfile(p => ({ ...p, jobTitle: e.target.value }))}
                                                />
                                            </div>
                                        </Field>
                                        <Field label="Phone Number">
                                             <PhoneInput
                                                 value={profile.phone}
                                                 onChange={val => setProfile(p => ({ ...p, phone: val }))}
                                                 className="mt-1"
                                             />
                                         </Field>
                                    </div>
                                </SettingsCard>
                            </div>
                        )}

                        {/* ═══ COMPANY ═══ */}
                        {activeSection === "company" && (
                            <div className="space-y-6">
                                <SettingsCard title="Company Logo" description="This logo will appear on your recruitment drives, landing pages, and AI interview screens.">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8">
                                        <div className="relative group">
                                            <div
                                                onClick={() => !company.logoUrl && logoInputRef.current?.click()}
                                                className={cn(
                                                    "h-32 w-32 rounded-3xl border-2 border-dashed border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden transition-all group-hover:border-orange-200 group-hover:bg-orange-50 shadow-inner group-hover:shadow-orange-100/50",
                                                    !company.logoUrl && "cursor-pointer"
                                                )}
                                            >
                                                {isUploadingLogo ? (
                                                    <div className="flex flex-col items-center gap-2">
                                                        <Loader2 className="h-8 w-8 text-[#F97316] animate-spin" />
                                                        <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest animate-pulse">Syncing</span>
                                                    </div>
                                                ) : company.logoUrl ? (
                                                    <img src={company.logoUrl} className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105" alt="Logo Preview" />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 text-gray-300 group-hover:text-orange-400 transition-all duration-300">
                                                        <Upload className="h-8 w-8" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Upload</span>
                                                    </div>
                                                )}
                                            </div>

                                            {company.logoUrl && !isUploadingLogo && (
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-3xl flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                                    <button
                                                        onClick={() => setIsLogoPreviewOpen(true)}
                                                        className="h-10 w-10 bg-white text-gray-900 rounded-xl flex items-center justify-center shadow-lg hover:bg-[#F97316] hover:text-white transition-all transform hover:scale-110"
                                                    >
                                                        <Eye className="h-5 w-5" />
                                                    </button>
                                                    <button
                                                        onClick={handleLogoDelete}
                                                        className="h-10 w-10 bg-white text-red-500 rounded-xl flex items-center justify-center shadow-lg hover:bg-red-500 hover:text-white transition-all transform hover:scale-110"
                                                    >
                                                        <Trash2 className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-3">
                                            <input
                                                type="file"
                                                ref={logoInputRef}
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleLogoUpload}
                                            />
                                            <div className="flex gap-2.5">
                                                <Button
                                                    disabled={isUploadingLogo}
                                                    onClick={() => logoInputRef.current?.click()}
                                                    className="h-11 px-6 rounded-xl bg-gray-950 hover:bg-[#F97316] text-white font-bold shadow-2xl transition-all"
                                                >
                                                    {isUploadingLogo ? "Syncing..." : company.logoUrl ? "Change Logo" : "Upload Logo"}
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-none">
                                                <span className="text-[#F97316]">Pro Tip:</span> Use a high-quality SVG or PNG with transparent background.
                                            </p>
                                        </div>
                                    </div>
                                </SettingsCard>

                                <SettingsCard title="Company Details" description="Information about your organization.">
                                    <div className="grid grid-cols-1 gap-5">
                                        <Field label="Company Name">
                                            <div className="relative">
                                                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input className="pl-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all"
                                                    value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} />
                                            </div>
                                        </Field>
                                        <div className="grid grid-cols-2 gap-4">
                                            <Field label="Industry">
                                                <select
                                                    value={company.industry}
                                                    onChange={e => setCompany(c => ({ ...c, industry: e.target.value }))}
                                                    className="w-full h-10 px-4 rounded-lg border border-gray-200 bg-white font-medium text-sm text-gray-900 focus:outline-none focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all font-sans"
                                                >
                                                    {[
                                                        "SAAS / TECHNOLOGY",
                                                        "FINANCIAL SERVICES",
                                                        "LOGISTICS & SUPPLY CHAIN",
                                                        "RETAIL & E-COMMERCE",
                                                        "HEALTHCARE & PHARMA",
                                                        "REAL ESTATE",
                                                        "MEDIA & ENTERTAINMENT",
                                                        "EDUCATION / EDTECH",
                                                        "MANUFACTURING",
                                                        "HOSPITALITY & TRAVEL"
                                                    ].map(i => <option key={i}>{i}</option>)}
                                                </select>
                                            </Field>
                                            <Field label="Company Size">
                                                <select
                                                    value={company.size}
                                                    onChange={e => setCompany(c => ({ ...c, size: e.target.value }))}
                                                    className="w-full h-10 px-4 rounded-lg border border-gray-200 bg-white font-medium text-sm text-gray-900 focus:outline-none focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all font-sans"
                                                >
                                                    {["1–50 EMPLOYEES", "51–250 EMPLOYEES", "251–1000 EMPLOYEES", "1001+"].map(s => <option key={s}>{s}</option>)}
                                                </select>
                                            </Field>
                                        </div>
                                        <Field label="Website URL">
                                            <div className="relative">
                                                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input className="pl-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all"
                                                    placeholder="https://company.com"
                                                    value={company.website} onChange={e => setCompany(c => ({ ...c, website: e.target.value }))} />
                                            </div>
                                        </Field>
                                        <Field label="Phone Number">
                                             <PhoneInput
                                                 value={profile.phone}
                                                 onChange={val => setProfile(p => ({ ...p, phone: val }))}
                                                 className="mt-1"
                                             />
                                         </Field>
                                        <Field label="Headquarters / Location">
                                            <LocationAutocomplete
                                                value={company.location}
                                                onChange={val => setCompany(c => ({ ...c, location: val }))}
                                                placeholder="Bangalore, India"
                                            />
                                        </Field>
                                    </div>
                                </SettingsCard>
                            </div>
                        )}


                        {/* ═══ DOMAINS ═══ */}
                        {activeSection === "domains" && (
                            <div className="space-y-6">
                                <SettingsCard
                                    title="Custom Email Domain"
                                    description="Connect your business domain to send white-labeled recruitment emails."
                                >
                                    {/* ── STEP 1: No domain in DB yet — show input ── */}
                                    {!domainInfo ? (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4 mb-2">
                                                <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                                                <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">Register New Domain</h3>
                                            </div>
                                            <div className="flex gap-3">
                                                <div className="relative flex-1">
                                                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                    <Input
                                                        className="pl-10 h-12 rounded-2xl border-gray-100 bg-white shadow-sm font-bold text-[13px] focus:ring-4 focus:ring-orange-50 focus:border-[#F97316] placeholder:font-medium placeholder:text-gray-300 transition-all"
                                                        placeholder="YOURDOMAIN.COM"
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
                                                            const res = await fetch("/api/admin/setup/domain", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ domain: newDomain })
                                                            });
                                                            const json = await res.json();
                                                            if (res.ok) {
                                                                if (json.alreadyVerified) {
                                                                    // Already verified for this org — show success and advance
                                                                    setSaved(true);
                                                                    setTimeout(() => setSaved(false), 2500);
                                                                    fetchDomainInfo(); // This will setEmailSubStep(2)
                                                                } else {
                                                                    // Registered via our platform (new or resumed) — load and advance
                                                                    fetchDomainInfo();
                                                                }
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
                                            {/* Domain card — always visible once registered via our platform */}
                                            <div className="flex items-center justify-between p-6 rounded-[2rem] bg-gradient-to-r from-gray-900 via-gray-800 to-gray-950 text-white shadow-2xl relative overflow-hidden">
                                                <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-white/[0.03] to-transparent pointer-events-none" />
                                                <div className="flex items-center gap-6 relative z-10">
                                                    <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/[0.08] shadow-[0_0_20px_rgba(255,255,255,0.05)]">
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
                                                        <p className="text-[10px] uppercase font-bold text-gray-400 mt-2 tracking-widest leading-none">Registered via this platform</p>
                                                    </div>
                                                </div>
                                                <div className="relative z-10 flex items-center gap-2">
                                                    {emailSubStep === 2 && company.customSenderEmail && company.customSenderName && (
                                                        <button
                                                            onClick={() => {
                                                                setSenderDraft({
                                                                    localPart: company.customSenderEmail ? company.customSenderEmail.split("@")[0] : "",
                                                                    name: company.customSenderName || ""
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

                                            {/* ── STEP 2: DNS records — domain not yet verified ── */}
                                            {emailSubStep === 1 && domainInfo.records && (
                                                <div className="space-y-6 pt-2">
                                                    <div className="space-y-1 border-l-2 border-[#F97316] pl-4">
                                                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-tight">Handshake Protocol</h4>
                                                        <p className="text-[10px] text-gray-400 font-medium">Add these records to your DNS provider, then click Verify DNS to trigger verification with Resend.</p>
                                                    </div>
                                                    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm bg-white">
                                                        <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex text-[10px] font-bold uppercase text-gray-500 tracking-widest leading-none">
                                                            <div className="w-[10%]">Type</div>
                                                            <div className="w-[20%]">Host Name</div>
                                                            <div className="flex-1">Value</div>
                                                            <div className="w-[10%] text-center">Priority</div>
                                                            <div className="w-[14%] text-center">Status</div>
                                                        </div>
                                                        <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                                                            {domainInfo.records.map((rec: any, i: number) => {
                                                                const isRecVerified = rec.status === "verified";
                                                                return (
                                                                    <div key={i} className="flex items-start px-4 py-3 bg-white hover:bg-orange-50/10 transition-all">
                                                                        <div className="w-[10%] pt-1.5">
                                                                            <Badge className="bg-gray-900 text-white border-0 text-[9px] font-black italic px-2 py-0.5 rounded tracking-widest">{rec.type}</Badge>
                                                                        </div>
                                                                        <div className="w-[20%] pr-3">
                                                                            <div onClick={() => handleCopy(rec.name || "@", i, 'host')} className="relative flex min-h-[32px] w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-900 cursor-pointer hover:bg-white hover:border-[#F97316]/50 transition-all group/host shadow-inner">
                                                                                <span className="font-mono font-bold break-all uppercase leading-tight">{rec.name || "@"}</span>
                                                                                {copiedIndex?.i === i && copiedIndex?.type === 'host' ? <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <Copy className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover/host:opacity-100 transition-opacity shrink-0" />}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-1 pr-3 min-w-0">
                                                                            <div onClick={() => handleCopy(rec.value, i, 'value')} className="relative flex min-h-[32px] w-full items-start justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-900 cursor-pointer hover:bg-white hover:border-[#F97316]/50 transition-all group/val shadow-inner">
                                                                                <span className="font-mono font-medium break-all leading-relaxed whitespace-pre-wrap">{rec.value}</span>
                                                                                {copiedIndex?.i === i && copiedIndex?.type === 'value' ? <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" /> : <Copy className="h-3.5 w-3.5 mt-0.5 text-gray-400 opacity-0 group-hover/val:opacity-100 transition-opacity shrink-0" />}
                                                                            </div>
                                                                        </div>
                                                                        <div className="w-[10%] pt-1.5 text-center">
                                                                            <span className="text-[10px] font-black text-gray-400 italic bg-gray-50 px-2 py-1 rounded border border-gray-100">{rec.priority ?? "-"}</span>
                                                                        </div>
                                                                        <div className="w-[14%] pt-1.5 flex justify-center">
                                                                            {isRecVerified ? (
                                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                                                    <Check className="h-2.5 w-2.5" /> Verified
                                                                                </span>
                                                                            ) : rec.status === "failed" || rec.status === "temporary_failure" ? (
                                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-700 border border-red-200">
                                                                                    Failed
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 border border-amber-200">
                                                                                    Pending
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-3">
                                                        <Button onClick={verifyDns} disabled={isLoadingDomain} className="h-10 px-8 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 text-gray-900 font-bold text-[10px] uppercase tracking-widest shadow-sm flex items-center gap-2 w-fit">
                                                            {isLoadingDomain ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 text-[#F97316]" />}
                                                            {isLoadingDomain ? "Verifying..." : "Verify DNS"}
                                                        </Button>
                                                        {domainCheckResult === "checking" && (
                                                            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                                                                <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                                                                <p className="text-[11px] font-bold text-blue-700 tracking-wide">Triggering DNS verification with Resend — this may take a few seconds...</p>
                                                            </div>
                                                        )}
                                                        {domainCheckResult === "verified" && (
                                                            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                                                                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                                                                <p className="text-[11px] font-bold text-emerald-700 tracking-wide">Domain verified successfully! Your custom sender is now active.</p>
                                                            </div>
                                                        )}
                                                        {domainCheckResult === "pending" && (
                                                            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200">
                                                                <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                                                                <div className="space-y-0.5">
                                                                    <p className="text-[11px] font-bold text-orange-700 tracking-wide">Not verified yet — some records are still pending.</p>
                                                                    <p className="text-[10px] text-orange-600 font-medium">DNS changes can take up to 24–48 hours to propagate. If you just added the records, wait a bit and check again.</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {domainCheckResult === "error" && (
                                                            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                                                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                                                                <p className="text-[11px] font-bold text-red-700 tracking-wide">Could not reach verification service. Please try again.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── STEP 3: Verified — set or edit sender identity ── */}
                                            {emailSubStep === 2 && (() => {
                                                const hasSender = !!(company.customSenderEmail && company.customSenderName);
                                                const showForm = !hasSender || isEditingSender;
                                                return (
                                                    <div className="pt-2 space-y-4">
                                                        {/* Sender form — shown when not set yet OR editing */}
                                                        {showForm && (
                                                            <div className="space-y-5 p-6 rounded-2xl bg-gray-50/50 border border-gray-100">
                                                                <div className="space-y-1 border-l-2 border-emerald-500 pl-4">
                                                                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-tight">{hasSender ? "Update Sender Identity" : "Set Sender Identity"}</h4>
                                                                    <p className="text-[10px] text-gray-400 font-medium">This name and email will appear on all outgoing recruitment emails for your org.</p>
                                                                </div>
                                                                <div className="space-y-4">
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Sender Name</label>
                                                                        <input
                                                                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-900 font-medium shadow-sm focus:border-[#F97316] outline-none transition-all"
                                                                            placeholder="Your Company"
                                                                            value={senderDraft.name}
                                                                            onChange={e => setSenderDraft(prev => ({ ...prev, name: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Sender Email</label>
                                                                        <div className="flex gap-2">
                                                                            <input
                                                                                className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm focus:border-[#F97316] outline-none transition-all"
                                                                                placeholder="careers"
                                                                                value={senderDraft.localPart}
                                                                                onChange={e => {
                                                                                    const localPart = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "").split("@")[0];
                                                                                    setSenderDraft(prev => ({ ...prev, localPart }));
                                                                                }}
                                                                            />
                                                                            <div className="flex items-center px-4 bg-gray-100 rounded-xl border border-gray-200 text-gray-500 text-[13px] font-bold">@{domainInfo.customDomain}</div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <Button
                                                                        disabled={isSaving || !senderDraft.localPart || !senderDraft.name}
                                                                        onClick={async () => {
                                                                            const finalEmail = `${senderDraft.localPart}@${domainInfo.customDomain}`;
                                                                            setIsSaving(true);
                                                                            try {
                                                                                await fetch("/api/admin/organization", {
                                                                                    method: "PATCH",
                                                                                    headers: { "Content-Type": "application/json" },
                                                                                    body: JSON.stringify({
                                                                                        customSenderEmail: finalEmail,
                                                                                        customSenderName: senderDraft.name
                                                                                    })
                                                                                });
                                                                                setCompany(prev => ({ ...prev, customSenderEmail: finalEmail, customSenderName: senderDraft.name }));
                                                                                setSaved(true);
                                                                                setTimeout(() => setSaved(false), 2500);
                                                                                setIsEditingSender(false);
                                                                            } finally {
                                                                                setIsSaving(false);
                                                                            }
                                                                        }}
                                                                        className="h-10 px-6 bg-gray-950 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center gap-2"
                                                                    >
                                                                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasSender ? "Update" : "Save & Activate"}
                                                                    </Button>
                                                                    {hasSender && (
                                                                        <button onClick={() => setIsEditingSender(false)} className="text-[11px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-widest">
                                                                            Cancel
                                                                        </button>
                                                                    )}
                                                                    {saved && <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Read-only summary — shown only when sender is set and not editing */}
                                                        {hasSender && !isEditingSender && (
                                                            <div className="flex items-center gap-6 px-6 py-4 rounded-2xl bg-gray-50 border border-gray-100">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sender Name</p>
                                                                    <p className="text-[14px] font-bold text-gray-900 truncate">{company.customSenderName}</p>
                                                                </div>
                                                                <div className="w-px h-8 bg-gray-200" />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sender Email</p>
                                                                    <p className="text-[14px] font-bold text-gray-900 truncate">{company.customSenderEmail}</p>
                                                                </div>
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

                        {activeSection === "integrations" && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <SettingsCard
                                    title="Google Integration"
                                    description="Connect your Google account to send recruitment emails from your personal address."
                                    icon={Mail}
                                >
                                    <div className="p-8">
                                        <div className="flex flex-col md:flex-row items-start lg:items-center justify-between gap-6 p-6 rounded-3xl bg-gray-50/50 border border-gray-100/50">
                                            <div className="flex gap-5">
                                                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-gray-100 shrink-0">
                                                    <svg className="w-8 h-8" viewBox="0 0 24 24">
                                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h3 className="text-[17px] font-bold text-gray-900 mb-1">Gmail API</h3>
                                                    <p className="text-[14px] leading-relaxed text-gray-500 max-w-sm">
                                                        Sending emails via Gmail increases deliverability and provides a personal touch to candidate communication.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 shrink-0">
                                                {googleStatus.isConnected ? (
                                                    <div className="flex flex-col items-end gap-3">
                                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-100">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                            <span className="text-[12px] font-bold text-green-700">{googleStatus.email}</span>
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm("Disconnect Google Integration?")) {
                                                                    await fetch("/api/admin/integrations/google", { method: "DELETE" });
                                                                    fetchGoogleStatus();
                                                                }
                                                            }}
                                                            className="text-[13px] font-bold text-red-500 hover:text-red-600 transition-colors px-1"
                                                        >
                                                            Disconnect
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            window.location.href = "/api/admin/integrations/google/authorize";
                                                        }}
                                                        className="h-12 px-6 rounded-2xl bg-gray-900 text-white text-[14px] font-bold hover:bg-black transition-all shadow-lg shadow-gray-200 active:scale-[0.98]"
                                                    >
                                                        Connect Gmail
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="p-5 rounded-2xl bg-blue-50/30 border border-blue-100/50">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                                        <Zap className="w-4 h-4 text-blue-600" />
                                                    </div>
                                                    <h4 className="text-[14px] font-bold text-blue-900">Better Deliverability</h4>
                                                </div>
                                                <p className="text-[13px] text-blue-800/70 leading-relaxed">
                                                    Emails sent via Gmail are less likely to end up in spam folders compared to generic mail servers.
                                                </p>
                                            </div>
                                            <div className="p-5 rounded-2xl bg-orange-50/30 border border-orange-100/50">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                                                        <History className="w-4 h-4 text-orange-600" />
                                                    </div>
                                                    <h4 className="text-[14px] font-bold text-orange-900">Sent Folder Sync</h4>
                                                </div>
                                                <p className="text-[13px] text-orange-800/70 leading-relaxed">
                                                    All recruitment emails sent by the platform will appear in your Gmail "Sent" folder automatically.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </SettingsCard>
                            </div>
                        )}

                        {/* ═══ TEAM ═══ */}
                        {activeSection === "team" && (
                            <div className="space-y-6">
                                <SettingsCard title="Invite Team Member" description="Send an invitation to join your workspace.">
                                    <div className="flex items-end gap-3">
                                        <div className="flex-1">
                                            <Field label="Email Address">
                                                <div className="relative">
                                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                    <Input className="pl-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all"
                                                        placeholder="colleague@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                                                </div>
                                            </Field>
                                        </div>
                                        <div className="w-36">
                                            <Field label="Role">
                                                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                                                    className="w-full h-10 px-4 rounded-lg border border-gray-200 bg-white font-medium text-sm text-gray-900 focus:outline-none focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all">
                                                    {["ADMIN", "HR", "TEAM"].map(r => <option key={r}>{r}</option>)}
                                                </select>
                                            </Field>
                                        </div>
                                        <Button
                                            disabled={isInviting || !inviteEmail}
                                            onClick={handleInviteSubmit}
                                            className="h-10 px-6 rounded-lg bg-[#F97316] hover:bg-orange-600 text-white font-bold transition-all shadow-sm"
                                        >
                                            {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1.5" /> Invite</>}
                                        </Button>
                                    </div>
                                    {inviteMessage && <p className="mt-4 text-xs font-bold text-emerald-600">{inviteMessage}</p>}
                                    {inviteError && <p className="mt-4 text-xs font-bold text-red-500">{inviteError}</p>}
                                </SettingsCard>

                                <SettingsCard title="Pending Invitations" description={`${pendingInvites.length} pending invitation(s)`}>
                                    {pendingInvites.length === 0 ? (
                                        <p className="text-sm text-gray-400 font-medium tracking-tight">No pending invitations.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {pendingInvites.map((invite) => (
                                                <div key={invite.id} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                                                    <div className="h-10 w-10 rounded-lg bg-orange-100 text-[#F97316] font-bold text-xs flex items-center justify-center flex-shrink-0">
                                                        {invite.email[0].toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-gray-900 text-sm truncate tracking-tight">{invite.email}</p>
                                                        <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">
                                                            Expires {new Date(invite.expiresAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Badge className={cn("text-[10px] font-bold border-0 rounded-lg px-3 py-1.5", roleBadge(invite.orgRole))}>
                                                            {invite.orgRole}
                                                        </Badge>
                                                        <button onClick={() => cancelInvite(invite.id)}
                                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </SettingsCard>

                                <SettingsCard title="Current Members" description={`${team.length} members in your workspace`}>
                                    <div className="space-y-3">
                                        {team.map(member => (
                                            <div key={member.id} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:bg-white hover:shadow-sm transition-all group">
                                                <div className="h-10 w-10 rounded-lg bg-gray-900 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                    {member.email[0].toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-gray-900 text-sm truncate tracking-tight">{member.name || member.email.split("@")[0]}</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">{member.email}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Badge className={cn("text-[10px] font-bold border-0 rounded-lg px-3 py-1.5", roleBadge(member.role))}>
                                                        {member.role === "TEAM" ? "Team" : member.role === "ADMIN" ? "Admin" : member.role}
                                                    </Badge>
                                                    {member.role !== "ADMIN" && (
                                                        <button onClick={() => removeMember(member.id)}
                                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex items-start gap-3">
                                        <Shield className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs font-medium text-blue-700 leading-relaxed">
                                            <span className="font-bold">Access Protocol:</span> Admins manage platform settings, HR handles recruitment workflows, and Team members execute candidate reviews.
                                        </p>
                                    </div>
                                </SettingsCard>
                            </div>
                        )}

                        {/* ═══ BILLING ═══ */}
                        {activeSection === "billing" && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-5 border-b border-gray-100">
                                        <h2 className="text-lg font-bold text-gray-900">Current Plan</h2>
                                        <p className="text-sm text-gray-500 font-medium mt-1">Your active subscription and usage details.</p>
                                    </div>
                                    <div className="px-6 py-6">
                                        <div className="relative flex items-center justify-between p-6 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white overflow-hidden shadow-md">
                                            <div className="absolute -right-6 -top-6 h-36 w-36 rounded-full bg-white/[0.03] pointer-events-none" />
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                                                    <Crown className="h-6 w-6 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)]" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-xl tracking-tight">Pro Plan</p>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 bg-emerald-500/20 border border-emerald-400/20 rounded-lg text-emerald-400">Active</span>
                                                    </div>
                                                    <p className="text-slate-400 text-xs font-medium mt-1">Billed monthly · Renews Mar 20, 2026</p>
                                                </div>
                                            </div>
                                            <div className="text-right relative z-10">
                                                <p className="font-bold text-3xl tracking-tight tabular-nums">$49</p>
                                                <p className="text-slate-400 text-xs font-medium mt-1">per month</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4 mt-4">
                                            {[
                                                { label: "Next Invoice", value: "Mar 20, 2026" },
                                                { label: "Payment", value: "•••• 4242" },
                                                { label: "Status", value: "Paid" },
                                            ].map(({ label, value }) => (
                                                <div key={label} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
                                                    <p className="text-sm font-bold text-gray-900 mt-1.5 tracking-tight">{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                                        <div>
                                            <h2 className="text-lg font-bold text-gray-900">Usage Overview</h2>
                                            <p className="text-sm text-gray-500 font-medium mt-1">Quota utilization for the current cycle</p>
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-gray-500">Feb 2026 Cycle</span>
                                    </div>
                                    <div className="px-6 py-6">
                                        <div className="grid grid-cols-3 gap-4">
                                            {[
                                                { label: "Active Drives", used: 4, max: 10, icon: BarChart3, accent: "#F97316", bg: "bg-orange-50", text: "text-[#F97316]" },
                                                { label: "AI Screenings", used: 230, max: 500, icon: Zap, accent: "#8B5CF6", bg: "bg-violet-50", text: "text-violet-600" },
                                                { label: "Team Members", used: 3, max: 10, icon: Users, accent: "#10B981", bg: "bg-emerald-50", text: "text-emerald-600" },
                                            ].map(({ label, used, max, icon: Icon, accent, bg, text }) => {
                                                const pct = Math.round((used / max) * 100);
                                                return (
                                                    <div key={label} className="relative p-5 rounded-xl border border-gray-100 bg-white hover:border-[#F97316]/30 transition-all duration-300 group overflow-hidden shadow-sm">
                                                        <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center mb-4 shadow-sm`}><Icon className={`h-5 w-5 ${text}`} /></div>
                                                        <p className="text-3xl font-bold text-gray-900 leading-none tracking-tight tabular-nums">{used}</p>
                                                        <p className="text-xs font-semibold text-gray-400 mt-2 uppercase tracking-widest">{label.split(" ")[0]} <span className="opacity-40">/ {max}</span></p>
                                                        <div className="mt-4 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                                                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: accent }} />
                                                        </div>
                                                        <p className={`text-[10px] font-bold mt-2 ${text} uppercase tracking-widest`}>{pct}% utilized</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                                        <div>
                                            <h2 className="text-lg font-bold text-gray-900">Enterprise Solutions</h2>
                                            <p className="text-sm text-gray-500 font-medium mt-1">Unlock global hiring infrastructure and dedicated support.</p>
                                        </div>
                                        <Crown className="h-5 w-5 text-gray-300" />
                                    </div>
                                    <div className="px-6 py-6">
                                        <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-8">
                                            {["Unlimited recruitment drives", "Unlimited AI screenings", "Up to 50 team members", "Priority support & SLA", "Custom integrations", "White-labeled portal"].map(feat => (
                                                <div key={feat} className="flex items-center gap-3">
                                                    <div className="h-6 w-6 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0"><Check className="h-3.5 w-3.5 text-white" /></div>
                                                    <span className="text-sm font-medium text-gray-600">{feat}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <Button className="h-11 px-8 rounded-lg bg-[#F97316] hover:bg-orange-600 text-white font-bold shadow-md transition-all">Elevate to Enterprise <ExternalLink className="h-4 w-4 ml-2.5" /></Button>
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* ═══ PASSWORD ═══ */}
                        {activeSection === "password" && (
                            <div className="space-y-6">
                                <SettingsCard title="Change Password" description="Update your password to keep your account secure.">
                                    <div className="space-y-5">
                                        <Field label="Current Password">
                                            <div className="relative">
                                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input type={showPw.current ? "text" : "password"} placeholder="Enter current password"
                                                    className="pl-10 pr-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all"
                                                    value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} />
                                                <button type="button" onClick={() => setShowPw(s => ({ ...s, current: !s.current }))} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316]"><Eye className="h-4 w-4" /></button>
                                            </div>
                                        </Field>
                                        <Field label="New Password">
                                            <div className="relative">
                                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input type={showPw.next ? "text" : "password"} placeholder="Enter new password"
                                                    className="pl-10 pr-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all"
                                                    value={passwords.next} onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))} />
                                                <button type="button" onClick={() => setShowPw(s => ({ ...s, next: !s.next }))} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316]"><Eye className="h-4 w-4" /></button>
                                            </div>
                                        </Field>
                                        <Field label="Confirm New Password">
                                            <div className="relative">
                                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input type={showPw.confirm ? "text" : "password"} placeholder="Re-enter new password"
                                                    className="pl-10 pr-10 h-10 rounded-lg border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all"
                                                    value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
                                                <button type="button" onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316]"><Eye className="h-4 w-4" /></button>
                                            </div>
                                        </Field>
                                        {pwError && <p className="text-xs font-bold text-red-500 mt-1">{pwError}</p>}
                                    </div>
                                </SettingsCard>
                                <div className="flex justify-end pt-4">
                                    <Button onClick={handlePasswordSave} disabled={isSaving} className={cn("h-10 px-8 rounded-lg font-bold shadow-sm", pwSaved ? "bg-emerald-500 text-white" : "bg-[#F97316] text-white")}>
                                        {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                        {pwSaved ? "Password Updated" : "Update Password"}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* ── Save Button ── */}
                        {["profile", "company"].includes(activeSection) && (
                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSave} disabled={isSaving} className={cn("h-11 px-12 rounded-lg font-bold shadow-md transition-all", saved ? "bg-emerald-500 text-white" : "bg-[#F97316] text-white")}>
                                    {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                    {saved ? "Changes Saved" : "Save Changes"}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <ActionConfirmModal
                    isOpen={isLogoModalOpen}
                    onClose={() => setIsLogoModalOpen(false)}
                    onConfirm={confirmLogoDelete}
                    title="Remove Company Logo"
                    description="Are you sure you want to remove your company logo? This will revert your portal header and branding."
                    confirmText="Confirm Remove"
                    isLoading={isProcessingAction}
                />

                <ActionConfirmModal
                    isOpen={isMemberModalOpen}
                    onClose={() => {
                        setIsMemberModalOpen(false);
                        setMemberToRemoveId(null);
                    }}
                    onConfirm={confirmRemoveMember}
                    title="Remove Team Member"
                    description={`Are you sure you want to remove ${team.find(m => m.id === memberToRemoveId)?.name || 'this member'}? This will immediately terminate their access to the portal.`}
                    confirmText="Terminate Access"
                    isLoading={isProcessingAction}
                />

                <ActionConfirmModal
                    isOpen={isInviteModalOpen}
                    onClose={() => {
                        setIsInviteModalOpen(false);
                        setInviteToCancelId(null);
                    }}
                    onConfirm={confirmCancelInvite}
                    title="Cancel Invitation"
                    description="Are you sure you want to cancel this pending invitation? The recipient will no longer be able to use the previous invite link."
                    confirmText="Cancel Invite"
                    isLoading={isProcessingAction}
                />

                {/* Logo Preview Modal */}
                {isLogoPreviewOpen && company.logoUrl && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-xl bg-white/40 animate-in-fade">
                        <div className="absolute inset-0" onClick={() => setIsLogoPreviewOpen(false)} />
                        <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] border border-gray-100 shadow-[0_40px_100px_rgba(0,0,0,0.1)] p-12 py-16 animate-in-scale">
                            <button onClick={() => setIsLogoPreviewOpen(false)} className="absolute top-8 right-8 h-12 w-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 hover:text-gray-900 transition-all">
                                <X className="h-6 w-6" />
                            </button>
                            <div className="space-y-8 text-center">
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Branding Asset</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Identity Verification Preview</p>
                                </div>
                                <div className="bg-gray-50/50 rounded-3xl p-12 border border-dashed border-gray-200">
                                    <img src={company.logoUrl} className="max-h-[300px] mx-auto object-contain drop-shadow-xl" alt="Logo Preview" />
                                </div>
                                <p className="text-[10px] font-black text-[#F97316] uppercase italic leading-none tracking-widest">Logo successfully synchronized with R2 storage</p>
                            </div>
                        </div>
                    </div>
                )}
                {/* Domain Deletion Modal */}
                <ActionConfirmModal
                    isOpen={showDomainDeleteConfirm}
                    onClose={() => setShowDomainDeleteConfirm(false)}
                    title="Disconnect Domain"
                    description="Are you sure you want to disconnect this custom domain? All white-labeled emails and active email identities associated with it will immediately cease to function."
                    confirmText="Disconnect Domain"
                    variant="danger"
                    onConfirm={async () => {
                        try {
                            const res = await fetch("/api/admin/organization/domain", { method: "DELETE" });
                            if (res.ok) { setDomainCheckResult(null); fetchDomainInfo(); }
                        } finally {
                            setShowDomainDeleteConfirm(false);
                        }
                    }}
                />
            </div>
        </>
    );
}
