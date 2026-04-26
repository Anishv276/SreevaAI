"use client";

import React from "react";
import { Icon, type IconProps } from "./billing-icons";
import { Avatar, Eyebrow, StatusPill } from "./billing-primitives";
import { fmtDate, fmtDuration } from "./format";
import {
  INK,
  INK_2,
  INK_3,
  LINE,
  LINE_2,
  MUTED,
  MUTED_2,
  ORANGE,
  ORANGE_DEEP,
  ORANGE_SOFT,
  ORANGE_TINT,
  SURFACE,
} from "./tokens";
import type { HistorySort, InterviewRow } from "./types";

export const INTERVIEW_HISTORY: InterviewRow[] = [
  { id: "INT-2841", candidate: "Aisha Nakamura", role: "Senior Product Manager", interviewer: "You", type: "Technical", durationSec: 1454, credits: 24.23, status: "completed", date: "2026-04-26T11:42:00", cost: 12.15, recording: true, transcript: true },
  { id: "INT-2840", candidate: "Marco De Luca", role: "Frontend Engineer", interviewer: "You", type: "Screening", durationSec: 1928, credits: 32.13, status: "completed", date: "2026-04-26T09:15:00", cost: 16.05, recording: true, transcript: true },
  { id: "INT-2839", candidate: "Priya Raghavan", role: "Senior Product Designer", interviewer: "You", type: "Portfolio", durationSec: 1127, credits: 18.78, status: "completed", date: "2026-04-25T16:30:00", cost: 9.4, recording: true, transcript: true },
  { id: "INT-2838", candidate: "Tom Lindqvist", role: "Data Scientist", interviewer: "You", type: "Technical", durationSec: 2722, credits: 45.37, status: "completed", date: "2026-04-25T13:05:00", cost: 22.7, recording: true, transcript: true },
  { id: "INT-2837", candidate: "Sara Khoury", role: "Backend Engineer", interviewer: "You", type: "System Design", durationSec: 1683, credits: 28.05, status: "completed", date: "2026-04-24T15:20:00", cost: 14.05, recording: true, transcript: true },
  { id: "INT-2836", candidate: "Devin Park", role: "Frontend Engineer", interviewer: "You", type: "Screening", durationSec: 0, credits: 0, status: "no-show", date: "2026-04-24T11:00:00", cost: 0, recording: false, transcript: false },
  { id: "INT-2835", candidate: "Lucia Romano", role: "Engineering Manager", interviewer: "You", type: "Behavioral", durationSec: 2189, credits: 36.48, status: "completed", date: "2026-04-23T17:45:00", cost: 18.25, recording: true, transcript: true },
  { id: "INT-2834", candidate: "Hassan Mehmood", role: "DevOps Engineer", interviewer: "You", type: "Technical", durationSec: 1512, credits: 25.2, status: "completed", date: "2026-04-23T14:10:00", cost: 12.6, recording: true, transcript: true },
  { id: "INT-2833", candidate: "Elena Volkov", role: "Product Manager", interviewer: "You", type: "Cultural", durationSec: 1351, credits: 22.52, status: "completed", date: "2026-04-23T10:30:00", cost: 11.25, recording: true, transcript: true },
  { id: "INT-2832", candidate: "Akira Tanaka", role: "Senior Backend Engineer", interviewer: "You", type: "System Design", durationSec: 2876, credits: 47.93, status: "completed", date: "2026-04-22T16:00:00", cost: 23.95, recording: true, transcript: true },
  { id: "INT-2831", candidate: "Ngozi Okafor", role: "Data Analyst", interviewer: "You", type: "Technical", durationSec: 738, credits: 12.3, status: "abandoned", date: "2026-04-22T13:15:00", cost: 6.15, recording: true, transcript: true },
  { id: "INT-2830", candidate: "Felix Schneider", role: "iOS Engineer", interviewer: "You", type: "Screening", durationSec: 1845, credits: 30.75, status: "completed", date: "2026-04-22T11:00:00", cost: 15.4, recording: true, transcript: true },
  { id: "INT-2829", candidate: "Maya Joshi", role: "Senior Product Designer", interviewer: "You", type: "Portfolio", durationSec: 1622, credits: 27.03, status: "completed", date: "2026-04-21T15:30:00", cost: 13.5, recording: true, transcript: true },
  { id: "INT-2828", candidate: "Owen Davies", role: "Engineering Manager", interviewer: "You", type: "Behavioral", durationSec: 2014, credits: 33.57, status: "completed", date: "2026-04-21T11:15:00", cost: 16.8, recording: true, transcript: true },
  { id: "INT-2827", candidate: "Zara Ahmed", role: "Frontend Engineer", interviewer: "You", type: "Technical", durationSec: 1290, credits: 21.5, status: "completed", date: "2026-04-20T16:45:00", cost: 10.75, recording: true, transcript: true },
  { id: "INT-2826", candidate: "Bruno Costa", role: "Backend Engineer", interviewer: "You", type: "Screening", durationSec: 1568, credits: 26.13, status: "completed", date: "2026-04-20T14:00:00", cost: 13.05, recording: true, transcript: true },
  { id: "INT-2825", candidate: "Ines Garcia", role: "Product Manager", interviewer: "You", type: "Cultural", durationSec: 1431, credits: 23.85, status: "completed", date: "2026-04-19T13:20:00", cost: 11.9, recording: true, transcript: true },
  { id: "INT-2824", candidate: "Kenji Watanabe", role: "Data Scientist", interviewer: "You", type: "Technical", durationSec: 2456, credits: 40.93, status: "completed", date: "2026-04-19T10:00:00", cost: 20.45, recording: true, transcript: true },
  { id: "INT-2823", candidate: "Fatima Al-Sayed", role: "Senior Frontend Engineer", interviewer: "You", type: "System Design", durationSec: 1992, credits: 33.2, status: "completed", date: "2026-04-18T15:00:00", cost: 16.6, recording: true, transcript: true },
  { id: "INT-2822", candidate: "Jonas Bergstrom", role: "DevOps Engineer", interviewer: "You", type: "Screening", durationSec: 1147, credits: 19.12, status: "completed", date: "2026-04-18T11:30:00", cost: 9.55, recording: true, transcript: true },
  { id: "INT-2821", candidate: "Ana Ribeiro", role: "iOS Engineer", interviewer: "You", type: "Technical", durationSec: 1773, credits: 29.55, status: "completed", date: "2026-04-17T14:45:00", cost: 14.8, recording: true, transcript: true },
  { id: "INT-2820", candidate: "Yuki Sato", role: "Senior Product Manager", interviewer: "You", type: "Behavioral", durationSec: 1856, credits: 30.93, status: "completed", date: "2026-04-17T10:20:00", cost: 15.45, recording: true, transcript: true },
  { id: "INT-2819", candidate: "Rashid Khan", role: "Backend Engineer", interviewer: "You", type: "System Design", durationSec: 2234, credits: 37.23, status: "completed", date: "2026-04-16T16:10:00", cost: 18.6, recording: true, transcript: true },
];

