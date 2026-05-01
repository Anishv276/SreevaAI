"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { PremiumFilter } from "@/components/admin/premium-filter";
import { CandidateActivitySidebar } from "@/components/admin/candidate-activity-sidebar";
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { getInterviewActionBlockedMessage, getInterviewQuotaSupportMessage, isInterviewQuotaLocked } from "@/lib/interview-quota";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertCircle,
    Eye,
    FileText,
    Mail,
    Search,
    ChevronDown,
    Target,
    UserX,
    MoreHorizontal,
    Lock,
    XCircle,
    RefreshCw,
    BadgeCheck,
    CheckSquare,
    Square,
    X,
    Trash2,
    Radio,
    Activity,
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

export function DriveCandidatesTable({ driveId }: { driveId: string }) {
    const { candidates, pagination, isLoading, error, fetchCandidates, clearError } = useCandidates();
    const { jobs, organization } = useJobs();
    const [searchTerm, setSearchTerm] = useState("");
    const [resumeFilter, setResumeFilter] = useState("all");
    const [interviewFilter, setInterviewFilter] = useState("all");
    const [hiringFilter, setHiringFilter] = useState("all");
    const [timeline, setTimeline] = useState<DateRange>({ type: "all" });
    const [scoreSort, setScoreSort] = useState<"default" | "score_desc" | "score_asc">("default");
    const [pageSize, setPageSize] = useState(20);
    const [sendingInterviewLinkId, setSendingInterviewLinkId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [quotaLocked, setQuotaLocked] = useState(false);
    const [activitySidebarCandidate, setActivitySidebarCandidate] = useState<{ id: string; name: string } | null>(null);

    const isSuspended = String(organization?.status || "").toUpperCase() === "SUSPENDED" || String(organization?.status || "").toUpperCase() === "CLOSED";
    const isInterviewActionBlocked = isSuspended || quotaLocked;
    const interviewActionBlockedMessage = getInterviewActionBlockedMessage(isSuspended);

    useEffect(() => {
        const handler = setTimeout(() => {
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
            fetchCandidates(1, pageSize, driveId, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm, scoreSort);
        }, 500);
        return () => clearTimeout(handler);
    }, [driveId, resumeFilter, interviewFilter, hiringFilter, timeline, searchTerm, pageSize, fetchCandidates, scoreSort]);

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
        fetchCandidates(newPage, pageSize, driveId, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm, scoreSort);
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
                fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, hiringFilter, undefined, undefined, searchTerm, scoreSort);
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
                fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, hiringFilter, undefined, undefined, searchTerm, scoreSort);
                return;
            }
            toast.error(data?.error || "Failed to send interview link");
        } catch {
            toast.error("Failed to send interview link");
        } finally {
            setSendingInterviewLinkId(null);
        }
    };

    const filteredCandidates = candidates;
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
        setIsSelectionMode(false);
    };

    const handleBulkStatus = async (action: "hire" | "not_hired" | "reject" | "shortlist" | "delete") => {
        if (!selectedCount || isBulkLoading) return;
        try {
            setIsBulkLoading(true);
            const res = await fetch("/api/candidates/bulk-action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds), action }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                toast.success(data?.message || "Bulk action completed");
                clearSelection();
                fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, hiringFilter, undefined, undefined, searchTerm, scoreSort);
                return;
            }
            toast.error(data?.error || "Failed to update selected candidates");
        } catch {
            toast.error("Failed to update selected candidates");
        } finally {
            setIsBulkLoading(false);
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
            fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, hiringFilter, undefined, undefined, searchTerm, scoreSort);
        } catch {
            toast.error("Failed to send interview links");
        } finally {
            setIsBulkLoading(false);
        }
    };

    const handleBulkSendEmail = async (
        emailType: "screening" | "hiring",
        targetAction?: "shortlist" | "reject" | "hire" | "nothired"
    ) => {
        if (!selectedCount || isBulkLoading) return;
        if (isInterviewActionBlocked) {
            toast.error(interviewActionBlockedMessage);
            return;
        }
        try {
            setIsBulkLoading(true);
            const res = await fetch("/api/candidates/bulk-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds), emailType, targetAction }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                toast.success(data?.message || "Emails sent");
                clearSelection();
                fetchCandidates(pagination.page, pageSize, driveId, resumeFilter, interviewFilter, hiringFilter, undefined, undefined, searchTerm, scoreSort);
                return;
            }
            toast.error(data?.error || "Failed to send emails");
        } catch {
            toast.error("Failed to send emails");
        } finally {
            setIsBulkLoading(false);
        }
    };

    const driveTitle = jobs.find((job) => job.id === driveId)?.title || "Drive";

    return (
        <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-white/40 bg-white/50 p-2.5 backdrop-blur-xl shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="relative flex-1 max-w-2xl w-full">
                        <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder={`Search candidates in ${driveTitle}...`}
                            className="pl-11 h-11 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-orange-200 focus:ring-8 focus:ring-orange-50/50 transition-all font-bold text-sm shadow-inner"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto overflow-x-auto pb-1 xl:pb-0 no-scrollbar">
                        <DateFilter value={timeline} onChange={setTimeline} />
                        <PremiumFilter
                            value={resumeFilter}
                            onChange={setResumeFilter}
                            icon={Target}
                            placeholder="Resume"
                            options={[
                                { value: "all", label: "All Status" },
                                { value: "shortlisted", label: "Shortlisted", colorClass: "text-emerald-600" },
                                { value: "rejected", label: "Rejected", colorClass: "text-rose-600" },
                                { value: "pending", label: "Pending", colorClass: "text-slate-600" },
                            ]}
                        />
                        <PremiumFilter
                            value={interviewFilter}
                            onChange={setInterviewFilter}
                            icon={Radio}
                            placeholder="Interview"
                            options={[
                                { value: "all", label: "All Interview" },
                                { value: "pending", label: "Pending", colorClass: "text-amber-600" },
                                { value: "inprogress", label: "In Progress", colorClass: "text-orange-600" },
                                { value: "completed", label: "Completed", colorClass: "text-indigo-600" },
                            ]}
                        />
                        <PremiumFilter
                            value={hiringFilter}
                            onChange={setHiringFilter}
                            icon={BadgeCheck}
                            placeholder="Hiring"
                            options={[
                                { value: "all", label: "All Hiring" },
                                { value: "hired", label: "Hired", colorClass: "text-emerald-600" },
                                { value: "not hired", label: "Not Hired", colorClass: "text-rose-600" },
                                { value: "pending", label: "Pending", colorClass: "text-slate-600" },
                            ]}
                        />
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => {
                                if (isSelectionMode) {
                                    clearSelection();
                                } else {
                                    setIsSelectionMode(true);
                                }
                            }}
                            className={cn(
                                "h-12 px-5 rounded-2xl font-bold transition-all flex items-center gap-2 shadow-none",
                                isSelectionMode ? "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900" : "bg-white text-gray-500 border-white/40 hover:bg-gray-50 hover:text-[#F97316] hover:border-orange-100"
                            )}
                        >
                            {isSelectionMode ? <><X className="h-4 w-4" /> Cancel</> : <><CheckSquare className="h-4 w-4" /> Select</>}
                        </Button>
                    </div>
                </div>
            </div>

            {isSelectionMode && (
                <div className="rounded-2xl border border-gray-200 bg-white/80 p-3.5 shadow-none space-y-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                            {isAllSelected ? <CheckSquare className="h-4 w-4 text-gray-700" /> : <Square className="h-4 w-4 text-gray-700" />}
                            <span className="text-[11px] font-black uppercase tracking-widest text-gray-600">
                                {selectedCount} selected
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 text-xs font-bold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                        >
                            {isAllSelected ? <Square className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                            {isAllSelected ? "Deselect" : "Select All"}
                        </button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={clearSelection}
                            className="h-9 rounded-xl px-3.5 text-xs font-bold text-gray-500 hover:bg-white hover:text-gray-900"
                        >
                            Clear
                        </Button>
                    </div>

                    {selectedCount > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#F97316] mb-2">Shortlist</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        onClick={() => handleBulkStatus("shortlist")}
                                        disabled={isBulkLoading}
                                        className="h-8 px-3 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-none"
                                    >
                                        <Target className="h-3.5 w-3.5" /> Shortlist
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => handleBulkStatus("reject")}
                                        disabled={isBulkLoading}
                                        className="h-8 px-3 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-none"
                                    >
                                        <UserX className="h-3.5 w-3.5" /> Reject
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => handleBulkSendEmail("screening")}
                                        disabled={isBulkLoading || isInterviewActionBlocked}
                                        className="h-8 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-none"
                                    >
                                        <Mail className="h-3.5 w-3.5" /> Send Email
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#F97316] mb-2">Hire</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        onClick={() => handleBulkStatus("hire")}
                                        disabled={isBulkLoading}
                                        className="h-8 px-3 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-none"
                                    >
                                        <BadgeCheck className="h-3.5 w-3.5" /> Hire
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => handleBulkStatus("not_hired")}
                                        disabled={isBulkLoading}
                                        className="h-8 px-3 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-none"
                                    >
                                        <UserX className="h-3.5 w-3.5" /> Not Hired
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => handleBulkSendEmail("hiring")}
                                        disabled={isBulkLoading || isInterviewActionBlocked}
                                        className="h-8 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-none"
                                    >
                                        <Mail className="h-3.5 w-3.5" /> Send Email
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#F97316] mb-2">Interview Link</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        onClick={handleBulkSendInterviewLink}
                                        disabled={isBulkLoading || quotaLocked}
                                        className="h-8 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-none"
                                    >
                                        {quotaLocked ? <Lock className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Resend Link
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-red-100 bg-red-50/40 px-3 py-2.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-red-500 mb-2">Remove</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleBulkStatus("delete")}
                                        disabled={isBulkLoading}
                                        className="h-8 px-3 rounded-xl border-red-200 text-red-600 font-bold text-xs flex items-center gap-1.5 hover:bg-red-50"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> Delete
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs font-bold text-red-900 uppercase tracking-tighter">Sync Error: {error}</span>
                    </div>
                    <button onClick={clearError} className="text-red-600 hover:text-red-800 transition-colors">
                        <XCircle className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div className="group relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_24px_rgba(15,23,42,0.03)] overflow-hidden transition-all duration-700 hover:shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400/0 via-[#F97316]/40 to-orange-400/0" />
                <div className="relative w-full overflow-auto max-h-[65vh]">
                    <Table>
                        <TableHeader className="bg-gray-50/50 sticky top-0 z-10 backdrop-blur-md">
                            <TableRow className="border-b border-gray-100 hover:bg-transparent">
                                {isSelectionMode && (
                                    <TableHead className="w-[56px] pl-6 font-bold uppercase tracking-wider text-[11px] text-gray-500">
                                        <button
                                            type="button"
                                            onClick={toggleSelectAll}
                                            className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:text-[#F97316] transition-colors"
                                        >
                                            {isAllSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                        </button>
                                    </TableHead>
                                )}
                                <TableHead className="w-[60px] pl-8 font-bold uppercase tracking-wider text-[11px] text-gray-500">#</TableHead>
                                <TableHead className="w-[320px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 pl-4">Candidate</TableHead>
                                <TableHead className="w-[220px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Drive ID</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Score</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Hiring</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume Report</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview Report</TableHead>
                                <TableHead className="text-right pr-8 h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0">
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 11 : 10} className="py-12 text-center text-sm font-bold text-gray-400">Loading candidates...</TableCell>
                                </TableRow>
                            ) : filteredCandidates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 11 : 10} className="py-12 text-center text-sm font-bold text-gray-400">No candidates found for this drive</TableCell>
                                </TableRow>
                            ) : (
                                filteredCandidates.map((candidate: any, index: number) => {
                                    const displayName = candidate.fullName || candidate.name || "Unknown Candidate";
                                    const displayEmail = candidate.email || "";
                                    const statusValue = candidate.resumeStatus || candidate.status;
                                    const statusKey = normalizeStatusKey(statusValue) || "pending";
                                    const statusLabel = formatCandidateStatusLabel(statusValue);
                                    const interviewStatusValue = candidate.interviewStatus;
                                    const interviewStatusKey = normalizeStatusKey(interviewStatusValue) || "pending";
                                    const interviewStatusLabel = formatCandidateStatusLabel(interviewStatusValue);
                                    const hiringStatusValue = candidate.hiringStatus;
                                    const hiringStatusKey = normalizeStatusKey(hiringStatusValue) || "pending";
                                    const hiringStatusLabel = formatCandidateStatusLabel(hiringStatusValue);
                                    const score = Number(candidate.score ?? candidate.aiScore ?? 0);
                                    const canResendInterview = interviewStatusKey === "pending" || interviewStatusKey === "in progress" || interviewStatusKey === "completed" || interviewStatusKey === "finished" || statusKey === "shortlisted" || hiringStatusKey === "hired";

                                    return (
                                        <TableRow
                                            key={candidate.id}
                                            onClick={() => isSelectionMode && toggleSelected(candidate.id)}
                                            className={cn(
                                                "group border-b border-white/20 hover:bg-white/40 transition-all duration-500",
                                                isSelectionMode && "cursor-pointer",
                                                selectedIds.has(candidate.id) && "bg-orange-50/30"
                                            )}
                                        >
                                            {isSelectionMode && (
                                                <TableCell className="pl-6 py-5" onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        onClick={(e) => e.stopPropagation()}
                                                        checked={selectedIds.has(candidate.id)}
                                                        onCheckedChange={() => toggleSelected(candidate.id)}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className="pl-8 py-5 text-[12px] font-bold text-gray-400 tabular-nums">
                                                {index + 1 + (pagination.page - 1) * pageSize}
                                            </TableCell>
                                            <TableCell className="py-5 pl-4">
                                                <div className="flex items-center gap-4">
                                                    <Avatar className="h-11 w-11 border-2 border-white shadow-sm ring-1 ring-gray-100 group-hover/avatar:scale-105 transition-transform duration-300">
                                                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                                                        <AvatarFallback>{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="text-gray-900 font-extrabold text-[15px] leading-tight group-hover:text-[#F97316] transition-colors">{displayName}</span>
                                                        <span className="text-[11px] text-gray-400 font-bold mt-0.5">{displayEmail}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <span className={cn(
                                                    "max-w-[190px] truncate rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] border",
                                                    candidate.driveId === driveId ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                                                )}>
                                                    {candidate.driveId || "missing"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <Badge className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm",
                                                    score >= 80 ? "bg-emerald-50 text-emerald-700" :
                                                    score >= 50 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                                                )}>
                                                    {score ? `${score}%` : "No score"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <Badge variant="secondary" className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm transition-all",
                                                    statusKey === "rejected" ? "bg-rose-50 text-rose-700" :
                                                    statusKey === "shortlisted" ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"
                                                )}>
                                                    {statusLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <Badge variant="secondary" className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm transition-all",
                                                    interviewStatusKey === "completed" || interviewStatusKey === "finished" ? "bg-indigo-50 text-indigo-700" :
                                                    interviewStatusKey === "in progress" ? "bg-blue-50 text-blue-700" :
                                                    interviewStatusKey === "pending" ? "bg-slate-50 text-slate-500" : "bg-amber-50 text-amber-700"
                                                )}>
                                                    {interviewStatusLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <Badge variant="secondary" className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm transition-all",
                                                    hiringStatusKey === "hired" ? "bg-emerald-50 text-emerald-700" :
                                                    hiringStatusKey === "not hired" ? "bg-rose-50 text-rose-700" :
                                                    hiringStatusKey === "not shortlisted" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"
                                                )}>
                                                    {hiringStatusLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <Link href={`/admin/candidates/${candidate.id}?report=resume&back=${encodeURIComponent(`/admin/candidates/drive/${driveId}`)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#F97316] transition-colors hover:bg-orange-50">
                                                    <Eye className="h-4 w-4" />
                                                </Link>
                                            </TableCell>
                                            <TableCell className="py-5 text-center" onClick={(e) => e.stopPropagation()}>
                                                {interviewStatusKey === "pending" ? <Lock className="h-4 w-4 text-gray-300" /> : (
                                                    <Link href={`/admin/candidates/${candidate.id}?back=${encodeURIComponent(`/admin/candidates/drive/${driveId}`)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#0D4D2E] transition-colors hover:bg-emerald-50">
                                                        <FileText className="h-4 w-4" />
                                                    </Link>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-5 pr-8 text-right" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">
                                                            <MoreHorizontal className="h-4 w-4 text-gray-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-64 p-2 rounded-xl shadow-xl border-gray-100 bg-white">
                                                        <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem
                                                            onClick={() => setActivitySidebarCandidate({ id: candidate.id, name: displayName })}
                                                            className="rounded-lg px-3 py-2 font-bold cursor-pointer text-slate-700 focus:bg-slate-50"
                                                        >
                                                            <Activity className="h-4 w-4 mr-2" />
                                                            Activity
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleSendInterviewLink({ id: candidate.id, name: displayName, interviewStatus: candidate.interviewStatus })} disabled={sendingInterviewLinkId === candidate.id || !canResendInterview || isInterviewActionBlocked} className="rounded-lg px-3 py-2 font-bold text-blue-600 cursor-pointer focus:bg-blue-50">
                                                            <RefreshCw className={cn("h-4 w-4 mr-2", sendingInterviewLinkId === candidate.id && "animate-spin")} />
                                                            {sendingInterviewLinkId === candidate.id ? "Sending..." : "Resend Link"}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "shortlisted" }, `${displayName} shortlisted`)} className="rounded-lg px-3 py-2 font-bold text-emerald-600 cursor-pointer focus:bg-emerald-50">
                                                            <Target className="h-4 w-4 mr-2" /> Shortlist
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "rejected" }, `${displayName} rejected`)} className="rounded-lg px-3 py-2 font-bold text-rose-600 cursor-pointer focus:bg-rose-50">
                                                            <UserX className="h-4 w-4 mr-2" /> Reject
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { hiringStatus: "hired" }, `${displayName} hired`)} className="rounded-lg px-3 py-2 font-bold text-emerald-600 cursor-pointer focus:bg-emerald-50">
                                                            <BadgeCheck className="h-4 w-4 mr-2" /> Hire
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
            <CandidateActivitySidebar
                open={activitySidebarCandidate !== null}
                candidateId={activitySidebarCandidate?.id || null}
                candidateName={activitySidebarCandidate?.name}
                backHref={`/admin/candidates/drive/${driveId}`}
                onClose={() => setActivitySidebarCandidate(null)}
            />

            <div className="flex flex-col gap-4 border-t border-white/20 bg-white/20 px-4 py-5 backdrop-blur-xl rounded-2xl lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[13px] font-medium text-gray-500">
                        Showing <span className="text-gray-900 font-bold">{pagination.total > 0 ? (pagination.page - 1) * pageSize + 1 : 0}</span> to <span className="text-gray-900 font-bold">{Math.min(pagination.page * pageSize, pagination.total)}</span> of <span className="text-gray-900 font-bold">{pagination.total}</span> candidates
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">Rows</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(value) => {
                                const next = Number(value);
                                setPageSize(next);
                                clearSelection();
                                fetchCandidates(1, next, driveId, resumeFilter, interviewFilter, hiringFilter, undefined, undefined, searchTerm, scoreSort);
                            }}
                        >
                            <SelectTrigger className="h-9 w-[120px] rounded-xl border-gray-200 bg-white text-sm font-bold text-gray-700 shadow-none">
                                <SelectValue placeholder="Rows" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-gray-100">
                                {[20, 50, 100, 250, 500, 1000].map((option) => (
                                    <SelectItem key={option} value={String(option)}>{option} / page</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-[#F97316]" disabled={pagination.page <= 1 || isLoading} onClick={() => handlePageChange(pagination.page - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-[#F97316]" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => handlePageChange(pagination.page + 1)}>Next</Button>
                </div>
            </div>
        </div>
    );
}
