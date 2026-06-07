"use client";

/**
 * Interview Report V2 — Executive Assessment Layout
 *
 * Design philosophy:
 *   - Editorial, not dashboard. One screen tells 90% of the story.
 *   - Bento grid: every section has a distinct visual treatment.
 *   - Recruiter answers 3 questions: Qualified? Strengths/Weaknesses? Hire?
 *   - Radar chart replaces progress bars for score breakdown.
 *   - Skill map replaces tag cloud.
 *   - Transcript/Recording are access points, not embedded walls.
 *   - Hiring recommendation is the visual conclusion — unmissable.
 */

import { forwardRef, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Play,
  Shield,
  XCircle,
  Minus,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SreevaAIInterviewViewModel } from "./interview-report-sreevaai";

// ─── Dynamic video player ────────────────────────────────────────────────────

const Plyr = dynamic(
  () =>
    import("plyr-react").then((m) => {
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

// ─── Constants ───────────────────────────────────────────────────────────────

const REC: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  green:  { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-200", label: "Strong Hire" },
  amber:  { bg: "bg-amber-400",   text: "text-amber-950", ring: "ring-amber-200", label: "Lean Hire" },
  red:    { bg: "bg-rose-500",    text: "text-white", ring: "ring-rose-200",  label: "Reject" },
  blue:   { bg: "bg-blue-500",    text: "text-white", ring: "ring-blue-200",  label: "Hire" },
};

const QBADGE_META: Record<string, { label: string; dot: string; text: string }> = {
  STRONG:  { label: "Strong",  dot: "bg-emerald-500", text: "text-emerald-700" },
  AVERAGE: { label: "Average", dot: "bg-amber-400",   text: "text-amber-700"  },
  FAIR:    { label: "Weak",    dot: "bg-rose-500",    text: "text-rose-700"   },
  PENDING: { label: "N/A",     dot: "bg-slate-300",   text: "text-slate-500"  },
};

// ─── Radar Chart ─────────────────────────────────────────────────────────────

/**
 * Five-axis radar. Axes are evenly spaced around a circle.
 * Score 0–100. Each axis label sits just outside the polygon vertex.
 */
function RadarChart({
  scores,
  size = 200,
}: {
  scores: { label: string; value: number; sublabel?: string }[];
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.36;
  const n = scores.length;

  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const pointAt = (i: number, r: number) => {
    const a = angleOf(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  // Grid rings at 25 / 50 / 75 / 100
  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    scores
      .map((_, i) => pointAt(i, R * f))
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(" ") + " Z"
  );

  // Data polygon
  const dataPoints = scores.map((s, i) => pointAt(i, R * (s.value / 100)));
  const dataPoly =
    dataPoints.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ") + " Z";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="overflow-visible"
      role="img"
      aria-label="Competency radar chart"
    >
      {/* Grid rings */}
      {rings.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#E2E8F0" strokeWidth={1} />
      ))}

      {/* Axis spokes */}
      {scores.map((_, i) => {
        const p = pointAt(i, R);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="#CBD5E1"
            strokeWidth={1}
          />
        );
      })}

      {/* Filled polygon */}
      <path
        d={dataPoly}
        fill="rgba(14,116,144,0.12)"
        stroke="#0e7490"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Vertex dots + hover */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={hovered === i ? 5 : 3.5}
          fill={hovered === i ? "#0e7490" : "#0e7490"}
          stroke="white"
          strokeWidth={1.5}
          className="cursor-pointer transition-all duration-150"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        />
      ))}

      {/* Axis labels */}
      {scores.map((s, i) => {
        const labelR = R + 22;
        const p = pointAt(i, labelR);
        const anchor =
          Math.abs(p.x - cx) < 4 ? "middle" : p.x < cx ? "end" : "start";
        return (
          <g key={i}>
            <text
              x={p.x}
              y={p.y - 4}
              textAnchor={anchor}
              fontSize={9}
              fontWeight={700}
              fill={hovered === i ? "#0e7490" : "#64748B"}
              className="uppercase tracking-wider"
            >
              {s.label}
            </text>
            <text
              x={p.x}
              y={p.y + 8}
              textAnchor={anchor}
              fontSize={10}
              fontWeight={800}
              fill={hovered === i ? "#0e7490" : "#1e293b"}
            >
              {s.value}
            </text>
          </g>
        );
      })}

      {/* Centre score */}
      {hovered !== null && (
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill="#0e7490"
        >
          {scores[hovered].value}
        </text>
      )}
    </svg>
  );
}

