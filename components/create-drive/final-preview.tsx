"use client";
import { useEffect, useMemo, useState } from "react";
import { Brain, Mic, Languages } from "lucide-react";
import { ScreeningConfig } from "./screening-settings";
import { ALL_VOICES, type Voice } from "@/lib/constants/voices";
interface FinalPreviewProps {
    formData: any;
    weights?: ScreeningConfig;
}
function countQuestions(value: any) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.length : 1;
        } catch {
            return 1;
        }
    }
    return 0;
}
export function FinalPreview({ formData, weights }: FinalPreviewProps) {
    const [voices, setVoices] = useState<Voice[]>(ALL_VOICES);
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
                // keep static fallback
            }
        };
        void loadVoices();
    }, []);
    const selectedVoice = useMemo(
        () => voices.find((v) => v.id === formData.voiceId),
        [voices, formData.voiceId]
    );
    const interviewQuestionsCount = countQuestions(formData.interviewQuestions);
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-6 text-center shadow-sm">
                <div className="mb-4 flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-[#F97316]">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
                <h2 className="text-xl font-black tracking-tight text-orange-700">Ready to Create Job</h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-orange-600">
                    Review the summary below. Once you create the job, you can upload resumes and start screening.
                </p>
            </div>
            <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                <div className="space-y-5">
                    <div>
                        <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
                            Job Details
                        </h3>
                        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                            <div className="grid gap-3">
                                {[
                                    { label: "Role", value: formData.role || "N/A" },
                                    { label: "Department", value: formData.department || "N/A" },
                                    { label: "Employment Type", value: formData.employmentType || "Full-time" },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        className="flex items-center justify-between gap-4 rounded-xl bg-gray-50/70 px-4 py-3"
                                    >
                                        <span className="text-sm font-medium text-gray-500">{item.label}</span>
                                        <span className="text-right text-sm font-bold text-gray-900">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div>
                        <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
                            Screening Setup
                        </h3>
                        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                            {weights ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-4 rounded-xl bg-emerald-50/70 px-4 py-3">
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <Brain className="h-4 w-4 text-emerald-500" />
                                            <span className="text-sm font-medium">AI Resume Screening</span>
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-emerald-700">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            Configured
                                        </span>
                                    </div>
                                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                                                Match Threshold
                                            </span>
                                            <span className="text-lg font-black tracking-tight text-emerald-700">
                                                {weights.threshold}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm leading-6 text-gray-600">
                                    Screening criteria will be configured on the resume screening page after the job is created.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="space-y-5">
                    <div>
                        <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
                            AI Voice Interview
                        </h3>
                        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                            <div className="grid gap-3">
                                <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                                        Voice
                                    </p>
                                    <p className="mt-1 flex items-center gap-2 text-sm font-bold text-gray-800">
                                        <Mic className="h-3.5 w-3.5 text-orange-400" />
                                        <span>{selectedVoice ? selectedVoice.name : "Select a voice"}</span>
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                                        Language
                                    </p>
                                    <p className="mt-1 flex items-center gap-2 text-sm font-bold text-gray-800">
                                        <Languages className="h-3.5 w-3.5 text-orange-400" />
                                        {formData.interviewLanguage || "English"}
                                    </p>
                                    <p className="mt-2 text-[11px] font-medium text-gray-500">
                                        Interview duration is fixed at 20 minutes.
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                                        Question Bank
                                    </p>
                                    <p className="mt-1 text-sm font-bold text-gray-800">
                                        {interviewQuestionsCount} custom question
                                        {interviewQuestionsCount === 1 ? "" : "s"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 px-5 py-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500">
                            Summary
                        </p>
                        <p className="mt-2 text-sm leading-6 text-orange-700">
                            {weights
                                ? "Resume screening is configured and ready to run once the job is created."
                                : "Resume screening will be configured after publishing this job."}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
