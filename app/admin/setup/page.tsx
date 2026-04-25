"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
    ShieldCheck, Building2, Rocket, User,
    Lock, Upload, Globe, Eye, EyeOff, Phone, Briefcase, Mail,
    CheckCircle2, ChevronRight, Loader2, Sparkles, Target, BarChart3, Users,
    AlertCircle, X, MapPin as MapPinIcon, ChevronLeft,
    Trash2, ImageIcon, LogOut
} from "lucide-react"; 
import { motion, AnimatePresence } from "framer-motion";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { PhoneInput } from "@/components/application/phone-input";
import { cn } from "@/lib/utils";
import { validatePasswordStrength } from "@/lib/validation";
import { toast } from "@/components/ui/toast-custom";

const STEPS = ["Profile", "Company", "Proceed"];

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
    const [pwError, setPwError] = useState<string | null>(null);

    // Step 1: Company Identity
    const [company, setCompany] = useState({ 
        name: "", 
        industry: "", 
        size: "", 
        website: "", 
        location: "",
        logoUrl: "",
    });
    
    // UI Helpers
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showLogoPreview, setShowLogoPreview] = useState(false);
    const [googleStatus, setGoogleStatus] = useState<{ isConnected: boolean; email: string | null }>({ isConnected: false, email: null });
    const [googleMessage, setGoogleMessage] = useState<string | null>(null);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [showWelcomeCard, setShowWelcomeCard] = useState(false);

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
                    
                    if (data.onboardingComplete === true) {
                        router.replace("/admin");
                        return;
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

                const googleRes = await fetch("/api/admin/integrations/google");
                if (googleRes.ok) {
                    const googleData = await googleRes.json();
                    setGoogleStatus({
                        isConnected: !!googleData.isConnected,
                        email: googleData.email || null,
                    });
                }
                
                // LOCAL RECOVERY
                const draft = localStorage.getItem("onboarding_draft");
                if (draft) {
                    try {
                        const parsed = JSON.parse(draft);
                        if (parsed && typeof parsed === 'object') {
                            const { company: draftCo, profile: draftProfile, step: draftStep } = parsed;
                            if (draftCo) setCompany(prev => ({ ...prev, ...draftCo }));
                            if (draftProfile) setProfile(prev => ({ ...prev, ...draftProfile }));
                            if (typeof draftStep === 'number' && draftStep >= 0 && draftStep < STEPS.length) {
                                setCurrentStep(draftStep);
                            }
                        }
                    } catch (e) {
                        console.warn("Failed to parse onboarding draft:", e);
                        localStorage.removeItem("onboarding_draft");
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const googleSuccess = params.get("google_success");
        const googleError = params.get("google_error");

        if (googleSuccess) {
            toast.success("Google connected successfully. Emails will now send from that inbox.");
            params.delete("google_success");
            window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
        }

        if (googleError) {
            const msg = googleError === "missing_params" ? "Google connection was not completed." : `Google connection failed: ${googleError}`;
            toast.error(msg);
            params.delete("google_error");
            window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
        }
    }, []);

    // AUTO-SAVE
    useEffect(() => {
        if (isLoading) return;
        
        const timer = setTimeout(() => {
            localStorage.setItem("onboarding_draft", JSON.stringify({ company, profile, step: currentStep }));
        }, 1000);

        return () => clearTimeout(timer);
    }, [company, profile, currentStep, isLoading]);

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
            toast.success("Branding asset uploaded.");
        } catch (err: any) {
            toast.error(err.message);
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
            // STEP 0: Profile
            if (currentStep === 0) {
                if (!profile.name || !profile.jobTitle) { 
                    toast.error("Full name and job title are required."); 
                    setIsSaving(false); 
                    return; 
                }
                
                // VALIDATE PASSWORD STRENGTH
                if (passwords.next) {
                    const { isValid, error: strengthError } = validatePasswordStrength(passwords.next);
                    if (!isValid) {
                        setPwError(strengthError || "Password format is invalid.");
                        setIsSaving(false);
                        return;
                    }
                }
                setPwError(null);
                // No API call here - save deferred
            }

            // STEP 1: Company Identity
            if (currentStep === 1) {
                const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,63})([/\w .-]*)*\/?$/;
                if (!company.name || !company.website || !company.industry || !company.size || !company.location) {
                    toast.error("All company fields are required."); 
                    setIsSaving(false); 
                    return;
                }
                if (!urlRegex.test(company.website)) { 
                    toast.error("Website must be a valid URL (e.g., company.com)."); 
                    setIsSaving(false); 
                    return; 
                }
                // No API call here - save deferred
            }

            // STEP 2: Proceed (final activation)
            if (currentStep === STEPS.length - 1) {
                if (!googleStatus.isConnected) {
                    toast.error("Connect Gmail in step 3 before proceeding.");
                    setIsSaving(false);
                    return;
                }
                const res = await fetch("/api/admin/setup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        phase: "complete",
                        data: {
                            profile,
                            company,
                            passwords: passwords.next ? passwords : undefined
                        }
                    })
                });
                if (!res.ok) { 
                    const d = await res.json(); 
                    toast.error(d.error || "Workspace activation failed."); 
                    setIsSaving(false); 
                    return; 
                }
                localStorage.removeItem("onboarding_draft");
                
                // Show the SaaS-style Welcome Card instead of redirecting immediately
                setShowWelcomeCard(true);
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
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-white font-sans">
            <Loader2 className="h-10 w-10 animate-spin text-[#F97316]" />
            <div className="text-center space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 font-sans">Syncing Workspace Identity</p>
                <p className="text-[9px] font-medium text-gray-300 font-sans">Sreeva AI Cloud Identity & Access Mgmt</p>
                <p className="text-[9px] font-bold text-gray-400 font-sans mt-2">Secured by Sreeva AI Network</p>
            </div>
        </div>
    );

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-white overflow-hidden p-6 font-sans">
            <div className="w-full max-w-3xl mx-auto animate-in-fade zoom-in-[0.98] duration-700">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-12 w-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shadow-sm">
                            <Rocket className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight leading-none">Workspace Onboarding</h1>
                            <p className="text-gray-400 font-medium text-[13px] mt-1.5">Set up your organization in a few simple steps.</p>
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
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.04)] border-t-[4px] border-t-[#F97316]">
                    <div className="p-6 md:p-8">

                        {/* --- STEP 0: PROFILE & SECURITY --- */}
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
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Job Title / Role <span className="text-[#F97316]">*</span></label>
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
                                         <PhoneInput
                                             value={profile.phone}
                                             onChange={val => setProfile({ ...profile, phone: val })}
                                             className="mt-1"
                                         />
                                    </div>
                                </div>

                                {/* Password Section */}
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <Lock className="h-4 w-4 text-gray-400" />
                                        <span className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Set Account Password</span>
                                        <span className="text-[10px] text-gray-400 font-medium">(optional - skip if already set)</span>
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
                                            {pwError && <p className="text-[10px] text-red-500 font-bold uppercase mt-1.5 flex items-center gap-1.5 animate-in-fade"><AlertCircle className="h-3 w-3" /> {pwError}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- STEP 1: COMPANY IDENTITY --- */}
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

                        {/* --- STEP 2: PROCEED / READY --- */}
                        {currentStep === 2 && (
                            <div className="animate-in-fade-slide font-sans space-y-12">
                                <div className="space-y-3">
                                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Final Step: Workspace Activation</h2>
                                    <p className="text-[14px] text-gray-400 font-medium leading-relaxed max-w-xl">
                                        Connect your official Google account to activate automated interview scheduling and workspace synchronization.
                                    </p>
                                </div>

                                {/* Integration Row (SaaS Style) */}
                                <div className="relative">
                                    <div className="bg-gray-50/30 rounded-2xl border border-gray-100 p-6 flex flex-col md:flex-row items-center gap-6 transition-all hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                                        <div className="h-12 w-12 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center shrink-0">
                                            <svg className="h-6 w-6" viewBox="0 0 24 24">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                            </svg>
                                        </div>

                                        <div className="flex-1 text-center md:text-left">
                                            <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                                                <h3 className="text-[15px] font-bold text-gray-900 font-sans tracking-tight">Syncing Workspace Identity</h3>
                                                <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[9px] font-black uppercase tracking-wider border border-orange-100/50">Required</span>
                                            </div>
                                            <p className="text-[12px] text-gray-400 font-medium">This Google inbox will be used for onboarding, invites, and application emails.</p>
                                        </div>

                                        <div className="shrink-0">
                                            {!googleStatus.isConnected ? (
                                                <button
                                                    type="button"
                                                    onClick={() => { setGoogleLoading(true); window.location.href = "/api/admin/integrations/google/authorize?next=/admin/setup"; }}
                                                    disabled={googleLoading}
                                                    className="h-11 px-6 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-[13px] hover:border-gray-900 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-sm"
                                                >
                                                    {googleLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : <ShieldCheck className="h-4 w-4 text-emerald-500" />}
                                                    Connect Google
                                                </button>
                                            ) : (
                                                <div className="h-11 px-5 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-3 text-emerald-700 font-bold text-[13px]">
                                                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                                    {googleStatus.email?.split('@')[0]}...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 rounded-2xl bg-orange-50/30 border border-orange-100/50 flex items-center gap-4">
                                    <div className="h-9 w-9 rounded-xl bg-white border border-orange-100 flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4 text-orange-500" />
                                    </div>
                                    <p className="text-[12px] text-orange-900/60 font-medium leading-relaxed">
                                        Almost there! Once connected, you can activate your workspace and start your first recruitment drive.
                                    </p>
                                </div>
                            </div>
                        )}

                        </div>

                        {/* Navigation Footer */}
                        <div className="bg-gray-50/70 px-8 py-5 flex justify-between items-center border-t border-gray-100 rounded-b-2xl">
                            {currentStep === 0 ? (
                                <button
                                    onClick={() => window.location.href = "/login"}
                                    className="group flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-all"
                                >
                                    <LogOut className="h-3 w-3 transition-transform group-hover:-translate-x-1" /> Back to Login
                                </button>
                            ) : (
                                <button
                                    disabled={isSaving}
                                    onClick={() => setCurrentStep(prev => prev - 1)}
                                    className="group flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-all"
                                >
                                    <ChevronLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" /> Back
                                </button>
                            )}
                            
                            {(() => {
                                const isProfileComplete = !!(profile.name && profile.jobTitle);
                                const isCompanyComplete = !!(company.name && company.website && company.industry && company.size && company.location);
                                const canContinue = currentStep === 0 ? isProfileComplete : currentStep === 1 ? isCompanyComplete : true;

                                return (
                                    <button
                                        onClick={handleNext}
                                        disabled={isSaving || isUploading || !canContinue}
                                        className={cn(
                                            "flex items-center gap-2 px-10 h-11 rounded-xl font-bold text-[13px] transition-all shadow-lg", 
                                            canContinue 
                                                ? "bg-gray-900 text-white hover:bg-black hover:-translate-y-0.5 active:scale-95" 
                                                : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                                        )}
                                    >
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : (currentStep === STEPS.length - 1 ? "Proceed to Dashboard" : "Continue")}
                                        {!isSaving && <ChevronRight className="h-3.5 w-3.5" />}
                                    </button>
                                );
                            })()}
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

                {/* FINAL WELCOME CARD (SaaS Popup) */}
                <AnimatePresence>
                    {showWelcomeCard && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-950/20 backdrop-blur-md">
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] overflow-hidden font-sans"
                            >
                                <div className="p-10 text-center space-y-6">
                                    <div className="h-20 w-20 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto text-orange-500 ring-1 ring-orange-100 shadow-sm">
                                        <Sparkles className="h-10 w-10" />
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-3xl font-bold text-gray-900 tracking-tight leading-none">Welcome to Sreeva AI</h2>
                                        <p className="text-[14px] text-gray-500 font-medium leading-relaxed">
                                            Your workspace has been successfully activated. You're ready to start your first AI-powered recruitment drive.
                                        </p>
                                    </div>
                                    <div className="pt-4">
                                        <button
                                            onClick={() => window.location.href = "/admin"}
                                            className="w-full h-12 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-sm transition-all shadow-xl shadow-gray-200 active:scale-95 flex items-center justify-center gap-2"
                                        >
                                            Let's Go
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-gray-50/50 border-t border-gray-100 py-4 text-center">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-sans">Secured by Sreeva AI Network</p>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Page Security Footer */}
                <div className="mt-8 text-center space-y-1 opacity-50">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-sans">Secured by Sreeva AI Network</p>
                    <p className="text-[8px] font-medium text-gray-300 font-sans">Sreeva AI Cloud Identity & Access Mgmt</p>
                </div>
            </div>
        </div>
    );
}

