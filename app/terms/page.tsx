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
        <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#FFFFFF 0%,#FAFAFC 45%,#F5F3FF 100%)", fontFamily: "var(--font-geist-sans),system-ui,sans-serif", color: "#111827" }}>
            {/* Header */}
            <header style={{ height: 64, borderBottom: "1px solid #E9E7FF", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50 }}>
                <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                        <img src="/sreevaailogo2.png" alt="Sreeva AI" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 4 }} />
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
                        <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Last Updated: April 26, 2026</p>
                    </div>
                    <div style={{ background: "#FFFFFF", border: "1px solid #E9E7FF", borderRadius: 20, padding: "40px 48px", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                        <p style={bodyP}>These Terms of Use govern your access to and use of the SreevaAI platform and services. By creating an account or using the platform, you agree to these Terms in full.</p>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>1. ELIGIBILITY</h2>
                            <p style={bodyP}>You must be at least 18 years old and have the legal authority to enter into these Terms on behalf of yourself or your organization.</p>
                            <p style={bodyP}>You are responsible for maintaining the confidentiality of your account credentials. All activity under your account is your responsibility. Notify <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a> immediately if you suspect unauthorized access.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>2. WHAT WE PROVIDE</h2>
                            <p style={bodyP}>SreevaAI is an AI-powered interview platform that includes:</p>
                            {bullet(["Resume and job description analysis","AI-powered video interviews with adaptive follow-up questions","Behavioral and integrity assessment reports","Interview recordings and transcripts","Proctoring and authenticity verification"])}
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>3. AI INTERVIEWS — HOW IT WORKS</h2>
                            <p style={subH}>Before Each Interview:</p>
                            <p style={bodyP}>Candidates must be informed that the interview will be conducted by AI and must click &quot;I Agree&quot; to proceed. No interview happens without their explicit consent.</p>
                            <p style={subH}>The Interview:</p>
                            <p style={bodyP}>The AI asks questions based on the job description and candidate resume, detects follow-up opportunities, and generates a score.</p>
                            <p style={subH}>After the Interview:</p>
                            <p style={bodyP}>Candidates receive their score and a summary. They can request human review within 7 days. You must honor such requests.</p>
                            <p style={{ ...bodyP, fontWeight: 600, color: "#374151" }}>Important: AI recommendations are suggestions only. Final hiring decisions are your responsibility.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>4. BILLING</h2>
                            <p style={subH}>Billing Process:</p>
                            <p style={bodyP}>We charge your card on the 1st of each month. Top-ups are charged when they occur. You will receive an invoice after each charge.</p>
                            <p style={subH}>Refunds:</p>
                            <p style={bodyP}>Refunds are available within 7 days of purchase if you have not conducted any interviews, or if a platform error prevented interviews from working. Contact <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a>.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>5. YOUR RESPONSIBILITIES</h2>
                            <p style={bodyP}>You must ensure all use of the platform complies with applicable law in your jurisdiction, including:</p>
                            {bullet(["Obtaining explicit consent from candidates before conducting interviews","Complying with employment and anti-discrimination laws","Following data protection laws (DPDP Act 2023, GDPR, CCPA)","Honoring candidate opt-out and withdrawal requests"])}
                            <p style={bodyP}>You must not discriminate, misuse candidate data, reverse engineer the platform, resell access, or circumvent billing.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>6. INTELLECTUAL PROPERTY</h2>
                            <p style={bodyP}>All intellectual property in the platform is owned by SreevaAI. You retain ownership of content you create (interview questions, candidate information, hiring decisions).</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>7. DATA AND PRIVACY</h2>
                            <p style={bodyP}>Your use of the platform is governed by our <Link href="/privacy" style={lnk}>Privacy Policy</Link>. You are the data controller; we are the data processor. You are responsible for having a lawful basis for processing and obtaining all required consents.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>8. SERVICE AVAILABILITY</h2>
                            <p style={bodyP}>We aim for high availability but do not guarantee uninterrupted service. We are not liable for downtime caused by events outside our control.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>9. DISCLAIMERS</h2>
                            <p style={bodyP}>The platform is provided &quot;as is.&quot; AI assessments are not professional advice and should not be the sole basis for hiring decisions.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>10. LIABILITY</h2>
                            <p style={bodyP}>We are not liable for indirect, consequential, or punitive damages. Our total liability for direct damages will not exceed the amount you paid in the 3 months before your claim.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>11. INDEMNIFICATION</h2>
                            <p style={bodyP}>You agree to protect us against claims arising from your use of the platform in violation of law, discriminatory hiring practices, or violation of candidate privacy rights.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>12. TERMINATION</h2>
                            <p style={bodyP}>Either party may terminate access at any time. We may suspend your account immediately if you breach these Terms.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>13. CHANGES TO THESE TERMS</h2>
                            <p style={bodyP}>Material changes will be communicated by email at least 30 days before taking effect. Continued use means you accept the updated Terms.</p>
                        </section>

                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>14. DISPUTE RESOLUTION</h2>
                            <p style={bodyP}>These Terms are governed by the laws of India. Disputes will be resolved through good faith negotiation.</p>
                        </section>

                        <section style={{ marginBottom: 0 }}>
                            <h2 style={sectionH}>15. CONTACT</h2>
                            <p style={{ ...bodyP, marginBottom: 0 }}>Questions? Email: <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a></p>
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
                            <img src="/sreevaailogo2.png" alt="" style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 4 }} />
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
