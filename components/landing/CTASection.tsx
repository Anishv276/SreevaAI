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
            <span className="inline-block px-3 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full text-[12px] font-bold uppercase tracking-wider mb-8">
              Ready when you are
            </span>
            <h2 className="text-4xl md:text-[56px] font-bold text-white leading-[1.05] tracking-tight mb-8">
              See exactly what your<br/>
              candidates <span className="italic font-normal text-violet-400">actually know.</span>
            </h2>
            <p className="text-[18px] md:text-[20px] text-gray-400 leading-[1.6] max-w-2xl font-medium mb-12">
              Book a 30-minute walkthrough. We'll run Ishita on a real role from your pipeline — you'll see the interview, the probes, and the report. Live.
            </p>
            <div className="flex flex-col items-center gap-6">
              <button className="group relative h-14 px-10 rounded-full bg-white text-gray-900 font-bold hover:scale-105 transition-all shadow-[0_8px_30px_rgba(255,255,255,0.12)] flex items-center gap-3">
                <span>Book a demo</span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-1 transition-transform"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
              <div className="text-[14px] text-gray-500 font-medium">
                No commitment · <span className="font-bold text-gray-300">Setup in under 10 min</span>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
