"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
/*  Reusable card wrapper  */
export function SettingsCard({ 
    title, 
    description, 
    children, 
    icon: Icon,
    className,
    id
}: { 
    title: string; 
    description?: string; 
    children: React.ReactNode; 
    icon?: any;
    className?: string;
    id?: string;
}) {
    return (
        <div id={id} className={cn("bg-white rounded-2xl overflow-hidden", className)} style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #F0EEF8" }}>
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        {Icon && <Icon className="h-4.5 w-4.5 text-violet-400" />}
                        <h2 className="text-base font-semibold text-gray-900 tracking-tight">{title}</h2>
                    </div>
                    {description && <p className="text-sm text-gray-400 leading-relaxed">{description}</p>}
                </div>
            </div>
            <div className="px-6 py-6">{children}</div>
        </div>
    );
}
/*  Field wrapper  */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("space-y-1.5", className)}>
            <Label className="text-sm font-semibold text-gray-700">{label}</Label>
            {children}
        </div>
    );
}
/*  Toggle  */
export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onChange}
            disabled={disabled}
            className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
                checked ? "bg-[#7C3AED] shadow-[0_0_12px_rgba(124,58,237,0.3)]" : "bg-gray-200"
            )}
        >
            <span
                className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-300",
                    checked ? "translate-x-6" : "translate-x-1"
                )}
            />
        </button>
    );
}
