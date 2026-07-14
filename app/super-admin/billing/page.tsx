"use client";
import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Search, RefreshCw, ChevronRight } from "lucide-react";
import { formatOrgPlan } from "@/lib/org-plans";
import { formatLandingPackageForOrgPlan } from "@/lib/landing-packages";
import { cn } from "@/lib/utils";
import { OrgUsagePanel } from "@/components/super-admin/usage/org-usage-panel";
import { CurrencyToggle, useCurrency } from "@/components/super-admin/usage/currency";

type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  totalInterviewsAllowed: number;
  totalInterviewsUsed: number;
};

function SuperAdminBillingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgIdParam = searchParams.get("orgId");

  const [orgs, setOrgs] = React.useState<OrgSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [selectedOrgId, setSelectedOrgId] = React.useState<string | null>(orgIdParam);
  const { currency, setCurrency, fmt } = useCurrency();

  React.useEffect(() => {
    let cancelled = false;
    const loadOrgs = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/super-admin/billing/orgs", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load organizations (${res.status})`);
        const data = await res.json();
        const rows: OrgSummary[] = Array.isArray(data.orgs) ? data.orgs : [];
        if (cancelled) return;
        setOrgs(rows);
        setSelectedOrgId((curr) => curr || orgIdParam || rows[0]?.id || null);
      } catch (err) {
        if (cancelled) return;
        console.error("[SuperAdminBillingPage] Failed to load orgs:", err);
        setError("Unable to load organizations.");
        setOrgs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadOrgs();
    return () => {
      cancelled = true;
    };
  }, [orgIdParam]);

  // Keep the URL's orgId in sync with the selected org (preserving the deep link).
  const selectOrg = React.useCallback(
    (id: string) => {
      setSelectedOrgId(id);
      // Reset section/sub when switching orgs so the new org opens at the overview.
      router.replace(`/super-admin/billing?orgId=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router]
  );

  const filteredOrgs = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((org) =>
      [org.name, org.slug, formatOrgPlan(org.plan), org.status].join(" ").toLowerCase().includes(q)
    );
  }, [orgs, search]);

  React.useEffect(() => {
    if (!selectedOrgId && filteredOrgs[0]?.id) setSelectedOrgId(filteredOrgs[0].id);
  }, [filteredOrgs, selectedOrgId]);

  const selectedOrg = React.useMemo(
    () => orgs.find((org) => org.id === selectedOrgId) || null,
    [orgs, selectedOrgId]
  );

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Usage & Billing</h1>
          <p className="text-sm text-gray-400 mt-0.5">Select an organization to view its detailed usage insights</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <CurrencyToggle currency={currency} setCurrency={setCurrency} />
          <div className="rounded-xl bg-white px-4 py-2.5" style={{ border: "1px solid #E9E7FF" }}>
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Selected org</div>
            <div className="text-sm font-semibold text-gray-900">{selectedOrg?.name || "None selected"}</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)] items-start">
        <aside className="sticky top-5 overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
          <div className="p-3" style={{ borderBottom: "1px solid #F0EEF8" }}>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
                <Building2 className="h-3 w-3" />
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-gray-400">Organizations</p>
                <p className="text-[10px] font-medium text-gray-700">{orgs.length} total</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search orgs"
                className="h-8.5 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-3 text-[12px] outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>
          <div className="max-h-[calc(100vh-240px)] overflow-y-auto p-1.25 custom-scrollbar">
            {loading ? (
              <div className="p-5 text-center">
                <RefreshCw className="h-5 w-5 animate-spin text-violet-500 mx-auto mb-2" />
                <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-gray-400">Loading</p>
              </div>
            ) : error ? (
              <div className="p-5 text-center text-[12px] text-gray-500">{error}</div>
            ) : filteredOrgs.length === 0 ? (
              <div className="p-5 text-center text-[12px] text-gray-500">No organizations match your search.</div>
            ) : (
              <div className="space-y-1">
                {filteredOrgs.map((org) => {
                  const isActive = org.id === selectedOrgId;
                  const remainingInterviews = Math.max(0, org.totalInterviewsAllowed - org.totalInterviewsUsed);
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => selectOrg(org.id)}
                      className={cn(
                        "w-full rounded-xl border px-2 py-2 text-left transition-all duration-200 group",
                        isActive
                          ? "border-[#7C3AED] bg-violet-50"
                          : "border-gray-100 bg-white hover:border-violet-200 hover:bg-violet-50/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gray-900 text-[9px] font-bold text-white">
                          {org.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-[12px] font-semibold text-gray-900 group-hover:text-[#7C3AED]">{org.name}</h3>
                            <ChevronRight className={cn("h-2.5 w-2.5 shrink-0 transition-transform text-gray-300", isActive && "translate-x-0.5 text-[#7C3AED]")} />
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="text-[7px] font-bold uppercase tracking-[0.14em] text-gray-400">{org.slug}</span>
                            <span className="h-1 w-1 rounded-full bg-gray-200" />
                            <span className="text-[7px] font-bold uppercase tracking-[0.14em] text-gray-400">{formatLandingPackageForOrgPlan(org.plan) || "Starter"}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[7px] font-bold uppercase tracking-[0.14em]">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-full border",
                              org.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : "bg-gray-100 text-gray-400 border-gray-200"
                            )}>
                              {org.status}
                            </span>
                            <span className="text-gray-500">
                              {remainingInterviews.toFixed(0)} left
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
        <section className="min-w-0">
          {selectedOrgId ? (
            <OrgUsagePanel key={selectedOrgId} orgId={selectedOrgId} fmt={fmt} />
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500">
              Select an organization to view usage.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function SuperAdminBillingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-400">Loading…</div>}>
      <SuperAdminBillingInner />
    </Suspense>
  );
}
