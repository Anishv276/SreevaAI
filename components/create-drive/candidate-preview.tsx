
"use client";

import { useState } from "react";
import { 
    Monitor, Smartphone, X, MapPin, Briefcase, FileText, 
    UserCircle2, Bot, ArrowLeft, Upload, 
    ShieldCheck, Plus, Sparkles, Building2, Globe, Users2,
    Clock, Send, Link as LinkIcon, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CandidatePreviewProps {
    formData: any;
    customFields?: any[];
    regFieldCount: number;
    onClose: () => void;
}

export function CandidatePreview({ formData, customFields = [], regFieldCount, onClose }: CandidatePreviewProps) {
    const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
    const [page, setPage] = useState<"jd" | "start" | "apply">("jd");
    const [applyMode, setApplyMode] = useState<"manual" | "resume">("manual");
    const [activeSection, setActiveSection] = useState<"about" | "todo" | "who" | "process">("about");

    const responsibilities = formData.responsibilities
        ? formData.responsibilities.split("\n").filter((l: string) => l.trim().length > 0)
        : ["Build scalable AI solutions", "Collaborate with cross-functional teams", "Design and implement new features"];

    const requirements = formData.requirements
        ? formData.requirements.split("\n").map((s: string) => s.replace(/^[â€¢\-\*]\s*/, '').trim()).filter((s: string) => s.length > 0)
        : ["Bachelor's degree in CS", "3+ years of experience"];

    const skills = formData.skills
        ? formData.skills.indexOf(',') !== -1 
            ? formData.skills.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
            : formData.skills.split("\n").map((s: string) => s.trim().replace(/^[â€¢\-\*]\s*/, '')).filter((s: string) => s.length > 0)
        : ["React", "Node.js", "TypeScript", "Next.js", "PostgreSQL"];

    const inputClass = "h-12 w-full rounded-2xl border border-gray-100 bg-gray-50/50 px-5 text-sm font-medium text-gray-500 placeholder:text-gray-300 flex items-center transition-all hover:border-orange-100 hover:bg-white";

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-gray-900/60 backdrop-blur-xl animate-in-fade select-none">
            {/* Simulation Header - Elite Design */}
            <header className="flex items-center justify-between px-8 py-4 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-xl z-50 shrink-0">
                <div className="flex items-center gap-5">
                    <div className="h-11 w-11 flex items-center justify-center bg-gray-900 rounded-2xl shadow-lg rotate-3 group-hover:rotate-0 transition-transform">
                        <Monitor className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-gray-900 tracking-tight uppercase italic leading-none">Simulation Architecture</h2>
                        <div className="flex items-center gap-2 mt-1.5 opacity-60">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest leading-none">
                                {page === "jd" ? "PHASE: JOB ARCHITECTURE" : page === "start" ? "PHASE: ONBOARDING GATE" : "PHASE: TALENT INGESTION"}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100 shadow-inner">
                    <button
                        onClick={() => setViewMode("desktop")}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 ${viewMode === "desktop" ? "bg-white text-gray-900 shadow-xl shadow-gray-200/50 border border-gray-100" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        <Monitor className="w-4 h-4" /> Desktop
                    </button>
                    <button
                        onClick={() => setViewMode("mobile")}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 ${viewMode === "mobile" ? "bg-white text-gray-900 shadow-xl shadow-gray-200/50 border border-gray-100" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        <Smartphone className="w-4 h-4" /> Mobile
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden lg:flex items-center gap-3 px-5 py-2.5 rounded-xl bg-orange-50/50 border border-orange-100">
                        <Bot className="w-4 h-4 text-[#F97316]" />
                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Candidate Mirror Mode</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-11 w-11 flex items-center justify-center border border-gray-100 bg-white hover:bg-red-50 hover:text-red-500 hover:border-red-100 rounded-2xl transition-all shadow-sm active:scale-95"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Viewport Area - Dark Contrast */}
            <div className="flex-1 overflow-hidden p-6 lg:p-12 flex justify-center items-center bg-[#0F172A]">
                <div className={cn(
                    "transition-all duration-700 ease-out-expo bg-[#FDFCFB] shadow-[0_40px_100px_rgba(0,0,0,0.5)] flex flex-col relative overflow-hidden",
                    viewMode === "desktop" ? "w-full h-full rounded-[3rem]" : "w-[390px] h-[800px] rounded-[4rem] border-[14px] border-gray-900 ring-[12px] ring-gray-800/20"
                )}>
                    
                    {/* Mock Browser/Device UI */}
                    {viewMode === "desktop" ? (
                        <div className="h-8 bg-gray-50 border-b border-gray-100 flex items-center px-6 gap-2 shrink-0">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-400/20 border border-red-400/30" />
                                <div className="w-3 h-3 rounded-full bg-amber-400/20 border border-amber-400/30" />
                                <div className="w-3 h-3 rounded-full bg-emerald-400/20 border border-emerald-400/30" />
                            </div>
                            <div className="flex-1 max-w-sm mx-auto h-5 bg-white border border-gray-100 rounded-lg flex items-center px-3">
                                <div className="w-24 h-1.5 bg-gray-50 rounded-full" />
                            </div>
                        </div>
                    ) : (
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-8 bg-gray-900 rounded-b-[2rem] z-50 flex items-center justify-center">
                            <div className="h-1.5 w-12 bg-gray-800/80 rounded-full" />
                        </div>
                    )}

                    {/* PORTAL HEADER - Exact Mirror */}
                    <div className="bg-white/80 backdrop-blur-md border-b border-orange-100/50 flex justify-between items-center h-16 px-8 sticky top-0 z-30 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-gradient-to-br from-[#F97316] to-orange-400 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                                <Briefcase className="h-4 w-4" />
                            </div>
                            <span className="font-black text-lg tracking-tight text-gray-900 italic">Lumoscale<span className="text-orange-500">.ai</span></span>
                        </div>
                        <div className="flex items-center gap-3">
                             <div className="hidden md:flex items-center px-4 h-8 rounded-full bg-orange-50 border border-orange-100 text-[#F97316] text-[9px] font-black uppercase tracking-widest">Candidate Experience</div>
                             <div className="h-8 w-8 rounded-full bg-gray-50 border border-gray-100" />
                        </div>
                    </div>

                    {/* CONTENT CONTAINER */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-200">
                        {page === "jd" ? (
                            <div className="animate-in-fade duration-500">
                                <main className={cn("mx-auto py-12 px-8 max-w-7xl", viewMode === "mobile" ? "max-w-none px-4" : "")}>
                                    
                                    <div className="mb-10">
                                        <button className="h-10 px-6 rounded-xl border border-gray-100 bg-white/50 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:text-gray-900 transition-all flex items-center gap-2 group">
                                            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-1 transition-transform" /> BACK TO PORTFOLIO
                                        </button>
                                    </div>

                                    <div className={cn(
                                        "flex gap-12 items-start",
                                        viewMode === "desktop" ? "flex-row" : "flex-col"
                                    )}>
                                        {/* Main Content */}
                                        <div className="flex-1 space-y-12 pb-24">
                                            {/* Hero Section */}
                                            <div className="bg-white rounded-[2.5rem] border border-orange-100 p-10 lg:p-14 shadow-[0_30px_70px_rgba(249,115,22,0.04)] relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-80 h-80 bg-orange-50 rounded-full -mr-40 -mt-40 blur-3xl opacity-50" />
                                                <div className="relative z-10 space-y-8">
                                                    <div className="flex flex-wrap gap-4">
                                                        <span className="px-5 py-2 rounded-full bg-orange-50 text-orange-600 text-[10px] font-black uppercase tracking-[0.2em] border border-orange-100/50 flex items-center gap-2">
                                                            <Building2 className="h-3.5 w-3.5" /> {formData.department || "Core Architecture"}
                                                        </span>
                                                        <span className="px-5 py-2 rounded-full bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] border border-gray-100 flex items-center gap-2">
                                                            <Briefcase className="h-3.5 w-3.5" /> {formData.employmentType || "Quantum-Dev"}
                                                        </span>
                                                    </div>
                                                    <h1 className={cn(
                                                        "font-black text-gray-900 tracking-tighter leading-[1] italic",
                                                        viewMode === "desktop" ? "text-6xl" : "text-4xl"
                                                    )}>
                                                        {formData.title || "Elite Neural Engineer"}
                                                    </h1>
                                                    <div className="flex flex-wrap gap-10 pt-4 border-t border-gray-50 mt-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center shadow-inner"><MapPin className="h-5 w-5" /></div>
                                                            <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">HUB</p><p className="text-gray-900 font-bold text-sm tracking-tight">{formData.workMode || "Distributive"}</p></div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-inner"><FileText className="h-5 w-5" /></div>
                                                            <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">TREASURY</p><p className="text-gray-900 font-bold text-sm tracking-tight">{formData.salary || "Performance Driven"}</p></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Description Section */}
                                            <section className="px-6 space-y-8 animate-in-up">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-1.5 bg-[#F97316] rounded-full shadow-[0_0_20px_rgba(249,115,22,0.4)]" />
                                                    <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">The Vision</h2>
                                                </div>
                                                <div className="text-gray-600 leading-[2] text-lg font-medium whitespace-pre-wrap selection:bg-orange-100">
                                                    {formData.description || "Deploying the future requires high-fidelity persistence and architectural excellence node-by-node."}
                                                </div>
                                            </section>

                                            {/* Columns */}
                                            <div className={cn("grid gap-10 pt-6", viewMode === "desktop" ? "md:grid-cols-2" : "")}>
                                                <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm group hover:border-orange-200 transition-all duration-500">
                                                    <div className="flex items-center gap-4 mb-8">
                                                        <div className="h-12 w-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center shadow-sm"><Sparkles className="h-6 w-6" /></div>
                                                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight italic">Operations</h3>
                                                    </div>
                                                    <ul className="space-y-5">
                                                        {responsibilities.map((r: string, i: number) => (
                                                            <li key={i} className="flex items-start gap-4 text-gray-600 font-medium text-[15px] leading-relaxed group/li">
                                                                <span className="h-2 w-2 rounded-full bg-orange-500 mt-2 shrink-0 group-hover/li:scale-150 transition-transform" />{r}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm relative overflow-hidden group hover:border-orange-200 transition-all duration-500">
                                                    <div className="absolute top-0 right-0 w-40 h-40 bg-orange-50 rounded-full blur-3xl opacity-50" />
                                                    <div className="flex items-center gap-4 mb-8 relative z-10">
                                                        <div className="h-12 w-12 rounded-2xl bg-gray-50 text-orange-500 flex items-center justify-center border border-gray-100"><UserCircle2 className="h-6 w-6" /></div>
                                                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight italic">Persona</h3>
                                                    </div>
                                                    <ul className="space-y-5 relative z-10">
                                                        {requirements.map((r: string, i: number) => (
                                                            <li key={i} className="flex items-start gap-4 text-gray-600 font-medium text-[15px] leading-relaxed group/li">
                                                                <span className="h-2 w-2 rounded-full bg-orange-500 mt-2 shrink-0 group-hover/li:scale-150 transition-transform" />{r}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>

                                            {/* Skills */}
                                            {skills.length > 0 && (
                                                <section className="px-6 space-y-10 pt-8 animate-in-up delay-100">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-10 w-1.5 bg-gray-900 rounded-full" />
                                                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight italic">Core Stack</h2>
                                                    </div>
                                                    <div className="flex flex-wrap gap-4">
                                                        {skills.map((s: string, i: number) => (
                                                            <div key={i} className="px-8 py-3.5 rounded-2xl bg-white border border-gray-100 text-gray-900 font-black text-[13px] uppercase tracking-widest shadow-sm hover:shadow-xl hover:border-orange-100 hover:text-orange-500 hover:-translate-y-1 transition-all duration-300">
                                                                {s}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>
                                            )}

                                            {/* Hiring Rituals */}
                                            <section className="px-2 pt-12 animate-in-up delay-200">
                                                <div className="rounded-[4rem] bg-gray-900 p-12 lg:p-16 relative overflow-hidden group/process">
                                                    <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl opacity-50 group-hover/process:scale-125 transition-transform duration-1000" />
                                                    <h4 className="text-lg font-black text-white/40 mb-16 uppercase tracking-[0.3em] flex items-center gap-6 relative z-10 italic">
                                                        <span className="h-9 w-1.5 bg-orange-500 rounded-full shadow-[0_0_20px_rgba(249,115,22,0.6)]" />
                                                        The Hiring Ritual
                                                    </h4>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10 max-w-7xl mx-auto">
                                                        {[
                                                            { title: "Review", desc: "Genesis" },
                                                            { title: "Voice AI", desc: "Interference" },
                                                            { title: "Technical", desc: "Deep Round" },
                                                            { title: "Decision", desc: "Execution" }
                                                        ].map((step, i, arr) => (
                                                            <div key={i} className="flex flex-col items-center text-center group/step">
                                                                <div className="mb-6 h-16 w-16 rounded-3xl bg-white/10 border border-white/5 text-orange-500 flex items-center justify-center font-black text-2xl transition-all group-hover/step:bg-orange-500 group-hover/step:text-white group-hover/step:scale-110 shadow-lg relative z-10 backdrop-blur-md">
                                                                    {i + 1}
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <p className="font-black text-white text-[13px] uppercase tracking-widest">{step.title}</p>
                                                                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">{step.desc}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </section>
                                        </div>

                                        {/* Sidebar - Precision Logic */}
                                        <aside className={cn(
                                            "space-y-8",
                                            viewMode === "desktop" ? "w-[420px] sticky top-32" : "w-full"
                                        )}>
                                            <div className="bg-white rounded-[3rem] p-10 border border-orange-100 shadow-[0_40px_80px_rgba(249,115,22,0.06)] space-y-10 relative overflow-hidden group/apply">
                                                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-orange-600" />
                                                <div className="space-y-4">
                                                    <h3 className="text-3xl font-black text-gray-900 tracking-tight italic">Initiate Application</h3>
                                                    <p className="text-gray-500 font-medium leading-relaxed">Join an elite squad pushing the boundaries of neural recruitment.</p>
                                                </div>
                                                <button
                                                    onClick={() => setPage("start")}
                                                    className="w-full h-18 bg-gray-900 hover:bg-black text-white font-black text-xl italic rounded-[1.5rem] shadow-2xl hover:scale-[1.03] transition-all flex items-center justify-center gap-3 active:scale-95 group/btn"
                                                >
                                                    START MISSION
                                                    <ArrowLeft className="h-6 w-6 rotate-180 group-hover/btn:translate-x-1.5 transition-transform text-orange-500" />
                                                </button>
                                                <div className="pt-8 border-t border-gray-50 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10B981]" />
                                                        <span className="text-[10px] font-black underline decoration-orange-500/30 underline-offset-4 text-gray-900 uppercase tracking-widest leading-none">Accepting Talents</span>
                                                    </div>
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic leading-none">Secure Portal</span>
                                                </div>
                                            </div>

                                            {/* Organization Context */}
                                            <div className="bg-gray-900 rounded-[3rem] p-10 space-y-10 shadow-2xl relative overflow-hidden group/org">
                                                <div className="absolute bottom-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
                                                <div className="flex items-center gap-5 relative z-10">
                                                    <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shadow-inner group-hover/org:rotate-6 transition-transform">
                                                        <Building2 className="h-8 w-8 text-orange-500" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1.5">Architect</h4>
                                                        <p className="text-xl font-black text-white tracking-tight italic">Lumoscale Inc.</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 gap-6 pt-2 border-t border-white/5 mt-8 relative z-10">
                                                    {[
                                                        { label: "Industry", icon: Building2, value: "Neural-Tech" },
                                                        { label: "Deployment", icon: Globe, value: "Global-Cloud" },
                                                        { label: "Population", icon: Users2, value: "256+ Elite" }
                                                    ].map((stat, i) => (
                                                        <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 opacity-70 hover:opacity-100 transition-opacity">
                                                            <div className="flex items-center gap-3">
                                                                <stat.icon className="h-4 w-4 text-orange-500" />
                                                                <span className="text-[11px] font-black text-white/60 uppercase tracking-widest">{stat.label}</span>
                                                            </div>
                                                            <span className="text-xs font-black text-white tracking-tight">{stat.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </aside>
                                    </div>
                                </main>
                            </div>
                        ) : page === "start" ? (
                             <div className="h-full flex flex-col items-center justify-center p-12 bg-white animate-in-fade duration-500 relative">
                                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_0%,rgba(249,115,22,0.03)_0%,transparent_50%)]" />
                                <div className="text-center space-y-6 max-w-xl transition-all relative z-10">
                                    <button 
                                        onClick={() => setPage("jd")}
                                        className="inline-flex items-center gap-3 text-[10px] font-black text-gray-400 hover:text-gray-900 transition-all mb-8 uppercase tracking-[0.2em] group italic"
                                    >
                                        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1.5 transition-transform" /> Back to Intelligence
                                    </button>
                                    <h1 className="text-5xl font-black text-gray-900 tracking-tighter italic leading-none">Synchronize Persona</h1>
                                    <p className="text-gray-500 text-xl font-medium leading-relaxed">Choose an ingestion protocol for <span className="text-orange-500">{formData.title || "this role"}</span>.</p>
                                </div>

                                <div className={cn(
                                    "grid gap-10 w-full max-w-5xl px-8 mt-20 relative z-10",
                                    viewMode === "desktop" ? "md:grid-cols-2" : "grid-cols-1"
                                )}>
                                    <div 
                                        onClick={() => { setApplyMode("manual"); setPage("apply"); }}
                                        className="group relative flex flex-col items-center gap-10 p-14 rounded-[3.5rem] bg-white border-2 border-gray-50 hover:border-orange-200 transition-all duration-700 hover:shadow-[0_40px_100px_rgba(249,115,22,0.08)] hover:-translate-y-3 cursor-pointer overflow-hidden shadow-sm"
                                    >
                                        <div className="h-24 w-24 rounded-[2rem] bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-orange-500 transition-all duration-700 group-hover:rotate-12 group-hover:scale-110 shadow-inner">
                                            <UserCircle2 className="h-10 w-10 shrink-0" />
                                        </div>
                                        <div className="space-y-4 text-center">
                                            <h3 className="text-3xl font-black text-gray-900 group-hover:text-orange-500 transition-colors italic tracking-tight uppercase">Manual Protocol</h3>
                                            <p className="text-gray-500 text-sm font-medium leading-relaxed uppercase tracking-widest opacity-60 px-6">Direct structural input through multi-phase schema entry.</p>
                                        </div>
                                    </div>

                                    <div 
                                        onClick={() => { setApplyMode("resume"); setPage("apply"); }}
                                        className="group relative flex flex-col items-center gap-10 p-14 rounded-[3.5rem] bg-gray-900 shadow-2xl hover:border-orange-500/30 transition-all duration-700 hover:shadow-[0_40px_100px_rgba(249,115,22,0.15)] hover:-translate-y-3 cursor-pointer overflow-hidden ring-1 ring-white/5"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl opacity-50" />
                                        <div className="h-24 w-24 rounded-[2rem] bg-white/5 border border-white/5 flex items-center justify-center text-orange-500 transition-all duration-700 group-hover:rotate-12 group-hover:scale-110 shadow-lg relative z-10 backdrop-blur-md">
                                            <Sparkles className="h-10 w-10 shrink-0" />
                                        </div>
                                        <div className="space-y-4 text-center relative z-10">
                                            <h3 className="text-3xl font-black text-white group-hover:text-orange-500 transition-colors italic tracking-tight uppercase">Neural Scan</h3>
                                            <p className="text-white/40 text-sm font-medium leading-relaxed uppercase tracking-widest px-6">Instant ingestion from Resume PDF using AI OCR architecture.</p>
                                        </div>
                                        <div className="absolute -top-3 -right-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-black uppercase tracking-[0.2em] px-6 py-2 rounded-full shadow-2xl shadow-orange-500/40 border border-white/10 z-20 italic">Recommended</div>
                                    </div>
                                </div>
                             </div>
                        ) : (
                            <div className="min-h-full bg-white animate-in-fade duration-500 pb-20">
                                 <main className="mx-auto px-8 py-16 max-w-5xl space-y-16">
                                    <div className="space-y-10">
                                        <button 
                                            onClick={() => setPage("start")}
                                            className="h-12 px-8 rounded-2xl bg-gray-50 border border-gray-100 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:text-gray-950 hover:bg-white hover:border-orange-100 transition-all flex items-center gap-3 italic group"
                                        >
                                            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1.5 transition-transform" /> Cancel Protocol
                                        </button>
                                        <div className="space-y-4">
                                            <h1 className="text-5xl font-black text-gray-900 tracking-tighter italic italic leading-none">
                                                Application <span className="text-orange-500">Node</span>
                                            </h1>
                                            <div className="flex items-center gap-4 pt-1">
                                                 <span className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border italic ${applyMode === "resume" ? "bg-orange-50/50 border-orange-100 text-orange-600" : "bg-gray-50 border-gray-100 text-gray-400"}`}>
                                                    {applyMode === "resume" ? "AI SCAN ACTIVE" : "MANUAL PERSISTENCE"}
                                                 </span>
                                                 <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Job Drive Code: {formData.title?.slice(0, 3).toUpperCase() || "GEN"}-88</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-24 bg-white/50 border border-gray-100 rounded-[3.5rem] p-10 lg:p-16 shadow-[0_40px_100px_rgba(0,0,0,0.02)]">
                                        
                                        {/* Resume Context */}
                                        <section className="space-y-8 group/res">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-1.5 bg-orange-500 rounded-full" />
                                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight italic">Talent Asset</h3>
                                            </div>
                                            <div className="border-4 border-dashed border-gray-50 rounded-[2.5rem] p-16 text-center space-y-8 group-hover/res:border-orange-100 transition-all cursor-pointer bg-gray-50/20 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50/50 rounded-full blur-3xl opacity-50" />
                                                <div className="h-20 w-20 rounded-3xl bg-white shadow-xl border border-gray-50 flex items-center justify-center text-orange-500 mx-auto transform translate-y-2 group-hover/res:scale-110 group-hover/res:rotate-6 transition-all">
                                                    <Upload className="w-8 h-8" />
                                                </div>
                                                <div className="space-y-2 relative z-10">
                                                    <p className="text-xl font-black text-gray-900 italic tracking-tight uppercase">Upload Ingestion Key</p>
                                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] italic">PDF / DOCX PERSISTENCE REQUIRED</p>
                                                </div>
                                            </div>
                                        </section>

                                        {/* Personal Ingest */}
                                        <section className="space-y-8">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-1.5 bg-gray-900 rounded-full" />
                                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight italic">Ingestion Meta</h3>
                                            </div>
                                            <div className="grid md:grid-cols-2 gap-10">
                                                {[
                                                    { label: "Designation Label", val: applyMode === "resume" ? "John Doe" : "Ingress Identity..." },
                                                    { label: "Comms Channel", val: applyMode === "resume" ? "john@neural.ai" : "Direct Email..." },
                                                    { label: "Ping Number", val: applyMode === "resume" ? "+1 (ELITE) COMMS" : "Comm Line..." },
                                                    { label: "Deployment Hub", val: applyMode === "resume" ? "San Francisco, CA" : "Neural Location..." }
                                                ].map((idx, i) => (
                                                    <div key={i} className="space-y-3 px-2">
                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">{idx.label}</label>
                                                        <div className={inputClass}>{idx.val}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>

                                        {/* Custom Schema */}
                                        {(regFieldCount > 6 || customFields.length > 0) && (
                                            <section className="space-y-10 bg-gray-50/50 p-12 rounded-[3rem] border border-gray-100/50">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-1.5 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.3)]" />
                                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight italic">Custom Inference</h3>
                                                </div>
                                                <div className="space-y-10">
                                                    {customFields.length === 0 ? (
                                                        <div className="py-16 text-center bg-white border border-dashed border-gray-100 rounded-[2rem] flex flex-col items-center gap-4">
                                                            <div className="h-12 w-12 rounded-xl bg-orange-50 text-orange-400 flex items-center justify-center"><Info className="h-6 w-6" /></div>
                                                            <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest italic leading-relaxed">
                                                                SYNCHRONIZING {regFieldCount > 6 ? regFieldCount - 6 : 0} CHILD SCHEMA OBJECTS...
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        customFields.map((field: any) => (
                                                            <div key={field.id} className="space-y-4 px-2 group/field">
                                                                <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest ml-1 flex items-center gap-2 group-hover/field:text-orange-500 transition-colors">
                                                                    {field.label} {field.required ? "*" : ""}
                                                                </label>
                                                                {field.type === "Short" && <div className={inputClass}>Short Answer Buffer...</div>}
                                                                {field.type === "Long" && <div className="h-40 w-full rounded-[2rem] border border-gray-100 bg-gray-50/30 p-8 text-sm font-medium text-gray-400 italic">Detailed Architectural Perspective...</div>}
                                                                {field.type === "Yes/No" && (
                                                                    <div className="flex gap-4">
                                                                        <div className="h-14 px-10 rounded-2xl border border-orange-200 bg-gray-900 text-white text-[11px] font-black uppercase tracking-widest flex items-center shadow-2xl shadow-orange-500/10 active:scale-95 transition-all">Yes.</div>
                                                                        <div className="h-14 px-10 rounded-2xl border border-gray-100 bg-white text-gray-400 text-[11px] font-black uppercase tracking-widest flex items-center hover:bg-gray-50 transition-all">No.</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </section>
                                        )}

                                        {/* Submit Protocol */}
                                        <section className="bg-gray-950 rounded-[4rem] p-14 lg:p-20 space-y-12 text-white relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-orange-500/5 rounded-full blur-[10rem] pointer-events-none" />
                                            <div className="space-y-10 relative z-10 flex flex-col items-center">
                                                <div className="text-center space-y-5">
                                                    <div className="h-20 w-20 rounded-3xl bg-orange-500 flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/20 rotate-3 group-hover:rotate-0 transition-transform">
                                                        <ShieldCheck className="w-10 h-10 text-white" />
                                                    </div>
                                                    <h2 className="text-4xl font-black italic uppercase tracking-tighter">Genesis Submission</h2>
                                                </div>
                                                <div className="w-full max-w-2xl space-y-10">
                                                    <div className="flex items-start gap-6 p-8 rounded-[2rem] border border-white/5 bg-white/5 backdrop-blur-md">
                                                        <div className="p-1 mt-1 shrink-0 bg-transparent border-2 border-orange-500 rounded-md">
                                                            <div className="h-3 w-3 bg-orange-500 rounded-sm" />
                                                        </div>
                                                        <p className="text-sm font-medium text-white/40 leading-[1.8] italic">I acknowledge the algorithmic ingestion protocols and neural processing of my persona data for elite placement evaluation.</p>
                                                    </div>
                                                    <button 
                                                        disabled 
                                                        className="h-20 w-full rounded-[2rem] bg-orange-500 text-white text-2xl italic font-black tracking-[0.1em] opacity-90 shadow-[0_20px_50px_rgba(249,115,22,0.4)] flex items-center justify-center gap-4"
                                                    >
                                                        EXECUTE PROTOCOL
                                                        <Sparkles className="h-6 w-6" />
                                                    </button>
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
                @keyframes fade-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                .animate-in-fade { animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .animate-in-up { animation: up-slide 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes up-slide { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                .delay-100 { animation-delay: 0.1s; }
                .delay-200 { animation-delay: 0.2s; }
                .ease-out-expo { transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
                .scrollbar-thin::-webkit-scrollbar { width: 4px; }
                .scrollbar-thumb-gray-200::-webkit-scrollbar-thumb { background-color: #f1f1f1; border-radius: 20px; }
            `}</style>
        </div>
    );
}


