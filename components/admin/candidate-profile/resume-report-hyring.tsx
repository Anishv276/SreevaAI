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
  recruiterSignals: {
    scopeSignals: { label: string; body: string }[];
    riskFlags: { label: string; body: string }[];
    behavioralSignals: { label: string; body: string }[];
    reportConfidence: number;
  };
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
  careerLines: { label: string; body: string; time: string; integrityLevel?: "Low" | "Medium" | "High" }[];
  resumeUrl: string | null;
  hasStructuredResume: boolean;
  reviewStrip: string;
  feedbackStars: number;
  intelligenceStrip: {
    readiness: string;
    potential: string;
    potentialReasoning: string;
    seniorityLabel: string;
    jdSeniorityLabel: string;
    seniorityGap: number;
  };
  requirementsBreakdown: {
    criteria: string;
    required: string;
    candidateHas: string;
    result: "pass" | "partial" | "fail";
    note: string;
  }[];
  strengthsRows: { point: string; evidence: string }[];
  concernsRows: {
    point: string;
    whatTheRiskIs: string;
    impactLevel: "Dealbreaker" | "Moderate" | "Low" | "Watch" | "";
    whyItMatters: string;
    recommendedAction: string;
    suggestedInterviewQuestion: string;
    missingSkills: string[];
    impact: string;
  }[];
  integritySignals: { level: "Low" | "Medium" | "High"; label: string; summary: string }[];
  careerProgression: {
    pattern: string;
    roleFlow: string;
    companyTypes: string;
    tenureAvg: string;
    patternNote: string;
    companyNote: string;
    tenureNote: string;
  } | null;
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
      tone: "amber",
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
  readinessTimeline?: string | null;
  candidatePotential?: string | null;
  candidatePotentialReasoning?: string | null;
  decisionReason?: string | null;
  seniorityAlignment?: { candidate_level?: number; jd_level?: number; candidate_label?: string; jd_label?: string } | null;
  decisionBreakdown?: { criteria?: string; required?: string; candidate_has?: string; result?: string; note?: string }[] | null;
  strengthsData?: { point?: string; evidence?: string }[] | null;
  concernsData?: {
    point?: string;
    label?: string;
    title?: string;
    what_the_risk_is?: string;
    whatTheRiskIs?: string;
    risk?: string;
    description?: string;
    impact_level?: string;
    impactLevel?: string;
    why_it_matters?: string;
    whyItMatters?: string;
    recommended_action?: string;
    recommendedAction?: string;
    suggested_interview_question?: string;
    suggestedInterviewQuestion?: string;
    impact?: string;
    missing_skills?: string[];
  }[] | null;
  integritySignalsData?: { level?: string; label?: string; summary?: string; details?: string }[] | null;
  careerProgressionData?: {
    pattern?: string; role_flow?: string; company_types?: string;
    tenure_avg?: string; pattern_note?: string; company_note?: string; tenure_note?: string;
  } | null;
  behavioralSignals?: { label?: string; body?: string; summary?: string; evidence?: string }[] | null;
  resumeParseConfidence?: string | null;
  reportConfidence?: number | null;
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
    recruiter_summary?: string;
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
    const body = r.recruiter_summary
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

  // Integrity signals per-company — attach level to career lines
  const integrityByCompany: Record<string, "Low" | "Medium" | "High"> = {};
  for (const sig of (i.integritySignalsData || [])) {
    const lvl = String(sig.level || "").trim() as "Low" | "Medium" | "High";
    if (lvl === "Medium" || lvl === "High") {
      const details = String(sig.details || sig.summary || "").toLowerCase();
      for (const row of history) {
        const co = (row.company || "").toLowerCase();
        if (co && details.includes(co)) {
          integrityByCompany[co] = lvl;
        }
      }
    }
  }
  const careerLinesWithIntegrity = careerLines.map((line) => {
    const co = line.label.split("@")[1]?.trim().toLowerCase() || "";
    return integrityByCompany[co] ? { ...line, integrityLevel: integrityByCompany[co] } : line;
  });

  // Intelligence strip
  const seniorityAlignment = i.seniorityAlignment || null;
  const seniorityGap = seniorityAlignment
    ? (Number(seniorityAlignment.candidate_level ?? 0) - Number(seniorityAlignment.jd_level ?? 0))
    : 0;
  const intelligenceStrip = {
    readiness: String(i.readinessTimeline || "Not assessed").trim(),
    potential: String(i.candidatePotential || "").trim(),
    potentialReasoning: String(i.candidatePotentialReasoning || "").trim(),
    seniorityLabel: String(seniorityAlignment?.candidate_label || "").trim(),
    jdSeniorityLabel: String(seniorityAlignment?.jd_label || "").trim(),
    seniorityGap,
  };

  // Requirements breakdown
  const requirementsBreakdown = (i.decisionBreakdown || [])
    .filter((row) => row.criteria)
    .map((row) => {
      const result = String(row.result || "").toLowerCase();
      return {
        criteria: String(row.criteria || "").trim(),
        required: String(row.required || "Must-have").trim(),
        candidateHas: String(row.candidate_has || "—").trim(),
        result: (result === "pass" ? "pass" : result === "partial" ? "partial" : "fail") as "pass" | "partial" | "fail",
        note: String(row.note || "").trim(),
      };
    });

  // Strengths & concerns
  const strengthsRows = (i.strengthsData || [])
    .filter((r) => r.point)
    .map((r) => ({ point: String(r.point || "").trim(), evidence: String(r.evidence || "").trim() }));
  const concernsRows = (i.concernsData || [])
    .map((r) => ({
      point: String(r.point || r.label || r.title || "").trim(),
      whatTheRiskIs: String(r.what_the_risk_is || r.whatTheRiskIs || r.risk || r.description || "").trim(),
      impactLevel: (String(r.impact_level || r.impactLevel || "").trim() as "Dealbreaker" | "Moderate" | "Low" | "Watch" | ""),
      whyItMatters: String(r.why_it_matters || r.whyItMatters || "").trim(),
      recommendedAction: String(r.recommended_action || r.recommendedAction || "").trim(),
      suggestedInterviewQuestion: String(r.suggested_interview_question || r.suggestedInterviewQuestion || "").trim(),
      missingSkills: uniqueNonEmpty(Array.isArray(r.missing_skills) ? r.missing_skills : []),
      impact: String(r.impact || "").trim(),
    }))
    .filter((r) => r.point || r.whatTheRiskIs || r.impact || r.whyItMatters);

  // Integrity signals for standalone display
  const integritySignals = (i.integritySignalsData || [])
    .map((s) => ({
      level: (String(s.level || "Low").trim()) as "Low" | "Medium" | "High",
      label: String(s.label || "").trim(),
      summary: String(s.summary || s.details || "").trim(),
    }))
    .filter((s) => s.label);

  // Career progression
  const cpd = i.careerProgressionData;
  const careerProgression = cpd && cpd.pattern ? {
    pattern: String(cpd.pattern || "").trim(),
    roleFlow: String(cpd.role_flow || "").trim(),
    companyTypes: String(cpd.company_types || "").trim(),
    tenureAvg: String(cpd.tenure_avg || "").trim(),
    patternNote: String(cpd.pattern_note || "").trim(),
    companyNote: String(cpd.company_note || "").trim(),
    tenureNote: String(cpd.tenure_note || "").trim(),
  } : null;

  const shorten = (value: string, maxLen = 180) => readableSummaryText(value, maxLen);
  const scopeSignals = (() => {
    const rows = (Array.isArray(i.combinedWorkHistory) ? i.combinedWorkHistory : []) as Array<{
      company?: string;
      role?: string;
      company_type?: string;
      duration_months?: number;
      ownership_level?: string;
      impact_strength?: string;
      recruiter_summary?: string;
      technologies_used?: string[];
      overlap_note?: string | null;
    }>;
    return rows.slice(0, 4).map((row) => {
      const label = shorten(`${row.role || "Role"} @ ${row.company || "Company"}`, 44);
      const parts = [
        row.company_type ? row.company_type : "",
        row.ownership_level ? `${row.ownership_level} ownership` : "",
        row.impact_strength ? `${row.impact_strength} impact` : "",
        typeof row.duration_months === "number" && Number.isFinite(row.duration_months) ? `${row.duration_months} months` : "",
      ].filter(Boolean);
      const tech = Array.isArray(row.technologies_used) && row.technologies_used.length > 0
        ? `Tech: ${row.technologies_used.slice(0, 3).join(", ")}`
        : "";
      const summary = row.recruiter_summary ? shorten(row.recruiter_summary, 180) : "";
      const overlap = row.overlap_note ? shorten(String(row.overlap_note), 120) : "";
      const body = shorten([parts.join(" · "), tech, summary, overlap].filter(Boolean).join(" · "), 210);
      return { label, body };
    }).filter((row) => row.label && row.body);
  })();
  const riskFlags = (() => {
    const rows: { label: string; body: string }[] = [];
    for (const flag of (i.humanLayer?.risk_flags || []).slice(0, 3)) {
      const label = shorten(String(flag || "Risk"), 44);
      const body = shorten(String(flag || "Verify this in interview"), 210);
      if (label && body && !rows.some((item) => item.label === label)) rows.push({ label, body });
    }
    for (const row of concernsRows.slice(0, 3)) {
      const label = shorten(row.point || row.whatTheRiskIs || "Risk", 44);
      const details = [
        row.whatTheRiskIs ? `What the risk is: ${row.whatTheRiskIs}` : "",
        row.impactLevel ? `Impact level: ${row.impactLevel}` : "",
        row.whyItMatters ? `Why it matters: ${row.whyItMatters}` : "",
        row.recommendedAction ? `Recommended action: ${row.recommendedAction}` : "",
        row.suggestedInterviewQuestion ? `Suggested interview question: ${row.suggestedInterviewQuestion}` : "",
        row.missingSkills.length > 0 ? `Missing skills: ${row.missingSkills.join(", ")}` : "",
        row.impact ? `Impact: ${row.impact}` : "",
      ].filter(Boolean);
      const body = shorten(details.join("\n"), 320);
      if (label && body) rows.push({ label, body });
    }
    if (rows.length < 3) {
      for (const miss of (i.missingMustSkills || []).slice(0, 3)) {
        const label = shorten(`Verify ${miss}`, 44);
        const body = `The JD expects ${miss}. Confirm direct evidence before shortlisting.`;
        if (!rows.some((item) => item.label === label)) rows.push({ label, body });
      }
    }
    if (rows.length < 3) {
      for (const row of requirementsBreakdown.filter((r) => r.result !== "pass").slice(0, 3)) {
        const label = shorten(row.criteria || "Requirement gap", 44);
        const body = shorten(`${row.note || row.candidateHas || "Verify this gap"} — ask the candidate for exact evidence.`, 210);
        if (label && body && !rows.some((item) => item.label === label)) rows.push({ label, body });
      }
    }
    if (rows.length < 3) {
      for (const sig of integritySignals.slice(0, 2)) {
        const label = shorten(sig.label || "Integrity check", 44);
        const body = shorten(sig.summary || "Verify before shortlist", 210);
        if (label && body && !rows.some((item) => item.label === label)) rows.push({ label, body });
      }
    }
    if (rows.length < 3) {
      const jobHop = (careerProgression?.tenureNote || "").toLowerCase();
      if (jobHop && !rows.some((item) => /tenure|stability|job/i.test(item.label))) {
        rows.push({ label: "Career stability", body: shorten(careerProgression?.tenureNote || "Verify tenure and role overlap", 210) });
      }
    }
    return rows.slice(0, 3);
  })();
  const behavioralSignals = (() => {
    const raw = Array.isArray(i.behavioralSignals) ? i.behavioralSignals : [];
    return raw
      .map((item) => {
        const src = item as Record<string, unknown>;
        const label = shorten(String(src?.label || src?.title || src?.type || "Behavior"), 44);
        const body = shorten(String(src?.body || src?.summary || src?.evidence || ""), 210);
        return label && body ? { label, body } : null;
      })
      .filter(Boolean) as { label: string; body: string }[];
  })();
  const reportConfidence = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Number(
          i.reportConfidence ??
            i.humanLayer?.confidence ??
            (String(i.resumeParseConfidence || "").toLowerCase() === "high"
              ? 82
              : String(i.resumeParseConfidence || "").toLowerCase() === "medium"
                ? 72
                : 60),
        ) || 60,
      ),
    ),
  );

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
    recruiterSignals: {
      scopeSignals,
      riskFlags,
      behavioralSignals,
      reportConfidence,
    },
    rubricRows,
    skillMatchRows,
    careerLines: careerLinesWithIntegrity,
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
    intelligenceStrip,
    requirementsBreakdown,
    strengthsRows,
    concernsRows,
    integritySignals,
    careerProgression,
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
              <div className="flex flex-col items-center gap-2 rounded-3xl bg-white px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] ring-1 ring-black/5 sm:min-w-[260px]">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#6B7079]">Fit snapshot</p>
                <SemicircleGauge value={model.fitPercent} fitLabel={model.fitLabel} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Intelligence Strip */}
        {(model.intelligenceStrip.readiness !== "Not assessed" || model.intelligenceStrip.potential || model.intelligenceStrip.seniorityLabel) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Readiness */}
            {model.intelligenceStrip.readiness !== "Not assessed" && (
              <div className={cn(card, "flex items-start gap-3 border-none p-4 shadow-sm", model.intelligenceStrip.readiness.toLowerCase().startsWith("immediately") ? "bg-emerald-50" : model.intelligenceStrip.readiness.toLowerCase().includes("month") ? "bg-amber-50" : "bg-slate-50")}>
                <Activity className={cn("mt-0.5 h-5 w-5 shrink-0", model.intelligenceStrip.readiness.toLowerCase().startsWith("immediately") ? "text-emerald-600" : "text-amber-600")} />
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#5C6370]">Readiness</p>
                  <p className="mt-0.5 text-[12px] font-bold text-[#1A1D22] leading-snug">{model.intelligenceStrip.readiness}</p>
                </div>
              </div>
            )}
            {/* Potential */}
            {model.intelligenceStrip.potential && (
              <div className={cn(card, "flex items-start gap-3 border-none p-4 shadow-sm", model.intelligenceStrip.potential === "High" ? "bg-emerald-50" : model.intelligenceStrip.potential === "Low" ? "bg-rose-50" : "bg-amber-50")}>
                <Zap className={cn("mt-0.5 h-5 w-5 shrink-0", model.intelligenceStrip.potential === "High" ? "text-emerald-600" : model.intelligenceStrip.potential === "Low" ? "text-rose-600" : "text-amber-600")} />
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#5C6370]">Candidate potential</p>
                  <p className={cn("mt-0.5 text-[12px] font-black", model.intelligenceStrip.potential === "High" ? "text-emerald-700" : model.intelligenceStrip.potential === "Low" ? "text-rose-700" : "text-amber-700")}>{model.intelligenceStrip.potential}</p>
                  {model.intelligenceStrip.potentialReasoning && (
                    <p className="mt-0.5 text-[11px] leading-snug text-[#3D434D]">{model.intelligenceStrip.potentialReasoning}</p>
                  )}
                </div>
              </div>
            )}
            {/* Seniority Alignment */}
            {(model.intelligenceStrip.seniorityLabel || model.intelligenceStrip.jdSeniorityLabel) && (
              <div className={cn(card, "flex items-start gap-3 border-none p-4 shadow-sm", Math.abs(model.intelligenceStrip.seniorityGap) <= 1 ? "bg-emerald-50" : "bg-amber-50")}>
                <Shield className={cn("mt-0.5 h-5 w-5 shrink-0", Math.abs(model.intelligenceStrip.seniorityGap) <= 1 ? "text-emerald-600" : "text-amber-600")} />
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#5C6370]">Seniority alignment</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {model.intelligenceStrip.seniorityLabel && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#1A1D22] shadow-sm ring-1 ring-black/5">{model.intelligenceStrip.seniorityLabel}</span>
                    )}
                    {model.intelligenceStrip.jdSeniorityLabel && (
                      <>
                        <span className="text-[10px] text-[#8C9299]">vs</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#5C6370] shadow-sm ring-1 ring-black/5">{model.intelligenceStrip.jdSeniorityLabel} needed</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Analysis Sections */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className={cn(card, "flex flex-col border-none bg-white shadow-md lg:col-span-4")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED]/50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#1A1D22]">Fit radar</p>
              </div>
              <span className="rounded-md bg-[#F1F2F4] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#1A1D22] shadow-sm">
                {model.fitLabel}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 px-3 pt-4">
              <ResumeRadarPlot values={model.fitRadar} notes={model.fitRadarNotes} onHoverChange={setRadarHovered} />
            </div>
            <div className="mx-3 mb-3 rounded-2xl border border-[#E8EAED]/70 bg-[#FAFBFC] px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6B7079]">
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

          <div className={cn(card, "flex max-h-[520px] flex-col overflow-hidden border-none bg-white shadow-md lg:col-span-8")}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-[#0D4D2E]">
                <Sparkles className="h-4 w-4" />
                <div>
                  <p className="text-sm font-extrabold">AI Summary</p>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-[#6B7079]">
                    Recruiter-friendly analysis from extracted resume data
                  </p>
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
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {model.aiSummaryPoints.map((item, j) => (
                <div
                  key={`${item.label}-${j}`}
                  className={cn(
                    "rounded-2xl border px-3 py-3 shadow-sm transition-colors",
                    item.tone === "emerald"
                      ? "border-[#D5EAD8] bg-[#F6FBF7]"
                      : item.tone === "amber"
                        ? "border-[#F4E0BF] bg-[#FFF9F1]"
                        : "border-[#F6C9C9] bg-[#FFF7F7]"
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em]",
                        item.tone === "emerald"
                          ? "bg-[#0D4D2E] text-white"
                          : item.tone === "amber"
                            ? "bg-[#B86A00] text-white"
                            : "bg-[#B42318] text-white"
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="text-[10px] font-bold text-[#6B7079]">
                      {j === 0 ? "Direct match" : j === 1 ? "Experience" : j === 2 ? "Applied proof" : "Watchout"}
                    </span>
                  </div>
                  <p className="text-[13px] leading-6 text-[#1A1D22]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={cn(card, "border-none bg-white p-0 shadow-md overflow-hidden")}>
          <div className="flex items-center justify-between border-b border-[#E8EAED]/50 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-extrabold text-[#1A1D22]">Recruiter snapshot</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest shadow-sm",
                model.recruiterSignals.reportConfidence >= 80
                  ? "bg-[#E6F4EC] text-[#0D4D2E]"
                  : model.recruiterSignals.reportConfidence >= 60
                    ? "bg-[#FFF4E8] text-[#B86A00]"
                    : "bg-[#FDECEC] text-[#B42318]"
              )}
            >
              Report confidence {model.recruiterSignals.reportConfidence}%
            </span>
          </div>

          <div className="p-4">
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/80 bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6B7079]">Scope signals</p>
                <div className="mt-2 space-y-2">
                  {model.recruiterSignals.scopeSignals.length > 0 ? (
                    model.recruiterSignals.scopeSignals.map((item, idx) => (
                      <div key={`scope-${idx}`} className="rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] px-2.5 py-2">
                        <p className="text-[11px] font-bold text-[#1A1D22]">{item.label}</p>
                        <p className="mt-0.5 text-[11px] leading-5 text-[#3D434D]">{item.body}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] leading-5 text-[#6B7079]">No scope signals extracted yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6B7079]">Risk flags</p>
                <div className="mt-2 space-y-2">
                  {model.recruiterSignals.riskFlags.length > 0 ? (
                    model.recruiterSignals.riskFlags.map((item, idx) => (
                      <div key={`risk-${idx}`} className="rounded-xl border border-amber-100 bg-amber-50/60 px-2.5 py-2">
                        <p className="text-[11px] font-bold text-[#1A1D22]">{item.label}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-5 text-[#5C6370]">{item.body}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] leading-5 text-[#6B7079]">No major risk flags extracted yet.</p>
                  )}
                </div>
              </div>

            </div>

            {model.recruiterSignals.behavioralSignals.length > 0 && (
              <div className="mt-3 rounded-2xl border border-white/80 bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6B7079]">Behavioral / cultural signals</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {model.recruiterSignals.behavioralSignals.map((item, idx) => (
                    <div key={`behavior-${idx}`} className="rounded-xl border border-[#EEF0F3] bg-[#FAFBFC] px-2.5 py-2">
                      <p className="text-[11px] font-bold text-[#1A1D22]">{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-5 text-[#3D434D]">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Requirements Scorecard */}
        {model.requirementsBreakdown.length > 0 && (
          <div className={cn(card, "border-none bg-white p-0 shadow-md overflow-hidden")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED]/50 bg-gray-50 px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Requirements scorecard</p>
              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{model.requirementsBreakdown.filter(r => r.result === "pass").length} pass</span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{model.requirementsBreakdown.filter(r => r.result === "partial").length} partial</span>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">{model.requirementsBreakdown.filter(r => r.result === "fail").length} fail</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8EAED]/50 bg-[#FAFBFC]">
                    <th className="px-4 py-2 text-left text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6B7079]">Requirement</th>
                    <th className="px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6B7079]">Type</th>
                    <th className="px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6B7079]">Candidate has</th>
                    <th className="px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6B7079]">Note</th>
                    <th className="px-3 py-2 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#6B7079]">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {model.requirementsBreakdown.map((row, k) => (
                    <tr key={k} className={cn("border-b border-[#E8EAED]/30 transition-colors hover:bg-slate-50", k % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]")}>
                      <td className="px-4 py-2.5 font-semibold text-[#1A1D22]">{row.criteria}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase", row.required === "Must-have" ? "bg-[#1A1D22] text-white" : row.required === "Experience" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700")}>
                          {row.required}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#3D434D] max-w-[200px] truncate">{row.candidateHas}</td>
                      <td className="px-3 py-2.5 text-[#5C6370] max-w-[200px] truncate">{row.note || "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.15em]", row.result === "pass" ? "bg-emerald-100 text-emerald-800" : row.result === "partial" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800")}>
                          {row.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Strengths & Concerns */}
        {(model.strengthsRows.length > 0 || model.concernsRows.length > 0) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Strengths */}
            {model.strengthsRows.length > 0 && (
              <div className={cn(card, "border-none bg-white p-0 shadow-md overflow-hidden")}>
                <div className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
                  <p className="text-sm font-extrabold text-emerald-800">Strengths</p>
                </div>
                <div className="space-y-2 p-3">
                  {model.strengthsRows.map((s, k) => (
                    <div key={k} className="rounded-lg border border-emerald-100/80 bg-white px-3 py-2.5 hover:bg-emerald-50/30 transition-colors">
                      <p className="text-[12px] font-bold text-[#1A1D22]">{s.point}</p>
                      {s.evidence && <p className="mt-0.5 text-[11px] leading-relaxed text-[#3D434D]">{s.evidence}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Concerns */}
            {model.concernsRows.length > 0 && (
              <div className={cn(card, "border-none bg-white p-0 shadow-md overflow-hidden")}>
                <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
                  <p className="text-sm font-extrabold text-amber-800">Concerns</p>
                </div>
                <div className="space-y-2 p-3">
                  {model.concernsRows.map((c, k) => (
                    <div key={k} className="rounded-lg border border-amber-100/80 bg-white px-3 py-2.5 hover:bg-amber-50/30 transition-colors">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[12px] font-bold text-[#1A1D22]">{c.point || c.whatTheRiskIs}</p>
                        {c.impactLevel && (
                          <span className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em]",
                            c.impactLevel === "Dealbreaker"
                              ? "bg-rose-100 text-rose-800"
                              : c.impactLevel === "Moderate"
                                ? "bg-amber-100 text-amber-800"
                                : c.impactLevel === "Low"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-slate-100 text-slate-700"
                          )}>
                            {c.impactLevel}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-[#5C6370]">
                        {c.whatTheRiskIs && <p><span className="font-semibold text-[#1A1D22]">What the risk is:</span> {c.whatTheRiskIs}</p>}
                        {c.whyItMatters && <p><span className="font-semibold text-[#1A1D22]">Why it matters:</span> {c.whyItMatters}</p>}
                        {c.recommendedAction && <p><span className="font-semibold text-[#1A1D22]">Recommended action:</span> {c.recommendedAction}</p>}
                        {c.suggestedInterviewQuestion && <p><span className="font-semibold text-[#1A1D22]">Suggested question:</span> {c.suggestedInterviewQuestion}</p>}
                        {c.missingSkills.length > 0 && <p><span className="font-semibold text-[#1A1D22]">Missing skills:</span> {c.missingSkills.join(", ")}</p>}
                        {c.impact && <p><span className="font-semibold text-[#1A1D22]">Impact:</span> {c.impact}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
                        {line.integrityLevel && line.integrityLevel !== "Low" && (
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase", line.integrityLevel === "High" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>
                            {line.integrityLevel} integrity flag
                          </span>
                        )}
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
              <div className="flex items-center justify-between border-b border-[#E8EAED]/50 px-4 py-3 bg-gray-50">
                <div>
                  <h3 className="text-sm font-extrabold text-[#1A1D22]">Skill signals</h3>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-[#6B7079]">
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
              <div className="flex-1 overflow-y-auto p-3">
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
                                  className="flex items-center justify-between gap-3 rounded-lg border border-[#EEF0F3]/70 bg-white px-3 py-2 transition-colors hover:bg-slate-50"
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
                                className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2"
                              >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[12px] font-semibold text-[#1A1D22]">{s.name}</p>
                                    {s.evidenceNote && (
                                      <p className="mt-0.5 truncate text-[10px] font-medium text-[#6B7079]">{s.evidenceNote}</p>
                                    )}
                                  </div>
                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
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

        {/* Career Progression */}
        {model.careerProgression && (
          <div className={cn(card, "border-none bg-white p-0 shadow-md overflow-hidden")}>
            <div className="flex items-center gap-3 border-b border-[#E8EAED]/50 bg-gray-50 px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Career progression</p>
              <span className="rounded-full bg-[#1A1D22] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] text-white">
                {model.careerProgression.pattern}
              </span>
              {model.careerProgression.tenureAvg && (
                <span className="rounded-full bg-[#F1F2F4] px-2.5 py-0.5 text-[9px] font-bold text-[#5C6370]">
                  {model.careerProgression.tenureAvg}
                </span>
              )}
              {model.careerProgression.companyTypes && (
                <span className="hidden rounded-full bg-[#F1F2F4] px-2.5 py-0.5 text-[9px] font-bold text-[#5C6370] sm:inline">
                  {model.careerProgression.companyTypes}
                </span>
              )}
            </div>
            <div className="px-4 py-3 space-y-3">
              {model.careerProgression.roleFlow && (
                <p className="text-[13px] font-semibold text-[#1A1D22] leading-relaxed">{model.careerProgression.roleFlow}</p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {model.careerProgression.patternNote && (
                  <div className="rounded-xl border border-[#E8EAED]/60 bg-[#FAFBFC] px-3 py-2.5">
                    <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#6B7079]">Pattern</p>
                    <p className="text-[11px] leading-snug text-[#1A1D22]">{model.careerProgression.patternNote}</p>
                  </div>
                )}
                {model.careerProgression.companyNote && (
                  <div className="rounded-xl border border-[#E8EAED]/60 bg-[#FAFBFC] px-3 py-2.5">
                    <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#6B7079]">Company track</p>
                    <p className="text-[11px] leading-snug text-[#1A1D22]">{model.careerProgression.companyNote}</p>
                  </div>
                )}
                {model.careerProgression.tenureNote && (
                  <div className="rounded-xl border border-[#E8EAED]/60 bg-[#FAFBFC] px-3 py-2.5">
                    <p className="mb-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#6B7079]">Stability</p>
                    <p className="text-[11px] leading-snug text-[#1A1D22]">{model.careerProgression.tenureNote}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
