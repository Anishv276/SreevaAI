"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Briefcase, Users, Calendar, Laptop, Layers, Building2, ChevronDown, Check,
    ChevronLeft, ChevronRight, MapPin,
} from "lucide-react";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";

function PremiumSelect({
    label,
    icon: Icon,
    options,
    value,
    onChange,
    placeholder,
    error,
}: {
    label: string;
    icon: React.ElementType;
    options: string[];
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    error?: string;
}) {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleOpen = () => {
        if (!open && triggerRef.current) {
            setRect(triggerRef.current.getBoundingClientRect());
        }
        setOpen(o => !o);
    };

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                !triggerRef.current?.contains(e.target as Node) &&
                !dropdownRef.current?.contains(e.target as Node)
            ) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Update position on scroll so dropdown stays anchored, close on resize
    useEffect(() => {
        if (!open) return;
        let timeout: ReturnType<typeof setTimeout>;
        const updatePos = () => {
            if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
        };
        const closeOnResize = () => setOpen(false);
        // Delay attachment slightly so we don't catch the layout shift from portal render
        timeout = setTimeout(() => {
            window.addEventListener("scroll", updatePos, true);
            window.addEventListener("resize", closeOnResize);
        }, 100);
        return () => {
            clearTimeout(timeout);
            window.removeEventListener("scroll", updatePos, true);
            window.removeEventListener("resize", closeOnResize);
        };
    }, [open]);

    const dropdown = open && rect ? (
        <div
            ref={dropdownRef}
            style={{
                position: "fixed",
                top: rect.bottom + 8,
                left: rect.left,
                width: rect.width,
                zIndex: 9999,
            }}
            className="rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden"
        >
            <div className="p-1.5 max-h-[180px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-300">
                {options.map(opt => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => { onChange(opt); setOpen(false); }}
                        className="flex items-center justify-between w-full rounded-lg px-4 py-2.5 text-[14px] text-gray-900 hover:bg-orange-50 hover:text-[#F97316] transition-colors duration-100 text-left"
                    >
                        <span className="font-medium">{opt}</span>
                        {value === opt && <Check className="h-4 w-4 text-[#F97316]" />}
                    </button>
                ))}
            </div>
        </div>
    ) : null;

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                <Icon className="h-3 w-3 text-[#F97316]" />
                {label}
                <span className="text-[#F97316] ml-0.5">*</span>
            </Label>
            <button
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                className={cn(
                    "relative flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-[14px] shadow-sm transition-all duration-150 focus:outline-none focus:ring-2",
                    error 
                        ? "border-red-500 ring-red-500/10 focus:ring-red-500/30 focus:border-red-500" 
                        : "border-gray-200 hover:border-orange-300 hover:shadow-md focus:ring-[#F97316]/30 focus:border-[#F97316]"
                )}
            >
                <span className={value ? "text-gray-900 font-medium" : "text-gray-400"}>
                    {value || placeholder}
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open ? "rotate-180 text-[#F97316]" : "text-gray-400")} />
            </button>
            {error && <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1">{error}</p>}
            {typeof window !== "undefined" && createPortal(dropdown, document.body)}
        </div>
    );
}


/* ── Premium text input ──────────────────────────────────── */
function PremiumInput({
    label,
    icon: Icon,
    error,
    ...props
}: {
    label: string;
    icon: React.ElementType;
    error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                <Icon className="h-3 w-3 text-[#F97316]" />
                {label}
                <span className="text-[#F97316] ml-0.5">*</span>
            </Label>
            <Input
                {...props}
                className={cn(
                    "h-10 rounded-lg bg-white px-3 text-[14px] font-medium shadow-sm transition-all duration-150 placeholder:text-gray-400 placeholder:font-normal",
                    error 
                        ? "border-red-500 focus-visible:ring-red-500/30 focus-visible:border-red-500" 
                        : "border-gray-200 hover:border-orange-300 hover:shadow-md focus-visible:ring-[#F97316]/30 focus-visible:border-[#F97316]"
                )}
            />
            {error && <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1">{error}</p>}
        </div>
    );
}

/* ── Premium Calendar Date Picker ───────────────────────── */
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];

