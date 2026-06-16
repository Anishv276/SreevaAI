"use client";

import { useEffect, useRef, useState, forwardRef, type ReactNode } from "react";

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

const Plyr = dynamic(
  () => import("plyr-react").then((m) => {
    const Wrapper = forwardRef<any, any>((props, ref) => {
      const PlyrComponent = m.Plyr as any;
      return (
        <div suppressHydrationWarning>
          <PlyrComponent ref={ref} {...props} />
        </div>
      );
    });
    Wrapper.displayName = "DynamicPlyrWrapper";
    return Wrapper;
  }),
  { ssr: false }
);

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

type IntelId = "raw_signals" | "signal_analysis";
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
  technical: { percent: number; questions: number; tag: "GOOD" | "AVERAGE" | "WEAK"; scores?: { overall: number; engagement: number; communication: number; domain_knowledge: number; role_fit: number; problem_solving: number; ownership_credibility: number; demonstrated_knowledge: number; technical: number; dimensions: { name: string; score: number; evidence: string }[] } };
  comm: { pronunciation: number; grammar: number; fluency: number; confidence: number; vocabulary: number; minimalFiller: number; tag: string; commSummary: string; hasNewSchema: boolean };
  verdictSummary: string;
  verdictRecommendationReason: string;
  aiBullets: string[];
  integritySignals: IntelSignalRow[];
  signalAnalysis: Record<string, any>;
  skills: { name: string; stars: number; status: string; scoreLabel: string; whatShowed?: string; whatMissing?: string }[];
  topStrengths: string[];
  topRisks: string[];
  transcript: { from: "ai" | "user"; text: string; time?: string; qBadge?: QBadge; bad?: boolean; seekSeconds?: number; seekLabel?: string }[];
  questionAnalysis: {
    id: number; question: string; answer: string; score: string; qBadge: QBadge; bad: boolean;
    reasoning: string; tags: string[]; confidence: string;
    scoreBreakdown: { clarity: number; depth: number; technical_accuracy: number; practical_application: number } | null;
  }[];
  videoUrl: string | null;
  videoMimeType: string | null;
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
  proctoringEventsFull: { time: string; eventType: string; reason: string; severity: string; elapsedSeconds: number }[];
  answerScores: { question: string; answer: string; depth: number; clarity: number; specificity: number; grounding: number; overall: number; signals: string[] }[];
};

