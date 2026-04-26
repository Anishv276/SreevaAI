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
            onClick={() => setExpandedSection(expanded ? null : title.toLowerCase())}
            className="flex items-center justify-between w-full p-4 bg-gradient-to-r from-orange-50 to-transparent hover:from-orange-100 rounded-xl transition-all"
        >
            <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                    <Icon className="h-5 w-5 text-orange-600" />
                </div>
                <span className="font-bold text-gray-900">{title}</span>
            </div>
            <ChevronDown className={cn("h-5 w-5 text-gray-400 transition-transform", expanded && "rotate-180")} />
        </button>
    );

    return (
        <div className="space-y-6 animate-in-up duration-500 max-w-4xl mx-auto">
            {/* AI Resume Screening Section */}
            <section className="space-y-4">
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

            {/* Screening Criteria Section */}
            <section className="space-y-4 pt-4 border-t border-gray-50">
                <div className="flex items-center gap-3 mb-2">
                    <span className="h-6 w-1 rounded-full bg-orange-500" />
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Screening Criteria</h2>
                </div>

                {/* Skills Section */}
                <div className="space-y-3 bg-white rounded-xl border border-gray-100">
                    <SectionHeader icon={Star} title="Skills" expanded={expandedSection === "skills"} />
                    {expandedSection === "skills" && (
                        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                            {/* Required Skills */}
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Required Skills</label>
                                <div className="space-y-2">
                                    {(criteria.skills?.required || []).map((skill, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2 bg-gradient-to-r from-orange-50 to-transparent rounded-lg group">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-900 truncate">{skill.name}</p>
                                                <p className="text-xs text-gray-500">{skill.proficiency || "intermediate"}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeRequiredSkill(i)}
                                                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all"
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
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={addRequiredSkill}
                                        className="p-2 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
                                    >
                                        <Plus className="h-4 w-4 text-orange-600" />
                                    </button>
                                </div>
                                <select
                                    value={newSkillProficiency}
                                    onChange={(e) => setNewSkillProficiency(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
                                >
                                    <option value="">Proficiency level</option>
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                    <option value="expert">Expert</option>
                                </select>
                            </div>

                            {/* Nice-to-have Skills */}
                            <div className="space-y-2 pt-3 border-t border-gray-100">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Nice-to-have Skills</label>
                                <div className="space-y-2">
                                    {(criteria.skills?.niceToHave || []).map((skill, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2 bg-gradient-to-r from-blue-50 to-transparent rounded-lg group">
                                            <div className="flex-1">
                                                <p className="font-semibold text-gray-900">{skill.name}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeNiceSkill(i)}
                                                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all"
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
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={addNiceSkill}
                                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                                    >
                                        <Plus className="h-4 w-4 text-blue-600" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Experience Section */}
                <div className="space-y-3 bg-white rounded-xl border border-gray-100">
                    <SectionHeader icon={Briefcase} title="Experience" expanded={expandedSection === "experience"} />
                    {expandedSection === "experience" && (
                        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Minimum Years</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="50"
                                        value={criteria.experience?.minimumYears || ""}
                                        onChange={(e) => updateCriteria({
                                            experience: { ...criteria.experience, minimumYears: parseInt(e.target.value) || undefined }
                                        })}
                                        placeholder="e.g., 5"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Seniority Level</label>
                                    <select
                                        value={criteria.experience?.seniorityLevel || ""}
                                        onChange={(e) => updateCriteria({
                                            experience: { ...criteria.experience, seniorityLevel: e.target.value as any }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    >
                                        <option value="">Select level</option>
                                        {SENIORITY_LEVELS.map(level => (
                                            <option key={level.value} value={level.value}>{level.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Preferred Domain</label>
                                <input
                                    type="text"
                                    value={criteria.experience?.preferredDomain || ""}
                                    onChange={(e) => updateCriteria({
                                        experience: { ...criteria.experience, preferredDomain: e.target.value }
                                    })}
                                    placeholder="e.g., Backend Development, Full-stack, Frontend"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Education Section */}
                <div className="space-y-3 bg-white rounded-xl border border-gray-100">
                    <SectionHeader icon={BookOpen} title="Education" expanded={expandedSection === "education"} />
                    {expandedSection === "education" && (
                        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Degree Level</label>
                                    <select
                                        value={criteria.education?.degreeLevel || ""}
                                        onChange={(e) => updateCriteria({
                                            education: { ...criteria.education, degreeLevel: e.target.value as any }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    >
                                        <option value="">Select degree</option>
                                        {DEGREE_LEVELS.map(degree => (
                                            <option key={degree.value} value={degree.value}>{degree.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Field of Study</label>
                                    <input
                                        type="text"
                                        value={criteria.education?.fieldOfStudy?.join(", ") || ""}
                                        onChange={(e) => updateCriteria({
                                            education: { ...criteria.education, fieldOfStudy: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }
                                        })}
                                        placeholder="e.g., Computer Science, Engineering"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                            </div>

                            {/* Required Certifications */}
                            <div className="space-y-2 pt-3 border-t border-gray-100">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Required Certifications</label>
                                <div className="space-y-2">
                                    {(criteria.education?.requiredCertifications || []).map((cert, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2 bg-gradient-to-r from-orange-50 to-transparent rounded-lg group">
                                            <p className="flex-1 font-semibold text-gray-900">{cert}</p>
                                            <button
                                                type="button"
                                                onClick={() => removeCertification(i)}
                                                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all"
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
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={addCertification}
                                        className="p-2 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
                                    >
                                        <Plus className="h-4 w-4 text-orange-600" />
                                    </button>
                                </div>
                            </div>

                            {/* Nice-to-have Certifications */}
                            <div className="space-y-2 pt-3 border-t border-gray-100">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Nice-to-have Certifications</label>
                                <div className="space-y-2">
                                    {(criteria.education?.niceToHaveCertifications || []).map((cert, i) => (
                                        <div key={i} className="flex items-center gap-2 p-2 bg-gradient-to-r from-blue-50 to-transparent rounded-lg group">
                                            <p className="flex-1 font-semibold text-gray-900">{cert}</p>
                                            <button
                                                type="button"
                                                onClick={() => removeNiceCertification(i)}
                                                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all"
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
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={addNiceCertification}
                                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                                    >
                                        <Plus className="h-4 w-4 text-blue-600" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Location Section */}
                <div className="space-y-3 bg-white rounded-xl border border-gray-100">
                    <SectionHeader icon={MapPin} title="Location" expanded={expandedSection === "location"} />
                    {expandedSection === "location" && (
                        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                            {/* Preferred Locations */}
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Preferred Locations</label>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {(criteria.location?.required || []).map((location, i) => (
                                        <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 rounded-full group hover:bg-orange-200 transition-colors">
                                            <span className="text-sm font-semibold text-orange-900">{location}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeLocation(i)}
                                                className="p-0.5 hover:bg-orange-300 rounded-full transition-colors"
                                            >
                                                <X className="h-3 w-3 text-orange-700" />
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
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addLocation}
                                        className="p-2 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
                                    >
                                        <Plus className="h-4 w-4 text-orange-600" />
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
                                                "px-2 py-1 rounded text-xs font-semibold transition-colors",
                                                (criteria.location?.required || []).includes(country)
                                                    ? "bg-orange-500 text-white"
                                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                            )}
                                        >
                                            {country}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Work Permit & Remote */}
                            <div className="space-y-3 pt-3 border-t border-gray-100">
                                <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={criteria.location?.remoteOk ?? true}
                                        onChange={(e) => updateCriteria({
                                            location: { ...criteria.location, remoteOk: e.target.checked }
                                        })}
                                        className="w-4 h-4 rounded cursor-pointer"
                                    />
                                    <span className="text-sm font-semibold text-gray-900">Remote work is acceptable</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={criteria.location?.workPermitRequired ?? false}
                                        onChange={(e) => updateCriteria({
                                            location: { ...criteria.location, workPermitRequired: e.target.checked }
                                        })}
                                        className="w-4 h-4 rounded cursor-pointer"
                                    />
                                    <span className="text-sm font-semibold text-gray-900">Work permit required</span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <p className="text-xs text-gray-500 px-4 py-2">These criteria will be used by AI to score and rank resumes</p>
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

