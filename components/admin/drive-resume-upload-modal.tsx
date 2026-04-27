"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload, X, XCircle } from "lucide-react";

type UploadPhase = "idle" | "uploading" | "processing" | "done" | "failed";

interface DriveResumeUploadModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    driveId: string;
    driveName: string;
    onUploaded?: () => void;
}

export function DriveResumeUploadModal({
    open,
    onOpenChange,
    driveId,
    driveName,
    onUploaded,
}: DriveResumeUploadModalProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [phase, setPhase] = useState<UploadPhase>("idle");
    const [progress, setProgress] = useState({ processed: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [displayPct, setDisplayPct] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pctAnimRef = useRef<number | null>(null);
    const indeterminateRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const displayPctRef = useRef(0);

    const clearPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const clearPctAnimation = () => {
        if (pctAnimRef.current !== null) {
            cancelAnimationFrame(pctAnimRef.current);
            pctAnimRef.current = null;
        }
    };

    const clearIndeterminate = () => {
        if (indeterminateRef.current) {
            clearInterval(indeterminateRef.current);
            indeterminateRef.current = null;
        }
    };

    const syncDisplayPct = (value: number) => {
        const next = Math.max(0, Math.min(100, value));
        displayPctRef.current = next;
        setDisplayPct(next);
    };

    const reset = () => {
        clearPolling();
        clearPctAnimation();
        clearIndeterminate();
        displayPctRef.current = 0;
        setDisplayPct(0);
        setFiles([]);
        setPhase("idle");
        setProgress({ processed: 0, total: 0 });
        setError(null);
    };

    const handleClose = () => {
        if (phase === "processing" && !window.confirm("Resume screening is still running. Close anyway?")) {
            return;
        }
        reset();
        onOpenChange(false);
    };

    useEffect(() => {
        if (!open) {
            reset();
        }
        return () => clearPolling();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const startUpload = async () => {
        if (!files.length) {
            toast.error("Please add at least one PDF resume");
            return;
        }

        setPhase("uploading");
        setError(null);

        try {
            const formData = new FormData();
            files.forEach((file) => formData.append("files", file));

            const res = await fetch(`/api/drives/${driveId}/resume-screening`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                throw new Error(payload?.error || "Upload failed");
            }

            const { batchId, totalCount } = await res.json();
            setProgress({ processed: 0, total: totalCount || files.length });
            setPhase("processing");
            syncDisplayPct(6);

            clearPolling();
            pollRef.current = setInterval(async () => {
                try {
                    const pollRes = await fetch(`/api/drives/${driveId}/resume-screening?batchId=${batchId}`);
                    if (!pollRes.ok) return;

                    const data = await pollRes.json();
                    setProgress({
                        processed: Number(data.processedCount || 0),
                        total: Number(data.totalCount || 0),
                    });

                    if (data.status === "COMPLETED") {
                        clearPolling();
                        setPhase("done");
                        toast.success(`${data.processedCount || 0} resumes screened successfully`);
                        setTimeout(() => {
                            reset();
                            onOpenChange(false);
                            onUploaded?.();
                        }, 1000);
                    } else if (data.status === "FAILED") {
                        clearPolling();
                        setPhase("failed");
                        setError("Processing failed. Please try again.");
                        toast.error("Resume screening failed");
                    }
                } catch {
                    // Ignore transient poll issues and keep trying.
                }
            }, 2500);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Upload failed";
            setPhase("failed");
            setError(message);
            toast.error(message);
        }
    };

    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
    const donutR = 54;
    const donutC = 2 * Math.PI * donutR;
    const donutDash = donutC * (displayPct / 100);

    useEffect(() => {
        clearPctAnimation();
        clearIndeterminate();

        if (phase !== "processing") {
            syncDisplayPct(phase === "done" ? 100 : 0);
            return;
        }

        const target = Math.max(0, Math.min(100, pct));
        const start = displayPctRef.current;
        const diff = target - start;

        if (target === 0) {
            indeterminateRef.current = setInterval(() => {
                setDisplayPct((current) => {
                    const next = current < 92 ? current + 1 : current;
                    displayPctRef.current = next;
                    return next;
                });
            }, 700);
            return () => clearIndeterminate();
        }

        const duration = 850;
        let raf = 0;
        const startedAt = performance.now();

        const tick = (now: number) => {
            const elapsed = now - startedAt;
            const progressRatio = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - progressRatio, 3);
            const next = Math.round(start + diff * eased);
            displayPctRef.current = next;
            setDisplayPct(next);

            if (progressRatio < 1) {
                raf = requestAnimationFrame(tick);
            } else {
                displayPctRef.current = target;
                setDisplayPct(target);
                pctAnimRef.current = null;
            }
        };

        raf = requestAnimationFrame(tick);
        pctAnimRef.current = raf;
        return () => cancelAnimationFrame(raf);
    }, [pct, phase]);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-xl rounded-[2rem] border border-white/40 bg-white/95 backdrop-blur-2xl shadow-[0_30px_100px_rgba(0,0,0,0.18)]">
                <DialogHeader className="space-y-2">
                    <DialogTitle className="text-2xl font-black tracking-tight text-gray-900">
                        {phase === "processing"
                            ? "Screening in Progress"
                            : phase === "done"
                                ? "Screening Complete"
                                : "Upload Resumes"}
                    </DialogTitle>
                    <p className="text-sm font-medium text-gray-500">{driveName}</p>
                </DialogHeader>

                {(phase === "idle" || phase === "uploading") && (
                    <div className="space-y-5 py-3">
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                const dropped = Array.from(e.dataTransfer.files).filter((file) => file.name.toLowerCase().endsWith(".pdf"));
                                setFiles((prev) => [...prev, ...dropped]);
                            }}
                            onClick={() => files.length === 0 && inputRef.current?.click()}
                            className={cn(
                                "rounded-3xl border-2 border-dashed transition-all duration-200 cursor-pointer",
                                isDragging ? "border-orange-400 bg-orange-50/70" : "border-gray-200 hover:border-orange-300",
                                files.length > 0 ? "p-5 bg-orange-50/20" : "p-12"
                            )}
                        >
                            <input
                                ref={inputRef}
                                type="file"
                                multiple
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                    setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
                                    e.target.value = "";
                                }}
                            />

                            {files.length === 0 ? (
                                <div className="text-center">
                                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-500">
                                        <Upload className="h-7 w-7" />
                                    </div>
                                    <p className="font-bold text-gray-800">Drop PDF resumes here</p>
                                    <p className="mt-1 text-sm text-gray-400">or click to browse files</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">{files.length}</p>
                                            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">PDF files selected</p>
                                        </div>
                                        <FileText className="h-10 w-10 text-orange-500" />
                                    </div>
                                    <div className="max-h-32 overflow-auto space-y-2 rounded-2xl border border-orange-100 bg-white/80 p-3">
                                        {files.map((file) => (
                                            <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
                                                <span className="truncate text-sm font-bold text-gray-700">{file.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFiles((prev) => prev.filter((item) => item !== file));
                                                    }}
                                                    className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span className="font-medium">{error}</span>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClose}
                                className="h-11 rounded-2xl border-gray-200 font-bold text-gray-600"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={startUpload}
                                disabled={!files.length || phase === "uploading"}
                                className="h-11 rounded-2xl bg-orange-600 px-5 font-bold text-white hover:bg-orange-700"
                            >
                                {phase === "uploading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {phase === "uploading" ? "Uploading..." : "Start Screening"}
                            </Button>
                        </div>
                    </div>
                )}

                {phase === "processing" && (
                    <div className="space-y-5 py-3">
                        <div className="rounded-3xl border border-orange-100 bg-orange-50/50 p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-widest text-orange-600">Processing</span>
                                <span className="text-sm font-black tabular-nums text-gray-900">{progress.processed} / {progress.total}</span>
                            </div>
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative h-40 w-40">
                                    <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
                                        <circle cx="70" cy="70" r={donutR} fill="none" stroke="#fff" strokeWidth="14" opacity="0.9" />
                                        <circle
                                            cx="70"
                                            cy="70"
                                            r={donutR}
                                            fill="none"
                                            stroke="url(#resumeProgressGradient)"
                                            strokeWidth="14"
                                            strokeDasharray={`${donutDash} ${donutC}`}
                                            strokeLinecap="round"
                                        />
                                        <defs>
                                            <linearGradient id="resumeProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#fb923c" />
                                                <stop offset="100%" stopColor="#ea580c" />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <p className="text-3xl font-black tabular-nums text-gray-900">{displayPct}%</p>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">complete</p>
                                    </div>
                                </div>
                                <div className="w-full max-w-sm space-y-2">
                                    <div className="h-2 overflow-hidden rounded-full bg-white/80">
                                        <div
                                            className={cn(
                                                "h-full rounded-full bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 transition-[width] duration-500",
                                                phase === "processing" && progress.processed === 0 && "animate-pulse"
                                            )}
                                            style={{ width: `${Math.max(displayPct, phase === "processing" && progress.processed === 0 ? 8 : 0)}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                                        <span>{progress.processed} of {progress.total || files.length}</span>
                                        <span>{displayPct}%</span>
                                    </div>
                                </div>
                                {phase === "processing" && progress.processed === 0 && (
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-500">
                                        Extracting and scoring the first resume
                                    </p>
                                )}
                                <p className="text-center text-sm font-medium text-gray-500">
                                    We are extracting, scoring, and saving these resumes into Candidates.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {phase === "done" && (
                    <div className="space-y-5 py-3">
                        <div className="flex items-center gap-3 rounded-3xl border border-emerald-100 bg-emerald-50/60 px-4 py-4">
                            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                            <div>
                                <p className="font-bold text-emerald-900">Screening complete</p>
                                <p className="text-sm text-emerald-700">Your candidates are now available in the Candidates page.</p>
                            </div>
                        </div>
                    </div>
                )}

                {phase === "failed" && (
                    <div className="space-y-5 py-3">
                        <div className="flex items-center gap-3 rounded-3xl border border-red-100 bg-red-50/60 px-4 py-4">
                            <XCircle className="h-6 w-6 text-red-600" />
                            <div>
                                <p className="font-bold text-red-900">Screening failed</p>
                                <p className="text-sm text-red-700">{error || "Please try again."}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClose}
                                className="h-11 rounded-2xl border-gray-200 font-bold text-gray-600"
                            >
                                Close
                            </Button>
                            <Button
                                type="button"
                                onClick={() => {
                                    setPhase("idle");
                                    setError(null);
                                }}
                                className="h-11 rounded-2xl bg-orange-600 px-5 font-bold text-white hover:bg-orange-700"
                            >
                                Try Again
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
