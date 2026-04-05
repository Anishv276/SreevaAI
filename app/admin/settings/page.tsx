"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    User, Building2, Bell, Users, CreditCard, Plug,
    Camera, Check, ChevronRight, Plus, Trash2, Crown,
    Slack, Calendar, Globe, Mail, Phone, Shield,
    BarChart3, AlertCircle, Zap, ExternalLink, Upload, Lock, Eye, EyeOff,
    Loader2, KeyRound, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";

/* ── Section nav ──────────────────────────────────── */
const sections = [
    { id: "profile",       icon: User,        label: "Profile" },
    { id: "company",       icon: Building2,   label: "Company" },
    { id: "notifications", icon: Bell,        label: "Notifications" },
    { id: "team",          icon: Users,       label: "Team Members" },
    { id: "billing",       icon: CreditCard,  label: "Billing" },
    { id: "integrations",  icon: Plug,        label: "Integrations" },
    { id: "password",      icon: Lock,        label: "Password" },
];

/* ── Reusable card wrapper ────────────────────────── */
function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-50">
                <h2 className="text-base font-black text-gray-900">{title}</h2>
                {description && <p className="text-sm text-gray-400 font-bold mt-1">{description}</p>}
            </div>
            <div className="px-8 py-6">{children}</div>
        </div>
    );
}

