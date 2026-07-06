'use client';
import React from 'react';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import StatsBand from '../components/landing/StatsBand';
import ProblemSection from '../components/landing/ProblemSection';
import PlatformSection from '../components/landing/PlatformSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import ComparisonSection from '../components/landing/ComparisonSection';
import PricingSection from '../components/landing/PricingSection';
import FAQSection from '../components/landing/FAQSection';
import CTASection from '../components/landing/CTASection';
import Footer from '../components/landing/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white selection:bg-violet-500/20 text-gray-900 overflow-x-hidden font-geist">
      <Navbar />
      <main>
        <HeroSection />
        <StatsBand />
        <ProblemSection />
        <PlatformSection />
        <HowItWorksSection />
        <ComparisonSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
