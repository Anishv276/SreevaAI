"use client";
import { useState } from "react";
import { Plus, Trash2, Briefcase, Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PremiumMonthPicker } from "./premium-date-picker";
interface ExperienceItem {
    id: string;
    title: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
}
interface ExperienceInfoProps {
    value: ExperienceItem[];
    onChange: (value: ExperienceItem[]) => void;
}
export function ExperienceInfo({ value, onChange }: ExperienceInfoProps) {
    const addExperience = () => {
        const newItem: ExperienceItem = {
            id: Math.random().toString(36).substr(2, 9),
            title: "",
            company: "",
            location: "",
            startDate: "",
            endDate: "",
            current: false,
            description: ""
        };
        onChange([...value, newItem]);
    };
    const removeExperience = (id: string) => {
        onChange(value.filter(item => item.id !== id));
    };
    const updateExperience = (id: string, updates: Partial<ExperienceItem>) => {
        onChange(value.map(item => item.id === id ? { ...item, ...updates } : item));
    };
    const inputClass = "h-12 rounded-2xl border-gray-100 bg-gray-50/30 px-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300";
    return (
        <div className="space-y-10 animate-in-fade">
            <div className="space-y-6">
                {value.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/20 group hover:border-[#F97316]/30 transition-all cursor-pointer"
                        onClick={addExperience}>
                        <div className="h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316] mb-4 group-hover:rotate-6 transition-transform">
                            <Plus className="h-6 w-6" />
                        </div>
                        <p className="text-gray-500 font-bold text-sm">Add Professional Experience</p>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Tell us about your work history</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {value.map((item, index) => (
                            <div key={item.id} className="relative group/item bg-white rounded-3xl border border-gray-100 p-8 shadow-sm hover:shadow-md transition-all">
                                <div className="absolute -top-3 left-8 px-4 py-1.5 rounded-full bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                                    EXPERIENCE #{index + 1}
                                </div>
                                <button
                                    onClick={() => removeExperience(item.id)}
                                    className="absolute top-6 right-6 p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover/item:opacity-100"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                                <div className="grid gap-8 md:grid-cols-2 mt-2">
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Job Title *</Label>
                                        <div className="relative">
                                            <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                            <Input
                                                placeholder="Senior React Developer"
                                                className={cn(inputClass, "pl-11")}
                                                value={item.title}
                                                onChange={(e) => updateExperience(item.id, { title: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Company *</Label>
                                        <div className="relative">
                                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                            <Input
                                                placeholder="Tech Solutions Inc."
                                                className={cn(inputClass, "pl-11")}
                                                value={item.company}
                                                onChange={(e) => updateExperience(item.id, { company: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-8 md:grid-cols-2 mt-8">
                                    <PremiumMonthPicker 
                                        label="Start Month *"
                                        value={item.startDate}
                                        onChange={(v) => updateExperience(item.id, { startDate: v })}
                                        placeholder="Select Start"
                                    />
                                    <div className="space-y-3">
                                        <PremiumMonthPicker 
                                            label="End Month *"
                                            value={item.endDate}
                                            onChange={(v) => updateExperience(item.id, { endDate: v })}
                                            placeholder="Select End"
                                            disabled={item.current}
                                        />
                                        <div className="flex items-center gap-3 pt-1">
                                            <label className="flex items-center gap-3 cursor-pointer group/check">
                                                <div className={cn(
                                                    "h-6 w-6 rounded-lg border-2 border-gray-100 flex items-center justify-center transition-all",
                                                    item.current ? "bg-[#F97316] border-[#F97316]" : "bg-white group-hover/check:border-orange-200"
                                                )}
                                                onClick={() => updateExperience(item.id, { current: !item.current, endDate: !item.current ? "" : item.endDate })}>
                                                    {item.current && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                                                </div>
                                                <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">I currently work here</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-8 space-y-3">
                                    <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Key Responsibilities & Achievements</Label>
                                    <textarea
                                        className="w-full h-32 rounded-3xl border-gray-100 bg-gray-50/30 p-5 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300 outline-none"
                                        placeholder="Briefly describe your role and impact..."
                                        value={item.description}
                                        onChange={(e) => updateExperience(item.id, { description: e.target.value })}
                                    />
                                </div>
                            </div>
                        ))}
                        <Button 
                            variant="ghost" 
                            onClick={addExperience}
                            className="w-full h-14 rounded-2xl border-2 border-dashed border-gray-100 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 hover:border-[#F97316]/30 transition-all font-bold text-sm"
                        >
                            <Plus className="h-4 w-4 mr-2" /> ADD ANOTHER POSITION
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
