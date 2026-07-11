"use client";
import { useEffect, useRef, useState, forwardRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import "plyr-react/plyr.css";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle,
  ChevronDown,
  Play,
  User,
  XCircle,
  Clock,
  Globe,
  Sparkles,
  ShieldCheck,
  Star,
  BarChart2,
  Folder,
  Tag,
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
export type IntelSignalRow = {
  id: string;
  label: string;
  badge: string;
  tone: IntelBadgeTone;
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

  recommendation: string;
  recommendationColor: "green" | "amber" | "red" | "blue";
  fitPercent: number;
  fitLabel: string;
  isFallback: boolean;
  technical: { percent: number; questions: number; tag: "GOOD" | "AVERAGE" | "WEAK"; scores?: { overall: number; engagement: number; communication: number; domain_knowledge: number; role_fit: number; problem_solving: number; ownership_credibility: number; demonstrated_knowledge: number; technical: number; dimensions: { name: string; score: number; evidence: string }[] } };

  verdictSummary: string;
  verdictScore: number | null;
  verdictRecommendationReason: string;
  aiBullets: string[];
  integritySignals: IntelSignalRow[];
  signalAnalysis: Record<string, any>;
  skills: { name: string; score: number; evidence?: string; status?: string; stars?: number; scoreLabel?: string; whatShowed?: string; whatMissing?: string }[];
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
  avgResponseTimeSec: number | null;
  reportNotGenerated?: boolean;
};

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
  if (r === "strong yes" || r === "strong hire") return { label: "Strong Hire", color: "green" };
  if (r === "yes" || r === "hire") return { label: "Hire", color: "green" };
  if (r === "maybe" || r === "hold" || r === "review") return { label: "Hold", color: "amber" };
  if (r === "no" || r === "reject" || r === "no hire") return { label: "Reject", color: "red" };
  // Fallback to pct-based
  if (pct >= 80) return { label: "Strong Hire", color: "green" };
  if (pct >= 60) return { label: "Hire", color: "green" };
  if (pct >= 40) return { label: "Hold", color: "amber" };
  return { label: "Reject", color: "red" };
}

