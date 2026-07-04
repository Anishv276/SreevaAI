import { Suspense } from "react";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import Script from "next/script";
import "./globals.css";
import { JobsProvider } from "@/context/jobs-context";
import { AuthProvider } from "@/context/auth-context";
import { CandidatesProvider } from "@/context/candidates-context";
import { Toaster } from "@/components/ui/toast-custom";
import ClarityAnalytics from "@/components/clarity-analytics";
import { ViewTransitions } from "next-view-transitions";
export const metadata: Metadata = {
  title: {
    default: "Sreeva AI - AI-Powered Recruitment Platform",
    template: "%s | Sreeva AI",
  },
  description: "Automate your hiring process with AI-driven screening and interviews using adaptive intelligence.",
  keywords: ["AI Recruitment", "AI Interviewer", "Candidate Screening", "SreevaAI", "Adaptive AI", "Sreeva AI", "technical interview automation", "automated hiring"],
  authors: [{ name: "Sreeva AI Team" }],
  metadataBase: new URL("https://www.sreevaai.com"),
  icons: {
    icon: "/sreevaailogo2.png",
    shortcut: "/sreevaailogo2.png",
    apple: "/sreevaailogo2.png",
  },
  // No root canonical -- each page declares its own via page-level metadata
  openGraph: {
    title: "Sreeva AI - AI-Powered Recruitment Platform",
    description: "Automate your hiring process with AI-driven screening and interviews using adaptive intelligence.",
    url: "https://www.sreevaai.com",
    siteName: "Sreeva AI",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Sreeva AI — adaptive AI interviewer for first-round hiring",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sreeva AI - AI-Powered Recruitment Platform",
    description: "Automate your hiring process with AI-driven screening and interviews using adaptive intelligence.",
    images: [{ url: "/og-image.png", alt: "Sreeva AI — adaptive AI interviewer for first-round hiring" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ViewTransitions>
      <html lang="en" suppressHydrationWarning className={GeistSans.variable}>
        <head>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />
        </head>
        <body className="font-sans antialiased" suppressHydrationWarning>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-LRB7QT4RJR"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-LRB7QT4RJR');
          `}
        </Script>
        <ClarityAnalytics />
        <AuthProvider>
            <Suspense fallback={
              <div className="min-h-screen flex flex-col items-center justify-center bg-white" aria-label="Loading Sreeva AI">
                <img src="/sreevaailogo2.png" alt="Sreeva AI" className="h-16 w-16 mb-4 animate-pulse" />
                <p className="text-2xl font-bold text-slate-900" aria-hidden="true">Sreeva AI</p>
                <p className="text-slate-500 mt-2 animate-pulse">Setting up your AI-powered interview environment...</p>
              </div>
            }>
              <JobsProvider>
                <CandidatesProvider>
                  {children}
                <Toaster />
              </CandidatesProvider>
            </JobsProvider>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
    </ViewTransitions>
  );
}
