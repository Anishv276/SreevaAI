"use client";

import { PortalHeader } from "@/components/careers/portal-header";
import { Button } from "@/components/ui/button";
import { 
    ArrowLeft, Clock, MapPin, Share2, Briefcase, FileText, 
    UserCircle2, CheckCircle2, MessageSquare, Facebook, 
    Link as LinkIcon, Send, Globe, Building2, Users2, Info, Sparkles 
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, use } from "react";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

export default function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [job, setJob] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/drives/${id}`)
            .then(res => {
                if (!res.ok) throw new Error("Not found");
                return res.json();
            })
            .then(data => setJob(data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="min-h-screen bg-[#FDFCFB]">
            <PortalHeader />
            <div className="container mx-auto px-4 py-12 max-w-7xl animate-pulse">
                <div className="flex flex-col lg:flex-row gap-12">
                    <div className="flex-1 space-y-8">
                        <div className="h-10 w-64 bg-gray-100 rounded-2xl" />
                        <div className="h-[400px] bg-gray-50 rounded-[2.5rem]" />
                    </div>
                    <div className="w-full lg:w-[400px] h-[600px] bg-gray-100 rounded-[2.5rem]" />
                </div>
            </div>
        </div>
    );

    if (!job) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4 font-black">Job Not Found</h1>
                    <Link href="/careers"><Button className="rounded-xl px-8">Back to Jobs</Button></Link>
                </div>
            </div>
        );
    }

    const org = job.organization || {};
    const responsibilities = job.responsibilities 
        ? job.responsibilities.split("\n").filter((l: string) => l.trim().length > 0)
        : [];
    
    const requirements = job.requirements
        ? job.requirements.split("\n").map((s: string) => s.replace(/^[•\-\*]\s*/, '').trim()).filter((s: string) => s.length > 0)
        : [];

    const skills = job.skills
        ? job.skills.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : [];

    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/careers/jobs/${id}` : "";
    const shareTitle = `Check out this opening for ${job.title} at ${org.name || 'Lumoscale'}`;

    const shareActions = {
        whatsapp: () => window.open(`https://wa.me/?text=${encodeURIComponent(shareTitle + "\n" + shareUrl)}`, '_blank'),
        facebook: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank'),
        copy: () => {
            navigator.clipboard.writeText(shareUrl);
            alert("Link copied to clipboard!");
        }
    };

    return (
        <div className="min-h-screen bg-[#FDFCFB] selection:bg-orange-100 selection:text-orange-900">
            <PortalHeader />

            <main className="container mx-auto px-4 py-8 max-w-7xl 2xl:max-w-screen-2xl">
                {/* Header Actions */}
                <div className="mb-10 flex items-center justify-between">
                    <Link href="/careers">
                        <Button variant="outline" className="h-10 px-4 rounded-xl border-gray-100 bg-white/50 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-[#F97316] hover:border-orange-100 transition-all shadow-sm group">
                            <ArrowLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" /> 
                            BACK TO JOBS
                        </Button>
                    </Link>
                </div>

                <div className="flex flex-col lg:flex-row gap-12 items-start relative">
                    
                    {/* LEFT COLUMN: SCROLLABLE CONTENT */}
                    <div className="flex-1 space-y-12 pb-24">
                        
                        {/* Job Hero */}
                        <div className="bg-white rounded-[2.5rem] border border-orange-100 p-8 lg:p-12 shadow-[0_20px_50px_rgba(249,115,22,0.05)] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50/50 rounded-full -mr-32 -mt-32 blur-3xl transition-all group-hover:bg-orange-100/50" />
                            
                            <div className="relative z-10 flex flex-col gap-6">
                                <div className="flex flex-wrap gap-3 items-center">
                                    <div className="px-4 py-1.5 rounded-full bg-orange-100/50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] border border-orange-200/50 flex items-center gap-2">
                                        <Building2 className="h-3 w-3" />
                                        {job.department}
                                    </div>
                                    <div className="px-4 py-1.5 rounded-full bg-gray-50 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] border border-gray-100 flex items-center gap-2 text-nowrap">
                                        <Briefcase className="h-3 w-3" />
                                        {job.type}
                                    </div>
                                </div>

                                <h1 className="text-4xl lg:text-5xl font-black text-gray-900 tracking-tight leading-[1.1]">
                                    {job.title}
                                </h1>

                                <div className="flex flex-wrap gap-8 pt-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center shadow-sm">
                                            <MapPin className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Work Location</p>
                                            <p className="text-gray-900 font-bold">{job.location || "Remote"}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shadow-sm">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Compensation</p>
                                            <p className="text-gray-900 font-bold">{job.salary || "Competitive"}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <section className="space-y-6 px-4">
                            <div className="flex items-center gap-3">
                                <span className="h-10 w-1.5 bg-[#F97316] rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                                <h2 className="text-2xl font-black text-gray-900 tracking-tight">About the Role</h2>
                            </div>
                            <div className="prose prose-orange max-w-none text-gray-600 leading-[1.8] text-base font-medium whitespace-pre-wrap selection:bg-orange-100">
                                {job.description || `We are looking for a ${job.title} to join our growing team.`}
                            </div>
                        </section>

                        {/* Responsibilities & Requirements */}
                        <div className="grid md:grid-cols-2 gap-8 pt-4">
                            <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm hover:shadow-md transition-all">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="h-10 w-10 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center">
                                        <Sparkles className="h-5 w-5" />
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">What you'll do</h3>
                                </div>
                                <ul className="space-y-4">
                                    {responsibilities.length > 0 ? responsibilities.map((item: string, idx: number) => (
                                        <li key={idx} className="flex items-start gap-4 text-gray-600 font-medium text-sm leading-relaxed">
                                            <div className="mt-2 h-1.5 w-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                                            {item}
                                        </li>
                                    )) : (
                                        <p className="text-gray-400 text-sm italic">Details coming soon...</p>
                                    )}
                                </ul>
                            </div>

                            <div className="bg-gray-900 rounded-[2rem] p-8 shadow-2xl text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl" />
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="h-10 w-10 rounded-xl bg-white/10 text-orange-400 flex items-center justify-center border border-white/5">
                                        <UserCircle2 className="h-5 w-5" />
                                    </div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Who you are</h3>
                                </div>
                                <ul className="space-y-4">
                                    {requirements.length > 0 ? requirements.map((item: string, idx: number) => (
                                        <li key={idx} className="flex items-start gap-4 text-gray-300 font-medium text-sm leading-relaxed">
                                            <div className="mt-2 h-1.5 w-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                                            {item}
                                        </li>
                                    )) : (
                                        <p className="text-gray-500 text-sm italic">Requirements to be finalized.</p>
                                    )}
                                </ul>
                            </div>
                        </div>

                        {/* Skills Section */}
                        {skills.length > 0 && (
                            <section className="space-y-8 px-4 pt-4">
                                <div className="flex items-center gap-3">
                                    <span className="h-10 w-1.5 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Required Skills</h2>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {skills.map((skill: string, i: number) => (
                                        <div key={i} className="px-6 py-3 rounded-2xl bg-orange-50/50 border border-orange-100 text-[#F97316] font-bold text-sm hover:bg-orange-100/50 transition-all cursor-default">
                                            {skill}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Hiring Process */}
                        <section className="px-4 pt-8">
                           <div className="rounded-[2.5rem] bg-[#111111] p-10 shadow-2xl relative overflow-hidden">
                                <div className="absolute bottom-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl" />
                                <h4 className="text-xl font-black text-white mb-10 uppercase tracking-[0.2em] flex items-center gap-4">
                                    <span className="h-8 w-1.5 bg-orange-500 rounded-full" />
                                    OUR PROCESS
                                </h4>
                                <div className="flex flex-col md:flex-row gap-8 relative">
                                    {[
                                        { title: "Review", desc: "Expert assessment" },
                                        { title: "Voice AI", desc: "Interactive screening" },
                                        { title: "Technical", desc: "Deep dive round" },
                                        { title: "Onboarding", desc: "The final offer" }
                                    ].map((step, i) => (
                                        <div key={i} className="flex-1 relative group">
                                            <div className="mb-4 h-12 w-12 rounded-2xl bg-white/5 border border-white/10 text-orange-500 flex items-center justify-center font-black text-lg transition-all group-hover:bg-orange-500 group-hover:text-white group-hover:scale-110">
                                                {i + 1}
                                            </div>
                                            <p className="font-black text-white text-xs uppercase tracking-widest mb-1">{step.title}</p>
                                            <p className="text-[11px] text-gray-500 font-bold uppercase">{step.desc}</p>
                                        </div>
                                    ))}
                                </div>
                           </div>
                        </section>
                    </div>

                    {/* RIGHT COLUMN: FIXED SIDEBAR */}
                    <aside className="w-full lg:w-[420px] lg:sticky lg:top-8 space-y-6">
                        
                        {/* Application Card */}
                        <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50/50 rounded-full blur-3xl pointer-events-none" />
                            
                            <div className="space-y-4 relative z-10">
                                <h3 className="text-2xl font-black text-gray-900 leading-tight">Ready to build the future?</h3>
                                <p className="text-gray-500 font-medium leading-relaxed">Join a team that values speed, high-fidelity engineering, and AI innovation.</p>
                            </div>

                            <div className="space-y-4 relative z-10">
                                {job.status === "CLOSED" ? (
                                    <Button disabled className="w-full h-16 bg-gray-100 text-gray-400 font-black text-lg rounded-2xl cursor-not-allowed uppercase tracking-widest italic border-gray-100">
                                        APPLICATIONS CLOSED
                                    </Button>
                                ) : (
                                    <Link href={`/careers/apply/${job.id}/start`} className="block w-full">
                                        <Button className="w-full h-16 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xl rounded-2xl shadow-[0_15px_40px_rgba(249,115,22,0.3)] hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-[0.1em] italic group">
                                            APPLY FOR ROLE
                                            <ArrowLeft className="ml-2 h-5 w-5 rotate-180 transition-transform group-hover:translate-x-1" />
                                        </Button>
                                    </Link>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <Button 
                                        variant="outline" 
                                        onClick={() => window.open(job.jdPreviewUrl, '_blank')}
                                        disabled={!job.jdPreviewUrl}
                                        className="h-14 rounded-2xl border-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
                                    >
                                        <FileText className="h-4 w-4 mr-2" /> FULL JD
                                    </Button>
                                    
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="h-14 rounded-2xl border-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm">
                                                <Share2 className="h-4 w-4 mr-2" /> SHARE
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl border-gray-100 shadow-xl">
                                            <DropdownMenuItem onClick={shareActions.whatsapp} className="h-12 rounded-xl flex gap-3 px-4 cursor-pointer font-bold text-[10px] uppercase tracking-widest hover:bg-orange-50"><MessageSquare className="h-4 w-4" /> WhatsApp</DropdownMenuItem>
                                            <DropdownMenuItem onClick={shareActions.facebook} className="h-12 rounded-xl flex gap-3 px-4 cursor-pointer font-bold text-[10px] uppercase tracking-widest hover:bg-orange-50"><Facebook className="h-4 w-4" /> Facebook</DropdownMenuItem>
                                            <DropdownMenuItem onClick={shareActions.copy} className="h-12 rounded-xl flex gap-3 px-4 cursor-pointer font-bold text-[10px] uppercase tracking-widest hover:bg-orange-50 border-t"><LinkIcon className="h-4 w-4" /> Copy Link</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${job.status === 'CLOSED' ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                        {job.status === 'CLOSED' ? 'Applications Closed' : 'Accepting Applications'}
                                    </span>
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    {job.applicants} Applied
                                </span>
                            </div>
                        </div>

                        {/* About Company Card */}
                        <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-8">
                            <div className="flex items-center gap-5">
                                <div className="h-16 w-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shadow-sm overflow-hidden p-1">
                                    {org.logoUrl ? (
                                        <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain" />
                                    ) : (
                                        <Building2 className="h-8 w-8 text-[#F97316]" />
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">Company</h4>
                                    <p className="text-xl font-black text-gray-900 tracking-tight">{org.name || "Lumoscale"}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-6 pt-2">
                                <div className="flex items-center justify-between pb-4 border-b border-gray-50">
                                    <div className="flex items-center gap-3">
                                        <Building2 className="h-4 w-4 text-[#F97316]" />
                                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Industry</span>
                                    </div>
                                    <span className="text-xs font-bold text-gray-900">{org.industry || "Technology"}</span>
                                </div>
                                <div className="flex items-center justify-between pb-4 border-b border-gray-50">
                                    <div className="flex items-center gap-3">
                                        <Users2 className="h-4 w-4 text-[#F97316]" />
                                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Size</span>
                                    </div>
                                    <span className="text-xs font-bold text-gray-900">{org.size || "11-50 employees"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Globe className="h-4 w-4 text-[#F97316]" />
                                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Website</span>
                                    </div>
                                    <a 
                                        href={org.website ? (org.website.startsWith('http') ? org.website : `https://${org.website}`) : '#'} 
                                        target="_blank" 
                                        className="text-xs font-black text-[#F97316] hover:underline flex items-center gap-1"
                                    >
                                        Visit Website <LinkIcon className="h-3 w-3" />
                                    </a>
                                </div>
                            </div>

                            <div className="p-5 rounded-2xl bg-orange-50/50 border border-orange-100 flex gap-4">
                                <Info className="h-5 w-5 text-[#F97316] flex-shrink-0 mt-0.5" />
                                <p className="text-[11px] font-medium text-orange-900/70 leading-relaxed">
                                    Our recruiting pipeline is powered by Antigravity AI, ensuring high-fidelity technical evaluation for all applicants.
                                </p>
                            </div>
                        </div>
                    </aside>

                </div>
            </main>
        </div>
    );
}
