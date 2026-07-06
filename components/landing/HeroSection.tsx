import React from 'react';
import { motion } from 'framer-motion';

export default function HeroSection() {
  return (
    <section className="relative pt-40 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-white font-geist min-h-[90vh] flex items-center">
      
      {/* Background Ornaments */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none"></div>
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-violet-400/20 via-fuchsia-400/10 to-transparent rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

      <div className="max-w-[1280px] mx-auto px-6 relative z-10 w-full flex flex-col lg:flex-row items-center gap-16 lg:gap-20">
        
        {/* Left Content */}
        <div className="w-full lg:w-[55%] flex flex-col items-start text-left pt-10">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-orange-50 border border-orange-100 mb-8 shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
            <span className="text-[13px] font-bold text-orange-600 uppercase tracking-widest">Adaptive AI Interviews</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[4rem] sm:text-[5rem] lg:text-[5.5rem] font-extrabold text-[#111111] leading-[1.02] tracking-tighter mb-8"
          >
            Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">AI interviewer</span><br/>is already waiting.
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-xl sm:text-[22px] text-gray-500 leading-[1.6] max-w-xl font-medium mb-12"
          >
            Sreeva runs your first-round interviews end to end — adaptive questions, real follow-ups, and a hire decision waiting for you in 20 minutes.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-5 w-full sm:w-auto"
          >
            <a 
              href="https://cal.com/vamsivk/30min" 
              className="w-full sm:w-auto px-8 py-4 bg-[#111111] text-white rounded-full font-bold text-[16px] shadow-[0_8px_20px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_30px_rgba(124,58,237,0.2)] transition-all hover:bg-violet-600 flex items-center justify-center gap-2 group"
            >
              <span>Book a demo</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-1 transition-transform"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
            <div className="flex items-center gap-4 text-sm font-semibold text-gray-500">
              <span className="flex items-center gap-1.5"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500"><path d="M20 6 9 17l-5-5"/></svg> No credit card</span>
            </div>
          </motion.div>
        </div>

        {/* Right Content: Floating UI / Mobile Mockup */}
        <div className="w-full lg:w-[45%] relative">
          <motion.div 
            initial={{ opacity: 0, x: 40, rotateY: 20 }} 
            animate={{ opacity: 1, x: 0, rotateY: 0 }} 
            transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative perspective-[2000px]"
          >
            {/* The Glass Interface */}
            <div className="relative w-full max-w-[440px] mx-auto bg-white/70 backdrop-blur-2xl rounded-[32px] border border-white/50 shadow-[0_40px_100px_rgba(0,0,0,0.08),inset_0_2px_4px_rgba(255,255,255,0.8)] p-6 overflow-hidden transform-gpu rotate-y-[-5deg] rotate-x-[2deg]">
              
              {/* Header inside UI */}
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img src="https://ui-avatars.com/api/?name=Ishita&background=7c3aed&color=fff&size=40" alt="Ishita" className="w-10 h-10 rounded-full shadow-sm" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full"></div>
                  </div>
                  <div>
                    <div className="text-[14px] font-bold text-gray-900">Ishita (Sreeva AI)</div>
                    <div className="text-[11px] font-semibold text-violet-600 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse"></span> Interviewing
                    </div>
                  </div>
                </div>
                <div className="text-[14px] font-mono font-bold text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">11:24</div>
              </div>

              {/* Waveform / Visualizer */}
              <div className="h-24 bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-gray-100/50 mb-6 flex items-center justify-center gap-1.5 overflow-hidden relative">
                <div className="absolute inset-0 bg-violet-500/5 blur-xl"></div>
                {[...Array(20)].map((_, i) => (
                  <motion.div 
                    key={i}
                    animate={{ height: ["20%", "80%", "20%"] }}
                    transition={{ duration: 1 + Math.random(), repeat: Infinity, ease: "easeInOut" }}
                    className="w-1.5 bg-violet-400 rounded-full"
                  />
                ))}
              </div>

              {/* Chat bubbles */}
              <div className="space-y-4">
                <div className="flex flex-col items-end">
                  <div className="bg-gray-100 border border-gray-200/50 rounded-2xl rounded-tr-sm p-4 text-[13px] text-gray-700 font-medium max-w-[85%] leading-relaxed shadow-sm">
                    "I usually handle state management with Context, but for this project we needed to minimize re-renders on scroll."
                  </div>
                </div>
                
                <div className="flex flex-col items-start relative">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1 }}
                    className="absolute -left-3 -top-3 px-2 py-1 bg-white text-emerald-600 text-[9px] font-bold uppercase tracking-widest rounded shadow-sm border border-emerald-100 flex items-center gap-1 z-10"
                  >
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Probe trigger
                  </motion.div>
                  <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl rounded-tl-sm p-4 text-[13px] text-white font-medium max-w-[85%] leading-relaxed shadow-[0_10px_20px_rgba(124,58,237,0.2)]">
                    "Interesting. If Context was causing too many re-renders on scroll, what specific library or pattern did you introduce to isolate that state?"
                  </div>
                </div>
              </div>

            </div>

            {/* Floating Accessory Badge 1 */}
            <motion.div 
              animate={{ y: [-5, 5, -5] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-8 top-20 bg-white p-3 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] border border-gray-100 flex items-center gap-3 backdrop-blur-md"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <div className="pr-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Integrity Signal</div>
                <div className="text-[13px] font-bold text-gray-900">Audio clear • No prompts</div>
              </div>
            </motion.div>
            
          </motion.div>
        </div>

      </div>
    </section>
  );
}
