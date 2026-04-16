import { Upload, FileText, Loader2, X, CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";

interface ResumeUploadProps {
    formData: any;
    isAnalyzing: boolean;
    analysisError: string | null;
    startAnalysis: (file: File) => void;
    clearFile: () => void;
}

export function ResumeUpload({ formData, isAnalyzing, analysisError, startAnalysis, clearFile }: ResumeUploadProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                 // Trigger the error state handled by the parent
                 startAnalysis(file); // This will still call it, but we should handle it better
                 return;
            }
            startAnalysis(file);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                 return;
            }
            startAnalysis(file);
        }
    };

    return (
        <div className="space-y-4">
            {analysisError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12px] font-medium flex items-center gap-2 animate-in-slide">
                    <X className="h-4 w-4" /> {analysisError}
                </div>
            )}

            {!formData.resumeUploaded ? (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                        dragOver ? "border-blue-500 bg-blue-50/50" : "border-gray-200 bg-gray-50/50 hover:bg-white hover:border-blue-400"
                    }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={handleFile}
                        disabled={isAnalyzing}
                    />
                    <div className="flex flex-col items-center gap-2">
                        <div className={`p-4 rounded-2xl bg-white shadow-sm border border-gray-100 ${isAnalyzing ? 'animate-pulse' : ''}`}>
                            {isAnalyzing ? (
                                <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                            ) : (
                                <Upload className="h-6 w-6 text-blue-600" />
                            )}
                        </div>
                        <div>
                            <p className="font-bold text-gray-900">
                                {isAnalyzing ? "Analyzing..." : "Upload Resume"}
                            </p>
                            <p className="text-[11px] text-gray-400 font-medium mt-1 uppercase tracking-widest">
                                PDF, DOCX (Max 5MB)
                            </p>
                        </div>
                        {!isAnalyzing && (
                            <div className="mt-2 text-[12px] font-semibold text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100">
                                Browse Files
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-4 rounded-2xl border border-green-200 bg-green-50/50 px-5 py-4 animate-in-fade">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-green-100/80 shadow-sm border border-green-200">
                        {isAnalyzing ? (
                            <Loader2 className="h-6 w-6 text-green-600 animate-spin" />
                        ) : (
                            <FileText className="h-6 w-6 text-green-600" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-[14px] font-bold text-gray-800 truncate">Resume Uploaded</p>
                            {isAnalyzing ? (
                                <Loader2 className="h-3 w-3 text-orange-600 animate-spin" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                        </div>
                        <div className="text-[12px] text-gray-500 font-medium mt-0.5">
                            {isAnalyzing 
                                ? <div className="flex h-1 gap-0.5 mt-1">
                                    <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                  </div>
                                : "Aha! AI has extracted your details below."}
                        </div>
                    </div>
                    <button 
                        type="button" 
                        onClick={clearFile} 
                        className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-white hover:border-red-100 border border-transparent transition-all shadow-sm"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
}