const PAGE_SIZE = 10;

function HistorySortHead({
  k,
  children,
  sort,
  setSort,
}: {
  k: keyof InterviewRow;
  children: React.ReactNode;
  sort: HistorySort;
  setSort: React.Dispatch<React.SetStateAction<HistorySort>>;
}) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() =>
        setSort((s) => ({
          key: k,
          dir: s.key === k && s.dir === "desc" ? "asc" : "desc",
        }))
      }
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        color: active ? INK : MUTED,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        display: "flex",
        alignItems: "center",
        gap: 4,
        textAlign: "left",
        justifyContent: "flex-start",
        width: "100%",
      }}
    >
      {children}
      {active ? <span style={{ fontSize: 9, color: MUTED }}>{sort.dir === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const sel = options.find((o) => o.value === value);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 11px",
          borderRadius: 8,
          border: `1px solid ${LINE}`,
          background: "#fff",
          color: INK,
          fontSize: 12.5,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <span style={{ color: MUTED }}>{label}:</span>
        <span style={{ textTransform: "capitalize" }}>{sel?.label}</span>
        <Icon.chevDown s={12} />
      </button>
      {menuOpen ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            background: "#fff",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.08)",
            padding: 4,
            minWidth: 180,
            animation: "popIn .12s ease",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setMenuOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "none",
                background: opt.value === value ? SURFACE : "transparent",
                color: INK,
                fontSize: 12.5,
                cursor: "pointer",
                textAlign: "left",
                textTransform: "capitalize",
              }}
            >
              {opt.value === value ? <Icon.check s={12} /> : <span style={{ width: 12 }} />}
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        minWidth: 32,
        height: 32,
        padding: "0 10px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        border: `1px solid ${active ? INK : LINE}`,
        background: active ? INK : "#fff",
        color: disabled ? MUTED_2 : active ? "#fff" : INK,
        opacity: disabled ? 0.5 : 1,
        transition: "all .12s",
      }}
    >
      {children}
    </button>
  );
}

