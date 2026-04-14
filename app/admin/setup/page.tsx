"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
    ShieldCheck, Building2, Rocket, User,
    Lock, Upload, Globe, Eye, EyeOff, Phone, Briefcase, Mail,
    CheckCircle2, ChevronRight, Loader2, Sparkles, Target, BarChart3, Users,
    AlertCircle, X, MapPin as MapPinIcon, ChevronLeft,
    Trash2, ImageIcon
} from "lucide-react"; 
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { cn } from "@/lib/utils";

const STEPS = ["Profile", "Company", "Hiring Goals", "Proceed"];

export default function OnboardingPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasLoaded = useRef(false);
    
    // Step 0: Personal Profile + Security
    const [profile, setProfile] = useState({ name: "", phone: "", jobTitle: "", email: "" });
    const [passwords, setPasswords] = useState({ current: "", next: "" });
    const [showPw, setShowPw] = useState({ current: false, next: false });

    // Step 1: Company Identity
    const [company, setCompany] = useState({ 
        name: "", 
        industry: "", 
        size: "", 
        website: "", 
        location: "",
        logoUrl: "",
    });

    // Step 2: Hiring Goals
    const [goals, setGoals] = useState({
        expectedDrives: "",
        expectedCandidates: "",
        expectedInterviews: "",
    });
    
    // UI Helpers
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showLogoPreview, setShowLogoPreview] = useState(false);

    useEffect(() => {
        if (hasLoaded.current) return;
        hasLoaded.current = true;
        
        const load = async () => {
            try {
                const [orgRes, profileRes] = await Promise.all([
                    fetch("/api/admin/organization"),
                    fetch("/api/admin/profile")
                ]);
                if (orgRes.ok) {
                    const data = await orgRes.json();
                    const sanitized = { ...data };
                    Object.keys(sanitized).forEach(key => {
                        if (sanitized[key] === null) sanitized[key] = "";
                    });
                    setCompany(prev => ({ ...prev, ...sanitized }));
                    setGoals({
                        expectedDrives: sanitized.expectedDrives || "",
                        expectedCandidates: sanitized.expectedCandidates || "",
                        expectedInterviews: sanitized.expectedInterviews || "",
                    });
                    
                    // COMPLETION CHECK
                    if (data.onboardingComplete === true || data.onboardingStep >= 5) {
                        router.replace("/admin");
                        return;
                    }

                    // RESUMPTION: Restore last step
                    if (data.onboardingStep !== undefined) {
                        const step = Math.min(Math.max(data.onboardingStep, 0), STEPS.length - 1);
                        setCurrentStep(step);
                    }
                }
                if (profileRes.ok) {
                    const pData = await profileRes.json();
                    setProfile({
                        name: pData.name || "",
                        phone: pData.phone || "",
                        jobTitle: pData.jobTitle || "",
                        email: pData.email || "",
                    });
                }
                
                // LOCAL RECOVERY
                const draft = localStorage.getItem("onboarding_draft");
                if (draft) {
                    const { company: draftCo, profile: draftProfile, goals: draftGoals } = JSON.parse(draft);
                    if (draftCo) setCompany(prev => ({ ...prev, ...draftCo }));
                    if (draftProfile) setProfile(prev => ({ ...prev, ...draftProfile }));
                    if (draftGoals) setGoals(prev => ({ ...prev, ...draftGoals }));
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    // AUTO-SAVE
    useEffect(() => {
        if (!isLoading) {
            localStorage.setItem("onboarding_draft", JSON.stringify({ company, profile, goals }));
        }
    }, [company, profile, goals, isLoading]);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) { setError("Branding asset must be an image (PNG, JPG, SVG)."); return; }
        if (file.size > 2 * 1024 * 1024) { setError("Branding asset exceeds 2MB limit."); return; }
        const oldLogoUrl = company.logoUrl;
        setIsUploading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload/logo", { method: "POST", body: formData });
            if (!res.ok) throw new Error("Could not upload logo.");
            const { url } = await res.json();
            if (oldLogoUrl) {
                await fetch("/api/upload/logo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: oldLogoUrl }) });
            }
            setCompany(prev => ({ ...prev, logoUrl: url }));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleLogoDelete = async () => {
        if (!company.logoUrl) return;
        setIsUploading(true);
        setShowDeleteConfirm(false);
        try {
            await fetch("/api/upload/logo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: company.logoUrl }) });
            setCompany(prev => ({ ...prev, logoUrl: "" }));
        } finally {
            setIsUploading(false);
        }
    };

    const handleNext = async () => {
        setError(null);
        setIsSaving(true);
        try {
            // STEP 0: Profile + Security
            if (currentStep === 0) {
                if (!profile.name) { setError("Full name is required."); setIsSaving(false); return; }
                if (passwords.next && passwords.next.length < 8) { setError("New password must be at least 8 characters."); setIsSaving(false); return; }
                const res = await fetch("/api/admin/setup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        phase: "profile",
                        data: {
                            name: profile.name,
                            phone: profile.phone,
                            jobTitle: profile.jobTitle,
                            password: passwords.next || undefined,
                            currentPassword: passwords.current || undefined,
                        }
                    })
                });
                if (!res.ok) { const d = await res.json(); setError(d.error || "Profile save failed."); setIsSaving(false); return; }
            }

            // STEP 1: Company Identity
            if (currentStep === 1) {
                const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,63})([/\w .-]*)*\/?$/;
                if (!company.name || !company.website || !company.industry || !company.size || !company.location) {
                    setError("All company fields are required."); setIsSaving(false); return;
                }
                if (!urlRegex.test(company.website)) { setError("Website must be a valid URL (e.g., company.com)."); setIsSaving(false); return; }
                const res = await fetch("/api/admin/setup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "branding", data: company })
                });
                if (!res.ok) { const d = await res.json(); setError(d.error || "Company profile save failed."); setIsSaving(false); return; }
            }

            // STEP 2: Hiring Goals
            if (currentStep === 2) {
                const res = await fetch("/api/admin/setup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "goals", data: goals })
                });
                if (!res.ok) { const d = await res.json(); setError(d.error || "Goals save failed."); setIsSaving(false); return; }
            }

            // STEP 3: Proceed (final)
            if (currentStep === STEPS.length - 1) {
                const res = await fetch("/api/admin/setup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "complete" })
                });
                if (!res.ok) { const d = await res.json(); setError(d.error || "Workspace activation failed."); setIsSaving(false); return; }
                localStorage.removeItem("onboarding_draft");
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
            <div className="w-full max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-12">
                    <div className="flex items-center gap-6 mb-10">
                        <div className="h-14 w-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shadow-sm">
                            <Rocket className="h-8 w-8" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-none">Workspace Onboarding</h1>
                            <p className="text-gray-500 font-medium text-sm mt-2">Set up your organization in a few simple steps.</p>
                        </div>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mb-6 flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-[11px] font-bold uppercase">
                        <div className="flex items-center gap-3"><AlertCircle className="h-4 w-4" />{error}</div>
                        <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
                    </div>
                )}

                {/* Step Progress */}
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
                                    isCompleted ? "border-[#F97316] bg-[#F97316] text-white" : isCurrent ? "border-[#F97316] text-[#F97316]" : "border-gray-300 text-gray-400"
                                )}>
                                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                                </div>
                                <span className={cn("text-[11px] font-semibold transition-colors whitespace-nowrap", isCurrent ? "text-gray-900" : isCompleted ? "text-gray-600" : "text-gray-400")}>
                                    {step}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Step Card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.04)] border-t-[4px] border-t-[#F97316]">
                    <div className="p-8">

                        {/* ═══ STEP 0: PROFILE & SECURITY ═══ */}
                        {currentStep === 0 && (
                            <div className="space-y-10 animate-in-slide">
                                <div className="flex items-center gap-4 mb-2">
                                    <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                                    <div>
                                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">1. Your Profile</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">Personal details and account security</p>
                                    </div>
                                </div>

                                {/* Personal Details */}
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Full Name <span className="text-[#F97316]">*</span></label>
                                        <div className="relative">
                                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><User className="h-4 w-4" /></div>
                                            <input
                                                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 focus:border-[#F97316] transition-all"
                                                placeholder="Vamsi Krishna"
                                                value={profile.name}
                                                onChange={e => setProfile({ ...profile, name: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Job Title / Role</label>
                                        <div className="relative">
                                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><Briefcase className="h-4 w-4" /></div>
                                            <input
                                                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 focus:border-[#F97316] transition-all"
                                                placeholder="e.g. HR Manager, CTO"
                                                value={profile.jobTitle}
                                                onChange={e => setProfile({ ...profile, jobTitle: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Email Address</label>
                                        <div className="relative">
                                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><Mail className="h-4 w-4" /></div>
                                            <input
                                                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-[14px] text-gray-500 font-medium shadow-sm cursor-not-allowed"
                                                value={profile.email}
                                                readOnly
                                                disabled
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400">Email cannot be changed here</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Phone Number</label>
                                        <div className="relative">
                                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><Phone className="h-4 w-4" /></div>
                                            <input
                                                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 focus:border-[#F97316] transition-all"
                                                placeholder="+91 98765 43210"
                                                value={profile.phone}
                                                onChange={e => setProfile({ ...profile, phone: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Password Section */}
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <Lock className="h-4 w-4 text-gray-400" />
                                        <span className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Set Account Password</span>
                                        <span className="text-[10px] text-gray-400 font-medium">(optional — skip if already set)</span>
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Current Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showPw.current ? "text" : "password"}
                                                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 pr-10 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all placeholder:text-gray-300"
                                                    placeholder="••••••••"
                                                    value={passwords.current}
                                                    onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                                                />
                                                <button onClick={() => setShowPw(p => ({ ...p, current: !p.current }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors">
                                                    {showPw.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">New Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showPw.next ? "text" : "password"}
                                                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 pr-10 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all placeholder:text-gray-300"
                                                    placeholder="Min. 8 characters"
                                                    value={passwords.next}
                                                    onChange={e => setPasswords({ ...passwords, next: e.target.value })}
                                                />
                                                <button onClick={() => setShowPw(p => ({ ...p, next: !p.next }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors">
                                                    {showPw.next ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ STEP 1: COMPANY IDENTITY ═══ */}
                        {currentStep === 1 && (
                            <div className="space-y-10 animate-in-slide">
                                <div className="flex items-center gap-4 mb-2">
                                    <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                                    <div>
                                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">2. Company Identity</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">Brand your workspace with your organization's details</p>
                                    </div>
                                </div>

                                {/* Logo + Name & Website */}
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
                                                        <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center p-2 text-center">
                                                            <p className="text-[9px] font-black uppercase text-white mb-2">Delete Logo?</p>
                                                            <div className="flex gap-2">
                                                                <button onClick={handleLogoDelete} className="h-6 px-3 bg-red-600 text-white rounded-lg text-[10px] font-bold">Yes</button>
                                                                <button onClick={() => setShowDeleteConfirm(false)} className="h-6 px-3 bg-white text-black rounded-lg text-[10px] font-bold">No</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <label htmlFor="logo_up" className="h-full w-full flex flex-col items-center justify-center cursor-pointer">
                                                    <Upload className="h-8 w-8 text-gray-300 mb-2" />
                                                    <span className="text-[9px] font-black uppercase text-gray-400">Company Logo</span>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-1 w-full space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Company Name <span className="text-[#F97316]">*</span></label>
                                            <input className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all" placeholder="Acme Corp" value={company.name || ""} onChange={e => setCompany({ ...company, name: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Official Website <span className="text-[#F97316]">*</span></label>
                                            <div className="relative">
                                                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <input className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 transition-all" placeholder="company.com" value={company.website || ""} onChange={e => setCompany({ ...company, website: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Industry + Size + Location */}
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Industry <span className="text-[#F97316]">*</span></label>
                                        <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-medium shadow-sm hover:border-orange-300 transition-all focus:outline-none" value={company.industry || ""} onChange={e => setCompany({ ...company, industry: e.target.value })}>
                                            <option value="">Select Industry</option>
                                            <option>SAAS / TECHNOLOGY</option>
                                            <option>FINANCIAL SERVICES</option>
                                            <option>LOGISTICS & SUPPLY CHAIN</option>
                                            <option>RETAIL & E-COMMERCE</option>
                                            <option>HEALTHCARE & PHARMA</option>
                                            <option>REAL ESTATE</option>
                                            <option>MEDIA & ENTERTAINMENT</option>
                                            <option>EDUCATION / EDTECH</option>
                                            <option>MANUFACTURING</option>
                                            <option>HOSPITALITY & TRAVEL</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Company Size <span className="text-[#F97316]">*</span></label>
                                        <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-medium shadow-sm hover:border-orange-300 transition-all focus:outline-none" value={company.size || ""} onChange={e => setCompany({ ...company, size: e.target.value })}>
                                            <option value="">Select Size</option>
                                            <option>1–50 EMPLOYEES</option>
                                            <option>51–250 EMPLOYEES</option>
                                            <option>251–1000 EMPLOYEES</option>
                                            <option>1001+</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Headquarters / Location <span className="text-[#F97316]">*</span></label>
                                    <LocationAutocomplete
                                        value={company.location || ""}
                                        onChange={val => setCompany({ ...company, location: val })}
                                        placeholder="e.g. Bangalore, India"
                                    />
                                </div>
                            </div>
                        )}

                        {/* ═══ STEP 2: HIRING GOALS ═══ */}
                        {currentStep === 2 && (
                            <div className="space-y-10 animate-in-slide">
                                <div className="flex items-center gap-4 mb-2">
                                    <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                                    <div>
                                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">3. Hiring Goals</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">Help us personalize your dashboard with your hiring targets</p>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-3 gap-6">
                                    {/* Drives Goal */}
                                    <div className="space-y-3 p-6 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md hover:border-orange-100 transition-all group">
                                        <div className="h-12 w-12 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Briefcase className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Job Drives</label>
                                            <p className="text-[10px] text-gray-400 mt-1">How many job drives do you plan to run?</p>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 focus:border-[#F97316] transition-all"
                                            placeholder="e.g. 10"
                                            value={goals.expectedDrives}
                                            onChange={e => setGoals({ ...goals, expectedDrives: e.target.value })}
                                        />
                                    </div>
                                    {/* Candidates Goal */}
                                    <div className="space-y-3 p-6 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md hover:border-orange-100 transition-all group">
                                        <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Users className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">Candidates</label>
                                            <p className="text-[10px] text-gray-400 mt-1">Expected number of applicants per month?</p>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 focus:border-[#F97316] transition-all"
                                            placeholder="e.g. 500"
                                            value={goals.expectedCandidates}
                                            onChange={e => setGoals({ ...goals, expectedCandidates: e.target.value })}
                                        />
                                    </div>
                                    {/* Interviews Goal */}
                                    <div className="space-y-3 p-6 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md hover:border-orange-100 transition-all group">
                                        <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <BarChart3 className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest leading-none">AI Interviews</label>
                                            <p className="text-[10px] text-gray-400 mt-1">Target number of AI interviews per month?</p>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] text-gray-900 font-medium shadow-sm hover:border-orange-300 focus:border-[#F97316] transition-all"
                                            placeholder="e.g. 200"
                                            value={goals.expectedInterviews}
                                            onChange={e => setGoals({ ...goals, expectedInterviews: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-400 text-center">These can be updated anytime in your Settings. This helps us tailor your dashboard.</p>
                            </div>
                        )}

                        {/* ═══ STEP 3: PROCEED / READY ═══ */}
                        {currentStep === 3 && (
                            <div className="py-8 space-y-12 animate-in-fade-slide">
                                <div className="text-center space-y-4">
                                    <div className="relative inline-block">
                                        <div className="absolute inset-0 bg-orange-400 blur-2xl opacity-20 animate-pulse" />
                                        <div className="h-20 w-20 bg-white border border-orange-100 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl relative z-10 text-[#F97316]">
                                            <Sparkles className="h-10 w-10 animate-bounce" />
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-4xl font-black text-gray-900 uppercase italic tracking-tighter leading-none">All Set!</h2>
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-3">Your workspace is configured and ready to go.</p>
                                    </div>
                                </div>

                                {/* Sync status grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {[
                                        { label: "Profile", icon: User, color: "text-blue-500" },
                                        { label: "Company", icon: Building2, color: "text-emerald-500" },
                                        { label: "Hiring Goals", icon: Target, color: "text-orange-500" },
                                        { label: "Security", icon: ShieldCheck, color: "text-purple-500" }
                                    ].map((mod) => (
                                        <div key={mod.label} className="bg-gray-50/50 border border-gray-100 p-4 rounded-2xl flex flex-col items-center gap-2 group hover:bg-white hover:shadow-md transition-all">
                                            <mod.icon className={cn("h-5 w-5", mod.color)} />
                                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-900">{mod.label}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="max-w-md mx-auto space-y-4">
                                    <p className="text-center text-[11px] text-gray-400 font-medium leading-relaxed">
                                        Click <strong className="text-gray-700">Proceed to Dashboard</strong> to start creating job drives and hiring with AI.
                                    </p>
                                    <div className="flex items-center gap-3 p-3 bg-orange-50/50 border border-orange-100 rounded-xl">
                                        <Globe className="h-4 w-4 text-[#F97316] shrink-0" />
                                        <p className="text-[9px] text-orange-800 font-semibold uppercase tracking-wider leading-relaxed">
                                            Note: Recruitment emails will be enabled once you verify your custom domain in Workspace Settings.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Navigation Footer */}
                    <div className="bg-gray-50/70 px-8 py-5 flex justify-between items-center border-t border-gray-100 rounded-b-2xl">
                        <button
                            disabled={currentStep === 0 || isSaving}
                            onClick={() => setCurrentStep(prev => prev - 1)}
                            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-[#F97316] disabled:opacity-0 transition-all"
                        >
                            <ChevronLeft className="h-3 w-3" /> Back
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={isSaving || isUploading}
                            className={cn("flex items-center gap-2 px-10 h-11 rounded-xl font-bold text-[13px] transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 shadow-lg", "bg-gray-900 text-white hover:bg-black")}
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : (currentStep === STEPS.length - 1 ? "Proceed to Dashboard" : "Continue")}
                            {!isSaving && <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                </div>

                {/* LOGO PREVIEW MODAL */}
                {showLogoPreview && company.logoUrl && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-2xl bg-white/40">
                        <div className="absolute inset-0 cursor-pointer" onClick={() => setShowLogoPreview(false)} />
                        <div className="relative w-full max-w-2xl bg-white rounded-[3rem] border border-gray-100 shadow-[0_40px_100px_rgba(0,0,0,0.15)] p-16">
                            <button onClick={() => setShowLogoPreview(false)} className="absolute top-8 right-8 h-12 w-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 hover:text-gray-900 transition-all"><X className="h-6 w-6" /></button>
                            <div className="space-y-8 text-center">
                                <h3 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Logo Preview</h3>
                                <div className="bg-gray-50/50 rounded-[2rem] p-12 border border-dashed border-gray-200">
                                    <img src={company.logoUrl} className="max-h-[300px] mx-auto object-contain drop-shadow-2xl" alt="Logo Preview" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
