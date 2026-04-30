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

type Session = {
    role?: string;
};

const problemCards = [
    {
        icon: Clock3,
        title: "Extremely Slow",
        description: "Weeks spent on initial phone screens that could have been avoided with better data.",
        iconClassName: "bg-red-50 text-red-500 border border-red-100",
    },
    {
        icon: Scale,
        title: "Highly Inconsistent",
        description: "Subjective interviewing leads to biased hiring and poor diversity outcomes.",
        iconClassName: "bg-orange-50 text-orange-500 border border-orange-100",
    },
    {
        icon: FileText,
        title: "Resume Deception",
        description: "Keywords on paper do not always translate to actual skills during the job.",
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
        description: "Extracts hidden nuances, not just keywords, to map potential.",
    },
    {
        icon: Repeat2,
        title: "Smart Follow-ups",
        description: "AI probes reasoning depth like a senior hiring lead.",
    },
    {
        icon: ShieldCheck,
        title: "Proctoring",
        description: "Anti-cheating signals and tab-switching alerts keep interviews honest.",
    },
    {
        icon: Video,
        title: "Video Analysis",
        description: "Analyze non-verbal cues and communication clarity scores.",
    },
    {
        icon: Bot,
        title: "Skill Proof",
        description: "Live coding environments embedded directly in the interview.",
    },
    {
        icon: Users,
        title: "Team Review",
        description: "Share snippets of the interview with hiring managers instantly.",
    },
];