export function HistoryTable({ rows, onRowClick }: { rows: InterviewRow[]; onRowClick: (row: InterviewRow) => void }) {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [sort, setSort] = React.useState<HistorySort>({ key: "date", dir: "desc" });

  const types = React.useMemo(() => ["all", ...new Set(rows.map((r) => r.type))], [rows]);
  const statuses = ["all", "completed", "no-show", "abandoned", "in-progress"] as const;

  const filtered = React.useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => r.candidate.toLowerCase().includes(q) || r.role.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }
    if (type !== "all") out = out.filter((r) => r.type === type);
    if (status !== "all") out = out.filter((r) => r.status === status);
    out = [...out].sort((a, b) => {
      const k = sort.key;
      const av = a[k];
      const bv = b[k];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, search, type, status, sort]);

  React.useEffect(() => {
    setPage(1);
  }, [search, type, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${LINE}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 22px 16px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, letterSpacing: "-0.005em" }}>Interview history</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
              Second-precision credit usage at 1 credit/min across {rows.length} interviews. Click any row for full breakdown.
            </div>
          </div>
          <button
            type="button"
            className="ghost-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${LINE}`,
              background: "#fff",
              color: INK,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Icon.download s={13} /> Export CSV
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 11px",
              border: `1px solid ${LINE}`,
              borderRadius: 8,
              background: "#fff",
              flex: "0 1 280px",
            }}
          >
            <Icon.search s={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate, role, or ID…"
              style={{
                border: "none",
                outline: "none",
                fontSize: 13,
                fontFamily: "inherit",
                flex: 1,
                background: "transparent",
                color: INK,
                minWidth: 0,
              }}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", padding: 0, display: "flex" }}
              >
                <Icon.close s={14} />
              </button>
            ) : null}
          </div>

          <FilterSelect label="Type" value={type} onChange={setType} options={types.map((t) => ({ value: t, label: t === "all" ? "All types" : t }))} />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={statuses.map((s) => ({
              value: s,
              label: s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1).replace("-", " "),
            }))}
          />

          <FilterSelect
            label="Date"
            value="30d"
            onChange={() => {}}
            options={[
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
              { value: "90d", label: "Last 90 days" },
              { value: "all", label: "All time" },
            ]}
          />

          <div style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>
            <span style={{ color: INK, fontWeight: 600 }}>{filtered.length}</span> result{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1.4fr 1fr .9fr .9fr 1fr 1fr 80px",
          gap: 12,
          padding: "12px 22px",
          borderBottom: `1px solid ${LINE}`,
          background: SURFACE,
          fontSize: 11,
        }}
      >
        <HistorySortHead k="candidate" sort={sort} setSort={setSort}>
          Candidate
        </HistorySortHead>
        <HistorySortHead k="role" sort={sort} setSort={setSort}>
          Role
        </HistorySortHead>
        <HistorySortHead k="type" sort={sort} setSort={setSort}>
          Type
        </HistorySortHead>
        <HistorySortHead k="durationSec" sort={sort} setSort={setSort}>
          Duration
        </HistorySortHead>
        <HistorySortHead k="credits" sort={sort} setSort={setSort}>
          Credits
        </HistorySortHead>
        <HistorySortHead k="cost" sort={sort} setSort={setSort}>
          Cost
        </HistorySortHead>
        <HistorySortHead k="date" sort={sort} setSort={setSort}>
          Date
        </HistorySortHead>
        <div />
      </div>

      <div>
        {pageRows.length === 0 ? (
          <div style={{ padding: "60px 22px", textAlign: "center", color: MUTED, fontSize: 13 }}>No interviews match these filters.</div>
        ) : null}
        {pageRows.map((row) => (
          <div
            key={row.id}
            className="row-hover"
            onClick={() => onRowClick(row)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick(row);
              }
            }}
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1.4fr 1fr .9fr .9fr 1fr 1fr 80px",
              gap: 12,
              padding: "14px 22px",
              borderBottom: `1px solid ${LINE_2}`,
              fontSize: 13,
              alignItems: "center",
              cursor: "pointer",
              transition: "background .1s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <Avatar name={row.candidate} size={28} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: INK,
                    fontWeight: 600,
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.candidate}
                </div>
                <div style={{ color: MUTED_2, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>{row.id}</div>
              </div>
            </div>
            <div style={{ color: INK_2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.role}</div>
            <div>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  padding: "3px 8px",
                  borderRadius: 5,
                  background: SURFACE,
                  color: INK_3,
                  border: `1px solid ${LINE}`,
                }}
              >
                {row.type}
              </span>
            </div>
            <div style={{ color: INK_2, fontVariantNumeric: "tabular-nums" }}>{fmtDuration(row.durationSec)}</div>
            <div style={{ color: INK, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {row.credits === 0 ? <span style={{ color: MUTED }}>—</span> : row.credits.toFixed(2)}
            </div>
            <div style={{ color: INK_2, fontVariantNumeric: "tabular-nums" }}>
              {row.cost === 0 ? <span style={{ color: MUTED }}>—</span> : `$${row.cost.toFixed(2)}`}
            </div>
            <div style={{ color: MUTED, fontSize: 12.5 }}>{fmtDate(row.date)}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              <StatusPill status={row.status} />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 22px",
          borderTop: `1px solid ${LINE}`,
        }}
      >
        <div style={{ fontSize: 12.5, color: MUTED }}>
          Page{" "}
          <span style={{ color: INK, fontWeight: 600 }}>{page}</span> of <span style={{ color: INK, fontWeight: 600 }}>{totalPages}</span>
          {" · "}
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <PageBtn disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <Icon.chevLeft s={14} /> Prev
          </PageBtn>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5)
            .map((pNum) => (
              <PageBtn key={pNum} active={pNum === page} onClick={() => setPage(pNum)}>
                {pNum}
              </PageBtn>
            ))}
          <PageBtn disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next <Icon.chevRight s={14} />
          </PageBtn>
        </div>
      </div>
    </div>
  );
}

