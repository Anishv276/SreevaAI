"use client";

import { useEffect, useState, use, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Building2, User, Mail, ShieldCheck, Globe, RefreshCw, Play, Pause, MapPin as MapPinIcon, Sparkles, Volume2, BrainCircuit, Coins, Mic, ChevronDown, Loader2, Infinity, Shield, Layers, Mic2, AudioLines, Search, Thermometer, Lock } from "lucide-react";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { toast } from "@/components/ui/toast-custom";
import { ProctoringSignalsSection } from "@/components/super-admin/proctoring-signals-section";
import { CARTESIA_VOICES, DEFAULT_GOOGLE_TTS_MODEL, GOOGLE_TTS_MODELS, GOOGLE_VOICES, SARVAM_VOICES } from "@/lib/constants/voices";
import { DEFAULT_ORG_PLAN, ORG_PLAN_OPTIONS, normalizeOrgPlan } from "@/lib/org-plans";
import { DEFAULT_PROCTORING_SIGNALS, getProctoringSignalsForPlan, normalizeProctoringSignals } from "@/lib/proctoring-signals";
import { cn } from "@/lib/utils";

// UI Components
function PremiumInput({ label, icon: Icon, error, ...props }: any) {
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                <Icon className="h-3 w-3 text-[#F97316]" />
                {label}
                <span className="text-[#F97316] ml-0.5">*</span>
            </label>
            <input {...props} className={cn("h-10 w-full rounded-lg bg-white border border-gray-200 px-3 text-[14px] font-medium shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] hover:border-orange-300 hover:shadow-md", error && "border-red-500")} />
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

function LimitControl({ value, onChange, label }: { value: number, onChange: (val: number) => void, label: string }) {
    const isUnlimited = value === 0;
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest"><Layers className="h-3 w-3 text-[#F97316]" /> {label}</label>
            <div className="flex items-center gap-1.5">
                <div className="flex bg-gray-100/50 p-1 rounded-lg border border-gray-100 w-fit shrink-0">
                    <button type="button" onClick={() => onChange(0)} className={cn("px-3 h-7 rounded-md text-[10px] font-bold uppercase transition-all", isUnlimited ? "bg-white text-[#F97316] shadow-sm" : "text-gray-400 hover:text-gray-600")}>Unlimited</button>
                    <button type="button" onClick={() => { if (isUnlimited) onChange(1); }} className={cn("px-3 h-7 rounded-md text-[10px] font-bold uppercase transition-all", !isUnlimited ? "bg-white text-[#F97316] shadow-sm" : "text-gray-400 hover:text-gray-600")}>Limited</button>
                </div>
                {!isUnlimited && <input type="number" min="1" value={value} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} className="h-9 w-16 rounded-lg border border-gray-200 bg-white px-2 text-sm font-bold text-gray-900 focus:border-[#F97316] outline-none text-center shadow-sm" />}
            </div>
        </div>
    );
}

