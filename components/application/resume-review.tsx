import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ResumeUpload } from "./resume-upload";

interface ResumeReviewProps {
    formData: any;
    updateFormData: (data: any) => void;
    isAnalyzing: boolean;
    analysisError: string | null;
    startAnalysis: (file: File) => void;
    clearResume: () => void;
    agreedToTerms: boolean;
    onAgreedToTermsChange: (checked: boolean) => void;
}

export function ResumeReview({ 
    formData, 
    updateFormData, 
    isAnalyzing, 
    analysisError, 
    startAnalysis, 
    clearResume,
    agreedToTerms,
    onAgreedToTermsChange
}: ResumeReviewProps) {
    return (
        <div className="space-y-12 animate-in-fade">
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <span className="h-2 w-2 rounded-full bg-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">Final Step: Profile Verification</p>
                </div>
                
                <div className="bg-orange-50/30 rounded-[2.5rem] p-8 border border-orange-100/50">
                    <Label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-4 block">Your Resume / CV *</Label>
                    <ResumeUpload 
                        formData={formData}
                        isAnalyzing={isAnalyzing}
                        analysisError={analysisError}
                        startAnalysis={startAnalysis}
                        clearFile={clearResume}
                    />
                </div>
            </div>

            <div className="space-y-4">
                <Label htmlFor="coverletter" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Cover Letter / Message (Optional)</Label>
                <textarea
                    id="coverletter"
                    value={formData.coverLetter || ""}
                    onChange={(e) => updateFormData({ coverLetter: e.target.value })}
                    className="min-h-[150px] w-full rounded-[2rem] border-gray-100 bg-gray-50/30 px-6 py-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300 outline-none"
                    placeholder="Tell us why you're a perfect fit for this role..."
                />
            </div>

            <div className="flex items-start space-x-3 p-6 rounded-2xl bg-gray-50/50 border border-gray-100 transition-all hover:bg-orange-50/20 group/terms">
                <Checkbox 
                    id="terms" 
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => onAgreedToTermsChange(!!checked)}
                    className="mt-1 border-gray-300 data-[state=checked]:bg-[#F97316] data-[state=checked]:border-[#F97316] shadow-sm transition-all" 
                />
                <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="terms" className="text-sm font-bold text-gray-900 cursor-pointer">
                        I agree to the terms and data processing policy
                    </Label>
                    <p className="text-xs text-gray-500 font-medium">
                        By submitting, you allow us to process your profile using Lumoscale AI for this recruitment drive.
                    </p>
                </div>
            </div>
        </div>
    );
}
