const fs = require('fs');
const path = 'c:\\Users\\vamsi\\OneDrive\\Desktop\\HR-updates\\components\\admin\\candidate-profile\\resume-report-sreevaai.tsx';
let lines = fs.readFileSync(path, 'utf8').split('\n');

const startIdx = 1286 - 1;
const endIdx = 1778 - 1;

const newContent = `
        {/* Main 3-Panel Bento Architecture */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-8rem)]">
          
          {/* PANEL 1: Left (Profile, Verdict, Radar, Summary) */}
          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            
            {/* Candidate Profile Compact */}
            <div className={cn("rounded-2xl border border-[#E4E7EB] bg-white p-5 shadow-sm")}>
              <div className="flex items-center gap-4 mb-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-sm bg-slate-100">
                  {model.displayAvatar ? <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-black tracking-tight text-[#111827]">{model.fullName}</h2>
                  <p className="text-[12px] font-semibold text-[#6B7280] truncate">{model.roleLabel}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#6B7280]">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {model.locationLine || "Location"}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[#F3F4F6] pt-3">
                <div className="flex items-center gap-2">
                  <SemicircleGauge value={model.fitPercent} fitLabel={model.fitLabel} />
                  <div className="text-[10px] font-bold text-[#6B7280]">FIT SNAPSHOT</div>
                </div>
                {model.decisionStamp === "SHORTLISTED" || model.decisionStamp === "REJECTED" ? (
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border",
                    model.decisionStamp === "SHORTLISTED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                  )}>
                    {model.decisionStamp}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Hiring Verdict Box */}
            {(() => {
              const isHire = model.decisionStamp === "SHORTLISTED";
              const isNo = model.decisionStamp === "REJECTED";
              const bgCls = isHire ? "bg-[#F0FDF4] border-[#86EFAC]" : isNo ? "bg-rose-50 border-rose-200" : "bg-gray-50 border-gray-200";
              const textCls = isHire ? "text-[#166534]" : isNo ? "text-rose-800" : "text-gray-800";
              const iconCls = isHire ? "text-[#22C55E]" : isNo ? "text-rose-500" : "text-gray-500";
              return (
                <div className="rounded-2xl border border-[#E4E7EB] bg-white overflow-hidden shadow-sm">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[13px] font-bold text-[#111827]">Hiring Note</p>
                      <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[9.5px] font-bold text-[#4B5563]">Verdict</span>
                    </div>
                    <div className={cn("rounded-xl border px-4 py-3.5", bgCls)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isHire ? <CheckCircle className={cn("h-[18px] w-[18px]", iconCls)} /> : isNo ? <XCircle className={cn("h-[18px] w-[18px]", iconCls)} /> : <Activity className={cn("h-[18px] w-[18px]", iconCls)} />}
                          <span className={cn("text-[14px] font-black uppercase tracking-wide", textCls)}>
                            {isHire ? "STRONG HIRE" : isNo ? "NO HIRE" : "BORDERLINE"}
                          </span>
                        </div>
                        <div className={cn("flex items-center justify-center h-8 px-2.5 rounded-full border-2 shrink-0", isHire ? "border-[#22C55E]" : isNo ? "border-rose-400" : "border-gray-400")}>
                          <span className={cn("text-[12px] font-bold tabular-nums", textCls)}>
                            {model.fitPercent}<span className="text-[9.5px] font-semibold opacity-70">/100</span>
                          </span>
                        </div>
                      </div>
                      {model.reviewStrip && (
                        <div className="pt-1 relative">
                          <p className={cn("text-[12px] leading-relaxed whitespace-pre-line pr-7", textCls, !expandedVerdict && "line-clamp-2")}>
                            {model.reviewStrip}
                          </p>
                          <button 
                            type="button" 
                            onClick={() => setExpandedVerdict(!expandedVerdict)}
                            className={cn("absolute right-0 top-0.5 p-1 hover:bg-black/5 rounded transition-colors", textCls)}
                          >
                            <ChevronDown className={cn("h-4 w-4 transition-transform", expandedVerdict ? "rotate-180" : "")} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Fit Radar */}
            <div className="rounded-2xl border border-[#E4E7EB] bg-white overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-[#F3F4F6]">
                <p className="text-[13px] font-bold text-[#111827]">Evaluation Radar Chart</p>
              </div>
              <div className="px-5 py-4">
                <ResumeRadarPlot values={model.fitRadar} notes={model.fitRadarNotes} onHoverChange={setRadarHovered} />
              </div>
            </div>

            {/* AI Summary */}
            <div className="rounded-2xl border border-[#E4E7EB] bg-white overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-[#F3F4F6]">
                <p className="text-[13px] font-bold text-[#111827]">Summary</p>
              </div>
              <div className="px-5 py-4 space-y-4">
                {model.aiSummaryPoints.map((item, j) => (
                  <div key={j}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em]",
                        item.label === "Red flags" ? "bg-red-100 text-red-700" :
                        item.tone === "emerald" ? "bg-[#0D4D2E] text-white" :
                        item.tone === "amber" ? "bg-[#B86A00] text-white" : "bg-red-100 text-red-700"
                      )}>
                        {item.label}
                      </span>
                    </div>
                    <p className={cn("text-[12px] leading-relaxed", item.label === "Red flags" ? "text-red-900" : "text-[#374151]")}>{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
            
          </div>

          {/* PANEL 2: Middle (Evidence Highlights, Skill Signals) */}
          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            
            {/* Evidence Highlights */}
            <div className="rounded-2xl border border-[#E4E7EB] bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#F3F4F6]">
                <p className="text-[13px] font-bold text-[#111827]">Evidence Highlights</p>
              </div>
              <div className="px-5 py-4">
                <div className="flex flex-col gap-2">
                  {/* Strengths */}
                  <div className="flex flex-col">
                    <button type="button" onClick={() => setOpenStrengths(!openStrengths)}
                      className="flex items-center justify-between w-full text-left py-1.5 hover:bg-emerald-50/60 rounded-lg -mx-1.5 px-1.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-emerald-800">? Strengths</span>
                      </div>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-emerald-600 transition-transform", openStrengths ? "rotate-180" : "")} />
                    </button>
                    {openStrengths && (
                      <div className="mt-2 mb-3 pl-2">
                        {model.strengths.length > 0 ? (
                          <ul className="space-y-3">
                            {model.strengths.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2.5">
                                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                <div>
                                  <p className="text-[11.5px] font-bold text-[#1A1D22] mb-0.5">{item.label}</p>
                                  <p className="text-[11.5px] leading-relaxed text-[#374151]">{item.body}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11.5px] text-[#9CA3AF]">No specific strengths identified.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-[#F3F4F6] my-1" />

                  {/* Weaknesses */}
                  <div className="flex flex-col">
                    <button type="button" onClick={() => setOpenWeaknesses(!openWeaknesses)}
                      className="flex items-center justify-between w-full text-left py-1.5 hover:bg-red-50/60 rounded-lg -mx-1.5 px-1.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-red-800">?? Weaknesses</span>
                      </div>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-red-600 transition-transform", openWeaknesses ? "rotate-180" : "")} />
                    </button>
                    {openWeaknesses && (
                      <div className="mt-2 mb-1 pl-2">
                        {model.weaknesses.length > 0 ? (
                          <ul className="space-y-3">
                            {model.weaknesses.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2.5">
                                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                                <div>
                                  <p className="text-[11.5px] font-bold text-red-900 mb-0.5">{item.label}</p>
                                  <p className="text-[11.5px] leading-relaxed text-red-800">{item.body}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11.5px] text-[#9CA3AF]">No clear weaknesses surfaced.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Skill Signals */}
            <div className="rounded-2xl border border-[#E4E7EB] bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-5 py-4 border-b border-[#F3F4F6] shrink-0">
                <p className="text-[13px] font-bold text-[#111827]">Skill Signals</p>
              </div>
              <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                {(() => {
                  const matched = model.skillMatchRows.filter((r) => r.matched);
                  const missing = model.skillMatchRows.filter((r) => !r.matched);
                  const depthChip = (depth) => {
                    if (depth === "deep") return { label: "Deep", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
                    if (depth === "working") return { label: "Working", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
                    if (depth === "listed") return { label: "Listed", cls: "bg-slate-50 text-slate-700 border-slate-200" };
                    return { label: "Missing", cls: "bg-amber-50 text-amber-800 border-amber-200" };
                  };
                  return (
                    <div className="space-y-6">
                      {matched.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6B7280] mb-3">Matched Skills ({matched.length})</p>
                          <div className="flex flex-col gap-2">
                            {matched.map((s, j) => {
                              const chip = depthChip(s.depth);
                              return (
                                <div key={j} className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0">
                                  <div className="flex items-center gap-2 min-w-0 pr-3">
                                    <div className="h-6 w-6 rounded-full bg-[#F3F4F6] flex items-center justify-center shrink-0 text-[#6B7280] text-[10px] font-bold">{j + 1}</div>
                                    <p className="text-[13px] font-semibold text-[#374151] truncate">{s.name}</p>
                                  </div>
                                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-bold", chip.cls)}>{chip.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {missing.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6B7280] mb-3">Missing Skills ({missing.length})</p>
                          <div className="flex flex-col gap-2">
                            {missing.map((s, j) => (
                              <div key={j} className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0">
                                <div className="flex items-center gap-2 min-w-0 pr-3">
                                  <div className="h-6 w-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 text-[10px] font-bold">{j + 1}</div>
                                  <p className="text-[13px] font-semibold text-rose-700 truncate">{s.name}</p>
                                </div>
                                <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9.5px] font-bold text-rose-700">Missing</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* PANEL 3: Right (Career Timeline) */}
          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <div className="rounded-2xl border border-[#E4E7EB] bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-5 py-4 border-b border-[#F3F4F6] shrink-0">
                <p className="text-[13px] font-bold text-[#111827]">Career Timeline</p>
              </div>
              <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                <div className="relative pl-3 border-l border-[#E5E7EB] space-y-6">
                  {model.careerLines.map((line, k) => (
                    <div key={k} className="relative">
                      <div className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-slate-300 ring-4 ring-white" />
                      <div className="pl-3">
                        <p className="text-[10px] font-bold text-[#6B7280] mb-0.5">{line.time}</p>
                        <p className="text-[13px] font-bold text-[#111827] mb-1.5">{line.label}</p>
                        <p className="text-[12px] leading-relaxed text-[#4B5563] whitespace-pre-wrap">{line.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
`

lines.splice(startIdx, endIdx - startIdx + 1, ...newContent.split('\n'));
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Successfully replaced layout!');
