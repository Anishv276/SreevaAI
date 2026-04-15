
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
import { JobCard } from "@/components/careers/job-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { Job } from "@/context/jobs-context";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-custom";

// ── TypeScript Interfaces ─────────────────────────────────────
interface OrgDetail {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    industry: string | null;
    usageMetrics?: Record<string, unknown> | null;
    ttsProvider?: string;
    cartesiaVoiceId?: string;
    cartesiaModel?: string;
    sarvamModel?: string;
    sarvamVoice?: string;
    sttProvider?: string;
    deepgramModel?: string;
    sarvamSttModel?: string;
    llmProvider?: string;
    llmModel?: string;
    llmTemperature?: number;
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

const PLANS = [
    { id: "STARTER", label: "Starter", desc: "For small teams", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
    { id: "PRO", label: "Professional", desc: "Best for scaling", color: "text-[#F97316]", bg: "bg-orange-50", border: "border-orange-100" },
    { id: "ENTERPRISE", label: "Enterprise", desc: "Maximum power", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" }
];

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

    const formatModelNames = (models?: Record<string, unknown>, fallback?: string | null) => {
        const names = Object.keys(models || {})
            .map((k) => k.split(":").slice(1).join(":") || k)
            .filter(Boolean);
        if (names.length) return names.join(", ");
        const configured = (fallback || "").trim();
        return configured || "-";
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
                    <div className="max-w-7xl mx-auto space-y-12">
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
                <div className="max-w-7xl mx-auto space-y-10">
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
                                <div className="h-10 w-1 bg-[#F97316] rounded-full" />
                                <div>
                                    <h1 className="text-4xl font-black text-gray-900 tracking-tighter leading-none uppercase italic">
                                        {view === "drives" ? "Drives" : "Candidates"}
                                    </h1>
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2 italic">{org?.name} · Enterprise Panel</p>
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
                            <button className="flex items-center gap-2 px-6 py-3 bg-gray-50 text-gray-900 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm border border-gray-100 hover:bg-gray-100 transition-all">
                                <Download className="h-4 w-4" /> Export Report
                            </button>
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
                            <Briefcase className={`h-4 w-4 ${view === "drives" ? "text-[#F97316]" : "text-gray-300"}`} />
                            Drives
                        </button>

                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-8 lg:p-12 animate-fade-slide">
                {view === "drives" && (
                    <div className="space-y-12">
                         {drives.length === 0 ? (
                            <div className="py-32 text-center bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-200">
                                <Briefcase className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No active recruitment drives detected.</p>
                            </div>
                        ) : (
                            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                                {drives.map((drive) => <JobCard key={drive.id} job={drive} />)}
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
                                        <div className="text-center text-lg font-black text-[#F97316] bg-orange-50 h-12 w-12 flex items-center justify-center rounded-2xl mx-auto shadow-sm">
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
                             <p className="text-gray-300 text-[10px] font-black uppercase tracking-[0.2em] italic">SHOWING {candidates.length} CANDIDATES · PAGE {page} OF {totalPages || 1}</p>
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
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Metrics</div>
                                <h3 className="text-xl font-black text-gray-900">AI usage overview</h3>
                            </div>
                            <button
                                onClick={() => setShowMetrics(false)}
                                className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100"
                            >
                                Close
                            </button>
                        </div>

                        <div className="grid gap-4 p-6 md:grid-cols-2">
                            {[
                                { label: "Interview LLM", key: "interview" },
                                { label: "Resume Extraction", key: "resumeExtraction" },
                                { label: "JD Extraction", key: "jdExtraction" },
                                { label: "Chatbot", key: "chatbot" },
                                { label: "General", key: "general" },
                            ].map((section) => {
                                const usage = (org?.usageMetrics ?? {}) as Record<string, unknown>;
                                const billingAll = (usage.billing ?? {}) as Record<string, BillingFeatureMetrics>;
                                const billing = (billingAll[section.key] ?? {}) as BillingFeatureMetrics;
                                const totalTokens = Number(billing?.inputTokens || 0) + Number(billing?.outputTokens || 0);
                                const interviewMinutes = section.key === "interview"
                                    ? (Number(billing?.sessionDuration || 0) / 60).toFixed(1)
                                    : null;
                                const interviewTtsCost = section.key === "interview"
                                    ? Number(billing?.ttsCostUsd || 0).toFixed(2)
                                    : null;
                                const interviewTtsChars = section.key === "interview"
                                    ? Number(billing?.ttsCharacters || 0).toLocaleString()
                                    : null;
                                const interviewSttCost = section.key === "interview"
                                    ? Number(billing?.sttCostUsd || 0).toFixed(2)
                                    : null;
                                const interviewSttMinutes = section.key === "interview"
                                    ? (Number(billing?.sttAudioSeconds || 0) / 60).toFixed(1)
                                    : null;
                                const llmModels = formatModelNames(billing?.byModel, org?.llmModel || "");
                                const ttsModels = section.key === "interview"
                                    ? formatModelNames(
                                        billing?.ttsByModel,
                                        (org?.ttsProvider || "").toUpperCase() === "SARVAM"
                                            ? (org?.sarvamModel || "bulbul:v3")
                                            : (org?.cartesiaModel || "sonic-english"),
                                    )
                                    : null;
                                const sttModels = section.key === "interview"
                                    ? formatModelNames(
                                        billing?.sttByModel,
                                        (org?.sttProvider || "").toUpperCase() === "SARVAM"
                                            ? (org?.sarvamSttModel || "saaras:v3")
                                            : (org?.deepgramModel || "nova-3-general"),
                                    )
                                    : null;
                                return (
                                    <div key={section.key} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-5 shadow-sm">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{section.label}</div>
                                        <div className="mt-2 text-3xl font-black text-gray-900">${Number(billing?.costUsd || 0).toFixed(2)}</div>
                                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                            <div className="rounded-xl border border-gray-100 bg-white p-3">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Runs</div>
                                                <div className="text-lg font-black text-gray-900">{billing?.runs || 0}</div>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 bg-white p-3">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tokens</div>
                                                <div className="text-lg font-black text-gray-900">{totalTokens.toLocaleString()}</div>
                                            </div>
                                        </div>
                                        {interviewMinutes !== null && (
                                            <div className="mt-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                Interview time: <span className="text-gray-900">{interviewMinutes} min</span>
                                            </div>
                                        )}
                                        <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            LLM model: <span className="text-gray-900">{llmModels}</span>
                                        </div>
                                        {interviewTtsCost !== null && (
                                            <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                TTS cost: <span className="text-gray-900">${interviewTtsCost}</span>
                                            </div>
                                        )}
                                        {interviewTtsChars !== null && (
                                            <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                TTS chars: <span className="text-gray-900">{interviewTtsChars}</span>
                                            </div>
                                        )}
                                        {ttsModels !== null && (
                                            <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                TTS model: <span className="text-gray-900">{ttsModels}</span>
                                            </div>
                                        )}
                                        {interviewSttCost !== null && (
                                            <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                STT cost: <span className="text-gray-900">${interviewSttCost}</span>
                                            </div>
                                        )}
                                        {interviewSttMinutes !== null && (
                                            <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                STT audio: <span className="text-gray-900">{interviewSttMinutes} min</span>
                                            </div>
                                        )}
                                        {sttModels !== null && (
                                            <div className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                STT model: <span className="text-gray-900">{sttModels}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="border-t border-gray-100 px-6 py-4">
                            <div className="text-sm font-bold text-gray-700">
                                Total AI Cost (LLM + TTS + STT):{" "}
                                <span className="text-gray-900">
                                    ${[
                                        "interview",
                                        "resumeExtraction",
                                        "jdExtraction",
                                        "chatbot",
                                        "general",
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
                                    }, 0).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
