"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { reportClientError } from "@/lib/client-error-reporter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as RadixSlider from "@radix-ui/react-slider";
import {
    AlertCircle,
    ChevronDown,
    Target,
    UserX,
    MoreHorizontal,
    Lock,
    XCircle,
    RefreshCw,
    CheckSquare,
    Square,
    Trash2,
    Loader2,
    SlidersHorizontal,
    Send,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
function formatCandidateStatusLabel(value?: string) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (!normalized) return "Pending";
    if (normalized === "waiting") return "Waiting";
    if (normalized === "starting") return "Starting";
    if (normalized === "extracting") return "Extracting";
    if (normalized === "scoring") return "Scoring";
    if (normalized === "processing") return "Extracting";
    if (normalized === "failed") return "Failed";
    if (normalized === "pending") return "Pending";
    if (normalized === "scheduled") return "Scheduled";
    if (normalized === "launching") return "Launching";
    if (normalized === "progress" || normalized === "inprogress" || normalized === "in progress") return "In Progress";
    if (normalized === "no show" || normalized === "noshow") return "No Show";
    if (normalized === "finished" || normalized === "completed") return "Completed";
    if (normalized === "shortlisted") return "Shortlisted";
    if (normalized === "rejected") return "Rejected";
    if (normalized === "not shortlisted") return "Not Shortlisted";
    if (normalized === "not hired") return "Not Hired";
    if (normalized === "not qualified") return "Not Qualified";
    return normalized.replace(/\b\w/g, (ch) => ch.toUpperCase());
}
function normalizeStatusKey(value?: string) {
    return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
}
// Send is only offered while interview status is PENDING (not yet scheduled); SCHEDULED/COMPLETED/FAILED/NO_SHOW are all Resend only.
function isCandidateInterviewPending(candidate: any) {
    const status = normalizeStatusKey(candidate.interviewStatus);
    return !status || status === "pending";
}
function ScoreRangeFilter({
    min, max, onChange,
}: {
    min: number; max: number;
    onChange: (min: number, max: number) => void;
}) {
    const isFiltered = min > 0 || max < 100;
    return (
        <div className={cn(
            "flex items-center gap-1 h-9 px-3 rounded-xl border transition-all duration-200 bg-white",
            isFiltered ? "border-[#7C3AED] shadow-sm" : "border-gray-200 hover:border-gray-300"
        )}>
            <span className="text-[12px] font-bold tabular-nums w-5 text-right flex-shrink-0" style={{ color: isFiltered ? "#7C3AED" : "#9ca3af" }}>{min}</span>
            <RadixSlider.Root className="relative flex items-center flex-shrink-0" style={{ width: 100, height: 28 }} min={0} max={100} step={1} value={[min, max]} onValueChange={([lo, hi]) => onChange(lo, hi)} minStepsBetweenThumbs={1}>
                <RadixSlider.Track className="relative h-[3px] flex-1 rounded-full bg-gray-200">
                    <RadixSlider.Range className="absolute h-full rounded-full" style={{ background: "#7C3AED" }} />
                </RadixSlider.Track>
                <RadixSlider.Thumb className="block w-4 h-4 rounded-full bg-white border-2 border-[#7C3AED] shadow-sm cursor-grab focus:outline-none" aria-label="Min" />
                <RadixSlider.Thumb className="block w-4 h-4 rounded-full bg-white border-2 border-[#7C3AED] shadow-sm cursor-grab focus:outline-none" aria-label="Max" />
            </RadixSlider.Root>
            <span className="text-[12px] font-bold tabular-nums w-5 flex-shrink-0" style={{ color: isFiltered ? "#7C3AED" : "#9ca3af" }}>{max}</span>
        </div>
    );
}

function AtsScoreGauge({ score }: { score: number }) {
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;
    
    let color = "#10B981"; // Emerald for 80+
    let text = "Good Match";
    let subtext = "Top 40%"; // Placeholder for ranking
    
    if (score < 50) {
        color = "#EF4444"; // Red for < 50
        text = "Low Match";
    } else if (score < 80) {
        color = "#F59E0B"; // Amber for 50-79
        text = "Fair Match";
    }
    
    if (score === 0) {
        color = "#E5E7EB";
        text = "No Score";
        subtext = "-";
    }

    return (
        <div className="flex items-center gap-1.5">
            <div className="relative h-11 w-11 flex items-center justify-center shrink-0">
                {/* Background circle */}
                <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-100" />
                    {/* Foreground circle */}
                    {score > 0 && (
                        <circle cx="22" cy="22" r={radius} stroke={color} strokeWidth="4" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                    )}
                </svg>
                <span className="text-[12px] font-bold text-gray-900 absolute">{score > 0 ? score : "-"}</span>
            </div>
            <div className="flex flex-col">
                <span className="text-[13px] font-bold text-gray-900 leading-tight whitespace-nowrap">{text}</span>
                <span className="text-[11px] text-gray-400 font-semibold">{subtext}</span>
            </div>
        </div>
    );
}

