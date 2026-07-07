import React from 'react';
import { motion } from 'framer-motion';

export default function CTASection() {
  return (
    <section className="py-32 bg-white font-geist relative overflow-hidden" id="contact">
      <div className="max-w-[1280px] mx-auto px-6 relative z-10">
        
        <motion.div 
          initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full bg-[#111111] rounded-[40px] p-12 md:p-24 text-center relative overflow-hidden shadow-2xl border border-gray-800"
        >
          {/* Background grid for CTA */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-[300px] bg-violet-600 rounded-full blur-[120px] opacity-20 pointer-events-none"></div>

          <div className="relative z-10 flex flex-col items-center">
            <span className="inline-block px-3 py-1 bg-white/10 text-white border border-white/20 rounded-full text-[12px] font-bold uppercase tracking-wider mb-8">
              No scheduling. No debriefs.
            </span>
            <h2 className="text-4xl md:text-[56px] font-bold text-white leading-[1.05] tracking-tight mb-8">
              Watch Ishita run<br/>
              <span className="italic font-normal text-violet-400">a real interview.</span>
            </h2>
            <p className="text-[18px] md:text-[20px] text-gray-400 leading-[1.6] max-w-2xl font-medium mb-12">
              Pick a role from your pipeline. We run Ishita through it live — you see the questions, the follow-ups, and the full report. No slides.
            </p>
            <div className="flex flex-col items-center gap-6">
              <a
                href="https://cal.com/vamsivk/30min"
                className="group relative h-14 px-10 rounded-full bg-white text-gray-900 font-bold hover:scale-105 transition-all shadow-[0_8px_30px_rgba(255,255,255,0.12)] flex items-center gap-3"
              >
                <span>Book 30 minutes →</span>
              </a>
              <div className="text-[14px] text-gray-500 font-medium">
                First screen live the same day
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
