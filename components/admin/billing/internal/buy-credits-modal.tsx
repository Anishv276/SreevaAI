"use client";

import React from "react";
import { Icon } from "./billing-icons";
import { INK, LINE, MUTED, ORANGE, ORANGE_DEEP, ORANGE_SOFT } from "./tokens";
import type { CreditPack } from "./types";

export const PACKS: CreditPack[] = [
  { id: "s", credits: 100, mins: 500, price: 49, blurb: "Good for ~25 interviews" },
  { id: "m", credits: 250, mins: 1250, price: 109, blurb: "Most popular", popular: true, save: "12%" },
  { id: "l", credits: 600, mins: 3000, price: 239, blurb: "Best value", save: "20%" },
];

export function BuyCreditsModal({
  open,
  onClose,
  onPurchase,
}: {
  open: boolean;
  onClose: () => void;
  onPurchase: (pack: CreditPack) => void;
}) {
  const [picked, setPicked] = React.useState("m");
  const [phase, setPhase] = React.useState<"pick" | "success">("pick");
  React.useEffect(() => {
    if (open) {
      setPicked("m");
      setPhase("pick");
    }
  }, [open]);
  if (!open) return null;
  const sel = PACKS.find((p) => p.id === picked);
  if (!sel) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        backdropFilter: "blur(2px)",
        animation: "fadeIn .14s ease",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.06)",
          overflow: "hidden",
          animation: "popIn .22s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {phase === "pick" ? (
          <>
            <div style={{ padding: "22px 24px 8px" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: INK, letterSpacing: "-0.01em" }}>Buy interview credits</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>One-time top-up. Credits never expire.</div>
            </div>
            <div style={{ padding: "12px 24px 0", display: "grid", gap: 10 }}>
              {PACKS.map((p) => {
                const selected = picked === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPicked(p.id)}
                    style={{
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `1.5px solid ${selected ? ORANGE : LINE}`,
                      background: selected ? ORANGE_SOFT : "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      transition: "all .14s ease",
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border: `2px solid ${selected ? ORANGE : "#CFCFCF"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {selected ? <div style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} /> : null}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, color: INK, fontSize: 15 }}>{p.credits} credits</span>
                        <span style={{ fontSize: 12, color: MUTED }}>· {p.mins.toLocaleString()} min</span>
                        {p.popular ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              padding: "3px 7px",
                              borderRadius: 4,
                              background: INK,
                              color: "#fff",
                            }}
                          >
                            POPULAR
                          </span>
                        ) : null}
                        {p.save ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              padding: "3px 7px",
                              borderRadius: 4,
                              background: ORANGE_SOFT,
                              color: ORANGE_DEEP,
                            }}
                          >
                            SAVE {p.save}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{p.blurb}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: INK, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>${p.price}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, fontSize: 12.5, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon.card s={14} />
                <span>Visa ending 4242</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: `1px solid ${LINE}`,
                  background: "#fff",
                  color: INK,
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onPurchase(sel);
                  setPhase("success");
                }}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: ORANGE,
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Pay ${sel.price}
                <Icon.arrowRight s={14} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: "36px 28px", textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                margin: "0 auto 14px",
                borderRadius: "50%",
                background: ORANGE_SOFT,
                color: ORANGE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "popIn .25s cubic-bezier(.2,.8,.2,1)",
              }}
            >
              <Icon.check s={28} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>Added {sel.credits} credits</div>
            <div style={{ fontSize: 13.5, color: MUTED, marginTop: 6 }}>{sel.mins.toLocaleString()} interview minutes are ready to use.</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: 20,
                padding: "10px 22px",
                borderRadius: 10,
                border: "none",
                background: INK,
                color: "#fff",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
