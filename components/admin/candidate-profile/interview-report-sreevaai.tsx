"use client";

import { useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import "plyr-react/plyr.css";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Box,
  ChevronDown,
  Eye,
  GitBranch,
  Play,
  Search,
  Shield,
  Shirt,
  Smile,
  Sparkles,
  Star,
  User,
  Zap,
} from "lucide-react";

const Plyr = dynamic(() => import("plyr-react").then((m) => m.Plyr), { ssr: false });

export type IntelBadgeTone = "rose" | "sky" | "amber" | "emerald" | "slate";
export type IntelIconKey =
  | "user" | "smile" | "eye" | "shirt" | "activity"
  | "zap" | "star" | "search" | "box" | "git-branch" | "shield" | "alert";

export type IntelSignalRow = {
  id: string;
  label: string;
  badge: string;
  tone: IntelBadgeTone;
  icon: IntelIconKey;
  details?: string[];
};

type IntelId = "integrity" | "behavioral" | "cognitive";
type QBadge = "FAIR" | "AVERAGE" | "STRONG" | "PENDING";

export type SreevaAIInterviewViewModel = {
  backHref: string;
  fullName: string;
  displayAvatar: string;
  roleLabel: string;
  interviewedOn: string;
  totalTime: string;
  questionsAsked: number;
  skillsCovered: number;
  proctoringFlags: number;
  recommendation: string;
  recommendationColor: "green" | "amber" | "red" | "blue";
  fitPercent: number;
  fitLabel: string;
  isFallback: boolean;
  technical: { percent: number; questions: number; tag: "GOOD" | "AVERAGE" | "WEAK"; scores?: { technical: number; communication: number; behavioral: number } };
  comm: { pronunciation: number; grammar: number; vocabulary: number; minimalFiller: number; fluency: number; tag: string; commSummary: string };
  verdictSummary: string;
  verdictRecommendationReason: string;
  aiBullets: string[];
  cognitiveInsights: IntelSignalRow[];
  integritySignals: IntelSignalRow[];
  behavioralAnalysis: Record<string, any>;
  skills: { name: string; stars: number; status: string; scoreLabel: string; evidence?: string }[];
  topStrengths: string[];
  topRisks: string[];
  transcript: { from: "ai" | "user"; text: string; time?: string; qBadge?: QBadge; bad?: boolean; seekSeconds?: number; seekLabel?: string }[];
  questionAnalysis: {
    id: number; question: string; answer: string; score: string; qBadge: QBadge; bad: boolean;
    reasoning: string; tags: string[]; confidence: string;
    scoreBreakdown: { clarity: number; depth: number; fluency: number; confidence: number } | null;
  }[];
  videoUrl: string | null;
  recordingDurationSec: number | null;
  proctoringHeadline: string;
  integrityScore: number;
  signalTimeline: {
    elapsed_sec: number;
    signal_name: string;
    signal_layer: string;
    evidence: string;
    score_delta: number;
    turn: number;
    recruiter_visible: boolean;
  }[];
};

