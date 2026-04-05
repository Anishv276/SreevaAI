"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    ArrowLeft, Download, Mail, Phone, MapPin, Calendar,
    CheckCircle2, XCircle, Sparkles, Zap,
    TrendingUp, AlertTriangle, ChevronRight, ShieldCheck, Terminal, UserSearch,
    MessageSquare, Target, BriefcaseBusiness, Globe, IndianRupee, RefreshCw, Camera, Loader2, User, X, ChevronDown, ChevronUp, EyeOff
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { APITypes } from "plyr-react";
import "plyr-react/plyr.css";
import { useRef } from "react";

const Plyr = dynamic(() => import("plyr-react").then((mod) => mod.Plyr), { ssr: false });

/* ── Circular score ring ─────────────────────────── */
function ScoreRing({ score }: { score: number }) {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const color = score >= 80 ? "#22C55E" : score >= 50 ? "#F97316" : "#EF4444";
    const label = score >= 80 ? "Excellent" : score >= 50 ? "Good Match" : "Weak Match";

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative h-36 w-36 flex items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120" fill="none">
                    <circle cx="60" cy="60" r={radius} stroke="#F3F4F6" strokeWidth="10" />
                    <circle
                        cx="60" cy="60" r={radius}
                        stroke={color}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference - progress}
                        style={{ filter: `drop-shadow(0 0 8px ${color}66)`, transition: "stroke-dashoffset 1s ease" }}
                    />
                </svg>
                <div className="text-center z-10">
                    <span className="text-4xl font-black text-gray-900 leading-none">{score}</span>
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">/ 100</span>
                </div>
            </div>
            <div className={cn(
                "px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest shadow-sm",
                score >= 80 ? "bg-green-50 text-green-700" : score >= 50 ? "bg-orange-50 text-[#F97316]" : "bg-red-50 text-red-600"
            )}>
                {label}
            </div>
        </div>
    );
}

