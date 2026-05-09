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
    googleModel?: string;
    sttProvider?: string;
    deepgramModel?: string;
    sarvamSttModel?: string;
    creditsUsed?: number;
    interviewsCompleted?: number;
    interviewQuotaTotal?: number;
    interviewQuotaUsed?: number;
    logoUrl?: string;
    interviewCount?: number;
    _count?: {
        users: number;
        drives: number;
    };
}
type BillingFeatureKey = "interview" | "resumeExtraction" | "jdExtraction" | "chatbot" | "resumeReport" | "interviewReport";
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
type InterviewHistoryRow = {
    id: string;
    interviewName: string;
    candidate: string;
    role: string;
    durationSec: number;
    llmCostUsd: number;
    ttsCostUsd: number;
    sttCostUsd: number;
    totalCostUsd: number;
    status: string;
    date: string;
    hasBillingSnapshot: boolean;
};
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
    // Currency toggle state
    const [currency, setCurrency] = useState<'USD' | 'INR'>('USD');
    const [usdToInr, setUsdToInr] = useState<number>(84.5);
    const [rateLoading, setRateLoading] = useState(false);
    const [rateUpdatedAt, setRateUpdatedAt] = useState<string>('');
    const [historyRows, setHistoryRows] = useState<InterviewHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState("");
    const fetchExchangeRate = async () => {
        setRateLoading(true);
        try {
            const res = await fetch('/api/super-admin/exchange-rate');
            if (res.ok) {
                const data = await res.json();
                setUsdToInr(data.rate);
                setRateUpdatedAt(data.updatedAt || '');
            }
        } catch {
            // keep current rate
        } finally {
            setRateLoading(false);
        }
    };
    // Called when Consumption Hub opens
    const openMetricsOrg = (org: Org) => {
        setMetricsOrg(org);
        setCurrency('USD'); // reset to USD on open
        fetchExchangeRate();
    };
    useEffect(() => {
        if (!metricsOrg) {
            setHistoryRows([]);
            setHistoryError("");
            setHistoryLoading(false);
            return;
        }

        let cancelled = false;

        const loadHistory = async () => {
            setHistoryLoading(true);
            setHistoryError("");

            try {
                const res = await fetch(`/api/super-admin/orgs/interview-history?orgId=${encodeURIComponent(metricsOrg.id)}`, {
                    cache: "no-store",
                });
                if (!res.ok) {
                    throw new Error(`Failed to load interview history (${res.status})`);
                }
                const data = await res.json();
                if (!cancelled) {
                    setHistoryRows(Array.isArray(data.rows) ? data.rows : []);
                }
            } catch (error) {
                console.error("Error fetching interview history:", error);
                if (!cancelled) {
                    setHistoryRows([]);
                    setHistoryError("Unable to load interview history.");
                }
            } finally {
                if (!cancelled) {
                    setHistoryLoading(false);
                }
            }
        };

        loadHistory();

        return () => {
            cancelled = true;
        };
    }, [metricsOrg]);
    // Format a USD value according to the current currency toggle
    const fmt = (usd: number) => {
        if (currency === 'INR') {
            const inr = usd * usdToInr;
            return `₹${inr.toFixed(0)}`;
        }
        return `$${usd.toFixed(2)}`;
    };
    const metricSections: { key: BillingFeatureKey; label: string }[] = [
        { key: "resumeExtraction", label: "LLM - Resume" },
        { key: "chatbot", label: "LLM - Chatbot" },
        { key: "interview", label: "LLM - Interview" },
        { key: "jdExtraction", label: "LLM - JD" },
        { key: "resumeReport", label: "LLM - Resume Report" },
        { key: "interviewReport", label: "LLM - Interview Report" },
    ];
    // Authoritative model per feature — matches what each API route actually uses
    const FEATURE_MODEL_MAP: Record<string, string | null> = {
        resumeExtraction: "gpt-5.4-mini",
        jdExtraction: "gpt-5.4-mini",
        chatbot: "gpt-4.1-mini",
        interview: null, // read from org DB (llmModel)
        resumeReport: "gpt-4o",
        interviewReport: "gpt-4o",
    };
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
    const cleanName = (n: string) => {
        // Strip provider prefix (e.g. "openai:gpt-4o" -> "gpt-4o")
        const base = n.includes(':') ? n.split(':')[1] : n;
        // Strip date version suffix (e.g. "gpt-4o-mini-2024-07-18" -> "gpt-4o-mini")
        return base.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    };
    const getSetupModel = (org: Org, type: 'LLM' | 'TTS' | 'STT') => {
        if (type === 'LLM') return org.llmModel;
        if (type === 'TTS') return org.ttsProvider === 'SARVAM' ? org.sarvamModel : org.ttsProvider === 'GOOGLE' ? org.googleModel : org.cartesiaModel;
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
                                {total} Total Clients
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <Link href="/super-admin/orgs/new">
                        <Button
                            className="h-9 px-5 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-[11px] uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            ADD CLIENT
                        </Button>
                    </Link>
                </div>
            </div>
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden mt-8">
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100">
                    <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest hidden sm:block">All Organizations</h2>
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-auto">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search organizations..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold text-gray-900 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-gray-400"
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
                            <Loader2 className="h-10 w-10 animate-spin text-orange-500 mx-auto mb-4" />
                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Fetching organization data...</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/30">
                                    <th className="pl-5 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Organization</th>
                                    <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Admins</th>
                                    <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Jobs</th>
                                    <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Candidates</th>
                                    <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Credits Used</th>
                                    <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Remaining</th>
                                    <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Done</th>
                                    <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Status</th>
                                    <th className="pr-5 py-3 text-right font-bold text-[10px] text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {orgs.map((org) => (
                                    <tr key={org.id} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="pl-5 py-4">
                                            <div className="flex items-center gap-3">
                                                {org.logoUrl ? (
                                                    <div className="h-8 w-8 rounded-lg border border-gray-100 bg-white p-1 shadow-sm overflow-hidden flex items-center justify-center flex-shrink-0">
                                                        <img src={org.logoUrl} alt={org.name} className="h-full w-full object-contain" />
                                                    </div>
                                                ) : (
                                                    <div className="h-8 w-8 rounded-lg bg-gray-100 text-gray-600 flex flex-shrink-0 items-center justify-center font-bold text-[10px] shadow-sm">
                                                        {org.name[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-gray-900 font-bold text-[12px] truncate">{cleanName(org.name)}</span>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-[10px] font-medium text-gray-400 truncate uppercase">{formatOrgPlan(org.plan) || "Starter"}</span>
                                                        <span className="text-[10px] text-gray-300">•</span>
                                                        <span className="text-[9px] text-gray-400 truncate">{org.slug}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-gray-700 text-[11px] tabular-nums">
                                            {org.adminCount ?? org._count?.users ?? 0}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-gray-700 text-[11px] tabular-nums">
                                            {org.driveCount ?? org._count?.drives ?? 0}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-orange-500 text-[11px] tabular-nums">
                                            {org.candidateCount || 0}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-gray-500 text-[11px] tabular-nums">
                                            {org.creditsUsed || 0}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-emerald-600 text-[11px] tabular-nums">
                                            {Math.max(0, (org.interviewQuotaTotal || 0) - (org.interviewQuotaUsed || 0))}
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-blue-600 text-[11px] tabular-nums">
                                            {org.interviewQuotaUsed || 0}
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
                                                <DropdownMenuContent align="center" className="w-40 p-1.5 rounded-xl border-gray-100 shadow-xl bg-white/95 backdrop-blur-xl">
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
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-gray-100 text-gray-400 group-hover:text-gray-900 transition-colors">
                                                        <MoreVertical className="h-3 w-3" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 p-1.5 rounded-xl border-gray-100 shadow-xl bg-white/95 backdrop-blur-xl">
                                                    <div className="px-2.5 py-2 border-b border-gray-50 mb-1">
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Client Controls</p>
                                                    </div>
                                                    <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-gray-600 hover:bg-gray-50 font-bold text-[10px] transition-all flex items-center gap-2.5 group" onClick={() => openMetricsOrg(org)}>
                                                            <Layers className="h-3.5 w-3.5 text-gray-400 group-hover:text-orange-500 transition-colors" />
                                                            VIEW USAGE
                                                        </DropdownMenuItem>
                                                        <Link href={`/super-admin/orgs/${org.id}`} className="block w-full">
                                                            <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-gray-600 hover:bg-gray-50 font-bold text-[10px] transition-all flex items-center gap-2.5 group">
                                                                <Edit2 className="h-3.5 w-3.5 text-gray-400 group-hover:text-orange-500 transition-colors" />
                                                                EDIT SETTINGS
                                                            </DropdownMenuItem>
                                                        </Link>
                                                        <div className="h-px bg-gray-100/60 my-1 mx-1" />
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            setOrgToDelete(org);
                                                            setIsDeleteModalOpen(true);
                                                        }}
                                                        className="cursor-pointer rounded-lg px-2.5 py-2 text-red-600 hover:bg-red-50 font-bold text-[10px] transition-all flex items-center gap-2.5 group"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5 text-red-400 group-hover:text-red-600 transition-colors" />
                                                        DELETE PORTAL
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
                <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/20 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Page <span className="text-gray-900">{page}</span> of <span className="text-gray-900">{totalPages || 1}</span>
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
                        >
                            Previous
                        </button>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
            {/* Modals remain the same but use the premium style */}
            <ActionConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Organization"
                description={`Are you sure you want to terminate ${orgToDelete?.name}? This will permanently remove all data, recruitment drives, and candidates associated with this portal. This action is irreversible.`}
                confirmText="Confirm Deletion"
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
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm px-4 py-6 font-sans">
                    <div className="w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden rounded-[18px] border border-gray-200 bg-[#FAFAFA] shadow-2xl animate-in zoom-in-95 duration-500">
                        {/* Header */}
                        <div className="flex items-start justify-between px-8 py-6 border-b border-gray-200 bg-white">
                            <div>
                                <div className="flex items-center gap-2.5 mb-2.5">
                                    <span className="w-1 h-4.5 bg-[#F97316] rounded-sm" />
                                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">Live Intelligence Hub</span>
                                </div>
                                <h2 className="text-[34px] font-[800] text-gray-900 m-0 tracking-[-0.03em] leading-[1.05]">
                                    {metricsOrg.name} <span className="text-gray-400 font-[500]">- Consumption Hub</span>
                                </h2>
                                <div className="flex items-center gap-6 mt-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Credits Used:</span>
                                        <span className="text-[14px] font-black text-gray-900 tabular-nums">${Number(metricsOrg.creditsUsed || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="w-[1px] h-3 bg-gray-200" />
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Interview Balance:</span>
                                        <span className="text-[14px] font-black text-emerald-600 tabular-nums">{Math.max(0, (metricsOrg.interviewQuotaTotal || 0) - (metricsOrg.interviewQuotaUsed || 0))}</span>
                                        <span className="text-[11px] font-bold text-gray-300 uppercase">/ {metricsOrg.interviewQuotaTotal || 0}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* USD / INR Toggle */}
                                <div className="flex items-center bg-gray-100 rounded-[10px] p-1 gap-1">
                                    {(['USD', 'INR'] as const).map(c => (
                                        <button
                                            key={c}
                                            onClick={() => { setCurrency(c); if (c === 'INR' && !rateLoading) fetchExchangeRate(); }}
                                            className={`px-3 py-1.5 rounded-[8px] text-[11px] font-[700] uppercase tracking-wide transition-all ${
                                                currency === c
                                                    ? 'bg-white text-gray-900 shadow-sm'
                                                    : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            {c === 'INR' ? '₹ INR' : '$ USD'}
                                        </button>
                                    ))}
                                </div>
                                {currency === 'INR' && (
                                    <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                                        {rateLoading ? 'Fetching…' : `1 USD = ₹${usdToInr.toFixed(2)}`}
                                        {rateUpdatedAt && !rateLoading && <span className="ml-1 opacity-60">({rateUpdatedAt})</span>}
                                    </span>
                                )}
                                <button
                                    onClick={() => setMetricsOrg(null)}
                                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] border border-gray-200 bg-white text-gray-900 text-[13px] font-[600] cursor-pointer hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    <X size={15} /> Dismiss
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12">
                            {(() => {
                                const ivFeature = getBillingFeature(metricsOrg, 'interview');
                                // Interview donut: ONLY the interview feature's own LLM+TTS+STT cost
                                const ivLlmCost = Number(ivFeature.costUsd || 0);
                                const ivTtsCost = Number(ivFeature.ttsCostUsd || 0);
                                const ivSttCost = Number(ivFeature.sttCostUsd || 0);
                                const ivTotalCost = ivLlmCost + ivTtsCost + ivSttCost;
                                // Full pipeline total: sum of ALL features LLM+TTS+STT
                                const allLlmCost = metricSections.reduce((s, sec) => s + Number(getBillingFeature(metricsOrg, sec.key).costUsd || 0), 0);
                                const allTtsCost = metricSections.reduce((s, sec) => s + Number(getBillingFeature(metricsOrg, sec.key).ttsCostUsd || 0), 0);
                                const allSttCost = metricSections.reduce((s, sec) => s + Number(getBillingFeature(metricsOrg, sec.key).sttCostUsd || 0), 0);
                                const grandTotal = allLlmCost + allTtsCost + allSttCost;
                                const feature = ivFeature; // alias for interview feature
                                const totalCost = ivTotalCost;
                                const logicCost = ivLlmCost;
                                const synthCost = ivTtsCost;
                                const sttCost = ivSttCost;
                                const ringR = 88;
                                const ringC = 2 * Math.PI * ringR;
                                const getDash = (val: number) => totalCost > 0 ? ringC * (val / totalCost) : 0;
                                const logicDash = getDash(logicCost);
                                const synthDash = getDash(synthCost);
                                const sttDash = getDash(sttCost);
                                const totalTokens = Number(feature.inputTokens || 0) + Number(feature.outputTokens || 0);
                                const llmModels = Object.keys(feature.byModel || {});
                                const ttsModels = Object.keys(feature.ttsByModel || {});
                                const sttModels = Object.keys(feature.sttByModel || {});
                                const setupLlm = getSetupModel(metricsOrg, 'LLM');
                                const setupTts = getSetupModel(metricsOrg, 'TTS');
                                const setupStt = getSetupModel(metricsOrg, 'STT');
                                return (
                                    <div className="flex flex-col gap-12">
                                        {/* LLM Section */}
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-6">
                                                <h4 className="text-[11px] font-[800] uppercase tracking-[0.2em] text-gray-500 whitespace-nowrap">Core Processing Units</h4>
                                                <div className="h-[1px] flex-1 bg-gray-200" />
                                            </div>
                                            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                                                {metricSections.map((section) => {
                                                    const feature = getBillingFeature(metricsOrg, section.key);
                                                    const totalTokens = Number(feature.inputTokens || 0) + Number(feature.outputTokens || 0);
                                                    const models = Object.keys(feature.byModel || {});
                                                    const setupModel = getSetupModel(metricsOrg, 'LLM');
                                                    return (
                                                        <div key={section.key} className="bg-white border border-gray-200 rounded-[18px] p-6 hover:border-orange-200 hover:shadow-lg transition-all duration-300">
                                                        <div className="flex flex-col gap-4">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="text-[10px] font-[800] uppercase tracking-[0.15em] text-[#F97316]">{section.label.replace('LLM - ', '')}</div>
                                                                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                                                </div>
                                                                <div className="flex flex-wrap gap-2 min-h-[28px]">
                                                                    {(() => {
                                                                        // Use hardcoded authoritative model map; interview reads from org DB
                                                                        const hardcoded = FEATURE_MODEL_MAP[section.key];
                                                                        const activeModel = hardcoded ?? setupModel;
                                                                        return activeModel ? (
                                                                            <div className="text-[10px] font-[700] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 uppercase tracking-wide">
                                                                                {cleanName(activeModel)}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-[10px] font-[700] text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-200 border-dashed uppercase tracking-wide">
                                                                                NO LLM
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </div>
                                                                <div className="mt-6 mb-5">
                                                                <div className="text-[32px] font-[800] text-gray-900 tracking-[-0.03em]">{fmt(Number(feature.costUsd || 0))}</div>
                                                            </div>
                                                            <div className="space-y-2.5 pt-5 border-t border-gray-100 text-[11.5px] font-[600] text-gray-500 uppercase tracking-[0.1em]">
                                                                {section.key === 'interview' ? (
                                                                    <>
                                                                        <div className="flex justify-between items-center">
                                                                            <span>Done</span>
                                                                            <span className="text-gray-900 font-[700]">{Number(metricsOrg.interviewQuotaUsed || 0).toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center">
                                                                            <span>Remaining</span>
                                                                            <span className="text-emerald-600 font-[700]">{Math.max(0, (metricsOrg.interviewQuotaTotal || 0) - (metricsOrg.interviewQuotaUsed || 0)).toLocaleString()}</span>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <div className="flex justify-between items-center">
                                                                            <span>Executions</span>
                                                                            <span className="text-gray-900 font-[700]">{Number(feature.runs || 0).toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center">
                                                                            <span>Token Vol</span>
                                                                            <span className="text-gray-900 font-[700]">{totalTokens.toLocaleString()} <span className="text-[9px] opacity-50">TKN</span></span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {/* Voice & STT Section */}
                                        <div className="grid gap-8 md:grid-cols-2">
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-6">
                                                    <h4 className="text-[11px] font-[800] uppercase tracking-[0.2em] text-gray-500 whitespace-nowrap">TTS Hub</h4>
                                                    <div className="h-[1px] flex-1 bg-gray-200" />
                                                </div>
                                                <div className="bg-white border border-gray-200 rounded-[18px] p-8 hover:border-blue-200 hover:shadow-lg transition-all duration-300">
                                                    <div className="flex items-center justify-between mb-8">
                                                        <div className="space-y-2">
                                                            <div className="text-[40px] font-[800] text-gray-900 tracking-[-0.03em]">
                                                                {fmt(metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).ttsCostUsd || 0), 0))}
                                                            </div>
                                                            <div className="text-[11px] font-[800] uppercase tracking-[0.2em] text-blue-600">TTS</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[24px] font-[800] text-gray-900 tracking-[-0.03em]">{metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).ttsCharacters || 0), 0).toLocaleString()}</div>
                                                            <div className="text-[10px] font-[800] uppercase tracking-[0.15em] text-gray-500">Characters</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 pt-6 border-t border-gray-100">
                                                        {(() => {
                                                            // Show active TTS model from org setup config
                                                            const ttsModel = getSetupModel(metricsOrg, 'TTS');
                                                            const provider = metricsOrg.ttsProvider || 'CARTESIA';
                                                            return ttsModel ? (
                                                                <>
                                                                    <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-[10px] font-[700] rounded-md border border-blue-100 uppercase tracking-wide">
                                                                        {cleanName(ttsModel)}
                                                                    </span>
                                                                    <span className="px-3 py-1.5 bg-gray-50 text-gray-500 text-[10px] font-[700] rounded-md border border-gray-200 uppercase tracking-wide">
                                                                        {provider}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-gray-500 italic bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200 border-dashed">NO TTS</span>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-6">
                                                    <h4 className="text-[11px] font-[800] uppercase tracking-[0.2em] text-gray-500 whitespace-nowrap">STT Hub</h4>
                                                    <div className="h-[1px] flex-1 bg-gray-200" />
                                                </div>
                                                <div className="bg-white border border-gray-200 rounded-[18px] p-8 hover:border-orange-200 hover:shadow-lg transition-all duration-300">
                                                    <div className="flex items-center justify-between mb-8">
                                                        <div className="space-y-2">
                                                            <div className="text-[40px] font-[800] text-gray-900 tracking-[-0.03em]">
                                                                {fmt(metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).sttCostUsd || 0), 0))}
                                                            </div>
                                                            <div className="text-[11px] font-[800] uppercase tracking-[0.2em] text-orange-600">STT</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[24px] font-[800] text-gray-900 tracking-[-0.03em]">{(metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).sttAudioSeconds || 0), 0) / 60).toFixed(1)}m</div>
                                                            <div className="text-[10px] font-[800] uppercase tracking-[0.15em] text-gray-500">Minutes Transcribed</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 pt-6 border-t border-gray-100">
                                                        {(() => {
                                                            // Show active STT model from org setup config
                                                            const sttModel = getSetupModel(metricsOrg, 'STT');
                                                            const provider = metricsOrg.sttProvider || 'DEEPGRAM';
                                                            return sttModel ? (
                                                                <>
                                                                    <span className="px-3 py-1.5 bg-orange-50 text-orange-700 text-[10px] font-[700] rounded-md border border-orange-100 uppercase tracking-wide">
                                                                        {cleanName(sttModel)}
                                                                    </span>
                                                                    <span className="px-3 py-1.5 bg-gray-50 text-gray-500 text-[10px] font-[700] rounded-md border border-gray-200 uppercase tracking-wide">
                                                                        {provider}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-gray-500 italic bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200 border-dashed">NO STT</span>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Pipeline Summary */}
                                        <div className="space-y-6 pt-4">
                                            <div className="flex items-center gap-6">
                                                <h4 className="text-[11px] font-[800] uppercase tracking-[0.2em] text-gray-500 whitespace-nowrap">Total interview cost</h4>
                                                <div className="h-[1px] flex-1 bg-gray-200" />
                                            </div>
                                            <div className="bg-white border border-gray-200 rounded-[18px] overflow-hidden p-8">
                                                <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-10">
                                                    {/* Donut and Cost breakdown */}
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-6">
                                                            <div className="h-2 w-2 rounded-full bg-[#F97316]" />
                                                            <span className="text-[11px] font-[800] uppercase tracking-[0.2em] text-gray-500">Cost of interviews</span>
                                                        </div>
                                                        <div className="flex flex-col sm:flex-row items-center gap-8 mb-8">
                                                            <div className="relative w-[220px] h-[220px] shrink-0">
                                                                <svg width={220} height={220} style={{ transform: "rotate(-90deg)" }}>
                                                                    <circle cx={110} cy={110} r={ringR} stroke="#E5E7EB" strokeWidth={14} fill="none" />
                                                                    {totalCost > 0 && (
                                                                        <>
                                                                            <circle cx={110} cy={110} r={ringR} stroke="#10B981" strokeWidth={14} fill="none" strokeDasharray={`${logicDash} ${ringC}`} strokeLinecap="round" />
                                                                            <circle cx={110} cy={110} r={ringR} stroke="#3B82F6" strokeWidth={14} fill="none" strokeDasharray={`${synthDash} ${ringC}`} strokeDashoffset={-logicDash} strokeLinecap="round" />
                                                                            <circle cx={110} cy={110} r={ringR} stroke="#F97316" strokeWidth={14} fill="none" strokeDasharray={`${sttDash} ${ringC}`} strokeDashoffset={-(logicDash + synthDash)} strokeLinecap="round" />
                                                                        </>
                                                                    )}
                                                                </svg>
                                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                                    <div className="text-[11px] text-gray-500 font-[600] tracking-[0.1em] uppercase">Interview Cost</div>
                                                                    <div className="text-[44px] font-[800] text-gray-900 tracking-[-0.03em] mt-1.5">
                                                                        {fmt(ivTotalCost)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 grid gap-4 w-full">
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                                                                            <span className="text-[14.5px] font-[700] text-gray-900">LLM</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[16px] font-[800] text-gray-900">{fmt(logicCost)}</div>
                                                                </div>
                                                                <div className="h-px bg-[#F3F4F6]" />
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                                                                            <span className="text-[14.5px] font-[700] text-gray-900">TTS</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[16px] font-[800] text-gray-900">{fmt(synthCost)}</div>
                                                                </div>
                                                                <div className="h-px bg-[#F3F4F6]" />
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]" />
                                                                            <span className="text-[14.5px] font-[700] text-gray-900">STT</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[16px] font-[800] text-gray-900">{fmt(sttCost)}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Right Side Stats */}
                                                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-8 text-right">
                                                        <div className="space-y-1.5">
                                                            <div className="text-[11px] font-[800] uppercase tracking-[0.15em] text-gray-500">Active Jobs</div>
                                                            <div className="text-[28px] font-[800] text-gray-900 tabular-nums">{(metricsOrg as any).driveCount || 0}</div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="text-[11px] font-[800] uppercase tracking-[0.15em] text-gray-500">Total Sessions</div>
                                                            <div className="text-[28px] font-[800] text-gray-900 tabular-nums">{Number(feature.runs || 0).toLocaleString()}</div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="text-[11px] font-[800] uppercase tracking-[0.15em] text-gray-500">Consumed Tokens</div>
                                                            <div className="text-[28px] font-[800] text-gray-900 tabular-nums">{totalTokens.toLocaleString()}</div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="text-[11px] font-[800] uppercase tracking-[0.15em] text-gray-500">Audio Mins</div>
                                                            <div className="text-[28px] font-[800] text-gray-900 tabular-nums">
                                                                {Number(feature.sessionDuration || 0) > 0
                                                                    ? (Number(feature.sessionDuration || 0) / 60).toFixed(1)
                                                                    : (Number(feature.sttAudioSeconds || 0) / 60).toFixed(1)}<span className="text-sm ml-1 opacity-40">M</span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5 col-span-2">
                                                            <div className="text-[11px] font-[800] uppercase tracking-[0.15em] text-gray-500">Health</div>
                                                            <div className="text-[24px] font-[800] text-emerald-600 uppercase tracking-tight">Healthy</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Models Row */}
                                                <div className="border-t border-gray-100 mt-8 pt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                                                    <div>
                                                        <div className="text-[10px] font-[800] uppercase tracking-[0.2em] text-gray-500 mb-3 hover:text-[#10B981] transition-colors">LLM</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(() => {
                                                                return setupLlm ? (
                                                                    <span className="px-3 py-1 bg-[#10B981]/10 text-[#10B981] text-[10px] font-[700] rounded-md border border-[#10B981]/20 uppercase tracking-wide">
                                                                        {cleanName(setupLlm)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] font-[700] text-gray-500 italic">NO LLM</span>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-[800] uppercase tracking-[0.2em] text-gray-500 mb-3 hover:text-[#3B82F6] transition-colors">TTS</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(() => {
                                                                return setupTts ? (
                                                                    <span className="px-3 py-1 bg-[#3B82F6]/10 text-[#3B82F6] text-[10px] font-[700] rounded-md border border-[#3B82F6]/20 uppercase tracking-wide">
                                                                        {cleanName(setupTts)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] font-[700] text-gray-500 italic">NO TTS</span>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-[800] uppercase tracking-[0.2em] text-gray-500 mb-3 hover:text-[#F97316] transition-colors">STT</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(() => {
                                                                return setupStt ? (
                                                                    <span className="px-3 py-1 bg-[#F97316]/10 text-[#F97316] text-[10px] font-[700] rounded-md border border-[#F97316]/20 uppercase tracking-wide">
                                                                        {cleanName(setupStt)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] font-[700] text-gray-500 italic">NO STT</span>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                            <div className="border-t border-gray-200 px-8 py-6 bg-gray-50 flex items-center justify-between font-sans">
                                <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-gray-500">Total org cost</div>
                                <div className="text-[28px] font-[800] text-gray-900 tracking-[-0.03em]">
                                    {(() => {
                                        const allLlmCost = metricSections.reduce((s, sec) => s + Number(getBillingFeature(metricsOrg, sec.key).costUsd || 0), 0);
                                        const allTtsCost = metricSections.reduce((s, sec) => s + Number(getBillingFeature(metricsOrg, sec.key).ttsCostUsd || 0), 0);
                                        const allSttCost = metricSections.reduce((s, sec) => s + Number(getBillingFeature(metricsOrg, sec.key).sttCostUsd || 0), 0);
                                        const grandTotal = allLlmCost + allTtsCost + allSttCost;
                                        return fmt(grandTotal);
                                    })()}
                                </div>
                            </div>
                            <div className="border-t border-gray-200 px-8 py-6 bg-gray-50">
                                <div className="bg-white border border-gray-200 rounded-[18px] shadow-sm overflow-hidden">
                                    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-100 bg-gray-50/60">
                                        <div>
                                            <div className="text-[10px] font-[800] uppercase tracking-[0.2em] text-gray-400">Interview history</div>
                                            <h4 className="text-lg font-black text-gray-900">Recent interview usage</h4>
                                        </div>
                                        {historyLoading && (
                                            <div className="rounded-full border border-gray-100 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">
                                                Loading
                                            </div>
                                        )}
                                    </div>
                                    {historyError ? (
                                        <div className="px-6 py-6 text-sm font-semibold text-amber-700 bg-amber-50">
                                            {historyError}
                                        </div>
                                    ) : historyRows.length === 0 ? (
                                        <div className="px-6 py-8 text-center text-sm font-semibold text-gray-400">
                                            No interview history found yet.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50/80">
                                                    <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                        <th className="px-6 py-3">Interview</th>
                                                        <th className="px-6 py-3 text-center">Duration</th>
                                                        <th className="px-6 py-3 text-right">LLM</th>
                                                        <th className="px-6 py-3 text-right">TTS</th>
                                                        <th className="px-6 py-3 text-right">STT</th>
                                                        <th className="px-6 py-3 text-right">Total</th>
                                                        <th className="px-6 py-3 text-right">Completed</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 bg-white">
                                                    {historyRows.map((row) => (
                                                        <tr key={row.id} className="hover:bg-gray-50/70">
                                                            <td className="px-6 py-4">
                                                                <div className="font-bold text-gray-900">{row.interviewName}</div>
                                                                <div className="text-[11px] font-medium text-gray-500">{row.candidate} - {row.role}</div>
                                                            </td>
                                                            <td className="px-6 py-4 text-center text-sm font-bold text-gray-900">
                                                                {(Number(row.durationSec || 0) / 60).toFixed(1)} min
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                                                                {row.hasBillingSnapshot ? `$${Number(row.llmCostUsd || 0).toFixed(2)}` : "-"}
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                                                                {row.hasBillingSnapshot ? `$${Number(row.ttsCostUsd || 0).toFixed(2)}` : "-"}
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                                                                {row.hasBillingSnapshot ? `$${Number(row.sttCostUsd || 0).toFixed(2)}` : "-"}
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-sm font-black text-gray-900">
                                                                {row.hasBillingSnapshot ? `$${Number(row.totalCostUsd || 0).toFixed(2)}` : "-"}
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-[11px] font-semibold text-gray-500">
                                                                {new Date(row.date).toLocaleDateString(undefined, {
                                                                    year: "numeric",
                                                                    month: "short",
                                                                    day: "numeric",
                                                                })}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                        </div>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}
