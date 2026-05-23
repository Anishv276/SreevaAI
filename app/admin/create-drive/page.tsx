"use client";
import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-custom";
import { JobDescription } from "@/components/create-drive/job-description";
import { InterviewSetup } from "@/components/create-drive/interview-setup";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { getInterviewActionBlockedMessage, getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { canUseMultilingual } from "@/lib/org-plans";
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
  CalendarDays,
} from "lucide-react";
import { useAdminOrg } from "@/context/admin-org-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PremiumDatePicker } from "@/components/ui/premium-date-picker";
import { INTERVIEW_MODE_DEADLINE, INTERVIEW_MODE_SLOT, normalizeInterviewMode, type InterviewMode } from "@/lib/interview-mode";

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
  const [formData, setFormData] = useState<any>({
    title: "",
    role: "",
    deadline: "",
    interviewMode: null as InterviewMode | null,
    orgInterviewMode: INTERVIEW_MODE_DEADLINE as InterviewMode,
    interviewLanguage: "English",
    interviewQuestions: [],
    voiceId: null,
    aiName: "Ishitha",
    extractedDetails: null,
  });

  const [published, setPublished] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const adminOrg = useAdminOrg();
  const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
  const orgStatus = String(adminOrg?.status || "ACTIVE").toUpperCase();
  const analysisAbortRef = useRef<AbortController | null>(null);
  const hasInitialLoadedRef = useRef<string | null>(null);
  const formDataRef = useRef<any>(formData);
  const jdPersistedUrlRef = useRef<string | null>(null);
  const activeDriveCount = organization?.activeDriveCount ?? getActiveDriveCount(jobs);
  const maxActiveDrives = organization?.maxActiveDrives;
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
    if (!isEditMode) {
      fetch("/api/admin/organization", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) return;
          setFormData((prev: any) => ({
            ...prev,
            voiceId: data.voiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
            allowedVoices: Array.isArray(data.allowedVoices) ? data.allowedVoices : [],
            orgInterviewMode: normalizeInterviewMode(data.interviewMode),
          }));
        })
        .catch(() => {});
    }
  }, [isEditMode]);

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
          const orgRes = await fetch("/api/admin/organization", { cache: "no-store" });
          const orgData = await orgRes.json();
          setFormData((prev: any) => ({
            ...prev,
            title: drive.title,
            role: (drive as any).role || drive.title,
            deadline: formatDateForInput((drive as any).deadline || null),
            interviewMode: (drive as any).interviewMode || null,
            orgInterviewMode: normalizeInterviewMode(orgData?.interviewMode),
            interviewLanguage: (drive as any).interviewLanguage || "English",
            interviewQuestions: typeof (drive as any).interviewQuestions === "string"
              ? JSON.parse((drive as any).interviewQuestions)
              : (drive as any).interviewQuestions || [],
            jdFileName: (drive as any).jdFileName || "",
            jdPreviewUrl: (drive as any).jdPreviewUrl || "",
            extractedDetails: (drive as any).extractedDetails || null,
            voiceId: (drive as any).voiceId || (!orgData.error && orgData.voiceId) || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
            allowedVoices: !orgData.error && Array.isArray(orgData.allowedVoices) ? orgData.allowedVoices : [],
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
          toast.success("Job Description synced from AI Assistant!");
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
          interviewMode: null,
          orgInterviewMode: formDataRef.current?.orgInterviewMode || INTERVIEW_MODE_DEADLINE,
          interviewLanguage: "English", interviewQuestions: [],
          voiceId: null, aiName: "Ishitha", extractedDetails: null,
        });
        setIsAnalyzing(false);
        setAnalysisError(null);
      }
    }
  }, [isEditMode, searchParams]);

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
          title: `${extracted?.job_title || prev.role || "New"} Recruitment Drive`,
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
      title: currentFormData.title || "Untitled Drive",
      description: currentFormData.description || "",
      role: currentFormData.role || "",
      deadline: currentFormData.deadline || null,
      interviewMode: currentFormData.interviewMode || null,
      jdFileName: currentFormData.jdFileName || null,
      jdPreviewUrl: getPersistedJdUrl(currentFormData),
      extractedDetails: currentFormData.extractedDetails ? typeof currentFormData.extractedDetails === "string" ? currentFormData.extractedDetails : JSON.stringify(currentFormData.extractedDetails) : null,
      interviewLanguage: allowLanguageSelection ? currentFormData.interviewLanguage || "English" : "English",
      interviewQuestions: parsedQuestions,
      voiceId: currentFormData.voiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      aiName: currentFormData.aiName || "Ishitha",
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
        setPublished(true);
        toast.success(isEditAction ? "Drive updated successfully!" : "Drive created successfully!");
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
            Your Drive is {isEditAction ? "Updated" : "Created"}! 🎉
          </h1>
          <p className="text-gray-500 mt-2 text-[15px]">
            Your recruitment drive is ready. Go to your drives list to start uploading resumes.
          </p>
        </div>
        <Button className="bg-[#F97316] hover:bg-orange-600 text-white" onClick={() => router.push("/admin/drives")}>
          Go to All Drives
        </Button>
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
        {isEditMode ? "Back to All Drives" : "Back"}
      </button>

      <div className="mb-8 group">
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
                    {interviewAccessLocked ? (isSuspended ? "Account suspended" : "Interview quota locked") : "Drive limit reached"}
                  </p>
                  <h2 className="text-lg font-bold text-gray-900">
                    {interviewAccessLocked ? getInterviewQuotaSupportMessage("interviews") : "Go to Billing to upgrade your plan"}
                  </h2>
                  <p className="text-sm font-medium text-gray-600">
                    {interviewAccessLocked
                      ? getInterviewActionBlockedMessage(isSuspended)
                      : `Your plan allows ${formatDriveLimit(maxActiveDrives)} active drives and you currently have ${activeDriveCount} active drives.`}
                  </p>
                </div>
              </div>
              {interviewAccessLocked ? (
                <a href={getSupportComposeUrl({ subject: "Interview quota support request", body: isSuspended ? "Hi support team,\n\nOur account is suspended by Super Admin. Please help us restore access.\n" : "Hi support team,\n\nPlease help us restore interview access for our account.\n" })} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-orange-600">
                  Contact Support <ChevronRight className="h-4 w-4" />
                </a>
              ) : (
                <Link href="/admin/billing" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-orange-600">
                  Upgrade Plan <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className="rounded-2xl bg-white transition-all duration-300 relative"
        style={{ border: "1px solid #E5E7EB", borderTop: "4px solid #F97316", boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="p-8 space-y-10">

          {/* Section 1: JD Upload */}
          <section>
            <SectionHeader index={1} title="Job Description" subtitle="Upload your JD and AI will auto-fill the details" />
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

          {/* Section 2: Drive Name & Role */}
          <section>
            <SectionHeader index={2} title="Drive Details" subtitle="Name and role for this recruitment drive" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                  Drive Name
                  <span className="text-[#F97316] ml-0.5">*</span>
                </Label>
                <Input
                  value={formData.title || ""}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Senior Backend Engineer Drive"
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
                In deadline mode, candidates can join anytime before this deadline. In slot mode, candidates can book slots up to this deadline.
              </p>
            </div>
            <div className="mt-4 space-y-2 max-w-2xl">
              <Label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                Interview Mode Override
              </Label>
              <div className="grid gap-2 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, interviewMode: null }))}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    !formData.interviewMode
                      ? "border-[#F97316] bg-orange-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Use Org Default</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Current org default: {normalizeInterviewMode(formData.orgInterviewMode) === INTERVIEW_MODE_SLOT ? "Slot Scheduling" : "Deadline Based Link"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, interviewMode: INTERVIEW_MODE_DEADLINE }))}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    formData.interviewMode === INTERVIEW_MODE_DEADLINE
                      ? "border-[#F97316] bg-orange-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Deadline Mode</p>
                  <p className="mt-1 text-[11px] text-gray-500">Candidate uses direct interview link before deadline.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, interviewMode: INTERVIEW_MODE_SLOT }))}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    formData.interviewMode === INTERVIEW_MODE_SLOT
                      ? "border-[#F97316] bg-orange-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">Slot Mode</p>
                  <p className="mt-1 text-[11px] text-gray-500">Candidate must pick a slot and join in slot window.</p>
                </button>
              </div>
            </div>
            {isAnalyzing && (
              <p className="mt-2 text-[11px] text-orange-500 font-medium flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                AI is filling these fields from your JD...
              </p>
            )}
          </section>

          <Divider />

          {/* Section 3: Interview Setup */}
          <section>
            <SectionHeader index={3} title="Interview Setup" subtitle="Configure your AI interviewer" />
            <InterviewSetup
              formData={displayFormData}
              updateFormData={setFormData}
              allowLanguageSelection={allowLanguageSelection}
            />
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-8 py-4 bg-white border-t border-gray-100 rounded-b-2xl">
          <button
            onClick={() => isEditMode ? router.push("/admin/drives") : router.push("/admin")}
            className="border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 h-9 px-4 rounded-md font-semibold text-sm transition-colors"
          >
            {isEditAction ? "Cancel" : "Back"}
          </button>

          {driveCreationLocked && !isEditMode ? (
            interviewAccessLocked ? (
              <a href={getSupportComposeUrl({ subject: "Interview quota support request", body: isSuspended ? "Hi support team,\n\nOur account is suspended by Super Admin. Please help us restore access.\n" : "Hi support team,\n\nPlease help us restore interview access for our account.\n" })} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 hover:shadow-lg" style={{ background: "linear-gradient(135deg, #F97316, #ea6608)" }}>
                <Lock className="h-5 w-5" /> Contact Support
              </a>
            ) : (
              <Link href="/admin/billing" className="flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 hover:shadow-lg" style={{ background: "linear-gradient(135deg, #F97316, #ea6608)" }}>
                <Lock className="h-5 w-5" /> Go to Billing
              </Link>
            )
          ) : (
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
              {isSavingDraft ? "Saving..." : isEditAction ? "Update Drive" : "Create Drive"}
            </button>
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
