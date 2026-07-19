"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
    Upload, X, FileText, Zap, CheckCircle2, XCircle, Mail,
    AlertCircle, TrendingUp, TrendingDown, Minus,
    ChevronUp, ChevronDown, ArrowUpDown, Users, Target,
    History, RefreshCw, ExternalLink, ArrowRight, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { reportClientError } from "@/lib/client-error-reporter";
import { INTERVIEW_SUPPORT_EMAIL, getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";
// -- Types --------------------------------------------------------------------
interface ResumeCandidate {
    id: string;
    fullName: string;
    email?: string;
    fileName: string;
    aiScore: number | null;
    aiReport?: string;
    resumeStatus: string;
    createdAt: string;
}
type SortKey = "aiScore" | "fullName" | "resumeStatus";
type SortDir = "asc" | "desc";
// -- Main export ---------------------------------------------------------------
export function ResumeScreening({ jobId, jobName }: { jobId: string; jobName: string }) {
    const router = useRouter();
    const [modalOpen, setModalOpen] = useState(false);
    const [candidates, setCandidates] = useState<ResumeCandidate[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const refresh = useCallback(async () => {
        try {
            const res = await fetch(`/api/jobs/${jobId}/resume-screening`);
            if (!res.ok) return;
            const data = await res.json();
            setCandidates(data.candidates || []);
        } catch { /* silent */ } finally {
            setLoadingData(false);
        }
    }, [jobId]);
    useEffect(() => { refresh(); }, [refresh]);
    // Auto-poll while any candidate is still in-flight
    useEffect(() => {
        const hasActiveCandidate = candidates.some((c) => {
            const s = String(c.resumeStatus || "").toLowerCase();
            return s === "extracting" || s === "waiting" || s === "starting" || s === "scoring" || s === "processing";
        });
        if (!hasActiveCandidate) return;
        const timer = setInterval(refresh, 3000);
        return () => clearInterval(timer);
    }, [candidates, refresh]);
    // ⚡ Read from shared context -- no fetch needed
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || "ACTIVE");
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const interviewAccessLocked = quotaLocked || isSuspended;
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
                        <Link href={`/admin/candidates/job/${encodeURIComponent(jobId)}`}>
                            <Button className="h-10 px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center gap-2 shadow-sm">
                                View Candidates
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    )}
                    {interviewAccessLocked ? (
                        <Button
                            disabled
                            className="h-10 px-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-bold flex items-center gap-2 shadow-sm cursor-not-allowed"
                            title={getInterviewActionBlockedMessage(isSuspended)}
                        >
                            <Lock className="h-4 w-4" />
                            Upload Locked
                        </Button>
                    ) : (
                        <Button
                            onClick={() => setModalOpen(true)}
                            className="h-10 px-5 rounded-xl bg-violet-600 hover:bg-orange-700 text-white font-bold flex items-center gap-2 shadow-sm"
                        >
                            <Upload className="h-4 w-4" />
                            Upload Resumes
                        </Button>
                    )}
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
            {interviewAccessLocked ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 shadow-sm">
                    <div className="font-black uppercase tracking-[0.2em] text-amber-700">Upload locked</div>
                    <p className="mt-2 font-medium text-amber-900">{getInterviewActionBlockedMessage(isSuspended)}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Link href="/admin/billing" className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-bold text-white">
                            Go to Billing
                        </Link>
                        <a href={`mailto:${INTERVIEW_SUPPORT_EMAIL}`} className="rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-amber-700">
                            Contact Support
                        </a>
                    </div>
                </div>
            ) : (
                <UploadModal
                    open={modalOpen}
                    onClose={() => setModalOpen(false)}
                    jobId={jobId}
                    jobName={jobName}
                    onComplete={() => {
                        setModalOpen(false);
                        refresh();
                        router.push(`/admin/candidates/job/${encodeURIComponent(jobId)}`);
                    }}
                />
            )}
        </div>
    );
}
// -- Empty state ---------------------------------------------------------------
function EmptyState({ onUpload }: { onUpload: () => void }) {
    return (
        <div
            onClick={onUpload}
            className="flex flex-col items-center justify-center gap-4 py-20 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-violet-300 hover:bg-violet-50/20 transition-all"
        >
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center">
                <Upload className="h-7 w-7 text-violet-500" />
            </div>
            <div className="text-center">
                <p className="text-base font-bold text-gray-700">No resumes screened yet</p>
                <p className="text-sm text-gray-400 mt-1">Click to upload PDFs and start AI screening</p>
            </div>
        </div>
    );
}
// -- Upload modal --------------------------------------------------------------
function UploadModal({
    open, onClose, jobId, jobName, onComplete,
}: {
    open: boolean; onClose: () => void;
    jobId: string; jobName: string;
    onComplete: () => void;
}) {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "summary" | "failed">("idle");
    const [progress, setProgress] = useState({ processed: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<{
        shortlisted: number;
        rejected: number;
        total: number;
        candidateIds: string[];
    } | null>(null);
    const [sendingFollowUp, setSendingFollowUp] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const reset = () => {
        setFiles([]); setPhase("idle");
        setProgress({ processed: 0, total: 0 }); setError(null);
        setSummary(null);
        setSendingFollowUp(false);
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
    const loadSummaryForIds = async (ids: string[]) => {
        const res = await fetch(`/api/jobs/${jobId}/resume-screening`);
        if (!res.ok) throw new Error("Failed to load screening summary");
        const data = await res.json();
        const idSet = new Set(ids);
        const uploadCandidates = Array.isArray(data.candidates)
            ? data.candidates.filter((c: any) => idSet.has(c.id))
            : [];
        const normalizedStatus = (value: unknown) =>
            String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
        return {
            shortlisted: uploadCandidates.filter((c: any) => normalizedStatus(c.resumeStatus) === "shortlisted").length,
            rejected: uploadCandidates.filter((c: any) => normalizedStatus(c.resumeStatus) === "rejected").length,
            total: uploadCandidates.length,
            candidateIds: uploadCandidates.map((c: any) => c.id),
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
            onComplete();
        } catch (err) {
            toast.error((err as Error).message);
            reportClientError(err, { action: "send_followup_emails" });
        } finally {
            setSendingFollowUp(false);
        }
    };
    const startScreening = async () => {
        if (!files.length) return;
        setPhase("uploading"); setError(null);
        try {
            const fd = new FormData();
            files.forEach(f => fd.append("files", f));
            const res = await fetch(`/api/jobs/${jobId}/resume-screening`, { method: "POST", body: fd });
            if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
            const data = await res.json();
            const uploadedIds: string[] = data.candidateIds || [];
            const totalFiles = uploadedIds.length || files.length;
            setProgress({ processed: 0, total: totalFiles });
            setPhase("processing");
            const TERMINAL = new Set(["shortlisted", "rejected", "failed"]);
            // Poll candidate statuses until all are in a terminal state
            pollRef.current = setInterval(async () => {
                try {
                    const pollRes = await fetch(`/api/jobs/${jobId}/resume-screening`);
                    if (!pollRes.ok) return;
                    const pollData = await pollRes.json();
                    const idSet = new Set(uploadedIds);
                    const these = Array.isArray(pollData.candidates)
                        ? pollData.candidates.filter((c: any) => idSet.has(c.id))
                        : [];
                    const done = these.filter((c: any) => TERMINAL.has(String(c.resumeStatus || "").toLowerCase())).length;
                    setProgress({ processed: done, total: totalFiles });
                    if (done >= totalFiles && totalFiles > 0) {
                        if (pollRef.current) clearInterval(pollRef.current);
                        const summaryData = await loadSummaryForIds(uploadedIds);
                        setSummary(summaryData);
                        setPhase("summary");
                    }
                } catch { /* keep polling on transient errors */ }
            }, 2500);
        } catch (err) {
            setPhase("failed");
            setError((err as Error).message);
            toast.error((err as Error).message);
            reportClientError(err, { action: "start_resume_screening" });
        }
    };
    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/40 bg-white/95 backdrop-blur-2xl shadow-[0_30px_100px_rgba(0,0,0,0.18)]">
                <DialogHeader className="shrink-0 space-y-3 border-b border-gray-100 pb-4">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-violet-700">
                        Resume batch upload
                    </div>
                    <DialogTitle className="text-2xl font-black tracking-tight text-gray-900">
                        {phase === "processing" ? "Screening in Progress" :
                            phase === "summary" ? "Screening Complete" :
                            "Upload Resumes"}
                    </DialogTitle>
                    <p className="text-sm text-gray-500">{jobName}</p>
                </DialogHeader>
                {/* IDLE / UPLOADING */}
                {(phase === "idle" || phase === "uploading") && (
                    <div className="flex-1 space-y-5 overflow-y-auto py-4 pr-1">
                        <div
                            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={onDrop}
                            onClick={() => files.length === 0 && inputRef.current?.click()}
                            className={cn(
                                "rounded-3xl border-2 border-dashed transition-all duration-200 cursor-pointer",
                                isDragging ? "border-violet-400 bg-violet-50/60" :
                                    files.length > 0 ? "border-violet-200 bg-violet-50/20" :
                                        "border-gray-200 hover:border-violet-300",
                                files.length > 0 ? "p-5" : "p-12"
                            )}
                        >
                            <input
                                ref={inputRef}
                                type="file"
                                multiple
                                accept=".pdf"
                                onChange={e => { setFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = ""; }}
                                className="hidden"
                            />
                            {files.length === 0 ? (
                                <div className="text-center">
                                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-orange-100 to-amber-100 text-violet-600 shadow-sm">
                                        <Upload className="h-7 w-7" />
                                    </div>
                                    <p className="text-base font-bold text-gray-800">Drop PDF resumes here</p>
                                    <p className="mt-1 text-sm text-gray-400">or click to browse files</p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                                        className="mt-5 h-11 rounded-2xl border-violet-200 bg-white px-5 text-sm font-bold text-violet-600 hover:border-violet-300 hover:bg-violet-50"
                                    >
                                        Browse files
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">{files.length}</p>
                                            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">PDF files selected</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                                                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 text-xs font-bold text-violet-600 transition-colors hover:border-violet-300 hover:bg-violet-100"
                                            >
                                                + Add More
                                            </button>
                                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-500 shadow-sm">
                                                <FileText className="h-5 w-5" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="max-h-56 overflow-y-auto space-y-2 rounded-[1.5rem] border border-violet-100 bg-white/80 p-3 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                        {files.map((file) => (
                                            <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-gray-100 bg-white px-4 py-3 shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition-transform hover:-translate-y-[1px]">
                                                <div className="min-w-0">
                                                    <span className="block truncate text-sm font-bold text-gray-800">{file.name}</span>
                                                    <span className="text-[11px] font-medium text-gray-400">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); setFiles(prev => prev.filter(item => item !== file)); }}
                                                    className="shrink-0 rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
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
                        <div className="flex gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}
                        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
                            <Button variant="ghost" onClick={handleClose} className="rounded-xl font-bold text-gray-500">Cancel</Button>
                            <Button
                                onClick={startScreening}
                                disabled={files.length === 0 || phase === "uploading"}
                                className="rounded-2xl bg-violet-600 px-6 font-bold text-white shadow-[0_10px_24px_rgba(124,58,237,0.28)] hover:bg-orange-700 hover:shadow-[0_12px_28px_rgba(124,58,237,0.34)] flex items-center gap-2"
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
                        <div className="flex flex-col items-center gap-6">
                            {/* Pie Chart */}
                            <div className="relative w-40 h-40">
                                <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="45"
                                        fill="none"
                                        stroke="url(#pieGradient)"
                                        strokeWidth="8"
                                        strokeDasharray={`${pct * 2.827} 282.7`}
                                        strokeLinecap="round"
                                    />
                                    <defs>
                                        <linearGradient id="pieGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#fb923c" />
                                            <stop offset="100%" stopColor="#ea580c" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <p className="text-3xl font-black text-gray-900 tabular-nums">{pct}%</p>
                                    <p className="text-xs font-bold text-gray-400">complete</p>
                                </div>
                            </div>
                            {/* Stats */}
                            <div className="w-full grid grid-cols-3 gap-2">
                                {[
                                    { label: "Total", v: progress.total, c: "text-gray-800" },
                                    { label: "Done", v: progress.processed, c: "text-emerald-600" },
                                    { label: "Left", v: progress.total - progress.processed, c: "text-violet-500" },
                                ].map(x => (
                                    <div key={x.label} className="text-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <p className={cn("text-xl font-black tabular-nums", x.c)}>{x.v}</p>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{x.label}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-center text-xs text-gray-400">AI is extracting and scoring each resume · Do not close this window</p>
                        </div>
                    </div>
                )}
                {/* SUMMARY */}
                {phase === "summary" && summary && (
                    <div className="py-6 space-y-5">
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
                            <div className="rounded-2xl border border-gray-200 bg-violet-50/60 p-4 text-center">
                                <p className="text-2xl font-black text-gray-900">{summary.total}</p>
                                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-gray-500">Total</p>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-violet-50/70 p-4 text-sm text-gray-600">
                            <p className="font-semibold text-gray-900">Send follow-up emails now?</p>
                            <p className="mt-1">
                                Rejection emails will be sent immediately. Shortlisted emails will be queued and delivered through the invitation queue.
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-1">
                            <Button variant="ghost" onClick={() => { reset(); onComplete(); }} className="h-11 rounded-2xl border border-gray-200 bg-white px-5 font-bold text-gray-600 hover:bg-gray-50">
                                Skip
                            </Button>
                            <Button
                                onClick={handleSendFollowUpEmails}
                                disabled={sendingFollowUp}
                                className="h-11 rounded-2xl bg-violet-600 px-6 font-bold text-white shadow-[0_10px_24px_rgba(124,58,237,0.28)] hover:bg-orange-700 hover:shadow-[0_12px_28px_rgba(124,58,237,0.34)] flex items-center gap-2"
                            >
                                <Mail className="h-4 w-4" />
                                {sendingFollowUp ? "Sending..." : "Send Emails"}
                            </Button>
                        </div>
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
                            <Button variant="ghost" onClick={handleClose} className="h-11 rounded-2xl border border-gray-200 bg-white px-5 font-bold text-gray-600 hover:bg-gray-50">Close</Button>
                            <Button onClick={reset} className="h-11 rounded-2xl bg-violet-600 px-5 font-bold text-white shadow-[0_10px_24px_rgba(124,58,237,0.28)] hover:bg-orange-700 hover:shadow-[0_12px_28px_rgba(124,58,237,0.34)]">Try Again</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
