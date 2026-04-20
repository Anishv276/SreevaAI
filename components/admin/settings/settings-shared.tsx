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
        <div id={id} className={cn("bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible", className)}>
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-5 w-5 text-gray-400" />}
                        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    </div>
                    {description && <p className="text-sm text-gray-500 font-medium mt-1">{description}</p>}
                </div>
            </div>
            <div className="px-6 py-5">{children}</div>
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
                checked ? "bg-[#F97316] shadow-[0_0_12px_rgba(249,115,22,0.3)]" : "bg-gray-200"
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
