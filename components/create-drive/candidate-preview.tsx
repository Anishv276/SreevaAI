import { useState } from "react";
import { X, Smartphone, Monitor, ChevronLeft, ChevronRight, CheckCircle2, MapPin, Clock, Briefcase, Share2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CandidatePreviewProps {
    formData: any;
    regFieldCount: number;
    onClose: () => void;
}

export function CandidatePreview({ formData, regFieldCount, onClose }: CandidatePreviewProps) {
    const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
    const [step, setStep] = useState<"jd" | "apply">("jd");

    // Mock data for registration fields
    const responsibilities = formData.responsibilities ? formData.responsibilities.split("\n").filter((l: string) => l.trim().length > 0) : ["Build scalable AI solutions", "Collaborate with cross-functional teams"];
    const skills = formData.skills ? formData.skills.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0) : ["React", "Node.js", "TypeScript"];

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-gray-900/40 backdrop-blur-md animate-in-fade">
            {/* Header / Control Bar */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                        <Monitor className="w-5 h-5 text-[#F97316]" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-gray-900 leading-tight">Candidate Preview</h2>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest leading-none mt-0.5">
                            Real-time Simulation
                        </p>
                    </div>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setViewMode("desktop")}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === "desktop" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        <Monitor className="w-3.5 h-3.5" /> Desktop
                    </button>
                    <button 
                        onClick={() => setViewMode("mobile")}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === "mobile" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        <Smartphone className="w-3.5 h-3.5" /> Mobile
                    </button>
                </div>

                <button 
                    onClick={onClose}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
                >
                    <X className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-8 flex justify-center bg-gray-50/50">
                <div className={`transition-all duration-500 bg-white shadow-[0_40px_100px_rgba(0,0,0,0.12)] border border-gray-100 overflow-hidden flex flex-col ${
                    viewMode === "desktop" ? "w-full max-w-5xl rounded-[2.5rem]" : "w-[375px] h-[750px] rounded-[3.5rem] border-[8px] border-gray-900"
                }`}>
                    {/* Simulator Content */}
                    <div className="flex-1 overflow-auto bg-[#FDFCFB]">
                        {step === "jd" ? (
                            /* JD PREVIEW */
                            <div className="animate-in-up duration-500">
                                <div className={`p-8 lg:p-14 ${viewMode === 'mobile' ? 'p-6' : ''}`}>
                                    <div className="flex flex-col items-start gap-6">
                                        <div className="px-4 py-1.5 rounded-full bg-orange-100/50 text-[#F97316] text-[10px] font-black uppercase tracking-[0.2em] border border-orange-200/50">
                                            {formData.department || "Engineering"}
                                        </div>
                                        <h1 className={`${viewMode === 'desktop' ? 'text-4xl lg:text-5xl' : 'text-2xl'} font-black text-gray-900 tracking-tight leading-[1.1]`}>
                                            {formData.title || "Job Title Preview"}
                                        </h1>
                                        <div className="flex flex-wrap gap-6 pt-2">
                                            <div className="flex items-center gap-2.5">
                                                <MapPin className="h-4 w-4 text-[#F97316]" />
                                                <span className="text-[13px] font-bold text-gray-600">{formData.location || "Remote"}</span>
                                            </div>
                                            <div className="flex items-center gap-2.5">
                                                <Clock className="h-4 w-4 text-[#F97316]" />
                                                <span className="text-[13px] font-bold text-gray-600">{formData.employmentType || "Full-time"}</span>
                                            </div>
                                        </div>

                                        <div className="w-full h-px bg-gray-100 my-4" />

                                        <div className="space-y-6 w-full">
                                            <h2 className="text-xl font-black text-gray-900 tracking-tight">About the Role</h2>
                                            <p className="text-gray-500 leading-relaxed text-[15px] font-medium whitespace-pre-wrap">
                                                {formData.description || "The job description you entered will appear here for candidates..."}
                                            </p>

                                            <div className="grid gap-6">
                                                <div className="p-6 rounded-[2rem] bg-gray-50 border border-gray-100">
                                                    <h3 className="text-sm font-black text-[#F97316] mb-4 uppercase tracking-wider">What you'll do</h3>
                                                    <ul className="space-y-3">
                                                        {responsibilities.map((r: string, i: number) => (
                                                            <li key={i} className="flex items-start gap-3 text-xs text-gray-600 font-bold">
                                                                <div className="mt-1 h-1 w-1 rounded-full bg-[#F97316] shrink-0" />
                                                                {r}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div className="p-6 rounded-[2rem] bg-gray-900 text-white shadow-xl">
                                                    <h3 className="text-sm font-black text-orange-400 mb-4 uppercase tracking-wider">Skills</h3>
                                                    <div className="flex flex-wrap gap-2">
                                                        {skills.map((s: string, i: number) => (
                                                            <span key={i} className="px-3 py-1 rounded-full bg-white/10 text-[11px] font-black border border-white/5 uppercase tracking-wider text-orange-200">
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-8">
                                                <Button 
                                                    onClick={() => setStep("apply")}
                                                    className="w-full h-14 bg-[#F97316] hover:bg-orange-600 text-white font-black text-lg rounded-2xl shadow-[0_10px_30px_rgba(249,115,22,0.3)]"
                                                >
                                                    APPLY NOW
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* APPLY FORM PREVIEW */
                            <div className="animate-in-fade duration-500 min-h-full flex flex-col items-center justify-center p-8 bg-[#FDFCFB]">
                                <div className="w-full max-w-md space-y-8 text-center">
                                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-[#F97316] shadow-sm">
                                        <Briefcase className="h-8 w-8" />
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Apply for this Role</h2>
                                        <p className="text-gray-400 text-xs font-black uppercase tracking-[0.2em]">{formData.title || "Job Title"}</p>
                                    </div>

                                    <div className="space-y-4 text-left">
                                        <div className="p-4 rounded-2xl border border-gray-100 bg-white space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                                <div className="h-11 rounded-xl bg-gray-50 border border-gray-100" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Work Email</label>
                                                <div className="h-11 rounded-xl bg-gray-50 border border-gray-100" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Number</label>
                                                <div className="h-11 rounded-xl bg-gray-50 border border-gray-100" />
                                            </div>
                                        </div>
                                        
                                        <p className="text-center text-[10px] text-gray-400 font-bold italic">
                                            Candidate will also be asked for {regFieldCount - 3} custom fields you configured in Step 5.
                                        </p>
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <Button 
                                            variant="outline"
                                            onClick={() => setStep("jd")}
                                            className="h-12 w-12 rounded-2xl border-gray-100 text-gray-400 p-0"
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </Button>
                                        <Button 
                                            disabled
                                            className="flex-1 h-12 bg-gray-300 text-white font-black text-sm rounded-2xl cursor-not-allowed"
                                        >
                                            CONTINUE TO RESUME
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Bottom Indicator for Mobile Mode */}
                    {viewMode === "mobile" && (
                        <div className="h-6 flex items-center justify-center bg-white border-t border-gray-50">
                            <div className="w-24 h-1 rounded-full bg-gray-200" />
                        </div>
                    )}
                </div>
            </div>

            {/* Success Toast Preview */}
            <div className="fixed bottom-10 right-10 pointer-events-none">
                <div className="bg-gray-900 border border-white/10 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 animate-in-up duration-1000">
                    <div className="h-8 w-8 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-green-400">Preview Mode</p>
                        <p className="text-[11px] text-gray-400 font-bold max-w-[200px]">Candidates will see exactly what is displayed in this simulator.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
