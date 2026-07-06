import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    q: "Is this a real conversation or pre-recorded questions?",
    a: "It's a live voice call. Ishita — Sreeva's AI interviewer — joins the call and conducts the interview in real time. Every question is generated from what the candidate just said. There are no scripts, no fixed question banks, no branching logic. The conversation is genuinely different for every candidate."
  },
  {
    q: "How does Sreeva know what to ask?",
    a: "You upload your JD. Sreeva extracts the skills that matter most for the role — technical depth, ownership signals, domain knowledge. The interview opens on the candidate's resume, digs into their actual work, and follows every thread. If they claim something, Ishita probes it. If they go deep, she goes deeper."
  },
  {
    q: "What does the report actually contain?",
    a: "A combined score (0–100), per-skill breakdown with individual scores, a Hire / Hold / Reject recommendation with reasoning, verbatim evidence quotes pulled directly from the transcript with timestamps, behavioral analysis, and an integrity score. Everything your panel needs to make a decision — without sitting in a call."
  },
  {
    q: "How does it catch cheating or impersonation?",
    a: "Sreeva monitors 12+ behavioral and technical signals throughout the call — including attention patterns, audio anomalies, response cadence shifts, and more. These are combined into a single integrity score. Beyond signals, the adaptive follow-ups themselves expose candidates who can't defend what they claimed — there's no way to script your way through a depth probe."
  },
  {
    q: "How long is the interview?",
    a: "20 minutes. Ishita covers the candidate's resume, digs into key skills from the JD, and asks at least one situational and one behavioral question — all within the time limit. The interview ends when Sreeva signals the close, not before."
  },
  {
    q: "Can I add my own questions?",
    a: "Yes. You can add custom questions when setting up a drive. Ishita weaves them naturally into the conversation — they're always asked before the interview ends, without sounding like a checklist."
  },
  {
    q: "What languages does it support?",
    a: "Hindi and English today. Candidates can interview in the language they think in — Sreeva detects the preferred language and adjusts. More languages are coming."
  },
  {
    q: "Does the AI make the hiring decision?",
    a: "No. Sreeva gives you a structured recommendation backed by evidence from the transcript. Your team makes the final call. The report is designed to make that decision faster and more defensible — not to replace it."
  },
  {
    q: "How do candidates join the interview?",
    a: "They receive a link by email. One click, and Ishita is already on the call. No app to download, no account to create, no scheduling. It works any time, any timezone, on any device with a browser."
  },
  {
    q: "How long does it take to set up a role?",
    a: "Under 10 minutes. Upload your JD, review the extracted skills, invite candidates. The first interview can go out the same day."
  }
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-32 bg-white font-geist" id="faq">
      <div className="max-w-[1280px] mx-auto px-6 flex flex-col lg:flex-row gap-16 lg:gap-24">
        
        {/* Left Side: Header */}
        <div className="w-full lg:w-1/3 lg:sticky lg:top-32 h-max">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="h-[1px] w-8 bg-orange-400"></div>
            <span className="text-orange-500 font-bold uppercase tracking-widest text-[13px]">FAQ</span>
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-[3.5rem] lg:text-[4rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-6"
          >
            Frequently<br/>
            asked <span className="italic font-normal text-gray-400">questions.</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="text-lg text-gray-500 font-medium"
          >
            Can't find an answer? <a href="mailto:support@sreevaai.com" className="text-violet-600 hover:underline">support@sreevaai.com</a>
          </motion.p>
        </div>

        {/* Right Side: Accordions */}
        <div className="w-full lg:w-2/3">
          <div className="divide-y divide-gray-100 border-t border-b border-gray-100">
            {faqs.map((faq, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                className="py-6"
              >
                <button 
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-start justify-between text-left group"
                >
                  <div className="flex gap-6 pr-8">
                    <span className="text-sm font-bold text-gray-300 tracking-wider font-mono pt-1 group-hover:text-violet-400 transition-colors">
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                    <span className={`text-[19px] font-bold tracking-tight transition-colors ${openIndex === i ? 'text-violet-600' : 'text-gray-900 group-hover:text-violet-600'}`}>
                      {faq.q}
                    </span>
                  </div>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${openIndex === i ? 'border-violet-200 bg-violet-50 text-violet-600' : 'border-gray-200 bg-white text-gray-400 group-hover:border-violet-200 group-hover:text-violet-500'}`}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-300 ${openIndex === i ? 'rotate-180' : ''}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </button>
                <AnimatePresence>
                  {openIndex === i && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} 
                      animate={{ height: "auto", opacity: 1 }} 
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pl-14 pt-4 text-[16px] leading-[1.7] text-gray-600 font-medium pb-2 max-w-2xl">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
