"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils";
import "plyr-react/plyr.css";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  Box,
  Check,
  Eye,
  GitBranch,
  Link2,
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

/** Pastel background + strong text, matching reference screens */
export type IntelBadgeTone = "rose" | "sky" | "amber" | "emerald" | "slate";

export type IntelIconKey =
  | "user"
  | "smile"
  | "eye"
  | "shirt"
  | "activity"
  | "zap"
  | "star"
  | "search"
  | "box"
  | "git-branch"
  | "shield"
  | "alert";

export type IntelSignalRow = {
  id: string;
  label: string;
  badge: string;
  tone: IntelBadgeTone;
  icon: IntelIconKey;
};

type IntelId = "integrity" | "engagement" | "cognitive";
type QBadge = "FAIR" | "AVERAGE" | "STRONG" | "PENDING";

export type HyringInterviewViewModel = {
  backHref: string;
  fullName: string;
  displayAvatar: string;
  roleLabel: string;
  cityBadge: string;
  locationLine: string;
  interviewedOn: string;
  totalTime: string;
  fitPercent: number;
  fitLabel: string;
  stats: {
    workExp: string;
    currentHourly: string;
    expectedHourly: string;
    expectedJoining: string;
    feedbackStars: number;
  };
  technical: { percent: number; questions: number; tag: "GOOD" | "AVERAGE" | "WEAK" };
  comm: { pronunciation: number; grammar: number; vocabulary: number; minimalFiller: number; fluency: number; tag: string };
  aiBullets: string[];
  proctoringRows: { key: string; label: string; value: string; bad: boolean }[];
  engagementVibes: IntelSignalRow[];
  cognitiveInsights: IntelSignalRow[];
  integritySignals: IntelSignalRow[];
  skills: { name: string; questions: number; stars: number }[];
  /** Ranked 1–3; derived in builder from scores, transcript, proctoring, skills. */
  topStrengths: string[];
  topRisks: string[];
  transcript: { from: "ai" | "user"; text: string; time?: string; qBadge?: QBadge; bad?: boolean }[];
  videoUrl: string | null;
  recordingDurationSec: number | null;
  snapshots: string[];
  proctoringHeadline: string;
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

const INTEL_ICON_MAP: Record<IntelIconKey, LucideIcon> = {
  user: User,
  smile: Smile,
  eye: Eye,
  shirt: Shirt,
  activity: Activity,
  zap: Zap,
  star: Star,
  search: Search,
  box: Box,
  "git-branch": GitBranch,
  shield: Shield,
  alert: AlertCircle,
};

const BADGE_PILL: Record<IntelBadgeTone, string> = {
  rose: "border-rose-200/90 bg-rose-100 text-rose-800",
  sky: "border-sky-200/90 bg-sky-100 text-sky-800",
  amber: "border-amber-200/90 bg-amber-100 text-amber-900",
  emerald: "border-emerald-200/90 bg-emerald-100 text-emerald-800",
  slate: "border-slate-200/90 bg-slate-100 text-slate-700",
};

function proctoringCount(groups: { key: string; count: number }[], pred: (k: string) => boolean) {
  return groups.reduce((n, g) => (pred(String(g.key).toLowerCase()) ? n + g.count : n), 0);
}

function cognitiveLabel(n: number): { badge: string; tone: IntelBadgeTone } {
  if (n >= 78) return { badge: "Strong", tone: "emerald" };
  if (n >= 65) return { badge: "Moderate", tone: "sky" };
  if (n >= 52) return { badge: "Medium", tone: "amber" };
  if (n >= 35) return { badge: "Average", tone: "amber" };
  return { badge: "Limited", tone: "rose" };
}

function buildEngagementVibes(groups: { key: string; count: number }[]): IntelSignalRow[] {
  const g = groups || [];
  const faceLike = proctoringCount(g, (k) => k.includes("face") || k.includes("head") || k.includes("pose"));
  const gazeC = proctoringCount(g, (k) => k.includes("gaze") || k.includes("eye"));
  return [
    {
      id: "posture",
      label: "Posture",
      icon: "user",
      ...(faceLike >= 3
        ? { badge: "Leaning", tone: "rose" as const }
        : faceLike >= 1
          ? { badge: "Adjusting", tone: "amber" as const }
          : { badge: "Upright", tone: "emerald" as const }),
    },
    { id: "facial", label: "Facial expressions", icon: "smile", badge: "Neutral", tone: "sky" },
    {
      id: "eye",
      label: "Eye contact",
      icon: "eye",
      ...(gazeC >= 1
        ? { badge: "Occasional", tone: "amber" as const }
        : { badge: "Steady", tone: "emerald" as const }),
    },
    { id: "attire", label: "Professional attire", icon: "shirt", badge: "Not assessed", tone: "slate" },
  ];
}

function buildCognitiveFromComm(
  com: Record<string, unknown>,
  interviewScore: number,
  wordCount: number,
  technicalPct: number
): IntelSignalRow[] {
  const toN = (v: unknown, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fb;
  };
  const clarityN = toN(com.clarity, 60);
  const confN = toN((com as { confidence?: number }).confidence, Math.min(100, Math.round((interviewScore / 10) * 100)));
  const entN = toN(
    (com as { enthusiasm?: number }).enthusiasm,
    Math.min(100, 42 + Math.min(30, wordCount / 25))
  );
  const depthN = toN(com.depth, 62);
  const probN = technicalPct;
  const logN = Math.round(
    (clarityN + toN(com.grammar, 50) + depthN + toN(com.fluency, 55)) / 4
  );
  return [
    { id: "c1", label: "Clarity", icon: "activity", ...cognitiveLabel(clarityN) },
    { id: "c2", label: "Confidence", icon: "zap", ...cognitiveLabel(confN) },
    { id: "c3", label: "Enthusiasm", icon: "star", ...cognitiveLabel(entN) },
    { id: "c4", label: "Depth of knowledge", icon: "search", ...cognitiveLabel(depthN) },
    { id: "c5", label: "Problem solving", icon: "box", ...cognitiveLabel(probN) },
    { id: "c6", label: "Logical thinking", icon: "git-branch", ...cognitiveLabel(logN) },
  ];
}

function buildIntegritySignals(rows: { key: string; label: string; value: string; bad: boolean }[]): IntelSignalRow[] {
  return rows.map((r) => ({
    id: r.key,
    label: r.label,
    badge: r.value,
    tone: r.bad ? "rose" : "emerald",
    icon: r.bad ? "alert" : "shield",
  }));
}

const MAX_S_R = 3;

function buildTopStrengthsRisks(args: {
  technicalPct: number;
  techTag: "GOOD" | "AVERAGE" | "WEAK";
  comm: { pronunciation: number; grammar: number; vocabulary: number; minimalFiller: number; fluency: number };
  fitPct: number;
  proctoringRows: { bad: boolean }[];
  transcript: { from: "ai" | "user"; qBadge?: QBadge; bad?: boolean }[];
  skills: { name: string; stars: number }[];
}): { topStrengths: string[]; topRisks: string[] } {
  const commAvg = Math.round(
    (args.comm.pronunciation + args.comm.grammar + args.comm.vocabulary + args.comm.minimalFiller + args.comm.fluency) / 5
  );
  let strongN = 0;
  let fairN = 0;
  for (const l of args.transcript) {
    if (l.from !== "user" || !l.qBadge) continue;
    if (l.qBadge === "STRONG") strongN++;
    if (l.qBadge === "FAIR" || l.bad) fairN++;
  }
  const anyProctoringBad = args.proctoringRows.some((r) => r.bad);
  const topSkill = [...args.skills].sort((a, b) => b.stars - a.stars)[0];

  const sCands: string[] = [];
  if (args.fitPct >= 70) sCands.push("Strong overall fit score against the combined model for this requisition");
  if (args.technicalPct >= 68) sCands.push("Technical performance is solid on the questions asked in this session");
  if (args.techTag === "GOOD") sCands.push("Technical track sits in the “good” band for the role’s bar");
  if (commAvg >= 64) sCands.push("Communication reads clear and consistent across the scored dimensions");
  if (strongN >= 2) sCands.push("Multiple answers landed in the top score band");
  if (!anyProctoringBad) sCands.push("No material integrity or environment flags on the automated review");
  if (topSkill && topSkill.stars >= 4) sCands.push(`Stronger signal in ${topSkill.name} (skill ratings)`);
  if (sCands.length < MAX_S_R && commAvg >= 55 && args.technicalPct >= 55) {
    sCands.push("Balanced profile: neither comm nor technical clearly lags the other");
  }
  const seenS = new Set<string>();
  const topStrengths: string[] = [];
  for (const x of sCands) {
    if (seenS.has(x)) continue;
    seenS.add(x);
    topStrengths.push(x);
    if (topStrengths.length >= MAX_S_R) break;
  }
  if (topStrengths.length === 0) {
    topStrengths.push("Use the score cards and AI summary to align on a hiring narrative for this session");
  }
  while (topStrengths.length < MAX_S_R) {
    const pad = "Cross-check the transcript and recording before a final call";
    if (topStrengths.includes(pad)) break;
    topStrengths.push(pad);
    break;
  }
  if (topStrengths.length > MAX_S_R) topStrengths.length = MAX_S_R;

  const rCands: string[] = [];
  if (args.technicalPct < 50) rCands.push("Technical score is below a typical pass line—add a focus round or exercise if you advance");
  if (args.techTag === "WEAK") rCands.push("Technical label is in the weak band; validate must-have skills in practice");
  if (fairN >= 2) rCands.push("Several weaker per-answer scores; probe gaps in the next step");
  if (anyProctoringBad) rCands.push("Proctoring or environment items need a human read before you rely on this session alone");
  if (commAvg < 50) rCands.push("Communication metrics are soft for roles that are client- or write-heavy");
  if (args.fitPct < 48) rCands.push("Overall fit score is on the low side for this requisition");
  if (rCands.length < MAX_S_R && args.technicalPct < 60 && commAvg < 60) {
    rCands.push("Both comm and technical sit mid or below; decide which gap you can support with onboarding");
  }
  const seenR = new Set<string>();
  const topRisks: string[] = [];
  for (const x of rCands) {
    if (seenR.has(x)) continue;
    seenR.add(x);
    topRisks.push(x);
    if (topRisks.length >= MAX_S_R) break;
  }
  if (topRisks.length === 0) {
    topRisks.push("No major automated risk flags; still run normal comp, level, and reference checks");
  }
  while (topRisks.length < MAX_S_R) {
    const pad = "Document why you are advancing (or not) for audit-friendly decisions";
    if (topRisks.includes(pad)) break;
    topRisks.push(pad);
    break;
  }
  if (topRisks.length > MAX_S_R) topRisks.length = MAX_S_R;

  return { topStrengths, topRisks };
}

export function IntelMetricCard({ row }: { row: IntelSignalRow }) {
  const Icon = INTEL_ICON_MAP[row.icon];
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200/90 bg-white px-4 py-3.5 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-neutral-900" strokeWidth={1.5} />
        <span className="min-w-0 text-[13px] font-semibold leading-snug text-neutral-900">{row.label}</span>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold leading-none",
          BADGE_PILL[row.tone]
        )}
      >
        {row.badge}
      </span>
    </div>
  );
}

