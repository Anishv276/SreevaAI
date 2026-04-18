"use client"

import { useState, use, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FileText, UserCircle2, Loader2, CheckCircle2, ChevronRight, X, ArrowLeft, Sparkles } from "lucide-react"
import { PortalHeader } from "@/components/careers/portal-header"
import Link from "next/link"
import { cn } from "@/lib/utils"

function formatExtractedLocation(location: any): string {
    if (!location) return "";

    if (typeof location === "string") {
        return location
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .join(", ");
    }

    const parts = [location.city, location.state, location.country]
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean);

    return parts.join(", ");
}

function mapEducationList(education: any[] = []) {
    return education.map((edu: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        institution: edu?.institution || "",
        degree: edu?.degree || "",
        fieldOfStudy: edu?.field || "",
        startDate: edu?.start_year ? String(edu.start_year) : "",
        endDate: edu?.year || edu?.end_year ? String(edu.year || edu.end_year) : "",
        grade: "",
    }));
}

function mapWorkHistoryList(workHistory: any[] = []) {
    return workHistory.map((job: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        title: job?.role || "",
        company: job?.company || "",
        location: formatExtractedLocation(job?.location),
        startDate: job?.start_year ? String(job.start_year) : "",
        endDate: job?.end_year ? String(job.end_year) : "",
        current: !!job?.is_current,
        description:
            (Array.isArray(job?.what_they_built) ? job.what_they_built.join("\n") : "") +
            (Array.isArray(job?.technologies_used) && job.technologies_used.length
                ? `\n\nStack: ${job.technologies_used.join(", ")}`
                : ""),
    }));
}

function deriveProfessionalExperienceYears(extractedData: any): number | null {
    const workHistory = Array.isArray(extractedData?.work_history) ? extractedData.work_history : [];
    if (!workHistory.length) return null;

    const internshipPattern = /\b(intern|internship|trainee|apprentice|fellow)\b/i;
    let totalMonths = 0;

    for (const job of workHistory) {
        const role = String(job?.role || "");
        if (internshipPattern.test(role)) continue;

        const months = Number(job?.duration_months);
        if (!Number.isNaN(months) && months > 0) {
            totalMonths += months;
        }
    }

    if (totalMonths <= 0) return null;
    return Math.round((totalMonths / 12) * 10) / 10;
}

