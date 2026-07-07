import React from 'react';
import { motion } from 'framer-motion';

const comparisons = [
  {
    feature: "How depth is measured",
    traditional: "Passed/failed test cases or static code submission",
    sreeva: "Live conversational probing — 3 levels deep on every claim"
  },
  {
    feature: "Engineering time",
    traditional: "60–90 min of a Senior Engineer per candidate",
    sreeva: "Zero. Ishita runs every screen end to end."
  },
  {
    feature: "Consistency",
    traditional: "Varies by who's interviewing and how tired they are",
    sreeva: "Same structured depth for every candidate, every time"
  },
  {
    feature: "Fraud & integrity",
    traditional: "No real-time detection. Trust and hope.",
    sreeva: "12 behavioral signals scored live. Adaptive follow-ups expose gaps."
  },
  {
    feature: "What you receive",
    traditional: "A score. Maybe notes if they remembered to type them.",
    sreeva: "Per-skill scores, verbatim evidence with timestamps, resume credibility"
  },
  {
    feature: "Time to decision",
    traditional: "Days of back-and-forth after the screen",
    sreeva: "Full report ready the moment the call ends"
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
            <span className="inline-flex items-center px-4 py-1.5 bg-white border border-gray-200 shadow-sm text-gray-900 rounded-full text-[11px] font-extrabold uppercase tracking-widest">Why Sreeva</span>
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-[3.5rem] lg:text-[4.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-8"
          >
            What changes when<br/>
            <span className="text-gray-400 font-normal italic">Ishita runs the screen.</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="text-xl md:text-[22px] text-gray-500 leading-[1.6] max-w-2xl font-medium"
          >
            Everything your current process isn't.
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          className="w-full bg-white border border-gray-200 rounded-[32px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.04)]"
        >
          {/* Header Row */}
          <div className="flex bg-gray-50/50 border-b border-gray-200 p-6 md:p-8 hidden md:flex">
            <div className="w-1/4 text-[13px] font-bold text-gray-400 uppercase tracking-widest">What matters</div>
            <div className="w-1/3 text-[13px] font-bold text-gray-400 uppercase tracking-widest pl-8 border-l border-transparent">Without Ishita</div>
            <div className="w-5/12 text-[13px] font-bold text-violet-600 uppercase tracking-widest pl-8 border-l border-gray-200 bg-violet-50/30">With Ishita</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-gray-100">
            {comparisons.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: 'easeOut' }}
                className="flex flex-col md:flex-row p-6 md:p-8 hover:bg-violet-50/20 transition-colors group"
              >
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
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}
