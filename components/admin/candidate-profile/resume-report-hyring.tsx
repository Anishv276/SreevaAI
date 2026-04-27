"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  Link2,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";
import {
  HYRING_REPORT_CARD,
  HYRING_REPORT_PAGE_BG,
  SemicircleGauge,
  TechnicalScoreCard,
  fitLabelFromPct,
} from "./interview-report-hyring";
import type { IntelIconKey, IntelSignalRow } from "./interview-report-hyring";

const card = HYRING_REPORT_CARD;
const bgPage = HYRING_REPORT_PAGE_BG;

type RadarKey = "essentials" | "experience" | "domain" | "skills" | "confidence";

const RESUME_RADAR_LABELS: { key: RadarKey; label: string }[] = [
  { key: "essentials", label: "Essentials" },
  { key: "experience", label: "Experience" },
  { key: "domain", label: "Domain" },
  { key: "skills", label: "Skills" },
  { key: "confidence", label: "Confidence" },
];

function ResumeRadarPlot({
  values,
}: {
  values: Record<RadarKey, number>;
}) {
  const n = RESUME_RADAR_LABELS.length;
  const cx = 50;
  const cy = 50;
  const r = 32;
  const rOuter = 42;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const pts = RESUME_RADAR_LABELS.map((def, i) => {
    const t = (clamp(values[def.key]) / 100) * r;
    return `${cx + t * Math.cos(angle(i))},${cy + t * Math.sin(angle(i))}`;
  });
  return (
    <div className="w-full min-h-[230px] sm:min-h-[250px]">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Resume fit radar"
      >
        <defs>
          <linearGradient id="resumeRadarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E6FD6" />
            <stop offset="55%" stopColor="#F0A12A" />
            <stop offset="100%" stopColor="#1E9D55" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={RESUME_RADAR_LABELS.map((_, i) => {
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
            key={`resume-spoke-${i}`}
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
          fill="rgba(249,115,22,0.10)"
          stroke="url(#resumeRadarGrad)"
          strokeWidth="0.9"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {RESUME_RADAR_LABELS.map((def, i) => {
          const ax = angle(i);
          const ox = cx + rOuter * Math.cos(ax);
          const oy = cy + rOuter * Math.sin(ax);
          const pct = clamp(values[def.key]);
          return (
            <g key={def.key}>
              <text
                x={ox}
                y={oy - 1.4}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="2.15"
                fontWeight="700"
                fill="#4B5563"
                style={{ fontFamily: "var(--font-inter, ui-sans-serif, system-ui, sans-serif)" }}
              >
                {def.label}
              </text>
              <text
                x={ox}
                y={oy + 2.4}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="2.35"
                fontWeight="800"
                fill="#1A1D22"
                style={{ fontFamily: "var(--font-inter, ui-sans-serif, system-ui, sans-serif)" }}
              >
                {pct}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export type HyringResumeViewModel = {
  backHref: string;
  processing: boolean;
  fullName: string;
  displayAvatar: string;
  roleLabel: string;
  cityBadge: string;
  locationLine: string;
  appliedOn: string;
  parseMeta: string;
  fitPercent: number;
  fitLabel: string;
  stats: {
    workExp: string;
    rolesCount: string;
    education: string;
    skillsExtracted: string;
    pipeline: string;
  };
  mustHave: { percent: number; nRequirements: number; tag: "GOOD" | "AVERAGE" | "WEAK" };
  scoreBreakdown: {
    essentials: number;
    experience: number;
    supplemental: number;
    overall: number;
  };
  comm5: { pronunciation: number; grammar: number; vocabulary: number; minimalFiller: number; fluency: number; tag: string };
  fitRadar: { essentials: number; experience: number; domain: number; skills: number; confidence: number };
  aiBullets: string[];
  topStrengths: string[];
  topRisks: string[];
  rubricRows: IntelSignalRow[];
  skillMatchRows: { name: string; questions: number; stars: number; evidenceNote?: string }[];
  careerLines: { label: string; body: string; time: string }[];
  resumeUrl: string | null;
  hasStructuredResume: boolean;
  reviewStrip: string;
  feedbackStars: number;
};

function tagFromPct(p: number): "GOOD" | "AVERAGE" | "WEAK" {
  if (p >= 70) return "GOOD";
  if (p >= 45) return "AVERAGE";
  return "WEAK";
}

function toBullets(text: string, min = 3): string[] {
  const s = String(text || "")
    .split(/[\n.!?]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (s.length >= min) return s.slice(0, min);
  if (s.length > 0) {
    return [
      s[0] || "Resume signals are still partial.",
      s[1] || "Re-run the AI scan if the job description or resume changed recently.",
      s[2] || "Use rubric and JD table before a final go/no-go.",
    ];
  }
  return [
    "Document review focuses on must-haves, experience depth, and supplemental fit to this JD.",
    "Scores are model estimates—treat as guidance with human review.",
    "Open the source resume when wording matters for compliance or level.",
  ];
}

function compactReadoutText(text: string, maxLen = 86) {
  const clean = String(text || "")
    .replace(/^flag:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const splitAt = clean.search(/[;,]/);
  const clipped = splitAt > 0 && splitAt <= 60 ? clean.slice(0, splitAt).trim() : clean;
  return clipped.length > maxLen ? `${clipped.slice(0, maxLen - 3).trimEnd()}...` : clipped;
}

/**
 * Flattens existing candidate-page resume signals into a Hyring-mirror view model.
 */
export function buildHyringResumeViewModel(i: {
  candidate: {
    fullName?: string;
    createdAt?: string;
    location?: string;
    resumeUrl?: string | null;
    drive?: { role?: string; title?: string };
    experienceYears?: number | null;
  };
  backHref?: string;
  mounted: boolean;
  displayAvatar: string;
  hasAiReport: boolean;
  hasResumeText: boolean;
  matchScore: number;
  summary: string;
  strengthLines: string[];
  weaknessLines: string[];
  redFlagLines: string[];
  primaryGapText: string;
  normalizedStatus: string;
  interviewStageLabel: string;
  breakdown: {
    skills_score?: number;
    skills_max?: number;
    exp_score?: number;
    exp_max?: number;
    good_score?: number;
    good_max?: number;
    domain_score?: number;
    domain_max?: number;
  } | null;
  combinedWorkHistory: unknown[];
  educationList: unknown[];
  totalExtractedSkills: number;
  mustHaveBarPct: number;
  techSkillSample: string[];
  // AI-direct fields from gpt-4o report
  aiRadar?: { essentials?: number; experience?: number; domain?: number; skills?: number; confidence?: number } | null;
  aiSkillRows?: { name: string; stars: number; evidence_note?: string }[] | null;
  readinessTimeline?: string | null;
  candidatePotential?: string | null;
  decisionReason?: string | null;
}): HyringResumeViewModel {
  const c = i.candidate;
  const b = i.breakdown;
  const skM = Math.max(1, Number(b?.skills_max ?? 45));
  const skS = Number(b?.skills_score ?? 0);
  const exM = Math.max(1, Number(b?.exp_max ?? 25));
  const exS = Number(b?.exp_score ?? 0);
  const gM = Math.max(1, Number(b?.good_max ?? 10));
  const gS = Number(b?.good_score ?? 0);
  const dM = Math.max(1, Number(b?.domain_max ?? 10));
  const dS = Number(b?.domain_score ?? 0);

  // Math fallbacks — only used when AI radar not present
  const mustPct = Math.min(100, Math.round((skS / skM) * 100));
  const expPct = Math.min(100, Math.round((exS / exM) * 100));
  const supPct = (gM + dM) > 0 ? Math.min(100, Math.round(((gS + dS) / (gM + dM)) * 100)) : 0;

  const nReq = Math.max(3, skM > 0 ? Math.min(20, Math.round(skM / 3)) : 5);
  const nRoles = Array.isArray(i.combinedWorkHistory) ? i.combinedWorkHistory.length : 0;
  const nEdu = Array.isArray(i.educationList) ? i.educationList.length : 0;

  // Use AI radar when present, fall back to math
  const ar = i.aiRadar;
  const clamp = (v: unknown, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fb;
  };
  const fitRadar = {
    essentials: clamp(ar?.essentials, mustPct),
    experience: clamp(ar?.experience, expPct),
    domain: clamp(ar?.domain, supPct),
    skills: clamp(ar?.skills, Math.min(100, Math.round((i.totalExtractedSkills / 12) * 100))),
    confidence: clamp(ar?.confidence, Math.min(100, Math.round(i.matchScore))),
  };

  // comm5 repurposed for score breakdown display — use AI confidence where available
  const comm5 = {
    pronunciation: fitRadar.essentials,
    grammar: fitRadar.experience,
    vocabulary: fitRadar.domain,
    minimalFiller: fitRadar.skills,
    fluency: fitRadar.confidence,
    tag: i.candidatePotential === "High" ? "STRONG" : i.candidatePotential === "Low" ? "WEAK" :
      tagFromPct(i.matchScore * 0.6 + mustPct * 0.2 + expPct * 0.2) === "GOOD" ? "STRONG" : "AVERAGE",
  };

  const scoreBreakdown = {
    essentials: fitRadar.essentials,
    experience: fitRadar.experience,
    supplemental: fitRadar.domain,
    overall: Math.min(100, Math.max(0, Math.round(i.matchScore))),
  };

  const topStrengths = (() => {
    const s = [...(i.strengthLines || [])].map((x) => compactReadoutText(x)).filter(Boolean).slice(0, 3);
    while (s.length < 3) {
      const p = "Cross-check against the hiring bar for this role";
      if (!s.includes(p)) s.push(p);
      else break;
    }
    return s.slice(0, 3);
  })();

  const topRisks = (() => {
    const r = [...(i.weaknessLines || []), ...i.redFlagLines.map((x) => `Watchout: ${x}`)]
      .map((x) => compactReadoutText(x))
      .filter(Boolean)
      .slice(0, 3);
    if (r.length === 0) r.push("No major automated blockers; still run normal checks");
    return r.slice(0, 3);
  })();

  const rubricRows: IntelSignalRow[] = [
    {
      id: "rb1",
      label: "Must-have points",
      badge: `${skS} / ${skM} pts`,
      tone: mustPct >= 55 ? "emerald" : "amber",
      icon: "shield" as IntelIconKey,
    },
    {
      id: "rb2",
      label: "Experience depth",
      badge: `${exS} / ${exM} pts`,
      tone: expPct >= 55 ? "emerald" : "sky",
      icon: "box" as IntelIconKey,
    },
    {
      id: "rb3",
      label: "Supplemental + domain",
      badge: `${gS + dS} / ${gM + dM} pts`,
      tone: supPct >= 50 ? "emerald" : "slate",
      icon: "star" as IntelIconKey,
    },
    {
      id: "rb4",
      label: "Overall AI match",
      badge: `${Math.round(i.matchScore)} / 100`,
      tone: i.matchScore >= 60 ? "emerald" : "amber",
      icon: "zap" as IntelIconKey,
    },
  ];

  // AI skill rows take full priority — math fallback only when absent
  const skillMatchRows: HyringResumeViewModel["skillMatchRows"] = (() => {
    if (i.aiSkillRows && i.aiSkillRows.length > 0) {
      return i.aiSkillRows.slice(0, 12).map((r) => ({
        name: r.name,
        questions: 1,
        stars: Math.min(5, Math.max(1, r.stars)),
        evidenceNote: r.evidence_note,
      }));
    }
    if (i.techSkillSample && i.techSkillSample.length) {
      return i.techSkillSample.slice(0, 10).map((name, j) => ({
        name,
        questions: 1,
        stars: 2 + (j % 3),
      }));
    }
    return [
      { name: "Role fit (JD)", questions: 1, stars: Math.max(1, Math.min(5, Math.round(i.matchScore / 20))) },
      { name: "Must-haves (aggregate)", questions: 1, stars: Math.max(1, Math.round(mustPct / 20)) },
    ];
  })();

  const history = (i.combinedWorkHistory || []) as Array<{
    role?: string;
    company?: string;
    start_date?: string;
    end_date?: string;
    start_year?: string;
    end_year?: string;
    is_current?: boolean;
    recruiter_summary?: string;
  }>;
  let careerLines: HyringResumeViewModel["careerLines"] = history.slice(0, 8).map((r, idx) => {
    const when = [r.start_date || r.start_year, r.is_current ? "Present" : r.end_date || r.end_year].filter(Boolean).join(" — ");
    const label = `${r.role || "Role"} @ ${r.company || "—"}`;
    const body = String(r.recruiter_summary || "No summary for this block yet.");
    return { label, body, time: when || `Block ${idx + 1}` };
  });
  if (careerLines.length === 0) {
    careerLines.push({
      label: "No work history in structured data",
      body: "Once parsing completes, roles appear here in timeline form.",
      time: "—",
    });
  }

  return {
    backHref: i.backHref || "/admin/candidates",
    processing: !i.hasResumeText && !i.hasAiReport,
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.drive?.role || c.drive?.title || "Requisition").trim() || "Role",
    cityBadge: String(c.location || "Location").split(",")[0].trim() || "—",
    locationLine: c.location || "—",
    appliedOn:
      c.createdAt && i.mounted
        ? new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "—",
    parseMeta: i.hasAiReport ? "AI report ready" : i.hasResumeText ? "Text extracted" : "Awaiting document",
    fitPercent: Math.min(100, Math.max(0, Math.round(i.matchScore))),
    fitLabel: fitLabelFromPct(i.matchScore),
    stats: {
      workExp:
        typeof c.experienceYears === "number" && Number.isFinite(c.experienceYears) ? `${c.experienceYears} yrs` : "—",
      rolesCount: String(nRoles),
      education: nEdu ? `${nEdu} inst.` : "—",
      skillsExtracted: String(i.totalExtractedSkills),
      pipeline: i.interviewStageLabel,
    },
    mustHave: { percent: i.mustHaveBarPct, nRequirements: nReq, tag: tagFromPct(mustPct) },
    scoreBreakdown,
    comm5,
    fitRadar,
    aiBullets: toBullets(i.summary),
    topStrengths,
    topRisks,
    rubricRows,
    skillMatchRows,
    careerLines,
    resumeUrl: c.resumeUrl || null,
    hasStructuredResume: nRoles > 0 || i.totalExtractedSkills > 0,
    // AI decision_reason is the sharpest single-line verdict — prefer it for the decision strip
    reviewStrip: i.decisionReason || i.primaryGapText || "No single gap called out; read strengths and risks in context.",
    feedbackStars: i.matchScore >= 80 ? 5 : i.matchScore >= 60 ? 4 : i.matchScore >= 40 ? 3 : 2,
  };
}

type ResumeReportHyringProps = { model: HyringResumeViewModel };

export function ResumeReportHyring({ model }: ResumeReportHyringProps) {
  if (model.processing) {
    return (
      <div className={cn("w-full", bgPage)}>
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 sm:px-6">
          <div className={cn(card, "flex flex-col items-center gap-4 p-12 text-center")}>
            <Loader2 className="h-10 w-10 animate-spin text-[#1E9D55]" />
            <p className="text-sm font-extrabold text-[#1A1D22]">Extracting &amp; scoring resume</p>
            <p className="max-w-sm text-[13px] text-[#5C6370]">This usually takes under a minute. You can refresh from the header.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", bgPage)}>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E5] pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={model.backHref}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-medium text-[#0D4D2E] shadow-sm hover:bg-[#F7FAF8]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className={cn(card, "overflow-hidden p-0")}>
          <div className="bg-gradient-to-br from-white via-white to-[#FFF4EC] px-4 py-5 sm:px-6">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-[0_10px_25px_rgba(0,0,0,0.08)] sm:h-28 sm:w-28">
                  {model.displayAvatar ? <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#F97316]">Resume screening</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1A1D22] sm:text-[2.5rem]">{model.fullName}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#F1F2F4] px-3 py-1 text-[11px] font-bold text-[#3D434D]">
                      {model.roleLabel}
                    </span>
                    <span className="rounded-full bg-[#F1F2F4] px-3 py-1 text-[11px] font-bold text-[#3D434D]">
                      {model.locationLine}
                    </span>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[#5C6370]">
                    Score-first screening summary with the strongest signals surfaced up top. The gauge on the right is the quick read; the rest of the report explains why.
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 rounded-3xl bg-white/85 px-5 py-4 shadow-[0_10px_30px_rgba(17,24,39,0.06)] ring-1 ring-black/5 sm:min-w-[240px]">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#6B7079]">Fit snapshot</p>
                <SemicircleGauge value={model.fitPercent} fitLabel={model.fitLabel} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["Experience", model.stats.workExp],
              ["Career depth", model.stats.rolesCount],
              ["Education", model.stats.education],
              ["Matched skills", model.stats.skillsExtracted],
            ] as const
          ).map(([a, b]) => (
            <div key={String(a)} className={cn(card, "p-3 text-center sm:text-left")}>
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">{a}</p>
              <p className="mt-1 text-sm font-extrabold text-[#1A1D22]">{b}</p>
            </div>
          ))}
          <div className={cn(card, "flex flex-col items-center justify-center p-3 sm:items-stretch sm:text-left")}>
            <p className="text-center text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079] sm:text-left">Match feedback</p>
            <div className="mt-1 flex items-center justify-center gap-0.5 sm:justify-start">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-4 w-4",
                    i + 1 <= model.feedbackStars - 0.1 ? "fill-amber-400 text-amber-500" : "text-[#DDE1E5]"
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={cn(card, "flex flex-col overflow-hidden")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#1A1D22]">Essential match</p>
              </div>
              <span
                className={cn(
                  "rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest",
                  model.mustHave.tag === "GOOD"
                    ? "bg-[#E6F4EC] text-[#0D4D2E]"
                    : model.mustHave.tag === "AVERAGE"
                      ? "bg-[#FFF4E8] text-[#B86A00]"
                      : "bg-[#FDECEC] text-[#B42318]"
                )}
              >
                {model.mustHave.tag === "GOOD" ? "Strong match" : model.mustHave.tag === "AVERAGE" ? "Moderate match" : "Needs review"}
              </span>
            </div>
            <TechnicalScoreCard
              pct={model.mustHave.percent}
              questions={model.mustHave.nRequirements}
              tag={model.mustHave.tag}
              label="Resume essentials"
              questionsLabel={`${model.mustHave.nRequirements} essentials`}
              summary={`Matches roughly ${Math.max(0, Math.round((model.mustHave.percent / 100) * model.mustHave.nRequirements))} of ${model.mustHave.nRequirements} essential checks`}
              footerNote="Weighted from required resume essentials"
            />
          </div>
          <div className={cn(card, "flex flex-col")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#1A1D22]">Fit radar</p>
              </div>
              <span className="rounded-md bg-[#E0EDFF] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#0B5FFF]">
                {model.fitLabel}
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-3 px-3 py-4">
              <ResumeRadarPlot values={model.fitRadar} />
            </div>
          </div>
          <div className={cn(card, "p-4")}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-[#0D4D2E]">
                <Sparkles className="h-4 w-4" />
                <div>
                  <p className="text-sm font-extrabold">Screening summary</p>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest",
                  model.fitPercent >= 80
                    ? "bg-[#E6F4EC] text-[#0D4D2E]"
                    : model.fitPercent >= 60
                      ? "bg-[#FFF4E8] text-[#B86A00]"
                      : "bg-[#FDECEC] text-[#B42318]"
                )}
              >
                {model.fitPercent >= 80 ? "Strong fit" : model.fitPercent >= 60 ? "Review" : "Needs review"}
              </span>
            </div>
            <ul className="space-y-2.5 text-[13px] leading-relaxed text-[#3D434D]">
              {model.aiBullets.map((b, j) => (
                <li key={j} className="flex gap-2">
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
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:border-r md:border-[#E8EAED] md:pr-5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0D4D2E]">Strengths</p>
              <ol className="mt-4 space-y-3" role="list" aria-label="Strengths">
                {model.topStrengths.map((t, j) => (
                  <li key={j} className="flex items-start gap-3 text-[13px] leading-5 text-[#1A1D22]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-[9px] font-black text-[#0D4D2E]">
                      {j + 1}
                    </span>
                    <p>{t}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="md:pl-5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#9A3412]">Risks</p>
              <ol className="mt-4 space-y-3" role="list" aria-label="Risks">
                {model.topRisks.map((t, j) => (
                  <li key={j} className="flex items-start gap-3 text-[13px] leading-5 text-[#1A1D22]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-black text-amber-900">
                      {j + 1}
                    </span>
                    <p>{t}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className={cn(card, "flex h-[420px] min-h-0 min-w-0 flex-col overflow-hidden p-0")}>
              <div className="border-b border-[#E8EAED] px-4 py-3">
                <p className="text-sm font-extrabold">Career timeline</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {model.careerLines.map((line, k) => (
                  <div
                    key={k}
                    className="flex gap-2 rounded-lg border border-[#E8EAED] bg-white p-2.5"
                    role="presentation"
                  >
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0B5FFF]" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-[#6B7079]">Experience</span>
                        <span className="text-[9px] text-[#8C9299]">{line.time}</span>
                      </div>
                      <p className="text-[12px] font-bold text-[#1A1D22]">{line.label}</p>
                      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#3D434D]">{line.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="min-h-0 lg:col-span-5">
            <div className={cn(card, "flex h-[420px] min-h-0 flex-col overflow-hidden p-0")}>
              <div className="border-b border-[#E8EAED] px-4 py-3">
                <h3 className="text-sm font-extrabold text-[#1A1D22]">Skill signals</h3>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {model.skillMatchRows.map((s) => (
                  <div
                    key={s.name + s.questions}
                    className="flex items-center justify-between rounded-lg border border-[#EEF0F3] bg-white px-3 py-2.5"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate text-[12px] font-semibold text-[#1A1D22]">{s.name}</p>
                      <p className="truncate text-[10px] font-medium text-[#6B7079]">{s.evidenceNote || "Matched skill signal"}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star
                          key={j}
                          className={cn("h-3.5 w-3.5", j < s.stars ? "fill-[#1E9D55] text-[#1E9D55]" : "text-[#DDE1E5]")}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[#DDE1E5] bg-gradient-to-r from-[#EEF2FF] via-white to-[#FFF4EC] p-[1px] shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3 rounded-[calc(1.5rem-1px)] bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370]">Decision note</p>
              <p className="mt-1 text-[12px] font-medium text-[#1A1D22]">{model.reviewStrip}</p>
            </div>
            <span className="shrink-0 rounded-full bg-gradient-to-r from-[#0B5FFF] via-[#1E9D55] to-[#F0A12A] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-white">
              Final read
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
