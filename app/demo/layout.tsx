import type { Metadata } from "next";

const PAGE_TITLE = "Try the AI Interview Demo | Sreeva AI";
const PAGE_DESCRIPTION =
  "See Ishitha interview a candidate live. No signup required. Experience adaptive questioning and real-time integrity scoring in one session.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/demo",
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://www.sreevaai.com/demo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
