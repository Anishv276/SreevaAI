'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    q: "Is this a real conversation or pre-recorded questions?",
    a: "It's a live voice call. Ishita joins the call and conducts the interview in real time. Every question is generated from what the candidate just said — their resume, their last answer, and the JD you uploaded. No scripts, no fixed question banks."
  },
  {
    q: "How does Ishita know what to probe for a technical role?",
    a: "You upload the JD. Sreeva extracts the required skills, seniority level, and architectural context — then builds a custom interview matrix. Ishita opens on the candidate's resume and follows every technical thread. If they claim ownership of a distributed system, she asks what broke first."
  },
  {
    q: "Can she tell when a candidate is bluffing?",
    a: "Yes — and not through surveillance. The adaptive follow-ups themselves are the fraud detection. A candidate can rehearse what Redis is. They cannot rehearse what they did at 2am when TTL-based invalidation failed under 40k req/s. Ishita goes three levels deep. Depth exposes gaps that rehearsal can't cover."
  },
  {
    q: "What's in the interview report?",
    a: "A score (0–100), per-skill technical breakdown, a resume credibility score, an integrity score, and verbatim quotes from the transcript with timestamps. Everything your panel needs — without sitting in a debrief."
  },
  {
    q: "How long is each interview?",
    a: "20 minutes. Fixed. Ishita covers technical depth, ownership signals, and at least one behavioral question within the window. The interview ends when Sreeva signals the close — not before."
  },
  {
    q: "Do candidates need to install anything?",
    a: "No. They get a link by email. One click and Ishita is already on the call. No app download, no account creation, no scheduling. Works on any device with a browser — any timezone, any time."
  },
  {
    q: "Can I add my own questions?",
    a: "Yes. You can add custom questions per role when setting up a drive. Ishita weaves them naturally into the conversation — they're always asked before the interview closes, without sounding like a checklist."
  },
  {
    q: "Does Sreeva make the hiring decision?",
    a: "No. You do. Sreeva gives you a structured, evidence-backed report from the transcript. It's designed to make your decision faster and more defensible — not to replace it."
  },
  {
    q: "Is this only for software engineers, or other roles too?",
    a: "Technical roles only, by design — backend, frontend, full-stack, data/ML engineers, DevOps/SRE, and QA. We'd rather be excellent at first-round technical screening than mediocre at every role."
  },
  {
    q: "How is this different from Karat or other interview-as-a-service providers?",
    a: "Karat and similar services staff human engineers to run your interviews — strong signal, but it doesn't scale down and costs $300+ per interview. Ishita runs the same depth of probing autonomously, 24/7, at a fraction of the cost."
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-32 bg-white font-geist border-t border-gray-100" id="faq">
      <div className="max-w-[1280px] mx-auto px-6 flex flex-col lg:flex-row gap-16 lg:gap-24">

        {/* Left: Sticky header */}
        <div className="w-full lg:w-1/3 lg:sticky lg:top-32 h-max">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="flex items-center gap-3 mb-6"
          >
            <span className="inline-flex items-center px-4 py-1.5 bg-white border border-gray-200 shadow-sm text-gray-900 rounded-full text-[11px] font-extrabold uppercase tracking-widest">
              FAQ
            </span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-[3.5rem] lg:text-[4rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-6"
          >
            Questions<br />
            <span className="italic font-normal text-gray-400">worth asking.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="text-lg text-gray-500 font-medium"
          >
            Still have one?{' '}
            <a href="mailto:support@sreevaai.com" className="text-violet-600 hover:underline font-bold">support@sreevaai.com</a>
          </motion.p>
        </div>

        {/* Right: Accordion */}
        <div className="w-full lg:w-2/3">
          <div className="divide-y divide-gray-100 border-t border-b border-gray-100">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: i * 0.04, duration: 0.4, ease: 'easeOut' }}
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
                    <span className={`text-[18px] font-bold tracking-tight leading-snug transition-colors ${openIndex === i ? 'text-violet-600' : 'text-gray-900 group-hover:text-violet-600'}`}>
                      {faq.q}
                    </span>
                  </div>
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-all mt-0.5 ${openIndex === i ? 'border-violet-200 bg-violet-50 text-violet-600' : 'border-gray-200 bg-white text-gray-400 group-hover:border-violet-200 group-hover:text-violet-500'}`}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-300 ${openIndex === i ? 'rotate-180' : ''}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </button>

                <AnimatePresence>
                  {openIndex === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pl-14 pt-4 text-[15px] leading-[1.75] text-gray-600 font-medium pb-2 max-w-2xl">
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
