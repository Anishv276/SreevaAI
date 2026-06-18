"use client";
import * as React from "react";
import { useState, useMemo } from "react";
import { Eye, EyeOff, CheckCircle2, XCircle, ShieldCheck, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    showChecklist?: boolean;
    onValidationChange?: (isValid: boolean) => void;
}
export function PasswordInput({ 
    className, 
    label, 
    value, 
    onChange, 
    showChecklist = false,
    onValidationChange,
    ...props 
}: PasswordInputProps) {
    const [showPassword, setShowPassword] = useState(false);
    const password = typeof value === 'string' ? value : '';
    const requirements = useMemo(() => [
        { label: "8+ characters", met: password.length >= 8 },
        { label: "Lower & Uppercase", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
        { label: "Number & Special", met: /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password) },
    ], [password]);
    const isValid = useMemo(() => requirements.every(r => r.met), [requirements]);
    React.useEffect(() => {
        if (onValidationChange) {
            onValidationChange(isValid);
        }
    }, [isValid, onValidationChange]);
    return (
        <div className="space-y-2">
            {label && (
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                    {label}
                </label>
            )}
            <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#F97316] transition-colors" />
                <Input
                    type={showPassword ? "text" : "password"}
                    value={value}
                    onChange={onChange}
                    className={cn(
                        "pl-10 pr-10 h-11 rounded-xl border-gray-200 bg-white font-medium focus:border-[#F97316] focus:ring-4 focus:ring-orange-50 transition-all text-sm",
                        showChecklist && password.length > 0 && !isValid && "border-orange-200 focus:border-orange-300",
                        showChecklist && isValid && "border-emerald-200 focus:border-emerald-300",
                        className
                    )}
                    {...props}
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#F97316] transition-colors p-1 rounded-md"
                >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
            {showChecklist && password.length > 0 && (
                <div className="p-3 rounded-xl bg-gray-50/50 border border-gray-100 flex flex-wrap gap-x-4 gap-y-2 animate-in-fade duration-300">
                    {requirements.map((req, i) => (
                        <div key={i} className="flex items-center gap-1.5 min-w-fit">
                            {req.met ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : (
                                <XCircle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                            )}
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wide",
                                req.met ? "text-emerald-700" : "text-gray-400"
                            )}>
                                {req.label}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
