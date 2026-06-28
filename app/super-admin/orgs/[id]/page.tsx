"use client";
import { useEffect, useState, use, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Mail, ShieldCheck, Globe, RefreshCw, ChevronRight, Coins, ChevronDown, Loader2, Shield, Layers, Lock, Clock, Eye, EyeOff } from "lucide-react";
import { toast } from "@/components/ui/toast-custom";
import { ProctoringSignalsSection } from "@/components/super-admin/proctoring-signals-section";
import { DEFAULT_ORG_PLAN, ORG_PLAN_OPTIONS, normalizeOrgPlan } from "@/lib/org-plans";
import { getProctoringSignalsForPlan, normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { cn } from "@/lib/utils";
import { Steps } from "@/components/create-drive/steps";
import { formatOrgLimitValue } from "@/lib/org-limits";
// UI Components
function PremiumInput({ label, icon: Icon, error, required = true, type = "text", showPasswordToggle = false, ...props }: any) {
    const [showPassword, setShowPassword] = useState(false);
    const isPasswordField = type === "password" && showPasswordToggle;
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                <Icon className="h-3 w-3 text-[#7C3AED]" />
                {label}
                {required && <span className="text-[#7C3AED] ml-0.5">*</span>}
            </label>
            <div className="relative">
                <input
                    {...props}
                    type={isPasswordField ? (showPassword ? "text" : "password") : type}
                    onWheel={type === "number" ? (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur() : props.onWheel}
                    className={cn(
                        "h-10 w-full rounded-lg bg-white border border-gray-200 px-3 text-[14px] font-medium shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED] hover:border-violet-300 hover:shadow-md",
                        isPasswordField ? "pr-10" : "",
                        error && "border-red-500"
                    )}
                />
                {isPasswordField ? (
                    <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-[#7C3AED] transition-colors"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
function SectionHeader({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-3 mb-6">
            <span className="h-6 w-1 rounded-full bg-[#7C3AED]" />
            <p className="text-[14px] font-bold text-gray-900 uppercase tracking-widest">{title}</p>
        </div>
    );
}
function LimitControl({ value, onChange, label }: { value: string, onChange: (val: string) => void, label: string }) {
    const isUnlimited = String(value).toLowerCase() === "unlimited" || Number(value) === 0;
    const [localValue, setLocalValue] = useState(isUnlimited ? "" : String(value));
    useEffect(() => { if (!isUnlimited) setLocalValue(String(value)); }, [value, isUnlimited]);
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest"><Layers className="h-3 w-3 text-[#7C3AED]" /> {label}</label>
            <div className="flex items-center gap-1.5">
                <div className="flex bg-gray-100/50 p-1 rounded-lg border border-gray-100 w-fit shrink-0">
                    <button type="button" onClick={() => onChange("Unlimited")} className={cn("px-3 h-7 rounded-md text-[10px] font-bold uppercase transition-all", isUnlimited ? "bg-white text-[#7C3AED] shadow-sm" : "text-gray-400 hover:text-gray-600")}>Unlimited</button>
                    <button type="button" onClick={() => { if (isUnlimited) onChange("1"); }} className={cn("px-3 h-7 rounded-md text-[10px] font-bold uppercase transition-all", !isUnlimited ? "bg-white text-[#7C3AED] shadow-sm" : "text-gray-400 hover:text-gray-600")}>Limited</button>
                </div>
                {!isUnlimited && <input type="text" inputMode="numeric" pattern="[0-9]*" min="1" value={localValue} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setLocalValue(v); if (v !== "") onChange(String(Math.max(1, Number(v)))); }} onBlur={() => { const n = Math.max(1, Number(localValue) || 1); setLocalValue(String(n)); onChange(String(n)); }} onWheel={(e) => e.currentTarget.blur()} className="h-9 w-16 rounded-lg border border-gray-200 bg-white px-2 text-sm font-bold text-gray-900 focus:border-[#7C3AED] outline-none text-center shadow-sm" />}
            </div>
        </div>
    );
}
export default function EditOrgPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [interviewQuotaTotalInput, setInterviewQuotaTotalInput] = useState("0");
    const [interviewTopUpInput, setInterviewTopUpInput] = useState("0");
    const [billingSnapshot, setBillingSnapshot] = useState({
        interviewQuotaTotal: 0,
        interviewQuotaUsed: 0,
        interviewQuotaRemaining: 0,
    });
    const [form, setForm] = useState({
        name: "", slug: "", plan: DEFAULT_ORG_PLAN,
        maxActiveDrives: "Unlimited",
        proctoringSignals: getProctoringSignalsForPlan(DEFAULT_ORG_PLAN),
        adminEmail: "", adminPassword: "",
        recordingEnabled: false,
        recordingRetentionDays: "",
    });
    useEffect(() => {
        const fetchOrg = async () => {
            try {
                const res = await fetch(`/api/super-admin/orgs/${id}`);
                const data = await res.json();
                if (!res.ok) { setError("Organization not found"); return; }
                setForm({
                    name: data.name || "", slug: data.slug || "",
                    plan: normalizeOrgPlan(data.plan) || DEFAULT_ORG_PLAN,
                    maxActiveDrives: formatOrgLimitValue(data.maxActiveDrives),
                    proctoringSignals: normalizeProctoringSignals(data.proctoringSignals),
                    adminEmail: data.users && data.users.length > 0 ? data.users[0].email : "",
                    adminPassword: "",
                    recordingEnabled: data.recordingEnabled === true && data.recordingRetentionDays != null,
                    recordingRetentionDays: data.recordingRetentionDays == null ? "" : String(data.recordingRetentionDays),
                });
                setBillingSnapshot({
                    interviewQuotaTotal: Number(data.interviewQuotaTotal || 0),
                    interviewQuotaUsed: Number(data.interviewQuotaUsed || 0),
                    interviewQuotaRemaining: Math.max(0, Number(data.interviewQuotaTotal || 0) - Number(data.interviewQuotaUsed || 0)),
                });
                setInterviewQuotaTotalInput(String(Number(data.interviewQuotaTotal || 0)));
            } catch { setError("Failed to load organization"); }
            finally { setLoading(false); }
        };
        fetchOrg();
    }, [id]);
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (form.recordingEnabled) {
            const retentionDays = Number(form.recordingRetentionDays);
            if (!Number.isFinite(retentionDays) || retentionDays < 1) {
                toast.error("Recording retention days must be at least 1");
                return;
            }
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/super-admin/orgs/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    recordingEnabled: form.recordingEnabled ? true : null,
                    recordingRetentionDays: form.recordingEnabled ? Number(form.recordingRetentionDays) : null,
                    interviewQuotaTotal: Math.max(0, Number(interviewQuotaTotalInput) || 0),
                    interviewQuotaTopUp: Math.max(0, Number(interviewTopUpInput) || 0),
                }),
            });
            if (!res.ok) throw new Error("Failed to update records");
            toast.success("Organization updated!");
        } catch (err: any) { toast.error(err.message); }
        finally { setSaving(false); }
    };
    if (loading) { return <div className="p-20 text-center min-h-screen flex items-center justify-center"><RefreshCw className="h-8 w-8 text-[#7C3AED] animate-spin opacity-20" /></div>; }
    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-10 animate-in fade-in duration-500">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-all" style={{ border: "1px solid #E9E7FF" }}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </button>
            </div>
            <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Modify Client</h1>
                <p className="text-sm text-gray-400 mt-0.5">Updating <span className="font-medium text-gray-700">{form.name}</span></p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-500">
                <div
                    className="rounded-2xl bg-white"
                    style={{ border: "1px solid #E9E7FF", borderTop: "3px solid #8B5CF6", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}
                >
                    <div className="p-6 space-y-8">
                {true && (
                    <div className="space-y-8">
                        <SectionHeader title="Organization Profile" />
                        <div className="grid md:grid-cols-2 gap-6">
                            <PremiumInput label="Company Name" icon={Building2} value={form.name} onChange={(e: any) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Reliance Group" required />
                            <PremiumInput label="URL Identifier" icon={Globe} value={form.slug} onChange={(e: any) => setForm(p => ({ ...p, slug: e.target.value.toLowerCase() }))} placeholder="slug-path" required />
                        </div>
                    </div>
                )}
                {true && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <SectionHeader title="Master Administrator" />
                        <div className="grid md:grid-cols-2 gap-6">
                            <PremiumInput label="Contact Email" icon={Mail} type="email" value={form.adminEmail} onChange={(e: any) => setForm(p => ({ ...p, adminEmail: e.target.value }))} placeholder="admin@reliance.com" required />
                        </div>
                        <div className="bg-violet-50/50 p-6 rounded-2xl border border-violet-100 mt-6 flex items-start gap-4">
                            <div className="p-2 rounded-lg bg-white border border-violet-100"><ShieldCheck className="h-5 w-5 text-violet-500" /></div>
                            <div>
                                <p className="text-xs font-semibold text-gray-900 uppercase tracking-widest">Authentication Security</p>
                                <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-1">If you need to reset the administrator password, enter a new one below. Leave it blank to keep the current credentials.</p>
                                <div className="mt-4 max-w-sm">
                                    <PremiumInput
                                        label="Update Password (Optional)"
                                        icon={Lock}
                                        type="password"
                                        showPasswordToggle
                                        value={form.adminPassword}
                                        onChange={(e: any) => setForm(p => ({ ...p, adminPassword: e.target.value }))}
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {/* AI Engine — managed via AI Models page */}
                <div className="rounded-2xl p-5 flex items-start gap-4" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.07), rgba(59,130,246,0.04))", border: "1px solid rgba(139,92,246,0.18)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))" }}>
                        <span className="text-violet-600 text-sm">🤖</span>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-violet-800 mb-1">AI Models are configured separately</p>
                        <p className="text-sm text-violet-700">
                            To set LLM pipelines, STT model, TTS provider, and allowed voices for this org — use the{" "}
                            <a href="/super-admin/models" className="font-bold underline underline-offset-2 hover:text-violet-900 transition-colors">
                                AI Models page
                            </a>
                            . Select this org from the left panel and configure everything there.
                        </p>
                    </div>
                </div>
                {true && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <SectionHeader title="Billing & Quotas" />
                        <div className="grid md:grid-cols-1 gap-6 bg-gray-50/50 p-6 rounded-2xl border border-gray-100 shadow-inner">
                            <LimitControl label="Job Limit" value={form.maxActiveDrives} onChange={val => setForm(p => ({ ...p, maxActiveDrives: val }))} />
                        </div>
                        <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-6 space-y-5">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-600">Interview Quotas</p>
                                    <p className="text-sm font-medium text-gray-600 mt-1">
                                        Current total: <span className="font-semibold text-gray-900">{billingSnapshot.interviewQuotaTotal}</span>
                                        {" "} | 
                                        Used: <span className="font-semibold text-gray-900">{billingSnapshot.interviewQuotaUsed}</span>
                                        {" "} | Remaining: <span className="font-semibold text-gray-900">{billingSnapshot.interviewQuotaRemaining}</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">New total after save</p>
                                    <p className="text-lg font-semibold text-gray-900">
                                        {Math.max(0, Number(interviewQuotaTotalInput) || 0) + Math.max(0, Number(interviewTopUpInput) || 0)}
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <PremiumInput
                                    label="Total Interviews Allocated"
                                    icon={Coins}
                                    type="number"
                                    min="0"
                                    required={false}
                                    value={interviewQuotaTotalInput}
                                    onChange={(e: any) => setInterviewQuotaTotalInput(e.target.value)}
                                    placeholder="100"
                                />
                                <PremiumInput
                                    label="Top-Up Interviews"
                                    icon={Coins}
                                    type="number"
                                    min="0"
                                    required={false}
                                    value={interviewTopUpInput}
                                    onChange={(e: any) => setInterviewTopUpInput(e.target.value)}
                                    placeholder="50"
                                />
                            </div>
                            <p className="text-[11px] font-medium text-gray-500 leading-relaxed">
                                Use <span className="font-black text-gray-700">Total Interviews Allocated</span> to set the exact quota. Use <span className="font-black text-gray-700">Top-Up Interviews</span> only to add more on top of that total.
                            </p>
                        </div>
                    </div>
                )}
                {true && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <SectionHeader title="Recording Retention" />
                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                                    <Shield className="h-3 w-3 text-[#7C3AED]" />
                                    Recording Enabled
                                </label>
                                <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-2">
                                    <button
                                        type="button"
                                        onClick={() => setForm(p => ({ ...p, recordingEnabled: true }))}
                                        className={cn(
                                            "rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition",
                                            form.recordingEnabled ? "bg-white text-[#7C3AED] shadow-sm" : "text-gray-400 hover:text-gray-700"
                                        )}
                                    >
                                        ON
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForm(p => ({ ...p, recordingEnabled: false, recordingRetentionDays: "" }))}
                                        className={cn(
                                            "rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition",
                                            !form.recordingEnabled ? "bg-white text-rose-600 shadow-sm" : "text-gray-400 hover:text-gray-700"
                                        )}
                                    >
                                        OFF
                                    </button>
                                    <p className="ml-2 text-[11px] font-medium text-gray-500 leading-relaxed">
                                        When off, interview egress is blocked and recordings are not persisted.
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                                    <Clock className="h-3 w-3 text-[#7C3AED]" />
                                    Recording Retention (Days)
                                </label>
                                {form.recordingEnabled ? (
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        min="1"
                                        value={form.recordingRetentionDays}
                                        onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setForm(p => ({ ...p, recordingRetentionDays: v })); }}
                                        onBlur={() => { const n = Math.max(1, Number(form.recordingRetentionDays) || 1); setForm(p => ({ ...p, recordingRetentionDays: String(n) })); }}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#7C3AED] focus:ring-4 focus:ring-violet-100"
                                        placeholder="30"
                                    />
                                ) : (
                                    <div className="flex h-11 items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3.5 text-sm font-medium text-gray-400">
                                        Enable recording to configure retention days.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {true && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <SectionHeader title="Security & Network Plan" />
                        <div className="grid md:grid-cols-4 gap-8">
                            <div className="md:col-span-1 space-y-4">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Partner Plan</label>
                                {ORG_PLAN_OPTIONS.map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setForm(prev => ({
                                            ...prev,
                                            plan: p.id,
                                            proctoringSignals: getProctoringSignalsForPlan(p.id),
                                        }))}
                                        className={cn("w-full p-4 rounded-lg border text-left transition-all", form.plan === p.id ? "border-[#7C3AED] bg-violet-50 shadow-sm" : "border-gray-100 hover:border-gray-200")}
                                    >
                                        <p className="text-xs font-semibold uppercase text-gray-900">{p.label}</p>
                                        <p className="text-[10px] text-gray-400 font-medium mt-0.5">{p.desc}</p>
                                    </button>
                                ))}
                            </div>
                            <div className="md:col-span-3">
                                <ProctoringSignalsSection
                                    signals={form.proctoringSignals as any}
                                    disabled={form.plan === "STARTER"}
                                    onChange={(k, v) => setForm(p => ({ ...p, proctoringSignals: { ...p.proctoringSignals, [k]: v } }))}
                                />
                            </div>
                        </div>
                        <div className="pt-12 border-t border-gray-100 flex items-center justify-end">
                            <button type="submit" disabled={saving} className="h-14 px-16 rounded-lg bg-[#7C3AED] text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-200 hover:bg-orange-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3">
                                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Shield className="h-5 w-5" />} {saving ? "Saving..." : "Update"}
                            </button>
                        </div>
                    </div>
                )}
                    </div>
                </div>
            </form>
        </div>
    );
}
