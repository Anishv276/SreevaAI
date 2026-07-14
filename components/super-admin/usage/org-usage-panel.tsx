"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { SectionKey, InterviewSubKey, UsageOverview, EventsSectionSlug } from "./usage-types";
import { PlanCard } from "./plan-card";
import { OverviewGrid, SECTION_STYLE } from "./overview-grid";
import { EventsDetail } from "./events-detail";
import { InterviewAnalysis } from "./interview-analysis";
import { TestUsageCard } from "./test-usage-card";

// Maps a non-interview section to its events endpoint slug.
const SECTION_TO_SLUG: Partial<Record<SectionKey, EventsSectionSlug>> = {
  jdExtraction: "jd",
  resumeExtraction: "resume",
  finalReport: "report",
};

export function OrgUsagePanel({
  orgId,
  fmt,
}: {
  orgId: string;
  fmt: (usd: number) => string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = (searchParams.get("section") as SectionKey | null) || null;
  const sub = (searchParams.get("sub") as InterviewSubKey | null) || null;

  const [data, setData] = React.useState<UsageOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/super-admin/orgs/${orgId}/usage`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const json: UsageOverview = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Unable to load usage.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Update URL params (keeps orgId, replaces section/sub) so views are shareable.
  const setParams = React.useCallback(
    (next: { section?: SectionKey | null; sub?: InterviewSubKey | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if ("section" in next) {
        if (next.section) params.set("section", next.section);
        else params.delete("section");
      }
      if ("sub" in next) {
        if (next.sub) params.set("sub", next.sub);
        else params.delete("sub");
      }
      router.replace(`/super-admin/billing?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#E9E7FF] bg-white py-20 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500">
        {error || "No data."}
      </div>
    );
  }

  // ---- Interview section (deep-dive component) ----
  if (section === "interview") {
    return (
      <InterviewAnalysis
        orgId={orgId}
        data={data.interview}
        fmt={fmt}
        activeSub={sub}
        onBack={() => setParams({ section: null, sub: null })}
        onSelectSub={(k) => setParams({ sub: k })}
      />
    );
  }

  // ---- JD / Resume / Report section detail ----
  if (section && SECTION_TO_SLUG[section]) {
    const st = SECTION_STYLE[section];
    const meta = data.sections.find((s) => s.key === section);
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-300">
        <button
          onClick={() => setParams({ section: null, sub: null })}
          className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-violet-600 hover:text-violet-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </button>
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-md">
          <h2 className="text-2xl font-black text-gray-900">{meta?.label}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {meta?.runs.toLocaleString()} runs
            {meta?.primaryModel ? ` · ${meta.primaryModel}` : ""} · total{" "}
            <span className="font-semibold" style={{ color: st.color }}>
              {fmt(meta?.costUsd || 0)}
            </span>
          </p>
          <div className="mt-5">
            <EventsDetail orgId={orgId} section={SECTION_TO_SLUG[section]!} fmt={fmt} accent={st.color} />
          </div>
        </div>
      </div>
    );
  }

  // ---- Overview ----
  return (
    <div className="space-y-6">
      <PlanCard org={data.org} fmt={fmt} />
      <OverviewGrid data={data} fmt={fmt} onOpenSection={(key) => setParams({ section: key, sub: null })} />
      <TestUsageCard orgId={orgId} fmt={fmt} />
    </div>
  );
}
