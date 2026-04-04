"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ProctorMonitor } from "@/components/assessment/proctor-monitor";
import { ProctorObjectDetector } from "@/components/assessment/object-detector";
import { CodingSandbox } from "@/components/assessment/coding-sandbox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Timer, Send, ShieldCheck, AlertTriangle, ChevronRight } from "lucide-react";

export default function AssessmentPage() {
    const { id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [assessment, setAssessment] = useState<any>(null);
    const [responses, setResponses] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [started, setStarted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [assessmentPhase, setAssessmentPhase] = useState<'TEST' | 'CODING'>('TEST');
    const [isLocked, setIsLocked] = useState(true);

    // ── Proctoring State ─────────────────────────────────────────────
    // Using a ref to avoid stale closure issues in async submit
    const proctoringDataRef = useRef<{ tabSwitchCount: number; flags: any[] }>({
        tabSwitchCount: 0,
        flags: [],
    });
    const [proctoringData, setProctoringData] = useState({ tabSwitchCount: 0, flags: [] as any[] });

    // Webcam video ref shared between ProctorMonitor and ObjectDetector
    const videoRef = useRef<HTMLVideoElement>(null);

    // Keystroke Dynamics refs
    const keystrokeTimestamps = useRef<number[]>([]);
    const lastKeyTime = useRef<number>(0);

    // ── Event Batching Ref ───────────────────────────────────────────
    const eventBufferRef = useRef<any[]>([]);


    // ── Central flag handler ─────────────────────────────────────────
    const handleFlag = useCallback((type: string, reason: string, screenshot?: string) => {
        const flag = { 
            eventType: type, 
            reason, 
            severity: (type === "TabSwitch" || type === "MultipleFaces" || type === "PhoneDetected") ? "HIGH" : "MEDIUM",
            metadata: { screenshot },
            timestamp: new Date().toISOString() 
        };
        
        // 1. Update local state for immediate UI feedback (if needed)
        const updated = {
            tabSwitchCount: type === "TabSwitch"
                ? proctoringDataRef.current.tabSwitchCount + 1
                : proctoringDataRef.current.tabSwitchCount,
            flags: [...proctoringDataRef.current.flags, flag],
        };
        proctoringDataRef.current = updated;
        setProctoringData({ ...updated });

        // 2. Buffer for batched flush
        eventBufferRef.current.push(flag);
    }, [id, token]);

    // ── Batched Event Flushing (Every 5s) ────────────────────────────
    useEffect(() => {
        if (!started || completed) return;

        const flushEvents = async () => {
            if (eventBufferRef.current.length === 0) return;

            const batch = [...eventBufferRef.current];
            eventBufferRef.current = []; // Clear immediately to avoid duplicates

            try {
                await fetch(`/api/assessments/${id}/events?token=${token}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ events: batch })
                });
            } catch (err) {
                console.error("[PROCTORING_BATCH_FLUSH_FAILED]:", err);
                // Prepend failed batch back to buffer for retry
                eventBufferRef.current = [...batch, ...eventBufferRef.current];
            }
        };

        const interval = setInterval(flushEvents, 5000);
        return () => {
            clearInterval(interval);
            flushEvents(); // Final flush on cleanup
        };
    }, [started, completed, id, token]);



    // ── Timer ────────────────────────────────────────────────────────
    // NOTE: handleSubmit is defined below. We use a ref to avoid stale closures.
    const handleSubmitRef = useRef<(() => void) | null>(null);
    useEffect(() => {
        if (started && timeLeft !== null && timeLeft > 0) {
            const timer = setInterval(() => {
                setTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(timer);
        } else if (started && timeLeft === 0) {
            handleSubmitRef.current?.();
        }
    }, [started, timeLeft]);

    // ── Fetch Assessment ─────────────────────────────────────────────
    useEffect(() => {
        if (!id) return;
        fetch(`/api/assessments/${id}?token=${token}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    router.push("/careers");
                } else {
                    setAssessment(data);
                    if (data.drive.assessmentMode === 'CODING') {
                        setAssessmentPhase('CODING');
                    }
                    // Use the actual time limit from the drive config (converted from minutes to seconds)
                    const timeLimitSeconds = (data.drive.timeLimitMinutes || 22) * 60;
                    setTimeLeft(timeLimitSeconds);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Fetch error:", err);
                setLoading(false);
            });
    }, [id, router, token]);

    // ── Clipboard Paste Detection ────────────────────────────────────
    useEffect(() => {
        if (!started) return;
        const handlePaste = (e: ClipboardEvent) => {
            const text = e.clipboardData?.getData("text") ?? "";
            if (text.length > 20) {
                handleFlag("PasteDetected", `Candidate pasted ${text.length} characters into an answer field.`);
            }
        };
        document.addEventListener("paste", handlePaste);
        return () => document.removeEventListener("paste", handlePaste);
    }, [started]);

    // ── Keystroke Dynamics ────────────────────────────────────────────
    useEffect(() => {
        if (!started) return;
        const handleKeyDown = () => {
            const now = Date.now();
            const gap = lastKeyTime.current > 0 ? now - lastKeyTime.current : null;
            lastKeyTime.current = now;
            if (gap !== null) {
                keystrokeTimestamps.current.push(gap);
                if (keystrokeTimestamps.current.length > 20) keystrokeTimestamps.current.shift();
                const recent = keystrokeTimestamps.current.slice(-10);
                const avgGap = recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
                // Flag if average keystroke gap is < 30ms (impossible for humans)
                if (recent.length >= 10 && avgGap < 30) {
                    handleFlag("KeystrokeBurst", `Suspicious keystroke burst: avg gap ${Math.round(avgGap)}ms — potential automated text injection.`);
                    keystrokeTimestamps.current = [];
                }
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [started]);

    // ── Fullscreen + Window Lock ──────────────────────────────────────
    useEffect(() => {
        const handleLockChange = () => {
            if (completed || submitting) return; // Ignore once finished or finishing
            const fs = !!document.fullscreenElement;
            const focused = document.hasFocus();
            setIsLocked(fs && focused);
            if (started && (!fs || !focused)) {
                handleFlag(
                    !fs ? "FullscreenExit" : "WindowBlur",
                    !fs ? "Candidate exited full-screen mode." : "Candidate switched focus away from test."
                );
                // Lock body scroll when security violation occurs
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = 'auto';
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (started && e.key === "Escape") {
                // Browser handles Esc to exit FS, we react immediately
                setIsLocked(false);
                document.body.style.overflow = 'hidden';
            }
        };
        const handlePopState = (e: PopStateEvent) => {
            if (started) {
                window.history.pushState(null, "", window.location.href);
            }
        };

        document.addEventListener("fullscreenchange", handleLockChange);
        window.addEventListener("blur", handleLockChange);
        window.addEventListener("focus", handleLockChange);
        window.addEventListener("popstate", handlePopState);
        document.addEventListener("keydown", handleKeyDown);
        
        // Push initial state to block first back button click
        if (started) {
            window.history.pushState(null, "", window.location.href);
        }

        return () => {
            document.removeEventListener("fullscreenchange", handleLockChange);
            window.removeEventListener("blur", handleLockChange);
            window.removeEventListener("focus", handleLockChange);
            window.removeEventListener("popstate", handlePopState);
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = 'auto';
        };
    }, [started]);

    // ── Navigation Guard ─────────────────────────────────────────────
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (started) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [started]);

    // ── Handlers ─────────────────────────────────────────────────────
    const startAssessment = async () => {
        try {
            await document.documentElement.requestFullscreen();
            setStarted(true);
            // Record start time in database
            fetch(`/api/assessments/${id}?token=${token}`, { method: "POST" }).catch(err => console.error("Failed to record start time", err));
        } catch {
            setStarted(true);
            fetch(`/api/assessments/${id}?token=${token}`, { method: "POST" }).catch(err => console.error("Failed to record start time", err));
        }
    };

    const handleSubmit = useCallback(async (finalCodingResponses?: Record<string, string>) => {
        // Final flush of any pending events
        if (eventBufferRef.current.length > 0) {
            const batch = [...eventBufferRef.current];
            eventBufferRef.current = [];
            fetch(`/api/assessments/${id}/events?token=${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ events: batch })
            }).catch(e => console.error("Final flush failed", e));
        }

        setSubmitting(true);
        const allResponses = { ...responses, ...(finalCodingResponses || {}) };

        const formattedResponses = Object.entries(allResponses).map(([qId, val]) => ({
            questionId: qId,
            answer: val
        }));

        const res = await fetch(`/api/assessments/${id}/submit?token=${token}`, {
            method: "POST",
            body: JSON.stringify({
                responses: formattedResponses,
                proctoringData: proctoringDataRef.current  // always fresh
            })
        });

        if (res.ok) {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => console.error(err));
            }
            setCompleted(true);
        } else {
            alert("Failed to submit assessment.");
            setSubmitting(false);
        }
    }, [id, token, responses]);

    // Keep the ref in sync with the latest handleSubmit (to avoid stale closure in timer)
    useEffect(() => {
        handleSubmitRef.current = () => handleSubmit();
    }, [handleSubmit]);

    // ── Render: Loading ───────────────────────────────────────────────
    if (loading || !assessment) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    <p className="font-black text-gray-400 uppercase tracking-widest text-sm">Security Handshake...</p>
                </div>
            </div>
        );
    }

    // ── Render: Completed ─────────────────────────────────────────────
    if (completed) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
                <Card className="max-w-xl w-full p-12 rounded-[3.5rem] border-none shadow-2xl bg-white/90 backdrop-blur-2xl">
                    <div className="relative mb-10 inline-block">
                        <div className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center animate-pulse">
                            <ShieldCheck className="h-12 w-12 text-green-600" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-2 shadow-sm border border-green-50">
                            <Send className="h-5 w-5 text-green-500" />
                        </div>
                    </div>
                    <h1 className="text-4xl font-black text-gray-900 mb-6 tracking-tighter leading-tight">Assessment Successfully Submitted! 🎉</h1>
                    <p className="text-gray-600 text-lg mb-12 font-medium leading-relaxed">
                        Thank you for completing your assessment. Our team will review your performance and notify you for further interview notifications via email.
                    </p>
                    <Button
                        onClick={() => router.push("/careers")}
                        className="w-full h-18 py-8 rounded-[2rem] bg-gray-900 hover:bg-black text-white text-xl font-black shadow-xl transition-all hover:scale-105 active:scale-95"
                    >
                        Explore More Jobs
                    </Button>
                    <p className="mt-8 text-xs font-black text-gray-400 uppercase tracking-widest">Integrity Verification Complete</p>
                </Card>
            </div>
        );
    }

    // ── Render: Pre-start Screen ──────────────────────────────────────
    if (!started) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <Card className="max-w-2xl w-full p-10 rounded-[2.5rem] border-none shadow-2xl bg-white/80 backdrop-blur-xl">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-orange-100 rounded-2xl">
                            <ShieldCheck className="w-8 h-8 text-[#F97316]" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 leading-tight">Secure Assessment</h1>
                            <p className="text-gray-500 font-medium">{assessment.drive.title}</p>
                        </div>
                    </div>

                    <div className="space-y-6 mb-10">
                        <div className="p-6 bg-orange-50 rounded-3xl border border-orange-100">
                            <h3 className="font-bold text-[#F97316] mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Non-Negotiable Security Active
                            </h3>
                            <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside font-medium leading-relaxed">
                                <li>You have <strong>one attempt</strong> only.</li>
                                <li><strong>Full-screen mode</strong> will be activated and is mandatory.</li>
                                <li><strong>Webcam and microphone</strong> monitoring is active.</li>
                                <li>Tab switching, copy-pasting, and external help will be <strong>immediately flagged</strong>.</li>
                                <li>AI will analyze head movements, gaze, and audio during the test.</li>
                            </ul>
                        </div>
                        <Button
                            onClick={startAssessment}
                            className="w-full h-18 rounded-[2rem] bg-gray-900 hover:bg-black text-white font-black text-xl shadow-2xl shadow-gray-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Start My Assessment
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    // ── Render: Active Assessment ─────────────────────────────────────
    return (
        <div className={`min-h-screen ${assessmentPhase === 'CODING' ? 'bg-[#0A0C10] overflow-hidden' : 'bg-gray-50 pb-24'} relative transition-colors duration-500`}>

            {/* SECURITY OVERLAY when not locked */}
            {started && !isLocked && (
                <div className="fixed inset-0 z-[9999] bg-gray-900/98 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300 pointer-events-auto">
                    <div className="p-8 bg-red-100 rounded-full mb-10 animate-bounce">
                        <ShieldCheck className="w-20 h-20 text-red-600" />
                    </div>
                    <h2 className="text-5xl font-black text-white mb-6 uppercase tracking-tighter leading-none">Security Protocol Violated</h2>
                    <p className="text-red-200 text-xl mb-12 max-w-lg font-bold leading-relaxed">
                        Window switch or full-screen exit detected. This event has been recorded. Re-enter the secure environment immediately.
                    </p>
                    <Button
                        onClick={startAssessment}
                        className="h-24 px-16 rounded-[2rem] bg-white text-gray-900 hover:bg-gray-100 text-2xl font-black shadow-[0_20px_50px_rgba(255,255,255,0.2)] transition-all hover:scale-105"
                    >
                        RE-ENTER EXAM ENVIRONMENT
                    </Button>
                    <div className="mt-12 flex items-center gap-4 text-gray-500 font-bold tracking-widest uppercase text-sm">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Integrity Violation Logged
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    </div>
                </div>
            )}

            {/* Proctor Monitor — handles webcam, VAD audio, face landmarker */}
            <ProctorMonitor onFlag={handleFlag} />

            {/* Object Detector — headless, uses same video element via ref */}
            <ProctorObjectDetector videoRef={videoRef} onFlag={handleFlag} />

            <div className={`${started && !isLocked ? 'pointer-events-none select-none filter blur-sm' : ''} transition-all duration-300`}>
                {/* Header */}
            <div className={`sticky top-0 z-40 border-b px-8 h-20 flex items-center justify-between transition-all duration-500 ${
                assessmentPhase === 'CODING'
                ? 'bg-[#0F1115] border-white/5 shadow-2xl'
                : 'bg-white/80 backdrop-blur-xl border-gray-100'
            }`}>
                <div className="flex items-center gap-4">
                    <div className="h-10 w-1.5 bg-[#F97316] rounded-full" />
                    <div>
                        <h2 className={`font-black leading-none transition-colors ${assessmentPhase === 'CODING' ? 'text-white' : 'text-gray-900'}`}>
                            {assessment.drive.title}
                        </h2>
                        <span className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase">Phase 01: Secure Session</span>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-lg transition-colors shadow-sm ${
                        (timeLeft || 0) < 60 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-900'
                    }`}>
                        <Timer className="w-5 h-5" />
                        <span>
                            {timeLeft !== null
                                ? `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`
                                : "--:--"
                            }
                        </span>
                    </div>
                    {assessmentPhase === 'TEST' && (
                        assessment.drive.assessmentMode === 'BOTH' ? (
                            <Button
                                onClick={() => setAssessmentPhase('CODING')}
                                className="h-14 px-8 rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black shadow-lg animate-pulse"
                            >
                                Next: Coding Challenge
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Button>
                        ) : (
                            <Button
                                onClick={() => handleSubmit()}
                                disabled={submitting}
                                className="h-14 px-8 rounded-2xl bg-gray-900 hover:bg-black text-white font-black shadow-lg"
                            >
                                {submitting ? "Submitting..." : "Finish Test"}
                                <Send className="w-4 h-4 ml-2" />
                            </Button>
                        )
                    )}
                </div>
            </div>

            {/* Content Rendering */}
            {assessmentPhase === 'TEST' && (
            assessmentPhase === 'CODING' || assessment.drive.assessmentMode === 'CODING' ? (
                <CodingSandbox
                    questions={assessment.questions.filter((q: any) => q.type === 'CODING')}
                    onComplete={(codingResponses) => handleSubmit(codingResponses)}
                    onBack={assessment.drive.assessmentMode === 'BOTH' ? () => setAssessmentPhase('TEST') : undefined}
                />
            ) : (
                <main className="max-w-4xl mx-auto py-12 px-6">
                    <div className="space-y-12">
                        {assessment.questions.filter((q: any) => q.type !== 'CODING').map((q: any, i: number) => (
                            <Card key={q.id} className="p-10 rounded-[2.5rem] border-none shadow-sm hover:shadow-md transition-shadow bg-white">
                                <div className="flex gap-6">
                                    <span className="font-black text-5xl text-gray-100 leading-none select-none">0{i + 1}</span>
                                    <div className="flex-1 space-y-8">
                                        <h3 className="text-xl font-bold text-gray-800 leading-relaxed">{q.text}</h3>

                                        {q.type === 'MCQ' ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {(typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || [])).map((opt: string) => (
                                                    <button
                                                        key={opt}
                                                        onClick={() => setResponses({...responses, [q.id]: opt})}
                                                        className={`p-5 rounded-2xl text-left font-bold transition-all border-2 ${
                                                            responses[q.id] === opt
                                                            ? 'border-[#F97316] bg-orange-50 text-[#F97316]'
                                                            : 'border-gray-50 bg-gray-50 text-gray-600 hover:border-orange-100'
                                                        }`}
                                                    >
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : q.type === 'MAQ' ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {(typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || [])).map((opt: string) => {
                                                    const currentResponses = responses[q.id] ? responses[q.id].split("|||") : [];
                                                    const isSelected = currentResponses.includes(opt);
                                                    return (
                                                        <button
                                                            key={opt}
                                                            onClick={() => {
                                                                let newResponses = [...currentResponses];
                                                                if (isSelected) {
                                                                    newResponses = newResponses.filter(r => r !== opt);
                                                                } else {
                                                                    newResponses.push(opt);
                                                                }
                                                                setResponses({...responses, [q.id]: newResponses.join("|||")});
                                                            }}
                                                            className={`p-5 rounded-2xl text-left font-bold transition-all border-2 flex items-center justify-between group ${
                                                                isSelected
                                                                ? 'border-[#F97316] bg-orange-50 text-[#F97316]'
                                                                : 'border-gray-50 bg-gray-50 text-gray-600 hover:border-orange-100'
                                                            }`}
                                                        >
                                                            <span>{opt}</span>
                                                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                                isSelected ? 'bg-[#F97316] border-[#F97316]' : 'border-gray-200 group-hover:border-orange-200'
                                                            }`}>
                                                                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <textarea
                                                placeholder="Write your detailed response here..."
                                                className="w-full h-48 p-6 rounded-3xl bg-gray-50 border-2 border-transparent focus:border-orange-100 focus:bg-white outline-none transition-all font-medium text-gray-700 leading-relaxed"
                                                value={responses[q.id] || ""}
                                                onChange={(e) => setResponses({...responses, [q.id]: e.target.value})}
                                            />
                                        )}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </main>
            ))}
            </div>
        </div>
    );
}
