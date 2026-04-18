"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, X, Info } from "lucide-react";
import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastStore {
    toasts: Toast[];
    addToast: (message: string, type?: ToastType) => void;
    removeToast: (id: string) => void;
}

// Simple state management without zustand if not present, but wait, zustand is not in package.json.
// I'll use a simple event emitter pattern or a singleton class.

class ToastManager {
    private listeners: ((toasts: Toast[]) => void)[] = [];
    private toasts: Toast[] = [];

    subscribe(listener: (toasts: Toast[]) => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l([...this.toasts]));
    }

    success(message: string) {
        this.add(message, "success");
    }

    error(message: string) {
        this.add(message, "error");
    }

    info(message: string) {
        this.add(message, "info");
    }

    private add(message: string, type: ToastType) {
        const id = Math.random().toString(36).substring(2, 9);
        this.toasts.push({ id, message, type });
        this.notify();
        setTimeout(() => this.remove(id), 4000);
    }

    remove(id: string) {
        this.toasts = this.toasts.filter(t => t.id !== id);
        this.notify();
    }
}

export const toast = new ToastManager();

export function Toaster() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        return toast.subscribe(setToasts);
    }, []);

    return (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[9999] flex flex-col-reverse gap-3 pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((t) => (
                    <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: -20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className="pointer-events-auto"
                    >
                        <div className={`
                            flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border backdrop-blur-md min-w-[320px]
                            ${t.type === "success" ? "bg-white/90 border-green-100 text-green-900" : 
                              t.type === "error" ? "bg-white/90 border-red-100 text-red-900" : 
                              "bg-white/90 border-orange-100 text-orange-900"}
                        `}>
                            <div className={`p-2 rounded-xl ${
                                t.type === "success" ? "bg-green-50 text-green-600" : 
                                t.type === "error" ? "bg-red-50 text-red-600" : 
                                "bg-orange-50 text-[#F97316]"
                            }`}>
                                {t.type === "success" && <CheckCircle2 className="w-5 h-5" />}
                                {t.type === "error" && <AlertCircle className="w-5 h-5" />}
                                {t.type === "info" && <Info className="w-5 h-5" />}
                            </div>
                            
                            <div className="flex-1">
                                <p className="text-[13px] font-black uppercase tracking-widest opacity-40 leading-none mb-1">
                                    {t.type}
                                </p>
                                <p className="text-sm font-bold tracking-tight">
                                    {t.message}
                                </p>
                            </div>

                            <button 
                                onClick={() => toast.remove(t.id)}
                                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
