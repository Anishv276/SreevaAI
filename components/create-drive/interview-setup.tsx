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

    const interviewEnabled = formData.interviewEnabled ?? true;

    return (
        <div className="space-y-6 animate-in-up duration-500 max-w-3xl mx-auto pb-6">
            {/* Header / Toggle Card */}
            <div className={`group flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl transition-all duration-300 border ${interviewEnabled ? "bg-white border-orange-200 shadow-md" : "bg-gray-50 border-dashed border-gray-200 opacity-80"}`}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg shadow-lg transition-all duration-300 ${interviewEnabled ? "bg-gradient-to-br from-[#F97316] to-orange-600 text-white" : "bg-gray-200 text-gray-400 grayscale"}`}>
                        <Mic className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-gray-900">AI Voice Interaction</h3>
                            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all ${interviewEnabled ? "bg-orange-100 text-orange-700" : "bg-gray-200 text-gray-500"}`}>
                                {interviewEnabled ? "Active" : "Skipped"}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 font-medium mt-0.5">Automated screening via AI Voice Agent</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                    <span className={`text-xs font-bold ${interviewEnabled ? "text-gray-900" : "text-gray-400"}`}>
                        {interviewEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch 
                        checked={interviewEnabled} 
                        onCheckedChange={(v) => setField("interviewEnabled", v)}
                        className="data-[state=checked]:bg-[#F97316]"
                    />
                </div>
            </div>

            {interviewEnabled && (
                <>
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

                    {/* AI questions depth */}
                    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <HelpCircle className="w-4 h-4 text-[#F97316]" />
                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest">AI questions depth</h4>
                            </div>
                            <div className="flex items-center gap-4 w-48">
                                <Slider
                                    value={[formData.interviewFollowUp || 3]}
                                    onValueChange={([v]) => setField("interviewFollowUp", v)}
                                    min={1}
                                    max={5}
                                    step={1}
                                    className="flex-1"
                                />
                                <span className="text-sm font-black text-[#F97316] w-8 text-center">{formData.interviewFollowUp || 3}</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium">Controls the number of AI-generated follow-up questions per topic.</p>
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
                </>
            )}
        </div>
    );
}

