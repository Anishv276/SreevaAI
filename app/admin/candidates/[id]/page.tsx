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
/* ── Premium Score Ring ────────────────────────────── */
function CircularProgress({
    value,
    max = 100,
    label,
    size = "md",
    color = "blue",
    master = false
}: {
    value: number;
    max?: number;
    label: string;
    size?: "sm" | "md" | "lg";
    color?: string;
    master?: boolean;
}) {
    const percentage = Math.min((value / max) * 100, 100);
    const radius = master ? 48 : 38;
    const strokeWidth = master ? 12 : 9;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    const sizeClass = size === "sm" ? "h-20 w-20" : size === "md" ? "h-28 w-28" : "h-36 w-36";
    const colors: Record<string, [string, string]> = {
        blue: ["#60A5FA", "#3B82F6"],
        slate: ["#94A3B8", "#64748B"],
        indigo: ["#818CF8", "#6366F1"],
        emerald: ["#34D399", "#10B981"]
    };

    const gradientId = `grad-${color}-${master ? 'master' : 'child'}`;
    const [startColor, endColor] = colors[color] || colors.blue;

    return (
        <div className={cn("relative flex flex-col items-center gap-3", master ? "scale-105" : "")}>
            <div className={cn("relative flex items-center justify-center", sizeClass)}>
                <svg className="h-full w-full transform -rotate-90 overflow-visible">
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={startColor} />
                            <stop offset="100%" stopColor={endColor} />
                        </linearGradient>
                    </defs>
                    <circle
                        cx="50%"
                        cy="50%"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        fill="transparent"
                        className="text-slate-100/80"
                    />
                    <circle
                        cx="50%"
                        cy="50%"
                        r={radius}
                        stroke={`url(#${gradientId})`}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        style={{ strokeDashoffset: offset }}
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all duration-1000 ease-out drop-shadow-sm"
                    />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                    <div className="flex items-baseline gap-0.5">
                        <span className={cn("font-black text-slate-900 leading-none", master ? "text-3xl" : "text-2xl")}>{value}</span>
                        {max !== 100 && <span className="text-[10px] font-bold text-slate-400">/{max}</span>}
                    </div>
                </div>
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center max-w-[90px] leading-tight">
                {label}
            </span>
        </div>
    );
}

