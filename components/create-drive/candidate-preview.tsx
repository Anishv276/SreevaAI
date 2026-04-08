"use client";

import { useState } from "react";
import { Monitor, Smartphone, X, MapPin, Briefcase, Clock, FileText, Target, UserCircle, Bot, ArrowLeft, Upload, ShieldCheck, Plus, Sparkles, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CandidatePreviewProps {
    formData: any;
    customFields?: any[];
    regFieldCount: number;
    onClose: () => void;
}

export function CandidatePreview({ formData, customFields = [], regFieldCount, onClose }: CandidatePreviewProps) {
    const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");

    const responsibilities = formData.responsibilities
        ? formData.responsibilities.split("\n").filter((l: string) => l.trim().length > 0)
        : ["Build scalable AI solutions", "Collaborate with cross-functional teams", "Design and implement new features"];

    const requirements = formData.requirements
        ? formData.requirements.split("\n").map((s: string) => s.replace(/^[•\-\*]\s*/, '').trim()).filter((s: string) => s.length > 0)
        : ["Bachelor's degree in CS", "3+ years of experience"];

    const skills = formData.skills
        ? formData.skills.indexOf(',') !== -1 
            ? formData.skills.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
            : formData.skills.split("\n").map((s: string) => s.trim().replace(/^[•\-\*]\s*/, '')).filter((s: string) => s.length > 0)
        : ["React", "Node.js", "TypeScript"];

    const [page, setPage] = useState<"jd" | "start" | "apply">("jd");
    const [applyMode, setApplyMode] = useState<"manual" | "resume">("manual");

    const inputClass = "h-12 w-full rounded-2xl border border-gray-100 bg-gray-50/30 px-5 text-sm font-medium text-gray-400 placeholder:text-gray-300 flex items-center transition-all hover:border-orange-100";

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
                                {page === "jd" ? "LIVE PREVIEW: JOB DETAILS" : page === "start" ? "LIVE PREVIEW: START CHOICE" : "LIVE PREVIEW: DYNAMIC APPLICATION PORTAL"}
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

                <div className="flex items-center gap-3">
                    <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50/50 border border-orange-100">
                        <Bot className="w-4 h-4 text-[#F97316]" />
                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Candidate Experience Mode</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-10 w-10 flex items-center justify-center border border-gray-100 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Viewport Area */}
            <div className="flex-1 overflow-auto p-8 flex justify-center items-start bg-gray-100/20">
                <div className={`transition-all duration-500 bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col ${
                    viewMode === "desktop" ? "w-full max-w-5xl rounded-[2.5rem]" : "w-[380px] rounded-[3.5rem] border-[12px] border-gray-900 h-[750px] relative shrink-0"
                }`}>
                    
                    {viewMode === "mobile" && (
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-b-2xl z-50 flex items-center justify-center">
                            <div className="h-1 w-10 bg-gray-800 rounded-full" />
                        </div>
                    )}

                    {/* Mock Portal Header */}
                    <div className="bg-white border-b border-gray-50 py-5 px-8 flex justify-between items-center sticky top-0 z-20">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[#F97316] rounded-xl flex items-center justify-center text-white font-black text-xs shadow-md">P</div>
                            <span className="font-black text-sm tracking-tight text-gray-900 uppercase">Pathway</span>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="hidden md:flex gap-6">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:text-gray-900 transition-colors">Home</span>
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest cursor-pointer">Openings</span>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100" />
                        </div>
                    </div>

                    {/* Page Content */}
                    <div className="flex-1 overflow-auto bg-[#FDFCFB] selection:bg-orange-100 selection:text-orange-900">
                        {page === "jd" ? (
                            /* ─────────────── JOB DESCRIPTION PAGE (PORTED FROM LIVE) ─────────────── */
                            <main className="container mx-auto px-6 py-10 max-w-5xl">
                                <div className="mb-10">
                                    <Button variant="ghost" className="h-10 rounded-xl bg-white/50 border border-gray-100 shadow-sm text-[10px] font-black tracking-[0.1em] text-gray-400 hover:text-gray-900 uppercase px-6">
                                        <ArrowLeft className="h-3.5 w-3.5 mr-2" /> BACK TO JOBS
                                    </Button>
                                </div>

                                <div className={`flex flex-col gap-12 items-start relative ${viewMode === "desktop" ? "lg:flex-row" : ""}`}>
                                    
                                    {/* Left Content */}
                                    <div className="flex-1 space-y-12 pb-12">
                                        <div className="bg-white rounded-[2.5rem] border border-orange-100 p-8 lg:p-12 shadow-[0_20px_50px_rgba(249,115,22,0.05)] relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50/50 rounded-full -mr-32 -mt-32 blur-3xl" />
                                            
                                            <div className="relative z-10 flex flex-col gap-6">
                                                <div className="flex flex-wrap gap-3 items-center">
                                                    <div className="px-4 py-1.5 rounded-full bg-orange-100/50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] border border-orange-200/50 flex items-center gap-2">
                                                        <Building2 className="h-3 w-3" />
                                                        {formData.department || "Engineering"}
                                                    </div>
                                                    <div className="px-4 py-1.5 rounded-full bg-gray-50 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] border border-gray-100 flex items-center gap-2 text-nowrap">
                                                        <Briefcase className="h-3 w-3" />
                                                        {formData.type || "Full-time"}
                                                    </div>
                                                </div>

                                                <h1 className="text-4xl lg:text-5xl font-black text-gray-900 tracking-tight leading-[1.1]">
                                                    {formData.title || "Senior Software Engineer"}
                                                </h1>

                                                <div className="flex flex-wrap gap-8 pt-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center shadow-sm">
                                                            <MapPin className="h-5 w-5" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest leading-none mb-1">Work Location</p>
                                                            <p className="text-gray-900 font-bold text-sm">{formData.location || "Remote"}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shadow-sm">
                                                            <FileText className="h-5 w-5" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest leading-none mb-1">Salary Range</p>
                                                            <p className="text-gray-900 font-bold text-sm">{formData.salary || "Competitive"}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <section className="space-y-6">
                                            <div className="flex items-center gap-3">
                                                <span className="h-10 w-1.5 bg-[#F97316] rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                                                <h2 className="text-2xl font-black text-gray-900 tracking-tight">About the Role</h2>
                                            </div>
                                            <div className="text-gray-600 leading-[1.8] text-base font-medium whitespace-pre-wrap">
                                                {formData.description || "As a member of our team you will contribute to building world-class products..."}
                                            </div>
                                        </section>

                                        <div className={`grid gap-8 pt-4 ${viewMode === "desktop" ? "md:grid-cols-2" : ""}`}>
                                            <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
                                                <div className="flex items-center gap-3 mb-8">
                                                    <div className="h-10 w-10 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center">
                                                        <Target className="h-5 w-5" />
                                                    </div>
                                                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">What you'll do</h3>
                                                </div>
                                                <ul className="space-y-4">
                                                    {responsibilities.map((r: string, i: number) => (
                                                        <li key={i} className="flex items-start gap-4 text-gray-600 font-medium text-sm leading-relaxed">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />{r}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm relative overflow-hidden group/who">
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full blur-3xl opacity-50" />
                                                <div className="flex items-center gap-3 mb-8 relative z-10">
                                                    <div className="h-10 w-10 rounded-xl bg-gray-50 text-[#F97316] flex items-center justify-center border border-gray-100">
                                                        <UserCircle className="h-5 w-5" />
                                                    </div>
                                                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Who you are</h3>
                                                </div>
                                                <ul className="space-y-4 relative z-10">
                                                    {requirements.map((r: string, i: number) => (
                                                        <li key={i} className="flex items-start gap-4 text-gray-600 font-medium text-sm leading-relaxed">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />{r}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>

                                        {skills.length > 0 && (
                                            <section className="space-y-8 pt-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="h-10 w-1.5 bg-orange-500 rounded-full shadow-lg" />
                                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Required Skills</h2>
                                                </div>
                                                <div className="flex flex-wrap gap-3">
                                                    {skills.map((s: string, i: number) => (
                                                        <div key={i} className="px-6 py-3 rounded-2xl bg-orange-50/50 border border-orange-100 text-[#F97316] font-bold text-sm">
                                                            {s}
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}
                                    </div>

                                    {/* Sidebar Content */}
                                    <aside className="w-full lg:w-[380px] space-y-6 lg:sticky lg:top-24">
                                        <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm space-y-8 relative overflow-hidden">
                                            <div className="space-y-4 relative z-10">
                                                <h3 className="text-2xl font-black text-gray-900 leading-tight">Ready to build?</h3>
                                                <p className="text-gray-500 font-medium text-sm leading-relaxed">Join a team that values speed and high-fidelity engineering.</p>
                                            </div>
                                            <div className="space-y-3 relative z-10">
                                                <Button
                                                    onClick={() => setPage("start")}
                                                    className="w-full h-16 bg-[#F97316] hover:bg-orange-600 text-white text-xl italic font-black rounded-2xl shadow-lg tracking-[0.1em] transition-all"
                                                >
                                                    APPLY NOW
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="p-8 rounded-[2.5rem] bg-gray-900 text-white shadow-xl">
                                            <h4 className="text-[10px] font-black text-orange-400 mb-8 uppercase tracking-[0.2em] flex items-center gap-3">
                                                <span className="h-1 w-1 bg-orange-500 rounded-full" />
                                                HIRING PROCESS
                                            </h4>
                                            <div className="flex flex-col gap-6">
                                                {[
                                                    { title: "Review", desc: "Expert evaluation" },
                                                    { title: "Voice AI", desc: "Interactive screening" },
                                                    { title: "Technical", desc: "Deep dive round" },
                                                    { title: "Onboarding", desc: "Success!" }
                                                ].map((step, i, arr) => (
                                                    <div key={i} className="flex gap-5 relative group">
                                                        {i !== arr.length - 1 && <div className="absolute left-3.5 top-8 bottom-[-1.5rem] w-px bg-gray-800" />}
                                                        <div className="h-7 w-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black text-[10px] z-10 shrink-0">{i + 1}</div>
                                                        <div className="pt-0.5">
                                                            <p className="text-[10px] font-black text-gray-100 uppercase tracking-widest">{step.title}</p>
                                                            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1">{step.desc}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </aside>
                                </div>
                            </main>
                        ) : page === "start" ? (
                             /* ─────────────── START CHOICE PAGE (PORTED FROM LIVE) ─────────────── */
                             <div className="flex flex-col items-center justify-center p-8 min-h-full space-y-12 animate-in-fade">
                                <div className="text-center space-y-4 max-w-md">
                                    <button 
                                        onClick={() => setPage("jd")}
                                        className="inline-flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-gray-600 transition-colors mb-4 uppercase tracking-widest"
                                    >
                                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Job Details
                                    </button>
                                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">How would you like to start?</h1>
                                    <p className="text-gray-500 text-sm font-medium">Choose a method to configure your application for <span className="text-[#F97316]">{formData.title || "this role"}</span>.</p>
                                </div>

                                <div className={`grid gap-8 w-full max-w-4xl px-4 ${viewMode === "desktop" ? "md:grid-cols-2" : ""}`}>
                                    <div 
                                        onClick={() => { setApplyMode("manual"); setPage("apply"); }}
                                        className="group relative flex flex-col items-center gap-6 p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] cursor-pointer"
                                    >
                                        <div className="h-16 w-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:rotate-6">
                                            <UserCircle className="h-8 w-8" />
                                        </div>
                                        <div className="space-y-2 text-center">
                                            <h3 className="text-xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">Fill Manually</h3>
                                            <p className="text-gray-500 text-xs leading-relaxed">Enter all details from scratch using our step-by-step form.</p>
                                        </div>
                                    </div>

                                    <div 
                                        onClick={() => { setApplyMode("resume"); setPage("apply"); }}
                                        className="group relative flex flex-col items-center gap-6 p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] cursor-pointer"
                                    >
                                        <div className="h-16 w-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:-rotate-6">
                                            <Sparkles className="h-8 w-8" />
                                        </div>
                                        <div className="space-y-2 text-center">
                                            <h3 className="text-xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">Scan from Resume</h3>
                                            <p className="text-gray-500 text-xs leading-relaxed">Upload your Resume and let our AI auto-fill the entire form for you.</p>
                                        </div>
                                        <div className="absolute -top-3 -right-3 bg-gradient-to-r from-[#F97316] to-orange-400 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">Recommended</div>
                                    </div>
                                </div>
                             </div>
                        ) : (
                            /* ─────────────── APPLICATION FORM (PORTED FROM LIVE) ─────────────── */
                            <div className="min-h-full bg-[#FDFCFB] animate-in-fade">
                                <main className="container mx-auto px-6 py-12 max-w-4xl space-y-10">
                                    <div className="space-y-10">
                                        <Button 
                                            variant="ghost" 
                                            onClick={() => setPage("start")}
                                            className="h-10 rounded-xl bg-white/50 border border-gray-100 shadow-sm text-[10px] font-black tracking-[0.1em] text-gray-400 hover:text-gray-900 uppercase px-6"
                                        >
                                            <ArrowLeft className="h-3.5 w-3.5 mr-2" /> Back
                                        </Button>
                                        <div className="space-y-4">
                                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                                                Apply for <span className="text-[#F97316]">{formData.title || "Job Role"}</span>
                                            </h1>
                                            <div className="flex items-center gap-3">
                                                 <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${applyMode === "resume" ? "bg-orange-100 text-[#F97316]" : "bg-gray-100 text-gray-500"}`}>
                                                    {applyMode === "resume" ? "AI SCAN MODE" : "MANUAL ENTRY"}
                                                 </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden p-8 space-y-16">
                                        
                                        {/* Resume Section */}
                                        <section className="space-y-6">
                                            <div className="flex items-center gap-3">
                                                <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Resume Upload</h3>
                                            </div>
                                            <div className="border-2 border-dashed border-gray-100 rounded-2xl p-10 text-center space-y-4 hover:border-orange-200 transition-all cursor-pointer bg-gray-50/50">
                                                <div className="h-12 w-12 rounded-2xl bg-white shadow-sm border border-gray-50 flex items-center justify-center text-[#F97316] mx-auto">
                                                    <Upload className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-gray-900">Upload your resume</p>
                                                    <p className="text-[9px] text-gray-400 font-black uppercase mt-1">PDF, DOCX (MAX 5MB)</p>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Personal Info */}
                                        <section className="space-y-6">
                                            <div className="flex items-center gap-3">
                                                <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Personal Information</h3>
                                            </div>
                                            <div className={`grid gap-6 ${viewMode === "desktop" ? "md:grid-cols-2" : ""}`}>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name *</label>
                                                    <div className={inputClass}>{applyMode === "resume" ? "John Doe (Extracting...)" : "Enter name..."}</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address *</label>
                                                    <div className={inputClass}>{applyMode === "resume" ? "john@example.com" : "Enter email..."}</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Number *</label>
                                                    <div className={inputClass}>{applyMode === "resume" ? "+1 (555) 000-0000" : "Enter phone..."}</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Current Location *</label>
                                                    <div className={inputClass}>{applyMode === "resume" ? "San Francisco, CA" : "Enter location..."}</div>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Professional Details Section */}
                                        <section className="space-y-6">
                                            <div className="flex items-center gap-3">
                                                <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Professional Details</h3>
                                            </div>
                                            <div className={`grid gap-6 ${viewMode === "desktop" ? "md:grid-cols-2" : ""}`}>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Total Experience (Yrs) *</label>
                                                    <div className={inputClass}>e.g. 5</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Notice Period *</label>
                                                    <div className={inputClass}>Immediate</div>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Custom Fields */}
                                        {regFieldCount > 6 && (
                                            <section className="space-y-6 bg-orange-50/20 p-6 rounded-3xl border border-orange-100/50">
                                                <div className="flex items-center gap-3">
                                                    <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Additional Questions</h3>
                                                </div>
                                                <div className="space-y-8">
                                                    {customFields.length === 0 ? (
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic text-center py-8 border border-dashed border-gray-100 rounded-2xl bg-white">
                                                            Your {regFieldCount - 6} custom questions will appear here
                                                        </p>
                                                    ) : (
                                                        customFields.map((field: any) => (
                                                            <div key={field.id} className="space-y-2">
                                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                                                                    {field.label} {field.required ? "*" : ""}
                                                                </label>
                                                                {field.type === "Short" && <div className={inputClass}>Short Answer...</div>}
                                                                {field.type === "Long" && <div className="h-32 w-full rounded-2xl border border-gray-100 bg-gray-50/30 p-5 text-sm font-medium text-gray-300">Detailed Answer...</div>}
                                                                {field.type === "Yes/No" && (
                                                                    <div className="flex gap-3">
                                                                        <div className="h-10 px-6 rounded-xl border border-orange-200 bg-[#F97316] text-white text-[9px] font-black uppercase tracking-widest flex items-center">Yes</div>
                                                                        <div className="h-10 px-6 rounded-xl border border-gray-100 bg-white text-gray-400 text-[9px] font-black uppercase tracking-widest flex items-center">No</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </section>
                                        )}

                                        {/* Experience Review Section (Education, History etc) */}
                                        <section className="space-y-12">
                                            <div className="flex items-center gap-3">
                                                <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Academic & Career History</h3>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="p-6 border border-gray-100 rounded-2xl bg-gray-50/50 flex items-center justify-between group cursor-default">
                                                     <div>
                                                         <p className="text-[10px] font-black text-[#F97316] uppercase tracking-widest">Academic Entry #1</p>
                                                         <p className="text-xs font-bold text-gray-600 mt-1">Bachelor's Degree in CS • 2018</p>
                                                     </div>
                                                     <Plus className="h-4 w-4 text-gray-300" />
                                                </div>
                                                <div className="p-6 border-2 border-dashed border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 hover:border-orange-200 transition-all cursor-pointer">
                                                     <p className="text-[10px] font-black uppercase tracking-widest">+ Add Professional Experience</p>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Submit Section */}
                                        <section className="bg-gray-900 rounded-[2.5rem] p-10 space-y-10 text-white">
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3">
                                                    <ShieldCheck className="w-6 h-6 text-orange-400" />
                                                    <h2 className="text-xl font-black italic uppercase">Final Submission</h2>
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/5">
                                                        <div className="h-5 w-5 rounded border-2 border-orange-500 mt-1 shrink-0 bg-orange-500 flex items-center justify-center">
                                                            <CheckCircle2 className="w-3 h-3 text-white" />
                                                        </div>
                                                        <p className="text-[11px] font-medium text-gray-300">I agree to the terms and privacy policy for data processing.</p>
                                                    </div>
                                                    <Button 
                                                        disabled 
                                                        className="h-16 w-full rounded-2xl bg-[#F97316] text-white text-xl italic font-black tracking-[0.1em] opacity-90"
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
