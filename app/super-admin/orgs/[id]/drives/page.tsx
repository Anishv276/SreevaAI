"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Briefcase, Filter, Search, Loader2 } from "lucide-react";
import { JobCard } from "@/components/careers/job-card";

export default function OrgDrivesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [org, setOrg] = useState<any>(null);
    const [drives, setDrives] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const [orgRes, drivesRes] = await Promise.all([
                    fetch(`/api/super-admin/orgs/${id}`),
                    fetch(`/api/drives?orgId=${id}`)
                ]);
                
                const orgData = await orgRes.json();
                const drivesData = await drivesRes.json();
                
                setOrg(orgData);
                setDrives(drivesData);
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
        <div className="p-8 lg:p-12 space-y-12 animate-fade-slide">
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
                        <div className="h-14 w-1 flex bg-[#F97316] rounded-full shadow-[0_0_15px_rgba(249,115,22,0.3)]" />
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 tracking-tighter leading-none">Job Drives</h1>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2">Active roles for <span className="text-[#F97316]">{org?.name}</span></p>
                        </div>
                    </div>
                </div>
            </div>

            {drives.length === 0 ? (
                <div className="py-20 text-center space-y-6 bg-white border border-gray-100 rounded-[3rem]">
                    <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-200">
                        <Briefcase className="h-10 w-10" />
                    </div>
                    <p className="text-gray-400 font-black uppercase tracking-widest text-xs">No active recruitment drives detected.</p>
                </div>
            ) : (
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                    {drives.map((drive) => (
                        <div key={drive.id} className="relative group">
                            {/* Simple container for the JobCard to match admin style */}
                             <div className="pointer-events-none">
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
    );
}
