"use client";
import React from "react";
import Link from "next/link";
import { CreditCard, Calendar, Pencil, AlertTriangle } from "lucide-react";
import type { UsageOverview } from "./usage-types";

// Top-right card: org total cost + plan + next subscription date + quota bar.
export function PlanCard({
  org,
  fmt,
}: {
  org: UsageOverview["org"];
  fmt: (usd: number) => string;
}) {
  const nextDate = new Date(org.nextBillingDate);
  // Read the clock once on mount (render must stay pure).
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => setNow(Date.now()), []);
  const isPast = now != null && nextDate.getTime() < now;
  const usedPct = org.interviewsAllowed > 0
    ? Math.min(100, Math.round((org.interviewsUsed / org.interviewsAllowed) * 100))
    : 0;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-violet-900 to-violet-700 p-6 text-white shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-200">Total spend</p>
          <h2 className="mt-1 text-4xl font-black tracking-tight">{fmt(org.totalCostUsd)}</h2>
        </div>
        <Link
          href={`/super-admin/orgs/${org.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-white/20"
        >
          <Pencil className="h-3 w-3" /> Edit plan
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/10 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
            <CreditCard className="h-3 w-3" /> Plan
          </p>
          <p className="mt-1 text-lg font-bold">{org.planLabel}</p>
          <p className="text-xs text-violet-200">
            {fmt(org.planPriceUsd)} / {org.billingCycle.toLowerCase() === "yearly" ? "yr" : "mo"}
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
            <Calendar className="h-3 w-3" /> Next billing
          </p>
          <p className="mt-1 text-lg font-bold">
            {nextDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
          {isPast && (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-300">
              <AlertTriangle className="h-3 w-3" /> Past due — update
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-semibold text-violet-200">
          <span>Interviews used</span>
          <span>
            {org.interviewsUsed.toLocaleString()} / {org.interviewsAllowed.toLocaleString()}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-white/80" style={{ width: `${usedPct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-violet-200">
        <span>Credits used</span>
        <span>{org.creditsUsed.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-violet-300">(1 min = 1 credit)</span></span>
      </div>
    </div>
  );
}
