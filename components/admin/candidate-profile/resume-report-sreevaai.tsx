"use client";
import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Link2,
  Loader2,
  Sparkles,
  Activity,
  CheckCircle,
  XCircle,
  ChevronDown,
} from "lucide-react";
import {
  SREEVAAI_REPORT_CARD,
  fitLabelFromPct,
} from "./interview-report-sreevaai";
const card = SREEVAAI_REPORT_CARD;
const bgPage = "bg-white relative overflow-hidden";
type RadarKey = "must_haves" | "exp_depth" | "domain_fit" | "skill_breadth" | "evidence_quality";
type RadarNotes = Record<RadarKey, string>;
const RESUME_RADAR_LABELS: { key: RadarKey; label: string }[] = [
  { key: "must_haves", label: "Must-Haves" },
  { key: "exp_depth", label: "Exp Depth" },
  { key: "domain_fit", label: "Domain Fit" },
  { key: "skill_breadth", label: "Skill Breadth" },
  { key: "evidence_quality", label: "Evidence" },
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
export type SkillRow = {
  name: string;
  bucket: "matched" | "not_matched" | "listed";
  evidenceNote?: string;
};
export type SreevaAIResumeViewModel = {
  backHref: string;
  processing: boolean;
  fullName: string;
  displayAvatar: string;
  roleLabel: string;
  locationLine: string;
  experienceLine: string;
  fitPercent: number;
  fitLabel: string;
  fitRadar: { must_haves: number; exp_depth: number; domain_fit: number; skill_breadth: number; evidence_quality: number };
  fitRadarNotes: RadarNotes;
  aiSummaryPoints: { label: string; body: string; tone: "emerald" | "amber" | "rose" }[];
  strengths: { label: string; body: string }[];
  weaknesses: { label: string; body: string }[];
  decisionStamp: "SHORTLISTED" | "REJECTED" | "BORDERLINE";
  skillRows: SkillRow[];
  careerLines: { label: string; body: string; time: string }[];
  resumeUrl: string | null;
  reviewStrip: string;
};
function readableSummaryText(text: string, maxLen = 180) {
  const clean = String(text || "")
    .replace(/^flag:\s*/i, "")
    .replace(/\[EV-[^\]]+\]/g, "")                          // strip [EV-xxx] citation tags
    .replace(/^(emerald|amber|rose|green|red|yellow):\s*/i, "") // strip tone-colour prefixes the LLM sometimes emits
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
function formatExperienceDuration(totalYears: number | null | undefined): string {
  if (totalYears == null || !Number.isFinite(totalYears) || totalYears < 0) return "";
  const years = Math.floor(totalYears);
  const months = Math.max(0, Math.round((totalYears - years) * 12));
  const yearPart = `${years} yr${years === 1 ? "" : "s"}`;
  const monthPart = `${months} mo${months === 1 ? "" : "s"}`;
  return `${yearPart} ${monthPart}`;
}
/**
 * Flattens existing candidate-page resume signals into a SreevaAI-mirror view model.
 */
export function buildSreevaAIResumeViewModel(i: {
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
  totalExtractedSkills: number;
  techSkillSample: string[];
  structuredResumeData?: unknown;
  structuredJdData?: unknown;
  experienceReadout?: string | null;
  // AI-direct fields from gpt-4o report
  aiRadar?: { must_haves?: number; essentials?: number; exp_depth?: number; experience?: number; domain_fit?: number; domain?: number; skill_breadth?: number; skills?: number; evidence_quality?: number; evidence?: number; confidence?: number } | null;
  aiRadarNotes?: { must_haves?: string; exp_depth?: string; domain_fit?: string; skill_breadth?: string; evidence_quality?: string } | null;
  aiSummaryCards?: { label: string; body: string; tone: string }[] | null;
  aiStrengths?: { label: string; body: string }[] | null;
  aiWeaknesses?: { label: string; body: string }[] | null;
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
}): SreevaAIResumeViewModel {
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
  const ar = i.aiRadar;
  const resumeStruct = asRecord(i.structuredResumeData);
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
    must_haves:
      structuredSkillNames.length > 0
        ? `Scored from ${evidenceBackedSkillNames.length} of ${structuredSkillNames.length} extracted JD must-haves confirmed with work-history or project evidence — not just listed in skills section.`
        : "JD must-haves could not be verified from extracted skill rows — falling back to JD skill bucket.",
    exp_depth:
      workHistoryRows.length > 0
        ? `Scored from ${workHistoryRows.length} role(s): checks years vs JD minimum, ownership level (owner/contributor/unclear), and whether work was building or assisting — not just counting years.`
        : "No structured work history found — falling back to raw experience score.",
    domain_fit:
      domainSignals.length > 0
        ? `Scored from ${domainSignals.length} domain signals: industry background, company-type context, and JD keyword overlap — measures ramp-time risk if hired.`
        : "Resume did not expose enough domain signals — falling back to JD domain keyword bucket.",
    skill_breadth:
      structuredSkillNames.length > 0
        ? `Scored from ${structuredSkillNames.length} technical/tool signals across work history + projects — ${evidenceBackedSkillNames.length} confirmed used (not just listed), measuring width not depth.`
        : "Resume did not expose enough structured skill data — falling back to JD skill bucket.",
    evidence_quality:
      structuredEvidenceItems.length > 0
        ? `Scored from ${structuredEvidenceItems.length} evidence items — ${evidenceSignalCount} carry measurable outcomes, ownership, or repeated use across roles. Measures how much of the resume can be trusted vs. taken at face value.`
        : "No structured evidence items found — falling back to work-history impact signals.",
  };
  const clamp = (v: unknown, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fb;
  };
  const fitRadar = {
    must_haves: essentialsFallback,
    exp_depth: impactFallback,
    domain_fit: domainFallback,
    skill_breadth: skillsExtractedFallback,
    evidence_quality: evidenceFallback,
  };
  if (ar) {
    if (fitRadar.must_haves === 0) fitRadar.must_haves = clamp(ar?.must_haves ?? ar?.essentials, fitRadar.must_haves);
    if (fitRadar.exp_depth === 0) fitRadar.exp_depth = clamp(ar?.exp_depth ?? ar?.experience, fitRadar.exp_depth);
    if (fitRadar.domain_fit === 0) fitRadar.domain_fit = clamp(ar?.domain_fit ?? ar?.domain, fitRadar.domain_fit);
    if (fitRadar.skill_breadth === 0) fitRadar.skill_breadth = clamp(ar?.skill_breadth ?? ar?.skills, fitRadar.skill_breadth);
    if (fitRadar.evidence_quality === 0) fitRadar.evidence_quality = clamp(ar?.evidence_quality ?? ar?.evidence ?? ar?.confidence, fitRadar.evidence_quality);
  }
  // Override fallback notes with LLM-generated sharp notes if present
  const an = i.aiRadarNotes;
  if (an) {
    if (an.must_haves) fitRadarNotes.must_haves = an.must_haves;
    if (an.exp_depth) fitRadarNotes.exp_depth = an.exp_depth;
    if (an.domain_fit) fitRadarNotes.domain_fit = an.domain_fit;
    if (an.skill_breadth) fitRadarNotes.skill_breadth = an.skill_breadth;
    if (an.evidence_quality) fitRadarNotes.evidence_quality = an.evidence_quality;
  }
  const validTones = new Set(["emerald", "amber", "rose"]);
  const aiSummaryPoints: SreevaAIResumeViewModel["aiSummaryPoints"] =
    i.aiSummaryCards && i.aiSummaryCards.length >= 1
      ? i.aiSummaryCards.map((c) => ({
          label: String(c.label || ""),
          body: readableSummaryText(String(c.body || ""), 300),
          tone: (validTones.has(c.tone) ? c.tone : "amber") as "emerald" | "amber" | "rose",
        }))
      : [];
  const decisionStamp: SreevaAIResumeViewModel["decisionStamp"] =
    i.normalizedStatus?.toLowerCase() === "shortlisted"
      ? "SHORTLISTED"
      : i.normalizedStatus?.toLowerCase() === "rejected"
        ? "REJECTED"
        : "BORDERLINE";
  // ── Skill Signals: 3-bucket build ─────────────────────────────────────────
  // Bucket 1 "matched"     → in JD criteria AND found in resume (scored "meets" by scorer)
  // Bucket 2 "not_matched" → in JD criteria AND missing from resume
  // Bucket 3 "listed"      → in resume but NOT in any JD criteria (shows candidate's full stack)
  const skillRows: SreevaAIResumeViewModel["skillRows"] = (() => {
    const normalizeKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const seen = new Set<string>(); // dedup by normalised name
    const rows: SkillRow[] = [];
    // ── MATCHED (JD criteria that the scorer confirmed) ───────────────────
    const matchedMust: string[] = Array.isArray(skillMatching.matched_must) ? skillMatching.matched_must : [];
    const matchedGood: string[] = Array.isArray(skillMatching.matched_good) ? skillMatching.matched_good : [];
    for (const name of [...matchedMust, ...matchedGood]) {
      const clean = String(name || "").trim();
      if (!clean) continue;
      const key = normalizeKey(clean);
      if (seen.has(key)) continue;
      seen.add(key);
      // Find evidence note from must_have_details if present
      const detail = Array.isArray(skillMatching.must_have_details)
        ? skillMatching.must_have_details.find((d: any) => normalizeKey(String(d?.name || d?.criterion || "")) === key)
        : null;
      const note = detail?.evidence || "";
      rows.push({ name: clean, bucket: "matched", evidenceNote: note || undefined });
    }
    // ── NOT MATCHED (JD criteria missing from resume) ─────────────────────
    const missingMust: string[] = Array.isArray(skillMatching.missing_must)
      ? skillMatching.missing_must
      : Array.isArray(i.missingMustSkills) ? i.missingMustSkills : [];
    for (const name of missingMust) {
      const clean = String(name || "").trim();
      if (!clean) continue;
      const key = normalizeKey(clean);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ name: clean, bucket: "not_matched" });
    }
    // ── LISTED IN RESUME (all resume skills not already in matched/not_matched) ──
    // Collect every skill from the structured resume parse
    const resumeSkillNames: string[] = uniqueNonEmpty([
      ...(Array.isArray(structuredSkills.technical) ? structuredSkills.technical : [])
        .map((s: any) => extractSkillName(s)),
      ...(Array.isArray(structuredSkills.tools) ? structuredSkills.tools : [])
        .map((s: any) => extractSkillName(s)),
      ...(Array.isArray(structuredSkills.domain_skills) ? structuredSkills.domain_skills : [])
        .map((s: any) => (typeof s === "string" ? s : extractSkillName(s))),
      ...structuredWorkHistory.flatMap((job: any) => extractStringList(job?.technologies_used)),
      ...structuredProjects.flatMap((proj: any) => extractStringList(proj?.technologies)),
    ]);
    for (const name of resumeSkillNames) {
      const clean = String(name || "").trim();
      if (!clean) continue;
      const key = normalizeKey(clean);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ name: clean, bucket: "listed" });
    }
    return rows;
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
  let careerLines: SreevaAIResumeViewModel["careerLines"] = history.slice(0, 8).map((r, idx) => {
    const startFmt = formatWorkDate(r.start_date || r.start_year);
    const endFmt = r.is_current ? "Present" : formatWorkDate(r.end_date || r.end_year);
    const when = [startFmt, endFmt].filter(Boolean).join(" – ");
    const label = `${r.role || "Role"} @ ${r.company || " "}`;
    // Primary body: LLM-written recruiter_summary from work_history_annotated
    // Fallback: responsibilities or impact signals from raw parse
    const stripEv = (s: string) => s.replace(/\[EV-[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
    const primaryBody = stripEv(
      r.recruiter_summary
      || (Array.isArray(r.responsibilities) && r.responsibilities.length > 0 ? r.responsibilities.slice(0, 2).join(" ") : "")
      || (Array.isArray(r.impact_signals) && r.impact_signals.length > 0 ? r.impact_signals.slice(0, 2).join(" ") : "")
    );
    // Compact metadata strip appended only when we have something meaningful to add
    const metaParts = [
      r.ownership_level && r.ownership_level !== "unclear" ? `${r.ownership_level} ownership` : "",
      r.impact_strength && r.impact_strength !== "low" ? `${r.impact_strength} impact` : "",
      Array.isArray(r.technologies_used) && r.technologies_used.length > 0
        ? r.technologies_used.slice(0, 3).join(", ")
        : "",
    ].filter(Boolean);
    const body = primaryBody
      ? metaParts.length > 0 ? `${primaryBody} [${metaParts.join(" · ")}]` : primaryBody
      : metaParts.length > 0 ? metaParts.join(" · ") : "No description available.";
    return { label, body, time: when || `Block ${idx + 1}` };
  });
  if (careerLines.length === 0) {
    careerLines.push({
      label: "No work history in structured data",
      body: "Once parsing completes, roles appear here in timeline form.",
      time: " ",
    });
  }
  const sanitizeItems = (raw: { label: string; body: string }[]) =>
    raw.map((item) => ({
      label: String(item.label || "").trim(),
      body: readableSummaryText(String(item.body || ""), 260),
    })).filter((item) => item.label && item.body);
  const strengths: SreevaAIResumeViewModel["strengths"] =
    i.aiStrengths && i.aiStrengths.length > 0 ? sanitizeItems(i.aiStrengths).slice(0, 4) : [];
  const weaknesses: SreevaAIResumeViewModel["weaknesses"] =
    i.aiWeaknesses && i.aiWeaknesses.length > 0 ? sanitizeItems(i.aiWeaknesses).slice(0, 4) : [];
  return {
    backHref: i.backHref || "/admin/candidates",
    processing: !i.hasResumeText && !i.hasAiReport,
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.drive?.role || c.drive?.title || "Requisition").replace(/[-—]/g, " ").trim() || "Role",
    locationLine: (c.location || "").replace(/[-—]/g, " ").trim() || "",
    experienceLine: candidateExperienceLine,
    fitPercent: Math.min(100, Math.max(0, Math.round(i.matchScore))),
    fitLabel: fitLabelFromPct(i.matchScore),
    fitRadar,
    fitRadarNotes,
    aiSummaryPoints,
    strengths,
    weaknesses,
    decisionStamp,
    skillRows,
    careerLines,
    resumeUrl: c.resumeUrl || null,
    reviewStrip: (() => {
      // Use LLM-generated decision_reason as the primary note — it's a recruiter narrative
      // covering skills, experience, strengths, and gaps from the full report.
      // Human layer summary is an internal technical scorecard string, not for display.
      const aiReason = i.decisionReason
        ? String(i.decisionReason)
            .replace(/\[EV-[^\]]+\]/g, "")   // strip citation tags
            .replace(/\s+/g, " ")
            .trim()
        : "";
      if (aiReason.length > 10) return aiReason;
      // Fallback: generate a minimal note from score data
      const verdictWord = decisionStamp === "SHORTLISTED" ? "Shortlisted" : decisionStamp === "REJECTED" ? "Rejected" : "Borderline";
      const matched = Array.isArray(i.skillMatching?.matched_must) ? i.skillMatching.matched_must : [];
      const missing = Array.isArray(i.skillMatching?.missing_must) ? i.skillMatching.missing_must : [];
      const matchStr = matched.length ? `Matched: ${matched.slice(0, 3).join(", ")}.` : "";
      const missStr = missing.length ? ` Missing: ${missing.slice(0, 2).join(", ")}.` : "";
      return `${verdictWord}.${matchStr ? " " + matchStr : ""}${missStr}`.trim();
    })(),
  };
}
type ResumeReportSreevaAIProps = {
  model: SreevaAIResumeViewModel;
  onBack?: () => void;
  showHeader?: boolean;
  headerActions?: ReactNode;
};
export function ResumeReportSreevaAI({
  model,
  onBack,
  showHeader = true,
  headerActions,
}: ResumeReportSreevaAIProps) {
  const [radarHovered, setRadarHovered] = useState<RadarKey | null>(null);
  const [openStrengths, setOpenStrengths] = useState(true);
  const [openWeaknesses, setOpenWeaknesses] = useState(true);
  const [expandedVerdict, setExpandedVerdict] = useState(false);
  const [openMatchedSkills, setOpenMatchedSkills] = useState(true);
  const [openMissingSkills, setOpenMissingSkills] = useState(true);
  const [openListedSkills, setOpenListedSkills] = useState(false);
  const [openCareer, setOpenCareer] = useState(true);
  const [openAiSummary, setOpenAiSummary] = useState(true);
  useEffect(() => {
    document.body.classList.add("reports-mode");
    return () => {
      document.body.classList.remove("reports-mode");
    };
  }, []);
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
  const matchedSkills = model.skillRows.filter((r) => r.bucket === "matched");
  const notMatchedSkills = model.skillRows.filter((r) => r.bucket === "not_matched");
  const listedSkills = model.skillRows.filter((r) => r.bucket === "listed");
  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-[#F3F4F6]">
      {/* ── Header (shrink-0, same pattern as interview report) ── */}
      {showHeader && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E5] px-4 py-2 bg-white z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <BackButton />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
            {model.resumeUrl ? (
              <a href={model.resumeUrl} target="_blank" rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#0D4D2E] shadow-sm hover:bg-[#F7FAF8]">
                <Link2 className="h-3.5 w-3.5" />
                View Resume
              </a>
            ) : (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#9AA1AA] shadow-sm">
                <Link2 className="h-3.5 w-3.5" />
                View Resume
              </span>
            )}
          </div>
        </div>
      )}
      {/* ── 3-column content area (flex-1, no page scroll) ── */}
      <div className="flex-1 overflow-hidden p-3 lg:p-4">
        <div className="mx-auto max-w-[1600px] h-full grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 items-stretch">
          {/* ── COL 1: Profile · Verdict · Radar ── */}
          <div className="col-span-1 flex flex-col min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#E4E7EB transparent" }}>
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible">
              {/* Candidate Profile */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-black/5 shadow-sm bg-slate-100">
                    {model.displayAvatar ? <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h2 className="text-[16px] font-bold tracking-tight text-[#111827] leading-tight truncate">{model.fullName}</h2>
                      {(model.decisionStamp === "SHORTLISTED" || model.decisionStamp === "REJECTED") && (
                        <span className={cn(
                          "shrink-0 rounded-full px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider border",
                          model.decisionStamp === "SHORTLISTED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
                        )}>
                          {model.decisionStamp}
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-[#6B7280] truncate mb-1">{model.roleLabel}</p>
                    {(model.locationLine || model.experienceLine) && (
                      <p className="text-[11px] text-[#9CA3AF]">
                        {[model.locationLine, model.experienceLine].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="border-t border-[#F0F1F3]" />
              {/* Shortlisting Verdict */}
              {(() => {
                const isHire = model.decisionStamp === "SHORTLISTED";
                const isNo = model.decisionStamp === "REJECTED";
                const bgCls = isHire ? "bg-[#F0FDF4] border-[#86EFAC]" : isNo ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200";
                const textCls = isHire ? "text-[#166534]" : isNo ? "text-rose-800" : "text-amber-800";
                const iconCls = isHire ? "text-[#22C55E]" : isNo ? "text-rose-500" : "text-amber-500";
                return (
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] font-bold text-[#111827]">Shortlisting Note</p>
                      <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[9.5px] font-bold text-[#4B5563]">Verdict</span>
                    </div>
                    <div className={cn("rounded-xl border px-4 py-3.5", bgCls)}>
                      <div className="flex items-center gap-2 mb-2">
                        {isHire ? <CheckCircle className={cn("h-[18px] w-[18px]", iconCls)} /> : isNo ? <XCircle className={cn("h-[18px] w-[18px]", iconCls)} /> : <Activity className={cn("h-[18px] w-[18px]", iconCls)} />}
                        <span className={cn("text-[14px] font-black uppercase tracking-wide", textCls)}>
                          {isHire ? "SHORTLISTED" : isNo ? "REJECTED" : "BORDERLINE"}
                        </span>
                      </div>
                      {model.reviewStrip && (
                        <div className="pt-1 relative">
                          <p className={cn("text-[12px] leading-relaxed whitespace-pre-line pr-7", textCls, !expandedVerdict && "line-clamp-2")}>
                            {model.reviewStrip}
                          </p>
                          <button type="button" onClick={() => setExpandedVerdict(!expandedVerdict)}
                            className={cn("absolute right-0 top-0.5 p-1 hover:bg-black/5 rounded transition-colors", textCls)}>
                            <ChevronDown className={cn("h-4 w-4 transition-transform", expandedVerdict ? "rotate-180" : "")} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="border-t border-[#F0F1F3]" />
              {/* AI Summary */}
              <div className="px-5 py-4">
                <button type="button" onClick={() => setOpenAiSummary(!openAiSummary)}
                  className="flex w-full items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-[#6366F1]" />
                    <p className="text-[13px] font-bold text-[#111827]">AI Summary</p>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-[#9CA3AF] transition-transform", openAiSummary ? "rotate-180" : "")} />
                </button>
                {openAiSummary && (
                  <div className="space-y-3">
                    {model.aiSummaryPoints.map((item, j) => (
                      <div key={j} className={cn(
                        "rounded-xl border p-3.5 shadow-sm",
                        item.label === "Red flags" ? "bg-rose-50 border-rose-100"
                        : item.tone === "emerald" ? "bg-[#F0FDF4] border-[#DCFCE7]"
                        : item.tone === "amber" ? "bg-amber-50 border-amber-100"
                        : "bg-slate-50 border-slate-100"
                      )}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em]",
                            item.label === "Red flags" ? "bg-rose-200 text-rose-800"
                              : item.tone === "emerald" ? "bg-[#0D4D2E] text-white"
                              : item.tone === "amber" ? "bg-[#B86A00] text-white"
                              : "bg-slate-200 text-slate-800"
                          )}>{item.label}</span>
                        </div>
                        <p className={cn("text-[12px] leading-relaxed", item.label === "Red flags" ? "text-rose-900" : "text-[#374151]")}>{item.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* ── COL 2: Evidence Highlights · Fit Radar ── */}
          <div className="col-span-1 flex flex-col min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#E4E7EB transparent" }}>
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible">
              {/* Evidence Highlights */}
              <div className="px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280] mb-3">Evidence Highlights</p>
                <div className="flex flex-col gap-1">
                  {/* Strengths */}
                  <div>
                    <button type="button" onClick={() => setOpenStrengths(!openStrengths)}
                      className="flex items-center justify-between w-full text-left py-1.5 hover:bg-emerald-50/60 rounded-lg -mx-1.5 px-1.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-emerald-800">Strengths</span>
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">{model.strengths.length}</span>
                      </div>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-emerald-600 transition-transform", openStrengths ? "rotate-180" : "")} />
                    </button>
                    {openStrengths && (
                      <div className="mt-1 mb-2 pl-2">
                        {model.strengths.length > 0 ? (
                          <ul className="space-y-2">
                            {model.strengths.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2.5">
                                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                <div>
                                  <p className="text-[11.5px] font-bold text-[#1A1D22] mb-0.5">{item.label}</p>
                                  <p className="text-[11.5px] leading-relaxed text-[#374151]">{item.body}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11.5px] text-[#9CA3AF]">No specific strengths identified.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="h-px bg-[#F3F4F6] my-1" />
                  {/* Weaknesses */}
                  <div>
                    <button type="button" onClick={() => setOpenWeaknesses(!openWeaknesses)}
                      className="flex items-center justify-between w-full text-left py-1.5 hover:bg-red-50/60 rounded-lg -mx-1.5 px-1.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-red-800">Weaknesses</span>
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">{model.weaknesses.length}</span>
                      </div>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-red-600 transition-transform", openWeaknesses ? "rotate-180" : "")} />
                    </button>
                    {openWeaknesses && (
                      <div className="mt-1 mb-1 pl-2">
                        {model.weaknesses.length > 0 ? (
                          <ul className="space-y-2">
                            {model.weaknesses.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2.5">
                                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                <div>
                                  <p className="text-[11.5px] font-bold text-[#1A1D22] mb-0.5">{item.label}</p>
                                  <p className="text-[11.5px] leading-relaxed text-[#374151]">{item.body}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11.5px] text-[#9CA3AF]">No clear weaknesses surfaced.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="border-t border-[#F0F1F3]" />
              {/* Fit Radar */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-bold text-[#111827]">Fit Radar</p>
                  <span className="rounded-md bg-[#F1F2F4] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#1A1D22] shadow-sm">{model.fitLabel}</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-full max-w-[260px] mx-auto">
                    <ResumeRadarPlot values={model.fitRadar} notes={model.fitRadarNotes} onHoverChange={setRadarHovered} />
                  </div>
                  <div className="w-full rounded-2xl border border-[#E8EAED]/70 bg-[#FAFBFC] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1A1D22]">
                      {radarHovered
                        ? `${RESUME_RADAR_LABELS.find((x) => x.key === radarHovered)?.label} · ${Math.round(model.fitRadar[radarHovered])}%`
                        : "Hover to see the analysis"}
                    </p>
                    {radarHovered && (
                      <p className="mt-1 text-[10.5px] leading-relaxed text-[#5C6370]">{model.fitRadarNotes[radarHovered]}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* ── COL 3: Career Timeline · Skill Signals ── */}
          <div className="col-span-1 flex flex-col min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#E4E7EB transparent" }}>
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible">
              {/* Career Timeline */}
              <div className="px-5 py-4">
                <button type="button" onClick={() => setOpenCareer(!openCareer)}
                  className="flex w-full items-center justify-between mb-3">
                  <p className="text-[13px] font-bold text-[#111827]">Career Timeline</p>
                  <ChevronDown className={cn("h-4 w-4 text-[#9CA3AF] transition-transform", openCareer ? "rotate-180" : "")} />
                </button>
                {openCareer && (
                  <div className="relative pl-3 border-l border-[#E5E7EB] space-y-5">
                    {model.careerLines.map((line, k) => (
                      <div key={k} className="relative">
                        <div className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-slate-300 ring-4 ring-white" />
                        <div className="pl-3">
                          <p className="text-[10px] font-bold text-[#6B7280] mb-0.5">{line.time}</p>
                          <p className="text-[13px] font-bold text-[#111827] mb-1.5">{line.label}</p>
                          <p className="text-[12px] leading-relaxed text-[#4B5563]">{line.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-[#F0F1F3]" />
              {/* Skill Signals */}
              <div className="px-5 py-4">
                <p className="text-[13px] font-bold text-[#111827] mb-3">Skill Signals</p>
                <div className="flex flex-col gap-1">
                  {/* Matched — in JD and found in resume */}
                  <div>
                    <button type="button" onClick={() => setOpenMatchedSkills(!openMatchedSkills)}
                      className="flex items-center justify-between w-full text-left py-1.5 hover:bg-emerald-50/60 rounded-lg -mx-1.5 px-1.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-emerald-800">Matched</span>
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">{matchedSkills.length}</span>
                      </div>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-emerald-600 transition-transform", openMatchedSkills ? "rotate-180" : "")} />
                    </button>
                    {openMatchedSkills && (
                      <div className="mt-1 mb-2 flex flex-col divide-y divide-[#F3F4F6]">
                        {matchedSkills.length === 0 && <p className="py-2 text-[11.5px] text-[#9CA3AF]">No JD skills matched in resume.</p>}
                        {matchedSkills.map((s, j) => (
                          <div key={j} className="flex items-center justify-between py-2 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 text-[10px] font-bold text-[#9CA3AF] w-4 text-right">{j + 1}</span>
                              <p className="text-[12px] font-semibold text-[#374151] truncate">{s.name}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700">JD Match</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {notMatchedSkills.length > 0 && <div className="h-px bg-[#F3F4F6] my-1" />}
                  {/* Not Matched — JD required but missing from resume */}
                  {notMatchedSkills.length > 0 && (
                    <div>
                      <button type="button" onClick={() => setOpenMissingSkills(!openMissingSkills)}
                        className="flex items-center justify-between w-full text-left py-1.5 hover:bg-red-50/60 rounded-lg -mx-1.5 px-1.5 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-red-800">Not Matched</span>
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">{notMatchedSkills.length}</span>
                        </div>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-red-600 transition-transform", openMissingSkills ? "rotate-180" : "")} />
                      </button>
                      {openMissingSkills && (
                        <div className="mt-1 mb-2 flex flex-col divide-y divide-[#F3F4F6]">
                          {notMatchedSkills.map((s, j) => (
                            <div key={j} className="flex items-center justify-between py-2 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 text-[10px] font-bold text-[#9CA3AF] w-4 text-right">{j + 1}</span>
                                <p className="text-[12px] font-semibold text-rose-700 truncate">{s.name}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9.5px] font-bold text-rose-700">Missing</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {listedSkills.length > 0 && <div className="h-px bg-[#F3F4F6] my-1" />}
                  {/* Listed in resume — candidate's full stack outside JD scope */}
                  {listedSkills.length > 0 && (
                    <div>
                      <button type="button" onClick={() => setOpenListedSkills(!openListedSkills)}
                        className="flex items-center justify-between w-full text-left py-1.5 hover:bg-slate-50/60 rounded-lg -mx-1.5 px-1.5 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-slate-700">Listed in Resume</span>
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{listedSkills.length}</span>
                        </div>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", openListedSkills ? "rotate-180" : "")} />
                      </button>
                      {openListedSkills && (
                        <div className="mt-1 mb-1 flex flex-col divide-y divide-[#F3F4F6]">
                          {listedSkills.map((s, j) => (
                            <div key={j} className="flex items-center justify-between py-2 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 text-[10px] font-bold text-[#9CA3AF] w-4 text-right">{j + 1}</span>
                                <p className="text-[12px] font-semibold text-[#6B7280] truncate">{s.name}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9.5px] font-bold text-slate-500">Listed</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
