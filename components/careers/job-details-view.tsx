"use client";

import { PortalHeader } from "@/components/careers/portal-header";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft, Clock, MapPin, Share2, Briefcase, FileText,
    UserCircle2,
    Link as LinkIcon, Send, Globe, Building2, Users2, Info, Sparkles, AlertCircle
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/components/ui/toast-custom";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface JobDetailsViewProps {
    job: any;
    isDraft?: boolean;
}

export function JobDetailsView({ job, isDraft = false }: JobDetailsViewProps) {
    if (!job) return null;

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

    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/careers/jobs/${job.id}` : "";
    const shareTitle = `Check out this opening for ${job.title} at ${org.name || 'Lumoscale'}`;

    const shareActions = {
        whatsapp: () => window.open(`https://wa.me/?text=${encodeURIComponent(shareTitle + "\n" + shareUrl)}`, '_blank'),
        facebook: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank'),
        copy: () => {
            navigator.clipboard.writeText(shareUrl);
            toast.success("Link copied to clipboard!");
        }
    };

    const isExpired = job.deadline && new Date(job.deadline) < new Date();
    const isActuallyClosed = job.status === "CLOSED" || isExpired;

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
                        <div className="bg-white rounded-3xl border border-orange-100 p-8 shadow-sm relative overflow-hidden group">
                            <div className="relative z-10">
                                <h1 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight leading-tight">
                                    {job.title}
                                </h1>
                            </div>
                        </div>

                        {/* Job Highlights Section */}
                        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Work Location</p>
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-3.5 w-3.5 text-[#F97316]" />
                                        <p className="text-[13px] font-bold text-gray-900">{job.location || "Remote"}</p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Salary (LPA)</p>
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-3.5 w-3.5 text-green-500" />
                                        <p className="text-[13px] font-bold text-gray-900">
                                            {job.salary ? (job.salary.toLowerCase().includes('lpa') ? job.salary : `${job.salary} LPA`) : "Competitive"}
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Work Mode</p>
                                    <div className="flex items-center gap-2">
                                        <Globe className="h-3.5 w-3.5 text-blue-500" />
                                        <p className="text-[13px] font-bold text-gray-900">{job.workMode || "Remote"}</p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Job Type</p>
                                    <div className="flex items-center gap-2">
                                        <Briefcase className="h-3.5 w-3.5 text-orange-500" />
                                        <p className="text-[13px] font-bold text-gray-900">{job.type || job.employmentType || "Full-time"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <section className="space-y-6 px-4">
                            <div className="flex items-center gap-3">
                                <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase">About the Role</h2>
                            </div>
                            <div className="prose prose-orange max-w-none text-gray-600 leading-relaxed text-[13px] font-medium whitespace-pre-wrap">
                                {job.description || `We are looking for a ${job.title} to join our growing team.`}
                            </div>
                        </section>

                        {/* Responsibilities & Requirements */}
                        <div className="grid md:grid-cols-2 gap-8 pt-4">
                            <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm hover:shadow-md transition-all">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="h-8 w-8 rounded-lg bg-orange-50 text-[#F97316] flex items-center justify-center">
                                        <Sparkles className="h-4 w-4" />
                                    </div>
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">What you'll do</h3>
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
                            <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group/who">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full blur-3xl opacity-50 group-hover/who:scale-110 transition-transform duration-700" />
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="h-8 w-8 rounded-lg bg-gray-50 text-[#F97316] flex items-center justify-center border border-gray-100">
                                        <UserCircle2 className="h-4 w-4" />
                                    </div>
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Who you are</h3>
                                </div>
                                <ul className="space-y-4 relative z-10">
                                    {requirements.length > 0 ? requirements.map((item: string, idx: number) => (
                                        <li key={idx} className="flex items-start gap-4 text-gray-600 font-medium text-sm leading-relaxed">
                                            <div className="mt-2 h-1.5 w-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                                            {item}
                                        </li>
                                    )) : (
                                        <p className="text-gray-400 text-sm italic">Requirements to be finalized.</p>
                                    )}
                                </ul>
                            </div>
                        </div>

                        {/* Skills Section */}
                        {skills.length > 0 && (
                            <section className="space-y-6 px-4 pt-4">
                                <div className="flex items-center gap-3">
                                    <span className="h-6 w-1 bg-orange-500 rounded-full" />
                                    <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase">Required Skills</h2>
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
                    </div>

                    {/* RIGHT COLUMN: FIXED SIDEBAR */}
                    <aside className="w-full lg:w-[320px] lg:sticky lg:top-8 space-y-4">

                        {/* Application Card */}
                        <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50/50 rounded-full blur-3xl pointer-events-none" />

                            <div className="space-y-3 relative z-10">
                                <h3 className="text-xl font-black text-gray-900 leading-tight">Ready to build the future?</h3>
                                <p className="text-gray-500 font-medium leading-relaxed text-[13px]">Join a team that values speed, high-fidelity engineering, and AI innovation.</p>
                            </div>

                            <div className="space-y-4 relative z-10">
                                {isActuallyClosed ? (
                                    <Button disabled className="w-full h-16 bg-gray-100 text-gray-400 font-inter font-black text-lg rounded-2xl cursor-not-allowed uppercase tracking-widest border-gray-100">
                                        APPLICATIONS CLOSED
                                    </Button>
                                ) : (
                                    <Link href={isDraft ? "#" : `/careers/apply/${job.id}/start`} className="block w-full">
                                        <Button className="w-full h-14 bg-[#F97316] hover:bg-orange-600 text-white font-inter font-bold text-base rounded-2xl shadow-[0_15px_40px_rgba(249,115,22,0.1)] hover:scale-[1.02] active:scale-95 transition-all tracking-[0.02em] group">
                                            Apply for role
                                            <ArrowLeft className="ml-2 h-4 w-4 rotate-180 transition-transform group-hover:translate-x-1" />
                                        </Button>
                                    </Link>
                                )}
                                <Button
                                    variant="outline"
                                    onClick={() => job.jdPreviewUrl && window.open(job.jdPreviewUrl, '_blank')}
                                    disabled={!job.jdPreviewUrl}
                                    className="w-full h-12 rounded-2xl border-gray-100 text-gray-500 text-[9px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
                                >
                                    <FileText className="h-3.5 w-3.5 mr-2" /> FULL JD
                                </Button>
                            </div>

                            <div className="pt-6 border-t border-gray-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${isActuallyClosed ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
                                    <span className="text-[10px] font-inter font-black text-gray-900 uppercase tracking-widest">
                                        {isActuallyClosed ? (isExpired ? 'Applications Expired' : 'Applications Closed') : 'Accepting Applications'}
                                    </span>
                                </div>
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
                                    {job.applicants || 0} Applied
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
                                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-1">Company</h4>
                                    <p className="text-xl font-black text-gray-900 tracking-tight">{org.name || "Lumoscale"}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-6 pt-2 border-t border-gray-50 mt-8">
                                <div className="flex items-center justify-between pb-4 border-b border-gray-50">
                                    <div className="flex items-center gap-3">
                                        <Building2 className="h-4 w-4 text-[#F97316]" />
                                        <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Industry</span>
                                    </div>
                                    <span className="text-xs font-bold text-gray-900">{org.industry || "Technology"}</span>
                                </div>
                                <div className="flex items-center justify-between pb-4 border-b border-gray-50">
                                    <div className="flex items-center gap-3">
                                        <Users2 className="h-4 w-4 text-[#F97316]" />
                                        <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Size</span>
                                    </div>
                                    <span className="text-xs font-bold text-gray-900">{org.size || "11-50 employees"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Globe className="h-4 w-4 text-[#F97316]" />
                                        <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Website</span>
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

                        </div>
                    </aside>

                </div>
            </main>
        </div>
    );
}

