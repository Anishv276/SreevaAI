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
    Layers,
    Globe,
    Trash2,
    Sparkles,
    MoreVertical,
    X,
    AlertCircle,
    Clock,
    ShieldOff,
    Target,
    ShieldCheck,
    Award,
    Radio,
    Building2,
    Zap,
    Download,
    CheckSquare,
    Check
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-custom";
import { formatOrgPlan } from "@/lib/org-plans";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";

interface Org {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    usageMetrics?: Record<string, unknown> | null;
    adminCount: number;
    driveCount: number;
    candidateCount: number;

    // AI Config (Setup)
    llmProvider?: string;
    llmModel?: string;
    ttsProvider?: string;
    cartesiaModel?: string;
    sarvamModel?: string;
    sttProvider?: string;
    deepgramModel?: string;
    sarvamSttModel?: string;

    creditsTotal?: number;
    creditsUsed?: number;
    logoUrl?: string;
    interviewCount?: number;
    _count?: {
        users: number;
        drives: number;
    };
}

type BillingFeatureKey = "interview" | "resumeExtraction" | "jdExtraction" | "chatbot" | "resumeReport" | "interviewReport" | "general";

type BillingFeatureMetrics = {
    runs?: number;
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    sessionDuration?: number;
    costUsd?: number;
    ttsRuns?: number;
    ttsCharacters?: number;
    ttsCostUsd?: number;
    sttRuns?: number;
    sttAudioSeconds?: number;
    sttCostUsd?: number;
    byModel?: Record<string, any>;
    ttsByModel?: Record<string, any>;
    sttByModel?: Record<string, any>;
};

