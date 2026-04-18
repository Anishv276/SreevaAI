import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResumeUpload } from "./resume-upload";
import { PhoneInput } from "./phone-input";
import { cn } from "@/lib/utils";
import { Upload, X, Loader2 } from "lucide-react";

interface PersonalInfoProps {
    formData: any;
    updateFormData: (data: any) => void;
    isAnalyzing: boolean;
    analysisError: string | null;
    startAnalysis: (file: File) => void;
    clearResume: () => void;
    mode: string;
    isPassportRequired: boolean;
    isUploadingPassport: boolean;
    startPassportUpload: (file: File) => void;
    passportUploaded: boolean;
    passportUrl: string;
}

export function PersonalInfo({
    formData,
    updateFormData,
    isAnalyzing,
    analysisError,
    startAnalysis,
    clearResume,
    mode,
    isPassportRequired,
    isUploadingPassport,
    startPassportUpload,
    passportUploaded,
    passportUrl
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

            {isPassportRequired && (
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="h-2 w-2 rounded-full bg-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                        <p className="text-[11px] font-black text-[#F97316] uppercase tracking-[0.2em]">
                            Passport Photo
                        </p>
                    </div>
                    <div className="rounded-[2rem] p-6 border bg-orange-50/10 border-orange-100/50">
                        <p className="text-sm font-bold text-gray-900 mb-4">
                            Please upload a clear passport-sized photo for identity verification.
                        </p>

                        <div className="space-y-4">
                            {!passportUploaded ? (
                                <div
                                    onClick={() => !isUploadingPassport && (document.getElementById('passport-input') as HTMLInputElement).click()}
                                    className="relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer border-gray-200 bg-gray-50/50 hover:bg-white hover:border-[#F97316]"
                                >
                                    <input
                                        id="passport-input"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) startPassportUpload(file);
                                        }}
                                        disabled={isUploadingPassport}
                                    />
                                    <div className="flex flex-col items-center gap-2">
                                        <div className={`p-4 rounded-2xl bg-white shadow-sm border border-gray-100 ${isUploadingPassport ? 'animate-pulse' : ''}`}>
                                            {isUploadingPassport ? <Loader2 className="h-6 w-6 text-[#F97316] animate-spin" /> : <Upload className="h-6 w-6 text-[#F97316]" />}
                                        </div>
                                        <p className="font-bold text-gray-900">{isUploadingPassport ? "Uploading..." : "Upload Photo"}</p>
                                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">JPG, PNG (Max 2MB)</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-4 rounded-2xl border border-green-200 bg-green-50/50 px-5 py-4 animate-in-fade">
                                    <div className="h-12 w-12 rounded-xl border-2 border-white overflow-hidden shadow-sm flex-shrink-0">
                                        <img src={passportUrl} className="h-full w-full object-cover" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[14px] font-bold text-gray-800">Photo Uploaded</p>
                                        <p className="text-[12px] text-gray-500 font-medium">Identity verification ready</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateFormData({ passportUploaded: false, passportUrl: "" })}
                                        className="h-10 w-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-white transition-all shadow-sm border border-transparent"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />
                <span className="text-[10px] font-inter font-black text-black uppercase tracking-[0.3em]">Personal Details</span>
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
                    <Label htmlFor="phone" className="text-[11px] font-inter font-black text-gray-500 uppercase tracking-widest ml-1">Phone Number *</Label>
                    <PhoneInput
                        value={formData.phone}
                        onChange={(val) => updateFormData({ phone: val })}
                        className={cn(isAnalyzing && !formData.phone && "bg-orange-50/50")}
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

