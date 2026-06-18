"use client";
import React from "react";
import { Icon } from "./billing-icons";
import { Avatar, StatusPill } from "./billing-primitives";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { fmtDate } from "./format";
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
export function HistoryTable({
  rows,
  loading = false,
  showCreditsUsed = false,
}: {
  rows: InterviewRow[];
  loading?: boolean;
  showCreditsUsed?: boolean;
}) {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [dateRange, setDateRange] = React.useState<DateRange>({ type: "month" });
  const [sort, setSort] = React.useState<HistorySort>({ key: "date", dir: "desc" });
  const statuses = ["all", "completed", "no-show", "abandoned", "in-progress", "pending"] as const;
  const isInDateRange = React.useCallback(
    (dateIso: string) => {
      const d = new Date(dateIso);
      if (Number.isNaN(d.getTime())) return false;
      const now = new Date();
      const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
      const compareYmd = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      if (dateRange.type === "all") return true;
      if (dateRange.type === "today") return compareYmd(d, now);
      if (dateRange.type === "week") {
        const from = startOfDay(now);
        from.setDate(from.getDate() - 7);
        return d >= from;
      }
      if (dateRange.type === "month") {
        const from = startOfDay(now);
        from.setMonth(from.getMonth() - 1);
        return d >= from;
      }
      if (dateRange.type === "custom") {
        const from = new Date(dateRange.from);
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999);
        return d >= from && d <= to;
      }
      return true;
    },
    [dateRange]
  );
  const filtered = React.useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => r.candidate.toLowerCase().includes(q) || r.role.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }
    if (status !== "all") out = out.filter((r) => r.status === status);
    out = out.filter((r) => isInDateRange(r.date));
    out = [...out].sort((a, b) => {
      const k = sort.key;
      const av = a[k] ?? "";
      const bv = b[k] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, search, status, sort, isInDateRange]);
  React.useEffect(() => {
    setPage(1);
  }, [search, status, dateRange]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const gridCols = showCreditsUsed ? "1.6fr 1.4fr .9fr .9fr 1fr .85fr 120px" : "1.6fr 1.4fr .9fr 1fr .85fr 120px";
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
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>Interview consumption across {rows.length} completed sessions.</div>
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
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={statuses.map((s) => ({
              value: s,
              label: s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1).replace("-", " "),
            }))}
          />
          <DateFilter value={dateRange} onChange={setDateRange} />
          <div style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>
            <span style={{ color: INK, fontWeight: 600 }}>{filtered.length}</span> result{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
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
        <HistorySortHead k="interviews" sort={sort} setSort={setSort}>
          Interviews
        </HistorySortHead>
        {showCreditsUsed ? (
          <HistorySortHead k="creditsUsed" sort={sort} setSort={setSort}>
            Credits used
          </HistorySortHead>
        ) : null}
        <HistorySortHead k="date" sort={sort} setSort={setSort}>
          Date
        </HistorySortHead>
        <HistorySortHead k="time" sort={sort} setSort={setSort}>
          Duration
        </HistorySortHead>
        <HistorySortHead k="status" sort={sort} setSort={setSort}>
          Status
        </HistorySortHead>
      </div>
      <div>
        {loading ? (
          <div style={{ padding: "60px 22px", textAlign: "center", color: MUTED, fontSize: 13 }}>Loading live billing history…</div>
        ) : pageRows.length === 0 ? (
          <div style={{ padding: "60px 22px", textAlign: "center", color: MUTED, fontSize: 13 }}>No interviews match these filters.</div>
        ) : null}
        {pageRows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: 12,
              padding: "14px 22px",
              borderBottom: `1px solid ${LINE_2}`,
              fontSize: 13,
              alignItems: "center",
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
            <div style={{ color: INK, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.interviews.toLocaleString()}</div>
            {showCreditsUsed ? (
              <div style={{ color: INK, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {row.creditsUsed === 0 ? <span style={{ color: MUTED }}>—</span> : row.creditsUsed.toFixed(2)}
              </div>
            ) : null}
            <div style={{ color: MUTED, fontSize: 12.5 }}>{fmtDate(row.date)}</div>
            <div style={{ color: MUTED, fontSize: 12.5 }}>{row.time ?? "—"}</div>
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
          Page <span style={{ color: INK, fontWeight: 600 }}>{page}</span> of <span style={{ color: INK, fontWeight: 600 }}>{totalPages}</span>
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
