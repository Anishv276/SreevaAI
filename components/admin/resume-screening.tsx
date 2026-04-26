"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
    Upload, X, FileText, Zap, CheckCircle2, XCircle,
    AlertCircle, TrendingUp, TrendingDown, Minus,
    ChevronUp, ChevronDown, ArrowUpDown, Users, Target,
    History, RefreshCw, ExternalLink, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";

// ── Types ────────────────────────────────────────────────────────────────────

interface ResumeCandidate {
    id: string;
    fullName: string;
    email?: string;
    fileName: string;
    aiScore: number | null;
    aiReport?: string;
    resumeStatus: string;
    createdAt: string;
    bulkBatchId: string;
}

interface ResumeBatch {
    id: string;
    status: string;
    totalCount: number;
    processedCount: number;
    failedCount: number;
    createdAt: string;
    completedAt?: string;
}

type SortKey = "aiScore" | "fullName" | "resumeStatus";
type SortDir = "asc" | "desc";

// ── Main export ───────────────────────────────────────────────────────────────

export function ResumeScreening({ driveId, driveName }: { driveId: string; driveName: string }) {
    const [modalOpen, setModalOpen] = useState(false);
    const [candidates, setCandidates] = useState<ResumeCandidate[]>([]);
    const [batches, setBatches] = useState<ResumeBatch[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch(`/api/drives/${driveId}/resume-screening`);
            if (!res.ok) return;
            const data = await res.json();
            setCandidates(data.candidates || []);
            setBatches(data.batches || []);
        } catch { /* silent */ } finally {
            setLoadingData(false);
        }
    }, [driveId]);

    useEffect(() => { refresh(); }, [refresh]);

    return (
        <div className="space-y-6">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Resume Screening</h2>
                    <p className="text-sm text-gray-400 font-medium">
                        {candidates.length > 0
                            ? `${candidates.length} resume${candidates.length !== 1 ? "s" : ""} screened`
                            : "Upload resumes to start AI screening"}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {candidates.length > 0 && (
                        <Link href={`/admin/drives/${driveId}/resume-screening`}>
                            <Button className="h-10 px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center gap-2 shadow-sm">
                                View Details
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    )}
                    <Button
                        onClick={() => setModalOpen(true)}
                        className="h-10 px-5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold flex items-center gap-2 shadow-sm"
                    >
                        <Upload className="h-4 w-4" />
                        Upload Resumes
                    </Button>
                </div>
            </div>

            {/* Empty state or quick summary */}
            {loadingData ? (
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-12 rounded-lg bg-gray-100/60 animate-pulse" />
                    ))}
                </div>
            ) : candidates.length === 0 ? (
                <EmptyState onUpload={() => setModalOpen(true)} />
            ) : null}

            {/* Upload + progress modal */}
            <UploadModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                driveId={driveId}
                driveName={driveName}
                onComplete={() => { setModalOpen(false); refresh(); }}
            />
        </div>
    );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onUpload }: { onUpload: () => void }) {
    return (
        <div
            onClick={onUpload}
            className="flex flex-col items-center justify-center gap-4 py-20 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-orange-300 hover:bg-orange-50/20 transition-all"
        >
            <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
                <Upload className="h-7 w-7 text-orange-500" />
            </div>
            <div className="text-center">
                <p className="text-base font-bold text-gray-700">No resumes screened yet</p>
                <p className="text-sm text-gray-400 mt-1">Click to upload PDFs and start AI screening</p>
            </div>
        </div>
    );
}


// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({
    open, onClose, driveId, driveName, onComplete,
}: {
    open: boolean; onClose: () => void;
    driveId: string; driveName: string;
    onComplete: () => void;
}) {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "done" | "failed">("idle");
    const [progress, setProgress] = useState({ processed: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    const reset = () => {
        setFiles([]); setPhase("idle");
        setProgress({ processed: 0, total: 0 }); setError(null);
        if (pollRef.current) clearInterval(pollRef.current);
    };

    const handleClose = () => {
        if (phase === "processing" && !window.confirm("Screening is running. Close anyway?")) return;
        reset(); onClose();
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".pdf"));
        setFiles(prev => [...prev, ...dropped]);
    };

    const startScreening = async () => {
        if (!files.length) return;
        setPhase("uploading"); setError(null);
        try {
            const fd = new FormData();
            files.forEach(f => fd.append("files", f));
            const res = await fetch(`/api/drives/${driveId}/resume-screening`, { method: "POST", body: fd });
            if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
            const { batchId, totalCount } = await res.json();
            setProgress({ processed: 0, total: totalCount });
            setPhase("processing");

            pollRef.current = setInterval(async () => {
                try {
                    const pr = await fetch(`/api/drives/${driveId}/resume-screening?batchId=${batchId}`);
                    const data = await pr.json();
                    setProgress({ processed: data.processedCount, total: data.totalCount });
                    if (data.status === "COMPLETED") {
                        clearInterval(pollRef.current!);
                        setPhase("done");
                        toast.success(`${data.processedCount} resumes screened successfully`);
                        setTimeout(() => { reset(); onComplete(); }, 1200);
                    } else if (data.status === "FAILED") {
                        clearInterval(pollRef.current!);
                        setPhase("failed"); setError("Processing failed. Try again.");
                    }
                } catch { /* ignore */ }
            }, 1200);
        } catch (err) {
            setPhase("failed"); setError((err as Error).message);
            toast.error((err as Error).message);
        }
    };

    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black text-gray-900">
                        {phase === "processing" ? "Screening in Progress" :
                            phase === "done" ? "Screening Complete" : "Upload Resumes"}
                    </DialogTitle>
                    <p className="text-sm text-gray-400">{driveName}</p>
                </DialogHeader>

                {/* IDLE / UPLOADING */}
                {(phase === "idle" || phase === "uploading") && (
                    <div className="space-y-5 py-3">
                        <div
                            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={onDrop}
                            onClick={() => files.length === 0 && inputRef.current?.click()}
                            className={cn(
                                "border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer",
                                isDragging ? "border-orange-400 bg-orange-50/60" :
                                    files.length > 0 ? "border-orange-200 bg-orange-50/20" :
                                        "border-gray-200 hover:border-orange-300",
                                files.length > 0 ? "p-5" : "p-12"
                            )}
                        >
                            <input ref={inputRef} type="file" multiple accept=".pdf" onChange={e => { setFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = ""; }} className="hidden" />

                            {files.length === 0 ? (
                                <div className="text-center">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-3">
                                        <Upload className="h-6 w-6 text-orange-500" />
                                    </div>
                                    <p className="font-bold text-gray-800">Drop PDF resumes here</p>
                                    <p className="text-sm text-gray-400 mt-1">or click to browse</p>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
                                            <FileText className="h-6 w-6 text-orange-500" />
                                        </div>
                                        <div>
                                            <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">{files.length}</p>
                                            <p className="text-sm text-gray-400 mt-0.5">resume{files.length !== 1 ? "s" : ""} selected</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={e => { e.stopPropagation(); inputRef.current?.click(); }} className="text-xs font-bold text-orange-600 px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors">+ Add</button>
                                        <button onClick={e => { e.stopPropagation(); setFiles([]); }} className="text-xs font-bold text-gray-400 px-3 py-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors">Clear</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3 pt-1 border-t border-gray-100">
                            <Button variant="ghost" onClick={handleClose} className="rounded-xl font-bold text-gray-500">Cancel</Button>
                            <Button
                                onClick={startScreening}
                                disabled={files.length === 0 || phase === "uploading"}
                                className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 flex items-center gap-2"
                            >
                                <Zap className="h-4 w-4" />
                                {phase === "uploading" ? "Uploading..." : `Start Screening (${files.length})`}
                            </Button>
                        </div>
                    </div>
                )}

                {/* PROCESSING */}
                {phase === "processing" && (
                    <div className="py-8 space-y-6">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-bold text-gray-600">Screening resumes</span>
                                <span className="font-black text-gray-900 tabular-nums">{progress.processed} / {progress.total}</span>
                            </div>
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 font-bold">
                                <span>{pct}% complete</span>
                                <span>{progress.total - progress.processed} remaining</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "Total", v: progress.total, c: "text-gray-800" },
                                { label: "Done", v: progress.processed, c: "text-emerald-600" },
                                { label: "Left", v: progress.total - progress.processed, c: "text-orange-500" },
                            ].map(x => (
                                <div key={x.label} className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                                    <p className={cn("text-2xl font-black tabular-nums", x.c)}>{x.v}</p>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mt-1">{x.label}</p>
                                </div>
                            ))}
                        </div>

                        <p className="text-center text-xs text-gray-400">AI is extracting and scoring each resume · Do not close this window</p>
                    </div>
                )}

                {/* DONE */}
                {phase === "done" && (
                    <div className="py-8 text-center space-y-3">
                        <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                        </div>
                        <p className="text-base font-black text-gray-900">All done!</p>
                        <p className="text-sm text-gray-400">{progress.total} resumes screened. Closing…</p>
                    </div>
                )}

                {/* FAILED */}
                {phase === "failed" && (
                    <div className="py-8 text-center space-y-4">
                        <div className="mx-auto w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center">
                            <AlertCircle className="h-7 w-7 text-red-500" />
                        </div>
                        <p className="text-base font-black text-gray-900">Screening failed</p>
                        <p className="text-sm text-gray-400">{error}</p>
                        <div className="flex items-center justify-center gap-3">
                            <Button variant="ghost" onClick={handleClose} className="rounded-xl font-bold">Close</Button>
                            <Button onClick={reset} className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold">Try Again</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
