import { Clock, ShieldCheck, Zap, Brain, Rocket, Mic, Languages, ShieldAlert } from "lucide-react";
import { ScreeningConfig } from "./screening-settings";

interface FinalPreviewProps {
    formData: any;
    aiEnabled: boolean;
    weights: ScreeningConfig;
    regFieldCount: number;
}

export function FinalPreview({ formData, aiEnabled, weights, regFieldCount }: FinalPreviewProps) {
    return (
        <div className="space-y-6">
            {/* Orange-tinted ready banner */}
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 text-center">
                <div className="flex justify-center mb-3">
                    <div className="h-11 w-11 rounded-full bg-orange-100 flex items-center justify-center text-[#F97316]">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
                <h2 className="text-lg font-bold text-orange-700">Ready to Publish!</h2>
                <p className="text-sm text-orange-600 max-w-lg mx-auto mt-1">
                    Review the summary below. Once you publish, candidates will be able to apply immediately.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Left column - Job Info */}
                <div className="space-y-5">
                    {/* Job Details */}
                    <div>
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Job Details</h3>
                        <div className="rounded-xl border bg-white p-4 space-y-2.5 text-[13px]">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Role</span>
                                <span className="font-semibold text-gray-800">{formData.role || "N/A"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Department</span>
                                <span className="font-semibold text-gray-800">{formData.department || "N/A"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Employment Type</span>
                                <span className="font-semibold text-gray-800">{formData.employmentType || "Full-time"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div>
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Timeline</h3>
                        <div className="rounded-xl border bg-white p-4 space-y-2.5 text-[13px]">
                            <div className="flex items-center gap-3">
                                <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                <span className="text-gray-500">Last Date to Apply</span>
                                <span className="font-semibold text-gray-800 ml-auto">{formData.deadline || "N/A"}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column - Configuration Phases */}
                <div className="space-y-5">
                    {/* Screening Setup */}
                    <div>
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Screening Setup</h3>
                        <div className="rounded-xl border bg-white p-4 space-y-2.5 text-[13px]">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Brain className="h-3.5 w-3.5" />
                                    <span>AI Resume Screening</span>
                                </div>
                                <span className={`flex items-center gap-1.5 font-semibold ${aiEnabled ? "text-green-600" : "text-gray-400"}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${aiEnabled ? "bg-green-500" : "bg-gray-400"} inline-block`} />
                                    {aiEnabled ? "Enabled" : "Disabled"}
                                </span>
                            </div>

                            {aiEnabled && (
                                <div className="ml-5 py-2 border-l-2 border-green-50 pl-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-[12px]">Match Threshold</span>
                                        <span className="font-black text-green-600 text-sm">{weights.threshold}%</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between pt-1 border-t border-gray-50">
                                <span className="text-gray-500">Registration Fields</span>
                                <span className="font-semibold text-gray-800">{regFieldCount} fields</span>
                            </div>
                        </div>
                    </div>

                    {/* AI Voice Interview */}
                    <div>
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">AI Voice Interview</h3>
                        <div className="rounded-xl border bg-white p-4 space-y-3 text-[13px]">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Mic className="h-3.5 w-3.5" />
                                    <span>Phase Status</span>
                                </div>
                                <span className={`flex items-center gap-1.5 font-bold ${formData.interviewEnabled ? "text-orange-600" : "text-gray-400"}`}>
                                    {formData.interviewEnabled ? "Enabled" : "Disabled"}
                                </span>
                            </div>
                            {formData.interviewEnabled && (
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div className="p-2.5 rounded-lg bg-gray-50/50 border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Language</p>
                                        <p className="font-bold text-gray-700 mt-0.5 flex items-center gap-1.5">
                                            <Languages className="w-3 h-3 text-orange-400" />
                                            {formData.interviewLanguage || "English"}
                                        </p>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-gray-50/50 border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Anti-Cheat</p>
                                        <p className="font-bold text-gray-700 mt-0.5 flex items-center gap-1.5">
                                            <ShieldAlert className="w-3 h-3 text-orange-400" />
                                            {formData.interviewAntiCheat || "Medium"}
                                        </p>
                                    </div>
                                    <div className="col-span-2 p-2.5 rounded-lg bg-gray-50/50 border border-gray-100 flex justify-between items-center">
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Limit & Questions</p>
                                            <p className="font-bold text-gray-700 mt-0.5">
                                                {formData.interviewTime || 10} Mins • {(() => {
                                                    const qs = formData.interviewQuestions;
                                                    if (Array.isArray(qs)) return qs.length;
                                                    if (typeof qs === 'string' && qs.trim()) {
                                                        try { 
                                                            const parsed = JSON.parse(qs);
                                                            return Array.isArray(parsed) ? parsed.length : 1;
                                                        } catch { return 1; }
                                                    }
                                                    return 0;
                                                })()} Custom
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest text-right">AI Depth</p>
                                            <p className="font-bold text-[#F97316] text-[13px]">{formData.interviewFollowUp || 3}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}