export default function ApplyStartPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [drive, setDrive] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/drives/${id}`)
            .then(res => {
                if (!res.ok) throw new Error("Not found")
                return res.json()
            })
            .then(data => setDrive(data))
            .catch(err => {
                console.error(err)
                setError("Job description not found. Re-establishing link...")
            })
            .finally(() => setLoading(false))
    }, [id])

    if (loading) {
        return (
            <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center">
                <div className="flex flex-col items-center gap-6">
                    <div className="h-20 w-20 rounded-3xl bg-orange-50 flex items-center justify-center animate-pulse">
                        <Loader2 className="h-10 w-10 text-[#F97316] animate-spin" />
                    </div>
                    <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Initializing Talent Engine...</p>
                </div>
            </div>
        )
    }

    const handleResumeUpload = async (file: File) => {
        setIsAnalyzing(true)
        setError(null)

        const data = new FormData()
        data.append("file", file)
        data.append("type", "RESUME")
        if (drive?.orgId) data.append("orgId", drive.orgId)

        try {
            const response = await fetch("/api/extract", {
                method: "POST",
                body: data,
            })

            if (!response.ok) throw new Error("Failed to extract details")
            
            const { data: extracted, text, url: resumeUrl } = await response.json()
            const professionalYears = deriveProfessionalExperienceYears(extracted)

            const prefillData = {
                fullName: extracted?.full_name || "",
                email: extracted?.email || "",
                phone: extracted?.phone || "",
                location: formatExtractedLocation(extracted?.location),
                resumeUrl: resumeUrl,
                resumeText: text,
                structuredResume: extracted,
                experienceYears: professionalYears,
                currentCompany: extracted?.current_company || "",
                education: Array.isArray(extracted?.education) ? mapEducationList(extracted.education) : [],
                experience_list: Array.isArray(extracted?.work_history) ? mapWorkHistoryList(extracted.work_history) : [],
            }

            localStorage.setItem(`prefill_${drive.id}`, JSON.stringify(prefillData))
            // Navigate immediately — keep isAnalyzing=true so the spinner stays
            // visible through the page transition (no flicker back to card state)
            router.push(`/careers/apply/${drive.id}?mode=resume`)
            
        } catch (err: any) {
            // Log full error internally; never expose internal details to users.
            console.error("Apply error:", err)
            setError("Something went wrong analysing your resume. Please try again or fill in manually.")
            // Only reset on error so the user can try again
            setIsAnalyzing(false)
        }
    }


    return (
        <div className="min-h-screen bg-[#FDFCFB] flex flex-col">
            <PortalHeader />
            
            <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
                <div className="w-full max-w-4xl space-y-12 animate-in-fade">
                    {/* Header Section */}
                    <div className="text-center space-y-4">
                        <Link 
                            href={`/careers/jobs/${id}`}
                            className="inline-flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors mb-4"
                        >
                            <ArrowLeft className="h-4 w-4" /> Back to Job Details
                        </Link>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">How would you like to start?</h1>
                        <p className="text-gray-500 text-lg font-medium">Choose a method to configure your application for <span className="text-[#F97316]">{drive.title}</span>.</p>
                    </div>

                    {/* Cards Grid */}
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Manual Option */}
                        <div 
                            onClick={() => {
                                localStorage.removeItem(`prefill_${drive.id}`);
                                router.push(`/careers/apply/${drive.id}?mode=manual`);
                            }}
                            className="group relative flex flex-col items-center gap-6 p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2 cursor-pointer"
                        >
                            <div className="h-20 w-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:rotate-6">
                                <UserCircle2 className="h-10 w-10" />
                            </div>
                            <div className="space-y-2 text-center">
                                <h3 className="text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">Fill Manually</h3>
                                <p className="text-gray-500 text-sm leading-relaxed">Enter all details from scratch using our step-by-step form.</p>
                            </div>
                            <div className="absolute bottom-6 right-6 h-10 w-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-transparent transition-all duration-500">
                                <ChevronRight className="h-5 w-5" />
                            </div>
                        </div>

                        {/* AI Scan Option */}
                        <div className="group relative flex flex-col items-center gap-6 p-10 rounded-[2.5rem] bg-white border-2 border-gray-100 hover:border-[#F97316] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(249,115,22,0.12)] hover:-translate-y-2 cursor-pointer">
                            {isAnalyzing ? (
                                <div className="flex flex-col items-center justify-center py-4 animate-in-fade text-center space-y-6">
                                    <div className="relative">
                                        <div className="h-20 w-20 rounded-3xl bg-orange-50 flex items-center justify-center">
                                            <Loader2 className="h-10 w-10 text-[#F97316] animate-spin" />
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-black font-inter font-bold tracking-tight animate-pulse">Analyzing Resume...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="h-20 w-20 rounded-3xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all duration-500 group-hover:-rotate-6">
                                        <Sparkles className="h-10 w-10" />
                                    </div>
                                    <div className="space-y-2 text-center">
                                        <h3 className="text-2xl font-bold text-gray-900 group-hover:text-[#F97316] transition-colors">Scan from Resume</h3>
                                        <p className="text-gray-500 text-sm leading-relaxed">Upload your Resume and let our AI auto-fill the entire form for you.</p>
                                    </div>
                                    <div className="absolute bottom-6 right-6 h-10 w-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-transparent transition-all duration-500">
                                        <ChevronRight className="h-5 w-5" />
                                    </div>
                                    <div className="absolute -top-3 -right-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                                        Recommended
                                    </div>
                                    <input 
                                        type="file" 
                                        accept=".pdf,.docx,.doc,.txt"
                                        onChange={(e) => e.target.files?.[0] && handleResumeUpload(e.target.files[0])}
                                        className="absolute inset-0 opacity-0 cursor-pointer z-20"
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="max-w-md mx-auto p-4 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-3 animate-in-shake">
                            <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                            <p className="text-xs text-red-600 font-bold uppercase tracking-wider">{error}</p>
                        </div>
                    )}
                </div>
            </main>

            <footer className="p-8 text-center border-t border-gray-100 bg-white">
                <p className="text-gray-900 font-inter font-bold text-[11px] tracking-wide opacity-80">
                    Powered by Hirer.AI Intelligence Engine © 2026
                </p>
            </footer>
        </div>
    )
}

