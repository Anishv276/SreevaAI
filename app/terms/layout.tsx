import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Read Sreeva AI's Terms of Use covering platform access, AI interview conduct, billing, candidate rights, intellectual property, and compliance with GDPR and India's DPDP Act.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Use: Sreeva AI",
    description: "Terms of Use for Sreeva AI: platform access, AI interview conduct, billing, candidate rights, and legal compliance.",
    url: "https://www.sreevaai.com/terms",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Terms of Use: Sreeva AI",
    description: "Terms of Use for the Sreeva AI adaptive interview platform.",
  },
  robots: {
    index: true,
    follow: true,
  },
};
export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
