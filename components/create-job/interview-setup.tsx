"use client";
import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Plus, Trash2, BrainCircuit, ChevronDown, Globe, Play, Pause, RefreshCw, AudioLines, Search, FlaskConical, MessageCircle } from "lucide-react";
import { toast } from "@/components/ui/toast-custom";
import { ALL_VOICES, type Voice } from "@/lib/constants/voices";

interface InterviewProps {
    formData: any;
    updateFormData: (fn: (prev: any) => any) => void;
}

function safeArray(val: any): string[] {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
        try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
}

export function InterviewSetup({ formData, updateFormData }: InterviewProps) {
    const [newQuestion, setNewQuestion] = useState("");
    const [previewLoading, setPreviewLoading] = useState(false);
    const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
    const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
    const [voiceSearch, setVoiceSearch] = useState("");
    const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [voices, setVoices] = useState<Voice[]>(ALL_VOICES);
    const voiceDropdownRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const currentPreviewUrlRef = useRef<string | null>(null);

    const stopCurrentPreview = () => {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
        if (currentPreviewUrlRef.current) { URL.revokeObjectURL(currentPreviewUrlRef.current); currentPreviewUrlRef.current = null; }
        try { mediaSourceRef.current?.disconnect(); } catch { } mediaSourceRef.current = null;
        try { gainNodeRef.current?.disconnect(); } catch { } gainNodeRef.current = null;
        try { bufferSourceRef.current?.stop(); bufferSourceRef.current?.disconnect(); } catch { } bufferSourceRef.current = null;
        if (audioContextRef.current && audioContextRef.current.state !== "closed") { audioContextRef.current.close().catch(() => { }); audioContextRef.current = null; }
        setActiveAudio(null);
        setPlayingVoiceId(null);
    };

    useEffect(() => {
        const loadVoices = async () => {
            try {
                const res = await fetch("/api/voices", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data?.voices) && data.voices.length > 0) setVoices(data.voices);
            } catch { }
        };
        void loadVoices();
        const handleClickOutside = (event: globalThis.MouseEvent) => {
            if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(event.target as Node)) setShowVoiceDropdown(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            stopCurrentPreview();
            if (audioContextRef.current && audioContextRef.current.state !== "closed") { audioContextRef.current.close().catch(() => { }); audioContextRef.current = null; }
        };
    }, []);

    const getAiNameForVoice = (voiceId: string) => {
        const selected = voices.find(v => v.id === voiceId);
        if (!selected) return "Ishitha";
        return selected.gender === "male" ? "Ishaan" : "Ishitha";
    };

    // No baked-in default: the voice must be chosen from the org's allowed list
    // (Super Admin → AI Models). Empty renders "Select a voice" and disables preview.
    const currentVoiceId = formData.aiInterviewerVoiceId || "";

    const getAvailableVoices = () => {
        const whitelist: string[] = Array.isArray(formData.allowedVoiceIds) ? formData.allowedVoiceIds : [];
        return whitelist.length === 0 ? [] : voices.filter(v => whitelist.includes(v.id));
    };

    const handleVoiceChange = (voiceId: string) => {
        updateFormData((prev: any) => ({ ...prev, aiInterviewerVoiceId: voiceId, aiInterviewerName: "Ishitha" }));
    };

    const playSample = async (e?: ReactMouseEvent, overrideVoiceId?: string) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const voiceId = overrideVoiceId || currentVoiceId;
        const aiName = "Ishitha";
        if (activeAudio && overrideVoiceId && overrideVoiceId === playingVoiceId) { stopCurrentPreview(); return; }
        if (activeAudio && !overrideVoiceId) { stopCurrentPreview(); return; }
        const transcript = `Hi, I'm ${aiName}, are you ready for the interview?`;
        setPreviewLoading(true);
        if (overrideVoiceId) setLoadingVoiceId(overrideVoiceId);
        try {
            stopCurrentPreview();
            const res = await fetch("/api/admin/voice/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId, transcript }) });
            if (!res.ok) { const errData = await res.json().catch(() => null); throw new Error(errData?.error || "Preview failed"); }
            const arrayBuffer = await res.arrayBuffer();
            const voice = voices.find(v => v.id === voiceId);
            const mimeType = voice?.provider === "SARVAM" ? "audio/wav" : "audio/mpeg";
            try {
                const blob = new Blob([arrayBuffer], { type: mimeType });
                const url = URL.createObjectURL(blob);
                currentPreviewUrlRef.current = url;
                const audio = new Audio(url);
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContextClass) throw new Error("AudioContext not supported");
                const ctx = audioContextRef.current || new AudioContextClass();
                audioContextRef.current = ctx;
                const source = ctx.createMediaElementSource(audio);
                const gainNode = ctx.createGain();
                gainNode.gain.value = 2.5;
                mediaSourceRef.current = source;
                gainNodeRef.current = gainNode;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                audio.onended = () => stopCurrentPreview();
                audioRef.current = audio;
                await ctx.resume().catch(() => { });
                await audio.play();
                setActiveAudio(audio);
                setPlayingVoiceId(voiceId);
                setLoadingVoiceId(null);
            } catch {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContextClass) throw new Error("AudioContext not supported");
                const ctx = audioContextRef.current || new AudioContextClass();
                audioContextRef.current = ctx;
                if (ctx.state === "suspended") await ctx.resume();
                const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
                const source = ctx.createBufferSource();
                const gainNode = ctx.createGain();
                gainNode.gain.value = 2.5;
                source.buffer = decoded;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                source.onended = () => stopCurrentPreview();
                bufferSourceRef.current = source;
                gainNodeRef.current = gainNode;
                setActiveAudio(null);
                setPlayingVoiceId(voiceId);
                source.start(0);
                setLoadingVoiceId(null);
            }
        } catch (err: any) {
            toast.error(err?.message || "Could not play voice sample.");
            setLoadingVoiceId(null);
            setPlayingVoiceId(null);
        } finally {
            setPreviewLoading(false);
            setLoadingVoiceId(null);
        }
    };

    const addQuestion = (e?: ReactMouseEvent | ReactKeyboardEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (!newQuestion.trim()) return;
        updateFormData((prev: any) => ({ ...prev, aiGeneratedInterviewQuestions: [...safeArray(prev.aiGeneratedInterviewQuestions), newQuestion.trim()] }));
        setNewQuestion("");
    };

    const removeQuestion = (index: number) => {
        updateFormData((prev: any) => ({ ...prev, aiGeneratedInterviewQuestions: safeArray(prev.aiGeneratedInterviewQuestions).filter((_: any, i: number) => i !== index) }));
    };

    const currentVoice = voices.find(v => v.id === currentVoiceId);

    return (
        <div className="space-y-6">
            <div className="h-px" style={{ background: "#F0EEF8" }} />

            {/* Interview Mode (read-only, set from JD analysis) */}
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Interview Type
                </label>
                <span
                    className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-medium"
                    style={(formData.interviewType || "tech") === "tech"
                        ? { background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE" }
                        : { background: "#FDF4FF", color: "#A21CAF", border: "1px solid #F0ABFC" }}
                >
                    {(formData.interviewType || "tech") === "tech"
                        ? <><FlaskConical className="h-3 w-3" /> Tech Interview</>
                        : <><MessageCircle className="h-3 w-3" /> Conversational Interview</>}
                </span>
            </div>

            <div className="h-px" style={{ background: "#F0EEF8" }} />

            {/* Interviewer Persona */}
            <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <AudioLines className="h-3.5 w-3.5 text-[#7C3AED]" /> Interviewer Voice
                </label>
                {/* Voice selector */}
                <div className="relative flex items-center gap-2" ref={voiceDropdownRef}>
                    <button
                        type="button"
                        onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                        className="flex-1 h-10 px-3 rounded-xl bg-gray-50 text-sm font-medium flex items-center justify-between transition-all hover:bg-white"
                        style={{ border: "1px solid #E9E7FF" }}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <AudioLines className="h-4 w-4 text-violet-400 flex-shrink-0" />
                            <span className="text-gray-700 truncate">{currentVoice?.name || "Select a voice"}</span>
                            {currentVoice?.tags?.slice(0, 2).map((tag: string) => (
                                <span key={tag} className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0 hidden sm:inline">{tag}</span>
                            ))}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showVoiceDropdown ? "rotate-180" : ""}`} />
                    </button>

                    <button
                        type="button"
                        disabled={previewLoading || !currentVoiceId}
                        onClick={(e) => playSample(e)}
                        className="h-10 w-10 flex-shrink-0 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 2px 8px rgba(124,58,237,0.25)" }}
                        title="Preview voice"
                    >
                        {previewLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : (playingVoiceId === currentVoiceId && !loadingVoiceId) ? <Pause className="h-3.5 w-3.5 fill-white" />
                                : <Play className="h-3.5 w-3.5 fill-white ml-0.5" />}
                    </button>

                    {showVoiceDropdown && (
                        <div className="absolute bottom-full mb-2 left-0 w-full bg-white rounded-xl shadow-xl z-50 flex flex-col max-h-72 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                            style={{ border: "1px solid #E9E7FF", boxShadow: "0 16px 48px rgba(124,58,237,0.12)" }}>
                            <div className="p-2.5" style={{ borderBottom: "1px solid #F0EEF8" }}>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Search voices…"
                                        value={voiceSearch}
                                        onChange={(e) => setVoiceSearch(e.target.value)}
                                        className="w-full h-8 pl-9 pr-3 rounded-lg text-xs font-medium bg-gray-50 outline-none focus:bg-white transition-colors"
                                        style={{ border: "1px solid #E9E7FF" }}
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-1">
                                {getAvailableVoices().length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-6 px-4">No voices configured. Set allowed voices in Super Admin → AI Models.</p>
                                ) : null}
                                {getAvailableVoices()
                                    .filter(v => v.name.toLowerCase().includes(voiceSearch.toLowerCase()) || v.description.toLowerCase().includes(voiceSearch.toLowerCase()) || v.tags?.some(t => t.toLowerCase().includes(voiceSearch.toLowerCase())))
                                    .map(v => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => { handleVoiceChange(v.id); setShowVoiceDropdown(false); setVoiceSearch(""); }}
                                            className={`w-full p-3 text-left flex items-center gap-3 transition-colors group ${currentVoiceId === v.id ? "bg-violet-50/60" : "hover:bg-gray-50"}`}
                                            style={{ borderBottom: "1px solid #F0EEF8" }}
                                        >
                                            <div
                                                onClick={(e) => playSample(e, v.id)}
                                                className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${loadingVoiceId === v.id || (playingVoiceId === v.id && !loadingVoiceId)
                                                    ? "text-white"
                                                    : "bg-gray-100 text-gray-500 hover:bg-violet-100 hover:text-violet-600"
                                                    }`}
                                                style={loadingVoiceId === v.id || (playingVoiceId === v.id && !loadingVoiceId)
                                                    ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }
                                                    : {}}
                                            >
                                                {loadingVoiceId === v.id ? <RefreshCw className="h-3 w-3 animate-spin" />
                                                    : (playingVoiceId === v.id && !loadingVoiceId) ? <Pause className="h-3 w-3 fill-current" />
                                                        : <Play className="h-3 w-3 fill-current ml-0.5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium truncate ${currentVoiceId === v.id ? "text-violet-600" : "text-gray-800 group-hover:text-violet-600"}`}>
                                                    {v.name}
                                                </p>
                                                <p className="text-xs text-gray-400 truncate">{v.description}</p>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0">
                                                {v.tags?.slice(0, 2).map((tag: string) => (
                                                    <span key={tag} className="text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{tag}</span>
                                                ))}
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Interview Questions -- conversational interviews only. Tech jobs
                manage their question bank exclusively via the Create Job
                wizard's Review Questions page (Page 2). */}
            {(formData.interviewType || "tech") === "conversational" && (
                <>
                    <div className="h-px" style={{ background: "#F0EEF8" }} />
                    <div className="space-y-3">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <BrainCircuit className="h-3.5 w-3.5 text-[#7C3AED]" /> Interview Questions
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                                onBlur={() => addQuestion()}
                                placeholder="Add a question and press Enter…"
                                className="flex-1 h-10 px-3 rounded-xl bg-gray-50 text-sm text-gray-800 outline-none placeholder:text-gray-400 transition-all focus:bg-white focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]"
                                style={{ border: "1px solid #E9E7FF" }}
                                onFocus={e => { e.target.style.borderColor = "#7C3AED"; }}
                                onBlurCapture={e => { e.target.style.borderColor = "#E9E7FF"; addQuestion(); }}
                            />
                            <button
                                type="button"
                                onClick={addQuestion}
                                disabled={!newQuestion.trim()}
                                className="h-10 w-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40"
                                style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: newQuestion.trim() ? "0 2px 8px rgba(124,58,237,0.25)" : "none" }}
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        {safeArray(formData.aiGeneratedInterviewQuestions).length > 0 && (
                            <div className="space-y-2">
                                {safeArray(formData.aiGeneratedInterviewQuestions).map((q: string, i: number) => (
                                    <div key={i} className="group flex items-start gap-3 px-3.5 py-2.5 rounded-xl bg-white transition-all hover:shadow-sm"
                                        style={{ border: "1px solid #E9E7FF" }}>
                                        <span className="mt-0.5 text-xs font-semibold text-[#7C3AED] bg-violet-50 h-5 w-5 rounded-lg flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                        <span className="flex-1 text-sm text-gray-700 leading-snug">{q}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeQuestion(i)}
                                            className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {safeArray(formData.aiGeneratedInterviewQuestions).length === 0 && (
                            <p className="text-xs text-gray-400">No questions added yet. AI may suggest some based on the JD.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
