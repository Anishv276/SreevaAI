"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    User, Building2, Bell, Users, CreditCard, Plug,
    Camera, Check, ChevronRight, Plus, Trash2, Crown,
    Slack, Calendar, Globe, Mail, Phone, Shield,
    BarChart3, AlertCircle, Zap, ExternalLink, Upload, Lock, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    const [activeSection, setActiveSection] = useState("profile");

    /* Profile */
    const [profile, setProfile] = useState({ name: "Sarah Admin", email: "sarah@company.com", phone: "+1 (555) 000-0000" });

    /* Company */
    const [company, setCompany] = useState({ name: "Acme Corp", industry: "Technology", size: "50–200", website: "https://acme.com" });

    /* Notifications */
    const [notifs, setNotifs] = useState({
        newApplications: true,
        aiScreeningCompleted: true,
        candidateShortlisted: false,
        driveExpiringSoon: true,
    });

    /* Team */
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("HR");
    const [team, setTeam] = useState([
        { id: 1, name: "Sarah Admin", email: "sarah@company.com", role: "Admin" },
        { id: 2, name: "John HR",     email: "john@company.com",  role: "HR"    },
        { id: 3, name: "Amy Viewer",  email: "amy@company.com",   role: "Viewer" },
    ]);

    /* Password */
    const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
    const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
    const [pwError, setPwError] = useState("");
    const [pwSaved, setPwSaved] = useState(false);
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
    const handlePasswordSave = () => {
        if (!passwords.current) { setPwError("Current password is required."); return; }
        if (passwords.next.length < 8) { setPwError("New password must be at least 8 characters."); return; }
        if (passwords.next !== passwords.confirm) { setPwError("Passwords do not match."); return; }
        setPwError("");
        setPwSaved(true);
        setPasswords({ current: "", next: "", confirm: "" });
        setTimeout(() => setPwSaved(false), 2500);
    };

    /* Save banner */
    const [saved, setSaved] = useState(false);
    const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

    /* Role badge style */
    const roleBadge = (role: string) => ({
        Admin:  "bg-orange-50 text-[#F97316]",
        HR:     "bg-purple-50 text-purple-600",
        Viewer: "bg-gray-50 text-gray-600",
    }[role] ?? "bg-gray-50 text-gray-500");

    return (
        <div className="space-y-8 pb-16">
            {/* ── Page Header ── */}
            <div className="flex items-center gap-4 group">
                <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
                    <p className="text-gray-500 font-medium mt-1 text-base">
                        Manage your account &amp; preferences
                    </p>
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
                                {activeSection === s.id && <ChevronRight className="ml-auto h-3.5 w-3.5 text-[#F97316]" />}
                            </button>
                        ))}
                    </div>
                </aside>

                {/* ── Content ── */}
                <div className="flex-1 min-w-0 space-y-6">

                    {/* ═══ PROFILE ═══ */}
                    {activeSection === "profile" && (
                        <div className="space-y-6">
                            <SettingsCard title="Profile Photo" description="This will be displayed on your profile across the platform.">
                                <div className="flex items-center gap-6">
                                    <div className="relative group cursor-pointer">
                                        <div className="h-20 w-20 rounded-2xl bg-gray-900 flex items-center justify-center text-white text-2xl font-black shadow-lg">SA</div>
                                        <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                            <Camera className="h-6 w-6 text-white" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Button className="h-10 px-5 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold shadow-[0_4px_12px_rgba(249,115,22,0.2)]">
                                            <Upload className="h-4 w-4 mr-2" /> Upload Photo
                                        </Button>
                                        <p className="text-[11px] text-gray-400 font-bold">JPG, PNG, or GIF. Max 2MB.</p>
                                    </div>
                                </div>
                            </SettingsCard>

                            <SettingsCard title="Personal Information" description="Update your name and contact details.">
                                <div className="grid grid-cols-1 gap-5">
                                    <Field label="Full Name">
                                        <div className="relative">
                                            <User className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input
                                                className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                                value={profile.name}
                                                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                                            />
                                        </div>
                                    </Field>
                                    <Field label="Email Address">
                                        <div className="relative">
                                            <Mail className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input
                                                type="email"
                                                className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                                value={profile.email}
                                                onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                                            />
                                        </div>
                                    </Field>
                                    <Field label="Phone Number">
                                        <div className="relative">
                                            <Phone className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input
                                                type="tel"
                                                className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                                value={profile.phone}
                                                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                                            />
                                        </div>
                                    </Field>
                                </div>
                            </SettingsCard>
                        </div>
                    )}

                    {/* ═══ COMPANY ═══ */}
                    {activeSection === "company" && (
                        <div className="space-y-6">
                            <SettingsCard title="Company Logo" description="Upload your company logo for branding across the platform.">
                                <div className="flex items-center gap-6">
                                    <div className="h-20 w-20 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-all group">
                                        <Building2 className="h-8 w-8 text-gray-300 group-hover:text-[#F97316] transition-colors" />
                                    </div>
                                    <div className="space-y-2">
                                        <Button className="h-10 px-5 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold shadow-[0_4px_12px_rgba(249,115,22,0.2)]">
                                            <Upload className="h-4 w-4 mr-2" /> Upload Logo
                                        </Button>
                                        <p className="text-[11px] text-gray-400 font-bold">SVG, PNG preferred. Max 1MB.</p>
                                    </div>
                                </div>
                            </SettingsCard>

                            <SettingsCard title="Company Details" description="Information about your organization.">
                                <div className="grid grid-cols-1 gap-5">
                                    <Field label="Company Name">
                                        <div className="relative">
                                            <Building2 className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                                value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} />
                                        </div>
                                    </Field>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="Industry">
                                            <select
                                                value={company.industry}
                                                onChange={e => setCompany(c => ({ ...c, industry: e.target.value }))}
                                                className="w-full h-11 px-4 rounded-xl border border-gray-100 bg-gray-50/50 font-bold text-sm text-gray-700 focus:outline-none focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                            >
                                                {["Technology","Finance","Healthcare","Education","Retail","Other"].map(i => <option key={i}>{i}</option>)}
                                            </select>
                                        </Field>
                                        <Field label="Company Size">
                                            <select
                                                value={company.size}
                                                onChange={e => setCompany(c => ({ ...c, size: e.target.value }))}
                                                className="w-full h-11 px-4 rounded-xl border border-gray-100 bg-gray-50/50 font-bold text-sm text-gray-700 focus:outline-none focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                            >
                                                {["1–10","11–50","50–200","200–500","500+"].map(s => <option key={s}>{s}</option>)}
                                            </select>
                                        </Field>
                                    </div>
                                    <Field label="Website URL">
                                        <div className="relative">
                                            <Globe className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                                value={company.website} onChange={e => setCompany(c => ({ ...c, website: e.target.value }))} />
                                        </div>
                                    </Field>
                                </div>
                            </SettingsCard>
                        </div>
                    )}

                    {/* ═══ NOTIFICATIONS ═══ */}
                    {activeSection === "notifications" && (
                        <SettingsCard title="Email Notifications" description="Choose which events trigger email alerts.">
                            <div className="space-y-0 divide-y divide-gray-50">
                                {[
                                    { key: "newApplications",       icon: Mail,         label: "New Applications",          desc: "Get notified when a candidate applies to a drive." },
                                    { key: "aiScreeningCompleted",  icon: Zap,          label: "AI Screening Completed",     desc: "Alert when AI finishes scoring applicants." },
                                    { key: "candidateShortlisted",  icon: Check,        label: "Candidate Shortlisted",      desc: "Notify when a candidate moves to shortlist." },
                                    { key: "driveExpiringSoon",     icon: AlertCircle,  label: "Drive Expiring Soon",        desc: "Remind 48 hours before a drive closes." },
                                ].map(({ key, icon: Icon, label, desc }) => (
                                    <div key={key} className="flex items-center justify-between py-5 first:pt-0 last:pb-0 group">
                                        <div className="flex items-center gap-4">
                                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                                                notifs[key as keyof typeof notifs] ? "bg-orange-50 text-[#F97316]" : "bg-gray-50 text-gray-400"
                                            )}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-gray-800">{label}</p>
                                                <p className="text-xs text-gray-400 font-bold mt-0.5">{desc}</p>
                                            </div>
                                        </div>
                                        <Toggle
                                            checked={notifs[key as keyof typeof notifs]}
                                            onChange={() => setNotifs(n => ({ ...n, [key]: !n[key as keyof typeof notifs] }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </SettingsCard>
                    )}

                    {/* ═══ TEAM ═══ */}
                    {activeSection === "team" && (
                        <div className="space-y-6">
                            <SettingsCard title="Invite Team Member" description="Send an invitation to join your workspace.">
                                <div className="flex items-end gap-3">
                                    <div className="flex-1">
                                        <Field label="Email Address">
                                            <div className="relative">
                                                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                                <Input className="pl-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                                    placeholder="colleague@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                                            </div>
                                        </Field>
                                    </div>
                                    <div className="w-36">
                                        <Field label="Role">
                                            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                                                className="w-full h-11 px-4 rounded-xl border border-gray-100 bg-gray-50/50 font-bold text-sm text-gray-700 focus:outline-none focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all">
                                                {["Admin","HR","Viewer"].map(r => <option key={r}>{r}</option>)}
                                            </select>
                                        </Field>
                                    </div>
                                    <Button onClick={() => { if (inviteEmail) { setTeam(t => [...t, { id: Date.now(), name: inviteEmail.split("@")[0], email: inviteEmail, role: inviteRole }]); setInviteEmail(""); } }}
                                        className="h-11 px-6 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold shadow-[0_4px_12px_rgba(249,115,22,0.2)]">
                                        <Plus className="h-4 w-4 mr-1.5" /> Invite
                                    </Button>
                                </div>
                            </SettingsCard>

                            <SettingsCard title="Current Members" description={`${team.length} members on your workspace`}>
                                <div className="space-y-3">
                                    {team.map(member => (
                                        <div key={member.id} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50/50 border border-gray-50 hover:border-gray-100 transition-all group">
                                            <div className="h-10 w-10 rounded-xl bg-gray-900 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                                                {member.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-black text-gray-900 text-sm truncate">{member.name}</p>
                                                <p className="text-xs text-gray-400 font-bold truncate">{member.email}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <select defaultValue={member.role}
                                                    className="h-8 px-3 rounded-lg border border-gray-100 bg-white text-xs font-black text-gray-700 focus:outline-none focus:border-orange-200 transition-all cursor-pointer">
                                                    {["Admin","HR","Viewer"].map(r => <option key={r}>{r}</option>)}
                                                </select>
                                                <Badge className={cn("text-[10px] font-black uppercase tracking-widest border-0 rounded-lg px-2.5 py-1", roleBadge(member.role))}>
                                                    {member.role}
                                                </Badge>
                                                {member.role !== "Admin" && (
                                                    <button onClick={() => setTeam(t => t.filter(m => m.id !== member.id))}
                                                        className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 p-3 rounded-xl bg-orange-50/50 border border-orange-100 flex items-start gap-3">
                                    <Shield className="h-4 w-4 text-[#F97316] flex-shrink-0 mt-0.5" />
                                    <p className="text-xs font-bold text-orange-700">
                                        <span className="font-black">Roles:</span> Admin can manage all settings · HR can manage drives &amp; candidates · Viewer has read-only access.
                                    </p>
                                </div>
                            </SettingsCard>
                        </div>
                    )}

                    {/* ═══ BILLING ═══ */}
                    {activeSection === "billing" && (
                        <div className="space-y-6">

                            {/* Current Plan */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">
                                <div className="px-8 py-6 border-b border-gray-50">
                                    <h2 className="text-base font-black text-gray-900">Current Plan</h2>
                                    <p className="text-sm text-gray-400 font-bold mt-1">Your active subscription and usage details.</p>
                                </div>
                                <div className="px-8 py-6">
                                    {/* Plan card — premium slate gradient */}
                                    <div className="relative flex items-center justify-between p-6 rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-white overflow-hidden">
                                        {/* Decorative orbs */}
                                        <div className="absolute -right-6 -top-6 h-36 w-36 rounded-full bg-white/[0.04] pointer-events-none" />
                                        <div className="absolute right-8 bottom-0 h-16 w-16 rounded-full bg-white/[0.03] pointer-events-none" />
                                        <div className="absolute left-0 bottom-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                                        <div className="flex items-center gap-4 relative z-10">
                                            <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/[0.12] flex items-center justify-center flex-shrink-0 shadow-inner">
                                                <Crown className="h-5 w-5 text-amber-300" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-black text-lg leading-tight tracking-tight">Pro Plan</p>
                                                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/20 rounded-full text-emerald-300">Active</span>
                                                </div>
                                                <p className="text-slate-400 text-xs font-semibold mt-0.5">Billed monthly · Renews Mar 20, 2026</p>
                                            </div>
                                        </div>

                                        <div className="text-right relative z-10">
                                            <p className="font-black text-3xl leading-none tracking-tight">$49</p>
                                            <p className="text-slate-400 text-xs font-semibold mt-1">per month</p>
                                        </div>
                                    </div>

                                    {/* Billing details row */}
                                    <div className="grid grid-cols-3 gap-3 mt-4">
                                        {[
                                            { label: "Next Invoice",  value: "Mar 20, 2026" },
                                            { label: "Payment",       value: "•••• 4242" },
                                            { label: "Status",        value: "Paid" },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                                                <p className="text-sm font-black text-gray-800 mt-1">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Usage */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">
                                <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-base font-black text-gray-900">Usage</h2>
                                        <p className="text-sm text-gray-400 font-bold mt-1">Your current month quota.</p>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-gray-50 border border-gray-100 text-gray-400">Feb 2026</span>
                                </div>
                                <div className="px-8 py-6">
                                    <div className="grid grid-cols-3 gap-4">
                                        {[
                                            { label: "Active Drives",  used: 4,   max: 10,  icon: BarChart3, accent: "#3B82F6", bg: "bg-blue-50",    text: "text-blue-600",   glow: "rgba(59,130,246,0.35)"   },
                                            { label: "AI Screenings",  used: 230, max: 500, icon: Zap,       accent: "#8B5CF6", bg: "bg-violet-50",  text: "text-violet-600", glow: "rgba(139,92,246,0.35)"   },
                                            { label: "Team Members",   used: 3,   max: 10,  icon: Users,     accent: "#10B981", bg: "bg-emerald-50", text: "text-emerald-600",glow: "rgba(16,185,129,0.35)"   },
                                        ].map(({ label, used, max, icon: Icon, accent, bg, text, glow }) => {
                                            const pct = Math.round((used / max) * 100);
                                            return (
                                                <div key={label} className="relative p-5 rounded-2xl border border-gray-100 bg-gray-50/40 hover:bg-white hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all duration-300 group overflow-hidden">
                                                    {/* Subtle bg accent blob */}
                                                    <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.12]"
                                                        style={{ background: accent }} />

                                                    {/* Icon */}
                                                    <div className={`h-10 w-10 rounded-xl ${bg} flex items-center justify-center mb-4 shadow-sm`}>
                                                        <Icon className={`h-4.5 w-4.5 ${text} h-5 w-5`} />
                                                    </div>

                                                    {/* Numbers */}
                                                    <p className="text-3xl font-black text-gray-900 leading-none tracking-tight">{used}</p>
                                                    <p className="text-xs font-bold text-gray-400 mt-1">of {max} {label.toLowerCase()}</p>

                                                    {/* Bar */}
                                                    <div className="mt-4 h-1.5 w-full rounded-full bg-gray-200/70 overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-700"
                                                            style={{
                                                                width: `${pct}%`,
                                                                background: accent,
                                                                boxShadow: `0 0 8px ${glow}`,
                                                            }} />
                                                    </div>

                                                    {/* Percent */}
                                                    <p className={`text-[11px] font-black mt-2 ${text}`}>{pct}% used</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Upgrade */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">
                                <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-base font-black text-gray-900">Upgrade to Enterprise</h2>
                                        <p className="text-sm text-gray-400 font-bold mt-1">Unlock unlimited hiring power.</p>
                                    </div>
                                    <Crown className="h-5 w-5 text-gray-300" />
                                </div>
                                <div className="px-8 py-6">
                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        {[
                                            "Unlimited recruitment drives",
                                            "Unlimited AI screenings",
                                            "Up to 50 team members",
                                            "Priority support & SLA",
                                            "Custom integrations",
                                            "Advanced analytics dashboard",
                                        ].map(feat => (
                                            <div key={feat} className="flex items-center gap-2.5">
                                                <div className="h-5 w-5 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                                                    <Check className="h-3 w-3 text-white" />
                                                </div>
                                                <span className="text-sm font-bold text-gray-600">{feat}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <Button className="h-11 px-8 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-black shadow-[0_4px_16px_rgba(249,115,22,0.2)] transition-all">
                                        Contact Sales <ExternalLink className="h-4 w-4 ml-2" />
                                    </Button>
                                </div>
                            </div>

                        </div>
                    )}


                    {/* ═══ INTEGRATIONS ═══ */}
                    {activeSection === "integrations" && (
                        <SettingsCard title="Available Integrations" description="Connect your tools and streamline your hiring workflow.">
                            <div className="space-y-4">
                                {[
                                    { icon: Globe,    name: "Job Boards",            desc: "Sync open drives to LinkedIn, Indeed &amp; Naukri.",      color: "bg-blue-50 text-blue-500",   connected: true  },
                                    { icon: Calendar, name: "Google Calendar",        desc: "Auto-schedule interviews and sync availability.",         color: "bg-green-50 text-green-600", connected: true  },
                                    { icon: Slack,    name: "Slack",                  desc: "Get real-time hiring alerts in your Slack channels.",      color: "bg-purple-50 text-purple-600", connected: false },
                                    { icon: Mail,     name: "Gmail / Outlook",        desc: "Send emails directly from your HR platform inbox.",       color: "bg-orange-50 text-[#F97316]", connected: false },
                                    { icon: BarChart3, name: "ATS / HRMS",            desc: "Sync candidate data with your existing ATS system.",      color: "bg-gray-50 text-gray-600",   connected: false },
                                ].map(({ icon: Icon, name, desc, color, connected }) => (
                                    <div key={name} className="flex items-center gap-5 p-5 rounded-xl border border-gray-100 bg-gray-50/30 hover:border-gray-200 hover:bg-white transition-all group">
                                        <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", color)}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-black text-gray-900 text-sm">{name}</p>
                                            <p className="text-xs text-gray-400 font-bold mt-0.5" dangerouslySetInnerHTML={{ __html: desc }} />
                                        </div>
                                        {connected ? (
                                            <div className="flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_#22C55E]" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-green-600">Connected</span>
                                            </div>
                                        ) : (
                                            <Button variant="outline" size="sm"
                                                className="h-9 px-4 rounded-xl border-gray-200 text-gray-600 font-black hover:border-orange-200 hover:text-[#F97316] hover:bg-orange-50 transition-all">
                                                <Plus className="h-3.5 w-3.5 mr-1.5" /> Connect
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </SettingsCard>
                    )}

                    {/* ═══ PASSWORD ═══ */}
                    {activeSection === "password" && (
                        <div className="space-y-6">
                            <SettingsCard title="Change Password" description="Update your password to keep your account secure.">
                                <div className="space-y-5">
                                    {/* Current Password */}
                                    <Field label="Current Password">
                                        <div className="relative">
                                            <Lock className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input
                                                type={showPw.current ? "text" : "password"}
                                                placeholder="Enter current password"
                                                className="pl-10 pr-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                                value={passwords.current}
                                                onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                                            />
                                            <button type="button" onClick={() => setShowPw(s => ({ ...s, current: !s.current }))}
                                                className="absolute right-3.5 top-3 text-gray-300 hover:text-gray-500 transition-colors">
                                                {showPw.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </Field>

                                    {/* New Password */}
                                    <Field label="New Password">
                                        <div className="relative">
                                            <Lock className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input
                                                type={showPw.next ? "text" : "password"}
                                                placeholder="Enter new password"
                                                className="pl-10 pr-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:border-orange-100 focus:ring-2 focus:ring-orange-50 transition-all"
                                                value={passwords.next}
                                                onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))}
                                            />
                                            <button type="button" onClick={() => setShowPw(s => ({ ...s, next: !s.next }))}
                                                className="absolute right-3.5 top-3 text-gray-300 hover:text-gray-500 transition-colors">
                                                {showPw.next ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        {/* Strength bar */}
                                        {passwords.next.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                <div className="flex gap-1">
                                                    {[1,2,3,4].map(i => (
                                                        <div key={i} className={cn(
                                                            "h-1.5 flex-1 rounded-full transition-all duration-300",
                                                            pwStrength(passwords.next) >= i ? strengthColor[pwStrength(passwords.next)] : "bg-gray-100"
                                                        )} />
                                                    ))}
                                                </div>
                                                <p className={cn("text-[11px] font-black",
                                                    pwStrength(passwords.next) <= 1 ? "text-red-400" :
                                                    pwStrength(passwords.next) === 2 ? "text-orange-400" :
                                                    pwStrength(passwords.next) === 3 ? "text-yellow-500" : "text-green-600"
                                                )}>
                                                    {strengthLabel[pwStrength(passwords.next)]}
                                                </p>
                                            </div>
                                        )}
                                    </Field>

                                    {/* Confirm Password */}
                                    <Field label="Confirm New Password">
                                        <div className="relative">
                                            <Lock className="absolute left-3.5 top-3 h-4 w-4 text-gray-300" />
                                            <Input
                                                type={showPw.confirm ? "text" : "password"}
                                                placeholder="Re-enter new password"
                                                className={cn(
                                                    "pl-10 pr-10 h-11 rounded-xl border-gray-100 bg-gray-50/50 font-bold focus:bg-white focus:ring-2 transition-all",
                                                    passwords.confirm && passwords.next !== passwords.confirm
                                                        ? "border-red-200 focus:border-red-200 focus:ring-red-50"
                                                        : "focus:border-orange-100 focus:ring-orange-50"
                                                )}
                                                value={passwords.confirm}
                                                onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                                            />
                                            <button type="button" onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}
                                                className="absolute right-3.5 top-3 text-gray-300 hover:text-gray-500 transition-colors">
                                                {showPw.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        {passwords.confirm && passwords.next !== passwords.confirm && (
                                            <p className="text-[11px] font-black text-red-400 mt-1">Passwords do not match</p>
                                        )}
                                    </Field>

                                    {/* Error */}
                                    {pwError && (
                                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                                            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                                            <p className="text-xs font-black text-red-500">{pwError}</p>
                                        </div>
                                    )}

                                    {/* Hint */}
                                    <div className="p-3 rounded-xl bg-orange-50/50 border border-orange-100 flex items-start gap-3">
                                        <Shield className="h-4 w-4 text-[#F97316] flex-shrink-0 mt-0.5" />
                                        <p className="text-xs font-bold text-orange-700">
                                            Use at least <span className="font-black">8 characters</span> with a mix of uppercase, numbers, and symbols for a strong password.
                                        </p>
                                    </div>
                                </div>
                            </SettingsCard>

                            {/* Save */}
                            <div className="flex justify-end">
                                <Button onClick={handlePasswordSave}
                                    className={cn(
                                        "h-11 px-8 rounded-xl font-black shadow-[0_4px_16px_rgba(249,115,22,0.2)] transition-all",
                                        pwSaved ? "bg-green-500 hover:bg-green-500 shadow-green-200" : "bg-[#F97316] hover:bg-orange-600"
                                    )}>
                                    {pwSaved ? <><Check className="h-4 w-4 mr-2" /> Password Updated!</> : "Update Password"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── Save Button ── */}
                    {["profile","company","notifications"].includes(activeSection) && (
                        <div className="flex justify-end">
                            <Button onClick={handleSave}
                                className={cn(
                                    "h-11 px-8 rounded-xl font-black shadow-[0_4px_16px_rgba(249,115,22,0.2)] transition-all",
                                    saved ? "bg-green-500 hover:bg-green-500 shadow-green-200" : "bg-[#F97316] hover:bg-orange-600"
                                )}>
                                {saved ? <><Check className="h-4 w-4 mr-2" /> Saved!</> : "Save Changes"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
