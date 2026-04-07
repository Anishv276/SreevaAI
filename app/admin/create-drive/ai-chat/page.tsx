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
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

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
        setMessages([]);
        localStorage.removeItem("ai_chat_history");
    };

    const handleSend = async (text?: string) => {
        const messageText = text || input.trim();
        if (!messageText || isGenerating) return;

        const userMsg: Message = { id: Date.now().toString(), role: "user", content: messageText };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
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

    const handleUseJd = (dataToUse: any) => {
        const jd = dataToUse || generatedJd;
        if (!jd) {
            console.error("No JD data found for sync");
            return;
        }

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

        localStorage.setItem("jd_draft", JSON.stringify(formattedData));
        router.push("/admin/create-drive?method=ai-chat");
    };

    const handleDownloadPdf = async (jd: any) => {
        if (!jd) return;
        
        // Create an invisible element for capture
        const element = document.createElement("div");
        element.style.padding = "40px";
        element.style.width = "794px"; // A4 width in pixels at 96dpi
        element.style.fontFamily = "Inter, sans-serif";
        element.style.background = "white";
        element.style.color = "#111827";
        
        element.innerHTML = `
            <div style="border-bottom: 2px solid #F97316; padding-bottom: 20px; margin-bottom: 30px;">
                <h1 style="font-size: 28px; font-weight: 900; margin: 0; letter-spacing: -0.025em;">${jd.job_title}</h1>
                <p style="color: #6B7280; font-weight: 700; text-transform: uppercase; font-size: 10px; margin-top: 8px; letter-spacing: 0.1em;">${jd.department} • ${jd.work_mode}</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                   <p style="font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; margin-bottom: 5px;">Experience</p>
                   <p style="font-weight: 700; font-size: 14px; margin: 0;">${jd.experience}</p>
                </div>
                <div>
                   <p style="font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; margin-bottom: 5px;">Compensation</p>
                   <p style="font-weight: 700; font-size: 14px; margin: 0;">${jd.salary}</p>
                </div>
            </div>

            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin-bottom: 12px;">Executive Summary</h2>
                <p style="font-size: 14px; line-height: 1.6; color: #374151;">${jd.description}</p>
            </div>

            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin-bottom: 12px;">Key Responsibilities</h2>
                <ul style="padding-left: 18px; margin: 0;">
                    ${jd.responsibilities.map((r: string) => `<li style="font-size: 13px; color: #374151; margin-bottom: 8px; line-height: 1.5;">${r}</li>`).join('')}
                </ul>
            </div>

            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin-bottom: 12px;">Required Technical Skills</h2>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${jd.technical_skills.map((s: string) => `<span style="background: #F3F4F6; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; color: #374151;">${s}</span>`).join('')}
                </div>
            </div>

            <div style="margin-bottom: 30px;">
                <h2 style="font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #111827; margin-bottom: 12px;">Candidate Profile</h2>
                <ul style="padding-left: 18px; margin: 0;">
                    ${jd.candidate_requirements.map((req: string) => `<li style="font-size: 13px; color: #374151; margin-bottom: 8px; line-height: 1.5;">${req}</li>`).join('')}
                </ul>
            </div>

            <div style="margin-top: 50px; border-top: 1px solid #F3F4F6; padding-top: 20px; text-align: center;">
                <p style="font-size: 10px; font-weight: 700; color: #D1D5DB; text-transform: uppercase; letter-spacing: 0.2em;">Architected by Hirer.ai Neural Engine</p>
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
            pdf.save(`${jd.job_title.replace(/\s+/g, '_')}_JD.pdf`);
        } finally {
            document.body.removeChild(element);
        }
    };

    return (
        <div className="fixed inset-0 md:left-[220px] z-40 flex flex-col bg-white overflow-hidden border-l border-gray-100 font-sans animate-entry-flow">
            {/* Header - Transparent Modern Glassmorphism */}
            <header className="shrink-0 px-8 py-5 bg-white/80 backdrop-blur-md border-b border-gray-100 z-30 relative shadow-sm">
                <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 transform hover:scale-105 transition-all">
                            <Bot className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-1">
                                Hirer AI Architect
                            </h1>
                            <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest leading-none"> Neural Engine V2 </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button 
                            onClick={clearChat}
                            className="group flex items-center gap-2 px-4 py-2 rounded-xl text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-all duration-300"
                        >
                            <RefreshCcw className="h-4 w-4 transition-transform group-hover:rotate-180" />
                            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Reset</span>
                        </button>
                        <button 
                            onClick={() => {
                                clearChat();
                                router.push("/admin/create-drive");
                            }}
                            className="group flex items-center gap-3 px-8 py-3 rounded-xl border-2 border-gray-900 text-gray-900 font-bold hover:bg-gray-900 hover:text-white transition-all duration-500 shadow-xl shadow-gray-200/20 active:scale-95"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Exit Architect</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Chat Scroll Sanctuary */}
            <main 
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-6 pt-10 pb-32 space-y-12 bg-[#FDFDFF] custom-scrollbar scroll-smooth"
            >
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center -mt-20 px-8 animate-in-fade text-center max-w-2xl mx-auto">
                        <div className="h-24 w-24 rounded-[2.5rem] bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center text-white shadow-2xl shadow-orange-500/20 mb-10 transform scale-125">
                            <Bot className="h-12 w-12" />
                        </div>
                        <h2 className="text-5xl font-black text-gray-900 tracking-tighter leading-none mb-8">
                            Architect Your Vision
                        </h2>
                        <p className="text-gray-400 font-bold text-[11px] mb-16 uppercase tracking-[0.6em]">
                            Hirer Neural Synthesis Engine Online
                        </p>
                        <div className="w-full max-w-4xl group scale-110">
                            <div className="relative bg-white rounded-[3rem] p-3 shadow-[0_40px_100px_rgba(0,0,0,0.07)] border border-orange-100/40 flex items-center transition-all duration-700 hover:shadow-[0_40px_120px_rgba(249,115,22,0.1)] focus-within:border-orange-400 focus-within:shadow-[0_40px_120px_rgba(249,115,22,0.15)]">
                                <div className="pl-8 text-orange-400">
                                    <MessageSquare className="h-8 w-8" />
                                </div>
                                <input 
                                    className="flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none px-7 h-20 text-[20px] font-bold text-gray-900 placeholder:text-gray-300"
                                    placeholder="Brief your high-impact requirements..."
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyPress={e => e.key === "Enter" && handleSend()}
                                />
                                <button 
                                    disabled={!input.trim() || isGenerating}
                                    onClick={() => handleSend()}
                                    className="h-20 px-14 rounded-full text-white font-bold shadow-2xl transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden hover:scale-[1.02] active:scale-95 shrink-0"
                                    style={{
                                        background: "linear-gradient(135deg, #F97316, #ea6608)",
                                    }}
                                >
                                    <span className="text-[12px] font-black uppercase tracking-[0.3em]">Architect</span>
                                    <Zap className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        {/* High-Fidelity Suggestion Chips */}
                        <div className="w-full flex flex-col items-center gap-8 mt-24 animate-in-fade">
                            <div className="flex items-center gap-6 w-full max-w-2xl">
                                <div className="h-px bg-gray-100 flex-1" />
                                <p className="text-[11px] font-bold text-gray-300 uppercase tracking-[0.6em] whitespace-nowrap">Try a Blueprint</p>
                                <div className="h-px bg-gray-100 flex-1" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-5xl px-8">
                                {[
                                    "Senior React Developer, 4yrs exp, 12-15 LPA",
                                    "Product Manager for Fintech, Remote, Engineering",
                                    "Backend Engineer (Node.js), 5yrs, Bangalore Office",
                                    "HR Generalist, Hybrid, 3+ Years exp, Operations",
                                    "DevOps Specialist, AWS Infrastructure, $140k Range",
                                    "Sales Executive, B2B SaaS, 2yrs exp, Growth"
                                ].map(s => (
                                    <button 
                                        key={s} 
                                        onClick={() => handleSend(s)}
                                        className="px-8 py-5 rounded-3xl border border-gray-50 bg-white text-[14px] font-bold text-gray-400 hover:text-[#F97316] hover:border-orange-200 hover:shadow-[0_20px_40px_rgba(249,115,22,0.1)] transition-all duration-500 text-left flex items-center group/card shadow-sm"
                                    >
                                        <div className="h-2 w-2 rounded-full bg-gray-100 group-hover/card:bg-orange-400 mr-4 transition-colors" />
                                        <span className="flex-1">{s}</span>
                                        <ArrowLeft className="h-4 w-4 rotate-180 opacity-0 group-hover/card:opacity-100 transition-all translate-x-[-10px] group-hover/card:translate-x-0" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto w-full space-y-12">
                        {messages.map((m) => (
                        <div 
                            key={m.id}
                            className={cn(
                                "flex gap-6 animate-in-fade group",
                                m.role === "user" ? "flex-row-reverse" : "flex-row"
                            )}
                        >
                            <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border shadow-sm transition-all duration-500",
                                m.role === "user" 
                                    ? "bg-gray-900 border-gray-800 text-white text-xs font-black uppercase" 
                                    : "bg-white border-orange-50 text-[#F97316] group-hover:border-orange-200"
                            )}>
                                {m.role === "user" ? "ME" : <Bot className="h-5 w-5" />}
                            </div>

                            <div className={cn(
                                "max-w-[85%] sm:max-w-[80%] flex flex-col",
                                m.role === "user" ? "items-end" : "items-start"
                            )}>
                                {m.status === "thinking" ? (
                                    <div className="bg-white border border-orange-100 p-6 rounded-3xl rounded-tl-none shadow-2xl flex items-center gap-4 w-max">
                                        <div className="flex gap-1.5 items-center">
                                            <span className="h-2 w-2 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                            <span className="h-2 w-2 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                            <span className="h-2 w-2 bg-orange-400 rounded-full animate-bounce" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4 w-full">
                                        {/* Regular text message */}
                                        {m.content && (
                                            <div 
                                                className={cn(
                                                    "p-7 rounded-[2.5rem] text-[15px] leading-relaxed transition-all duration-500",
                                                    m.role === "user" 
                                                        ? "bg-gray-900 text-white rounded-tr-none font-bold shadow-2xl" 
                                                        : "bg-white text-gray-800 rounded-tl-none border border-gray-100 shadow-xl shadow-gray-200/20"
                                                )}
                                                dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, '<br />') }}
                                            />
                                        )}

                                        {/* Premium JD Card */}
                                        {m.data && m.data.job_title !== "INCOMPLETE_SPECIFICATIONS" && (
                                            <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl shadow-gray-200/30 overflow-hidden w-full animate-in-fade">
                                                {/* Card Header */}
                                                <div className="px-8 py-7 border-b border-gray-50" style={{ background: "linear-gradient(135deg, #fff7ed 0%, #fff 60%)" }}>
                                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                                        <div>
                                                            <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.3em] mb-2">Architect Complete</p>
                                                            <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-none">{m.data.job_title}</h3>
                                                            <p className="text-sm font-bold text-gray-400 mt-1">{m.data.role_name} · {m.data.department}</p>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            <span className="px-4 py-2 rounded-full bg-orange-100 text-orange-700 text-[11px] font-black uppercase tracking-widest">{m.data.work_mode}</span>
                                                            <span className="px-4 py-2 rounded-full bg-gray-100 text-gray-600 text-[11px] font-black uppercase tracking-widest">{m.data.employment_type}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-6 mt-5">
                                                        <div>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Experience</p>
                                                            <p className="text-[15px] font-black text-gray-900 mt-0.5">{m.data.experience}</p>
                                                        </div>
                                                        <div className="w-px bg-gray-100" />
                                                        <div>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Compensation</p>
                                                            <p className="text-[15px] font-black text-gray-900 mt-0.5">{m.data.salary}</p>
                                                        </div>
                                                        {m.data.location && (<>
                                                            <div className="w-px bg-gray-100" />
                                                            <div>
                                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</p>
                                                                <p className="text-[15px] font-black text-gray-900 mt-0.5">{m.data.location}</p>
                                                            </div>
                                                        </>)}
                                                    </div>
                                                </div>

                                                {/* Executive Summary */}
                                                <div className="px-8 py-6 border-b border-gray-50">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-3">Executive Summary</p>
                                                    <p className="text-[14px] text-gray-600 leading-relaxed font-medium">{m.data.description}</p>
                                                </div>

                                                {/* Responsibilities */}
                                                {m.data.responsibilities?.length > 0 && (
                                                    <div className="px-8 py-6 border-b border-gray-50">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Key Responsibilities</p>
                                                        <ul className="space-y-3">
                                                            {m.data.responsibilities.map((r: string, i: number) => (
                                                                <li key={i} className="flex gap-3 text-[13px] text-gray-700 font-medium leading-relaxed">
                                                                    <span className="h-5 w-5 rounded-full bg-orange-50 border border-orange-100 text-orange-500 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                                                                    {r}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Technical Skills */}
                                                {m.data.technical_skills?.length > 0 && (
                                                    <div className="px-8 py-6 border-b border-gray-50">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Required Skills</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {m.data.technical_skills.map((s: string, i: number) => (
                                                                <span key={i} className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-[12px] font-bold text-gray-600">{s}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Candidate Requirements */}
                                                {m.data.candidate_requirements?.length > 0 && (
                                                    <div className="px-8 py-6 border-b border-gray-50">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Candidate Profile</p>
                                                        <ul className="space-y-2.5">
                                                            {m.data.candidate_requirements.map((req: string, i: number) => (
                                                                <li key={i} className="flex gap-3 text-[13px] text-gray-700 font-medium leading-relaxed">
                                                                    <span className="text-orange-400 font-black mt-0.5">•</span>
                                                                    {req}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Perks */}
                                                {m.data.perks?.length > 0 && (
                                                    <div className="px-8 py-6 border-b border-gray-50">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Perks & Benefits</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {m.data.perks.map((p: string, i: number) => (
                                                                <span key={i} className="px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-[11px] font-bold text-emerald-700">{p}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Footer CTA */}
                                                <div className="px-8 py-5 bg-gray-50/50 flex flex-wrap gap-3">
                                                    <button 
                                                        onClick={() => handleUseJd(m.data)}
                                                        className="h-11 px-8 rounded-xl text-white font-bold text-[10px] uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
                                                        style={{ background: "linear-gradient(135deg, #F97316, #ea6608)", boxShadow: "0 10px 20px rgba(249,115,22,0.2)" }}
                                                    >
                                                        <Rocket className="h-4 w-4" />
                                                        <span>Add to Drive</span>
                                                        <ChevronRight className="h-4 w-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDownloadPdf(m.data)}
                                                        className="h-11 px-8 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-[10px] uppercase tracking-widest transition-all hover:border-gray-900 hover:text-gray-900 active:scale-95 flex items-center gap-3"
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                        <span>Download PDF</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Legacy action buttons fallback for non-JD data messages */}
                                        {m.data && m.data.job_title === "INCOMPLETE_SPECIFICATIONS" && (
                                            <div className="pl-4 pt-2"></div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    </div>
                )}
            </main>

            {/* Floating Interaction Sanctuary */}
            {messages.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 md:left-[220px] pointer-events-none p-8 z-40">
                    <div className="max-w-4xl mx-auto w-full flex flex-col items-center gap-6">
                        {/* Floating Input Pill */}
                        <div className="relative w-full pointer-events-auto group">
                            <div className="relative bg-white/80 backdrop-blur-2xl rounded-[2.5rem] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white flex items-center transition-all duration-500 focus-within:shadow-[0_20px_60px_rgba(249,115,22,0.15)] focus-within:border-orange-200">
                                <div className="pl-6 text-gray-400">
                                    <MessageSquare className="h-5 w-5" />
                                </div>
                                <input 
                                    className="flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 px-5 h-16 text-[16px] font-bold text-gray-900 placeholder:text-gray-300"
                                    placeholder="Refine requirements here..."
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyPress={e => e.key === "Enter" && handleSend()}
                                />
                                <button 
                                    disabled={!input.trim() || isGenerating}
                                    onClick={() => handleSend()}
                                    className="h-14 w-14 rounded-xl text-white font-bold shadow-lg transition-all duration-300 disabled:opacity-20 flex items-center justify-center overflow-hidden hover:scale-105 active:scale-95 shrink-0"
                                    style={{
                                        background: "linear-gradient(135deg, #F97316, #ea6608)",
                                    }}
                                >
                                    {isGenerating ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Zap className="h-5 w-5" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
