"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    ArrowLeft,
    FileText,
    Eye,
    CheckCircle2,
    XCircle,
    TrendingUp,
    TrendingDown,
    Minus,
    ChevronUp,
    ChevronDown,
    ArrowUpDown,
    Upload,
    Loader2,
    MoreVertical,
    Mail,
    Trash2,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { ResumeReportHyring, buildHyringResumeViewModel } from "@/components/admin/candidate-profile/resume-report-hyring";

interface ResumeCandidate {
    id: string;
    fullName: string;
    email?: string;
    fileName: string;
    resumeUrl?: string | null;
    resumeText?: string | null;
    aiScore: number | null;
    aiReport?: string;
    resumeStatus: string;
    createdAt: string;
    bulkBatchId: string;
}

type SortKey = "aiScore" | "fullName" | "resumeStatus";
type SortDir = "asc" | "desc";

function toTextList(value: unknown): string[] {
    const toLine = (item: unknown): string => {
        if (item == null) return "";
        if (typeof item === "string") return item.trim();
        if (typeof item === "number" || typeof item === "boolean") return String(item);
        if (typeof item !== "object") return "";
        const obj = item as Record<string, unknown>;
        const keys = [
            "point",
            "text",
            "summary",
            "reasoning",
            "evidence",
            "note",
            "label",
            "description",
            "message",
            "title",
            "name",
        ];
        for (const key of keys) {
            const candidate = obj[key];
            if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        }
        for (const candidate of Object.values(obj)) {
            if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        }
        try {
            return JSON.stringify(item);
        } catch {
            return "";
        }
    };

    if (Array.isArray(value)) return value.map(toLine).filter(Boolean);
    if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(toLine).filter(Boolean);
    if (typeof value === "string") return value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return [];
}

function firstText(value: unknown, fallback = ""): string {
    const list = toTextList(value);
    return list[0] || fallback;
}

