"use client";

import { Slider } from "@/components/ui/slider";
import { Brain, Sparkles, Zap, Hand } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScreeningConfig {
    threshold: number;
}

interface ScreeningSettingsProps {
    config: ScreeningConfig;
    setConfig: (w: ScreeningConfig | ((prev: ScreeningConfig) => ScreeningConfig)) => void;
    shortlistMode: "automatic" | "manual";
    setShortlistMode: (v: "automatic" | "manual") => void;
}

export function ScreeningSettings({ config, setConfig, shortlistMode, setShortlistMode }: ScreeningSettingsProps) {
    const threshold = config?.threshold ?? 60;

    return (
        <div className="space-y-8 animate-in-up duration-500 max-w-2xl mx-auto">
            {/* AI Resume Screening Section */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="h-6 w-1 rounded-full bg-[#F97316]" />
                        <div>
                            <p className="text-[14px] font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <Brain className="h-4 w-4 text-[#F97316]" />
                                AI Resume Screening
                            </p>
                        </div>
                    </div>
                </div>

                <div className="pl-4 space-y-6 animate-in-fade">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <Sparkles className="h-3.5 w-3.5 text-[#F97316]" />
                                    Match Threshold
                                </p>
                                <p className="text-[12px] text-gray-500 font-medium italic">
                                    Minimum AI score required to pass initial screening.
                                </p>
                            </div>
                            <div className="flex items-baseline gap-1 text-[#F97316]">
                                <span className="text-3xl font-black tracking-tighter">{threshold}</span>
                                <span className="text-sm font-bold">%</span>
                            </div>
                        </div>
                        
                        <div className="px-1">
                            <Slider
                                value={[threshold]}
                                onValueChange={([v]) => setConfig({ threshold: v })}
                                max={100}
                                min={1}
                                step={1}
                                className="cursor-pointer"
                            />
                            <div className="flex justify-between w-full mt-2 text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                                <span>Selective</span>
                                <span>Balanced</span>
                                <span>Strict</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Shortlist Mode Section */}
            <section className="space-y-6 pt-4 border-t border-gray-50">
                <div className="flex items-center gap-3">
                    <span className="h-6 w-1 rounded-full bg-[#F97316]" />
                    <div>
                        <p className="text-[14px] font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                            <Zap className="h-4 w-4 text-[#F97316]" />
                            Shortlist Mode
                        </p>
                    </div>
                </div>

                <div className="pl-4 space-y-4">
                    <div className="flex p-1 bg-gray-100 rounded-lg w-fit">
                        <button
                            type="button"
                            onClick={() => setShortlistMode("automatic")}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-black transition-all duration-200",
                                shortlistMode === "automatic"
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-400 hover:text-gray-600"
                            )}
                        >
                            Automatic
                        </button>
                        <button
                            type="button"
                            onClick={() => setShortlistMode("manual")}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-black transition-all duration-200",
                                shortlistMode === "manual"
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-400 hover:text-gray-600"
                            )}
                        >
                            Manual
                        </button>
                    </div>
                    <p className="text-[12px] text-gray-400 font-medium leading-relaxed max-w-md italic">
                        {shortlistMode === "automatic" 
                            ? "AI will auto-send interview links to matching candidates immediately."
                            : "You will manually review and approve candidates before any invitations are sent."
                        }
                    </p>
                </div>
            </section>
        </div>
    );
}

