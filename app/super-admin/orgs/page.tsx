"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
    Edit2,
    Plus,
    Users,
    Briefcase,
    Search,
    Eye,
    Loader2,
    Globe,
    Trash2,
    Sparkles,
    MoreVertical,
    AlertCircle,
    Clock,
    ShieldOff,
    Target,
    ShieldCheck,
    Award,
    Radio,
    Building2,
    Zap,
    Layers,
    Download,
    CheckSquare,
    Check,
    ChevronDown
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Skeleton as Shimmer } from "@/components/ui/skeleton";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-custom";
import { formatOrgPlan } from "@/lib/org-plans";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
interface Org {
    id: string;
    name: string;
    urlSlug: string;
    billingPlan: string;
    status: string;
    adminCount: number;
    jobCount: number;
    candidateCount: number;
    // AI Config (Setup)
    allowedVoiceIds?: string[];
    deepgramModel?: string;
    billingCreditsUsed?: number;
    interviewsCompleted?: number;
    totalInterviewsAllowed?: number;
    totalInterviewsUsed?: number;
    interviewCount?: number;
    _count?: {
        users: number;
        jobs: number;
    };
}
export default function OrgsPage() {
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [stats, setStats] = useState<any>({});
    const [loading, setLoading] = useState(true);
    // Pagination & Search state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const limit = 20;
    // Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [orgToDelete, setOrgToDelete] = useState<Org | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [syncingOrgs, setSyncingOrgs] = useState<Set<string>>(new Set());
    const [statusModalOrg, setStatusModalOrg] = useState<{ id: string; name: string; currentStatus: string; pendingStatus: string } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const cleanName = (n: string) => {
        // Strip provider prefix (e.g. "openai:gpt-4o" -> "gpt-4o")
        const base = n.includes(':') ? n.split(':')[1] : n;
        // Strip date version suffix (e.g. "gpt-4o-mini-2024-07-18" -> "gpt-4o-mini")
        const cleaned = base.replace(/-\d{4}-\d{2}-\d{2}$/, '');
        return cleaned.trim();
    };
    const fetchOrgs = async (currentPage = page, query = search, dateRange = timeFilter) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: String(limit),
                ...(query ? { q: query } : {}),
            });
            if (dateRange.type !== "all") {
                const now = new Date();
                let from = new Date();
                let to = new Date();
                if (dateRange.type === "today") {
                    from.setHours(0, 0, 0, 0);
                    to.setHours(23, 59, 59, 999);
                } else if (dateRange.type === "week") {
                    from.setDate(now.getDate() - 7);
                } else if (dateRange.type === "month") {
                    from.setDate(now.getDate() - 30);
                } else if (dateRange.type === "custom") {
                    from = new Date(dateRange.from);
                    to = new Date(dateRange.to);
                    to.setHours(23, 59, 59, 999);
                }
                params.append("from", from.toISOString());
                params.append("to", to.toISOString());
            }
            const res = await fetch(`/api/super-admin/orgs?${params}`);
            const data = await res.json();
            if (data.orgs) {
                setOrgs(data.orgs);
                setTotal(data.pagination.total);
                setTotalPages(data.pagination.totalPages);
                if (data.stats) setStats(data.stats);
            } else {
                setOrgs([]);
            }
        } catch (error) {
            console.error("Error fetching orgs:", error);
            setOrgs([]);
        } finally {
            setLoading(false);
        }
    };
    const [timeFilter, setTimeFilter] = useState<DateRange>({ type: "all" });
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchInput]);
    useEffect(() => {
        fetchOrgs(page, search, timeFilter);
    }, [page, search, timeFilter]);
    const handleStatusChange = async (orgId: string, newStatus: string) => {
        const org = orgs.find(o => o.id === orgId);
        if (!org || org.status === newStatus) return;
        setStatusModalOrg({
            id: orgId,
            name: org.name,
            currentStatus: org.status || "ACTIVE",
            pendingStatus: newStatus
        });
    };
    const confirmStatusUpdate = async () => {
        if (!statusModalOrg) return;
        const { id: orgId, name: orgName, pendingStatus: newStatus, currentStatus: previousStatus } = statusModalOrg;
        setIsUpdatingStatus(true);
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: newStatus } : o));
        setSyncingOrgs(prev => new Set(prev).add(orgId));
        setStatusModalOrg(null);
        try {
            const res = await fetch(`/api/super-admin/orgs/${orgId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error("Failed to update status");
            const normalizedStatus = newStatus.toUpperCase();
            if (normalizedStatus === "SUSPENDED") toast.info(`${orgName} has been suspended.`);
            else if (normalizedStatus === "ACTIVE") toast.success(`${orgName} is now active.`);
            else if (normalizedStatus === "CLOSED") toast.error(`${orgName} has been closed.`);
            else toast.success(`${orgName} status updated to ${newStatus.toLowerCase()}`);
            await fetchOrgs(page, search, timeFilter);
        } catch (error) {
            setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: previousStatus } : o));
            toast.error("Cloud sync failed. Reverting status.");
        } finally {
            setIsUpdatingStatus(false);
            setSyncingOrgs(prev => {
                const updated = new Set(prev);
                updated.delete(orgId);
                return updated;
            });
        }
    };
    const confirmDelete = async () => {
        if (!orgToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/super-admin/orgs/${orgToDelete.id}`, { method: "DELETE" });
            if (res.ok) {
                fetchOrgs(page, search, timeFilter);
                setIsDeleteModalOpen(false);
                setOrgToDelete(null);
            }
        } catch (error) {
            console.error("Error deleting org:", error);
        } finally {
            setIsDeleting(false);
        }
    };
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            {/* Header Area */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Organizations</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{total} total clients</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <Link href="/super-admin/orgs/new">
                        <button className="btn-shimmer inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium text-white transition-all" style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}>
                            <Plus className="h-4 w-4" />
                            Add Client
                        </button>
                    </Link>
                </div>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: "1px solid #F0EEF8" }}>
                    <h2 className="text-sm font-semibold text-gray-900 hidden sm:block">All Organizations</h2>
                    <div className="flex items-center gap-2.5">
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search organizations..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-10 pr-4 h-9 bg-gray-50 rounded-xl text-sm text-gray-900 w-56 outline-none transition-all placeholder:text-gray-400"
                                style={{ border: "1px solid #E9E7FF" }}
                                onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 2px rgba(124,58,237,0.1)"; }}
                                onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; }}
                            />
                        </div>
                        <DateFilter
                            value={timeFilter}
                            onChange={setTimeFilter}
                        />
                    </div>
                </div>
                {/* Table Section */}
                <div className="relative w-full overflow-auto custom-scrollbar">
                    {loading ? (
                        <div className="p-12 text-center">
                            <Loader2 className="h-10 w-10 animate-spin text-violet-500 mx-auto mb-4" />
                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Fetching organization data...</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse">
                            <thead>
                                <tr style={{ background: "#F9F8FF", borderBottom: "1px solid #F0EEF8" }}>
                                    <th className="pl-5 py-3 text-left font-semibold text-xs text-gray-400 uppercase tracking-wider">Organization</th>
                                    <th className="px-4 py-3 text-center font-semibold text-xs text-gray-400 uppercase tracking-wider">Admins</th>
                                    <th className="px-4 py-3 text-center font-semibold text-xs text-gray-400 uppercase tracking-wider">Jobs</th>
                                    <th className="px-4 py-3 text-center font-semibold text-xs text-gray-400 uppercase tracking-wider">Candidates</th>
                                    <th className="px-4 py-3 text-center font-semibold text-xs text-gray-400 uppercase tracking-wider">Mins Used</th>
                                    <th className="px-4 py-3 text-center font-semibold text-xs text-gray-400 uppercase tracking-wider">Remaining</th>
                                    <th className="px-4 py-3 text-center font-semibold text-xs text-gray-400 uppercase tracking-wider">Done</th>
                                    <th className="px-4 py-3 text-center font-semibold text-xs text-gray-400 uppercase tracking-wider">Status</th>
                                    <th className="pr-5 py-3 text-right font-semibold text-xs text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {orgs.map((org) => (
                                    <tr key={org.id} className="transition-colors" style={{ borderBottom: "1px solid #F9F8FF" }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#FAFAFC"}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                        <td className="pl-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-xl flex flex-shrink-0 items-center justify-center font-bold text-sm text-white"
                                                    style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}>
                                                    {org.name[0].toUpperCase()}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-gray-900 font-bold text-[12px] truncate">{cleanName(org.name)}</span>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-[10px] font-medium text-gray-400 truncate uppercase">{formatOrgPlan(org.billingPlan) || "Starter"}</span>
                                                        <span className="text-[10px] text-gray-300">•</span>
                                                        <span className="text-[9px] text-gray-400 truncate">{org.urlSlug}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-gray-700 text-[11px] tabular-nums">
                                            {org.adminCount ?? org._count?.users ?? 0}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-gray-700 text-[11px] tabular-nums">
                                            {org.jobCount ?? org._count?.jobs ?? 0}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-violet-500 text-[11px] tabular-nums">
                                            {org.candidateCount || 0}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-gray-500 text-[11px] tabular-nums">
                                            {org.billingCreditsUsed || 0}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-emerald-600 text-[11px] tabular-nums">
                                            {Math.max(0, (org.totalInterviewsAllowed || 0) - (org.totalInterviewsUsed || 0))}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-blue-600 text-[11px] tabular-nums">
                                            {org.totalInterviewsUsed || 0}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className={cn(
                                                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border shadow-sm transition-all hover:bg-white active:scale-[0.98]",
                                                        (org.status || "ACTIVE") === "ACTIVE"
                                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                            : "bg-gray-50 border-gray-200 text-gray-600"
                                                    )}>
                                                        <div className={cn("h-1.5 w-1.5 rounded-full", (org.status || "ACTIVE") === "ACTIVE" ? "bg-emerald-500" : "bg-gray-400")} />
                                                        {org.status || "ACTIVE"}
                                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="center" className="w-40 p-1.5 rounded-xl shadow-xl bg-white" style={{ border: "1px solid #E9E7FF" }}>
                                                    <div className="px-2.5 py-2 border-b border-gray-50 mb-1">
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Control Status</p>
                                                    </div>
                                                    <DropdownMenuItem
                                                        className={cn(
                                                            "rounded-lg px-2.5 py-2 font-bold text-[10px] cursor-pointer flex items-center justify-between",
                                                            (org.status || "ACTIVE") === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"
                                                        )}
                                                        onClick={() => handleStatusChange(org.id, "ACTIVE")}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("h-1.5 w-1.5 rounded-full", (org.status || "ACTIVE") === "ACTIVE" ? "bg-emerald-500" : "bg-gray-300")} />
                                                            ACTIVE
                                                        </div>
                                                        {(org.status || "ACTIVE") === "ACTIVE" && <Check className="h-3.5 w-3.5" />}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className={cn(
                                                            "rounded-lg px-2.5 py-2 font-bold text-[10px] cursor-pointer flex items-center justify-between mt-1",
                                                            org.status === "SUSPENDED" ? "bg-red-50 text-red-700" : "text-gray-600 hover:bg-gray-50"
                                                        )}
                                                        onClick={() => handleStatusChange(org.id, "SUSPENDED")}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("h-1.5 w-1.5 rounded-full", org.status === "SUSPENDED" ? "bg-red-500" : "bg-gray-300")} />
                                                            SUSPENDED
                                                        </div>
                                                        {org.status === "SUSPENDED" && <Check className="h-3.5 w-3.5" />}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className={cn(
                                                            "rounded-lg px-2.5 py-2 font-bold text-[10px] cursor-pointer flex items-center justify-between mt-1",
                                                            org.status === "CLOSED" ? "bg-rose-50 text-rose-700" : "text-gray-600 hover:bg-gray-50"
                                                        )}
                                                        onClick={() => handleStatusChange(org.id, "CLOSED")}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("h-1.5 w-1.5 rounded-full", org.status === "CLOSED" ? "bg-rose-500" : "bg-gray-300")} />
                                                            CLOSED
                                                        </div>
                                                        {org.status === "CLOSED" && <Check className="h-3.5 w-3.5" />}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                        <td className="pr-5 py-4 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors" style={{ border: "1px solid #E9E7FF" }}>
                                                        <MoreVertical className="h-3.5 w-3.5" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-44 p-1.5 rounded-xl shadow-xl bg-white" style={{ border: "1px solid #E9E7FF" }}>
                                                    <p className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Actions</p>
                                                    <Link href={`/super-admin/billing?orgId=${org.id}`} className="block w-full">
                                                        <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 font-medium transition-all flex items-center gap-2">
                                                            <Layers className="h-3.5 w-3.5 text-gray-400" />
                                                            View Usage
                                                        </DropdownMenuItem>
                                                    </Link>
                                                    <Link href={`/super-admin/orgs/${org.id}/candidates`} className="block w-full">
                                                        <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 font-medium transition-all flex items-center gap-2">
                                                            <Users className="h-3.5 w-3.5 text-gray-400" />
                                                            View Candidates
                                                        </DropdownMenuItem>
                                                    </Link>
                                                    <Link href={`/super-admin/orgs/${org.id}`} className="block w-full">
                                                        <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 font-medium transition-all flex items-center gap-2">
                                                            <Edit2 className="h-3.5 w-3.5 text-gray-400" />
                                                            Edit Settings
                                                        </DropdownMenuItem>
                                                    </Link>
                                                    <div className="h-px my-1 mx-1" style={{ background: "#F0EEF8" }} />
                                                    <DropdownMenuItem
                                                        onClick={() => { setOrgToDelete(org); setIsDeleteModalOpen(true); }}
                                                        className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-red-600 hover:bg-red-50 font-medium transition-all flex items-center gap-2"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                        Delete Portal
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                {/* Pagination Footer */}
                <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderTop: "1px solid #F0EEF8" }}>
                    <p className="text-xs font-medium text-gray-400">
                        Page <span className="text-gray-700 font-semibold">{page}</span> of <span className="text-gray-700 font-semibold">{totalPages || 1}</span>
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all"
                            style={{ border: "1px solid #E9E7FF" }}
                        >Previous</button>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all"
                            style={{ border: "1px solid #E9E7FF" }}
                        >Next</button>
                    </div>
                </div>
            </div>
            {/* Modals remain the same but use the premium style */}
            <ActionConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Organization"
                description={`Are you sure you want to terminate ${orgToDelete?.name}? This will permanently remove all data, recruitment jobs, and candidates associated with this portal. This action is irreversible.`}
                confirmText="Confirm Deletion"
                isLoading={isDeleting}
            />
            {statusModalOrg && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 space-y-6 animate-in zoom-in-95 duration-200" style={{ border: "1px solid #E9E7FF" }}>
                        <div className="flex flex-col items-center gap-4 text-center">
                            <div className={cn("h-16 w-16 rounded-[1.5rem] flex items-center justify-center shadow-lg",
                                statusModalOrg.pendingStatus === "ACTIVE" ? "bg-emerald-50 text-emerald-500" :
                                    statusModalOrg.pendingStatus === "SUSPENDED" ? "bg-amber-50 text-amber-500" : "bg-rose-50 text-rose-500"
                            )}>
                                {statusModalOrg.pendingStatus === "ACTIVE" ? <ShieldCheck className="h-8 w-8" /> :
                                    statusModalOrg.pendingStatus === "SUSPENDED" ? <Clock className="h-8 w-8" /> : <AlertCircle className="h-8 w-8" />}
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                {statusModalOrg.pendingStatus === "ACTIVE" ? "Activate Portal?" :
                                    statusModalOrg.pendingStatus === "SUSPENDED" ? "Suspend Portal?" : "Close Portal?"}
                            </h2>
                            <p className="text-sm text-gray-500 font-bold leading-relaxed px-2">
                                {statusModalOrg.pendingStatus === "ACTIVE" ? `Restoring access for ${statusModalOrg.name}.` :
                                    statusModalOrg.pendingStatus === "SUSPENDED" ? `Temporarily restricting ${statusModalOrg.name}.` : `Closing ${statusModalOrg.name} and restricting data.`}
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <Button
                                variant="outline"
                                className="flex-1 h-12 rounded-2xl font-bold border-gray-100 hover:bg-gray-50 transition-all"
                                onClick={() => setStatusModalOrg(null)}
                                disabled={isUpdatingStatus}
                            >Cancel</Button>
                            <Button
                                className={cn("flex-1 h-12 rounded-2xl font-bold text-white transition-all shadow-lg active:scale-95",
                                    statusModalOrg.pendingStatus === "ACTIVE" ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200" :
                                        statusModalOrg.pendingStatus === "SUSPENDED" ? "bg-amber-500 hover:bg-amber-600 shadow-amber-200" : "bg-rose-500 hover:bg-rose-600 shadow-rose-200"
                                )}
                                disabled={isUpdatingStatus}
                                onClick={confirmStatusUpdate}
                            >
                                {isUpdatingStatus ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirm"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
