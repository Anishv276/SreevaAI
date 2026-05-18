"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
    X, 
    Send, 
    Sparkles, 
    User, 
    Bot, 
    Command,
    Maximize2,
    Minimize2,
    BrainCircuit,
    ChevronRight,
    Search,
    MessageSquare,
    Zap,
    Scale,
    Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
    role: "user" | "assistant";
    content: string;
}

export function RecruiterAssistant({ logoUrl, name }: { logoUrl?: string; name?: string }) {
    const welcomeMessage = {
        role: "assistant" as const,
        content: "### Welcome to Ishita @ Sreeva AI\n\nI am your AI recruitment assistant, ready to help you analyze your talent pool and find the best candidates. Ask me anything about your applicants' skills or interview performance!"
    };

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
    const [isLoading, setIsLoading] = useState(false);
    // ⚡ Company branding is now passed as props from layout — no fetch needed
    const company = { logoUrl, name };
    const scrollRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    // Renders inline markdown: **bold** and [text](url) links
    const renderInlineMarkdown = (text: string): React.ReactNode[] => {
        // Split on bold markers and markdown links
        const parts = text.split(/(\*\*.*?\*\*|\[[^\]]+\]\([^)]+\))/g);
        return parts.map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
                return <strong key={i} className="font-black text-gray-950">{part.slice(2, -2)}</strong>;
            }
            const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (linkMatch) {
                return (
                    <a
                        key={i}
                        href={linkMatch[2]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-500 underline underline-offset-2 hover:text-orange-700 font-semibold break-all transition-colors"
                    >
                        {linkMatch[1]}
                    </a>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

    const handleNewChat = () => {
        setMessages([welcomeMessage]);
        setInput("");
        setIsLoading(false);
    };

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { role: "user", content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/admin/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [...messages, userMsg] }),
            });

            if (!res.ok) throw new Error("Chat assistant failed");

            const data = await res.json();
            setMessages(prev => [...prev, data]);
        } catch (error) {
            setMessages(prev => [...prev, { role: "assistant", content: "**Error:** I couldn't reach the intelligence engine. Please check your connection." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Pulsing Toggle Toggle */}
            {!isOpen && (
                <motion.button
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-8 right-8 h-20 w-20 rounded-[2.5rem] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex items-center justify-center z-50 group border-4 border-white overflow-hidden"
                >
                    <img 
                        src="/avatars/ishita.png" 
                        alt="Ishita AI" 
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
                    />
                    <div className="absolute bottom-1 right-1 h-5 w-5 bg-white rounded-full flex items-center justify-center shadow-md border-2 border-white">
                        <div className="h-2.5 w-2.5 bg-emerald-500 rounded-full animate-pulse" />
                    </div>
                </motion.button>
            )}

            {/* Premium Intelligence Drawer - Matching "Create Drive" Aesthetic */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                            "fixed right-4 bottom-4 top-4 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.15)] z-[100] flex flex-col border border-gray-100 rounded-[2.5rem] overflow-hidden transition-all duration-500",
                            isMinimized ? "w-24 h-24 bottom-8 right-8 top-auto rounded-full" : "w-[600px]"
                        )}
                    >
                        {/* Header: Clean White with Section Accent */}
                        <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white relative shrink-0">
                            <div className="flex items-center gap-4">
                                {company.logoUrl ? (
                                    <div className="h-10 w-10 rounded-xl border border-gray-100 p-1 bg-white shadow-sm overflow-hidden flex items-center justify-center">
                                        <img src={company.logoUrl} alt={company.name} className="max-h-full max-w-full object-contain" />
                                    </div>
                                ) : (
                                    <div className="h-12 w-1.5 bg-[#F97316] rounded-full shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                                )}
                                {!isMinimized && (
                                    <div>
                                        <h3 className="text-xl font-black tracking-tight text-gray-900 leading-none">
                                            AI Assistant
                                        </h3>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_5px_#22C55E]" />
                                            Intelligence Engine Live
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={handleNewChat}
                                    className="h-10 w-10 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                                    title="New Chat"
                                >
                                    <Plus className="h-5 w-5" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-10 w-10 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all">
                                    <X className="h-6 w-6" />
                                </Button>
                            </div>
                        </div>

                        {!isMinimized && (
                            <>
                                {/* Messages Area - Standard Admin White */}
                                <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-4 scroll-smooth antialiased bg-white custom-scrollbar">
                                    {messages.map((msg, i) => (
                                        <motion.div
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            key={i}
                                            className={cn(
                                                "flex gap-4 w-full",
                                                msg.role === "user" ? "flex-row-reverse" : "flex-row"
                                            )}
                                        >
                                            {/* Avatar Section */}
                                            <div className="shrink-0">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-xl flex items-center justify-center shadow-sm border overflow-hidden",
                                                    msg.role === "assistant" 
                                                        ? "bg-white border-orange-100 shadow-[0_4px_12px_rgba(249,115,22,0.1)]" 
                                                        : "bg-white border-gray-200"
                                                )}>
                                                    {msg.role === "assistant" ? (
                                                        <img src="/avatars/ishita.png" alt="Ishita" className="h-full w-full object-cover" />
                                                    ) : company.logoUrl ? (
                                                        <img src={company.logoUrl} alt="User" className="h-full w-full object-contain p-1" />
                                                    ) : (
                                                        <User className="h-5 w-5 text-gray-400" />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Content Block */}
                                            <div className={cn(
                                                "flex flex-col gap-2 min-w-0 max-w-[85%]",
                                                msg.role === "user" ? "items-end text-right" : "items-start text-left"
                                            )}>
                                                <div className="flex items-center gap-2 px-1">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">
                                                        {msg.role === "assistant" ? "Ishita AI" : "Recruiter"}
                                                    </span>
                                                </div>
                                                <div className={cn(
                                                    "p-3 rounded-2xl text-[11px] leading-relaxed shadow-[0_4px_15px_rgba(0,0,0,0.03)] border break-words overflow-hidden w-full",
                                                    msg.role === "assistant" 
                                                        ? "bg-white border-gray-100 text-gray-800" 
                                                        : "bg-[#F97316] border-orange-400 text-white font-medium"
                                                )}>
                                                    {msg.content.split("\n").map((line, linIdx) => {
                                        // Handle Headings (### and ##)
                                        if (line.startsWith("### ")) {
                                            return <h4 key={linIdx} className="text-sm font-extrabold mt-2 mb-2 text-gray-900 tracking-tight break-words">{line.replace("### ", "")}</h4>;
                                        }
                                        if (line.startsWith("## ")) {
                                            return <h3 key={linIdx} className="text-base font-extrabold mt-3 mb-2 text-gray-900 tracking-tight break-words">{line.replace("## ", "")}</h3>;
                                        }

                                        // Skip markdown table separator rows (|---|---)
                                        if (/^\|[-| :]+\|$/.test(line.trim())) return null;

                                        // Handle table rows (| col | col |)
                                        if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
                                            const cells = line.trim().slice(1, -1).split("|").map(c => c.trim());
                                            return (
                                                <div key={linIdx} className="flex gap-2 text-[12px] font-medium text-gray-700 border-b border-gray-50 py-1">
                                                    {cells.map((cell, ci) => (
                                                        <span key={ci} className="flex-1">{renderInlineMarkdown(cell)}</span>
                                                    ))}
                                                </div>
                                            );
                                        }

                                        // Handle Bullet Points
                                        if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
                                            const cleanLine = line.trim().replace(/^[-*]\s+/, "");
                                            return (
                                                <div key={linIdx} className="flex gap-3 ml-2 mb-2 items-start">
                                                    <div className="h-4 w-4 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 mt-1">
                                                        <ChevronRight className="h-2.5 w-2.5 text-[#F97316]" />
                                                    </div>
                                                    <span className="font-medium text-gray-700 break-words min-w-0">{renderInlineMarkdown(cleanLine)}</span>
                                                </div>
                                            );
                                        }

                                        // Skip empty lines (just add spacing via mb-3 on p)
                                        if (!line.trim()) return <div key={linIdx} className="h-2" />;

                                        return <p key={linIdx} className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{renderInlineMarkdown(line)}</p>;
                                    })}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}

                                    {/* Typing Indicator */}
                                    {isLoading && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex gap-4 items-start"
                                        >
                                            <div className="h-10 w-10 rounded-xl bg-white border border-orange-100 flex items-center justify-center overflow-hidden animate-pulse">
                                                <img src="/avatars/ishita.png" alt="Ishita" className="h-full w-full object-cover" />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <span className="text-[10px] font-black text-[#F97316] uppercase tracking-widest leading-none">Ishita is typing...</span>
                                                <div className="flex gap-1.5 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm items-center">
                                                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="h-2 w-2 rounded-full bg-orange-400" />
                                                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="h-2 w-2 rounded-full bg-orange-300" />
                                                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="h-2 w-2 rounded-full bg-orange-200" />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>

                                {/* Premium White Input Bar - Matching Step 1 */}
                                <div className="p-8 bg-white border-t border-gray-50 shrink-0">
                                    <div className="relative group">
                                        <Input
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                                            placeholder="Ask your question..."
                                            className="h-16 pr-16 pl-8 rounded-[1.2rem] border-gray-200 bg-white hover:border-orange-300 focus-visible:border-orange-500 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:ring-offset-0 transition-all font-bold text-[15px] shadow-sm"
                                        />
                                        <Button
                                            disabled={!input.trim() || isLoading}
                                            onClick={handleSendMessage}
                                            className="absolute right-2.5 top-2.5 h-11 w-11 bg-gradient-to-br from-[#F97316] to-orange-500 text-white rounded-[0.8rem] flex items-center justify-center hover:shadow-[0_8px_20px_rgba(249,115,22,0.3)] transition-all active:scale-95 disabled:opacity-30 shadow-md"
                                        >
                                            <Send className="h-5 w-5" />
                                        </Button>
                                    </div>
                                    
                                    <div className="flex items-center justify-center gap-4 mt-6">
                                        <div className="h-px flex-1 bg-gray-50" />
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">
                                            @<strong>powered by Sreeva AI intelligence</strong>
                                        </p>
                                        <div className="h-px flex-1 bg-gray-50" />
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

