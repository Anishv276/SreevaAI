"use client";

import { useState, use, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CandidateHeader } from "@/components/careers/header";
import { CandidateFooter } from "@/components/careers/footer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CheckCircle2, UploadCloud, FileText, X, Loader2 } from "lucide-react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useEffect } from "react";

function ApplicationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const jobId = searchParams.get("jobId");
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (!isAuthenticated) {
            router.push(`/signin?returnUrl=${encodeURIComponent(`/careers/apply?jobId=${jobId}`)}`);
        }
    }, [isAuthenticated, router, jobId]);

    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        location: "",
        qualification: "",
        organization: "",
        experience: "",
        currentCtc: "",
        expectedCtc: "",
        noticePeriod: "",
        resume: null as File | null,
        linkedin: "",
        portfolio: ""
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFormData(prev => ({ ...prev, resume: e.target.files![0] }));
        }
    };

    const nextStep = () => {
        if (step === 1) {
            if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || !formData.location) {
                alert("Please fill in all required personal information fields.");
                return;
            }
        }
        if (step === 2) {
            if (!formData.qualification || !formData.experience || !formData.noticePeriod || !formData.expectedCtc) {
                alert("Please fill in all professional details before continuing.");
                return;
            }
        }
        setStep(prev => prev + 1);
    };
    const prevStep = () => setStep(prev => prev - 1);

    const handleSubmit = async () => {
        if (!formData.resume || !jobId) return;

        setIsSubmitting(true);
        try {
            // 1. Get Presigned URL
            const presignedResponse = await fetch("/api/upload/presigned", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileName: formData.resume.name,
                    fileType: formData.resume.type,
                    driveId: jobId,
                    type: "RESUME"
                })
            });

            if (!presignedResponse.ok) throw new Error("Failed to get upload URL");
            const { uploadUrl, publicUrl } = await presignedResponse.json();

            // 2. Upload to Cloudflare R2 directly
            const uploadResponse = await fetch(uploadUrl, {
                method: "PUT",
                body: formData.resume,
                headers: { "Content-Type": formData.resume.type }
            });

            if (!uploadResponse.ok) throw new Error("Failed to upload resume to R2");

            // 3. Submit Application to our Backend
            const applicationResponse = await fetch("/api/candidates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fullName: `${formData.firstName} ${formData.lastName}`,
                    email: formData.email,
                    phone: formData.phone,
                    location: formData.location,
                    qualification: formData.qualification,
                    organization: formData.organization,
                    currentCtc: formData.currentCtc,
                    expectedCtc: formData.expectedCtc,
                    noticePeriod: formData.noticePeriod,
                    resumeUrl: publicUrl, // The permanent R2 link
                    driveId: jobId
                })
            });

            if (!applicationResponse.ok) throw new Error("Failed to submit application");

            // Success
            router.push("/candidate-dashboard");
        } catch (error) {
            console.error("Submission failed:", error);
            alert("Submission failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <CandidateHeader />

            <main className="flex-1 container py-12 px-4 max-w-3xl">
                <div className="text-center mb-10">
                    <h1 className="text-2xl font-bold text-gray-900">Apply for Senior Backend Engineer</h1>
                    {/* Progress Bar */}
                    <div className="flex items-center justify-center mt-6 gap-2">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="flex items-center">
                                <div className={`
                            flex items-center justify-center h-8 w-8 rounded-full border-2 
                            ${step === s ? "border-blue-600 bg-blue-600 text-white" :
                                        step > s ? "border-blue-600 bg-blue-600 text-white" :
                                            "border-gray-300 text-gray-400 bg-white"}
                            font-bold text-sm transition-colors
                        `}>
                                    {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
                                </div>
                                {s < 3 && (
                                    <div className={`w-16 h-0.5 mx-2 ${step > s ? "bg-blue-600" : "bg-gray-200"}`} />
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="mt-4 text-sm font-medium text-gray-500">
                        Step {step} of 3: {step === 1 ? "Personal Information" : step === 2 ? "Professional Details" : "Resume & Review"}
                    </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in-fade">

                    {/* STEP 1: PERSONAL INFO */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="firstName">First Name *</Label>
                                    <Input id="firstName" name="firstName" placeholder="John" value={formData.firstName} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lastName">Last Name *</Label>
                                    <Input id="lastName" name="lastName" placeholder="Doe" value={formData.lastName} onChange={handleInputChange} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address *</Label>
                                <Input id="email" name="email" type="email" placeholder="john.doe@example.com" value={formData.email} onChange={handleInputChange} />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number *</Label>
                                <Input id="phone" name="phone" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={handleInputChange} />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="location">Current Location *</Label>
                                <Input id="location" name="location" placeholder="San Francisco, CA" value={formData.location} onChange={handleInputChange} />
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700">
                                    Continue
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: PROFESSIONAL DETAILS */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label>Highest Qualification *</Label>
                                <Select onValueChange={(val) => handleSelectChange("qualification", val)} value={formData.qualification}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select degree" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="btech">B.Tech / B.E.</SelectItem>
                                        <SelectItem value="mtech">M.Tech / M.E.</SelectItem>
                                        <SelectItem value="bca">BCA / MCA</SelectItem>
                                        <SelectItem value="bsc">B.Sc / M.Sc</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="organization">Current Organization</Label>
                                <Input id="organization" name="organization" placeholder="Current Company Ltd." value={formData.organization} onChange={handleInputChange} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="experience">Total Experience (Years) *</Label>
                                    <Input id="experience" name="experience" type="number" step="any" placeholder="5" value={formData.experience} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Notice Period *</Label>
                                    <Select onValueChange={(val) => handleSelectChange("noticePeriod", val)} value={formData.noticePeriod}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select notice period" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="immediate">Immediate</SelectItem>
                                            <SelectItem value="15">15 Days</SelectItem>
                                            <SelectItem value="30">30 Days</SelectItem>
                                            <SelectItem value="60">60 Days</SelectItem>
                                            <SelectItem value="90">90 Days</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="currentCtc">Current CTC</Label>
                                    <Input id="currentCtc" name="currentCtc" placeholder="e.g. 15 LPA INR" value={formData.currentCtc} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="expectedCtc">Expected CTC *</Label>
                                    <Input id="expectedCtc" name="expectedCtc" placeholder="e.g. 20 LPA INR" value={formData.expectedCtc} onChange={handleInputChange} />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-between">
                                <Button variant="outline" onClick={prevStep}>Back</Button>
                                <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700">Continue</Button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: RESUME & REVIEW */}
                    {step === 3 && (
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <Label>Upload Resume *</Label>
                                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer relative group">
                                    <input
                                        type="file"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={handleFileChange}
                                        accept=".pdf,.doc,.docx"
                                    />
                                    {formData.resume ? (
                                        <div className="flex flex-col items-center">
                                            <FileText className="h-10 w-10 text-blue-600 mb-2" />
                                            <span className="font-medium text-gray-900">{formData.resume.name}</span>
                                            <span className="text-xs text-gray-500">{(formData.resume.size / 1024 / 1024).toFixed(2)} MB</span>
                                            <Button variant="link" className="text-red-500 h-auto p-0 mt-2" onClick={(e) => {
                                                e.preventDefault();
                                                setFormData(prev => ({ ...prev, resume: null }));
                                            }}>Remove</Button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3">
                                                <UploadCloud className="h-5 w-5" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-900">Click to upload or drag and drop</span>
                                            <span className="text-xs text-gray-500 mt-1">PDF or DOCX (max 5MB)</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="linkedin">LinkedIn Profile (Optional)</Label>
                                    <Input id="linkedin" name="linkedin" placeholder="https://linkedin.com/in/..." value={formData.linkedin} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="portfolio">Portfolio / GitHub (Optional)</Label>
                                    <Input id="portfolio" name="portfolio" placeholder="https://github.com/..." value={formData.portfolio} onChange={handleInputChange} />
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
                                <h3 className="font-semibold text-gray-900">Review Application</h3>
                                <div className="grid grid-cols-2 gap-2 text-gray-600">
                                    <span>Name:</span> <span className="text-gray-900 font-medium">{formData.firstName} {formData.lastName}</span>
                                    <span>Email:</span> <span className="text-gray-900 font-medium">{formData.email}</span>
                                    <span>Exp:</span> <span className="text-gray-900 font-medium">{formData.experience} Years</span>
                                    <span>Notice:</span> <span className="text-gray-900 font-medium">{formData.noticePeriod}</span>
                                </div>
                            </div>

                            <div className="pt-4 flex justify-between">
                                <Button variant="outline" onClick={prevStep} disabled={isSubmitting}>Back</Button>
                                <Button 
                                    onClick={handleSubmit} 
                                    className="bg-green-600 hover:bg-green-700 text-white px-8"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : "Submit Application"}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <CandidateFooter />
        </div>
    );
}

export default function ApplicationPage() {
    return (
        <Suspense fallback={<div>Loading application form...</div>}>
            <ApplicationContent />
        </Suspense>
    );
}

