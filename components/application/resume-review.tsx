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
            <div className="flex items-start space-x-3 p-6 rounded-2xl bg-gray-50/50 border border-gray-100 transition-all hover:bg-orange-50/20 group/terms">
                <Checkbox 
                    id="terms" 
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => onAgreedToTermsChange(!!checked)}
                    className="mt-1 border-gray-300 data-[state=checked]:bg-[#F97316] data-[state=checked]:border-[#F97316] shadow-sm transition-all" 
                />
                <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="terms" className="text-sm font-bold text-gray-900 cursor-pointer flex items-center gap-1.5">
                        I agree to the terms and data processing policy <span className="text-[#F97316]">*</span>
                    </Label>
                    <p className="text-xs text-gray-500 font-medium">
                        By submitting, you allow us to process your profile using Sreeva AI for this recruitment drive.
                    </p>
                </div>
            </div>
        </div>
    );
}
