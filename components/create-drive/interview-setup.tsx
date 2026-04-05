"use client";

import { useState, useRef, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Mic, ShieldAlert, Languages, Clock, Plus, Trash2, HelpCircle, BrainCircuit, ChevronDown, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InterviewProps {
    formData: any;
    updateFormData: (fn: (prev: any) => any) => void;
}

const LANGUAGES = [
    "English", "Hindi", "Spanish", "French", "German", 
    "Mandarin", "Japanese", "Korean", "Arabic", "Portuguese", "Russian"
];

// Safely parse interviewQuestions whether it's a JSON string or already an array
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

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowLangDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const addQuestion = (e?: React.MouseEvent | React.KeyboardEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
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

    const interviewEnabled = formData.interviewEnabled ?? true;

    return (
        <div className="space-y-12 animate-in-up duration-500 max-w-3xl mx-auto pb-10">
            {/* Header / Toggle Card */}
            <div className={`group flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 rounded-[2.5rem] transition-all duration-500 border-2 ${interviewEnabled ? "bg-white border-orange-200 shadow-[0_20px_50px_-20px_rgba(249,115,22,0.15)] scale-[1.01]" : "bg-gray-50/50 border-dashed border-gray-200 opacity-80 hover:border-gray-300"}`}>
                <div className="flex items-center gap-6">
                    <div className={`p-5 rounded-[1.5rem] shadow-2xl transition-all duration-700 ${interviewEnabled ? "bg-gradient-to-br from-[#F97316] to-orange-600 text-white rotate-3 scale-110 shadow-orange-200" : "bg-gray-200 text-gray-400 grayscale"}`}>
                        <Mic className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-black text-gray-900 tracking-tight">AI Voice Interaction</h3>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${interviewEnabled ? "bg-orange-100 text-orange-700 border border-orange-200 shadow-sm" : "bg-gray-200 text-gray-500"}`}>
                                {interviewEnabled ? "Active Phase" : "Skipped"}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 font-bold mt-1">Automated screening via high-fidelity AI Voice Agent.</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-2xl border border-gray-100">
                    <span className={`text-[11px] font-black uppercase tracking-widest px-3 transition-colors duration-300 ${interviewEnabled ? "text-gray-900" : "text-gray-400"}`}>
                        {interviewEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch 
                        checked={interviewEnabled} 
                        onCheckedChange={(v) => setField("interviewEnabled", v)}
                        className="data-[state=checked]:bg-[#F97316] h-7 w-12"
                    />
                </div>
            </div>

            {interviewEnabled ? (
                <div className="space-y-14 animate-in-slide-up duration-700">
                    {/* Primary Config Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
                        
                        {/* Language Dropdown */}
                        <div className="space-y-4" ref={dropdownRef}>
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5" /> Interview Language
                            </label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowLangDropdown(!showLangDropdown)}
                                    className={`w-full h-14 px-6 flex items-center justify-between rounded-2xl font-bold transition-all border-2 ${
                                        showLangDropdown 
                                        ? 'bg-white border-[#F97316] shadow-xl ring-4 ring-orange-50' 
                                        : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-white hover:border-gray-200'
                                    }`}
                                >
                                    <span className={showLangDropdown ? 'text-[#F97316]' : 'text-gray-700'}>
                                        {formData.interviewLanguage || "English"}
                                    </span>
                                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showLangDropdown ? 'rotate-180 text-[#F97316]' : 'text-gray-300'}`} />
                                </button>

                                {showLangDropdown && (
                                    <div className="absolute top-full left-0 w-full mt-3 bg-white border border-gray-100 rounded-[2rem] shadow-[0_25px_60px_rgba(0,0,0,0.18)] p-3 z-50 grid grid-cols-2 gap-2 animate-in-up duration-300 border-t-4 border-t-[#F97316] max-h-72 overflow-y-auto custom-scrollbar">
                                        {LANGUAGES.map((lang) => (
                                            <button
                                                key={lang}
                                                type="button"
                                                onClick={() => {
                                                    setField("interviewLanguage", lang);
                                                    setShowLangDropdown(false);
                                                }}
                                                className={`py-3.5 px-4 rounded-xl font-bold text-[12px] text-left transition-all ${
                                                    (formData.interviewLanguage || "English") === lang 
                                                    ? 'bg-orange-50 text-[#F97316] border border-orange-100' 
                                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                                }`}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Clock / Time Limit Slider */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5" /> Call Time Limit
                                </label>
                                <span className="text-[15px] font-black text-[#F97316] tabular-nums">
                                    {formData.interviewTime || 10} Mins
                                </span>
                            </div>
                            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 pt-7 pb-4">
                                <div className="space-y-4">
                                    <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-tighter px-1">
                                        <span>5m</span>
                                        <span className="text-gray-200">|</span>
                                        <span>15m</span>
                                        <span className="text-gray-200">|</span>
                                        <span>30m</span>
                                    </div>
                                    <Slider
                                        value={[formData.interviewTime || 10]}
                                        onValueChange={([v]) => setField("interviewTime", v)}
                                        max={30}
                                        min={5}
                                        step={5}
                                        className="cursor-pointer [&_[data-radix-slider-thumb]]:bg-[#F97316] [&_[data-radix-slider-range]]:bg-[#F97316]"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Anti-Cheat Sensitivity */}
                        <div className="space-y-4">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <ShieldAlert className="w-3.5 h-3.5" /> Proctoring Level
                            </label>
                            <div className="flex gap-2 p-1.5 bg-gray-50 rounded-2xl border border-gray-100 h-14">
                                {["Low", "Medium", "High"].map((lvl) => (
                                    <button
                                        key={lvl}
                                        type="button"
                                        onClick={() => setField("interviewAntiCheat", lvl)}
                                        className={`flex-1 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
                                            (formData.interviewAntiCheat || "Medium") === lvl
                                            ? "bg-gray-900 text-white shadow-xl shadow-gray-200 scale-[1.02]"
                                            : "text-gray-400 hover:text-gray-600 font-bold"
                                        }`}
                                    >
                                        {lvl}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Follow-up Depth */}
                        <div className="space-y-4">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <BrainCircuit className="w-3.5 h-3.5" /> AI Depth
                            </label>
                            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 pt-7 pb-4">
                                <div className="space-y-4">
                                    <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                                        <span className={formData.interviewFollowUp === 1 ? 'text-[#F97316]' : ''}>Low</span>
                                        <span className="text-gray-200">|</span>
                                        <span className={formData.interviewFollowUp === 3 ? 'text-[#F97316]' : ''}>Medium</span>
                                        <span className="text-gray-200">|</span>
                                        <span className={formData.interviewFollowUp === 5 ? 'text-[#F97316]' : ''}>High</span>
                                    </div>
                                    <Slider
                                        value={[formData.interviewFollowUp || 3]}
                                        onValueChange={([v]) => setField("interviewFollowUp", v)}
                                        max={5}
                                        min={1}
                                        step={1}
                                        className="cursor-pointer [&_[data-radix-slider-thumb]]:bg-[#F97316] [&_[data-radix-slider-range]]:bg-[#F97316]"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Custom Questions */}
                    <div className="space-y-8 pt-6 border-t border-gray-100">
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <HelpCircle className="w-3.5 h-3.5" /> Custom Questions
                            </label>
                            <p className="text-xs text-gray-400 font-medium">Add specific questions you want the AI to ask during the interview.</p>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="flex gap-4 p-2 bg-gray-50 rounded-[2rem] border border-gray-100 shadow-inner">
                                <input 
                                    value={newQuestion}
                                    onChange={(e) => setNewQuestion(e.target.value)}
                                    placeholder="e.g. Discuss your experience with React server components..."
                                    onKeyDown={(e) => e.key === 'Enter' && addQuestion()}
                                    className="flex-1 bg-transparent border-none h-14 px-5 text-sm font-bold text-gray-800 placeholder:text-gray-300 outline-none"
                                />
                                <button 
                                    type="button"
                                    onClick={(e) => addQuestion(e)}
                                    className="h-14 w-14 bg-gray-900 text-white rounded-[1.5rem] flex items-center justify-center hover:bg-black transition-all shadow-xl active:scale-95 group/btn"
                                >
                                    <Plus className="h-6 w-6 group-hover/btn:rotate-90 transition-transform duration-300" />
                                </button>
                            </div>

                            <div className="grid gap-3">
                                {safeArray(formData.interviewQuestions).map((q: string, idx: number) => (
                                    <div 
                                        key={idx} 
                                        className="flex items-center justify-between p-6 bg-white border border-gray-100 rounded-3xl hover:border-orange-200 transition-all shadow-sm group/item"
                                    >
                                        <div className="flex items-center gap-5">
                                            <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center text-[12px] font-black text-[#F97316] shadow-inner">
                                                {idx + 1}
                                            </div>
                                            <p className="text-[13px] font-bold text-gray-700 leading-relaxed">{q}</p>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => removeQuestion(idx)}
                                            className="text-gray-200 hover:text-red-500 hover:bg-red-50 transition-all p-3 rounded-xl group-hover/item:text-gray-300"
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="py-24 flex flex-col items-center justify-center text-center space-y-6 bg-gray-50/30 rounded-[3rem] border-2 border-dashed border-gray-100 animate-in-fade">
                    <div className="p-6 bg-white rounded-[2rem] shadow-sm text-gray-200">
                        <Mic className="h-12 w-12" />
                    </div>
                    <div className="max-w-xs space-y-2">
                        <p className="text-xl font-black text-gray-400">Voice Phase Disabled</p>
                        <p className="text-xs text-gray-400 font-bold leading-relaxed">Toggle the switch above to enable real-time AI voice screening for this drive.</p>
                    </div>
                    <Button 
                        variant="outline"
                        type="button"
                        onClick={() => setField("interviewEnabled", true)}
                        className="rounded-xl border-gray-200 font-bold text-gray-400 hover:text-[#F97316] hover:border-orange-100"
                    >
                        Activate Interview
                    </Button>
                </div>
            )}
        </div>
    );
}


