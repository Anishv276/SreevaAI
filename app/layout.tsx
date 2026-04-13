import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { JobsProvider } from "@/context/jobs-context";
import { AuthProvider } from "@/context/auth-context";
import { CandidatesProvider } from "@/context/candidates-context";

const jakarta = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: '--font-jakarta',
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
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>

      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
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
