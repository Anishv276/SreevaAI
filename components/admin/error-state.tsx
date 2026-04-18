"use client";

import { AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
    message?: string;
    onRetry?: () => void;
    className?: string;
    compact?: boolean;
}

export function ErrorState({ 
    message = "Failed to load data", 
    onRetry, 
    className,
    compact = false
}: ErrorStateProps) {
    return (
        <div className={cn(
            "flex flex-col items-center justify-center text-center p-8 rounded-[2.5rem] bg-white/40 backdrop-blur-md border border-red-100/50",
            compact ? "p-4 min-h-[120px]" : "min-h-[200px] h-full",
            className
        )}>
            <div className={cn(
                "rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-4 transition-transform hover:scale-110",
                compact ? "h-10 w-10" : "h-14 w-14"
            )}>
                {message.toLowerCase().includes("network") ? (
                    <WifiOff className={compact ? "h-5 w-5" : "h-7 w-7"} />
                ) : (
                    <AlertCircle className={compact ? "h-5 w-5" : "h-7 w-7"} />
                )}
            </div>
            
            <div className="space-y-1 mb-6">
                <h4 className={cn("font-black text-gray-900 uppercase tracking-tighter leading-none", compact ? "text-sm" : "text-lg")}>
                    {compact ? "Load Error" : "Data Connection Lost"}
                </h4>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest max-w-[200px] mx-auto">
                    {message}
                </p>
            </div>

            {onRetry && (
                <button
                    onClick={onRetry}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-black transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg shadow-gray-200"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry Connection
                </button>
            )}
        </div>
    );
}

