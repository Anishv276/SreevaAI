"use client";
import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Plus, Trash2, BrainCircuit, ChevronDown, Globe, Play, Pause, RefreshCw, AudioLines, Search } from "lucide-react";
import { toast } from "@/components/ui/toast-custom";
import { ALL_VOICES, DEFAULT_VOICE_ID, type Voice } from "@/lib/constants/voices";
interface InterviewProps {
    formData: any;
    updateFormData: (fn: (prev: any) => any) => void;
    allowLanguageSelection?: boolean;
}
const LANGUAGES = [
    "English", "Hindi"
];
function safeArray(val: any): string[] {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
        try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
}
export function InterviewSetup({ formData, updateFormData, allowLanguageSelection = true }: InterviewProps) {
    const [newQuestion, setNewQuestion] = useState("");
    const [showLangDropdown, setShowLangDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
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
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
            audioRef.current = null;
        }
        if (currentPreviewUrlRef.current) {
            URL.revokeObjectURL(currentPreviewUrlRef.current);
            currentPreviewUrlRef.current = null;
        }
        if (mediaSourceRef.current) {
            try {
                mediaSourceRef.current.disconnect();
            } catch {
                // ignore
            }
            mediaSourceRef.current = null;
        }
        if (gainNodeRef.current) {
            try {
                gainNodeRef.current.disconnect();
            } catch {
                // ignore
            }
            gainNodeRef.current = null;
        }
        if (bufferSourceRef.current) {
            try {
                bufferSourceRef.current.stop();
            } catch {
                // ignore
            }
            try {
                bufferSourceRef.current.disconnect();
            } catch {
                // ignore
            }
            bufferSourceRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
        }
        setActiveAudio(null);
        setPlayingVoiceId(null);
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
                // Keep static fallback list
            }
        };
        void loadVoices();
        const handleClickOutside = (event: globalThis.MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowLangDropdown(false);
            }
            if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(event.target as Node)) {
                setShowVoiceDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            stopCurrentPreview();
            if (audioContextRef.current && audioContextRef.current.state !== "closed") {
                audioContextRef.current.close().catch(() => { });
                audioContextRef.current = null;
            }
        };
    }, []);
    const getAiNameForVoice = (voiceId: string) => {
        const selected = voices.find(v => v.id === voiceId);
        if (!selected) return "Ishitha";
        return selected.gender === "male" ? "Ishaan" : "Ishitha";
    };
    const currentVoiceId = formData.voiceId || DEFAULT_VOICE_ID;
    const getAvailableVoices = () => {
        const whitelist: string[] = Array.isArray(formData.allowedVoices) ? formData.allowedVoices : [];
        if (whitelist.length === 0) return voices;
        return voices.filter(v => whitelist.includes(v.id));
    };
    const handleVoiceChange = (voiceId: string) => {
        const newName = getAiNameForVoice(voiceId);
        updateFormData((prev: any) => ({ ...prev, voiceId, aiName: newName }));
    };
    const playSample = async (e?: ReactMouseEvent, overrideVoiceId?: string, overrideName?: string) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const voiceId = overrideVoiceId || currentVoiceId;
        const aiName = overrideName || formData.aiName || "Ishitha";
        if (activeAudio && overrideVoiceId && overrideVoiceId === playingVoiceId) {
            stopCurrentPreview();
            return;
        }
        if (activeAudio && !overrideVoiceId) {
            stopCurrentPreview();
            return;
        }
        const transcript = `Hi, I'm ${aiName}, are you ready for the interview?`;
        setPreviewLoading(true);
        if (overrideVoiceId) setLoadingVoiceId(overrideVoiceId);
        try {
            stopCurrentPreview();
            const res = await fetch("/api/admin/voice/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voiceId, transcript })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.error || "Preview failed");
            }
            const arrayBuffer = await res.arrayBuffer();
            const voice = voices.find(v => v.id === voiceId);
            const mimeType = voice?.provider === "SARVAM" ? "audio/wav" : "audio/mpeg";
            try {
                const blob = new Blob([arrayBuffer], { type: mimeType });
                const url = URL.createObjectURL(blob);
                currentPreviewUrlRef.current = url;
                const audio = new Audio(url);
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContextClass) {
                    throw new Error("AudioContext not supported");
                }
                const ctx = audioContextRef.current || new AudioContextClass();
                audioContextRef.current = ctx;
                const source = ctx.createMediaElementSource(audio);
                const gainNode = ctx.createGain();
                gainNode.gain.value = 2.5;
                mediaSourceRef.current = source;
                gainNodeRef.current = gainNode;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                audio.onended = () => {
                    stopCurrentPreview();
                };
                audioRef.current = audio;
                await ctx.resume().catch(() => { });
                await audio.play();
                setActiveAudio(audio);
                setPlayingVoiceId(voiceId);
                setLoadingVoiceId(null);
            } catch (audioErr) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContextClass) {
                    throw audioErr;
                }
                const ctx = audioContextRef.current || new AudioContextClass();
                audioContextRef.current = ctx;
                if (ctx.state === "suspended") {
                    await ctx.resume();
                }
                const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
                const source = ctx.createBufferSource();
                const gainNode = ctx.createGain();
                gainNode.gain.value = 2.5;
                source.buffer = decoded;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                source.onended = () => {
                    stopCurrentPreview();
                };
                bufferSourceRef.current = source;
                gainNodeRef.current = gainNode;
                setActiveAudio(null);
                setPlayingVoiceId(voiceId);
                source.start(0);
                setLoadingVoiceId(null);
            }
        } catch (err: any) {
            console.error("Playback error:", err);
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
        updateFormData((prev: any) => ({
            ...prev,
            interviewQuestions: [...safeArray(prev.interviewQuestions), newQuestion.trim()]
        }));
        setNewQuestion("");
    };
    const removeQuestion = (index: number) => {
        updateFormData((prev: any) => ({
            ...prev,
            interviewQuestions: safeArray(prev.interviewQuestions).filter((_: any, i: number) => i !== index)
        }));
    };
    const setField = (key: string, value: any) => {
        updateFormData((prev: any) => ({ ...prev, [key]: value }));
    };
    return (
        <div className="space-y-6">
            {/* Language */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#F97316]" />
                    <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Language</p>
                </div>
                <div className="max-w-xs">
                    {allowLanguageSelection ? (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setShowLangDropdown(!showLangDropdown)}
                                className="w-full h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium flex items-center justify-between hover:border-orange-300 transition-all"
                            >
                                <span>{formData.interviewLanguage || "English"}</span>
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            </button>
                            {showLangDropdown && (
                                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
                                    {LANGUAGES.map(lang => (
                                        <button
                                            key={lang}
                                            onClick={() => { setField("interviewLanguage", lang); setShowLangDropdown(false); }}
                                            className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-orange-50 hover:text-[#F97316] transition-all"
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-10 px-4 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700 flex items-center justify-between">
                            <span>English</span>
                            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Starter plan</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="border-t border-gray-100" />
            {/* Interviewer Persona */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-[#F97316]" />
                    <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Interviewer Persona</p>
                </div>
                <div className="flex flex-col md:flex-row items-center gap-6">
                    {/* Avatar */}
                    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-orange-50/50 border border-orange-100 w-full md:w-44 text-center space-y-2 flex-shrink-0">
                        <div className="h-14 w-14 rounded-full overflow-hidden border-2 border-[#F97316] bg-white flex items-center justify-center">
                            <img
                                src={formData.aiName === 'Ishaan' ? '/avatars/ishaan.png' : '/avatars/ishitha.png'}
                                alt={formData.aiName || 'Ishitha'}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.classList.add('bg-orange-100');
                                }}
                            />
                        </div>
                        <div>
                            <h5 className="font-bold text-gray-900 text-sm">{formData.aiName || 'Ishitha'}</h5>
                            <p className="text-[10px] uppercase font-bold text-[#F97316] tracking-widest mt-0.5">AI Interviewer</p>
                        </div>
                    </div>
                    {/* Voice selector */}
                    <div className="flex-1 w-full space-y-2">
                        <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block">Voice</label>
                        <div className="relative" ref={voiceDropdownRef}>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={previewLoading || !currentVoiceId}
                                    onClick={(e) => playSample(e)}
                                    className="h-10 w-10 rounded-lg bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center transition-all disabled:opacity-50 flex-shrink-0"
                                    title="Preview current selection"
                                >
                                    {previewLoading ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (playingVoiceId === currentVoiceId && !loadingVoiceId) ? (
                                        <Pause className="h-4 w-4 fill-white" />
                                    ) : (
                                        <Play className="h-4 w-4 fill-white ml-0.5" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                                    className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold flex items-center justify-between hover:border-orange-300 transition-all outline-none"
                                >
                                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                                        <AudioLines className="w-4 h-4 text-orange-500 flex-shrink-0" />
                                        <div className="flex flex-col items-start min-w-0">
                                            <span className="truncate w-full text-left text-[14px]">
                                                {voices.find(v => v.id === currentVoiceId)?.name || "Select a voice"}
                                            </span>
                                            <div className="flex gap-1 overflow-hidden">
                                                {voices.find(v => v.id === currentVoiceId)?.tags?.slice(0, 2).map((tag: string) => (
                                                    <span key={tag} className="text-[7px] text-gray-400 bg-gray-50 px-1 rounded border border-gray-100 uppercase tracking-tighter">{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`} />
                                </button>
                            </div>
                            {showVoiceDropdown && (
                                <div className="absolute bottom-full mb-2 left-0 w-full bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="p-3 border-b border-gray-50 bg-gray-50/50">
                                        <div className="relative">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                                <Search className="w-3.5 h-3.5" />
                                            </div>
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="Search voices..."
                                                value={voiceSearch}
                                                onChange={(e) => setVoiceSearch(e.target.value)}
                                                className="w-full h-9 pl-9 pr-4 rounded-lg border border-gray-200 bg-white text-xs font-bold focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                                        {getAvailableVoices()
                                            .filter((v) =>
                                                v.name.toLowerCase().includes(voiceSearch.toLowerCase()) ||
                                                v.description.toLowerCase().includes(voiceSearch.toLowerCase()) ||
                                                v.tags?.some(t => t.toLowerCase().includes(voiceSearch.toLowerCase()))
                                            )
                                            .map((v) => (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => {
                                                        handleVoiceChange(v.id);
                                                        setShowVoiceDropdown(false);
                                                        setVoiceSearch("");
                                                    }}
                                                    className={`w-full p-3 text-left hover:bg-orange-50/50 transition-all border-b border-gray-50 last:border-0 group flex items-center justify-between gap-4 ${currentVoiceId === v.id ? 'bg-orange-50/30' : ''}`}
                                                >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div
                                                            onClick={(e) => playSample(e, v.id, getAiNameForVoice(v.id))}
                                                            className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                                                                loadingVoiceId === v.id || (playingVoiceId === v.id && !loadingVoiceId)
                                                                    ? 'bg-orange-600 text-white shadow-sm'
                                                                    : 'bg-gray-100 text-gray-500 hover:bg-orange-100 hover:text-orange-600'
                                                            }`}
                                                        >
                                                            {loadingVoiceId === v.id ? (
                                                                <RefreshCw className="h-3 w-3 animate-spin" />
                                                            ) : (playingVoiceId === v.id && !loadingVoiceId) ? (
                                                                <Pause className="h-3 w-3 fill-current" />
                                                            ) : (
                                                                <Play className="h-3 w-3 fill-current ml-0.5" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0 space-y-0.5">
                                                            <span className={`text-[13px] font-bold tracking-tight block ${currentVoiceId === v.id ? 'text-orange-600' : 'text-gray-900 group-hover:text-orange-600'}`}>
                                                                {v.name}
                                                            </span>
                                                            <p className="text-[11px] text-gray-500 font-medium leading-tight truncate">{v.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap justify-end gap-1 max-w-[100px] flex-shrink-0">
                                                        {v.tags?.slice(0, 3).map((tag: string) => (
                                                            <span key={tag} className="px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide whitespace-nowrap bg-gray-50 text-gray-500 border border-gray-100">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="border-t border-gray-100" />
            {/* Interview Questions */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-[#F97316]" />
                    <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Interview Questions</p>
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                        onBlur={() => addQuestion()}
                        placeholder="Add a question and press Enter..."
                        className="flex-1 h-10 px-4 rounded-lg border border-gray-200 bg-white text-[14px] font-medium shadow-sm outline-none placeholder:text-gray-400 placeholder:font-normal hover:border-orange-300 hover:shadow-md focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 transition-all"
                    />
                    <button
                        type="button"
                        onClick={addQuestion}
                        disabled={!newQuestion.trim()}
                        className="h-10 w-10 rounded-lg bg-gray-900 text-white flex items-center justify-center hover:bg-black transition-colors disabled:bg-gray-100 disabled:text-gray-300 shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                {safeArray(formData.interviewQuestions).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {safeArray(formData.interviewQuestions).map((q: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                                <span className="text-[13px] font-medium text-gray-700">{q}</span>
                                <button type="button" onClick={() => removeQuestion(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
