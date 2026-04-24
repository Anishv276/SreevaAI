"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Building2, User, Mail, Lock, ShieldCheck, Globe, RefreshCw, Play, Pause, MapPin as MapPinIcon, ChevronRight, Sparkles, Volume2, Mic2, BrainCircuit, Activity, Coins, Mic, ChevronDown } from "lucide-react";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { toast } from "@/components/ui/toast-custom";
import { CARTESIA_VOICES } from "@/lib/constants/voices";
import { DEFAULT_ORG_PLAN, ORG_PLAN_OPTIONS } from "@/lib/org-plans";
import { DEFAULT_PROCTORING_SIGNALS } from "@/lib/proctoring-signals";
import { cn } from "@/lib/utils";

// Premium Custom Select Component
function CustomSelect({
    value,
    onChange,
    options,
    label,
    icon: Icon,
    placeholder = "Select an option..."
}: {
    value: string,
    onChange: (val: string) => void,
    options: { value: string, label: string }[],
    label: string,
    icon?: any,
    placeholder?: string
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

    const selectedOption = options.find(opt => opt.value === value);

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

// Premium Toggle Component - SaaS Box Style
function PremiumToggle({ checked, onChange, label }: { checked: boolean, onChange: (val: boolean) => void, label: string }) {
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
                <div className={cn(
                    "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm",
                    checked ? "translate-x-6" : "translate-x-0"
                )} />
            </div>
        </label>
    );
}

export default function NewOrgPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState<{ orgName: string; adminEmail: string } | null>(null);

    const [previewLoading, setPreviewLoading] = useState(false);
    const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);

    const [form, setForm] = useState({
        orgName: "",
        slug: "",
        location: "",
        plan: DEFAULT_ORG_PLAN,
        maxActiveDrives: 0,
        maxTeamMembers: 0,
        creditsTotal: 100,
        proctoringSignals: { ...DEFAULT_PROCTORING_SIGNALS },
        adminName: "",
        adminEmail: "",
        adminPassword: "",
        ttsProvider: "CARTESIA",
        cartesiaVoiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        cartesiaModel: "cartesia/sonic-3",
        sarvamModel: "bulbul:v3",
        sarvamVoice: "shubh",
        sttProvider: "DEEPGRAM",
        deepgramModel: "nova-3-general",
        sarvamSttModel: "saaras:v3",
        llmProvider: "OPENAI",
        llmModel: "gpt-4o",
        llmTemperature: 0.7,
    });

    const handleOrgNameChange = (name: string) => {
        setForm(prev => ({
            ...prev,
            orgName: name,
            slug: prev.slug === "" || prev.slug === prev.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                : prev.slug,
        }));
    };

    const playSample = async () => {
        const isCartesia = form.ttsProvider === "CARTESIA";
        const voiceId = isCartesia ? form.cartesiaVoiceId : form.sarvamVoice;
        const modelId = isCartesia ? form.cartesiaModel : form.sarvamModel;
        const endpoint = "/api/admin/voice/preview";
        const transcript = isCartesia
            ? "Hello! I am ready to conduct high-quality AI interviews for your team."
            : "नमस्ते, मैं आपकी टीम के लिए उच्च गुणवत्ता वाले साक्षात्कार आयोजित करने के लिए तैयार हूं।";

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
                body: JSON.stringify({ provider: form.ttsProvider, voiceId, modelId, transcript })
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/super-admin/orgs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || "Failed to create organization");
                return;
            }

            const result = await res.json();
            toast.success("Client account provisioned successfully!");
            setSuccess({ orgName: form.orgName, adminEmail: form.adminEmail });
        } catch {
            toast.error("Initialization failed. Check network connectivity.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[80vh] font-inter">
                <div className="w-full max-w-lg bg-white border border-gray-100 rounded-2xl p-10 text-center space-y-8 shadow-xl animate-fade-slide">
                    <div className="w-16 h-16 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-500 shadow-inner">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div className="space-y-3">
                        <h2 className="text-gray-900 font-black text-3xl tracking-tight">{success.orgName} is Live!</h2>
                        <p className="text-gray-500 font-medium text-sm">Organization and HR Admin account provisioned on the network.</p>
                    </div>

                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-left space-y-6">
                        <div className="flex items-center gap-3">
                            <span className="w-1 h-5 bg-emerald-500 rounded-full" />
                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">HR Admin Credentials</p>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center pb-4 border-b border-gray-200/50">
                                <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Admin Email</span>
                                <span className="text-gray-900 font-black text-sm">{success.adminEmail}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Access Node</span>
                                <span className="text-[#F97316] font-black text-sm">/login</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                        <button
                            onClick={() => { setSuccess(null); setForm({ orgName: "", slug: "", location: "", plan: DEFAULT_ORG_PLAN, maxActiveDrives: 0, maxTeamMembers: 0, creditsTotal: 100, proctoringSignals: { ...DEFAULT_PROCTORING_SIGNALS }, adminName: "", adminEmail: "", adminPassword: "", ttsProvider: "CARTESIA", cartesiaVoiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc", cartesiaModel: "cartesia/sonic-3", sarvamModel: "bulbul:v3", sarvamVoice: "shubh", sttProvider: "DEEPGRAM", deepgramModel: "nova-3-general", sarvamSttModel: "saaras:v3", llmProvider: "OPENAI", llmModel: "gpt-4o", llmTemperature: 0.7 }); }}
                            className="flex-1 h-12 rounded-xl border border-gray-200 bg-white text-gray-500 font-bold text-[11px] uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
                        >
                            Onboard Another
                        </button>
                        <button
                            onClick={() => router.push("/super-admin/orgs")}
                            className="flex-1 h-12 rounded-xl bg-gray-900 text-white font-bold text-[11px] uppercase tracking-widest shadow-lg hover:bg-black transition-all active:scale-95"
                        >
                            Return to Registry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 lg:p-12 w-full max-w-[1440px] mx-auto font-inter bg-white text-premium">
            {/* Header */}
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
                            <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-none">Onboard Partner</h1>
                            <p className="text-gray-400 font-medium text-base mt-2 max-w-xl">Provision a new high-performance organization node on the network.</p>
                        </div>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-12">
                {/* 1. Identity & Plan */}
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
                                    value={form.orgName}
                                    onChange={e => handleOrgNameChange(e.target.value)}
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
                                        onChange={e => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
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
                                        onChange={val => setForm({ ...form, location: val })}
                                        placeholder="e.g. San Francisco, CA"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Active Drive Cap</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.maxActiveDrives}
                                        onChange={e => setForm(prev => ({ ...prev, maxActiveDrives: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all outline-none tabular-nums"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Team Member Cap</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.maxTeamMembers}
                                        onChange={e => setForm(prev => ({ ...prev, maxTeamMembers: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all outline-none tabular-nums"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Initial Credits</label>
                                    <div className="relative">
                                        <Coins className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <input
                                            type="number"
                                            min="0"
                                            value={form.creditsTotal}
                                            onChange={e => setForm(prev => ({ ...prev, creditsTotal: Math.max(0, Number(e.target.value) || 0) }))}
                                            className="h-11 w-full pl-10 pr-4 rounded-xl border border-gray-200 bg-gray-50/30 text-sm font-bold focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-50 transition-all outline-none tabular-nums"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Select Service Plan</label>
                            <div className="grid gap-3">
                                {ORG_PLAN_OPTIONS.map(plan => (
                                    <button
                                        key={plan.id}
                                        type="button"
                                        onClick={() => setForm(prev => ({ ...prev, plan: plan.id }))}
                                        className={cn(
                                            "relative flex items-center justify-between p-4 rounded-xl border transition-all text-left group overflow-hidden shadow-sm",
                                            form.plan === plan.id
                                                ? "border-orange-500 bg-orange-50/50"
                                                : "border-gray-100 bg-white hover:border-gray-200"
                                        )}
                                    >
                                        <div className="relative z-10 flex items-center gap-3">
                                            <div className={cn(
                                                "w-2.5 h-2.5 rounded-full transition-all",
                                                form.plan === plan.id ? "bg-orange-500" : "bg-gray-200"
                                            )} />
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

                {/* 2. Admin Controller */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-100">
                            <User className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Administrative Control</h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6 bg-white border border-gray-100 rounded-xl p-8 shadow-sm">
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Admin Full Name</label>
                            <input
                                value={form.adminName}
                                onChange={e => setForm(prev => ({ ...prev, adminName: e.target.value }))}
                                placeholder="Amit Sharma"
                                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all outline-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Business Email</label>
                            <input
                                type="email"
                                value={form.adminEmail}
                                onChange={e => setForm(prev => ({ ...prev, adminEmail: e.target.value }))}
                                placeholder="amit@zomato.com"
                                required
                                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all outline-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">Initial Password</label>
                            <input
                                type="text"
                                value={form.adminPassword}
                                onChange={e => setForm(prev => ({ ...prev, adminPassword: e.target.value }))}
                                placeholder="Set secure key"
                                required
                                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/30 px-4 text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all outline-none"
                            />
                        </div>
                    </div>
                </section>

                {/* 3. Audio & Speech Infrastructure */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-100">
                            <Volume2 className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Audio & Speech Infrastructure</h2>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-12">
                        {/* TTS SECTION */}
                        <div className="space-y-8">
                            <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
                                <Volume2 className="h-4 w-4 text-purple-500" />
                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Text-to-Speech (TTS)</h3>
                            </div>
                            <div className="grid md:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1">TTS Provider</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { id: "CARTESIA", label: "Cartesia", sub: "Ultra-Low Latency" },
                                                { id: "SARVAM", label: "Sarvam AI", sub: "Regional Authenticity" }
                                            ].map((provider) => (
                                                <button
                                                    key={provider.id}
                                                    type="button"
                                                    onClick={() => setForm(prev => ({ ...prev, ttsProvider: provider.id }))}
                                                    className={cn(
                                                        "p-4 rounded-xl border text-left transition-all",
                                                        form.ttsProvider === provider.id
                                                            ? provider.id === "CARTESIA"
                                                                ? "border-gray-300 bg-white shadow-sm ring-4 ring-gray-50"
                                                                : "border-[#F97316] bg-orange-50 shadow-sm ring-4 ring-orange-50"
                                                            : "border-gray-100 bg-gray-50/30 hover:border-gray-300"
                                                    )}
                                                >
                                                    <p className={cn("text-[11px] font-black uppercase tracking-widest",
                                                        form.ttsProvider === provider.id
                                                            ? provider.id === "CARTESIA" ? "text-gray-900" : "text-[#F97316]"
                                                            : "text-gray-400"
                                                    )}>{provider.label}</p>
                                                    <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">{provider.sub}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <CustomSelect
                                        label="TTS Neural Engine"
                                        value={form.ttsProvider === "CARTESIA" ? form.cartesiaModel : form.sarvamModel}
                                        onChange={val => setForm(prev => ({ ...prev, [form.ttsProvider === "CARTESIA" ? "cartesiaModel" : "sarvamModel"]: val }))}
                                        options={form.ttsProvider === "CARTESIA"
                                            ? [
                                                { value: "cartesia/sonic-3", label: "Sonic-3 (Elite Latency)" },
                                                { value: "cartesia/sonic-2", label: "Sonic-2 (Stable)" },
                                                { value: "cartesia/sonic-turbo", label: "Sonic-Turbo" }
                                            ]
                                            : [
                                                { value: "bulbul:v3", label: "Bulbul v3 (Flagship)" },
                                                { value: "bulbul:v2", label: "Bulbul v2" },
                                                { value: "bulbul:v1", label: "Bulbul v1" }
                                            ]
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
                                        value={form.ttsProvider === "CARTESIA" ? form.cartesiaVoiceId : form.sarvamVoice}
                                        onChange={val => setForm(prev => ({ ...prev, [form.ttsProvider === "CARTESIA" ? "cartesiaVoiceId" : "sarvamVoice"]: val }))}
                                        options={form.ttsProvider === "CARTESIA"
                                            ? CARTESIA_VOICES.map(v => ({ value: v.id, label: `${v.name} (${v.description})` }))
                                            : [
                                                { value: "shubh", label: "Shubh (Flagship)" },
                                                { value: "manan", label: "Manan (Male)" },
                                                { value: "ishita", label: "Ishita (Female)" },
                                                { value: "shreya", label: "Shreya (Female)" },
                                                { value: "aditya", label: "Aditya (Male)" },
                                                { value: "ritu", label: "Ritu (Female)" },
                                                { value: "priya", label: "Priya (Female)" },
                                                { value: "neha", label: "Neha (Female)" },
                                                { value: "rahul", label: "Rahul (Deep Male)" },
                                                { value: "pooja", label: "Pooja (Female)" },
                                                { value: "rohan", label: "Rohan (Male)" },
                                                { value: "simran", label: "Simran (Female)" },
                                                { value: "kavya", label: "Kavya (Female)" },
                                                { value: "amit", label: "Amit (Male)" },
                                                { value: "dev", label: "Dev (Male)" },
                                                { value: "varun", label: "Varun (Male)" },
                                                { value: "kabir", label: "Kabir (Male)" },
                                                { value: "tanya", label: "Tanya (Female)" },
                                                { value: "sunny", label: "Sunny (Male)" },
                                            ]
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        {/* STT SECTION */}
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
                                            { id: "SARVAM", label: "Sarvam AI", sub: "Regional Saaras" }
                                        ].map((provider) => (
                                            <button
                                                key={provider.id}
                                                type="button"
                                                onClick={() => setForm(prev => ({ ...prev, sttProvider: provider.id }))}
                                                className={cn(
                                                    "p-4 rounded-xl border text-left transition-all",
                                                    form.sttProvider === provider.id
                                                        ? provider.id === "DEEPGRAM"
                                                            ? "border-emerald-500 bg-emerald-50 shadow-sm ring-4 ring-emerald-50"
                                                            : "border-[#F97316] bg-orange-50 shadow-sm ring-4 ring-orange-50"
                                                        : "border-gray-100 bg-gray-50/30 hover:border-gray-300"
                                                )}
                                            >
                                                <p className={cn("text-[11px] font-black uppercase tracking-widest",
                                                    form.sttProvider === provider.id
                                                        ? provider.id === "DEEPGRAM" ? "text-emerald-600" : "text-[#F97316]"
                                                        : "text-gray-400"
                                                )}>{provider.label}</p>
                                                <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">{provider.sub}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <CustomSelect
                                        label="Transcription Model"
                                        value={form.sttProvider === "DEEPGRAM" ? form.deepgramModel : form.sarvamSttModel}
                                        onChange={val => setForm(prev => ({ ...prev, [form.sttProvider === "DEEPGRAM" ? "deepgramModel" : "sarvamSttModel"]: val }))}
                                        options={form.sttProvider === "DEEPGRAM"
                                            ? [
                                                { value: "flux-general-en", label: "Flux General (English)" },
                                                { value: "nova-3-general", label: "Nova-3 General" },
                                                { value: "nova-3", label: "Nova-3 (Balanced)" },
                                                { value: "nova-2-general", label: "Nova-2 General" },
                                                { value: "nova-2-conversationalai", label: "Nova-2 Conversational AI" },
                                                { value: "whisper-large", label: "Whisper Large" },
                                                { value: "whisper-medium", label: "Whisper Medium" }
                                            ]
                                            : [
                                                { value: "saaras:v3", label: "Saaras v3 (High Quality)" },
                                                { value: "saarika:v2.5", label: "Saarika v2.5 (Streaming)" },
                                                { value: "saaras:v2", label: "Saaras v2 (Standard)" }
                                            ]
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 4. Behavioral & Proctoring Config */}
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-100">
                            <Activity className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Behavioral & Proctoring Infrastructure</h2>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { key: "tab_switch", label: "Tab Switch" },
                                { key: "fullscreen_exit", label: "Fullscreen Exit" },
                                { key: "camera_disabled", label: "Camera Disabled" },
                                { key: "microphone_disabled", label: "Microphone Disabled" },
                                { key: "connection_lost", label: "Connection Lost" },
                                { key: "face_absence", label: "Face Absence" },
                                { key: "multiple_faces", label: "Multiple Faces" },
                                { key: "gaze_violation", label: "Gaze Violation" },
                                { key: "head_pose_violation", label: "Head Pose Violation" },
                                { key: "identity_mismatch", label: "Identity Mismatch" },
                                { key: "ownership_ambiguity", label: "Ownership Ambiguity" },
                                { key: "example_evasion", label: "Example Evasion" },
                                { key: "latency_mismatch", label: "Latency Mismatch" },
                                { key: "resume_claim_mismatch", label: "Resume Claim Mismatch" },
                                { key: "ownership_clarified", label: "Ownership Clarified" },
                                { key: "example_given", label: "Example Given" },
                                { key: "strong_under_pressure", label: "Strong Under Pressure" },
                                { key: "follow_up_collapse", label: "Follow-Up Collapse" },
                                { key: "contradiction", label: "Contradiction" },
                                { key: "contradiction_resolved", label: "Contradiction Resolved" },
                                { key: "meta_question", label: "Meta Question" },
                                { key: "audio_flag", label: "Audio Flag" },
                                { key: "duplicate_ip", label: "Duplicate IP" },
                                { key: "connection_restored", label: "Connection Restored" },
                            ].map((signal) => (
                                <PremiumToggle
                                    key={signal.key}
                                    label={signal.label}
                                    checked={Boolean((form.proctoringSignals as any)[signal.key])}
                                    onChange={(checked) => setForm(prev => ({
                                        ...prev,
                                        proctoringSignals: { ...prev.proctoringSignals, [signal.key]: checked }
                                    }))}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* 5. Reasoning Infrastructure (LLM) */}
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
                                    <button
                                        type="button"
                                        className="p-4 rounded-xl border border-gray-200 bg-white text-left transition-all shadow-sm ring-4 ring-gray-50"
                                    >
                                        <p className="text-[11px] font-black uppercase tracking-widest text-gray-900">OpenAI</p>
                                        <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">Global Intelligence Standard</p>
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <CustomSelect
                                    label="Intelligence Model"
                                    value={form.llmModel}
                                    onChange={val => setForm(prev => ({ ...prev, llmModel: val }))}
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
                                onChange={e => setForm(prev => ({ ...prev, llmTemperature: parseFloat(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-gray-900"
                            />
                        </div>
                    </div>
                </section>

                {/* Final Actions */}
                <div className="pt-12 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-4">
                        <div className="h-11 w-11 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 shadow-inner">
                            <Activity className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                            <p className="text-gray-900 font-black text-sm tracking-tight">Infrastructure Ready</p>
                            <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mt-0.5">Initialize partner organization node</p>
                        </div>
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
                            disabled={loading}
                            className="flex-1 sm:flex-none h-12 px-12 rounded-xl bg-[#F97316] text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-orange-100 hover:bg-[#EA580C] hover:translate-y-[-1px] active:translate-y-0 transition-all disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="flex items-center gap-3">
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Provisioning...
                                </div>
                            ) : "Onboard Partner"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
