"use client";

import { useState, useRef, Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PersonalInfo } from "@/components/application/personal-info";
import { ProfessionalDetails } from "@/components/application/professional-details";
import { ResumeReview } from "@/components/application/resume-review";
import { ExperienceInfo } from "@/components/application/experience-info";
import { EducationInfo } from "@/components/application/education-info";
import { CertificationInfo } from "@/components/application/certification-info";
import { PortalHeader } from "@/components/careers/portal-header";
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useJobs } from "@/context/jobs-context";


function formatExtractedLocation(location: any): string {
    if (!location) return "";
    if (typeof location === "string") return location.trim();
    const parts = [location.city, location.state, location.country]
        .map((p: any) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean);
    return parts.join(", ");
}

export default function ApplicationPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const mode = searchParams.get("mode");
    const id = params?.id as string;
    const { jobs } = useJobs();
    const [alreadyApplied, setAlreadyApplied] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [pageAlert, setPageAlert] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

    const showAlert = (message: string, type: 'error' | 'success' = 'error') => {
        setPageAlert({ message, type });
        setTimeout(() => setPageAlert(null), 4000);
    };

    // Fix: support both numeric ID and random Slug
    const job = jobs.find(j => j.id.toString() === id || (j as any).slug === id);
    const jobTitle = job?.title || "this position";

    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        phone: "",
        location: "",
        portfolio: "",
        experience: "",
        experienceYears: null as number | null,
        currentCompany: "",
        ctc: "",
        noticePeriod: "",
        expectedCtc: "",
        coverLetter: "",
        resumeUploaded: false,
        resumeText: "",
        resumeUrl: "",
        passportUrl: "",
        passportUploaded: false,
        isUploadingPassport: false,
        structuredResume: {},
        agreedToTerms: false,
        customAnswers: {} as Record<string, any>,
        education: [] as any[],
        experience_list: [] as any[],
        certifications: [] as any[]
    });

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    //  Race condition guards 
    // State updates are batched/async; refs are synchronous - use refs as the
    // authoritative "in-flight" flag so two rapid file-drops cannot both pass
    // the guard before the first setIsAnalyzing(true) has rendered.
    const isAnalyzingRef = useRef(false);
    const isUploadingPassportRef = useRef(false);
    const isSubmittingRef = useRef(false);
    // 

    const updateFormData = (updates: Partial<typeof formData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    useEffect(() => {
        if (id && typeof window !== "undefined") {
            const prefill = localStorage.getItem(`prefill_${id}`);
            if (prefill) {
                try {
                    const data = JSON.parse(prefill);
                    setFormData(prev => ({
                        ...prev,
                        ...data,
                        resumeUploaded: !!data.resumeUrl
                    }));
                    localStorage.removeItem(`prefill_${id}`);
                } catch (e) {
                    console.error("Failed to parse pre-fill data:", e);
                }
            }
        }
    }, [id]);

    //  Resume analysis (race-condition-safe) 
    const startAnalysis = async (file: File) => {
        // Synchronous ref check prevents concurrent calls even before React
        // re-renders with the updated isAnalyzing state.
        if (isAnalyzingRef.current) return;
        isAnalyzingRef.current = true;

        setIsAnalyzing(true);
        setAnalysisError(null);
        updateFormData({ resumeUploaded: true });

        const data = new FormData();
        data.append("file", file);
        data.append("type", "RESUME");
        if ((job as any)?.orgId) data.append("orgId", (job as any).orgId);

        try {
            const response = await fetch("/api/extract", {
                method: "POST",
                body: data,
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.error || "Failed to extract resume details");
            }

            const { data: extracted, text, url: resumeUrl } = await response.json();

            updateFormData({
                fullName: extracted?.full_name || formData.fullName,
                email: extracted?.email || formData.email,
                phone: extracted?.phone || formData.phone,
                location: formatExtractedLocation(extracted?.location) || formData.location,
                currentCompany: extracted?.current_company || formData.currentCompany,
                experience: extracted?.total_experience ? String(extracted.total_experience) : formData.experience,
                experienceYears: typeof extracted?.total_experience === "number" ? extracted.total_experience : formData.experienceYears,
                resumeUrl: resumeUrl || formData.resumeUrl,
                resumeText: text || formData.resumeText,
                structuredResume: extracted || formData.structuredResume,
                education: Array.isArray(extracted?.education) ? extracted.education : formData.education,
                experience_list: Array.isArray(extracted?.work_history) ? extracted.work_history : formData.experience_list,
                resumeUploaded: true,
            });
        } catch (err: any) {
            console.error("Resume analysis error:", err);
            setAnalysisError(err?.message || "Could not analyze resume. You can still fill in the form manually.");
            updateFormData({ resumeUploaded: false });
        } finally {
            setIsAnalyzing(false);
            isAnalyzingRef.current = false;
        }
    };

    const clearResume = () => {
        if (isAnalyzingRef.current) return; // don't allow clear during upload
        updateFormData({
            resumeUploaded: false,
            resumeUrl: "",
            resumeText: "",
            structuredResume: {},
        });
        setAnalysisError(null);
    };

    //  Passport upload (race-condition-safe) 
    const startPassportUpload = async (file: File) => {
        if (isUploadingPassportRef.current) return;
        isUploadingPassportRef.current = true;
        updateFormData({ isUploadingPassport: true });

        try {
            const presignedRes = await fetch("/api/upload/presigned", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileName: file.name,
                    fileType: file.type,
                    type: "CERTIFICATION",
                }),
            });

            if (!presignedRes.ok) throw new Error("Failed to get upload URL for passport");
            const { uploadUrl, publicUrl } = await presignedRes.json();

            const uploadRes = await fetch(uploadUrl, {
                method: "PUT",
                body: file,
                headers: { "Content-Type": file.type },
            });

            if (!uploadRes.ok) throw new Error("Failed to upload passport photo");

            updateFormData({
                passportUrl: publicUrl,
                passportUploaded: true,
                isUploadingPassport: false,
            });
        } catch (err: any) {
            console.error("Passport upload error:", err);
            showAlert(err?.message || "Failed to upload passport photo. Please try again.");
            updateFormData({ isUploadingPassport: false, passportUploaded: false });
        } finally {
            isUploadingPassportRef.current = false;
        }
    };

    //  Form submission (race-condition-safe) 
    const handleSubmit = async () => {
        if (isSubmittingRef.current) return;

        // Basic validation
        const missing = [];
        if (!formData.fullName.trim()) missing.push("Full Name");
        if (!formData.email.trim()) missing.push("Email Address");
        if (!formData.phone.trim()) missing.push("Phone Number");
        if (!formData.location.trim()) missing.push("Current Location");
        if (!formData.resumeUrl && !formData.resumeUploaded) missing.push("Resume");
        
        if (missing.length > 0) {
            showAlert(`Please fill required fields: ${missing.join(", ")}`);
            return;
        }

        if (!formData.agreedToTerms) {
            showAlert("Please agree to the terms to proceed");
            return;
        }

        isSubmittingRef.current = true;
        setIsSubmitting(true);

        try {
            const payload: Record<string, any> = {
                driveId: id,
                fullName: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                location: formData.location,
                portfolio: formData.portfolio,
                experience: formData.experience,
                experienceYears: formData.experienceYears,
                currentCompany: formData.currentCompany,
                ctc: formData.ctc,
                noticePeriod: formData.noticePeriod,
                expectedCtc: formData.expectedCtc,
                coverLetter: formData.coverLetter,
                resumeUrl: formData.resumeUrl,
                resumeText: formData.resumeText,
                structuredResume: formData.structuredResume,
                passportUrl: formData.passportUrl || undefined,
                education: formData.education,
                experience_list: formData.experience_list,
                certifications: formData.certifications,
                customAnswers: formData.customAnswers,
            };

            const res = await fetch("/api/candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 409) {
                    setAlreadyApplied(true);
                    return;
                }
                throw new Error(err?.error || "Submission failed");
            }

            await res.json();
            setIsSuccess(true);
        } catch (err: any) {
            console.error("Submit error:", err);
            showAlert(err?.message || "Submission failed. Please try again.");
        } finally {
            setIsSubmitting(false);
            isSubmittingRef.current = false;
        }
    };

    //  Render: success state 
    if (isSuccess) {
        return (
            <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full text-center space-y-6"
                >
                    <div className="h-20 w-20 rounded-3xl bg-green-100 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="h-10 w-10 text-green-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Application Submitted!</h1>
                        <p className="text-gray-500 mt-2 font-medium">
                            Thank you for applying to <span className="font-bold text-gray-800">{jobTitle}</span>. We'll be in touch soon.
                        </p>
                    </div>
                    <Link href={`/careers`}>
                        <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold">
                            Browse More Jobs
                        </Button>
                    </Link>
                </motion.div>
            </div>
        );
    }

    //  Render: already applied 
    if (alreadyApplied) {
        return (
            <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full text-center space-y-6"
                >
                    <div className="h-20 w-20 rounded-3xl bg-amber-100 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-10 w-10 text-amber-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Already Applied</h1>
                        <p className="text-gray-500 mt-2 font-medium">
                            It looks like you've already applied to this position.
                        </p>
                    </div>
                    <Link href={`/careers`}>
                        <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold">
                            Browse More Jobs
                        </Button>
                    </Link>
                </motion.div>
            </div>
        );
    }

    //  Render: main application form 
    const isPassportRequired = !!(job as any)?.isPassportRequired;

    return (
        <div className="min-h-screen bg-[#FDFCFB] flex flex-col">
            <PortalHeader />

            {/* Alert Banner */}
            <AnimatePresence>
                {pageAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-xl text-sm font-bold ${
                            pageAlert.type === "success"
                                ? "bg-green-600 text-white"
                                : "bg-red-500 text-white"
                        }`}
                    >
                        {pageAlert.type === "error" ? (
                            <AlertCircle className="h-4 w-4" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4" />
                        )}
                        {pageAlert.message}
                        <button
                            type="button"
                            onClick={() => setPageAlert(null)}
                            className="ml-2 opacity-70 hover:opacity-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="flex-1 container max-w-2xl py-10 px-4 mx-auto">
                <div className="mb-8 flex items-center gap-4">
                    <Link href={`/careers/${id}`} className="h-10 w-10 flex items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm hover:border-orange-200 transition-all">
                        <ArrowLeft className="h-5 w-5 text-gray-500" />
                    </Link>
                    <div>
                        <p className="text-[10px] font-black text-[#F97316] uppercase tracking-[0.3em]">Application</p>
                        <h1 className="text-xl font-black text-gray-900 leading-tight">{jobTitle}</h1>
                    </div>
                </div>

                <div className="space-y-10">
                    <PersonalInfo
                        formData={formData}
                        updateFormData={updateFormData}
                        isAnalyzing={isAnalyzing}
                        analysisError={analysisError}
                        startAnalysis={startAnalysis}
                        clearResume={clearResume}
                        mode={mode || "resume"}
                        isPassportRequired={isPassportRequired}
                        isUploadingPassport={formData.isUploadingPassport}
                        startPassportUpload={startPassportUpload}
                        passportUploaded={formData.passportUploaded}
                        passportUrl={formData.passportUrl}
                    />

                    <ProfessionalDetails
                        formData={formData}
                        updateFormData={updateFormData}
                        isAnalyzing={isAnalyzing}
                    />

                    <ExperienceInfo
                        value={formData.experience_list}
                        onChange={(val) => updateFormData({ experience_list: val })}
                    />

                    <EducationInfo
                        value={formData.education}
                        onChange={(val) => updateFormData({ education: val })}
                    />

                    <CertificationInfo
                        value={formData.certifications}
                        onChange={(val) => updateFormData({ certifications: val })}
                    />

                    <ResumeReview
                        formData={formData}
                        updateFormData={updateFormData}
                        isAnalyzing={isAnalyzing}
                        analysisError={analysisError}
                        startAnalysis={startAnalysis}
                        clearResume={clearResume}
                        agreedToTerms={formData.agreedToTerms}
                        onAgreedToTermsChange={(checked) => updateFormData({ agreedToTerms: checked })}
                    />

                    <AnimatePresence>
                        {formData.agreedToTerms && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="pt-4 flex justify-end"
                            >
                                <Button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || isAnalyzing}
                                    className="h-14 px-10 rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        "Submit Application"
                                    )}
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}

