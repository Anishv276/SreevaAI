import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResumeUpload } from "./resume-upload";
import { cn } from "@/lib/utils";

interface PersonalInfoProps {
    formData: any;
    updateFormData: (data: any) => void;
    isAnalyzing: boolean;
    analysisError: string | null;
    startAnalysis: (file: File) => void;
    clearResume: () => void;
    mode: string;
}

export function PersonalInfo({ 
    formData, 
    updateFormData, 
    isAnalyzing, 
    analysisError, 
    startAnalysis, 
    clearResume,
    mode 
}: PersonalInfoProps) {
    const inputClass = "h-12 rounded-2xl border-gray-100 bg-gray-50/30 px-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300";

    return (
        <div className="space-y-12 animate-in-fade">
            {/* Quick Resume Upload Section */}
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <span className="h-2 w-2 rounded-full bg-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                    <p className="text-[11px] font-black text-[#F97316] uppercase tracking-[0.2em]">
                        {mode === "manual" ? "Resume Attachment" : "Smart Extraction"}
                    </p>
                </div>
                <div className={cn(
                    "rounded-[2rem] p-6 border",
                    mode === "manual" ? "bg-gray-50/50 border-gray-100" : "bg-orange-50/30 border-orange-100/50"
                )}>
                    <p className="text-sm font-bold text-gray-900 mb-4">
                        {mode === "manual" 
                            ? "Please attach your resume to complete your application." 
                            : "Upload your resume to let Hirer.AI auto-fill your details."
                        }
                    </p>
                    <ResumeUpload 
                        formData={formData}
                        isAnalyzing={isAnalyzing}
                        analysisError={analysisError}
                        startAnalysis={startAnalysis}
                        clearFile={clearResume}
                    />
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">Personal Details</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                    <Label htmlFor="fullname" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Full Name *</Label>
                    <Input
                        id="fullname"
                        placeholder="John Doe"
                        value={formData.fullName}
                        onChange={(e) => updateFormData({ fullName: e.target.value })}
                        className={cn(inputClass, isAnalyzing && !formData.fullName && "bg-orange-50/50")}
                    />
                </div>
                <div className="space-y-3">
                    <Label htmlFor="email" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Email Address *</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={(e) => updateFormData({ email: e.target.value })}
                        className={cn(inputClass, isAnalyzing && !formData.email && "bg-orange-50/50")}
                    />
                </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                    <Label htmlFor="phone" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Phone Number *</Label>
                    <Input
                        id="phone"
                        type="tel"
                        placeholder="+1 (555) 000-0000"
                        value={formData.phone}
                        onChange={(e) => updateFormData({ phone: e.target.value })}
                        className={cn(inputClass, isAnalyzing && !formData.phone && "bg-orange-50/50")}
                    />
                </div>
                <div className="space-y-3">
                    <Label htmlFor="location" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Current Location *</Label>
                    <Input
                        id="location"
                        placeholder="City, Country"
                        value={formData.location}
                        onChange={(e) => updateFormData({ location: e.target.value })}
                        className={inputClass}
                    />
                </div>
            </div>

            <div className="space-y-3">
                <Label htmlFor="portfolio" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Portfolio / LinkedIn / Website</Label>
                <Input
                    id="portfolio"
                    placeholder="https://..."
                    value={formData.portfolio}
                    onChange={(e) => updateFormData({ portfolio: e.target.value })}
                    className={inputClass}
                />
            </div>
        </div>
    );
}