function DetailCell({
  label,
  value,
  top,
  divider,
}: {
  label: string;
  value: React.ReactNode;
  top?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderTop: top ? `1px solid ${LINE_2}` : "none",
        borderLeft: divider ? `1px solid ${LINE_2}` : "none",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 13.5, color: INK, fontWeight: 500, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function ArtifactRow({ icon: I, label, sub }: { icon: (p: IconProps) => React.ReactElement; label: string; sub: string }) {
  return (
    <button
      type="button"
      className="row-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${LINE}`,
        background: "#fff",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: SURFACE,
          color: INK_2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <I s={14} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: INK }}>{label}</div>
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{sub}</div>
      </div>
      <Icon.external s={13} />
    </button>
  );
}

export function RowDetailPanel({ row, onClose }: { row: InterviewRow | null; onClose: () => void }) {
  if (!row) return null;
  const totalSec = row.durationSec;
  const safeSec = Math.max(totalSec, 1);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,.32)",
        zIndex: 40,
        animation: "fadeIn .14s ease",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 460,
          background: "#fff",
          boxShadow: "-12px 0 40px rgba(0,0,0,.12)",
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight .22s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: MUTED, fontFamily: "JetBrains Mono, monospace", marginBottom: 6 }}>{row.id}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: INK, letterSpacing: "-0.01em" }}>{row.candidate}</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{row.role}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: MUTED,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon.close s={16} />
          </button>
        </div>

        <div className="scroll-clean" style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <StatusPill status={row.status} />
            <span style={{ fontSize: 12, color: MUTED }}>{fmtDate(row.date)}</span>
          </div>

          <div
            style={{
              padding: 18,
              borderRadius: 12,
              background: ORANGE_TINT,
              border: `1px solid ${ORANGE_SOFT}`,
              marginBottom: 22,
            }}
          >
            <Eyebrow color={ORANGE_DEEP}>Charged</Eyebrow>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: INK,
                  letterSpacing: "-0.025em",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {row.credits.toFixed(2)}
              </span>
              <span style={{ fontSize: 13, color: MUTED }}>credits</span>
              <span style={{ fontSize: 13, color: MUTED, marginLeft: "auto" }}>≈ ${row.cost.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: MUTED_2, marginTop: 8, fontFamily: "JetBrains Mono, monospace" }}>
              {fmtDuration(totalSec)} × 1/min = {row.credits.toFixed(2)} credits
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 0,
              marginBottom: 22,
              border: `1px solid ${LINE}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <DetailCell label="Interview type" value={row.type} />
            <DetailCell label="Duration" value={fmtDuration(totalSec)} divider />
            <DetailCell label="Interviewer" value={row.interviewer} top />
            <DetailCell label="Date" value={fmtDate(row.date).split(",")[0]} top divider />
          </div>

          <Eyebrow>Second-precision breakdown</Eyebrow>
          <div style={{ marginTop: 14, padding: 16, border: `1px solid ${LINE}`, borderRadius: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11.5,
                color: MUTED,
                marginBottom: 10,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              <span>00:00</span>
              <span>{fmtDuration(totalSec)}</span>
            </div>
            <div
              style={{
                height: 28,
                background: SURFACE,
                borderRadius: 6,
                position: "relative",
                overflow: "hidden",
                border: `1px solid ${LINE}`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(90deg, ${ORANGE_SOFT}, ${ORANGE})`,
                }}
              />
              {Array.from({ length: Math.floor(totalSec / 60) + 1 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${((i * 60) / safeSec) * 100}%`,
                    width: 1,
                    background: "rgba(255,255,255,.4)",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, marginTop: 10 }}>
              <span>0.00 credits</span>
              <span style={{ color: INK, fontWeight: 600 }}>{row.credits.toFixed(2)} credits</span>
            </div>
          </div>

          {row.recording || row.transcript ? (
            <>
              <div style={{ marginTop: 22 }}>
                <Eyebrow>Artifacts</Eyebrow>
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {row.recording ? <ArtifactRow icon={Icon.play} label="Recording" sub={`${fmtDuration(totalSec)} · MP4`} /> : null}
                {row.transcript ? <ArtifactRow icon={Icon.doc} label="Transcript" sub="PDF · auto-generated" /> : null}
              </div>
            </>
          ) : null}
        </div>

        <div style={{ padding: 18, borderTop: `1px solid ${LINE}`, display: "flex", gap: 8 }}>
          <button
            type="button"
            className="ghost-btn"
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 9,
              border: `1px solid ${LINE}`,
              background: "#fff",
              color: INK,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon.download s={13} /> Invoice
          </button>
          <button
            type="button"
            className="ink-btn"
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 9,
              border: "none",
              background: INK,
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
            Open interview <Icon.external s={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
