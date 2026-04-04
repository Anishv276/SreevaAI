"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Terminal, ChevronRight, MessageSquare, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function CandidateAnswersPage() {
    const params = useParams();
    const router = useRouter();
    const [candidate, setCandidate] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCandidate = async () => {
            try {
                // Must unwrap params in Next.js 15+ 
                // but useParams returns an object where values are strings or array of strings.
                // In a client component wrapped in useEffect it's safe to just use params.id directly
                const id = params.id as string;
                const response = await fetch(`/api/candidates/${id}`);
                const data = await response.json();
                setCandidate(data);
            } catch (error) {
                console.error("Failed to fetch candidate details", error);
            } finally {
                setLoading(false);
            }
        };

        if (params?.id) {
            fetchCandidate();
        }
    }, [params]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center text-gray-400 font-bold uppercase tracking-widest text-sm animate-pulse">Loading Answers...</div>;
    }

    if (!candidate || !candidate.assessment) {
        return <div className="min-h-screen flex items-center justify-center text-red-500 font-bold uppercase tracking-widest text-sm">No Answers Found</div>;
    }

    const ar = candidate.assessment.aiReport ? (() => {
        try { return JSON.parse(candidate.assessment.aiReport); } catch { return null; }
    })() : null;

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto space-y-12">
                
                {/* Header Navigation: Premium */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-6">
                        <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-14 w-14 rounded-2xl hover:bg-gray-50 border-gray-100 transition-all" 
                            onClick={() => router.back()}
                        >
                            <ArrowLeft className="h-6 w-6 text-gray-400" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{candidate.fullName}'s <span className="text-indigo-600">Submissions</span></h1>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-indigo-100 text-indigo-600">Assessment Complete</Badge>
                                <span className="text-gray-300 text-xs text-bold">/</span>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">AI Evaluated Results</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Overall Performance</p>
                            <p className="text-2xl font-black text-indigo-600 leading-none mt-1">{ar?.overallScore || 0}%</p>
                        </div>
                        <div className="h-12 w-[1px] bg-gray-100 mx-2 hidden md:block" />
                        <div className="bg-gray-50 px-6 py-3 rounded-2xl border border-gray-100">
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Session Time</p>
                             <p className="text-sm font-black text-gray-900">{ar?.timeTaken || "N/A"}</p>
                        </div>
                    </div>
                </div>

                {/* Question-by-Question Breakdown: Premium Cards */}
                <div className="space-y-8">
                    <div className="flex items-center gap-4 pl-4">
                        <div className="h-2 w-12 bg-indigo-600 rounded-full" />
                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter italic">Deep Dive Evaluation</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        {ar && (ar.questionBreakdown ?? []).length > 0 ? (
                            (ar.questionBreakdown ?? []).map((item: any, i: number) => {
                                const isCoding = item.type === "CODING";
                                const isGood = ["Correct", "Good explanation", "Correct answer", "Insightful"].some(s => item.evaluation?.includes(s));
                                const isPartial = ["Partial", "Weak", "Needs Improvement"].some(s => item.evaluation?.includes(s));
                                
                                return (
                                    <div key={i} className="group relative bg-white rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden">
                                        <div className="absolute top-0 left-0 w-2 h-full transition-all group-hover:w-4" 
                                            style={{ backgroundColor: isGood ? '#10B981' : isPartial ? '#F59E0B' : '#EF4444' }} 
                                        />
                                        
                                        <div className="p-10 pl-14">
                                            {/* Meta & Score */}
                                            <div className="flex items-center justify-between mb-8">
                                                <div className="flex items-center gap-3">
                                                    <span className="h-10 w-10 rounded-xl bg-gray-900 text-white flex items-center justify-center text-xs font-black">
                                                        {i + 1}
                                                    </span>
                                                    <Badge variant="outline" className="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border-gray-100 bg-gray-50 text-gray-500">
                                                        {item.type}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Score</p>
                                                        <p className="text-lg font-black text-gray-900 leading-none">{item.score || 0}%</p>
                                                    </div>
                                                    <div className={cn(
                                                        "px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm",
                                                        isGood ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : 
                                                        isPartial ? "bg-amber-50 text-amber-600 border border-amber-100" : 
                                                        "bg-rose-50 text-rose-600 border border-rose-100"
                                                    )}>
                                                        {item.evaluation}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Question Text */}
                                            <div className="mb-10">
                                                <p className="text-2xl font-bold text-gray-800 leading-tight tracking-tight">
                                                    {item.questionText}
                                                </p>
                                            </div>

                                            {/* Response Block */}
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">Candidate Response</p>
                                                    <div className="h-[1px] flex-1 bg-gray-100" />
                                                </div>
                                                
                                                {isCoding ? (
                                                    <div className="rounded-[2.5rem] border border-white/10 bg-[#0A0C10] overflow-hidden shadow-2xl relative group/code">
                                                        <div className="px-8 py-4 border-b border-white/5 flex items-center justify-between bg-[#111319]">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex gap-1.5">
                                                                    <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                                                                    <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                                                                    <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                                                                </div>
                                                                <span className="text-[10px] font-bold text-gray-500 font-mono uppercase tracking-widest ml-4">main.js</span>
                                                            </div>
                                                            <Terminal className="w-4 h-4 text-gray-700" />
                                                        </div>
                                                        <div className="p-10 overflow-x-auto custom-scrollbar">
                                                            <pre className="text-[14px] font-mono text-indigo-300 leading-relaxed">
                                                                <code>{item.candidateAnswer || "// No code submitted."}</code>
                                                            </pre>
                                                        </div>
                                                        <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover/code:opacity-100 transition-opacity pointer-events-none" />
                                                    </div>
                                                ) : (
                                                    <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 relative group/ans">
                                                        <p className="text-lg font-medium text-gray-700 leading-relaxed whitespace-pre-wrap relative z-10">
                                                            {item.candidateAnswer || "No response provided."}
                                                        </p>
                                                        <div className="absolute top-4 right-8 opacity-10">
                                                            <MessageSquare className="w-12 h-12 text-gray-900" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-20 text-center bg-white rounded-[3rem] border border-gray-100 shadow-sm space-y-4">
                                <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                                    <Target className="w-10 h-10 text-gray-200" />
                                </div>
                                <div>
                                    <p className="text-xl font-bold text-gray-900">No submission data found</p>
                                    <p className="text-sm text-gray-500 max-w-xs mx-auto mt-2 italic">The AI report or question breakdown has not been generated for this candidate yet.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
