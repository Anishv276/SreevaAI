"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";
import {
  HYRING_REPORT_CARD,
  HYRING_REPORT_PAGE_BG,
  IntelMetricCard,
  SemicircleGauge,
  TechnicalScoreCard,
  CommunicationScoreCard,
  fitLabelFromPct,
} from "./interview-report-hyring";
import type { HyringInterviewViewModel, IntelIconKey, IntelSignalRow } from "./interview-report-hyring";

const card = HYRING_REPORT_CARD;
const bgPage = HYRING_REPORT_PAGE_BG;

type ResIntel = "rubric" | "document" | "flags";

function ResTabStrip({ value, onChange }: { value: ResIntel; onChange: (v: ResIntel) => void }) {
  const base = "shrink-0 rounded-lg px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-widest transition-colors";
  const items: [ResIntel, string][] = [
    ["rubric", "Rubric coverage"],
    ["document", "Document check"],
    ["flags", "Flags"],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([k, l]) => (
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
  comm5: { pronunciation: number; grammar: number; vocabulary: number; minimalFiller: number; fluency: number; tag: string };
  aiBullets: string[];
  topStrengths: string[];
  topRisks: string[];
  rubricRows: IntelSignalRow[];
  documentRows: IntelSignalRow[];
  flagRows: IntelSignalRow[];
  skillMatchRows: { name: string; questions: number; stars: number }[];
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

  const mustPct = Math.min(100, Math.round((skS / skM) * 100));
  const expPct = Math.min(100, Math.round((exS / exM) * 100));
  const supA = gS + dS;
  const supB = gM + dM;
  const supPct = supB > 0 ? Math.min(100, Math.round((supA / supB) * 100)) : 0;

  const nReq = Math.max(3, skM > 0 ? Math.min(20, Math.round(skM / 3)) : 5);
  const nRoles = Array.isArray(i.combinedWorkHistory) ? i.combinedWorkHistory.length : 0;
  const nEdu = Array.isArray(i.educationList) ? i.educationList.length : 0;

  const comm5 = {
    pronunciation: mustPct,
    grammar: expPct,
    vocabulary: supPct,
    minimalFiller: Math.min(100, 55 + (i.matchScore >= 60 ? 20 : 0)),
    fluency: Math.min(100, 50 + Math.round((i.totalExtractedSkills / 8) * 5)),
    tag: tagFromPct(i.matchScore * 0.6 + mustPct * 0.2 + expPct * 0.2) === "GOOD" ? "STRONG" : "AVERAGE",
  };

  const topStrengths = (() => {
    const s = [...(i.strengthLines || [])].slice(0, 3);
    while (s.length < 3) {
      const p = "Cross-check the rubric cards against your hiring bar for this requisition";
      if (!s.includes(p)) s.push(p);
      else break;
    }
    return s.slice(0, 3);
  })();

  const topRisks = (() => {
    const r = [...(i.weaknessLines || []), ...i.redFlagLines.map((x) => `Flag: ${x}`)].slice(0, 3);
    if (r.length === 0) {
      r.push("No major automated blockers; still run normal comp and reference checks");
    }
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

  const hasResume = Boolean(c.resumeUrl || i.hasResumeText);
  const documentRows: IntelSignalRow[] = [
    {
      id: "d1",
      label: "Resume file on file",
      badge: hasResume ? "Yes" : "No",
      tone: hasResume ? "emerald" : "rose",
      icon: "shield" as IntelIconKey,
    },
    {
      id: "d2",
      label: "AI report ready",
      badge: i.hasAiReport ? "Yes" : "Pending",
      tone: i.hasAiReport ? "emerald" : "amber",
      icon: "search" as IntelIconKey,
    },
    {
      id: "d3",
      label: "Work history rows",
      badge: String(nRoles),
      tone: nRoles > 0 ? "emerald" : "slate",
      icon: "git-branch" as IntelIconKey,
    },
    {
      id: "d4",
      label: "Education rows",
      badge: String(nEdu),
      tone: nEdu > 0 ? "emerald" : "slate",
      icon: "user" as IntelIconKey,
    },
  ];

  const flagRows: IntelSignalRow[] =
    i.redFlagLines.length > 0
      ? i.redFlagLines.slice(0, 6).map((line, idx) => ({
          id: `f${idx}`,
          label: line.length > 48 ? line.slice(0, 45) + "…" : line,
          badge: "Review",
          tone: "rose" as const,
          icon: "alert" as IntelIconKey,
        }))
      : [
          {
            id: "f0",
            label: "No automated red flags in the current parse",
            badge: "Clear",
            tone: "emerald",
            icon: "shield" as IntelIconKey,
          },
        ];

  const skillMatchRows: HyringResumeViewModel["skillMatchRows"] = (() => {
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
    const body = String(
      r.recruiter_summary || "No summary for this block yet."
    );
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
    backHref: "/admin/candidates",
    processing: !i.hasResumeText && !i.hasAiReport,
    fullName: c.fullName || "Candidate",
    displayAvatar: i.displayAvatar,
    roleLabel: String(c.drive?.role || c.drive?.title || "Requisition").trim() || "Role",
    cityBadge: String(c.location || "Location")
      .split(",")[0]
      .trim() || "—",
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
    comm5,
    aiBullets: toBullets(i.summary),
    topStrengths,
    topRisks,
    rubricRows,
    documentRows,
    flagRows,
    skillMatchRows,
    careerLines,
    resumeUrl: c.resumeUrl || null,
    hasStructuredResume: nRoles > 0 || i.totalExtractedSkills > 0,
    reviewStrip: i.primaryGapText || "No single gap called out; read strengths and risks in context.",
    feedbackStars: i.matchScore >= 80 ? 5 : i.matchScore >= 60 ? 4 : i.matchScore >= 40 ? 3 : 2,
  };
}

type ResumeReportHyringProps = { model: HyringResumeViewModel };

export function ResumeReportHyring({ model }: ResumeReportHyringProps) {
  const [intel, setIntel] = useState<ResIntel>("rubric");
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E5] pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={model.backHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-medium text-[#0D4D2E] shadow-sm hover:bg-[#F7FAF8]"
            >
              <ArrowLeft className="h-4 w-4" />
              Resume report
            </Link>
          </div>
        </div>

        <div className={cn(card, "p-4 sm:p-6")}>
          <div className="flex flex-col justify-between gap-6 lg:flex-row">
            <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-white shadow">
                {model.displayAvatar ? <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-extrabold tracking-tight text-[#1A1D22] sm:text-3xl">{model.fullName}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-md bg-[#F0F1F3] px-2.5 py-0.5 text-[11px] font-semibold text-[#3D434D]">{model.roleLabel}</span>
                  <span className="rounded-md bg-[#F0F1F3] px-2.5 py-0.5 text-[11px] font-semibold text-[#3D434D]">
                    {model.cityBadge}
                  </span>
                </div>
                <p className="mt-3 text-[12px] text-[#5C6370]">
                  <span className="font-semibold text-[#1A1D22]">Applied</span> {model.appliedOn} ·
                  <span className="ml-1 font-semibold">Pipeline</span> {model.stats.pipeline} ·
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
          {(
            [
              ["Total work experience (AI)", model.stats.workExp],
              ["Roles in history", model.stats.rolesCount],
              ["Education", model.stats.education],
              ["Skills extracted", model.stats.skillsExtracted],
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
              <p className="text-sm font-extrabold text-[#1A1D22]">Must-have coverage</p>
              <span className="rounded-md bg-[#E6F4EC] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#0D4D2E]">
                {model.mustHave.tag}
              </span>
            </div>
            <TechnicalScoreCard
              pct={model.mustHave.percent}
              questions={model.mustHave.nRequirements}
              tag={model.mustHave.tag}
            />
          </div>
          <div className={cn(card, "flex flex-col")}>
            <div className="flex items-center justify-between border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold text-[#1A1D22]">Rubric shape</p>
              <span className="rounded-md bg-[#E0EDFF] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#0B5FFF]">
                {model.comm5.tag}
              </span>
            </div>
            <CommunicationScoreCard
              comm={
                {
                  pronunciation: model.comm5.pronunciation,
                  grammar: model.comm5.grammar,
                  vocabulary: model.comm5.vocabulary,
                  minimalFiller: model.comm5.minimalFiller,
                  fluency: model.comm5.fluency,
                  tag: model.comm5.tag,
                } satisfies HyringInterviewViewModel["comm"]
              }
            />
          </div>
          <div className={cn(card, "p-4")}>
            <div className="mb-3 flex items-center gap-2 text-[#0D4D2E]">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-extrabold">AI summary</p>
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
          <p className="mb-4 text-[10px] font-extrabold uppercase tracking-widest text-[#5C6370]">Hiring readout</p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:gap-10">
            <div>
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-[#0D4D2E]">Top strengths</p>
              <ol className="m-0 list-none space-y-2.5 p-0" role="list" aria-label="Top strengths">
                {model.topStrengths.map((t, j) => (
                  <li key={j} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-[10px] font-extrabold text-[#0D4D2E]">
                      {j + 1}
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-[#9A3412]">Top risks</p>
              <ol className="m-0 list-none space-y-2.5 p-0" role="list" aria-label="Top risks">
                {model.topRisks.map((t, j) => (
                  <li key={j} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-extrabold text-amber-900">
                      {j + 1}
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
              <h3 className="text-base font-bold tracking-tight text-neutral-900">Resume intelligence</h3>
              <ResTabStrip value={intel} onChange={setIntel} />
              <div>
                {intel === "rubric" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {model.rubricRows.map((row) => (
                      <IntelMetricCard key={row.id} row={row} />
                    ))}
                  </div>
                )}
                {intel === "document" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {model.documentRows.map((row) => (
                      <IntelMetricCard key={row.id} row={row} />
                    ))}
                  </div>
                )}
                {intel === "flags" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {model.flagRows.map((row) => (
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
                <h3 className="text-sm font-extrabold text-[#1A1D22]">Skill signals</h3>
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
                {model.skillMatchRows.map((s) => (
                  <div
                    key={s.name + s.questions}
                    className="flex items-center justify-between border-b border-[#EEF0F3] py-2 last:border-0"
                  >
                    <p className="text-[12px] font-semibold text-[#1A1D22]">
                      {s.name} <span className="text-[#6B7079]">(weight {s.questions})</span>
                    </p>
                    <div className="flex items-center gap-0.5">
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

        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={cn(card, "flex min-h-0 min-w-0 flex-col p-0")}>
            <div className="border-b border-[#E8EAED] px-4 py-3">
              <p className="text-sm font-extrabold">Career timeline</p>
            </div>
            <div className="max-h-[420px] space-y-3 overflow-y-auto p-3">
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
          <div className="min-h-0 min-w-0">
            <div className={cn(card, "overflow-hidden p-0")}>
              <div className="border-b border-[#E8EAED] bg-[#F7F8FA] px-4 py-8">
                {model.resumeUrl ? (
                  <a
                    href={model.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center"
                  >
                    <FileText className="h-10 w-10 text-[#0B5FFF]" />
                    <p className="text-sm font-extrabold text-[#1A1D22]">Open resume source file</p>
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0D4D2E]">
                      View in new tab
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </a>
                ) : (
                  <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-center text-[#6B7079]">
                    <FileText className="h-8 w-8 opacity-50" />
                    <p className="text-[12px] font-semibold">No resume URL in application record</p>
                  </div>
                )}
              </div>
              <div className="border-t border-amber-100 bg-amber-50/80 px-3 py-2 text-[12px] font-semibold text-amber-900">
                {model.reviewStrip}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
