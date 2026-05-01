"use client";

import { useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Play,
  Search,
  Shield,
  Shirt,
  Smile,
  Sparkles,
  Star,
  ChevronDown,
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
  details?: string[];
};

type IntelId = "integrity" | "behavioral" | "cognitive";
type QBadge = "FAIR" | "AVERAGE" | "STRONG" | "PENDING";

export type HyringInterviewViewModel = {
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
  recommendationStars: number;
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
  comm: { pronunciation: number; grammar: number; vocabulary: number; minimalFiller: number; fluency: number; tag: string; commSummary: string };
  aiBullets: string[];
  proctoringRows: { key: string; label: string; value: string; bad: boolean }[];
  engagementVibes: IntelSignalRow[];
  cognitiveInsights: IntelSignalRow[];
  integritySignals: IntelSignalRow[];
  behavioralAnalysis: Record<string, any>;
  skills: { name: string; stars: number; status: string; scoreLabel: string; evidence?: string }[];
  /** Ranked 1–3; derived in builder from scores, transcript, proctoring, skills. */
  topStrengths: string[];
  topRisks: string[];
  transcript: { from: "ai" | "user"; text: string; time?: string; qBadge?: QBadge; bad?: boolean; seekSeconds?: number; seekLabel?: string }[];
  questionAnalysis: { id: number; question: string; answer: string; reasoning: string; score: string; qBadge: QBadge; bad: boolean }[];
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

function formatClockTime(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
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

function recommendationFromPct(p: number) {
  if (p >= 80) return "Strong Hire";
  if (p >= 60) return "Hire";
  if (p >= 40) return "Review";
  return "No Hire";
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
      details: [
        faceLike >= 3 ? `Posture leaned or shifted ${faceLike} times.` : faceLike >= 1 ? `Posture adjusted ${faceLike} time${faceLike === 1 ? "" : "s"}.` : "Posture stayed steady throughout the session.",
        "This is a visual-session observation, not a standalone verdict.",
      ],
      ...(faceLike >= 3
        ? { badge: "Leaning", tone: "rose" as const }
        : faceLike >= 1
          ? { badge: "Adjusting", tone: "amber" as const }
          : { badge: "Upright", tone: "emerald" as const }),
    },
    {
      id: "facial",
      label: "Facial expressions",
      icon: "smile",
      badge: "Neutral",
      tone: "sky",
      details: ["No strong expression spikes were detected in the session.", "Useful as context only; not a decision signal by itself."],
    },
    {
      id: "eye",
      label: "Eye contact",
      icon: "eye",
      details: [
        gazeC >= 1 ? `Eye contact drifted away from camera ${gazeC} time${gazeC === 1 ? "" : "s"}.` : "Eye contact remained steady during the interview.",
        "Watch this together with other signals like tab switching and response quality.",
      ],
      ...(gazeC >= 1
        ? { badge: "Occasional", tone: "amber" as const }
        : { badge: "Steady", tone: "emerald" as const }),
    },
    {
      id: "attire",
      label: "Professional attire",
      icon: "shirt",
      badge: "Not assessed",
      tone: "slate",
      details: ["Appearance is not scored automatically here.", "Kept as a contextual note only."],
    },
  ];
}

function buildCognitiveFromComm(
  cogInsights: Record<string, unknown>,
  interviewScore: number,
  wordCount: number,
  technicalPct: number
): IntelSignalRow[] {
  const toN = (v: unknown, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fb;
  };

  // Real cognitive insights from AI report (GPT-4o analyzed the transcript)
  const clarityN = toN(cogInsights.clarity, 60);
  const depthN = toN(cogInsights.depth_of_knowledge, 62);
  const probN = toN(cogInsights.problem_solving, technicalPct);
  const logN = toN(cogInsights.logical_thinking, 65);
  const cogSummary = String(cogInsights.summary || "").trim();

  return [
    {
      id: "c1",
      label: "Clarity",
      icon: "activity",
      details: [`Clarity score: ${clarityN}/100.`, "How clearly the candidate articulated and expressed ideas across all answers."],
      ...cognitiveLabel(clarityN)
    },
    {
      id: "c2",
      label: "Confidence",
      icon: "zap",
      details: [`Confidence score: ${logN}/100.`, "Assertiveness, decisiveness, and certainty demonstrated in responses."],
      ...cognitiveLabel(logN)
    },
    {
      id: "c3",
      label: "Fluency",
      icon: "star",
      details: [`Fluency score: ${depthN}/100.`, "Smooth delivery and coherent expression of thoughts."],
      ...cognitiveLabel(depthN)
    },
    {
      id: "c4",
      label: "Depth of knowledge",
      icon: "search",
      details: [`Depth score: ${depthN}/100.`, "Level of technical understanding and detail demonstrated in interview answers."],
      ...cognitiveLabel(depthN)
    },
    {
      id: "c5",
      label: "Problem solving",
      icon: "box",
      details: [`Problem solving score: ${probN}/100.`, "Quality of approach to technical challenges — methodology, reasoning, consideration of edge cases."],
      ...cognitiveLabel(probN)
    },
    {
      id: "c6",
      label: "Logical thinking",
      icon: "git-branch",
      details: [
        `Logical thinking score: ${logN}/100.`,
        "Structure, coherence, and consistency of reasoning across all responses.",
        cogSummary ? `Overall: ${cogSummary}` : undefined
      ].filter(Boolean) as string[],
      ...cognitiveLabel(logN)
    },
  ];
}