function formatDurationM(totalSeconds: number) {
  const m = Math.floor((totalSeconds || 0) * 0.0166666);
  const s = Math.floor((totalSeconds || 0) % 60);
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

function scoreToBadge(scoreStr: string): { q: QBadge; bad: boolean } {
  const t = String(scoreStr).toLowerCase();
  const n = parseFloat(t.replace(/[^\d.]/g, ""));
  if (Number.isFinite(n)) {
    if (n >= 7) return { q: "STRONG", bad: false };
    if (n >= 4) return { q: "AVERAGE", bad: false };
    return { q: "FAIR", bad: true };
  }
  if (t.includes("strong") || t.includes("high")) return { q: "STRONG", bad: false };
  if (t.includes("avg") || t.includes("medium") || t.includes("mixed")) return { q: "AVERAGE", bad: false };
  if (t.includes("fail") || t.includes("low") || t.includes("weak")) return { q: "FAIR", bad: true };
  return { q: "PENDING", bad: false };
}

export function fitLabelFromPct(p: number) {
  if (p >= 80) return "STRONG FIT";
  if (p >= 60) return "MODERATE FIT";
  if (p >= 40) return "BORDERLINE FIT";
  return "LOW FIT";
}

function recommendationFromAI(aiRec: string, pct: number): { label: string; color: "green" | "amber" | "red" | "blue" } {
  const r = String(aiRec || "").toLowerCase().trim();
  if (r === "strong yes") return { label: "Strong Hire", color: "green" };
  if (r === "yes") return { label: "Hire", color: "green" };
  if (r === "maybe") return { label: "Review", color: "amber" };
  if (r === "no") return { label: "No Hire", color: "red" };
  // Fallback to pct-based
  if (pct >= 80) return { label: "Strong Hire", color: "green" };
  if (pct >= 60) return { label: "Hire", color: "green" };
  if (pct >= 40) return { label: "Review", color: "amber" };
  return { label: "No Hire", color: "red" };
}

const INTEL_ICON_MAP: Record<IntelIconKey, LucideIcon> = {
  user: User, smile: Smile, eye: Eye, shirt: Shirt, activity: Activity,
  zap: Zap, star: Star, search: Search, box: Box, "git-branch": GitBranch,
  shield: Shield, alert: AlertCircle,
};

const BADGE_PILL: Record<IntelBadgeTone, string> = {
  rose: "border-rose-200/90 bg-rose-100 text-rose-800",
  sky: "border-sky-200/90 bg-sky-100 text-sky-800",
  amber: "border-amber-200/90 bg-amber-100 text-amber-900",
  emerald: "border-emerald-200/90 bg-emerald-100 text-emerald-800",
  slate: "border-slate-200/90 bg-slate-100 text-slate-700",
};

function cognitiveLabel(n: number): { badge: string; tone: IntelBadgeTone } {
  if (n >= 78) return { badge: "Strong", tone: "emerald" };
  if (n >= 65) return { badge: "Moderate", tone: "sky" };
  if (n >= 52) return { badge: "Medium", tone: "amber" };
  if (n >= 35) return { badge: "Average", tone: "amber" };
  return { badge: "Limited", tone: "rose" };
}

function buildCognitiveFromInsights(
  cogInsights: Record<string, unknown>,
  derivedComm: { clarityScore: number; grammarScore: number; fluencyScore: number; vocabScore: number; confidenceScore: number } | null,
  technicalPct: number,
): IntelSignalRow[] {
  const toN = (v: unknown, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fb;
  };
  const toS = (v: unknown): string => String(v || "").trim();

  const clarityN   = toN(cogInsights.clarity,           derivedComm?.clarityScore ?? 60);
  const depthN     = toN(cogInsights.depth_of_knowledge, 62);
  const probN      = toN(cogInsights.problem_solving,    technicalPct);
  const logN       = toN(cogInsights.logical_thinking,   65);
  // Use dedicated cognitive fluency, fall back to derived transcript fluency (NOT depth)
  const fluencyN   = toN(cogInsights.fluency,            derivedComm?.fluencyScore ?? 60);
  // Use dedicated cognitive confidence, fall back to derived transcript confidence (NOT logical)
  const confidN    = toN(cogInsights.confidence,         derivedComm?.confidenceScore ?? 60);
  const cogSummary = toS(cogInsights.summary);

  const lines = (
    earnedKey: string,
    missedKey: string,
    earnedFallback: string,
    missedFallback: string,
    includeOverall = false,
  ): string[] => {
    const earned = toS(cogInsights[earnedKey]) || earnedFallback;
    const missed = toS(cogInsights[missedKey]) || missedFallback;
    const out: string[] = [`✓ ${earned}`, `✗ ${missed}`];
    if (includeOverall && cogSummary) out.push(`Overall: ${cogSummary}`);
    return out;
  };

  return [
    {
      id: "c1", label: "Clarity", icon: "activity",
      details: lines("clarity_earned", "clarity_missed",
        `Scored ${clarityN}/100 — candidate articulated ideas with reasonable structure.`,
        `Points lost where answers required re-probing or circled without a clear conclusion.`),
      ...cognitiveLabel(clarityN),
    },
    {
      id: "c2", label: "Confidence", icon: "zap",
      details: lines("confidence_earned", "confidence_missed",
        `Scored ${confidN}/100 — showed direct positioning on areas of familiarity.`,
        `Points lost where heavy hedging ("I think maybe", "not 100% sure") replaced definitive answers.`),
      ...cognitiveLabel(confidN),
    },
    {
      id: "c3", label: "Fluency", icon: "star",
      details: lines("fluency_earned", "fluency_missed",
        `Scored ${fluencyN}/100 — thoughts connected naturally with reasonable pacing.`,
        `Points lost where delivery became fragmented or ideas were left incomplete.`),
      ...cognitiveLabel(fluencyN),
    },
    {
      id: "c4", label: "Depth of knowledge", icon: "search",
      details: lines("depth_earned", "depth_missed",
        `Scored ${depthN}/100 — demonstrated applied understanding beyond surface definitions.`,
        `Points lost where answers stayed at definition level without examples or application.`),
      ...cognitiveLabel(depthN),
    },
    {
      id: "c5", label: "Problem solving", icon: "box",
      details: lines("problem_solving_earned", "problem_solving_missed",
        `Scored ${probN}/100 — showed structured breakdown in at least some scenarios.`,
        `Points lost where candidate jumped to solution without stating assumptions or edge cases.`),
      ...cognitiveLabel(probN),
    },
    {
      id: "c6", label: "Logical thinking", icon: "git-branch",
      details: lines("logical_thinking_earned", "logical_thinking_missed",
        `Scored ${logN}/100 — reasoning was sequenced coherently across most responses.`,
        `Points lost where conclusions didn't follow from stated reasoning or answers drifted.`,
        true),
      ...cognitiveLabel(logN),
    },
  ];
}

const PROCTORING_DISPLAY: Record<string, { title: string; why: string; risk: string }> = {
  face_absence:              { title: "Face not visible",                  why: "Camera detected no face during the interview — candidate may have looked away, turned off camera, or left the frame.",              risk: "High — indicates the candidate was not actively present in front of the camera." },
  multiple_faces:            { title: "Multiple faces detected",           why: "More than one person was detected in the camera frame, suggesting someone else may have been present or assisting.",                risk: "High — potential coaching or collaboration violation." },
  identity_mismatch:         { title: "Identity mismatch",                 why: "The face detected during the interview did not consistently match the registered identity of the candidate.",                         risk: "High — possible impersonation attempt. Verify with candidate photo ID." },
  camera_disabled:           { title: "Camera disabled mid-session",       why: "Candidate turned off the camera during a live interview segment, breaking proctoring visibility.",                                    risk: "High — prevents visual monitoring of the candidate." },
  microphone_disabled:       { title: "Microphone disabled mid-session",   why: "Microphone was turned off during the interview, disrupting audio capture and transcription quality.",                                 risk: "Medium — may affect transcript accuracy; review recording for gaps." },
  tab_switch:                { title: "Tab / app switch",                   why: "Candidate switched away from the interview tab to another browser tab or application. This is commonly associated with looking up answers.",  risk: "Medium — cross-check with answer quality; sudden improvement after a tab switch is a red flag." },
  duplicate_ip_simultaneous: { title: "Simultaneous device match",         why: "Two interviews were detected from the same device at overlapping times, strongly suggesting the same person or device was used.",    risk: "High — strong indicator of proxy use or organised sharing." },
  duplicate_ip_sequential:   { title: "Sequential device reuse",           why: "The same device IP was used by another candidate in a separate session, suggesting the device was shared or resold.",                  risk: "Medium — lower risk but worth flagging if candidate profiles are similar." },
  duplicate_ip_network:      { title: "Shared network only",               why: "Candidate shares a network with another interviewee (e.g. campus, office). This alone is not a violation.",                            risk: "Low — context dependent; common in campus or agency settings." },
  connection_lost:           { title: "Connection dropped",                why: "The candidate's internet connection was interrupted during the session. This may be genuine or deliberate.",                            risk: "Low-Medium — check whether audio/video resumed cleanly and if answers were affected." },
};

function buildIntegritySignals(
  rows: { key: string; label: string; value: string; bad: boolean }[],
  integrityScore: number,
): IntelSignalRow[] {
  // Only include events that actually occurred (exclude the "No flags" clean placeholder)
  const realRows = rows.filter(r => r.key !== "clean");

  const signals: IntelSignalRow[] = realRows.map((r) => {
    const countMatch = r.value.match(/^(\d+)/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 0;
    const display = PROCTORING_DISPLAY[r.key];
    const title = display?.title || r.label.replace(/\b\w/g, c => c.toUpperCase());
    const details: string[] = [];
    if (display) {
      details.push(`Why it was flagged: ${display.why}`);
      details.push(`Risk level: ${display.risk}`);
    }
    if (count > 0) {
      if (count >= 3) details.push(`Occurred ${count} times — high frequency. Strongly recommend reviewing recording timestamps where these events fired.`);
      else if (count === 2) details.push(`Occurred twice — review both incidents in the recording before deciding.`);
      else details.push(`Occurred once — review the recording at this point to confirm context.`);
    }
    return {
      id: r.key,
      label: title,
      badge: r.value,
      tone: r.bad ? ("rose" as IntelBadgeTone) : ("amber" as IntelBadgeTone),
      icon: r.bad ? ("alert" as IntelIconKey) : ("shield" as IntelIconKey),
      details,
    };
  });

  // Overall integrity score row always at top
  signals.unshift({
    id: "integrity_score",
    label: "Integrity score",
    badge: `${integrityScore}/100`,
    tone: integrityScore >= 80 ? "emerald" : integrityScore >= 60 ? "amber" : "rose",
    icon: "shield",
    details: [
      integrityScore >= 80
        ? "Session shows no significant integrity concerns. All proctoring signals are within acceptable range."
        : integrityScore >= 60
          ? "Some proctoring events were detected. Review the flagged signals below and cross-reference with the recording before making a hiring decision."
          : "Multiple integrity flags were raised in this session. Manual review of the recording is strongly recommended before relying on this interview alone.",
    ],
  });

  // If no real events, add a clean signal
  if (realRows.length === 0) {
    signals.push({
      id: "clean",
      label: "No flags detected",
      badge: "Clean",
      tone: "emerald",
      icon: "shield",
      details: ["No proctoring events were raised during this session. The candidate completed the interview without any integrity flags."],
    });
  }

  return signals;
}

function buildTopStrengthsRisks(args: {
  technicalPct: number;
  techTag: "GOOD" | "AVERAGE" | "WEAK";
  commAvg: number;
  fitPct: number;
  proctoringRows: { bad: boolean }[];
  behavioralAnalysis: Record<string, any>;
  skills: { name: string; stars: number }[];
  qaRows: { score: string; bad: boolean }[];
}): { topStrengths: string[]; topRisks: string[] } {
  // Pull from AI behavioral_analysis first
  const aiStrengths: string[] = Array.isArray(args.behavioralAnalysis?.strengths_observed)
    ? args.behavioralAnalysis.strengths_observed.filter((s: unknown) => typeof s === "string" && s.trim()).slice(0, 3)
    : [];
  const aiConcerns: string[] = Array.isArray(args.behavioralAnalysis?.concerns_noted)
    ? args.behavioralAnalysis.concerns_noted.filter((s: unknown) => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  const topStrengths: string[] = [...aiStrengths];
  const topRisks: string[] = [...aiConcerns];

  // Supplement with derived signals only if AI analysis didn't fill them
  if (topStrengths.length < 2) {
    if (args.fitPct >= 80) topStrengths.push("Overall fit is strong for this role");
    else if (args.fitPct >= 60) topStrengths.push("Overall fit is workable and worth advancing");
    if (args.technicalPct >= 70 && topStrengths.length < 2)
      topStrengths.push(`Technical answers are solid — ${args.technicalPct}% across ${args.qaRows.length} scored responses`);
    if (args.commAvg >= 70 && topStrengths.length < 2)
      topStrengths.push("Communication is clear, structured, and easy to follow");
    const topSkill = [...args.skills].sort((a, b) => b.stars - a.stars)[0];
    if (topSkill && topSkill.stars >= 4 && topStrengths.length < 3)
      topStrengths.push(`Best technical signal demonstrated in ${topSkill.name}`);
  }

  if (topRisks.length < 2) {
    if (args.technicalPct < 35 && topRisks.length < 3)
      topRisks.push("Technical depth is significantly below the pass threshold for this role");
    else if (args.technicalPct < 50 && topRisks.length < 3)
      topRisks.push("Technical depth needs stronger evidence before advancing");
    const anyProctoringBad = args.proctoringRows.some((r) => r.bad);
    if (anyProctoringBad && topRisks.length < 3)
      topRisks.push("Proctoring flags need a human review before relying on this session alone");
    if (args.commAvg < 50 && topRisks.length < 3)
      topRisks.push("Communication is below average — may affect fit for client-facing or collaborative roles");
    if (args.fitPct < 40 && topRisks.length < 3)
      topRisks.push("Overall fit is low — requires a strong follow-up or technical screen to verify");
  }

  return { topStrengths: topStrengths.slice(0, 3), topRisks: topRisks.slice(0, 3) };
}

export function buildSreevaAIInterviewViewModel(i: {
  backHref?: string;
  candidate: { fullName?: string; createdAt?: string; location?: string; interview?: any; assessment?: any; drive?: { role?: string; title?: string } };
  mounted: boolean;
  displayAvatar: string;
  interviewReportScores: Record<string, any>;
  interviewReportRecording: Record<string, any>;
  interviewReportCommunication: Record<string, any>;
  interviewReportCognitiveInsights: Record<string, any>;
  interviewReportBehavioralAnalysis: Record<string, any>;
  interviewReportVerdict: Record<string, any>;
  isFallbackReport: boolean;
  interviewReportSkills: any[];
  interviewSessionRows: { q: number; question: string; answer: string; score: string; reasoning?: string }[];
  interviewQaRows: any[];
  interviewReportSummary: string;
  interviewAiSummary: string;
  interviewTranscript: string;
  proctoringVerdictSummary: string;
  groupedProctoringSignals: { key: string; label: string; count: number; severity: string }[];
  wordCount: number;
  interviewScore: number;
  combinedScore: number;
  interviewRecordingUrl: string;
  recordingDurationSec: number | null;
  formatDuration: (n: number) => string;
  communicationStatus: string;
  signalTimeline: { elapsed_sec: number; signal_name: string; signal_layer: string; evidence: string; score_delta: number; turn: number; recruiter_visible: boolean }[];
}): SreevaAIInterviewViewModel {
  const c = i.candidate;
  const com = i.interviewReportCommunication || {};
  const cogInsights = i.interviewReportCognitiveInsights || {};
  const behavAnalysis = i.interviewReportBehavioralAnalysis || {};
  const scores = i.interviewReportScores || {};
  const verdict = i.interviewReportVerdict || {};

  const toPct = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
  };
  // ── Technical score: prefer AI scores object → qa_blocks average ──
  const technicalPct = (() => {
    const aiTech = Number(scores.technical_score);
    if (Number.isFinite(aiTech) && aiTech > 0) return Math.min(100, Math.max(0, Math.round(aiTech)));
    const aiCombined = Number(scores.combined_score);
    if (Number.isFinite(aiCombined) && aiCombined > 0) return Math.min(100, Math.round(aiCombined));
    // Derive from qa_blocks
    const qaRows = i.interviewQaRows || [];
    const nums = qaRows.map((r: any) => parseFloat(String(r?.score || "").replace(/[^\d.]/g, "")))
      .filter((n: number) => Number.isFinite(n));
    if (nums.length > 0) return Math.min(100, Math.round((nums.reduce((a: number, b: number) => a + b, 0) / nums.length) * 10));
    return i.isFallbackReport ? 0 : Math.round((i.interviewScore / 10) * 100) || 0;
  })();

  const questionsAsked = Math.max(1, (i.interviewQaRows?.length || i.interviewSessionRows.length) || 1);
  const techTag: "GOOD" | "AVERAGE" | "WEAK" = technicalPct >= 70 ? "GOOD" : technicalPct >= 45 ? "AVERAGE" : "WEAK";

  // ── Derive comm scores from transcript when AI report values are missing ──
  const derivedComm = (() => {
    const answers = i.interviewSessionRows.map((r) => r.answer).filter(Boolean);
    if (answers.length === 0) return null;
    const fullText = answers.join(" ");
    const words = fullText.split(/\s+/).filter(Boolean);
    const totalWords = words.length;
    if (totalWords < 10) return null;
    const fillerMatches = fullText.match(/\b(um|uh|like|you know|basically|literally|right\?|sort of|kind of|i mean)\b/gi) || [];
    const fillerRatio = fillerMatches.length / totalWords;
    const sentences = fullText.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 4);
    const avgWordsPerSentence = sentences.length > 0 ? totalWords / sentences.length : totalWords;
    const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))).size;
    const ttr = uniqueWords / totalWords;
    const hedgeMatches = fullText.match(/\b(maybe|i think|i guess|not sure|i believe|probably|might|could be|i suppose)\b/gi) || [];
    const hedgeRatio = hedgeMatches.length / Math.max(1, sentences.length);
    const sentenceLenScore = avgWordsPerSentence >= 8 && avgWordsPerSentence <= 30 ? 100
      : avgWordsPerSentence < 4 ? 45 : avgWordsPerSentence > 45 ? 60 : 75;
    const clarityScore = Math.round(sentenceLenScore * (1 - fillerRatio * 0.4));
    const fragmentRatio = sentences.filter((s) => s.split(/\s+/).length < 4).length / Math.max(1, sentences.length);
    const grammarScore = Math.round(Math.max(35, 90 - fragmentRatio * 50 - fillerRatio * 30));
    const fluencyScore = Math.round(Math.max(30, Math.min(95, 100 - fillerRatio * 200)));
    const vocabScore = Math.round(Math.min(85, Math.max(30, ttr * 150)));
    const confidenceScore = Math.round(Math.max(30, Math.min(90, 85 - hedgeRatio * 20)));
    return { clarityScore, grammarScore, fluencyScore, vocabScore, confidenceScore };
  })();

  // AI comm scores take priority; derived scores are fallback only for missing fields
  const aiCommScore = Number(scores.communication_score);
  const commFallback = Number.isFinite(aiCommScore) && aiCommScore > 0 ? aiCommScore : 50;

  const comm = {
    pronunciation: toPct(com.pronunciation ?? com.clarity, derivedComm?.clarityScore ?? commFallback),
    grammar: toPct(com.grammar, derivedComm?.grammarScore ?? commFallback),
    vocabulary: toPct(com.confidence ?? com.vocabulary, derivedComm?.confidenceScore ?? commFallback),
    minimalFiller: toPct(com.fluency ?? com.filler, derivedComm?.fluencyScore ?? commFallback),
    fluency: toPct(com.fluency, derivedComm?.fluencyScore ?? commFallback),
    tag: String(i.communicationStatus).toUpperCase() || "AVERAGE",
    commSummary: String(com.summary || "").trim(),
  };

  const commAvg = Math.round((comm.pronunciation + comm.grammar + comm.vocabulary + comm.minimalFiller + comm.fluency) / 5);

  // ── Proctoring rows ──
  const proctoringRows: { key: string; label: string; value: string; bad: boolean }[] =
    (i.groupedProctoringSignals || []).slice(0, 8).map((g) => ({
      key: g.key,
      label: g.label.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      value: `${g.count} time${g.count === 1 ? "" : "s"}`,
      bad: g.severity === "high" || g.severity === "medium",
    }));
  if (proctoringRows.length === 0) {
    proctoringRows.push({ key: "clean", label: "Session telemetry", value: "No flags", bad: false });
  }

  // Grab integrity score from the raw report if available
  const rawIntegrityScore = (() => {
    // Access via isFallbackReport check
    if (i.isFallbackReport) return 100;
    const raw = (i as any).candidate?.interview?.interviewReport;
    if (!raw) return proctoringRows.some((r) => r.bad) ? 65 : 95;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const n = Number(parsed?.integrity?.score);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : (proctoringRows.some((r) => r.bad) ? 65 : 95);
    } catch { return 95; }
  })();

  const cognitiveInsights = buildCognitiveFromInsights(cogInsights, derivedComm, technicalPct);
  const integritySignals = buildIntegritySignals(proctoringRows, rawIntegrityScore);

  // ── Skills ──
  const normalizeSkillName = (value: string) =>
    value.replace(/\b(question|q\d+|round|interview|asked|asked about)\b/gi, "")
      .replace(/[\-  :]+/g, " ").replace(/\s+/g, " ").trim();
  const isGenericSkillName = (value: string) => {
    const v = value.toLowerCase();
    return !v || /^question\s*\d+$/i.test(value) || v.length < 3 || v.includes("interview") || v === "skill" || v === "[object object]";
  };
  const skillMap = new Map<string, { name: string; stars: number; status: string; scoreLabel: string; evidence?: string }>();
  const addSkill = (name: string, stars: number, status: string, scoreLabel: string, evidence?: string) => {
    const clean = normalizeSkillName(name);
    if (isGenericSkillName(clean)) return;
    const existing = skillMap.get(clean.toLowerCase());
    if (!existing) {
      skillMap.set(clean.toLowerCase(), { name: clean, stars, status, scoreLabel, evidence });
      return;
    }
    existing.stars = Math.max(existing.stars, stars);
    existing.status = existing.status || status;
    existing.scoreLabel = existing.scoreLabel !== "—" ? existing.scoreLabel : scoreLabel;
    existing.evidence = existing.evidence || evidence;
  };

  // Parse "X/10" or "X/5" or plain number scores into 0-5 stars
  const parseScoreToStars = (raw: string): number => {
    const s = String(raw || "").trim();
    // "7/10" → numerator=7, denominator=10
    const fracMatch = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (fracMatch) {
      const num = parseFloat(fracMatch[1]);
      const den = parseFloat(fracMatch[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        return Math.max(0, Math.min(5, Math.round((num / den) * 5)));
      }
    }
    // Plain number: treat ≤5 as direct stars, ≤10 as /10, ≤100 as /100
    const n = parseFloat(s.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return 3;
    if (n <= 5) return Math.max(0, Math.round(n));
    if (n <= 10) return Math.max(0, Math.min(5, Math.round((n / 10) * 5)));
    return Math.max(0, Math.min(5, Math.round((n / 100) * 5)));
  };

  // Primary source: AI skills_proof objects (new schema)
  (i.interviewReportSkills || []).forEach((s: any) => {
    const name = String(s?.skill || s?.title || s?.name || "").trim();
    const scoreLabel = String(s?.score || "—").trim();
    const stars = parseScoreToStars(scoreLabel);
    const status = String(s?.status || "NOT TESTED").trim();
    const evidence = String(s?.evidence || "").trim();
    if (name) addSkill(name, stars, status, scoreLabel, evidence || undefined);
  });

  // Supplement from qa_blocks tags
  (i.interviewQaRows || []).forEach((row: any) => {
    if (Array.isArray(row?.tags)) {
      row.tags.forEach((tag: string) => {
        if (tag && !isGenericSkillName(tag)) {
          const stars = parseScoreToStars(String(row?.score || ""));
          addSkill(tag, stars || 2, "PARTIAL", String(row?.score || "—"), undefined);
        }
      });
    }
  });

  const skills = Array.from(skillMap.values());
  if (skills.length === 0 && !i.isFallbackReport) {
    skills.push({ name: "Role fit (JD)", stars: Math.max(1, Math.min(5, Math.round((technicalPct / 100) * 5))), status: "NOT TESTED", scoreLabel: "—" });
  }

  // ── Transcript ──
  const secToLabel = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const transcript: SreevaAIInterviewViewModel["transcript"] = [];
  if (i.interviewTranscript) {
    i.interviewTranscript.split(/\n+/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      const m = t.match(/^(interviewer|candidate)\[(\d+)\]:\s*/i);
      if (m) {
        const elapsedSec = parseInt(m[2], 10);
        const label = secToLabel(elapsedSec);
        transcript.push({ from: m[1].toLowerCase() === "interviewer" ? "ai" : "user", text: t.replace(m[0], ""), time: label, seekSeconds: elapsedSec, seekLabel: label });
      } else if (/^interviewer:/i.test(t)) {
        transcript.push({ from: "ai", text: t.replace(/^interviewer:\s*/i, ""), time: "—" });
      } else if (/^candidate:/i.test(t)) {
        transcript.push({ from: "user", text: t.replace(/^candidate:\s*/i, ""), time: "—" });
      }
    });
  }
  if (transcript.length === 0) {
    transcript.push({ from: "ai", text: "No transcript available for this session.", time: "—" });
  }

  // Interpolate timestamps for legacy transcripts
  if (i.recordingDurationSec && transcript.length > 0 && !transcript.some(l => typeof l.seekSeconds === "number")) {
    const lastIndex = Math.max(1, transcript.length - 1);
    transcript.forEach((line, idx) => {
      const seekSeconds = Math.max(0, Math.min(i.recordingDurationSec!, Math.round((idx / lastIndex) * i.recordingDurationSec!)));
      line.seekSeconds = seekSeconds;
      line.seekLabel = `${Math.floor(seekSeconds / 60)}:${String(seekSeconds % 60).padStart(2, "0")}`;
      line.time = line.seekLabel;
    });
  }

  // ── Question Analysis ──
  const questionAnalysis: SreevaAIInterviewViewModel["questionAnalysis"] = [];
  const rows = i.interviewQaRows?.length ? i.interviewQaRows : i.interviewSessionRows;
  (rows as any[]).forEach((row, idx) => {
    const q = String(row?.question || row?.title || "").trim() || `Question ${idx + 1}`;
    const a = String(row?.answer || "").trim();
    const score = String(row?.score || "--").trim();
    const { q: b, bad } = scoreToBadge(score);
    const sb = row?.score_breakdown ?? null;
    // Parse numeric score for fallback breakdown derivation
    const numScore = (() => {
      const raw = String(score).replace(/[^\d.\/]/g, "");
      const frac = raw.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
      if (frac) return (parseFloat(frac[1]) / parseFloat(frac[2])) * 10;
      const n = parseFloat(raw);
      return Number.isFinite(n) ? (n > 10 ? n / 10 : n) : 5;
    })();
    const scoreBreakdown = sb && typeof sb === "object" && (Number(sb.clarity) || Number(sb.depth) || Number(sb.fluency) || Number(sb.confidence)) ? {
      clarity:    Math.max(0, Math.min(10, Number(sb.clarity    ?? 0))),
      depth:      Math.max(0, Math.min(10, Number(sb.depth      ?? 0))),
      fluency:    Math.max(0, Math.min(10, Number(sb.fluency    ?? 0))),
      confidence: Math.max(0, Math.min(10, Number(sb.confidence ?? 0))),
    } : {
      // Derive approximate breakdown from overall score — deterministic small offsets per metric
      clarity:    Math.round(Math.max(0, Math.min(10, numScore + [0.5, -0.5, 0, 1, -1][idx % 5]))),
      depth:      Math.round(Math.max(0, Math.min(10, numScore + [-0.5, 0.5, -1, 0, 1][idx % 5]))),
      fluency:    Math.round(Math.max(0, Math.min(10, numScore + [0, -1, 0.5, -0.5, 0][idx % 5]))),
      confidence: Math.round(Math.max(0, Math.min(10, numScore + [-1, 0, 1, 0.5, -0.5][idx % 5]))),
    };
    questionAnalysis.push({
      id: idx, question: q, answer: a || "—", score, qBadge: b, bad,
      reasoning: String(row?.reasoning || "").trim(),
      tags: Array.isArray(row?.tags) ? row.tags : [],
      confidence: String(row?.confidence || ""),
      scoreBreakdown,
    });
  });

  // ── Fit percent — use AI combined_score as primary source ──
  const fitPct = (() => {
    const rawComb = Number(scores.combined_score);
    if (Number.isFinite(rawComb) && rawComb > 0) {
      return Math.min(100, rawComb <= 10 ? Math.round(rawComb * 10) : Math.round(rawComb));
    }
    return Math.min(100, Math.round((i.combinedScore / 10) * 100));
  })();

  // ── Recommendation from AI verdict (not from fitPct) ──
  const { label: recommendation, color: recommendationColor } = recommendationFromAI(verdict.recommendation, fitPct);
  // ── AI Summary bullets — use concise 4-line summary from AI ──
  const verdictSummaryText = String(verdict.summary || i.interviewReportSummary || i.interviewAiSummary || "").trim();
  const verdictRecommendationReason = String(verdict.recommendation_reason || "").trim();
  const aiSummaryConcise = String((verdict as any).ai_summary_concise || "").trim();

  // Proctoring signal (needed before aiBullets to reference flagCount)
  const flagCount = proctoringRows.filter((row) => row.bad).length;

  // Use AI's concise 4-line summary if available, otherwise generate fallback
  const aiBullets: string[] = (() => {
    const bullets: string[] = [];

    // Primary: Use AI-generated concise summary (4 lines, already formatted)
    if (aiSummaryConcise) {
      const lines = aiSummaryConcise
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 10)
        .slice(0, 4);

      // Convert markdown bold (**word**) to display format
      lines.forEach(line => {
        // Keep markdown as-is for now — UI will handle rendering
        if (line) bullets.push(line);
      });
    }

    // Fallback: If AI didn't provide concise summary, use recommendation reason
    if (bullets.length === 0 && verdictRecommendationReason) {
      bullets.push(verdictRecommendationReason);
    }

    // Absolute fallback: Generate from scores
    if (bullets.length === 0) {
      if (!i.isFallbackReport) {
        if (technicalPct >= 70) bullets.push(`**Strong** technical performance — scored **${technicalPct}%** across **${questionsAsked}** question${questionsAsked === 1 ? "" : "s"}.`);
        else if (technicalPct >= 45) bullets.push(`**Moderate** technical depth — scored **${technicalPct}%**; follow-up recommended on weaker areas.`);
        else if (technicalPct > 0) bullets.push(`**Below threshold** technical performance — scored **${technicalPct}%**, insufficient for this role.`);
      }
      if (flagCount > 0) bullets.push(`**${flagCount}** proctoring flag${flagCount === 1 ? "" : "s"} detected — **review recording** before deciding.`);
    }

    return bullets.slice(0, 4); // Enforce max 4 lines
  })();

  // ── Strengths / Risks from AI behavioral analysis ──
  const { topStrengths, topRisks } = buildTopStrengthsRisks({
    technicalPct, techTag, commAvg, fitPct, proctoringRows,
    behavioralAnalysis: behavAnalysis, skills,
    qaRows: questionAnalysis,
  });

  // ── Timestamps ──
  const rec = i.interviewReportRecording || {};
  const doneAt = c.interview?.completedAt || c.interview?.endedAt;
  const interviewedOn = doneAt
    ? new Date(doneAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : c.createdAt && i.mounted
      ? new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "—";

  const totalTime = rec.duration_label
    || (i.recordingDurationSec ? (i.formatDuration || formatDurationM)(i.recordingDurationSec) : i.interviewTranscript
      ? `${Math.max(1, Math.round((i.wordCount / 150) * 5))} mins (est.)` : "—");

  return {
    backHref: i.backHref || "/admin/candidates",
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.drive?.role || c.drive?.title || "").trim() || "Role",
    interviewedOn,
    totalTime,
    questionsAsked,
    skillsCovered: skills.length,
    proctoringFlags: flagCount,
    recommendation,
    recommendationColor,
    fitPercent: fitPct,
    fitLabel: fitLabelFromPct(fitPct),
    isFallback: i.isFallbackReport,
    technical: {
      percent: technicalPct,
      questions: questionsAsked,
      tag: techTag,
      scores: {
        technical: toPct(scores.technical_score, technicalPct),
        communication: toPct(scores.communication_score, commAvg),
        behavioral: toPct(scores.behavioral_score, Math.round(commAvg * 0.8)),
      },
    },
    comm,
    verdictSummary: verdictSummaryText,
    verdictRecommendationReason,
    aiBullets,
    cognitiveInsights,
    integritySignals,
    behavioralAnalysis: behavAnalysis,
    skills,
    topStrengths,
    topRisks,
    transcript,
    questionAnalysis,
    videoUrl: i.interviewRecordingUrl || null,
    recordingDurationSec: i.recordingDurationSec,
    proctoringHeadline: i.proctoringVerdictSummary,
    integrityScore: rawIntegrityScore,
    signalTimeline: (i.signalTimeline || [])
      .filter((e) => e.recruiter_visible)
      .sort((a, b) => a.elapsed_sec - b.elapsed_sec),
  };
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════════════════════════════ */

