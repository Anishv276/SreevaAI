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
import { InterviewSetup } from "@/components/create-drive/interview-setup";
import { useJobs } from "@/context/jobs-context";
import { Copy, CheckCircle2, Rocket, AlertCircle, X, Eye, PenLine, Sparkles, ChevronLeft, ChevronRight, Upload, Bot } from "lucide-react";

const STEPS = [
    "Basic Info",
    "Job Description",
    "Screening",
    "Interview",
    "Registration",
    "Preview"
];

// const CANDIDATE_LINK = "hirer.ai/careers/jobs/backend-engineer-2024";

// Per-step validation messages shown when fields appear incomplete
const STEP_VALIDATION_HINTS: Record<number, string> = {
    0: "Please fill all required fields.",
    1: "Please fill all required fields.",
    2: "Please set an AI match threshold before continuing.",
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
        workMode: "Remote",
        employmentType: "Full-time",
        deadline: "",
        description: "",
        salary: "",
        experience: "",
        skills: "",
        responsibilities: "",
        requirements: "",
        extractedDetails: {},
        interviewEnabled: true,
        interviewLanguage: "English",
        interviewTime: 10,
        interviewAntiCheat: "Medium",
        interviewFollowUp: 3,
        interviewQuestions: [],
    });
    const [creationMethod, setCreationMethod] = useState<null | 'manual' | 'scan'>(isEditMode ? 'manual' : null);
    const [published, setPublished] = useState(false);
    const [publishedDriveId, setPublishedDriveId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    // Lifted state
    const [aiEnabled, setAiEnabled] = useState(true);
    const [weights, setWeights] = useState<ScreeningWeight>({ threshold: 60 });
    const [customFields, setCustomFields] = useState<CustomField[]>([]);

    // AI Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [showCandidatePreview, setShowCandidatePreview] = useState(false);

    // Track which steps have been explicitly completed
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
    const [toast, setToast] = useState<string | null>(null);
    const [syncedFromAi, setSyncedFromAi] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);
    const analysisAbortRef = useRef<AbortController | null>(null);

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
                    workMode: (drive as any).workMode || "Remote",
                    employmentType: drive.type,
                    deadline: (drive as any).deadline ? new Date((drive as any).deadline).toISOString().split('T')[0] : "",
                    description: drive.description,
                    skills: (drive as any).skills || "",
                    responsibilities: (drive as any).responsibilities || "",
                    requirements: (drive as any).requirements || "",
                    experience: (drive as any).experience || "",
                    salary: (drive as any).salary || "",
                    interviewEnabled: (drive as any).interviewEnabled ?? true,
                    interviewLanguage: (drive as any).interviewLanguage || "English",
                    interviewTime: (drive as any).interviewTime || 10,
                    interviewAntiCheat: (drive as any).proctoringLevel || "Medium",
                    interviewFollowUp: (drive as any).aiFollowUpDepth || 3,
                    interviewQuestions: typeof (drive as any).interviewQuestions === 'string' 
                        ? JSON.parse((drive as any).interviewQuestions) 
                        : ((drive as any).interviewQuestions || []),
                    extractedDetails: (drive as any).extractedDetails || {},
                    jdFileName: (drive as any).jdFileName || "",
                    jdPreviewUrl: (drive as any).jdPreviewUrl || "",
                }));
                
                // Prioritize the top-level database columns first
                const loadedWeights = (drive as any).aiScreeningWeights 
                    ? (typeof (drive as any).aiScreeningWeights === 'string' ? JSON.parse((drive as any).aiScreeningWeights) : (drive as any).aiScreeningWeights)
                    : (drive as any).aiScreening?.weights;

                if (loadedWeights) {
                    setWeights(loadedWeights);
                    setAiEnabled(true);
                } else if ((drive as any).screeningThreshold !== undefined) {
                    setWeights({ threshold: (drive as any).screeningThreshold });
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

    // Handle redirection from AI Chat
    useEffect(() => {
        const method = searchParams.get("method");
        console.log("CreateDrive Sync - Method:", method);
        if (method === "ai-chat") {
            const draft = localStorage.getItem("jd_draft");
            console.log("CreateDrive Sync - Draft found:", !!draft);
            if (draft) {
                try {
                    const data = JSON.parse(draft);
                    console.log("CreateDrive Sync - Structured Data:", data);
                    setFormData((prev: any) => ({ ...prev, ...data }));
                    setCreationMethod("manual");
                    setSyncedFromAi(true);
                    setCurrentStep(0);
                    localStorage.removeItem("jd_draft");
                    showToast("Job Description synced from AI Assistant!");
                } catch (e) {
                    console.error("CreateDrive Sync - Parse Error:", e);
                }
            }
        }
    }, [searchParams]);

    // Ensure clean state when switching to "New Drive" from Dashboard
    useEffect(() => {
        if (!isEditMode && !searchParams.get("id")) {
            const method = searchParams.get("method");
            if (method !== "ai-chat") {
                setFormData({
                    title: "",
                    role: "",
                    department: "",
                    workMode: "Remote",
                    employmentType: "Full-time",
                    deadline: "",
                    description: "",
                    salary: "",
                    experience: "",
                    skills: "",
                    responsibilities: "",
                    requirements: "",
                    extractedDetails: {},
                    interviewEnabled: true,
                    interviewLanguage: "English",
                    interviewTime: 10,
                    interviewAntiCheat: "Medium",
                    interviewFollowUp: 3,
                    interviewQuestions: [],
                });
                setCreationMethod(null);
                setCurrentStep(0);
                setIsAnalyzing(false);
                setAnalysisError(null);
            }
        }
    }, [isEditMode, searchParams]);

    const startAnalysis = async ({ file, url }: { file?: File, url?: string }) => {
        setIsAnalyzing(true);
        setAnalysisError(null);
        
        // FORCE UPDATE NEW FILENAME IMMEDIATELY
        if (file) {
            setFormData((prev: any) => ({ 
                ...prev, 
                jdFileName: file.name,
                jdFile: file,
                jdPreviewUrl: URL.createObjectURL(file)
            }));
        } else if (url) {
            setFormData((prev: any) => ({ 
                ...prev, 
                jdFileName: "Extracted from Link",
                jdPreviewUrl: url
            }));
        }

        analysisAbortRef.current?.abort(); // Cancel any existing one
        const controller = new AbortController();
        analysisAbortRef.current = controller;

        const data = new FormData();
        if (file) data.append("file", file);
        if (url) data.append("url", url);
        data.append("type", "JD");

        try {
            console.log("Starting analysis for:", file?.name || url);
            const res = await fetch("/api/extract", { 
                method: "POST", 
                body: data,
                signal: controller.signal 
            });
            if (res.ok) {
                const responseData = await res.json();
                const { data: extracted, text, url: r2Url } = responseData;
                console.log("Analysis success:", extracted);
                // Map the new structured schema to our form data
                setFormData((prev: any) => {
                    const experience = extracted.experience;
                    const skills = extracted.skills;
                    const salary = extracted.salary;

                    // ── SKILLS MAPPING ─────────────────────────
                    // Extract 'skill' string from new object schema
                    const mustHaveArr = Array.isArray(skills?.must_have) 
                        ? skills.must_have.map((s: any) => typeof s === 'object' ? s.skill : s) 
                        : [];
                    const goodToHaveArr = Array.isArray(skills?.good_to_have) 
                        ? skills.good_to_have.map((s: any) => typeof s === 'object' ? s.skill : s) 
                        : [];
                    const allSkills = [...mustHaveArr, ...goodToHaveArr].filter(Boolean).join(", ");

                    // ── DESCRIPTION MAPPING ─────────────────────
                    const desc = extracted.role_summary || extracted.summary || extracted.description || extracted.job_description || text || prev.description;

                    // ── EXPERIENCE MAPPING ──────────────────────
                    // Convert numeric years to readable string
                    const minExp = experience?.min_years;
                    const maxExp = experience?.max_years;
                    let expText = prev.experience;
                    if (typeof minExp === 'number') {
                        expText = `${minExp}${maxExp ? `–${maxExp}` : "+"}`;
                    }

                    // ── SALARY MAPPING ──────────────────────────
                    // Convert raw numbers (500000) back to LPA (5) for the UI if possible
                    // Or just use a clean string. The user wants "{amount} {currency} LPA"
                    const salaryMin = salary?.min;
                    const salaryMax = salary?.max;
                    const currency = salary?.currency || "INR";
                    let salaryText = prev.salary;

                    if (typeof salaryMin === 'number') {
                        // Convert to LPA if it's a large number, or keep if already small
                        const minLPA = salaryMin > 1000 ? (salaryMin / 100000).toFixed(1).replace(/\.0$/, "") : salaryMin;
                        const maxLPA = salaryMax ? (salaryMax > 1000 ? (salaryMax / 100000).toFixed(1).replace(/\.0$/, "") : salaryMax) : null;
                        salaryText = `${minLPA}${maxLPA ? `–${maxLPA}` : ""} ${currency} LPA`;
                    }

                    // ── RESPONSIBILITIES & REQUIREMENTS ──────────
                    // Use new 'responsibilities_flat' if available
                    const respArr = extracted.responsibilities_flat || extracted.responsibilities;
                    const resp = Array.isArray(respArr) 
                        ? respArr.map((r: any) => typeof r === 'object' ? r.task : r).join("\n") 
                        : (typeof respArr === 'string' ? respArr : (prev.responsibilities || ""));
                    
                    const req = Array.isArray(extracted.requirements) ? extracted.requirements.join("\n") :
                                (typeof extracted.requirements === 'string' ? extracted.requirements : (prev.requirements || ""));

                    return {
                        ...prev,
                        title: `${extracted.job_title || prev.role || "New"} Recruitment Drive`,
                        role: extracted.job_title || prev.role || "",
                        description: desc,
                        skills: allSkills || prev.skills,
                        salary: salaryText,
                        experience: expText,
                        department: extracted.department || prev.department,
                        workMode: extracted.work_type || prev.workMode,
                        employmentType: extracted.employment_type || prev.employmentType,
                        responsibilities: resp,
                        requirements: req,
                        extractedDetails: extracted, 
                        jdPreviewUrl: r2Url || prev.jdPreviewUrl,
                    };
                });
            } else {
                const errData = await res.json();
                console.error("Extraction error response:", errData);
                setAnalysisError(errData.error || "Failed to extract JD details.");
            }
        } catch (e: any) {
            if (e.name === 'AbortError') return; // Silence aborts
            console.error("Analysis failed:", e);
            setAnalysisError("An error occurred during AI analysis.");
        } finally {
            setIsAnalyzing(false);
            if (analysisAbortRef.current === controller) {
                analysisAbortRef.current = null;
            }
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
            return (weights?.threshold ?? 0) > 0;
        }
        if (step === 3) {
            return true; // Interview always valid
        }
        if (step === 4) {
            return true; // Registration fields are now optional
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
        // Safely parse interviewQuestions — DB returns it as a JSON string, Zod expects an array
        let parsedQuestions = formData.interviewQuestions || [];
        if (typeof parsedQuestions === "string") {
            try { parsedQuestions = JSON.parse(parsedQuestions); } catch { parsedQuestions = []; }
        }

        // Explicitly pick only the fields that match the Zod schema
        const jobData = {
            title: formData.title,
            description: formData.description,
            role: formData.role,
            department: formData.department,
            employmentType: formData.employmentType,
            workMode: formData.workMode,
            positions: formData.positions,
            deadline: formData.deadline || null,
            salary: formData.salary,
            experience: formData.experience,
            skills: formData.skills,
            responsibilities: formData.responsibilities,
            requirements: formData.requirements,
            jdFileName: formData.jdFileName,
            jdPreviewUrl: formData.jdPreviewUrl,
            interviewEnabled: formData.interviewEnabled,
            interviewLanguage: formData.interviewLanguage,
            interviewTime: formData.interviewTime,
            interviewAntiCheat: formData.interviewAntiCheat,
            interviewFollowUp: formData.interviewFollowUp,
            interviewQuestions: parsedQuestions,
            registrationFields: customFields,
            extractedDetails: formData.extractedDetails || {},
            screeningThreshold: weights?.threshold || 0,
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
                result = await addJob({
                    ...jobData,
                    status: "ACTIVE",
                    postedAt: new Date().toISOString(),
                } as any);
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
        const link = `${window.location.origin}/careers/jobs/${publishedDriveId}`;
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                    {/* Manual Option */}
                    <button
                        onClick={() => setCreationMethod('manual')}
                        className="group relative flex flex-col items-center gap-6 p-8 sm:p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2"
                    >
                        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:rotate-6">
                            <PenLine className="h-8 w-8 sm:h-10 sm:w-10" />
                        </div>
                        <div className="space-y-2 text-center">
                            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">Fill Manually</h3>
                            <p className="text-gray-500 text-[13px] sm:text-sm leading-relaxed">Enter all drive details from scratch using our step-by-step form.</p>
                        </div>
                        <div className="absolute bottom-6 right-6 h-10 w-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-transparent transition-all duration-500">
                            <ChevronRight className="h-5 w-5" />
                        </div>
                    </button>

                    {/* AI Assistant Option */}
                    <button
                        onClick={() => router.push("/admin/create-drive/ai-chat")}
                        className="group relative flex flex-col items-center gap-6 p-8 sm:p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2"
                    >
                        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-orange-50 flex items-center justify-center text-[#F97316] group-hover:scale-110 transition-all duration-500">
                            <Bot className="h-8 w-8 sm:h-10 sm:w-10" />
                        </div>
                        <div className="space-y-2 text-center">
                            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">AI Assistant</h3>
                            <p className="text-gray-500 text-[13px] sm:text-sm leading-relaxed">Design your Job Description instantly through a pro AI chat architect.</p>
                        </div>
                        <div className="absolute bottom-6 right-6 h-10 w-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-transparent transition-all duration-500">
                            <ChevronRight className="h-5 w-5" />
                        </div>
                        <div className="absolute -top-3 -right-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                            Popular
                        </div>
                    </button>

                    {/* AI Scan Option */}
                    <button
                        onClick={() => setCreationMethod('scan')}
                        className="group relative flex flex-col items-center gap-6 p-8 sm:p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2"
                    >
                        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:-rotate-6">
                            <Sparkles className="h-8 w-8 sm:h-10 sm:w-10" />
                        </div>
                        <div className="space-y-2 text-center">
                            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">Scan from JD</h3>
                            <p className="text-gray-500 text-[13px] sm:text-sm leading-relaxed">Upload a Job Description and let our AI auto-fill the entire form for you.</p>
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
    if (creationMethod === 'scan') {
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
                        {!formData.jdFileName && (
                            <>
                                <div className="h-16 w-16 bg-orange-100 rounded-2xl flex items-center justify-center text-[#F97316] mx-auto">
                                    <Upload className="h-8 w-8" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-bold text-gray-900">Upload Job Description</h2>
                                    <p className="text-gray-500">Our AI will scan all fields end-to-end to pre-fill your hiring drive.</p>
                                </div>
                            </>
                        )}
                        <JobDescription 
                            formData={formData} 
                            updateFormData={setFormData} 
                            isAnalyzing={isAnalyzing}
                            analysisError={analysisError}
                            startAnalysis={(params) => {
                                startAnalysis(params); // Run in background
                                setCreationMethod('manual'); // Transition instantly
                                setCurrentStep(0); // Land on Basic Info (Step 0)
                            }}
                            abortAnalysis={() => {
                                analysisAbortRef.current?.abort();
                                setIsAnalyzing(false);
                            }}
                            mode="scan"
                        />

                        {formData.jdFileName && !isAnalyzing && (
                            <div className="pt-4 animate-in-fade">
                                <Button 
                                    onClick={() => { setCreationMethod('manual'); setCurrentStep(0); }}
                                    className="bg-gray-900 hover:bg-gray-800 text-white px-10 h-12 rounded-2xl font-bold text-[15px] shadow-xl hover:shadow-2xl transition-all active:scale-95 flex items-center gap-2 mx-auto"
                                >
                                    Continue to Form Steps
                                    <ChevronRight className="h-5 w-5" />
                                </Button>
                            </div>
                        )}
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
                                ? `${typeof window !== 'undefined' ? window.location.origin : ''}/careers/jobs/${publishedDriveId}`
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
                    {currentStep === 0 && (
                        <BasicInfo 
                            formData={formData} 
                            updateFormData={setFormData} 
                            isAnalyzing={isAnalyzing} 
                        />
                    )}
                    {currentStep === 1 && (
                        <JobDescription 
                            formData={formData} 
                            updateFormData={setFormData} 
                            isAnalyzing={isAnalyzing}
                            analysisError={analysisError}
                            startAnalysis={startAnalysis}
                            abortAnalysis={() => {
                                analysisAbortRef.current?.abort();
                                setIsAnalyzing(false);
                            }}
                            mode="form"
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
                        <InterviewSetup
                            formData={formData}
                            updateFormData={setFormData}
                        />
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
                            regFieldCount={customFields.length + 6}
                        />
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex justify-between items-center px-8 py-4 bg-white border-t border-gray-100">
                    {currentStep === 0 ? (
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                                if (isEditMode) {
                                    router.push("/admin");
                                } else if (syncedFromAi) {
                                    router.push("/admin/create-drive/ai-chat");
                                } else if (formData.jdFileName) {
                                    // Go back to the scan upload screen where our file is still visible
                                    analysisAbortRef.current?.abort();
                                    setIsAnalyzing(false);
                                    setCreationMethod('scan');
                                } else {
                                    setCreationMethod(null);
                                }
                            }}
                            className="border-gray-300 bg-white text-gray-800 hover:bg-gray-50 h-9 font-semibold"
                        >
                            {isEditMode ? "Cancel" : "Back"}
                        </Button>
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
                    customFields={customFields}
                    regFieldCount={customFields.length + 6}
                    onClose={() => setShowCandidatePreview(false)}
                />
            )}
        </div>
    );
}
