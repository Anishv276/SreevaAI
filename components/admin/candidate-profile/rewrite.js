const fs = require('fs');
const file = 'C:/Users/vamsi/OneDrive/Documents/SreevaAI/components/admin/candidate-profile/resume-report-sreevaai.tsx';
let content = fs.readFileSync(file, 'utf8');

const returnStartStr = '  return (\n    <div className="w-full h-screen flex flex-col overflow-hidden bg-[#F3F4F6]">';
const returnStartIndex = content.indexOf(returnStartStr);
if (returnStartIndex === -1) throw new Error("Could not find return start");

const returnEndStr = '  );\n}\n';
const returnEndIndex = content.lastIndexOf(returnEndStr);
if (returnEndIndex === -1) throw new Error("Could not find return end");

const beforeReturn = content.substring(0, returnStartIndex);

const newReturn = `  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-[#F3F4F6]">
      {/* ── TOP HEADER (Back & Actions) ── */}
      {showHeader && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE1E5] px-4 py-2 bg-white z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <BackButton />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
            {model.resumeUrl ? (
              <a href={model.resumeUrl} target="_blank" rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#0D4D2E] shadow-sm hover:bg-[#F7FAF8]">
                <Link2 className="h-3.5 w-3.5" />
                View Resume
              </a>
            ) : (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE1E5] bg-white px-3 text-[11px] font-bold text-[#9AA1AA] shadow-sm">
                <Link2 className="h-3.5 w-3.5" />
                View Resume
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── CANDIDATE PROFILE & SHORTLISTING HEADER ── */}
      <div className="shrink-0 bg-white border-b border-[#E4E7EB] shadow-sm px-4 lg:px-6 py-4 z-0 relative">
        <div className="mx-auto max-w-[1600px] flex flex-col md:flex-row items-start md:items-stretch justify-between gap-6">
          
          {/* Profile Left */}
          <div className="flex items-center gap-5 shrink-0">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-black/5 shadow-sm bg-gray-100">
              {model.displayAvatar ? <img src={model.displayAvatar} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-[#111827] leading-tight truncate">{model.fullName}</h2>
              <p className="text-[13px] font-medium text-[#6B7280] truncate">{model.roleLabel}</p>
              {(model.locationLine || model.experienceLine) && (
                <p className="text-[12px] font-medium text-[#9CA3AF]">
                  {[model.locationLine, model.experienceLine].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* Verdict Note & Score Right */}
          {(() => {
            const isHire = model.decisionStamp === "SHORTLISTED";
            const isNo = model.decisionStamp === "REJECTED";
            
            const badgeBg = isHire ? "bg-[#F0FDF4] border-[#86EFAC] text-[#166534]" : isNo ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800";
            const noteBg = isHire ? "bg-emerald-50/50 border-emerald-100" : isNo ? "bg-rose-50/50 border-rose-100" : "bg-amber-50/50 border-amber-100";
            const noteTitleText = isHire ? "text-emerald-700" : isNo ? "text-rose-700" : "text-amber-700";
            const noteIcon = isHire ? "text-emerald-500" : isNo ? "text-rose-500" : "text-amber-500";
            const noteBody = isHire ? "text-emerald-900" : isNo ? "text-rose-900" : "text-amber-900";
            const chevronCol = isHire ? "text-emerald-400 hover:text-emerald-600" : isNo ? "text-rose-400 hover:text-rose-600" : "text-amber-400 hover:text-amber-600";

            return (
              <>
                {/* Center Note (Like Hiring Note) */}
                <div className={"flex-1 rounded-xl border p-4 mx-2 flex flex-col justify-center relative " + noteBg}>
                  <button
                    type="button"
                    onClick={() => setExpandedVerdict(!expandedVerdict)}
                    className={"absolute right-3 top-3 transition-colors cursor-pointer outline-none " + chevronCol}
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", expandedVerdict && "rotate-180")} />
                  </button>
                  <div className="flex items-center gap-2 mb-1.5 shrink-0 pr-6">
                    <User className={"h-3.5 w-3.5 " + noteIcon} />
                    <span className={"text-[11px] font-bold uppercase tracking-widest " + noteTitleText}>Shortlisting Note</span>
                  </div>
                  <p className={cn("text-[12px] leading-snug font-medium " + noteBody, !expandedVerdict && "line-clamp-3")}>
                    {model.reviewStrip || "No specific shortlisting note provided."}
                  </p>
                </div>

                {/* Score & Verdict Badge (Right) */}
                <div className="flex flex-col items-end justify-center gap-2 shrink-0 min-w-[120px]">
                  <span className={"inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest " + badgeBg}>
                    {isHire ? <CheckCircle className="h-4 w-4" /> : isNo ? <XCircle className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                    {model.decisionStamp || "PENDING"}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[28px] font-black text-[#111827] tracking-tight">{model.fitPercent}</span>
                    <span className="text-[14px] font-bold text-[#9CA3AF]">/ 100</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] bg-[#F3F4F6] px-2 py-0.5 rounded">Match Score</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT AREA (ROWS) ── */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ scrollbarWidth: "thin" }}>
        <div className="mx-auto max-w-[1600px] flex flex-col gap-6 pb-12">
          
          {/* ── ROW 1: Fit Radar (Left) + AI Summary (Right) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
            
            {/* Fit Radar */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible flex flex-col h-full">
              <div className="px-6 py-5 flex-1">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[14px] font-bold text-[#111827]">Fit Radar</p>
                  <span className="rounded-md bg-[#F1F2F4] px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#1A1D22] shadow-sm">{model.fitLabel}</span>
                </div>
                <div className="flex flex-col items-center justify-center h-[calc(100%-40px)]">
                  <div className="w-full max-w-[320px] mx-auto">
                    <ResumeRadarPlot values={model.fitRadar} notes={model.fitRadarNotes} onHoverChange={setRadarHovered} />
                  </div>
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible flex flex-col h-full">
              <div className="px-6 py-5 flex-1">
                <div className="flex w-full items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#6366F1]" />
                    <p className="text-[14px] font-bold text-[#111827]">AI Summary</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {model.aiSummaryPoints.map((item, j) => (
                    <div key={j} className={
                      "rounded-xl border p-4 shadow-sm " +
                      (item.label === "Red flags" ? "bg-rose-50 border-rose-100"
                      : item.tone === "emerald" ? "bg-[#F0FDF4] border-[#DCFCE7]"
                      : item.tone === "amber" ? "bg-amber-50 border-amber-100"
                      : "bg-violet-50 border-gray-100")
                    }>
                      <div className="mb-2 flex items-center gap-2">
                        <span className={
                          "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] " +
                          (item.label === "Red flags" ? "bg-rose-200 text-rose-800"
                            : item.tone === "emerald" ? "bg-[#0D4D2E] text-white"
                            : item.tone === "amber" ? "bg-[#B86A00] text-white"
                            : "bg-gray-200 text-gray-800")
                        }>{item.label}</span>
                      </div>
                      <p className={"text-[13px] leading-relaxed " + (item.label === "Red flags" ? "text-rose-900" : "text-[#374151]")}>{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* ── ROW 2: Evidence Highlights | Career Timeline | Skill Signals ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start">
            
            {/* Strengths & Weaknesses */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible h-full">
              <div className="px-5 py-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280] mb-4">Evidence Highlights</p>
                <div className="flex flex-col gap-1">
                  {/* Strengths */}
                  <div>
                    <button type="button" onClick={() => setOpenStrengths(!openStrengths)}
                      className="flex items-center justify-between w-full text-left py-2 hover:bg-emerald-50/60 rounded-lg -mx-2 px-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-emerald-800">Strengths</span>
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{model.strengths.length}</span>
                      </div>
                      <ChevronDown className={"h-4 w-4 text-emerald-600 transition-transform " + (openStrengths ? "rotate-180" : "")} />
                    </button>
                    {openStrengths && (
                      <div className="mt-2 mb-3 pl-2">
                        {model.strengths.length > 0 ? (
                          <ul className="space-y-3">
                            {model.strengths.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                <div>
                                  <p className="text-[12px] font-bold text-[#1A1D22] mb-0.5">{item.label}</p>
                                  <p className="text-[12px] leading-relaxed text-[#374151]">{item.body}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] text-[#9CA3AF]">No specific strengths identified.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="h-px bg-[#F3F4F6] my-2" />
                  {/* Weaknesses */}
                  <div>
                    <button type="button" onClick={() => setOpenWeaknesses(!openWeaknesses)}
                      className="flex items-center justify-between w-full text-left py-2 hover:bg-red-50/60 rounded-lg -mx-2 px-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-red-800">Weaknesses</span>
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{model.weaknesses.length}</span>
                      </div>
                      <ChevronDown className={"h-4 w-4 text-red-600 transition-transform " + (openWeaknesses ? "rotate-180" : "")} />
                    </button>
                    {openWeaknesses && (
                      <div className="mt-2 mb-2 pl-2">
                        {model.weaknesses.length > 0 ? (
                          <ul className="space-y-3">
                            {model.weaknesses.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                <div>
                                  <p className="text-[12px] font-bold text-[#1A1D22] mb-0.5">{item.label}</p>
                                  <p className="text-[12px] leading-relaxed text-[#374151]">{item.body}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] text-[#9CA3AF]">No clear weaknesses surfaced.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Career Timeline */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible h-full">
              <div className="px-5 py-5">
                <button type="button" onClick={() => setOpenCareer(!openCareer)}
                  className="flex w-full items-center justify-between mb-5">
                  <p className="text-[13px] font-bold text-[#111827]">Career Timeline</p>
                  <ChevronDown className={"h-4 w-4 text-[#9CA3AF] transition-transform " + (openCareer ? "rotate-180" : "")} />
                </button>
                {openCareer && (
                  <div className="relative pl-3 border-l border-[#E5E7EB] space-y-6">
                    {model.careerLines.map((line, k) => (
                      <div key={k} className="relative">
                        <div className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-slate-300 ring-4 ring-white" />
                        <div className="pl-3">
                          <p className="text-[10px] font-bold text-[#6B7280] mb-0.5">{line.time}</p>
                          <p className="text-[13px] font-bold text-[#111827] mb-1.5">{line.label}</p>
                          <p className="text-[12px] leading-relaxed text-[#4B5563]">{line.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Skill Signals */}
            <div className="rounded-2xl bg-white border border-[#E4E7EB] shadow-sm overflow-visible h-full">
              <div className="px-5 py-5">
                <p className="text-[13px] font-bold text-[#111827] mb-4">Skill Signals</p>
                <div className="flex flex-col gap-1">
                  {/* Matched */}
                  <div>
                    <button type="button" onClick={() => setOpenMatchedSkills(!openMatchedSkills)}
                      className="flex items-center justify-between w-full text-left py-2 hover:bg-emerald-50/60 rounded-lg -mx-2 px-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-emerald-800">Matched</span>
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{matchedSkills.length}</span>
                      </div>
                      <ChevronDown className={"h-4 w-4 text-emerald-600 transition-transform " + (openMatchedSkills ? "rotate-180" : "")} />
                    </button>
                    {openMatchedSkills && (
                      <div className="mt-2 mb-3 flex flex-col divide-y divide-[#F3F4F6]">
                        {matchedSkills.length === 0 && <p className="py-2 text-[12px] text-[#9CA3AF]">No JD skills matched in resume.</p>}
                        {matchedSkills.map((s, j) => (
                          <div key={j} className="flex items-center justify-between py-2.5 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 text-[11px] font-bold text-[#9CA3AF] w-4 text-right">{j + 1}</span>
                              <p className="text-[13px] font-semibold text-[#374151] truncate">{s.name}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">JD Match</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {notMatchedSkills.length > 0 && <div className="h-px bg-[#F3F4F6] my-2" />}
                  {/* Not Matched */}
                  {notMatchedSkills.length > 0 && (
                    <div>
                      <button type="button" onClick={() => setOpenMissingSkills(!openMissingSkills)}
                        className="flex items-center justify-between w-full text-left py-2 hover:bg-red-50/60 rounded-lg -mx-2 px-2 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-red-800">Not Matched</span>
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{notMatchedSkills.length}</span>
                        </div>
                        <ChevronDown className={"h-4 w-4 text-red-600 transition-transform " + (openMissingSkills ? "rotate-180" : "")} />
                      </button>
                      {openMissingSkills && (
                        <div className="mt-2 mb-3 flex flex-col divide-y divide-[#F3F4F6]">
                          {notMatchedSkills.map((s, j) => (
                            <div key={j} className="flex items-center justify-between py-2.5 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 text-[11px] font-bold text-[#9CA3AF] w-4 text-right">{j + 1}</span>
                                <p className="text-[13px] font-semibold text-rose-700 truncate">{s.name}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">Missing</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {listedSkills.length > 0 && <div className="h-px bg-[#F3F4F6] my-2" />}
                  {/* Listed in Resume */}
                  {listedSkills.length > 0 && (
                    <div>
                      <button type="button" onClick={() => setOpenListedSkills(!openListedSkills)}
                        className="flex items-center justify-between w-full text-left py-2 hover:bg-violet-50/60 rounded-lg -mx-2 px-2 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-gray-700">Listed in Resume</span>
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">{listedSkills.length}</span>
                        </div>
                        <ChevronDown className={"h-4 w-4 text-gray-400 transition-transform " + (openListedSkills ? "rotate-180" : "")} />
                      </button>
                      {openListedSkills && (
                        <div className="mt-2 mb-2 flex flex-col divide-y divide-[#F3F4F6]">
                          {listedSkills.map((s, j) => (
                            <div key={j} className="flex items-center justify-between py-2.5 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 text-[11px] font-bold text-[#9CA3AF] w-4 text-right">{j + 1}</span>
                                <p className="text-[13px] font-semibold text-[#6B7280] truncate">{s.name}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-gray-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-gray-500">Listed</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(file, beforeReturn + newReturn, 'utf8');
console.log("Successfully rewrote header to match hiring note layout.");
