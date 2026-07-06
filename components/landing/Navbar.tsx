import React, { useState } from 'react';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';

export default function Navbar() {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 20);
  });

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 font-geist ${
        isScrolled 
          ? "bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)]" 
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-[1280px] mx-auto px-6 h-20 flex items-center justify-between">
        
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-[10px] flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-sm tracking-tighter">S</span>
          </div>
          <span className="text-gray-900 font-bold text-[20px] tracking-tight">Sreeva<span className="text-violet-600">AI</span></span>
        </div>
        
        {/* Links */}
        <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium text-gray-500">
          <a href="#problem" className="hover:text-gray-900 transition-colors">Problem</a>
          <a href="#platform" className="hover:text-gray-900 transition-colors">Platform</a>
          <a href="#how" className="hover:text-gray-900 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
          <a href="#contact" className="hover:text-gray-900 transition-colors">Contact</a>
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-6">
          <a href="/login" className="text-gray-600 hover:text-gray-900 transition-colors text-[15px] font-semibold hidden sm:block">Sign in</a>
          <a 
            href="https://cal.com/vamsivk/30min" 
            className="group relative overflow-hidden bg-[#111111] text-white px-6 py-2.5 rounded-full font-semibold transition-all text-[15px] shadow-[0_4px_14px_rgba(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)] hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
          >
            <span className="relative z-10">Book demo</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="relative z-10 group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </a>
        </div>

      </div>
    </motion.header>
  );
}
