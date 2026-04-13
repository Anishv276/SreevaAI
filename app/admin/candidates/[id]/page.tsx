"use client";

import { use, useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    ArrowLeft, Download, Mail, Phone, MapPin, Calendar,
    CheckCircle2, XCircle, Sparkles, Zap, ArrowRight,
    TrendingUp, AlertTriangle, ChevronRight, ShieldCheck, Terminal, UserSearch,
    MessageSquare, Target, BriefcaseBusiness, Globe, IndianRupee, RefreshCw, Camera, Loader2, User, X, ChevronDown, ChevronUp, EyeOff, LayoutDashboard, FileText,
    MonitorSmartphone, UserCheck, Volume2, AlertCircle
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import "plyr-react/plyr.css";

const Plyr = dynamic(() => import("plyr-react").then((mod) => mod.Plyr), { ssr: false });


/* ── Premium Score Indicator ─────────────────────────── */
function ScoreIndicator({ score }: { score: number; status?: string }) {
    const isHigh = score >= 80;
    const isMid = score >= 50;
    const color = isHigh ? "#10B981" : isMid ? "#F59E0B" : "#EF4444";
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score * 0.01) * circumference;

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

/* ── Communication Donut Chart ────────────────────────── */
function CommunicationDonutChart({ metrics }: { metrics: { label: string; value: number; color: string }[] }) {
    const [hovered, setHovered] = useState<number | null>(null);
    const [animProgress, setAnimProgress] = useState(0);

    useEffect(() => {
        let start: number | null = null;
        const duration = 1200;
        const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const step = (ts: number) => {
            if (!start) start = ts;
            const p = Math.min((ts - start) / duration, 1);
            setAnimProgress(ease(p));
            if (p < 1) requestAnimationFrame(step);
        };
        const raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, []);

    const size = 220;
    const cx = size / 2;
    const cy = size / 2;
    const R = 80;   // outer radius
    const r = 52;   // inner radius (donut hole)
    const gap = 3;  // gap between slices in degrees

    const total = metrics.reduce((s, m) => s + m.value, 0);
    const avg = Math.round(metrics.reduce((s, m) => s + m.value, 0) / metrics.length);

    // Build slice paths
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const pt = (rad: number, radius: number) => ({
        x: cx + radius * Math.cos(rad),
        y: cy + radius * Math.sin(rad),
    });

    let cursor = -90; // start at top
    const slices = metrics.map((m, i) => {
        const sliceDeg = (m.value / total) * 360 - gap;
        const startDeg = cursor + gap / 2;
        const endDeg = startDeg + sliceDeg * animProgress;
        cursor += (m.value / total) * 360;

        const startRad = toRad(startDeg);
        const endRad = toRad(endDeg);
        const largeArc = sliceDeg * animProgress > 180 ? 1 : 0;

        const o1 = pt(startRad, R);
        const o2 = pt(endRad, R);
        const i1 = pt(endRad, r);
        const i2 = pt(startRad, r);

        const path = [
            `M ${o1.x} ${o1.y}`,
            `A ${R} ${R} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
            `L ${i1.x} ${i1.y}`,
            `A ${r} ${r} 0 ${largeArc} 0 ${i2.x} ${i2.y}`,
            `Z`,
        ].join(' ');

        // midpoint angle for label tick
        const midRad = toRad(startDeg + (sliceDeg * animProgress) / 2);
        const labelR = R + 14;
        const labelPt = pt(midRad, labelR);

        return { path, color: m.color, label: m.label, value: m.value, labelPt, midRad, index: i };
    });

    const active = hovered !== null ? metrics[hovered] : null;

    return (
        <div className="flex flex-col items-center gap-6 py-2">
            {/* Chart */}
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} style={{ overflow: 'visible' }}>
                    {/* Drop shadow filter */}
                    <defs>
                        <filter id="slice-shadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#00000022" />
                        </filter>
                    </defs>

                    {slices.map((s, i) => (
                        <g key={s.label}>
                            <path
                                d={s.path}
                                fill={s.color}
                                opacity={hovered === null ? 1 : hovered === i ? 1 : 0.3}
                                style={{
                                    transform: hovered === i ? `translate(${Math.cos(s.midRad) * 5}px, ${Math.sin(s.midRad) * 5}px)` : 'none',
                                    transition: 'opacity 0.2s ease, transform 0.2s ease',
                                    cursor: 'pointer',
                                    filter: hovered === i ? 'url(#slice-shadow)' : 'none',
                                }}
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        </g>
                    ))}
                </svg>

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span
                        className="font-black leading-none tabular-nums transition-all duration-200"
                        style={{
                            fontSize: active ? 34 : 28,
                            color: active ? active.color : '#111827',
                        }}
                    >
                        {active ? active.value : avg}
                    </span>
                    <span
                        className="text-[9px] font-black uppercase tracking-[0.18em] mt-1 transition-all duration-200"
                        style={{ color: active ? active.color : '#9CA3AF' }}
                    >
                        {active ? active.label : 'Overall'}
                    </span>
                </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 w-full px-2">
                {metrics.map((m, i) => (
                    <div
                        key={m.label}
                        className="flex items-center gap-2.5 cursor-pointer group"
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <div
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0 transition-transform duration-200 group-hover:scale-125"
                            style={{ backgroundColor: m.color }}
                        />
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex-1">{m.label}</span>
                        <span
                            className="text-[12px] font-black tabular-nums transition-colors duration-200"
                            style={{ color: hovered === i ? m.color : '#111827' }}
                        >
                            {m.value}
                        </span>
                    </div>
                ))}
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
    const [showIntegrityDetails, setShowIntegrityDetails] = useState(false);
    const [isReportsMode, setIsReportsMode] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const plyrInstance = useRef<any>(null);

    // Scroll reveal animation hook
    useEffect(() => {
        if (activeTab !== "analysis") return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        const revealElements = document.querySelectorAll('.reveal');
        revealElements.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, [activeTab, loading, candidate]);


    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isReportsMode) {
            document.body.classList.add('reports-mode');
        } else {
            document.body.classList.remove('reports-mode');
        }
        return () => document.body.classList.remove('reports-mode');
    }, [isReportsMode]);

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




    const aiData = candidate?.aiReport ? JSON.parse(candidate.aiReport) : {};
    const [sessionLogMode, setSessionLogMode] = useState<'chat' | 'analysis'>('chat');
    const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);

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

    const displayAvatar = interviewSnapshot || candidate.passportUrl || 'https:' + '//' + 'api.dicebear.com/7.x/initials/svg?seed=' + candidate.fullName;

    const formatDuration = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds * 0.0166666);
        const s = Math.floor(totalSeconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}min`;
    };

    const renderText = (val: any) => {
        if (!val) return "";
        if (typeof val === 'string') return val;
        if (typeof val === 'object') {
            return val.point || val.text || val.value || JSON.stringify(val);
        }
        return String(val);
    };

    const techSkills = Array.isArray(structuredResume.skills?.technical)
        ? structuredResume.skills.technical.map((s: any) => typeof s === 'object' ? (s.skill || s.point || JSON.stringify(s)) : s)
        : [];
    const toolSkills = Array.isArray(structuredResume.skills?.tools)
        ? structuredResume.skills.tools.map((s: any) => (typeof s === 'object' ? (s.tool || s.point || JSON.stringify(s)) : s)).filter(Boolean)
        : [];
    const softSkills = Array.isArray(structuredResume.skills?.soft_skills)
        ? structuredResume.skills.soft_skills.map((s: any) => typeof s === 'object' ? (s.skill || s.point || JSON.stringify(s)) : s)
        : [];
    const domainSkills = Array.isArray(structuredResume.skills?.domain_skills)
        ? structuredResume.skills.domain_skills.map((s: any) => typeof s === 'object' ? (s.skill || s.point || JSON.stringify(s)) : s)
        : [];

    // integrity_signals from aiData (generated by LLM in generate_report)
    const integritySignals: any[] = aiData.integrity_signals || [];
    // redFlags: use concerns from aiReport (rich objects), fallback to integrity_signals, then structuredResume
    const redFlags: any[] = aiData.concerns || structuredResume.red_flags || [];
    // Career progression: prefer aiData.career_progression_details (from LLM), fallback to structuredResume
    const cpd = aiData.career_progression_details || null;
    const careerProgression = cpd
        ? {
            pattern: cpd.pattern,
            summary: cpd.pattern_note,
            company_types: cpd.company_types,
            industry_focus: cpd.company_note,
            tenure_avg: cpd.tenure_avg,
            tenure_sentiment: cpd.tenure_note,
        }
        : structuredResume.career_progression || null;
    // Work history: prefer annotated from aiData (richer), fallback to structuredResume
    const rawWorkHistory = Array.isArray(aiData.work_history_annotated) && aiData.work_history_annotated.length > 0
        ? aiData.work_history_annotated.map((job: any) => ({
            job_title: job.role,
            company: job.company,
            duration: [job.start_date, job.end_date].filter(Boolean).join(' – '),
            responsibilities: job.recruiter_summary,
            skills: job.technologies_used || [],
        }))
        : Array.isArray(structuredResume.work_history) ? structuredResume.work_history : [];
    const workHistory = rawWorkHistory;
    const breakdown = aiData.breakdown || null;
    // Suitability: from suitability_analysis object in aiData
    const upskillingList: string[] = Array.isArray(aiData.suitability_analysis?.suggestions)
        ? aiData.suitability_analysis.suggestions
        : (aiData.upskilling_suggestions || ["Core Competencies"]);
    const readinessTimeline: string = aiData.suitability_analysis?.readiness_timeline || aiData.readiness_timeline || "Review Required";
    // Experience comparison: from experience_assessment in aiData
    const expAssessment = aiData.experience_assessment || null;
    const expJd = expAssessment?.vs_required?.split(" vs ")?.[1] || aiData.experience_comparison?.jd || "N/A";
    const expCandidate = expAssessment ? `${expAssessment.years ?? "?"} yrs` : aiData.experience_comparison?.candidate || "N/A";
    // Verdict / decision
    const verdictLabel = aiData.verdict || normalizedStatus;
    const verdictSummary = aiData.decision_reason || aiData.verdict_summary || "Candidate matched based on initial screening criteria.";

    return (
        <div className="-m-8 md:-m-12 lg:-m-14 min-h-screen flex" style={{ fontFamily: 'Inter, sans-serif' }}>
            <style dangerouslySetInnerHTML={{
                __html: `
                #global-admin-sidebar { display: none !important; }
                #admin-main-wrapper { padding-left: 0 !important; }
                aside:not(#premium-reports-sidebar) { display: none !important; }
            ` }} />
            {/* ── Premium Reports Sidebar ─────────────────────────── */}
            <aside id="premium-reports-sidebar" className="hidden md:flex h-screen w-[240px] flex-col fixed left-0 top-0 z-40 bg-white border-r border-gray-100 shadow-[20px_0_60px_rgba(0,0,0,0.02)] overflow-hidden">
                {/* Logo Section */}
                <div className="px-8 h-20 flex items-center gap-3 border-b border-gray-50 flex-shrink-0">
                    <div className="relative">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-[#F97316] flex items-center justify-center shadow-[0_4px_15px_rgba(249,115,22,0.3)]">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div className="absolute -top-1 -right-1 h-3 w-3 bg-white rounded-full flex items-center justify-center">
                            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10B981]" />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[15px] font-black text-gray-900 leading-none tracking-tight">Hirer.AI</span>
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">Review Hub</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
                    {/* Primary Exit Action */}
                    <div className="space-y-1">
                        <Link href="/admin/candidates" className="block px-4 py-3 rounded-2xl text-[13px] font-bold text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-all group">
                            <div className="flex items-center gap-3.5">
                                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                                <span>Exit Review</span>
                            </div>
                        </Link>
                    </div>

                    {/* Report Navigation */}
                    <div className="space-y-4">
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] px-4">Navigation</p>
                        <div className="space-y-2">
                            {[
                                { id: "analysis" as const, label: "Resume", icon: FileText, desc: "AI Matching" },
                                { id: "interview" as const, label: "Interview", icon: Camera, desc: "AI Interviewer" },
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={cn(
                                        "w-full flex items-start gap-4 px-5 py-4 rounded-2xl text-[13px] font-bold transition-all relative group text-left",
                                        activeTab === item.id
                                            ? "text-orange-600 bg-orange-50 shadow-sm border border-orange-100"
                                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                    )}
                                >
                                    <div className={cn(
                                        "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                                        activeTab === item.id ? "bg-white text-orange-600 shadow-sm" : "bg-gray-50 text-gray-400 group-hover:bg-white border border-transparent group-hover:border-gray-100"
                                    )}>
                                        <item.icon className="h-4 w-4" />
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="tracking-tight">{item.label}</span>
                                        <span className={cn(
                                            "text-[10px] font-bold uppercase tracking-tight opacity-50",
                                            activeTab === item.id ? "text-orange-400" : "text-gray-400"
                                        )}>{item.desc}</span>
                                    </div>
                                    {activeTab === item.id && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_#F97316]" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Navigation is enough for sidebar now */}
                </div>
            </aside>

            {/* ── Main Content Area ─────────────────────────── */}
            <div className="flex-1 md:pl-[240px] min-w-0">
                <div className="max-w-[1300px] mx-auto px-6 py-8 md:py-12 space-y-8 pb-16">

                    {/* Breadcrumb row (mobile fallback + right actions) */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 md:hidden">
                            <Link href="/admin/candidates">
                                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-gray-900 hover:border-gray-200 shadow-sm transition-all">
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            </Link>
                            <div className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                                Candidates <ChevronRight className="h-3 w-3" /> <span className="text-gray-900">{candidate.fullName}</span>
                            </div>
                        </div>
                        <div className="hidden md:flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                            Candidates <ChevronRight className="h-3 w-3" /> <span className="text-gray-900">{candidate.fullName}</span>
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                            <Button
                                onClick={handleRescan}
                                disabled={rescanning}
                                variant="outline"
                                className="h-10 px-5 rounded-2xl font-black text-[10px] uppercase tracking-widest border-orange-100 text-orange-600 hover:bg-orange-50 shadow-sm transition-all bg-white md:hidden"
                            >
                                {rescanning ? <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
                                {rescanning ? "Scanning..." : "Refresh AI Analysis"}
                            </Button>
                        </div>
                    </div>

                    <div className="relative bg-white rounded-3xl border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.04)] overflow-hidden">
                        <div className="h-1.5 w-full bg-gradient-to-r from-orange-300 via-[#F97316] to-orange-400" />
                        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-orange-100 to-transparent rounded-full blur-3xl pointer-events-none" />

                        {/* Premium Action Row */}
                        <div className="px-10 pt-8 flex items-center justify-end gap-3 relative z-20">
                            <Button
                                onClick={() => setShowSubmissionPreview(true)}
                                variant="outline"
                                className="h-9 px-4 rounded-xl text-[11px] font-bold text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 shadow-sm transition-all flex items-center gap-2"
                            >
                                <FileText className="h-3.5 w-3.5 text-gray-400" />
                                View Submissions
                            </Button>
                        </div>


                        {/* Header Content */}
                        <div className="px-6 pb-6 pt-4 relative z-10">
                            {activeTab === "interview" ? (
                                <div className="space-y-6 animate-in fade-in duration-700">
                                    {/* Candidate & Contact Info */}
                                    <div className="space-y-4">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="flex items-center gap-6">
                                                <div className="relative flex-shrink-0">
                                                    <Avatar className="h-20 w-20 rounded-2xl border-2 border-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] flex-shrink-0">
                                                        <AvatarImage src={displayAvatar} className="object-cover" />
                                                        <AvatarFallback className="text-xl font-black bg-gray-900 text-white rounded-2xl">
                                                            {candidate.fullName?.substring(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                </div>

                                                <div className="space-y-1">
                                                    <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                                                        {candidate.fullName}
                                                        <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-black uppercase tracking-widest px-2 py-0">Verified</Badge>
                                                    </h1>
                                                    <div className="flex items-center gap-2 text-[13px] font-bold text-gray-400">
                                                        <span>{candidate.drive?.role || candidate.drive?.title || "AI Engineer Interview"}</span>
                                                        <span>•</span>
                                                        <span>{mounted ? new Date(candidate.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "-- --- ----"}</span>
                                                        <span>•</span>
                                                        <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Voice AI</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 text-[13px] font-bold text-gray-600 bg-gray-50/50 px-5 py-3 rounded-2xl border border-gray-100/50 shadow-sm">
                                                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /> {candidate.email}</div>
                                                <div className="w-[1px] h-4 bg-gray-200" />
                                                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" /> {candidate.phone || "N/A"}</div>
                                                <div className="w-[1px] h-4 bg-gray-200" />
                                                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /> {candidate.location || "N/A"}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Four Score Cards Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        {[
                                            {
                                                label: "Interview score",
                                                value: (score * 0.85 / 10).toFixed(1),
                                                total: "/10",
                                                status: "Poor",
                                                statusColor: "text-red-500 bg-red-50"
                                            },
                                            {
                                                label: "Integrity score",
                                                value: "5.8",
                                                total: "/10",
                                                status: "Some concerns",
                                                statusColor: "text-orange-500 bg-orange-50"
                                            },
                                            {
                                                label: "Combined score",
                                                value: (score / 10).toFixed(1),
                                                total: "/10",
                                                status: score >= 50 ? "Ready" : "Do not proceed",
                                                statusColor: score >= 50 ? "text-emerald-500 bg-emerald-50" : "text-red-500 bg-red-50"
                                            },
                                            {
                                                label: "Communication",
                                                value: "B1",
                                                total: "CEFR",
                                                status: "Average",
                                                statusColor: "text-orange-500 bg-orange-50"
                                            },
                                        ].map((card, i) => (
                                            <div key={i} className="bg-[#FDF9F3] rounded-[32px] p-6 border border-[#F5E6D3] flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-100 to-transparent group-hover:via-orange-200 transition-all opacity-0 group-hover:opacity-100" />
                                                <p className="text-[9px] font-black text-[#A89078] uppercase tracking-[0.2em]">{card.label}</p>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-2xl font-black text-[#4A3728] tracking-tight">{card.value}</span>
                                                    <span className="text-[10px] font-bold text-[#A89078]">{card.total}</span>
                                                </div>
                                                <div className={cn("px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-transparent shadow-sm", card.statusColor.split(' ').slice(0, 1).join(' '), card.statusColor.split(' ').slice(1).join(' '))}>
                                                    {card.status}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col md:flex-row justify-between gap-8">
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

                                    <div className="flex flex-col items-end justify-center min-w-[200px]">
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
                            )}
                        </div>
                    </div>

                    <div className="w-full">
                        <div className="space-y-6">
                            {activeTab === "analysis" && (
                                <main className="space-y-6 w-full pb-20">

                                    {/* ── VERDICT BANNER ─────────────────────────── */}
                                    {(() => {
                                        const isShortlisted = normalizedStatus === "Shortlisted";
                                        const isBorderline = normalizedStatus === "Borderline";
                                        const bgGrad = isShortlisted
                                            ? "from-emerald-500 to-emerald-600"
                                            : isBorderline
                                                ? "from-amber-500 to-orange-500"
                                                : "from-red-500 to-rose-600";
                                        const icon = isShortlisted ? "check_circle" : isBorderline ? "pending" : "cancel";
                                        return (
                                            <section className="reveal">
                                                <div className={`bg-gradient-to-r ${bgGrad} rounded-2xl p-6 text-white`}>
                                                    <div className="flex items-center justify-between flex-wrap gap-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                                                                <span className="material-symbols-outlined text-2xl">{icon}</span>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-0.5">AI Screening Verdict</p>
                                                                <h2 className="text-2xl font-black tracking-tight">{normalizedStatus}</h2>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-6">
                                                            <div className="text-center">
                                                                <p className="text-3xl font-black">{score}</p>
                                                                <p className="text-[10px] font-bold uppercase opacity-70">Score / 100</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {verdictSummary && (
                                                        <p className="mt-4 text-sm font-medium opacity-90 leading-relaxed border-t border-white/20 pt-4">{verdictSummary}</p>
                                                    )}
                                                </div>
                                            </section>
                                        );
                                    })()}

                                    {/* ── RECRUITER SNAPSHOT ─────────────────────── */}
                                    {aiData.recruiter_snapshot && (
                                        <section className="reveal">
                                            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="h-7 w-7 rounded-lg bg-orange-50 flex items-center justify-center">
                                                        <Sparkles className="h-4 w-4 text-orange-500" />
                                                    </div>
                                                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">AI Recruiter Snapshot</p>
                                                </div>
                                                <p className="text-sm leading-relaxed text-gray-700">{aiData.recruiter_snapshot}</p>
                                            </div>
                                        </section>
                                    )}

                                    {/* ── SCORE BREAKDOWN ────────────────────────── */}
                                    {breakdown && (
                                        <section className="reveal">
                                            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center">
                                                        <TrendingUp className="h-4 w-4 text-blue-500" />
                                                    </div>
                                                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Score Breakdown</p>
                                                </div>
                                                {[
                                                    { label: "Must-have Skills", score: breakdown.skills_score, max: breakdown.skills_max ?? 45, color: "bg-orange-500" },
                                                    { label: "Experience Level", score: breakdown.exp_score, max: breakdown.exp_max ?? 25, color: "bg-blue-500" },
                                                    { label: "Domain Expertise", score: breakdown.domain_score ?? 0, max: breakdown.domain_max ?? 10, color: "bg-purple-500" },
                                                    { label: "Career Quality", score: breakdown.career_score ?? 0, max: breakdown.career_max ?? 10, color: "bg-emerald-500" },
                                                    { label: "Good-to-have Skills", score: breakdown.good_score ?? 0, max: breakdown.good_max ?? 10, color: "bg-amber-500" },
                                                ].map(({ label, score: s, max, color }) => (
                                                    <div key={label} className="space-y-1.5">
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="font-semibold text-gray-700">{label}</span>
                                                            <span className="font-black text-gray-900">{s}<span className="text-gray-400 font-normal">/{max}</span></span>
                                                        </div>
                                                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${Math.round((s / max) * 100)}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {/* ── MUST-HAVE SKILLS ───────────────────────── */}
                                    <section className="reveal">
                                        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                            <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-7 w-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                                                        <Target className="h-4 w-4 text-indigo-500" />
                                                    </div>
                                                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Must-Have Skills</p>
                                                </div>
                                                {(() => {
                                                    const details = aiData.skill_matching?.must_have_details || [];
                                                    const matched = details.filter((d: any) => d.status !== 'not_found').length;
                                                    const total = details.length || aiData.skill_matching?.total_must || 0;
                                                    const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
                                                    return (
                                                        <span className={cn(
                                                            "text-[11px] font-black px-3 py-1 rounded-full",
                                                            pct >= 70 ? "bg-emerald-50 text-emerald-700" : pct >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                                                        )}>{matched}/{total} matched</span>
                                                    );
                                                })()}
                                            </div>
                                            {(aiData.skill_matching?.must_have_details || []).length > 0 ? (
                                                <div className="divide-y divide-gray-50">
                                                    {(aiData.skill_matching.must_have_details as any[]).map((skill: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/50 transition-colors">
                                                            <span className="text-sm font-semibold text-gray-800">{skill.name}</span>
                                                            <div className="flex items-center gap-3">
                                                                <span className={cn(
                                                                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                                                    skill.weight === 'critical' ? "bg-red-50 text-red-600" :
                                                                        skill.weight === 'high' ? "bg-orange-50 text-orange-600" : "bg-gray-100 text-gray-500"
                                                                )}>{skill.weight || 'medium'}</span>
                                                                <span className={cn(
                                                                    "flex items-center gap-1.5 text-[11px] font-black px-3 py-1 rounded-full",
                                                                    skill.status === 'found' ? "bg-emerald-50 text-emerald-700" :
                                                                        skill.status === 'mentioned' ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
                                                                )}>
                                                                    <span className="material-symbols-outlined text-[13px]">
                                                                        {skill.status === 'found' ? 'check_circle' : skill.status === 'mentioned' ? 'info' : 'cancel'}
                                                                    </span>
                                                                    {skill.status === 'found' ? 'Found' : skill.status === 'mentioned' ? 'Mentioned' : 'Not Found'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="px-6 py-10 text-center text-sm text-gray-400">No skill data available. Re-scan to generate.</div>
                                            )}
                                        </div>
                                    </section>

                                    {/* ── STRENGTHS & CRITICAL GAPS ──────────────── */}
                                    <section className="reveal grid grid-cols-1 md:grid-cols-2 gap-5">
                                        {/* Strengths — green */}
                                        <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm overflow-hidden">
                                            <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Strengths</p>
                                                <span className="ml-auto text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{strengths.length}</span>
                                            </div>
                                            <div className="divide-y divide-emerald-50">
                                                {strengths.length > 0 ? strengths.map((s: any, i: number) => (
                                                    <div key={i} className="px-5 py-4 space-y-1">
                                                        <p className="text-sm font-bold text-gray-800">{typeof s === 'object' ? s.point : s}</p>
                                                        {s?.evidence && <p className="text-xs text-gray-500 leading-relaxed">{s.evidence}</p>}
                                                    </div>
                                                )) : (
                                                    <div className="px-5 py-8 text-center text-sm text-gray-400">No strengths data. Re-scan to generate.</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Critical Gaps — red */}
                                        <div className="bg-white border border-red-100 rounded-2xl shadow-sm overflow-hidden">
                                            <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center gap-2">
                                                <XCircle className="h-4 w-4 text-red-500" />
                                                <p className="text-[11px] font-black uppercase tracking-widest text-red-600">Critical Gaps</p>
                                                <span className="ml-auto text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{redFlags.length}</span>
                                            </div>
                                            <div className="divide-y divide-red-50">
                                                {redFlags.length > 0 ? redFlags.map((f: any, i: number) => (
                                                    <div key={i} className="px-5 py-4 space-y-1.5">
                                                        <p className="text-sm font-bold text-gray-800">{typeof f === 'object' ? (f.point || f.label || f.flag) : f}</p>
                                                        {f?.impact && <p className="text-xs text-gray-500 leading-relaxed">{f.impact}</p>}
                                                        {Array.isArray(f?.missing_skills) && f.missing_skills.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 pt-1">
                                                                {f.missing_skills.map((sk: string, si: number) => (
                                                                    <span key={si} className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">{sk}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )) : (
                                                    <div className="px-5 py-8 text-center text-sm text-gray-400">No gaps data. Re-scan to generate.</div>
                                                )}
                                            </div>
                                        </div>
                                    </section>

                                    {/* ── EXPERIENCE COMPARISON ──────────────────── */}
                                    <section className="reveal">
                                        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                                            <div className="flex items-center gap-2 mb-5">
                                                <div className="h-7 w-7 rounded-lg bg-violet-50 flex items-center justify-center">
                                                    <BriefcaseBusiness className="h-4 w-4 text-violet-500" />
                                                </div>
                                                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Experience Comparison</p>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="bg-gray-50 rounded-xl p-4 text-center">
                                                    <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">JD Requires</p>
                                                    <p className="text-2xl font-black text-gray-900">{expJd}</p>
                                                </div>
                                                <div className={cn(
                                                    "rounded-xl p-4 text-center border",
                                                    aiData.exp_status === 'meets' || aiData.exp_status === 'overqualified' ? "bg-emerald-50 border-emerald-100" :
                                                        aiData.exp_status === 'close' ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-100"
                                                )}>
                                                    <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Candidate Has</p>
                                                    <p className={cn("text-2xl font-black",
                                                        aiData.exp_status === 'meets' || aiData.exp_status === 'overqualified' ? "text-emerald-700" :
                                                            aiData.exp_status === 'close' ? "text-amber-700" : "text-red-600"
                                                    )}>{expCandidate}</p>
                                                </div>
                                                <div className="bg-gray-50 rounded-xl p-4 text-center">
                                                    <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Status</p>
                                                    <p className="text-sm font-black text-gray-700 capitalize">{(aiData.exp_status || "unknown").replace(/_/g, ' ')}</p>
                                                </div>
                                                <div className="bg-gray-50 rounded-xl p-4 text-center">
                                                    <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Seniority</p>
                                                    <p className="text-sm font-black text-gray-700">{aiData.seniority_alignment?.candidate_label || structuredResume.experience?.seniority_level || "—"}</p>
                                                </div>
                                            </div>
                                            {expAssessment?.quality && (
                                                <p className="mt-4 text-sm text-gray-500 leading-relaxed border-t border-gray-100 pt-4">{expAssessment.quality}</p>
                                            )}
                                        </div>
                                    </section>

                                    {/* ── CAREER PROGRESSION ─────────────────────── */}
                                    {careerProgression && (
                                        <section className="reveal">
                                            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                                                <div className="flex items-center gap-2 mb-5">
                                                    <div className="h-7 w-7 rounded-lg bg-cyan-50 flex items-center justify-center">
                                                        <TrendingUp className="h-4 w-4 text-cyan-500" />
                                                    </div>
                                                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Career Progression</p>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    {[
                                                        { label: "Pattern", value: careerProgression.pattern || "—", note: careerProgression.summary },
                                                        { label: "Company Types", value: careerProgression.company_types || "—", note: careerProgression.industry_focus },
                                                        { label: "Avg Tenure", value: careerProgression.tenure_avg || "—", note: careerProgression.tenure_sentiment },
                                                    ].map(({ label, value, note }) => (
                                                        <div key={label} className="bg-gray-50 rounded-xl p-4">
                                                            <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">{label}</p>
                                                            <p className="text-base font-black text-gray-800">{value}</p>
                                                            {note && <p className="text-[11px] text-gray-500 mt-1.5 leading-snug italic">{note}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    {/* ── CAREER TIMELINE ────────────────────────── */}
                                    {workHistory.length > 0 && (
                                        <section className="reveal">
                                            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                                <div className="px-6 py-5 border-b border-gray-50 flex items-center gap-2">
                                                    <div className="h-7 w-7 rounded-lg bg-slate-50 flex items-center justify-center">
                                                        <BriefcaseBusiness className="h-4 w-4 text-slate-500" />
                                                    </div>
                                                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Career Timeline</p>
                                                    <span className="ml-auto text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{workHistory.length} roles</span>
                                                </div>
                                                <div className="divide-y divide-gray-50">
                                                    {workHistory.map((job: any, i: number) => (
                                                        <div key={i} className="px-6 py-5 flex gap-5">
                                                            <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                                                                <div className={cn(
                                                                    "h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-black",
                                                                    i === 0 ? "bg-orange-500" : "bg-gray-200"
                                                                )}>
                                                                    {i === 0 ? <span className="material-symbols-outlined text-sm">work</span> : <span className="text-gray-500 material-symbols-outlined text-sm">history</span>}
                                                                </div>
                                                                {i < workHistory.length - 1 && <div className="w-px flex-1 min-h-[24px] bg-gray-150" />}
                                                            </div>
                                                            <div className="flex-1 space-y-2 min-w-0">
                                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                                    <div>
                                                                        <h4 className="font-black text-gray-900">{job.job_title || job.role}</h4>
                                                                        <p className={cn("text-sm font-bold", i === 0 ? "text-orange-500" : "text-gray-500")}>
                                                                            {job.company}{job.duration ? ` · ${job.duration}` : ""}
                                                                        </p>
                                                                    </div>
                                                                    {job.company_type && (
                                                                        <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full shrink-0">{job.company_type}</span>
                                                                    )}
                                                                </div>
                                                                {(job.responsibilities || job.recruiter_summary || job.summary) && (
                                                                    <p className="text-sm text-gray-500 leading-relaxed">{job.responsibilities || job.recruiter_summary || job.summary}</p>
                                                                )}
                                                                {Array.isArray(job.skills) && job.skills.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                                        {job.skills.slice(0, 8).map((sk: string, si: number) => (
                                                                            <span key={si} className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase">{sk}</span>
                                                                        ))}
                                                                        {job.skills.length > 8 && <span className="text-[10px] text-gray-400">+{job.skills.length - 8} more</span>}
                                                                    </div>
                                                                )}
                                                                {job.overlap_note && (
                                                                    <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg mt-1">
                                                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                                                        {job.overlap_note}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    {/* ── INTEGRITY SIGNALS ──────────────────────── */}
                                    <section className="reveal">
                                        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                            <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-7 w-7 rounded-lg bg-slate-50 flex items-center justify-center">
                                                        <ShieldCheck className="h-4 w-4 text-slate-500" />
                                                    </div>
                                                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Integrity Signals</p>
                                                </div>
                                                {integritySignals.length > 0 && (() => {
                                                    const ord: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
                                                    const worst = integritySignals.reduce((a: any, b: any) =>
                                                        (ord[b.level] ?? 0) > (ord[a.level] ?? 0) ? b : a, integritySignals[0]);
                                                    return (
                                                        <span className={cn(
                                                            "text-[11px] font-black px-3 py-1 rounded-full flex items-center gap-1.5",
                                                            worst.level === 'High' ? "bg-red-50 text-red-600" :
                                                                worst.level === 'Medium' ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                                                        )}>
                                                            <span className={cn("w-1.5 h-1.5 rounded-full",
                                                                worst.level === 'High' ? "bg-red-500" :
                                                                    worst.level === 'Medium' ? "bg-amber-500" : "bg-emerald-500"
                                                            )} />
                                                            {worst.level} Risk
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            <div className="divide-y divide-gray-50">
                                                {integritySignals.length > 0 ? integritySignals.map((sig: any, i: number) => (
                                                    <div key={i} className="px-6 py-4 flex items-start gap-4">
                                                        <div className={cn(
                                                            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                                            sig.level === 'High' ? "bg-red-50" : sig.level === 'Medium' ? "bg-amber-50" : "bg-emerald-50"
                                                        )}>
                                                            <span className={cn("material-symbols-outlined text-base",
                                                                sig.level === 'High' ? "text-red-500" : sig.level === 'Medium' ? "text-amber-500" : "text-emerald-600"
                                                            )}>
                                                                {sig.level === 'High' ? 'error' : sig.level === 'Medium' ? 'warning' : 'check_circle'}
                                                            </span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm font-bold text-gray-800">{sig.label}</p>
                                                                <span className={cn(
                                                                    "text-[10px] font-black px-2 py-0.5 rounded-full",
                                                                    sig.level === 'High' ? "bg-red-50 text-red-600" : sig.level === 'Medium' ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                                                                )}>{sig.level}</span>
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{sig.details || sig.summary}</p>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="px-6 py-5 flex items-center gap-4">
                                                        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                                                            <span className="material-symbols-outlined text-base text-emerald-600">check_circle</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-800">No anomalies detected</p>
                                                            <p className="text-xs text-gray-500">All dates consistent and verifiable. No gaps or overlaps found.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </section>

                                    {/* ── SUITABILITY & READINESS ────────────────── */}
                                    <section className="reveal grid grid-cols-1 md:grid-cols-2 gap-5">
                                        {/* Upskilling suggestions */}
                                        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="h-7 w-7 rounded-lg bg-purple-50 flex items-center justify-center">
                                                    <Zap className="h-4 w-4 text-purple-500" />
                                                </div>
                                                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Upskilling Suggestions</p>
                                            </div>
                                            {upskillingList.length > 0 ? (
                                                <ul className="space-y-2">
                                                    {upskillingList.map((s: any, i: number) => (
                                                        <li key={i} className="flex items-start gap-2.5 text-sm">
                                                            <span className="mt-1 h-4 w-4 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                                                <span className="text-[8px] font-black text-purple-600">{i + 1}</span>
                                                            </span>
                                                            <span className="text-gray-700 leading-snug">{renderText(s)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-sm text-gray-400">No suggestions available. Re-scan to generate.</p>
                                            )}
                                        </div>

                                        {/* Readiness timeline */}
                                        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="h-7 w-7 rounded-lg bg-teal-50 flex items-center justify-center">
                                                    <UserCheck className="h-4 w-4 text-teal-500" />
                                                </div>
                                                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Readiness Timeline</p>
                                            </div>
                                            <div className="flex-1 flex flex-col justify-center items-center py-4">
                                                <p className={cn(
                                                    "text-3xl font-black text-center leading-tight",
                                                    readinessTimeline.toLowerCase().includes('immediate') ? "text-emerald-600" :
                                                        readinessTimeline.toLowerCase().includes('3') ? "text-amber-600" : "text-orange-600"
                                                )}>{readinessTimeline}</p>
                                                <p className="text-xs text-gray-400 mt-2 font-medium">Time until full operational impact</p>
                                            </div>
                                            {aiData.candidate_potential && (
                                                <div className={cn(
                                                    "mt-3 rounded-lg px-4 py-2.5 text-center text-[11px] font-black uppercase tracking-wider",
                                                    aiData.candidate_potential.for_this_role === 'High' ? "bg-emerald-50 text-emerald-700" :
                                                        aiData.candidate_potential.for_this_role === 'Medium' ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
                                                )}>
                                                    {aiData.candidate_potential.for_this_role} Potential
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* ── TECHNICAL INVENTORY ────────────────────── */}
                                    <section className="reveal">
                                        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                            <div className="px-6 py-5 border-b border-gray-50 flex items-center gap-2">
                                                <div className="h-7 w-7 rounded-lg bg-gray-50 flex items-center justify-center">
                                                    <Terminal className="h-4 w-4 text-gray-500" />
                                                </div>
                                                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Technical Inventory</p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-50">
                                                {[
                                                    { label: "Technical Skills", skills: techSkills, color: "text-blue-600", bg: "bg-blue-50" },
                                                    { label: "Tools & Platforms", skills: toolSkills, color: "text-purple-600", bg: "bg-purple-50" },
                                                    { label: "Domain Skills", skills: domainSkills, color: "text-teal-600", bg: "bg-teal-50" },
                                                ].map(({ label, skills, color, bg }) => (
                                                    <div key={label} className="p-6 space-y-3">
                                                        <p className={cn("text-[10px] font-black uppercase tracking-widest", color)}>{label}</p>
                                                        {skills.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {skills.map((s: string, i: number) => (
                                                                    <span key={i} className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full", bg, color)}>{s}</span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-gray-400 italic">No data</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </section>

                                    {/* ── AI VERDICT (full text) ─────────────────── */}
                                    {aiData.ai_verdict && (
                                        <section className="reveal">
                                            <div className="bg-gray-900 rounded-2xl p-6 text-white">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Sparkles className="h-4 w-4 text-orange-400" />
                                                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">AI Final Verdict</p>
                                                </div>
                                                <p className="text-sm leading-relaxed text-gray-200">{aiData.ai_verdict}</p>
                                            </div>
                                        </section>
                                    )}

                                </main>
                            )}
                        </div> {/* closes Header Content (relative z-10 398) */}
                    </div> {/* closes Header Card (relative bg-white 364) */}

                    {activeTab === "interview" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="relative bg-white rounded-3xl border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.04)] overflow-hidden p-10">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-300 via-indigo-600 to-indigo-400" />


                                {interviewRecordingUrl ? (
                                    <div className="space-y-8">
                                        {/* ── INTERVIEW PERFORMANCE ─────────────────────────── */}
                                        <div className="pt-4 pb-4 flex items-center gap-6">
                                            <div className="h-[1px] flex-1 bg-gray-100" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Interview Performance</h3>
                                            <div className="h-[1px] flex-1 bg-gray-100" />
                                        </div>

                                        <div className="bg-[#FDF9F3] border-l-4 border-gray-400 p-6 rounded-r-3xl mb-8">
                                            <p className="text-[#4A3728] text-[13px] leading-relaxed font-bold">
                                                {aiData.ai_verdict || `The candidate, ${candidate.fullName}, demonstrated a foundational understanding of tools relevant to the GTM Engineer role, particularly mentioning experience with n8n for automation. However, the responses were somewhat vague and lacked specific details about projects or outcomes, which are crucial for assessing competency in lead generation and sales pipeline management. While the candidate shows familiarity with relevant technologies, the inability to articulate concrete examples raises concerns about their depth of experience and communication skills. Based on this interview, I recommend further consideration but suggest a follow-up to explore their practical experiences in more detail before making a final hiring decision.`}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            {/* LEFT COLUMN: Summary & Metadata */}
                                            <div className="space-y-6">
                                                <div className="p-8 rounded-[32px] bg-white border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] h-full">
                                                    <div className="flex items-center justify-between mb-6">
                                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Communication Breakdown</p>
                                                    </div>

                                                    <div className="space-y-6">
                                                        <div className="space-y-6">
                                                            <CommunicationDonutChart
                                                                metrics={[
                                                                    { label: "Clarity", value: 60, color: "#6366F1" },
                                                                    { label: "Fluency", value: 35, color: "#F59E0B" },
                                                                    { label: "Grammar", value: 30, color: "#10B981" },
                                                                    { label: "Depth", value: 65, color: "#F43F5E" }
                                                                ]}
                                                            />

                                                            <div className="bg-[#FDF9F3] rounded-2xl p-6 space-y-2 border border-[#F5E6D3]">
                                                                <p className="text-[9.5px] font-black text-[#A89078] uppercase tracking-[0.2em]">CEFR Rating</p>
                                                                <h4 className="text-lg font-black text-[#A87128] tracking-tight">B1 — Intermediate</h4>
                                                                <p className="text-[11.5px] font-bold text-[#716152] leading-relaxed">
                                                                    Can handle simple direct exchanges. Frequent grammatical errors and choppy fluency prevent B2. Insufficient for a senior {candidate.drive?.role || "AI Engineer"} role requiring technical explanation depth.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* RIGHT COLUMN: Video Player & Transcript */}
                                            <div className="space-y-4">
                                                <div className="space-y-3">
                                                    <div className="aspect-[4/3] w-full rounded-[32px] border-4 border-gray-900 bg-black overflow-hidden shadow-2xl relative flex items-center justify-center px-4 md:px-0">
                                                        <style jsx global>{`
                                                            .plyr--full-ui {
                                                                --plyr-color-main: #F97316;
                                                                width: 100%;
                                                                height: 100%;
                                                            }
                                                            .plyr--video {
                                                                background: transparent !important;
                                                            }
                                                        `}</style>
                                                        <div key={`wrapper-${interviewRecordingUrl}`} className="w-full h-full">
                                                            <Plyr
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
                                                    </div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Cloudflare R2 Encrypted Recording</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            {/* LEFT COLUMN: JD Skills Proof */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-900 flex-shrink-0">Did the interview prove JD Skills?</h3>
                                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                                </div>

                                                <div className="p-8 rounded-[32px] bg-white border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] h-full mt-6">
                                                    <div className="space-y-6">
                                                        {[
                                                            {
                                                                title: "Cycle detection in graphs",
                                                                note: '"K. So is it totally based on coding?" — deflected',
                                                                confidence: "Confidence: High — no attempt made",
                                                                status: "Not proved",
                                                                score: "0/10",
                                                                color: "text-red-500 bg-red-50 border-red-100"
                                                            },
                                                            {
                                                                title: "Graph traversal (BFS / DFS)",
                                                                note: "Not reached — session ended early",
                                                                confidence: "Confidence: N/A — not tested",
                                                                status: "Not tested",
                                                                score: "—",
                                                                color: "text-gray-500 bg-gray-50 border-gray-100"
                                                            },
                                                            {
                                                                title: "Edge case handling",
                                                                note: "Not reached — session ended early",
                                                                confidence: "Confidence: N/A — not tested",
                                                                status: "Not tested",
                                                                score: "—",
                                                                color: "text-gray-500 bg-gray-50 border-gray-100"
                                                            },
                                                            {
                                                                title: "Problem-solving approach",
                                                                note: '"Actually, I\'m not good at coding."',
                                                                confidence: "Confidence: High — self-declared",
                                                                status: "Not proved",
                                                                score: "0/10",
                                                                color: "text-red-500 bg-red-50 border-red-100"
                                                            },
                                                            {
                                                                title: "Communication clarity",
                                                                note: "Basic exchanges functional, grammar poor",
                                                                confidence: "Confidence: High — full session data",
                                                                status: "Partial",
                                                                score: "5/10",
                                                                color: "text-orange-500 bg-orange-50 border-orange-100"
                                                            },
                                                        ].map((skill, i) => (
                                                            <div key={i} className={cn("space-y-2 pb-5", i !== 4 && "border-b border-gray-100")}>
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="space-y-1 flex-1 pb-1">
                                                                        <h4 className="text-[14px] font-black text-gray-900 tracking-tight leading-tight">{skill.title}</h4>
                                                                        <p className="text-[11.5px] font-bold text-gray-400 italic font-mono leading-snug">
                                                                            {skill.note.startsWith('"') ? skill.note : (i === 1 || i === 2 ? skill.note : `"${skill.note}"`)}
                                                                        </p>
                                                                        <p className="text-[9.5px] font-black uppercase tracking-widest text-gray-300">{skill.confidence}</p>
                                                                    </div>
                                                                    <div className="flex items-start gap-3 pt-1">
                                                                        <span className={cn("px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-widest border shadow-sm", skill.color)}>
                                                                            {skill.status}
                                                                        </span>
                                                                        <span className={cn("text-lg font-black min-w-[45px] text-right", skill.score === "—" ? "text-gray-200" : skill.score.startsWith('0') ? 'text-[#E63946]' : 'text-[#A87128]')}>
                                                                            {skill.score}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* RIGHT COLUMN: Transcript */}
                                            <div className="space-y-6 text-gray-900">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-900 flex-shrink-0">Full Session Log</h3>
                                                        <div className="h-[1px] flex-1 bg-gray-100" />
                                                    </div>
                                                    <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-100">
                                                        <button
                                                            onClick={() => setSessionLogMode('chat')}
                                                            className={cn(
                                                                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                                                sessionLogMode === 'chat' ? "bg-white text-indigo-600 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"
                                                            )}
                                                        >
                                                            Chat
                                                        </button>
                                                        <button
                                                            onClick={() => setSessionLogMode('analysis')}
                                                            className={cn(
                                                                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                                                sessionLogMode === 'analysis' ? "bg-white text-indigo-600 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"
                                                            )}
                                                        >
                                                            Analysis
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="relative h-[600px] bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] overflow-hidden mt-6">
                                                    <AnimatePresence mode="wait">
                                                        {sessionLogMode === 'chat' ? (
                                                            <motion.div
                                                                key="chat"
                                                                initial={{ opacity: 0, x: -20 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: 20 }}
                                                                className="h-full overflow-y-auto custom-scrollbar p-6 flex flex-col gap-4 scroll-smooth"
                                                            >
                                                                {interviewTranscript ? interviewTranscript.split('\n').filter((line: string) => line.trim()).map((line: string, idx: number) => {
                                                                    const isAI = line.startsWith('Interviewer:');
                                                                    const isUser = line.startsWith('Candidate:');
                                                                    const cleanLine = line.replace(/^(Interviewer:|Candidate:|ai:|user:|system:)\s*/i, '').trim();
                                                                    const label = isAI ? "Ishita (AI)" : isUser ? "Candidate" : "System";

                                                                    return (
                                                                        <div key={idx} className={cn("flex flex-col max-w-[90%] animate-in fade-in duration-500", isAI ? "self-start items-start" : "self-end items-end")}>
                                                                            <div className={cn("flex items-center gap-2 mb-1.5 px-1", isAI ? "flex-row" : "flex-row-reverse")}>
                                                                                <div className={cn("h-6 w-6 rounded-lg flex items-center justify-center text-[8px] font-black shadow-sm", isAI ? 'bg-indigo-600 text-white' : isUser ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500')}>
                                                                                    {isAI ? 'AI' : isUser ? 'C' : 'S'}
                                                                                </div>
                                                                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{label}</span>
                                                                            </div>
                                                                            <div className={cn("px-4 py-3 rounded-2xl text-[11px] font-bold leading-relaxed shadow-sm",
                                                                                isAI ? "bg-white text-gray-800 rounded-tl-none border border-gray-100" : "bg-indigo-600 text-white rounded-tr-none")}>
                                                                                {cleanLine}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }) : (
                                                                    <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3">
                                                                        <RefreshCw className="h-8 w-8 animate-spin" />
                                                                        <p className="text-xs font-black uppercase tracking-widest">Reconstructing Log...</p>
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        ) : (
                                                            <motion.div
                                                                key="analysis"
                                                                initial={{ opacity: 0, x: 20 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: -20 }}
                                                                className="h-full flex flex-col"
                                                            >
                                                                {/* Question Selector Tabs */}
                                                                <div className="flex items-center gap-2 p-4 border-b border-gray-50 bg-gray-50/30 overflow-x-auto no-scrollbar">
                                                                    {[
                                                                        { id: 'q1', label: 'Q1: Background' },
                                                                        { id: 'q2', label: 'Q2: Technical Fit' },
                                                                        { id: 'q3', label: 'Q3: Conflict Rez' },
                                                                        { id: 'q4', label: 'Q4: Problem Solve' },
                                                                        { id: 'q5', label: 'Q5: Career Goal' }
                                                                    ].map((q, idx) => (
                                                                        <button
                                                                            key={q.id}
                                                                            onClick={() => setSelectedQuestionIndex(idx)}
                                                                            className={cn(
                                                                                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border",
                                                                                selectedQuestionIndex === idx
                                                                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100"
                                                                                    : "bg-white text-gray-400 border-gray-100 hover:border-gray-200"
                                                                            )}
                                                                        >
                                                                            {q.label}
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                {/* Question Content */}
                                                                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                                                    {(() => {
                                                                        const questions = [
                                                                            {
                                                                                question: "Can you tell me about your transition from Python development to Growth Engineering?",
                                                                                analysis: "Candidate provided a clear narrative transition. They highlighted that while they enjoyed raw backend work, they found more impact in directly influencing business metrics through automation.",
                                                                                depth: "High - Provided specific rationale",
                                                                                how_answered: "Confident, articulate, used professional vocabulary.",
                                                                                score: 9
                                                                            },
                                                                            {
                                                                                question: "Describe a complex n8n workflow you built and the challenges you faced.",
                                                                                analysis: "Candidate discussed a multi-channel lead qualification system. They accurately identified error handling and rate limiting as their primary engineering challenges.",
                                                                                depth: "Technical - Deep understanding of node logic",
                                                                                how_answered: "Structured 'STAR' approach. Detailed technical walkthrough.",
                                                                                score: 8
                                                                            },
                                                                            {
                                                                                question: "How do you handle disagreement with a product manager regarding technical feasibility?",
                                                                                analysis: "Candidate focused on data-driven negotiation. They mentioned using small-scale POCs to prove feasibility rather than just verbal debate.",
                                                                                depth: "Soft Skill - Strong EQ demonstrated",
                                                                                how_answered: "Calm, collaborative tone. Demonstrated perspective-taking.",
                                                                                score: 9
                                                                            },
                                                                            {
                                                                                question: "Walking through a scenario where a database migration fails. What is your immediate protocol?",
                                                                                analysis: "Mentioned rollbacks and post-mortems. Lacked specific details on some high-availability configurations but understood the core recovery lifecycle.",
                                                                                depth: "Functional - Clear protocol knowledge",
                                                                                how_answered: "Procedural. Focus on communication and stability.",
                                                                                score: 7
                                                                            },
                                                                            {
                                                                                question: "Where do you see your role as a Growth Engineer evolving in the next 18 months?",
                                                                                analysis: "Strong ambition towards 'Growth Product' ownership. Clear alignment with the seniority trajectory expected for this role.",
                                                                                depth: "Strategic - Long-term alignment",
                                                                                how_answered: "Ambitious but realistic. High motivation signals.",
                                                                                score: 10
                                                                            }
                                                                        ];
                                                                        const q = questions[selectedQuestionIndex];
                                                                        return (
                                                                            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                                                <div className="space-y-4">
                                                                                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Question {selectedQuestionIndex + 1}</span>
                                                                                    <h4 className="text-xl font-black text-gray-900 leading-tight tracking-tight">
                                                                                        {q.question}
                                                                                    </h4>
                                                                                </div>

                                                                                <div className="space-y-4">
                                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">AI Analysis & Insights</p>
                                                                                    <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
                                                                                        <p className="text-[13.5px] font-bold text-gray-800 leading-relaxed italic">
                                                                                            "{q.analysis}"
                                                                                        </p>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                                    {[
                                                                                        { label: "Answer Depth", val: q.depth, color: "text-indigo-600" },
                                                                                        { label: "Communication style", val: q.how_answered, color: "text-emerald-600" },
                                                                                        { label: "Component score", val: `${q.score}/10`, color: "text-orange-600", isScore: true }
                                                                                    ].map((item, i) => (
                                                                                        <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                                                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">{item.label}</p>
                                                                                            <p className={cn("text-[12px] font-black tracking-tight", item.color)}>
                                                                                                {item.val}
                                                                                            </p>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>

                                            {/* RESUME CLAIMS VS INTERVIEW PROOF: CONSISTENCY CHECK */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-900 flex-shrink-0">Resume Claims vs Interview Proof — Consistency Check</h3>
                                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                                </div>

                                                <div className="p-8 rounded-[32px] bg-white border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] h-full overflow-hidden mt-6">
                                                    <div className="grid grid-cols-[1.2fr_40px_1fr] md:grid-cols-[1fr_80px_1.5fr] items-center px-8 py-4 border-b border-gray-100 bg-gray-50/50">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Resume Claimed</p>
                                                        <div />
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Interview Showed</p>
                                                    </div>

                                                    <div className="divide-y divide-gray-100">
                                                        {[
                                                            {
                                                                claim: "Built GTM automation systems at Niti AI",
                                                                sub: "Claimed: GTM strategy",
                                                                proof: "Zero GTM knowledge demonstrated. Could not answer basic GTM question.",
                                                                status: "Mismatch",
                                                                statusColor: "text-[#E63946] bg-red-50 border-red-100"
                                                            },
                                                            {
                                                                claim: "n8n, Zapier, Apollo automation experience",
                                                                sub: "Claimed: Automation tools",
                                                                proof: "Not tested in interview — role needed coding, not automation tools.",
                                                                status: "Not tested",
                                                                statusColor: "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]"
                                                            },
                                                            {
                                                                claim: "Python, Pandas, Power BI — data analysis",
                                                                sub: "Claimed: Technical skills",
                                                                proof: "Self-declared \"not good at coding.\" No code written.",
                                                                status: "Contradicted",
                                                                statusColor: "text-[#E63946] bg-red-50 border-red-100"
                                                            },
                                                            {
                                                                claim: "Problem-solving and analytical thinking",
                                                                sub: "Claimed: Soft skill",
                                                                proof: "Minimal engagement with problem. Asked about time limit, then disengaged.",
                                                                status: "Weak signal",
                                                                statusColor: "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]"
                                                            }
                                                        ].map((item, i) => (
                                                            <div key={i} className="grid grid-cols-[1.2fr_40px_1fr] md:grid-cols-[1fr_80px_1.5fr] items-center gap-4 py-6 px-8 hover:bg-gray-50/30 transition-colors">
                                                                <div className="space-y-1">
                                                                    <h4 className="text-[13.5px] font-black text-gray-900 tracking-tight leading-tight">{item.claim}</h4>
                                                                    <p className="text-[10px] font-bold text-gray-400">{item.sub}</p>
                                                                </div>

                                                                <div className="flex justify-center">
                                                                    <ArrowRight className="h-4 w-4 text-gray-300" />
                                                                </div>

                                                                <div className="space-y-2">
                                                                    <p className={cn("text-[12px] font-black leading-snug tracking-tight", (item.status === "Mismatch" || item.status === "Contradicted") ? "text-[#E63946]" : "text-[#8B5E3C]")}>
                                                                        {item.proof}
                                                                    </p>
                                                                    <span className={cn("inline-flex px-2 py-0.5 rounded-lg text-[7.5px] font-black uppercase tracking-widest border shadow-sm", item.statusColor)}>
                                                                        {item.status}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* KEY MOMENTS FROM SESSION */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-900 flex-shrink-0">Key Moments from Session</h3>
                                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                                </div>

                                                <div className="p-8 rounded-[32px] bg-white border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] h-full overflow-hidden mt-6">
                                                    <div className="flex items-center gap-8 px-8 py-4 border-b border-gray-100 bg-gray-50/50">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest w-[55px]">Timeline</p>
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Key Observation</p>
                                                    </div>
                                                    <div className="divide-y divide-gray-100">
                                                        {[
                                                            {
                                                                time: "0:38",
                                                                tag: "Context",
                                                                tagColor: "text-indigo-600 bg-indigo-50 border-indigo-100",
                                                                title: "Minimal engagement at interview start",
                                                                note: '"Yeah. Sure." — two-word response to interview structure explanation'
                                                            },
                                                            {
                                                                time: "1:12",
                                                                tag: "Flag",
                                                                tagColor: "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]",
                                                                title: "Deflected technical question — asked about format instead",
                                                                note: '"K. So is it totally based on coding?" — avoidance rather than engagement'
                                                            },
                                                            {
                                                                time: "1:18",
                                                                tag: "Flag",
                                                                tagColor: "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]",
                                                                title: "Tab switch detected — at exact moment of deflection",
                                                                note: "Proctoring: browser focus lost ~8 sec. Timing aligns with Q1 avoidance behaviour."
                                                            },
                                                            {
                                                                time: "2:28",
                                                                tag: "Critical",
                                                                tagColor: "text-[#E63946] bg-red-50 border-red-100",
                                                                title: "Self-declared inability to code — defining moment of session",
                                                                note: '"Actually, I\'m not good at coding." — unprompted, direct self-admission'
                                                            },
                                                            {
                                                                time: "3:05",
                                                                tag: "Flag",
                                                                tagColor: "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]",
                                                                title: "Audio anomaly detected — 3 seconds post-admission",
                                                                note: "Audio quality dipped significantly. Possible hardware adjustment or external noise interference."
                                                            }
                                                        ].map((moment, i) => (
                                                            <div key={i} className="flex gap-8 px-8 py-6 hover:bg-gray-50/30 transition-colors">
                                                                <div className="w-[55px] flex-shrink-0">
                                                                    <div className="text-[13px] font-black text-gray-900 tabular-nums">{moment.time}</div>
                                                                    <div className={cn("inline-flex px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest border mt-1", moment.tagColor)}>{moment.tag}</div>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <h4 className="text-[14px] font-black text-gray-900 tracking-tight leading-tight">{moment.title}</h4>
                                                                    <p className="text-[12px] font-bold text-gray-400 italic font-mono leading-snug">
                                                                        {moment.note}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── INTEGRITY AND PROCTORING ─────────────────────────── */}
                                        <div className="pt-8 pb-4 flex items-center gap-6">
                                            <div className="h-[1px] flex-1 bg-gray-100" />
                                            <div className="flex items-center gap-4">
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Integrity and Proctoring</h3>
                                                <button
                                                    onClick={() => setShowIntegrityDetails(true)}
                                                    className="px-3 py-1 rounded-lg bg-gray-50 border border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-100 hover:text-gray-900 transition-all shadow-sm"
                                                >
                                                    View all logs
                                                </button>
                                            </div>
                                            <div className="h-[1px] flex-1 bg-gray-100" />
                                        </div>

                                        <div className="relative p-10 rounded-[32px] bg-[#FDF9F3] border border-[#F5E6D3] flex items-stretch gap-12 overflow-hidden bg-gradient-to-br from-[#FDF9F3] to-white shadow-sm ring-1 ring-black/5">
                                            {/* Left accent border */}
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#A87128] to-[#8B5E3C]" />

                                            {/* LEFT SIDE: Score */}
                                            <div className="flex flex-col justify-center items-center min-w-[150px] border-r border-[#F5E6D3]/60 pr-12">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Integrity Score</p>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-[52px] font-black text-[#63391d] tracking-tighter leading-none">5.8</span>
                                                    <span className="text-xl font-black text-gray-300">/10</span>
                                                </div>
                                                <div className="mt-5 px-3 py-1 rounded-full bg-[#fceec9] text-[#A87128] text-[9.5px] font-black uppercase tracking-widest border border-[#EACFA8] shadow-sm">
                                                    Inconclusive
                                                </div>
                                            </div>

                                            {/* RIGHT SIDE: Verdict */}
                                            <div className="flex-1 py-2 flex flex-col justify-center">
                                                <div className="space-y-3">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Integrity Verdict</p>
                                                    <p className="text-[15px] font-bold text-gray-700 leading-relaxed font-mono">
                                                        2 events in a 5-minute session. Tab switch timed during Q1 at the exact moment of deflection — <span className="text-[#A87128] underline decoration-dotted underline-offset-4">the most suspicious signal</span>.
                                                        Audio anomaly is inconclusive. Face present 100% of session; no multiple faces; gaze pattern normal.
                                                        The proctoring data alone does not confirm cheating, but combined with self-declared inability and zero output,
                                                        the overall picture warrants a human review of the recording before making a final integrity call.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── INTEGRITY METRICS MINI CARDS ─────────────────── */}
                                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                            {[
                                                { val: "1", label: "Tab switches", risk: "Medium risk", color: "text-[#E63946]", badge: "text-[#A87128] bg-[#fceec9] border-[#EACFA8]" },
                                                { val: "0", label: "Multiple faces", risk: "No risk", color: "text-[#10B981]", badge: "text-[#10B981] bg-[#ECFDF5] border-[#D1FAE5]" },
                                                { val: "1", label: "Audio anomalies", risk: "Medium risk", color: "text-[#F59E0B]", badge: "text-[#A87128] bg-[#fceec9] border-[#EACFA8]" },
                                                { val: "100%", label: "Face present", risk: "No risk", color: "text-[#10B981]", badge: "text-[#10B981] bg-[#ECFDF5] border-[#D1FAE5]" },
                                                { val: "Normal", label: "Eye gaze", risk: "No risk", color: "text-[#10B981]", badge: "text-[#10B981] bg-[#ECFDF5] border-[#D1FAE5]" },
                                            ].map((m, i) => (
                                                <div key={i} className="p-6 rounded-[28px] bg-white border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-1.5 text-center group hover:border-[#F5E6D3] transition-all hover:shadow-md">
                                                    <span className={cn("text-3xl font-black tracking-tight", m.color)}>{m.val}</span>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{m.label}</p>
                                                    <div className={cn("mt-2 px-2.5 py-0.5 rounded-lg text-[7.5px] font-black uppercase tracking-widest border", m.badge)}>
                                                        {m.risk}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            {/* LEFT: EVENT TIMELINE */}
                                            <div className="p-8 rounded-[32px] bg-white border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] flex flex-col h-full">
                                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-10 px-2 leading-none">Event Timeline — Correlated with Interview</h3>

                                                <div className="relative pl-12 space-y-12 flex-1 pb-4">
                                                    {/* Vertical Line */}
                                                    <div className="absolute left-[23px] top-2 bottom-8 w-[1px] bg-gray-100 border-l border-dashed border-gray-200" />

                                                    {[
                                                        { time: "0:00", title: "Session started", badge: "Clean", badgeColor: "text-emerald-600 bg-emerald-50 border-emerald-100", dotColor: "bg-emerald-500", desc: "Camera on. Single face detected. Browser focus confirmed. Audio levels normal." },
                                                        {
                                                            time: "1:18",
                                                            title: "Tab switch",
                                                            badge: "Medium risk",
                                                            badgeColor: "text-[#A87128] bg-[#fceec9] border-[#EACFA8]",
                                                            dotColor: "bg-[#A87128]",
                                                            desc: "Browser focus lost for ~8 seconds. Candidate returned to session tab.",
                                                            note: "Timed during Q1 deflection — candidate was avoiding the coding question at this exact moment. Most notable signal in session."
                                                        },
                                                        {
                                                            time: "3:05",
                                                            title: "Audio anomaly",
                                                            badge: "Medium risk",
                                                            badgeColor: "text-[#A87128] bg-[#fceec9] border-[#EACFA8]",
                                                            dotColor: "bg-[#A87128]",
                                                            desc: "Voice-like background sound for ~3 seconds. Could be ambient noise or TV.",
                                                            note: "Occurred 37 seconds after self-admission \"not good at coding.\" No clear link — flag for awareness only."
                                                        },
                                                        { time: "5:00", title: "Session ended", badge: "Clean", badgeColor: "text-emerald-600 bg-emerald-50 border-emerald-100", dotColor: "bg-emerald-500", desc: "No further anomalies. Face present entire session. Gaze consistent with genuine attempt." },
                                                    ].map((event, i) => (
                                                        <div key={i} className="relative">
                                                            {/* Event Dot */}
                                                            <div className={cn("absolute -left-[54px] top-1.5 h-3 w-3 rounded-full border-2 border-white shadow-sm ring-4 ring-white z-10", event.dotColor)} />

                                                            <div className="space-y-2">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-[13px] font-black text-indigo-600 w-[45px]">{event.time}</span>
                                                                    <h4 className="text-[14px] font-black text-gray-900 tracking-tight">{event.title}</h4>
                                                                    <span className={cn("px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border", event.badgeColor)}>{event.badge}</span>
                                                                </div>
                                                                <p className="text-[12px] font-medium text-gray-500 leading-relaxed pr-4">{event.desc}</p>
                                                                {event.note && (
                                                                    <p className="text-[11.5px] font-semibold text-indigo-500 italic leading-relaxed pr-4">
                                                                        {event.note}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* RIGHT: PATTERN ANALYSIS */}
                                            <div className="p-8 rounded-[32px] bg-white border border-gray-100 shadow-[0_8px_40px_rgba(0,0,0,0.03)] h-full flex flex-col">
                                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-10 px-2 leading-none">Pattern Analysis — What Signals Mean Together</h3>

                                                <div className="space-y-0 flex-1">
                                                    {[
                                                        {
                                                            title: "Tab switch timing is the key concern",
                                                            desc: "Not the count (1 is low) but the exact timing — during the technical question at the moment of deflection. This correlation is what matters.",
                                                            status: "warning"
                                                        },
                                                        {
                                                            title: "No proxy candidate risk",
                                                            desc: "Face present 100% of session. Single face only. No deepfake indicators detected. Candidate was physically present throughout.",
                                                            status: "success"
                                                        },
                                                        {
                                                            title: "Audio anomaly — insufficient to conclude",
                                                            desc: "Single 3-second event. No repeated pattern. Cannot conclude external assistance from one event alone.",
                                                            status: "warning"
                                                        },
                                                        {
                                                            title: "Gaze pattern supports genuine attempt",
                                                            desc: "Eye movement consistent with reading the problem and thinking. No sustained off-screen reference pattern detected.",
                                                            status: "success"
                                                        },
                                                    ].map((p, i) => (
                                                        <div key={i} className={cn("p-6 rounded-2xl flex items-start gap-4 transition-all hover:bg-gray-50/50", i !== 3 && "border-b border-gray-50 pb-8 mb-4 rounded-none")}>
                                                            <div className={cn("mt-1 p-2 rounded-xl shrink-0", p.status === 'warning' ? "bg-orange-50 text-[#A87128]" : "bg-emerald-50 text-[#10B981]")}>
                                                                {p.status === 'warning' ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <h4 className="text-[14.5px] font-black text-gray-900 tracking-tight leading-tight">{p.title}</h4>
                                                                <p className="text-[12.5px] font-medium text-gray-500 leading-relaxed">{p.desc}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── FINAL VERDICT ─────────────────────────────────── */}
                                        <div className="pt-20 pb-10 flex items-center gap-6">
                                            <div className="h-[1px] flex-1 bg-gray-100" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400">Final Verdict</h3>
                                            <div className="h-[1px] flex-1 bg-gray-100" />
                                        </div>

                                        <div className="space-y-12">
                                            {/* SCORE ROW */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                {[
                                                    { label: "Interview /10", val: "2.1", color: "text-[#E63946]", bg: "bg-red-50/50" },
                                                    { label: "Integrity /10", val: "5.8", color: "text-[#A87128]", bg: "bg-[#FDF9F3]" },
                                                    { label: "Combined /10", val: "1.8", color: "text-[#E63946]", bg: "bg-red-50/50", border: "border-red-100" },
                                                ].map((s, i) => (
                                                    <div key={i} className={cn("p-10 rounded-[32px] flex flex-col items-center justify-center text-center border border-transparent transition-all", s.bg, s.border)}>
                                                        <span className={cn("text-[48px] font-black leading-none mb-2 tracking-tighter", s.color)}>{s.val}</span>
                                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* DECISION BADGE */}
                                            <div className="flex justify-center">
                                                <div className="px-10 py-4 rounded-full bg-red-100/50 text-[#E63946] text-[14px] font-black uppercase tracking-[0.2em] border border-red-200/50 shadow-sm">
                                                    Do not proceed to next round
                                                </div>
                                            </div>

                                            {/* SUMMARY */}
                                            <div className="max-w-4xl mx-auto px-4">
                                                <p className="text-[17px] font-medium text-gray-600 leading-[1.9] text-center">
                                                    {interviewAiSummary || "No technical summary available for this session."}
                                                </p>
                                            </div>

                                            {/* NEXT ACTIONS */}
                                            <div className="p-10 rounded-[40px] bg-indigo-50/30 border border-indigo-100/50 mt-8 max-w-5xl mx-auto">
                                                <h4 className="text-[12px] font-black text-indigo-600 uppercase tracking-widest mb-8 text-center">{/* Recommended Action header can go here if needed */}RECOMMENDED NEXT ACTION</h4>
                                                <div className="space-y-6">
                                                    {[
                                                        "Reject for this AI Engineer role — performance failure is definitive, no further round needed",
                                                        "Human review of recording recommended before logging integrity verdict — proctoring is inconclusive, not confirmed",
                                                        "Flag for talent pool as junior automation role candidate — n8n and Apollo experience has value in a different context"
                                                    ].map((action, i) => (
                                                        <div key={i} className="flex items-start gap-6 text-indigo-900 group">
                                                            <ArrowRight className="h-5 w-5 mt-0.5 shrink-0 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                                                            <p className="text-[15px] font-bold leading-relaxed">{action}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* END ORNAMENT */}
                                        <div className="py-12 flex justify-center opacity-20">
                                            <div className="h-10 w-10 rounded-full border border-gray-400 flex items-center justify-center">
                                                <ChevronDown className="h-5 w-5 text-gray-400" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-20 flex flex-col items-center gap-4 bg-gray-100 border-transparent">
                                        <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center"><EyeOff className="h-6 w-6 text-gray-300" /></div>
                                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest text-center">Interview not yet completed <br></br><span className="text-[10px] font-bold lowercase italic opacity-60">Wait for candidate submission</span></p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {showSubmissionPreview && (
                        <div className="fixed inset-0 z-[100] flex justify-end">
                            <div className="absolute inset-0 bg-black opacity-40 backdrop-blur-sm transition-opacity" onClick={() => setShowSubmissionPreview(false)} />
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
                                                    {field.isLink && field.value !== "N/A" ? <a href={'https://' + field.value} target="_blank" rel="noreferrer" className="text-sm font-bold text-indigo-600 hover:underline flex items-center gap-1"><Globe className="h-3 w-3" /> {field.value}</a> : <p className="text-sm font-bold text-gray-900">{field.value}</p>}
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
                                                <div key={i} className="p-4 rounded-2xl bg-orange-50 border border-orange-100">
                                                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">{field.label}</p>
                                                    <div className="flex items-center gap-1.5">{field.icon && <field.icon className="h-3.5 w-3.5 text-orange-400" />}<p className="text-sm font-bold text-gray-900">{field.value}</p></div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Education Section from submissionData */}
                                    {candidate.submissionData?.education && Array.isArray(candidate.submissionData.education) && candidate.submissionData.education.length > 0 && (
                                        <section className="space-y-4">
                                            <div className="flex items-center gap-2 text-blue-600"><FileText className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Academic Details</h3></div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {candidate.submissionData.education.map((edu: any, i: number) => (
                                                    <div key={i} className="p-4 rounded-2xl bg-blue-50 border border-blue-100 space-y-1">
                                                        <p className="text-sm font-bold text-gray-900">{edu.degree} {edu.fieldOfStudy ? `in ${edu.fieldOfStudy}` : ""}</p>
                                                        <p className="text-xs font-medium text-gray-600">{edu.institution}</p>
                                                        {(edu.startDate || edu.endDate) && (
                                                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1">
                                                                {edu.startDate || "?"} - {edu.endDate || "?"}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {/* Professional Experience from submissionData */}
                                    {candidate.submissionData?.experience_list && Array.isArray(candidate.submissionData.experience_list) && candidate.submissionData.experience_list.length > 0 && (
                                        <section className="space-y-4">
                                            <div className="flex items-center gap-2 text-emerald-600"><BriefcaseBusiness className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Professional Experience</h3></div>
                                            <div className="space-y-4">
                                                {candidate.submissionData.experience_list.map((work: any, i: number) => (
                                                    <div key={i} className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100 space-y-3">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <p className="text-[15px] font-black text-gray-900">{work.title}</p>
                                                                <p className="text-sm font-bold text-gray-700">{work.company}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{work.startDate || "?"} - {work.endDate || (work.current ? "Present" : "?")}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                    {candidate.submissionData?.coverLetter && (
                                        <section className="space-y-4">
                                            <div className="flex items-center gap-2 text-indigo-600"><MessageSquare className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Cover Letter / Message</h3></div>
                                            <div className="p-6 rounded-2xl bg-indigo-100 border-indigo-100"><p className="text-sm font-medium text-gray-700 leading-relaxed whitespace-pre-wrap">{candidate.submissionData.coverLetter}</p></div>
                                        </section>
                                    )}
                                </div>
                                <div className="p-8 border-t border-gray-100 bg-gray-100"><Button onClick={() => setShowSubmissionPreview(false)} className="w-full h-12 rounded-xl bg-gray-900 text-white font-black hover:bg-black transition-all">CLOSE PREVIEW</Button></div>
                            </div>
                        </div>
                    )}

                    {showIntegrityDetails && (
                        <div className="fixed inset-0 z-[100] flex justify-end">
                            <div className="absolute inset-0 bg-black opacity-40 backdrop-blur-sm transition-opacity" onClick={() => setShowIntegrityDetails(false)} />
                            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                                <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                                    <div><h2 className="text-xl font-black text-gray-900 tracking-tight">Integrity Deep-Dive</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Full Proctoring Logs & Event Analysis</p></div>
                                    <Button variant="ghost" size="icon" onClick={() => setShowIntegrityDetails(false)} className="rounded-xl hover:bg-gray-100"><X className="h-6 w-6 text-gray-400" /></Button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-8 space-y-10 text-gray-900">
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-[#E63946]"><MonitorSmartphone className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Tab Detection Logs</h3></div>
                                        <div className="space-y-3">
                                            <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start justify-between text-gray-900">
                                                <div>
                                                    <p className="text-sm font-bold">Browser Focus Lost</p>
                                                    <p className="text-xs text-gray-500 mt-1 uppercase font-black opacity-70">Candidate switched to another window/tab during Question 1.</p>
                                                </div>
                                                <span className="text-[10px] font-black text-red-500 whitespace-nowrap">1:18 AM • 8.2s</span>
                                            </div>
                                        </div>
                                    </section>
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-[#10B981]"><UserCheck className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Facial & Gaze Analysis</h3></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Face Presence</p>
                                                <p className="text-sm font-bold text-gray-900">100% of session</p>
                                            </div>
                                            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Multiple Faces</p>
                                                <p className="text-sm font-bold text-gray-900">None detected</p>
                                            </div>
                                        </div>
                                    </section>
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-[#F59E0B]"><Volume2 className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest">Audio Anomalies</h3></div>
                                        <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100 flex items-start justify-between text-gray-900">
                                            <div>
                                                <p className="text-sm font-bold">Background Voice Detected</p>
                                                <p className="text-xs text-gray-500 mt-1 uppercase font-black opacity-70">Faint secondary voice captured shortly after candidate admission.</p>
                                            </div>
                                            <span className="text-[10px] font-black text-orange-500 whitespace-nowrap">3:05 AM • 3.0s</span>
                                        </div>
                                    </section>
                                </div>
                                <div className="p-8 border-t border-gray-100 bg-gray-100"><Button onClick={() => setShowIntegrityDetails(false)} className="w-full h-12 rounded-xl bg-gray-900 text-white font-black hover:bg-black transition-all">CLOSE DETAILS</Button></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}