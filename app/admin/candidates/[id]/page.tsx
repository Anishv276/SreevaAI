"use client";

import { useMemo } from "react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { FileText, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

    const turnTimes = (() => {
        const times = new Map<number, number>();
        if (!interviewTranscript) return times;
        const lines = interviewTranscript.split("\n");
        let currentTurn = 0;
        for (const line of lines) {
            const match = line.match(/^(Interviewer|Candidate)\[(\d+)\]:/);
            if (match) {
                const timeSec = parseInt(match[2], 10);
                if (match[1] === "Interviewer") {
                    currentTurn++;
                    times.set(currentTurn, timeSec);
                } else if (match[1] === "Candidate") {
                    if (currentTurn > 0 && !times.has(currentTurn)) {
                        times.set(currentTurn, timeSec);
                    }
                }
            }
        }
        return times;
    })();

    // ── Signal timeline from proctoringReport.checkpoint_events (AI signals) + events (proctoring) ──
    const signalTimeline = (() => {
        const raw = candidate?.interview?.proctoringReport;
        const pr = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {});
        // AI behavioral signals are stored in checkpoint_events; proctoring events in events
        const checkpointEvents: any[] = Array.isArray(pr?.checkpoint_events) ? pr.checkpoint_events : [];
        const procEvents: any[] = Array.isArray(pr?.events) ? pr.events : [];
        const events: any[] = [...checkpointEvents, ...procEvents];
        return events
            .filter((e: any) => e?.recruiter_visible !== false && (e?.signal_name || e?.event))
            .map((e: any) => {
                let elapsed = e?.elapsed_sec ?? e?.elapsed_seconds ?? e?.elapsedSeconds;
                if (typeof elapsed !== "number" || isNaN(elapsed)) {
                    const parsedElapsed = parseFloat(String(elapsed));
                    if (!isNaN(parsedElapsed)) {
                        elapsed = parsedElapsed;
                    } else if (typeof e?.turn === "number" && e?.turn > 0) {
                        elapsed = turnTimes.get(e.turn) ?? (e.turn * 30); // fall back to turn * 30 if not found in transcript
                    } else {
                        elapsed = 0;
                    }
                }
                return {
                    elapsed_sec: Number(elapsed),
                    signal_name: String(e.signal_name || e.event || "signal"),
                    signal_layer: String(e.signal_layer || e.risk_bucket || ""),
                    evidence: String(e.evidence || ""),
                    score_delta: Number(e.score_delta ?? e.trust_delta ?? 0),
                    turn: Number(e.turn || 0),
                    recruiter_visible: true,
                };
            });
    })();

    // ── Is this a fallback/failed report? ──────────────────────────────────
    const isFallbackReport = interviewReportData?._meta?.is_fallback === true;

    const interviewReportScores = interviewReportData?.scores || {};
    const interviewReportRecording = interviewReportData?.recording || {};
    const interviewReportCommunication = interviewReportData?.communication || {};
    const interviewReportCognitiveInsights = interviewReportData?.cognitive_insights || {};
    const interviewReportBehavioralAnalysis = interviewReportData?.behavioral_analysis || {};
    const interviewReportVerdict = interviewReportData?.verdict || {};

    // ── Skills proof — handle object array (new schema) AND legacy string array ──
    const rawSkillsProof = Array.isArray(interviewReportData?.skills_proof)
        ? interviewReportData.skills_proof
        : [];
    const skillRatings = interviewReportData?.skill_ratings || {};
    const interviewReportSkills = rawSkillsProof.map((item: any) => {
        if (typeof item === "string") {
            const trimmed = item.trim();
            let rating = skillRatings[trimmed] !== undefined ? Number(skillRatings[trimmed]) : null;
            if (rating === null) {
                const key = Object.keys(skillRatings).find(k => k.toLowerCase() === trimmed.toLowerCase());
                if (key) rating = Number(skillRatings[key]);
            }
            let score = "—";
            let status = "NOT TESTED";
            if (rating !== null && !isNaN(rating)) {
                score = `${rating}/10`;
                status = rating >= 7 ? "PROVED" : rating >= 4 ? "PARTIAL" : "NOT PROVED";
            }
            return { name: trimmed, skill: trimmed, score, status, what_they_showed: "", what_was_missing: "" };
        }
        const name = String(item?.skill || item?.name || "").trim();
        let score = String(item?.score || "—").trim();
        let status = String(item?.status || "NOT TESTED").trim();
        if (score === "—" || score === "--" || !score) {
            let rating = skillRatings[name] !== undefined ? Number(skillRatings[name]) : null;
            if (rating === null) {
                const key = Object.keys(skillRatings).find(k => k.toLowerCase() === name.toLowerCase());
                if (key) rating = Number(skillRatings[key]);
            }
            if (rating !== null && !isNaN(rating)) {
                score = `${rating}/10`;
                if (status === "NOT TESTED") {
                    status = rating >= 7 ? "PROVED" : rating >= 4 ? "PARTIAL" : "NOT PROVED";
                }
            }
        }
        return {
            name,
            skill: name,
            score,
            status,
            what_they_showed: String(item?.what_they_showed || item?.evidence || "").trim(),
            what_was_missing: String(item?.what_was_missing || "").trim(),
        };
    }).filter((s: any) => s.name);

    const interviewReportSummary = interviewReportData?.verdict?.summary || interviewReportRecording.summary || interviewAiSummary || "";
    const interviewStatusNormalized = String(candidate?.interview?.status || candidate?.interviewStatus || "").trim().toUpperCase();
    const interviewIsFinished =
        interviewStatusNormalized === "COMPLETED" ||
        interviewStatusNormalized === "FINISHED" ||
        Boolean(candidate?.interview?.completedAt);
    const interviewReportLocked = !interviewIsFinished;

    // ── Parse proctoringEvents — stored as JSON string in DB ──
    const rawProctoringEvents: any[] = (() => {
        const raw = candidate?.interview?.proctoringEvents;
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

    // Full proctoring event list for detailed signal display (time + evidence per event)
    const proctoringEventsFull: { time: string; eventType: string; reason: string; severity: string; elapsedSeconds: number }[] =
        rawProctoringEvents.map((ev: any) => {
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

    // ── Parse answerScores — stored as JSON string in DB ──
    const answerScoresParsed: { question: string; answer: string; depth: number; clarity: number; fluency: number; confidence: number; overall: number; signals: string[] }[] = (() => {
        const raw = candidate?.interview?.answerScores;
        const parsed = (() => {
            if (!raw) return null;
            if (typeof raw === "object") return raw;
            try { return JSON.parse(raw as string); } catch { return null; }
        })();
        if (!parsed) return [];
        const allAnswers: any[] = Array.isArray(parsed?.allAnswers) ? parsed.allAnswers : Array.isArray(parsed) ? parsed : [];
        const turns = Array.isArray(interviewTurns) ? interviewTurns : [];
        return allAnswers.map((score: any, idx: number) => {
            const turn = turns[idx] || null;
            return {
                question: String(turn?.question || `Turn ${idx + 1}`).trim(),
                answer: String(turn?.answer || "").trim(),
                depth: Number(score?.depth ?? 0),
                clarity: Number(score?.clarity ?? 0),
                fluency: Number(score?.fluency ?? 0),
                confidence: Number(score?.confidence ?? 0),
                overall: Number(score?.overall ?? 0),
                signals: Array.isArray(score?.signals) ? score.signals.filter(Boolean) : [],
            };
        }).filter((s, idx) => s.question && s.question !== `Turn ${idx + 1}`);
    })();

    const interviewSessionRows = Array.isArray(interviewTurns)
        ? interviewTurns.map((turn: any, i: number) => ({
            q: Number(turn?.turn || i + 1),
            question: String(turn?.question || turn?.title || "").trim(),
            answer: String(turn?.answer || turn?.reasoning || "").trim(),
            score: String(turn?.score || "--"),
            reasoning: String(turn?.reasoning || turn?.analysis_reasoning || "").trim(),
        }))
        : [];

    // ── QA blocks — use AI blocks with full question/answer_summary from new schema ──
    const aiQaBlocks = Array.isArray(interviewReportData?.qa_blocks) ? interviewReportData.qa_blocks : [];
    const interviewQaRows = aiQaBlocks.length > 0
        ? aiQaBlocks.map((block: any, i: number) => {
            // Cross-reference interviewTurns for any missing question/answer text
            const matchedTurn = interviewTurns[i] || interviewTurns.find((t: any) => Number(t?.turn) === Number(block?.q));
            return {
                q: Number(block?.q || i + 1),
                question: String(block?.question || matchedTurn?.question || block?.title || `Question ${i + 1}`).trim(),
                answer: String(block?.answer_summary || block?.answer || matchedTurn?.answer || "").trim(),
                score: String(block?.score || "--"),
                reasoning: String(block?.verdict || block?.reasoning || "").trim(),
                score_breakdown: block?.score_breakdown ?? null,
                tags: Array.isArray(block?.tags) ? block.tags : [],
                confidence: String(block?.confidence || ""),
            };
        })
        : interviewSessionRows;

    const wordCount = interviewTranscript ? interviewTranscript.split(/\s+/).filter(Boolean).length : 0;

    // ── interviewScore: combined_score is 0-100 from the enriched report ──
    const interviewScore = (() => {
        const aiCombined = Number(interviewReportScores.combined_score);
        if (Number.isFinite(aiCombined) && aiCombined > 0) return Math.max(0, Math.min(100, Math.round(aiCombined)));
        // Fall back: average qa_blocks scores scaled to 0-100
        if (aiQaBlocks.length > 0) {
            const nums = aiQaBlocks
                .map((b: any) => parseFloat(String(b?.score || "").replace(/[^\d.]/g, "")))
                .filter((n: number) => Number.isFinite(n));
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
        const commData = interviewReportData?.communication || {};
        const commValues = [commData.pronunciation, commData.grammar, commData.fluency, commData.confidence]
            .map(Number).filter((n) => Number.isFinite(n) && n > 0);
        if (commValues.length > 0) {
            const avg = commValues.reduce((a, b) => a + b, 0) / commValues.length;
            if (avg >= 70) return "Strong";
            if (avg >= 45) return "Average";
            return "Limited";
        }
        const aiCommScore = Number(interviewReportScores.communication_score);
        if (Number.isFinite(aiCommScore) && aiCommScore > 0) {
            if (aiCommScore >= 70) return "Strong";
            if (aiCommScore >= 45) return "Average";
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
            if (res.ok) {
                await fetchCandidate();
            }
        } catch (err) {
            console.error("Error resending interview link:", err);
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
                    interviewReportRecording,
                    interviewReportCommunication,
                    interviewReportCognitiveInsights,
                    interviewReportBehavioralAnalysis,
                    interviewReportVerdict,
                    isFallbackReport,
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
                    signalTimeline,
                    proctoringEventsFull,
                    answerScoresParsed,
                })}
            />

            <Dialog open={resumeReportOpen} onOpenChange={setResumeReportOpen}>
                <DialogContent className="w-[95vw] max-w-[95vw] max-h-[95vh] overflow-hidden border-0 bg-transparent p-0 shadow-none">
                    <DialogTitle className="sr-only">Resume Report</DialogTitle>
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
