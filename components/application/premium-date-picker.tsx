"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/*  Premium Month/Year Picker  */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface PremiumMonthPickerProps {
    label: string;
    value: string; // YYYY-MM
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function PremiumMonthPicker({ label, value, onChange, placeholder = "Select Month", disabled }: PremiumMonthPickerProps) {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    const today = new Date();
    const currentYear = today.getFullYear();

    // Parse value (YYYY-MM)
    const [year, month] = value ? value.split("-").map(Number) : [currentYear, today.getMonth() + 1];
    const [viewYear, setViewYear] = useState(year);

    const handleOpen = () => {
        if (disabled) return;
        if (!open && triggerRef.current) {
            setRect(triggerRef.current.getBoundingClientRect());
        }
        setOpen(o => !o);
    };

    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => {
            if (!triggerRef.current?.contains(e.target as Node) &&
                !pickerRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const update = () => { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); };
        window.addEventListener("scroll", update, true);
        return () => window.removeEventListener("scroll", update, true);
    }, [open]);

    const selectMonth = (mIndex: number) => {
        const iso = `${viewYear}-${String(mIndex + 1).padStart(2, "0")}`;
        onChange(iso);
        setOpen(false);
    };

    const displayValue = value ? `${MONTHS_SHORT[month - 1]} ${year}` : "";

    const picker = open && rect ? (
        <div
            ref={pickerRef}
            style={{
                position: "fixed",
                top: rect.bottom + 6,
                left: rect.left,
                width: Math.max(rect.width, 240),
                zIndex: 9999,
            }}
            className="rounded-2xl border border-gray-100 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden animate-in fade-in zoom-in duration-200"
        >
            <div className="p-4 bg-white">
                {/* Year Header */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50">
                    <button type="button" onClick={() => setViewYear(v => v - 1)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-inter font-black text-gray-900 tracking-widest">{viewYear}</span>
                    <button type="button" onClick={() => setViewYear(v => v + 1)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors">
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                {/* Months Grid */}
                <div className="grid grid-cols-3 gap-2">
                    {MONTHS_SHORT.map((m, i) => {
                        const isSelected = value === `${viewYear}-${String(i + 1).padStart(2, "0")}`;
                        return (
                            <button
                                key={m}
                                type="button"
                                onClick={() => selectMonth(i)}
                                className={`h-10 rounded-xl text-[11px] font-inter font-black uppercase tracking-widest transition-all ${
                                    isSelected 
                                        ? "bg-gray-900 text-white shadow-lg" 
                                        : "text-gray-500 hover:bg-orange-50 hover:text-[#F97316]"
                                }`}
                            >
                                {m}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    ) : null;

    return (
        <div className="space-y-3">
            <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">{label}</Label>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={handleOpen}
                className={`flex h-12 w-full items-center justify-between rounded-2xl border border-gray-100 px-4 text-sm font-medium transition-all focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300 ${
                    disabled ? "bg-gray-50 text-gray-300 opacity-50 cursor-not-allowed" : "bg-gray-50/30 hover:border-orange-200"
                }`}
            >
                <div className="flex items-center gap-3">
                    <Calendar className={`h-4 w-4 ${displayValue ? "text-[#F97316]" : "text-gray-300"}`} />
                    <span className={cn("font-inter", displayValue ? "text-gray-900 font-bold" : "text-gray-400")}>
                        {displayValue || placeholder}
                    </span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-300 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
            {typeof window !== "undefined" && createPortal(picker, document.body)}
        </div>
    );
}

