import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const transcriptLines = [
  { speaker: "Candidate", text: "I built an API that fetches user preferences from a cache instead of the database every time." },
  { speaker: "Sreeva · Adapting", text: "Walk me through that. What cache layer did you choose? How did you handle cache invalidation when preferences change?" },
  { speaker: "Candidate", text: "We used Redis. For invalidation, we set a TTL of 5 minutes, but also fired an event on user update to clear the specific key." },
  { speaker: "Sreeva · Adapting", text: "What happens if the event fails to fire or gets lost? How do you ensure the cache eventually matches the DB?" }
];

export default function PlatformSection() {
  const [currentLineIndex, setCurrentLineIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentLineIndex((prev) => (prev + 1) % transcriptLines.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-32 bg-[#FAFAFA] font-geist overflow-hidden relative" id="platform">
      <div className="max-w-[1280px] mx-auto px-6 relative z-10">
        {/* Core Engine Callout */}
        <div className="flex flex-col lg:flex-row gap-16 items-center mb-20">
          
          <div className="w-full lg:w-1/2">
            <span className="inline-block px-4 py-1.5 bg-white border border-gray-200 shadow-sm text-gray-900 rounded-full text-[11px] font-extrabold uppercase tracking-widest mb-6">Core engine</span>
            <h3 className="text-[2.5rem] lg:text-[3.2rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-4">
              She listens.<br/>She follows up.
            </h3>
            <p className="text-[20px] text-violet-600 font-semibold mb-6">No script. No template. No ceiling.</p>
            <p className="text-[17px] text-gray-500 leading-[1.6] font-medium mb-12 max-w-md">
              Ishita isn't running through a checklist. She hears what the candidate says and decides what to ask next. If they claim strong system design work, she asks about a specific failure. If they pivot away from a question, she comes back. It is the interview your best engineer would run — if they had 3 hours for every candidate.
            </p>
            <div className="flex gap-12 border-t border-gray-200/60 pt-8">
              <div>
                <div className="text-[48px] font-extrabold text-gray-900 tracking-tighter mb-1 leading-none">100%</div>
                <div className="text-[12px] text-gray-400 font-bold uppercase tracking-wider max-w-[120px]">of questions adapt to the answer</div>
              </div>
              <div>
                <div className="text-[48px] font-extrabold text-gray-900 tracking-tighter mb-1 leading-none">0</div>
                <div className="text-[12px] text-gray-400 font-bold uppercase tracking-wider max-w-[120px]">scripted templates, ever</div>
              </div>
            </div>
          </div>

          {/* Premium Chat UI (Live Engagement) */}
          <div className="w-full lg:w-1/2 bg-white rounded-[32px] border border-gray-200 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Adaptive Probe in action</div>
            </div>

            {/* Live Engagement Looping Transcript */}
            <div className="h-[220px] mb-8 relative flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={currentLineIndex}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className={`flex flex-col w-full ${transcriptLines[currentLineIndex].speaker === 'Candidate' ? 'items-end' : 'items-start'}`}
                >
                  <span className={`text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                    transcriptLines[currentLineIndex].speaker === 'Candidate' ? 'text-gray-400' : 'text-violet-600'
                  }`}>
                    {transcriptLines[currentLineIndex].speaker === 'Candidate' ? null : (
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse shadow-[0_0_8px_rgba(124,58,237,0.8)]"></span>
                    )}
                    {transcriptLines[currentLineIndex].speaker}
                  </span>
                  <div className={`p-5 rounded-2xl text-[15px] font-medium max-w-[90%] leading-relaxed shadow-sm ${
                    transcriptLines[currentLineIndex].speaker === 'Candidate' 
                      ? 'bg-gray-100 border border-gray-200 text-gray-900 rounded-tr-sm' 
                      : 'bg-[#111111] text-white rounded-tl-sm shadow-[0_10px_30px_rgba(0,0,0,0.15)]'
                  }`}>
                    "{transcriptLines[currentLineIndex].text}"
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="bg-[#FAFAFA] rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Follow-up</span>
                <span className="text-gray-900 font-bold">Architecture decisions probed</span>
              </div>
              <div className="h-[1px] w-full bg-gray-200"></div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-bold text-emerald-600 uppercase tracking-wider text-[10px]">Signal</span>
                <span className="text-emerald-600 font-bold">Systems thinking demonstrated</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