const PROCTORING_DISPLAY: Record<string, { title: string; why: string; risk: string }> = {
  face_absence: { title: "Face not visible", why: "Camera detected no face during the interview. The candidate may have looked away, turned off the camera, or left the frame.", risk: "High - indicates the candidate was not actively present in front of the camera." },
  multiple_faces: { title: "Multiple faces detected", why: "More than one person was detected in the camera frame, suggesting someone else may have been present or assisting.", risk: "High - potential coaching or collaboration violation." },
  identity_mismatch: { title: "Identity mismatch", why: "The face detected during the interview did not consistently match the registered identity of the candidate.", risk: "High - possible impersonation attempt. Verify with candidate photo ID." },
  camera_disabled: { title: "Camera disabled mid-session", why: "The candidate turned off the camera during a live interview segment, breaking proctoring visibility.", risk: "High - prevents visual monitoring of the candidate." },
  microphone_disabled: { title: "Microphone disabled mid-session", why: "The microphone was turned off during the interview, disrupting audio capture and transcription quality.", risk: "Medium - may affect transcript accuracy; review recording for gaps." },
  tab_switch: { title: "Tab switch", why: "The candidate switched to another browser tab while the interview tab stayed open. This is commonly associated with looking up answers.", risk: "Medium - cross-check with answer quality; sudden improvement after a tab switch is a red flag." },
  fullscreen_exit: { title: "Fullscreen exited", why: "The candidate left fullscreen mode during the interview (Esc, F11, or browser UI). This is a deliberate action, unlike a passive focus loss.", risk: "High - often precedes looking at a second screen or another application in view." },
  window_focus_loss: { title: "Window focus lost", why: "The browser window lost OS-level focus, e.g. the candidate alt-tabbed to another application or a notification stole focus.", risk: "Medium - cross-check duration and frequency; brief losses may be incidental (e.g. OS notifications)." },
  connection_lost: { title: "Connection dropped", why: "The candidate's internet connection was interrupted during the session. This may be genuine or deliberate.", risk: "Low-Medium - check whether audio and video resumed cleanly and whether answers were affected." },
  answer_integrity: { title: "Answer integrity flagged", why: "The candidate's answers show AI-generated/read phrasing, contradict claims made in earlier turns, or both — the only content-layer signal, since it looks at what was actually said rather than session behavior.", risk: "High - catches a candidate who behaves cleanly (no tab switches, camera stays on) but is reading generated answers or forgets what they claimed earlier in the same interview." },
  session_fingerprint: { title: "Session fingerprint mismatch", why: "The candidate's browser or device fingerprint changed mid-session — detected via screen resolution, platform, user agent, timezone, or IP geolocation shifts. This indicates VPN use, a device swap, or a virtual machine environment.", risk: "High - device swap or VM use suggests deliberate evasion of proctoring controls." },
};
function SkillRatingsList({ skills }: { skills: SreevaAIInterviewViewModel["skills"] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="divide-y divide-[#F3F4F6]">
      {skills.map((skill, idx) => (
        <li key={idx} className="py-2">
          <button
            type="button"
            onClick={() => setOpen(open === idx ? null : idx)}
            className="w-full flex items-center justify-between gap-2 text-left cursor-pointer outline-none"
          >
            <span className="text-[12px] font-semibold text-[#374151] truncate">{skill.name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold text-[#374151] tabular-nums">{skill.score}/10</span>
              {skill.evidence && (
                <ChevronDown className={cn("w-3 h-3 text-[#9CA3AF] transition-transform", open === idx && "rotate-180")} />
              )}
            </div>
          </button>
          {open === idx && skill.evidence && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#6B7280] pl-0.5">{skill.evidence}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function buildIntegritySignals(
  rows: {
    key: string; label: string; value: string; bad: boolean;
    score?: number; reason?: string; quotes?: string[];
    occurrences?: { severity: string; timestamp?: number; during_question?: string; during_topic?: string; reason?: string }[];
    turns?: { turn: number; question: string; latency_sec: number; gap_before_sec: number | null }[];
  }[],
  _integrityScore: number,
  integritySignalsAnalysis?: Record<string, string[]>,
): IntelSignalRow[] {
  // Only include events that actually occurred (exclude the "No flags" clean placeholder)
  const realRows = rows.filter(r => r.key !== "clean");
  const signals: IntelSignalRow[] = realRows.map((r) => {
    const countMatch = r.value.match(/^(\d+)/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 0;
    const display = PROCTORING_DISPLAY[r.key];
    const title = display?.title || r.label.replace(/\b\w/g, c => c.toUpperCase());
    const details: string[] = [];
    // LLM's 3 sharp points (whole-session analysis of every occurrence of this
    // signal type) take priority over the generic static why/risk copy.
    const llmPoints = integritySignalsAnalysis?.[r.key];
    if (llmPoints?.length) {
      for (const p of llmPoints) details.push(`- ${p}`);
    } else if (display) {
      details.push(`- ${display.why}`);
      details.push(`Risk: ${display.risk}`);
    }
    // latency_mismatch: per-question breakdown + inter-turn gaps, not a plain count.
    if (r.turns?.length) {
      for (const t of r.turns) {
        const qLabel = t.question ? `"${t.question}"` : `turn ${t.turn}`;
        details.push(`- Took ${t.latency_sec}s to start answering ${qLabel}.`);
        if (t.gap_before_sec !== null && t.gap_before_sec > 30) {
          details.push(`- ${t.gap_before_sec}s gap before this turn — larger than expected between questions.`);
        }
      }
    } else if (typeof r.score === "number") {
      // Content-layer signals (answer_integrity) carry a score/reason/quotes
      // instead of a simple occurrence count -- surface those directly.
      details.push(`Score: ${r.score}/100`);
      if (r.reason) details.push(`- ${r.reason}`);
      if (r.quotes?.length) {
        for (const q of r.quotes) details.push(`Quote: "${q}"`);
      }
    } else if (r.occurrences?.length) {
      // Per-occurrence "during which question" context, attached by
      // report_pipeline.py's _attach_question_context.
      for (const occ of r.occurrences) {
        if (occ.during_question) details.push(`- Happened during: "${occ.during_question}"`);
        else if (occ.during_topic) details.push(`- Happened during the ${occ.during_topic} topic.`);
      }
      if (count >= 3) details.push(`- Occurred ${count} times - high frequency. Strongly recommend reviewing recording timestamps.`);
      else if (count === 2) details.push(`- Occurred twice - review both incidents in the recording before deciding.`);
      else if (count === 1 && !r.occurrences.some(o => o.during_question || o.during_topic)) {
        details.push(`- Occurred once - isolated event, review the recording at this point to confirm context.`);
      }
    } else if (count > 0) {
      if (count >= 3) details.push(`- Occurred ${count} times - high frequency. Strongly recommend reviewing recording timestamps.`);
      else if (count === 2) details.push(`- Occurred twice - review both incidents in the recording before deciding.`);
      else details.push(`- Occurred once - isolated event, review the recording at this point to confirm context.`);
    }
    return {
      id: r.key,
      label: title,
      badge: typeof r.score === "number" ? `${r.score}/100` : r.value,
      tone: r.bad ? ("rose" as IntelBadgeTone) : ("amber" as IntelBadgeTone),
      details,
    };
  });
  // If no real events, add a single clean signal (no integrity score row -- shown in header)
  if (realRows.length === 0) {
    signals.push({
      id: "clean",
      label: "No flags detected",
      badge: "Clean",
      tone: "emerald",
      details: ["No proctoring events raised during this session.", "Candidate completed the interview without any integrity flags."],
    });
  }
  return signals;
}
function buildTopStrengthsRisks(args: {
  behavioralAnalysis: Record<string, any>;
}): { topStrengths: string[]; topRisks: string[] } {
  const topStrengths: string[] = Array.isArray(args.behavioralAnalysis?.strengths_observed)
    ? args.behavioralAnalysis.strengths_observed
      .filter((s: unknown) => typeof s === "string" && s.trim())
      .map((s: string) => cleanAiText(s.trim()))
      .slice(0, 4)
    : [];
  const topRisks: string[] = Array.isArray(args.behavioralAnalysis?.concerns_noted)
    ? args.behavioralAnalysis.concerns_noted
      .filter((s: unknown) => typeof s === "string" && s.trim())
      .map((s: string) => cleanAiText(s.trim()))
      .slice(0, 4)
    : [];
  return { topStrengths, topRisks };
}
export function buildSreevaAIInterviewViewModel(i: {
  backHref?: string;
  candidate: { fullName?: string; createdAt?: string; location?: string; interview?: any; assessment?: any; job?: { role?: string; title?: string } };
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
  groupedProctoringSignals: {
    key: string; label: string; count: number; severity: string;
    score?: number; reason?: string; quotes?: string[];
    occurrences?: { severity: string; timestamp?: number; during_question?: string; during_topic?: string; reason?: string; explanation?: string }[];
    turns?: { turn: number; question: string; latency_sec: number; gap_before_sec: number | null }[];
  }[];
  wordCount: number;
  interviewScore: number;
  combinedScore: number;
  interviewRecordingUrl: string;
  recordingDurationSec: number | null;
  formatDuration: (n: number) => string;
  communicationStatus: string;
  signalTimeline: { elapsed_sec: number; signal_name: string; signal_layer: string; evidence: string; score_delta: number; turn: number; recruiter_visible: boolean }[];
  proctoringEventsFull?: { time: string; eventType: string; reason: string; severity: string; elapsedSeconds: number }[];
  answerScoresParsed?: { question: string; answer: string; depth: number; clarity: number; specificity: number; grounding: number; overall: number; signals: string[]; response_latency_sec?: number }[];
  integrityScore?: number;
  integrityBand?: string;
  skillsEvaluated?: string[];
  skillRatingsList?: { skill: string; score: number; status: string; evidence?: string; gaps?: string }[];
  avgResponseTimeSec?: number | null;
  reportNotGenerated?: boolean;
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
  const commScore = _dimScore("communication") || Number(scores.communication_score ?? scores.communication ?? 0);
  const dkScore = _dimScore("domain") || Number(scores.demonstrated_knowledge ?? scores.technical_score ?? scores.technical ?? 0);
  const fitScore = _dimScore("role fit") || Number(scores.role_fit ?? 0);
  const psScore = _dimScore("problem") || Number(scores.problem_solving ?? 0);
  const ownScore = _dimScore("ownership") || 0;
  const overallPct = Number(scores.overall ?? scores.combined_score ?? 0);
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

  // a"a" Proctoring rows a"a"
  const proctoringRows: {
    key: string; label: string; value: string; bad: boolean;
    score?: number; reason?: string; quotes?: string[];
    occurrences?: { severity: string; timestamp?: number; during_question?: string; during_topic?: string; reason?: string; explanation?: string }[];
    turns?: { turn: number; question: string; latency_sec: number; gap_before_sec: number | null }[];
  }[] =
    (i.groupedProctoringSignals || []).slice(0, 8).map((g) => ({
      key: g.key,
      label: g.label.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      value: `${g.count} time${g.count === 1 ? "" : "s"}`,
      bad: g.severity === "high" || g.severity === "medium",
      score: g.score,
      reason: g.reason,
      quotes: g.quotes,
      occurrences: g.occurrences,
      turns: g.turns,
    }));
  if (proctoringRows.length === 0) {
    proctoringRows.push({ key: "clean", label: "Session telemetry", value: "No flags", bad: false });
  }
  // Grab integrity score from the raw report if available
  const rawIntegrityScore = (() => {
    // Access via isFallbackReport check
    if (i.isFallbackReport) return 100;
    const raw = (i as any).candidate?.interview?.aiSkillRatings;
    if (!raw) return proctoringRows.some((r) => r.bad) ? 65 : 95;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const n = Number(parsed?.integrity?.score);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : (proctoringRows.some((r) => r.bad) ? 65 : 95);
    } catch { return 95; }
  })();
  const integritySignals = buildIntegritySignals(proctoringRows, rawIntegrityScore, behavAnalysis?.integrity_analysis?.narratives);
  // Skills -- sourced only from skillRatings DB column (agent_persistence.py)
  const skills = (i.interviewReportSkills || [])
    .map((s: any) => {
      const name = String(s?.skill || s?.name || "").trim();
      if (!name) return null;
      const rawScore = s?.score;
      const score = typeof rawScore === "number"
        ? Math.max(1, Math.min(10, Math.round(rawScore)))
        : Math.max(1, Math.min(10, Math.round(parseFloat(String(rawScore)) || 5)));
      const evidence = cleanAiText(String(s?.evidence || "").trim()) || undefined;
      return { name, score, evidence };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score) as SreevaAIInterviewViewModel["skills"];
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
      clarity: Math.max(0, Math.min(10, Number(sb.clarity ?? 0))),
      depth: Math.max(0, Math.min(10, Number(sb.depth ?? 0))),
      technical_accuracy: Math.max(0, Math.min(10, Number(sb.technical_accuracy ?? sb.fluency ?? 0))),
      practical_application: Math.max(0, Math.min(10, Number(sb.practical_application ?? sb.confidence ?? 0))),
    } : liveScore && (liveScore.clarity || liveScore.depth || liveScore.specificity || liveScore.grounding) ? {
      clarity: Math.max(0, Math.min(10, liveScore.clarity)),
      depth: Math.max(0, Math.min(10, liveScore.depth)),
      technical_accuracy: Math.max(0, Math.min(10, liveScore.specificity)),
      practical_application: Math.max(0, Math.min(10, liveScore.grounding)),
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

  // 🎯 Strengths / Risks 🎯 needed before aiBullets fallback and verdict summary
  const { topStrengths, topRisks } = buildTopStrengthsRisks({
    behavioralAnalysis: behavAnalysis,
  });

  // 🎯 Recommendation from AI verdict (not from fitPct) 🎯
  const { label: recommendation, color: recommendationColor } = recommendationFromAI(verdict.decision || verdict.recommendation, fitPct);
  // 🎯 Verdict summary - generate a sharp 1-2 sentence decision note 🎯
  const rawVerdictSummary = String(verdict.justification || verdict.summary || (typeof i.interviewReportSummary === 'string' ? i.interviewReportSummary : "") || i.interviewAiSummary || "").trim();
  // Build a crisp 1-2 line decision note from data when AI summary is absent
  const buildDecisionNote = () => {
    const rec = recommendation.toLowerCase();
    const topS = topStrengths[0]?.replace(/\*\*/g, "").split("-")[0].trim() || "";
    const topR = topRisks[0]?.replace(/\*\*/g, "").split("-")[0].trim() || "";
    if (topS && topR) return `${fitPct}% fit - ${topS.toLowerCase()}. Key gap: ${topR.toLowerCase()}.`;
    if (topS) return `${fitPct}% fit - ${topS.toLowerCase()}.`;
    return `${fitPct}% overall fit for the role. ${rec === "hire" ? "Recommend proceeding." : rec === "reject" ? "Not recommended." : "Review carefully before deciding."}`;
  };
  // Preserve the full justification (it's now 3 sharp bullets -- don't truncate)
  const verdictSummaryText = rawVerdictSummary
    ? rawVerdictSummary.replace(/\*{1,2}/g, "").replace(/\n{3,}/g, "\n\n").trim()
    : buildDecisionNote();
  const verdictRecommendationReason = cleanAiText(String(verdict.recommendation_reason || "").trim());
  const aiSummaryConcise = String((verdict as any).ai_summary_concise || "").trim();
  // Proctoring signal (needed before aiBullets to reference flagCount)
  const flagCount = proctoringRows.filter((row) => row.bad).length;
  // Primary: use interviewAiSummary -- the new 4-bullet evidence-based summary generated by generate_interview_summary
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
      const provedSkills = skills.filter(s => s.score >= 5).slice(0, 2);
      const topSkillNames = provedSkills.map(s => `**${s.name}**`).join(" and ") || "**their primary domain**";
      bullets.push(cleanAiText(`Candidate demonstrated practical hands-on exposure to ${topSkillNames} through specific project descriptions and implementation context.`));
      const gapSkills = skills.filter(s => s.score < 5).slice(0, 2);
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

  return {
    backHref: i.backHref || "/admin/candidates",
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.job?.role || c.job?.title || "").trim() || "Role",
    interviewedOn,

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
        overall: overallPct || technicalPct,
        engagement: toPct(scores.engagement, 60),
        communication: commScore,
        domain_knowledge: dkScore,
        role_fit: fitScore,
        problem_solving: psScore,
        ownership_credibility: ownScore,
        // Legacy
        demonstrated_knowledge: dkScore,
        technical: dkScore,
        dimensions: _dims,
      },
    },

    verdictSummary: verdictSummaryText,
    verdictScore: typeof verdict.score === 'number' ? Math.round(verdict.score) : null,
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
    avgResponseTimeSec: i.avgResponseTimeSec ?? null,
    reportNotGenerated: i.reportNotGenerated || false,
  };
}
/* a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-
   SUB-COMPONENTS
a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a- */

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

/* Compact signal analysis — each point truncates to 1 line with dropdown to expand */
function SignalAnalysisPanelCompact({ analysis }: { analysis: Record<string, any> }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const points: string[] = Array.isArray(analysis?.behavioral_signals_analysis)
    ? (analysis.behavioral_signals_analysis as string[]).filter((p) => typeof p === "string" && p.trim())
    : [];
  if (points.length === 0) {
    return (
      <p className="text-[10.5px] text-[#9AA0AC] italic py-2">Signal analysis not available for this session.</p>
    );
  }
  return (
    <ul className="divide-y divide-[#F0F1F3]">
      {points.map((text, idx) => {
        const { title, description } = parseBulletCard(text);
        const isOpen = openIdx === idx;
        return (
          <li key={idx} className="py-2">
            <button
              type="button"
              className="group flex items-start gap-2.5 w-full text-left transition-colors outline-none cursor-pointer"
              onClick={() => setOpenIdx(isOpen ? null : idx)}
            >
              <span className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full bg-[#3B82F6]" />
              <p className={cn("text-[12px] font-medium text-[#111827] leading-relaxed flex-1", !isOpen && "truncate")}>{title}</p>
              <ChevronDown className={cn("h-3.5 w-3.5 text-[#9CA3AF] shrink-0 mt-[3px] transition-transform duration-200", isOpen && "rotate-180")} />
            </button>
            {isOpen && description && (
              <div className="overflow-hidden animate-in slide-in-from-top-1 fade-in-50 duration-200">
                <p className="text-[11px] leading-relaxed text-[#4B5563] mt-1.5 pl-[19px] pr-4">{description}</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
const DIMENSION_CONFIG = [
  { key: "jd_knowledge", label: "JD Knowledge", color: "#0EA5E9", desc: "Role alignment vs JD requirements" },
  { key: "problem_solving", label: "Problem Solving", color: "#10B981", desc: "Reasoning, trade-offs, adaptability" },
  { key: "experience_credibility", label: "Resume Credibility", color: "#8B5CF6", desc: "Do their live answers match what's on their resume?" },
  { key: "communication", label: "Communication", color: "#6366F1", desc: "Clarity, structure, directness" },
  { key: "ownership", label: "Ownership", color: "#F59E0B", desc: "Evidence of personal responsibility" },
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
  const DIM_KEYWORDS: Record<string, string> = {
    jd_knowledge: "jd knowledge",
    problem_solving: "problem",
    experience_credibility: "experience",
    communication: "communication",
    ownership: "ownership",
    technical_knowledge: "technical",
    resume_credibility: "resume",
    clarity_of_thought: "clarity",
  };
  const getValue = (key: string): number => {
    const kw = DIM_KEYWORDS[key] ?? key;
    const kwParts = kw.split(" ");
    const d = dims.find((d) => kwParts.every((part) => d.name.toLowerCase().includes(part)))
      ?? dims.find((d) => d.name.toLowerCase().includes(kwParts[0]));
    if (d) return Math.max(0, Math.min(100, Math.round(d.score)));
    return Math.max(0, Math.min(100, Math.round(Number((scores as any)?.[key] ?? 0))));
  };
  const getEvidence = (key: string): string => {
    const kw = DIM_KEYWORDS[key] ?? key;
    const kwParts = kw.split(" ");
    const d = dims.find((d) => kwParts.every((part) => d.name.toLowerCase().includes(part)));
    return d?.evidence ?? "";
  };
  const values = DIMENSION_CONFIG.map((d) => getValue(d.key));
  const N = DIMENSION_CONFIG.length;
  const PAD = 68; // Increased padding to prevent label clipping
  const R = 70;
  const SIZE = R * 2 + PAD * 2;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const point = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });
  const RING_LEVELS = [0.33, 0.66, 1.0]; // 3 rings like the screenshot
  const shapePoints = values
    .map((v, i) => point(i, (v / 100) * R))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  const hoveredDim = hovered ? DIMENSION_CONFIG.find((d) => d.key === hovered) ?? null : null;
  const hoveredVal = hovered ? getValue(hovered) : null;
  const hoveredEvidence = hovered ? getEvidence(hovered) : null;

  const handleEnter = (key: string, e: React.MouseEvent) => {
    setHovered(key);
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  const handleMove = (e: React.MouseEvent) => {
    if (!hovered) return;
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  const handleLeave = () => { setHovered(null); setMousePos(null); };

  // Position tooltip: clamp inside container bounds
  const tooltipStyle: React.CSSProperties = (() => {
    if (!mousePos || typeof window === "undefined") return {};
    const tipW = 240;
    let left = mousePos.x + 16;
    if (left + tipW > window.innerWidth) left = mousePos.x - tipW - 16;

    if (mousePos.y > window.innerHeight / 2) {
      return { bottom: window.innerHeight - mousePos.y + 16, left };
    }
    return { top: mousePos.y + 16, left };
  })();

  return (
    <div ref={containerRef} className="relative w-full flex flex-col items-center" onMouseMove={handleMove}>
      {/* ── Radar SVG — clean, matches screenshot ── */}
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0 overflow-visible">
        {/* Grid rings — 3 levels, no fill, light gray stroke */}
        {RING_LEVELS.map((frac, ri) => {
          const r = frac * R;
          const pts = Array.from({ length: N }, (_, i) => point(i, r)).map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <polygon
              key={ri}
              points={pts}
              fill="none"
              stroke="#D1D5DB"
              strokeWidth="1"
            />
          );
        })}
        {/* Spokes — light gray, from center to outermost ring */}
        {DIMENSION_CONFIG.map((_, i) => {
          const o = point(i, R);
          return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke="#D1D5DB" strokeWidth="1" />;
        })}
        {/* Data shape — light blue fill, solid blue border, exactly like screenshot */}
        <polygon
          points={shapePoints}
          fill="rgba(56,189,248,0.18)"
          stroke="#38BDF8"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Data points (invisible hover targets) */}
        {values.map((v, i) => {
          const p = point(i, (v / 100) * R);
          const dim = DIMENSION_CONFIG[i];
          return (
            <circle
              key={`dot-${dim.key}`}
              cx={p.x} cy={p.y} r="16"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={(e) => handleEnter(dim.key, e)}
              onMouseLeave={handleLeave}
            />
          );
        })}
        {/* Axis labels — simple gray, outside ring */}
        {DIMENSION_CONFIG.map((dim, i) => {
          const isRight = Math.cos(angle(i)) > 0.1;
          const isLeft = Math.cos(angle(i)) < -0.1;
          const anchor = isRight ? "start" : isLeft ? "end" : "middle";
          // If anchor is middle (top/bottom), we can split into two lines
          // If it's start/end (sides), single line looks better and doesn't clash with height
          const lp = point(i, R + (anchor === "middle" ? 24 : 16));
          const isHov = hovered === dim.key;

          let line1: string = dim.label;
          let line2: string = "";
          let multiLine = false;
          if (anchor === "middle" && dim.label.includes(" ")) {
            const words = dim.label.split(" ");
            const mid = Math.ceil(words.length / 2);
            line1 = words.slice(0, mid).join(" ");
            line2 = words.slice(mid).join(" ");
            multiLine = true;
          }

          return (
            <g
              key={dim.key}
              className="cursor-pointer"
              onMouseEnter={(e) => handleEnter(dim.key, e)}
              onMouseLeave={handleLeave}
            >
              {/* Invisible large circle to make hovering easier */}
              <circle cx={lp.x} cy={lp.y} r="22" fill="transparent" />
              <text
                x={lp.x}
                y={multiLine ? lp.y - 5 : lp.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize="11"
                fontWeight={isHov ? "700" : "500"}
                style={{
                  fill: isHov ? "#0EA5E9" : "#6B7280",
                  fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
                }}
              >
                {multiLine ? (
                  <>
                    <tspan x={lp.x} dy="0">{line1}</tspan>
                    <tspan x={lp.x} dy="12">{line2}</tspan>
                  </>
                ) : (
                  dim.label
                )}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ── Hover tooltip ── */}
      {hoveredDim && hoveredVal !== null && mousePos && (
        <div
          className="pointer-events-none fixed z-[99999] w-56 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 shadow-xl"
          style={tooltipStyle}
        >
          <div className="flex items-center justify-between mb-1 border-b border-[#F1F5F9] pb-1.5">
            <span className="text-[12px] font-semibold text-[#1A1D22]">{hoveredDim.label}</span>
            <span className="text-[12px] font-bold text-[#0EA5E9] tabular-nums">{hoveredVal}<span className="text-[9px] font-normal text-[#94A3B8]">/100</span></span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#6B7280] pt-1">
            {hoveredEvidence || hoveredDim.desc}
          </p>
        </div>
      )}
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
        depth: Math.round((s.depth || 0) * 10) / 10,
        clarity: Math.round((s.clarity || 0) * 10) / 10,
        specificity: Math.round((s.specificity || 0) * 10) / 10,
        grounding: Math.round((s.grounding || 0) * 10) / 10,
        overall: Math.round((s.overall || 0) * 10) / 10,
        signals: s.signals,
        reasoning: questionsSafe[idx]?.reasoning || "",
        tags: questionsSafe[idx]?.tags || [],
      }));
    }
    return questionsSafe
      .filter(q => q.answer && q.answer !== "?" && q.answer.length > 2)
      .map(q => ({
        question: q.question,
        answer: q.answer,
        depth: q.scoreBreakdown?.depth ?? 0,
        clarity: q.scoreBreakdown?.clarity ?? 0,
        specificity: q.scoreBreakdown?.technical_accuracy ?? 0,
        grounding: q.scoreBreakdown?.practical_application ?? 0,
        overall: Math.round(parseFloat(q.score.replace(/[^\d.]/g, "")) || 0),
        signals: [],
        reasoning: q.reasoning,
        tags: q.tags,
      }));
  })();
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <Tabs defaultValue="transcript" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-3 py-1.5">
          <TabsList className="flex w-full max-w-[280px] rounded-full bg-[#F3F4F6] p-1 h-auto mx-auto mt-0">
            <TabsTrigger value="transcript" className="flex-1 rounded-full px-4 py-1 text-[10px] font-semibold text-[#6B7079] data-[state=active]:bg-white data-[state=active]:text-[#1A1D22] data-[state=active]:shadow-sm transition-colors">
              Transcript
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex-1 rounded-full px-4 py-1 text-[10px] font-semibold text-[#6B7079] data-[state=active]:bg-white data-[state=active]:text-[#1A1D22] data-[state=active]:shadow-sm transition-colors">
              Question Analysis
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
                        <p className="text-[8.5px] font-extrabold uppercase tracking-widest text-[#6B7079]">Q{idx + 1}</p>
                        {(item.tags || []).map((tag) => (
                          <span key={tag} className="rounded bg-[#F0F1F3] px-1.5 py-0.5 text-[8.5px] font-bold text-[#5C6370]">{tag}</span>
                        ))}
                        {item.signals.map((sig) => (
                          <span key={sig} className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[8.5px] font-bold text-[#92400E]">{sig}</span>
                        ))}
                      </div>
                      {/* AI question */}
                      <p className="text-[10.5px] font-semibold leading-5 text-[#5C6370] mb-1">{item.question}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn("rounded border px-2.5 py-1 text-[10px] font-extrabold",
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
                      <p className="text-[8.5px] font-extrabold uppercase tracking-widest text-[#0B5FFF] mb-1">Candidate</p>
                      <p className="text-[11px] leading-5 text-[#1A1D22]">{item.answer}</p>
                    </div>
                  )}
                  {/* Score breakdown rings */}
                  {(item.depth > 0 || item.clarity > 0 || item.specificity > 0 || item.grounding > 0) && (
                    <div className="mt-2 grid grid-cols-4 gap-2 rounded-xl bg-[#FAFBFC] border border-[#F0F1F3] p-3">
                      {([
                        ["Clarity", item.clarity, "#6366F1"],
                        ["Depth", item.depth, "#10B981"],
                        ["Specificity", item.specificity, "#F59E0B"],
                        ["Grounding", item.grounding, "#F43F5E"],
                      ] as [string, number, string][]).map(([label, val, color]) => (
                        <div key={label} className="text-center">
                          <div className="relative mx-auto h-10 w-10">
                            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                              <circle cx="18" cy="18" r="15" fill="none" stroke="#E8EAED" strokeWidth="3" />
                              <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(val / 10) * (2 * Math.PI * 15)} ${2 * Math.PI * 15}`} />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[9.5px] font-extrabold text-[#1A1D22]">{val}</span>
                            </div>
                          </div>
                          <p className="mt-1 text-[8.5px] font-bold uppercase tracking-wide text-[#6B7079]">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Overall score bar */}
                  {overall > 0 && (
                    <div className="mt-2 flex items-center gap-2 px-1">
                      <span className="text-[8.5px] font-bold uppercase tracking-wide text-[#6B7079] w-14 shrink-0">Overall</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#F0F1F3] overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${(overall / 10) * 100}%`,
                          backgroundColor: overall >= 7 ? "#10B981" : overall >= 5 ? "#F59E0B" : "#F43F5E"
                        }} />
                      </div>
                      <span className="text-[9.5px] font-extrabold text-[#1A1D22] w-8 text-right">{overall}/10</span>
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
                      <span className="text-[9px] font-bold text-[#6B7079]">{isUser ? "Candidate" : "AI"}</span>
                      <span className="text-[8.5px] font-semibold text-[#6B7079]">{line.seekLabel || line.time}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[#1A1D22]">{line.text}</p>
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
// TabStrip removed
export const SREEVAAI_REPORT_PAGE_BG = "bg-[#EEF0F3]";
export const SREEVAAI_REPORT_CARD = "rounded-2xl border border-[#DDE1E5] bg-white shadow-sm";
const bgPage = SREEVAAI_REPORT_PAGE_BG;
const REC_COLOR: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
};
/* a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-
   MAIN REPORT COMPONENT
a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-a- */
export function InterviewReportSreevaAI({
  model,
  showHeader = true,
  headerActions,
}: {
  model: SreevaAIInterviewViewModel;
  showHeader?: boolean;
  headerActions?: React.ReactNode;
}) {
  const plyrRef = useRef<any>(null);
  const [expandedVerdict, setExpandedVerdict] = useState(false);
  const [openStrengths, setOpenStrengths] = useState(true);
  const [openRisks, setOpenRisks] = useState(true);
  useEffect(() => {
    document.body.classList.add("reports-mode");
    return () => {
      document.body.classList.remove("reports-mode");
    };
  }, []);
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
    <div className={cn("w-full h-screen flex flex-col overflow-hidden bg-[#FAFBFC] font-[family-name:var(--font-geist-sans,var(--font-inter,system-ui,sans-serif))]")}>
      {/* a"a" Fallback Banner a"a" */}
      {model.isFallback && (
        <div className="shrink-0 flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3.5 z-10">
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
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EB] px-6 py-3 bg-white z-10 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={model.backHref} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-medium text-[#0D4D2E] shadow-sm hover:bg-[#F7FAF8]">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
          </div>
        </div>
      )}

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}>
        <div className="mx-auto w-full px-4 py-4 lg:px-6 space-y-4">

          {/* ===================== SECTION 1 ===================== */}
          <div className="space-y-4">

            {/* Header: Profile + Verdict + Hiring Note */}
            <div className="flex flex-col sm:flex-row items-start sm:items-stretch justify-between gap-6 bg-white p-6 rounded-2xl " style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
              <div className="flex items-center gap-5 shrink-0">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-[#E2E8F0] shadow-sm bg-white">
                  {model.displayAvatar ? (
                    <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#F8FAFC] text-xl font-bold text-[#4B5563]">
                      {model.fullName.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-semibold text-[#111827] tracking-tight leading-none">{model.fullName}</h1>
                  <div className="flex items-center gap-4 text-[12px] text-[#6B7280] font-medium">
                    <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{model.interviewedOn}</span>
                    <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{Math.ceil((model.recordingDurationSec || 0) / 60)} mins</span>
                    <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />English</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 bg-rose-50/50 rounded-xl border border-rose-100 p-4 mx-2 flex flex-col justify-center relative">
                <button
                  type="button"
                  onClick={() => setExpandedVerdict(!expandedVerdict)}
                  className="absolute right-3 top-3 text-rose-400 hover:text-rose-600 transition-colors cursor-pointer outline-none"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform", expandedVerdict && "rotate-180")} />
                </button>
                <div className="flex items-center gap-2 mb-1.5 shrink-0 pr-6">
                  <User className="h-3.5 w-3.5 text-rose-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-rose-700">Hiring Note</span>
                </div>
                <p className={cn("text-[12px] leading-snug text-rose-900 font-medium", !expandedVerdict && "line-clamp-3")}>
                  {model.reportNotGenerated ? "This report hasn't been generated." : (model.verdictSummary || model.verdictRecommendationReason || "No specific hiring note provided.")}
                </p>
              </div>

              <div className="flex flex-col items-end justify-center gap-2 shrink-0">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest", REC_COLOR[model.recommendationColor] || "bg-gray-100 text-gray-700")}>
                  {model.recommendationColor === "green" ? <CheckCircle className="h-4 w-4" /> : model.recommendationColor === "red" ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {model.recommendation}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[28px] font-black text-[#111827] tracking-tight">{model.verdictScore !== null ? model.verdictScore : model.fitPercent}</span>
                  <span className="text-[14px] font-bold text-[#9CA3AF]">/ 100</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] bg-[#F3F4F6] px-2 py-0.5 rounded">Verdict</span>
              </div>
            </div>

            {/* Row 2: Summary + Integrity Signals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[240px]">
              <div className="rounded-2xl bg-[#F8FAFC]  p-6 flex flex-col h-full min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <Sparkles className="h-4 w-4 text-[#7C3AED]" />
                  <h3 className="text-[14px] font-bold text-[#111827]">Summary</h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
                  <ul className="space-y-2.5">
                    {model.reportNotGenerated ? (
                      <p className="text-[13px] text-[#6B7280]">This report hasn't been generated.</p>
                    ) : model.isFallback ? (
                      <p className="text-[13px] text-[#6B7280]">AI analysis pending.</p>
                    ) : (
                      model.aiBullets.slice(0, 3).map((b, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#94A3B8]" />
                          <p className="text-[13px] font-medium leading-relaxed text-[#374151]">
                            {b.replace(/^[-\*]\s*/, "").replace(/^\*\*[^*]+\*\*[:.]?\s*/, "").trim()}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl bg-white  p-6 flex flex-col h-full min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="flex items-center gap-2 text-[14px] font-bold text-[#111827]">
                    <ShieldCheck className="h-4 w-4 text-[#7C3AED]" />
                    Integrity Signals
                  </h3>
                  {model.integrityScore > 0 && (
                    <span className="text-[12px] font-bold text-[#10B981]">{model.integrityScore} / 100</span>
                  )}
                </div>
                <div className="flex-1 overflow-visible pr-2">
                  {model.integritySignals.length === 1 && model.integritySignals[0].id === "clean" ? (
                    <div className="flex items-start gap-2.5">
                      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <p className="text-[12px] font-medium leading-relaxed text-[#374151]">Candidate completed the interview without any proctoring or integrity flags.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {model.integritySignals.filter(r => r.id !== "clean").map((row) => (
                        <div key={row.id} className="group relative">
                          <div className={cn(
                            "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-colors cursor-default",
                            row.tone === "rose" ? "border-rose-100 bg-rose-50/40 hover:bg-rose-50" :
                            row.tone === "amber" ? "border-amber-100 bg-amber-50/40 hover:bg-amber-50" :
                            "border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50"
                          )}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", row.tone === "rose" ? "bg-rose-500" : row.tone === "amber" ? "bg-amber-400" : "bg-emerald-500")} />
                              <p className="text-[12px] font-semibold leading-relaxed text-[#374151] truncate">{row.label}</p>
                            </div>
                            {row.badge && (
                              <span className="shrink-0 text-[11px] font-bold text-[#6B7280]">{row.badge}</span>
                            )}
                          </div>
                          {/* Hover reveal: score + bullet-point reasoning behind this signal */}
                          {(row.details?.length ?? 0) > 0 && (
                            <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl group-hover:block">
                              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Why this was flagged</p>
                              <ul className="space-y-1">
                                {row.details!.map((d, i) => (
                                  <li key={i} className="text-[11px] leading-relaxed text-gray-600">{d}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: Evaluation Radar + Skills + Behavioral Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch h-[320px]">
              <div className="rounded-2xl bg-white  p-6 flex flex-col h-full min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <h3 className="text-[14px] font-bold text-[#111827] mb-6 shrink-0">Evaluation Radar</h3>
                <div className="flex-1 flex items-center justify-center -mt-4 min-h-0">
                  {model.reportNotGenerated ? (
                    <p className="text-[13px] text-[#6B7280]">This report hasn't been generated.</p>
                  ) : (
                    <EvaluationScoresCard scores={model.technical.scores} overall={model.technical.percent} />
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white  p-6 flex flex-col h-full min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <h3 className="text-[14px] font-bold text-[#111827] mb-5 shrink-0">Skill Ratings</h3>
                <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
                  {model.reportNotGenerated ? (
                    <p className="text-[13px] text-[#6B7280]">This report hasn't been generated.</p>
                  ) : model.skills.length > 0 ? (
                    <SkillRatingsList skills={model.skills} />
                  ) : (
                    <p className="text-[13px] text-[#9CA3AF]">No skills evaluated.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white  p-6 flex flex-col h-full min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="flex items-center gap-2 text-[14px] font-bold text-[#111827]">
                    <Sparkles className="h-4 w-4 text-[#7C3AED]" />
                    Behavioral Analysis
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
                  {model.reportNotGenerated ? (
                    <p className="text-[13px] text-[#6B7280]">This report hasn't been generated.</p>
                  ) : (
                    <SignalAnalysisPanelCompact analysis={model.signalAnalysis} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ===================== SECTION 2 ===================== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch h-[600px]">

            {/* Column 1: Strengths & Risks */}
            <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
              <div className="rounded-2xl bg-white  p-5 flex-1 flex flex-col min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Star className="h-3.5 w-3.5 text-emerald-600 fill-emerald-600" />
                  </div>
                  <h3 className="text-[14px] font-bold text-[#111827]">Strengths</h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
                  {model.reportNotGenerated ? (
                    <p className="text-[13px] text-[#6B7280]">This report hasn't been generated.</p>
                  ) : model.topStrengths.length > 0 ? (
                    <ul className="space-y-3">
                      {model.topStrengths.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                          <p className="text-[12px] leading-relaxed text-[#374151] font-medium">{typeof item === "string" ? item.replace(/\*\*/g, "") : item}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-[#9CA3AF]">No specific strengths identified.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white  p-5 flex-1 flex flex-col min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center">
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-600 fill-orange-600" />
                  </div>
                  <h3 className="text-[14px] font-bold text-[#111827]">Risks</h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
                  {model.reportNotGenerated ? (
                    <p className="text-[13px] text-[#6B7280]">This report hasn't been generated.</p>
                  ) : model.topRisks.length > 0 ? (
                    <ul className="space-y-3">
                      {model.topRisks.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                          <p className="text-[12px] leading-relaxed text-[#374151] font-medium">{typeof item === "string" ? item.replace(/\*\*/g, "") : item}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-[#9CA3AF]">No specific risks flagged.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Column 2: Transcript + Question Analysis */}
            <div className="lg:col-span-4 flex flex-col min-h-0">
              <div className="rounded-2xl bg-white  flex flex-col flex-1 min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="px-5 py-4 shrink-0 border-b border-[#F0F1F3]">
                  <h3 className="text-[14px] font-bold text-[#111827]">Interview Transcript</h3>
                </div>
                <div className="flex-1 min-h-0">
                  <QuestionAnalysisCard transcript={model.transcript} questions={model.questionAnalysis} answerScores={model.answerScores} onTranscriptSeek={handleSeek} recordingDurationSec={model.recordingDurationSec} />
                </div>
              </div>
            </div>

            {/* Column 3: Recording & Side Info */}
            <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
              {/* Recording Player */}
              <div className="rounded-2xl bg-white  p-4 shrink-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <h3 className="text-[14px] font-bold text-[#111827] mb-3">Recording</h3>
                <div className="overflow-hidden rounded-xl bg-black shadow-sm" style={{ aspectRatio: "16/9", width: "100%" }}>
                  {model.videoUrl ? (
                    <Plyr
                      ref={plyrRef}
                      source={{ type: "video", sources: [{ src: model.videoUrl, type: inferVideoMimeType(model.videoUrl, model.videoMimeType) }] }}
                      options={{ autoplay: false, clickToPlay: true, duration: model.recordingDurationSec || undefined, invertVolume: false, muted: false, storage: { enabled: false }, volume: 1 }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[#F9FAFB] border border-[#E4E7EB] rounded-xl">
                      <div className="flex flex-col items-center gap-2">
                        <Play className="h-7 w-7 text-[#D1D5DB]" />
                        <p className="text-[12px] text-[#9CA3AF]">Recording not available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Info Stack */}
              <div className="rounded-2xl bg-white  p-5 flex-1 flex flex-col overflow-y-auto" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)", scrollbarWidth: "thin" }}>
                <div className="mb-6">
                  <h3 className="text-[13px] font-bold text-[#111827] mb-3 flex items-center gap-2"><BarChart2 className="h-4 w-4" /> At a Glance</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[#6B7280]">Total Questions Asked</span>
                      <span className="font-bold text-[#111827]">{model.answerScores?.length || 0}</span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[#6B7280]">Avg. Response Time</span>
                      <span className="font-bold text-[#111827]">
                        {model.avgResponseTimeSec != null && model.avgResponseTimeSec > 0
                          ? `${model.avgResponseTimeSec}s`
                          : "--"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[#6B7280]">Recording Length</span>
                      <span className="font-bold text-[#111827]">{model.recordingDurationSec ? `${Math.floor(model.recordingDurationSec / 60)}:${String(model.recordingDurationSec % 60).padStart(2, "00")}` : "--:--"}</span>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-[13px] font-bold text-[#111827] mb-3 flex items-center gap-2"><Folder className="h-4 w-4" /> Job</h3>
                  <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-[12px] font-medium text-[#4B5563]">
                    {model.roleLabel}
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
