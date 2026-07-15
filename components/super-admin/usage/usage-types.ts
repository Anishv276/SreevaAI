// Response types for the super-admin usage view API.
// See app/api/super-admin/orgs/[id]/usage/route.ts and .../usage/events/route.ts.

export type SectionKey = "jdExtraction" | "resumeExtraction" | "resumeReport" | "interview" | "finalReport";
export type InterviewSubKey = "tts" | "stt" | "generation" | "eval" | "brief";

export type UsageSection = {
  key: SectionKey;
  label: string;
  costUsd: number;
  runs: number;
  primaryModel: string | null;
  ledgerCostUsd: number;
  legacyCostUsd: number;
};

export type InterviewSubSection = {
  key: InterviewSubKey;
  label: string;
  costUsd: number;
  ledgerCostUsd: number;
  legacyCostUsd: number;
  calls: number;
  primaryModel: string | null;
  units: {
    ttsCharacters?: number;
    sttAudioSeconds?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
};

export type ByModelEntry = {
  provider: string;
  model: string;
  kind: "llm" | "tts" | "stt" | "embedding";
  costUsd: number;
};

export type UsageOverview = {
  org: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
    planLabel: string;
    planPriceUsd: number;
    billingCycle: string;
    nextBillingDate: string;
    interviewsAllowed: number;
    interviewsUsed: number;
    creditsUsed: number;
    totalCostUsd: number;
  };
  sections: UsageSection[];
  interview: {
    totalCostUsd: number;
    subSections: InterviewSubSection[];
    byModel: ByModelEntry[];
  };
  overview: { key: string; label: string; costUsd: number }[];
  testUsage: null | { count: number; totals: Record<string, number> };
};

export type UsageEventRow = {
  id: string;
  createdAt: string;
  feature: string;
  kind: "llm" | "tts" | "stt" | "embedding";
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  ttsCharacters: number;
  sttAudioSeconds: number;
  costUsd: number;
  jobTitle: string | null;
  candidateName: string | null;
  label: string | null;
  source: "live" | "backfill";
};

export type UsageEventsResponse = {
  rows: UsageEventRow[];
  nextCursor: string | null;
  sectionTotals: { costUsd: number; calls: number; rows: number };
  legacy: { costUsd: number } | null;
};

// UI section slug used to query the events endpoint.
export type EventsSectionSlug =
  | "jd"
  | "resume"
  | "resume-report"
  | "report"
  | "interview-tts"
  | "interview-stt"
  | "interview-generation"
  | "interview-eval"
  | "interview-brief";
