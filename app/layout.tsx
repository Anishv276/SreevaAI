import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { JobsProvider } from "@/context/jobs-context";
import { AuthProvider } from "@/context/auth-context";
import { CandidatesProvider } from "@/context/candidates-context";
import { Toaster } from "@/components/ui/toast-custom";

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "Sreeva AI - AI-Powered Recruitment Platform",
  description: "Automate your hiring process with AI-driven screening and interviews using adaptive intelligence.",
  keywords: ["AI Recruitment", "AI Interviewer", "Candidate Screening", "HR Automation", "Adaptive AI", "Sreeva AI"],
  authors: [{ name: "Sreeva AI Team" }],
  metadataBase: new URL("https://www.sreevaai.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Sreeva AI - AI-Powered Recruitment Platform",
    description: "Automate your hiring process with AI-driven screening and interviews.",
    url: "https://www.sreevaai.com",
    siteName: "Sreeva AI",
    images: [
      {
        url: "/Logo.png",
        width: 800,
        height: 600,
        alt: "Sreeva AI Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sreeva AI - AI-Powered Recruitment Platform",
    description: "Automate your hiring process with AI-driven screening and interviews.",
    images: ["/Logo.png"],
  },
  icons: {
    icon: "/Logo.png",
    shortcut: "/Logo.png",
    apple: "/Logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>

      <head>
        <link rel="icon" href="/Logo.png" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
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
        <AuthProvider>
          <Suspense fallback={
            <div className="min-h-screen flex flex-col items-center justify-center bg-white">
              <img src="/Logo.png" alt="Sreeva AI" className="h-16 w-16 mb-4 animate-pulse" />
              <h1 className="text-2xl font-bold text-slate-900">Sreeva AI - Intelligent Recruitment Platform</h1>
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
  );
}

