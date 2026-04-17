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
} from "lucide-react";
import { Skeleton as Shimmer } from "@/components/ui/skeleton";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast-custom";

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

export default function OrgsPage() {
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

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

        // Search Hierarchy:
        // 1. usage.billing[key] (Standard)
        // 2. usage[key] (Legacy/Alternative)
        // 3. Empty bucket (Fallback)
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
        // Convert the raw metrics into a dummy Org shape for the cost function
        const cost = getOrgTotalBillingCost({ usageMetrics } as any);
        return `$${cost.toFixed(2)}`;
    };

    const fetchOrgs = async (currentPage = page, query = search) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: String(limit),
                ...(query ? { q: query } : {}),
            });
            const res = await fetch(`/api/super-admin/orgs?${params}`);
            const data = await res.json();
            if (data.orgs) {
                setOrgs(data.orgs);
                setTotal(data.pagination.total);
                setTotalPages(data.pagination.totalPages);
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

    // Debounced search — waits 300ms after user stops typing before hitting the API
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        fetchOrgs(page, search);
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setActiveMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search]);


    const deleteOrg = async (org: Org) => {
        setOrgToDelete(org);
        setIsDeleteModalOpen(true);
    };

    const handleStatusChange = async (orgId: string, newStatus: string) => {
        const org = orgs.find(o => o.id === orgId);
        if (!org || org.status === newStatus) return;

        // Instead of immediate update, open the confirmation modal
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
        // OPTIMISTIC UPDATE: Change UI instantly
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: newStatus } : o));
        setSyncingOrgs(prev => new Set(prev).add(orgId));
        setStatusModalOrg(null);

        try {
            const res = await fetch(`/api/super-admin/orgs/${orgId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!res.ok) {
                throw new Error("Failed to update status");
            }
            toast.success(`${orgName} status updated to ${newStatus.toLowerCase()}`);
        } catch (error) {
            // ROLLBACK: Revert to previous state on failure
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
                fetchOrgs(page, search);
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
        <div className="space-y-8 pb-12 animate-in-fade">

            {/* Header Area */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Organizations</h1>
                        <p className="text-gray-500 font-medium mt-1 text-base">Partner registry · {total} organizations</p>
                    </div>
                </div>
                <Link
                    href="/super-admin/orgs/new"
                    className="flex items-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white text-[13.5px] font-medium px-4 py-2 rounded-lg transition-all duration-150 shadow-sm hover:shadow-md"
                >
                    <Plus className="h-4 w-4" />
                    Onboard Partner
                </Link>
            </div>

            {/* Search Section */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="h-6 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-lg font-bold text-gray-900">Partner Registry</h2>
                    </div>
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-gray-900" />
                        <input
                            type="text"
                            placeholder="Search organizations..."
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            className="h-10 w-[300px] pl-10 pr-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] transition-all"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden animate-in-fade">
                        <div className="grid grid-cols-[2fr_1fr_80px_80px_100px_120px_130px_1fr] gap-4 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                            {Array(8).fill(0).map((_, i) => <Shimmer key={i} className="h-4 w-20 rounded-md" />)}
                        </div>
                        <div className="divide-y divide-gray-100">
                            {Array(5).fill(0).map((_, i) => (
                                <div key={i} className="grid grid-cols-[2fr_1.2fr_80px_80px_100px_120px_130px_1fr] gap-4 px-6 py-6 items-center">
                                    <div className="flex items-center gap-4">
                                        <Shimmer className="h-11 w-11 rounded-xl flex-shrink-0" />
                                        <div className="space-y-2 flex-1">
                                            <Shimmer className="h-4 w-3/4" />
                                            <Shimmer className="h-3 w-1/2" />
                                        </div>
                                    </div>
                                    <Shimmer className="h-4 w-28" />
                                    <Shimmer className="h-4 w-8 mx-auto" />
                                    <Shimmer className="h-4 w-8 mx-auto" />
                                    <Shimmer className="h-4 w-8 mx-auto" />
                                    <Shimmer className="h-10 w-20 mx-auto rounded-lg" />
                                    <Shimmer className="h-8 w-24 mx-auto rounded-md" />
                                    <div className="flex justify-end gap-2">
                                        <Shimmer className="h-9 w-10 rounded-lg" />
                                        <Shimmer className="h-9 w-10 rounded-lg" />
                                        <Shimmer className="h-9 w-10 rounded-lg" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
                        {/* Table Header */}
                        <div className="grid grid-cols-[2fr_1.2fr_80px_80px_100px_120px_130px_1fr] gap-4 px-6 py-4 border-b border-gray-100 text-[11px] font-black tracking-widest text-gray-400 uppercase bg-gray-50/50">
                            <span>ORGANIZATION</span>
                            <span>IDENTIFIER</span>
                            <span className="text-center">ADMINS</span>
                            <span className="text-center">DRIVES</span>
                            <span className="text-center">CANDIDATES</span>
                            <span className="text-center">USAGE</span>
                            <span className="text-center">STATUS</span>
                            <span className="text-right">ACTIONS</span>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {orgs.map((org) => (
                                <div key={org.id} className="grid grid-cols-[2fr_1.2fr_80px_80px_100px_120px_130px_1fr] gap-4 px-6 py-5 items-center hover:bg-gray-50/50 transition-all group overflow-visible">
                                    {/* Column 1: Organization Identity */}
                                    <div className="flex items-center gap-4">
                                        <div className="h-11 w-11 rounded-xl bg-gray-900 text-white flex flex-shrink-0 items-center justify-center font-black text-sm shadow-lg group-hover:scale-110 transition-transform">
                                            {org.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col truncate">
                                            <p className="text-gray-900 font-black text-[15px] truncate">{org.name}</p>
                                            <div className="inline-flex items-center px-1.5 py-0.5 mt-1 rounded bg-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-widest w-fit">
                                                {org.plan || "CORE"} PROTOCOL
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Identifier */}
                                    <div className="flex flex-col gap-1 truncate">
                                        <div className="flex items-center gap-2">
                                            <Globe className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#F97316] transition-colors" />
                                            <p className="text-gray-700 font-black text-[11px] uppercase tracking-widest truncate">/{org.slug || org.name.toLowerCase().replace(/\s+/g, '-')}</p>
                                        </div>
                                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-tighter ml-5.5 leading-none">Internal_Ref</p>
                                    </div>

                                    {/* Column 3: Admins */}
                                    <div className="text-center font-black text-gray-900 text-base tabular-nums tracking-tighter">
                                        {org.adminCount ?? org._count?.users ?? 0}
                                    </div>

                                    {/* Column 4: Drives */}
                                    <div className="text-center font-black text-gray-900 text-base tabular-nums tracking-tighter">
                                        {org.driveCount ?? org._count?.drives ?? 0}
                                    </div>

                                    {/* Column 5: Candidates */}
                                    <div className="text-center font-black text-[#F97316] text-base tabular-nums tracking-tighter">
                                        {org.candidateCount || 0}
                                    </div>

                                    {/* Column 6: Consumption */}
                                    <div className="text-center">
                                        <div className="inline-flex flex-col items-center gap-0.5 rounded-lg border border-gray-100 bg-gray-50/50 px-2.5 py-1.5 shadow-sm">
                                            <span className="text-[11px] font-black text-gray-900 tracking-tighter">
                                                {getUsageSummary(org.usageMetrics)}
                                            </span>
                                            <button
                                                onClick={() => setMetricsOrg(org)}
                                                className="text-gray-300 hover:text-[#F97316] transition-colors"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Column 7: Status */}
                                    <div className="flex justify-center">
                                        <div className="relative group/status underline-offset-4">
                                            <Select
                                                value={org.status || "ACTIVE"}
                                                onValueChange={(val) => handleStatusChange(org.id, val)}
                                                disabled={syncingOrgs.has(org.id)}
                                            >
                                                <SelectTrigger className={`h-8 w-[110px] rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all duration-300 shadow-sm hover:shadow-md focus:ring-0 focus:ring-offset-0 ${(org.status || "ACTIVE") === "ACTIVE"
                                                    ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700 hover:bg-emerald-100/50'
                                                    : (org.status || "ACTIVE") === "SUSPENDED"
                                                        ? 'bg-amber-50/50 border-amber-100 text-amber-700 hover:bg-amber-100/50'
                                                        : 'bg-rose-50/50 border-rose-100 text-rose-700 hover:bg-rose-100/50'
                                                    }`}>
                                                    <div className="flex items-center gap-2 w-full">
                                                        {syncingOrgs.has(org.id) && (
                                                            <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-400" />
                                                        )}
                                                        <SelectValue />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl border-gray-100 shadow-[0_20px_60px_rgba(0,0,0,0.1)] p-1.5 min-w-[130px] animate-in zoom-in-95 duration-200">
                                                    <SelectItem value="ACTIVE" className="rounded-lg font-black uppercase text-[9px] tracking-widest text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700 py-3 mb-1 cursor-pointer">
                                                        <span className="flex items-center gap-2">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                            Active
                                                        </span>
                                                    </SelectItem>
                                                    <SelectItem value="SUSPENDED" className="rounded-lg font-black uppercase text-[9px] tracking-widest text-amber-600 focus:bg-amber-50 focus:text-amber-700 py-3 mb-1 cursor-pointer">
                                                        <span className="flex items-center gap-2">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                            Suspend
                                                        </span>
                                                    </SelectItem>
                                                    <SelectItem value="CLOSED" className="rounded-lg font-black uppercase text-[9px] tracking-widest text-rose-600 focus:bg-rose-50 focus:text-rose-700 py-3 cursor-pointer">
                                                        <span className="flex items-center gap-2">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                            Close
                                                        </span>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>

                                            {/* Sync status indicator */}
                                            {syncingOrgs.has(org.id) && (
                                                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-950 text-white text-[8px] font-black uppercase px-2 py-1 rounded-md shadow-2xl animate-bounce">
                                                    SYNC_CLOUD
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 8: Actions */}
                                    <div className="flex items-center justify-end">
                                        <div className="relative overflow-visible" ref={(el) => {
                                            if (el && activeMenu === org.id) {
                                                menuRef.current = el;
                                            }
                                        }}>
                                            {/* Three Dots Trigger */}
                                            <button
                                                onClick={() => setActiveMenu(activeMenu === org.id ? null : org.id)}
                                                className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all active:scale-95 ${activeMenu === org.id
                                                    ? 'bg-[#F97316] text-white shadow-lg'
                                                    : 'bg-white text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-gray-100 shadow-sm'}`}
                                                title="More Actions"
                                            >
                                                <MoreVertical className="h-4 w-4" />
                                            </button>                                            {activeMenu === org.id && (
                                                <div className="absolute right-0 top-11 w-60 bg-white border border-gray-100 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-1.5 z-[250] animate-in slide-in-from-top-2 duration-200">
                                                    {/* View Section */}
                                                    <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                                                        Navigation
                                                    </div>
                                                    <Link
                                                        href={`/super-admin/orgs/${org.id}/view?tab=drives`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors group/item"
                                                    >
                                                        <Briefcase className="h-4 w-4 text-gray-400 group-hover/item:text-blue-600 transition-colors" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[13px] font-semibold text-gray-900">View Drives</span>
                                                            <span className="text-[10px] text-gray-500">Recruitment pipelines</span>
                                                        </div>
                                                    </Link>
                                                    <Link
                                                        href={`/super-admin/orgs/${org.id}/view?tab=candidates`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors group/item"
                                                    >
                                                        <Users className="h-4 w-4 text-gray-400 group-hover/item:text-indigo-600 transition-colors" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[13px] font-semibold text-gray-900">View Candidates</span>
                                                            <span className="text-[10px] text-gray-500">Manage all profiles</span>
                                                        </div>
                                                    </Link>

                                                    <div className="h-px bg-gray-50 my-1 mx-2" />

                                                    {/* Edit Link */}
                                                    <Link
                                                        href={`/super-admin/orgs/${org.id}`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors group/item"
                                                    >
                                                        <Edit2 className="h-4 w-4 text-gray-400 group-hover/item:text-[#F97316] transition-colors" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[13px] font-semibold text-gray-900">Edit Settings</span>
                                                            <span className="text-[10px] text-gray-500">Configure parameters</span>
                                                        </div>
                                                    </Link>

                                                    {/* Delete Action */}
                                                    <button
                                                        onClick={() => {
                                                            setActiveMenu(null);
                                                            setOrgToDelete(org);
                                                            setIsDeleteModalOpen(true);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors group/item"
                                                    >
                                                        <Trash2 className="h-4 w-4 text-gray-400 group-hover/item:text-red-500 transition-colors" />
                                                        <div className="flex flex-col items-start">
                                                            <span className="text-[13px] font-semibold text-gray-900">Terminate Portal</span>
                                                            <span className="text-[10px] text-gray-400 group-hover/item:text-red-400">Permanent destruction</span>
                                                        </div>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        <div className="px-6 py-4 bg-gray-50/50 flex items-center justify-between border-t border-gray-100">
                            <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-widest flex items-center gap-3">
                                <Layers className="h-4 w-4" />
                                SHOWING {orgs.length} OF {total} PARTNERS · PAGE {page} OF {totalPages || 1}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="h-9 px-4 bg-gray-100 text-gray-400 font-bold text-[11px] uppercase tracking-widest rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 transition-all"
                                >Previous</button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="h-9 px-4 bg-white border border-gray-200 text-gray-900 font-bold text-[11px] uppercase tracking-widest rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 shadow-sm transition-all"
                                >Next</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ActionConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Terminate Organization"
                description={`Are you sure you want to terminate ${orgToDelete?.name}? This will permanently remove all data, recruitment drives, and candidates associated with this portal. This action is irreversible.`}
                confirmText="Confirm Termination"
                isLoading={isDeleting}
            />

            {/* Status Toggle Modal */}
            {statusModalOrg && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm mx-4 space-y-6">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${
                                statusModalOrg.pendingStatus === "ACTIVE" 
                                    ? "bg-emerald-50" 
                                    : statusModalOrg.pendingStatus === "SUSPENDED" 
                                        ? "bg-amber-50" 
                                        : "bg-rose-50"
                            }`}>
                                {statusModalOrg.pendingStatus === "ACTIVE" ? (
                                    <AlertCircle className="h-7 w-7 text-emerald-500" />
                                ) : statusModalOrg.pendingStatus === "SUSPENDED" ? (
                                    <Clock className="h-7 w-7 text-amber-500" />
                                ) : (
                                    <AlertCircle className="h-7 w-7 text-rose-500" />
                                )}
                            </div>
                            <h2 className="text-xl font-black text-gray-900">
                                {statusModalOrg.pendingStatus === "ACTIVE" 
                                    ? "Activate Organization?" 
                                    : statusModalOrg.pendingStatus === "SUSPENDED" 
                                        ? "Suspend Organization?" 
                                        : "Close Organization?"}
                            </h2>
                            <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                {statusModalOrg.pendingStatus === "ACTIVE"
                                    ? `Are you sure you want to activate ${statusModalOrg.name}? This will restore access to their portal and recruitment drives.`
                                    : statusModalOrg.pendingStatus === "SUSPENDED"
                                        ? `Are you sure you want to suspend ${statusModalOrg.name}? They will temporarily lose access to their dashboard.`
                                        : `Closing ${statusModalOrg.name} will restrict access to their data. You can reopen it later if needed.`
                                }
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button 
                                className="flex-1 h-11 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-2xl transition-all"
                                onClick={() => setStatusModalOrg(null)} 
                                disabled={isUpdatingStatus}
                            >
                                Cancel
                            </button>
                            <button
                                className={`flex-1 h-11 font-bold text-white rounded-2xl transition-all shadow-lg active:scale-95 ${
                                    statusModalOrg.pendingStatus === "ACTIVE"
                                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-200"
                                        : statusModalOrg.pendingStatus === "SUSPENDED"
                                            ? "bg-gradient-to-r from-amber-500 to-amber-600 shadow-amber-200"
                                            : "bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-200"
                                }`}
                                disabled={isUpdatingStatus}
                                onClick={confirmStatusUpdate}
                            >
                                {isUpdatingStatus ? (
                                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                ) : (
                                    statusModalOrg.pendingStatus === "ACTIVE" ? "Yes, Activate" : statusModalOrg.pendingStatus === "SUSPENDED" ? "Yes, Suspend" : "Yes, Close"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {metricsOrg && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-gray-950/60 backdrop-blur-md px-4 py-6">
                    <div className="w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/95 shadow-2xl animate-in zoom-in-95 duration-300">
                        {/* Header */}
                        <div className="relative flex items-center justify-between px-10 py-8 border-b border-gray-100 overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12">
                                <Sparkles className="h-24 w-24" />
                            </div>
                            <div className="relative z-10 flex items-center gap-5">
                                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-200">
                                    <Layers className="h-7 w-7 text-white" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-600/60">Live Consumption</span>
                                    </div>
                                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                                        {metricsOrg.name} <span className="text-gray-400 font-medium">— AI Consumption</span>
                                    </h3>
                                </div>
                            </div>
                            <button
                                onClick={() => setMetricsOrg(null)}
                                className="relative z-10 group h-12 px-6 flex items-center gap-3 rounded-2xl bg-gray-50 text-gray-900 border border-gray-100 hover:bg-gray-900 hover:text-white transition-all shadow-sm hover:shadow-md"
                            >
                                <X className="h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
                                <span className="text-sm font-bold">Close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 space-y-12">
                            {/* ── LLM PROCESSING SECTION ────────────────── */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400 whitespace-nowrap">Core Processing Units</h4>
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-100 to-transparent" />
                                </div>
                                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                                    {metricSections.map((section) => {
                                        const feature = getBillingFeature(metricsOrg, section.key);
                                        const totalTokens = Number(feature.inputTokens || 0) + Number(feature.outputTokens || 0);
                                        const models = Object.keys(feature.byModel || {});
                                        const setupModel = getSetupModel(metricsOrg, 'LLM');

                                        return (
                                            <div key={section.key} className="group relative rounded-3xl border border-gray-100 bg-white p-6 hover:border-orange-200 hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300">
                                                <div className="flex flex-col gap-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-[#F97316]/60">{section.label.replace('LLM - ', '')}</div>
                                                        <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                                    </div>
                                                    
                                                    <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                                                        {models.length > 0 ? (
                                                            models.map(m => (
                                                                <div key={m} className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 uppercase tracking-tight">
                                                                    {cleanName(m)}
                                                                </div>
                                                            ))
                                                        ) : setupModel ? (
                                                            <div className="text-[9px] font-black text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200 uppercase tracking-tight">
                                                                {setupModel}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[9px] font-bold text-gray-300 italic">No Instance</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-5 mb-4">
                                                    <div className="text-3xl font-black text-gray-900 tracking-tight">${Number(feature.costUsd || 0).toFixed(2)}</div>
                                                </div>
                                                <div className="space-y-2 pt-4 border-t border-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                                    <div className="flex justify-between items-center">
                                                        <span>Requests</span>
                                                        <span className="text-gray-900">{Number(feature.runs || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span>Volume</span>
                                                        <span className="text-gray-900">{totalTokens.toLocaleString()} <span className="text-[8px] opacity-40">TKN</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── VOICE & SPEECH SECTION ────────────────── */}
                            <div className="grid gap-10 md:grid-cols-2">
                                {/* TTS Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400 whitespace-nowrap">Synthesis Hub</h4>
                                        <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-100 to-transparent" />
                                    </div>
                                    <div className="relative overflow-hidden rounded-[2.5rem] border border-blue-100 bg-blue-50/30 p-8 group hover:bg-blue-50/50 transition-all">
                                        <div className="relative z-10 flex items-center justify-between mb-8">
                                            <div className="space-y-2">
                                                <div className="text-4xl font-black text-blue-900 tracking-tighter">
                                                    ${metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).ttsCostUsd || 0), 0).toFixed(2)}
                                                </div>
                                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600/60">Voice Generation Cost</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-black text-blue-800">{metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).ttsCharacters || 0), 0).toLocaleString()}</div>
                                                <div className="text-[9px] font-black uppercase tracking-widest text-blue-400 opacity-60">Total Characters</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-6 border-t border-blue-100/50">
                                            {(() => {
                                                const allTtsModels = metricSections.flatMap(s => Object.keys(getBillingFeature(metricsOrg, s.key).ttsByModel || {}));
                                                const uniqueModels = Array.from(new Set(allTtsModels));
                                                const setupModel = getSetupModel(metricsOrg, 'TTS');

                                                if (uniqueModels.length > 0) {
                                                    return uniqueModels.map(m => (
                                                        <span key={m} className="px-3 py-1.5 bg-white text-blue-700 text-[10px] font-black rounded-xl border border-blue-100 uppercase tracking-widest shadow-sm">
                                                            {cleanName(m)}
                                                        </span>
                                                    ));
                                                }
                                                return <span className="text-[10px] font-bold text-blue-300 italic bg-white/50 px-4 py-1.5 rounded-xl border border-blue-100/50 border-dashed">{setupModel || "System Default"}</span>;
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* STT Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400 whitespace-nowrap">Recognition Hub</h4>
                                        <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-100 to-transparent" />
                                    </div>
                                    <div className="relative overflow-hidden rounded-[2.5rem] border border-orange-100 bg-orange-50/30 p-8 group hover:bg-orange-50/50 transition-all">
                                        <div className="relative z-10 flex items-center justify-between mb-8">
                                            <div className="space-y-2">
                                                <div className="text-4xl font-black text-orange-900 tracking-tighter">
                                                    ${metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).sttCostUsd || 0), 0).toFixed(2)}
                                                </div>
                                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600/60">Audio Processing Cost</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-black text-orange-800">{(metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).sttAudioSeconds || 0), 0) / 60).toFixed(1)}m</div>
                                                <div className="text-[9px] font-black uppercase tracking-widest text-orange-400 opacity-60">Total Minutes</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-6 border-t border-orange-100/50">
                                            {(() => {
                                                const allSttModels = metricSections.flatMap(s => Object.keys(getBillingFeature(metricsOrg, s.key).sttByModel || {}));
                                                const uniqueModels = Array.from(new Set(allSttModels));
                                                const setupModel = getSetupModel(metricsOrg, 'STT');

                                                if (uniqueModels.length > 0) {
                                                    return uniqueModels.map(m => (
                                                        <span key={m} className="px-3 py-1.5 bg-white text-orange-700 text-[10px] font-black rounded-xl border border-orange-100 uppercase tracking-widest shadow-sm">
                                                            {cleanName(m)}
                                                        </span>
                                                    ));
                                                }
                                                return <span className="text-[10px] font-bold text-orange-300 italic bg-white/50 px-4 py-1.5 rounded-xl border border-orange-100/50 border-dashed">{setupModel || "System Default"}</span>;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── OVERALL INTERVIEW SECTION ────────────────── */}
                            <div className="pt-2">
                                <div className="flex items-center gap-4 mb-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400 whitespace-nowrap">Pipeline Summary</h4>
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-100 to-transparent" />
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
                                        <div className="relative overflow-hidden rounded-[3rem] border-2 border-gray-900 bg-gray-950 p-10 text-white shadow-2xl group transition-all duration-500 hover:shadow-orange-500/10">
                                            <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:opacity-10 group-hover:rotate-12 transition-all duration-700">
                                                <Sparkles className="h-40 w-40" />
                                            </div>

                                            <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-12 mb-12">
                                                <div className="space-y-6">
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Total Pipeline Expenditure</span>
                                                        </div>
                                                        <div className="text-7xl font-black tracking-tighter text-white">${totalCost.toFixed(2)}</div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-3 pt-4">
                                                        <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl px-5 py-3 transition-colors hover:bg-white/10">
                                                            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">LLM Logic</div>
                                                            <div className="text-sm font-black text-emerald-400">${Number(feature.costUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                        <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl px-5 py-3 transition-colors hover:bg-white/10">
                                                            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Voice Synth</div>
                                                            <div className="text-sm font-black text-blue-400">${Number(feature.ttsCostUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                        <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl px-5 py-3 transition-colors hover:bg-white/10">
                                                            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Audio Trans</div>
                                                            <div className="text-sm font-black text-orange-400">${Number(feature.sttCostUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 text-right min-w-[300px]">
                                                    <div className="space-y-1">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">Drives</div>
                                                        <div className="text-3xl font-black tabular-nums text-white">{(metricsOrg as any).driveCount || 0}</div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">Sessions</div>
                                                        <div className="text-3xl font-black tabular-nums text-white">{Number(feature.runs || 0).toLocaleString()}</div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">Tokens</div>
                                                        <div className="text-3xl font-black tabular-nums text-white">{totalTokens.toLocaleString()}</div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">Duration</div>
                                                        <div className="text-3xl font-black tabular-nums text-white">
                                                            {Number(feature.sessionDuration || 0) > 0 
                                                                ? (Number(feature.sessionDuration || 0) / 60).toFixed(1)
                                                                : (Number(feature.sttAudioSeconds || 0) / 60).toFixed(1)}<span className="text-xs ml-1 opacity-40">M</span>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1 col-span-2 sm:col-span-1">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">Pipeline</div>
                                                        <div className="text-3xl font-black text-emerald-400 uppercase tracking-tighter">Healthy</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Tech Stack Overlay */}
                                            <div className="relative border-t border-white/10 pt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                                                <div>
                                                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">Logic Provider</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {llmModels.length > 0 ? llmModels.map(m => (
                                                            <span key={m} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-lg border border-emerald-400/20 uppercase tracking-widest">
                                                                {cleanName(m)}
                                                            </span>
                                                        )) : <span className="text-[10px] font-bold text-gray-600 italic">{setupLlm || "Standard"}</span>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">Synthesis Unit</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {ttsModels.length > 0 ? ttsModels.map(m => (
                                                            <span key={m} className="px-3 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-black rounded-lg border border-blue-400/20 uppercase tracking-widest">
                                                                {cleanName(m)}
                                                            </span>
                                                        )) : <span className="text-[10px] font-bold text-gray-600 italic">{setupTts || "Standard"}</span>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">Recognition Engine</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {sttModels.length > 0 ? sttModels.map(m => (
                                                            <span key={m} className="px-3 py-1 bg-orange-500/10 text-orange-400 text-[10px] font-black rounded-lg border border-orange-400/20 uppercase tracking-widest">
                                                                {cleanName(m)}
                                                            </span>
                                                        )) : <span className="text-[10px] font-bold text-gray-600 italic">{setupStt || "Standard"}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 px-10 py-6 bg-gray-50/50 flex items-center justify-between">
                            <div className="text-[11px] font-black uppercase tracking-widest text-gray-400">Total Organization Footprint</div>
                            <div className="text-xl font-black text-gray-900 tracking-tight">
                                ${getOrgTotalBillingCost(metricsOrg).toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
