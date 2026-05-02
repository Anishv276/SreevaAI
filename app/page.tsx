"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Bot,
    Brain,
    Check,
    CheckCircle2,
    ChevronDown,
    CirclePlay,
    XCircle,
    Clock3,
    Code2,
    Download,
    FileText,
    FileUp,
    Globe2,
    Mail,
    Mic,
    FileBarChart,
    Phone,
    Play,
    Repeat2,
    Scale,
    ShieldCheck,
    Sparkles,
    Users,
    Video,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LANDING_PACKAGES as pricingPlans } from "@/lib/landing-packages";

type Session = {
    role?: string;
};

const problemCards = [
    {
        icon: Clock3,
        title: "Unqualified Candidates Advance",
        description: "They pass screening, waste your hiring manager's time in interviews.",
        iconClassName: "bg-red-50 text-red-500 border border-red-100",
    },
    {
        icon: Scale,
        title: "Questions Lack Depth",
        description: "Every interviewer asks different things. No one digs deep enough.",
        iconClassName: "bg-orange-50 text-orange-500 border border-orange-100",
    },
    {
        icon: FileText,
        title: "Resume Skills Don't Stick",
        description: "They claim expertise. Follow-up questions expose they're repeating resume language.",
        iconClassName: "bg-blue-50 text-blue-500 border border-blue-100",
    },
];

const featureCards: Array<{
    icon: LucideIcon;
    title: string;
    description: string;
}> = [
        {
            icon: Code2,
            title: "Resume Intelligence",
            description: "Maps real skill depth from resume, not just keywords.",
        },
        {
            icon: Repeat2,
            title: "Smart Follow-ups",
            description: "Digs deeper when answers are vague or unproven.",
        },
        {
            icon: ShieldCheck,
            title: "Integrity Proctoring",
            description: "Detects cheating and dishonest behavior automatically.",
        },
        {
            icon: FileBarChart,
            title: "Instant AI Report",
            description: "Every interview generates a structured score, evidence, and hire recommendation.",
        },
        {
            icon: Brain,
            title: "Adaptive Questioning",
            description: "Questions change based on what the candidate says. No two interviews are the same.",
        },
        {
            icon: Zap,
            title: "Cheaper Than Alternatives",
            description: "Fraction of the cost of human screeners or traditional interview platforms.",
        },
    ];

const workflowSteps = [
    {
        title: "Upload Your JD",
        description: "SreevaAI reads your job description and understands exactly what the role needs.",
        icon: FileUp,
    },
    {
        title: "AI Builds the Interview",
        description: "Custom questions generated for this specific role. No templates. No scripts.",
        icon: Brain,
    },
    {
        title: "Candidate Gets Interviewed",
        description: "AI adapts in real time based on every answer. Digs deep. Catches inconsistencies.",
        icon: Mic,
        highlighted: true,
    },
    {
        title: "You Get the Decision",
        description: "Structured report with scores, evidence, and a clear hire or reject recommendation.",
        icon: FileBarChart,
    },
];

const reportSkills = [
    ["React & State Management", "Expert", "100%"],
    ["Performance Optimization", "Expert", "90%"],
    ["System Design", "Advanced", "75%"],
    ["Communication", "Excellent", "95%"],
];

const heroMetrics = [
    {
        value: "500+",
        label: "resumes screened per role",
    },
    {
        value: "15-25 min",
        label: "adaptive interview window",
    },
    {
        value: "60 sec",
        label: "structured report turnaround",
    },
];

