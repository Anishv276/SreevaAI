"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertCircle,
    Mail,
    Search,
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
    if (normalized === "inprogress" || normalized === "in progress") return "In Progress";
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
export function DriveCandidatesTable({ driveId, refreshKey }: { driveId: string, refreshKey?: number }) {
    const { candidates, pagination, isLoading, error, fetchCandidates, clearError } = useCandidates();
    const { organization } = useJobs();
    const [searchTerm, setSearchTerm] = useState("");
    const [resumeFilter, setResumeFilter] = useState("all");
    const [interviewFilter, setInterviewFilter] = useState("all");
    const [timeline, setTimeline] = useState<DateRange>({ type: "all" });
    const [scoreSort, setScoreSort] = useState<"default" | "score_desc" | "score_asc">("default");
    const [pageSize, setPageSize] = useState(20);
    const [sendingInterviewLinkId, setSendingInterviewLinkId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(true);
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [isDriveViewReady, setIsDriveViewReady] = useState(false);
    const [emailConfirm, setEmailConfirm] = useState<{
        mode: "single" | "bulk";
        candidateId?: string;
        candidateName?: string;
        resumeStatus?: string;
    } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        mode: "single" | "bulk";
        candidateId?: string;
        candidateName?: string;
    } | null>(null);
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
        if (!isDriveViewReady) setSelectedIds(new Set());
        const handler = setTimeout(() => {
            const { startDate, endDate } = getDateRange();
            void fetchCandidates(1, pageSize, driveId, resumeFilter, interviewFilter, startDate, endDate, searchTerm, scoreSort, { background: isDriveViewReady })
                .finally(() => { if (!cancelled) setIsDriveViewReady(true); });
        }, 500);
        return () => { cancelled = true; clearTimeout(handler); };
    }, [driveId, resumeFilter, interviewFilter, timeline, searchTerm, fetchCandidates, scoreSort, refreshKey]);
    const pageSizeRef = useRef(pageSize);
    useEffect(() => {
        if (pageSizeRef.current === pageSize) return;
        pageSizeRef.current = pageSize;
        const { startDate, endDate } = getDateRange();
        void fetchCandidates(1, pageSize, driveId, resumeFilter, interviewFilter, startDate, endDate, searchTerm, scoreSort);
    }, [pageSize]);
    useEffect(() => {
        const hasPending = candidates.some((c: any) => {
            const s = String(c.resumeStatus || c.status || "").toLowerCase();
            return s === "extracting" || s === "waiting" || s === "processing";
        });
        if (!hasPending) return;
        const timer = setInterval(() => {
            const { startDate, endDate } = getDateRange();
            void fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, startDate, endDate, searchTerm, scoreSort, { background: true, force: true });
        }, 3000);
        return () => clearInterval(timer);
    }, [candidates, pagination.page, pageSize, driveId, resumeFilter, interviewFilter, searchTerm, scoreSort]);
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
        fetchCandidates(newPage, pageSize, driveId, resumeFilter, interviewFilter, startDate, endDate, searchTerm, scoreSort);
    };
    const handleUpdateStatus = async (applicationId: string, statusUpdate: { resumeStatus?: string; hiringStatus?: string }, successMsg: string) => {
        try {
            const res = await fetch(`/api/candidates/${applicationId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(statusUpdate),
            });
            if (res.ok) {
                toast.success(successMsg);
                fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
            } else {
                toast.error("Failed to update status");
            }
        } catch {
            toast.error("Failed to update status");
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
                fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
                return;
            }
            toast.error(data?.error || "Failed to send interview link");
        } catch {
            toast.error("Failed to send interview link");
        } finally {
            setSendingInterviewLinkId(null);
        }
    };
    const filteredCandidates = candidates.filter((candidate: any) => candidate.driveId === driveId);
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
                clearSelection();
                fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
                return;
            }
            toast.error(data?.error || "Failed to update selected candidates");
        } catch {
            toast.error("Failed to update selected candidates");
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
                    fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
                } else {
                    const data = await res.json().catch(() => null);
                    toast.error(data?.error || "Failed to delete candidate");
                }
            } else if (deleteConfirm.mode === "bulk") {
                await handleBulkStatus("delete");
            }
        } catch {
            toast.error("Failed to delete candidate");
        } finally {
            setIsBulkLoading(false);
            setDeleteConfirm(null);
        }
    };
    const handleBulkSendInterviewLink = async () => {
        if (!selectedCount || isBulkLoading) return;
        if (isInterviewActionBlocked) {
            toast.error(interviewActionBlockedMessage);
            return;
        }
        try {
            setIsBulkLoading(true);
            const results = await Promise.all(
                Array.from(selectedIds).map((id) =>
                    fetch(`/api/candidates/${id}/send-interview-link`, { method: "POST" })
                )
            );
            const failed = results.filter((result) => !result.ok).length;
            const succeeded = results.length - failed;
            if (succeeded > 0) toast.success(`Interview link sent to ${succeeded} candidate(s)`);
            if (failed > 0) toast.error(`Failed to send to ${failed} candidate(s)`);
            clearSelection();
            fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
        } catch {
            toast.error("Failed to send interview links");
        } finally {
            setIsBulkLoading(false);
        }
    };
    const handleSendEmailConfirmed = async () => {
        if (!emailConfirm) return;
        if (isSuspended) {
            setEmailConfirm(null);
            return;
        }
        setIsBulkLoading(true);
        try {
            if (emailConfirm.mode === "single" && emailConfirm.candidateId) {
                const status = normalizeStatusKey(emailConfirm.resumeStatus);
                if (status === "shortlisted") {
                    const res = await fetch(`/api/candidates/${emailConfirm.candidateId}/send-interview-link`, { method: "POST" });
                    const data = await res.json().catch(() => null);
                    if (!res.ok) {
                        toast.error(data?.error || "Failed to send interview link");
                        return;
                    }
                    toast.success(`Schedule link sent to ${emailConfirm.candidateName}`);
                } else if (status === "rejected") {
                    const res = await fetch(`/api/candidates/${emailConfirm.candidateId}/send-rejection-email`, { method: "POST" });
                    const data = await res.json().catch(() => null);
                    if (!res.ok) { toast.error(data?.error || "Failed to send rejection email"); return; }
                    toast.success(`Rejection email sent to ${emailConfirm.candidateName}`);
                }
            } else if (emailConfirm.mode === "bulk") {
                const selected = filteredCandidates.filter((c: any) => selectedIds.has(c.id));
                const shortlisted = selected.filter((c: any) => normalizeStatusKey(c.status) === "shortlisted").map((c: any) => c.id);
                const rejected = selected.filter((c: any) => normalizeStatusKey(c.status) === "rejected").map((c: any) => c.id);
                const results = await Promise.all([
                    ...shortlisted.map((id: string) => fetch(`/api/candidates/${id}/send-interview-link`, { method: "POST" })),
                    ...(rejected.length ? [fetch("/api/candidates/bulk-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: rejected, emailType: "screening", targetAction: "reject" }),
                    })] : []),
                ]);
                const failed = results.filter((r) => !r.ok).length;
                const succeeded = results.length - failed;
                if (succeeded > 0) toast.success(`Emails sent to ${shortlisted.length + rejected.length} candidate(s)`);
                if (failed > 0) toast.error(`Failed to send to ${failed} candidate(s)`);
                clearSelection();
                fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort, { background: true, force: true });
            }
        } catch {
            toast.error("Failed to send email");
        } finally {
            setIsBulkLoading(false);
            setEmailConfirm(null);
        }
    };
    const openSendEmailConfirm = (candidate: { id: string; name: string; resumeStatus?: string }) => {
        if (isSuspended) {
            toast.error(interviewActionBlockedMessage);
            return;
        }
        const status = normalizeStatusKey(candidate.resumeStatus);
        if (status !== "shortlisted" && status !== "rejected") {
            toast.error("Candidate must be shortlisted or rejected to send an email.");
            return;
        }
        setEmailConfirm({ mode: "single", candidateId: candidate.id, candidateName: candidate.name, resumeStatus: candidate.resumeStatus });
    };
    const openBulkSendEmailConfirm = () => {
        if (!selectedCount) return;
        const selected = filteredCandidates.filter((c: any) => selectedIds.has(c.id));
        const shortlisted = selected.filter((c: any) => normalizeStatusKey(c.status) === "shortlisted").length;
        const rejected = selected.filter((c: any) => normalizeStatusKey(c.status) === "rejected").length;
        if (shortlisted === 0 && rejected === 0) {
            toast.error("No selected candidates are shortlisted or rejected.");
            return;
        }
        setEmailConfirm({ mode: "bulk" });
    };
    if (!isDriveViewReady) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">
                        Loading job candidates...
                    </p>
                </div>
            </div>
        );
    }
    return (
        <div>
            {/* ── Filter rows ── */}
            {/* Row 1: Shortlisted filter (ATS status) + Interview filter + Date + Search + Bulk actions */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-gray-100 flex-wrap">
                {/* Left: dropdown filters */}
                <div className="flex items-center gap-2 flex-wrap">

                    {/* Shortlisted status dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={cn(
                                "flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-bold transition-all border focus:outline-none",
                                resumeFilter !== "all"
                                    ? "bg-[#F97316] text-white border-[#F97316] shadow-sm"
                                    : "text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800 bg-white"
                            )}>
                                {resumeFilter === "all" ? "Shortlisted" :
                                    resumeFilter === "shortlisted" ? "Shortlisted" :
                                    resumeFilter === "rejected" ? "Rejected" :
                                    resumeFilter === "pending" ? "Pending" : "Shortlisted"}
                                {resumeFilter !== "all" && (
                                    <span className="bg-white/25 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                                        {pagination.total}
                                    </span>
                                )}
                                <ChevronDown className="h-3 w-3 ml-0.5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44 p-1.5 rounded-xl shadow-lg border-gray-100 bg-white">
                            <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">ATS Status</DropdownMenuLabel>
                            {[
                                { value: "all", label: "All Candidates" },
                                { value: "shortlisted", label: "Shortlisted" },
                                { value: "rejected", label: "Rejected" },
                                { value: "pending", label: "Pending" },
                            ].map(opt => (
                                <DropdownMenuItem key={opt.value} onClick={() => setResumeFilter(opt.value)}
                                    className={cn("rounded-lg px-3 py-2 text-[12px] font-semibold cursor-pointer flex items-center justify-between",
                                        resumeFilter === opt.value ? "text-[#F97316] bg-orange-50" : "text-gray-700"
                                    )}>
                                    {opt.label}
                                    {resumeFilter === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Interview status dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={cn(
                                "flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-bold transition-all border focus:outline-none",
                                interviewFilter !== "all"
                                    ? "bg-gray-800 text-white border-gray-800 shadow-sm"
                                    : "text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800 bg-white"
                            )}>
                                {interviewFilter === "all" ? "Interview" :
                                    interviewFilter === "pending" ? "Pending" :
                                    interviewFilter === "inprogress" ? "In Progress" :
                                    interviewFilter === "completed" ? "Completed" : "Interview"}
                                <ChevronDown className="h-3 w-3 ml-0.5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44 p-1.5 rounded-xl shadow-lg border-gray-100 bg-white">
                            <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Interview Status</DropdownMenuLabel>
                            {[
                                { value: "all", label: "All" },
                                { value: "pending", label: "Pending" },
                                { value: "inprogress", label: "In Progress" },
                                { value: "completed", label: "Completed" },
                            ].map(opt => (
                                <DropdownMenuItem key={opt.value} onClick={() => setInterviewFilter(opt.value)}
                                    className={cn("rounded-lg px-3 py-2 text-[12px] font-semibold cursor-pointer flex items-center justify-between",
                                        interviewFilter === opt.value ? "text-gray-900 bg-gray-100" : "text-gray-700"
                                    )}>
                                    {opt.label}
                                    {interviewFilter === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-gray-800" />}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Date filter */}
                    <DateFilter value={timeline} onChange={setTimeline} />
                </div>

                {/* Right: bulk actions + search */}
                <div className="flex items-center gap-2 flex-wrap">
                    {selectedCount > 0 && (<>
                        <button onClick={() => handleBulkStatus("shortlist")} disabled={isBulkLoading} className="h-8 px-3 rounded-full border border-emerald-200 bg-white text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 disabled:opacity-50 transition-colors"><Target className="h-3.5 w-3.5" /> Shortlist</button>
                        <button onClick={() => handleBulkStatus("reject")} disabled={isBulkLoading} className="h-8 px-3 rounded-full border border-rose-200 bg-white text-[12px] font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 disabled:opacity-50 transition-colors"><UserX className="h-3.5 w-3.5" /> Reject</button>
                        <button onClick={isSuspended ? undefined : openBulkSendEmailConfirm} disabled={isBulkLoading} className={cn("h-8 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors", isSuspended ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}>{isSuspended ? <Lock className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />} Email</button>
                        <button onClick={isInterviewActionBlocked ? undefined : handleBulkSendInterviewLink} disabled={isBulkLoading} className={cn("h-8 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors", isInterviewActionBlocked ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-orange-200 bg-white text-[#F97316] hover:bg-orange-50")}>{isInterviewActionBlocked ? <Lock className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Resend</button>
                        <button onClick={() => setDeleteConfirm({ mode: "bulk" })} disabled={isBulkLoading} className="h-8 px-3 rounded-full border border-red-200 bg-white text-[12px] font-semibold text-red-600 hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /> Delete ({selectedCount})</button>
                    </>)}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                        <Input placeholder="Search candidates..." className="pl-8 h-8 w-48 border-gray-200 rounded-full text-[12px] font-medium focus:border-orange-400 focus:ring-1 focus:ring-orange-200 bg-gray-50" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>
            </div>
            {error && (
                <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                    <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-500" /><span className="text-[12px] font-semibold text-red-700">Sync Error: {error}</span></div>
                    <button onClick={clearError}><XCircle className="h-4 w-4 text-red-400 hover:text-red-600" /></button>
                </div>
            )}
            {/* ── Table — flat screenshot style ── */}
            <div className="overflow-x-auto">
                <div className="relative w-full overflow-auto max-h-[80vh]">
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
                                <TableHead className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Candidate</TableHead>
                                <TableHead className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">
                                    <div className="flex items-center gap-1">Score
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:text-gray-600"><ChevronDown className="h-3 w-3" /></button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="center" className="w-40 p-1.5 rounded-xl shadow-lg border-gray-100 bg-white">
                                                <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Sort</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => setScoreSort("default")} className="rounded-lg px-2 py-1.5 text-[12px] font-semibold cursor-pointer">Normal</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setScoreSort("score_desc")} className="rounded-lg px-2 py-1.5 text-[12px] font-semibold cursor-pointer">Top scorers</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setScoreSort("score_asc")} className="rounded-lg px-2 py-1.5 text-[12px] font-semibold cursor-pointer">Lowest scorers</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </TableHead>
                                <TableHead className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">ATS Status</TableHead>
                                <TableHead className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Interview</TableHead>
                                <TableHead className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400 text-center">ATS Report</TableHead>
                                <TableHead className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400 text-center">Interview Report</TableHead>
                                <TableHead className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0">
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 10 : 9} className="py-12 text-center text-sm font-bold text-gray-400">
                                        Loading candidates...
                                    </TableCell>
                                </TableRow>
                            ) : filteredCandidates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 10 : 9} className="py-12 text-center text-sm font-bold text-gray-400">
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
                                    const hiringStatusKey = normalizeStatusKey(candidate.hiringStatus) || "pending";
                                    const score = Number(candidate.score ?? candidate.aiScore ?? 0);
                                    const stageLabelRaw = String(candidate.screeningStage || "").trim().toLowerCase();
                                    const stageLabel = stageLabelRaw === "extracting" ? "Extracting" : stageLabelRaw === "scoring" ? "Scoring" : stageLabelRaw === "finalizing" ? "Finalizing" : isWaiting ? "Waiting" : isProcessing ? "Processing" : "";
                                    const canResendInterview =
                                        interviewStatusKey === "pending" ||
                                        interviewStatusKey === "in progress" ||
                                        interviewStatusKey === "completed" ||
                                        interviewStatusKey === "finished" ||
                                        statusKey === "shortlisted" ||
                                        hiringStatusKey === "hired";
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
                                                <TableCell className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        onClick={(e) => e.stopPropagation()}
                                                        checked={selectedIds.has(candidate.id)}
                                                        onCheckedChange={() => toggleSelected(candidate.id)}
                                                        aria-label={`Select ${displayName}`}
                                                    />
                                                </TableCell>
                                            )}
                                            {/* no row number — matches screenshot */}
                                            <TableCell className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    {/* Square letter avatar — exact screenshot style */}
                                                    <div className="h-8 w-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-[12px] font-bold text-gray-600 shrink-0 uppercase">
                                                        {displayName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-gray-900 leading-tight">{displayName}</p>
                                                        <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[180px]">{displayEmail}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            {/* Score */}
                                            <TableCell className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                                                {isExtracting ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                                                        <span className="text-[12px] text-orange-600 font-medium">{stageLabel || "Processing"}</span>
                                                    </div>
                                                ) : isFailed ? (
                                                    <span className="text-[12px] font-semibold text-rose-500">Failed</span>
                                                ) : (
                                                    <span className={cn("text-[13px] font-bold",
                                                        score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : score > 0 ? "text-rose-500" : "text-gray-300"
                                                    )}>{score ? `${score}%` : "—"}</span>
                                                )}
                                            </TableCell>
                                            {/* Resume status */}
                                            <TableCell className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border",
                                                    isExtracting ? "bg-orange-50 text-orange-600 border-orange-200" :
                                                    isFailed ? "bg-rose-50 text-rose-600 border-rose-200" :
                                                    statusKey === "rejected" ? "bg-rose-50 text-rose-600 border-rose-200" :
                                                    statusKey === "shortlisted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                    "bg-gray-50 text-gray-500 border-gray-200"
                                                )}>
                                                    {isProcessing ? (stageLabel || "Processing") : statusKey === "rejected" ? "Rejected" : statusKey === "shortlisted" ? "Shortlisted" : statusLabel}
                                                </span>
                                            </TableCell>
                                            {/* Interview status */}
                                            <TableCell className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("h-2 w-2 rounded-full shrink-0",
                                                        interviewStatusKey === "completed" || interviewStatusKey === "finished" ? "bg-emerald-500" :
                                                        interviewStatusKey === "in progress" || interviewStatusKey === "inprogress" ? "bg-blue-500" : "bg-gray-300"
                                                    )} />
                                                    <span className={cn("text-[12px] font-medium",
                                                        interviewStatusKey === "completed" || interviewStatusKey === "finished" ? "text-emerald-700" :
                                                        interviewStatusKey === "in progress" || interviewStatusKey === "inprogress" ? "text-blue-700" : "text-gray-400"
                                                    )}>{interviewStatusLabel}</span>
                                                </div>
                                            </TableCell>
                                            {/* Resume report */}
                                            <TableCell className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                {isWaiting || isProcessing ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400 mx-auto" />
                                                ) : isFailed ? (
                                                    <XCircle className="h-3.5 w-3.5 text-rose-400 mx-auto" />
                                                ) : (
                                                    <Link href={`/admin/candidates/${candidate.id}?report=resume&back=${encodeURIComponent(`/admin/candidates/drive/${driveId}`)}`} className="text-[12px] font-semibold text-orange-500 hover:text-orange-700 transition-colors">View</Link>
                                                )}
                                            </TableCell>
                                            {/* Interview report */}
                                            <TableCell className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                {interviewReportUnlocked ? (
                                                    <Link href={`/admin/candidates/${candidate.id}?back=${encodeURIComponent(`/admin/candidates/drive/${driveId}`)}`} className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">View</Link>
                                                ) : (
                                                    <span className="inline-flex items-center justify-center text-gray-300"
                                                        title="Interview report is locked until the interview is finished"
                                                        aria-label="Interview report locked"
                                                    >
                                                        <Lock className="h-4 w-4" />
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu modal={false}>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
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
                                                        <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Shortlist</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "shortlisted" }, `${displayName} shortlisted`)} className="rounded-xl px-2.5 py-2 text-sm font-semibold text-emerald-600 cursor-pointer transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:text-emerald-700 focus:bg-emerald-50 data-[highlighted]:bg-emerald-50 data-[highlighted]:text-emerald-700">
                                                            <Target className="h-4 w-4 mr-2 shrink-0" />
                                                            Shortlist
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "rejected" }, `${displayName} rejected`)} className="rounded-xl px-2.5 py-2 text-sm font-semibold text-rose-600 cursor-pointer transition-colors hover:bg-rose-50 hover:text-rose-700 focus:text-rose-700 focus:bg-rose-50 data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-700">
                                                            <UserX className="h-4 w-4 mr-2 shrink-0" />
                                                            Reject
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => !isSuspended && openSendEmailConfirm({ id: candidate.id, name: displayName, resumeStatus: candidate.status })}
                                                            className={cn(
                                                                "rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer transition-colors",
                                                                isSuspended ? "text-gray-400 focus:bg-transparent" : "text-blue-600 focus:text-blue-700 focus:bg-blue-50"
                                                            )}
                                                            title={isSuspended ? interviewActionBlockedMessage : undefined}
                                                        >
                                                            {isSuspended ? <Lock className="h-4 w-4 mr-2 shrink-0" /> : <Mail className="h-4 w-4 mr-2 shrink-0" />}
                                                            Send Email
                                                        </DropdownMenuItem>

                                                        <>
                                                            <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Manage</DropdownMenuLabel>
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    if (isInterviewActionBlocked) {
                                                                        toast.error(interviewActionBlockedMessage);
                                                                        return;
                                                                    }
                                                                    handleSendInterviewLink({ id: candidate.id, name: displayName, interviewStatus: candidate.interviewStatus });
                                                                }}
                                                                disabled={sendingInterviewLinkId === candidate.id || !canResendInterview || isInterviewActionBlocked}
                                                                className={cn(
                                                                    "rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer transition-colors",
                                                                    sendingInterviewLinkId === candidate.id
                                                                        ? "text-gray-400 opacity-70"
                                                                        : isInterviewActionBlocked
                                                                            ? "text-gray-400 opacity-70"
                                                                            : canResendInterview
                                                                                ? "text-blue-600 focus:text-blue-700 focus:bg-blue-50"
                                                                                : "text-gray-400 opacity-70"
                                                                )}
                                                            >
                                                                {isInterviewActionBlocked ? <Lock className="h-4 w-4 mr-2 shrink-0" /> : <RefreshCw className={cn("h-4 w-4 mr-2 shrink-0", sendingInterviewLinkId === candidate.id && "animate-spin")} />}
                                                                {sendingInterviewLinkId === candidate.id ? "Sending..." : "Resend Interview Link"}
                                                            </DropdownMenuItem>
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <p className="text-[12px] text-gray-500">
                        Showing <span className="font-bold text-gray-800">{pagination.total > 0 ? (pagination.page - 1) * pageSize + 1 : 0}</span>–<span className="font-bold text-gray-800">{Math.min(pagination.page * pageSize, pagination.total)}</span> of <span className="font-bold text-gray-800">{pagination.total}</span>
                    </p>
                    <Select value={String(pageSize)} onValueChange={(v) => { const n = Number(v); setPageSize(n); clearSelection(); fetchCandidates(1, n, driveId, resumeFilter, interviewFilter, undefined, undefined, searchTerm, scoreSort); }}>
                        <SelectTrigger className="h-7 w-28 rounded-lg border-gray-200 bg-white text-[12px] font-semibold text-gray-600 shadow-none"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl border-gray-100">{[20, 50, 100, 250, 500, 1000].map(o => <SelectItem key={o} value={String(o)} className="rounded-lg font-semibold text-[12px]">{o} / page</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="flex gap-2">
                    <button disabled={pagination.page <= 1 || isLoading} onClick={() => handlePageChange(pagination.page - 1)} className="h-7 px-3 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40">Previous</button>
                    <button disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => handlePageChange(pagination.page + 1)} className="h-7 px-3 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40">Next</button>
                </div>
            </div>
            {emailConfirm && (() => {
                const isBulk = emailConfirm.mode === "bulk";
                const selected = isBulk ? filteredCandidates.filter((c: any) => selectedIds.has(c.id)) : [];
                const shortlistedCount = isBulk ? selected.filter((c: any) => normalizeStatusKey(c.status) === "shortlisted").length : 0;
                const rejectedCount = isBulk ? selected.filter((c: any) => normalizeStatusKey(c.status) === "rejected").length : 0;
                const singleStatus = !isBulk ? normalizeStatusKey(emailConfirm.resumeStatus) : null;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="px-6 pt-6 pb-4">
                                <h2 className="text-lg font-black text-gray-900 tracking-tight">Confirm Send Email</h2>
                                {isBulk ? (
                                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                                        {shortlistedCount > 0 && <p>• <span className="font-bold text-emerald-700">{shortlistedCount} shortlisted</span> → schedule link will be sent</p>}
                                        {rejectedCount > 0 && <p>• <span className="font-bold text-rose-700">{rejectedCount} rejected</span> → rejection email will be sent</p>}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-gray-600">
                                        {singleStatus === "shortlisted"
                                            ? <>Send a <span className="font-bold text-emerald-700">schedule link</span> to <span className="font-bold">{emailConfirm.candidateName}</span>.</>
                                            : <>Send a <span className="font-bold text-rose-700">rejection email</span> to <span className="font-bold">{emailConfirm.candidateName}</span>.</>}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                                <button onClick={() => setEmailConfirm(null)} className="h-10 px-5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSendEmailConfirmed}
                                    disabled={isBulkLoading}
                                    className="h-10 px-6 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
                                >
                                    {isBulkLoading ? "Sending..." : "Send"}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
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
                            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
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
