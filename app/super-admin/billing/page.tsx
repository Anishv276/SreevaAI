"use client";
import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, RefreshCw, ChevronRight } from "lucide-react";
import { formatOrgPlan } from "@/lib/org-plans";
import { formatLandingPackageForOrgPlan } from "@/lib/landing-packages";
import { cn } from "@/lib/utils";
import { OrgUsagePanel } from "@/components/super-admin/usage/org-usage-panel";
import { CurrencyToggle, useCurrency } from "@/components/super-admin/usage/currency";
import { DemoUsageCard } from "@/components/super-admin/usage/demo-usage-card";

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
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const { currency, setCurrency, fmt } = useCurrency();

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <div className="mx-auto max-w-5xl space-y-6 pb-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Usage & Billing</h1>
          <p className="text-sm text-gray-400 mt-0.5">Select an organization to view its detailed usage insights</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <CurrencyToggle currency={currency} setCurrency={setCurrency} />
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between min-w-[200px] rounded-xl bg-white px-4 py-2.5 text-left transition-all hover:border-violet-200"
              style={{ border: "1px solid #E9E7FF" }}
            >
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Selected org</div>
                <div className="text-sm font-semibold text-gray-900">{selectedOrg?.name || "None selected"}</div>
              </div>
              <ChevronRight className={cn("h-4 w-4 text-gray-400 transition-transform", isDropdownOpen && "rotate-90")} />
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-[320px] rounded-2xl bg-white z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
                <div className="p-3" style={{ borderBottom: "1px solid #F0EEF8" }}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search orgs"
                      className="h-10 w-full rounded-xl bg-gray-50 pl-9 pr-3 text-sm outline-none transition-all focus:bg-white"
                      style={{ border: "1px solid #E9E7FF" }}
                      onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; }}
                      onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto p-2 custom-scrollbar">
                  {loading ? (
                    <div className="p-5 text-center">
                      <RefreshCw className="h-5 w-5 animate-spin text-violet-500 mx-auto mb-2" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Loading</p>
                    </div>
                  ) : error ? (
                    <div className="p-5 text-center text-sm text-gray-500">{error}</div>
                  ) : filteredOrgs.length === 0 ? (
                    <div className="p-5 text-center text-sm text-gray-500">No organizations match your search.</div>
                  ) : (
                    <div className="space-y-1">
                      {filteredOrgs.map((org) => {
                        const isActive = org.id === selectedOrgId;
                        const remainingInterviews = Math.max(0, org.totalInterviewsAllowed - org.totalInterviewsUsed);
                        return (
                          <button
                            key={org.id}
                            type="button"
                            onClick={() => {
                              selectOrg(org.id);
                              setIsDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full rounded-xl px-3 py-2.5 text-left transition-all duration-200 group flex items-center gap-3",
                              isActive
                                ? "bg-violet-50"
                                : "bg-white hover:bg-violet-50/50"
                            )}
                          >
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gray-900 text-xs font-bold text-white shadow-sm transition-all"
                              style={isActive ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" } : {}}>
                              {org.name[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className={cn("truncate text-sm font-semibold transition-colors", isActive ? "text-violet-700" : "text-gray-900 group-hover:text-violet-700")}>{org.name}</h3>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-medium text-gray-500">{formatLandingPackageForOrgPlan(org.plan) || "Starter"}</span>
                                <span className="h-1 w-1 rounded-full bg-gray-300" />
                                <span className="text-[10px] font-medium text-gray-500">{remainingInterviews.toFixed(0)} left</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <DemoUsageCard fmt={fmt} />
      <div className="mt-6">
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
