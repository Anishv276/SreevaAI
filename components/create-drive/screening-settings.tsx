"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Brain, Sparkles, Zap, Hand, Plus, X, ChevronDown, Star, MapPin, BookOpen, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScreeningCriteria {
    skills?: {
        required?: Array<{ name: string; proficiency?: string; weight?: number }>;
        niceToHave?: Array<{ name: string; weight?: number }>;
    };
    experience?: {
        minimumYears?: number;
        seniorityLevel?: "junior" | "mid" | "senior";
        preferredDomain?: string;
    };
    education?: {
        degreeLevel?: "high_school" | "bachelor" | "master" | "phd";
        fieldOfStudy?: string[];
        requiredCertifications?: string[];
        niceToHaveCertifications?: string[];
    };
    location?: {
        required?: string[];
        workPermitRequired?: boolean;
        remoteOk?: boolean;
    };
}

export interface ScreeningConfig {
    threshold: number;
    criteria?: ScreeningCriteria;
}

interface ScreeningSettingsProps {
    config: ScreeningConfig;
    setConfig: (w: ScreeningConfig | ((prev: ScreeningConfig) => ScreeningConfig)) => void;
    shortlistMode: "automatic" | "manual";
    setShortlistMode: (v: "automatic" | "manual") => void;
}

