"use client";

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Brain, Sparkles } from "lucide-react";

export interface ScreeningWeight {
    threshold: number;
}

interface ScreeningProps {
    weights: ScreeningWeight;
    setWeights: (w: ScreeningWeight | ((prev: ScreeningWeight) => ScreeningWeight)) => void;
    aiEnabled: boolean;
    setAiEnabled: (v: boolean) => void;
}

export function ScreeningAssessment({ weights, setWeights, aiEnabled, setAiEnabled }: ScreeningProps) {
    const threshold = weights?.threshold ?? 60;

    return (
        <div className="space-y-10 animate-in-fade">
            <div className={`space-y-6 border p-8 rounded-3xl transition-all duration-300 ${aiEnabled ? "bg-white shadow-xl border-purple-100" : "bg-gray-50/50 border-gray-100 opacity-80"}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl transition-colors duration-300 ${aiEnabled ? "bg-purple-100 text-purple-600" : "bg-gray-200 text-gray-400"}`}>
                            <Brain className="h-7 w-7" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">AI Resume Screening</h3>
                            <p className="text-sm text-gray-500 font-medium">Auto-score candidates & shortlist only the top matches.</p>
                        </div>
                    </div>
                    <Switch 
                        checked={aiEnabled} 
                        onCheckedChange={setAiEnabled}
                        className="data-[state=checked]:bg-purple-600"
                    />
                </div>

                {aiEnabled && (
                    <div className="pt-6 border-t border-gray-50 space-y-8 animate-in-slide-up">
                        <div className="bg-purple-50/50 rounded-2xl p-8 border border-purple-100/50">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
                                <div className="space-y-2 flex-1 max-w-md">
                                    <div className="flex items-center gap-2 text-purple-700">
                                        <Sparkles className="h-4 w-4" />
                                        <span className="text-[13px] font-bold uppercase tracking-widest">Match Threshold</span>
                                    </div>
                                    <p className="text-[14px] text-purple-600/70 font-medium leading-relaxed">
                                        Candidates with an AI match score below this percentage will be automatically filtered out.
                                    </p>
                                </div>
                                
                                <div className="flex flex-col items-center gap-6 min-w-[280px]">
                                    <div className="flex items-baseline gap-1 text-purple-700">
                                        <span className="text-5xl font-black tracking-tighter">{threshold}</span>
                                        <span className="text-xl font-bold">%</span>
                                    </div>
                                    <Slider
                                        value={[threshold]}
                                        onValueChange={([v]) => setWeights({ threshold: v })}
                                        max={100}
                                        min={1}
                                        step={1}
                                        className="w-full cursor-pointer [&_[data-radix-slider-track]]:h-3 [&_[data-radix-slider-track]]:bg-purple-100 [&_[data-radix-slider-range]]:bg-purple-600 [&_[data-radix-slider-thumb]]:h-7 [&_[data-radix-slider-thumb]]:w-7 [&_[data-radix-slider-thumb]]:border-4 [&_[data-radix-slider-thumb]]:border-white [&_[data-radix-slider-thumb]]:bg-purple-600 [&_[data-radix-slider-thumb]]:shadow-xl [&_[data-radix-slider-thumb]]:cursor-pointer [&_[data-radix-slider-thumb]]:transition-transform active:[&_[data-radix-slider-thumb]]:scale-110"
                                    />
                                    <div className="flex justify-between w-full px-1 text-[10px] font-bold text-purple-300 uppercase tracking-widest">
                                        <span>1%</span>
                                        <span>Strictness</span>
                                        <span>100%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