export default function ResumeScreeningDetailsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const router = useRouter();
    const { id: driveId } = use(params);

    const [candidates, setCandidates] = useState<ResumeCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>("aiScore");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [mounted, setMounted] = useState(false);
    const [driveTitle, setDriveTitle] = useState("Resume Screening");
    const [reportModal, setReportModal] = useState<{ candidate: ResumeCandidate; open: boolean }>({
        candidate: {} as ResumeCandidate,
        open: false,
    });
    const [uploadModal, setUploadModal] = useState(false);
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "processing" | "done" | "failed">("idle");
    const [uploadProgress, setUploadProgress] = useState({ processed: 0, total: 0 });
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const handleShortlist = async (candidateId: string) => {
        setActionLoading(candidateId);
        try {
            const res = await fetch(`/api/drives/${driveId}/resume-screening/candidates/${candidateId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resumeStatus: "SHORTLISTED" }),
            });
            if (!res.ok) throw new Error("Failed to shortlist");
            toast.success("Candidate shortlisted");
            fetch_data();
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (candidateId: string) => {
        setActionLoading(candidateId);
        try {
            const res = await fetch(`/api/drives/${driveId}/resume-screening/candidates/${candidateId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resumeStatus: "REJECTED" }),
            });
            if (!res.ok) throw new Error("Failed to reject");
            toast.success("Candidate rejected");
            fetch_data();
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (candidateId: string) => {
        if (!window.confirm("Delete this candidate? This cannot be undone.")) return;
        setActionLoading(candidateId);
        try {
            const res = await fetch(`/api/drives/${driveId}/resume-screening/candidates/${candidateId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete");
            toast.success("Candidate deleted");
            setCandidates(c => c.filter(x => x.id !== candidateId));
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSendInterview = async (candidateId: string, candidateEmail?: string) => {
        if (!candidateEmail) {
            toast.error("No email address on file");
            return;
        }
        setActionLoading(candidateId);
        try {
            const res = await fetch(`/api/drives/${driveId}/resume-screening/candidates/${candidateId}/send-interview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: candidateEmail }),
            });
            if (!res.ok) throw new Error("Failed to send interview link");
            toast.success("Interview link sent");
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setActionLoading(null);
        }
    };

    const fetch_data = useCallback(async () => {
        try {
            const [res, driveRes] = await Promise.all([
                fetch(`/api/drives/${driveId}/resume-screening`),
                fetch(`/api/drives/${driveId}`),
            ]);

            if (driveRes.ok) {
                const drive = await driveRes.json();
                setDriveTitle(String(drive?.title || drive?.role || "Resume Screening"));
            }

            if (!res.ok) return;
            const data = await res.json();
            setCandidates(data.candidates || []);
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, [driveId]);

    useEffect(() => {
        fetch_data();
    }, [fetch_data]);

    useEffect(() => {
        setMounted(true);
    }, []);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    const sorted = [...candidates].sort((a, b) => {
        let av: string | number =
            sortKey === "aiScore" ? (a.aiScore ?? -1) : String((a as Record<string, unknown>)[sortKey] ?? "");
        let bv: string | number =
            sortKey === "aiScore" ? (b.aiScore ?? -1) : String((b as Record<string, unknown>)[sortKey] ?? "");
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });

    const buildReportModel = (candidate: ResumeCandidate) => {
        const report = (() => {
            try {
                return candidate.aiReport ? JSON.parse(candidate.aiReport) : {};
            } catch {
                return {};
            }
        })();
        const fullName = candidate.fullName || "Candidate";
        const displayAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fullName)}`;
        const strengths = toTextList(report.strengths || report.core_claims || report.decision_breakdown || []);
        const concerns = toTextList(report.concerns || report.gaps || report.rejection_reasons || report.uncertain_areas || []);
        const integrityLines = toTextList(report.integrity_signals || report.red_flags || []);
        const workHistory = Array.isArray(report.work_history_annotated)
            ? report.work_history_annotated
            : Array.isArray(report.work_history)
                ? report.work_history
                : [];
        const educationList = Array.isArray(report.education) ? report.education : [];
        const skillDepth = toTextList(report.skill_depth);
        const coreClaims = toTextList(report.core_claims);
        const breakdown = report.breakdown || null;
        const score = Number(candidate.aiScore ?? report.score ?? 0) || 0;
        const mustHaveBarPct =
            breakdown?.skills_max && Number(breakdown.skills_max) > 0
                ? Math.min(100, Math.round((Number(breakdown.skills_score) / Number(breakdown.skills_max)) * 100))
                : Math.min(100, Math.max(0, Math.round(score)));
        const summary =
            firstText(report.recruiter_snapshot) ||
            firstText(report.decision_reason) ||
            firstText(report.ai_verdict) ||
            firstText(report.summary) ||
            firstText(report.reasoning) ||
            "AI screening analysis ready.";
        const primaryGapText =
            firstText(concerns) ||
            firstText(report.decision_reason) ||
            firstText(report.recruiter_snapshot) ||
            "No top gap listed yet.";

        return buildHyringResumeViewModel({
            candidate: {
                fullName,
                createdAt: candidate.createdAt,
                location: candidate.resumeStatus || "Resume screening",
                resumeUrl: candidate.resumeUrl || `/api/drives/${driveId}/resume-screening/download?candidateId=${candidate.id}`,
                drive: { title: driveTitle },
            },
            mounted,
            displayAvatar,
            hasAiReport: Boolean(candidate.aiReport),
            hasResumeText: Boolean(candidate.resumeText),
            matchScore: score,
            summary,
            strengthLines: strengths,
            weaknessLines: concerns,
            redFlagLines: integrityLines,
            primaryGapText,
            normalizedStatus: String(candidate.resumeStatus || "pending"),
            interviewStageLabel: String(report.status || candidate.resumeStatus || "Screened"),
            breakdown,
            combinedWorkHistory: workHistory,
            educationList,
            totalExtractedSkills: skillDepth.length + coreClaims.length + workHistory.length,
            mustHaveBarPct,
            techSkillSample: skillDepth.slice(0, 14),
        });
    };

    const SortIcon = ({ col }: { col: SortKey }) =>
        sortKey !== col ? (
            <ArrowUpDown className="h-3 w-3 opacity-30" />
        ) : sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
        ) : (
            <ChevronDown className="h-3 w-3" />
        );

    const scoreBadge = (s: number | null) => {
        if (s === null) return "bg-gray-100 text-gray-400";
        if (s >= 75) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
        if (s >= 50) return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
        return "bg-red-50 text-red-600 ring-1 ring-red-200";
    };

    const handleUpload = async () => {
        if (!uploadFiles.length) return;
        setUploadPhase("uploading");
        try {
            const fd = new FormData();
            uploadFiles.forEach((f) => fd.append("files", f));
            const res = await fetch(`/api/drives/${driveId}/resume-screening`, {
                method: "POST",
                body: fd,
            });
            if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
            const { batchId, totalCount } = await res.json();
            setUploadProgress({ processed: 0, total: totalCount });
            setUploadPhase("processing");

            const pollInterval = setInterval(async () => {
                try {
                    const pr = await fetch(
                        `/api/drives/${driveId}/resume-screening?batchId=${batchId}`
                    );
                    const data = await pr.json();
                    setUploadProgress({ processed: data.processedCount, total: data.totalCount });
                    if (data.status === "COMPLETED") {
                        clearInterval(pollInterval);
                        setUploadPhase("done");
                        toast.success(`${data.processedCount} resumes screened`);
                        setTimeout(() => {
                            setUploadFiles([]);
                            setUploadPhase("idle");
                            setUploadModal(false);
                            fetch_data();
                        }, 1000);
                    } else if (data.status === "FAILED") {
                        clearInterval(pollInterval);
                        setUploadPhase("failed");
                    }
                } catch {
                    /* ignore */
                }
            }, 1200);
        } catch (err) {
            setUploadPhase("failed");
            toast.error((err as Error).message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-full px-8 py-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold text-gray-900">Resume Screening</h1>
                            <p className="text-sm text-gray-500">
                                {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => setUploadModal(true)}
                        className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
                    >
                        <Upload className="h-4 w-4" />
                        Upload Resumes
                    </Button>
                </div>
            </div>

            {/* Main content */}
            <div className="max-w-full px-8 py-8">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
                    </div>
                ) : candidates.length === 0 ? (
                    <div className="text-center py-20">
                        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-600 font-medium">No resumes screened yet</p>
                        <p className="text-sm text-gray-500 mt-1">Upload PDF resumes to start screening</p>
                    </div>
                ) : (

                    <div className="bg-white rounded-lg border border-gray-200">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 bg-gray-50/50">
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 w-[200px]">Candidate</th>
                                        <th className="px-6 py-3 text-left">
                                            <button
                                                onClick={() => toggleSort("aiScore")}
                                                className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                                            >
                                                Score <SortIcon col="aiScore" />
                                            </button>
                                        </th>
                                        <th className="px-6 py-3 text-left">
                                            <button
                                                onClick={() => toggleSort("resumeStatus")}
                                                className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
                                            >
                                                Decision <SortIcon col="resumeStatus" />
                                            </button>
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">AI Report</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">File</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">Screened</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sorted.map((c) => {
                                        const score = c.aiScore ?? null;
                                        const isShortlisted = c.resumeStatus?.toLowerCase() === "shortlisted";
                                        return (
                                            <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0">
                                                            <span className="text-[10px] font-bold text-white">
                                                                {c.fullName
                                                                    .split(" ")
                                                                    .map((n: string) => n[0])
                                                                    .join("")
                                                                    .toUpperCase()
                                                                    .slice(0, 2)}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-gray-900 truncate text-sm">
                                                                {c.fullName}
                                                            </p>
                                                            {c.email && (
                                                                <p className="text-xs text-gray-500 truncate">
                                                                    {c.email}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={cn(
                                                                "text-xs font-semibold px-2 py-1 rounded",
                                                                scoreBadge(score)
                                                            )}
                                                        >
                                                            {score !== null ? `${score}%` : "—"}
                                                        </span>
                                                        {score !== null &&
                                                            (score >= 75 ? (
                                                                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                                                            ) : score >= 50 ? (
                                                                <Minus className="h-3.5 w-3.5 text-amber-400" />
                                                            ) : (
                                                                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                                                            ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span
                                                        className={cn(
                                                            "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold",
                                                            isShortlisted
                                                                ? "bg-emerald-50 text-emerald-700"
                                                                : "bg-red-50 text-red-600"
                                                        )}
                                                    >
                                                        {isShortlisted ? (
                                                            <>
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                Shortlisted
                                                            </>
                                                        ) : (
                                                            <>
                                                                <XCircle className="h-3 w-3" />
                                                                Rejected
                                                            </>
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() =>
                                                            setReportModal({
                                                                candidate: c,
                                                                open: true,
                                                            })
                                                        }
                                                        className="text-orange-600 hover:text-orange-700 font-medium text-sm flex items-center gap-1"
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                        View
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() =>
                                                            window.open(
                                                                `/api/drives/${driveId}/resume-screening/download?candidateId=${c.id}`,
                                                                "_blank"
                                                            )
                                                        }
                                                        className="text-gray-600 hover:text-gray-900 text-sm flex items-center gap-1"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                        Preview
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {new Date(c.createdAt).toLocaleDateString("en-US", {
                                                        month: "short",
                                                        day: "numeric",
                                                        year: "numeric",
                                                    })}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <button
                                                                disabled={actionLoading === c.id}
                                                                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                                                            >
                                                                <MoreVertical className="h-4 w-4 text-gray-500" />
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem
                                                                onClick={() => handleShortlist(c.id)}
                                                                disabled={actionLoading === c.id}
                                                                className="cursor-pointer"
                                                            >
                                                                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                                                                <span>Shortlist</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleReject(c.id)}
                                                                disabled={actionLoading === c.id}
                                                                className="cursor-pointer"
                                                            >
                                                                <XCircle className="h-4 w-4 mr-2 text-red-600" />
                                                                <span>Reject</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleSendInterview(c.id, c.email)}
                                                                disabled={actionLoading === c.id || !c.email}
                                                                className="cursor-pointer"
                                                            >
                                                                <Mail className="h-4 w-4 mr-2 text-blue-600" />
                                                                <span>Send Interview</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleDelete(c.id)}
                                                                disabled={actionLoading === c.id}
                                                                className="cursor-pointer text-red-600"
                                                            >
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                <span>Delete</span>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Report modal */}
            <Dialog
                open={reportModal.open}
                onOpenChange={(open) =>
                    setReportModal((prev) => ({ ...prev, open }))
                }
            >
                <DialogContent className="w-[95vw] max-w-[95vw] max-h-[95vh] overflow-hidden border-0 bg-transparent p-0 shadow-none">
                    <div className="h-[95vh] overflow-y-auto">
                        {reportModal.candidate?.fullName && reportModal.candidate.aiReport ? (
                            <ResumeReportHyring model={buildReportModel(reportModal.candidate)} />
                        ) : (
                            <div className="flex h-full items-center justify-center rounded-2xl bg-white p-8 text-center shadow-lg">
                                <div>
                                    <FileText className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                                    <p className="text-gray-600">No report available yet</p>
                                    <p className="mt-1 text-xs text-gray-500">Report will appear once screening completes</p>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Upload modal */}
            <Dialog open={uploadModal} onOpenChange={setUploadModal}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {uploadPhase === "processing"
                                ? "Screening in Progress"
                                : uploadPhase === "done"
                                  ? "Screening Complete"
                                  : "Upload Resumes"}
                        </DialogTitle>
                    </DialogHeader>

                    {(uploadPhase === "idle" || uploadPhase === "uploading") && (
                        <div className="space-y-4 py-2">
                            <div
                                onDragOver={(e) => {
                                    e.preventDefault();
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
                                        f.name.endsWith(".pdf")
                                    );
                                    setUploadFiles((prev) => [...prev, ...dropped]);
                                }}
                                onClick={() =>
                                    uploadFiles.length === 0 && uploadInputRef.current?.click()
                                }
                                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-all"
                            >
                                <input
                                    ref={uploadInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf"
                                    onChange={(e) => {
                                        setUploadFiles((prev) => [
                                            ...prev,
                                            ...Array.from(e.target.files || []),
                                        ]);
                                        e.target.value = "";
                                    }}
                                    className="hidden"
                                />
                                {uploadFiles.length === 0 ? (
                                    <div>
                                        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                                        <p className="font-medium text-gray-900">Drop PDFs or click</p>
                                        <p className="text-sm text-gray-500 mt-1">Resumes will be screened automatically</p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900">{uploadFiles.length}</p>
                                        <p className="text-sm text-gray-600 mt-1">
                                            file{uploadFiles.length !== 1 ? "s" : ""} ready
                                        </p>
                                    </div>
                                )}
                            </div>
                            {uploadFiles.length > 0 && (
                                <div className="flex gap-2">
                                    <Button
                                        onClick={handleUpload}
                                        disabled={uploadPhase === "uploading"}
                                        className="flex-1 bg-orange-600 hover:bg-orange-700"
                                    >
                                        Start Screening
                                    </Button>
                                    <Button
                                        onClick={() => setUploadFiles([])}
                                        variant="outline"
                                        className="flex-1"
                                    >
                                        Clear
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {uploadPhase === "processing" && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium text-gray-900">Processing</span>
                                    <span className="text-gray-600">
                                        {uploadProgress.processed} / {uploadProgress.total}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                                        style={{
                                            width: `${(uploadProgress.processed / uploadProgress.total) * 100}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {uploadPhase === "done" && (
                        <div className="text-center py-4">
                            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                            <p className="font-medium text-gray-900">
                                {uploadProgress.total} resume{uploadProgress.total !== 1 ? "s" : ""} screened
                            </p>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