function formatDurationM(totalSeconds: number) {
  const m = Math.floor((totalSeconds || 0) * 0.0166666);
  const s = Math.floor((totalSeconds || 0) % 60);
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

function inferVideoMimeType(url: string, mimeType?: string | null): string {
  const explicit = String(mimeType || "").trim().toLowerCase();
  if (explicit === "video/webm" || explicit === "video/mp4") return explicit;
  const normalized = String(url || "").toLowerCase();
  if (normalized.includes(".webm")) return "video/webm";
  if (normalized.includes(".mp4")) return "video/mp4";
  // Recording pipeline defaults to webm chunks/merge output.
  return "video/webm";
}

function normalizeAiPunctuation(s: string): string {
  return String(s || "")
    .replace(/\u00e2\u20ac\u201d|\u2014|\u00e2\u20ac\u201c|\u2013/g, ", ")
    .replace(/\u00e2\u20ac\u0153|\u201c/g, '"')
    .replace(/\u00e2\u20ac\u009d|\u201d/g, '"')
    .replace(/\u00e2\u20ac\u2122|\u2019/g, "'")
    .replace(/\u00e2\u20ac\u00a2|\u2022/g, "- ")
    .replace(/\u00c3\u00d7|\u00d7/g, "x")
    .replace(/\u00ef\u00bc\u009a|\u00ef\u00bc\u009a/g, ":")
    .replace(/\u00c2\u00b7|\u00b7/g, "-")
    .replace(/\u00e2\u2020\u2019/g, "'")
    .replace(/\u00e2\u20ac\u201a/g, ",")
    .replace(/\u00e2\u20ac\u00a6/g, "...")
    .replace(/\u00c2/g, "");
}

function cleanAiText(s: string): string {
  return normalizeAiPunctuation(s)
    .replace(/\*{1,2}/g, "")
    .replace(/^[\s\u2022\-\+]+/g, "")
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Parse an AI bullet like "[Title] - [Evidence] - [Why it matters for role]"
// into { title, description } for the two-line card format
function parseBulletCard(raw: string): { title: string; description: string } {
  if (!raw) return { title: "", description: "" };
  // Strip leading bullet markers
  const clean = normalizeAiPunctuation(raw).replace(/^[\u2022\-\*]\s*/, "").trim();
  // Split on em/en dash separators
  const parts = clean.split(/\s*[\u2014\u2013]\s*/);
  if (parts.length >= 2) {
    const title = parts[0].trim();
    // Join remaining parts as the description, strip leading risk level label
    const desc = parts.slice(1).join(" \u2014 ")
      .replace(/^\s*(Low|Medium|High)\s+risk[^.]*\.\s*/i, "")
      .trim();
    return { title, description: desc };
  }
  // No dash separator - treat whole thing as description, derive short title
  const sentences = clean.split(/\.\s+/);
  return { title: sentences[0]?.trim() || clean, description: sentences.slice(1).join(". ").trim() };
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




const PROCTORING_DISPLAY: Record<string, { title: string; why: string; risk: string }> = {
  face_absence: { title: "Face not visible", why: "Camera detected no face during the interview. The candidate may have looked away, turned off the camera, or left the frame.", risk: "High - indicates the candidate was not actively present in front of the camera." },
  multiple_faces: { title: "Multiple faces detected", why: "More than one person was detected in the camera frame, suggesting someone else may have been present or assisting.", risk: "High - potential coaching or collaboration violation." },
  identity_mismatch: { title: "Identity mismatch", why: "The face detected during the interview did not consistently match the registered identity of the candidate.", risk: "High - possible impersonation attempt. Verify with candidate photo ID." },
  camera_disabled: { title: "Camera disabled mid-session", why: "The candidate turned off the camera during a live interview segment, breaking proctoring visibility.", risk: "High - prevents visual monitoring of the candidate." },
  microphone_disabled: { title: "Microphone disabled mid-session", why: "The microphone was turned off during the interview, disrupting audio capture and transcription quality.", risk: "Medium - may affect transcript accuracy; review recording for gaps." },
  tab_switch: { title: "Tab / app switch", why: "The candidate switched away from the interview tab to another browser tab or application. This is commonly associated with looking up answers.", risk: "Medium - cross-check with answer quality; sudden improvement after a tab switch is a red flag." },
  connection_lost: { title: "Connection dropped", why: "The candidate's internet connection was interrupted during the session. This may be genuine or deliberate.", risk: "Low-Medium - check whether audio and video resumed cleanly and whether answers were affected." },
};

function buildIntegritySignals(
  rows: { key: string; label: string; value: string; bad: boolean }[],
  _integrityScore: number,
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
      details.push(`- ${display.why}`);
      details.push(`Risk: ${display.risk}`);
    }
    if (count > 0) {
      if (count >= 3) details.push(`- Occurred ${count} times - high frequency. Strongly recommend reviewing recording timestamps.`);
      else if (count === 2) details.push(`- Occurred twice - review both incidents in the recording before deciding.`);
      else details.push(`- Occurred once - isolated event, review the recording at this point to confirm context.`);
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

  // If no real events, add a single clean signal (no integrity score row — shown in header)
  if (realRows.length === 0) {
    signals.push({
      id: "clean",
      label: "No flags detected",
      badge: "Clean",
      tone: "emerald",
      icon: "shield",
      details: ["No proctoring events raised during this session.", "Candidate completed the interview without any integrity flags."],
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
  const aiStrengths: string[] = Array.isArray(args.behavioralAnalysis?.strengths_observed)
    ? args.behavioralAnalysis.strengths_observed
        .filter((s: unknown) => typeof s === "string" && s.trim())
        .map((s: string) => cleanAiText(s.trim()))
        .slice(0, 3)
    : [];
  const aiConcerns: string[] = Array.isArray(args.behavioralAnalysis?.concerns_noted)
    ? args.behavioralAnalysis.concerns_noted
        .filter((s: unknown) => typeof s === "string" && s.trim())
        .map((s: string) => cleanAiText(s.trim()))
        .slice(0, 3)
    : [];

  const topStrengths: string[] = [...aiStrengths];
  const topRisks: string[] = [...aiConcerns];

  if (topStrengths.length < 3) {
    if (args.fitPct >= 80 && topStrengths.length < 3)
      topStrengths.push("Strong overall candidate fit - demonstrated consistent alignment with role expectations across technical, behavioral, and communication dimensions - signals readiness to contribute from day one");
    else if (args.fitPct >= 60 && topStrengths.length < 3)
      topStrengths.push("Solid overall fit - candidate showed meaningful alignment with the role requirements across most evaluated areas - worth advancing to the next stage for a more in-depth assessment");
    if (args.technicalPct >= 70 && topStrengths.length < 3)
      topStrengths.push(`Demonstrated technical competency - gave specific, evidence-backed answers across ${args.qaRows.length} evaluated questions showing practical implementation knowledge - indicates real hands-on experience rather than surface familiarity`);
    if (args.commAvg >= 70 && topStrengths.length < 3)
      topStrengths.push("Clear and structured communication - consistently expressed ideas with logical flow, appropriate vocabulary, and minimal hedging throughout the session - would perform well in collaborative or client-facing environments");
    const topSkill = [...args.skills].sort((a, b) => b.stars - a.stars)[0];
    if (topSkill && topSkill.stars >= 4 && topStrengths.length < 3)
      topStrengths.push(`Strong ${topSkill.name} signal - the strongest demonstrated skill in the session, backed by specific examples and confident articulation - this area can be relied upon without further validation`);
    if (topStrengths.length < 2)
      topStrengths.push("Evidence consistency across the session - answers stayed grounded in concrete examples and role-relevant details - suggests a dependable, well-supported self-presentation");
  }

  if (topRisks.length < 3) {
    if (args.technicalPct < 35 && topRisks.length < 3)
      topRisks.push("Technical depth significantly below role threshold - answers lacked specificity and relied on high-level descriptions rather than concrete implementation experience - requires a dedicated technical screen before advancing");
    else if (args.technicalPct < 50 && topRisks.length < 3)
      topRisks.push("Insufficient technical depth - several answers were vague or generic without evidence of hands-on experience - needs stronger proof points before this candidate can be trusted for technical delivery");
    if (args.proctoringRows.some((r) => r.bad) && topRisks.length < 3)
      topRisks.push("Proctoring anomalies flagged - one or more integrity signals were triggered during the session - a human reviewer must assess these events before this report's scores can be relied upon");
    if (args.commAvg < 50 && topRisks.length < 3)
      topRisks.push("Communication is below average - candidate struggled with clarity, fluency, or confidence during several responses - may affect performance in team collaboration, stakeholder communication, or client-facing scenarios");
    if (args.fitPct < 40 && topRisks.length < 3)
      topRisks.push("Low overall fit signal - the candidate's profile and responses do not align well with the evaluated role criteria - a follow-up structured interview is recommended before making any hiring decision");
    if (topRisks.length < 2)
      topRisks.push("Limited evidence of depth - answers across multiple topics stayed at the surface level without exploring implementation trade-offs, edge cases, or real-world constraints - depth of experience remains unvalidated");
  }

  return { topStrengths: topStrengths.slice(0, 3), topRisks: topRisks.slice(0, 3) };
}

export function buildSreevaAIInterviewViewModel(i: {
  backHref?: string;
  candidate: { fullName?: string; createdAt?: string; location?: string; interview?: any; assessment?: any; drive?: { role?: string; title?: string } };
  mounted: boolean;
  displayAvatar: string;
  interviewReportScores: Record<string, any>;
  interviewReportCommunication: Record<string, any>;
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
  proctoringEventsFull?: { time: string; eventType: string; reason: string; severity: string; elapsedSeconds: number }[];
  answerScoresParsed?: { question: string; answer: string; depth: number; clarity: number; specificity: number; grounding: number; overall: number; signals: string[] }[];
  integrityScore?: number;
  integrityBand?: string;
  skillsEvaluated?: string[];
  skillRatingsList?: { skill: string; score: number; status: string; evidence?: string; gaps?: string }[];
}): SreevaAIInterviewViewModel {
  const c = i.candidate;
  const com = i.interviewReportCommunication || {};
  const behavAnalysis = i.interviewReportBehavioralAnalysis || {};
  const scores = i.interviewReportScores || {};
  const verdict = i.interviewReportVerdict || {};

  const toPct = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
  };
  // -- 5-dimension scores from new schema ----------------------------------------
  const _dims: { name: string; score: number; evidence: string }[] =
    Array.isArray(scores.dimensions) ? scores.dimensions : [];
  const _dimScore = (name: string) => {
    const d = _dims.find((d) => d.name.toLowerCase().includes(name.toLowerCase()));
    return d ? Math.max(0, Math.min(100, Math.round(d.score))) : 0;
  };
  const commScore   = _dimScore("communication") || Number(scores.communication_score ?? scores.communication ?? 0);
  const dkScore     = _dimScore("domain") || Number(scores.demonstrated_knowledge ?? scores.technical_score ?? scores.technical ?? 0);
  const fitScore    = _dimScore("role fit") || Number(scores.role_fit ?? 0);
  const psScore     = _dimScore("problem") || Number(scores.problem_solving ?? 0);
  const ownScore    = _dimScore("ownership") || 0;
  const overallPct  = Number(scores.overall ?? scores.combined_score ?? 0);

  // Legacy alias kept for fitPercent computation
  const technicalPct = dkScore || (() => {
    const qaRows = i.interviewQaRows || [];
    const blockAvgs = qaRows.map((r: any) => {
      const sb = r?.score_breakdown || {};
      const dims = [
        Number(sb.depth ?? 0), Number(sb.clarity ?? 0),
        Number(sb.specificity ?? sb.technical_accuracy ?? 0),
        Number(sb.grounding ?? sb.practical_application ?? 0),
      ].filter((n: number) => Number.isFinite(n) && n > 0);
      return dims.length > 0 ? (dims.reduce((a: number, b: number) => a + b, 0) / dims.length) * 10 : null;
    }).filter((n: number | null): n is number => n !== null);
    if (blockAvgs.length > 0) return Math.min(100, Math.round(blockAvgs.reduce((a: number, b: number) => a + b, 0) / blockAvgs.length));
    return i.isFallbackReport ? 0 : Math.min(100, Math.max(0, i.interviewScore)) || 0;
  })();

  const questionsAsked = Math.max(1, (i.interviewQaRows?.length || i.interviewSessionRows.length) || 1);
  const techTag: "GOOD" | "AVERAGE" | "WEAK" = technicalPct >= 70 ? "GOOD" : technicalPct >= 45 ? "AVERAGE" : "WEAK";

  // a"a" Derive comm scores from transcript when AI report values are missing a"a"
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

  const commFallback = commScore > 0 ? commScore : 50;
  const comm = {
    pronunciation: toPct(com.pronunciation, derivedComm?.clarityScore ?? commFallback),
    grammar:       toPct(com.grammar,       derivedComm?.grammarScore ?? commFallback),
    fluency:       toPct(com.fluency,       derivedComm?.fluencyScore ?? commFallback),
    confidence:    toPct(com.confidence,    derivedComm?.confidenceScore ?? commFallback),
    vocabulary:    toPct(com.vocabulary,    derivedComm?.confidenceScore ?? commFallback),
    minimalFiller: toPct(com.fluency,       derivedComm?.fluencyScore ?? commFallback),
    tag: commScore >= 70 ? "STRONG" : commScore >= 45 ? "AVERAGE" : "WEAK",
    commSummary: cleanAiText(String(com.summary || "").trim()),
    hasNewSchema: false,
  };

  const commAvg = commScore > 0 ? commScore : commFallback;

  // a"a" Proctoring rows a"a"
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
    const raw = (i as any).candidate?.interview?.skillRatings;
    if (!raw) return proctoringRows.some((r) => r.bad) ? 65 : 95;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const n = Number(parsed?.integrity?.score);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : (proctoringRows.some((r) => r.bad) ? 65 : 95);
    } catch { return 95; }
  })();

  const integritySignals = buildIntegritySignals(proctoringRows, rawIntegrityScore);

  // a"a" Skills a"a"
  const normalizeSkillName = (value: string) =>
    value.replace(/\b(question|q\d+|round|interview|asked|asked about)\b/gi, "")
      .replace(/[\-  :]+/g, " ").replace(/\s+/g, " ").trim();
  const isGenericSkillName = (value: string) => {
    const v = value.toLowerCase();
    return !v || /^question\s*\d+$/i.test(value) || v.length < 3 || v.includes("interview") || v === "skill" || v === "[object object]";
  };
  const noiseSignalNames = new Set([
    "ownership_ambiguity",
    "example_evasion",
    "resume_claim_mismatch",
    "follow_up_collapse",
    "latency_mismatch",
    "complexity_latency_mismatch",
    "ownership_clarified",
    "example_given",
    "depth_decay",
    "strong_under_pressure",
  ]);
  const isNoiseSignalSkill = (value: string) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_");
    return noiseSignalNames.has(normalized);
  };
  const skillMap = new Map<string, { name: string; stars: number; status: string; scoreLabel: string; whatShowed?: string; whatMissing?: string }>();
  const addSkill = (name: string, stars: number, status: string, scoreLabel: string, whatShowed?: string, whatMissing?: string) => {
    const clean = normalizeSkillName(name);
    if (isGenericSkillName(clean) || isNoiseSignalSkill(clean)) return;
    const existing = skillMap.get(clean.toLowerCase());
    if (!existing) {
      skillMap.set(clean.toLowerCase(), { name: clean, stars, status, scoreLabel, whatShowed, whatMissing });
      return;
    }
    existing.stars = Math.max(existing.stars, stars);
    existing.status = existing.status || status;
    existing.scoreLabel = existing.scoreLabel || scoreLabel;
    existing.whatShowed = existing.whatShowed || whatShowed;
    existing.whatMissing = existing.whatMissing || whatMissing;
  };

  // Parse "X/10" or "X/5" or plain number scores into 0-5 stars
  const parseScoreToStars = (raw: string): number => {
    const s = String(raw || "").trim();
    if (!s || s === "-" || s === "No clear score" || s.toLowerCase() === "no clear score") return 0;
    // "7/10" a' numerator=7, denominator=10
    const fracMatch = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (fracMatch) {
      const num = parseFloat(fracMatch[1]);
      const den = parseFloat(fracMatch[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        return Math.max(0, Math.min(5, Math.round((num / den) * 5)));
      }
    }
    // Plain number: treat a5 as direct stars, a10 as /10, a100 as /100
    const n = parseFloat(s.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return 3;
    if (n <= 5) return Math.max(0, Math.round(n));
    if (n <= 10) return Math.max(0, Math.min(5, Math.round((n / 10) * 5)));
    return Math.max(0, Math.min(5, Math.round((n / 100) * 5)));
  };

  // Primary source: AI skills_proof objects (new schema)
  (i.interviewReportSkills || []).forEach((s: any) => {
    const name = String(s?.skill || s?.title || s?.name || "").trim();
    if (!name || isNoiseSignalSkill(name)) return;
    const scoreLabel = String(s?.score || "").trim() || "N/A";
    const stars = parseScoreToStars(scoreLabel);
    const status = String(s?.status || "NOT TESTED").trim();
    const whatShowed = cleanAiText(String(s?.what_they_showed || s?.evidence || "").trim()) || undefined;
    const whatMissing = cleanAiText(String(s?.what_was_missing || "").trim()) || undefined;
    if (name) addSkill(name, stars, status, scoreLabel, whatShowed, whatMissing);
  });

  // Supplement from qa_blocks tags a" derive score from actual qa_block score
  (i.interviewQaRows || []).forEach((row: any) => {
    if (Array.isArray(row?.tags)) {
      const rawScore = String(row?.score || "");
      const stars = parseScoreToStars(rawScore);
      const status = stars >= 4 ? "PROVED" : stars >= 2 ? "PARTIAL" : "NOT PROVED";
      row.tags.forEach((tag: string) => {
        if (tag && !isGenericSkillName(tag) && !isNoiseSignalSkill(tag)) {
          addSkill(tag, stars, status, rawScore || "-");
        }
      });
    }
  });

  const skills = Array.from(skillMap.values()).sort((a, b) => b.stars - a.stars);

  // a"a" Transcript a"a" Parse turns from DB transcript with timestamps
  const secToLabel = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const transcript: SreevaAIInterviewViewModel["transcript"] = (() => {
    if (!i.interviewTranscript) return [{ from: "ai" as const, text: "No transcript available for this session.", time: "--" }];

    const rawTurns: SreevaAIInterviewViewModel["transcript"] = [];
    const lines = i.interviewTranscript.split(/\n/);
    let currentTurn: SreevaAIInterviewViewModel["transcript"][number] | null = null;

    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;

      // Match speaker with timestamp: Interviewer[123]: or Candidate[123]:
      const m = t.match(/^(interviewer|candidate)\[(\d+)\]:\s*/i);
      if (m) {
        // Save previous turn if exists
        if (currentTurn && currentTurn.text.trim()) {
          rawTurns.push(currentTurn);
        }
        // Start new turn
        const elapsedSec = parseInt(m[2], 10);
        const label = secToLabel(elapsedSec);
        const from = m[1].toLowerCase() === "interviewer" ? "ai" : "user";
        const text = t.replace(m[0], "").trim();
        currentTurn = { from, text, time: label, seekSeconds: elapsedSec, seekLabel: label };
      } else if (/^interviewer:\s*/i.test(t)) {
        // Save previous turn if exists
        if (currentTurn && currentTurn.text.trim()) {
          rawTurns.push(currentTurn);
        }
        // Start new turn without timestamp
        const text = t.replace(/^interviewer:\s*/i, "").trim();
        currentTurn = { from: "ai", text, time: undefined };
      } else if (/^candidate:\s*/i.test(t)) {
        // Save previous turn if exists
        if (currentTurn && currentTurn.text.trim()) {
          rawTurns.push(currentTurn);
        }
        // Start new turn without timestamp
        const text = t.replace(/^candidate:\s*/i, "").trim();
        currentTurn = { from: "user", text, time: undefined };
      } else if (currentTurn) {
        // Continuation line - append to current turn
        currentTurn.text = `${currentTurn.text} ${t}`.trim();
      }
    }

    // Don't forget the last turn
    if (currentTurn && currentTurn.text.trim()) {
      rawTurns.push(currentTurn);
    }

    // Merge consecutive turns from same speaker within 10 seconds
    const turns: SreevaAIInterviewViewModel["transcript"] = [];
    for (const turn of rawTurns) {
      const last = turns[turns.length - 1];
      if (
        last &&
        last.from === turn.from &&
        typeof last.seekSeconds === "number" &&
        typeof turn.seekSeconds === "number" &&
        turn.seekSeconds - last.seekSeconds <= 10
      ) {
        // Merge with previous turn
        last.text = `${last.text} ${turn.text}`.replace(/\s+/g, " ").trim();
      } else {
        turns.push(turn);
      }
    }

    if (turns.length > 0) {
      return turns;
    }

    const fallbackText = String(i.interviewTranscript || "").trim();
    if (!fallbackText) {
      return [{ from: "ai" as const, text: "No transcript available for this session.", time: "--" }];
    }

    return [{
      from: "ai" as const,
      text: fallbackText,
      time: "--",
    }];
  })();

  // a"a" Question Analysis a"a"
  // ? Question Analysis ?
  const questionAnalysis: SreevaAIInterviewViewModel["questionAnalysis"] = [];
  const qaRows = Array.isArray(i.interviewQaRows) ? i.interviewQaRows : [];
  const sessionRows = Array.isArray(i.interviewSessionRows) ? i.interviewSessionRows : [];
  const liveScores = Array.isArray(i.answerScoresParsed) ? i.answerScoresParsed : [];
  const maxRows = Math.max(qaRows.length, sessionRows.length, liveScores.length);
  const findByTurn = (rows: any[], turnNumber: number) => rows.find((row: any) => Number(row?.q ?? row?.turn) === turnNumber) || null;
  for (let idx = 0; idx < maxRows; idx += 1) {
    const turnNumber = idx + 1;
    const row = qaRows[idx] || findByTurn(qaRows, turnNumber) || {};
    const sessionRow = sessionRows[idx] || findByTurn(sessionRows, turnNumber) || {};
    const liveScore = liveScores[idx] || findByTurn(liveScores, turnNumber) || null;
    const q = String(row?.question || row?.title || sessionRow?.question || liveScore?.question || "").trim() || `Question ${turnNumber}`;
    const a = String(row?.answer || sessionRow?.answer || liveScore?.answer || "").trim();
    const score = String(row?.score || (liveScore ? `${Math.round(Number(liveScore.overall || 0))}/10` : "--")).trim();
    const { q: b, bad } = scoreToBadge(score);
    const sb = row?.score_breakdown ?? null;
    const scoreBreakdown = sb && typeof sb === "object" && Object.keys(sb).length > 0 ? {
      clarity:              Math.max(0, Math.min(10, Number(sb.clarity ?? 0))),
      depth:                Math.max(0, Math.min(10, Number(sb.depth ?? 0))),
      technical_accuracy:   Math.max(0, Math.min(10, Number(sb.technical_accuracy ?? sb.fluency ?? 0))),
      practical_application:Math.max(0, Math.min(10, Number(sb.practical_application ?? sb.confidence ?? 0))),
    } : liveScore && (liveScore.clarity || liveScore.depth || liveScore.specificity || liveScore.grounding) ? {
      clarity:              Math.max(0, Math.min(10, liveScore.clarity)),
      depth:                Math.max(0, Math.min(10, liveScore.depth)),
      technical_accuracy:   Math.max(0, Math.min(10, liveScore.specificity)),
      practical_application:Math.max(0, Math.min(10, liveScore.grounding)),
    } : null;
    questionAnalysis.push({
      id: idx, question: q, answer: a || "?", score, qBadge: b, bad,
      reasoning: cleanAiText(String(row?.reasoning || sessionRow?.reasoning || "").trim()),
      tags: Array.isArray(row?.tags) ? row.tags : Array.isArray(liveScore?.signals) ? liveScore.signals : [],
      confidence: String(row?.confidence || ""),
      scoreBreakdown,
    });
  }

  const fitPct = (() => {
    const rawComb = Number(scores.combined_score);
    if (Number.isFinite(rawComb) && rawComb > 0) return Math.min(100, Math.max(0, Math.round(rawComb)));
    // Fallback: combinedScore is already 0-100 from the page
    return Math.min(100, Math.max(0, i.combinedScore));
  })();

  // a"a" Recommendation from AI verdict (not from fitPct) a"a"
  const { label: recommendation, color: recommendationColor } = recommendationFromAI(verdict.recommendation, fitPct);
  // a"a" AI Summary bullets a" use concise 4-line summary from AI a"a"
  const rawVerdictSummary = String(verdict.summary || i.interviewReportSummary || i.interviewAiSummary || "").trim();
  const verdictSummaryText = rawVerdictSummary.replace(/\*{1,2}/g, "").replace(/\n{3,}/g, "\n\n");
  const verdictRecommendationReason = cleanAiText(String(verdict.recommendation_reason || "").trim());
  const aiSummaryConcise = String((verdict as any).ai_summary_concise || "").trim();

  // Proctoring signal (needed before aiBullets to reference flagCount)
  const flagCount = proctoringRows.filter((row) => row.bad).length;

  // a"a" Strengths / Risks a" needed before aiBullets fallback a"a"
  const { topStrengths, topRisks } = buildTopStrengthsRisks({
    technicalPct, techTag, commAvg, fitPct, proctoringRows,
    behavioralAnalysis: behavAnalysis, skills,
    qaRows: questionAnalysis,
  });

  // Primary: use interviewAiSummary — the new 4-bullet evidence-based summary generated by generate_interview_summary
  const aiBullets: string[] = (() => {
    const bullets: string[] = [];

    // Source 1: aiSummary from DB (4-bullet evidence-based format from new generate_interview_summary)
    const aiSummaryText = String(i.interviewAiSummary || "").trim();
    if (aiSummaryText) {
      aiSummaryText
        .split(/\n/)
        .map((line: string) => line.trim())
        .filter((line: string) => line.startsWith("-") || line.length > 20)
        .slice(0, 4)
        .forEach((line: string) => {
          const cleaned = cleanAiText(line.replace(/^[-•*]\s*/, "").trim());
          if (cleaned.length > 10) bullets.push(cleaned);
        });
    }

    // Source 2: verdict concise AI summary
    if (bullets.length === 0 && aiSummaryConcise) {
      aiSummaryConcise
        .split(/\n/)
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 5)
        .slice(0, 4)
        .forEach((line: string) => {
          const cleaned = cleanAiText(line.replace(/^[\s•\-+]\s*/, "").replace(/^\*(?!\*)/, "").trim());
          if (cleaned.length > 5) bullets.push(cleaned);
        });
    }
    // Fallback: evidence-based bullets derived from actual data, no comm/recommendation duplication
    if (bullets.length === 0 && !i.isFallbackReport) {
      const provedSkills = skills.filter(s => s.status === "PROVED" || s.status === "PARTIAL").slice(0, 2);
      const topSkillNames = provedSkills.map(s => `**${s.name}**`).join(" and ") || "**their primary domain**";
      bullets.push(cleanAiText(`Candidate demonstrated practical hands-on exposure to ${topSkillNames} through specific project descriptions and implementation context.`));

      const gapSkills = skills.filter(s => s.status === "NOT PROVED" || s.status === "NOT TESTED").slice(0, 2);
      const gapNames = gapSkills.map(s => `**${s.name}**`).join(" and ") || "**advanced technical depth**";
      bullets.push(cleanAiText(`Depth was ${technicalPct >= 60 ? "solid in core areas but surface-level" : "limited"} on ${gapNames} - answers stayed at concept level without implementation detail when probed.`));

      const behavioralSummary = String(behavAnalysis?.summary || "").trim();
      const engagementLine = behavioralSummary
        ? behavioralSummary.split(".")[0].trim() + "."
        : flagCount === 0
          ? "Candidate maintained consistent engagement with no behavioral anomalies across the session."
          : `${flagCount} behavioral signal${flagCount !== 1 ? "s" : ""} triggered during the session - review proctoring timeline for context.`;
      bullets.push(cleanAiText(engagementLine));

      const topStrength = topStrengths[0]?.replace(/\*\*/g, "") || "";
      const topRisk = topRisks[0]?.replace(/\*\*/g, "") || "";
      if (topStrength) bullets.push(cleanAiText(`Strongest observed signal: ${topStrength.toLowerCase()}${topRisk ? ` - primary area to validate further: ${topRisk.toLowerCase()}` : ""}.`));
    }

    return bullets.slice(0, 4);
  })();


  // a"a" Timestamps a"a"
  const doneAt = c.interview?.completedAt || c.interview?.endedAt;
  const interviewedOn = doneAt
    ? new Date(doneAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : c.createdAt && i.mounted
      ? new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "--";

  const totalTime = (i.recordingDurationSec ? (i.formatDuration || formatDurationM)(i.recordingDurationSec) : i.interviewTranscript
      ? `${Math.max(1, Math.round((i.wordCount / 150) * 5))} mins (est.)` : "--");

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
      percent: overallPct || technicalPct,
      questions: questionsAsked,
      tag: techTag,
      scores: {
        overall:                overallPct || technicalPct,
        engagement:             toPct(scores.engagement, 60),
        communication:          commScore,
        domain_knowledge:       dkScore,
        role_fit:               fitScore,
        problem_solving:        psScore,
        ownership_credibility:  ownScore,
        // Legacy
        demonstrated_knowledge: dkScore,
        technical:              dkScore,
        dimensions:             _dims,
      },
    },
    comm,
    verdictSummary: verdictSummaryText,
    verdictRecommendationReason,
    aiBullets,
    integritySignals,
    signalAnalysis: behavAnalysis,
    skills,
    topStrengths,
    topRisks,
    transcript,
    questionAnalysis,
    videoUrl: i.interviewRecordingUrl || null,
    videoMimeType: String(c.interview?.recordingMimeType || "").trim() || inferVideoMimeType(String(i.interviewRecordingUrl || "")),
    recordingDurationSec: i.recordingDurationSec,
    proctoringHeadline: i.proctoringVerdictSummary,
    integrityScore: rawIntegrityScore,
    signalTimeline: (i.signalTimeline || [])
      .filter((e) => e.recruiter_visible)
      .sort((a, b) => a.elapsed_sec - b.elapsed_sec),
    proctoringEventsFull: i.proctoringEventsFull || [],
    answerScores: i.answerScoresParsed || [],
  };
}

