"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";

const footerGroups = [
    { title: "Product", links: ["Adaptive Engine", "Skill Library", "Integrations", "Security"] },
    { title: "Company", links: ["Careers", "About Us", "Blog", "News"] },
    { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Security"] },
    { title: "Support", links: ["Contact Sales", "Status", "Help Center"] },
];

const bodyP: React.CSSProperties = { fontSize: 15, color: "#4B5563", lineHeight: 1.7, margin: "0 0 12px" };
const sectionH: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em", margin: "0 0 10px", paddingTop: 4 };
const lnk: React.CSSProperties = { color: "#7C3AED", textDecoration: "none", fontWeight: 500 };
const bullet = (items: string[]) => (
    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(i => <li key={i} style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.6 }}>• {i}</li>)}
    </ul>
);

function SubHead({ children }: { children: React.ReactNode }) {
    return <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 16 }}>{children}</p>;
}

export default function PrivacyPolicy() {
    const [session, setSession] = useState<any>(null);
    useEffect(() => {
        window.scrollTo(0, 0);
        fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => d && setSession(d)).catch(() => {});
    }, []);
    const ws = session?.role === "SUPER_ADMIN" ? "/super-admin" : "/admin";

    return (
        <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#FFFFFF 0%,#FAFAFC 45%,#F5F3FF 100%)", fontFamily: "var(--font-geist-sans)", color: "#111827" }}>
            {/* Sticky header */}
            <header style={{ height: 64, borderBottom: "1px solid #E9E7FF", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50 }}>
                <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                        <img src="/sreevaai-logo.png" alt="Sreeva AI" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 4 }} />
                        <span style={{ fontSize: 17, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em" }}>Sreeva AI</span>
                    </Link>
                    <Link href={session ? ws : "/login"} style={{ height: 36, padding: "0 16px", borderRadius: 10, background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "white", fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", textDecoration: "none", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}>
                        {session ? "Open Workspace" : "Sign In"}
                    </Link>
                </div>
            </header>

            <main style={{ padding: "64px 32px 80px" }}>
                <div style={{ maxWidth: 760, margin: "0 auto" }}>
                    <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "#7C3AED", textDecoration: "none", marginBottom: 32 }}>← Back to Home</Link>
                    <div style={{ marginBottom: 48 }}>
                        <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 999, background: "#F5F3FF", border: "1px solid #E9E7FF", fontSize: 11, fontWeight: 600, color: "#7C3AED", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Legal</div>
                        <h1 style={{ fontSize: "clamp(28px,4vw,40px)", fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 12px" }}>Privacy Policy</h1>
                        <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Last Updated: July 11, 2026</p>
                    </div>
                    <div style={{ background: "#FFFFFF", border: "1px solid #E9E7FF", borderRadius: 20, padding: "40px 48px", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                        <p style={bodyP}>This Privacy Policy describes how SreevaAI ("SreevaAI," "we," "us") collects, uses, stores, and protects data through the SreevaAI platform. This Policy is written for our current operating scope, clients and candidates located in India, with data hosted on India-based servers, and is aligned with India's Digital Personal Data Protection Act, 2023 ("DPDP Act") and its Rules.</p>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>1. WHO WE ARE</h2><p style={bodyP}>SreevaAI is an AI-powered first-round interview and screening platform. For any privacy question, contact our Grievance Officer at <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a>.</p></section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>2. HOW DATA RESPONSIBILITY WORKS</h2>
                            <p style={bodyP}>Two entities are involved whenever a candidate's data moves through SreevaAI: your organization, and us.</p>
                            <p style={bodyP}>Your organization decides which candidates to interview, what job requirements to screen against, and ultimately who to hire, so under India's data protection law, your organization is the Data Fiduciary for that candidate data. SreevaAI runs the platform that conducts the interview, generates the report, and stores the recording on your organization's instructions, so we act as the Data Processor. This is the same structural relationship used across this industry: it simply reflects who is actually making the hiring decisions versus who is providing the tool.</p>
                            <p style={{ ...bodyP, marginBottom: 0 }}>In practice, this means SreevaAI facilitates your screening process, but does not participate in or make any hiring decision. The consent shown to each candidate before their interview begins is designed to make this relationship clear to them too: who is running the interview, what happens to their data, and who ultimately decides the outcome.</p>
                        </section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>3. DATA WE COLLECT</h2>
                            <SubHead>Account Data (from you, our Client):</SubHead><p style={bodyP}>Name, email, organization name, job title, password/authentication credentials.</p>
                            <SubHead>Billing Data:</SubHead><p style={bodyP}>Transaction history and invoice records. Card details are handled entirely by our payment processor, we do not store full card numbers.</p>
                            <SubHead>Candidate Data (processed on your behalf):</SubHead><p style={bodyP}>Resume content, email address, phone number, and professional background as submitted through the platform.</p>
                            <SubHead>Interview Data:</SubHead><p style={bodyP}>Audio/video recordings, transcripts, AI-generated scores, assessment reports, and related metadata.</p>
                            <SubHead>Proctoring Data (optional, per-organization):</SubHead><p style={bodyP}>If, and only if, your organization has enabled proctoring for a role, this may include facial-presence verification, tab-switch detection, and camera/microphone status during the interview. This feature is off by default and only active where a Client has explicitly turned it on.</p>
                            <SubHead>Usage &amp; Technical Data:</SubHead><p style={bodyP}>Feature usage, session data, IP address, browser type, and the questions/scoring criteria configured for your organization.</p>
                        </section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>4. WHY WE PROCESS THIS DATA</h2>
                            {bullet(["To create and manage your account","To process billing and issue invoices","To conduct AI interviews and generate assessment reports, strictly on your instructions","To detect and prevent fraud, misuse, and security threats","To improve platform performance and reliability","To comply with our own legal obligations under Indian law"])}
                            <p style={{ ...bodyP, marginBottom: 0 }}>Where candidate data is processed for the purposes of your recruitment activity, this may fall under "legitimate use for employment purposes" recognized under the DPDP Act. Regardless, we require that every candidate give explicit, informed consent, via a standalone, plain-language notice and an affirmative "I Agree" action, before any AI interview begins. This consent notice must clearly state: that the interview is AI-conducted, that it will be recorded, and whether optional proctoring is active for that specific interview.</p>
                        </section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>5. BIOMETRIC &amp; PROCTORING DATA, HANDLED SEPARATELY, WITH EXTRA CARE</h2>
                            <p style={bodyP}>If your organization has enabled proctoring for a role:</p>
                            {bullet(["Candidates are informed of exactly which signals are active (e.g., face-presence check, tab-switch detection) before consenting to the interview.","We use facial-presence verification for identity/authenticity purposes only. We do NOT analyze facial expressions or emotions, build facial recognition databases, train AI models on biometric data, or share biometric data with any third party.","Biometric data is automatically deleted at the same time as the associated interview recording (see retention table below)."])}
                        </section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>6. AI USE &amp; TRANSPARENCY</h2>
                            <p style={bodyP}>The platform's AI conducts the interview and generates per-skill scores and a recommendation summary. To be direct about this: we do not use AI to make any decision that has a legal or similarly significant effect on a candidate, and we never will without a human reviewing it first. SreevaAI does not make hiring decisions, and neither does the AI acting alone, your organization's human team makes every actual hiring decision, every time.</p>
                            <p style={{ ...bodyP, marginBottom: 0 }}>Candidates may request human review of their AI-generated result within 7 days of the interview, or ask for an explanation of how the AI's scoring influenced their result. Your organization is required to honor and respond to such requests.</p>
                        </section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>7. WHO WE SHARE DATA WITH</h2>
                            <p style={bodyP}>We share data only with the infrastructure and service providers necessary to run the platform, listed here by name so you know exactly who touches your data: Supabase (PostgreSQL database), Cloudflare R2 (file and recording storage), LiveKit Cloud (interview voice/video sessions), OpenAI (AI processing), Deepgram (speech-to-text), Cartesia (text-to-speech), Redis Cloud (job queues), and Resend (transactional email). All are used strictly to deliver platform functionality on your organization's instructions.</p>
                            <p style={bodyP}>If we add a new sub-processor in the future, we'll notify registered Clients by email, and you'll have 15 days to raise any objection before we treat the addition as accepted.</p>
                            <p style={bodyP}>We also share data with payment processors to handle billing, and with legal authorities only where required by applicable law.</p>
                            <p style={bodyP}><strong>We do not sell candidate or client data to any third party, for any purpose.</strong></p>
                            <p style={{ ...bodyP, marginBottom: 0 }}><strong>We do not use your candidates' interview recordings, transcripts, or resume data to train our underlying AI models.</strong></p>
                        </section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>8. DATA RETENTION</h2>
                            <p style={bodyP}>Account data stays with us for as long as your organization's account is active, plus 3 years after closure. Interview recordings are kept for 7, 14, or 30 days depending on your plan, or a custom period if your organization has arranged one, after which they're deleted automatically. Biometric or proctoring data, where collected, is deleted at the exact same time as its associated recording, never separately. Billing records are kept for 7 years, as required under Indian tax law. System access and processing logs are kept for a minimum of 1 year, in line with the DPDP Rules.</p>
                        </section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>9. YOUR RIGHTS</h2>
                            <p style={bodyP}>Under the DPDP Act, you (and candidates, through your organization) have the right to:</p>
                            {bullet(["Access the personal data we hold","Correct inaccurate or incomplete data","Request erasure of personal data, subject to our legal retention obligations above","Withdraw consent at any time (withdrawal does not affect the lawfulness of processing carried out before withdrawal)","Nominate another individual to exercise these rights on your behalf in the event of death or incapacity"])}
                            <p style={bodyP}>To exercise any of these rights, email our Grievance Officer, Vadla Vamsi Krishna, at <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a>. We aim to respond within 7 working days.</p>
                            <p style={{ ...bodyP, marginBottom: 0 }}>If you are not satisfied with our response, you may escalate your grievance to the Data Protection Board of India as provided under the DPDP Act.</p>
                        </section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>10. SECURITY</h2><p style={{ ...bodyP, marginBottom: 0 }}>We use AES-256 encryption for data at rest and HTTPS/TLS for data in transit. In the event of any personal data breach, regardless of severity, we will notify affected Clients and, where legally required, the Data Protection Board of India, without undue delay.</p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>11. CROSS-BORDER DATA TRANSFER</h2><p style={{ ...bodyP, marginBottom: 0 }}>At present, all platform data is hosted on servers located in India. We do not currently transfer personal data outside India. If this changes in the future, we will update this Policy and ensure any transfer complies with DPDP Act requirements at that time.</p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>12. COOKIES</h2><p style={{ ...bodyP, marginBottom: 0 }}>We use only essential cookies required to keep you logged in and the platform functioning. We do not use advertising or third-party tracking cookies.</p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>13. CHILDREN'S DATA</h2><p style={{ ...bodyP, marginBottom: 0 }}>This platform is not intended for individuals under 18. We do not knowingly collect data from anyone under 18; if you believe we have, contact us immediately for deletion.</p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>14. CHANGES TO THIS POLICY</h2><p style={{ ...bodyP, marginBottom: 0 }}>We will notify Clients of material changes by email at least 30 days before they take effect. Continued use of the platform after that date constitutes acceptance of the updated Policy.</p></section>
                        <section style={{ marginBottom: 0 }}><h2 style={sectionH}>15. CONTACT US</h2><p style={{ ...bodyP, marginBottom: 0 }}>Questions or requests regarding this Policy? Email our Grievance Officer at <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a>.</p></section>
                        <div style={{ marginTop: 40, paddingTop: 32, borderTop: "1px solid #F0EEF8", textAlign: "center" }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: 0 }}>By using SreevaAI, you agree to this Privacy Policy.</p>
                        </div>
                    </div>
                </div>
            </main>

            <footer style={{ borderTop: "1px solid #E9E7FF", background: "#FFFFFF", padding: "48px 32px" }}>
                <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 32 }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                            <img src="/sreevaai-logo.png" alt="" style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 4 }} />
                            <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Sreeva AI</span>
                        </div>
                        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>© 2026 Sreeva AI. All rights reserved.</p>
                    </div>
                    {footerGroups.map(g => (
                        <div key={g.title}>
                            <h5 style={{ fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, marginTop: 0 }}>{g.title}</h5>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                                {g.links.map(item => (
                                    <li key={item}><Link href={item === "Terms of Service" ? "/terms" : item === "Privacy Policy" ? "/privacy" : "#"} style={{ fontSize: 13, color: "#6B7280", textDecoration: "none" }}>{item}</Link></li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </footer>
        </div>
    );
}
