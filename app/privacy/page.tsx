'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

type Session = {
    user: {
        id: string;
        name: string;
        email: string;
    };
    role: "USER" | "ADMIN" | "SUPER_ADMIN";
};

const footerGroups = [
    {
        title: "Product",
        links: ["Adaptive Engine", "Skill Library", "Integrations", "Security"],
    },
    {
        title: "Company",
        links: ["Careers", "About Us", "Blog", "News"],
    },
    {
        title: "Legal",
        links: ["Privacy Policy", "Terms of Service", "Security"],
    },
    {
        title: "Support",
        links: ["Contact Sales", "Status", "Help Center"],
    },
];

export default function PrivacyPolicy() {
    const [session, setSession] = useState<Session | null>(null);

    useEffect(() => {
        // Ensure page starts at the top
        window.scrollTo(0, 0);

        const checkAuth = async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = (await res.json()) as Session;
                    setSession(data);
                }
            } catch (err) {
                console.error("Auth check failed", err);
            }
        };

        checkAuth();
    }, []);

    const dashboardHref = session?.role === "SUPER_ADMIN" ? "/super-admin" : "/admin";
    const ctaHref = session ? dashboardHref : "https://cal.com/vamsivk/30min";

    return (
        <div className="min-h-screen bg-white text-slate-900">
            {/* Header */}
            <header className="h-20 border-b border-slate-100">
                <div className="mx-auto flex h-full max-w-[1320px] items-center justify-between px-6">
                    <Link href="/" className="flex items-center gap-3 font-display text-2xl font-black text-slate-900">
                        <img src="/Logo.png" alt="Sreeva AI Logo" className="h-10 w-10 object-contain" />
                        <span>Sreeva AI</span>
                    </Link>

                    <div className="flex items-center gap-4">
                        {!session && (
                            <Link href="/login" className="font-medium text-slate-600">
                                Login
                            </Link>
                        )}
                        <Link
                            href={ctaHref}
                            className="bg-black px-6 py-2 rounded font-bold text-white"
                        >
                            {session ? "Dashboard" : "Book Demo"}
                        </Link>
                    </div>
                </div>
            </header>

            <main className="py-16">
                <div className="mx-auto max-w-[800px] px-6 text-slate-800">
                    <Link href="/#footer" className="inline-block mb-8 text-sm font-bold hover:underline">
                        ← Back to Home
                    </Link>
                    <h1 className="text-3xl font-bold mb-2">PRIVACY POLICY</h1>
                    <p className="mb-8 text-slate-500">Last Updated: April 26, 2026</p>

                    <p className="mb-8">This Privacy Policy describes how SreevaAI collects, uses, stores, and protects your data when you use the platform.</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">1. WHO WE ARE</h2>
                    <p className="mb-4">SreevaAI is an AI interview platform. For privacy questions, please contact us at <a href="mailto:support@sreevaai.com" className="font-bold text-black">support@sreevaai.com</a>.</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">2. DATA WE COLLECT</h2>
                    <p className="font-bold mt-4 mb-2">Account Data:</p>
                    <p className="mb-4">Name, email, organization name, job title, password, and authentication credentials.</p>

                    <p className="font-bold mt-4 mb-2">Billing Data:</p>
                    <p className="mb-4">Transaction history and invoice records. Your credit card is processed by payment providers (we never see or store it).</p>

                    <p className="font-bold mt-4 mb-2">Candidate Data:</p>
                    <p className="mb-4">Information you upload: resumes, email addresses, phone numbers, professional background.</p>

                    <p className="font-bold mt-4 mb-2">Interview Data:</p>
                    <p className="mb-4">Audio and video recordings, auto-generated transcripts, AI scores, assessment reports, and metadata (duration, timestamps, completion status).</p>

                    <p className="font-bold mt-4 mb-2">Proctoring Data:</p>
                    <p className="mb-2">During interviews we monitor:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>Facial recognition (to verify candidate identity)</li>
                        <li>Gaze detection (to detect if they're looking away)</li>
                        <li>Mouse movement patterns</li>
                        <li>Tab switching</li>
                        <li>Camera and microphone status</li>
                    </ul>

                    <p className="font-bold mt-4 mb-2">Usage Data:</p>
                    <p className="mb-4">Feature usage, session data, IP address, browser type, timestamps.</p>

                    <p className="font-bold mt-4 mb-2">Configuration Data:</p>
                    <p className="mb-4">Interview questions, scoring criteria, and workflow settings you create.</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">3. WHY WE COLLECT THIS DATA</h2>
                    <p className="mb-2">To:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>Create and manage your account</li>
                        <li>Process billing and send invoices</li>
                        <li>Conduct interviews and generate assessments</li>
                        <li>Prevent fraud and security threats</li>
                        <li>Improve the platform</li>
                        <li>Comply with legal obligations</li>
                    </ul>

                    <h2 className="text-xl font-bold mt-8 mb-4">4. BIOMETRIC DATA (FACIAL RECOGNITION & GAZE TRACKING)</h2>
                    <p className="mb-4">During interviews, we collect biometric data. Here's what we do and don't do:</p>
                    
                    <p className="font-bold mb-2">What we do:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>Use facial recognition to verify identity</li>
                        <li>Use gaze detection to detect potential cheating</li>
                        <li>Store data temporarily to generate assessment</li>
                    </ul>

                    <p className="font-bold mb-2">What we DON'T do:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>Analyze facial expressions to guess emotions</li>
                        <li>Build facial databases for other purposes</li>
                        <li>Train AI models on biometric data</li>
                        <li>Share biometric data with third parties</li>
                    </ul>

                    <p className="mb-4"><strong>Data Retention:</strong> Biometric data is deleted when the interview recording is deleted (7/14/30 days or custom).</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">5. HOW CANDIDATE DATA IS PROCESSED</h2>
                    <p className="mb-4">When you use SreevaAI to interview candidates:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>You are the data controller</li>
                        <li>SreevaAI is the data processor</li>
                        <li>You are responsible for getting candidate consent</li>
                    </ul>

                    <h2 className="text-xl font-bold mt-8 mb-4">6. LEGAL BASIS FOR DATA PROCESSING</h2>
                    <p className="mb-4">We process data under India's DPDP Act 2023 (Consent, Contractual necessity, Legal obligation), GDPR (Contract, Legitimate interest, Consent), and CCPA (Service delivery).</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">7. WHO HAS ACCESS TO YOUR DATA</h2>
                    <p className="mb-2">We share data with:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>Infrastructure Providers: Secure cloud storage.</li>
                        <li>Payment Processors: Secure billing handling.</li>
                        <li>Legal Authorities: Only if required by law.</li>
                    </ul>
                    <p className="mb-4 font-bold">We do NOT sell data to third parties or share it with advertisers.</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">8. DATA RETENTION</h2>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li><strong>Account Data:</strong> Active account + 3 years.</li>
                        <li><strong>Interview Recordings:</strong> 7/14/30 days or Custom.</li>
                        <li><strong>Biometric Data:</strong> Deleted with recording.</li>
                        <li><strong>Billing Data:</strong> 7 years (Tax requirement).</li>
                    </ul>

                    <h2 className="text-xl font-bold mt-8 mb-4">9. YOUR RIGHTS</h2>
                    <p className="mb-4">You have the right to access, correct, or request deletion of your data. To exercise these rights, email support@sreevaai.com. We respond within 30 days.</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">10. SECURITY</h2>
                    <p className="mb-4">We use industry-standard encryption (AES-256) and secure transit protocols (HTTPS) to protect your data. We notify users within 72 hours of any security breach.</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">11. DATA STORAGE</h2>
                    <p className="mb-4">Your data is stored securely on cloud servers in India. Interview recordings are deleted according to your plan.</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">12. COOKIES</h2>
                    <p className="mb-4">We use only essential cookies to keep you logged in. No advertising cookies.</p>

                    <h2 className="text-xl font-bold mt-8 mb-4">15. CONTACT US</h2>
                    <p className="mb-4">Questions? Email us: support@sreevaai.com</p>

                    <p className="mt-12 font-bold text-center">By using SreevaAI, you agree to this Privacy Policy.</p>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-100 bg-white py-12">
                <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-8 px-6 md:grid-cols-4 lg:grid-cols-6">
                    <div className="col-span-2">
                        <div className="mb-4 flex items-center gap-3 text-xl font-bold text-slate-900">
                            <img src="/Logo.png" alt="Sreeva AI Logo" className="h-10 w-10 object-contain" />
                            <span>Sreeva AI</span>
                        </div>
                        <p className="text-sm text-slate-500">© 2026 Sreeva AI. All rights reserved.</p>
                    </div>

                    {footerGroups.map((group) => (
                        <div key={group.title}>
                            <h5 className="mb-4 text-sm font-bold">{group.title}</h5>
                            <ul className="space-y-2 text-sm text-slate-500">
                                {group.links.map((item) => (
                                    <li key={item}>
                                        <Link 
                                            href={item === "Terms of Service" ? "/terms" : item === "Privacy Policy" ? "/privacy" : "#"} 
                                            className="hover:text-black"
                                        >
                                            {item}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </footer>
        </div>
    );
}