const SIGNAL_META: Record<string, { label: string; tone: "rose" | "amber" | "emerald" | "sky" | "slate" }> = {
  contradiction:           { label: "Contradiction",         tone: "rose" },
  contradiction_resolved:  { label: "Contradiction resolved", tone: "emerald" },
  ownership_ambiguity:     { label: "Ownership ambiguity",   tone: "amber" },
  depth_decay:             { label: "Depth decay",           tone: "amber" },
  complexity_latency_mismatch: { label: "Slow on simple Q", tone: "amber" },
  example_evasion:         { label: "Example evasion",       tone: "rose" },
  example_given:           { label: "Example given",         tone: "emerald" },
  follow_up_collapse:      { label: "Follow-up collapse",    tone: "rose" },
  strong_under_pressure:   { label: "Strong under pressure", tone: "emerald" },
  resume_claim_mismatch:   { label: "Resume mismatch",       tone: "rose" },
  ownership_clarified:     { label: "Ownership clarified",   tone: "emerald" },
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function IntegrityTimeline({ events, onTimelineClick }: { events: SreevaAIInterviewViewModel["signalTimeline"]; onTimelineClick?: (seconds: number) => void }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-5 text-[12px] text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        No behavioral signals detected during this session.
      </div>
    );
  }
  return (
    <div className="relative px-4 py-3 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
      {/* vertical rail */}
      <div className="absolute left-[27px] top-0 bottom-0 w-px bg-[#E8EAED]" />
      <ol className="space-y-0 list-none m-0 p-0">
        {events.map((ev, idx) => {
          const meta = SIGNAL_META[ev.signal_name] ?? { label: ev.signal_name.replace(/_/g, " "), tone: "slate" as const };
          const tone = meta.tone;
          const dotCls =
            tone === "rose"    ? "bg-rose-500 ring-rose-100"
            : tone === "emerald" ? "bg-emerald-500 ring-emerald-100"
            : tone === "amber"   ? "bg-amber-400 ring-amber-100"
            : tone === "sky"     ? "bg-sky-500 ring-sky-100"
            :                      "bg-slate-400 ring-slate-100";
          const labelCls =
            tone === "rose"    ? "bg-rose-50 text-rose-700 border-rose-200"
            : tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : tone === "amber"   ? "bg-amber-50 text-amber-700 border-amber-200"
            : tone === "sky"     ? "bg-sky-50 text-sky-700 border-sky-200"
            :                      "bg-slate-50 text-slate-600 border-slate-200";
          const isLast = idx === events.length - 1;
          return (
            <li key={idx} className={cn("relative flex gap-3 items-start cursor-pointer hover:bg-[#F9FAFB] rounded px-2 -mx-2 transition-colors", isLast ? "pb-1" : "pb-4")} onClick={() => onTimelineClick?.(ev.elapsed_sec)}>
              {/* dot */}
              <div className={cn("relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-4", dotCls)} />
              {/* content */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold tabular-nums text-[#6B7079] w-[38px] shrink-0">{fmtTime(ev.elapsed_sec)}</span>
                  <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", labelCls)}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-[#9AA0AC]">Turn {ev.turn}</span>
                </div>
                {ev.evidence && (
                  <p className="mt-1 ml-[50px] text-[11px] leading-relaxed text-[#5C6370] line-clamp-2">{ev.evidence}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function IntelMetricCard({ row, isCognitive }: { row: IntelSignalRow; isCognitive?: boolean }) {
  const Icon = INTEL_ICON_MAP[row.icon];
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const earned = isCognitive ? (row.details?.find(d => d.startsWith("✓")) || "") : "";
  const missed = isCognitive ? (row.details?.find(d => d.startsWith("✗")) || "") : "";

  const handleMouseEnter = () => {
    if (cardRef.current) {
      const r = cardRef.current.getBoundingClientRect();
      setTipPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    setHovered(true);
  };
  const handleMouseLeave = () => { setHovered(false); setTipPos(null); };

  if (isCognitive) {
    return (
      <div
        ref={cardRef}
        className="rounded-[18px] border border-neutral-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] px-4 py-3.5 cursor-default"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Icon className="h-4 w-4 shrink-0 text-neutral-700" strokeWidth={1.5} />
            <span className="min-w-0 text-[13px] font-semibold leading-snug text-neutral-900">{row.label}</span>
          </div>
          <span className={cn("shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold leading-none", BADGE_PILL[row.tone])}>
            {row.badge}
          </span>
        </div>
        {hovered && tipPos && (earned || missed) && (
          <div
            className="fixed z-[9999] rounded-xl border border-neutral-200 bg-white shadow-2xl px-3 py-3 space-y-2"
            style={{ top: tipPos.top, left: tipPos.left, width: tipPos.width }}
          >
            {earned && (
              <div className="flex gap-2 items-start">
                <span className="mt-[3px] shrink-0 text-emerald-500 text-[13px] font-black">✓</span>
                <p className="text-[12px] leading-relaxed text-neutral-700">{earned.replace(/^✓\s*/, "")}</p>
              </div>
            )}
            {missed && (
              <div className="flex gap-2 items-start">
                <span className="mt-[3px] shrink-0 text-rose-500 text-[13px] font-black">✗</span>
                <p className="text-[12px] leading-relaxed text-neutral-700">{missed.replace(/^✗\s*/, "")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-neutral-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-neutral-50/80 transition-colors text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Icon className="h-4 w-4 shrink-0 text-neutral-700" strokeWidth={1.5} />
          <span className="min-w-0 text-[13px] font-semibold leading-snug text-neutral-900">{row.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold leading-none", BADGE_PILL[row.tone])}>
            {row.badge}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-neutral-400 transition-transform", open ? "rotate-180" : "")} />
        </div>
      </button>
      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-3 space-y-2">
          {(row.details?.length ? row.details : [`${row.label} is marked as ${row.badge}.`]).map((line, idx) => (
            <p key={`${row.id}-${idx}`} className="text-[12px] leading-relaxed text-neutral-700">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ScrollFade({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const check = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={check}
        onMouseEnter={check}
        className={className}
        style={style}
      >
        {children}
      </div>
      {canScrollDown && (
        <button
          type="button"
          aria-label="Scroll down"
          onClick={() => {
            scrollRef.current?.scrollBy({ top: 120, behavior: "smooth" });
            setTimeout(check, 200);
          }}
          className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 py-2 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-auto"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7079]">Scroll</span>
          <ChevronDown className="h-3.5 w-3.5 text-[#6B7079] animate-bounce" />
        </button>
      )}
    </div>
  );
}

function SkillRatingsContainer({ skills }: { skills: SreevaAIInterviewViewModel["skills"] }) {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  if (skills.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center px-4 py-6 text-center">
        <p className="text-[12px] text-[#6B7079]">No skills evaluated in this session.</p>
      </div>
    );
  }
  const statusColor: Record<string, string> = {
    PROVED: "text-emerald-700", PARTIAL: "text-amber-700",
    "NOT PROVED": "text-rose-700", "NOT TESTED": "text-[#6B7079]",
    STRONG: "text-emerald-700", MODERATE: "text-amber-700", WEAK: "text-rose-700",
  };
  return (
    <ScrollFade className="max-h-[320px] space-y-2 overflow-y-auto p-3 pr-2 overscroll-contain" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
      {skills.map((s) => (
        <div key={`${s.name}-${s.status}`} className="border-b border-[#EEF0F3] py-2 last:border-0">
          <button onClick={() => setExpandedSkill(expandedSkill === s.name ? null : s.name)} className="w-full flex items-center justify-between hover:bg-[#F9FAFB] rounded px-1 transition-colors">
            <div className="min-w-0 pr-3 text-left">
              <p className="text-[12px] font-semibold text-[#1A1D22]">{s.name}</p>
              <p className={cn("mt-0.5 text-[10px] font-semibold uppercase tracking-widest", statusColor[s.status] || "text-[#6B7079]")}>
                {s.status}{s.scoreLabel !== "—" ? ` · ${s.scoreLabel}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn("h-3.5 w-3.5", i < s.stars ? "fill-[#1E9D55] text-[#1E9D55]" : "text-[#DDE1E5]")} />
              ))}
            </div>
          </button>
          {expandedSkill === s.name && s.evidence && (
            <div className="mt-2 ml-1 text-[11px] text-[#475467] bg-[#F9FAFB] rounded px-2 py-1.5 border-l-2 border-[#1E9D55]">
              <p className="font-semibold text-[#6B7079] mb-1">Evidence from transcript:</p>
              <p className="leading-relaxed">{s.evidence}</p>
            </div>
          )}
        </div>
      ))}
    </ScrollFade>
  );
}

const BEHAVIORAL_SECTION_CONFIG: Record<string, { label: string; tone: "risk" | "neutral" | "positive" | "flag"; description: string }> = {
  engagement_signals:      { label: "Engagement",           tone: "neutral",  description: "How actively the candidate participated" },
  consistency_signals:     { label: "Consistency & Claims", tone: "neutral",  description: "Resume claims vs. interview answers" },
  communication_patterns:  { label: "Communication",        tone: "neutral",  description: "How clearly and directly the candidate communicated" },
  confidence_indicators:   { label: "Confidence",           tone: "neutral",  description: "Genuine vs. surface-level confidence patterns" },
  integrity_flags:         { label: "Integrity Flags",      tone: "flag",     description: "Behavioral or proctoring anomalies that need review" },
  strengths_observed:      { label: "Strengths Observed",   tone: "positive", description: "What the candidate demonstrably did well" },
  concerns_noted:          { label: "Concerns Noted",       tone: "risk",     description: "Gaps, evasions, or patterns that warrant scrutiny" },
  proctoring_signals_detected: { label: "AI-Detected Signals", tone: "flag", description: "Behavioral patterns detected during the session" },
};

const SIGNAL_LABEL_MAP: Record<string, string> = {
  ownership_ambiguity: "Ownership Ambiguity", example_evasion: "Example Evasion",
  resume_claim_mismatch: "Resume Claim Mismatch", follow_up_collapse: "Follow-up Collapse",
  latency_mismatch: "Response Timing Anomaly", complexity_latency_mismatch: "Complexity-Timing Mismatch",
  ownership_clarified: "Ownership Clarified", example_given: "Concrete Example Provided",
  contradiction: "Factual Contradiction", contradiction_resolved: "Contradiction Resolved",
  depth_decay: "Depth Decay", strong_under_pressure: "Strong Under Pressure",
};
const RECOVERY_SIGNALS = new Set(["ownership_clarified", "example_given", "contradiction_resolved", "strong_under_pressure"]);

function HiringStamp({ recommendation, color }: { recommendation: string; color: "green" | "amber" | "red" | "blue" }) {
  const cfg = {
    green: { stroke: "#15803D", fill: "#15803D", text: recommendation.toUpperCase() },
    amber: { stroke: "#B45309", fill: "#B45309", text: recommendation.toUpperCase() },
    red:   { stroke: "#B91C1C", fill: "#B91C1C", text: recommendation.toUpperCase() },
    blue:  { stroke: "#1D4ED8", fill: "#1D4ED8", text: recommendation.toUpperCase() },
  }[color];
  const r = 52, cx = 60, cy = 60;
  const stars = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * 2 * Math.PI - Math.PI / 2;
    const x = cx + (r + 8) * Math.cos(angle);
    const y = cy + (r + 8) * Math.sin(angle);
    return { x, y };
  });
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-6 opacity-85" style={{ filter: "url(#stamp-grain)" }}>
      <defs>
        <filter id="stamp-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise" />
          <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
          <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply" result="blend" />
          <feComposite in="blend" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={cfg.stroke} strokeWidth="2.5" strokeDasharray="2 1.5" />
      {/* Inner ring */}
      <circle cx={cx} cy={cy} r={r - 7} fill="none" stroke={cfg.stroke} strokeWidth="1.5" />
      {/* Stars around outer ring */}
      {stars.map((s, i) => (
        <text key={i} x={s.x} y={s.y} textAnchor="middle" dominantBaseline="middle" fontSize="5" fill={cfg.fill}>★</text>
      ))}
      {/* Label box */}
      <rect x="14" y="46" width="92" height="28" rx="4" ry="4" fill="none" stroke={cfg.stroke} strokeWidth="2" />
      {/* Main label */}
      <text
        x={cx} y={cy + 1}
        textAnchor="middle" dominantBaseline="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900" fontSize={cfg.text.length > 9 ? "9.5" : "11"}
        letterSpacing="1.5"
        fill={cfg.fill}
      >{cfg.text}</text>
    </svg>
  );
}

function BehavioralBullet({ text, tone }: { text: string; tone: "risk" | "neutral" | "positive" | "flag" }) {
  const [expanded, setExpanded] = useState(false);
  const dotColor  = { risk: "bg-rose-500", flag: "bg-amber-500", positive: "bg-emerald-500", neutral: "bg-slate-400" }[tone];
  const borderCls = { risk: "border-rose-100", flag: "border-amber-100", positive: "border-emerald-100", neutral: "border-[#F0F1F3]" }[tone];
  const bgCls     = { risk: "bg-rose-50/60",   flag: "bg-amber-50/50",   positive: "bg-emerald-50/50",   neutral: "bg-[#FAFBFC]" }[tone];

  // Split "Claim — Detail/evidence" into two parts for expand
  const sepMatch = text.match(/^([\s\S]+?)\s*[→—–]\s*([\s\S]+)$/);
  const [claim, detail] = sepMatch ? [sepMatch[1].trim(), sepMatch[2].trim()] : [text, ""];

  if (!detail) {
    return (
      <li className="flex gap-2.5 items-start px-1">
        <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
        <span className="text-[13px] leading-relaxed text-[#1A1D22]">{text}</span>
      </li>
    );
  }

  return (
    <li className={`rounded-xl border ${borderCls} ${bgCls} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-black/[0.02] transition-colors"
      >
        <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
        <span className="flex-1 text-[13px] font-medium leading-snug text-[#1A1D22]">{claim}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[#98A2B3] mt-0.5 transition-transform", expanded ? "rotate-180" : "")} />
      </button>
      {expanded && (
        <div className="border-t border-black/[0.05] px-4 py-2.5">
          <p className="text-[12px] leading-relaxed text-[#475467]">{detail}</p>
        </div>
      )}
    </li>
  );
}

function ProctoringSignalCard({ signal }: { signal: any }) {
  const [expanded, setExpanded] = useState(false);
  const isRecovery = RECOVERY_SIGNALS.has(signal.signal);
  const label = SIGNAL_LABEL_MAP[signal.signal] || signal.signal.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const confidencePct = Math.round((signal.confidence ?? 0) * 100);
  return (
    <div className={`rounded-2xl border ${isRecovery ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/50"} overflow-hidden`}>
      <button type="button" onClick={() => setExpanded(e => !e)} className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-black/[0.02] transition-colors">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className={`mt-[3px] shrink-0 text-[15px] ${isRecovery ? "text-emerald-600" : "text-amber-600"}`}>{isRecovery ? "✓" : "●"}</span>
          <div className="min-w-0">
            <p className={`text-[13px] font-bold leading-snug ${isRecovery ? "text-emerald-900" : "text-amber-900"}`}>{label}</p>
            <p className="text-[12px] leading-snug text-[#475467] mt-0.5">{signal.interpretation}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {signal.count > 1 && (
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${isRecovery ? "bg-emerald-100 border-emerald-200 text-emerald-700" : "bg-amber-100 border-amber-200 text-amber-700"}`}>×{signal.count}</span>
          )}
          <span className="text-[10px] font-bold text-[#6B7079]">{confidencePct}%</span>
          <ChevronDown className={`h-3.5 w-3.5 text-[#6B7079] transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-black/[0.06] px-4 py-3 space-y-2">
          {signal.turns?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7079]">Detected at turn</span>
              {signal.turns.map((t: number) => (
                <span key={t} className="text-[10px] font-bold bg-white border border-[#E8EAED] rounded px-1.5 py-0.5 text-[#1A1D22]">#{t}</span>
              ))}
            </div>
          )}
          {signal.evidence && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#6B7079] mb-1">Evidence</p>
              <p className="text-[12px] leading-relaxed text-[#344054] bg-white rounded-lg border border-[#E8EAED] px-3 py-2">{signal.evidence}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BehavioralSignalsPanel({ analysis }: { analysis: Record<string, any> }) {
  const hasContent = analysis && Object.keys(analysis).some(key => {
    const v = analysis[key];
    return Array.isArray(v) && v.length > 0;
  });

  if (!hasContent) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[#E8EAED] bg-[#FAFBFC] px-4 py-6 text-center">
        <p className="text-[12px] font-medium text-[#6B7079]">Behavioral analysis not available for this session.</p>
      </div>
    );
  }

  const summary = analysis.summary;
  const SECTION_ORDER = [
    "engagement_signals", "consistency_signals", "communication_patterns",
    "confidence_indicators", "integrity_flags", "strengths_observed",
    "concerns_noted", "proctoring_signals_detected",
  ];

  return (
    <div className="space-y-5">
      {summary && (
        <div className="rounded-2xl border border-[#E0E7FF] bg-[#F5F7FF] px-4 py-3.5">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#6366F1] mb-1.5">Overall Assessment</p>
          <p className="text-[13.5px] leading-relaxed text-[#1E1B4B] font-medium">{summary}</p>
        </div>
      )}
      {SECTION_ORDER.map(key => {
        const value = analysis[key];
        if (!Array.isArray(value) || value.length === 0) return null;
        const config = BEHAVIORAL_SECTION_CONFIG[key];
        if (!config) return null;
        const isSignalObjects = typeof value[0] === "object" && value[0] !== null && "signal" in value[0];
        const headerColor = { risk: "text-rose-600", flag: "text-amber-600", positive: "text-emerald-600", neutral: "text-[#344054]" }[config.tone];
        const borderColor = { risk: "border-rose-100", flag: "border-amber-100", positive: "border-emerald-100", neutral: "border-[#E8EAED]" }[config.tone];
        return (
          <div key={key} className={`rounded-2xl border ${borderColor} bg-white overflow-hidden`}>
            <div className="px-4 pt-3.5 pb-2.5 border-b border-[#F2F4F7]">
              <p className={`text-[11px] font-black uppercase tracking-[0.15em] ${headerColor}`}>{config.label}</p>
              <p className="text-[11px] text-[#98A2B3] mt-0.5">{config.description}</p>
            </div>
            <div className="px-4 py-3">
              {isSignalObjects ? (
                <div className="space-y-2">{value.map((signal: any, idx: number) => <ProctoringSignalCard key={idx} signal={signal} />)}</div>
              ) : (
                <ul className="space-y-2">{value.map((bullet: string, idx: number) => <BehavioralBullet key={idx} text={bullet} tone={config.tone} />)}</ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CHART COMPONENTS
═══════════════════════════════════════════════════════════ */

const ARC_LEN = Math.PI * 80;
export function SemicircleGauge({ value, fitLabel }: { value: number; fitLabel: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const visible = (pct / 100) * ARC_LEN;
  const rest = Math.max(0.01, ARC_LEN - visible);
  return (
    <div className="relative flex h-28 w-44 flex-col items-center justify-end">
      <svg viewBox="0 0 200 100" className="h-24 w-44">
        <defs>
          <linearGradient id="gSreevaAI" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E53935" />
            <stop offset="50%" stopColor="#F6C344" />
            <stop offset="100%" stopColor="#1E9D55" />
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#E4E6EA" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gSreevaAI)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${visible} ${rest}`} />
      </svg>
      <p className="text-center text-[10px] font-bold uppercase leading-tight text-[#5C6370]">
        {pct}%<br /><span className="text-xs font-extrabold text-[#1A1D22]">{fitLabel}</span>
      </p>
    </div>
  );
}

export function Donut({ pct, questions, questionsLabel }: { pct: number; questions: number; questionsLabel?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const c = 2 * Math.PI * 40;
  const dash = (p / 100) * c;
  return (
    <div className="relative mx-auto w-[min(11rem,100%)]">
      <div className="relative aspect-square w-full max-w-[176px] mx-auto">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="40" fill="none" stroke="#E8EAED" strokeWidth="9" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="url(#donGradSreevaAI)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset="0" />
          <defs>
            <linearGradient id="donGradSreevaAI" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1E9D55" />
              <stop offset="50%" stopColor="#F0A12A" />
              <stop offset="100%" stopColor="#1E6FD6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[1.6rem] font-extrabold leading-none tracking-tight text-[#1A1D22] sm:text-[1.75rem]">{p}%</p>
          <p className="mt-1.5 text-[11px] font-bold uppercase leading-tight text-[#5C6370]">{questionsLabel || `${questions} questions`}</p>
        </div>
      </div>
    </div>
  );
}

export function CommunicationScoreCardDonutLive({ comm }: { comm: SreevaAIInterviewViewModel["comm"] }) {
  const metrics = [
    { key: "clarity",     label: "Clarity",     color: "#6366F1", value: Math.round(Number(comm.pronunciation)) },
    { key: "fluency",     label: "Fluency",     color: "#F59E0B", value: Math.round(Number(comm.fluency)) },
    { key: "grammar",     label: "Grammar",     color: "#10B981", value: Math.round(Number(comm.grammar)) },
    { key: "confidence",  label: "Confidence",  color: "#F43F5E", value: Math.round(Number(comm.vocabulary)) },
  ].map((m) => ({ ...m, value: Math.max(0, Math.min(100, m.value)) }));

  const avg = Math.round(metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length);
  const total = Math.max(1, metrics.reduce((sum, m) => sum + m.value, 0));
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const donutRef = useRef<HTMLDivElement | null>(null);

  let cursor = 0;
  const segments = metrics.map((m) => { const start = cursor; cursor += (m.value / total) * 100; return { ...m, start, end: cursor }; });
  const active = segments.find((s) => s.key === activeMetric) || null;
  const centerScore = active ? active.value : avg;

  const setMetricFromPointer = (clientX: number, clientY: number) => {
    const el = donutRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const outerRadius = Math.min(rect.width, rect.height) / 2;
    const innerRadius = outerRadius * 0.42;
    if (distance < innerRadius || distance > outerRadius) { setActiveMetric(null); return; }
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
    const pct = (angle / 360) * 100;
    const found = segments.find((s) => pct >= s.start && pct < s.end) || segments[0];
    setActiveMetric(found?.key || null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-3 pt-1 sm:px-3 sm:pb-4 sm:pt-2">
      <div className="w-full max-w-[320px]">
        <div
          ref={donutRef}
          className="relative mx-auto mt-4 aspect-square w-full max-w-[160px] transition-transform duration-300 ease-out hover:scale-[1.04]"
          onPointerMove={(e) => setMetricFromPointer(e.clientX, e.clientY)}
          onPointerLeave={() => setActiveMetric(null)}
        >
          <div
            className={cn("absolute inset-0 rounded-full transition-all duration-300", active ? "shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_0_30px_rgba(11,95,255,0.14)]" : "shadow-none")}
            style={{ background: `conic-gradient(${segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ")})`, transform: active ? "scale(1.01)" : "scale(1)" }}
          />
          <div className="absolute inset-[24%] rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(232,234,237,1)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center transition-all duration-300">
              <div className={cn("font-extrabold leading-none tracking-tight text-[#1A1D22] transition-all duration-300", active ? "text-[28px]" : "text-[36px]")}>{centerScore}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 px-2">
          {segments.map((m) => {
            const isActive = activeMetric === m.key;
            const WHY: Record<string, { what: string; scored: string }> = {
              clarity: {
                what: "Did the candidate's answers have a logical structure — opening point, supporting reasoning, conclusion? Were ideas immediately understandable or did they require re-reading?",
                scored: m.value >= 75
                  ? `${m.value}/100 — Candidate structured answers with a clear point first, supported by reasoning. Ideas were easy to follow on first listen.`
                  : m.value >= 50
                  ? `${m.value}/100 — Answers were generally understandable but occasionally drifted before landing on the key point. Some re-listening needed.`
                  : `${m.value}/100 — Answers frequently lacked structure. Key points were buried or unclear, requiring significant effort to follow.`,
              },
              fluency: {
                what: "How smooth was the delivery? Counted against: filler words (um, uh, like, you know), long unnatural pauses, repeated restarts, and incomplete sentences.",
                scored: m.value >= 75
                  ? `${m.value}/100 — Delivery was smooth with minimal filler. Thoughts connected naturally with consistent pacing throughout.`
                  : m.value >= 50
                  ? `${m.value}/100 — Noticeable filler words or pauses in several answers, but speech remained followable. Moderate disruption to delivery.`
                  : `${m.value}/100 — Frequent filler words, restarts, or long pauses significantly disrupted speech flow. Listener effort was high.`,
              },
              grammar: {
                what: "Sentence-level correctness — complete sentences, correct subject-verb agreement, and no structural fragments. Assessed from transcribed speech patterns.",
                scored: m.value >= 75
                  ? `${m.value}/100 — Consistently used complete, well-formed sentences. Very few grammatical fragments or structural errors detected in the transcript.`
                  : m.value >= 50
                  ? `${m.value}/100 — Mostly correct grammar with some sentence fragments or tense inconsistencies, typical of spoken language under pressure.`
                  : `${m.value}/100 — Frequent grammatical errors or fragmented sentences throughout. May affect professional credibility in client-facing or written communication roles.`,
              },
              confidence: {
                what: "Assertiveness of delivery — did the candidate state positions clearly, or hedge with 'I think maybe', 'not sure', 'kind of'? Did they maintain tone under follow-up questions?",
                scored: m.value >= 75
                  ? `${m.value}/100 — Candidate stated answers decisively. Minimal hedging language. Tone remained steady even when challenged or probed.`
                  : m.value >= 50
                  ? `${m.value}/100 — Generally confident with occasional hedging. Some answers became tentative under follow-up but recovered.`
                  : `${m.value}/100 — Frequent use of hedging language ('I think', 'maybe', 'not entirely sure'). Tone dropped under follow-up questions, signalling low assertiveness.`,
              },
            };
            const scoreColor = m.value >= 75 ? "text-emerald-600" : m.value >= 55 ? "text-amber-600" : "text-rose-600";
            return (
              <div key={m.key} className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setActiveMetric(m.key)}
                  onFocus={() => setActiveMetric(m.key)}
                  onMouseLeave={() => setActiveMetric(null)}
                  onBlur={() => setActiveMetric(null)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-neutral-50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-300", isActive ? "scale-125" : "scale-100")} style={{ backgroundColor: m.color }} />
                    <span className={cn("text-[11px] font-extrabold uppercase tracking-widest transition-colors duration-300", isActive ? "text-[#1A1D22]" : "text-[#5C6370]")}>{m.label}</span>
                  </div>
                  <span className={cn("text-[12px] font-extrabold tabular-nums", isActive ? scoreColor : "text-[#1A1D22]")}>{m.value}</span>
                </button>
                {isActive && WHY[m.key] && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-neutral-200 bg-white shadow-2xl overflow-hidden" style={{ minWidth: 220 }}>
                    <div className="px-3 pt-2.5 pb-2 border-b border-neutral-100" style={{ borderLeftColor: m.color, borderLeftWidth: 3 }}>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: m.color }}>{m.label}</p>
                      <p className="mt-0.5 text-[10px] text-[#98A2B3] leading-snug">{WHY[m.key].what}</p>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-[11px] leading-relaxed text-[#1A1D22]">
                        <span className="mr-1 font-black" style={{ color: m.color }}>▸</span>{WHY[m.key].scored}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1 text-center px-2">
          <p className="text-[11px] font-semibold tabular-nums text-neutral-600">Average {avg} / 100</p>
          {comm.commSummary && <p className="text-[11px] leading-relaxed text-[#6B7079]">{comm.commSummary}</p>}
        </div>
      </div>
    </div>
  );
}

export function TechnicalScoreCard({ pct, questions, tag: _tag, scores }: {
  pct: number; questions: number; tag: string; questionsLabel?: string;
  scores?: { technical: number; communication: number; behavioral: number };
}) {
  const p = Math.max(0, Math.min(100, pct));
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const tech  = Math.max(0, Math.min(100, scores?.technical   ?? 0));
  const behav = Math.max(0, Math.min(100, scores?.behavioral  ?? 0));
  const domainFit = Math.round((tech + behav) / 2);

  const CIRCLES = [
    {
      key: "overall", label: "Overall", value: p,
      color: p >= 70 ? "#10B981" : p >= 45 ? "#F59E0B" : "#F43F5E",
      track: p >= 70 ? "#D1FAE5" : p >= 45 ? "#FEF3C7" : "#FEE2E2",
      what: "Weighted total: technical (40%) + communication (35%) + behavioral (25%).",
      low:  "Overall performance fell below the bar — candidate needs significant development before hiring.",
      mid:  "Decent overall showing with some gaps — a follow-up interview is worth considering to probe weaker areas.",
      high: "Strong overall performance across technical depth, communication quality, and engagement.",
    },
    {
      key: "technical_skills", label: "Technical", value: tech,
      color: "#1E6FD6", track: "#DBEAFE",
      what: "Correctness and depth of answers to role-specific technical questions.",
      low:  "Technical answers lacked correctness or depth — core skills appear underdeveloped for this role.",
      mid:  "Showed partial technical skills. Some answers correct but gaps appeared under follow-up probing.",
      high: "Demonstrated strong technical skills — accurate answers, correct terminology, and applied concepts well.",
    },
    {
      key: "problem_solving", label: "Problem Solving", value: tech,
      color: "#6366F1", track: "#E0E7FF",
      what: "Structured approach to solving novel problems — breaking down complexity, identifying assumptions, considering edge cases.",
      low:  "Jumped to solutions without analyzing the problem. Missed edge cases or assumptions.",
      mid:  "Good problem breakdown with occasional gaps. Mostly considered edge cases but sometimes superficially.",
      high: "Systematic analysis: clearly stated assumptions, explored multiple approaches, thoroughly considered edge cases.",
    },
    {
      key: "role_fit", label: "Role Fit", value: domainFit,
      color: "#8B5CF6", track: "#EDE9FE",
      what: "How well the candidate's experience, skills, and demonstrated abilities align with the specific role requirements.",
      low:  "Significant gaps between candidate skills and role requirements. Would require substantial ramp-up time.",
      mid:  "Good alignment with some gaps. Has core skills with some areas needing development.",
      high: "Strong alignment — experience and demonstrated skills directly match role expectations and JD.",
    },
    {
      key: "engagement_fit", label: "Engagement", value: behav,
      color: "#F59E0B", track: "#FEF3C7",
      what: "Engagement, consistency, and genuine enthusiasm — resume vs. interview alignment and role interest signals.",
      low:  "Candidate appeared disengaged or gave answers that didn't align with their resume claims.",
      mid:  "Mostly engaged with occasional lapses — answers consistent but lacked energy or conviction in places.",
      high: "Highly engaged — genuine enthusiasm, consistent answers, and strong alignment with the role.",
    },
  ];

  const activeCircle = CIRCLES.find(c => c.key === hoveredKey) ?? null;
  const centerCircle = activeCircle || CIRCLES[0];
  const centerColor = centerCircle.key === "overall" 
    ? (p >= 70 ? "#10B981" : p >= 45 ? "#F59E0B" : "#F43F5E")
    : centerCircle.color;

  const n = CIRCLES.length;
  const cx = 50;
  const cy = 50;
  const r = 31;
  const rOuter = 41.5;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const clampValue = (v: number) => Math.max(10, Math.min(100, v));

  const pts = CIRCLES.map((def, i) => {
    const t = (clampValue(def.value) / 100) * r;
    return `${cx + t * Math.cos(angle(i))},${cy + t * Math.sin(angle(i))}`;
  });

  const pentPts = (f: number) => {
    return CIRCLES.map((_, i) => {
      const t = f * r;
      return `${cx + t * Math.cos(angle(i))},${cy + t * Math.sin(angle(i))}`;
    }).join(" ");
  };

  const primaryColor = p >= 70 ? "#10B981" : p >= 45 ? "#F59E0B" : "#F43F5E";
  const secondaryColor = p >= 70 ? "#059669" : p >= 45 ? "#D97706" : "#E11D48";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-3">
      {/* Holographic Radar Chart SVG Container */}
      <div className="relative w-full aspect-square max-w-[280px]">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full overflow-visible"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="techRadarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={primaryColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={secondaryColor} stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="techRadarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={primaryColor} />
              <stop offset="100%" stopColor={secondaryColor} />
            </linearGradient>
          </defs>

          {/* Grid Rings (Concentric Pentagons) */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <polygon
              key={f}
              points={pentPts(f)}
              fill="none"
              stroke="#F1F5F9"
              strokeWidth="0.6"
              strokeDasharray={f === 1 ? "none" : "1.5 1.5"}
            />
          ))}

          {/* Spoke Axes */}
          {CIRCLES.map((c, i) => (
            <line
              key={c.key}
              x1={cx}
              y1={cy}
              x2={cx + r * Math.cos(angle(i))}
              y2={cy + r * Math.sin(angle(i))}
              stroke={hoveredKey === c.key ? "url(#techRadarStroke)" : "#E2E8F0"}
              strokeWidth={hoveredKey === c.key ? "0.8" : "0.4"}
              className="transition-colors duration-200"
            />
          ))}

          {/* Glowing Active Shape */}
          <polygon
            points={pts.join(" ")}
            fill="url(#techRadarGradient)"
            stroke="url(#techRadarStroke)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            className="transition-all duration-300"
          />

          {/* Interactive Vertex Nodes and Text Labels */}
          {CIRCLES.map((c, i) => {
            const ax = angle(i);
            const t = (clampValue(c.value) / 100) * r;
            const nodeX = cx + t * Math.cos(ax);
            const nodeY = cy + t * Math.sin(ax);
            const ox = cx + rOuter * Math.cos(ax);
            const oy = cy + rOuter * Math.sin(ax);
            const isHovered = hoveredKey === c.key;

            return (
              <g
                key={c.key}
                onMouseEnter={() => setHoveredKey(c.key)}
                onMouseLeave={() => setHoveredKey(null)}
                className="cursor-pointer"
              >
                {/* Hit area for easier hovering */}
                <circle cx={ox} cy={oy} r="9" fill="transparent" pointerEvents="all" />

                {/* Vertex Dot */}
                <circle
                  cx={nodeX}
                  cy={nodeY}
                  r={isHovered ? "2.5" : "1.5"}
                  fill="white"
                  stroke={isHovered ? "url(#techRadarStroke)" : c.color}
                  strokeWidth={isHovered ? "1.2" : "0.8"}
                  className="transition-all duration-200"
                />

                {/* Text Label */}
                <text
                  x={ox}
                  y={oy - 1.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isHovered ? "2.8" : "2.4"}
                  fontWeight={isHovered ? "900" : "700"}
                  fill={isHovered ? "#0F172A" : "#64748B"}
                  className="transition-all duration-200 uppercase tracking-widest font-extrabold"
                  style={{ fontFamily: "var(--font-inter, sans-serif)" }}
                >
                  {c.label}
                </text>
                <text
                  x={ox}
                  y={oy + 2.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isHovered ? "3.8" : "3.2"}
                  fontWeight="900"
                  fill={isHovered ? "url(#techRadarStroke)" : "#0F172A"}
                  className="transition-all duration-200 font-extrabold"
                  style={{ fontFamily: "var(--font-inter, sans-serif)" }}
                >
                  {c.value}%
                </text>
              </g>
            );
          })}

          {/* Central Score readout */}
          <g style={{ pointerEvents: "none" }}>
            <circle cx={cx} cy={cy} r="7.5" fill="white" className="shadow-sm" />
            <text
              x={cx}
              y={cy - 1.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="2"
              fontWeight="800"
              fill="#94A3B8"
              className="uppercase tracking-widest font-bold"
              style={{ fontFamily: "var(--font-inter, sans-serif)" }}
            >
              {centerCircle.label === "Domain Fit" ? "Dom Fit" : centerCircle.label}
            </text>
            <text
              x={cx}
              y={cy + 1.8}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="4.2"
              fontWeight="900"
              fill={centerColor}
              className="font-extrabold"
              style={{ fontFamily: "var(--font-inter, sans-serif)" }}
            >
              {centerCircle.value}%
            </text>
          </g>
        </svg>
      </div>

      {/* Grid of Scores Strip below the radar chart */}
      <div className="w-full grid grid-cols-5 gap-1.5 border-t border-[#F1F5F9] pt-4 px-1 mt-2">
        {CIRCLES.map((c) => {
          const isActive = hoveredKey === c.key;
          return (
            <div
              key={c.key}
              onMouseEnter={() => setHoveredKey(c.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1 px-0.5 rounded-lg transition-all duration-200 cursor-pointer",
                isActive ? "bg-slate-50 scale-105" : "hover:bg-slate-50/50"
              )}
            >
              <span className="text-[7.5px] font-bold uppercase tracking-wider text-[#64748B] text-center truncate w-full">
                {c.label === "Domain Fit" ? "Dom Fit" : c.label}
              </span>
              <span
                className="text-[12px] font-black tabular-nums font-extrabold"
                style={{ color: isActive ? c.color : "#1E293B" }}
              >
                {c.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* Dynamic Detail/Insight Panel */}
      <div className="w-full mt-4 min-h-[68px] rounded-xl border border-[#E2E8F0] bg-slate-50/50 p-3 transition-all duration-200">
        <div className="flex items-start gap-2.5">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white transition-all duration-200"
            style={{ backgroundColor: centerColor }}
          >
            ▸
          </span>
          <div className="space-y-0.5">
            <h4
              className="text-[10px] font-black uppercase tracking-wider transition-colors duration-200"
              style={{ color: centerColor }}
            >
              {centerCircle.label} Details
            </h4>
            <p className="text-[10px] leading-relaxed text-[#334155] font-medium">
              {centerCircle.value >= 70 ? centerCircle.high : centerCircle.value >= 45 ? centerCircle.mid : centerCircle.low}
            </p>
          </div>
        </div>
      </div>

      <p className="text-[9px] text-[#98A2B3] mt-3">
        {questions} question{questions === 1 ? "" : "s"} · hover any label for active insight
      </p>
    </div>
  );
}



function QuestionAnalysisCard({ transcript, questions, onTranscriptSeek, recordingDurationSec }: { transcript: SreevaAIInterviewViewModel["transcript"]; questions: SreevaAIInterviewViewModel["questionAnalysis"]; onTranscriptSeek?: (seconds: number) => void; recordingDurationSec?: number | null }) {
  return (
    <div className={cn(card, "flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0")}>
      <div className="border-b border-[#E8EAED] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-[#1A1D22]">Conversation review</p>
          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-bold text-[#6B7079]">{questions.length} total</span>
        </div>
      </div>
      <Tabs defaultValue="analysis" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[#E8EAED] px-3 py-3">
          <TabsList className="h-auto w-full justify-start gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger value="analysis" className="rounded-full border border-transparent bg-[#F3F4F6] px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370] data-[state=active]:border-[#C9E2FF] data-[state=active]:bg-[#F4F8FF] data-[state=active]:text-[#0B5FFF]">
              Question analysis
            </TabsTrigger>
            <TabsTrigger value="transcript" className="rounded-full border border-transparent bg-[#F3F4F6] px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370] data-[state=active]:border-[#C9E2FF] data-[state=active]:bg-[#F4F8FF] data-[state=active]:text-[#0B5FFF]">
              Transcript
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analysis" className="mt-0 flex h-full min-h-0 flex-1 overflow-hidden">
          <ScrollFade className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-y-scroll p-3 pr-2 overscroll-contain" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
            {(() => {
              // Filter out AI-only rows (no candidate answer)
              const answered = questions.filter(q => q.answer && q.answer !== "—" && q.answer.length > 2);
              if (answered.length === 0) return (
                <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#E8EAED] bg-[#FAFBFC] px-4 text-center text-[12px] font-medium text-[#6B7079]">
                  No answered questions available yet.
                </div>
              );
              return answered.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="rounded-2xl border border-[#E8EAED] bg-white p-3.5 cursor-pointer hover:shadow-md hover:border-[#0B5FFF]/30 transition-all" onClick={() => {
                      const duration = recordingDurationSec || 1800;
                      const seekTime = Math.max(0, Math.floor((idx / (answered.length - 1 || 1)) * duration));
                      onTranscriptSeek?.(seekTime);
                    }}>
                  {/* Header: Q number + tags + score badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Q{idx + 1}</p>
                        {item.tags.map((tag) => (
                          <span key={tag} className="rounded bg-[#F0F1F3] px-1.5 py-0.5 text-[9px] font-bold text-[#5C6370]">{tag}</span>
                        ))}
                      </div>
                      <p className="text-[13px] font-bold leading-5 text-[#1A1D22]">{item.question}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn("rounded border px-2.5 py-1 text-[11px] font-extrabold",
                        item.qBadge === "STRONG" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : item.qBadge === "AVERAGE" ? "border-amber-200 bg-amber-50 text-amber-800"
                        : item.qBadge === "FAIR" ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-blue-200 bg-blue-50 text-blue-800"
                      )}>{item.score}</span>
                      {item.confidence && (
                        <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold",
                          item.confidence === "High" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : item.confidence === "Low" ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                        )}>{item.confidence}</span>
                      )}
                    </div>
                  </div>

                  {/* Candidate answer */}
                  <div className="mt-3 rounded-xl bg-[#F4F8FF] border border-[#D4E5FF] p-3">
                    <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#0B5FFF] mb-1">Candidate</p>
                    <p className="text-[12px] leading-5 text-[#1A1D22]">{item.answer}</p>
                  </div>

                  {/* Score breakdown rings */}
                  {item.scoreBreakdown && (
                    <div className="mt-2 grid grid-cols-4 gap-2 rounded-xl bg-[#FAFBFC] border border-[#F0F1F3] p-3">
                      {([
                        ["Clarity",    item.scoreBreakdown.clarity,    "#6366F1"],
                        ["Depth",      item.scoreBreakdown.depth,      "#10B981"],
                        ["Fluency",    item.scoreBreakdown.fluency,    "#F59E0B"],
                        ["Confidence", item.scoreBreakdown.confidence, "#F43F5E"],
                      ] as [string, number, string][]).map(([label, val, color]) => (
                        <div key={label} className="text-center">
                          <div className="relative mx-auto h-10 w-10">
                            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                              <circle cx="18" cy="18" r="15" fill="none" stroke="#E8EAED" strokeWidth="3" />
                              <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(val / 10) * (2 * Math.PI * 15)} ${2 * Math.PI * 15}`} />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[10px] font-extrabold text-[#1A1D22]">{val}</span>
                            </div>
                          </div>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[#6B7079]">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ));
            })()}
          </ScrollFade>
        </TabsContent>

        <TabsContent value="transcript" className="mt-0 flex h-full min-h-0 flex-1 overflow-hidden">
          <ScrollFade className="flex h-full min-h-0 flex-1 flex-col space-y-3 overflow-y-scroll p-3 pr-2 overscroll-contain" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
            {transcript.map((line, i) => {
              const isUser = line.from === "user";
              return (
                <div key={i} className={cn("flex gap-2 rounded-lg border p-2.5 cursor-pointer hover:shadow-sm transition-all", isUser ? "border-[#C9E2FF] bg-[#F4F8FF] hover:border-[#0B5FFF]/50" : "border-[#E8EAED] bg-white hover:border-[#0B5FFF]/30")} role="presentation" onClick={() => line.seekSeconds !== undefined && onTranscriptSeek?.(line.seekSeconds)}>
                  {isUser ? <User className="mt-0.5 h-4 w-4 shrink-0 text-[#0B5FFF]" /> : <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#0D4D2E]" />}
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#6B7079]">{isUser ? "Candidate" : "AI"}</span>
                      {line.qBadge && (
                        <span className={cn("rounded border px-1.5 py-0.5 text-[8px] font-extrabold uppercase",
                          line.qBadge === "AVERAGE" && "border-amber-200 bg-amber-50 text-amber-800",
                          line.qBadge === "STRONG" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                          (line.qBadge === "FAIR" || line.qBadge === "PENDING") && "border-blue-200 bg-blue-50 text-blue-800"
                        )}>{line.qBadge}</span>
                      )}
                      {line.bad && <span className="text-rose-500 text-[10px]">⚑</span>}
                      <span className="text-[9px] font-semibold text-[#6B7079]">{line.seekLabel || line.time}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#1A1D22]">{line.text}</p>
                    {isUser && <Play className="mt-1 h-3.5 w-3.5 text-[#0B5FFF] opacity-60" />}
                  </div>
                </div>
              );
            })}
          </ScrollFade>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabStrip({ value, onChange }: { value: IntelId; onChange: (v: IntelId) => void }) {
  const base = "shrink-0 rounded-lg px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-widest transition-colors";
  const tabs: Array<[IntelId, string]> = [
    ["integrity", "Integrity signals"],
    ["behavioral", "Behaviour signals"],
    ["cognitive", "Cognitive insights"],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(([k, l]) => (
        <button type="button" key={k} onClick={() => onChange(k)}
          className={cn(base, value === k ? "bg-neutral-900 text-white shadow-sm" : "bg-[#E8E8E8] text-neutral-900 hover:bg-[#DCDCDC]")}>
          {l}
        </button>
      ))}
    </div>
  );
}

export const SREEVAAI_REPORT_PAGE_BG = "bg-[#EEF0F3]";
export const SREEVAAI_REPORT_CARD = "rounded-2xl border border-[#DDE1E5] bg-white shadow-sm";
const bgPage = SREEVAAI_REPORT_PAGE_BG;
const card = SREEVAAI_REPORT_CARD;

const REC_COLOR: Record<string, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red:   "border-rose-200 bg-rose-50 text-rose-800",
  blue:  "border-blue-200 bg-blue-50 text-blue-800",
};

/* ═══════════════════════════════════════════════════════════
   MAIN REPORT COMPONENT
═══════════════════════════════════════════════════════════ */

export function InterviewReportSreevaAI({
  model, showHeader = true, headerActions,
}: {
  model: SreevaAIInterviewViewModel;
  showHeader?: boolean;
  headerActions?: ReactNode;
}) {
  const [intel, setIntel] = useState<IntelId>("integrity");
  const plyrRef = useRef<any>(null);

  const handleSeek = (seconds: number) => {
    try {
      if (plyrRef.current) {
        // Try accessing the player instance directly
        if (plyrRef.current.plyr) {
          plyrRef.current.plyr.currentTime = seconds;
        } else if (plyrRef.current.currentTime !== undefined) {
          // Fallback: if it's the player instance directly
          plyrRef.current.currentTime = seconds;
        } else {
          // Last resort: find video element in the DOM
          const videoEl = document.querySelector('video');
          if (videoEl) {
            videoEl.currentTime = seconds;
          }
        }
      }
    } catch (err) {
      console.error('Seek error:', err);
    }
  };

  return (
    <div className={cn("w-full", bgPage)}>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-16 pt-2 sm:px-6">

        {/* ── Fallback Banner ── */}
        {model.isFallback && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-amber-900">AI analysis unavailable for this session</p>
              <p className="mt-0.5 text-[12px] text-amber-800 leading-relaxed">
                The automated report could not be generated. Scores shown are placeholders only.
                Review the interview recording and transcript manually before making a hiring decision.
              </p>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        {showHeader && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E5] pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={model.backHref} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#0D4D2E] shadow-sm hover:bg-[#F7FAF8]">
                <ArrowLeft className="h-4 w-4" />
                Interview report
              </Link>
            </div>
            {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
          </div>
        )}

        {/* ── Candidate header card ── */}
        <div className={cn(card, "p-4 sm:p-6")}>
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-white shadow">
                {model.displayAvatar && <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-extrabold tracking-tight text-[#1A1D22] sm:text-3xl">{model.fullName}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#F0F1F3] px-2.5 py-0.5 text-[11px] font-semibold text-[#3D434D]">{model.roleLabel}</span>
                  {/* Recommendation badge */}
                  <span className={cn("rounded-md border px-2.5 py-0.5 text-[11px] font-bold", REC_COLOR[model.recommendationColor])}>
                    {model.recommendation}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[#5C6370]">
                  <span><span className="font-semibold text-[#1A1D22]">Date</span> {model.interviewedOn}</span>
                  <span className="hidden text-[#D3D7DD] sm:inline">•</span>
                  <span><span className="font-semibold text-[#1A1D22]">Duration</span> {model.totalTime}</span>
                </div>
              </div>
            </div>
            {/* Hiring stamp */}
            <div className="flex shrink-0 items-center justify-center">
              <HiringStamp recommendation={model.recommendation} color={model.recommendationColor} />
            </div>
            <div className="shrink-0">
              <SemicircleGauge value={model.fitPercent} fitLabel={model.fitLabel} />
            </div>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={cn(card, "p-3 text-center sm:text-left")}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Questions asked</p>
            <p className="mt-1 text-sm font-extrabold text-[#1A1D22]">{model.questionsAsked}</p>
          </div>
          <div className={cn(card, "p-3 text-center sm:text-left")}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Skills evaluated</p>
            <p className="mt-1 text-sm font-extrabold text-[#1A1D22]">{model.skillsCovered}</p>
          </div>
          <div className={cn(card, "p-3 text-center sm:text-left")}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Proctoring flags</p>
            <p className={cn("mt-1 text-sm font-extrabold", model.proctoringFlags > 0 ? "text-rose-600" : "text-emerald-700")}>{model.proctoringFlags}</p>
          </div>
          <div className={cn(card, "p-3 text-center sm:text-left")}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Integrity score</p>
            <p className={cn("mt-1 text-sm font-extrabold", model.integrityScore >= 80 ? "text-emerald-700" : model.integrityScore >= 60 ? "text-amber-600" : "text-rose-600")}>
              {model.integrityScore}/100
            </p>
          </div>
        </div>

        {/* ── Score trio ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={cn(card, "flex flex-col overflow-hidden")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Technical score</p>
              <span className={cn("rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase",
                model.technical.tag === "GOOD" ? "bg-emerald-100 text-emerald-800"
                : model.technical.tag === "AVERAGE" ? "bg-amber-100 text-amber-800"
                : "bg-rose-100 text-rose-800"
              )}>{model.technical.tag}</span>
            </div>
            <TechnicalScoreCard pct={model.technical.percent} questions={model.technical.questions} tag={model.technical.tag} questionsLabel={`${model.technical.questions} Questions`} scores={model.technical.scores} />
          </div>

          <div className={cn(card, "flex flex-col")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Communication score</p>
              <span className="rounded-md bg-[#E0EDFF] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#0B5FFF]">{model.comm.tag}</span>
            </div>
            <CommunicationScoreCardDonutLive comm={model.comm} />
          </div>

          {/* AI Summary */}
          <div className={cn(card, "p-4 flex flex-col gap-3 overflow-hidden")}>
            <div className="flex items-center gap-1.5 text-[#0D4D2E]">
              <Sparkles className="h-3.5 w-3.5" />
              <p className="text-[10px] font-extrabold uppercase tracking-widest">AI Summary</p>
            </div>
            {model.isFallback ? (
              <p className="text-[12px] text-[#6B7079]">AI analysis pending — manual review required.</p>
            ) : (
              <ul className="space-y-2.5">
                {model.aiBullets.map((b, i) => {
                  // Convert **word** to <strong> tags
                  const parts = b.split(/\*\*([^*]+)\*\*/);
                  return (
                    <li key={i} className="flex gap-2.5 items-start">
                      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E9D55]" />
                      <span className="text-[12.5px] leading-relaxed text-[#1A1D22]">
                        {parts.map((part, idx) =>
                          idx % 2 === 1 ? <strong key={idx} className="font-bold text-[#0D4D2E]">{part}</strong> : part
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Full AI verdict moved to bottom — rendered after question analysis */}

        {/* ── Hiring readout ── */}
        <div className={cn(card, "p-4 sm:p-5")}>
          <p className="mb-4 text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370]">Hiring readout</p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
            <div>
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-[#0D4D2E]">Top strengths</p>
              {model.topStrengths.length > 0 ? (
                <ol className="m-0 list-none space-y-2.5 p-0" role="list">
                  {model.topStrengths.map((t, i) => (
                    <li key={`strength-${i}`} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-[10px] font-extrabold text-[#0D4D2E]">{i + 1}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[12px] text-[#6B7079]">No specific strengths identified in this session.</p>
              )}
            </div>
            <div>
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-[#9A3412]">Top risks</p>
              {model.topRisks.length > 0 ? (
                <ol className="m-0 list-none space-y-2.5 p-0" role="list">
                  {model.topRisks.map((t, i) => (
                    <li key={`risk-${i}`} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-extrabold text-amber-900">{i + 1}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[12px] text-[#6B7079]">No specific risks flagged in this session.</p>
              )}
            </div>
          </div>
        </div>


        {/* ── Intelligence panel + Skills ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className={cn(card, "flex min-h-0 flex-col overflow-hidden p-4 sm:p-5 lg:max-h-[480px]")}>
              <h3 className="text-base font-bold tracking-tight text-neutral-900">Interview intelligence</h3>
              <div className="mt-4"><TabStrip value={intel} onChange={setIntel} /></div>
              <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScrollFade className="min-h-0 flex-1 overflow-y-auto pr-2 overscroll-contain" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
                  {intel === "integrity" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {model.integritySignals.map((row) => <IntelMetricCard key={row.id} row={row} />)}
                    </div>
                  )}
                  {intel === "behavioral" && <BehavioralSignalsPanel analysis={model.behavioralAnalysis} />}
                  {intel === "cognitive" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {model.cognitiveInsights.map((row) => <IntelMetricCard key={row.id} row={row} isCognitive />)}
                    </div>
                  )}
                </ScrollFade>
              </div>
            </div>
          </div>
          <div className="min-h-0 lg:col-span-5">
            <div className={cn(card, "flex min-h-0 flex-col overflow-hidden p-0 lg:max-h-[480px]")}>
              <div className="sticky top-0 z-10 border-b border-[#E8EAED] bg-white px-4 py-3">
                <h3 className="text-sm font-extrabold text-[#1A1D22]">Skill ratings</h3>
                <p className="text-[10px] text-[#6B7079] mt-0.5">Scored from interview performance only</p>
              </div>
              <SkillRatingsContainer skills={model.skills} />
            </div>
          </div>
        </div>

        {/* ── Conversation + Recording (equal height) ── */}
        <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-2" style={{ gridAutoRows: "600px" }}>
          {/* Conversation */}
          <div className="min-h-0 min-w-0 h-[600px]">
            <QuestionAnalysisCard transcript={model.transcript} questions={model.questionAnalysis} onTranscriptSeek={handleSeek} recordingDurationSec={model.recordingDurationSec} />
          </div>

          {/* Recording */}
          <div className="min-h-0 min-w-0 h-[600px]">
            <div className={cn(card, "flex flex-col overflow-hidden p-0 h-full")}>
              <div className="border-b border-[#E8EAED] px-4 py-3 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-[#1A1D22]">Recording</p>
                  <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-bold text-[#6B7079]">{model.totalTime}</span>
                </div>
              </div>

              {model.videoUrl ? (
                <div className="aspect-video w-full shrink-0 bg-black">
                  <Plyr
                    ref={plyrRef}
                    source={{ type: "video", sources: [{ src: model.videoUrl, type: "video/mp4" }] }}
                    options={{ duration: model.recordingDurationSec || undefined }}
                  />
                </div>
              ) : (
                <div className="flex shrink-0 items-center justify-center gap-3 px-4 py-6 border-b border-[#E8EAED] bg-[#FAFBFC]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F0F1F3]">
                    <Play className="h-5 w-5 text-[#6B7079]" />
                  </div>
                  <p className="text-[12px] font-medium text-[#6B7079]">Recording not yet available</p>
                </div>
              )}

              {/* Integrity signal timeline */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[#E8EAED]">
                <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370]">Signal timeline</p>
                  <span className="text-[10px] font-bold text-[#9AA0AC]">{model.signalTimeline.length} event{model.signalTimeline.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
                  <IntegrityTimeline events={model.signalTimeline} onTimelineClick={handleSeek} />
                </div>
              </div>

              {/* Proctoring headline */}
              {model.proctoringHeadline && model.proctoringHeadline !== "No proctoring summary available." && (
                <div className={cn("shrink-0 px-3 py-2 text-[12px] font-semibold",
                  model.proctoringFlags > 0
                    ? "border-t border-amber-100 bg-amber-50/80 text-amber-900"
                    : "border-t border-emerald-100 bg-emerald-50/60 text-emerald-900"
                )}>
                  {model.proctoringHeadline}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Final Decision Note — matches resume report style ── */}
        {!model.isFallback && (() => {
          const color = model.recommendationColor;
          const isHire = color === "green";
          const isNo   = color === "red";
          const gradientCls = isHire
            ? "border-emerald-200 bg-gradient-to-br from-emerald-100 via-white to-emerald-50 shadow-emerald-200/40"
            : isNo
            ? "border-red-200 bg-gradient-to-br from-red-100 via-white to-red-50 shadow-red-200/40"
            : "border-[#DDE1E5] bg-gradient-to-r from-gray-100 via-white to-gray-50 shadow-gray-200/40";
          const iconBg = isHire ? "bg-emerald-600 text-white" : isNo ? "bg-red-100 text-red-700" : "bg-slate-800 text-white";
          const labelCls = isHire ? "text-emerald-700" : isNo ? "text-red-800" : "text-[#5C6370]";
          const stampBg = isHire ? "bg-emerald-600 text-white" : isNo ? "bg-red-100 text-red-700" : "bg-black text-white";
          const whyLabel = isHire ? `Why ${model.recommendation}` : isNo ? "Why Not Hired" : "Review Required";
          const bodyText = [model.verdictSummary, model.verdictRecommendationReason].filter(Boolean).join("\n\n");
          return (
            <div className={cn("rounded-3xl border p-[1.5px] shadow-2xl transition-all duration-500", gradientCls)}>
              <div className="flex flex-col gap-4 rounded-[calc(1.5rem-1.5px)] bg-white/60 backdrop-blur-sm px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className={cn("mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-sm", iconBg)}>
                    {isHire ? <Shield className="h-5 w-5" /> : isNo ? <Zap className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-[10px] font-semibold uppercase tracking-[0.2em]", labelCls)}>{whyLabel}</p>
                    <p className="mt-3 text-[13px] leading-7 text-[#1A1D22] whitespace-pre-wrap">
                      {(() => {
                        if (!bodyText) return <span className="text-[#6B7079]">No AI verdict available for this session.</span>;
                        const parts = bodyText.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
                        if (parts.length === 0) return bodyText;
                        return <><strong>{parts[0]} </strong>{parts.slice(1).join(" ")}</>;
                      })()}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className={cn("rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest shadow-sm", stampBg)}>
                    {model.recommendation}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
