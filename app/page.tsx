import type { Metadata } from "next";
import LandingPageClient from "@/components/landing/LandingPageClient";

const PAGE_TITLE = "Sreeva AI: AI Interviewer for First-Round Interviews";
const PAGE_DESCRIPTION =
  "Ishitha runs first-round interviews for tech and customer-facing roles. She probes every claim, exposes resume inflation, and hands your team a decision-ready report in 20 minutes.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://www.sreevaai.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.sreevaai.com/#organization",
      name: "Sreeva AI",
      url: "https://www.sreevaai.com",
      logo: {
        "@type": "ImageObject",
        url: "https://www.sreevaai.com/sreevaailogo2.png",
        width: 512,
        height: 512,
      },
      description:
        "Sreeva AI runs first-round interviews for tech roles (engineering, data/ML, DevOps/SRE, QA) and customer-facing roles (sales, CS, support). Ishitha, the AI interviewer, probes every claim on the resume and delivers a decision-ready report in 20 minutes.",
      contactPoint: {
        "@type": "ContactPoint",
        email: "support@sreevaai.com",
        telephone: "+918919053970",
        contactType: "customer support",
        availableLanguage: ["English", "Hindi"],
      },
      sameAs: ["https://www.linkedin.com/company/sreeva-ai/about/"],
      foundingDate: "2025",
      areaServed: ["IN", "US", "GB"],
      knowsAbout: ["AI Recruitment", "First-Round Interviewing", "SreevaAI", "Candidate Screening"],
    },
    {
      "@type": "WebSite",
      "@id": "https://www.sreevaai.com/#website",
      url: "https://www.sreevaai.com",
      name: "Sreeva AI",
      publisher: { "@id": "https://www.sreevaai.com/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://www.sreevaai.com/?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "WebPage",
      "@id": "https://www.sreevaai.com/#webpage",
      url: "https://www.sreevaai.com",
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      isPartOf: { "@id": "https://www.sreevaai.com/#website" },
      about: { "@id": "https://www.sreevaai.com/#organization" },
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.sreevaai.com/#webapp",
      name: "Sreeva AI",
      url: "https://www.sreevaai.com",
      description:
        "Adaptive AI interviewer that conducts first-round interviews for tech and customer-facing roles, probes every claim, and delivers hire/hold/reject recommendations in 20 minutes. Supports English and Hindi. 12+ cheat detectors combined into one integrity score.",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Human Resources Software",
      operatingSystem: "Web Browser",
      browserRequirements: "Requires a modern browser with microphone access",
      inLanguage: ["en", "hi"],
      featureList: [
        "Adaptive AI interviews that generate questions from candidate answers",
        "Resume analysis against job description",
        "12+ behavioral and technical cheat detection signals",
        "Per-skill scoring with verbatim transcript evidence",
        "Hire/Hold/Reject recommendation",
        "Hindi and English language support",
        "20-minute interview sessions",
        "Real-time integrity scoring",
      ],
      offers: [
        {
          "@type": "Offer",
          name: "Starter",
          price: "99",
          priceCurrency: "USD",
          billingIncrement: "P1M",
          description: "30 interviews per month, up to 20 minutes per interview, $4.50 top-up per additional interview",
        },
        {
          "@type": "Offer",
          name: "Growth",
          price: "299",
          priceCurrency: "USD",
          billingIncrement: "P1M",
          description: "100 interviews per month, multilingual support, $3.50 top-up per additional interview",
        },
        {
          "@type": "Offer",
          name: "Scale",
          price: "699",
          priceCurrency: "USD",
          billingIncrement: "P1M",
          description: "300 interviews per month, advanced proctoring, $2.80 top-up per additional interview",
        },
        {
          "@type": "Offer",
          name: "Business",
          price: "0",
          priceCurrency: "USD",
          description: "Custom pricing for 600+ interviews per month with dedicated support",
        },
      ],
      publisher: { "@id": "https://www.sreevaai.com/#organization" },
    },
    {
      "@type": "FAQPage",
      "@id": "https://www.sreevaai.com/#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is this a real conversation or pre-recorded questions?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "It's a live voice call. Ishita, Sreeva's AI interviewer, joins the call and conducts the interview in real time. Every question is generated from what the candidate just said. There are no scripts, no fixed question banks, no branching logic. The conversation is genuinely different for every candidate.",
          },
        },
        {
          "@type": "Question",
          name: "How does Sreeva AI know what to ask in an interview?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You upload your job description. Sreeva AI extracts the skills that matter most for the role: technical depth, ownership signals, domain knowledge. The interview opens on the candidate's resume, digs into their actual work, and follows every thread. If they claim something, Ishita probes it. If they go deep, she goes deeper.",
          },
        },
        {
          "@type": "Question",
          name: "What does the Sreeva AI interview report contain?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "A combined score from 0 to 100, per-skill breakdown with individual scores, a Hire/Hold/Reject recommendation with reasoning, verbatim evidence quotes pulled directly from the transcript with timestamps, behavioral analysis, and an integrity score. Everything your panel needs to make a decision without sitting in a call.",
          },
        },
        {
          "@type": "Question",
          name: "How does Sreeva AI detect cheating or impersonation?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sreeva monitors 12 or more behavioral and technical signals throughout the call, including attention patterns, audio anomalies, and response cadence shifts. These are combined into a single integrity score. Beyond signals, the adaptive follow-up questions themselves expose candidates who cannot defend what they claimed. There's no way to script your way through a depth probe.",
          },
        },
        {
          "@type": "Question",
          name: "How long does a Sreeva AI interview take?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "20 minutes. Ishita covers the candidate's resume, digs into key skills from the job description, and asks at least one situational and one behavioral question, all within the time limit.",
          },
        },
        {
          "@type": "Question",
          name: "Can I add my own questions to the AI interview?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. You can add custom questions when setting up a job. Ishita weaves them naturally into the conversation. They're always asked before the interview ends, without sounding like a checklist.",
          },
        },
        {
          "@type": "Question",
          name: "What languages does Sreeva AI support?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Hindi and English today. Candidates can interview in the language they think in, and Sreeva detects the preferred language and adjusts. More languages are coming.",
          },
        },
        {
          "@type": "Question",
          name: "Does the AI make the hiring decision?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Sreeva gives you a structured recommendation backed by evidence from the transcript. Your team makes the final call. The report is designed to make that decision faster and more defensible, not to replace it.",
          },
        },
        {
          "@type": "Question",
          name: "How do candidates join the Sreeva AI interview?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "They receive a link by email. One click, and Ishita is already on the call. No app to download, no account to create, no scheduling required. It works any time, any timezone, on any device with a browser.",
          },
        },
        {
          "@type": "Question",
          name: "How long does it take to set up a role on Sreeva AI?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Under 10 minutes. Upload your job description, review the extracted skills, invite candidates. The first interview can go out the same day.",
          },
        },
      ],
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPageClient />
    </>
  );
}
