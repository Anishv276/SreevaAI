"use client";
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Plus, X, Shield, Sparkles, CheckCheck } from "lucide-react";
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

const THRESHOLD_TIERS = [
    { max: 40,  label: "Lenient",     color: "#3B82F6", bg: "rgba(59,130,246,0.08)",   border: "rgba(59,130,246,0.2)",   desc: "Casts a wide net — most applicants will pass." },
    { max: 65,  label: "Balanced",    color: "#10B981", bg: "rgba(16,185,129,0.08)",   border: "rgba(16,185,129,0.2)",   desc: "Filters weak fits while keeping strong candidates." },
    { max: 85,  label: "Strict",      color: "#7C3AED", bg: "rgba(124,58,237,0.08)",   border: "rgba(124,58,237,0.2)",   desc: "Only well-matched candidates pass screening." },
    { max: 101, label: "Very Strict", color: "#EF4444", bg: "rgba(239,68,68,0.08)",    border: "rgba(239,68,68,0.2)",    desc: "Near-perfect match required. Expect fewer results." },
];

function getTier(threshold: number) {
    return THRESHOLD_TIERS.find(t => threshold < t.max) || THRESHOLD_TIERS[3];
}

export function ScreeningSettings({ config, setConfig }: ScreeningSettingsProps) {
    const threshold = config?.threshold ?? 60;
    const criteria = config?.criteria ?? {};
    const [newSkill, setNewSkill] = useState("");
    const [newSkillMustHave, setNewSkillMustHave] = useState(true);
    const [newCustomCheck, setNewCustomCheck] = useState("");
    const [newCustomRequired, setNewCustomRequired] = useState(true);

    const tier = getTier(threshold);

    const updateCriteria = (updates: Partial<ScreeningCriteria>) =>
        setConfig(prev => ({ ...prev, criteria: { ...(prev.criteria || {}), ...updates } }));

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
        const mh = criteria.skills?.mustHave || [];
        const op = criteria.skills?.optional || [];
        if (kind === "mustHave") {
            const moved = mh[index];
            if (!moved) return;
            updateCriteria({ skills: { ...criteria.skills, mustHave: mh.filter((_, i) => i !== index), optional: [...op, { name: moved.name, weight: 4 }] } });
        } else {
            const moved = op[index];
            if (!moved) return;
            updateCriteria({ skills: { ...criteria.skills, mustHave: [...mh, { name: moved.name, weight: 8 }], optional: op.filter((_, i) => i !== index) } });
        }
    };

    const addCustomCheck = () => {
        const text = newCustomCheck.trim();
        if (!text) return;
        updateCriteria({ customChecks: [...(criteria.customChecks || []), { text, required: newCustomRequired }] });
        setNewCustomCheck("");
    };

    const removeCustomCheck = (index: number) =>
        updateCriteria({ customChecks: (criteria.customChecks || []).filter((_, i) => i !== index) });

    const toggleCustomRequired = (index: number) =>
        updateCriteria({ customChecks: (criteria.customChecks || []).map((item, i) => i === index ? { ...item, required: !item.required } : item) });

    const mustHaveSkills = criteria.skills?.mustHave || [];
    const optionalSkills = criteria.skills?.optional || [];
    const customChecks = criteria.customChecks || [];
    const totalSkills = mustHaveSkills.length + optionalSkills.length;

    return (
        <div className="space-y-6">

            {/* ── Threshold ── */}
            <div className="space-y-4">
                {/* Live tier indicator */}
                <div className="flex items-center justify-between rounded-2xl px-5 py-4 transition-all duration-300"
                    style={{ background: tier.bg, border: `1px solid ${tier.border}` }}>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Shield className="h-3.5 w-3.5" style={{ color: tier.color }} />
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: tier.color }}>
                                Match Threshold
                            </span>
                        </div>
                        <p className="text-[13px] text-gray-600 leading-snug max-w-[220px]">{tier.desc}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-4xl font-semibold tabular-nums tracking-tight leading-none" style={{ color: tier.color }}>
                            {threshold}
                            <span className="text-lg font-medium ml-0.5">%</span>
                        </div>
                        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-block"
                            style={{ background: tier.border, color: tier.color }}>
                            {tier.label}
                        </div>
                    </div>
                </div>

                {/* Slider */}
                <div className="px-1">
                    <Slider
                        value={[threshold]}
                        onValueChange={([v]) => setConfig(prev => ({ ...prev, threshold: v }))}
                        max={100} min={1} step={1}
                        className="cursor-pointer"
                    />
                    <div className="flex justify-between mt-2">
                        {THRESHOLD_TIERS.map((t, i) => (
                            <span key={i} className="text-[10px] font-medium transition-all duration-200"
                                style={{ color: tier.label === t.label ? t.color : "#D1D5DB" }}>
                                {t.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* divider */}
            <div className="h-px" style={{ background: "#F0EEF8" }} />

            {/* ── Skills ── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
                        <div>
                            <p className="text-sm font-semibold text-gray-800">Skills</p>
                            <p className="text-xs text-gray-400 mt-0.5">Violet = must-have · click tag to toggle</p>
                        </div>
                    </div>
                    {totalSkills > 0 && (
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: "rgba(139,92,246,0.08)", color: "#7C3AED", border: "1px solid rgba(139,92,246,0.18)" }}>
                            {totalSkills} skill{totalSkills !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>

                {/* Skill tags */}
                {totalSkills > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-3 rounded-xl" style={{ background: "#FAFAFC", border: "1px solid #F0EEF8" }}>
                        {mustHaveSkills.map((skill, i) => (
                            <span key={`must-${i}`}
                                className="group inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium cursor-pointer transition-all hover:shadow-sm"
                                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.28)", color: "#6D28D9" }}>
                                <span onClick={() => toggleSkillMustHave("mustHave", i)} title="Click to make optional"
                                    className="hover:line-through">{skill.name}</span>
                                <span className="text-[8px] font-semibold uppercase tracking-widest opacity-60">must</span>
                                <button type="button" onClick={() => removeSkill("mustHave", i)}
                                    className="opacity-40 group-hover:opacity-100 hover:text-red-500 transition-all">
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </span>
                        ))}
                        {optionalSkills.map((skill, i) => (
                            <span key={`opt-${i}`}
                                className="group inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium cursor-pointer transition-all hover:shadow-sm"
                                style={{ background: "#F5F3FF", border: "1px solid #E9E7FF", color: "#6B7280" }}>
                                <span onClick={() => toggleSkillMustHave("optional", i)} title="Click to make must-have"
                                    className="hover:text-violet-600 transition-colors">{skill.name}</span>
                                <button type="button" onClick={() => removeSkill("optional", i)}
                                    className="opacity-40 group-hover:opacity-100 hover:text-red-500 transition-all">
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Add skill input */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSkill()}
                        placeholder="e.g. React, Python, AWS"
                        className="h-10 flex-1 rounded-xl bg-gray-50 px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 transition-all"
                        style={{ border: "1px solid #E9E7FF" }}
                        onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                        onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                    />
                    <button
                        type="button"
                        onClick={() => setNewSkillMustHave(v => !v)}
                        className="h-10 rounded-xl px-3 text-xs font-semibold transition-all whitespace-nowrap"
                        style={newSkillMustHave
                            ? { background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", color: "#6D28D9" }
                            : { background: "#F9FAFB", border: "1px solid #E9E7FF", color: "#9CA3AF" }}
                    >
                        {newSkillMustHave ? "✦ Must-have" : "Optional"}
                    </button>
                    <button
                        type="button"
                        onClick={addSkill}
                        disabled={!newSkill.trim()}
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-30"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: newSkill.trim() ? "0 2px 8px rgba(124,58,237,0.3)" : "none" }}
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* divider */}
            <div className="h-px" style={{ background: "#F0EEF8" }} />

            {/* ── Custom Checks ── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCheck className="h-3.5 w-3.5 text-[#7C3AED]" />
                        <div>
                            <p className="text-sm font-semibold text-gray-800">Custom Checks</p>
                            <p className="text-xs text-gray-400 mt-0.5">Domain fit, certifications, portfolio</p>
                        </div>
                    </div>
                    {customChecks.length > 0 && (
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: "rgba(139,92,246,0.08)", color: "#7C3AED", border: "1px solid rgba(139,92,246,0.18)" }}>
                            {customChecks.length} check{customChecks.length !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>

                {/* Check list */}
                {customChecks.length > 0 && (
                    <div className="space-y-1.5">
                        {customChecks.map((item, i) => (
                            <div key={i}
                                className="group flex items-center gap-3 rounded-xl px-3.5 py-2.5 bg-white transition-all hover:shadow-sm"
                                style={{ border: `1px solid ${item.required ? "rgba(139,92,246,0.2)" : "#E9E7FF"}` }}>
                                {/* Checkbox */}
                                <button
                                    type="button"
                                    onClick={() => toggleCustomRequired(i)}
                                    className="shrink-0 h-4 w-4 rounded-md border-2 flex items-center justify-center transition-all"
                                    style={item.required
                                        ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", borderColor: "#8B5CF6" }
                                        : { background: "white", borderColor: "#D1D5DB" }}
                                >
                                    {item.required && (
                                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </button>
                                <p className="flex-1 text-sm text-gray-700 leading-snug">{item.text}</p>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 transition-all"
                                    style={item.required
                                        ? { background: "rgba(139,92,246,0.1)", color: "#7C3AED", border: "1px solid rgba(139,92,246,0.2)" }
                                        : { background: "#F5F3FF", color: "#9CA3AF", border: "1px solid #E9E7FF" }}>
                                    {item.required ? "Required" : "Optional"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeCustomCheck(i)}
                                    className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add check input */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newCustomCheck}
                        onChange={(e) => setNewCustomCheck(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addCustomCheck()}
                        placeholder="e.g. Worked on B2B SaaS, Has design portfolio"
                        className="h-10 flex-1 rounded-xl bg-gray-50 px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 transition-all"
                        style={{ border: "1px solid #E9E7FF" }}
                        onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                        onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                    />
                    <button
                        type="button"
                        onClick={() => setNewCustomRequired(v => !v)}
                        className="h-10 rounded-xl px-3 text-xs font-semibold transition-all whitespace-nowrap"
                        style={newCustomRequired
                            ? { background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", color: "#6D28D9" }
                            : { background: "#F9FAFB", border: "1px solid #E9E7FF", color: "#9CA3AF" }}
                    >
                        {newCustomRequired ? "✦ Required" : "Optional"}
                    </button>
                    <button
                        type="button"
                        onClick={addCustomCheck}
                        disabled={!newCustomCheck.trim()}
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-30"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: newCustomCheck.trim() ? "0 2px 8px rgba(124,58,237,0.3)" : "none" }}
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
