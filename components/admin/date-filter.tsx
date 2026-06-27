"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, Check, Clock, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { PremiumDatePicker } from "@/components/ui/premium-date-picker";
export type DateRange =
    | { type: "all" }
    | { type: "today" }
    | { type: "week" }
    | { type: "month" }
    | { type: "custom"; from: string; to: string };
interface DateFilterProps {
    value: DateRange;
    onChange: (range: DateRange) => void;
}
const PRESETS = [
    { key: "all", label: "All Dates", icon: CalendarDays },
    { key: "today", label: "Today", icon: Clock },
    { key: "week", label: "This Week", icon: CalendarDays },
    { key: "month", label: "This Month", icon: Calendar },
] as const;
export function DateFilter({ value, onChange }: DateFilterProps) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<"presets" | "custom">("presets");
    const [rect, setRect] = useState<DOMRect | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const handleOpen = () => {
        if (!open && triggerRef.current) {
            setRect(triggerRef.current.getBoundingClientRect());
        }
        setOpen(o => !o);
        if (!open) {
            setView(value.type === "custom" ? "custom" : "presets");
            if (value.type === "custom") {
                setCustomFrom(value.from);
                setCustomTo(value.to);
            }
        }
    };
    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const isInsidePicker = target.closest('[data-picker-portal="true"]');
            if (!triggerRef.current?.contains(target) &&
                !menuRef.current?.contains(target) &&
                !isInsidePicker) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);
    const getLabel = () => {
        if (value.type === "custom") return `${value.from} – ${value.to}`;
        return PRESETS.find(p => p.key === value.type)?.label || "All Dates";
    };
    const dropdown = open && rect ? (
        <div
            ref={menuRef}
            style={{
                position: "fixed",
                top: rect.bottom + 8,
                left: Math.max(8, rect.right - 260),
                width: 260,
                zIndex: 9990,
            }}
            className="rounded-2xl border border-gray-100 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
            {view === "presets" ? (
                <div className="p-2 space-y-1">
                    {PRESETS.map((p) => (
                        <button
                            key={p.key}
                            onClick={() => { onChange({ type: p.key }); setOpen(false); }}
                            className={cn(
                                "flex items-center justify-between w-full rounded-xl px-4 py-3 text-[13.5px] font-bold transition-all duration-150",
                                value.type === p.key
                                    ? "bg-violet-50 text-violet-600"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <p.icon className={cn("h-4 w-4", value.type === p.key ? "text-violet-600" : "text-gray-400")} />
                                <span>{p.label}</span>
                            </div>
                            {value.type === p.key && <Check className="h-4 w-4 text-violet-600" />}
                        </button>
                    ))}
                    <div className="h-px bg-gray-50 my-1 mx-2" />
                    <button
                        onClick={() => setView("custom")}
                        className={cn(
                            "flex items-center justify-between w-full rounded-xl px-4 py-3 text-[13.5px] font-bold transition-all duration-150",
                            value.type === "custom"
                                ? "bg-violet-50 text-violet-600"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <Calendar className={cn("h-4 w-4", value.type === "custom" ? "text-violet-600" : "text-gray-400")} />
                            <span>Custom Range</span>
                        </div>
                        <ChevronDown className="h-4 w-4 -rotate-90 text-gray-300" />
                    </button>
                </div>
            ) : (
                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <button onClick={() => setView("presets")} className="text-[11px] font-semibold text-violet-600 uppercase tracking-widest hover:opacity-70">← Presets</button>
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Custom Scope</span>
                    </div>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Start Point</p>
                            <PremiumDatePicker
                                value={customFrom}
                                onChange={setCustomFrom}
                                placeholder="From Date"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">End Point</p>
                            <PremiumDatePicker
                                value={customTo}
                                onChange={setCustomTo}
                                placeholder="To Date"
                            />
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            if (customFrom && customTo) {
                                onChange({ type: "custom", from: customFrom, to: customTo });
                                setOpen(false);
                            }
                        }}
                        disabled={!customFrom || !customTo}
                        className="btn-shimmer w-full h-10 text-white font-semibold text-xs uppercase tracking-wider rounded-xl disabled:opacity-30 transition-all"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                    >
                        Apply Filter
                    </button>
                </div>
            )}
        </div>
    ) : null;
    const isActive = value.type !== "all";
    return (
        <div className="relative">
            <button
                ref={triggerRef}
                onClick={handleOpen}
                className={cn(
                    "flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold transition-all duration-150 border focus:outline-none",
                    isActive
                        ? "text-white shadow-sm border-transparent"
                        : "text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600 bg-white"
                )}
                style={isActive ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" } : undefined}
            >
                <Calendar className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">{getLabel()}</span>
                <ChevronDown className={cn("h-3 w-3 ml-0.5 transition-transform duration-200", open && "rotate-180")} />
            </button>
            {typeof window !== "undefined" && createPortal(dropdown, document.body)}
        </div>
    );
}
