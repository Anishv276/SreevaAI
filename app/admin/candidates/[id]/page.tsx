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

/* ── Premium Score Indicator ─────────────────────────── */
function ScoreIndicator({ score, status }: { score: number, status: string }) {
    const isHigh = score >= 80;
    const isMid = score >= 50;
    const colorClass = isHigh ? "text-green-600 bg-green-50 border-green-100" : isMid ? "text-orange-600 bg-orange-50 border-orange-100" : "text-red-600 bg-red-50 border-red-100";
    const label = isHigh ? "Executive Match" : isMid ? "Strong Candidate" : "Mixed Alignment";
    
    return (
        <div className="flex items-center gap-4 animate-in fade-in zoom-in duration-700" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="flex flex-col items-end gap-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{label}</p>
                <div className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border", colorClass)}>
                    {status}
                </div>
            </div>
            <div className="h-16 w-[1px] bg-gray-100 mx-1" />
            <div className="flex flex-col items-center justify-center bg-gray-50/50 rounded-2xl p-3 border border-gray-100 shadow-sm min-w-[80px]">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">SCORE</span>
                <div className="flex items-baseline gap-0.5">
                    <span className="text-3xl font-black text-gray-900 leading-none">{score}</span>
                    <span className="text-xs font-bold text-gray-400 leading-none">/100</span>
                </div>
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
        ? structuredResume.skills.tools.map((s: any) => (typeof s === 'object' ? s.tool : s)).filter(Boolean) 
        : [];
    const softSkills = Array.isArray(structuredResume.skills?.soft_skills) ? structuredResume.skills.soft_skills : [];
    const domainSkills = Array.isArray(structuredResume.skills?.domain_skills) ? structuredResume.skills.domain_skills : [];
    const redFlags = aiData.red_flags || structuredResume.red_flags || [];
    const careerProgression = structuredResume.career_progression || null;
    const workHistory = Array.isArray(structuredResume.work_history) ? structuredResume.work_history : [];
    const breakdown = aiData.breakdown || null;

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
        <div className="space-y-8 pb-16" style={{ fontFamily: 'Inter, sans-serif' }}>
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

                        <div className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className="text-4xl font-black text-gray-900 tracking-tight">{candidate.fullName}</h1>
                                {score >= 75 && (
                                    <div className="bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full px-3 py-1 flex items-center gap-1.5 shadow-lg shadow-indigo-200">
                                        <Sparkles className="h-3 w-3" /> AI Verified
                                    </div>
                                )}
                            </div>
                            <p className="text-xl font-bold text-gray-400">{candidate.drive?.title || "Role N/A"}</p>
                            <div className="flex flex-wrap gap-6 pt-1">
                                {[
                                    { icon: Mail,     value: candidate.email },
                                    { icon: Phone,    value: candidate.phone || "N/A" },
                                    { icon: MapPin, value: structuredResume.location?.city ? `${structuredResume.location.city}, ${structuredResume.location.country || ""}` : (candidate.location || "N/A") },
                                    { icon: Calendar, value: mounted ? `Applied ${new Date(candidate.createdAt).toLocaleDateString()}` : "Applied --/--/----" },
                                ].filter(item => item.value !== "N/A" && item.value !== "N/A, ").map(({ icon: Icon, value }) => (
                                    <div key={value} className="flex items-center gap-2.5 text-sm font-bold text-gray-500">
                                        <div className="h-7 w-7 rounded-lg bg-gray-50 flex items-center justify-center">
                                            <Icon className="h-3.5 w-3.5 text-gray-400" />
                                        </div>
                                        <span>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 relative z-10">
                        <div className="flex flex-col items-end gap-6 h-full justify-between">
                            <ScoreIndicator score={score} status={normalizedStatus} />
                            
                            <div className="flex items-center gap-2">
                                <Button 
                                    onClick={() => setShowSubmissionPreview(true)}
                                    variant="outline" 
                                    className="h-10 px-5 rounded-2xl font-black text-[10px] uppercase tracking-widest border-gray-100 text-gray-500 hover:bg-gray-50 hover:text-gray-900 shadow-sm transition-all bg-white/50 backdrop-blur-sm"
                                >
                                    <UserSearch className="h-3.5 w-3.5 mr-2" /> View Profile
                                </Button>

                                <Button asChild variant="outline" className="h-10 px-5 rounded-2xl font-black text-[10px] uppercase tracking-widest border-gray-100 text-gray-500 hover:bg-gray-50 hover:text-gray-900 shadow-sm transition-all bg-white/50 backdrop-blur-sm">
                                    <a href={candidate.resumeUrl} target="_blank" rel="noopener noreferrer" download={`${candidate.fullName.replace(/\s+/g, '_')}_Resume.pdf`}>
                                        <Download className="h-3.5 w-3.5 mr-2" /> Resume
                                    </a>
                                </Button>
                            </div>
                        </div>
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

            <div className="w-full">
                <div className="space-y-6">
                    {activeTab === "analysis" && (
                        <div className="space-y-16 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
                             {/* 🎯 Recruiter Snapshot */}
                             <div className="space-y-8">
                                <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl border border-gray-800">
                                    <h3 className="text-xl font-black text-white tracking-tight">Recruiter Snapshot</h3>
                                    <div className="h-4 w-[1px] bg-gray-700" />
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Executive talent synthesis</p>
                                </div>
                                <div className="relative bg-white rounded-3xl border border-gray-200 shadow-[0_8px_32px_rgba(0,0,0,0.04)] overflow-hidden p-10">
                                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-300 via-[#F97316] to-orange-400" />
                                    <div className="bg-gradient-to-br from-orange-50/60 to-amber-50/30 rounded-3xl p-8 border border-orange-100/50">
                                        <p className="text-gray-800 leading-relaxed font-bold text-[18px] italic">
                                            &ldquo;{aiData.recruiter_snapshot || summary}&rdquo;
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 📊 Premium Score Breakdown */}
                            {breakdown && (
                                <div className="space-y-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl border border-gray-800">
                                        <h3 className="text-xl font-black text-white tracking-tight">Evaluation Breakdown</h3>
                                        <div className="h-4 w-[1px] bg-gray-700" />
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Data-driven metric assessment</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                        {[
                                            { label: "Must-Have Skills", score: breakdown.skills_score, max: breakdown.skills_max, desc: "Tech stack match" },
                                            { label: "Exp Relevance", score: breakdown.exp_score, max: breakdown.exp_max, desc: "Domain depth score" },
                                            { label: "Good-to-Have", score: breakdown.good_score, max: breakdown.good_max, desc: "Bonus tool match" },
                                            { label: "Career signals", score: breakdown.career_score, max: breakdown.career_max, desc: "Growth trajectory" },
                                        ].map((item, idx) => {
                                            const percent = (item.score / item.max) * 100;
                                            return (
                                                <div key={idx} className="group relative bg-white rounded-[32px] border border-gray-200 p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all duration-500 hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)] hover:-translate-y-1">
                                                    <div className="flex items-center justify-between mb-10 relative z-10">
                                                        <div className="flex flex-col">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{item.label}</p>
                                                            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-0.5">{item.desc}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="flex items-baseline gap-0.5 justify-end">
                                                                <span className="text-4xl font-black text-gray-900 tabular-nums tracking-tighter">{item.score}</span>
                                                                <span className="text-xs font-bold text-gray-300">/{item.max}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-4 relative z-10">
                                                        <div className="flex items-center justify-between text-[10px] font-black">
                                                            <span className="text-gray-900 uppercase tracking-widest">Weightage</span>
                                                            <span className="text-gray-400">{Math.round(percent)}%</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100 p-0.5">
                                                            <div className="h-full rounded-full transition-all duration-1000 bg-gray-900" style={{ width: `${percent}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ✅ Detailed AI Verdict Card */}
                            <div className="space-y-8">
                                <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl border border-gray-800">
                                    <h3 className="text-xl font-black text-white tracking-tight">AI System Verdict</h3>
                                    <div className="h-4 w-[1px] bg-gray-700" />
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Final suitability analysis</p>
                                </div>
                                <div className={cn(
                                    "bg-white rounded-[32px] border shadow-[0_8px_32px_rgba(0,0,0,0.03)] p-10 relative overflow-hidden",
                                    normalizedStatus === "Shortlisted" ? "border-green-200 bg-green-50/20" : 
                                    normalizedStatus === "Borderline" ? "border-orange-200 bg-orange-50/20" : "border-red-200 bg-red-50/20"
                                )}>
                                    <div className="flex items-center gap-6 mb-8">
                                        <div className={cn(
                                            "h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg",
                                            normalizedStatus === "Shortlisted" ? "bg-green-100 text-green-600" : 
                                            normalizedStatus === "Borderline" ? "bg-orange-100 text-orange-600" : "bg-red-100 text-red-600"
                                        )}>
                                            {normalizedStatus === "Shortlisted" ? <CheckCircle2 className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
                                        </div>
                                        <div>
                                            <p className={cn("text-[10px] font-black uppercase tracking-[0.3em] mb-1.5", 
                                                normalizedStatus === "Shortlisted" ? "text-green-600" : 
                                                normalizedStatus === "Borderline" ? "text-orange-600" : "text-red-600"
                                            )}>Decision Consensus</p>
                                            <h3 className={cn("text-3xl font-black tracking-tighter uppercase", 
                                                normalizedStatus === "Shortlisted" ? "text-green-800" : 
                                                normalizedStatus === "Borderline" ? "text-orange-800" : "text-red-800"
                                            )}>{normalizedStatus}</h3>
                                        </div>
                                    </div>
                                    <div className="pl-20 border-l-2 border-dashed border-gray-100 italic">
                                        <p className="text-gray-700 leading-relaxed font-bold text-[18px]">
                                            &ldquo;{aiData.ai_verdict || aiData.reasoning || "The automated evaluation suggests a high degree of alignment with role requirements."}&rdquo;
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-8">
                                    <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl border border-gray-800">
                                        <h3 className="text-xl font-black text-white tracking-tight">Key Strengths</h3>
                                    </div>
                                    <div className="bg-white rounded-[32px] border border-gray-200 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-10 h-full">
                                        <ul className="space-y-6">
                                            {strengths.length > 0 ? (aiData.strengths as any).map((s: any, i: number) => (
                                                <li key={i} className="flex items-start gap-4 text-[16px]">
                                                    <div className="h-2 w-2 rounded-full bg-green-500 mt-2.5 flex-shrink-0" />
                                                    <span className="text-gray-600 font-bold leading-relaxed">{typeof s === 'string' ? s : s.point}</span>
                                                </li>
                                            )) : <li className="text-sm text-gray-400 font-bold italic">No specific signals detected.</li>}
                                        </ul>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl border border-gray-800">
                                        <h3 className="text-xl font-black text-white tracking-tight">Critical Gaps</h3>
                                    </div>
                                    <div className="bg-white rounded-[32px] border border-gray-200 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-10 h-full">
                                        <div className="space-y-6">
                                            {aiData.concerns && aiData.concerns.length > 0 ? aiData.concerns.map((c: any, i: number) => (
                                                <div key={i} className="p-7 rounded-[28px] bg-red-50/30 border border-red-100 transition-all hover:bg-red-50/50">
                                                   <p className="text-sm font-black text-red-700 mb-2 uppercase tracking-wide">{c.point}</p>
                                                   <p className="text-[14px] font-bold text-gray-500 leading-relaxed italic">&ldquo;{c.impact}&rdquo;</p>
                                                </div>
                                            )) : weaknesses.map((s: string, i: number) => (
                                                <li key={i} className="flex items-start gap-4 text-[16px]">
                                                    <div className="h-2 w-2 rounded-full bg-red-400 mt-2.5 flex-shrink-0" />
                                                    <span className="text-gray-600 font-bold leading-relaxed">{s}</span>
                                                </li>
                                            ))}
                                            {(aiData.concerns?.length === 0 && weaknesses.length === 0) && <li className="text-sm text-gray-400 font-bold italic">No specific critical gaps identified.</li>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 🏗 Experience Deep Dive & Projects */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-8">
                                    <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl w-full border border-gray-800">
                                        <h3 className="text-xl font-black text-white tracking-tight px-2">Experience Context</h3>
                                        <div className="h-4 w-[1px] bg-gray-700 mx-2" />
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] truncate">{aiData.experience_assessment?.vs_required || "Trajectory check"}</p>
                                    </div>
                                    <div className="bg-white rounded-[32px] border border-gray-200 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-10">
                                        {aiData.experience_assessment ? (
                                            <div className="space-y-6">
                                                <div className="p-7 rounded-[28px] bg-gray-50 border border-gray-100">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Impact Analysis</p>
                                                    <p className="text-[16px] font-bold text-gray-700 leading-relaxed italic">"{aiData.experience_assessment.quality}"</p>
                                                </div>
                                                <div className="p-7 rounded-[28px] bg-gray-50 border border-gray-100">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Role Alignment</p>
                                                    <p className="text-[16px] font-bold text-gray-700 leading-relaxed italic">"{aiData.experience_assessment.relevance}"</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-400 font-bold italic text-center py-10 opacity-60">Deep dive currently unavailable.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl w-full border border-gray-800">
                                        <h3 className="text-xl font-black text-white tracking-tight px-2">Project Spectrum</h3>
                                        <div className="h-4 w-[1px] bg-gray-700 mx-2" />
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] truncate">Rating: {aiData.project_relevance?.rating || "N/A"}</p>
                                    </div>
                                    <div className="bg-white rounded-[32px] border border-gray-200 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-10 h-[calc(100%-80px)]">
                                        {aiData.project_relevance ? (
                                           <div className="p-8 rounded-[28px] bg-emerald-50/40 border border-emerald-100 flex items-center justify-center min-h-[160px]">
                                                <p className="text-[17px] font-bold text-gray-800 leading-relaxed text-center">
                                                    &ldquo;{aiData.project_relevance.reasoning}&rdquo;
                                                </p>
                                           </div>
                                        ) : (
                                            <p className="text-sm text-gray-400 font-bold italic text-center py-10 opacity-60">Spectrum check unavailable.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 🛡 Automated Risk Signals */}
                            {redFlags.length > 0 && (
                                <div className="space-y-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    <div className="inline-flex items-center gap-4 bg-red-950 rounded-2xl px-8 py-4 shadow-xl border border-red-900/40">
                                        <h3 className="text-xl font-black text-white tracking-tight uppercase">Integrity Risk Signals</h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {redFlags.map((flag: any, i: number) => {
                                            const isHigh = flag.severity === 'High';
                                            return (
                                                <div key={i} className={cn(
                                                    "group relative bg-white rounded-[32px] border border-gray-200 p-10 transition-all hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)] overflow-hidden",
                                                    isHigh ? "ring-2 ring-red-50/50" : "ring-2 ring-orange-50/50"
                                                )}>
                                                    <div className={cn(
                                                        "absolute left-0 top-0 bottom-0 w-2",
                                                        isHigh ? "bg-red-500" : "bg-orange-500"
                                                    )} />
                                                    <div className="flex items-center justify-between mb-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className={cn(
                                                                "h-10 w-10 rounded-2xl flex items-center justify-center shadow-sm",
                                                                isHigh ? "bg-red-50 text-red-500" : "bg-orange-50 text-orange-500"
                                                            )}>
                                                                {isHigh ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                                                            </div>
                                                            <span className={cn("text-[11px] font-black uppercase tracking-[0.2em]", isHigh ? "text-red-600" : "text-orange-600")}>
                                                                {flag.flag?.replace('_', ' ') || 'Integrity Check'}
                                                            </span>
                                                        </div>
                                                        <span className={cn("px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest", isHigh ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700")}>
                                                            {flag.severity} RISK
                                                        </span>
                                                    </div>
                                                    <p className="text-[17px] font-bold text-gray-700 leading-snug pl-14">
                                                        {flag.detail}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 🧠 Premium Skill Knowledge Map */}
                            <div className="space-y-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                                <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl border border-gray-800">
                                    <h3 className="text-xl font-black text-white tracking-tight">Skill Knowledge Spectrum</h3>
                                    <div className="h-4 w-[1px] bg-gray-700" />
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Multi-factor depth assessment</p>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {[
                                        { title: "Core Technical", skills: techSkills, bg: "bg-indigo-50/50", text: "text-indigo-700", border: "border-indigo-100" },
                                        { title: "Tools & Platforms", skills: toolSkills, bg: "bg-emerald-50/50", text: "text-emerald-700", border: "border-emerald-100" },
                                        { title: "Domain Expertise", skills: domainSkills, bg: "bg-amber-50/50", text: "text-amber-700", border: "border-amber-100" },
                                        { title: "Power Skills", skills: softSkills, bg: "bg-violet-50/50", text: "text-violet-700", border: "border-violet-100" },
                                    ].map((cat, idx) => (
                                        <div key={idx} className="bg-white rounded-[32px] border border-gray-200 p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_8px_32px_rgba(0,0,0,0.05)] flex flex-col h-full ring-1 ring-gray-100/50">
                                            <div className="flex items-center justify-between mb-8">
                                                <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">{cat.title}</p>
                                                <span className={cn("px-3 py-1 rounded-full text-[10px] font-black", cat.bg, cat.text)}>
                                                    {cat.skills.length}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-auto">
                                                {cat.skills.length > 0 ? cat.skills.map((s: string) => (
                                                    <span key={s} className={cn("px-4 py-2 rounded-2xl text-[13px] font-bold transition-all border", cat.bg, cat.text, cat.border)}>
                                                        {s}
                                                    </span>
                                                )) : <span className="text-xs text-gray-300 font-bold italic">No signals.</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 🌱 Premium Candidate Potential Projection */}
                            {aiData.candidate_potential && (
                                <div className="space-y-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    <div className="inline-flex items-center gap-4 bg-black rounded-2xl px-8 py-4 shadow-xl border border-gray-800">
                                        <h3 className="text-xl font-black text-white tracking-tight">Growth & Potential Prediction</h3>
                                        <div className="h-4 w-[1px] bg-gray-700" />
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Talent trajectory analysis</p>
                                    </div>
                                    
                                    <div className={cn(
                                        "bg-white rounded-[32px] border shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden",
                                        aiData.candidate_potential.for_this_role === 'High' ? "border-green-200 ring-2 ring-green-50/50" :
                                        aiData.candidate_potential.for_this_role === 'Medium' ? "border-amber-200 ring-2 ring-amber-50/50" : "border-gray-200"
                                    )}>
                                        <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
                                            <div className={cn(
                                                "lg:w-1/3 p-12 flex flex-col items-center justify-center text-center gap-2",
                                                aiData.candidate_potential.for_this_role === 'High' ? "bg-green-50/30" : 
                                                aiData.candidate_potential.for_this_role === 'Medium' ? "bg-amber-50/30" : "bg-gray-50/30"
                                            )}>
                                                <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Trajectory</p>
                                                <h4 className={cn(
                                                    "text-6xl font-black tracking-tighter",
                                                    aiData.candidate_potential.for_this_role === 'High' ? "text-green-600" : 
                                                    aiData.candidate_potential.for_this_role === 'Medium' ? "text-amber-600" : "text-gray-900"
                                                )}>
                                                    {aiData.candidate_potential.for_this_role}
                                                </h4>
                                                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-4 uppercase">{aiData.candidate_potential.for_this_role === 'High' ? "EXECUTIVE MATCH" : "POTENTIAL ASSET"}</p>
                                            </div>
                                            <div className="flex-1 p-12 space-y-10">
                                                <div>
                                                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Talent Synthesis Brief</p>
                                                    <p className="text-gray-700 leading-relaxed font-bold text-[18px]">
                                                        {aiData.candidate_potential.reasoning}
                                                    </p>
                                                </div>
                                                {aiData.candidate_potential.alternative_fit && (
                                                    <div className="pt-8 border-t border-gray-100 flex items-start gap-4">
                                                        <div className="flex-1">
                                                            <p className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2">Strategy Alignment</p>
                                                            <p className="text-[16px] font-bold text-gray-500 italic">
                                                                <span className="text-gray-900 not-italic uppercase text-[12px] tracking-tight">Alternative Role Horizon:</span> {aiData.candidate_potential.alternative_fit}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
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