/* ── Segmented Data Track ────────────────────────────── */
function SegmentedProgress({ candValue, jdValue, label, unit = "YRS" }: { candValue: number; jdValue: number; label: string; unit?: string }) {
    const totalBlocks = Math.max(candValue, jdValue, 8);
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-end">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">{label}</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-sm font-black text-slate-900 leading-none">{candValue}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">/ {jdValue} {unit}</span>
                </div>
            </div>
            <div className="flex gap-1.5 h-2.5">
                {Array.from({ length: totalBlocks }).map((_, i) => (
                    <div
                        key={i}
                        className={cn(
                            "flex-1 rounded-sm border transition-all duration-500",
                            i < candValue ? "bg-blue-600 border-blue-600 shadow-sm" : "bg-transparent border-slate-200"
                        )}
                    />
                ))}
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

    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        setMounted(true);
    }, []);

    const handleMouseMove = (e: React.MouseEvent) => {
        const target = (e.target as HTMLElement).closest('.spotlight-card') as HTMLElement;
        if (!target) return;
        
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        target.style.setProperty('--x', `${x}px`);
        target.style.setProperty('--y', `${y}px`);
    };

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
    const [expandedSections, setExpandedSections] = useState({
        communication: true,
        skills: true,
        transcript: true,
        consistency: true,
        moments: true
    });

    const toggleSection = (sectionId: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
    };

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

    const displayAvatar = interviewSnapshot || candidate.passportUrl || 'https:' + '//' + 'api.dicebear.com/7.x/initials/svg?seed=' + candidate.fullName;

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
        const m = Math.floor(totalSeconds * 0.0166666);
        const s = Math.floor(totalSeconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}min`;
    };

    return (
        <div ref={containerRef} onMouseMove={handleMouseMove} className="min-h-screen flex bg-slate-50/50 relative isolate" style={{ fontFamily: 'Inter, sans-serif' }}>
            <style dangerouslySetInnerHTML={{
                __html: `
                #admin-main-wrapper > div { padding: 0 !important; }
                header.sticky { top: 0 !important; width: 100% !important; }
                .tracking-premium { letter-spacing: -0.02em !important; }
                .glass-card {
                    background: rgba(255, 255, 255, 0.45);
                    backdrop-filter: blur(24px) saturate(180%);
                    -webkit-backdrop-filter: blur(24px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.04);
                }
                .spotlight-card {
                    position: relative;
                    background: rgba(255, 255, 255, 0.5);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.25);
                    transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
                    overflow: hidden;
                }
                .spotlight-card::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(circle at var(--x, 50%) var(--y, 50%), rgba(255,255,255,0.4) 0%, transparent 50%);
                    opacity: 0;
                    transition: opacity 0.5s;
                    pointer-events: none;
                }
                .spotlight-card:hover::before {
                    opacity: 1;
                }
                .spotlight-card:hover { 
                    border-color: rgba(255, 255, 255, 0.5);
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.04);
                    transform: translateY(-4px);
                }
                        ` }} />

            {/* ── Background Aurora Blobs ──────────────── */}
            <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden" style={{ transform: 'translateZ(0)' }}>
                <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-purple-500/10 blur-[160px] rounded-full animate-pulse" style={{ willChange: 'transform, opacity' }} />
                <div className="absolute bottom-[-20%] left-[-10%] w-[800px] h-[800px] bg-blue-500/10 blur-[160px] rounded-full" style={{ willChange: 'transform' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-indigo-500/5 blur-[200px] rounded-full" style={{ willChange: 'transform' }} />
            </div>

            {/* ── Main Content Area ─────────────────────────── */}
            <div className="flex-1 min-w-0">
                {/* ── Sticky Navigation Header ─────────────────────────── */}
                <header className="sticky top-0 z-[100] bg-white/40 backdrop-blur-3xl border-b border-white/20 px-6 py-4">
                    <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
                        {/* Left: Exit & Context */}
                        <div className="flex items-center gap-6">
                            <Link href="/admin/candidates">
                                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl bg-white border border-slate-100 shadow-sm hover:bg-slate-50 transition-all group">
                                    <ArrowLeft className="h-4 w-4 text-slate-400 group-hover:-translate-x-0.5" />
                                </Button>
                            </Link>
                            <div className="hidden lg:flex flex-col -space-y-0.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Candidate Review</span>
                                <span className="text-[15px] font-black text-slate-950 tracking-tight">{candidate.fullName}</span>
                            </div>
                        </div>

                        {/* Center: Tab Switcher */}
                        <div className="bg-slate-100/50 p-1 rounded-2xl flex items-center gap-1 border border-slate-100">
                            {[
                                { id: "analysis" as const, label: "Resume", icon: FileText },
                                { id: "interview" as const, label: "Interview", icon: Camera },
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={cn(
                                        "flex items-center gap-2.5 px-6 py-2 rounded-xl text-[13px] font-black uppercase tracking-widest transition-all",
                                        activeTab === item.id
                                            ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-100"
                                            : "text-slate-400 hover:text-slate-600 hover:bg-white/50"
                                    )}
                                >
                                    <item.icon className={cn("h-3.5 w-3.5", activeTab === item.id ? "text-blue-500" : "text-slate-300")} />
                                    {item.label}
                                </button>
                            ))}
                        </div>

                        {/* Right: Primary Actions */}
                        <div className="flex items-center gap-3">
                            <Button
                                onClick={() => setShowSubmissionPreview(true)}
                                variant="outline"
                                className="h-10 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 border-slate-100 hover:bg-slate-50 transition-all hidden md:flex items-center gap-2"
                            >
                                <Globe className="h-3.5 w-3.5" />
                                Submissions
                            </Button>
                        </div>
                    </div>
                </header>

                <div className="max-w-[1400px] mx-auto px-6 py-8 md:py-12 space-y-8 pb-16">
                    <div className="relative spotlight-card rounded-[48px] shadow-sm overflow-hidden">
                        <div className="h-2 w-full bg-gradient-to-r from-orange-400 via-[#F97316] to-orange-500" />
                        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-100/40 to-transparent rounded-full blur-[100px] pointer-events-none" />

                        <div className="p-10 relative z-10">
                            {activeTab === "interview" ? (
                                <div className="space-y-6 animate-in fade-in duration-700">
                                    <div className="space-y-4">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                                                    <span>•</span>
                                                    <span>5 min session</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 text-[13px] font-bold text-gray-600 bg-gray-50/50 px-4 py-2 rounded-2xl border border-gray-100/50">
                                                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /> {candidate.email}</div>
                                                <div className="w-[1px] h-4 bg-gray-200" />
                                                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" /> {candidate.phone || "N/A"}</div>
                                                <div className="w-[1px] h-4 bg-gray-200" />
                                                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /> {candidate.location || "N/A"}</div>
                                            </div>
                                        </div>
                                    </div>

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
                                                    <span className="text-[10px] font-bold text-[#A89078]">/{card.total}</span>
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

                                            <div className="flex flex-wrap gap-8 pt-2">
                                                {[
                                                    { icon: Mail, value: candidate.email },
                                                    { icon: Phone, value: candidate.phone || "N/A" },
                                                    { icon: MapPin, value: structuredResume.location?.city ? `${structuredResume.location.city}, ${structuredResume.location.country || ""}` : (candidate.location || "N/A") },
                                                    { icon: Calendar, value: mounted ? `Applied ${new Date(candidate.createdAt).toLocaleDateString()}` : "Applied --/--/----" },
                                                ].filter(item => item.value !== "N/A" && item.value !== "N/A, ").map(({ icon: Icon, value }) => (
                                                    <div key={value} className="flex items-center gap-3 text-[14px] font-bold text-slate-500">
                                                        <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 shadow-sm">
                                                            <Icon className="h-4 w-4 text-slate-400" />
                                                        </div>
                                                        <span>{value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end justify-center min-w-[200px]">
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
                                            <CircularProgress value={score} label="Alignment" master={true} color="blue" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full">
                        <div className="space-y-6">
                            {activeTab === "analysis" && (
                                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
                                    <div className="px-10 pt-10 pb-6 group">
                                        <div className="relative pb-4">
                                            <div className="absolute bottom-0 left-0 w-24 h-1 bg-slate-950 rounded-full" />
                                            <h2 className="text-3xl font-black text-slate-950 tracking-premium uppercase leading-none font-sans">
                                                Resume Analysis
                                            </h2>
                                        </div>

                                        <div className="mt-10 p-10 spotlight-card rounded-[40px] border border-white/20 relative overflow-hidden group/summary">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600/30 group-hover/summary:bg-blue-600 transition-colors" />
                                            <div className="flex items-start gap-8">
                                                <div className="h-14 w-14 rounded-[20px] bg-white shadow-xl shadow-blue-900/5 border border-slate-100 flex items-center justify-center shrink-0">
                                                    <Sparkles className="h-7 w-7 text-blue-600" />
                                                </div>
                                                <div className="space-y-4">
                                                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] leading-none">AI Strategic Synthesis</p>
                                                    <p className="text-[19px] font-medium text-slate-700 leading-[1.8] font-serif italic mb-2 tracking-tight">
                                                        "{summary}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-10 spotlight-card rounded-[48px] shadow-sm">
                                        <div className="flex flex-row items-center justify-around gap-2 px-4">
                                            <CircularProgress
                                                value={breakdown?.skills_score || 0}
                                                max={breakdown?.skills_max || 45}
                                                label="Must-have"
                                                color="blue"
                                                master={true}
                                            />
                                            <CircularProgress
                                                value={breakdown?.exp_score || 0}
                                                max={breakdown?.exp_max || 25}
                                                label="Experience"
                                                color="blue"
                                            />
                                            <CircularProgress
                                                value={breakdown?.good_score || 0}
                                                max={breakdown?.good_max || 10}
                                                label="Good-to-have"
                                                color="slate"
                                            />
                                            <CircularProgress
                                                value={breakdown?.career_score || 0}
                                                max={breakdown?.career_max || 10}
                                                label="Career"
                                                color="indigo"
                                            />
                                            <CircularProgress
                                                value={breakdown?.domain_score || 0}
                                                max={breakdown?.domain_max || 10}
                                                label="Domain"
                                                color="slate"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 px-2">
                                            <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center">
                                                <Target className="h-4 w-4 text-slate-900" />
                                            </div>
                                            <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-premium">Candidate Skill Alignment</h3>
                                        </div>
                                        <div className="spotlight-card rounded-[40px] shadow-sm overflow-hidden">
                                            <div className="grid grid-cols-3 px-8 py-3 bg-slate-50 border-b border-slate-200">
                                                <span className="text-[10px] font-black text-slate-950 uppercase tracking-widest font-sans">Requirement</span>
                                                <span className="text-[10px] font-black text-slate-950 uppercase tracking-widest text-center font-sans">Priority</span>
                                                <span className="text-[10px] font-black text-slate-950 uppercase tracking-widest text-right font-sans">Status</span>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {(() => {
                                                    const matchData = aiData.skill_matching || {};
                                                    const details = matchData.must_have_details || [
                                                        ...(matchData.matched_must || []).map((s: string) => ({ name: s, weight: 'high', status: 'found' })),
                                                        ...(matchData.missing_must || []).map((s: string) => ({ name: s, weight: 'high', status: 'not_found' }))
                                                    ];
                                                    return details.length > 0 ? details.map((skill: any, idx: number) => (
                                                        <div key={idx} className="grid grid-cols-3 px-8 py-4 hover:bg-slate-50 transition-colors cursor-default items-center">
                                                            <span className="text-sm font-medium text-slate-700">{skill.name}</span>
                                                            <div className="flex justify-center">
                                                                <span className="text-[10px] font-mono text-slate-400 uppercase">
                                                                    {skill.weight || 'mid'}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-end">
                                                                <div className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter",
                                                                    skill.status === 'found' ? "bg-emerald-50 text-emerald-600" :
                                                                        skill.status === 'mentioned' ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-500 shadow-sm shadow-rose-100/50"
                                                                )}>
                                                                    {skill.status === 'found' ? 'Matched' : skill.status === 'mentioned' ? 'Partial' : 'Missing'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )) : (
                                                        <div className="px-8 py-10 text-center opacity-40 italic font-medium text-sm">
                                                            No specific requirements found.
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="p-10 spotlight-card rounded-[40px] border-t-4 border-t-emerald-500 shadow-sm space-y-10">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                                </div>
                                                <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-premium">Key Strengths</h3>
                                            </div>
                                            <div className="grid gap-5">
                                                {aiData.strengths && aiData.strengths.length > 0 ? aiData.strengths.slice(0, 4).map((s: any, i: number) => (
                                                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/30 group hover:border-emerald-100 hover:bg-emerald-50/20 transition-all">
                                                        <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                                            <CheckCircle2 className="h-3 w-3" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[13px] font-bold text-slate-800 leading-tight">{typeof s === 'string' ? s : s.point}</p>
                                                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">{s.evidence || "Demonstrated proficiency."}</p>
                                                        </div>
                                                    </div>
                                                )) : <p className="text-xs italic text-slate-400">No strengths data.</p>}
                                            </div>
                                        </div>

                                        <div className="p-10 spotlight-card rounded-[40px] border-t-4 border-t-amber-500 shadow-sm space-y-10">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                                                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                                                </div>
                                                <h3 className="text-[14px] font-black text-slate-900 uppercase tracking-premium">Growth Areas</h3>
                                            </div>
                                            <div className="grid gap-5">
                                                {(aiData.concerns || aiData.weaknesses || []).slice(0, 4).map((c: any, i: number) => (
                                                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/30 group hover:border-rose-100 hover:bg-rose-50/20 transition-all">
                                                        <div className="h-6 w-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                                                            <AlertCircle className="h-3 w-3" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[13px] font-bold text-slate-800 leading-tight">{typeof c === 'string' ? c : c.point}</p>
                                                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">{c.impact || "Requires mentoring."}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* ── Career Timeline (Left) ──────────────── */}
                                        <div className="p-8 spotlight-card bg-white rounded-[40px] shadow-sm flex flex-col h-full border border-slate-100">
                                            <div className="flex items-center gap-3 mb-10 px-2">
                                                <div className="h-10 w-10 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                                                    <BriefcaseBusiness className="h-5 w-5 text-slate-400" />
                                                </div>
                                                <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-[0.2em]">Career Timeline</h3>
                                            </div>

                                            <div className="relative flex-1 px-4">
                                                <div className="absolute left-[31px] top-2 bottom-8 w-[2px] bg-slate-50" />
                                                
                                                <div className="space-y-10">
                                                    {(() => {
                                                        const history = aiData.work_history || workHistory || [];
                                                        return history.map((role: any, idx: number) => {
                                                            const isCurrent = role.is_current;
                                                            return (
                                                                <div key={idx} className="flex gap-8 relative group">
                                                                    <div className={cn(
                                                                        "h-4 w-4 rounded-full mt-1.5 z-10 ring-4 ring-white shrink-0 transition-all",
                                                                        isCurrent ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)] scale-110" : "bg-slate-200"
                                                                    )} />
                                                                    
                                                                    <div className="space-y-2 pb-2">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                                                                {role.start_date || role.start_year || "?"} — {isCurrent ? "Present" : (role.end_date || role.end_year || "?")}
                                                                            </span>
                                                                            <h4 className="text-[16px] font-black text-slate-900 tracking-tight leading-tight group-hover:text-blue-500 transition-colors">
                                                                                {role.role}
                                                                            </h4>
                                                                            <p className="text-[12px] font-bold text-blue-500/80">{role.company}</p>
                                                                        </div>
                                                                        <p className="text-[12.5px] font-medium text-slate-500 leading-relaxed line-clamp-2 italic">
                                                                            {role.recruiter_summary || (Array.isArray(role.what_they_built) ? role.what_they_built[0] : role.summary) || "Infrastructure development and managed high-impact team deliverables."}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Strategic Verdict (Right) ───────────── */}
                                        <div className="p-8 spotlight-card bg-indigo-50/30 rounded-[40px] border border-indigo-100/50 shadow-sm flex flex-col h-full relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-200/20 blur-[60px] rounded-full -mr-24 -mt-24 pointer-events-none" />
                                            
                                            <div className="flex items-center gap-3 mb-10 px-2 relative z-10">
                                                <div className="h-10 w-10 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center shadow-sm">
                                                    <Sparkles className="h-5 w-5 text-indigo-500" />
                                                </div>
                                                <h3 className="text-[13px] font-black text-indigo-900 uppercase tracking-[0.2em]">Strategic Verdict</h3>
                                            </div>

                                            <div className="flex flex-col gap-10 flex-1 relative z-10">
                                                <div className="space-y-6 border-l-4 border-indigo-200/50 pl-6">
                                                    {(() => {
                                                        const rawText = aiData.reasoning || aiData.suitability_analysis?.suggestions?.[0] || summary;
                                                        const points = typeof rawText === 'string'
                                                            ? rawText.split(/(?:\. |\n|(?:\s*-\s*))/).filter(p => p.trim().length > 15)
                                                            : [rawText];

                                                        return points.slice(0, 3).map((point: string, pIdx: number) => (
                                                            <div key={pIdx} className="space-y-1">
                                                                <p className="text-[15px] font-medium text-indigo-950 leading-relaxed font-serif italic">
                                                                    "{point.trim().replace(/^\.*|\.*$/g, '')}."
                                                                </p>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>

                                                <div className="mt-auto pt-8 border-t border-indigo-100/50 flex flex-col gap-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Onboarding Window</span>
                                                        <span className="text-[12px] font-black text-indigo-900 uppercase tracking-widest bg-white border border-indigo-100 px-4 py-1.5 rounded-full shadow-sm">
                                                            {aiData.suitability_analysis?.readiness_timeline || "6-12 MONTHS"}
                                                        </span>
                                                    </div>
                                                    <div className="p-5 rounded-3xl bg-white/60 border border-indigo-100/50 flex items-center justify-between gap-4">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Decision Logic</span>
                                                            <span className="text-[13px] font-black text-slate-900">{normalizedStatus === "Shortlisted" ? "Move to leadership review" : normalizedStatus === "Rejected" ? "No further action" : "Awaiting signal validation"}</span>
                                                        </div>
                                                        <div className={cn(
                                                            "h-10 w-10 rounded-2xl flex items-center justify-center",
                                                            normalizedStatus === "Shortlisted" ? "bg-emerald-50 text-emerald-600" : normalizedStatus === "Rejected" ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-400"
                                                        )}>
                                                            <ArrowRight className="h-5 w-5" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 8. Candidate Analysis - Expert Commentary */}
                                    <div className={cn(
                                        "p-10 spotlight-card border rounded-[40px] space-y-8 mx-2 transition-colors duration-500",
                                        normalizedStatus === "Shortlisted" ? "border-emerald-200 shadow-emerald-900/5 shadow-2xl" :
                                            normalizedStatus === "Rejected" ? "border-rose-200 shadow-rose-900/5 shadow-2xl" : "border-slate-200"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                normalizedStatus === "Shortlisted" ? "bg-emerald-50" :
                                                    normalizedStatus === "Rejected" ? "bg-rose-50" : "bg-slate-50"
                                            )}>
                                                <MessageSquare className={cn(
                                                    "h-4 w-4",
                                                    normalizedStatus === "Shortlisted" ? "text-emerald-600" :
                                                        normalizedStatus === "Rejected" ? "text-rose-600" : "text-slate-400"
                                                )} />
                                            </div>
                                            <h3 className={cn(
                                                "text-[12px] font-black uppercase tracking-widest font-sans",
                                                normalizedStatus === "Shortlisted" ? "text-emerald-600" :
                                                    normalizedStatus === "Rejected" ? "text-rose-600" : "text-slate-950"
                                            )}>Expert Synthesis</h3>
                                        </div>
                                        <div className="grid gap-6">
                                            <div className={cn(
                                                "p-8 rounded-2xl border",
                                                normalizedStatus === "Shortlisted" ? "bg-emerald-50/20 border-emerald-100" :
                                                    normalizedStatus === "Rejected" ? "bg-rose-50/20 border-rose-100" : "bg-slate-50/50 border-slate-100"
                                            )}>
                                                <h4 className={cn(
                                                    "text-sm font-black mb-6 uppercase tracking-widest border-b pb-2 inline-block font-sans",
                                                    normalizedStatus === "Shortlisted" ? "text-emerald-900 border-emerald-200" :
                                                        normalizedStatus === "Rejected" ? "text-rose-900 border-rose-200" : "text-slate-950 border-slate-200"
                                                )}>Technical Commentary</h4>
                                                <p className={cn(
                                                    "text-lg font-medium leading-relaxed font-serif italic",
                                                    normalizedStatus === "Shortlisted" ? "text-emerald-800" :
                                                        normalizedStatus === "Rejected" ? "text-rose-800" : "text-slate-600"
                                                )}>
                                                    {aiData.recruiter_snapshot || aiData.summary || "Candidate exhibits a strong background in data structures and graph algorithms, specifically mentioning cycle detection. While formal GTM experience is less evidenced, the technical foundations suggest a high capacity for learning domain-specific sales operational workflows."}
                                                </p>

                                                <div className={cn(
                                                    "mt-8 space-y-4 pt-6 border-t",
                                                    normalizedStatus === "Shortlisted" ? "border-emerald-100" :
                                                        normalizedStatus === "Rejected" ? "border-rose-100" : "border-slate-100"
                                                )}>
                                                    <p className={cn(
                                                        "text-[12px] font-black uppercase tracking-widest font-sans",
                                                        normalizedStatus === "Shortlisted" ? "text-emerald-600" :
                                                            normalizedStatus === "Rejected" ? "text-rose-600" : "text-slate-950"
                                                    )}>
                                                        Strategic Decision Path
                                                    </p>
                                                    <div className="grid gap-6">
                                                        {[
                                                            {
                                                                label: "Next Step Action",
                                                                value: normalizedStatus === "Shortlisted" ? "PROCEED: Move to technical leadership briefing." :
                                                                    normalizedStatus === "Rejected" ? "TERMINATE: No further assessment recommended." : "REVIEW: Secondary manual panel required.",
                                                                indicator: "h-2 w-2"
                                                            },
                                                            {
                                                                label: "Core Rationale",
                                                                value: (aiData.strengths?.[0]?.point || aiData.strengths?.[0] || "Identified foundational technical alignment.") + " " + (aiData.suitability_analysis?.suggestions?.[0] || ""),
                                                                indicator: "h-2 w-2"
                                                            },
                                                            {
                                                                label: "Strategic Decision",
                                                                value: normalizedStatus === "Shortlisted" ? `CONFIRMED: High-alignment profile with ${aiData.suitability_analysis?.readiness_timeline || "immediate"} potential.` :
                                                                    normalizedStatus === "Rejected" ? "DECLINED: Critical technical or proctoring threshold not met." : "PENDING: Awaiting further signal validation.",
                                                                indicator: "h-2 w-2"
                                                            }
                                                        ].map((decision, i) => (
                                                            <div key={i} className="flex gap-5 items-start px-2">
                                                                <div className={cn(
                                                                    "mt-1.5 rounded-full shrink-0 shadow-[0_0_10px_rgba(0,0,0,0.1)]",
                                                                    decision.indicator,
                                                                    normalizedStatus === "Shortlisted" ? "bg-emerald-500 shadow-emerald-500/20" :
                                                                        normalizedStatus === "Rejected" ? "bg-rose-500 shadow-rose-500/20" : "bg-slate-400 shadow-slate-400/20"
                                                                )} />
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                                                                        {decision.label}
                                                                    </p>
                                                                    <p className={cn(
                                                                        "text-[15px] font-bold leading-snug tracking-tight",
                                                                        normalizedStatus === "Shortlisted" ? "text-emerald-950" :
                                                                            normalizedStatus === "Rejected" ? "text-rose-950" : "text-slate-900"
                                                                    )}>
                                                                        {decision.value}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {activeTab === "interview" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="relative spotlight-card rounded-[48px] shadow-sm overflow-hidden p-10 border border-white/20">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-300 via-indigo-600 to-indigo-400" />
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                                        <Camera className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 tracking-premium uppercase">Technical Interview Review</h2>
                                    </div>
                                </div>

                                {interviewRecordingUrl ? (
                                    <div className="space-y-8">
                                        <div className="pt-4 pb-4 flex items-center gap-6">
                                            <div className="h-[1px] flex-1 bg-gray-100" />
                                            <div className="flex items-center gap-4">
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Integrity and Proctoring</h3>
                                                <button
                                                    onClick={() => setShowIntegrityDetails(true)}
                                                    className="px-3 py-1 rounded-lg bg-white/50 backdrop-blur-sm border border-white/20 text-[9px] font-black text-gray-500 uppercase tracking-widest hover:bg-white hover:text-gray-900 transition-all shadow-sm ring-1 ring-black/5"
                                                >
                                                    View all logs
                                                </button>
                                            </div>
                                            <div className="h-[1px] flex-1 bg-gray-100" />
                                        </div>

                                        <div className="bg-[#FDF9F3] border-l-4 border-gray-400 p-6 rounded-r-3xl mb-8">
                                            <p className="text-[#4A3728] text-[13px] leading-relaxed font-bold">
                                                {aiData.ai_verdict || `The candidate demonstrated technical knowledge but lacked depth in specific project-based questions. Standard performance for B1 level communication.`}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div className="space-y-6">
                                                <div className="p-10 rounded-[40px] glass-card border border-white/30 h-full">
                                                    <div className="flex items-center justify-between mb-6 cursor-pointer group" onClick={() => toggleSection('communication')}>
                                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Communication Breakdown</p>
                                                        <ChevronDown className={cn("h-4 w-4 text-gray-300 transition-transform duration-300", !expandedSections.communication && "-rotate-90")} />
                                                    </div>

                                                    <AnimatePresence initial={false}>
                                                        {expandedSections.communication && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                                                className="overflow-hidden space-y-6"
                                                            >
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
                                                                            Can handle simple direct exchanges. Frequent grammatical errors and choppy fluency prevent B2.
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="aspect-[4/3] w-full rounded-[32px] border-4 border-gray-900 bg-black overflow-hidden shadow-2xl relative flex items-center justify-center px-4 md:px-0">
                                                    <div className="w-full h-full">
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
                                                
                                                <div className="p-8 rounded-[32px] glass-card border border-white/30 h-full overflow-hidden">
                                                    <div className="flex items-center gap-8 px-6 py-4 border-b border-white/10 bg-white/5">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest w-[55px]">Timeline</p>
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Key Observation</p>
                                                    </div>
                                                    <div className="divide-y divide-gray-100/10">
                                                        {[
                                                            { time: "0:45", observation: "Strong articulation of system design principles.", status: "Positive" },
                                                            { time: "2:15", observation: "Hesitation when discussing multi-threading.", status: "Neutral" },
                                                            { time: "4:30", observation: "Excellent summary of project lifecycle.", status: "Strong" },
                                                        ].map((item, i) => (
                                                            <div key={i} className="flex items-center gap-8 py-4 px-6 hover:bg-white/5 transition-colors">
                                                                <span className="text-[10px] font-black text-indigo-400 w-[55px] font-mono">{item.time}</span>
                                                                <div className="flex-1">
                                                                    <p className="text-[12px] font-bold text-gray-700">{item.observation}</p>
                                                                    <span className={cn(
                                                                        "text-[8px] font-black uppercase tracking-tighter",
                                                                        item.status === "Positive" ? "text-emerald-500" : item.status === "Strong" ? "text-blue-500" : "text-amber-500"
                                                                    )}>{item.status} Signal</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3 cursor-pointer group" onClick={() => toggleSection('skills')}>
                                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-900 flex-shrink-0">JD Skill Alignment</h3>
                                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                                    <ChevronDown className={cn("h-4 w-4 text-gray-300 transition-transform duration-300", !expandedSections.skills && "-rotate-90")} />
                                                </div>

                                                <AnimatePresence initial={false}>
                                                    {expandedSections.skills && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                                            className="overflow-hidden"
                                                        >
                                                <div className="p-8 rounded-[32px] glass-card border border-white/30 h-full overflow-hidden">
                                                    <div className="flex items-center gap-8 px-8 py-4 border-b border-white/10 bg-white/5">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex-1">Requirement</p>
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest w-[80px] text-center">Status</p>
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex-1">Interview Proof</p>
                                                    </div>
                                                    <div className="divide-y divide-gray-100/10">
                                                        {[
                                                            { title: "Technical knowledge", status: "Partial", proof: "Demonstrated React basics but struggled with Next.js SSR.", color: "text-orange-500 bg-orange-50/10 border-orange-100/20" },
                                                            { title: "Communication", status: "Proved", proof: "Articulated thoughts clearly. CEFR B2 level observed.", color: "text-emerald-500 bg-emerald-50/10 border-emerald-100/20" },
                                                        ].map((skill, i) => (
                                                            <div key={i} className="grid grid-cols-[1fr_80px_1.5fr] items-center gap-4 py-6 px-8 hover:bg-white/5 transition-colors">
                                                                <h4 className="text-sm font-bold text-gray-900">{skill.title}</h4>
                                                                <div className="flex justify-center">
                                                                    <span className={cn("px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border", skill.color)}>{skill.status}</span>
                                                                </div>
                                                                <p className="text-[11px] font-medium text-gray-500 leading-relaxed italic">{skill.proof}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3 cursor-pointer group" onClick={() => toggleSection('transcript')}>
                                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-900 flex-shrink-0">Full Session Log</h3>
                                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                                    <ChevronDown className={cn("h-4 w-4 text-gray-300 transition-transform duration-300", !expandedSections.transcript && "-rotate-90")} />
                                                </div>

                                                <AnimatePresence initial={false}>
                                                    {expandedSections.transcript && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="h-[400px] rounded-[40px] glass-card border border-white/30 p-10 overflow-y-auto">
                                                                {interviewTranscript ? interviewTranscript.split('\n').map((line: string, idx: number) => (
                                                                    <p key={idx} className="text-[11px] font-medium text-gray-600 mb-2">{line}</p>
                                                                )) : <p className="text-center opacity-40">Transcript pending...</p>}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-20 flex flex-col items-center gap-4 bg-gray-50 rounded-3xl">
                                        <EyeOff className="h-10 w-10 text-gray-300" />
                                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest text-center">Interview Recording Pending</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {showSubmissionPreview && (
                        <div className="fixed inset-0 z-[100] flex justify-end">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowSubmissionPreview(false)} />
                            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                                <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                                    <h2 className="text-xl font-black text-gray-900">Application Preview</h2>
                                    <Button variant="ghost" size="icon" onClick={() => setShowSubmissionPreview(false)}><X className="h-6 w-6 text-gray-400" /></Button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                                    <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 space-y-4">
                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Cover Message</p>
                                        <p className="text-sm font-medium text-gray-700 leading-relaxed whitespace-pre-wrap">{candidate.submissionData?.coverLetter || "No message provided."}</p>
                                    </div>
                                </div>
                                <div className="p-8 border-t border-gray-100 bg-gray-50">
                                    <Button onClick={() => setShowSubmissionPreview(false)} className="w-full h-12 rounded-xl bg-gray-900 text-white font-black hover:bg-black">CLOSE PREVIEW</Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showIntegrityDetails && (
                        <div className="fixed inset-0 z-[100] flex justify-end">
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowIntegrityDetails(false)} />
                            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                                <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10 font-sans">
                                    <div><h2 className="text-xl font-black text-gray-900 tracking-tight">Integrity Deep-Dive</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Full Proctoring Logs & Event Analysis</p></div>
                                    <Button variant="ghost" size="icon" onClick={() => setShowIntegrityDetails(false)} className="rounded-xl hover:bg-gray-100"><X className="h-6 w-6 text-gray-400" /></Button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-8 space-y-10 text-gray-900 font-sans">
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-[#E63946]"><MonitorSmartphone className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest tracking-premium">Tab Detection Logs</h3></div>
                                        <div className="space-y-3">
                                            <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start justify-between">
                                                <div>
                                                    <p className="text-sm font-bold">Browser Focus Lost</p>
                                                    <p className="text-xs text-gray-500 mt-1 uppercase font-black opacity-70">Candidate switched to another window/tab during Question 1.</p>
                                                </div>
                                                <span className="text-[10px] font-black text-red-500 whitespace-nowrap">1:18 AM • 8.2s</span>
                                            </div>
                                        </div>
                                    </section>
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-[#10B981]"><UserCheck className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest tracking-premium">Facial & Gaze Analysis</h3></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Face Presence</p>
                                                <p className="text-sm font-bold">100% of session</p>
                                            </div>
                                            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Multiple Faces</p>
                                                <p className="text-sm font-bold">None detected</p>
                                            </div>
                                        </div>
                                    </section>
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-[#F59E0B]"><Volume2 className="h-4 w-4" /><h3 className="text-sm font-black uppercase tracking-widest tracking-premium">Audio Anomalies</h3></div>
                                        <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100 flex items-start justify-between">
                                            <div>
                                                <p className="text-sm font-bold">Background Voice Detected</p>
                                                <p className="text-xs text-gray-500 mt-1 uppercase font-black opacity-70">Faint secondary voice captured shortly after candidate admission.</p>
                                            </div>
                                            <span className="text-[10px] font-black text-orange-500 whitespace-nowrap">3:05 AM • 3.0s</span>
                                        </div>
                                    </section>
                                </div>
                                <div className="p-8 border-t border-gray-100 bg-gray-100">
                                    <Button onClick={() => setShowIntegrityDetails(false)} className="w-full h-12 rounded-xl bg-gray-900 text-white font-black hover:bg-black transition-all">CLOSE DETAILS</Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}