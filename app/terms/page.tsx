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
export default function TermsOfUse() {
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
    const workspaceHref = session?.role === "SUPER_ADMIN" ? "/super-admin" : "/admin";
    return (
        <div className="min-h-screen bg-white text-slate-900">
            {/* Header */}
            <header className="h-20 border-b border-slate-100">
                <div className="mx-auto flex h-full max-w-[1320px] items-center justify-between px-6">
                    <Link href="/" className="flex items-center gap-3 font-display text-2xl font-black text-slate-900">
                        <img src="/sreevalogo.png" alt="Sreeva AI Logo" className="h-10 w-10 object-contain" />
                        <span>Sreeva AI</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link
                            href={session ? workspaceHref : "/login"}
                            className="bg-black px-6 py-2 rounded font-bold text-white"
                        >
                            {session ? "Open Workspace" : "Login"}
                        </Link>
                    </div>
                </div>
            </header>
            <main className="py-16">
                <div className="mx-auto max-w-[800px] px-6 text-slate-800">
                    <Link href="/#footer" className="inline-block mb-8 text-sm font-bold hover:underline">
                        ← Back to Home
                    </Link>
                    <h1 className="text-3xl font-bold mb-2">TERMS OF USE</h1>
                    <p className="mb-8 text-slate-500">Last Updated: April 26, 2026</p>
                    <p className="mb-8">These Terms of Use govern your access to and use of the SreevaAI platform and services. By creating an account or using the platform, you agree to these Terms in full.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">1. ELIGIBILITY</h2>
                    <p className="mb-4">You must be at least 18 years old and have the legal authority to enter into these Terms on behalf of yourself or your organization.</p>
                    <p className="mb-4">You are responsible for maintaining the confidentiality of your account credentials. We recommend using a strong password (12+ characters with numbers and symbols) and enabling two-factor authentication if available. All activity under your account is your responsibility. Notify support@sreevaai.com immediately if you suspect unauthorized access.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">2. WHAT WE PROVIDE</h2>
                    <p className="mb-4">SreevaAI is an AI-powered interview platform that helps you conduct automated first-round interviews with candidates. The platform includes:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>Resume and job description analysis</li>
                        <li>AI-powered video interviews with adaptive follow-up questions</li>
                        <li>Behavioral and integrity assessment reports</li>
                        <li>Interview recordings and transcripts</li>
                        <li>Proctoring and authenticity verification</li>
                    </ul>
                    <h2 className="text-xl font-bold mt-8 mb-4">3. AI INTERVIEWS - HOW IT WORKS</h2>
                    <p className="font-bold mb-2">Before Each Interview:</p>
                    <p className="mb-4 italic">Candidates must be informed that the interview will be conducted by AI. You must display this message before the interview starts: "This interview will be conducted by an AI system. Your responses will be analyzed by AI. You will receive a score. You can request a human to review your score if you disagree."</p>
                    <p className="mb-4">Candidates must click "I Agree" to proceed. No interview happens without their explicit consent.</p>
                    <p className="font-bold mb-2">The Interview:</p>
                    <p className="mb-4">The AI asks questions based on the job description and candidate resume. It listens to responses, detects follow-up opportunities, and generates a score based on competency, communication, and authenticity.</p>
                    <p className="font-bold mb-2">After the Interview:</p>
                    <p className="mb-4">Candidates receive their score and a summary of how their interview was evaluated. They can request human review by emailing support@sreevaai.com within 7 days. You must honor such requests and reconsider the assessment.</p>
                    <p className="mb-4 font-bold">Important: AI recommendations are suggestions only. Final hiring decisions are your responsibility. Always independently verify AI assessments before rejecting any candidate.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">4. BILLING</h2>
                    <p className="font-bold mb-2">Billing Process:</p>
                    <p className="mb-4">We charge your card on the 1st of each month for your monthly plan. Topups are charged when they occur. You'll receive an invoice after each charge.</p>
                    <p className="font-bold mb-2">Refunds:</p>
                    <p className="mb-4">Refunds are available within 7 days of purchase if you have not conducted any interviews, or if there was a platform error that prevented interviews from working. Contact support@sreevaai.com to request a refund with your account ID and invoice date. We'll respond within 5 business days.</p>
                    <p className="mb-4">Pricing may change with 30 days written notice. Continued use after a price change takes effect means you accept the new rates.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">5. YOUR RESPONSIBILITIES</h2>
                    <p className="mb-4">You must ensure all use of the platform complies with applicable law in your jurisdiction. This includes:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>Obtaining explicit consent from candidates before conducting interviews</li>
                        <li>Complying with employment and anti-discrimination laws (you cannot ask about age, caste, religion, disability, marital status, or sexual orientation)</li>
                        <li>Following data protection laws (India's DPDP Act 2023, GDPR if in EU, CCPA if in California)</li>
                        <li>Honoring candidate opt-out and withdrawal requests</li>
                        <li>Complying with employment laws where you hire</li>
                    </ul>
                    <p className="font-bold mb-2">You must not:</p>
                    <ul className="list-disc pl-6 mb-4 space-y-1">
                        <li>Discriminate based on protected characteristics</li>
                        <li>Misuse candidate data</li>
                        <li>Reverse engineer or attempt to access the platform's source code</li>
                        <li>Resell or sublicense access without written permission</li>
                        <li>Circumvent rate limits or billing</li>
                        <li>Use the platform in any way that violates third-party rights</li>
                    </ul>
                    <p className="mb-4">If we discover non-compliance, we may suspend your account without prior notice.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">6. INTELLECTUAL PROPERTY</h2>
                    <p className="mb-4">All intellectual property in the platform (software, algorithms, interfaces, documentation) is owned by SreevaAI. These Terms grant you a limited, non-exclusive, revocable license to use the platform as described. You don't own the platform.</p>
                    <p className="mb-4">You retain ownership of content you create (interview questions, candidate information, hiring decisions). By using the platform, you grant SreevaAI a limited license to process this content solely to provide the service.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">7. DATA AND PRIVACY</h2>
                    <p className="mb-4">Your use of the platform is governed by our Privacy Policy. When we process candidate data on your behalf, you are the data controller and we are the data processor. You are responsible for having a lawful basis for processing and obtaining all required consents.</p>
                    <p className="mb-4">EU customers: A Data Processing Agreement is automatically provided. Email support@sreevaai.com to request it.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">8. SERVICE AVAILABILITY</h2>
                    <p className="mb-4">We aim for high availability but don't guarantee uninterrupted service. We're not liable for downtime caused by events outside our control (infrastructure failures, force majeure, scheduled maintenance).</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">9. DISCLAIMERS</h2>
                    <p className="mb-4">The platform is provided "as is" and "as available." We make no warranty about fitness for a specific purpose or that it will meet your business needs. AI assessments are not professional advice and should not be the sole basis for hiring decisions.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">10. LIABILITY</h2>
                    <p className="mb-4">To the maximum extent permitted by law:</p>
                    <p className="mb-4">We are not liable for indirect, consequential, or punitive damages (lost profits, lost data, reputational harm, etc.).</p>
                    <p className="mb-4">Our total liability for direct damages will not exceed the amount you paid in the 3 months before your claim. This limit does NOT apply to: Data breaches, violation of employment law, or gross negligence.</p>
                    <p className="mb-4 font-bold">You agree to use AI assessments as recommendations only. We're not liable for hiring outcomes based on AI scores.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">11. INDEMNIFICATION</h2>
                    <p className="mb-4">You agree to protect us against claims arising from: Your use of the platform in violation of law, discriminatory hiring practices, or violation of candidate privacy rights.</p>
                    <p className="mb-4">We agree to protect you against claims arising from: Our platform bugs or security vulnerabilities, or our unauthorized use of your data.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">12. TERMINATION</h2>
                    <p className="mb-4">Either party may terminate access at any time. We may suspend your account immediately if you breach these Terms or engage in prohibited activities.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">13. CHANGES TO THESE TERMS</h2>
                    <p className="mb-4">We may update these Terms. Material changes will be communicated by email at least 30 days before taking effect. Continued use means you accept the updated Terms.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">14. DISPUTE RESOLUTION</h2>
                    <p className="mb-4">These Terms are governed by the laws of India. Any disputes will be resolved through good faith negotiation.</p>
                    <h2 className="text-xl font-bold mt-8 mb-4">15. CONTACT</h2>
                    <p className="mb-4">Questions? Email us at: support@sreevaai.com</p>
                    <p className="mt-12 font-bold text-center">By using SreevaAI, you agree to these Terms.</p>
                </div>
            </main>
            {/* Footer */}
            <footer className="border-t border-slate-100 bg-white py-12">
                <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-8 px-6 md:grid-cols-4 lg:grid-cols-6">
                    <div className="col-span-2">
                        <div className="mb-4 flex items-center gap-3 text-xl font-bold text-slate-900">
                            <img src="/sreevalogo.png" alt="Sreeva AI Logo" className="h-10 w-10 object-contain" />
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
