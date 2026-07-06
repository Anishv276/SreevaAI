import React from 'react';
import { motion } from 'framer-motion';

export default function PlatformSection() {
  return (
    <section className="py-32 bg-white font-geist overflow-hidden" id="platform">
      <div className="max-w-[1280px] mx-auto px-6">
        
        {/* Header */}
        <div className="max-w-3xl mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="h-[1px] w-8 bg-orange-400"></div>
            <span className="text-orange-500 font-bold uppercase tracking-widest text-[13px]">The platform</span>
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-[3.5rem] lg:text-[4.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-8"
          >
            One adaptive engine.<br/>
            Two reports.
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="text-xl md:text-[22px] text-gray-500 leading-[1.6] max-w-3xl font-medium"
          >
            Before the call, the <strong className="text-gray-900 font-bold">Resume Report</strong> grades the candidate against the JD and flags every claim that lacks proof. After the call, the <strong className="text-gray-900 font-bold">Interview Report</strong> grades the candidate on what they actually said — with evidence quotes, integrity signals, and a hire recommendation.
          </motion.p>
        </div>

        {/* Two Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-40">
          
          {/* Resume Report */}
          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="bg-[#FAFAFA] rounded-[32px] p-10 lg:p-14 border border-gray-100 flex flex-col h-full relative"
          >
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">01 Before the call</span>
                <div className="h-[1px] flex-1 bg-gray-200"></div>
                <span className="px-3 py-1 bg-white text-gray-900 rounded-full text-[11px] font-bold border border-gray-200 uppercase tracking-wider shadow-sm">Pre-screen</span>
              </div>
              <h3 className="text-[32px] font-bold text-gray-900 tracking-tight mb-4">Resume Report</h3>
              <p className="text-gray-500 text-[16px] leading-[1.6] font-medium max-w-sm">
                We parse every resume against the JD, weight each claim by recency and proof, and pre-flag the claims that need probing in the live interview.
              </p>
            </div>
            
            {/* Minimalist Dashboard Card Replica */}
            <div className="mt-auto bg-white rounded-2xl p-8 shadow-[0_20px_40px_rgba(0,0,0,0.04)] border border-gray-100/50">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-1">JD-fit score</div>
                  <div className="text-[14px] font-semibold text-gray-900">9 of 11 anchors matched</div>
                </div>
                <div className="text-4xl font-extrabold text-gray-900 tracking-tighter">87</div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                  <div>
                    <div className="text-[10px] font-bold text-emerald-600 mb-1 uppercase tracking-widest bg-emerald-50 inline-block px-1.5 rounded">Claim</div>
                    <div className="text-[14px] font-bold text-gray-900">React, 6 yrs</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Strong evidence</div>
                    <div className="text-[16px] font-bold text-gray-900">96</div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-orange-600 mb-1 uppercase tracking-widest bg-orange-50 inline-block px-1.5 rounded">Probe</div>
                    <div className="text-[14px] font-bold text-gray-900">"Optimised LCP" <span className="font-medium text-gray-400">— no metric</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Weak</div>
                    <div className="text-[16px] font-bold text-gray-900">34</div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-dashed border-gray-200 flex items-center justify-between">
                <span className="text-[12px] font-bold text-violet-600 uppercase tracking-widest">Auto-routed to interview</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-violet-600"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </div>
            </div>
          </motion.div>

          {/* Interview Report */}
          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="bg-white rounded-[32px] p-10 lg:p-14 border border-gray-200 shadow-[0_20px_60px_rgba(0,0,0,0.06)] flex flex-col h-full relative"
          >
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">02 After the call</span>
                <div className="h-[1px] flex-1 bg-gray-200"></div>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[11px] font-bold border border-emerald-100 uppercase tracking-wider shadow-sm">Strong hire</span>
              </div>
              <h3 className="text-[32px] font-bold text-gray-900 tracking-tight mb-4">Interview Report</h3>
              <p className="text-gray-500 text-[16px] leading-[1.6] font-medium max-w-sm">
                After 20 minutes, you get a per-skill breakdown with verbatim evidence, every integrity signal, and a clear Hire / Hold / Reject recommendation.
              </p>
            </div>
            
            {/* Minimalist Dashboard Card Replica */}
            <div className="mt-auto bg-[#FAFAFA] rounded-2xl p-8 border border-gray-100">
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>
                  </div>
                  <div>
                    <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-1">Recommendation</div>
                    <div className="text-[18px] font-bold text-gray-900">Hire</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-1">Overall</div>
                  <div className="text-4xl font-extrabold text-gray-900 tracking-tighter">94</div>
                </div>
              </div>
              
              <div className="space-y-5 mb-8">
                <div>
                  <div className="flex justify-between text-[13px] font-bold text-gray-900 mb-2"><span>React depth</span><span className="text-gray-500">96</span></div>
                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div className="bg-violet-600 h-full w-[96%] rounded-full"></div></div>
                </div>
                <div>
                  <div className="flex justify-between text-[13px] font-bold text-gray-900 mb-2"><span>System design</span><span className="text-gray-500">82</span></div>
                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div className="bg-violet-600 h-full w-[82%] rounded-full"></div></div>
                </div>
                <div>
                  <div className="flex justify-between text-[13px] font-bold text-gray-900 mb-2"><span>Integrity</span><span className="text-gray-500">98</span></div>
                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div className="bg-violet-600 h-full w-[98%] rounded-full"></div></div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative">
                <div className="absolute -left-2 top-4 w-1 h-8 bg-gray-200 rounded-r"></div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Verbatim 00:11:24</span>
                <p className="text-[13px] text-gray-900 font-medium leading-relaxed italic">
                  "Once Cart stopped re-rendering on every scroll, the dropdown felt instant — saved roughly 40 unnecessary renders a second."
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Core Engine Callout */}
        <div className="flex flex-col lg:flex-row gap-16 items-center mb-40">
          
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="w-full lg:w-1/2">
            <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[11px] font-bold uppercase tracking-widest mb-6">Core engine</span>
            <h3 className="text-[2.5rem] lg:text-[3.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-4">
              An adaptive interview engine.
            </h3>
            <p className="text-[20px] text-violet-600 font-semibold mb-6">No other platform does this.</p>
            <p className="text-[17px] text-gray-500 leading-[1.6] font-medium mb-12 max-w-md">
              No two interviews are the same. Sreeva reads each answer and decides what to ask next — probing deeper when a candidate knows their craft, pivoting when they don't. The interview shapes itself around the person, not a template.
            </p>
            <div className="flex gap-12 border-t border-gray-100 pt-8">
              <div>
                <div className="text-[40px] font-extrabold text-gray-900 tracking-tighter mb-1 leading-none">100%</div>
                <div className="text-[12px] text-gray-400 font-bold uppercase tracking-wider max-w-[120px]">of questions adapt to the answer</div>
              </div>
              <div>
                <div className="text-[40px] font-extrabold text-gray-900 tracking-tighter mb-1 leading-none">0</div>
                <div className="text-[12px] text-gray-400 font-bold uppercase tracking-wider max-w-[120px]">scripted templates, ever</div>
              </div>
            </div>
          </motion.div>

          {/* Premium Chat UI */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            className="w-full lg:w-1/2 bg-[#FAFAFA] rounded-[32px] border border-gray-200/60 p-8 shadow-[0_20px_40px_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Adaptive Probe in action</div>
            </div>

            <div className="space-y-8 mb-8">
              {/* Candidate */}
              <div className="flex flex-col items-end">
                <span className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Candidate</span>
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tr-sm p-5 text-[15px] text-gray-900 font-medium max-w-[85%] leading-relaxed">
                  "I built an API that fetches user preferences from a cache instead of the database every time."
                </div>
              </div>
              
              {/* AI */}
              <div className="flex flex-col items-start relative">
                <span className="text-[11px] font-bold text-violet-600 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse"></span> Sreeva · Adapting
                </span>
                <div className="bg-[#111111] text-white shadow-xl rounded-2xl rounded-tl-sm p-5 text-[15px] font-medium max-w-[85%] leading-relaxed">
                  "Walk me through that. What cache layer did you choose? How did you handle cache invalidation when preferences change?"
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Follow-up</span>
                <span className="text-gray-900 font-bold">Architecture decisions probed</span>
              </div>
              <div className="h-[1px] w-full bg-gray-50"></div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Evidence</span>
                <span className="text-gray-900 font-bold">Cache layer & invalidation</span>
              </div>
              <div className="h-[1px] w-full bg-gray-50"></div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-bold text-emerald-600 uppercase tracking-wider text-[10px]">Signal</span>
                <span className="text-emerald-600 font-bold">Systems thinking demonstrated</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Capabilities Header */}
        <div className="mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="flex items-center gap-3">
            <div className="h-[1px] w-8 bg-orange-400"></div>
            <span className="text-orange-500 font-bold uppercase tracking-widest text-[13px]">And underneath, the engine that powers both</span>
          </motion.div>
        </div>

        {/* Premium Capability Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="group p-10 rounded-[32px] bg-[#FAFAFA] border border-gray-100 hover:bg-white hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] hover:border-gray-200 transition-all flex flex-col h-full">
            <div className="flex justify-between items-start mb-8">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">01</span>
              <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center group-hover:bg-violet-50 transition-colors">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 group-hover:text-violet-600"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
            </div>
            <h4 className="text-[24px] font-bold text-gray-900 mb-4 tracking-tight leading-tight">Smart follow-ups</h4>
            <p className="text-gray-500 text-[15px] leading-[1.6] font-medium mb-8">Sreeva listens for vague claims, missing numbers, and credit-sharing language — then asks the question your best engineer would ask next.</p>
            <div className="flex flex-wrap gap-2 mt-auto">
              <span className="px-3 py-1.5 text-[11px] font-bold bg-white border border-gray-200 text-gray-600 rounded-lg shadow-sm">"we built it"</span>
              <span className="px-3 py-1.5 text-[11px] font-bold bg-white border border-gray-200 text-gray-600 rounded-lg shadow-sm">"around 40%"</span>
              <span className="px-3 py-1.5 text-[11px] font-bold bg-white border border-gray-200 text-gray-600 rounded-lg shadow-sm">no tool named</span>
              <span className="px-3 py-1.5 text-[11px] font-bold bg-violet-50 border border-violet-100 text-violet-600 rounded-lg shadow-sm">? probe</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="group p-10 rounded-[32px] bg-[#FAFAFA] border border-gray-100 hover:bg-white hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] hover:border-gray-200 transition-all flex flex-col h-full">
            <div className="flex justify-between items-start mb-8">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">02</span>
              <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 group-hover:text-emerald-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
            </div>
            <h4 className="text-[24px] font-bold text-gray-900 mb-4 tracking-tight leading-tight">Integrity proctoring</h4>
            <p className="text-gray-500 text-[15px] leading-[1.6] font-medium mb-8">Every interview is silently monitored across a dozen behavioral and technical signals. At the end, you get a single integrity score — not a list to interpret.</p>
            <div className="mt-auto flex items-end gap-3">
              <div className="text-[48px] font-extrabold text-gray-900 tracking-tighter leading-none">12+</div>
              <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2">cheat detectors,<br/>one trust score</div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="group p-10 rounded-[32px] bg-[#FAFAFA] border border-gray-100 hover:bg-white hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] hover:border-gray-200 transition-all flex flex-col h-full">
            <div className="flex justify-between items-start mb-8">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">03</span>
              <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center group-hover:bg-orange-50 transition-colors">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 group-hover:text-orange-600"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
              </div>
            </div>
            <h4 className="text-[24px] font-bold text-gray-900 mb-4 tracking-tight leading-tight">Multilingual</h4>
            <p className="text-gray-500 text-[15px] leading-[1.6] font-medium mb-8">Candidates perform better in their native tongue. Sreeva supports Hindi and English today — with more coming.</p>
            <div className="flex gap-3 mt-auto">
              <span className="px-4 py-2 text-[12px] font-bold bg-[#111111] text-white rounded-full shadow-sm">English</span>
              <span className="px-4 py-2 text-[12px] font-bold bg-white text-gray-900 rounded-full border border-gray-200 shadow-sm">Hindi</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }} className="group p-10 rounded-[32px] bg-[#FAFAFA] border border-gray-100 hover:bg-white hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] hover:border-gray-200 transition-all flex flex-col h-full">
            <div className="flex justify-between items-start mb-8">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">04</span>
              <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 group-hover:text-blue-600"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
            </div>
            <h4 className="text-[24px] font-bold text-gray-900 mb-4 tracking-tight leading-tight">Economics</h4>
            <p className="text-gray-500 text-[15px] leading-[1.6] font-medium mb-8">Your engineers spend hours on first-round interviews that Sreeva handles in 20 minutes — running overnight, across timezones.</p>
            <div className="space-y-4 mt-auto w-full bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <div>
                <div className="flex justify-between text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest"><span>Engineer hours per role</span><span>4 hrs</span></div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full"></div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-bold text-violet-600 mb-1.5 uppercase tracking-widest"><span>With Sreeva</span><span>20 min</span></div>
                <div className="w-[10%] h-1.5 bg-violet-600 rounded-full"></div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
