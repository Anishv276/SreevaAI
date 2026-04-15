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
    MoreHorizontal,
    X,
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

type BillingFeatureKey = "interview" | "resumeExtraction" | "jdExtraction" | "chatbot" | "general";

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

    const metricSections: { key: BillingFeatureKey; label: string }[] = [
        { key: "resumeExtraction", label: "LLM - Resume" },
        { key: "chatbot", label: "LLM - Chatbot" },
        { key: "interview", label: "LLM - Interview" },
        { key: "jdExtraction", label: "LLM - JD" },
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
        const previousOrg = orgs.find(o => o.id === orgId);
        if (!previousOrg || previousOrg.status === newStatus) return;

        // OPTIMISTIC UPDATE: Change UI instantly
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: newStatus } : o));
        setSyncingOrgs(prev => new Set(prev).add(orgId));

        try {
            const res = await fetch(`/api/super-admin/orgs/${orgId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!res.ok) {
                throw new Error("Failed to update status");
            }
            toast.success(`${previousOrg.name} status updated to ${newStatus.toLowerCase()}`);
        } catch (error) {
            // ROLLBACK: Revert to previous state on failure
            setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: previousOrg.status } : o));
            toast.error("Cloud sync failed. Reverting status.");
        } finally {
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
                                                        {syncingOrgs.has(org.id) ? (
                                                            <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-400" />
                                                        ) : (
                                                            <div className={`h-1.5 w-1.5 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,0,0,0.1)] ${(org.status || "ACTIVE") === "ACTIVE"
                                                                ? 'bg-emerald-500 shadow-emerald-200 animate-pulse'
                                                                : (org.status || "ACTIVE") === "SUSPENDED"
                                                                    ? 'bg-amber-500 shadow-amber-200'
                                                                    : 'bg-rose-500 shadow-rose-200'
                                                                }`} />
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
                                                className={`h-9 w-9 flex items-center justify-center rounded-lg transition-all active:scale-90 ${activeMenu === org.id
                                                    ? 'bg-gray-900 text-white shadow-lg'
                                                    : 'bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 border border-transparent hover:border-gray-200 shadow-sm'}`}
                                                title="More Actions"
                                            >
                                                <MoreHorizontal className="h-4 w-4" />
                                            </button>

                                            {activeMenu === org.id && (
                                                <div className="absolute right-0 top-11 w-64 bg-white border border-gray-100 rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.15)] p-2 z-[250] animate-in-up duration-200">
                                                    {/* View Section */}
                                                    <div className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 border-b border-gray-50 mb-1">
                                                        Navigation
                                                    </div>
                                                    <Link
                                                        href={`/super-admin/orgs/${org.id}/view?tab=drives`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-blue-50/50 text-gray-900 transition-colors group/item"
                                                    >
                                                        <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover/item:bg-blue-100 transition-colors">
                                                            <Briefcase className="h-4 w-4 text-blue-600" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-900">View Drives</span>
                                                            <span className="text-[8px] font-bold text-gray-400">Recruitment pipelines</span>
                                                        </div>
                                                    </Link>
                                                    <Link
                                                        href={`/super-admin/orgs/${org.id}/view?tab=candidates`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-indigo-50/50 text-gray-900 transition-colors group/item"
                                                    >
                                                        <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center group-hover/item:bg-indigo-100 transition-colors">
                                                            <Users className="h-4 w-4 text-indigo-600" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-900">View Candidates</span>
                                                            <span className="text-[8px] font-bold text-gray-400">Manage all profiles</span>
                                                        </div>
                                                    </Link>

                                                    <div className="h-px bg-gray-50 my-1 mx-2" />

                                                    {/* Edit Link */}
                                                    <Link
                                                        href={`/super-admin/orgs/${org.id}`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-orange-50/50 text-gray-900 transition-colors group/item"
                                                    >
                                                        <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center group-hover/item:bg-orange-100 transition-colors">
                                                            <Edit2 className="h-4 w-4 text-[#F97316]" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-900">Edit Settings</span>
                                                            <span className="text-[8px] font-bold text-gray-400">Configure parameters</span>
                                                        </div>
                                                    </Link>

                                                    {/* Delete Action */}
                                                    <button
                                                        onClick={() => {
                                                            setActiveMenu(null);
                                                            setOrgToDelete(org);
                                                            setIsDeleteModalOpen(true);
                                                        }}
                                                        className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-red-50 text-red-600 transition-colors group/item"
                                                    >
                                                        <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center group-hover/item:bg-red-100 transition-colors">
                                                            <Trash2 className="h-4 w-4 text-red-600" />
                                                        </div>
                                                        <div className="flex flex-col items-start">
                                                            <span className="text-[10px] font-black uppercase tracking-widest">Terminate Portal</span>
                                                            <span className="text-[8px] font-bold text-red-400/70">Permanent destruction</span>
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

            {metricsOrg && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Metrics</div>
                                <h3 className="text-xl font-black text-gray-900">{metricsOrg.name} - AI Usage</h3>
                            </div>
                            <button
                                onClick={() => setMetricsOrg(null)}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100"
                            >
                                <X className="h-4 w-4" />
                                Close
                            </button>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-8">
                            {/* ── LLM PROCESSING SECTION ────────────────── */}
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">LLM Processing Engines</h4>
                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                    {metricSections.filter(s => s.key !== 'interview').map((section) => {
                                        const feature = getBillingFeature(metricsOrg, section.key);
                                        const totalTokens = Number(feature.inputTokens || 0) + Number(feature.outputTokens || 0);
                                        const models = Object.keys(feature.byModel || {});
                                        const setupModel = getSetupModel(metricsOrg, 'LLM');

                                        return (
                                            <div key={section.key} className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 hover:bg-white hover:shadow-md transition-all">
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-[9px] font-bold uppercase tracking-widest text-[#F97316]">{section.label.replace('LLM - ', '')}</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {models.length > 0 ? (
                                                            models.map(m => (
                                                                <div key={m} className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-tighter">
                                                                    {cleanName(m)}
                                                                </div>
                                                            ))
                                                        ) : setupModel ? (
                                                            <div className="text-[8px] font-bold text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-100 uppercase tracking-tighter">
                                                                {setupModel} (Setup)
                                                            </div>
                                                        ) : (
                                                            <div className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter italic">Not Configured</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-2 text-xl font-black text-gray-900">${Number(feature.costUsd || 0).toFixed(2)}</div>
                                                <div className="mt-2 space-y-1 text-[11px] text-gray-500">
                                                    <div className="flex justify-between">
                                                        <span>Runs</span>
                                                        <span className="font-bold text-gray-900">{Number(feature.runs || 0)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Tokens</span>
                                                        <span className="font-bold text-gray-900">{totalTokens.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── VOICE & SPEECH SECTION ────────────────── */}
                            <div className="grid gap-6 md:grid-cols-2">
                                {/* TTS Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 whitespace-nowrap">TTS - Text to Speech</h4>
                                        <div className="h-[1px] flex-1 bg-gray-100" />
                                    </div>
                                    <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="space-y-1">
                                                <div className="text-[28px] font-black text-blue-900 tracking-tighter">
                                                    ${metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).ttsCostUsd || 0), 0).toFixed(2)}
                                                </div>
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Total TTS Generation</div>
                                            </div>
                                            <div className="text-right text-blue-800">
                                                <div className="text-lg font-black">{metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).ttsCharacters || 0), 0).toLocaleString()}</div>
                                                <div className="text-[9px] font-bold uppercase opacity-60">Total Characters</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 border-t border-blue-100/50 pt-3">
                                            {(() => {
                                                const allTtsModels = metricSections.flatMap(s => Object.keys(getBillingFeature(metricsOrg, s.key).ttsByModel || {}));
                                                const uniqueModels = Array.from(new Set(allTtsModels));
                                                const setupModel = getSetupModel(metricsOrg, 'TTS');

                                                if (uniqueModels.length > 0) {
                                                    return uniqueModels.map(m => (
                                                        <span key={m} className="px-2 py-0.5 bg-white text-blue-700 text-[9px] font-bold rounded border border-blue-100 uppercase tracking-tight">
                                                            {cleanName(m)}
                                                        </span>
                                                    ));
                                                }
                                                if (setupModel) {
                                                    return (
                                                        <span className="px-2 py-0.5 bg-white text-blue-500 text-[9px] font-bold rounded border border-blue-100 border-dashed uppercase tracking-tight">
                                                            {setupModel} (Setup)
                                                        </span>
                                                    );
                                                }
                                                return <span className="text-[9px] text-blue-400 italic">No TTS Models Recorded</span>;
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* STT Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 whitespace-nowrap">STT - Speech to Text</h4>
                                        <div className="h-[1px] flex-1 bg-gray-100" />
                                    </div>
                                    <div className="rounded-2xl border border-orange-100 bg-orange-50/30 p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="space-y-1">
                                                <div className="text-[28px] font-black text-orange-900 tracking-tighter">
                                                    ${metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).sttCostUsd || 0), 0).toFixed(2)}
                                                </div>
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-orange-600">Total STT Processing</div>
                                            </div>
                                            <div className="text-right text-orange-800">
                                                <div className="text-lg font-black">{(metricSections.reduce((sum, s) => sum + Number(getBillingFeature(metricsOrg, s.key).sttAudioSeconds || 0), 0) / 60).toFixed(1)}m</div>
                                                <div className="text-[9px] font-bold uppercase opacity-60">Total Minutes</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 border-t border-orange-100/50 pt-3">
                                            {(() => {
                                                const allSttModels = metricSections.flatMap(s => Object.keys(getBillingFeature(metricsOrg, s.key).sttByModel || {}));
                                                const uniqueModels = Array.from(new Set(allSttModels));
                                                const setupModel = getSetupModel(metricsOrg, 'STT');

                                                if (uniqueModels.length > 0) {
                                                    return uniqueModels.map(m => (
                                                        <span key={m} className="px-2 py-0.5 bg-white text-orange-700 text-[9px] font-bold rounded border border-orange-100 uppercase tracking-tight">
                                                            {cleanName(m)}
                                                        </span>
                                                    ));
                                                }
                                                if (setupModel) {
                                                    return (
                                                        <span className="px-2 py-0.5 bg-white text-orange-500 text-[9px] font-bold rounded border border-orange-100 border-dashed uppercase tracking-tight">
                                                            {setupModel} (Setup)
                                                        </span>
                                                    );
                                                }
                                                return <span className="text-[9px] text-orange-400 italic">No STT Models Recorded</span>;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── OVERALL INTERVIEW SECTION ────────────────── */}
                            <div className="pt-2">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 whitespace-nowrap">AI Interview - Overall Pipeline</h4>
                                    <div className="h-[1px] flex-1 bg-gray-100" />
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
                                        <div className="relative overflow-hidden rounded-2xl border-2 border-gray-900 bg-gray-950 p-8 text-white shadow-2xl group">
                                            <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <Sparkles className="h-32 w-32" />
                                            </div>

                                            <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-8 mb-8">
                                                <div className="space-y-4">
                                                    <div className="space-y-1">
                                                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Pipeline Total Cost</div>
                                                        <div className="text-6xl font-black tracking-tighter text-white">${totalCost.toFixed(2)}</div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-4 pt-2">
                                                        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2">
                                                            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500">LLM Analysis</div>
                                                            <div className="text-sm font-black text-emerald-400">${Number(feature.costUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2">
                                                            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Voice Synthesis</div>
                                                            <div className="text-sm font-black text-blue-400">${Number(feature.ttsCostUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2">
                                                            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Speech Audio</div>
                                                            <div className="text-sm font-black text-[#F97316]">${Number(feature.sttCostUsd || 0).toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-8 text-right min-w-[240px]">
                                                    <div>
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Total Sessions</div>
                                                        <div className="text-2xl font-black tabular-nums">{Number(feature.runs || 0)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Total Tokens</div>
                                                        <div className="text-2xl font-black tabular-nums">{totalTokens.toLocaleString()}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Total Minutes</div>
                                                        <div className="text-2xl font-black tabular-nums">{(Number(feature.sessionDuration || 0) / 60).toFixed(1)}m</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Status</div>
                                                        <div className="text-2xl font-black text-emerald-400 uppercase tracking-tighter">Healthy</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Tech Stack Overlay */}
                                            <div className="relative border-t border-white/10 pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div>
                                                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Core LLM Intelligence</div>
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap gap-1.5 ">
                                                            {llmModels.length > 0 ? llmModels.map(m => (
                                                                <span key={m} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold rounded border border-emerald-400/20 uppercase">
                                                                    {cleanName(m)}
                                                                </span>
                                                            )) : setupLlm ? (
                                                                <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-[9px] font-bold rounded border border-white/10 uppercase italic">
                                                                    {setupLlm} (Setup)
                                                                </span>
                                                            ) : <span className="text-[9px] text-gray-600 italic">No Setup</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Voice Generation</div>
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {ttsModels.length > 0 ? ttsModels.map(m => (
                                                                <span key={m} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-bold rounded border border-blue-400/20 uppercase">
                                                                    {cleanName(m)}
                                                                </span>
                                                            )) : setupTts ? (
                                                                <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-[9px] font-bold rounded border border-white/10 uppercase italic">
                                                                    {setupTts} (Setup)
                                                                </span>
                                                            ) : <span className="text-[9px] text-gray-600 italic">No Setup</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Speech Recognition</div>
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {sttModels.length > 0 ? sttModels.map(m => (
                                                                <span key={m} className="px-2 py-0.5 bg-orange-500/10 text-orange-400 text-[9px] font-bold rounded border border-orange-400/20 uppercase">
                                                                    {cleanName(m)}
                                                                </span>
                                                            )) : setupStt ? (
                                                                <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-[9px] font-bold rounded border border-white/10 uppercase italic">
                                                                    {setupStt} (Setup)
                                                                </span>
                                                            ) : <span className="text-[9px] text-gray-600 italic">No Setup</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 px-6 py-4">
                            <div className="text-sm font-bold text-gray-700">
                                Total AI Exposure (LLM + TTS + STT): <span className="text-gray-900">${getOrgTotalBillingCost(metricsOrg).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
