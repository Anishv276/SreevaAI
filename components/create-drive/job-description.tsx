"use client";
import { useState, useRef } from "react";
import { Upload, Loader2, FileText, X, CheckCircle2, Eye } from "lucide-react";

export function JobDescription({
    formData,
    updateFormData,
    isAnalyzing,
    analysisError,
    startAnalysis,
    abortAnalysis,
}: {
    formData: any;
    updateFormData: (data: any) => void;
    isAnalyzing: boolean;
    analysisError: string | null;
    startAnalysis: ({ file, url }: { file?: File; url?: string }) => void;
    abortAnalysis?: () => void;
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

    const clearFile = () => {
        abortAnalysis?.();
        updateFormData((prev: any) => ({
            ...prev,
            jdFileName: undefined,
            jdPreviewUrl: undefined,
            interviewQuestions: [],
            extractedDetails: null,
        }));
    };

    return (
        <div className="space-y-4">
            {analysisError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12px] font-medium flex items-center gap-2">
                    <X className="h-4 w-4" /> {analysisError}
                </div>
            )}

            {!formData.jdFileName || isAnalyzing ? (
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
                            <div className="flex-1">
                                <p className="text-[13px] font-semibold text-gray-700 truncate max-w-[200px]">
                                    Analyzing {formData.jdFileName || "document"}...
                                </p>
                                <p className="text-[11px] text-gray-400">AI extraction in progress</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {formData.jdPreviewUrl && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); window.open(formData.jdPreviewUrl, "_blank"); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#F97316] hover:bg-orange-50 transition-all text-xs font-semibold"
                                    >
                                        <Eye className="h-3 w-3" /> Preview
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all text-xs font-semibold"
                                >
                                    <X className="h-3 w-3" /> Cancel
                                </button>
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
                                <p className="text-[11px] text-gray-400">PDF, DOCX, or TXT · Max 20MB · AI auto-fills drive details</p>
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
                        <FileText className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{formData.jdFileName}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            <p className="text-[11px] text-green-600 font-medium">Analyzed — drive details auto-filled</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {formData.jdPreviewUrl && (
                            <button
                                type="button"
                                onClick={() => window.open(formData.jdPreviewUrl, "_blank")}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-100 bg-white text-gray-500 hover:text-orange-600 hover:border-orange-200 transition-all text-[11px] font-bold uppercase tracking-wider"
                            >
                                <Eye className="h-3.5 w-3.5" /> Preview JD
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={clearFile}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-100 bg-white text-gray-400 hover:text-red-500 hover:border-red-200 transition-all text-[11px] font-bold uppercase tracking-wider"
                        >
                            <X className="h-3.5 w-3.5" /> Re-upload
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}