export function buildHyringInterviewViewModel(i: {
  candidate: { fullName?: string; createdAt?: string; location?: string; passportUrl?: string; interview?: any; assessment?: any; drive?: { role?: string; title?: string } };
  mounted: boolean;
  displayAvatar: string;
  interviewReportScores: Record<string, any>;
  interviewReportRecording: Record<string, any>;
  interviewReportCommunication: Record<string, any>;
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
}): HyringInterviewViewModel {
  const c = i.candidate;
  const com = i.interviewReportCommunication || {};
  const scores = i.interviewReportScores || {};
  const toPct = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
  };

  const technicalPct = toPct(
    scores.technical_score ?? scores.interview_technical_pct ?? (i.interviewScore * 10),
    Math.round((i.interviewScore / 10) * 100) || 0
  );
  const questionsAsked = Math.max(1, i.interviewSessionRows.length || 1);
  const techTag: "GOOD" | "AVERAGE" | "WEAK" = technicalPct >= 70 ? "GOOD" : technicalPct >= 45 ? "AVERAGE" : "WEAK";

  const comm = {
    pronunciation: toPct(com.pronunciation ?? com.clarity, 55 + Math.min(30, i.wordCount / 40)),
    grammar: toPct(com.grammar, 50 + Math.min(40, i.wordCount / 35)),
    vocabulary: toPct(com.vocabulary ?? com.depth, 52 + Math.min(30, i.wordCount / 45)),
    minimalFiller: toPct(com.filler ?? com.minimal_filler, 60),
    fluency: toPct(com.fluency, 48 + Math.min(35, i.wordCount / 30)),
    tag: String(scores.cefr_label || i.communicationStatus).toUpperCase() || "AVERAGE",
  };

  const rawSummary = String(i.interviewReportSummary || i.interviewAiSummary || "").trim();
  const aiBullets = (() => {
    const s = rawSummary
      .split(/[\n.!?]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (s.length >= 3) return s.slice(0, 3);
    if (s.length > 0) {
      return [
        s[0],
        s[1] || "Response structure stayed consistent under follow-up questions.",
        s[2] || "Communication aligns with the stated CEFR band and transcript volume.",
      ];
    }
    return [
      "Responses reference concrete examples where the role requires depth.",
      "Clarity and pacing support remote interview comprehension.",
      "Use recording + integrity signals for final go/no-go.",
    ];
  })();

  const proctoringRows: HyringInterviewViewModel["proctoringRows"] = (i.groupedProctoringSignals || []).slice(0, 8).map((g) => ({
    key: g.key,
    label: g.label.replace(/\b\w/g, (ch) => ch.toUpperCase()),
    value: `${g.count} time${g.count === 1 ? "" : "s"}`,
    bad: g.severity === "high" || g.severity === "medium",
  }));
  if (proctoringRows.length === 0) {
    proctoringRows.push({
      key: "clean",
      label: "Session telemetry",
      value: "No significant flags",
      bad: false,
    });
  }

  const engagementVibes = buildEngagementVibes(i.groupedProctoringSignals || []);
  const cognitiveInsights = buildCognitiveFromComm(com, i.interviewScore, i.wordCount, technicalPct);
  const integritySignals = buildIntegritySignals(proctoringRows);

  const skills: HyringInterviewViewModel["skills"] = (i.interviewReportSkills || []).map((s: any) => {
    const name = String(s?.title || s?.skill || s?.name || "Skill");
    const qn = Math.max(1, Number(s?.questions_asked || s?.questions || 1) || 1);
    const sn = parseFloat(String(s?.score || "").replace(/[^\d.]/g, ""));
    const stars = Number.isFinite(sn) ? Math.max(0, Math.min(5, Math.round(sn / 20))) : 3;
    return { name, questions: qn, stars };
  });
  if (skills.length === 0) {
    skills.push({ name: "Role fit (JD)", questions: questionsAsked, stars: Math.max(1, Math.min(5, Math.round((technicalPct / 100) * 5))) });
  }

  const transcript: HyringInterviewViewModel["transcript"] = [];
  const rows = i.interviewQaRows?.length ? i.interviewQaRows : i.interviewSessionRows;
  (rows as any[]).forEach((row, idx) => {
    const q = String(row?.question || row?.title || "").trim() || `Question ${idx + 1}`;
    const a = String(row?.answer || row?.reasoning || "").trim();
    const { q: b, bad } = scoreToBadge(String(row?.score || ""));
    transcript.push({ from: "ai", text: q, time: `Q${idx + 1}` });
    if (a) {
      transcript.push({ from: "user", text: a, time: "Reply", qBadge: b, bad });
    }
  });
  if (transcript.length === 0 && i.interviewTranscript) {
    i.interviewTranscript.split(/\n+/).slice(0, 24).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      if (/^interviewer:/i.test(t)) transcript.push({ from: "ai", text: t.replace(/^interviewer:\s*/i, ""), time: "—" });
      else if (/^candidate:/i.test(t)) transcript.push({ from: "user", text: t.replace(/^candidate:\s*/i, ""), time: "—" });
      else transcript.push({ from: "user", text: t, time: "—" });
    });
  }
  if (transcript.length === 0) {
    transcript.push({ from: "ai", text: "No transcript is available for this session yet.", time: "—" });
  }

  const rec = i.interviewReportRecording || {};
  const doneAt = c.interview?.completedAt || c.interview?.endedAt;
  const interviewedOn = doneAt
    ? new Date(doneAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : c.createdAt && i.mounted
      ? new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "—";

  const totalTime =
    rec.duration_label ||
    (i.recordingDurationSec ? (i.formatDuration || formatDurationM)(i.recordingDurationSec) : i.interviewTranscript ? `${Math.max(1, Math.round((i.wordCount / 150) * 5))} mins (est.)` : "—");

  const rawJoin = c.interview?.expectedJoiningDate;
  const expectedJoining = rawJoin && i.mounted ? new Date(rawJoin).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const rawComb = Number(scores.combined_score);
  const fitPct = (() => {
    if (Number.isFinite(rawComb) && rawComb > 0) {
      return Math.min(100, rawComb <= 10 ? Math.round(rawComb * 10) : Math.round(rawComb));
    }
    return Math.min(100, Math.round((i.combinedScore / 10) * 100));
  })();

  const { topStrengths, topRisks } = buildTopStrengthsRisks({
    technicalPct,
    techTag,
    comm,
    fitPct,
    proctoringRows,
    transcript,
    skills,
  });

  return {
    backHref: "/admin/candidates",
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.drive?.role || c.drive?.title || "Product designer").trim() || "Role",
    cityBadge: String(c.location || "Location").split(",")[0].trim() || "—",
    locationLine: c.location || "—",
    interviewedOn,
    totalTime,
    fitPercent: fitPct,
    fitLabel: fitLabelFromPct(fitPct),
    stats: {
      workExp: "—",
      currentHourly: "—",
      expectedHourly: "—",
      expectedJoining,
      feedbackStars: (() => {
        const r = c.interview?.candidateRating;
        if (typeof r === "number" && r > 0) return Math.max(0, Math.min(5, r));
        return 4.2;
      })(),
    },
    technical: { percent: technicalPct, questions: questionsAsked, tag: techTag },
    comm,
    aiBullets,
    proctoringRows,
    engagementVibes,
    cognitiveInsights,
    integritySignals,
    skills,
    topStrengths,
    topRisks,
    transcript,
    videoUrl: i.interviewRecordingUrl || null,
    recordingDurationSec: i.recordingDurationSec,
    snapshots: (() => {
      const s = c.interview?.snapshots || c.assessment?.snapshots;
      if (Array.isArray(s)) return s.map(String).filter(Boolean);
      if (typeof s === "string") {
        try {
          const p = JSON.parse(s);
          return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
        } catch {
          return [];
        }
      }
      return [];
    })(),
    proctoringHeadline: i.proctoringVerdictSummary,
  };
}

