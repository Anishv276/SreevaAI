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
    AlertCircle
} from "lucide-react";
import { JobCard } from "@/components/careers/job-card";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { Job } from "@/context/jobs-context";

// ── TypeScript Interfaces ─────────────────────────────────────
interface OrgDetail {
    id: string;
    name: string;
    slug: string;
    plan: string;
    isActive: boolean;
    industry: string | null;
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

export default function UnifiedOrgViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [view, setView] = useState<"drives" | "candidates">("candidates");
    const [org, setOrg] = useState<OrgDetail | null>(null);
    const [drives, setDrives] = useState<Job[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const [orgRes, drivesRes, candidatesRes] = await Promise.all([
                    fetch(`/api/super-admin/orgs/${id}`),
                    fetch(`/api/drives?orgId=${id}`),
                    fetch(`/api/candidates?orgId=${id}`)
                ]);
                
                if (!orgRes.ok) {
                    setError("Failed to load organization data. Please try again.");
                    return;
                }

                const [orgData, drivesData, candidatesData] = await Promise.all([
                    orgRes.json(),
                    drivesRes.json(),
                    candidatesRes.json()
                ]);
                
                setOrg(orgData);
                setDrives(drivesData.drives || []);
                setCandidates(candidatesData.candidates || []);
            } catch {
                setError("Network error. Could not connect to the server.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const handleDeleteCandidates = () => {
        if (candidates.length === 0) return;
        setIsDeleteModalOpen(true);
    };

    const confirmDeleteCandidates = async () => {
        setIsDeleting(true);
        setDeleteError("");
        try {
            const res = await fetch(`/api/candidates?orgId=${id}`, { method: "DELETE" });
            if (res.ok) {
                setCandidates([]);
                setIsDeleteModalOpen(false);
            } else {
                const data = await res.json();
                setDeleteError(data.error || "Failed to delete candidates. Please try again.");
            }
        } catch {
            setDeleteError("Network error. Could not complete the purge operation.");
        } finally {
            setIsDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-white p-20 flex flex-col items-center justify-center gap-6">
                <Loader2 className="h-10 w-10 text-[#F97316] animate-spin opacity-30" />
                <p className="text-gray-400 font-black text-[10px] uppercase tracking-[0.3em]">Synchronizing Portal Context...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-white p-20 flex flex-col items-center justify-center gap-6">
                <AlertCircle className="h-10 w-10 text-red-400" />
                <p className="text-gray-900 font-black text-lg">{error}</p>
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-gray-400 hover:text-gray-900 text-xs font-black uppercase tracking-widest transition-all"
                >
                    <ArrowLeft className="h-4 w-4" /> Return to Registry
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Unified Header matching Pic 2's Style */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-8 py-10 lg:px-12">
                <div className="max-w-7xl mx-auto space-y-12">
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
                                    <h1 className="text-4xl font-black text-gray-900 tracking-tighter leading-none uppercase italic">{view === "drives" ? "Drives" : "Candidates"}</h1>
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2 italic">{org?.name} · {candidates.length} Applicants</p>
                                </div>
                            </div>
                        </div>

                        {/* Control Buttons from Pic 2 */}
                        <div className="flex items-center gap-4 mt-8 md:mt-0">
                            <button 
                                onClick={handleDeleteCandidates}
                                className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm border border-red-100 hover:bg-red-100 transition-all disabled:opacity-50"
                                disabled={candidates.length === 0}
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete Candidates
                            </button>
                            <button className="flex items-center gap-2 px-6 py-3 bg-gray-50 text-gray-900 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm border border-gray-100 hover:bg-gray-100 transition-all">
                                <Download className="h-4 w-4" />
                                Export
                            </button>
                        </div>
                    </div>

                    {/* Unified Selector Toggle */}
                    <div className="flex bg-gray-50/50 p-1.5 rounded-[1.5rem] border border-gray-100 shadow-inner w-fit mx-auto md:mx-0">
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
                    </div>
                </div>
            </header>

            {/* Content Area matches Pic 2 Table Style */}
            <main className="max-w-7xl mx-auto p-8 lg:p-12 animate-fade-slide">
                {view === "drives" ? (
                    <div className="space-y-12">
                        {drives.length === 0 ? (
                            <div className="py-32 text-center bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-200">
                                <Briefcase className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No active recruitment drives detected.</p>
                            </div>
                        ) : (
                            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                                {drives.map((drive) => (
                                    <div key={drive.id} className="relative group">
                                        <div className="pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity">
                                            <JobCard job={drive} />
                                        </div>
                                        <div className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-white/90 backdrop-blur border rounded-full text-gray-900 shadow-sm opacity-60">
                                            {drive.status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Search Bar matching Pic 2 */}
                        <div className="relative group max-w-lg mb-4">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-gray-900 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search by name, role, or email..."
                                className="w-full h-16 pl-16 pr-8 bg-gray-50/50 border border-gray-100 rounded-[1.5rem] text-sm font-black text-gray-900 placeholder:text-gray-300 outline-none focus:bg-white focus:ring-4 focus:ring-gray-900/5 transition-all"
                            />
                        </div>

                        {/* Candidates Table Styled like Pic 2 */}
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

                            {candidates.length === 0 ? (
                                <div className="py-40 text-center space-y-6">
                                    <UserCircle2 className="h-12 w-12 text-gray-200 mx-auto" />
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No active candidate records found.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50/50">
                                    {candidates.map((can) => (
                                        <div key={can.id} className="grid grid-cols-[3fr_2fr_1fr_1fr_1.5fr_1.5fr_auto] gap-4 px-12 py-10 items-center hover:bg-gray-50/50 transition-all group">
                                            <div className="flex items-center gap-6">
                                                <div className="h-14 w-14 rounded-full bg-gray-900 text-white flex flex-shrink-0 items-center justify-center font-black text-lg shadow-lg group-hover:scale-105 transition-transform">
                                                    {can.name ? can.name[0].toUpperCase() : 'C'}
                                                </div>
                                                <div className="flex flex-col gap-1.5 truncate">
                                                    <p className="text-gray-900 font-black text-base tracking-tight leading-none truncate uppercase">{can.name || "N/A"}</p>
                                                    <p className="text-gray-400 text-[10px] font-black truncate lowercase tracking-widest opacity-60 leading-none">{can.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1 truncate">
                                                <p className="text-gray-900 font-black text-xs tracking-tight uppercase leading-none truncate">{can.role}</p>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1 opacity-60">Remote</p>
                                            </div>
                                            <div className="text-center">
                                                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl font-black text-base tracking-tighter ${can.score >= 80 ? 'text-emerald-500 bg-emerald-50' : can.score >= 50 ? 'text-orange-500 bg-orange-50' : 'text-red-500 bg-red-50 border border-red-100'}`}>
                                                    {can.score}
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <span className={`px-4 py-2 border rounded-full text-[9px] font-black uppercase tracking-[0.2em] italic ${can.status === "Rejected" ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-900 text-white border-transparent shadow-sm'}`}>
                                                    {can.status.toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="text-center text-gray-400 font-black text-[10px] uppercase tracking-widest opacity-60">
                                                {can.interviewStatus}
                                            </div>
                                            <p className="text-right text-gray-400 font-bold text-[11px] tabular-nums">{can.date}</p>
                                            <div className="flex items-center justify-end gap-4">
                                                <button className="text-[10px] font-black text-[#F97316] uppercase tracking-widest hover:underline transition-all underline-offset-4">View Profile</button>
                                                <MoreVertical className="h-4 w-4 text-gray-200" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Pagination Area matching Pic 2 */}
                        <div className="flex items-center justify-between px-12 py-8 mt-4">
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest italic leading-none">SHOWING 1 OF {candidates.length} CANDIDATES</p>
                            <div className="flex items-center gap-4">
                                <button className="px-6 py-3 bg-gray-50 text-gray-300 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm border border-white opacity-50 cursor-not-allowed transition-all">Previous</button>
                                <button className="px-6 py-3 bg-gray-50 text-gray-900 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-sm border border-gray-100 hover:bg-gray-100 transition-all shadow-gray-200">Next</button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <ActionConfirmModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDeleteCandidates}
                title="Purge Candidates"
                description={`Are you sure you want to delete all ${candidates.length} candidates for ${org?.name}? This will permanently remove their entire application history and interview data. This action is irreversible.`}
                confirmText={`Confirm Purge (${candidates.length})`}
                isLoading={isDeleting}
            />
        </div>
    );
}
