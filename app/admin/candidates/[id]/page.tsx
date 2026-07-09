"use client";
import { useMemo } from "react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { FileText, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InterviewReportSreevaAI, buildSreevaAIInterviewViewModel } from "@/components/admin/candidate-profile/interview-report-sreevaai";
import { ResumeReportSreevaAI, buildSreevaAIResumeViewModel } from "@/components/admin/candidate-profile/resume-report-sreevaai";
import { useAdminOrg } from "@/context/admin-org-context";
import { isOrgRestrictedStatus } from "@/lib/interview-quota";
function toTextList(value: unknown): string[] {
    const toLine = (item: unknown): string => {
        if (item == null) return "";
        if (typeof item === "string") return item.trim();
        if (typeof item === "number" || typeof item === "boolean") return String(item);
        if (typeof item !== "object") return "";
        const obj = item as Record<string, unknown>;
        const keys = ["point", "text", "summary", "reasoning", "evidence", "note", "label", "description", "message", "title", "name", "skill", "tool"];
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
function safeJsonParse(value: unknown, fallback: any = {}): any {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}
export default function CandidateProfilePage() {
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
    const reportMode = (searchParams.get("report") || "interview").toLowerCase();
    const backHref = searchParams.get("back") || "/admin/candidates";
    const orgIdParam = searchParams.get("orgId");
    const adminOrg = useAdminOrg();
    const [candidate, setCandidate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const orgStatus = String(adminOrg?.status || candidate?.organization?.status || "").trim().toUpperCase();
    const isSuspended = isOrgRestrictedStatus(orgStatus);
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
        const raw = candidate?.interview?.scoreBreakdown;
        if (!raw) return {};
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const interview = candidate?.interview as any;
        return {
            ...parsed,
            signal_analysis: (() => {
                const sa = interview?.signalAnalysis ?? interview?.behavioralSignalsAnalysis ?? parsed?.signal_analysis ?? parsed?.behavioral_analysis;
                if (!sa) return {};
                return typeof sa === "string" ? JSON.parse(sa) : sa;
            })(),
            integrity_signals: interview?.integritySignals ?? [],
        };
    } catch {
        return {};
    }
})()
const interviewRecordingUrl = candidate?.interview?.interviewRecordingUrl || "";
const interviewTranscript = candidate?.interview?.interviewTranscript || "";
const interviewSummaryData: any = (() => {
    const raw = (candidate?.interview as any)?.interviewSummary;
    if (!raw) return {};
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return {}; }
})();
const isFallbackReport = !interviewReportData?.dimensions;
// -- 5-dimension scores --------------------------------------------------------
const _dims: { name: string; score: number; evidence: string }[] =
    Array.isArray(interviewReportData?.dimensions) ? interviewReportData.dimensions : [
        { name: "Communication", score: Number(interviewReportData?.communication?.score || 0), evidence: String(interviewReportData?.communication?.evidence || "") },
        { name: "Domain Knowledge", score: Number(interviewReportData?.domain_knowledge?.score || 0), evidence: String(interviewReportData?.domain_knowledge?.evidence || "") },
        { name: "Role Fit", score: Number(interviewReportData?.role_fit?.score || 0), evidence: String(interviewReportData?.role_fit?.evidence || "") },
        { name: "Problem Solving", score: Number(interviewReportData?.problem_solving?.score || 0), evidence: String(interviewReportData?.problem_solving?.evidence || "") },
        { name: "Ownership & Credibility", score: Number(interviewReportData?.ownership_credibility?.score || 0), evidence: String(interviewReportData?.ownership_credibility?.evidence || "") },
    ].filter(d => d.score > 0 || d.evidence);
