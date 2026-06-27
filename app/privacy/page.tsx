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
        <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#FFFFFF 0%,#FAFAFC 45%,#F5F3FF 100%)", fontFamily: "var(--font-geist-sans),system-ui,sans-serif", color: "#111827" }}>
            {/* Sticky header */}
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
                        <h1 style={{ fontSize: "clamp(28px,4vw,40px)", fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 12px" }}>Privacy Policy</h1>
                        <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Last Updated: April 26, 2026</p>
                    </div>
                    <div style={{ background: "#FFFFFF", border: "1px solid #E9E7FF", borderRadius: 20, padding: "40px 48px", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                        <p style={bodyP}>This Privacy Policy describes how SreevaAI collects, uses, stores, and protects your data when you use the platform.</p>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>1. WHO WE ARE</h2><p style={bodyP}>SreevaAI is an AI interview platform. For privacy questions, contact <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a>.</p></section>
                        <section style={{ marginBottom: 28 }}>
                            <h2 style={sectionH}>2. DATA WE COLLECT</h2>
                            <SubHead>Account Data:</SubHead><p style={bodyP}>Name, email, organization name, job title, password, and authentication credentials.</p>
                            <SubHead>Billing Data:</SubHead><p style={bodyP}>Transaction history and invoice records. Card data is processed by payment providers only.</p>
                            <SubHead>Candidate Data:</SubHead><p style={bodyP}>Resumes, email addresses, phone numbers, professional background.</p>
                            <SubHead>Interview Data:</SubHead><p style={bodyP}>Audio/video recordings, transcripts, AI scores, assessment reports, and metadata.</p>
                            <SubHead>Proctoring Data:</SubHead><p style={bodyP}>Facial recognition, mouse movement, tab switching, camera/microphone status during interviews.</p>
                            <SubHead>Usage &amp; Configuration Data:</SubHead><p style={bodyP}>Feature usage, session data, IP address, browser type, interview questions, and scoring criteria.</p>
                        </section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>3. WHY WE COLLECT THIS DATA</h2>{bullet(["Create and manage your account","Process billing and send invoices","Conduct interviews and generate assessments","Prevent fraud and security threats","Improve the platform","Comply with legal obligations"])}</section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>4. BIOMETRIC DATA</h2><p style={bodyP}>We use facial recognition to verify identity. We do NOT analyze expressions, build facial databases, train AI models on biometric data, or share with third parties. Biometric data is deleted when the recording is deleted.</p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>5. HOW CANDIDATE DATA IS PROCESSED</h2>{bullet(["You are the data controller","SreevaAI is the data processor","You are responsible for obtaining candidate consent"])}</section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>6. LEGAL BASIS</h2><p style={bodyP}>India&apos;s DPDP Act 2023, GDPR (Contract / Legitimate interest / Consent), and CCPA.</p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>7. DATA ACCESS</h2><p style={bodyP}>We share data only with infrastructure providers, payment processors, and legal authorities when required by law. <strong>We do NOT sell data to third parties.</strong></p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>8. DATA RETENTION</h2>{bullet(["Account Data: Active account + 3 years","Interview Recordings: 7/14/30 days or Custom","Biometric Data: Deleted with recording","Billing Data: 7 years (tax requirement)"])}</section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>9. YOUR RIGHTS</h2><p style={bodyP}>Access, correct, or request deletion of your data. Email <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a>. We respond within 30 days.</p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>10. SECURITY</h2><p style={bodyP}>AES-256 encryption and HTTPS. We notify users within 72 hours of any breach.</p></section>
                        <section style={{ marginBottom: 28 }}><h2 style={sectionH}>11. COOKIES</h2><p style={bodyP}>Essential cookies only to keep you logged in. No advertising cookies.</p></section>
                        <section style={{ marginBottom: 0 }}><h2 style={sectionH}>12. CONTACT US</h2><p style={{ ...bodyP, marginBottom: 0 }}>Questions? <a href="mailto:support@sreevaai.com" style={lnk}>support@sreevaai.com</a></p></section>
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
