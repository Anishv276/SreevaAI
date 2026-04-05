"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    X,
    MessageSquare,
    Bot, 
    User, 
    Sparkles, 
    TrendingUp,
    Users,
    ShieldCheck,
    Copy,
    Check,
    Zap,
    BarChart3,
    Calendar,
    ArrowUp,
    Trash2,
    Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp?: Date;
}

const STORAGE_KEY = "lumo_chat_history_v3";

const suggestions = [
    "active hires",
    "people with react",
    "how many drives",
    "top 5 candidates",
    "recent applications",
    "summarize vamsi profile",
    "candidates with score > 80",
];

export const RecruiterAssistant = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "👋 **Welcome back.** I'm **Lumo**, your recruitment intelligence. How can I help?",
            timestamp: new Date()
        }
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Suggestion rotation logic
    useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => {
            setSuggestionIndex(prev => (prev + 1) % suggestions.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [isOpen]);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setMessages(parsed.map((m: any) => ({
                        ...m,
                        timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
                    })));
                }
            } catch (e) {
                console.log("No valid chat history");
            }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        if (scrollRef.current) {
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: "auto"
                });
            });
        }
    }, [messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isOpen]);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    };

    const handleCopy = useCallback((content: string, index: number) => {
        navigator.clipboard.writeText(content);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 1500);
    }, []);

    const handleClear = useCallback(() => {
        setMessages([{
            role: "assistant",
            content: "Chat cleared. **Lumo** ready. How can I help?",
            timestamp: new Date()
        }]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const handleSend = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        const now = new Date();
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: userMsg, timestamp: now }]);
        setIsLoading(true);

        try {
            const response = await fetch("/api/admin/assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    message: userMsg,
                    history: messages.slice(-4).map(m => ({ role: m.role, content: m.content }))
                }),
            });

            if (!response.ok) throw new Error("Connection failed");

            const reader = response.body?.getReader();
            let aiContent = "";
            setMessages(prev => [...prev, { role: "assistant", content: "", timestamp: new Date() }]);

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = new TextDecoder().decode(value);
                    aiContent += chunk;
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        newMsgs[newMsgs.length - 1].content = aiContent;
                        return newMsgs;
                    });
                }
            }
        } catch (error) {
            setMessages(prev => [...prev, { 
                role: "assistant", 
                content: "⚠️ **Connection error.** Please try again.",
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, messages]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    return (
        <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none">
            <div className="relative">
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute bottom-0 right-0 w-[400px] h-[600px] bg-white border border-gray-100 shadow-[0_20px_60px_rgba(0,0,0,0.12)] rounded-[2.5rem] overflow-hidden pointer-events-auto flex flex-col"
                        >
                            {/* HEADER */}
                            <div className="px-6 py-5 flex items-center justify-between shrink-0 bg-white border-b border-gray-50">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-2xl bg-orange-50 flex items-center justify-center text-[#F97316]">
                                        <Bot className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-gray-900 text-[15px] font-black leading-none mb-1">
                                            Lumo AI Assistant
                                        </h3>
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Active Intelligence</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={handleClear}
                                        className="h-9 w-9 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => setIsOpen(false)}
                                        className="h-9 w-9 text-gray-300 hover:text-gray-900 hover:bg-gray-50 rounded-xl"
                                    >
                                        <X className="h-5 w-5" />
                                    </Button>
                                </div>
                            </div>

                            {/* CHAT FEED */}
                            <div 
                                ref={scrollRef}
                                className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scroll-smooth custom-scrollbar bg-white"
                            >
                                {messages.map((msg, i) => (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        key={i} 
                                        className={cn(
                                            "flex gap-3",
                                            msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                                        )}
                                    >
                                        <div className={cn(
                                            "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border",
                                            msg.role === 'user' 
                                                ? "bg-gray-900 border-gray-900 text-white" 
                                                : "bg-white border-gray-100 text-[#F97316]"
                                        )}>
                                            {msg.role === 'user' ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                        </div>
                                        <div className="relative max-w-[80%]">
                                            <div className={cn(
                                                "text-[13px] leading-relaxed p-4",
                                                msg.role === 'user' 
                                                    ? "bg-gray-900 text-white rounded-[1.2rem] rounded-tr-none" 
                                                    : "bg-gray-50 text-gray-700 rounded-[1.2rem] rounded-tl-none border border-gray-100/50"
                                            )}>
                                                {msg.content.split('\n').map((line, idx) => (
                                                    <p key={idx} className={idx > 0 ? "mt-2" : ""}>
                                                        {line.split('**').map((part, pIdx) => 
                                                            pIdx % 2 === 1 ? <span key={pIdx} className="font-bold text-inherit">{part}</span> : part
                                                        )}
                                                    </p>
                                                ))}
                                            </div>
                                            
                                            {msg.role === 'assistant' && msg.content && (
                                                <button
                                                    onClick={() => handleCopy(msg.content, i)}
                                                    className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-gray-50 rounded-lg"
                                                >
                                                    {copiedIndex === i ? (
                                                        <Check className="h-3 w-3 text-green-500" />
                                                    ) : (
                                                        <Copy className="h-3 w-3 text-gray-300" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                                
                                {isLoading && messages[messages.length-1].role === "user" && (
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center border border-orange-100">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                        <div className="h-8 flex gap-1.5 items-center px-4 bg-gray-50 rounded-full border border-gray-100">
                                            {[0, 0.15, 0.3].map((delay, i) => (
                                                <motion.div 
                                                    key={i}
                                                    className="h-1.5 w-1.5 rounded-full bg-gray-300"
                                                    animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                                                    transition={{ duration: 0.8, repeat: Infinity, delay }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* DYNAMIC SUGGESTION BAR */}
                            {!input && !isLoading && (
                                <div className="px-10 pb-2 flex items-center gap-2 text-gray-300 pointer-events-none">
                                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Try:</span>
                                    <div className="h-5 overflow-hidden flex-1 relative">
                                        <AnimatePresence mode="wait">
                                            <motion.p
                                                key={suggestionIndex}
                                                initial={{ y: 20, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                exit={{ y: -20, opacity: 0 }}
                                                transition={{ duration: 0.5, ease: "anticipate" }}
                                                className="text-[11px] font-bold text-gray-400 absolute"
                                            >
                                                {suggestions[suggestionIndex]}
                                            </motion.p>
                                        </AnimatePresence>
                                    </div>
                                </div>
                            )}

                            {/* INPUT */}
                            <div className="p-6 pt-1 bg-white border-t border-gray-50">
                                <form onSubmit={handleSend} className="relative flex gap-2">
                                    <Input
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask Lumo anything..."
                                        disabled={isLoading}
                                        className="h-12 border-gray-100 bg-gray-50/50 rounded-2xl focus:ring-[#F97316]/10 focus:border-[#F97316] font-medium text-sm placeholder:text-gray-400"
                                    />
                                    <button 
                                        type="submit"
                                        disabled={!input.trim() || isLoading}
                                        className="h-12 w-12 rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white flex items-center justify-center disabled:opacity-30 transition-all shadow-lg shadow-orange-500/20 active:scale-95 shrink-0"
                                    >
                                        <ArrowUp className="h-5 w-5" />
                                    </button>
                                </form>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* FAB */}
                {!isOpen && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsOpen(true)}
                        className="pointer-events-auto h-16 w-16 rounded-[1.5rem] bg-[#F97316] hover:bg-orange-600 text-white flex items-center justify-center shadow-[0_15px_40px_rgba(249,115,22,0.3)] transition-all ring-4 ring-white"
                    >
                        <MessageSquare className="h-7 w-7" />
                    </motion.button>
                )}
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #f3f4f6; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #e5e7eb; }
            `}</style>
        </div>
    );
};
