import React, { useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';

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
  const targetRef = useRef<HTMLDivElement>(null);
  
  // Creates a 400vh scrollable area to scrolljack
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"]
  });

  // Calculate which step is active (0 to 3) based on scroll progress (0 to 1)
  const activeStepTransform = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, 1, 2, 3, 3]);

  // Using state to force re-renders for AnimatePresence image swapping
  const [activeStep, setActiveStep] = React.useState(0);
  
  React.useEffect(() => {
    return activeStepTransform.on("change", (latest) => {
      setActiveStep(Math.min(Math.floor(latest), 3));
    });
  }, [activeStepTransform]);

  return (
    <section className="bg-white font-geist relative" id="how">
      {/* Scrollable Container (400vh) */}
      <div ref={targetRef} className="h-[400vh] relative">
        
        {/* Sticky Viewport Container */}
        <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center overflow-hidden">
          <div className="max-w-[1280px] w-full px-6 mx-auto h-full flex flex-col pt-24 pb-12">
            
            {/* Header */}
            <div className="mb-12 flex-shrink-0">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-[1px] w-8 bg-orange-400"></div>
                <span className="text-orange-500 font-bold uppercase tracking-widest text-[13px]">The flow</span>
              </div>
              <h2 className="text-[3rem] lg:text-[4rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em]">
                From JD to decision, in four moves.
              </h2>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col lg:flex-row gap-16 relative w-full h-full pb-10">
              
              {/* Left Side: Text Steps */}
              <div className="w-full lg:w-1/2 relative h-full flex flex-col justify-center">
                {/* Progress Bar */}
                <div className="absolute left-6 top-10 bottom-10 w-[2px] bg-gray-100 hidden sm:block">
                  <motion.div 
                    className="w-full bg-violet-600 origin-top h-full"
                    style={{ scaleY: scrollYProgress }}
                  ></motion.div>
                </div>

                <div className="space-y-16 pl-0 sm:pl-20">
                  {steps.map((step, i) => (
                    <div 
                      key={i} 
                      className={`transition-all duration-500 ${activeStep === i ? 'opacity-100 translate-x-0' : 'opacity-30 -translate-x-2'}`}
                    >
                      <h3 className="text-3xl font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-4">
                        <span className={`text-[15px] font-mono font-bold tracking-widest sm:hidden ${activeStep === i ? 'text-violet-600' : 'text-gray-400'}`}>
                          {step.num}
                        </span>
                        {step.title}
                      </h3>
                      <p className="text-lg text-gray-500 font-medium leading-[1.6]">
                        {step.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side: Changing Visuals */}
              <div className="w-full lg:w-1/2 h-full flex items-center justify-center relative">
                <div className="w-full aspect-square md:aspect-auto md:h-[500px] bg-[#FAFAFA] rounded-[40px] border border-gray-200 overflow-hidden relative flex items-center justify-center p-8 shadow-[0_20px_60px_rgba(0,0,0,0.03)]">
                  
                  <div className="absolute top-6 left-8 z-20">
                    <span className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">
                      <span className="text-violet-600">0{activeStep + 1}</span> / 04
                    </span>
                  </div>

                  <AnimatePresence mode="wait">
                    
                    {/* Visual 1: JD Upload */}
                    {activeStep === 0 && (
                      <motion.div 
                        key="step1"
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
                        className="w-full max-w-[360px] bg-white rounded-3xl border border-gray-200 shadow-xl p-8"
                      >
                        <div className="border-2 border-dashed border-violet-200 bg-violet-50/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center mb-6 h-40">
                          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-600 mb-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>
                          <div className="text-gray-900 font-semibold text-[15px]">Drop JD here</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex justify-between items-center">
                          <span className="text-[13px] font-bold text-gray-900">senior-frontend.pdf</span>
                          <span className="text-emerald-600 font-bold bg-emerald-100 px-2.5 py-1 rounded-full uppercase text-[9px] tracking-wider">Parsed</span>
                        </div>
                      </motion.div>
                    )}

                    {/* Visual 2: Invite Candidates */}
                    {activeStep === 1 && (
                      <motion.div 
                        key="step2"
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
                        className="w-full max-w-[360px] bg-white rounded-3xl border border-gray-200 shadow-xl p-8"
                      >
                        <div className="space-y-4">
                          {[1, 2, 3].map((item) => (
                            <div key={item} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-[11px] uppercase">{String.fromCharCode(64 + item)}</div>
                                <div className="w-24 h-2 bg-gray-200 rounded-full"></div>
                              </div>
                              <div className="px-3 py-1 bg-[#111111] text-white text-[11px] font-bold rounded-full">Invite sent</div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Visual 3: Live Interview */}
                    {activeStep === 2 && (
                      <motion.div 
                        key="step3"
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.4 }}
                        className="w-full max-w-[360px] bg-[#111111] rounded-3xl border border-gray-800 shadow-2xl p-8 relative overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.2)_0%,transparent_70%)] pointer-events-none"></div>
                        <div className="flex flex-col items-center justify-center h-48 relative z-10">
                          <div className="relative mb-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-full shadow-[0_0_30px_rgba(124,58,237,0.5)]"></div>
                            <div className="absolute inset-0 border-2 border-white/20 rounded-full animate-ping"></div>
                          </div>
                          <div className="text-white font-bold text-[18px]">Ishita</div>
                          <div className="text-violet-400 font-semibold text-[13px]">Listening...</div>
                        </div>
                      </motion.div>
                    )}

                    {/* Visual 4: The Report */}
                    {activeStep === 3 && (
                      <motion.div 
                        key="step4"
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
                        className="w-full max-w-[360px] bg-white rounded-3xl border border-gray-200 shadow-xl p-8"
                      >
                        <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
                          <div>
                            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Result</div>
                            <div className="text-[18px] font-bold text-gray-900">Strong Hire</div>
                          </div>
                          <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center font-extrabold text-xl shadow-lg shadow-emerald-500/30">94</div>
                        </div>
                        <div className="space-y-4">
                          <div><div className="flex justify-between text-[11px] font-bold text-gray-500 mb-1.5 uppercase"><span>Tech Depth</span><span>96</span></div><div className="w-full h-1.5 bg-gray-100 rounded-full"><div className="w-[96%] h-full bg-violet-600 rounded-full"></div></div></div>
                          <div><div className="flex justify-between text-[11px] font-bold text-gray-500 mb-1.5 uppercase"><span>Integrity</span><span>98</span></div><div className="w-full h-1.5 bg-gray-100 rounded-full"><div className="w-[98%] h-full bg-violet-600 rounded-full"></div></div></div>
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
