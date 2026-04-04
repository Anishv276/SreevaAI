"use client";

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Brain } from "lucide-react";

export interface ScreeningWeight {
    skills: number;
    experience: number;
    education: number;
}

interface ScreeningProps {
    weights: ScreeningWeight;
    setWeights: (w: ScreeningWeight | ((prev: ScreeningWeight) => ScreeningWeight)) => void;
    aiEnabled: boolean;
    setAiEnabled: (v: boolean) => void;
}

export function ScreeningAssessment({ weights, setWeights, aiEnabled, setAiEnabled }: ScreeningProps) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-10 animate-in-fade">
            {/* AI Resume Screening Section */}
            <div className="space-y-6 border p-6 rounded-xl bg-gray-50/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                            <Brain className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">AI Resume Screening</h3>
                            <p className="text-sm text-gray-500">Automatically score and rank candidates based on criteria.</p>
                        </div>
                    </div>
                    <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
                </div>

                {aiEnabled && (
                    <div className="pl-0 md:pl-14 space-y-6">
                        {/* Total % counter */}
                        <div className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold w-fit ${
                            total === 100 ? "bg-green-50 text-green-600" : "bg-orange-50 text-orange-600"
                        }`}>
                            <span>Total:</span>
                            <span>{total}%</span>
                            {total !== 100 && <span className="text-[11px] font-normal text-orange-500">(must equal 100%)</span>}
                            {total === 100 && <span className="text-[11px] font-normal text-green-500">✓ balanced</span>}
                        </div>
                        <div className="grid gap-6 md:grid-cols-3">
                            {(Object.entries(weights) as [string, number][]).map(([key, value]) => (
                                <div key={key} className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="capitalize font-medium">{key}</span>
                                        <span className="text-gray-500">{value}%</span>
                                    </div>
                                    <Slider
                                        value={[value]}
                                        onValueChange={([v]) => setWeights(w => ({ ...w, [key]: v }))}
                                        max={100}
                                        step={5}
                                        className="[&_[data-radix-slider-track]]:bg-orange-100 [&_[data-radix-slider-range]]:bg-[#F97316] [&_[data-radix-slider-thumb]]:border-[#F97316] [&_[data-radix-slider-thumb]]:bg-white [&_[data-radix-slider-thumb]]:shadow-sm"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
