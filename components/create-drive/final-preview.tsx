import { Clock, ShieldCheck, Zap, Brain, Rocket } from "lucide-react";
import { ScreeningWeight } from "./screening-assessment";

interface FinalPreviewProps {
    formData: any;
    aiEnabled: boolean;
    weights: ScreeningWeight;
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
                {/* Left column */}
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
                                <span className="font-semibold text-gray-800">{formData.employmentType || "N/A"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Work Mode</span>
                                <span className="font-semibold text-gray-800">{formData.workMode || "N/A"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Positions</span>
                                <span className="font-semibold text-gray-800">{formData.positions || "1"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Assessment Overview */}
                    <div>
                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Assessment Overview</h3>
                        <div className="rounded-xl border bg-white p-4 space-y-2.5 text-[13px]">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500">Strategy</span>
                                <div className="flex items-center gap-1.5 font-semibold text-gray-800 uppercase text-[11px]">
                                    {formData.assessmentMode === 'TEST' && <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />}
                                    {formData.assessmentMode === 'CODING' && <Zap className="w-3.5 h-3.5 text-yellow-500" />}
                                    {formData.assessmentMode === 'BOTH' && <Rocket className="w-3.5 h-3.5 text-purple-500" />}
                                    {formData.assessmentMode === 'BOTH' ? 'Hybrid Mode' : formData.assessmentMode || 'Test Only'}
                                </div>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Difficulty</span>
                                <span className="font-semibold text-gray-800">{formData.assessmentDifficulty || "Medium"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Question Count</span>
                                <span className="font-semibold text-gray-800">{formData.assessmentCount || "5"} questions</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Total Duration</span>
                                <span className="font-semibold text-gray-800">{formData.assessmentTime || "15"} minutes</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column */}
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
                                <div className="ml-5 space-y-2 py-1 border-l border-gray-100 pl-3">
                                    <div className="flex justify-between text-[12px]">
                                        <span className="text-gray-400">Skills</span>
                                        <span className="font-medium text-gray-600">{weights.skills}%</span>
                                    </div>
                                    <div className="flex justify-between text-[12px]">
                                        <span className="text-gray-400">Experience</span>
                                        <span className="font-medium text-gray-600">{weights.experience}%</span>
                                    </div>
                                    <div className="flex justify-between text-[12px]">
                                        <span className="text-gray-400">Education</span>
                                        <span className="font-medium text-gray-600">{weights.education}%</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between pt-1 border-t border-gray-50">
                                <span className="text-gray-500">Registration Fields</span>
                                <span className="font-semibold text-gray-800">{regFieldCount} fields</span>
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
            </div>
        </div>
    );
}

