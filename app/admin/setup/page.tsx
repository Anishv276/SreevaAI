"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Globe, Eye, EyeOff,
    ChevronRight, Loader2, Sparkles,
    LogOut, Building2, KeyRound
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { validatePasswordStrength } from "@/lib/validation";
import { toast } from "@/components/ui/toast-custom";
import { useAuth } from "@/context/auth-context";
function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {label}{required && <span className="text-violet-500 ml-0.5">*</span>}
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
                    "border-gray-200 hover:border-gray-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100",
                    props.disabled && "bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100",
                    props.className
                )}
            />
        </div>
    );
}
export default function OnboardingPage() {
    const router = useRouter();
    const { user, refreshUser } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const hasLoaded = useRef(false);
    const [passwords, setPasswords] = useState({ current: "", next: "" });
    const [showPw, setShowPw] = useState({ current: false, next: false });
    const [pwError, setPwError] = useState<string | null>(null);
    const [company, setCompany] = useState({ name: "" });
    const [isSaving, setIsSaving] = useState(false);
    const [showWelcomeCard, setShowWelcomeCard] = useState(false);
    useEffect(() => {
        if (hasLoaded.current) return;
        hasLoaded.current = true;
        const load = async () => {
            try {
                await refreshUser();
                const orgRes = await fetch("/api/admin/organization");
                if (orgRes.ok) {
                    const data = await orgRes.json();
                    if (data.onboardingComplete === true) { router.replace("/admin"); return; }
                    const sanitized = { ...data };
                    Object.keys(sanitized).forEach(k => { if (sanitized[k] === null) sanitized[k] = ""; });
                    setCompany(prev => ({ ...prev, ...sanitized }));
                }
                const draft = localStorage.getItem("onboarding_draft");
                if (draft) {
                    try {
                        const { company: dc } = JSON.parse(draft);
                        if (dc) setCompany(prev => ({ ...prev, ...dc }));
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
            localStorage.setItem("onboarding_draft", JSON.stringify({ company }));
        }, 800);
        return () => clearTimeout(t);
    }, [company, isLoading]);
    const handleActivate = async () => {
        if (!company.name) { toast.error("Company name is required."); return; }
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
                body: JSON.stringify({ phase: "complete", data: { company, passwords: passwords.next ? passwords : undefined } })
            });
            if (!res.ok) { const d = await res.json(); toast.error(d.error || "Activation failed."); return; }
            localStorage.removeItem("onboarding_draft");
            setShowWelcomeCard(true);
        } catch (err: any) {
            toast.error(err.message);
        } finally { setIsSaving(false); }
    };
    const canActivate = !!(company.name);
    if (isLoading) return (
        <div className="h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
    );
    return (
        <div className="min-h-screen flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-4xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-violet-500 shadow-lg shadow-orange-200 mb-4">
                        <Building2 className="h-7 w-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Set up your workspace</h1>
                    <p className="text-gray-500 text-sm mt-1">Takes less than 2 minutes</p>
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                    {/* LEFT — Password Management */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center">
                                <KeyRound className="h-4 w-4 text-violet-500" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Login Credentials</p>
                                <p className="text-[11px] text-gray-400">Password management</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="text-[12px] text-gray-600 mb-4">
                                <p>Update your login password. This is optional.</p>
                            </div>
                            <Field label="Current Password">
                                <div className="relative">
                                    <input
                                        type={showPw.current ? "text" : "password"}
                                        placeholder="••••••••"
                                        value={passwords.current}
                                        onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 pr-9 text-[13px] font-medium text-gray-900 outline-none hover:border-gray-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors placeholder:text-gray-300"
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
                                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 pr-9 text-[13px] font-medium text-gray-900 outline-none hover:border-gray-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors placeholder:text-gray-300"
                                    />
                                    <button type="button" onClick={() => setShowPw(p => ({ ...p, next: !p.next }))} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showPw.next ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                                {pwError && <p className="text-[11px] text-red-500 mt-1">{pwError}</p>}
                            </Field>
                        </div>
                    </div>
                    {/* RIGHT — Company */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center">
                                <Building2 className="h-4 w-4 text-violet-500" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Company</p>
                                <p className="text-[11px] text-gray-400">Your organization details</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <Field label="Email Address">
                                <input
                                    type="email"
                                    value={user?.email || ""}
                                    disabled
                                    className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-[13px] font-medium text-gray-600 outline-none cursor-not-allowed"
                                />
                            </Field>
                            <Field label="Company Name" required>
                                <InputIcon
                                    icon={<Building2 className="h-3.5 w-3.5" />}
                                    placeholder="Acme Corp"
                                    value={company.name}
                                    onChange={e => setCompany({ ...company, name: e.target.value })}
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
                        disabled={isSaving || !canActivate}
                        className={cn(
                            "flex items-center gap-2 px-6 h-10 rounded-xl font-semibold text-[13px] transition-all",
                            canActivate && !isSaving
                                ? "bg-violet-500 text-white hover:bg-violet-600 shadow-md shadow-orange-200 active:scale-95"
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
                                <div className="h-16 w-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto text-violet-500">
                                    <Sparkles className="h-8 w-8" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">You're all set!</h2>
                                    <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                                        Your workspace is activated. Start your first AI-powered recruitment job.
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