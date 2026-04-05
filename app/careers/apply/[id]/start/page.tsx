"use client"

import { useState, use, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FileText, UserCircle2, Loader2, CheckCircle2, ChevronRight, X, ArrowLeft } from "lucide-react"
import { PortalHeader } from "@/components/careers/portal-header"
import Link from "next/link"
import { cn } from "@/lib/utils"

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

        try {
            const response = await fetch("/api/extract", {
                method: "POST",
                body: data,
            })

            if (!response.ok) throw new Error("Failed to extract details")
            
            const { data: extracted, text, url: resumeUrl } = await response.json()

            const prefillData = {
                fullName: extracted?.full_name || "",
                email: extracted?.email || "",
                phone: extracted?.phone || "",
                location: extracted?.location ? [extracted.location.city, extracted.location.state].filter(Boolean).join(", ") : "",
                resumeUrl: resumeUrl,
                resumeText: text,
                structuredResume: extracted,
                experience: extracted?.experience?.total_years !== undefined ? String(extracted.experience.total_years) : "",
                currentCompany: extracted?.current_company || ""
            }

            localStorage.setItem(`prefill_${drive.id}`, JSON.stringify(prefillData))
            router.push(`/careers/apply/${drive.id}?mode=resume`)
            
        } catch (err: any) {
            console.error("Apply error:", err)
            setError(err.message || "An error occurred. Please try the manual option.")
        } finally {
            setIsAnalyzing(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#FDFCFB] flex flex-col">
            <PortalHeader />
            
            <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
                <div className="w-full max-w-5xl space-y-12">
                    {/* Header Section */}
                    <div className="flex flex-col items-center text-center space-y-6">
                        <Link 
                            href={`/careers/drive/${id}`}
                            className="group flex items-center gap-2 text-gray-400 hover:text-gray-950 transition-all font-bold uppercase tracking-widest text-[10px]"
                        >
                            <ArrowLeft className="h-3 w-3 group-hover:-translate-x-1 transition-transform" /> Back to Job Details
                        </Link>
                        <div className="space-y-4">
                            <h1 className="text-5xl md:text-6xl font-black text-gray-950 tracking-tighter leading-none italic uppercase">
                                How would you like to start?
                            </h1>
                            <p className="text-gray-400 font-bold uppercase tracking-[0.3em] text-[11px] md:text-xs">
                                Configure your talent profile for the <span className="text-[#F97316]">{drive.title}</span> role.
                            </p>
                        </div>
                    </div>

                    {/* Cards Grid */}
                    <div className="grid md:grid-cols-2 gap-10 items-stretch">
                        {/* Fill Manually Card */}
                        <div 
                            onClick={() => router.push(`/careers/apply/${drive.id}?mode=manual`)}
                            className="group relative flex flex-col items-center justify-center p-16 rounded-[4rem] border-2 border-orange-100/50 bg-white shadow-[0_30px_80px_rgba(249,115,22,0.05)] hover:shadow-[0_40px_100px_rgba(249,115,22,0.12)] hover:scale-[1.02] transition-all duration-500 cursor-pointer overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-48 h-48 bg-orange-50/30 rounded-full -mr-24 -mt-24 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            <div className="h-28 w-28 rounded-[2.5rem] bg-orange-50/50 flex items-center justify-center mb-10 group-hover:bg-[#F97316] group-hover:rotate-12 transition-all duration-500 transform">
                                <UserCircle2 className="h-14 w-14 text-[#F97316] group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-3xl font-black text-gray-950 mb-4 italic uppercase">Fill Manually</h3>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em] text-center leading-relaxed max-w-[280px]">
                                Enter all details from scratch using our step-by-step form.
                            </p>
                            <div className="mt-12 h-16 w-16 rounded-full border border-orange-100 flex items-center justify-center group-hover:bg-[#F97316] group-hover:border-transparent transition-all duration-500">
                                <ChevronRight className="h-6 w-6 text-orange-200 group-hover:text-white" />
                            </div>
                        </div>

                        {/* Scan from Resume Card */}
                        <div className="group relative flex flex-col items-center justify-center p-16 rounded-[4rem] border border-gray-100 bg-white shadow-[0_30px_80px_rgba(0,0,0,0.03)] hover:shadow-[0_50px_120px_rgba(124,58,237,0.12)] hover:scale-[1.02] transition-all duration-500 cursor-pointer overflow-hidden">
                            {/* Recommended Badge */}
                            <div className="absolute top-10 -right-16 bg-[#7C3AED] text-white text-xs font-black py-3 px-20 rotate-45 shadow-xl shadow-purple-200/50 uppercase tracking-[0.3em] z-10">
                                Recommended
                            </div>
                            
                            {isAnalyzing ? (
                                <div className="flex flex-col items-center justify-center py-10 animate-in-fade text-center space-y-6">
                                    <div className="relative">
                                        <div className="h-32 w-32 rounded-[3rem] bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                            <Loader2 className="h-16 w-16 text-[#7C3AED] animate-spin" />
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-white border-2 border-indigo-50 flex items-center justify-center">
                                            <div className="h-4 w-4 bg-[#7C3AED] rounded-full animate-pulse" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-indigo-600 font-black uppercase tracking-[0.4em] animate-pulse">Neural Sync In Progress...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="h-28 w-28 rounded-[2.5rem] bg-indigo-50 flex items-center justify-center mb-10 group-hover:bg-[#7C3AED] group-hover:-rotate-12 transition-all duration-500 transform">
                                        <FileText className="h-14 w-14 text-[#7C3AED] group-hover:text-white transition-colors" />
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-950 mb-4 italic uppercase">Scan from Resume</h3>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em] text-center leading-relaxed max-w-[280px]">
                                        Upload your Resume and let our AI auto-fill the entire form for you.
                                    </p>
                                    <div className="mt-12 h-16 w-16 rounded-full border border-gray-100 flex items-center justify-center group-hover:bg-[#7C3AED] group-hover:border-transparent transition-all duration-500">
                                        <ChevronRight className="h-6 w-6 text-gray-200 group-hover:text-white" />
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
                        <div className="max-w-md mx-auto p-5 rounded-3xl bg-red-50 border border-red-100 flex items-center justify-center gap-3 animate-in-shake shadow-sm">
                            <X className="h-5 w-5 text-red-500" />
                            <p className="text-[11px] text-red-600 font-black uppercase tracking-widest leading-none mt-0.5">{error}</p>
                        </div>
                    )}
                </div>
            </main>

            <footer className="p-8 text-center border-t border-gray-100 bg-white">
                <p className="text-gray-300 font-black uppercase tracking-[0.4em] text-[10px]">
                    Powered by Lumoscale Intelligence Engine © 2026
                </p>
            </footer>
        </div>
    )
}
