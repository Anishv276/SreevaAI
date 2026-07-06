import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const transcriptLines = [
  { speaker: "Candidate", text: "My primary responsibility was backend development. I built REST APIs using FastAPI, designed the PostgreSQL schema, and integrated the LLM APIs." },
  { speaker: "Ishita", text: "Got it. Since you worked heavily on the LLM integration, could you walk me through a specific challenge you faced when validating the AI's responses?" },
  { speaker: "Candidate", text: "Getting consistent outputs was a challenge. I redesigned the system into multiple agents with single responsibilities, and added strict backend validation before passing data forward." },
  { speaker: "Ishita", text: "That makes sense. If one of those external LLM agents timed out during the workflow, exactly how did your backend handle the failure?" }
];

export default function HeroSection() {
  const [currentLineIndex, setCurrentLineIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentLineIndex((prev) => (prev + 1) % transcriptLines.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative pt-40 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-[#FAFAFA] font-geist min-h-screen flex items-center">
      
      {/* Premium Background: Mesh Gradient Aurora & Noise */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Subtle Noise Texture */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }}></div>
        {/* Animated Aurora Orbs */}
        <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.08)_0%,transparent_60%)] blur-[80px]"></div>
        <div className="absolute bottom-[-20%] right-[20%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(79,70,229,0.06)_0%,transparent_60%)] blur-[80px]"></div>
      </div>
      
      <div className="max-w-[1280px] mx-auto px-6 relative z-10 w-full flex flex-col lg:flex-row items-center gap-16 lg:gap-8">
        
        {/* Left Content (Ultra-Premium Typography) */}
        <div className="w-full lg:w-[45%] flex flex-col items-start text-left relative z-20">
          
          {/* Minimalist Eyebrow */}
          <div className="flex items-center gap-3 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600"></span>
            </span>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em]">Adaptive AI Interviews</span>
          </div>

          {/* Headline with Inner Shadow on "AI" */}
          <h1 className="text-[4rem] sm:text-[4.5rem] lg:text-[5rem] font-extrabold text-[#111111] leading-[0.95] tracking-[-0.04em] mb-8">
            Your <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-b from-gray-900 to-gray-600 after:absolute after:inset-0 after:bg-[linear-gradient(180deg,rgba(255,255,255,0.4)_0%,transparent_100%)] after:bg-clip-text after:text-transparent">AI</span> interviewer<br/>is ready.
          </h1>

          <p className="text-[18px] sm:text-[20px] text-gray-500 leading-[1.6] max-w-[440px] font-medium mb-12">
            Sreeva runs your first-round interviews end to end — adaptive questions, real follow-ups, and a hire decision waiting for you in 20 minutes.
          </p>

          {/* Premium Button Group */}
          <div className="flex flex-col sm:flex-row items-center gap-5 w-full sm:w-auto mb-12">
            <a 
              href="https://cal.com/vamsivk/30min" 
              className="w-full sm:w-auto px-8 py-3.5 bg-[#111111] text-white rounded-full font-bold text-[14px] flex items-center justify-center gap-2 group transition-all duration-300 relative overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.2)]"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <span className="relative z-10">Book a demo</span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="relative z-10 group-hover:translate-x-1 transition-transform"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>

            <button className="w-full sm:w-auto px-6 py-3.5 bg-white text-gray-900 rounded-full font-bold text-[14px] flex items-center justify-center gap-2.5 group transition-all duration-300 border border-gray-200/80 shadow-sm hover:bg-gray-50 hover:shadow-md hover:border-gray-300">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" className="text-gray-600 group-hover:text-violet-600 ml-0.5"><path d="M5 3l14 9-14 9V3z"/></svg>
              </div>
              Watch 2-min demo
            </button>
          </div>

          {/* Trust Banner */}
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              <img src="https://i.pravatar.cc/100?img=33" alt="User" className="w-8 h-8 rounded-full border-2 border-[#FAFAFA] shadow-sm" />
              <img src="https://i.pravatar.cc/100?img=47" alt="User" className="w-8 h-8 rounded-full border-2 border-[#FAFAFA] shadow-sm" />
              <img src="https://i.pravatar.cc/100?img=12" alt="User" className="w-8 h-8 rounded-full border-2 border-[#FAFAFA] shadow-sm" />
              <img src="https://i.pravatar.cc/100?img=59" alt="User" className="w-8 h-8 rounded-full border-2 border-[#FAFAFA] shadow-sm" />
              <div className="w-8 h-8 rounded-full border-2 border-[#FAFAFA] bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 shadow-sm">+4k</div>
            </div>
            <div className="text-[12px] font-semibold text-gray-500">
              Trusted by engineering leaders
            </div>
          </div>

        </div>

        {/* Right Content: Floating Glass Composition */}
        <div className="w-full lg:w-[55%] relative flex justify-center lg:justify-end h-[500px]">
          
          <div className="relative w-full max-w-[600px] h-full perspective-[1200px]">
            
            {/* Background Layer: Camera Feed */}
            <motion.div 
              initial={{ opacity: 0, x: 50, y: -20, rotateY: -10 }}
              animate={{ opacity: 1, x: 0, y: 0, rotateY: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="absolute top-10 right-4 w-[180px] h-[130px] bg-[#111111] rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.15)] border border-gray-800 z-10 overflow-hidden"
            >
              <div className="absolute inset-0 opacity-50 mix-blend-luminosity bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?q=80&w=300&auto=format&fit=crop')" }}></div>
              <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
              <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/40 backdrop-blur-md rounded text-[9px] font-bold text-white uppercase tracking-wider border border-white/10">Live</div>
            </motion.div>

            {/* Midground Layer: AI Waveform */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              className="absolute top-24 left-10 w-[240px] p-8 bg-white/70 backdrop-blur-2xl rounded-3xl shadow-[0_40px_80px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,1)] border border-white z-20 flex flex-col items-center justify-center"
            >
              <div className="w-20 h-20 rounded-full bg-violet-50 flex items-center justify-center mb-5 relative shadow-[inset_0_2px_10px_rgba(124,58,237,0.05)] border border-violet-100">
                <motion.div 
                  animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0, 0.3] }} 
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 bg-violet-200 rounded-full"
                />
                <div className="flex items-center gap-1.5 relative z-10">
                  {[1, 2, 3, 4].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ height: transcriptLines[currentLineIndex]?.speaker === 'Ishita' ? [14, 28, 14] : 6 }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, repeatType: "mirror" }}
                      className="w-1.5 bg-violet-600 rounded-full shadow-[0_0_8px_rgba(124,58,237,0.4)]"
                    />
                  ))}
                </div>
              </div>
              <div className="text-[13px] font-bold text-violet-600 uppercase tracking-widest">Ishita</div>
              <div className="text-[11px] font-medium text-gray-400 mt-1">Listening...</div>
            </motion.div>

            {/* Foreground Layer: Live Transcript Panel */}
            <motion.div 
              initial={{ opacity: 0, y: 80, rotateX: 10 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              className="absolute bottom-10 right-10 left-16 md:left-24 bg-[#111111]/90 backdrop-blur-3xl rounded-[28px] shadow-[0_50px_100px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.1)] border border-gray-800 p-6 z-30"
            >
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Live Transcript</span>
                </div>
                <div className="text-[10px] font-mono text-gray-500">00:14:22</div>
              </div>
              
              <div className="h-[120px] flex items-end">
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={currentLineIndex}
                    initial={{ opacity: 0, y: 15, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -15, scale: 0.98 }}
                    transition={{ duration: 0.4, type: "spring", stiffness: 100, damping: 20 }}
                    className="w-full flex flex-col items-start"
                  >
                    <span className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                      transcriptLines[currentLineIndex]?.speaker === 'Candidate' ? 'text-gray-400' : 'text-violet-400'
                    }`}>
                      {transcriptLines[currentLineIndex]?.speaker === 'Candidate' ? null : (
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_rgba(167,139,250,0.8)]"></span>
                      )}
                      {transcriptLines[currentLineIndex]?.speaker}
                    </span>
                    
                    <div className="text-[14px] md:text-[15px] font-medium text-gray-200 leading-relaxed max-w-[95%]">
                      "{transcriptLines[currentLineIndex]?.text}"
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>

          </div>
        </div>

      </div>
    </section>
  );
}
