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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-custom";
import { formatOrgPlan } from "@/lib/org-plans";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { ALL_VOICES } from "@/lib/constants/voices";
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
    voiceId?: string;
    allowedVoices?: string[];
    deepgramModel?: string;
    creditsUsed?: number;
    interviewsCompleted?: number;
    interviewQuotaTotal?: number;
    interviewQuotaUsed?: number;
    interviewCount?: number;
    _count?: {
        users: number;
        drives: number;
    };
}
type BillingFeatureKey = "interview" | "resumeExtraction" | "jdExtraction" | "resumeReport" | "interviewReport";
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
    llmCostUsd: number | null;
    ttsCostUsd: number | null;
    sttCostUsd: number | null;
    totalCostUsd: number | null;
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
    const [billingAggregates, setBillingAggregates] = useState<Record<string, any> | null>(null);
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
    useEffect(() => {
        try {
            const saved = window.localStorage.getItem("super-admin-org-currency");
            if (saved === "USD" || saved === "INR") {
                setCurrency(saved);
            }
        } catch {
            // Ignore storage issues and keep the default currency.
        }
    }, []);
    useEffect(() => {
        try {
            window.localStorage.setItem("super-admin-org-currency", currency);
        } catch {
            // Ignore storage issues.
        }
    }, [currency]);
    // Called when Consumption Hub opens
    const openMetricsOrg = async (org: Org) => {
        setMetricsOrg(org);
        setBillingAggregates(null);
        fetchExchangeRate();
        // Fetch per-provider aggregates from backend
        try {
            const res = await fetch(`/api/super-admin/orgs/${org.id}/billing`);
            if (res.ok) {
                const data = await res.json();
                setBillingAggregates(data);
            }
        } catch (err) {
            console.error("Failed to fetch billing aggregates:", err);
        }
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
        if (usd === 0) return "$0.00";
        if (usd < 0.005) return `$${usd.toFixed(4)}`;
        return `$${usd.toFixed(2)}`;
    };
    const fmtHistory = (usd: number | null | undefined) => usd == null ? "-" : fmt(Number(usd || 0));
    const metricSections: { key: BillingFeatureKey; label: string }[] = [
        { key: "resumeExtraction", label: "LLM - Resume" },
        { key: "interview", label: "LLM - Interview" },
        { key: "jdExtraction", label: "LLM - JD" },
        { key: "resumeReport", label: "LLM - Resume Report" },
        { key: "interviewReport", label: "LLM - Interview Report" },
    ];
    const FEATURE_MODEL_DISPLAY_MAP: Record<BillingFeatureKey, string> = {
        resumeExtraction: "gpt-5.4-mini",
        jdExtraction: "gpt-5.4-mini",
        interview: "gpt-4.1-mini",
        resumeReport: "gpt-5.4-mini",
        interviewReport: "gpt-5.4-mini",
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
        const cleaned = base.replace(/-\d{4}-\d{2}-\d{2}$/, '');
        return cleaned.trim();
    };
    const isUnknownLabel = (value: string) => {
        const normalized = cleanName(String(value || "")).toLowerCase();
        return !normalized || normalized === "unknown" || normalized === "no recorded model";
    };
    const displayLlmModel = (feature: BillingFeatureMetrics, key: BillingFeatureKey) => {
        return [FEATURE_MODEL_DISPLAY_MAP[key]];
    };
    const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
    const getRecordedModels = (models?: Record<string, any>) => {
        return unique(Object.entries(models || {}).map(([key, value]) => {
            const model = value && typeof value === "object" ? String(value.model || "") : "";
            return cleanName(model || key);
        })).filter((model) => !isUnknownLabel(model));
    };
    const getRecordedProviders = (models?: Record<string, any>) => {
        return unique(Object.values(models || {}).map((value) => (
            value && typeof value === "object" ? String(value.provider || "") : ""
        ))).filter(Boolean);
    };
    const getConfiguredTtsVoices = (org: Org) => {
        const ids = Array.isArray(org.allowedVoices) && org.allowedVoices.length > 0
            ? org.allowedVoices
            : org.voiceId ? [org.voiceId] : [];
        return ids
            .map((id) => ALL_VOICES.find((v) => v.id === id))
            .filter(Boolean) as typeof ALL_VOICES;
    };
    const getUsageSummary = (usageMetrics?: Record<string, unknown> | null) => {
        if (!usageMetrics || typeof usageMetrics !== "object") return fmt(0);
        const cost = getOrgTotalBillingCost({ usageMetrics } as any);
        return fmt(cost);
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
                                        <td className="px-4 py-4 text-center font-bold text-violet-500 text-[11px] tabular-nums">
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
                                                    <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 font-medium transition-all flex items-center gap-2" onClick={() => openMetricsOrg(org)}>
                                                        <Layers className="h-3.5 w-3.5 text-gray-400" />
                                                        View Usage
                                                    </DropdownMenuItem>
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
                description={`Are you sure you want to terminate ${orgToDelete?.name}? This will permanently remove all data, recruitment drives, and candidates associated with this portal. This action is irreversible.`}
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
            {metricsOrg && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4">
                    <div className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white animate-in zoom-in-95 duration-300" style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid #F0EEF8" }}>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Usage · {metricsOrg.name}</span>
                                </div>
                                <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
                                    Consumption Hub
                                </h2>
                                <div className="flex items-center gap-5 mt-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium text-gray-400">Minutes Used:</span>
                                        <span className="text-sm font-semibold text-gray-900 tabular-nums">{Number(metricsOrg.creditsUsed || 0).toFixed(2)} min</span>
                                    </div>
                                    <div className="w-px h-3" style={{ background: "#E9E7FF" }} />
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium text-gray-400">Interview Balance:</span>
                                        <span className="text-sm font-semibold text-emerald-600 tabular-nums">{Math.max(0, (metricsOrg.interviewQuotaTotal || 0) - (metricsOrg.interviewQuotaUsed || 0))}</span>
                                        <span className="text-xs text-gray-300">/ {metricsOrg.interviewQuotaTotal || 0}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                                {/* USD / INR Toggle */}
                                <div className="flex items-center rounded-xl p-1 gap-0.5" style={{ background: "#F5F3FF" }}>
                                    {(['USD', 'INR'] as const).map(c => (
                                        <button
                                            key={c}
                                            onClick={() => { setCurrency(c); if (c === 'INR' && !rateLoading) fetchExchangeRate(); }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                                currency === c
                                                    ? 'bg-white text-violet-700 shadow-sm'
                                                    : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            {c === 'INR' ? '₹ INR' : '$ USD'}
                                        </button>
                                    ))}
                                </div>
                                {currency === 'INR' && (
                                    <span className="text-xs text-gray-400 tabular-nums">
                                        {rateLoading ? 'Fetching…' : `1 USD = ₹${usdToInr.toFixed(2)}`}
                                    </span>
                                )}
                                <button
                                    onClick={() => { setMetricsOrg(null); setBillingAggregates(null); }}
                                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all"
                                    style={{ border: "1px solid #E9E7FF" }}
                                >
                                    <X size={14} /> Dismiss
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6" style={{ background: "#FAFAFC" }}>
                            {(() => {
                                const ivFeature = billingAggregates?.interview || {};
                                // Interview donut: ONLY the interview feature's own LLM+TTS+STT cost
                                const ivLlmCost = Number(ivFeature.costUsd || 0);
                                const ivTtsCost = Number(ivFeature.ttsCostUsd || 0);
                                const ivSttCost = Number(ivFeature.sttCostUsd || 0);
                                const ivTotalCost = ivLlmCost + ivTtsCost + ivSttCost;
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
                                return (
                                    <div className="flex flex-col gap-6">
                                        {/* SECTION 1: LLM Models Table */}
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">LLM Models & Pricing</h4>
                                            <div className="bg-white rounded-2xl overflow-hidden border border-gray-200" style={{ boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="bg-gray-50/80 border-b border-gray-100">
                                                            <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Model</th>
                                                            <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Provider</th>
                                                            <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Runs</th>
                                                            <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Tokens</th>
                                                            <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">Cost</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {[
                                                            { label: "Resume Extraction", key: "resumeExtraction", costKey: "resumeExtraction" },
                                                            { label: "JD Extraction", key: "jdExtraction", costKey: "jdExtraction" },
                                                            { label: "Interview Report", key: "interviewReport", costKey: "interviewReport" },
                                                            { label: "Resume Report", key: "resumeReport", costKey: "resumeReport" },
                                                            // Eval costs go to billing.interview in Python, not interviewEvaluation
                                                            { label: "Interview Evaluation", key: "interviewEvaluation", costKey: "interview" },
                                                            { label: "Interview LLM Generation", key: "interviewLLMGeneration", costKey: "interviewLLMGeneration" },
                                                            { label: "Interview Brief", key: "interviewBrief", costKey: "interviewBrief" },
                                                        ].map((row) => {
                                                            const feature = billingAggregates?.[row.key as string] || {};
                                                            const totalTokens = Number(feature.inputTokens || 0) + Number(feature.outputTokens || 0);
                                                            const model = feature.model || "-";
                                                            const runs = Number(feature.runs || 0);
                                                            const cost = Number(billingAggregates?.[row.costKey as string]?.costUsd || 0);
                                                            return (
                                                                <tr key={row.label} className="hover:bg-gray-50/50">
                                                                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{row.label}</td>
                                                                    <td className="px-6 py-4 text-sm text-gray-600">{model}</td>
                                                                    <td className="px-6 py-4 text-sm text-gray-600">{runs.toLocaleString()}</td>
                                                                    <td className="px-6 py-4 text-sm text-gray-600">{totalTokens > 999 ? `${(totalTokens/1000).toFixed(1)}K` : totalTokens}</td>
                                                                    <td className="px-6 py-4 text-sm font-bold text-right text-gray-900">{fmt(cost)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* SECTION 2: Overall Interview Cost */}
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Interview Overall Cost</h4>
                                            <div className="bg-gradient-to-br from-violet-50/30 to-blue-50/30 rounded-2xl border border-gray-200 p-6">
                                                <div className="text-center">
                                                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Brief + Evaluation + LLM Generation</div>
                                                    <div className="mt-3 text-4xl font-bold text-violet-600">
                                                        {fmt(
                                                            Number(billingAggregates?.interview?.costUsd || 0) +
                                                            Number(billingAggregates?.interviewBrief?.costUsd || 0) +
                                                            Number(billingAggregates?.interviewLLMGeneration?.costUsd || 0)
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECTION 3: TTS Hub */}
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">TTS Hub - Characters & Pricing</h4>
                                            <div className="grid gap-3 grid-cols-3">
                                                {[
                                                    { label: "ElevenLabs", provider: "ELEVENLABS" },
                                                    { label: "Cartesia", provider: "CARTESIA" },
                                                    { label: "Sarvam", provider: "SARVAM" },
                                                ].map((tts) => {
                                                    const ttsProviders = billingAggregates?.interview?.ttsProviders || {};
                                                    const providerData = ttsProviders[tts.provider] || { characters: 0, costUsd: 0 };
                                                    const ttsChars = Number(providerData.characters || 0);
                                                    const ttsCost = Number(providerData.costUsd || 0);
                                                    return (
                                                        <div key={tts.provider} className="bg-white rounded-2xl border border-gray-200 p-4" style={{ boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                                                            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-4">{tts.label}</div>
                                                            <div className="space-y-3">
                                                                <div>
                                                                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Characters</div>
                                                                    <div className="mt-1 text-xl font-bold text-gray-900">{ttsChars.toLocaleString()}</div>
                                                                </div>
                                                                <div className="border-t border-gray-100 pt-3">
                                                                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Price</div>
                                                                    <div className="mt-1 text-xl font-bold text-gray-900">{fmt(ttsCost)}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* SECTION 4: STT Hub (Deepgram) */}
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">STT Hub - Deepgram</h4>
                                            <div className="grid gap-3 grid-cols-2">
                                                {(() => {
                                                    const sttProviders = billingAggregates?.interview?.sttProviders || {};
                                                    const deepgramData = sttProviders.deepgram || { seconds: 0, costUsd: 0 };
                                                    const sttMinutes = (Number(deepgramData.seconds || 0) / 60).toFixed(1);
                                                    const sttCost = Number(deepgramData.costUsd || 0);
                                                    return (
                                                        <>
                                                            <div className="bg-white rounded-2xl border border-gray-200 p-4" style={{ boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                                                                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Audio Duration</div>
                                                                <div className="text-2xl font-bold text-gray-900">{sttMinutes} <span className="text-sm text-gray-500 font-medium">min</span></div>
                                                            </div>
                                                            <div className="bg-white rounded-2xl border border-gray-200 p-4" style={{ boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                                                                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Cost</div>
                                                                <div className="text-2xl font-bold text-gray-900">{fmt(sttCost)}</div>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        {/* Pipeline Summary */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Total Interview Cost</h4>
                                                <div className="h-px flex-1" style={{ background: "#E9E7FF" }} />
                                            </div>
                                            <div className="bg-white rounded-2xl overflow-hidden p-6" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                                                <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-10">
                                                    {/* Donut and Cost breakdown */}
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-6">
                                                            <div className="h-2 w-2 rounded-full bg-[#7C3AED]" />
                                                            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Cost of interviews</span>
                                                        </div>
                                                        <div className="flex flex-col sm:flex-row items-center gap-8 mb-8">
                                                            <div className="relative w-[220px] h-[220px] shrink-0">
                                                                <svg width={220} height={220} style={{ transform: "rotate(-90deg)" }}>
                                                                    <circle cx={110} cy={110} r={ringR} stroke="#E5E7EB" strokeWidth={14} fill="none" />
                                                                    {totalCost > 0 && (
                                                                        <>
                                                                            <circle cx={110} cy={110} r={ringR} stroke="#10B981" strokeWidth={14} fill="none" strokeDasharray={`${logicDash} ${ringC}`} strokeLinecap="round" />
                                                                            <circle cx={110} cy={110} r={ringR} stroke="#3B82F6" strokeWidth={14} fill="none" strokeDasharray={`${synthDash} ${ringC}`} strokeDashoffset={-logicDash} strokeLinecap="round" />
                                                                            <circle cx={110} cy={110} r={ringR} stroke="#7C3AED" strokeWidth={14} fill="none" strokeDasharray={`${sttDash} ${ringC}`} strokeDashoffset={-(logicDash + synthDash)} strokeLinecap="round" />
                                                                        </>
                                                                    )}
                                                                </svg>
                                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                                    <div className="text-[11px] text-gray-500 font-medium tracking-[0.1em] uppercase">Interview Cost</div>
                                                                    <div className="text-[44px] font-bold text-gray-900 tracking-tight mt-1.5">
                                                                        {fmt(ivTotalCost)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 grid gap-4 w-full">
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                                                                            <span className="text-[14.5px] font-semibold text-gray-900">LLM</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[16px] font-bold text-gray-900">{fmt(logicCost)}</div>
                                                                </div>
                                                                <div className="h-px bg-[#F3F4F6]" />
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                                                                            <span className="text-[14.5px] font-semibold text-gray-900">TTS</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[16px] font-bold text-gray-900">{fmt(synthCost)}</div>
                                                                </div>
                                                                <div className="h-px bg-[#F3F4F6]" />
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED]" />
                                                                            <span className="text-[14.5px] font-semibold text-gray-900">STT</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[16px] font-bold text-gray-900">{fmt(sttCost)}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Right Side Stats */}
                                                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-8 text-right">
                                                        <div className="space-y-1.5">
                                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Jobs</div>
                                                            <div className="text-[28px] font-bold text-gray-900 tabular-nums">{(metricsOrg as any).driveCount || 0}</div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Sessions</div>
                                                            <div className="text-[28px] font-bold text-gray-900 tabular-nums">{Number(feature.runs || 0).toLocaleString()}</div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Consumed Tokens</div>
                                                            <div className="text-[28px] font-bold text-gray-900 tabular-nums">{totalTokens.toLocaleString()}</div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">STT Mins</div>
                                                            <div className="text-[28px] font-bold text-gray-900 tabular-nums">
                                                                {Number(feature.sessionDuration || 0) > 0
                                                                    ? (Number(feature.sessionDuration || 0) / 60).toFixed(1)
                                                                    : (Number(feature.sttAudioSeconds || 0) / 60).toFixed(1)}<span className="text-[13px] font-medium ml-1 opacity-40">min</span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5 col-span-2">
                                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Health</div>
                                                            <div className="text-2xl font-bold text-emerald-600 uppercase tracking-tight">Healthy</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Models Row */}
                                                <div className="border-t border-gray-100 mt-8 pt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                                                    <div>
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 hover:text-[#10B981] transition-colors">LLM</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {feature.model && (
                                                                <span className="px-3 py-1 bg-[#10B981]/10 text-[#10B981] text-[10px] font-semibold rounded-md border border-[#10B981]/20 uppercase tracking-wide">
                                                                    {feature.model}
                                                                </span>
                                                            )}
                                                            <span className="px-3 py-1 bg-gray-50 text-gray-500 text-[10px] font-semibold rounded-md border border-gray-200 uppercase tracking-wide">openai</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 hover:text-[#3B82F6] transition-colors">TTS</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(() => {
                                                                const ttsProviders = Object.keys(feature.ttsProviders || {});
                                                                if (!ttsProviders.length) return <span className="text-[10px] font-semibold text-gray-500 italic">NO TTS CONFIGURED</span>;
                                                                return ttsProviders.map(p => (
                                                                    <span key={p} className="px-3 py-1 bg-gray-50 text-gray-500 text-[10px] font-semibold rounded-md border border-gray-200 uppercase tracking-wide">{p}</span>
                                                                ));
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 hover:text-[#7C3AED] transition-colors">STT</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(() => {
                                                                const sttProviders = Object.keys(feature.sttProviders || {});
                                                                return sttProviders.length ? (
                                                                    <>
                                                                        {sttProviders.map((provider) => (
                                                                            <span key={provider} className="px-3 py-1 bg-gray-50 text-gray-500 text-[10px] font-semibold rounded-md border border-gray-200 uppercase tracking-wide">
                                                                                {provider}
                                                                            </span>
                                                                        ))}
                                                                    </>
                                                                ) : (
                                                                    <span className="text-[10px] font-semibold text-gray-500 italic">NO RECORDED STT</span>
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
                                <div className="text-[12px] font-bold uppercase tracking-widest text-gray-500">Total org cost</div>
                                <div className="text-[28px] font-bold text-gray-900 tracking-tight">
                                    {(() => {
                                        const allLlmCost = (billingAggregates?.resumeExtraction?.costUsd || 0) + (billingAggregates?.jdExtraction?.costUsd || 0) + (billingAggregates?.interviewReport?.costUsd || 0) + (billingAggregates?.resumeReport?.costUsd || 0) + (billingAggregates?.interview?.costUsd || 0) + (billingAggregates?.interviewBrief?.costUsd || 0) + (billingAggregates?.interviewLLMGeneration?.costUsd || 0);
                                        const allTtsCost = billingAggregates?.interview?.ttsCostUsd || 0;
                                        const allSttCost = billingAggregates?.interview?.sttCostUsd || 0;
                                        const grandTotal = allLlmCost + allTtsCost + allSttCost;
                                        return fmt(grandTotal);
                                    })()}
                                </div>
                            </div>
                            <div className="border-t border-gray-200 px-8 py-6 bg-gray-50">
                                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-100 bg-gray-50/60">
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Interview history</div>
                                            <h4 className="text-lg font-black text-gray-900">Recent interview usage</h4>
                                        </div>
                                        {historyLoading && (
                                            <div className="rounded-full border border-gray-100 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
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
                                                                {row.hasBillingSnapshot ? fmtHistory(row.llmCostUsd) : "-"}
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                                                                {row.hasBillingSnapshot ? fmtHistory(row.ttsCostUsd) : "-"}
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                                                                {row.hasBillingSnapshot ? fmtHistory(row.sttCostUsd) : "-"}
                                                            </td>
                                                            <td className="px-6 py-4 text-right text-sm font-black text-gray-900">
                                                                {row.hasBillingSnapshot ? fmtHistory(row.totalCostUsd) : "-"}
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
