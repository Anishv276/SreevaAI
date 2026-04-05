"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
    ShieldCheck, Building2, Users, Rocket, 
    Lock, Upload, Globe, Mail, Eye, EyeOff,
    CheckCircle2, ChevronRight, Loader2, Sparkles,
    AlertCircle, X, MapPin, Search, ChevronLeft,
    Trash2, Shield, Plus, ImageIcon
} from "lucide-react"; 
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STEPS = ["Security", "Identity", "Team", "Review", "Ready"];

export default function OnboardingPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasLoaded = useRef(false);
    
    // Form States
    const [passwords, setPasswords] = useState({ next: "", confirm: "" });
    const [showPw, setShowPw] = useState(false);
    const [company, setCompany] = useState({ 
        name: "", 
        industry: "", 
        size: "", 
        website: "", 
        location: "",
        logoUrl: "" 
    });
    const [inviteEmail, setInviteEmail] = useState("");
    const [pendingInvites, setPendingInvites] = useState<{id?: string; email: string; role: string}[]>([]);
    
    // UI Helpers
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

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
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload/logo", { method: "POST", body: formData });
            if (!res.ok) throw new Error("Upload failed.");
            const { url } = await res.json();
            setCompany(prev => ({ ...prev, logoUrl: url }));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleInvite = async () => {
        if (!inviteEmail) return;
        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail, role: "recruiter" }),
            });
            const data = await res.json();
            
            if (res.ok) {
                setPendingInvites([...pendingInvites, { 
                    id: data.invite?.id,
                    email: inviteEmail, 
                    role: "recruiter" 
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
                if (passwords.next.length < 8) { setError("Security policy violation."); setIsSaving(false); return; }
                await fetch("/api/admin/setup", { method: "POST", body: JSON.stringify({ phase: "security", data: { password: passwords.next } }) });
            }
            if (currentStep === 1) {
                // IDENTITY PERSISTENCE: Now includes Name check
                if (!company.name) { setError("Organization Name is required."); setIsSaving(false); return; }
                await fetch("/api/admin/setup", { method: "POST", body: JSON.stringify({ phase: "branding", data: company }) });
            }
            if (currentStep === STEPS.length - 1) {
                await fetch("/api/admin/setup", { method: "POST", body: JSON.stringify({ phase: "complete" }) });
                router.push("/admin");
                // HARD REFRESH: To ensure Sidebar detects completion instantly
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
            <div className="mb-10 animate-in-fade">
                <div className="flex items-center gap-4 mb-3">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full" />
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 uppercase italic tracking-tighter">Workspace Onboarding</h1>
                        <p className="text-gray-500 font-medium">Step {currentStep + 1} Protocol: {STEPS[currentStep]}</p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-6 flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-[10px] font-black uppercase italic">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </div>
                    <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
                </div>
            )}

            <div className="flex items-center justify-between mb-12 px-4 select-none">
                {STEPS.map((step, i) => (
                    <div key={step} className="flex items-center gap-3 group">
                        <div className={cn(
                            "h-10 w-10 rounded-[1.25rem] flex items-center justify-center text-sm font-black transition-all duration-500",
                            currentStep >= i ? "bg-[#F97316] text-white shadow-lg shadow-orange-100" : "bg-gray-100 text-gray-400"
                        )}>
                            {currentStep > i ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                        </div>
                        <span className={cn("hidden md:block text-[10px] font-black uppercase tracking-widest", currentStep >= i ? "text-gray-900" : "text-gray-400")}>{step}</span>
                        {i < STEPS.length - 1 && <div className={cn("h-px w-10 mx-1", currentStep > i ? "bg-orange-200" : "bg-gray-100")} />}
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-[0_40px_100px_rgba(0,0,0,0.04)] border-t-[10px] border-t-[#F97316] overflow-hidden">
                <div className="p-10 md:p-14">
                    
                    {/* Security */}
                    {currentStep === 0 && (
                        <div className="space-y-12 animate-in-slide">
                            <div className="flex items-center gap-8 p-8 rounded-[2.5rem] bg-orange-50/40 border border-orange-100/50">
                                <div className="h-20 w-20 bg-white rounded-3xl flex items-center justify-center text-[#F97316] shadow-sm"><ShieldCheck className="h-10 w-10" /></div>
                                <div className="flex-1">
                                    <h3 className="font-black text-gray-900 uppercase italic text-2xl leading-none">Security Encryption</h3>
                                    <p className="text-[11px] text-gray-500 font-bold uppercase mt-3 tracking-widest">PRIVATE ADMINISTRATION KEY SYNC</p>
                                </div>
                            </div>
                            <div className="max-w-lg space-y-3">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1 italic">Administrator Password</label>
                                <input type={showPw ? "text" : "password"} className="w-full h-18 px-8 bg-gray-50/50 border border-gray-100 rounded-2xl font-black text-lg outline-none focus:bg-white focus:ring-8 focus:ring-orange-900/5 transition-all" value={passwords.next} onChange={e => setPasswords({...passwords, next: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {/* Identity (FIXED: Added name field) */}
                    {currentStep === 1 && (
                        <div className="space-y-10 animate-in-slide">
                            <div className="flex flex-col md:flex-row items-center gap-8">
                                <div className="relative">
                                    <input type="file" id="logo_up" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                    <label htmlFor="logo_up" className={cn("h-40 w-40 rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300", company.logoUrl ? "border-orange-200 bg-orange-50/30 shadow-inner" : "border-gray-200 bg-gray-50 hover:border-orange-400 hover:bg-orange-50")}>
                                        {isUploading ? <Loader2 className="h-8 w-8 animate-spin text-orange-500" /> : company.logoUrl ? <img src={company.logoUrl} className="h-full w-full object-contain p-6" /> : <Upload className="h-8 w-8 text-gray-300" />}
                                    </label>
                                </div>
                                <div className="flex-1 w-full space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic leading-none">Organization Name</label>
                                        <input className="w-full h-14 px-6 bg-gray-50 border border-gray-100 rounded-2xl font-black outline-none focus:bg-white transition-all text-sm uppercase" value={company.name || ""} onChange={e => setCompany({...company, name: e.target.value})} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic leading-none">Website</label>
                                            <input className="w-full h-14 px-6 bg-gray-50 border border-gray-100 rounded-2xl font-black outline-none focus:bg-white transition-all text-sm" value={company.website || ""} onChange={e => setCompany({...company, website: e.target.value})} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic leading-none">Location</label>
                                            <input className="w-full h-14 px-6 bg-gray-50 border border-gray-100 rounded-2xl font-black outline-none focus:bg-white transition-all text-sm uppercase" value={company.location || ""} onChange={e => setCompany({...company, location: e.target.value})} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-6 pt-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic leading-none">Industrial Sector</label>
                                    <select className="h-14 w-full px-6 bg-gray-50 border border-gray-100 rounded-2xl font-black text-[10px] uppercase outline-none focus:ring-4 focus:ring-orange-900/5" value={company.industry || ""} onChange={e => setCompany({...company, industry: e.target.value})}>
                                        <option value="">Sector</option><option>SAAS / TECHNOLOGY</option><option>FINANCIAL SERVICES</option><option>LOGISTICS</option><option>RETAIL</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic leading-none">Staffing Quota</label>
                                    <select className="h-14 w-full px-6 bg-gray-50 border border-gray-100 rounded-2xl font-black text-[10px] uppercase outline-none focus:ring-4 focus:ring-orange-900/5" value={company.size || ""} onChange={e => setCompany({...company, size: e.target.value})}>
                                        <option value="">Staffing</option><option>1–50 EMPLOYEES</option><option>51–250 EMPLOYEES</option><option>251–1000 EMPLOYEES</option><option>1001+</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Team */}
                    {currentStep === 2 && (
                        <div className="space-y-10 animate-in-slide">
                            <div className="bg-gray-50/50 p-8 rounded-[2.5rem] flex flex-col md:flex-row items-end gap-4 shadow-inner">
                                <div className="flex-1 w-full space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 italic leading-none">Personnel Email Address</label>
                                    <input className="w-full h-14 px-6 bg-white border border-gray-100 rounded-2xl font-black outline-none focus:ring-8 focus:ring-orange-900/5 transition-all text-sm" placeholder="COLLEAGUE@COMPANY.COM" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                                </div>
                                <button onClick={handleInvite} className="h-14 px-8 bg-black text-white rounded-2xl font-black text-[10px] uppercase shadow-2xl hover:scale-102 transition-all">Invite Now</button>
                            </div>
                            <div className="space-y-3">
                                {pendingInvites.length === 0 ? <p className="text-center text-[10px] py-12 font-black uppercase text-gray-300 italic">No deployments queued</p> : (
                                    pendingInvites.map(m => (
                                        <div key={m.email} className="flex items-center justify-between p-5 bg-white border border-gray-100 rounded-3xl group shadow-sm hover:border-orange-200 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center font-black text-xs">{m.email[0]}</div>
                                                <div><p className="text-sm font-black text-gray-900 uppercase italic tracking-tight">{m.email}</p><p className="text-[9px] text-orange-500 font-bold uppercase tracking-widest italic opacity-70 leading-none">RECRUITER ACCESS</p></div>
                                            </div>
                                            <button onClick={() => removeInvite(m)} className="h-10 w-10 flex items-center justify-center text-gray-300 hover:text-red-500 transition-all"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Review */}
                    {currentStep === 3 && (
                        <div className="space-y-10 animate-in-slide">
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="p-8 bg-gray-50 border border-gray-100 rounded-[2.5rem] space-y-6">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] italic">Identity Sync</label>
                                    <div className="flex items-center gap-5">
                                        <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center border border-gray-100 p-2 shadow-sm">
                                            {company.logoUrl ? <img src={company.logoUrl} className="h-full w-full object-contain" /> : <Building2 className="text-gray-100 h-8 w-8" />}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-lg font-black text-gray-950 uppercase italic leading-none">{company.name || "UNNAMED CORP"}</p>
                                            <p className="text-[10px] text-gray-400 font-black uppercase opacity-60 leading-none">{company.industry} · {company.location}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-8 bg-black border border-gray-800 rounded-[2.5rem] space-y-6">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic">System Status</label>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between"><span className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic">Security Key</span><Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[9px] italic">ENCRYPTED</Badge></div>
                                        <div className="flex items-center justify-between"><span className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic">Team Quota</span><Badge className="bg-purple-500/10 text-purple-400 border-0 text-[9px] italic">{pendingInvites.length} MEMBERS</Badge></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Ready */}
                    {currentStep === 4 && (
                        <div className="py-20 text-center space-y-8 animate-in-scale">
                            <div className="h-32 w-32 bg-white border border-gray-200 rounded-[3rem] flex items-center justify-center mx-auto shadow-2xl animate-bounce-slow text-[#F97316]"><Rocket className="h-16 w-16 shadow-inner" /></div>
                            <div>
                                <h1 className="text-5xl font-black text-gray-950 uppercase italic leading-none tracking-tighter">Synchronized</h1>
                                <p className="text-[11px] text-gray-400 font-black uppercase italic tracking-[0.4em] mt-6 opacity-60 italic leading-none">System configuration ready for deployment.</p>
                            </div>
                        </div>
                    )}

                </div>

                <div className="bg-gray-50/70 p-12 flex justify-between items-center border-t border-gray-100">
                    <button disabled={currentStep === 0 || isSaving} onClick={() => setCurrentStep(prev => prev - 1)} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-gray-300 hover:text-black disabled:opacity-0 transition-all italic tracking-tighter">
                        <ChevronLeft className="h-4 w-4" /> Protocol Back
                    </button>
                    <button onClick={handleNext} disabled={isSaving || isUploading} className={cn("flex items-center gap-4 px-12 h-18 rounded-3xl font-black text-[12px] uppercase shadow-[0_20px_40px_-10px_rgba(249,115,22,0.2)] transition-all active:scale-95 italic", currentStep === STEPS.length - 1 ? "bg-black text-white hover:bg-gray-900" : "bg-[#F97316] text-white hover:bg-orange-600 shadow-orange-100")}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : (currentStep === STEPS.length - 1 ? "Initialize Command" : "Advance Protocol")}
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    </div>
    );
}