/* ── Field wrapper ────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase tracking-widest text-gray-400">{label}</Label>
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
    const [activeSection, setActiveSection] = useState("profile");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    /* Profile */
    const [profile, setProfile] = useState({ name: "", email: "", phone: "" });

    /* Company */
    const [company, setCompany] = useState({ 
        name: "", 
        industry: "Technology", 
        size: "11–50", 
        website: "",
        logoUrl: "" 
    });

    /* Password */
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handlePasswordUpdate = async () => {
        setPasswordError("");
        setPasswordSuccess(false);

        if (newPassword !== confirmPassword) {
            setPasswordError("New passwords do not match");
            return;
        }

        if (newPassword.length < 6) {
            setPasswordError("Password must be at least 6 characters");
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            if (res.ok) {
                setPasswordSuccess(true);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setTimeout(() => setPasswordSuccess(false), 3000);
            } else {
                const data = await res.json();
                setPasswordError(data.error || "Failed to update password");
            }
        } catch (error) {
            setPasswordError("Network infrastructure error");
        } finally {
            setIsSaving(false);
        }
    };

    // Initial Fetch
    useEffect(() => {
        const fetchOrg = async () => {
            try {
                const res = await fetch("/api/admin/organization");
                if (res.ok) {
                    const data = await res.json();
                    setCompany({
                        name: data.name || "",
                        industry: data.industry || "Technology",
                        size: data.size || "11–50",
                        website: data.website || "",
                        logoUrl: data.logoUrl || ""
                    });
                }
            } catch (err) { console.error(err); }
            finally { setIsLoading(false); }
        };
        fetchOrg();
        if (user) {
            setProfile({ name: user.name || "", email: user.email || "", phone: "" });
        }
    }, [user]);

    const [isUploading, setIsUploading] = useState(false);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/upload/logo", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) throw new Error("Upload Failed");

            const data = await res.json();
            setCompany(c => ({ ...c, logoUrl: data.url }));
        } catch (err) {
            console.error("Logo Upload Error:", err);
            alert("R2 Bucket Dispatch Failed - Check Console");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (activeSection === "company") {
                const res = await fetch("/api/admin/organization", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(company)
                });
                if (!res.ok) throw new Error("Update Failed");
            }
            
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    /* Notifications */
    const [notifs, setNotifs] = useState({
        newApplications: true,
        aiScreeningCompleted: true,
        candidateShortlisted: false,
        driveExpiringSoon: true,
    });

    /* Team */
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("RECRUITER");
    const [team, setTeam] = useState<{ id: string; name: string; email: string; role: string; isActive: boolean }[]>([]);
    const [isInviting, setIsInviting] = useState(false);

    const fetchTeam = async () => {
        try {
            const res = await fetch("/api/admin/team");
            if (res.ok) {
                const data = await res.json();
                setTeam(data);
            }
        } catch (error) { console.error("Error fetching team:", error); }
    };

    useEffect(() => {
        if (activeSection === "team") fetchTeam();
    }, [activeSection]);

    const handleInviteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail) return;
        setIsInviting(true);
        try {
            const res = await fetch("/api/admin/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });
            if (res.ok) {
                setInviteEmail("");
                fetchTeam();
            }
        } catch (error) { console.error("Error inviting member:", error); }
        finally { setIsInviting(false); }
    };

    const removeMember = async (id: string) => {
        if (!confirm("Are you sure you want to remove this member?")) return;
        try {
            const res = await fetch(`/api/admin/team/${id}`, { method: "DELETE" });
            if (res.ok) fetchTeam();
        } catch (error) { console.error("Error removing member:", error); }
    };


    if (isLoading) {
        return (
            <div className="flex h-[450px] items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-16">
            {/* ── Page Header ── */}
            <div className="flex items-center gap-4 group">
                <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
                    <p className="text-gray-500 font-medium mt-1 text-base">Manage your account &amp; brand</p>
                </div>
            </div>

            <div className="flex gap-8 items-start">
                {/* ── Left Nav ── */}
                <aside className="w-52 flex-shrink-0 sticky top-8">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-2 space-y-1">
                        {sections.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                className={cn(
                                    "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[13px] font-bold transition-all duration-200",
                                    activeSection === s.id
                                        ? "text-[#F97316] bg-orange-50 shadow-[0_2px_8px_rgba(249,115,22,0.1)]"
                                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                )}
                            >
                                <s.icon className={cn("h-4 w-4", activeSection === s.id ? "text-[#F97316]" : "text-gray-400")} />
                                {s.label}
                            </button>
                        ))}
                    </div>
                </aside>

                {/* ── Content ── */}
                <div className="flex-1 min-w-0 space-y-6">

                    {/* ═══ PROFILE ═══ */}
                    {activeSection === "profile" && (
                        <div className="space-y-6 animate-in-up">
                            <SettingsCard title="Profile Photo" description="Your professional avatar across Hirer.AI.">
                                <div className="flex items-center gap-6">
                                    <div className="relative group cursor-pointer h-20 w-20 rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                                        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-white text-2xl font-black">{profile.name?.[0] || profile.email?.[0]}</div>
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center p-4">
                                            <Camera className="h-6 w-6 text-white" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Button className="h-10 px-5 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold shadow-md">
                                            <Upload className="h-4 w-4 mr-2" /> Upload Photo
                                        </Button>
                                        <p className="text-[11px] text-gray-400 font-bold">Square aspect ratio (1:1) preferred.</p>
                                    </div>
                                </div>
                            </SettingsCard>

                            <SettingsCard title="Personal Information" description="Update your administrative identity.">
                                <div className="grid grid-cols-1 gap-5">
                                    <Field label="Full Name">
                                        <div className="relative">
                                            <User className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input
                                                className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white transition-all"
                                                value={profile.name}
                                                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                                            />
                                        </div>
                                    </Field>
                                    <Field label="Email Address">
                                        <div className="relative">
                                            <Mail className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input
                                                disabled
                                                className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-100 font-bold opacity-60 italic"
                                                value={profile.email}
                                            />
                                        </div>
                                    </Field>
                                </div>
                            </SettingsCard>
                        </div>
                    )}

                    {/* ═══ COMPANY ═══ */}
                    {activeSection === "company" && (
                        <div className="space-y-6 animate-in-up">
                            <SettingsCard title="Company Logo" description="Official brand identity for candidate portals.">
                                <div className="flex items-center gap-8">
                                    <div className="relative group">
                                        <label className={cn(
                                            "h-24 w-24 rounded-3xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all duration-300 overflow-hidden relative shadow-sm",
                                            company.logoUrl ? "border-transparent bg-white ring-1 ring-gray-100" : "border-gray-200 bg-gray-50/50 hover:border-orange-300 hover:bg-orange-50"
                                        )}>
                                            {company.logoUrl ? (
                                                <img src={company.logoUrl} className="h-full w-full object-contain p-3 animate-in-fade" alt="Corporate Brand Logo" />
                                            ) : (
                                                <Building2 className="h-10 w-10 text-gray-300 group-hover:text-[#F97316] transition-colors" />
                                            )}
                                            <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                        </label>
                                        
                                        {company.logoUrl && (
                                            <button 
                                                onClick={() => setCompany(c => ({ ...c, logoUrl: "" }))}
                                                className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-lg hover:scale-110 active:scale-95 border-2 border-white animate-in-scale"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex gap-3">
                                            <label className={cn(
                                                "inline-flex h-11 px-6 items-center rounded-2xl bg-gray-950 hover:bg-gray-800 text-white font-black text-xs cursor-pointer transition-all shadow-xl hover:-translate-y-0.5 active:scale-95 uppercase tracking-widest italic leading-none",
                                                isUploading && "opacity-50 cursor-not-allowed"
                                            )}>
                                                {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-2" />} 
                                                {isUploading ? "Synchronizing..." : (company.logoUrl ? "Replace Logo" : "Upload Logo")}
                                                {!isUploading && <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />}
                                            </label>
                                            
                                            {company.logoUrl && (
                                                <button 
                                                    onClick={() => window.open(company.logoUrl, '_blank')}
                                                    className="h-11 px-6 rounded-2xl bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-950 font-black text-xs transition-all border border-gray-100 uppercase tracking-widest italic"
                                                >
                                                    <Eye className="h-3.5 w-3.5 mr-2 inline-block" /> Full Preview
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.15em] italic opacity-70">Synchronizing to logos bucket</p>
                                    </div>
                                </div>
                            </SettingsCard>

                            <SettingsCard title="Company Details" description="Define your organization's hiring identity.">
                                <div className="grid grid-cols-1 gap-6">
                                    <Field label="Company Legal Name">
                                        <div className="relative">
                                            <Building2 className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input 
                                                className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white"
                                                value={company.name} 
                                                onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} 
                                            />
                                        </div>
                                    </Field>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <Field label="Industry Sector">
                                            <select
                                                value={company.industry}
                                                onChange={e => setCompany(c => ({ ...c, industry: e.target.value }))}
                                                className="w-full h-11 px-4 rounded-xl border border-gray-100 bg-gray-50/50 font-bold text-sm text-gray-700 outline-none focus:bg-white"
                                            >
                                                {["Technology","Finance","Healthcare","Manufacturing","Education","Retail","Other"].map(i => <option key={i}>{i}</option>)}
                                            </select>
                                        </Field>
                                        <Field label="Organization Size">
                                            <select
                                                value={company.size}
                                                onChange={e => setCompany(c => ({ ...c, size: e.target.value }))}
                                                className="w-full h-11 px-4 rounded-xl border border-gray-100 bg-gray-50/50 font-bold text-sm text-gray-700 outline-none focus:bg-white"
                                            >
                                                {["1–10","11–50","50–200","200–500","500+"].map(s => <option key={s}>{s}</option>)}
                                            </select>
                                        </Field>
                                    </div>
                                    <Field label="Corporate Website URL">
                                        <div className="relative">
                                            <Globe className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input 
                                                className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white"
                                                placeholder="https://company.ai"
                                                value={company.website} 
                                                onChange={e => setCompany(c => ({ ...c, website: e.target.value }))} 
                                            />
                                        </div>
                                    </Field>
                                </div>
                            </SettingsCard>
                        </div>
                    )}

                    {/* ── Password Security ── */}
                    {activeSection === "password" && (
                        <div className="space-y-6 animate-in-fade">
                            <SettingsCard 
                                title="Update Password" 
                                description="Change your account security credentials."
                            >
                                <div className="grid grid-cols-1 gap-6 max-w-lg">
                                    <Field label="Current Password">
                                        <div className="relative">
                                            <Lock className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input 
                                                type={showCurrent ? "text" : "password"}
                                                className="pl-10 pr-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white"
                                                value={currentPassword} 
                                                onChange={e => setCurrentPassword(e.target.value)} 
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => setShowCurrent(!showCurrent)}
                                                className="absolute right-3.5 top-3 text-gray-300 hover:text-[#F97316] transition-colors"
                                            >
                                                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </Field>
                                    
                                    <div className="h-px bg-gray-50 my-2" />

                                    <Field label="New Password">
                                        <div className="relative">
                                            <KeyRound className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input 
                                                type={showNew ? "text" : "password"}
                                                className="pl-10 pr-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white"
                                                value={newPassword} 
                                                onChange={e => setNewPassword(e.target.value)} 
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => setShowNew(!showNew)}
                                                className="absolute right-3.5 top-3 text-gray-300 hover:text-[#F97316] transition-colors"
                                            >
                                                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </Field>

                                    <Field label="Confirm New Password">
                                        <div className="relative">
                                            <Check className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input 
                                                type={showConfirm ? "text" : "password"}
                                                className="pl-10 pr-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white"
                                                value={confirmPassword} 
                                                onChange={e => setConfirmPassword(e.target.value)} 
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => setShowConfirm(!showConfirm)}
                                                className="absolute right-3.5 top-3 text-gray-300 hover:text-[#F97316] transition-colors"
                                            >
                                                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </Field>


                                    {passwordError && (
                                        <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-3 text-red-600 animate-in-shake">
                                            <AlertCircle className="h-4 w-4" />
                                            <p className="text-[11px] font-black uppercase tracking-widest leading-none mt-0.5">{passwordError}</p>
                                        </div>
                                    )}

                                    {passwordSuccess && (
                                        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-3 text-emerald-600 animate-in-fade">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <p className="text-[11px] font-black uppercase tracking-widest leading-none mt-0.5">Access Synchronized Successfully</p>
                                        </div>
                                    )}

                                    <Button 
                                        onClick={handlePasswordUpdate}
                                        disabled={isSaving}
                                        className="h-14 w-full bg-gray-950 text-white font-black uppercase tracking-widest italic rounded-2xl hover:bg-black hover:-translate-y-1 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3"
                                    >
                                        {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Shield className="h-5 w-5" />}
                                        {isSaving ? "Updating password..." : "Update Password"}
                                    </Button>
                                </div>
                            </SettingsCard>
                        </div>
                    )}

                    {/* ═══ TEAM MANAGEMENT ═══ */}
                    {activeSection === "team" && (
                        <div className="space-y-10 animate-in-up">
                            {/* Invite Portal Card */}
                            <SettingsCard 
                                title="Onboard Member" 
                                description="Invite your team to collaborate on recruitment drives."
                            >
                                <form onSubmit={handleInviteSubmit} className="flex flex-col sm:flex-row items-end gap-5">
                                    <div className="flex-1 space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Collaborator Email</Label>
                                        <div className="relative group">
                                            <Mail className="absolute left-3.5 top-3 h-4.5 w-4.5 text-gray-300 group-focus-within:text-[#F97316] transition-colors" />
                                            <Input 
                                                placeholder="colleague@company.com"
                                                className="pl-12 h-12 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white transition-all text-[13px]"
                                                value={inviteEmail}
                                                onChange={e => setInviteEmail(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="w-full sm:w-48 space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Strategic Role</Label>
                                        <select 
                                            value={inviteRole}
                                            onChange={e => setInviteRole(e.target.value)}
                                            className="w-full h-12 px-4 rounded-xl border border-gray-100 bg-gray-50/50 font-black text-xs text-gray-950 uppercase tracking-widest outline-none focus:bg-white transition-all italic"
                                        >
                                            <option value="RECRUITER">Recruiter</option>
                                            <option value="HR">HR Manager</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                    </div>
                                    <Button 
                                        type="submit"
                                        disabled={isInviting || !inviteEmail}
                                        className="h-12 px-8 rounded-xl bg-gray-950 text-white font-black text-[10px] uppercase tracking-widest transition-all hover:bg-black active:scale-95 shadow-xl shadow-gray-100"
                                    >
                                        {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dispatch Invite"}
                                    </Button>
                                </form>
                            </SettingsCard>

                            {/* Team Registry List */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 px-1">
                                    <div className="h-4 w-1 bg-[#F97316] rounded-full" />
                                    <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-widest italic">Team Registry</h2>
                                </div>

                                <div className="bg-white rounded-[2rem] border border-gray-50 shadow-[0_8px_30px_rgba(0,0,0,0.02)] overflow-hidden">
                                    <div className="grid grid-cols-[2fr_1.5fr_1fr_0.5fr] gap-4 px-10 py-6 border-b border-gray-50 text-[9px] font-black text-gray-300 uppercase tracking-widest">
                                        <span>Collaborator</span>
                                        <span>Identifier</span>
                                        <span className="text-center">Protocol</span>
                                        <span className="text-right">Action</span>
                                    </div>

                                    <div className="divide-y divide-gray-50/50">
                                        {team.length === 0 ? (
                                            <div className="py-20 text-center flex flex-col items-center gap-3">
                                                <Users className="h-8 w-8 text-gray-100" />
                                                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest font-italic leading-none italic">No collaborators synchronised</p>
                                            </div>
                                        ) : (
                                            team.map((member) => (
                                                <div key={member.id} className="grid grid-cols-[2fr_1.5fr_1fr_0.5fr] gap-4 px-10 py-6 items-center hover:bg-gray-50/30 transition-all group">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-11 w-11 rounded-full bg-gray-950 text-white flex items-center justify-center font-black text-[14px] shadow-lg group-hover:bg-[#F97316] transition-all duration-300">
                                                            {member.email[0].toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col gap-0.5 truncate">
                                                            <p className="text-gray-950 font-black text-sm tracking-tight truncate leading-none uppercase italic">{member.name || "Pending Onboarding"}</p>
                                                            <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest opacity-60 leading-none mt-1">ID: {member.id.slice(-8)}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 truncate">
                                                        <Mail className="h-3 w-3 text-gray-200" />
                                                        <span className="text-[12px] font-bold text-gray-500 lowercase truncate">{member.email}</span>
                                                    </div>

                                                    <div className="text-center">
                                                        <span className={cn(
                                                            "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest italic border inline-flex items-center gap-2",
                                                            member.role === 'ADMIN' ? 'bg-orange-50 text-[#F97316] border-orange-100/50' : 'bg-gray-50 text-gray-400 border-gray-100'
                                                        )}>
                                                            <Shield className="h-3 w-3" />
                                                            {member.role}
                                                        </span>
                                                    </div>

                                                    <div className="text-right">
                                                        <button 
                                                            onClick={() => removeMember(member.id)}
                                                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-gray-50 text-gray-300 hover:bg-red-50 hover:text-red-600 transition-all active:scale-95"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* (Other sections remain simplified for space) */}
                    {(activeSection === "billing" || activeSection === "integrations") && (
                        <div className="p-12 text-center bg-white rounded-[3rem] border border-gray-50 shadow-inner space-y-6">
                             <div className="h-20 w-20 rounded-[2rem] bg-orange-50 text-[#F97316] flex items-center justify-center mx-auto shadow-xl">
                                <Shield className="h-10 w-10" />
                             </div>
                             <div className="space-y-2">
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase italic leading-none">{activeSection} System</h3>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[9px] italic opacity-70">Infrastructure upgrade in progress</p>
                             </div>
                        </div>
                    )}

                    {/* ── Save Button Overlay ── */}
                    {["profile","company"].includes(activeSection) && (
                        <div className="flex justify-end pt-4">
                            <Button 
                                onClick={handleSave}
                                disabled={isSaving}
                                className={cn(
                                    "h-14 px-12 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 italic",
                                    saved ? "bg-green-500 shadow-green-100" : "bg-[#F97316] hover:bg-orange-600"
                                )}
                            >
                                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : (saved ? "Synchronized!" : "Deploy Changes")}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
