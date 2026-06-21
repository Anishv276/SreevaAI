"use client";
import { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-custom";
import { JobDescription } from "@/components/create-drive/job-description";
import { InterviewSetup } from "@/components/create-drive/interview-setup";
import { ScreeningSettings } from "@/components/create-drive/screening-settings";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { getInterviewActionBlockedMessage, getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { canUseMultilingual } from "@/lib/org-plans";
import { parseDriveScreeningSettings, sanitizeScreeningCriteria, type ScreeningCriteria } from "@/lib/screening-criteria";
import {
  formatDriveLimit,
  getActiveDriveCount,
  isDriveCreationLocked,
} from "@/lib/drive-limits";
import {
  CheckCircle2,
  Rocket,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
} from "lucide-react";
import { useAdminOrg } from "@/context/admin-org-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PremiumDatePicker } from "@/components/ui/premium-date-picker";
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
  const { addJob, jobs, updateJob, organization } = useJobs();
  const adminOrg = useAdminOrg();
  const fallbackVoiceId = adminOrg?.voiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
  const adminAllowedVoices = adminOrg?.allowedVoices || [];
  const fallbackAllowedVoices = useMemo(
    () => adminAllowedVoices,
    [adminAllowedVoices]
  );
  const [formData, setFormData] = useState<any>({
    title: "",
    role: "",
    deadline: "",
    interviewLanguage: "English",
    interviewQuestions: [],
    screeningThreshold: 60,
    screeningCriteria: {} as ScreeningCriteria,
    voiceId: fallbackVoiceId,
    allowedVoices: fallbackAllowedVoices,
    aiName: "Ishitha",
    extractedDetails: null,
    interviewMode: "ats",
  });
  const [published, setPublished] = useState(false);
  const [publishedDriveId, setPublishedDriveId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
  const orgStatus = String(adminOrg?.status || "ACTIVE").toUpperCase();
  const analysisAbortRef = useRef<AbortController | null>(null);
  const hasInitialLoadedRef = useRef<string | null>(null);
  const formDataRef = useRef<any>(formData);
  const jdPersistedUrlRef = useRef<string | null>(null);
  const activeDriveCount = adminOrg?.activeDriveCount ?? getActiveDriveCount(jobs);
  const maxActiveDrives = adminOrg?.maxActiveDrives;
  const allowLanguageSelection = canUseMultilingual(organization?.plan);
  const isSuspended = isOrgRestrictedStatus(orgStatus);
  const interviewAccessLocked = quotaLocked || isSuspended;
  const billingLocked = isDriveCreationLocked(maxActiveDrives, activeDriveCount);
  const driveCreationLocked = !isEditMode && (billingLocked || interviewAccessLocked);
  const formatDateForInput = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const displayFormData = formData;
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
    if (!allowLanguageSelection && formData.interviewLanguage !== "English") {
      setFormData((prev: any) => ({ ...prev, interviewLanguage: "English" }));
    }
  }, [allowLanguageSelection, formData.interviewLanguage]);
  // Initial load for edit mode
  useEffect(() => {
    if (isEditMode && hasInitialLoadedRef.current !== driveId) {
      const loadDrive = async () => {
        try {
          const res = await fetch(`/api/drives/${driveId}`, { cache: "no-store" });
          if (!res.ok) { toast.error("Failed to fetch drive details"); return; }
          const drive = await res.json();
          if (drive.error) { toast.error(drive.error); return; }
          hasInitialLoadedRef.current = driveId;
          setFormData((prev: any) => ({
            ...prev,
            title: drive.title,
            role: (drive as any).role || drive.title,
            deadline: formatDateForInput((drive as any).deadline || null),
            interviewLanguage: (drive as any).interviewLanguage || "English",
            interviewQuestions: typeof (drive as any).interviewQuestions === "string"
              ? JSON.parse((drive as any).interviewQuestions)
              : (drive as any).interviewQuestions || [],
            ...(() => {
              const parsed = parseDriveScreeningSettings(
                (drive as any).screeningCriteria,
                Number((drive as any).screeningThreshold ?? 60)
              );
              return {
                screeningThreshold: parsed.threshold,
                screeningCriteria: parsed.criteria,
              };
            })(),
            jdFileName: (drive as any).jdFileName || "",
            jdPreviewUrl: (drive as any).jdPreviewUrl || "",
            extractedDetails: (drive as any).extractedDetails || null,
            voiceId: (drive as any).voiceId || adminOrg?.voiceId || fallbackVoiceId,
            allowedVoices: Array.isArray(adminOrg?.allowedVoices) ? adminOrg.allowedVoices : fallbackAllowedVoices,
            aiName: (drive as any).aiName || "Ishitha",
            interviewMode: (drive as any).interviewMode || "ats",
          }));
        } catch (err) {
          console.error("Failed to load drive:", err);
          toast.error("An error occurred while loading drive details");
        }
      };
      loadDrive();
    }
  }, [isEditMode, driveId, adminOrg?.voiceId, fallbackVoiceId, fallbackAllowedVoices]);
  // Handle AI-chat sync
  useEffect(() => {
    const method = searchParams.get("method");
    if (method === "ai-chat") {
      const draft = localStorage.getItem("jd_draft");
      if (draft) {
        try {
          const data = JSON.parse(draft);
          const { voiceId: _a, allowedVoices: _b, aiName: _c, ...jdData } = data || {};
          setFormData((prev: any) => ({ ...prev, ...jdData }));
          localStorage.removeItem("jd_draft");
          toast.success("Job description synced from AI Assistant!");
        } catch (e) {
          console.error("CreateDrive Sync - Parse Error:", e);
        }
      }
    }
  }, [searchParams]);
  // Reset on new drive
  useEffect(() => {
    if (!isEditMode && !searchParams.get("id")) {
      const method = searchParams.get("method");
      if (method !== "ai-chat") {
        setFormData({
          title: "", role: "", deadline: "",
          interviewLanguage: "English", interviewQuestions: [],
          screeningThreshold: 60, screeningCriteria: {},
          voiceId: fallbackVoiceId,
          allowedVoices: fallbackAllowedVoices,
          aiName: "Ishitha", extractedDetails: null,
          interviewMode: "ats",
        });
        setIsAnalyzing(false);
        setAnalysisError(null);
      }
    }
  }, [isEditMode, searchParams, fallbackVoiceId, fallbackAllowedVoices]);
  const startAnalysis = async ({ file, url }: { file?: File; url?: string }) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    if (file) {
      setFormData((prev: any) => ({ ...prev, jdFileName: file.name, jdFile: file, jdPreviewUrl: URL.createObjectURL(file) }));
    } else if (url) {
      setFormData((prev: any) => ({ ...prev, jdFileName: "Extracted from Link", jdPreviewUrl: url }));
    }
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
        let text: string | null = null;
        let r2Url: string | null = responseData.url ?? null;
        if (responseData.jobId) {
          const jobId = responseData.jobId as string;
          const POLL_INTERVAL = 2000;
          const deadline = Date.now() + 120000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL));
            if (controller.signal.aborted) return;
            const poll = await fetch(`/api/extract/status/${jobId}`, { signal: controller.signal });
            const pollData = await poll.json().catch(() => null);
            if (!pollData) continue;
            if (pollData.status === "completed") { extracted = pollData.data; text = pollData.text ?? null; break; }
            if (pollData.status === "failed") { setAnalysisError(pollData.error || "Extraction failed."); return; }
            if (pollData.status === "not_found") { setAnalysisError("Extraction job expired. Please try again."); return; }
          }
          if (!extracted) { setAnalysisError("Extraction timed out. Please try again."); return; }
        } else {
          extracted = responseData.data;
          text = responseData.text ?? null;
          r2Url = responseData.url ?? null;
        }
        if (!extracted && !text && !r2Url) { setAnalysisError(responseData.error || "Failed to extract JD details."); return; }
        if (typeof r2Url === "string" && !r2Url.startsWith("blob:")) jdPersistedUrlRef.current = r2Url;
        setFormData((prev: any) => ({
          ...prev,
          title: extracted?.job_title || prev.role || "New Job",
          role: extracted?.job_title || prev.role || "",
          interviewQuestions: Array.isArray(extracted?.interview_questions) && extracted.interview_questions.length > 0
            ? extracted.interview_questions : prev.interviewQuestions,
          extractedDetails: extracted,
          jdPreviewUrl: r2Url || prev.jdPreviewUrl,
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
  const handlePublish = async () => {
    const currentFormData = formDataRef.current;
    if (driveCreationLocked && !isEditMode) {
      toast.error(interviewAccessLocked ? getInterviewQuotaSupportMessage("interviews") : "Drive limit reached. Go to Billing to upgrade your plan.");
      return;
    }
    if (!String(currentFormData.deadline || "").trim()) {
      toast.error("Please fill the application deadline.");
      return;
    }
    const pendingJdUpload = Boolean(currentFormData.jdFile) || (typeof currentFormData.jdPreviewUrl === "string" && currentFormData.jdPreviewUrl.startsWith("blob:"));
    if (isAnalyzing || (pendingJdUpload && !getPersistedJdUrl(currentFormData))) {
      toast.error("Please wait for the JD upload to finish before publishing.");
      return;
    }
    setIsSavingDraft(true);
    let parsedQuestions = currentFormData.interviewQuestions || [];
    if (typeof parsedQuestions === "string") { try { parsedQuestions = JSON.parse(parsedQuestions); } catch { parsedQuestions = []; } }
    const jobData = {
      title: currentFormData.title || "Untitled Job",
      description: currentFormData.description || "",
      role: currentFormData.role || "",
      deadline: currentFormData.deadline || null,
      jdFileName: currentFormData.jdFileName || null,
      jdPreviewUrl: getPersistedJdUrl(currentFormData),
      extractedDetails: currentFormData.extractedDetails ? typeof currentFormData.extractedDetails === "string" ? currentFormData.extractedDetails : JSON.stringify(currentFormData.extractedDetails) : null,
      interviewLanguage: allowLanguageSelection ? currentFormData.interviewLanguage || "English" : "English",
      interviewQuestions: parsedQuestions,
      screeningThreshold: Number(currentFormData.screeningThreshold ?? 60),
      screeningCriteria: sanitizeScreeningCriteria(currentFormData.screeningCriteria || {}),
      voiceId: currentFormData.voiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      aiName: currentFormData.aiName || "Ishitha",
      interviewMode: currentFormData.interviewMode || "ats",
    };
    try {
      let result;
      let savedId: string | null = null;
      if (isEditMode) {
        result = await updateJob(driveId!, jobData);
        savedId = driveId;
      } else {
        result = await addJob({ ...jobData, postedAt: new Date().toISOString() } as any);
        savedId = result?.id;
      }
      if (savedId) {
        setPublishedDriveId(savedId);
        setPublished(true);
        toast.success(isEditAction ? "Job updated successfully!" : "Job created successfully!");
      } else {
        throw new Error("Failed to retrieve Drive ID after saving. Please check the dashboard.");
      }
    } catch (error: any) {
      const msg = error.details ? `${error.message}: ${JSON.stringify(error.details)}` : error.message;
      toast.error(msg || "Failed to save drive details. Please try again.");
    } finally {
      setIsSavingDraft(false);
    }
  };
  const screeningConfig = useMemo(() => ({
    threshold: Number(formData.screeningThreshold ?? 60),
    criteria: (formData.screeningCriteria || {}) as ScreeningCriteria,
  }), [formData.screeningThreshold, formData.screeningCriteria]);
  const handleScreeningConfig = useMemo(() => (cfg: any) =>
    setFormData((prev: any) => {
      const current = {
        threshold: Number(prev.screeningThreshold ?? 60),
        criteria: (prev.screeningCriteria || {}) as ScreeningCriteria,
      };
      const next = typeof cfg === "function" ? cfg(current) : cfg;
      return {
        ...prev,
        screeningThreshold: Number(next.threshold ?? 60),
        screeningCriteria: sanitizeScreeningCriteria(next.criteria || {}),
      };
    }), []);
  // Success screen
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
            Your Job is {isEditAction ? "Updated" : "Created"}! 🎉
          </h1>
          <p className="text-gray-500 mt-2 text-[15px]">
            Your job is ready.
          </p>
        </div>
        <Button
          className="bg-[#F97316] hover:bg-orange-600 text-white"
          onClick={() => router.push(publishedDriveId ? `/admin/candidates/drive/${publishedDriveId}` : "/admin/drives")}
        >
          Back to Jobs
        </Button>
      </div>
    );
  }
  // Locked screen — shown instead of the form when creation is blocked
  if (driveCreationLocked) {
    return (
      <div className="max-w-4xl mx-auto py-4 space-y-4">
        <button
          onClick={() => router.push("/admin")}
          className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div className="rounded-2xl bg-white flex flex-col items-center justify-center py-20 px-8 text-center gap-6"
          style={{ border: "1px solid #E5E7EB", borderTop: "4px solid #F97316", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100">
            <Lock className="h-8 w-8 text-[#F97316]" />
          </div>
          <div className="space-y-2 max-w-md">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#F97316]">
              {interviewAccessLocked ? (isSuspended ? "Account Suspended" : "Interview Quota Locked") : "Job Limit Reached"}
            </p>
            <h2 className="text-2xl font-bold text-gray-900">
              {interviewAccessLocked ? getInterviewQuotaSupportMessage("interviews") : "Upgrade to create more jobs"}
            </h2>
            <p className="text-sm font-medium text-gray-500">
              {interviewAccessLocked
                ? getInterviewActionBlockedMessage(isSuspended)
                : `Your plan allows ${formatDriveLimit(maxActiveDrives)} active jobs. You currently have ${activeDriveCount} active. Upgrade your plan to add more.`}
            </p>
          </div>
          {interviewAccessLocked ? (
            <a
              href={getSupportComposeUrl({ subject: "Interview quota support request", body: isSuspended ? "Hi support team,\n\nOur account is suspended by Super Admin. Please help us restore access.\n" : "Hi support team,\n\nPlease help us restore interview access for our account.\n" })}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, #F97316, #ea6608)" }}
            >
              Contact Support <ChevronRight className="h-4 w-4" />
            </a>
          ) : (
            <a
              href={getSupportComposeUrl({ subject: "Upgrade plan request", body: "Hi support team,\n\nWe would like to upgrade our plan to create more jobs.\n" })}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, #F97316, #ea6608)" }}
            >
              Contact Support <ChevronRight className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    );
  }
  // Main single-scroll form
  return (
    <div className="max-w-4xl mx-auto py-4 space-y-4">
      <button
        onClick={() => isEditMode ? router.push("/admin/drives") : router.push("/admin")}
        className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {isEditMode ? "Back to All Jobs" : "Back"}
      </button>
      <div className="mb-8 group">
        <div className="flex items-center gap-4 mb-3">
          <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              {isEditAction ? "Edit Job" : "Create New Job"}
            </h1>
            <p className="text-gray-500 font-medium mt-1 text-base sm:text-lg">
              Configure your job and screening process.
            </p>
          </div>
        </div>
      </div>
      <div
        className="rounded-2xl bg-white transition-all duration-300 relative"
        style={{ border: "1px solid #E5E7EB", borderTop: "4px solid #F97316", boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="p-8 space-y-10">
          {/* Section 0: Interview Mode Selection */}
          <section>
            <SectionHeader index={1} title="Interview Mode" subtitle="Choose how candidates are processed for this job" />
            <div className="grid grid-cols-2 gap-4 mt-4">
              {[
                {
                  value: "ats",
                  label: "Scoring + Interview",
                  icon: "⚖️",
                  desc: "Upload resumes → AI scores and ranks → you shortlist → send interview link manually.",
                  badge: "Full Pipeline",
                },
                {
                  value: "interview-only",
                  label: "Interview Only",
                  icon: "⚡",
                  desc: "Add candidates → interview link sent automatically. No scoring or shortlisting.",
                  badge: "Direct Invite",
                },
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
                      "relative text-left p-5 rounded-xl border-2 transition-all duration-200",
                      active
                        ? "border-[#F97316] bg-orange-50/50 shadow-[0_0_0_3px_rgba(249,115,22,0.1)]"
                        : locked
                          ? "border-gray-200 bg-gray-50 opacity-40 cursor-not-allowed"
                          : "border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/20 cursor-pointer"
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl">{opt.icon}</span>
                      <div className="flex items-center gap-1.5">
                        {locked && active && <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">Locked</span>}
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                          active ? "bg-[#F97316] text-white" : "bg-gray-100 text-gray-500"
                        )}>{opt.badge}</span>
                      </div>
                    </div>
                    <p className={cn("text-[15px] font-bold mb-1", active ? "text-[#F97316]" : "text-gray-800")}>{opt.label}</p>
                    <p className="text-[12px] text-gray-500 leading-relaxed">{opt.desc}</p>
                    {active && (
                      <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-[#F97316] flex items-center justify-center">
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Warning shown during creation only — this choice is permanent */}
            {!isEditMode && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <svg className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
                <p className="text-[12px] font-semibold text-amber-700">
                  <strong>This cannot be changed later.</strong> Once you create the job, the mode is locked permanently. Choose carefully.
                </p>
              </div>
            )}
          </section>
          <Divider />
          {/* Section 2: JD Upload */}
          <section>
            <SectionHeader index={2} title="Job Description" subtitle="Upload your JD and AI will auto-fill the details" />
            <JobDescription
              formData={displayFormData}
              updateFormData={setFormData}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              startAnalysis={startAnalysis}
              abortAnalysis={() => { analysisAbortRef.current?.abort(); setIsAnalyzing(false); }}
            />
          </section>
          <Divider />
          {/* Section 3: Job Name & Role */}
          <section>
            <SectionHeader index={3} title="Job Details" subtitle="Name and role for this job" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                  Job Name
                  <span className="text-[#F97316] ml-0.5">*</span>
                </Label>
                <Input
                  value={formData.title || ""}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Senior Backend Engineer"
                  className={cn(
                    "h-10 rounded-lg bg-white px-3 text-[14px] font-medium shadow-sm transition-all duration-150 placeholder:text-gray-400 placeholder:font-normal border-gray-200 hover:border-orange-300 hover:shadow-md focus-visible:ring-[#F97316]/30 focus-visible:border-[#F97316]",
                    isAnalyzing && !formData.title && "bg-orange-50/30"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                  Job Role
                  <span className="text-[#F97316] ml-0.5">*</span>
                </Label>
                <Input
                  value={formData.role || ""}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, role: e.target.value }))}
                  placeholder="e.g. Backend Engineer"
                  className={cn(
                    "h-10 rounded-lg bg-white px-3 text-[14px] font-medium shadow-sm transition-all duration-150 placeholder:text-gray-400 placeholder:font-normal border-gray-200 hover:border-orange-300 hover:shadow-md focus-visible:ring-[#F97316]/30 focus-visible:border-[#F97316]",
                    isAnalyzing && !formData.role && "bg-orange-50/30"
                  )}
                />
              </div>
            </div>
            <div className="mt-4 space-y-2 max-w-md">
              <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                Application Deadline
                <span className="text-[#F97316] ml-0.5">*</span>
              </Label>
              <PremiumDatePicker
                value={formData.deadline || ""}
                onChange={(date) => setFormData((prev: any) => ({ ...prev, deadline: date }))}
                placeholder="Select application deadline"
                disabledBeforeToday={true}
                className={cn(isAnalyzing && !formData.deadline && "opacity-95")}
              />
              <p className="text-[11px] text-gray-400 font-medium">
                Candidates can apply until this deadline.
              </p>
            </div>
            {isAnalyzing && (
              <p className="mt-2 text-[11px] text-orange-500 font-medium flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                AI is filling these fields from your job description...
              </p>
            )}
          </section>
          <Divider />
          {/* Section 4: Interview Setup */}
          <section>
            <SectionHeader index={4} title="Interview Setup" subtitle="Configure your AI interviewer" />
            <InterviewSetup
              formData={displayFormData}
              updateFormData={setFormData}
              allowLanguageSelection={allowLanguageSelection}
            />
          </section>
          <Divider />
          {/* Section 5: Screening Settings — only show for ATS mode */}
          {formData.interviewMode !== "interview-only" && (
          <section>
            <SectionHeader index={5} title="Screening Settings" subtitle="Set threshold and criteria for resume screening" />
            <ScreeningSettings
              config={screeningConfig}
              setConfig={handleScreeningConfig}
            />
          </section>
          )}
        </div>
        {/* Footer */}
        <div className="flex justify-between items-center px-8 py-4 bg-white border-t border-gray-100 rounded-b-2xl">
          <button
            onClick={() => isEditMode ? router.push("/admin/drives") : router.push("/admin")}
            className="border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 h-9 px-4 rounded-md font-semibold text-sm transition-colors"
          >
            {isEditAction ? "Cancel" : "Back"}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSavingDraft}
            className={cn(
              "flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed",
              !isSavingDraft && "hover:shadow-lg"
            )}
            style={{ background: "linear-gradient(135deg, #F97316, #ea6608)", animation: isSavingDraft ? "none" : "pulse-glow 2s infinite" }}
          >
            {isSavingDraft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
            {isSavingDraft ? "Saving..." : isEditAction ? "Update Job" : "Create Job"}
          </button>
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
function SectionHeader({ index, title, subtitle }: { index: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[13px] font-black text-[#F97316]">{index}</span>
      </div>
      <div>
        <p className="text-[15px] font-bold text-gray-900">{title}</p>
        <p className="text-[12px] text-gray-400 font-medium mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}
function Divider() {
  return <div className="h-px bg-gray-100" />;
}
