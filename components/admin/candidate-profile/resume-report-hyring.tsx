"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  Link2,
  Loader2,
  Sparkles,
  Star,
  Shield,
  Box,
  Globe,
  Zap,
  Activity,
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
const bgPage = "bg-white relative overflow-hidden";

const MeshGradient = () => (
  <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-30">
    <div className="absolute -left-[10%] -top-[10%] h-[600px] w-[600px] rounded-full bg-gray-100 blur-[100px]" />
    <div className="absolute -right-[5%] top-[10%] h-[500px] w-[500px] rounded-full bg-slate-50 blur-[80px]" />
  </div>
);

type RadarKey = "essentials" | "experience" | "domain" | "skills" | "confidence";

const RESUME_RADAR_LABELS: { key: RadarKey; label: string }[] = [
  { key: "essentials", label: "Essentials" },
  { key: "experience", label: "Experience" },
  { key: "domain", label: "Domain" },
  { key: "skills", label: "Skills" },
  { key: "confidence", label: "Confidence" },
];

function ResumeRadarPlot({ values }: { values: Record<RadarKey, number> }) {
  const [hoveredKey, setHoveredKey] = useState<RadarKey | null>(null);
  const n = RESUME_RADAR_LABELS.length;
  const cx = 50;
  const cy = 50;
  const r = 32;
  const rOuter = 42;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const clamp = (v: number) => Math.max(10, Math.min(100, v));

  const pts = RESUME_RADAR_LABELS.map((def, i) => {
    const t = (clamp(values[def.key]) / 100) * r;
    return `${cx + t * Math.cos(angle(i))},${cy + t * Math.sin(angle(i))}`;
  });

  return (
    <div className="relative w-full min-h-[250px] sm:min-h-[270px]">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="fitRadarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E9D55" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#F0A12A" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="fitRadarStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E9D55" />
            <stop offset="100%" stopColor="#F0A12A" />
          </linearGradient>
        </defs>

        {/* Radar Rings */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle
            key={f}
            cx={cx}
            cy={cy}
            r={f * r}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="0.5"
          />
        ))}

        {/* Radar Axes */}
        {RESUME_RADAR_LABELS.map((def, i) => (
          <line
            key={def.key}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(angle(i))}
            y2={cy + r * Math.sin(angle(i))}
            stroke={hoveredKey === def.key ? "url(#fitRadarStrokeGrad)" : "#E5E7EB"}
            strokeWidth={hoveredKey === def.key ? "0.8" : "0.4"}
          />
        ))}

        {/* Data Shape */}
        <polygon
          points={pts.join(" ")}
          fill="url(#fitRadarGradient)"
          stroke="url(#fitRadarStrokeGrad)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* Interaction Points & Labels */}
        {RESUME_RADAR_LABELS.map((def, i) => {
          const ax = angle(i);
          const t = (clamp(values[def.key]) / 100) * r;
          const nodeX = cx + t * Math.cos(ax);
          const nodeY = cy + t * Math.sin(ax);
          const ox = cx + rOuter * Math.cos(ax);
          const oy = cy + rOuter * Math.sin(ax);
          const pct = Math.round(values[def.key]);
          
          return (
            <g 
              key={def.key}
              onMouseEnter={() => setHoveredKey(def.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Hit Area */}
              <circle cx={ox} cy={oy} r="10" fill="none" pointerEvents="all" />
              
              <text
                x={ox}
                y={oy - 1.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={hoveredKey === def.key ? "2.8" : "2.4"}
                fontWeight={hoveredKey === def.key ? "900" : "700"}
                fill={hoveredKey === def.key ? "#111827" : "#4B5563"}
              >
                {def.label.toUpperCase()}
              </text>
              <text
                x={ox}
                y={oy + 2.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={hoveredKey === def.key ? "3.8" : "3.2"}
                fontWeight="900"
                fill={hoveredKey === def.key ? "url(#fitRadarStrokeGrad)" : "#111827"}
              >
                {pct}%
              </text>

              {hoveredKey === def.key && (
                <circle
                  cx={nodeX}
                  cy={nodeY}
                  r="2"
                  fill="white"
                  stroke="url(#fitRadarStrokeGrad)"
                  strokeWidth="0.8"
                />
              )}
            </g>
          );
        })}

        {/* Central Display */}
        {hoveredKey && (
          <g style={{ pointerEvents: "none" }}>
            <circle cx={cx} cy={cy} r="6" fill="white" />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="4"
              fontWeight="900"
              fill="url(#fitRadarStrokeGrad)"
            >
              {Math.round(values[hoveredKey])}%
            </text>
          </g>
        )}
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
  // Split on sentence boundaries but NOT on dots inside domain names, numbers, or abbreviations
  // e.g. "24/7.ai", "OpenAI", "U.S." should not be split
  const s = String(text || "")
    .split(/[.!?]+(?=\s+[A-Z])/g)
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
    "Scores are model estimates, treat as guidance with human review.",
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
  humanLayer?: {
    summary?: string;
    judgment?: string;
    human_score?: number;
    human_adjustment?: number;
    confidence?: number;
    reasons?: { delta?: number; reason?: string; evidence?: string }[];
    risk_flags?: string[];
  } | null;
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
    const s = [...(i.strengthLines || [])].map((x) => compactReadoutText(x, 200)).filter(Boolean).slice(0, 3);
    while (s.length < 3) {
      const p = "Cross-check against the hiring bar for this role";
      if (!s.includes(p)) s.push(p);
      else break;
    }
    return s.slice(0, 3);
  })();

  const topRisks = (() => {
    const r = [...(i.weaknessLines || []), ...i.redFlagLines.map((x) => `Watchout: ${x}`)]
      .map((x) => compactReadoutText(x, 200))
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
      return i.aiSkillRows.slice(0, 12).map((r: any) => {
        // Determine status from various possible field names
        const rawStatus = (r.status || r.matched || r.match_status || "").toString().toLowerCase();

        let statusLabel = "";
        if (rawStatus.includes("matched") || rawStatus.includes("present") || rawStatus.includes("found")) {
          statusLabel = "✓ Present in resume";
        } else if (rawStatus.includes("partial") || rawStatus.includes("some")) {
          statusLabel = "⚠ Partial match";
        } else if (rawStatus.includes("missing") || rawStatus.includes("not found") || rawStatus.includes("absent")) {
          statusLabel = "✗ Missing from resume";
        } else if (r.stars && r.stars >= 3) {
          statusLabel = "✓ Present in resume";
        } else if (r.stars && r.stars >= 1) {
          statusLabel = "⚠ Partial match";
        } else {
          statusLabel = "✗ Missing from resume";
        }

        // Use explicit evidence note if provided, otherwise use status label
        const evidenceNote = (r.evidence_note && typeof r.evidence_note === "string" && r.evidence_note.length > 3)
          ? r.evidence_note
          : (r.evidence && typeof r.evidence === "string" && r.evidence.length > 3)
            ? r.evidence
            : statusLabel;

        return {
          name: r.name || r.skill || "Skill",
          questions: 1,
          stars: Math.min(5, Math.max(1, r.stars || 2)),
          evidenceNote,
        };
      });
    }
    if (i.techSkillSample && i.techSkillSample.length) {
      // Show skills found in resume
      return i.techSkillSample.slice(0, 12).map((name, j) => ({
        name,
        questions: 1,
        stars: 3 + (j % 3),
        evidenceNote: "✓ Present in resume"
      }));
    }

    // Fallback: Show JD requirements vs match score
    const breakdownSkills = i.breakdown?.skills_score && i.breakdown?.skills_max
      ? `${i.breakdown.skills_score}/${i.breakdown.skills_max} required skills matched`
      : null;

    const matchPct = i.matchScore || 0;
    const matchedSkills = Math.round((matchPct / 100) * 14); // Assume ~14 required skills
    const missingSkills = 14 - matchedSkills;

    return [
      {
        name: "Required Skills (JD)",
        questions: 1,
        stars: Math.max(1, Math.min(5, Math.round(matchPct / 20))),
        evidenceNote: `${matchedSkills} matched, ${missingSkills} missing from resume`
      },
      {
        name: "Overall Match",
        questions: 1,
        stars: Math.max(1, Math.min(5, Math.round(matchPct / 20))),
        evidenceNote: matchPct >= 80 ? "✓ Strong fit" : matchPct >= 60 ? "⚠ Partial fit" : "✗ Low fit"
      },
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
    const when = [r.start_date || r.start_year, r.is_current ? "Present" : r.end_date || r.end_year].filter(Boolean).join(" ");
    const label = `${r.role || "Role"} @ ${r.company || " "}`;
    const body = String(r.recruiter_summary || "No summary for this block yet.");
    return { label, body, time: when || `Block ${idx + 1}` };
  });
  if (careerLines.length === 0) {
    careerLines.push({
      label: "No work history in structured data",
      body: "Once parsing completes, roles appear here in timeline form.",
      time: " ",
    });
  }

  return {
    backHref: i.backHref || "/admin/candidates",
    processing: !i.hasResumeText && !i.hasAiReport,
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.drive?.role || c.drive?.title || "Requisition").replace(/[-—]/g, " ").trim() || "Role",
    cityBadge: String(c.location || "Location").replace(/[-—]/g, " ").split(",")[0].trim() || "",
    locationLine: (c.location || "").replace(/[-—]/g, " ").trim() || "",
    appliedOn:
      c.createdAt && i.mounted
        ? new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "",
    parseMeta: i.hasAiReport ? "AI report ready" : i.hasResumeText ? "Text extracted" : "Awaiting document",
    fitPercent: Math.min(100, Math.max(0, Math.round(i.matchScore))),
    fitLabel: fitLabelFromPct(i.matchScore),
    stats: {
      workExp:
        typeof c.experienceYears === "number" && Number.isFinite(c.experienceYears) && c.experienceYears >= 0
          ? `${c.experienceYears} yrs`
          : " ",
      rolesCount: nRoles > 0 ? String(nRoles) : " ",
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
    reviewStrip: (() => {
    const status = i.normalizedStatus?.toUpperCase();
    const verdict = status === "REJECTED" || status === "rejected"
        ? "REJECTED"
        : status === "SHORTLISTED" || status === "shortlisted"
          ? "SHORTLISTED"
          : "BORDERLINE";
      const human = i.humanLayer;

      // Build meaningful decision reason
      let reason = "";
      if (i.decisionReason && typeof i.decisionReason === "string" && i.decisionReason.length > 10) {
        reason = i.decisionReason;
      } else if (verdict === "SHORTLISTED") {
        const match = i.matchScore >= 80 ? "Strong match" : i.matchScore >= 65 ? "Good match" : "Moderate match";
        reason = `${match} with required skills. Recommend interview.`;
      } else if (verdict === "REJECTED") {
        reason = i.primaryGapText && typeof i.primaryGapText === "string" && i.primaryGapText.length > 5
          ? `Missing key skills: ${i.primaryGapText}`
          : "Does not meet core requirements for this role.";
      } else {
        reason = i.primaryGapText && typeof i.primaryGapText === "string" && i.primaryGapText.length > 5
          ? `Borderline fit. Key concern: ${i.primaryGapText}`
          : `Borderline fit. Requires further evaluation.`;
      }

      const humanReason = human?.summary && human.summary.trim().length > 10
        ? human.summary.trim()
        : "";
      const humanJudgment = human?.judgment && human.judgment.trim().length > 0
        ? human.judgment.trim().toUpperCase()
        : "";
      if (humanReason) {
        reason = humanJudgment
          ? `${humanJudgment} by human layer — ${humanReason}`
          : `Human layer — ${humanReason}`;
      }

      return `${verdict} — ${reason}`;
    })(),
    feedbackStars: i.matchScore >= 80 ? 5 : i.matchScore >= 65 ? 4 : i.matchScore >= 50 ? 3 : i.matchScore >= 35 ? 2 : 1,
  };
}