function CustomSelect({ value, onChange, options, label, icon: Icon }: any) {
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                <Icon className="h-3 w-3 text-[#F97316]" />
                {label}
            </label>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg bg-white border border-gray-200 px-3 text-[14px] font-medium shadow-sm focus:border-[#F97316] focus:outline-none hover:border-orange-300 transition-all">
                {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>
    );
}

export default function EditOrgPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [previewLoading, setPreviewLoading] = useState(false);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
    const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
    const [voiceSearch, setVoiceSearch] = useState("");
    const [creditsInput, setCreditsInput] = useState("0");

    const [form, setForm] = useState({
        name: "", slug: "", plan: DEFAULT_ORG_PLAN,
        maxActiveDrives: 0, maxTeamMembers: 0,
        proctoringSignals: { ...DEFAULT_PROCTORING_SIGNALS },
        location: "", adminName: "", adminEmail: "",
        ttsProvider: "CARTESIA", cartesiaVoiceId: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        cartesiaModel: "cartesia/sonic-3", sarvamModel: "bulbul:v3", sarvamVoice: "shubh",
        googleModel: DEFAULT_GOOGLE_TTS_MODEL, googleVoiceName: "Puck",
        sttProvider: "DEEPGRAM", deepgramModel: "nova-3-general", sarvamSttModel: "saaras:v3",
        llmProvider: "OPENAI", llmModel: "gpt-4o", llmTemperature: 0.7,
    });

    const handleTtsProviderChange = (v: string) => {
        if (v === "GOOGLE") {
            setForm(p => ({
                ...p,
                ttsProvider: "GOOGLE",
                sttProvider: "GOOGLE",
                llmProvider: "GOOGLE",
                llmModel: "gemini-2.0-flash",
                googleModel: DEFAULT_GOOGLE_TTS_MODEL,
                googleVoiceName: "Puck"
            }));
        } else {
            setForm(p => ({ 
                ...p, 
                ttsProvider: v,
                sttProvider: p.sttProvider === "GOOGLE" ? "DEEPGRAM" : p.sttProvider,
                llmProvider: p.llmProvider === "GOOGLE" ? "OPENAI" : p.llmProvider,
                llmModel: p.llmModel.startsWith("gemini") ? "gpt-4o" : p.llmModel
            }));
        }
    };

    const stopCurrentPreview = () => { if (activeAudio) { activeAudio.pause(); setActiveAudio(null); } setPlayingVoiceId(null); };

    const getVoicesForProvider = () => {
        if (form.ttsProvider === "SARVAM") return SARVAM_VOICES;
        if (form.ttsProvider === "GOOGLE") return GOOGLE_VOICES;
        return CARTESIA_VOICES;
    };

    const getVoiceId = () => {
        if (form.ttsProvider === "SARVAM") return form.sarvamVoice;
        if (form.ttsProvider === "GOOGLE") return form.googleVoiceName;
        return form.cartesiaVoiceId;
    };

    const playSample = async (voiceId: string) => {
        const provider = form.ttsProvider;
        const modelId = provider === "SARVAM" ? form.sarvamModel : provider === "GOOGLE" ? form.googleModel : form.cartesiaModel;
        if (playingVoiceId === voiceId) { stopCurrentPreview(); return; }
        setPreviewLoading(true);
        try {
            stopCurrentPreview();
            const res = await fetch("/api/admin/voice/preview", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, voiceId, modelId, transcript: "Configuration synchronized." }),
            });
            if (!res.ok) throw new Error("Preview failed");
            const blob = await res.blob();
            const audio = new Audio(URL.createObjectURL(blob));
            audio.onended = () => stopCurrentPreview();
            await audio.play();
            setActiveAudio(audio);
            setPlayingVoiceId(voiceId);
        } catch (err) { toast.error("Preview failed."); }
        finally { setPreviewLoading(false); }
    };

    useEffect(() => {
        const fetchOrg = async () => {
            try {
                const res = await fetch(`/api/super-admin/orgs/${id}`);
                const data = await res.json();
                if (!res.ok) { setError("Organization not found"); return; }
                setForm({
                    name: data.name || "", slug: data.slug || "",
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
                setCreditsInput(String(data.creditsTotal || 0));
            } catch { setError("Failed to load organization"); }
            finally { setLoading(false); }
        };
        fetchOrg();
    }, [id]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch(`/api/super-admin/orgs/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, creditsTotal: parseFloat(creditsInput) || 0 }),
            });
            if (!res.ok) throw new Error("Failed to update records");
            toast.success("Organization updated!");
        } catch (err: any) { toast.error(err.message); }
        finally { setSaving(false); }
    };

    if (loading) { return <div className="p-20 text-center min-h-screen flex items-center justify-center"><RefreshCw className="h-8 w-8 text-[#F97316] animate-spin opacity-20" /></div>; }

    return (
        <div className="p-8 lg:p-12 w-full max-w-[1100px] mx-auto bg-white min-h-screen">
            <button onClick={() => router.back()} className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-[11px] font-bold uppercase tracking-widest mb-10 transition-all">
                <ArrowLeft className="h-3 w-3 group-hover:-translate-x-1" /> Back to Registry
            </button>

            <div className="flex items-center gap-6 mb-16">
                <div className="h-14 w-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316]"><Building2 className="h-7 w-7" /></div>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none">Modify Client</h1>
                    <p className="text-gray-400 font-medium text-sm mt-1">Updating configuration for <span className="text-gray-900 font-bold">{form.name}</span></p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-8">
                    <SectionHeader title="Organization Profile" />
                    <div className="grid md:grid-cols-2 gap-6">
                        <PremiumInput label="Company Name" icon={Building2} value={form.name} onChange={(e:any) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Reliance Group" required />
                        <PremiumInput label="URL Identifier" icon={Globe} value={form.slug} onChange={(e:any) => setForm(p => ({ ...p, slug: e.target.value.toLowerCase() }))} placeholder="slug-path" required />
                    </div>
                    <div className="pt-6 border-t border-gray-100">
                        <div className="space-y-2">
                            <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest"><MapPinIcon className="h-3 w-3 text-[#F97316]" />Location</label>
                            <LocationAutocomplete value={form.location || ""} onChange={val => setForm(p => ({ ...p, location: val }))} placeholder="Mumbai, India" />
                        </div>
                    </div>
                </div>

                <div className="space-y-8 pt-8 border-t border-gray-100">
                    <SectionHeader title="Infrastructure & AI" />
                    <div className="grid md:grid-cols-2 gap-10">
                        <div className="space-y-6">
                            <CustomSelect label="TTS Provider" icon={Volume2} value={form.ttsProvider} onChange={handleTtsProviderChange} options={[{ value: "CARTESIA", label: "Cartesia" }, { value: "SARVAM", label: "Sarvam" }, { value: "GOOGLE", label: "Google Cloud" }]} />
                            <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest"><Mic2 className="h-3 w-3 text-[#F97316]" />Voice Selection</label>
                                <div className="relative">
                                    <button type="button" onClick={() => setShowVoiceDropdown(!showVoiceDropdown)} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 flex items-center justify-between hover:border-orange-300 transition-all outline-none">
                                        <div className="flex items-center gap-2">
                                            <AudioLines className="h-4 w-4 text-orange-500" />
                                            <span className="text-sm font-bold text-gray-900">{getVoicesForProvider().find(v => v.id === getVoiceId())?.name || "Select Voice"}</span>
                                        </div>
                                        <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", showVoiceDropdown && "rotate-180")} />
                                    </button>
                                    {showVoiceDropdown && (
                                        <div className="absolute z-50 mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-2xl p-2 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                                            <div className="relative mb-2">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                                <input type="text" value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)} placeholder="Search voices..." className="h-8 w-full pl-8 pr-3 rounded-lg border border-gray-100 text-[11px] focus:outline-none" />
                                            </div>
                                            {getVoicesForProvider().filter(v => v.name.toLowerCase().includes(voiceSearch.toLowerCase())).map(v => (
                                                <button key={v.id} type="button" onClick={() => { setForm(p => ({...p, [form.ttsProvider === "SARVAM" ? "sarvamVoice" : form.ttsProvider === "GOOGLE" ? "googleVoiceName" : "cartesiaVoiceId"]: v.id })); setShowVoiceDropdown(false); }} className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-orange-50 group text-left transition-all">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-gray-900 group-hover:text-orange-600">{v.name}</span>
                                                        <span className="text-[9px] text-gray-400 font-medium uppercase tracking-tight truncate max-w-[150px]">{v.description}</span>
                                                    </div>
                                                    <div onClick={(e) => { e.stopPropagation(); playSample(v.id); }} className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-orange-600 hover:text-white transition-all">
                                                        {playingVoiceId === v.id ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current ml-0.5" />}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <CustomSelect label="Neural Model" icon={Layers} value={form.ttsProvider === "SARVAM" ? form.sarvamModel : form.ttsProvider === "GOOGLE" ? form.googleModel : form.cartesiaModel} onChange={(v:any) => setForm(p => ({ ...p, [form.ttsProvider === "SARVAM" ? "sarvamModel" : form.ttsProvider === "GOOGLE" ? "googleModel" : "cartesiaModel"]: v }))} options={form.ttsProvider === "CARTESIA" ? [{ value: "cartesia/sonic-3", label: "Sonic-3 (Ultra)" }, { value: "cartesia/sonic-2", label: "Sonic-2" }] : form.ttsProvider === "SARVAM" ? [{ value: "bulbul:v3", label: "Bulbul v3" }, { value: "bulbul:v2", label: "Bulbul v2" }] : GOOGLE_TTS_MODELS.map(m => ({ value: m.value, label: m.label }))} />
                        </div>
                        <div className="space-y-6">
                            <div className="relative group">
                                <CustomSelect label="Transcription (STT)" icon={Mic} value={form.sttProvider} onChange={(v:any) => setForm(p => ({ ...p, sttProvider: v }))} options={form.ttsProvider === "GOOGLE" ? [{ value: "GOOGLE", label: "Google Cloud STT" }] : [{ value: "DEEPGRAM", label: "Deepgram (Flux)" }, { value: "SARVAM", label: "Sarvam (Regional)" }]} />
                                {form.ttsProvider === "GOOGLE" && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-end pr-10">
                                        <div className="flex items-center gap-1 bg-blue-50/90 border border-blue-100 px-1.5 py-0.5 rounded shadow-sm translate-y-1">
                                            <Lock className="h-2 w-2 text-blue-600" />
                                            <span className="text-[7px] font-black text-blue-600 uppercase tracking-widest">Stack Locked</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="relative group">
                                <CustomSelect label="Intelligence (LLM)" icon={BrainCircuit} value={form.llmModel} onChange={(v:any) => setForm(p => ({ ...p, llmModel: v }))} options={form.ttsProvider === "GOOGLE" ? [{ value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }, { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" }] : [{ value: "gpt-4o", label: "GPT-4o (Elite)" }, { value: "gpt-4o-mini", label: "GPT-4o Mini" }]} />
                                {form.ttsProvider === "GOOGLE" && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-end pr-10">
                                        <div className="flex items-center gap-1 bg-blue-50/90 border border-blue-100 px-1.5 py-0.5 rounded shadow-sm translate-y-1">
                                            <Lock className="h-2 w-2 text-blue-600" />
                                            <span className="text-[7px] font-black text-blue-600 uppercase tracking-widest">Stack Locked</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest"><Thermometer className="h-3 w-3 text-[#F97316]" /> Temperature</label>
                                    <span className="text-[12px] font-black text-gray-900">{form.llmTemperature.toFixed(1)}</span>
                                </div>
                                <input type="range" min="0" max="1" step="0.1" value={form.llmTemperature} onChange={e => setForm(p => ({ ...p, llmTemperature: parseFloat(e.target.value) }))} className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-[#F97316] hover:accent-orange-600 transition-all" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Billing Section */}
                <div className="space-y-8 pt-8 border-t border-gray-100">
                    <SectionHeader title="Billing & Quotas" />
                    <div className="grid md:grid-cols-3 gap-6 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                        <LimitControl label="Drive Limit" value={form.maxActiveDrives} onChange={val => setForm(p => ({ ...p, maxActiveDrives: val }))} />
                        <LimitControl label="Team Limit" value={form.maxTeamMembers} onChange={val => setForm(p => ({ ...p, maxTeamMembers: val }))} />
                        <PremiumInput label="Available Credits" icon={Coins} type="number" value={creditsInput} onChange={(e:any) => setCreditsInput(e.target.value)} />
                    </div>
                </div>

                <div className="space-y-8 pt-8 border-t border-gray-100">
                    <SectionHeader title="Security & Plan" />
                    <div className="grid md:grid-cols-4 gap-8">
                        <div className="md:col-span-1 space-y-4">
                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Partner Plan</label>
                            {ORG_PLAN_OPTIONS.map(p => (
                                <button key={p.id} type="button" onClick={() => setForm(prev => ({ ...prev, plan: p.id, proctoringSignals: getProctoringSignalsForPlan(p.id) }))} className={cn("w-full p-4 rounded-lg border text-left transition-all", form.plan === p.id ? "border-[#F97316] bg-orange-50 shadow-sm" : "border-gray-100 hover:border-gray-200")}>
                                    <p className="text-xs font-black uppercase text-gray-900">{p.label}</p>
                                    <p className="text-[10px] text-gray-400 font-bold mt-0.5">{p.desc}</p>
                                </button>
                            ))}
                        </div>
                        <div className="md:col-span-3">
                            <ProctoringSignalsSection signals={form.proctoringSignals as any} onChange={(k, v) => setForm(p => ({ ...p, proctoringSignals: { ...p.proctoringSignals, [k]: v } }))} />
                        </div>
                    </div>
                </div>

                <div className="pt-12 border-t border-gray-100 flex items-center justify-between">
                    <button type="button" onClick={() => router.back()} className="h-14 px-10 rounded-lg border border-gray-200 text-gray-500 font-bold text-xs uppercase tracking-widest hover:bg-gray-50 transition-all">Cancel</button>
                    <button type="submit" disabled={saving} className="h-14 px-16 rounded-lg bg-[#F97316] text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-200 hover:bg-orange-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3">
                        {saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Shield className="h-5 w-5" />} {saving ? "SAVING..." : "UPDATE CONFIGURATION"}
                    </button>
                </div>
            </form>
        </div>
    );
}
