"use client";

import { useMemo } from "react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { FileText, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { InterviewReportHyring, buildHyringInterviewViewModel } from "@/components/admin/candidate-profile/interview-report-hyring";
import { ResumeReportHyring, buildHyringResumeViewModel } from "@/components/admin/candidate-profile/resume-report-hyring";

function toTextList(value: unknown): string[] {
    const toLine = (item: unknown): string => {
        if (item == null) return "";
        if (typeof item === "string") return item.trim();
        if (typeof item === "number" || typeof item === "boolean") return String(item);
        if (typeof item !== "object") return "";
        const obj = item as Record<string, unknown>;
        const keys = ["point", "text", "summary", "reasoning", "evidence", "note", "label", "description", "message", "title", "name"];
        for (const key of keys) {
            const candidate = obj[key];
            if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        }
        for (const candidate of Object.values(obj)) {
            if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        }
        try {
            return JSON.stringify(item);
        } catch {
            return "";
        }
    };

    if (Array.isArray(value)) return value.map(toLine).filter(Boolean);
    if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(toLine).filter(Boolean);
    if (typeof value === "string") return value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return [];
}

function firstText(value: unknown, fallback = ""): string {
    const list = toTextList(value);
    return list[0] || fallback;
}

export default function CandidateProfilePage() {
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
    const reportMode = (searchParams.get("report") || "interview").toLowerCase();
    const backHref = searchParams.get("back") || "/admin/candidates";
    const [candidate, setCandidate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [resumeReportOpen, setResumeReportOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const fetchCandidate = useCallback(async () => {
        try {
            const res = await fetch(`/api/candidates/${id}`);
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                const message =
                    payload?.error ||
                    payload?.message ||
                    `Failed to load candidate (${res.status})`;
                setError(message);
                setCandidate(null);
                return;
            }
            const data = await res.json();
            setCandidate(data);
            setError(null);
        } catch (error) {
            console.error("Failed to fetch candidate", error);
            setError("Failed to load candidate");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (!id) {
            setError("Missing candidate ID");
            setLoading(false);
            return;
        }

        fetchCandidate();
    }, [id, fetchCandidate]);

    useEffect(() => {
        if (!id) return;

        const eventSource = new EventSource("/api/stream");
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "UPDATED_APPLICATIONS") {
                    fetchCandidate();
                }
            } catch {
                // Ignore transient stream parse issues.
            }
        };

        return () => {
            eventSource.onmessage = null;
            eventSource.onerror = null;
            eventSource.close();
        };
    }, [id, fetchCandidate]);

    const interviewReportData: any = (() => {
        try {
            const raw = candidate?.interview?.interviewReport;
            if (!raw) return {};
            return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
            return {};
        }
    })();

    const interviewRecordingUrl = candidate?.interview?.interviewRecordingUrl || "";
    const interviewTranscript = candidate?.interview?.interviewTranscript || "";
    const interviewAiSummary = candidate?.interview?.aiSummary || "";
    const interviewTurns = (() => {
        const raw = candidate?.interview?.interviewTurns || [];
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

    const interviewReportScores = interviewReportData?.scores || {};
    const interviewReportRecording = interviewReportData?.recording || {};
    const interviewReportCommunication = interviewReportData?.communication || {};
    const interviewReportCognitiveInsights = interviewReportData?.cognitive_insights || {};
    const interviewReportBehavioralAnalysis = interviewReportData?.behavioral_analysis || {};
    const interviewBillingSnapshot = (() => {
        const raw = candidate?.interview?.billingSnapshot;
        if (!raw) return {};
        if (typeof raw === "string") {
            try {
                return JSON.parse(raw);
            } catch {
                return {};
            }
        }
        return raw;
    })();
    // Build skill objects from skill_ratings (score per skill) + skills_proof (skill name list)
    const skillRatings: Record<string, number> = interviewReportData?.skill_ratings || {};
    const skillsProof: string[] = Array.isArray(interviewReportData?.skills_proof) ? interviewReportData.skills_proof : [];
    const interviewReportSkills = skillsProof.map((skillName: string) => ({
        name: String(skillName).trim(),
        skill: String(skillName).trim(),
        score: skillRatings[skillName] != null ? String(skillRatings[skillName]) : "—",
        status: skillRatings[skillName] != null
            ? skillRatings[skillName] >= 7 ? "STRONG"
            : skillRatings[skillName] >= 4 ? "MODERATE"
            : "WEAK"
            : "NOT TESTED",
    }));
    const interviewReportSummary = interviewReportRecording.summary || interviewReportData?.verdict?.summary || interviewAiSummary || "";
    const interviewStatusNormalized = String(candidate?.interview?.status || candidate?.interviewStatus || "").trim().toUpperCase();
    const interviewIsFinished =
        interviewStatusNormalized === "COMPLETED" ||
        interviewStatusNormalized === "FINISHED" ||
        Boolean(candidate?.interview?.completedAt);
    const interviewReportLocked = !interviewIsFinished;
    const groupedProctoringSignals = Array.isArray(candidate?.interview?.proctoringEvents)
        ? candidate.interview.proctoringEvents.reduce((acc: any[], ev: any) => {
            const key = String(ev?.eventType || ev?.type || "signal");
            const severity = String(ev?.severity || "low").toLowerCase();
            const existing = acc.find((row) => row.key === key);
            if (existing) {
                existing.count += 1;
                if (severity === "high") existing.severity = "high";
                else if (severity === "medium" && existing.severity !== "high") existing.severity = "medium";
                return acc;
            }
            acc.push({ key, label: key.replace(/_/g, " "), count: 1, severity });
            return acc;
        }, [])
        : [];

    const interviewSessionRows = Array.isArray(interviewTurns)
        ? interviewTurns.map((turn: any, i: number) => ({
            q: Number(turn?.turn || i + 1),
            question: String(turn?.question || turn?.title || "").trim(),
            answer: String(turn?.answer || turn?.reasoning || "").trim(),
            score: String(turn?.score || "--"),
            reasoning: String(turn?.reasoning || turn?.analysis_reasoning || "").trim(),
        }))
        : [];

    // Use AI-generated qa_blocks for question analysis
    const aiQaBlocks = Array.isArray(interviewReportData?.qa_blocks) ? interviewReportData.qa_blocks : [];
    const interviewQaRows = aiQaBlocks.length > 0
        ? aiQaBlocks.map((block: any, i: number) => ({
            q: Number(block?.q || i + 1),
            question: String(block?.question || block?.title || "Question " + (i + 1)).trim(),
            answer: String(block?.answer || "").trim(),
            score: String(block?.score || "--"),
            reasoning: String(block?.reasoning || block?.verdict || "").trim(),
          }))
        : interviewSessionRows;
    const wordCount = interviewTranscript ? interviewTranscript.split(/\s+/).filter(Boolean).length : 0;
    const interviewScore = Number(candidate?.interview?.candidateRating || 0) || 0;
    const combinedScore = Math.max(0, Math.min(10, interviewScore));
    const proctoringVerdictSummary = String(interviewReportData?.integrity?.summary || "").trim() || "No proctoring summary available.";
    const recordingDurationSec = typeof candidate?.interview?.interviewDuration === "number" ? candidate.interview.interviewDuration : null;
    const communicationStatus = (() => {
        const cefrLabel = interviewReportData?.scores?.cefr_label;
        if (cefrLabel) return String(cefrLabel);
        const commData = interviewReportData?.communication || {};
        const commValues = [commData.pronunciation, commData.clarity, commData.grammar, commData.fluency, commData.vocabulary, commData.depth].map(Number).filter((n) => Number.isFinite(n) && n > 0);
        if (commValues.length > 0) {
            const avg = commValues.reduce((a, b) => a + b, 0) / commValues.length;
            if (avg >= 70) return "Strong";
            if (avg >= 45) return "Average";
            return "Limited";
        }
        if (!interviewTranscript) return "Pending";
        return wordCount >= 800 ? "Strong" : wordCount >= 250 ? "Average" : "Limited";
    })();
    const candidatePhotoSrc = (() => {
        const snapshot = Array.isArray(candidate?.interview?.snapshots)
            ? candidate.interview.snapshots.find((src: unknown) => typeof src === "string" && src.trim())
            : "";
        return typeof snapshot === "string" && snapshot.trim()
            ? snapshot
            : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(candidate?.fullName || "Candidate")}`;
    })();
    const resumeReportData: any = (() => {
        try {
            const raw = candidate?.aiReport;
            if (!raw) return {};
            return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
            return {};
        }
    })();
    const resumeReportModel = useMemo(() => {
        const report = resumeReportData || {};
        const fullName = candidate?.fullName || "Candidate";
        // strengths: [{point, evidence}] — combine both so evidence shows in the card
        const strengths = (() => {
            const raw = report.strengths || report.core_claims || report.decision_breakdown || [];
            if (Array.isArray(raw) && raw.length && typeof raw[0] === "object" && raw[0]?.point) {
                return raw.map((s: any) => s.evidence ? `${s.point} — ${s.evidence}` : s.point).filter(Boolean);
            }
            return toTextList(raw);
        })();
        // concerns: [{point, impact}] — combine both so impact reason shows
        const concerns = (() => {
            const raw = report.concerns || report.gaps || report.rejection_reasons || report.uncertain_areas || [];
            if (Array.isArray(raw) && raw.length && typeof raw[0] === "object" && raw[0]?.point) {
                return raw.map((s: any) => s.impact ? `${s.point} — ${s.impact}` : s.point).filter(Boolean);
            }
            return toTextList(raw);
        })();
        const integrityLines = toTextList(report.integrity_signals || report.red_flags || []);
        const workHistory = Array.isArray(report.work_history_annotated)
            ? report.work_history_annotated
            : Array.isArray(report.work_history)
                ? report.work_history
                : [];
        const educationList = Array.isArray(report.education) ? report.education : [];
        const skillDepth = toTextList(report.skill_depth);
        const coreClaims = toTextList(report.core_claims);
        const breakdown = report.breakdown || null;
        const score = Number(candidate?.aiScore ?? report.score ?? 0) || 0;
        const mustHaveBarPct =
            breakdown?.skills_max && Number(breakdown.skills_max) > 0
                ? Math.min(100, Math.round((Number(breakdown.skills_score) / Number(breakdown.skills_max)) * 100))
                : Math.min(100, Math.max(0, Math.round(score)));
        // Experience years: prefer scored result, fall back to AI assessment
        const experienceYears: number | null = (() => {
            const v = report.candidate_years ?? report.experience_assessment?.years ?? null;
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? n : null;
        })();
        // Matched skills count: prefer scoring engine's matched list length
        const matchedSkillsCount = (() => {
            const sm = report.skill_matching;
            if (sm) {
                return (sm.matched_must?.length || 0) + (sm.matched_good?.length || 0);
            }
            return skillDepth.length + coreClaims.length + workHistory.length;
        })();
        const summary =
            firstText(report.recruiter_snapshot) ||
            firstText(report.decision_reason) ||
            firstText(report.ai_verdict) ||
            firstText(report.summary) ||
            firstText(report.reasoning) ||
            "AI screening analysis ready.";
        const primaryGapText =
            firstText(concerns) ||
            firstText(report.decision_reason) ||
            firstText(report.recruiter_snapshot) ||
            "No top gap listed yet.";

        // AI-direct fields from gpt-4o report
        const aiRadar = report.fit_radar || null;
        const aiSkillRows = Array.isArray(report.skill_match_rows) ? report.skill_match_rows : null;
        const readinessTimeline = report.suitability_analysis?.readiness_timeline || null;
        const candidatePotential = report.candidate_potential?.for_this_role || null;
        const decisionReason = typeof report.decision_reason === "string" ? report.decision_reason : null;
        const humanLayer = report.human_layer || null;

        return buildHyringResumeViewModel({
            candidate: {
                fullName,
                createdAt: candidate?.createdAt,
                location: candidate?.location || candidate?.city || "—",
                resumeUrl: candidate?.resumeUrl || null,
                drive: { title: candidate?.drive?.title || candidate?.driveTitle || "Role N/A" },
                experienceYears,
            },
            mounted,
            displayAvatar: candidatePhotoSrc,
            backHref,
            hasAiReport: Boolean(candidate?.aiReport),
            hasResumeText: Boolean(candidate?.resumeText),
            matchScore: score,
            summary,
            strengthLines: strengths,
            weaknessLines: concerns,
            redFlagLines: integrityLines,
            primaryGapText,
            normalizedStatus: String(candidate?.resumeStatus || "pending"),
            interviewStageLabel: String(report.status || candidate?.resumeStatus || "Screened"),
            breakdown,
            combinedWorkHistory: workHistory,
            educationList,
            totalExtractedSkills: matchedSkillsCount,
            mustHaveBarPct,
            techSkillSample: skillDepth.slice(0, 14),
            aiRadar,
            aiSkillRows,
            readinessTimeline,
            candidatePotential,
            decisionReason,
            humanLayer,
        });
    }, [backHref, candidate, candidatePhotoSrc, mounted, resumeReportData]);


    const formatDuration = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds * 0.0166666);
        const s = Math.floor(totalSeconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}min`;
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center animate-pulse">
                        <Sparkles className="h-6 w-6 text-[#F97316]" />
                    </div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading profile...</p>
                </div>
            </div>
        );
    }

    if (!candidate) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center">
                        <XCircle className="h-8 w-8 text-red-400" />
                    </div>
                    <p className="text-lg font-bold text-gray-900">{error || "Candidate not found"}</p>
                </div>
            </div>
        );
    }

    if (reportMode === "resume") {
        return (
            <div className="min-h-screen bg-slate-50">
                <ResumeReportHyring model={resumeReportModel} />
            </div>
        );
    }

    if (reportMode === "interview" && interviewReportLocked) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
                <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                        <FileText className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">Interview report locked</p>
                    <h1 className="mt-3 text-2xl font-black text-slate-900">Available after the interview is finished</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        This report opens only when the interview status is marked completed and the session has a completed timestamp.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <Button asChild variant="outline" className="rounded-xl">
                            <a href={backHref}>Back to candidates</a>
                        </Button>
                    </div>
                </div>
            </div>
        );
    }


    return (
        <>
            <InterviewReportHyring
                showHeader={true}
                headerActions={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={interviewReportLocked}
                        onClick={() => setResumeReportOpen(true)}
                        className="h-8 rounded-lg border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#0D4D2E] hover:bg-[#F7FAF8]"
                    >
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        Resume report
                    </Button>
                }
                model={buildHyringInterviewViewModel({
                    backHref,
                    candidate,
                    mounted,
                    displayAvatar: candidatePhotoSrc,
                    interviewReportScores,
                    interviewReportRecording,
                    interviewReportCommunication,
                    interviewReportCognitiveInsights,
                    interviewReportBehavioralAnalysis,
                    interviewBillingSnapshot,
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

            <Dialog open={resumeReportOpen} onOpenChange={setResumeReportOpen}>
                <DialogContent className="w-[95vw] max-w-[95vw] max-h-[95vh] overflow-hidden border-0 bg-transparent p-0 shadow-none">
                    <DialogTitle className="sr-only">Resume Report</DialogTitle>
                    <div className="h-[95vh] overflow-y-auto">
                        {candidate?.fullName && (candidate?.aiReport || candidate?.resumeText) ? (
                            <ResumeReportHyring model={resumeReportModel} onBack={() => setResumeReportOpen(false)} />
                        ) : (
                            <div className="flex h-full items-center justify-center rounded-2xl bg-white p-8 text-center shadow-lg">
                                <div>
                                    <FileText className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                                    <p className="text-gray-600">No resume report available yet</p>
                                    <p className="mt-1 text-xs text-gray-500">Resume analysis will appear after screening completes</p>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
