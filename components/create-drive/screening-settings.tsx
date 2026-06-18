"use client";
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Plus, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScreeningCriteria } from "@/lib/screening-criteria";
export interface ScreeningConfig {
    threshold: number;
    criteria?: ScreeningCriteria;
}
interface ScreeningSettingsProps {
    config: ScreeningConfig;
    setConfig: (w: ScreeningConfig | ((prev: ScreeningConfig) => ScreeningConfig)) => void;
}
type SkillItem = { name: string; weight?: number };
type CustomCheckItem = { text: string; required?: boolean };
export function ScreeningSettings({ config, setConfig }: ScreeningSettingsProps) {
    const threshold = config?.threshold ?? 60;
    const criteria = config?.criteria ?? {};
    const [newSkill, setNewSkill] = useState("");
    const [newSkillMustHave, setNewSkillMustHave] = useState(true);
    const [newCustomCheck, setNewCustomCheck] = useState("");
    const [newCustomRequired, setNewCustomRequired] = useState(true);
    const updateCriteria = (updates: Partial<ScreeningCriteria>) => {
        setConfig((prev) => ({
            ...prev,
            criteria: { ...(prev.criteria || {}), ...updates },
        }));
    };
    const addSkill = () => {
        const label = newSkill.trim();
        if (!label) return;
        const mustHave = criteria.skills?.mustHave || [];
        const optional = criteria.skills?.optional || [];
        const skill: SkillItem = { name: label, weight: newSkillMustHave ? 8 : 4 };
        updateCriteria({
            skills: newSkillMustHave
                ? { ...criteria.skills, mustHave: [...mustHave, skill] }
                : { ...criteria.skills, optional: [...optional, skill] },
        });
        setNewSkill("");
    };
    const removeSkill = (kind: "mustHave" | "optional", index: number) => {
        const current = criteria.skills?.[kind] || [];
        updateCriteria({ skills: { ...criteria.skills, [kind]: current.filter((_, i) => i !== index) } });
    };
    const toggleSkillMustHave = (kind: "mustHave" | "optional", index: number) => {
        const currentMustHave = criteria.skills?.mustHave || [];
        const currentOptional = criteria.skills?.optional || [];
        if (kind === "mustHave") {
            const moved = currentMustHave[index];
            if (!moved) return;
            updateCriteria({
                skills: {
                    ...criteria.skills,
                    mustHave: currentMustHave.filter((_, i) => i !== index),
                    optional: [...currentOptional, { name: moved.name, weight: 4 }],
                },
            });
        } else {
            const moved = currentOptional[index];
            if (!moved) return;
            updateCriteria({
                skills: {
                    ...criteria.skills,
                    mustHave: [...currentMustHave, { name: moved.name, weight: 8 }],
                    optional: currentOptional.filter((_, i) => i !== index),
                },
            });
        }
    };
    const addCustomCheck = () => {
        const text = newCustomCheck.trim();
        if (!text) return;
        updateCriteria({ customChecks: [...(criteria.customChecks || []), { text, required: newCustomRequired }] });
        setNewCustomCheck("");
    };
    const removeCustomCheck = (index: number) => {
        updateCriteria({ customChecks: (criteria.customChecks || []).filter((_, i) => i !== index) });
    };
    const toggleCustomRequired = (index: number) => {
        updateCriteria({
            customChecks: (criteria.customChecks || []).map((item, i) =>
                i === index ? { ...item, required: !item.required } : item
            ),
        });
    };
    const mustHaveSkills = criteria.skills?.mustHave || [];
    const optionalSkills = criteria.skills?.optional || [];
    const customChecks = criteria.customChecks || [];
    const thresholdColor =
        threshold < 40 ? "#3B82F6" :
        threshold < 65 ? "#22C55E" :
        threshold < 85 ? "#F97316" : "#EF4444";
    return (
        <div className="space-y-6">
            {/* ── Threshold ── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Match Threshold</p>
                        <p className="text-[11px] text-gray-400">Minimum AI score required to pass initial screening</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold tracking-tight" style={{ color: thresholdColor }}>{threshold}</span>
                        <span className="text-sm font-semibold text-gray-400">%</span>
                    </div>
                </div>
                <Slider
                    value={[threshold]}
                    onValueChange={([v]) => setConfig((prev) => ({ ...prev, threshold: v }))}
                    max={100} min={1} step={1}
                    className="cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-semibold text-gray-300 uppercase tracking-widest">
                    <span>Lenient</span>
                    <span>Balanced</span>
                    <span>Strict</span>
                </div>
            </div>
            <div className="border-t border-gray-100" />
            {/* ── Skills ── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Skills</p>
                    {(mustHaveSkills.length + optionalSkills.length) > 0 && (
                        <span className="text-[11px] font-semibold text-gray-400">
                            {mustHaveSkills.length + optionalSkills.length} added
                        </span>
                    )}
                </div>
                {/* Skill tags */}
                {(mustHaveSkills.length > 0 || optionalSkills.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                        {mustHaveSkills.map((skill, i) => (
                            <span
                                key={`must-${i}`}
                                className="group inline-flex items-center gap-1.5 rounded-lg border border-[#F97316]/30 bg-orange-50 px-2.5 py-1 text-[12px] font-semibold text-orange-700"
                            >
                                <span
                                    className="cursor-pointer hover:line-through"
                                    onClick={() => toggleSkillMustHave("mustHave", i)}
                                    title="Click to make optional"
                                >
                                    {skill.name}
                                </span>
                                <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wider">must</span>
                                <button type="button" onClick={() => removeSkill("mustHave", i)} className="text-orange-300 hover:text-orange-600 transition-colors">
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                        {optionalSkills.map((skill, i) => (
                            <span
                                key={`opt-${i}`}
                                className="group inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[12px] font-semibold text-gray-600"
                            >
                                <span
                                    className="cursor-pointer hover:text-orange-600"
                                    onClick={() => toggleSkillMustHave("optional", i)}
                                    title="Click to make must-have"
                                >
                                    {skill.name}
                                </span>
                                <button type="button" onClick={() => removeSkill("optional", i)} className="text-gray-300 hover:text-red-400 transition-colors">
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                {/* Add skill row */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSkill()}
                        placeholder="e.g. React, Python, AWS"
                        className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-[14px] font-medium text-gray-900 shadow-sm outline-none placeholder:text-gray-400 placeholder:font-normal hover:border-orange-300 hover:shadow-md focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 transition-all"
                    />
                    <button
                        type="button"
                        onClick={() => setNewSkillMustHave((v) => !v)}
                        className={cn(
                            "h-10 rounded-lg border px-3 text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            newSkillMustHave
                                ? "border-[#F97316]/30 bg-orange-50 text-orange-600"
                                : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                        )}
                    >
                        {newSkillMustHave ? "Must-have" : "Optional"}
                    </button>
                    <button
                        type="button"
                        onClick={addSkill}
                        disabled={!newSkill.trim()}
                        className="h-10 w-10 rounded-lg bg-gray-900 text-white flex items-center justify-center hover:bg-black transition-colors disabled:bg-gray-100 disabled:text-gray-300 shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">
                    Orange tags are <span className="text-orange-500 font-semibold">must-have</span> and weighted higher. Click a tag name to toggle.
                </p>
            </div>
            <div className="border-t border-gray-100" />
            {/* ── Custom Checks ── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">Custom Checks</p>
                        <p className="text-[11px] text-gray-400">Domain fit, certifications, portfolio requirements</p>
                    </div>
                    {customChecks.length > 0 && (
                        <span className="text-[11px] font-semibold text-gray-400">{customChecks.length} added</span>
                    )}
                </div>
                {customChecks.length > 0 && (
                    <div className="space-y-1.5">
                        {customChecks.map((item, i) => (
                            <div key={`custom-${i}`} className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => toggleCustomRequired(i)}
                                    className={cn(
                                        "shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-all",
                                        item.required
                                            ? "border-[#F97316] bg-[#F97316]"
                                            : "border-gray-300 bg-white hover:border-orange-300"
                                    )}
                                    title="Toggle required"
                                >
                                    {item.required && (
                                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </button>
                                <p className="flex-1 text-[13px] font-medium text-gray-800 leading-snug">{item.text}</p>
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                                    item.required
                                        ? "bg-orange-50 text-orange-500 border border-orange-200"
                                        : "bg-gray-50 text-gray-400 border border-gray-200"
                                )}>
                                    {item.required ? "Required" : "Optional"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeCustomCheck(i)}
                                    className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newCustomCheck}
                        onChange={(e) => setNewCustomCheck(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addCustomCheck()}
                        placeholder="e.g. Worked on B2B SaaS, Has design portfolio"
                        className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-[14px] font-medium text-gray-900 shadow-sm outline-none placeholder:text-gray-400 placeholder:font-normal hover:border-orange-300 hover:shadow-md focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 transition-all"
                    />
                    <button
                        type="button"
                        onClick={() => setNewCustomRequired((v) => !v)}
                        className={cn(
                            "h-10 rounded-lg border px-3 text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            newCustomRequired
                                ? "border-[#F97316]/30 bg-orange-50 text-orange-600"
                                : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                        )}
                    >
                        {newCustomRequired ? "Required" : "Optional"}
                    </button>
                    <button
                        type="button"
                        onClick={addCustomCheck}
                        disabled={!newCustomCheck.trim()}
                        className="h-10 w-10 rounded-lg bg-gray-900 text-white flex items-center justify-center hover:bg-black transition-colors disabled:bg-gray-100 disabled:text-gray-300 shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
