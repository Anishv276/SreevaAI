"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock, Plus, Upload, Edit3, AlertTriangle } from "lucide-react";
import { DriveCandidatesTable } from "@/components/admin/drive-candidates-table";
import { DriveResumeUploadModal } from "@/components/admin/drive-resume-upload-modal";
import { AddCandidateDrawer } from "@/components/admin/AddCandidateDrawer";
import { InterviewOnlyCandidatesTable } from "@/components/admin/InterviewOnlyCandidatesTable";
import { toast } from "@/components/ui/toast-custom";
import { getInterviewQuotaSupportMessage, isInterviewQuotaLocked } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";
import { motion } from "framer-motion";

interface DriveDetails {
    id: string;
    title: string;
    role?: string | null;
    applicants?: number | null;
    interviewMode?: string | null;
    interviewLanguage?: string | null;
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

export default function DriveCandidatesPage() {
    const params = useParams<{ driveId: string }>();
    const driveId = typeof params?.driveId === "string" ? params.driveId : Array.isArray(params?.driveId) ? params.driveId[0] : "";
    const [drive, setDrive] = useState<DriveDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [tipDismissed, setTipDismissed] = useState(false);
    const [editWarningOpen, setEditWarningOpen] = useState(false);

    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});

    useEffect(() => {
        if (!driveId) return;
        let ignore = false;
        const loadDrive = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/drives/${driveId}`);
                if (!res.ok) throw new Error("Failed to fetch drive");
                const data = await res.json();
                if (ignore) return;
                setDrive({
                    id: data.id,
                    title: data.title,
                    role: data.role || null,
                    applicants: data.applicants ?? data._count?.applications ?? 0,
                    interviewMode: data.interviewMode || "ats",
                    screeningThreshold: data.screeningThreshold ?? null,
                    interviewLanguage: data.interviewLanguage || null,
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
                console.error("Failed to fetch drive:", error);
            } finally {
                if (!ignore) setLoading(false);
            }
        };
        void loadDrive();
        return () => { ignore = true; };
    }, [driveId, refreshKey]);

    if (!driveId) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Job not found</p>
            </div>
        );
    }
    if (loading && !drive) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-9 w-9 animate-spin text-[#F97316]" />
                    <p className="text-sm font-semibold text-gray-400">Loading...</p>
                </div>
            </div>
        );
    }

    const applicantCount = drive?.applicants ?? 0;
    // Mode is determined by what was set at job creation — never toggled here
    const isInterviewOnly = drive?.interviewMode === "interview-only";

    return (
        <div className="min-h-screen bg-gray-50/60 animate-in fade-in duration-500">

            {/* ── STICKY TOP BAR: Back left | mode badge center | count right ── */}
            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
                {/* Left: Back */}
                <Link
                    href="/admin/drives"
                    className="inline-flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Jobs
                </Link>

                {/* Center: mode badge (read-only, set at creation) */}
                <div className={`flex items-center gap-2 h-8 px-4 rounded-lg text-[13px] font-bold ${
                    isInterviewOnly
                        ? "bg-orange-50 text-[#F97316] border border-orange-200"
                        : "bg-gray-100 text-gray-600 border border-gray-200"
                }`}>
                    {isInterviewOnly ? (
                        <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Interview Only</>
                    ) : (
                        <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18"/></svg> Scoring + Interview</>
                    )}
                </div>

                {/* Right: Edit Job + candidate count */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setEditWarningOpen(true)}
                        className="inline-flex h-8 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Job
                    </button>
                    <span className="text-[13px] font-semibold text-gray-400">
                        {applicantCount} {applicantCount === 1 ? "candidate" : "candidates"}
                    </span>
                </div>
            </div>

            {/* ── MAIN CARD — flush, no outer padding ── */}
            <div className="bg-white shadow-sm">

                {/* Title + subtitle */}
                <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                    <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
                        {drive?.title || "Candidates"}
                    </h1>
                    <p className="text-[13px] text-gray-400 mt-0.5">
                        {drive?.role ? `${drive.role} · candidates in one place.` : "All candidates in one place."}
                    </p>
                </div>

                {/* Action bar: search | Bulk Upload | + Add Candidate */}
                <div className="px-6 py-3 flex items-center gap-3 border-b border-gray-100 flex-wrap">
                    <div className="flex-1 min-w-[220px] relative">
                        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        <input
                            type="text"
                            placeholder="Search across all candidates..."
                            className="w-full h-9 pl-10 pr-4 rounded-full border border-gray-200 bg-gray-50 text-[13px] text-gray-600 placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:bg-white transition-colors"
                        />
                    </div>

                    <button
                        onClick={() => {
                            if (!isInterviewOnly && quotaLocked) {
                                toast.error(getInterviewQuotaSupportMessage("interviews"));
                                return;
                            }
                            setUploadOpen(true);
                        }}
                        disabled={!isInterviewOnly && quotaLocked}
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-600 hover:border-orange-300 hover:text-[#F97316] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {!isInterviewOnly && quotaLocked ? <Lock className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                        Bulk Upload
                    </button>

                    <button
                        onClick={() => setDrawerOpen(true)}
                        className="inline-flex h-9 items-center gap-2 rounded-full bg-[#F97316] hover:bg-orange-600 px-5 text-[13px] font-bold text-white transition-colors shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        Add Candidate
                    </button>
                </div>

                {/* Tip banner */}
                {!tipDismissed && (
                    <div className="mx-6 mt-3 mb-1 flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/50 px-4 py-2.5">
                        <div className="flex items-center gap-2.5 text-[13px] text-orange-600 font-medium">
                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                            {isInterviewOnly
                                ? "Interview Only mode — interview links are sent automatically when you add a candidate."
                                : "Scoring + Interview — upload resumes, AI scores them, shortlist, then send interview links."}
                        </div>
                        <button onClick={() => setTipDismissed(true)} className="text-orange-400 hover:text-orange-600 transition-colors shrink-0">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                )}

                {/* Table — determined by interviewMode set at job creation */}
                <motion.div
                    key={drive?.interviewMode || "ats"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                >
                    {isInterviewOnly ? (
                        <InterviewOnlyCandidatesTable driveId={driveId} refreshKey={refreshKey} />
                    ) : (
                        <DriveCandidatesTable driveId={driveId} refreshKey={refreshKey} />
                    )}
                </motion.div>
            </div>

            <DriveResumeUploadModal
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                driveId={driveId}
                driveName={drive?.title || "Job"}
                mode={isInterviewOnly ? "interview-only" : "ats"}
                onUploaded={() => setRefreshKey(v => v + 1)}
            />
            <AddCandidateDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                driveId={driveId}
                driveName={drive?.title || "Job"}
                mode={isInterviewOnly ? "interview-only" : "ats"}
                onDone={() => setRefreshKey(v => v + 1)}
            />

            {/* Edit Job Warning Modal */}
            {editWarningOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-6 pt-6 pb-4">
                            <div className="flex items-start gap-4">
                                <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
                                    <Edit3 className="h-5 w-5 text-[#F97316]" />
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
                                href={`/admin/create-drive?id=${driveId}&mode=edit`}
                                onClick={() => setEditWarningOpen(false)}
                                className="h-9 px-5 rounded-xl bg-[#F97316] hover:bg-orange-600 text-[13px] font-bold text-white transition-colors flex items-center gap-2"
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
