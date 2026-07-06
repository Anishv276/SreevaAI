import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-white pt-24 pb-12 font-geist relative overflow-hidden" id="footer">
      <div className="max-w-[1280px] mx-auto px-6 relative z-10">
        
        {/* Footer Header */}
        <div className="flex flex-col items-center sm:items-start sm:flex-row gap-4 sm:gap-6 mb-16 pb-12 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-[12px] flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-lg tracking-tighter">S</span>
            </div>
            <span className="text-[28px] font-bold text-gray-900 tracking-tight">Sreeva<span className="text-violet-600">AI</span></span>
          </div>
          <div className="hidden sm:block h-8 w-[1px] bg-gray-200 mt-1"></div>
          <span className="text-gray-400 font-medium text-[20px] mt-1">— hire with confidence.</span>
        </div>

        {/* Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8 mb-24">
          
          {/* Col 1 */}
          <div className="lg:col-span-5">
            <p className="text-gray-500 font-medium text-[16px] leading-[1.7] max-w-sm mb-8">
              Adaptive AI that conducts first-round interviews, probes every claim, and hands you a hiring decision — in 20 minutes.
            </p>
            <div className="flex gap-4">
              <a href="https://www.linkedin.com/company/sreeva-ai/about/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-[#0A66C2] hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452z"/></svg>
              </a>
              <a href="mailto:support@sreevaai.com" className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-violet-600 hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>
              </a>
            </div>
          </div>

          {/* Col 2 */}
          <div className="lg:col-span-2">
            <h5 className="text-[13px] font-bold text-gray-900 uppercase tracking-widest mb-6">Product</h5>
            <ul className="space-y-4">
              <li><a href="#platform" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">Platform</a></li>
              <li><a href="#how" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">How it works</a></li>
              <li><a href="#pricing" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">Pricing</a></li>
              <li><a href="#faq" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">FAQ</a></li>
            </ul>
          </div>

          {/* Col 3 */}
          <div className="lg:col-span-3">
            <h5 className="text-[13px] font-bold text-gray-900 uppercase tracking-widest mb-6">Contact</h5>
            <address className="not-italic">
              <ul className="space-y-4">
                <li><a href="mailto:support@sreevaai.com" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">support@sreevaai.com</a></li>
                <li><a href="tel:+918919053970" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">+91 8919053970</a></li>
                <li><a href="https://cal.com/vamsivk/30min" target="_blank" rel="noopener noreferrer" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">Book a demo</a></li>
              </ul>
            </address>
          </div>

          {/* Col 4 */}
          <div className="lg:col-span-2">
            <h5 className="text-[13px] font-bold text-gray-900 uppercase tracking-widest mb-6">Legal</h5>
            <ul className="space-y-4">
              <li><a href="/privacy" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">Privacy policy</a></li>
              <li><a href="/terms" className="text-[15px] font-medium text-gray-500 hover:text-violet-600 transition-colors">Terms of service</a></li>
            </ul>
          </div>

        </div>

        {/* Big Watermark */}
        <div className="text-[clamp(4rem,12vw,14rem)] font-extrabold text-gray-50 leading-none tracking-tighter text-center select-none pointer-events-none mb-12">
          SREEVA AI
        </div>

        {/* Bottom */}
        <div className="text-center">
          <p className="text-[14px] text-gray-400 font-medium">© 2026 Sreeva AI. All rights reserved.</p>
        </div>

      </div>
    </footer>
  );
}
