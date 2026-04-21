"use client";



import { useState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";

import {

    User, Building2, Bell, Users, CreditCard, Plug,

    Camera, Check, ChevronRight, Plus, Trash2, Crown,

    MessageSquare, Calendar, Globe, Mail, Phone, Shield, ShieldAlert, Briefcase, History,
    BarChart3, AlertCircle, Zap, ExternalLink, Upload, Lock, Eye, EyeOff,
    Loader2, Copy, X, MapPin as MapPinIcon, CheckCircle2

} from "lucide-react";

import { LocationAutocomplete } from "@/components/ui/location-autocomplete";

import { PhoneInput } from "@/components/application/phone-input";

import { cn } from "@/lib/utils";

import { useAuth } from "@/context/auth-context";

import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";

import { useSearchParams } from "next/navigation";

import { toast } from "@/components/ui/toast-custom";
import { 
    SettingsCard, 
    Field, 
    Toggle 
} from "@/components/admin/settings/settings-shared";




/*  Section nav  */

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



/*  Reusable card wrapper  */





/*  Main Page  */

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

    /* OTP States */
    const [otp, setOtp] = useState("");
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpError, setOtpError] = useState("");
    const [otpAttempts, setOtpAttempts] = useState(0);



    /* Global Saving */

    const [isSaving, setIsSaving] = useState(false);

    const [saved, setSaved] = useState(false);



















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
            const syncResults = await Promise.allSettled([
                loadTeamData(),
            ]);
            syncResults.forEach((res, i) => {
                if (res.status === 'rejected') {
                    console.error(`Settings data load [${i}] failed:`, res.reason);
                }
            });

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
        if (!otp || otp.length < 6) {
            setOtpError("6-digit code required.");
            return;
        }

        setIsSaving(true);
        setOtpError("");
        try {
            const res = await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    currentPassword: passwords.current, 
                    newPassword: passwords.next,
                    otp 
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const nextAttempts = otpAttempts + 1;
                setOtpAttempts(nextAttempts);
                setOtpError(nextAttempts >= 3 ? "Access denied: 3 attempts failed." : (data.error || `Incorrect. ${3 - nextAttempts} left.`));
                if (nextAttempts >= 3) {
                    setTimeout(() => {
                        setShowOtpModal(false);
                        setOtp("");
                    }, 2000);
                }
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

                {/*  Page Header  */}

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

                    {/*  Left Nav  */}

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



                    {/*  Content  */}

                    <div className="flex-1 min-w-0 space-y-6">



                        {/*  PROFILE  */}

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



                        {/*  COMPANY  */}

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





                        {/*  DOMAINS  */}









                        {/*  TEAM  */}

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



                        {/*  BILLING  */}







                        {/*  PASSWORD  */}

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
                                        
                                        <div className="pt-2">
                                            <button 
                                                onClick={() => {
                                                    window.location.href = "/login/forgot-password?from=settings";
                                                }}
                                                className="text-xs font-bold text-[#F97316] hover:underline flex items-center gap-1.5"
                                            >
                                                <Zap className="h-3 w-3" />
                                                Forgot current password? Recover account
                                            </button>
                                        </div>
                                    </div>
                                </SettingsCard>

                                <div className="flex justify-end pt-4">
                                    <Button onClick={handlePasswordSave} disabled={sendingOtp} className={cn("h-10 px-8 rounded-lg font-bold shadow-sm", pwSaved ? "bg-emerald-500 text-white" : "bg-[#F97316] text-white")}>
                                        {sendingOtp && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                        {pwSaved ? "Password Updated" : "Update Password"}
                                    </Button>
                                </div>

                            </div>

                        )}



                        {/*  Save Button  */}

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




                {/* OTP Verification Modal */}
                {showOtpModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-white/30">
                        <div className="w-full max-w-lg bg-white border border-gray-100 rounded-[2rem] shadow-[0_50px_150px_rgba(0,0,0,0.15)] overflow-hidden">
                            <div className="p-10 space-y-8 text-center">
                                <div className="flex justify-center relative">
                                    <button onClick={() => setShowOtpModal(false)} className="absolute -top-4 -right-4 p-2 rounded-full hover:bg-gray-50 text-gray-300 hover:text-gray-950">
                                        <X className="h-6 w-6" />
                                    </button>
                                    <div className="h-20 w-20 rounded-[2rem] bg-orange-50 flex items-center justify-center text-[#F97316]">
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
                                        className="w-full h-20 text-center text-4xl font-black tracking-[0.5em] bg-gray-50 rounded-2xl border-0"
                                    />
                                    {otpError && (
                                        <div className="flex items-center justify-center gap-2 text-red-600 text-[10px] font-black uppercase tracking-widest">
                                            <AlertCircle className="h-4 w-4" />
                                            {otpError}
                                        </div>
                                    )}
                                    <Button onClick={handleVerifyAndSavePassword} disabled={isSaving || otp.length < 6} className="w-full h-14 bg-gray-950 text-white hover:bg-[#F97316] rounded-2xl font-bold text-lg">
                                        {isSaving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                                        Verify and Save
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>

    );

}



