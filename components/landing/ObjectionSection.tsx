import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const objections = [
  {
    question: '"Why not just use LeetCode or HackerRank?"',
    icon: 'code',
    answer: "LeetCode is great for filtering on syntax. It's useless for evaluating judgment, system design, or real-world problem-solving. A senior who aced LeetCode might not survive a design review. Worse — both your team and the candidate waste a combined 3 hours per screen with nothing but a pass/fail score to show for it.",
    verdict: 'Measures memorization, not engineering depth.',
    color: 'orange',
  },
  {
    question: '"Why not send a take-home project?"',
    icon: 'file',
    answer: "In 2025, you have no idea who actually wrote it. 80% of candidates use AI assistance on take-home assignments. Even if they did write it, you still need a senior engineer to grade it — which brings you right back to the exact bottleneck you were trying to skip.",
    verdict: 'Outsourced the work. Imported the problem.',
    color: 'rose',
  },
  {
    question: '"Why not just have a recruiter do a phone screen?"',
    icon: 'phone',
    answer: "Recruiters can't probe distributed systems architecture. Hiring managers can't afford to. So candidates who sound confident slip through — because no one has the time to ask what happens when the cache invalidation event fails at 2am. Ishita does. Every single time.",
    verdict: "Confidence isn't competence. Only depth reveals the difference.",
    color: 'violet',
  },
];

type ColorKey = 'orange' | 'rose' | 'violet';

const colorStyles: Record<ColorKey, Record<string, string>> = {
  orange: {
    border: 'border-orange-200',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    iconBg: 'bg-orange-100 border-orange-200 text-orange-500',
    verdict: 'bg-orange-100 text-orange-700 border-orange-200',
    chevron: 'text-orange-400',
  },
  rose: {
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    iconBg: 'bg-rose-100 border-rose-200 text-rose-500',
    verdict: 'bg-rose-100 text-rose-700 border-rose-200',
    chevron: 'text-rose-400',
  },
  violet: {
    border: 'border-violet-200',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    iconBg: 'bg-violet-100 border-violet-200 text-violet-500',
    verdict: 'bg-violet-100 text-violet-700 border-violet-200',
    chevron: 'text-violet-400',
  },
};

const closedStyles = {
  border: 'border-gray-200',
  bg: 'bg-white',
  text: 'text-gray-900',
  iconBg: 'bg-gray-100 border-gray-200 text-gray-400',
  chevron: 'text-gray-400',
};

export default function ObjectionSection() {
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  return (
    <section className="py-32 bg-white font-geist border-t border-gray-100" id="objections">
      <div className="max-w-[1280px] mx-auto px-6">

        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="flex items-center justify-center gap-3 mb-6"
          >
            <div className="h-[1px] w-8 bg-violet-400"></div>
            <span className="text-violet-600 font-bold uppercase tracking-widest text-[13px]">The objections</span>
            <div className="h-[1px] w-8 bg-violet-400"></div>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-[3rem] lg:text-[4rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-6"
          >
            Why not just use<br/>
            <span className="text-gray-400 font-normal italic">what we already have?</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="text-xl text-gray-500 leading-[1.6] font-medium"
          >
            Fair question. Here is the honest answer for each one.
          </motion.p>
        </div>

        {/* Objection Accordion Cards */}
        <div className="flex flex-col gap-4 max-w-[900px] mx-auto">
          {objections.map((obj, i) => {
            const isOpen = activeIndex === i;
            const c = isOpen ? colorStyles[obj.color as ColorKey] : closedStyles;
            const openC = colorStyles[obj.color as ColorKey];

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className={`rounded-2xl border transition-all duration-300 overflow-hidden ${c.border} ${c.bg}`}
              >
                <button
                  onClick={() => setActiveIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-7 text-left"
                >
                  <div className="flex items-center gap-5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border ${c.iconBg}`}>
                      {obj.icon === 'code' && (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                        </svg>
                      )}
                      {obj.icon === 'file' && (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        </svg>
                      )}
                      {obj.icon === 'phone' && (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                      )}
                    </div>
                    <span className={`text-[18px] font-bold tracking-tight transition-colors ${c.text}`}>
                      {obj.question}
                    </span>
                  </div>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center transition-all ${isOpen ? openC.border : 'border-gray-200'}`}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"
                      className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''} ${c.chevron}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-7 pb-7 pl-[88px]">
                        <p className="text-[16px] text-gray-700 leading-[1.75] font-medium mb-5 max-w-2xl">
                          {obj.answer}
                        </p>
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-[13px] font-bold ${openC.verdict}`}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M18 6 6 18M6 6l12 12"/>
                          </svg>
                          {obj.verdict}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom nudge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}
          className="mt-16 text-center"
        >
          <p className="text-gray-500 font-medium text-[16px] mb-6">
            The right question is not <em className="text-gray-700 not-italic font-bold">why Sreeva?</em> — it is{' '}
            <em className="text-gray-700 not-italic font-bold">how much longer can you afford the old way?</em>
          </p>
          <a
            href="https://cal.com/vamsivk/30min"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#111111] text-white rounded-full font-bold text-[14px] hover:bg-gray-800 transition-colors shadow-md"
          >
            See it live on your next role
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
          </a>
        </motion.div>

      </div>
    </section>
  );
}
