"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, FileText, X, CheckCircle2, PenLine } from "lucide-react";

const textareaClass =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] hover:border-orange-300 transition-all duration-150 resize-none";

const inputClass =
    "w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] hover:border-orange-300 transition-all duration-150";

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
            {children}
            {required && <span className="text-[#F97316]">*</span>}
        </label>
    );
}

export function JobDescription({ 
    formData, 
    updateFormData,
    isAnalyzing,
    analysisError,
    startAnalysis
}: {
    formData: any;
    updateFormData: (data: any) => void;
    isAnalyzing: boolean;
    analysisError: string | null;
    startAnalysis: ({ file, url }: { file?: File, url?: string }) => void;
}) {
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) startAnalysis({ file });
    };


    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) startAnalysis({ file });
    };

    const clearFile = () =>
        updateFormData((prev: any) => ({ ...prev, jdFileName: undefined, description: "", skills: "" }));

    return (
        <div className="space-y-6">
            {analysisError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12px] font-medium flex items-center gap-2">
                    <X className="h-4 w-4" /> {analysisError}
                </div>
            )}
            {/* ── TOP: Upload JD ─────────────── */}
            <section>
                <div className="flex items-center gap-3 mb-3">
                    <span className="h-5 w-1 rounded-full bg-[#F97316]" />
                    <p className="text-[13px] font-bold text-gray-900 uppercase tracking-widest">Upload JD</p>
                </div>

                {!formData.jdFileName ? (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                        className={`flex items-center gap-4 rounded-xl border-2 border-dashed px-5 py-6 cursor-pointer transition-all duration-200 ${
                            dragOver ? "border-[#F97316] bg-orange-50" : "border-gray-200 bg-gray-50/70 hover:border-orange-300 hover:bg-orange-50/40"
                        }`}
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin flex-shrink-0" />
                                <div>
                                    <p className="text-[13px] font-semibold text-gray-700">Analyzing document…</p>
                                    <p className="text-[11px] text-gray-400">Extracting JD details with AI in background</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-100">
                                    <Upload className="h-5 w-5 text-[#F97316]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-gray-700">
                                        {dragOver ? "Drop to upload!" : "Drag & drop your JD here"}
                                    </p>
                                    <p className="text-[11px] text-gray-400">PDF, DOCX, or TXT · Max 10MB · Auto-extracts skills & responsibilities</p>
                                </div>
                                <span className="flex-shrink-0 rounded-lg border border-[#F97316] px-3 py-1.5 text-[12px] font-semibold text-[#F97316] hover:bg-orange-50 transition-colors">
                                    Browse
                                </span>
                            </>
                        )}
                        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleFile} disabled={isAnalyzing} />
                    </div>
                ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-green-100">
                            {isAnalyzing ? <Loader2 className="h-4.5 w-4.5 text-green-600 animate-spin" /> : <FileText className="h-4.5 w-4.5 text-green-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{formData.jdFileName}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                                {isAnalyzing ? (
                                    <div className="flex h-1 gap-0.5 mt-1.5">
                                        <div className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-1 h-1 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                ) : (
                                    <>
                                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                                        <p className="text-[11px] text-green-600 font-medium">Analyzed — fields auto-filled below</p>
                                    </>
                                )}
                            </div>
                        </div>
                        <button type="button" onClick={clearFile} className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </section>

            {/* Divider */}
            <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Write / Edit</span>
                <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* ── BOTTOM: Write & Edit JD ────────────────────── */}
            <section>
                <div className="flex items-center gap-3 mb-4">
                    <span className="h-5 w-1 rounded-full bg-[#F97316]" />
                    <p className="text-[13px] font-bold text-gray-900 uppercase tracking-widest">Job Description</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    {/* Left column */}
                    <div className="space-y-4">
                        {/* Description */}
                        <div>
                            <FieldLabel>Job Description {isAnalyzing && <Loader2 className="h-3 w-3 text-orange-400 animate-spin inline ml-1" />}</FieldLabel>
                            <div className="relative">
                                <PenLine className="absolute left-3 top-3 h-3 w-3 text-gray-300 pointer-events-none" />
                                <textarea
                                    rows={5}
                                    placeholder="Describe the role, expectations, and ideal candidate…"
                                    value={formData.description || ""}
                                    onChange={(e) => updateFormData((prev: any) => ({ ...prev, description: e.target.value }))}
                                    className={`${textareaClass} pl-8 ${isAnalyzing && !formData.description ? "bg-orange-50/20" : ""}`}
                                />
                            </div>
                        </div>

                        {/* Skills */}
                        <div>
                            <FieldLabel required>Required Skills {isAnalyzing && <Loader2 className="h-3 w-3 text-orange-400 animate-spin inline ml-1" />}</FieldLabel>
                            <input
                                type="text"
                                placeholder="e.g. React, Node.js, TypeScript"
                                value={formData.skills || ""}
                                onChange={(e) => updateFormData((prev: any) => ({ ...prev, skills: e.target.value }))}
                                className={`${inputClass} ${isAnalyzing && !formData.skills ? "bg-orange-50/20" : ""}`}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Comma-separated</p>
                        </div>
                    </div>

                    {/* Right column */}
                    <div className="space-y-4">
                        {/* Responsibilities */}
                        <div>
                            <FieldLabel>Key Responsibilities {isAnalyzing && <Loader2 className="h-3 w-3 text-orange-400 animate-spin inline ml-1" />}</FieldLabel>
                            <textarea
                                rows={4}
                                placeholder="• Define clear objectives&#10;• Collaborate with cross-functional teams&#10;• ..."
                                value={formData.responsibilities || ""}
                                onChange={(e) => updateFormData((prev: any) => ({ ...prev, responsibilities: e.target.value }))}
                                className={`${textareaClass} ${isAnalyzing && !formData.responsibilities ? "bg-orange-50/20" : ""}`}
                            />
                        </div>

                        {/* Requirements */}
                        <div>
                            <FieldLabel>Requirements {isAnalyzing && <Loader2 className="h-3 w-3 text-orange-400 animate-spin inline ml-1" />}</FieldLabel>
                            <textarea
                                rows={4}
                                placeholder="• Bachelor's degree in CS or related field&#10;• 3+ years of experience in...&#10;• ..."
                                value={formData.requirements || ""}
                                onChange={(e) => updateFormData((prev: any) => ({ ...prev, requirements: e.target.value }))}
                                className={`${textareaClass} ${isAnalyzing && !formData.requirements ? "bg-orange-50/20" : ""}`}
                            />
                        </div>

                        {/* Experience + Salary */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <FieldLabel>Experience (Yrs)</FieldLabel>
                                <input
                                    type="text"
                                    placeholder="e.g. 2–5 years"
                                    value={formData.experience || ""}
                                    onChange={(e) => updateFormData((prev: any) => ({ ...prev, experience: e.target.value }))}
                                    className={`${inputClass} ${isAnalyzing && !formData.experience ? "bg-orange-50/20" : ""}`}
                                />
                            </div>
                            <div>
                                <FieldLabel>Salary Range</FieldLabel>
                                <input
                                    type="text"
                                    placeholder="e.g. ₹12–18 LPA"
                                    value={formData.salary || ""}
                                    onChange={(e) => updateFormData((prev: any) => ({ ...prev, salary: e.target.value }))}
                                    className={`${inputClass} ${isAnalyzing && !formData.salary ? "bg-orange-50/20" : ""}`}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