const PROFICIENCY_LEVELS = [
    { value: "beginner", label: "Beginner" },
    { value: "intermediate", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
    { value: "expert", label: "Expert" },
];

const DEGREE_LEVELS = [
    { value: "high_school", label: "High School" },
    { value: "bachelor", label: "Bachelor's Degree" },
    { value: "master", label: "Master's Degree" },
    { value: "phd", label: "PhD" },
];

const SENIORITY_LEVELS = [
    { value: "junior", label: "Junior (0-3 years)" },
    { value: "mid", label: "Mid-level (3-7 years)" },
    { value: "senior", label: "Senior (7+ years)" },
];

const COMMON_COUNTRIES = ["India", "USA", "UK", "Canada", "Australia", "Germany", "Singapore"];

export function ScreeningSettings({ config, setConfig, shortlistMode, setShortlistMode }: ScreeningSettingsProps) {
    const threshold = config?.threshold ?? 60;
    const criteria = config?.criteria ?? {};
    const [expandedSection, setExpandedSection] = useState<string>("skills");
    const [newSkill, setNewSkill] = useState("");
    const [newSkillProficiency, setNewSkillProficiency] = useState("intermediate");
    const [newNiceSkill, setNewNiceSkill] = useState("");
    const [newCert, setNewCert] = useState("");
    const [newNiceCert, setNewNiceCert] = useState("");
    const [newLocation, setNewLocation] = useState("");

    const updateCriteria = (updates: Partial<ScreeningCriteria>) => {
        setConfig(prev => ({
            ...prev,
            criteria: { ...prev.criteria, ...updates }
        }));
    };

    const addRequiredSkill = () => {
        if (!newSkill.trim()) return;
        const current = criteria.skills?.required || [];
        updateCriteria({
            skills: {
                ...criteria.skills,
                required: [...current, { name: newSkill.trim(), proficiency: newSkillProficiency, weight: 8 }]
            }
        });
        setNewSkill("");
        setNewSkillProficiency("intermediate");
    };

    const removeRequiredSkill = (index: number) => {
        const current = criteria.skills?.required || [];
        updateCriteria({
            skills: { ...criteria.skills, required: current.filter((_, i) => i !== index) }
        });
    };

    const addNiceSkill = () => {
        if (!newNiceSkill.trim()) return;
        const current = criteria.skills?.niceToHave || [];
        updateCriteria({
            skills: {
                ...criteria.skills,
                niceToHave: [...current, { name: newNiceSkill.trim(), weight: 4 }]
            }
        });
        setNewNiceSkill("");
    };

    const removeNiceSkill = (index: number) => {
        const current = criteria.skills?.niceToHave || [];
        updateCriteria({
            skills: { ...criteria.skills, niceToHave: current.filter((_, i) => i !== index) }
        });
    };

    const addCertification = () => {
        if (!newCert.trim()) return;
        const current = criteria.education?.requiredCertifications || [];
        updateCriteria({
            education: { ...criteria.education, requiredCertifications: [...current, newCert.trim()] }
        });
        setNewCert("");
    };

    const removeCertification = (index: number) => {
        const current = criteria.education?.requiredCertifications || [];
        updateCriteria({
            education: { ...criteria.education, requiredCertifications: current.filter((_, i) => i !== index) }
        });
    };

    const addNiceCertification = () => {
        if (!newNiceCert.trim()) return;
        const current = criteria.education?.niceToHaveCertifications || [];
        updateCriteria({
            education: { ...criteria.education, niceToHaveCertifications: [...current, newNiceCert.trim()] }
        });
        setNewNiceCert("");
    };

    const removeNiceCertification = (index: number) => {
        const current = criteria.education?.niceToHaveCertifications || [];
        updateCriteria({
            education: { ...criteria.education, niceToHaveCertifications: current.filter((_, i) => i !== index) }
        });
    };

    const addLocation = () => {
        if (!newLocation.trim()) return;
        const current = criteria.location?.required || [];
        if (!current.includes(newLocation.trim())) {
            updateCriteria({
                location: { ...criteria.location, required: [...current, newLocation.trim()] }
            });
        }
        setNewLocation("");
    };

    const removeLocation = (index: number) => {
        const current = criteria.location?.required || [];
        updateCriteria({
            location: { ...criteria.location, required: current.filter((_, i) => i !== index) }
        });
    };

    const SectionHeader = ({ icon: Icon, title, expanded }: { icon: any; title: string; expanded: boolean }) => (
        <button
            type="button"
            onClick={() => setExpandedSection(expanded ? "" : title.toLowerCase())}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 transition-colors hover:bg-slate-100"
        >
            <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
                    <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-slate-900">{title}</span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", expanded && "rotate-180")} />
        </button>
    );

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            {/* AI Resume Screening Section */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm">
                        <Brain className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                            <Sparkles className="h-4 w-4 text-slate-500" />
                            AI Resume Screening
                        </p>
                        <p className="text-xs text-slate-500">Set the core pass threshold for automated resume scoring.</p>
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <Sparkles className="h-4 w-4 text-slate-500" />
                                Match Threshold
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                                Minimum AI score required to pass initial screening.
                            </p>
                        </div>
                        <div className="flex items-baseline gap-1 text-slate-950">
                            <span className="text-3xl font-black tracking-tight">{threshold}</span>
                            <span className="text-sm font-semibold text-slate-500">%</span>
                        </div>
                    </div>

                    <div className="mt-5 px-1">
                        <Slider
                            value={[threshold]}
                            onValueChange={([v]) => setConfig({ threshold: v })}
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

            {/* Screening Criteria Section */}
            <section className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                    <span className="h-5 w-1 rounded-full bg-slate-900" />
                    <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Screening Criteria</h2>
                </div>

                {/* Skills Section */}
                <div className="space-y-3 rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <SectionHeader icon={Star} title="Skills" expanded={expandedSection === "skills"} />
                    {expandedSection === "skills" && (
                        <div className="space-y-4 border-t border-slate-200 px-4 pb-4 pt-4">
                            {/* Required Skills */}
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Required Skills</label>
                                <div className="space-y-2">
                                    {(criteria.skills?.required || []).map((skill, i) => (
                                        <div key={i} className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate font-medium text-slate-900">{skill.name}</p>
                                                <p className="text-xs text-slate-500">{skill.proficiency || "intermediate"}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeRequiredSkill(i)}
                                                className="rounded-md p-1 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                            >
                                                <X className="h-4 w-4 text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newSkill}
                                        onChange={(e) => setNewSkill(e.target.value)}
                                        onKeyPress={(e) => e.key === "Enter" && addRequiredSkill()}
                                        placeholder="Add skill (e.g., React, Python, AWS)"
                                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                    />
                                    <button
                                        type="button"
                                        onClick={addRequiredSkill}
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                                <select
                                    value={newSkillProficiency}
                                    onChange={(e) => setNewSkillProficiency(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                >
                                    <option value="">Proficiency level</option>
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                    <option value="expert">Expert</option>
                                </select>
                            </div>

                            {/* Nice-to-have Skills */}
                            <div className="space-y-2 border-t border-slate-200 pt-4">
                                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nice-to-have Skills</label>
                                <div className="space-y-2">
                                    {(criteria.skills?.niceToHave || []).map((skill, i) => (
                                        <div key={i} className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                            <div className="flex-1">
                                                <p className="font-medium text-slate-900">{skill.name}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeNiceSkill(i)}
                                                className="rounded-md p-1 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                            >
                                                <X className="h-4 w-4 text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newNiceSkill}
                                        onChange={(e) => setNewNiceSkill(e.target.value)}
                                        onKeyPress={(e) => e.key === "Enter" && addNiceSkill()}
                                        placeholder="Add nice-to-have skill"
                                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                    />
                                    <button
                                        type="button"
                                        onClick={addNiceSkill}
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Experience Section */}
                <div className="space-y-3 rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <SectionHeader icon={Briefcase} title="Experience" expanded={expandedSection === "experience"} />
                    {expandedSection === "experience" && (
                        <div className="space-y-4 border-t border-slate-200 px-4 pb-4 pt-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Minimum Years</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="50"
                                        value={criteria.experience?.minimumYears || ""}
                                        onChange={(e) => updateCriteria({
                                            experience: { ...criteria.experience, minimumYears: parseInt(e.target.value) || undefined }
                                        })}
                                        placeholder="e.g., 5"
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Seniority Level</label>
                                    <select
                                        value={criteria.experience?.seniorityLevel || ""}
                                        onChange={(e) => updateCriteria({
                                            experience: { ...criteria.experience, seniorityLevel: e.target.value as any }
                                        })}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                    >
                                        <option value="">Select level</option>
                                        {SENIORITY_LEVELS.map(level => (
                                            <option key={level.value} value={level.value}>{level.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preferred Domain</label>
                                <input
                                    type="text"
                                    value={criteria.experience?.preferredDomain || ""}
                                    onChange={(e) => updateCriteria({
                                        experience: { ...criteria.experience, preferredDomain: e.target.value }
                                    })}
                                    placeholder="e.g., Backend Development, Full-stack, Frontend"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Education Section */}
                <div className="space-y-3 rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <SectionHeader icon={BookOpen} title="Education" expanded={expandedSection === "education"} />
                    {expandedSection === "education" && (
                        <div className="space-y-4 border-t border-slate-200 px-4 pb-4 pt-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Degree Level</label>
                                    <select
                                        value={criteria.education?.degreeLevel || ""}
                                        onChange={(e) => updateCriteria({
                                            education: { ...criteria.education, degreeLevel: e.target.value as any }
                                        })}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                    >
                                        <option value="">Select degree</option>
                                        {DEGREE_LEVELS.map(degree => (
                                            <option key={degree.value} value={degree.value}>{degree.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Field of Study</label>
                                    <input
                                        type="text"
                                        value={criteria.education?.fieldOfStudy?.join(", ") || ""}
                                        onChange={(e) => updateCriteria({
                                            education: { ...criteria.education, fieldOfStudy: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }
                                        })}
                                        placeholder="e.g., Computer Science, Engineering"
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                    />
                                </div>
                            </div>

                            {/* Required Certifications */}
                            <div className="space-y-2 border-t border-slate-200 pt-4">
                                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Required Certifications</label>
                                <div className="space-y-2">
                                    {(criteria.education?.requiredCertifications || []).map((cert, i) => (
                                        <div key={i} className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                            <p className="flex-1 font-medium text-slate-900">{cert}</p>
                                            <button
                                                type="button"
                                                onClick={() => removeCertification(i)}
                                                className="rounded-md p-1 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                            >
                                                <X className="h-4 w-4 text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newCert}
                                        onChange={(e) => setNewCert(e.target.value)}
                                        onKeyPress={(e) => e.key === "Enter" && addCertification()}
                                        placeholder="Add certification"
                                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                    />
                                    <button
                                        type="button"
                                        onClick={addCertification}
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Nice-to-have Certifications */}
                            <div className="space-y-2 border-t border-slate-200 pt-4">
                                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nice-to-have Certifications</label>
                                <div className="space-y-2">
                                    {(criteria.education?.niceToHaveCertifications || []).map((cert, i) => (
                                        <div key={i} className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                            <p className="flex-1 font-medium text-slate-900">{cert}</p>
                                            <button
                                                type="button"
                                                onClick={() => removeNiceCertification(i)}
                                                className="rounded-md p-1 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                            >
                                                <X className="h-4 w-4 text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newNiceCert}
                                        onChange={(e) => setNewNiceCert(e.target.value)}
                                        onKeyPress={(e) => e.key === "Enter" && addNiceCertification()}
                                        placeholder="Add nice-to-have certification"
                                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                    />
                                    <button
                                        type="button"
                                        onClick={addNiceCertification}
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Location Section */}
                <div className="space-y-3 rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <SectionHeader icon={MapPin} title="Location" expanded={expandedSection === "location"} />
                    {expandedSection === "location" && (
                        <div className="space-y-4 border-t border-slate-200 px-4 pb-4 pt-4">
                            {/* Preferred Locations */}
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preferred Locations</label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {(criteria.location?.required || []).map((location, i) => (
                                        <div key={i} className="group flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 transition-colors hover:bg-slate-100">
                                            <span className="text-sm font-medium text-slate-800">{location}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeLocation(i)}
                                                className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                        <input
                                            type="text"
                                            value={newLocation}
                                            onChange={(e) => setNewLocation(e.target.value)}
                                            onKeyPress={(e) => e.key === "Enter" && addLocation()}
                                            placeholder="Type country or city"
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addLocation}
                                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {COMMON_COUNTRIES.map(country => (
                                        <button
                                            key={country}
                                            type="button"
                                            onClick={() => {
                                                setNewLocation(country);
                                                const current = criteria.location?.required || [];
                                                if (!current.includes(country)) {
                                                    updateCriteria({
                                                        location: { ...criteria.location, required: [...current, country] }
                                                    });
                                                }
                                            }}
                                            className={cn(
                                                "rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
                                                (criteria.location?.required || []).includes(country)
                                                    ? "bg-slate-950 text-white"
                                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                            )}
                                        >
                                            {country}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Work Permit & Remote */}
                            <div className="space-y-3 border-t border-slate-200 pt-4">
                                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-colors hover:bg-slate-100">
                                    <input
                                        type="checkbox"
                                        checked={criteria.location?.remoteOk ?? true}
                                        onChange={(e) => updateCriteria({
                                            location: { ...criteria.location, remoteOk: e.target.checked }
                                        })}
                                        className="w-4 h-4 rounded cursor-pointer"
                                    />
                                    <span className="text-sm font-medium text-slate-900">Remote work is acceptable</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-colors hover:bg-slate-100">
                                    <input
                                        type="checkbox"
                                        checked={criteria.location?.workPermitRequired ?? false}
                                        onChange={(e) => updateCriteria({
                                            location: { ...criteria.location, workPermitRequired: e.target.checked }
                                        })}
                                        className="w-4 h-4 rounded cursor-pointer"
                                    />
                                    <span className="text-sm font-medium text-slate-900">Work permit required</span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <p className="px-1 text-xs text-slate-500">These criteria will be used by AI to score and rank resumes</p>
            </section>

            {/* Shortlist Mode Section */}
            <section className="space-y-5 pt-2">
                <div className="flex items-center gap-3">
                    <span className="h-5 w-1 rounded-full bg-slate-900" />
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                            <Zap className="h-4 w-4 text-slate-500" />
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

