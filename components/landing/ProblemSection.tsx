'use client';
import React from 'react';
import { motion, type Variants } from 'framer-motion';

const problems = [
  {
    num: "01",
    title: "It takes 2 weeks.",
    desc: "Scheduling a first-round technical screen means 6 emails, 3 calendars, and a Zoom link. By then, your best candidate has two other offers.",
    stat: "13 days",
    statDesc: "Avg time from resume shortlist to first technical screen.",
    accent: "from-violet-500/10 to-violet-500/0",
    border: "group-hover:border-violet-200",
    statColor: "text-violet-700",
  },
  {
    num: "02",
    title: "Every call is different.",
    desc: "Two engineers interviewing the same candidate ask completely different questions. One passes. One rejects. Neither knows why the other decided.",
    stat: "3.4×",
    statDesc: "Score variance for the same candidate across interviewers.",
    accent: "from-indigo-500/10 to-indigo-500/0",
    border: "group-hover:border-indigo-200",
    statColor: "text-indigo-700",
  },
  {
    num: "03",
    title: "Depth is easy to fake.",
    desc: "A candidate who's rehearsed their resume can sound confident for 20 minutes. Ishita doesn't do surface-level — she follows every claim until it holds or breaks.",
    stat: "1 in 3",
    statDesc: "\"Strong\" claims collapse under Ishita's second follow-up.",
    accent: "from-purple-500/10 to-purple-500/0",
    border: "group-hover:border-purple-200",
    statColor: "text-purple-700",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function ProblemSection() {
  return (
    <section className="py-20 bg-[var(--background)] font-geist text-gray-900 border-t border-hairline" id="problem">
      <div className="max-w-[1200px] mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl mb-20 text-center mx-auto flex flex-col items-center"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="inline-flex items-center px-4 py-1.5 bg-white border border-gray-200 shadow-sm text-gray-900 rounded-full text-[11px] font-extrabold uppercase tracking-widest">
              The gap
            </span>
          </div>
          <h2 className="text-[2.5rem] lg:text-[3.2rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-5">
            First rounds are your<br />
            <span className="text-gray-400 font-normal italic">biggest blind spot.</span>
          </h2>
          <p className="text-[17px] text-gray-500 leading-[1.6] font-medium max-w-2xl">
            Resume keywords get candidates to the first call. What happens on that call determines everything — and right now, it is inconsistent, rushed, and expensive.
          </p>
        </motion.div>

        {/* 3-Column Premium Minimalist Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8"
        >
          {problems.map((prob, i) => (
            <motion.div
              key={i}
              variants={cardVariants}
              className={`group bg-white border border-hairline ${prob.border} rounded-[28px] overflow-hidden shadow-sm hover:shadow-diffused hover:-translate-y-1 transition-all duration-500 p-8 flex flex-col`}
            >
              {/* Top: Icon & Number */}
              <div className="flex items-start justify-between mb-8">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border bg-gradient-to-b ${i === 0 ? 'from-violet-50 to-white border-violet-100 text-violet-600' : i === 1 ? 'from-indigo-50 to-white border-indigo-100 text-indigo-600' : 'from-purple-50 to-white border-purple-100 text-purple-600'}`}>
                  {i === 0 && <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                  {i === 1 && <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
                  {i === 2 && <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>}
                </div>
                <span className="text-[13px] font-mono font-bold text-gray-300 tracking-widest mt-1 group-hover:text-gray-400 transition-colors">{prob.num}</span>
              </div>

              {/* Title & Desc */}
              <h3 className="text-[22px] font-extrabold text-gray-900 mb-3 tracking-tight leading-tight">{prob.title}</h3>
              <p className="text-[15px] text-gray-500 font-medium leading-[1.65] mb-10 flex-1">
                {prob.desc}
              </p>

              {/* Stat - Stacked cleanly */}
              <div className="pt-6 border-t border-gray-100">
                <div className={`text-[42px] font-extrabold tracking-tighter leading-none mb-2 ${prob.statColor}`}>
                  {prob.stat}
                </div>
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                  {prob.statDesc}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
