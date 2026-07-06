import React, { useState } from 'react';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';

export default function Navbar() {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50);
  });

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex justify-center mt-6 px-4 pointer-events-none">
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className={`pointer-events-auto flex items-center justify-between px-6 py-3 rounded-full transition-all duration-500 font-geist ${
          isScrolled 
            ? "w-full max-w-4xl bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,1)]" 
            : "w-full max-w-[1280px] bg-transparent border border-transparent px-2"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 cursor-pointer">
          <img src="/sreevaailogo2.png" alt="Sreeva AI" width="28" height="28" className="object-contain" />
          <span className="text-gray-900 font-bold text-[18px] tracking-tight">Sreeva<span className="text-violet-600">AI</span></span>
        </div>
        
        {/* Links */}
        <nav className={`hidden md:flex items-center gap-8 text-[14px] font-semibold text-gray-500 ${isScrolled ? 'mr-4' : ''}`}>
          <a href="#problem" className="hover:text-gray-900 transition-colors">Problem</a>
          <a href="#platform" className="hover:text-gray-900 transition-colors">Platform</a>
          <a href="#how" className="hover:text-gray-900 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-5">
          <a href="/login" className="text-gray-600 hover:text-gray-900 transition-colors text-[14px] font-semibold hidden sm:block">Sign in</a>
          <a 
            href="https://cal.com/vamsivk/30min" 
            className="group relative overflow-hidden bg-[#111111] text-white px-5 py-2.5 rounded-full font-bold transition-all text-[14px] shadow-[0_4px_14px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.15)] flex items-center gap-2"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <span className="relative z-10">Book demo</span>
          </a>
        </div>
      </motion.header>
    </div>
  );
}
