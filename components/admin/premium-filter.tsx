"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumFilterOption {
    value: string;
    label: string;
    icon?: LucideIcon;
    colorClass?: string;
}

interface PremiumFilterProps {
    value: string;
    onChange: (value: string) => void;
    options: PremiumFilterOption[];
    placeholder: string;
    icon: LucideIcon;
}

export function PremiumFilter({ value, onChange, options, placeholder, icon: Icon }: PremiumFilterProps) {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const handleOpen = () => {
        if (!open && triggerRef.current) {
            setRect(triggerRef.current.getBoundingClientRect());
        }
        setOpen(o => !o);
    };

    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);

    const activeOption = options.find(o => o.value === value);
    const label = activeOption ? activeOption.label : placeholder;

    const dropdown = open && rect ? (
        <div
            ref={menuRef}
            style={{
                position: "fixed",
                top: rect.bottom + 8,
                left: Math.max(8, rect.left),
                minWidth: Math.max(rect.width, 220),
                zIndex: 9990,
            }}
            className="rounded-2xl border border-gray-100 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="p-2 space-y-1">
                {options.map((option) => {
                    const isSelected = value === option.value;
                    return (
                        <button
                            key={option.value}
                            onClick={() => { onChange(option.value); setOpen(false); }}
                            className={cn(
                                "flex items-center justify-between w-full rounded-xl px-4 py-3 text-[13.5px] font-bold transition-all duration-150",
                                isSelected
                                    ? "bg-orange-50 text-[#F97316]"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                {option.icon && (
                                    <option.icon className={cn("h-4 w-4", isSelected ? "text-[#F97316]" : "text-gray-400", option.colorClass)} />
                                )}
                                <span className={cn(isSelected ? "text-[#F97316]" : "text-gray-700")}>{option.label}</span>
                            </div>
                            {isSelected && <Check className="h-4 w-4 text-[#F97316]" />}
                        </button>
                    );
                })}
            </div>
        </div>
    ) : null;

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                onClick={handleOpen}
                className={cn(
                    "group flex items-center justify-between gap-4 h-12 px-5 rounded-2xl border-transparent bg-white/60 text-gray-500 font-bold hover:text-[#F97316] transition-all shadow-inner focus:outline-none",
                    open && "text-[#F97316]"
                )}
            >
                <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", open ? "text-[#F97316]" : "text-gray-400")} />
                    <span className="text-[13.0px] tracking-tight whitespace-nowrap">{label}</span>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-gray-300 transition-transform duration-300", open && "rotate-180 text-[#F97316]")} />
            </button>
            {typeof window !== "undefined" && createPortal(dropdown, document.body)}
        </div>
    );
}

