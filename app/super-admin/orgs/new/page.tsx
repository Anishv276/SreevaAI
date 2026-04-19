"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Building2, User, Mail, Lock, ShieldCheck, Globe, RefreshCw, Play, Pause, MapPin as MapPinIcon } from "lucide-react";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { toast } from "@/components/ui/toast-custom";
import { CARTESIA_VOICES } from "@/lib/constants/voices";

const PLANS = [
    { id: "STARTER", label: "Starter", desc: "For small teams", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
    { id: "PROFESSIONAL", label: "Professional", desc: "Best for scaling", color: "text-[#F97316]", bg: "bg-orange-50", border: "border-orange-100" },
    { id: "ENTERPRISE", label: "Enterprise", desc: "Maximum power", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" }
];

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
        plan: "STARTER",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
        ttsProvider: "CARTESIA",
        cartesiaVoiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        cartesiaModel: "sonic-english",
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
        const endpoint = isCartesia ? "/api/admin/voice/preview" : "/api/admin/voice/preview/sarvam";
        const transcript = isCartesia 
            ? "Hello! I am ready to conduct high-quality AI interviews for your team." 
            : "à¤¨à¤®à¤¸à¥à¤¤à¥‡, à¤®à¥ˆà¤‚ à¤†à¤ªà¤•à¥€ à¤Ÿà¥€à¤® à¤•à¥‡ à¤²à¤¿à¤ à¤‰à¤šà¥à¤š à¤—à¥à¤£à¤µà¤¤à¥à¤¤à¤¾ à¤µà¤¾à¤²à¥‡ à¤¸à¤¾à¤•à¥à¤·à¤¾à¤¤à¥à¤•à¤¾à¤° à¤†à¤¯à¥‹à¤œà¤¿à¤¤ à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤¤à¥ˆà¤¯à¤¾à¤° à¤¹à¥‚à¤à¥¤";

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
                body: JSON.stringify({ voiceId, modelId, transcript })
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
            alert(err.message || "Could not play voice sample. Please check your API key or Voice ID.");
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
            <div className="p-8 flex items-center justify-center min-h-[80vh]">
                <div className="w-full max-w-lg bg-white border border-gray-100 rounded-xl p-8 text-center space-y-6 shadow-sm animate-fade-slide">
                    <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center mx-auto text-green-500">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-gray-900 font-bold text-2xl tracking-tight">{success.orgName} is Live!</h2>
                        <p className="text-gray-500 font-medium">Organization and HR Admin account created successfully.</p>
                    </div>
                    
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-left space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="w-1 h-5 bg-green-500 rounded-full" />
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">HR Admin Credentials</p>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-gray-200/50">
                                <span className="text-gray-500 text-xs font-semibold">Email</span>
                                <span className="text-gray-950 font-bold text-sm">{success.adminEmail}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 text-xs font-semibold">Portal</span>
                                <span className="text-[#F97316] font-bold text-sm">/login</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                        <button
                            onClick={() => { setSuccess(null); setForm({ orgName: "", slug: "", location: "", plan: "STARTER", adminName: "", adminEmail: "", adminPassword: "", ttsProvider: "CARTESIA", cartesiaVoiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc", cartesiaModel: "sonic-english", sarvamModel: "bulbul:v3", sarvamVoice: "shubh", sttProvider: "DEEPGRAM", deepgramModel: "nova-3-general", sarvamSttModel: "saaras:v3", llmProvider: "OPENAI", llmModel: "gpt-4o", llmTemperature: 0.7 }); }}
                            className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 font-bold text-xs uppercase tracking-widest hover:bg-gray-50"
                        >
                            Add Another
                        </button>
                        <button
                            onClick={() => router.push("/super-admin/orgs")}
                            className="flex-1 h-10 rounded-xl bg-gray-950 text-white font-bold text-xs uppercase tracking-widest shadow-md hover:bg-black"
                        >
                            View All Orgs
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 lg:p-12 max-w-4xl animate-fade-slide">
            {/* Header */}
            <div className="mb-12">
                <button 
                    onClick={() => router.back()} 
                    className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-sm font-semibold mb-6 transition-all"
                >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    Back to List
                </button>
                <div className="flex items-center gap-6 mb-10">
                    <div className="h-14 w-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shadow-sm">
                        <Building2 className="h-8 w-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-none">Add New Client</h1>
                        <p className="text-gray-500 font-medium text-sm mt-2">Create a professional organization on the Lumoscale platform.</p>
                    </div>
                </div>

                {/* Step Indicator */}
                <div className="relative flex justify-between w-full mb-8">
                    <div className="absolute top-4 left-0 h-[2px] w-full bg-gray-200 rounded-full" />
                    <div className="absolute top-4 left-0 h-[2px] bg-[#F97316] rounded-full transition-all duration-300" style={{ width: form.orgName ? (form.adminName ? "100%" : "50%") : "0%" }} />
                    {["Organization Blueprint", "Administrative Control"].map((step, i) => {
                        const isCompleted = (i === 0 && form.adminName) || (i === 1 && form.adminEmail && form.adminPassword);
                        const isCurrent = (i === 0 && !form.adminName) || (i === 1 && form.adminName && !form.adminEmail);
                        return (
                            <div key={step} className="relative z-10 flex flex-col items-center gap-2">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white transition-all ${isCompleted ? "border-[#F97316] bg-[#F97316] text-white" : isCurrent ? "border-[#F97316] text-[#F97316]" : "border-gray-300 text-gray-400"}`}>
                                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                                </div>
                                <span className={`text-[11px] font-semibold ${isCompleted || isCurrent ? "text-gray-900" : "text-gray-400"}`}>{step}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">
                {/* Organization Details */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">1. Organization Blueprint</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white border border-gray-100 rounded-xl p-6 shadow-sm group">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                    <Building2 className="h-3 w-3" /> Company Name
                                </label>
                                <input
                                    value={form.orgName}
                                    onChange={e => handleOrgNameChange(e.target.value)}
                                    placeholder="e.g. Zomato"
                                    required
                                    className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                    <Globe className="h-3 w-3" /> URL Slug
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm font-bold">/</span>
                                    <input
                                        value={form.slug}
                                        onChange={e => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                                        placeholder="zomato"
                                        required
                                        className="h-10 w-full pl-6 pr-3 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                    <MapPinIcon className="h-3 w-3" /> Physical Headquarters
                                </label>
                                <LocationAutocomplete
                                    value={form.location || ""}
                                    onChange={val => setForm({ ...form, location: val })}
                                    placeholder="e.g. Bangalore, India"
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Select Enterprise Plan</label>
                                <div className="grid gap-3">
                                    {PLANS.map(plan => (
                                        <button
                                            key={plan.id}
                                            type="button"
                                            onClick={() => setForm(prev => ({ ...prev, plan: plan.id }))}
                                            className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                                                form.plan === plan.id
                                                    ? `${plan.border} ${plan.bg} shadow-md`
                                                    : "border-gray-50 bg-gray-50/50 hover:bg-gray-50 hover:border-gray-100 opacity-60 hover:opacity-100"
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${form.plan === plan.id ? "bg-[#F97316] animate-pulse" : "bg-gray-300"}`} />
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">{plan.label}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 mt-0.5">{plan.desc}</p>
                                                </div>
                                            </div>
                                            {form.plan === plan.id && <ShieldCheck className="h-4 w-4 text-[#F97316]" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* HR Admin Account */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-blue-500 rounded-full shadow-sm" />
                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">2. Primary HR Controller</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                        <div className="space-y-2">
                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                <User className="h-3 w-3" /> Full Name
                            </label>
                            <input
                                value={form.adminName}
                                onChange={e => setForm(prev => ({ ...prev, adminName: e.target.value }))}
                                placeholder="Amit Sharma"
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                <Mail className="h-3 w-3" /> Business Email
                            </label>
                            <input
                                type="email"
                                value={form.adminEmail}
                                onChange={e => setForm(prev => ({ ...prev, adminEmail: e.target.value }))}
                                placeholder="amit@zomato.com"
                                required
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                            />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                <Lock className="h-3 w-3" /> Temporary Password
                            </label>
                            <input
                                type="text"
                                value={form.adminPassword}
                                onChange={e => setForm(prev => ({ ...prev, adminPassword: e.target.value }))}
                                placeholder="Set secure initial access key"
                                required
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                            />
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-2 flex items-center gap-1.5">
                                <span className="w-1 h-1 bg-blue-400 rounded-full" />
                                Share securely. Admin logs in via the HR portal.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Voice Infrastructure */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-purple-500 rounded-full shadow-sm" />
                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">3. Voice Infrastructure (TTS)</h3>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-10">
                        {/* Provider Selection Dropdown */}
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Primary TTS Engine</label>
                                <select 
                                    value={form.ttsProvider}
                                    onChange={e => setForm(prev => ({ ...prev, ttsProvider: e.target.value }))}
                                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold focus:ring-2 focus:ring-purple-100 outline-none"
                                >
                                    <option value="CARTESIA">Cartesia (Ultra-Low Latency)</option>
                                    <option value="SARVAM">Sarvam AI (Indian Regional)</option>
                                </select>
                            </div>
                            <div className="flex items-end pb-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                    {form.ttsProvider === "CARTESIA" 
                                        ? "Optimized for elite conversational AI in English." 
                                        : "Optimized for regional authenticity across 11+ Indian languages."}
                                </p>
                            </div>
                        </div>

                        {/* Cartesia Config */}
                        {form.ttsProvider === "CARTESIA" && (
                            <div className="grid md:grid-cols-2 gap-8 pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Voice Selection</label>
                                        <button 
                                            type="button"
                                            disabled={previewLoading || !form.cartesiaVoiceId}
                                            onClick={playSample}
                                            className="text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-1.5 hover:text-purple-700 transition-colors disabled:opacity-50"
                                        >
                                            {previewLoading ? (
                                                <RefreshCw className="h-3 w-3 animate-spin" />
                                            ) : activeAudio ? (
                                                <Pause className="h-3 w-3" />
                                            ) : (
                                                <Play className="h-3 w-3" />
                                            )}
                                            {previewLoading ? "Generating..." : activeAudio ? "Playing..." : "Play Sample"}
                                        </button>
                                    </div>
                                    <select 
                                        value={
                                            CARTESIA_VOICES.some(v => v.id === form.cartesiaVoiceId)
                                                ? form.cartesiaVoiceId 
                                                : form.cartesiaVoiceId === "_none" ? "_none" : "custom"
                                        }
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val === "custom") {
                                                setForm(prev => ({ ...prev, cartesiaVoiceId: "" }));
                                            } else {
                                                setForm(prev => ({ ...prev, cartesiaVoiceId: val }));
                                            }
                                        }}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-purple-100 outline-none"
                                    >
                                        <option value="_none">-- No Voice Selected --</option>
                                        {CARTESIA_VOICES.filter(v => v.provider === "CARTESIA").map(v => (
                                            <option key={v.id} value={v.id}>{v.name} ({v.description})</option>
                                        ))}
                                        <option value="custom">-- Custom Voice ID --</option>
                                    </select>
                                    {(form.cartesiaVoiceId !== "_none" && !CARTESIA_VOICES.some(v => v.id === form.cartesiaVoiceId)) && (
                                        <input
                                            type="text"
                                            value={form.cartesiaVoiceId}
                                            onChange={e => setForm(prev => ({ ...prev, cartesiaVoiceId: e.target.value }))}
                                            placeholder="Paste custom ID here (e.g. 9626c3...)"
                                            className="h-11 w-full rounded-xl border border-purple-200 bg-purple-50 shrink-0 px-3 text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none mt-2 font-sans placeholder:text-purple-300 text-purple-900"
                                        />
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Neural Engine (Model)</label>
                                    <select 
                                        value={form.cartesiaModel}
                                        onChange={e => setForm(prev => ({ ...prev, cartesiaModel: e.target.value }))}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-purple-100 outline-none"
                                    >
                                        <option value="sonic-english">sonic-english (Flagship)</option>
                                        <option value="sonic-multilingual">sonic-multilingual</option>
                                        <option value="sonic-3">sonic-3 (Ultra-Low Latency)</option>
                                    </select>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.15em] leading-relaxed mt-1">Sonic 3 is optimized for elite real-time responsiveness.</p>
                                </div>
                            </div>
                        )}
                        {/* Sarvam Config */}
                        {form.ttsProvider === "SARVAM" && (
                            <div className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                                <div className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Model Version (Bulbul)</label>
                                        <select 
                                            value={form.sarvamModel}
                                            onChange={e => setForm(prev => ({ ...prev, sarvamModel: e.target.value }))}
                                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-purple-100 outline-none"
                                        >
                                            <option value="bulbul:v1">Bulbul v1 (Legacy)</option>
                                            <option value="bulbul:v2">Bulbul v2 (Optimized)</option>
                                            <option value="bulbul:v3">Bulbul v3 (Flagship)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Neural Speaker</label>
                                            <button 
                                                type="button"
                                                disabled={previewLoading || !form.sarvamVoice}
                                                onClick={playSample}
                                                className="text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-1.5 hover:text-purple-700 transition-colors disabled:opacity-50"
                                            >
                                                {previewLoading ? (
                                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                                ) : activeAudio ? (
                                                    <Pause className="h-3 w-3" />
                                                ) : (
                                                    <RefreshCw className="h-3 w-3" />
                                                )}
                                                {previewLoading ? "Generating..." : activeAudio ? "Playing..." : "Preview Speaker"}
                                            </button>
                                        </div>
                                        <select 
                                            value={form.sarvamVoice}
                                            onChange={e => setForm(prev => ({ ...prev, sarvamVoice: e.target.value }))}
                                            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-purple-100 outline-none"
                                        >
                                            {form.sarvamModel === "bulbul:v3" ? (
                                                 <>
                                                     <option value="shubh">Shubh (Default Flagship)</option>
                                                     <option value="manan">Manan (Clear Male)</option>
                                                     <option value="ishita">Ishita (Female)</option>
                                                     <option value="shreya">Shreya (Female)</option>
                                                     <option value="aditya">Aditya (Male)</option>
                                                     <option value="ritu">Ritu (Female)</option>
                                                     <option value="priya">Priya (Female)</option>
                                                     <option value="neha">Neha (Female)</option>
                                                     <option value="rahul">Rahul (Deep Male)</option>
                                                     <option value="pooja">Pooja (Female)</option>
                                                     <option value="rohan">Rohan (Male)</option>
                                                     <option value="simran">Simran (Female)</option>
                                                     <option value="kavya">Kavya (Female)</option>
                                                     <option value="amit">Amit (Male)</option>
                                                     <option value="dev">Dev (Male)</option>
                                                     <option value="varun">Varun (Male)</option>
                                                     <option value="kabir">Kabir (Male)</option>
                                                     <option value="tanya">Tanya (Female)</option>
                                                     <option value="sunny">Sunny (Male)</option>
                                                 </>
                                             ) : form.sarvamModel === "bulbul:v2" ? (
                                                 <>
                                                     <option value="anushka">Anushka (Female)</option>
                                                     <option value="manisha">Manisha (Female)</option>
                                                     <option value="vidya">Vidya (Female)</option>
                                                     <option value="arya">Arya (Male)</option>
                                                     <option value="abhilash">Abhilash (Male)</option>
                                                     <option value="karun">Karun (Male)</option>
                                                     <option value="hitesh">Hitesh (Male)</option>
                                                 </>
                                             ) : (
                                                 <>
                                                     <option value="meera">Meera (Female)</option>
                                                     <option value="pavithra">Pavithra (Female)</option>
                                                     <option value="maitreyi">Maitreyi (Female)</option>
                                                     <option value="amartya">Amartya (Male)</option>
                                                     <option value="amol">Amol (Male)</option>
                                                     <option value="arvind">Arvind (Male)</option>
                                                 </>
                                             )}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Speech Infrastructure */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-emerald-500 rounded-full shadow-sm" />
                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">4. Speech Recognition (STT)</h3>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-10">
                        {/* Provider Selection */}
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Neural Listening Engine</label>
                                <select 
                                    value={form.sttProvider}
                                    onChange={e => setForm(prev => ({ ...prev, sttProvider: e.target.value }))}
                                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold focus:ring-2 focus:ring-emerald-100 outline-none"
                                >
                                    <option value="DEEPGRAM">Deepgram (Elite Latency)</option>
                                    <option value="SARVAM">Sarvam AI (Regional Saaras)</option>
                                </select>
                            </div>
                            <div className="flex items-end pb-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                    {form.sttProvider === "DEEPGRAM" 
                                        ? "SOTA transcription with industry-leading speed." 
                                        : "Optimized for regional accent comprehension across India."}
                                </p>
                            </div>
                        </div>

                        {/* Deepgram Config */}
                        {form.sttProvider === "DEEPGRAM" && (
                            <div className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Transcription Model</label>
                                    <select 
                                        value={form.deepgramModel}
                                        onChange={e => setForm(prev => ({ ...prev, deepgramModel: e.target.value }))}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-emerald-100 outline-none"
                                    >
                                        <optgroup label="Flux (Lowest Latency)">
                                            <option value="flux-general-en">Flux General (English)</option>
                                        </optgroup>
                                        <optgroup label="Nova-3 (Next Gen)">
                                            <option value="nova-3-general">Nova-3 General</option>
                                            <option value="nova-3">Nova-3 (Balanced)</option>
                                            <option value="nova-3-medical">Nova-3 Medical</option>
                                        </optgroup>
                                        <optgroup label="Nova-2 (Standard)">
                                            <option value="nova-2-general">Nova-2 General</option>
                                            <option value="nova-2-phonecall">Nova-2 Phonecall</option>
                                            <option value="nova-2-voicemail">Nova-2 Voicemail</option>
                                            <option value="nova-2-meeting">Nova-2 Meeting</option>
                                            <option value="nova-2-conversationalai">Nova-2 Conversational AI</option>
                                            <option value="nova-2-video">Nova-2 Video</option>
                                            <option value="nova-2-medical">Nova-2 Medical</option>
                                            <option value="nova-2-finance">Nova-2 Finance</option>
                                            <option value="nova-2-automotive">Nova-2 Automotive</option>
                                            <option value="nova-2-drivethru">Nova-2 Drivethru</option>
                                            <option value="nova-2-atc">Nova-2 Air Traffic Control</option>
                                        </optgroup>
                                        <optgroup label=" Whisper (Benchmarked)">
                                            <option value="whisper-large">Whisper Large</option>
                                            <option value="whisper-medium">Whisper Medium</option>
                                            <option value="whisper-small">Whisper Small</option>
                                            <option value="whisper-base">Whisper Base</option>
                                            <option value="whisper-tiny">Whisper Tiny</option>
                                        </optgroup>
                                        <optgroup label="Legacy / Enhanced">
                                            <option value="enhanced-general">Enhanced General</option>
                                            <option value="enhanced-phonecall">Enhanced Phonecall</option>
                                            <option value="nova-general">Nova-1 General</option>
                                            <option value="nova-phonecall">Nova-1 Phonecall</option>
                                        </optgroup>
                                    </select>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed mt-1">
                                        Select specialized neural architecture for the client's specific use case.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Sarvam STT Config */}
                        {form.sttProvider === "SARVAM" && (
                            <div className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Neural Transcription Model</label>
                                    <select 
                                        value={form.sarvamSttModel}
                                        onChange={e => setForm(prev => ({ ...prev, sarvamSttModel: e.target.value }))}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-emerald-100 outline-none"
                                    >
                                        <optgroup label="Premium">
                                            <option value="saaras:v3">Saaras v3 (High Quality)</option>
                                            <option value="saarika:v2.5">Saarika v2.5 (Streaming USM)</option>
                                        </optgroup>
                                        <optgroup label="Legacy">
                                            <option value="saaras:v2">Saaras v2 (Standard)</option>
                                        </optgroup>
                                    </select>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed mt-1">
                                        Optimized for multi-accent Indian regional speech recognition with sovereign accuracy.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Inference Infrastructure (Step 5) */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-blue-600 rounded-full shadow-sm" />
                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">5. Inference Infrastructure (LLM)</h3>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-10">
                        {/* LLM Selection */}
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">LLM Provider</label>
                                <select 
                                    value={form.llmProvider}
                                    onChange={e => setForm(prev => ({ ...prev, llmProvider: e.target.value }))}
                                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                                >
                                    <option value="OPENAI">🤖 OpenAI (Global Standard)</option>
                                </select>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">LLM Model</label>
                                <select 
                                    value={form.llmModel}
                                    onChange={e => setForm(prev => ({ ...prev, llmModel: e.target.value }))}
                                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                                >
                                    <option value="gpt-4o">GPT-4o (Recommended)</option>
                                    <option value="gpt-4o-mini">GPT-4o-mini</option>
                                    <option value="gpt-4.1">GPT-4.1 (Next Gen)</option>
                                    <option value="gpt-4.1-mini">GPT-4.1-mini</option>
                                    <option value="o1-preview">o1-preview</option>
                                    <option value="o1-mini">o1-mini</option>
                                    <option value="gpt-5.1">GPT-5.1 (Research)</option>
                                    <option value="gpt-5.1-mini">GPT-5.1-mini</option>
                                    <option value="gpt-5.0">GPT-5.0 (Frontier)</option>
                                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                </select>
                            </div>
                        </div>

                        {/* Temperature Control */}
                        <div className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">LLM Temperature</label>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                            {form.llmTemperature <= 0.3 ? "Deterministic / Precise" : form.llmTemperature >= 0.8 ? "Creative / Variable" : "Balanced Reasoning"}
                                        </p>
                                    </div>
                                    <span className="h-8 px-3 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xs font-black">
                                        {Number(form.llmTemperature).toFixed(1)}
                                    </span>
                                </div>
                                <input 
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={form.llmTemperature}
                                    onChange={e => setForm(prev => ({ ...prev, llmTemperature: parseFloat(e.target.value) }))}
                                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <div className="flex justify-between text-[9px] font-black text-gray-300 uppercase tracking-widest">
                                    <span>Focused</span>
                                    <span>Balanced</span>
                                    <span>Creative</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-6 rounded-2xl bg-red-50 border border-red-100 text-red-500 text-xs font-black uppercase tracking-widest flex items-center gap-4 animate-in-up">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                        {error}
                    </div>
                )}

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <p className="text-gray-500 text-[11px] font-medium uppercase tracking-widest max-w-xs">
                        By click provisioning, you allocate a new tenant on the Lumoscale Network.
                    </p>
                    <button
                        type="submit"
                        disabled={loading}
                        className="h-10 px-6 rounded-xl bg-gray-900 text-white font-bold text-[13px] shadow-lg hover:bg-black transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
                    >
                        {loading ? "Adding Client..." : "ADD CLIENT"}
                    </button>
                </div>
            </form>
        </div>
    );
}

