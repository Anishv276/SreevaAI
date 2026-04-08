"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";

export default function ApplicationPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const mode = searchParams.get("mode");
    const id = params?.id as string;
    const router = useRouter();
    const { addCandidate } = useCandidates();
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
    
    const startAnalysis = async (file: File) => {
        setIsAnalyzing(true);
        setAnalysisError(null);
        updateFormData({ resumeUploaded: true });
        
        const data = new FormData();
        data.append("file", file);
        data.append("type", "RESUME");
        
        try {
            const response = await fetch("/api/extract", { method: "POST", body: data });
            if (response.ok) {
                const { data: extractedData, text, url: resumeUrl } = await response.json();
                const isManual = mode === "manual";
                
                const resumeFields: any = {
                    resumeText: text || "",
                    resumeUrl: resumeUrl || "",
                    structuredResume: extractedData || {},
                    resumeUploaded: true
                };
                
                setFormData(prev => {
                    const newData = { ...prev, ...resumeFields };
                    
                    // Only auto-fill individual fields if NOT in manual mode
                    if (!isManual) {
                        const autoFillFields: any = {
                            fullName: extractedData?.full_name || "",
                            email: extractedData?.email || "",
                            phone: extractedData?.phone || "",
                            location: extractedData?.location?.city || (typeof extractedData?.location === 'string' ? extractedData?.location : ""),
                            experience: (() => {
                                const yrs = extractedData?.experience?.total_years;
                                return (typeof yrs === 'number' && yrs >= 0) ? String(yrs) : "";
                            })(),
                            experienceYears: extractedData?.experience?.total_years || null,
                            currentCompany: extractedData?.current_company || "",
                        };

                        Object.keys(autoFillFields).forEach(key => {
                            if (prev[key as keyof typeof prev] === "" && autoFillFields[key]) {
                                (newData as any)[key] = autoFillFields[key];
                            }
                        });

                        // ── Auto-fill Education ─────────────────────────
                        if (extractedData?.education && Array.isArray(extractedData.education)) {
                            newData.education = extractedData.education.map((edu: any) => ({
                                id: Math.random().toString(36).substr(2, 9),
                                institution: edu.institution || "",
                                degree: edu.degree || "",
                                fieldOfStudy: edu.field || "",
                                startDate: edu.start_year ? String(edu.start_year) : "", // Simplified year to string
                                endDate: edu.year || edu.end_year ? String(edu.year || edu.end_year) : "",
                                grade: ""
                            }));
                        }

                        // ── Auto-fill Professional Experience ───────────
                        if (extractedData?.work_history && Array.isArray(extractedData.work_history)) {
                            newData.experience_list = extractedData.work_history.map((job: any) => ({
                                id: Math.random().toString(36).substr(2, 9),
                                title: job.role || "",
                                company: job.company || "",
                                location: "", // Not explicitly in simple work_history
                                startDate: job.start_year ? String(job.start_year) : "",
                                endDate: job.end_year ? String(job.end_year) : "",
                                current: !!job.is_current,
                                description: (job.what_they_built || []).join("\n") + 
                                             (job.technologies_used?.length ? "\n\nStack: " + job.technologies_used.join(", ") : "")
                            }));
                        }
                    }
                    
                    return newData;
                });
            } else {
                setAnalysisError("Failed to analyze resume. Please try again.");
            }
        } catch (err) {
            setAnalysisError("Network error. Please check your connection.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const startPassportUpload = async (file: File) => {
        updateFormData({ isUploadingPassport: true });
        
        const data = new FormData();
        data.append("file", file);
        data.append("type", "PASSPORT");
        
        try {
            const response = await fetch("/api/extract", { method: "POST", body: data });
            if (response.ok) {
                const { url: passportUrl } = await response.json();
                updateFormData({ 
                    passportUrl: passportUrl || "",
                    passportUploaded: true,
                    isUploadingPassport: false
                });
            } else {
                showAlert("Failed to upload passport photo.", "error");
                updateFormData({ isUploadingPassport: false });
            }
        } catch (err) {
            showAlert("Upload failed. Please try again.", "error");
            updateFormData({ isUploadingPassport: false });
        }
    };
    
    const clearResume = () => {
        updateFormData({
            resumeUploaded: false,
            resumeText: "",
            resumeUrl: "",
            structuredResume: {}
        });
    };
    
    const updateFormData = (data: any) => {
        setFormData(prev => ({ ...prev, ...data }));
    };
    
    const handleSubmit = async () => {
        // Form Validation for Required Fields (*)
        const requiredFields: any = {
            fullName: "Full Name",
            email: "Email Address",
            phone: "Phone Number",
            location: "Current Location",
            experience: "Total Experience",
            noticePeriod: "Notice Period",
            expectedCtc: "Expected CTC"
        };
        
        for (const [key, label] of Object.entries(requiredFields)) {
            const value = (formData as any)[key];
            if (!value || String(value).trim() === "") {
                showAlert(`Please provide your ${label}.`, "error");
                return;
            }
        }

        // Custom Questions Validation
        if (job?.registrationFields) {
            try {
                const fields = typeof job.registrationFields === 'string' ? JSON.parse(job.registrationFields) : job.registrationFields;
                if (Array.isArray(fields)) {
                    for (const field of fields) {
                        if (field.required) {
                            const answer = formData.customAnswers[field.label];
                            if (!answer || (typeof answer === 'string' && answer.trim() === "")) {
                                showAlert(`Please answer the required question: ${field.label}`, "error");
                                return;
                            }
                        }
                    }
                }
            } catch (e) { console.error("Validation check failed for custom fields", e); }
        }

        if (!formData.resumeUploaded) {
            showAlert("Please upload your Resume/CV to continue.", "error");
            return;
        }

        if (!formData.agreedToTerms) {
            showAlert("Please agree to the terms and policies to submit your application.", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            // Using context method to maintain consistency and handle status codes properly
            await addCandidate({
                name: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                location: formData.location,
                portfolio: formData.portfolio,
                role: jobTitle,
                driveId: String(job?.id || id),
                experience: formData.experience,
                currentCompany: formData.currentCompany,
                currentCtc: formData.ctc,
                expectedCtc: formData.expectedCtc,
                noticePeriod: formData.noticePeriod,
                coverLetter: formData.coverLetter,
                resumeUrl: formData.resumeUrl || (formData.resumeUploaded ? "resume_mock.pdf" : undefined),
                resumeText: formData.resumeText,
                passportUrl: formData.passportUrl,
                structuredResume: formData.structuredResume,
                education: formData.education,
                experience_list: formData.experience_list,
                certifications: formData.certifications,
                ...formData.customAnswers
            });

            localStorage.setItem(`applied_${id}`, "true");
            setIsSuccess(true);
        } catch (error: any) {
            console.error("Failed to submit application:", error);
            if (error.status === 409 || error.message?.toLowerCase().includes("already applied")) {
                setAlreadyApplied(true);
                localStorage.setItem(`applied_${id}`, "true");
            } else {
                showAlert(error.message || "Failed to submit application. Please try again.", "error");
            }
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (isSuccess || alreadyApplied) {
        return (
            <div className="min-h-screen bg-[#FDFCFB] flex flex-col items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-2xl border border-orange-100 p-8 text-center space-y-6 shadow-lg">
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-[#F97316]">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-gray-900">
                            {isSuccess ? "Thank You!" : "Already Applied!"}
                        </h2>
                        <div className="h-1 w-10 bg-[#F97316] rounded-full mx-auto" />
                    </div>
                    <p className="text-gray-500 font-medium">
                        {isSuccess 
                            ? "Your application has been received. Our team will review it soon!"
                            : `You have already submitted an application for ${jobTitle}.`
                        }
                    </p>
                    <div className="pt-4 space-y-3">
                        <Link href={`/careers/jobs/${id}`}>
                            <Button className="w-full h-12 rounded-xl bg-gray-900 hover:bg-black text-white font-bold shadow-lg transition-all">
                                VIEW STATUS
                            </Button>
                        </Link>
                        <Link href="/careers">
                            <Button variant="outline" className="w-full h-12 rounded-xl border-2 border-orange-100 text-[#F97316] hover:bg-orange-50 font-bold transition-all">
                                EXPLORE MORE JOBS
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-[#FDFCFB] selection:bg-orange-100 selection:text-orange-900">
            <PortalHeader />

            <AnimatePresence>
                {pageAlert && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4"
                    >
                        <div className={`p-4 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center justify-between gap-4 ${
                            pageAlert.type === 'error' 
                                ? 'bg-red-50/90 border-red-100 text-red-800' 
                                : 'bg-emerald-50/90 border-emerald-100 text-emerald-800'
                        }`}>
                            <div className="flex items-center gap-3">
                                <div className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                    pageAlert.type === 'error' ? 'bg-red-100' : 'bg-emerald-100'
                                }`}>
                                    {pageAlert.type === 'error' ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                                </div>
                                <p className="text-sm font-black uppercase tracking-tight leading-tight">{pageAlert.message}</p>
                            </div>
                            <button onClick={() => setPageAlert(null)} className="p-1 hover:bg-black/5 rounded-full transition-colors">
                                <X className="h-4 w-4 opacity-50" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="container mx-auto px-4 py-12 max-w-4xl animate-in-fade">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 px-2">
                    <div className="space-y-14">
                        <Link href={`/careers/jobs/${id}`}>
                            <Button variant="outline" className="h-10 px-4 rounded-xl border-gray-100 bg-white/50 text-gray-500 text-xs font-black uppercase tracking-widest hover:bg-white hover:text-[#F97316] hover:border-orange-100 transition-all shadow-sm group">
                                <ArrowLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" /> 
                                Back to Job
                            </Button>
                        </Link>
                        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                            Apply for <span className="text-[#F97316]">{jobTitle}</span>
                        </h1>
                    </div>
                </div>
                
                {/* Single Page Form Card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_10px_40px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="p-8 space-y-8">
                        <Suspense fallback={<div className="h-40 flex items-center justify-center font-medium text-gray-400">Loading...</div>}>
                            <div className="space-y-16">
                                {/* Personal Info Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                        <h3 className="text-lg font-inter font-bold text-black">Personal Information</h3>
                                    </div>
                                    <PersonalInfo 
                                        formData={formData} 
                                        updateFormData={updateFormData} 
                                        isAnalyzing={isAnalyzing}
                                        analysisError={analysisError}
                                        startAnalysis={startAnalysis}
                                        clearResume={clearResume}
                                        mode={mode || "manual"}
                                        isPassportRequired={!!(job as any)?.isPassportRequired}
                                        isUploadingPassport={formData.isUploadingPassport}
                                        startPassportUpload={startPassportUpload}
                                        passportUploaded={formData.passportUploaded}
                                        passportUrl={formData.passportUrl}
                                    />
                                </div>
                                
                                <div className="border-t border-gray-100" />
                                
                                {/* Professional Details Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                        <h3 className="text-lg font-inter font-bold text-gray-900">Professional Details</h3>
                                    </div>
                                    <ProfessionalDetails 
                                        formData={formData} 
                                        updateFormData={updateFormData} 
                                        isAnalyzing={isAnalyzing}
                                    />
                                </div>
                                {job?.registrationFields && (() => {
                                    try {
                                        const fields = typeof job.registrationFields === 'string' ? JSON.parse(job.registrationFields) : job.registrationFields;
                                        if (!Array.isArray(fields) || fields.length === 0) return null;

                                        return (
                                            <>
                                                <div className="border-t border-gray-100" />
                                                <div className="space-y-6">
                                                    <div className="flex items-center gap-3">
                                                        <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                                        <h3 className="text-lg font-inter font-bold text-gray-900">Additional Questions</h3>
                                                    </div>
                                                    <div className="grid gap-8">
                                                        {fields.map((field: any) => (
                                                            <div key={field.id} className="space-y-3">
                                                                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">
                                                                    {field.label} {field.required ? "*" : ""}
                                                                </label>
                                                                {field.type === "Short" && (
                                                                    <input
                                                                        type="text"
                                                                        className="w-full h-12 rounded-2xl border-gray-100 bg-gray-50/30 px-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300"
                                                                        value={formData.customAnswers[field.label] || ""}
                                                                        onChange={(e) => updateFormData({ 
                                                                            customAnswers: { ...formData.customAnswers, [field.label]: e.target.value } 
                                                                        })}
                                                                    />
                                                                )}
                                                                {field.type === "Long" && (
                                                                    <textarea
                                                                        className="w-full h-32 rounded-2xl border-gray-100 bg-gray-50/30 p-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300"
                                                                        value={formData.customAnswers[field.label] || ""}
                                                                        onChange={(e) => updateFormData({ 
                                                                            customAnswers: { ...formData.customAnswers, [field.label]: e.target.value } 
                                                                        })}
                                                                    />
                                                                )}
                                                                {field.type === "Url" && (
                                                                    <input
                                                                        type="url"
                                                                        placeholder="https://..."
                                                                        className="w-full h-12 rounded-2xl border-gray-100 bg-gray-50/30 px-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300"
                                                                        value={formData.customAnswers[field.label] || ""}
                                                                        onChange={(e) => updateFormData({ 
                                                                            customAnswers: { ...formData.customAnswers, [field.label]: e.target.value } 
                                                                        })}
                                                                    />
                                                                )}
                                                                {field.type === "File" && (
                                                                    <input
                                                                        type="file"
                                                                        className="w-full h-12 flex items-center justify-center p-2 rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50/30 text-sm font-medium focus:border-[#F97316]"
                                                                        onChange={(e) => {
                                                                            const file = e.target.files?.[0];
                                                                            if (file) {
                                                                                updateFormData({ 
                                                                                    customAnswers: { ...formData.customAnswers, [field.label]: file.name } 
                                                                                });
                                                                            }
                                                                        }}
                                                                    />
                                                                )}
                                                                {field.type === "Yes/No" && (
                                                                    <div className="flex gap-4">
                                                                        {["Yes", "No"].map(opt => (
                                                                            <button
                                                                                key={opt}
                                                                                type="button"
                                                                                onClick={() => updateFormData({ 
                                                                                    customAnswers: { ...formData.customAnswers, [field.label]: opt } 
                                                                                })}
                                                                                className={`h-11 px-8 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                                                                                    formData.customAnswers[field.label] === opt
                                                                                        ? "bg-[#F97316] text-white shadow-lg"
                                                                                        : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                                                                                }`}
                                                                            >
                                                                                {opt}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    } catch (e) { return null; }
                                })()}

                                <div className="border-t border-gray-100" />

                                {/* Experience Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                        <h3 className="text-lg font-inter font-bold text-gray-900">Professional Experience</h3>
                                    </div>
                                    <ExperienceInfo 
                                        value={formData.experience_list} 
                                        onChange={(val) => updateFormData({ experience_list: val })} 
                                    />
                                </div>

                                <div className="border-t border-gray-100" />

                                {/* Education Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                        <h3 className="text-lg font-inter font-bold text-gray-900">Academic History</h3>
                                    </div>
                                    <EducationInfo 
                                        value={formData.education} 
                                        onChange={(val) => updateFormData({ education: val })} 
                                    />
                                </div>

                                <div className="border-t border-gray-100" />

                                {/* Certifications Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                        <h3 className="text-lg font-inter font-bold text-gray-900">Certifications & Awards (Optional)</h3>
                                    </div>
                                    <CertificationInfo 
                                        value={formData.certifications} 
                                        onChange={(val) => updateFormData({ certifications: val })} 
                                    />
                                </div>

                                <div className="border-t border-gray-100" />
                                
                                {/* Resume & Review Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <span className="h-6 w-1 bg-[#F97316] rounded-full" />
                                        <h3 className="text-lg font-inter font-bold text-gray-900">Final Submission</h3>
                                    </div>
                                    <ResumeReview 
                                        formData={formData} 
                                        updateFormData={updateFormData} 
                                        isAnalyzing={isAnalyzing}
                                        analysisError={analysisError}
                                        startAnalysis={startAnalysis}
                                        clearResume={clearResume}
                                        agreedToTerms={formData.agreedToTerms}
                                        onAgreedToTermsChange={(checked: any) => updateFormData({ agreedToTerms: !!checked })}
                                    />
                                </div>
                            </div>
                        </Suspense>
                    </div>
                    
                    {/* Submit Button */}
                    <div className="bg-gray-50 border-t border-gray-100 px-8 py-10 flex flex-col items-center">
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !formData.agreedToTerms}
                            className="w-full max-w-md h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold text-base shadow-lg transition-all hover:translate-y-[-2px] disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                        >
                            {isSubmitting ? (
                                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Submitting...</>
                            ) : (
                                "Submit Application"
                            )}
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    );
}
