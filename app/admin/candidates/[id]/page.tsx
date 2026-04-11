"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    ArrowLeft, Download, Mail, Phone, MapPin, Calendar,
    CheckCircle2, XCircle, Sparkles, Zap, ArrowRight,
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
function ScoreIndicator({ score }: { score: number, status: string }) {
    const isHigh = score >= 80;
    const isMid = score >= 50;
    const color = isHigh ? "#10B981" : isMid ? "#F59E0B" : "#EF4444";
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center h-24 w-24 animate-in fade-in zoom-in duration-1000">
            {/* Background Circle */}
            <svg className="h-full w-full transform -rotate-90 drop-shadow-sm">
                <circle
                    cx="48"
                    cy="48"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-gray-100"
                />
                {/* Progress Circle */}
                <circle
                    cx="48"
                    cy="48"
                    r={radius}
                    stroke={color}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    style={{ strokeDashoffset: offset }}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-gray-900 leading-none">{score}</span>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">SCORE</span>
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
    const [rescanning, setRescanning] = useState(false);
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

    const handleRescan = async () => {
        setRescanning(true);
        try {
            const res = await fetch(`/api/admin/candidates/${id}/rescan`, { method: "POST" });
            if (res.ok) {
                // Polling for updates could be added, but for now we just show a message
                // and the user can refresh after a few seconds.
                alert("AI Re-scan triggered. Please wait about 30 seconds and refresh the page.");
                window.location.reload();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to trigger re-scan");
            }
        } catch (error) {
            console.error("Rescan error:", error);
            alert("Failed to trigger AI re-scan.");
        } finally {
            setRescanning(false);
        }
    };
    const plyrRef = useRef<APITypes>(null);

    const aiData = candidate?.aiReport ? JSON.parse(candidate.aiReport) : {};
    const structuredResume = candidate?.structuredResume ? (typeof candidate.structuredResume === 'string' ? JSON.parse(candidate.structuredResume) : candidate.structuredResume) : {};

    const summary = structuredResume.candidate_summary || aiData.summary || structuredResume.summary || aiData.reasoning || "AI analysis pending for this candidate.";
    const strengths = aiData.strengths || [];
    const weaknesses = aiData.weaknesses || [];
    const score = candidate?.aiScore || 0;
    const rawResumeStatus = String(candidate?.resumeStatus || "pending").toLowerCase();
    const normalizedStatus =
        rawResumeStatus === "rejected"
            ? "Rejected"
            : rawResumeStatus === "shortlisted"
                ? "Shortlisted"
                : rawResumeStatus === "borderline"
                    ? "Borderline"
                    : "Pending";

    const interviewRecordingUrl = candidate?.interview?.interviewRecordingUrl || candidate?.assessment?.interviewRecordingUrl || "";
    const interviewAiSummary = candidate?.interview?.aiSummary || candidate?.assessment?.aiSummary || "";
    const interviewTranscript = candidate?.interview?.interviewTranscript || candidate?.assessment?.interviewTranscript || "";

    useEffect(() => {
        const dbDuration = candidate?.interview?.interviewDuration || candidate?.assessment?.interviewDuration;
        if (dbDuration && dbDuration > 0) {
            setRecordingDurationSec(dbDuration);
        }
    }, [candidate]);

    const snapshots = candidate?.interview?.snapshots || candidate?.assessment?.snapshots || [];
    let interviewSnapshot: string | null = null;
    if (Array.isArray(snapshots) && snapshots.length > 0) {
        interviewSnapshot = snapshots[snapshots.length - 1];
    } else if (typeof snapshots === 'string' && snapshots.startsWith('[')) {
        try {
            const parsed = JSON.parse(snapshots);
            if (Array.isArray(parsed) && parsed.length > 0) interviewSnapshot = parsed[parsed.length - 1];
        } catch { }
    } else if (typeof snapshots === 'string' && snapshots.length > 10) {
        interviewSnapshot = snapshots;
    }

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

    const displayAvatar = interviewSnapshot || candidate.passportUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${candidate.fullName}`;
    console.log("[Dossier] Snapshot Data:", { snapshots, interviewSnapshot, displayAvatar });

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

    const formatDuration = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds / 60);
        const s = Math.floor(totalSeconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}min`;
    };

    return (
        <div className="space-y-8 pb-16" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="flex items-center justify-between">
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

                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleRescan}
                        disabled={rescanning}
                        variant="outline"
                        className="h-10 px-5 rounded-2xl font-black text-[10px] uppercase tracking-widest border-orange-100 text-orange-600 hover:bg-orange-50 shadow-sm transition-all bg-white/50 backdrop-blur-sm"
                    >
                        {rescanning ? <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
                        {rescanning ? "Scanning..." : "Refresh AI Analysis"}
                    </Button>

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

            <div className="relative bg-white rounded-3xl border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="h-1.5 w-full bg-gradient-to-r from-orange-300 via-[#F97316] to-orange-400" />
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-orange-50/60 to-transparent rounded-full blur-3xl pointer-events-none" />

                <div className="px-10 py-10 flex flex-col md:flex-row justify-between gap-8 relative z-10">
                    <div className="flex items-start gap-8">
                        <div className="relative flex-shrink-0">
                            <Avatar className="h-24 w-24 rounded-2xl border-4 border-white shadow-[0_8px_24px_rgba(0,0,0,0.1)]">
                                <AvatarImage src={displayAvatar} className="object-cover" />
                                <AvatarFallback className="text-2xl font-black bg-gray-900 text-white rounded-2xl">
                                    {candidate.fullName?.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className="text-4xl font-black text-gray-900 tracking-tight">{candidate.fullName}</h1>
                                {score >= 75 && (
                                    <div className="bg-indigo-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-full px-3 py-1 flex items-center gap-1.5 shadow-lg shadow-indigo-200">
                                        <Sparkles className="h-3 w-3" /> AI Verified
                                    </div>
                                )}
                            </div>
                            <p className="text-xl font-bold text-gray-400">{candidate.drive?.role || candidate.drive?.title || "Role N/A"}</p>
                            
                            <div className="flex flex-wrap gap-6 pt-1">
                                {[
                                    { icon: Mail, value: candidate.email },
                                    { icon: Phone, value: candidate.phone || "N/A" },
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

                    <div className="flex flex-col items-end justify-center relative z-10 min-w-[200px]">
                        {/* Circular Score */}
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-end">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Alignment</p>
                                <div className={cn(
                                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border mt-1",
                                    score >= 80 ? "text-green-600 bg-green-50 border-green-100" : score >= 50 ? "text-orange-600 bg-orange-50 border-orange-100" : "text-red-600 bg-red-50 border-red-100"
                                )}>
                                    {normalizedStatus}
                                </div>
                            </div>
                            <ScoreIndicator score={score} status={normalizedStatus} />
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
                                <div className="space-y-12" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    <div className="space-y-4">
                                        <p className="text-gray-500 font-black tracking-widest text-[11px] uppercase opacity-70">
                                            Score Breakdown — Why {score}?
                                        </p>
                                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                            {[
                                                { label: "Must-have skills", score: breakdown.skills_score, max: breakdown.skills_max ?? 45, color: "bg-red-500" },
                                                { label: "Experience years", score: breakdown.exp_score, max: breakdown.exp_max ?? 25, color: "bg-indigo-600" },
                                                { label: "Good-to-have", score: breakdown.good_score, max: breakdown.good_max ?? 10, color: "bg-orange-400" },
                                                { label: "Career quality", score: breakdown.career_score, max: breakdown.career_max ?? 10, color: "bg-emerald-500" },
                                                { label: "Domain fit", score: breakdown.domain_score ?? 0, max: breakdown.domain_max ?? 10, color: "bg-gray-400" },
                                            ].map((item, idx) => {
                                                const color = item.score === 0 ? "bg-red-100" : item.color;
                                                return (
                                                    <div key={idx} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in slide-in-from-bottom-2 relative" style={{ animationDelay: `${idx * 100}ms` }}>
                                                        <div className={cn("h-1 w-full absolute top-0 left-0", color)} />
                                                        <div className="flex items-baseline gap-0.5 mb-2">
                                                            <span className={cn("text-2xl font-black tabular-nums tracking-tighter", item.score === 0 ? "text-red-500" : "text-gray-900")}>{item.score}</span>
                                                            <span className="text-xs font-bold text-gray-300">/{item.max}</span>
                                                        </div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">{item.label}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* ✅ Must-Have Skills Match (New Section) */}
                                    <div className="space-y-4">
                                        {(() => {
                                            const matchData = aiData.skill_matching || {};
                                            const details = matchData.must_have_details || [
                                                ...(matchData.matched_must || []).map((s: string) => ({ name: s, weight: 'high', status: 'found' })),
                                                ...(matchData.missing_must || []).map((s: string) => ({ name: s, weight: 'high', status: 'not_found' }))
                                            ];
                                            const foundCount = (matchData.matched_must || []).length;
                                            const totalCount = matchData.total_must || details.length;

                                            return (
                                                <>
                                                    <p className="text-gray-500 font-black tracking-widest text-[11px] uppercase opacity-70">
                                                        Must-Have Skills Match — {foundCount} of {totalCount}
                                                    </p>
                                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                                        <div className="divide-y divide-gray-50">
                                                            {details.length > 0 ? details.map((skill: any, idx: number) => (
                                                                <div key={idx} className="group flex items-center justify-between px-8 py-4 hover:bg-gray-50/50 transition-colors">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className={cn(
                                                                            "h-2 w-2 rounded-full",
                                                                            skill.status === 'found' ? "bg-emerald-500" : 
                                                                            skill.status === 'mentioned' ? "bg-amber-500" : "bg-red-500"
                                                                        )} />
                                                                        <span className="text-[15px] font-bold text-gray-700 tracking-tight">{skill.name}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-4">
                                                                        <span className={cn(
                                                                            "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                                                                            skill.weight === 'critical' ? "bg-red-50 text-red-600" :
                                                                            skill.weight === 'high' ? "bg-orange-50 text-orange-600" : "bg-gray-100 text-gray-400"
                                                                        )}>
                                                                            {skill.weight || 'medium'}
                                                                        </span>
                                                                        <span className={cn(
                                                                            "text-[10px] font-black uppercase tracking-widest w-20 text-right",
                                                                            skill.status === 'found' ? "text-emerald-600" : 
                                                                            skill.status === 'mentioned' ? "text-amber-600" : "text-red-400"
                                                                        )}>
                                                                            {skill.status === 'found' ? "Matched" : 
                                                                             skill.status === 'mentioned' ? "Mentioned" : "Not found"}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )) : (
                                                                <div className="px-8 py-10 text-center opacity-40 italic font-bold text-sm">
                                                                    No specific must-have skills extracted from JD.
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="bg-gray-50/50 px-8 py-4 flex items-center gap-6 border-t border-gray-100">
                                                            {[
                                                                { label: "Confirmed in work history", color: "bg-emerald-500" },
                                                                { label: "Mentioned, no evidence", color: "bg-amber-500" },
                                                                { label: "Not found anywhere", color: "bg-red-500" },
                                                            ].map((l, i) => (
                                                                <div key={i} className="flex items-center gap-2">
                                                                    <div className={cn("h-2 w-2 rounded-full", l.color)} />
                                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{l.label}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>

                                </div>
                            )}



                            {/* ✅ Section 3: WHAT HE DOES BRING vs CRITICAL GAPS */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left Card: Strengths */}
                                <div className="space-y-4">
                                    <p className="text-gray-500 font-black tracking-widest text-[11px] uppercase opacity-70">
                                        What he does bring
                                    </p>
                                    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-10 h-full min-h-[400px]">
                                        <div className="space-y-10">
                                            {aiData.strengths && aiData.strengths.length > 0 ? aiData.strengths.map((s: any, i: number) => (
                                                <div key={i} className="space-y-2 animate-in fade-in slide-in-from-left-4" style={{ animationDelay: `${i * 150}ms` }}>
                                                    <h4 className="text-[17px] font-bold text-[#059669] tracking-tight">
                                                        {typeof s === 'string' ? s : s.point}
                                                    </h4>
                                                    <p className="text-[14px] text-gray-600 leading-relaxed font-medium">
                                                        {s.evidence || "Strong evidence across past roles and projects."}
                                                    </p>
                                                </div>
                                            )) : (
                                                <div className="h-full flex items-center justify-center opacity-30 italic font-bold">
                                                    No standout strengths detected.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Card: Gaps */}
                                <div className="space-y-4">
                                    <p className="text-gray-500 font-black tracking-widest text-[11px] uppercase opacity-70">
                                        Critical gaps for this role
                                    </p>
                                    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-10 h-full min-h-[400px]">
                                        <div className="space-y-10">
                                            {aiData.concerns && aiData.concerns.length > 0 ? aiData.concerns.map((c: any, i: number) => (
                                                <div key={i} className="space-y-3 animate-in fade-in slide-in-from-right-4" style={{ animationDelay: `${i * 150}ms` }}>
                                                    <h4 className="text-[17px] font-bold text-[#991b1b] tracking-tight">
                                                        {c.point}
                                                    </h4>
                                                    <p className="text-[14px] text-gray-600 leading-relaxed font-medium">
                                                        {c.impact}
                                                    </p>
                                                    {c.missing_skills && c.missing_skills.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            {c.missing_skills.map((skill: string, si: number) => (
                                                                <span key={si} className="px-2.5 py-1 rounded-md bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-widest border border-red-100/50">
                                                                    {skill}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )) : (
                                                <div className="h-full flex items-center justify-center opacity-30 italic font-bold">
                                                    No critical gaps identified.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ✅ Section 4: EXPERIENCE VS REQUIREMENT */}
                            <div className="space-y-4">
                                <p className="text-gray-500 font-black tracking-widest text-[11px] uppercase opacity-70">
                                    Experience vs Requirement
                                </p>
                                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden p-10 space-y-10">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                        {/* Row 1 Left: Years of Exp */}
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Years of experience</p>
                                            <div className="bg-gray-50/50 rounded-2xl p-8 border border-gray-100 flex items-center gap-6">
                                                <span className="text-5xl font-black text-red-500 tracking-tighter tabular-nums leading-none">
                                                    {candidate.experienceYears || aiData.experience_assessment?.years || "—"}
                                                </span>
                                                <div className="space-y-1">
                                                    <p className="text-[16px] font-bold text-gray-900 tracking-tight">
                                                        Candidate has {candidate.experienceYears || aiData.experience_assessment?.years || "no documented"} years total
                                                    </p>
                                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">
                                                        {aiData.experience_assessment?.vs_required || "JD requirements match check"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Row 1 Right: Seniority Chart */}
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seniority alignment</p>
                                            <div className="bg-gray-50/50 rounded-2xl p-8 border border-gray-100 relative min-h-[140px] flex flex-col justify-center">
                                                {/* Scale */}
                                                <div className="flex justify-between px-2 mb-4">
                                                    {["Intern", "Junior", "Mid", "Senior", "Lead"].map((l, i) => (
                                                        <span key={i} className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{l}</span>
                                                    ))}
                                                </div>
                                                <div className="relative h-10 w-full bg-gray-100/50 rounded-xl px-2 flex items-center">
                                                    {/* Markers */}
                                                    {(() => {
                                                        const alignment = aiData.seniority_alignment;
                                                        if (!alignment) return <div className="w-full text-center text-[10px] font-bold text-gray-400 italic">No alignment data found</div>;
                                                        
                                                        const levels = [0, 1, 2, 3, 4];
                                                        const candPos = (alignment.candidate_level / 4) * 100;
                                                        const jdPos = (alignment.jd_level / 4) * 100;

                                                        return (
                                                            <>
                                                                <div className="absolute top-0 bottom-0 w-px bg-gray-200 left-[25%]" />
                                                                <div className="absolute top-0 bottom-0 w-px bg-gray-200 left-[50%]" />
                                                                <div className="absolute top-0 bottom-0 w-px bg-gray-200 left-[75%]" />
                                                                
                                                                {/* JD Marker */}
                                                                <div 
                                                                    className="absolute h-8 w-16 bg-blue-200 text-blue-800 rounded-lg flex items-center justify-center text-[10px] font-black border border-blue-300 shadow-sm transition-all duration-1000"
                                                                    style={{ left: `calc(${jdPos}% - 32px)`, zIndex: 10 }}
                                                                >
                                                                    JD
                                                                </div>

                                                                {/* Candidate Marker */}
                                                                <div 
                                                                    className="absolute h-8 w-16 bg-red-200 text-red-800 rounded-lg flex items-center justify-center text-[10px] font-black border border-red-300 shadow-sm transition-all duration-1000"
                                                                    style={{ left: `calc(${candPos}% - 32px)`, zIndex: 20 }}
                                                                >
                                                                    Vamsi
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                {aiData.seniority_alignment && (
                                                    <div className="flex gap-4 mt-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-2 w-2 rounded-full bg-red-300" />
                                                            <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Candidate — {aiData.seniority_alignment.candidate_label}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-2 w-2 rounded-full bg-blue-300" />
                                                            <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">JD requires — {aiData.seniority_alignment.jd_label}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Career Progression Detail Table */}
                                    <div className="pt-8 border-t border-gray-100">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Career progression pattern</p>
                                        <div className="space-y-6">
                                            {[
                                                { label: "Pattern", value: aiData.career_progression_details?.pattern || aiData.career_progression?.pattern, color: "text-blue-600", note: aiData.career_progression_details?.role_flow || aiData.career_progression?.analysis, subNote: aiData.career_progression_details?.pattern_note },
                                                { label: "Company types", value: aiData.career_progression_details?.company_types, isBold: true, subNote: aiData.career_progression_details?.company_note },
                                                { label: "Tenure avg", value: aiData.career_progression_details?.tenure_avg, color: "text-orange-600", subNote: aiData.career_progression_details?.tenure_note },
                                            ].map((row, i) => (
                                                <div key={i} className="flex gap-8 items-start">
                                                    <p className="w-32 text-[13px] font-black text-gray-400 uppercase tracking-widest pt-1">{row.label}</p>
                                                    <div className="flex-1 space-y-1">
                                                        <p className="text-[15px] font-bold text-gray-700 leading-none">
                                                            <span className={cn(row.color, row.isBold ? "font-black" : "")}>{row.value || "—"}</span>
                                                            <span className="ml-3 font-medium text-gray-400">{row.note}</span>
                                                        </p>
                                                        {row.subNote && <p className="text-xs font-bold text-gray-400 truncate opacity-80">{row.subNote}</p>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ✅ Section 5: CAREER TIMELINE — WHAT HE ACTUALLY DID */}
                            <div className="space-y-6">
                                <p className="text-gray-500 font-black tracking-widest text-[11px] uppercase opacity-70">
                                    Career Timeline — What he actually did
                                </p>
                                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-12">
                                    <div className="relative pl-8 space-y-12">
                                        {/* Vertical Track Line */}
                                        <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-gray-100 ml-[5px]" />

                                        {(() => {
                                            const history = aiData.work_history || workHistory || [];
                                            if (history.length === 0) return (
                                                <div className="py-10 text-center opacity-30 italic font-bold">
                                                    No career history extracted yet.
                                                </div>
                                            );

                                            return history.map((role: any, idx: number) => {
                                                const isLatest = idx === 0;
                                                const techStack = role.technologies_used || [];
                                                
                                                // Fallback for summary if recruiter_summary is missing (older scans)
                                                const summary = role.recruiter_summary || (role.what_they_built && Array.isArray(role.what_they_built) ? role.what_they_built.join('. ') : "No detailed summary available.");

                                                return (
                                                    <div key={idx} className="relative animate-in fade-in slide-in-from-left-4" style={{ animationDelay: `${idx * 150}ms` }}>
                                                        {/* Node Dot */}
                                                        <div className={cn(
                                                            "absolute -left-[30px] top-1.5 h-3.5 w-3.5 rounded-full border-4 border-white shadow-sm ring-2 ring-transparent",
                                                            isLatest ? "bg-blue-600 ring-blue-100" : "bg-gray-300"
                                                        )} />

                                                        <div className="space-y-4">
                                                            <div>
                                                                <h4 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-1">
                                                                    {role.role}
                                                                </h4>
                                                                <p className="text-[14px] font-bold text-gray-500">
                                                                    {role.company} <span className="opacity-30 mx-1">·</span> <span className="capitalize">{role.company_type || "Company"}</span>
                                                                </p>
                                                                <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                                                    {role.start_date || role.start_year || "?"} — {role.end_date || (role.is_current ? "present" : role.end_year) || "?"} 
                                                                    <span className="opacity-30 mx-2">·</span> 
                                                                    ~{role.duration_months ? `${role.duration_months} months` : "duration n/a"}
                                                                </p>
                                                            </div>

                                                            <div className="bg-gray-50/80 rounded-2xl p-6 border border-gray-100/50">
                                                                <p className="text-[15px] font-bold text-gray-700 leading-relaxed">
                                                                    {summary}
                                                                </p>
                                                            </div>

                                                            <div className="flex flex-wrap gap-2">
                                                                {techStack.map((tech: string, sIdx: number) => (
                                                                    <span key={sIdx} className="px-3 py-1.5 rounded-lg bg-white border border-gray-100 text-[11px] font-bold text-[#2563eb] shadow-sm">
                                                                        {tech}
                                                                    </span>
                                                                ))}
                                                            </div>

                                                            {role.overlap_note && (
                                                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100 text-[10px] font-black uppercase tracking-widest mt-2">
                                                                    {role.overlap_note}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                        </div>
                                    </div>
                                </div>





                            {/* ✅ Section: INTEGRITY SIGNALS & SUITABILITY Checklist */}
                            <div className="space-y-12 py-8">
                                {/* Integrity Signals Pills */}
                                <div className="space-y-5">
                                    <p className="text-[#94A3B8] font-black tracking-[0.2em] text-[11px] uppercase ml-1">
                                        Integrity Signals
                                    </p>
                                    <div className="flex flex-col gap-3">
                                        {(() => {
                                            const signals = aiData.integrity_signals || (redFlags.map((f: any) => ({
                                                level: f.severity,
                                                label: f.flag?.replace('_', ' ') || "Concern",
                                                summary: f.detail
                                            }))) || [];
                                            
                                            if (signals.length === 0) return (
                                                <div className="px-6 py-3 rounded-2xl bg-gray-50 text-gray-400 text-[12px] font-black uppercase tracking-widest border border-gray-100 italic shadow-sm">
                                                    No specific integrity signals detected
                                                </div>
                                            );

                                            return signals.map((signal: any, i: number) => {
                                                const isMedium = signal.level?.toLowerCase() === 'medium';
                                                const isHigh = signal.level?.toLowerCase() === 'high';
                                                
                                                return (
                                                    <div 
                                                        key={i} 
                                                        className={cn(
                                                            "w-fit px-6 py-2.5 rounded-[20px] text-[15px] font-bold transition-all shadow-md border border-white/40",
                                                            isHigh ? "bg-red-500 text-white shadow-red-200" :
                                                            isMedium ? "bg-[#FFB02E] text-slate-900 shadow-[0_4px_12px_rgba(255,176,46,0.25)]" : 
                                                            "bg-[#F1F5F9] text-[#475569] shadow-slate-100"
                                                        )}
                                                    >
                                                        <span className="font-black capitalize">{signal.level} {isHigh || isMedium ? "risk" : ""}</span> — {signal.summary || signal.label}
                                                        {signal.details && <span className="opacity-70 ml-1.5 font-medium text-[13px]">: {signal.details}</span>}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>

                                {/* Suitability Analysis Card (Always visible shell with fallbacks) */}
                                {(aiData.suitability_analysis || aiData.reasoning || aiData.breakdown) && (
                                    <div className="bg-[#EBF5FF] rounded-[32px] border border-[#D1E9FF] p-12 space-y-8 shadow-lg animate-in fade-in duration-700">
                                        <h4 className="text-[20px] font-black text-[#1C4E80] tracking-tight leading-none">
                                            What would make {candidate.fullName.split(' ')[0]} suitable for this role
                                        </h4>
                                        <div className="space-y-5">
                                            {(() => {
                                                const suggestions = (aiData.suitability_analysis?.suggestions || []).filter((s: string) => s && s.trim().length > 0);
                                                
                                                // Primary Fallback: Strengths
                                                let displayItems = suggestions.length > 0 ? suggestions : 
                                                    (aiData.strengths || [])
                                                        .map((s: any) => typeof s === 'string' ? s : s.strength)
                                                        .filter((s: string) => s && s.trim().length > 0)
                                                        .slice(0, 3);

                                                // Secondary Fallback: Extract from Summary/Verdict if still empty
                                                if (displayItems.length === 0) {
                                                    const rawText = String(aiData.ai_verdict || aiData.reasoning || summary || "");
                                                    displayItems = rawText.split(/[.!?]/)
                                                        .map((s: string) => s.trim())
                                                        .filter((s: string) => s.length > 40) // only take meaningful sentences
                                                        .slice(0, 2);
                                                }

                                                if (displayItems.length === 0) return (
                                                    <p className="text-sm italic text-blue-400 font-bold opacity-60">Analysis of upskilling requirements pending...</p>
                                                );

                                                return displayItems.map((item: string, i: number) => (
                                                    <div key={i} className="flex items-start gap-4 animate-in fade-in slide-in-from-left duration-500" style={{ animationDelay: `${i * 100}ms` }}>
                                                        <span className="text-xl text-[#3B82F6] flex-shrink-0 mt-[-2px] font-black">→</span>
                                                        <p className="text-[17px] font-bold text-[#1C4E80] leading-[1.45]">
                                                            {item.replace(/^[•\s→-]+/, '')}
                                                        </p>
                                                    </div>
                                                ));
                                            })()}

                                            <div className="flex items-start gap-4 pt-4 border-t border-blue-100/50 mt-2">
                                                <span className="text-xl text-[#3B82F6] flex-shrink-0 mt-[-2px] font-black">→</span>
                                                <p className="text-[17px] font-bold text-[#1C4E80] leading-[1.45]">
                                                    Estimated readiness timeline: <span className="underline decoration-blue-300 decoration-4 underline-offset-4">{aiData.suitability_analysis?.readiness_timeline || "6-12 months"}</span> with deliberate upskilling in a high-growth environment
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ✅ Section: SKILLS ON RESUME */}
                            <div className="space-y-4">
                                <p className="text-gray-500 font-black tracking-widest text-[11px] uppercase opacity-70">
                                    Skills on Resume
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {techSkills.map((s: string, i: number) => (
                                        <span key={`tech-${i}`} className="px-3.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-[12px] font-bold">
                                            {s}
                                        </span>
                                    ))}
                                    {toolSkills.map((s: string, i: number) => (
                                        <span key={`tool-${i}`} className="px-3.5 py-1.5 rounded-xl bg-gray-50 text-gray-700 border border-gray-100 text-[12px] font-bold">
                                            {s}
                                        </span>
                                    ))}
                                    {domainSkills.map((s: string, i: number) => (
                                        <span key={`domain-${i}`} className="px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-[12px] font-bold">
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* ✅ AI System Verdict (Moved to bottom) */}
                            <div className="space-y-8">
                                <div className="space-y-1">
                                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">Candidate Analysis</h3>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Executive Talent Synthesis — Recruiter Snapshot</p>
                                </div>
                                <div className={cn(
                                    "bg-white rounded-[32px] border shadow-[0_8px_32px_rgba(0,0,0,0.03)] p-10 relative overflow-hidden",
                                    normalizedStatus === "Shortlisted" ? "border-green-200 bg-green-50/20" :
                                        normalizedStatus === "Borderline" ? "border-orange-200 bg-orange-50/20" :
                                            normalizedStatus === "Rejected" ? "border-red-200 bg-red-50/20" : "border-blue-200 bg-blue-50/20"
                                )}>
                                    <div className="flex items-center gap-6 mb-8">
                                        <div className={cn(
                                            "h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg",
                                            normalizedStatus === "Shortlisted" ? "bg-green-100 text-green-600" :
                                                normalizedStatus === "Borderline" ? "bg-orange-100 text-orange-600" :
                                                    normalizedStatus === "Rejected" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                                        )}>
                                            {normalizedStatus === "Shortlisted" ? <CheckCircle2 className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
                                        </div>
                                        <div>
                                            <p className={cn("text-[10px] font-black uppercase tracking-[0.3em] mb-1.5",
                                                normalizedStatus === "Shortlisted" ? "text-green-600" :
                                                    normalizedStatus === "Borderline" ? "text-orange-600" :
                                                        normalizedStatus === "Rejected" ? "text-red-600" : "text-blue-600"
                                            )}>Decision Consensus</p>
                                            <h3 className={cn("text-3xl font-black tracking-tighter uppercase",
                                                normalizedStatus === "Shortlisted" ? "text-green-800" :
                                                    normalizedStatus === "Borderline" ? "text-orange-800" :
                                                        normalizedStatus === "Rejected" ? "text-red-800" : "text-blue-800"
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
                                    <div className="space-y-12">
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                            {/* LEFT COLUMN: Summary & Metadata */}
                                            <div className="space-y-8">
                                                <div className="p-8 rounded-[32px] bg-indigo-50/40 border border-indigo-100 shadow-sm relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                                        <Sparkles className="h-12 w-12 text-indigo-600" />
                                                    </div>
                                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">AI Sentiment Analysis</p>
                                                    <div className="space-y-6">
                                                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                                            <p className="text-[15px] font-bold text-gray-700 leading-snug italic relative z-10">
                                                                &ldquo;{interviewAiSummary ? (interviewAiSummary.split(' ').slice(0, 60).join(' ') + (interviewAiSummary.split(' ').length > 60 ? '...' : '')) : "AI is synthesizing..."}&rdquo;
                                                            </p>
                                                        </div>

                                                        <div className="pt-6 border-t border-indigo-100/50 flex flex-wrap gap-4">
                                                            <div className="flex flex-col gap-1">
                                                                <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Duration</p>
                                                                <p className="text-xl font-black text-gray-900 tracking-tight">{recordingDurationSec ? formatDuration(recordingDurationSec) : "..."}</p>
                                                            </div>
                                                            <div className="w-[1px] h-10 bg-indigo-100 hidden sm:block" />
                                                            <div className="flex flex-col gap-1">
                                                                <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Words Spoken</p>
                                                                <p className="text-xl font-black text-gray-900 tracking-tight">
                                                                    {interviewTranscript ? `${interviewTranscript.split(' ').length}` : "..."}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* RIGHT COLUMN: Video Player & Transcript */}
                                            <div className="space-y-6">
                                                <div className="space-y-4">
                                                    <div className="rounded-3xl border-8 border-gray-900 bg-black overflow-hidden shadow-2xl relative">
                                                        <style jsx global>{`
                                                            .plyr--full-ui {
                                                                --plyr-color-main: #F97316;
                                                            }
                                                        `}</style>
                                                        <Plyr
                                                            key={interviewRecordingUrl}
                                                            ref={plyrRef}
                                                            source={{
                                                                type: "video",
                                                                sources: [{ src: interviewRecordingUrl, type: "video/mp4" }],
                                                            }}
                                                            options={{
                                                                duration: recordingDurationSec || undefined,
                                                                controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "captions", "settings", "pip", "fullscreen"],
                                                            }}
                                                        />
                                                    </div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Cloudflare R2 Encrypted Recording</p>
                                                </div>

                                                <div className="space-y-6 pt-4 border-t border-gray-100">
                                                    <div className="flex items-center gap-4">
                                                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 flex-shrink-0">Full Session Log</h3>
                                                        <div className="h-[1px] flex-1 bg-gray-100" />
                                                    </div>

                                                    <div className="relative h-[550px]">
                                                        {/* Cinematic Fade Mask Overlay */}
                                                        <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-b from-white via-transparent to-transparent h-40 opacity-100" />
                                                        
                                                        <div 
                                                            className="h-full overflow-y-auto custom-scrollbar p-6 flex flex-col-reverse gap-4 scroll-smooth"
                                                            style={{ 
                                                                maskImage: 'linear-gradient(to top, black 30%, transparent 95%)',
                                                                WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 95%)'
                                                            }}
                                                        >
                                                            {interviewTranscript ? interviewTranscript.split('\n').filter((line: string) => line.trim()).reverse().map((line: string, idx: number) => {
                                                                // Our agent writes "Interviewer: ..." and "Candidate: ..."
                                                                const isAI = line.startsWith('Interviewer:');
                                                                const isUser = line.startsWith('Candidate:');
                                                                const cleanLine = line.replace(/^(Interviewer:|Candidate:|ai:|user:|system:)\s*/i, '').trim();
                                                                const label = isAI ? "Ishita (AI interviewer)" : isUser ? "Candidate" : "System";

                                                                return (
                                                                    <div key={idx} className="flex gap-4 py-4 animate-in slide-in-from-bottom-4 fade-in duration-700">
                                                                        <div className={`flex-shrink-0 h-9 w-9 rounded-2xl flex items-center justify-center text-[10px] font-black shadow-sm ${
                                                                            isAI ? 'bg-indigo-600 text-white' : 
                                                                            isUser ? 'bg-orange-500 text-white' : 
                                                                            'bg-gray-100 text-gray-500'
                                                                        }`}>
                                                                            {isAI ? 'AI' : isUser ? 'C' : 'S'}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${
                                                                                isAI ? 'text-indigo-400' : 
                                                                                isUser ? 'text-orange-400' : 
                                                                                'text-gray-400'
                                                                            }`}>{label}</p>
                                                                            <p className="text-gray-800 leading-relaxed font-bold text-[15px]">{cleanLine}</p>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }) : (
                                                                <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3">
                                                                    <RefreshCw className="h-8 w-8 animate-spin" />
                                                                    <p className="text-xs font-black uppercase tracking-widest">Reconstructing Log...</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-20 flex flex-col items-center gap-4 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                                        <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center"><EyeOff className="h-6 w-6 text-gray-300" /></div>
                                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest text-center">Interview not yet completed <br /><span className="text-[10px] font-bold lowercase italic opacity-60">Wait for candidate submission</span></p>
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