function buildIntegritySignals(rows: { key: string; label: string; value: string; bad: boolean }[]): IntelSignalRow[] {
  return rows.map((r) => ({
    id: r.key,
    label: r.label,
    badge: r.value,
    tone: r.bad ? "rose" : "emerald",
    icon: r.bad ? "alert" : "shield",
    details: [
      `Observed ${r.value.toLowerCase()} for this signal.`,
      r.bad ? "This was treated as a higher-risk integrity event." : "This was not treated as a high-risk integrity event.",
    ],
  }));
}


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
  const answerCount = Math.max(1, strongN + fairN);

  const topStrengths: string[] = [];
  if (args.fitPct >= 80) topStrengths.push("Overall fit is strong for this role");
  else if (args.fitPct >= 60) topStrengths.push("Overall fit is workable and worth advancing");

  if (args.technicalPct >= 70) topStrengths.push(`Technical answers are solid across ${answerCount} scored responses`);
  else if (args.technicalPct >= 55) topStrengths.push("Technical signal is steady, with room for stronger depth");

  if (commAvg >= 70) topStrengths.push("Communication is clear, structured, and easy to follow");
  else if (commAvg >= 55) topStrengths.push("Communication is understandable and steady");

  if (topSkill && topSkill.stars >= 4) topStrengths.push(`Best technical signal appears in ${topSkill.name}`);
  if (strongN >= 2) topStrengths.push("Multiple answers landed in the top score band");
  if (!anyProctoringBad) topStrengths.push("No material integrity or environment flags showed up in review");

  if (topStrengths.length === 0) {
    topStrengths.push("No clear strengths surfaced beyond the scored interview data");
  }
  topStrengths.length = Math.min(topStrengths.length, 3);

  const topRisks: string[] = [];
  if (args.technicalPct < 50) topRisks.push("Technical depth is below a typical pass line");
  if (args.techTag === "WEAK") topRisks.push("Technical signal sits in the weak band and should be validated in practice");
  if (fairN >= 2) topRisks.push("Several answers scored weakly, so probe the gaps in the next round");
  if (anyProctoringBad) topRisks.push("Proctoring or environment flags need a human read before relying on this session alone");
  if (commAvg < 50) topRisks.push("Communication is soft for roles that need client-facing clarity or writing");
  if (args.fitPct < 48) topRisks.push("Overall fit is on the low side for this requisition");
  if (args.fitPct >= 60 && args.fitPct < 80 && args.technicalPct < 60) {
    topRisks.push("Advancement is possible, but technical depth still needs a stronger proof point");
  }

  if (topRisks.length === 0) {
    topRisks.push("No major automated risk flags surfaced in this session");
  }
  topRisks.length = Math.min(topRisks.length, 3);

  return { topStrengths, topRisks };
}
export function IntelMetricCard({ row }: { row: IntelSignalRow }) {
  const Icon = INTEL_ICON_MAP[row.icon];
  return (
    <DropdownMenu>
      <div className="flex items-center justify-between gap-3 rounded-[18px] border border-neutral-200/70 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-neutral-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-neutral-900" strokeWidth={1.5} />
          <span className="min-w-0 text-[13px] font-semibold leading-snug text-neutral-900">{row.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold leading-none",
              BADGE_PILL[row.tone]
            )}
          >
            {row.badge}
          </span>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200/60 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
              aria-label={`Show details for ${row.label}`}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </div>
      </div>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-72 max-h-80 overflow-y-auto bg-white p-0 shadow-2xl border-neutral-200"
      >
        <div className="px-4 pt-4 pb-2">
          <DropdownMenuLabel className="p-0 text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-500">
            What happened
          </DropdownMenuLabel>
        </div>
        <DropdownMenuSeparator className="bg-neutral-100" />
        <div className="space-y-3 px-4 py-4">
          {(row.details?.length ? row.details : [`${row.label} is currently marked as ${row.badge}.`, "No additional detail is attached to this signal."]).map((line, idx) => (
            <p key={`${row.id}-${idx}`} className="text-[12.5px] leading-relaxed text-neutral-700">
              {line}
            </p>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SkillRatingsContainer({ skills }: { skills: { name: string; stars: number; status: string; scoreLabel: string; evidence?: string }[] }) {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  return (
    <div
      className="max-h-[320px] space-y-2 overflow-y-auto p-3 pr-2 overscroll-contain"
      style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}
    >
      {skills.map((s) => (
        <div
          key={`${s.name}-${s.status}-${s.scoreLabel}`}
          className="border-b border-[#EEF0F3] py-2 last:border-0"
        >
          <button
            onClick={() => setExpandedSkill(expandedSkill === s.name ? null : s.name)}
            className="w-full flex items-center justify-between hover:bg-[#F9FAFB] rounded px-1 transition-colors"
          >
            <div className="min-w-0 pr-3 text-left">
              <p className="text-[12px] font-semibold text-[#1A1D22]">{s.name}</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-[#6B7079]">
                {s.status} {s.scoreLabel !== "—" ? `• ${s.scoreLabel}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn("h-3.5 w-3.5", i < s.stars ? "fill-[#1E9D55] text-[#1E9D55]" : "text-[#DDE1E5]")}
                />
              ))}
            </div>
          </button>
          {expandedSkill === s.name && s.evidence && (
            <div className="mt-2 ml-1 text-[11px] text-[#475467] bg-[#F9FAFB] rounded px-2 py-1.5 border-l-2 border-[#1E9D55]">
              <p className="font-semibold text-[#6B7079] mb-1">Evidence:</p>
              <p className="leading-relaxed">{s.evidence}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function _formatSignalSummary(signal: any): string {
  // Recovery signals get a positive prefix
  const isRecovery = signal.signal === "ownership_clarified" || signal.signal === "example_given" || signal.signal === "contradiction_resolved";
  const prefix = isRecovery ? "✓ " : "● ";

  // Use the LLM-generated interpretation from the backend if available
  if (signal.interpretation) {
    // Extract first sentence only for one-liner display
    const firstSentence = signal.interpretation.split('.')[0] + '.';
    return prefix + firstSentence.trim();
  }

  // Fallback for signals without LLM interpretation
  const fallbacks: Record<string, string> = {
    ownership_ambiguity: "Candidate uses team language without demonstrating personal ownership",
    example_evasion: "Candidate gave theoretical answer when asked for concrete example",
    resume_claim_mismatch: "Resume claims lack concrete project details or hands-on evidence",
    follow_up_collapse: "Strong first answer but follow-up lost depth and specifics sharply",
    latency_mismatch: "Follow-up answer unnaturally compressed — suggests evasion or guessing",
    complexity_latency_mismatch: "Complex question answered too fast, simple question too slow",
    ownership_clarified: "Initially used team language but clarified personal ownership when probed",
    example_given: "Initially gave theoretical answer but provided concrete example when asked",
    contradiction: "Candidate made conflicting statements about a verifiable fact — needs recruiter review",
    contradiction_resolved: "Candidate clarified and resolved a contradiction convincingly when probed",
    meta_question: "Candidate checked if interviewer could hear them — no integrity concern, informational only",
    depth_decay: "Answer quality declined progressively across topics — may indicate fatigue or rehearsed early answers",
  };

  return prefix + (fallbacks[signal.signal] || `Signal detected: ${signal.signal}`);
}

export function buildHyringInterviewViewModel(i: {
  backHref?: string;
  candidate: { fullName?: string; createdAt?: string; location?: string; passportUrl?: string; interview?: any; assessment?: any; drive?: { role?: string; title?: string } };
  mounted: boolean;
  displayAvatar: string;
  interviewReportScores: Record<string, any>;
  interviewReportRecording: Record<string, any>;
  interviewReportCommunication: Record<string, any>;
  interviewReportCognitiveInsights: Record<string, any>;
  interviewReportBehavioralAnalysis: Record<string, any>;
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
  const cogInsights = i.interviewReportCognitiveInsights || {};
  const behavAnalysis = i.interviewReportBehavioralAnalysis || {};
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

  // Derive communication scores from actual transcript when AI report values are missing.
  // Avoids word-count math fallbacks which are inaccurate.
  const derivedComm = (() => {
    const answers = i.interviewSessionRows.map((r) => r.answer).filter(Boolean);
    if (answers.length === 0) return null;

    const fullText = answers.join(" ");
    const words = fullText.split(/\s+/).filter(Boolean);
    const totalWords = words.length;
    if (totalWords < 10) return null;

    // Filler word ratio — penalise but don't hammer natural speech
    const fillerMatches = fullText.match(/\b(um|uh|like|you know|basically|literally|right\?|sort of|kind of|i mean)\b/gi) || [];
    const fillerRatio = fillerMatches.length / totalWords; // 0–1

    // Sentence count from actual punctuation in text
    const sentences = fullText.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 4);
    const avgWordsPerSentence = sentences.length > 0 ? totalWords / sentences.length : totalWords;

    // Vocabulary richness: unique words / total words (Type-Token Ratio capped)
    const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))).size;
    const ttr = uniqueWords / totalWords; // 0–1, higher = richer

    // Confidence signals: count hedging phrases
    const hedgeMatches = fullText.match(/\b(maybe|i think|i guess|not sure|i believe|probably|might|could be|i suppose)\b/gi) || [];
    const hedgeRatio = hedgeMatches.length / Math.max(1, sentences.length); // per sentence

    // --- Score each dimension 0–100 ---

    // Clarity: how well ideas form into full sentences (penalise very short or very long rambling)
    const sentenceLenScore = avgWordsPerSentence >= 8 && avgWordsPerSentence <= 30
      ? 100
      : avgWordsPerSentence < 4
        ? 45
        : avgWordsPerSentence > 45
          ? 60
          : 75;
    const clarityScore = Math.round(sentenceLenScore * (1 - fillerRatio * 0.4));

    // Grammar: penalise fragment-heavy or overly broken answers (proxy via sentence integrity)
    const fragmentRatio = sentences.filter((s) => s.split(/\s+/).length < 4).length / Math.max(1, sentences.length);
    const grammarScore = Math.round(Math.max(35, 90 - fragmentRatio * 50 - fillerRatio * 30));

    // Fluency: smooth delivery — low fillers = high fluency
    const fluencyScore = Math.round(Math.max(30, Math.min(95, 100 - fillerRatio * 200)));

    // Vocabulary: type-token ratio mapped to 0–100, capped at 85 (natural ceiling)
    const vocabScore = Math.round(Math.min(85, Math.max(30, ttr * 150)));

    // Confidence: fewer hedges = more confident
    const confidenceScore = Math.round(Math.max(30, Math.min(90, 85 - hedgeRatio * 20)));

    return { clarityScore, grammarScore, fluencyScore, vocabScore, confidenceScore };
  })();

  const comm = {
    // Clarity — from AI report, else derived from transcript, else reasonable mid-point
    pronunciation: toPct(
      com.pronunciation ?? com.clarity,
      derivedComm ? derivedComm.clarityScore : 50,
    ),
    grammar: toPct(
      com.grammar,
      derivedComm ? derivedComm.grammarScore : 50,
    ),
    // vocabulary slot is displayed as "Confidence" on the card
    vocabulary: toPct(
      com.confidence ?? com.vocabulary ?? com.depth,
      derivedComm ? derivedComm.confidenceScore : 50,
    ),
    minimalFiller: toPct(
      com.fluency ?? com.filler ?? com.minimal_filler,
      derivedComm ? derivedComm.fluencyScore : 50,
    ),
    fluency: toPct(
      com.fluency,
      derivedComm ? derivedComm.fluencyScore : 50,
    ),
    tag: String(scores.cefr_label || i.communicationStatus).toUpperCase() || "AVERAGE",
    commSummary: String(com.summary || "").trim(),
  };

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
  const cognitiveInsights = buildCognitiveFromComm(cogInsights, i.interviewScore, i.wordCount, technicalPct);
  const integritySignals = buildIntegritySignals(proctoringRows);

  const normalizeSkillName = (value: string) =>
    value
      .replace(/\b(question|q\d+|round|interview|asked|asked about)\b/gi, "")
      .replace(/[\-  :]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const isGenericSkillName = (value: string) => {
    const v = value.toLowerCase();
    return !v || /^question\s*\d+$/i.test(value) || v.length < 3 || v.includes("interview") || v === "skill";
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
    existing.scoreLabel = existing.scoreLabel || scoreLabel;
    existing.evidence = existing.evidence || evidence;
  };
  (i.interviewReportSkills || []).forEach((s: any) => {
    const name = String(s?.skill || s?.title || s?.name || "").trim();
    const sn = parseFloat(String(s?.score || "").replace(/[^\d.]/g, ""));
    const stars = Number.isFinite(sn) ? Math.max(0, Math.min(5, Math.round(sn / 2))) : Math.max(1, Math.min(5, Math.round((technicalPct / 100) * 5)));
    const status = String(s?.status || "").trim();
    const scoreLabel = String(s?.score || "").trim();
    const evidence = String(s?.evidence || "").trim();
    if (name) addSkill(name, stars, status || "NOT TESTED", scoreLabel || "—", evidence || undefined);
  });
  const skillSourceRows = Array.isArray(i.interviewQaRows) && i.interviewQaRows.length ? i.interviewQaRows : i.interviewSessionRows || [];
  skillSourceRows.forEach((row: any) => {
    const name = String(row?.skill || row?.title || "").trim();
    if (!name) return;
    const score = parseFloat(String(row?.score || "").replace(/[^\d.]/g, ""));
    const stars = Number.isFinite(score) ? Math.max(0, Math.min(5, Math.round(score / 2))) : 3;
    const status = String(row?.status || row?.reasoning || "NOT TESTED").trim();
    const scoreLabel = String(row?.score || "—").trim();
    addSkill(name, stars, status, scoreLabel, String(row?.evidence || "").trim() || undefined);
  });
  const skills = Array.from(skillMap.values());
  if (skills.length === 0) {
    skills.push({
      name: "Role fit (JD)",
      stars: Math.max(1, Math.min(5, Math.round((technicalPct / 100) * 5))),
      status: "NOT TESTED",
      scoreLabel: "—",
    });
  }
  const transcript: HyringInterviewViewModel["transcript"] = [];
  const questionAnalysis: HyringInterviewViewModel["questionAnalysis"] = [];
  const rows = i.interviewQaRows?.length ? i.interviewQaRows : i.interviewSessionRows;
  (rows as any[]).forEach((row, idx) => {
    const q = String(row?.question || row?.title || "").trim() || `Question ${idx + 1}`;
    const a = String(row?.answer || row?.reasoning || "").trim();
    const reasoning = String(row?.reasoning || row?.analysis_reasoning || row?.answer || "").trim();
    const score = String(row?.score || "--").trim();
    const { q: b, bad } = scoreToBadge(score);
    transcript.push({ from: "ai", text: q, time: `Q${idx + 1}` });
    if (a) {
      transcript.push({ from: "user", text: a, time: "Reply", qBadge: b, bad });
    }
    questionAnalysis.push({
      id: idx,
      question: q,
      answer: a || "—",
      reasoning: reasoning || "No reasoning was returned for this question.",
      score,
      qBadge: b,
      bad,
    });
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

  const commAvg = Math.round(
    (comm.pronunciation + comm.grammar + comm.vocabulary + comm.minimalFiller + comm.fluency) / 5
  );
  const flagCount = proctoringRows.filter((row) => row.bad).length;
  const fitText = fitPct >= 80 ? "strong fit" : fitPct >= 60 ? "moderate fit" : fitPct >= 40 ? "borderline fit" : "low fit";
  const { topStrengths, topRisks } = buildTopStrengthsRisks({
    technicalPct,
    techTag,
    comm,
    fitPct,
    proctoringRows,
    transcript,
    skills,
  });
  const proctoringText =
    flagCount > 0
      ? `${flagCount} proctoring flag${flagCount === 1 ? "" : "s"} were recorded and should be reviewed.`
      : "No meaningful proctoring flags were recorded.";
  const perfectText =
    commAvg >= 70
      ? "he is strongest at keeping communication clear and structured"
      : technicalPct >= 70
        ? "he is strongest at handling core technical questions"
        : "he is strongest at staying engaged and answering in a relevant way";
  const laggingText =
    technicalPct < 70
      ? "he still needs deeper technical evidence before a final call"
      : commAvg < 70
        ? "his communication still needs more polish and fluency"
        : flagCount > 0
          ? "the session needs a human review because of the proctoring flags"
          : "there is limited risk, but more role-specific evidence would make the call safer";
  const roleName = String(c.drive?.role || c.drive?.title || "role").trim();
  const candidateFirstName = String(c.fullName || "The candidate").split(" ")[0];
  const topSkillName = skills[0]?.name || null;
  const topSkillScore = skills[0]?.scoreLabel || null;

  const aiBullets: string[] = [];

  // Overall performance
  aiBullets.push(
    fitPct >= 80
      ? `Overall a strong fit for ${roleName} — technical and communication signals both hold up.`
      : fitPct >= 60
        ? `Moderate fit for ${roleName} — solid baseline but some gaps need validation.`
        : fitPct >= 40
          ? `Borderline fit for ${roleName} — shows potential but core areas need deeper probing.`
          : `Low fit for ${roleName} based on this session — technical depth and clarity fell short.`
  );

  // Strongest area from live data
  if (topSkillName && topSkillScore) {
    aiBullets.push(`Strongest demonstrated skill: ${topSkillName} (${topSkillScore}) — answered with the most depth and clarity.`);
  } else if (commAvg >= 70) {
    aiBullets.push(`Communication was the clearest positive signal — structured, easy to follow, and confident throughout.`);
  } else if (technicalPct >= 65) {
    aiBullets.push(`Technical answers were the strongest area — showed solid working knowledge across the questions asked.`);
  }

  // Communication signal
  if (commAvg >= 70) {
    aiBullets.push(`Communication quality is strong — ${candidateFirstName} speaks clearly, uses appropriate vocabulary, and holds confidence.`);
  } else if (commAvg >= 50) {
    aiBullets.push(`Communication is acceptable but uneven — ideas come through, though fluency and confidence have room to improve.`);
  } else {
    aiBullets.push(`Communication needs work — clarity and confidence scored below average, which may affect role fit for client-facing work.`);
  }

  // Technical signal
  if (technicalPct >= 70) {
    aiBullets.push(`Technical knowledge is solid — scored ${technicalPct}% across ${questionsAsked} question${questionsAsked === 1 ? "" : "s"}, with no major gaps flagged.`);
  } else if (technicalPct >= 45) {
    aiBullets.push(`Technical depth is partial — scored ${technicalPct}% across ${questionsAsked} question${questionsAsked === 1 ? "" : "s"}; follow-up on weak areas is recommended.`);
  } else {
    aiBullets.push(`Technical performance was weak — scored ${technicalPct}% and several answers lacked enough depth for this role.`);
  }

  // Proctoring / integrity
  if (flagCount > 0) {
    aiBullets.push(`${flagCount} proctoring flag${flagCount === 1 ? "" : "s"} detected during the session — a human review of this recording is recommended before making a decision.`);
  } else {
    aiBullets.push(`No integrity or environment issues detected — session ran cleanly with no proctoring flags.`);
  }

  return {
    backHref: i.backHref || "/admin/candidates",
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.drive?.role || c.drive?.title || "Product designer").trim() || "Role",
    interviewedOn,
    totalTime,
    questionsAsked,
    skillsCovered: skills.length,
    proctoringFlags: proctoringRows.filter((row) => row.bad).length,
    recommendation: recommendationFromPct(fitPct),
    recommendationStars: Math.max(1, Math.min(5, Math.round(fitPct / 20))),
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
    behavioralAnalysis: behavAnalysis,
    skills,
    topStrengths,
    topRisks,
    transcript: (() => {
      const duration = i.recordingDurationSec || 0;
      if (!duration || transcript.length === 0) return transcript;
      const lastIndex = Math.max(1, transcript.length - 1);
      return transcript.map((line, idx) => {
        const seekSeconds = Math.max(0, Math.min(duration, Math.round((idx / lastIndex) * duration)));
        return { ...line, seekSeconds, seekLabel: formatClockTime(seekSeconds) };
      });
    })(),
    questionAnalysis,
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
  const ranked = COMM_LABELS.map(({ key, label }) => ({
    key,
    label,
    value: Math.max(0, Math.min(100, Number(comm[key]) || 0)),
  })).sort((a, b) => b.value - a.value);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const strongestText = strongest ? strongest.label : "—";
  const weakestText = weakest ? weakest.label : "—";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-2 pb-3 pt-1 sm:px-3 sm:pb-4">
      <Radar5Plot values={comm} />
      <div className="space-y-1.5 text-center">
        <p className="text-[11px] font-semibold tabular-nums text-neutral-600">Average {avg} / 100</p>
        <p className="text-[11px] text-[#6B7079]">
          Strongest: <span className="font-semibold text-[#1A1D22]">{strongestText}</span> · Needs work:{" "}
          <span className="font-semibold text-[#1A1D22]">{weakestText}</span>
        </p>
      </div>
    </div>
  );
}

export function CommunicationScoreCardDonut({ comm }: { comm: HyringInterviewViewModel["comm"] }) {
  const metrics = [
    {
      key: "clarity",
      label: "Clarity",
      color: "#6366F1",
      value: Math.round(Number(comm.pronunciation)),
    },
    {
      key: "fluency",
      label: "Fluency",
      color: "#F59E0B",
      value: Math.round(Number(comm.fluency)),
    },
    {
      key: "grammar",
      label: "Grammar",
      color: "#10B981",
      value: Math.round(Number(comm.grammar)),
    },
    {
      key: "confidence",
      label: "Confidence",
      color: "#F43F5E",
      value: Math.round(Number(comm.vocabulary)),
    },
  ].map((metric) => ({ ...metric, value: Math.max(0, Math.min(100, metric.value)) }));
  const avg = Math.round(metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length);
  const total = Math.max(1, metrics.reduce((sum, metric) => sum + metric.value, 0));
  const ranked = [...metrics].sort((a, b) => b.value - a.value);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];

  let cursor = 0;
  const segments = metrics.map((metric) => {
    const start = cursor;
    cursor += (metric.value / total) * 100;
    return `${metric.color} ${start}% ${cursor}%`;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-3 pt-1 sm:px-3 sm:pb-4 sm:pt-2">
      <div className="w-full max-w-[320px]">
        <div className="relative mx-auto mt-6 aspect-square w-full max-w-[188px]">
          <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }} />
          <div className="absolute inset-[22%] rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(232,234,237,1)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[40px] font-extrabold leading-none tracking-tight text-[#1A1D22]">{avg}</div>
              <div className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.28em] text-[#9CA3AF]">
                Overall
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 px-2">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: metric.color }} />
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#5C6370]">
                  {metric.label}
                </span>
              </div>
              <span className="text-[12px] font-extrabold tabular-nums text-[#1A1D22]">{metric.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-1 text-center">
          <p className="text-[11px] font-semibold tabular-nums text-neutral-600">Average {avg} / 100</p>
          <p className="text-[11px] leading-5 text-[#6B7079]">
            Strongest: <span className="font-semibold text-[#1A1D22]">{strongest?.label || "—"}</span> · Needs work:{" "}
            <span className="font-semibold text-[#1A1D22]">{weakest?.label || "—"}</span>
          </p>
          <p className="text-[10px] font-medium leading-5 text-[#8A919F]">
            Communication is strongest in {strongest?.label?.toLowerCase() || "clarity"} and can improve in{" "}
            {weakest?.label?.toLowerCase() || "confidence"}.
          </p>
        </div>
      </div>
    </div>
  );
}

export function CommunicationScoreCardDonutLive({ comm }: { comm: HyringInterviewViewModel["comm"] }) {
  const metrics = [
    {
      key: "clarity",
      label: "Clarity",
      color: "#6366F1",
      value: Math.round(Number(comm.pronunciation)),
    },
    {
      key: "fluency",
      label: "Fluency",
      color: "#F59E0B",
      value: Math.round(Number(comm.fluency)),
    },
    {
      key: "grammar",
      label: "Grammar",
      color: "#10B981",
      value: Math.round(Number(comm.grammar)),
    },
    {
      key: "confidence",
      label: "Confidence",
      color: "#F43F5E",
      value: Math.round(Number(comm.vocabulary)),
    },
  ].map((metric) => ({ ...metric, value: Math.max(0, Math.min(100, metric.value)) }));

  const avg = Math.round(metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length);
  const total = Math.max(1, metrics.reduce((sum, metric) => sum + metric.value, 0));
  const ranked = [...metrics].sort((a, b) => b.value - a.value);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const donutRef = useRef<HTMLDivElement | null>(null);

  let cursor = 0;
  const segments = metrics.map((metric) => {
    const start = cursor;
    cursor += (metric.value / total) * 100;
    return { ...metric, start, end: cursor };
  });
  const active = segments.find((segment) => segment.key === activeMetric) || null;
  const centerScore = active ? active.value : avg;
  const summaryText = active ? `${active.label} is live at ${active.value}/100.` : comm.commSummary || "Hover any color to reflect that metric.";

  const setMetricFromPointer = (clientX: number, clientY: number) => {
    const el = donutRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const outerRadius = Math.min(rect.width, rect.height) / 2;
    const innerRadius = outerRadius * 0.42;
    if (distance < innerRadius || distance > outerRadius) {
      setActiveMetric(null);
      return;
    }
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
    const pct = (angle / 360) * 100;
    const found = segments.find((segment) => pct >= segment.start && pct < segment.end) || segments[0];
    setActiveMetric(found?.key || null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-3 pt-1 sm:px-3 sm:pb-4 sm:pt-2">
      <div className="w-full max-w-[320px]">
        <div
          ref={donutRef}
          className="relative mx-auto mt-4 aspect-square w-full max-w-[160px] transition-transform duration-300 ease-out hover:scale-[1.04]"
          onPointerMove={(event) => setMetricFromPointer(event.clientX, event.clientY)}
          onPointerLeave={() => setActiveMetric(null)}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-full transition-all duration-300",
              active ? "shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_0_30px_rgba(11,95,255,0.14)]" : "shadow-none"
            )}
            style={{
              background: `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(", ")})`,
              transform: active ? "scale(1.01)" : "scale(1)",
            }}
          />
          <div className="absolute inset-[24%] rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(232,234,237,1)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center transition-all duration-300">
              <div className={cn("font-extrabold leading-none tracking-tight text-[#1A1D22] transition-all duration-300", active ? "text-[28px]" : "text-[36px]")}>
                {centerScore}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 px-2">
          {segments.map((metric) => {
            const isActive = activeMetric === metric.key;
            return (
              <button
                key={metric.key}
                type="button"
                onMouseEnter={() => setActiveMetric(metric.key)}
                onFocus={() => setActiveMetric(metric.key)}
                onMouseLeave={() => setActiveMetric(null)}
                className="flex items-center justify-between gap-2 rounded-md outline-none transition-transform duration-300 hover:-translate-y-0.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-300",
                      isActive ? "scale-125 shadow-[0_0_0_6px_rgba(255,255,255,0.9)]" : "scale-100"
                    )}
                    style={{ backgroundColor: metric.color }}
                  />
                  <span className={cn("text-[11px] font-extrabold uppercase tracking-widest transition-colors duration-300", isActive ? "text-[#1A1D22]" : "text-[#5C6370]")}>
                    {metric.label}
                  </span>
                </div>
                <span className={cn("text-[12px] font-extrabold tabular-nums transition-all duration-300", isActive ? "text-[#0B5FFF] scale-110" : "text-[#1A1D22]")}>
                  {metric.value}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-1 text-center">
          <p className="text-[11px] font-semibold tabular-nums text-neutral-600">Average {avg} / 100</p>
          <p className="text-[11px] leading-5 text-[#6B7079]">
            Strongest: <span className="font-semibold text-[#1A1D22]">{strongest?.label || "—"}</span> · Needs work:{" "}
            <span className="font-semibold text-[#1A1D22]">{weakest?.label || "—"}</span>
          </p>
          <p className="text-[10px] font-medium leading-5 text-[#8A919F]">{summaryText}</p>
        </div>
      </div>
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
      {summary ? (
        <p className="px-2 text-center text-[11px] font-medium leading-4 text-[#5C6370]">{summary}</p>
      ) : null}
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

function QuestionAnalysisCard({
  transcript,
  questions,
}: {
  transcript: HyringInterviewViewModel["transcript"];
  questions: HyringInterviewViewModel["questionAnalysis"];
}) {
  const playerRef = useRef<any>(null);
  return (
    <div className={cn(card, "flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0")}>
      <div className="border-b border-[#E8EAED] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-[#1A1D22]">Conversation review</p>
          <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-bold text-[#6B7079]">
            {questions.length} total
          </span>
        </div>
      </div>

      <Tabs defaultValue="transcript" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[#E8EAED] px-3 py-3">
          <TabsList className="h-auto w-full justify-start gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="transcript"
              className="rounded-full border border-transparent bg-[#F3F4F6] px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370] data-[state=active]:border-[#C9E2FF] data-[state=active]:bg-[#F4F8FF] data-[state=active]:text-[#0B5FFF]"
            >
              Transcript
            </TabsTrigger>
            <TabsTrigger
              value="analysis"
              className="rounded-full border border-transparent bg-[#F3F4F6] px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370] data-[state=active]:border-[#C9E2FF] data-[state=active]:bg-[#F4F8FF] data-[state=active]:text-[#0B5FFF]"
            >
              Question analysis
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="transcript" className="mt-0 flex h-full min-h-0 flex-1 overflow-hidden">
          <div
            className="flex h-full min-h-0 flex-1 flex-col space-y-3 overflow-y-scroll p-3 pr-2 overscroll-contain"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}
          >
            {transcript.map((line, i) => {
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
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof line.seekSeconds === "number" && playerRef.current?.plyr) {
                            playerRef.current.plyr.currentTime = line.seekSeconds;
                            void playerRef.current.plyr.play?.();
                          }
                        }}
                        className="text-[9px] font-semibold text-[#6B7079] hover:text-[#0B5FFF]"
                      >
                        {line.seekLabel || line.time}
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#1A1D22]">{line.text}</p>
                    {isUser && <Play className="mt-1 h-3.5 w-3.5 text-[#0B5FFF] opacity-60" />}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-0 flex h-full min-h-0 flex-1 overflow-hidden">
          <div
            className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-y-scroll p-3 pr-2 overscroll-contain"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}
          >
            {questions.length > 0 ? (
              questions.map((item, idx) => (
                <div key={`${item.id}-${item.question}`} className="rounded-2xl border border-[#E8EAED] bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Q{idx + 1}</p>
                      <p className="mt-1 text-[13px] font-bold leading-5 text-[#1A1D22]">{item.question}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded border px-2 py-1 text-[9px] font-extrabold uppercase",
                        item.qBadge === "AVERAGE" && "border-amber-200 bg-amber-50 text-amber-800",
                        item.qBadge === "STRONG" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                        (item.qBadge === "FAIR" || item.qBadge === "PENDING") && "border-blue-200 bg-blue-50 text-blue-800"
                      )}
                    >
                      {item.score}
                    </span>
                  </div>
                  <div className="mt-3 rounded-xl bg-[#FAFBFC] p-3">
                    <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Reasoning</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#1A1D22]">{item.reasoning}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#E8EAED] bg-[#FAFBFC] px-4 text-center text-[12px] font-medium text-[#6B7079]">
                No question analysis available yet.
              </div>
            )}
          </div>
        </TabsContent>

      </Tabs>
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
          ["behavioral", "Behavioral signals"],
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
  const topTechnicalSkill = [...model.skills].sort((a, b) => b.stars - a.stars).find((s) => s.stars > 0);
  const technicalSummary = topTechnicalSkill
    ? `${topTechnicalSkill.name}: ${topTechnicalSkill.scoreLabel}`
    : "—";
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
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
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
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[#5C6370]">
                  <span>
                    <span className="font-semibold text-[#1A1D22]">Interview date</span> {model.interviewedOn}
                  </span>
                  <span className="hidden text-[#D3D7DD] sm:inline">•</span>
                  <span>
                    <span className="font-semibold text-[#1A1D22]">Total time</span> {model.totalTime}
                  </span>
                </div>
              </div>
            </div>
            <div className="shrink-0">
              <SemicircleGauge value={model.fitPercent} fitLabel={model.fitLabel} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={cn(card, "p-3 text-center sm:text-left")}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Questions asked</p>
            <p className="mt-1 text-sm font-extrabold text-[#1A1D22]">{model.questionsAsked}</p>
          </div>
          <div className={cn(card, "p-3 text-center sm:text-left")}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Skills covered</p>
            <p className="mt-1 text-sm font-extrabold text-[#1A1D22]">{model.skillsCovered}</p>
          </div>
          <div className={cn(card, "p-3 text-center sm:text-left")}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Proctoring flags</p>
            <p className={cn("mt-1 text-sm font-extrabold", model.proctoringFlags > 0 ? "text-rose-600" : "text-emerald-700")}>
              {model.proctoringFlags}
            </p>
          </div>
          <div className={cn(card, "p-3 text-center sm:text-left")}>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">Recommendation</p>
            <div className="mt-1 flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-4 w-4",
                    i < model.recommendationStars ? "fill-amber-400 text-amber-500" : "text-[#DDE1E5]"
                  )}
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
            <TechnicalScoreCard
              pct={model.technical.percent}
              questions={model.technical.questions}
              tag={model.technical.tag}
              questionsLabel={`${model.technical.questions} Questions`}
              summary={technicalSummary}
              footerNote="From interview answers"
            />
          </div>
          <div className={cn(card, "flex flex-col")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Communication score</p>
              <span className="rounded-md bg-[#E0EDFF] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#0B5FFF]">
                {model.comm.tag}
              </span>
            </div>
            <CommunicationScoreCardDonutLive comm={model.comm} />
          </div>
          <div className={cn(card, "p-4")}>
            <div className="mb-3 flex items-center gap-1.5 text-[#0D4D2E]">
              <Sparkles className="h-3.5 w-3.5" />
              <p className="text-[10px] font-extrabold uppercase tracking-widest">AI Summary</p>
            </div>
            <ul className="space-y-2 text-[13px] leading-relaxed text-[#3D434D]">
              {model.aiBullets.map((b, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E9D55]" />
                  <span>{b}</span>
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
            <div className={cn(card, "flex min-h-0 flex-col overflow-hidden p-4 sm:p-5 lg:max-h-[420px]")}>
              <h3 className="text-base font-bold tracking-tight text-neutral-900">Interview intelligence</h3>
              <div className="mt-4">
                <TabStrip value={intel} onChange={setIntel} />
              </div>
              <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  className="min-h-0 flex-1 overflow-y-auto pr-2 overscroll-contain"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}
                >
                  {intel === "integrity" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {model.integritySignals.map((row) => (
                        <IntelMetricCard key={row.id} row={row} />
                      ))}
                    </div>
                  )}
                  {intel === "behavioral" && (
                    <div className="space-y-4">
                      {model.behavioralAnalysis && Object.entries(model.behavioralAnalysis).map(([key, value]) => {
                        if (key === "summary") {
                          return (
                            <div key={key} className="rounded-lg bg-blue-50 p-3 border border-blue-200">
                              <p className="text-[12px] font-semibold text-blue-900 mb-1">Overall Assessment</p>
                              <p className="text-[13px] leading-relaxed text-blue-800">{value}</p>
                            </div>
                          );
                        }
                        if (key === "overview") {
                          return (
                            <div key={key} className="rounded-lg bg-gray-50 p-3 border border-gray-200">
                              <p className="text-[13px] leading-relaxed text-gray-700">{value}</p>
                            </div>
                          );
                        }
                        if (Array.isArray(value) && value.length > 0) {
                          const labels: Record<string, string> = {
                            engagement_signals: "Engagement Signals",
                            consistency_signals: "Consistency & Resume Alignment",
                            communication_patterns: "Communication Patterns",
                            confidence_indicators: "Confidence Indicators",
                            integrity_flags: "Integrity Flags & Red Flags",
                            strengths_observed: "Behavioral Strengths",
                            concerns_noted: "Behavioral Concerns",
                            proctoring_signals_detected: "Proctoring Signals Detected"
                          };

                          const isSignalObjects = value.length > 0 && typeof value[0] === 'object' && 'signal' in value[0];

                          return (
                            <div key={key}>
                              <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#6B7079] mb-2">{labels[key]}</p>

                              {isSignalObjects ? (
                                <ul className="space-y-1.5">
                                  {value.map((signal: any, idx: number) => (
                                    <li key={idx} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
                                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                      <span>{_formatSignalSummary(signal)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <ul className="space-y-1.5">
                                  {value.map((bullet: string, idx: number) => (
                                    <li key={idx} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
                                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E9D55]" />
                                      <span>{bullet}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })}
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
              <div className="mt-3 border-t border-[#EEF0F3] pt-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7079]">
                Scroll to review all signals
              </div>
            </div>
          </div>
          <div className="min-h-0 lg:col-span-5">
            <div className={cn(card, "flex min-h-0 flex-col overflow-hidden p-0")}>
              <div className="sticky top-0 z-10 border-b border-[#E8EAED] bg-white px-4 py-3">
                <h3 className="text-sm font-extrabold text-[#1A1D22]">Skill ratings</h3>
              </div>
              <SkillRatingsContainer skills={model.skills} />
              <div className="border-t border-[#EEF0F3] px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7079]">
                Scroll to review all skills
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 gap-4 xl:h-[560px] xl:grid-cols-2 xl:items-stretch">
          <div className="min-h-0 min-w-0 h-full">
            <QuestionAnalysisCard transcript={model.transcript} questions={model.questionAnalysis} />
          </div>
          <div className="min-h-0 min-w-0 h-full">
            <div className={cn(card, "flex h-full min-h-0 flex-col overflow-hidden p-0")}>
              <div className="border-b border-[#E8EAED] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-[#1A1D22]">Recording</p>
                  <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-bold text-[#6B7079]">
                    {model.totalTime}
                  </span>
                </div>
              </div>
              <div className="aspect-video w-full bg-black">
                {model.videoUrl ? (
                  <Plyr
                    source={{ type: "video", sources: [{ src: model.videoUrl, type: "video/mp4" }] }}
                    options={{ duration: model.recordingDurationSec || undefined }}
                  />
                ) : (
                  <div className="flex h-full w-full min-h-[200px] items-center justify-center text-[10px] font-bold uppercase tracking-widest text-white/50">
                    Video not available
                  </div>
                )}
              </div>
              <div className="border-b border-[#E8EAED] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-[#1A1D22]">Snapshots</p>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7079]">4 most recent</span>
                </div>
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
              <div className="mt-auto border-t border-amber-100 bg-amber-50/80 px-3 py-2 text-[12px] font-semibold text-amber-900">
                {model.proctoringHeadline}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
