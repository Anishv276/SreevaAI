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
    Eye, Send, RefreshCw, BadgeCheck, XCircle, CheckSquare, Square,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
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
// Email confirm modal (interview link / rejection — same as drive page)
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
                    <h2 className="text-lg font-black text-gray-900 tracking-tight">Confirm Send Email</h2>
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
                <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
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
    const kpis = [
        { label: "Shortlisted", value: stats.shortlisted, icon: Target, color: "text-gray-900", bg: "bg-gray-100" },
        { label: "Hired", value: stats.hired, icon: Award, color: "text-gray-900", bg: "bg-gray-100" },
        { label: "Rejected", value: stats.rejected, icon: UserX, color: "text-rose-600", bg: "bg-rose-50" },
        { label: "Live", value: stats.interviewRunning, icon: Radio, color: "text-gray-900", bg: "bg-gray-100", pulse: stats.interviewRunning > 0 },
        { label: "Pending", value: stats.interviewPending, icon: Clock, color: "text-gray-500", bg: "bg-gray-50" },
        { label: "Completed", value: stats.interviewCompleted, icon: ShieldCheck, color: "text-gray-900", bg: "bg-gray-100" },
    ];
    if (error) return (
        <div className="w-full h-24 rounded-2xl bg-red-50/50 border border-red-100/50 flex flex-col items-center justify-center gap-1.5">
            <div className="flex items-center gap-2 text-red-600"><AlertCircle className="h-4 w-4" /><span className="text-sm font-bold">Failed to load statistics</span></div>
        </div>
    );
    if (isLoading && stats.shortlisted === 0) return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white/40 animate-pulse border border-white/20" />)}
        </div>
    );
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {kpis.map((kpi, idx) => (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                    className="group relative flex items-center gap-3 p-4 bg-white/40 backdrop-blur-xl rounded-2xl border border-white/40 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", kpi.bg, kpi.color)}>
                        <kpi.icon className={cn("h-5 w-5", (kpi as any).pulse && "animate-pulse")} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 truncate">{kpi.label}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-gray-900 tabular-nums">{kpi.value}</span>
                            {(kpi as any).pulse && (
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-500" />
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>
            ))}
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
    if (normalized === "not hired") return "Not Hired";
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
    const [hiringFilter, setHiringFilter] = useState("all");
    const [roleFilter, setRoleFilter] = useState("all");
    const [pageSize, setPageSize] = useState(20);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [isCandidatesTableReady, setIsCandidatesTableReady] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
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
    const driveIdParam = searchParams.get("driveId");
    const orgIdParam = searchParams.get("orgId");

    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || "ACTIVE").trim().toUpperCase();
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const isInterviewActionBlocked = isSuspended || quotaLocked;
    const interviewActionBlockedMessage = getInterviewActionBlockedMessage(isSuspended);
    const tableIsLoading = isLoading || !isCandidatesTableReady;

    useEffect(() => { setRoleFilter(driveIdParam || "all"); }, [driveIdParam]);

    const getDateRange = () => {
        let startDate: string | undefined, endDate: string | undefined;
        if (timeline.type === "today") { startDate = new Date().toISOString().split("T")[0]; endDate = startDate; }
        else if (timeline.type === "week") { const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "custom") { startDate = timeline.from; endDate = timeline.to; }
        return { startDate, endDate };
    };

    // Filter/search change — show skeleton, reset to page 1
    useEffect(() => {
        setIsCandidatesTableReady(false);
        const handler = setTimeout(() => {
            const { startDate, endDate } = getDateRange();
            void fetchCandidates(1, pageSize, roleFilter, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm)
                .finally(() => setIsCandidatesTableReady(true));
        }, 200);
        return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeFilter, interviewFilter, hiringFilter, roleFilter, timeline, searchTerm]);

    // Page size change — no skeleton, just refetch silently
    const pageSizeRef = useRef(pageSize);
    useEffect(() => {
        if (pageSizeRef.current === pageSize) return;
        pageSizeRef.current = pageSize;
        const { startDate, endDate } = getDateRange();
        void fetchCandidates(1, pageSize, roleFilter, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm);
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
                    const score = deriveCandidateInterviewScore(data?.interview?.skillRatings);
                    return score == null ? null : { id: candidate.id, score };
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
        fetchCandidates(page, pageSize, roleFilter, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm);
    };

    const handlePageChange = (p: number) => { if (p >= 1 && p <= pagination.totalPages) refetch(p); };

    const handleMoveToDrive = (candidateDriveId?: string | null) => {
        if (!candidateDriveId) { toast.error("This candidate is not linked to a job yet."); return; }
        const href = orgIdParam
            ? `/admin/candidates/drive/${encodeURIComponent(candidateDriveId)}?orgId=${encodeURIComponent(orgIdParam)}`
            : `/admin/candidates/drive/${encodeURIComponent(candidateDriveId)}`;
        router.push(href);
    };

    const handleUpdateStatus = async (applicationId: string, statusUpdate: { resumeStatus?: string; hiringStatus?: string }, successMsg: string) => {
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
            if (res.ok) { toast.success(data?.message || `Interview link sent to ${candidate.name}`); refetch(); return; }
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

    const handleBulkStatus = async (action: "hire" | "not_hired" | "reject" | "shortlist" | "delete") => {
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
            if (succeeded > 0) toast.success(`Interview link sent to ${succeeded} candidate(s)`);
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
                    toast.success(`Interview link sent to ${emailConfirm.candidateName}`);
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

    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-700 font-sans" style={{ zoom: 0.7, transformOrigin: "top center" }}>
            {/* Header */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-2">
                <div className="flex items-center gap-5 group">
                    <div className="h-14 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)] transition-all duration-500 group-hover:h-16" />
                    <div className="space-y-1">
                        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-none tracking-tighter">Candidates</h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-gray-400 font-bold text-[13px] uppercase tracking-[0.2em]">{pagination.total ?? 0} Total Candidates</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" disabled={isExporting}
                        onClick={async () => {
                            try {
                                setIsExporting(true);
                                let url = `/api/candidates/export?page=1&limit=1000`;
                                if (roleFilter !== "all") url += `&driveId=${roleFilter}`;
                                if (resumeFilter !== "all") url += `&resumeStatus=${resumeFilter}`;
                                if (interviewFilter !== "all") url += `&interviewStatus=${interviewFilter}`;
                                if (hiringFilter !== "all") url += `&hiringStatus=${hiringFilter}`;
                                const res = await fetch(url);
                                if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.error || "Failed to export"); }
                                const blob = await res.blob();
                                const a = document.createElement("a");
                                a.href = window.URL.createObjectURL(blob);
                                a.download = `candidates_export_${new Date().toISOString().split("T")[0]}.csv`;
                                document.body.appendChild(a); a.click(); a.remove();
                                toast.success("Export successful — CSV downloaded.");
                            } catch (err: any) {
                                toast.error(`Export Failed: ${err.message || "Failed to download."}`);
                            } finally { setIsExporting(false); }
                        }}
                        className="h-12 px-6 rounded-2xl border-white/40 bg-white/40 backdrop-blur-md text-gray-600 font-bold hover:bg-white hover:text-[#F97316] transition-all shadow-sm">
                        {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        {isExporting ? "Exporting..." : "Export"}
                    </Button>
                </div>
            </div>

            <CandidateStatsRow />

            {/* Bulk action groups — identical to drive-candidates-table */}
            {selectedCount > 0 && (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {/* Group 1: Shortlist */}
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-600 mb-2">Shortlist</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => handleBulkStatus("shortlist")} disabled={isBulkLoading}
                                className="h-8 px-3 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-xs flex items-center gap-1.5 shadow-sm hover:bg-gray-50">
                                <Target className="h-3.5 w-3.5" /> Shortlist
                            </Button>
                            <Button size="sm" onClick={() => handleBulkStatus("reject")} disabled={isBulkLoading}
                                className="h-8 px-3 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-xs flex items-center gap-1.5 shadow-sm hover:bg-gray-50">
                                <UserX className="h-3.5 w-3.5" /> Reject
                            </Button>
                            {/* Email: locked when suspended, not hidden */}
                            <Button size="sm" onClick={isSuspended ? undefined : openBulkSendEmailConfirm}
                                disabled={isBulkLoading}
                                title={isSuspended ? interviewActionBlockedMessage : undefined}
                                className={cn("h-8 px-3 rounded-xl border border-gray-200 font-bold text-xs flex items-center gap-1.5 shadow-sm",
                                    isSuspended ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "bg-white text-gray-900 hover:bg-gray-50")}>
                                {isSuspended ? <Lock className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />} Send Email
                            </Button>
                        </div>
                    </div>

                    {/* Group 2: Hire */}
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-indigo-600 mb-2">Hire</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => handleBulkStatus("hire")} disabled={isBulkLoading}
                                className="h-8 px-3 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-xs flex items-center gap-1.5 shadow-sm hover:bg-gray-50">
                                <BadgeCheck className="h-3.5 w-3.5" /> Hire
                            </Button>
                            <Button size="sm" onClick={() => handleBulkStatus("not_hired")} disabled={isBulkLoading}
                                className="h-8 px-3 rounded-xl border border-gray-200 bg-white text-gray-900 font-bold text-xs flex items-center gap-1.5 shadow-sm hover:bg-gray-50">
                                <UserX className="h-3.5 w-3.5" /> Not Hired
                            </Button>
                        </div>
                    </div>

                    {/* Group 3: Interview Link — locked (not hidden) when suspended/quota */}
                    <div className="rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-orange-600 mb-2">Interview Link</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm"
                                onClick={isInterviewActionBlocked ? undefined : handleBulkSendInterviewLink}
                                disabled={isBulkLoading}
                                title={isInterviewActionBlocked ? interviewActionBlockedMessage : undefined}
                                className={cn("h-8 px-3 rounded-xl border border-gray-200 font-bold text-xs flex items-center gap-1.5 shadow-sm",
                                    isInterviewActionBlocked ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "bg-white text-gray-900 hover:bg-gray-50")}>
                                {isInterviewActionBlocked ? <Lock className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Resend Link
                            </Button>
                        </div>
                    </div>

                    {/* Group 4: Delete */}
                    <div className="rounded-2xl border border-red-100 bg-red-50/40 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-red-500 mb-2">Remove</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setDeleteConfirm({ mode: "bulk" })} disabled={isBulkLoading}
                                className="h-8 px-3 rounded-xl border-red-200 text-red-600 font-bold text-xs flex items-center gap-1.5 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs font-bold text-red-900 uppercase tracking-tighter">Sync Error: {error}</span>
                    </div>
                    <button onClick={clearError} className="text-red-600 hover:text-red-800 transition-colors"><X className="h-4 w-4" /></button>
                </div>
            )}

            {/* Table */}
            <div className="group relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400/0 via-[#F97316]/40 to-orange-400/0" />
                <div className="p-3 border-b border-white/40 bg-white/20">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
                        <div className="relative flex-1 max-w-2xl w-full group/search">
                            <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400 group-focus-within/search:text-black transition-colors" />
                            <Input placeholder="Search by name, role, or email..."
                                className="pl-11 h-12 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-gray-200 focus:ring-8 focus:ring-gray-50/50 transition-all font-bold text-sm shadow-inner"
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
                            <DateFilter value={timeline} onChange={setTimeline} />
                            <PremiumFilter value={resumeFilter} onChange={setResumeFilter} icon={Target} placeholder="Resume"
                                options={[
                                    { value: "all", label: "All Status" },
                                    { value: "shortlisted", label: "Shortlisted", colorClass: "text-emerald-600" },
                                    { value: "rejected", label: "Rejected", colorClass: "text-rose-600" },
                                    { value: "pending", label: "Pending", colorClass: "text-slate-600" },
                                ]} />
                            <PremiumFilter value={interviewFilter} onChange={setInterviewFilter} icon={Radio} placeholder="Interview"
                                options={[
                                    { value: "all", label: "All Interview" },
                                    { value: "pending", label: "Pending", colorClass: "text-amber-600" },
                                    { value: "inprogress", label: "In Progress", colorClass: "text-orange-600" },
                                    { value: "finished", label: "Completed", colorClass: "text-indigo-600" },
                                ]} />
                            <PremiumFilter value={hiringFilter} onChange={setHiringFilter} icon={BadgeCheck} placeholder="Hiring"
                                options={[
                                    { value: "all", label: "All Hiring" },
                                    { value: "hired", label: "Hired", colorClass: "text-emerald-600" },
                                    { value: "not hired", label: "Not Hired", colorClass: "text-rose-600" },
                                    { value: "pending", label: "Pending", colorClass: "text-slate-600" },
                                ]} />
                            <PremiumFilter value={roleFilter} onChange={setRoleFilter} icon={Briefcase} placeholder="All Job Roles"
                                options={[
                                    { value: "all", label: "All Job Roles" },
                                    ...jobs.map(job => ({ value: job.id.toString(), label: job.role || job.title || "Unknown Job" }))
                                ]} />
                        </div>
                    </div>
                </div>

                <div className="relative w-full overflow-auto max-h-[86vh]">
                    <Table>
                        <TableHeader className="bg-gray-50/50 sticky top-0 z-10 backdrop-blur-md">
                            <TableRow className="border-b border-gray-100 hover:bg-transparent">
                                <TableHead className="w-[56px] pl-6 font-bold uppercase tracking-wider text-[11px] text-gray-500">
                                    <button type="button" onClick={toggleSelectAll}
                                        className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:text-[#F97316] transition-colors">
                                        {isAllSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                    </button>
                                </TableHead>
                                <TableHead className="w-[52px] pl-2 font-bold uppercase tracking-wider text-[11px] text-gray-500">#</TableHead>
                                <TableHead className="w-[240px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Candidate</TableHead>
                                <TableHead className="w-[180px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Job Role</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Hiring</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume Report</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview Report</TableHead>
                                <TableHead className="text-right pr-8 h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0">
                            {tableIsLoading ? (
                                <TableRow><TableCell colSpan={10} className="py-12 text-center text-sm font-bold text-gray-400">Loading candidates...</TableCell></TableRow>
                            ) : filteredCandidates.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="py-12 text-center text-sm font-bold text-gray-400">No candidates found for selected filters</TableCell></TableRow>
                            ) : filteredCandidates.map((candidate: any, index: number) => {
                                const displayName = candidate.fullName || candidate.name || "Unknown";
                                const displayEmail = candidate.email || "";
                                const mainStatus = normalizeStatusKey(candidate.status || candidate.resumeStatus) || "pending";
                                const mainStatusLabel = formatCandidateStatusLabel(candidate.status || candidate.resumeStatus);
                                const interviewStage = normalizeStatusKey(candidate.interviewStatus) || "pending";
                                const interviewStageLabel = formatCandidateStatusLabel(candidate.interviewStatus);
                                const interviewReportUnlocked = interviewStage === "completed" || interviewStage === "finished";
                                const hiringDecision = normalizeStatusKey(candidate.hiringStatus) || "pending";
                                const hiringDecisionLabel = formatCandidateStatusLabel(candidate.hiringStatus);
                                const resumeScore = Number(candidate.score ?? candidate.aiScore ?? 0);
                                const interviewScore = interviewScoresById[candidate.id] ?? (interviewReportUnlocked ? 0 : null);
                                const canResendInterview = interviewStage === "pending" || interviewStage === "in progress" || interviewStage === "completed" || interviewStage === "finished" || mainStatus === "shortlisted";

                                return (
                                    <TableRow key={candidate.id}
                                        onClick={() => toggleSelection(candidate.id)}
                                        className={cn(
                                            "group border-b border-white/20 hover:bg-white/40 transition-all duration-500 cursor-pointer",
                                            selectedIds.has(candidate.id) && "bg-orange-50/30"
                                        )}>
                                        <TableCell className="pl-6 py-5" onClick={e => e.stopPropagation()}>
                                            <Checkbox checked={selectedIds.has(candidate.id)} onCheckedChange={() => toggleSelection(candidate.id)} onClick={e => e.stopPropagation()} />
                                        </TableCell>
                                        <TableCell className="pl-2 py-5 text-[12px] font-bold text-gray-400 tabular-nums">
                                            {index + 1 + (pagination.page - 1) * pageSize}
                                        </TableCell>
                                        <TableCell className="py-5">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-11 w-11 border-2 border-white shadow-sm ring-1 ring-gray-100">
                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} />
                                                    <AvatarFallback>{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span className="text-gray-900 font-extrabold text-[15px] leading-tight">{displayName}</span>
                                                    <span className="text-[11px] text-gray-400 font-bold mt-0.5">{displayEmail}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5">
                                            <div className="flex flex-col max-w-[180px]">
                                                <span className="text-sm font-bold text-gray-700 truncate">{candidate.role}</span>
                                                {candidate.location && candidate.location !== "-" && (
                                                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5 truncate">{candidate.location}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex flex-col items-center gap-1">
                                                {resumeScore > 0 && (
                                                    <span className={cn("text-[11px] font-black tracking-tight",
                                                        resumeScore >= 80 ? "text-emerald-600" : resumeScore >= 50 ? "text-amber-500" : "text-rose-500")}>
                                                        {resumeScore}%
                                                    </span>
                                                )}
                                                <Badge variant="secondary" className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm pointer-events-none",
                                                    mainStatus === "shortlisted" ? "bg-emerald-50 text-emerald-700" :
                                                        mainStatus === "rejected" ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-500"
                                                )}>{mainStatusLabel}</Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex flex-col items-center gap-1">
                                                {interviewScore != null && interviewScore >= 0 && (
                                                    <span className={cn(
                                                        "text-[11px] font-black tracking-tight",
                                                        interviewScore >= 80 ? "text-emerald-600" : interviewScore >= 50 ? "text-amber-500" : "text-rose-500"
                                                    )}>
                                                        {interviewScore}%
                                                    </span>
                                                )}
                                                <Badge variant="secondary" className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm pointer-events-none",
                                                    interviewStage === "completed" || interviewStage === "finished" ? "bg-indigo-50 text-indigo-700" :
                                                        interviewStage === "in progress" ? "bg-blue-50 text-blue-700" :
                                                            interviewStage === "pending" ? "bg-slate-50 text-slate-500" : "bg-amber-50 text-amber-700"
                                                )}>{interviewStageLabel}</Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 text-center" onClick={e => e.stopPropagation()}>
                                            <Badge variant="secondary" className={cn(
                                                "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm pointer-events-none",
                                                hiringDecision === "hired" ? "bg-emerald-50 text-emerald-700" :
                                                    hiringDecision === "not hired" ? "bg-rose-50 text-rose-700" :
                                                        hiringDecision === "not shortlisted" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"
                                            )}>{hiringDecisionLabel}</Badge>
                                        </TableCell>
                                        <TableCell className="py-5 text-center" onClick={e => e.stopPropagation()}>
                                            <Link
                                                href={orgIdParam
                                                    ? `/admin/candidates/${candidate.id}?report=resume&orgId=${encodeURIComponent(orgIdParam)}`
                                                    : `/admin/candidates/${candidate.id}?report=resume`}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#F97316] transition-colors hover:bg-orange-50"
                                                title="Open resume report">
                                                <Eye className="h-4 w-4" />
                                            </Link>
                                        </TableCell>
                                        <TableCell className="py-5 text-center" onClick={e => e.stopPropagation()}>
                                            {interviewReportUnlocked ? (
                                                <Link
                                                    href={orgIdParam
                                                        ? `/admin/candidates/${candidate.id}?orgId=${encodeURIComponent(orgIdParam)}`
                                                        : `/admin/candidates/${candidate.id}`}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#0D4D2E] transition-colors hover:bg-emerald-50"
                                                    title="Open interview report">
                                                    <FileText className="h-4 w-4" />
                                                </Link>
                                            ) : (
                                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-300" title="Interview not yet completed">
                                                    <Lock className="h-4 w-4" />
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-5 pr-8 text-right" onClick={e => e.stopPropagation()}>
                                            <DropdownMenu modal={false}>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">
                                                        <MoreHorizontal className="h-4 w-4 text-gray-400" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" side="bottom" sideOffset={8} collisionPadding={12}
                                                    className="w-64 max-h-[70vh] overflow-y-auto origin-top-right p-2 rounded-2xl shadow-xl border-gray-100 bg-white">

                                                    {/* Go to Job Drive — extra on candidates page */}
                                                    <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                        Job <span className="ml-1 text-gray-300">({candidate.role || "Open Role"})</span>
                                                    </DropdownMenuLabel>
                                                    <DropdownMenuItem
                                                        onClick={() => handleMoveToDrive(candidate.driveId)}
                                                        disabled={!candidate.driveId}
                                                        className={cn("rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer transition-colors",
                                                            candidate.driveId ? "text-gray-700 focus:text-gray-900 focus:bg-gray-50" : "text-gray-400 opacity-70")}>
                                                        <Briefcase className="h-4 w-4 mr-2 shrink-0" /> Go to Job Drive
                                                    </DropdownMenuItem>

                                                    {/* Shortlist */}
                                                    <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Shortlist</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "shortlisted" }, `${displayName} shortlisted`)}
                                                        className="rounded-xl px-2.5 py-2 text-sm font-semibold text-emerald-600 cursor-pointer hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-700">
                                                        <Target className="h-4 w-4 mr-2 shrink-0" /> Shortlist
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "rejected" }, `${displayName} rejected`)}
                                                        className="rounded-xl px-2.5 py-2 text-sm font-semibold text-rose-600 cursor-pointer hover:bg-rose-50 focus:bg-rose-50 focus:text-rose-700">
                                                        <UserX className="h-4 w-4 mr-2 shrink-0" /> Reject
                                                    </DropdownMenuItem>
                                                    {/* Send Email — locked when suspended */}
                                                    <DropdownMenuItem
                                                        onClick={() => !isSuspended && openSendEmailConfirm({ id: candidate.id, name: displayName, resumeStatus: candidate.status || candidate.resumeStatus })}
                                                        className={cn("rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer transition-colors",
                                                            isSuspended ? "text-gray-400 focus:bg-transparent" : "text-blue-600 focus:text-blue-700 focus:bg-blue-50")}
                                                        title={isSuspended ? interviewActionBlockedMessage : undefined}>
                                                        {isSuspended ? <Lock className="h-4 w-4 mr-2 shrink-0" /> : <Mail className="h-4 w-4 mr-2 shrink-0" />}
                                                        Send Email
                                                    </DropdownMenuItem>

                                                    {/* Hire */}
                                                    <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Hire</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { hiringStatus: "hired" }, `${displayName} hired`)}
                                                        className="rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50">
                                                        <BadgeCheck className="h-4 w-4 mr-2 shrink-0" /> Hire
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { hiringStatus: "not hired" }, `${displayName} marked as not hired`)}
                                                        className="rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                                                        <XCircle className="h-4 w-4 mr-2 shrink-0" /> Not Hired
                                                    </DropdownMenuItem>

                                                    {/* Manage */}
                                                    <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Manage</DropdownMenuLabel>
                                                    {/* Resend Interview Link — locked (not hidden) when suspended/quota */}
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            if (isInterviewActionBlocked) { toast.error(interviewActionBlockedMessage); return; }
                                                            handleSendInterviewLink({ id: candidate.id, name: displayName });
                                                        }}
                                                        disabled={sendingInterviewLinkId === candidate.id || !canResendInterview}
                                                        className={cn("rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer transition-colors",
                                                            sendingInterviewLinkId === candidate.id ? "text-gray-400 opacity-70" :
                                                                isInterviewActionBlocked ? "text-gray-400" :
                                                                    canResendInterview ? "text-blue-600 focus:text-blue-700 focus:bg-blue-50" : "text-gray-400 opacity-70")}
                                                        title={isInterviewActionBlocked ? interviewActionBlockedMessage : undefined}>
                                                        {isInterviewActionBlocked
                                                            ? <Lock className="h-4 w-4 mr-2 shrink-0" />
                                                            : <RefreshCw className={cn("h-4 w-4 mr-2 shrink-0", sendingInterviewLinkId === candidate.id && "animate-spin")} />}
                                                        {sendingInterviewLinkId === candidate.id ? "Sending..." : "Resend Interview Link"}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => setDeleteConfirm({ mode: "single", candidateId: candidate.id, candidateName: displayName })}
                                                        className="rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer text-gray-600 focus:text-gray-900 focus:bg-gray-50">
                                                        <Trash2 className="h-4 w-4 mr-2 shrink-0" /> Delete
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
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-4 border-t border-white/20 bg-white/20 px-4 py-5 backdrop-blur-xl rounded-2xl lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[13px] font-medium text-gray-500">
                        Showing <span className="text-gray-900 font-bold">{pagination.total > 0 ? (pagination.page - 1) * pageSize + 1 : 0}</span> to{" "}
                        <span className="text-gray-900 font-bold">{Math.min(pagination.page * pageSize, pagination.total)}</span> of{" "}
                        <span className="text-gray-900 font-bold">{pagination.total}</span> candidates
                    </p>
                    <div className="h-4 w-px bg-gray-200 hidden sm:block" />
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">Rows</span>
                        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); clearSelection(); }}>
                            <SelectTrigger className="h-9 w-[120px] rounded-xl border-gray-200 bg-white text-sm font-bold text-gray-700 shadow-none focus:ring-2 focus:ring-orange-100">
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
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" disabled={pagination.page <= 1 || isLoading} onClick={() => handlePageChange(pagination.page - 1)}
                        className="h-10 px-6 rounded-xl border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-[#F97316] disabled:opacity-30 transition-all shadow-none">
                        <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => handlePageChange(pagination.page + 1)}
                        className="h-10 px-6 rounded-xl border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-[#F97316] disabled:opacity-30 transition-all shadow-none">
                        Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
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
                            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                                <button onClick={() => setDeleteConfirm(null)} className="h-10 px-5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                                <button onClick={handleDeleteConfirmed} disabled={isBulkLoading}
                                    className="h-10 px-6 rounded-2xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors disabled:opacity-60">
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
