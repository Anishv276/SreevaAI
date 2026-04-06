"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
    Sparkles, Send, Bot, User, 
    ArrowLeft, CheckCircle2, Loader2, 
    Zap, Rocket, MessageSquare, 
    RefreshCcw, FileText, Check,
    Plus, ExternalLink, ChevronRight, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Message = {
    id: string;
    role: "assistant" | "user";
    content: string;
    data?: any;
    status?: "thinking" | "done" | "error";
};

export default function AiChatJdPage() {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [input, setInput] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedJd, setGeneratedJd] = useState<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial load from localStorage
    useEffect(() => {
        const saved = localStorage.getItem("ai_chat_history");
        if (saved) {
            try {
                setMessages(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse chat history", e);
            }
        } else {
            // Default first message if no history
            setMessages([
                {
                    id: "1",
                    role: "assistant" as const,
                    content: "<strong>WELCOME TO THE AI JOB ARCHITECT:</strong> I'm designed to help you synthesize 100% complete hiring drives instantly.\n\n<strong>REQUIRED SPECIFICATIONS:</strong> To architect a precise Job Description, please ensure your prompt includes:\n\n1. ROLE NAME (e.g., Senior React Dev)\n2. SALARY RANGE (e.g., 12-15 LPA)\n3. EXPERIENCE (e.g., 4+ Years)\n4. WORK MODE (Remote, Hybrid, or On-site)\n5. DEPARTMENT (e.g., Engineering, Sales)\n\nTell me these details, and I'll build the full requirements, responsibilities, and technical skills for you.",
                }
            ]);
        }
        setIsLoaded(true);
    }, []);

    // Save to localStorage when messages change
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem("ai_chat_history", JSON.stringify(messages));
        }
    }, [messages, isLoaded]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
    }, [messages]);

    const clearChat = () => {
        const initial: Message[] = [
            {
                id: "1",
                role: "assistant" as const,
                content: "<strong>WELCOME TO THE AI JOB ARCHITECT:</strong> I'm designed to help you synthesize 100% complete hiring drives instantly.\n\n<strong>REQUIRED SPECIFICATIONS:</strong> To architect a precise Job Description, please ensure your prompt includes:\n\n1. ROLE NAME (e.g., Senior React Dev)\n2. SALARY RANGE (e.g., 12-15 LPA)\n3. EXPERIENCE (e.g., 4+ Years)\n4. WORK MODE (Remote, Hybrid, or On-site)\n5. DEPARTMENT (e.g., Engineering, Sales)\n\nTell me these details, and I'll build the full requirements, responsibilities, and technical skills for you.",
            }
        ];
        setMessages(initial);
        localStorage.removeItem("ai_chat_history");
    };

    const handleSend = async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText || isGenerating) return;

        const userMsg: Message = { id: Date.now().toString(), role: "user", content: messageText };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsGenerating(true);

        const thinkingMsgId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, { 
            id: thinkingMsgId, 
            role: "assistant", 
            content: "", 
            status: "thinking" 
        }]);

        try {
            const res = await fetch("/api/admin/create-drive/generate-jd", {
                method: "POST",
                body: JSON.stringify({ 
                    prompt: messageText,
                    history: messages
                }),
            });

            if (res.ok) {
                const data = await res.json();
                
                if (data.job_title === "INCOMPLETE_SPECIFICATIONS") {
                    setMessages(prev => [
                        ...prev.filter(m => m.status !== "thinking"),
                        {
                            id: (Date.now() + 1).toString(),
                            role: "assistant",
                            content: data.description,
                        }
                    ]);
                    setIsGenerating(false);
                    return;
                }

                setGeneratedJd(data);
                
                const jdSummary = `<strong>AI SYNTHESIS COMPLETE:</strong> I've architected a full Job Description for ${data.job_title}.

<strong>CORE DETAILS:</strong>
<strong>Role Name:</strong> ${data.role_name}
<strong>Department:</strong> ${data.department}
<strong>Experience:</strong> ${data.experience}
<strong>Salary:</strong> ${data.salary}
<strong>Mode:</strong> ${data.work_mode} (${data.employment_type})

<strong>IMPACT DESCRIPTION:</strong>
${data.description}

<strong>RESPONSIBILITIES:</strong>
${data.responsibilities.slice(0, 3).map((r: string) => `• ${r}`).join("\n")}

<strong>CANDIDATE REQUIREMENTS:</strong>
${data.candidate_requirements.slice(0, 3).map((req: string) => `• ${req}`).join("\n")}

<strong>KEY SKILLS:</strong>
• ${data.technical_skills.join(", ")}

Does this configuration look correct, or would you like me to adjust any specific fields?`;

                setMessages(prev => prev.map(m => m.id === thinkingMsgId ? { 
                    ...m, 
                    content: jdSummary, 
                    status: "done",
                    data: data
                } : m));
            } else {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || "The neural engine encountered an unexpected interruption.");
            }
        } catch (err: any) {
            setMessages(prev => prev.map(m => m.id === thinkingMsgId ? { 
                ...m, 
                content: `<strong>ERROR DURING SYNTHESIS:</strong> I was unable to complete your architecture. Reason: ${err.message}. Please try again or refine your prompt.`, 
                status: "error" 
            } : m));
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUseJd = (dataToUse: any) => {
        const jd = dataToUse || generatedJd;
        if (!jd) {
            console.error("No JD data found for sync");
            return;
        }

        console.log("AI Chat Sync - Initiating with data:", jd);

        const formattedData = {
           title: jd.job_title,
           role: jd.role_name,
           department: jd.department,
           workMode: jd.work_mode,
           employmentType: jd.employment_type,
           description: jd.description,
           salary: jd.salary,
           experience: jd.experience,
           skills: Array.isArray(jd.technical_skills) ? jd.technical_skills.join(", ") : jd.technical_skills,
           responsibilities: Array.isArray(jd.responsibilities) ? jd.responsibilities.join("\n") : jd.responsibilities,
           requirements: Array.isArray(jd.candidate_requirements) ? jd.candidate_requirements.join("\n") : jd.candidate_requirements,
           extractedDetails: jd
        };

        console.log("AI Chat Sync - Formatted Payload:", formattedData);
        localStorage.setItem("jd_draft", JSON.stringify(formattedData));
        router.push("/admin/create-drive?method=ai-chat");
    };

    return (
        <div className="fixed inset-0 md:left-[220px] z-40 flex flex-col bg-white overflow-hidden border-l border-gray-100 font-sans animate-entry-flow">
            {/* Header - Simple Premium Standard */}
            <header className="shrink-0 px-8 py-5 bg-white border-b border-gray-100 z-30 relative">
                <div className="max-w-2xl mx-auto w-full">
                    <div className="flex items-center justify-between mb-1">
                        <button 
                            onClick={() => router.push("/admin/create-drive")}
                            className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Back to Methods</span>
                        </button>

                        <button 
                            onClick={clearChat}
                            className="group flex items-center gap-2 text-gray-400 hover:text-orange-600 transition-colors"
                        >
                            <RefreshCcw className="h-3.5 w-3.5 transition-transform group-hover:rotate-180 duration-500" />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Reset Chat</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-1 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full" />
                        <div>
                            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
                                AI Job Architect
                            </h1>
                            <p className="text-gray-400 font-medium mt-0.5 text-xs">
                                Synthesize job descriptions and requirements using our pro neural engine.
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Chat Body - Scrolling Middle */}
            <main className="flex-1 relative overflow-hidden flex flex-col z-10 bg-[#FBFBFC]">
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar scroll-smooth"
                >
                    <div className="max-w-2xl mx-auto w-full space-y-6">
                        {messages.map((m) => (
                            <div 
                                key={m.id}
                                className={cn(
                                    "flex gap-3 animate-in-fade group",
                                    m.role === "user" ? "flex-row-reverse" : "flex-row"
                                )}
                            >
                                <div className={cn(
                                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border shadow-sm",
                                    m.role === "user" 
                                        ? "bg-gray-100 border-gray-200 text-gray-400" 
                                        : "bg-white border-gray-100 text-[#F97316]"
                                )}>
                                    {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                </div>

                                <div className={cn(
                                    "max-w-[85%] sm:max-w-[75%]",
                                    m.role === "user" ? "items-end text-right" : "items-start text-left"
                                )}>
                                    {m.status === "thinking" ? (
                                        <div className="bg-white border border-gray-100 p-3 rounded-xl rounded-tl-none shadow-sm flex items-center gap-3 w-max">
                                            <Loader2 className="h-3 w-3 animate-spin text-[#F97316]" />
                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none animate-pulse">AI is typing...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 w-full">
                                            <div 
                                                className={cn(
                                                    "p-4 rounded-xl shadow-sm whitespace-pre-wrap leading-relaxed text-[13px] transition-all",
                                                    m.role === "user" 
                                                        ? "bg-gray-950 text-white rounded-tr-none font-bold" 
                                                        : "bg-white text-gray-800 rounded-tl-none"
                                                )}
                                                dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, '<br />') }}
                                            />

                                            {m.data && (
                                                <div className="animate-in-slide-up pl-1 pt-2">
                                                    <button 
                                                        onClick={() => handleUseJd(m.data)}
                                                        className="h-10 px-6 rounded-lg bg-orange-500 text-white font-bold text-xs shadow-md hover:bg-orange-600 transition-all hover:scale-[1.02] active:scale-100 flex items-center gap-2"
                                                    >
                                                        <Rocket className="h-3.5 w-3.5" />
                                                        <span>Create Drive</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Area */}
                <div className="shrink-0 bg-white pt-6 pb-6 px-6 border-t border-gray-50 z-20">
                    <div className="max-w-2xl mx-auto w-full space-y-4">
                        {/* Suggestions */}
                        {messages.length === 1 && !isGenerating && (
                            <div className="flex flex-wrap gap-2 animate-in-fade justify-center">
                                {[
                                    "Senior React Developer, 4yrs exp",
                                    "Product Manager for Fintech",
                                    "Backend Dev, Python, $140k"
                                ].map(s => (
                                    <button 
                                        key={s} 
                                        onClick={() => handleSend(s)}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[10px] font-bold text-gray-400 hover:text-[#F97316] hover:border-[#F97316]/30 transition-all shadow-sm"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="relative group">
                            <div className="relative bg-white rounded-xl p-1 shadow-lg shadow-gray-200/40 flex items-center transition-all duration-300 focus-within:shadow-orange-500/10">
                                <div className="pl-4 text-gray-300">
                                    <MessageSquare className="h-4 w-4" />
                                </div>
                                <input 
                                    className="flex-1 bg-transparent border-none focus:ring-0 px-3 h-12 text-[13px] font-bold text-gray-900 placeholder:text-gray-300"
                                    placeholder="Describe requirements (e.g. Node.js Dev, 3yrs, Hybrid...)"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyPress={e => e.key === "Enter" && handleSend()}
                                />
                                <button 
                                    disabled={!input.trim() || isGenerating}
                                    onClick={() => handleSend()}
                                    className="h-10 px-5 rounded-lg bg-orange-500 text-white font-bold text-xs shadow-md hover:bg-orange-600 transition-all disabled:opacity-30 flex items-center gap-2"
                                >
                                    {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>Send</span>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #F1F5F9; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #E2E8F0; }

                @keyframes entry-flow {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-entry-flow { animation: entry-flow 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

                @keyframes slide-up {
                    from { transform: translateY(10px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-in-slide-up { animation: slide-up 0.4s ease-out forwards; }
                
                @keyframes fade {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-in-fade { animation: fade 0.3s ease-out forwards; }
            `}} />
        </div>
    );
}
