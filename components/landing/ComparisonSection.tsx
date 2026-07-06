import React from 'react';
import { motion } from 'framer-motion';

const comparisons = [
  {
    feature: "Questions asked",
    traditional: "Same script every candidate, every time",
    sreeva: "Generated live from the JD and what they just said"
  },
  {
    feature: "Vague claims",
    traditional: "Interviewer moves on or misses them",
    sreeva: "Ishita probes every hedge — ownership, metric, tool"
  },
  {
    feature: "Fraud detection",
    traditional: "No way to know who actually showed up",
    sreeva: "12+ behavioral signals scored into one integrity number"
  },
  {
    feature: "Consistency",
    traditional: "Varies by interviewer mood, time, and experience",
    sreeva: "Identical depth and rigor for every single candidate"
  },
  {
    feature: "What you receive",
    traditional: "Notes that depend on who took them",
    sreeva: "Score, per-skill breakdown, verbatim evidence, verdict"
  },
  {
    feature: "Time to decision",
    traditional: "Days of scheduling, calls, and debrief",
    sreeva: "Report ready the moment the call ends"
  }
];

export default function ComparisonSection() {
  return (
    <section className="py-32 bg-[#FAFAFA] font-geist border-t border-gray-100/60" id="compare">
      <div className="max-w-[1280px] mx-auto px-6">
        
        <div className="max-w-3xl mb-24 mx-auto text-center flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="h-[1px] w-8 bg-orange-400"></div>
            <span className="text-orange-500 font-bold uppercase tracking-widest text-[13px]">Why Sreeva</span>
            <div className="h-[1px] w-8 bg-orange-400"></div>
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-[3.5rem] lg:text-[4.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-8"
          >
            What you get that no<br/>
            other tool gives you.
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="text-xl md:text-[22px] text-gray-500 leading-[1.6] max-w-2xl font-medium"
          >
            Most tools record the interview. Sreeva conducts it — and hands you the verdict.
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          className="w-full bg-white border border-gray-200 rounded-[32px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.04)]"
        >
          {/* Header Row */}
          <div className="flex bg-gray-50/50 border-b border-gray-200 p-6 md:p-8 hidden md:flex">
            <div className="w-1/4 text-[13px] font-bold text-gray-400 uppercase tracking-widest">What matters</div>
            <div className="w-1/3 text-[13px] font-bold text-gray-400 uppercase tracking-widest pl-8 border-l border-transparent">Traditional screening</div>
            <div className="w-5/12 text-[13px] font-bold text-violet-600 uppercase tracking-widest pl-8 border-l border-gray-200 bg-violet-50/30">Sreeva AI</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-gray-100">
            {comparisons.map((item, i) => (
              <div key={i} className="flex flex-col md:flex-row p-6 md:p-8 hover:bg-gray-50/50 transition-colors group">
                <div className="w-full md:w-1/4 flex items-center md:items-start text-[16px] font-bold text-gray-900 mb-4 md:mb-0 pr-4">
                  {item.feature}
                </div>
                
                <div className="w-full md:w-1/3 flex flex-col md:flex-row items-start text-[15px] font-medium text-gray-500 md:pl-8 mb-6 md:mb-0 relative border-l-0 md:border-l border-transparent">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-400"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </div>
                    <span>{item.traditional}</span>
                  </div>
                </div>
                
                <div className="w-full md:w-5/12 flex flex-col md:flex-row items-start text-[16px] font-bold text-gray-900 md:pl-8 relative border-l-0 md:border-l border-gray-200 group-hover:border-violet-200 transition-colors bg-white md:bg-transparent">
                  <div className="absolute inset-0 bg-violet-50/0 group-hover:bg-violet-50/50 transition-colors -z-10 md:-ml-[1px]"></div>
                  <div className="flex items-start gap-3 relative z-10">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-600"><path d="M20 6 9 17l-5-5"/></svg>
                    </div>
                    <span>{item.sreeva}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}