export function OrgStatsRow({ stats, isLoading }: { stats: any; isLoading: boolean }) {
    const kpis = [
        { label: "Organizations", value: stats.totalOrgs, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Active", value: stats.activeOrgs, icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Suspended", value: stats.suspendedOrgs, icon: ShieldOff, color: "text-rose-600", bg: "bg-rose-50" },
        { label: "Candidates", value: stats.totalCandidates, icon: Target, color: "text-orange-600", bg: "bg-orange-50" },
        { label: "Drives", value: stats.totalDrives, icon: Briefcase, color: "text-indigo-600", bg: "bg-indigo-50" },
        { label: "Admins", value: stats.totalAdmins, icon: Users, color: "text-amber-600", bg: "bg-amber-50" },
    ];

    if (isLoading && !stats.totalOrgs) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-24 rounded-3xl bg-white/40 animate-pulse border border-white/20" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {kpis.map((kpi, idx) => (
                <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.5 }}
                    className="group relative flex flex-col gap-2 p-5 bg-white/40 backdrop-blur-xl rounded-3xl border border-white/40 shadow-sm hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-500 hover:-translate-y-1"
                >
                    <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-sm", kpi.bg, kpi.color)}>
                        <kpi.icon className="h-6 w-6" />
                    </div>
                    <div className="flex flex-col mt-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 truncate">{kpi.label}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-gray-900 tabular-nums tracking-tighter">{kpi.value?.toLocaleString() || 0}</span>
                        </div>
                    </div>
                    {/* Subtle hover effect overlay */}
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </motion.div>
            ))}
        </div>
    );
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
    const [metricsOrg, setMetricsOrg] = useState<Org | null>(null);
    const [statusModalOrg, setStatusModalOrg] = useState<{ id: string; name: string; currentStatus: string; pendingStatus: string } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    const metricSections: { key: BillingFeatureKey; label: string }[] = [
        { key: "resumeExtraction", label: "LLM - Resume" },
        { key: "chatbot", label: "LLM - Chatbot" },
        { key: "interview", label: "LLM - Interview" },
        { key: "jdExtraction", label: "LLM - JD" },
        { key: "resumeReport", label: "LLM - Resume Report" },
        { key: "interviewReport", label: "LLM - Interview Report" },
        { key: "general", label: "LLM - General" },
    ];

    const getBillingFeature = (org: Org, key: BillingFeatureKey): BillingFeatureMetrics => {
        const usage = (org.usageMetrics ?? {}) as Record<string, any>;
        const billing = usage.billing ? (usage.billing as Record<string, any>) : usage;
        return (billing[key] ?? {}) as BillingFeatureMetrics;
    };

    const getOrgTotalBillingCost = (org: Org): number => {
        return metricSections.reduce((sum, section) => {
            const row = getBillingFeature(org, section.key);
            return sum +
                Number(row.costUsd || 0) +
                Number(row.ttsCostUsd || 0) +
                Number(row.sttCostUsd || 0);
        }, 0);
    };

    const cleanName = (n: string) => n.includes(':') ? n.split(':')[1] : n;

    const getSetupModel = (org: Org, type: 'LLM' | 'TTS' | 'STT') => {
        if (type === 'LLM') return org.llmModel;
        if (type === 'TTS') return org.ttsProvider === 'SARVAM' ? org.sarvamModel : org.cartesiaModel;
        if (type === 'STT') return org.sttProvider === 'SARVAM' ? org.sarvamSttModel : org.deepgramModel;
        return null;
    };

    const getUsageSummary = (usageMetrics?: Record<string, unknown> | null) => {
        if (!usageMetrics || typeof usageMetrics !== "object") return "$0.00";
        const cost = getOrgTotalBillingCost({ usageMetrics } as any);
        return `$${cost.toFixed(2)}`;
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
        <div className="space-y-10 pb-12 animate-in fade-in duration-700 font-inter text-premium">
            {/* Header Area */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-2">
                <div className="flex items-center gap-5 group">
                    <div className="h-14 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)] transition-all duration-500 group-hover:h-16" />
                    <div className="space-y-1">
                        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-none tracking-tighter">
                            Organizations
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-gray-400 font-bold text-[13px] uppercase tracking-[0.2em]">
                                {total} Total Partners
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <Link href="/super-admin/orgs/new">
                        <Button
                            className="h-12 px-6 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold transition-all shadow-lg hover:shadow-gray-200 active:scale-95 flex items-center gap-2"
                        >
                            <Plus className="h-5 w-5" />
                            Onboard Partner
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats Row */}
            <OrgStatsRow stats={stats} isLoading={loading} />

            {/* Registry Container - Glassmorphism */}
            <div className="group relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)] mt-10">
                {/* Decorative top accent */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400/0 via-[#F97316]/40 to-orange-400/0" />

                {/* Search & Filter Header */}
                <div className="p-3 border-b border-white/40 bg-white/20">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
                        <div className="flex-1 flex flex-col md:flex-row items-center gap-4 w-full">
                            <div className="relative flex-1 max-w-2xl w-full group/search">
                                <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400 group-focus-within/search:text-[#F97316] transition-colors" />
                                <Input
                                    placeholder="Search by name, slug, or ref..."
                                    className="pl-11 h-12 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-orange-200 focus:ring-8 focus:ring-orange-50/50 transition-all font-bold text-sm shadow-inner"
                                    value={searchInput}
                                    onChange={e => setSearchInput(e.target.value)}
                                />
                            </div>

                            <DateFilter
                                value={timeFilter}
                                onChange={setTimeFilter}
                            />
                        </div>
                    </div>
                </div>

                {/* Table Section */}
                <div className="relative w-full overflow-auto custom-scrollbar">
                    {loading ? (
                        <div className="p-12 text-center">
                            <Loader2 className="h-10 w-10 animate-spin text-orange-500 mx-auto mb-4" />
                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Fetching registry data...</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <th className="w-[320px] h-14 pl-8 text-left font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Organization</th>
                                    <th className="h-14 text-center font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Admins</th>
                                    <th className="h-14 text-center font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Drives</th>
                                    <th className="h-14 text-center font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Interviews</th>
                                    <th className="h-14 text-center font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Candidates</th>
                                    <th className="h-14 text-center font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Allocated</th>
                                    <th className="h-14 text-center font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Consumed</th>
                                    <th className="h-14 text-center font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Remaining</th>
                                    <th className="h-14 text-center font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Status</th>
                                    <th className="pr-8 text-right h-14 font-black uppercase tracking-[0.2em] text-[10px] text-gray-900">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/20">
                                {orgs.map((org) => (
                                    <tr key={org.id} className="group border-b border-white/20 hover:bg-white/40 transition-all duration-500">
                                        <td className="pl-8 py-4">
                                            <div className="flex items-center gap-4">
                                                {org.logoUrl ? (
                                                    <div className="h-10 w-10 rounded-xl border border-gray-100 bg-white p-1.5 shadow-sm overflow-hidden flex items-center justify-center group-hover:scale-110 transition-transform duration-500 flex-shrink-0">
                                                        <img src={org.logoUrl} alt={org.name} className="h-full w-full object-contain" />
                                                    </div>
                                                ) : (
                                                    <div className="h-10 w-10 rounded-xl bg-gray-900 text-white flex flex-shrink-0 items-center justify-center font-black text-xs shadow-lg group-hover:scale-110 transition-transform duration-500">
                                                        {org.name[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="flex flex-col truncate">
                                                    <span className="text-gray-900 font-extrabold text-[15px] leading-tight group-hover:text-[#F97316] transition-colors">{org.name}</span>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100/50 text-[9px] font-black text-gray-400 uppercase tracking-widest w-fit">
                                                            {formatOrgPlan(org.plan) || "Starter"}
                                                        </div>
                                                        <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">/{org.slug}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="py-4 text-center font-black text-gray-900 text-base tabular-nums tracking-tighter">
                                            {org.adminCount ?? org._count?.users ?? 0}
                                        </td>

                                        <td className="py-4 text-center font-black text-gray-900 text-base tabular-nums tracking-tighter">
                                            {org.driveCount ?? org._count?.drives ?? 0}
                                        </td>

                                        <td className="py-4 text-center font-black text-blue-600 text-base tabular-nums tracking-tighter">
                                            {org.interviewCount || 0}
                                        </td>

                                        <td className="py-4 text-center font-black text-[#F97316] text-base tabular-nums tracking-tighter">
                                            {org.candidateCount || 0}
                                        </td>

                                        <td className="py-4 text-center font-black text-amber-600 text-sm tabular-nums tracking-tighter">
                                            {org.creditsTotal || 0}
                                        </td>

                                        <td className="py-4 text-center font-black text-gray-500 text-sm tabular-nums tracking-tighter">
                                            {org.creditsUsed || 0}
                                        </td>

                                        <td className="py-4 text-center font-black text-emerald-600 text-sm tabular-nums tracking-tighter">
                                            {Math.max(0, (org.creditsTotal || 0) - (org.creditsUsed || 0))}
                                        </td>

                                        <td className="py-4 text-center">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className={cn(
                                                        "flex items-center gap-2.5 px-4 py-2 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer mx-auto shadow-sm",
                                                        (org.status || "ACTIVE") === "ACTIVE"
                                                            ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                                                            : "bg-gray-50 border-gray-200 text-gray-500"
                                                    )}>
                                                        <div className={cn("h-2 w-2 rounded-full", (org.status || "ACTIVE") === "ACTIVE" ? "bg-emerald-500 animate-pulse" : "bg-gray-300")} />
                                                        <span className="text-[11px] font-inter font-bold uppercase tracking-wider">
                                                            {org.status || "ACTIVE"}
                                                        </span>
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="center" className="w-52 p-2 rounded-2xl shadow-xl border-gray-100 bg-white/95 backdrop-blur-xl">
                                                    <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Control Status</p>
                                                    </div>
                                                    <DropdownMenuItem
                                                        className={cn(
                                                            "rounded-xl px-3 py-2.5 font-bold text-xs cursor-pointer gap-2",
                                                            (org.status || "ACTIVE") === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"
                                                        )}
                                                        onClick={() => handleStatusChange(org.id, "ACTIVE")}
                                                    >
                                                        <div className={cn("h-1.5 w-1.5 rounded-full", (org.status || "ACTIVE") === "ACTIVE" ? "bg-emerald-500" : "bg-gray-300")} />
                                                        Mark as Active
                                                        {(org.status || "ACTIVE") === "ACTIVE" && <Check className="ml-auto h-3.5 w-3.5" />}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className={cn(
                                                            "rounded-xl px-3 py-2.5 font-bold text-xs cursor-pointer gap-2 mt-1",
                                                            org.status === "SUSPENDED" ? "bg-red-50 text-red-700" : "text-gray-600 hover:bg-gray-50"
                                                        )}
                                                        onClick={() => handleStatusChange(org.id, "SUSPENDED")}
                                                    >
                                                        <div className={cn("h-1.5 w-1.5 rounded-full", org.status === "SUSPENDED" ? "bg-red-500" : "bg-gray-300")} />
                                                        Suspend Client
                                                        {org.status === "SUSPENDED" && <Check className="ml-auto h-3.5 w-3.5" />}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>

                                        <td className="pr-8 py-4 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-gray-100 text-gray-400 group-hover:text-gray-900 transition-colors">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[240px] p-2 rounded-[24px] bg-white/90 backdrop-blur-2xl border border-white/60 shadow-[0_20px_60px_rgba(0,0,0,0.1)] z-[60] animate-in fade-in zoom-in-95 duration-200 font-inter">
                                                    <div className="px-3 pt-2 pb-3 mb-1">
                                                        <p className="text-[11px] font-bold text-gray-400/80 uppercase tracking-widest pl-1">Partner Controls</p>
                                                    </div>
                                                    <Link href={`/super-admin/orgs/${org.id}`} className="block w-full">
                                                        <DropdownMenuItem className="cursor-pointer rounded-2xl py-2.5 px-3 focus:bg-gray-50/80 text-gray-700 focus:text-gray-900 font-medium text-[14px] leading-none transition-all duration-200 group flex items-center">
                                                            <div className="mr-3.5 h-8 w-8 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 group-hover:bg-white group-hover:text-[#F97316] group-focus:border-orange-100/50 group-hover:shadow-sm flex items-center justify-center transition-all duration-200">
                                                                <Edit2 className="h-4 w-4" />
                                                            </div>
                                                            Instance Settings
                                                        </DropdownMenuItem>
                                                    </Link>

                                                    <div className="h-px bg-gray-100/80 my-2 mx-3" />

                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            setOrgToDelete(org);
                                                            setIsDeleteModalOpen(true);
                                                        }}
                                                        className="cursor-pointer rounded-2xl py-2.5 px-3 focus:bg-red-50/50 text-red-600 focus:text-red-700 font-medium text-[14px] leading-none transition-all duration-200 group flex items-center mt-1"
                                                    >
                                                        <div className="mr-3.5 h-8 w-8 rounded-xl bg-red-50 border border-red-100/50 text-red-400 group-hover:bg-white group-hover:text-red-600 group-hover:border-red-200 group-hover:shadow-sm flex items-center justify-center transition-all duration-200">
                                                            <Trash2 className="h-4 w-4" />
                                                        </div>
                                                        Terminate Portal
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
                <div className="px-6 py-4 bg-gray-50/30 flex items-center justify-between border-t border-white/40">
                    <p className="text-gray-400 text-[11px] font-medium font-inter">
                        Showing <span className="font-bold text-gray-700">{orgs.length}</span> of <span className="font-bold text-gray-700">{total}</span> partners
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="h-8 px-4 bg-white/60 border-gray-100 text-gray-500 font-bold text-[10px] uppercase tracking-widest rounded-xl disabled:opacity-40 hover:bg-white hover:text-gray-900 transition-all"
                        >Prev</Button>
                        <div className="px-3 h-8 flex items-center rounded-xl bg-white/60 border border-gray-100 text-[10px] font-bold text-gray-600">
                            {page} / {totalPages || 1}
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="h-8 px-4 bg-white/60 border-gray-100 text-gray-900 font-bold text-[10px] uppercase tracking-widest rounded-xl disabled:opacity-40 hover:bg-white transition-all"
                        >Next</Button>
                    </div>
                </div>
            </div>

            {/* Modals remain the same but use the premium style */}
            <ActionConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Terminate Organization"
                description={`Are you sure you want to terminate ${orgToDelete?.name}? This will permanently remove all data, recruitment drives, and candidates associated with this portal. This action is irreversible.`}
                confirmText="Confirm Termination"
                isLoading={isDeleting}
            />

            {statusModalOrg && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-10 w-full max-w-sm mx-4 space-y-8 border border-white/40 animate-in zoom-in-95 duration-300">
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

            {metricsOrg && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-gray-950/40 backdrop-blur-md px-4 py-6">
                    <div className="w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden rounded-[3rem] border border-white/20 bg-white/95 shadow-2xl animate-in zoom-in-95 duration-500">
                        <div className="relative flex items-center justify-between px-12 py-10 border-b border-gray-100 overflow-hidden bg-white/50">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.05] rotate-12">
                                <Sparkles className="h-24 w-24" />
                            </div>
                            <div className="relative z-10 flex items-center gap-6">
                                <div className="h-16 w-16 rounded-[1.5rem] bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-xl shadow-orange-200">
                                    <Layers className="h-8 w-8 text-white" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-600/60">Live Intelligence Hub</span>
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-900 tracking-tighter">
                                        {metricsOrg.name} <span className="text-gray-400 font-medium">- Consumption Hub</span>
                                    </h3>
                                </div>
                            </div>
                            <button
                                onClick={() => setMetricsOrg(null)}
                                className="relative z-10 group h-14 px-8 flex items-center gap-3 rounded-[1.5rem] bg-gray-50 text-gray-900 border border-gray-100 hover:bg-black hover:text-white transition-all shadow-sm hover:shadow-xl duration-500"
                            >
                                <X className="h-5 w-5 group-hover:rotate-90 transition-transform duration-500" />
                                <span className="text-sm font-black uppercase tracking-widest">Dismiss</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto scrollbar-hide p-12 space-y-16">
                            {/* LLM Section */}
                            <div className="space-y-8">
                                <div className="flex items-center gap-6">
                                    <h4 className="text-[11px] font-black uppercase tracking-[0.5em] text-gray-400 whitespace-nowrap">Core Processing Units</h4>
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-100 via-gray-50 to-transparent" />
                                </div>
                                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                                    {metricSections.map((section) => {
                                        const feature = getBillingFeature(metricsOrg, section.key);
                                        const totalTokens = Number(feature.inputTokens || 0) + Number(feature.outputTokens || 0);
                                        const models = Object.keys(feature.byModel || {});
                                        const setupModel = getSetupModel(metricsOrg, 'LLM');

                                        return (
                                            <div key={section.key} className="group relative rounded-[2rem] border border-gray-100 bg-white p-8 hover:border-orange-200 hover:shadow-2xl hover:shadow-orange-500/10 transition-all duration-500 hover:-translate-y-1">
                                                <div className="flex flex-col gap-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F97316]/60">{section.label.replace('LLM - ', '')}</div>
                                                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 min-h-[28px]">
                                                        {models.length > 0 ? (
                                                            models.map(m => (
                                                                <div key={m} className="text-[9px] font-black text-emerald-700 bg-emerald-50/50 px-3 py-1 rounded-xl border border-emerald-100 uppercase tracking-tight">
                                                                    {cleanName(m)}
                                                                </div>
                                                            ))
                                                        ) : setupModel ? (
                                                            <div className="text-[9px] font-black text-gray-400 bg-gray-50 px-3 py-1 rounded-xl border border-gray-200 uppercase tracking-tight">
                                                                {setupModel}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[9px] font-bold text-gray-300 italic">Inactive Instance</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-6 mb-5">
                                                    <div className="text-4xl font-black text-gray-900 tracking-tighter">${Number(feature.costUsd || 0).toFixed(2)}</div>
                                                </div>
                                                <div className="space-y-2.5 pt-5 border-t border-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-[0.1em]">
                                                    <div className="flex justify-between items-center">
                                                        <span>Executions</span>
                                                        <span className="text-gray-900">{Number(feature.runs || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span>Token Vol</span>
                                                        <span className="text-gray-900">{totalTokens.toLocaleString()} <span className="text-[9px] opacity-30">TKN</span></span>
                                                    </div>
                                                </div>
                                                <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Voice & STT Section */}
                            <div className="grid gap-12 md:grid-cols-2">
                                <div className="space-y-8">
                                    <div className="flex items-center gap-6">
                                        <h4 className="text-[11px] font-black uppercase tracking-[0.5em] text-gray-400 whitespace-nowrap">Synthesis Hub</h4>
                                        <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-100 via-gray-50 to-transparent" />
                                    </div>
                                    <div className="relative overflow-hidden rounded-[3rem] border border-blue-100 bg-blue-50/20 p-10 group hover:bg-blue-50/40 transition-all duration-500">
                                        <div className="relative z-10 flex items-center justify-between mb-10">
                                            <div className="space-y-3">
                                                <div className="text-5xl font-black text-blue-900 tracking-tighter">
                                                    ${metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).ttsCostUsd || 0), 0).toFixed(2)}
                                                </div>
                                                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-600/60">Voice Generation Footprint</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-black text-blue-800 tracking-tighter">{metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).ttsCharacters || 0), 0).toLocaleString()}</div>
                                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400/60">Characters Synth</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-3 pt-8 border-t border-blue-100/50">
                                            {(() => {
                                                const allTtsModels = metricSections.flatMap(s => Object.keys(getBillingFeature(metricsOrg, s.key).ttsByModel || {}));
                                                const uniqueModels = Array.from(new Set(allTtsModels));
                                                const setupModel = getSetupModel(metricsOrg, 'TTS');
                                                if (uniqueModels.length > 0) {
                                                    return uniqueModels.map(m => (
                                                        <span key={m} className="px-4 py-2 bg-white text-blue-700 text-[10px] font-black rounded-2xl border border-blue-100 shadow-sm uppercase tracking-widest">
                                                            {cleanName(m)}
                                                        </span>
                                                    ));
                                                }
                                                return <span className="text-[10px] font-bold text-blue-300 italic bg-white/50 px-5 py-2 rounded-2xl border border-blue-100/50 border-dashed">{setupModel || "System Standard"}</span>;
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="flex items-center gap-6">
                                        <h4 className="text-[11px] font-black uppercase tracking-[0.5em] text-gray-400 whitespace-nowrap">Recognition Hub</h4>
                                        <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-100 via-gray-50 to-transparent" />
                                    </div>
                                    <div className="relative overflow-hidden rounded-[3rem] border border-orange-100 bg-orange-50/20 p-10 group hover:bg-orange-50/40 transition-all duration-500">
                                        <div className="relative z-10 flex items-center justify-between mb-10">
                                            <div className="space-y-3">
                                                <div className="text-5xl font-black text-orange-900 tracking-tighter">
                                                    ${metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).sttCostUsd || 0), 0).toFixed(2)}
                                                </div>
                                                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-600/60">Audio Processing Footprint</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-black text-orange-800 tracking-tighter">{(metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).sttAudioSeconds || 0), 0) / 60).toFixed(1)}m</div>
                                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400/60">Minutes Transcribed</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-3 pt-8 border-t border-orange-100/50">
                                            {(() => {
                                                const allSttModels = metricSections.flatMap(s => Object.keys(getBillingFeature(metricsOrg, s.key).sttByModel || {}));
                                                const uniqueModels = Array.from(new Set(allSttModels));
                                                const setupModel = getSetupModel(metricsOrg, 'STT');
                                                if (uniqueModels.length > 0) {
                                                    return uniqueModels.map(m => (
                                                        <span key={m} className="px-4 py-2 bg-white text-orange-700 text-[10px] font-black rounded-2xl border border-orange-100 shadow-sm uppercase tracking-widest">
                                                            {cleanName(m)}
                                                        </span>
                                                    ));
                                                }
                                                return <span className="text-[10px] font-bold text-orange-300 italic bg-white/50 px-5 py-2 rounded-2xl border border-orange-100/50 border-dashed">{setupModel || "System Standard"}</span>;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Pipeline Summary */}
                            <div className="pt-4">
                                <div className="flex items-center gap-6 mb-10">
                                    <h4 className="text-[11px] font-black uppercase tracking-[0.5em] text-gray-400 whitespace-nowrap">Integrated Pipeline</h4>
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-100 via-gray-50 to-transparent" />
                                </div>
                                {(() => {
                                    const feature = getBillingFeature(metricsOrg, 'interview');
                                    const totalCost = Number(feature.costUsd || 0) + Number(feature.ttsCostUsd || 0) + Number(feature.sttCostUsd || 0);
                                    const totalTokens = Number(feature.inputTokens || 0) + Number(feature.outputTokens || 0);
                                    const llmModels = Object.keys(feature.byModel || {});
                                    const ttsModels = Object.keys(feature.ttsByModel || {});
                                    const sttModels = Object.keys(feature.sttByModel || {});
                                    const setupLlm = getSetupModel(metricsOrg, 'LLM');
                                    const setupTts = getSetupModel(metricsOrg, 'TTS');
                                    const setupStt = getSetupModel(metricsOrg, 'STT');

                                    return (
                                        <div className="relative overflow-hidden rounded-[4rem] border-[3px] border-gray-900 bg-gray-950 p-12 text-white shadow-3xl group transition-all duration-700 hover:shadow-orange-500/20">
                                            <div className="absolute top-0 right-0 p-16 opacity-[0.08] group-hover:opacity-15 group-hover:rotate-12 transition-all duration-1000">
                                                <Sparkles className="h-48 w-48" />
                                            </div>

                                            <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-16 mb-16">
                                                <div className="space-y-8">
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.8)]" />
                                                            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-gray-400">Pipeline Total Expenditure</span>
                                                        </div>
                                                        <div className="text-8xl font-black tracking-[calc(-0.05em)] text-white group-hover:text-orange-50 transition-colors duration-700">${totalCost.toFixed(2)}</div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-4 pt-6">
                                                        <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-[1.5rem] px-6 py-4 transition-all hover:bg-white/10 hover:translate-y-[-2px]">
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Logic Provider</div>
                                                            <div className="text-base font-black text-emerald-400 tracking-tight">${Number(feature.costUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                        <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-[1.5rem] px-6 py-4 transition-all hover:bg-white/10 hover:translate-y-[-2px]">
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Synth Unit</div>
                                                            <div className="text-base font-black text-blue-400 tracking-tight">${Number(feature.ttsCostUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                        <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-[1.5rem] px-6 py-4 transition-all hover:bg-white/10 hover:translate-y-[-2px]">
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">Recognition</div>
                                                            <div className="text-base font-black text-orange-400 tracking-tight">${Number(feature.sttCostUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 text-right min-w-[320px]">
                                                    <div className="space-y-2">
                                                        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">Live Drives</div>
                                                        <div className="text-4xl font-black tabular-nums text-white">{(metricsOrg as any).driveCount || 0}</div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">Total Sessions</div>
                                                        <div className="text-4xl font-black tabular-nums text-white">{Number(feature.runs || 0).toLocaleString()}</div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">Consumed Tokens</div>
                                                        <div className="text-4xl font-black tabular-nums text-white">{totalTokens.toLocaleString()}</div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">Audio Mins</div>
                                                        <div className="text-4xl font-black tabular-nums text-white">
                                                            {Number(feature.sessionDuration || 0) > 0
                                                                ? (Number(feature.sessionDuration || 0) / 60).toFixed(1)
                                                                : (Number(feature.sttAudioSeconds || 0) / 60).toFixed(1)}<span className="text-sm ml-1 opacity-40">M</span>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2 col-span-2 sm:col-span-1">
                                                        <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">Health</div>
                                                        <div className="text-4xl font-black text-emerald-400 uppercase tracking-tighter">Healthy</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="relative border-t border-white/10 pt-10 grid grid-cols-1 md:grid-cols-3 gap-10">
                                                <div className="group/tech">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-4 transition-colors group-hover/tech:text-emerald-400">Intelligence Node</div>
                                                    <div className="flex flex-wrap gap-2.5">
                                                        {llmModels.length > 0 ? llmModels.map(m => (
                                                            <span key={m} className="px-4 py-1.5 bg-emerald-500/10 text-emerald-400 text-[11px] font-black rounded-xl border border-emerald-400/20 uppercase tracking-widest">
                                                                {cleanName(m)}
                                                            </span>
                                                        )) : <span className="text-[11px] font-bold text-gray-600 italic">{setupLlm || "Standard"}</span>}
                                                    </div>
                                                </div>
                                                <div className="group/tech">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-4 transition-colors group-hover/tech:text-blue-400">Synthesis Engine</div>
                                                    <div className="flex flex-wrap gap-2.5">
                                                        {ttsModels.length > 0 ? ttsModels.map(m => (
                                                            <span key={m} className="px-4 py-1.5 bg-blue-500/10 text-blue-400 text-[11px] font-black rounded-xl border border-blue-400/20 uppercase tracking-widest">
                                                                {cleanName(m)}
                                                            </span>
                                                        )) : <span className="text-[11px] font-bold text-gray-600 italic">{setupTts || "Standard"}</span>}
                                                    </div>
                                                </div>
                                                <div className="group/tech">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-4 transition-colors group-hover/tech:text-orange-400">Recognition Core</div>
                                                    <div className="flex flex-wrap gap-2.5">
                                                        {sttModels.length > 0 ? sttModels.map(m => (
                                                            <span key={m} className="px-4 py-1.5 bg-orange-500/10 text-orange-400 text-[11px] font-black rounded-xl border border-orange-400/20 uppercase tracking-widest">
                                                                {cleanName(m)}
                                                            </span>
                                                        )) : <span className="text-[11px] font-bold text-gray-600 italic">{setupStt || "Standard"}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 px-12 py-8 bg-gray-50/50 flex items-center justify-between">
                            <div className="text-[12px] font-black uppercase tracking-[0.4em] text-gray-400">Full Organization Ecosystem Cost</div>
                            <div className="text-3xl font-black text-gray-900 tracking-tighter">
                                ${getOrgTotalBillingCost(metricsOrg).toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
