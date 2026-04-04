"use client";

import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Play, RotateCcw, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Terminal, Globe } from "lucide-react";

interface CodingQuestion {
    id: string;
    text: string;
    starterCode?: string;
    languageId: number; 
    testCases?: Array<{ input: string; expectedOutput: string }>;
}

interface CodingSandboxProps {
    questions: CodingQuestion[];
    onComplete: (responses: Record<string, string>) => void;
    onBack?: () => void;
}

const LANGUAGES = [
    { id: 63, name: "JavaScript", value: "javascript" },
    { id: 71, name: "Python", value: "python" },
    { id: 62, name: "Java", value: "java" },
    { id: 54, name: "C++", value: "cpp" },
];

export function CodingSandbox({ questions, onComplete, onBack }: CodingSandboxProps) {
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [codes, setCodes] = useState<Record<string, string>>({});
    const [outputs, setOutputs] = useState<Record<string, any>>({});
    const [isRunning, setIsRunning] = useState(false);
    const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);

    const currentQ = questions[currentQIndex];

    useEffect(() => {
        if (currentQ && !codes[currentQ.id]) {
            setCodes(prev => ({
                ...prev,
                [currentQ.id]: currentQ.starterCode || "// Write your code here..."
            }));
        }
    }, [currentQ]);

    const runCode = async () => {
        setIsRunning(true);
        const code = codes[currentQ.id];
        
        try {
            const response = await fetch("https://ce.judge0.com/submissions?base64_encoded=false&wait=true", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source_code: code,
                    language_id: selectedLang.id,
                    stdin: ""
                })
            });

            if (response.ok) {
                const result = await response.json();
                setOutputs(prev => ({ ...prev, [currentQ.id]: result }));
            } else {
                const errData = await response.json();
                throw new Error(errData.message || "Failed to execute code");
            }
        } catch (err: any) {
            setOutputs(prev => ({ ...prev, [currentQ.id]: { stdout: null, stderr: `Execution Error: ${err.message}`, compile_output: null } }));
        } finally {
            setIsRunning(false);
        }
    };

    const handleFinish = () => {
        onComplete(codes);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] bg-[#0A0C10] overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-[#0F1115]">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                        {onBack && (
                            <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl text-gray-400 transition-all hover:text-white">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}
                        <div>
                            <span className="text-[10px] font-black text-[#F97316] uppercase tracking-[0.2em] block mb-0.5">Assessment Phase</span>
                            <h3 className="text-white font-bold text-sm">Technical Challenge</h3>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 bg-black/40 p-1.5 rounded-2xl border border-white/5">
                        {questions.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentQIndex(idx)}
                                className={`px-4 py-1.5 rounded-xl font-black text-[11px] transition-all ${
                                    currentQIndex === idx 
                                    ? 'bg-white text-gray-900 shadow-xl' 
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                }`}
                            >
                                {idx + 1}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <select 
                        value={selectedLang.value}
                        onChange={(e) => setSelectedLang(LANGUAGES.find(l => l.value === e.target.value) || LANGUAGES[0])}
                        className="bg-[#16181D] border border-white/10 text-gray-300 text-[11px] font-bold rounded-xl px-4 py-2 outline-none focus:border-[#F97316]/50 transition-all appearance-none cursor-pointer hover:bg-[#1C1F26]"
                    >
                        {LANGUAGES.map(l => <option key={l.id} value={l.value}>{l.name}</option>)}
                    </select>

                    <button 
                        onClick={runCode}
                        disabled={isRunning}
                        className="flex items-center gap-2.5 px-6 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-50 shadow-lg shadow-green-900/20 active:scale-95"
                    >
                        {isRunning ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        Run Test
                    </button>

                    {currentQIndex === questions.length - 1 && (
                        <button 
                            onClick={handleFinish}
                            className="flex items-center gap-2.5 px-6 py-2 rounded-xl bg-[#F97316] hover:bg-orange-500 text-white font-black text-[11px] uppercase tracking-widest transition-all shadow-xl shadow-orange-900/20 active:scale-95 animate-in fade-in slide-in-from-right-4"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Finish Assessment
                        </button>
                    )}
                </div>
            </div>

            {/* Main Sandbox */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Question Details */}
                <div className="w-1/3 border-r border-white/5 overflow-y-auto p-10 bg-[#0F1115]/80 backdrop-blur-3xl custom-scrollbar">
                    <div className="space-y-8">
                        <div className="flex items-center gap-2.5 text-[#F97316] font-black text-[10px] uppercase tracking-[0.2em] bg-[#F97316]/5 w-fit px-3 py-1.5 rounded-lg border border-[#F97316]/10">
                            <Globe className="w-3.5 h-3.5" />
                            Challenge Description
                        </div>
                        <h2 className="text-2xl font-bold text-white leading-tight tracking-tight">
                            {currentQ?.text}
                        </h2>
                        <div className="prose prose-invert prose-orange max-w-none">
                            <p className="text-gray-400 font-medium leading-relaxed text-sm">
                                Implement the solution carefully. Ensure your code handles edge cases and follows the provided logic for optimal performance.
                            </p>
                            <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5 mt-8">
                                <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Terminal className="w-3.5 h-3.5 text-[#F97316]" />
                                    Requirements
                                </h4>
                                <ul className="text-gray-400 text-xs space-y-3 font-medium">
                                    <li className="flex gap-2">
                                        <div className="w-1 h-1 rounded-full bg-[#F97316] mt-1.5 shrink-0" />
                                        Write a complete, executable function.
                                    </li>
                                    <li className="flex gap-2">
                                        <div className="w-1 h-1 rounded-full bg-[#F97316] mt-1.5 shrink-0" />
                                        Use standard output for debugging.
                                    </li>
                                    <li className="flex gap-2">
                                        <div className="w-1 h-1 rounded-full bg-[#F97316] mt-1.5 shrink-0" />
                                        Test your solution against multiple cases.
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Editor & Console */}
                <div className="flex-1 flex flex-col bg-[#0A0C10]">
                    {/* Editor Area */}
                    <div className="flex-1 relative border-b border-white/5">
                        <Editor
                            height="100%"
                            language={selectedLang.value}
                            theme="vs-dark"
                            value={codes[currentQ?.id] || ""}
                            onChange={(val) => setCodes(prev => ({ ...prev, [currentQ?.id]: val || "" }))}
                            options={{
                                fontSize: 14,
                                fontWeight: "bold",
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 30 },
                                fontFamily: "JetBrains Mono, Menlo, Monaco, Lucida Console, monospace",
                                smoothScrolling: true,
                                cursorSmoothCaretAnimation: "on",
                                lineHeight: 24,
                            }}
                        />
                    </div>

                    {/* Console Output (Terminal) */}
                    <div className="h-2/5 flex flex-col bg-[#0F1115] border-t border-white/5 shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-3 bg-[#16181D] border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] opacity-80" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] opacity-80" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F] opacity-80" />
                                </div>
                                <div className="h-4 w-[1px] bg-white/10 mx-1" />
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-3.5 h-3.5 text-blue-400" />
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Debug Console</span>
                                </div>
                            </div>
                            {isRunning && (
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Executing...</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-8 font-mono text-xs custom-scrollbar bg-gradient-to-b from-[#0F1115] to-black">
                            {outputs[currentQ?.id] ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    {outputs[currentQ?.id].compile_output && (
                                        <div className="space-y-3">
                                            <p className="text-yellow-500/50 font-black uppercase text-[9px] tracking-[0.2em] flex items-center gap-2">
                                                <AlertCircle className="w-3.5 h-3.5" /> Compilation Results
                                            </p>
                                            <pre className="text-yellow-200/70 bg-yellow-500/5 p-5 rounded-2xl border border-yellow-500/10 whitespace-pre-wrap leading-relaxed">{outputs[currentQ?.id].compile_output}</pre>
                                        </div>
                                    )}

                                    {outputs[currentQ?.id].stdout && (
                                        <div className="space-y-3">
                                            <p className="text-green-500/50 font-black uppercase text-[9px] tracking-[0.2em] flex items-center gap-2">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Standard Output
                                            </p>
                                            <pre className="text-gray-300 bg-white/5 p-6 rounded-2xl border border-white/5 leading-relaxed whitespace-pre-wrap shadow-inner">{outputs[currentQ?.id].stdout}</pre>
                                        </div>
                                    )}

                                    {outputs[currentQ?.id].stderr && (
                                        <div className="space-y-3">
                                            <p className="text-red-500/50 font-black uppercase text-[9px] tracking-[0.2em] flex items-center gap-2">
                                                <AlertCircle className="w-3.5 h-3.5" /> Runtime Exception
                                            </p>
                                            <pre className="text-red-300 bg-red-500/5 p-6 rounded-2xl border border-red-500/10 leading-relaxed whitespace-pre-wrap">{outputs[currentQ?.id].stderr}</pre>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-6 pt-6 mt-4 border-t border-white/5 opacity-40">
                                        <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">
                                            Status: <span className="text-gray-300">{outputs[currentQ?.id].status?.description}</span>
                                        </div>
                                        <div className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">
                                            {outputs[currentQ?.id].time || "0.0"}s | {outputs[currentQ?.id].memory || "0"}KB
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-700 opacity-30 space-y-4">
                                    <div className="p-4 rounded-full bg-white/5 border border-white/5">
                                        <Terminal className="w-10 h-10" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">Live debug environment initialized</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