function PremiumDatePicker({ label, icon: Icon, id, value, onChange, error }: {
    label: string; icon: React.ElementType; id: string;
    value: string; onChange: (v: string) => void;
    error?: string;
}) {
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
            const r = triggerRef.current.getBoundingClientRect();
            setRect(r);
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
    // Pad to full rows
    while (cells.length % 7 !== 0) cells.push(null);

    const selectDay = (day: number) => {
        const d = new Date(viewYear, viewMonth, day);
        d.setHours(0, 0, 0, 0);
        if (d < today) return; // disabled
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

    const CAL_HEIGHT = 320; // approximate calendar height in px

    const calendar = open && rect ? (
        <div
            ref={calRef}
            style={{
                position: "fixed",
                // Open above if not enough space below, else open below
                ...(window.innerHeight - rect.bottom > CAL_HEIGHT
                    ? { top: rect.bottom + 6 }
                    : { bottom: window.innerHeight - rect.top + 6 }),
                left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 288) - 8),
                width: Math.max(rect.width, 288),
                zIndex: 9999,
            }}
            className="rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
        >
            {/* Header — clean white */}
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

            {/* Day-of-week headers */}
            <div className="px-3 pt-3">
                <div className="grid grid-cols-7 mb-1">
                    {DAYS.map(d => (
                        <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest text-gray-400 py-1">{d}</div>
                    ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-y-1 pb-3">
                    {cells.map((day, i) => {
                        if (!day) return <div key={i} />;
                        const cellDate = new Date(viewYear, viewMonth, day);
                        cellDate.setHours(0, 0, 0, 0);
                        const isPast = cellDate < today;
                        const isToday = cellDate.getTime() === today.getTime();
                        const isSelected = parsed && cellDate.getTime() === parsed.getTime();

                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => selectDay(day)}
                                disabled={isPast}
                                className={[
                                    "h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-[13px] font-bold transition-all duration-100",
                                    isSelected
                                        ? "bg-[#F97316] text-white shadow-[0_2px_8px_rgba(249,115,22,0.4)] scale-110"
                                        : isToday
                                            ? "border-2 border-[#F97316] text-[#F97316]"
                                            : isPast
                                                ? "text-gray-300 cursor-not-allowed"
                                                : "text-gray-700 hover:bg-orange-50 hover:text-[#F97316]",
                                ].join(" ")}
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
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                <Icon className="h-3 w-3 text-[#F97316]" />
                {label}
                <span className="text-[#F97316] ml-0.5">*</span>
            </Label>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                onClick={handleOpen}
                className={cn(
                    "relative flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-[14px] shadow-sm transition-all duration-150 focus:outline-none focus:ring-2",
                    error 
                        ? "border-red-500 ring-red-500/10 focus:ring-red-500/30 focus:border-red-500" 
                        : "border-gray-200 hover:border-orange-300 hover:shadow-md focus:ring-[#F97316]/30 focus:border-[#F97316]"
                )}
            >
                <span className={displayValue ? "text-gray-900 font-medium" : "text-gray-400"}>
                    {displayValue || "Pick a date"}
                </span>
                <Calendar className={cn("h-4 w-4 transition-colors", open ? "text-[#F97316]" : "text-gray-400")} />
            </button>
            {error && <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1">{error}</p>}
            {typeof window !== "undefined" && createPortal(calendar, document.body)}
        </div>
    );
}

/* ── Position counter ────────────────────────────────────── */
function PositionCounter({ label, icon: Icon, value, onChange, error }: { label: string; icon: React.ElementType; value: number; onChange: (v: number) => void; error?: string }) {
    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 1) onChange(val);
        else if (e.target.value === "") onChange(1); // Default to 1
    };

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                <Icon className="h-3 w-3 text-[#F97316]" />
                {label}
                <span className="text-[#F97316] ml-0.5">*</span>
            </Label>
            <div className={cn(
                "flex h-10 items-center rounded-lg border bg-white shadow-sm transition-all duration-150 overflow-hidden",
                error 
                    ? "border-red-500 ring-red-500/10" 
                    : "border-gray-200 hover:border-orange-300 hover:shadow-md"
            )}>
                <button
                    type="button"
                    onClick={() => onChange(Math.max(1, value - 1))}
                    className="flex h-full w-10 items-center justify-center text-gray-500 hover:bg-orange-50 hover:text-[#F97316] transition-colors duration-100 text-xl font-light flex-shrink-0 border-r border-gray-100"
                >
                    −
                </button>
                <input
                    type="number"
                    min="1"
                    value={value}
                    onChange={handleInput}
                    className="min-w-0 w-8 flex-1 text-center text-[15px] font-bold text-gray-900 bg-transparent border-none outline-none focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                    type="button"
                    onClick={() => onChange(value + 1)}
                    className="flex h-full w-10 items-center justify-center text-gray-500 hover:bg-orange-50 hover:text-[#F97316] transition-colors duration-100 text-xl font-light flex-shrink-0 border-l border-gray-100"
                >
                    +
                </button>
            </div>
            {error && <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1">{error}</p>}
        </div>
    );
}

/* ── Departments & options ───────────────────────────────── */
const DEPARTMENTS = [
    "Product", "Design", "Marketing",
    "Sales", "HR", "Finance", "Operations", "Legal",
];
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Freelance"];
const WORK_MODES = ["Remote", "Hybrid", "On-site"];

/* ── Main component ─────────────────────────────────────── */
interface BasicInfoProps {
    formData: any;
    updateFormData: (data: any) => void;
    isAnalyzing?: boolean;
}

export function BasicInfo({ formData, updateFormData, isAnalyzing }: BasicInfoProps) {
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    const handleChange = (field: string, value: any) => {
        updateFormData({ ...formData, [field]: value });
    };

    const handleBlur = (field: string) => {
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    const getError = (field: string) => {
        if (!touched[field]) return undefined;
        if (!formData[field] || (typeof formData[field] === 'string' && !formData[field].trim())) {
            return "This field is required";
        }
        return undefined;
    };

    return (
        <div className="space-y-6">
            {isAnalyzing && (
                <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-between animate-in-fade">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-orange-100 flex items-center justify-center">
                            <Layers className="h-5 w-5 text-[#F97316] animate-pulse" />
                        </div>
                        <div>
                            <p className="text-[13px] font-bold text-gray-900">Scanning JD in Background…</p>
                            <p className="text-[11px] text-orange-600 font-medium">Fields will auto-fill as AI extracts details</p>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Role Details ──────────────────── */}
            <section>
                <div className="flex items-center gap-3 mb-3">
                    <span className="h-6 w-1 rounded-full bg-[#F97316]" />
                    <p className="text-[14px] font-bold text-gray-900 uppercase tracking-widest">Role Details</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <PremiumInput
                        label="Job Role"
                        icon={Layers}
                        id="role"
                        value={formData.role || ""}
                        onChange={(e) => handleChange("role", e.target.value)}
                        onBlur={() => handleBlur("role")}
                        error={getError("role")}
                        placeholder="e.g. Backend Engineer"
                        required
                    />
                    <PremiumInput
                        label="Drive Title"
                        icon={Briefcase}
                        id="title"
                        value={formData.title || ""}
                        onChange={(e) => handleChange("title", e.target.value)}
                        onBlur={() => handleBlur("title")}
                        error={getError("title")}
                        placeholder="e.g. Senior Backend Engineer Drive"
                        required
                    />
                </div>
            </section>

            {/* ── Team & Work Mode ──────────────── */}
            <section>
                <div className="flex items-center gap-3 mb-3">
                    <span className="h-6 w-1 rounded-full bg-[#F97316]" />
                    <p className="text-[14px] font-bold text-gray-900 uppercase tracking-widest">Team &amp; Work Mode</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    <PremiumSelect
                        label="Department"
                        icon={Building2}
                        options={DEPARTMENTS}
                        value={formData.department || ""}
                        onChange={(v) => { handleChange("department", v); handleBlur("department"); }}
                        error={getError("department")}
                        placeholder="Select Department"
                    />
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                            <MapPin className="h-3 w-3 text-[#F97316]" />
                            Work Location
                            <span className="text-[#F97316] ml-0.5">*</span>
                        </Label>
                        <div className={cn("rounded-lg relative transition-all duration-150", 
                            getError("location") ? "border border-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.1)]" : "")}>
                            <LocationAutocomplete
                                value={formData.location || ""}
                                onChange={(v) => { handleChange("location", v); handleBlur("location"); }}
                                placeholder="Search location..."
                                icon={<MapPin className="h-4 w-4" />}
                            />
                        </div>
                        {getError("location") && <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1">{getError("location")}</p>}
                    </div>
                    <PremiumSelect
                        label="Work Mode"
                        icon={Laptop}
                        options={WORK_MODES}
                        value={formData.workMode || ""}
                        onChange={(v) => { handleChange("workMode", v); handleBlur("workMode"); }}
                        error={getError("workMode")}
                        placeholder="Remote / Hybrid / On-site"
                    />
                </div>
            </section>

            {/* ── Hiring Plan ───────────────────── */}
            <section>
                <div className="flex items-center gap-3 mb-3">
                    <span className="h-6 w-1 rounded-full bg-[#F97316]" />
                    <p className="text-[14px] font-bold text-gray-900 uppercase tracking-widest">Hiring Plan</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    <PremiumSelect
                        label="Employment Type"
                        icon={Briefcase}
                        options={EMPLOYMENT_TYPES}
                        value={formData.employmentType || ""}
                        onChange={(v) => { handleChange("employmentType", v); handleBlur("employmentType"); }}
                        error={getError("employmentType")}
                        placeholder="Select Type"
                    />
                    <PositionCounter
                        label="Open Positions"
                        icon={Users}
                        value={formData.positions || 1}
                        onChange={(v: number) => { handleChange("positions", v); handleBlur("positions"); }}
                        error={getError("positions")}
                    />
                    <PremiumDatePicker
                        label="Application Deadline"
                        icon={Calendar}
                        id="deadline"
                        value={formData.deadline || ""}
                        onChange={(v: string) => { handleChange("deadline", v); handleBlur("deadline"); }}
                        error={getError("deadline")}
                    />
                </div>
            </section>
        </div>
    );
}
