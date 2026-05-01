"use client";

import { useEffect, useState, use, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    CheckCircle2,
    Building2,
    User,
    Mail,
    ShieldCheck,
    Globe,
    RefreshCw,
    Play,
    Pause,
    MapPin as MapPinIcon,
    Sparkles,
    Volume2,
    BrainCircuit,
    Coins,
    Mic,
    ChevronDown,
    Loader2,
} from "lucide-react";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { toast } from "@/components/ui/toast-custom";
import { ProctoringSignalsSection } from "@/components/super-admin/proctoring-signals-section";
import { CARTESIA_VOICES, DEFAULT_GOOGLE_TTS_MODEL, GOOGLE_TTS_MODELS, GOOGLE_VOICES, SARVAM_VOICES } from "@/lib/constants/voices";
import { DEFAULT_ORG_PLAN, ORG_PLAN_OPTIONS, normalizeOrgPlan } from "@/lib/org-plans";
import { DEFAULT_PROCTORING_SIGNALS, getProctoringSignalsForPlan, normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { cn } from "@/lib/utils";

function CustomSelect({
    value,
    onChange,
    options,
    label,
    icon: Icon,
    placeholder = "Select an option...",
}: {
    value: string;
    onChange: (val: string) => void;
    options: { value: string; label: string }[];
    label: string;
    icon?: any;
    placeholder?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption = options.find((opt) => opt.value === value);

    return (
        <div className="space-y-2 relative" ref={containerRef}>
            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                {Icon && <Icon className="h-3 w-3" />} {label}
            </label>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 flex items-center justify-between transition-all outline-none text-left",
                    isOpen ? "border-orange-500 ring-4 ring-orange-50 bg-white" : "hover:border-gray-300"
                )}
            >
                <span className={cn("text-sm font-bold", !selectedOption ? "text-gray-400" : "text-gray-900")}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-300", isOpen && "rotate-180 text-orange-500")} />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-2 w-full max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-1.5 space-y-0.5">
                        {options.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full px-4 py-3 rounded-lg text-sm font-bold text-left transition-all flex items-center justify-between",
                                    value === opt.value
                                        ? "bg-orange-500 text-white shadow-lg"
                                        : "text-gray-600 hover:bg-orange-50 hover:text-orange-600"
                                )}
                            >
                                {opt.label}
                                {value === opt.value && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function PremiumToggle({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label: string }) {
    return (
        <label className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-all cursor-pointer group shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-widest text-gray-600 group-hover:text-gray-900 transition-colors">{label}</span>
            <div
                onClick={(e) => {
                    e.preventDefault();
                    onChange(!checked);
                }}
                className={cn(
                    "relative w-12 h-6 rounded-full transition-all duration-300 shadow-inner",
                    checked ? "bg-emerald-500 shadow-emerald-200" : "bg-rose-500 shadow-rose-200"
                )}
            >
                <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm", checked ? "translate-x-6" : "translate-x-0")} />
            </div>
        </label>
    );
}

function normalizeIntegerText(value: string) {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return "";
    return String(Number(digits));
}

export default function EditOrgPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [previewLoading, setPreviewLoading] = useState(false);
    const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
    const [creditsTotal, setCreditsTotal] = useState(0);
    const [creditsUsed, setCreditsUsed] = useState(0);
    const [creditsInput, setCreditsInput] = useState("");

    const [form, setForm] = useState({
        name: "",
        slug: "",
        plan: DEFAULT_ORG_PLAN,
        maxActiveDrives: 0,
        maxTeamMembers: 0,
        proctoringSignals: { ...DEFAULT_PROCTORING_SIGNALS },
        location: "",
        adminName: "",
        adminEmail: "",
        ttsProvider: "CARTESIA",
        cartesiaVoiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        cartesiaModel: "cartesia/sonic-3",
        sarvamModel: "bulbul:v3",
        sarvamVoice: "shubh",
        googleModel: DEFAULT_GOOGLE_TTS_MODEL,
        googleVoiceName: "Puck",
        sttProvider: "DEEPGRAM",
        deepgramModel: "nova-3-general",
        sarvamSttModel: "saaras:v3",
        llmProvider: "OPENAI",
        llmModel: "gpt-4o",
        llmTemperature: 0.7,
    });

    useEffect(() => {
        const fetchOrg = async () => {
            try {
                const res = await fetch(`/api/super-admin/orgs/${id}`);
                const data = await res.json();

                if (!res.ok) {
                    setError("Organization not found");
                    return;
                }

                setForm({
                    name: data.name || "",
                    slug: data.slug || "",
                    plan: normalizeOrgPlan(data.plan) || DEFAULT_ORG_PLAN,
                    maxActiveDrives: Number(data.maxActiveDrives || 0),
                    maxTeamMembers: Number(data.maxTeamMembers || 0),
                    proctoringSignals: normalizeProctoringSignals(data.proctoringSignals),
                    location: data.location || "",
                    adminName: data.users && data.users.length > 0 ? data.users[0].name : "",
                    adminEmail: data.users && data.users.length > 0 ? data.users[0].email : "",
                    ttsProvider: data.ttsProvider || "CARTESIA",
                    cartesiaVoiceId: data.cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                    cartesiaModel: data.cartesiaModel || "cartesia/sonic-3",
                    sarvamModel: data.sarvamModel || "bulbul:v3",
                    sarvamVoice: data.sarvamVoice || "shubh",
                    googleModel: data.googleModel || DEFAULT_GOOGLE_TTS_MODEL,
                    googleVoiceName: data.googleVoiceName || "Puck",
                    sttProvider: data.sttProvider || "DEEPGRAM",
                    deepgramModel: data.deepgramModel || "nova-3-general",
                    sarvamSttModel: data.sarvamSttModel || "saaras:v3",
                    llmProvider: data.llmProvider || "OPENAI",
                    llmModel: data.llmModel || "gpt-4o",
                    llmTemperature: data.llmTemperature != null ? data.llmTemperature : 0.7,
                });

                setCreditsTotal(data.creditsTotal || 0);
                setCreditsUsed(data.creditsUsed || 0);
                setCreditsInput(normalizeIntegerText(String(data.creditsTotal || 0)) || "0");
            } catch {
                setError("Failed to load organization");
            } finally {
                setLoading(false);
            }
        };

        fetchOrg();
    }, [id]);

    const handleNameChange = (name: string) => {
        setForm((prev) => ({
            ...prev,
            name,
            slug:
                prev.slug === "" ||
                prev.slug === prev.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                    ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                : prev.slug,
        }));
    };

    const applyTtsProvider = (provider: string) => {
        const normalized = provider.toUpperCase();
        setForm((prev) => {
            if (normalized === "GOOGLE") {
                return {
                    ...prev,
                    ttsProvider: "GOOGLE",
                    cartesiaVoiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                    cartesiaModel: "cartesia/sonic-3",
                    sarvamModel: "bulbul:v3",
                    sarvamVoice: "shubh",
                    googleModel: DEFAULT_GOOGLE_TTS_MODEL,
                    googleVoiceName: "Puck",
                    sttProvider: "GOOGLE",
                    deepgramModel: "nova-3-general",
                    sarvamSttModel: "saaras:v3",
                    llmProvider: "GOOGLE",
                    llmModel: "gemini-2.5-flash",
                };
            }

            if (normalized === "SARVAM") {
                return {
                    ...prev,
                    ttsProvider: "SARVAM",
                    cartesiaVoiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                    cartesiaModel: "cartesia/sonic-3",
                    googleModel: DEFAULT_GOOGLE_TTS_MODEL,
                    googleVoiceName: "Puck",
                    sarvamModel: prev.sarvamModel || "bulbul:v3",
                    sarvamVoice: prev.sarvamVoice || "shubh",
                    sttProvider: "DEEPGRAM",
                    deepgramModel: prev.deepgramModel || "nova-3-general",
                    sarvamSttModel: prev.sarvamSttModel || "saaras:v3",
                    llmProvider: "OPENAI",
                    llmModel: prev.llmModel || "gpt-4o",
                };
            }

            return {
                ...prev,
                ttsProvider: "CARTESIA",
                sarvamModel: "bulbul:v3",
                sarvamVoice: "shubh",
                googleModel: DEFAULT_GOOGLE_TTS_MODEL,
                googleVoiceName: "Puck",
                cartesiaVoiceId: prev.cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                cartesiaModel: prev.cartesiaModel || "cartesia/sonic-3",
                sttProvider: "DEEPGRAM",
                deepgramModel: prev.deepgramModel || "nova-3-general",
                sarvamSttModel: prev.sarvamSttModel || "saaras:v3",
                llmProvider: "OPENAI",
                llmModel: prev.llmModel || "gpt-4o",
            };
        });
    };

    const getVoicesForProvider = (provider?: string) => {
        const normalized = (provider || "CARTESIA").toUpperCase();
        if (normalized === "SARVAM") return SARVAM_VOICES;
        if (normalized === "GOOGLE") return GOOGLE_VOICES;
        return CARTESIA_VOICES;
    };

    const getVoiceIdForProvider = (provider?: string) => {
        const normalized = (provider || "CARTESIA").toUpperCase();
        if (normalized === "SARVAM") return form.sarvamVoice || "shubh";
        if (normalized === "GOOGLE") return form.googleVoiceName || "Puck";
        return form.cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
    };

    const getModelForProvider = (provider?: string) => {
        const normalized = (provider || "CARTESIA").toUpperCase();
        if (normalized === "SARVAM") return form.sarvamModel || "bulbul:v3";
        if (normalized === "GOOGLE") return form.googleModel || DEFAULT_GOOGLE_TTS_MODEL;
        return form.cartesiaModel || "cartesia/sonic-3";
    };

    const playSample = async () => {
        const provider = (form.ttsProvider || "CARTESIA").toUpperCase();
        const voiceId = getVoiceIdForProvider(provider);
        const modelId = getModelForProvider(provider);
        const endpoint = "/api/admin/voice/preview";
        const transcript =
            provider === "SARVAM"
                ? "नमस्ते, मैं आपकी टीम के लिए उच्च गुणवत्ता वाले साक्षात्कार आयोजित करने के लिए तैयार हूँ।"
                : "Hello! I am ready to conduct high-quality AI interviews for your team.";

        if (!voiceId) return;

        setPreviewLoading(true);
        try {
            if (activeAudio) {
                activeAudio.pause();
                setActiveAudio(null);
            }

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, voiceId, modelId, transcript }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.error || "Preview failed");
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                setActiveAudio(null);
                URL.revokeObjectURL(url);
            };

            await audio.play();
            setActiveAudio(audio);
        } catch (err: any) {
            console.error("Playback error:", err);
            toast.error(err.message || "Could not play voice sample.");
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");

        try {
            const payload = {
                ...form,
                creditsTotal: parseFloat(creditsInput) || 0,
            };

            const res = await fetch(`/api/super-admin/orgs/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to update records");
                return;
            }

            toast.success("Organization configuration synchronized.");
        } catch {
            toast.error("Connection error. Try again.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-20 text-center flex items-center justify-center min-h-[80vh]">
                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin opacity-20" />
            </div>
        );
    }

    return (
        <div className="p-8 lg:p-12 w-full max-w-[1440px] mx-auto font-inter bg-white text-premium">
            <div className="mb-12">
                <button
                    onClick={() => router.back()}
                    className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-[11px] font-black uppercase tracking-widest mb-8 transition-all"
                >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Registry
                </button>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <div className="h-16 w-16 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shadow-sm">
                            <Building2 className="h-8 w-8" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-none">Modify Client</h1>
                            <p className="text-gray-400 font-medium text-base mt-2 max-w-xl">
                                Update configuration for <span className="text-gray-900 font-bold">{form.name || "this organization"}</span>.
                            </p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {error}
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-12">
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-orange-500 flex items-center justify-center text-white shadow-md shadow-orange-100">
                            <Sparkles className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Organization Details</h2>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-3 grid md:grid-cols-2 gap-6 bg-white border border-gray-100 rounded-xl p-8 shadow-sm">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Company Name</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    placeholder="e.g. Acme Corp"
                                    required
                                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all outline-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">URL Slug</label>
                                <div className="relative group">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 font-black">/</span>
                                    <input
                                        value={form.slug}
                                        onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                                        placeholder="acme-corp"
                                        required
                                        className="h-11 w-full pl-8 pr-4 rounded-xl border border-gray-200 bg-gray-50/30 text-sm font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-2 grid md:grid-cols-3 gap-6">
                                <div className="md:col-span-1 space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Physical Location</label>
                                    <LocationAutocomplete
                                        value={form.location || ""}
                                        onChange={(val) => setForm((prev) => ({ ...prev, location: val }))}
                                        placeholder="e.g. San Francisco, CA"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Active Drive Cap</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.maxActiveDrives}
                                        inputMode="numeric"
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={(e) => setForm((prev) => ({ ...prev, maxActiveDrives: Math.max(0, Number(normalizeIntegerText(e.target.value)) || 0) }))}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all outline-none tabular-nums"
                                    />
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">`0` means unlimited.</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Team Member Cap</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.maxTeamMembers}
                                        inputMode="numeric"
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={(e) => setForm((prev) => ({ ...prev, maxTeamMembers: Math.max(0, Number(normalizeIntegerText(e.target.value)) || 0) }))}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all outline-none tabular-nums"
                                    />
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">`0` means unlimited.</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Initial Credits</label>
                                    <div className="relative">
                                        <Coins className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <input
                                            type="number"
                                            min="0"
                                            value={creditsInput}
                                            inputMode="numeric"
                                            onWheel={(e) => e.currentTarget.blur()}
                                            onChange={(e) => setCreditsInput(normalizeIntegerText(e.target.value))}
                                            onBlur={() => setCreditsInput((prev) => normalizeIntegerText(prev) || "0")}
                                            className="h-11 w-full pl-10 pr-4 rounded-xl border border-gray-200 bg-gray-50/30 text-sm font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all outline-none tabular-nums"
                                        />
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">{creditsUsed} used so far</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Select Service Plan</label>
                            <div className="grid gap-3">
                                {ORG_PLAN_OPTIONS.map((plan) => (
                                    <button
                                        key={plan.id}
                                        type="button"
                                        onClick={() => {
                                            const signals = getProctoringSignalsForPlan(plan.id);
                                            setForm((prev) => ({ ...prev, plan: plan.id, proctoringSignals: signals }));
                                        }}
                                        className={cn(
                                            "relative flex items-center justify-between p-4 rounded-xl border transition-all text-left group overflow-hidden shadow-sm",
                                            form.plan === plan.id ? "border-orange-500 bg-orange-50/50" : "border-gray-100 bg-white hover:border-gray-200"
                                        )}
                                    >
                                        <div className="relative z-10 flex items-center gap-3">
                                            <div className={cn("w-2.5 h-2.5 rounded-full transition-all", form.plan === plan.id ? "bg-orange-500" : "bg-gray-200")} />
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-gray-900">{plan.label}</p>
                                                <p className="text-[9px] font-bold text-gray-400 mt-0.5">{plan.desc}</p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-100">
                            <User className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Administrative Control</h2>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 bg-white border border-gray-100 rounded-xl p-8 shadow-sm">
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Admin Full Name</label>
                            <input
                                value={form.adminName}
                                onChange={(e) => setForm((prev) => ({ ...prev, adminName: e.target.value }))}
                                placeholder="Amit Sharma"
                                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all outline-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Business Email</label>
                            <input
                                type="email"
                                value={form.adminEmail}
                                onChange={(e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value }))}
                                placeholder="amit@zomato.com"
                                required
                                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all outline-none"
                            />
                        </div>
                    </div>
                </section>

                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-100">
                            <Volume2 className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Audio & Speech Infrastructure</h2>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-12">
                        {form.ttsProvider === "GOOGLE" && (
                            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                                Google mode is exclusive. Saving this org clears Cartesia, Sarvam, Deepgram, and OpenAI settings and uses Google runtime only.
                            </div>
                        )}
                        <div className="space-y-8">
                            <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
                                <Volume2 className="h-4 w-4 text-purple-500" />
                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Text-to-Speech (TTS)</h3>
                            </div>

                            <div className="grid md:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">TTS Provider</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { id: "CARTESIA", label: "Cartesia", sub: "Ultra-Low Latency", accent: "gray" },
                                                { id: "SARVAM", label: "Sarvam AI", sub: "Regional Authenticity", accent: "orange" },
                                                { id: "GOOGLE", label: "Google", sub: "Live Preview", accent: "blue" },
                                            ].map((provider) => (
                                                <button
                                                    key={provider.id}
                                                    type="button"
                                                    onClick={() => applyTtsProvider(provider.id)}
                                                    className={cn(
                                                        "p-4 rounded-xl border text-left transition-all",
                                                        form.ttsProvider === provider.id
                                                            ? provider.id === "CARTESIA"
                                                                ? "border-gray-300 bg-white shadow-sm ring-4 ring-gray-50"
                                                                : provider.id === "SARVAM"
                                                                    ? "border-[#F97316] bg-orange-50 shadow-sm ring-4 ring-orange-50"
                                                                    : "border-blue-500 bg-blue-50 shadow-sm ring-4 ring-blue-50"
                                                            : "border-gray-100 bg-gray-50/30 hover:border-gray-300"
                                                    )}
                                                >
                                                    <p
                                                        className={cn(
                                                            "text-[11px] font-black uppercase tracking-widest",
                                                            form.ttsProvider === provider.id
                                                                ? provider.id === "CARTESIA"
                                                                    ? "text-gray-900"
                                                                    : provider.id === "SARVAM"
                                                                        ? "text-[#F97316]"
                                                                        : "text-blue-600"
                                                                : "text-gray-400"
                                                        )}
                                                    >
                                                        {provider.label}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">{provider.sub}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <CustomSelect
                                        label="TTS Neural Engine"
                                        value={getModelForProvider(form.ttsProvider)}
                                        onChange={(val) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                [form.ttsProvider === "CARTESIA"
                                                    ? "cartesiaModel"
                                                    : form.ttsProvider === "SARVAM"
                                                        ? "sarvamModel"
                                                        : "googleModel"]: val,
                                            }))
                                        }
                                        options={
                                            form.ttsProvider === "CARTESIA"
                                                ? [
                                                      { value: "cartesia/sonic-3", label: "Sonic-3 (Elite Latency)" },
                                                      { value: "cartesia/sonic-2", label: "Sonic-2 (Stable)" },
                                                      { value: "cartesia/sonic-turbo", label: "Sonic-Turbo" },
                                                  ]
                                                : form.ttsProvider === "SARVAM"
                                                    ? [
                                                          { value: "bulbul:v3", label: "Bulbul v3 (Flagship)" },
                                                          { value: "bulbul:v2", label: "Bulbul v2" },
                                                          { value: "bulbul:v1", label: "Bulbul v1" },
                                                      ]
                                                    : GOOGLE_TTS_MODELS.map((model) => ({ value: model.value, label: model.label }))
                                        }
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Voice Selection</label>
                                        <button
                                            type="button"
                                            disabled={previewLoading}
                                            onClick={playSample}
                                            className={cn(
                                                "h-8 px-4 rounded-lg font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm",
                                                activeAudio
                                                    ? "bg-rose-500 text-white"
                                                    : "bg-emerald-500 text-white hover:scale-105 active:scale-95"
                                            )}
                                        >
                                            {previewLoading ? (
                                                <RefreshCw className="h-3 w-3 animate-spin" />
                                            ) : activeAudio ? (
                                                <Pause className="h-3 w-3" />
                                            ) : (
                                                <Play className="h-3 w-3" />
                                            )}
                                            {previewLoading ? "..." : activeAudio ? "Pause" : "Preview"}
                                        </button>
                                    </div>

                                    <CustomSelect
                                        label="Neural Persona"
                                        value={getVoiceIdForProvider(form.ttsProvider)}
                                        onChange={(val) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                [form.ttsProvider === "CARTESIA"
                                                    ? "cartesiaVoiceId"
                                                    : form.ttsProvider === "SARVAM"
                                                        ? "sarvamVoice"
                                                        : "googleVoiceName"]: val,
                                            }))
                                        }
                                        options={getVoicesForProvider(form.ttsProvider).map((v) => ({
                                            value: v.id,
                                            label: `${v.name} (${v.description})`,
                                        }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {form.ttsProvider !== "GOOGLE" && (
                            <div className="space-y-8 pt-8 border-t border-gray-50">
                                <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
                                    <Mic className="h-4 w-4 text-indigo-500" />
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Speech-to-Text (STT)</h3>
                                </div>

                                <div className="grid md:grid-cols-2 gap-10">
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">STT Provider</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { id: "DEEPGRAM", label: "Deepgram", sub: "Flux Architecture" },
                                                { id: "SARVAM", label: "Sarvam AI", sub: "Regional Saaras" },
                                            ].map((provider) => (
                                                <button
                                                    key={provider.id}
                                                    type="button"
                                                    onClick={() => setForm((prev) => ({ ...prev, sttProvider: provider.id }))}
                                                    className={cn(
                                                        "p-4 rounded-xl border text-left transition-all",
                                                        form.sttProvider === provider.id
                                                            ? provider.id === "DEEPGRAM"
                                                                ? "border-emerald-500 bg-emerald-50 shadow-sm ring-4 ring-emerald-50"
                                                                : "border-[#F97316] bg-orange-50 shadow-sm ring-4 ring-orange-50"
                                                            : "border-gray-100 bg-gray-50/30 hover:border-gray-300"
                                                    )}
                                                >
                                                    <p
                                                        className={cn(
                                                            "text-[11px] font-black uppercase tracking-widest",
                                                            form.sttProvider === provider.id
                                                                ? provider.id === "DEEPGRAM"
                                                                    ? "text-emerald-600"
                                                                    : "text-[#F97316]"
                                                                : "text-gray-400"
                                                        )}
                                                    >
                                                        {provider.label}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">{provider.sub}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <CustomSelect
                                            label="Transcription Model"
                                            value={form.sttProvider === "DEEPGRAM" ? form.deepgramModel : form.sarvamSttModel}
                                            onChange={(val) =>
                                                setForm((prev) => ({
                                                    ...prev,
                                                    [form.sttProvider === "DEEPGRAM" ? "deepgramModel" : "sarvamSttModel"]: val,
                                                }))
                                            }
                                            options={
                                                form.sttProvider === "DEEPGRAM"
                                                    ? [
                                                          { value: "flux-general-en", label: "Flux General (English)" },
                                                          { value: "nova-3-general", label: "Nova-3 General" },
                                                          { value: "nova-3", label: "Nova-3 (Balanced)" },
                                                          { value: "nova-2-general", label: "Nova-2 General" },
                                                          { value: "nova-2-conversationalai", label: "Nova-2 Conversational AI" },
                                                          { value: "whisper-large", label: "Whisper Large" },
                                                          { value: "whisper-medium", label: "Whisper Medium" },
                                                      ]
                                                    : [
                                                          { value: "saaras:v3", label: "Saaras v3 (High Quality)" },
                                                          { value: "saarika:v2.5", label: "Saarika v2.5 (Streaming)" },
                                                          { value: "saaras:v2", label: "Saaras v2 (Standard)" },
                                                      ]
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <ProctoringSignalsSection
                    signals={form.proctoringSignals as any}
                    onChange={(key, checked) =>
                        setForm((prev) => ({
                            ...prev,
                            proctoringSignals: { ...prev.proctoringSignals, [key]: checked },
                        }))
                    }
                />

                    {form.ttsProvider !== "GOOGLE" ? (
                        <section className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-gray-900 flex items-center justify-center text-white shadow-md shadow-gray-200">
                                    <BrainCircuit className="h-4 w-4" />
                                </div>
                                <h2 className="text-lg font-black text-gray-900 tracking-tight">Reasoning Infrastructure (LLM)</h2>
                            </div>

                            <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-10">
                                <div className="grid md:grid-cols-2 gap-10">
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">LLM Provider</label>
                                        <div className="grid grid-cols-1 gap-3">
                                            <button type="button" className="p-4 rounded-xl border border-gray-200 bg-white text-left transition-all shadow-sm ring-4 ring-gray-50">
                                                <p className="text-[11px] font-black uppercase tracking-widest text-gray-900">OpenAI</p>
                                                <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">Global Intelligence Standard</p>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <CustomSelect
                                            label="Intelligence Model"
                                            value={form.llmModel}
                                            onChange={(val) => setForm((prev) => ({ ...prev, llmModel: val }))}
                                            options={[
                                                { value: "gpt-4o", label: "GPT-4o (Elite Reasoning)" },
                                                { value: "gpt-4o-mini", label: "GPT-4o-mini (Efficient)" },
                                                { value: "gpt-4.1", label: "GPT-4.1 (Next Gen)" },
                                                { value: "gpt-4.1-mini", label: "GPT-4.1-mini" },
                                                { value: "o1-preview", label: "o1-preview" },
                                                { value: "o1-mini", label: "o1-mini" },
                                                { value: "gpt-5.1", label: "GPT-5.1 (Research)" },
                                                { value: "gpt-5.1-mini", label: "GPT-5.1-mini" },
                                                { value: "gpt-5.0", label: "GPT-5.0 (Frontier)" },
                                                { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
                                                { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
                                            ]}
                                        />
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-gray-50">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block">LLM Temperature</label>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                {form.llmTemperature <= 0.3 ? "Deterministic / Precise" : form.llmTemperature >= 0.8 ? "Creative / Variable" : "Balanced Reasoning"}
                                            </p>
                                        </div>
                                        <div className="h-9 px-4 rounded-lg bg-gray-900 text-white flex items-center justify-center font-black text-xs shadow-md">
                                            {Number(form.llmTemperature).toFixed(1)}
                                        </div>
                                    </div>

                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={form.llmTemperature}
                                        onChange={(e) => setForm((prev) => ({ ...prev, llmTemperature: parseFloat(e.target.value) }))}
                                        className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-gray-900"
                                    />
                                </div>
                            </div>
                        </section>
                    ) : (
                        <section className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-gray-900 flex items-center justify-center text-white shadow-md shadow-gray-200">
                                    <BrainCircuit className="h-4 w-4" />
                                </div>
                                <h2 className="text-lg font-black text-gray-900 tracking-tight">Google-Only Reasoning</h2>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-sm font-semibold text-blue-800">
                                Google mode uses the Google runtime for STT, LLM, and TTS. The other provider fields are cleared automatically on save.
                            </div>
                        </section>
                    )}

                <div className="pt-12 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-4">
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="flex-1 sm:flex-none h-12 px-8 rounded-xl border border-gray-200 bg-white text-gray-500 font-bold text-[11px] uppercase tracking-widest hover:bg-gray-50 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 sm:flex-none h-12 px-12 rounded-xl bg-[#F97316] text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-orange-100 hover:bg-[#EA580C] hover:translate-y-[-1px] active:translate-y-0 transition-all disabled:opacity-50"
                        >
                            {saving ? (
                                <div className="flex items-center gap-3">
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Saving...
                                </div>
                            ) : (
                                "Save Changes"
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
