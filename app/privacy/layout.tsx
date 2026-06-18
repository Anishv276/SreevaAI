import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how Sreeva AI collects, uses, stores, and protects your data when you use the platform. Covers candidate data, interview recordings, biometric data, and your rights.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy — Sreeva AI",
    description: "Learn how Sreeva AI collects, uses, stores, and protects your data. Covers interview recordings, biometric data, and your rights under GDPR, CCPA, and India's DPDP Act.",
    url: "https://www.sreevaai.com/privacy",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy — Sreeva AI",
    description: "How Sreeva AI handles your data: interview recordings, biometric data, and your rights.",
  },
  robots: {
    index: true,
    follow: true,
  },
};
export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
