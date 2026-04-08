import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { JobsProvider } from "@/context/jobs-context";
import { AuthProvider } from "@/context/auth-context";
import { CandidatesProvider } from "@/context/candidates-context";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <JobsProvider>
            <CandidatesProvider>
              {children}
            </CandidatesProvider>
          </JobsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
