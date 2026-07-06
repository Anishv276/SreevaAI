import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const steps = [
  {
    num: "01",
    title: "Upload your JD",
    desc: "Sreeva reads it and figures out what actually matters for this role — so it knows what to ask before the interview even starts."
  },
  {
    num: "02",
    title: "Invite candidates",
    desc: "They get a link, click it, and Ishita is waiting on the other end. No back and forth emails, no \"does Thursday work for you?\""
  },
  {
    num: "03",
    title: "20 min conversation",
    desc: "Ishita listens to every answer and decides what to ask next. If something sounds vague, she goes deeper. If a claim doesn't add up, she pushes on it."
  },
  {
    num: "04",
    title: "You get the verdict",
    desc: "Open the report and everything is already there — what they said, where they struggled, and whether you should move them forward."
  }
];

export default function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const handleScroll = () => {
      // Find which step is most centered in the viewport
      const viewportCenter = window.innerHeight / 2;
      let closestStep = 0;
      let minDistance = Infinity;

      stepRefs.current.forEach((ref, index) => {
        if (ref) {
          const rect = ref.getBoundingClientRect();
          const elementCenter = rect.top + rect.height / 2;
          const distance = Math.abs(viewportCenter - elementCenter);
          if (distance < minDistance) {
            minDistance = distance;
            closestStep = index;
          }
        }
      });

      if (closestStep !== activeStep) {
        setActiveStep(closestStep);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeStep]);

  return (
    <section className="bg-white font-geist relative py-32" id="how">
      <div className="max-w-[1280px] w-full px-6 mx-auto">
        
        {/* Header */}
        <div className="mb-20">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-2 h-2 rounded-full bg-violet-600"></span>
            <span className="text-violet-600 font-bold uppercase tracking-widest text-[13px]">The flow</span>
          </div>
          <h2 className="text-[3.5rem] lg:text-[4.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em]">
            From JD to decision,<br/>in four moves.
          </h2>
        </div>

        {/* Two-Column Sticky Layout */}
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24 relative">
          
          {/* Left Side: Scrolling Text */}
          <div className="w-full lg:w-1/2 flex flex-col pt-10 pb-40">
            {steps.map((step, i) => (
              <div 
                key={i} 
                ref={el => { stepRefs.current[i] = el; }}
                className={`py-24 transition-opacity duration-500 ${activeStep === i ? 'opacity-100' : 'opacity-30'}`}
              >
                <div className="flex items-start gap-6">
                  <div className="text-[20px] font-mono font-bold text-violet-600 mt-1">{step.num}</div>
                  <div>
                    <h3 className="text-[32px] font-extrabold text-gray-900 tracking-tight mb-4 leading-tight">{step.title}</h3>
                    <p className="text-xl text-gray-500 font-medium leading-[1.6]">
                      {step.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right Side: Sticky Visual Container */}
          <div className="w-full lg:w-1/2 relative hidden lg:block">
            <div className="sticky top-[20vh] h-[600px] w-full bg-[#FAFAFA] rounded-[40px] border border-gray-200 shadow-inner overflow-hidden flex items-center justify-center p-8">
              
              <div className="absolute top-8 left-8 z-20">
                <span className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">
                  <span className="text-violet-600 font-extrabold">0{activeStep + 1}</span> / 04
                </span>
              </div>

              <div className="w-full h-full relative flex items-center justify-center">
                <AnimatePresence mode="wait">
                  
                  {activeStep === 0 && (
                    <motion.div 
                      key="img1"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}
                      className="w-full max-w-[380px] bg-white rounded-3xl border border-gray-200 shadow-[0_20px_40px_rgba(0,0,0,0.06)] p-6"
                    >
                      <div className="border-2 border-dashed border-gray-200 bg-gray-50 rounded-xl p-8 flex flex-col items-center text-center mb-4">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>
                        </div>
                        <div className="text-gray-900 font-bold text-[15px]">Drop JD here</div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex justify-between items-center">
                        <span className="text-[13px] font-bold text-gray-900">senior-frontend.pdf</span>
                        <span className="text-emerald-600 font-extrabold bg-emerald-50 px-2 py-1 rounded text-[10px] tracking-widest uppercase">Parsed</span>
                      </div>
                    </motion.div>
                  )}

                  {activeStep === 1 && (
                    <motion.div 
                      key="img2"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}
                      className="w-full max-w-[380px] bg-white rounded-3xl border border-gray-200 shadow-[0_20px_40px_rgba(0,0,0,0.06)] p-6"
                    >
                      <div className="space-y-3">
                        {[1, 2, 3].map((item) => (
                          <div key={item} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-200"></div>
                              <div className="w-20 h-2 bg-gray-200 rounded-full"></div>
                            </div>
                            <div className="px-3 py-1 bg-[#111111] text-white text-[10px] font-bold rounded-full">Sent</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {activeStep === 2 && (
                    <motion.div 
                      key="img3"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}
                      className="w-full max-w-[380px] bg-[#111111] rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.2)] p-8 relative overflow-hidden"
                    >
                      <div className="flex flex-col items-center justify-center h-48 relative z-10">
                        <div className="relative mb-6">
                          <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-full flex items-center justify-center">
                            <div className="w-16 h-16 bg-black/20 rounded-full"></div>
                          </div>
                          <div className="absolute inset-0 border border-white/20 rounded-full animate-ping"></div>
                        </div>
                        <div className="text-white font-bold text-[18px]">Ishita</div>
                        <div className="text-violet-400 font-semibold text-[13px] mt-1 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span> Listening...
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeStep === 3 && (
                    <motion.div 
                      key="img4"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}
                      className="w-full max-w-[380px] bg-white rounded-3xl border border-gray-200 shadow-[0_20px_40px_rgba(0,0,0,0.06)] p-8"
                    >
                      <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
                        <div>
                          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Result</div>
                          <div className="text-[20px] font-extrabold text-gray-900">Strong Hire</div>
                        </div>
                        <div className="w-12 h-12 rounded-[12px] bg-emerald-500 text-white flex items-center justify-center font-extrabold text-[20px]">94</div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-gray-900 mb-1 uppercase tracking-wider"><span>Tech Depth</span><span className="text-gray-500">96</span></div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full"><div className="w-[96%] h-full bg-violet-600 rounded-full"></div></div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-gray-900 mb-1 uppercase tracking-wider"><span>Integrity</span><span className="text-gray-500">98</span></div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full"><div className="w-[98%] h-full bg-violet-600 rounded-full"></div></div>
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
    </section>
  );
}
