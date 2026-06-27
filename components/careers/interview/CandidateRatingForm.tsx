"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, MessageSquare, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
    const [overallFeeling, setOverallFeeling] = useState<number | null>(null);
    const [selectedQuestionTags, setSelectedQuestionTags] = useState<string[]>([]);
    const [understanding, setUnderstanding] = useState<UnderstandingLevel | null>(null);
    const [notes, setNotes] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
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
                        style={{ border: "1px solid #E9E7FF" }}
                    >
                        {/* LEFT COLUMN */}
                        <div className="lg:w-2/5 p-8 lg:p-10 bg-[#FAFAFC] border-b lg:border-b-0 lg:border-r border-[#F0EEF8] flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border border-[#E9E7FF] text-violet-600">
                                        <Sparkles className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900 text-sm">SreevaAI</div>
                                        <div className="text-xs text-gray-400">AI Interviewer</div>
                                    </div>
                                </div>
                                <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">{title}</h2>
                                <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                                    {subtitle}
                                </p>
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="lg:w-3/5 p-8 lg:p-10 space-y-8 bg-white">
                            <div className="mb-4">
                                <h3 className="text-base font-semibold text-gray-900">
                                    Please share your feedback <span className="text-red-500">*</span>
                                </h3>
                                <p className="text-sm text-gray-400 mt-0.5">We value your opinion.</p>
                            </div>

                            <section className="space-y-3">
                                <div className="text-sm font-semibold text-gray-700">1. How did the interview feel overall?</div>
                                <div className="grid grid-cols-5 gap-2">
                                    {overallOptions.map((option) => {
                                        const active = overallFeeling === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setOverallFeeling(option.value)}
                                                className={cn(
                                                    "flex flex-col items-center justify-center rounded-xl border p-3 transition-all duration-200",
                                                    active
                                                        ? "border-violet-300 bg-violet-50"
                                                        : "border-[#E9E7FF] bg-[#F9FAFB] hover:border-violet-200 hover:bg-violet-50/30"
                                                )}
                                            >
                                                <div className="text-2xl leading-none">{option.emoji}</div>
                                                <div className={cn("mt-2 text-[10px] font-semibold uppercase tracking-wider", active ? "text-violet-700" : "text-gray-500")}>
                                                    {option.label}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="space-y-3">
                                <div className="text-sm font-semibold text-gray-700">2. How were the AI's questions?</div>
                                <div className="flex flex-wrap gap-2">
                                    {questionChips.map((chip) => {
                                        const active = selectedQuestionTags.includes(chip);
                                        return (
                                            <button
                                                key={chip}
                                                type="button"
                                                onClick={() => toggleQuestionTag(chip)}
                                                className={cn(
                                                    "rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-200",
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
                            </section>

                            <section className="space-y-3">
                                <div className="text-sm font-semibold text-gray-700">3. Did the AI understand what you were saying?</div>
                                <div className="grid gap-2">
                                    {understandingOptions.map((option) => {
                                        const active = understanding === option;
                                        return (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => setUnderstanding(option)}
                                                className={cn(
                                                    "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all duration-200",
                                                    active
                                                        ? "border-violet-400 bg-violet-50/80 text-violet-900"
                                                        : "border-[#E9E7FF] bg-[#F9FAFB] text-gray-700 hover:border-violet-200 hover:bg-violet-50/30"
                                                )}
                                            >
                                                <span className="text-sm">{option}</span>
                                                {active ? <CheckCircle2 className="h-4 w-4 text-violet-600" /> : <div className="h-4 w-4 rounded-full border border-gray-300" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="space-y-3">
                                <div className="text-sm font-semibold text-gray-700">4. Anything we should know?</div>
                                <div className="relative">
                                    <MessageSquare className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value.slice(0, 150))}
                                        placeholder="Took too long on one topic..."
                                        className="h-24 w-full resize-none rounded-xl text-sm outline-none transition-all py-3 pl-10 pr-4 text-gray-700 placeholder:text-gray-400"
                                        style={{ border: "1px solid #E9E7FF", backgroundColor: "#F9FAFB" }}
                                        onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                                        onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                                    />
                                    <div className="mt-1.5 text-right text-xs text-gray-400">
                                        {notes.length}/150
                                    </div>
                                </div>
                            </section>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={submit}
                                    disabled={!canSubmit || isSubmitting}
                                    className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={canSubmit ? {
                                        background: "linear-gradient(135deg, #8B5CF6, #3B82F6)",
                                        boxShadow: "0 4px 14px rgba(124,58,237,0.3)"
                                    } : { background: "#D1D5DB" }}
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                        <>
                                            {mode === "preview" ? "Preview Only" : "Complete Interview"}
                                            <ArrowRight className="w-4 h-4" />
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
        </div>
    );
}

