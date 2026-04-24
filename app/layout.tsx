import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
  description: "Automate your hiring process with AI-driven screening and interviews.",
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
        <AuthProvider>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F8F9FB] animate-pulse">Loading Sreeva AI...</div>}>
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

