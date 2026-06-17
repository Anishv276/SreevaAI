"use client";

import React from "react";
import { ReceiptText, Sparkles, BarChart3 } from "lucide-react";
import { HistoryTable } from "./internal/billing-history";
import { Eyebrow, Fact, RingStat } from "./internal/billing-primitives";
import { injectBillingAnimStyles } from "./internal/inject-styles";
import { INK, LINE, LINE_2, MUTED, ORANGE } from "./internal/tokens";
import { formatOrgPlan } from "@/lib/org-plans";
import { getLandingPackageByName, getLandingPackageForOrgPlan, type LandingPackage } from "@/lib/landing-packages";
import type { InterviewRow } from "./internal/types";
import { useCount } from "./internal/use-billing-count";
import { getSupportComposeUrl } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";
import { useJobs } from "@/context/jobs-context";
import { getActiveDriveCount } from "@/lib/drive-limits";

type BillingStatus = {
  interviewQuotaTotal: number;
  interviewQuotaUsed: number;
  interviewQuotaRemaining: number;
  creditsUsed: number;
  hasSufficientInterviews: boolean;
  usageMetrics?: Record<string, unknown> | null;
};

type BillingContentProps = {
  creditsEndpoint?: string;
  historyEndpoint?: string;
  orgName?: string;
  orgPlanLabel?: string;
  showRechargeHelp?: boolean;
  showCreditInternals?: boolean;
  showCreditsUsedInHistory?: boolean;
};

