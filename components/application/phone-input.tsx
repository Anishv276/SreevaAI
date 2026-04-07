"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { countryCodes } from "@/lib/countries";

interface PhoneInputProps {
    value: string | undefined;
    onChange: (value: string) => void;
    className?: string;
}

export function PhoneInput({ value = "", onChange, className }: PhoneInputProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [rect, setRect] = useState<DOMRect | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Initial parsing of value to find selected country
    // We assume the stored value might have a code + number
    // For simplicity, we'll track code and number separately in the component state
    const [selectedCode, setSelectedCode] = useState("+91");
    const [phoneNumber, setPhoneNumber] = useState("");

    // Sync from props if needed, but phone input usually controls its own state for the prefix
    useEffect(() => {
        if (value && !phoneNumber) {
            // Very basic heuristic to split code and number
            const found = countryCodes
                .sort((a, b) => b.code.length - a.code.length)
                .find(c => value.startsWith(c.code));
            
            if (found) {
                setSelectedCode(found.code);
                setPhoneNumber(value.slice(found.code.length));
            } else {
                setPhoneNumber(value);
            }
        }
    }, [value]);

    const filtered = countryCodes.filter(c => 
        c.country.toLowerCase().includes(search.toLowerCase()) || 
        c.code.includes(search)
    );

    const handleOpen = () => {
        if (!open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
        setOpen(!open);
        if (!open) setSearch("");
    };

    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => {
            if (!triggerRef.current?.contains(e.target as Node) && !dropdownRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);

    const handlePhoneChange = (newNumber: string) => {
        const clean = newNumber.replace(/\D/g, "");
        setPhoneNumber(clean);
        onChange(`${selectedCode}${clean}`);
    };

    const handleCodeSelect = (code: string) => {
        setSelectedCode(code);
        onChange(`${code}${phoneNumber}`);
        setOpen(false);
    };

    const dropdown = open && rect ? (
        <div
            ref={dropdownRef}
            style={{ 
                position: "fixed", 
                top: rect.bottom + 6, 
                left: rect.left, 
                width: 320, 
                zIndex: 9999 
            }}
            className="rounded-2xl border border-gray-100 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden animate-in fade-in zoom-in duration-200"
        >
            <div className="p-3 border-b border-gray-50 bg-gray-50/50">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input 
                        autoFocus
                        placeholder="Search countries or codes..."
                        className="w-full h-10 pl-9 pr-4 text-xs font-bold bg-white border border-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-200 outline-none transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full">
                {filtered.length > 0 ? (
                    filtered.map(c => (
                        <button
                            key={c.iso + c.code}
                            type="button"
                            onClick={() => handleCodeSelect(c.code)}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-orange-50/50 group transition-all text-left mb-1 last:mb-0"
                        >
                            <div className="flex flex-col gap-0.5">
                                <span className={cn(
                                    "text-[11px] font-inter font-black tracking-tight transition-colors",
                                    selectedCode === c.code ? "text-[#F97316]" : "text-gray-900 group-hover:text-gray-900"
                                )}>
                                    {c.country}
                                </span>
                                <span className="text-[9px] font-inter font-black text-gray-400 uppercase tracking-widest">{c.iso}</span>
                            </div>
                            <span className={cn(
                                "text-xs font-inter font-black px-2 py-1 rounded-lg transition-all",
                                selectedCode === c.code ? "bg-[#F97316] text-white" : "text-gray-400 group-hover:text-[#F97316] group-hover:bg-orange-100"
                            )}>
                                {c.code}
                            </span>
                        </button>
                    ))
                ) : (
                    <div className="py-8 text-center">
                        <p className="text-[10px] font-inter font-black text-gray-400 uppercase tracking-[0.2em]">No Countries Found</p>
                    </div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div className={cn("flex gap-3", className)}>
            <div className="relative">
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={handleOpen}
                    className={cn(
                        "h-12 px-4 rounded-2xl border border-gray-100 flex items-center justify-between gap-3 bg-gray-50/30 hover:border-orange-200 transition-all min-w-[100px]",
                        open && "border-orange-500 ring-4 ring-orange-500/10"
                    )}
                >
                    <span className="text-sm font-inter font-black text-gray-900">{selectedCode}</span>
                    <ChevronDown className={cn("h-4 w-4 text-gray-300 transition-transform duration-200", open && "rotate-180 text-[#F97316]")} />
                </button>
                {typeof window !== "undefined" && createPortal(dropdown, document.body)}
            </div>

            <div className="relative flex-1">
                <input
                    type="tel"
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="h-12 w-full font-inter rounded-2xl border border-gray-100 bg-gray-50/30 px-5 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300 outline-none"
                />
            </div>
        </div>
    );
}
