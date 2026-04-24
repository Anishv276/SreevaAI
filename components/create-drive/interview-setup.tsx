"use client";

import { useState, useRef, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Mic, ShieldAlert, Languages, Clock, Plus, Trash2, HelpCircle, BrainCircuit, ChevronDown, Globe, Play, Pause, RefreshCw, AudioLines, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARTESIA_VOICES, SARVAM_VOICES, Voice } from "@/lib/constants/voices";

interface InterviewProps {
    formData: any;
    updateFormData: (fn: (prev: any) => any) => void;
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

export function InterviewSetup({ formData, updateFormData }: InterviewProps) {
    const [newQuestion, setNewQuestion] = useState("");
    const [showLangDropdown, setShowLangDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
    const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
    const [voiceSearch, setVoiceSearch] = useState("");
    const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const voiceDropdownRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);

    const stopCurrentPreview = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
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
        setActiveAudio(null);
        setPlayingVoiceId(null);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
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
        const voices = [...CARTESIA_VOICES, ...SARVAM_VOICES];
        const selected = voices.find(v => v.id === voiceId);
        if (!selected) return "Ishitha";
        
        return selected.gender === "male" ? "Ishaan" : "Ishitha";
    };

    const handleVoiceChange = (voiceId: string) => {
        const provider = formData.ttsProvider || "CARTESIA";
        const newName = getAiNameForVoice(voiceId);
        
        updateFormData((prev: any) => ({
            ...prev,
            [provider === "CARTESIA" ? "cartesiaVoiceId" : "sarvamVoice"]: voiceId,
            aiName: newName
        }));
    };

