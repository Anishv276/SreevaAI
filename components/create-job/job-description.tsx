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
            aiGeneratedInterviewQuestions: [],
            jdExtractedDetails: null,
        }));
    };

    // Analyzed state
    if (formData.jdFileName && !isAnalyzing) {
        return (
            <div className="flex items-center gap-3 rounded-xl px-4 py-3.5"
                style={{ border: "1px solid #A7F3D0", background: "#F0FDF4" }}>
                <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{formData.jdFileName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                        <p className="text-xs text-emerald-600">Analyzed — fields auto-filled below</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {formData.jdPreviewUrl && (
                        <button
                            type="button"
                            onClick={() => window.open(formData.jdPreviewUrl, "_blank")}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white text-xs font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-all"
                            style={{ border: "1px solid #E9E7FF" }}
                        >
                            <Eye className="h-3 w-3" /> Preview
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={clearFile}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white text-xs font-medium text-gray-500 hover:text-red-500 hover:border-red-200 transition-all"
                        style={{ border: "1px solid #E9E7FF" }}
                    >
                        <X className="h-3 w-3" /> Replace
                    </button>
                </div>
            </div>
        );
    }

    // Analyzing state
    if (isAnalyzing) {
        return (
            <div className="flex items-center gap-4 rounded-xl px-5 py-4"
                style={{ border: "1px solid #E9E7FF", background: "#FAFAFC" }}>
                <Loader2 className="h-7 w-7 text-[#7C3AED] animate-spin flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">
                        Analyzing {formData.jdFileName || "document"}…
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">AI extraction in progress</p>
                </div>
                <div className="flex items-center gap-1.5">
                    {formData.jdPreviewUrl && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); window.open(formData.jdPreviewUrl, "_blank"); }}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white text-xs font-medium text-gray-600 hover:text-violet-600 transition-all"
                            style={{ border: "1px solid #E9E7FF" }}
                        >
                            <Eye className="h-3 w-3" /> Preview
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); clearFile(); }}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white text-xs font-medium text-gray-500 hover:text-red-500 hover:border-red-200 transition-all"
                        style={{ border: "1px solid #E9E7FF" }}
                    >
                        <X className="h-3 w-3" /> Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {analysisError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium text-red-600"
                    style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                    <X className="h-3.5 w-3.5 flex-shrink-0" /> {analysisError}
                </div>
            )}
            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 rounded-xl py-10 cursor-pointer transition-all duration-200"
                style={{
                    border: dragOver ? "2px dashed #7C3AED" : "2px dashed #E9E7FF",
                    background: dragOver ? "rgba(139,92,246,0.04)" : "#FAFAFC",
                }}
            >
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.07))", border: "1px solid rgba(139,92,246,0.15)" }}>
                    <Upload className="h-5 w-5 text-[#7C3AED]" />
                </div>
                <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">
                        {dragOver ? "Drop to upload" : "Drag & drop your JD here"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, DOCX, or TXT · Max 20 MB</p>
                </div>
                <span className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium text-[#7C3AED] bg-white transition-all hover:bg-violet-50"
                    style={{ border: "1px solid rgba(139,92,246,0.3)" }}>
                    Browse files
                </span>
            </div>
            <p className="text-xs text-gray-400 text-center">AI will auto-fill job name, role, and interview questions from your JD.</p>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleFile} />
        </div>
    );
}
