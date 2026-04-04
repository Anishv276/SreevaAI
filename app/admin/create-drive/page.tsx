"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Steps } from "@/components/create-drive/steps";
import { BasicInfo } from "@/components/create-drive/basic-info";
import { JobDescription } from "@/components/create-drive/job-description";
import { ScreeningAssessment, ScreeningWeight } from "@/components/create-drive/screening-assessment";
import { RegistrationForm, CustomField } from "@/components/create-drive/registration-form";
import { FinalPreview } from "@/components/create-drive/final-preview";
import { CandidatePreview } from "@/components/create-drive/candidate-preview";
import { useJobs } from "@/context/jobs-context";
import { Switch } from "@/components/ui/switch";
import { Copy, CheckCircle2, Rocket, AlertCircle, X, Camera, ShieldCheck, Zap, Eye, PenLine, Sparkles, ChevronLeft, Upload, ChevronRight } from "lucide-react";

const STEPS = [
    "Basic Info",
    "Job Description",
    "Screening",
    "Assessment",
    "Registration",
    "Preview"
];

// const CANDIDATE_LINK = "hirer.ai/careers/drive/backend-engineer-2024";

// Per-step validation messages shown when fields appear incomplete
const STEP_VALIDATION_HINTS: Record<number, string> = {
    0: "Please fill all required fields.",
    1: "Please fill all required fields.",
    2: "Please ensure assessment weights sum to exactly 100% before continuing.",
    3: "Please add at least one registration field before continuing.",
};

export default function CreateDrivePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <CreateDriveForm />
        </Suspense>
    );
}

function CreateDriveForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const driveId = searchParams.get("id");
    const isEditMode = !!driveId;

    const { addJob, jobs, updateJob, fetchJobs } = useJobs();
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState<any>({
        title: "",
        role: "",
        department: "",
        location: "",
        workMode: "Remote",
        employmentType: "Full-time",
        deadline: "",
        description: "",
        salary: "",
        experience: "",
        skills: "",
        responsibilities: "",
        requirements: "",
        assessmentCount: 5,
        assessmentDifficulty: "Medium",
        assessmentTime: 15,
        assessmentMode: "TEST",
        extractedDetails: {}, // New field for structured storage
    });
    const [creationMethod, setCreationMethod] = useState<null | 'manual' | 'scan'>(isEditMode ? 'manual' : null);
    const [published, setPublished] = useState(false);
    const [publishedDriveId, setPublishedDriveId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    // Lifted state
    const [aiEnabled, setAiEnabled] = useState(true);
    const [assessmentEnabled, setAssessmentEnabled] = useState(true);
    const [weights, setWeights] = useState<ScreeningWeight>({ skills: 30, experience: 40, education: 30 });
    const [customFields, setCustomFields] = useState<CustomField[]>([
        { id: 1, label: "Portfolio URL", type: "Text", required: true },
        { id: 2, label: "Why do you want to join us?", type: "Long Text", required: false },
    ]);

    // AI Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [showCandidatePreview, setShowCandidatePreview] = useState(false);

    // Track which steps have been explicitly completed
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
    const [toast, setToast] = useState<string | null>(null);
    const [showDurationDropdown, setShowDurationDropdown] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);

    // Initial load for edit mode
    useEffect(() => {
        if (isEditMode && jobs.length > 0) {
            const drive = jobs.find(j => j.id === Number(driveId));
                if (drive) {
                    setPublishedDriveId(drive.id);
                    setFormData((prev: any) => ({
                    ...prev,
                    title: drive.title,
                    role: (drive as any).role || drive.title,
                    department: drive.department,
                    location: drive.location,
                    workMode: (drive as any).workMode || (drive.location.includes("Remote") ? "Remote" : "On-site"),
                    employmentType: drive.type,
                    deadline: (drive as any).deadline ? new Date((drive as any).deadline).toISOString().split('T')[0] : "",
                    description: drive.description,
                    skills: (drive as any).skills || "",
                    responsibilities: (drive as any).responsibilities || "",
                    requirements: (drive as any).requirements || "",
                    experience: (drive as any).experience || "",
                    salary: (drive as any).salary || "",
                    assessmentCount: (drive as any).assessmentCount || prev.assessmentCount,
                    assessmentDifficulty: (drive as any).assessmentDifficulty || prev.assessmentDifficulty,
                    assessmentTime: (drive as any).assessmentTime || prev.assessmentTime,
                    assessmentMode: (drive as any).assessmentMode || "TEST",
                    extractedDetails: (drive as any).extractedDetails || {},
                }));
                
                // If the app has more detailed screening/reg fields in the DB, 
                // we would map them here. Assuming defaults based on existing code.
                if ((drive as any).aiScreeningEnabled !== undefined) {
                    setAiEnabled((drive as any).aiScreeningEnabled);
                }
                if ((drive as any).aiScreeningWeights) {
                    try {
                        const w = typeof (drive as any).aiScreeningWeights === 'string' 
                            ? JSON.parse((drive as any).aiScreeningWeights) 
                            : (drive as any).aiScreeningWeights;
                        setWeights(w);
                    } catch (e) { console.error("Failed to parse weights", e); }
                }
                if ((drive as any).assessmentEnabled !== undefined) {
                    setAssessmentEnabled((drive as any).assessmentEnabled);
                }
                if ((drive as any).registrationFields) {
                    try {
                        const fields = typeof (drive as any).registrationFields === 'string'
                            ? JSON.parse((drive as any).registrationFields)
                            : (drive as any).registrationFields;
                        setCustomFields(fields);
                    } catch (e) { console.error("Failed to parse reg fields", e); }
                }
            }
        }
    }, [isEditMode, driveId, jobs]);

    const startAnalysis = async ({ file, url }: { file?: File, url?: string }) => {
        setIsAnalyzing(true);
        setAnalysisError(null);
        if (file) setFormData((prev: any) => ({ ...prev, jdFileName: file.name }));

        const data = new FormData();
        if (file) data.append("file", file);
        if (url) data.append("url", url);
        data.append("type", "JD");

        try {
            const res = await fetch("/api/extract", { method: "POST", body: data });
            if (res.ok) {
                const { data: extracted, text } = await res.json();
                
                // Map the new structured schema to our form data
                setFormData((prev: any) => {
                    const experience = extracted.experience;
                    const skills = extracted.skills;
                    const salary = extracted.salary;

                    // Improved Skill Mapping: Combine Must Have and Good to Have for the single 'skills' field
                    const allSkills = [
                        ...(Array.isArray(skills?.must_have) ? skills.must_have : []),
                        ...(Array.isArray(skills?.good_to_have) ? skills.good_to_have : [])
                    ].filter(Boolean).join(", ");

                    // Strict check for numeric 0
                    const expText = (typeof experience?.min_years === 'number') 
                        ? `${experience.min_years}${experience.max_years ? `-${experience.max_years}` : "+"} years` 
                        : prev.experience;

                    const salaryText = (typeof salary?.min === 'number')
                        ? `${salary.currency || "₹"}${salary.min}${salary.max ? ` - ${salary.max}` : ""} ${salary.period || ""}`
                        : prev.salary;

                    return {
                        ...prev,
                        title: prev.title || extracted.job_title || "",
                        role: prev.role || extracted.job_title || "",
                        location: prev.location || (extracted.location?.city ? `${extracted.location.city}, ${extracted.location.country || ""}` : ""),
                        workMode: extracted.location?.remote ? "Remote" : "On-site",
                        employmentType: extracted.employment_type ? (extracted.employment_type.charAt(0).toUpperCase() + extracted.employment_type.slice(1)) : prev.employmentType,
                        description: extracted.summary || extracted.description || text || prev.description,
                        skills: allSkills || prev.skills,
                        salary: salaryText,
                        experience: expText,
                        department: extracted.department || prev.department,
                        responsibilities: extracted.responsibilities?.join("\n") || prev.responsibilities,
                        requirements: extracted.requirements?.join("\n") || prev.requirements,
                        extractedDetails: extracted, // STORE THE FULL JSON
                    };
                });
            } else {
                const error = await res.json();
                setAnalysisError(error.error || "Failed to extract JD details.");
            }
        } catch (e) {
            console.error("Analysis failed:", e);
            setAnalysisError("An error occurred during AI analysis.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const showToast = (msg: string) => {
        setToast(msg); // Persistent — only dismissed via X button
    };

    /** Returns true if the step looks sufficiently filled to proceed */
    const isStepValid = (step: number): boolean => {
        if (step === 0) {
            const { title, role, department, workMode, employmentType, deadline } = formData;
            return !!(title && role && department && workMode && employmentType && deadline);
        }
        if (step === 1) {
            // Allow proceeding if analyzing OR if description is filled
            return !!(formData.description?.trim() || isAnalyzing || formData.jdFileName);
        }
        if (step === 2 && aiEnabled) {
            const total = Object.values(weights).reduce((a, b) => a + b, 0);
            return total === 100;
        }
        if (step === 3) {
            return customFields.length > 0;
        }
        return true;
    };

    const nextStep = () => {
        if (currentStep === STEPS.length - 1) {
            handlePublish();
            return;
        }
        if (!isStepValid(currentStep)) {
            showToast(STEP_VALIDATION_HINTS[currentStep]);
            return;
        }
        setCompletedSteps(prev => new Set(prev).add(currentStep));
        setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    };

    // Allow navigating to any step in edit mode, otherwise only BACK to already-completed steps
    const handleStepClick = (index: number) => {
        if (isEditMode || index < currentStep) {
            setCurrentStep(index);
        }
    };

    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

    const handlePublish = async () => {
        const jobData = {
            ...formData,
            aiScreening: { enabled: aiEnabled, weights },
            assessmentEnabled,
            registrationFields: customFields,
            status: "ACTIVE", // Prisma expects ACTIVE
            postedAt: new Date().toISOString(),
        };
        
        console.log("handlePublish called. isEditMode:", isEditMode, "Data:", jobData);
        
        try {
            let result;
            let savedId: number | null = null;

            if (isEditMode) {
                console.log("Logic: Updating existing job", driveId);
                result = await updateJob(Number(driveId), jobData);
                savedId = Number(driveId);
            } else {
                console.log("Logic: Adding new job");
                result = await addJob(jobData);
                savedId = result?.id;
            }

            console.log("Result from API:", result);

            if (savedId) {
                setPublishedDriveId(savedId);
                setPublished(true);
                showToast(isEditMode ? "Drive updated successfully!" : "Drive published successfully!");
            } else {
                console.error("Save succeeded but no ID returned. Result:", result);
                throw new Error("Failed to retrieve Drive ID after saving. Please check the dashboard.");
            }
        } catch (error: any) {
            console.error("Save process failed:", error);
            const msg = error.details ? `${error.message}: ${error.details}` : error.message;
            showToast(msg || "Failed to save drive details. Please try again.");
        }
    };

    const handleCopy = () => {
        const link = `${window.location.origin}/careers/drive/${publishedDriveId}`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ── Choice Gate (Selection Screen) ───────────────────────
    if (!isEditMode && creationMethod === null) {
        return (
            <div className="max-w-4xl mx-auto py-12 space-y-12 animate-in-fade">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">How would you like to start?</h1>
                    <p className="text-gray-500 text-lg font-medium">Choose a method to configure your recruitment drive.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Manual Option */}
                    <button
                        onClick={() => setCreationMethod('manual')}
                        className="group relative flex flex-col items-center gap-6 p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2"
                    >
                        <div className="h-20 w-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:rotate-6">
                            <PenLine className="h-10 w-10" />
                        </div>
                        <div className="space-y-2 text-center">
                            <h3 className="text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">Fill Manually</h3>
                            <p className="text-gray-500 text-sm leading-relaxed">Enter all drive details from scratch using our step-by-step form.</p>
                        </div>
                        <div className="absolute bottom-6 right-6 h-10 w-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-transparent transition-all duration-500">
                            <ChevronRight className="h-5 w-5" />
                        </div>
                    </button>

                    {/* AI Scan Option */}
                    <button
                        onClick={() => setCreationMethod('scan')}
                        className="group relative flex flex-col items-center gap-6 p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2"
                    >
                        <div className="h-20 w-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:-rotate-6">
                            <Sparkles className="h-10 w-10" />
                        </div>
                        <div className="space-y-2 text-center">
                            <h3 className="text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">Scan from JD</h3>
                            <p className="text-gray-500 text-sm leading-relaxed">Upload a Job Description and let our AI auto-fill the entire form for you.</p>
                        </div>
                        <div className="absolute bottom-6 right-6 h-10 w-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-transparent transition-all duration-500">
                            <ChevronRight className="h-5 w-5" />
                        </div>
                        <div className="absolute -top-3 -right-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                            Recommended
                        </div>
                    </button>
                </div>
            </div>
        );
    }

    // ── AI Scan Initial Screen ────────────────────────────────
    if (creationMethod === 'scan' && !formData.jdFileName) {
        return (
            <div className="max-w-3xl mx-auto py-12 space-y-8 animate-in-fade">
                <button 
                    onClick={() => setCreationMethod(null)}
                    className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <ChevronLeft className="h-4 w-4" /> Back to Selection
                </button>
                
                <div className="bg-white p-12 rounded-[2.5rem] border-2 border-dashed border-gray-200 hover:border-orange-300 transition-all duration-500">
                    <div className="text-center space-y-6">
                        <div className="h-16 w-16 bg-orange-100 rounded-2xl flex items-center justify-center text-[#F97316] mx-auto">
                            <Upload className="h-8 w-8" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-gray-900">Upload Job Description</h2>
                            <p className="text-gray-500">Our AI will scan all fields end-to-end to pre-fill your hiring drive.</p>
                        </div>
                        <JobDescription 
                            formData={formData} 
                            updateFormData={setFormData} 
                            isAnalyzing={isAnalyzing}
                            analysisError={analysisError}
                            startAnalysis={async (params) => {
                                await startAnalysis(params);
                                setCreationMethod('manual'); // Transition to form after scan
                                setCurrentStep(0); // Land on Basic Info
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // ── Success screen ──────────────────────────────────────
    if (published) {
        return (
            <div className="max-w-2xl mx-auto py-12 flex flex-col items-center gap-8 text-center">
                <div className="relative">
                    <div className="h-20 w-20 rounded-full bg-orange-100 flex items-center justify-center">
                        <Rocket className="h-10 w-10 text-[#F97316]" />
                    </div>
                    <div className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-green-100 flex items-center justify-center border-2 border-white">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                </div>

                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Your Drive is {isEditMode ? "Updated" : "Live"}! 🎉</h1>
                    <p className="text-gray-500 mt-2 text-[15px]">
                        Candidates can now apply. Share the link below to start receiving applications.
                    </p>
                </div>

                <div className="w-full rounded-2xl border-2 border-[#F97316] bg-orange-50 p-6 space-y-4"
                    style={{ boxShadow: "0 0 24px rgba(249,115,22,0.15)" }}>
                    <p className="text-[11px] font-bold text-[#F97316] uppercase tracking-widest">Candidate Link</p>
                    <div className="flex items-center gap-3 rounded-xl bg-white border border-orange-200 px-4 py-3">
                        <span className="flex-1 text-[13px] font-mono text-gray-700 text-left truncate">
                            {publishedDriveId 
                                ? `${typeof window !== 'undefined' ? window.location.origin : ''}/careers/drive/${publishedDriveId}`
                                : "Generating link..."}
                        </span>
                        <button
                            onClick={handleCopy}
                            disabled={!publishedDriveId}
                            className="flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-orange-600 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? "Copied!" : "Copy URL"}
                        </button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50"
                        onClick={() => router.push("/admin")}>
                        Go to Dashboard
                    </Button>
                    <Button className="bg-[#F97316] hover:bg-orange-600 text-white"
                        onClick={() => { setPublished(false); setCurrentStep(0); setCompletedSteps(new Set()); }}>
                        Create Another Drive
                    </Button>
                </div>
            </div>
        );
    }

    // ── Form screen ─────────────────────────────────────────
    return (
        <div className="max-w-4xl mx-auto py-4 space-y-4">
            {/* Validation toast */}
            {toast && (
                <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 text-[#F97316] mt-0.5" />
                    <p className="flex-1 text-[13px] font-medium text-orange-700">{toast}</p>
                    <button type="button" onClick={() => setToast(null)} className="text-orange-400 hover:text-orange-600">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div className="mb-10 group">
                <div className="flex items-center gap-4 mb-3">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            {isEditMode ? "Edit Drive Details" : "Create New Drive"}
                        </h1>
                        <p className="text-gray-500 font-medium mt-1 text-base sm:text-lg">
                            Configure your hiring drive and screening process.
                        </p>
                    </div>
                </div>
            </div>

            <Steps steps={STEPS} currentStep={currentStep} onStepClick={handleStepClick} isEditMode={isEditMode} />

            <div
                className="rounded-2xl bg-white transition-all duration-300 relative"
                style={{
                    border: "1px solid #E5E7EB",
                    borderTop: "4px solid #F97316",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
                }}
            >
                <div className="p-8">
                    {currentStep === 0 && <BasicInfo formData={formData} updateFormData={setFormData} />}
                    {currentStep === 1 && (
                        <JobDescription 
                            formData={formData} 
                            updateFormData={setFormData} 
                            isAnalyzing={isAnalyzing}
                            analysisError={analysisError}
                            startAnalysis={startAnalysis}
                        />
                    )}
                    {currentStep === 2 && (
                        <ScreeningAssessment
                            weights={weights}
                            setWeights={setWeights}
                            aiEnabled={aiEnabled}
                            setAiEnabled={setAiEnabled}
                        />
                    )}
                    {currentStep === 3 && (
                        <div className="space-y-10 animate-in-up duration-500 max-w-3xl mx-auto">
                            <div className="flex items-center justify-between gap-4 mb-2">
                                <div className="flex items-center gap-4">
                                    <div className="p-2.5 bg-gray-900 rounded-xl shadow-lg">
                                        <ShieldCheck className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 leading-tight">Assessment Parameters</h3>
                                        <p className="text-sm text-gray-500 font-medium">Configure the evaluation strategy and constraints.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Required</span>
                                    <Switch checked={assessmentEnabled} onCheckedChange={setAssessmentEnabled} />
                                </div>
                            </div>

                            {assessmentEnabled ? (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                                        {/* QUESTION COUNT */}
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Question Count</label>
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 flex items-center justify-between p-1 bg-gray-50 rounded-xl border border-gray-200">
                                                    <button 
                                                        onClick={() => setFormData({...formData, assessmentCount: Math.max(1, formData.assessmentCount - 1)})}
                                                        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 font-bold"
                                                    >–</button>
                                                    <input 
                                                        type="number"
                                                        value={formData.assessmentCount}
                                                        onChange={(e) => setFormData({...formData, assessmentCount: Math.max(1, parseInt(e.target.value) || 1)})}
                                                        className="w-12 bg-transparent text-center text-lg font-black text-gray-900 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                    <button 
                                                        onClick={() => setFormData({...formData, assessmentCount: Math.min(20, formData.assessmentCount + 1)})}
                                                        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 font-bold"
                                                    >+</button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* DIFFICULTY LEVEL */}
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Difficulty Level</label>
                                            <div className="flex gap-2 p-1 bg-gray-50 rounded-xl border border-gray-200">
                                                {["Entry", "Medium", "Expert"].map((level) => (
                                                    <button
                                                        key={level}
                                                        onClick={() => setFormData({...formData, assessmentDifficulty: level})}
                                                        className={`flex-1 py-2.5 rounded-lg font-bold text-[12px] transition-all ${
                                                            formData.assessmentDifficulty === level 
                                                            ? 'bg-white text-gray-900 shadow-sm border border-gray-100' 
                                                            : 'text-gray-400 hover:text-gray-600'
                                                        }`}
                                                    >
                                                        {level}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* ASSESSMENT MODE */}
                                        <div className="space-y-3 md:col-span-2">
                                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Assessment Strategy</label>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                {[
                                                    { id: "TEST", label: "Test Only", icon: ShieldCheck, desc: "MCQ / Mixed" },
                                                    { id: "CODING", label: "Coding Only", icon: Zap, desc: "Sandbox Environment" },
                                                    { id: "BOTH", label: "Hybrid Mode", icon: Rocket, desc: "Test + Coding" },
                                                ].map((mode) => (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setFormData({...formData, assessmentMode: mode.id})}
                                                        className={`p-4 rounded-2xl text-left transition-all border flex items-center gap-4 ${
                                                            formData.assessmentMode === mode.id 
                                                            ? 'bg-white border-gray-900 shadow-md ring-4 ring-gray-50' 
                                                            : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                                                        }`}
                                                    >
                                                        <div className={`p-2 rounded-lg ${formData.assessmentMode === mode.id ? 'bg-gray-100 text-gray-900' : 'bg-gray-50 text-gray-400'}`}>
                                                            <mode.icon className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <p className={`font-bold text-[13px] ${formData.assessmentMode === mode.id ? 'text-gray-900' : 'text-gray-500'}`}>{mode.label}</p>
                                                            <p className="text-[10px] opacity-60 font-medium">{mode.desc}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* DURATION CUSTOM DROPDOWN */}
                                        <div className="space-y-3 md:col-span-2">
                                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest font-mono italic">Session Duration</label>
                                            <div className="relative">
                                                <div 
                                                    onClick={() => setShowDurationDropdown(!showDurationDropdown)}
                                                    className={`w-full h-14 px-6 flex items-center justify-between rounded-2xl font-bold transition-all cursor-pointer ${
                                                        showDurationDropdown 
                                                        ? 'bg-white border-2 border-gray-900 shadow-xl ring-4 ring-gray-50' 
                                                        : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-white hover:border-gray-400'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-lg ${showDurationDropdown ? 'bg-gray-100 text-gray-900' : 'bg-gray-200/50 text-gray-400'}`}>
                                                            <ShieldCheck className="w-4 h-4" />
                                                        </div>
                                                        <span className={showDurationDropdown ? 'text-gray-900' : 'text-gray-600'}>
                                                            {formData.assessmentTime} Minutes
                                                        </span>
                                                    </div>
                                                    <div className={`transition-transform duration-300 font-black ${showDurationDropdown ? 'rotate-180 text-gray-900' : 'text-gray-300'}`}>
                                                        ↓
                                                    </div>
                                                </div>
                                                
                                                {showDurationDropdown && (
                                                    <div className="absolute top-full left-0 w-full mt-3 bg-white border border-gray-100 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-3 z-50 grid grid-cols-2 gap-2 animate-in-up duration-300 border-t-4 border-t-gray-900">
                                                        {[15, 30, 45, 60, 90, 120].map((mins) => (
                                                            <button
                                                                key={mins}
                                                                onClick={() => {
                                                                    setFormData({...formData, assessmentTime: mins});
                                                                    setShowDurationDropdown(false);
                                                                }}
                                                                className={`group relative overflow-hidden py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                                                                    formData.assessmentTime === mins 
                                                                    ? 'bg-gray-900 text-white shadow-lg scale-[0.98]' 
                                                                    : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-900'
                                                                }`}
                                                            >
                                                                <span className="relative z-10">{mins} Minutes</span>
                                                                {mins > 59 && (
                                                                    <span className="block text-[8px] opacity-40 mt-1">({mins/60} Hour{mins > 60 ? 's' : ''})</span>
                                                                )}
                                                                {formData.assessmentTime === mins && (
                                                                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-green-400" />
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 bg-gray-50 border border-gray-100 rounded-2xl">
                                        <div className="flex gap-4">
                                            <ShieldCheck className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                                                Integrity verification is enabled by default. This includes **Webcam Monitoring**, **Multi-monitor Detection**, and **Behavioral Tracking**.
                                            </p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="p-12 rounded-[2.5rem] bg-gray-50/50 border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center gap-4 animate-in-fade">
                                    <div className="h-16 w-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-gray-300">
                                        <ShieldCheck className="h-8 w-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-bold text-gray-900 text-lg">Online Assessment Disabled</p>
                                        <p className="text-sm text-gray-500 max-w-sm">Candidates will proceed directly to the registration page without taking a technical test.</p>
                                    </div>
                                    <button 
                                        onClick={() => setAssessmentEnabled(true)}
                                        className="text-[#F97316] text-[13px] font-bold hover:underline mt-2"
                                    >
                                        Enable Assessment
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {currentStep === 4 && (
                        <RegistrationForm
                            customFields={customFields}
                            setCustomFields={setCustomFields}
                        />
                    )}
                    {currentStep === 5 && (
                        <FinalPreview
                            formData={formData}
                            aiEnabled={aiEnabled}
                            weights={weights}
                            regFieldCount={customFields.length + 6} // 6 standard fields
                        />
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex justify-between items-center px-8 py-4 bg-white border-t border-gray-100">
                    {currentStep === 0 ? (
                        <div />
                    ) : (
                        <Button variant="outline" size="sm" onClick={prevStep}
                            className="border-gray-300 bg-white text-gray-800 hover:bg-gray-50 h-9 font-semibold">
                            Previous
                        </Button>
                    )}

                    {currentStep === STEPS.length - 1 ? (
                        <div className="flex gap-3">
                            <Button 
                                type="button"
                                variant="outline"
                                onClick={() => setShowCandidatePreview(true)}
                                className="flex items-center gap-2 rounded-xl px-4 py-3 border-gray-200 text-gray-500 font-bold hover:bg-gray-50 h-auto"
                            >
                                <Eye className="h-4 w-4" />
                                Preview as Candidate
                            </Button>
                            <button
                                type="button"
                                onClick={handlePublish}
                                className="flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95"
                                style={{
                                    background: "linear-gradient(135deg, #F97316, #ea6608)",
                                    animation: "pulse-glow 2s infinite",
                                }}
                            >
                                <Rocket className="h-5 w-5" />
                                {isEditMode ? "Update Drive" : "Publish Drive"}
                            </button>
                        </div>
                    ) : (
                        <Button onClick={nextStep} size="sm"
                            className="bg-gradient-to-r from-[#F97316] to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white shadow-md hover:shadow-lg transition-all duration-200 px-6 h-9">
                            Save & Continue
                        </Button>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.5), 0 4px 20px rgba(249,115,22,0.45); }
                    50% { box-shadow: 0 0 0 8px rgba(249,115,22,0), 0 4px 28px rgba(249,115,22,0.6); }
                }
            `}</style>

            {showCandidatePreview && (
                <CandidatePreview 
                    formData={formData} 
                    regFieldCount={customFields.length + 6}
                    onClose={() => setShowCandidatePreview(false)}
                />
            )}
        </div>
    );
}
