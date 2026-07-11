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
const subH: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 16 };

const bullet = (items: string[]) => (
    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(i => <li key={i} style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.6 }}>• {i}</li>)}
    </ul>
);

export default function TermsOfUse() {
    const [session, setSession] = useState<any>(null);
    useEffect(() => {
        window.scrollTo(0, 0);
        fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => d && setSession(d)).catch(() => {});
    }, []);
    const ws = session?.role === "SUPER_ADMIN" ? "/super-admin" : "/admin";

    return (
        <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#FFFFFF 0%,#FAFAFC 45%,#F5F3FF 100%)", fontFamily: "var(--font-geist-sans)", color: "#111827" }}>
            {/* Header */}
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
                        <h1 style={{ fontSize: "clamp(28px,4vw,40px)", fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 12px" }}>Terms of Use</h1>
                        <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Last Updated: July 11, 2026</p>
                    </div>
                    <div style={{ background: "#FFFFFF", border: "1px solid #E9E7FF", borderRadius: 20, padding: "40px 48px", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                        <p style={bodyP}>These Terms of Use ("Terms") govern access to and use of the SreevaAI platform and services, operated by SreevaAI ("SreevaAI," "we," "us"). By creating an account or using the platform, you ("Client," "you") agree to these Terms in full.</p>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>1. ACCEPTANCE &amp; ELIGIBILITY</h2>
                            <p style={bodyP}>You must be at least 18 years old and have the legal authority to enter into these Terms on behalf of yourself or the organization you represent.</p>
                            <p style={bodyP}>You are responsible for maintaining the confidentiality of your account credentials. All activity under your account is your responsibility. Notify <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a> immediately if you suspect unauthorized access.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>2. WHAT WE PROVIDE</h2>
                            <p style={bodyP}>SreevaAI is an AI-powered interview and screening platform that includes:</p>
                            {bullet(["Resume and job description analysis","AI-conducted first-round technical interviews with adaptive follow-up questions","Skill and integrity assessment reports","Interview recordings and transcripts","Optional proctoring and authenticity signals (see Section 3, available only if enabled for your organization)"])}
                            <p style={{ ...bodyP, marginBottom: 0 }}>SreevaAI conducts first-round screening only. It does not replace your final-round interviews or your hiring decision-making process.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>3. HOW THE AI INTERVIEW WORKS</h2>
                            <p style={subH}>Before Each Interview:</p>
                            <p style={bodyP}>Candidates must be clearly informed that the interview will be conducted by an AI system, told what data will be collected (including whether the call is recorded and whether optional proctoring signals are active for your organization), and must affirmatively click "I Agree" before the interview begins. No interview may proceed without this explicit, informed consent.</p>
                            <p style={subH}>During the Interview:</p>
                            <p style={bodyP}>The AI asks questions grounded in the job description and the candidate's resume, generates adaptive follow-up questions based on the candidate's answers, and produces per-skill scores.</p>
                            <p style={subH}>Optional Proctoring:</p>
                            <p style={bodyP}>Proctoring/integrity signals (e.g., tab-switch detection, face-presence checks) are off by default and only active if your organization has explicitly enabled them for a given interview. If enabled, candidates must be informed of exactly which signals are active before the interview begins.</p>
                            <p style={subH}>After the Interview:</p>
                            <p style={bodyP}>Candidates receive their score and a summary. Candidates may request human review of their result within 7 days of completion, and you must honor such requests.</p>
                            <p style={{ ...bodyP, fontWeight: 600, color: "#374151", marginBottom: 0 }}>Important: AI-generated scores and recommendations are decision-support only. SreevaAI does not make hiring decisions. You and your organization are solely responsible for all hiring decisions, including whether, how, and to what extent AI-generated output is used in those decisions.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>4. BILLING</h2>
                            <p style={subH}>Billing Process:</p>
                            <p style={bodyP}>Your card is charged according to your selected plan on the 1st of each billing cycle. Interview top-ups beyond your plan's included volume are charged as they occur. You will receive an invoice after each charge.</p>
                            <p style={subH}>Refunds:</p>
                            <p style={{ ...bodyP, marginBottom: 0 }}>Refunds are available within 7 days of purchase if you have not conducted any interviews under that purchase, or if a verified platform error prevented interviews from running. Contact <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a> to request a refund.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>5. HOW RESPONSIBILITY IS DIVIDED</h2>
                            <p style={bodyP}>SreevaAI provides the platform; your organization decides how it's used. In practical terms, that means your organization handles obtaining valid candidate consent before any AI interview, ensuring your hiring process complies with applicable Indian employment and anti-discrimination law, and responding to candidate data requests as required under the DPDP Act. SreevaAI, in turn, handles the platform, the interview itself, and honoring any human-review request a candidate raises within the 7-day window.</p>
                            <p style={bodyP}>We ask that SreevaAI's output never be used as the sole, unreviewed basis for an adverse hiring decision, a human on your team should always be able to review it. Discrimination against candidates on any legally protected basis, misuse of candidate data outside legitimate hiring purposes, attempts to reverse-engineer the platform, and reselling access without our written consent are all outside what these Terms permit.</p>
                            <p style={{ ...bodyP, marginBottom: 0 }}>Under the DPDP Act, your organization is the Data Fiduciary for candidate personal data processed through the platform, and SreevaAI acts as your Data Processor. See our <Link href="/privacy" style={lnk}>Privacy Policy</Link> for the full detail on how that relationship works day to day.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>6. INTELLECTUAL PROPERTY</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>All intellectual property in the platform, including the underlying models, scoring methodology, and software, is owned by SreevaAI. You retain ownership of content you create or submit (job descriptions, custom interview questions, and the hiring decisions you make).</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>7. SERVICE AVAILABILITY</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>We aim for high availability but do not guarantee uninterrupted service. We are not liable for downtime caused by events outside our reasonable control (including third-party infrastructure, telecom, or cloud-provider outages).</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>8. DISCLAIMERS</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>The platform is provided "as is." AI-generated assessments are not professional, legal, or employment advice, are not infallible, and must not be treated as the sole basis for any hiring decision. You are responsible for independently verifying any output you rely on for a consequential decision.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>9. LIMITATION OF LIABILITY</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>We are not liable for indirect, incidental, consequential, or punitive damages arising from your use of the platform. Our total liability for direct damages arising from any claim will not exceed the total amount you paid us in the 3 months preceding the claim.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>10. INDEMNIFICATION</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>You agree to indemnify and hold SreevaAI harmless from claims arising out of: your use of the platform in violation of applicable law; discriminatory or unlawful hiring practices on your part; your failure to obtain valid candidate consent; or your violation of candidate data-privacy rights.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>11. TERMINATION</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>Either party may terminate access at any time, subject to any active billing cycle. We may suspend or terminate your account immediately if you materially breach these Terms.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>12. CHANGES TO THESE TERMS</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>We will notify you of material changes by email at least 30 days before they take effect. Continued use of the platform after that date constitutes acceptance of the updated Terms.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>13. GOVERNING LAW &amp; DISPUTE RESOLUTION</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>These Terms are governed by the laws of India. Disputes will first be addressed through good-faith negotiation between the parties for 30 days. If unresolved, disputes shall be referred to and finally resolved by arbitration in India, under the Arbitration and Conciliation Act, 1996, in English. This keeps any dispute resolution process faster and less costly than court litigation for both sides.</p>
                        </section>

                        <section style={{ marginBottom: 0 }}>
                            <h2 style={sectionH}>14. CONTACT</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>Questions about these Terms? Email <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a>.</p>
                        </section>

                        <div style={{ marginTop: 40, paddingTop: 32, borderTop: "1px solid #F0EEF8", textAlign: "center" }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: 0 }}>By using SreevaAI, you agree to these Terms.</p>
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
