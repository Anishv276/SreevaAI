"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogTrigger
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { FileText, UserCircle2, Loader2, CheckCircle2, ChevronRight, X } from "lucide-react"
import { useCandidates } from "@/context/candidates-context"
import { cn } from "@/lib/utils"

interface ApplyModalProps {
    drive: any
}

export function ApplyModal({ drive }: ApplyModalProps) {
    const [open, setOpen] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { addCandidate } = useCandidates()
    const router = useRouter()

    const handleResumeUpload = async (file: File) => {
        setIsAnalyzing(true)
        setError(null)

        const data = new FormData()
        data.append("file", file)
        data.append("type", "RESUME")

        try {
            // 1. Extract Data
            const response = await fetch("/api/extract", {
                method: "POST",
                body: data,
            })

            if (!response.ok) throw new Error("Failed to extract details")
            
            const { data: extracted, text, url: resumeUrl } = await response.json()

            // 2. Prepare Pre-fill Data
            const prefillData = {
                fullName: extracted?.full_name || "",
                email: extracted?.email || "",
                phone: extracted?.phone || "",
                location: extracted?.location 
                    ? [extracted.location.city, extracted.location.state].filter(Boolean).join(", ")
                    : "",
                resumeUrl: resumeUrl,
                resumeText: text,
                structuredResume: extracted,
                experience: extracted?.experience?.total_years !== undefined ? String(extracted.experience.total_years) : "",
                currentCompany: extracted?.current_company || ""
            }

            // 3. Store in localStorage for the next page
            localStorage.setItem(`prefill_${drive.id}`, JSON.stringify(prefillData))
            
            // 4. Redirect to application page
            router.push(`/careers/apply/${drive.id}?mode=resume`)
            setOpen(false)
            
        } catch (err: any) {
            console.error("Apply error:", err)
            setError(err.message || "An error occurred. Please try the manual option.")
        } finally {
            setIsAnalyzing(false)
        }
    }

    const reset = () => {
        setOpen(false)
        setTimeout(() => {
            setError(null)
            setIsAnalyzing(false)
        }, 300)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="w-full h-14 bg-[#F97316] hover:bg-orange-600 text-white font-black text-lg rounded-2xl shadow-[0_10px_30px_rgba(249,115,22,0.3)] hover:translate-y-[-2px] hover:shadow-[0_15px_40px_rgba(249,115,22,0.4)] transition-all duration-300 uppercase tracking-widest italic">
                    Apply Now
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl p-0 bg-white rounded-[2.5rem] border-none shadow-3xl overflow-hidden">
                <div className="bg-gray-50/50 p-8 border-b border-gray-100/50">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-10 w-1 bg-[#F97316] rounded-full" />
                            <DialogTitle className="text-2xl font-black text-gray-950 uppercase tracking-tighter italic">Talent Onboarding</DialogTitle>
                        </div>
                        <DialogDescription className="text-gray-400 font-bold uppercase tracking-widest text-[10px] leading-none">
                            Select your preferred ingestion protocol for <span className="text-[#F97316]">{drive.title}</span>
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="p-10 space-y-8">
                    <div className="text-center space-y-2">
                        <h2 className="text-4xl font-black text-gray-950 tracking-tight leading-none italic uppercase">How would you like to start?</h2>
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Choose a method to configure your application lifecycle.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 items-stretch pt-4">
                        {/* Fill Manually Card */}
                        <div 
                            onClick={() => router.push(`/careers/apply/${drive.id}?mode=manual`)}
                            className="group relative flex flex-col items-center justify-center p-12 rounded-[2.5rem] border-2 border-orange-100/50 bg-white shadow-[0_15px_40px_rgba(249,115,22,0.03)] hover:shadow-[0_20px_50px_rgba(249,115,22,0.08)] hover:scale-[1.02] transition-all cursor-pointer overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50/30 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="h-20 w-20 rounded-3xl bg-orange-50/50 flex items-center justify-center mb-6 group-hover:bg-[#F97316] group-hover:rotate-12 transition-all duration-300">
                                <UserCircle2 className="h-10 w-10 text-[#F97316] group-hover:text-white" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-950 mb-3 italic">Fill Manually</h3>
                            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest text-center leading-relaxed">
                                Enter all details from scratch using our step-by-step form.
                            </p>
                            <div className="mt-10 h-12 w-12 rounded-full border border-orange-100 flex items-center justify-center group-hover:bg-[#F97316] group-hover:border-transparent transition-all">
                                <ChevronRight className="h-5 w-5 text-orange-200 group-hover:text-white" />
                            </div>
                        </div>

                        {/* Scan from Resume Card */}
                        <div className="group relative flex flex-col items-center justify-center p-12 rounded-[2.5rem] border border-gray-100 bg-white shadow-[0_15px_40px_rgba(0,0,0,0.02)] hover:shadow-[0_25px_60px_rgba(124,58,237,0.08)] hover:scale-[1.02] transition-all cursor-pointer overflow-hidden">
                            {/* Recommended Badge */}
                            <div className="absolute top-8 -right-12 bg-[#7C3AED] text-white text-[9px] font-black py-2 px-14 rotate-45 shadow-lg shadow-purple-200/50 uppercase tracking-[0.2em] animate-pulse">
                                Recommended
                            </div>
                            
                            {isAnalyzing ? (
                                <div className="flex flex-col items-center justify-center py-6 animate-in-fade">
                                    <div className="h-24 w-24 rounded-[2rem] bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-6">
                                        <Loader2 className="h-10 w-10 text-[#7C3AED] animate-spin" />
                                    </div>
                                    <p className="text-[10px] text-indigo-600 font-black uppercase tracking-[0.3em] animate-pulse">Extracting Intelligence...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="h-20 w-20 rounded-3xl bg-indigo-50 flex items-center justify-center mb-6 group-hover:bg-[#7C3AED] group-hover:-rotate-12 transition-all duration-300">
                                        <FileText className="h-10 w-10 text-[#7C3AED] group-hover:text-white" />
                                    </div>
                                    <h3 className="text-2xl font-black text-gray-950 mb-3 italic">Scan from Resume</h3>
                                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest text-center leading-relaxed">
                                        Upload your Resume and let our AI auto-fill the entire form for you.
                                    </p>
                                    <div className="mt-10 h-12 w-12 rounded-full border border-gray-100 flex items-center justify-center group-hover:bg-[#7C3AED] group-hover:border-transparent transition-all">
                                        <ChevronRight className="h-5 w-5 text-gray-200 group-hover:text-white" />
                                    </div>
                                    <input 
                                        type="file" 
                                        accept=".pdf,.docx,.doc,.txt"
                                        onChange={(e) => e.target.files?.[0] && handleResumeUpload(e.target.files[0])}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center gap-2 animate-in-shake">
                            <X className="h-4 w-4 text-red-500" />
                            <p className="text-[10px] text-red-600 font-black uppercase tracking-widest leading-none mt-0.5">{error}</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
