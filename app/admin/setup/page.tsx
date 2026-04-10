"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
    ShieldCheck, Building2, Users, Rocket, 
    Lock, Upload, Globe, Mail, Eye, EyeOff,
    CheckCircle2, ChevronRight, Loader2, Sparkles,
    AlertCircle, X, MapPin, Search, ChevronLeft,
    Trash2, Shield, Plus, ImageIcon, Copy, Check
} from "lucide-react"; 
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STEPS = ["Security", "Identity", "Team", "Email", "Ready"];

export default function OnboardingPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasLoaded = useRef(false);
    
    // Form States
    const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
    const [showPw, setShowPw] = useState(false);
    const [company, setCompany] = useState({ 
        name: "", 
        industry: "", 
        size: "", 
        website: "", 
        location: "",
        logoUrl: "",
        customDomain: "",
        customSenderEmail: "",
        customSenderName: ""
    });
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("recruiter");
    const [pendingInvites, setPendingInvites] = useState<{id?: string; email: string; role: string}[]>([]);
    
    // UI Helpers
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showLogoPreview, setShowLogoPreview] = useState(false);

    // Email Setup Sub-wizard
    const [emailSubStep, setEmailSubStep] = useState(0); // 0: Input, 1: Records, 2: Sender
    const [emailRecords, setEmailRecords] = useState<any[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<{i: number, type: 'host' | 'value'} | null>(null);

    const handleCopy = (text: string, i: number, type: 'host' | 'value') => {
        navigator.clipboard.writeText(text);
        setCopiedIndex({i, type});
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    useEffect(() => {
        if (hasLoaded.current) return;
        hasLoaded.current = true;
        
        const load = async () => {
            try {
                const res = await fetch("/api/admin/organization");
                if (res.ok) {
                    const data = await res.json();
                    const sanitized = { ...data };
                    Object.keys(sanitized).forEach(key => {
                        if (sanitized[key] === null) sanitized[key] = "";
                    });
                    setCompany(prev => ({ ...prev, ...sanitized }));
                    
                    // ONBOARDING SYNC: Restore last step
                    if (data.onboardingStep !== undefined) {
                        const step = Math.min(Math.max(data.onboardingStep, 0), STEPS.length - 1);
                        setCurrentStep(step);
                    }

                    // DOMAIN STATUS: If org already has a domain registered, check its verification status
                    if (data.customDomain && data.resendDomainId) {
                        try {
                            const domainRes = await fetch("/api/admin/setup/domain");
                            if (domainRes.ok) {
                                const domainData = await domainRes.json();
                                if (domainData.records) setEmailRecords(domainData.records);
                                if (domainData.status === "verified") {
                                    setEmailSubStep(2); // Already verified → go to sender identity
                                } else {
                                    setEmailSubStep(1); // Registered but not verified → show DNS records
                                }
                            }
                        } catch {
                            // Non-critical: silently fall back to step 0
                        }
                    }
                }
                
                // LOCAL RECOVERY: Restore draft if server data is newer or identical
                const draft = localStorage.getItem("onboarding_draft");
                if (draft) {
                    const { company: draftCo, passwords: draftPw } = JSON.parse(draft);
                    if (draftCo) setCompany(prev => ({ ...prev, ...draftCo }));
                    if (draftPw) setPasswords(prev => ({ ...prev, ...draftPw }));
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    // AUTO-SAVE Mirroring
    useEffect(() => {
        if (!isLoading) {
            localStorage.setItem("onboarding_draft", JSON.stringify({ company, passwords }));
        }
    }, [company, passwords, isLoading]);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // ASSET PROTECTION: Validate type and size
        if (!file.type.startsWith("image/")) {
            setError("Identity violation: Branding asset must be an image type (PNG, JPG, SVG).");
            return;
        }
        if (file.size > 2 * 1024 * 1024) { // 2MB Limit
            setError("Identity violation: Branding asset exceeds 2MB limit.");
            return;
        }

        const oldLogoUrl = company.logoUrl;
        setIsUploading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload/logo", { method: "POST", body: formData });
            if (!res.ok) throw new Error("Deployment failed. Could not upload branding asset.");
            const { url } = await res.json();
            
            // EVICTION: Remove old asset if it exists
            if (oldLogoUrl) {
                await fetch("/api/upload/logo", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: oldLogoUrl }),
                });
            }

            setCompany(prev => ({ ...prev, logoUrl: url }));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleLogoDelete = async (targetUrl?: string) => {
        const urlToDel = targetUrl || company.logoUrl;
        if (!urlToDel) return;
        
        setIsUploading(true);
        setShowDeleteConfirm(false);
        try {
            const res = await fetch("/api/upload/logo", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: urlToDel }),
            });
            if (res.ok && !targetUrl) setCompany({...company, logoUrl: ""});
        } catch (err) {
            console.error("Asset eviction failed:", err);
        } finally {
            setIsUploading(false);
        }
    };

    const handleInvite = async () => {
        if (!inviteEmail) return;
        
        // PROTOCOL VALIDATION: Email Format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(inviteEmail)) {
            setError("Deployment Failure: Invite target must be a valid email address.");
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });
            const data = await res.json();
            
            if (res.ok) {
                setPendingInvites([...pendingInvites, { 
                    id: data.invite?.id,
                    email: inviteEmail, 
                    role: inviteRole 
                }]);
                setInviteEmail("");
            } else {
                setError(data.error || "Deployment failed.");
            }
        } catch (err) {
            setError("Protocol failure.");
        } finally {
            setIsSaving(false);
        }
    };

    const removeInvite = async (member: {id?: string; email: string}) => {
        if (!member.id) {
            setPendingInvites(pendingInvites.filter(i => i.email !== member.email));
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch(`/api/admin/team/invites/${member.id}`, { method: "DELETE" });
            if (res.ok) {
                setPendingInvites(pendingInvites.filter(i => i.email !== member.email));
            } else {
                setError("Failed to revoke invite.");
            }
        } catch (err) {
            setError("Revocation link failed.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleNext = async () => {
        setError(null);
        setIsSaving(true);
        try {
            if (currentStep === 0) {
                if (passwords.next.length < 8) { setError("Security policy violation: Password must be 8+ characters."); setIsSaving(false); return; }
                const res = await fetch("/api/admin/setup", { 
                    method: "POST", 
                    body: JSON.stringify({ 
                        phase: "security", 
                        data: { 
                            password: passwords.next,
                            currentPassword: passwords.current 
                        } 
                    }) 
                });
                if (!res.ok) {
                    const data = await res.json();
                    setError(data.error || "Security handshake failed.");
                    setIsSaving(false);
                    return;
                }
            }
            if (currentStep === 1) { // IDENTITY (STEP 2)
                const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,63})([/\w .-]*)*\/?$/;
                if (!company.name || !company.website || !company.location || !company.industry || !company.size) { 
                    setError("Operational profile incomplete: All identification fields are mandatory."); 
                    setIsSaving(false); 
                    return; 
                }
                if (!urlRegex.test(company.website)) {
                    setError("Operational profile violation: Official Website must be a valid URL (e.g., company.com).");
                    setIsSaving(false);
                    return;
                }
                await fetch("/api/admin/setup", { method: "POST", body: JSON.stringify({ phase: "branding", data: company }) });
            }
            if (currentStep === 3) { // EMAIL
                if (emailSubStep === 2) {
                    if (!company.customSenderEmail || !company.customSenderName) { 
                        setError("Identity incomplete: Official sender name and email are mandatory for activation."); 
                        setIsSaving(false); 
                        return; 
                    }
                    await fetch("/api/admin/setup", { method: "POST", body: JSON.stringify({ phase: "email", data: { 
                        senderEmail: company.customSenderEmail,
                        senderName: company.customSenderName
                    } }) });
                } else if (emailSubStep === 1) {
                    // Force verification check or stay on page
                    setError("Security handshake in progress: DNS records must be verified before proceeding.");
                    setIsSaving(false);
                    return;
                } else {
                    setCurrentStep(prev => prev + 1);
                    setIsSaving(false);
                    return;
                }
            }
            if (currentStep === STEPS.length - 1) {
                await fetch("/api/admin/setup", { method: "POST", body: JSON.stringify({ phase: "complete" }) });
                localStorage.removeItem("onboarding_draft"); // CLEANUP: Initialized
                window.location.href = "/admin";
                return;
            }
            setCurrentStep(prev => prev + 1);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-white">
            <Loader2 className="h-10 w-10 animate-spin text-[#F97316]" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 italic">Syncing Workspace Identity</p>
        </div>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-white py-12 px-6">
            <div className="w-full max-w-4xl mx-auto animate-fade-slide">
                <div className="mb-12">
                    <div className="flex items-center gap-6 mb-10">
                        <div className="h-14 w-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shadow-sm">
                            <Rocket className="h-8 w-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-none">Workspace Onboarding</h1>
                            <p className="text-gray-500 font-medium text-sm mt-2">Deploy your organization on the platform.</p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-[10px] font-bold uppercase italic">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                        <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
                    </div>
                )}

                <div className="relative flex justify-between w-full mb-8">
                    <div className="absolute top-4 left-0 h-[2px] w-full bg-gray-200 rounded-full" />
                    <div
                        className="absolute top-4 left-0 h-[2px] bg-[#F97316] rounded-full transition-all duration-500"
                        style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
                    />
                    {STEPS.map((step, i) => {
                        const isCompleted = currentStep > i;
                        const isCurrent = i === currentStep;
                        return (
                            <div key={step} className="relative z-10 flex flex-col items-center gap-2">
                                <div className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white transition-all duration-300",
                                    isCompleted
                                        ? "border-[#F97316] bg-[#F97316] text-white"
                                        : isCurrent
                                            ? "border-[#F97316] text-[#F97316]"
                                            : "border-gray-300 text-gray-400"
                                )}>
                                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                                </div>
                                <span className={cn(
                                    "text-[11px] font-semibold transition-colors whitespace-nowrap",
                                    isCurrent ? "text-gray-900" : isCompleted ? "text-gray-600" : "text-gray-400"
                                )}>
                                    {step}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.04)] border-t-[4px] border-t-[#F97316] overflow-hidden">
                    <div className="p-8">
                        {/* ═══ STEP 0: SECURITY ═══ */}
                        {currentStep === 0 && (
                            <div className="space-y-12 animate-in-slide">
                                <div className="flex items-center gap-4 mb-8">
                                    <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                                    <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">1. Security Encryption</h3>
                                </div>
                                <div className="max-w-xl grid md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Current Signature <span className="text-[#F97316]">*</span></label>
                                        <div className="relative">
                                            <input 
                                                type={showPw ? "text" : "password"} 
                                                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all placeholder:text-gray-300" 
                                                placeholder="••••••••"
                                                value={passwords.current} 
                                                onChange={e => setPasswords({...passwords, current: e.target.value})} 
                                            />
                                            <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">New Administrator Key <span className="text-[#F97316]">*</span></label>
                                        <div className="relative">
                                            <input 
                                                type={showPw ? "text" : "password"} 
                                                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all placeholder:text-gray-300" 
                                                placeholder="••••••••"
                                                value={passwords.next} 
                                                onChange={e => setPasswords({...passwords, next: e.target.value})} 
                                            />
                                            <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ STEP 1: IDENTITY ═══ */}
                        {currentStep === 1 && (
                            <div className="space-y-10 animate-in-slide">
                                <div className="flex flex-col md:flex-row items-center gap-10">
                                    <div className="relative group">
                                        <input type="file" id="logo_up" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                        <div className={cn("h-32 w-32 rounded-[2.5rem] border-2 border-dashed flex flex-col items-center justify-center relative transition-all duration-300 overflow-hidden shadow-inner", company.logoUrl ? "border-orange-200 bg-orange-50/30" : "border-gray-200 bg-gray-50 hover:border-orange-400 hover:bg-orange-50")}>
                                            {isUploading ? (
                                                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                                            ) : company.logoUrl ? (
                                                <div className="relative h-full w-full group/logo">
                                                    <img src={company.logoUrl} className="h-full w-full object-contain p-6" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                        <button onClick={() => setShowLogoPreview(true)} className="h-8 w-8 rounded-full bg-white text-gray-900 flex items-center justify-center hover:scale-110 transition-transform"><Eye className="h-4 w-4" /></button>
                                                        <button onClick={() => setShowDeleteConfirm(true)} className="h-8 w-8 rounded-full bg-white text-red-500 flex items-center justify-center hover:scale-110 transition-transform"><Trash2 className="h-4 w-4" /></button>
                                                    </div>
                                                    {showDeleteConfirm && (
                                                        <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center p-2 text-center animate-in-fade">
                                                            <p className="text-[9px] font-black uppercase text-white mb-2 leading-none">Delete Identity?</p>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => handleLogoDelete()} className="h-6 px-3 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-colors">Yes</button>
                                                                <button onClick={() => setShowDeleteConfirm(false)} className="h-6 px-3 bg-white text-black rounded-lg text-[10px] font-bold hover:bg-gray-100 transition-colors">No</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <label htmlFor="logo_up" className="h-full w-full flex flex-col items-center justify-center cursor-pointer">
                                                    <Upload className="h-8 w-8 text-gray-300 mb-2" />
                                                    <span className="text-[9px] font-black uppercase text-gray-400">Branding Asset</span>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-1 w-full space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Organization Name <span className="text-[#F97316]">*</span></label>
                                            <input className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all" value={company.name || ""} onChange={e => setCompany({...company, name: e.target.value})} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Official Website <span className="text-[#F97316]">*</span></label>
                                                <input className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all" value={company.website || ""} onChange={e => setCompany({...company, website: e.target.value})} />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Headquarters <span className="text-[#F97316]">*</span></label>
                                                <input className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all" value={company.location || ""} onChange={e => setCompany({...company, location: e.target.value})} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Industrial Sector <span className="text-[#F97316]">*</span></label>
                                        <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-medium shadow-sm hover:border-orange-300 transition-all focus:outline-none" value={company.industry || ""} onChange={e => setCompany({...company, industry: e.target.value})}>
                                            <option value="">Sector Selection</option><option>SAAS / TECHNOLOGY</option><option>FINANCIAL SERVICES</option><option>LOGISTICS</option><option>RETAIL</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Staffing Quota <span className="text-[#F97316]">*</span></label>
                                        <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-medium shadow-sm hover:border-orange-300 transition-all focus:outline-none" value={company.size || ""} onChange={e => setCompany({...company, size: e.target.value})}>
                                            <option value="">Employee Range</option><option>1–50 EMPLOYEES</option><option>51–250 EMPLOYEES</option><option>251–1000 EMPLOYEES</option><option>1001+</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ STEP 2: TEAM ═══ */}
                        {currentStep === 2 && (
                            <div className="space-y-10 animate-in-slide">
                                <div className="flex items-center gap-4 mb-8">
                                    <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                                    <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">2. Recruitment Force Deployment</h3>
                                </div>
                                <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 flex flex-col gap-6">
                                    <div className="flex flex-col md:flex-row items-end gap-4 w-full">
                                        <div className="flex-1 w-full space-y-2">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Colleague Email</label>
                                            <input 
                                                className="h-11 rounded-xl border border-gray-200 bg-white px-4 w-full text-[14px] font-medium shadow-sm hover:border-orange-300 transition-all placeholder:text-gray-300" 
                                                placeholder="COLLEAGUE@COMPANY.COM" 
                                                value={inviteEmail} 
                                                onChange={e => setInviteEmail(e.target.value.toLowerCase())} 
                                            />
                                        </div>
                                        <div className="w-full md:w-48 space-y-2">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Access Level</label>
                                            <select 
                                                className="h-11 rounded-xl border border-gray-200 bg-white px-4 w-full text-[12px] font-bold uppercase tracking-widest shadow-sm hover:border-orange-300 transition-all outline-none"
                                                value={inviteRole}
                                                onChange={e => setInviteRole(e.target.value)}
                                            >
                                                <option value="recruiter">RECRUITER</option>
                                                <option value="hr_manager">HR MANAGER</option>
                                                <option value="admin">ADMINISTRATOR</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={handleInvite} 
                                        className="h-11 px-8 bg-gray-950 text-white rounded-xl font-bold text-[13px] shadow-lg hover:bg-black transition-all w-full md:ml-auto md:w-fit"
                                    >
                                        Send Team Invite
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {pendingInvites.length > 0 && pendingInvites.map(m => (
                                        <div key={m.email} className="flex items-center justify-between p-5 bg-white border border-gray-100 rounded-[1.5rem] shadow-sm hover:border-orange-200 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center font-black text-xs uppercase italic">{m.email[0]}</div>
                                                <div>
                                                    <p className="text-sm font-black text-gray-900 uppercase italic tracking-tight">{m.email}</p>
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">{m.role.replace('_', ' ')}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => removeInvite(m)} className="h-10 w-10 flex items-center justify-center text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ STEP 3: EMAIL ═══ */}
                        {currentStep === 3 && (
                            <div className="space-y-10 animate-in-slide">
                                {emailSubStep === 0 && (
                                    <div className="space-y-10">
                                        <div className="flex items-center gap-4 mb-8">
                                            <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                                            <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">4. Email Identity Protocol</h3>
                                        </div>
                                        <div className="max-w-md space-y-6">
                                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">Enter your business domain to send from your own address. This is <span className="text-[#F97316]">optional</span>.</p>
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Company Domain</label>
                                                    <input className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all" placeholder="GITSOLUTIONS.COM" value={company.customDomain} onChange={e => setCompany({...company, customDomain: e.target.value.toLowerCase()})} />
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <button disabled={!company.customDomain || isSaving} onClick={async () => {
                                                        setIsSaving(true);
                                                        try {
                                                            const res = await fetch("/api/admin/setup/domain", { method: "POST", body: JSON.stringify({ domain: company.customDomain }) });
                                                            const data = await res.json();
                                                            if (res.ok) { setEmailRecords(data.records); setEmailSubStep(1); } else { setError(data.error); }
                                                        } catch (err) { setError("Link failed."); } finally { setIsSaving(false); }
                                                    }} className="h-11 px-8 bg-gray-950 text-white rounded-xl font-bold text-[13px] shadow-lg hover:bg-black transition-all disabled:opacity-30">Link Domain</button>
                                                    <button onClick={() => setCurrentStep(4)} className="text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors">Skip for now</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {emailSubStep === 1 && (
                                    <div className="space-y-8 animate-in-fade">
                                        <div className="space-y-2">
                                            <h4 className="text-[14px] font-bold text-gray-900 uppercase italic tracking-tight">Verification Handshake Required</h4>
                                            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-none">Add these records to your DNS provider</p>
                                        </div>
                                        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                            <table className="w-full border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-100">
                                                        <th className="px-6 py-4 text-left text-[10px] font-bold uppercase text-gray-500 tracking-widest w-[80px]">Type</th>
                                                        <th className="px-6 py-4 text-left text-[10px] font-bold uppercase text-gray-500 tracking-widest">Host</th>
                                                        <th className="px-6 py-4 text-left text-[10px] font-bold uppercase text-gray-500 tracking-widest">Value</th>
                                                        <th className="px-6 py-4 text-center text-[10px] font-bold uppercase text-gray-500 tracking-widest w-[70px]">TTL</th>
                                                        <th className="px-6 py-4 text-center text-[10px] font-bold uppercase text-gray-500 tracking-widest w-[110px]">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {emailRecords.map((rec, i) => (
                                                        <tr key={i} className="hover:bg-orange-50/10 transition-all">
                                                            <td className="px-6 py-4"><span className="h-8 w-11 bg-gray-900 rounded-lg flex items-center justify-center text-[10px] font-bold text-white italic">{rec.type}</span></td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center justify-between gap-2 cursor-pointer group" onClick={() => handleCopy(rec.name || "@", i, 'host')}>
                                                                    <span className="font-mono text-[10px] font-bold text-gray-950 truncate max-w-[100px]">{rec.name || "@"}</span>
                                                                    {copiedIndex?.i === i && copiedIndex?.type === 'host' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-gray-100 bg-gray-50/50 hover:border-orange-300 hover:bg-white transition-all cursor-pointer group" onClick={() => handleCopy(rec.value, i, 'value')}>
                                                                    <span className="font-mono text-[10px] font-medium text-gray-600 line-clamp-1 pr-6">{rec.value}</span>
                                                                    {copiedIndex?.i === i && copiedIndex?.type === 'value' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap" />}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-center"><span className="text-[10px] font-bold text-gray-400">{rec.ttl && rec.ttl !== "Auto" ? `${rec.ttl}s` : "Auto"}</span></td>
                                                            <td className="px-6 py-4 text-center">
                                                                {rec.status === "verified" ? <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-tighter">Verified</Badge> : <Badge className="bg-amber-50 text-amber-600 border-amber-100 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-tighter animate-pulse">Pending</Badge>}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="flex items-center gap-4 pt-4">
                                            <button disabled={isVerifying} onClick={async () => {
                                                setIsVerifying(true);
                                                try {
                                                    const res = await fetch("/api/admin/setup/domain");
                                                    const data = await res.json();
                                                    if (data.records) setEmailRecords(data.records);
                                                    if (data.status === "verified") { setEmailSubStep(2); } else { setError("DNS propagation in progress. Please wait."); }
                                                } catch (err) { setError("Verification failed."); } finally { setIsVerifying(false); }
                                            }} className="h-12 px-10 bg-gray-950 text-white rounded-xl font-bold text-[13px] shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2">
                                                {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Rocket className="h-4 w-4" /> Verify Records</>}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {emailSubStep === 2 && (
                                    <div className="space-y-10 animate-in-scale">
                                        <div className="flex items-center gap-4 p-6 rounded-[2rem] bg-emerald-50/50 border border-emerald-100 text-emerald-600 shadow-sm">
                                            <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center shadow-md"><CheckCircle2 className="h-6 w-6 text-emerald-500" /></div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] italic opacity-60 leading-none">Security Verified</p>
                                                <p className="text-xl font-bold italic tracking-tighter uppercase leading-none">{company.customDomain}</p>
                                            </div>
                                        </div>
                                        <div className="max-w-md space-y-8 p-8 rounded-[2rem] bg-gray-50/30 border border-gray-100">
                                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Identify yourself to candidates.</p>
                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Official Sender Name</label>
                                                    <input className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-900 font-medium shadow-sm focus:border-[#F97316] transition-all" placeholder="VAMSI" value={company.customSenderName} onChange={e => setCompany({...company, customSenderName: e.target.value.toUpperCase()})} />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Official Sender Email</label>
                                                    <div className="flex gap-2">
                                                        <input 
                                                            className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm focus:border-[#F97316] transition-all" 
                                                            placeholder="CAREERS" 
                                                            value={company.customSenderEmail.split("@")[0]} 
                                                            onChange={e => {
                                                                const localPart = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "").split("@")[0].trim();
                                                                const domain = company.customDomain || "yourdomain.com";
                                                                setCompany({...company, customSenderEmail: localPart ? `${localPart}@${domain}` : ""});
                                                            }} 
                                                        />
                                                        <div className="flex items-center px-4 bg-gray-100 rounded-xl border border-gray-200 text-gray-400 text-[11px] font-bold italic">@{company.customDomain}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={handleNext} 
                                                disabled={isSaving}
                                                className="h-11 px-10 w-full bg-black text-white rounded-xl font-bold text-[13px] shadow-xl hover:scale-102 transition-all flex items-center justify-center gap-2"
                                            >
                                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Complete Activation <ChevronRight className="h-4 w-4" /></>}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ STEP 4: READY ═══ */}
                        {currentStep === 4 && (
                            <div className="py-12 text-center space-y-6 animate-in-scale">
                                <div className="h-24 w-24 bg-white border border-gray-100 rounded-3xl flex items-center justify-center mx-auto shadow-2xl text-[#F97316] animate-bounce"><Rocket className="h-12 w-12" /></div>
                                <div>
                                    <h1 className="text-6xl font-bold text-gray-950 uppercase italic leading-none tracking-tighter">Synchronized</h1>
                                    <p className="text-[11px] text-gray-500 font-bold uppercase mt-8 opacity-60 leading-none text-center italic tracking-widest">System configuration ready for deployment.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-50/70 px-8 py-5 flex justify-between items-center border-t border-gray-100">
                        <button disabled={currentStep === 0 || isSaving} onClick={() => setCurrentStep(prev => prev - 1)} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-[#F97316] disabled:opacity-0 transition-all"><ChevronLeft className="h-3 w-3" /> Back</button>
                        <button onClick={handleNext} disabled={isSaving || isUploading} className={cn("flex items-center gap-2 px-10 h-11 rounded-xl font-bold text-[13px] transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 shadow-lg", "bg-gray-900 text-white hover:bg-black")}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : (currentStep === STEPS.length - 1 ? "Initialize" : "Continue")} <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* LOGO PREVIEW MODAL - Security Shield */}
                {showLogoPreview && company.logoUrl && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-2xl bg-white/40 animate-in-fade">
                        <div className="absolute inset-0 cursor-pointer" onClick={() => setShowLogoPreview(false)} />
                        <div className="relative w-full max-w-2xl bg-white rounded-[3rem] border border-gray-100 shadow-[0_40px_100px_rgba(0,0,0,0.15)] p-16 animate-in-scale">
                            <button onClick={() => setShowLogoPreview(false)} className="absolute top-8 right-8 h-12 w-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 hover:text-gray-900 transition-all"><X className="h-6 w-6" /></button>
                            <div className="space-y-8 text-center">
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Branding Asset Preview</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Workspace Identity Check</p>
                                </div>
                                <div className="bg-gray-50/50 rounded-[2rem] p-12 border border-dashed border-gray-200">
                                    <img src={company.logoUrl} className="max-h-[300px] mx-auto object-contain drop-shadow-2xl" alt="Logo Preview" />
                                </div>
                                <p className="text-[10px] font-black text-[#F97316] uppercase italic leading-none tracking-widest">Digital fingerprint verified</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

