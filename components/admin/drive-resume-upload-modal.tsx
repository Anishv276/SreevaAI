"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { AlertCircle, CheckCircle2, FileText, Loader2, Mail, Upload, X, XCircle, Lock } from "lucide-react";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";

type UploadPhase = "idle" | "uploading" | "processing" | "summary" | "failed";

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
    const [summary, setSummary] = useState<{
        shortlisted: number;
        rejected: number;
        total: number;
        candidateIds: string[];
    } | null>(null);
    const [sendingFollowUp, setSendingFollowUp] = useState(false);
    const [displayPct, setDisplayPct] = useState(0);
    const [quotaLocked, setQuotaLocked] = useState(false);
    const [orgStatus, setOrgStatus] = useState<string>("ACTIVE");
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
        setSummary(null);
        setSendingFollowUp(false);
    };

    const handleClose = () => {
        if (phase === "processing" && !window.confirm("Resume screening is still running. Close anyway?")) {
            return;
        }
        reset();
        onOpenChange(false);
    };

    const loadBatchSummary = async (batchId: string) => {
        const res = await fetch(`/api/drives/${driveId}/resume-screening`);
        if (!res.ok) throw new Error("Failed to load screening summary");
        const data = await res.json();
        const batchCandidates = Array.isArray(data.candidates)
            ? data.candidates.filter((candidate: any) => candidate.bulkBatchId === batchId)
            : [];

        const normalizedStatus = (value: unknown) =>
            String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");

        return {
            shortlisted: batchCandidates.filter((candidate: any) => normalizedStatus(candidate.resumeStatus) === "shortlisted").length,
            rejected: batchCandidates.filter((candidate: any) => normalizedStatus(candidate.resumeStatus) === "rejected").length,
            total: batchCandidates.length,
            candidateIds: batchCandidates.map((candidate: any) => candidate.id),
        };
    };

    const handleSendFollowUpEmails = async () => {
        if (!summary || summary.candidateIds.length === 0 || sendingFollowUp) return;
        setSendingFollowUp(true);
        try {
            const res = await fetch("/api/candidates/bulk-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ids: summary.candidateIds,
                    emailType: "screening",
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || "Failed to send follow-up emails");
            }
            toast.success(data?.message || "Follow-up emails queued/sent");
            reset();
            onOpenChange(false);
            onUploaded?.();
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setSendingFollowUp(false);
        }
    };

    useEffect(() => {
        if (!open) {
            reset();
        }
        return () => clearPolling();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        let cancelled = false;
        const loadQuota = async () => {
            try {
                const res = await fetch("/api/admin/credits", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setQuotaLocked(isInterviewQuotaLocked(data));
            } catch {
                // ignore
            }
        };
        loadQuota();
        return () => {
            cancelled = true;
        };
    }, []);
    useEffect(() => {
        let cancelled = false;
        const loadOrgStatus = async () => {
            try {
                const res = await fetch("/api/admin/organization", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setOrgStatus(String(data.status || "ACTIVE"));
            } catch {
                // ignore
            }
        };
        loadOrgStatus();
        return () => {
            cancelled = true;
        };
    }, []);
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const accessLocked = quotaLocked || isSuspended;

    const startUpload = async () => {
        if (accessLocked) {
            toast.error(getInterviewActionBlockedMessage(isSuspended));
            return;
        }
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
                        toast.success(`${data.processedCount || 0} resumes screened successfully`);
                        try {
                            const nextSummary = await loadBatchSummary(batchId);
                            setSummary(nextSummary);
                            setPhase("summary");
                        } catch (summaryError) {
                            setPhase("failed");
                            setError((summaryError as Error).message || "Failed to build screening summary");
                        }
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
            syncDisplayPct(phase === "summary" ? 100 : 0);
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
                            : phase === "summary"
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
                                        <div className="flex items-center gap-3">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    inputRef.current?.click();
                                                }}
                                                className="h-9 rounded-xl border-orange-200 bg-orange-50 text-xs font-bold text-orange-600 hover:bg-orange-100 transition-colors"
                                            >
                                                + Add More
                                            </Button>
                                            <FileText className="h-10 w-10 text-orange-500" />
                                        </div>
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

                    {accessLocked && (
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                            <div className="space-y-1">
                                <p className="font-bold">Resume upload locked</p>
                                <p className="font-medium">{getInterviewActionBlockedMessage(isSuspended)}</p>
                            </div>
                        </div>
                    )}

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
                                disabled={!files.length || phase === "uploading" || accessLocked}
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

                {phase === "summary" && summary && (
                    <div className="space-y-5 py-3">
                        <div className="text-center space-y-3">
                            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                            </div>
                            <p className="text-base font-black text-gray-900">Screening complete</p>
                            <p className="text-sm text-gray-500">
                                {summary.shortlisted} shortlisted and {summary.rejected} rejected from {summary.total} screened resumes.
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-center">
                                <p className="text-2xl font-black text-emerald-700">{summary.shortlisted}</p>
                                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-emerald-700">Shortlisted</p>
                            </div>
                            <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-center">
                                <p className="text-2xl font-black text-rose-700">{summary.rejected}</p>
                                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-rose-700">Rejected</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-center">
                                <p className="text-2xl font-black text-slate-900">{summary.total}</p>
                                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">Total</p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
                            <p className="font-semibold text-slate-900">Send follow-up emails now?</p>
                            <p className="mt-1">
                                Rejection emails will be sent immediately. Shortlisted emails will be queued and delivered through the invitation queue.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-1">
                            <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); onUploaded?.(); }} className="rounded-xl font-bold text-gray-500">
                                Skip
                            </Button>
                            <Button
                                onClick={handleSendFollowUpEmails}
                                disabled={sendingFollowUp}
                                className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 flex items-center gap-2"
                            >
                                <Mail className="h-4 w-4" />
                                {sendingFollowUp ? "Sending..." : "Send Emails"}
                            </Button>
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
