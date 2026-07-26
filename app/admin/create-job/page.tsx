"use client";
import { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { JobDescription } from "@/components/create-job/job-description";
import { InterviewSetup } from "@/components/create-job/interview-setup";
import { ScreeningSettings } from "@/components/create-job/screening-settings";
import { Steps } from "@/components/create-job/steps";
import { WizardPage2Review } from "@/components/create-job/wizard-page2-review";
import { WizardPage3Scoring } from "@/components/create-job/wizard-page3-scoring";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { getInterviewActionBlockedMessage, getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { canUseMultilingual } from "@/lib/org-plans";
import { parseJobScreeningSettings, sanitizeScreeningCriteria, type ScreeningCriteria } from "@/lib/screening-criteria";
import { formatJobLimit, getActiveJobCount, isJobCreationLocked } from "@/lib/job-limits";
import { classifyInterviewType } from "@/lib/interview-type";
import { CheckCircle2, Rocket, ChevronLeft, ChevronRight, Loader2, Lock, Zap, LayoutList, Calendar, FileText, Mic, SlidersHorizontal, Sparkles } from "lucide-react";
import { useAdminOrg } from "@/context/admin-org-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PremiumDatePicker } from "@/components/ui/premium-date-picker";
import type { BankQuestion } from "@/lib/question-bank/types";

const WIZARD_STEPS = ["Create Job", "Review Questions", "Scoring & Publish"];

export default function CreateJobPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="h-5 w-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    }>
      <CreateJobForm />
    </Suspense>
  );
}

function CreateJobForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("id");
  const isEditMode = !!jobId;
  const isEditAction = searchParams.get("mode") === "edit";
  const { addJob, jobs, updateJob, organization } = useJobs();
  const adminOrg = useAdminOrg();
  // No hardcoded default voice: admin must pick from the org's allowed list.
  const fallbackVoiceId = "";
  const adminAllowedVoices = adminOrg?.allowedVoiceIds;
  const fallbackAllowedVoices = useMemo(() => adminAllowedVoices ?? [], [adminAllowedVoices]);

  const [formData, setFormData] = useState<any>({
    title: "", jobRole: "", applicationDeadline: "",
    aiGeneratedInterviewQuestions: [],
    resumeScreeningThreshold: 60, resumeScreeningCriteria: {} as ScreeningCriteria,
    aiInterviewerVoiceId: fallbackVoiceId, allowedVoiceIds: fallbackAllowedVoices,
    aiInterviewerName: "Ishitha", jdExtractedDetails: null, interviewMode: "ats",
  });
  const [published, setPublished] = useState(false);
  const [publishedJobId, setPublishedJobId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // -- Wizard step state (tech jobs only -- conversational jobs publish
  // directly from Page 1, unchanged, since they have no generated question
  // bank). No modal is used anywhere in this flow -- these are real,
  // in-page steps swapped by index. --
  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [questionBankQuestions, setQuestionBankQuestions] = useState<BankQuestion[]>([]);
  const [skippedQuerySnippetReason, setSkippedQuerySnippetReason] = useState<string | null>(null);
  const [skippedCodeSnippetReason, setSkippedCodeSnippetReason] = useState<string | null>(null);
  const [mustHaveSkills, setMustHaveSkills] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  const isTechJob = (formData.interviewType || "tech") === "tech";

  const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
  const orgStatus = String(adminOrg?.status || "ACTIVE").toUpperCase();
  const analysisAbortRef = useRef<AbortController | null>(null);
  const hasInitialLoadedRef = useRef<string | null>(null);
  const formDataRef = useRef<any>(formData);
  const jdPersistedUrlRef = useRef<string | null>(null);
  const activeJobCount = adminOrg?.activeJobCount ?? getActiveJobCount(jobs);
  const maxActiveJobs = adminOrg?.maxActiveJobs;
  const isSuspended = isOrgRestrictedStatus(orgStatus);
  const interviewAccessLocked = quotaLocked || isSuspended;
  const billingLocked = isJobCreationLocked(maxActiveJobs, activeJobCount);
  const jobCreationLocked = !isEditMode && (billingLocked || interviewAccessLocked);

  const formatDateForInput = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const getPersistedJdUrl = (source: any = formDataRef.current) => {
    const candidateUrl = jdPersistedUrlRef.current || source?.jdPreviewUrl;
    return typeof candidateUrl === "string" && !candidateUrl.startsWith("blob:") ? candidateUrl : null;
  };

  useEffect(() => {
    formDataRef.current = formData;
    if (typeof formData.jdPreviewUrl === "string" && !formData.jdPreviewUrl.startsWith("blob:")) {
      jdPersistedUrlRef.current = formData.jdPreviewUrl;
    }
  }, [formData]);

  useEffect(() => {
    const url = formData.jdPreviewUrl;
    return () => { if (url && url.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [formData.jdPreviewUrl]);

  useEffect(() => {
    if (isEditMode && hasInitialLoadedRef.current !== jobId) {
      const loadJob = async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
          if (!res.ok) { toast.error("Failed to fetch job details"); return; }
          const job = await res.json();
          if (job.error) { toast.error(job.error); return; }
          hasInitialLoadedRef.current = jobId;
          setFormData((prev: any) => ({
            ...prev,
            title: job.title,
            jobRole: (job as any).jobRole || job.title,
            applicationDeadline: formatDateForInput((job as any).applicationDeadline || null),
            aiGeneratedInterviewQuestions: typeof (job as any).aiGeneratedInterviewQuestions === "string"
              ? JSON.parse((job as any).aiGeneratedInterviewQuestions)
              : (job as any).aiGeneratedInterviewQuestions || [],
            ...(() => {
              const parsed = parseJobScreeningSettings((job as any).resumeScreeningCriteria, Number((job as any).resumeScreeningThreshold ?? 60));
              return { resumeScreeningThreshold: parsed.threshold, resumeScreeningCriteria: parsed.criteria };
            })(),
            jdFileName: (job as any).jdFileName || "",
            jdPreviewUrl: (job as any).jdPreviewUrl || "",
            jdExtractedDetails: (job as any).jdExtractedDetails || null,
            aiInterviewerVoiceId: (job as any).aiInterviewerVoiceId || "",
            allowedVoiceIds: Array.isArray(adminOrg?.allowedVoiceIds) ? adminOrg.allowedVoiceIds : fallbackAllowedVoices,
            aiInterviewerName: (job as any).aiInterviewerName || "Ishitha",
            interviewMode: (job as any).interviewMode || "ats",
            interviewType: (job as any).interviewType || "tech",
            level: (job as any).level || 2,
          }));
          setSavedJobId(jobId);
          const bank = (job as any).questionBank;
          if (bank && Array.isArray(bank.questions)) {
            setQuestionBankQuestions(bank.questions);
            setSkippedQuerySnippetReason(bank.skippedQuerySnippetReason ?? null);
            setSkippedCodeSnippetReason(bank.skippedCodeSnippetReason ?? null);
          }
          if (Array.isArray((job as any).mustHaveSkills)) {
            setMustHaveSkills((job as any).mustHaveSkills);
          }
        } catch (err) {
          console.error("Failed to load job:", err);
          toast.error("An error occurred while loading job details");
        }
      };
      loadJob();
    }
  }, [isEditMode, jobId, fallbackVoiceId, fallbackAllowedVoices]);

  useEffect(() => {
    if (!isEditMode && !searchParams.get("id")) {
      const method = searchParams.get("method");
      if (method !== "ai-chat") {
        setFormData({
          title: "", jobRole: "", applicationDeadline: "",
          aiGeneratedInterviewQuestions: [],
          resumeScreeningThreshold: 60, resumeScreeningCriteria: {},
          aiInterviewerVoiceId: fallbackVoiceId, allowedVoiceIds: fallbackAllowedVoices,
          aiInterviewerName: "Ishitha", jdExtractedDetails: null, interviewMode: "ats", interviewType: "tech", level: 2,
        });
        setIsAnalyzing(false);
        setAnalysisError(null);
      }
    }
  }, [isEditMode, searchParams, fallbackVoiceId, fallbackAllowedVoices]);

  const startAnalysis = async ({ file, url }: { file?: File; url?: string }) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    if (file) setFormData((prev: any) => ({ ...prev, jdFileName: file.name, jdFile: file, jdPreviewUrl: URL.createObjectURL(file) }));
    else if (url) setFormData((prev: any) => ({ ...prev, jdFileName: "Extracted from Link", jdPreviewUrl: url }));
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const data = new FormData();
    if (file) data.append("file", file);
    if (url) data.append("url", url);
    data.append("type", "JD");
    try {
      const res = await fetch("/api/extract", { method: "POST", body: data, signal: controller.signal });
      if (res.ok || res.status === 202) {
        const responseData = await res.json().catch(() => null);
        if (!responseData) { setAnalysisError("Failed to extract JD details."); return; }
        let extracted: any = null;
        let r2Url: string | null = responseData.url ?? null;
        if (responseData.jobId) {
          const jobId = responseData.jobId as string;
          setFormData((prev: any) => ({ ...prev, jdExtractionJobId: jobId }));
          const deadline = Date.now() + 120000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2000));
            if (controller.signal.aborted) return;
            const poll = await fetch(`/api/extract/status/${jobId}`, { signal: controller.signal });
            const pollData = await poll.json().catch(() => null);
            if (!pollData) continue;
            if (pollData.status === "completed") { extracted = pollData.data; break; }
            if (pollData.status === "failed") { setAnalysisError(pollData.error || "Extraction failed."); return; }
            if (pollData.status === "not_found") { setAnalysisError("Extraction job expired. Please try again."); return; }
          }
          if (!extracted) { setAnalysisError("Extraction timed out. Please try again."); return; }
        } else {
          extracted = responseData.data;
          r2Url = responseData.url ?? null;
        }
        if (!extracted && !r2Url) { setAnalysisError(responseData.error || "Failed to extract JD details."); return; }
        if (typeof r2Url === "string" && !r2Url.startsWith("blob:")) jdPersistedUrlRef.current = r2Url;
        setFormData((prev: any) => ({
          ...prev,
          title: extracted?.job_title || prev.jobRole || "New Job",
          jobRole: extracted?.job_title || prev.jobRole || "",
          aiGeneratedInterviewQuestions: Array.isArray(extracted?.interview_questions) && extracted.interview_questions.length > 0
            ? extracted.interview_questions : prev.aiGeneratedInterviewQuestions,
          jdExtractedDetails: extracted,
          jdPreviewUrl: r2Url || prev.jdPreviewUrl,
          interviewType: classifyInterviewType(extracted?.job_title || prev.jobRole),
        }));
      } else {
        const rawErrorText = await res.text().catch(() => "");
        let errData: any = null;
        try { errData = rawErrorText.trim() ? JSON.parse(rawErrorText) : null; } catch { errData = { error: rawErrorText.trim() }; }
        setAnalysisError(errData?.error || errData?.details || `Failed to extract JD details (${res.status})`);
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setAnalysisError("An error occurred during AI analysis.");
    } finally {
      setIsAnalyzing(false);
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
    }
  };

  const buildJobData = (currentFormData: any, resolvedInterviewType: string) => {
    let parsedQuestions = currentFormData.aiGeneratedInterviewQuestions || [];
    if (typeof parsedQuestions === "string") { try { parsedQuestions = JSON.parse(parsedQuestions); } catch { parsedQuestions = []; } }
    return {
      title: currentFormData.title || "Untitled Job",
      description: currentFormData.description || "",
      jobRole: currentFormData.jobRole || "",
      applicationDeadline: currentFormData.applicationDeadline || null,
      jdFileName: currentFormData.jdFileName || null,
      jdPreviewUrl: getPersistedJdUrl(currentFormData),
      jdExtractedDetails: currentFormData.jdExtractedDetails
        ? typeof currentFormData.jdExtractedDetails === "string" ? currentFormData.jdExtractedDetails : JSON.stringify(currentFormData.jdExtractedDetails)
        : null,
      jdExtractionJobId: currentFormData.jdExtractionJobId || null,
      aiGeneratedInterviewQuestions: parsedQuestions,
      resumeScreeningThreshold: Number(currentFormData.resumeScreeningThreshold ?? 60),
      resumeScreeningCriteria: sanitizeScreeningCriteria(currentFormData.resumeScreeningCriteria || {}),
      aiInterviewerVoiceId: currentFormData.aiInterviewerVoiceId || "",
      aiInterviewerName: currentFormData.aiInterviewerName || "Ishitha",
      interviewMode: currentFormData.interviewMode || "ats",
      interviewType: resolvedInterviewType,
      level: currentFormData.level,
    };
  };

  // Page 1 "Start Generation" (tech) -- saves the job (DRAFT), then runs the
  // synchronous Call A -> B -> C pipeline via /generate-questions. No
  // worker/queue: the frontend simply awaits this one request.
  const handleStartGeneration = async () => {
    const currentFormData = formDataRef.current;
    if (jobCreationLocked && !isEditMode) {
      toast.error(interviewAccessLocked ? getInterviewQuotaSupportMessage("interviews") : "Job limit reached. Go to Billing to upgrade your plan.");
      return;
    }
    if (!String(currentFormData.applicationDeadline || "").trim()) {
      toast.error("Please fill the application deadline.");
      return;
    }
    if (!currentFormData.level) {
      toast.error("Please select a Questioning Level (1-4).");
      return;
    }
    const pendingJdUpload = Boolean(currentFormData.jdFile) || (typeof currentFormData.jdPreviewUrl === "string" && currentFormData.jdPreviewUrl.startsWith("blob:"));
    if (isAnalyzing || (pendingJdUpload && !getPersistedJdUrl(currentFormData))) {
      toast.error("Please wait for the JD upload to finish.");
      return;
    }
    if (!currentFormData.jdExtractedDetails) {
      toast.error("Please upload and analyze a job description first.");
      return;
    }
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const jobData = buildJobData(currentFormData, "tech");
      let id = savedJobId || jobId;
      let staleQuestionBank = false;
      if (id) {
        const updated = await updateJob(id, jobData);
        staleQuestionBank = Boolean((updated as any)?.staleQuestionBank);
      } else {
        const result = await addJob({ ...jobData, postedAt: new Date().toISOString() } as any);
        id = result?.id || null;
      }
      if (!id) throw new Error("Failed to save job before generation.");
      setSavedJobId(id);

      const res = await fetch(`/api/jobs/${id}/generate-questions`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // If the level/JD edit that triggered this run left the job's
        // existing question bank stale, and regeneration itself then failed,
        // the old (now-stale) bank is what's left in place -- surface that
        // clearly rather than just reporting the generation failure alone.
        const failureMsg = staleQuestionBank
          ? `${data?.error || "Question generation failed."} Your previous question bank is still in place but may be out of date for the edited level/JD.`
          : data?.error || "Question generation failed.";
        setGenerationError(failureMsg);
        toast.error(failureMsg);
        return;
      }
      const bank = data?.questionBank;
      const qs: BankQuestion[] = Array.isArray(bank?.questions) ? bank.questions : [];
      setQuestionBankQuestions(qs);
      setSkippedQuerySnippetReason(bank?.skippedQuerySnippetReason ?? null);
      setSkippedCodeSnippetReason(bank?.skippedCodeSnippetReason ?? null);
      setStep(1);
      setMaxStepReached((m) => Math.max(m, 1));
      toast.success("Questions generated successfully.");
    } catch (error: any) {
      setGenerationError(error?.message || "Question generation failed.");
      toast.error(error?.message || "Question generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Page 3 "Next" -- publish (GENERATED -> PUBLISHED), tech jobs only.
  const handlePublishWizard = async () => {
    if (!savedJobId) return;
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/jobs/${savedJobId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mustHaveSkills,
          resumeScreeningThreshold: Number(formData.resumeScreeningThreshold ?? 60),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Failed to publish job.");
        return;
      }
      setPublishedJobId(savedJobId);
      setPublished(true);
      toast.success(isEditAction ? "Job updated successfully!" : "Job created successfully!");
    } catch (error: any) {
      toast.error(error?.message || "Failed to publish job.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublish = async () => {
    const currentFormData = formDataRef.current;
    if (jobCreationLocked && !isEditMode) {
      toast.error(interviewAccessLocked ? getInterviewQuotaSupportMessage("interviews") : "Job limit reached. Go to Billing to upgrade your plan.");
      return;
    }
    if (!String(currentFormData.applicationDeadline || "").trim()) {
      toast.error("Please fill the application deadline.");
      return;
    }
    const resolvedInterviewType = currentFormData.interviewType || classifyInterviewType(currentFormData.jobRole) || "tech";
    if (!currentFormData.level) {
      toast.error("Please select a Questioning Level (1-4).");
      return;
    }
    const pendingJdUpload = Boolean(currentFormData.jdFile) || (typeof currentFormData.jdPreviewUrl === "string" && currentFormData.jdPreviewUrl.startsWith("blob:"));
    if (isAnalyzing || (pendingJdUpload && !getPersistedJdUrl(currentFormData))) {
      toast.error("Please wait for the JD upload to finish before publishing.");
      return;
    }
    setIsSavingDraft(true);
    const jobData = buildJobData(currentFormData, resolvedInterviewType);
    try {
      let savedId: string | null = null;
      if (isEditMode) {
        await updateJob(jobId!, jobData);
        savedId = jobId;
      } else {
        const result = await addJob({ ...jobData, postedAt: new Date().toISOString() } as any);
        savedId = result?.id;
      }
      if (savedId) {
        setPublishedJobId(savedId);
        setPublished(true);
        toast.success(isEditAction ? "Job updated successfully!" : "Job created successfully!");
      } else {
        throw new Error("Failed to retrieve Job ID after saving.");
      }
    } catch (error: any) {
      const msg = error.details ? `${error.message}: ${JSON.stringify(error.details)}` : error.message;
      toast.error(msg || "Failed to save job details. Please try again.");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const screeningConfig = useMemo(() => ({
    threshold: Number(formData.resumeScreeningThreshold ?? 60),
    criteria: (formData.resumeScreeningCriteria || {}) as ScreeningCriteria,
  }), [formData.resumeScreeningThreshold, formData.resumeScreeningCriteria]);

  const handleScreeningConfig = useMemo(() => (cfg: any) =>
    setFormData((prev: any) => {
      const current = { threshold: Number(prev.resumeScreeningThreshold ?? 60), criteria: (prev.resumeScreeningCriteria || {}) as ScreeningCriteria };
      const next = typeof cfg === "function" ? cfg(current) : cfg;
      return { ...prev, resumeScreeningThreshold: Number(next.threshold ?? 60), resumeScreeningCriteria: sanitizeScreeningCriteria(next.criteria || {}) };
    }), []);

  // -- Success --------------------------------------------------------------
  if (published) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-in fade-in duration-500">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 8px 32px rgba(124,58,237,0.35)" }}>
            <Rocket className="h-9 w-9 text-white" />
          </div>
          <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center"
            style={{ border: "3px solid white", boxShadow: "0 2px 8px rgba(16,185,129,0.4)" }}>
            <CheckCircle2 className="h-4 w-4 text-white" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Job {isEditAction ? "updated" : "created"} successfully</h1>
          <p className="text-sm text-gray-400">Your job is live and ready to receive candidates.</p>
        </div>
        <button
          className="btn-shimmer inline-flex items-center gap-2 h-10 px-6 rounded-xl text-sm font-medium text-white"
          style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}
          onClick={() => router.push(publishedJobId ? `/admin/candidates/job/${publishedJobId}` : "/admin/jobs")}
        >
          <ChevronRight className="h-4 w-4" /> View Job
        </button>
      </div>
    );
  }

  // -- Locked ---------------------------------------------------------------
  if (jobCreationLocked) {
    return (
      <div className="space-y-6 pb-10 animate-in fade-in duration-500">
        <button onClick={() => router.push("/admin")}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-all"
          style={{ border: "1px solid #E9E7FF" }}>
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="bg-white rounded-2xl flex flex-col items-center justify-center py-20 px-8 text-center gap-6"
          style={{ border: "1px solid #E9E7FF", borderTop: "3px solid #8B5CF6", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))", border: "1px solid rgba(139,92,246,0.2)" }}>
            <Lock className="h-6 w-6 text-[#7C3AED]" />
          </div>
          <div className="space-y-2 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#7C3AED]">
              {interviewAccessLocked ? (isSuspended ? "Account Suspended" : "Interview Quota Locked") : "Job Limit Reached"}
            </p>
            <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
              {interviewAccessLocked ? getInterviewQuotaSupportMessage("interviews") : "Upgrade to create more jobs"}
            </h2>
            <p className="text-sm text-gray-400">
              {interviewAccessLocked ? getInterviewActionBlockedMessage(isSuspended)
                : `Your plan allows ${formatJobLimit(maxActiveJobs)} active jobs. You currently have ${activeJobCount} active.`}
            </p>
          </div>
          <a href={getSupportComposeUrl(interviewAccessLocked
            ? { subject: "Interview quota support request", body: isSuspended ? "Hi support team,\n\nOur account is suspended by Super Admin. Please help us restore access.\n" : "Hi support team,\n\nPlease help us restore interview access for our account.\n" }
            : { subject: "Upgrade plan request", body: "Hi support team,\n\nWe would like to upgrade our plan to create more jobs.\n" }
          )}
            target="_blank" rel="noreferrer"
            className="btn-shimmer inline-flex items-center gap-2 h-10 px-6 rounded-xl text-sm font-medium text-white"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}>
            Contact Support <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  // -- Wizard Page 2 (Review Generated Questions) -- tech jobs only ---------
  if (isTechJob && step === 1) {
    return (
      <div className="pb-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <div className="mb-6">
          <Steps steps={WIZARD_STEPS} currentStep={step} onStepClick={(i) => i <= maxStepReached && setStep(i)} maxStepReached={maxStepReached} />
        </div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Review Generated Questions</h1>
            <p className="text-sm text-gray-400 mt-0.5">Edit or add questions before proceeding.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(0)}
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-all"
              style={{ border: "1px solid #E9E7FF" }}>
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => { setStep(2); setMaxStepReached((m) => Math.max(m, 2)); }}
              className="btn-shimmer inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-medium text-white transition-all"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}>
              Proceed <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Card>
          <WizardPage2Review
            questions={questionBankQuestions}
            onChange={setQuestionBankQuestions}
            skippedQuerySnippetReason={skippedQuerySnippetReason}
            skippedCodeSnippetReason={skippedCodeSnippetReason}
          />
        </Card>
      </div>
    );
  }

  // -- Wizard Page 3 (Scoring & Publish) -- tech jobs only -------------------
  if (isTechJob && step === 2) {
    return (
      <div className="pb-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <div className="mb-6">
          <Steps steps={WIZARD_STEPS} currentStep={step} onStepClick={(i) => i <= maxStepReached && setStep(i)} maxStepReached={maxStepReached} />
        </div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Scoring & Publish</h1>
            <p className="text-sm text-gray-400 mt-0.5">Set screening details, then publish.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-all"
              style={{ border: "1px solid #E9E7FF" }}>
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={handlePublishWizard}
              disabled={isPublishing}
              className="btn-shimmer inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: isPublishing ? "none" : "0 4px 14px rgba(124,58,237,0.3)" }}>
              {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {isPublishing ? "Publishing…" : "Next"}
            </button>
          </div>
        </div>
        <Card>
          <WizardPage3Scoring
            interviewMode={formData.interviewMode || "ats"}
            screeningConfig={screeningConfig}
            setScreeningConfig={handleScreeningConfig}
            mustHaveSkills={mustHaveSkills}
            setMustHaveSkills={setMustHaveSkills}
          />
        </Card>
      </div>
    );
  }

  // -- Main Form (Page 1) -- two-column layout -------------------------------
  return (
    <div className="pb-10 animate-in fade-in duration-500">
      {/* Wizard step indicator -- tech jobs only, since conversational jobs
          publish directly from this page with no generated question bank. */}
      {isTechJob && (
        <div className="mb-6 max-w-3xl">
          <Steps steps={WIZARD_STEPS} currentStep={step} onStepClick={(i) => i <= maxStepReached && setStep(i)} maxStepReached={maxStepReached} />
        </div>
      )}
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            {isEditAction ? "Edit Job" : "Create New Job"}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isEditAction ? "Update your job and screening configuration." : "Set up your job, interview, and screening in one place."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const hasProgress = isAnalyzing || Boolean(formData.jdFile || formData.jdFileName || formData.title || formData.jobRole);
              if (hasProgress && !window.confirm("You have unsaved changes. Are you sure you want to leave? Your progress will be lost.")) return;
              router.push(isEditMode ? "/admin/jobs" : "/admin");
            }}
            className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-all self-start sm:self-auto"
            style={{ border: "1px solid #E9E7FF" }}>
            <ChevronLeft className="h-4 w-4" />
            {isEditAction ? "Cancel" : "Back"}
          </button>
          {isTechJob ? (
            <button
              type="button"
              onClick={handleStartGeneration}
              disabled={isGenerating}
              className="btn-shimmer inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: isGenerating ? "none" : "0 4px 14px rgba(124,58,237,0.3)" }}>
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? "Generating questions…" : "Start Generation"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={isSavingDraft}
              className="btn-shimmer inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: isSavingDraft ? "none" : "0 4px 14px rgba(124,58,237,0.3)" }}>
              {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {isSavingDraft ? "Saving…" : isEditAction ? "Update Job" : "Create Job"}
            </button>
          )}
        </div>
      </div>

      {generationError && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium text-red-600 max-w-3xl"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          {generationError}
        </div>
      )}

      {/* Two-column grid — fixed height so the page doesn't scroll, only columns scroll if needed */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start h-[calc(100vh-100px)] min-h-0">

        {/* ── LEFT COLUMN (Static, compacted to fit without scroll) ── */}
        <div className="flex flex-col gap-3 h-full overflow-hidden pb-2">

          {/* Interview Mode card */}
          <Card>
            <div className="flex items-center gap-2 mb-3 justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-xl flex items-center justify-center flex-shrink-0 text-[#7C3AED]"
                  style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.07))", border: "1px solid rgba(139,92,246,0.18)" }}>
                  <LayoutList className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm font-semibold text-gray-900 leading-tight">Interview Mode</p>
              </div>
              {!isEditMode && (
                <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 flex-shrink-0"
                  style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  <svg className="h-3 w-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  <p className="text-[10px] text-amber-700 font-medium">Permanent</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {[
                { value: "ats", label: "Scoring + Interview", Icon: LayoutList, desc: "Upload resumes → AI scores → you shortlist → send link.", badge: "Full Pipeline" },
                { value: "interview-only", label: "Interview Only", Icon: Zap, desc: "Add candidates → interview link sent automatically.", badge: "Direct Invite" },
              ].map(opt => {
                const active = formData.interviewMode === opt.value;
                const locked = isEditMode;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => !locked && setFormData((prev: any) => ({ ...prev, interviewMode: opt.value }))}
                    disabled={locked && !active}
                    className={cn(
                      "relative w-full text-left px-3.5 py-3 rounded-xl transition-all duration-200",
                      active ? "shadow-[0_0_0_2px_#7C3AED]" : locked ? "opacity-40 cursor-not-allowed" : "hover:shadow-[0_0_0_1px_#C4B5FD] cursor-pointer"
                    )}
                    style={{
                      border: active ? "1px solid #7C3AED" : "1px solid #E9E7FF",
                      background: active ? "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))" : "#FAFAFC",
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={active
                          ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 2px 6px rgba(124,58,237,0.25)" }
                          : { background: "#F0EDF8", border: "1px solid #E9E7FF" }}>
                        <opt.Icon className={cn("h-3.5 w-3.5", active ? "text-white" : "text-[#7C3AED]")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold leading-tight", active ? "text-[#7C3AED]" : "text-gray-800")}>{opt.label}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{opt.desc}</p>
                      </div>
                      {active && (
                        <div className="h-5 w-5 rounded-full bg-[#7C3AED] flex items-center justify-center flex-shrink-0">
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Job Details card */}
          <Card>
            <CardHeader icon={<FileText className="h-3.5 w-3.5" />} title="Job Details" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  Job Name <span className="text-[#7C3AED]">*</span>
                </Label>
                <Input
                  value={formData.title || ""}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Senior Backend Engineer"
                  className={cn("h-9 rounded-xl bg-gray-50 text-sm placeholder:text-gray-400 focus-visible:ring-[#7C3AED]/20 focus-visible:border-[#7C3AED] focus-visible:bg-white transition-all", isAnalyzing && !formData.title && "animate-pulse bg-violet-50/30")}
                  style={{ border: "1px solid #E9E7FF" }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  Job Role <span className="text-[#7C3AED]">*</span>
                </Label>
                <Input
                  value={formData.jobRole || ""}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, jobRole: e.target.value }))}
                  placeholder="e.g. Backend Engineer"
                  className={cn("h-9 rounded-xl bg-gray-50 text-sm placeholder:text-gray-400 focus-visible:ring-[#7C3AED]/20 focus-visible:border-[#7C3AED] focus-visible:bg-white transition-all", isAnalyzing && !formData.jobRole && "animate-pulse bg-violet-50/30")}
                  style={{ border: "1px solid #E9E7FF" }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Deadline <span className="text-[#7C3AED]">*</span>
                </Label>
                <PremiumDatePicker
                  value={formData.applicationDeadline || ""}
                  onChange={(date) => setFormData((prev: any) => ({ ...prev, applicationDeadline: date }))}
                  placeholder="Select deadline"
                  disabledBeforeToday={true}
                  className={cn(isAnalyzing && !formData.applicationDeadline && "opacity-90")}
                />
              </div>
              {isAnalyzing && (
                <p className="text-[11px] text-violet-500 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> AI filling fields from JD…
                </p>
              )}
            </div>
          </Card>

        </div>

        {/* ── RIGHT COLUMN: JD + Interview Setup + Screening ── */}
        <div className="flex flex-col gap-4 h-full overflow-y-auto pr-2 pb-10" style={{ scrollbarWidth: "thin" }}>

          {/* JD Upload */}
          <Card>
            <CardHeader icon={<FileText className="h-3.5 w-3.5" />} title="Job Description" subtitle="AI auto-fills name, role, and questions" />
            <JobDescription
              formData={formData}
              updateFormData={setFormData}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              startAnalysis={startAnalysis}
              abortAnalysis={() => { analysisAbortRef.current?.abort(); setIsAnalyzing(false); }}
            />
          </Card>

          {/* Interview Setup */}
          <Card>
            <CardHeader icon={<Mic className="h-3.5 w-3.5" />} title="Interview Setup" subtitle="Voice and questions" />
            <div className="p-5 bg-white border-t border-gray-100">
              <InterviewSetup
                formData={formData}
                updateFormData={setFormData}
              />
            </div>
          </Card>

          {/* Screening — Resume only. For tech jobs this now lives on wizard
              Page 3 (Scoring & Publish) alongside must-have skills; shown here
              only for conversational jobs, which publish directly from this page. */}
          {!isTechJob && formData.interviewMode !== "interview-only" && (
            <Card>
              <CardHeader icon={<SlidersHorizontal className="h-3.5 w-3.5" />} title="Screening Settings" subtitle="Threshold and criteria for resume scoring" />
              <ScreeningSettings config={screeningConfig} setConfig={handleScreeningConfig} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Shared primitives --------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-4"
      style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
      {children}
    </div>
  );
}

function CardHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="h-7 w-7 rounded-xl flex items-center justify-center flex-shrink-0 text-[#7C3AED]"
        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.07))", border: "1px solid rgba(139,92,246,0.18)" }}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 leading-tight">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
