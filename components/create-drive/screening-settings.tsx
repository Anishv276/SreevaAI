"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Brain, ChevronDown, Plus, Sparkles, Star, Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScreeningCriteria } from "@/lib/screening-criteria";

export interface ScreeningConfig {
    threshold: number;
    criteria?: ScreeningCriteria;
    inviteScheduleDays?: number;
}

interface ScreeningSettingsProps {
    config: ScreeningConfig;
    setConfig: (w: ScreeningConfig | ((prev: ScreeningConfig) => ScreeningConfig)) => void;
    shortlistMode: "automatic" | "manual";
    setShortlistMode: (v: "automatic" | "manual") => void;
}

type SkillItem = { name: string; weight?: number };
type CustomCheckItem = { text: string; required?: boolean };

export function ScreeningSettings({ config, setConfig, shortlistMode, setShortlistMode }: ScreeningSettingsProps) {
    const threshold = config?.threshold ?? 60;
    const criteria = config?.criteria ?? {};
    const inviteScheduleDays = config?.inviteScheduleDays ?? 1;
    const [expandedSection, setExpandedSection] = useState<"skills" | "custom" | null>("skills");
    const [newSkill, setNewSkill] = useState("");
    const [newSkillMustHave, setNewSkillMustHave] = useState(true);
    const [newCustomCheck, setNewCustomCheck] = useState("");
    const [newCustomCheckMustHave, setNewCustomCheckMustHave] = useState(true);

    const updateCriteria = (updates: Partial<ScreeningCriteria>) => {
        setConfig((prev) => ({
            ...prev,
            criteria: {
                ...(prev.criteria || {}),
                ...updates,
            },
        }));
    };

    const addSkill = () => {
        const label = newSkill.trim();
        if (!label) return;

        const currentRequired = criteria.skills?.required || [];
        const currentNice = criteria.skills?.niceToHave || [];
        const skill: SkillItem = { name: label, weight: newSkillMustHave ? 8 : 4 };

        updateCriteria({
            skills: newSkillMustHave
                ? {
                    ...criteria.skills,
                    required: [...currentRequired, skill],
                }
                : {
                    ...criteria.skills,
                    niceToHave: [...currentNice, skill],
                },
        });

        setNewSkill("");
        setNewSkillMustHave(true);
    };

    const removeSkill = (kind: "required" | "niceToHave", index: number) => {
        if (kind === "required") {
            const current = criteria.skills?.required || [];
            updateCriteria({ skills: { ...criteria.skills, required: current.filter((_, i) => i !== index) } });
            return;
        }

        const current = criteria.skills?.niceToHave || [];
        updateCriteria({ skills: { ...criteria.skills, niceToHave: current.filter((_, i) => i !== index) } });
    };

    const setSkillRequired = (kind: "required" | "niceToHave", index: number, required: boolean) => {
        const currentRequired = criteria.skills?.required || [];
        const currentNice = criteria.skills?.niceToHave || [];

        if (kind === "required" && !required) {
            const moved = currentRequired[index];
            if (!moved) return;
            updateCriteria({
                skills: {
                    ...criteria.skills,
                    required: currentRequired.filter((_, i) => i !== index),
                    niceToHave: [...currentNice, { name: moved.name, weight: 4 }],
                },
            });
            return;
        }

        if (kind === "niceToHave" && required) {
            const moved = currentNice[index];
            if (!moved) return;
            updateCriteria({
                skills: {
                    ...criteria.skills,
                    required: [...currentRequired, { name: moved.name, weight: 8 }],
                    niceToHave: currentNice.filter((_, i) => i !== index),
                },
            });
        }
    };

    const addCustomCheck = () => {
        const text = newCustomCheck.trim();
        if (!text) return;

        const current = criteria.customChecks || [];
        const next: CustomCheckItem = { text, required: newCustomCheckMustHave };

        updateCriteria({
            customChecks: [...current, next],
        });

        setNewCustomCheck("");
        setNewCustomCheckMustHave(true);
    };

    const removeCustomCheck = (index: number) => {
        const current = criteria.customChecks || [];
        updateCriteria({
            customChecks: current.filter((_, i) => i !== index),
        });
    };

    const toggleCustomCheckRequired = (index: number, required: boolean) => {
        const current = criteria.customChecks || [];
        updateCriteria({
            customChecks: current.map((item, i) => (i === index ? { ...item, required } : item)),
        });
    };

    const SectionHeader = ({ title, expanded }: { title: string; expanded: boolean }) => (
        <button
            type="button"
            onClick={() => setExpandedSection(expanded ? null : (title.toLowerCase() as "skills" | "custom"))}
            className="flex w-full items-center justify-between rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
        >
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                    {title === "Skills" ? <Star className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div>
                    <span className="text-sm font-semibold text-slate-900">{title}</span>
                    <p className="text-xs text-slate-500">
                        {title === "Skills"
                            ? "Mark an item as must-have when it is essential."
                            : "Add client-specific screening checks for scoring."}
                    </p>
                </div>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", expanded && "rotate-180")} />
        </button>
    );

    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] md:p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                        <Brain className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                            <Sparkles className="h-4 w-4 text-orange-500" />
                            AI Resume Screening
                        </p>
                        <p className="text-xs text-slate-500">Set the pass threshold for automated resume scoring.</p>
                    </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <Sparkles className="h-4 w-4 text-orange-500" />
                                Match Threshold
                            </p>
                            <p className="text-xs font-medium text-slate-500">Minimum AI score required to pass initial screening.</p>
                        </div>
                        <div className="flex items-baseline gap-1 text-slate-950">
                            <span className="text-3xl font-black tracking-tight">{threshold}</span>
                            <span className="text-sm font-semibold text-slate-500">%</span>
                        </div>
                    </div>

                    <div className="mt-5 px-1">
                        <Slider
                            value={[threshold]}
                            onValueChange={([v]) => setConfig((prev) => ({ ...prev, threshold: v }))}
                            max={100}
                            min={1}
                            step={1}
                            className="cursor-pointer"
                        />
                        <div className="mt-2 flex w-full justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            <span>Selective</span>
                            <span>Balanced</span>
                            <span>Strict</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] md:p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                        <Zap className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                            <Sparkles className="h-4 w-4 text-orange-500" />
                            Invitation Timing
                        </p>
                        <p className="text-xs text-slate-500">Choose how many days to spread shortlisted invitations across.</p>
                    </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <Zap className="h-4 w-4 text-orange-500" />
                                Spread invitations over
                            </p>
                            <p className="text-xs font-medium text-slate-500">Recruiters can drip interview invites instead of sending every shortlisted email at once.</p>
                        </div>
                        <div className="flex items-baseline gap-1 text-slate-950">
                            <span className="text-3xl font-black tracking-tight">{inviteScheduleDays}</span>
                            <span className="text-sm font-semibold text-slate-500">day{inviteScheduleDays === 1 ? "" : "s"}</span>
                        </div>
                    </div>

                    <div className="mt-5 px-1">
                        <Slider
                            value={[inviteScheduleDays]}
                            onValueChange={([v]) => setConfig((prev) => ({ ...prev, inviteScheduleDays: v }))}
                            max={30}
                            min={1}
                            step={1}
                            className="cursor-pointer"
                        />
                    </div>
                </div>
            </section>

            <section className="space-y-5 pt-1">
                <div className="flex items-center gap-3">
                    <span className="h-5 w-1 rounded-full bg-slate-900" />
                    <div>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Screening Criteria</h2>
                        <p className="text-xs text-slate-500">Only skills and custom checks are used for resume scoring in this drive.</p>
                    </div>
                </div>

                <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
                    <SectionHeader title="Skills" expanded={expandedSection === "skills"} />
                    {expandedSection === "skills" && (
                        <div className="space-y-5 border-t border-slate-200/80 px-4 pb-4 pt-4">
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-xs leading-relaxed text-slate-500">
                                Add each skill once and mark it as must-have when it is essential for scoring.
                            </div>

                            <div className="space-y-2">
                                <div className="space-y-2">
                                    {(criteria.skills?.required || []).map((skill, i) => (
                                        <div
                                            key={`required-${i}`}
                                            className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-4 py-3 transition-all hover:border-slate-300 hover:shadow-sm"
                                        >
                                            <Checkbox
                                                checked
                                                onCheckedChange={(checked) => setSkillRequired("required", i, Boolean(checked))}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-900">{skill.name}</p>
                                                <p className="text-xs text-slate-500">Must-have skill</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeSkill("required", i)}
                                                className="rounded-md p-1 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {(criteria.skills?.niceToHave || []).map((skill, i) => (
                                        <div
                                            key={`nice-${i}`}
                                            className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-slate-300 hover:shadow-sm"
                                        >
                                            <Checkbox
                                                checked={false}
                                                onCheckedChange={(checked) => setSkillRequired("niceToHave", i, Boolean(checked))}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-900">{skill.name}</p>
                                                <p className="text-xs text-slate-500">Optional skill</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeSkill("niceToHave", i)}
                                                className="rounded-md p-1 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 border-t border-slate-200/80 pt-4">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Add Skill</label>
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        Skills only
                                    </span>
                                </div>
                                <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                                    <input
                                        type="text"
                                        value={newSkill}
                                        onChange={(e) => setNewSkill(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && addSkill()}
                                        placeholder="Add skill (e.g. React, Python, AWS)"
                                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-orange-100"
                                    />
                                    <label className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                                        <Checkbox
                                            checked={newSkillMustHave}
                                            onCheckedChange={(checked) => setNewSkillMustHave(Boolean(checked))}
                                        />
                                        Must-have
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addSkill}
                                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-900 bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
                    <SectionHeader title="Custom" expanded={expandedSection === "custom"} />
                    {expandedSection === "custom" && (
                        <div className="space-y-5 border-t border-slate-200/80 px-4 pb-4 pt-4">
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500">
                                    Add client-specific rules like domain fit, portfolio links, certifications, or team setup.
                                </p>
                                <div className="space-y-2">
                                    {(criteria.customChecks || []).map((item, i) => (
                                        <div
                                            key={`custom-${i}`}
                                            className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-4 py-3 transition-all hover:border-slate-300 hover:shadow-sm"
                                        >
                                            <Checkbox
                                                checked={Boolean(item.required)}
                                                onCheckedChange={(checked) => toggleCustomCheckRequired(i, Boolean(checked))}
                                                className="mt-0.5"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-900">{item.text}</p>
                                                <p className="text-xs text-slate-500">
                                                    {item.required ? "Must-have custom check" : "Optional custom check"}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeCustomCheck(i)}
                                                className="rounded-md p-1 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 border-t border-slate-200/80 pt-4">
                                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Add Custom Check</label>
                                <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                                    <input
                                        type="text"
                                        value={newCustomCheck}
                                        onChange={(e) => setNewCustomCheck(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && addCustomCheck()}
                                        placeholder="Add custom rule (e.g. Worked on B2B SaaS)"
                                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-orange-100"
                                    />
                                    <label className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                                        <Checkbox
                                            checked={newCustomCheckMustHave}
                                            onCheckedChange={(checked) => setNewCustomCheckMustHave(Boolean(checked))}
                                        />
                                        Must-have
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addCustomCheck}
                                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-900 bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] md:p-6">
                <div className="flex items-center gap-3">
                    <span className="h-5 w-1 rounded-full bg-slate-900" />
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                            <Zap className="h-4 w-4 text-orange-500" />
                            Shortlist Mode
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setShortlistMode("automatic")}
                            className={cn(
                                "rounded-xl px-5 py-2 text-sm font-semibold transition-colors duration-200",
                                shortlistMode === "automatic"
                                    ? "bg-slate-950 text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-800"
                            )}
                        >
                            Automatic
                        </button>
                        <button
                            type="button"
                            onClick={() => setShortlistMode("manual")}
                            className={cn(
                                "rounded-xl px-5 py-2 text-sm font-semibold transition-colors duration-200",
                                shortlistMode === "manual"
                                    ? "bg-slate-950 text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-800"
                            )}
                        >
                            Manual
                        </button>
                    </div>
                    <p className="max-w-md text-xs leading-relaxed text-slate-500">
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