    const playSample = async (e?: React.MouseEvent, overrideVoiceId?: string, overrideProvider?: string, overrideName?: string) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const provider = overrideProvider || formData.ttsProvider || "CARTESIA";
        const voiceId = overrideVoiceId || (provider === "CARTESIA" ? (formData.cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc") : (formData.sarvamVoice || "shubh"));
        const modelId = provider === "CARTESIA" ? "cartesia/sonic-3" : "bulbul:v3";
        const aiName = overrideName || formData.aiName || "Ishitha";
        
        // Handle stop if already playing the same voice
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

            // Send the selected provider explicitly so the server uses the matching API key.
            const endpoint = "/api/admin/voice/preview";

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, voiceId, modelId, transcript })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.error || "Preview failed");
            }

            const arrayBuffer = await res.arrayBuffer();
            const mimeType = provider === "SARVAM" ? "audio/wav" : "audio/mpeg";

            try {
                const blob = new Blob([arrayBuffer], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);

                audio.onended = () => {
                    stopCurrentPreview();
                    if (url.startsWith("blob:")) {
                        URL.revokeObjectURL(url);
                    }
                };

                audioRef.current = audio;
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
                source.buffer = decoded;
                source.connect(ctx.destination);
                source.onended = () => {
                    stopCurrentPreview();
                };
                bufferSourceRef.current = source;
                setActiveAudio(null);
                setPlayingVoiceId(voiceId);
                source.start(0);
                setLoadingVoiceId(null);
            }
        } catch (err: any) {
            console.error("Playback error:", err);
            alert(err?.message || "Could not play voice sample.");
            setLoadingVoiceId(null);
            setPlayingVoiceId(null);
        } finally {
            setPreviewLoading(false);
            setLoadingVoiceId(null);
        }
    };

    const addQuestion = (e?: React.MouseEvent | React.KeyboardEvent) => {
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
        <div className="space-y-6 animate-in-up duration-500 max-w-3xl mx-auto pb-6">
            {/* Language & Duration Settings */}
            <div className="grid md:grid-cols-2 gap-4">
                        {/* Language */}
                        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                            <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-[#F97316]" />
                                <h4 className="text-sm font-bold text-gray-900">Language</h4>
                            </div>
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
                        </div>

                        {/* Duration */}
                        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-[#F97316]" />
                                <h4 className="text-sm font-bold text-gray-900">Duration</h4>
                            </div>
                            <div className="flex items-center gap-4">
                                <Slider
                                    value={[formData.interviewTime || 10]}
                                    onValueChange={([v]) => setField("interviewTime", v)}
                                    min={5}
                                    max={30}
                                    step={5}
                                    className="flex-1"
                                />
                                <span className="text-sm font-bold text-gray-900 w-16 text-center">{formData.interviewTime || 10} min</span>
                            </div>
                        </div>
                    </div>

                    {/* Interviewer Persona */}
                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-4">
                        <div className="flex items-center gap-2">
                            <AudioLines className="w-4 h-4 text-[#F97316]" />
                            <h4 className="text-base font-bold text-gray-900">Interviewer Persona</h4>
                        </div>
                        
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            {/* Visual Avatar */}
                            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-orange-50/50 border border-orange-100 w-full md:w-48 text-center space-y-3">
                                <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-[#F97316] bg-white flex items-center justify-center relative">
                                     <img 
                                        src={formData.aiName === 'Ishaan' ? '/avatars/ishaan.png' : '/avatars/ishitha.png'} 
                                        alt={formData.aiName || 'Ishitha'} 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            // Fallback to initial if image fails to load
                                            e.currentTarget.style.display = 'none';
                                            e.currentTarget.parentElement?.classList.add('bg-orange-100');
                                        }}
                                     />
                                </div>
                                <div>
                                    <h5 className="font-bold text-gray-900 text-sm tracking-wide">{formData.aiName || 'Ishitha'}</h5>
                                    <p className="text-[10px] uppercase font-bold text-[#F97316] tracking-widest mt-0.5">AI Interviewer</p>
                                </div>
                            </div>
                            
                            <div className="flex-1 space-y-5 w-full">
                                {!formData.ttsProvider ? (
                                    <div className="space-y-3 animate-pulse">
                                        <div className="h-4 w-40 bg-gray-100 rounded-full" />
                                        <div className="h-11 w-full bg-gray-100 rounded-xl" />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest block leading-none">Voice</label>
                                        </div>
                                        
                                        <div className="relative" ref={voiceDropdownRef}>
                                            {/* Selection Trigger */}
                                            <div className="flex items-center gap-2">
                                                {/* Mini Preview for current selection - Now on the left */}
                                                <button
                                                    type="button"
                                                    disabled={previewLoading || (!formData.cartesiaVoiceId && !formData.sarvamVoice)}
                                                    onClick={(e) => playSample(e)}
                                                    className="h-11 w-11 rounded-xl bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center transition-all disabled:opacity-50 flex-shrink-0"
                                                    title="Preview current selection"
                                                >
                                                    {previewLoading ? (
                                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                                    ) : (playingVoiceId === (formData.ttsProvider === "SARVAM" ? (formData.sarvamVoice || "shubh") : (formData.cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc")) && !loadingVoiceId) ? (
                                                        <Pause className="h-4 w-4 fill-white" />
                                                    ) : (
                                                        <Play className="h-4 w-4 fill-white ml-0.5" />
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                                                    className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold font-sans flex items-center justify-between hover:border-orange-300 transition-all outline-none"
                                                >
                                                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                                                        <AudioLines className="w-4 h-4 text-orange-500 flex-shrink-0" />
                                                        <div className="flex flex-col items-start min-w-0">
                                                            <span className="truncate w-full text-left">
                                                                {(() => {
                                                                    const currentId = formData.ttsProvider === "SARVAM" ? formData.sarvamVoice : formData.cartesiaVoiceId;
                                                                    const voices = formData.ttsProvider === "SARVAM" ? SARVAM_VOICES : CARTESIA_VOICES;
                                                                    const found = voices.find(v => v.id === currentId);
                                                                    return found ? found.name : "Select a voice";
                                                                })()}
                                                            </span>
                                                            <div className="flex gap-1 overflow-hidden">
                                                                {(() => {
                                                                    const currentId = formData.ttsProvider === "SARVAM" ? formData.sarvamVoice : formData.cartesiaVoiceId;
                                                                    const voices = formData.ttsProvider === "SARVAM" ? SARVAM_VOICES : CARTESIA_VOICES;
                                                                    const found = voices.find(v => v.id === currentId);
                                                                    return found?.tags?.slice(0, 2).map(tag => (
                                                                        <span key={tag} className="text-[7px] text-gray-400 bg-gray-50 px-1 rounded border border-gray-100 uppercase tracking-tighter">{tag}</span>
                                                                    ));
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`} />
                                                </button>
                                            </div>

                                            {showVoiceDropdown && (
                                                <div className="absolute bottom-full mb-2 left-0 w-full bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-200">
                                                    {/* Search Header */}
                                                    <div className="p-3 border-b border-gray-50 bg-gray-50/50">
                                                        <div className="relative">
                                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                                                <Search className="w-3.5 h-3.5" />
                                                            </div>
                                                            <input 
                                                                autoFocus
                                                                type="text"
                                                                placeholder="Search 11+ Indian voices..."
                                                                value={voiceSearch}
                                                                onChange={(e) => setVoiceSearch(e.target.value)}
                                                                className="w-full h-9 pl-9 pr-4 rounded-lg border border-gray-200 bg-white text-xs font-bold font-sans focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Scrollable List */}
                                                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                                                        {(formData.ttsProvider === "SARVAM" ? SARVAM_VOICES : CARTESIA_VOICES)
                                                            .filter(v => 
                                                                v.name.toLowerCase().includes(voiceSearch.toLowerCase()) || 
                                                                v.description.toLowerCase().includes(voiceSearch.toLowerCase()) ||
                                                                v.tags?.some(t => t.toLowerCase().includes(voiceSearch.toLowerCase()))
                                                            )
                                                            .map(v => (
                                                                <button
                                                                    key={v.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        handleVoiceChange(v.id);
                                                                        setShowVoiceDropdown(false);
                                                                        setVoiceSearch("");
                                                                    }}
                                                                    className={`w-full p-3 text-left hover:bg-orange-50/50 transition-all border-b border-gray-50 last:border-0 group flex items-center justify-between gap-4 ${
                                                                        (formData.ttsProvider === "SARVAM" ? formData.sarvamVoice : formData.cartesiaVoiceId) === v.id 
                                                                        ? 'bg-orange-50/30' : ''
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                        {/* Inline Preview Button - Now on the left */}
                                                                        <div 
                                                                            onClick={(e) => playSample(e, v.id, v.provider, getAiNameForVoice(v.id))}
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
                                                                            <div className="flex items-center gap-2">
                                                                                <span className={`text-[13px] font-bold tracking-tight font-sans ${
                                                                                    (formData.ttsProvider === "SARVAM" ? formData.sarvamVoice : formData.cartesiaVoiceId) === v.id 
                                                                                    ? 'text-orange-600' : 'text-gray-900 group-hover:text-orange-600'
                                                                                }`}>
                                                                                    {v.name}
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-[11px] text-gray-500 font-medium leading-tight truncate font-sans">{v.description}</p>
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                                        <div className="flex flex-wrap justify-end gap-1 max-w-[100px]">
                                                                            {v.tags?.slice(0, 3).map(tag => (
                                                                                <span key={tag} className="px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide font-sans whitespace-nowrap bg-gray-50 text-gray-500 border border-gray-100">
                                                                                    {tag}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Interview Questions */}
                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-4">
                        <div className="flex items-center gap-2">
                            <BrainCircuit className="w-4 h-4 text-[#F97316]" />
                            <h4 className="text-base font-bold text-gray-900">Interview Questions</h4>
                        </div>
                        
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                                onBlur={() => addQuestion()}
                                placeholder="Add a question..."
                                className="flex-1 h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] transition-all"
                            />
                            <Button 
                                onClick={addQuestion}
                                className="h-10 px-4 rounded-lg bg-[#F97316] hover:bg-orange-600 text-white font-bold text-sm"
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                        {safeArray(formData.interviewQuestions).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {safeArray(formData.interviewQuestions).map((q: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                                        <span className="text-sm font-medium text-gray-700">{q}</span>
                                        <button onClick={() => removeQuestion(i)} className="text-gray-400 hover:text-red-500">
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

