"use client";
import { useState } from "react";
import { Plus, X, Sparkles } from "lucide-react";
import { ScreeningSettings, type ScreeningConfig } from "@/components/create-job/screening-settings";

interface WizardPage3Props {
    interviewMode: string;
    screeningConfig: ScreeningConfig;
    setScreeningConfig: (cfg: ScreeningConfig | ((prev: ScreeningConfig) => ScreeningConfig)) => void;
    mustHaveSkills: string[];
    setMustHaveSkills: (skills: string[]) => void;
}

export function WizardPage3Scoring({
    interviewMode,
    screeningConfig,
    setScreeningConfig,
    mustHaveSkills,
    setMustHaveSkills,
}: WizardPage3Props) {
    const [newSkill, setNewSkill] = useState("");

    const addSkill = () => {
        const label = newSkill.trim();
        if (!label || mustHaveSkills.includes(label)) return;
        setMustHaveSkills([...mustHaveSkills, label]);
        setNewSkill("");
    };

    const removeSkill = (index: number) => {
        setMustHaveSkills(mustHaveSkills.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-6">
            {/* Must-have skills -- distinct from resumeScreeningCriteria.skills.mustHave */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
                    <div>
                        <p className="text-sm font-semibold text-gray-800">Must-Have Skills</p>
                        <p className="text-xs text-gray-400 mt-0.5">Interview skill emphasis -- shown to interviewers, separate from resume screening.</p>
                    </div>
                </div>
                {mustHaveSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-3 rounded-xl" style={{ background: "#FAFAFC", border: "1px solid #F0EEF8" }}>
                        {mustHaveSkills.map((skill, i) => (
                            <span key={`${skill}-${i}`}
                                className="group inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium"
                                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.28)", color: "#6D28D9" }}>
                                {skill}
                                <button type="button" onClick={() => removeSkill(i)} className="opacity-40 group-hover:opacity-100 hover:text-red-500 transition-all">
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSkill()}
                        placeholder="e.g. React, Python, AWS"
                        className="h-10 flex-1 rounded-xl bg-gray-50 px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400"
                        style={{ border: "1px solid #E9E7FF" }}
                    />
                    <button
                        type="button"
                        onClick={addSkill}
                        disabled={!newSkill.trim()}
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-30"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {interviewMode !== "interview-only" && (
                <>
                    <div className="h-px" style={{ background: "#F0EEF8" }} />
                    <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-800">Resume Screening</p>
                        <ScreeningSettings config={screeningConfig} setConfig={setScreeningConfig} />
                    </div>
                </>
            )}
        </div>
    );
}
