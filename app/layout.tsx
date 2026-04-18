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
  title: "Hirer.ai - AI-Powered Recruitment Platform",
  description: "Automate your hiring process with AI-driven screening and interviews.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>

      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AuthProvider>
          <JobsProvider>
            <CandidatesProvider>
              {children}
              <Toaster />
            </CandidatesProvider>
          </JobsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

