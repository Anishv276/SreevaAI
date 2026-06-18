"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    User, Globe, Eye, EyeOff, Mail,
    ChevronRight, Loader2, Sparkles,
    Camera, X, LogOut, Lock, Building2, KeyRound
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { validatePasswordStrength } from "@/lib/validation";
import { toast } from "@/components/ui/toast-custom";
function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {label}{required && <span className="text-orange-500 ml-0.5">*</span>}
            </label>
            {children}
            {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
        </div>
    );
}
function InputIcon({ icon, ...props }: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">{icon}</div>
            <input
                {...props}
                className={cn(
                    "h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-[13px] font-medium text-gray-900 transition-colors outline-none",
                    "border-gray-200 hover:border-gray-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-100",
                    props.disabled && "bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100",
                    props.className
                )}
            />
        </div>
    );
}
export default function OnboardingPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const hasLoaded = useRef(false);
    const [profile, setProfile] = useState({ name: "", email: "" });
    const [passwords, setPasswords] = useState({ current: "", next: "" });
    const [showPw, setShowPw] = useState({ current: false, next: false });
    const [pwError, setPwError] = useState<string | null>(null);
    const [company, setCompany] = useState({ name: "", website: "", logoUrl: "" });
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
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
                    if (data.onboardingComplete === true) { router.replace("/admin"); return; }
                    const sanitized = { ...data };
                    Object.keys(sanitized).forEach(k => { if (sanitized[k] === null) sanitized[k] = ""; });
                    setCompany(prev => ({ ...prev, ...sanitized }));
                }
                if (profileRes.ok) {
                    const p = await profileRes.json();
                    setProfile({ name: p.name || "", email: p.email || "" });
                }
                const draft = localStorage.getItem("onboarding_draft");
                if (draft) {
                    try {
                        const { company: dc, profile: dp } = JSON.parse(draft);
                        if (dc) setCompany(prev => ({ ...prev, ...dc }));
                        if (dp) setProfile(prev => ({ ...prev, ...dp }));
                    } catch { localStorage.removeItem("onboarding_draft"); }
                }
            } catch (e) { console.error(e); }
            finally { setIsLoading(false); }
        };
        load();
    }, []);
    useEffect(() => {
        if (isLoading) return;
        const t = setTimeout(() => {
            localStorage.setItem("onboarding_draft", JSON.stringify({ company, profile }));
        }, 800);
        return () => clearTimeout(t);
    }, [company, profile, isLoading]);
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) { toast.error("Must be an image file."); return; }
        if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB."); return; }
        const oldUrl = company.logoUrl;
        setIsUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload/logo", { method: "POST", body: fd });
            if (!res.ok) throw new Error("Upload failed.");
            const { url } = await res.json();
            if (oldUrl) fetch("/api/upload/logo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: oldUrl }) });
            setCompany(prev => ({ ...prev, logoUrl: url }));
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsUploading(false);
            e.target.value = "";
        }
    };
    const handleRemoveLogo = async () => {
        if (!company.logoUrl) return;
        setIsUploading(true);
        try {
            await fetch("/api/upload/logo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: company.logoUrl }) });
            setCompany(prev => ({ ...prev, logoUrl: "" }));
        } finally { setIsUploading(false); }
    };
    const handleActivate = async () => {
        if (!profile.name) { toast.error("Full name is required."); return; }
        if (!company.name || !company.website) { toast.error("Company name and website are required."); return; }
        const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,63})([/\w .-]*)*\/?$/;
        if (!urlRegex.test(company.website)) { toast.error("Enter a valid website URL."); return; }
        if (passwords.next) {
            const { isValid, error: e } = validatePasswordStrength(passwords.next);
            if (!isValid) { setPwError(e || "Invalid password."); return; }
        }
        setPwError(null);
        setIsSaving(true);
        try {
            const res = await fetch("/api/admin/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phase: "complete", data: { profile, company, passwords: passwords.next ? passwords : undefined } })
            });
            if (!res.ok) { const d = await res.json(); toast.error(d.error || "Activation failed."); return; }
            localStorage.removeItem("onboarding_draft");
            setShowWelcomeCard(true);
        } catch (err: any) {
            toast.error(err.message);
        } finally { setIsSaving(false); }
    };
    const canActivate = !!(profile.name && company.name && company.website);
    if (isLoading) return (
        <div className="h-screen flex items-center justify-center bg-gray-50">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
    );
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-4xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-orange-500 shadow-lg shadow-orange-200 mb-4">
                        <Building2 className="h-7 w-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Set up your workspace</h1>
                    <p className="text-gray-500 text-sm mt-1">Takes less than 2 minutes</p>
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                    {/* LEFT — Profile */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center">
                                <User className="h-4 w-4 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Your Profile</p>
                                <p className="text-[11px] text-gray-400">Personal details</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <Field label="Full Name" required>
                                <InputIcon
                                    icon={<User className="h-3.5 w-3.5" />}
                                    placeholder="Jane Smith"
                                    value={profile.name}
                                    onChange={e => setProfile({ ...profile, name: e.target.value })}
                                />
                            </Field>
                            <Field label="Email" hint="Cannot be changed here">
                                <InputIcon
                                    icon={<Mail className="h-3.5 w-3.5" />}
                                    value={profile.email}
                                    disabled
                                    readOnly
                                />
                            </Field>
                            <div className="pt-2 border-t border-gray-100">
                                <div className="flex items-center gap-2 mb-3">
                                    <KeyRound className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Password</span>
                                    <span className="text-[10px] text-gray-400">(optional)</span>
                                </div>
                                <div className="space-y-3">
                                    <Field label="Current Password">
                                        <div className="relative">
                                            <input
                                                type={showPw.current ? "text" : "password"}
                                                placeholder="••••••••"
                                                value={passwords.current}
                                                onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                                                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 pr-9 text-[13px] font-medium text-gray-900 outline-none hover:border-gray-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-colors placeholder:text-gray-300"
                                            />
                                            <button type="button" onClick={() => setShowPw(p => ({ ...p, current: !p.current }))} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                {showPw.current ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                    </Field>
                                    <Field label="New Password">
                                        <div className="relative">
                                            <input
                                                type={showPw.next ? "text" : "password"}
                                                placeholder="Min. 8 characters"
                                                value={passwords.next}
                                                onChange={e => setPasswords({ ...passwords, next: e.target.value })}
                                                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 pr-9 text-[13px] font-medium text-gray-900 outline-none hover:border-gray-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-colors placeholder:text-gray-300"
                                            />
                                            <button type="button" onClick={() => setShowPw(p => ({ ...p, next: !p.next }))} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                {showPw.next ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                        {pwError && <p className="text-[11px] text-red-500 mt-1">{pwError}</p>}
                                    </Field>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* RIGHT — Company */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center">
                                <Building2 className="h-4 w-4 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Company</p>
                                <p className="text-[11px] text-gray-400">Your organization details</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Logo upload */}
                            <Field label="Company Logo">
                                <div className="flex items-center gap-4">
                                    <div className="relative shrink-0">
                                        <div className={cn(
                                            "h-16 w-16 rounded-xl border-2 overflow-hidden flex items-center justify-center transition-colors",
                                            company.logoUrl ? "border-orange-200 bg-orange-50/30" : "border-dashed border-gray-200 bg-gray-50"
                                        )}>
                                            {isUploading ? (
                                                <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
                                            ) : company.logoUrl ? (
                                                <img src={company.logoUrl} className="h-full w-full object-contain p-2" alt="Logo" />
                                            ) : (
                                                <Building2 className="h-6 w-6 text-gray-300" />
                                            )}
                                        </div>
                                        {/* Camera button overlay */}
                                        <label htmlFor="logo_up" className="absolute -bottom-1.5 -right-1.5 h-6 w-6 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center cursor-pointer shadow-sm hover:bg-orange-600 transition-colors">
                                            <Camera className="h-3 w-3 text-white" />
                                        </label>
                                        <input id="logo_up" type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={isUploading} />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[12px] font-medium text-gray-700">
                                            {company.logoUrl ? "Logo uploaded" : "Upload your logo"}
                                        </p>
                                        <p className="text-[11px] text-gray-400">PNG, JPG or SVG · max 2MB</p>
                                        {company.logoUrl && (
                                            <button
                                                type="button"
                                                onClick={handleRemoveLogo}
                                                disabled={isUploading}
                                                className="text-[11px] text-red-400 hover:text-red-600 font-medium transition-colors"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </Field>
                            <Field label="Company Name" required>
                                <InputIcon
                                    icon={<Building2 className="h-3.5 w-3.5" />}
                                    placeholder="Acme Corp"
                                    value={company.name}
                                    onChange={e => setCompany({ ...company, name: e.target.value })}
                                />
                            </Field>
                            <Field label="Official Website" required>
                                <InputIcon
                                    icon={<Globe className="h-3.5 w-3.5" />}
                                    placeholder="acme.com"
                                    value={company.website}
                                    onChange={e => setCompany({ ...company, website: e.target.value })}
                                />
                            </Field>
                        </div>
                    </div>
                </div>
                {/* Footer */}
                <div className="mt-5 flex items-center justify-between">
                    <button
                        onClick={() => window.location.href = "/login"}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        Back to Login
                    </button>
                    <button
                        onClick={handleActivate}
                        disabled={isSaving || isUploading || !canActivate}
                        className={cn(
                            "flex items-center gap-2 px-6 h-10 rounded-xl font-semibold text-[13px] transition-all",
                            canActivate && !isSaving
                                ? "bg-orange-500 text-white hover:bg-orange-600 shadow-md shadow-orange-200 active:scale-95"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        )}
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Activate Workspace <ChevronRight className="h-3.5 w-3.5" /></>}
                    </button>
                </div>
                <p className="text-center text-[10px] text-gray-300 mt-6 font-medium tracking-widest uppercase">Secured by Sreeva AI</p>
            </div>
            {/* Welcome modal */}
            <AnimatePresence>
                {showWelcomeCard && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/30 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden"
                        >
                            <div className="p-8 text-center space-y-4">
                                <div className="h-16 w-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto text-orange-500">
                                    <Sparkles className="h-8 w-8" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">You're all set!</h2>
                                    <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                                        Your workspace is activated. Start your first AI-powered recruitment drive.
                                    </p>
                                </div>
                                <button
                                    onClick={() => window.location.href = "/admin"}
                                    className="w-full h-11 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                                >
                                    Go to Dashboard <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}