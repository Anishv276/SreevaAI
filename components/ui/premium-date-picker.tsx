"use client";
import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];
interface PremiumDatePickerProps {
    value: string; // ISO format: YYYY-MM-DD
    onChange: (date: string) => void;
    placeholder?: string;
    className?: string;
    disabledBeforeToday?: boolean;
}
export function PremiumDatePicker({
    value,
    onChange,
    placeholder = "Pick a date",
    className,
    disabledBeforeToday = false,
}: PremiumDatePickerProps) {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const calRef = useRef<HTMLDivElement>(null);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parsed = value ? new Date(value + "T00:00:00") : null;
    const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
    const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());
    const handleOpen = () => {
        if (!open && triggerRef.current) {
            setRect(triggerRef.current.getBoundingClientRect());
        }
        setOpen(o => !o);
    };
    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => {
            if (!triggerRef.current?.contains(e.target as Node) &&
                !calRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);
    // Reposition on scroll
    useEffect(() => {
        if (!open) return;
        let t: ReturnType<typeof setTimeout>;
        const update = () => { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); };
        t = setTimeout(() => window.addEventListener("scroll", update, true), 100);
        return () => { clearTimeout(t); window.removeEventListener("scroll", update, true); };
    }, [open]);
    // Build calendar grid
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const selectDay = (day: number) => {
        const d = new Date(viewYear, viewMonth, day);
        d.setHours(0, 0, 0, 0);
        if (disabledBeforeToday && d < today) return;
        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        onChange(iso);
        setOpen(false);
    };
    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };
    const displayValue = parsed
        ? parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null;
    const CAL_HEIGHT = 320;
    const calendar = open && rect ? (
        <div
            ref={calRef}
            style={{
                position: "fixed",
                ...(window.innerHeight - rect.bottom > CAL_HEIGHT
                    ? { top: rect.bottom + 6 }
                    : { bottom: window.innerHeight - rect.top + 6 }),
                left: Math.min(rect.left, window.innerWidth - 288 - 8),
                width: 288,
                zIndex: 9999,
            }}
            data-picker-portal="true"
            className="rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        >
            <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-white">
                <button type="button" onClick={prevMonth}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-black text-gray-800 tracking-wide">
                    {MONTHS[viewMonth]} {viewYear}
                </span>
                <button type="button" onClick={nextMonth}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
            <div className="px-3 pt-3">
                <div className="grid grid-cols-7 mb-1">
                    {DAYS.map(d => (
                        <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest text-gray-400 py-1">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1 pb-3">
                    {cells.map((day, i) => {
                        if (!day) return <div key={i} />;
                        const cellDate = new Date(viewYear, viewMonth, day);
                        cellDate.setHours(0, 0, 0, 0);
                        const isPast = disabledBeforeToday && cellDate < today;
                        const isToday = cellDate.getTime() === today.getTime();
                        const isSelected = parsed && cellDate.getTime() === parsed.getTime();
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => selectDay(day)}
                                disabled={isPast}
                                className={cn(
                                    "h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-[13px] font-bold transition-all duration-100",
                                    isSelected
                                        ? "bg-[#7C3AED] text-white shadow-[0_2px_8px_rgba(124,58,237,0.4)] scale-110"
                                        : isToday
                                            ? "border-2 border-[#7C3AED] text-[#7C3AED]"
                                            : isPast
                                                ? "text-gray-300 cursor-not-allowed"
                                                : "text-gray-700 hover:bg-violet-50 hover:text-[#7C3AED]"
                                )}
                            >
                                {day}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    ) : null;
    return (
        <div className={cn("relative", className)}>
            <button
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                className={cn(
                    "relative flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 text-[14px] shadow-sm hover:border-violet-300 hover:shadow-md transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED]",
                    open && "border-[#7C3AED] ring-2 ring-[#7C3AED]/30 shadow-md"
                )}
            >
                <span className={displayValue ? "text-gray-900 font-medium" : "text-gray-400"}>
                    {displayValue || placeholder}
                </span>
                <Calendar className={cn("h-4 w-4 transition-colors", open ? "text-[#7C3AED]" : "text-gray-400")} />
            </button>
            {typeof window !== "undefined" && createPortal(calendar, document.body)}
        </div>
    );
}
