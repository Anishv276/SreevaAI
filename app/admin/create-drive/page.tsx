"use client";



import { useState, useRef, useEffect, Suspense } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

import { Steps } from "@/components/create-drive/steps";

import { toast } from "@/components/ui/toast-custom";

import { BasicInfo } from "@/components/create-drive/basic-info";

import { JobDescription } from "@/components/create-drive/job-description";

import { ScreeningSettings, ScreeningConfig } from "@/components/create-drive/screening-settings";

import { RegistrationForm, CustomField } from "@/components/create-drive/registration-form";

import { FinalPreview } from "@/components/create-drive/final-preview";

import { InterviewSetup } from "@/components/create-drive/interview-setup";

import { useJobs } from "@/context/jobs-context";

import { cn } from "@/lib/utils";

import { Copy, CheckCircle2, Rocket, AlertCircle, X, Eye, PenLine, Sparkles, ChevronLeft, ChevronRight, Upload, Bot, ExternalLink, Loader2 } from "lucide-react";



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

    1: "Job description is too short. Please add more details before continuing.",

    2: "Please set an AI match threshold before continuing.",

    3: "Configure registration form fields (optional).",

};



const MIN_JD_WORDS = 30;



function countWords(text: string): number {

    return text.trim().split(/\s+/).filter(Boolean).length;

}



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

        workMode: "",

        location: "",

        employmentType: "",

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

        interviewQuestions: [],

    });

    const [creationMethod, setCreationMethod] = useState<null | 'manual' | 'scan'>(isEditMode ? 'manual' : null);

    const [published, setPublished] = useState(false);

    const [publishedDriveId, setPublishedDriveId] = useState<string | null>(null);

    const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

    const [copied, setCopied] = useState(false);



    // Lifted state

    const [aiEnabled, setAiEnabled] = useState(true);

    const [shortlistMode, setShortlistMode] = useState<"automatic" | "manual">("automatic");

    const [weights, setWeights] = useState<ScreeningConfig>({ threshold: 60 });

    const [customFields, setCustomFields] = useState<CustomField[]>([]);

    const [isPassportRequired, setIsPassportRequired] = useState(false);



    // AI Analysis State

    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const [candidatePreviewSlug, setCandidatePreviewSlug] = useState<string | null>(null);



    // Track which steps have been explicitly completed

    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set(isEditMode ? [0, 1, 2, 3, 4, 5] : []));

    const [maxStepReached, setMaxStepReached] = useState(isEditMode ? 5 : 0);

    const [syncedFromAi, setSyncedFromAi] = useState(false);

    const [isSavingDraft, setIsSavingDraft] = useState(false);

    const formRef = useRef<HTMLDivElement>(null);

    const analysisAbortRef = useRef<AbortController | null>(null);

    const hasInitialLoadedRef = useRef<string | null>(null);

    const formDataRef = useRef<any>(formData);



    // Keep ref in sync with state for use in async handlers

    useEffect(() => {

        formDataRef.current = formData;

    }, [formData]);

    // Cleanup blob URLs to prevent memory leaks
    useEffect(() => {
        const url = formData.jdPreviewUrl;
        return () => {
            if (url && url.startsWith("blob:")) {
                URL.revokeObjectURL(url);
            }
        };
    }, [formData.jdPreviewUrl]);



    // Organization location fetch disabled to prevent unwanted defaults

    /*

    useEffect(() => {

        if (!isEditMode && !formData.location) {

            fetch("/api/admin/organization")

                .then(res => res.json())

                .then(data => {

                    if (data.location) {

                        setFormData((prev: any) => ({ ...prev, location: data.location }));

                    }

                })

                .catch(() => { });

        }

    }, [isEditMode, formData.location]);

    */



    // Sync completed steps if we enter edit mode (e.g. after first save)

    useEffect(() => {

        if (isEditMode) {

            setCompletedSteps(new Set([0, 1, 2, 3, 4, 5]));

            setMaxStepReached(5);

        }

    }, [isEditMode]);



    // Initial load for edit mode

    useEffect(() => {

        if (isEditMode && jobs.length > 0 && hasInitialLoadedRef.current !== driveId) {

            const drive = jobs.find(j => j.id === driveId);

            if (drive) {

                hasInitialLoadedRef.current = driveId;

                setPublishedDriveId(drive.id);

                setFormData((prev: any) => ({

                    ...prev,

                    title: drive.title,

                    role: (drive as any).role || drive.title,

                    department: drive.department,

                    workMode: (drive as any).workMode || "",

                    location: (drive as any).location || "",

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


                    interviewQuestions: typeof (drive as any).interviewQuestions === 'string'

                        ? JSON.parse((drive as any).interviewQuestions)

                        : ((drive as any).interviewQuestions || []),

                    extractedDetails: (drive as any).extractedDetails || {},

                    jdFileName: (drive as any).jdFileName || "",

                    jdPreviewUrl: (drive as any).jdPreviewUrl || "",

                }));



                // Load screening configuration correctly

                const dbThreshold = (drive as any).screeningThreshold;

                const dbAiEnabled = (drive as any).aiScreeningEnabled;

                // Set weights, giving priority to the specific threshold column

                setWeights({

                    threshold: typeof dbThreshold === 'number' ? dbThreshold : 60

                });



                // Set AI enabled status

                setAiEnabled(dbAiEnabled ?? true);

                if ((drive as any).registrationFields) {

                    try {

                        const fields = typeof (drive as any).registrationFields === 'string'

                            ? JSON.parse((drive as any).registrationFields)

                            : (drive as any).registrationFields;

                        setCustomFields(fields);

                    } catch (e) { console.error("Failed to parse reg fields", e); }

                }

                setIsPassportRequired((drive as any).isPassportRequired || false);

                if ((drive as any).shortlistMode) {

                    setShortlistMode((drive as any).shortlistMode as "automatic" | "manual");

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

                    toast.success("Job Description synced from AI Assistant!");

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

                    workMode: "",

                    location: "",

                    employmentType: "",

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



                    //  SKILLS MAPPING 

                    // Extract 'skill' string from new object schema

                    const mustHaveArr = Array.isArray(skills?.must_have)

                        ? skills.must_have.map((s: any) => typeof s === 'object' ? s.skill : s)

                        : [];

                    const goodToHaveArr = Array.isArray(skills?.good_to_have)

                        ? skills.good_to_have.map((s: any) => typeof s === 'object' ? s.skill : s)

                        : [];

                    const allSkills = [...mustHaveArr, ...goodToHaveArr].filter(Boolean).join(", ");



                    //  DESCRIPTION MAPPING 

                    const desc = extracted.role_summary || extracted.summary || extracted.description || extracted.job_description || text || prev.description;



                    //  EXPERIENCE MAPPING 

                    // Convert numeric years to readable string

                    const minExp = experience?.min_years;

                    const maxExp = experience?.max_years;

                    let expText = prev.experience;

                    if (typeof minExp === 'number') {

                        expText = `${minExp}${maxExp ? `–${maxExp}` : "+"}`;

                    }



                    //  SALARY MAPPING 

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

                        salaryText = `${minLPA}${maxLPA ? `–${maxLPA}` : ""} LPA ${currency}`;

                    }



                    //  RESPONSIBILITIES & REQUIREMENTS 

                    // Use new 'responsibilities_flat' if available

                    const respArr = extracted.responsibilities_flat || extracted.responsibilities;

                    const resp = Array.isArray(respArr)

                        ? respArr.map((r: any) => typeof r === 'object' ? r.task : r).join("\n")

                        : (typeof respArr === 'string' ? respArr : (prev.responsibilities || ""));



                    //  REQUIREMENTS 

                    // Use extracted requirements; synthesize from education + skills as robust fallback

                    let reqArr: string[] = [];

                    if (Array.isArray(extracted.requirements)) {

                        reqArr = [...extracted.requirements];

                    }



                    // 1. Ensure Education is mentioned

                    const eduReq = extracted.education?.required;

                    if (eduReq && !reqArr.some(r => r.toLowerCase().includes(eduReq.toLowerCase().split(' ')[0]))) {

                        reqArr.unshift(eduReq);

                    }



                    // 2. Ensure Experience is mentioned if not present

                    if (typeof experience?.min_years === 'number' && !reqArr.some(r => r.includes(String(experience.min_years)) && r.toLowerCase().includes("year"))) {

                        reqArr.push(`${experience.min_years}+ years of professional experience in ${extracted.job_title || 'relevant domain'}`);

                    }



                    // 3. Add Deal Breakers as requirements

                    if (Array.isArray(extracted.deal_breakers)) {

                        extracted.deal_breakers.forEach((db: any) => {

                            const cond = typeof db === 'object' ? db.condition : db;

                            if (cond && !reqArr.includes(cond)) reqArr.push(cond);

                        });

                    }



                    // 4. Fallback: Proficiency in core skills

                    if (reqArr.length < 3 && mustHaveArr.length > 0) {

                        mustHaveArr.slice(0, 3).forEach((s: string) => {

                            const skillStr = `Deep proficiency in ${s}`;

                            if (!reqArr.includes(skillStr)) reqArr.push(skillStr);

                        });

                    }



                    const req = reqArr.length > 0 ? reqArr.join("\n") : (prev.requirements || "");



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

                        // Keep the R2 URL if available, otherwise keep the existing blob URL for in-session preview

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



    /** Returns true if the step looks sufficiently filled to proceed */

    const isStepValid = (step: number): boolean => {

        if (step === 0) {

            const { title, role, department, workMode, employmentType, deadline } = formData;

            return !!(title && role && department && workMode && employmentType && deadline);

        }

        if (step === 1) {

            // Only allow proceeding if not currently mid-analysis

            if (isAnalyzing) return true;



            const description = formData.description?.trim() || "";

            // Must have a description and it must meet the minimum word count

            return countWords(description) >= MIN_JD_WORDS;

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



    const autoSaveDrive = async () => {

        const currentFormData = formDataRef.current;

        // Collect data

        let parsedQuestions = currentFormData.interviewQuestions || [];

        if (typeof parsedQuestions === "string") {

            try { parsedQuestions = JSON.parse(parsedQuestions); } catch { parsedQuestions = []; }

        }



        const jobData = {

            title: currentFormData.title || "Untitled Drive",

            description: currentFormData.description || "",

            role: currentFormData.role || "",

            department: currentFormData.department || "",

            employmentType: currentFormData.employmentType || "",

            workMode: currentFormData.workMode || "",

            location: currentFormData.location || "",

            positions: currentFormData.positions || 1,

            deadline: currentFormData.deadline || null,

            salary: currentFormData.salary || "",

            experience: currentFormData.experience || "",

            skills: currentFormData.skills || "",

            responsibilities: currentFormData.responsibilities || "",

            requirements: currentFormData.requirements || "",

            jdFileName: currentFormData.jdFileName || null,

            jdPreviewUrl: currentFormData.jdPreviewUrl,

            interviewEnabled: currentFormData.interviewEnabled,

            interviewLanguage: currentFormData.interviewLanguage,

            interviewTime: currentFormData.interviewTime,

            interviewAntiCheat: currentFormData.interviewAntiCheat,

            interviewQuestions: parsedQuestions,

            registrationFields: customFields,

            extractedDetails: currentFormData.extractedDetails || {},

            screeningThreshold: weights?.threshold || 0,

            isPassportRequired: isPassportRequired,

            shortlistMode: shortlistMode,

            aiScreening: {

                enabled: aiEnabled

            },

        };



        try {

            setIsSavingDraft(true);

            if (isEditMode) {

                await updateJob(driveId!, jobData);

            } else {

                // If it's a new drive, we only save if we have at least the basic fields from step 0

                if (formData.title && formData.role && formData.department) {

                    const result = await addJob({

                        ...jobData,

                        status: "ACTIVE",

                        postedAt: new Date().toISOString(),

                    } as any);

                    if (result?.id) {

                        // Update URL to include the new ID

                        const params = new URLSearchParams(window.location.search);

                        params.set("id", result.id);

                        router.replace(`${window.location.pathname}?${params.toString()}`);

                    }

                }

            }

        } catch (error) {

            console.error("Auto-save failed:", error);

        } finally {

            setIsSavingDraft(false);

        }

    };



    const nextStep = async () => {

        if (currentStep === STEPS.length - 1) {

            handlePublish();

            return;

        }

        if (!isStepValid(currentStep)) {

            toast.error(STEP_VALIDATION_HINTS[currentStep]);

            return;

        }



        // Auto-save progress on every "Save & Continue"

        await autoSaveDrive();



        setCompletedSteps(prev => new Set(prev).add(currentStep));

        const next = Math.min(currentStep + 1, STEPS.length - 1);

        setMaxStepReached(prev => Math.max(prev, next));

        setCurrentStep(next);

    };



    // Allow navigating to any step in edit mode or previously completed steps

    const handleStepClick = async (index: number) => {

        if (isSavingDraft) return;



        // In edit mode or if the step was previously reached/completed, just jump

        if (isEditMode || index <= maxStepReached || completedSteps.has(index)) {

            // Auto-save before jumping to ensure no data loss

            await autoSaveDrive();

            setCurrentStep(index);

            return;

        }



        // If it's the next immediate step beyond what we've reached, check if current is valid

        if (index === currentStep + 1) {

            if (isStepValid(currentStep)) {

                await autoSaveDrive();

                setCompletedSteps(prev => new Set(prev).add(currentStep));

                setMaxStepReached(prev => Math.max(prev, index));

                setCurrentStep(index);

            } else {

                toast.error(STEP_VALIDATION_HINTS[currentStep]);

            }

        }

    };



    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));



    const handlePublish = async () => {

        const currentFormData = formDataRef.current;

        setIsSavingDraft(true);

        const description = currentFormData.description?.trim() || "";

        const jdWordCount = countWords(description);

        if (jdWordCount < MIN_JD_WORDS) {

            toast.error(`Job description must be at least ${MIN_JD_WORDS} words before publishing.`);

            setCurrentStep(1);

            return;

        }



        // Safely parse interviewQuestions - DB returns it as a JSON string, Zod expects an array

        let parsedQuestions = currentFormData.interviewQuestions || [];

        if (typeof parsedQuestions === "string") {

            try { parsedQuestions = JSON.parse(parsedQuestions); } catch { parsedQuestions = []; }

        }



        // Explicitly pick only the fields that match the Zod schema

        const jobData = {

            title: currentFormData.title,

            description: currentFormData.description,

            role: currentFormData.role,

            department: currentFormData.department,

            employmentType: currentFormData.employmentType,

            workMode: currentFormData.workMode,

            location: currentFormData.location,

            positions: currentFormData.positions,

            deadline: currentFormData.deadline || null,

            salary: currentFormData.salary,

            experience: currentFormData.experience,

            skills: currentFormData.skills,

            responsibilities: currentFormData.responsibilities,

            requirements: currentFormData.requirements,

            jdFileName: currentFormData.jdFileName,

            jdPreviewUrl: currentFormData.jdPreviewUrl,

            interviewEnabled: currentFormData.interviewEnabled,

            interviewLanguage: currentFormData.interviewLanguage,

            interviewTime: currentFormData.interviewTime,

            interviewAntiCheat: currentFormData.interviewAntiCheat,

            interviewQuestions: parsedQuestions,

            registrationFields: customFields,

            extractedDetails: currentFormData.extractedDetails || {},

            screeningThreshold: weights?.threshold || 0,

            isPassportRequired: isPassportRequired,

            shortlistMode: shortlistMode,

            aiScreening: {

                enabled: aiEnabled

            },

        };



        console.log("handlePublish called. isEditMode:", isEditMode, "Data:", jobData);



        try {

            let result;

            let savedId: string | null = null;



            if (isEditMode) {

                console.log("Logic: Updating existing job", driveId);

                result = await updateJob(driveId!, jobData);

                savedId = driveId;

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

                setPublishedSlug(result?.slug || null);

                setPublished(true);

                toast.success(isEditMode ? "Drive updated successfully!" : "Drive published successfully!");

            } else {

                console.error("Save succeeded but no ID returned. Result:", result);

                throw new Error("Failed to retrieve Drive ID after saving. Please check the dashboard.");

            }

        } catch (error: any) {

            console.error("Save process failed:", error);

            const msg = error.details ? `${error.message}: ${JSON.stringify(error.details)}` : error.message;

            toast.error(msg || "Failed to save drive details. Please try again.");

        } finally {

            setIsSavingDraft(false);

        }

    };



    const handleCopy = () => {

        const link = `${window.location.origin}/careers/jobs/${publishedSlug || publishedDriveId}`;

        navigator.clipboard.writeText(link);

        setCopied(true);

        setTimeout(() => setCopied(false), 2000);

    };



    const previewTarget = publishedSlug || publishedDriveId || (isEditMode ? driveId : null);



    //  Choice Gate (Selection Screen) 

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

                            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">JD Assistant</h3>

                            <p className="text-gray-500 text-[13px] sm:text-sm leading-relaxed">Design your Job Description instantly through a pro AI chat creator.</p>

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



    //  AI Scan Initial Screen 

    if (creationMethod === 'scan') {

        return (

            <div className="max-w-3xl mx-auto py-12 space-y-8 animate-in-fade">

                <button

                    onClick={() => setCreationMethod(null)}

                    className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"

                >

                    <ChevronLeft className="h-4 w-4" /> Back to Creation Methods

                </button>



                <div className="bg-white p-12 rounded-[2.5rem] border-2 border-dashed border-gray-200 hover:border-orange-300 transition-all duration-500">

                    <div className="text-center space-y-6">

                        <>

                            <div className="h-16 w-16 bg-orange-100 rounded-2xl flex items-center justify-center text-[#F97316] mx-auto">

                                <Upload className="h-8 w-8" />

                            </div>

                            <div className="space-y-2">

                                <h2 className="text-2xl font-bold text-gray-900">Upload Job Description</h2>

                                <p className="text-gray-500">Our AI will scan all fields end-to-end to pre-fill your hiring drive.</p>

                            </div>

                        </>



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



    //  Success screen 

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

                        <span className="flex-1 text-[13px] font-sans text-gray-700 text-left truncate">

                            {publishedDriveId

                                ? `${typeof window !== 'undefined' ? window.location.origin : ''}/careers/jobs/${publishedSlug || publishedDriveId}`

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



    //  Form screen 

    return (

        <div className="max-w-4xl mx-auto py-4 space-y-4">

            <button

                onClick={() => {

                    if (!isEditMode) setCreationMethod(null);

                    else router.push("/admin/drives");

                }}

                className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"

            >

                <ChevronLeft className="h-4 w-4" />

                {isEditMode ? "Back to All Drives" : "Back to Creation Methods"}

            </button>

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



            <Steps steps={STEPS} currentStep={currentStep} onStepClick={handleStepClick} isEditMode={isEditMode} maxStepReached={maxStepReached} />



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

                        <ScreeningSettings

                            config={weights}

                            setConfig={setWeights}

                            aiEnabled={aiEnabled}

                            setAiEnabled={setAiEnabled}

                            shortlistMode={shortlistMode}

                            setShortlistMode={setShortlistMode}

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

                            isPassportRequired={isPassportRequired}

                            setIsPassportRequired={setIsPassportRequired}

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

                                onClick={() => {

                                    // Map current form data to a structure compatible with JobDetailsView

                                    const previewPayload = {

                                        ...formData,

                                        id: "preview",

                                        applicants: 0,

                                        status: "ACTIVE",

                                        // Ensure split-able strings are present

                                        responsibilities: formData.responsibilities || "",

                                        requirements: formData.requirements || "",

                                        skills: formData.skills || "",

                                        location: formData.workMode || "",

                                        type: formData.employmentType || "Full-time"

                                    };



                                    localStorage.setItem("candidate_preview_data", JSON.stringify(previewPayload));



                                    if (!previewTarget) {

                                        setCandidatePreviewSlug("preview");

                                    } else {

                                        setCandidatePreviewSlug(previewTarget);

                                    }

                                }}

                                className="flex items-center gap-2 rounded-xl px-4 py-3 border-gray-200 text-gray-500 font-bold hover:bg-gray-50 h-auto"

                            >

                                <Eye className="h-4 w-4" />

                                Preview as Candidate

                            </Button>

                            <button

                                type="button"

                                onClick={handlePublish}

                                disabled={isSavingDraft}

                                className={cn(

                                    "flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed",

                                    !isSavingDraft && "hover:shadow-lg"

                                )}

                                style={{

                                    background: "linear-gradient(135deg, #F97316, #ea6608)",

                                    animation: isSavingDraft ? "none" : "pulse-glow 2s infinite",

                                }}

                            >

                                {isSavingDraft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}

                                {isSavingDraft ? "Saving..." : (isEditMode ? "Update Drive" : "Publish Drive")}

                            </button>

                        </div>

                    ) : (

                        <Button

                            onClick={nextStep}

                            disabled={isSavingDraft}

                            size="sm"

                            className="bg-gradient-to-r from-[#F97316] to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white shadow-md hover:shadow-lg transition-all duration-200 px-6 h-9 min-w-[140px]"

                        >

                            {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}

                            {isSavingDraft ? "Saving..." : "Save & Continue"}

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



            {candidatePreviewSlug && (

                <div className="fixed inset-0 z-[200] flex flex-col bg-black/60 backdrop-blur-sm">

                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-white/10 shrink-0">

                        <div className="flex items-center gap-1.5">

                            <button

                                onClick={() => setCandidatePreviewSlug(null)}

                                className="h-3.5 w-3.5 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center group"

                                title="Close preview"

                            >

                                <X className="h-2 w-2 text-red-900 opacity-0 group-hover:opacity-100 transition-opacity" />

                            </button>

                            <div className="h-3.5 w-3.5 rounded-full bg-yellow-400/60" />

                            <div className="h-3.5 w-3.5 rounded-full bg-green-500/60" />

                        </div>

                        <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 mx-2">

                            <div className="h-1.5 w-1.5 rounded-full bg-green-400" />

                            <span className="text-[11px] text-gray-400 font-sans truncate select-none">

                                {typeof window !== "undefined" ? window.location.origin : ""}/careers/jobs/{candidatePreviewSlug}

                            </span>

                        </div>

                        <div className="flex items-center gap-2">

                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">

                                Preview as Candidate

                            </span>

                            <button

                                onClick={() => window.open(`/careers/jobs/${candidatePreviewSlug}`, "_blank")}

                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"

                                title="Open in new tab"

                            >

                                <ExternalLink className="h-4 w-4" />

                            </button>

                            <button

                                onClick={() => setCandidatePreviewSlug(null)}

                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"

                                title="Close"

                            >

                                <X className="h-4 w-4" />

                            </button>

                        </div>

                    </div>

                    <iframe

                        key={candidatePreviewSlug}

                        src={`/careers/jobs/${candidatePreviewSlug}`}

                        className="flex-1 w-full border-0 bg-white"

                        title="Candidate Portal Preview"

                    />

                </div>

            )}

        </div>

    );

}



