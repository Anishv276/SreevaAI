"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { escapeHtml, nl2br } from "@/lib/sanitize";
import {
    Sparkles, Send, Bot, User,
    ArrowLeft, CheckCircle2, Loader2,
    Zap, Rocket, MessageSquare,
    RefreshCcw, FileText, Check,
    Plus, ExternalLink, ChevronRight, ChevronLeft, X,
    BrainCircuit, Terminal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/components/ui/toast-custom";

type Message = {
    id: string;
    role: "assistant" | "user";
    content: string;
    data?: any;
    status?: "thinking" | "done" | "error";
    thinkingState?: string;
    options?: string[];
};

const GUIDED_STEPS = [
    {
        question: "Which department are we hiring for?",
        options: ["Engineering", "Product", "Sales", "Marketing", "Design", "HR", "Finance", "Operations"],
        key: "department"
    },
    {
        question: "What's the employment type?",
        options: ["Full-time", "Part-time", "Contract", "Internship"],
        key: "employmentType"
    },
    {
        question: "What's the required experience level?",
        options: ["Entry-level", "Mid-level", "Senior", "Lead / Manager"],
        key: "experience"
    },
    {
        question: "What's the preferred work mode?",
        options: ["Remote", "Hybrid", "On-site"],
        key: "workMode"
    }
];

const THINKING_STATES = [
    "Understanding role...",
    "Extracting requirements...",
    "Optimizing for reach...",
    "Analyzing market benchmarks...",
    "Synthesizing candidate profile...",
    "Architecting neural synthesis..."
];

const SUGGESTED_ROLES = [
    { text: "Senior React Developer", subtitle: "Frontend - 4+ years", icon: "⚛️" },
    { text: "Backend Engineer", subtitle: "Node.js + PostgreSQL", icon: "⚡" },
    { text: "Product Manager", subtitle: "B2B SaaS - Remote", icon: "📦" },
    { text: "UX Architect", subtitle: "Design Systems - Figma", icon: "🎨" },
];

export default function AiChatJdPage() {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [input, setInput] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [generatedJd, setGeneratedJd] = useState<any>(null);
    const [activeThinkingState, setActiveThinkingState] = useState(THINKING_STATES[0]);
    const [guidedStepIndex, setGuidedStepIndex] = useState(-1);
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
            // Default first message
            setMessages([
                {
                    id: "1",
                    role: "assistant" as const,
                    content: "Hey! Let's architect a high-impact Job Description. To start, which department are we hiring for?",
                    options: GUIDED_STEPS[0].options
                }
            ]);
            setGuidedStepIndex(0);
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
    }, [messages, isGenerating]);

    // Rotate thinking states when generating
    useEffect(() => {
        let interval: any;
        if (isGenerating) {
            let i = 0;
            interval = setInterval(() => {
                i = (i + 1) % THINKING_STATES.length;
                setActiveThinkingState(THINKING_STATES[i]);
            }, 1500);
        }
        return () => clearInterval(interval);
    }, [isGenerating]);

    const clearChat = () => {
        setMessages([
            {
                id: "1",
                role: "assistant" as const,
                content: "Hey! Let's architect a high-impact Job Description. To start, which department are we hiring for?",
                options: GUIDED_STEPS[0].options
            }
        ]);
        setGuidedStepIndex(0);
        localStorage.removeItem("ai_chat_history");
    };

    const handleSend = async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText || isGenerating) return;

        const userMsg: Message = { id: Date.now().toString(), role: "user", content: messageText };
        const updatedMessages = [...messages, userMsg];

        // Remove options from the previous assistant message once answered
        setMessages(prev => prev.map(m => m.role === "assistant" ? { ...m, options: undefined } : m));
        setMessages(prev => [...prev, userMsg]);
        setInput("");

        // Check for guided flow
        if (guidedStepIndex !== -1 && guidedStepIndex < GUIDED_STEPS.length - 1) {
            const nextStepIndex = guidedStepIndex + 1;
            setGuidedStepIndex(nextStepIndex);

            // Add thinking state briefly for realism
            setIsGenerating(true);
            setTimeout(() => {
                const nextStep = GUIDED_STEPS[nextStepIndex];
                const assistantMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: nextStep.question,
                    options: nextStep.options
                };
                setMessages(prev => [...prev, assistantMsg]);
                setIsGenerating(false);
            }, 600);
            return;
        }

        // If guided flow is finished or not started, call the API
        setGuidedStepIndex(-1);
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
                    history: updatedMessages
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
                            content: data.description || "I need a few more details to architect this role correctly. Please provide the missing fields.",
                        }
                    ]);
                    setIsGenerating(false);
                    return;
                }

                setGeneratedJd(data);

                setMessages(prev => prev.map(m => m.id === thinkingMsgId ? {
                    ...m,
                    content: "",
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

    const generateJdPdfBlob = async (jd: any): Promise<Blob> => {
        const element = document.createElement("div");
        element.style.padding = "40px";
        element.style.width = "794px";
        element.style.fontFamily = "Inter, sans-serif";
        element.style.background = "white";
        element.style.color = "#111827";

        element.innerHTML = `
            <div style="border-bottom: 2px solid #F97316; padding-bottom: 20px; margin-bottom: 30px;">
                <h1 style="font-size: 28px; font-weight: 900; margin: 0; letter-spacing: -0.025em;">${escapeHtml(jd.job_title)}</h1>
                <p style="color: #6B7280; font-weight: 700; text-transform: uppercase; font-size: 10px; margin-top: 8px; letter-spacing: 0.1em;">${escapeHtml(jd.department)}  ${escapeHtml(jd.work_mode)}</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                   <p style="font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; margin-bottom: 5px;">Experience</p>
                   <p style="font-weight: 700; font-size: 14px; margin: 0;">${escapeHtml(jd.experience)}</p>
                </div>
                <div>
                   <p style="font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; margin-bottom: 5px;">Compensation</p>
                   <p style="font-weight: 700; font-size: 14px; margin: 0;">${escapeHtml(jd.salary)}</p>
                </div>
            </div>

            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin-bottom: 12px;">Executive Summary</h2>
                <p style="font-size: 14px; line-height: 1.6; color: #374151;">${escapeHtml(jd.description)}</p>
            </div>

            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin-bottom: 12px;">Key Responsibilities</h2>
                <ul style="padding-left: 18px; margin: 0;">
                    ${jd.responsibilities.map((r: string) => `<li style="font-size: 13px; color: #374151; margin-bottom: 8px; line-height: 1.5;">${escapeHtml(r)}</li>`).join('')}
                </ul>
            </div>

            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin-bottom: 12px;">Required Technical Skills</h2>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${jd.technical_skills.map((s: string) => `<span style="background: #F3F4F6; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; color: #374151;">${escapeHtml(s)}</span>`).join('')}
                </div>
            </div>

            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin-bottom: 12px;">Candidate Profile</h2>
                <ul style="padding-left: 18px; margin: 0;">
                    ${jd.candidate_requirements.map((req: string) => `<li style="font-size: 13px; color: #374151; margin-bottom: 8px; line-height: 1.5;">${escapeHtml(req)}</li>`).join('')}
                </ul>
            </div>

            <div style="margin-top: 50px; border-top: 1px solid #F3F4F6; padding-top: 20px; text-align: center;">
                <p style="font-size: 10px; font-weight: 700; color: #D1D5DB; text-transform: uppercase; letter-spacing: 0.2em;">Created by Hirer AI Neural Engine</p>
            </div>
        `;

        document.body.appendChild(element);

        try {
            const canvas = await html2canvas(element, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL("image/png");

            const pdf = new jsPDF("p", "mm", "a4");
            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
            return pdf.output("blob");
        } finally {
            document.body.removeChild(element);
        }
    };

    const handleUseJd = async (dataToUse: any) => {
        const jd = dataToUse || generatedJd;
        if (!jd || isUploading) return;

        setIsUploading(true);

        try {
            const pdfBlob = await generateJdPdfBlob(jd);
            const fileName = `Assistant_JD_${jd.job_title.replace(/\s+/g, '_')}_${Date.now()}.pdf`;

            const formData = new FormData();
            formData.append("file", pdfBlob, fileName);
            formData.append("fileName", fileName);

            const uploadRes = await fetch("/api/admin/create-drive/upload-jd-pdf", {
                method: "POST",
                body: formData
            });

            if (!uploadRes.ok) throw new Error("Cloudflare R2 sync failed");

            const { url } = await uploadRes.json();

            const formattedData = {
                title: jd.job_title,
                role: jd.role_name || jd.job_title,
                department: jd.department,
                workMode: jd.work_mode,
                employmentType: jd.employment_type || "Full-time",
                location: jd.location || "",
                description: jd.description,
                salary: jd.salary,
                experience: jd.experience,
                jdFileName: fileName,
                jdPreviewUrl: url,
                skills: Array.isArray(jd.technical_skills) ? jd.technical_skills.join(", ") : (jd.technical_skills || ""),
                responsibilities: Array.isArray(jd.responsibilities) ? jd.responsibilities.join("\n") : (jd.responsibilities || ""),
                requirements: Array.isArray(jd.candidate_requirements) ? jd.candidate_requirements.join("\n") : (jd.candidate_requirements || ""),
                extractedDetails: {
                    ...jd,
                    perks: Array.isArray(jd.perks) ? jd.perks : [],
                },
            };

            localStorage.setItem("jd_draft", JSON.stringify(formattedData));
            router.push("/admin/create-drive?method=ai-chat");
        } catch (error) {
            console.error("Sync failed:", error);
            const formattedData = {
                title: jd.job_title,
                role: jd.role_name || jd.job_title,
                department: jd.department,
                workMode: jd.work_mode,
                employmentType: jd.employment_type || "Full-time",
                location: jd.location || "",
                description: jd.description,
                salary: jd.salary,
                experience: jd.experience,
                skills: Array.isArray(jd.technical_skills) ? jd.technical_skills.join(", ") : (jd.technical_skills || ""),
                responsibilities: Array.isArray(jd.responsibilities) ? jd.responsibilities.join("\n") : (jd.responsibilities || ""),
                requirements: Array.isArray(jd.candidate_requirements) ? jd.candidate_requirements.join("\n") : (jd.candidate_requirements || ""),
                extractedDetails: {
                    ...jd,
                    perks: Array.isArray(jd.perks) ? jd.perks : [],
                },
            };
            localStorage.setItem("jd_draft", JSON.stringify(formattedData));
            router.push("/admin/create-drive?method=ai-chat");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDownloadPdf = async (jd: any) => {
        if (!jd) return;
        const pdfBlob = await generateJdPdfBlob(jd);
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${jd.job_title.replace(/\s+/g, '_')}_JD.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 md:left-[220px] z-40 flex flex-col bg-[#FAFAFA] overflow-hidden border-l border-[#EAEAEA] font-inter antialiased selection:bg-orange-100 selection:text-orange-900">
            {/* Background Grain */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />

            {/* Header - Glassmorphism */}
            <AnimatePresence>
                {messages.length > 0 && (
                    <motion.header
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="shrink-0 px-8 py-4 bg-white/70 backdrop-blur-xl border-b border-[#EAEAEA] z-30 sticky top-0"
                    >
                        <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-white shadow-sm ring-1 ring-[#EAEAEA]">
                                    <img src="/avatars/ishitha.png" alt="Ishitha" className="h-full w-full object-cover" />
                                </div>
                                <div className="flex flex-col">
                                    <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">
                                        Create Drive
                                    </h1>
                                    <p className="text-[#888] font-medium text-[10px] uppercase tracking-widest mt-1">AI Assistant</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={clearChat}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-orange-500 hover:bg-orange-50 transition-all font-bold text-xs"
                                        title="Reset Chat"
                                    >
                                        <Plus className="h-4 w-4" />
                                        <span>New Chat</span>
                                    </button>
                                </div>
                                <div className="h-6 w-px bg-[#EAEAEA]" />
                                <div className="h-8">
                                    <img src="/Logo.png" alt="Company Logo" className="h-full object-contain opacity-80" />
                                </div>
                            </div>
                        </div>
                    </motion.header>
                )}
            </AnimatePresence>

            {/* Chat Area */}
            <main
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-6 pb-40 pt-8 custom-scrollbar scroll-smooth relative z-10"
            >
                <div className="max-w-4xl mx-auto w-full">
                    <AnimatePresence mode="wait">
                        {messages.length === 0 ? (
                            <motion.div
                                key="empty-state"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className="min-h-[75vh] flex flex-col items-center justify-center text-center"
                            >
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                    className="w-full"
                                >
                                    <div className="mb-8">
                                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
                                            Create your JD
                                        </h1>
                                        <p className="text-[#888] font-medium text-[12px] uppercase tracking-[0.3em]">
                                            HIRER AI NEURAL SYNTHESIS ONLINE
                                        </p>
                                    </div>

                                    <div className="relative w-full group mb-16">
                                        <div className="relative bg-white rounded-[20px] p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#EAEAEA] flex items-center transition-all duration-500 focus-within:shadow-[0_20px_50px_rgba(0,0,0,0.08)] focus-within:border-orange-200">
                                            <div className="pl-5 text-orange-400">
                                                <Sparkles className="h-5 w-5" />
                                            </div>
                                            <input
                                                className="flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 px-4 h-14 text-[16px] font-medium text-gray-900 placeholder:text-[#BBB]"
                                                placeholder="Job Title? Role? Or Just paste a JD link..."
                                                value={input}
                                                onChange={e => setInput(e.target.value)}
                                                onKeyPress={e => e.key === "Enter" && handleSend()}
                                            />
                                            <button
                                                disabled={!input.trim() || isGenerating}
                                                onClick={() => handleSend()}
                                                className="h-12 px-8 rounded-[14px] bg-gray-900 text-white font-bold text-sm transition-all hover:bg-black active:scale-95 disabled:opacity-50"
                                            >
                                                Create Drive
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 text-left">
                                        {SUGGESTED_ROLES.map((role, idx) => (
                                            <motion.button
                                                key={idx}
                                                whileHover={{ y: -4, boxShadow: "0 10px 25px rgba(0,0,0,0.05)", borderColor: "#F97316" }}
                                                onClick={() => handleSend(role.text)}
                                                className="p-5 rounded-[20px] bg-white border border-[#EAEAEA] transition-all duration-200 group text-left"
                                            >
                                                <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
                                                    {role.icon}
                                                </div>
                                                <h3 className="font-bold text-gray-900 text-sm mb-1">{role.text}</h3>
                                                <p className="text-[12px] text-[#888] font-medium">{role.subtitle}</p>
                                            </motion.button>
                                        ))}
                                    </div>
                                </motion.div>
                            </motion.div>
                        ) : (
                            <div className="space-y-8 pb-10">
                                {messages.map((m) => (
                                    <motion.div
                                        key={m.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "flex w-full",
                                            m.role === "user" ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        {m.role === "assistant" && (
                                            <div className="w-full flex items-start gap-3">
                                                <div className="h-8 w-8 rounded-full overflow-hidden border border-[#EAEAEA] shrink-0 mt-1">
                                                    <img src="/avatars/ishitha.png" alt="AI" className="h-full w-full object-cover" />
                                                </div>
                                                <div className="flex-1 space-y-4">
                                                    {m.content && (
                                                        <div className="max-w-[90%] bg-white border border-[#EAEAEA] p-4 rounded-[18px] rounded-tl-none shadow-sm text-[13px] leading-relaxed text-gray-800 font-medium animate-in-fade">
                                                            <div dangerouslySetInnerHTML={{ __html: nl2br(m.content).replace(/\*/g, '') }} />

                                                            {m.options && m.options.length > 0 && (
                                                                <div className="flex flex-wrap gap-2 mt-4">
                                                                    {m.options.map((opt, i) => (
                                                                        <button
                                                                            key={i}
                                                                            onClick={() => handleSend(opt)}
                                                                            className="px-4 py-2 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 text-sm font-bold transition-all hover:bg-orange-100 active:scale-95"
                                                                        >
                                                                            {opt}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {m.status === "thinking" && (
                                                        <div className="max-w-[90%] bg-white border border-orange-100 p-5 rounded-[18px] rounded-tl-none shadow-md flex flex-col gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
                                                                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Ishitha is {activeThinkingState.toLowerCase()}</p>
                                                            </div>
                                                            <div className="flex gap-1">
                                                                <span className="h-1.5 w-1.5 bg-orange-200 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                                <span className="h-1.5 w-1.5 bg-orange-200 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                                <span className="h-1.5 w-1.5 bg-orange-200 rounded-full animate-bounce" />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {m.data && m.data.job_title !== "INCOMPLETE_SPECIFICATIONS" && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 20 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            className="w-full bg-white rounded-[24px] border border-[#EAEAEA] shadow-[0_10px_40px_rgba(0,0,0,0.03)] overflow-hidden"
                                                        >
                                                            {/* Premium JD Card Header */}
                                                            <div className="p-5 border-b border-[#F9F9F9] bg-gradient-to-br from-white to-[#FAFAFA]">
                                                                <div className="flex justify-between items-start mb-3">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-1.5">
                                                                            <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[8px] font-bold uppercase tracking-widest rounded-md">Architected JD</span>
                                                                            <span className="h-1 w-1 rounded-full bg-gray-300" />
                                                                            <span className="text-[9px] text-gray-400 font-medium">{m.data.department}</span>
                                                                        </div>
                                                                        <h3 className="text-xl font-bold text-gray-900 tracking-tight">{m.data.job_title}</h3>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <span className="px-3 py-1.5 bg-gray-50 border border-[#EEE] rounded-full text-[11px] font-bold text-gray-600">{m.data.work_mode}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-6">
                                                                    <div>
                                                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Experience</p>
                                                                        <p className="text-[13px] font-bold text-gray-900">{m.data.experience}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Compensation</p>
                                                                        <p className="text-[13px] font-bold text-gray-900">{m.data.salary}</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* JD Content Sections */}
                                                            <div className="p-5 space-y-5">
                                                                <div>
                                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">The Mission</p>
                                                                    <p className="text-[12px] text-gray-600 leading-relaxed font-medium">{m.data.description}</p>
                                                                </div>

                                                                {m.data.responsibilities?.length > 0 && (
                                                                    <div>
                                                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-2">Core Focus Areas</p>
                                                                        <ul className="space-y-1.5">
                                                                            {m.data.responsibilities.map((r: string, i: number) => (
                                                                                <li key={i} className="flex gap-2.5 text-[11px] text-gray-600 font-medium">
                                                                                    <span className="text-orange-400 font-bold shrink-0 mt-0.5"></span>
                                                                                    {r}
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}

                                                                {m.data.technical_skills?.length > 0 && (
                                                                    <div>
                                                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-2">Neural Stack</p>
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            {m.data.technical_skills.map((s: string, i: number) => (
                                                                                <span key={i} className="px-2.5 py-1 bg-[#FDFDFD] border border-[#F0F0F0] rounded-md text-[10px] font-bold text-gray-600">{s}</span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Footer Actions */}
                                                            <div className="p-4 bg-[#FAFAFA] border-t border-[#EAEAEA] flex gap-2.5">
                                                                <button
                                                                    disabled={isUploading}
                                                                    onClick={() => handleUseJd(m.data)}
                                                                    className="flex-1 h-10 rounded-[10px] bg-gray-900 text-white font-bold text-[11px] transition-all hover:bg-black active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                                                >
                                                                    {isUploading ? (
                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    ) : (
                                                                        <Rocket className="h-3.5 w-3.5" />
                                                                    )}
                                                                    {isUploading ? "Syncing..." : "Initialize Drive"}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDownloadPdf(m.data)}
                                                                    className="h-10 px-4 rounded-[10px] border border-[#EAEAEA] bg-white text-gray-600 font-bold text-[11px] transition-all hover:border-gray-900 hover:text-gray-900 active:scale-95 flex items-center justify-center gap-2"
                                                                >
                                                                    <FileText className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {m.role === "user" && (
                                            <div className="max-w-[85%] flex items-start gap-3">
                                                <div className="flex-1 flex justify-end">
                                                    <div className="bg-gray-900 text-white p-3.5 rounded-[18px] rounded-tr-none shadow-lg text-[13px] font-bold">
                                                        {m.content}
                                                    </div>
                                                </div>
                                                <div className="h-7 w-7 rounded-full overflow-hidden border border-[#EAEAEA] shrink-0 mt-1 bg-white p-1">
                                                    <img src="/Logo.png" alt="User" className="h-full w-full object-contain" />
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* Input Bar - Floating at Bottom */}
            <AnimatePresence>
                {messages.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="shrink-0 p-8 pt-0 z-40 bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA] to-transparent sticky bottom-0"
                    >
                        <div className="max-w-4xl mx-auto w-full relative">
                            <div className="relative bg-white rounded-[24px] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-[#EAEAEA] flex items-center transition-all duration-300 focus-within:shadow-[0_25px_60px_rgba(0,0,0,0.1)] focus-within:border-orange-200">
                                <input
                                    className="flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 px-5 h-12 text-[13px] font-medium text-gray-900 placeholder:text-[#BBB]"
                                    placeholder="Refine requirements here..."
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyPress={e => e.key === "Enter" && handleSend()}
                                />
                                <button
                                    disabled={!input.trim() || isGenerating}
                                    onClick={() => handleSend()}
                                    className="h-14 w-14 rounded-[18px] bg-gray-900 text-white font-bold transition-all hover:bg-black active:scale-95 disabled:opacity-20 flex items-center justify-center"
                                >
                                    {isGenerating ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <ArrowLeft className="h-5 w-5 rotate-180" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                
                .font-inter { font-family: 'Inter', sans-serif; }

                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #EEE; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #DDD; }

                @keyframes fade {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-in-fade { animation: fade 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            `}} />
        </div>
    );
}