// ─── Skill Map ────────────────────────────────────────────────────────────────

const STATUS_CHIP: Record<string, string> = {
  PROVED:     "bg-emerald-100 text-emerald-800 border border-emerald-200",
  PARTIAL:    "bg-amber-100 text-amber-800 border border-amber-200",
  "NOT PROVED": "bg-rose-100 text-rose-800 border border-rose-200",
  "NOT TESTED": "bg-slate-100 text-slate-600 border border-slate-200",
};

function SkillMap({
  skills,
}: {
  skills: SreevaAIInterviewViewModel["skills"];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      {skills.slice(0, 12).map((sk, i) => {
        const chipCls = STATUS_CHIP[sk.status] ?? STATUS_CHIP["NOT TESTED"];
        const isOpen = expanded === i;
        return (
          <div key={i}>
            <button
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50"
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Star rating as dots */}
                <div className="flex gap-0.5 shrink-0">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div
                      key={j}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        j < sk.stars ? "bg-cyan-600" : "bg-slate-200"
                      )}
                    />
                  ))}
                </div>
                <span className="text-[12px] font-semibold text-slate-800 truncate">{sk.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold leading-none", chipCls)}>
                  {sk.scoreLabel || sk.status}
                </span>
                {(sk.whatShowed || sk.whatMissing) && (
                  <ChevronDown
                    className={cn("h-3 w-3 text-slate-400 transition-transform", isOpen && "rotate-180")}
                  />
                )}
              </div>
            </button>
            {isOpen && (sk.whatShowed || sk.whatMissing) && (
              <div className="mx-3 mb-1.5 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed border border-slate-100">
                {sk.whatShowed && <p><span className="font-semibold text-emerald-700">Showed: </span>{sk.whatShowed}</p>}
                {sk.whatMissing && <p className="mt-0.5"><span className="font-semibold text-rose-600">Missed: </span>{sk.whatMissing}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Question Row ─────────────────────────────────────────────────────────────

function QuestionRow({
  q,
  index,
}: {
  q: SreevaAIInterviewViewModel["questionAnalysis"][number];
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const meta = QBADGE_META[q.qBadge] ?? QBADGE_META.PENDING;

  return (
    <div className="group">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
      >
        <span className="mt-0.5 shrink-0 text-[10px] font-bold text-slate-400 w-4">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-slate-800 leading-snug line-clamp-2">{q.question}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("flex items-center gap-1 text-[10px] font-bold", meta.text)}>
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          <ChevronDown className={cn("h-3 w-3 text-slate-300 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="mx-3 mb-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
          {q.answer && (
            <p className="line-clamp-3 mb-1.5 text-slate-700">{q.answer}</p>
          )}
          {q.reasoning && (
            <p className="text-slate-500 italic">{q.reasoning}</p>
          )}
          {q.scoreBreakdown && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(q.scoreBreakdown).map(([k, v]) => (
                <span key={k} className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {k.replace(/_/g, " ")}: <span className="text-slate-900">{v}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Transcript Preview ───────────────────────────────────────────────────────

function TranscriptPreview({
  transcript,
  onSeek,
}: {
  transcript: SreevaAIInterviewViewModel["transcript"];
  onSeek?: (s: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? transcript : transcript.slice(0, 6);

  return (
    <div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {visible.map((t, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-2 text-[11px] leading-relaxed",
              t.from === "ai" ? "text-slate-500" : "text-slate-800"
            )}
          >
            <span className={cn("mt-0.5 shrink-0 font-bold text-[10px]", t.from === "ai" ? "text-cyan-600" : "text-slate-400")}>
              {t.from === "ai" ? "AI" : "C"}
            </span>
            <span
              className={cn(t.seekSeconds !== undefined && "cursor-pointer hover:text-cyan-700 hover:underline")}
              onClick={() => t.seekSeconds !== undefined && onSeek?.(t.seekSeconds)}
            >
              {t.text}
            </span>
          </div>
        ))}
      </div>
      {transcript.length > 6 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-cyan-700 hover:text-cyan-900"
        >
          {expanded ? "Show less" : `+${transcript.length - 6} more lines`}
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
        </button>
      )}
    </div>
  );
}

// ─── Recommendation Verdict Block ─────────────────────────────────────────────

function VerdictBlock({ model }: { model: SreevaAIInterviewViewModel }) {
  const rec = REC[model.recommendationColor] ?? REC.blue;

  const verdictMap: Record<string, { icon: ReactNode; headline: string }> = {
    green: {
      icon: <CheckCircle2 className="h-6 w-6 text-emerald-500" />,
      headline: "Strong Hire",
    },
    blue: {
      icon: <CheckCircle2 className="h-6 w-6 text-blue-500" />,
      headline: "Hire",
    },
    amber: {
      icon: <Minus className="h-6 w-6 text-amber-500" />,
      headline: "Lean Hire",
    },
    red: {
      icon: <XCircle className="h-6 w-6 text-rose-500" />,
      headline: "Reject",
    },
  };

  const verdict = verdictMap[model.recommendationColor] ?? verdictMap.blue;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Colour accent bar */}
      <div className={cn("h-1 w-full", rec.bg)} />

      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {verdict.icon}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hiring Recommendation</p>
              <p className="text-xl font-extrabold tracking-tight text-slate-900">{verdict.headline}</p>
            </div>
          </div>
          <div className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ring-2 ring-offset-1", rec.bg, rec.text, rec.ring)}>
            {model.fitPercent}% Fit
          </div>
        </div>

        {model.verdictRecommendationReason && (
          <p className="mt-3 text-[12px] leading-relaxed text-slate-600 border-t border-slate-100 pt-3">
            {model.verdictRecommendationReason}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Integrity Chip ───────────────────────────────────────────────────────────

function IntegrityBlock({ model }: { model: SreevaAIInterviewViewModel }) {
  const score = model.integrityScore;
  const color =
    score >= 80 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : score >= 60 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-rose-700 bg-rose-50 border-rose-200";

  const flags = model.proctoringFlags;
  const headline = model.proctoringHeadline;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Integrity</span>
        </div>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", color)}>
          {score}/100
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Flags */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Flags detected</span>
          <span className={cn("text-[13px] font-bold", flags > 0 ? "text-rose-600" : "text-emerald-600")}>
            {flags === 0 ? "None" : flags}
          </span>
        </div>

        {/* Confidence bar */}
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-slate-400">
            <span>Confidence</span>
            <span>{score}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-400" : "bg-rose-500"
              )}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {headline && (
          <p className="text-[11px] text-slate-500 leading-relaxed pt-1">{headline}</p>
        )}

        {/* Top integrity signals */}
        {model.integritySignals.slice(0, 3).map((sig, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn("h-1.5 w-1.5 shrink-0 rounded-full", {
              "bg-emerald-500": sig.tone === "emerald",
              "bg-amber-400": sig.tone === "amber",
              "bg-rose-500": sig.tone === "rose",
              "bg-sky-500": sig.tone === "sky",
              "bg-slate-400": sig.tone === "slate",
            })} />
            <span className="text-[11px] text-slate-600 truncate">{sig.label}</span>
            <span className={cn("ml-auto text-[10px] font-bold shrink-0", {
              "text-emerald-600": sig.tone === "emerald",
              "text-amber-600": sig.tone === "amber",
              "text-rose-600": sig.tone === "rose",
              "text-sky-600": sig.tone === "sky",
              "text-slate-500": sig.tone === "slate",
            })}>
              {sig.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recording Access Point ───────────────────────────────────────────────────

function RecordingBlock({
  videoUrl,
  videoMimeType,
  durationSec,
  plyrRef,
}: {
  videoUrl: string | null;
  videoMimeType: string | null;
  durationSec: number | null;
  plyrRef: React.RefObject<any>;
}) {
  const [open, setOpen] = useState(false);

  if (!videoUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center">
        <Play className="h-6 w-6 text-slate-300" />
        <p className="text-[11px] text-slate-400">No recording available</p>
      </div>
    );
  }

  const mins = durationSec ? Math.round(durationSec / 60) : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 border border-cyan-100">
            <Play className="h-3.5 w-3.5 text-cyan-700 ml-0.5" />
          </div>
          <div className="text-left">
            <p className="text-[12px] font-bold text-slate-800">Interview Recording</p>
            {mins && <p className="text-[10px] text-slate-400">{mins} min</p>}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-slate-300 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3">
          <Plyr
            ref={plyrRef}
            source={{ type: "video", sources: [{ src: videoUrl, type: videoMimeType ?? "video/webm" }] }}
            options={{ controls: ["play", "progress", "current-time", "mute", "volume", "fullscreen"] }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function InterviewReportV2({
  model,
  showHeader = true,
  headerActions,
}: {
  model: SreevaAIInterviewViewModel;
  showHeader?: boolean;
  headerActions?: ReactNode;
}) {
  const plyrRef = useRef<any>(null);

  const handleSeek = (seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    try {
      const player = plyrRef.current?.plyr;
      if (player?.currentTime !== undefined) { player.currentTime = Math.max(0, seconds); return; }
      const vid = plyrRef.current?.querySelector?.("video") ?? document.querySelector("video");
      if (vid) vid.currentTime = Math.max(0, seconds);
    } catch {}
  };

  // Derive the 5 competency scores for the radar chart
  const sc = model.technical.scores;
  const radarScores = [
    { label: "Technical", value: sc?.demonstrated_knowledge ?? model.technical.percent },
    { label: "Problem Solving", value: sc?.problem_solving ?? Math.round(model.technical.percent * 0.9) },
    { label: "Role Readiness", value: sc?.role_fit ?? Math.round(model.technical.percent * 0.85) },
    { label: "Communication", value: Math.round((model.comm.fluency + model.comm.pronunciation + model.comm.confidence) / 3) || Math.round(model.technical.percent * 0.8) },
    { label: "Ownership", value: sc?.behavioral ?? Math.round(model.technical.percent * 0.88) },
  ] as { label: string; value: number }[];

  // Clamp all values 0-100
  radarScores.forEach((s) => { s.value = Math.min(100, Math.max(0, s.value)); });

  const overallScore = Math.round(radarScores.reduce((a, s) => a + s.value, 0) / radarScores.length);

  const recColor = model.recommendationColor;
  const accentBar =
    recColor === "green" ? "from-emerald-500 to-cyan-500"
    : recColor === "blue" ? "from-blue-500 to-cyan-500"
    : recColor === "amber" ? "from-amber-400 to-yellow-400"
    : "from-rose-500 to-pink-500";

  return (
    <div className="w-full min-h-screen bg-[#F3F4F6]">
      {/* ── Nav strip ── */}
      {showHeader && (
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
          <Link
            href={model.backHref}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Candidates
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Assessment Report</span>
            {headerActions}
          </div>
        </div>
      )}

      {/* ── Fallback banner ── */}
      {model.isFallback && (
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <p className="text-[12px] text-amber-800">
            <span className="font-bold">AI analysis unavailable.</span> Scores are placeholders. Review recording and transcript manually.
          </p>
        </div>
      )}

      <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8">

        {/* ════════════════════════════════════════════
            ROW 1 — Candidate identity + Verdict + Integrity
            Layout: [identity 5fr] [verdict 4fr] [integrity 3fr]
        ════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 mb-4">

          {/* Identity */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {/* Gradient accent bar */}
            <div className={cn("h-1 w-full bg-gradient-to-r", accentBar)} />
            <div className="px-5 pt-4 pb-5">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="h-14 w-14 rounded-full overflow-hidden border-2 border-white shadow-md bg-slate-100">
                    {model.displayAvatar && (
                      <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  {/* Recommendation dot */}
                  <div className={cn("absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white", REC[recColor]?.bg ?? "bg-blue-500")} />
                </div>

                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 leading-none">{model.fullName}</h1>
                  <p className="mt-1 text-[12px] text-slate-500">{model.roleLabel}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span><span className="font-semibold text-slate-600">Date</span> · {model.interviewedOn}</span>
                    <span><span className="font-semibold text-slate-600">Duration</span> · {model.totalTime}</span>
                    <span><span className="font-semibold text-slate-600">Questions</span> · {model.questionsAsked}</span>
                  </div>
                </div>

                {/* Overall score pill */}
                <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 border-slate-200 bg-slate-50">
                  <span className="text-xl font-extrabold text-slate-900 leading-none">{overallScore}</span>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Score</span>
                </div>
              </div>

              {/* AI Summary */}
              {model.verdictSummary && (
                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">AI Summary</p>
                  <p className="text-[12px] leading-relaxed text-slate-700">{model.verdictSummary}</p>
                </div>
              )}
            </div>
          </div>

          {/* Verdict */}
          <div className="lg:col-span-4">
            <VerdictBlock model={model} />

            {/* Strengths & Weaknesses below verdict on same column */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="px-4 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-2">Strengths</p>
                  <ul className="space-y-1.5">
                    {model.topStrengths.slice(0, 3).map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        <span className="text-[11px] text-slate-700 leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-rose-500 mb-2">Weaknesses</p>
                  <ul className="space-y-1.5">
                    {model.topRisks.slice(0, 3).map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                        <span className="text-[11px] text-slate-700 leading-snug">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Integrity */}
          <div className="lg:col-span-3">
            <IntegrityBlock model={model} />
          </div>
        </div>

        {/* ════════════════════════════════════════════
            ROW 2 — Score Breakdown (Radar) + Skill Map + Q-by-Q
            Layout: [radar 4fr] [skills 3fr] [questions 5fr]
        ════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 mb-4">

          {/* Radar Chart — Score Breakdown */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Competency Profile</p>
              <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", {
                "bg-emerald-100 text-emerald-700": model.technical.tag === "GOOD",
                "bg-amber-100 text-amber-700":     model.technical.tag === "AVERAGE",
                "bg-rose-100 text-rose-700":        model.technical.tag === "WEAK",
              })}>
                {model.technical.tag}
              </span>
            </div>
            <div className="flex flex-col items-center px-4 pb-4 pt-3">
              <RadarChart scores={radarScores} size={220} />

              {/* Legend */}
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 w-full">
                {radarScores.map((s) => (
                  <div key={s.label} className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">{s.label}</span>
                    <span className="text-[10px] font-bold text-slate-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Skill Map */}
          <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Skills Assessed</p>
              <span className="text-[10px] text-slate-400">{model.skills.length} skills</span>
            </div>
            <div className="px-2 py-2 max-h-[320px] overflow-y-auto">
              <SkillMap skills={model.skills} />
            </div>
          </div>

          {/* Question-by-Question */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Question Analysis</p>
              <div className="flex items-center gap-3 text-[10px]">
                {Object.entries(QBADGE_META).filter(([k]) => k !== "PENDING").map(([k, v]) => (
                  <span key={k} className={cn("flex items-center gap-1 font-semibold", v.text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", v.dot)} />
                    {v.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="py-1 max-h-[320px] overflow-y-auto">
              {model.questionAnalysis.map((q, i) => (
                <QuestionRow key={q.id} q={q} index={i} />
              ))}
              {model.questionAnalysis.length === 0 && (
                <p className="px-4 py-6 text-center text-[12px] text-slate-400">No questions recorded</p>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            ROW 3 — Transcript + Recording
            Compact access points, not embedded walls.
        ════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Transcript */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Transcript</p>
              <span className="ml-auto text-[10px] text-slate-400">{model.transcript.length} turns</span>
            </div>
            <div className="px-4 py-3">
              <TranscriptPreview transcript={model.transcript} onSeek={handleSeek} />
            </div>
          </div>

          {/* Recording */}
          <div>
            <RecordingBlock
              videoUrl={model.videoUrl}
              videoMimeType={model.videoMimeType}
              durationSec={model.recordingDurationSec}
              plyrRef={plyrRef}
            />
          </div>
        </div>

      </div>
    </div>
  );
}