const _dimByName = (name: string) => _dims.find((d) => d.name.toLowerCase().includes(name.toLowerCase()))?.score ?? 0;
const interviewReportScores = {
    overall:               candidate?.aiScore ? Number(candidate.aiScore) : Number(interviewReportData?.overall ?? 0),
    engagement:            Number(interviewReportData?.engagement ?? 0),
    communication:         _dimByName("communication"),
    domain_knowledge:      _dimByName("domain"),
    role_fit:              _dimByName("role fit"),
    problem_solving:       _dimByName("problem"),
    ownership_credibility: _dimByName("ownership"),
    dimensions:            _dims,
};
// -- Communication: from dimensions evidence -----------------------------------
const interviewReportCommunication = {
    overall:       interviewReportScores.communication,
    clarity:       interviewReportScores.communication,
    fluency:       interviewReportScores.communication,
    grammar:       interviewReportScores.communication,
    confidence:    interviewReportScores.communication,
    summary:       _dims.find((d) => d.name.toLowerCase().includes("communication"))?.evidence ?? "",
    pronunciation: interviewReportScores.communication,
};
// -- Integrity -----------------------------------------------------------------
const _integrity = interviewReportData?.integrity || {};
const integrityScore = Number(_integrity.score ?? 100);
const integrityBand  = String(_integrity.band ?? "HIGH");
// -- Skills: now read directly from the dedicated skillRatings column (flat array)
const skillRatingsList: any[] = (() => {
    const raw = (candidate?.interview as any)?.skillRatings;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
        try { return JSON.parse(raw) as any[]; } catch { return []; }
    }
    // Backward-compat: old rows still have skill_ratings nested inside scoreBreakdown
    return Array.isArray(interviewReportData?.skill_ratings) ? interviewReportData.skill_ratings : [];
})();
const skillsEvaluated: string[] = (
    Array.isArray(interviewReportData?.skills_evaluated)
        ? interviewReportData.skills_evaluated.filter((s: any) => typeof s === "string" && s.trim())
        : skillRatingsList.map((r: any) => String(r?.skill || "").trim()).filter(Boolean)
);
const interviewReportBehavioralAnalysis = {
    ...(interviewReportData?.signal_analysis || {}),
    strengths_observed: interviewSummaryData?.strengths || [],
    concerns_noted:     interviewSummaryData?.concerns  || [],
};
const interviewReportVerdict = typeof interviewSummaryData?.decision_note === "object" 
    ? interviewSummaryData.decision_note 
    : interviewReportData?.verdict || {};
    // -- interviewReportSkills: from skill_ratings (skill key, 1-10 score) ------
    const interviewReportSkills: any[] = skillRatingsList
        .filter((r: any) => r?.skill && typeof r.skill === "string")
        .map((r: any) => ({
            skill:    String(r.skill).trim(),
            name:     String(r.skill).trim(),
            score:    typeof r.score === "number" ? r.score : parseFloat(String(r.score)) || 5,
            status:   String(r.status || "NOT TESTED"),
            evidence: String(r.evidence || "").trim(),
        }));
    const interviewReportSummary = typeof interviewSummaryData?.decision_note === "string" 
        ? interviewSummaryData.decision_note 
        : interviewSummaryData?.summary || "";
    const interviewStatusNormalized = String(candidate?.interview?.status || candidate?.interviewStatus || "").trim().toUpperCase();
    const interviewIsFinished =
        interviewStatusNormalized === "COMPLETED" ||
        interviewStatusNormalized === "FINISHED" ||
        Boolean(candidate?.interview?.completedAt);
    const interviewReportLocked = !interviewIsFinished;
    // -- Parse integritySignals -- frontend tab-switch/proctoring events --
    const rawProctoringEvents: any[] = (() => {
        const raw = candidate?.interview?.integritySignals;
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "string") {
            try { return JSON.parse(raw) as any[]; } catch { return []; }
        }
        return [];
    })();
