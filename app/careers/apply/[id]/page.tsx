"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Steps } from "@/components/create-drive/steps"; // Reusing Steps component
import { Button } from "@/components/ui/button";
import { PersonalInfo } from "@/components/application/personal-info";
import { ProfessionalDetails } from "@/components/application/professional-details";
import { ResumeReview } from "@/components/application/resume-review";
import { PortalHeader } from "@/components/careers/portal-header";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";

const STEPS = ["Personal Info", "Professional Details", "Resume & Review"];

export default function ApplicationPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { addCandidate } = useCandidates();
    const { jobs } = useJobs();
    const [currentStep, setCurrentStep] = useState(0);
    const [alreadyApplied, setAlreadyApplied] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [formData, setFormData] = useState({
        // Personal Info
        fullName: "",
        email: "",
        phone: "",
        location: "",
        portfolio: "",
        // Professional Details
        experience: "",
        currentCompany: "",
        ctc: "",
        noticePeriod: "",
        expectedCtc: "",
        coverLetter: "",
        resumeUploaded: false,
        resumeText: "",
        resumeUrl: "",
        structuredResume: {},
        agreedToTerms: false
    });

    // AI Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    // Check for previous application on mount
    useEffect(() => {
        if (id && typeof window !== "undefined") {
            const hasApplied = localStorage.getItem(`applied_${id}`);
            if (hasApplied === "true") {
                setAlreadyApplied(true);
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
            const response = await fetch("/api/extract", {
                method: "POST",
                body: data,
            });

            if (response.ok) {
                const { data: extractedData, text, url: resumeUrl } = await response.json();

                // Update form data with extracted info, but only if current fields are empty
                const updates: any = {
                    resumeUploaded: true,
                    resumeText: text,
                    resumeUrl: resumeUrl,
                    structuredResume: extractedData
                };

                if (extractedData) {
                    if (extractedData.full_name && !formData.fullName) updates.fullName = extractedData.full_name;
                    if (extractedData.email && !formData.email) updates.email = extractedData.email;
                    if (extractedData.phone && !formData.phone) updates.phone = extractedData.phone;
                    if (extractedData.experience) {
                        const years = extractedData.experience.total_years || extractedData.experience.min_years;
                        if (years !== undefined && years !== null && !formData.experience) {
                            updates.experience = String(years);
                        }
                    }
                    if (extractedData.current_company && !formData.currentCompany) updates.currentCompany = extractedData.current_company;
                }

                updateFormData(updates);
            } else {
                setAnalysisError("Failed to extract Resume. Please fill details manually.");
            }
        } catch (error) {
            console.error("Error uploading Resume:", error);
            setAnalysisError("An error occurred during resume analysis.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const clearResume = () => {
        updateFormData({ resumeUploaded: false, resumeText: "" });
    };

    const currentJob = jobs.find(job => job.id.toString() === id);
    const jobTitle = currentJob ? currentJob.title : "Unknown Role";

    const updateFormData = (data: Partial<typeof formData>) => {
        setFormData(prev => ({ ...prev, ...data }));
    };

    const nextStep = () => {
        if (currentStep === STEPS.length - 1) {
            handleSubmit();
        } else {
            setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
        }
    };

    const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const response = await addCandidate({
                name: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                location: formData.location,
                portfolio: formData.portfolio,
                role: jobTitle,
                driveId: id,
                experience: formData.experience,
                currentCompany: formData.currentCompany,
                currentCtc: formData.ctc,
                expectedCtc: formData.expectedCtc,
                noticePeriod: formData.noticePeriod,
                coverLetter: formData.coverLetter,
                resumeUrl: formData.resumeUrl || (formData.resumeUploaded ? "resume_mock.pdf" : undefined),
                resumeText: formData.resumeText,
                structuredResume: formData.structuredResume
            });

            // Set localStorage on success
            localStorage.setItem(`applied_${id}`, "true");
            setIsSuccess(true);
            // router.push(`/careers/drive/${id}`);
        } catch (error: any) {
            console.error("Failed to submit application:", error);
            if (error.status === 409 || error.message?.toLowerCase().includes("already applied")) {
                setAlreadyApplied(true);
                localStorage.setItem(`applied_${id}`, "true");
            } else {
                alert(error.message || "Failed to submit application. Please try again.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess || alreadyApplied) {
        return (
            <div className="min-h-screen bg-[#FDFCFB] flex flex-col items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-[3rem] border border-orange-100 p-12 text-center space-y-8 shadow-[0_20px_60px_-15px_rgba(249,115,22,0.1)] transition-all duration-500 hover:scale-[1.02]">
                    <div className="inline-flex h-24 w-24 items-center justify-center rounded-[2rem] bg-orange-50 text-[#F97316] mb-2 shadow-[0_10px_30px_rgba(249,115,22,0.15)] animate-pulse">
                        <CheckCircle2 className="h-12 w-12" />
                    </div>
                    <div className="space-y-3">
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">
                            {isSuccess ? "Thank You!" : "Application Logged!"}
                        </h2>
                        <div className="h-1.5 w-12 bg-[#F97316] rounded-full mx-auto" />
                    </div>
                    <p className="text-gray-500 font-medium leading-relaxed text-lg">
                        {isSuccess 
                            ? "Your application has been received. Our recruitment team will review it and get in touch soon!"
                            : `You have already submitted an application for the ${jobTitle} position.`
                        }
                    </p>
                    
                    <div className="pt-6 space-y-4">
                        <Link href={`/careers/drive/${id}`}>
                            <Button className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-black text-lg shadow-xl transition-all hover:translate-y-[-2px]">
                                VIEW STATUS
                            </Button>
                        </Link>
                        <Link href="/careers">
                            <Button variant="outline" className="w-full h-14 rounded-2xl border-2 border-orange-100 text-[#F97316] hover:bg-orange-50 font-black text-lg transition-all hover:translate-y-[-2px]">
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

            <main className="container mx-auto px-4 py-12 max-w-4xl animate-in-fade">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 px-2">
                    <div className="space-y-3">
                        <Link href={`/careers/drive/${id}`} className="group inline-flex items-center text-[10px] font-black tracking-[0.2em] text-gray-400 hover:text-[#F97316] transition-all uppercase">
                            <ArrowLeft className="h-3 w-3 mr-2 transition-transform group-hover:-translate-x-1" /> 
                            Back to Job Details
                        </Link>
                        <h1 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">
                            Apply for <span className="text-[#F97316]">{jobTitle}</span>
                        </h1>
                    </div>
                </div>

                <div className="grid gap-10">
                    {/* Stepper Card */}
                    <div className="bg-white rounded-[2rem] border border-orange-100/50 shadow-[0_10px_40px_rgba(249,115,22,0.05)] p-8 lg:p-10 transition-all">
                        <Steps steps={STEPS} currentStep={currentStep} />
                    </div>

                    {/* Form Card */}
                    <div className="relative group">
                        {/* Decorative Background Glow */}
                        <div className="absolute -inset-1 bg-gradient-to-r from-orange-100 to-orange-50 rounded-[3rem] blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" />
                        
                        <div className="relative bg-white rounded-[2.5rem] border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.04)] overflow-hidden">
                            <div className="p-8 lg:p-12">
                                <Suspense fallback={<div className="h-96 flex items-center justify-center font-bold text-gray-400 animate-pulse uppercase tracking-widest">Loading step...</div>}>
                                    {currentStep === 0 && (
                                        <PersonalInfo 
                                            formData={formData} 
                                            updateFormData={updateFormData} 
                                            isAnalyzing={isAnalyzing}
                                            analysisError={analysisError}
                                            startAnalysis={startAnalysis}
                                            clearResume={clearResume}
                                        />
                                    )}
                                    {currentStep === 1 && (
                                        <ProfessionalDetails 
                                            formData={formData} 
                                            updateFormData={updateFormData} 
                                            isAnalyzing={isAnalyzing}
                                        />
                                    )}
                                    {currentStep === 2 && (
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
                                    )}
                                </Suspense>
                            </div>

                            {/* Footer Actions */}
                            <div className="bg-gray-50/50 border-t border-gray-100 px-8 lg:px-12 py-8 flex items-center justify-between gap-4">
                                <Button
                                    variant="ghost"
                                    onClick={prevStep}
                                    disabled={currentStep === 0 || isSubmitting}
                                    className="h-12 px-6 rounded-xl text-gray-500 font-bold hover:bg-white hover:text-[#F97316] disabled:opacity-30 transition-all"
                                >
                                    <ChevronLeft className="h-5 w-5 mr-2" /> Back
                                </Button>

                                <div className="flex items-center gap-3">
                                    {currentStep < STEPS.length - 1 ? (
                                        <Button
                                            onClick={nextStep}
                                            className="h-12 px-8 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-black shadow-lg shadow-orange-200 transition-all hover:translate-y-[-2px]"
                                        >
                                            Next Step <ChevronRight className="h-5 w-5 ml-2" />
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={handleSubmit}
                                            disabled={isSubmitting || !formData.agreedToTerms}
                                            className="h-12 px-10 rounded-xl bg-gray-900 hover:bg-black text-white font-black shadow-xl transition-all hover:translate-y-[-2px] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSubmitting ? (
                                                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Submitting...</>
                                            ) : (
                                                "Submit Application"
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