const workflowSteps = [
    {
        title: "JD Upload",
        description: "Simply upload your job description. AI learns the requirements instantly.",
        icon: FileUp,
    },
    {
        title: "AI Plan",
        description: "Sreeva generates a custom, multi-stage adaptive interview plan.",
        icon: Brain,
    },
    {
        title: "Adaptive Interview",
        description: "Candidates interview anytime. AI adapts to their live responses.",
        icon: Mic,
        highlighted: true,
    },
    {
        title: "Decision Report",
        description: "Get a stack-ranked list of top candidates with deep analysis.",
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

const pricingPlans = [
    {
        name: "Starter",
        price: "$99",
        suffix: "/mo",
        features: ["30 interviews included", "Price per interview: $3.30", "Topup: $4.5/interview"],
        cta: "Book Demo",
        featured: false,
    },
    {
        name: "Professional",
        price: "$299",
        suffix: "/mo",
        features: ["100 interviews included", "Price per interview: $2.99", "Topup: $3.5/interview"],
        cta: "Book Demo",
        featured: true,
    },
    {
        name: "Agency",
        price: "$699",
        suffix: "/mo",
        features: ["300 interviews included", "Price per interview: $2.33", "Topup: $2.8/interview"],
        cta: "Book Demo",
        featured: false,
    },
    {
        name: "Business",
        price: "Custom",
        suffix: "",
        features: ["600+ interviews", "Price per interview: Custom", "Topup: Included (no extra charges)"],
        cta: "Talk to Us",
        featured: false,
    },
];

const featureComparison = [
    { feature: "Drives", starter: "1", growth: "5", scale: "10+", business: "Unlimited" },
    { feature: "AI Voices", starter: "3", growth: "10+", scale: "20+", business: "Unlimited" },
    { feature: "Adaptive AI Interview", starter: "Yes", growth: "Yes", scale: "Yes", business: "Yes" },
    { feature: "Resume + JD Based Questions", starter: "Yes", growth: "Yes", scale: "Yes", business: "Yes" },
    { feature: "Smart Follow-ups", starter: "Yes", growth: "Yes", scale: "Yes", business: "Yes" },
    { feature: "AI Evaluation Report", starter: "Yes", growth: "Yes", scale: "Yes", business: "Yes" },
    { feature: "Recording + Playback", starter: "7 days", growth: "14 days", scale: "30 days", business: "Custom" },
    { feature: "Multilingual", starter: "—", growth: "Yes", scale: "Yes", business: "Yes" },
    { feature: "Pre-qualifying Questions", starter: "Yes", growth: "Yes", scale: "Yes", business: "Yes" },
    { feature: "AI Proctoring", starter: "—", growth: "Basic", scale: "Advanced", business: "Advanced" },
    { feature: "Team Members", starter: "1", growth: "3", scale: "10", business: "Custom" },
    { feature: "Custom Branding", starter: "—", growth: "Yes", scale: "Yes", business: "Yes" },
    { feature: "Support", starter: "Email", growth: "Priority", scale: "Priority", business: "Dedicated" }
];

const faqs = [
    {
        question: "Is the AI biased?",
        answer: "No. Sreeva uses objective skill-mapping protocols that ignore demographic data and focus on technical and behavioral competency.",
    },
    {
        question: "Can it detect ChatGPT use?",
        answer: "Yes. Sreeva detects tab-switching, copy-pasting, and unnatural response patterns typical of AI assistance.",
    },
    {
        question: "How long are the interviews?",
        answer: "On average, Sreeva interviews last 15-25 minutes, tailored dynamically based on the candidate's speed and depth.",
    },
    {
        question: "Does it integrate with my ATS?",
        answer: "Yes. Sreeva supports Greenhouse, Lever, Workday, and other major recruiting platforms.",
    },
];

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
                        <a className="border-b-2 border-orange-600 pb-1 font-bold text-orange-600" href="#product">
                            Product
                        </a>
                        <a className="text-slate-600 transition-colors hover:text-orange-600" href="#solutions">
                            Solutions
                        </a>
                        <a className="text-slate-600 transition-colors hover:text-orange-600" href="#pricing">
                            Pricing
                        </a>
                        <a className="text-slate-600 transition-colors hover:text-orange-600" href="#resources">
                            Resources
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
                <section className="mx-auto max-w-[1320px] overflow-hidden px-6 pb-24 pt-12 sm:pt-20">
                    <div className="flex flex-col items-center gap-16 lg:flex-row">
                        <div className="space-y-8 lg:w-1/2">
                            <div className="inline-flex items-center gap-2 rounded-full bg-primary-fixed px-3 py-1 text-label-sm font-medium text-on-primary-container">
                                <Sparkles className="h-4 w-4" />
                                Introducing v2.4 Adaptive Assessment
                            </div>
                            <div className="space-y-5">
                                <h1 className="font-display text-h1 leading-tight text-on-background md:text-display">
                                    Adaptive AI interviews that <span className="text-primary">screen for you</span>
                                </h1>
                                <p className="max-w-lg text-body-lg text-on-surface-variant">
                                    Skip the manual first round. Sreeva conducts autonomous technical checks so your team only interviews top talent.
                                </p>
                            </div>
                            <div className="flex flex-col gap-4 sm:flex-row">
                                <Link href={ctaHref} target={!session ? "_blank" : undefined} rel={!session ? "noreferrer" : undefined} className="primary-btn inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-bold">
                                    {session ? "Open Dashboard" : "Book Demo"}
                                    <ArrowRight className="h-5 w-5" />
                                </Link>
                                <a href="#contact" className="secondary-btn inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-bold text-on-surface">
                                    <CirclePlay className="h-5 w-5" />
                                    View Calendar
                                </a>
                            </div>
                            <div className="grid max-w-xl grid-cols-3 overflow-hidden rounded-3xl border border-outline-variant bg-white shadow-[0_16px_40px_rgba(232,93,4,0.06)]">
                                {heroMetrics.map((metric) => (
                                    <div key={metric.label} className="border-r border-outline-variant p-4 last:border-r-0">
                                        <div className="font-display text-xl font-black text-primary">{metric.value}</div>
                                        <div className="mt-1 text-[11px] font-semibold leading-snug text-outline">
                                            {metric.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col gap-4 pt-8">
                                <p className="text-caption font-bold uppercase tracking-widest text-outline">
                                    Trusted by hiring teams replacing first-round screens
                                </p>
                                <div className="flex flex-wrap gap-4 opacity-45 grayscale sm:gap-6">
                                    {["SaaS teams", "Agencies", "Campus hiring", "Engineering orgs"].map((segment) => (
                                        <div key={segment} className="rounded-lg bg-on-background/10 px-5 py-2 text-sm font-black text-on-background">
                                            {segment}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="relative w-full lg:w-1/2">
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

                <section id="solutions" className="bg-surface-container-low py-24">
                    <SectionHeading
                        title="First-round screening burns too much senior time."
                        description="Recruiters chase resumes. Engineers repeat basic checks. Candidates still reach interviews without proof."
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

                <section id="product" className="mx-auto max-w-[1320px] px-6 py-24">
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

                <section className="bg-surface py-24">
                    <div className="mx-auto max-w-[1320px] px-6">
                        <SectionHeading
                            title="The Intelligent Workflow"
                            eyebrow="PROCESS"
                            description="How we streamline your talent assessment from start to finish."
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
                        title="Upgrade from messy manual checks"
                        eyebrow="COMPARISON"
                        description="Traditional screening is subjective and slow. Sreeva AI is objective, fast, and highly predictive."
                    />
                    <div className="grid gap-8 md:grid-cols-2">
                        <div className="bento-card border-slate-200 bg-slate-50 p-10 flex flex-col justify-between">
                            <div>
                                <h3 className="mb-8 flex items-center gap-3 font-display text-2xl font-bold text-slate-800">
                                    <AlertTriangle className="h-6 w-6 text-slate-400" />
                                    Manual Screening
                                </h3>
                                <ul className="space-y-6">
                                    <li className="flex gap-4">
                                        <XCircle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold text-slate-800">4-7 Days Wait Time</div>
                                            <p className="text-sm text-slate-500 mt-1">Schedules stretch over weeks, creating costly engineering bottlenecks.</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-4">
                                        <XCircle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold text-slate-800">Subjective Note-Taking</div>
                                            <p className="text-sm text-slate-500 mt-1">Interviews rely on gut feeling and inconsistent manual notes.</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-4">
                                        <XCircle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold text-slate-800">High Fraud Potential</div>
                                            <p className="text-sm text-slate-500 mt-1">Impossible to properly verify identity or screen for background aids.</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                            <div className="mt-8 flex items-center justify-between rounded-xl bg-red-50/50 border border-red-100 px-4 py-3 text-caption font-bold text-red-700">
                                <span>TIME TO DECISION</span>
                                <span>4-7 DAYS</span>
                            </div>
                        </div>

                        <div className="rounded-3xl bg-neutral-950 p-10 text-white border border-neutral-800/50 shadow-2xl relative overflow-hidden flex flex-col justify-between">
                            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-600/10 blur-3xl pointer-events-none" />
                            
                            <div className="relative z-10">
                                <h3 className="mb-8 flex items-center gap-3 font-display text-2xl font-bold text-orange-500">
                                    <Zap className="h-6 w-6 fill-orange-500/10" />
                                    Sreeva AI
                                </h3>
                                <ul className="space-y-6">
                                    <li className="flex gap-4">
                                        <CheckCircle2 className="h-6 w-6 text-orange-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold text-neutral-100">15 Minutes Flat</div>
                                            <p className="text-sm text-neutral-400 mt-1">Assessments run autonomously on-demand, generating instant shortlists.</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-4">
                                        <CheckCircle2 className="h-6 w-6 text-orange-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold text-neutral-100">92% Predictive Accuracy</div>
                                            <p className="text-sm text-neutral-400 mt-1">Standardized metrics and dynamic skill indexing grade with zero bias.</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-4">
                                        <CheckCircle2 className="h-6 w-6 text-orange-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold text-neutral-100">Deep Proctoring</div>
                                            <p className="text-sm text-neutral-400 mt-1">Tab tracking, gaze detection, and live proctor logs guard test validity.</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                            <div className="relative z-10 mt-8 flex items-center justify-between rounded-xl bg-orange-600/10 border border-orange-500/20 px-4 py-3 text-caption font-bold text-orange-400">
                                <span>TIME TO DECISION</span>
                                <span>15 MINUTES</span>
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
                                        <th className="p-4 font-bold text-sm text-slate-600 text-center bg-orange-50/20 text-orange-600">Professional</th>
                                        <th className="p-4 font-bold text-sm text-slate-600 text-center">Agency</th>
                                        <th className="p-4 font-bold text-sm text-slate-600 text-center">Business</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {featureComparison.map((row, index) => (
                                        <tr key={row.feature} className={`border-b border-slate-50 hover:bg-slate-50/30 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-slate-50/10"}`}>
                                            <td className="p-4 text-sm font-semibold text-slate-800">{row.feature}</td>
                                            <td className="p-4 text-sm text-center text-slate-600">{row.starter === "Yes" ? <Check className="mx-auto h-4 w-4 text-primary" /> : row.starter}</td>
                                            <td className="p-4 text-sm text-center font-bold text-orange-600 bg-orange-50/10">{row.growth === "Yes" ? <Check className="mx-auto h-4 w-4 text-orange-600" /> : row.growth}</td>
                                            <td className="p-4 text-sm text-center text-slate-600">{row.scale === "Yes" ? <Check className="mx-auto h-4 w-4 text-primary" /> : row.scale}</td>
                                            <td className="p-4 text-sm text-center text-slate-600">{row.business === "Yes" ? <Check className="mx-auto h-4 w-4 text-primary" /> : row.business}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <section id="resources" className="bg-surface-container-low py-24">
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

                <section id="contact" className="mx-auto max-w-[850px] px-6 py-24">
                    <SectionHeading
                        title="Ready to stop wasting interview time?"
                        eyebrow="GET STARTED"
                        description="Share one open role. We will show how Sreeva screens candidates before your team joins the process."
                    />
                    <div className="bento-card overflow-hidden border-primary-fixed shadow-xl h-[650px] mt-12">
                        <iframe
                            src="https://cal.com/vamsivk/30min"
                            className="w-full h-full border-0"
                            title="Book a meeting with Sreeva AI"
                        />
                    </div>
                </section>
            </main>

            <footer className="w-full border-t border-slate-100 bg-white py-12">
                <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-8 px-6 md:grid-cols-4 lg:grid-cols-6">
                    <div className="col-span-2">
                        <div className="mb-4 flex items-center gap-3 text-xl font-bold text-slate-900">
                            <img src="/Logo.png" alt="Sreeva AI Logo" className="h-12 w-12 object-contain" />
                            <span className="leading-none">Sreeva AI</span>
                        </div>
                        <p className="mb-6 max-w-xs text-sm text-slate-500">
                            Building the future of talent assessment through adaptive artificial intelligence.
                        </p>
                        <div className="flex gap-4">
                            <a className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:text-primary" href="#">
                                <Globe2 className="h-4 w-4" />
                            </a>
                            <a className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:text-primary" href="#">
                                <Mail className="h-4 w-4" />
                            </a>
                        </div>
                    </div>

                    {footerGroups.map((group) => (
                        <div key={group.title}>
                            <h5 className="mb-4 text-sm font-bold">{group.title}</h5>
                            <ul className="space-y-2 text-sm text-slate-500">
                                {group.links.map((item) => (
                                    <li key={item}>
                                        <a className="underline-offset-4 hover:text-orange-600 hover:underline" href="#">
                                            {item}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="mx-auto mt-12 max-w-[1320px] border-t border-slate-100 px-6 pt-8">
                    <p className="text-sm text-slate-500">© 2026 Sreeva AI. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