const featureComparison = [
    { feature: "Drives", starter: "1", pro: "5", scale: "10+", enterprise: "Unlimited" },
    { feature: "AI Voices", starter: "3", pro: "10+", scale: "20+", enterprise: "Unlimited" },
    { feature: "Interview Duration", starter: "20 min", pro: "20 min", scale: "20 min", enterprise: "20 min" },
    { feature: "Ask Sreeva AI", starter: "—", pro: "Yes", scale: "Yes", enterprise: "Yes" },
    { feature: "Adaptive AI Interview", starter: "Yes", pro: "Yes", scale: "Yes", enterprise: "Yes" },
    { feature: "Resume + JD Based Questions", starter: "Yes", pro: "Yes", scale: "Yes", enterprise: "Yes" },
    { feature: "Smart Follow-ups", starter: "Yes", pro: "Yes", scale: "Yes", enterprise: "Yes" },
    { feature: "AI Evaluation Report", starter: "Yes", pro: "Yes", scale: "Yes", enterprise: "Yes" },
    { feature: "Pre-qualifying Questions", starter: "Yes", pro: "Yes", scale: "Yes", enterprise: "Yes" },
    { feature: "AI Proctoring", starter: "—", pro: "Basic", scale: "Advanced", enterprise: "Advanced" },
    { feature: "Multilingual", starter: "—", pro: "Yes", scale: "Yes", enterprise: "Yes" },
    { feature: "Team Members", starter: "1", pro: "3", scale: "10", enterprise: "Custom" },
    { feature: "Custom Branding", starter: "—", pro: "Yes", scale: "Yes", enterprise: "Yes" },
    { feature: "Recording + Playback", starter: "7 days", pro: "14 days", scale: "30 days", enterprise: "Custom" },
    { feature: "Support", starter: "Email", pro: "Priority", scale: "Priority", enterprise: "Dedicated" }
];

const faqs = [
    {
        question: "1. What is SreevaAI?",
        answer: "An AI interviewer that conducts first-round interviews automatically — reads the resume, asks relevant questions, adapts based on answers, and gives you a hiring recommendation.",
    },
    {
        question: "2. Is it really AI or just pre-recorded questions?",
        answer: "It's a live AI conversation. Questions change based on what the candidate says. No scripts, no fixed flow.",
    },
    {
        question: "3. Can I customize the interview for my role?",
        answer: "Yes. Every interview is built from your JD. You can also add specific questions you want asked.",
    },
    {
        question: "4. How does it detect cheating?",
        answer: "It monitors 12+ behavioral signals — not just tab switching. The adaptive follow-ups themselves expose candidates who can't back up their answers.",
    },
    {
        question: "5. Will candidates be comfortable with an AI interview?",
        answer: "Most candidates prefer it. No scheduling pressure, no judgment, interview on their own time.",
    },
    {
        question: "6. Does the AI make the final hiring decision?",
        answer: "No. SreevaAI gives you a structured recommendation. Your team makes the final call.",
    },
    {
        question: "7. How long does setup take?",
        answer: "Under 10 minutes. Upload your JD, invite candidates, done.",
    },
];

const footerGroups = [
    {
        title: "Sections",
        links: [
            { label: "Hero", href: "#hero" },
            { label: "Problems", href: "#problems" },
            { label: "Solutions", href: "#solutions" },
            { label: "Workflow", href: "#workflow" },
            { label: "FAQ", href: "#faq" },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
        ],
    },
];

function SectionHeading({
    title,
    eyebrow,
    description,
}: {
    title: string;
    eyebrow?: string;
    description?: string;
}) {
    return (
        <div className="mx-auto mb-16 max-w-2xl text-center">
            {eyebrow && (
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-fixed px-3 py-1 text-label-sm font-semibold text-on-primary-container">
                    <Sparkles className="h-4 w-4" />
                    {eyebrow}
                </div>
            )}
            <h2 className="font-display text-h2 text-on-background">{title}</h2>
            {description && <p className="mt-4 text-body-lg text-outline">{description}</p>}
        </div>
    );
}

