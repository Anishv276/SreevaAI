"use client";

import Script from "next/script";
import "./landing.css";
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import ProblemSection from "@/components/landing/ProblemSection";
import PlatformSection from "@/components/landing/PlatformSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import ComparisonSection from "@/components/landing/ComparisonSection";
import RoiSection from "@/components/landing/RoiSection";
import FAQSection from "@/components/landing/FAQSection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <>
      <div className="scroll-prog" id="scrollProg" aria-hidden="true"></div>

      <Navbar />

      <main id="top" itemScope itemType="https://schema.org/WebPage">
        <HeroSection />
        <ProblemSection />
        <PlatformSection />
        <HowItWorksSection />
        <ComparisonSection />
        <RoiSection />
        <FAQSection />
        <CTASection />
      </main>

      <Footer />

      <Script src="/app.js" strategy="lazyOnload" />
    </>
  );
}
