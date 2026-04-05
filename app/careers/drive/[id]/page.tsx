"use client";
import { PortalHeader } from "@/components/careers/portal-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, MapPin, Share2, Briefcase, FileText, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, use } from "react";

export default function DriveDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [drive, setDrive] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/drives/${id}`)
            .then(res => {
                if (!res.ok) throw new Error("Not found");
                return res.json();
            })
            .then(data => setDrive(data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="min-h-screen bg-[#FDFCFB]">
            <PortalHeader />
            <div className="container mx-auto px-4 py-8 max-w-7xl animate-pulse">
                <div className="h-[200px] bg-gray-100 rounded-3xl mb-8 shadow-sm" />
                <div className="grid lg:grid-cols-3 gap-12">
                    <div className="lg:col-span-2 space-y-8">
                        <div className="h-8 w-48 bg-gray-100 rounded-lg" />
                        <div className="h-32 bg-gray-50 rounded-2xl" />
                    </div>
                </div>
            </div>
        </div>
    );

    if (!drive) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Job Not Found</h1>
                    <Link href="/careers"><Button>Back to Jobs</Button></Link>
                </div>
            </div>
        );
    }

    // Process responsibilities and skills from string/newline to array
    const responsibilities = drive.responsibilities ? drive.responsibilities.split("\n").filter((l: string) => l.trim().length > 0) : [];
    const skills = drive.skills ? drive.skills.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0) : [];

    return (
        <div className="min-h-screen bg-[#FDFCFB] selection:bg-orange-100 selection:text-orange-900">
            <PortalHeader />

            <main className="container mx-auto px-4 py-12 max-w-7xl 2xl:max-w-screen-2xl animate-in-fade">
                {/* Breadcrumb / Back */}
                <div className="mb-10">
                    <Link href="/careers" className="group inline-flex items-center text-sm font-bold text-gray-400 hover:text-[#F97316] transition-all">
                        <ArrowLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" /> 
                        BACK TO OPPORTUNITIES
                    </Link>
                </div>

                <div className="grid gap-12 lg:grid-cols-3 items-start">
                    {/* Left Column: Job Description & Details */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Hero Section */}
                        <div className="relative overflow-hidden rounded-3xl bg-white border border-orange-100 shadow-[0_15px_40px_-15px_rgba(249,115,22,0.08)] p-8 transition-all duration-500 hover:shadow-[0_25px_50px_-15px_rgba(249,115,22,0.12)]">
                            {/* Decorative Background Elements */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-50 to-transparent rounded-full -mr-32 -mt-32 opacity-50" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-orange-50 to-transparent rounded-full -ml-16 -mb-16 opacity-30" />

                            <div className="relative z-10 flex flex-col items-start gap-6">
                                <div className="px-3 py-1 rounded-full bg-orange-100/50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] border border-orange-200/50">
                                    {drive.department}
                                </div>
                                <h1 className="text-3xl lg:text-3xl font-black text-gray-900 tracking-tight leading-tight">
                                    {drive.title}
                                </h1>
                                <div className="flex flex-wrap gap-8 pt-2">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-orange-50 text-[#F97316] border border-orange-100">
                                            <MapPin className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Location</p>
                                            <p className="text-gray-900 font-bold">{drive.location || "Remote"}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-orange-50 text-[#F97316] border border-orange-100">
                                            <Clock className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</p>
                                            <p className="text-gray-900 font-bold">{drive.type || "Full-time"}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-orange-50 text-[#F97316] border border-orange-100">
                                            <Briefcase className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Experience</p>
                                            <p className="text-gray-900 font-bold">{drive.experience || "Not Specified"}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Content Sections */}
                        <div className="space-y-12 px-4 lg:px-8">
                            <section className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <span className="h-8 w-1 bg-[#F97316] rounded-full shadow-[0_0_10px_rgba(249,115,22,0.3)]" />
                                    <h2 className="text-xl font-black text-gray-900 tracking-tight">About the Role</h2>
                                </div>
                                <div className="prose prose-orange max-w-none text-gray-600 leading-[1.6] text-sm font-medium whitespace-pre-wrap">
                                    {drive.description || `We are looking for a passionate ${drive.title} to join our ${drive.department} team.`}
                                </div>
                            </section>

                            {(responsibilities.length > 0 || skills.length > 0) && (
                                <section className="space-y-8">
                                    <div className="flex items-center gap-4">
                                        <span className="h-10 w-1.5 bg-[#F97316] rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Requirements & Responsibilities</h2>
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-8">
                                        {responsibilities.length > 0 && (
                                            <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                                <h3 className="text-sm font-black text-[#F97316] mb-3 uppercase tracking-wider">What you'll do</h3>
                                                <ul className="space-y-3">
                                                    {responsibilities.map((item: string, idx: number) => (
                                                        <li key={idx} className="flex items-start gap-2 text-gray-600 font-medium text-[13px]">
                                                            <div className="mt-1.5 h-1 w-1 rounded-full bg-[#F97316] flex-shrink-0" />
                                                            {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {skills.length > 0 && (
                                            <div className="p-6 rounded-3xl bg-gray-900 text-white shadow-xl transition-all hover:scale-[1.01]">
                                                <h3 className="text-sm font-black text-orange-400 mb-3 uppercase tracking-wider">What we look for</h3>
                                                <ul className="space-y-3">
                                                    {skills.map((item: string, idx: number) => (
                                                        <li key={idx} className="flex items-start gap-2 text-gray-300 font-medium text-[13px]">
                                                            <div className="mt-1.5 h-1 w-1 rounded-full bg-orange-400 flex-shrink-0" />
                                                            {item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Sticky Action Box */}
                    <div className="lg:sticky lg:top-28 space-y-6">
                        <div className="relative group overflow-hidden rounded-[2.5rem] bg-white border border-gray-100 shadow-[0_20px_40px_rgba(0,0,0,0.04)] p-8 transition-all hover:shadow-[0_30px_60px_rgba(249,115,22,0.1)]">
                            <div className="relative z-10 space-y-6">
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-gray-900 leading-tight">Ready to shape the future?</h3>
                                    <p className="text-sm text-gray-500 font-medium">Join us in building the next generation of AI-driven tools.</p>
                                </div>

                                <div className="space-y-3">
                                    <Link href={`/careers/apply/${drive.id}/start`} className="w-full">
                                        <Button className="w-full h-14 bg-[#F97316] hover:bg-orange-600 text-white font-black text-lg rounded-2xl shadow-[0_10px_30px_rgba(249,115,22,0.3)] hover:translate-y-[-2px] hover:shadow-[0_15px_40px_rgba(249,115,22,0.4)] transition-all duration-300 uppercase tracking-widest italic">
                                            Apply Now
                                        </Button>
                                    </Link>
                                    {drive.jdPreviewUrl && (
                                        <Button 
                                            variant="outline" 
                                            onClick={() => window.open(drive.jdPreviewUrl, '_blank')}
                                            className="w-full h-12 rounded-2xl border-gray-100 text-gray-500 font-bold hover:bg-orange-50 hover:text-[#F97316] transition-all"
                                        >
                                            <Briefcase className="h-4 w-4 mr-2" /> VIEW FULL JD
                                        </Button>
                                    )}
                                    <Button variant="outline" className="w-full h-12 rounded-2xl border-gray-100 text-gray-500 font-bold hover:bg-orange-50 hover:text-[#F97316] transition-all">
                                        <Share2 className="h-4 w-4 mr-2" /> SHARE THIS ROLE
                                    </Button>
                                </div>

                                <div className="pt-4 border-t border-gray-50 flex items-center justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                    <span>Applications are open</span>
                                    <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                </div>
                            </div>
                        </div>

                        {/* Process Card */}
                        <div className="rounded-[2.5rem] bg-[#111111] p-8 shadow-2xl border border-white/5">
                            <h4 className="text-lg font-black text-white mb-6 uppercase tracking-widest flex items-center gap-3">
                                <span className="h-6 w-1 bg-orange-500 rounded-full" />
                                HIRING PROCESS
                            </h4>
                            <div className="space-y-0 relative">
                                {[
                                    "Resume Screening", 
                                    "Voice AI Interview", 
                                    "Technical Round", 
                                    "Final Offer"
                                ].map((step, i, arr) => (
                                    <div key={i} className="flex gap-4 group pb-6 last:pb-0 relative">
                                        {i !== arr.length - 1 && (
                                            <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-gray-800" />
                                        )}
                                        <div className="relative z-10 h-8 w-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-sm shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                                            {i + 1}
                                        </div>
                                        <div className="pt-1.5">
                                            <p className="text-[13px] font-black text-gray-100 uppercase tracking-widest group-hover:text-orange-400 transition-colors">{step}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
