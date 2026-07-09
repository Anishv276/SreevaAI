"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";
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
  User,
} from "lucide-react";
import {
  SREEVAAI_REPORT_CARD,
  fitLabelFromPct,
} from "./interview-report-sreevaai";

const card = SREEVAAI_REPORT_CARD;
const bgPage = "bg-white relative overflow-hidden";

type RadarKey = "role_fit" | "tech_depth" | "proven_impact" | "hire_risk" | "growth_velocity";
type RadarNotes = Record<RadarKey, string>;

// Research-backed 5-axis model -- internal keys are technical; labels shown to HR are plain English:
// role_fit       → "Job Match"    (does the resume cover what the JD requires?)
// tech_depth     → "Skill Depth"  (mastery vs. surface-level exposure)
// proven_impact  → "Track Record" (achievement density -- results vs. responsibilities)
// hire_risk      → "Stability"    (inverted risk: high = low red flags)
// growth_velocity→ "Career Growth" (trajectory speed -- accelerating or stalling?)
const RESUME_RADAR_LABELS: { key: RadarKey; label: string }[] = [
  { key: "role_fit",        label: "Job Match" },
  { key: "tech_depth",      label: "Skill Depth" },
  { key: "proven_impact",   label: "Track Record" },
  { key: "hire_risk",       label: "Stability" },
  { key: "growth_velocity", label: "Career Growth" },
];

