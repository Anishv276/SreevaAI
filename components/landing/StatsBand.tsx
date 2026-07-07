import React from 'react';
import { motion } from 'framer-motion';

const stats = [
  { val: "20 min", txt: "Every first-round screen. Same depth, every single time." },
  { val: "0 hrs", txt: "Of your senior engineers' time. Per candidate." },
  { val: "12", txt: "Behavioral signals scored silently on every call." },
  { val: "< 60s", txt: "From call end to full hire/no-hire report in your inbox." },
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
