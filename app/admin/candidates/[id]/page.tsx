"use client";

import { use, useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    ArrowLeft, ArrowRight, Download, Mail, Phone, MapPin, Calendar,
    CheckCircle2, XCircle, Sparkles, Zap,
    TrendingUp, AlertTriangle, ChevronRight, ShieldCheck, Terminal, UserSearch,
    MessageSquare, Target, BriefcaseBusiness, Globe, IndianRupee, RefreshCw, Camera, Loader2, User, X, ChevronDown, ChevronUp, EyeOff, LayoutDashboard, FileText,
    MonitorSmartphone, UserCheck, Volume2, AlertCircle
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import "plyr-react/plyr.css";
import { AuditLogModal } from "@/components/admin/audit-log-modal";

// -- Extracted Components ------------------------------------------------------
import { ScoreCard, VerdictScoreCard, VerdictScoreBox } from "@/components/admin/candidate-profile/score-cards";
import { AssessmentCard, AnalysisEntry, AnalysisSignal } from "@/components/admin/candidate-profile/assessment-cards";
import { RecommendedActionItem, ChatEntry, MomentEntry, TimelineEvent } from "@/components/admin/candidate-profile/chat-elements";
import { DeepDiveLog, IntegrityRow, ProctoringMetric } from "@/components/admin/candidate-profile/proctoring-metrics";
import { CircularProgress, SegmentedProgress, CommunicationDonutChart } from "@/components/admin/candidate-profile/charts";

const Plyr = dynamic(() => import("plyr-react").then((mod) => mod.Plyr), { ssr: false });
/* -- Main Component ------------------------------- */

export default function CandidateProfilePage({ params }: { params: Promise<{ id: string }> }) {

    const resolvedParams = use(params);

    const id = resolvedParams.id;

    const [candidate, setCandidate] = useState<any>(null);

    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<"analysis" | "interview">("analysis");

    const [sendingInterviewLink, setSendingInterviewLink] = useState(false);

    const [rescanning, setRescanning] = useState(false);

    const [mounted, setMounted] = useState(false);

    const [recordingDurationSec, setRecordingDurationSec] = useState<number | null>(null);

    const [showSubmissionPreview, setShowSubmissionPreview] = useState(false);

    const [showIntegrityDetails, setShowIntegrityDetails] = useState(false);

    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

    const [isReportsMode, setIsReportsMode] = useState(false);

    const [selectedProctoringKey, setSelectedProctoringKey] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);

    const plyrInstance = useRef<any>(null);

    const [logTab, setLogTab] = useState<"chat" | "analysis">("chat");

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {

        setMounted(true);

    }, []);

    useEffect(() => {

        if (typeof window !== 'undefined') {

            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

        }

    }, [activeTab]);

    useEffect(() => {

        if (isReportsMode) {

            document.body.classList.add('reports-mode');

        } else {

            document.body.classList.remove('reports-mode');

        }

        return () => document.body.classList.remove('reports-mode');

    }, [isReportsMode]);

    const fetchCandidate = useCallback(async () => {

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

    }, [id]);

    useEffect(() => {

        if (id) {

            fetchCandidate();

        }

    }, [id, fetchCandidate]);

    // Real-time updates for individual candidate profile

    useEffect(() => {

        if (!id) return;

        

        const eventSource = new EventSource("/api/stream");

        

        eventSource.onmessage = (event) => {

            try {

                const data = JSON.parse(event.data);

                if (data.type === "UPDATED_APPLICATIONS") {

                    fetchCandidate();

                }

            } catch (e) {

                // Ignore

            }

        };

        return () => {
            eventSource.onmessage = null;
            eventSource.onerror = null;
            eventSource.close();
        };

    }, [id, fetchCandidate]);

    const handleSendInterviewLink = async () => {

        setSendingInterviewLink(true);

        try {

            const res = await fetch(`/api/candidates/${id}/send-interview-link`, { method: "POST" });

            if (res.ok) {

                alert("Interview link resent successfully!");

            } else {

                const err = await res.json();

                alert(err.error || "Failed to send interview link");

            }

        } catch (error) {

            console.error("Interview link send error:", error);

            alert("Failed to send interview link.");

        } finally {

            setSendingInterviewLink(false);

        }

    };

    const handleRescan = async () => {

        setRescanning(true);

        try {

            const res = await fetch(`/api/admin/candidates/${id}/rescan`, { method: "POST" });

            if (res.ok) {

                await fetchCandidate();

                alert("AI Re-scan triggered. Please wait about 30 seconds and refresh the page.");

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

    let aiData: any = {};

    try {

        aiData = candidate?.aiReport ? JSON.parse(candidate.aiReport) : {};

    } catch (e) {

        console.error("Failed to parse aiReport", e);

    }

    let interviewReportData: any = {};

    try {

        const rawInterviewReport = (candidate?.interview as any)?.interviewReport;

        if (rawInterviewReport) {

            interviewReportData = typeof rawInterviewReport === "string" ? JSON.parse(rawInterviewReport) : rawInterviewReport;

        }

    } catch (e) {

        console.error("Failed to parse interviewReport", e);

    }

    const structuredResume = candidate?.structuredResume ? (typeof candidate.structuredResume === 'string' ? JSON.parse(candidate.structuredResume) : candidate.structuredResume) : {};

    const summary = structuredResume.candidate_summary || aiData.summary || structuredResume.summary || aiData.reasoning || "AI analysis pending for this candidate.";

    const strengths = aiData.strengths || [];

    const weaknesses = aiData.weaknesses || [];

    const decisionBreakdown = Array.isArray(aiData.decision_breakdown) ? aiData.decision_breakdown : [];

    const candidatePotential = aiData.candidate_potential || {};

    const expertSynthesis = aiData.ai_verdict || aiData.decision_reason || aiData.recruiter_snapshot || summary;

    const decisionReason = aiData.decision_reason || aiData.ai_verdict || summary;

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

    const interviewTurns = (() => {
        const raw = candidate?.interview?.interviewTurns || candidate?.assessment?.interviewTurns || [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    })();

    const interviewTranscriptTurns = interviewTurns.length > 0 ? interviewTurns : (() => {
        const lines = String(interviewTranscript || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        const parsed: any[] = [];
        let current: any = null;

        for (const line of lines) {
            const interviewerMatch = line.match(/^Interviewer:\s*(.*)$/i);
            if (interviewerMatch) {
                if (current && (current.question || current.answer)) parsed.push(current);
                current = {
                    turn: parsed.length + 1,
                    question: interviewerMatch[1].trim(),
                    answer: "",
                };
                continue;
            }

            const candidateMatch = line.match(/^Candidate:\s*(.*)$/i);
            if (candidateMatch) {
                if (!current) {
                    current = {
                        turn: parsed.length + 1,
                        question: "",
                        answer: "",
                    };
                }
                current.answer = current.answer ? `${current.answer} ${candidateMatch[1].trim()}` : candidateMatch[1].trim();
                continue;
            }

            if (current) {
                current.answer = current.answer ? `${current.answer} ${line}` : line;
            }
        }

        if (current && (current.question || current.answer)) parsed.push(current);
        return parsed;
    })();

    const normalizedInterviewTurns = interviewTranscriptTurns
        .map((turn: any, i: number) => ({
            q: Number(turn?.turn || i + 1),
            question: String(turn?.question || turn?.title || "").trim(),
            answer: String(turn?.answer || turn?.reasoning || "").trim(),
            reasoning: String(turn?.reasoning || turn?.analysis_reasoning || "").trim(),
            score: String(turn?.score || "--"),
            confidence: String(turn?.confidence || "Confidence: Low -- stored transcript"),
        }))
        .filter((turn: any) => turn.question || turn.reasoning || turn.answer);

    const looksLikeAnswerText = (value: string, answerHint: string) => {
        const text = String(value || "").trim().toLowerCase();
        const hint = String(answerHint || "").trim().toLowerCase();
        if (!text) return false;
        if (hint && text === hint) return true;
        if (text.length < 120 && /^(i|i'm|im|i am|yeah|yes|no|okay|ok|sure|don't know|i don't know|i do not know)/i.test(text)) return true;
        return false;
    };

    const interviewCandidateRating = typeof candidate?.interview?.candidateRating === "number"

        ? candidate.interview.candidateRating

        : typeof candidate?.assessment?.candidateRating === "number"

            ? candidate.assessment.candidateRating

            : null;

    const interviewFeedbackScore = interviewCandidateRating != null ? Math.min(10, Math.max(0, interviewCandidateRating * 2)) : null;

    const parsedProctoringEvents = (() => {

        const raw = candidate?.interview?.proctoringEvents || candidate?.assessment?.proctoringEvents || [];

        if (Array.isArray(raw)) return raw;

        if (typeof raw === "string") {

            try {

                const parsed = JSON.parse(raw);

                return Array.isArray(parsed) ? parsed : [];

            } catch {

                return [];

            }

        }

        return [];

    })();

    const parseSnapshotList = (raw: any): string[] => {

        if (!raw) return [];

        if (Array.isArray(raw)) return raw.filter(Boolean).map(String);

        if (typeof raw === "string") {

            try {

                const parsed = JSON.parse(raw);

                if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);

            } catch { }

            return raw.length > 10 ? [raw] : [];

        }

        return [];

    };

    

    // Calculate Word Count

    const wordCount = interviewTranscript ? interviewTranscript.split(/\s+/).filter((w: string) => w.length > 0).length : 0;

    const integrityScore = (() => {

        const reportScore = Number(interviewReportData?.integrity?.score);
        if (Number.isFinite(reportScore)) return Math.max(0, Math.min(100, reportScore));

        if (!Array.isArray(parsedProctoringEvents) || parsedProctoringEvents.length === 0) return 100;

        let high = 0;

        let medium = 0;

        let low = 0;

        for (const ev of parsedProctoringEvents) {

            const severity = String(ev?.severity || "").toLowerCase();

            if (severity === "high") high += 1;

            else if (severity === "medium") medium += 1;

            else if (severity === "low") low += 1;

        }

        const score100 = Math.max(0, Math.round(100 - (high * 22) - (medium * 10) - (low * 4)));

        return score100;

    })();

    const interviewScore = interviewFeedbackScore != null

        ? interviewFeedbackScore

        : interviewTranscript

            ? Math.max(1, Math.min(10, Math.round(wordCount / 80)))

            : 0;

    const combinedScore = Math.max(0, Math.min(10, Math.round(((interviewScore + integrityScore / 10) / 2) * 10) / 10));

    const interviewStatusLabel =

        interviewScore >= 7 ? "Strong" :

            interviewScore >= 4 ? "Mixed" :

                "Weak";

    const integrityStatusLabel =

        integrityScore >= 85 ? "Clean" :

            integrityScore >= 70 ? "Monitor" :

                "Risk";

    const combinedStatusLabel =

        combinedScore >= 7 ? "Ready" :

            combinedScore >= 4 ? "Review" :

                "Stop";

    const communicationLevel =

        !interviewTranscript ? "Pending" :

            wordCount < 120 ? "A1" :

                wordCount < 250 ? "A2" :

                    wordCount < 450 ? "B1" :

                        wordCount < 800 ? "B2" :

                            wordCount < 1300 ? "C1" : "C2";

    const communicationStatus =

        !interviewTranscript ? "Pending" :

            wordCount >= 800 ? "Strong" :

                wordCount >= 250 ? "Average" :

                    "Limited";

    useEffect(() => {

        const dbDuration = candidate?.interview?.interviewDuration || candidate?.assessment?.interviewDuration;

        if (dbDuration && dbDuration > 0) {

            setRecordingDurationSec(dbDuration);

        }

    }, [candidate]);

    const snapshots = parseSnapshotList(candidate?.interview?.snapshots || candidate?.assessment?.snapshots || []);

    const interviewSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

    if (loading) {

        return (

            <div className="flex justify-center items-center min-h-[60vh]">

                <div className="flex flex-col items-center gap-4">

                    <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center animate-pulse">

                        <Sparkles className="h-6 w-6 text-[#F97316]" />

                    </div>

                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading Profile...</p>

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

                <p className="text-lg font-bold text-gray-900">Candidate Not Found</p>

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

    const interviewReportScores = interviewReportData?.scores || {};

    const interviewReportRecording = interviewReportData?.recording || {};

    const interviewReportVerdict = interviewReportData?.verdict || {};

    const interviewStrategicVerdict = candidate?.interview?.strategicVerdict || interviewReportData?.strategic_verdict || {};

    const interviewReportCommunication = interviewReportData?.communication || {};

    const interviewReportIntegrity = interviewReportData?.integrity || {};

    const interviewReportSkills = Array.isArray(interviewReportData?.skills_proof) ? interviewReportData.skills_proof : [];

    const interviewReportQaBlocks = Array.isArray(interviewReportData?.qa_blocks) ? interviewReportData.qa_blocks : [];

    const interviewSessionRows = normalizedInterviewTurns;

    const interviewQaRows = interviewReportQaBlocks.length > 0
        ? interviewReportQaBlocks.map((row: any, i: number) => {
            const transcriptTurn = interviewTranscriptTurns[i] || normalizedInterviewTurns[i];
            const reportReasoning = String(row?.reasoning || row?.verdict || "").trim();
            const fallbackReasoning = String(transcriptTurn?.reasoning || "").trim() || "Transcript captured, but analytical reasoning is not available yet.";
            return {
                ...row,
                qNumber: row?.qNumber || `QUESTION ${String(row?.q || i + 1).padStart(2, "0")}`,
                depth: row?.depth || row?.tags?.join?.(", ") || "REPORT",
                answer: transcriptTurn?.answer || row?.answer || "",
                reasoning: reportReasoning && !looksLikeAnswerText(reportReasoning, transcriptTurn?.answer || "") ? reportReasoning : fallbackReasoning,
            };
        })
        : normalizedInterviewTurns.map((turn: any) => ({
            ...turn,
            qNumber: `QUESTION ${String(turn.q || "").padStart(2, "0")}`,
            depth: "TRANSCRIPT ONLY",
            reasoning: turn.reasoning || "Transcript captured, but analytical reasoning is not available yet.",
            answer: turn.answer || "",
        }));

    const interviewReportConsistency = Array.isArray(interviewReportData?.consistency) ? interviewReportData.consistency : [];

    const interviewReportKeyMoments = Array.isArray(interviewReportData?.key_moments) ? interviewReportData.key_moments : [];

    const interviewReportSummary = interviewReportRecording.summary || interviewReportVerdict.summary || interviewAiSummary;

    const hasStructuredInterviewReport = Object.keys(interviewReportData || {}).length > 0;

    const interviewSkillStats = (() => {

        const rows = interviewReportSkills || [];

        const normalized = rows.map((s: any) => ({

            ...s,

            status: String(s?.status || "").toUpperCase(),

            scoreNum: Number.parseFloat(String(s?.score || "").replace(/[^\d.]/g, "")),

        }));

        const proved = normalized.filter((s: any) => s.status === "PROVED");

        const partial = normalized.filter((s: any) => s.status === "PARTIAL");

        const notProved = normalized.filter((s: any) => s.status === "NOT PROVED");

        const notTested = normalized.filter((s: any) => s.status === "NOT TESTED");

        const scored = normalized.filter((s: any) => Number.isFinite(s.scoreNum));

        const strongest = proved[0] || scored.sort((a: any, b: any) => b.scoreNum - a.scoreNum)[0] || rows[0] || null;

        const biggestGap = notProved[0] || notTested[0] || rows[0] || null;

        const overallMatch = rows.length

            ? Math.round(((proved.length + partial.length * 0.5) / rows.length) * 100)

            : 0;

        return {

            total: rows.length,

            proved: proved.length,

            partial: partial.length,

            notProved: notProved.length,

            notTested: notTested.length,

            overallMatch,

            strongest,

            biggestGap,

        };

    })();

    const proctoringSignals = Array.isArray(parsedProctoringEvents) ? parsedProctoringEvents : [];

    const groupedProctoringSignals = (() => {

        const groups = new Map<string, any>();

        proctoringSignals.forEach((ev: any, idx: number) => {

            const key = String(ev?.eventType || ev?.type || `signal-${idx}`);

            const existing = groups.get(key) || {

                key,

                label: String(ev?.eventType || ev?.type || "signal").replace(/_/g, " "),

                severity: String(ev?.severity || "low").toLowerCase(),

                count: 0,

                events: [] as any[],

            };

            existing.count += 1;

            existing.events.push({ ...ev, __index: idx });

            if (String(ev?.severity || "").toLowerCase() === "high") existing.severity = "high";

            else if (String(ev?.severity || "").toLowerCase() === "medium" && existing.severity !== "high") existing.severity = "medium";

            groups.set(key, existing);

        });

        return Array.from(groups.values()).sort((a, b) => b.count - a.count);

    })();

    const selectedProctoringSignal =

        groupedProctoringSignals.find((g: any) => g.key === selectedProctoringKey) || groupedProctoringSignals[0] || null;

    const selectedSignalEvent = selectedProctoringSignal?.events?.[0] || null;

    const selectedSignalIndex = selectedSignalEvent?.__index ?? 0;

    const selectedSignalSnapshot = snapshots.length > 0

        ? snapshots[Math.min(selectedSignalIndex, snapshots.length - 1)]

        : null;

    const proctoringVerdictSummary = (() => {

        const reportSummary = String(interviewReportData?.integrity?.summary || "").trim();
        if (reportSummary) return reportSummary;

        const high = groupedProctoringSignals.filter((g: any) => g.severity === "high").reduce((n: number, g: any) => n + g.count, 0);

        const medium = groupedProctoringSignals.filter((g: any) => g.severity === "medium").reduce((n: number, g: any) => n + g.count, 0);

        const low = groupedProctoringSignals.filter((g: any) => g.severity === "low").reduce((n: number, g: any) => n + g.count, 0);

        if (!proctoringSignals.length) return "No proctoring signals were recorded for this interview.";

        if (high > 0) return `High-risk telemetry is present, led by ${high} high-severity signal${high === 1 ? "" : "s"}. The session should be reviewed alongside the recording and transcript before any final integrity decision.`;

        if (medium > 0) return `The session contains ${medium} medium-severity signal${medium === 1 ? "" : "s"} and ${low} low-severity event${low === 1 ? "" : "s"}. Nothing here proves misconduct on its own, but the timing deserves a human review.`;

        return `The session looks mostly clean with ${low} low-severity signal${low === 1 ? "" : "s"}. The recording is still worth spot-checking, but the telemetry itself does not show strong risk.`;

    })();

    const formatDuration = (totalSeconds: number) => {

        const m = Math.floor(totalSeconds * 0.0166666);

        const s = Math.floor(totalSeconds % 60);

        return `${m}:${s.toString().padStart(2, '0')}min`;

    };

    return (

        <div 

            id="candidate-report"

            key={id + '_' + loading}

            ref={containerRef} 

            className="min-h-screen flex bg-slate-50/50 relative isolate" 

            style={{ fontFamily: 'Inter, sans-serif' }}

        >

            <style dangerouslySetInnerHTML={{

                __html: `

                #admin-main-wrapper > div { padding: 0 !important; }

                #candidate-report, #candidate-report * {

                    font-family: Inter, sans-serif !important;

                }

                header.fixed { 

                    position: fixed !important; 

                    top: 0 !important; 

                    left: 240px !important;

                    right: 0 !important;

                    z-index: 100 !important; 

                    width: auto !important; 

                    transform: translateZ(0);

                    will-change: transform;

                    -webkit-font-smoothing: antialiased;

                }

                body.reports-mode header.fixed {

                    left: 0 !important;

                }

                @media (max-width: 768px) {

                    header.fixed {

                        left: 0 !important;

                    }

                }

                .tracking-wide { letter-spacing: -0.02em !important; }

                .glass-card {

                    background: rgba(255, 255, 255, 0.9);

                    border: 1px solid rgba(0, 0, 0, 0.05);

                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.02);

                    transform: translateZ(0);

                }

                .spotlight-card {

                    position: relative;

                    background: #ffffff;

                    border: 1px solid rgba(0, 0, 0, 0.05);

                    transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);

                    overflow: hidden;

                    transform: translateZ(0);

                    contain: content;

                }

                .spotlight-card::before {

                    content: "";

                    position: absolute;

                    inset: 0;

                    background: radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.04) 0%, transparent 70%);

                    opacity: 0;

                    transition: opacity 0.3s ease;

                    pointer-events: none;

                }

                .spotlight-card:hover::before {

                    opacity: 1;

                }

                .spotlight-card:hover { 

                    border-color: rgba(37, 99, 235, 0.15);

                    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.05);

                    transform: translateY(-2px) translateZ(0);

                }

                .optimize-scroll {

                    content-visibility: auto;

                    contain-intrinsic-size: 1px 500px;

                }

                /* Hide scrollbar but keep functionality */

                .no-scrollbar::-webkit-scrollbar { display: none; }

                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

                        ` }} />

            {/* -- Background Aurora Blobs ---------------- */}

            <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden" style={{ transform: 'translateZ(0)' }}>

                <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-500/5 blur-[120px] rounded-full" style={{ willChange: 'opacity' }} />

                <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-500/5 blur-[120px] rounded-full" style={{ willChange: 'opacity' }} />

                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/5 blur-[150px] rounded-full" style={{ willChange: 'opacity' }} />

            </div>

            {/* -- Main Content Area --------------------------- */}

            <div className="flex-1 min-w-0">

                {/* -- Fixed Navigation Header --------------------------- */}

                <header className={cn(

                    "fixed top-0 right-0 z-[100] bg-white/80 backdrop-blur-xl border-b border-gray-100/80 px-6 py-3 transition-all  shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)]",

                    isReportsMode ? "left-0" : "left-0 md:left-[240px]"

                )}>

                    <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">

                        {/* Left: Exit & Context */}

                        <div className="flex items-center gap-6">

                            <Link href="/admin/candidates">

                                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl bg-white border border-slate-100 shadow-sm hover:bg-slate-50 transition-all group">

                                    <ArrowLeft className="h-4 w-4 text-slate-400 group-hover:-translate-x-0.5" />

                                </Button>

                            </Link>

                            <div className="hidden lg:flex flex-col -space-y-0.5">

                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Candidate Review</span>

                                <span className="text-[15px] font-bold text-slate-950 tracking-tight">{candidate.fullName}</span>

                            </div>

                        </div>

                        {/* Center: Tab Switcher */}

                        <div className="bg-slate-100/60 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/50 backdrop-blur-sm">

                            {[

                                { id: "analysis" as const, label: "Resume", icon: FileText },

                                { id: "interview" as const, label: "Interview", icon: Camera },

                            ].map((item) => (

                                <button

                                    key={item.id}

                                    onClick={() => setActiveTab(item.id)}

                                    className={cn(

                                        "flex items-center gap-2.5 px-6 py-2 rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all ",

                                        activeTab === item.id

                                            ? "bg-white text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.05)] ring-1 ring-slate-100"

                                            : "text-slate-400 hover:text-slate-600 hover:bg-white/40"

                                    )}

                                >

                                    <item.icon className={cn("h-3.5 w-3.5", activeTab === item.id ? "text-blue-600" : "text-slate-300")} />

                                    {item.label}

                                </button>

                            ))}

                        </div>

                        {/* Right: Primary Actions */}

                        <div className="flex items-center gap-3">

                            <Button

                                onClick={() => fetchCandidate()}

                                variant="outline"

                                className="h-10 w-10 p-0 rounded-2xl bg-white border border-slate-100 shadow-sm hover:bg-slate-50 transition-all group"

                                title="Refresh data"

                            >

                                <RefreshCw className={cn("h-4 w-4 text-slate-400 group-hover:text-blue-500", loading && "animate-spin")} />

                            </Button>

                            <Button

                                onClick={handleRescan}

                                disabled={rescanning}

                                variant="outline"

                                className="h-10 px-5 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-700 border-slate-200/60 bg-white/50 backdrop-blur-sm hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 transition-all shadow-sm group disabled:opacity-60"

                            >

                                <Sparkles className={cn("h-3.5 w-3.5 text-orange-500 group-hover:scale-110 transition-transform", rescanning && "animate-spin")} />

                                {rescanning ? "Rescanning..." : "Rescan AI"}

                            </Button>

                            <Button

                                onClick={() => setShowSubmissionPreview(true)}

                                variant="outline"

                                className="h-10 px-5 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-700 border-slate-200/60 bg-white/50 backdrop-blur-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all  hidden md:flex items-center gap-2.5 shadow-sm group"

                            >

                                <FileText className="h-3.5 w-3.5 group-hover:scale-110 transition-transform text-blue-500 group-hover:text-blue-400" />

                                View Submission

                            </Button>

                        </div>

                    </div>

                </header>

                <div className="max-w-[1400px] mx-auto px-6 pt-24 pb-16 space-y-8 relative z-0">

                    <div className="relative spotlight-card rounded-3xl shadow-sm overflow-hidden">

                        <div className="h-2 w-full bg-gradient-to-r from-orange-400 via-[#F97316] to-orange-500" />

                        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-100/40 to-transparent rounded-full blur-[100px] pointer-events-none" />

                        <div className="p-10 relative z-10">

                            {activeTab === "interview" ? (

                                <div className="space-y-6   ">

                                    <div className="space-y-4">

                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                                            <div className="space-y-1">

                                                <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">

                                                    {candidate.fullName}

                                                    <Badge className="bg-slate-50 text-slate-900 border-slate-200 shadow-sm text-[9px] font-bold uppercase tracking-widest px-2 py-0">Verified</Badge>

                                                </h1>

                                                <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-400">

                                                    <span>{candidate.drive?.role || candidate.drive?.title || "AI Engineer Interview"}</span>

                                                    <span>•</span>

                                                    <span>{mounted ? new Date(candidate.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "-- --- ----"}</span>

                                                    <span>•</span>

                                                    <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Voice AI</span>

                                                    <span>•</span>

                                                    <span>5 min session</span>

                                                </div>

                                            </div>

                                            <div className="flex items-center gap-6 text-[13px] font-semibold text-gray-600 bg-gray-50/50 px-4 py-2 rounded-2xl border border-gray-100/50">

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

                                                value: interviewScore.toFixed(1),

                                                total: "/10",

                                                status: interviewStatusLabel,

                                                statusColor: interviewScore >= 7 ? "text-emerald-600 bg-emerald-50" : interviewScore >= 4 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"

                                            },

                                            {

                                                label: "Integrity score",

                                                value: (integrityScore / 10).toFixed(1),

                                                total: "/10",

                                                status: integrityStatusLabel,

                                                statusColor: integrityScore >= 85 ? "text-emerald-600 bg-emerald-50" : integrityScore >= 70 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"

                                            },

                                            {

                                                label: "Combined score",

                                                value: combinedScore.toFixed(1),

                                                total: "/10",

                                                status: combinedStatusLabel,

                                                statusColor: combinedScore >= 7 ? "text-emerald-600 bg-emerald-50" : combinedScore >= 4 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"

                                            },

                                            {

                                                label: "Communication",

                                                value: communicationLevel,

                                                total: "CEFR",

                                                status: communicationStatus,

                                                statusColor: communicationLevel === "Pending" ? "text-slate-500 bg-slate-50" : communicationStatus === "Strong" ? "text-emerald-600 bg-emerald-50" : communicationStatus === "Average" ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"

                                            },

                                        ].map((card, i) => (

                                            <div key={i} className="bg-[#FDF9F3] rounded-3xl p-6 border border-[#F5E6D3] flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">

                                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-100 to-transparent group-hover:via-orange-200 transition-all opacity-0 group-hover:opacity-100" />

                                                <p className="text-[9px] font-bold text-[#A89078] uppercase tracking-[0.2em]">{card.label}</p>

                                                <div className="flex items-baseline gap-1">

                                                    <span className="text-2xl font-bold text-[#4A3728] tracking-tight">{card.value}</span>

                                                    <span className="text-[10px] font-semibold text-[#A89078]">/{card.total}</span>

                                                </div>

                                                <div className={cn("px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-transparent shadow-sm", card.statusColor.split(' ').slice(0, 1).join(' '), card.statusColor.split(' ').slice(1).join(' '))}>

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

                                                <AvatarFallback className="text-2xl font-bold bg-gray-900 text-white rounded-2xl">

                                                    {candidate.fullName?.substring(0, 2).toUpperCase()}

                                                </AvatarFallback>

                                            </Avatar>

                                        </div>

                                        <div className="space-y-4">

                                            <div className="flex items-center gap-3 flex-wrap">

                                                <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{candidate.fullName}</h1>

                                                {score >= 75 && (

                                                    <div className="bg-indigo-600 text-white text-[9px] font-semibold uppercase tracking-widest rounded-full px-3 py-1 flex items-center gap-1.5 shadow-lg shadow-indigo-200">

                                                        <Sparkles className="h-3 w-3" /> AI Verified

                                                    </div>

                                                )}

                                            </div>

                                            <p className="text-xl font-semibold text-gray-400">{candidate.drive?.role || candidate.drive?.title || "Role N/A"}</p>

                                            <div className="flex flex-wrap gap-8 pt-2">

                                                {[

                                                    { icon: Mail, value: candidate.email },

                                                    { icon: Phone, value: candidate.phone || "N/A" },

                                                    { icon: MapPin, value: structuredResume.location?.city ? `${structuredResume.location.city}, ${structuredResume.location.country || ""}` : (candidate.location || "N/A") },

                                                    { icon: Calendar, value: mounted ? `Applied ${new Date(candidate.createdAt).toLocaleDateString()}` : "Applied --/--/----" },

                                                ].filter(item => item.value !== "N/A" && item.value !== "N/A, ").map(({ icon: Icon, value }) => (

                                                    <div key={value} className="flex items-center gap-3 text-[14px] font-semibold text-slate-500">

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

                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alignment</p>

                                                <div className={cn(

                                                    "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border mt-1",

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

                                <div className="space-y-10 pb-20">

                                    <div className="px-10 pt-10 pb-6 group">

                                        <div className="relative pb-4">

                                            <div className="absolute bottom-0 left-0 w-24 h-1 bg-slate-950 rounded-full" />

                                            <h2 className="text-3xl font-bold text-slate-950 tracking-wide uppercase leading-none font-inter">

                                                Resume Analysis

                                            </h2>

                                        </div>

                                        {!candidate.aiReport && !candidate.resumeText && (

                                            <div className="mt-10 p-10 bg-amber-50 rounded-3xl border border-amber-200 flex flex-col items-center text-center gap-4">

                                                <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">

                                                    <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />

                                                </div>

                                                <div className="space-y-1">

                                                    <p className="text-[14px] font-bold text-amber-900 uppercase tracking-widest">Processing Resume...</p>

                                                    <p className="text-sm text-amber-700/70">We are currently extracting and analyzing this candidate's resume. This usually takes 30-60 seconds.</p>

                                                </div>

                                                <Button onClick={() => fetchCandidate()} variant="outline" className="rounded-xl border-amber-200 hover:bg-white bg-amber-50/50">

                                                    Check Status

                                                </Button>

                                            </div>

                                        )}

                                        <div className="mt-10 p-10 bg-white rounded-3xl border border-slate-100 shadow-md relative overflow-hidden group/summary">

                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600/30 group-hover/summary:bg-blue-600 transition-colors" />

                                            <div className="flex items-start gap-8">

                                                <div className="h-14 w-14 rounded-xl bg-white shadow-xl shadow-blue-900/5 border border-slate-100 flex items-center justify-center shrink-0">

                                                    <Sparkles className="h-7 w-7 text-blue-600" />

                                                </div>

                                                <div className="space-y-4">

                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em] leading-none">

                                                        {candidate.aiReport ? "AI Strategic Synthesis" : "Preliminary Resume Insight"}

                                                    </p>

                                                    <p className="text-[19px] font-medium text-slate-700 leading-[1.8] font-inter italic mb-2 tracking-tight">

                                                        "{summary}"

                                                    </p>

                                                </div>

                                            </div>

                                        </div>

                                    </div>

                                    <div className="p-8 bg-white border border-slate-200 shadow-sm rounded-3xl shadow-sm optimize-scroll">

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

                                            <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-wide">Candidate Skill Alignment</h3>

                                        </div>

                                        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">

                                            <div className="grid grid-cols-3 px-8 py-3 bg-slate-50 border-b border-slate-200">

                                                <span className="text-[10px] font-bold text-slate-950 uppercase tracking-widest font-inter">Requirement</span>

                                                <span className="text-[10px] font-bold text-slate-950 uppercase tracking-widest text-center font-inter">Priority</span>

                                                <span className="text-[10px] font-bold text-slate-950 uppercase tracking-widest text-right font-inter">Status</span>

                                            </div>

                                            <div className="divide-y divide-slate-100">

                                                {(() => {

                                                    const matchData = aiData.skill_matching || {};

                                                    const mustHaveDetails = Array.isArray(matchData.must_have_details) ? matchData.must_have_details : [];

                                                    const matchedMust = Array.isArray(matchData.matched_must) ? matchData.matched_must : [];

                                                    const missingMust = Array.isArray(matchData.missing_must) ? matchData.missing_must : [];

                                                    const normalizeSkill = (value: any) =>

                                                        String(value || "")

                                                            .toLowerCase()

                                                            .replace(/[^a-z0-9]+/g, " ")

                                                            .replace(/\s+/g, " ")

                                                            .trim();

                                                    const resumeSkillPool = new Set(

                                                        [...techSkills, ...toolSkills, ...domainSkills, ...softSkills]

                                                            .map(normalizeSkill)

                                                            .filter(Boolean)

                                                    );

                                                    const extractSkillRowsFromDrive = () => {

                                                        try {

                                                            const raw = candidate.drive?.extractedDetails;

                                                            const jdDetails = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});

                                                            const candidates = [

                                                                jdDetails.must_have,

                                                                jdDetails.skills?.must_have,

                                                                jdDetails.technical_skills,

                                                                jdDetails.skills?.technical,

                                                                jdDetails.skills?.good_to_have,

                                                                jdDetails.good_to_have,

                                                                jdDetails.requirements,

                                                                jdDetails.candidate_requirements,

                                                            ];

                                                            for (const item of candidates) {

                                                                if (!Array.isArray(item) || item.length === 0) continue;

                                                                return item.map((s: any) => ({

                                                                    name: typeof s === "string" ? s : (s.skill || s.name || s.title || String(s)),

                                                                    weight: typeof s === "object" ? (s.weight || "high") : "high",

                                                                    status: "not_tested",

                                                                }));

                                                            }

                                                        } catch (e) {

                                                            console.warn("Failed to parse drive details for fallback", e);

                                                        }

                                                        return [];

                                                    };

                                                    const resolveSkillStatus = (skill: any) => {

                                                        const current = String(skill?.status || "").toLowerCase();

                                                        const skillName = String(skill?.name || "");

                                                        const normalizedSkill = normalizeSkill(skillName);

                                                        const reportIsGenerating = !candidate?.aiReport;

                                                        if (current === "found" || current === "matched") {

                                                            return { label: "Matched", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };

                                                        }

                                                        if (current === "mentioned" || current === "partial") {

                                                            return { label: "Partial", className: "bg-amber-50 text-amber-700 border-amber-200" };

                                                        }

                                                        if (current === "not_found" || current === "missing") {

                                                            return { label: "Missing", className: "bg-rose-50 text-rose-700 border-rose-200" };

                                                        }

                                                        const candidateHasSkill = Array.from(resumeSkillPool).some((known) => {

                                                            return (

                                                                normalizedSkill === known ||

                                                                normalizedSkill.includes(known) ||

                                                                known.includes(normalizedSkill)

                                                            );

                                                        });

                                                        if (candidateHasSkill) {

                                                            return { label: "Matched", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };

                                                        }

                                                        return reportIsGenerating

                                                            ? { label: "Pending", className: "bg-slate-50 text-slate-500 border-slate-200" }

                                                            : { label: "Missing", className: "bg-rose-50 text-rose-700 border-rose-200" };

                                                    };

                                                    const derivedDetails = mustHaveDetails.length > 0

                                                        ? mustHaveDetails

                                                        : [

                                                            ...matchedMust.map((s: string) => ({ name: s, weight: 'high', status: 'found' })),

                                                            ...missingMust.map((s: string) => ({ name: s, weight: 'high', status: 'not_found' }))

                                                        ];

                                                    const details = derivedDetails.length > 0

                                                        ? derivedDetails

                                                        : extractSkillRowsFromDrive();

                                                    return details.length > 0 ? details.map((skill: any, idx: number) => (

                                                        <div key={idx} className="grid grid-cols-3 px-8 py-4 hover:bg-slate-50 transition-colors cursor-default items-center">

                                                            <span className="text-sm font-semibold text-slate-800">{skill.name}</span>

                                                            <div className="flex justify-center">

                                                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.22em]">

                                                                    {skill.weight || 'mid'}

                                                                </span>

                                                            </div>

                                                            <div className="flex justify-end">

                                                                <div className={cn(

                                                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.18em] border shadow-sm min-w-[88px] text-center",

                                                                    resolveSkillStatus(skill).className

                                                                )}>

                                                                    {resolveSkillStatus(skill).label}

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

                                        <div className="p-8 bg-white border border-slate-200 shadow-sm rounded-3xl border-t-4 border-t-emerald-500 shadow-sm space-y-10 optimize-scroll">

                                            <div className="flex items-center gap-4">

                                                <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">

                                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />

                                                </div>

                                                <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-wide">Key Strengths</h3>

                                            </div>

                                            <div className="grid gap-5">

                                                {aiData.strengths && aiData.strengths.length > 0 ? aiData.strengths.slice(0, 4).map((s: any, i: number) => (

                                                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/30 group hover:border-emerald-100 hover:bg-emerald-50/20 transition-all">

                                                        <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">

                                                            <CheckCircle2 className="h-3 w-3" />

                                                        </div>

                                                        <div className="space-y-1">

                                                            <p className="text-[13px] font-semibold text-slate-800 leading-tight">{typeof s === 'string' ? s : s.point}</p>

                                                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">{s.evidence || "Demonstrated proficiency."}</p>

                                                        </div>

                                                    </div>

                                                )) : <p className="text-xs italic text-slate-400">No strengths data.</p>}

                                            </div>

                                        </div>

                                        <div className="p-8 bg-white border border-slate-200 shadow-sm rounded-3xl border-t-4 border-t-amber-500 shadow-sm space-y-10 optimize-scroll">

                                            <div className="flex items-center gap-4">

                                                <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center">

                                                    <AlertTriangle className="h-5 w-5 text-amber-600" />

                                                </div>

                                                <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-wide">Growth Areas</h3>

                                            </div>

                                            <div className="grid gap-5">

                                                {(aiData.concerns || aiData.weaknesses || []).slice(0, 4).map((c: any, i: number) => (

                                                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/30 group hover:border-rose-100 hover:bg-rose-50/20 transition-all">

                                                        <div className="h-6 w-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">

                                                            <AlertCircle className="h-3 w-3" />

                                                        </div>

                                                        <div className="space-y-1">

                                                            <p className="text-[13px] font-semibold text-slate-800 leading-tight">{typeof c === 'string' ? c : c.point}</p>

                                                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">{c.impact || "Requires mentoring."}</p>

                                                        </div>

                                                    </div>

                                                ))}

                                            </div>

                                        </div>

                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                                        {/* -- Career Timeline (Left) ---------------- */}

                                        <div className="p-6 bg-white border border-slate-200 shadow-sm bg-white rounded-3xl shadow-sm flex flex-col h-full border border-slate-100 optimize-scroll">

                                            <div className="flex items-center gap-3 mb-10 px-2">

                                                <div className="h-10 w-10 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">

                                                    <BriefcaseBusiness className="h-5 w-5 text-slate-400" />

                                                </div>

                                                <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-[0.2em]">Career Timeline</h3>

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

                                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">

                                                                                {role.start_date || role.start_year || "?"} -- {isCurrent ? "Present" : (role.end_date || role.end_year || "?")}

                                                                            </span>

                                                                            <h4 className="text-[16px] font-bold text-slate-900 tracking-tight leading-tight group-hover:text-blue-500 transition-colors">

                                                                                {role.role}

                                                                            </h4>

                                                                            <p className="text-[12px] font-semibold text-blue-500/80">{role.company}</p>

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

                                        {/* -- Strategic Verdict (Right) ------------- */}

                                        <div className="p-6 bg-white border border-slate-200 shadow-sm bg-indigo-50/30 rounded-3xl border border-indigo-100/50 shadow-sm flex flex-col h-full relative overflow-hidden group optimize-scroll">

                                            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-200/20 blur-[60px] rounded-full -mr-24 -mt-24 pointer-events-none" />

                                            <div className="flex items-center gap-3 mb-10 px-2 relative z-10">

                                                <div className="h-10 w-10 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center shadow-sm">

                                                    <Sparkles className="h-5 w-5 text-indigo-500" />

                                                </div>

                                                <h3 className="text-[13px] font-bold text-indigo-900 uppercase tracking-[0.2em]">Strategic Verdict</h3>

                                            </div>

                                            <div className="flex flex-col gap-10 flex-1 relative z-10">

                                                <div className="space-y-6 border-l-4 border-indigo-200/50 pl-6">

                                                    {(() => {

                                                        const rawText = expertSynthesis;

                                                        const points = typeof rawText === 'string'

                                                            ? rawText.split(/(?:\. |\n|(?:\s*-\s*))/).filter(p => p.trim().length > 15)

                                                            : [rawText];

                                                        return points.slice(0, 3).map((point: string, pIdx: number) => (

                                                            <div key={pIdx} className="space-y-1">

                                                                <p className="text-[15px] font-medium text-indigo-950 leading-relaxed font-inter italic">

                                                                    "{point.trim().replace(/^\.*|\.*$/g, '')}."

                                                                </p>

                                                            </div>

                                                        ));

                                                    })()}

                                                </div>

                                                <div className="mt-auto pt-8 border-t border-indigo-100/50 flex flex-col gap-4">

                                                    <div className="flex items-center justify-between">

                                                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Onboarding Window</span>

                                                        <span className="text-[12px] font-bold text-indigo-900 uppercase tracking-widest bg-white border border-indigo-100 px-4 py-1.5 rounded-full shadow-sm">

                                                            {aiData.suitability_analysis?.readiness_timeline || "6-12 MONTHS"}

                                                        </span>

                                                    </div>

                                                    <div className="p-5 rounded-3xl bg-white/60 border border-indigo-100/50 flex items-center justify-between gap-4">

                                                        <div className="flex flex-col gap-0.5">

                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Potential For Role</span>

                                                            <span className="text-[13px] font-bold text-slate-900">{candidatePotential.for_this_role || "Pending"}</span>

                                                        </div>

                                                        <div className="text-right max-w-[70%]">

                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Capability Snapshot</span>

                                                            <span className="text-[12px] font-semibold text-slate-700 leading-relaxed">{candidatePotential.reasoning || "The report will explain what the candidate can do today and where they are not yet ready."}</span>

                                                        </div>

                                                    </div>

                                                    <div className="p-5 rounded-3xl bg-white/60 border border-indigo-100/50 flex items-center justify-between gap-4">

                                                        <div className="flex flex-col gap-0.5">

                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Decision Logic</span>

                                                            <span className="text-[13px] font-bold text-slate-900">{normalizedStatus === "Shortlisted" ? "Move to leadership review" : normalizedStatus === "Rejected" ? "No further action" : "Awaiting signal validation"}</span>

                                                        </div>

                                                        <div className={cn(

                                                            "h-10 w-10 rounded-2xl flex items-center justify-center",

                                                            normalizedStatus === "Shortlisted" ? "bg-emerald-50 text-emerald-600" : normalizedStatus === "Rejected" ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-400"

                                                        )}>

                                                            <ArrowRight className="h-5 w-5" />

                                                        </div>

                                                    </div>

                                                    {decisionBreakdown.length > 0 && (
                                                        <div className="space-y-3">
                                                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Criteria Match</p>
                                                            <div className="space-y-3">
                                                                {decisionBreakdown.slice(0, 4).map((item: any, idx: number) => (
                                                                    <div key={idx} className="p-4 rounded-2xl bg-white/70 border border-indigo-100/50">
                                                                        <div className="flex items-start justify-between gap-4">
                                                                            <div className="space-y-1">
                                                                                <p className="text-[13px] font-bold text-slate-900">{item.criteria}</p>
                                                                                <p className="text-[11px] font-medium text-slate-500 leading-relaxed">{item.note}</p>
                                                                            </div>
                                                                            <span className="text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full border bg-white text-slate-700">{item.result}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                </div>

                                            </div>

                                        </div>

                                    </div>

                                    {/* 8. Candidate Analysis - Expert Commentary */}

                                    <div className={cn(

                                        "p-8 bg-white border border-slate-200 shadow-sm border rounded-3xl space-y-8 mx-2 transition-colors  optimize-scroll",

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

                                                "text-[12px] font-bold uppercase tracking-widest font-inter",

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

                                                    "text-sm font-bold mb-6 uppercase tracking-widest border-b pb-2 inline-block font-inter",

                                                    normalizedStatus === "Shortlisted" ? "text-emerald-900 border-emerald-200" :

                                                        normalizedStatus === "Rejected" ? "text-rose-900 border-rose-200" : "text-slate-950 border-slate-200"

                                                )}>What They Can Do</h4>

                                                <p className={cn(

                                                    "text-lg font-medium leading-relaxed font-inter italic",

                                                    normalizedStatus === "Shortlisted" ? "text-emerald-800" :

                                                        normalizedStatus === "Rejected" ? "text-rose-800" : "text-slate-600"

                                                )}>

                                                    {aiData.recruiter_snapshot || summary || "No recruiter snapshot is available for this interview yet."}

                                                </p>

                                                <div className={cn(

                                                    "mt-8 space-y-4 pt-6 border-t",

                                                    normalizedStatus === "Shortlisted" ? "border-emerald-100" :

                                                        normalizedStatus === "Rejected" ? "border-rose-100" : "border-slate-100"

                                                )}>

                                                    <p className={cn(

                                                        "text-[12px] font-bold uppercase tracking-widest font-inter",

                                                        normalizedStatus === "Shortlisted" ? "text-emerald-600" :

                                                            normalizedStatus === "Rejected" ? "text-rose-600" : "text-slate-950"

                                                    )}>

                                                        Strategic Decision Path

                                                    </p>

                                                    <div className="grid gap-6">

                                                        {[

                                                            {

                                                                label: "Next Step Action",

                                                                value: normalizedStatus === "Shortlisted"
                                                                    ? `PROCEED: ${decisionReason}`
                                                                    : normalizedStatus === "Rejected"
                                                                        ? `DO NOT PROCEED: ${decisionReason}`
                                                                        : `REVIEW: ${decisionReason}`,

                                                                indicator: "h-2 w-2"

                                                            },

                                                            {

                                                                label: "Core Rationale",

                                                                value: (candidatePotential.reasoning || aiData.strengths?.[0]?.point || aiData.strengths?.[0] || "Identified foundational technical alignment.") + " " + (aiData.suitability_analysis?.suggestions?.[0] || ""),

                                                                indicator: "h-2 w-2"

                                                            },

                                                            {

                                                                label: "Strategic Decision",

                                                                value: normalizedStatus === "Shortlisted"
                                                                    ? `CONFIRMED: ${expertSynthesis}`
                                                                    : normalizedStatus === "Rejected"
                                                                        ? `DECLINED: ${expertSynthesis}`
                                                                        : `PENDING: ${expertSynthesis}`,

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

                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">

                                                                        {decision.label}

                                                                    </p>

                                                                    <p className={cn(

                                                                        "text-[15px] font-semibold leading-snug tracking-tight",

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

                </div>

                {activeTab === "interview" && candidate && hasStructuredInterviewReport && (

                        <div className="space-y-12 pb-20 bg-[#F4F7FF] -mx-8 px-12 pt-16 font-inter">

                            <div className="space-y-12">

                                <div className="flex flex-col items-center gap-2 text-center mb-4">

                                    <h2 className="text-3xl font-bold text-slate-950 tracking-tight font-inter uppercase">Performance Analysis</h2>

                                    <div className="h-1 w-20 bg-indigo-600 rounded-full" />

                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">

                                    <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">

                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Header Scores</h3>

                                        <div className="grid grid-cols-2 gap-4">

                                            <VerdictScoreCard label="Interview / 10" value={String(interviewReportScores.interview_score ?? interviewScore.toFixed(1))} color="blue" />

                                            <VerdictScoreCard label="Combined / 100" value={String(interviewReportScores.combined_score ?? Math.round(combinedScore * 10))} color="indigo" />

                                            <VerdictScoreCard label="CEFR" value={String(interviewReportScores.cefr_level ?? communicationLevel)} color="slate" />

                                            <VerdictScoreCard label="Integrity / 10" value={String((integrityScore / 10).toFixed(1))} color="orange" />

                                        </div>

                                    </div>

                                    <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">

                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Communication Analysis</h3>

                                        <CommunicationDonutChart

                                            metrics={[

                                                { label: "CLARITY", value: interviewReportCommunication.clarity ?? 60, color: "#6366F1" },

                                                { label: "FLUENCY", value: interviewReportCommunication.fluency ?? 35, color: "#F59E0B" },

                                                { label: "GRAMMAR", value: interviewReportCommunication.grammar ?? 30, color: "#10B981" },

                                                { label: "DEPTH", value: interviewReportCommunication.depth ?? 45, color: "#F43F5E" }

                                            ]}

                                        />

                                        <div className="p-5 rounded-2xl bg-[#FAF9F6] border border-[#F5E6D3]/30 space-y-2">

                                            <p className="text-[9px] font-bold text-[#A89078] uppercase tracking-[0.3em]">CEFR RATING</p>

                                            <h4 className="text-xl font-bold text-[#8B5E3C] tracking-tight">{String(interviewReportScores.cefr_level || communicationLevel)} -- {String(interviewReportScores.cefr_label || communicationStatus)}</h4>

                                            <p className="text-[15px] font-medium text-gray-500 leading-relaxed">

                                                {interviewReportCommunication.cefr_analysis || "Communication analysis will appear here once the interview report is generated."}

                                            </p>

                                        </div>

                                    </div>

                                    <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-4">

                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Interview Recording</h3>

                                        <div className="aspect-video w-full rounded-2xl border-[5px] border-gray-900 bg-black overflow-hidden shadow-2xl relative">

                                            {interviewRecordingUrl ? (

                                                <Plyr

                                                    key={interviewRecordingUrl}

                                                    source={{ type: "video", sources: [{ src: interviewRecordingUrl, type: "video/mp4" }] }}

                                                    options={{ duration: recordingDurationSec || undefined }}

                                                />

                                            ) : (

                                                <div className="h-full w-full flex items-center justify-center text-gray-500 text-[10px] font-bold uppercase tracking-widest bg-gray-900/50">Video Loading...</div>

                                            )}

                                        </div>

                                        <div className="grid grid-cols-2 gap-4">

                                            <div className="p-4 rounded-xl bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">

                                                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Total duration</span>

                                                <p className="text-lg font-bold text-gray-900 leading-none">{interviewReportRecording.duration_label || (recordingDurationSec ? formatDuration(recordingDurationSec) : "--:--min")}</p>

                                            </div>

                                            <div className="p-4 rounded-xl bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">

                                                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Words Spoken</span>

                                                <p className="text-lg font-bold text-gray-900 leading-none">{typeof interviewReportRecording.word_count === "number" ? interviewReportRecording.word_count.toLocaleString() : wordCount.toLocaleString()}</p>

                                            </div>

                                        </div>

                                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">

                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em]">AI Summary</p>

                                            <p className="text-[13px] font-medium text-slate-700 leading-relaxed">{interviewReportSummary || "AI summary will appear here once the interview report is generated."}</p>

                                        </div>

                                    </div>

                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch max-w-[1400px] mx-auto">

                                    <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">

                                        <div className="flex items-center justify-between mb-8">

                                            <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight">Did the Interview Prove JD Skills?</h3>

                                            <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />

                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mb-5">

                                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm">

                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Overall JD Match</p>

                                                <p className="text-[26px] font-black text-slate-900 leading-none mt-2">{interviewSkillStats.overallMatch}%</p>

                                                <p className="text-[11px] font-medium text-slate-500 mt-2">Based on proved and partially proved skills</p>

                                            </div>

                                            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-sm">

                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-500">Strongest Proof</p>

                                                <p className="text-[15px] font-bold text-emerald-950 leading-snug mt-2 line-clamp-2">

                                                    {String(interviewSkillStats.strongest?.title || "No proven skill yet")}

                                                </p>

                                                <p className="text-[11px] font-medium text-emerald-700 mt-2">

                                                    {String(interviewSkillStats.strongest?.score || "--")} · {String(interviewSkillStats.strongest?.status || "N/A")}

                                                </p>

                                            </div>

                                            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 shadow-sm">

                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-500">Biggest Gap</p>

                                                <p className="text-[15px] font-bold text-rose-950 leading-snug mt-2 line-clamp-2">

                                                    {String(interviewSkillStats.biggestGap?.title || "No major gap detected")}

                                                </p>

                                                <p className="text-[11px] font-medium text-rose-700 mt-2">

                                                    {String(interviewSkillStats.biggestGap?.score || "--")} · {String(interviewSkillStats.biggestGap?.status || "N/A")}

                                                </p>

                                            </div>

                                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 shadow-sm">

                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-500">Skill Split</p>

                                                <p className="text-[15px] font-bold text-amber-950 leading-snug mt-2">

                                                    {interviewSkillStats.proved} proved, {interviewSkillStats.partial} partial

                                                </p>

                                                <p className="text-[11px] font-medium text-amber-700 mt-2">

                                                    {interviewSkillStats.notProved} not proved, {interviewSkillStats.notTested} not tested

                                                </p>

                                            </div>

                                        </div>

                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-1 space-y-4">

                                            {(interviewReportSkills.length > 0 ? interviewReportSkills : []).map((s: any, i: number) => (

                                                <AssessmentCard

                                                    key={i}

                                                    title={s.title}

                                                    subtitle={s.note || ""}

                                                    confidence={s.confidence || ""}

                                                    score={s.score || "--"}

                                                    status={String(s.status || "").toUpperCase() as any}

                                                />

                                            ))}

                                        </div>

                                    </div>

                                    <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">

                                        <div className="flex items-center justify-between mb-8">

                                            <div className="flex flex-col gap-1">

                                                <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight">Full Session Log</h3>

                                                <div className="flex items-center gap-2">

                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />

                                                    <span className="text-[10px] font-inter font-bold text-emerald-600 uppercase tracking-widest">Secure Audit Mode</span>

                                                </div>

                                            </div>

                                        </div>

                                        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 pr-2">

                                            {interviewSessionRows.map((item: any, i: number) => (

                                                <div key={i} className="p-5 rounded-3xl border border-gray-100 bg-white shadow-sm space-y-3">

                                                    <div className="flex items-start justify-between gap-4">

                                                        <div className="space-y-1">

                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Question {item.q || i + 1}</p>

                                                            <p className="text-[14px] font-semibold text-gray-900 leading-relaxed">{item.question || item.title}</p>

                                                        </div>

                                                        <span className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">

                                                            {item.score || "--"}

                                                        </span>

                                                    </div>

                                                    <p className="text-[13px] font-medium text-gray-600 leading-relaxed">{item.reasoning || item.verdict || "No reasoning available."}</p>

                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.confidence || ""}</p>

                                                </div>

                                            ))}

                                            {interviewQaRows.map((q: any, i: number) => (

                                                <div key={`q-${i}`} className="p-5 rounded-3xl border border-gray-100 bg-[#FAF9F6] shadow-sm space-y-3">

                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Question {String(q.q || i + 1).padStart(2, "0")}</p>

                                                    <p className="text-[14px] font-semibold text-gray-900 leading-relaxed">{q.question || q.title}</p>

                                                    <p className="text-[13px] font-medium text-gray-600 leading-relaxed">{q.reasoning || q.verdict || "No reasoning available."}</p>

                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{q.score || "--"} {q.confidence ? `• ${q.confidence}` : ""}</p>

                                                </div>

                                            ))}

                                        </div>

                                    </div>

                                    <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">

                                        <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight mb-8">Resume claims vs Interview proof -- consistency check</h3>

                                        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4">

                                            {(interviewReportConsistency.length > 0 ? interviewReportConsistency : []).map((c: any, i: number) => (

                                                <div key={i} className="p-5 rounded-3xl border border-gray-100 bg-white shadow-sm space-y-3">

                                                    <p className="text-[14px] font-bold text-gray-900 leading-tight">{c.claim}</p>

                                                    <p className="text-[9px] font-bold text-slate-500 font-bold uppercase tracking-wide">FIELD: {c.sub}</p>

                                                    <p className="text-[13px] font-medium text-gray-600 leading-relaxed">{c.proof}</p>

                                                    <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm bg-slate-50 text-slate-600 border-slate-100">{String(c.status || "").replace("_", " ")}</span>

                                                </div>

                                            ))}

                                        </div>

                                    </div>

                                    <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">

                                        <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight mb-8">Key Moments From Session</h3>

                                        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 pr-2">

                                            {(interviewReportKeyMoments.length > 0 ? interviewReportKeyMoments : []).map((m: any, i: number) => (

                                                <div key={i} className="grid grid-cols-[80px_1fr] gap-4 p-4 rounded-3xl border border-gray-100 bg-white shadow-sm">

                                                    <span className="text-[12px] font-bold text-slate-500">{m.time}</span>

                                                    <div className="space-y-1">

                                                        <p className="text-[14px] font-semibold text-gray-900">{m.title}</p>

                                                        <p className="text-[13px] font-medium text-gray-600 leading-relaxed">{m.note}</p>

                                                    </div>

                                                </div>

                                            ))}

                                        </div>

                                    </div>

                                </div>

                                <div className="pt-16 border-t border-gray-200 mt-16 space-y-8">

                                    <div className="flex flex-col items-center gap-2 text-center mb-6">

                                        <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-inter uppercase">Strategic Verdict</h2>

                                        <div className="h-1 w-16 bg-indigo-600 rounded-full" />

                                    </div>

                                    <div className="w-full max-w-[1200px] mx-auto p-8 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-5">

                                        <div className="flex items-start justify-between gap-4">

                                            <p className="text-[15px] font-medium text-slate-700 leading-[1.7] max-w-[900px]">

                                                {String(interviewStrategicVerdict.summary || interviewReportVerdict.summary || "Strategic summary will appear here once the report is generated.")}

                                            </p>

                                            <span className={cn(

                                                "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border shrink-0",

                                                String(interviewStrategicVerdict.decision || "").toLowerCase().includes("hire")

                                                    ? "bg-emerald-50 border-emerald-100 text-emerald-700"

                                                    : String(interviewStrategicVerdict.decision || "").toLowerCase().includes("do not")

                                                        ? "bg-rose-50 border-rose-100 text-rose-700"

                                                        : "bg-amber-50 border-amber-100 text-amber-700"

                                            )}>

                                                {String(interviewStrategicVerdict.decision || interviewReportVerdict.recommendation || "Pending")}

                                            </span>

                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">

                                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Strategic Rationale</p>

                                                <div className="space-y-2">

                                                    {(Array.isArray(interviewStrategicVerdict.rationale) && interviewStrategicVerdict.rationale.length > 0)

                                                        ? interviewStrategicVerdict.rationale.map((item: string, index: number) => (

                                                            <p key={index} className="text-[14px] font-medium text-slate-700 leading-[1.7]">

                                                                {item}

                                                            </p>

                                                        ))

                                                        : (

                                                            <p className="text-[14px] font-medium text-slate-500 leading-[1.7]">

                                                                {interviewReportVerdict.recommendation_reason || "Waiting for interview report"}

                                                            </p>

                                                        )

                                                    }

                                                </div>

                                            </div>

                                            <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-100 space-y-3">

                                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Recommended Next Action</p>

                                                <div className="space-y-2">

                                                    {(Array.isArray(interviewStrategicVerdict.next_actions) && interviewStrategicVerdict.next_actions.length > 0)

                                                        ? interviewStrategicVerdict.next_actions.map((item: string, index: number) => (

                                                            <p key={index} className="text-[14px] font-medium text-indigo-900 leading-[1.7]">

                                                                {item}

                                                            </p>

                                                        ))

                                                        : (

                                                            <p className="text-[14px] font-medium text-indigo-900 leading-[1.7]">

                                                                {interviewReportVerdict.recommendation_reason || "Waiting for interview report"}

                                                            </p>

                                                        )

                                                    }

                                                </div>

                                            </div>

                                        </div>

                                    </div>

                                </div>

                            </div>

                        </div>

                    )}

                {activeTab === "interview" && candidate && !hasStructuredInterviewReport && (

    <div className="space-y-12 pb-20 bg-[#F4F7FF] -mx-8 px-12 pt-16 font-inter">

                            

                            {/* -- Section: Performance Analysis -- */}

                            <div className="space-y-12">

                                <div className="flex flex-col items-center gap-2 text-center mb-4">

                                    <h2 className="text-3xl font-bold text-slate-950 tracking-tight font-inter uppercase">Performance Analysis</h2>

                                    <div className="h-1 w-20 bg-indigo-600 rounded-full" />

                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">

                                    {/* communication */}

                                    <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-sm space-y-6 flex flex-col scale-[0.98] origin-top-left">

                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Communication Analysis</h3>

                                        <div className="flex justify-center py-2 flex-1 items-center">

                                            <CommunicationDonutChart

                                                metrics={[

                                                    { label: "CLARITY", value: Math.max(0, Math.min(100, interviewReportCommunication.clarity ?? 60)), color: "#6366F1" },

                                                    { label: "FLUENCY", value: Math.max(0, Math.min(100, interviewReportCommunication.fluency ?? 35)), color: "#F59E0B" },

                                                    { label: "GRAMMAR", value: Math.max(0, Math.min(100, interviewReportCommunication.grammar ?? 30)), color: "#10B981" },

                                                    { label: "DEPTH", value: Math.max(0, Math.min(100, interviewReportCommunication.depth ?? 45)), color: "#F43F5E" }

                                                ]}

                                            />

                                        </div>

                                        <div className="p-5 rounded-2xl bg-[#FAF9F6] border border-[#F5E6D3]/30 space-y-2">

                                            <p className="text-[9px] font-bold text-[#A89078] uppercase tracking-[0.3em]">CEFR RATING</p>

                                            <h4 className="text-xl font-bold text-[#8B5E3C] tracking-tight">

                                                {(interviewReportScores.cefr_level || communicationLevel)} -- {(interviewReportScores.cefr_label || communicationStatus)}

                                            </h4>

                                            <p className="text-[15px] font-medium text-gray-500 leading-relaxed">

                                                {interviewReportCommunication.cefr_analysis || "Communication analysis will appear here once the interview report is generated."}

                                            </p>

                                        </div>

                                    </div>

                                    {/* video */}

                                    <div className="p-6 rounded-3xl bg-white border border-gray-100 shadow-sm flex flex-col space-y-5 scale-[0.98] origin-top-right">

                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Interview Recording</h3>

                                        

                                        <div className="space-y-6 flex-1 flex flex-col">

                                            <div className="aspect-video w-full rounded-2xl border-[5px] border-gray-900 bg-black overflow-hidden shadow-2xl relative">

                                            {interviewRecordingUrl ? (

                                                <Plyr

                                                    key={interviewRecordingUrl}

                                                    source={{

                                                        type: "video",

                                                        sources: [{ src: interviewRecordingUrl, type: "video/mp4" }],

                                                    }}

                                                    options={{

                                                        duration: recordingDurationSec || undefined,

                                                        controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "captions", "settings", "pip", "fullscreen"],

                                                    }}

                                                />

                                            ) : (

                                                <div className="h-full w-full flex items-center justify-center text-gray-500 text-[10px] font-bold uppercase tracking-widest bg-gray-900/50">Video Loading...</div>

                                            )}

                                        </div>

                                            <div className="grid grid-cols-2 gap-4">

                                                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">

                                                    <div className="flex items-center gap-2 text-slate-500 font-black">

                                                        <Calendar className="h-4 w-4" />

                                                        <span className="text-[8px] font-bold uppercase tracking-widest">Total duration</span>

                                                    </div>

                                                <p className="text-lg font-bold text-gray-900 leading-none">{interviewReportRecording.duration_label || (recordingDurationSec ? formatDuration(recordingDurationSec) : "--:--min")}</p>

                                                </div>

                                                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">

                                                    <div className="flex items-center gap-2 text-[#F97316]">

                                                        <MessageSquare className="h-4 w-4" />

                                                        <span className="text-[8px] font-bold uppercase tracking-widest">Words Spoken</span>

                                                    </div>

                                                <p className="text-lg font-bold text-gray-900 leading-none">{typeof interviewReportRecording.word_count === "number" ? interviewReportRecording.word_count.toLocaleString() : (wordCount > 0 ? wordCount.toLocaleString() : "N/A")}</p>

                                                </div>

                                            </div>

                                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">

                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em]">AI Summary</p>

                                                <p className="text-[13px] font-medium text-slate-700 leading-relaxed">

                                                    {interviewReportSummary || "AI summary will appear here once the interview report is generated."}

                                                </p>

                                            </div>

                                    </div>

                                    <div className="h-2" /> {/* Spacer */}

                                </div>

                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch max-w-[1400px] mx-auto">

                                    {/* Section 1: JD Skills (Top Left) */}

                                    <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">

                                        <div className="flex items-center justify-between mb-8">

                                            <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight">Did the Interview Prove JD Skills?</h3>

                                            <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />

                                        </div>

                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-1">

                                            {(interviewReportSkills.length > 0 ? interviewReportSkills : [

                                                { title: "Role-specific skill proof", subtitle: "Not enough structured evidence was captured to score this section.", confidence: "LOW -- FALLBACK", score: "--", status: "NOT TESTED" }

                                            ]).map((s: any, i: number) => (

                                                <AssessmentCard

                                                    key={i}

                                                    title={s.title}

                                                    subtitle={s.note || s.subtitle || ""}

                                                    confidence={s.confidence || ""}

                                                    score={s.score || "--"}

                                                    status={String(s.status || "").toUpperCase() as any}

                                                />

                                            ))}

                                        </div>

                                    </div>

                                    {/* Section 2: Transcript (Top Right) */}

                                    <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">

                                        <div className="flex items-center justify-between mb-8">

                                            <div className="flex flex-col gap-1">

                                                <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight">Full Session Log</h3>

                                                <div className="flex items-center gap-2">

                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />

                                                    <span className="text-[10px] font-inter font-bold text-emerald-600 uppercase tracking-widest">Secure Audit Mode</span>

                                                </div>

                                            </div>

                                            <div className="flex items-center p-1 bg-gray-50 rounded-2xl border border-gray-100">

                                                <button 

                                                    onClick={() => setLogTab("chat")}

                                                    className={cn(

                                                        "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",

                                                        logTab === "chat" ? "bg-white text-indigo-600 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"

                                                    )}

                                                >

                                                    Chat

                                                </button>

                                                <button 

                                                    onClick={() => setLogTab("analysis")}

                                                    className={cn(

                                                        "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",

                                                        logTab === "analysis" ? "bg-white text-indigo-600 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"

                                                    )}

                                                >

                                                    Analysis

                                                </button>

                                            </div>

                                        </div>

                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-4 pt-4 ">

                                            {logTab === "chat" ? (

                                                <div className="flex flex-col flex-1 min-h-0">

                                                    <div className="flex items-center gap-3 mb-6 px-2">

                                                        <div className="h-8 w-8 rounded-xl bg-slate-950 flex items-center justify-center shadow-lg shadow-slate-900/20">

                                                            <MessageSquare className="h-4 w-4 text-white" />

                                                        </div>

                                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Session Transcript -- Analysis Phase</h4>

                                                    </div>

                                                    

                                                    <div className="flex-1 overflow-y-auto pr-2 space-y-8 custom-scrollbar  py-2">

                                                        {interviewSessionRows.length > 0 ? (

                                                            interviewSessionRows.map((item: any, i: number) => (

                                                                <div key={i} className="space-y-4">

                                                                    <ChatEntry role="ai" name="Ishita" text={item.question || item.title || `Question ${i + 1}`} />

                                                                    <ChatEntry role="candidate" name={candidate.fullName} text={item.answer || item.reasoning || "Candidate response unavailable."} />

                                                                </div>

                                                            ))

                                                        ) : (

                                                            <>

                                                                <ChatEntry role="ai" name="Ishita" text="No transcript turns are available for this interview yet." />

                                                            </>

                                                        )}

                                                    </div>

                                                </div>

                                            ) : (

                                                <div className="space-y-6">

                                                    <div className="flex items-center gap-3 mb-4">

                                                        <div className="h-8 w-8 rounded-xl bg-slate-950 flex items-center justify-center shadow-lg shadow-slate-900/20">

                                                            <Sparkles className="h-4 w-4 text-white" />

                                                        </div>

                                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">AI Integrity Breakdown</h4>

                                                    </div>

                                                    {(interviewReportQaBlocks.length > 0 ? interviewReportQaBlocks : normalizedInterviewTurns).map((q: any, i: number) => (

                                                        <AnalysisEntry key={i} {...q as any} />

                                                    ))}

                                                </div>

                                            )}

                                        </div>

                                    </div>

                                    {/* Section 3: Consistency Check (Bottom Left) */}

                                    <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">

                                        <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight mb-8">Resume claims vs Interview proof -- consistency check</h3>

                                        <div className="grid grid-cols-[1.5fr_1.8fr_120px] gap-6 px-6 mb-6 border-b border-gray-50 pb-6">

                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70">Resume Claimed</span>

                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70">Interview Showed</span>

                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70 text-center">Result</span>

                                        </div>

                                        <div className="flex-1 overflow-y-auto scrollbar-hide">

                                            {(interviewReportConsistency.length > 0 ? interviewReportConsistency : [

                                                { claim: "Consistency evidence not available", sub: "Interview data", proof: "No structured claim-vs-proof rows were generated for this interview yet.", status: "NOT TESTED" }

                                            ]).map((c: any, i: number) => (

                                                <div key={i} className="grid grid-cols-[1.5fr_1.8fr_120px] gap-8 px-6 py-6 rounded-3xl hover:bg-gray-50/50 transition-all group items-start border-b border-gray-50 last:border-0 relative">

                                                    <div className="space-y-2">

                                                        <p className="text-[14px] font-bold text-gray-900 leading-tight">{c.claim}</p>

                                                        <p className="text-[9px] font-bold text-slate-500 font-bold uppercase tracking-wide">FIELD: {c.sub}</p>

                                                    </div>

                                                    <div className="flex gap-4">

                                                        <ArrowRight className="h-4 w-4 text-gray-200 mt-1 shrink-0 group-hover:text-slate-900 transition-colors" />

                                                        <p className={cn("text-[13px] font-semibold leading-relaxed", 

                                                            c.status === "CONTRADICTED" || c.status === "MISMATCH" ? "text-rose-600" : 

                                                            c.status === "WEAK SIGNAL" ? "text-orange-700" : "text-gray-400 italic"

                                                        )}>

                                                            {c.proof}

                                                        </p>

                                                    </div>

                                                    <div className="flex justify-center">

                                                        <span className={cn("px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest border shadow-sm",

                                                            c.status === "MATCHED" ? "bg-slate-50 text-slate-900 border-slate-200 shadow-sm" :

                                                            c.status === "CONTRADICTED" || c.status === "MISMATCH" ? "bg-slate-950 text-white border-slate-900 shadow-sm" : 

                                                            "bg-slate-50 text-slate-500 border-slate-100 italic"

                                                        )}>{c.status.replace('_', ' ')}</span>

                                                    </div>

                                                </div>

                                            ))}

                                        </div>

                                    </div>

                                    {/* Section 4: Key Moments (Bottom Right) */}

                                    <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">

                                        <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight mb-8">Key Moments From Session</h3>

                                        <div className="flex grid grid-cols-[80px_1fr] px-6 mb-6 border-b border-gray-50 pb-6 mt-[-10px]">

                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70">Timeline</span>

                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70">Key Observation</span>

                                        </div>

                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-2">

                                            {(interviewReportKeyMoments.length > 0 ? interviewReportKeyMoments : [

                                                { time: "0:00", type: "INFO", observation: "No key moments extracted yet", comment: "This interview did not produce enough structured evidence to generate key moments." }

                                            ]).map((m: any, i: number) => (

                                                <MomentEntry key={i} {...m as any} />

                                            ))}

                                        </div>

                                    </div>

                                </div>

                                {/* -- Section: Integrity & Proctoring -- */}

                                <div className="pt-16 border-t border-gray-200 mt-16 space-y-8">

                                    <div className="flex flex-col items-center gap-2 text-center mb-6">

                                        <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-inter uppercase">Integrity and Proctoring</h2>

                                        <div className="h-1 w-16 bg-rose-500 rounded-full" />

                                    </div>

                                    <div className="flex justify-end -mt-16 mb-8">

                                        <Button 

                                            onClick={() => setIsAuditModalOpen(true)}

                                            variant="outline" 

                                            className="rounded-full border-gray-200 text-[10px] font-bold h-8 px-6 hover:bg-white hover:border-gray-900 transition-all uppercase tracking-widest shadow-sm"

                                        >

                                            View all logs

                                        </Button>

                                    </div>

                                    {/* -- Integrity Verdict Card -- */}

                                    <div className="grid grid-cols-[260px_1fr] rounded-3xl bg-white border-2 border-[#F5E6D3]/30 shadow-[0_20px_60px_rgba(139,94,60,0.06)] overflow-hidden border-l-[8px] border-l-[#8B5E3C]">

                                        <div className="bg-[#FAF9F6] p-8 flex flex-col items-center justify-center gap-4 border-r border-[#F5E6D3]/20">

                                            <h4 className="text-[12px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-60 mb-2">Integrity Score</h4>

                                            <div className="flex items-baseline gap-1">

                                                <span className="text-5xl font-bold text-gray-900 tracking-tighter">{(integrityScore / 10).toFixed(1)}</span>

                                                <span className="text-xl font-semibold text-gray-300">/10</span>

                                            </div>

                                            <span className="px-6 py-2 rounded-full bg-[#FEF3C7]/60 text-[#B45309] text-[10px] font-bold uppercase tracking-[0.2em] border border-[#FDE68A]">

                                                {integrityStatusLabel}

                                            </span>

                                        </div>

                                        <div className="p-8 space-y-5">

                                            <h4 className="text-[12px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-60 mb-1">Integrity Verdict</h4>

                                            <p className="text-[14px] font-medium text-gray-700 leading-[1.7] max-w-[95%]">

                                                {proctoringVerdictSummary}

                                            </p>

                                        </div>

                                    </div>

                                    {/* -- Proctoring Metrics Row -- */}

                                    <div className="flex gap-6">

                                        <ProctoringMetric value={String(groupedProctoringSignals.filter((g: any) => String(g.key).includes("tab")).reduce((n: number, g: any) => n + g.count, 0) || 0)} label="Tab Switches" risk={groupedProctoringSignals.some((g: any) => String(g.key).includes("tab") && g.severity === "high") ? "HIGH RISK" : groupedProctoringSignals.some((g: any) => String(g.key).includes("tab")) ? "MEDIUM RISK" : "NO RISK"} />

                                        <ProctoringMetric value={String(groupedProctoringSignals.filter((g: any) => String(g.key).includes("face")).reduce((n: number, g: any) => n + g.count, 0) || 0)} label="Face Events" risk={groupedProctoringSignals.some((g: any) => String(g.key).includes("face") && g.severity === "high") ? "HIGH RISK" : "NO RISK"} />

                                        <ProctoringMetric value={String(groupedProctoringSignals.filter((g: any) => String(g.key).includes("audio")).reduce((n: number, g: any) => n + g.count, 0) || 0)} label="Audio Signals" risk={groupedProctoringSignals.some((g: any) => String(g.key).includes("audio") && g.severity === "high") ? "HIGH RISK" : groupedProctoringSignals.some((g: any) => String(g.key).includes("audio")) ? "MEDIUM RISK" : "NO RISK"} />

                                        <ProctoringMetric value={String(groupedProctoringSignals.filter((g: any) => String(g.key).includes("gaze")).reduce((n: number, g: any) => n + g.count, 0) || 0)} label="Gaze Events" risk={groupedProctoringSignals.some((g: any) => String(g.key).includes("gaze") && g.severity === "high") ? "HIGH RISK" : groupedProctoringSignals.some((g: any) => String(g.key).includes("gaze")) ? "MEDIUM RISK" : "NO RISK"} />

                                    </div>

                                    {/* -- Correlation Timeline vs Pattern Analysis Grid -- */}

                                    <div className="grid grid-cols-[1.2fr_1fr] gap-8 items-stretch">

                                        {/* Left: Dynamic Event Timeline */}

                                        <div className="p-6 rounded-[36px] bg-white border border-gray-100 shadow-sm space-y-4 optimize-scroll">

                                            <h4 className="text-[14px] font-bold text-gray-900 font-inter tracking-tight mb-5">Event Timeline -- Correlated with Interview</h4>

                                            <div className="space-y-2">

                                                <TimelineEvent

                                                    time="0:00"

                                                    event="Session started"

                                                    risk="CLEAN"

                                                    desc="Camera initialized. Browser focus confirmed. Interview session began."

                                                    isSuccess

                                                />

                                                {proctoringSignals.map((ev: any, idx: number) => {

                                                    const ts = typeof ev?.timestamp === "number" ? ev.timestamp : 0;

                                                    const sessionStart = proctoringSignals[0]?.timestamp ?? ts;

                                                    const offsetSec = Math.max(0, Math.round((ts - sessionStart) / 1000));

                                                    const mins = Math.floor(offsetSec / 60);

                                                    const secs = offsetSec % 60;

                                                    const timeLabel = `${mins}:${String(secs).padStart(2, "0")}`;

                                                    const sev = String(ev?.severity || "low").toLowerCase();

                                                    const reason = String(ev?.reason || ev?.eventType || "Signal detected");

                                                    const eventType = String(ev?.eventType || "signal").replace(/_/g, " ");

                                                    const riskLabel: "HIGH RISK" | "MEDIUM RISK" | "CLEAN" = sev === "high" ? "HIGH RISK" : sev === "medium" ? "MEDIUM RISK" : "CLEAN";

                                                    return (

                                                        <TimelineEvent

                                                            key={idx}

                                                            time={timeLabel}

                                                            event={eventType}

                                                            risk={riskLabel}

                                                            desc={reason}

                                                        />

                                                    );

                                                })}

                                                {proctoringSignals.length === 0 && (

                                                    <TimelineEvent

                                                        time="--"

                                                        event="No signals recorded"

                                                        risk="CLEAN"

                                                        desc="No proctoring events were captured during this session."

                                                        isSuccess

                                                    />

                                                )}

                                                <TimelineEvent

                                                    time={recordingDurationSec ? `${Math.floor(recordingDurationSec / 60)}:${String(recordingDurationSec % 60).padStart(2, "0")}` : "--"}

                                                    event="Session ended"

                                                    risk="CLEAN"

                                                    desc="Interview session completed."

                                                    isSuccess

                                                />

                                            </div>

                                        </div>

                                        {/* Right: Dynamic Pattern Analysis */}

                                        <div className="p-6 rounded-[36px] bg-white border border-gray-100 shadow-sm space-y-4 optimize-scroll">

                                            <h4 className="text-[15px] font-bold text-gray-900 font-inter tracking-tight mb-6">Pattern Analysis -- What signals mean together</h4>

                                            <div className="space-y-5">

                                                {(() => {

                                                    const tabCount = groupedProctoringSignals.filter((g: any) => String(g.key).includes("tab")).reduce((n: number, g: any) => n + g.count, 0);

                                                    const gazeCount = groupedProctoringSignals.filter((g: any) => String(g.key).includes("gaze")).reduce((n: number, g: any) => n + g.count, 0);

                                                    const headCount = groupedProctoringSignals.filter((g: any) => String(g.key).includes("head")).reduce((n: number, g: any) => n + g.count, 0);

                                                    const fullscreenCount = groupedProctoringSignals.filter((g: any) => String(g.key).includes("fullscreen")).reduce((n: number, g: any) => n + g.count, 0);

                                                    const highCount = groupedProctoringSignals.filter((g: any) => g.severity === "high").reduce((n: number, g: any) => n + g.count, 0);

                                                    const signals: { type: "warning" | "success"; title: string; desc: string }[] = [];

                                                    if (tabCount > 2) {

                                                        signals.push({ type: "warning", title: `${tabCount} tab switches detected`, desc: `Repeated loss of browser focus (${tabCount} times) is a moderate concern. Review recording timestamps to check correlation with question timing.` });

                                                    } else if (tabCount > 0) {

                                                        signals.push({ type: "warning", title: `Tab switch detected (${tabCount}x)`, desc: "Single or low tab-switch count alone is not conclusive. Timing correlation with questions is the deciding factor." });

                                                    } else {

                                                        signals.push({ type: "success", title: "No tab switches", desc: "Browser focus held throughout the session. No window-switching behaviour detected." });

                                                    }

                                                    if (fullscreenCount > 0) {

                                                        signals.push({ type: "warning", title: "Fullscreen exit detected", desc: `Candidate exited fullscreen ${fullscreenCount} time${fullscreenCount > 1 ? "s" : ""}. This is a high-risk signal -- review recording for concurrent behaviour.` });

                                                    }

                                                    if (gazeCount > 5) {

                                                        signals.push({ type: "warning", title: `Repeated gaze violations (${gazeCount}x)`, desc: "Sustained off-screen gaze detected multiple times. Could indicate reference material. Consider in context of answer quality." });

                                                    } else if (gazeCount > 0) {

                                                        signals.push({ type: "warning", title: `Gaze drift detected (${gazeCount}x)`, desc: "Occasional off-screen gaze. Low count - insufficient alone to conclude reference use." });

                                                    } else {

                                                        signals.push({ type: "success", title: "Gaze consistent with genuine attempt", desc: "Eye movement pattern normal throughout session. No sustained off-screen reference behaviour detected." });

                                                    }

                                                    if (headCount > 3) {

                                                        signals.push({ type: "warning", title: `Head pose violations (${headCount}x)`, desc: "Repeated head turn events. May indicate reading from a second screen. Review with recording." });

                                                    } else if (headCount > 0) {

                                                        signals.push({ type: "success", title: `Minor head movement (${headCount}x)`, desc: "Low head-pose event count. Within normal range for a voice interview environment." });

                                                    }

                                                    if (highCount === 0 && tabCount === 0 && gazeCount === 0) {

                                                        signals.push({ type: "success", title: "No proxy candidate risk", desc: "No high-severity signals detected. Session telemetry is clean. Physical presence confirmed throughout." });

                                                    }

                                                    if (signals.length === 0) {

                                                        signals.push({ type: "success", title: "Session looks clean", desc: "No significant proctoring signals recorded. No action required from telemetry alone." });

                                                    }

                                                    return signals.map((s, i) => (

                                                        <AnalysisSignal key={i} type={s.type} title={s.title} desc={s.desc} />

                                                    ));

                                                })()}

                                            </div>

                                        </div>

                                    </div>

                                    <div className="pt-16 border-t border-gray-200 mt-16 space-y-10">

                                        <div className="flex flex-col items-center gap-2 text-center mb-6">

                                            <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-inter uppercase">Final Verdict</h2>

                                            <div className="h-1 w-16 bg-indigo-600 rounded-full" />

                                        </div>

                                        {/* -- Score Summary -- */}

                                        <div className="grid grid-cols-3 gap-8">

                                            <VerdictScoreCard label="Interview / 10" value={String(interviewReportScores.interview_score ?? interviewScore.toFixed(1))} color={interviewScore >= 7 ? "green" : interviewScore >= 4 ? "orange" : "red"} />

                                            <VerdictScoreCard label="Integrity / 10" value={(integrityScore / 10).toFixed(1)} color={integrityScore >= 85 ? "green" : integrityScore >= 70 ? "orange" : "red"} />

                                            <VerdictScoreCard label="Combined / 10" value={String(interviewReportScores.combined_score ? (interviewReportScores.combined_score / 10).toFixed(1) : combinedScore.toFixed(1))} color={combinedScore >= 7 ? "green" : combinedScore >= 4 ? "orange" : "red"} />

                                        </div>

                                        {/* -- Verdict Narrative Card -- */}

                                        <div className="flex justify-center">

                                            <div className="w-full max-w-[1200px] p-8 rounded-3xl bg-white border border-gray-100 shadow-sm relative overflow-hidden group">

                                                <div className={cn(

                                                    "absolute top-0 left-0 w-1.5 h-full opacity-60 group-hover:opacity-100 transition-opacity",

                                                    String(interviewStrategicVerdict.decision || "").toLowerCase().includes("do not") ? "bg-rose-500" :

                                                    String(interviewStrategicVerdict.decision || "").toLowerCase() === "hire" ? "bg-emerald-500" : "bg-amber-500"

                                                )} />

                                                <div className="flex flex-col gap-6">

                                                    <div className="flex items-center justify-between">

                                                        <h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-[0.4em]">Strategic Rationale</h4>

                                                        <div className="flex items-center gap-3">

                                                            <span className={cn(

                                                                "h-2 w-2 rounded-full animate-pulse",

                                                                String(interviewStrategicVerdict.decision || "").toLowerCase().includes("do not") ? "bg-rose-500" :

                                                                String(interviewStrategicVerdict.decision || "").toLowerCase() === "hire" ? "bg-emerald-500" : "bg-amber-500"

                                                            )} />

                                                            <span className={cn(

                                                                "px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm border",

                                                                String(interviewStrategicVerdict.decision || "").toLowerCase().includes("do not") ? "bg-rose-50 border-rose-100 text-rose-600" :

                                                                String(interviewStrategicVerdict.decision || "").toLowerCase() === "hire" ? "bg-emerald-50 border-emerald-100 text-emerald-700" :

                                                                "bg-amber-50 border-amber-100 text-amber-700"

                                                            )}>

                                                                Final Recommendation: {interviewStrategicVerdict.decision || interviewReportVerdict.recommendation || "Pending"}

                                                            </span>

                                                        </div>

                                                    </div>

                                                    <div className="space-y-4">

                                                        <p className="text-[15px] font-medium text-slate-700 leading-[1.7] tracking-tight text-left font-inter">

                                                            {interviewStrategicVerdict.summary || interviewReportVerdict.summary || interviewAiSummary || "Strategic analysis will appear here once the interview report is generated."}

                                                        </p>

                                                        {Array.isArray(interviewStrategicVerdict.rationale) && interviewStrategicVerdict.rationale.length > 0 && (

                                                            <ul className="space-y-2 pt-2">

                                                                {interviewStrategicVerdict.rationale.map((item: string, idx: number) => (

                                                                    <li key={idx} className="flex items-start gap-3">

                                                                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />

                                                                        <p className="text-[14px] font-medium text-slate-600 leading-[1.7]">{item}</p>

                                                                    </li>

                                                                ))}

                                                            </ul>

                                                        )}

                                                        <div className="pt-4 border-t border-slate-50">

                                                            <p className={cn(

                                                                "text-[14px] font-bold uppercase tracking-widest",

                                                                String(interviewStrategicVerdict.decision || "").toLowerCase().includes("do not") ? "text-rose-600" :

                                                                String(interviewStrategicVerdict.decision || "").toLowerCase() === "hire" ? "text-emerald-600" : "text-amber-600"

                                                            )}>

                                                                {interviewReportVerdict.recommendation_reason || (interviewStrategicVerdict.decision ? `Verdict: ${interviewStrategicVerdict.decision}` : "Awaiting report generation")}

                                                            </p>

                                                        </div>

                                                    </div>

                                                </div>

                                            </div>

                                        </div>

                                        {/* -- Recommended Next Actions -- */}

                                        <div className="flex justify-center">

                                            <div className="w-full max-w-[1200px] p-8 rounded-3xl bg-[#EEF2FF] border border-[#E0E7FF] space-y-6">

                                                <p className="text-center text-[10px] font-bold text-slate-500 font-black uppercase tracking-[0.4em] mb-3">Recommended Next Action</p>

                                                <div className="space-y-4 flex flex-col items-center">

                                                    <div className="space-y-3 w-full max-w-[900px]">

                                                        {Array.isArray(interviewStrategicVerdict.next_actions) && interviewStrategicVerdict.next_actions.length > 0

                                                            ? interviewStrategicVerdict.next_actions.map((item: string, idx: number) => (

                                                                <RecommendedActionItem key={idx} text={item} />

                                                            ))

                                                            : (

                                                                <p className="text-[14px] font-medium text-indigo-700 leading-[1.7] text-center">

                                                                    {interviewReportVerdict.recommendation_reason || "Next action recommendations will appear once the interview report is generated."}

                                                                </p>

                                                            )

                                                        }

                                                    </div>

                                                </div>

                                            </div>

                                        </div>

                                    </div>

                                </div>

                            </div>

                        </div>

                    )}

                {showSubmissionPreview && (

                    <div className="fixed inset-0 z-[200] flex justify-end">

                        <AnimatePresence>

                            <motion.div 

                                initial={{ opacity: 0 }}

                                animate={{ opacity: 1 }}

                                exit={{ opacity: 0 }}

                                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity" 

                                onClick={() => setShowSubmissionPreview(false)} 

                            />

                        </AnimatePresence>

                        

                        <motion.div 

                            initial={{ x: '100%' }}

                            animate={{ x: 0 }}

                            exit={{ x: '100%' }}

                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}

                            className="relative w-full max-w-2xl bg-white h-full shadow-[0_0_50px_rgba(0,0,0,0.15)] flex flex-col border-l border-slate-100"

                        >

                            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">

                                <div className="space-y-1">

                                    <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-inter">Application Submission</h2>

                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Candidate Input & Metadata</p>

                                </div>

                                <Button 

                                    variant="ghost" 

                                    size="icon" 

                                    onClick={() => setShowSubmissionPreview(false)}

                                    className="h-12 w-12 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"

                                >

                                    <X className="h-6 w-6 text-slate-400" />

                                </Button>

                            </div>

                            <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-slate-50/30">

                                <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm space-y-6 relative overflow-hidden group">

                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500/40 group-hover:bg-blue-500 transition-colors" />

                                    <div className="flex items-center gap-3">

                                        <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center">

                                            <MessageSquare className="h-4 w-4 text-blue-500" />

                                        </div>

                                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">Cover Message / Note</h3>

                                    </div>

                                    <p className="text-[15px] font-medium text-slate-700 leading-relaxed whitespace-pre-wrap font-inter">

                                        {candidate.submissionData?.coverLetter || "No additional message was provided by the candidate during submission."}

                                    </p>

                                </div>

                                {(() => {

                                    const subData = candidate.submissionData?.metadata || candidate.submissionData || {};

                                    const entries = Object.entries(subData).filter(([k]) => !['coverLetter', 'metadata', 'resumeText', 'resumeUrl', 'passportUrl'].includes(k));

                                    

                                    if (entries.length === 0) return null;

                                    

                                    return (

                                        <div className="grid grid-cols-2 gap-4">

                                            {entries.map(([key, value]) => {

                                                // Format currency values (e.g., "600000||INR")

                                                let displayValue = String(value);

                                                if (typeof value === 'string' && value.includes('||')) {

                                                    const [amount, currency] = value.split('||');

                                                    displayValue = `${currency} ${Number(amount).toLocaleString()}`;

                                                }

                                                return (

                                                    <div key={key} className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">

                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</p>

                                                        <p className="text-sm font-bold text-slate-900">{displayValue}</p>

                                                    </div>

                                                );

                                            })}

                                        </div>

                                    );

                                })()}

                            </div>

                            <div className="p-10 border-t border-slate-100 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.02)]">

                                <Button 

                                    onClick={() => setShowSubmissionPreview(false)} 

                                    className="w-full h-14 rounded-2xl bg-slate-950 text-white font-bold text-[12px] uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-900/10"

                                >

                                    Return to Report

                                </Button>

                            </div>

                        </motion.div>

                    </div>

                )}

                {showIntegrityDetails && (

                    <div className="fixed inset-0 z-[100] flex justify-end">

                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowIntegrityDetails(false)} />

                        <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col  slide-in-from-right ">

                            <div className="px-10 py-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">

                                <div className="space-y-1">

                                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Integrity Deep-Dive</h2>

                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Full Proctoring Logs & Event Analysis</p>

                                </div>

                                <Button variant="ghost" size="icon" onClick={() => setShowIntegrityDetails(false)} className="rounded-2xl hover:bg-gray-100 h-12 w-12">

                                    <X className="h-6 w-6 text-gray-400" />

                                </Button>

                            </div>

                            <div className="flex-1 overflow-y-auto p-10 space-y-12 bg-white">

                                {(() => {

                                    const sessionStart = parsedProctoringEvents[0]?.timestamp ?? null;

                                    const formatTime = (ts: number) => {

                                        if (!sessionStart) return new Date(ts).toLocaleTimeString();

                                        const sec = Math.max(0, Math.round((ts - sessionStart) / 1000));

                                        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} into session`;

                                    };

                                    const tabEvents = parsedProctoringEvents.filter((e: any) => e.eventType === "tab_switch");

                                    const gazeEvents = parsedProctoringEvents.filter((e: any) => e.eventType === "gaze_violation");

                                    const headEvents = parsedProctoringEvents.filter((e: any) => e.eventType === "head_pose_violation");

                                    const audioEvents = parsedProctoringEvents.filter((e: any) => e.eventType === "audio_flag");

                                    const fullscreenEvents = parsedProctoringEvents.filter((e: any) => e.eventType === "fullscreen_exit");

                                    const faceEvents = parsedProctoringEvents.filter((e: any) => e.eventType === "face_absence" || e.eventType === "multiple_faces");

                                    const otherEvents = parsedProctoringEvents.filter((e: any) =>

                                        !["tab_switch","gaze_violation","head_pose_violation","audio_flag","fullscreen_exit","face_absence","multiple_faces"].includes(e.eventType)

                                    );

                                    const totalEvents = parsedProctoringEvents.length;

                                    const gazeCount = gazeEvents.length;

                                    const headCount = headEvents.length;

                                    const faceAbsenceCount = parsedProctoringEvents.filter((e: any) => e.eventType === "face_absence").length;

                                    const multipleFaceCount = parsedProctoringEvents.filter((e: any) => e.eventType === "multiple_faces").length;

                                    const gazePercent = totalEvents > 0 ? ((gazeCount / totalEvents) * 100).toFixed(1) : "0.0";

                                    const headStability = headCount === 0 ? "High" : headCount <= 3 ? "Medium" : "Low";

                                    return (

                                        <>

                                            {/* Tab Detection */}

                                            {tabEvents.length > 0 && (

                                                <section className="space-y-6">

                                                    <div className="flex items-center gap-3">

                                                        <div className="h-8 w-8 rounded-xl bg-rose-50 flex items-center justify-center">

                                                            <MonitorSmartphone className="h-4 w-4 text-rose-500" />

                                                        </div>

                                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Tab Detection Logs ({tabEvents.length})</h3>

                                                    </div>

                                                    <div className="space-y-4">

                                                        {tabEvents.map((e: any, i: number) => (

                                                            <DeepDiveLog

                                                                key={i}

                                                                label={e.reason || "Browser Focus Lost"}

                                                                description={`Event type: ${e.eventType} | Severity: ${e.severity || "medium"}`}

                                                                time={e.timestamp ? formatTime(e.timestamp) : "--"}

                                                                type={e.severity === "high" ? "error" : "warning"}

                                                            />

                                                        ))}

                                                    </div>

                                                </section>

                                            )}

                                            {/* Fullscreen Exits */}

                                            {fullscreenEvents.length > 0 && (

                                                <section className="space-y-6">

                                                    <div className="flex items-center gap-3">

                                                        <div className="h-8 w-8 rounded-xl bg-rose-50 flex items-center justify-center">

                                                            <MonitorSmartphone className="h-4 w-4 text-rose-600" />

                                                        </div>

                                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Fullscreen Exits ({fullscreenEvents.length})</h3>

                                                    </div>

                                                    <div className="space-y-4">

                                                        {fullscreenEvents.map((e: any, i: number) => (

                                                            <DeepDiveLog

                                                                key={i}

                                                                label={e.reason || "Fullscreen Exited"}

                                                                description={`Severity: ${e.severity || "high"} -- candidate manually exited fullscreen mode`}

                                                                time={e.timestamp ? formatTime(e.timestamp) : "--"}

                                                                type="error"

                                                            />

                                                        ))}

                                                    </div>

                                                </section>

                                            )}

                                            {/* Facial & Gaze */}

                                            <section className="space-y-6">

                                                <div className="flex items-center gap-3">

                                                    <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center">

                                                        <UserCheck className="h-4 w-4 text-emerald-500" />

                                                    </div>

                                                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Facial & Gaze Analysis</h3>

                                                </div>

                                                <div className="grid grid-cols-2 gap-4">

                                                    <div className={cn("p-6 rounded-3xl border space-y-1", faceAbsenceCount === 0 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100")}>

                                                        <p className={cn("text-[10px] font-bold uppercase tracking-widest", faceAbsenceCount === 0 ? "text-emerald-600" : "text-rose-600")}>Face Absence Events</p>

                                                        <p className="text-xl font-bold text-gray-900">{faceAbsenceCount}</p>

                                                    </div>

                                                    <div className={cn("p-6 rounded-3xl border space-y-1", multipleFaceCount === 0 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100")}>

                                                        <p className={cn("text-[10px] font-bold uppercase tracking-widest", multipleFaceCount === 0 ? "text-emerald-600" : "text-rose-600")}>Multiple Faces Detected</p>

                                                        <p className="text-xl font-bold text-gray-900">{multipleFaceCount}</p>

                                                    </div>

                                                    <div className={cn("p-6 rounded-3xl border space-y-1", gazeCount <= 2 ? "bg-emerald-50 border-emerald-100" : "bg-orange-50 border-orange-100")}>

                                                        <p className={cn("text-[10px] font-bold uppercase tracking-widest", gazeCount <= 2 ? "text-emerald-600" : "text-orange-600")}>Gaze Violations</p>

                                                        <p className="text-xl font-bold text-gray-900">{gazeCount} ({gazePercent}% of events)</p>

                                                    </div>

                                                    <div className={cn("p-6 rounded-3xl border space-y-1", headStability === "High" ? "bg-emerald-50 border-emerald-100" : headStability === "Medium" ? "bg-orange-50 border-orange-100" : "bg-rose-50 border-rose-100")}>

                                                        <p className={cn("text-[10px] font-bold uppercase tracking-widest", headStability === "High" ? "text-emerald-600" : headStability === "Medium" ? "text-orange-600" : "text-rose-600")}>Head Pose Stability</p>

                                                        <p className="text-xl font-bold text-gray-900">{headStability} ({headCount} events)</p>

                                                    </div>

                                                </div>

                                                {gazeEvents.length > 0 && (

                                                    <div className="space-y-3 mt-4">

                                                        {gazeEvents.map((e: any, i: number) => (

                                                            <DeepDiveLog

                                                                key={i}

                                                                label={e.reason || "Gaze Off-Screen"}

                                                                description={`Severity: ${e.severity || "medium"}`}

                                                                time={e.timestamp ? formatTime(e.timestamp) : "--"}

                                                                type={e.severity === "high" ? "error" : "warning"}

                                                            />

                                                        ))}

                                                    </div>

                                                )}

                                                {headEvents.length > 0 && (

                                                    <div className="space-y-3 mt-2">

                                                        {headEvents.map((e: any, i: number) => (

                                                            <DeepDiveLog

                                                                key={i}

                                                                label={e.reason || "Head Pose Deviation"}

                                                                description={`Severity: ${e.severity || "medium"}`}

                                                                time={e.timestamp ? formatTime(e.timestamp) : "--"}

                                                                type="warning"

                                                            />

                                                        ))}

                                                    </div>

                                                )}

                                            </section>

                                            {/* Audio Anomalies */}

                                            {audioEvents.length > 0 && (

                                                <section className="space-y-6">

                                                    <div className="flex items-center gap-3">

                                                        <div className="h-8 w-8 rounded-xl bg-orange-50 flex items-center justify-center">

                                                            <Volume2 className="h-4 w-4 text-orange-500" />

                                                        </div>

                                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Audio Anomalies ({audioEvents.length})</h3>

                                                    </div>

                                                    <div className="space-y-4">

                                                        {audioEvents.map((e: any, i: number) => (

                                                            <DeepDiveLog

                                                                key={i}

                                                                label={e.reason || "Audio Anomaly"}

                                                                description={`Severity: ${e.severity || "medium"}`}

                                                                time={e.timestamp ? formatTime(e.timestamp) : "--"}

                                                                type={e.severity === "high" ? "error" : "warning"}

                                                            />

                                                        ))}

                                                    </div>

                                                </section>

                                            )}

                                            {/* Other / Unknown event types */}

                                            {otherEvents.length > 0 && (

                                                <section className="space-y-6">

                                                    <div className="flex items-center gap-3">

                                                        <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center">

                                                            <AlertCircle className="h-4 w-4 text-slate-500" />

                                                        </div>

                                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Other Signals ({otherEvents.length})</h3>

                                                    </div>

                                                    <div className="space-y-4">

                                                        {otherEvents.map((e: any, i: number) => (

                                                            <DeepDiveLog

                                                                key={i}

                                                                label={e.reason || e.eventType || "Signal"}

                                                                description={`Event: ${e.eventType} | Severity: ${e.severity || "low"}`}

                                                                time={e.timestamp ? formatTime(e.timestamp) : "--"}

                                                                type={e.severity === "high" ? "error" : e.severity === "medium" ? "warning" : "success"}

                                                            />

                                                        ))}

                                                    </div>

                                                </section>

                                            )}

                                            {parsedProctoringEvents.length === 0 && (

                                                <div className="flex flex-col items-center justify-center py-20 space-y-4">

                                                    <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center">

                                                        <UserCheck className="h-7 w-7 text-emerald-500" />

                                                    </div>

                                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No proctoring events recorded</p>

                                                </div>

                                            )}

                                        </>

                                    );

                                })()}

                            </div>

                            <div className="p-10 border-t border-gray-100 bg-gray-50/50">

                                <Button onClick={() => setShowIntegrityDetails(false)} className="w-full h-14 rounded-2xl bg-gray-900 text-white font-bold text-[12px] uppercase tracking-widest hover:bg-black transition-all shadow-xl">

                                    CLOSE ANALYSIS SYSTEM

                                </Button>

                            </div>

                        </div>

                    </div>

                )}

            </div>

            

            <AuditLogModal

                isOpen={isAuditModalOpen}

                onClose={() => setIsAuditModalOpen(false)}

                candidateName={candidate.fullName}

                events={(() => {

                    const rawEvents = candidate.interview?.proctoringEvents;

                    if (!rawEvents) return [];

                    if (Array.isArray(rawEvents)) return rawEvents;

                    try {

                        return JSON.parse(rawEvents as string);

                    } catch {

                        return [];

                    }

                })()}

                recordingUrl={interviewRecordingUrl}

                snapshots={(() => {

                    const sn = candidate.interview?.snapshots || [];

                    if (Array.isArray(sn)) return sn;

                    try {

                        return JSON.parse(sn as string);

                    } catch {

                        return [];

                    }

                })()}

                interviewStartedAt={candidate.interview?.startedAt}

            />

        </div>

    );

}

