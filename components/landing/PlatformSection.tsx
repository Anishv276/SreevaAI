import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const transcriptLines = [
  { speaker: "Candidate", text: "I built an API that fetches user preferences from a cache instead of the database every time." },
  { speaker: "Sreeva · Adapting", text: "Walk me through that. What cache layer did you choose? How did you handle cache invalidation when preferences change?" },
  { speaker: "Candidate", text: "We used Redis. For invalidation, we set a TTL of 5 minutes, but also fired an event on user update to clear the specific key." },
  { speaker: "Sreeva · Adapting", text: "What happens if the event fails to fire or gets lost? How do you ensure the cache eventually matches the DB?" }
];

export default function PlatformSection() {
  const [currentLineIndex, setCurrentLineIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentLineIndex((prev) => (prev + 1) % transcriptLines.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-32 bg-[#FAFAFA] font-geist overflow-hidden relative" id="platform">
      <div className="max-w-[1280px] mx-auto px-6 relative z-10">
        
        {/* Header */}
        <div className="max-w-3xl mb-24">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-2 h-2 rounded-full bg-violet-600"></span>
            <span className="text-violet-600 font-bold uppercase tracking-widest text-[13px]">The platform</span>
          </div>
          <h2 className="text-[3.5rem] lg:text-[4.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-8">
            One adaptive engine.<br/>
            Two reports.
          </h2>
          <p className="text-xl md:text-[22px] text-gray-500 leading-[1.6] max-w-3xl font-medium">
            Before the call, the <strong className="text-gray-900 font-bold">Resume Report</strong> grades the candidate against the JD and flags every claim that lacks proof. After the call, the <strong className="text-gray-900 font-bold">Interview Report</strong> grades the candidate on what they actually said.
          </p>
        </div>

        {/* Two Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-40">
          
          {/* Resume Report */}
          <div className="bg-white rounded-[32px] p-10 lg:p-14 border border-gray-200/80 shadow-[0_10px_40px_rgba(0,0,0,0.03)] flex flex-col h-full relative group transition-all duration-300 hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            <div className="mb-12 relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">01 Before the call</span>
                <div className="h-[1px] flex-1 bg-gray-100"></div>
              </div>
              <h3 className="text-[32px] font-extrabold text-gray-900 tracking-tight mb-4 leading-tight">Resume Report</h3>
              <p className="text-gray-500 text-[16px] leading-[1.6] font-medium max-w-sm">
                We parse every resume against the JD, weight each claim by recency and proof, and pre-flag the claims that need probing in the live interview.
              </p>
            </div>
            
            {/* Highly Polished Inner Card */}
            <div className="mt-auto bg-[#FDFDFD] rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm relative z-10">
              <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
                <div>
                  <div className="text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-2">JD-Fit Score</div>
                  <div className="text-[14px] font-medium text-gray-900 bg-gray-100 px-3 py-1 rounded-md inline-block">9 of 11 anchors matched</div>
                </div>
                <div className="text-[44px] font-extrabold text-gray-900 leading-none tracking-tighter">87</div>
              </div>
              
              <div className="space-y-3">
                <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded uppercase tracking-widest">Claim</span>
                      <span className="text-[14px] font-bold text-gray-900">React, 6 yrs</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Strong evidence</div>
                    <div className="text-[16px] font-extrabold text-gray-900">96</div>
                  </div>
                </div>
                
                <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded uppercase tracking-widest">Probe</span>
                      <span className="text-[14px] font-bold text-gray-900">"Optimised LCP"</span>
                    </div>
                    <div className="text-[12px] font-medium text-gray-400 mt-1">No metric provided</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Weak</div>
                    <div className="text-[16px] font-extrabold text-gray-900">34</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interview Report */}
          <div className="bg-white rounded-[32px] p-10 lg:p-14 border border-gray-200/80 shadow-[0_10px_40px_rgba(0,0,0,0.03)] flex flex-col h-full relative group transition-all duration-300 hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            <div className="mb-12 relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">02 After the call</span>
                <div className="h-[1px] flex-1 bg-gray-100"></div>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[11px] font-bold border border-emerald-100 uppercase tracking-wider shadow-sm">Strong hire</span>
              </div>
              <h3 className="text-[32px] font-extrabold text-gray-900 tracking-tight mb-4 leading-tight">Interview Report</h3>
              <p className="text-gray-500 text-[16px] leading-[1.6] font-medium max-w-sm">
                After 20 minutes, you get a per-skill breakdown with verbatim evidence, every integrity signal, and a clear Hire / Hold / Reject recommendation.
              </p>
            </div>
            
            {/* Highly Polished Inner Card */}
            <div className="mt-auto bg-[#FDFDFD] rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm relative z-10">
              <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-[12px] bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>
                  </div>
                  <div>
                    <div className="text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-1">Recommendation</div>
                    <div className="text-[18px] font-extrabold text-gray-900">Hire</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-1">Overall</div>
                  <div className="text-[44px] font-extrabold text-gray-900 leading-none tracking-tighter">94</div>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div>
                  <div className="flex justify-between text-[13px] font-bold text-gray-900 mb-2"><span>React depth</span><span className="text-gray-500">96</span></div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="bg-violet-600 h-full w-[96%] rounded-full"></div></div>
                </div>
                <div>
                  <div className="flex justify-between text-[13px] font-bold text-gray-900 mb-2"><span>System design</span><span className="text-gray-500">82</span></div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="bg-violet-600 h-full w-[82%] rounded-full"></div></div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative">
                <div className="absolute left-0 top-4 bottom-4 w-1 bg-gray-200 rounded-r"></div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block pl-3">Verbatim 00:11:24</span>
                <p className="text-[13px] text-gray-900 font-medium leading-relaxed italic pl-3">
                  "Once Cart stopped re-rendering on every scroll, the dropdown felt instant — saved roughly 40 unnecessary renders a second."
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Core Engine Callout */}
        <div className="flex flex-col lg:flex-row gap-16 items-center mb-20">
          
          <div className="w-full lg:w-1/2">
            <span className="inline-block px-4 py-1.5 bg-white border border-gray-200 shadow-sm text-gray-900 rounded-full text-[11px] font-extrabold uppercase tracking-widest mb-6">Core engine</span>
            <h3 className="text-[2.5rem] lg:text-[3.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-4">
              An adaptive interview engine.
            </h3>
            <p className="text-[20px] text-violet-600 font-semibold mb-6">No other platform does this.</p>
            <p className="text-[17px] text-gray-500 leading-[1.6] font-medium mb-12 max-w-md">
              No two interviews are the same. Sreeva reads each answer and decides what to ask next — probing deeper when a candidate knows their craft, pivoting when they don't. The interview shapes itself around the person, not a template.
            </p>
            <div className="flex gap-12 border-t border-gray-200/60 pt-8">
              <div>
                <div className="text-[48px] font-extrabold text-gray-900 tracking-tighter mb-1 leading-none">100%</div>
                <div className="text-[12px] text-gray-400 font-bold uppercase tracking-wider max-w-[120px]">of questions adapt to the answer</div>
              </div>
              <div>
                <div className="text-[48px] font-extrabold text-gray-900 tracking-tighter mb-1 leading-none">0</div>
                <div className="text-[12px] text-gray-400 font-bold uppercase tracking-wider max-w-[120px]">scripted templates, ever</div>
              </div>
            </div>
          </div>

          {/* Premium Chat UI (Live Engagement) */}
          <div className="w-full lg:w-1/2 bg-white rounded-[32px] border border-gray-200 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Adaptive Probe in action</div>
            </div>

            {/* Live Engagement Looping Transcript */}
            <div className="h-[220px] mb-8 relative flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={currentLineIndex}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className={`flex flex-col w-full ${transcriptLines[currentLineIndex].speaker === 'Candidate' ? 'items-end' : 'items-start'}`}
                >
                  <span className={`text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                    transcriptLines[currentLineIndex].speaker === 'Candidate' ? 'text-gray-400' : 'text-violet-600'
                  }`}>
                    {transcriptLines[currentLineIndex].speaker === 'Candidate' ? null : (
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse shadow-[0_0_8px_rgba(124,58,237,0.8)]"></span>
                    )}
                    {transcriptLines[currentLineIndex].speaker}
                  </span>
                  <div className={`p-5 rounded-2xl text-[15px] font-medium max-w-[90%] leading-relaxed shadow-sm ${
                    transcriptLines[currentLineIndex].speaker === 'Candidate' 
                      ? 'bg-gray-100 border border-gray-200 text-gray-900 rounded-tr-sm' 
                      : 'bg-[#111111] text-white rounded-tl-sm shadow-[0_10px_30px_rgba(0,0,0,0.15)]'
                  }`}>
                    "{transcriptLines[currentLineIndex].text}"
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="bg-[#FAFAFA] rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Follow-up</span>
                <span className="text-gray-900 font-bold">Architecture decisions probed</span>
              </div>
              <div className="h-[1px] w-full bg-gray-200"></div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-bold text-emerald-600 uppercase tracking-wider text-[10px]">Signal</span>
                <span className="text-emerald-600 font-bold">Systems thinking demonstrated</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