/* --- subviews --- */
const ARC_LEN = Math.PI * 80;
export function SemicircleGauge({ value, fitLabel }: { value: number; fitLabel: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const visible = (pct / 100) * ARC_LEN;
  const rest = Math.max(0.01, ARC_LEN - visible);
  return (
    <div className="relative flex h-28 w-44 flex-col items-center justify-end">
      <svg viewBox="0 0 200 100" className="h-24 w-44">
        <defs>
          <linearGradient id="gHyring" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E53935" />
            <stop offset="50%" stopColor="#F6C344" />
            <stop offset="100%" stopColor="#1E9D55" />
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#E4E6EA" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gHyring)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${visible} ${rest}`}
        />
      </svg>
      <p className="text-center text-[10px] font-bold uppercase leading-tight text-[#5C6370]">
        {pct}%<br />
        <span className="text-xs font-extrabold text-[#1A1D22]">{fitLabel}</span>
      </p>
    </div>
  );
}

export function Donut({
  pct,
  questions,
  questionsLabel,
}: {
  pct: number;
  questions: number;
  questionsLabel?: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const c = 2 * Math.PI * 40;
  const dash = (p / 100) * c;
  return (
    <div className="relative mx-auto w-[min(11rem,100%)]">
      <div className="relative aspect-square w-full max-w-[176px] mx-auto">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="40" fill="none" stroke="#E8EAED" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="url(#donGradHyring)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset="0"
          />
          <defs>
            <linearGradient id="donGradHyring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1E9D55" />
              <stop offset="50%" stopColor="#F0A12A" />
              <stop offset="100%" stopColor="#1E6FD6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[1.6rem] font-extrabold leading-none tracking-tight text-[#1A1D22] sm:text-[1.75rem]">{p}%</p>
          <p className="mt-1.5 text-[11px] font-bold uppercase leading-tight text-[#5C6370]">
            {questionsLabel || `${questions} questions`}
          </p>
        </div>
      </div>
    </div>
  );
}

const COMM_LABELS: {
  key: "pronunciation" | "grammar" | "vocabulary" | "minimalFiller" | "fluency";
  label: string;
}[] = [
  { key: "pronunciation", label: "Pronunciation" },
  { key: "grammar", label: "Grammar" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "minimalFiller", label: "Minimal filler" },
  { key: "fluency", label: "Fluency" },
];

function cornerLabelLines(full: string): [string, string?] {
  if (full === "Pronunciation") return ["Pronun-", "ciation"];
  if (full === "Minimal filler") return ["Minimal", "filler"];
  if (full.length > 12) return [full.slice(0, 9) + "…", undefined];
  return [full, undefined];
}

/** Minimal pentagon: neutral lines + single fill, dimension names at the five points. */
function Radar5Plot({ values }: { values: { pronunciation: number; grammar: number; vocabulary: number; minimalFiller: number; fluency: number } }) {
  const vals = [values.pronunciation, values.grammar, values.vocabulary, values.minimalFiller, values.fluency];
  const n = 5;
  const cx = 50;
  const cy = 50;
  const r = 32;
  const rOuter = 46;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pts = vals.map((v, i) => {
    const t = (Math.max(0, Math.min(100, v)) / 100) * r;
    return `${cx + t * Math.cos(angle(i))},${cy + t * Math.sin(angle(i))}`;
  });
  return (
    <div className="w-full min-h-[170px] sm:min-h-[190px]">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Communication dimensions (five metrics)"
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={Array.from({ length: n }, (_, i) => {
              const t = f * r;
              return `${cx + t * Math.cos(angle(i))},${cy + t * Math.sin(angle(i))}`;
            }).join(" ")}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="0.45"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(angle(i))}
            y2={cy + r * Math.sin(angle(i))}
            stroke="#E5E7EB"
            strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon
          points={pts.join(" ")}
          fill="rgb(15 23 42 / 0.06)"
          stroke="#1A1D22"
          strokeWidth="0.7"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
          vectorEffect="non-scaling-stroke"
        />
        {COMM_LABELS.map((def, i) => {
          const ax = angle(i);
          const ox = cx + rOuter * Math.cos(ax);
          const oy = cy + rOuter * Math.sin(ax);
          const [line1, line2] = cornerLabelLines(def.label);
          return (
            <text
              key={def.key}
              x={ox}
              y={line2 ? oy - 1.1 : oy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="2.4"
              fontWeight="500"
              fill="#4B5563"
              style={{ fontFamily: "var(--font-inter, ui-sans-serif, system-ui, sans-serif)" }}
            >
              {line1}
              {line2 && (
                <tspan x={ox} dy="2.9">
                  {line2}
                </tspan>
              )}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function CommunicationScoreCard({ comm }: { comm: HyringInterviewViewModel["comm"] }) {
  const avg = Math.round(
    COMM_LABELS.reduce((s, { key }) => s + Math.max(0, Math.min(100, Number(comm[key]) || 0)), 0) / COMM_LABELS.length
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-2 pb-3 pt-1 sm:px-3 sm:pb-4">
      <Radar5Plot values={comm} />
      <p className="text-center text-[11px] font-medium tabular-nums text-neutral-500">Average {avg} / 100</p>
    </div>
  );
}

export function TechnicalScoreCard({
  pct,
  questions,
  tag: _tag,
  label = "Session score",
  questionsLabel,
  summary,
  footerNote = "Weighted from answered items",
}: {
  pct: number;
  questions: number;
  tag: string;
  label?: string;
  questionsLabel?: string;
  summary?: string;
  footerNote?: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 px-2 pb-3 pt-1 sm:px-3 sm:pb-4 sm:pt-2">
      <Donut pct={p} questions={questions} questionsLabel={questionsLabel} />
      {summary ? <p className="px-2 text-center text-[12px] font-semibold leading-5 text-[#1A1D22]">{summary}</p> : null}
      <div className="px-0.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-semibold text-[#5C6370]">{label}</span>
          <span className="text-[13px] font-extrabold tabular-nums text-[#1A1D22]">{p}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[#E8EAED]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#1E6FD6] via-[#5BA3E8] to-[#1E9D55] transition-[width] duration-500"
            style={{ width: `${p}%` }}
          />
        </div>
        <p className="mt-2 text-center text-[11px] font-medium text-[#6B7079]">{footerNote}</p>
      </div>
    </div>
  );
}

function TabStrip({ value, onChange }: { value: IntelId; onChange: (v: IntelId) => void }) {
  const base = "shrink-0 rounded-lg px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-widest transition-colors";
  return (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["integrity", "Integrity signals"],
          ["engagement", "Engagement vibes"],
          ["cognitive", "Cognitive insights"],
        ] as [IntelId, string][]
      ).map(([k, l]) => (
        <button
          type="button"
          key={k}
          onClick={() => onChange(k)}
          className={cn(
            base,
            value === k ? "bg-neutral-900 text-white shadow-sm" : "bg-[#E8E8E8] text-neutral-900 hover:bg-[#DCDCDC]"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Page background + card shell — shared with candidate resume and interview report */
export const HYRING_REPORT_PAGE_BG = "bg-[#EEF0F3]";
export const HYRING_REPORT_CARD = "rounded-2xl border border-[#DDE1E5] bg-white shadow-sm";
const bgPage = HYRING_REPORT_PAGE_BG;
const card = HYRING_REPORT_CARD;

export function InterviewReportHyring({
  model,
  showHeader = true,
  headerActions,
}: {
  model: HyringInterviewViewModel;
  showHeader?: boolean;
  headerActions?: ReactNode;
}) {
  const [intel, setIntel] = useState<IntelId>("integrity");
  return (
    <div className={cn("w-full", bgPage)}>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-2 sm:px-6">
        {showHeader && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E5] pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={model.backHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#0D4D2E] shadow-sm hover:bg-[#F7FAF8]"
              >
                <ArrowLeft className="h-4 w-4" />
                Interview report
              </Link>
            </div>
            {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
          </div>
        )}

        <div className={cn(card, "p-4 sm:p-6")}>
          <div className="flex flex-col justify-between gap-6 lg:flex-row">
            <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-white shadow">
                {model.displayAvatar ? (
                  <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-extrabold tracking-tight text-[#1A1D22] sm:text-3xl">{model.fullName}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-md bg-[#F0F1F3] px-2.5 py-0.5 text-[11px] font-semibold text-[#3D434D]">
                    {model.roleLabel}
                  </span>
                  <span className="rounded-md bg-[#F0F1F3] px-2.5 py-0.5 text-[11px] font-semibold text-[#3D434D]">
                    {model.cityBadge}
                  </span>
                </div>
                <p className="mt-3 text-[12px] text-[#5C6370]">
                  <span className="font-semibold text-[#1A1D22]">Interviewed on</span> {model.interviewedOn} ·
                  <span className="ml-1 font-semibold">Total time</span> {model.totalTime} ·
                  <span className="ml-1 font-semibold">Location</span> {model.locationLine}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#B8974E] text-[8px] font-black uppercase text-[#8B6A1E]"
                title="Sealed for review"
              >
                HYR
              </div>
              <SemicircleGauge value={model.fitPercent} fitLabel={model.fitLabel} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Total work experience", model.stats.workExp],
            ["Current hourly salary", model.stats.currentHourly],
            ["Expected hourly salary", model.stats.expectedHourly],
            ["Expected joining date", model.stats.expectedJoining],
          ].map(([a, b]) => (
            <div key={String(a)} className={cn(card, "p-3 text-center sm:text-left")}>
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">{a}</p>
              <p className="mt-1 text-sm font-extrabold text-[#1A1D22]">{b}</p>
            </div>
          ))}
          <div className={cn(card, "flex flex-col items-center justify-center p-3 sm:items-stretch sm:text-left")}>
            <p className="text-center text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079] sm:text-left">Candidate feedback</p>
            <div className="mt-1 flex items-center justify-center gap-0.5 sm:justify-start">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn("h-4 w-4", i + 1 <= model.stats.feedbackStars - 0.1 ? "fill-amber-400 text-amber-500" : "text-[#DDE1E5]")}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={cn(card, "flex flex-col overflow-hidden")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Technical score</p>
              <span className="rounded-md bg-[#E6F4EC] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#0D4D2E]">
                {model.technical.tag}
              </span>
            </div>
            <TechnicalScoreCard pct={model.technical.percent} questions={model.technical.questions} tag={model.technical.tag} />
          </div>
          <div className={cn(card, "flex flex-col")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Communication score</p>
              <span className="rounded-md bg-[#E0EDFF] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#0B5FFF]">
                {model.comm.tag}
              </span>
            </div>
            <CommunicationScoreCard comm={model.comm} />
          </div>
          <div className={cn(card, "p-4")}>
            <div className="mb-3 flex items-center gap-2 text-[#0D4D2E]">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-extrabold">AI summary</p>
            </div>
            <ul className="space-y-2.5 text-[13px] leading-relaxed text-[#3D434D]">
              {model.aiBullets.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-[#1E9D55]">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={cn(card, "p-4 sm:p-5")}>
          <p className="mb-4 text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370]">Hiring readout</p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:gap-10">
            <div>
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-[#0D4D2E]">Top strengths</p>
              <ol className="m-0 list-none space-y-2.5 p-0" role="list" aria-label="Top strengths">
                {model.topStrengths.map((t, i) => (
                  <li key={`strength-${i}`} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-[10px] font-extrabold text-[#0D4D2E]">
                      {i + 1}
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-[#9A3412]">Top risks</p>
              <ol className="m-0 list-none space-y-2.5 p-0" role="list" aria-label="Top risks">
                {model.topRisks.map((t, i) => (
                  <li key={`risk-${i}`} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-extrabold text-amber-900">
                      {i + 1}
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className={cn(card, "space-y-4 p-4 sm:p-5")}>
            <h3 className="text-base font-bold tracking-tight text-neutral-900">Interview intelligence</h3>
            <TabStrip value={intel} onChange={setIntel} />
            <div>
              {intel === "integrity" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {model.integritySignals.map((row) => (
                    <IntelMetricCard key={row.id} row={row} />
                  ))}
                </div>
              )}
              {intel === "engagement" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {model.engagementVibes.map((row) => (
                    <IntelMetricCard key={row.id} row={row} />
                  ))}
                </div>
              )}
              {intel === "cognitive" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {model.cognitiveInsights.map((row) => (
                    <IntelMetricCard key={row.id} row={row} />
                  ))}
                </div>
              )}
            </div>
            </div>
          </div>
          <div className="min-h-0 lg:col-span-5">
            <div className={cn(card, "flex min-h-0 flex-col overflow-hidden p-0")}>
              <div className="border-b border-[#E8EAED] px-4 py-3">
                <h3 className="text-sm font-extrabold text-[#1A1D22]">Skill ratings</h3>
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
                {model.skills.map((s) => (
                  <div
                    key={s.name + s.questions}
                    className="flex items-center justify-between border-b border-[#EEF0F3] py-2 last:border-0"
                  >
                    <p className="text-[12px] font-semibold text-[#1A1D22]">
                      {s.name} <span className="text-[#6B7079]">({s.questions} questions)</span>
                    </p>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn("h-3.5 w-3.5", i < s.stars ? "fill-[#1E9D55] text-[#1E9D55]" : "text-[#DDE1E5]")}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={cn(card, "flex min-h-0 min-w-0 flex-col p-0")}>
            <div className="border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold">Transcript</p>
            </div>
            <div className="max-h-[420px] space-y-3 overflow-y-auto p-3">
              {model.transcript.map((line, i) => {
                const isUser = line.from === "user";
                return (
                  <div
                    key={i}
                    className={cn("flex gap-2 rounded-lg border p-2.5", isUser ? "border-[#C9E2FF] bg-[#F4F8FF]" : "border-[#E8EAED] bg-white")}
                    role="presentation"
                  >
                    {isUser ? <User className="mt-0.5 h-4 w-4 shrink-0 text-[#0B5FFF]" /> : <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#0D4D2E]" />}
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-[#6B7079]">{isUser ? "Candidate" : "AI"}</span>
                        {line.qBadge && (
                          <span
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-[8px] font-extrabold uppercase",
                              line.qBadge === "AVERAGE" && "border-amber-200 bg-amber-50 text-amber-800",
                              line.qBadge === "STRONG" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                              (line.qBadge === "FAIR" || line.qBadge === "PENDING") && "border-blue-200 bg-blue-50 text-blue-800"
                            )}
                          >
                            {line.qBadge}
                          </span>
                        )}
                        {line.bad && <span className="text-red-500">🚩</span>}
                        <span className="text-[9px] text-[#8C9299]">{line.time}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#1A1D22]">{line.text}</p>
                      {isUser && <Play className="mt-1 h-3.5 w-3.5 text-[#0B5FFF] opacity-60" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="min-h-0 min-w-0">
            <div className={cn(card, "overflow-hidden p-0")}>
              <div className="aspect-video w-full border-b border-[#E8EAED] bg-black">
                {model.videoUrl ? (
                  <Plyr
                    key={model.videoUrl}
                    source={{ type: "video", sources: [{ src: model.videoUrl, type: "video/mp4" }] }}
                    options={{ duration: model.recordingDurationSec || undefined }}
                  />
                ) : (
                  <div className="flex h-full w-full min-h-[200px] items-center justify-center text-[10px] font-bold uppercase tracking-widest text-white/50">
                    Video not available
                  </div>
                )}
              </div>
              {model.snapshots.length > 0 && (
                <div className="grid grid-cols-4 gap-1 p-2">
                  {model.snapshots.slice(0, 4).map((src) => (
                    <div key={src} className="relative aspect-video w-full overflow-hidden rounded border border-[#E8EAED]">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-amber-100 bg-amber-50/80 px-3 py-2 text-[12px] font-semibold text-amber-900">
                {model.proctoringHeadline}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
