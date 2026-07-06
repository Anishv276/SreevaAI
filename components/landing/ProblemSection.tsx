import React from 'react';
import { motion } from 'framer-motion';

const problems = [
  {
    icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
    title: "Unqualified candidates advance.",
    desc: "They pass keyword screens and waste your hiring manager's time in deep interviews.",
    stat: "42%",
    statDesc: "of resumes contain claims with no supporting evidence."
  },
  {
    icon: <path d="M2 12h20M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0" />,
    title: "Questions lack depth.",
    desc: "Every interviewer asks something different. No one digs deep enough, no one stays consistent.",
    stat: "3.4x",
    statDesc: "variance between two interviewers on the same role."
  },
  {
    icon: <path d="m21 16-4 4-4-4M17 20V4M7 4v16M3 8l4-4 4 4" />,
    title: "Resume skills don't stick.",
    desc: "Candidates claim expertise. The first follow-up exposes them repeating resume language verbatim.",
    stat: "1 in 3",
    statDesc: "\"expert\" claims collapse on the second probe."
  }
];

export default function ProblemSection() {
  return (
    <section className="py-32 bg-[#FAFAFA] font-geist" id="problem">
      <div className="max-w-[1280px] mx-auto px-6">
        
        <div className="max-w-3xl mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="h-[1px] w-8 bg-orange-400"></div>
            <span className="text-orange-500 font-bold uppercase tracking-widest text-[13px]">The problem</span>
          </motion.div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-[3.5rem] lg:text-[4.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-8"
          >
            Resumes <span className="text-gray-400 font-normal">lie.</span><br/>
            Interviewers <span className="text-gray-400 font-normal">guess.</span><br/>
            Your team <span className="text-gray-400 font-normal">burns out.</span>
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="text-xl md:text-[22px] text-gray-500 leading-[1.6] max-w-2xl font-medium"
          >
            Scripted questions can't catch what candidates are hiding. Your interviewers aren't asking at the same depth. And one bad hire is costing you more than you think.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10">
          {problems.map((prob, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.6 }}
              className="group flex flex-col"
            >
              <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center mb-8 shadow-sm group-hover:border-violet-300 group-hover:shadow-[0_0_15px_rgba(124,58,237,0.1)] transition-all">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 group-hover:text-violet-600 transition-colors">
                  {prob.icon}
                </svg>
              </div>

              <h3 className="text-[22px] font-bold text-gray-900 mb-4 tracking-tight leading-tight">
                {prob.title}
              </h3>
              
              <p className="text-gray-500 text-[15px] leading-[1.6] mb-12 font-medium">
                {prob.desc}
              </p>

              <div className="mt-auto pt-8 border-t border-gray-200/60">
                <div className="flex flex-col">
                  <span className="text-4xl font-extrabold text-[#111111] tracking-tighter mb-2">{prob.stat}</span>
                  <span className="text-[14px] text-gray-500 font-medium leading-[1.5] max-w-[200px]">{prob.statDesc}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