const groupedProctoringSignals = rawProctoringEvents.reduce((acc: any[], ev: any) => {
    const key = String(ev?.eventType || ev?.type || "signal");
    // Skip metadata-only events (ip_registered = fingerprint bookkeeping)
    if (key === "ip_registered") return acc;
    const severity = String(ev?.severity || "low").toLowerCase();
        // Each occurrence keeps its own during_question/during_topic (attached by
        // report_pipeline.py's _attach_question_context) so the UI can say
        // "left the tab during the Python question" per incident, not just once.
        const occurrence = {
            severity,
            timestamp: ev?.timestamp,
            during_question: ev?.during_question,
            during_topic: ev?.during_topic,
            reason: ev?.reason,
        };
        const existing = acc.find((row: any) => row.key === key);
        if (existing) {
            existing.count += 1;
            existing.occurrences.push(occurrence);
            if (severity === "high") existing.severity = "high";
            else if (severity === "medium" && existing.severity !== "high") existing.severity = "medium";
            // Keep the highest-score occurrence's extra fields (score/reason/quotes/turns)
            // for content-layer/aggregate signals like answer_integrity, latency_mismatch.
            if (typeof ev?.score === "number" && (existing.score === undefined || ev.score > existing.score)) {
                existing.score = ev.score;
                existing.reason = ev.reason;
                existing.quotes = ev.quotes;
            }
            if (Array.isArray(ev?.turns)) existing.turns = ev.turns;
            return acc;
        }
        acc.push({
            key,
            label: key.replace(/_/g, " "),
            count: 1,
            severity,
            occurrences: [occurrence],
            ...(typeof ev?.score === "number" ? { score: ev.score, reason: ev.reason, quotes: ev.quotes } : {}),
            ...(Array.isArray(ev?.turns) ? { turns: ev.turns } : {}),
        });
        return acc;
    }, []);
    // Parse org-enabled proctoring signal keys (from super-admin config)
    const enabledProctoringSignals: Set<string> = (() => {
        const raw = adminOrg?.proctoringSignals;
        if (!raw) return new Set<string>();
        try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            return new Set(
                Object.entries(parsed as Record<string, boolean>)
                    .filter(([, enabled]) => enabled)
                    .map(([key]) => key)
            );
        } catch { return new Set<string>(); }
    })();
    // Full proctoring event list -- filtered to org-enabled signals only
    const proctoringEventsFull: { time: string; eventType: string; reason: string; severity: string; elapsedSeconds: number }[] =
        rawProctoringEvents
        .filter((ev: any) => {
            const key = String(ev?.eventType || ev?.type || ev?.signal_name || "");
            if (key === "ip_registered") return false;
            return !key || enabledProctoringSignals.size === 0 || enabledProctoringSignals.has(key);
        })
        .map((ev: any) => {
            const elapsed = Number(ev?.metadata?.elapsedSeconds ?? ev?.elapsedSeconds ?? 0);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            return {
                time: `${mins}:${String(secs).padStart(2, "0")}`,
                eventType: String(ev?.eventType || ev?.type || "unknown"),
                reason: String(ev?.reason || ev?.metadata?.elapsedLabel || ""),
                severity: String(ev?.severity || "low").toLowerCase(),
                elapsedSeconds: elapsed,
            };
        });
    const signalTimeline = rawProctoringEvents
        .filter((e: any) => (e?.signal_name || e?.eventType || e?.event) && e?.eventType !== "ip_registered")
        .map((e: any) => {
            const elapsed = Number(e?.metadata?.elapsedSeconds ?? e?.elapsedSeconds ?? e?.elapsed_sec ?? 0);
            return {
                elapsed_sec:      elapsed,
                signal_name:      String(e.signal_name || e.eventType || e.event || "signal"),
                signal_layer:     String(e.signal_layer || e.risk_bucket || ""),
                evidence:         String(e.evidence || ""),
                score_delta:      Number(e.score_delta ?? e.trust_delta ?? 0),
                turn:             Number(e.turn || 0),
                recruiter_visible: true,
            };
        })
        // Show only org-enabled proctoring signals -- exclude behavioral/evaluation signals
        .filter((e) => enabledProctoringSignals.size === 0 || enabledProctoringSignals.has(e.signal_name));
    // -- Parse answerScores -- stored as JSON string in DB --
    const answerScoresParsed: { question: string; answer: string; depth: number; clarity: number; specificity: number; grounding: number; overall: number; signals: string[]; response_latency_sec: number }[] = (() => {
        const raw = candidate?.interview?.questionByQuestionAnalysis;
        const parsed = (() => {
            if (!raw) return null;
            if (typeof raw === "object") return raw;
            try { return JSON.parse(raw as string); } catch { return null; }
        })();
        if (!parsed) return [];
        const allAnswers: any[] = Array.isArray(parsed?.allAnswers) ? parsed.allAnswers : Array.isArray(parsed) ? parsed : [];
        return allAnswers
            .filter((score: any) => {
                if (score?.is_warmup) return false;
                const ans = String(score?.candidate_answer || score?.answer || "").trim();
                if (!ans || ans === "?") return false;
                const overall = Number(score?.overall ?? 0);
                if (overall <= 0) return false;
                return true;
            })
            .map((score: any) => {
                const sb = score?.score_breakdown || {};
                return {
                    turn:                 Number(score?.turn ?? 0),
                    question:             String(score?.ai_question    || score?.question || "").trim(),
                    answer:               String(score?.candidate_answer || score?.answer || "").trim(),
                    topic:                String(score?.topic || "").trim(),
                    depth:                Number(sb.depth       ?? score?.depth       ?? 0),
                    clarity:              Number(sb.clarity     ?? score?.clarity     ?? 0),
                    specificity:          Number(sb.fluency     ?? score?.specificity ?? 0),
                    grounding:            Number(sb.confidence  ?? score?.grounding   ?? 0),
                    overall:              Number(score?.overall ?? 0),
                    signals:              Array.isArray(score?.signals) ? score.signals.filter(Boolean) : [],
                    score_breakdown:      sb,
                    response_latency_sec: Number(score?.response_latency_sec ?? 0),
                };
            });
    })();
    // -- Compute avg response time from real per-question data --
    const avgResponseTimeSec = (() => {
        const latencies = answerScoresParsed
            .map((s: any) => Number(s.response_latency_sec ?? 0))
            .filter((n: number) => Number.isFinite(n) && n > 0);
        if (latencies.length === 0) return null;
        return Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    })();
    const interviewSessionRows = answerScoresParsed.map((score: any, i: number) => ({
        q: Number(score?.turn || i + 1),
        question: String(score?.ai_question || score?.question || "").trim(),
        answer: String(score?.candidate_answer || score?.answer || "").trim(),
        score: String(score?.overall ? `${Math.round(score.overall)}/10` : "--"),
        reasoning: "",
    }));
    const interviewQaRows = answerScoresParsed.map((score: any, idx: number) => ({
        q: Number(score?.turn || idx + 1),
        question: String(score?.ai_question || score?.question || `Question ${idx + 1}`).trim(),
        answer: String(score?.candidate_answer || score?.answer || "").trim(),
        score: score?.overall ? `${Math.round(score.overall)}/10` : "--",
        reasoning: "",
        score_breakdown: score?.score_breakdown ? {
            clarity:               score.score_breakdown.clarity   ?? 0,
            depth:                 score.score_breakdown.depth     ?? 0,
            technical_accuracy:    score.score_breakdown.fluency   ?? 0,
            practical_application: score.score_breakdown.confidence ?? 0,
        } : null,
        tags: Array.isArray(score?.signals) ? score.signals : [],
        confidence: "",
    }));
    const wordCount = interviewTranscript ? interviewTranscript.split(/\s+/).filter(Boolean).length : 0;
    const interviewScore = (() => {
        const overall = Number(interviewReportScores.overall);
        if (Number.isFinite(overall) && overall > 0) return Math.max(0, Math.min(100, Math.round(overall)));
        if (answerScoresParsed.length > 0) {
            const nums = answerScoresParsed
                .map((s: any) => Number(s?.overall || 0))
                .filter((n: number) => Number.isFinite(n) && n > 0);
            if (nums.length > 0) {
                const avg = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
                return Math.max(0, Math.min(100, Math.round(avg <= 10 ? avg * 10 : avg)));
            }
        }
        return 0;
    })();
    const combinedScore = interviewScore; // 0-100, no normalization needed
    // -- Proctoring verdict -- if fallback report but real events exist, say so --
    const proctoringVerdictSummary = (() => {
        const aiSummary = String(interviewReportData?.integrity?.summary || "").trim();
        if (aiSummary && !isFallbackReport) return aiSummary;
        const hasFlags = groupedProctoringSignals.some((s: any) => s.severity === "high" || s.severity === "medium");
        if (hasFlags) return `${groupedProctoringSignals.length} proctoring event type(s) detected. Manual review of the recording is recommended.`;
        if (groupedProctoringSignals.length > 0) return `${groupedProctoringSignals.length} proctoring event type(s) logged — all low severity.`;
        return "No proctoring flags detected during this session.";
    })();
    // Interview.interviewDuration is the single source of truth for duration
    // everywhere (billing history table, credits calc, this page) -- see
    // app/api/admin/billing/history/route.ts. It's set exactly once by
    // update_interview_status(), clamped to the fixed session length for
    // time-limit endings. Only fall back to the raw recording file length for
    // rows saved before interviewDuration existed, so this page can never show
    // a different number than the billing table for the same interview.
    const recordingDurationSec = typeof candidate?.interview?.interviewDuration === "number"
        ? candidate.interview.interviewDuration
        : typeof candidate?.interview?.recordingDurationSec === "number"
            ? candidate.interview.recordingDurationSec
            : null;
    const communicationStatus = (() => {
        const commScore = interviewReportScores.communication;
        if (commScore > 0) {
            if (commScore >= 70) return "Strong";
            if (commScore >= 45) return "Average";
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
    const resumeReportPayload: any = (() => {
        try {
            const raw = candidate?.fullScanReport;
            if (!raw) return {};
            return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
            return {};
        }
    })();
    const structuredResumeData: any = (() => {
        const raw = candidate?.resumeData;
        const parsed = safeJsonParse(raw, {});
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            if (parsed.structured && typeof parsed.structured === "object" && !Array.isArray(parsed.structured)) {
                return parsed.structured;
            }
            if (parsed.resume && typeof parsed.resume === "object" && !Array.isArray(parsed.resume)) {
                return parsed.resume;
            }
            return parsed;
        }
        return {};
    })();
    const resumeReportModel = useMemo(() => {
        const report = resumeReportPayload || {};
        const resumeStruct = structuredResumeData || {};
        const fullName = candidate?.fullName || "Candidate";
        const workHistory = (Array.isArray(report.work_history_annotated) && report.work_history_annotated.length > 0)
            ? report.work_history_annotated
            : Array.isArray(report.work_history)
                ? report.work_history
                : Array.isArray(resumeStruct.work_history)
                    ? resumeStruct.work_history
                : [];
        const breakdown = report.breakdown || null;
        const score = Number(candidate?.aiScore ?? report.score ?? 0) || 0;
        const experienceYears: number | null = (() => {
            const v = report.candidate_years ?? report.experience_assessment?.years ?? resumeStruct?.experience?.total_years ?? null;
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? n : null;
        })();
        const missingMustSkills: string[] = (() => {
            const fromMatching = report?.skill_matching?.missing_must;
            if (Array.isArray(fromMatching) && fromMatching.length > 0) {
                return fromMatching.map((s: any) => String(s || "").trim()).filter(Boolean);
            }
            const fromConcerns = Array.isArray(report?.concerns)
                ? report.concerns.flatMap((c: any) => Array.isArray(c?.missing_skills) ? c.missing_skills : [])
                : [];
            return fromConcerns.map((s: any) => String(s || "").trim()).filter(Boolean);
        })();
        return buildSreevaAIResumeViewModel({
            candidate: {
                fullName,
                createdAt: candidate?.createdAt,
                location: candidate?.location || candidate?.city || "—",
                resumeUrl: candidate?.resumeUrl || null,
                job: { title: candidate?.job?.title || candidate?.jobTitle || "Role N/A" },
                experienceYears,
            },
            mounted,
            displayAvatar: candidatePhotoSrc,
            backHref,
            hasAiReport: Boolean(candidate?.fullScanReport),
            hasResumeText: Boolean(candidate?.resumeText),
            matchScore: score,
            normalizedStatus: String(candidate?.resumeStatus || "pending"),
            breakdown,
            combinedWorkHistory: workHistory,
            structuredResumeData,
            aiRadar: report.fit_radar || null,
            aiRadarNotes: report.fit_radar_notes || null,
            aiSkillRows: Array.isArray(report.skill_match_rows) ? report.skill_match_rows : null,
            missingMustSkills,
            decisionReason: typeof report.decision_reason === "string" ? report.decision_reason : null,
            aiSummaryCards: Array.isArray(report.ai_summary) && report.ai_summary.length >= 1 ? report.ai_summary : null,
            aiStrengths: Array.isArray(report.strengths) && report.strengths.length > 0 ? report.strengths : null,
            aiWeaknesses: Array.isArray(report.weaknesses) && report.weaknesses.length > 0 ? report.weaknesses : null,
            skillMatching: report.skill_matching || null,
        });
    }, [backHref, candidate, candidatePhotoSrc, mounted, resumeReportPayload, structuredResumeData]);
    const formatDuration = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds * 0.0166666);
        const s = Math.floor(totalSeconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}min`;
    };
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-violet-50 flex items-center justify-center animate-pulse">
                        <Sparkles className="h-6 w-6 text-[#7C3AED]" />
                    </div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading profile...</p>
                </div>
            </div>
        );
    }
    if (!candidate) {
        return (
            <div className="min-h-screen flex items-center justify-center">
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
            <div className="min-h-screen">
                <ResumeReportSreevaAI model={resumeReportModel} onBack={() => router.push(backHref)} />
            </div>
        );
    }
    if (reportMode === "interview" && interviewReportLocked) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                        <FileText className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">Interview report locked</p>
                    <h1 className="mt-3 text-2xl font-black text-gray-900">Available after the interview is finished</h1>
                    <p className="mt-3 text-sm leading-6 text-gray-600">
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
            <InterviewReportSreevaAI
                showHeader={true}
                headerActions={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={interviewReportLocked}
                            onClick={() => router.push("?report=resume")}
                            className="h-8 rounded-lg border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#0D4D2E] hover:bg-[#F7FAF8]"
                        >
                            <FileText className="mr-1.5 h-3.5 w-3.5" />
                            Resume report
                        </Button>
                    </div>
                }
                model={buildSreevaAIInterviewViewModel({
                    backHref,
                    candidate,
                    mounted,
                    displayAvatar: candidatePhotoSrc,
                    interviewReportScores,
                    interviewReportCommunication,
                    interviewReportBehavioralAnalysis,
                    interviewReportVerdict,
                    isFallbackReport,
                    interviewReportSkills,
                    interviewSessionRows,
                    interviewQaRows,
                    interviewReportSummary,
                    interviewAiSummary: interviewSummaryData?.summary || "",
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
                    signalTimeline,
                    proctoringEventsFull,
                    answerScoresParsed,
                    // New schema fields
                    integrityScore,
                    integrityBand,
                    skillsEvaluated,
                    skillRatingsList,
                    avgResponseTimeSec,
                    reportNotGenerated: Boolean(candidate?.interview?.isTest && isFallbackReport),
                })}
            />
        </>
    );
}
