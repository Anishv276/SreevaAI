"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, MessageSquare, Sparkles, ArrowRight, LifeBuoy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type UnderstandingLevel = "Always understood me" | "Mostly understood me" | "Sometimes missed my point" | "Rarely understood me";

const overallOptions = [
    { value: 1, emoji: "😞", label: "Terrible" },
    { value: 2, emoji: "😐", label: "Okay" },
    { value: 3, emoji: "🙂", label: "Good" },
    { value: 4, emoji: "😄", label: "Great" },
    { value: 5, emoji: "🤩", label: "Loved it" },
];

const questionChips = [
    "Relevant to my resume",
    "Repetitive",
    "Hard to understand",
    "Too fast / didn't let me finish",
    "Felt robotic",
    "Well structured",
];

const understandingOptions: UnderstandingLevel[] = [
    "Always understood me",
    "Mostly understood me",
    "Sometimes missed my point",
    "Rarely understood me",
];

export type CandidateRatingPayload = {
    overallFeeling: string | null;
    aiQuestions: string[];
    understanding: UnderstandingLevel | null;
    notes: string;
};

export function CandidateRatingForm({
    title = "Final step",
    subtitle = "Your feedback is required. Please take a moment to rate your experience.",
    mode = "live",
    onSubmit,
    onSubmitted,
}: {
    title?: string;
    subtitle?: string;
    mode?: "live" | "preview";
    onSubmit?: (payload: CandidateRatingPayload) => Promise<void> | void;
    onSubmitted?: () => void;
}) {
    const [step, setStep] = useState(1);
    const totalSteps = 4;

    const [overallFeeling, setOverallFeeling] = useState<number | null>(null);
    const [selectedQuestionTags, setSelectedQuestionTags] = useState<string[]>([]);
    const [understanding, setUnderstanding] = useState<UnderstandingLevel | null>(null);
    const [notes, setNotes] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [supportDialogOpen, setSupportDialogOpen] = useState(false);
    const [supportSubmitting, setSupportSubmitting] = useState(false);
    const [supportSuccess, setSupportSuccess] = useState(false);
    const [supportError, setSupportError] = useState<string | null>(null);
    const [supportForm, setSupportForm] = useState({ name: "", email: "", issueAbout: "" });

    const submitSupportRequest = async () => {
        const normalizedName = supportForm.name.trim();
        const normalizedEmail = supportForm.email.trim().toLowerCase();
        const normalizedIssueAbout = supportForm.issueAbout.trim();

        if (!normalizedName || !normalizedEmail || !normalizedIssueAbout) {
            setSupportError("Please fill name, email, and issue description.");
            return;
        }

        setSupportSubmitting(true);
        setSupportError(null);

        try {
            await new Promise(r => setTimeout(r, 1000));
            setSupportSuccess(true);
            setSupportForm({ name: "", email: "", issueAbout: "" });
            setTimeout(() => {
                setSupportDialogOpen(false);
                setSupportSuccess(false);
            }, 3000);
        } catch (error) {
            setSupportError("Unable to submit support request right now.");
        } finally {
            setSupportSubmitting(false);
        }
    };
    const [submitted, setSubmitted] = useState(false);

    const canSubmit = useMemo(() => {
        return mode === "preview" || overallFeeling !== null;
    }, [mode, overallFeeling]);

    const toggleQuestionTag = (tag: string) => {
        setSelectedQuestionTags((prev) =>
            prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
        );
    };

    const submit = async () => {
        if (!canSubmit || isSubmitting) return;
        if (mode === "preview") {
            setSubmitted(true);
            onSubmitted?.();
            return;
        }
        setIsSubmitting(true);
        try {
            await onSubmit?.({
                overallFeeling: overallFeeling ? overallOptions.find((item) => item.value === overallFeeling)?.label ?? null : null,
                aiQuestions: selectedQuestionTags,
                understanding,
                notes: notes.trim(),
            });
            setSubmitted(true);
            onSubmitted?.();
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = () => {
        if (step < totalSteps) setStep(step + 1);
        else submit();
    };

    const prevStep = () => {
        if (step > 1) setStep(step - 1);
    };

    return (
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 font-sans">
            <AnimatePresence mode="wait">
                {!submitted ? (
                    <motion.div
                        key="rating"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-white rounded-2xl overflow-hidden flex flex-col lg:flex-row shadow-[0_1px_3px_rgba(124,58,237,0.04)]"
                        style={{ border: "1px solid #E9E7FF", minHeight: "500px" }}
                    >
                        {/* LEFT COLUMN */}
                        <div className="lg:w-2/5 p-8 lg:p-10 bg-[#FAFAFC] border-b lg:border-b-0 lg:border-r border-[#F0EEF8] flex flex-col justify-between relative">
                            <div>
                                <div className="flex items-center gap-3 mb-8">
                                    <img src="/sreevaailogo2.png" alt="SreevaAI" className="h-9 w-auto object-contain drop-shadow-sm" />
                                    <div className="font-bold text-gray-900 text-lg tracking-tight">SreevaAI</div>
                                </div>
                                <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">{title}</h2>
                                <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                                    {subtitle}
                                </p>

                                {/* Empty Space Filler Card */}
                                <div className="mt-12 p-5 rounded-2xl bg-gradient-to-br from-white to-violet-50/50 border border-violet-100/60 shadow-sm relative overflow-hidden group">
                                    <div className="absolute -top-2 -right-2 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                                        <img src="/sreevaailogo2.png" alt="" className="w-16 h-16 grayscale" />
                                    </div>
                                    <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-violet-500" />
                                        Why it matters
                                    </h4>
                                    <p className="text-xs text-gray-500 leading-relaxed relative z-10">
                                        Your feedback helps us continuously improve the interview experience. By sharing your honest thoughts, you help us build fairer, more intelligent, and empathetic AI interviews for candidates worldwide.
                                    </p>
                                </div>
                            </div>
                            
                            {/* Step Indicator (Desktop) */}
                            <div className="hidden lg:flex gap-1.5 mt-8">
                                {Array.from({ length: totalSteps }).map((_, i) => (
                                    <div key={i} className={cn("h-1.5 rounded-full transition-all duration-300", step === i + 1 ? "w-6 bg-violet-500" : (step > i + 1 ? "w-3 bg-violet-300" : "w-3 bg-gray-200"))} />
                                ))}
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="lg:w-3/5 p-8 lg:p-10 bg-white flex flex-col">
                            <div className="mb-6 flex items-start sm:items-center justify-between">
                                <div>
                                    <h3 className="text-base font-semibold text-gray-900">
                                        Please share your feedback {step === 1 && <span className="text-red-500">*</span>}
                                    </h3>
                                    <p className="text-sm text-gray-400 mt-0.5">Step {step} of {totalSteps}</p>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                    <button 
                                        type="button"
                                        onClick={() => setSupportDialogOpen(true)}
                                        className="text-xs font-semibold text-gray-600 hover:text-violet-700 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 hover:bg-violet-50 hover:border-violet-200"
                                    >
                                        <LifeBuoy className="w-3.5 h-3.5" />
                                        Support
                                    </button>
                                    
                                    {/* Step Indicator (Mobile) */}
                                    <div className="flex lg:hidden gap-1.5">
                                        {Array.from({ length: totalSteps }).map((_, i) => (
                                            <div key={i} className={cn("h-1.5 rounded-full transition-all duration-300", step === i + 1 ? "w-4 bg-violet-500" : "w-2 bg-gray-200")} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 relative">
                                <AnimatePresence mode="wait">
                                    {step === 1 && (
                                        <motion.div
                                            key="step1"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-4"
                                        >
                                            <div className="text-sm font-semibold text-gray-700">How did the interview feel overall?</div>
                                            <div className="grid grid-cols-5 gap-2">
                                                {overallOptions.map((option) => {
                                                    const active = overallFeeling === option.value;
                                                    return (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            onClick={() => {
                                                                setOverallFeeling(option.value);
                                                                // Auto advance on first selection if we are on step 1
                                                                setTimeout(() => nextStep(), 300);
                                                            }}
                                                            className={cn(
                                                                "flex flex-col items-center justify-center rounded-xl border py-4 px-2 transition-all duration-200",
                                                                active
                                                                    ? "border-violet-300 bg-violet-50"
                                                                    : "border-[#E9E7FF] bg-[#F9FAFB] hover:border-violet-200 hover:bg-violet-50/30"
                                                            )}
                                                        >
                                                            <div className="text-2xl leading-none">{option.emoji}</div>
                                                            <div className={cn("mt-3 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-center", active ? "text-violet-700" : "text-gray-500")}>
                                                                {option.label}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}

                                    {step === 2 && (
                                        <motion.div
                                            key="step2"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-4"
                                        >
                                            <div className="text-sm font-semibold text-gray-700">How were the AI's questions?</div>
                                            <div className="flex flex-wrap gap-2">
                                                {questionChips.map((chip) => {
                                                    const active = selectedQuestionTags.includes(chip);
                                                    return (
                                                        <button
                                                            key={chip}
                                                            type="button"
                                                            onClick={() => toggleQuestionTag(chip)}
                                                            className={cn(
                                                                "rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200",
                                                                active
                                                                    ? "border-violet-300 bg-violet-50 text-violet-700"
                                                                    : "border-[#E9E7FF] bg-[#F9FAFB] text-gray-600 hover:border-violet-200 hover:bg-violet-50/30"
                                                            )}
                                                        >
                                                            {chip}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}

                                    {step === 3 && (
                                        <motion.div
                                            key="step3"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-4"
                                        >
                                            <div className="text-sm font-semibold text-gray-700">Did the AI understand what you were saying?</div>
                                            <div className="grid gap-3">
                                                {understandingOptions.map((option) => {
                                                    const active = understanding === option;
                                                    return (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            onClick={() => {
                                                                setUnderstanding(option);
                                                                setTimeout(() => nextStep(), 300);
                                                            }}
                                                            className={cn(
                                                                "flex items-center justify-between rounded-xl border px-5 py-4 text-left transition-all duration-200",
                                                                active
                                                                    ? "border-violet-400 bg-violet-50/80 text-violet-900"
                                                                    : "border-[#E9E7FF] bg-[#F9FAFB] text-gray-700 hover:border-violet-200 hover:bg-violet-50/30"
                                                            )}
                                                        >
                                                            <span className="text-sm font-medium">{option}</span>
                                                            {active ? <CheckCircle2 className="h-5 w-5 text-violet-600" /> : <div className="h-5 w-5 rounded-full border border-gray-300" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}

                                    {step === 4 && (
                                        <motion.div
                                            key="step4"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-4"
                                        >
                                            <div className="text-sm font-semibold text-gray-700">Anything else we should know?</div>
                                            <div className="relative">
                                                <MessageSquare className="absolute left-4 top-4 h-5 w-5 text-gray-400" />
                                                <textarea
                                                    value={notes}
                                                    onChange={(e) => setNotes(e.target.value.slice(0, 150))}
                                                    placeholder="Took too long on one topic, or maybe something felt off..."
                                                    className="h-32 w-full resize-none rounded-xl text-sm outline-none transition-all py-4 pl-12 pr-4 text-gray-700 placeholder:text-gray-400"
                                                    style={{ border: "1px solid #E9E7FF", backgroundColor: "#F9FAFB" }}
                                                    onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                                                    onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                                                />
                                                <div className="mt-2 text-right text-xs font-medium text-gray-400">
                                                    {notes.length}/150
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="flex justify-between items-center mt-12 pt-6 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={prevStep}
                                    className={cn(
                                        "text-sm font-medium transition-colors",
                                        step > 1 ? "text-gray-500 hover:text-gray-900" : "text-transparent pointer-events-none"
                                    )}
                                >
                                    Back
                                </button>

                                <button
                                    type="button"
                                    onClick={nextStep}
                                    disabled={(step === 1 && !canSubmit) || isSubmitting}
                                    className="inline-flex items-center justify-center gap-2 h-11 px-8 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={(step > 1 || canSubmit) ? {
                                        background: "linear-gradient(135deg, #8B5CF6, #3B82F6)",
                                        boxShadow: "0 4px 14px rgba(124,58,237,0.3)"
                                    } : { background: "#D1D5DB" }}
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                        <>
                                            {step === totalSteps ? (mode === "preview" ? "Preview Only" : "Submit Feedback") : "Continue"}
                                            {step < totalSteps && <ArrowRight className="w-4 h-4" />}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="thanks"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <div className="bg-white rounded-2xl p-12 shadow-[0_1px_3px_rgba(124,58,237,0.04)]" style={{ border: "1px solid #E9E7FF" }}>
                            <div className="w-16 h-16 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-6">
                                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-900 tracking-tight mb-2">Thank you</h2>
                            <p className="text-gray-500 text-sm mb-6">
                                Your response has been recorded.
                            </p>
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                Candidate rating submitted.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Support Dialog */}
            <Dialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black tracking-tight uppercase tracking-widest">Contact Support</DialogTitle>
                        <DialogDescription className="sr-only">
                            Send a support request if you are facing a technical issue during the interview.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {supportSuccess ? (
                            <div className="py-8 text-center space-y-4">
                                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-gray-900">Thank You</h3>
                                    <p className="text-sm text-gray-500 font-medium">Your support request has been sent successfully. Our team will get back to you if needed.</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-black uppercase tracking-widest text-gray-400">Name</Label>
                                    <Input
                                        value={supportForm.name}
                                        onChange={(e) => setSupportForm((prev) => ({ ...prev, name: e.target.value }))}
                                        placeholder="Your full name"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-black uppercase tracking-widest text-gray-400">Email</Label>
                                    <Input
                                        type="email"
                                        value={supportForm.email}
                                        onChange={(e) => setSupportForm((prev) => ({ ...prev, email: e.target.value }))}
                                        placeholder="you@example.com"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-black uppercase tracking-widest text-gray-400">What is the issue about?</Label>
                                    <textarea
                                        value={supportForm.issueAbout}
                                        onChange={(e) => setSupportForm((prev) => ({ ...prev, issueAbout: e.target.value }))}
                                        placeholder="Describe the issue you are facing..."
                                        rows={4}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                                    />
                                </div>
                                {supportError && (
                                    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                                        {supportError}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    {!supportSuccess && (
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-xl"
                                onClick={() => setSupportDialogOpen(false)}
                                disabled={supportSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={submitSupportRequest}
                                disabled={supportSubmitting}
                                className="rounded-xl bg-[#7C3AED] text-white hover:bg-violet-600"
                            >
                                {supportSubmitting ? "Sending..." : "Send Request"}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

