"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock, Plus, Upload, Edit3, AlertTriangle } from "lucide-react";
import { JobCandidatesTable } from "@/components/admin/job-candidates-table";
import { JobResumeUploadModal } from "@/components/admin/job-resume-upload-modal";
import { AddCandidateDrawer } from "@/components/admin/AddCandidateDrawer";
import { InterviewOnlyCandidatesTable } from "@/components/admin/InterviewOnlyCandidatesTable";
import { toast } from "@/components/ui/toast-custom";
import { getInterviewQuotaSupportMessage, isInterviewQuotaLocked } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";
import { useCandidates } from "@/context/candidates-context";
import { motion } from "framer-motion";

interface JobDetails {
    id: string;
    title: string;
    role?: string | null;
    applicants?: number | null;
    interviewMode?: string | null;
    screeningThreshold?: number | null;
    description?: string | null;
    experience?: string | null;
    responsibilities?: string | null;
    requirements?: string | null;
    skills?: string | null;
    salary?: string | null;
    extractedDetails?: Record<string, unknown> | string | null;
    jdPreviewUrl?: string | null;
    screeningCriteria?: Record<string, any> | string | null;
}

export default function JobCandidatesPage() {
    const params = useParams<{ jobId: string }>();
    const jobId = typeof params?.jobId === "string" ? params.jobId : Array.isArray(params?.jobId) ? params.jobId[0] : "";
    const [job, setJob] = useState<JobDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [tipDismissed, setTipDismissed] = useState(false);
    const [editWarningOpen, setEditWarningOpen] = useState(false);

    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const { stats, pagination } = useCandidates();

    useEffect(() => {
        if (!jobId) return;
        let ignore = false;
        const loadJob = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/jobs/${jobId}`);
                if (!res.ok) throw new Error("Failed to fetch job");
                const data = await res.json();
                if (ignore) return;
                setJob({
                    id: data.id,
                    title: data.title,
                    role: data.role || null,
                    applicants: data.applicants ?? data._count?.applications ?? 0,
                    interviewMode: data.interviewMode || "ats",
                    screeningThreshold: data.screeningThreshold ?? null,
                    description: data.description || null,
                    experience: data.experience || null,
                    responsibilities: data.responsibilities || null,
                    requirements: data.requirements || null,
                    skills: data.skills || null,
                    salary: data.salary || null,
                    extractedDetails: data.extractedDetails || null,
                    jdPreviewUrl: data.jdPreviewUrl || null,
                    screeningCriteria: data.screeningCriteria || null,
                });
            } catch (error) {
                console.error("Failed to fetch job:", error);
            } finally {
                if (!ignore) setLoading(false);
            }
        };
        void loadJob();
        return () => { ignore = true; };
    }, [jobId, refreshKey]);

    if (!jobId) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Job not found</p>
            </div>
        );
    }
    if (loading && !job) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-9 w-9 animate-spin text-[#7C3AED]" />
                    <p className="text-sm font-semibold text-gray-400">Loading...</p>
                </div>
            </div>
        );
    }

    const applicantCount = pagination.total || job?.applicants || 0;
    const isInterviewOnly = job?.interviewMode === "interview-only";

    const getPct = (val: number) => {
        if (!applicantCount) return 0;
        return Math.round((val / applicantCount) * 100);
    };

    return (
        <div className="flex flex-col space-y-3 animate-in fade-in duration-500 flex-1 -mb-10 overflow-hidden">

            {/* ── STICKY TOP BAR: Back left | mode badge center | Upload, Add, ... right ── */}
            <div className="flex items-center justify-between px-4 py-3 bg-white sticky top-0 z-30 rounded-xl" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                {/* Left: Back */}
                <Link
                    href="/admin/jobs"
                    className="inline-flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Jobs
                </Link>

                {/* Center: mode badge + tip */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 h-8 px-4 rounded-xl text-[12px] font-bold bg-violet-50 text-[#7C3AED] shadow-sm">
                        {isInterviewOnly ? (
                            <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Interview Only</>
                        ) : (
                            <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18"/></svg> Scoring + Interview</>
                        )}
                    </div>
                    <span className="text-[12px] font-medium text-gray-500 hidden md:block">
                        {isInterviewOnly
                            ? "Interview links are sent automatically when you add a candidate."
                            : "Upload resumes, AI scores them, shortlist, then send interview links."}
                    </span>
                </div>

                {/* Right: Upload Resume, Add Candidate, Actions */}
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={() => {
                            if (!isInterviewOnly && quotaLocked) {
                                toast.error(getInterviewQuotaSupportMessage("interviews"));
                                return;
                            }
                            setUploadOpen(true);
                        }}
                        disabled={!isInterviewOnly && quotaLocked}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {!isInterviewOnly && quotaLocked ? <Lock className="h-3.5 w-3.5 text-gray-400" /> : <Upload className="h-3.5 w-3.5 text-gray-400" />}
                        Upload Resume
                    </button>
                    <button
                        onClick={() => setDrawerOpen(true)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#6D28D9] px-3.5 text-[12px] font-bold text-white transition-colors hover:bg-violet-700 shadow-sm"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add Candidate
                    </button>
                    <button
                        onClick={() => setEditWarningOpen(true)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-[12px] font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Job
                    </button>
                </div>
            </div>



            {/* ── TITLE CARD WITH METRICS ── */}
            <div className="bg-white rounded-2xl overflow-hidden p-6" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                    {/* Left: Job Info */}
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                            <svg className="h-7 w-7 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 mb-1">
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                                    {job?.title || "GTM Engineer"}
                                </h1>
                                <span className="inline-flex h-5 items-center px-2 rounded-md bg-emerald-50 text-[10px] font-bold uppercase tracking-wider text-emerald-600 border border-emerald-100">
                                    Active
                                </span>
                            </div>
                            <p className="text-[13px] text-gray-500 font-medium">
                                {job?.title || "GTM Engineer"} • Created on 27 Jun 2026
                            </p>
                        </div>
                    </div>

                    {/* Right: Metrics */}
                    <div className="flex items-stretch gap-2 w-full xl:w-auto">
                        {/* Total Candidates */}
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-violet-50/50 border border-violet-100 flex-1 min-w-[110px]">
                            <div className="mt-0.5"><svg className="h-4 w-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg></div>
                            <div>
                                <p className="text-xl font-black text-gray-900 leading-none mb-1">{applicantCount}</p>
                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Total</p>
                            </div>
                        </div>

                        {/* Shortlisted */}
                        <div className="flex flex-col justify-between p-3 rounded-xl bg-emerald-50/30 border border-emerald-100 flex-1 min-w-[110px] relative">
                            <div className="flex items-start gap-2">
                                <div className="mt-0.5"><svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg></div>
                                <div className="pr-6">
                                    <p className="text-xl font-black text-gray-900 leading-none mb-1">{stats.shortlisted}</p>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Shortlisted</p>
                                </div>
                            </div>
                            <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">{getPct(stats.shortlisted)}%</div>
                        </div>

                        {/* Interviewed */}
                        <div className="flex flex-col justify-between p-3 rounded-xl bg-blue-50/30 border border-blue-100 flex-1 min-w-[110px] relative">
                            <div className="flex items-start gap-2">
                                <div className="mt-0.5"><svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>
                                <div className="pr-6">
                                    <p className="text-xl font-black text-gray-900 leading-none mb-1">{stats.interviewCompleted}</p>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Interviewed</p>
                                </div>
                            </div>
                            <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">{getPct(stats.interviewCompleted)}%</div>
                        </div>

                        {/* Ready for Hire */}
                        <div className="flex flex-col justify-between p-3 rounded-xl bg-amber-50/30 border border-amber-100 flex-1 min-w-[110px] relative">
                            <div className="flex items-start gap-2">
                                <div className="mt-0.5"><svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                                <div className="pr-6">
                                    <p className="text-xl font-black text-gray-900 leading-none mb-1">{stats.readyForHire}</p>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Ready</p>
                                </div>
                            </div>
                            <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">{getPct(stats.readyForHire)}%</div>
                        </div>

                        {/* Rejected */}
                        <div className="flex flex-col justify-between p-3 rounded-xl bg-red-50/30 border border-red-100 flex-1 min-w-[110px] relative">
                            <div className="flex items-start gap-2">
                                <div className="mt-0.5"><svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg></div>
                                <div className="pr-6">
                                    <p className="text-xl font-black text-gray-900 leading-none mb-1">{stats.rejected}</p>
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Rejected</p>
                                </div>
                            </div>
                            <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">{getPct(stats.rejected)}%</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── MAIN CARD WITH TABLE (remove its outer borders to make it flow from filters) ── */}
            <div className="bg-white rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>

                {/* Table — determined by interviewMode set at job creation */}
                <motion.div
                    key={job?.interviewMode || "ats"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col flex-1 min-h-0"
                >
                    {isInterviewOnly ? (
                        <InterviewOnlyCandidatesTable jobId={jobId} refreshKey={refreshKey} />
                    ) : (
                        <JobCandidatesTable jobId={jobId} refreshKey={refreshKey} />
                    )}
                </motion.div>
            </div>

            <JobResumeUploadModal
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                jobId={jobId}
                jobName={job?.title || "Job"}
                mode={isInterviewOnly ? "interview-only" : "ats"}
                onUploaded={() => setRefreshKey(v => v + 1)}
            />
            <AddCandidateDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                jobId={jobId}
                jobName={job?.title || "Job"}
                mode={isInterviewOnly ? "interview-only" : "ats"}
                onDone={() => setRefreshKey(v => v + 1)}
            />

            {/* Edit Job Warning Modal */}
            {editWarningOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-6 pt-6 pb-4">
                            <div className="flex items-start gap-4">
                                <div className="h-10 w-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
                                    <Edit3 className="h-5 w-5 text-[#7C3AED]" />
                                </div>
                                <div>
                                    <h2 className="text-[16px] font-bold text-gray-900">Edit Job Details</h2>
                                    <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">
                                        You can update the job title, role, deadline, interview questions, and voice settings.
                                    </p>
                                    <p className="mt-2 text-[12px] text-gray-400">
                                        Mode: <span className="font-semibold text-gray-600">{isInterviewOnly ? "Interview Only" : "Scoring + Interview"}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                            <button onClick={() => setEditWarningOpen(false)} className="h-9 px-5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
                                Cancel
                            </button>
                            <Link
                                href={`/admin/create-job?id=${jobId}&mode=edit`}
                                onClick={() => setEditWarningOpen(false)}
                                className="h-9 px-5 rounded-xl bg-[#7C3AED] hover:bg-violet-600 text-[13px] font-bold text-white transition-colors flex items-center gap-2"
                            >
                                <Edit3 className="h-3.5 w-3.5" />
                                Continue to Edit
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