export function JobCandidatesTable({ jobId, refreshKey }: { jobId: string, refreshKey?: number }) {
    const { candidates, pagination, isLoading, error, fetchCandidates, clearError } = useCandidates();
    const { organization } = useJobs();
    const [scoreMin, setScoreMin] = useState(0);
    const [scoreMax, setScoreMax] = useState(100);
    const [resumeFilter, setResumeFilter] = useState("all");
    const [interviewFilter, setInterviewFilter] = useState("all");
    const [timeline, setTimeline] = useState<DateRange>({ type: "all" });
    const [scoreSort, setScoreSort] = useState<"default" | "score_desc" | "score_asc">("default");
    const [pageSize, setPageSize] = useState(20);
    const [searchTerm, setSearchTerm] = useState("");
    const [sendingInterviewLinkId, setSendingInterviewLinkId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(true);
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [isJobViewReady, setIsJobViewReady] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        mode: "single" | "bulk";
        candidateId?: string;
        candidateName?: string;
    } | null>(null);
    const [resendConfirm, setResendConfirm] = useState<{ id: string; name: string } | null>(null);
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || organization?.status || "").trim().toUpperCase();
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const isInterviewActionBlocked = isSuspended || quotaLocked;
    const interviewActionBlockedMessage = getInterviewActionBlockedMessage(isSuspended);
    const getDateRange = () => {
        let startDate: string | undefined;
        let endDate: string | undefined;
        if (timeline.type === "today") { startDate = new Date().toISOString().split("T")[0]; endDate = startDate; }
        else if (timeline.type === "week") { const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "custom") { startDate = timeline.from; endDate = timeline.to; }
        return { startDate, endDate };
    };
    useEffect(() => {
        let cancelled = false;
        if (!isJobViewReady) setSelectedIds(new Set());
        const handler = setTimeout(() => {
            const { startDate, endDate } = getDateRange();
            void fetchCandidates(1, pageSize, jobId, resumeFilter, interviewFilter, startDate, endDate, undefined, scoreSort, { background: isJobViewReady })
                .finally(() => { if (!cancelled) setIsJobViewReady(true); });
        }, 500);
        return () => { cancelled = true; clearTimeout(handler); };
    }, [jobId, resumeFilter, interviewFilter, timeline, fetchCandidates, scoreSort, refreshKey]);
    const pageSizeRef = useRef(pageSize);
    useEffect(() => {
        if (pageSizeRef.current === pageSize) return;
        pageSizeRef.current = pageSize;
        const { startDate, endDate } = getDateRange();
        void fetchCandidates(1, pageSize, jobId, resumeFilter, interviewFilter, startDate, endDate, undefined, scoreSort);
    }, [pageSize]);
    const hasPendingCandidate = candidates.some((c: any) => {
        const s = String(c.resumeStatus || c.status || "").toLowerCase();
        return s === "extracting" || s === "scoring" || s === "waiting" || s === "processing" || s === "starting";
    });
    useEffect(() => {
        if (!hasPendingCandidate) return;
        const timer = setInterval(() => {
            const { startDate, endDate } = getDateRange();
            void fetchCandidates(pagination.page, pageSize, jobId, resumeFilter, interviewFilter, startDate, endDate, undefined, scoreSort, { background: true, force: true });
        }, 3000);
        return () => clearInterval(timer);
    }, [hasPendingCandidate, pagination.page, pageSize, jobId, resumeFilter, interviewFilter, scoreSort]);
    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > pagination.totalPages) return;
        let startDate: string | undefined;
        let endDate: string | undefined;
        if (timeline.type === "today") {
            startDate = new Date().toISOString().split("T")[0];
            endDate = startDate;
        } else if (timeline.type === "week") {
            const date = new Date();
            date.setDate(date.getDate() - 7);
            startDate = date.toISOString().split("T")[0];
        } else if (timeline.type === "month") {
            const date = new Date();
            date.setMonth(date.getMonth() - 1);
            startDate = date.toISOString().split("T")[0];
        } else if (timeline.type === "custom") {
            startDate = timeline.from;
            endDate = timeline.to;
        }
        fetchCandidates(newPage, pageSize, jobId, resumeFilter, interviewFilter, startDate, endDate, undefined, scoreSort);
    };
    const handleUpdateStatus = async (applicationId: string, statusUpdate: { resumeScreeningStatus?: string }, successMsg: string) => {
        try {
            const res = await fetch(`/api/candidates/${applicationId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(statusUpdate),
            });
            if (res.ok) {
                toast.success(successMsg);
                if (statusUpdate.resumeScreeningStatus === "shortlisted") {
                    fetch(`/api/candidates/${applicationId}/send-interview-link`, { method: "POST" })
                        .then((r) => r.ok && toast.success("Schedule link sent"))
                        .catch(() => {});
                } else if (statusUpdate.resumeScreeningStatus === "rejected") {
                    fetch(`/api/candidates/${applicationId}/send-rejection-email`, { method: "POST" })
                        .then((r) => r.ok && toast.success("Rejection email sent"))
                        .catch(() => {});
                }
                fetchCandidates(pagination.page, pageSize, jobId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
            } else {
                toast.error("Failed to update status");
            }
        } catch (error) {
            toast.error("Failed to update status");
            reportClientError(error, { action: "update_candidate_status" });
        }
    };
    const handleSendInterviewLink = async (candidate: { id: string; name: string; interviewStatus?: string }) => {
        if (isInterviewActionBlocked) {
            toast.error(interviewActionBlockedMessage);
            return;
        }
        try {
            setSendingInterviewLinkId(candidate.id);
            const res = await fetch(`/api/candidates/${candidate.id}/send-interview-link`, {
                method: "POST",
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                toast.success(data?.message || `Interview link sent to ${candidate.name}`);
                fetchCandidates(pagination.page, pageSize, jobId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
                return;
            }
            toast.error(data?.error || "Failed to send interview link");
        } catch (error) {
            toast.error("Failed to send interview link");
            reportClientError(error, { action: "send_interview_link" });
        } finally {
            setSendingInterviewLinkId(null);
        }
    };
    const filteredCandidates = candidates.filter((candidate: any) => {
        if (candidate.jobId !== jobId) return false;
        if (scoreMin > 0 || scoreMax < 100) {
            const score = Number(candidate.score ?? candidate.aiScore ?? 0);
            if (score < scoreMin || score > scoreMax) return false;
        }
        return true;
    });
    const selectedCount = selectedIds.size;
    const selectedOnPage = filteredCandidates.filter((candidate: any) => selectedIds.has(candidate.id));
    const isAllSelected = filteredCandidates.length > 0 && selectedOnPage.length === filteredCandidates.length;
    const toggleSelectAll = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (isAllSelected) {
                filteredCandidates.forEach((candidate: any) => next.delete(candidate.id));
            } else {
                filteredCandidates.forEach((candidate: any) => next.add(candidate.id));
            }
            return next;
        });
    };
    const toggleSelected = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const clearSelection = () => {
        setSelectedIds(new Set());
        setIsSelectionMode(true);
    };
    const handleBulkStatus = async (action: "reject" | "shortlist" | "delete") => {
        if (!selectedCount || isBulkLoading) return;
        const ids = Array.from(selectedIds);
        try {
            setIsBulkLoading(true);
            const res = await fetch("/api/candidates/bulk-action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, action }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                toast.success(data?.message || "Bulk action completed");
                if (action === "shortlist" || action === "reject") {
                    fetch("/api/candidates/bulk-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids, action }),
                    }).then((r) => r.ok && toast.success(action === "shortlist" ? `Schedule link sent to ${ids.length} candidate(s)` : `Rejection email sent to ${ids.length} candidate(s)`)).catch(() => {});
                }
                clearSelection();
                fetchCandidates(pagination.page, pageSize, jobId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
                return;
            }
            toast.error(data?.error || "Failed to update selected candidates");
        } catch (error) {
            toast.error("Failed to update selected candidates");
            reportClientError(error, { action: "bulk_update_candidates" });
        } finally {
            setIsBulkLoading(false);
        }
    };
    const handleDeleteConfirmed = async () => {
        if (!deleteConfirm) return;
        setIsBulkLoading(true);
        try {
            if (deleteConfirm.mode === "single" && deleteConfirm.candidateId) {
                const res = await fetch(`/api/candidates/${deleteConfirm.candidateId}`, { method: "DELETE" });
                if (res.ok) {
                    toast.success(`${deleteConfirm.candidateName || "Candidate"} deleted`);
                    fetchCandidates(pagination.page, pageSize, jobId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
                } else {
                    const data = await res.json().catch(() => null);
                    toast.error(data?.error || "Failed to delete candidate");
                }
            } else if (deleteConfirm.mode === "bulk") {
                await handleBulkStatus("delete");
            }
        } catch (error) {
            toast.error("Failed to delete candidate");
            reportClientError(error, { action: "delete_candidate" });
        } finally {
            setIsBulkLoading(false);
            setDeleteConfirm(null);
        }
    };
    // Bulk SEND: only sends to candidates who have NOT received the link yet
    const handleBulkSendInterviewLink = async () => {
        if (!selectedCount || isBulkLoading) return;
        if (isInterviewActionBlocked) {
            toast.error(interviewActionBlockedMessage);
            return;
        }
        const unsentIds = filteredCandidates
            .filter((c: any) => selectedIds.has(c.id) && isCandidateInterviewPending(c))
            .map((c: any) => c.id);
        if (unsentIds.length === 0) {
            toast.error("All selected candidates have already received the invite link.");
            return;
        }
        try {
            setIsBulkLoading(true);
            const results = await Promise.all(
                unsentIds.map((id: string) =>
                    fetch(`/api/candidates/${id}/send-interview-link`, { method: "POST" })
                )
            );
            const failed = results.filter((result) => !result.ok).length;
            const succeeded = results.length - failed;
            if (succeeded > 0) toast.success(`Schedule link sent to ${succeeded} candidate(s)`);
            if (failed > 0) toast.error(`Failed to send to ${failed} candidate(s)`);
            clearSelection();
            fetchCandidates(pagination.page, pageSize, jobId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
        } catch (error) {
            toast.error("Failed to send interview links");
            reportClientError(error, { action: "bulk_send_interview_link" });
        } finally {
            setIsBulkLoading(false);
        }
    };
    // Bulk RESEND: only resends to candidates who HAVE already received the link
    const handleBulkResendInterviewLink = async () => {
        if (!selectedCount || isBulkLoading) return;
        if (isInterviewActionBlocked) {
            toast.error(interviewActionBlockedMessage);
            return;
        }
        const sentIds = filteredCandidates
            .filter((c: any) => selectedIds.has(c.id) && !isCandidateInterviewPending(c))
            .map((c: any) => c.id);
        if (sentIds.length === 0) {
            toast.error("No selected candidates have been sent the link yet.");
            return;
        }
        try {
            setIsBulkLoading(true);
            const results = await Promise.all(
                sentIds.map((id: string) =>
                    fetch(`/api/candidates/${id}/send-interview-link`, { method: "POST" })
                )
            );
            const failed = results.filter((result) => !result.ok).length;
            const succeeded = results.length - failed;
            if (succeeded > 0) toast.success(`Schedule link resent to ${succeeded} candidate(s)`);
            if (failed > 0) toast.error(`Failed to resend to ${failed} candidate(s)`);
            clearSelection();
            fetchCandidates(pagination.page, pageSize, jobId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
        } catch (error) {
            toast.error("Failed to resend interview links");
            reportClientError(error, { action: "bulk_resend_interview_link" });
        } finally {
            setIsBulkLoading(false);
        }
    };
    // Single RESEND confirmed via Yes/No dialog
    const handleResendConfirmed = async () => {
        if (!resendConfirm) return;
        if (isInterviewActionBlocked) { toast.error(interviewActionBlockedMessage); setResendConfirm(null); return; }
        try {
            setSendingInterviewLinkId(resendConfirm.id);
            const res = await fetch(`/api/candidates/${resendConfirm.id}/send-interview-link`, { method: "POST" });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                toast.success(data?.message || `Schedule link resent to ${resendConfirm.name}`);
                fetchCandidates(pagination.page, pageSize, jobId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
            } else {
                toast.error(data?.error || "Failed to resend interview link");
            }
        } catch (error) {
            toast.error("Failed to resend interview link");
            reportClientError(error, { action: "resend_interview_link" });
        }
        finally { setSendingInterviewLinkId(null); setResendConfirm(null); }
    };
    if (!isJobViewReady) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <div className="flex flex-col items-center gap-1.5">
                    <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">
                        Loading job candidates...
                    </p>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-col flex-1 min-h-0 w-full h-full">
            {/* ── Filter rows ── */}
            {/* Row 1: Flat screenshot style filters */}
            <div className="flex items-center justify-between gap-1.5 px-6 py-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar pb-1 -mb-1">
                    {/* Search Input */}
                    <div className="relative w-[180px] lg:w-[240px] shrink-0">
                        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>
                        <input
                            type="text"
                            placeholder="Search candidates by name, email or skills..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-9 pl-10 pr-4 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-600 placeholder-gray-400 focus:outline-none focus:border-violet-400 transition-colors shadow-sm"
                        />
                    </div>
                    
                    {/* Status filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1 h-9 px-3.5 rounded-xl text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 hover:border-gray-300 shadow-sm transition-colors">
                                Resume {resumeFilter !== "all" && <span className="bg-violet-100 text-violet-700 text-[10px] px-1.5 py-0.5 rounded-md ml-1">{resumeFilter}</span>}
                                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44 p-1.5 rounded-xl shadow-lg border-gray-100 bg-white">
                            <DropdownMenuLabel className="px-3 py-0.5.5 text-[9px] font-black uppercase tracking-widest text-gray-400">Resume Status</DropdownMenuLabel>
                            {[
                                { value: "all", label: "All" },
                                { value: "shortlisted", label: "Shortlisted" },
                                { value: "rejected", label: "Rejected" },
                                { value: "pending", label: "Pending" },
                            ].map(opt => (
                                <DropdownMenuItem key={opt.value} onClick={() => setResumeFilter(opt.value)} className="rounded-lg px-3 py-2 text-[12px] font-semibold cursor-pointer">{opt.label}</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Interview filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1 h-9 px-3.5 rounded-xl text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 hover:border-gray-300 shadow-sm transition-colors">
                                Interview {interviewFilter !== "all" && <span className="bg-violet-100 text-violet-700 text-[10px] px-1.5 py-0.5 rounded-md ml-1">{interviewFilter}</span>}
                                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44 p-1.5 rounded-xl shadow-lg border-gray-100 bg-white">
                            <DropdownMenuLabel className="px-3 py-0.5.5 text-[9px] font-black uppercase tracking-widest text-gray-400">Interview Status</DropdownMenuLabel>
                            {[
                                { value: "all", label: "All" },
                                { value: "pending", label: "Pending" },
                                { value: "inprogress", label: "In Progress" },
                                { value: "completed", label: "Completed" },
                            ].map(opt => (
                                <DropdownMenuItem key={opt.value} onClick={() => setInterviewFilter(opt.value)} className="rounded-lg px-3 py-2 text-[12px] font-semibold cursor-pointer">{opt.label}</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Resume Score filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1 h-9 px-3.5 rounded-xl text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 hover:border-gray-300 shadow-sm transition-colors">
                                Score {(scoreMin > 0 || scoreMax < 100) && <span className="bg-violet-100 text-violet-700 text-[10px] px-1.5 py-0.5 rounded-md ml-1">{scoreMin}-{scoreMax}</span>}
                                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64 p-3 rounded-xl shadow-lg border-gray-100 bg-white">
                            <ScoreRangeFilter min={scoreMin} max={scoreMax} onChange={(lo, hi) => { setScoreMin(lo); setScoreMax(hi); }} />
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Date filter */}
                    <DateFilter value={timeline} onChange={setTimeline} />

                    {/* Clear Button */}
                    {(searchTerm || resumeFilter !== "all" || interviewFilter !== "all" || timeline.type !== "all" || scoreMin > 0 || scoreMax < 100) && (
                        <button 
                            onClick={() => {
                                setSearchTerm(""); setResumeFilter("all"); setInterviewFilter("all"); setTimeline({ type: "all" }); setScoreMin(0); setScoreMax(100);
                            }}
                            className="text-[13px] font-semibold text-gray-500 hover:text-gray-800 transition-colors px-2"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Bulk actions inline */}
                <div className="flex items-center gap-1 shrink-0 border-l border-gray-200 pl-4">
                    <span className={cn("text-[12px] font-semibold mr-1 transition-colors hidden xl:block", selectedCount > 0 ? "text-blue-700" : "text-gray-400")}>
                        {selectedCount > 0 ? `${selectedCount} selected` : "Select for bulk:"}
                    </span>
                    <button onClick={() => handleBulkStatus("shortlist")} disabled={selectedCount === 0 || isBulkLoading}
                        className={cn("h-8 px-2.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                            selectedCount > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-gray-100 text-gray-400 border-gray-200")}>
                        <Target className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Shortlist</span>
                    </button>
                    <button onClick={() => handleBulkStatus("reject")} disabled={selectedCount === 0 || isBulkLoading}
                        className={cn("h-8 px-2.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                            selectedCount > 0 ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" : "bg-gray-100 text-gray-400 border-gray-200")}>
                        <UserX className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Reject</span>
                    </button>
                    {/* Bulk Send: only sends to candidates whose interview status is still pending */}
                    <button
                        onClick={isInterviewActionBlocked ? undefined : handleBulkSendInterviewLink}
                        disabled={selectedCount === 0 || isBulkLoading}
                        title={isInterviewActionBlocked ? interviewActionBlockedMessage : "Sends only to candidates who haven't received the link yet"}
                        className={cn("h-8 px-2.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                            selectedCount === 0 ? "bg-gray-100 text-gray-400 border-gray-200" : isInterviewActionBlocked ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100")}>
                        {isInterviewActionBlocked ? <Lock className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} <span className="hidden xl:inline">Bulk Send</span>
                    </button>
                    {/* Bulk Resend: only resends to candidates who already received the link */}
                    <button
                        onClick={isInterviewActionBlocked ? undefined : handleBulkResendInterviewLink}
                        disabled={selectedCount === 0 || isBulkLoading}
                        title={isInterviewActionBlocked ? interviewActionBlockedMessage : "Resends only to candidates who already received the link"}
                        className={cn("h-8 px-2.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                            selectedCount === 0 ? "bg-gray-100 text-gray-400 border-gray-200" : isInterviewActionBlocked ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100")}>
                        {isInterviewActionBlocked ? <Lock className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} <span className="hidden xl:inline">Bulk Resend</span>
                    </button>
                    <button onClick={() => setDeleteConfirm({ mode: "bulk" })} disabled={selectedCount === 0 || isBulkLoading}
                        className={cn("h-8 px-2.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                            selectedCount > 0 ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" : "bg-gray-100 text-gray-400 border-gray-200")}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
            
            {error && (
                <div className="mx-6 my-3 flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                    <div className="flex items-center gap-1"><AlertCircle className="h-4 w-4 text-red-500" /><span className="text-[12px] font-semibold text-red-700">Sync Error: {error}</span></div>
                    <button onClick={clearError}><XCircle className="h-4 w-4 text-red-400 hover:text-red-600" /></button>
                </div>
            )}
            {/* ── Table — flat screenshot style ── */}
            <div className="overflow-x-auto flex-1 flex flex-col min-h-0">
                <div className="relative w-full overflow-auto flex-1">
                    <Table>
                        <TableHeader className="bg-gray-50/80 sticky top-0 z-10">
                            <TableRow className="border-b border-gray-100 hover:bg-transparent">
                                {isSelectionMode && (
                                    <TableHead className="w-10 px-4">
                                        <button type="button" onClick={toggleSelectAll} className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:text-blue-600 transition-colors">
                                            {isAllSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                        </button>
                                    </TableHead>
                                )}
                                <TableHead className="px-6 py-4 text-[12px] font-black uppercase tracking-widest text-gray-400">CANDIDATE</TableHead>
                                <TableHead className="px-4 py-4 min-w-[160px] w-[160px] text-[12px] font-black uppercase tracking-widest text-gray-400">
                                    <div className="flex items-center gap-1 cursor-pointer hover:text-gray-600 transition-colors">
                                        RESUME SCORE <ChevronDown className="h-3.5 w-3.5" />
                                    </div>
                                </TableHead>
                                <TableHead className="px-4 py-4 text-[12px] font-black uppercase tracking-widest text-gray-400">RESUME STATUS</TableHead>
                                <TableHead className="px-4 py-4 text-[12px] font-black uppercase tracking-widest text-gray-400">INTERVIEW</TableHead>
                                <TableHead className="px-4 py-4 text-[12px] font-black uppercase tracking-widest text-gray-400 text-center">REPORTS</TableHead>
                                <TableHead className="px-4 py-4 text-[12px] font-black uppercase tracking-widest text-gray-400 text-right">ACTIONS</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0">
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 10 : 9} className="py-0.52 text-center text-xs font-bold text-gray-400">
                                        Loading candidates...
                                    </TableCell>
                                </TableRow>
                            ) : filteredCandidates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 10 : 9} className="py-0.52 text-center text-xs font-bold text-gray-400">
                                        No candidates found for this job
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCandidates.map((candidate: any) => {
                                    const displayName = candidate.fullName || candidate.name || "Unknown Candidate";
                                    const displayEmail = candidate.email || "";
                                    const statusValue = candidate.resumeStatus || candidate.status;
                                    const statusKey = normalizeStatusKey(statusValue) || "pending";
                                    const statusLabel = formatCandidateStatusLabel(statusValue);
                                    const isWaiting = statusKey === "waiting";
                                    const isExtracting = statusKey === "extracting" || statusKey === "scoring" || statusKey === "starting" || statusKey === "waiting" || statusKey === "processing";
                                    const isProcessing = isExtracting;
                                    const isFailed = statusKey === "failed";
                                    const interviewStatusValue = candidate.interviewStatus;
                                    const interviewStatusKey = normalizeStatusKey(interviewStatusValue) || "pending";
                                    const interviewStatusLabel = formatCandidateStatusLabel(interviewStatusValue);
                                    const interviewReportUnlocked =
                                        interviewStatusKey === "completed" ||
                                        interviewStatusKey === "finished";
                                    const score = Number(candidate.score ?? candidate.aiScore ?? 0);
                                    const stageLabelRaw = String(candidate.screeningStage || "").trim().toLowerCase();
                                    const stageLabel = stageLabelRaw === "extracting" ? "Extracting" : stageLabelRaw === "scoring" ? "Scoring" : stageLabelRaw === "finalizing" ? "Finalizing" : isWaiting ? "Waiting" : isProcessing ? "Processing" : "";
                                    // True once interview status has moved past PENDING (scheduled/completed/failed/no-show)
                                    const hasSentInvite = !isCandidateInterviewPending(candidate);
                                    return (
                                        <TableRow
                                            key={candidate.id}
                                            onClick={() => isSelectionMode && toggleSelected(candidate.id)}
                                            className={cn(
                                                "group border-b border-gray-100 hover:bg-gray-50/60 transition-colors",
                                                isSelectionMode && "cursor-pointer",
                                                selectedIds.has(candidate.id) && "bg-blue-50/40"
                                            )}
                                        >
                                            {isSelectionMode && (
                                                <TableCell className="px-4 py-0.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        onClick={(e) => e.stopPropagation()}
                                                        checked={selectedIds.has(candidate.id)}
                                                        onCheckedChange={() => toggleSelected(candidate.id)}
                                                        aria-label={`Select ${displayName}`}
                                                    />
                                                </TableCell>
                                            )}
                                            {/* Candidate Column */}
                                            <TableCell className="px-6 py-0.5">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-5 w-5 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-[12px] font-black text-gray-500 shrink-0 uppercase">
                                                        {displayName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1">
                                                            <p className="text-[14px] font-bold text-gray-900 leading-tight">{displayName}</p>
                                                            {score >= 80 && <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-violet-100 text-violet-700">Top Match</span>}
                                                        </div>
                                                        <p className="text-[12px] text-gray-500 mt-0.5 truncate max-w-[200px]">{displayEmail}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            
                                            {/* ATS Score Column */}
                                            <TableCell className="px-4 py-0.5" onClick={(e) => e.stopPropagation()}>
                                                {isExtracting ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                                                        <div>
                                                            <p className="text-[13px] font-bold text-gray-900 leading-tight">Extracting...</p>
                                                            <p className="text-[11px] text-gray-400 font-semibold">Parsing Resume</p>
                                                        </div>
                                                    </div>
                                                ) : isFailed ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <XCircle className="h-8 w-8 text-rose-500" />
                                                        <div>
                                                            <p className="text-[13px] font-bold text-rose-600 leading-tight">Failed</p>
                                                            <p className="text-[11px] text-rose-400 font-semibold">Error processing</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <AtsScoreGauge score={score} />
                                                )}
                                            </TableCell>
                                            
                                            {/* Status Column */}
                                            <TableCell className="px-4 py-0.5" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-1">
                                                    <span className={cn(
                                                        "inline-flex items-center px-3 py-0.5 rounded-full text-[12px] font-bold",
                                                        isExtracting ? "bg-violet-100 text-violet-700" :
                                                        isFailed ? "bg-rose-100 text-rose-700" :
                                                        statusKey === "rejected" ? "bg-rose-100 text-rose-700" :
                                                        statusKey === "shortlisted" ? "bg-emerald-100 text-emerald-700" :
                                                        "bg-amber-100 text-amber-700"
                                                    )}>
                                                        {statusKey === "extracting" ? "Extracting" :
                                                         statusKey === "scoring" ? "Scoring" :
                                                         isProcessing ? (stageLabel || "Processing") :
                                                         statusKey === "rejected" ? "Rejected" :
                                                         statusKey === "shortlisted" ? "Shortlisted" :
                                                         "Under Review"}
                                                    </span>
                                                    {statusKey === "shortlisted" && (
                                                        <button onClick={() => handleUpdateStatus(candidate.id, { resumeScreeningStatus: "rejected" }, `${displayName} rejected`)} className="h-6 w-6 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-rose-600 transition-colors" title="Reject">
                                                            <UserX className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                    {statusKey !== "shortlisted" && statusKey !== "rejected" && !isProcessing && (
                                                        <button onClick={() => handleUpdateStatus(candidate.id, { resumeScreeningStatus: "shortlisted" }, `${displayName} shortlisted`)} className="h-6 w-6 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-emerald-600 transition-colors" title="Shortlist">
                                                            <Target className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </TableCell>
                                            
                                            {/* Interview Column */}
                                            <TableCell className="px-4 py-0.5" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1">
                                                        <div className={cn("h-2 w-2 rounded-full shrink-0",
                                                            interviewStatusKey === "completed" || interviewStatusKey === "finished" ? "bg-emerald-500" :
                                                            interviewStatusKey === "launching" || interviewStatusKey === "progress" || interviewStatusKey === "in progress" || interviewStatusKey === "inprogress" ? "bg-blue-500" :
                                                            interviewStatusKey === "scheduled" ? "bg-amber-500" :
                                                            interviewStatusKey === "no show" || interviewStatusKey === "noshow" ? "bg-orange-500" :
                                                            interviewStatusKey === "failed" ? "bg-red-500" : "bg-gray-300"
                                                        )} />
                                                        <span className={cn("text-[13px] font-bold",
                                                            interviewStatusKey === "completed" || interviewStatusKey === "finished" ? "text-emerald-700" :
                                                            interviewStatusKey === "launching" || interviewStatusKey === "progress" || interviewStatusKey === "in progress" || interviewStatusKey === "inprogress" ? "text-blue-700" :
                                                            interviewStatusKey === "scheduled" ? "text-amber-700" :
                                                            interviewStatusKey === "no show" || interviewStatusKey === "noshow" ? "text-orange-700" :
                                                            interviewStatusKey === "failed" ? "text-red-700" : "text-gray-500"
                                                        )}>
                                                            {interviewStatusKey === "completed" || interviewStatusKey === "finished" ? "Completed" :
                                                             interviewStatusKey === "launching" ? "Launching" :
                                                             interviewStatusKey === "progress" || interviewStatusKey === "in progress" || interviewStatusKey === "inprogress" ? "In Progress" :
                                                             interviewStatusKey === "scheduled" ? "Scheduled" :
                                                             interviewStatusKey === "no show" || interviewStatusKey === "noshow" ? "No Show" :
                                                             interviewStatusKey === "failed" ? "Failed" : "Not Scheduled"}
                                                        </span>
                                                    </div>
                                                    {(interviewStatusKey === "completed" || interviewStatusKey === "finished") && (
                                                        <span className="text-[11px] font-semibold text-gray-400 ml-[16px]">
                                                            {candidate.interview?.interviewCompletedAt
                                                                ? new Date(candidate.interview.interviewCompletedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
                                                                : "Today"}
                                                        </span>
                                                    )}
                                                    {candidate.interview?.isTestSession && (
                                                        <span className="ml-[16px] text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#B45309" }}>
                                                            TEST
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            
                                            {/* Reports Column */}
                                            <TableCell className="px-4 py-0.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1">
                                                    {isWaiting || isProcessing ? (
                                                        <div className="flex items-center gap-1 px-3 py-0.5.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed">
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            <span className="text-[12px] font-bold">Resume Report</span>
                                                        </div>
                                                    ) : isFailed ? (
                                                        <div className="flex items-center gap-1 px-3 py-0.5.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed">
                                                            <XCircle className="h-3.5 w-3.5" />
                                                            <span className="text-[12px] font-bold">Resume Report</span>
                                                        </div>
                                                    ) : (
                                                        <Link href={`/admin/candidates/${candidate.id}?report=resume&back=${encodeURIComponent(`/admin/candidates/job/${jobId}`)}`} className="flex items-center gap-1 px-3 py-0.5.5 rounded-xl border border-[#7C3AED]/30 bg-violet-50 text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white transition-colors cursor-pointer group/btn">
                                                            <svg className="h-3.5 w-3.5 opacity-70 group-hover/btn:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                                            <span className="text-[12px] font-bold">Resume Report</span>
                                                        </Link>
                                                    )}

                                                    {interviewReportUnlocked ? (
                                                        <Link href={`/admin/candidates/${candidate.id}?back=${encodeURIComponent(`/admin/candidates/job/${jobId}`)}`} className="flex items-center gap-1 px-3 py-0.5.5 rounded-xl border border-emerald-500/30 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors cursor-pointer group/btn">
                                                            <svg className="h-3.5 w-3.5 opacity-70 group-hover/btn:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                                            <span className="text-[12px] font-bold">Interview Report</span>
                                                        </Link>
                                                    ) : (
                                                        <div className="flex items-center gap-1 px-3 py-0.5.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed">
                                                            <Lock className="h-3.5 w-3.5 opacity-70" />
                                                            <span className="text-[12px] font-bold">Interview Report</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>

                                            <TableCell className="px-4 py-0.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu modal={false}>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="h-5 w-5 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        align="end"
                                                        side="bottom"
                                                        sideOffset={6}
                                                        collisionPadding={12}
                                                        className="w-56 p-1.5 rounded-xl shadow-lg border-gray-100 bg-white"
                                                    >
                                                        <DropdownMenuLabel className="px-2.5 py-0.5.5 text-[9px] font-black uppercase tracking-widest text-gray-400">Shortlist</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeScreeningStatus: "shortlisted" }, `${displayName} shortlisted`)} className="rounded-xl px-2.5 py-2 text-sm font-semibold text-emerald-600 cursor-pointer transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:text-emerald-700 focus:bg-emerald-50 data-[highlighted]:bg-emerald-50 data-[highlighted]:text-emerald-700">
                                                            <Target className="h-4 w-4 mr-2 shrink-0" />
                                                            Shortlist
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeScreeningStatus: "rejected" }, `${displayName} rejected`)} className="rounded-xl px-2.5 py-2 text-sm font-semibold text-rose-600 cursor-pointer transition-colors hover:bg-rose-50 hover:text-rose-700 focus:text-rose-700 focus:bg-rose-50 data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-700">
                                                            <UserX className="h-4 w-4 mr-2 shrink-0" />
                                                            Reject
                                                        </DropdownMenuItem>
                                                        <>
                                                            <DropdownMenuLabel className="px-2.5 py-0.5.5 text-[9px] font-black uppercase tracking-widest text-gray-400">Manage</DropdownMenuLabel>
                                                            {/* Interview link: Send (first time) OR Resend (with confirmation) - never both */}
                                                            {!hasSentInvite ? (
                                                                // --- FIRST TIME SEND ---
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        if (isInterviewActionBlocked) {
                                                                            toast.error(interviewActionBlockedMessage);
                                                                            return;
                                                                        }
                                                                        handleSendInterviewLink({ id: candidate.id, name: displayName, interviewStatus: candidate.interviewStatus });
                                                                    }}
                                                                    disabled={sendingInterviewLinkId === candidate.id}
                                                                    className={cn(
                                                                        "rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer transition-colors",
                                                                        isInterviewActionBlocked
                                                                            ? "text-gray-400 opacity-70"
                                                                            : "text-violet-600 focus:text-violet-700 focus:bg-violet-50"
                                                                    )}
                                                                    title={isInterviewActionBlocked ? interviewActionBlockedMessage : "Send the interview schedule link for the first time"}
                                                                >
                                                                    {isInterviewActionBlocked ? <Lock className="h-4 w-4 mr-2 shrink-0" /> : <Send className={cn("h-4 w-4 mr-2 shrink-0", sendingInterviewLinkId === candidate.id && "animate-pulse")} />}
                                                                    {sendingInterviewLinkId === candidate.id ? "Sending..." : "Send Schedule Link"}
                                                                </DropdownMenuItem>
                                                            ) : (
                                                                // --- RESEND (already sent) → requires Yes/No confirmation ---
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        if (isInterviewActionBlocked) {
                                                                            toast.error(interviewActionBlockedMessage);
                                                                            return;
                                                                        }
                                                                        setResendConfirm({ id: candidate.id, name: displayName });
                                                                    }}
                                                                    disabled={sendingInterviewLinkId === candidate.id}
                                                                    className={cn(
                                                                        "rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer transition-colors",
                                                                        isInterviewActionBlocked
                                                                            ? "text-gray-400 opacity-70"
                                                                            : "text-amber-600 focus:text-amber-700 focus:bg-amber-50"
                                                                    )}
                                                                    title={isInterviewActionBlocked ? interviewActionBlockedMessage : "Resend the schedule link (candidate already received one)"}
                                                                >
                                                                    {isInterviewActionBlocked ? <Lock className="h-4 w-4 mr-2 shrink-0" /> : <RefreshCw className={cn("h-4 w-4 mr-2 shrink-0", sendingInterviewLinkId === candidate.id && "animate-spin")} />}
                                                                    {sendingInterviewLinkId === candidate.id ? "Sending..." : "Resend Schedule Link"}
                                                                </DropdownMenuItem>
                                                            )}
                                                        </>
                                                        <DropdownMenuItem
                                                            onClick={() => setDeleteConfirm({ mode: "single", candidateId: candidate.id, candidateName: displayName })}
                                                            className="rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer text-gray-600 focus:text-gray-900 focus:bg-gray-50 transition-colors"
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2 shrink-0" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
            {/* ── Pagination — flat style ── */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-wrap gap-1.5 bg-white">
                <p className="text-[13px] font-semibold text-gray-500">
                    Showing <span className="text-gray-900 font-bold">{pagination.total > 0 ? (pagination.page - 1) * pageSize + 1 : 0}</span>–<span className="text-gray-900 font-bold">{Math.min(pagination.page * pageSize, pagination.total)}</span> of <span className="text-gray-900 font-bold">{pagination.total}</span>
                </p>
                <div className="flex items-center gap-1.5">
                    <Select value={String(pageSize)} onValueChange={(v) => { const n = Number(v); setPageSize(n); clearSelection(); fetchCandidates(1, n, jobId, resumeFilter, interviewFilter, undefined, undefined, undefined, scoreSort); }}>
                        <SelectTrigger className="h-8 w-28 rounded-xl border border-gray-200 bg-white text-[13px] font-bold text-gray-600 shadow-sm hover:border-gray-300 transition-colors"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl border-gray-100 shadow-lg">{[20, 50, 100, 250, 500, 1000].map(o => <SelectItem key={o} value={String(o)} className="rounded-lg font-semibold text-[13px]">{o} / page</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="flex gap-1.5">
                        <button disabled={pagination.page <= 1 || isLoading} onClick={() => handlePageChange(pagination.page - 1)} className="h-8 px-3 rounded-xl border border-gray-200 bg-white text-[13px] font-bold text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 transition-colors">Previous</button>
                        <button disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => handlePageChange(pagination.page + 1)} className="h-8 px-3 rounded-xl border border-gray-200 bg-white text-[13px] font-bold text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 transition-colors">Next</button>
                    </div>
                </div>
            </div>
            {/* Resend Confirmation Modal */}
            {resendConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-6 pt-6 pb-4">
                            <h2 className="text-lg font-black text-gray-900 tracking-tight">Resend Schedule Link?</h2>
                            <p className="mt-2 text-sm text-gray-600">
                                <span className="font-bold">{resendConfirm.name}</span> has already received the schedule link. Are you sure you want to send it again?
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                            <button onClick={() => setResendConfirm(null)} className="h-10 px-5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">No, Cancel</button>
                            <button onClick={handleResendConfirmed} disabled={sendingInterviewLinkId === resendConfirm.id}
                                className="h-10 px-6 rounded-2xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors disabled:opacity-60">
                                {sendingInterviewLinkId === resendConfirm.id ? "Sending..." : "Yes, Resend"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {deleteConfirm && (() => {
                const isBulk = deleteConfirm.mode === "bulk";
                const deleteCount = isBulk ? selectedCount : 1;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="px-6 pt-6 pb-4">
                                <h2 className="text-lg font-black text-gray-900 tracking-tight">Confirm Delete</h2>
                                <p className="mt-2 text-sm text-gray-600">
                                    {isBulk
                                        ? <>Delete <span className="font-bold text-rose-700">{deleteCount} selected candidate(s)</span>? This cannot be undone.</>
                                        : <>Delete <span className="font-bold text-rose-700">{deleteConfirm.candidateName}</span>? This cannot be undone.</>}
                                </p>
                            </div>
                            <div className="flex items-center justify-end gap-1.5 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                                <button onClick={() => setDeleteConfirm(null)} className="h-10 px-5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteConfirmed}
                                    disabled={isBulkLoading}
                                    className="h-10 px-6 rounded-2xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors disabled:opacity-60"
                                >
                                    {isBulkLoading ? "Deleting..." : "Delete"}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