function ResumeRadarPlot({
  values,
  notes,
  onHoverChange,
}: {
  values: Record<RadarKey, number>;
  notes: RadarNotes;
  onHoverChange?: (key: RadarKey | null) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<RadarKey | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const setHover = (key: RadarKey | null) => {
    setHoveredKey(key);
    onHoverChange?.(key);
  };

  const handleEnter = (key: RadarKey, e: React.MouseEvent) => {
    setHover(key);
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  const handleMove = (e: React.MouseEvent) => {
    if (!hoveredKey) return;
    setMousePos({ x: e.clientX, y: e.clientY });
  };
  const handleLeave = () => { setHover(null); setMousePos(null); };

  const n = RESUME_RADAR_LABELS.length;
  const PAD = 68; 
  const R = 70;
  const SIZE = R * 2 + PAD * 2;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  
  const shapePoints = RESUME_RADAR_LABELS.map((def, i) => {
    const t = (clamp(values[def.key]) / 100) * R;
    return `${cx + t * Math.cos(angle(i))},${cy + t * Math.sin(angle(i))}`;
  }).join(" ");
  
  const RING_LEVELS = [0.33, 0.66, 1.0];

  const hoveredDef = hoveredKey ? RESUME_RADAR_LABELS.find(d => d.key === hoveredKey) : null;
  const hoveredVal = hoveredKey ? Math.round(values[hoveredKey]) : null;
  const hoveredNote = hoveredKey ? notes[hoveredKey] : null;

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
        {/* Grid rings */}
        {RING_LEVELS.map((frac, ri) => {
          const r = frac * R;
          const pts = Array.from({ length: n }, (_, i) => `${cx + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`).join(" ");
          return <polygon key={ri} points={pts} fill="none" stroke="#D1D5DB" strokeWidth="1" />;
        })}
        {/* Spokes */}
        {RESUME_RADAR_LABELS.map((_, i) => (
          <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(angle(i))} y2={cy + R * Math.sin(angle(i))} stroke="#D1D5DB" strokeWidth="1" />
        ))}
        {/* Data shape */}
        <polygon points={shapePoints} fill="rgba(56,189,248,0.18)" stroke="#38BDF8" strokeWidth="2.5" strokeLinejoin="round" />
        
        {/* Data points (invisible hover targets) */}
        {RESUME_RADAR_LABELS.map((def, i) => {
          const t = (clamp(values[def.key]) / 100) * R;
          return (
            <circle
              key={`dot-${def.key}`}
              cx={cx + t * Math.cos(angle(i))} cy={cy + t * Math.sin(angle(i))} r="16"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={(e) => handleEnter(def.key, e)}
              onMouseLeave={handleLeave}
            />
          );
        })}
        
        {/* Axis labels */}
        {RESUME_RADAR_LABELS.map((def, i) => {
          const isRight = Math.cos(angle(i)) > 0.1;
          const isLeft = Math.cos(angle(i)) < -0.1;
          const anchor = isRight ? "start" : isLeft ? "end" : "middle";
          const lpX = cx + (R + (anchor === "middle" ? 24 : 16)) * Math.cos(angle(i));
          const lpY = cy + (R + (anchor === "middle" ? 24 : 16)) * Math.sin(angle(i));
          const isHov = hoveredKey === def.key;
          
          let line1 = def.label;
          let line2 = "";
          let multiLine = false;
          if (anchor === "middle" && def.label.includes(" ")) {
            const words = def.label.split(" ");
            const mid = Math.ceil(words.length / 2);
            line1 = words.slice(0, mid).join(" ");
            line2 = words.slice(mid).join(" ");
            multiLine = true;
          }
          
          return (
            <g
              key={def.key}
              className="cursor-pointer"
              onMouseEnter={(e) => handleEnter(def.key, e)}
              onMouseLeave={handleLeave}
            >
              <circle cx={lpX} cy={lpY} r="22" fill="transparent" />
              <text
                x={lpX}
                y={multiLine ? lpY - 5 : lpY}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize="11"
                fontWeight={isHov ? "700" : "500"}
                style={{ fill: isHov ? "#0EA5E9" : "#6B7280", fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}
              >
                {multiLine ? (
                  <>
                    <tspan x={lpX} dy="0">{line1}</tspan>
                    <tspan x={lpX} dy="12">{line2}</tspan>
                  </>
                ) : (
                  def.label
                )}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ── Hover tooltip ── */}
      {hoveredDef && hoveredVal !== null && mousePos && (
        <div 
          className="pointer-events-none fixed z-[99999] w-56 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 shadow-xl"
          style={tooltipStyle}
        >
          <div className="flex items-center justify-between mb-1 border-b border-[#F1F5F9] pb-1.5">
            <span className="text-[12px] font-semibold text-[#1A1D22]">{hoveredDef.label}</span>
            <span className="text-[12px] font-bold text-[#0EA5E9] tabular-nums">{hoveredVal}<span className="text-[9px] font-normal text-[#94A3B8]">/100</span></span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#6B7280] pt-1">
            {hoveredNote || "No details available."}
          </p>
        </div>
      )}
    </div>
  );
}
export type SkillRow = {
  name: string;
  bucket: "matched" | "not_matched";
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
  fitRadar: { role_fit: number; tech_depth: number; proven_impact: number; hire_risk: number; growth_velocity: number };
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
    job?: { role?: string; title?: string };
    experienceYears?: number | null;
  };
  backHref?: string;
  mounted: boolean;
  displayAvatar: string;
  hasAiReport: boolean;
  hasResumeText: boolean;
  matchScore: number;
  normalizedStatus: string;
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
  structuredResumeData?: unknown;
  aiRadar?: { role_fit?: number; must_haves?: number; essentials?: number; exp_depth?: number; experience?: number; domain_fit?: number; domain?: number; skill_breadth?: number; skills?: number; evidence_quality?: number; evidence?: number; confidence?: number; tech_depth?: number; proven_impact?: number; hire_risk?: number; growth_velocity?: number } | null;
  aiRadarNotes?: { role_fit?: string; tech_depth?: string; proven_impact?: string; hire_risk?: string; growth_velocity?: string; must_haves?: string; exp_depth?: string; domain_fit?: string; skill_breadth?: string; evidence_quality?: string } | null;
  aiSummaryCards?: { label: string; body: string; tone: string }[] | null;
  aiStrengths?: { label: string; body: string }[] | null;
  aiWeaknesses?: { label: string; body: string }[] | null;
  aiSkillRows?: { name: string; stars: number; evidence_note?: string }[] | null;
  missingMustSkills?: string[] | null;
  skillMatching?: unknown;
  decisionReason?: string | null;
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
  // -- Growth Velocity: career trajectory speed -----------------------------
  // Scores how fast the career is moving: title progression, scope expansion,
  // tenure stability, and whether the most recent roles show upward momentum.
  const growthVelocityScore = (() => {
    if (workHistoryRows.length === 0) return 50; // neutral when no data
    let score = 50;
    // Tenure stability: penalise multiple very-short stints (<8 months)
    const shortStints = workHistoryRows.filter((r: any) => {
      const months = Number(r?.duration_months ?? 0);
      return months > 0 && months < 8;
    }).length;
    score -= shortStints * 10;
    // Ownership escalation: more owner-level roles over time = growth
    const ownerCount = workHistoryRows.filter((r: any) => String(r?.ownership_level || "").toLowerCase() === "owner").length;
    score += Math.min(30, ownerCount * 12);
    // Impact density growth: check if recent roles have higher impact than early ones
    const recent = workHistoryRows.slice(0, 2) as any[];
    const early  = workHistoryRows.slice(-2) as any[];
    const impactScore = (rows: any[]) => rows.reduce((s: number, r: any) => s + (r?.impact_strength === "high" ? 3 : r?.impact_strength === "medium" ? 1 : 0), 0);
    const recentImpact = impactScore(recent);
    const earlyImpact  = impactScore(early);
    if (recentImpact > earlyImpact) score += 15;
    else if (recentImpact < earlyImpact) score -= 10; // declining trajectory
    // Promotion or scope expansion signals in role descriptions
    const scopeKeywords = /promot|senior|lead|principal|staff|architect|head|director|founded|launched/i;
    const scopeCount = workHistoryRows.filter((r: any) =>
      scopeKeywords.test(String(r?.role || "")) ||
      scopeKeywords.test(String(r?.recruiter_summary || ""))
    ).length;
    score += Math.min(20, scopeCount * 8);
    return Math.min(100, Math.max(0, Math.round(score)));
  })();

  const fitRadarNotes: RadarNotes = {
    role_fit:
      structuredSkillNames.length > 0
        ? `Covers ${evidenceBackedSkillNames.length} of ${structuredSkillNames.length} JD requirements confirmed via work-history or project context — not just listed in a skills section.`
        : "JD requirement coverage could not be confirmed from structured data — using JD skill bucket as fallback.",
    tech_depth:
      workHistoryRows.length > 0
        ? `Scored from ${workHistoryRows.length} role(s): checks ownership level (owner / contributor / unclear) and whether work involved building systems vs. assisting — measures mastery, not just years.`
        : "No structured work history found — falling back to raw experience score.",
    proven_impact:
      structuredEvidenceItems.length > 0
        ? `${evidenceSignalCount} of ${structuredEvidenceItems.length} evidence items carry measurable outcomes, ownership, or repeated cross-role use — measures how much of the experience is verifiable vs. self-described.`
        : workHistoryRows.length > 0
          ? `Derived from ${workHistoryRows.length} role(s): ${strongWorkHistoryRows.length} carry high impact or owner-level signals. Measures achievement-to-duty ratio.`
          : "No evidence items found — score reflects raw work-history impact signals.",
    hire_risk:
      workHistoryRows.length > 0
        ? `Risk factors checked: tenure instability, progression stagnation, domain misalignment, and recency of core skills. Lower score = more red flags. ${workHistoryRows.length} role(s) analysed.`
        : "Insufficient work history to compute hire risk — score is neutral.",
    growth_velocity:
      workHistoryRows.length > 0
        ? `Trajectory scored from ${workHistoryRows.length} role(s): title/scope escalation, ownership level across time, impact trend (recent vs. early roles), and tenure stability. Measures career momentum, not just experience.`
        : "No work history available — growth velocity score is neutral.",
  };
  const clamp = (v: unknown, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fb;
  };
  // -- Map old/new radar keys → 5 research-backed axes -----------------------
  // role_fit      ← essentials (JD requirement coverage)
  // tech_depth    ← impactFallback repurposed (ownership + depth signals)
  // proven_impact ← evidenceFallback (measurable outcome density)
  // hire_risk     ← inverted domain: starts high, penalised by risk signals
  // growth_velocity ← new computed signal above
  const hireRiskBase = Math.min(100, Math.max(0, Math.round(
    100 - (workHistoryRows.filter((r: any) => Number(r?.duration_months ?? 12) < 8).length * 10)
        - (domainFallback < 30 ? 15 : 0)
  )));
  const fitRadar = {
    role_fit:        essentialsFallback,
    tech_depth:      impactFallback,
    proven_impact:   evidenceFallback,
    hire_risk:       hireRiskBase,
    growth_velocity: growthVelocityScore,
  };
  if (ar) {
    // Accept new-key overrides from LLM output, fall back to legacy key aliases
    if (fitRadar.role_fit === 0)        fitRadar.role_fit        = clamp(ar?.role_fit   ?? ar?.must_haves ?? ar?.essentials, fitRadar.role_fit);
    if (fitRadar.tech_depth === 0)      fitRadar.tech_depth      = clamp(ar?.tech_depth ?? ar?.exp_depth  ?? ar?.experience, fitRadar.tech_depth);
    if (fitRadar.proven_impact === 0)   fitRadar.proven_impact   = clamp(ar?.proven_impact ?? ar?.evidence_quality ?? ar?.evidence ?? ar?.confidence, fitRadar.proven_impact);
    if (fitRadar.hire_risk === 0)       fitRadar.hire_risk       = clamp(ar?.hire_risk   ?? ar?.domain_fit ?? ar?.domain, fitRadar.hire_risk);
    if (fitRadar.growth_velocity === 0) fitRadar.growth_velocity = clamp(ar?.growth_velocity ?? ar?.skill_breadth ?? ar?.skills, fitRadar.growth_velocity);
  }
  // Override with sharp LLM-generated notes when available
  const an = i.aiRadarNotes;
  if (an) {
    if (an.role_fit        || an.must_haves)       fitRadarNotes.role_fit        = an.role_fit        ?? an.must_haves        ?? fitRadarNotes.role_fit;
    if (an.tech_depth      || an.exp_depth)        fitRadarNotes.tech_depth      = an.tech_depth      ?? an.exp_depth        ?? fitRadarNotes.tech_depth;
    if (an.proven_impact   || an.evidence_quality) fitRadarNotes.proven_impact   = an.proven_impact   ?? an.evidence_quality ?? fitRadarNotes.proven_impact;
    if (an.hire_risk       || an.domain_fit)       fitRadarNotes.hire_risk       = an.hire_risk       ?? an.domain_fit       ?? fitRadarNotes.hire_risk;
    if (an.growth_velocity || an.skill_breadth)    fitRadarNotes.growth_velocity = an.growth_velocity ?? an.skill_breadth    ?? fitRadarNotes.growth_velocity;
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
  // -- Skill Signals: 3-bucket build -----------------------------------------
  // Bucket 1 "matched"     → in JD criteria AND found in resume (scored "meets" by scorer)
  // Bucket 2 "not_matched" → in JD criteria AND missing from resume
  // Bucket 3 "listed"      → in resume but NOT in any JD criteria (shows candidate's full stack)
  const skillRows: SreevaAIResumeViewModel["skillRows"] = (() => {
    const normalizeKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const seen = new Set<string>(); // dedup by normalised name
    const rows: SkillRow[] = [];
    // -- MATCHED (JD criteria that the scorer confirmed) -------------------
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
    // -- NOT MATCHED (JD criteria missing from resume) ---------------------
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
  // Exactly 3 strengths and 3 weaknesses -- research-mandated cap for recruiter clarity
  const strengths: SreevaAIResumeViewModel["strengths"] =
    i.aiStrengths && i.aiStrengths.length > 0 ? sanitizeItems(i.aiStrengths).slice(0, 3) : [];
  const weaknesses: SreevaAIResumeViewModel["weaknesses"] =
    i.aiWeaknesses && i.aiWeaknesses.length > 0 ? sanitizeItems(i.aiWeaknesses).slice(0, 3) : [];
  return {
    backHref: i.backHref || "/admin/candidates",
    processing: !i.hasResumeText && !i.hasAiReport,
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.job?.role || c.job?.title || "Requisition").replace(/[-—]/g, " ").trim() || "Role",
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
      // Use LLM-generated decision_reason as the primary note -- it's a recruiter narrative
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
      const skillM = i.skillMatching as any;
      const matched = Array.isArray(skillM?.matched_must) ? skillM.matched_must : [];
      const missing = Array.isArray(skillM?.missing_must) ? skillM.missing_must : [];
      const matchStr = matched.length ? `Matched: ${matched.slice(0, 3).join(", ")}.` : "";
      const missStr = missing.length ? ` Missing: ${missing.slice(0, 2).join(", ")}.` : "";
      return `${verdictWord}.${matchStr ? " " + matchStr : ""}${missStr}`.trim();
    })(),
  };
}

function MatchedSkillRow({ index, skill }: { index: number; skill: SkillRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#F3F4F6] last:border-0">
      <div className="flex items-center justify-between py-2.5 gap-2 cursor-pointer select-none" onClick={() => setOpen((p) => !p)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-[11px] font-bold text-[#9CA3AF] w-4 text-right">{index}</span>
          <p className="text-[13px] font-semibold text-[#374151] truncate">{skill.name}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Matched</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-emerald-400 transition-transform", open && "rotate-180")} />
        </div>
      </div>
      {open && (
        <div className="pb-2.5 pl-6 pr-2">
          <p className="text-[11.5px] leading-relaxed text-[#6B7280] bg-emerald-50/60 rounded-lg px-3 py-2 border border-emerald-100">
            {skill.evidenceNote || "Matched based on resume content."}
          </p>
        </div>
      )}
    </div>
  );
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
  const [openCareer, setOpenCareer] = useState(true);
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
  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-[#F3F4F6]">
      {/* ── TOP HEADER (Back & Actions) ── */}
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

      {/* ── CANDIDATE PROFILE & SHORTLISTING HEADER ── */}
      <div className="shrink-0 bg-white border-b border-[#E4E7EB] shadow-sm px-4 lg:px-6 py-4 z-0 relative">
        <div className="mx-auto max-w-[1600px] flex flex-col md:flex-row items-start md:items-stretch justify-between gap-6">
          
          {/* Profile Left */}
          <div className="flex items-center gap-5 shrink-0">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-black/5 shadow-sm bg-gray-100">
              {model.displayAvatar ? <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-[#111827] leading-tight truncate">{model.fullName}</h2>
              <p className="text-[13px] font-medium text-[#6B7280] truncate">{model.roleLabel}</p>
              {(model.locationLine || model.experienceLine) && (
                <p className="text-[12px] font-medium text-[#9CA3AF]">
                  {[model.locationLine, model.experienceLine].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* Verdict Note & Score Right */}
          {(() => {
            const isHire = model.decisionStamp === "SHORTLISTED";
            const isNo = model.decisionStamp === "REJECTED";
            
            const badgeBg = isHire ? "bg-[#F0FDF4] border-[#86EFAC] text-[#166534]" : isNo ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800";
            const noteBg = isHire ? "bg-emerald-50/50 border-emerald-100" : isNo ? "bg-rose-50/50 border-rose-100" : "bg-amber-50/50 border-amber-100";
            const noteTitleText = isHire ? "text-emerald-700" : isNo ? "text-rose-700" : "text-amber-700";
            const noteIcon = isHire ? "text-emerald-500" : isNo ? "text-rose-500" : "text-amber-500";
            const noteBody = isHire ? "text-emerald-900" : isNo ? "text-rose-900" : "text-amber-900";
            const chevronCol = isHire ? "text-emerald-400 hover:text-emerald-600" : isNo ? "text-rose-400 hover:text-rose-600" : "text-amber-400 hover:text-amber-600";

            return (
              <>
                {/* Center Note (Like Hiring Note) */}
                <div className={"flex-1 rounded-xl border p-4 mx-2 flex flex-col justify-center relative " + noteBg}>
                  <button
                    type="button"
                    onClick={() => setExpandedVerdict(!expandedVerdict)}
                    className={"absolute right-3 top-3 transition-colors cursor-pointer outline-none " + chevronCol}
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", expandedVerdict && "rotate-180")} />
                  </button>
                  <div className="flex items-center gap-2 mb-1.5 shrink-0 pr-6">
                    <User className={"h-3.5 w-3.5 " + noteIcon} />
                    <span className={"text-[11px] font-bold uppercase tracking-widest " + noteTitleText}>Shortlisting Note</span>
                  </div>
                  <p className={cn("text-[12px] leading-snug font-medium " + noteBody, !expandedVerdict && "line-clamp-3")}>
                    {model.reviewStrip || "No specific shortlisting note provided."}
                  </p>
                </div>

                {/* Score & Verdict Badge (Right) */}
                <div className="flex flex-col items-end justify-center gap-2 shrink-0 min-w-[120px]">
                  <span className={"inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest " + badgeBg}>
                    {isHire ? <CheckCircle className="h-4 w-4" /> : isNo ? <XCircle className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                    {model.decisionStamp || "PENDING"}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[28px] font-black text-[#111827] tracking-tight">{model.fitPercent}</span>
                    <span className="text-[14px] font-bold text-[#9CA3AF]">/ 100</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] bg-[#F3F4F6] px-2 py-0.5 rounded">Match Score</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT AREA (ROWS) ── */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ scrollbarWidth: "thin" }}>
        <div className="mx-auto max-w-[1600px] flex flex-col gap-6 pb-12">
          
          {/* ── ROW 1: Fit Radar (Left) + AI Summary (Right) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
            
            {/* Fit Radar */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible flex flex-col h-full">
              <div className="px-6 py-5 flex-1">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[14px] font-bold text-[#111827]">Fit Radar</p>
                  <span className="rounded-md bg-[#F1F2F4] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#1A1D22] shadow-sm">{model.fitLabel}</span>
                </div>
                <div className="flex flex-col items-center justify-center h-[calc(100%-40px)]">
                  <div className="w-full max-w-[320px] mx-auto">
                    <ResumeRadarPlot values={model.fitRadar} notes={model.fitRadarNotes} onHoverChange={setRadarHovered} />
                  </div>
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="rounded-2xl bg-[#F8FAFC] flex flex-col h-full" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
              <div className="px-6 py-5 flex-1">
                <div className="flex w-full items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#7C3AED]" />
                    <p className="text-[14px] font-bold text-[#111827]">AI Summary</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <ul className="space-y-3">
                    {model.aiSummaryPoints.map((item, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <span className={"mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full " + (
                          item.tone === "emerald" ? "bg-emerald-500" :
                          item.tone === "amber" ? "bg-amber-500" :
                          item.tone === "rose" ? "bg-rose-500" : "bg-[#94A3B8]"
                        )} />
                        <p className="text-[13px] font-medium leading-relaxed text-[#374151]">
                          <span className="font-bold text-[#1A1D22] mr-1">{item.label}:</span>
                          {item.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

          </div>

          {/* ── ROW 2: Evidence Highlights | Career Timeline | Skill Signals ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start">
            
            {/* Strengths & Weaknesses */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible h-full">
              <div className="px-5 py-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280] mb-4">Evidence Highlights</p>
                <div className="flex flex-col gap-1">
                  {/* Strengths */}
                  <div>
                    <button type="button" onClick={() => setOpenStrengths(!openStrengths)}
                      className="flex items-center justify-between w-full text-left py-2 hover:bg-emerald-50/60 rounded-lg -mx-2 px-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-emerald-800">Strengths</span>
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{model.strengths.length}</span>
                      </div>
                      <ChevronDown className={"h-4 w-4 text-emerald-600 transition-transform " + (openStrengths ? "rotate-180" : "")} />
                    </button>
                    {openStrengths && (
                      <div className="mt-2 mb-3 pl-2">
                        {model.strengths.length > 0 ? (
                          <ul className="space-y-3">
                            {model.strengths.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                <div>
                                  <p className="text-[12px] leading-relaxed text-[#374151]">{item.body}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] text-[#9CA3AF]">No specific strengths identified.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="h-px bg-[#F3F4F6] my-2" />
                  {/* Weaknesses */}
                  <div>
                    <button type="button" onClick={() => setOpenWeaknesses(!openWeaknesses)}
                      className="flex items-center justify-between w-full text-left py-2 hover:bg-red-50/60 rounded-lg -mx-2 px-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-red-800">Weaknesses</span>
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{model.weaknesses.length}</span>
                      </div>
                      <ChevronDown className={"h-4 w-4 text-red-600 transition-transform " + (openWeaknesses ? "rotate-180" : "")} />
                    </button>
                    {openWeaknesses && (
                      <div className="mt-2 mb-2 pl-2">
                        {model.weaknesses.length > 0 ? (
                          <ul className="space-y-3">
                            {model.weaknesses.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                <div>
                                  <p className="text-[12px] leading-relaxed text-[#374151]">{item.body}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] text-[#9CA3AF]">No clear weaknesses surfaced.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Career Timeline */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible h-full">
              <div className="px-5 py-5">
                <button type="button" onClick={() => setOpenCareer(!openCareer)}
                  className="flex w-full items-center justify-between mb-5">
                  <p className="text-[13px] font-bold text-[#111827]">Career Timeline</p>
                  <ChevronDown className={"h-4 w-4 text-[#9CA3AF] transition-transform " + (openCareer ? "rotate-180" : "")} />
                </button>
                {openCareer && (
                  <div className="relative pl-3 border-l border-[#E5E7EB] space-y-6">
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
            </div>

            {/* Skill Signals */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible h-full">
              <div className="px-5 py-5">
                <p className="text-[13px] font-bold text-[#111827] mb-4">Skill Signals</p>
                <div className="flex flex-col gap-1">

                  {/* ── Matched ── */}
                  <div>
                    <button type="button" onClick={() => setOpenMatchedSkills(!openMatchedSkills)}
                      className="flex items-center justify-between w-full text-left py-2 hover:bg-emerald-50/60 rounded-lg -mx-2 px-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-emerald-800">Matched</span>
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{matchedSkills.length}</span>
                      </div>
                      <ChevronDown className={"h-4 w-4 text-emerald-600 transition-transform " + (openMatchedSkills ? "rotate-180" : "")} />
                    </button>
                    {openMatchedSkills && (
                      <div className="mt-1 mb-3 flex flex-col">
                        {matchedSkills.length === 0 && <p className="py-2 text-[12px] text-[#9CA3AF]">No JD skills matched in resume.</p>}
                        {matchedSkills.map((s, j) => (
                          <MatchedSkillRow key={j} index={j + 1} skill={s} />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-[#F3F4F6] my-2" />

                  {/* ── Not Matched — always shown ── */}
                  <div>
                    <button type="button" onClick={() => setOpenMissingSkills(!openMissingSkills)}
                      className="flex items-center justify-between w-full text-left py-2 hover:bg-red-50/60 rounded-lg -mx-2 px-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-red-800">Not Matched</span>
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{notMatchedSkills.length}</span>
                      </div>
                      <ChevronDown className={"h-4 w-4 text-red-600 transition-transform " + (openMissingSkills ? "rotate-180" : "")} />
                    </button>
                    {openMissingSkills && (
                      <div className="mt-1 mb-2 flex flex-col divide-y divide-[#F9FAFB]">
                        {notMatchedSkills.length === 0
                          ? <p className="py-2 text-[12px] text-[#9CA3AF]">No missing JD skills — all requirements matched.</p>
                          : notMatchedSkills.map((s, j) => (
                            <div key={j} className="flex items-center justify-between py-2.5 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 text-[11px] font-bold text-[#D1D5DB] w-4 text-right">{j + 1}</span>
                                <p className="text-[13px] font-semibold text-rose-700 truncate">{s.name}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">Missing</span>
                            </div>
                          ))
                        }
                      </div>
                    )}
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
