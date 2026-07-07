import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const steps = [
  {
    num: "01",
    title: "Define the standard.",
    desc: "Upload the Job Description. Sreeva instantly extracts the core technical requirements—so Ishita knows exactly what to probe.",
  },
  {
    num: "02",
    title: "Upload & Invite.",
    desc: "Drop in candidate resumes and send out invites in one click. Ishita automatically tailors the upcoming interview to their specific background.",
  },
  {
    num: "03",
    title: "Frictionless scheduling.",
    desc: "No calendar Tetris. Candidates receive a unique link and simply select a time that works for them. Ishita is available 24/7.",
  },
  {
    num: "04",
    title: "The 20-minute deep dive.",
    desc: "Not a quiz. A real conversation. Ishita listens, asks dynamic follow-ups, and pushes on weak claims. If they mention system design, she asks what broke first.",
  },
  {
    num: "05",
    title: "Verdicts, not transcripts.",
    desc: "Stop reading raw interview notes. Get an immediate, definitive hire/no-hire recommendation backed by per-skill scores and verbatim evidence.",
  }
];

export default function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      const scrollDistance = rect.height - windowHeight;
      const scrolled = -rect.top;
      
      if (scrolled < 0) {
        setActiveStep(0);
      } else if (scrolled >= scrollDistance) {
        setActiveStep(4);
      } else {
        const progress = scrolled / scrollDistance;
        let step = 0;
        if (progress < 0.2) step = 0;
        else if (progress < 0.4) step = 1;
        else if (progress < 0.6) step = 2;
        else if (progress < 0.8) step = 3;
        else step = 4;
        
        setActiveStep((prev) => (prev !== step ? step : prev));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  return (
    // 400vh tall wrapper creates a scroll track. 
    // The user has to scroll through 4 screen heights to get past this section.
    <section ref={sectionRef} className="relative bg-white font-geist border-t border-gray-100" style={{ height: '500vh' }} id="how">
      
      {/* The sticky container locks to the screen and stays there while the user scrolls down 400vh */}
      <div className="sticky top-0 h-screen w-full flex flex-col justify-center overflow-hidden">
        
        <div className="max-w-[1280px] w-full px-6 mx-auto">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-5">
              <span className="inline-flex items-center px-4 py-1.5 bg-white border border-gray-200 shadow-sm text-gray-900 rounded-full text-[11px] font-extrabold uppercase tracking-widest">
                How it works
              </span>
            </div>
            <h2 className="text-[3rem] lg:text-[4rem] font-bold text-[var(--foreground)] leading-[1.0] tracking-[-0.03em] mb-4">
              Up and running<br />in minutes.
            </h2>
            <p className="text-[17px] text-gray-500 font-medium max-w-[400px]">
              Start screening candidates immediately. No complex IT setup or long implementation required.
            </p>
          </div>

          {/* Two-column layout */}
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24 relative">
            
            {/* Left Side: Step Text (Animated in place) */}
            <div className="w-full lg:w-1/2 relative h-[240px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 flex flex-col justify-center"
                >
                  <div className="flex items-start gap-6">
                    <div className="text-[20px] font-mono font-bold mt-1 text-violet-600">
                      {steps[activeStep].num}
                    </div>
                    <div>
                      <h3 className="text-[32px] font-extrabold text-gray-900 tracking-tight mb-4 leading-tight">
                        {steps[activeStep].title}
                      </h3>
                      <p className="text-xl text-gray-500 font-medium leading-[1.6]">
                        {steps[activeStep].desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right Side: Visual Panel (Full Bleed UI) */}
            <div className="w-full lg:w-1/2 flex justify-end">
              <div className="w-full max-w-[520px] h-[420px] bg-white rounded-2xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)] overflow-hidden relative flex flex-col ring-1 ring-black/5">
                
                {/* Premium Mac-style Window Header */}
                <div className="h-10 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white flex items-center px-4 justify-between relative z-20">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29] shadow-sm" />
                  </div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                    Step 0{activeStep + 1}
                  </div>
                </div>

                <div className="flex-1 relative bg-[#FAFAFA]">
                  <AnimatePresence mode="wait">
                    
                    {/* Step 1: JD Upload (Premium Dropzone) */}
                    {activeStep === 0 && (
                      <motion.div 
                        key="ui1"
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 p-8 flex flex-col bg-white"
                      >
                        <div className="flex items-center justify-between mb-6">
                          <h4 className="text-[16px] font-extrabold text-gray-900 tracking-tight">New Requisition</h4>
                          <button className="text-[12px] font-bold text-white bg-[#111111] px-4 py-2 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:bg-black transition-colors">Save & Continue</button>
                        </div>
                        
                        <div className="flex-1 rounded-xl relative group">
                          {/* Animated gradient border wrapper */}
                          <div className="absolute inset-0 bg-gradient-to-br from-violet-200 via-gray-100 to-fuchsia-200 rounded-xl opacity-50 group-hover:opacity-100 transition-opacity p-[2px]">
                            <div className="absolute inset-0 bg-white/50 backdrop-blur-xl rounded-xl"></div>
                            <div className="w-full h-full border-2 border-dashed border-violet-300/50 rounded-xl flex flex-col items-center justify-center relative z-10 bg-gradient-to-b from-white/40 to-violet-50/20">
                              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-[0_8px_24px_rgba(124,58,237,0.12)] border border-violet-100 mb-4 relative">
                                <div className="absolute inset-0 bg-violet-400 opacity-20 blur-xl rounded-full"></div>
                                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-600 relative z-10"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                              </div>
                              <div className="text-gray-900 font-bold text-[15px]">Drop JD (PDF, DOCX) here</div>
                              <div className="text-gray-400 text-[13px] font-medium mt-1">or click to browse files</div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 bg-gradient-to-r from-emerald-50 to-teal-50/30 border border-emerald-100/50 rounded-xl p-3.5 flex justify-between items-center shadow-[0_2px_8px_rgba(16,185,129,0.05)]">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm border border-emerald-100/80">
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                            <div>
                              <div className="text-[13px] font-bold text-gray-900">senior-backend-eng.pdf</div>
                              <div className="text-[11px] text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                11 Tech Anchors Extracted
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 2: Upload Resumes & Invite (Premium Data Table) */}
                    {activeStep === 1 && (
                      <motion.div 
                        key="ui1b"
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 bg-[#FBFBFD] flex flex-col"
                      >
                        <div className="px-8 py-5 border-b border-gray-200/60 bg-white/60 backdrop-blur-xl flex justify-between items-center sticky top-0 z-10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                          <div>
                            <h4 className="text-[16px] font-extrabold text-gray-900 tracking-tight">Active Campaign</h4>
                            <div className="text-[12px] text-gray-500 font-medium mt-0.5">Senior Backend Engineer</div>
                          </div>
                          <button className="text-[12px] font-bold text-white bg-gradient-to-b from-violet-500 to-violet-600 px-3.5 py-1.5 rounded-lg shadow-[0_4px_12px_rgba(124,58,237,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]">Send Invites</button>
                        </div>
                        
                        <div className="flex-1 p-8 overflow-hidden flex flex-col bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.02%22/%3E%3C/svg%3E')]">
                          <div className="border-2 border-dashed border-gray-200/80 bg-white/50 rounded-xl py-3.5 flex flex-col items-center justify-center mb-5 cursor-pointer hover:border-violet-300 hover:bg-violet-50/50 transition-all group shadow-sm">
                            <div className="text-[12px] font-bold text-gray-600 group-hover:text-violet-600 transition-colors">+ Drop Resumes Here</div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3 px-2">
                            <span>Candidate</span>
                            <span>Status</span>
                          </div>
                          <div className="space-y-2.5">
                            {[
                              { name: 'Arjun Mehta', doc: 'arjun_resume.pdf', status: 'Ready', color: 'text-emerald-700', bgBadge: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]', bg: 'bg-white border-emerald-100 shadow-[0_4px_20px_rgba(16,185,129,0.06)]' },
                              { name: 'Priya Kapoor', doc: 'priya_cv_new.pdf', status: 'Ready', color: 'text-emerald-700', bgBadge: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]', bg: 'bg-white border-emerald-100 shadow-[0_4px_20px_rgba(16,185,129,0.06)]' },
                            ].map((person, idx) => (
                              <div key={idx} className={`flex items-center justify-between p-3 border rounded-xl ${person.bg} transition-all hover:scale-[1.01]`}>
                                <div className="flex items-center gap-3.5">
                                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center border border-emerald-100 text-emerald-600 shadow-sm relative">
                                    <div className="absolute inset-0 bg-emerald-400/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="relative z-10"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                  </div>
                                  <div>
                                    <div className="text-[13.5px] font-extrabold text-gray-900 leading-tight">{person.name}</div>
                                    <div className="text-[11px] text-gray-500 font-medium">{person.doc}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className={`px-2 py-0.5 border rounded-md ${person.bgBadge} flex items-center gap-1.5`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${person.dot}`} />
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${person.color}`}>{person.status}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 3: Schedule slot (Premium Calendar UI) */}
                    {activeStep === 2 && (
                      <motion.div 
                        key="ui2"
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 bg-white flex flex-col p-8"
                      >
                        <div className="flex items-center justify-between mb-8 border-b border-gray-100 pb-4">
                          <div>
                            <h4 className="text-[16px] font-extrabold text-gray-900 tracking-tight">Select Interview Time</h4>
                            <div className="text-[12px] text-gray-500 font-medium mt-1 flex items-center gap-1.5">
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                              45 min technical screen
                            </div>
                          </div>
                          <div className="text-[12px] font-bold text-gray-900 bg-gray-50/80 px-3.5 py-1.5 rounded-lg border border-gray-200/80 shadow-sm flex items-center gap-1.5">
                            September <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                          </div>
                        </div>
                        
                        <div className="flex-1">
                          <div className="grid grid-cols-7 gap-2 mb-3">
                            {['M','T','W','T','F','S','S'].map((d, i) => (
                              <div key={i} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">{d}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-x-2 gap-y-3">
                            {[...Array(14)].map((_, i) => (
                              <div key={i} className={`h-8 rounded-lg flex items-center justify-center text-[13px] font-bold cursor-pointer transition-all ${
                                i === 9 
                                  ? 'bg-gradient-to-b from-violet-500 to-violet-600 text-white shadow-[0_6px_16px_rgba(124,58,237,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] border-t border-violet-400 scale-105' 
                                  : i < 3 
                                    ? 'text-gray-300' 
                                    : 'text-gray-700 bg-gray-50/50 hover:bg-violet-50 hover:text-violet-700 border border-transparent hover:border-violet-100'
                              }`}>
                                {i + 10}
                              </div>
                            ))}
                          </div>
                          
                          <div className="mt-8 pt-6 border-t border-gray-100 relative">
                            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                              Available on Sept 19
                              <span className="h-px flex-1 bg-gray-100"></span>
                            </div>
                            <div className="flex gap-2.5 overflow-hidden">
                              <div className="px-4 py-2 border border-violet-200 bg-violet-50 text-violet-700 rounded-xl text-[12px] font-bold shadow-[0_2px_8px_rgba(124,58,237,0.1)] whitespace-nowrap flex-1 text-center relative overflow-hidden">
                                <div className="absolute inset-0 bg-violet-400 opacity-10"></div>
                                10:00 AM
                              </div>
                              <div className="px-4 py-2 border border-gray-200 bg-white text-gray-600 hover:text-violet-600 rounded-xl text-[12px] font-bold shadow-sm whitespace-nowrap flex-1 text-center cursor-pointer transition-colors">
                                1:30 PM
                              </div>
                              <div className="px-4 py-2 border border-gray-200 bg-white text-gray-600 hover:text-violet-600 rounded-xl text-[12px] font-bold shadow-sm whitespace-nowrap flex-1 text-center cursor-pointer transition-colors">
                                4:00 PM
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 4: Interview (Premium AI UI) */}
                    {activeStep === 3 && (
                      <motion.div 
                        key="ui3"
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 bg-[#050505] flex flex-col overflow-hidden"
                      >
                        {/* Premium dark header */}
                        <div className="h-14 border-b border-white/5 flex items-center px-6 justify-between bg-white/[0.02] backdrop-blur-md relative z-20">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-b from-gray-700 to-gray-800 flex items-center justify-center text-white text-[10px] font-bold border border-gray-600/50 shadow-inner">AM</div>
                            <span className="text-white text-[13px] font-bold tracking-wide">Arjun Mehta</span>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
                            <span className="text-[10px] font-bold text-violet-300 uppercase tracking-widest">Live Call</span>
                          </div>
                        </div>
                        
                        <div className="flex-1 flex flex-col items-center justify-center relative p-8">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.08)_0%,transparent_60%)] pointer-events-none" />
                          
                          {/* Premium Glowing AI visual */}
                          <div className="w-28 h-28 mb-12 relative flex items-center justify-center group">
                            <div className="absolute inset-0 bg-violet-600 rounded-full blur-[40px] opacity-40 animate-pulse mix-blend-screen" />
                            <div className="absolute inset-2 bg-indigo-500 rounded-full blur-[20px] opacity-30 mix-blend-screen" />
                            <div className="w-full h-full bg-gradient-to-br from-violet-500/90 via-fuchsia-600/90 to-indigo-800/90 rounded-full flex items-center justify-center relative z-10 shadow-[inset_0_2px_20px_rgba(255,255,255,0.4),0_0_20px_rgba(124,58,237,0.5)] border border-white/20 backdrop-blur-md">
                              <div className="flex items-center gap-1.5">
                                {[1,2,3,4,5].map(b => (
                                  <motion.div
                                    key={b}
                                    animate={{ height: [12, 28, 12] }}
                                    transition={{ duration: 0.5, repeat: Infinity, delay: b * 0.12, repeatType: 'mirror', ease: 'easeInOut' }}
                                    className="w-[3px] bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          {/* Glassmorphic Transcript Box */}
                          <div className="w-full max-w-sm bg-white/[0.03] border border-white/10 rounded-2xl p-6 relative z-10 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-violet-300 text-[12px] font-bold tracking-wide">Ishita</span>
                                <span className="w-1 h-1 rounded-full bg-violet-400"></span>
                                <span className="text-[10px] text-gray-500 font-medium">Just now</span>
                              </div>
                            </div>
                            <div className="text-[15px] text-gray-200 font-medium leading-[1.6]">
                              "You used Redis for session caching. What happened when keys expired during peak traffic?"
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 5: Report (Premium Dashboard View) */}
                    {activeStep === 4 && (
                      <motion.div 
                        key="ui4"
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 bg-[#FBFBFD] flex flex-col p-6 overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-400 opacity-[0.03] rounded-full blur-[60px] pointer-events-none"></div>

                        {/* Top Score Card */}
                        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] mb-4 flex justify-between items-center relative z-10">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-gray-700 text-[14px] font-extrabold border border-gray-200 shadow-sm relative overflow-hidden">
                              <div className="absolute inset-0 bg-white/40"></div>
                              <span className="relative z-10">AM</span>
                            </div>
                            <div>
                              <div className="text-[16px] font-extrabold text-gray-900 tracking-tight">Arjun Mehta</div>
                              <div className="text-[12px] text-gray-500 font-medium">Backend Engineer</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Verdict</div>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200/60 rounded-md text-emerald-600 font-bold text-[12px] uppercase tracking-widest shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                              Strong Hire
                            </div>
                          </div>
                        </div>
                        
                        {/* Detailed breakdown */}
                        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex-1 flex flex-col relative z-10">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-5 pb-3 border-b border-gray-100 flex items-center justify-between">
                            <span>Skill Breakdown</span>
                            <span className="text-violet-600">Overall: 94/100</span>
                          </div>
                          
                          <div className="space-y-4 mb-auto">
                            {[['System Design', 96], ['API Architecture', 91], ['Integrity', 98]].map(([label, score]) => (
                              <div key={label as string} className="group">
                                <div className="flex justify-between text-[12px] font-bold mb-2">
                                  <span className="text-gray-800">{label}</span>
                                  <span className="text-gray-500">{score}</span>
                                </div>
                                <div className="w-full h-2 bg-gray-100/80 rounded-full overflow-hidden shadow-inner">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${score}%` }}
                                    transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 relative"
                                  >
                                    <div className="absolute inset-0 bg-white/20"></div>
                                  </motion.div>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="mt-5 bg-gradient-to-br from-violet-50 to-indigo-50/30 rounded-xl p-4 border border-violet-100/50 shadow-sm relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-400 rounded-l-xl"></div>
                            <div className="text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-1.5 pl-2">Verbatim Insight</div>
                            <p className="text-[13px] text-gray-700 font-medium italic leading-relaxed pl-2 relative z-10">
                              "Demonstrated expert-level knowledge of caching failure states. Accurately predicted cascading timeouts before being prompted."
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
