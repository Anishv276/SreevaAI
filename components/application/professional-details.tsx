"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD"];

function InlineCurrencySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    return (
        <div ref={ref} className="relative flex-shrink-0">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="h-12 px-3 flex items-center gap-1 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-orange-200 transition-all text-xs font-black text-gray-700"
            >
                {value} <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden w-24">
                    {CURRENCIES.map(c => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => { onChange(c); setOpen(false); }}
                            className={`w-full px-3 py-2 text-xs font-bold text-left transition-all hover:bg-orange-50 hover:text-[#F97316] ${value === c ? "text-[#F97316] bg-orange-50/50" : "text-gray-700"}`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function parseCTC(raw: string): { amount: string; currency: string } {
    const parts = raw?.split("||") || [];
    return { amount: parts[0] || "", currency: parts[1] || "INR" };
}

function formatCTC(amount: string, currency: string): string {
    return amount ? `${amount}||${currency}` : "";
}

function ExperienceCounter({
    value,
    onChange,
    inputClass,
}: {
    value: string | number;
    onChange: (v: string) => void;
    inputClass: string;
}) {
    const numericValue = Number.parseFloat(String(value));
    const safeValue = Number.isNaN(numericValue) ? 0 : Math.max(0, numericValue);

    const adjust = (delta: number) => {
        const next = Math.max(0, safeValue + delta);
        onChange(Number.isInteger(next) ? String(next) : String(next));
    };

    return (
        <div className="flex h-12 items-center rounded-2xl border border-gray-100 bg-gray-50/30 shadow-sm hover:border-orange-300 hover:shadow-md transition-all duration-150 overflow-hidden">
            <button
                type="button"
                onClick={() => adjust(-1)}
                className="flex h-full w-12 items-center justify-center text-gray-500 hover:bg-orange-50 hover:text-[#F97316] transition-colors duration-100 text-xl font-light flex-shrink-0 border-r border-gray-100"
                aria-label="Decrease experience"
            >
                -
            </button>
            <Input
                id="experience"
                type="number"
                min={0}
                step="any"
                placeholder="e.g. 5"
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                onWheel={(e) => {
                    e.currentTarget.blur();
                }}
                className={cn(
                    inputClass,
                    "h-full rounded-none border-0 bg-transparent text-center text-[15px] font-bold focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                )}
            />
            <button
                type="button"
                onClick={() => adjust(1)}
                className="flex h-full w-12 items-center justify-center text-gray-500 hover:bg-orange-50 hover:text-[#F97316] transition-colors duration-100 text-xl font-light flex-shrink-0 border-l border-gray-100"
                aria-label="Increase experience"
            >
                +
            </button>
        </div>
    );
}

function CTCInput({ label, id, value, onChange, inputClass }: { label: string; id: string; value: string; onChange: (v: string) => void; inputClass: string; }) {
    const { amount, currency } = parseCTC(value);
    const placeholder = currency === "INR" ? "e.g. 12 LPA INR" : `e.g. 120,000`;
    const suffix = currency === "INR" ? "LPA INR" : currency;

    return (
        <div className="space-y-3">
            <Label htmlFor={id} className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">
                {label} <span className="text-[#F97316] font-black text-[9px] ml-1 normal-case tracking-normal">{currency === "INR" ? "LPA INR" : currency}</span>
            </Label>
            <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                    <Input
                        id={id}
                        type="text"
                        placeholder={placeholder}
                        value={amount}
                        onChange={(e) => onChange(formatCTC(e.target.value, currency))}
                        className={cn(inputClass, "pr-14")}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300 uppercase tracking-widest pointer-events-none">
                        {suffix}
                    </span>
                </div>
                <InlineCurrencySelect value={currency} onChange={(c) => onChange(formatCTC(amount, c))} />
            </div>
        </div>
    );
}

export function ProfessionalDetails({ 
    formData, 
    updateFormData,
    isAnalyzing 
}: { 
    formData: any, 
    updateFormData: (data: any) => void,
    isAnalyzing?: boolean
}) {
    const inputClass = "h-12 rounded-2xl border-gray-100 bg-gray-50/30 px-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300";

    return (
        <div className="space-y-10 animate-in-fade">
            <div className="space-y-3">
                <Label htmlFor="experience" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Total Experience (Years) *</Label>
                <ExperienceCounter
                    value={formData.experience || formData.experienceYears?.toString() || ""}
                    onChange={(val) => {
                        const parsed = parseFloat(val);
                        updateFormData({ experience: val, experienceYears: isNaN(parsed) ? null : parsed });
                    }}
                    inputClass={cn(inputClass, isAnalyzing && !formData.experience && "bg-orange-50/50")}
                />
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                    <Label htmlFor="current-company" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Current Company</Label>
                    <Input
                        id="current-company"
                        placeholder="Company Name"
                        value={formData.currentCompany || ""}
                        onChange={(e) => updateFormData({ currentCompany: e.target.value })}
                        className={cn(inputClass, isAnalyzing && !formData.currentCompany && "bg-orange-50/50")}
                    />
                </div>
                <CTCInput
                    label="Current CTC"
                    id="ctc"
                    value={formData.ctc || ""}
                    onChange={(v) => updateFormData({ ctc: v })}
                    inputClass={inputClass}
                />
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                    <Label htmlFor="notice-period" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Notice Period *</Label>
                    <Select
                        value={formData.noticePeriod}
                        onValueChange={(value) => updateFormData({ noticePeriod: value })}
                    >
                        <SelectTrigger className="h-12 rounded-2xl border-gray-100 bg-gray-50/30 text-sm font-medium focus:ring-4 focus:ring-orange-500/10 transition-all">
                            <SelectValue placeholder="Select Notice Period" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-orange-100">
                            <SelectItem value="immediate" className="rounded-xl focus:bg-orange-50">Immediate</SelectItem>
                            <SelectItem value="15" className="rounded-xl focus:bg-orange-50">15 Days</SelectItem>
                            <SelectItem value="30" className="rounded-xl focus:bg-orange-50">30 Days</SelectItem>
                            <SelectItem value="60" className="rounded-xl focus:bg-orange-50">60 Days</SelectItem>
                            <SelectItem value="90" className="rounded-xl focus:bg-orange-50">90 Days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <CTCInput
                    label="Expected CTC *"
                    id="expected-ctc"
                    value={formData.expectedCtc || ""}
                    onChange={(v) => updateFormData({ expectedCtc: v })}
                    inputClass={inputClass}
                />
            </div>
        </div>
    );
}
