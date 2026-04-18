import os

file_path = r'c:\Users\vamsi\OneDrive\Desktop\HR-updates\app\admin\candidates\[id]\page.tsx'

new_interview_block = """                    {activeTab === "interview" && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-3 duration-700 pb-20 bg-[#F7F6F3] -mx-8 px-12 pt-16">
                            
                            {/* ── Section: Performance Analysis ── */}
                            <div className="space-y-12">
                                <div className="flex flex-col items-center gap-2 text-center mb-4">
                                    <h2 className="text-3xl font-bold text-slate-950 tracking-tight font-sans uppercase">Performance Analysis</h2>
                                    <div className="h-1 w-20 bg-indigo-600 rounded-full" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
                                    {/* communication */}
                                    <div className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm space-y-6 flex flex-col scale-[0.98] origin-top-left">
                                        <h3 className="text-[18px] font-bold text-gray-900 font-sans tracking-tight">Communication Analysis</h3>
                                        <div className="flex justify-center py-2 flex-1 items-center">
                                            <CommunicationDonutChart
                                                metrics={[
                                                    { label: "CLARITY", value: 60, color: "#6366F1" },
                                                    { label: "FLUENCY", value: 35, color: "#F59E0B" },
                                                    { label: "GRAMMAR", value: 30, color: "#10B981" },
                                                    { label: "DEPTH", value: 45, color: "#F43F5E" }
                                                ]}
                                            />
                                        </div>
                                        <div className="p-5 rounded-[24px] bg-[#FAF9F6] border border-[#F5E6D3]/30 space-y-2">
                                            <p className="text-[9px] font-bold text-[#A89078] uppercase tracking-[0.3em]">CEFR RATING</p>
                                            <h4 className="text-xl font-bold text-[#8B5E3C] tracking-tight">B1 — Intermediate</h4>
                                            <p className="text-[15px] font-medium text-gray-500 leading-relaxed">
                                                Can handle simple direct exchanges. Frequent grammatical errors and choppy fluency prevent B2. Insufficient for a senior role requiring complex technical explanation.
                                            </p>
                                        </div>
                                    </div>

                                    {/* video */}
                                    <div className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm flex flex-col space-y-5 scale-[0.98] origin-top-right">
                                        <h3 className="text-[18px] font-bold text-gray-900 font-sans tracking-tight">Interview Recording</h3>
                                        
                                        <div className="space-y-6 flex-1 flex flex-col">
                                            <div className="aspect-video w-full rounded-[24px] border-[5px] border-gray-900 bg-black overflow-hidden shadow-2xl relative">
                                            {interviewRecordingUrl ? (
                                                <Plyr
                                                    key={interviewRecordingUrl}
                                                    source={{
                                                        type: "video",
                                                        sources: [{ src: interviewRecordingUrl, type: "video/mp4" }],
                                                    }}
                                                    options={{
                                                        duration: recordingDurationSec || undefined,
                                                        controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "captions", "settings", "pip", "fullscreen"],
                                                    }}
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-gray-500 text-[10px] font-bold uppercase tracking-widest bg-gray-900/50">Video Loading...</div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-[20px] bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                                                <div className="flex items-center gap-2 text-[#6366F1]">
                                                    <Calendar className="h-4 w-4" />
                                                    <span className="text-[8px] font-bold uppercase tracking-widest">Total duration</span>
                                                </div>
                                                <p className="text-lg font-bold text-gray-900 leading-none">{recordingDurationSec ? formatDuration(recordingDurationSec) : "--:--min"}</p>
                                            </div>
                                            <div className="p-4 rounded-[20px] bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                                                <div className="flex items-center gap-2 text-[#F97316]">
                                                    <MessageSquare className="h-4 w-4" />
                                                    <span className="text-[8px] font-bold uppercase tracking-widest">Words Spoken</span>
                                                </div>
                                                <p className="text-lg font-bold text-gray-900 leading-none">{wordCount > 0 ? wordCount.toLocaleString() : "N/A"}</p>
                                            </div>
                                        </div>
                                        <div className="py-1 text-center">
                                            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.4em]">Secure Cloudflare R2 Recording</p>
                                        </div>
                                    </div>
                                    <div className="h-2" /> {/* Spacer */}
                                </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch max-w-[1400px] mx-auto">
                                    {/* Section 1: JD Skills (Top Left) */}
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">
                                        <div className="flex items-center justify-between mb-8">
                                            <h3 className="text-[16px] font-bold text-gray-900 font-sans tracking-tight">Did the Interview Prove JD Skills?</h3>
                                            <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-1">
                                            {[
                                                { title: "Cycle detection in graphs", subtitle: "So is it totally based on coding? — deflected", confidence: "HIGH — NO ATTEMPT", score: "0/10", status: "NOT PROVED" },
                                                { title: "Graph traversal (BFS / DFS)", subtitle: "Not reached — session ended early", confidence: "N/A — NOT TESTED", score: "0/10", status: "NOT TESTED" },
                                                { title: "Edge case handling", subtitle: "Not reached — session ended early", confidence: "N/A — NOT TESTED", score: "0/10", status: "NOT TESTED" },
                                                { title: "Problem-solving approach", subtitle: "Actually, I'm not good at coding.", confidence: "HIGH — SELF-DECLARED", score: "0/10", status: "NOT PROVED" },
                                                { title: "Communication clarity", subtitle: "Basic exchanges functional, grammar poor", confidence: "HIGH — FULL DATA", score: "5/10", status: "PARTIAL" }
                                            ].map((s, i) => (
                                                <AssessmentCard key={i} {...s as any} />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Section 2: Transcript (Top Right) */}
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex flex-col gap-1">
                                                <h3 className="text-[16px] font-bold text-gray-900 font-sans tracking-tight">Full Session Log</h3>
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span className="text-[10px] font-sans font-bold text-emerald-600 uppercase tracking-widest">Secure Audit Mode</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center p-1 bg-gray-50 rounded-2xl border border-gray-100">
                                                <button 
                                                    onClick={() => setLogTab("chat")}
                                                    className={cn(
                                                        "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                                                        logTab === "chat" ? "bg-white text-indigo-600 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"
                                                    )}
                                                >
                                                    Chat
                                                </button>
                                                <button 
                                                    onClick={() => setLogTab("analysis")}
                                                    className={cn(
                                                        "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                                                        logTab === "analysis" ? "bg-white text-indigo-600 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"
                                                    )}
                                                >
                                                    Analysis
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-4 pt-4 scroll-smooth">
                                            {logTab === "chat" ? (
                                                [
                                                    { role: "ai", name: "Ishita", text: "Hey Vamsi Test Applicant, welcome! Really glad you could make it today. I'm Ishita, and I'll be having a conversation with you about the GTM Engineer role. How are you doing today?" },
                                                    { role: "candidate", name: candidate.fullName, text: "Wait... is it based on coding? I thought this was for GTM." },
                                                    { role: "ai", name: "Ishita", text: "It's a GTM Engineer role, so it involves both technical implementation and strategy. Let's start with something fundamental." },
                                                    { role: "candidate", name: candidate.fullName, text: "Actually, to be honest, I'm not good at coding. I handle the strategy side mostly." },
                                                    { role: "ai", name: "Ishita", text: "I appreciate the honesty. Let's look at how you approach tool integration then. Have you worked with n8n or Apollo?" },
                                                    { role: "candidate", name: candidate.fullName, text: "I've used them, but... let's see how it goes." }
                                                ].map((m, i) => (
                                                    <ChatEntry key={i} {...m} />
                                                ))
                                            ) : (
                                                [
                                                    { qNumber: "QUESTION 01", question: "How would you implement a cycle detection algorithm in a graph for a custom workflow engine?", reasoning: "Candidate immediately deflected technical depth. Question was avoided entirely.", depth: "SHALLOW — NO SIGNAL", score: "0/10" },
                                                    { qNumber: "QUESTION 02", question: "Can you explain the difference between BFS and DFS in the context of data synchronization?", reasoning: "Candidate stated they are 'not good at coding'. Core competency mismatch identified.", depth: "N/A — SELF-DECLARED", score: "0/10" },
                                                    { qNumber: "QUESTION 03", question: "How do you handle edge cases in a recursive script for directory processing?", reasoning: "Attempt aborted by AI due to previous declaration of coding deficiency.", depth: "N/A — NOT TESTED", score: "0/10" },
                                                    { qNumber: "QUESTION 04", question: "What is your experience with tool integration platforms like n8n or Apollo?", reasoning: "Vague response provided. Minimal evidence of strategic tool orchestration depth.", depth: "PARTIAL — WEAK SIGNAL", score: "4/10" }
                                                ].map((q, i) => (
                                                    <AnalysisEntry key={i} {...q} />
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Section 3: Consistency Check (Bottom Left) */}
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">
                                        <h3 className="text-[16px] font-bold text-gray-900 font-sans tracking-tight mb-8">Resume claims vs Interview proof — consistency check</h3>
                                        <div className="grid grid-cols-[1.5fr_1.8fr_120px] gap-6 px-6 mb-6 border-b border-gray-50 pb-6">
                                            <span className="text-[11px] font-bold text-gray-900 font-sans uppercase tracking-widest opacity-70">Resume Claimed</span>
                                            <span className="text-[11px] font-bold text-gray-900 font-sans uppercase tracking-widest opacity-70">Interview Showed</span>
                                            <span className="text-[11px] font-bold text-gray-900 font-sans uppercase tracking-widest opacity-70 text-center">Result</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                                            {[
                                                { claim: "Built GTM automation systems at Niti AI", sub: "GTM strategy", proof: "Zero GTM knowledge demonstrated. Could not answer basic GTM question.", status: "MISMATCH" },
                                                { claim: "n8n, Zapier, Apollo automation experience", sub: "Automation tools", proof: "Not tested in interview — role needed coding.", status: "NOT TESTED" },
                                                { claim: "Python, Pandas, Power BI — data analysis", sub: "Technical skills", proof: "Self-declared 'not good at coding.' No code written.", status: "CONTRADICTED" },
                                                { claim: "Problem-solving and analytical thinking", sub: "Soft skill", proof: "Minimal engagement with problem. Disengaged.", status: "WEAK SIGNAL" }
                                            ].map((c, i) => (
                                                <div key={i} className="grid grid-cols-[1.5fr_1.8fr_120px] gap-8 px-6 py-6 rounded-3xl hover:bg-gray-50/50 transition-all group items-start border-b border-gray-50 last:border-0 relative">
                                                    <div className="space-y-2">
                                                        <p className="text-[14px] font-bold text-gray-900 leading-tight">{c.claim}</p>
                                                        <p className="text-[9px] font-bold text-[#6366F1] uppercase tracking-widest">FIELD: {c.sub}</p>
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <ArrowRight className="h-4 w-4 text-gray-200 mt-1 shrink-0 group-hover:text-indigo-400 transition-colors" />
                                                        <p className={cn("text-[13px] font-semibold leading-relaxed", 
                                                            c.status === "CONTRADICTED" || c.status === "MISMATCH" ? "text-rose-600" : 
                                                            c.status === "WEAK SIGNAL" ? "text-orange-700" : "text-gray-400 italic"
                                                        )}>
                                                            {c.proof}
                                                        </p>
                                                    </div>
                                                    <div className="flex justify-center">
                                                        <span className={cn("px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest border shadow-sm",
                                                            c.status === "MATCHED" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                                            c.status === "CONTRADICTED" || c.status === "MISMATCH" ? "bg-rose-50 text-rose-600 border-rose-100" : 
                                                            "bg-[#FFFBEB] text-[#B45309] border-[#FEF3C7]"
                                                        )}>{c.status.replace('_', ' ')}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Section 4: Key Moments (Bottom Right) */}
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">
                                        <h3 className="text-[16px] font-bold text-gray-900 font-sans tracking-tight mb-8">Key Moments From Session</h3>
                                        <div className="flex grid grid-cols-[80px_1fr] px-6 mb-6 border-b border-gray-50 pb-6 mt-[-10px]">
                                            <span className="text-[11px] font-bold text-gray-900 font-sans uppercase tracking-widest opacity-70">Timeline</span>
                                            <span className="text-[11px] font-bold text-gray-900 font-sans uppercase tracking-widest opacity-70">Key Observation</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-2">
                                            {[
                                                { time: "0:38", type: "CONTEXT", observation: "Minimal engagement at interview start", comment: "Yeah. Sure. - two-word response to interview structure explanation" },
                                                { time: "1:12", type: "FLAG", observation: "Deflected technical question — asked about format instead", comment: "K. So is it totally based on coding? - avoidance rather than engagement" },
                                                { time: "1:18", type: "FLAG", observation: "Tab switch detected — at exact moment of deflection", comment: "Proctoring: browser focus lost ~8 sec. Timing aligns with Q1 avoidance behaviour." },
                                                { time: "2:28", type: "CRITICAL", observation: "Self-declared inability to code — defining moment of session", comment: "Actually, I'm not good at coding. - unprompted, direct self-admission" },
                                                { time: "3:05", type: "FLAG", observation: "Audio anomaly detected — 3 seconds post-admission", comment: "Voice-like sound. Flagged for correlation." }
                                            ].map((m, i) => (
                                                <MomentEntry key={i} {...m as any} />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* ── Section: Integrity & Proctoring ── */}
                                <div className="pt-24 border-t border-gray-200 mt-24 space-y-12">
                                    <div className="flex flex-col items-center gap-2 text-center mb-8">
                                        <h2 className="text-3xl font-bold text-slate-950 tracking-tight font-sans uppercase">Integrity and Proctoring</h2>
                                        <div className="h-1 w-20 bg-rose-500 rounded-full" />
                                    </div>
                                    <div className="flex justify-end -mt-16 mb-8">
                                        <Button variant="outline" className="rounded-full border-gray-200 text-[10px] font-bold h-8 px-6 hover:bg-white hover:border-gray-900 transition-all uppercase tracking-widest shadow-sm">
                                            View all logs
                                        </Button>
                                    </div>

                                    {/* ── Integrity Verdict Card ── */}
                                    <div className="grid grid-cols-[340px_1fr] rounded-[48px] bg-white border-2 border-[#F5E6D3]/30 shadow-[0_20px_60px_rgba(139,94,60,0.06)] overflow-hidden border-l-[8px] border-l-[#8B5E3C]">
                                        <div className="bg-[#FAF9F6] p-12 flex flex-col items-center justify-center gap-4 border-r border-[#F5E6D3]/20">
                                            <h4 className="text-[12px] font-bold text-gray-900 font-sans uppercase tracking-widest opacity-60 mb-2">Integrity Score</h4>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-7xl font-bold text-gray-900 tracking-tighter">5.8</span>
                                                <span className="text-2xl font-semibold text-gray-300">/10</span>
                                            </div>
                                            <span className="px-6 py-2 rounded-full bg-[#FEF3C7]/60 text-[#B45309] text-[10px] font-bold uppercase tracking-[0.2em] border border-[#FDE68A]">
                                                Inconclusive
                                            </span>
                                        </div>
                                        <div className="p-12 space-y-6">
                                            <h4 className="text-[12px] font-bold text-gray-900 font-sans uppercase tracking-widest opacity-60 mb-2">Integrity Verdict</h4>
                                            <p className="text-[15px] font-medium text-gray-700 leading-[1.8] max-w-[95%]">
                                                2 events in a 5-minute session. Tab switch timed during Q1 at the exact moment of deflection — <span className="underline decoration-orange-400 decoration-2 underline-offset-4 text-gray-900 font-semibold italic">the most suspicious signal</span>. Audio anomaly is inconclusive. Face present 100% of session; no multiple faces; gaze pattern normal. The proctoring data alone does not confirm cheating, but combined with self-declared inability and zero output, the overall picture warrants a human review of the recording before making a final integrity call.
                                            </p>
                                        </div>
                                    </div>

                                    {/* ── Proctoring Metrics Row ── */}
                                    <div className="flex gap-6">
                                        <ProctoringMetric value="1" label="Tab Switches" risk="MEDIUM RISK" />
                                        <ProctoringMetric value="0" label="Multiple Faces" risk="NO RISK" />
                                        <ProctoringMetric value="1" label="Audio Anomalies" risk="MEDIUM RISK" />
                                        <ProctoringMetric value="100%" label="Face Present" risk="NO RISK" />
                                        <ProctoringMetric value="Normal" label="Eye Gaze" risk="NO RISK" />
                                    </div>

                                    {/* ── Correlation Timeline vs Pattern Analysis Grid ── */}
                                    <div className="grid grid-cols-[1.2fr_1fr] gap-8 items-stretch">
                                        {/* Left: Timeline */}
                                        <div className="p-10 rounded-[44px] bg-white border border-gray-100 shadow-sm space-y-10 optimize-scroll">
                                            <h4 className="text-[15px] font-bold text-gray-900 font-sans tracking-tight mb-6">Event Timeline — Correlated with Interview</h4>
                                            <div className="space-y-2">
                                                <TimelineEvent 
                                                    time="0:00" 
                                                    event="Session started" 
                                                    risk="CLEAN" 
                                                    desc="Camera on. Single face detected. Browser focus confirmed. Audio levels normal." 
                                                    isSuccess 
                                                />
                                                <TimelineEvent 
                                                    time="1:18" 
                                                    event="Tab switch" 
                                                    risk="MEDIUM RISK" 
                                                    desc="Browser focus lost for ~8 seconds. Candidate returned to session tab." 
                                                    subNote="Timed during Q1 deflection — candidate was avoiding the coding question at this exact moment. Most notable signal in session."
                                                />
                                                <TimelineEvent 
                                                    time="3:05" 
                                                    event="Audio anomaly" 
                                                    risk="MEDIUM RISK" 
                                                    desc="Voice-like background sound for ~3 seconds. Could be ambient noise or TV." 
                                                    subNote="Occurred 37 seconds after self-admission 'not good at coding.' No clear link — flag for awareness only."
                                                />
                                                <TimelineEvent 
                                                    time="5:00" 
                                                    event="Session ended" 
                                                    risk="CLEAN" 
                                                    desc="No further anomalies. Face present entire session. Gaze consistent with genuine attempt." 
                                                    isSuccess
                                                />
                                            </div>
                                        </div>

                                        {/* Right: Pattern Analysis */}
                                        <div className="p-10 rounded-[44px] bg-white border border-gray-100 shadow-sm space-y-10 optimize-scroll">
                                            <h4 className="text-[15px] font-bold text-gray-900 font-sans tracking-tight mb-6">Pattern Analysis — What signals mean together</h4>
                                            <div className="space-y-6">
                                                <AnalysisSignal 
                                                    type="warning" 
                                                    title="Tab switch timing is the key concern" 
                                                    desc="Not the count (1 is low) but the exact timing — during the technical question at the moment of deflection. This correlation is what matters." 
                                                />
                                                <AnalysisSignal 
                                                    type="success" 
                                                    title="No proxy candidate risk" 
                                                    desc="Face present 100% of session. Single face only. No deepfake indicators detected. Candidate was physically present throughout." 
                                                />
                                                <AnalysisSignal 
                                                    type="warning" 
                                                    title="Audio anomaly — insufficient to conclude" 
                                                    desc="Single 3-second event. No repeated pattern. Cannot conclude external assistance from one event alone." 
                                                />
                                                <AnalysisSignal 
                                                    type="success" 
                                                    title="Gaze pattern supports genuine attempt" 
                                                    desc="Eye movement consistent with reading the problem and thinking. No sustained off-screen reference pattern detected." 
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Section: Final Verdict ── */}
                                    <div className="pt-20 border-t border-gray-200 mt-20 space-y-12">
                                        <div className="flex flex-col items-center gap-2 text-center mb-8">
                                            <h2 className="text-3xl font-bold text-slate-950 tracking-tight font-sans uppercase">Final Verdict</h2>
                                            <div className="h-1 w-20 bg-indigo-600 rounded-full" />
                                        </div>

                                        {/* ── Score Summary ── */}
                                        <div className="grid grid-cols-3 gap-8">
                                            <VerdictScoreCard label="Interview / 10" value="2.1" color="red" />
                                            <VerdictScoreCard label="Integrity / 10" value="5.8" color="orange" />
                                            <VerdictScoreCard label="Combined / 10" value="1.8" color="red" />
                                        </div>

                                        {/* ── Verdict Narrative Card ── */}
                                        <div className="flex justify-center">
                                            <div className="w-full max-w-[1200px] p-12 rounded-[44px] bg-white border border-gray-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 left-0 w-2 h-full bg-rose-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                                                <div className="flex flex-col gap-8">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-[0.4em]">Strategic Rationale</h4>
                                                        <div className="flex items-center gap-3">
                                                            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                                                            <span className="px-5 py-2 rounded-full bg-rose-50 border border-rose-100 text-[10px] font-bold text-rose-600 uppercase tracking-widest shadow-sm">
                                                                Final Recommendation: Reject
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-6">
                                                        <p className="text-[18px] font-medium text-slate-700 leading-[1.8] tracking-tight text-left font-sans">
                                                            The candidate demonstrated limited ability to articulate their experience and impact in the domain of B2B go-to-market strategies, providing only a brief and unclear response regarding their involvement with a "report strategy since sales systems." This suggests an area to explore further, particularly to understand the depth of their practical experience and specific contributions to lead generation or revenue growth.
                                                        </p>
                                                        
                                                        <p className="text-[18px] font-medium text-slate-700 leading-[1.8] tracking-tight text-left font-sans">
                                                            Communication during the interview was notably minimal and lacked elaboration, which may impact their effectiveness in a role that requires clear and proactive collaboration with cross-functional teams. While the candidate remained engaged, their responses did not convey a strong command of the subject matter or a confident attitude toward the role's responsibilities. Given these observations, the candidate's fit for the GTM Engineer role appears limited at this stage.
                                                        </p>
                                                        
                                                        <div className="pt-6 border-t border-slate-50">
                                                            <p className="text-[16px] font-bold text-rose-600 uppercase tracking-widest">
                                                                Verdict: Performance Threshold Not Met
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Recommended Next Actions ── */}
                                        <div className="flex justify-center">
                                            <div className="w-full max-w-[1200px] p-12 rounded-[44px] bg-[#EEF2FF] border border-[#E0E7FF] space-y-8">
                                                <p className="text-center text-[11px] font-bold text-[#6366F1] uppercase tracking-[0.4em] mb-4">Recommended Next Action</p>
                                                <div className="space-y-6 flex flex-col items-center">
                                                    <div className="space-y-5 w-fit">
                                                        <RecommendedActionItem text="Reject for this AI Engineer role — performance failure is definitive, no further round needed" />
                                                        <RecommendedActionItem text="Human review of recording recommended before logging integrity verdict — proctoring is inconclusive, not confirmed" />
                                                        <RecommendedActionItem text="Flag for talent pool as junior automation role candidate — n8n and Apollo experience has value in a different context" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}"""

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Range to replace: 1438 to 1826 (indices 1437 to 1826)
start_idx = 1437
end_idx = 1826

print(f"Repairing range {start_idx+1} to {end_idx+1}")

new_lines = lines[:start_idx] + [new_interview_block + '\n'] + lines[end_idx:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Structural recovery complete.")
