"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Search, MoreHorizontal, Download, ChevronLeft, ChevronRight,
    Trash2, X, Briefcase, AlertCircle, UserX, Radio, Target,
    ShieldCheck, Award, Clock, Mail, Loader2, Lock, FileText,
    Eye, Send, RefreshCw, BadgeCheck, XCircle, CheckSquare, Square, Video
} from "lucide-react";
import Link from 'next/link';
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { motion } from "framer-motion";
import { PremiumFilter } from "@/components/admin/premium-filter";
import { useAdminOrg } from "@/context/admin-org-context";
// ---------------------------------------------------------------------------
// Email confirm modal (interview link / rejection -- same as job page)
// ---------------------------------------------------------------------------
function normalizeStatusKey(value?: string) {
    return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
}
function parseCandidateInterviewReport(raw: unknown): any {
    if (!raw) return {};
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }
    if (typeof raw === "object") return raw;
    return {};
}
function deriveCandidateInterviewScore(rawReport: unknown): number | null {
    const report = parseCandidateInterviewReport(rawReport);
    const directCombined = Number(report?.scores?.combined_score ?? report?.combined_score);
    if (Number.isFinite(directCombined) && directCombined >= 0) return Math.round(directCombined);
    const qaBlocks = Array.isArray(report?.qa_blocks) ? report.qa_blocks : [];
    const nums = qaBlocks
        .map((b: any) => parseFloat(String(b?.score || "").replace(/[^\d.]/g, "")))
        .filter((n: number) => Number.isFinite(n));
    if (nums.length > 0) {
        const avg = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
        return Math.round(avg <= 10 ? avg * 10 : avg);
    }
    return null;
}
function EmailConfirmModal({
    confirm, onClose, onConfirm, isBulkLoading, filteredCandidates, selectedIds,
}: {
    confirm: { mode: "single" | "bulk"; candidateId?: string; candidateName?: string; resumeStatus?: string } | null;
    onClose: () => void;
    onConfirm: () => void;
    isBulkLoading: boolean;
    filteredCandidates: any[];
    selectedIds: Set<string>;
}) {
    if (!confirm) return null;
    const isBulk = confirm.mode === "bulk";
    const selected = isBulk ? filteredCandidates.filter((c: any) => selectedIds.has(c.id)) : [];
    const shortlistedCount = isBulk ? selected.filter((c: any) => normalizeStatusKey(c.status) === "shortlisted").length : 0;
    const rejectedCount = isBulk ? selected.filter((c: any) => normalizeStatusKey(c.status) === "rejected").length : 0;
    const singleStatus = !isBulk ? normalizeStatusKey(confirm.resumeStatus) : null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="px-6 pt-6 pb-4">
                    <h2 className="text-lg font-black text-gray-900 tracking-tight">Confirm Send Schedule Link</h2>
                    {isBulk ? (
                        <div className="mt-2 space-y-1 text-sm text-gray-600">
                            {shortlistedCount > 0 && <p>• <span className="font-bold text-emerald-700">{shortlistedCount} shortlisted</span> → interview link will be sent</p>}
                            {rejectedCount > 0 && <p>• <span className="font-bold text-rose-700">{rejectedCount} rejected</span> → rejection email will be sent</p>}
                        </div>
                    ) : (
                        <p className="mt-2 text-sm text-gray-600">
                            {singleStatus === "shortlisted"
                                ? <>Send a <span className="font-bold text-emerald-700">interview link</span> to <span className="font-bold">{confirm.candidateName}</span>.</>
                                : <>Send a <span className="font-bold text-rose-700">rejection email</span> to <span className="font-bold">{confirm.candidateName}</span>.</>}
                        </p>
                    )}
                </div>
                <div className="flex items-center justify-end gap-1.5 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                    <button onClick={onClose} className="h-10 px-5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                    <button onClick={onConfirm} disabled={isBulkLoading}
                        className="h-10 px-6 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors disabled:opacity-60">
                        {isBulkLoading ? "Sending..." : "Send"}
                    </button>
                </div>
            </div>
        </div>
    );
}
// ---------------------------------------------------------------------------
// Stats row
// ---------------------------------------------------------------------------
function CandidateStatsRow() {
    const { stats, isLoading, error } = useCandidates();
    
    if (error) return null;
    if (isLoading && stats.shortlisted === 0) return (
        <div className="flex gap-1 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-[68px] flex-1 rounded-xl bg-gray-100" />)}
        </div>
    );

    const statsTotal = (stats as any).total || (stats.shortlisted + stats.rejected + stats.interviewRunning + stats.interviewPending + stats.interviewCompleted);
    const total = statsTotal || 1;
    const getPct = (val: number) => Math.round((val / total) * 100);

    return (
        <div className="flex flex-wrap items-center gap-1">
            {/* Shortlisted */}
            <div className="flex flex-col justify-between p-3 rounded-xl bg-emerald-50/30 border border-emerald-100 flex-1 min-w-[110px] relative">
                <div className="flex items-start gap-1">
                    <div className="mt-0.5"><svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg></div>
                    <div className="pr-6">
                        <p className="text-xl font-black text-gray-900 leading-none mb-1">{stats.shortlisted}</p>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Shortlisted</p>
                    </div>
                </div>
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">{getPct(stats.shortlisted)}%</div>
            </div>

            {/* Interviewed */}
            <div className="flex flex-col justify-between p-3 rounded-xl bg-blue-50/30 border border-blue-100 flex-1 min-w-[110px] relative">
                <div className="flex items-start gap-1">
                    <div className="mt-0.5"><svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>
                    <div className="pr-6">
                        <p className="text-xl font-black text-gray-900 leading-none mb-1">{stats.interviewRunning + stats.interviewCompleted}</p>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Interviewed</p>
                    </div>
                </div>
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">{getPct(stats.interviewRunning + stats.interviewCompleted)}%</div>
            </div>

            {/* Scheduled */}
            <div className="flex flex-col justify-between p-3 rounded-xl bg-amber-50/30 border border-amber-100 flex-1 min-w-[110px] relative">
                <div className="flex items-start gap-1">
                    <div className="mt-0.5"><svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                    <div className="pr-6">
                        <p className="text-xl font-black text-gray-900 leading-none mb-1">{stats.interviewPending}</p>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Scheduled</p>
                    </div>
                </div>
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">{getPct(stats.interviewPending)}%</div>
            </div>

            {/* Rejected */}
            <div className="flex flex-col justify-between p-3 rounded-xl bg-red-50/30 border border-red-100 flex-1 min-w-[110px] relative">
                <div className="flex items-start gap-1">
                    <div className="mt-0.5"><svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg></div>
                    <div className="pr-6">
                        <p className="text-xl font-black text-gray-900 leading-none mb-1">{stats.rejected}</p>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Rejected</p>
                    </div>
                </div>
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">{getPct(stats.rejected)}%</div>
            </div>
        </div>
    );
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCandidateStatusLabel(value?: string) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (!normalized) return "Pending";
    if (normalized === "inprogress" || normalized === "in progress") return "In Progress";
    if (normalized === "finished" || normalized === "completed") return "Completed";
    if (normalized === "shortlisted") return "Shortlisted";
    if (normalized === "rejected") return "Rejected";
    if (normalized === "not shortlisted") return "Not Shortlisted";
    if (normalized === "not qualified") return "Not Qualified";
    return normalized.replace(/\b\w/g, (ch) => ch.toUpperCase());
}
// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CandidatesPage() {
    const { candidates, pagination, isLoading, error, fetchCandidates, clearError } = useCandidates();
    const { jobs } = useJobs();
    const [searchTerm, setSearchTerm] = useState("");
    const [resumeFilter, setResumeFilter] = useState("all");
    const [interviewFilter, setInterviewFilter] = useState("all");
    const [roleFilter, setRoleFilter] = useState("all");
    const [pageSize, setPageSize] = useState(20);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [isCandidatesTableReady, setIsCandidatesTableReady] = useState(false);
    const [sendingInterviewLinkId, setSendingInterviewLinkId] = useState<string | null>(null);
    const [timeline, setTimeline] = useState<DateRange>({ type: "all" });
    const [interviewScoresById, setInterviewScoresById] = useState<Record<string, number>>({});
    const [emailConfirm, setEmailConfirm] = useState<{
        mode: "single" | "bulk"; candidateId?: string; candidateName?: string; resumeStatus?: string;
    } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        mode: "single" | "bulk"; candidateId?: string; candidateName?: string;
    } | null>(null);
    const searchParams = useSearchParams();
    const router = useRouter();
    const jobIdParam = searchParams.get("jobId");
    const orgIdParam = searchParams.get("orgId");
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || "ACTIVE").trim().toUpperCase();
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const isInterviewActionBlocked = isSuspended || quotaLocked;
    const interviewActionBlockedMessage = getInterviewActionBlockedMessage(isSuspended);
    const tableIsLoading = isLoading || !isCandidatesTableReady;
    useEffect(() => { setRoleFilter(jobIdParam || "all"); }, [jobIdParam]);
    const getDateRange = () => {
        let startDate: string | undefined, endDate: string | undefined;
        if (timeline.type === "today") { startDate = new Date().toISOString().split("T")[0]; endDate = startDate; }
        else if (timeline.type === "week") { const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "custom") { startDate = timeline.from; endDate = timeline.to; }
        return { startDate, endDate };
    };
    // Filter/search change -- show skeleton, reset to page 1
    useEffect(() => {
        setIsCandidatesTableReady(false);
        const handler = setTimeout(() => {
            const { startDate, endDate } = getDateRange();
            void fetchCandidates(1, pageSize, roleFilter, resumeFilter, interviewFilter, startDate, endDate, searchTerm)
                .finally(() => setIsCandidatesTableReady(true));
        }, 200);
        return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeFilter, interviewFilter, roleFilter, timeline, searchTerm]);
    // Page size change -- no skeleton, just refetch silently
    const pageSizeRef = useRef(pageSize);
    useEffect(() => {
        if (pageSizeRef.current === pageSize) return;
        pageSizeRef.current = pageSize;
        const { startDate, endDate } = getDateRange();
        void fetchCandidates(1, pageSize, roleFilter, resumeFilter, interviewFilter, startDate, endDate, searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize]);
    useEffect(() => {
        let cancelled = false;
        const completedCandidates = candidates.filter((candidate: any) => {
            const interviewStage = normalizeStatusKey(candidate.interviewStatus) || "pending";
            return interviewStage === "completed" || interviewStage === "finished";
        });
        const missing = completedCandidates.filter((candidate: any) => interviewScoresById[candidate.id] == null);
        if (missing.length === 0) return;
        (async () => {
            const results = await Promise.allSettled(
                missing.map(async (candidate: any) => {
                    const res = await fetch(`/api/candidates/${candidate.id}`);
                    if (!res.ok) return null;
                    const data = await res.json().catch(() => null);
                    const score = deriveCandidateInterviewScore(data?.interview?.aiSkillRatings);
                    return { id: candidate.id, score: score ?? -1 };
                })
            );
            if (cancelled) return;
            setInterviewScoresById((prev) => {
                const next = { ...prev };
                for (const result of results) {
                    if (result.status === "fulfilled" && result.value) {
                        next[result.value.id] = result.value.score;
                    }
                }
                return next;
            });
        })();
        return () => {
            cancelled = true;
        };
    }, [candidates, interviewScoresById]);
    const refetch = (page = pagination.page) => {
        let startDate: string | undefined, endDate: string | undefined;
        if (timeline.type === "today") { startDate = new Date().toISOString().split("T")[0]; endDate = startDate; }
        else if (timeline.type === "week") { const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "custom") { startDate = timeline.from; endDate = timeline.to; }
        fetchCandidates(page, pageSize, roleFilter, resumeFilter, interviewFilter, startDate, endDate, searchTerm);
    };
    const handlePageChange = (p: number) => { if (p >= 1 && p <= pagination.totalPages) refetch(p); };
    const handleMoveToJob = (candidateJobId?: string | null) => {
        if (!candidateJobId) { toast.error("This candidate is not linked to a job yet."); return; }
        const href = orgIdParam
            ? `/admin/candidates/job/${encodeURIComponent(candidateJobId)}?orgId=${encodeURIComponent(orgIdParam)}`
            : `/admin/candidates/job/${encodeURIComponent(candidateJobId)}`;
        router.push(href);
    };
    const handleUpdateStatus = async (applicationId: string, statusUpdate: { resumeStatus?: string }, successMsg: string) => {
        try {
            const res = await fetch(`/api/candidates/${applicationId}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(statusUpdate),
            });
            if (res.ok) { toast.success(successMsg); refetch(); }
            else toast.error("Failed to update status");
        } catch { toast.error("Failed to update status"); }
    };
    const handleSendInterviewLink = async (candidate: { id: string; name: string }) => {
        if (isInterviewActionBlocked) { toast.error(interviewActionBlockedMessage); return; }
        try {
            setSendingInterviewLinkId(candidate.id);
            const res = await fetch(`/api/candidates/${candidate.id}/send-interview-link`, { method: "POST" });
            const data = await res.json().catch(() => null);
            if (res.ok) { toast.success(data?.message || `Schedule link sent to ${candidate.name}`); refetch(); return; }
            toast.error(data?.error || "Failed to send interview link");
        } catch { toast.error("Failed to send interview link"); }
        finally { setSendingInterviewLinkId(null); }
    };
    const filteredCandidates = candidates;
    const selectedCount = selectedIds.size;
    const isAllSelected = filteredCandidates.length > 0 && filteredCandidates.every((c: any) => selectedIds.has(c.id));
    const toggleSelectAll = () => setSelectedIds(prev => {
        const next = new Set(prev);
        if (isAllSelected) filteredCandidates.forEach((c: any) => next.delete(c.id));
        else filteredCandidates.forEach((c: any) => next.add(c.id));
        return next;
    });
    const toggleSelection = (id: string) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    const clearSelection = () => setSelectedIds(new Set());
    const handleBulkStatus = async (action: "reject" | "shortlist" | "delete") => {
        if (!selectedCount || isBulkLoading) return;
        setIsBulkLoading(true);
        try {
            const res = await fetch("/api/candidates/bulk-action", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds), action }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) { toast.success(data?.message || "Bulk action completed"); clearSelection(); refetch(); return; }
            toast.error(data?.error || "Failed to update selected candidates");
        } catch { toast.error("Failed to update selected candidates"); }
        finally { setIsBulkLoading(false); }
    };
    const handleDeleteConfirmed = async () => {
        if (!deleteConfirm) return;
        setIsBulkLoading(true);
        try {
            if (deleteConfirm.mode === "single" && deleteConfirm.candidateId) {
                const res = await fetch(`/api/candidates/${deleteConfirm.candidateId}`, { method: "DELETE" });
                if (res.ok) { toast.success(`${deleteConfirm.candidateName || "Candidate"} deleted`); refetch(); }
                else { const data = await res.json().catch(() => null); toast.error(data?.error || "Failed to delete candidate"); }
            } else if (deleteConfirm.mode === "bulk") {
                await handleBulkStatus("delete");
            }
        } catch { toast.error("Failed to delete candidate"); }
        finally { setIsBulkLoading(false); setDeleteConfirm(null); }
    };
    const handleBulkSendInterviewLink = async () => {
        if (!selectedCount || isBulkLoading) return;
        if (isInterviewActionBlocked) { toast.error(interviewActionBlockedMessage); return; }
        setIsBulkLoading(true);
        try {
            const results = await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/candidates/${id}/send-interview-link`, { method: "POST" })));
            const failed = results.filter(r => !r.ok).length;
            const succeeded = results.length - failed;
            if (succeeded > 0) toast.success(`Schedule link sent to ${succeeded} candidate(s)`);
            if (failed > 0) toast.error(`Failed to send to ${failed} candidate(s)`);
            clearSelection(); refetch();
        } catch { toast.error("Failed to send interview links"); }
        finally { setIsBulkLoading(false); }
    };
    const openSendEmailConfirm = (candidate: { id: string; name: string; resumeStatus?: string }) => {
        if (isSuspended) { toast.error(interviewActionBlockedMessage); return; }
        const status = normalizeStatusKey(candidate.resumeStatus);
        if (status !== "shortlisted" && status !== "rejected") {
            toast.error("Candidate must be shortlisted or rejected to send an email."); return;
        }
        setEmailConfirm({ mode: "single", candidateId: candidate.id, candidateName: candidate.name, resumeStatus: candidate.resumeStatus });
    };
    const openBulkSendEmailConfirm = () => {
        if (!selectedCount) return;
        const selected = filteredCandidates.filter((c: any) => selectedIds.has(c.id));
        const shortlisted = selected.filter((c: any) => normalizeStatusKey(c.status) === "shortlisted").length;
        const rejected = selected.filter((c: any) => normalizeStatusKey(c.status) === "rejected").length;
        if (shortlisted === 0 && rejected === 0) { toast.error("No selected candidates are shortlisted or rejected."); return; }
        setEmailConfirm({ mode: "bulk" });
    };
    const handleSendEmailConfirmed = async () => {
        if (!emailConfirm) return;
        if (isSuspended) { setEmailConfirm(null); return; }
        setIsBulkLoading(true);
        try {
            if (emailConfirm.mode === "single" && emailConfirm.candidateId) {
                const status = normalizeStatusKey(emailConfirm.resumeStatus);
                if (status === "shortlisted") {
                    const res = await fetch(`/api/candidates/${emailConfirm.candidateId}/send-interview-link`, { method: "POST" });
                    const data = await res.json().catch(() => null);
                    if (!res.ok) { toast.error(data?.error || "Failed to send interview link"); return; }
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
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: rejected, emailType: "screening", targetAction: "reject" }),
                    })] : []),
                ]);
                const failed = results.filter(r => !r.ok).length;
                const succeeded = results.length - failed;
                if (succeeded > 0) toast.success(`Emails sent to ${shortlisted.length + rejected.length} candidate(s)`);
                if (failed > 0) toast.error(`Failed to send to ${failed} candidate(s)`);
                clearSelection(); refetch();
            }
        } catch { toast.error("Failed to send email"); }
        finally { setIsBulkLoading(false); setEmailConfirm(null); }
    };
    const handleExportCSV = () => {
        if (!filteredCandidates || filteredCandidates.length === 0) return;
        const headers = ["CANDIDATE", "EMAIL", "ROLE", "STATUS", "INTERVIEW", "ADDED ON"];
        const csvContent = [
            headers.join(","),
            ...filteredCandidates.map((c: any) => [
                `"${c.fullName || c.name || ''}"`,
                `"${c.email || ''}"`,
                `"${c.role || ''}"`,
                `"${formatCandidateStatusLabel(c.status || c.resumeStatus)}"`,
                `"${formatCandidateStatusLabel(c.interviewStatus)}"`,
                `"${new Date(c.createdAt || Date.now()).toLocaleDateString()}"`
            ].join(","))
        ].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `candidates_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex flex-col space-y-3 animate-in fade-in duration-500 flex-1 -mb-10 overflow-hidden">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Candidates</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage and track all candidates across your recruitment pipeline.</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <button onClick={handleExportCSV} className="flex items-center gap-1 h-10 px-4 rounded-xl border border-gray-200 bg-white text-[13px] font-bold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                    <div className="flex">
                        <button className="flex items-center gap-1 h-10 px-4 rounded-l-xl bg-violet-600 text-[13px] font-bold text-white shadow-sm hover:bg-violet-700 transition-colors cursor-pointer">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add Candidate
                        </button>
                        <button className="flex items-center justify-center w-8 h-10 rounded-r-xl bg-violet-600 border-l border-violet-500 text-white shadow-sm hover:bg-violet-700 transition-colors cursor-pointer">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                    </div>
                </div>
            </div>
            <CandidateStatsRow />
            {/* Bulk actions toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 py-3 border-t border-gray-100 mt-2">
                <span className={cn("text-sm font-semibold mr-2 transition-colors", selectedCount > 0 ? "text-gray-900" : "text-gray-400")}>
                    {selectedCount > 0 ? `${selectedCount} candidate${selectedCount !== 1 ? 's' : ''} selected` : "Select candidates for bulk actions:"}
                </span>
                
                <button onClick={() => handleBulkStatus("shortlist")} disabled={selectedCount === 0 || isBulkLoading}
                    className={cn("h-8 px-3.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                        selectedCount > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-gray-100 text-gray-400 border-gray-200")}>
                    <Target className="h-3.5 w-3.5" /> Shortlist
                </button>
                <button onClick={() => handleBulkStatus("reject")} disabled={selectedCount === 0 || isBulkLoading}
                    className={cn("h-8 px-3.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                        selectedCount > 0 ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" : "bg-gray-100 text-gray-400 border-gray-200")}>
                    <UserX className="h-3.5 w-3.5" /> Reject
                </button>
                <button onClick={isSuspended ? undefined : openBulkSendEmailConfirm}
                    disabled={selectedCount === 0 || isBulkLoading}
                    title={isSuspended ? interviewActionBlockedMessage : undefined}
                    className={cn("h-8 px-3.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        selectedCount === 0 ? "bg-gray-100 text-gray-400 border-gray-200" : isSuspended ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100")}>
                    {isSuspended ? <Lock className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />} Send Schedule Link
                </button>
                
                <div className="w-px h-5 bg-gray-200 mx-1 hidden sm:block" />
                
                <button
                    onClick={isInterviewActionBlocked ? undefined : handleBulkSendInterviewLink}
                    disabled={selectedCount === 0 || isBulkLoading}
                    title={isInterviewActionBlocked ? interviewActionBlockedMessage : undefined}
                    className={cn("h-8 px-3.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        selectedCount === 0 ? "bg-gray-100 text-gray-400 border-gray-200" : isInterviewActionBlocked ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100")}>
                    {isInterviewActionBlocked ? <Lock className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Resend Schedule Link
                </button>

                <div className="flex-1 min-w-[20px]" />

                <button onClick={() => setDeleteConfirm({ mode: "bulk" })} disabled={selectedCount === 0 || isBulkLoading}
                    className={cn("h-8 px-3.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm ml-auto disabled:opacity-50 disabled:cursor-not-allowed",
                        selectedCount > 0 ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" : "bg-gray-100 text-gray-400 border-gray-200")}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
            </div>
            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs font-bold text-red-900 uppercase tracking-tighter">Sync Error: {error}</span>
                    </div>
                    <button onClick={clearError} className="text-red-600 hover:text-red-800 transition-colors"><X className="h-4 w-4" /></button>
                </div>
            )}
            {/* Table */}
            <div className="bg-white rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                {/* Search + Filters toolbar */}
                <div className="px-4 py-3 flex flex-col md:flex-row gap-1.5 items-center shrink-0" style={{ borderBottom: "1px solid #F0EEF8" }}>
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <Input placeholder="Search by name, email, role, or skills..."
                            className="pl-10 h-9 rounded-xl text-sm bg-white w-full max-w-sm"
                            style={{ border: "1px solid #E9E7FF" }}
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>
                <div className="overflow-auto flex-1">
                    <Table>
                        <TableHeader className="sticky top-0 z-10" style={{ background: "#F9F8FF" }}>
                            <TableRow className="hover:bg-transparent" style={{ borderBottom: "1px solid #F0EEF8" }}>
                                <TableHead className="w-[56px] pl-6 font-bold uppercase tracking-wider text-[11px] text-gray-500">
                                    <button type="button" onClick={toggleSelectAll}
                                        className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:text-violet-600 transition-colors">
                                        {isAllSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                    </button>
                                </TableHead>
                                <TableHead className="w-[240px] h-7 font-bold text-[10px] uppercase tracking-wider text-[11px] text-gray-500">Candidate</TableHead>
                                <TableHead className="w-[180px] h-7 font-bold text-[10px] uppercase tracking-wider text-[11px] text-gray-500">Job Role</TableHead>
                                <TableHead className="h-7 font-bold text-[10px] uppercase tracking-wider text-[11px] text-gray-500">Score</TableHead>
                                <TableHead className="h-7 font-bold text-[10px] uppercase tracking-wider text-[11px] text-gray-500">Resume</TableHead>
                                <TableHead className="h-7 font-bold text-[10px] uppercase tracking-wider text-[11px] text-gray-500">Interview</TableHead>
                                <TableHead className="h-7 font-bold text-[10px] uppercase tracking-wider text-[11px] text-gray-500">Reports</TableHead>
                                <TableHead className="h-7 font-bold text-[10px] uppercase tracking-wider text-[11px] text-gray-500">Added On</TableHead>
                                <TableHead className="text-right pr-8 h-7 font-bold text-[10px] uppercase tracking-wider text-[11px] text-gray-500">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0">
                            {tableIsLoading ? (
                                <TableRow><TableCell colSpan={10} className="py-0.52 text-center text-xs font-bold text-gray-400">Loading candidates...</TableCell></TableRow>
                            ) : filteredCandidates.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="py-0.52 text-center text-xs font-bold text-gray-400">No candidates found for selected filters</TableCell></TableRow>
                            ) : filteredCandidates.map((candidate: any, index: number) => {
                                const displayName = candidate.fullName || candidate.name || "Unknown";
                                const displayEmail = candidate.email || "";
                                const mainStatus = normalizeStatusKey(candidate.status || candidate.resumeStatus) || "pending";
                                const mainStatusLabel = formatCandidateStatusLabel(candidate.status || candidate.resumeStatus);
                                const interviewStage = normalizeStatusKey(candidate.interviewStatus) || "pending";
                                const interviewStageLabel = formatCandidateStatusLabel(candidate.interviewStatus);
                                const interviewReportUnlocked = interviewStage === "completed" || interviewStage === "finished";
                                const resumeScore = Number(candidate.score ?? candidate.aiScore ?? 0);
                                const interviewScore = interviewScoresById[candidate.id] ?? (interviewReportUnlocked ? 0 : null);
                                const canResendInterview = interviewStage === "pending" || interviewStage === "in progress" || interviewStage === "completed" || interviewStage === "finished" || mainStatus === "shortlisted";
                                return (
                                    <TableRow key={candidate.id}
                                        onClick={() => toggleSelection(candidate.id)}
                                        className={cn(
                                            "group border-b hover:bg-violet-50/30 transition-all duration-150 cursor-pointer",
                                            selectedIds.has(candidate.id) && "bg-violet-50/30"
                                        )}>
                                        <TableCell className="pl-6 py-0.5" onClick={e => e.stopPropagation()}>
                                            <Checkbox checked={selectedIds.has(candidate.id)} onCheckedChange={() => toggleSelection(candidate.id)} onClick={e => e.stopPropagation()} />
                                        </TableCell>
                                        <TableCell className="py-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <Avatar className="h-9 w-9 border-2 border-white shadow-sm ring-1 ring-gray-100">
                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                                                    <AvatarFallback>{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-gray-900 font-extrabold text-[15px] leading-tight">{displayName}</span>
                                                        <svg className="w-3.5 h-3.5 text-violet-600 fill-violet-600" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                                                    </div>
                                                    <span className="text-[11px] text-gray-400 font-bold mt-0.5">{displayEmail}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-0.5">
                                            <span className="text-xs font-bold text-gray-700">{candidate.role || "GTM Engineer"}</span>
                                        </TableCell>
                                        <TableCell className="py-0.5" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center gap-1">
                                                <div className="relative flex items-center justify-center h-10 w-10 shrink-0">
                                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                                        <path className="text-gray-100" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                        <path className={cn("transition-all duration-500", resumeScore >= 80 ? "text-emerald-500" : resumeScore >= 60 ? "text-amber-500" : "text-rose-500")} strokeDasharray={`${resumeScore}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                    </svg>
                                                    <span className="absolute text-[9px] font-black">{resumeScore}%</span>
                                                </div>
                                                <span className="text-xs font-bold text-gray-700 whitespace-nowrap">{resumeScore >= 80 ? "Strong Match" : resumeScore >= 60 ? "Good Match" : resumeScore >= 50 ? "Average Match" : "Low Match"}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-0.5" onClick={e => e.stopPropagation()}>
                                            <Badge variant="secondary" className={cn(
                                                "rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-widest border border-current/10 shadow-sm pointer-events-none",
                                                mainStatus === "shortlisted" ? "bg-emerald-50 text-emerald-600" :
                                                    mainStatus === "rejected" ? "bg-rose-50 text-rose-600" : 
                                                    mainStatus === "under review" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                                            )}>{mainStatusLabel}</Badge>
                                        </TableCell>
                                        <TableCell className="py-0.5" onClick={e => e.stopPropagation()}>
                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700">
                                                <div className={cn("h-1 w-1 rounded-full",
                                                    interviewStage === "completed" || interviewStage === "finished" ? "bg-emerald-500" :
                                                    interviewStage === "in progress" || interviewStage === "scheduled" ? "bg-blue-500" : "bg-gray-400"
                                                )} />
                                                {interviewStage === "completed" || interviewStage === "finished" ? "Completed" : interviewStage === "scheduled" ? "Scheduled" : "Not Scheduled"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-0.5" onClick={e => e.stopPropagation()}>
                                            <div className="flex flex-wrap items-center gap-1">
                                                <Link
                                                    href={orgIdParam ? `/admin/candidates/${candidate.id}?report=resume&orgId=${encodeURIComponent(orgIdParam)}` : `/admin/candidates/${candidate.id}?report=resume`}
                                                    className="inline-flex h-7 px-2 items-center justify-center gap-1.5 rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors border border-violet-100"
                                                    title="Resume Report">
                                                    <FileText className="h-3 w-3" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">Resume</span>
                                                </Link>
                                                {interviewReportUnlocked ? (
                                                    <Link
                                                        href={orgIdParam ? `/admin/candidates/${candidate.id}?orgId=${encodeURIComponent(orgIdParam)}` : `/admin/candidates/${candidate.id}`}
                                                        className="inline-flex h-7 px-2 items-center justify-center gap-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-100"
                                                        title="Interview Report">
                                                        <Video className="h-3 w-3" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Interview</span>
                                                    </Link>
                                                ) : (
                                                    <span className="inline-flex h-7 px-2 items-center justify-center gap-1.5 rounded-md bg-gray-50 text-gray-400 border border-gray-200" title="Interview not yet completed">
                                                        <Lock className="h-3 w-3" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Interview</span>
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-0.5" onClick={e => e.stopPropagation()}>
                                            <span className="text-xs font-bold text-gray-600">
                                                {candidate.createdAt 
                                                    ? new Date(candidate.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
                                                    : (candidate.date || "-")}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-0.5 pr-8 text-right" onClick={e => e.stopPropagation()}>
                                            <DropdownMenu modal={false}>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">
                                                        <MoreHorizontal className="h-4 w-4 text-gray-400" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" side="bottom" sideOffset={8} collisionPadding={12}
                                                    className="w-[260px] max-h-[70vh] overflow-y-auto origin-top-right p-2.5 rounded-2xl shadow-xl border-gray-100 bg-white">
                                                    {/* Go to Job Job */}
                                                    <DropdownMenuLabel className="px-2 py-0.5.5 text-[11px] font-black uppercase tracking-[0.1em] text-gray-400 mb-1">
                                                        Job <span className="text-gray-300 font-bold">({candidate.role || "Open Role"})</span>
                                                    </DropdownMenuLabel>
                                                    <DropdownMenuItem
                                                        onClick={() => handleMoveToJob(candidate.jobId)}
                                                        disabled={!candidate.jobId}
                                                        className={cn("rounded-xl px-3 py-2.5 mb-3 text-[14px] font-bold cursor-pointer transition-colors",
                                                            candidate.jobId ? "bg-gray-50/80 text-gray-900 hover:bg-gray-100 focus:bg-gray-100" : "bg-gray-50/40 text-gray-400 opacity-70")}>
                                                        <Briefcase className="h-4 w-4 mr-3 shrink-0 text-gray-700" /> Go to Job Job
                                                    </DropdownMenuItem>
                                                    
                                                    {/* Shortlist */}
                                                    <DropdownMenuLabel className="px-2 py-0.5.5 text-[11px] font-black uppercase tracking-[0.1em] text-gray-400">Shortlist</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "shortlisted" }, `${displayName} shortlisted`)}
                                                        className="rounded-xl px-3 py-2.5 text-[14px] font-bold text-emerald-600 cursor-pointer hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-700 mb-1">
                                                        <Target className="h-4 w-4 mr-3 shrink-0" /> Shortlist
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "rejected" }, `${displayName} rejected`)}
                                                        className="rounded-xl px-3 py-2.5 text-[14px] font-bold text-rose-600 cursor-pointer hover:bg-rose-50 focus:bg-rose-50 focus:text-rose-700 mb-1">
                                                        <UserX className="h-4 w-4 mr-3 shrink-0" /> Reject
                                                    </DropdownMenuItem>
                                                    {/* Send Email */}
                                                    <DropdownMenuItem
                                                        onClick={() => !isSuspended && openSendEmailConfirm({ id: candidate.id, name: displayName, resumeStatus: candidate.status || candidate.resumeStatus })}
                                                        className={cn("rounded-xl px-3 py-2.5 text-[14px] font-bold cursor-pointer transition-colors mb-3",
                                                            isSuspended ? "text-gray-400 focus:bg-transparent" : "text-blue-600 focus:text-blue-700 focus:bg-blue-50")}
                                                        title={isSuspended ? interviewActionBlockedMessage : undefined}>
                                                        {isSuspended ? <Lock className="h-4 w-4 mr-3 shrink-0" /> : <Mail className="h-4 w-4 mr-3 shrink-0" />}
                                                        Send Schedule Link
                                                    </DropdownMenuItem>
                                                    
                                                    {/* Manage */}
                                                    <DropdownMenuLabel className="px-2 py-0.5.5 text-[11px] font-black uppercase tracking-[0.1em] text-gray-400">Manage</DropdownMenuLabel>
                                                    {/* Resend Interview Link */}
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            if (isInterviewActionBlocked) { toast.error(interviewActionBlockedMessage); return; }
                                                            handleSendInterviewLink({ id: candidate.id, name: displayName });
                                                        }}
                                                        disabled={sendingInterviewLinkId === candidate.id || !canResendInterview}
                                                        className={cn("rounded-xl px-3 py-2.5 text-[14px] font-bold cursor-pointer transition-colors mb-1",
                                                            sendingInterviewLinkId === candidate.id ? "text-gray-400 opacity-70" :
                                                                isInterviewActionBlocked ? "text-gray-400" :
                                                                    canResendInterview ? "text-blue-600 focus:text-blue-700 focus:bg-blue-50" : "text-gray-400 opacity-70")}
                                                        title={isInterviewActionBlocked ? interviewActionBlockedMessage : undefined}>
                                                        {isInterviewActionBlocked
                                                            ? <Lock className="h-4 w-4 mr-3 shrink-0" />
                                                            : <RefreshCw className={cn("h-4 w-4 mr-3 shrink-0", sendingInterviewLinkId === candidate.id && "animate-spin")} />}
                                                        {sendingInterviewLinkId === candidate.id ? "Sending..." : "Resend Schedule Link"}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => setDeleteConfirm({ mode: "single", candidateId: candidate.id, candidateName: displayName })}
                                                        className="rounded-xl px-3 py-2.5 text-[14px] font-bold cursor-pointer text-gray-600 focus:text-gray-900 focus:bg-gray-50">
                                                        <Trash2 className="h-4 w-4 mr-3 shrink-0" /> Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
                {/* Pagination */}
                <div className="flex flex-col gap-4 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between border-t border-gray-100 mt-auto shrink-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[13px] font-medium text-gray-500">
                            Showing <span className="text-gray-900 font-bold">{pagination.total > 0 ? (pagination.page - 1) * pageSize + 1 : 0}</span> to{" "}
                            <span className="text-gray-900 font-bold">{Math.min(pagination.page * pageSize, pagination.total)}</span> of{" "}
                            <span className="text-gray-900 font-bold">{pagination.total}</span> candidates
                        </p>
                        <div className="h-4 w-px bg-gray-200 hidden sm:block" />
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.22em] text-gray-400">Rows</span>
                            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); clearSelection(); }}>
                                <SelectTrigger className="h-9 w-[120px] rounded-xl border-gray-200 bg-white text-xs font-bold text-gray-700 shadow-none focus:ring-2 focus:ring-violet-100">
                                    <SelectValue placeholder="Rows" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-gray-100">
                                    {[20, 50, 100, 250, 500].map(o => (
                                        <SelectItem key={o} value={String(o)} className="rounded-lg font-semibold">{o} / page</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" disabled={pagination.page <= 1 || isLoading} onClick={() => handlePageChange(pagination.page - 1)}
                            className="h-10 px-6 rounded-xl border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-violet-600 disabled:opacity-30 transition-all shadow-none">
                            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                        </Button>
                        <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => handlePageChange(pagination.page + 1)}
                            className="h-10 px-6 rounded-xl border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-violet-600 disabled:opacity-30 transition-all shadow-none">
                            Next <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            </div>
            {/* Modals */}
            <EmailConfirmModal
                confirm={emailConfirm} onClose={() => setEmailConfirm(null)}
                onConfirm={handleSendEmailConfirmed} isBulkLoading={isBulkLoading}
                filteredCandidates={filteredCandidates} selectedIds={selectedIds}
            />
            {deleteConfirm && (() => {
                const isBulk = deleteConfirm.mode === "bulk";
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="px-6 pt-6 pb-4">
                                <h2 className="text-lg font-black text-gray-900 tracking-tight">Confirm Delete</h2>
                                <p className="mt-2 text-sm text-gray-600">
                                    {isBulk
                                        ? <>Delete <span className="font-bold text-rose-700">{selectedCount} selected candidate(s)</span>? This cannot be undone.</>
                                        : <>Delete <span className="font-bold text-rose-700">{deleteConfirm.candidateName}</span>? This cannot be undone.</>}
                                </p>
                            </div>
                            <div className="flex items-center justify-end gap-1.5 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                                <button onClick={() => setDeleteConfirm(null)} className="h-10 px-5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer">Cancel</button>
                                <button onClick={handleDeleteConfirmed} disabled={isBulkLoading}
                                    className="h-10 px-6 rounded-2xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors disabled:opacity-60 cursor-pointer">
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
