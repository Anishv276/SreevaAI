"use client";

import { useState } from "react";
import { X, Smartphone, Monitor, ChevronLeft, ChevronRight, MapPin, Clock, Briefcase, Share2, ArrowLeft, Upload, FileText, User, UserCircle, Target, ShieldCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CandidatePreviewProps {
    formData: any;
    regFieldCount: number;
    onClose: () => void;
}

export function CandidatePreview({ formData, regFieldCount, onClose }: CandidatePreviewProps) {
    const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
    const [page, setPage] = useState<"jd" | "apply">("jd");

    const responsibilities = formData.responsibilities
        ? formData.responsibilities.split("\n").filter((l: string) => l.trim().length > 0)
        : ["Build scalable AI solutions", "Collaborate with cross-functional teams", "Design and implement new features"];
    
    const skills = formData.skills
        ? formData.skills.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : ["React", "Node.js", "TypeScript", "Next.js"];

    const inputClass = "h-12 w-full rounded-2xl border border-gray-100 bg-gray-50/50 px-5 text-sm font-medium text-gray-400 placeholder:text-gray-300 flex items-center";

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-gray-900/40 backdrop-blur-md animate-in-fade">
            {/* Simulation Control Bar */}
            <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100 shadow-sm z-50 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 flex items-center justify-center bg-orange-50 rounded-xl">
                        <Monitor className="w-5 h-5 text-[#F97316]" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-gray-900 tracking-tight uppercase">Simulation Console</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-green-500" />
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none">
                                {page === "jd" ? "LIVE PREVIEW: JOB DETAILS" : "LIVE PREVIEW: DYNAMIC APPLICATION PORTAL"}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex bg-gray-50 border border-gray-100 p-1 rounded-xl">
                    <button
                        onClick={() => setViewMode("desktop")}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === "desktop" ? "bg-white text-gray-900 shadow-sm border border-gray-100" : "text-gray-400"}`}
                    >
                        <Monitor className="w-3.5 h-3.5" /> Desktop
                    </button>
                    <button
                        onClick={() => setViewMode("mobile")}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === "mobile" ? "bg-white text-gray-900 shadow-sm border border-gray-100" : "text-gray-400"}`}
                    >
                        <Smartphone className="w-3.5 h-3.5" /> Mobile
                    </button>
                </div>

                <button
                    onClick={onClose}
                    className="h-10 w-10 flex items-center justify-center border border-gray-100 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Viewport Area */}
            <div className="flex-1 overflow-auto p-8 flex justify-center items-start bg-gray-100/20">
                <div className={`transition-all duration-500 bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col ${
                    viewMode === "desktop" ? "w-full max-w-5xl rounded-[2rem]" : "w-[380px] rounded-[3rem] border-[10px] border-gray-900 h-[750px]"
                }`}>

                    {/* Mock Portal Header */}
                    <div className="bg-white border-b border-gray-50 py-4 px-8 flex justify-between items-center sticky top-0 z-20">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-[#F97316] rounded-lg flex items-center justify-center text-white font-black text-[10px]">P</div>
                            <span className="font-black text-sm tracking-tighter text-gray-900 uppercase">Pathway</span>
                        </div>
                        <div className="flex gap-4">
                            <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-100" />
                        </div>
                    </div>

                    {/* Page Content */}
                    <div className="flex-1 overflow-auto bg-[#FDFCFB]">
                        {page === "jd" ? (
                            /* ─────────────── JOB DESCRIPTION PAGE (MODERNIZED) ─────────────── */
                            <main className="container mx-auto px-6 py-10 max-w-5xl">
                                <div className="mb-12">
                                    <Button variant="ghost" className="h-10 rounded-xl bg-white/50 border border-gray-100 shadow-sm text-[10px] font-black tracking-[0.1em] text-gray-400 hover:text-gray-900 uppercase px-6">
                                        <ArrowLeft className="h-3.5 w-3.5 mr-2" /> BACK TO OPPORTUNITIES
                                    </Button>
                                </div>

                                <div className={`grid gap-12 items-start ${viewMode === "desktop" ? "lg:grid-cols-3" : "grid-cols-1"}`}>
                                    <div className={`${viewMode === "desktop" ? "lg:col-span-2" : ""} space-y-12`}>
                                        <div className="relative overflow-hidden rounded-[2.5rem] bg-white border border-orange-100/50 shadow-sm p-10">
                                            <div className="relative z-10 space-y-6">
                                                <div className="px-4 py-1.5 rounded-full bg-orange-50 text-[#F97316] text-[9px] font-black uppercase tracking-[0.2em] border border-orange-100/50 w-fit">
                                                    {formData.department || "Engineering"}
                                                </div>
                                                <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-tight">
                                                    {formData.title || "Senior Software Engineer"}
                                                </h1>
                                                <div className="flex flex-wrap gap-8 pt-2">
                                                    <div className="flex items-center gap-3">
                                                        <MapPin className="h-4 w-4 text-orange-400" />
                                                        <div>
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Location</p>
                                                            <p className="text-gray-900 font-bold text-xs">{formData.location || "Remote"}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Clock className="h-4 w-4 text-orange-400" />
                                                        <div>
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Type</p>
                                                            <p className="text-gray-900 font-bold text-xs">{formData.employmentType || "Full-time"}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Briefcase className="h-4 w-4 text-orange-400" />
                                                        <div>
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Experience</p>
                                                            <p className="text-gray-900 font-bold text-xs">{formData.experience || "0-1 years"}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <section className="space-y-6">
                                            <div className="flex items-center gap-2">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />
                                                <h2 className="text-sm font-black text-gray-900 uppercase tracking-[0.2em]">About the Role</h2>
                                            </div>
                                            <div className="text-gray-500 font-medium leading-relaxed whitespace-pre-wrap text-[15px]">
                                                {formData.description || "As a member of our team you will contribute to building world-class products..."}
                                            </div>
                                        </section>

                                        <div className="grid md:grid-cols-2 gap-8">
                                            <div className="p-8 rounded-[2rem] bg-white border border-gray-100 shadow-sm">
                                                <h3 className="text-[10px] font-black text-orange-500 mb-6 uppercase tracking-widest">What you'll do</h3>
                                                <ul className="space-y-3">
                                                    {responsibilities.map((r: string, i: number) => (
                                                        <li key={i} className="flex items-start gap-3 text-xs font-bold text-gray-600">
                                                            <span className="h-1 w-1 rounded-full bg-orange-400 mt-2 shrink-0" />{r}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="p-8 rounded-[2rem] bg-gray-900 text-white">
                                                <h3 className="text-[10px] font-black text-orange-400 mb-6 uppercase tracking-widest">What we look for</h3>
                                                <ul className="space-y-3">
                                                    {skills.map((s: string, i: number) => (
                                                        <li key={i} className="flex items-start gap-3 text-xs font-bold text-gray-300">
                                                            <span className="h-1 w-1 rounded-full bg-orange-400 mt-2 shrink-0" />{s}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="p-8 rounded-[2.5rem] bg-white border border-orange-100 shadow-[0_20px_50px_rgba(249,115,22,0.08)] space-y-12 transition-all">
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-black text-gray-900">Ready to contribute?</h3>
                                                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">Apply for <span className="text-[#F97316]">{formData.title || "the role"}</span></p>
                                            </div>
                                            <div className="space-y-3">
                                                <Button
                                                    onClick={() => setPage("apply")}
                                                    className="w-full h-14 bg-[#F97316] hover:bg-orange-600 text-white text-xl italic font-black rounded-2xl shadow-lg tracking-[0.15em] transition-all"
                                                >
                                                    APPLY NOW
                                                </Button>
                                                <div className="flex gap-2">
                                                    <Button variant="outline" className="flex-1 h-11 rounded-xl border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-all">
                                                        VIEW FULL JD
                                                    </Button>
                                                    <Button variant="outline" className="flex-1 h-11 rounded-xl border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-all">
                                                        SHARE THIS ROLE
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-8 rounded-[2.5rem] bg-gray-900 text-white shadow-xl">
                                            <h4 className="text-[10px] font-black text-orange-400 mb-8 uppercase tracking-[0.2em] flex items-center gap-3">
                                                <span className="h-1 w-1 bg-orange-500 rounded-full" />
                                                HIRING PROCESS
                                            </h4>
                                            <div className="space-y-0 relative">
                                                {["Resume Screening", "Voice AI Interview", "Final Round", "Offer"].map((label, i, arr) => (
                                                    <div key={i} className="flex gap-5 pb-8 last:pb-0 relative group">
                                                        {i !== arr.length - 1 && <div className="absolute left-3.5 top-8 bottom-0 w-px bg-gray-800" />}
                                                        <div className="h-7 w-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black text-[10px] z-10">{i + 1}</div>
                                                        <div className="pt-1">
                                                            <p className="text-[10px] font-black text-gray-100 uppercase tracking-widest">{label}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </main>
                        ) : (
                            /* ─────────────── APPLICATION FORM (SINGLE PAGE SPA) ─────────────── */
                            <div className="min-h-full bg-[#FDFCFB] animate-in-fade">
                                <main className="container mx-auto px-6 py-12 max-w-4xl space-y-10">
                                    <div className="space-y-10">
                                        <Button 
                                            variant="ghost" 
                                            onClick={() => setPage("jd")}
                                            className="h-10 rounded-xl bg-white/50 border border-gray-100 shadow-sm text-[10px] font-black tracking-[0.1em] text-gray-400 hover:text-gray-900 uppercase px-6"
                                        >
                                            <ArrowLeft className="h-3.5 w-3.5 mr-2" /> Back to Job
                                        </Button>
                                        <div className="space-y-4">
                                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                                                Apply for <span className="text-[#F97316]">{formData.title || "Job Role"}</span>
                                            </h1>
                                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">CANDIDATE APPLICATION PORTAL</p>
                                        </div>
                                    </div>

                                    <div className="space-y-12">
                                        {/* Resume Section (Unified First) */}
                                        <section className="bg-white rounded-[2.5rem] border border-orange-100/50 shadow-sm overflow-hidden transition-all">
                                            <div className="p-8 lg:p-10 space-y-8">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 rounded-xl bg-orange-50 text-[#F97316]">
                                                        <FileText className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Resume Upload *</h2>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Required to parse and pre-fill details</p>
                                                    </div>
                                                </div>
                                                <div className="border-2 border-dashed border-gray-100 rounded-2xl p-12 text-center space-y-4 hover:border-orange-200 transition-all cursor-pointer bg-gray-50/20">
                                                    <div className="h-12 w-12 rounded-2xl bg-white shadow-sm border border-gray-50 flex items-center justify-center text-gray-300 mx-auto">
                                                        <Upload className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-900">Drop your resume here</p>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">PDF or DOCX (Max 5MB)</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Personal Info */}
                                        <section className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8 lg:p-10 space-y-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 rounded-xl bg-gray-50 text-gray-400">
                                                    <UserCircle className="w-5 h-5" />
                                                </div>
                                                <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Personal Information</h2>
                                            </div>
                                            <div className="grid md:grid-cols-2 gap-8">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name *</label>
                                                    <div className={inputClass}>John Doe</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address *</label>
                                                    <div className={inputClass}>john@example.com</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Number *</label>
                                                    <div className={inputClass}>+1 (555) 000-0000</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Current Location *</label>
                                                    <div className={inputClass}>San Francisco, CA</div>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Professional Info */}
                                        <section className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8 lg:p-10 space-y-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 rounded-xl bg-gray-50 text-gray-400">
                                                    <Target className="w-5 h-5" />
                                                </div>
                                                <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Professional Details</h2>
                                            </div>
                                            <div className="grid md:grid-cols-2 gap-8">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Experience (Yrs) *</label>
                                                    <div className={inputClass}>e.g. 5</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Notice Period *</label>
                                                    <div className={inputClass}>Immediate</div>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Custom Fields (Dynamic) */}
                                        {regFieldCount > 6 && (
                                            <section className="bg-white rounded-[2.5rem] border border-orange-50 shadow-sm p-8 lg:p-10 space-y-8">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 rounded-xl bg-orange-50/50 text-[#F97316]">
                                                        <Plus className="w-5 h-5" />
                                                    </div>
                                                    <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Additional Questions</h2>
                                                </div>
                                                <div className="space-y-8">
                                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest italic text-center py-4 border border-dashed border-gray-100 rounded-2xl">
                                                        Your {regFieldCount - 6} custom questions will appear here
                                                    </p>
                                                </div>
                                            </section>
                                        )}

                                        {/* Review & Submit */}
                                        <section className="bg-gray-900 rounded-[3rem] p-10 lg:p-14 space-y-10 text-white">
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3">
                                                    <ShieldCheck className="w-6 h-6 text-orange-400" />
                                                    <h2 className="text-xl font-black tracking-tight italic uppercase">Final Submission</h2>
                                                </div>
                                                <div className="flex flex-col gap-6">
                                                    <div className="flex items-start gap-4 p-5 rounded-2xl border border-white/10 bg-white/5">
                                                        <div className="h-5 w-5 rounded border-2 border-orange-500 mt-1 shrink-0 bg-orange-500 flex items-center justify-center">
                                                            <CheckCircle2 className="w-3 h-3 text-white" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold">I agree to the terms and data processing policy *</p>
                                                            <p className="text-[11px] text-gray-400 mt-1">By submitting, you allow us to process your profile using Lumoscale AI for this recruitment drive.</p>
                                                        </div>
                                                    </div>
                                                    <Button 
                                                        disabled 
                                                        className="h-16 w-full rounded-[2rem] bg-orange-500 text-white text-xl italic font-black tracking-[0.2em] shadow-2xl shadow-orange-500/20 opacity-90"
                                                    >
                                                        SUBMIT APPLICATION
                                                    </Button>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                </main>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .animate-in-fade { animation: fade-in 0.4s ease-out forwards; }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
}

function CheckCircle2({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
    );
}