/* ── Main Component ─────────────────────────────── */
export default function CandidateProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const id = resolvedParams.id;
    const [candidate, setCandidate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"analysis" | "interview">("analysis");
    const [resendingInterview, setResendingInterview] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [recordingDurationSec, setRecordingDurationSec] = useState<number | null>(null);
    const [showSubmissionPreview, setShowSubmissionPreview] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const fetchCandidate = async () => {
            try {
                const res = await fetch(`/api/candidates/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setCandidate(data);
                }
            } catch (error) {
                console.error("Failed to fetch candidate", error);
            } finally {
                setLoading(false);
            }
        };
        fetchCandidate();
    }, [id]);

    const handleResendInterview = async () => {
        setResendingInterview(true);
        try {
            const res = await fetch(`/api/candidates/${id}/resend-interview`, { method: "POST" });
            if (res.ok) {
                alert("Interview link resent successfully!");
            } else {
                const err = await res.json();
                alert(err.error || "Failed to resend interview link");
            }
        } catch (error) {
            console.error("Resend interview error:", error);
            alert("Failed to resend interview link.");
        } finally {
            setResendingInterview(false);
        }
    };
    const plyrRef = useRef<APITypes>(null);

    const aiData = candidate?.aiReport ? JSON.parse(candidate.aiReport) : {};
    const structuredResume = candidate?.structuredResume ? (typeof candidate.structuredResume === 'string' ? JSON.parse(candidate.structuredResume) : candidate.structuredResume) : {};
    
    const summary = structuredResume.candidate_summary || aiData.summary || structuredResume.summary || aiData.reasoning || "AI analysis pending for this candidate.";
    const strengths = aiData.strengths || [];
    const weaknesses = aiData.weaknesses || [];
    const score = candidate?.aiScore || 0;
    const normalizedStatus =
        candidate?.status === "Rejected"
            ? "Rejected"
            : candidate?.status === "Borderline"
                ? "Borderline"
                : "Shortlisted";

    const interviewRecordingUrl = candidate?.interview?.interviewRecordingUrl || candidate?.assessment?.interviewRecordingUrl || "";
    const interviewTranscript = candidate?.interview?.interviewTranscript || candidate?.assessment?.interviewTranscript || "";

    useEffect(() => {
        const dbDuration = candidate?.interview?.interviewDuration || candidate?.assessment?.interviewDuration;
        if (dbDuration && dbDuration > 0) {
            setRecordingDurationSec(dbDuration);
        }
    }, [candidate]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center animate-pulse">
                        <Sparkles className="h-6 w-6 text-[#F97316]" />
                    </div>
                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Loading Profile...</p>
                </div>
            </div>
        );
    }

    if (!candidate) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-400" />
                </div>
                <p className="text-lg font-black text-gray-900">Candidate Not Found</p>
                <Link href="/admin/candidates">
                    <Button variant="outline" className="rounded-xl">Back to Candidates</Button>
                </Link>
            </div>
        );
    }

    const techSkills = Array.isArray(structuredResume.skills?.technical) 
        ? structuredResume.skills.technical.map((s: any) => typeof s === 'object' ? s.skill : s) 
        : [];
    const toolSkills = Array.isArray(structuredResume.skills?.tools) 
        ? structuredResume.skills.tools.map((s: any) => typeof s === 'object' ? s.tool : s) 
        : [];
    const softSkills = Array.isArray(structuredResume.skills?.soft_skills) ? structuredResume.skills.soft_skills : [];
    const redFlags = aiData.red_flags || structuredResume.red_flags || [];
    const careerProgression = structuredResume.career_progression || null;

    const statusColors: Record<string, string> = {
        Shortlisted: "bg-green-50 text-green-700",
        Borderline:  "bg-amber-50 text-amber-700",
        Rejected:    "bg-red-50 text-red-600",
    };

    const formatDuration = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds / 60);
        const s = Math.floor(totalSeconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}min`;
    };

    return (
        <div className="space-y-8 pb-16">
            <div className="flex items-center gap-3">
                <Link href="/admin/candidates">
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-gray-900 hover:border-gray-200 shadow-sm transition-all">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                    Candidates <ChevronRight className="h-3 w-3" /> <span className="text-gray-900">{candidate.fullName}</span>
                </div>
            </div>

            <div className="relative bg-white rounded-3xl border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="h-1.5 w-full bg-gradient-to-r from-orange-300 via-[#F97316] to-orange-400" />
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-orange-50/60 to-transparent rounded-full blur-3xl pointer-events-none" />

                <div className="px-10 py-10 flex flex-col md:flex-row justify-between gap-8 relative z-10">
                    <div className="flex items-start gap-8">
                        <div className="relative flex-shrink-0">
                            <Avatar className="h-24 w-24 rounded-2xl border-4 border-white shadow-[0_8px_24px_rgba(0,0,0,0.1)]">
                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${candidate.fullName}`} />
                                <AvatarFallback className="text-2xl font-black bg-gray-900 text-white rounded-2xl">
                                    {candidate.fullName?.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{candidate.fullName}</h1>
                                <Badge className={cn("text-[10px] font-black uppercase tracking-widest border-0 rounded-xl px-3 py-1.5 shadow-sm", statusColors[normalizedStatus] ?? "bg-gray-50 text-gray-600")}>
                                    {normalizedStatus}
                                </Badge>
                                {score >= 75 && (
                                    <Badge className="bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest border-0 rounded-xl px-2.5 py-1.5 shadow-[0_4px_12px_rgba(79,70,229,0.3)] flex items-center gap-1.5">
                                        <Sparkles className="h-3 w-3" /> AI Verified
                                    </Badge>
                                )}
                            </div>
                            <p className="text-lg font-bold text-gray-500">{candidate.drive?.title || "Role N/A"}</p>
                            <div className="flex flex-wrap gap-5">
                                {[
                                    { icon: Mail,     value: candidate.email },
                                    { icon: Phone,    value: candidate.phone || "N/A" },
                                    { icon: MapPin, value: structuredResume.location?.city ? `${structuredResume.location.city}, ${structuredResume.location.country || ""}` : (candidate.location || "N/A") },
                                    { icon: Calendar, value: mounted ? `Applied ${new Date(candidate.createdAt).toLocaleDateString()}` : "Applied --/--/----" },
                                ].filter(item => item.value !== "N/A" && item.value !== "N/A, ").map(({ icon: Icon, value }) => (
                                    <div key={value} className="flex items-center gap-2 text-sm font-bold text-gray-400">
                                        <Icon className="h-3.5 w-3.5" />
                                        <span>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                        <Button 
                            onClick={() => setShowSubmissionPreview(true)}
                            variant="outline" 
                            className="h-11 px-5 rounded-xl font-bold border-gray-200 text-gray-600 hover:border-gray-300 transition-all cursor-pointer"
                        >
                            <UserSearch className="h-4 w-4 mr-2" /> View Submission
                        </Button>

                        <Button asChild variant="outline" className="h-11 px-5 rounded-xl font-bold border-gray-200 text-gray-600 hover:border-gray-300 transition-all cursor-pointer">
                            <a href={candidate.resumeUrl} target="_blank" rel="noopener noreferrer" download={`${candidate.fullName.replace(/\s+/g, '_')}_Resume.pdf`}>
                                <Download className="h-4 w-4 mr-2" /> Resume
                            </a>
                        </Button>

                        {(candidate.status === "Shortlisted") && candidate.interview?.status !== "COMPLETED" && (
                            <Button
                                onClick={handleResendInterview}
                                disabled={resendingInterview}
                                variant="outline"
                                className="h-11 px-5 rounded-xl font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
                            >
                                <RefreshCw className={cn("h-4 w-4 mr-2", resendingInterview && "animate-spin")} />
                                {resendingInterview ? "Sending..." : "Resend Interview Link"}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1 p-1 bg-gray-100/50 rounded-2xl w-fit">
                <button 
                    onClick={() => setActiveTab("analysis")}
                    className={cn(
                        "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                        activeTab === "analysis" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                    )}
                >
                    Resume Analysis
                </button>
                <button
                    onClick={() => setActiveTab("interview")}
                    className={cn(
                        "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                        activeTab === "interview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                    )}
                >
                    Interview
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {activeTab === "analysis" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                             {/* 🎯 Recruiter Snapshot */}
                             <div className="relative bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden p-8">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-300 via-[#F97316] to-orange-400" />
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
                                        <UserSearch className="h-5 w-5 text-[#F97316]" />
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-900 text-base">Recruiter Snapshot</p>
                                        <p className="text-xs font-bold text-gray-400">Executive briefing on this candidate</p>
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-orange-50/60 to-amber-50/30 rounded-2xl p-6 border border-orange-100/50">
                                    <p className="text-gray-800 leading-relaxed font-bold text-[15px] italic">
                                        "{aiData.recruiter_snapshot || summary}"
                                    </p>
                                </div>
                            </div>

                            {/* ✅ Detailed Verdict */}
                            <div className={cn(
                                "bg-white rounded-2xl border shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-8 relative overflow-hidden",
                                normalizedStatus === "Shortlisted" ? "border-green-100 bg-green-50/20" : 
                                normalizedStatus === "Borderline" ? "border-orange-100 bg-orange-50/20" : "border-red-100 bg-red-50/20"
                            )}>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center",
                                        normalizedStatus === "Shortlisted" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                                    )}>
                                        {normalizedStatus === "Shortlisted" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                                    </div>
                                    <p className={cn("font-black text-base uppercase tracking-tight", normalizedStatus === "Shortlisted" ? "text-green-800" : "text-red-700")}>
                                        AI Verdict: {normalizedStatus}
                                    </p>
                                </div>
                                <p className="text-gray-700 leading-relaxed font-bold text-[15px]">
                                    {aiData.ai_verdict || aiData.reasoning || "The AI evaluation determined this candidate's profile aligns with the role requirements."}
                                </p>
                            </div>

                            {/* 📋 Decision Matrix Table */}
                            {aiData.decision_breakdown && (
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
                                    <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center">
                                                <Target className="h-4 w-4 text-gray-500" />
                                            </div>
                                            <p className="font-black text-gray-900 text-sm">Requirement Decision Matrix</p>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-50/50">
                                                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Requirement</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Required</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Candidate</th>
                                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                                                    <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Note</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {aiData.decision_breakdown.map((row: any, i: number) => (
                                                    <tr key={i} className="hover:bg-gray-50/30 transition-all">
                                                        <td className="px-8 py-4 font-black text-gray-900 text-sm">{row.criteria}</td>
                                                        <td className="px-6 py-4 text-xs font-bold text-gray-500">{row.required}</td>
                                                        <td className="px-6 py-4">
                                                            <div className={cn(
                                                                "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-black uppercase tracking-tighter",
                                                                row.result === 'pass' ? "bg-green-50 text-green-700" : row.result === 'fail' ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-700"
                                                            )}>
                                                                {row.result === 'pass' ? <CheckCircle2 className="h-3 w-3" /> : row.result === 'fail' ? <XCircle className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                                                                {row.candidate_has}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <Badge className={cn("rounded-lg text-[9px] font-black uppercase tracking-widest border-0 shadow-none px-2 py-0.5", 
                                                                row.result === 'pass' ? "bg-green-100/50 text-green-700" : row.result === 'fail' ? "bg-red-100/50 text-red-700" : "bg-orange-100/50 text-orange-700")}>
                                                                {row.result}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-8 py-4 text-[13px] font-bold text-gray-400">{row.note}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="h-9 w-9 rounded-xl bg-green-50 flex items-center justify-center">
                                            <TrendingUp className="h-4 w-4 text-green-600" />
                                        </div>
                                        <p className="font-black text-gray-900 text-sm">Key Strengths</p>
                                    </div>
                                    <ul className="space-y-3">
                                        {strengths.length > 0 ? (aiData.strengths as any).map((s: any, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-sm">
                                                <div className="h-5 w-5 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                </div>
                                                <span className="text-gray-600 font-bold leading-snug">{typeof s === 'string' ? s : s.point}</span>
                                            </li>
                                        )) : <li className="text-sm text-gray-400 font-bold">No specific strengths identified.</li>}
                                    </ul>
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="h-9 w-9 rounded-xl bg-orange-50 flex items-center justify-center">
                                            <AlertTriangle className="h-4 w-4 text-[#F97316]" />
                                        </div>
                                        <p className="font-black text-gray-900 text-sm">Critical Gaps</p>
                                    </div>
                                    <div className="space-y-4">
                                        {aiData.concerns && aiData.concerns.length > 0 ? aiData.concerns.map((c: any, i: number) => (
                                            <div key={i} className="p-4 rounded-xl bg-red-50/30 border border-red-100">
                                               <p className="text-sm font-black text-red-700 mb-1">{c.point}</p>
                                               <p className="text-xs font-bold text-gray-500 leading-relaxed">{c.impact}</p>
                                            </div>
                                        )) : weaknesses.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-sm">
                                                <div className="h-5 w-5 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <XCircle className="h-3 w-3 text-orange-600" />
                                                </div>
                                                <span className="text-gray-600 font-bold leading-snug">{s}</span>
                                            </li>
                                        ))}
                                        {(aiData.concerns?.length === 0 && weaknesses.length === 0) && <li className="text-sm text-gray-400 font-bold">No specific concerns identified.</li>}
                                    </div>
                                </div>
                            </div>

                            {/* 🏗 Experience Deep Dive & Projects */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                            <BriefcaseBusiness className="h-5 w-5 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="font-black text-gray-900 text-base">Experience Deep Dive</p>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{aiData.experience_assessment?.vs_required || "Assessment pending"}</p>
                                        </div>
                                    </div>
                                    {aiData.experience_assessment ? (
                                        <div className="space-y-5">
                                            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Impact Quality</p>
                                                <p className="text-sm font-bold text-gray-700 leading-relaxed italic">"{aiData.experience_assessment.quality}"</p>
                                            </div>
                                            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">JD Relevance</p>
                                                <p className="text-sm font-bold text-gray-700 leading-relaxed italic">"{aiData.experience_assessment.relevance}"</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400 font-bold italic">Detailed experience assessment not available.</p>
                                    )}
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                                            <Target className="h-5 w-5 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="font-black text-gray-900 text-base">Project Relevance</p>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rating: {aiData.project_relevance?.rating || "N/A"}</p>
                                        </div>
                                    </div>
                                    {aiData.project_relevance ? (
                                       <div className="p-5 rounded-2xl bg-emerald-50/30 border border-emerald-100">
                                            <p className="text-sm font-bold text-gray-800 leading-relaxed">
                                                {aiData.project_relevance.reasoning}
                                            </p>
                                       </div>
                                    ) : (
                                        <p className="text-sm text-gray-400 font-bold italic">Project relevance analysis not available.</p>
                                    )}
                                </div>
                            </div>

                            {/* 🛡 Red Flags */}
                            {redFlags.length > 0 && (
                                <div className="bg-white rounded-2xl border border-red-50 shadow-[0_4px_24px_rgba(239,68,68,0.04)] p-6 overflow-hidden relative">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="h-9 w-9 rounded-xl bg-red-50 flex items-center justify-center">
                                            <ShieldCheck className="h-4 w-4 text-red-500" />
                                        </div>
                                        <p className="font-black text-gray-900 text-sm">Automated Red Flags</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {redFlags.map((flag: any, i: number) => (
                                            <div key={i} className="p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-[#F97316]">{flag.flag?.replace('_', ' ') || 'Flag'}</span>
                                                    <Badge className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border-0",
                                                        flag.severity === 'High' ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
                                                    )}>
                                                        {flag.severity} RISK
                                                    </Badge>
                                                </div>
                                                <p className="text-[13px] font-bold text-gray-700 leading-tight">{flag.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-8">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                        <Terminal className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <p className="font-black text-gray-900 text-base">Technical Technical Knowledge</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Core Technical</p>
                                        <div className="flex flex-wrap gap-2">
                                            {techSkills.map((s: string) => (
                                                <Badge key={s} variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100 rounded-lg text-xs font-bold px-2.5 py-1">{s}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Tools & Systems</p>
                                        <div className="flex flex-wrap gap-2">
                                            {toolSkills.map((s: string) => (
                                                <Badge key={s} variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 rounded-lg text-xs font-bold px-2.5 py-1">{s}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Soft Skills</p>
                                        <div className="flex flex-wrap gap-2">
                                            {softSkills.map((s: string) => (
                                                <Badge key={s} variant="secondary" className="bg-orange-50 text-orange-700 border-orange-100 rounded-lg text-xs font-bold px-2.5 py-1">{s}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {activeTab === "interview" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="relative bg-white rounded-3xl border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.04)] overflow-hidden p-10">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-300 via-indigo-600 to-indigo-400" />
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                                        <Camera className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Technical Interview Review</h2>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Full Recording and Transcript Captured via Lumoscale AI</p>
                                    </div>
                                </div>

                                {interviewRecordingUrl ? (
                                    <div className="space-y-8">
                                        <div className="rounded-3xl border-8 border-gray-900 bg-black overflow-hidden shadow-2xl relative">
                                             <style jsx global>{`
                                                .plyr--full-ui {
                                                    --plyr-color-main: #F97316;
                                                }
                                            `}</style>
                                            <Plyr
                                                ref={plyrRef}
                                                source={{
                                                    type: "video",
                                                    sources: [{ src: interviewRecordingUrl, type: "video/webm" }],
                                                }}
                                                options={{
                                                    duration: recordingDurationSec || undefined,
                                                    controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "captions", "settings", "pip", "fullscreen"],
                                                }}
                                            />
                                        </div>
                                        
                                        <div className="flex flex-wrap gap-4">
                                            <div className="bg-orange-50/50 border border-orange-100 rounded-2xl px-6 py-4 flex flex-col gap-1">
                                                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Duration</p>
                                                <p className="text-xl font-black text-gray-900 tracking-tight">{recordingDurationSec ? formatDuration(recordingDurationSec) : "Loading..."}</p>
                                            </div>
                                             <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl px-6 py-4 flex flex-col gap-1">
                                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Questions Asked</p>
                                                <p className="text-xl font-black text-gray-900 tracking-tight">8 Blocks</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4 pt-6 border-t border-gray-100">
                                            <div className="flex items-center gap-2">
                                                <MessageSquare className="h-4 w-4 text-gray-400" />
                                                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Interview Transcript</h3>
                                            </div>
                                            <div className="bg-gray-50/80 rounded-2xl p-8 border border-gray-100">
                                                <p className="text-gray-700 leading-relaxed font-semibold italic whitespace-pre-wrap">
                                                    {interviewTranscript || "Transcript extraction in progress..."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-20 flex flex-col items-center gap-4 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                                        <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center"><EyeOff className="h-6 w-6 text-gray-300" /></div>
                                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest text-center">Interview not yet completed <br/><span className="text-[10px] font-bold lowercase italic opacity-60">Wait for candidate submission</span></p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden p-8 sticky top-8">
                        <div className="flex flex-col items-center gap-8">
                            <ScoreRing score={score} />
                            
                            <div className="w-full space-y-6 pt-6 border-t border-gray-50">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Application Progress</p>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-gray-900">Scanning & AI Evaluation</span>
                                        <span className="text-xs font-black text-green-600">100%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { label: "Job Post", value: candidate.drive?.title || "N/A", icon: Target },
                                        { label: "Applied On", value: mounted ? new Date(candidate.createdAt).toLocaleDateString() : "--/--/----", icon: Calendar },
                                        { label: "Location", value: candidate.location || "Remote", icon: MapPin },
                                        { label: "Mobile", value: candidate.phone || "Not Provided", icon: Phone },
                                    ].map(({ label, value, icon: Icon }) => (
                                        <div key={label} className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0"><Icon className="h-4 w-4 text-gray-400" /></div>
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                                                <p className="text-sm font-bold text-gray-900 truncate max-w-[160px]">{value}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showSubmissionPreview && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowSubmissionPreview(false)} />
                    <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div><h2 className="text-xl font-black text-gray-900 tracking-tight">Candidate Submission</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Full Application Data</p></div>
                            <Button variant="ghost" size="icon" onClick={() => setShowSubmissionPreview(false)} className="rounded-xl hover:bg-gray-100"><X className="h-6 w-6 text-gray-400" /></Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 text-gray-900">
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 text-indigo-600"><User className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Personal Information</h3></div>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { label: "Full Name", value: candidate.fullName },
                                        { label: "Email", value: candidate.email },
                                        { label: "Phone", value: candidate.phone },
                                        { label: "Location", value: candidate.location || "Not Provided" },
                                        { label: "Portfolio", value: candidate.submissionData?.portfolio || "N/A", isLink: !!candidate.submissionData?.portfolio },
                                    ].map((field, i) => (
                                        <div key={i} className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{field.label}</p>
                                            {field.isLink && field.value !== "N/A" ? <a href={field.value.startsWith('http') ? field.value : `https://${field.value}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-indigo-600 hover:underline flex items-center gap-1"><Globe className="h-3 w-3" /> {field.value}</a> : <p className="text-sm font-bold text-gray-900">{field.value}</p>}
                                        </div>
                                    ))}
                                </div>
                            </section>
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 text-[#F97316]"><BriefcaseBusiness className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Professional Details</h3></div>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { label: "Experience", value: candidate.submissionData?.experience || "N/A" },
                                        { label: "Current Company", value: candidate.submissionData?.currentCompany || "N/A" },
                                        { label: "Current CTC", value: candidate.submissionData?.currentCtc || "N/A", icon: IndianRupee },
                                        { label: "Expected CTC", value: candidate.submissionData?.expectedCtc || "N/A", icon: IndianRupee },
                                        { label: "Notice Period", value: candidate.submissionData?.noticePeriod || "N/A" },
                                    ].map((field, i) => (
                                        <div key={i} className="p-4 rounded-2xl bg-orange-50/30 border border-orange-100">
                                            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">{field.label}</p>
                                            <div className="flex items-center gap-1.5">{field.icon && <field.icon className="h-3.5 w-3.5 text-gray-400" />}<p className="text-sm font-bold text-gray-900">{field.value}</p></div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                            {candidate.submissionData?.coverLetter && (
                                <section className="space-y-4">
                                    <div className="flex items-center gap-2 text-indigo-600"><MessageSquare className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Cover Letter / Message</h3></div>
                                    <div className="p-6 rounded-2xl bg-indigo-50/30 border border-indigo-100"><p className="text-sm font-medium text-gray-700 leading-relaxed whitespace-pre-wrap">{candidate.submissionData.coverLetter}</p></div>
                                </section>
                            )}
                        </div>
                        <div className="p-8 border-t border-gray-100 bg-gray-50/50"><Button onClick={() => setShowSubmissionPreview(false)} className="w-full h-12 rounded-xl bg-gray-900 text-white font-black hover:bg-black transition-all">CLOSE PREVIEW</Button></div>
                    </div>
                </div>
            )}
        </div>
    );
}


