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
    Clock3,
    Code2,
    Download,
    FileText,
    Globe2,
    Mail,
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

type Session = {
    role?: string;
};

const problemCards = [
    {
        icon: Clock3,
        title: "Extremely Slow",
        description: "Weeks spent on initial phone screens that could have been avoided with better data.",
        iconClassName: "bg-red-50 text-red-500",
    },
    {
        icon: Scale,
        title: "Highly Inconsistent",
        description: "Subjective interviewing leads to biased hiring and poor diversity outcomes.",
        iconClassName: "bg-orange-50 text-orange-500",
    },
    {
        icon: FileText,
        title: "Resume Deception",
        description: "Keywords on paper do not always translate to actual skills during the job.",
        iconClassName: "bg-blue-50 text-blue-500",
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
        description: "Upload your JD or paste the link. AI builds the map.",
    },
    {
        title: "AI Plan",
        description: "Sreeva designs the adaptive questioning path.",
    },
    {
        title: "Interview",
        description: "Candidate interacts with conversational AI.",
    },
    {
        title: "Decision Report",
        description: "You get a score, recording, and hire/pass recommendation.",
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
        price: "$0",
        suffix: "/mo",
        features: ["5 interviews/mo", "Basic AI reports", "1 admin seat"],
        cta: "Get Started",
        featured: false,
    },
    {
        name: "Growth",
        price: "$499",
        suffix: "/mo",
        features: ["50 interviews/mo", "Advanced skills proof", "5 admin seats", "ATS integrations"],
        cta: "Try Growth",
        featured: true,
    },
    {
        name: "Scale",
        price: "$1,299",
        suffix: "/mo",
        features: ["200 interviews/mo", "White-labeled portal", "Unlimited seats", "Priority support"],
        cta: "Contact Sales",
        featured: false,
    },
    {
        name: "Business",
        price: "Custom",
        suffix: "",
        features: ["Unlimited interviews", "Custom AI calibration", "SSO & enterprise security"],
        cta: "Talk to Us",
        featured: false,
    },
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
    const ctaHref = session ? dashboardHref : "/login";
    const ctaLabel = session ? "Dashboard" : "Get Started";

    return (
        <div className="min-h-screen overflow-x-hidden bg-surface text-on-surface selection:bg-primary-fixed selection:text-on-primary-container">
            <header className="fixed top-0 z-50 h-20 w-full border-b border-orange-100/40 bg-white/85 shadow-sm backdrop-blur-md">
                <div className="mx-auto flex h-full max-w-[1320px] items-center justify-between px-6">
                    <Link href="/" className="font-display text-2xl font-black tracking-tighter text-orange-600">
                        Sreeva AI
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
                                className="hidden rounded-lg px-4 py-2 font-medium text-slate-600 transition-all hover:bg-orange-50 sm:block"
                            >
                                Login
                            </Link>
                        )}
                        <Link
                            href={ctaHref}
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
                                    Adaptive AI interviews that screen candidates{" "}
                                    <span className="text-primary">before</span> your team spends time
                                </h1>
                                <p className="max-w-lg text-body-lg text-on-surface-variant">
                                    Recruiters chase resumes. Engineers repeat basic checks. Candidates still reach
                                    interviews without proof. Sreeva validates real skill depth before human rounds begin.
                                </p>
                            </div>
                            <div className="flex flex-col gap-4 sm:flex-row">
                                <Link href={ctaHref} className="primary-btn inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-bold">
                                    {session ? "Open Dashboard" : "Start Free Trial"}
                                    <ArrowRight className="h-5 w-5" />
                                </Link>
                                <a href="#report" className="secondary-btn inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-bold text-on-surface">
                                    <CirclePlay className="h-5 w-5" />
                                    View Sample Report
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
                        {problemCards.map((card) => (
                            <div key={card.title} className="bento-card space-y-4 p-8 text-center">
                                <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${card.iconClassName}`}>
                                    <card.icon className="h-8 w-8" />
                                </div>
                                <h3 className="text-xl font-bold">{card.title}</h3>
                                <p className="text-on-surface-variant">{card.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section id="product" className="mx-auto max-w-[1320px] px-6 py-24">
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

                        {featureCards.map((feature) => (
                            <div key={feature.title} className="bento-card col-span-12 flex flex-col gap-2 p-6 md:col-span-4">
                                <feature.icon className="h-6 w-6 text-primary" />
                                <h4 className="font-bold">{feature.title}</h4>
                                <p className="text-caption text-on-surface-variant">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="bg-surface py-24">
                    <div className="mx-auto max-w-[1320px] px-6">
                        <h2 className="mb-16 text-center font-display text-h2">The Sreeva Workflow</h2>
                        <div className="relative flex flex-col items-center gap-8 md:flex-row md:gap-4">
                            {workflowSteps.map((step, index) => (
                                <div key={step.title} className="relative z-10 flex-1 space-y-4 text-center">
                                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary bg-white text-xl font-bold shadow-lg">
                                        {index + 1}
                                    </div>
                                    <h3 className="font-bold">{step.title}</h3>
                                    <p className="text-caption text-outline">{step.description}</p>
                                    {index < workflowSteps.length - 1 && (
                                        <div className="absolute left-[calc(50%+32px)] top-8 hidden h-0.5 w-[calc(100%-64px)] bg-primary/20 md:block" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-[1320px] px-6 py-24">
                    <div className="grid gap-8 md:grid-cols-2">
                        <div className="bento-card border-slate-200 bg-slate-50 p-10">
                            <h3 className="mb-6 flex items-center gap-2 font-display text-h3 font-bold">
                                <AlertTriangle className="h-6 w-6 text-slate-400" />
                                Manual Screening
                            </h3>
                            <div className="space-y-4 opacity-60">
                                <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="h-10 w-10 rounded-full bg-slate-100" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-1/3 rounded bg-slate-200" />
                                        <div className="h-12 w-full rounded bg-slate-100" />
                                    </div>
                                </div>
                                <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-caption italic">
                                    &quot;I think they were good? My notes are messy...&quot;
                                </div>
                                <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 text-caption font-bold text-red-700">
                                    <span>TIME TO DECISION</span>
                                    <span>4-7 DAYS</span>
                                </div>
                            </div>
                        </div>

                        <div className="bento-card border-primary/30 p-10 ring-4 ring-primary/5">
                            <h3 className="mb-6 flex items-center gap-2 font-display text-h3 font-bold text-primary">
                                <Zap className="h-6 w-6" />
                                Sreeva AI
                            </h3>
                            <div className="space-y-4">
                                <div className="flex gap-3 rounded-lg border border-primary-fixed bg-white p-3 shadow-sm">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-fixed text-primary">
                                        <Check className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-1/2 rounded bg-primary/20" />
                                        <div className="h-12 w-full rounded bg-primary/5" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 rounded-xl bg-primary-fixed/30 p-4">
                                    <div className="text-h2 font-black text-primary">92%</div>
                                    <div className="text-caption font-bold leading-tight">PREDICTIVE<br />ACCURACY</div>
                                </div>
                                <div className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-2 text-caption font-bold text-green-700">
                                    <span>TIME TO DECISION</span>
                                    <span>15 MINUTES</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="report" className="overflow-hidden bg-surface-container-low py-24">
                    <div className="mx-auto max-w-[1320px] px-6">
                        <SectionHeading
                            title="The Most Detailed Report Ever"
                            description="Every interview generates a comprehensive dossier."
                        />
                        <div className="bento-card mx-auto max-w-5xl overflow-hidden bg-white p-0 shadow-2xl">
                            <div className="flex items-center justify-between border-b bg-surface p-6">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-container text-xl font-bold text-white">
                                        S
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold">Interview Report #8291</h4>
                                        <p className="text-caption">Role: Senior Frontend Engineer</p>
                                    </div>
                                </div>
                                <button className="secondary-btn hidden items-center gap-2 px-4 py-2 text-label-sm font-bold sm:flex">
                                    <Download className="h-4 w-4" />
                                    Export PDF
                                </button>
                            </div>

                            <div className="grid grid-cols-12 gap-8 p-8">
                                <div className="col-span-12 space-y-8 md:col-span-4">
                                    <div className="rounded-2xl border bg-surface p-6 text-center">
                                        <div className="mb-1 text-display font-black text-primary">94</div>
                                        <div className="mb-4 text-caption font-bold text-outline">OVERALL SCORE</div>
                                        <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-caption font-bold text-green-700">
                                            <CheckCircle2 className="h-4 w-4" />
                                            STRONG HIRE
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h5 className="text-sm font-bold uppercase tracking-wider text-outline">
                                            Proctoring Signals
                                        </h5>
                                        {["Identity Verified", "Tab Switching", "Background Audio"].map((signal, index) => (
                                            <div key={signal} className="flex items-center justify-between text-caption">
                                                <span className="flex items-center gap-2">
                                                    <Check className="h-4 w-4 text-green-500" />
                                                    {signal}
                                                </span>
                                                <span className="font-bold text-green-600">
                                                    {index === 0 ? "Safe" : index === 1 ? "None" : "Clean"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="col-span-12 space-y-8 md:col-span-8">
                                    <div>
                                        <h5 className="mb-4 text-sm font-bold uppercase tracking-wider text-outline">
                                            Skills Proficiency
                                        </h5>
                                        <div className="grid gap-6 sm:grid-cols-2">
                                            {reportSkills.map(([skill, label, width]) => (
                                                <div key={skill} className="space-y-2">
                                                    <div className="flex justify-between text-caption font-bold">
                                                        <span>{skill}</span>
                                                        <span>{label}</span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-surface-variant">
                                                        <div className="h-full rounded-full bg-primary" style={{ width }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border bg-surface p-6">
                                        <h5 className="mb-4 text-sm font-bold uppercase tracking-wider text-outline">
                                            Recording Timeline
                                        </h5>
                                        <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed bg-surface-container">
                                            <Play className="h-10 w-10 text-outline opacity-30" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="pricing" className="mx-auto max-w-[1320px] px-6 py-24">
                    <SectionHeading
                        title="Plans for every hiring stage"
                        description="Start with one role, then scale adaptive interviews across teams once signal quality is proven."
                    />
                    <div className="grid gap-6 md:grid-cols-4">
                        {pricingPlans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`bento-card flex flex-col p-8 ${plan.featured ? "z-10 scale-[1.02] border-primary shadow-xl ring-4 ring-primary/10 md:scale-105" : ""}`}
                            >
                                {plan.featured && (
                                    <div className="mb-2 text-caption font-bold uppercase text-primary">MOST POPULAR</div>
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
                            </div>
                        ))}
                    </div>
                </section>

                <section id="resources" className="bg-surface-container-low py-24">
                    <div className="mx-auto max-w-[1320px] px-6">
                        <h2 className="mb-16 text-center font-display text-h2">Frequently Asked Questions</h2>
                        <div className="grid gap-8 md:grid-cols-2">
                            {faqs.map((faq) => (
                                <div key={faq.question} className="bento-card p-6">
                                    <h4 className="mb-2 flex items-center justify-between font-bold">
                                        {faq.question}
                                        <ChevronDown className="h-5 w-5 text-outline" />
                                    </h4>
                                    <p className="text-caption text-on-surface-variant">{faq.answer}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="contact" className="mx-auto max-w-[1320px] px-6 py-24">
                    <div className="flex flex-col gap-16 lg:flex-row">
                        <div className="space-y-6 lg:w-1/2">
                            <h2 className="font-display text-h2">Ready to stop wasting interview time?</h2>
                            <p className="text-body-lg text-outline">
                                Share one open role. We will show how Sreeva screens candidates before your team joins the process.
                            </p>
                            <div className="bento-card !bg-primary-container p-8 text-on-primary">
                                <div className="mb-6 flex items-center gap-4">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                                        <Phone className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="font-bold">Book a Strategy Call</div>
                                        <div className="text-caption opacity-80">Free 15-min consultation</div>
                                    </div>
                                </div>
                                <p className="text-sm italic leading-relaxed">
                                    &quot;Sreeva reduced our technical screening time by 75% in the first month alone.&quot;
                                </p>
                                <div className="mt-5 grid gap-3 text-caption sm:grid-cols-3">
                                    <div className="rounded-xl bg-white/15 p-3">
                                        <div className="text-lg font-black">75%</div>
                                        <div className="opacity-80">less screening time</div>
                                    </div>
                                    <div className="rounded-xl bg-white/15 p-3">
                                        <div className="text-lg font-black">18m</div>
                                        <div className="opacity-80">avg AI interview</div>
                                    </div>
                                    <div className="rounded-xl bg-white/15 p-3">
                                        <div className="text-lg font-black">24h</div>
                                        <div className="opacity-80">shortlist ready</div>
                                    </div>
                                </div>
                                <div className="mt-5 flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25 text-sm font-black">
                                        TS
                                    </div>
                                    <span className="text-caption font-bold">- CTO, TechFlow Systems</span>
                                </div>
                            </div>
                        </div>

                        <div className="lg:w-1/2">
                            <form className="bento-card space-y-6 border-primary-fixed p-8 shadow-xl">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-caption font-bold uppercase tracking-wider text-outline">
                                            Full Name
                                        </span>
                                        <input
                                            className="w-full rounded-xl border border-surface-variant bg-surface p-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            placeholder="Jane Doe"
                                            type="text"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-caption font-bold uppercase tracking-wider text-outline">
                                            Company Email
                                        </span>
                                        <input
                                            className="w-full rounded-xl border border-surface-variant bg-surface p-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            placeholder="jane@company.com"
                                            type="email"
                                        />
                                    </label>
                                </div>
                                <label className="block space-y-2">
                                    <span className="text-caption font-bold uppercase tracking-wider text-outline">
                                        Monthly Hiring Volume
                                    </span>
                                    <select className="w-full rounded-xl border border-surface-variant bg-surface p-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20">
                                        <option>1-5 candidates</option>
                                        <option>5-20 candidates</option>
                                        <option>20-50 candidates</option>
                                        <option>50+ candidates</option>
                                    </select>
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-caption font-bold uppercase tracking-wider text-outline">
                                        How can we help?
                                    </span>
                                    <textarea
                                        className="h-32 w-full rounded-xl border border-surface-variant bg-surface p-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        placeholder="Tell us about your current screening process..."
                                    />
                                </label>
                                <button className="primary-btn w-full py-4 text-lg font-bold" type="submit">
                                    Send Message
                                </button>
                            </form>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="w-full border-t border-slate-100 bg-white py-12">
                <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-8 px-6 md:grid-cols-4 lg:grid-cols-6">
                    <div className="col-span-2">
                        <div className="mb-4 text-xl font-bold text-slate-900">Sreeva AI</div>
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
