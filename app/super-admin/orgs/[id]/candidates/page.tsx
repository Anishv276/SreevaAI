"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserCircle2, Filter, Search, Loader2 } from "lucide-react";
export default function OrgCandidatesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [org, setOrg] = useState<any>(null);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const load = async () => {
            try {
                const [orgRes, candidatesRes] = await Promise.all([
                    fetch(`/api/super-admin/orgs/${id}`),
                    fetch(`/api/candidates?orgId=${id}`)
                ]);
                const orgData = await orgRes.json();
                const candidatesData = await candidatesRes.json();
                setOrg(orgData);
                setCandidates(candidatesData);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);
    if (loading) {
        return (
            <div className="p-20 text-center flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin opacity-20" />
            </div>
        );
    }
    return (
        <div className="p-8 lg:p-12 space-y-12 animate-fade-slide text-gray-900 font-medium">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-4">
                    <button 
                        onClick={() => router.back()} 
                        className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-[10px] font-black uppercase tracking-[0.2em] mb-4 transition-all"
                    >
                        <ArrowLeft className="h-3 w-3 group-hover:-translate-x-1 transition-transform" />
                        Back to Organizations
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-1.5 flex bg-[#F97316] rounded-full shadow-[0_0_15px_rgba(249,115,22,0.3)]" />
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 tracking-tighter leading-none">Global Talent</h1>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2">Analyzed individuals for <span className="text-[#F97316]">{org?.name}</span></p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.02)] overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 px-10 py-6 border-b border-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-gray-50/10">
                    <span>NAME & ROLE</span>
                    <span>EMAIL</span>
                    <span className="text-center">MATCH SCORE</span>
                    <span className="text-center">STATUS</span>
                    <span className="text-right">DATE APPLIED</span>
                </div>
                {candidates.length === 0 ? (
                    <div className="py-40 text-center space-y-6">
                        <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-200">
                            <UserCircle2 className="h-10 w-10" />
                        </div>
                        <p className="text-gray-400 font-black uppercase tracking-widest text-xs">No candidate records available for this organization.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {candidates.map((can) => (
                            <div key={can.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 px-10 py-8 items-center hover:bg-gray-50/40 transition-all group">
                                <div className="flex flex-col gap-1">
                                    <p className="text-gray-900 font-black text-base tracking-tight leading-none group-hover:text-[#F97316] transition-colors uppercase">{can.name}</p>
                                    <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest opacity-60 truncate">{can.role}</p>
                                </div>
                                <p className="text-gray-500 font-bold text-[13px] lowercase truncate">{can.email}</p>
                                <div className="text-center">
                                    <div className="inline-flex flex-col items-center gap-1">
                                         <span className={`text-base font-black tracking-tighter tabular-nums ${can.score >= 80 ? 'text-emerald-500' : can.score >= 50 ? 'text-orange-500' : 'text-red-500'}`}>{can.score}%</span>
                                         <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                             <div className={`h-full ${can.score >= 80 ? 'bg-emerald-500' : can.score >= 50 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${can.score}%` }} />
                                         </div>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <span className="px-5 py-1.5 bg-gray-900 text-white text-[9px] font-black uppercase tracking-[0.2em] rounded-full shadow-sm hover:bg-[#F97316] transition-all cursor-default">
                                        {can.status}
                                    </span>
                                </div>
                                <p className="text-right text-gray-400 font-black uppercase tracking-widest text-[10px] tabular-nums">{can.date}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
