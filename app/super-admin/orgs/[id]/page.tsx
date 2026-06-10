"use client";

import { useEffect, useState, use, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, User, Mail, ShieldCheck, Globe, RefreshCw, Play, Pause, MapPin as MapPinIcon, ChevronRight, Coins, ChevronDown, Loader2, Shield, Layers, AudioLines, Search, Lock, Clock, Eye, EyeOff } from "lucide-react";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { toast } from "@/components/ui/toast-custom";
import { ProctoringSignalsSection } from "@/components/super-admin/proctoring-signals-section";
import { ALL_VOICES, type Voice } from "@/lib/constants/voices";
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
                <Icon className="h-3 w-3 text-[#F97316]" />
                {label}
                {required && <span className="text-[#F97316] ml-0.5">*</span>}
            </label>
            <div className="relative">
                <input
                    {...props}
                    type={isPasswordField ? (showPassword ? "text" : "password") : type}
                    onWheel={type === "number" ? (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur() : props.onWheel}
                    className={cn(
                        "h-10 w-full rounded-lg bg-white border border-gray-200 px-3 text-[14px] font-medium shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] hover:border-orange-300 hover:shadow-md",
                        isPasswordField ? "pr-10" : "",
                        error && "border-red-500"
                    )}
                />
                {isPasswordField ? (
                    <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-[#F97316] transition-colors"
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
            <span className="h-6 w-1 rounded-full bg-[#F97316]" />
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
            <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest"><Layers className="h-3 w-3 text-[#F97316]" /> {label}</label>
            <div className="flex items-center gap-1.5">
                <div className="flex bg-gray-100/50 p-1 rounded-lg border border-gray-100 w-fit shrink-0">
                    <button type="button" onClick={() => onChange("Unlimited")} className={cn("px-3 h-7 rounded-md text-[10px] font-bold uppercase transition-all", isUnlimited ? "bg-white text-[#F97316] shadow-sm" : "text-gray-400 hover:text-gray-600")}>Unlimited</button>
                    <button type="button" onClick={() => { if (isUnlimited) onChange("1"); }} className={cn("px-3 h-7 rounded-md text-[10px] font-bold uppercase transition-all", !isUnlimited ? "bg-white text-[#F97316] shadow-sm" : "text-gray-400 hover:text-gray-600")}>Limited</button>
                </div>
                {!isUnlimited && <input type="text" inputMode="numeric" pattern="[0-9]*" min="1" value={localValue} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setLocalValue(v); if (v !== "") onChange(String(Math.max(1, Number(v)))); }} onBlur={() => { const n = Math.max(1, Number(localValue) || 1); setLocalValue(String(n)); onChange(String(n)); }} onWheel={(e) => e.currentTarget.blur()} className="h-9 w-16 rounded-lg border border-gray-200 bg-white px-2 text-sm font-bold text-gray-900 focus:border-[#F97316] outline-none text-center shadow-sm" />}
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
    const [previewLoading, setPreviewLoading] = useState(false);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
    const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
    const [voiceSearch, setVoiceSearch] = useState("");
    const [voices, setVoices] = useState<Voice[]>(ALL_VOICES);
    const [interviewQuotaTotalInput, setInterviewQuotaTotalInput] = useState("0");
    const [interviewTopUpInput, setInterviewTopUpInput] = useState("0");
    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const previewUrlRef = useRef<string | null>(null);
    const [billingSnapshot, setBillingSnapshot] = useState({
        interviewQuotaTotal: 0,
        interviewQuotaUsed: 0,
        interviewQuotaRemaining: 0,
    });

    const [form, setForm] = useState({
        name: "", slug: "", plan: DEFAULT_ORG_PLAN,
        maxActiveDrives: "Unlimited",
        proctoringSignals: getProctoringSignalsForPlan(DEFAULT_ORG_PLAN),
        location: "", adminName: "", adminEmail: "", adminPassword: "",
        voiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        allowedVoices: [] as string[],
        recordingEnabled: false,
        recordingRetentionDays: "",
    });

    const stopCurrentPreview = () => {
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.src = "";
            setActiveAudio(null);
        }
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
        gainNodeRef.current?.disconnect();
        gainNodeRef.current = null;
        audioContextRef.current?.close().catch(() => { });
        audioContextRef.current = null;
        setPlayingVoiceId(null);
    };

    const playSample = async (voiceId: string) => {
        if (playingVoiceId === voiceId) { stopCurrentPreview(); return; }
        setPreviewLoading(true);
        try {
            stopCurrentPreview();
            const transcript = "Hello buddy, how are you doing? I'm ready to interview candidates.";
            const res = await fetch("/api/admin/voice/preview", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voiceId, transcript, orgId: id }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Preview failed");
            const blob = await res.blob();
            const audioUrl = URL.createObjectURL(blob);
            previewUrlRef.current = audioUrl;
            const audio = new Audio(audioUrl);
            const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (AudioContextClass) {
                const ctx = new AudioContextClass();
                audioContextRef.current = ctx;
                const source = ctx.createMediaElementSource(audio);
                const gainNode = ctx.createGain();
                gainNode.gain.value = 2.5;
                gainNodeRef.current = gainNode;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                audio.onended = () => {
                    stopCurrentPreview();
                    URL.revokeObjectURL(audioUrl);
                };
                await ctx.resume().catch(() => { });
            } else {
                audio.onended = () => {
                    stopCurrentPreview();
                    URL.revokeObjectURL(audioUrl);
                };
            }
            await audio.play();
            setActiveAudio(audio);
            setPlayingVoiceId(voiceId);
        } catch (err) { toast.error("Preview failed."); }
        finally { setPreviewLoading(false); }
    };

    useEffect(() => {
        const loadVoices = async () => {
            try {
                const res = await fetch("/api/voices", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data?.voices) && data.voices.length > 0) {
                    setVoices(data.voices);
                }
            } catch {
                // Keep static fallback
            }
        };
        void loadVoices();

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
                    location: data.location || "",
                    adminName: data.users && data.users.length > 0 ? data.users[0].name : "",
                    adminEmail: data.users && data.users.length > 0 ? data.users[0].email : "",
                    adminPassword: "",
                    voiceId: data.voiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                    allowedVoices: Array.isArray(data.allowedVoices) ? data.allowedVoices : [],
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

    if (loading) { return <div className="p-20 text-center min-h-screen flex items-center justify-center"><RefreshCw className="h-8 w-8 text-[#F97316] animate-spin opacity-20" /></div>; }

    return (
        <div className="max-w-4xl mx-auto py-4 space-y-4 px-4 sm:px-6 lg:px-0">
            <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Organizations
            </button>

            <div className="mb-8 group">
                <div className="flex items-center gap-4 mb-3">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            Modify Client
                        </h1>
                        <p className="text-gray-500 font-medium mt-1 text-base sm:text-lg">
                            Updating <span className="text-gray-900 font-bold">{form.name}</span>
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div
                    className="rounded-2xl bg-white transition-all duration-300 relative"
                    style={{ border: "1px solid #E5E7EB", borderTop: "4px solid #F97316", boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)" }}
                >
                    <div className="p-8 space-y-10">
                {true && (
                    <div className="space-y-8">
                        <SectionHeader title="Organization Profile" />
                        <div className="grid md:grid-cols-2 gap-6">
                            <PremiumInput label="Company Name" icon={Building2} value={form.name} onChange={(e: any) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Reliance Group" required />
                            <PremiumInput label="URL Identifier" icon={Globe} value={form.slug} onChange={(e: any) => setForm(p => ({ ...p, slug: e.target.value.toLowerCase() }))} placeholder="slug-path" required />
                        </div>
                        <div className="pt-6 border-t border-gray-100">
                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest"><MapPinIcon className="h-3 w-3 text-[#F97316]" />Location</label>
                                <LocationAutocomplete value={form.location || ""} onChange={val => setForm(p => ({ ...p, location: val }))} placeholder="Mumbai, India" />
                            </div>
                        </div>
                    </div>
                )}

                {true && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <SectionHeader title="Master Administrator" />
                        <div className="grid md:grid-cols-2 gap-6">
                            <PremiumInput label="Admin Full Name" icon={User} value={form.adminName} onChange={(e: any) => setForm(p => ({ ...p, adminName: e.target.value }))} placeholder="Vikram Singh" required />
                            <PremiumInput label="Contact Email" icon={Mail} type="email" value={form.adminEmail} onChange={(e: any) => setForm(p => ({ ...p, adminEmail: e.target.value }))} placeholder="admin@reliance.com" required />
                        </div>
                        <div className="bg-orange-50/50 p-6 rounded-2xl border border-orange-100 mt-6 flex items-start gap-4">
                            <div className="p-2 rounded-lg bg-white border border-orange-100"><ShieldCheck className="h-5 w-5 text-orange-500" /></div>
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

                {true && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <SectionHeader title="AI Engine" />
                        <div className="grid md:grid-cols-2 gap-10">
                            {/* Allowed voices whitelist */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                                        <AudioLines className="h-3 w-3 text-[#F97316]" />Allowed Voices
                                    </label>
                                    <p className="text-[10px] text-gray-400 font-medium">Drives under this org will only see checked voices.</p>
                                    <div className="relative mb-2">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                        <input type="text" value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)} placeholder="Search voices..." className="h-8 w-full pl-8 pr-3 rounded-lg border border-gray-100 text-[11px] focus:outline-none" />
                                    </div>
                                    <div className="border border-gray-100 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                                        {voices.filter(v => v.name.toLowerCase().includes(voiceSearch.toLowerCase())).map(v => {
                                            const allowed = form.allowedVoices.includes(v.id);
                                            return (
                                                <div key={v.id} className={cn("flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0 transition-colors", allowed ? "bg-orange-50/40" : "bg-white hover:bg-gray-50")}>
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={allowed}
                                                            onChange={() => setForm(p => ({
                                                                ...p,
                                                                allowedVoices: allowed
                                                                    ? p.allowedVoices.filter(id => id !== v.id)
                                                                    : [...p.allowedVoices, v.id],
                                                            }))}
                                                            className="accent-[#F97316] h-3.5 w-3.5 flex-shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <p className={cn("text-xs font-bold truncate", allowed ? "text-orange-600" : "text-gray-800")}>{v.name}</p>
                                                            <p className="text-[9px] text-gray-400 truncate">{v.provider} · {v.description}</p>
                                                        </div>
                                                    </div>
                                                    <div onClick={(e) => { e.stopPropagation(); playSample(v.id); }} className={cn("h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ml-2 cursor-pointer transition-all", playingVoiceId === v.id ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-orange-100 hover:text-orange-600")}>
                                                        {previewLoading && playingVoiceId === v.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : playingVoiceId === v.id ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current ml-0.5" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[10px] text-gray-400">{form.allowedVoices.length} voice{form.allowedVoices.length !== 1 ? "s" : ""} selected</p>
                                </div>
                            </div>
                            {/* STT */}
                            <div className="space-y-6">
                                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-[11px] text-gray-500 space-y-1">
                                    <p className="font-bold text-gray-700 uppercase tracking-widest text-[10px]">STT</p>
                                    <p>Deepgram Flux - hardcoded for all orgs</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {true && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                        <SectionHeader title="Billing & Quotas" />
                        <div className="grid md:grid-cols-1 gap-6 bg-gray-50/50 p-6 rounded-2xl border border-gray-100 shadow-inner">
                            <LimitControl label="Job Limit" value={form.maxActiveDrives} onChange={val => setForm(p => ({ ...p, maxActiveDrives: val }))} />
                        </div>
                        <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-6 space-y-5">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-600">Interview Quotas</p>
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
                                    <Shield className="h-3 w-3 text-[#F97316]" />
                                    Recording Enabled
                                </label>
                                <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-2">
                                    <button
                                        type="button"
                                        onClick={() => setForm(p => ({ ...p, recordingEnabled: true }))}
                                        className={cn(
                                            "rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition",
                                            form.recordingEnabled ? "bg-white text-[#F97316] shadow-sm" : "text-gray-400 hover:text-gray-700"
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
                                    <Clock className="h-3 w-3 text-[#F97316]" />
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
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#F97316] focus:ring-4 focus:ring-orange-50"
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
                                        className={cn("w-full p-4 rounded-lg border text-left transition-all", form.plan === p.id ? "border-[#F97316] bg-orange-50 shadow-sm" : "border-gray-100 hover:border-gray-200")}
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
                            <button type="submit" disabled={saving} className="h-14 px-16 rounded-lg bg-[#F97316] text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-200 hover:bg-orange-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3">
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
