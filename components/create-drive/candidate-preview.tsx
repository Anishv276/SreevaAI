"use client";

import { useState } from "react";
import { X, Smartphone, Monitor, ChevronLeft, ChevronRight, MapPin, Clock, Briefcase, Share2, ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CandidatePreviewProps {
    formData: any;
    regFieldCount: number;
    onClose: () => void;
}

const STEPS = ["Personal Info", "Professional Details", "Resume & Review"];

export function CandidatePreview({ formData, regFieldCount, onClose }: CandidatePreviewProps) {
    const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
    const [page, setPage] = useState<"jd" | "apply">("jd");
    const [applyStep, setApplyStep] = useState(0);

    const responsibilities = formData.responsibilities
        ? formData.responsibilities.split("\n").filter((l: string) => l.trim().length > 0)
        : ["Build scalable AI solutions", "Collaborate with cross-functional teams", "Design and implement new features"];
    const skills = formData.skills
        ? formData.skills.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : ["React", "Node.js", "TypeScript", "Next.js"];

    const inputClass = "h-12 w-full rounded-2xl border border-gray-100 bg-gray-50/30 px-4 text-sm font-medium text-gray-300 placeholder:text-gray-200 flex items-center";

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-gray-900/60 backdrop-blur-xl animate-in-fade">
            {/* Simulation Control Bar */}
            <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-gray-100 shadow-sm z-50 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 flex items-center justify-center bg-orange-100 rounded-xl shadow-inner">
                        <Monitor className="w-6 h-6 text-[#F97316]" />
                    </div>
                    <div>
                        <h2 className="text-base font-black text-gray-900 leading-tight tracking-tight uppercase">Live Candidate Simulation</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                            <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] leading-none">
                                {page === "jd" ? "Job Description" : `Application — Step ${applyStep + 1} / 3: ${STEPS[applyStep]}`}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex bg-gray-50 border border-gray-100 p-1.5 rounded-2xl shadow-inner">
                    <button
                        onClick={() => setViewMode("desktop")}
                        className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 ${viewMode === "desktop" ? "bg-white text-gray-900 shadow-md border border-gray-100" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        <Monitor className="w-4 h-4" /> Desktop
                    </button>
                    <button
                        onClick={() => setViewMode("mobile")}
                        className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 ${viewMode === "mobile" ? "bg-white text-gray-900 shadow-md border border-gray-100" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        <Smartphone className="w-4 h-4" /> Mobile
                    </button>
                </div>

                <button
                    onClick={onClose}
                    className="h-12 w-12 flex items-center justify-center border border-gray-100 hover:bg-gray-50 rounded-2xl transition-all group"
                >
                    <X className="w-6 h-6 text-gray-400 group-hover:text-red-500 transition-colors" />
                </button>
            </div>

            {/* Viewport Area */}
            <div className="flex-1 overflow-auto p-10 flex justify-center items-start bg-gray-100/30">
                <div className={`transition-all duration-700 ease-out bg-white shadow-[0_60px_150px_rgba(0,0,0,0.15)] border border-gray-200/50 overflow-hidden flex flex-col ${
                    viewMode === "desktop" ? "w-full max-w-5xl rounded-[3rem]" : "w-[400px] rounded-[4rem] border-[12px] border-gray-900"
                }`}>

                    {/* Mock Portal Header */}
                    <div className="bg-white border-b border-gray-50 py-5 px-8 flex justify-between items-center sticky top-0 z-20">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-[#F97316] rounded-lg rotate-12 flex items-center justify-center text-white font-black text-xs">P</div>
                            <span className="font-black tracking-tighter text-gray-900">PATHWAY</span>
                        </div>
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100" />
                        </div>
                    </div>

                    {/* Page Content */}
                    <div className="flex-1 overflow-auto bg-[#FDFCFB]">

                        {page === "jd" ? (
                            /* ─────────────── JOB DESCRIPTION PAGE ─────────────── */
                            <main className="container mx-auto px-6 py-10 max-w-6xl">
                                <div className="mb-8">
                                    <div className="inline-flex items-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                        <ArrowLeft className="h-3.5 w-3.5 mr-2" /> BACK TO OPPORTUNITIES
                                    </div>
                                </div>

                                <div className={`grid gap-12 items-start ${viewMode === "desktop" ? "lg:grid-cols-3" : "grid-cols-1"}`}>
                                    {/* Left */}
                                    <div className={`${viewMode === "desktop" ? "lg:col-span-2" : ""} space-y-12`}>
                                        {/* Hero */}
                                        <div className="relative overflow-hidden rounded-[2.5rem] bg-white border border-orange-100 shadow-[0_15px_40px_rgba(249,115,22,0.06)] p-10">
                                            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-50 to-transparent rounded-full -mr-32 -mt-32 opacity-50" />
                                            <div className="relative z-10 space-y-6">
                                                <div className="px-4 py-1.5 rounded-full bg-orange-100/50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] border border-orange-200/50 w-fit">
                                                    {formData.department || "Engineering"}
                                                </div>
                                                <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-tight">
                                                    {formData.title || "Senior Software Engineer"}
                                                </h1>
                                                <div className="flex flex-wrap gap-8 pt-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-xl bg-orange-50 text-[#F97316] border border-orange-100"><MapPin className="h-4 w-4" /></div>
                                                        <div>
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Location</p>
                                                            <p className="text-gray-900 font-bold text-xs">{formData.location || "Remote"}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-xl bg-orange-50 text-[#F97316] border border-orange-100"><Clock className="h-4 w-4" /></div>
                                                        <div>
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Type</p>
                                                            <p className="text-gray-900 font-bold text-xs">{formData.employmentType || "Full-time"}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-xl bg-orange-50 text-[#F97316] border border-orange-100"><Briefcase className="h-4 w-4" /></div>
                                                        <div>
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Experience</p>
                                                            <p className="text-gray-900 font-bold text-xs">{formData.experience || "0-1 years"}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* About */}
                                        <div className="space-y-12 px-2">
                                            <section className="space-y-6">
                                                <div className="flex items-center gap-4">
                                                    <span className="h-8 w-1.5 bg-[#F97316] rounded-full" />
                                                    <h2 className="text-xl font-black text-gray-900 tracking-tight">About the Role</h2>
                                                </div>
                                                <div className="text-gray-500 font-medium leading-relaxed whitespace-pre-wrap text-[15px]">
                                                    {formData.description || "As a member of our team you will contribute to building world-class products..."}
                                                </div>
                                            </section>

                                            <section className="space-y-8">
                                                <div className="flex items-center gap-4">
                                                    <span className="h-8 w-1.5 bg-[#F97316] rounded-full" />
                                                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Requirements & Responsibilities</h2>
                                                </div>
                                                <div className="grid md:grid-cols-2 gap-8">
                                                    <div className="p-8 rounded-[2rem] bg-white border border-gray-100 shadow-sm">
                                                        <h3 className="text-xs font-black text-[#F97316] mb-6 uppercase tracking-widest">What you'll do</h3>
                                                        <ul className="space-y-3">
                                                            {responsibilities.map((r: string, i: number) => (
                                                                <li key={i} className="flex items-start gap-3 text-xs font-bold text-gray-600">
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />{r}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    <div className="p-8 rounded-[2rem] bg-gray-900 text-white shadow-xl">
                                                        <h3 className="text-xs font-black text-orange-400 mb-6 uppercase tracking-widest">What we look for</h3>
                                                        <ul className="space-y-3">
                                                            {skills.map((s: string, i: number) => (
                                                                <li key={i} className="flex items-start gap-3 text-xs font-bold text-gray-300">
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />{s}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </section>
                                        </div>
                                    </div>

                                    {/* Right Sidebar */}
                                    <div className="space-y-8">
                                        <div className="p-8 rounded-[2.5rem] bg-white border border-gray-100 shadow-sm space-y-6">
                                            <div className="space-y-1">
                                                <h3 className="text-xl font-black text-gray-900">Ready to shape the future?</h3>
                                                <p className="text-[11px] text-gray-500 font-bold">Join us in building the next generation of AI-driven tools.</p>
                                            </div>
                                            <div className="space-y-3">
                                                <Button
                                                    onClick={() => { setPage("apply"); setApplyStep(0); }}
                                                    className="w-full h-14 bg-[#F97316] hover:bg-orange-600 text-white font-black rounded-2xl shadow-lg uppercase tracking-widest"
                                                >
                                                    APPLY NOW
                                                </Button>
                                                <Button variant="outline" className="w-full h-12 rounded-2xl border-gray-100 text-gray-500 font-bold hover:bg-orange-50 hover:text-[#F97316]">
                                                    <Share2 className="h-4 w-4 mr-2" /> SHARE THIS ROLE
                                                </Button>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest pt-2 border-t border-gray-50">
                                                <span>Applications are open</span>
                                                <span className="h-2 w-2 rounded-full bg-green-500 block" />
                                            </div>
                                        </div>

                                        <div className="p-8 rounded-[2.5rem] bg-gray-900 text-white shadow-2xl">
                                            <h4 className="text-[11px] font-black text-orange-400 mb-8 uppercase tracking-[0.2em] flex items-center gap-3">
                                                <span className="h-4 w-1 bg-orange-500 rounded-full" />
                                                HIRING PROCESS
                                            </h4>
                                            <div className="space-y-0 relative">
                                                {["Resume Screening", "Voice AI Interview", "Technical Round", "Final Offer"].map((label, i, arr) => (
                                                    <div key={i} className="flex gap-5 pb-8 last:pb-0 relative group">
                                                        {i !== arr.length - 1 && <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-gray-800" />}
                                                        <div className="h-8 w-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-xs z-10 shadow-[0_0_15px_rgba(249,115,22,0.3)]">{i + 1}</div>
                                                        <div className="pt-1.5">
                                                            <p className="text-[10px] font-black text-gray-100 uppercase tracking-widest group-hover:text-orange-400 transition-colors">{label}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </main>

                        ) : (
                            /* ─────────────── APPLICATION FORM ─────────────── */
                            <div className="min-h-full bg-[#FDFCFB]">
                                <main className="container mx-auto px-4 py-12 max-w-4xl">
                                    {/* Header */}
                                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 px-2">
                                        <div className="space-y-3">
                                            <div
                                                onClick={() => setPage("jd")}
                                                className="group inline-flex items-center text-[10px] font-black tracking-[0.2em] text-gray-400 hover:text-[#F97316] transition-all uppercase cursor-pointer"
                                            >
                                                <ArrowLeft className="h-3 w-3 mr-2 transition-transform group-hover:-translate-x-1" />
                                                Back to Job Details
                                            </div>
                                            <h1 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">
                                                Apply for <span className="text-[#F97316]">{formData.title || "Job Role"}</span>
                                            </h1>
                                        </div>
                                    </div>

                                    <div className="grid gap-10">
                                        {/* Stepper */}
                                        <div className="bg-white rounded-[2rem] border border-orange-100/50 shadow-[0_10px_40px_rgba(249,115,22,0.05)] p-8 lg:p-10">
                                            <div className="relative flex justify-between items-center max-w-lg mx-auto">
                                                <div className="absolute top-5 left-0 w-full h-[2px] bg-gray-100 z-0" />
                                                {STEPS.map((s, i) => (
                                                    <div key={i} className="relative z-10 flex flex-col items-center gap-3">
                                                        <div className={`h-10 w-10 rounded-full flex items-center justify-center font-black text-sm border-2 transition-all ${
                                                            i < applyStep
                                                                ? "bg-[#F97316] border-[#F97316] text-white shadow-lg shadow-orange-100"
                                                                : i === applyStep
                                                                ? "bg-white border-[#F97316] text-[#F97316] shadow-lg shadow-orange-100 scale-110"
                                                                : "bg-gray-50 border-gray-100 text-gray-300"
                                                        }`}>
                                                            {i + 1}
                                                        </div>
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${i === applyStep ? "text-[#F97316]" : i < applyStep ? "text-gray-500" : "text-gray-300"}`}>{s}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Form Card */}
                                        <div className="relative">
                                            <div className="absolute -inset-1 bg-gradient-to-r from-orange-100 to-orange-50 rounded-[3rem] blur-2xl opacity-20" />
                                            <div className="relative bg-white rounded-[2.5rem] border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.04)] overflow-hidden">
                                                <div className="p-8 lg:p-12">

                                                    {/* ── STEP 1: Personal Info ── */}
                                                    {applyStep === 0 && (
                                                        <div className="space-y-12">
                                                            {/* Smart Extraction */}
                                                            <div className="space-y-6">
                                                                <div className="flex items-center gap-4">
                                                                    <span className="h-2 w-2 rounded-full bg-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                                                                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Step 0: Smart Extraction</p>
                                                                </div>
                                                                <div className="bg-orange-50/30 rounded-[2rem] p-6 border border-orange-100/50">
                                                                    <p className="text-sm font-bold text-gray-900 mb-4">Upload your resume to let Lumoscale AI auto-fill your details.</p>
                                                                    <div className="border-2 border-dashed border-gray-200 rounded-[1.5rem] p-10 flex flex-col items-center gap-4 bg-white hover:border-orange-200 transition-all cursor-pointer">
                                                                        <div className="p-4 bg-orange-50 rounded-2xl text-[#F97316]">
                                                                            <Upload className="w-7 h-7" />
                                                                        </div>
                                                                        <div className="text-center">
                                                                            <p className="text-sm font-black text-gray-900">Upload Resume</p>
                                                                            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">PDF, DOCX (MAX 5MB)</p>
                                                                        </div>
                                                                        <Button variant="outline" className="h-9 rounded-xl border-gray-100 text-[#F97316] font-black text-[10px] px-5 uppercase tracking-widest hover:bg-orange-50">
                                                                            Browse Files
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Personal Details divider */}
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />
                                                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">Personal Details</span>
                                                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />
                                                            </div>

                                                            {/* Fields */}
                                                            <div className="grid gap-8 md:grid-cols-2">
                                                                <div className="space-y-3">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Full Name *</label>
                                                                    <div className={inputClass}>John Doe</div>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Email Address *</label>
                                                                    <div className={inputClass}>john@example.com</div>
                                                                </div>
                                                            </div>
                                                            <div className="grid gap-8 md:grid-cols-2">
                                                                <div className="space-y-3">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Phone Number *</label>
                                                                    <div className={inputClass}>+1 (555) 000-0000</div>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Current Location *</label>
                                                                    <div className={inputClass}>City, Country</div>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-3">
                                                                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Portfolio / LinkedIn / Website</label>
                                                                <div className={inputClass}>https://...</div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* ── STEP 2: Professional Details ── */}
                                                    {applyStep === 1 && (
                                                        <div className="space-y-10">
                                                            <div className="space-y-3">
                                                                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Total Experience (Years) *</label>
                                                                <div className={inputClass}>e.g. 5</div>
                                                            </div>
                                                            <div className="grid gap-8 md:grid-cols-2">
                                                                <div className="space-y-3">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Current Company</label>
                                                                    <div className={inputClass}>Company Name</div>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Current CTC</label>
                                                                    <div className={inputClass}>e.g. $120,000</div>
                                                                </div>
                                                            </div>
                                                            <div className="grid gap-8 md:grid-cols-2">
                                                                <div className="space-y-3">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Notice Period *</label>
                                                                    <div className={`${inputClass} justify-between`}>
                                                                        <span>Select Notice Period</span>
                                                                        <ChevronRight className="w-4 h-4 rotate-90 text-gray-200" />
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Expected CTC *</label>
                                                                    <div className={inputClass}>e.g. $140,000</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* ── STEP 3: Resume & Review ── */}
                                                    {applyStep === 2 && (
                                                        <div className="space-y-12">
                                                            {/* Profile Verification */}
                                                            <div className="space-y-6">
                                                                <div className="flex items-center gap-4">
                                                                    <span className="h-2 w-2 rounded-full bg-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                                                                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">Final Step: Profile Verification</p>
                                                                </div>
                                                                <div className="bg-orange-50/30 rounded-[2.5rem] p-8 border border-orange-100/50">
                                                                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-4 block">Your Resume / CV *</label>
                                                                    <div className="border-2 border-dashed border-gray-200 rounded-[1.5rem] p-10 flex flex-col items-center gap-4 bg-white hover:border-orange-200 transition-all cursor-pointer">
                                                                        <div className="p-4 bg-orange-50 rounded-2xl text-[#F97316]">
                                                                            <Upload className="w-7 h-7" />
                                                                        </div>
                                                                        <div className="text-center">
                                                                            <p className="text-sm font-black text-gray-900">Upload Resume</p>
                                                                            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">PDF, DOCX (MAX 5MB)</p>
                                                                        </div>
                                                                        <Button variant="outline" className="h-9 rounded-xl border-gray-100 text-[#F97316] font-black text-[10px] px-5 uppercase tracking-widest hover:bg-orange-50">
                                                                            Browse Files
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Cover Letter */}
                                                            <div className="space-y-4">
                                                                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Cover Letter / Message (Optional)</label>
                                                                <div className="min-h-[150px] w-full rounded-[2rem] border border-gray-100 bg-gray-50/30 px-6 py-4 text-sm font-medium text-gray-200 flex items-start">
                                                                    Tell us why you're a perfect fit for this role...
                                                                </div>
                                                            </div>

                                                            {/* Terms */}
                                                            <div className="flex items-start space-x-3 p-6 rounded-2xl bg-gray-50/50 border border-gray-100">
                                                                <div className="h-5 w-5 rounded border-2 border-gray-200 mt-0.5 shrink-0" />
                                                                <div className="grid gap-1.5 leading-none">
                                                                    <label className="text-sm font-bold text-gray-900 cursor-pointer">I agree to the terms and data processing policy</label>
                                                                    <p className="text-xs text-gray-500 font-medium">By submitting, you allow us to process your profile using Lumoscale AI for this recruitment drive.</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Footer Nav */}
                                                <div className="bg-gray-50/50 border-t border-gray-100 px-8 lg:px-12 py-8 flex items-center justify-between gap-4">
                                                    <Button
                                                        variant="ghost"
                                                        onClick={() => applyStep === 0 ? setPage("jd") : setApplyStep(s => s - 1)}
                                                        className="h-12 px-6 rounded-xl text-gray-500 font-bold hover:bg-white hover:text-[#F97316] transition-all"
                                                    >
                                                        <ChevronLeft className="h-5 w-5 mr-2" /> Back
                                                    </Button>

                                                    {applyStep < 2 ? (
                                                        <Button
                                                            onClick={() => setApplyStep(s => s + 1)}
                                                            className="h-12 px-8 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-black shadow-lg shadow-orange-200 transition-all hover:translate-y-[-2px]"
                                                        >
                                                            Next Step <ChevronRight className="h-5 w-5 ml-2" />
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            disabled
                                                            className="h-12 px-10 rounded-xl bg-gray-900 text-white font-black shadow-xl opacity-50 cursor-not-allowed"
                                                        >
                                                            Submit Application
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </main>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
