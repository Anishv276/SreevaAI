import os

file_path = r'c:\Users\vamsi\OneDrive\Desktop\HR-updates\app\admin\candidates\[id]\page.tsx'
correct_block = """                                                <AnalysisSignal 
                                                    type="warning" 
                                                    title="Tab switch timing is the key concern" 
                                                    desc="Not the count (1 is low) but the exact timing - during the technical question at the moment of deflection. This correlation is what matters." 
                                                />
                                                <AnalysisSignal 
                                                    type="success" 
                                                    title="No proxy candidate risk" 
                                                    desc="Face present 100% of session. Single face only. No deepfake indicators detected. Candidate was physically present throughout." 
                                                />
                                                <AnalysisSignal 
                                                    type="warning" 
                                                    title="Audio anomaly - insufficient to conclude" 
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

                                    {/* -- Section: Final Verdict -- */}
                                    <div className="pt-20 border-t border-gray-200 mt-20 space-y-12">
                                        <div className="flex flex-col items-center gap-2 text-center mb-8">
                                            <h2 className="text-3xl font-bold text-slate-950 tracking-tight font-sans uppercase">Final Verdict</h2>
                                            <div className="h-1 w-20 bg-indigo-600 rounded-full" />
                                        </div>

                                        {/* -- Score Summary -- */}
                                        <div className="grid grid-cols-3 gap-8">
                                            <VerdictScoreCard label="Interview / 10" value="2.1" color="red" />
                                            <VerdictScoreCard label="Integrity / 10" value="5.8" color="orange" />
                                            <VerdictScoreCard label="Combined / 10" value="1.8" color="red" />
                                        </div>

                                        {/* -- Verdict Narrative Card -- */}
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

                                        {/* -- Recommended Next Actions -- */}
                                        <div className="flex justify-center">
                                            <div className="w-full max-w-[1200px] p-12 rounded-[44px] bg-[#EEF2FF] border border-[#E0E7FF] space-y-8">
                                                <p className="text-center text-[11px] font-bold text-[#6366F1] uppercase tracking-[0.4em] mb-4">Recommended Next Action</p>
                                                <div className="space-y-6 flex flex-col items-center">
                                                    <div className="space-y-5 w-fit">
                                                        <RecommendedActionItem text="Reject for this AI Engineer role - performance failure is definitive, no further round needed" />
                                                        <RecommendedActionItem text="Human review of recording recommended before logging integrity verdict - proctoring is inconclusive, not confirmed" />
                                                        <RecommendedActionItem text="Flag for talent pool as junior automation role candidate - n8n and Apollo experience has value in a different context" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>"""

if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    exit(1)

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The mess starts at 1738 (1737 index) and ends at 1749 (1748 index).
# However, to be extra safe, let's find the anchors.
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if '<AnalysisSignal' in line and i >= 1730:
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if ')}' in lines[i] and i >= 1748:
        end_idx = i
        break

if start_idx == -1 or end_idx == -1:
    print(f"Could not find anchors: start_idx={start_idx}, end_idx={end_idx}")
    # Fallback to hardcoded indices if anchors fail but we're sure
    start_idx = 1737 
    end_idx = 1749 

print(f"Repairing range {start_idx+1} to {end_idx+1}")

new_lines = lines[:start_idx] + [correct_block + '\n'] + lines[end_idx:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Repair complete.")
