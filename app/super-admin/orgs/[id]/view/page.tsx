"use client";
import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
    ArrowLeft, 
    Briefcase, 
    Users, 
    Loader2, 
    Building2, 
    UserCircle2,
    Search,
    Filter,
    MoreVertical,
    Download,
    Trash2,
    AlertCircle,
    Settings,
    ShieldCheck,
    Globe,
    User,
    Mail,
    Lock,
    RefreshCw,
    CheckCircle2,
    Sparkles,
    ChevronRight,
    ExternalLink
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ALL_VOICES } from "@/lib/constants/voices";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { Job } from "@/context/jobs-context";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-custom";
import { formatOrgPlan } from "@/lib/org-plans";
//  TypeScript Interfaces 
interface OrgDetail {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    industry: string | null;
    usageMetrics?: Record<string, unknown> | null;
    interviewQuotaTotal?: number;
    interviewQuotaUsed?: number;
    creditsUsed?: number;
    voiceId?: string;
    allowedVoices?: string[];
    sttModel?: string;
    ttsProvider?: string;
    ttsModel?: string;
    llmInterviewLive?: string;
    llmInterviewEval?: string;
    llmInterviewBrief?: string;
    llmInterviewReport?: string;
    llmResumeExtraction?: string;
    llmJdExtraction?: string;
    llmResumeReport?: string;
    users?: { name: string, email: string }[];
}
interface Candidate {
    id: string;
    name: string | null;
    email: string;
    role: string;
    score: number;
    status: string;
    interviewStatus: string | null;
    date: string;
}
type BillingFeatureMetrics = {
    runs?: number;
    inputTokens?: number;
    outputTokens?: number;
    sessionDuration?: number;
    costUsd?: number;
    ttsRuns?: number;
    ttsCharacters?: number;
    ttsCostUsd?: number;
    sttRuns?: number;
    sttAudioSeconds?: number;
    sttCostUsd?: number;
    byModel?: Record<string, unknown>;
    ttsByModel?: Record<string, unknown>;
    sttByModel?: Record<string, unknown>;
};
// Returns the org's configured model for a billing section key — from DB, not hardcoded.
function getConfiguredModel(org: OrgDetail | null, sectionKey: string): string | null {
    if (!org) return null;
    const map: Record<string, keyof OrgDetail> = {
        interview:        "llmInterviewLive",
        resumeExtraction: "llmResumeExtraction",
        jdExtraction:     "llmJdExtraction",
        resumeReport:     "llmResumeReport",
        interviewReport:  "llmInterviewReport",
    };
    const field = map[sectionKey];
    return field ? (org[field] as string | undefined) ?? null : null;
}
const cleanName = (n: string) => {
    const base = n.includes(':') ? n.split(':')[1] : n;
    const cleaned = base.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    return cleaned.trim();
};
const isUnknownLabel = (value: string) => {
    const normalized = cleanName(String(value || "")).toLowerCase();
    return !normalized || normalized === "unknown" || normalized === "no recorded model";
};
export default function UnifiedOrgViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const searchParams = useSearchParams();
    const tab = searchParams.get("tab");
    const [view, setView] = useState<"drives" | "candidates">("candidates");
    // Sync tab from URL to state
    useEffect(() => {
        if (tab === "drives" || tab === "candidates") {
            setView(tab as "drives" | "candidates");
        }
    }, [tab]);
    const [org, setOrg] = useState<OrgDetail | null>(null);
    const [drives, setDrives] = useState<Job[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [error, setError] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showMetrics, setShowMetrics] = useState(false);
    const [currency, setCurrency] = useState<"USD" | "INR">("USD");
    const [usdToInr, setUsdToInr] = useState<number>(84.5);
    const [rateLoading, setRateLoading] = useState(false);
    const [rateUpdatedAt, setRateUpdatedAt] = useState("");
    const fetchExchangeRate = async () => {
        setRateLoading(true);
        try {
            const res = await fetch("/api/super-admin/exchange-rate");
            if (res.ok) {
                const data = await res.json();
                setUsdToInr(Number(data.rate || 84.5));
                setRateUpdatedAt(String(data.updatedAt || ""));
            }
        } catch {
            // Keep existing rate
        } finally {
            setRateLoading(false);
        }
    };
    useEffect(() => {
        if (showMetrics && currency === "INR" && !rateUpdatedAt) {
            void fetchExchangeRate();
        }
    }, [showMetrics, currency, rateUpdatedAt]);
    const formatModelNames = (models?: Record<string, unknown>, fallback?: string | null) => {
        const names = Object.keys(models || {})
            .map((k) => k.split(":").slice(1).join(":") || k)
            .map((n) => cleanName(n))
            .filter((n) => Boolean(n) && !isUnknownLabel(n));
        if (names.length) return names.join(", ");
        const configured = (fallback || "").trim();
        return configured || "-";
    };
    const formatProviderNames = (models?: Record<string, unknown>) => {
        const providers = Object.values(models || {})
            .map((entry) => entry && typeof entry === "object" ? String((entry as Record<string, unknown>).provider || "") : "")
            .map((p) => String(p || "").trim())
            .filter((p) => Boolean(p) && p.toLowerCase() !== "unknown");
        return providers.length ? Array.from(new Set(providers)).join(", ") : "-";
    };
    const getConfiguredTtsVoices = () => {
        const ids = Array.isArray(org?.allowedVoices) && org.allowedVoices.length > 0
            ? org.allowedVoices
            : org?.voiceId ? [org.voiceId] : [];
        return ids
            .map((id) => ALL_VOICES.find((v) => v.id === id))
            .filter(Boolean) as typeof ALL_VOICES;
    };
    const fmt = (usd: number) => {
        if (currency === "INR") {
            return `₹${(usd * usdToInr).toFixed(0)}`;
        }
        return `$${usd.toFixed(2)}`;
    };
    // Pagination & Search state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCandidates, setTotalCandidates] = useState(0);
    const [limit] = useState(10);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    // 1. Initial load (Org + Drives)
    useEffect(() => {
        const loadBaseData = async () => {
            try {
                const [orgRes, drivesRes] = await Promise.all([
                    fetch(`/api/super-admin/orgs/${id}`),
                    fetch(`/api/drives?orgId=${id}`)
                ]);
                if (!orgRes.ok) {
                    setError("Failed to load organization data. Please try again.");
                    return;
                }
                const [orgData, drivesData] = await Promise.all([
                    orgRes.json(),
                    drivesRes.json()
                ]);
                setOrg(orgData);
                setDrives(drivesData.drives || []);
            } catch {
                setError("Network error. Could not connect to the server.");
            } finally {
                setLoading(false);
            }
        };
        loadBaseData();
    }, [id]);
    // 2. Fetch Candidates
    const fetchCandidates = async (p = page, q = search) => {
        setCandidatesLoading(true);
        try {
            const params = new URLSearchParams({
                orgId: id,
                page: String(p),
                limit: String(limit),
                ...(q ? { q } : {}),
            });
            const res = await fetch(`/api/candidates?${params}`);
            const data = await res.json();
            if (data.candidates) {
                setCandidates(data.candidates);
                setTotalCandidates(data.pagination.total);
                setTotalPages(data.pagination.totalPages);
            }
        } catch (error) {
            console.error("Error fetching candidates:", error);
        } finally {
            setCandidatesLoading(false);
        }
    };
    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchInput]);
    useEffect(() => {
        if (view === "candidates") {
            fetchCandidates(page, search);
        }
    }, [page, search, id, view]);
    if (loading) {
        return (
            <div className="min-h-screen bg-white">
                <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-8 py-10 lg:px-12">
                    <div className="space-y-6">
                         <div className="h-10 w-1 bg-gray-100 rounded-full" />
                         <Skeleton className="h-10 w-64" />
                    </div>
                </header>
                <main className="max-w-7xl mx-auto p-8 lg:p-12">
                    <Skeleton className="h-64 w-full rounded-[3rem]" />
                </main>
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-white">
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-8 py-10 lg:px-12">
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="space-y-4">
                            <button 
                                onClick={() => router.back()} 
                                className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                            >
                                <ArrowLeft className="h-3 w-3 group-hover:-translate-x-1 transition-transform" />
                                Back to Registry
                            </button>
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-1 bg-[#7C3AED] rounded-full" />
                                <div>
                                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Active Jobs</h1>
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2 italic">{org?.name}  {formatOrgPlan(org?.plan) || "Enterprise"} Panel</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 mt-8 md:mt-0">
                            <button
                                onClick={() => setShowMetrics(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm border border-gray-900 hover:bg-gray-800 transition-all"
                            >
                                <Sparkles className="h-4 w-4" /> View Metrics
                            </button>
                            {view === "candidates" && (
                                <button 
                                    onClick={() => setIsDeleteModalOpen(true)}
                                    className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm border border-red-100 hover:bg-red-100 transition-all disabled:opacity-50"
                                    disabled={totalCandidates === 0}
                                >
                                    <Trash2 className="h-4 w-4" /> Purge Candidates
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex bg-gray-50/50 p-1.5 rounded-[1.5rem] border border-gray-100 shadow-inner w-fit">
                        <button
                            onClick={() => setView("candidates")}
                            className={`flex items-center gap-3 px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                                view === "candidates" 
                                ? "bg-white text-gray-900 shadow-md shadow-gray-200/50" 
                                : "text-gray-400 hover:text-gray-600 hover:bg-white/50"
                            }`}
                        >
                            <Users className={`h-4 w-4 ${view === "candidates" ? "text-emerald-500" : "text-gray-300"}`} />
                            Candidates
                        </button>
                        <button
                            onClick={() => setView("drives")}
                            className={`flex items-center gap-3 px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                                view === "drives" 
                                ? "bg-white text-gray-900 shadow-md shadow-gray-200/50" 
                                : "text-gray-400 hover:text-gray-600 hover:bg-white/50"
                            }`}
                        >
                            <Briefcase className={`h-4 w-4 ${view === "drives" ? "text-[#7C3AED]" : "text-gray-300"}`} />
                            Active Jobs
                        </button>
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto p-8 lg:p-12 animate-fade-slide">
                {/* AI Models reminder banner */}
                <div className="mb-6 flex items-center gap-3 px-5 py-3 rounded-xl" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.07), rgba(59,130,246,0.04))", border: "1px solid rgba(139,92,246,0.18)" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))" }}>
                        <span className="text-violet-600 text-sm">🤖</span>
                    </div>
                    <p className="text-sm text-violet-700 font-medium">
                        To configure LLM models, STT, TTS, and allowed voices for this org — go to{" "}
                        <a href="/super-admin/models" className="font-bold underline underline-offset-2 hover:text-violet-900">
                            Super Admin → AI Models
                        </a>
                    </p>
                </div>
                {view === "drives" && (
                    <div className="space-y-6">
                         {drives.length === 0 ? (
                            <div className="py-32 text-center bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-200">
                                <Briefcase className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No active recruitment drives detected.</p>
                            </div>
                        ) : (
                            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                                {drives.map((drive) => (
                                    <div key={drive.id} className="relative group">
                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <h3 className="font-bold text-gray-900">{drive.title}</h3>
                                            <p className="text-sm text-gray-500">{(drive as any).location || 'Remote'}</p>
                                        </div>
                                        <div className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-white/90 backdrop-blur border rounded-full text-gray-900 shadow-sm opacity-60">
                                            {(drive as any).status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {view === "candidates" && (
                    <div className="space-y-8">
                        <div className="relative group max-w-lg mb-4">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by name, role, or email..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="w-full h-16 pl-16 pr-8 bg-gray-50/50 border border-gray-100 rounded-[1.5rem] text-sm font-black text-gray-900 placeholder:text-gray-300 outline-none focus:bg-white focus:ring-4 focus:ring-gray-900/5 transition-all"
                            />
                        </div>
                        <div className="bg-white border border-gray-100 rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.015)] overflow-hidden">
                            <div className="grid grid-cols-[3fr_2fr_1fr_1fr_1.5fr_1.5fr_auto] gap-4 px-12 py-8 border-b border-gray-50 text-[10px] font-black text-gray-300 uppercase tracking-widest bg-gray-50/5">
                                <span>CANDIDATE</span>
                                <span>APPLIED FOR</span>
                                <span className="text-center">AI SCORE</span>
                                <span className="text-center">STATUS</span>
                                <span className="text-center">INTERVIEW</span>
                                <span className="text-right">APPLIED DATE</span>
                                <span className="text-right">ACTIONS</span>
                            </div>
                            <div className="divide-y divide-gray-50/50">
                                {candidates.map((can) => (
                                    <div key={can.id} className="grid grid-cols-[3fr_2fr_1fr_1fr_1.5fr_1.5fr_auto] gap-4 px-12 py-10 items-center hover:bg-gray-50/50 transition-all group">
                                        <div className="flex items-center gap-6">
                                            <div className="h-14 w-14 rounded-full bg-gray-900 text-white flex flex-shrink-0 items-center justify-center font-black text-lg shadow-lg">
                                                {can.name ? can.name[0].toUpperCase() : 'C'}
                                            </div>
                                            <div className="flex flex-col truncate uppercase italic">
                                                <p className="text-gray-900 font-black text-base truncate">{can.name || "N/A"}</p>
                                                <p className="text-gray-400 text-[10px] font-black truncate lowercase tracking-widest opacity-60">{can.email}</p>
                                            </div>
                                        </div>
                                        <div className="truncate uppercase">
                                            <p className="text-gray-900 font-black text-xs leading-none">{can.role}</p>
                                            <p className="text-[9px] font-black text-gray-300 tracking-widest mt-1.5 opacity-60">Remote</p>
                                        </div>
                                        <div className="text-center text-lg font-black text-[#7C3AED] bg-violet-50 h-12 w-12 flex items-center justify-center rounded-2xl mx-auto shadow-sm">
                                            {can.score}
                                        </div>
                                        <div className="text-center">
                                            <span className="px-4 py-2 bg-gray-900 text-white text-[9px] font-black rounded-full uppercase tracking-widest italic">{can.status}</span>
                                        </div>
                                        <div className="text-center text-gray-300 font-black text-[10px] uppercase tracking-widest italic opacity-40">
                                            {can.interviewStatus || "Pending"}
                                        </div>
                                        <p className="text-right text-gray-400 font-bold text-[11px] tabular-nums">{can.date}</p>
                                        <div className="flex items-center justify-end">
                                            <MoreVertical className="h-5 w-5 text-gray-200 cursor-pointer hover:text-gray-900 transition-colors" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Pagination */}
                        <div className="flex items-center justify-between px-12 py-8 mt-4">
                             <p className="text-gray-300 text-[10px] font-black uppercase tracking-[0.2em] italic">SHOWING {candidates.length} CANDIDATES  PAGE {page} OF {totalPages || 1}</p>
                             <div className="flex items-center gap-4">
                                <Button 
                                    variant="outline" 
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="h-11 px-8 rounded-xl border-gray-100 font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md transition-all"
                                >PREVIOUS</Button>
                                <Button 
                                    variant="outline" 
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="h-11 px-8 rounded-xl border-gray-100 font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md transition-all"
                                >NEXT</Button>
                             </div>
                        </div>
                    </div>
                )}
            </main>
            <ActionConfirmModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={async () => {
                    setIsDeleting(true);
                    try {
                        const res = await fetch(`/api/candidates?orgId=${id}`, { method: "DELETE" });
                        if (res.ok) {
                            setCandidates([]);
                            setIsDeleteModalOpen(false);
                            toast.success("Candidates purged successfully");
                        }
                    } catch {
                        toast.error("Failed to purge candidates");
                    } finally {
                        setIsDeleting(false);
                    }
                }}
                title="Purge Candidates"
                description={`Are you sure you want to delete all candidates for ${org?.name}? This action is irreversible.`}
                confirmText="Terminate Records"
                isLoading={isDeleting}
            />
            {showMetrics && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
                            <div>
                                <div className="text-[11px] font-[800] uppercase tracking-[0.15em] text-gray-500">Active Jobs</div>
                                <h3 className="text-xl font-black text-gray-900">AI usage overview</h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center bg-gray-100 rounded-[10px] p-1 gap-1">
                                    {(["USD", "INR"] as const).map((c) => (
                                        <button
                                            key={c}
                                            onClick={() => {
                                                setCurrency(c);
                                                if (c === "INR" && !rateLoading) {
                                                    void fetchExchangeRate();
                                                }
                                            }}
                                            className={`px-3 py-1.5 rounded-[8px] text-[11px] font-[700] uppercase tracking-wide transition-all ${
                                                currency === c
                                                    ? "bg-white text-gray-900 shadow-sm"
                                                    : "text-gray-500 hover:text-gray-700"
                                            }`}
                                        >
                                            {c === "INR" ? "₹ INR" : "$ USD"}
                                        </button>
                                    ))}
                                </div>
                                {currency === "INR" && (
                                    <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                                        {rateLoading ? "Fetching…" : `1 USD = ₹${usdToInr.toFixed(2)}`}
                                        {rateUpdatedAt && !rateLoading && <span className="ml-1 opacity-60">({rateUpdatedAt})</span>}
                                    </span>
                                )}
                                <button
                                    onClick={() => setShowMetrics(false)}
                                    className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                        {/* SECTION 1: LLM Models Table */}
                        <div className="p-6 space-y-6">
                            <div>
                                <h4 className="text-[12px] font-black uppercase tracking-[0.15em] text-gray-500 mb-4">LLM Models & Pricing</h4>
                                <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Model</th>
                                                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Provider</th>
                                                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Runs</th>
                                                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Tokens</th>
                                                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {[
                                                { label: "Resume Extraction", key: "resumeExtraction" },
                                                { label: "JD Extraction", key: "jdExtraction" },
                                                { label: "Interview Report", key: "interviewReport" },
                                                { label: "Resume Report", key: "resumeReport" },
                                                { label: "Interview Evaluation", key: "interview" },
                                                { label: "Interview LLM Generation", key: "interview" },
                                                { label: "Interview Brief", key: "interview" },
                                            ].map((row) => {
                                                const usage = (org?.usageMetrics ?? {}) as Record<string, unknown>;
                                                const billingAll = (usage.billing ?? {}) as Record<string, BillingFeatureMetrics>;
                                                const billing = (billingAll[row.key] ?? {}) as BillingFeatureMetrics;
                                                const llmCost = Number(billing?.costUsd || 0);
                                                const totalTokens = Number(billing?.inputTokens || 0) + Number(billing?.outputTokens || 0);
                                                const configuredModel = getConfiguredModel(org, row.key);
                                                const modelName = configuredModel || formatModelNames(billing?.byModel, null) || "-";
                                                return (
                                                    <tr key={row.label} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-6 py-4 text-sm font-bold text-gray-900">{row.label}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">{modelName}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">{billing?.runs || 0}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">{totalTokens.toLocaleString()}</td>
                                                        <td className="px-6 py-4 text-sm font-black text-right text-gray-900">{fmt(llmCost)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* SECTION 2: Overall Interview Card */}
                            <div>
                                <h4 className="text-[12px] font-black uppercase tracking-[0.15em] text-gray-500 mb-4">Interview Overall Cost</h4>
                                <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-violet-50/30 to-blue-50/30 p-6 shadow-sm">
                                    <div className="mt-6 border-t border-gray-200/50 pt-6 text-center">
                                        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500">Brief + Evaluation + LLM Generation</div>
                                        <div className="mt-2 text-4xl font-black text-violet-600">
                                            {fmt(
                                                (() => {
                                                    const usage = (org?.usageMetrics ?? {}) as Record<string, unknown>;
                                                    const billingAll = (usage.billing ?? {}) as Record<string, BillingFeatureMetrics>;
                                                    const interview = (billingAll["interview"] ?? {}) as BillingFeatureMetrics;
                                                    return Number(interview?.costUsd || 0);
                                                })()
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 3: TTS Hub */}
                            <div>
                                <h4 className="text-[12px] font-black uppercase tracking-[0.15em] text-gray-500 mb-4">TTS Hub - Characters & Pricing</h4>
                                <div className="grid gap-4 md:grid-cols-3">
                                    {[
                                        { label: "ElevenLabs", provider: "ELEVENLABS" },
                                        { label: "Cartesia", provider: "CARTESIA" },
                                        { label: "Sarvam", provider: "SARVAM" },
                                    ].map((tts) => {
                                        const usage = (org?.usageMetrics ?? {}) as Record<string, unknown>;
                                        const billingAll = (usage.billing ?? {}) as Record<string, BillingFeatureMetrics>;
                                        const interviewBilling = (billingAll["interview"] ?? {}) as BillingFeatureMetrics;
                                        const ttsChars = Number(interviewBilling?.ttsCharacters || 0);
                                        const ttsCost = Number(interviewBilling?.ttsCostUsd || 0);
                                        return (
                                            <div key={tts.provider} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                                <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500">{tts.label}</div>
                                                <div className="mt-4 space-y-3">
                                                    <div>
                                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Characters</div>
                                                        <div className="mt-1 text-xl font-black text-gray-900">{ttsChars.toLocaleString()}</div>
                                                    </div>
                                                    <div className="border-t border-gray-100 pt-3">
                                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Price</div>
                                                        <div className="mt-1 text-xl font-black text-gray-900">{fmt(ttsCost)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SECTION 4: STT Hub (Deepgram) */}
                            <div>
                                <h4 className="text-[12px] font-black uppercase tracking-[0.15em] text-gray-500 mb-4">STT Hub - Deepgram</h4>
                                <div className="grid gap-4 md:grid-cols-2">
                                    {(() => {
                                        const usage = (org?.usageMetrics ?? {}) as Record<string, unknown>;
                                        const billingAll = (usage.billing ?? {}) as Record<string, BillingFeatureMetrics>;
                                        const interviewBilling = (billingAll["interview"] ?? {}) as BillingFeatureMetrics;
                                        const sttMinutes = (Number(interviewBilling?.sttAudioSeconds || 0) / 60).toFixed(1);
                                        const sttCost = Number(interviewBilling?.sttCostUsd || 0);
                                        return (
                                            <>
                                                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500">Audio Duration</div>
                                                    <div className="mt-4 text-2xl font-black text-gray-900">{sttMinutes} <span className="text-sm text-gray-500">min</span></div>
                                                </div>
                                                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500">Cost</div>
                                                    <div className="mt-4 text-2xl font-black text-gray-900">{fmt(sttCost)}</div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                        <div className="border-t border-gray-100 px-6 py-4">
                            <div className="text-sm font-bold text-gray-700">
                                Total AI Cost (LLM + TTS + STT):{" "}
                                <span className="text-gray-900">
                                    {fmt([
                                        "interview",
                                        "resumeExtraction",
                                        "jdExtraction",
                                        "resumeReport",
                                        "interviewReport",
                                    ].reduce((sum, key) => {
                                        const usage = (org?.usageMetrics ?? {}) as Record<string, unknown>;
                                        const billingAll = (usage.billing ?? {}) as Record<string, BillingFeatureMetrics>;
                                        const row = billingAll[key] ?? {};
                                        return (
                                            sum
                                            + Number(row.costUsd || 0)
                                            + Number(row.ttsCostUsd || 0)
                                            + Number(row.sttCostUsd || 0)
                                        );
                                    }, 0))}
                                </span>
                            </div>
                        </div>
                        <div className="grid gap-4 border-t border-gray-100 bg-gray-50/50 px-6 py-5 md:grid-cols-3">
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Interview quota used</div>
                                <div className="mt-2 text-3xl font-black text-gray-900">{Number(org?.interviewQuotaUsed || 0).toLocaleString()}</div>
                                <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    1 interview is deducted after each completed session.
                                </div>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Credits used</div>
                                <div className="mt-2 text-3xl font-black text-gray-900">{Number(org?.creditsUsed || 0).toFixed(2)}</div>
                                <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    1 minute = 1 credit.
                                </div>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Interview quota remaining</div>
                                <div className="mt-2 text-3xl font-black text-gray-900">
                                    {Math.max(0, Number(org?.interviewQuotaTotal || 0) - Number(org?.interviewQuotaUsed || 0)).toLocaleString()}
                                </div>
                                <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Current org balance.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
