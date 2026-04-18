import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepsProps {
    steps: string[];
    currentStep: number;
    onStepClick?: (index: number) => void;
    isEditMode?: boolean;
    maxStepReached?: number;
}

export function Steps({ steps, currentStep, onStepClick, isEditMode, maxStepReached = 0 }: StepsProps) {
    return (
        <div className="relative flex justify-between w-full">
            {/* Track */}
            <div className="absolute top-4 left-0 h-[2px] w-full bg-gray-200 rounded-full" />
            {/* Progress fill */}
            <div
                className="absolute top-4 left-0 h-[2px] bg-[#F97316] rounded-full transition-all duration-500"
                style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
            />

            {steps.map((step, index) => {
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                const wasReached = index <= maxStepReached;
                
                // Clickable if completed, in edit mode, or previously reached
                const isClickable = (isCompleted || isEditMode || wasReached) && onStepClick;

                return (
                    <div key={step} className="relative z-10 flex flex-col items-center gap-2">
                        <div
                            onClick={() => isClickable && onStepClick(index)}
                            className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white transition-all duration-300",
                                isCompleted
                                    ? "border-[#F97316] bg-[#F97316] text-white cursor-pointer hover:opacity-80"
                                    : isCurrent
                                        ? "border-[#F97316] text-[#F97316] shadow-[0_0_0_4px_rgba(249,115,22,0.15)]"
                                        : (isEditMode || wasReached)
                                            ? "border-orange-200 text-orange-400 cursor-pointer hover:border-orange-300"
                                            : "border-gray-300 text-gray-400 cursor-not-allowed"
                            )}
                        >
                            {isCompleted
                                ? <Check className="h-4 w-4" />
                                : <span className="text-xs font-bold">{index + 1}</span>
                            }
                        </div>
                        <span
                            className={cn(
                                "text-[11px] font-semibold transition-colors whitespace-nowrap",
                                isCurrent ? "text-[#F97316]" : (isCompleted || isEditMode || wasReached) ? "text-gray-600" : "text-gray-400"
                            )}
                        >
                            {step}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
