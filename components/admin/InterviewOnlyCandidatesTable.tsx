"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";
import {
    AlertCircle, FileText, Search, Lock, XCircle,
    RefreshCw, Trash2, Loader2, MoreHorizontal, ChevronDown,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StatusTab = "all" | "pending" | "inprogress" | "completed";

function fmtDate(iso?: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso?: string | null) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function interviewStatusKey(v?: string) {
    return String(v || "").trim().toLowerCase().replace(/[_-]+/g, " ") || "pending";
}
function interviewStatusLabel(v?: string) {
    const k = interviewStatusKey(v);
    if (k === "completed" || k === "finished") return "Completed";
    if (k === "inprogress" || k === "in progress") return "In Progress";
    if (k === "pending") return "Pending";
    return k.replace(/\b\w/g, c => c.toUpperCase()) || "Pending";
}

const STATUS_TABS: { key: StatusTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "inprogress", label: "In Progress" },
    { key: "completed", label: "Completed" },
];

export function InterviewOnlyCandidatesTable({ driveId, refreshKey }: { driveId: string; refreshKey?: number }) {
    const { candidates, pagination, isLoading, error, fetchCandidates, clearError } = useCandidates();
    const { jobs } = useJobs();
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<StatusTab>("all");
    const [pageSize] = useState(20);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [sendingId, setSendingId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ mode: "single" | "bulk"; candidateId?: string; candidateName?: string } | null>(null);
    const [isDriveViewReady, setIsDriveViewReady] = useState(false);

    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || "").trim().toUpperCase();
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const isActionBlocked = isSuspended || quotaLocked;

    const interviewFilter = activeTab === "all" ? "all" : activeTab;

    const refetch = (opts?: { background?: boolean; force?: boolean }) =>
        fetchCandidates(pagination.page, pageSize, driveId, "all", interviewFilter, undefined, undefined, searchTerm, "default", opts);

    useEffect(() => {
        let cancelled = false;
        if (!isDriveViewReady) setSelectedIds(new Set());
        const h = setTimeout(() => {
            void fetchCandidates(1, pageSize, driveId, "all", interviewFilter, undefined, undefined, searchTerm, "default", { background: isDriveViewReady })
                .finally(() => { if (!cancelled) setIsDriveViewReady(true); });
        }, 500);
        return () => { cancelled = true; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [driveId, interviewFilter, searchTerm, fetchCandidates, refreshKey]);

    const handlePageChange = (n: number) => {
        if (n < 1 || n > pagination.totalPages) return;
        fetchCandidates(n, pageSize, driveId, "all", interviewFilter, undefined, undefined, searchTerm, "default");
    };

    const filteredCandidates = candidates.filter((c: any) => c.driveId === driveId);
    const selectedCount = selectedIds.size;
    const isAllSelected = filteredCandidates.length > 0 && filteredCandidates.every((c: any) => selectedIds.has(c.id));

    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (isAllSelected) filteredCandidates.forEach((c: any) => next.delete(c.id));
            else filteredCandidates.forEach((c: any) => next.add(c.id));
            return next;
        });
    };
    const toggleSelected = (id: string) => {
        setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    };

    const handleSendInvite = async (candidate: { id: string; name: string }) => {
        if (isActionBlocked) { toast.error(getInterviewActionBlockedMessage(isSuspended)); return; }
        try {
            setSendingId(candidate.id);
            const res = await fetch(`/api/candidates/${candidate.id}/send-interview-link`, { method: "POST" });
            const data = await res.json().catch(() => null);
            if (res.ok) { toast.success(data?.message || `Interview link sent to ${candidate.name}`); refetch({ background: true, force: true }); return; }
            toast.error(data?.error || "Failed to send interview link");
        } catch { toast.error("Failed to send interview link"); }
        finally { setSendingId(null); }
    };

    const handleBulkSendInvite = async () => {
        if (!selectedCount || isBulkLoading || isActionBlocked) return;
        setIsBulkLoading(true);
        try {
            const results = await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/candidates/${id}/send-interview-link`, { method: "POST" })));
            const failed = results.filter(r => !r.ok).length;
            if (results.length - failed > 0) toast.success(`Interview link sent to ${results.length - failed} candidate(s)`);
            if (failed > 0) toast.error(`Failed to send to ${failed} candidate(s)`);
            setSelectedIds(new Set());
            refetch({ background: true, force: true });
        } catch { toast.error("Failed to send interview links"); }
        finally { setIsBulkLoading(false); }
    };

    const handleDeleteConfirmed = async () => {
        if (!deleteConfirm) return;
        setIsBulkLoading(true);
        try {
            if (deleteConfirm.mode === "single" && deleteConfirm.candidateId) {
                const res = await fetch(`/api/candidates/${deleteConfirm.candidateId}`, { method: "DELETE" });
                if (res.ok) { toast.success(`${deleteConfirm.candidateName || "Candidate"} deleted`); refetch({ background: true, force: true }); }
                else toast.error("Failed to delete candidate");
            } else if (deleteConfirm.mode === "bulk") {
                const res = await fetch("/api/candidates/bulk-action", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
                });
                if (res.ok) { toast.success("Selected candidates deleted"); setSelectedIds(new Set()); refetch({ background: true, force: true }); }
                else toast.error("Failed to delete candidates");
            }
        } catch { toast.error("Failed to delete"); }
        finally { setIsBulkLoading(false); setDeleteConfirm(null); }
    };

    const driveTitle = jobs.find((j) => j.id === driveId)?.title || "Job";

    if (!isDriveViewReady) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading candidates...</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* ── Filter row: pill tabs + dropdown + bulk actions ── */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-gray-100 flex-wrap">
                {/* Left: Interview status dropdown */}
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={cn(
                                "flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-bold transition-all border focus:outline-none",
                                activeTab !== "all"
                                    ? "bg-[#7C3AED] text-white border-[#7C3AED] shadow-sm"
                                    : "text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800 bg-white"
                            )}>
                                {activeTab === "all" ? "Interview" :
                                    activeTab === "pending" ? "Pending" :
                                    activeTab === "inprogress" ? "In Progress" :
                                    "Completed"}
                                {activeTab === "all" && pagination.total > 0 && (
                                    <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                                        {pagination.total}
                                    </span>
                                )}
                                <ChevronDown className="h-3 w-3 ml-0.5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44 p-1.5 rounded-xl shadow-lg border-gray-100 bg-white">
                            <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Interview Status</DropdownMenuLabel>
                            {STATUS_TABS.map(tab => (
                                <DropdownMenuItem key={tab.key} onClick={() => setActiveTab(tab.key)}
                                    className={cn("rounded-lg px-3 py-2 text-[12px] font-semibold cursor-pointer flex items-center justify-between",
                                        activeTab === tab.key ? "text-[#7C3AED] bg-violet-50" : "text-gray-700"
                                    )}>
                                    {tab.label}
                                    {activeTab === tab.key && <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Right: bulk actions + search */}
                <div className="flex items-center gap-2">
                    {selectedCount > 0 && (
                        <>
                            <button
                                onClick={handleBulkSendInvite}
                                disabled={isBulkLoading || isActionBlocked}
                                className={cn("h-8 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors",
                                    isActionBlocked ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-violet-200 bg-white text-[#7C3AED] hover:bg-violet-50")}
                            >
                                {isActionBlocked ? <Lock className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                Resend Invite ({selectedCount})
                            </button>
                            <button
                                onClick={() => setDeleteConfirm({ mode: "bulk" })}
                                disabled={isBulkLoading}
                                className="h-8 px-3 rounded-full border border-red-200 bg-white text-[12px] font-semibold text-red-600 hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedCount})
                            </button>
                        </>
                    )}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                        <Input
                            placeholder="Search candidates..."
                            className="pl-8 h-8 w-48 border-gray-200 rounded-full text-[12px] font-medium focus:border-violet-400 focus:ring-1 focus:ring-violet-200 bg-gray-50"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {error && (
                <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-[12px] font-semibold text-red-700">{error}</span>
                    </div>
                    <button onClick={clearError}><XCircle className="h-4 w-4 text-red-400 hover:text-red-600" /></button>
                </div>
            )}

            {/* Table — screenshot flat style */}
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-gray-100">
                            <th className="w-10 px-4 py-3">
                                <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} />
                            </th>
                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Candidate</th>
                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Position</th>
                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Created</th>
                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Invited</th>
                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Status</th>
                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400">Report</th>
                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={8} className="py-16 text-center text-[13px] font-semibold text-gray-400">Loading candidates...</td></tr>
                        ) : filteredCandidates.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-16 text-center">
                                    <p className="text-[14px] font-bold text-gray-400">No candidates yet</p>
                                    <p className="text-[12px] text-gray-300 mt-1">Use Bulk Upload or + Add Candidate to get started</p>
                                </td>
                            </tr>
                        ) : filteredCandidates.map((candidate: any, idx: number) => {
                            const displayName = candidate.fullName || candidate.name || "Unknown";
                            const displayEmail = candidate.email || "";
                            const statusKey = interviewStatusKey(candidate.interviewStatus);
                            const statusLbl = interviewStatusLabel(candidate.interviewStatus);
                            const isDone = statusKey === "completed" || statusKey === "finished";
                            const isInProgress = statusKey === "in progress" || statusKey === "inprogress";
                            const inviteSentAt = candidate.interview?.inviteSentAt || candidate.inviteSentAt;
                            const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

                            return (
                                <tr
                                    key={candidate.id}
                                    onClick={() => toggleSelected(candidate.id)}
                                    className={cn(
                                        "border-b border-gray-50 hover:bg-gray-50/60 transition-colors cursor-pointer group",
                                        selectedIds.has(candidate.id) && "bg-blue-50/40"
                                    )}
                                >
                                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                                        <Checkbox checked={selectedIds.has(candidate.id)} onCheckedChange={() => toggleSelected(candidate.id)} onClick={e => e.stopPropagation()} />
                                    </td>
                                    {/* Candidate */}
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-[11px] font-black text-gray-500 shrink-0">
                                                {initials}
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-semibold text-gray-900 leading-tight">{displayName}</p>
                                                <p className="text-[11px] text-gray-400">{displayEmail}</p>
                                            </div>
                                        </div>
                                    </td>
                                    {/* Position */}
                                    <td className="px-4 py-3.5">
                                        <span className="text-[12px] text-gray-600 font-medium">{driveTitle}</span>
                                    </td>
                                    {/* Created */}
                                    <td className="px-4 py-3.5">
                                        <span className="text-[12px] text-gray-500">{fmtDate(candidate.createdAt)}</span>
                                    </td>
                                    {/* Invited */}
                                    <td className="px-4 py-3.5">
                                        {inviteSentAt ? (
                                            <div>
                                                <p className="text-[12px] text-gray-700 font-medium">{fmtDate(inviteSentAt)}</p>
                                                <p className="text-[11px] text-gray-400">{fmtTime(inviteSentAt)}</p>
                                            </div>
                                        ) : (
                                            <span className="text-[12px] text-gray-300">Not sent</span>
                                        )}
                                    </td>
                                    {/* Status */}
                                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <div className={cn(
                                                "h-2 w-2 rounded-full shrink-0",
                                                isDone ? "bg-emerald-500" : isInProgress ? "bg-blue-500" : "bg-gray-300"
                                            )} />
                                            <span className={cn(
                                                "text-[12px] font-semibold",
                                                isDone ? "text-emerald-700" : isInProgress ? "text-blue-700" : "text-gray-500"
                                            )}>{statusLbl}</span>
                                        </div>
                                    </td>
                                    {/* Report */}
                                    <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                                        {isDone ? (
                                            <Link
                                                href={`/admin/candidates/${candidate.id}?back=${encodeURIComponent(`/admin/candidates/drive/${driveId}`)}`}
                                                className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                                            >
                                                <FileText className="h-3.5 w-3.5" /> View
                                            </Link>
                                        ) : (
                                            <span className="text-[12px] text-gray-300 flex items-center gap-1">
                                                <Lock className="h-3 w-3" /> Locked
                                            </span>
                                        )}
                                    </td>
                                    {/* Action */}
                                    <td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                                        <DropdownMenu modal={false}>
                                            <DropdownMenuTrigger asChild>
                                                <button className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" sideOffset={6} className="w-52 p-1.5 rounded-xl shadow-lg border-gray-100 bg-white">
                                                <DropdownMenuItem
                                                    onClick={() => !isActionBlocked && handleSendInvite({ id: candidate.id, name: displayName })}
                                                    disabled={sendingId === candidate.id || isActionBlocked}
                                                    className={cn(
                                                        "rounded-lg px-3 py-2 text-[13px] font-semibold cursor-pointer",
                                                        isActionBlocked ? "text-gray-400" : "text-blue-600 focus:bg-blue-50"
                                                    )}
                                                >
                                                    {sendingId === candidate.id
                                                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        : <RefreshCw className="h-4 w-4 mr-2" />
                                                    }
                                                    {sendingId === candidate.id ? "Sending…" : "Resend Interview Link"}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => setDeleteConfirm({ mode: "single", candidateId: candidate.id, candidateName: displayName })}
                                                    className="rounded-lg px-3 py-2 text-[13px] font-semibold cursor-pointer text-red-600 focus:bg-red-50"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
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

            {/* Pagination */}
            {!isLoading && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-[12px] text-gray-500">
                    <span>Showing {pagination.total > 0 ? (pagination.page - 1) * pageSize + 1 : 0}–{Math.min(pagination.page * pageSize, pagination.total)} of {pagination.total}</span>
                    <div className="flex gap-2">
                        <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1} className="h-7 px-3 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40">Previous</button>
                        <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="h-7 px-3 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40">Next</button>
                    </div>
                </div>
            )}

            <ActionConfirmModal
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={handleDeleteConfirmed}
                title={deleteConfirm?.mode === "bulk" ? `Delete ${selectedCount} candidates` : `Delete ${deleteConfirm?.candidateName || "candidate"}`}
                description="This cannot be undone."
                confirmText="Delete"
                isLoading={isBulkLoading}
            />
        </div>
    );
}
