"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    ArrowLeft, Download, Mail, Phone, MapPin, Calendar,
    CheckCircle2, XCircle, Sparkles, Zap,
    TrendingUp, AlertTriangle, ChevronRight, ShieldCheck, Terminal, UserSearch,
    BrainCircuit, MessageSquare, Code2, BarChart3, Clock, Target, CheckSquare,
    Eye, Mic, Camera, BarChart, Clipboard, Maximize2, UserX, Users, EyeOff, Smartphone, Cpu, ChevronDown, ChevronUp,
    User, FileText, Globe, IndianRupee, BriefcaseBusiness, Loader2, RefreshCw
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
    const [activeTab, setActiveTab] = useState<"analysis" | "interview" | "assessment">("analysis");
    const [expandedSection, setExpandedSection] = useState<string | null>("assessment");
    const [isIncidentLogExpanded, setIsIncidentLogExpanded] = useState(false);
    const [scanning, setScanning] = useState(false);
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

    useEffect(() => {
        setRecordingDurationSec(null);
    }, [candidate?.interview?.interviewRecordingUrl, candidate?.assessment?.interviewRecordingUrl]);

    const handleRescan = async () => {
        setScanning(true);
        try {
            const res = await fetch(`/api/candidates/${id}/scan`, { method: "POST" });
            if (res.ok) {
                const updated = await res.json();
                setCandidate(updated);
                alert("AI Analysis completed successfully!");
            } else {
                const err = await res.json();
                alert(`Scan failed: ${err.error || "Unknown error"}`);
            }
        } catch (error) {
            console.error("Scan error:", error);
            alert("Failed to trigger scan.");
        } finally {
            setScanning(false);
        }
    };

    const handleResendInterview = async () => {
        setResendingInterview(true);
        try {
            const res = await fetch(`/api/candidates/${id}/resend-interview`, { method: "POST" });
            if (res.ok) {
                alert("Interview link resent successfully! New email sent.");
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

    const aiReportRaw = candidate ? (candidate.aiReport ? JSON.parse(candidate.aiReport) : null) : null;
    const aiData = aiReportRaw || {};
    const structuredResume = candidate ? (candidate.structuredResume ? (typeof candidate.structuredResume === 'string' ? JSON.parse(candidate.structuredResume) : candidate.structuredResume) : {}) : {};
    
    const summary = aiData.summary || structuredResume.summary || aiData.reasoning || "AI analysis pending for this candidate.";
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

    // Duration fixing useEffect moved to top levels
    useEffect(() => {
        // Try to pre-populate from DB first
        const dbDuration = candidate?.interview?.interviewDuration || candidate?.assessment?.interviewDuration;
        if (dbDuration && dbDuration > 0) {
            setRecordingDurationSec(dbDuration);
            console.log("Pre-populated duration from DB:", dbDuration);
        }
    }, [candidate?.interview?.interviewDuration, candidate?.assessment?.interviewDuration]);


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
    const formatDuration = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = Math.floor(totalSeconds % 60);
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}:${s}min`;
    };

    const techSkills = structuredResume.skills?.technical || [];
    const toolSkills = structuredResume.skills?.tools || [];
    const softSkills = structuredResume.skills?.soft_skills || [];
    const projects = structuredResume.projects || [];

    const statusColors: Record<string, string> = {
        Shortlisted: "bg-green-50 text-green-700",
        Borderline:  "bg-amber-50 text-amber-700",
        Rejected:    "bg-red-50 text-red-600",
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
                                ].filter(item => item.value !== "N/A" && item.value !== "Exp N/A" && item.value !== "N/A, ").map(({ icon: Icon, value }) => (
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
                        
                        {(!candidate.aiScore || candidate.aiScore === 0) && (
                            <Button
                                onClick={handleRescan}
                                disabled={scanning}
                                className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-[0_4px_20px_rgba(79,70,229,0.3)] transition-all"
                            >
                                {scanning ? <Zap className="h-4 w-4 mr-2 animate-pulse" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                {scanning ? "Scanning..." : "Scan Resume"}
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
                <div className={cn("space-y-6 transition-all duration-500", activeTab === "assessment" ? "lg:col-span-3" : "lg:col-span-2")}>
                    {activeTab === "analysis" && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                            <div className="relative bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden p-8">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-300 via-[#F97316] to-orange-400" />
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
                                        <Sparkles className="h-5 w-5 text-[#F97316]" />
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-900 text-base">AI Evaluation Summary</p>
                                        <p className="text-xs font-bold text-gray-400">Based on resume parsing and initial screening</p>
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-orange-50/60 to-amber-50/30 rounded-2xl p-6 border border-orange-100/50">
                                    <p className="text-gray-700 leading-relaxed font-medium text-[15px]">{summary}</p>
                                </div>
                            </div>

                            <div className={cn(
                                "bg-white rounded-2xl border shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-8 relative overflow-hidden",
                                normalizedStatus === "Shortlisted" ? "border-green-100" : "border-red-100"
                            )}>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center",
                                        normalizedStatus === "Shortlisted" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                                    )}>
                                        {normalizedStatus === "Shortlisted" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                                    </div>
                                    <p className={cn("font-black text-base", normalizedStatus === "Shortlisted" ? "text-green-800" : "text-red-700")}>
                                        Why {normalizedStatus}?
                                    </p>
                                </div>
                                <p className="text-gray-600 leading-relaxed font-medium">
                                    {aiData.reasoning || "The AI evaluation determined this candidate's profile aligns with the role requirements."}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="h-9 w-9 rounded-xl bg-green-50 flex items-center justify-center">
                                            <TrendingUp className="h-4 w-4 text-green-600" />
                                        </div>
                                        <p className="font-black text-gray-900 text-sm">Key Strengths</p>
                                    </div>
                                    <ul className="space-y-3">
                                        {strengths.length > 0 ? strengths.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-sm">
                                                <div className="h-5 w-5 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                </div>
                                                <span className="text-gray-600 font-bold leading-snug">{s}</span>
                                            </li>
                                        )) : <li className="text-sm text-gray-400 font-bold">No specific strengths identified.</li>}
                                    </ul>
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="h-9 w-9 rounded-xl bg-orange-50 flex items-center justify-center">
                                            <AlertTriangle className="h-4 w-4 text-[#F97316]" />
                                        </div>
                                        <p className="font-black text-gray-900 text-sm">Potential Concerns</p>
                                    </div>
                                    <ul className="space-y-3">
                                        {weaknesses.length > 0 ? weaknesses.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-sm">
                                                <div className="h-5 w-5 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <XCircle className="h-3 w-3 text-orange-600" />
                                                </div>
                                                <span className="text-gray-600 font-bold leading-snug">{s}</span>
                                            </li>
                                        )) : <li className="text-sm text-gray-400 font-bold">No specific concerns identified.</li>}
                                    </ul>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-8">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                        <Terminal className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <p className="font-black text-gray-900 text-base">Technical Profile</p>
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

                            {/* Removed Key Projects section as requested */}
                        </div>
                    )}

                    {activeTab === "interview" && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                            <div className="relative bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden p-8">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-300 via-indigo-500 to-indigo-400" />
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                        <Camera className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-900 text-base">Interview Recording & Transcript</p>
                                        <p className="text-xs font-bold text-gray-400">Stored in candidate profile for review</p>
                                    </div>
                                </div>

                                {candidate?.interview?.aiSummary && (
                                    <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-6 mb-6">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles className="h-4 w-4 text-indigo-600" />
                                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">AI Interview Narrative Summary</p>
                                        </div>
                                        <p className="text-gray-700 leading-relaxed font-bold text-sm italic">
                                            "{candidate.interview.aiSummary}"
                                        </p>
                                    </div>
                                )}

                                {interviewRecordingUrl ? (
                                    <div className="space-y-5">
                                        <div className="rounded-2xl border border-gray-100 bg-black overflow-hidden shadow-2xl relative group">
                                            <style jsx global>{`
                                                .plyr--full-ui {
                                                    --plyr-color-main: #F97316;
                                                    --plyr-video-background: #000;
                                                    --plyr-menu-background: rgba(26, 26, 26, 0.9);
                                                    --plyr-menu-color: #fff;
                                                }
                                                .plyr__control--overlaid {
                                                    background: rgba(249, 115, 22, 0.8) !important;
                                                    z-index: 10;
                                                }
                                                .plyr__control--overlaid:hover {
                                                    background: #F97316 !important;
                                                }
                                            `}</style>
                                            <Plyr
                                                ref={plyrRef}
                                                source={{
                                                    type: "video",
                                                    sources: [{ src: interviewRecordingUrl, type: "video/webm" }],
                                                }}
                                                options={{
                                                    duration: recordingDurationSec && recordingDurationSec > 0 ? recordingDurationSec : undefined,
                                                    controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "captions", "settings", "pip", "airplay", "fullscreen"],
                                                    settings: ["quality", "speed"],
                                                    speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
                                                }}
                                            />
                                        </div>
                                        {recordingDurationSec !== null ? (
                                            recordingDurationSec > 0 ? (
                                                <div className="flex items-baseline gap-2.5 bg-orange-50/50 border border-orange-100 rounded-2xl px-5 py-3.5 w-fit">
                                                    <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                                                    <div className="flex flex-col">
                                                        <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Interview Duration</p>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-xl font-black text-gray-900 tracking-tight">{formatDuration(recordingDurationSec)}</span>
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">({Math.round(recordingDurationSec)}s Total)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3.5 w-fit">
                                                    <AlertTriangle className="h-4 w-4 text-orange-400" />
                                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Duration Unavailable</p>
                                                </div>
                                            )
                                        ) : (
                                            <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3.5 w-fit animate-pulse">
                                                <Loader2 className="h-4 w-4 text-orange-400 animate-spin" />
                                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Identifying Recording Duration...</p>
                                            </div>
                                        )}
                                        <a href={interviewRecordingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-bold text-indigo-600 hover:text-indigo-700">Open raw recording in new tab</a>
                                    </div>
                                ) : (
                                    <p className="text-sm font-medium text-gray-500">Recording not available yet.</p>
                                )}

                                <div className="mt-6">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Full Transcript</p>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 max-h-64 overflow-auto">
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{interviewTranscript || "Transcript not available yet."}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {activeTab === "analysis" && (
                    <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">
                            <div className="h-1 w-full bg-gradient-to-r from-orange-300 via-[#F97316] to-orange-400" />
                            <div className="px-6 pt-6 pb-2 flex items-center gap-2">
                                <Zap className="h-4 w-4 text-[#F97316]" />
                                <p className="font-black text-[11px] uppercase tracking-widest text-gray-400">AI Match Score</p>
                            </div>
                            <div className="px-6 pb-8 flex flex-col items-center">
                                <ScoreRing score={score} />
                                <p className="text-xs font-bold text-gray-400 text-center mt-4">Match for <span className="font-black text-gray-800">{candidate.drive?.title || "Role"}</span></p>
                            </div>
                        </div>

                        <div className={cn(
                            "rounded-2xl border shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6 relative overflow-hidden",
                            normalizedStatus === "Shortlisted" ? "bg-green-50 border-green-100" :
                            normalizedStatus === "Rejected"    ? "bg-red-50 border-red-100"     : "bg-orange-50 border-orange-100"
                        )}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
                                    normalizedStatus === "Shortlisted" ? "bg-green-100" :
                                    normalizedStatus === "Rejected"    ? "bg-red-100"   : "bg-orange-100"
                                )}>
                                    {normalizedStatus === "Shortlisted" ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : normalizedStatus === "Rejected" ? <XCircle className="h-5 w-5 text-red-500" /> : <Sparkles className="h-5 w-5 text-[#F97316]" />}
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">AI Verdict</p>
                                    <p className={cn("text-xl font-black leading-tight", normalizedStatus === "Shortlisted" ? "text-green-700" : normalizedStatus === "Rejected" ? "text-red-600" : "text-[#F97316]")}>{normalizedStatus === "Shortlisted" ? "Approved" : normalizedStatus}</p>
                                </div>
                            </div>
                            <p className="text-xs font-bold text-gray-500 leading-relaxed">
                                {normalizedStatus === "Shortlisted" ? "This candidate meets the role requirements and has been approved by AI screening." : normalizedStatus === "Rejected" ? "This candidate did not meet the minimum criteria based on AI analysis." : "AI screening is in progress for this candidate."}
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-6">
                            <p className="font-black text-[11px] uppercase tracking-widest text-gray-400 mb-5">Candidate Details</p>
                            <div className="space-y-0 divide-y divide-gray-50">
                                {[
                                    { label: "Applied Date", value: mounted ? new Date(candidate.createdAt).toLocaleDateString() : "--/--/----", icon: Calendar },
                                    { label: "Phone", value: candidate.phone || "N/A", icon: Phone },
                                    { label: "Email", value: candidate.email, icon: Mail, truncate: true },
                                ].map(({ label, value, icon: Icon, truncate }) => (
                                    <div key={label} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                                        <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0"><Icon className="h-3.5 w-3.5 text-gray-400" /></div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                                            <p className={cn("text-sm font-black text-gray-800 mt-0.5", truncate && "truncate")} title={truncate ? value : undefined}>{value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showSubmissionPreview && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowSubmissionPreview(false)} />
                    <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div><h2 className="text-xl font-black text-gray-900 tracking-tight">Candidate Submission</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Full Application Data</p></div>
                            <Button variant="ghost" size="icon" onClick={() => setShowSubmissionPreview(false)} className="rounded-xl hover:bg-gray-100"><XCircle className="h-6 w-6 text-gray-400" /></Button>
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
                            <section className="space-y-4 pt-4 border-t border-gray-100">
                                <details className="group">
                                    <summary className="flex items-center justify-between cursor-pointer list-none"><div className="flex items-center gap-2 text-gray-400 group-hover:text-gray-600 transition-all"><ShieldCheck className="h-4 w-4" /><h3 className="text-xs font-black uppercase tracking-widest">Complete Submission Audit</h3></div><ChevronDown className="h-4 w-4 text-gray-300 group-open:rotate-180 transition-transform" /></summary>
                                    <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/50 p-6 overflow-hidden"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 italic">This is a read-only snapshot of the raw data submitted by the candidate.</p><pre className="text-[11px] font-mono text-gray-500 whitespace-pre-wrap leading-relaxed opacity-70">{JSON.stringify(candidate.submissionData || {}, null, 2)}</pre></div>
                                </details>
                            </section>
                        </div>
                        <div className="p-8 border-t border-gray-100 bg-gray-50/50"><Button onClick={() => setShowSubmissionPreview(false)} className="w-full h-12 rounded-xl bg-gray-900 text-white font-black hover:bg-black transition-all">CLOSE PREVIEW</Button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
