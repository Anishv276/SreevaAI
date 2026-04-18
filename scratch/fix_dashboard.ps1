$path = "app/admin/candidates/[id]/page.tsx"
$lines = Get-Content $path -Raw
# The mess is between line 1738 and approximately 1749. 
# We'll use regex to find the start and end of the corrupted area to be safe.
$pattern = '(?s)<AnalysisSignal \s+type="warning" \s+title="Tab switch timing is the key concern" .*?\}\)'
# Actually, it's easier to just find the marker "Tab switch timing is the key concern" and replace everything until the next valid block.

# Let's try a simpler approach: Read lines, remove 1738 to 1749, insert correct ones.
$linesArray = Get-Content $path
$startIdx = 1737 # 1738 is 1-indexed
$endIdx = 1748   # 1749 is 1-indexed

$correctBlock = @"
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
"@

$newLines = $linesArray[0..($startIdx-1)] + ($correctBlock -split "`n") + $linesArray[($endIdx+1)..($linesArray.Count-1)]
$newLines | Set-Content $path -Encoding utf8
