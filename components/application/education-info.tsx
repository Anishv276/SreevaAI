"use client";

import { useState } from "react";
import { Plus, Trash2, Calendar, GraduationCap, School, BookOpen, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PremiumMonthPicker } from "./premium-date-picker";

interface EducationItem {
    id: string;
    institution: string;
    degree: string;
    fieldOfStudy: string;
    startDate: string;
    endDate: string;
    grade: string;
}

interface EducationInfoProps {
    value: EducationItem[];
    onChange: (value: EducationItem[]) => void;
}

export function EducationInfo({ value, onChange }: EducationInfoProps) {
    const addEducation = () => {
        const newItem: EducationItem = {
            id: Math.random().toString(36).substr(2, 9),
            institution: "",
            degree: "",
            fieldOfStudy: "",
            startDate: "",
            endDate: "",
            grade: ""
        };
        onChange([...value, newItem]);
    };

    const removeEducation = (id: string) => {
        onChange(value.filter(item => item.id !== id));
    };

    const updateEducation = (id: string, updates: Partial<EducationItem>) => {
        onChange(value.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const inputClass = "h-12 rounded-2xl border-gray-100 bg-gray-50/30 px-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300";

    return (
        <div className="space-y-10 animate-in-fade">
            <div className="space-y-6">
                {value.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/20 group hover:border-[#F97316]/30 transition-all cursor-pointer"
                        onClick={addEducation}>
                        <div className="h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316] mb-4 group-hover:rotate-6 transition-transform">
                            <Plus className="h-6 w-6" />
                        </div>
                        <p className="text-gray-500 font-bold text-sm">Add Academic History</p>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Tell us about your education</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {value.map((item, index) => (
                            <div key={item.id} className="relative group/item bg-white rounded-3xl border border-gray-100 p-8 shadow-sm hover:shadow-md transition-all">
                                <div className="absolute -top-3 left-8 px-4 py-1.5 rounded-full bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                                    ACADEMIC #{index + 1}
                                </div>
                                <button
                                    onClick={() => removeEducation(item.id)}
                                    className="absolute top-6 right-6 p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover/item:opacity-100"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                                
                                <div className="grid gap-8 md:grid-cols-2 mt-2">
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Institution / School *</Label>
                                        <div className="relative">
                                            <School className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                            <Input
                                                placeholder="Stanford University"
                                                className={cn(inputClass, "pl-11")}
                                                value={item.institution}
                                                onChange={(e) => updateEducation(item.id, { institution: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Degree / Certification *</Label>
                                        <div className="relative">
                                            <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                            <Input
                                                placeholder="Bachelor of Science"
                                                className={cn(inputClass, "pl-11")}
                                                value={item.degree}
                                                onChange={(e) => updateEducation(item.id, { degree: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-8 md:grid-cols-2 mt-8">
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Field of Study *</Label>
                                        <div className="relative">
                                            <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                            <Input
                                                placeholder="Computer Science"
                                                className={cn(inputClass, "pl-11")}
                                                value={item.fieldOfStudy}
                                                onChange={(e) => updateEducation(item.id, { fieldOfStudy: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Grade / GPA / Percentile</Label>
                                        <Input
                                            placeholder="e.g. 3.8/4.0 or 85%"
                                            className={inputClass}
                                            value={item.grade}
                                            onChange={(e) => updateEducation(item.id, { grade: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-8 md:grid-cols-2 mt-8">
                                    <PremiumMonthPicker 
                                        label="Start Month *"
                                        value={item.startDate}
                                        onChange={(v) => updateEducation(item.id, { startDate: v })}
                                        placeholder="Select Start"
                                    />
                                    <PremiumMonthPicker 
                                        label="End Month * (or expected)"
                                        value={item.endDate}
                                        onChange={(v) => updateEducation(item.id, { endDate: v })}
                                        placeholder="Select End"
                                    />
                                </div>
                            </div>
                        ))}
                        
                        <Button 
                            variant="ghost" 
                            onClick={addEducation}
                            className="w-full h-14 rounded-2xl border-2 border-dashed border-gray-100 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 hover:border-[#F97316]/30 transition-all font-bold text-sm"
                        >
                            <Plus className="h-4 w-4 mr-2" /> ADD ANOTHER EDUCATION
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

