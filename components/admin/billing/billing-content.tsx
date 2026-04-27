// Billing page — ring hero, plan column, how-it-works, history.

"use client";

import { Check, Crown, ExternalLink } from "lucide-react";
import React from "react";
import { SettingsCard } from "../settings/settings-shared";
import { Button } from "@/components/ui/button";
import { Icon } from "./internal/billing-icons";
import { BuyCreditsModal } from "./internal/buy-credits-modal";
import { Eyebrow, Fact, RingStat } from "./internal/billing-primitives";
import { HistoryTable } from "./internal/billing-history";
import { injectBillingAnimStyles } from "./internal/inject-styles";
import { INK, LINE, LINE_2, MUTED, ORANGE } from "./internal/tokens";
import type { CreditPack, InterviewRow } from "./internal/types";
import { useCount } from "./internal/use-billing-count";

const card = {
  background: "#fff",
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  overflow: "hidden" as const,
};

const ghostBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#fff",
  color: INK,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: ORANGE,
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(242,107,31,.3)",
};

export function BillingContent() {
  const [credits, setCredits] = React.useState({ total: 0, used: 0 });
  const [creditsLoading, setCreditsLoading] = React.useState(true);
  const [creditsError, setCreditsError] = React.useState<string | null>(null);
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [historyRows, setHistoryRows] = React.useState<InterviewRow[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  React.useEffect(() => {
    injectBillingAnimStyles();
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadCredits = async () => {
      try {
        setCreditsLoading(true);
        setCreditsError(null);
        const res = await fetch("/api/admin/credits", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load credits (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setCredits({
          total: Number(data.creditsTotal ?? 0),
          used: Number(data.creditsUsed ?? 0),
        });
      } catch (error) {
        if (cancelled) return;
        console.error("[BillingContent] Failed to load credits:", error);
        setCreditsError("Unable to load live credit balance.");
      } finally {
        if (!cancelled) setCreditsLoading(false);
      }
    };

    loadCredits();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        const res = await fetch("/api/admin/billing/history", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load history (${res.status})`);
        }
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
  }, []);

  const remaining = Math.max(0, credits.total - credits.used);
  const minsRemaining = Math.round(remaining);
  const usedPct = credits.total > 0 ? (credits.used / credits.total) * 100 : 0;

  const animTotal = useCount(credits.total, [credits.total]);
  const animRem = useCount(remaining, [credits.total, credits.used]);
  const animMins = useCount(minsRemaining, [minsRemaining]);
  const animPct = useCount(usedPct, [usedPct]);

  const onPurchase = (pack: CreditPack) => setCredits((c) => ({ ...c, total: c.total + pack.credits }));

  const ringR = 88;
  const ringC = 2 * Math.PI * ringR;
  const ringDash = ringC * (animPct / 100);

  return (
    <>
      <BuyCreditsModal open={buyOpen} onClose={() => setBuyOpen(false)} onPurchase={onPurchase} />

      <div style={{ maxWidth: "100%", margin: "0 auto", padding: "40px 4% 56px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 4, height: 18, background: ORANGE, borderRadius: 2 }} />
              <Eyebrow>Billing</Eyebrow>
            </div>
            <h1 style={{ fontSize: 38, fontWeight: 700, color: INK, margin: 0, letterSpacing: "-0.025em", lineHeight: 1.05 }}>Credits & Usage</h1>
            <div style={{ fontSize: 14.5, color: MUTED, marginTop: 8 }}>Manage your interview credits, recharge anytime, view your plan.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ghost-btn" style={ghostBtn}>
              <Icon.receipt s={15} /> Invoices
            </button>
            <button type="button" className="primary-btn" onClick={() => setBuyOpen(true)} style={primaryBtn}>
              <Icon.plus s={15} /> Buy credits
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
              <div>
                <Eyebrow>Interview credits</Eyebrow>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>1 credit/min · second-precision billing</div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
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

            <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
              <div style={{ position: "relative", width: 220, height: 220, flexShrink: 0 }}>
                <svg width={220} height={220} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={110} cy={110} r={ringR} stroke={LINE} strokeWidth={14} fill="none" />
                  <circle
                    cx={110}
                    cy={110}
                    r={ringR}
                    stroke={ORANGE}
                    strokeWidth={14}
                    fill="none"
                    strokeDasharray={`${ringDash} ${ringC}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Remaining</div>
                  <div style={{ fontSize: 44, fontWeight: 700, color: INK, letterSpacing: "-0.03em", marginTop: 6 }}>
                    {creditsLoading ? "…" : animRem.toFixed(1)}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                    of {creditsLoading ? "…" : animTotal.toFixed(0)} credits
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, display: "grid", gap: 18 }}>
                <RingStat label="Minutes remaining" value={Math.round(animMins).toLocaleString()} hint="of interview time left" />
                <div style={{ height: 1, background: LINE_2 }} />
                <RingStat
                  label="Credits used"
                  value={(credits.used).toFixed(2)}
                  hint={`${Math.round(credits.used)} min consumed`}
                />
                <div style={{ height: 1, background: LINE_2 }} />
                <RingStat label="Consumption" value={`${animPct.toFixed(1)}%`} hint={`${(100 - animPct).toFixed(1)}% still available`} accent />
              </div>
            </div>

            <div style={{ marginTop: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: MUTED, marginBottom: 8, fontWeight: 500 }}>
                <span>{Math.round(credits.used)} min used</span>
                <span>{credits.total.toLocaleString()} min total</span>
              </div>
              <div style={{ height: 6, background: LINE_2, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${animPct}%`, height: "100%", background: ORANGE, borderRadius: 999, transition: "width .3s ease" }} />
              </div>
            </div>
            {creditsError ? (
              <div style={{ marginTop: 12, fontSize: 12.5, color: "#B45309" }}>{creditsError}</div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: INK, borderRadius: 18, padding: 26, color: "#fff" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <Eyebrow color="rgba(255,255,255,.65)">Current plan</Eyebrow>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 8 }}>Studio</div>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)", marginTop: 4 }}>Renews May 24, 2026</div>
                </div>
                <div
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background: ORANGE,
                    color: "#fff",
                  }}
                >
                  Active
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 24 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: "#fff" }}>$99</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>/ month</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,.1)", margin: "20px 0" }} />
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  ["100 credits / month", true],
                  ["Up to 5 team seats", true],
                  ["Custom interview scripts", true],
                  ["Priority support", false],
                ].map(([t, on]) => (
                  <div
                    key={String(t)}
                    style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: on ? "#fff" : "rgba(255,255,255,.4)" }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: on ? ORANGE : "rgba(255,255,255,.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                      }}
                    >
                      <Icon.check s={10} />
                    </span>
                    {t}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="ghost-btn"
                style={{
                  marginTop: 22,
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "rgba(255,255,255,.1)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                Manage plan <Icon.arrowRight s={13} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 14 }}>How credits work</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
              <Fact label="Rate" value="1 credit/min" sub="60 seconds = 1.00 credit" />
              <Fact label="Precision" value="Second-precision" sub="4m 10s = 4.17, 5m 01s = 5.02" divider />
              <Fact label="Deducted" value="On finalize" sub="Based on actual interview duration" divider />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          {historyError ? (
            <div style={{ marginBottom: 10, fontSize: 12.5, color: "#B45309" }}>{historyError}</div>
          ) : null}
          <HistoryTable rows={historyRows} loading={historyLoading} />
        </div>

        <div style={{ marginTop: 24 }}>
          <SettingsCard
            title="Need More Credits?"
            description="Contact your administrator to recharge credits and continue running interviews."
            icon={Crown}
          >
            <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-8">
              {[
                "Instant credit top-up",
                "No subscription required",
                "Pay-as-you-go model",
                "Usage tracked per interview",
                "Auto-deducted at completion",
                "Full audit trail",
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">{feat}</span>
                </div>
              ))}
            </div>
            <Button className="h-11 px-8 rounded-lg bg-[#F97316] hover:bg-orange-600 text-white font-bold shadow-md transition-all">
              Contact Admin to Recharge <ExternalLink className="h-4 w-4 ml-2.5" />
            </Button>
          </SettingsCard>
        </div>
      </div>
    </>
  );
}