export default function Home() {
    const [session, setSession] = useState<Session | null>(null);
    const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

    useEffect(() => {
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
    const ctaLabel = session ? "Dashboard" : "Book Demo";

    return (
        <div className="min-h-screen overflow-x-hidden bg-surface text-on-surface selection:bg-primary-fixed selection:text-on-primary-container">
            <header className="fixed top-0 left-0 right-0 z-50 h-20 bg-white/80 backdrop-blur-md border-b border-slate-100/50">
                <div className="mx-auto flex h-full max-w-[1320px] items-center justify-between px-6">
                    <Link href="/" className="flex items-center gap-3 font-display text-2xl font-black tracking-tighter text-slate-900">
                        <img src="/Logo.png" alt="Sreeva AI Logo" className="h-14 w-14 object-contain" />
                        <span className="leading-none">Sreeva AI</span>
                    </Link>

                    <nav className="hidden items-center gap-8 text-sm font-medium tracking-tight md:flex">
                        <a className="border-b-2 border-orange-600 pb-1 font-bold text-orange-600" href="#hero">
                            Hero
                        </a>
                        <a className="text-slate-600 transition-colors hover:text-orange-600" href="#problems">
                            Problems
                        </a>
                        <a className="text-slate-600 transition-colors hover:text-orange-600" href="#solutions">
                            Solutions
                        </a>
                        <a className="text-slate-600 transition-colors hover:text-orange-600" href="#workflow">
                            Workflow
                        </a>
                        <a className="text-slate-600 transition-colors hover:text-orange-600" href="#faq">
                            FAQ
                        </a>
                    </nav>

                    <div className="flex items-center gap-3 sm:gap-4">
                        {!session && (
                            <Link
                                href="/login"
                                className="rounded-lg px-4 py-2 font-medium text-slate-600 transition-all hover:bg-orange-50"
                            >
                                Login
                            </Link>
                        )}
                        <Link
                            href={ctaHref}
                            target={!session ? "_blank" : undefined}
                            rel={!session ? "noreferrer" : undefined}
                            className="primary-btn scale-95 px-5 py-2.5 text-sm font-bold active:scale-90 sm:px-6"
                        >
                            {ctaLabel}
                        </Link>
                    </div>
                </div>
            </header>

            <main className="pt-20">
                <section id="hero" className="mx-auto max-w-[1320px] overflow-hidden px-6 pb-24 pt-12 sm:pt-20">
                    <div className="flex flex-col items-center gap-16 lg:flex-row">
                        <div className="space-y-8 lg:w-3/5">
                            <div className="space-y-5">
                                <h1 className="font-display text-h1 leading-tight text-on-background md:text-display">
                                    Hire the <span className="text-primary">top 1%</span> with AI Precision
                                </h1>
                                <div className="space-y-3">
                                    <p className="max-w-lg text-body-lg text-on-surface-variant">
                                        SreevaAI asks the questions your best engineers would ask. Every interview. Every candidate. Catch resume padding in real time. Reduce bad hires before they start.
                                    </p>
                                    <p className="max-w-lg text-lg font-medium text-primary italic border-l-2 border-primary/30 pl-4 py-1">
                                        Know exactly who will succeed in the role. Not in weeks. But with total confidence.
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4 sm:flex-row">
                                <Link href={ctaHref} target={!session ? "_blank" : undefined} rel={!session ? "noreferrer" : undefined} className="primary-btn inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-bold">
                                    {session ? "Open Dashboard" : "See Demo"}
                                    <ArrowRight className="h-5 w-5" />
                                </Link>
                            </div>
                        </div>

                        <div className="relative w-full lg:w-2/5">
                            <div className="bento-card relative z-10 bg-surface-container-lowest p-4 shadow-2xl">
                                <div className="mb-4 flex items-center justify-between rounded-2xl bg-surface p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full bg-red-300" />
                                        <div className="h-3 w-3 rounded-full bg-yellow-300" />
                                        <div className="h-3 w-3 rounded-full bg-green-400" />
                                    </div>
                                    <div className="rounded-full bg-primary-fixed px-3 py-1 text-[11px] font-bold text-primary">
                                        LIVE INTERVIEW CONSOLE
                                    </div>
                                </div>
                                <div className="mb-6 flex items-center justify-between border-b border-surface-variant pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-fixed font-black text-primary">
                                            AR
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-on-background">Ananya Rao</h3>
                                            <p className="text-caption text-on-surface-variant">Frontend Engineer - 18m interview</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-h3 font-black text-primary">
                                            91<span className="text-body-md font-normal text-outline">/100</span>
                                        </div>
                                        <div className="text-caption font-bold text-secondary">HIRING SIGNAL</div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="rounded-xl border border-surface-variant bg-surface p-4">
                                        <div className="mb-2 flex items-center gap-2 text-primary">
                                            <Brain className="h-4 w-4" />
                                            <span className="text-caption font-bold uppercase">Sreeva AI Question</span>
                                        </div>
                                        <p className="text-body-md italic text-on-surface">
                                            &quot;Your resume says you optimized React rendering. Walk me through the
                                            bottleneck, the measurement, and the trade-off you chose.&quot;
                                        </p>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {[
                                            ["React Depth", "94%"],
                                            ["System Reasoning", "87%"],
                                        ].map(([label, value]) => (
                                            <div key={label} className="space-y-2">
                                                <div className="flex justify-between text-caption font-medium">
                                                    <span>{label}</span>
                                                    <span>{value}</span>
                                                </div>
                                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
                                                    <div className="h-full rounded-full bg-primary" style={{ width: value }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid gap-3 rounded-2xl border border-primary-fixed bg-primary-fixed/20 p-4 text-caption sm:grid-cols-3">
                                        <div>
                                            <div className="font-bold text-primary">Follow-up</div>
                                            <div className="text-outline">Triggered by vague metric claim</div>
                                        </div>
                                        <div>
                                            <div className="font-bold text-primary">Evidence</div>
                                            <div className="text-outline">Named profiling method</div>
                                        </div>
                                        <div>
                                            <div className="font-bold text-primary">Risk</div>
                                            <div className="text-outline">No proctoring flags</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bento-card absolute -right-3 -top-6 z-20 hidden items-center gap-3 border-l-4 border-l-green-500 bg-white p-3 shadow-lg sm:flex">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                <span className="text-caption font-bold">Resume matched</span>
                            </div>
                            <div className="bento-card absolute -left-6 top-1/4 z-20 hidden items-center gap-3 border-l-4 border-l-primary bg-white p-3 shadow-lg sm:flex">
                                <Brain className="h-5 w-5 text-primary" />
                                <span className="text-caption font-bold">JD skills detected</span>
                            </div>
                            <div className="bento-card absolute -right-4 bottom-1/4 z-20 hidden items-center gap-3 border-l-4 border-l-blue-500 bg-white p-3 shadow-lg sm:flex">
                                <Mail className="h-5 w-5 text-blue-500" />
                                <span className="text-caption font-bold">Follow-up triggered</span>
                            </div>
                            <div className="bento-card absolute -bottom-4 left-1/4 z-20 hidden items-center gap-3 border-l-4 border-l-orange-500 bg-white p-3 shadow-lg sm:flex">
                                <BarChart3 className="h-5 w-5 text-orange-500" />
                                <span className="text-caption font-bold">Report generated</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="problems" className="bg-surface-container-low py-24">
                    <SectionHeading
                        title="Your hiring process has a credibility problem."
                        description="You can't tell who's genuinely qualified from a resume. Using engineers for every screen is too expensive, while recruiters alone often lack accuracy. The result? Unqualified candidates waste hours in your final interview panels."
                    />
                    <div className="mx-auto grid max-w-[1320px] gap-8 px-6 md:grid-cols-3">
                        {problemCards.map((card, index) => (
                            <motion.div
                                key={card.title}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="bento-card space-y-4 p-8 text-center"
                            >
                                <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${card.iconClassName}`}>
                                    <card.icon className="h-8 w-8" />
                                </div>
                                <h3 className="text-xl font-bold">{card.title}</h3>
                                <p className="text-on-surface-variant">{card.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </section>

                <section id="solutions" className="mx-auto max-w-[1320px] px-6 py-24">
                    <SectionHeading
                        title="Everything you need to calibrate talent"
                        eyebrow="PRODUCT"
                        description="Our platform adapts to every role, ensuring objective and deep technical verification."
                    />
                    <div className="grid auto-rows-[200px] grid-cols-12 gap-6">
                        <div className="bento-card col-span-12 row-span-2 flex flex-col justify-between p-4 lg:col-span-6">
                            <div>
                                <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-caption font-bold text-primary">
                                    CORE ENGINE
                                </span>
                                <h3 className="mb-4 font-display text-h3">Adaptive Interview Engine</h3>
                                <p className="max-w-md text-on-surface-variant">
                                    Sreeva does not follow a script. It follows the candidate. If they are an expert, it
                                    dives deeper. If they struggle, it pivots to find core strengths.
                                </p>
                            </div>
                            <div className="mt-8 rounded-xl border border-surface-variant bg-surface-container p-4">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-green-500" />
                                        <span className="text-caption font-bold">ADAPTIVE PROBE</span>
                                    </div>
                                    <span className="rounded-full bg-primary-fixed px-2 py-1 text-[10px] font-bold text-primary">
                                        AUTO FOLLOW-UP
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-lg bg-white p-3 text-caption text-on-surface-variant">
                                        Candidate claimed a 38% render-time reduction. Sreeva asked for measurement
                                        method, trade-off, and before/after profiling evidence.
                                    </div>
                                    <div className="grid gap-3 text-caption sm:grid-cols-3">
                                        <div className="rounded-lg bg-white p-3">
                                            <div className="font-bold text-primary">Follow-up</div>
                                            <div className="text-outline">Metric claim checked</div>
                                        </div>
                                        <div className="rounded-lg bg-white p-3">
                                            <div className="font-bold text-primary">Evidence</div>
                                            <div className="text-outline">Profiler named</div>
                                        </div>
                                        <div className="rounded-lg bg-white p-3">
                                            <div className="font-bold text-primary">Signal</div>
                                            <div className="text-outline">Senior depth</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bento-card col-span-12 row-span-2 flex flex-col justify-between !bg-primary-container p-4 lg:col-span-6">
                            <div className="text-on-primary">
                                <span className="mb-2 inline-block rounded-full bg-white/20 px-3 py-1 text-caption font-bold text-white">
                                    DATA INSIGHTS
                                </span>
                                <h3 className="mb-2 font-display text-h3">AI Report Preview</h3>
                                <p className="max-w-md opacity-90">
                                    Get a structured breakdown of every skill, proctoring signal, and clear hiring
                                    recommendation in under 60 seconds after the interview ends.
                                </p>
                            </div>
                            <div className="mt-4 overflow-hidden rounded-xl border-t-2 border-white/20 bg-white p-2 shadow-lg">
                                <div className="flex items-center justify-between border-b border-orange-100 pb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-container text-xs font-black text-white">
                                            S
                                        </div>
                                        <div>
                                            <div className="text-xs font-black text-on-surface">Interview Report #8291</div>
                                            <div className="text-[9px] font-medium text-outline">Senior Frontend Engineer</div>
                                        </div>
                                    </div>
                                    <div className="rounded-full bg-green-100 px-2 py-1 text-[9px] font-black uppercase text-green-700">
                                        Strong Hire
                                    </div>
                                </div>

                                <div className="grid gap-2 pt-2 sm:grid-cols-[0.72fr_1.28fr]">
                                    <div className="rounded-xl border border-orange-100 bg-surface p-2 text-center">
                                        <div className="text-3xl font-black leading-none text-primary">94</div>
                                        <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-outline">
                                            Overall Score
                                        </div>
                                        <div className="mt-2 rounded-full bg-green-100 px-2 py-1 text-[9px] font-bold text-green-700">
                                            Ready for panel
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {[
                                            ["React Depth", "Expert", "96%"],
                                            ["System Design", "Advanced", "82%"],
                                            ["Communication", "Clear", "91%"],
                                        ].map(([skill, label, width]) => (
                                            <div key={skill}>
                                                <div className="mb-0.5 flex justify-between text-[9px] font-bold text-on-surface">
                                                    <span>{skill}</span>
                                                    <span className="text-primary">{label}</span>
                                                </div>
                                                <div className="h-1 overflow-hidden rounded-full bg-orange-100">
                                                    <div className="h-full rounded-full bg-primary-container" style={{ width }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-2 grid gap-1.5 text-[9px] font-semibold text-on-surface-variant sm:grid-cols-3">
                                    <div className="rounded-md bg-green-50 px-2 py-1.5 text-green-700">Identity verified</div>
                                    <div className="rounded-md bg-green-50 px-2 py-1.5 text-green-700">No tab switches</div>
                                    <div className="rounded-md bg-orange-50 px-2 py-1.5 text-primary">3 evidence follow-ups</div>
                                </div>
                            </div>
                        </div>

                        {featureCards.map((feature, index) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="bento-card col-span-12 flex flex-col gap-2 p-6 md:col-span-4"
                            >
                                <feature.icon className="h-6 w-6 text-primary" />
                                <h4 className="font-bold">{feature.title}</h4>
                                <p className="text-caption text-on-surface-variant">{feature.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </section>

                <section id="workflow" className="bg-surface py-24">
                    <div className="mx-auto max-w-[1320px] px-6">
                        <SectionHeading
                            title="How SreevaAI Works"
                            eyebrow="PROCESS"
                            description="Four steps from job description to hiring decision."
                        />
                        <div className="relative flex flex-col items-center gap-8 md:flex-row md:gap-4">
                            {workflowSteps.map((step, index) => (
                                <motion.div
                                    key={step.title}
                                    initial={{ opacity: 0, y: 50 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-100px" }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    className="relative z-10 flex-1 space-y-4 text-center"
                                >
                                    <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border shadow-md transition-all duration-300 ${step.highlighted ? "bg-[#ff6a00] border-[#ff6a00] text-white shadow-lg shadow-[#ff6a00]/30" : "bg-white border-orange-100 text-orange-600 shadow-sm"}`}>
                                        <step.icon className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-bold text-lg">{step.title}</h3>
                                    <p className="text-caption text-on-surface-variant max-w-[250px] mx-auto">{step.description}</p>
                                    {index < workflowSteps.length - 1 && (
                                        <div className="absolute left-[calc(50%+32px)] top-8 hidden h-0.5 w-[calc(100%-64px)] bg-orange-100 md:block" />
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-[1320px] px-6 py-24">
                    <SectionHeading
                        title="Intelligent screening that gets smarter with every answer."
                        eyebrow="COMPARISON"
                        description="Sreeva AI doesn't just automate screening—it improves the quality of hiring signals."
                    />

                    <div className="mx-auto max-w-[1200px]">
                        <div className="bento-card overflow-hidden bg-white shadow-xl">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Aspect</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Traditional Screening</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-orange-600">Sreeva AI</th>
                                        </tr>
                                    </thead>
                                      <tbody className="divide-y divide-slate-100">
                                          {[
                                              { label: "Interview Style", traditional: "Same questions for every candidate", sreeva: "Adapts in real time based on every answer" },
                                              { label: "Skill Verification", traditional: "You trust what they say", sreeva: "You see what they actually know" },
                                              { label: "Candidate Fraud", traditional: "Anyone can show up and answer for them", sreeva: "Identity, behavior, and response patterns all verified" },
                                              { label: "Interviewer Bias", traditional: "Depends on who shows up that day", sreeva: "Consistent evaluation every single time" },
                                              { label: "Report Quality", traditional: "Gut feel notes after the call", sreeva: "Structured score with evidence and clear recommendation" },
                                              { label: "Cost", traditional: "Expensive human screeners per interview", sreeva: "Fraction of the cost, no human bottleneck" }
                                          ].map((row, i) => (
                                              <tr key={i} className="group transition-colors hover:bg-slate-50/30">
                                                  <td className="px-6 py-4 text-sm font-bold text-slate-900 whitespace-nowrap">{row.label}</td>
                                                <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">{row.traditional}</td>
                                                <td className="px-6 py-4 text-sm font-medium text-slate-900 bg-orange-50/30 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle2 className="h-4 w-4 text-orange-600 shrink-0" />
                                                        {row.sreeva}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </section>


                <section id="pricing" className="mx-auto max-w-[1320px] px-6 py-24">
                    <SectionHeading
                        title="Plans for every hiring stage"
                        description="Start with one role, then scale adaptive interviews across teams once signal quality is proven."
                    />
                    <div className="grid gap-6 md:grid-cols-4 items-stretch">
                        {pricingPlans.map((plan, index) => (
                            <motion.div
                                key={plan.name}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className={`bento-card relative flex flex-col justify-between p-8 pt-12 ${plan.featured ? "z-10 border-orange-500 shadow-xl ring-4 ring-orange-500/10" : ""}`}
                            >
                                {plan.featured && (
                                    <div className="absolute top-4 left-8 text-caption font-bold uppercase text-orange-500">MOST POPULAR</div>
                                )}
                                <h3 className="mb-2 text-xl font-bold">{plan.name}</h3>
                                <div className="mb-4 text-h3 font-black">
                                    {plan.price}
                                    <span className="text-caption font-normal text-outline">{plan.suffix}</span>
                                </div>
                                <ul className="mb-8 flex-1 space-y-3 text-sm text-on-surface-variant">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex gap-2">
                                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href={session ? dashboardHref : "#contact"}
                                    className={`${plan.featured ? "primary-btn" : "secondary-btn"} w-full py-3 text-center font-bold`}
                                >
                                    {plan.cta}
                                </Link>
                            </motion.div>
                        ))}
                    </div>

                    <div className="mt-20 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
                        <div className="bg-slate-50 px-6 py-4 font-bold text-slate-800">⚙️ Detailed Feature Comparison</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/50">
                                        <th className="p-4 font-bold text-sm text-slate-600">Feature</th>
                                        <th className="p-4 font-bold text-sm text-slate-600 text-center">Starter</th>
                                        <th className="p-4 font-bold text-sm text-slate-600 text-center bg-orange-50/20 text-orange-600">Growth</th>
                                        <th className="p-4 font-bold text-sm text-slate-600 text-center">Scale</th>
                                        <th className="p-4 font-bold text-sm text-slate-600 text-center">Business</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {featureComparison.map((row, index) => (
                                        <tr key={row.feature} className={`border-b border-slate-50 hover:bg-slate-50/30 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-slate-50/10"}`}>
                                            <td className="p-4 text-sm font-semibold text-slate-800">{row.feature}</td>
                                            <td className="p-4 text-sm text-center text-slate-600">{row.starter === "Yes" ? <Check className="mx-auto h-4 w-4 text-primary" /> : row.starter}</td>
                                            <td className="p-4 text-sm text-center font-bold text-orange-600 bg-orange-50/10">{row.pro === "Yes" ? <Check className="mx-auto h-4 w-4 text-orange-600" /> : row.pro}</td>
                                            <td className="p-4 text-sm text-center text-slate-600">{row.scale === "Yes" ? <Check className="mx-auto h-4 w-4 text-primary" /> : row.scale}</td>
                                            <td className="p-4 text-sm text-center text-slate-600">{row.enterprise === "Yes" ? <Check className="mx-auto h-4 w-4 text-primary" /> : row.enterprise}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <section id="faq" className="bg-surface-container-low py-24">
                    <div className="mx-auto max-w-[1320px] px-6">
                        <SectionHeading
                            title="Frequently Asked Questions"
                            eyebrow="FAQ"
                            description="Got questions? We've got answers."
                        />
                        <div className="mx-auto max-w-3xl space-y-4">
                            {faqs.map((faq, index) => {
                                const isOpen = openFaqIndex === index;
                                return (
                                    <motion.div
                                        key={faq.question}
                                        initial={{ opacity: 0, y: 30 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: "-100px" }}
                                        transition={{ duration: 0.5, delay: index * 0.1 }}
                                        className="bento-card p-6 cursor-pointer select-none"
                                        onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                                    >
                                        <h4 className="flex items-center justify-between font-bold text-base">
                                            {faq.question}
                                            <ChevronDown className={`h-5 w-5 text-outline transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                                        </h4>
                                        <AnimatePresence initial={false}>
                                            {isOpen && (
                                                <motion.div
                                                    initial="collapsed"
                                                    animate="open"
                                                    exit="collapsed"
                                                    variants={{
                                                        open: { opacity: 1, height: "auto", marginTop: 12 },
                                                        collapsed: { opacity: 0, height: 0, marginTop: 0 }
                                                    }}
                                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                                    className="overflow-hidden text-sm text-on-surface-variant leading-relaxed"
                                                >
                                                    {faq.answer}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section id="contact" className="relative py-24 overflow-hidden bg-slate-50/50">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-[1320px] pointer-events-none">
                        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/5 blur-[120px] rounded-full" />
                        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 blur-[120px] rounded-full" />
                    </div>

                    <div className="relative z-10 mx-auto max-w-[1320px] px-6">
                        <div className="text-center mb-16">
                            <SectionHeading
                                title="Experience the future of hiring"
                                eyebrow="LIVE DEMO"
                                description="Schedule a 30-minute walkthrough to see how Sreeva AI can transform your recruitment pipeline."
                            />
                        </div>

                        <div className="mx-auto max-w-[1000px] bg-white rounded-[32px] border border-slate-200/60 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] overflow-hidden min-h-[700px]">
                            <iframe
                                src="https://cal.com/vamsivk/30min?embed=true"
                                className="w-full min-h-[700px] border-0"
                                title="Book a meeting with Sreeva AI"
                            />
                        </div>
                    </div>
                </section>
            </main>

            <footer id="footer" className="w-full border-t border-slate-100 bg-white py-12">
                <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-8 px-6 md:grid-cols-4 lg:grid-cols-6">
                    <div className="col-span-2">
                        <div className="mb-4 flex items-center gap-3 text-xl font-bold text-slate-900">
                            <img src="/Logo.png" alt="Sreeva AI Logo" className="h-12 w-12 object-contain" />
                            <span className="leading-none">Sreeva AI</span>
                        </div>
                        <p className="mb-6 max-w-xs text-sm text-slate-500">
                            Adaptive AI that interviews smarter than a script.
                        </p>
                        <div className="flex gap-4">
                            <a className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:text-primary" href="#">
                                <Globe2 className="h-4 w-4" />
                            </a>
                            <a className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:text-primary" href="mailto:support@sreevaai.com">
                                <Mail className="h-4 w-4" />
                            </a>
                        </div>
                    </div>

                    {footerGroups.map((group) => (
                        <div key={group.title}>
                            <h5 className="mb-4 text-sm font-bold">{group.title}</h5>
                            <ul className="space-y-2 text-sm text-slate-500">
                                {group.links.map((item) => (
                                    <li key={item.label}>
                                        <Link
                                            className="underline-offset-4 hover:text-orange-600 hover:underline"
                                            href={item.href}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="mx-auto mt-12 max-w-[1320px] border-t border-slate-100 px-6 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-slate-500">© 2026 Sreeva AI. All rights reserved.</p>
                    <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 text-sm text-slate-500">
                        <a href="mailto:support@sreevai.com" className="flex items-center gap-2 hover:text-orange-600 transition-colors">
                            <Mail className="h-4 w-4" />
                            support@sreevai.com
                        </a>
                        <a href="tel:+918919053970" className="flex items-center gap-2 hover:text-orange-600 transition-colors">
                            <Phone className="h-4 w-4" />
                            +918919053970
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
