"use client";

import { use, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    XCircle, Sparkles,
    MessageSquare, RefreshCw, Camera, FileText,
    X,
} from "lucide-react";
import { toast } from "@/components/ui/toast-custom";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { InterviewReportHyring, buildHyringInterviewViewModel, HYRING_REPORT_PAGE_BG } from "@/components/admin/candidate-profile/interview-report-hyring";
import { ResumeReportHyring, buildHyringResumeViewModel } from "@/components/admin/candidate-profile/resume-report-hyring";

export default function CandidateProfilePage({ params }: { params: Promise<{ id: string }> }) {

    const resolvedParams = use(params);

    const id = resolvedParams.id;

    const [candidate, setCandidate] = useState<any>(null);

    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<"analysis" | "interview">("analysis");

    const [rescanning, setRescanning] = useState(false);

    const [mounted, setMounted] = useState(false);

    const [recordingDurationSec, setRecordingDurationSec] = useState<number | null>(null);

    const [showSubmissionPreview, setShowSubmissionPreview] = useState(false);

    useEffect(() => {

        setMounted(true);

    }, []);

    useEffect(() => {

        if (typeof window !== 'undefined') {

            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

        }

    }, [activeTab]);

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

            } catch (_e) {

                // Ignore

            }

        };

        return () => {
            eventSource.onmessage = null;
            eventSource.onerror = null;
            eventSource.close();
        };

    }, [id, fetchCandidate]);

    const handleRescan = async () => {

        setRescanning(true);

        try {

            const res = await fetch(`/api/admin/candidates/${id}/rescan`, { method: "POST" });

            if (res.ok) {

                await fetchCandidate();

                toast.success("AI Re-scan triggered. Please wait about 30 seconds and refresh the page.");

            } else {

                const err = await res.json();

                toast.error(err.error || "Failed to trigger re-scan");

            }

        } catch (error) {

            console.error("Rescan error:", error);

            toast.error("Failed to trigger AI re-scan.");

        } finally {

            setRescanning(false);

        }

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

    const workHistory = Array.isArray(structuredResume.work_history) ? structuredResume.work_history : [];

    const breakdown = aiData.breakdown || null;

    const concernSource = (aiData.concerns || weaknesses || [])[0];

    const primaryGapText = concernSource

        ? (typeof concernSource === "string" ? concernSource : (concernSource as { point?: string })?.point || String(concernSource))

        : "No top gap listed yet.";

    const mustHaveBarPct =

        breakdown?.skills_max && Number(breakdown.skills_max) > 0

            ? Math.min(100, Math.round((Number(breakdown.skills_score) / Number(breakdown.skills_max)) * 100))

            : 0;

    const toBulletText = (x: unknown) =>

        typeof x === "string"

            ? x.trim()

            : String((x as { point?: string; text?: string })?.point || (x as { text?: string })?.text || x || "").trim();

    const strengthLines = (Array.isArray(strengths) ? strengths : []).map(toBulletText).filter(Boolean);

    const weaknessLines = (Array.isArray(weaknesses) ? weaknesses : []).map(toBulletText).filter(Boolean);

    const educationList = Array.isArray(structuredResume.education) ? structuredResume.education : [];

    const combinedWorkHistory =

        Array.isArray(aiData.work_history) && aiData.work_history.length > 0 ? aiData.work_history : workHistory;

    const totalExtractedSkills =

        techSkills.length + toolSkills.length + domainSkills.length + (Array.isArray(softSkills) ? softSkills.length : 0);

    const redFlagToLine = (r: unknown): string => {

        if (r == null) return "";

        if (typeof r === "string") return r.trim();

        if (typeof r === "number" || typeof r === "boolean") return String(r);

        if (typeof r !== "object") return "";

        const o = r as Record<string, unknown>;

        const keys = [

            "flag", "text", "title", "description", "reason", "message", "label", "name",

            "point", "content", "detail", "summary", "evidence", "note",

        ] as const;

        for (const k of keys) {

            const v = o[k];

            if (typeof v === "string" && v.trim()) return v.trim();

        }

        for (const v of Object.values(o)) {

            if (typeof v === "string" && v.trim().length > 0) return v.trim();

        }

        try {

            return JSON.stringify(r);

        } catch {

            return "";

        }

    };

    const redFlagLines: string[] = (Array.isArray(redFlags) ? redFlags : [])

        .map(redFlagToLine)

        .filter(Boolean);

    const interviewStageShort =

        interviewRecordingUrl || interviewTranscript

            ? "On file"

            : candidate?.interview || candidate?.assessment

                ? "In pipeline"

                : "—";

    const interviewReportScores = interviewReportData?.scores || {};

    const interviewReportRecording = interviewReportData?.recording || {};

    const interviewReportVerdict = interviewReportData?.verdict || {};

    const interviewReportCommunication = interviewReportData?.communication || {};

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

    const interviewReportSummary = interviewReportRecording.summary || interviewReportVerdict.summary || interviewAiSummary;

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

            <div className={cn("flex-1 min-w-0", activeTab === "analysis" && HYRING_REPORT_PAGE_BG)}>

                {/* -- Fixed Navigation Header --------------------------- */}

                <header

                    className="fixed top-0 right-0 z-[100] left-0 md:left-[240px] bg-white/80 backdrop-blur-xl border-b border-gray-100/80 px-6 py-3 transition-all  shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)]"

                >

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

                {activeTab === "analysis" && (

                    <div className="w-full pt-24">

                    <ResumeReportHyring
                        model={buildHyringResumeViewModel({
                            candidate,
                            mounted,
                            displayAvatar,
                            hasAiReport: Boolean(candidate?.aiReport),
                            hasResumeText: Boolean(candidate?.resumeText),
                            matchScore: Number(score) || 0,
                            summary: String(summary || ""),
                            strengthLines,
                            weaknessLines,
                            redFlagLines,
                            primaryGapText,
                            normalizedStatus,
                            interviewStageLabel: interviewStageShort,
                            breakdown,
                            combinedWorkHistory,
                            educationList,
                            totalExtractedSkills,
                            mustHaveBarPct,
                            techSkillSample: techSkills.slice(0, 14),
                        })}
                    />

                    </div>

                )}


                {activeTab === "interview" && candidate && (

                    <div className="w-full pt-24">

                    <InterviewReportHyring

                        model={buildHyringInterviewViewModel({

                            candidate,

                            mounted,

                            displayAvatar,

                            interviewReportScores,

                            interviewReportRecording,

                            interviewReportCommunication,

                            interviewReportSkills,

                            interviewSessionRows,

                            interviewQaRows,

                            interviewReportSummary,

                            interviewAiSummary,

                            interviewTranscript,

                            proctoringVerdictSummary,

                            groupedProctoringSignals,

                            wordCount,

                            interviewScore,

                            combinedScore,

                            interviewRecordingUrl,

                            recordingDurationSec,

                            formatDuration,

                            communicationStatus,

                        })}

                    />

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


                                </div>


        </div>

    );

}

