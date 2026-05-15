"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Link2,
  Loader2,
  Sparkles,
  Shield,
  Zap,
  Activity,
} from "lucide-react";
import {
  HYRING_REPORT_CARD,
  HYRING_REPORT_PAGE_BG,
  SemicircleGauge,
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

type RadarKey = "essentials" | "impact" | "domain" | "skills" | "evidence";
type RadarNotes = Record<RadarKey, string>;

const RESUME_RADAR_LABELS: { key: RadarKey; label: string }[] = [
  { key: "essentials", label: "Essentials" },
  { key: "impact", label: "Impact" },
  { key: "domain", label: "Domain" },
  { key: "skills", label: "Skills" },
  { key: "evidence", label: "Evidence" },
];

function ResumeRadarPlot({
  values,
  onHoverChange,
}: {
  values: Record<RadarKey, number>;
  notes: RadarNotes;
  onHoverChange?: (key: RadarKey | null) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<RadarKey | null>(null);
  const setHover = (key: RadarKey | null) => {
    setHoveredKey(key);
    onHoverChange?.(key);
  };
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
              onMouseEnter={() => setHover(def.key)}
              onMouseLeave={() => setHover(null)}
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
  experienceLine: string;
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
  fitRadar: { essentials: number; impact: number; domain: number; skills: number; evidence: number };
  fitRadarNotes: RadarNotes;
  aiSummaryPoints: { label: string; body: string; tone: "emerald" | "amber" | "rose" }[];
  strengths: { label: string; body: string }[];
  weaknesses: { label: string; body: string }[];
  decisionStamp: "SHORTLISTED" | "REJECTED" | "BORDERLINE";
  rubricRows: IntelSignalRow[];
  skillMatching?: unknown;
  skillMatchRows: {
    name: string;
    matched: boolean;
    depth: "deep" | "working" | "listed" | "missing";
    source: "work_history" | "project" | "listed" | "missing";
    category?: string;
    evidenceNote?: string;
  }[];
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

function buildResumeAiSummaryPoints(model: Pick<
  HyringResumeViewModel,
  "fitRadarNotes"
> & {
  comparison: {
    techFitLabel: string;
    techFitBody: string;
    experienceFitLabel: string;
    experienceFitBody: string;
    appliedExperienceBody: string;
    watchoutBody: string;
  };
}): { label: string; body: string; tone: "emerald" | "amber" | "rose" }[] {
  return [
    {
      label: "Core skill",
      body: readableSummaryText(model.comparison.techFitBody, 220),
      tone: model.comparison.techFitLabel === "Strong" ? "emerald" : model.comparison.techFitLabel === "Moderate" ? "amber" : "rose",
    },
    {
      label: "Experience",
      body: readableSummaryText(model.comparison.experienceFitBody, 220),
      tone: model.comparison.experienceFitLabel === "Strong" ? "emerald" : model.comparison.experienceFitLabel === "Moderate" ? "amber" : "rose",
    },
    {
      label: "Applied work",
      body: readableSummaryText(model.comparison.appliedExperienceBody, 220),
      tone: "emerald",
    },
    {
      label: "Red flags",
      body: readableSummaryText(model.comparison.watchoutBody || model.fitRadarNotes.evidence, 220),
      tone: "rose",
    },
  ];
}

function readableSummaryText(text: string, maxLen = 180) {
  const clean = String(text || "")
    .replace(/^flag:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 3).trimEnd()}...` : clean;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function extractStringList(value: unknown, keys = ["skill", "tool", "name", "label", "title", "text", "summary", "claim"]): string[] {
  const toLine = (item: unknown): string => {
    if (item == null) return "";
    if (typeof item === "string") return item.trim();
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (typeof item !== "object") return "";
    const obj = item as Record<string, unknown>;
    for (const key of keys) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    for (const candidate of Object.values(obj)) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "";
  };

  if (Array.isArray(value)) return value.map(toLine).filter(Boolean);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(toLine).filter(Boolean);
  if (typeof value === "string") return value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return [];
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
}

function extractSkillName(item: unknown): string {
  if (!item) return "";
  if (typeof item === "string") return item.trim();
  if (typeof item !== "object") return "";
  const obj = item as Record<string, unknown>;
  const candidate = obj.skill ?? obj.tool ?? obj.name ?? obj.label ?? obj.title;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function normalizeSourceStrength(raw: unknown): "work_history_outcome" | "work_history" | "project" | "listed" | "inferred" {
  const value = String(raw || "").toLowerCase();
  if (value === "work_history_outcome") return "work_history_outcome";
  if (value === "work_history") return "work_history";
  if (value === "project") return "project";
  if (value === "inferred") return "inferred";
  return "listed";
}

function parseRequiredYears(value: unknown): number | null {
  const text = String(value || "");
  const match = text.match(/vs\s+([\d.]+)\s+yrs?\s+required/i) || text.match(/([\d.]+)\s+yrs?\s+required/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatExperienceRequirementLabel(minYears: number | null, maxYears: number | null, roleLevel: unknown): string {
  const level = normalizeTextToken(roleLevel);
  if (level === "intern" || (minYears === 0 && (maxYears === 1 || maxYears == null))) {
    return "intern-level / 0-1 years";
  }
  if (minYears != null && maxYears != null) {
    if (minYears === 0 && maxYears <= 1) return "intern-level / 0-1 years";
    return `${minYears}-${maxYears} years`;
  }
  if (minYears != null) return `${minYears}+ years`;
  if (maxYears != null) return `up to ${maxYears} years`;
  return "experience not clearly stated";
}

function formatExperienceDuration(totalYears: number | null | undefined): string {
  if (totalYears == null || !Number.isFinite(totalYears) || totalYears < 0) return "";
  const years = Math.floor(totalYears);
  const months = Math.max(0, Math.round((totalYears - years) * 12));
  const yearPart = `${years} yr${years === 1 ? "" : "s"}`;
  const monthPart = `${months} mo${months === 1 ? "" : "s"}`;
  return `${yearPart} ${monthPart}`;
}

function normalizeTextToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9.+#\-/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDecisionNoteFallback(args: {
  candidateName: string;
  decisionStamp: "SHORTLISTED" | "REJECTED" | "BORDERLINE";
  topMatchedSkills: { name: string; evidenceNote?: string }[];
  missingMustHave: string[];
  candidateYears: number | null;
  requiredYears: number | null;
  ownerRoles: Array<{ company?: string; role?: string; technologies_used?: string[] }>;
}): string {
  const safeName = args.candidateName?.trim() || "This candidate";
  const skillList = args.topMatchedSkills.slice(0, 3).map((row) => row.name).filter(Boolean);
  const primarySkill = skillList[0] || "core role skills";
  const missingList = args.missingMustHave.slice(0, 2).filter(Boolean);
  const role = args.ownerRoles[0];
  const roleCompany = role?.company || "previous role";
  const roleTitle = role?.role || "engineering role";
  const roleTech = Array.isArray(role?.technologies_used) ? role!.technologies_used!.slice(0, 2).join(" and ") : "";
  const yearsText = Number.isFinite(args.candidateYears as number) ? `${args.candidateYears} years` : "the available years";
  const reqText = Number.isFinite(args.requiredYears as number) ? `${args.requiredYears} years` : "the role requirement";

  if (args.decisionStamp === "SHORTLISTED") {
    return [
      `${safeName} is shortlisted because the resume shows direct evidence in ${primarySkill}${skillList.length > 1 ? ` with additional proof in ${skillList.slice(1).join(" and ")}` : ""}.`,
      `${yearsText} aligns with ${reqText}, and ownership signals are visible from ${roleTitle} at ${roleCompany}${roleTech ? ` using ${roleTech}` : ""}.`,
      missingList.length > 0
        ? `The key risk is limited evidence for ${missingList.join(" and ")}, but the overall signal still supports advancement.`
        : "The evidence repeats across work history, which is stronger than keyword-only profile matching.",
      `Advance to interview and validate production depth on ${primarySkill}${missingList.length > 0 ? ` and ${missingList[0]}` : ""} before final round.`,
    ].join(" ");
  }

  if (args.decisionStamp === "REJECTED") {
    return [
      `${safeName} is rejected because the resume does not provide sufficient direct evidence for role-critical requirements${missingList.length > 0 ? `, especially ${missingList.join(" and ")}` : ""}.`,
      `${yearsText} against ${reqText} and the current ownership signals from ${roleTitle} at ${roleCompany} are below the bar for this role level.`,
      `The decisive gap is the difference between listed skills and proven production outcomes, even where partial strengths exist in ${primarySkill}.`,
      "Reconsider only if updated evidence demonstrates clear production ownership, scope, and measurable impact in missing must-have areas.",
    ].join(" ");
  }

  return [
    `${safeName} is currently borderline because evidence is mixed between matched skills like ${primarySkill} and unresolved role-critical gaps${missingList.length > 0 ? ` such as ${missingList.join(" and ")}` : ""}.`,
    `${yearsText} compared with ${reqText} and the available ownership context from ${roleTitle} at ${roleCompany} are directionally positive but not conclusive.`,
    "The strongest concern is uneven depth across must-have areas, so the profile is not a clear advance or reject yet.",
    `Use the next screen to validate production ownership, decision-making, and depth in ${primarySkill}${missingList.length > 0 ? ` and ${missingList[0]}` : ""}.`,
  ].join(" ");
}

function tokenMatches(left: unknown, right: unknown): boolean {
  const a = normalizeTextToken(left);
  const b = normalizeTextToken(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
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
  structuredResumeData?: unknown;
  structuredJdData?: unknown;
  experienceReadout?: string | null;
  // AI-direct fields from gpt-4o report
  aiRadar?: { essentials?: number; experience?: number; domain?: number; skills?: number; evidence?: number; confidence?: number } | null;
  aiSkillRows?: { name: string; stars: number; evidence_note?: string }[] | null;
  missingMustSkills?: string[] | null;
  skillMatching?: unknown;
  candidatePotential?: string | null;
  decisionReason?: string | null;
  resumeParseConfidence?: string | null;
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

  const ar = i.aiRadar;
  const resumeStruct = asRecord(i.structuredResumeData);
  const jdStruct = asRecord(i.structuredJdData);
  const reportSkillMatching = asRecord(i.skillMatching);
  const structuredSkills = asRecord(resumeStruct.skills);
  const structuredExperience = asRecord(resumeStruct.experience);
  const structuredWorkHistory = Array.isArray(resumeStruct.work_history) ? resumeStruct.work_history : [];
  const structuredProjects = Array.isArray(resumeStruct.projects) ? resumeStruct.projects : [];
  const structuredEvidenceItems = Array.isArray(resumeStruct.evidence_items) ? resumeStruct.evidence_items : [];
  const aiSkillRows = Array.isArray(i.aiSkillRows) ? i.aiSkillRows : [];
  const skillMatching = reportSkillMatching;

  const workHistoryRows = Array.isArray(i.combinedWorkHistory) ? i.combinedWorkHistory : [];
  const strongWorkHistoryRows = workHistoryRows.filter((row: any) => {
    const ownership = String(row?.ownership_level || "").toLowerCase();
    const impact = String(row?.impact_strength || "").toLowerCase();
    const hasMetrics = Array.isArray(row?.impact_signals) && row.impact_signals.length > 0;
    return ownership === "owner" || impact === "high" || hasMetrics;
  });

  const structuredTechEntries = [
    ...(Array.isArray(structuredSkills.technical) ? structuredSkills.technical : []),
    ...(Array.isArray(structuredSkills.tools) ? structuredSkills.tools : []),
  ]
    .map((item: unknown) => ({
      name: extractSkillName(item),
      source: normalizeSourceStrength(asRecord(item).source_strength ?? asRecord(item).source),
    }))
    .filter((item) => item.name);
  const structuredSkillNames = uniqueNonEmpty([
    ...structuredTechEntries.map((item) => item.name),
    ...structuredWorkHistory.flatMap((job: any) => extractStringList(job?.technologies_used)),
    ...structuredProjects.flatMap((proj: any) => extractStringList(proj?.technologies)),
  ]);
  const evidenceBackedSkillNames = uniqueNonEmpty([
    ...structuredTechEntries.filter((item) => item.source !== "listed").map((item) => item.name),
    ...structuredWorkHistory.flatMap((job: any) => extractStringList(job?.technologies_used)),
    ...structuredProjects.flatMap((proj: any) => extractStringList(proj?.technologies)),
  ]);
  const skillsExtractedFallback = structuredSkillNames.length > 0
    ? Math.round((evidenceBackedSkillNames.length / Math.max(1, structuredSkillNames.length)) * 100)
    : Math.min(100, Math.round(((skS + gS) / Math.max(1, skM + gM)) * 100));

  const evidenceSignalCount = structuredEvidenceItems.filter((ev: any) => {
    const lvl = Number(ev?.evidence_level ?? 0);
    const ownership = String(ev?.ownership || "").toLowerCase();
    const hasMetric = Boolean(ev?.has_metric);
    return lvl >= 4 || ownership === "owner" || hasMetric;
  }).length;
  const workHistoryImpactCount = workHistoryRows.reduce((sum: number, row: any) => {
    const impactSignals = Array.isArray(row?.impact_signals) ? row.impact_signals.length : 0;
    const ownership = String(row?.ownership_level || "").toLowerCase();
    return sum + impactSignals + (ownership === "owner" ? 1 : 0);
  }, 0);
  const evidenceFallback = structuredEvidenceItems.length > 0
    ? Math.min(100, Math.round(((evidenceSignalCount * 2 + workHistoryImpactCount) / Math.max(1, structuredEvidenceItems.length * 2 + structuredWorkHistory.length)) * 100))
    : (workHistoryRows.length > 0
      ? Math.round(Math.min(100, ((strongWorkHistoryRows.length * 2) / Math.max(1, workHistoryRows.length)) * 100))
      : 0);

  const domainSignals = uniqueNonEmpty([
    ...extractStringList(structuredSkills.domain_skills),
    ...structuredWorkHistory.map((job: any) => String(job?.business_domain || "").trim()),
    ...structuredProjects.map((proj: any) => String(proj?.domain || proj?.business_domain || "").trim()),
    ...extractStringList(resumeStruct.keywords),
  ]);
  const domainFallback = domainSignals.length > 0
    ? Math.min(100, 20 * Math.min(5, domainSignals.length))
    : Math.min(100, Math.round((dS / dM) * 100));

  const essentialsFallback = aiSkillRows.length > 0
    ? Math.round(
      (
        aiSkillRows.filter((row: any) => Math.max(1, Math.min(5, Number(row?.stars ?? 0))) >= 4).length +
        aiSkillRows.filter((row: any) => Math.max(1, Math.min(5, Number(row?.stars ?? 0))) === 3).length * 0.55
      ) / Math.max(1, aiSkillRows.length) * 100,
    )
    : skillsExtractedFallback;

  const experienceText = String(i.experienceReadout || "").trim() || String((resumeStruct as Record<string, any>)?.experience_assessment?.vs_required || "").trim();
  const parsedRequiredYears = parseRequiredYears(experienceText);
  const candidateYears = Number(
    c.experienceYears ?? structuredExperience.total_years ?? (resumeStruct as Record<string, any>)?.experience?.years ?? NaN,
  );
  const candidateExperienceLine = Number.isFinite(candidateYears)
    ? formatExperienceDuration(candidateYears)
    : "";
  // Impact: derived from ownership level + impact_strength + impact_signals across work history
  const impactFallback = (() => {
    if (workHistoryRows.length === 0) return Math.min(100, Math.round((exS / exM) * 100));
    let total = 0;
    for (const row of workHistoryRows as Array<{ impact_strength?: string; ownership_level?: string; impact_signals?: string[] }>) {
      const imp = row.impact_strength === "high" ? 100 : row.impact_strength === "medium" ? 60 : 20;
      const own = row.ownership_level === "owner" ? 30 : row.ownership_level === "contributor" ? 10 : 0;
      const signals = Math.min(20, (Array.isArray(row.impact_signals) ? row.impact_signals.length : 0) * 7);
      total += Math.min(100, imp * 0.6 + own + signals);
    }
    return Math.min(100, Math.round(total / workHistoryRows.length));
  })();

  const fitRadarNotes: RadarNotes = {
    essentials:
      structuredSkillNames.length > 0
        ? `Built from ${evidenceBackedSkillNames.length} evidence-backed tech signals out of ${structuredSkillNames.length} extracted skills, using resume work history and project proof first.`
        : "Falls back to the JD skill bucket because the extracted skill rows were sparse.",
    impact:
      workHistoryRows.length > 0
        ? `Derived from ${workHistoryRows.length} role(s) — scores ownership level (owner/contributor), impact_strength (high/medium/low), and count of measurable impact signals per role.`
        : "Falls back to the experience score bucket because no structured work history was available to rate impact.",
    domain:
      domainSignals.length > 0
        ? `Derived from ${domainSignals.length} domain or stack signals such as business domains, keywords, and extracted functional skills.`
        : "Falls back to the JD domain bucket because the resume did not expose enough domain signals.",
    skills:
      structuredSkillNames.length > 0
        ? `Built from ${structuredSkillNames.length} extracted technical/tool signals, with ${evidenceBackedSkillNames.length} confirmed by work history or projects.`
        : "Falls back to the JD skill bucket because the resume did not expose enough structured skill data.",
    evidence:
      structuredEvidenceItems.length > 0
        ? `Based on ${structuredEvidenceItems.length} extracted evidence items, with ${evidenceSignalCount} showing measurable outcomes, ownership, or strong proof.`
        : "Falls back to work-history impact signals because no structured evidence items were available.",
  };

  const jdSkills = asRecord(jdStruct.skills);
  const jdMustHave = uniqueNonEmpty([
    ...extractStringList(jdSkills.must_have, ["skill", "name", "label", "title"]),
    ...extractStringList(jdStruct.responsibilities),
    ...extractStringList(jdStruct.keywords),
  ]);
  const jdPrioritySignals = uniqueNonEmpty([
    ...jdMustHave,
    ...extractStringList(jdStruct.scoring_hints?.green_flags_to_reward),
  ]);
  const jdAdjacentSignals = uniqueNonEmpty([
    ...extractStringList(jdSkills.good_to_have, ["skill", "name", "label", "title"]),
    ...extractStringList(jdStruct.scoring_hints?.red_flags_to_watch),
  ]);
  const resumeNarrativeSignals = uniqueNonEmpty([
    ...structuredSkillNames,
    ...structuredWorkHistory.flatMap((job: any) => extractStringList([
      job?.role,
      job?.company,
      job?.recruiter_summary,
      ...(Array.isArray(job?.responsibilities) ? job.responsibilities : []),
      ...(Array.isArray(job?.impact_signals) ? job.impact_signals : []),
      ...(Array.isArray(job?.technologies_used) ? job.technologies_used : []),
    ])),
    ...structuredProjects.flatMap((proj: any) => extractStringList([
      proj?.name,
      proj?.summary,
      ...(Array.isArray(proj?.technologies) ? proj.technologies : []),
    ])),
    ...extractStringList(resumeStruct.candidate_summary),
    ...extractStringList(resumeStruct.core_claims),
    ...extractStringList(resumeStruct.keywords),
  ]);
  const directMatches = jdPrioritySignals.filter((sig) => resumeNarrativeSignals.some((rv) => tokenMatches(sig, rv)));
  const adjacentMatches = jdAdjacentSignals.filter((sig) => resumeNarrativeSignals.some((rv) => tokenMatches(sig, rv)));
  const missingMustHave = jdMustHave.filter((sig) => !resumeNarrativeSignals.some((rv) => tokenMatches(sig, rv)));
  const directCount = directMatches.length;
  const adjacentCount = adjacentMatches.length;
  const techFitLabel = directCount >= 3 || (directCount >= 2 && adjacentCount >= 1)
    ? "Strong"
    : directCount >= 1 || adjacentCount >= 2
      ? "Moderate"
      : "Weak";
  const techFitBody = directCount >= 2
    ? `I see direct evidence of ${directMatches.slice(0, 3).join(", ")} in the resume. That gives me confidence on the core stack for this JD.`
    : adjacentCount >= 2
      ? `I do not see an exact stack match, but I do see adjacent experience through ${adjacentMatches.slice(0, 3).join(", ")} and related backend or project work. That helps, but it is still not a clean direct stack match.`
      : `I do not see the exact JD stack clearly evidenced in the extracted resume. This reads as a weak technology match, even if the candidate has general software experience.`;

  const requiredYears = (() => {
    const exp = asRecord(jdStruct.experience);
    const min = Number(exp.min_years);
    return Number.isFinite(min) && min >= 0 ? min : null;
  })();
  const requiredYearsMax = (() => {
    const exp = asRecord(jdStruct.experience);
    const max = Number(exp.max_years);
    return Number.isFinite(max) && max >= 0 ? max : null;
  })();
  const experienceRequirementLabel = formatExperienceRequirementLabel(requiredYears, requiredYearsMax, jdStruct.role_level || jdStruct.role_context?.seniority);
  const experienceFitLabel = (() => {
    if (requiredYears == null || !Number.isFinite(candidateYears)) return "Moderate";
    const gap = candidateYears - requiredYears;
    if (gap >= 0) return "Strong";
    if (gap >= -1) return "Moderate";
    return "Weak";
  })();
  const experienceFitBody = requiredYears != null && Number.isFinite(candidateYears)
    ? candidateYears >= requiredYears
      ? `${experienceRequirementLabel} is the hiring bar. I see ${candidateYears} extracted years in the resume, so the level is acceptable; my remaining check is how directly the stack matches the JD.`
      : `${experienceRequirementLabel} is the hiring bar. The resume is short by about ${Math.abs(candidateYears - requiredYears)} year(s), so I would only move forward if the candidate is otherwise a very close technology match.`
    : expPct >= 60
      ? `Experience looks reasonably aligned based on the extracted work history and the seniority implied by the role.`
      : `Experience is present, but the extracted data is not strong enough for me to call it a clean fit yet.`;
  const appliedExperienceBody = directCount >= 2
    ? `I can see the requested stack used in real work, not just listed in skills. That is the strongest proof because the candidate has already applied the skills in a work setting.`
    : adjacentCount >= 2
      ? `I can see the candidate has worked in the same kind of backend or product context, but some JD tools or framework names are missing or only adjacent. Useful, but not a full stack confirmation.`
      : `The resume mostly shows related work or listed skills, so applied evidence is still thin against this JD.`;
  const watchoutBody = missingMustHave.length > 0
    ? `The gaps I would verify next are ${missingMustHave.slice(0, 3).join(", ")}. Those are the first things I would confirm before I trust the fit.`
    : `I do not see major must-have gaps; my main question is depth of proof, not whether the role basics are present.`;

  const clamp = (v: unknown, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fb;
  };
  const fitRadar = {
    essentials: essentialsFallback,
    impact: impactFallback,
    domain: domainFallback,
    skills: skillsExtractedFallback,
    evidence: evidenceFallback,
  };
  if (ar) {
    if (fitRadar.essentials === 0) fitRadar.essentials = clamp(ar?.essentials, fitRadar.essentials);
    if (fitRadar.impact === 0) fitRadar.impact = clamp(ar?.experience, fitRadar.impact);
    if (fitRadar.domain === 0) fitRadar.domain = clamp(ar?.domain, fitRadar.domain);
    if (fitRadar.skills === 0) fitRadar.skills = clamp(ar?.skills, fitRadar.skills);
    if (fitRadar.evidence === 0) fitRadar.evidence = clamp(ar?.evidence ?? ar?.confidence, fitRadar.evidence);
  }

  // comm5 repurposed for score breakdown display
  const comm5 = {
    pronunciation: fitRadar.essentials,
    grammar: fitRadar.impact,
    vocabulary: fitRadar.domain,
    minimalFiller: fitRadar.skills,
    fluency: fitRadar.evidence,
    tag: i.candidatePotential === "High" ? "STRONG" : i.candidatePotential === "Low" ? "WEAK" :
      tagFromPct(i.matchScore * 0.6 + mustPct * 0.2 + expPct * 0.2) === "GOOD" ? "STRONG" : "AVERAGE",
  };

  const scoreBreakdown = {
    essentials: fitRadar.essentials,
    experience: fitRadar.impact,
    supplemental: fitRadar.domain,
    overall: Math.min(100, Math.max(0, Math.round(i.matchScore))),
  };

  const aiSummaryPoints = buildResumeAiSummaryPoints({
    fitRadarNotes,
    comparison: {
      techFitLabel,
      techFitBody,
      experienceFitLabel,
      experienceFitBody,
      appliedExperienceBody,
      watchoutBody,
    },
  });
  const decisionStamp: HyringResumeViewModel["decisionStamp"] =
    i.normalizedStatus?.toLowerCase() === "shortlisted"
      ? "SHORTLISTED"
      : i.normalizedStatus?.toLowerCase() === "rejected"
        ? "REJECTED"
        : "BORDERLINE";

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

  // Build matched + missing skill rows. Prefer structured report skill_matching, then AI skill_match_rows, then resume skills.
  const skillMatchRows: HyringResumeViewModel["skillMatchRows"] = (() => {
    const matchedRows: HyringResumeViewModel["skillMatchRows"] = [];
    const details = Array.isArray(skillMatching.must_have_details) ? skillMatching.must_have_details : [];
    const matchedMust = Array.isArray(skillMatching.matched_must) ? skillMatching.matched_must : [];
    const matchedGood = Array.isArray(skillMatching.matched_good) ? skillMatching.matched_good : [];
    const missingMust = Array.isArray(skillMatching.missing_must) ? skillMatching.missing_must : [];
    const firstLine = (value: unknown) => extractStringList(value)[0] || "";

    const buildRowFromDetail = (detail: any, fallbackMatched: boolean) => {
      const name = firstLine(detail?.name || detail?.criterion || detail?.skill || detail?.label || detail?.title);
      if (!name) return null;
      const status = String(detail?.status || "").toLowerCase();
      const matchLevel = String(detail?.match_level || "").toLowerCase();
      const source = String(detail?.source || "").toLowerCase();
      const matched = fallbackMatched || status === "found" || matchLevel === "full";
      const depth = matchLevel === "full" || status === "found"
        ? "deep"
        : matchLevel === "partial" || matchLevel === "mentioned"
          ? "working"
          : matched
            ? "listed"
            : "missing";
      const mappedSource: "work_history" | "project" | "listed" | "missing" =
        source === "work_history" || source === "work_history_outcome"
          ? "work_history"
          : source === "project"
            ? "project"
            : matched
              ? "listed"
              : "missing";
      const noteSource = firstLine(detail?.evidence || detail?.note || detail?.impact || detail?.candidate_has || detail?.candidateHas || detail?.reason);
      return {
        name,
        matched,
        depth,
        source: mappedSource,
        category: firstLine(detail?.category || detail?.priority || ""),
        evidenceNote: noteSource || (matched ? "Evidence found in extracted resume data" : "Missing from the extracted resume"),
      } as HyringResumeViewModel["skillMatchRows"][number];
    };

    if (details.length > 0) {
      for (const detail of details.slice(0, 12)) {
        const row = buildRowFromDetail(detail, String(detail?.status || "").toLowerCase() === "found");
        if (row) matchedRows.push(row);
      }
    }

    if (i.aiSkillRows && i.aiSkillRows.length > 0) {
      for (const r of i.aiSkillRows.slice(0, 10)) {
        const skillName = (r as any).name || (r as any).skill || "Skill";
        if (matchedRows.some((row) => row.name.toLowerCase() === String(skillName).toLowerCase())) continue;
        const stars = Math.min(5, Math.max(1, Number((r as any).stars) || 2));
        // stars rubric → depth + source
        // 5/4 = deep evidence in work history; 3 = working use in work history (no metrics);
        // 2 = project / listed only; 1 = transferable / text mention only
        let depth: "deep" | "working" | "listed";
        let source: "work_history" | "project" | "listed";
        if (stars >= 4) {
          depth = "deep";
          source = "work_history";
        } else if (stars === 3) {
          depth = "working";
          source = "work_history";
        } else if (stars === 2) {
          depth = "listed";
          source = "project";
        } else {
          depth = "listed";
          source = "listed";
        }

        const evidenceNote = typeof (r as any).evidence_note === "string" && (r as any).evidence_note.length > 3
          ? (r as any).evidence_note
          : "Confirmed in resume";

        matchedRows.push({
          name: skillName,
          matched: true,
          depth,
          source,
          category: "skill",
          evidenceNote,
        });
      }
    } else if (i.techSkillSample && i.techSkillSample.length) {
      for (const name of i.techSkillSample.slice(0, 10)) {
        matchedRows.push({
          name,
          matched: true,
          depth: "listed",
          source: "listed",
          category: "skill",
          evidenceNote: "Listed in resume",
        });
      }
    }

    const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const looselyMatches = (left: string, right: string) => {
      const a = normalizeKey(left);
      const b = normalizeKey(right);
      return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
    };
    const structuredJdSkills = (i.structuredJdData as Record<string, unknown> | null | undefined)?.skills as Record<string, unknown> | undefined;
    const structuredResumeSkills = (i.structuredResumeData as Record<string, unknown> | null | undefined)?.skills as Record<string, unknown> | undefined;
    const jdMustHaveNames = Array.isArray(structuredJdSkills?.must_have)
      ? uniqueNonEmpty((structuredJdSkills.must_have as unknown[]).map((item) => extractSkillName(item)))
      : [];
    const jdGoodToHaveNames = Array.isArray(structuredJdSkills?.good_to_have)
      ? uniqueNonEmpty((structuredJdSkills.good_to_have as unknown[]).map((item) => extractSkillName(item)))
      : [];
    const resumeSkillNames = uniqueNonEmpty([
      ...extractStringList(structuredResumeSkills?.technical),
      ...extractStringList(structuredResumeSkills?.tools),
      ...extractStringList(structuredResumeSkills?.domain_skills),
      ...extractStringList((i.structuredResumeData as Record<string, unknown> | null | undefined)?.keywords),
    ]);
    if (matchedRows.length < 6) {
      for (const name of jdMustHaveNames.slice(0, 8)) {
        if (!name || matchedRows.some((row) => looselyMatches(row.name, name))) continue;
        const hit = resumeSkillNames.find((skill) => looselyMatches(skill, name));
        matchedRows.push({
          name,
          matched: Boolean(hit),
          depth: hit ? "working" : "missing",
          source: hit ? "listed" : "missing",
          category: "must-have",
          evidenceNote: hit
            ? `Present in structured resume skills: ${hit}`
            : "Missing from the structured resume skills",
        });
      }
    }

    if (matchedRows.length < 8) {
      for (const name of jdGoodToHaveNames.slice(0, 5)) {
        if (!name || matchedRows.some((row) => looselyMatches(row.name, name))) continue;
        const hit = resumeSkillNames.find((skill) => looselyMatches(skill, name));
        if (!hit) continue;
        matchedRows.push({
          name,
          matched: true,
          depth: "listed",
          source: "listed",
          category: "good-to-have",
          evidenceNote: `Seen in structured resume skills: ${hit}`,
        });
      }
    }

    if (matchedRows.length === 0 && resumeSkillNames.length > 0) {
      for (const name of resumeSkillNames.slice(0, 8)) {
        matchedRows.push({
          name,
          matched: true,
          depth: "listed",
          source: "listed",
          category: "skill",
          evidenceNote: "Present in structured resume skills",
        });
      }
    }

    for (const name of matchedGood.slice(0, 4)) {
      const clean = String(name || "").trim();
      if (!clean || matchedRows.some((row) => row.name.toLowerCase() === clean.toLowerCase())) continue;
      matchedRows.push({
        name: clean,
        matched: true,
        depth: "working",
        source: "listed",
        category: "good-to-have",
        evidenceNote: "Matched as a good-to-have signal in the extracted report",
      });
    }

    const missingRows: HyringResumeViewModel["skillMatchRows"] = [];
    const missingNames = missingMust.length > 0 ? missingMust : (Array.isArray(i.missingMustSkills) ? i.missingMustSkills : []);
    for (const name of missingNames.slice(0, 8)) {
      const clean = String(name || "").trim();
      if (!clean) continue;
      missingRows.push({
        name: clean,
        matched: false,
        depth: "missing",
        source: "missing",
        category: "must-have",
        evidenceNote: "Required must-have not found in extracted resume evidence",
      });
    }

    const deduped = [...matchedRows, ...missingRows].reduce<HyringResumeViewModel["skillMatchRows"]>((acc, row) => {
      const key = row.name.toLowerCase();
      if (acc.some((item) => item.name.toLowerCase() === key)) return acc;
      acc.push(row);
      return acc;
    }, []);

    const priority = (row: HyringResumeViewModel["skillMatchRows"][number]) => {
      if (row.matched && row.depth === "deep" && row.source === "work_history") return 0;
      if (row.matched && row.depth === "deep") return 1;
      if (row.matched && row.depth === "working" && row.source === "work_history") return 2;
      if (row.matched && row.source === "project") return 3;
      if (row.matched && row.source === "listed") return 4;
      return 5;
    };

    return deduped.sort((a, b) => priority(a) - priority(b));
  })();

  const history = (i.combinedWorkHistory || []) as Array<{
    role?: string;
    company?: string;
    start_date?: string;
    end_date?: string;
    start_year?: string;
    end_year?: string;
    is_current?: boolean;
    ownership_level?: string;
    impact_strength?: string;
    duration_months?: number;
    recruiter_summary?: string;
    technologies_used?: string[];
    responsibilities?: string[];
    impact_signals?: string[];
  }>;

  const formatWorkDate = (d?: string): string => {
    if (!d) return "";
    if (d === "Present") return "Present";
    // Convert YYYY-MM → "MMM YYYY"
    const m = d.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const dt = new Date(Number(m[1]), Number(m[2]) - 1, 1);
      return dt.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    }
    return d;
  };

  let careerLines: HyringResumeViewModel["careerLines"] = history.slice(0, 8).map((r, idx) => {
    const startFmt = formatWorkDate(r.start_date || r.start_year);
    const endFmt = r.is_current ? "Present" : formatWorkDate(r.end_date || r.end_year);
    const when = [startFmt, endFmt].filter(Boolean).join(" – ");
    const label = `${r.role || "Role"} @ ${r.company || " "}`;
    // Prefer AI-annotated recruiter_summary; fall back to responsibilities / impact signals from raw parse
    const scopeParts = [
      r.ownership_level ? `${r.ownership_level} ownership` : "",
      r.impact_strength ? `${r.impact_strength} impact` : "",
      typeof r.duration_months === "number" && Number.isFinite(r.duration_months) ? `${r.duration_months} months` : "",
      Array.isArray(r.technologies_used) && r.technologies_used.length > 0
        ? `Tech: ${r.technologies_used.slice(0, 3).join(", ")}`
        : "",
    ].filter(Boolean);
    const scopeText = scopeParts.join(" · ");
    const body = [
      scopeText,
      r.recruiter_summary
    ]
      .filter(Boolean)
      .join(" · ")
      || (Array.isArray(r.responsibilities) && r.responsibilities.length > 0
        ? r.responsibilities.slice(0, 3).join(" ")
        : "")
      || (Array.isArray(r.impact_signals) && r.impact_signals.length > 0
        ? r.impact_signals.slice(0, 2).join(" ")
        : "No description available.");
    return { label, body, time: when || `Block ${idx + 1}` };
  });
  if (careerLines.length === 0) {
    careerLines.push({
      label: "No work history in structured data",
      body: "Once parsing completes, roles appear here in timeline form.",
      time: " ",
    });
  }

  const strengths: HyringResumeViewModel["strengths"] = [];
  const weaknesses: HyringResumeViewModel["weaknesses"] = [];
  const topMatchedSkills = skillMatchRows.filter((row) => row.matched).slice(0, 3);

  if (topMatchedSkills.length > 0) {
    const strongNames = topMatchedSkills.map((row) => row.name).join(", ");
    const evidence = topMatchedSkills.find((row) => row.evidenceNote)?.evidenceNote || "Evidence found in the extracted resume";
    strengths.push({
      label: "Evidence-backed skill match",
      body: `${strongNames} are surfaced as matched skills with resume evidence, which is the same kind of must-have-based scoring structured hiring tools use.`,
    });
    strengths.push({
      label: "Clear proof signal",
      body: evidence,
    });
  }

  const ownerRoles = history.filter((row) => row.ownership_level === "owner" && row.impact_strength === "high").slice(0, 2);
  if (ownerRoles.length > 0) {
    const firstRole = ownerRoles[0];
    strengths.push({
      label: "Owner-level delivery",
      body: `${firstRole.role || "A prior role"} at ${firstRole.company || "a previous company"} shows ownership and high impact, which is a strong positive signal for role readiness.`,
    });
  }

  if (Number.isFinite(candidateYears) && parsedRequiredYears != null && candidateYears >= parsedRequiredYears) {
    strengths.push({
      label: "Experience alignment",
      body: `${candidateYears} years of experience meets or exceeds the ${parsedRequiredYears} year requirement, so the seniority bar is covered.`,
    });
  } else if (fitRadar.evidence >= 60) {
    strengths.push({
      label: "Evidence density",
      body: "The report shows repeated work-history and project proof rather than a resume that is mostly just a skill list.",
    });
  }

  if (missingMustHave.length > 0) {
    weaknesses.push({
      label: `Missing must-have: ${missingMustHave[0]}`,
      body: `The resume does not clearly evidence ${missingMustHave[0]}, and scorecards usually treat must-haves as the first pass/fail filter.`,
    });
  }

  if (Number.isFinite(candidateYears) && parsedRequiredYears != null && candidateYears < parsedRequiredYears) {
    weaknesses.push({
      label: "Experience gap",
      body: `${candidateYears} years are shown against ${parsedRequiredYears} required, so this needs either stronger adjacent depth or a role-level exception.`,
    });
  }

  if (fitRadar.evidence < 55) {
    weaknesses.push({
      label: "Proof depth",
      body: "Some signals still read as listed skills or light evidence rather than repeated production use, so depth should be verified in interview.",
    });
  }

  if (fitRadar.skills < 55) {
    weaknesses.push({
      label: "Narrow skill breadth",
      body: "The broader skill mix looks thinner than the role typically wants, which can limit flexibility once the candidate is on the job.",
    });
  }

  while (strengths.length < 4 && topMatchedSkills.length > strengths.length) {
    const row = topMatchedSkills.find(s => !strengths.some(st => st.label.includes(s.name)));
    if (!row) break;
    strengths.push({
      label: row.name,
      body: row.evidenceNote || "Matched in the extracted resume evidence.",
    });
  }

  while (weaknesses.length < 4) {
    const nextGap = skillMatchRows.find(row => !row.matched && !weaknesses.some(w => w.label.includes(row.name)));
    if (!nextGap) break;
    weaknesses.push({
      label: `${nextGap.name} gap`,
      body: nextGap.evidenceNote || "This required skill is not clearly evidenced in the resume.",
    });
  }

  const normalizedStamp = String(i.normalizedStatus || "").toUpperCase();
  const isRejected = normalizedStamp.includes("REJECT");
  const minStrengthWeakness = 3;
  const strengthFallbacks = [
    {
      label: "Role signal consistency",
      body: "The profile has multiple aligned signals across resume sections, which supports a stable screening read instead of a one-line claim.",
    },
    {
      label: "Extracted evidence quality",
      body: "Structured extraction includes work and skills context that helps verify role relevance beyond keyword-only matching.",
    },
    {
      label: "Actionable interview focus",
      body: "The current match pattern gives clear areas to validate in interview, which improves screening reliability and decision clarity.",
    },
  ];
  const weaknessFallbacks = [
    {
      label: "Evidence completeness",
      body: "Some parts of the resume still need stronger scope or outcome detail, so confidence is moderate until interview validation.",
    },
    {
      label: "Role-depth uncertainty",
      body: "Not all required skills show consistent production-grade evidence across roles, which creates decision risk for the final stage.",
    },
    {
      label: "Verification dependency",
      body: "A few claims remain list-level and need probing for scale, ownership, and measurable impact before finalizing hiring direction.",
    },
  ];

  for (const fallback of strengthFallbacks) {
    if (strengths.length >= minStrengthWeakness) break;
    if (strengths.some((item) => item.label === fallback.label)) continue;
    strengths.push(fallback);
  }
  for (const fallback of weaknessFallbacks) {
    if (weaknesses.length >= minStrengthWeakness) break;
    if (weaknesses.some((item) => item.label === fallback.label)) continue;
    weaknesses.push(fallback);
  }

  if (isRejected && strengths.length > 4) strengths.splice(4);
  if (weaknesses.length > 4) weaknesses.splice(4);

  const shorten = (value: string, maxLen = 180) => readableSummaryText(value, maxLen);
  return {
    backHref: i.backHref || "/admin/candidates",
    processing: !i.hasResumeText && !i.hasAiReport,
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.drive?.role || c.drive?.title || "Requisition").replace(/[-—]/g, " ").trim() || "Role",
    cityBadge: String(c.location || "Location").replace(/[-—]/g, " ").split(",")[0].trim() || "",
    locationLine: (c.location || "").replace(/[-—]/g, " ").trim() || "",
    experienceLine: candidateExperienceLine,
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
    fitRadarNotes,
    aiSummaryPoints,
    strengths,
    weaknesses,
    decisionStamp,
    rubricRows,
    skillMatchRows,
    careerLines,
    resumeUrl: c.resumeUrl || null,
    hasStructuredResume: nRoles > 0 || i.totalExtractedSkills > 0,
    reviewStrip: (() => {
      // Human review always wins
      const human = i.humanLayer;
      const humanReason = human?.summary && human.summary.trim().length > 10 ? human.summary.trim() : "";
      if (humanReason) {
        const verdictWord = decisionStamp === "SHORTLISTED" ? "Shortlisted" : decisionStamp === "REJECTED" ? "Rejected" : "Borderline";
        return `${verdictWord} by human reviewer: ${humanReason}`.replace(/\s+/g, " ").trim();
      }
      // AI decision_reason is the primary signal
      if (i.decisionReason && i.decisionReason.trim().length > 10) {
        return i.decisionReason.trim();
      }
      // Fallback for legacy reports without decision_reason
      return buildDecisionNoteFallback({
        candidateName: c.fullName || "Candidate",
        decisionStamp,
        topMatchedSkills: topMatchedSkills.map((row) => ({ name: row.name, evidenceNote: row.evidenceNote })),
        missingMustHave,
        candidateYears: Number.isFinite(candidateYears) ? candidateYears : null,
        requiredYears: parsedRequiredYears,
        ownerRoles: ownerRoles.map((row) => ({
          company: row.company,
          role: row.role,
          technologies_used: Array.isArray(row.technologies_used) ? row.technologies_used : [],
        })),
      });
    })(),
    feedbackStars: i.matchScore >= 80 ? 5 : i.matchScore >= 65 ? 4 : i.matchScore >= 50 ? 3 : i.matchScore >= 35 ? 2 : 1,
  };
}

type ResumeReportHyringProps = { model: HyringResumeViewModel; onBack?: () => void };

export function ResumeReportHyring({ model, onBack }: ResumeReportHyringProps) {
  const [radarHovered, setRadarHovered] = useState<RadarKey | null>(null);

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

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDE1E5] pb-4">
          <div className="flex items-center gap-4">
            <BackButton />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[#1A1D22]">Resume Screening</h1>
            </div>
          </div>
        </div>

        {/* Candidate Header Card */}
        <div className={cn(card, "relative overflow-hidden border-none bg-white p-0 shadow-[0_4px_20px_rgba(0,0,0,0.03)]")}>
          {/* Corner Crosses */}
          <div className="pointer-events-none absolute -left-1 -top-1 h-3 w-3 text-slate-300">
            <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
            <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
          </div>
          <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 text-slate-300">
            <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
            <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
          </div>
          <div className="pointer-events-none absolute -bottom-1 -left-1 h-3 w-3 text-slate-300">
            <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
            <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
          </div>
          <div className="pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 text-slate-300">
            <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
            <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
          </div>

          <div className="bg-gradient-to-br from-white via-white to-[#FFF4EC]/30 px-4 py-5 sm:px-6">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white shadow-lg sm:h-28 sm:w-28">
                  {model.displayAvatar ? <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-black tracking-tight text-[#1A1D22] sm:text-[2.5rem]">{model.fullName}</h2>
                  <div className="mt-3 space-y-1.5">
                    {model.locationLine && (
                      <p className="text-[12px] font-semibold text-[#3D434D]">{model.locationLine}</p>
                    )}
                    {model.experienceLine && (
                      <p className="text-[12px] font-semibold text-[#3D434D]">
                        Total experience: {model.experienceLine}
                      </p>
                    )}
                    <div className="pt-1">
                      <span className="inline-flex rounded-full bg-[#F1F2F4] px-3 py-1 text-[11px] font-bold text-[#3D434D]">
                        {model.roleLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {model.decisionStamp === "SHORTLISTED" || model.decisionStamp === "REJECTED" ? (
                <div className="flex shrink-0 items-center justify-center lg:mx-2">
                  <img
                    src={model.decisionStamp === "REJECTED" ? "/images/stamps/rejected.png" : "/images/stamps/shortlisted.png"}
                    alt={model.decisionStamp === "REJECTED" ? "Rejected" : "Shortlisted"}
                    className="h-[138px] w-[138px] -rotate-6 object-contain mix-blend-multiply"
                  />
                </div>
              ) : null}
              <div className="flex flex-col items-center gap-2 rounded-3xl bg-white px-5 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] ring-1 ring-black/5 sm:min-w-[260px]">
                <p className="self-start text-[10px] font-black uppercase tracking-[0.24em] text-[#6B7079]">Fit snapshot</p>
                <div className="flex flex-col items-center gap-4 sm:items-center">
                  <SemicircleGauge value={model.fitPercent} fitLabel={model.fitLabel} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Analysis Sections */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className={cn(card, "relative flex flex-col overflow-hidden border-none bg-white shadow-md lg:col-span-4")}>
            {/* Corner Crosses */}
            <div className="pointer-events-none absolute -left-1 -top-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -bottom-1 -left-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="flex items-center justify-between border-b border-[#E8EAED]/50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1A1D22]">Fit radar</p>
              </div>
              <span className="rounded-md bg-[#F1F2F4] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#1A1D22] shadow-sm">
                {model.fitLabel}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 px-3 pt-4">
              <ResumeRadarPlot values={model.fitRadar} notes={model.fitRadarNotes} onHoverChange={setRadarHovered} />
            </div>
            <div className="mx-3 mb-3 rounded-2xl border border-[#E8EAED]/70 bg-[#FAFBFC] px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1A1D22]">
                {radarHovered
                  ? `${RESUME_RADAR_LABELS.find((item) => item.key === radarHovered)?.label} is ${Math.round(model.fitRadar[radarHovered])}%`
                  : "Hover to see the analysis"}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[#3D434D]">
                {radarHovered
                  ? model.fitRadarNotes[radarHovered]
                  : "Move over any axis to see how each score was derived."}
              </p>
            </div>
          </div>

          <div className={cn(card, "relative flex max-h-[520px] flex-col overflow-hidden border-none bg-white shadow-md lg:col-span-8")}>
            {/* Corner Crosses */}
            <div className="pointer-events-none absolute -left-1 -top-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -bottom-1 -left-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-[#0D4D2E]">
                <Sparkles className="h-4 w-4" />
                <div>
                  <p className="text-sm font-semibold">AI Summary</p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1A1D22]">
                    Recruiter-friendly analysis from extracted resume data
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "mt-1 shrink-0 rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest shadow-sm",
                  model.fitPercent >= 80
                    ? "bg-[#E6F4EC] text-[#0D4D2E]"
                    : model.fitPercent >= 60
                      ? "bg-[#FFF4E8] text-[#B86A00]"
                      : "bg-red-50/50 text-red-700 border border-red-100/50"
                )}
              >
                {model.fitPercent >= 80 ? "Strong fit" : model.fitPercent >= 60 ? "Review" : "Needs review"}
              </span>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {model.aiSummaryPoints.map((item, j) => (
                <div
                  key={`${item.label}-${j}`}
                  className={cn(
                    "rounded-2xl border px-3 py-3 shadow-sm transition-colors",
                    item.label === "Red flags" ? "mt-1" : "",
                    item.label === "Red flags"
                      ? "border-red-200 bg-red-50/50"
                      : item.tone === "emerald"
                        ? "border-[#D5EAD8] bg-[#F6FBF7]"
                        : item.tone === "amber"
                          ? "border-[#F4E0BF] bg-[#FFF9F1]"
                          : "border-red-200 bg-red-50/50"
                  )}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em]",
                        item.label === "Red flags"
                          ? "bg-red-100 text-red-700"
                          : item.tone === "emerald"
                            ? "bg-[#0D4D2E] text-white"
                        : item.tone === "amber"
                          ? "bg-[#B86A00] text-white"
                        : "bg-red-100 text-red-700"
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                  <p className={cn("text-[13px] leading-6", item.label === "Red flags" ? "text-red-900" : "text-[#1A1D22]")}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={cn(card, "relative border-none bg-white p-0 shadow-md overflow-hidden")}>
            {/* Corner Crosses */}
            <div className="pointer-events-none absolute -left-1 -top-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -bottom-1 -left-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 text-slate-300">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800">Strengths</p>
            </div>
            <div className="space-y-2 p-3">
              {model.strengths.length > 0 ? (
                model.strengths.map((item, idx) => (
                  <div key={`strength-${idx}`} className="flex items-start gap-2 rounded-lg border border-emerald-100/80 bg-white px-3 py-2.5 transition-colors hover:bg-emerald-50/30">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#1A1D22]">{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#3D434D]">{item.body}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-3 py-2 text-[11px] leading-5 text-[#6B7079]">No strengths could be confidently derived from the available evidence yet.</p>
              )}
            </div>
          </div>

          <div className={cn(card, "relative border border-red-100 bg-white p-0 shadow-md overflow-hidden")}>
            {/* Corner Crosses */}
            <div className="pointer-events-none absolute -left-1 -top-1 h-3 w-3 text-red-200">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 text-red-200">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -bottom-1 -left-1 h-3 w-3 text-red-200">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 text-red-200">
              <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
              <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
            </div>
            <div className="border-b border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm font-semibold text-red-900">Weaknesses</p>
            </div>
            <div className="space-y-2 p-3">
              {model.weaknesses.length > 0 ? (
                model.weaknesses.map((item, idx) => (
                  <div key={`weakness-${idx}`} className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50/30 px-3 py-2.5 transition-colors hover:bg-red-50/60">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-red-900">{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-red-800">{item.body}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-3 py-2 text-[11px] leading-5 text-red-600">No clear weaknesses surfaced from the current evidence.</p>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Lists */}
        <div className="grid min-h-0 grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className={cn(card, "flex h-[420px] min-h-0 min-w-0 flex-col overflow-hidden border border-[#DDE1E5] bg-white p-0 shadow-[0_8px_24px_rgba(0,0,0,0.05)]")}>
              <div className="border-b border-[#D7DBE0] bg-[#FAFBFC] px-4 py-3">
                <p className="text-sm font-semibold text-[#1A1D22]">Career timeline</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {model.careerLines.map((line, k) => (
                  <div
                    key={k}
                    className="flex gap-2 rounded-xl border border-[#E2E6EB] bg-white p-3 transition-colors hover:bg-slate-50"
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
          {/* Skill Signals Section */}
          <div className="min-h-0 lg:col-span-5">
            <div className={cn(card, "flex h-[420px] min-h-0 flex-col overflow-hidden border border-[#DDE1E5] bg-white p-0 shadow-[0_8px_24px_rgba(0,0,0,0.05)]")}>
              {/* Corner Crosses */}
              <div className="pointer-events-none absolute -left-1 -top-1 h-3 w-3 text-slate-300">
                <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
                <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
              </div>
              <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 text-slate-300">
                <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
                <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
              </div>
              <div className="pointer-events-none absolute -bottom-1 -left-1 h-3 w-3 text-slate-300">
                <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
                <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
              </div>
              <div className="pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 text-slate-300">
                <div className="absolute left-1/2 top-0 h-full w-[0.5px] -translate-x-1/2 bg-current" />
                <div className="absolute left-0 top-1/2 h-[0.5px] w-full -translate-y-1/2 bg-current" />
              </div>
              <div className="flex items-center justify-between border-b border-[#D7DBE0] bg-[#FAFBFC] px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#1A1D22]">Skill signals</h3>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#1A1D22]">
                    Extracted from resume evidence and JD match data
                  </p>
                </div>
                {(() => {
                  const matchedCount = model.skillMatchRows.filter((r) => r.matched).length;
                  const missingCount = model.skillMatchRows.filter((r) => !r.matched).length;
                  return (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{matchedCount} matched</span>
                      {missingCount > 0 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{missingCount} missing</span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {(() => {
                  const matched = model.skillMatchRows.filter((r) => r.matched);
                  const missing = model.skillMatchRows.filter((r) => !r.matched);

                  const depthChip = (depth: "deep" | "working" | "listed" | "missing") => {
                    if (depth === "deep") return { label: "Deep", cls: "bg-emerald-100 text-emerald-800" };
                    if (depth === "working") return { label: "Working", cls: "bg-emerald-50 text-emerald-700" };
                    if (depth === "listed") return { label: "Listed", cls: "bg-slate-100 text-slate-700" };
                    return { label: "Missing", cls: "bg-amber-100 text-amber-800" };
                  };
                  const sourceLabel = (source: "work_history" | "project" | "listed" | "missing") => {
                    if (source === "work_history") return "Work history";
                    if (source === "project") return "Project";
                    if (source === "listed") return "Listed only";
                    return "Not found";
                  };

                  return (
                    <>
                      {matched.length > 0 && (
                        <div className="mb-3">
                          <p className="mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                            Matched ({matched.length})
                          </p>
                          <div className="space-y-1.5">
                            {matched.map((s, j) => {
                              const chip = depthChip(s.depth);
                              return (
                                <div
                                  key={`m-${s.name}-${j}`}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E6EB] bg-white px-3 py-2.5 transition-colors hover:bg-slate-50"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <p className="truncate text-[12px] font-semibold text-[#1A1D22]">{s.name}</p>
                                      {s.category && (
                                        <span className="shrink-0 rounded-full bg-[#EEF4FF] px-1.5 py-0.5 text-[9px] font-bold text-[#3559A8]">
                                          {s.category}
                                        </span>
                                      )}
                                      <span className="shrink-0 rounded-full bg-[#F1F3F5] px-1.5 py-0.5 text-[9px] font-bold text-[#5C6370]">
                                        {sourceLabel(s.source)}
                                      </span>
                                    </div>
                                    {s.evidenceNote && (
                                      <p className="mt-0.5 truncate text-[10px] font-medium text-[#6B7079]">{s.evidenceNote}</p>
                                    )}
                                  </div>
                                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold", chip.cls)}>
                                    {chip.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {missing.length > 0 && (
                        <div>
                          <p className="mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-700">
                            Missing ({missing.length})
                          </p>
                          <div className="space-y-1.5">
                            {missing.map((s, j) => (
                              <div
                                key={`x-${s.name}-${j}`}
                                className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[12px] font-semibold text-red-600">{s.name}</p>
                                  {s.evidenceNote && (
                                    <p className="mt-0.5 truncate text-[10px] font-medium text-red-900">{s.evidenceNote}</p>
                                  )}
                                </div>
                                <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700">
                                  Missing
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {matched.length === 0 && missing.length === 0 && (
                        <p className="px-1 py-2 text-[11px] text-[#6B7079]">No skill signals extracted yet.</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Decision Section */}
          <div className={cn(
            "rounded-3xl border p-[1.5px] shadow-2xl transition-all duration-500",
            model.decisionStamp === "SHORTLISTED"
              ? "border-emerald-200 bg-gradient-to-br from-emerald-100 via-white to-emerald-50 shadow-emerald-200/40"
            : model.decisionStamp === "REJECTED"
              ? "border-red-200 bg-gradient-to-br from-red-100 via-white to-red-50 shadow-red-200/40"
              : "border-[#DDE1E5] bg-gradient-to-r from-gray-100 via-white to-gray-50 shadow-gray-200/40"
        )}>
          <div className="flex flex-col gap-4 rounded-[calc(1.5rem-1.5px)] bg-white/60 backdrop-blur-sm px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className={cn(
                "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-sm",
                model.decisionStamp === "SHORTLISTED" ? "bg-emerald-600 text-white" :
                  model.decisionStamp === "REJECTED" ? "bg-red-100 text-red-700" : "bg-slate-800 text-white"
              )}>
                {model.decisionStamp === "SHORTLISTED" ? <Shield className="h-5 w-5" /> :
                  model.decisionStamp === "REJECTED" ? <Zap className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.2em]",
                  model.decisionStamp === "SHORTLISTED" ? "text-emerald-700" :
                    model.decisionStamp === "REJECTED" ? "text-red-800" : "text-[#5C6370]"
                )}>
                  Why {model.decisionStamp === "SHORTLISTED" ? "Shortlisted" : model.decisionStamp === "REJECTED" ? "Rejected" : "Borderline"}
                </p>
                <p className="mt-3 text-[13px] leading-7 text-[#1A1D22] whitespace-pre-wrap">
                  {(() => {
                    const parts = model.reviewStrip
                      .split(/(?<=\.)\s+/)
                      .map((sentence) => sentence.trim())
                      .filter(Boolean);

                    if (parts.length === 0) return model.reviewStrip;

                    return (
                      <>
                        <strong>{parts[0]} </strong>
                        {parts.slice(1).join(" ")}
                      </>
                    );
                  })()}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className={cn(
                "rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest shadow-sm",
                model.decisionStamp === "SHORTLISTED" ? "bg-emerald-600 text-white" :
                  model.decisionStamp === "REJECTED" ? "bg-red-100 text-red-700" : "bg-black text-white"
              )}>
                {model.decisionStamp}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