/* a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-
   SUB-COMPONENTS
a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a- */

const SIGNAL_META: Record<string, { label: string; tone: "rose" | "amber" | "emerald" | "sky" | "slate" }> = {
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

const SIGNAL_TONE_DEFAULT: "rose" | "amber" | "emerald" | "sky" | "slate" = "slate";

function toneForSignal(signalName: string): "rose" | "amber" | "emerald" | "sky" | "slate" {
  const normalized = String(signalName || "").trim().toLowerCase();
  const meta = SIGNAL_META[normalized];
  if (meta) return meta.tone;
  if (
    normalized.includes("mismatch") ||
    normalized.includes("evasion") ||
    normalized.includes("collapse") ||
    normalized.includes("resume_claim")
  ) return "rose";
  if (
    normalized.includes("ambiguity") ||
    normalized.includes("decay") ||
    normalized.includes("blur") ||
    normalized.includes("focus") ||
    normalized.includes("latency")
  ) return "amber";
  if (
    normalized.includes("resolved") ||
    normalized.includes("clarified") ||
    normalized.includes("given") ||
    normalized.includes("strong")
  ) return "emerald";
  if (normalized.includes("tab") || normalized.includes("copy") || normalized.includes("screenshot")) return "rose";
  return SIGNAL_TONE_DEFAULT;
}

function toneForSeverity(severity: string): "rose" | "amber" | "emerald" | "sky" | "slate" {
  const sev = String(severity || "").toLowerCase();
  if (sev === "high" || sev === "critical") return "rose";
  if (sev === "medium") return "amber";
  if (sev === "low") return "sky";
  return "slate";
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type UnifiedTimelineEvent =
  | { kind: "signal"; elapsed_sec: number; signal_name: string; evidence: string; turn: number }
  | { kind: "proctoring"; elapsed_sec: number; eventType: string; reason: string; severity: string };

const PROCTORING_META: Record<string, { label: string; tone: "rose" | "amber" | "sky" | "slate" }> = {
  tab_switch:          { label: "Tab switch",       tone: "rose" },
  tab_hidden:          { label: "Tab hidden",        tone: "rose" },
  face_absent:         { label: "Face absent",       tone: "amber" },
  face_multiple:       { label: "Multiple faces",    tone: "rose" },
  blur:                { label: "Window blur",        tone: "amber" },
  focus_lost:          { label: "Focus lost",        tone: "amber" },
  copy_paste:          { label: "Copy/paste",         tone: "rose" },
  screenshot:          { label: "Screenshot",         tone: "rose" },
  fullscreen_exit:     { label: "Fullscreen exit",   tone: "amber" },
};

function buildUnifiedTimeline(
  signals: SreevaAIInterviewViewModel["signalTimeline"],
  proctoring: SreevaAIInterviewViewModel["proctoringEventsFull"],
): UnifiedTimelineEvent[] {
  const out: UnifiedTimelineEvent[] = [];
  for (const s of signals) {
    out.push({ kind: "signal", elapsed_sec: s.elapsed_sec, signal_name: s.signal_name, evidence: s.evidence, turn: s.turn });
  }
  for (const p of proctoring) {
    const sec = typeof p.elapsedSeconds === "number" ? p.elapsedSeconds : 0;
    out.push({ kind: "proctoring", elapsed_sec: sec, eventType: (p.eventType || "").toLowerCase().replace(/\s+/g, "_"), reason: p.reason || "", severity: p.severity || "" });
  }
  return out.sort((a, b) => a.elapsed_sec - b.elapsed_sec);
}

function IntegrityTimeline({
  signals, proctoring, onTimelineClick,
}: {
  signals: SreevaAIInterviewViewModel["signalTimeline"];
  proctoring: SreevaAIInterviewViewModel["proctoringEventsFull"];
  onTimelineClick?: (seconds: number) => void;
}) {
  const events = buildUnifiedTimeline(signals, proctoring);

  if (events.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-5 text-[12px] text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        No signals detected during this session.
      </div>
    );
  }

  return (
    <div className="relative px-4 py-3">
      {/* vertical rail */}
      <div className="absolute left-[27px] top-0 bottom-0 w-px bg-[#E8EAED]" />
      <ol className="space-y-0 list-none m-0 p-0">
        {events.map((ev, idx) => {
          const isLast = idx === events.length - 1;

          let tone: "rose" | "emerald" | "amber" | "sky" | "slate";
          let label: string;
          let subLabel: string | null = null;
          let evidence: string | null = null;
          let category: string;

          if (ev.kind === "signal") {
            const meta = SIGNAL_META[ev.signal_name]
              ? SIGNAL_META[ev.signal_name]
              : { label: ev.signal_name.replace(/_/g, " "), tone: toneForSignal(ev.signal_name) };
            tone = meta.tone ?? toneForSignal(ev.signal_name);
            label = meta.label;
            subLabel = `Turn ${ev.turn}`;
            evidence = ev.evidence || null;
            category = "behavioral";
          } else {
            const meta = PROCTORING_META[ev.eventType]
              ? PROCTORING_META[ev.eventType]
              : { label: ev.eventType.replace(/_/g, " "), tone: toneForSeverity(ev.severity) };
            tone = toneForSeverity(ev.severity) !== "slate" ? toneForSeverity(ev.severity) : meta.tone;
            label = meta.label;
            subLabel = ev.severity ? ev.severity.toUpperCase() : null;
            evidence = ev.reason || null;
            category = "proctoring";
          }

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
          const catCls = category === "proctoring"
            ? tone === "rose" ? "bg-rose-50 text-rose-700 border-rose-200"
              : tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : tone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200"
              : tone === "sky" ? "bg-sky-50 text-sky-700 border-sky-200"
              : "bg-slate-50 text-slate-500 border-slate-200"
            : tone === "rose" ? "bg-rose-50 text-rose-700 border-rose-200"
              : tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : tone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200"
              : tone === "sky" ? "bg-sky-50 text-sky-700 border-sky-200"
              : "bg-slate-50 text-slate-500 border-slate-200";

          return (
            <li
              key={idx}
              className={cn("relative flex gap-3 items-start cursor-pointer hover:bg-[#F9FAFB] rounded px-2 -mx-2 transition-colors", isLast ? "pb-1" : "pb-4")}
              onClick={() => onTimelineClick?.(ev.elapsed_sec)}
            >
              <div className={cn("relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-4", dotCls)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold tabular-nums text-[#6B7079] w-[38px] shrink-0">{fmtTime(ev.elapsed_sec)}</span>
                  <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", labelCls)}>{label}</span>
                  <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", catCls)}>{category}</span>
                  {subLabel && <span className="text-[10px] text-[#9AA0AC]">{subLabel}</span>}
                </div>
                {evidence && (
                  <p className="mt-1 ml-[50px] text-[11px] leading-relaxed text-[#5C6370] line-clamp-2">{evidence}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function IntelMetricCard({ row }: { row: IntelSignalRow; isCognitive?: boolean }) {
  const Icon = INTEL_ICON_MAP[row.icon];
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const earned = row.details?.find(d => d.startsWith("-")) || row.details?.find(d => d.startsWith('a"')) || "";
  const missed = row.details?.find(d => d.startsWith("Risk:")) || "";
  const plainLines = row.details?.filter(d => !d.startsWith("-") && !d.startsWith("Risk:")) || [];

  const handleMouseEnter = () => {
    if (cardRef.current) {
      const r = cardRef.current.getBoundingClientRect();
      setTipPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    setHovered(true);
  };
  const handleMouseLeave = () => { setHovered(false); setTipPos(null); };

  const hasTooltip = !!(earned || missed || plainLines.length > 0);

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
      {hovered && tipPos && hasTooltip && (
        <div
          className="fixed z-[9999] rounded-xl border border-neutral-200 bg-white shadow-2xl overflow-hidden"
          style={{ top: tipPos.top, left: tipPos.left, width: tipPos.width }}
        >
          {earned && (
            <div className="flex gap-2.5 items-start px-3 py-2.5 bg-emerald-50 border-b border-emerald-100">
              <span className="mt-[3px] shrink-0 text-emerald-600 text-[13px] font-black">-</span>
              <p className="text-[12px] leading-relaxed text-emerald-900">{earned.replace(/^[-]\s*/, "")}</p>
            </div>
          )}
          {missed && (
            <div className="flex gap-2.5 items-start px-3 py-2.5 bg-rose-50 border-b border-rose-100">
              <span className="mt-[3px] shrink-0 text-rose-600 text-[13px] font-black">a-</span>
              <p className="text-[12px] leading-relaxed text-rose-900">{missed.replace(/^a-\s*/, "")}</p>
            </div>
          )}
          {plainLines.map((line, idx) => {
            const isScore = /^Score:\s*\d+\/100/.test(line);
            if (isScore) {
              const score = parseInt(line.match(/(\d+)\/100/)?.[1] || "0", 10);
              return (
                <div key={idx} className="px-3 py-2.5 border-b border-neutral-100 bg-neutral-50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-500">Score</span>
                    <span className="text-[12px] font-black text-neutral-800">{score}/100</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", score >= 78 ? "bg-emerald-500" : score >= 52 ? "bg-amber-400" : "bg-rose-500")}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              );
            }
            return (
              <p key={idx} className="text-[12px] leading-relaxed text-neutral-700 px-3 py-2.5 border-b border-neutral-100 last:border-0">{line}</p>
            );
          })}
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

function SkillCircle({ stars, status, scoreLabel }: { stars: number; status: string; scoreLabel?: string }) {
  const R = 18, CIRC = 2 * Math.PI * R;
  const rawLabel = String(scoreLabel || "").trim();
  const parsedPct = (() => {
    if (!rawLabel || rawLabel === "-" || rawLabel === "No clear score") return null;
    const pctMatch = rawLabel.match(/^(\d+(?:\.\d+)?)\s*%$/);
    if (pctMatch) return Math.max(0, Math.min(100, Number(pctMatch[1])));
    const fracMatch = rawLabel.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (fracMatch) {
      const num = Number(fracMatch[1]);
      const den = Number(fracMatch[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        return Math.max(0, Math.min(100, Math.round((num / den) * 100)));
      }
    }
    const num = Number(rawLabel.replace(/[^\d.]/g, ""));
    if (Number.isFinite(num)) {
      if (num <= 10) return Math.max(0, Math.min(100, Math.round(num * 10)));
      if (num <= 100) return Math.max(0, Math.min(100, Math.round(num)));
    }
    return null;
  })();
  const pct = parsedPct !== null ? parsedPct : Math.round((stars / 5) * 100);
  const fill = CIRC * (pct / 100);
  const color =
    status === "PROVED"     ? "#0F9D58" :
    status === "PARTIAL"    ? "#D97706" :
    status === "NOT PROVED" ? "#E11D48" : "#64748B";
  const label = parsedPct !== null ? `${pct}%` : "N/A";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="22" cy="22" r={R} fill="none" stroke="#E8EAED" strokeWidth="3.5" />
      <circle
        cx="22" cy="22" r={R} fill="none"
        stroke={pct > 0 ? color : "#CBD5E1"} strokeWidth="3.5"
        strokeDasharray={`${fill} ${CIRC}`}
        strokeLinecap="round"
      />
      <text
        x="22" y="22"
        textAnchor="middle" dominantBaseline="middle"
        style={{ transform: "rotate(90deg)", transformOrigin: "22px 22px", fontSize: "9.5px", fontWeight: 800, fill: pct > 0 ? color : "#64748B" }}
      >
        {label}
      </text>
    </svg>
  );
}
function SkillRatingsContainer({ skills }: { skills: SreevaAIInterviewViewModel["skills"] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (skills.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center px-4 py-6 text-center">
        <p className="text-[12px] text-[#6B7079]">No skills evaluated in this session.</p>
      </div>
    );
  }

  const statusCfg: Record<string, { badge: string; badgeText: string }> = {
    PROVED:       { badge: "bg-emerald-50 border-emerald-200 text-emerald-700", badgeText: "Strong" },
    PARTIAL:      { badge: "bg-amber-50 border-amber-200 text-amber-700",       badgeText: "Partial" },
    "NOT PROVED": { badge: "bg-rose-50 border-rose-200 text-rose-700",           badgeText: "Weak" },
    "NOT TESTED": { badge: "bg-slate-50 border-slate-200 text-slate-500",        badgeText: "N/A" },
  };

  return (
    <ScrollFade className="max-h-[380px] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
      <div className="divide-y divide-[#F0F1F3]">
        {skills.map((s) => {
          const cfg = statusCfg[s.status] || statusCfg["NOT TESTED"];
          const isOpen = expanded === s.name;
          const hasDetail = !!(s.whatShowed || s.whatMissing);

          return (
            <div key={`${s.name}-${s.status}`}>
              <button
                type="button"
                onClick={() => hasDetail && setExpanded(isOpen ? null : s.name)}
                className={cn("w-full flex items-center gap-3 px-4 py-4 text-left transition-all", hasDetail ? "hover:bg-slate-50/70 cursor-pointer" : "cursor-default")}
              >
                {/* Name + badge */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#111827] leading-snug truncate">{s.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none", cfg.badge)}>
                      {cfg.badgeText}
                    </span>
                    {s.scoreLabel && /[0-9]/.test(String(s.scoreLabel)) && (
                      <span className="text-[10px] font-medium text-[#6B7280]">{s.scoreLabel}</span>
                    )}
                  </div>
                </div>

                {/* Circle ring on right */}
                <SkillCircle stars={s.stars} status={s.status} scoreLabel={s.scoreLabel} />

                {hasDetail && (
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[#98A2B3] transition-transform", isOpen ? "rotate-180" : "")} />
                )}
              </button>

              {isOpen && hasDetail && (
                <div className="px-4 pb-4 space-y-2.5">
                  {s.whatShowed && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-3.5 py-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-700 mb-1">What they showed</p>
                      <p className="text-[12.5px] leading-relaxed text-[#1A1D22]">{s.whatShowed}</p>
                    </div>
                  )}
                  {s.whatMissing && (
                    <div className="rounded-2xl border border-rose-100 bg-rose-50/40 px-3.5 py-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-rose-700 mb-1">What was missing</p>
                      <p className="text-[12.5px] leading-relaxed text-[#1A1D22]">{s.whatMissing}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollFade>
  );
}

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
        <text key={i} x={s.x} y={s.y} textAnchor="middle" dominantBaseline="middle" fontSize="5" fill={cfg.fill}>a ...</text>
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


function SignalAnalysisPanel({ analysis }: { analysis: Record<string, any> }) {
  const points: string[] = Array.isArray(analysis?.points)
    ? (analysis.points as string[]).filter((p) => typeof p === "string" && p.trim())
    : [];

  if (points.length === 0) {
    return (
      <ul className="divide-y divide-[#F0F1F3]">
        <li className="flex items-start gap-3 px-5 py-4">
          <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-slate-300" />
          <p className="text-[12px] text-[#6B7079]">Signal analysis not available for this session.</p>
        </li>
      </ul>
    );
  }

  return (
    <ul className="divide-y divide-[#F0F1F3]">
      {points.map((text, idx) => {
        const { title, description } = parseBulletCard(text);
        return (
          <li key={idx} className="flex items-start gap-3 px-5 py-4">
            <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-sky-500" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-[#1A1D22] leading-snug">{title}</p>
              {description && <p className="mt-1 text-[12.5px] leading-relaxed text-[#4B5563]">{description}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}


/* a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-
   CHART COMPONENTS
a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a- */

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

const DIMENSION_CONFIG = [
  { key: "communication",         label: "Communication",           color: "#6366F1" },
  { key: "domain_knowledge",      label: "Domain Knowledge",        color: "#0EA5E9" },
  { key: "role_fit",              label: "Role Fit",                color: "#8B5CF6" },
  { key: "problem_solving",       label: "Problem Solving",         color: "#10B981" },
  { key: "ownership_credibility", label: "Ownership & Credibility", color: "#F59E0B" },
] as const;

export function EvaluationScoresCard({
  scores,
  overall,
}: {
  scores?: SreevaAIInterviewViewModel["technical"]["scores"];
  overall: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dims: { name: string; score: number; evidence: string }[] =
    Array.isArray(scores?.dimensions) ? scores.dimensions : [];

  const getValue = (key: string): number => {
    const kw = key === "domain_knowledge" ? "domain"
      : key === "ownership_credibility" ? "ownership"
      : key === "role_fit" ? "role"
      : key === "problem_solving" ? "problem"
      : "communication";
    const d = dims.find((d) => d.name.toLowerCase().includes(kw));
    if (d) return Math.max(0, Math.min(100, Math.round(d.score)));
    return Math.max(0, Math.min(100, Math.round(Number((scores as any)?.[key] ?? 0))));
  };

  const getEvidence = (key: string): string => {
    const kw = key === "domain_knowledge" ? "domain"
      : key === "ownership_credibility" ? "ownership"
      : key === "role_fit" ? "role"
      : key === "problem_solving" ? "problem"
      : "communication";
    return dims.find((d) => d.name.toLowerCase().includes(kw))?.evidence ?? "";
  };

  const values = DIMENSION_CONFIG.map((d) => getValue(d.key));
  const N = DIMENSION_CONFIG.length;
  // Extra viewBox padding so axis labels don't clip
  const PAD = 44;
  const R = 80;
  const SIZE = R * 2 + PAD * 2;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const point = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });

  const rings = [50, 100];

  const shapePoints = values
    .map((v, i) => point(i, (v / 100) * R))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  const hoveredEvidence = hovered ? getEvidence(hovered) : null;

  // Short label for axis tip
  const shortLabel = (label: string) =>
    label === "Ownership & Credibility" ? "Ownership"
    : label === "Domain Knowledge" ? "Knowledge"
    : label;

  const hoveredDim = hovered ? DIMENSION_CONFIG.find((d) => d.key === hovered) ?? null : null;
  const hoveredVal  = hovered ? getValue(hovered) : null;
  const tag = (v: number) => v >= 70 ? "STRONG" : v >= 45 ? "AVERAGE" : v > 0 ? "WEAK" : null;
  const tagCls = (v: number) => v >= 70
    ? "bg-emerald-100 text-emerald-700"
    : v >= 45 ? "bg-amber-100 text-amber-700"
    : "bg-rose-100 text-rose-700";

  const handleEnter = (key: string, e: React.MouseEvent) => {
    setHovered(key);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const handleMove = (e: React.MouseEvent) => {
    if (!hovered) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const handleLeave = () => { setHovered(null); setMousePos(null); };

  // Position tooltip: to the right of cursor by default, flip left if near right edge
  const tooltipStyle = (() => {
    if (!mousePos) return {};
    const containerW = containerRef.current?.offsetWidth ?? 400;
    const tipW = 240;
    const left = mousePos.x + 14 + tipW > containerW ? mousePos.x - tipW - 14 : mousePos.x + 14;
    return { top: mousePos.y - 20, left };
  })();

  return (
    <div ref={containerRef} className="relative flex flex-col items-center py-3 gap-3" onMouseMove={handleMove}>
      {/* Radar SVG */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="overflow-visible shrink-0"
      >
        <defs>
          <radialGradient id="evalRadarGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* Grid rings */}
        {rings.map((pct) => {
          const r = (pct / 100) * R;
          const pts = Array.from({ length: N }, (_, i) => point(i, r))
            .map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <polygon key={pct} points={pts} fill="none"
              stroke={pct === 100 ? "#CBD5E1" : "#E2E8F0"}
              strokeWidth={pct === 100 ? "1" : "0.7"}
              strokeDasharray={pct === 50 ? "3 2" : undefined}
            />
          );
        })}

        {/* Spokes */}
        {DIMENSION_CONFIG.map((_, i) => {
          const o = point(i, R);
          return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke="#E2E8F0" strokeWidth="0.7" />;
        })}

        {/* Data shape */}
        <polygon points={shapePoints} fill="url(#evalRadarGrad)" stroke="#6366F1" strokeWidth="2" strokeLinejoin="round" />

        {/* Dots */}
        {values.map((v, i) => {
          const p = point(i, (v / 100) * R);
          const dim = DIMENSION_CONFIG[i];
          const isHov = hovered === dim.key;
          return (
            <circle key={dim.key} cx={p.x} cy={p.y}
              r={isHov ? 6 : 4.5}
              fill={dim.color} stroke="white" strokeWidth="1.5"
              className="cursor-pointer" style={{ transition: "r 0.12s" }}
              onMouseEnter={(e) => handleEnter(dim.key, e)}
              onMouseLeave={handleLeave}
            />
          );
        })}

        {/* Axis tip labels */}
        {DIMENSION_CONFIG.map((dim, i) => {
          const lp = point(i, R + 20);
          const isHov = hovered === dim.key;
          return (
            <text key={dim.key} x={lp.x} y={lp.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={isHov ? "9" : "8"} fontWeight={isHov ? "700" : "500"}
              fill={isHov ? dim.color : "#4B5563"}
              className="cursor-pointer select-none"
              onMouseEnter={(e) => handleEnter(dim.key, e)}
              onMouseLeave={handleLeave}
            >
              {shortLabel(dim.label)}
            </text>
          );
        })}
      </svg>

      {/* Dot legend row */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {DIMENSION_CONFIG.map((dim) => {
          const val = getValue(dim.key);
          const isHov = hovered === dim.key;
          return (
            <button key={dim.key} type="button"
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                isHov ? "bg-[#F3F4F6]" : "bg-transparent"
              )}
              onMouseEnter={(e) => handleEnter(dim.key, e)}
              onMouseLeave={handleLeave}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dim.color }} />
              <span className={isHov ? "font-semibold text-[#1A1D22]" : "text-[#4B5563]"}>{dim.label}</span>
              <span className="font-bold tabular-nums ml-0.5" style={{ color: dim.color }}>{val > 0 ? val : ""}</span>
            </button>
          );
        })}
      </div>

      {/* Floating tooltip card — positioned next to cursor */}
      {hoveredDim && hoveredVal !== null && mousePos && (
        <div
          className="pointer-events-none absolute z-50 w-[240px] rounded-xl border bg-white px-3.5 py-3 shadow-xl"
          style={{ ...tooltipStyle, borderColor: hoveredDim.color + "55" }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: hoveredDim.color }} />
            <span className="text-[12px] font-bold text-[#1A1D22] leading-tight">{hoveredDim.label}</span>
            <span className="ml-auto text-[17px] font-extrabold tabular-nums leading-none" style={{ color: hoveredDim.color }}>
              {hoveredVal}<span className="text-[9px] font-medium text-[#9AA0AC]">/100</span>
            </span>
          </div>
          {tag(hoveredVal) && (
            <span className={cn("inline-block rounded px-1.5 py-0.5 text-[8px] font-extrabold uppercase mb-1.5", tagCls(hoveredVal))}>
              {tag(hoveredVal)}
            </span>
          )}
          {hoveredEvidence ? (
            <p className="text-[11px] leading-relaxed text-[#3C4149]">{hoveredEvidence}</p>
          ) : (
            <p className="text-[11px] text-[#9AA0AC] italic">No evidence recorded.</p>
          )}
        </div>
      )}
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
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
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
    if (distance < innerRadius || distance > outerRadius) { setActiveMetric(null); setTooltipPos(null); return; }
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
    const pct = (angle / 360) * 100;
    const found = segments.find((s) => pct >= s.start && pct < s.end) || segments[0];
    setActiveMetric(found?.key || null);

    // Calculate tooltip position based on segment angle (in viewport/fixed coordinates)
    const segmentMidAngle = ((found?.start || 0) + (found?.end || 0)) / 2;
    const radians = ((segmentMidAngle - 90) * Math.PI) / 180; // Adjust for 0A = top
    const tooltipRadius = outerRadius * 2.2; // Increased distance to avoid hover interference
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const tooltipX = centerX + Math.cos(radians) * tooltipRadius;
    const tooltipY = centerY + Math.sin(radians) * tooltipRadius;
    setTooltipPos({ left: tooltipX - 140, top: tooltipY - 60 });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-3 pt-1 sm:px-3 sm:pb-4 sm:pt-2 relative">
      <div className="w-full max-w-[320px] relative">
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

        {/* Tooltip positioned beside hovered segment */}
        {active && tooltipPos && (() => {
          const activeSegment = segments.find((s) => s.key === activeMetric);
          const WHY: Record<string, { what: string; scored: string }> = {
            clarity: {
              what: "Did the candidate's answers have a logical structure - opening point, supporting reasoning, conclusion? Were ideas immediately understandable or did they require re-reading?",
              scored: activeSegment!.value >= 75
                ? `${activeSegment!.value}/100 - Candidate structured answers with a clear point first, supported by reasoning. Ideas were easy to follow on first listen.`
                : activeSegment!.value >= 50
                ? `${activeSegment!.value}/100 - Answers were generally understandable but occasionally drifted before landing on the key point. Some re-listening needed.`
                : `${activeSegment!.value}/100 - Answers frequently lacked structure. Key points were buried or unclear, requiring significant effort to follow.`,
            },
            fluency: {
              what: "How smooth was the delivery? Counted against filler words, long unnatural pauses, repeated restarts, and incomplete sentences.",
              scored: activeSegment!.value >= 75
                ? `${activeSegment!.value}/100 - Delivery was smooth with minimal filler. Thoughts connected naturally with consistent pacing throughout.`
                : activeSegment!.value >= 50
                ? `${activeSegment!.value}/100 - Noticeable filler words or pauses in several answers, but speech remained followable. Moderate disruption to delivery.`
                : `${activeSegment!.value}/100 - Frequent filler words, restarts, or long pauses significantly disrupted speech flow. Listener effort was high.`,
            },
            grammar: {
              what: "Sentence-level correctness - complete sentences, correct subject-verb agreement, and no structural fragments. Assessed from transcribed speech patterns.",
              scored: activeSegment!.value >= 75
                ? `${activeSegment!.value}/100 - Consistently used complete, well-formed sentences. Very few grammatical fragments or structural errors detected in the transcript.`
                : activeSegment!.value >= 50
                ? `${activeSegment!.value}/100 - Mostly correct grammar with some sentence fragments or tense inconsistencies, typical of spoken language under pressure.`
                : `${activeSegment!.value}/100 - Frequent grammatical errors or fragmented sentences throughout. May affect professional credibility in client-facing or written communication roles.`,
            },
            confidence: {
              what: "Assertiveness of delivery - did the candidate state positions clearly, or hedge with 'I think maybe', 'not sure', 'kind of'? Did they maintain tone under follow-up questions?",
              scored: activeSegment!.value >= 75
                ? `${activeSegment!.value}/100 - Candidate stated answers decisively. Minimal hedging language. Tone remained steady even when challenged or probed.`
                : activeSegment!.value >= 50
                ? `${activeSegment!.value}/100 - Generally confident with occasional hedging. Some answers became tentative under follow-up but recovered.`
                : `${activeSegment!.value}/100 - Frequent use of hedging language ('I think', 'maybe', 'not entirely sure'). Tone dropped under follow-up questions, signalling low assertiveness.`,
            },
          };
          return (
            <div className="fixed z-30 pointer-events-none" style={{ left: tooltipPos.left, top: tooltipPos.top }}>
              <div className="rounded-xl border border-neutral-200 bg-white shadow-2xl overflow-hidden" style={{ width: 280, pointerEvents: "auto" }}>
                <div className="px-3 pt-2.5 pb-2 border-b border-neutral-100" style={{ borderLeftColor: activeSegment?.color || "#000", borderLeftWidth: 3 }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: activeSegment?.color || "#000" }}>{activeSegment?.label}</p>
                  <p className="mt-0.5 text-[10px] text-[#98A2B3] leading-snug">{WHY[activeSegment?.key as keyof typeof WHY]?.what}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] leading-relaxed text-[#1A1D22]">
                    <span className="mr-1 font-black" style={{ color: activeSegment?.color || "#000" }}>a- </span>{WHY[activeSegment?.key as keyof typeof WHY]?.scored}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 px-2">
          {segments.map((m) => {
            const isActive = activeMetric === m.key;
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

export function TechnicalScoreCard({ pct, questions, tag: _tag }: {
  pct: number; questions: number; tag: string; questionsLabel?: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const competency   = Math.max(0, Math.min(100, p));
  const probSolving  = Math.max(0, Math.min(100, Math.round(p * 0.9)));
  const roleFit      = Math.max(0, Math.min(100, Math.round((competency + p) / 2)));
  const behav        = Math.max(0, Math.min(100, 50));

  const CIRCLES = [
    {
      key: "overall", label: "Overall", value: p,
      color: p >= 70 ? "#10B981" : p >= 45 ? "#F59E0B" : "#F43F5E",
      track: p >= 70 ? "#D1FAE5" : p >= 45 ? "#FEF3C7" : "#FEE2E2",
      what: "Weighted overall score: demonstrated competency (35%) + communication (25%) + behavioral engagement (20%) + cognitive (15%) + integrity (5%).",
      low:  "Overall performance below the bar - significant gaps across multiple dimensions.",
      mid:  "Moderate performance - some strong areas with clear gaps to address.",
      high: "Strong overall performance across competency, communication, and engagement.",
    },
    {
      key: "competency", label: "Competency", value: competency,
      color: "#1E6FD6", track: "#DBEAFE",
      what: "Demonstrated competency: project depth, implementation knowledge, technical understanding, architecture thinking, and practical exposure shown during the interview.",
      low:  "Limited hands-on knowledge - mostly theoretical, could not explain implementation details when probed.",
      mid:  "Moderate competency - real experience with some gaps. Knows vocabulary but struggles with depth.",
      high: "Strong demonstrated competency - specific project details, real trade-offs, confident implementation knowledge.",
    },
    {
      key: "problem_solving", label: "Problem Solving", value: probSolving,
      color: "#6366F1", track: "#E0E7FF",
      what: "Cognitive problem-solving: ability to break down problems, identify constraints, consider trade-offs, and reason under pressure.",
      low:  "Jumped to solutions, missed edge cases. Reasoning lacked structure.",
      mid:  "Reasonable problem-solving approach with some gaps in depth or edge case handling.",
      high: "Systematic thinker - clearly stated assumptions, explored trade-offs, handled follow-up probing well.",
    },
    {
      key: "role_fit", label: "Role Fit", value: roleFit,
      color: "#8B5CF6", track: "#EDE9FE",
      what: "Role fit: cognitive breadth + how well demonstrated skills and experience align with the role's requirements.",
      low:  "Significant mismatch - skills and experience do not yet meet the role's core requirements.",
      mid:  "Reasonable fit with some gaps. Has the foundation but needs development in key areas.",
      high: "Strong fit - experience, demonstrated skills, and thinking style align well with role expectations.",
    },
    {
      key: "engagement", label: "Engagement", value: behav,
      color: "#F59E0B", track: "#FEF3C7",
      what: "Behavioral engagement: ownership signals, resume-interview consistency, genuine enthusiasm, and follow-through under probing questions.",
      low:  "Low engagement - answers inconsistent with resume, evasive under follow-up, limited ownership signals.",
      mid:  "Mostly engaged with some inconsistencies - generally participated well but lapses in conviction.",
      high: "Highly engaged - consistent, ownership-oriented, genuine enthusiasm for the role and problems.",
    },
  ];

  const activeCircle = CIRCLES.find(c => c.key === hoveredKey) || null;
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
            a- 
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
        {questions} question{questions === 1 ? "" : "s"}  hover any label for active insight
      </p>
    </div>
  );
}



type AnswerScoreRow = { question: string; answer: string; depth: number; clarity: number; specificity: number; grounding: number; overall: number; signals: string[] };

function QuestionAnalysisCard({ transcript, questions, answerScores, onTranscriptSeek, recordingDurationSec }: {
  transcript?: SreevaAIInterviewViewModel["transcript"];
  questions?: SreevaAIInterviewViewModel["questionAnalysis"];
  answerScores?: AnswerScoreRow[];
  onTranscriptSeek?: (seconds: number) => void;
  recordingDurationSec?: number | null;
}) {
  const transcriptSafe = Array.isArray(transcript) ? transcript : [];
  const questionsSafe = Array.isArray(questions) ? questions : [];
  const answerScoresSafe = Array.isArray(answerScores) ? answerScores : [];

  const findSeekTime = (qText: string, aText: string, fallbackTime: number): number => {
    if (qText) {
      const cleanQ = qText.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = transcriptSafe.find(t => t.from === "ai" && t.seekSeconds !== undefined && t.text.toLowerCase().replace(/[^a-z0-9]/g, "").includes(cleanQ));
      if (match && match.seekSeconds !== undefined) {
        return match.seekSeconds;
      }
    }
    if (aText) {
      const cleanA = aText.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = transcriptSafe.find(t => t.from === "user" && t.seekSeconds !== undefined && t.text.toLowerCase().replace(/[^a-z0-9]/g, "").includes(cleanA));
      if (match && match.seekSeconds !== undefined) {
        return match.seekSeconds;
      }
    }
    if (qText && qText.length > 10) {
      const fuzzyQ = qText.substring(0, 35).toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = transcriptSafe.find(t => t.from === "ai" && t.seekSeconds !== undefined && t.text.toLowerCase().replace(/[^a-z0-9]/g, "").includes(fuzzyQ));
      if (match && match.seekSeconds !== undefined) {
        return match.seekSeconds;
      }
    }
    return fallbackTime;
  };

  // Prefer answerScores (live DB data) over AI report qa_blocks
  const rows: { question: string; answer: string; depth: number; clarity: number; specificity: number; grounding: number; overall: number; signals: string[]; reasoning?: string; tags?: string[] }[] = (() => {
    if (answerScoresSafe.length > 0) {
      return answerScoresSafe.map((s, idx) => ({
        question: s.question,
        answer: s.answer,
        depth:       s.depth,
        clarity:     s.clarity,
        specificity: s.specificity,
        grounding:   s.grounding,
        overall:     s.overall,
        signals:     s.signals,
        reasoning: questionsSafe[idx]?.reasoning || "",
        tags: questionsSafe[idx]?.tags || [],
      }));
    }
    return questionsSafe
      .filter(q => q.answer && q.answer !== "?" && q.answer.length > 2)
      .map(q => ({
        question: q.question,
        answer: q.answer,
        depth:       q.scoreBreakdown?.depth ?? 0,
        clarity:     q.scoreBreakdown?.clarity ?? 0,
        specificity: q.scoreBreakdown?.technical_accuracy ?? 0,
        grounding:   q.scoreBreakdown?.practical_application ?? 0,
        overall:     parseFloat(q.score.replace(/[^\d.]/g, "")) || 0,
        signals:     [],
        reasoning:   q.reasoning,
        tags:        q.tags,
      }));
  })();

return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <Tabs defaultValue="transcript" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[#E8EAED] px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-[#1A1D22]">Conversation review</p>
            <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-bold text-[#6B7079]">{rows.length} total</span>
          </div>
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
            {rows.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#E8EAED] bg-[#FAFBFC] px-4 text-center text-[12px] font-medium text-[#6B7079]">
                No answered questions available yet.
              </div>
            ) : rows.map((item, idx) => {
              const overall = item.overall;
              const qBadge: QBadge = overall >= 7 ? "STRONG" : overall >= 5 ? "AVERAGE" : overall > 0 ? "FAIR" : "PENDING";
              const duration = recordingDurationSec || 1800;
              const linearSeekTime = Math.max(0, Math.floor((idx / (rows.length - 1 || 1)) * duration));
              const seekTime = findSeekTime(item.question, item.answer, linearSeekTime);
              return (
                <div key={idx} className="rounded-2xl border border-[#E8EAED] bg-white p-3.5 cursor-pointer hover:shadow-md hover:border-[#0B5FFF]/30 transition-all"
                  onClick={() => onTranscriptSeek?.(seekTime)}>
                  {/* Header: Q number + tags + score badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Q{idx + 1}</p>
                        {(item.tags || []).map((tag) => (
                          <span key={tag} className="rounded bg-[#F0F1F3] px-1.5 py-0.5 text-[9px] font-bold text-[#5C6370]">{tag}</span>
                        ))}
                        {item.signals.map((sig) => (
                          <span key={sig} className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[9px] font-bold text-[#92400E]">{sig}</span>
                        ))}
                      </div>
                      {/* AI question */}
                      <p className="text-[11px] font-semibold leading-5 text-[#5C6370] mb-1">{item.question}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn("rounded border px-2.5 py-1 text-[11px] font-extrabold",
                        qBadge === "STRONG" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : qBadge === "AVERAGE" ? "border-amber-200 bg-amber-50 text-amber-800"
                        : qBadge === "FAIR" ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-blue-200 bg-blue-50 text-blue-800"
                      )}>{overall > 0 ? `${overall}/10` : qBadge}</span>
                    </div>
                  </div>

                  {/* Candidate answer */}
                  {item.answer && (
                    <div className="mt-3 rounded-xl bg-[#F4F8FF] border border-[#D4E5FF] p-3">
                      <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#0B5FFF] mb-1">Candidate</p>
                      <p className="text-[12px] leading-5 text-[#1A1D22]">{item.answer}</p>
                    </div>
                  )}

                  {/* Score breakdown rings */}
                  {(item.depth > 0 || item.clarity > 0 || item.specificity > 0 || item.grounding > 0) && (
                    <div className="mt-2 grid grid-cols-4 gap-2 rounded-xl bg-[#FAFBFC] border border-[#F0F1F3] p-3">
                      {([
                        ["Clarity",     item.clarity,     "#6366F1"],
                        ["Depth",       item.depth,       "#10B981"],
                        ["Specificity", item.specificity, "#F59E0B"],
                        ["Grounding",   item.grounding,   "#F43F5E"],
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

                  {/* Overall score bar */}
                  {overall > 0 && (
                    <div className="mt-2 flex items-center gap-2 px-1">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-[#6B7079] w-14 shrink-0">Overall</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#F0F1F3] overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${(overall / 10) * 100}%`,
                          backgroundColor: overall >= 7 ? "#10B981" : overall >= 5 ? "#F59E0B" : "#F43F5E"
                        }} />
                      </div>
                      <span className="text-[10px] font-extrabold text-[#1A1D22] w-8 text-right">{overall}/10</span>
                    </div>
                  )}
                </div>
              );
            })}
          </ScrollFade>
        </TabsContent>

        <TabsContent value="transcript" className="mt-0 flex h-full min-h-0 flex-1 overflow-hidden">
          <ScrollFade className="flex h-full min-h-0 flex-1 flex-col space-y-3 overflow-y-scroll p-3 pr-2 overscroll-contain" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
            {transcriptSafe.map((line, i) => {
              const isUser = line.from === "user";
              return (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2 rounded-lg border p-3 cursor-pointer hover:shadow-sm transition-all",
                    isUser ? "border-[#C9E2FF] bg-[#F4F8FF] hover:border-[#0B5FFF]/50" : "border-[#E8EAED] bg-white hover:border-[#0B5FFF]/30"
                  )}
                  role="presentation"
                  onClick={() => line.seekSeconds !== undefined && onTranscriptSeek?.(line.seekSeconds)}
                >
                  {isUser ? <User className="mt-0.5 h-4 w-4 shrink-0 text-[#0B5FFF]" /> : <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#0D4D2E]" />}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#6B7079]">{isUser ? "Candidate" : "AI"}</span>
                      <span className="text-[9px] font-semibold text-[#6B7079]">{line.seekLabel || line.time}</span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-[#1A1D22]">{line.text}</p>
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
    ["raw_signals", "Raw Signals"],
    ["signal_analysis", "Signal Analysis"],
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

/* a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-
   MAIN REPORT COMPONENT
a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a- */

export function InterviewReportSreevaAI({
  model, showHeader = true, headerActions,
}: {
  model: SreevaAIInterviewViewModel;
  showHeader?: boolean;
  headerActions?: ReactNode;
}) {
  const [intel, setIntel] = useState<IntelId>("raw_signals");
  const plyrRef = useRef<any>(null);

  useEffect(() => {
    if (!model.videoUrl) return;

    let cancelled = false;
    let attempts = 0;

    const forceUnmute = () => {
      if (cancelled) return;

      const player = plyrRef.current?.plyr || null;
      const media = player?.media || plyrRef.current?.querySelector?.("video") || document.querySelector("video");

      try {
        if (player) {
          player.muted = false;
          player.volume = 1;
          if (player.media) {
            player.media.muted = false;
            player.media.volume = 1;
          }
        }

        if (media) {
          media.muted = false;
          media.volume = 1;
        }
      } catch (err) {
        console.debug("Failed to force unmute playback:", err);
      }

      attempts += 1;
      const stillMuted = Boolean(player?.muted || player?.media?.muted || media?.muted);
      if (!cancelled && attempts < 12 && stillMuted) {
        window.setTimeout(forceUnmute, 250);
      }
    };

    const timer = window.setTimeout(forceUnmute, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [model.videoUrl]);
  const handleSeek = (seconds: number) => {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return;

    try {
      const setCurrentTime = (el: any) => {
        try {
          if (el && typeof el.currentTime !== "undefined") {
            el.currentTime = Math.max(0, seconds);
          }
        } catch (e) {
          console.debug("Failed to set currentTime:", e);
        }
      };

      // Try Plyr API first
      if (plyrRef.current?.plyr?.currentTime !== undefined) {
        setCurrentTime(plyrRef.current.plyr);
        return;
      }

      // Try direct video element within the ref
      if (plyrRef.current) {
        const videoEl = plyrRef.current.querySelector?.("video");
        if (videoEl) {
          setCurrentTime(videoEl);
          return;
        }
      }

      // Try finding video in document as fallback
      const videoEl = document.querySelector("video");
      if (videoEl) {
        setCurrentTime(videoEl);
      }
    } catch (err) {
      console.debug("Seek operation failed silently:", err);
    }
  };

  return (
    <div className={cn("w-full", bgPage)}>
      <div className="mx-auto w-full max-w-[1340px] space-y-4 px-2 pb-12 pt-2" style={{ zoom: "0.82" }}>

        {/* a"a" Fallback Banner a"a" */}
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

        {/* a"a" Header a"a" */}
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

        {/* a"a" Candidate header card a"a" */}
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
                  <span className="hidden text-[#D3D7DD] sm:inline">a</span>
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

        {/* a"a" Stat cards a"a" */}
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

        {/* Evaluation Scores — 5 unified HR dimensions */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={cn(card, "flex flex-col overflow-hidden")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Evaluation Scores</p>
              <span className={cn("rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase",
                model.technical.percent >= 70 ? "bg-emerald-100 text-emerald-800"
                : model.technical.percent >= 45 ? "bg-amber-100 text-amber-800"
                : "bg-rose-100 text-rose-800"
              )}>Overall {model.technical.percent}/100</span>
            </div>
            <EvaluationScoresCard scores={model.technical.scores} overall={model.technical.percent} />
          </div>

          {/* AI Summary */}
          <div className={cn(card, "overflow-hidden")}>
            <div className="flex items-center gap-2 border-b border-[#E8EAED] px-4 py-3">
              <Sparkles className="h-3.5 w-3.5 text-[#0D4D2E]" />
              <p className="text-sm font-extrabold text-[#1A1D22]">Candidate Insights</p>
              <span className="ml-auto text-[10px] text-[#9AA0AC] font-medium">AI-generated - based on full interview</span>
            </div>
            {model.isFallback ? (
              <p className="px-4 py-5 text-[11px] text-[#6B7079]">AI analysis pending - manual review required.</p>
            ) : (
              <ul className="divide-y divide-[#F5F6F7]">
                {model.aiBullets.slice(0, 3).map((b, i) => {
                  const stripped = b.replace(/^[-\*]\s*/, "").trim();
                  const body = stripped.replace(/^\*\*[^*]+\*\*[:.]?\s*/, "").trim();
                  return (
                    <li key={i} className="flex items-start gap-2 px-4 py-2.5">
                      <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <p className="text-[11px] leading-snug text-[#1A1D22]">{body}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        
{/* a"a" Strengths & Concerns a"a" */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={cn(card, "overflow-hidden")}>
            <div className="border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-semibold text-[#1A1D22]">Strengths Observed</p>
            </div>
            {model.topStrengths.length > 0 ? (
              <ul className="divide-y divide-[#F0F1F3]">
                {model.topStrengths.map((item, idx) => {
                  const { title, description } = parseBulletCard(item);
                  return (
                    <li key={idx} className="flex items-start gap-3 px-5 py-4">
                      <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-[#1A1D22] leading-snug">{title}</p>
                        {description && <p className="mt-1 text-[12.5px] leading-relaxed text-[#4B5563]">{description}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-4 text-[12px] text-[#6B7079]">No specific strengths identified in this session.</p>
            )}
          </div>

          <div className={cn(card, "overflow-hidden")}>
            <div className="border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-semibold text-[#1A1D22]">Concerns & Risks</p>
            </div>
            {model.topRisks.length > 0 ? (
              <ul className="divide-y divide-[#F0F1F3]">
                {model.topRisks.map((item, idx) => {
                  const { title, description } = parseBulletCard(item);
                  return (
                    <li key={idx} className="flex items-start gap-3 px-5 py-4">
                      <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-[#1A1D22] leading-snug">{title}</p>
                        {description && <p className="mt-1 text-[12.5px] leading-relaxed text-[#4B5563]">{description}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-4 text-[12px] text-[#6B7079]">No specific risks flagged in this session.</p>
            )}
          </div>
        </div>


        {/* Intelligence panel + Skills */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Interview Intelligence */}
          <div className={cn(card, "overflow-hidden")}>
            {/* Header */}
            <div className="border-b border-[#E8EAED] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#1A1D22]">Interview intelligence</p>
                <div className="flex items-center gap-1.5">
                  <Shield className={cn("h-3.5 w-3.5 shrink-0", model.integrityScore >= 80 ? "text-emerald-600" : model.integrityScore >= 60 ? "text-amber-500" : "text-rose-600")} strokeWidth={2} />
                  <span className={cn("text-[11px] font-bold", model.integrityScore >= 80 ? "text-emerald-700" : model.integrityScore >= 60 ? "text-amber-700" : "text-rose-700")}>
                    {model.integrityScore}/100
                  </span>
                </div>
              </div>
              <div className="mt-3"><TabStrip value={intel} onChange={setIntel} /></div>
            </div>
            {/* Body — same divide-y list structure as strengths/risks */}
            {intel === "raw_signals" && (
              model.integritySignals.length === 1 && model.integritySignals[0].id === "clean" ? (
                <ul className="divide-y divide-[#F0F1F3]">
                  <li className="flex items-start gap-3 px-5 py-4">
                    <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-[#1A1D22] leading-snug">No flags detected</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-[#4B5563]">Candidate completed the interview without any proctoring or integrity flags.</p>
                    </div>
                  </li>
                </ul>
              ) : (
                <ul className="divide-y divide-[#F0F1F3]">
                  {model.integritySignals.filter(r => r.id !== "clean").map((row) => (
                    <li key={row.id} className="flex items-start gap-3 px-5 py-4">
                      <span className={cn("mt-[6px] h-2 w-2 shrink-0 rounded-full", row.tone === "rose" ? "bg-rose-500" : row.tone === "amber" ? "bg-amber-400" : "bg-emerald-500")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[13.5px] font-medium text-[#1A1D22] leading-snug">{row.label}</p>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none", BADGE_PILL[row.tone])}>{row.badge}</span>
                        </div>
                        {row.details && row.details.length > 0 && (
                          <p className="mt-1 text-[12.5px] leading-relaxed text-[#4B5563]">{row.details[0].replace(/^[-]\s*/, "")}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
            {intel === "signal_analysis" && <SignalAnalysisPanel analysis={model.signalAnalysis} />}
          </div>

          {/* Skill ratings */}
          <div className={cn(card, "overflow-hidden")}>
            <div className="border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-semibold text-[#1A1D22]">Skill ratings</p>
              <p className="text-[10px] text-[#6B7079] mt-0.5">Scored from interview performance only</p>
            </div>
            <SkillRatingsContainer skills={model.skills} />
          </div>
        </div>

        {/* a"a" Conversation review a"a" */}
        <div className={cn(card, "overflow-hidden")}>
          <div className="border-b border-[#E8EAED] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-[#1A1D22]">Conversation review</p>
              <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-bold text-[#6B7079]">{model.questionAnalysis.length} questions</span>
            </div>
          </div>
          <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-2 p-4" style={{ gridAutoRows: "600px" }}>
            {/* Recording */}
            <div className="min-h-0 min-w-0 h-[600px]">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#E8EAED] bg-white p-0">
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
                      source={{
                        type: "video",
                        sources: [{ src: model.videoUrl, type: inferVideoMimeType(model.videoUrl, model.videoMimeType) }],
                      }}
                      options={{
                        autoplay: false,
                        clickToPlay: true,
                        duration: model.recordingDurationSec || undefined,
                        invertVolume: false,
                        muted: false,
                        storage: { enabled: false },
                        volume: 1,
                      }}
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

                {/* Unified signal timeline */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[#E8EAED]">
                  <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370]">Signal timeline</p>
                    <span className="text-[10px] font-bold text-[#9AA0AC]">{model.signalTimeline.length + model.proctoringEventsFull.length} event{(model.signalTimeline.length + model.proctoringEventsFull.length) !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
                    <IntegrityTimeline signals={model.signalTimeline} proctoring={model.proctoringEventsFull} onTimelineClick={handleSeek} />
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

            {/* Transcript + Question analysis */}
            <div className="min-h-0 min-w-0 h-[600px]">
              <div className={cn(card, "h-full overflow-hidden p-0")}>
                <QuestionAnalysisCard transcript={model.transcript} questions={model.questionAnalysis} answerScores={model.answerScores} onTranscriptSeek={handleSeek} recordingDurationSec={model.recordingDurationSec} />
              </div>
            </div>
          </div>
        </div>

        {/* a"a" Final Recommendation a"a" */}
        {!model.isFallback && (() => {
          const isHire = model.recommendationColor === "green";
          const isNo   = model.recommendationColor === "red";
          const strength = model.topStrengths[0] ? parseBulletCard(model.topStrengths[0]).title : null;
          const gap      = model.topRisks[0]      ? parseBulletCard(model.topRisks[0]).title      : null;
          const nextStep = isHire
            ? "Move to offer stage and conduct reference checks."
            : isNo
            ? "Send rejection with constructive feedback on the key gaps."
            : "Schedule a focused follow-up or second-round interview.";
          const borderCls = isHire ? "border-emerald-200" : isNo ? "border-rose-200" : "border-amber-200";
          const bgCls     = isHire ? "bg-emerald-50"      : isNo ? "bg-rose-50"      : "bg-amber-50";
          const stampCls  = isHire ? "bg-emerald-600 shadow-emerald-600/20" : isNo ? "bg-rose-600 shadow-rose-600/20" : "bg-amber-500 shadow-amber-500/20";
          const textCls   = isHire ? "text-emerald-950"   : isNo ? "text-rose-950"   : "text-amber-950";
          const mutedCls  = isHire ? "text-emerald-700"   : isNo ? "text-rose-700"   : "text-amber-700";
          const summary   = model.verdictSummary || model.verdictRecommendationReason || "";
          const paragraphs = summary ? summary.split(/\n+/).filter(Boolean) : [];
          
          return (
            <div className={cn("rounded-2xl border px-5 py-4 shadow-sm", borderCls, bgCls)}>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 shadow-sm shrink-0">
                      <Sparkles className={cn("h-3 w-3", mutedCls)} />
                    </span>
                    <h3 className={cn("text-[13px] font-bold tracking-tight", textCls)}>Executive Hiring Decision</h3>
                  </div>

                  <div className="space-y-2 pr-2">
                    {paragraphs.length > 0 ? (
                      paragraphs.map((para, i) => (
                        <p key={i} className={cn("text-[12px] leading-[1.65]", textCls, i === 0 ? "font-semibold" : "font-normal opacity-80")}>
                          {para}
                        </p>
                      ))
                    ) : (
                      <p className={cn("text-[12px] leading-[1.65] font-normal", textCls)}>
                        {`${model.fullName} is a ${model.fitLabel.toLowerCase()} candidate for the ${model.roleLabel} role with ${model.fitPercent}% fit.`}
                        {strength && ` Strong in ${strength.toLowerCase()}.`}
                        {gap && ` Key gap: ${gap.toLowerCase()}.`}
                      </p>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-black/5">
                    <p className={cn("text-[11px] flex items-center gap-1.5", mutedCls)}>
                      <span className="font-bold uppercase tracking-[0.12em] shrink-0">Next Step:</span>
                      <span className="font-medium">{nextStep}</span>
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col md:items-end gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-black/35">Final Verdict</span>
                  <span className={cn("rounded-lg px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white shadow-md", stampCls)}>
                    {model.recommendation}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}


      </div>
    </div>
  );
}