const card: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${LINE}`,
  borderRadius: 18,
  overflow: "hidden",
};

export function BillingContent({
  creditsEndpoint = "/api/admin/credits",
  historyEndpoint = "/api/admin/billing/history",
  orgName,
  orgPlanLabel,
  showRechargeHelp = true,
  showCreditInternals = false,
  showCreditsUsedInHistory = false,
}: BillingContentProps = {}) {
  const adminOrg = useAdminOrg();
  const { jobs } = useJobs();
  const [status, setStatus] = React.useState<BillingStatus>({
    interviewQuotaTotal: 0,
    interviewQuotaUsed: 0,
    interviewQuotaRemaining: 0,
    creditsUsed: 0,
    hasSufficientInterviews: true,
    usageMetrics: null,
  });
  const [statusLoading, setStatusLoading] = React.useState(true);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [historyRows, setHistoryRows] = React.useState<InterviewRow[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [resolvedPlan, setResolvedPlan] = React.useState<LandingPackage | null>(
    getLandingPackageByName(orgPlanLabel) || null,
  );

  React.useEffect(() => {
    injectBillingAnimStyles();
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        setStatusLoading(true);
        setStatusError(null);
        const res = await fetch(creditsEndpoint, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load billing status (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setStatus({
          interviewQuotaTotal: Number(data.interviewQuotaTotal ?? 0),
          interviewQuotaUsed: Number(data.interviewQuotaUsed ?? 0),
          interviewQuotaRemaining: Number(data.interviewQuotaRemaining ?? 0),
          creditsUsed: Number(data.creditsUsed ?? 0),
          hasSufficientInterviews: Boolean(data.hasSufficientInterviews ?? true),
          usageMetrics: data.usageMetrics ?? null,
        });
      } catch (error) {
        if (cancelled) return;
        console.error("[BillingContent] Failed to load billing status:", error);
        setStatusError("Unable to load live billing status.");
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    };

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [creditsEndpoint]);

  React.useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        const res = await fetch(historyEndpoint, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setHistoryRows(Array.isArray(data.rows) ? data.rows : []);
      } catch (error) {
        if (cancelled) return;
        console.error("[BillingContent] Failed to load history:", error);
        setHistoryError("Unable to load live billing history.");
        setHistoryRows([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [historyEndpoint]);

  React.useEffect(() => {
    if (orgPlanLabel) {
      setResolvedPlan(getLandingPackageByName(orgPlanLabel) || null);
      return;
    }

    let cancelled = false;

    const loadOrgPlan = async () => {
      try {
        const res = await fetch("/api/admin/organization", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setResolvedPlan(getLandingPackageForOrgPlan(data.plan) || getLandingPackageByName(formatOrgPlan(data.plan)) || getLandingPackageByName("Starter"));
      } catch {
        // ignore
      }
    };

    loadOrgPlan();

    return () => {
      cancelled = true;
    };
  }, [orgPlanLabel]);

  const interviewRemaining = Math.max(0, status.interviewQuotaRemaining);
  const interviewUsed = Math.max(0, status.interviewQuotaUsed);
  const interviewTotal = Math.max(0, status.interviewQuotaTotal);
  const interviewUsedPct = interviewTotal > 0 ? (interviewUsed / interviewTotal) * 100 : 0;

  const animRemaining = useCount(interviewRemaining, [interviewRemaining]);
  const animUsed = useCount(interviewUsed, [interviewUsed]);
  const animTotal = useCount(interviewTotal, [interviewTotal]);
  const animPct = useCount(interviewUsedPct, [interviewUsedPct]);

  const maxDrivesRaw = adminOrg?.maxActiveDrives;
  const isJobsUnlimited = String(maxDrivesRaw) === "-1";
  const jobsTotal = isJobsUnlimited ? 0 : Number(maxDrivesRaw || 0);
  const jobsUsed = adminOrg?.activeDriveCount ?? getActiveDriveCount(jobs);
  const jobsRemaining = isJobsUnlimited ? 0 : Math.max(0, jobsTotal - jobsUsed);
  const jobsUsedPct = jobsTotal > 0 ? (jobsUsed / jobsTotal) * 100 : 0;

  const animJobsRemaining = useCount(jobsRemaining, [jobsRemaining]);
  const animJobsUsed = useCount(jobsUsed, [jobsUsed]);
  const animJobsTotal = useCount(jobsTotal, [jobsTotal]);
  const animJobsPct = useCount(jobsUsedPct, [jobsUsedPct]);

  const animCreditUsed = useCount(status.creditsUsed, [status.creditsUsed]);
  const ringR = 56;
  const ringC = 2 * Math.PI * ringR;
  const ringDash = ringC * (animPct / 100);
  const jobsRingDash = ringC * (animJobsPct / 100);

  return (
    <div className="font-sans" style={{ maxWidth: "100%", margin: "0 auto", padding: "8px 0 56px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ width: 4, height: 18, background: ORANGE, borderRadius: 2 }} />
            <Eyebrow>Billing</Eyebrow>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 800, color: INK, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            Interviews & Usage
          </h1>
          {orgName ? (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: `1px solid ${LINE}`,
                  color: INK,
                  background: "#fff",
                }}
              >
                {orgName}
              </span>
              {orgPlanLabel ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: `1px solid ${LINE}`,
                    color: MUTED,
                    background: "#fff",
                  }}
                >
                  {orgPlanLabel}
                </span>
              ) : null}
            </div>
          ) : null}
          <div style={{ fontSize: 14.5, color: MUTED, marginTop: 8 }}>
            Manage interview quota, review usage, and keep track of internal billing totals.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showCreditInternals ? "1.35fr 1fr" : "1.35fr .95fr", gap: 20 }}>
        <div style={{ ...card, borderTop: `4px solid ${ORANGE}`, padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <Eyebrow>Interview quota</Eyebrow>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>1 interview is deducted after each completed session.</div>

            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 10px",
                border: `1px solid ${LINE}`,
                borderRadius: 999,
                color: MUTED,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22A06B" }} />
              All systems operational
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 24, padding: 28, boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles style={{ width: 20, height: 20, color: ORANGE }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: "-0.01em" }}>Interview Quota</h3>
                  <p style={{ fontSize: 12, fontWeight: 500, color: MUTED, margin: 0 }}>Available AI screening sessions</p>
                </div>
              </div>
              
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 24 }}>
                <span style={{ fontSize: 48, fontWeight: 800, color: INK, lineHeight: 1, letterSpacing: "-0.03em" }}>
                  {statusLoading ? "..." : animRemaining.toFixed(0)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: MUTED, paddingBottom: 6 }}>
                  remaining of {statusLoading ? "..." : animTotal.toFixed(0)}
                </span>
              </div>

              <div style={{ height: 8, background: LINE, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ height: "100%", width: `${animPct}%`, background: ORANGE, borderRadius: 4, transition: "width 1s ease-out" }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: MUTED }}>{animUsed.toFixed(0)} used</span>
                <span style={{ color: ORANGE }}>{animPct.toFixed(1)}% consumed</span>
              </div>
            </div>

            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 24, padding: 28, boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BarChart3 style={{ width: 20, height: 20, color: "#4B5563" }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, letterSpacing: "-0.01em" }}>Active Jobs Quota</h3>
                  <p style={{ fontSize: 12, fontWeight: 500, color: MUTED, margin: 0 }}>Concurrent recruitment drives</p>
                </div>
              </div>
              
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 24 }}>
                <span style={{ fontSize: 48, fontWeight: 800, color: INK, lineHeight: 1, letterSpacing: "-0.03em" }}>
                  {isJobsUnlimited ? "∞" : Number(animJobsRemaining).toFixed(0)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: MUTED, paddingBottom: 6 }}>
                  {isJobsUnlimited ? "unlimited jobs available" : `remaining of ${Number(animJobsTotal).toFixed(0)}`}
                </span>
              </div>

              <div style={{ height: 8, background: LINE, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ height: "100%", width: `${isJobsUnlimited ? 0 : Number(animJobsPct)}%`, background: "#4B5563", borderRadius: 4, transition: "width 1s ease-out" }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: MUTED }}>{Number(animJobsUsed).toFixed(0)} active currently</span>
                {!isJobsUnlimited && <span style={{ color: "#4B5563" }}>{Number(animJobsPct).toFixed(1)}% utilized</span>}
              </div>
            </div>
          </div>

          {statusError ? <div style={{ marginTop: 12, fontSize: 12.5, color: "#B45309" }}>{statusError}</div> : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {showCreditInternals ? (
            <div style={{ ...card, borderTop: `4px solid ${ORANGE}`, padding: 24 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <Eyebrow>Credits used</Eyebrow>
                  <div style={{ fontSize: 24, fontWeight: 800, color: INK, marginTop: 8 }}>Usage only</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>1 minute = 1 credit.</div>
                </div>
                <div
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background: "#111827",
                    color: "#fff",
                  }}
                >
                  Live usage
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 24 }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: INK, letterSpacing: "-0.03em" }}>
                  {statusLoading ? "..." : animCreditUsed.toFixed(0)}
                </span>
                <span style={{ fontSize: 13, color: MUTED }}>credits used</span>
              </div>
              <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
                <Fact label="Credits used" value={status.creditsUsed.toFixed(2)} sub="minutes consumed" />
              </div>
            </div>
          ) : (
            <div style={{ ...card, borderTop: `4px solid ${ORANGE}`, padding: 24 }}>
              <Eyebrow>Package</Eyebrow>
              <div
                style={{
                  marginTop: 12,
                  border: `1px solid ${LINE}`,
                  borderRadius: 18,
                  padding: 18,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: INK, lineHeight: 1.1 }}>
                      {resolvedPlan?.name || "Starter"}
                    </div>
                    <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
                      {resolvedPlan?.interviewsIncluded || "30 interviews included"}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "#FFF7ED",
                      color: ORANGE,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Current package
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: INK, lineHeight: 1 }}>
                    {resolvedPlan?.price || "$99"}
                    <span style={{ fontSize: 14, fontWeight: 700, color: MUTED }}>{resolvedPlan?.suffix || "/mo"}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {(resolvedPlan?.features?.slice(0, 4) || ["30 interviews included", "Price per interview: $3.30", "Topup: $4.5/interview"]).map((feature) => (
                    <div
                      key={feature}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        border: `1px solid ${LINE}`,
                        borderRadius: 14,
                        padding: "10px 12px",
                        background: "#FAFAFA",
                        color: INK,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE, flexShrink: 0 }} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showRechargeHelp ? (
            <div style={{ ...card, padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 12, background: "#FFF7ED", color: ORANGE, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Need more interviews?</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Increase the org quota - contact Sreeva AI support.</div>
                </div>
              </div>
              <a
                href={getSupportComposeUrl({ subject: "Increase org quota request", body: "Hi support team,\n\nWe need more interviews. Please help us recharge.\n" })}
                target="_blank" rel="noreferrer"
                style={{
                  background: "linear-gradient(135deg, #F97316, #ea6608)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "8px 16px",
                  borderRadius: 8,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center"
                }}
              >
                Contact Support
              </a>
            </div>
          ) : null}
        </div>
      </div>


      <div style={{ marginTop: 28 }}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={16} color={ORANGE} />
          <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Interview history</span>
        </div>
        <HistoryTable rows={historyRows} loading={historyLoading} showCreditsUsed={showCreditsUsedInHistory} />
        {historyError ? <div style={{ marginTop: 10, fontSize: 12.5, color: "#B45309" }}>{historyError}</div> : null}
      </div>
    </div>
  );
}
