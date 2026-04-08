
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
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
    isActive: boolean;
    industry: string | null;
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

const PLANS = [
    { id: "STARTER", label: "Starter", desc: "For small teams", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
    { id: "PRO", label: "Professional", desc: "Best for scaling", color: "text-[#F97316]", bg: "bg-orange-50", border: "border-orange-100" },
    { id: "ENTERPRISE", label: "Enterprise", desc: "Maximum power", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" }
];

export default function UnifiedOrgViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [view, setView] = useState<"drives" | "candidates" | "settings">("candidates");
    const [org, setOrg] = useState<OrgDetail | null>(null);
    const [drives, setDrives] = useState<Job[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [error, setError] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Form State (for Settings tab)
    const [form, setForm] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

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
                
                // Initialize settings form
                setForm({
                    name: orgData.name,
                    slug: orgData.slug,
                    plan: orgData.plan,
                    ttsProvider: orgData.ttsProvider || "CARTESIA",
                    cartesiaVoiceId: orgData.cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
                    cartesiaModel: orgData.cartesiaModel || "sonic-english",
                    sarvamModel: orgData.sarvamModel || "bulbul:v3",
                    sarvamVoice: orgData.sarvamVoice || "shubh",
                    sttProvider: orgData.sttProvider || "DEEPGRAM",
                    deepgramModel: orgData.deepgramModel || "nova-3-general",
                    sarvamSttModel: orgData.sarvamSttModel || "saaras:v3",
                    llmProvider: orgData.llmProvider || "OPENAI",
                    llmModel: orgData.llmModel || "gpt-4o",
                    llmTemperature: orgData.llmTemperature !== undefined ? orgData.llmTemperature : 0.7,
                });
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

    const handleSettingsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch(`/api/super-admin/orgs/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                setOrg({ ...org!, ...form });
                setSaved(true);
                toast.success("Organization settings updated successfully");
                setTimeout(() => setSaved(false), 3000);
            } else {
                toast.error("Failed to update organization settings");
            }
        } catch {
            toast.error("Network error. Could not save settings.");
        } finally {
            setSaving(false);
        }
    };

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
                                        {view === "drives" ? "Drives" : view === "candidates" ? "Candidates" : "Settings"}
                                    </h1>
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2 italic">{org?.name} · Enterprise Panel</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mt-8 md:mt-0">
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
                        <button
                            onClick={() => setView("settings")}
                            className={`flex items-center gap-3 px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                                view === "settings" 
                                ? "bg-white text-gray-900 shadow-md shadow-gray-200/50" 
                                : "text-gray-400 hover:text-gray-600 hover:bg-white/50"
                            }`}
                        >
                            <Settings className={`h-4 w-4 ${view === "settings" ? "text-blue-500" : "text-gray-300"}`} />
                            Advanced Configuration
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

                {view === "settings" && form && (
                    <div className="max-w-4xl mx-auto animate-fade-slide">
                         <form onSubmit={handleSettingsSubmit} className="space-y-12">
                            {/* General Details */}
                            <div className="space-y-8">
                                <div className="flex items-center gap-5">
                                    <div className="h-12 w-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shadow-sm">
                                        <Building2 className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Organization Blueprint</h3>
                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Foundational credentials and routing</p>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-8 bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm group hover:border-[#F97316]/20 transition-all duration-300">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Organization Identity</label>
                                        <input
                                            value={form.name}
                                            onChange={e => setForm({...form, name: e.target.value})}
                                            className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50/50 px-4 text-sm font-black text-gray-900 focus:bg-white focus:ring-4 focus:ring-[#F97316]/5 transition-all outline-none"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Resource Slug</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 font-black text-sm">/</span>
                                            <input
                                                value={form.slug}
                                                onChange={e => setForm({...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")})}
                                                className="h-12 w-full pl-8 pr-4 rounded-xl border border-gray-100 bg-gray-50/50 text-sm font-black text-gray-900 focus:bg-white focus:ring-4 focus:ring-[#F97316]/5 transition-all outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="md:col-span-2 space-y-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Service Tier Selection</label>
                                        <div className="grid grid-cols-3 gap-4">
                                            {PLANS.map(p => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => setForm({...form, plan: p.id})}
                                                    className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden group/plan ${
                                                        form.plan === p.id 
                                                        ? `${p.border} ${p.bg} shadow-lg shadow-gray-200/20` 
                                                        : "border-gray-100 opacity-60 hover:opacity-100"
                                                    }`}
                                                >
                                                    <div className={`h-1.5 w-1.5 rounded-full mb-3 ${form.plan === p.id ? "bg-[#F97316] animate-pulse" : "bg-gray-200"}`} />
                                                    <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest">{p.label}</p>
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{p.desc}</p>
                                                    {form.plan === p.id && <ShieldCheck className="absolute top-4 right-4 h-4 w-4 text-[#F97316]" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Infrastructure Stack */}
                            <div className="space-y-8">
                                <div className="flex items-center gap-5">
                                    <div className="h-12 w-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-sm">
                                        <Globe className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Intelligence Stack</h3>
                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Inference models and neural infrastructure</p>
                                    </div>
                                </div>

                                <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm space-y-12">
                                    <div className="grid md:grid-cols-2 gap-10 border-b border-gray-50 pb-12">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Primary TTS Engine</label>
                                            <select 
                                                value={form.ttsProvider}
                                                onChange={e => setForm({...form, ttsProvider: e.target.value})}
                                                className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-black text-gray-900 focus:bg-white outline-none"
                                            >
                                                <option value="CARTESIA">⚡ Cartesia (Ultra-Low Latency)</option>
                                                <option value="SARVAM">🇮🇳 Sarvam AI (Indian)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Neural Transcription</label>
                                            <select 
                                                value={form.sttProvider}
                                                onChange={e => setForm({...form, sttProvider: e.target.value})}
                                                className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-black text-gray-900 focus:bg-white outline-none"
                                            >
                                                <option value="DEEPGRAM">🛸 Deepgram (Elite Speed)</option>
                                                <option value="SARVAM">🇮🇳 Sarvam Saaras</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Cartesia Settings */}
                                    {form.ttsProvider === "CARTESIA" && (
                                        <div className="grid md:grid-cols-2 gap-10 border-b border-gray-50 pb-12">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cartesia Voice Model</label>
                                                <select
                                                    value={form.cartesiaModel}
                                                    onChange={e => setForm({...form, cartesiaModel: e.target.value})}
                                                    className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-black text-gray-900 focus:bg-white outline-none"
                                                >
                                                    <option value="sonic-english">sonic-english (English Optimised)</option>
                                                    <option value="sonic-3">sonic-3 (Latest, Multilingual)</option>
                                                    <option value="sonic-2-2025-03-07">sonic-2 (Speed + Emotion Controls)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                                    Custom Voice ID
                                                    <span className="text-[8px] font-bold text-[#F97316] bg-orange-50 px-2 py-0.5 rounded-full normal-case">from cartesia.ai/voices</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    value={form.cartesiaVoiceId}
                                                    onChange={e => setForm({...form, cartesiaVoiceId: e.target.value})}
                                                    placeholder="e.g. 9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
                                                    className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50/50 px-4 text-xs font-black text-gray-600 placeholder:text-gray-300 focus:bg-white focus:ring-4 focus:ring-[#F97316]/5 transition-all outline-none font-mono"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Sarvam TTS Settings */}
                                    {form.ttsProvider === "SARVAM" && (
                                        <div className="grid md:grid-cols-2 gap-10 border-b border-gray-50 pb-12">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Sarvam TTS Model</label>
                                                <select
                                                    value={form.sarvamModel}
                                                    onChange={e => setForm({...form, sarvamModel: e.target.value})}
                                                    className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-black text-gray-900 focus:bg-white outline-none"
                                                >
                                                    <option value="bulbul:v3">bulbul:v3 (Latest)</option>
                                                    <option value="bulbul:v2">bulbul:v2</option>
                                                </select>
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Sarvam Voice</label>
                                                <select
                                                    value={form.sarvamVoice}
                                                    onChange={e => setForm({...form, sarvamVoice: e.target.value})}
                                                    className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-black text-gray-900 focus:bg-white outline-none"
                                                >
                                                    <option value="shubh">Shubh (Male, Hindi)</option>
                                                    <option value="anushka">Anushka (Female, Hindi)</option>
                                                    <option value="arvind">Arvind (Male, English)</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Deepgram STT Model */}
                                    {form.sttProvider === "DEEPGRAM" && (
                                        <div className="grid md:grid-cols-2 gap-10 border-b border-gray-50 pb-12">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Deepgram STT Model</label>
                                                <select
                                                    value={form.deepgramModel}
                                                    onChange={e => setForm({...form, deepgramModel: e.target.value})}
                                                    className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-black text-gray-900 focus:bg-white outline-none"
                                                >
                                                    <option value="nova-3-general">nova-3-general (Latest)</option>
                                                    <option value="nova-2-general">nova-2-general (Stable)</option>
                                                    <option value="nova-2-meeting">nova-2-meeting (Multi-speaker)</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid md:grid-cols-2 gap-10">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Large Language Model</label>
                                            <select 
                                                value={form.llmModel}
                                                onChange={e => setForm({...form, llmModel: e.target.value})}
                                                className="h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 text-xs font-black text-gray-900 focus:bg-white outline-none"
                                            >
                                                <option value="gpt-4o">GPT-4o (Superior Reasoning)</option>
                                                <option value="gpt-4o-mini">GPT-4o-mini (Latency)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Inference Temperature</label>
                                                <span className="text-[10px] font-black text-[#F97316] bg-orange-50 px-2 py-1 rounded-lg">{form.llmTemperature}</span>
                                            </div>
                                            <input 
                                                type="range" min="0" max="1" step="0.1"
                                                value={form.llmTemperature}
                                                onChange={e => setForm({...form, llmTemperature: parseFloat(e.target.value)})}
                                                className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-[#F97316]"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8 flex items-center justify-between border-t border-gray-50 flex-col sm:flex-row gap-6">
                                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.15em] max-w-xs leading-relaxed italic">Synchronizing these changes affects all child threads and active interview sessions across this portal.</p>
                                <div className="flex items-center gap-6">
                                     {saved && (
                                        <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest animate-in-up">
                                            <ShieldCheck className="h-4 w-4" /> SECURELY SYNCED
                                        </div>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="h-12 px-12 bg-gray-900 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl hover:bg-black transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "COMMIT CHANGES →"}
                                    </button>
                                </div>
                            </div>
                         </form>
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
        </div>
    );
}
