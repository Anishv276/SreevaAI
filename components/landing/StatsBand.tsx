import React from 'react';
import { motion } from 'framer-motion';

const stats = [
  { val: "< 60s", txt: "Report ready before the candidate closes the tab" },
  { val: "20 min", txt: "Fixed interview length, every candidate, no exceptions" },
  { val: "0", txt: "Calendars blocked, calls scheduled, debriefs held — by your team" },
  { val: "17", txt: "Signals tracked silently. One trust score at the end." }
];

export default function StatsBand() {
  return (
    <section className="bg-[#FAFAFA] pt-16 pb-16 font-geist">
      <div className="max-w-[1280px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 divide-x divide-gray-200/50">
          {stats.map((s, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.1 }}
              className={`flex flex-col ${i !== 0 ? 'md:pl-12' : ''}`}
            >
              <div className="text-[32px] md:text-[40px] font-extrabold text-[#111111] tracking-tighter mb-2 leading-none">
                {s.val}
              </div>
              <p className="text-[14px] text-gray-500 font-medium leading-[1.6]">
                {s.txt}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
