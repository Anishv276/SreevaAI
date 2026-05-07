"use client";
import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Steps } from "@/components/create-drive/steps";
import { toast } from "@/components/ui/toast-custom";
import { BasicInfo } from "@/components/create-drive/basic-info";
import { JobDescription } from "@/components/create-drive/job-description";
import { FinalPreview } from "@/components/create-drive/final-preview";
import { InterviewSetup } from "@/components/create-drive/interview-setup";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked } from "@/lib/interview-quota";
import { canUseMultilingual } from "@/lib/org-plans";
import { formatSalaryValue, splitSalaryValue } from "@/lib/salary-format";
import {
  formatDriveLimit,
  getActiveDriveCount,
  isDriveCreationLocked,
} from "@/lib/drive-limits";
import {
  Copy,
  CheckCircle2,
  Rocket,
  AlertCircle,
  X,
  Eye,
  PenLine,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Upload,
  Bot,
  ExternalLink,
  Loader2,
  Lock,
} from "lucide-react";
const STEPS = ["Basic Info", "Job Description", "Interview", "Preview"];
// const CANDIDATE_LINK = "sreevaai.com/careers/jobs/backend-engineer-2024";
// Per-step validation messages shown when fields appear incomplete
const STEP_VALIDATION_HINTS: Record<number, string> = {
  0: "Please fill all required fields.",
  1: "Job description is too short. Please add more details before continuing.",
  2: "Configure interview settings (optional).",
};
const MIN_JD_WORDS = 30;
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
export default function CreateDrivePage() {
  return (
    <div style={{ zoom: 0.75, transformOrigin: "top center" }}>
      <Suspense fallback={<div>Loading...</div>}>
        <CreateDriveForm />
      </Suspense>
    </div>
  );
}
function CreateDriveForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const driveId = searchParams.get("id");
  const isEditMode = !!driveId;
  const isEditAction = searchParams.get("mode") === "edit";
  const { addJob, jobs, updateJob, fetchJobs, organization } = useJobs();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<any>({
    title: "",
    role: "",
    department: "",
    workMode: "",
    location: "",
    employmentType: "",
    description: "",
    salary: "",
    experience: "",
    skills: "",
    responsibilities: "",
    requirements: "",
    interviewLanguage: "English",
    interviewQuestions: [],
    ttsProvider: "",
    cartesiaVoiceId: null,
    sarvamVoice: null,
    googleModel: null,
    googleVoiceName: null,
    aiName: "Ishitha",
  });
  const [creationMethod, setCreationMethod] = useState<
    null | "manual" | "scan"
  >(isEditMode ? "manual" : null);
  const [published, setPublished] = useState(false);
  const [publishedDriveId, setPublishedDriveId] = useState<string | null>(null);
  // Lifted state
  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // Track which steps have been explicitly completed
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    new Set(isEditMode ? [0, 1, 2, 3] : []),
  );
  const [maxStepReached, setMaxStepReached] = useState(isEditMode ? 3 : 0);
  const [syncedFromAi, setSyncedFromAi] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [quotaLocked, setQuotaLocked] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const hasInitialLoadedRef = useRef<string | null>(null);
  const formDataRef = useRef<any>(formData);
  const activeDriveCount =
    organization?.activeDriveCount ?? getActiveDriveCount(jobs);
  const maxActiveDrives = organization?.maxActiveDrives;
  const allowLanguageSelection = canUseMultilingual(organization?.plan);
  const driveCreationLocked =
    !isEditMode && (isDriveCreationLocked(maxActiveDrives, activeDriveCount) || quotaLocked);
  // Keep ref in sync with state for use in async handlers
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  useEffect(() => {
    if (isEditMode) return;
    let cancelled = false;
    const loadQuota = async () => {
      try {
        const res = await fetch("/api/admin/credits", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQuotaLocked(isInterviewQuotaLocked(data));
      } catch {
        // ignore
      }
    };
    loadQuota();
    return () => {
      cancelled = true;
    };
  }, [isEditMode]);
  // Cleanup blob URLs to prevent memory leaks
  useEffect(() => {
    const url = formData.jdPreviewUrl;
    return () => {
      if (url && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    };
  }, [formData.jdPreviewUrl]);
  useEffect(() => {
    if (!isEditMode) {
      fetch("/api/admin/organization", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) return;
          const orgProvider = data.ttsProvider || "CARTESIA";
          setFormData((prev: any) => ({
            ...prev,
            location: prev.location || data.location || "",
            // Lock the provider from org setting
            ttsProvider: orgProvider,
            // Only set the active provider's voice; null out the other
            cartesiaVoiceId:
              orgProvider === "CARTESIA"
                ? data.cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
                : null,
            sarvamVoice:
              orgProvider === "SARVAM" ? data.sarvamVoice || "shubh" : null,
            googleModel:
              orgProvider === "GOOGLE"
                ? data.googleModel || "gemini-3.1-flash-tts-preview"
                : null,
            googleVoiceName:
              orgProvider === "GOOGLE" ? data.googleVoiceName || "Puck" : null,
          }));
        })
        .catch(() => {});
    }
  }, [isEditMode]);
  useEffect(() => {
    if (!allowLanguageSelection && formData.interviewLanguage !== "English") {
      setFormData((prev: any) => ({
        ...prev,
        interviewLanguage: "English",
      }));
    }
  }, [allowLanguageSelection, formData.interviewLanguage]);
  // Sync completed steps if we enter edit mode (e.g. after first save)
  useEffect(() => {
    if (isEditMode) {
      setCompletedSteps(new Set([0, 1, 2, 3, 4, 5]));
      setMaxStepReached(5);
    }
  }, [isEditMode]);
  // Initial load for edit mode - Fetch specific drive by ID to ensure we have all data
  useEffect(() => {
    if (isEditMode && hasInitialLoadedRef.current !== driveId) {
      const loadDrive = async () => {
        try {
          const res = await fetch(`/api/drives/${driveId}`, { cache: "no-store" });
          if (!res.ok) {
            toast.error("Failed to fetch drive details");
            return;
          }
          const drive = await res.json();
          if (drive.error) {
            toast.error(drive.error);
            return;
          }

          hasInitialLoadedRef.current = driveId;
          setPublishedDriveId(drive.id);

          // Fetch org config to get the authoritative ttsProvider
          const orgRes = await fetch("/api/admin/organization", { cache: "no-store" });
          const orgData = await orgRes.json();
          
          const orgProvider =
            (orgData.error ? null : orgData.ttsProvider) ||
            (drive as any).ttsProvider ||
            "CARTESIA";

          setFormData((prev: any) => ({
            ...prev,
            title: drive.title,
            role: (drive as any).role || drive.title,
            department: drive.department,
            workMode: (drive as any).workMode || "",
            location: (drive as any).location || "",
            employmentType: drive.type,
            description: drive.description,
            skills: (drive as any).skills || "",
            responsibilities: (drive as any).responsibilities || "",
            requirements: (drive as any).requirements || "",
            experience: (drive as any).experience || "",
            salary: (() => {
              const salaryValue = splitSalaryValue((drive as any).salary || "", "INR");
              return salaryValue.amount ? formatSalaryValue(salaryValue.amount, salaryValue.currency) : "";
            })(),
            interviewLanguage: (drive as any).interviewLanguage || "English",
            interviewQuestions:
              typeof (drive as any).interviewQuestions === "string"
                ? JSON.parse((drive as any).interviewQuestions)
                : (drive as any).interviewQuestions || [],
            jdFileName: (drive as any).jdFileName || "",
            jdPreviewUrl: (drive as any).jdPreviewUrl || "",
            // Org is the authority for provider; drive provides the voice ID
            ttsProvider: orgProvider,
            cartesiaVoiceId:
              orgProvider === "CARTESIA"
                ? (drive as any).cartesiaVoiceId ||
                  orgData.cartesiaVoiceId ||
                  "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
                : null,
            sarvamVoice:
              orgProvider === "SARVAM"
                ? (drive as any).sarvamVoice || orgData.sarvamVoice || "shubh"
                : null,
            googleModel:
              orgProvider === "GOOGLE"
                ? (drive as any).googleModel ||
                  orgData.googleModel ||
                  "gemini-3.1-flash-tts-preview"
                : null,
            googleVoiceName:
              orgProvider === "GOOGLE"
                ? (drive as any).googleVoiceName ||
                  orgData.googleVoiceName ||
                  "Puck"
                : null,
            aiName: (drive as any).aiName || "Ishitha",
          }));
        } catch (err) {
          console.error("Failed to load drive:", err);
          toast.error("An error occurred while loading drive details");
        }
      };

      loadDrive();
    }
  }, [isEditMode, driveId]);
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
          description: "",
          salary: "",
          experience: "",
          skills: "",
          responsibilities: "",
          requirements: "",
                interviewLanguage: "English",
                interviewQuestions: [],
          ttsProvider: "",
          cartesiaVoiceId: null,
          sarvamVoice: null,
          googleModel: null,
          googleVoiceName: null,
          aiName: "Ishitha",
        });
        setCreationMethod(null);
        setCurrentStep(0);
        setIsAnalyzing(false);
        setAnalysisError(null);
      }
    }
  }, [isEditMode, searchParams]);
  const startAnalysis = async ({
    file,
    url,
  }: {
    file?: File;
    url?: string;
  }) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    // FORCE UPDATE NEW FILENAME IMMEDIATELY
    if (file) {
      setFormData((prev: any) => ({
        ...prev,
        jdFileName: file.name,
        jdFile: file,
        jdPreviewUrl: URL.createObjectURL(file),
      }));
    } else if (url) {
      setFormData((prev: any) => ({
        ...prev,
        jdFileName: "Extracted from Link",
        jdPreviewUrl: url,
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
        signal: controller.signal,
      });
      if (res.ok) {
        const responseData = await res.json().catch(() => null);
        if (!responseData) {
          console.error("Extraction error response:", {});
          setAnalysisError("Failed to extract JD details.");
          return;
        }
        const { data: extracted, text, url: r2Url } = responseData;
        if (!extracted && !text && !r2Url) {
          console.error("Extraction error response:", responseData);
          setAnalysisError(
            responseData.error || "Failed to extract JD details.",
          );
          return;
        }
        console.log("Analysis success:", extracted);
        const extractedDescriptionCandidate = (extracted?.role_summary || text || "").trim();
        const extractedDescriptionWordCount = countWords(extractedDescriptionCandidate);
        if (extractedDescriptionCandidate && extractedDescriptionWordCount < MIN_JD_WORDS) {
          setAnalysisError(
            `Extracted JD is only ${extractedDescriptionWordCount} words. Please provide at least ${MIN_JD_WORDS} words before continuing.`,
          );
          return;
        }
        // Map extracted JD schema to form fields
        setFormData((prev: any) => {
          const experience = extracted?.experience;
          const skills = extracted?.skills;
          const salary = extracted?.salary;
          // Skills: must_have is [{skill, weight}], good_to_have is [string]
          const mustHaveArr: string[] = Array.isArray(skills?.must_have)
            ? skills.must_have
                .map((s: any) => (typeof s === "object" ? s.skill : s))
                .filter(Boolean)
            : [];
          const goodToHaveArr: string[] = Array.isArray(skills?.good_to_have)
            ? skills.good_to_have
                .map((s: any) => (typeof s === "string" ? s : s?.skill))
                .filter(Boolean)
            : [];
          const allSkills = [...mustHaveArr, ...goodToHaveArr]
            .map((s) => (s.startsWith("•") ? s : `• ${s}`))
            .join("\n");
          // Description: use role_summary, fallback to raw extracted text
          const desc = extracted?.role_summary || text || prev.description || "";
          const normalizedDescription = desc.trim();
          // Experience: convert to readable string e.g. "2+" or "2Ã¢â‚¬â€œ5"
          const minExp = experience?.min_years;
          const maxExp = experience?.max_years;
          const expText =
            typeof minExp === "number"
              ? `${minExp}${maxExp ? `Ã¢â‚¬â€œ${maxExp}` : "+"}`
              : prev.experience;
          // Salary: convert large INR numbers to LPA
          const salaryMin = salary?.min;
          const salaryMax = salary?.max;
          const currency = salary?.currency || "INR";
          let salaryText = prev.salary;
          if (typeof salaryMin === "number") {
            const toLPA = (n: number) =>
              n > 1000
                ? (n / 100000).toFixed(1).replace(/\.0$/, "")
                : String(n);
            salaryText = formatSalaryValue(`${toLPA(salaryMin)}${salaryMax ? `-${toLPA(salaryMax)}` : ""}`, currency);
          }
          // Responsibilities: flat string array from new schema
          const resp =
            Array.isArray(extracted?.responsibilities) &&
            extracted.responsibilities.length > 0
              ? extracted.responsibilities
                  .map((r: string) => (r.startsWith("•") ? r : `• ${r}`))
                  .join("\n")
              : prev.responsibilities;
          // Requirements: flat string array + education fallback
          let reqArr: string[] = Array.isArray(extracted?.requirements)
            ? [...extracted.requirements]
            : [];
          const eduReq = extracted?.education?.required;
          if (
            eduReq &&
            !reqArr.some((r) =>
              r.toLowerCase().includes(eduReq.toLowerCase().slice(0, 10)),
            )
          ) {
            reqArr.unshift(eduReq);
          }
          if (
            typeof minExp === "number" &&
            !reqArr.some(
              (r) =>
                r.includes(String(minExp)) && r.toLowerCase().includes("year"),
            )
          ) {
            reqArr.push(
              `${minExp}+ years of experience in ${extracted?.job_title || "relevant domain"}`,
            );
          }
          if (reqArr.length < 2 && mustHaveArr.length > 0) {
            mustHaveArr.slice(0, 3).forEach((s: string) => {
              const str = `Proficiency in ${s}`;
              if (!reqArr.includes(str)) reqArr.push(str);
            });
          }
          const req =
            reqArr.length > 0
              ? reqArr.map((r) => (r.startsWith("•") ? r : `• ${r}`)).join("\n")
              : prev.requirements;
          return {
            ...prev,
            title: `${extracted?.job_title || prev.role || "New"} Recruitment Drive`,
            role: extracted?.job_title || prev.role || "",
            description: normalizedDescription || desc,
            skills: allSkills || prev.skills,
            salary: salaryText,
            experience: expText,
            department: extracted?.department || prev.department,
            workMode: extracted?.work_type || prev.workMode,
            employmentType: extracted?.employment_type || prev.employmentType,
            responsibilities: resp,
            requirements: req,
            jdPreviewUrl: r2Url || prev.jdPreviewUrl,
          };
        });
      } else {
        const rawErrorText = await res.text().catch(() => "");
        let errData: any = null;
        if (rawErrorText.trim()) {
          try {
            errData = JSON.parse(rawErrorText);
          } catch {
            errData = { error: rawErrorText.trim() };
          }
        }
        if (errData && Object.keys(errData).length > 0) {
          console.warn("Extraction error response:", errData);
        } else {
          console.warn("Extraction failed with empty response body:", {
            status: res.status,
            statusText: res.statusText,
          });
        }
        setAnalysisError(
          errData?.error ||
            errData?.details ||
            `Failed to extract JD details (${res.status})`,
        );
      }
    } catch (e: any) {
      if (e.name === "AbortError") return; // Silence aborts
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
      const { title, role, department, workMode, employmentType } = formData;
      return !!(title && role && department && workMode && employmentType);
    }
    if (step === 1) {
      // Only allow proceeding if not currently mid-analysis
      if (isAnalyzing) return true;
      const description = formData.description?.trim() || "";
      // Must have a description and it must meet the minimum word count
      return countWords(description) >= MIN_JD_WORDS;
    }
    if (step === 2) {
      return true; // Interview always valid
    }
    return true;
  };
  const autoSaveDrive = async () => {
    const currentFormData = formDataRef.current;
    if (driveCreationLocked && !isEditMode) {
      return;
    }
    // Collect data
    let parsedQuestions = currentFormData.interviewQuestions || [];
    if (typeof parsedQuestions === "string") {
      try {
        parsedQuestions = JSON.parse(parsedQuestions);
      } catch {
        parsedQuestions = [];
      }
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
      salary: currentFormData.salary || "",
      experience: currentFormData.experience || "",
      skills: currentFormData.skills || "",
      responsibilities: currentFormData.responsibilities || "",
      requirements: currentFormData.requirements || "",
      jdFileName: currentFormData.jdFileName || null,
      jdPreviewUrl: currentFormData.jdPreviewUrl,

      interviewLanguage: allowLanguageSelection
        ? currentFormData.interviewLanguage || "English"
        : "English",
      interviewQuestions: parsedQuestions,
      ttsProvider: currentFormData.ttsProvider || "CARTESIA",
      cartesiaVoiceId:
        currentFormData.ttsProvider === "SARVAM" ||
        currentFormData.ttsProvider === "GOOGLE"
          ? null
          : currentFormData.cartesiaVoiceId ||
            "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      sarvamVoice:
        (currentFormData.ttsProvider || "CARTESIA") === "SARVAM"
          ? currentFormData.sarvamVoice || "shubh"
          : null,
      googleModel:
        currentFormData.ttsProvider === "GOOGLE"
          ? currentFormData.googleModel || "gemini-3.1-flash-tts-preview"
          : null,
      googleVoiceName:
        currentFormData.ttsProvider === "GOOGLE"
          ? currentFormData.googleVoiceName || "Puck"
          : null,
      aiName: currentFormData.aiName || "Ishitha",
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
    if (driveCreationLocked && !isEditMode) {
      toast.error(quotaLocked ? getInterviewQuotaSupportMessage("interviews") : "Drive limit reached. Go to Billing to upgrade your plan.");
      return;
    }
    if (!isStepValid(currentStep)) {
      toast.error(STEP_VALIDATION_HINTS[currentStep]);
      return;
    }
    // Auto-save progress removed as per user request to save only at the end
    // await autoSaveDrive();
    setCompletedSteps((prev) => new Set(prev).add(currentStep));
    const next = Math.min(currentStep + 1, STEPS.length - 1);
    setMaxStepReached((prev) => Math.max(prev, next));
    setCurrentStep(next);
  };
  // Allow navigating to any step in edit mode or previously completed steps
  const handleStepClick = async (index: number) => {
    if (isSavingDraft) return;
    if (driveCreationLocked && !isEditMode) {
      toast.error(quotaLocked ? getInterviewQuotaSupportMessage("interviews") : "Drive limit reached. Go to Billing to upgrade your plan.");
      return;
    }
    // In edit mode or if the step was previously reached/completed, just jump
    if (isEditMode || index <= maxStepReached || completedSteps.has(index)) {
      // Auto-save removed to prevent partial DB entries
      // await autoSaveDrive();
      setCurrentStep(index);
      return;
    }
    // If it's the next immediate step beyond what we've reached, check if current is valid
    if (index === currentStep + 1) {
      if (isStepValid(currentStep)) {
        // await autoSaveDrive();
        setCompletedSteps((prev) => new Set(prev).add(currentStep));
        setMaxStepReached((prev) => Math.max(prev, index));
        setCurrentStep(index);
      } else {
        toast.error(STEP_VALIDATION_HINTS[currentStep]);
      }
    }
  };
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));
  const handlePublish = async () => {
    const currentFormData = formDataRef.current;
    if (driveCreationLocked && !isEditMode) {
      toast.error(quotaLocked ? getInterviewQuotaSupportMessage("interviews") : "Drive limit reached. Go to Billing to upgrade your plan.");
      return;
    }
    setIsSavingDraft(true);
    const description = currentFormData.description?.trim() || "";
    const jdWordCount = countWords(description);
    if (jdWordCount < MIN_JD_WORDS) {
      toast.error(
        `Job description must be at least ${MIN_JD_WORDS} words before publishing.`,
      );
      setCurrentStep(1);
      return;
    }
    // Safely parse interviewQuestions - DB returns it as a JSON string, Zod expects an array
    let parsedQuestions = currentFormData.interviewQuestions || [];
    if (typeof parsedQuestions === "string") {
      try {
        parsedQuestions = JSON.parse(parsedQuestions);
      } catch {
        parsedQuestions = [];
      }
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
      salary: (() => {
        const { amount, currency } = splitSalaryValue(currentFormData.salary, "INR");
        return amount ? formatSalaryValue(amount, currency) : currentFormData.salary;
      })(),
      experience: currentFormData.experience,
      skills: currentFormData.skills,
      responsibilities: currentFormData.responsibilities,
      requirements: currentFormData.requirements,
      jdFileName: currentFormData.jdFileName,
      jdPreviewUrl: currentFormData.jdPreviewUrl,

      interviewLanguage: allowLanguageSelection
        ? currentFormData.interviewLanguage || "English"
        : "English",
      interviewQuestions: parsedQuestions,
      ttsProvider: currentFormData.ttsProvider || "CARTESIA",
      cartesiaVoiceId:
        currentFormData.ttsProvider === "SARVAM" ||
        currentFormData.ttsProvider === "GOOGLE"
          ? null
          : currentFormData.cartesiaVoiceId ||
            "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      sarvamVoice:
        (currentFormData.ttsProvider || "CARTESIA") === "SARVAM"
          ? currentFormData.sarvamVoice || "shubh"
          : null,
      googleModel:
        currentFormData.ttsProvider === "GOOGLE"
          ? currentFormData.googleModel || "gemini-3.1-flash-tts-preview"
          : null,
      googleVoiceName:
        currentFormData.ttsProvider === "GOOGLE"
          ? currentFormData.googleVoiceName || "Puck"
          : null,
      aiName: currentFormData.aiName || "Ishitha",
    };
    console.log(
      "handlePublish called. isEditMode:",
      isEditMode,
      "Data:",
      jobData,
    );
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
          postedAt: new Date().toISOString(),
        } as any);
        savedId = result?.id;
      }
      console.log("Result from API:", result);
      if (savedId) {
        setPublishedDriveId(savedId);
        setPublished(true);
        toast.success(
          isEditAction
            ? "Drive updated successfully!"
            : "Drive created successfully!",
        );
      } else {
        console.error("Save succeeded but no ID returned. Result:", result);
        throw new Error(
          "Failed to retrieve Drive ID after saving. Please check the dashboard.",
        );
      }
    } catch (error: any) {
      console.error("Save process failed:", error);
      const msg = error.details
        ? `${error.message}: ${JSON.stringify(error.details)}`
        : error.message;
      toast.error(msg || "Failed to save drive details. Please try again.");
    } finally {
      setIsSavingDraft(false);
    }
  };
  const previewTarget = publishedDriveId || (isEditMode ? driveId : null);
  //  Choice Gate (Selection Screen)
  if (!isEditMode && creationMethod === null) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-8">
        <div className="max-w-4xl mx-auto w-full space-y-12 animate-in-fade">
          <div className="flex flex-col items-center text-center space-y-4">
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">
              How would you like to start?
            </h1>
            <p className="text-gray-500 text-lg font-medium">
              Choose a method to configure your recruitment drive.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {/* Manual Option */}
            <button
              onClick={() => setCreationMethod("manual")}
              className="group relative flex flex-col items-center gap-6 p-8 sm:p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2"
            >
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:rotate-6">
                <PenLine className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <div className="space-y-2 text-center">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">
                  Fill Manually
                </h3>
                <p className="text-gray-500 text-[13px] sm:text-sm leading-relaxed">
                  Enter all drive details from scratch using our step-by-step
                  form.
                </p>
              </div>
              <div className="absolute bottom-6 right-6 h-10 w-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-transparent transition-all duration-500">
                <ChevronRight className="h-5 w-5" />
              </div>
            </button>
            {/* AI Scan Option */}
            <button
              onClick={() => setCreationMethod("scan")}
              className="group relative flex flex-col items-center gap-6 p-8 sm:p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2"
            >
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:-rotate-6">
                <Sparkles className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <div className="space-y-2 text-center">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">
                  Scan from JD
                </h3>
                <p className="text-gray-500 text-[13px] sm:text-sm leading-relaxed">
                  Upload a Job Description and let our AI auto-fill the entire
                  form for you.
                </p>
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
      </div>
    );
  }
  //  AI Scan Initial Screen
  if (creationMethod === "scan") {
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
                <h2 className="text-2xl font-bold text-gray-900">
                  Upload Job Description
                </h2>
                <p className="text-gray-500">
                  Our AI will scan all fields end-to-end to pre-fill your hiring
                  drive.
                </p>
              </div>
            </>
            <JobDescription
              formData={formData}
              updateFormData={setFormData}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              startAnalysis={(params) => {
                startAnalysis(params); // Run in background
                setCreationMethod("manual"); // Transition instantly
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
                  onClick={() => {
                    setCreationMethod("manual");
                    setCurrentStep(0);
                  }}
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
          <h1 className="text-2xl font-bold text-gray-900">
            Your Drive is {isEditAction ? "Updated" : "Created"}! Ã°Å¸Å½â€°
          </h1>
          <p className="text-gray-500 mt-2 text-[15px]">
            Your recruitment drive is ready. Go to your drives list to start
            uploading resumes.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            className="flex-1 bg-[#F97316] hover:bg-orange-600 text-white"
            onClick={() => router.push("/admin/drives")}
          >
            Go to All Drives
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
              {isEditAction ? "Edit Drive Details" : "Create New Drive"}
            </h1>
            <p className="text-gray-500 font-medium mt-1 text-base sm:text-lg">
              Configure your hiring drive and screening process.
            </p>
          </div>
        </div>
        {driveCreationLocked && !isEditMode && (
          <div className="mt-6 rounded-3xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-[#F97316]">
                  <Lock className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#F97316]">
                    {quotaLocked ? "Interview quota locked" : "Drive limit reached"}
                  </p>
                  <h2 className="text-lg font-bold text-gray-900">
                    {quotaLocked ? "Contact support@sreevaai.com for further interviews" : "Go to Billing to upgrade your plan"}
                  </h2>
                  <p className="text-sm font-medium text-gray-600">
                    {quotaLocked
                      ? getInterviewQuotaSupportMessage("interviews")
                      : `Your plan allows ${formatDriveLimit(maxActiveDrives)} active drives and you currently have ${activeDriveCount} active drives.`}
                  </p>
                </div>
              </div>
              {quotaLocked ? (
                <a
                  href={getSupportComposeUrl({
                    subject: "Interview quota support request",
                    body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-orange-600"
                >
                  Contact Support
                  <ChevronRight className="h-4 w-4" />
                </a>
              ) : (
                <Link
                  href="/admin/billing"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-orange-600"
                >
                  Upgrade Plan
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
      <Steps
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={handleStepClick}
        isEditMode={isEditMode}
        maxStepReached={maxStepReached}
      />
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
            <InterviewSetup
              formData={formData}
              updateFormData={setFormData}
              allowLanguageSelection={allowLanguageSelection}
            />
          )}
          {currentStep === 3 && <FinalPreview formData={formData} />}
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
                  analysisAbortRef.current?.abort();
                  setIsAnalyzing(false);
                  setCreationMethod("scan");
                } else {
                  setCreationMethod(null);
                }
              }}
              className="border-gray-300 bg-white text-gray-800 hover:bg-gray-50 h-9 font-semibold"
            >
              {isEditAction ? "Cancel" : "Back"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={prevStep}
              className="border-gray-300 bg-white text-gray-800 hover:bg-gray-50 h-9 font-semibold"
            >
              Previous
            </Button>
          )}

          {currentStep === STEPS.length - 1 ? (
            <div className="flex gap-3">
              {driveCreationLocked && !isEditMode ? (
            quotaLocked ? (
              <a
                href={getSupportComposeUrl({
                  subject: "Interview quota support request",
                  body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                })}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 hover:shadow-lg"
                style={{ background: "linear-gradient(135deg, #F97316, #ea6608)" }}
              >
                    <Lock className="h-5 w-5" />
                    Contact Support
                  </a>
                ) : (
                  <Link
                    href="/admin/billing"
                    className="flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 hover:shadow-lg"
                    style={{ background: "linear-gradient(135deg, #F97316, #ea6608)" }}
                  >
                    <Lock className="h-5 w-5" />
                    Go to Billing
                  </Link>
                )
              ) : (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={isSavingDraft}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed",
                    !isSavingDraft && "hover:shadow-lg",
                  )}
                  style={{
                    background: "linear-gradient(135deg, #F97316, #ea6608)",
                    animation: isSavingDraft ? "none" : "pulse-glow 2s infinite",
                  }}
                >
                  {isSavingDraft ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Rocket className="h-5 w-5" />
                  )}
                  {isSavingDraft ? "Saving..." : isEditAction ? "Update Drive" : "Create Drive"}
                </button>
              )}
            </div>
          ) : driveCreationLocked && !isEditMode ? (
            quotaLocked ? (
              <a
                href={getSupportComposeUrl({
                  subject: "Interview quota support request",
                  body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                })}
                target="_blank"
                rel="noreferrer"
                className="bg-gradient-to-r from-[#F97316] to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white shadow-md hover:shadow-lg transition-all duration-200 px-6 h-9 min-w-[140px] flex items-center justify-center gap-2 rounded-md text-sm font-medium"
              >
                <Lock className="h-4 w-4" />
                Contact Support
              </a>
            ) : (
              <Link
                href="/admin/billing"
                className="bg-gradient-to-r from-[#F97316] to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white shadow-md hover:shadow-lg transition-all duration-200 px-6 h-9 min-w-[140px] flex items-center justify-center gap-2 rounded-md text-sm font-medium"
              >
                <Lock className="h-4 w-4" />
                Go to Billing
              </Link>
            )
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
    </div>
  );
}

