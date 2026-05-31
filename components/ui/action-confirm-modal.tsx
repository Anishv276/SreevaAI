"use client";

import { X, ShieldAlert, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ActionConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void> | void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "info";
    isLoading?: boolean;
}

export function ActionConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger",
    isLoading: externalLoading = false,
}: ActionConfirmModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            await onConfirm();
        } catch {
            // Keep the modal open so the caller can surface an error state.
        } finally {
            setIsSubmitting(false);
        }
    };

    const isLoading = externalLoading || isSubmitting;

    const variantStyles = {
        danger: {
            icon: Trash2,
            iconBg: "bg-red-50 text-red-500",
            buttonBg: "bg-gray-900 hover:bg-red-600",
        },
        warning: {
            icon: ShieldAlert,
            iconBg: "bg-amber-50 text-amber-500",
            buttonBg: "bg-gray-900 hover:bg-amber-600",
        },
        info: {
            icon: ShieldAlert,
            iconBg: "bg-blue-50 text-blue-500",
            buttonBg: "bg-gray-900 hover:bg-blue-600",
        },
    };

    const style = variantStyles[variant];
    const Icon = style.icon;

    return (
        <div 
            className="fixed inset-0 z-[1000] backdrop-blur-md bg-white/50 flex items-center justify-center p-6 animate-in fade-in duration-200"
            onClick={() => !isLoading && onClose()}
        >
            <div 
                className="w-full max-w-md bg-white border border-gray-100 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.1)] overflow-hidden animate-in-up"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-8 text-center space-y-6 relative">
                    {!isLoading && (
                        <button 
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-50 text-gray-400 hover:text-gray-900 transition-all border border-transparent hover:border-gray-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    
                    <div className="flex justify-center">
                        <div className={cn("h-16 w-16 rounded-2xl flex items-center justify-center", style.iconBg)}>
                            <Icon className="h-8 w-8" />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
                        <p className="text-sm font-medium text-gray-500">{description}</p>
                    </div>
                    
                    <div className="space-y-3 pt-2">
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading}
                            className={cn(
                                "w-full h-11 text-white rounded-xl font-bold text-sm shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2",
                                style.buttonBg
                            )}
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmText}
                        </button>
                        
                        {!isLoading && (
                            <button
                                onClick={onClose}
                                className="w-full h-11 bg-gray-50 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-100 hover:text-gray-900 transition-all border border-gray-100"
                            >
                                {cancelText}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

