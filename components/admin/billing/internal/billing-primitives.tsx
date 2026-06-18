"use client";
import React from "react";
import {
  DANGER,
  DANGER_SOFT,
  INK,
  INK_2,
  LINE_2,
  MUTED,
  ORANGE,
  ORANGE_DEEP,
  ORANGE_SOFT,
  SUCCESS,
  SUCCESS_SOFT,
  WARN,
  WARN_SOFT,
} from "./tokens";
import type { InterviewStatus } from "./types";
export function Toggle({
  on,
  onChange,
  label,
  sub,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  sub?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        {label ? <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{label}</div> : null}
        {sub ? <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{sub}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          background: on ? ORANGE : "#D8D8D8",
          position: "relative",
          flexShrink: 0,
          padding: 0,
          transition: "background .18s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: "left .18s ease",
            boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          }}
        />
      </button>
    </div>
  );
}
export function Eyebrow({ children, color = MUTED }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </div>
  );
}
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const grays = ["#F1F1EE", "#E8E8E5", "#DEDED9"];
  const bg = grays[name.length % grays.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: bg,
        color: INK_2,
        fontSize: size * 0.4,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
export function StatusPill({ status }: { status: InterviewStatus }) {
  const map: Record<InterviewStatus, { bg: string; fg: string; label: string }> = {
    completed: { bg: SUCCESS_SOFT, fg: SUCCESS, label: "Completed" },
    "in-progress": { bg: ORANGE_SOFT, fg: ORANGE_DEEP, label: "In progress" },
    "no-show": { bg: DANGER_SOFT, fg: DANGER, label: "No-show" },
    abandoned: { bg: WARN_SOFT, fg: WARN, label: "Abandoned" },
    pending: { bg: LINE_2, fg: INK_2, label: "Pending" },
  };
  const s = map[status] ?? map.completed;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 6,
        background: s.bg,
        color: s.fg,
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.fg }} />
      {s.label}
    </span>
  );
}
export function RingStat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: accent ? ORANGE : INK, letterSpacing: "-0.02em" }}>{value}</span>
        <span style={{ fontSize: 12.5, color: MUTED }}>{hint}</span>
      </div>
    </div>
  );
}
export function Fact({ label, value, sub, divider }: { label: string; value: string; sub: string; divider?: boolean }) {
  return (
    <div
      style={{
        paddingLeft: divider ? 24 : 0,
        borderLeft: divider ? `1px solid ${LINE_2}` : "none",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: INK, marginTop: 8, letterSpacing: "-0.015em" }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
