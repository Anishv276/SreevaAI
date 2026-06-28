"use client";
import { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { JobDescription } from "@/components/create-drive/job-description";
import { InterviewSetup } from "@/components/create-drive/interview-setup";
import { ScreeningSettings } from "@/components/create-drive/screening-settings";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { getInterviewActionBlockedMessage, getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { canUseMultilingual } from "@/lib/org-plans";
import { parseDriveScreeningSettings, sanitizeScreeningCriteria, type ScreeningCriteria } from "@/lib/screening-criteria";
import { formatDriveLimit, getActiveDriveCount, isDriveCreationLocked } from "@/lib/drive-limits";
import { CheckCircle2, Rocket, ChevronLeft, ChevronRight, Loader2, Lock, Zap, LayoutList, Calendar, FileText, Mic, SlidersHorizontal } from "lucide-react";
import { useAdminOrg } from "@/context/admin-org-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PremiumDatePicker } from "@/components/ui/premium-date-picker";

export default function CreateDrivePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="h-5 w-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    }>
      <CreateDriveForm />
    </Suspense>
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
  const fallbackAllowedVoices = useMemo(() => adminAllowedVoices, [adminAllowedVoices]);

  const [formData, setFormData] = useState<any>({
    title: "", role: "", deadline: "",
    interviewLanguage: "English", interviewQuestions: [],
    screeningThreshold: 60, screeningCriteria: {} as ScreeningCriteria,
    voiceId: fallbackVoiceId, allowedVoices: fallbackAllowedVoices,
    aiName: "Ishitha", extractedDetails: null, interviewMode: "ats",
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
    if (!allowLanguageSelection && formData.interviewLanguage !== "English") {
      setFormData((prev: any) => ({ ...prev, interviewLanguage: "English" }));
    }
  }, [allowLanguageSelection, formData.interviewLanguage]);

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
              const parsed = parseDriveScreeningSettings((drive as any).screeningCriteria, Number((drive as any).screeningThreshold ?? 60));
              return { screeningThreshold: parsed.threshold, screeningCriteria: parsed.criteria };
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
        } catch (e) { console.error("CreateDrive Sync - Parse Error:", e); }
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isEditMode && !searchParams.get("id")) {
      const method = searchParams.get("method");
      if (method !== "ai-chat") {
        setFormData({
          title: "", role: "", deadline: "",
          interviewLanguage: "English", interviewQuestions: [],
          screeningThreshold: 60, screeningCriteria: {},
          voiceId: fallbackVoiceId, allowedVoices: fallbackAllowedVoices,
          aiName: "Ishitha", extractedDetails: null, interviewMode: "ats",
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
      extractedDetails: currentFormData.extractedDetails
        ? typeof currentFormData.extractedDetails === "string" ? currentFormData.extractedDetails : JSON.stringify(currentFormData.extractedDetails)
        : null,
      interviewLanguage: allowLanguageSelection ? currentFormData.interviewLanguage || "English" : "English",
      interviewQuestions: parsedQuestions,
      screeningThreshold: Number(currentFormData.screeningThreshold ?? 60),
      screeningCriteria: sanitizeScreeningCriteria(currentFormData.screeningCriteria || {}),
      voiceId: currentFormData.voiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      aiName: currentFormData.aiName || "Ishitha",
      interviewMode: currentFormData.interviewMode || "ats",
    };
    try {
      let savedId: string | null = null;
      if (isEditMode) {
        await updateJob(driveId!, jobData);
        savedId = driveId;
      } else {
        const result = await addJob({ ...jobData, postedAt: new Date().toISOString() } as any);
        savedId = result?.id;
      }
      if (savedId) {
        setPublishedDriveId(savedId);
        setPublished(true);
        toast.success(isEditAction ? "Job updated successfully!" : "Job created successfully!");
      } else {
        throw new Error("Failed to retrieve Drive ID after saving.");
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
      const current = { threshold: Number(prev.screeningThreshold ?? 60), criteria: (prev.screeningCriteria || {}) as ScreeningCriteria };
      const next = typeof cfg === "function" ? cfg(current) : cfg;
      return { ...prev, screeningThreshold: Number(next.threshold ?? 60), screeningCriteria: sanitizeScreeningCriteria(next.criteria || {}) };
    }), []);

  // ── Success ──────────────────────────────────────────────────────────────
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
          onClick={() => router.push(publishedDriveId ? `/admin/candidates/drive/${publishedDriveId}` : "/admin/drives")}
        >
          <ChevronRight className="h-4 w-4" /> View Job
        </button>
      </div>
    );
  }

  // ── Locked ───────────────────────────────────────────────────────────────
  if (driveCreationLocked) {
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
                : `Your plan allows ${formatDriveLimit(maxActiveDrives)} active jobs. You currently have ${activeDriveCount} active.`}
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

  // ── Main Form — two-column layout ────────────────────────────────────────
  return (
    <div className="pb-10 animate-in fade-in duration-500">
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
            onClick={() => router.push(isEditMode ? "/admin/drives" : "/admin")}
            className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-all self-start sm:self-auto"
            style={{ border: "1px solid #E9E7FF" }}>
            <ChevronLeft className="h-4 w-4" />
            {isEditAction ? "Cancel" : "Back"}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSavingDraft}
            className="btn-shimmer inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: isSavingDraft ? "none" : "0 4px 14px rgba(124,58,237,0.3)" }}>
            {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {isSavingDraft ? "Saving…" : isEditAction ? "Update Job" : "Create Job"}
          </button>
        </div>
      </div>

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
                  value={formData.role || ""}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, role: e.target.value }))}
                  placeholder="e.g. Backend Engineer"
                  className={cn("h-9 rounded-xl bg-gray-50 text-sm placeholder:text-gray-400 focus-visible:ring-[#7C3AED]/20 focus-visible:border-[#7C3AED] focus-visible:bg-white transition-all", isAnalyzing && !formData.role && "animate-pulse bg-violet-50/30")}
                  style={{ border: "1px solid #E9E7FF" }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Deadline <span className="text-[#7C3AED]">*</span>
                </Label>
                <PremiumDatePicker
                  value={formData.deadline || ""}
                  onChange={(date) => setFormData((prev: any) => ({ ...prev, deadline: date }))}
                  placeholder="Select deadline"
                  disabledBeforeToday={true}
                  className={cn(isAnalyzing && !formData.deadline && "opacity-90")}
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
            <CardHeader icon={<Mic className="h-3.5 w-3.5" />} title="Interview Setup" subtitle="Voice, language, and questions" />
            <InterviewSetup
              formData={formData}
              updateFormData={setFormData}
              allowLanguageSelection={allowLanguageSelection}
            />
          </Card>

          {/* Screening — ATS only */}
          {formData.interviewMode !== "interview-only" && (
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

// ── Shared primitives ────────────────────────────────────────────────────────

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
