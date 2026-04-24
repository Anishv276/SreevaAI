"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Building2, ShieldCheck, Globe, Loader2, User, Mail, ShieldAlert, RefreshCw, Lock, Play, Pause, MapPin as MapPinIcon, Coins } from "lucide-react";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
import { toast } from "@/components/ui/toast-custom";
import { CARTESIA_VOICES } from "@/lib/constants/voices";
import { DEFAULT_ORG_PLAN, ORG_PLAN_OPTIONS, normalizeOrgPlan } from "@/lib/org-plans";
import { DEFAULT_PROCTORING_SIGNALS, normalizeProctoringSignals } from "@/lib/proctoring-signals";

export default function EditOrgPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");


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
        sttProvider: "DEEPGRAM",
        deepgramModel: "nova-3-general",
        sarvamSttModel: "saaras:v3",
        llmProvider: "OPENAI",
        llmModel: "gpt-4o",
        llmTemperature: 0.7,
    });

    const [creditsTotal, setCreditsTotal] = useState(0);
    const [creditsUsed, setCreditsUsed] = useState(0);
    const [creditsInput, setCreditsInput] = useState("");

    const [previewLoading, setPreviewLoading] = useState(false);
    const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);


    const [adminInfo, setAdminInfo] = useState<{ name: string, email: string } | null>(null);


    useEffect(() => {
        const fetchOrg = async () => {
            try {
                const res = await fetch(`/api/super-admin/orgs/${id}`);
                const data = await res.json();
                if (res.ok) {
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
                        sttProvider: data.sttProvider || "DEEPGRAM",
                        deepgramModel: data.deepgramModel || "nova-3-general",
                        sarvamSttModel: data.sarvamSttModel || "saaras:v3",
                        llmProvider: data.llmProvider || "OPENAI",
                        llmModel: data.llmModel || "gpt-4o",
                        llmTemperature: data.llmTemperature != null ? data.llmTemperature : 0.7,
                    });

                    setCreditsTotal(data.creditsTotal || 0);
                    setCreditsUsed(data.creditsUsed || 0);
                    setCreditsInput(String(data.creditsTotal || 0));

                    if (data.users && data.users.length > 0) {
                        setAdminInfo({ name: data.users[0].name, email: data.users[0].email });
                    }
                } else {
                    setError("Organization not found");
                }
            } catch {
                setError("Failed to load organization");
            } finally {
                setLoading(false);
            }
        };
        fetchOrg();
    }, [id]);

    const playSample = async () => {
        const isCartesia = form.ttsProvider === "CARTESIA";
        const voiceId = isCartesia ? form.cartesiaVoiceId : form.sarvamVoice;
        const modelId = isCartesia ? form.cartesiaModel : form.sarvamModel;
        const endpoint = "/api/admin/voice/preview";
        const transcript = isCartesia
            ? "Hello! I am ready to conduct high-quality AI interviews for your team."
            : "à¤¨à¤®à¤¸à¥à¤¤à¥‡, à¤®à¥ˆà¤‚ à¤†à¤ªà¤•à¥€ à¤Ÿà¥€à¤® à¤•à¥‡ à¤²à¤¿à¤ à¤‰à¤šà¥à¤š à¤-à¥à¤£à¤µà¤¤à¥à¤¤à¤¾ à¤µà¤¾à¤²à¥‡ à¤¸à¤¾à¤•à¥à¤·à¤¾à¤¤à¥à¤•à¤¾à¤° à¤†à¤¯à¥‹à¤œà¤¿à¤¤ à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤¤à¥ˆà¤¯à¤¾à¤° à¤¹à¥‚à¤à¥¤";

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
            alert(err.message || "Could not play voice sample. Please check your API key or Voice ID.");
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

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
        <div className="p-8 lg:p-12 max-w-5xl mx-auto font-inter bg-white text-premium animate-fade-slide">
            {/* Header */}
            <div className="mb-12">
                <button
                    onClick={() => router.back()}
                    className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-[11px] font-black uppercase tracking-widest mb-8 transition-all"
                >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    Back to List
                </button>
                <div className="flex items-center gap-6 mb-10">
                    <div className="h-14 w-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shadow-sm">
                        <Building2 className="h-8 w-8" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-none">Modify Client</h1>
                        <p className="text-gray-500 font-medium text-sm mt-2">Update configuration for <span className="text-gray-900 font-bold">{form.name}</span></p>
                    </div>
                </div>

                {/* Step Indicator (Modified for Edit View) */}
                <div className="relative flex justify-between w-full mb-8">
                    <div className="absolute top-4 left-0 h-[2px] w-full bg-gray-200 rounded-full" />
                    <div className="absolute top-4 left-0 h-[2px] bg-[#F97316] rounded-full transition-all duration-300 w-full" />
                    {["Organization Details", "Administrative Control"].map((step, i) => (
                        <div key={step} className="relative z-10 flex flex-col items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white border-[#F97316] text-[#F97316]">
                                <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">{step}</span>
                        </div>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">
                {/* Organization Details */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Organization Blueprint</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white border border-gray-100 rounded-xl p-6 shadow-sm group">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 leading-none">
                                    <Building2 className="h-3 w-3" /> Company Name
                                </label>
                                <input
                                    value={form.name}
                                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Zomato"
                                    required
                                    className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 leading-none">
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
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 leading-none">
                                    <MapPinIcon className="h-3 w-3" /> Physical Headquarters
                                </label>
                                <LocationAutocomplete
                                    value={form.location || ""}
                                    onChange={val => setForm({ ...form, location: val })}
                                    placeholder="e.g. Bangalore, India"
                                />
                            </div>



                            <div className="space-y-4">

                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-4 block">Active Service Plan</label>
                                <div className="grid gap-3">
                                    {ORG_PLAN_OPTIONS.map(plan => (
                                        <button
                                            key={plan.id}
                                            type="button"
                                            onClick={() => setForm(prev => ({ ...prev, plan: plan.id }))}
                                            className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${form.plan === plan.id
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
                                    ))}                            </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block">Active Drive Cap</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.maxActiveDrives}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={e => setForm(prev => ({ ...prev, maxActiveDrives: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                                    />
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                        `0` means unlimited.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block">Team Member Cap</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.maxTeamMembers}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={e => setForm(prev => ({ ...prev, maxTeamMembers: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                                    />
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                        `0` means unlimited.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-orange-600 uppercase tracking-widest block flex items-center gap-2">
                                        <Coins className="h-3 w-3" /> Total Credits
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={creditsInput}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={e => setCreditsInput(e.target.value)}
                                        className="h-10 w-full rounded-xl border border-amber-100 bg-amber-50/30 px-3 text-sm font-bold text-amber-700 focus:ring-2 focus:ring-amber-200 outline-none"
                                    />
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                        {Math.round((parseFloat(creditsInput) || 0) / 0.2)} min total
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-3 pt-2">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block">Behavioral & Proctoring Infrastructure</label>
                                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2">
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
                                        <label key={signal.key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2">
                                            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-600">{signal.label}</span>
                                            <input
                                                type="checkbox"
                                                checked={Boolean((form as any).proctoringSignals?.[signal.key])}
                                                onChange={(e) =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        proctoringSignals: {
                                                            ...(prev as any).proctoringSignals,
                                                            [signal.key]: e.target.checked,
                                                        },
                                                    }))
                                                }
                                                className="h-4 w-4 accent-[#F97316]"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Primary HR Controller */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-blue-500 rounded-full shadow-sm" />
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Primary HR Controller</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 leading-none">
                                <User className="h-3 w-3" /> Full Name
                            </label>
                            <input
                                value={form.adminName}
                                onChange={e => setForm(prev => ({ ...prev, adminName: e.target.value }))}
                                placeholder="Admin Name"
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 leading-none">
                                <Mail className="h-3 w-3" /> Business Email
                            </label>
                            <input
                                type="email"
                                value={form.adminEmail}
                                onChange={e => setForm(prev => ({ ...prev, adminEmail: e.target.value }))}
                                placeholder="admin@company.com"
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                            />
                        </div>
                    </div>
                </div>

                {/* Voice Infrastructure */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-purple-500 rounded-full shadow-sm" />
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Voice Infrastructure (TTS)</h3>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-10">
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">Primary TTS Engine</label>
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

                        {form.ttsProvider === "CARTESIA" && (
                            <div className="grid md:grid-cols-2 gap-8 pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">Voice Selection</label>
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
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">Neural Engine (Model)</label>
                                    <select
                                        value={form.cartesiaModel}
                                        onChange={e => setForm(prev => ({ ...prev, cartesiaModel: e.target.value }))}
                                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-purple-100 outline-none"
                                    >
                                        <option value="cartesia/sonic-3">cartesia/sonic-3 (Recommended)</option>
                                        <option value="cartesia/sonic-2">cartesia/sonic-2</option>
                                        <option value="cartesia/sonic-turbo">cartesia/sonic-turbo</option>
                                    </select>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed mt-1">Sonic 3 is optimized for elite real-time responsiveness.</p>
                                </div>
                            </div>
                        )}

                        {form.ttsProvider === "SARVAM" && (
                            <div className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                                <div className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">Model Version (Bulbul)</label>
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
                                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">Neural Persona</label>
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
                                                {previewLoading ? "Generating..." : activeAudio ? "Playing..." : "Preview"}
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
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Speech Recognition (STT)</h3>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-10">
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">Neural Listening Engine</label>
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

                        {form.sttProvider === "DEEPGRAM" && (
                            <div className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">Transcription Model</label>
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
                                    </select>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed mt-1">
                                        Select specialized neural architecture for the client's specific use case.
                                    </p>
                                </div>
                            </div>
                        )}

                        {form.sttProvider === "SARVAM" && (
                            <div className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">Neural Transcription Model</label>
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
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Inference Infrastructure (Step 5) */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-blue-600 rounded-full shadow-sm" />
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Inference Infrastructure (LLM)</h3>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm space-y-10">
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">LLM Provider</label>
                                <select
                                    value={form.llmProvider}
                                    onChange={e => setForm(prev => ({ ...prev, llmProvider: e.target.value }))}
                                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                                >
                                    <option value="OPENAI">🤖 OpenAI (Global Standard)</option>
                                </select>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">LLM Model</label>
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

                        <div className="pt-6 border-t border-gray-100">
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest block leading-none">LLM Temperature</label>
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

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-end gap-6 border-t border-gray-50">
                    <div className="flex gap-4 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="flex-1 sm:px-10 h-10 rounded-xl border border-gray-200 text-gray-500 font-bold text-xs uppercase tracking-widest hover:bg-gray-50 transition-all font-bold"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-[2] sm:px-12 h-10 rounded-xl bg-gray-950 text-white font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Updating...
                                </>
                            ) : "APPLY CHANGES ->"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

