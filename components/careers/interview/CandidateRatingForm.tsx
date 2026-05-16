"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    title = "Candidate Rating",
    subtitle = "Tell us how the interview felt so we can improve the AI.",
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
        <div className="w-full max-w-2xl mx-auto px-6 font-sans">
            <AnimatePresence mode="wait">
                {!submitted ? (
                    <motion.div
                        key="rating"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-white border border-gray-100 rounded-[2.5rem] p-8 sm:p-10 shadow-[0_18px_50px_rgba(0,0,0,0.05)]"
                    >
                        <div className="mb-8 text-center">
                            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">{title}</h2>
                            <p className="mt-2 text-[12px] font-bold uppercase tracking-widest text-gray-400">
                                {subtitle}
                            </p>
                        </div>

                        <div className="space-y-8">
                            <section className="space-y-4">
                                <div>
                                    <h3 className="text-base font-black text-gray-900">1. How did the interview feel overall?</h3>
                                    <p className="text-sm text-gray-500">Pick the closest feeling.</p>
                                </div>
                                <div className="grid grid-cols-5 gap-2 sm:gap-3">
                                    {overallOptions.map((option) => {
                                        const active = overallFeeling === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setOverallFeeling(option.value)}
                                                className={cn(
                                                    "rounded-2xl border px-2 py-4 text-center transition-all duration-200",
                                                    active
                                                        ? "border-orange-300 bg-orange-50 shadow-md shadow-orange-100"
                                                        : "border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/60"
                                                )}
                                            >
                                                <div className="text-3xl leading-none">{option.emoji}</div>
                                                <div className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] text-gray-600">
                                                    {option.label}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="space-y-4">
                                <div>
                                    <h3 className="text-base font-black text-gray-900">2. How were the AI's questions?</h3>
                                    <p className="text-sm text-gray-500">Tap all that apply.</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {questionChips.map((chip) => {
                                        const active = selectedQuestionTags.includes(chip);
                                        return (
                                            <button
                                                key={chip}
                                                type="button"
                                                onClick={() => toggleQuestionTag(chip)}
                                                className={cn(
                                                    "rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200",
                                                    active
                                                        ? "border-orange-300 bg-orange-50 text-orange-700 shadow-sm"
                                                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-orange-200 hover:bg-orange-50/60"
                                                )}
                                            >
                                                {chip}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="space-y-4">
                                <div>
                                    <h3 className="text-base font-black text-gray-900">3. Did the AI understand what you were saying?</h3>
                                    <p className="text-sm text-gray-500">Choose one option.</p>
                                </div>
                                <div className="grid gap-2">
                                    {understandingOptions.map((option) => {
                                        const active = understanding === option;
                                        return (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => setUnderstanding(option)}
                                                className={cn(
                                                    "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all duration-200",
                                                    active
                                                        ? "border-gray-900 bg-gray-900 text-white shadow-lg"
                                                        : "border-gray-200 bg-white text-gray-700 hover:border-orange-200 hover:bg-orange-50/60"
                                                )}
                                            >
                                                <span className="text-sm font-semibold">{option}</span>
                                                {active ? <CheckCircle2 className="h-4 w-4" /> : <div className="h-4 w-4 rounded-full border border-current opacity-30" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="space-y-4">
                                <div>
                                    <h3 className="text-base font-black text-gray-900">4. Anything we should know?</h3>
                                    <p className="text-sm text-gray-500">Optional, max 150 characters.</p>
                                </div>
                                <div className="relative">
                                    <MessageSquare className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-gray-300" />
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value.slice(0, 150))}
                                        placeholder="Took too long on one topic / skipped something important..."
                                        className="h-28 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50/50 py-4 pl-11 pr-4 text-sm font-medium text-gray-700 outline-none transition-all placeholder:text-gray-400 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-200"
                                    />
                                    <div className="mt-2 text-right text-[11px] font-semibold text-gray-400">
                                        {notes.length}/150
                                    </div>
                                </div>
                            </section>

                            <Button
                                type="button"
                                onClick={submit}
                                disabled={!canSubmit || isSubmitting}
                                className={cn(
                                    "w-full h-14 rounded-2xl font-bold uppercase tracking-widest text-[12px] transition-all shadow-lg",
                                    canSubmit
                                        ? "bg-gray-900 text-white hover:bg-black shadow-gray-900/10"
                                        : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                                )}
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === "preview" ? "Preview Only" : "Submit Rating"}
                            </Button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="thanks"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-12 shadow-[0_18px_50px_rgba(0,0,0,0.05)]">
                            <div className="w-20 h-20 bg-green-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
                                <CheckCircle2 className="w-10 h-10 text-green-500" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-3">Thank you</h2>
                            <p className="text-gray-500 font-medium text-base mb-6 leading-relaxed">
                                Your response has been recorded.
                            </p>
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                                Candidate rating submitted.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
