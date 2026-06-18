export function fmtDuration(sec: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
export function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date("2026-04-26");
  const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const isToday = ymd(d) === ymd(today);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const isYest = ymd(d) === ymd(yest);
  if (isToday) return "Today";
  if (isYest) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export function fmtTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return time;
}
