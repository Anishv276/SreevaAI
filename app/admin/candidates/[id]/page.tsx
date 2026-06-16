"use client";

import { useMemo } from "react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { FileText, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
    const [mounted, setMounted] = useState(false);
    const [resumeReportOpen, setResumeReportOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{ action: string; title: string; description: string } | null>(null);
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
const interviewReportVerdict = interviewReportData?.verdict || {};

    // -- interviewReportSkills: from skill_ratings (skill key, 1-10 score) ------
    const interviewReportSkills: any[] = skillRatingsList
        .filter((r: any) => r?.skill && typeof r.skill === "string")
        .map((r: any) => ({
            skill:            String(r.skill).trim(),
            name:             String(r.skill).trim(),
            score:            String(r.score) + "/10",
            status:           String(r.status || "NOT TESTED"),
            what_they_showed: String(r.evidence || "").trim(),
            what_was_missing: String(r.gaps || "").trim(),
        }));

    const interviewReportSummary = interviewSummaryData?.decision_note || interviewSummaryData?.summary || "";
    const interviewStatusNormalized = String(candidate?.interview?.status || candidate?.interviewStatus || "").trim().toUpperCase();
    const interviewIsFinished =
        interviewStatusNormalized === "COMPLETED" ||
        interviewStatusNormalized === "FINISHED" ||
        Boolean(candidate?.interview?.completedAt);
    const interviewReportLocked = !interviewIsFinished;

    // ── Parse integritySignals — frontend tab-switch/proctoring events ──
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
        const severity = String(ev?.severity || "low").toLowerCase();
        const existing = acc.find((row: any) => row.key === key);
        if (existing) {
            existing.count += 1;
            if (severity === "high") existing.severity = "high";
            else if (severity === "medium" && existing.severity !== "high") existing.severity = "medium";
            return acc;
        }
        acc.push({ key, label: key.replace(/_/g, " "), count: 1, severity });
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

    // Full proctoring event list — filtered to org-enabled signals only
    const proctoringEventsFull: { time: string; eventType: string; reason: string; severity: string; elapsedSeconds: number }[] =
        rawProctoringEvents
        .filter((ev: any) => {
            const key = String(ev?.eventType || ev?.type || ev?.signal_name || "");
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
        .filter((e: any) => e?.signal_name || e?.eventType || e?.event)
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
        // Show only org-enabled proctoring signals — exclude behavioral/evaluation signals
        .filter((e) => enabledProctoringSignals.size === 0 || enabledProctoringSignals.has(e.signal_name));

    // ── Parse answerScores — stored as JSON string in DB ──
    const answerScoresParsed: { question: string; answer: string; depth: number; clarity: number; specificity: number; grounding: number; overall: number; signals: string[] }[] = (() => {
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
                    turn:        Number(score?.turn ?? 0),
                    question:    String(score?.ai_question    || score?.question || "").trim(),
                    answer:      String(score?.candidate_answer || score?.answer || "").trim(),
                    topic:       String(score?.topic || "").trim(),
                    depth:       Number(sb.depth       ?? score?.depth       ?? 0),
                    clarity:     Number(sb.clarity     ?? score?.clarity     ?? 0),
                    specificity: Number(sb.fluency     ?? score?.specificity ?? 0),
                    grounding:   Number(sb.confidence  ?? score?.grounding   ?? 0),
                    overall:     Number(score?.overall ?? 0),
                    signals:     Array.isArray(score?.signals) ? score.signals.filter(Boolean) : [],
                    score_breakdown: sb,
                };
            });
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

    // ── Proctoring verdict — if fallback report but real events exist, say so ──
    const proctoringVerdictSummary = (() => {
        const aiSummary = String(interviewReportData?.integrity?.summary || "").trim();
        if (aiSummary && !isFallbackReport) return aiSummary;
        const hasFlags = groupedProctoringSignals.some((s: any) => s.severity === "high" || s.severity === "medium");
        if (hasFlags) return `${groupedProctoringSignals.length} proctoring event type(s) detected. Manual review of the recording is recommended.`;
        if (groupedProctoringSignals.length > 0) return `${groupedProctoringSignals.length} proctoring event type(s) logged — all low severity.`;
        return "No proctoring flags detected during this session.";
    })();

    const recordingDurationSec = typeof candidate?.interview?.recordingDurationSec === "number"
        ? candidate.interview.recordingDurationSec
        : typeof candidate?.interview?.interviewDuration === "number"
            ? candidate.interview.interviewDuration
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
    const resumeReportData: any = (() => {
        try {
            const raw = candidate?.aiReport;
            if (!raw) return {};
            return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
            return {};
        }
    })();
    const resumeReportPayload: any = (() => {
        const raw = resumeReportData;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
                return raw.data;
            }
            if (raw.report && typeof raw.report === "object" && !Array.isArray(raw.report)) {
                return raw.report;
            }
        }
        return raw || {};
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
    const structuredJdData: any = (() => {
        const raw = candidate?.drive?.extractedDetails;
        const parsed = safeJsonParse(raw, {});
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            if (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) {
                return parsed.data;
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
        const skillDepth = toTextList(report.skill_depth);
        const coreClaims = toTextList(report.core_claims);
        const breakdown = report.breakdown || null;
        const score = Number(candidate?.aiScore ?? report.score ?? 0) || 0;
        // Experience years: prefer scored result, fall back to AI assessment
        const experienceYears: number | null = (() => {
            const v = report.candidate_years ?? report.experience_assessment?.years ?? resumeStruct?.experience?.total_years ?? null;
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
            firstText(report.summary) ||
            firstText(report.reasoning) ||
            "AI screening analysis ready.";
        const primaryGapText =
            firstText(report.decision_reason) ||
            firstText(report.recruiter_snapshot) ||
            "No top gap listed yet.";

        // AI-direct fields from gpt-4o report
        const aiRadar = report.fit_radar || null;
        const aiSkillRows = Array.isArray(report.skill_match_rows) ? report.skill_match_rows : null;
        const missingMustSkills: string[] = (() => {
            const fromMatching = report?.skill_matching?.missing_must;
            if (Array.isArray(fromMatching) && fromMatching.length > 0) {
                return fromMatching.map((s: any) => String(s || "").trim()).filter(Boolean);
            }
            // Fallback: pull missing_skills off concerns array
            const fromConcerns = Array.isArray(report?.concerns)
                ? report.concerns.flatMap((c: any) => Array.isArray(c?.missing_skills) ? c.missing_skills : [])
                : [];
            return fromConcerns.map((s: any) => String(s || "").trim()).filter(Boolean);
        })();
        const candidatePotential = report.candidate_potential?.for_this_role || null;
        const decisionReason = typeof report.decision_reason === "string" ? report.decision_reason : null;
        const humanLayer = report.human_layer || null;

        return buildSreevaAIResumeViewModel({
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
            primaryGapText,
            normalizedStatus: String(candidate?.resumeStatus || "pending"),
            interviewStageLabel: String(report.status || candidate?.resumeStatus || "Screened"),
            breakdown,
            combinedWorkHistory: workHistory,
            totalExtractedSkills: matchedSkillsCount,
            techSkillSample: skillDepth.slice(0, 14),
            structuredResumeData,
            structuredJdData,
            experienceReadout: report.experience_assessment?.vs_required || null,
            aiRadar,
            aiSkillRows,
            missingMustSkills,
            candidatePotential,
            decisionReason,
            humanLayer,
            skillMatching: report.skill_matching || null,
            resumeParseConfidence: typeof structuredResumeData?.parse_confidence === "string"
                ? structuredResumeData.parse_confidence
                : null,
        });
    }, [backHref, candidate, candidatePhotoSrc, mounted, resumeReportPayload, structuredResumeData, structuredJdData]);


    const formatDuration = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds * 0.0166666);
        const s = Math.floor(totalSeconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}min`;
    };

    const handleHiringAction = useCallback(async (action: "hire" | "not_hired") => {
        if (!candidate?.id) return;
        setIsUpdating(true);
        try {
            const url = new URL(`/api/candidates/${candidate.id}`, window.location.origin);
            if (orgIdParam) url.searchParams.append("orgId", orgIdParam);
            const res = await fetch(url, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hiringStatus: action === "hire" ? "hired" : "not hired" })
            });
            if (res.ok) {
                await fetchCandidate();
            }
        } catch (err) {
            console.error("Error updating hiring status:", err);
        } finally {
            setIsUpdating(false);
        }
    }, [candidate?.id, orgIdParam, fetchCandidate]);

    const handleResendInterviewLink = useCallback(async () => {
        if (!candidate?.id) return;
        if (isSuspended) {
            return;
        }
        setIsUpdating(true);
        try {
            const url = new URL(`/api/candidates/${candidate.id}/send-interview-link`, window.location.origin);
            if (orgIdParam) url.searchParams.append("orgId", orgIdParam);
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                alert(data?.error || "Failed to send interview link. Please try again.");
                return;
            }
            await fetchCandidate();
        } catch (err) {
            console.error("Error resending interview link:", err);
            alert("Failed to send interview link. Please try again.");
        } finally {
            setIsUpdating(false);
        }
    }, [candidate?.id, orgIdParam, fetchCandidate, isSuspended]);

    const handleConfirmAction = useCallback(async () => {
        if (!confirmDialog) return;

        if (confirmDialog.action === "resend_link" && isSuspended) {
            setConfirmDialog(null);
            return;
        }

        if (confirmDialog.action === "hire") {
            await handleHiringAction("hire");
        } else if (confirmDialog.action === "not_hired") {
            await handleHiringAction("not_hired");
        } else if (confirmDialog.action === "resend_link") {
            await handleResendInterviewLink();
        }

        setConfirmDialog(null);
    }, [confirmDialog, handleHiringAction, handleResendInterviewLink, isSuspended]);

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
                <ResumeReportSreevaAI model={resumeReportModel} />
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


    const hiringStatus = candidate?.hiringStatus?.toLowerCase() || "pending";
    const isHired = hiringStatus === "hired";
    const isNotHired = hiringStatus === "not hired";

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
                            onClick={() => setResumeReportOpen(true)}
                            className="h-8 rounded-lg border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#0D4D2E] hover:bg-[#F7FAF8]"
                        >
                            <FileText className="mr-1.5 h-3.5 w-3.5" />
                            Resume report
                        </Button>
                        <div className="flex items-center gap-2 border-l border-[#DDE1E5] pl-2">
                            {!isSuspended && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setConfirmDialog({
                                        action: "resend_link",
                                        title: "Resend Interview Link?",
                                        description: "Send a new interview link to the candidate."
                                    })}
                                    disabled={isUpdating}
                                    className="h-8 rounded-lg border-blue-200 bg-blue-50 px-3 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                                >
                                    Resend Link
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant={isHired ? "default" : "outline"}
                                size="sm"
                                disabled={isUpdating}
                                onClick={() => setConfirmDialog({
                                    action: "hire",
                                    title: "Mark as Hired?",
                                    description: `Confirm hiring decision for ${candidate?.fullName}.`
                                })}
                                className={isHired ? "h-8 rounded-lg bg-emerald-600 text-white px-3 text-[11px] font-bold hover:bg-emerald-700" : "h-8 rounded-lg border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"}
                            >
                                Hire
                            </Button>
                            <Button
                                type="button"
                                variant={isNotHired ? "default" : "outline"}
                                size="sm"
                                disabled={isUpdating}
                                onClick={() => setConfirmDialog({
                                    action: "not_hired",
                                    title: "Mark as Not Hired?",
                                    description: `Confirm rejection for ${candidate?.fullName}.`
                                })}
                                className={isNotHired ? "h-8 rounded-lg bg-rose-600 text-white px-3 text-[11px] font-bold hover:bg-rose-700" : "h-8 rounded-lg border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-700 hover:bg-rose-100"}
                            >
                                Not Hired
                            </Button>
                        </div>
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

                })}
            />

            <Dialog open={resumeReportOpen} onOpenChange={setResumeReportOpen}>
                <DialogContent className="w-[95vw] max-w-[95vw] max-h-[95vh] overflow-hidden border-0 bg-transparent p-0 shadow-none">
                    <DialogTitle className="sr-only">Resume Report</DialogTitle>
                    <DialogDescription className="sr-only">
                        Detailed resume analysis report for the selected candidate.
                    </DialogDescription>
                    <div className="h-[95vh] overflow-y-auto">
                        {candidate?.fullName && (candidate?.aiReport || candidate?.resumeText) ? (
                            <ResumeReportSreevaAI model={resumeReportModel} onBack={() => setResumeReportOpen(false)} />
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

            {confirmDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-6 pt-6 pb-4">
                            <h2 className="text-lg font-black text-gray-900 tracking-tight">{confirmDialog.title}</h2>
                            <p className="text-sm text-gray-600 mt-2">{confirmDialog.description}</p>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                            <Button
                                variant="ghost"
                                onClick={() => setConfirmDialog(null)}
                                className="h-10 px-5 rounded-2xl font-bold text-gray-500"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleConfirmAction}
                                disabled={isUpdating}
                                className={`h-10 px-6 rounded-2xl border font-bold flex items-center gap-2 ${
                                    confirmDialog.action === "hire"
                                        ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                                        : confirmDialog.action === "not_hired"
                                        ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
                                        : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                                }`}
                            >
                                {isUpdating ? "Processing..." : "Confirm"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