type ResumeReportHyringProps = { model: HyringResumeViewModel; onBack?: () => void };

export function ResumeReportHyring({ model, onBack }: ResumeReportHyringProps) {
  const BackButton = () => {
    const className = "mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-medium text-[#0D4D2E] shadow-sm hover:bg-[#F7FAF8]";
    if (onBack) {
      return (
        <button type="button" onClick={onBack} className={className}>
          <ArrowLeft className="h-4 w-4" />
        </button>
      );
    }
    return (
      <Link href={model.backHref} className={className}>
        <ArrowLeft className="h-4 w-4" />
      </Link>
    );
  };

  if (model.processing) {
    return (
      <div className={cn("w-full", bgPage)}>
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E5] pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <BackButton />
            </div>
          </div>
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
    <div className={cn("w-full transition-colors duration-500", bgPage)}>
      <MeshGradient />
      
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-16 sm:px-6 sm:pt-20"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE1E5] pb-4">
          <div className="flex items-center gap-4">
            <BackButton />
            <div>
              <h1 className="text-xl font-black tracking-tight text-[#1A1D22]">Resume Screening</h1>
            </div>
          </div>
        </div>

        {/* Candidate Header Card */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(card, "overflow-hidden border-none bg-white p-0 shadow-[0_4px_20px_rgba(0,0,0,0.03)]")}
        >
          <div className="bg-gradient-to-br from-white via-white to-[#FFF4EC]/30 px-4 py-5 sm:px-6">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white shadow-lg sm:h-28 sm:w-28">
                  {model.displayAvatar ? <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-black tracking-tight text-[#1A1D22] sm:text-[2.5rem]">{model.fullName}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#F1F2F4] px-3 py-1 text-[11px] font-bold text-[#3D434D]">
                      {model.roleLabel}
                    </span>
                    {model.locationLine && (
                      <span className="rounded-full bg-[#F1F2F4] px-3 py-1 text-[11px] font-bold text-[#3D434D]">
                        {model.locationLine}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 rounded-3xl bg-white px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] ring-1 ring-black/5 sm:min-w-[260px]">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#6B7079]">Fit snapshot</p>
                <SemicircleGauge value={model.fitPercent} fitLabel={model.fitLabel} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Experience", model.stats.workExp],
              ["Career depth", model.stats.rolesCount],
              ["Matched skills", model.stats.skillsExtracted],
            ] as const
          ).map(([a, b]) => (
            <div 
              key={String(a)} 
              className={cn(card, "flex flex-col justify-center border-none bg-white p-4 shadow-sm transition-all hover:shadow-md sm:text-left")}
            >
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#6B7079]">{a}</p>
              <p className="mt-1 text-sm font-extrabold text-[#1A1D22]">{b}</p>
            </div>
          ))}
          <div className={cn(card, "flex flex-col items-center justify-center border-none bg-white p-4 shadow-sm transition-all hover:shadow-md sm:items-stretch sm:text-left")}>
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

        {/* Main Analysis Sections */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={cn(card, "flex flex-col overflow-hidden border-none bg-white shadow-md")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED]/50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#1A1D22]">Essential match</p>
              </div>
              <span
                className={cn(
                  "rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest shadow-sm",
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

          <div className={cn(card, "flex flex-col border-none bg-white shadow-md")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED]/50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#1A1D22]">Fit radar</p>
              </div>
              <span className="rounded-md bg-[#F1F2F4] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#1A1D22] shadow-sm">
                {model.fitLabel}
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-3 px-3 py-4">
              <ResumeRadarPlot values={model.fitRadar} />
            </div>
          </div>

          <div className={cn(card, "border-none bg-white p-4 shadow-md")}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-[#0D4D2E]">
                <Sparkles className="h-4 w-4" />
                <div>
                  <p className="text-sm font-extrabold">Screening summary</p>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest shadow-sm",
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
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-[#1E9D55] shadow-sm">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Strengths & Risks */}
        <div className={cn(card, "border-none bg-white p-4 shadow-md sm:p-5")}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:border-r md:border-[#E8EAED]/50 md:pr-5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0D4D2E]">Strengths</p>
              <ol className="mt-4 space-y-3" role="list">
                {model.topStrengths.map((t, j) => (
                  <li key={j} className="flex items-start gap-3 text-[13px] leading-5 text-[#1A1D22]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-[9px] font-black text-[#0D4D2E] shadow-sm">
                      {j + 1}
                    </span>
                    <p>{t}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="md:pl-5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#9A3412]">Risks</p>
              <ol className="mt-4 space-y-3" role="list">
                {model.topRisks.map((t, j) => (
                  <li key={j} className="flex items-start gap-3 text-[13px] leading-5 text-[#1A1D22]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-black text-amber-900 shadow-sm">
                      {j + 1}
                    </span>
                    <p>{t}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* Detailed Lists */}
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className={cn(card, "flex h-[420px] min-h-0 min-w-0 flex-col overflow-hidden border-none bg-white p-0 shadow-md")}>
              <div className="border-b border-[#E8EAED]/50 px-4 py-3 bg-gray-50">
                <p className="text-sm font-extrabold">Career timeline</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {model.careerLines.map((line, k) => (
                  <div
                    key={k}
                    className="flex gap-2 rounded-lg border border-[#E8EAED]/50 bg-white p-2.5 transition-colors hover:bg-slate-50"
                  >
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-black" />
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
            <div className={cn(card, "flex h-[420px] min-h-0 flex-col overflow-hidden border-none bg-white p-0 shadow-md")}>
              <div className="border-b border-[#E8EAED]/50 px-4 py-3 bg-gray-50">
                <h3 className="text-sm font-extrabold text-[#1A1D22]">Skill signals</h3>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {model.skillMatchRows.map((s, j) => (
                  <div
                    key={`${s.name}-${s.questions}-${j}`}
                    className="flex items-center justify-between rounded-lg border border-[#EEF0F3]/50 bg-white px-3 py-2.5 transition-colors hover:bg-slate-50"
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

        {/* Decision Section */}
        <div className="rounded-3xl border border-[#DDE1E5] bg-gradient-to-r from-gray-100 via-white to-gray-50 p-[1px] shadow-lg">
          <div className="flex items-center justify-between gap-3 rounded-[calc(1.5rem-1px)] bg-white px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370]">Decision note</p>
              <p className="mt-1 text-[12px] font-medium text-[#1A1D22]">{model.reviewStrip}</p>
            </div>
            <span className="shrink-0 rounded-full bg-black px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-white shadow-md">
              Final read
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
