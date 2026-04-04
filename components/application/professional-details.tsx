import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ProfessionalDetails({ 
    formData, 
    updateFormData,
    isAnalyzing 
}: { 
    formData: any, 
    updateFormData: (data: any) => void,
    isAnalyzing?: boolean
}) {
    const inputClass = "h-12 rounded-2xl border-gray-100 bg-gray-50/30 px-4 text-sm font-medium transition-all focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-orange-500/10 placeholder:text-gray-300";

    return (
        <div className="space-y-10 animate-in-fade">
            <div className="space-y-3">
                <Label htmlFor="experience" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Total Experience (Years) *</Label>
                <Input
                    id="experience"
                    type="number"
                    placeholder="e.g. 5"
                    value={formData.experience}
                    onChange={(e) => updateFormData({ experience: e.target.value })}
                    className={cn(inputClass, isAnalyzing && !formData.experience && "bg-orange-50/50")}
                />
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                    <Label htmlFor="current-company" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Current Company</Label>
                    <Input
                        id="current-company"
                        placeholder="Company Name"
                        value={formData.currentCompany}
                        onChange={(e) => updateFormData({ currentCompany: e.target.value })}
                        className={cn(inputClass, isAnalyzing && !formData.currentCompany && "bg-orange-50/50")}
                    />
                </div>
                <div className="space-y-3">
                    <Label htmlFor="ctc" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Current CTC</Label>
                    <Input
                        id="ctc"
                        placeholder="e.g. $120,000"
                        value={formData.ctc}
                        onChange={(e) => updateFormData({ ctc: e.target.value })}
                        className={inputClass}
                    />
                </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                    <Label htmlFor="notice-period" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Notice Period *</Label>
                    <Select
                        value={formData.noticePeriod}
                        onValueChange={(value) => updateFormData({ noticePeriod: value })}
                    >
                        <SelectTrigger className="h-12 rounded-2xl border-gray-100 bg-gray-50/30 text-sm font-medium focus:ring-4 focus:ring-orange-500/10 transition-all">
                            <SelectValue placeholder="Select Notice Period" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-orange-100">
                            <SelectItem value="immediate" className="rounded-xl focus:bg-orange-50">Immediate</SelectItem>
                            <SelectItem value="15" className="rounded-xl focus:bg-orange-50">15 Days</SelectItem>
                            <SelectItem value="30" className="rounded-xl focus:bg-orange-50">30 Days</SelectItem>
                            <SelectItem value="60" className="rounded-xl focus:bg-orange-50">60 Days</SelectItem>
                            <SelectItem value="90" className="rounded-xl focus:bg-orange-50">90 Days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-3">
                    <Label htmlFor="expected-ctc" className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Expected CTC *</Label>
                    <Input
                        id="expected-ctc"
                        placeholder="e.g. $140,000"
                        value={formData.expectedCtc}
                        onChange={(e) => updateFormData({ expectedCtc: e.target.value })}
                        className={inputClass}
                    />
                </div>
            </div>
        </div>
    );
}
